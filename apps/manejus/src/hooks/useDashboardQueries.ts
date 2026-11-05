import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { getFazendaIdForUser } from '@gestaup/shared'
import { formatDateTime, getDayBoundsInTimezone, toFarmDateOnly } from '@gestaup/shared'
import {
  saldoCategoriaEm,
  type CategoriaSaldo,
  type MovimentacaoSaldo,
  type MorteSaldo,
  type NascimentoSaldo,
} from '../services/saldoCabecasNaData'

async function getFazendaId(userId: string): Promise<string | null> {
  return getFazendaIdForUser(userId)
}

export { useFazenda } from '@gestaup/shared'

export function useDashboardStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return null

      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_fazenda_id: fazendaId })
      if (error) throw error

      const result = data as {
        cadastroStats: { pastos: number; lotes: number; funcionarios: number; insumos: number; pluviometros: number; medicamentos: number }
        cadernetaStats: Record<string, number>
        registrosHoje: number
      }

      return {
        cadastroStats: result.cadastroStats,
        cadernetaStats: result.cadernetaStats,
        registrosHoje: result.registrosHoje,
      }
    },
  })
}

export function useGadoStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['gado-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return null

      const { data, error } = await supabase.rpc('get_gado_stats', { p_fazenda_id: fazendaId })
      if (error) throw error

      return data as {
        totalAnimais: number
        animaisPorLote: { nome: string; cabecas: number }[]
        pesoMedioLotes: number
        mortesMesAtual: number
        enfermariaMesAtual: number
        causasMorteFrequentes: { causa: string; total: number }[]
      }
    },
  })
}

export type RebanhoFaixaEtariaItem = { faixa: string; sexo: string; cabecas: number }

export function useRebanhoFaixaEtaria(userId: string | undefined) {
  return useQuery({
    queryKey: ['rebanho-faixa-etaria', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return [] as RebanhoFaixaEtariaItem[]

      const { data, error } = await supabase.rpc('get_rebanho_faixa_etaria', { p_fazenda_id: fazendaId })
      if (error) throw error

      return (data as RebanhoFaixaEtariaItem[]) ?? []
    },
  })
}

export type RebanhoFaixaEtariaNaData = {
  itens: RebanhoFaixaEtariaItem[]
  primeiraData: string | null
}

function faixaDaIdade(meses: number | null): string {
  if (meses == null) return 'sem_idade'
  if (meses <= 4) return '0-4'
  if (meses <= 12) return '5-12'
  if (meses <= 24) return '13-24'
  if (meses <= 36) return '25-36'
  return '36+'
}

function sexoPadrao(sexo: string | null): string {
  const s = (sexo || '').trim().toLowerCase()
  if (s === 'fêmea' || s === 'femea') return 'Fêmea'
  if (s === 'macho') return 'Macho'
  return 'Indefinido'
}

// Meses inteiros entre duas datas AAAA-MM-DD (negativo se `fim` < `inicio`).
function mesesEntre(inicio: string, fim: string): number {
  const [ai, mi, di] = inicio.split('-').map(Number)
  const [af, mf, df] = fim.split('-').map(Number)
  let meses = (af - ai) * 12 + (mf - mi)
  if (meses > 0 && df < di) meses -= 1
  if (meses < 0 && df > di) meses += 1
  return meses
}

type CategoriaFaixa = CategoriaSaldo & {
  sexo: string | null
  idade: number | null
  idade_data_ref: string | null
}

