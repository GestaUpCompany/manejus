// Tipos do schema Farm Plan (fp_*). Espelham supabase/migrations/20261001150000_farmplan_schema.sql

export type FpStatusSemana = 1 | 2 | 3 | 4 | 5
// 1 Planejado, 2 Concluído, 3 Em andamento, 4 Atrasado, 5 Pausado

export const FP_STATUS_LABEL: Record<FpStatusSemana, string> = {
  1: 'Planejado',
  2: 'Concluído',
  3: 'Em andamento',
  4: 'Atrasado',
  5: 'Pausado',
}

export type FpTipoAtividade = 1 | 2 | 3 | 4 | 5
// 1 Rotina, 2 Estratégica, 3 Gestão, 4 Estruturação, 5 Projeto

export const FP_TIPO_LABEL: Record<FpTipoAtividade, string> = {
  1: 'Rotina',
  2: 'Estratégica',
  3: 'Gestão',
  4: 'Estruturação',
  5: 'Projeto',
}

export type FpFarmplanPapel = 'colaborador' | 'lider' | 'gestor'

export interface FpPlano {
  id: string
  fazenda_id: string
  ano: number
  semana1_inicio: string // date
  ativo: boolean
}

export interface FpAtividade {
  id: string
  plano_id: string
  fazenda_id: string
  nome: string
  local: string | null
  coordenador_id: string | null
  executor_funcionario_id: string | null
  executor_equipe_id: string | null
  setor_id: string | null
  tipo: FpTipoAtividade
  urgencia: 1 | 2 | 3
  dias_semana: boolean[] // [seg..dom], 7 elementos
  metodologia: string | null
  maquinas: string | null
  materiais: string | null
  meta: string | null
  exige_sessao: boolean
  ativo: boolean
}

export interface FpAtividadeSemana {
  id: string
  atividade_id: string
  fazenda_id: string
  semana: number
  status: FpStatusSemana
  observacao: string | null
  carry_from: number | null
}

export interface FpBaixa {
  id: string
  atividade_id: string
  fazenda_id: string
  semana: number
  dia: number // 0=seg .. 6=dom
  feita: boolean
  observacao: string | null
  foto_url: string | null
  feita_por_funcionario_id: string | null
  feita_por_usuario_id: string | null
  feita_at: string
  tempo_gasto_segundos: number | null
}

export interface FpEquipe {
  id: string
  fazenda_id: string
  nome: string
  ativo: boolean
}

export interface FpExtra {
  id: string
  fazenda_id: string
  semana: number
  dia: number
  nome: string
  funcionario_id: string | null
  equipe_id: string | null
  setor_id: string | null
  observacao: string | null
}

export interface FuncionarioFp {
  id: string
  fazenda_id: string
  nome: string
  apelido: string | null
  cargo: string | null
  superior_id: string | null
  setor_id: string | null
  farmplan_papel: FpFarmplanPapel
  ativo: boolean
}

export const DIAS_SEMANA_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

/** Datas (segunda..domingo) de uma semana do plano, a partir de semana1_inicio. */
export function datasDaSemana(semana1Inicio: string, semana: number): Date[] {
  const ini = new Date(`${semana1Inicio}T12:00:00`)
  const base = new Date(ini)
  base.setDate(ini.getDate() + (semana - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d
  })
}
