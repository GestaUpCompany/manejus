import { supabase } from './supabaseClient'
import type { TipoProgramacao } from './programacaoTratosService'

export interface PlanejadoLote {
  lote_id: string
  lote_nome: string | null
  curral_id: string
  curral_nome: string
  kg_mn_dia: number
  n_cabecas_snapshot: number | null
  peso_vivo_medio_snapshot: number | null
  tipo: TipoProgramacao
  quantidade_tratos: number
  data_inicio: string
  data_fim: string
}

export interface RegistroTratoDia {
  data: string // YYYY-MM-DD
  lote_id: string | null
  lote_nome: string | null
  curral_id: string | null
  curral_nome: string | null
  kg_planejado_total: number
  kg_ofertado_total: number
  n_tratos: number
  leitura_media: number | null
  tratadores: string[]
  qtd_registros: number
  programacao_ids: string[]
}

export interface LinhaDesvio {
  data: string // YYYY-MM-DD
  lote_id: string
  lote_nome: string
  curral_nome: string | null
  planejado_kg: number | null // null = sem planejamento
  real_kg: number
  desvio_kg: number | null
  desvio_pct: number | null
  n_tratos: number
  leitura_media: number | null
  tratador: string | null
  status: 'ok' | 'alerta' | 'critico' | 'sem_execucao'
  tipo: TipoProgramacao | null // engorda, sequestro, TIP ou null (sem planejamento)
}

export interface ResumoLote {
  lote_id: string
  lote_nome: string
  planejado_total_kg: number
  real_total_kg: number
  desvio_total_kg: number
  desvio_medio_pct: number
  dias_com_registro: number
  dias_no_periodo: number
  status: 'ok' | 'alerta' | 'critico' | 'sem_execucao'
  tipo: TipoProgramacao | null
}

/**
 * Busca a programação de tratos ativa da fazenda, agrupada por lote.
 * Usado para preencher dias sem execução (linhas "sem execução").
 */
export async function fetchPlanejadoPorLote(
  fazendaId: string
): Promise<Record<string, PlanejadoLote[]>> {
  const { data: progs, error: progError } = await supabase
    .from('programacao_tratos')
    .select('id, tipo, quantidade_tratos, data_inicio, data_fim')
    .eq('fazenda_id', fazendaId)

  if (progError) throw progError
  if (!progs || progs.length === 0) return {}

  const resultado: Record<string, PlanejadoLote[]> = {}

  for (const prog of progs) {
    const { data: currais, error: curraisError } = await supabase
      .from('programacao_tratos_currais')
      .select(`
        curral_id,
        lote_id,
        kg_mn_dia,
        n_cabecas_snapshot,
        peso_vivo_medio_snapshot,
        currais (nome),
        lotes (nome)
      `)
      .eq('programacao_id', prog.id)

    if (curraisError) throw curraisError
    if (!currais) continue

    for (const c of currais) {
      const loteId = c.lote_id
      if (!loteId) continue

      const item: PlanejadoLote = {
        lote_id: loteId,
        lote_nome: (c.lotes as any)?.nome ?? null,
        curral_id: c.curral_id,
        curral_nome: (c.currais as any)?.nome ?? '—',
        kg_mn_dia: Number(c.kg_mn_dia) || 0,
        n_cabecas_snapshot: c.n_cabecas_snapshot,
        peso_vivo_medio_snapshot: c.peso_vivo_medio_snapshot,
        tipo: prog.tipo as TipoProgramacao,
        quantidade_tratos: prog.quantidade_tratos,
        data_inicio: prog.data_inicio,
        data_fim: prog.data_fim,
      }

      if (!resultado[loteId]) resultado[loteId] = []
      resultado[loteId].push(item)
    }
  }

  return resultado
}

/**
 * Busca registros de oferta de trato do período, agregados por lote + dia.
 * Lê da tabela registros_oferta_trato, que já contém kg_planejado e kg_ofertado_real por trato.
 */
