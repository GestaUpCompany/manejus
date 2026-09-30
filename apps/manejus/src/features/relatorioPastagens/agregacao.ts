// Agregações do relatório de Manejo de Pastagens. Funções puras
// compartilhadas entre a página pública (RelatorioPastagensPublico.tsx) e o
// loader do Infográfico Mensal (features/relatorioGeral/loaders.ts), para
// que os dois caminhos produzam o mesmo payload para api/pdf/pastagens.js.
//
// `avaliacao_geral` usa as mesmas 7 chaves e a mesma semântica S/N do
// `diagnosticos` do rodeio (RODEIO_DIAGNOSTICOS do PWA), então a
// classificação de alertas é reutilizada de relatorioRodeio/agregacao.ts.
//
// Fontes:
//  - registros: trocas de pasto (registros_pastagens)
//  - ocupacoes: períodos de ocupação (lote_pasto_historico) que intersectam
//    o intervalo, incluindo ocupações ainda abertas (em_andamento)
//  - pastos_info: cadastro dos pastos (área, espécie, degradação, módulo)

import {
  alertasDoRegistro,
  abreviarNome,
  type AlertaRodeio,
  type DiagnosticosRodeio,
} from '../relatorioRodeio/agregacao'

export type { AlertaRodeio, DiagnosticosRodeio }
export { alertasDoRegistro, abreviarNome }

export interface RegistroPastagem {
  registro_id: string
  data: string
  horario_manejo: string | null
  responsavel: string | null
  manejador: string | null
  nome_usuario: string | null
  lote: string | null
  pasto_saida: string | null
  modulo_saida: string | null
  avaliacao_saida: number | null
  tempo_ocupacao: string | null
  pasto_saida_area_util: number | null
  pasto_saida_especie: string | null
  pasto_entrada: string | null
  modulo_entrada: string | null
  avaliacao_entrada: number | null
  tempo_vedacao: string | null
  pasto_entrada_area_util: number | null
  pasto_entrada_especie: string | null
  vaca: number | null
  touro: number | null
  bezerro: number | null
  boi_magro: number | null
  garrote: number | null
  novilha: number | null
  total_animais: number | null
  gado_contado: string | null
  escore_gado: number | null
  escore_fezes: number | null
  numero_pessoas_manejo: number | null
  equipe_nomes: string[] | null
  avaliacao_geral: DiagnosticosRodeio | null
}

export interface OcupacaoPasto {
  historico_id: string
  lote: string | null
  pasto: string | null
  modulo: string | null
  data_entrada: string
  data_saida: string | null
  em_andamento: boolean
  dias: number | null
  cabecas_entrada: number | null
  cabecas_saida: number | null
  peso_medio_entrada_kg: number | null
  peso_medio_saida_kg: number | null
  taxa_lotacao_ua_ha: number | null
  meta_ocupacao_dias: number | null
  desvio_percent: number | null
}

export interface PastoInfo {
  nome: string
  area_util_ha: number | null
  especie: string | null
  nivel_degradacao: number | null
  modulo: string | null
  meta_ocupacao_dias: number | null
}

export interface DadosRelatorioPastagens {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  pastos_disponiveis: string[]
  lotes_disponiveis: string[]
  responsaveis_disponiveis: string[]
  modulos_disponiveis: string[]
  pastos_info: PastoInfo[]
  registros: RegistroPastagem[]
  ocupacoes: OcupacaoPasto[]
  // Última ocupação encerrada anterior à janela, por pasto (contexto para
  // o cálculo de descanso). Não intersecta o período: usar só para isso.
  ocupacoes_contexto?: OcupacaoPasto[]
}

export const CATEGORIAS_PASTAGENS = [
  { key: 'vaca', label: 'Vacas', short: 'Vac' },
  { key: 'touro', label: 'Touros', short: 'Tou' },
  { key: 'bezerro', label: 'Bezerros', short: 'Bez' },
  { key: 'boi_magro', label: 'Bois magros', short: 'Boi' },
  { key: 'garrote', label: 'Garrotes', short: 'Gar' },
  { key: 'novilha', label: 'Novilhas', short: 'Nov' },
] as const

export interface ItemAlertaPastagem {
  data: string
  trajeto: string
  lote: string
  label: string
  observacao: string
  sanitario: boolean
}

