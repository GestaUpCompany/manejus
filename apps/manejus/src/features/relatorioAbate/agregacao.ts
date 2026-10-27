// Montagem do histórico de um lote até a saída por Abate/Venda. Lógica pura: recebe o JSON da RPC
// get_relatorio_lote_ciclo_vida, as saídas e os históricos extras já convertidos para datas do fuso da fazenda.

export type TipoSaida = 'Abate' | 'Venda'

export interface SaidaLote {
  loteId: string
  data: string
  tipo: TipoSaida
  cabecas: number
  categoria: string | null
}

export type TipoEvento = 'criacao' | 'entrada' | 'categoria' | 'pasto' | 'dieta' | 'morte' | 'movimentacao' | 'abate' | 'venda'

export interface EventoLinhaTempo {
  data: string
  tipo: TipoEvento
  titulo: string
  detalhe: string
}

export interface CategoriaHistorico {
  categoria: string
  inicio: string
  fim: string | null
  cabecasInicio: number | null
  cabecasFim: number | null
  pesoEntradaKg: number | null
  pesoSaidaKg: number | null
  gmdKgDia: number | null
}

export type TipoLocal = 'Pasto' | 'Curral' | 'Módulo'

export interface OcupacaoHistorico {
  tipo: TipoLocal
  local: string
  entrada: string
  saida: string | null
  dias: number | null
  cabecasEntrada: number | null
  cabecasSaida: number | null
  pesoEntradaKg: number | null
  pesoSaidaKg: number | null
}

export interface DietaHistorico {
  nome: string
  inicio: string
  fim: string | null
}

export interface DietaVersao {
  dieta: string
  versao: number
  inicio: string
  fim: string | null
  origem: string
  motivo: string | null
  insumos: string[]
}

export interface MortesPorCausa {
  causa: string
  total: number
}

export type OrigemConsumo = 'Suplementação' | 'Confinamento'

export interface ConsumoMensal {
  mes: string
  origem: OrigemConsumo
  registros: number
  percentPv: number | null
  kgMs: number | null
  custoCabDia: number | null
  kgOfertadoMn: number | null
  kgConsumidoMn: number | null
}

export type OrigemPeso = 'Entrada' | 'Pesagem' | 'Saída' | 'Atual'

export interface PontoPeso {
  data: string
  categoria: string
  origem: OrigemPeso
  pesoKg: number
  animais: number | null
  dias: number | null
  gmdPeriodo: number | null
  gmdAcumulado: number | null
}

export interface SeriePeso {
  categoria: string
  pontos: PontoPeso[]
}

export interface IndicadoresAbate {
  cabecasSaidas: number
  cabecasAbate: number
  cabecasVenda: number
  diasCiclo: number
  totalMortes: number
  totalPesagens: number
  pesoEntradaKg: number | null
  pesoFinalKg: number | null
  ganhoKgCab: number | null
  gmdKgDia: number | null
  custoMedioCabDia: number | null
}

export interface LoteAbate {
  loteId: string
  nome: string
  ativo: boolean
  sistemaProducao: string | null
  inicio: string
  fim: string
  ultimaSaida: string | null
  saidas: SaidaLote[]
  indicadores: IndicadoresAbate
  categorias: CategoriaHistorico[]
  evolucaoPeso: SeriePeso[]
  ocupacao: OcupacaoHistorico[]
  dietas: DietaHistorico[]
  versoesDieta: DietaVersao[]
  mortesPorCausa: MortesPorCausa[]
  consumo: ConsumoMensal[]
  eventos: EventoLinhaTempo[]
  avisos: string[]
}

export interface ResumoAbate {
  lotes: number
  cabecasSaidas: number
  cabecasAbate: number
  cabecasVenda: number
  cicloMedioDias: number | null
}

export interface CategoriaAtivaRpc {
  categoria: string | null
  quant_atual: number | null
  peso_vivo_atual_kg: number | null
  peso_entrada_kg: number | null
}