export async function fetchRealPorLoteDia(
  fazendaId: string,
  dataInicio: string,
  dataFim: string
): Promise<RegistroTratoDia[]> {
  // A coluna data é timestamptz, então .lte('data', '2026-08-05') exclui registros
  // após meia-noite desse dia. Somar 1 dia ao filtro final e usar .lt para incluir o dia inteiro.
  const dataFimNext = new Date(dataFim + 'T00:00:00')
  dataFimNext.setDate(dataFimNext.getDate() + 1)
  const dataFimExclusive = dataFimNext.toISOString().substring(0, 10)

  const { data, error } = await supabase
    .from('registros_oferta_trato')
    .select(`
      data,
      lote_id,
      curral_id,
      ordem_trato,
      kg_planejado,
      kg_ofertado_real,
      leitura_cocho_nota,
      nome_usuario,
      programacao_id,
      lotes (nome),
      currais (nome)
    `)
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .gte('data', dataInicio)
    .lt('data', dataFimExclusive)
    .order('data', { ascending: true })

  if (error) throw error
  if (!data) return []

  // Agrupar por lote_id + data
  const mapa: Record<string, RegistroTratoDia> = {}

  for (const r of data) {
    // A coluna data é timestamptz; normalizar para YYYY-MM-DD para casar com o lookup
    const dataRaw = r.data as string
    const dataDia = dataRaw.includes('T') ? dataRaw.substring(0, 10) : dataRaw.substring(0, 10)
    const loteId = r.lote_id || '_sem_lote'
    const chave = `${loteId}|${dataDia}`

    if (!mapa[chave]) {
      mapa[chave] = {
        data: dataDia,
        lote_id: r.lote_id || null,
        lote_nome: (r.lotes as any)?.nome ?? null,
        curral_id: r.curral_id || null,
        curral_nome: (r.currais as any)?.nome ?? null,
        kg_planejado_total: 0,
        kg_ofertado_total: 0,
        n_tratos: 0,
        leitura_media: null,
        tratadores: [],
        qtd_registros: 0,
        programacao_ids: [],
      }
    }

    const entry = mapa[chave]
    entry.kg_planejado_total += Number(r.kg_planejado) || 0
    entry.kg_ofertado_total += Number(r.kg_ofertado_real) || 0
    entry.n_tratos += 1
    entry.qtd_registros += 1

    // Coletar programacao_ids únicos para determinar o tipo
    if (r.programacao_id && !entry.programacao_ids.includes(r.programacao_id)) {
      entry.programacao_ids.push(r.programacao_id)
    }

    // Coletar tratadores únicos
    if (r.nome_usuario && !entry.tratadores.includes(r.nome_usuario)) {
      entry.tratadores.push(r.nome_usuario)
    }

    // Leitura média (leitura_cocho_nota é integer)
    const leituraNum = r.leitura_cocho_nota != null ? Number(r.leitura_cocho_nota) : null
    if (leituraNum != null && !isNaN(leituraNum)) {
      if (entry.leitura_media == null) {
        entry.leitura_media = leituraNum
      } else {
        entry.leitura_media = (entry.leitura_media * (entry.qtd_registros - 1) + leituraNum) / entry.qtd_registros
      }
    }
  }

  return Object.values(mapa)
}

/**
 * Gera todas as datas entre dataInicio e dataFim (inclusive).
 */
function gerarDatasPeriodo(dataInicio: string, dataFim: string): string[] {
  const datas: string[] = []
  const inicio = new Date(dataInicio + 'T00:00:00')
  const fim = new Date(dataFim + 'T00:00:00')
  const atual = new Date(inicio)

  while (atual <= fim) {
    const ano = atual.getFullYear()
    const mes = String(atual.getMonth() + 1).padStart(2, '0')
    const dia = String(atual.getDate()).padStart(2, '0')
    datas.push(`${ano}-${mes}-${dia}`)
    atual.setDate(atual.getDate() + 1)
  }

  return datas
}

/**
 * Cruza planejado e real por lote × dia.
 * Para dias com execução, usa o kg_planejado que vem do próprio registro (mais preciso).
 * Para dias sem execução, usa o kg_mn_dia da programacao_tratos_currais.
 */