// Lista plana dos alertas do período (avalicao_geral fora do padrão),
// mais recentes primeiro. `trajeto` é "Saída → Entrada" para dar contexto
// de qual manejo gerou o alerta.
export function listaAlertasPastagens(registros: RegistroPastagem[]): ItemAlertaPastagem[] {
  const itens: ItemAlertaPastagem[] = []
  for (const r of registros) {
    for (const a of alertasDoRegistro(r.avaliacao_geral)) {
      itens.push({
        data: r.data,
        trajeto: `${r.pasto_saida || '—'} → ${r.pasto_entrada || '—'}`,
        lote: r.lote || '—',
        label: a.label,
        observacao: a.observacao || '',
        sanitario: a.sanitario,
      })
    }
  }
  return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)))
}

// "Boi 140 · Bez 15": só categorias com cabeças.
export function composicaoPastagem(r: RegistroPastagem): string {
  const partes = CATEGORIAS_PASTAGENS.map((c) => {
    const v = Number(r[c.key]) || 0
    return v > 0 ? `${c.short} ${v}` : null
  }).filter((p): p is string => p !== null)
  return partes.length ? partes.join(' · ') : '—'
}

export function totalAnimaisRegistro(r: RegistroPastagem): number {
  if (r.total_animais != null && !Number.isNaN(Number(r.total_animais))) return Number(r.total_animais)
  return CATEGORIAS_PASTAGENS.reduce((s, c) => s + (Number(r[c.key]) || 0), 0)
}

export interface AgregadoValor {
  label: string
  valor: number
}

export interface FluxoPasto {
  origem: string
  destino: string
  vezes: number
}

export interface PontoSeriePastagens {
  data: string
  data_label: string
  movimentacoes: number
  animais: number
  avaliacao_saida: number | null
  avaliacao_entrada: number | null
}

export interface ResumoPasto {
  nome: string
  modulo: string | null
  area_util_ha: number | null
  entradas: number
  saidas: number
  avaliacao_media: number | null
  ocupacoes: number
  ocupacao_dias_media: number | null
  ua_ha_media: number | null
  desvio_medio_percent: number | null
  alertas: number
}

export interface ResumoLotePastagens {
  nome: string
  movimentacoes: number
  pasto_atual: string | null
  ultima_data: string | null
  ocupacoes: number
  dias_ocupacao_media: number | null
  alertas: number
}

export interface JanelaOcupacao {
  inicio: string
  fim: string
  lote: string | null
  aberta: boolean
}

export interface LinhaMapaOcupacao {
  pasto: string
  barras: JanelaOcupacao[]
}

export interface MapaOcupacao {
  inicio: string
  fim: string
  linhas: LinhaMapaOcupacao[]
  pastosOmitidos: number
}

export interface DegradacaoPasto {
  nome: string
  avaliacao_entrada_media: number | null
  avaliacao_saida_media: number | null
  delta: number | null
  // Quantas avaliações alimentam as médias: 2,0 sobre 1 avaliação é
  // ruído; 2,0 sobre 5 é diagnóstico.
  avaliacoes: number
}

export interface DescansoPasto {
  nome: string
  descanso_medio: number | null
  menor_descanso: number | null
  intervalos: number
}

