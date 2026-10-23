import { renderAbastecimentoHtml } from '../_relatorios/abastecimento.js'
import { renderBebedourosHtml } from '../_relatorios/bebedouros.js'
import { renderConsumoHtml } from '../_relatorios/consumo.js'
import { renderMorteHtml } from '../_relatorios/morte.js'
import { renderRodeioHtml } from '../_relatorios/rodeio.js'
import { renderPastagensHtml } from '../_relatorios/pastagens.js'
import { renderEstoqueHtml } from '../_relatorios/estoque.js'
import { renderEstoqueCombustivelHtml } from '../_relatorios/estoqueCombustivel.js'
import { renderCantinaHtml } from '../_relatorios/cantina.js'
import { renderBoletimRebanhoHtml } from '../_relatorios/boletimRebanho.js'

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
    // Mapa desligado no infográfico: WebGL por software (swiftshader) estourava os 2 GB da função (Hobby).
    render: (dados) => renderMorteHtml(dados, { incluirMapa: false }),
    hasData: (dados) => (dados.linhas?.length ?? 0) > 0,
  },
  rodeio: {
    title: 'Relatório de Rodeio de Gado',
    render: renderRodeioHtml,
    hasData: (dados) => (dados.registros?.length ?? 0) > 0,
  },
  pastagens: {
    title: 'Relatório de Manejo de Pastagens',
    render: renderPastagensHtml,
    hasData: (dados) => (dados.registros?.length ?? 0) > 0 || (dados.ocupacoes?.length ?? 0) > 0,
  },
  estoque: {
    title: 'Relatório de Estoque',
    render: renderEstoqueHtml,
    hasData: (dados) => (dados.itens?.length ?? 0) > 0,
  },
  estoque_combustivel: {
    title: 'Relatório de Estoque de Combustível',
    render: renderEstoqueCombustivelHtml,
    hasData: (dados) => (dados.tanques?.length ?? 0) > 0,
  },
  cantina: {
    title: 'Relatório de Cantina',
    render: renderCantinaHtml,
    hasData: (dados) => (dados.itens?.length ?? 0) > 0 || Number(dados.operacao?.registros) > 0 || Number(dados.marmitas?.registros) > 0,
  },
  boletim_rebanho: {
    title: 'Boletim de Rebanho',
    render: renderBoletimRebanhoHtml,
    hasData: (dados) => (dados.geral?.length ?? 0) > 0 || (dados.locais?.length ?? 0) > 0,
  },
}

export function isReportType(value) {
  return typeof value === 'string' && Object.hasOwn(REPORT_REGISTRY, value)
}