export function cruzarPlanejadoReal(
  planejado: Record<string, PlanejadoLote[]>,
  real: RegistroTratoDia[],
  dataInicio: string,
  dataFim: string,
  lotesFiltro: string[] // se vazio, todos
): LinhaDesvio[] {
  const datas = gerarDatasPeriodo(dataInicio, dataFim)
  const linhas: LinhaDesvio[] = []

  // Indexar real por lote_id + data
  const realMapa: Record<string, RegistroTratoDia> = {}
  for (const r of real) {
    const loteId = r.lote_id || '_sem_lote'
    realMapa[`${loteId}|${r.data}`] = r
  }

  // Lotes com planejamento: gerar linha para cada dia do período
  const lotesPlanejados = Object.keys(planejado).filter(
    (id) => lotesFiltro.length === 0 || lotesFiltro.includes(id)
  )

  for (const loteId of lotesPlanejados) {
    const curraisLote = planejado[loteId]
    const loteNome = curraisLote[0]?.lote_nome ?? '—'

    for (const data of datas) {
      const realDia = realMapa[`${loteId}|${data}`]
      const planosDoDia = curraisLote.filter(
        (plano) => data >= plano.data_inicio && data <= plano.data_fim
      )
      if (planosDoDia.length === 0 && !realDia) continue

      const kgPlanejadoDia = planosDoDia.reduce((sum, c) => sum + c.kg_mn_dia, 0)
      const curralNome = planosDoDia[0]?.curral_nome ?? curraisLote[0]?.curral_nome ?? null
      const tipoProg = planosDoDia[0]?.tipo ?? curraisLote[0]?.tipo ?? null

      if (realDia) {
        // Dia com execução: usar kg_planejado do próprio registro
        const planejadoKg = realDia.kg_planejado_total
        const realKg = realDia.kg_ofertado_total
        const desvioKg = realKg - planejadoKg
        const desvioPct = planejadoKg > 0 ? (desvioKg / planejadoKg) * 100 : null

        linhas.push({
          data,
          lote_id: loteId,
          lote_nome: loteNome,
          curral_nome: realDia.curral_nome || curralNome,
          planejado_kg: planejadoKg,
          real_kg: realKg,
          desvio_kg: desvioKg,
          desvio_pct: desvioPct,
          n_tratos: realDia.n_tratos,
          leitura_media: realDia.leitura_media,
          tratador: realDia.tratadores.join(', ') || null,
          status: classificarDesvio(desvioPct),
          tipo: tipoProg,
        })
      } else {
        // Dia sem execução para lote planejado
        linhas.push({
          data,
          lote_id: loteId,
          lote_nome: loteNome,
          curral_nome: curralNome,
          planejado_kg: kgPlanejadoDia,
          real_kg: 0,
          desvio_kg: -kgPlanejadoDia,
          desvio_pct: -100,
          n_tratos: 0,
          leitura_media: null,
          tratador: null,
          status: 'sem_execucao',
          tipo: tipoProg,
        })
      }
    }
  }

  // Lotes com execução mas sem planejamento (não deveria acontecer com registros_oferta_trato,
  // mas mantemos por segurança)
  const lotesRealSemPlanejamento = new Set<string>()
  for (const r of real) {
    const loteId = r.lote_id || '_sem_lote'
    if (!planejado[loteId]) {
      lotesRealSemPlanejamento.add(loteId)
    }
  }

  for (const loteId of lotesRealSemPlanejamento) {
    if (lotesFiltro.length > 0 && !lotesFiltro.includes(loteId)) continue

    for (const r of real) {
      const rLoteId = r.lote_id || '_sem_lote'
      if (rLoteId !== loteId) continue

      const desvioKg = r.kg_ofertado_total - r.kg_planejado_total
      const desvioPct = r.kg_planejado_total > 0 ? (desvioKg / r.kg_planejado_total) * 100 : null

      linhas.push({
        data: r.data,
        lote_id: loteId,
        lote_nome: r.lote_nome ?? 'Sem lote',
        curral_nome: r.curral_nome,
        planejado_kg: r.kg_planejado_total,
        real_kg: r.kg_ofertado_total,
        desvio_kg: desvioKg,
        desvio_pct: desvioPct,
        n_tratos: r.n_tratos,
        leitura_media: r.leitura_media,
        tratador: r.tratadores.join(', ') || null,
        status: classificarDesvio(desvioPct),
        tipo: null,
      })
    }
  }

  // Ordenar por data desc, depois por lote
  linhas.sort((a, b) => {
    if (a.data !== b.data) return b.data.localeCompare(a.data)
    return a.lote_nome.localeCompare(b.lote_nome)
  })

  return linhas
}

export const TOLERANCIA_OK_PCT = 5
export const TOLERANCIA_ALERTA_PCT = 15

function classificarDesvio(desvioPct: number | null): 'ok' | 'alerta' | 'critico' {
  if (desvioPct == null) return 'ok'
  const abs = Math.abs(desvioPct)
  if (abs <= TOLERANCIA_OK_PCT) return 'ok'
  if (abs <= TOLERANCIA_ALERTA_PCT) return 'alerta'
  return 'critico'
}