export interface ResumoPastagens {
  total_movimentacoes: number
  animais_manejados: number
  pastos_utilizados: number
  lotes_movimentados: number
  ocupacao_media_dias: number | null
  taxa_lotacao_media_ua_ha: number | null
  ocupacoes_acima_meta: number
  ocupacoes_em_andamento: number
  avaliacao_saida_media: number | null
  avaliacao_entrada_media: number | null
  escore_gado_medio: number | null
  escore_fezes_medio: number | null
  alertas_sanitarios: number
  pendencias_infra: number
  movimentacoes_com_alerta: number
  frequencia_alertas: AgregadoValor[]
  fluxo: FluxoPasto[]
  por_pasto: ResumoPasto[]
  por_lote: ResumoLotePastagens[]
  serie_diaria: PontoSeriePastagens[]
  degradacao: DegradacaoPasto[]
  descanso: DescansoPasto[]
  // Pastos cadastrados (pastos_info) sem nenhuma ocupação na janela:
  // candidatos a reforma, feno ou entrada no rodízio.
  pastos_sem_uso: number
  // Área pasteável com uso no período vs. cadastrada — o KPI de
  // headline que a contagem de pastos não entrega sozinha.
  area_utilizada_ha: number | null
  area_total_ha: number | null
  area_utilizada_pct: number | null
  insights: string
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

function dataLabel(iso: string): string {
  const partes = iso.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : iso
}

function formatarNumero(valor: number, casas: number): string {
  return valor.toFixed(casas).replace('.', ',')
}

// "1 pasto" / "5 pastos" sem o padrão "(s)" que entrega relatório gerado
// por sistema.
export function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

// Nomes de pasto e lote gravados no histórico/movimentações divergem do
// cadastro em caixa e espaços ("volta de cima A" vs "Volta de Cima A",
// "PV - 01" vs "PV-01"). Resolve cada nome para a forma cadastral via
// pastos_info/lotes_disponiveis; sem correspondência, mantém o original.
export function normalizarNomesPasto<
  R extends { pasto_saida: string | null; pasto_entrada: string | null; lote: string | null },
  O extends { pasto: string | null; lote: string | null },
>(
  registros: R[],
  ocupacoes: O[],
  ocupacoesContexto: O[],
  pastosInfo: { nome: string }[],
  lotesDisponiveis: string[],
): { registros: R[]; ocupacoes: O[]; ocupacoesContexto: O[] } {
  const chave = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ')
  const canonPasto = new Map(pastosInfo.filter((p) => p.nome).map((p) => [chave(p.nome), p.nome]))
  const chaveLote = (n: string) => n.trim().toLowerCase().replace(/\s+/g, '')
  const canonLote = new Map(lotesDisponiveis.filter(Boolean).map((l) => [chaveLote(l), l]))
  const nomePasto = (n: string | null) => (n ? (canonPasto.get(chave(n)) ?? n) : n)
  const nomeLote = (n: string | null) => (n ? (canonLote.get(chaveLote(n)) ?? n) : n)
  return {
    registros: registros.map((r) => ({ ...r, pasto_saida: nomePasto(r.pasto_saida), pasto_entrada: nomePasto(r.pasto_entrada), lote: nomeLote(r.lote) })),
    ocupacoes: ocupacoes.map((o) => ({ ...o, pasto: nomePasto(o.pasto), lote: nomeLote(o.lote) })),
    ocupacoesContexto: ocupacoesContexto.map((o) => ({ ...o, pasto: nomePasto(o.pasto), lote: nomeLote(o.lote) })),
  }
}

export function serieDiariaPastagens(registros: RegistroPastagem[]): PontoSeriePastagens[] {
  const porDia = new Map<string, RegistroPastagem[]>()
  for (const registro of registros) {
    const arr = porDia.get(registro.data) || []
    arr.push(registro)
    porDia.set(registro.data, arr)
  }
  return Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, regs]) => ({
      data,
      data_label: dataLabel(data),
      movimentacoes: regs.length,
      animais: regs.reduce((s, r) => s + totalAnimaisRegistro(r), 0),
      avaliacao_saida: media(regs.map((r) => r.avaliacao_saida).filter((v): v is number => v !== null && v !== undefined)),
      avaliacao_entrada: media(regs.map((r) => r.avaliacao_entrada).filter((v): v is number => v !== null && v !== undefined)),
    }))
}

// Gantt do rotativo: uma linha por pasto com as janelas de ocupação,
// ordenado do mais usado (mais dias com gado) para o menos usado, que é
// a leitura que interessa no manejo rotativo. Ocupações abertas terminam
// na data de referência (fim do período ou hoje) e saída < entrada (erro
// de fonte) é comprimida num ponto de um dia.
export function mapaOcupacaoPorPasto(
  ocupacoes: OcupacaoPasto[],
  fimReferencia: string | null,
  maxPastos = 14,
): MapaOcupacao {
  const porPasto = new Map<string, JanelaOcupacao[]>()
  let min = ''
  let max = ''
  for (const o of ocupacoes) {
    if (!o.pasto || !o.data_entrada) continue
    const inicio = o.data_entrada.slice(0, 10)
    let fim = (o.data_saida || fimReferencia || inicio).slice(0, 10)
    if (fim < inicio) fim = inicio
    const arr = porPasto.get(o.pasto) || []
    arr.push({ inicio, fim, lote: o.lote, aberta: o.em_andamento })
    porPasto.set(o.pasto, arr)
    if (!min || inicio < min) min = inicio
    if (!max || fim > max) max = fim
  }
  const dia = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
  const todas = Array.from(porPasto.entries())
    .map(([pasto, barras]) => ({
      pasto,
      barras: barras.sort((a, b) => a.inicio.localeCompare(b.inicio)),
    }))
    .sort((a, b) => {
      const diasA = a.barras.reduce((s, b2) => s + Math.max(0, dia(b2.fim) - dia(b2.inicio) + 1), 0)
      const diasB = b.barras.reduce((s, b2) => s + Math.max(0, dia(b2.fim) - dia(b2.inicio) + 1), 0)
      return diasB - diasA || b.barras[b.barras.length - 1].fim.localeCompare(a.barras[a.barras.length - 1].fim)
    })
  return {
    inicio: min,
    fim: max,
    linhas: todas.slice(0, maxPastos),
    pastosOmitidos: Math.max(0, todas.length - maxPastos),
  }
}

