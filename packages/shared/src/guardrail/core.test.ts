import { describe, expect, it, vi } from 'vitest'
import {
  FAZENDA_TESTES_ID,
  GuardrailError,
  SUPABASE_PROJECT_REF,
  assertAmbienteDeTeste,
  assertFazendaDeTestes,
  assertRequisicaoPermitida,
  criarFetchGuardado,
} from './core.mjs'

const BASE = `https://${SUPABASE_PROJECT_REF}.supabase.co`
const OUTRA = '11111111-2222-4333-8444-555555555555'
const req = (method: string, caminho: string, body?: unknown) => ({
  method,
  url: `${BASE}${caminho}`,
  body: body === undefined ? undefined : JSON.stringify(body),
})
const abortar = (r: ReturnType<typeof req>, opcoes = {}) => expect(() => assertRequisicaoPermitida(r, opcoes)).toThrow(GuardrailError)
const permitir = (r: ReturnType<typeof req>, opcoes = {}) => expect(() => assertRequisicaoPermitida(r, opcoes)).not.toThrow()

describe('assertFazendaDeTestes', () => {
  it('aceita exatamente a fazenda de testes (inclusive em maiúsculas)', () => {
    expect(assertFazendaDeTestes(FAZENDA_TESTES_ID)).toBe(FAZENDA_TESTES_ID)
    expect(() => assertFazendaDeTestes(FAZENDA_TESTES_ID.toUpperCase())).not.toThrow()
  })

  it('ABORTA com GuardrailError para qualquer outro id', () => {
    expect(() => assertFazendaDeTestes(OUTRA)).toThrow(GuardrailError)
    expect(() => assertFazendaDeTestes(OUTRA)).toThrow(/não é a fazenda de testes/)
  })

  it('aborta para vazio, nulo, indefinido e tipos errados', () => {
    for (const v of ['', null, undefined, 123, {}, [FAZENDA_TESTES_ID]]) {
      expect(() => assertFazendaDeTestes(v)).toThrow(GuardrailError)
    }
  })

  it('aborta para tentativas de injeção em filtro PostgREST', () => {
    expect(() => assertFazendaDeTestes(`${FAZENDA_TESTES_ID},id.neq.x`)).toThrow(GuardrailError)
    expect(() => assertFazendaDeTestes(`${FAZENDA_TESTES_ID} `)).toThrow(GuardrailError)
    expect(() => assertFazendaDeTestes(`x) or (papel.eq.super_admin`)).toThrow(GuardrailError)
  })
})

describe('assertAmbienteDeTeste', () => {
  const ok = { nodeEnv: 'test', supabaseUrl: BASE, fazendaConfigurada: FAZENDA_TESTES_ID }

  it('aceita o ambiente correto', () => {
    expect(() => assertAmbienteDeTeste(ok)).not.toThrow()
  })

  it('aborta em produção, projeto errado, URL inválida ou fazenda configurada errada', () => {
    expect(() => assertAmbienteDeTeste({ ...ok, nodeEnv: 'production' })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste({ ...ok, supabaseUrl: 'https://outro.supabase.co' })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste({ ...ok, supabaseUrl: 'lixo' })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste({ ...ok, supabaseUrl: undefined })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste({ ...ok, fazendaConfigurada: OUTRA })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste({ ...ok, fazendaConfigurada: undefined })).toThrow(GuardrailError)
    expect(() => assertAmbienteDeTeste()).toThrow(GuardrailError)
  })
})

describe('assertRequisicaoPermitida: leitura', () => {
  it('leituras de tabela passam, de qualquer fazenda', () => {
    permitir(req('GET', '/rest/v1/individuos?select=id'))
    permitir(req('GET', `/rest/v1/individuos?fazenda_id=eq.${OUTRA}`))
    permitir(req('HEAD', '/rest/v1/lotes'))
  })

  it('host fora do projeto é abortado', () => {
    abortar({ method: 'GET', url: 'https://evil.example.com/rest/v1/individuos' })
  })
})