/**
 * Calcula o resumo agregado por lote para o período.
 */
export function calcularResumoPorLote(
  linhas: LinhaDesvio[],
  dataInicio: string,
  dataFim: string
): ResumoLote[] {
  const diasNoPeriodo = gerarDatasPeriodo(dataInicio, dataFim).length
  const mapa: Record<string, ResumoLote> = {}

  for (const linha of linhas) {
    if (!mapa[linha.lote_id]) {
      mapa[linha.lote_id] = {
        lote_id: linha.lote_id,
        lote_nome: linha.lote_nome,
        planejado_total_kg: 0,
        real_total_kg: 0,
        desvio_total_kg: 0,
        desvio_medio_pct: 0,
        dias_com_registro: 0,
        dias_no_periodo: diasNoPeriodo,
        status: 'ok',
        tipo: linha.tipo,
      }
    }

    const res = mapa[linha.lote_id]
    if (linha.planejado_kg != null) res.planejado_total_kg += linha.planejado_kg
    res.real_total_kg += linha.real_kg
    if (linha.desvio_kg != null) res.desvio_total_kg += linha.desvio_kg
    if (linha.n_tratos > 0) res.dias_com_registro += 1
  }

  // Calcular desvio médio % e status
  for (const res of Object.values(mapa)) {
    if (res.planejado_total_kg > 0) {
      res.desvio_medio_pct = (res.desvio_total_kg / res.planejado_total_kg) * 100
      res.status = classificarDesvio(res.desvio_medio_pct)
    } else if (res.real_total_kg === 0) {
      res.status = 'sem_execucao'
    }
  }

  return Object.values(mapa).sort((a, b) => a.lote_nome.localeCompare(b.lote_nome))
}

// ---------------------------------------------------------------------------
// Acompanhamento de horários
// ---------------------------------------------------------------------------

export interface LinhaHorario {
  data: string // YYYY-MM-DD
  lote_id: string
  lote_nome: string
  curral_nome: string | null
  ordem_trato: number
  horario_sugerido: string | null // HH:MM
  horario_real: string | null // HH:MM (timezone da fazenda)
  desvio_min: number | null // minutos de desvio (positivo = atraso, negativo = adianto)
  status: 'ok' | 'alerta' | 'critico' | 'sem_horario'
  tipo: TipoProgramacao | null
}

export interface ResumoHorario {
  total_tratos: number
  tratos_com_horario: number
  tratos_no_horario: number // desvio até 15 min
  tratos_atraso_leve: number // 15-30 min
  tratos_atraso_grave: number // > 30 min
  desvio_medio_min: number | null
  pior_desvio_min: number | null
}

export const TOLERANCIA_OK_MIN = 15
export const TOLERANCIA_ALERTA_MIN = 30

function classificarDesvioHorario(desvioMin: number | null): LinhaHorario['status'] {
  if (desvioMin == null) return 'sem_horario'
  const abs = Math.abs(desvioMin)
  if (abs <= TOLERANCIA_OK_MIN) return 'ok'
  if (abs <= TOLERANCIA_ALERTA_MIN) return 'alerta'
  return 'critico'
}

/**
 * Detalhe por trato individual, para expansão na tabela de acompanhamento.
 * Mostra o desvio de cada trato e revela padrões de compensação entre tratos.
 */
export interface DetalheTratoLote {
  data: string
  lote_id: string
  ordem_trato: number
  horario_sugerido: string | null
  horario_real: string | null
  kg_planejado: number
  kg_real: number
  desvio_kg: number
  desvio_pct: number | null
  leitura_cocho: number | null
  tratador: string | null
}

/**
 * Busca registros de oferta de trato individuais (não agregados) por lote.
 * Retorna cada trato separadamente para mostrar o padrão de distribuição ao expandir um lote.
 */