// Condição média em que o gado ENCONTRA cada pasto (avaliação de
// entrada, registrada no pasto de destino) versus a condição em que o
// pasto é DEIXADO (avaliação de saída, registrada no pasto de origem).
// delta < 0 = pasto sai pior do que foi encontrado.
export function degradacaoPorPasto(registros: RegistroPastagem[]): DegradacaoPasto[] {
  const entradas = new Map<string, number[]>()
  const saidas = new Map<string, number[]>()
  for (const r of registros) {
    if (r.pasto_entrada && r.avaliacao_entrada != null) {
      const arr = entradas.get(r.pasto_entrada) || []
      arr.push(Number(r.avaliacao_entrada))
      entradas.set(r.pasto_entrada, arr)
    }
    if (r.pasto_saida && r.avaliacao_saida != null) {
      const arr = saidas.get(r.pasto_saida) || []
      arr.push(Number(r.avaliacao_saida))
      saidas.set(r.pasto_saida, arr)
    }
  }
  const nomes = new Set([...entradas.keys(), ...saidas.keys()])
  return Array.from(nomes)
    .map((nome) => {
      const entradaMedia = media(entradas.get(nome) ?? [])
      const saidaMedia = media(saidas.get(nome) ?? [])
      return {
        nome,
        avaliacao_entrada_media: entradaMedia,
        avaliacao_saida_media: saidaMedia,
        delta: entradaMedia != null && saidaMedia != null ? saidaMedia - entradaMedia : null,
        avaliacoes: (entradas.get(nome)?.length ?? 0) + (saidas.get(nome)?.length ?? 0),
      }
    })
    // Ordena pela pior condição na saída: o pasto que o gado deixou mais
    // degradado aparece primeiro (é quem precisa de mais descanso).
    .sort(
      (a, b) =>
        (a.avaliacao_saida_media ?? Infinity) - (b.avaliacao_saida_media ?? Infinity) ||
        (a.avaliacao_entrada_media ?? Infinity) - (b.avaliacao_entrada_media ?? Infinity),
    )
}

// Dias sem gado entre uma ocupação e a seguinte do mesmo pasto.
// Sobreposições e saída anterior à entrada (erro na fonte) não contam.
export function descansoPorPasto(ocupacoes: OcupacaoPasto[]): DescansoPasto[] {
  const porPasto = new Map<string, OcupacaoPasto[]>()
  for (const o of ocupacoes) {
    if (!o.pasto || !o.data_entrada) continue
    const arr = porPasto.get(o.pasto) || []
    arr.push(o)
    porPasto.set(o.pasto, arr)
  }
  const itens: DescansoPasto[] = []
  for (const [nome, lista] of porPasto) {
    const ordenadas = lista.slice().sort((a, b) => a.data_entrada.localeCompare(b.data_entrada))
    const gaps: number[] = []
    for (let i = 1; i < ordenadas.length; i++) {
      const saidaAnterior = ordenadas[i - 1].data_saida
      if (!saidaAnterior) continue
      const gap = Math.round((Date.parse(ordenadas[i].data_entrada.slice(0, 10)) - Date.parse(saidaAnterior.slice(0, 10))) / 86400000)
      if (gap > 0) gaps.push(gap)
    }
    if (!gaps.length) continue
    itens.push({
      nome,
      descanso_medio: media(gaps),
      menor_descanso: Math.min(...gaps),
      intervalos: gaps.length,
    })
  }
  return itens.sort((a, b) => (a.descanso_medio ?? 0) - (b.descanso_medio ?? 0))
}