describe('assertRequisicaoPermitida: INSERT/UPSERT', () => {
  it('passa com fazenda_id de testes, inclusive em lote', () => {
    permitir(req('POST', '/rest/v1/individuos', { fazenda_id: FAZENDA_TESTES_ID, id_brinco: 'X' }))
    permitir(req('POST', '/rest/v1/individuos', [{ fazenda_id: FAZENDA_TESTES_ID }, { fazenda_id: FAZENDA_TESTES_ID }]))
  })

  it('ABORTA com fazenda_id de outra fazenda', () => {
    abortar(req('POST', '/rest/v1/individuos', { fazenda_id: OUTRA }))
  })

  it('aborta se UMA linha do lote for de outra fazenda', () => {
    abortar(req('POST', '/rest/v1/individuos', [{ fazenda_id: FAZENDA_TESTES_ID }, { fazenda_id: OUTRA }]))
  })

  it('aborta sem fazenda_id, com lista vazia, corpo ausente ou inválido', () => {
    abortar(req('POST', '/rest/v1/individuos', { id_brinco: 'X' }))
    abortar(req('POST', '/rest/v1/individuos', []))
    abortar(req('POST', '/rest/v1/individuos'))
    abortar({ method: 'POST', url: `${BASE}/rest/v1/individuos`, body: '{lixo' })
    abortar(req('POST', '/rest/v1/individuos', 'texto'))
  })
})

describe('assertRequisicaoPermitida: UPDATE/DELETE', () => {
  const F = `fazenda_id=eq.${FAZENDA_TESTES_ID}`

  it('passa com o filtro fazenda_id da fazenda de testes', () => {
    permitir(req('PATCH', `/rest/v1/individuos?id=eq.1&${F}`, { status: 'Vivo' }))
    permitir(req('DELETE', `/rest/v1/individuos?id=eq.1&${F}`))
  })

  it('ABORTA sem filtro de fazenda (ex.: apagar tudo)', () => {
    abortar(req('DELETE', '/rest/v1/individuos'))
    abortar(req('DELETE', '/rest/v1/individuos?id=eq.1'))
    abortar(req('PATCH', '/rest/v1/individuos?id=eq.1', { status: 'Vivo' }))
  })

  it('ABORTA com filtro de outra fazenda, in(...) ou fazenda dentro de or(...)', () => {
    abortar(req('DELETE', `/rest/v1/individuos?fazenda_id=eq.${OUTRA}`))
    abortar(req('DELETE', `/rest/v1/individuos?fazenda_id=in.(${FAZENDA_TESTES_ID},${OUTRA})`))
    abortar(req('DELETE', `/rest/v1/individuos?or=(fazenda_id.eq.${FAZENDA_TESTES_ID})`))
  })

  it('aborta PATCH que tenta mover o registro para outra fazenda', () => {
    abortar(req('PATCH', `/rest/v1/individuos?id=eq.1&${F}`, { fazenda_id: OUTRA }))
    permitir(req('PATCH', `/rest/v1/individuos?id=eq.1&${F}`, { fazenda_id: FAZENDA_TESTES_ID }))
  })
})

