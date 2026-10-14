#!/usr/bin/env node
// Canal ÚNICO de escrita de dados para testes: loga como o usuário de teste (JWT assinado, RLS ativa) e
// executa operações PostgREST. Toda requisição passa pelo fetch guardado (packages/shared/src/guardrail),
// que só deixa passar o que prova pertencer à fazenda de testes. Falha fechada.
//
// Uso (na raiz do repositório):
//   node scripts/teste-api.mjs whoami
//   node scripts/teste-api.mjs select <tabela> [--query "select=id,nome&limit=5"]
//   node scripts/teste-api.mjs insert <tabela> --json '{"campo":"valor"}'      (fazenda_id é injetado)
//   node scripts/teste-api.mjs update <tabela> --filtro "id=eq.<uuid>" --json '{"campo":"novo"}'
//   node scripts/teste-api.mjs delete <tabela> --filtro "id=eq.<uuid>"           (fazenda_id é injetado)
//   node scripts/teste-api.mjs rpc <funcao> [--json '{"p_x":1}'] [--verificada-os-id <uuid>]
//
// Configuração (arquivos ignorados pelo git; este script os lê, o Claude não):
//   .env.teste               GESTAUP_TESTE_EMAIL, GESTAUP_TESTE_SENHA, GESTAUP_FAZENDA_TESTES_ID
//   apps/manejus/.env        VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Códigos de saída: 0 ok | 1 erro | 2 uso | 3 bloqueado pelo guardrail

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FAZENDA_TESTES_ID,
  GuardrailError,
  assertAmbienteDeTeste,
  assertFazendaDeTestes,
  criarFetchGuardado,
} from '../packages/shared/src/guardrail/core.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnv(arquivo) {
  if (!existsSync(arquivo)) return null
  const env = {}
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function uso(msg) {
  if (msg) console.error(`Erro: ${msg}\n`)
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(2)
}

function opcao(args, nome) {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 ? args[i + 1] : undefined
}
function opcoes(args, nome) {
  const r = []
  args.forEach((a, i) => a === `--${nome}` && r.push(args[i + 1]))
  return r
}

async function main() {
  const [comando, alvo, ...resto] = process.argv.slice(2)
  if (!comando) uso()

  const cfg = lerEnv(resolve(RAIZ, '.env.teste'))
  if (!cfg) uso('arquivo .env.teste não encontrado na raiz (GESTAUP_TESTE_EMAIL, GESTAUP_TESTE_SENHA, GESTAUP_FAZENDA_TESTES_ID).')
  const app = lerEnv(resolve(RAIZ, 'apps/manejus/.env'))
  if (!app) uso('apps/manejus/.env não encontrado (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')

  const url = app.VITE_SUPABASE_URL
  const anon = app.VITE_SUPABASE_ANON_KEY
  assertAmbienteDeTeste({ nodeEnv: process.env.NODE_ENV, supabaseUrl: url, fazendaConfigurada: cfg.GESTAUP_FAZENDA_TESTES_ID })
  if (!cfg.GESTAUP_TESTE_EMAIL || !cfg.GESTAUP_TESTE_SENHA || !anon) uso('credenciais incompletas nos arquivos de configuração.')

  const rpcsVerificadas = new Set()
  const guardado = criarFetchGuardado(fetch, { rpcsVerificadas })

  const chamar = async (metodo, caminho, { token, corpo, retornar } = {}) => {
    const headers = { apikey: anon, 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (retornar) headers.Prefer = 'return=representation'
    const resp = await guardado(`${url}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    const texto = await resp.text()
    let dados
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = texto
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${typeof dados === 'string' ? dados : JSON.stringify(dados)}`)
    return dados
  }

  // 1) login como o usuário de teste
  const sessao = await chamar('POST', '/auth/v1/token?grant_type=password', {
    corpo: { email: cfg.GESTAUP_TESTE_EMAIL, password: cfg.GESTAUP_TESTE_SENHA },
  })
  const token = sessao.access_token

  // 2) o usuário precisa estar CONFINADO à fazenda de testes (vínculo único) e não ser admin
  const vinculos = await chamar('GET', '/rest/v1/usuario_fazenda?select=fazenda_id&ativo=eq.true', { token })
  const ids = [...new Set(vinculos.map((v) => v.fazenda_id))]
  if (ids.length !== 1 || ids[0].toLowerCase() !== FAZENDA_TESTES_ID) {
    throw new GuardrailError('O usuário de teste não está confinado à fazenda de testes (vínculos ativos diferentes). Abortado.', { vinculos: ids.length })
  }
  const eu = await chamar('GET', '/rest/v1/usuarios?select=papel,email&limit=1', { token })
  if (['admin', 'super_admin'].includes(eu?.[0]?.papel)) {
    throw new GuardrailError('O usuário de teste é admin. Abortado.', { papel: eu[0].papel })
  }

  const F = `fazenda_id=eq.${FAZENDA_TESTES_ID}`
  const json = opcao(resto, 'json')
  const corpo = json === undefined ? undefined : JSON.parse(json)
  let saida

  switch (comando) {
    case 'whoami':
      saida = { email: eu?.[0]?.email, papel: eu?.[0]?.papel, fazendas: ids }
      break
    case 'select':
      if (!alvo) uso('informe a tabela.')
      saida = await chamar('GET', `/rest/v1/${alvo}${opcao(resto, 'query') ? `?${opcao(resto, 'query')}` : ''}`, { token })
      break
    case 'insert': {
      if (!alvo || corpo === undefined) uso('informe a tabela e --json.')
      const linhas = (Array.isArray(corpo) ? corpo : [corpo]).map((l) => ({ fazenda_id: FAZENDA_TESTES_ID, ...l }))
      saida = await chamar('POST', `/rest/v1/${alvo}`, { token, corpo: linhas, retornar: true })
      break
    }
    case 'update':
    case 'delete': {
      const filtros = opcoes(resto, 'filtro')
      if (!alvo || filtros.length === 0) uso('informe a tabela e ao menos um --filtro (ex.: "id=eq.<uuid>").')
      if (comando === 'update' && corpo === undefined) uso('informe --json com os campos.')
      const q = [...filtros, F].join('&')
      saida = await chamar(comando === 'update' ? 'PATCH' : 'DELETE', `/rest/v1/${alvo}?${q}`, {
        token,
        corpo: comando === 'update' ? corpo : undefined,
        retornar: true,
      })
      break
    }
    case 'rpc': {
      if (!alvo) uso('informe a função.')
      // RPC mutável sem p_fazenda_id só passa se o objeto for PROVADAMENTE da fazenda de testes
      const osId = opcao(resto, 'verificada-os-id')
      if (osId) {
        const os = await chamar('GET', `/rest/v1/ordens_servico?select=fazenda_id&id=eq.${encodeURIComponent(osId)}`, { token })
        assertFazendaDeTestes(os?.[0]?.fazenda_id)
        rpcsVerificadas.add(alvo)
      }
      saida = await chamar('POST', `/rest/v1/rpc/${alvo}`, { token, corpo: corpo ?? {} })
      break
    }
    default:
      uso(`comando desconhecido: ${comando}`)
  }

  console.log(JSON.stringify(saida, null, 2))
}

main().catch((e) => {
  if (e instanceof GuardrailError) {
    console.error(`${e.message}`)
    process.exit(3)
  }
  console.error(`Erro: ${e.message}`)
  process.exit(1)
})