function resumirPorPasto(
  registros: RegistroPastagem[],
  ocupacoes: OcupacaoPasto[],
  pastosInfo: PastoInfo[],
): ResumoPasto[] {
  const infoPorNome = new Map(pastosInfo.map((p) => [p.nome, p]))
  const mapa = new Map<string, ResumoPasto & { _aval: number[]; _dias: number[]; _ua: number[]; _desv: number[] }>()

  const obter = (nome: string): ResumoPasto & { _aval: number[]; _dias: number[]; _ua: number[]; _desv: number[] } => {
    const existente = mapa.get(nome)
    if (existente) return existente
    const info = infoPorNome.get(nome)
    const criado = {
      nome,
      modulo: info?.modulo ?? null,
      area_util_ha: info?.area_util_ha ?? null,
      entradas: 0,
      saidas: 0,
      avaliacao_media: null,
      ocupacoes: 0,
      ocupacao_dias_media: null,
      ua_ha_media: null,
      desvio_medio_percent: null,
      alertas: 0,
      _aval: [] as number[],
      _dias: [] as number[],
      _ua: [] as number[],
      _desv: [] as number[],
    }
    mapa.set(nome, criado)
    return criado
  }

  for (const r of registros) {
    const nAlertas = alertasDoRegistro(r.avaliacao_geral).length
    if (r.pasto_saida) {
      const s = obter(r.pasto_saida)
      s.saidas += 1
      s.alertas += nAlertas
      if (r.avaliacao_saida != null) s._aval.push(Number(r.avaliacao_saida))
    }
    if (r.pasto_entrada) {
      const e = obter(r.pasto_entrada)
      e.entradas += 1
      e.alertas += nAlertas
      if (r.avaliacao_entrada != null) e._aval.push(Number(r.avaliacao_entrada))
    }
  }

  for (const o of ocupacoes) {
    if (!o.pasto) continue
    const p = obter(o.pasto)
    p.ocupacoes += 1
    // dias < 0 = saída antes da entrada (erro na fonte): sai na
    // listagem em vermelho, mas não pode puxar a média para baixo.
    if (o.dias != null && Number(o.dias) >= 0) p._dias.push(Number(o.dias))
    if (o.taxa_lotacao_ua_ha != null && Number(o.taxa_lotacao_ua_ha) > 0) p._ua.push(Number(o.taxa_lotacao_ua_ha))
    if (o.desvio_percent != null) p._desv.push(Number(o.desvio_percent))
  }

  return Array.from(mapa.values())
    .map(({ _aval, _dias, _ua, _desv, ...resto }) => ({
      ...resto,
      avaliacao_media: media(_aval),
      ocupacao_dias_media: media(_dias),
      ua_ha_media: media(_ua),
      desvio_medio_percent: media(_desv),
    }))
    .sort((a, b) => b.entradas + b.saidas - (a.entradas + a.saidas) || a.nome.localeCompare(b.nome))
}

function resumirPorLote(registros: RegistroPastagem[], ocupacoes: OcupacaoPasto[]): ResumoLotePastagens[] {
  const mapa = new Map<string, { regs: RegistroPastagem[]; ocs: OcupacaoPasto[] }>()
  for (const r of registros) {
    const nome = r.lote || 'Sem lote'
    const e = mapa.get(nome) || { regs: [], ocs: [] }
    e.regs.push(r)
    mapa.set(nome, e)
  }
  for (const o of ocupacoes) {
    const nome = o.lote || 'Sem lote'
    const e = mapa.get(nome) || { regs: [], ocs: [] }
    e.ocs.push(o)
    mapa.set(nome, e)
  }
  return Array.from(mapa.entries())
    .map(([nome, { regs, ocs }]) => {
      const ordenado = [...regs].sort((a, b) => a.data.localeCompare(b.data))
      const ultimo = ordenado[ordenado.length - 1]
      return {
        nome,
        movimentacoes: regs.length,
        pasto_atual: ultimo?.pasto_entrada ?? ocs.find((o) => o.em_andamento)?.pasto ?? null,
        ultima_data: ultimo?.data ?? ocs.map((o) => o.data_entrada).sort().pop() ?? null,
        ocupacoes: ocs.length,
        dias_ocupacao_media: media(ocs.map((o) => o.dias).filter((v): v is number => v !== null && v !== undefined)),
        alertas: regs.reduce((s, r) => s + alertasDoRegistro(r.avaliacao_geral).length, 0),
      }
    })
    .sort((a, b) => b.movimentacoes - a.movimentacoes || a.nome.localeCompare(b.nome))
}

