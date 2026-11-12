import {
  renderClimaAnual,
  renderCombustivelAnual,
  renderConsumoAnual,
  renderMorteAnual,
  renderResumoAnual,
  renderRodeioAnual,
} from '../_relatorios/anual/secoes.js'
import { renderAlmoxarifadoAnual, renderCantinaAnual, renderFarmaciaAnual } from '../_relatorios/anual/secoes3.js'
import { renderBebedourosAnual, renderMaternidadeAnual, renderPastagensAnual } from '../_relatorios/anual/secoes2.js'

// Seções do Infográfico Anual. `rpc` é chamada no servidor com (p_fazenda_id, p_ano) e devolve só
// agregados (12 meses + índices do ano). A ordem das seções é a escolhida no modal.
const algumMes = (dados, campo) => (dados?.mensal ?? []).some((m) => Number(m?.[campo]) > 0)

export const ANUAL_REGISTRY = {
  combustivel: {
    title: 'Combustível',
    rpc: 'get_infografico_anual_combustivel',
    render: renderCombustivelAnual,
    hasData: (d) => Number(d?.kpis?.abastecimentos) > 0 || (d?.tanques?.length ?? 0) > 0,
  },
  consumo: {
    title: 'Consumo',
    rpc: 'get_infografico_anual_consumo',
    render: renderConsumoAnual,
    hasData: (d) => Number(d?.kpis?.lote_dias) > 0,
  },
  clima: {
    title: 'Clima',
    rpc: 'get_infografico_anual_clima',
    render: renderClimaAnual,
    hasData: (d) => Number(d?.kpis?.pluviometros) > 0,
  },
  morte: {
    title: 'Mortalidade',
    rpc: 'get_infografico_anual_morte',
    render: renderMorteAnual,
    hasData: (d) => Number(d?.kpis?.mortes) > 0 || algumMes(d, 'mortes'),
  },
  rodeio: {
    title: 'Rodeio de Gado',
    rpc: 'get_infografico_anual_rodeio',
    render: renderRodeioAnual,
    hasData: (d) => Number(d?.kpis?.rodeios) > 0,
  },
  bebedouros: {
    title: 'Bebedouros',
    rpc: 'get_infografico_anual_bebedouros',
    render: renderBebedourosAnual,
    hasData: (d) => Number(d?.kpis?.limpezas) > 0 || Number(d?.kpis?.registros) > 0,
  },
  pastagens: {
    title: 'Manejo de Pastagens',
    rpc: 'get_infografico_anual_pastagens',
    render: renderPastagensAnual,
    hasData: (d) => Number(d?.kpis?.movimentacoes) > 0 || Number(d?.kpis?.dias_pasto) > 0,
  },
  almoxarifado: {
    title: 'Almoxarifado',
    rpc: 'get_infografico_anual_almoxarifado',
    render: renderAlmoxarifadoAnual,
    hasData: (d) => Number(d?.kpis?.movimentos) > 0 || Number(d?.kpis?.itens) > 0,
  },
  farmacia: {
    title: 'Farmácia',
    rpc: 'get_infografico_anual_farmacia',
    render: renderFarmaciaAnual,
    hasData: (d) => Number(d?.kpis?.movimentos) > 0 || Number(d?.kpis?.itens) > 0,
  },
  cantina: {
    title: 'Cantina',
    rpc: 'get_infografico_anual_cantina',
    render: renderCantinaAnual,
    hasData: (d) => Number(d?.kpis?.movimentos) > 0 || Number(d?.kpis?.itens) > 0,
  },
  maternidade: {
    title: 'Maternidade',
    rpc: 'get_infografico_anual_maternidade',
    render: renderMaternidadeAnual,
    hasData: (d) => Number(d?.kpis?.crias) > 0,
  },
}

// Página de abertura "O ano em números": montada pelo servidor a partir das seções escolhidas,
// não é selecionável no modal. Entra só quando há mais de uma seção.
export const RESUMO_ANUAL = {
  title: 'O Ano em Números',
  render: renderResumoAnual,
  hasData: (d) => (d?.secoes?.length ?? 0) > 1,
}

export const REGISTRY_COMPOSICAO = { resumo: RESUMO_ANUAL, ...ANUAL_REGISTRY }

/** Monta a lista de reports do composer: abertura (se couber) + seções na ordem escolhida. */
export function montarReportsAnuais(dadosSecoes, marca) {
  const secoes = dadosSecoes.filter(({ secao, data }) => ANUAL_REGISTRY[secao].hasData(data))
  const base = dadosSecoes[0]?.data ?? {}
  const resumo = { tipo: 'resumo', dados: { ano: base.ano, ultimo_mes: base.ultimo_mes, secoes, __marca: marca } }
  return [resumo, ...dadosSecoes.map(({ secao, data }) => ({ tipo: secao, dados: { ...data, __marca: marca } }))]
}

export function isSecaoAnual(value) {
  return typeof value === 'string' && Object.hasOwn(ANUAL_REGISTRY, value)
}