describe('assertRequisicaoPermitida: tabelas proibidas e endpoints', () => {
  const F = `fazenda_id=eq.${FAZENDA_TESTES_ID}`

  it('tabelas sensíveis nunca são alteradas, mesmo com filtro correto', () => {
    for (const t of ['fazendas', 'usuarios', 'usuario_fazenda', 'grupos_fazenda', 'peoes']) {
      abortar(req('PATCH', `/rest/v1/${t}?${F}`, { x: 1 }))
      abortar(req('DELETE', `/rest/v1/${t}?${F}`))
      abortar(req('POST', `/rest/v1/${t}`, { fazenda_id: FAZENDA_TESTES_ID }))
    }
  })

  it('Edge Functions e escrita em storage abortam por padrão', () => {
    abortar(req('POST', '/functions/v1/impersonate-user', {}))
    permitir(req('POST', '/functions/v1/liberada', {}), { functionsPermitidas: ['liberada'] })
    permitir(req('GET', '/storage/v1/object/public/x'))
    abortar(req('POST', '/storage/v1/object/fotos/x', {}))
  })

  it('endpoint desconhecido aborta', () => {
    abortar(req('GET', '/algo/novo'))
  })

  it('auth: só login, refresh, logout e user', () => {
    permitir(req('POST', '/auth/v1/token?grant_type=password', {}))
    permitir(req('POST', '/auth/v1/token?grant_type=refresh_token', {}))
    permitir(req('POST', '/auth/v1/logout'))
    permitir(req('GET', '/auth/v1/user'))
    abortar(req('POST', '/auth/v1/signup', {}))
    abortar(req('PUT', '/auth/v1/user', {}))
    abortar(req('POST', '/auth/v1/admin/users', {}))
    abortar(req('POST', '/auth/v1/token?grant_type=id_token', {}))
  })
})

describe('assertRequisicaoPermitida: RPC', () => {
  it('RPC de leitura passa', () => {
    permitir(req('POST', '/rest/v1/rpc/get_dashboard_stats', {}))
    permitir(req('POST', '/rest/v1/rpc/calculate_quant_atual', { p_lote_id: 'x' }))
  })

  it('RPC mutável sem p_fazenda_id aborta (não dá para provar a fazenda)', () => {
    abortar(req('POST', '/rest/v1/rpc/recategorizar_lote_categoria', { p_lote_categoria_origem_id: 'x' }))
    abortar(req('POST', '/rest/v1/rpc/estornar_baixa_os', { p_os_id: 'x' }))
  })

  it('RPC com p_fazenda_id só passa se for a de testes', () => {
    permitir(req('POST', '/rest/v1/rpc/alguma_acao', { p_fazenda_id: FAZENDA_TESTES_ID }))
    abortar(req('POST', '/rest/v1/rpc/alguma_acao', { p_fazenda_id: OUTRA }))
  })

  it('RPC já verificada pelo chamador passa só se estiver na lista', () => {
    const opcoes = { rpcsVerificadas: new Set(['estornar_baixa_os']) }
    permitir(req('POST', '/rest/v1/rpc/estornar_baixa_os', { p_os_id: 'x' }), opcoes)
    abortar(req('POST', '/rest/v1/rpc/outra_acao', { p_os_id: 'x' }), opcoes)
  })
})

describe('criarFetchGuardado', () => {
  it('NUNCA chama o fetch real quando a requisição viola a regra', async () => {
    const fetchReal = vi.fn(async () => new Response('{}'))
    const guardado = criarFetchGuardado(fetchReal)
    await expect(
      guardado(`${BASE}/rest/v1/individuos`, { method: 'POST', body: JSON.stringify({ fazenda_id: OUTRA }) }),
    ).rejects.toThrow(GuardrailError)
    await expect(guardado(`${BASE}/rest/v1/individuos?id=eq.1`, { method: 'DELETE' })).rejects.toThrow(GuardrailError)
    expect(fetchReal).not.toHaveBeenCalled()
  })

  it('chama o fetch real quando a requisição é permitida', async () => {
    const fetchReal = vi.fn(async () => new Response('{}'))
    const guardado = criarFetchGuardado(fetchReal)
    await guardado(`${BASE}/rest/v1/individuos`, {
      method: 'POST',
      body: JSON.stringify({ fazenda_id: FAZENDA_TESTES_ID }),
    })
    await guardado(`${BASE}/rest/v1/individuos?select=id`)
    expect(fetchReal).toHaveBeenCalledTimes(2)
  })

  it('corpo não textual em mutação aborta', async () => {
    const fetchReal = vi.fn(async () => new Response('{}'))
    const guardado = criarFetchGuardado(fetchReal)
    await expect(guardado(`${BASE}/rest/v1/individuos`, { method: 'POST', body: new Blob(['x']) })).rejects.toThrow(GuardrailError)
    expect(fetchReal).not.toHaveBeenCalled()
  })
})