function gerarInsights(
  registros: RegistroPastagem[],
  ocupacoes: OcupacaoPasto[],
  porPasto: ResumoPasto[],
  frequencia: AgregadoValor[],
): string {
  if (!registros.length && !ocupacoes.length) {
    return 'Nenhum registro de manejo de pastagens no período selecionado.'
  }
  const partes: string[] = []
  if (registros.length) {
    const animais = registros.reduce((s, r) => s + totalAnimaisRegistro(r), 0)
    const pastos = new Set<string>()
    for (const r of registros) {
      if (r.pasto_saida) pastos.add(r.pasto_saida)
      if (r.pasto_entrada) pastos.add(r.pasto_entrada)
    }
    partes.push(
      `Foram realizadas ${registros.length} ${registros.length === 1 ? 'movimentação de pasto' : 'movimentações de pasto'} no período, manejando ${animais} animais entre ${pastos.size} ${pastos.size === 1 ? 'pasto' : 'pastos'}.`,
    )
  }
  const encerradas = ocupacoes.filter((o) => !o.em_andamento && o.dias != null && o.dias >= 0)
  if (encerradas.length) {
    const diasMedia = media(encerradas.map((o) => o.dias as number))
    partes.push(`O tempo médio de ocupação dos períodos encerrados foi de ${formatarNumero(diasMedia ?? 0, 1)} dias.`)
  }
  const emAndamento = ocupacoes.filter((o) => o.em_andamento)
  if (emAndamento.length) {
    partes.push(`${emAndamento.length} ${emAndamento.length === 1 ? 'pasto estava' : 'pastos estavam'} com ocupação em aberto ao fim do período.`)
  }
  const acimaMeta = ocupacoes.filter((o) => (o.desvio_percent ?? 0) > 0)
  if (acimaMeta.length) {
    partes.push(`${acimaMeta.length} ${acimaMeta.length === 1 ? 'ocupação excedeu' : 'ocupações excederam'} a meta de dias em pasto.`)
  }
  const maisEntradas = porPasto[0]
  if (maisEntradas && maisEntradas.entradas + maisEntradas.saidas > 1) {
    partes.push(`O pasto mais movimentado foi ${maisEntradas.nome} (${maisEntradas.entradas} ${plural(maisEntradas.entradas, 'entrada', 'entradas')} e ${maisEntradas.saidas} ${plural(maisEntradas.saidas, 'saída', 'saídas')}).`)
  }
  const alertas = frequencia.reduce((s, item) => s + item.valor, 0)
  if (alertas > 0) {
    partes.push(`Houve ${alertas} ${alertas === 1 ? 'alerta' : 'alertas'} de diagnóstico; o mais frequente foi "${frequencia[0].label}" (${frequencia[0].valor}x).`)
  }
  return partes.join(' ')
}