// Formato do que a RPC devolve (só os campos usados aqui)
export interface CicloVidaRpc {
  success?: boolean
  error?: string
  cadastro?: { nome?: string; ativo?: boolean; created_at?: string; sistema_producao?: string | null } | null
  estado_atual?: { peso_medio_ponderado?: number | null; categorias_ativas?: CategoriaAtivaRpc[] } | null
  cronologia_categorias?: {
    transicoes?: Array<{
      data_transicao: string
      categoria_origem: string | null
      categoria_destino: string | null
      peso_na_transicao_kg: number | null
    }>
    categorias_encerradas?: Array<{
      categoria: string | null
      quant_inicial: number | null
      quant_atual: number | null
      peso_entrada_kg: number | null
      peso_vivo_atual_kg: number | null
      data_inicio: string | null
      data_fim: string | null
    }>
  } | null
  historico_nutricional?: Array<{ nome: string | null; formulacao_nome: string | null; data_inicio: string | null; data_fim: string | null }> | null
  linha_tempo_ocupacao?: Array<{
    pasto_nome: string | null
    data_entrada: string | null
    data_saida: string | null
    cabecas_entrada: number | null
    cabecas_saida: number | null
    peso_vivo_medio_entrada_kg?: number | null
    peso_vivo_medio_saida_kg?: number | null
  }> | null
  movimentacoes?: Array<{
    data: string
    tipo: 'entrada' | 'saida'
    lote_origem_nome: string | null
    lote_destino_nome: string | null
    numero_cabecas: number | null
    categoria: string | null
    motivo_movimentacao: string | null
    subtipo: string | null
    fazenda_destino_nome: string | null
  }> | null
  mortalidade?: { total?: number; linhas?: Array<{ data: string; causa_morte: string | null }> } | null
  consumo_suplementacao?: Array<{
    data: string
    consumo_medio_geral_percent_pv: number | null
    consumo_medio_geral_kg_ms: number | null
    custo_medio_reais_cab_dia: number | null
  }> | null
  indicadores_consolidados?: { peso_entrada_medio_kg?: number | null } | null
}

// Históricos que não vêm da RPC (pesagens, currais, módulos, versões da dieta e consumo do confinamento)
export interface PesagemDia {
  data: string
  categoria: string | null
  pesoMedioKg: number
  animais: number
}

export interface LocalBruto {
  tipo: 'Curral' | 'Módulo'
  local: string
  entrada: string
  saida: string | null
  cabecasEntrada: number | null
  cabecasSaida: number | null
  pesoEntradaKg: number | null
  pesoSaidaKg: number | null
}

export interface ConsumoConfinamentoDia {
  data: string
  kgOfertadoMn: number | null
  kgConsumidoMn: number | null
  kgMsCabDia: number | null
  percentPv: number | null
  custoCabDia: number | null
  diaIncompleto: boolean
}

export interface ExtrasLote {
  pesagens?: PesagemDia[]
  locais?: LocalBruto[]
  versoesDieta?: DietaVersao[]
  consumoConfinamento?: ConsumoConfinamentoDia[]
  avisos?: string[]
}

export function tipoSaida(motivo: string | null | undefined, subtipo: string | null | undefined): TipoSaida | null {
  if (motivo === 'Abate') return 'Abate'
  if (motivo === 'Saída' && subtipo === 'Venda') return 'Venda'
  return null
}

const dia = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null)

