import { supabase } from '@gestaup/supabase'
import { exportToXLSXMultiSheet, TableExportConfig, SheetConfig, MultiSheetExportConfig } from '@gestaup/shared'
import { getFazendaNome } from '@gestaup/shared'
import {
  MATERNIDADE_EXPORT_CONFIG,
  PASTAGENS_EXPORT_CONFIG,
  RODEIO_EXPORT_CONFIG,
  SUPLEMENTACAO_EXPORT_CONFIG,
  BEBEDOUROS_EXPORT_CONFIG,
  MOVIMENTACAO_EXPORT_CONFIG,
  ENFERMARIA_EXPORT_CONFIG,
  MORTE_EXPORT_CONFIG,
  CLIMA_EXPORT_CONFIG,
  ABASTECIMENTO_EXPORT_CONFIG,
  ALIMENTACAO_EXPORT_CONFIG,
  CANTINA_EXPORT_CONFIG,
  LIMPEZA_EXPORT_CONFIG,
  OPERACOES_MAQUINAS_EXPORT_CONFIG,
  ALMOXARIFADO_EXPORT_CONFIG,
  MANUTENCAO_MAQUINAS_EXPORT_CONFIG,
  PROBLEMAS_EXPORT_CONFIG,
  PESAGEM_EXPORT_CONFIG,
  LEITURA_COCHO_EXPORT_CONFIG,
  TRATO_CONFINAMENTO_EXPORT_CONFIG,
  FABRICA_CONFINAMENTO_EXPORT_CONFIG,
  ENTRADA_INSUMOS_EXPORT_CONFIG,
  SAIDA_INSUMOS_EXPORT_CONFIG,
  ENTRADA_COMBUSTIVEL_EXPORT_CONFIG,
  ORDENS_SERVICO_EXPORT_CONFIG,
  RECEBIMENTO_COMPRA_EXPORT_CONFIG,
} from './exportConfigs'

interface CadernetaExportEntry {
  config: TableExportConfig
  select?: string
  orderBy?: string
  filters?: { column: string; value: string }[]
}

const CADERNETA_EXPORTS: CadernetaExportEntry[] = [
  {
    config: MATERNIDADE_EXPORT_CONFIG,
    select: '*, individuo_mae:individuos!individuo_id_mae(id_brinco, id_manejo), individuo_cria:individuos!individuo_id_cria(id_brinco, id_manejo)',
  },
  { config: PASTAGENS_EXPORT_CONFIG },
  { config: RODEIO_EXPORT_CONFIG },
  { config: SUPLEMENTACAO_EXPORT_CONFIG },
  { config: BEBEDOUROS_EXPORT_CONFIG },
  {
    config: MOVIMENTACAO_EXPORT_CONFIG,
    select: '*, lote_origem_nome:lotes!lote_origem_id(nome), lote_destino_nome:lotes!lote_destino_id(nome), individuo:individuos!individuo_id(id_brinco)',
  },
  { config: ENFERMARIA_EXPORT_CONFIG },
  { config: MORTE_EXPORT_CONFIG },
  { config: CLIMA_EXPORT_CONFIG },
  { config: ABASTECIMENTO_EXPORT_CONFIG },
  { config: ALIMENTACAO_EXPORT_CONFIG },
  { config: CANTINA_EXPORT_CONFIG },
  { config: LIMPEZA_EXPORT_CONFIG },
  { config: OPERACOES_MAQUINAS_EXPORT_CONFIG },
  { config: ALMOXARIFADO_EXPORT_CONFIG },
  { config: MANUTENCAO_MAQUINAS_EXPORT_CONFIG },
  { config: PROBLEMAS_EXPORT_CONFIG },
  {
    config: PESAGEM_EXPORT_CONFIG,
    select: '*, lote_rel:lotes(nome), ordem_servico:ordens_servico!registros_pesagem_os_id_fkey(numero_os)',
  },
  {
    config: LEITURA_COCHO_EXPORT_CONFIG,
    select: '*, pasto:pastos(nome), curral:currais(nome), lote_rel:lotes(nome)',
  },
  {
    config: TRATO_CONFINAMENTO_EXPORT_CONFIG,
    select: '*, curral:currais(nome), lote:lotes(nome)',
  },
  {
    config: FABRICA_CONFINAMENTO_EXPORT_CONFIG,
    select: '*, vagao:vagoes(nome, marca, modelo), formulacao:formulacoes(nome)',
  },
  {
    config: ENTRADA_INSUMOS_EXPORT_CONFIG,
    select: '*, entrada_insumos_itens(id)',
    orderBy: 'data_entrada',
  },
  {
    config: SAIDA_INSUMOS_EXPORT_CONFIG,
    select: '*, formulacao:formulacoes(nome), saida_insumos_itens(id)',
    orderBy: 'data_producao',
  },
  {
    config: ENTRADA_COMBUSTIVEL_EXPORT_CONFIG,
    select: '*, tanque:tanques_combustivel!movimentacoes_combustivel_tanque_id_fkey(nome)',
    filters: [
      { column: 'tipo_movimentacao', value: 'entrada' },
      { column: 'origem', value: 'pwa_entrada' },
    ],
  },
  { config: ORDENS_SERVICO_EXPORT_CONFIG, orderBy: 'created_at' },
  {
    config: RECEBIMENTO_COMPRA_EXPORT_CONFIG,
    select: '*, ordem_servico:ordens_servico!os_recebimentos_os_id_fkey(numero_os)',
    orderBy: 'data_chegada',
  },
]

export async function exportAllCadernetas(fazendaId: string): Promise<void> {
  const sheets: { data: any[]; config: SheetConfig }[] = []

  for (const entry of CADERNETA_EXPORTS) {
    let query = supabase
      .from(entry.config.tableName)
      .select(entry.select || '*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)

    for (const f of entry.filters ?? []) {
      query = query.eq(f.column, f.value)
    }

    const { data, error } = await query.order(entry.orderBy || 'data', { ascending: false })

    if (error) {
      console.error(`Erro ao buscar ${entry.config.tableName}:`, error)
      continue
    }

    if (data && data.length > 0) {
      sheets.push({
        data,
        config: {
          sheetName: entry.config.sheetName,
          columns: entry.config.columns,
          exclude: entry.config.exclude,
        },
      })
    }
  }

  if (sheets.length === 0) {
    throw new Error('Nenhum registro encontrado para exportar.')
  }

  const fazendaNome = await getFazendaNome(fazendaId)

  const multiConfig: MultiSheetExportConfig = {
    tableName: 'cadernetas_completo',
    sheets,
  }

  exportToXLSXMultiSheet(multiConfig, fazendaNome || undefined)
}
