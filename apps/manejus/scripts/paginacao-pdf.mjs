// Verificação de paginação do Infográfico Mensal com volumes sintéticos.
//
// Gera o PDF composto (composeReports) para vários perfis de dados (zero, um,
// poucos, médios, muitos; seções vazias; modo dia único) e checa, no Chromium:
//  - nenhuma página com conteúdo estourando além da área útil;
//  - nenhuma tabela sem linhas (página só com cabeçalho);
//  - numeração "Página X de Y" contígua e igual ao total real.
//
// Uso (na pasta apps/manejus):
//   node scripts/paginacao-pdf.mjs <pastaSaida> [cenarios,separados,por,virgula|tudo] [shots]
// "shots" salva um PNG por página para conferência visual.
// Sai com código 1 se algum cenário tiver problema.
// Harness de cenários: gera o Infográfico (composeReports) com volumes
// sintéticos variados e verifica automaticamente, no Chromium, estouro de
// página, página órfã, numeração contígua. Uso:
//   node harness.mjs <outDir> <cenario> [shots]
import { writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = new URL('../', import.meta.url).href
const require = createRequire(new URL('package.json', root))
const puppeteer = require('puppeteer-core')
const mod = (p) => import(new URL('api/pdf/' + p, root).href)
const { composeReports } = await mod('_shared/reportComposer.js')
const { findLocalChrome } = await mod('_shared/puppeteer.js')

const [out, cenarioArg = 'tudo', shots = ''] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

const base = { dataInicio: '2026-09-01', dataFim: '2026-09-30', fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '' }
const cover = { fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '', logoEmpresa: '', imagemCapa: '', periodoLabel: 'Setembro de 2026' }

function rodeio(nLotes, nRegistros, { alertas = 0, escore = true, serie = true } = {}) {
  const lotes = Array.from({ length: nLotes }, (_, i) => ({
    nome: `AR-26-${String(i + 1).padStart(3, '0')}`, rodeios: 1 + (i % 3), cabecas_ultima: 100 + i, data_ultima: '2026-09-10',
    cabecas_media: 100 + i, escore_medio: 2 + (i % 3) * 0.5, meta_dias: 3, fora_meta: i % 2, dentro_meta: (i + 1) % 2, alertas: i % 4 === 0 ? 1 : 0,
  }))
  const registros = Array.from({ length: nRegistros }, (_, i) => ({
    data: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, nome_usuario: 'Cajango', pasto: `Pasto ${i % 9}`, lote: `AR-26-${String((i % Math.max(nLotes, 1)) + 1).padStart(3, '0')}`,
    total_cabecas: 100 + i, escore_gado: 3, escore_fezes: 3, equipe_nomes: ['Carlos Henrique Silva', 'Marcos Paulo Souza'],
    diagnosticos: i < alertas ? { carrapatosMoscas: { valor: 'S', observacao: 'Infestação moderada observada em vários animais do lote' }, bebedourosCochos: { valor: 'N', observacao: '' } } : {},
    meta_intervalo_dias: 3, dias_desde_anterior: 7,
  }))
  const serieDiaria = serie ? Array.from({ length: Math.min(nRegistros, 20) }, (_, i) => ({ data: `2026-09-${String(1 + i).padStart(2, '0')}`, vaca: 50 + i, boi: 10 })) : []
  const escoreRegs = escore ? registros : registros.map((r) => ({ ...r, escore_gado: null, escore_fezes: null }))
  return {
    tipo: 'rodeio',
    dados: {
      ...base,
      resumo: {
        total_rodeios: nRegistros, escore_gado_medio: escore ? 3 : null, escore_fezes_medio: escore ? 3 : null,
        alertas_sanitarios: alertas, pendencias_infra: alertas, rodeios_com_alerta: alertas, rodeios_com_meta: nLotes, dentro_meta: 0, fora_meta: nRegistros,
        insights: nRegistros ? 'Foram realizados rodeios no período, com acompanhamento de vários lotes e pastos conforme a meta.' : '',
        serie_diaria: serieDiaria, por_lote: lotes,
      },
      registros: escoreRegs,
    },
  }
}

function pastagens(nPastos, nOcup, nMov, { alertas = 0, descanso = true, condicao = true } = {}) {
  const porPasto = Array.from({ length: nPastos }, (_, i) => ({ nome: `Pasto ${i + 1}`, area_util_ha: 20 + i, entradas: i % 2, saidas: (i + 1) % 2, avaliacao_media: 2 + (i % 3), ocupacao_dias_media: 10 + i, ua_ha_media: 1 + (i % 5) * 0.7, alertas: 0 }))
  const ocupacoes = Array.from({ length: nOcup }, (_, i) => ({ lote: `L-${i + 1}`, pasto: `Pasto ${(i % Math.max(nPastos, 1)) + 1}`, data_entrada: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}`, data_saida: i % 4 ? `2026-09-${String(21 + (i % 8)).padStart(2, '0')}` : null, em_andamento: i % 4 === 0, dias: 10 + i, cabecas_entrada: 80 + i, taxa_lotacao_ua_ha: 2.5 }))
  const registros = Array.from({ length: nMov }, (_, i) => ({ data: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, horario_manejo: '07:00', responsavel: 'Cajango', lote: `L-${i + 1}`, pasto_saida: `Pasto ${i % 5 + 1}`, pasto_entrada: `Pasto ${i % 5 + 2}`, avaliacao_saida: 3, avaliacao_entrada: 2, garrote: 88, total_animais: 88, equipe_nomes: ['Carlos Henrique Silva'], avaliacao_geral: i < alertas ? { carrapatosMoscas: { valor: 'S', observacao: 'Infestação moderada em vários animais' } } : {} }))
  return {
    tipo: 'pastagens',
    dados: {
      ...base, registros, ocupacoes,
      resumo: {
        total_movimentacoes: nMov, lotes_movimentados: nMov, pastos_utilizados: nPastos, animais_manejados: nMov * 88, escore_gado_medio: 2, ocupacao_media_dias: 12.9, taxa_lotacao_media_ua_ha: 2.8,
        ocupacoes_em_andamento: 1, alertas_sanitarios: alertas, pendencias_infra: 0, ocupacoes_acima_meta: 0, pastos_sem_uso: 3, area_utilizada_pct: 38,
        insights: nMov ? 'Foram realizadas movimentações de pasto no período, manejando animais entre pastos.' : '',
        por_pasto: porPasto,
        degradacao: condicao ? porPasto.slice(0, Math.min(nPastos, 30)).map((p, i) => ({ nome: p.nome, avaliacao_entrada_media: 2, avaliacao_saida_media: 2 + (i % 3) * 0.5, delta: 0.5, avaliacoes: 1 })) : [],
        descanso: descanso ? porPasto.slice(0, 12).map((p) => ({ pasto: p.nome, nome: p.nome, descanso_medio: 5 + p.area_util_ha % 7 })) : [],
      },
    },
  }
}

function bebedouros(n, nOcorr, { dia = false, semMeta = 0 } = {}) {
  const labels = ['Em dia', 'Atrasado', 'Atraso crítico', 'Sem registro']
  const status = Array.from({ length: n }, (_, i) => {
    const lab = labels[i % 4]
    const dias = lab === 'Sem registro' ? null : lab === 'Em dia' ? 3 : lab === 'Atrasado' ? 9 : 21
    return { nome: `Bebedouro ${i + 1}`, dias, meta: i < semMeta ? null : 7, ultimaLimpeza: dias === null ? null : '2026-09-10T08:00:00', limpezasNoPeriodo: 1, statusLabel: lab, responsavelUltima: dias === null ? null : 'João da Silva' }
  })
  const ocorrencias = Array.from({ length: nOcorr }, (_, i) => ({ data: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, bebedouro: `Bebedouro ${1 + (i % 6)}`, itensNegativos: 'Água insuficiente', obsItens: '', obsGeral: i % 2 ? 'Observação geral longa '.repeat(8) : '', responsavel: 'Maria', itens: [{ label: 'Água insuficiente', obs: i % 3 ? 'Bóia travada, sem água na calha há dois dias '.repeat(2) : '' }, { label: 'Vazão não ideal', obs: '' }] }))
  return {
    tipo: 'bebedouros',
    dados: {
      ...base, titulo: 'Relatório de Bebedouros', ehDiaUnico: dia, diaUnico: dia ? '2026-09-10' : undefined,
      limpezaKPIs: dia ? undefined : { total: n, emDia: 1, atrasado: 1, critico: 1, semRegistro: 1, semMeta, pctEmDia: 25 },
      maisAtrasado: dia ? null : { nome: 'Bebedouro 3', dias: 21, meta: 7 },
      statusPorBebedouro: dia ? undefined : status,
      proximasSemana: dia ? undefined : [{ nome: 'Bebedouro 1', proximaLimpeza: '2026-10-02', diasParaProxima: 2 }],
      limpezaDiaKPIs: dia ? { limposNoDia: 2, dentroMeta: 1, acimaMeta: 1, muitoAcima: 0, intervaloMedio: 8 } : undefined,
      limpezasDoDia: dia ? [{ nome: 'Bebedouro 1', intervalo: 6, meta: 7, dataLimpeza: '2026-09-10', dataLimpezaAnterior: '2026-09-04', statusLabel: 'Dentro da meta', responsavel: 'João', proximaPrevista: '2026-09-17' }, { nome: 'Bebedouro 2', intervalo: null, meta: 7, dataLimpeza: '2026-09-10', dataLimpezaAnterior: null, statusLabel: 'Primeira limpeza', responsavel: null, proximaPrevista: '2026-09-17' }] : undefined,
      checklistKPIs: { totalRegistros: 50, comChecklist: 50, negativos: nOcorr, pctNegativos: nOcorr ? 30 : 0, itemMaisProblematico: nOcorr ? { label: 'Água insuficiente', pctNegativo: 30, negativos: nOcorr, total: 50 } : null },
      itensRanking: [{ label: 'Água insuficiente', pctNegativo: nOcorr ? 30 : 0, negativos: nOcorr, total: 50 }, { label: 'Vazão não ideal', pctNegativo: 0, negativos: 0, total: 50 }],
      ocorrencias, ocorrenciasPorBebedouro: nOcorr ? [{ bebedouro: 'Bebedouro 1', quantidade: nOcorr }] : [],
    },
  }
}

function boletim(nCats = 10, nLocais = 1) {
  const cats = Array.from({ length: nCats }, (_, i) => ({ descricao: `Categoria ${i + 1}`, inic: 10, com: null, vend: null, mort: null, cons: null, nasc: null, ent: 3, sai: null, evolMais: null, evolMenos: null, final: 13 }))
  return { tipo: 'boletim_rebanho', dados: { ano: 2026, mesReferencia: 'Setembro', mesNumero: 9, fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '', geral: cats, locaisGeral: [], locais: Array.from({ length: nLocais }, (_, i) => ({ fazenda: `Local ${i + 1}`, registros: cats })) } }
}
function morteVazio() { return { tipo: 'morte', dados: { ...base, linhas: [], resumo: {} } } }

const CENARIOS = {
  'rodeio-0': [rodeio(0, 0)],
  'rodeio-1': [rodeio(1, 1)],
  'rodeio-pouco': [rodeio(2, 2, { serie: false })],
  'rodeio-medio': [rodeio(8, 20, { alertas: 3 })],
  'rodeio-alto': [rodeio(40, 120, { alertas: 30 })],
  'beb-0': [bebedouros(0, 0)],
  'beb-3': [bebedouros(3, 0)],
  'beb-20': [bebedouros(20, 0, { semMeta: 2 })],
  'beb-20oc': [bebedouros(20, 6)],
  'beb-60oc': [bebedouros(60, 25)],
  'beb-dia': [bebedouros(5, 2, { dia: true })],
  'mix-pequeno': [boletim(10, 1), pastagens(4, 4, 1, { descanso: false }), bebedouros(20, 0, { semMeta: 2 }), morteVazio(), rodeio(2, 2, { serie: false })],
  'mix-grande': [boletim(10, 5), pastagens(30, 40, 25, { alertas: 8 }), bebedouros(45, 12), morteVazio(), rodeio(15, 50, { alertas: 10 })],
  'boletim-1': [boletim(10, 1)],
  'boletim-curto': [boletim(3, 4)],
  'past-0': [pastagens(0, 0, 0)],
  'past-1': [pastagens(1, 1, 1, { descanso: false, condicao: false })],
  'past-pouco': [pastagens(4, 4, 1, { descanso: false })],
  'past-medio': [pastagens(15, 20, 12, { alertas: 4 })],
  'past-alto': [pastagens(60, 90, 50, { alertas: 30 })],
}
const nomes = cenarioArg === 'tudo' ? Object.keys(CENARIOS) : cenarioArg.split(',')

const exe = await findLocalChrome(puppeteer)
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] })
let falhas = 0
for (const nome of nomes) {
  const reports = CENARIOS[nome]
  if (!reports) { console.log('cenário desconhecido', nome); continue }
  const html = await composeReports({ reports, cover })
  writeFileSync(`${out}/${nome}.html`, html)
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: shots ? 1.3 : 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
  const r = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('section.page')]
    const info = pages.map((p, i) => {
      const nums = [...p.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && /^Página \d+ de \d+$/.test(e.textContent.trim())).map((e) => e.textContent.trim())
      const tables = [...p.querySelectorAll('table')]
      const orf = tables.some((t) => t.querySelectorAll('tbody tr').length === 0)
      const rows = p.querySelectorAll('tbody tr').length
      const texto = p.innerText.replace(/\s+/g, ' ').trim()
      return { i: i + 1, extra: p.scrollHeight - p.clientHeight, ehCapa: p.classList.contains('cover-page') || p.classList.contains('final-page'), estouro: [...p.children].some((c) => c.classList.contains('fb') && c.getBoundingClientRect().bottom > p.getBoundingClientRect().bottom - parseFloat(getComputedStyle(p).paddingBottom) + 1), orfa: orf, rows, nums, titulo: (p.querySelector('.header-section strong')?.textContent) || '', vazia: texto.length < 80 }
    })
    return { total: pages.length, info, fluxo: window.__flowOverflow || [] }
  })
  const problemas = []
  r.info.forEach((p) => {
    if (p.estouro) problemas.push(`pág ${p.i} estourando`)
    if (p.orfa) problemas.push(`pág ${p.i} tabela sem linhas`)
    const esperado = `Página ${p.i} de ${r.total}`
    if (p.nums.length && !p.nums.every((n) => n === esperado)) problemas.push(`pág ${p.i} numeração ${p.nums.join('|')}`)
  })
  console.log(`${nome}: ${r.total} páginas ->`, r.info.map((p) => `${p.i}[${p.titulo || '-'}:${p.rows}r]`).join(' '), problemas.length ? 'PROBLEMAS: ' + problemas.join('; ') : 'OK')
  if (problemas.length) falhas += 1
  if (shots) {
    const els = await page.$$('section.page')
    let k = 1
    for (const el of els) { await el.screenshot({ path: `${out}/${nome}-p${k}.png` }); k += 1 }
  }
  await page.close()
}
await browser.close()
process.exitCode = falhas ? 1 : 0