export function diasEntre(inicio: string, fim: string): number {
  const ms = Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

const arred = (n: number, casas = 2) => Number(n.toFixed(casas))

const media = (valores: Array<number | null>): number | null => {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

const soma = (valores: Array<number | null>): number | null => {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) : null
}

const chaveCategoria = (c: string | null | undefined) => (c ?? '').trim().toLowerCase()

// Peso médio das categorias ponderado pelas cabeças que saíram em cada uma (a RPC não pondera lote já zerado)
function ponderarPorSaidas(categorias: CategoriaHistorico[], saidas: SaidaLote[], campo: 'pesoEntradaKg' | 'pesoSaidaKg'): number | null {
  const cabecas = new Map<string, number>()
  for (const s of saidas) cabecas.set(chaveCategoria(s.categoria), (cabecas.get(chaveCategoria(s.categoria)) ?? 0) + s.cabecas)
  let acumulado = 0
  let total = 0
  for (const c of categorias) {
    const peso = c[campo]
    const w = cabecas.get(chaveCategoria(c.categoria))
    if (peso == null || !w) continue
    acumulado += peso * w
    total += w
  }
  return total > 0 ? acumulado / total : null
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

const ORDEM_TIPO: Record<TipoEvento, number> = {
  criacao: 0,
  entrada: 1,
  categoria: 2,
  pasto: 3,
  dieta: 4,
  movimentacao: 5,
  morte: 6,
  abate: 7,
  venda: 7,
}

const ORDEM_ORIGEM_PESO: Record<OrigemPeso, number> = { Entrada: 0, Pesagem: 1, Saída: 2, Atual: 2 }

// Evolução do peso por categoria: peso de entrada, cada pesagem (média do dia) e peso de saída, com o GMD de cada trecho
export function montarEvolucaoPeso(categorias: CategoriaHistorico[], pesagens: PesagemDia[], inicio: string, fim: string, ativo: boolean): SeriePeso[] {
  const series = new Map<string, { categoria: string; pontos: Array<Omit<PontoPeso, 'dias' | 'gmdPeriodo' | 'gmdAcumulado'>> }>()
  const serie = (nome: string) => {
    const chave = chaveCategoria(nome)
    const atual = series.get(chave) ?? { categoria: nome, pontos: [] }
    series.set(chave, atual)
    return atual
  }
  for (const c of categorias) {
    const s = serie(c.categoria)
    if (c.pesoEntradaKg != null) s.pontos.push({ data: c.inicio, categoria: c.categoria, origem: 'Entrada', pesoKg: c.pesoEntradaKg, animais: c.cabecasInicio })
    if (c.pesoSaidaKg != null) {
      const emCurso = c.fim == null
      s.pontos.push({ data: c.fim ?? fim, categoria: c.categoria, origem: emCurso && ativo ? 'Atual' : 'Saída', pesoKg: c.pesoSaidaKg, animais: emCurso && ativo ? c.cabecasFim : null })
    }
  }
  for (const p of pesagens) {
    if (p.data < inicio || (!ativo && p.data > fim)) continue
    const s = serie(p.categoria ?? 'Sem categoria')
    s.pontos.push({ data: p.data, categoria: s.categoria, origem: 'Pesagem', pesoKg: p.pesoMedioKg, animais: p.animais })
  }
  return [...series.values()]
    .map((s) => {
      const ordenados = [...s.pontos].sort((a, b) => a.data.localeCompare(b.data) || ORDEM_ORIGEM_PESO[a.origem] - ORDEM_ORIGEM_PESO[b.origem])
      const primeiro = ordenados[0]
      const pontos: PontoPeso[] = ordenados.map((p, i) => {
        const anterior = ordenados[i - 1]
        const dias = anterior ? diasEntre(anterior.data, p.data) : null
        const diasTotal = primeiro ? diasEntre(primeiro.data, p.data) : 0
        return {
          ...p,
          dias,
          gmdPeriodo: anterior && dias ? arred((p.pesoKg - anterior.pesoKg) / dias, 3) : null,
          gmdAcumulado: i > 0 && diasTotal > 0 ? arred((p.pesoKg - primeiro.pesoKg) / diasTotal, 3) : null,
        }
      })
      return { categoria: s.categoria, pontos }
    })
    .filter((s) => s.pontos.length > 0)
    .sort((a, b) => a.pontos[0].data.localeCompare(b.pontos[0].data) || a.categoria.localeCompare(b.categoria, 'pt-BR'))
}

function consumoMensal(ciclo: CicloVidaRpc, confinamento: ConsumoConfinamentoDia[], ativo: boolean, fim: string): ConsumoMensal[] {
  const dentro = (d: string) => ativo || d.slice(0, 10) <= fim
  const supl = new Map<string, NonNullable<CicloVidaRpc['consumo_suplementacao']>>()
  for (const r of ciclo.consumo_suplementacao ?? []) {
    if (!dentro(r.data)) continue
    const mes = r.data.slice(0, 7)
    supl.set(mes, [...(supl.get(mes) ?? []), r])
  }
  const conf = new Map<string, ConsumoConfinamentoDia[]>()
  for (const r of confinamento) {
    if (!dentro(r.data)) continue
    const mes = r.data.slice(0, 7)
    conf.set(mes, [...(conf.get(mes) ?? []), r])
  }
  const linhas: ConsumoMensal[] = []
  for (const [mes, rs] of supl) {
    linhas.push({
      mes,
      origem: 'Suplementação',
      registros: rs.length,
      percentPv: media(rs.map((r) => r.consumo_medio_geral_percent_pv)),
      kgMs: media(rs.map((r) => r.consumo_medio_geral_kg_ms)),
      custoCabDia: media(rs.map((r) => r.custo_medio_reais_cab_dia)),
      kgOfertadoMn: null,
      kgConsumidoMn: null,
    })
  }
  for (const [mes, rs] of conf) {
    // Dia incompleto (tratos faltando) distorce a média: fica fora dela, mas entra nos totais
    const completos = rs.filter((r) => !r.diaIncompleto)
    linhas.push({
      mes,
      origem: 'Confinamento',
      registros: rs.length,
      percentPv: media(completos.map((r) => r.percentPv)),
      kgMs: media(completos.map((r) => r.kgMsCabDia)),
      custoCabDia: media(completos.map((r) => r.custoCabDia)),
      kgOfertadoMn: soma(rs.map((r) => r.kgOfertadoMn)),
      kgConsumidoMn: soma(rs.map((r) => r.kgConsumidoMn)),
    })
  }
  return linhas.sort((a, b) => a.mes.localeCompare(b.mes) || a.origem.localeCompare(b.origem))
}

export function montarLoteAbate(loteId: string, ciclo: CicloVidaRpc, saidas: SaidaLote[], hoje: string, extras: ExtrasLote = {}): LoteAbate {
  const nome = ciclo.cadastro?.nome ?? 'Lote sem nome'
  const ativo = ciclo.cadastro?.ativo !== false
  const saidasOrd = [...saidas].sort((a, b) => a.data.localeCompare(b.data))
  const ultimaSaida = saidasOrd.length ? saidasOrd[saidasOrd.length - 1].data : null
  // Lote desativado termina na última saída; lote ativo (venda parcial) segue até hoje
  const fim = ativo || !ultimaSaida ? hoje : ultimaSaida

  const encerradas = ciclo.cronologia_categorias?.categorias_encerradas ?? []
  const transicoes = ciclo.cronologia_categorias?.transicoes ?? []
  const ocupacaoRpc = ciclo.linha_tempo_ocupacao ?? []
  const movimentacoes = ciclo.movimentacoes ?? []
  const locais = extras.locais ?? []

  const candidatosInicio = [
    dia(ciclo.cadastro?.created_at),
    ...encerradas.map((c) => dia(c.data_inicio)),
    ...ocupacaoRpc.map((o) => dia(o.data_entrada)),
    ...locais.map((l) => dia(l.entrada)),
    ...movimentacoes.filter((m) => m.tipo === 'entrada').map((m) => dia(m.data)),
  ].filter((d): d is string => !!d)
  const inicio = candidatosInicio.length ? candidatosInicio.reduce((a, b) => (a < b ? a : b)) : fim

  const categorias: CategoriaHistorico[] = encerradas.map((c) => {
    const ini = dia(c.data_inicio) ?? inicio
    const f = dia(c.data_fim)
    const ganho = c.peso_vivo_atual_kg != null && c.peso_entrada_kg != null ? c.peso_vivo_atual_kg - c.peso_entrada_kg : null
    const dias = f ? diasEntre(ini, f) : 0
    return {
      categoria: c.categoria ?? 'Sem categoria',
      inicio: ini,
      fim: f,
      cabecasInicio: c.quant_inicial,
      cabecasFim: c.quant_atual,
      pesoEntradaKg: c.peso_entrada_kg,
      pesoSaidaKg: c.peso_vivo_atual_kg,
      gmdKgDia: ganho != null && dias > 0 ? arred(ganho / dias, 3) : null,
    }
  })
  for (const c of ciclo.estado_atual?.categorias_ativas ?? []) {
    const nomeCat = c.categoria ?? 'Sem categoria'
    const entrou = transicoes.filter((t) => t.categoria_destino === nomeCat).map((t) => dia(t.data_transicao)).filter((d): d is string => !!d)
    // Sem recategorização para ela, vale a primeira entrada da categoria no lote (ex.: apartação); senão, a criação do lote
    const entradas = movimentacoes
      .filter((m) => m.tipo === 'entrada' && chaveCategoria(m.categoria) === chaveCategoria(nomeCat))
      .map((m) => dia(m.data))
      .filter((d): d is string => !!d)
    const ini = entrou.length ? entrou.reduce((a, b) => (a > b ? a : b)) : entradas.length ? entradas.reduce((a, b) => (a < b ? a : b)) : inicio
    const ganho = c.peso_vivo_atual_kg != null && c.peso_entrada_kg != null ? c.peso_vivo_atual_kg - c.peso_entrada_kg : null
    const dias = diasEntre(ini, fim)
    categorias.push({
      categoria: nomeCat,
      inicio: ini,
      fim: ativo ? null : fim,
      cabecasInicio: null,
      cabecasFim: c.quant_atual,
      pesoEntradaKg: c.peso_entrada_kg,
      pesoSaidaKg: c.peso_vivo_atual_kg,
      gmdKgDia: ganho != null && dias > 0 ? arred(ganho / dias, 3) : null,
    })
  }
  categorias.sort((a, b) => a.inicio.localeCompare(b.inicio))

  const ocupacao: OcupacaoHistorico[] = [
    ...ocupacaoRpc.map((o): Omit<LocalBruto, 'tipo'> & { tipo: TipoLocal } => ({
      tipo: 'Pasto',
      local: o.pasto_nome ?? 'Pasto removido',
      entrada: dia(o.data_entrada) ?? inicio,
      saida: dia(o.data_saida),
      cabecasEntrada: o.cabecas_entrada,
      cabecasSaida: o.cabecas_saida,
      pesoEntradaKg: o.peso_vivo_medio_entrada_kg ?? null,
      pesoSaidaKg: o.peso_vivo_medio_saida_kg ?? null,
    })),
    ...locais.map((l) => ({ ...l, entrada: dia(l.entrada) ?? inicio, saida: dia(l.saida) })),
  ]
    .filter((o) => ativo || o.entrada <= fim)
    .map((o): OcupacaoHistorico => ({ ...o, dias: diasEntre(o.entrada, o.saida ?? fim) }))
    .sort((a, b) => a.entrada.localeCompare(b.entrada))

  const dietas: DietaHistorico[] = (ciclo.historico_nutricional ?? [])
    .filter((d) => dia(d.data_inicio))
    .map((d) => ({ nome: d.formulacao_nome ?? d.nome ?? 'Dieta sem nome', inicio: dia(d.data_inicio)!, fim: dia(d.data_fim) }))
  const versoesDieta = [...(extras.versoesDieta ?? [])].sort((a, b) => a.inicio.localeCompare(b.inicio))

  const mortes = (ciclo.mortalidade?.linhas ?? []).filter((m) => ativo || m.data.slice(0, 10) <= fim)
  const porCausa = new Map<string, number>()
  for (const m of mortes) {
    const causa = m.causa_morte ?? 'Não informada'
    porCausa.set(causa, (porCausa.get(causa) ?? 0) + 1)
  }
  const mortesPorCausa = [...porCausa.entries()].map(([causa, total]) => ({ causa, total })).sort((a, b) => b.total - a.total)

  const consumo = consumoMensal(ciclo, extras.consumoConfinamento ?? [], ativo, fim)
  const evolucaoPeso = montarEvolucaoPeso(categorias, extras.pesagens ?? [], inicio, fim, ativo)

  // Eventos: saídas Abate/Venda vêm das consultas próprias; as demais movimentações, da RPC
  const eventos: EventoLinhaTempo[] = [{ data: inicio, tipo: 'criacao', titulo: 'Lote criado', detalhe: nome }]
  for (const m of movimentacoes) {
    if (m.tipo === 'saida' && tipoSaida(m.motivo_movimentacao, m.subtipo)) continue
    const rotulo = m.subtipo ?? m.motivo_movimentacao ?? 'Movimentação'
    const cab = m.numero_cabecas != null ? `${m.numero_cabecas} cab` : ''
    const cat = m.categoria ? ` · ${m.categoria}` : ''
    if (m.tipo === 'entrada') {
      const origem = m.lote_origem_nome ?? m.fazenda_destino_nome
      eventos.push({ data: m.data, tipo: 'entrada', titulo: `Entrada · ${rotulo}`, detalhe: `${cab}${cat}${origem ? ` · de ${origem}` : ''}` })
    } else {
      eventos.push({ data: m.data, tipo: 'movimentacao', titulo: `Saída · ${rotulo}`, detalhe: `${cab}${cat}${m.lote_destino_nome ? ` · para ${m.lote_destino_nome}` : ''}` })
    }
  }
  for (const t of transicoes) {
    eventos.push({
      data: t.data_transicao,
      tipo: 'categoria',
      titulo: `Recategorização · ${t.categoria_origem ?? '—'} → ${t.categoria_destino ?? '—'}`,
      detalhe: t.peso_na_transicao_kg != null ? `${arred(t.peso_na_transicao_kg, 1)} kg/cab` : '',
    })
  }
  for (const o of ocupacao) {
    eventos.push({ data: o.entrada, tipo: 'pasto', titulo: `Entrada em ${o.tipo.toLowerCase()} · ${o.local}`, detalhe: o.cabecasEntrada != null ? `${o.cabecasEntrada} cab` : '' })
  }
  // Com versões da dieta, cada mudança vira evento; sem elas, vale o início de cada plano.
  // Dieta herdada de antes da criação do lote (apartação) aparece no dia da criação, com a data original.
  const inicioDietas = versoesDieta.length
    ? versoesDieta.map((v) => ({ nome: `${v.dieta} · versão ${v.versao}`, inicio: v.inicio, detalhe: v.motivo ?? '' }))
    : dietas.map((d) => ({ nome: d.nome, inicio: d.inicio, detalhe: '' }))
  for (const d of inicioDietas) {
    const herdada = d.inicio < inicio
    eventos.push({ data: herdada ? inicio : d.inicio, tipo: 'dieta', titulo: `Dieta · ${d.nome}`, detalhe: herdada ? `em uso desde ${dataBr(d.inicio)}` : d.detalhe })
  }
  const mortesDia = new Map<string, { data: string; causa: string; total: number }>()
  for (const m of mortes) {
    const causa = m.causa_morte ?? 'Não informada'
    const data = m.data.slice(0, 10)
    const chave = `${data}|${causa}`
    mortesDia.set(chave, { data, causa, total: (mortesDia.get(chave)?.total ?? 0) + 1 })
  }
  for (const m of mortesDia.values()) {
    eventos.push({ data: m.data, tipo: 'morte', titulo: `${m.total} ${m.total === 1 ? 'morte' : 'mortes'}`, detalhe: m.causa })
  }
  for (const s of saidasOrd) {
    eventos.push({
      data: s.data,
      tipo: s.tipo === 'Abate' ? 'abate' : 'venda',
      titulo: s.tipo,
      detalhe: `${s.cabecas} cab${s.categoria ? ` · ${s.categoria}` : ''}`,
    })
  }
  const eventosFinal = eventos
    .map((e) => ({ ...e, data: e.data.slice(0, 10) }))
    .filter((e) => ativo || e.data <= fim)
    .sort((a, b) => a.data.localeCompare(b.data) || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo])

  const cabecasAbate = saidasOrd.filter((s) => s.tipo === 'Abate').reduce((s, x) => s + x.cabecas, 0)
  const cabecasVenda = saidasOrd.filter((s) => s.tipo === 'Venda').reduce((s, x) => s + x.cabecas, 0)
  const diasCiclo = diasEntre(inicio, fim)
  const pesoEntradaKg = ciclo.indicadores_consolidados?.peso_entrada_medio_kg ?? ponderarPorSaidas(categorias, saidasOrd, 'pesoEntradaKg')
  const pesoFinalKg = ciclo.estado_atual?.peso_medio_ponderado ?? ponderarPorSaidas(categorias, saidasOrd, 'pesoSaidaKg')
  const ganhoKgCab = pesoEntradaKg != null && pesoFinalKg != null ? arred(pesoFinalKg - pesoEntradaKg, 1) : null

  return {
    loteId,
    nome,
    ativo,
    sistemaProducao: ciclo.cadastro?.sistema_producao ?? null,
    inicio,
    fim,
    ultimaSaida,
    saidas: saidasOrd,
    indicadores: {
      cabecasSaidas: cabecasAbate + cabecasVenda,
      cabecasAbate,
      cabecasVenda,
      diasCiclo,
      totalMortes: mortes.length,
      totalPesagens: (extras.pesagens ?? []).reduce((s, p) => s + p.animais, 0),
      pesoEntradaKg: pesoEntradaKg != null ? arred(pesoEntradaKg, 1) : null,
      pesoFinalKg: pesoFinalKg != null ? arred(pesoFinalKg, 1) : null,
      ganhoKgCab,
      gmdKgDia: ganhoKgCab != null && diasCiclo > 0 ? arred(ganhoKgCab / diasCiclo, 3) : null,
      custoMedioCabDia: media(consumo.map((c) => c.custoCabDia)),
    },
    categorias,
    evolucaoPeso,
    ocupacao,
    dietas,
    versoesDieta,
    mortesPorCausa,
    consumo,
    eventos: eventosFinal,
    avisos: extras.avisos ?? [],
  }
}

export function resumirLotes(lotes: LoteAbate[]): ResumoAbate {
  const ciclos = lotes.map((l) => l.indicadores.diasCiclo).filter((d) => d > 0)
  return {
    lotes: lotes.length,
    cabecasSaidas: lotes.reduce((s, l) => s + l.indicadores.cabecasSaidas, 0),
    cabecasAbate: lotes.reduce((s, l) => s + l.indicadores.cabecasAbate, 0),
    cabecasVenda: lotes.reduce((s, l) => s + l.indicadores.cabecasVenda, 0),
    cicloMedioDias: ciclos.length ? Math.round(ciclos.reduce((s, d) => s + d, 0) / ciclos.length) : null,
  }
}
