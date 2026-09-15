import { renderAbastecimentoHtml } from '../abastecimento.js'
import { renderBebedourosHtml } from '../bebedouros.js'
import { renderConsumoHtml } from '../consumo.js'
import { renderMorteHtml } from '../morte.js'

export const REPORT_REGISTRY = {
  abastecimento: {
    title: 'Relatório de Abastecimento',
    render: renderAbastecimentoHtml,
    hasData: (dados) => Number(dados.totalRegistros) > 0,
  },
  consumo: {
    title: 'Análise de Consumo',
    render: renderConsumoHtml,
    hasData: (dados) => dados.lotes?.some((lote) => lote.dados?.length > 0),
  },
  bebedouros: {
    title: 'Relatório de Bebedouros',
    render: renderBebedourosHtml,
    hasData: (dados) => (dados.statusPorBebedouro?.length ?? 0) > 0 || (dados.limpezasDoDia?.length ?? 0) > 0 || Number(dados.checklistKPIs?.totalRegistros) > 0,
  },
  morte: {
    title: 'Relatório de Mortalidade',
    render: renderMorteHtml,
    hasData: (dados) => (dados.linhas?.length ?? 0) > 0,
  },
}

export function isReportType(value) {
  return typeof value === 'string' && Object.hasOwn(REPORT_REGISTRY, value)
}
