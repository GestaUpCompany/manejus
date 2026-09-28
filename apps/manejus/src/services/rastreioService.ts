import { supabase } from './supabaseClient'

export interface RastreioUsuario {
  nome_usuario: string
  total_registros: number
  cadernetas_usadas: number
  primeiro_registro: string
  ultimo_registro: string
  dias_ativos: number
  ultimo_dia_ativo: string
}

export interface RastreioCaderneta {
  nome_usuario: string
  caderneta: string
  total_registros: number
  registros_ativos: number
  registros_deletados: number
  primeiro_registro: string
  ultimo_registro: string
  dias_ativos: number
}

export interface RastreioDetalhe {
  nome_usuario: string
  caderneta: string
  dia: string
  total: number
  ativos: number
  deletados: number
}

export async function getRastreioUsuarios(
  fazendaId: string,
  dataInicio?: string,
  dataFim?: string
): Promise<RastreioUsuario[]> {
  const { data, error } = await supabase.rpc('get_rastreio_usuarios', {
    p_fazenda_id: fazendaId,
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
  })

  if (error) {
    console.error('[Rastreio] Erro ao buscar usuarios:', error)
    return []
  }

  return (data || []) as RastreioUsuario[]
}

export async function getRastreioCadernetas(
  fazendaId: string,
  dataInicio?: string,
  dataFim?: string
): Promise<RastreioCaderneta[]> {
  const { data, error } = await supabase.rpc('get_rastreio_cadernetas', {
    p_fazenda_id: fazendaId,
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
  })

  if (error) {
    console.error('[Rastreio] Erro ao buscar cadernetas:', error)
    return []
  }

  return (data || []) as RastreioCaderneta[]
}

export async function getRastreioCadernetasDetalhe(
  fazendaId: string,
  nomeUsuario?: string,
  dataInicio?: string,
  dataFim?: string
): Promise<RastreioDetalhe[]> {
  const { data, error } = await supabase.rpc('get_rastreio_cadernetas_detalhe', {
    p_fazenda_id: fazendaId,
    p_nome_usuario: nomeUsuario || null,
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
  })

  if (error) {
    console.error('[Rastreio] Erro ao buscar detalhe:', error)
    return []
  }

  return (data || []) as RastreioDetalhe[]
}

// Mapa de nomes amigaveis para cadernetas
export const CADERNETA_LABELS: Record<string, string> = {
  registros_abastecimento: 'Abastecimento',
  registros_alimentacao: 'Alimentação',
  registros_almoxarifado: 'Almoxarifado',
  registros_bebedouros: 'Bebedouros',
  registros_clima: 'Clima',
  registros_enfermaria: 'Enfermaria',
  registros_entrada_insumos: 'Entrada de Insumos',
  registros_leitura_cocho: 'Leitura de Cocho',
  registros_limpeza: 'Limpeza',
  registros_manutencao_maquinas: 'Manutenção de Máquinas',
  registros_maternidade: 'Maternidade',
  registros_morte: 'Morte',
  registros_movimentacao: 'Movimentação',
  registros_oferta_trato: 'Oferta de Trato',
  registros_operacoes_maquinas: 'Operações de Máquinas',
  registros_pastagens: 'Pastagens',
  registros_problemas: 'Problemas',
  registros_rodeio: 'Rodeio',
  registros_saida_insumos: 'Saída de Insumos',
  registros_suplementacao: 'Suplementação',
}

export function cadernetaLabel(key: string): string {
  return CADERNETA_LABELS[key] || key
}