export function calcularResumoPastagens(
  registros: RegistroPastagem[],
  ocupacoes: OcupacaoPasto[],
  pastosInfo: PastoInfo[],
  ocupacoesContexto: OcupacaoPasto[] = [],
): ResumoPastagens {
  const pastosSet = new Set<string>()
  const lotesSet = new Set<string>()
  for (const r of registros) {
    if (r.pasto_saida) pastosSet.add(r.pasto_saida)
    if (r.pasto_entrada) pastosSet.add(r.pasto_entrada)
    if (r.lote) lotesSet.add(r.lote)
  }
  for (const o of ocupacoes) {
    if (o.pasto) pastosSet.add(o.pasto)
    if (o.lote) lotesSet.add(o.lote)
  }
  const pastosNorm = new Set([...pastosSet].map((n) => n.trim().toLowerCase()))

  const freqMap = new Map<string, number>()
  let alertasSanitarios = 0
  let pendenciasInfra = 0
  let comAlerta = 0
  for (const registro of registros) {
    const alertas = alertasDoRegistro(registro.avaliacao_geral)
    if (alertas.length) comAlerta += 1
    for (const alerta of alertas) {
      if (alerta.sanitario) alertasSanitarios += 1
      else pendenciasInfra += 1
      freqMap.set(alerta.label, (freqMap.get(alerta.label) ?? 0) + 1)
    }
  }
  const frequencia = Array.from(freqMap.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)

  const fluxoMap = new Map<string, FluxoPasto>()
  for (const r of registros) {
    const origem = r.pasto_saida || '—'
    const destino = r.pasto_entrada || '—'
    const chave = `${origem}→${destino}`
    const atual = fluxoMap.get(chave) || { origem, destino, vezes: 0 }
    atual.vezes += 1
    fluxoMap.set(chave, atual)
  }
  const fluxo = Array.from(fluxoMap.values()).sort((a, b) => b.vezes - a.vezes)

  const encerradas = ocupacoes.filter((o) => !o.em_andamento && o.dias != null && o.dias >= 0)
  const porPasto = resumirPorPasto(registros, ocupacoes, pastosInfo)
  const porLote = resumirPorLote(registros, ocupacoes)

  // Área pasteável com uso no período (movimentação ou ocupação) vs.
  // área cadastrada: o KPI de headline que a contagem de pastos não
  // entrega sozinha.
  let areaUtilizada: number | null = null
  let areaTotal: number | null = null
  for (const p of pastosInfo) {
    if (p.area_util_ha == null || p.area_util_ha <= 0) continue
    areaTotal = (areaTotal ?? 0) + p.area_util_ha
    if (p.nome && pastosNorm.has(p.nome.trim().toLowerCase())) {
      areaUtilizada = (areaUtilizada ?? 0) + p.area_util_ha
    }
  }
  const areaPct = areaTotal != null && areaTotal > 0 && areaUtilizada != null ? (areaUtilizada / areaTotal) * 100 : null
  let insights = gerarInsights(registros, ocupacoes, porPasto, frequencia)
  if (areaTotal != null && areaUtilizada != null && areaUtilizada < areaTotal) {
    insights += `${insights ? ' ' : ''}Dos ${formatarNumero(areaTotal, 0)} ha cadastrados, ${formatarNumero(areaUtilizada, 0)} ha (${formatarNumero(areaPct ?? 0, 0)}%) tiveram uso no período.`
  }

  return {
    total_movimentacoes: registros.length,
    animais_manejados: registros.reduce((s, r) => s + totalAnimaisRegistro(r), 0),
    pastos_utilizados: pastosSet.size,
    lotes_movimentados: lotesSet.size,
    ocupacao_media_dias: media(encerradas.map((o) => o.dias as number)),
    // UA/ha = 0 é artefato (ocupação sem área ou sem cabeças), não
    // lotação real; excluída da média para não puxar a referência pra baixo.
    taxa_lotacao_media_ua_ha: media(ocupacoes.map((o) => o.taxa_lotacao_ua_ha).filter((v): v is number => v != null && v > 0)),
    ocupacoes_acima_meta: ocupacoes.filter((o) => (o.desvio_percent ?? 0) > 0).length,
    ocupacoes_em_andamento: ocupacoes.filter((o) => o.em_andamento).length,
    avaliacao_saida_media: media(registros.map((r) => r.avaliacao_saida).filter((v): v is number => v !== null && v !== undefined)),
    avaliacao_entrada_media: media(registros.map((r) => r.avaliacao_entrada).filter((v): v is number => v !== null && v !== undefined)),
    escore_gado_medio: media(registros.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)),
    escore_fezes_medio: media(registros.map((r) => r.escore_fezes).filter((v): v is number => v !== null && v !== undefined)),
    alertas_sanitarios: alertasSanitarios,
    pendencias_infra: pendenciasInfra,
    movimentacoes_com_alerta: comAlerta,
    frequencia_alertas: frequencia,
    fluxo,
    por_pasto: porPasto,
    por_lote: porLote,
    serie_diaria: serieDiariaPastagens(registros),
    degradacao: degradacaoPorPasto(registros),
    // O contexto traz a última ocupação encerrada anterior à janela de
    // cada pasto: sem ela o descanso só apareceria quando dois ciclos
    // coubessem inteiros dentro do período do relatório.
    descanso: descansoPorPasto([...ocupacoes, ...ocupacoesContexto]),
    // Comparação por nome normalizado: o histórico pode gravar o nome
    // do pasto com caixa diferente do cadastro ("volta de cima A").
    pastos_sem_uso: Math.max(
      0,
      pastosInfo.filter((p) => p.nome && !pastosNorm.has(p.nome.trim().toLowerCase())).length,
    ),
    area_utilizada_ha: areaUtilizada,
    area_total_ha: areaTotal,
    area_utilizada_pct: areaPct,
    insights,
  }
}