export async function fetchDetalheTratosPorLote(
  fazendaId: string,
  dataInicio: string,
  dataFim: string,
  lotesFiltro: string[] = []
): Promise<Record<string, DetalheTratoLote[]>> {
  const dataFimNext = new Date(dataFim + 'T00:00:00')
  dataFimNext.setDate(dataFimNext.getDate() + 1)
  const dataFimExclusive = dataFimNext.toISOString().substring(0, 10)

  let query = supabase
    .from('registros_oferta_trato')
    .select(`
      data,
      lote_id,
      ordem_trato,
      kg_planejado,
      kg_ofertado_real,
      leitura_cocho_nota,
      nome_usuario,
      programacao_id
    `)
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .gte('data', dataInicio)
    .lt('data', dataFimExclusive)
    .order('data', { ascending: true })
    .order('ordem_trato', { ascending: true })

  if (lotesFiltro.length > 0) {
    query = query.in('lote_id', lotesFiltro)
  }

  const { data, error } = await query
  if (error) throw error
  if (!data) return {}

  // Buscar timezone da fazenda para converter o timestamp real do registro
  const { data: fazenda } = await supabase
    .from('fazendas')
    .select('timezone')
    .eq('id', fazendaId)
    .single()
  const timezone = fazenda?.timezone || 'America/Cuiaba'

  const programacaoIds = [...new Set(
    data.map((r: any) => r.programacao_id).filter(Boolean)
  )]
  const horariosMapa: Record<string, string | null> = {}
  if (programacaoIds.length > 0) {
    const { data: percentuais } = await supabase
      .from('programacao_tratos_percentuais')
      .select('programacao_id, ordem_trato, horario_sugerido')
      .in('programacao_id', programacaoIds)
    for (const p of percentuais || []) {
      horariosMapa[`${p.programacao_id}|${p.ordem_trato}`] = p.horario_sugerido || null
    }
  }

  const mapa: Record<string, DetalheTratoLote[]> = {}
  for (const r of data as any[]) {
    const loteId = r.lote_id
    if (!loteId) continue
    const dataRaw = String(r.data)
    const dataDia = dataRaw.substring(0, 10)
    const planejado = Number(r.kg_planejado) || 0
    const real = Number(r.kg_ofertado_real) || 0
    const desvio = real - planejado

    // Converter timestamp UTC para horário local da fazenda
    let horarioReal: string | null = null
    const horaUtc = dataRaw.substring(11, 19)
    if (horaUtc && horaUtc !== '00:00:00') {
      const dataObj = new Date(dataRaw)
      const localStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(dataObj)
      horarioReal = localStr
    }

    if (!mapa[loteId]) mapa[loteId] = []
    mapa[loteId].push({
      data: dataDia,
      lote_id: loteId,
      ordem_trato: r.ordem_trato,
      horario_sugerido: r.programacao_id
        ? horariosMapa[`${r.programacao_id}|${r.ordem_trato}`]?.substring(0, 5) ?? null
        : null,
      horario_real: horarioReal,
      kg_planejado: planejado,
      kg_real: real,
      desvio_kg: desvio,
      desvio_pct: planejado > 0 ? (desvio / planejado) * 100 : null,
      leitura_cocho: r.leitura_cocho_nota != null ? Number(r.leitura_cocho_nota) : null,
      tratador: r.nome_usuario || null,
    })
  }

  return mapa
}

/**
 * Busca registros de oferta de trato com horário sugerido, para análise de pontualidade.
 * Compara o horário real do registro (convertido para o timezone da fazenda) com o
 * horario_sugerido da programação_tratos_percentuais.
 *
 * Registros com data exatamente à meia-noite (00:00:00) são descartados, pois indicam
 * registros antigos ou importados sem timestamp preciso.
 */
