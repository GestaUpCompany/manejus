import { supabase } from '../services/supabaseClient'
import { exportToXLSXMultiSheet, TableExportConfig, MultiSheetExportConfig } from './exportXLSX'
import { getFazendaNome } from './fazendaContext'
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
} from './exportConfigs'

interface CadernetaExportEntry {
  config: TableExportConfig
  select?: string
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
]

export async function exportAllCadernetas(fazendaId: string): Promise<void> {
  const sheets: { data: any[]; config: { sheetName: string; columns: TableExportConfig['columns'] } }[] = []

  for (const entry of CADERNETA_EXPORTS) {
    const query = supabase
      .from(entry.config.tableName)
      .select(entry.select || '*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })

    const { data, error } = await query

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
