import {
  renderClimaAnual,
  renderCombustivelAnual,
  renderConsumoAnual,
  renderMorteAnual,
  renderRodeioAnual,
} from '../_relatorios/anual/secoes.js'

// Seções do Infográfico Anual. `rpc` é chamada no servidor com (p_fazenda_id, p_ano) e devolve só
// agregados (12 meses + índices do ano). A ordem das seções é a escolhida no modal.
const algumMes = (dados, campo) => (dados?.mensal ?? []).some((m) => Number(m?.[campo]) > 0)

export const ANUAL_REGISTRY = {
  combustivel: {
    title: 'Combustível no Ano',
    rpc: 'get_infografico_anual_combustivel',
    render: renderCombustivelAnual,
    hasData: (d) => Number(d?.kpis?.abastecimentos) > 0 || (d?.tanques?.length ?? 0) > 0,
  },
  consumo: {
    title: 'Consumo no Ano',
    rpc: 'get_infografico_anual_consumo',
    render: renderConsumoAnual,
    hasData: (d) => Number(d?.kpis?.lote_dias) > 0,
  },
  clima: {
    title: 'Clima no Ano',
    rpc: 'get_infografico_anual_clima',
    render: renderClimaAnual,
    hasData: (d) => Number(d?.kpis?.pluviometros) > 0,
  },
  morte: {
    title: 'Mortalidade no Ano',
    rpc: 'get_infografico_anual_morte',
    render: renderMorteAnual,
    hasData: (d) => Number(d?.kpis?.mortes) > 0 || algumMes(d, 'mortes'),
  },
  rodeio: {
    title: 'Rodeio de Gado no Ano',
    rpc: 'get_infografico_anual_rodeio',
    render: renderRodeioAnual,
    hasData: (d) => Number(d?.kpis?.rodeios) > 0,
  },
}

export function isSecaoAnual(value) {
  return typeof value === 'string' && Object.hasOwn(ANUAL_REGISTRY, value)
}