// Rebanho por faixa etária e sexo ao fim de `data` (AAAA-MM-DD). Saldo reconstituído
// do saldo atual desfazendo movimentações, mortes e nascimentos posteriores; idade
// na data = idade do cadastro + meses decorridos desde a data de referência da idade.
export function useRebanhoFaixaEtariaNaData(userId: string | undefined, data: string, hoje: string) {
  return useQuery({
    queryKey: ['rebanho-faixa-etaria-na-data', userId, data],
    enabled: !!userId && !!data && data < hoje,
    queryFn: async (): Promise<RebanhoFaixaEtariaNaData> => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return { itens: [], primeiraData: null }
      const instante = getDayBoundsInTimezone(data).end

      const { data: lotes, error: lotesErr } = await supabase
        .from('lotes')
        .select('id, created_at')
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
      if (lotesErr) throw lotesErr
      const listaLotes = (lotes ?? []) as { id: string; created_at: string | null }[]
      const loteIds = listaLotes.map((l) => l.id)
      const primeiraData =
        listaLotes
          .map((l) => toFarmDateOnly(l.created_at))
          .filter((d): d is string => !!d)
          .sort()[0] ?? null
      if (loteIds.length === 0) return { itens: [], primeiraData }
      const lista = loteIds.join(',')

      const [cats, movs, mortes, nasc] = await Promise.all([
        supabase
          .from('lote_categorias')
          .select('lote_id, categoria, quant_atual, quant_inicial, ativo, created_at, data_fim, sexo, idade, idade_data_ref')
          .in('lote_id', loteIds)
          .or(`data_fim.is.null,data_fim.gte.${instante}`),
        supabase
          .from('registros_movimentacao')
          .select('data, lote_origem_id, lote_destino_id, categoria, numero_cabecas, motivo_movimentacao, tipo_saida, tipo_entrada, subtipo')
          .or(`lote_origem_id.in.(${lista}),lote_destino_id.in.(${lista})`)
          .gte('data', instante)
          .is('deleted_at', null),
        supabase
          .from('registros_morte')
          .select('data, lote_id, categoria')
          .in('lote_id', loteIds)
          .gte('data', instante)
          .is('deleted_at', null),
        supabase
          .from('registros_maternidade')
          .select('data, lote_id, sexo, tipo_parto')
          .in('lote_id', loteIds)
          .gte('data', instante)
          .is('deleted_at', null),
      ])
      for (const r of [cats, movs, mortes, nasc]) if (r.error) throw r.error

      const movimentacoes = (movs.data ?? []) as MovimentacaoSaldo[]
      const mortesLista = (mortes.data ?? []) as MorteSaldo[]
      const nascimentos = (nasc.data ?? []) as NascimentoSaldo[]

      const acumulado = new Map<string, RebanhoFaixaEtariaItem>()
      for (const c of (cats.data ?? []) as CategoriaFaixa[]) {
        const cabecas = saldoCategoriaEm(c.lote_id, c, instante, movimentacoes, mortesLista, nascimentos)
        if (cabecas <= 0) continue
        const idade =
          c.idade == null
            ? null
            : c.idade_data_ref
              ? Math.max(0, c.idade + mesesEntre(c.idade_data_ref, data))
              : c.idade
        const faixa = faixaDaIdade(idade)
        const sexo = sexoPadrao(c.sexo)
        const chave = `${faixa}|${sexo}`
        const atual = acumulado.get(chave)
        if (atual) atual.cabecas += cabecas
        else acumulado.set(chave, { faixa, sexo, cabecas })
      }
      return { itens: [...acumulado.values()], primeiraData }
    },
  })
}

export function useRecentActivities(userId: string | undefined) {
  return useQuery({
    queryKey: ['recent-activities', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return []

      const { data, error } = await supabase.rpc('get_recent_activities', { p_fazenda_id: fazendaId })
      if (error) throw error

      const activities = (data as { activities: { id: string; type: string; title: string; data: string }[] }).activities

      // Só maternidade, enfermaria e rodeio têm tela de detalhe; as demais levam à lista da caderneta.
      const detailPaths: Record<string, string> = {
        Maternidade: '/controller/cadernetas/maternidade',
        Enfermaria: '/controller/cadernetas/enfermaria',
        Rodeio: '/controller/cadernetas/rodeio',
      }
      const listPaths: Record<string, string> = {
        Pastagens: '/controller/cadernetas/pastagens',
        'Suplementação': '/controller/cadernetas/suplementacao',
        Bebedouros: '/controller/cadernetas/bebedouros',
        'Movimentação': '/controller/cadernetas/movimentacao',
        Morte: '/controller/cadernetas/morte',
        Pesagem: '/controller/cadernetas/pesagem',
        'Leitura de cocho': '/controller/cadernetas/leitura-cocho',
        Trato: '/controller/cadernetas/trato-confinamento',
        'Fábrica de confinamento': '/controller/cadernetas/fabrica-confinamento',
        'Manejo de curral': '/controller/cadernetas/manejo-curral',
        Clima: '/controller/cadernetas/clima',
        Limpeza: '/controller/cadernetas/limpeza',
        Problemas: '/controller/cadernetas/problemas',
        'Operações de máquinas': '/controller/cadernetas/operacoes-maquinas',
        'Manutenção de máquinas': '/controller/cadernetas/manutencao-maquinas',
        Abastecimento: '/controller/cadernetas/abastecimento',
        Almoxarifado: '/controller/cadernetas/almoxarifado',
        Cantina: '/controller/cadernetas/alimentacao',
        'Entrada de insumos': '/controller/cadernetas/entrada-insumos',
        'Saída de insumos': '/controller/cadernetas/saida-insumos',
      }

      return activities.map(a => ({
        id: a.id,
        type: a.type,
        title: a.title,
        date: formatDateTime(a.data),
        path: detailPaths[a.type] ? `${detailPaths[a.type]}/${a.id}` : (listPaths[a.type] ?? '/controller'),
      }))
    },
  })
}

export function useFormulacoesBackfillAlert(userId: string | undefined) {
  return useQuery({
    queryKey: ['formulacoes-backfill-alert', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return [] as { id: string; nome: string; categoria: string | null; categoria_inferida_observacao: string | null }[]

      const { data, error } = await supabase
        .from('formulacoes')
        .select('id, nome, categoria, categoria_inferida_observacao')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .eq('categoria_inferida_automaticamente', true)
        .order('nome', { ascending: true })

      if (error) throw error
      return (data as { id: string; nome: string; categoria: string | null; categoria_inferida_observacao: string | null }[]) || []
    },
  })
}
