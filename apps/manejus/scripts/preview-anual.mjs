// Gera localmente o PDF do Infográfico Anual a partir de um JSON de exemplo (sem banco e sem login),
// com o mesmo caminho do endpoint: ANUAL_REGISTRY → composeReportParts → renderPartsToPdf.
// Uso (em apps/manejus): node scripts/preview-anual.mjs [saida.pdf] [dados.json]
// Padrão de dados: scripts/fixtures/infografico-anual-exemplo.json (retorno real das RPCs na fazenda de testes, 2026).
// Não substitui o teste no ambiente da Vercel (memória e tempo de lá são outros).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ANUAL_REGISTRY, REGISTRY_COMPOSICAO, montarReportsAnuais } from '../api/pdf/_shared/anualRegistry.js'
import { rotuloPeriodoCapa } from '../api/pdf/_relatorios/anual.js'
import { renderPartsToPdf } from '../api/pdf/_shared/partsPdf.js'
import { composeReportParts } from '../api/pdf/_shared/reportComposer.js'

const saida = process.argv[2] ?? 'infografico-anual-preview.pdf'
const fonte = process.argv[3] ?? fileURLToPath(new URL('./fixtures/infografico-anual-exemplo.json', import.meta.url))
const dados = JSON.parse(readFileSync(fonte, 'utf8'))

const logo = (arquivo) => {
  try {
    return `data:image/png;base64,${readFileSync(fileURLToPath(new URL(`../public/images/${arquivo}`, import.meta.url))).toString('base64')}`
  } catch {
    return ''
  }
}
const marca = { fazendaNome: "Fazenda Gesta'Up (testes)", logoGestao: logo('manejus360.png'), logoFazenda: '' }
const secoes = Object.keys(ANUAL_REGISTRY).filter((s) => dados[s])
const memMb = () => Math.round(process.memoryUsage().rss / 1048576)

const t0 = Date.now()
const parts = await composeReportParts({
  reports: montarReportsAnuais(secoes.map((s) => ({ secao: s, data: dados[s] })), marca),
  registry: REGISTRY_COMPOSICAO,
  titulo: 'Infográfico Anual',
  cover: { ...marca, logoEmpresa: logo('gestaupcompany.png'), imagemCapa: '', periodoLabel: rotuloPeriodoCapa(dados[secoes[0]]?.ano, dados[secoes[0]]?.ultimo_mes) },
})
const pdf = await renderPartsToPdf(parts, memMb)
writeFileSync(saida, pdf)
console.log(`[preview-anual] ${secoes.join(', ')} → ${saida} (${Math.round(pdf.length / 1024)} KB, ${Date.now() - t0} ms, rss ${memMb()} MB)`)