export async function fetchHorariosTratos(
  fazendaId: string,
  dataInicio: string,
  dataFim: string,
  lotesFiltro: string[] = []
): Promise<LinhaHorario[]> {
  const dataFimNext = new Date(dataFim + 'T00:00:00')
  dataFimNext.setDate(dataFimNext.getDate() + 1)
  const dataFimExclusive = dataFimNext.toISOString().substring(0, 10)

  let query = supabase
    .from('registros_oferta_trato')
    .select(`
      data,
      ordem_trato,
      lote_id,
      curral_id,
      programacao_id,
      lotes (nome),
      currais (nome)
    `)
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .gte('data', dataInicio)
    .lt('data', dataFimExclusive)
    .order('data', { ascending: false })

  if (lotesFiltro.length > 0) {
    query = query.in('lote_id', lotesFiltro)
  }

  const { data: registros, error } = await query
  if (error) throw error
  if (!registros || registros.length === 0) return []

  // Buscar timezone da fazenda
  const { data: fazenda } = await supabase
    .from('fazendas')
    .select('timezone')
    .eq('id', fazendaId)
    .single()

  const timezone = fazenda?.timezone || 'America/Cuiaba'

  // Coletar programacao_ids únicos para buscar horarios sugeridos
  const programacaoIds = [...new Set(
    registros
      .map((r: any) => r.programacao_id)
      .filter((id: any) => id != null)
  )]

  // Buscar horários sugeridos e tipos de programação
  let horariosMapa: Record<string, string | null> = {} // chave: "programacao_id|ordem_trato" -> horario
  let tiposMapa: Record<string, TipoProgramacao | null> = {} // programacao_id -> tipo
  if (programacaoIds.length > 0) {
    const [percentuaisRes, progsRes] = await Promise.all([
      supabase
        .from('programacao_tratos_percentuais')
        .select('programacao_id, ordem_trato, horario_sugerido')
        .in('programacao_id', programacaoIds),
      supabase
        .from('programacao_tratos')
        .select('id, tipo')
        .in('id', programacaoIds),
    ])

    if (percentuaisRes.data) {
      for (const p of percentuaisRes.data) {
        horariosMapa[`${p.programacao_id}|${p.ordem_trato}`] = p.horario_sugerido || null
      }
    }

    if (progsRes.data) {
      for (const p of progsRes.data) {
        tiposMapa[p.id] = p.tipo as TipoProgramacao
      }
    }
  }

  const linhas: LinhaHorario[] = []

  for (const r of registros as any[]) {
    const dataRaw = r.data as string
    // Descartar registros sem timestamp preciso (meia-noite exata)
    const horaUtc = dataRaw.substring(11, 19)
    if (horaUtc === '00:00:00') continue

    const loteId = r.lote_id
    if (!loteId) continue

    const loteNome = (r.lotes as any)?.nome ?? '—'
    const curralNome = (r.currais as any)?.nome ?? null
    const ordemTrato = r.ordem_trato

    // Horário sugerido
    const horarioSugerido = r.programacao_id
      ? horariosMapa[`${r.programacao_id}|${ordemTrato}`] ?? null
      : null

    // Converter data UTC para horário local da fazenda
    // Usamos Intl.DateTimeFormat para respeitar o timezone
    const dataObj = new Date(dataRaw)
    const dataLocalStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dataObj)

    // Parse do formato pt-BR: "dd/MM/yyyy, HH:mm"
    const match = dataLocalStr.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/)
    if (!match) continue

    const [, dia, mes, ano, horaLocal, minLocal] = match
    const dataDia = `${ano}-${mes}-${dia}`
    const horarioReal = `${horaLocal}:${minLocal}`

    // Calcular desvio em minutos
    let desvioMin: number | null = null
    if (horarioSugerido) {
      const [hSug, mSug] = horarioSugerido.substring(0, 5).split(':').map(Number)
      const [hReal, mReal] = horarioReal.split(':').map(Number)
      const minutosSugerido = hSug * 60 + mSug
      const minutosReal = hReal * 60 + mReal
      desvioMin = minutosReal - minutosSugerido
    }

    linhas.push({
      data: dataDia,
      lote_id: loteId,
      lote_nome: loteNome,
      curral_nome: curralNome,
      ordem_trato: ordemTrato,
      horario_sugerido: horarioSugerido ? horarioSugerido.substring(0, 5) : null,
      horario_real: horarioReal,
      desvio_min: desvioMin,
      status: classificarDesvioHorario(desvioMin),
      tipo: r.programacao_id ? tiposMapa[r.programacao_id] ?? null : null,
    })
  }

  return linhas
}

/**
 * Calcula métricas resumidas de pontualidade a partir das linhas de horário.
 */
export function calcularResumoHorarios(linhas: LinhaHorario[]): ResumoHorario {
  const tratosComHorario = linhas.filter((l) => l.desvio_min != null)
  const total = linhas.length

  if (tratosComHorario.length === 0) {
    return {
      total_tratos: total,
      tratos_com_horario: 0,
      tratos_no_horario: 0,
      tratos_atraso_leve: 0,
      tratos_atraso_grave: 0,
      desvio_medio_min: null,
      pior_desvio_min: null,
    }
  }

  const desvios = tratosComHorario.map((l) => l.desvio_min!)
  const desvioMedio = desvios.reduce((s, d) => s + d, 0) / desvios.length
  const piorDesvio = desvios.reduce((p, d) => (Math.abs(d) > Math.abs(p) ? d : p), 0)

  return {
    total_tratos: total,
    tratos_com_horario: tratosComHorario.length,
    tratos_no_horario: tratosComHorario.filter((l) => l.status === 'ok').length,
    tratos_atraso_leve: tratosComHorario.filter((l) => l.status === 'alerta').length,
    tratos_atraso_grave: tratosComHorario.filter((l) => l.status === 'critico').length,
    desvio_medio_min: Math.round(desvioMedio),
    pior_desvio_min: Math.round(piorDesvio),
  }
}

export interface LinhaFabricaAcompanhamento {
  data: string
  tipo: TipoProgramacao
  ordem_trato: number
  formulacao_id: string
  formulacao_nome: string
  vagao_nome: string | null
  previsto_kg: number
  produzido_kg: number
  distribuido_kg: number
  saldo_kg: number
  status: 'nao_produzido' | 'parcial' | 'concluido' | 'produzido_sem_distribuicao' | 'distribuido_sem_fabricacao'
}

function dataSeguinte(data: string): string {
  const date = new Date(`${data}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Concilia produção da Fábrica com distribuição por dieta e trato.
 * O planejamento é derivado da programação vigente; quando existe produção,
 * total_previsto da Fábrica tem precedência por refletir ajustes do dia.
 */
export async function fetchFabricaAcompanhamento(
  fazendaId: string,
  dataInicio: string,
  dataFim: string,
  lotesFiltro: string[] = []
): Promise<LinhaFabricaAcompanhamento[]> {
  const dataFimExclusive = dataSeguinte(dataFim)
  const [progsRes, fabricaRes, distribuicaoRes] = await Promise.all([
    supabase
      .from('programacao_tratos')
      .select('id, tipo, quantidade_tratos, data_inicio, data_fim')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true),
    supabase
      .from('registros_fabrica_confinamento')
      .select('data, ordem_trato, tipo, formulacao_id, vagao_id, total_previsto, total_produzido, concluido, formulacoes(nome), vagoes(nome)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .gte('data', dataInicio)
      .lt('data', dataFimExclusive),
    supabase
      .from('registros_oferta_trato')
      .select('data, ordem_trato, kg_ofertado_real, lote_id, programacao_id')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .gte('data', dataInicio)
      .lt('data', dataFimExclusive),
  ])

  if (progsRes.error) throw progsRes.error
  if (fabricaRes.error) throw fabricaRes.error
  if (distribuicaoRes.error) throw distribuicaoRes.error

  const programas = (progsRes.data || []) as any[]
  const programacaoIds = programas.map((programa) => programa.id)
  const curraisRes = programacaoIds.length > 0
    ? await supabase
      .from('programacao_tratos_currais')
      .select('programacao_id, lote_id, kg_mn_dia')
      .in('programacao_id', programacaoIds)
    : { data: [], error: null }
  if (curraisRes.error) throw curraisRes.error

  const loteIds = [...new Set((curraisRes.data || []).map((curral: any) => curral.lote_id).filter(Boolean))]
  const categoriasRes = loteIds.length > 0
    ? await supabase
      .from('lote_categorias')
      .select('lote_id, formulacao_id, formulacoes(nome)')
      .in('lote_id', loteIds)
      .eq('ativo', true)
      .not('formulacao_id', 'is', null)
    : { data: [], error: null }
  if (categoriasRes.error) throw categoriasRes.error

  const categoriaPorLote = new Map<string, { id: string; nome: string }>()
  for (const categoria of (categoriasRes.data || []) as any[]) {
    if (categoria.lote_id && categoria.formulacao_id && !categoriaPorLote.has(categoria.lote_id)) {
      categoriaPorLote.set(categoria.lote_id, {
        id: categoria.formulacao_id,
        nome: categoria.formulacoes?.nome || categoria.formulacao_id,
      })
    }
  }

  const formulacoesPermitidas = lotesFiltro.length > 0
    ? new Set(lotesFiltro.map((id) => categoriaPorLote.get(id)?.id).filter(Boolean) as string[])
    : null
  const porChave = new Map<string, LinhaFabricaAcompanhamento>()
  const chave = (data: string, tipo: string, formulacaoId: string, ordem: number) =>
    `${data}|${tipo}|${formulacaoId}|${ordem}`

  const adicionarPlanejamento = (
    data: string,
    tipo: TipoProgramacao,
    formulacao: { id: string; nome: string },
    ordem: number,
    previsto: number
  ) => {
    if (formulacoesPermitidas && !formulacoesPermitidas.has(formulacao.id)) return
    const key = chave(data, tipo, formulacao.id, ordem)
    const atual = porChave.get(key)
    if (atual) {
      atual.previsto_kg += previsto
      atual.saldo_kg = Math.max(0, atual.previsto_kg - atual.produzido_kg)
      return
    }
    porChave.set(key, {
      data,
      tipo,
      ordem_trato: ordem,
      formulacao_id: formulacao.id,
      formulacao_nome: formulacao.nome,
      vagao_nome: null,
      previsto_kg: previsto,
      produzido_kg: 0,
      distribuido_kg: 0,
      saldo_kg: previsto,
      status: 'nao_produzido',
    })
  }

  const percentuaisPorProg = new Map<string, any[]>()
  for (const prog of programas) {
    const { data: percentuais } = await supabase
      .from('programacao_tratos_percentuais')
      .select('ordem_trato, percentual')
      .eq('programacao_id', prog.id)
    percentuaisPorProg.set(prog.id, percentuais || [])

    const { data: currais } = await supabase
      .from('programacao_tratos_currais')
      .select('lote_id, kg_mn_dia')
      .eq('programacao_id', prog.id)
    for (const data of gerarDatasPeriodo(dataInicio, dataFim)) {
      if (data < prog.data_inicio || data > prog.data_fim) continue
      for (const curral of currais || []) {
        if (!curral.lote_id || (lotesFiltro.length > 0 && !lotesFiltro.includes(curral.lote_id))) continue
        const formulacao = categoriaPorLote.get(curral.lote_id)
        if (!formulacao) continue
        for (const percentual of percentuaisPorProg.get(prog.id) || []) {
          adicionarPlanejamento(
            data,
            prog.tipo as TipoProgramacao,
            formulacao,
            percentual.ordem_trato,
            (Number(curral.kg_mn_dia) || 0) * (Number(percentual.percentual) || 0) / 100
          )
        }
      }
    }
  }

  const tipoPorProg = new Map(programas.map((p) => [p.id, p.tipo as TipoProgramacao]))
  for (const registro of (fabricaRes.data || []) as any[]) {
    const data = String(registro.data).slice(0, 10)
    if (formulacoesPermitidas && !formulacoesPermitidas.has(registro.formulacao_id)) continue
    const formulacaoNome = registro.formulacoes?.nome || registro.formulacao_id
    const key = chave(data, registro.tipo, registro.formulacao_id, registro.ordem_trato)
    const atual = porChave.get(key) || {
      data,
      tipo: registro.tipo as TipoProgramacao,
      ordem_trato: registro.ordem_trato,
      formulacao_id: registro.formulacao_id,
      formulacao_nome: formulacaoNome,
      vagao_nome: registro.vagoes?.nome || null,
      previsto_kg: 0,
      produzido_kg: 0,
      distribuido_kg: 0,
      saldo_kg: 0,
      status: 'nao_produzido' as const,
    }
    atual.previsto_kg = Number(registro.total_previsto) || atual.previsto_kg
    atual.produzido_kg += Number(registro.total_produzido) || 0
    atual.vagao_nome = registro.vagoes?.nome || atual.vagao_nome
    porChave.set(key, atual)
  }

  for (const registro of (distribuicaoRes.data || []) as any[]) {
    const formulacao = categoriaPorLote.get(registro.lote_id)
    const tipo = tipoPorProg.get(registro.programacao_id)
    if (!formulacao || !tipo || (formulacoesPermitidas && !formulacoesPermitidas.has(formulacao.id))) continue
    const key = chave(String(registro.data).slice(0, 10), tipo, formulacao.id, registro.ordem_trato)
    const atual = porChave.get(key)
    if (atual) atual.distribuido_kg += Number(registro.kg_ofertado_real) || 0
  }

  return Array.from(porChave.values()).map((linha) => {
    linha.saldo_kg = Math.max(0, linha.previsto_kg - linha.produzido_kg)
    if (linha.produzido_kg <= 0 && linha.distribuido_kg > 0) linha.status = 'distribuido_sem_fabricacao'
    else if (linha.produzido_kg > 0 && linha.distribuido_kg <= 0) linha.status = 'produzido_sem_distribuicao'
    else if (linha.produzido_kg >= linha.previsto_kg - 0.5) linha.status = 'concluido'
    else if (linha.produzido_kg > 0) linha.status = 'parcial'
    else linha.status = 'nao_produzido'
    return linha
  }).sort((a, b) => `${b.data}|${a.formulacao_nome}|${a.ordem_trato}`.localeCompare(`${a.data}|${b.formulacao_nome}|${b.ordem_trato}`))
}
