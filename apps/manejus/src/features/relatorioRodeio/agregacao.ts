// Agregações do relatório de Rodeio. Funções puras compartilhadas entre a
// página pública (RelatorioRodeioPublico.tsx) e o loader do Infográfico
// Mensal (features/relatorioGeral/loaders.ts), para que os dois caminhos
// produzam exatamente o mesmo payload para api/pdf/rodeio.js.
//
// A classificação dos diagnósticos replica RODEIO_DIAGNOSTICOS do PWA
// (frontend/src/utils/pdfUtils.ts): itens "inverted" são problemas quando
// valor === 'S'; os demais são perguntas "OK?" e alertam quando valor === 'N'.

export interface DiagRodeioItem {
  valor?: string | null
  observacao?: string | null
}

export type DiagnosticosRodeio = Record<string, DiagRodeioItem | undefined>

export interface RegistroRodeio {
  registro_id: string
  data: string
  horario: string | null
  pasto: string | null
  lote: string | null
  nome_usuario: string | null
  vaca: number | null
  touro: number | null
  bezerro: number | null
  boi: number | null
  garrote: number | null
  novilha: number | null
  total_cabecas: number | null
  escore_gado: number | null
  escore_fezes: number | null
  equipe: number | null
  equipe_nomes: string[] | null
  gado_contado: string | null
  diagnosticos: DiagnosticosRodeio | null
  // Meta de intervalo entre rodeios do lote (dias) e o gap real desde o
  // rodeio anterior do mesmo lote. Vêm da RPC; null quando o lote não tem
  // meta configurada ou quando não existe rodeio anterior na base.
  meta_intervalo_dias?: number | null
  dias_desde_anterior?: number | null
}

// 'sem_anterior': lote tem meta mas este é o primeiro rodeio registrado,
// então não há gap para comparar. 'sem_meta': lote sem meta ou registro
// legado sem lote_id.
export type SituacaoMetaRodeio = 'sem_meta' | 'sem_anterior' | 'dentro' | 'fora'

export function situacaoMetaRodeio(r: RegistroRodeio): SituacaoMetaRodeio {
  if (r.meta_intervalo_dias == null || r.meta_intervalo_dias <= 0) return 'sem_meta'
  if (r.dias_desde_anterior == null) return 'sem_anterior'
  return r.dias_desde_anterior <= r.meta_intervalo_dias ? 'dentro' : 'fora'
}

export interface DadosRelatorioRodeio {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  pastos_disponiveis: string[]
  lotes_disponiveis: string[]
  usuarios_disponiveis: string[]
  registros: RegistroRodeio[]
}

export const CATEGORIAS_RODEIO = [
  { key: 'vaca', label: 'Vacas', short: 'Vac' },
  { key: 'touro', label: 'Touros', short: 'Tou' },
  { key: 'bezerro', label: 'Bezerros', short: 'Bez' },
  { key: 'boi', label: 'Bois', short: 'Boi' },
  { key: 'garrote', label: 'Garrotes', short: 'Gar' },
  { key: 'novilha', label: 'Novilhas', short: 'Nov' },
] as const

export const DIAGNOSTICOS_RODEIO = [
  { key: 'bebedourosCochos', label: 'Bebedouros/Cochos', inverted: false },
  { key: 'pastagensTaxaLotacao', label: 'Pastagens/Taxa de lotação', inverted: false },
  { key: 'cercasCochosPorteiras', label: 'Cercas/Cochos/Porteiras', inverted: false },
  { key: 'animaisMachucadosDoentesBichados', label: 'Animais machucados/doentes/bichados', inverted: true },
  { key: 'carrapatosMoscas', label: 'Carrapatos/Moscas', inverted: true },
  { key: 'animaisEntreverados', label: 'Animais entreverados', inverted: true },
  { key: 'animalMorto', label: 'Animal morto', inverted: true },
] as const

export interface AlertaRodeio {
  key: string
  label: string
  observacao: string
  sanitario: boolean
}

export interface ItemAlertaRodeio {
  data: string
  pasto: string
  lote: string
  label: string
  observacao: string
  sanitario: boolean
}

// Lista plana de todos os alertas do período, mais recentes primeiro.
// Compartilha o formato da lista usada no PDF (api/pdf/rodeio.js).
export function listaAlertasRodeio(registros: RegistroRodeio[]): ItemAlertaRodeio[] {
  const itens: ItemAlertaRodeio[] = []
  for (const r of registros) {
    for (const a of alertasDoRegistro(r.diagnosticos)) {
      itens.push({
        data: r.data,
        pasto: r.pasto || '—',
        lote: r.lote || '—',
        label: a.label,
        observacao: a.observacao || '',
        sanitario: a.sanitario,
      })
    }
  }
  return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)))
}

// Faixas de escore (1-5) do gráfico "Distribuição de escore": degrau de
// 0,5, índice 0 cobre "< 2,0" e o último ">= 4,5". Mesma lógica do PDF.
export const ESCORE_BUCKETS = ['< 2,0', '2,0', '2,5', '3,0', '3,5', '4,0', '≥ 4,5']

function bucketIndex(valor: number | null | undefined): number {
  if (valor == null || Number.isNaN(Number(valor))) return -1
  const v = Number(valor)
  if (v < 1.75) return 0
  if (v < 2.25) return 1
  if (v < 2.75) return 2
  if (v < 3.25) return 3
  if (v < 3.75) return 4
  if (v < 4.25) return 5
  return 6
}

export interface DistribuicaoEscore {
  labels: string[]
  gado: number[]
  fezes: number[]
  total: number
}

export function distribuicaoEscore(registros: RegistroRodeio[]): DistribuicaoEscore {
  const gado = new Array(ESCORE_BUCKETS.length).fill(0)
  const fezes = new Array(ESCORE_BUCKETS.length).fill(0)
  for (const r of registros) {
    const ig = bucketIndex(r.escore_gado)
    const iff = bucketIndex(r.escore_fezes)
    if (ig >= 0) gado[ig] += 1
    if (iff >= 0) fezes[iff] += 1
  }
  const total = gado.reduce((s, v) => s + v, 0) + fezes.reduce((s, v) => s + v, 0)
  return { labels: [...ESCORE_BUCKETS], gado, fezes, total }
}

// Pasto atual de cada lote = pasto do rodeio mais recente daquele lote
// (pasto é atributo do rodeio, não do lote). Mesmo critério do PDF.
export function pastoAtualPorLote(registros: RegistroRodeio[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const r of [...registros].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    if (r.lote) mapa.set(r.lote, r.pasto || '—')
  }
  return mapa
}

// "Boi 140 · Bez 15": só as categorias com cabeças, mesma composição do
// detalhamento do PDF.
export function composicaoRodeio(r: RegistroRodeio): string {
  const partes = CATEGORIAS_RODEIO.map((c) => {
    const v = Number(r[c.key]) || 0
    return v > 0 ? `${c.short} ${v}` : null
  }).filter((p): p is string => p !== null)
  return partes.length ? partes.join(' · ') : '—'
}

// "Carlos Henrique Schemmer" -> "Carlos H."
export function abreviarNome(nome: string): string {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return ''
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`
}

export function alertasDoRegistro(diagnosticos: DiagnosticosRodeio | null): AlertaRodeio[] {
  if (!diagnosticos) return []
  const alertas: AlertaRodeio[] = []
  for (const item of DIAGNOSTICOS_RODEIO) {
    const diag = diagnosticos[item.key]
    const valor = diag?.valor
    if (!valor) continue
    const ehAlerta = item.inverted ? valor === 'S' : valor === 'N'
    if (ehAlerta) {
      alertas.push({
        key: item.key,
        label: item.label,
        observacao: diag?.observacao ?? '',
        sanitario: item.inverted,
      })
    }
  }
  return alertas
}

export interface AgregadoRodeio {
  label: string
  valor: number
}

export interface ResumoLocalRodeio {
  nome: string
  rodeios: number
  cabecas_media: number | null
  cabecas_ultima: number | null
  data_ultima: string | null
  escore_medio: number | null
  alertas: number
  meta_dias: number | null
  dentro_meta: number
  fora_meta: number
}

export interface PontoSerieRodeio {
  data: string
  data_label: string
  total: number
  escore_medio: number | null
  escore_fezes_medio: number | null
  [categoria: string]: string | number | null
}

export interface ResumoRodeio {
  total_rodeios: number
  cabecas_contadas: number
  media_cabecas: number | null
  escore_gado_medio: number | null
  escore_fezes_medio: number | null
  alertas_sanitarios: number
  pendencias_infra: number
  rodeios_com_alerta: number
  rodeios_com_meta: number
  dentro_meta: number
  fora_meta: number
  por_categoria: AgregadoRodeio[]
  frequencia_alertas: AgregadoRodeio[]
  por_lote: ResumoLocalRodeio[]
  por_pasto: ResumoLocalRodeio[]
  serie_diaria: PontoSerieRodeio[]
  insights: string
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

function dataLabel(iso: string): string {
  const partes = iso.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : iso
}

function resumirPorCampo(registros: RegistroRodeio[], campo: 'pasto' | 'lote'): ResumoLocalRodeio[] {
  const mapa = new Map<string, RegistroRodeio[]>()
  for (const registro of registros) {
    const nome = registro[campo] || 'Sem identificação'
    const arr = mapa.get(nome) || []
    arr.push(registro)
    mapa.set(nome, arr)
  }
  return Array.from(mapa.entries())
    .map(([nome, regs]) => {
      const ordenado = [...regs].sort((a, b) => a.data.localeCompare(b.data))
      const ultimo = ordenado[ordenado.length - 1]
      const cabecas = regs.map((r) => Number(r.total_cabecas)).filter((v) => !isNaN(v))
      const escores = regs.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)
      return {
        nome,
        rodeios: regs.length,
        cabecas_media: media(cabecas),
        cabecas_ultima: ultimo?.total_cabecas ?? null,
        data_ultima: ultimo?.data ?? null,
        escore_medio: media(escores),
        alertas: regs.reduce((s, r) => s + alertasDoRegistro(r.diagnosticos).length, 0),
        meta_dias: regs.find((r) => r.meta_intervalo_dias != null && r.meta_intervalo_dias > 0)?.meta_intervalo_dias ?? null,
        dentro_meta: regs.filter((r) => situacaoMetaRodeio(r) === 'dentro').length,
        fora_meta: regs.filter((r) => situacaoMetaRodeio(r) === 'fora').length,
      }
    })
    .sort((a, b) => b.rodeios - a.rodeios || a.nome.localeCompare(b.nome))
}

export function serieDiariaRodeio(registros: RegistroRodeio[]): PontoSerieRodeio[] {
  const porDia = new Map<string, RegistroRodeio[]>()
  for (const registro of registros) {
    const arr = porDia.get(registro.data) || []
    arr.push(registro)
    porDia.set(registro.data, arr)
  }
  return Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, regs]) => {
      const ponto: PontoSerieRodeio = {
        data,
        data_label: dataLabel(data),
        total: regs.reduce((s, r) => s + (Number(r.total_cabecas) || 0), 0),
        escore_medio: media(regs.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)),
        escore_fezes_medio: media(regs.map((r) => r.escore_fezes).filter((v): v is number => v !== null && v !== undefined)),
      }
      for (const cat of CATEGORIAS_RODEIO) {
        ponto[cat.key] = regs.reduce((s, r) => s + (Number(r[cat.key]) || 0), 0)
      }
      return ponto
    })
}

function formatarNumero(valor: number, casas: number): string {
  return valor.toFixed(casas).replace('.', ',')
}

function gerarInsights(registros: RegistroRodeio[], porLote: ResumoLocalRodeio[], porPasto: ResumoLocalRodeio[], frequencia: AgregadoRodeio[]): string {
  if (!registros.length) return 'Nenhum rodeio registrado no período selecionado.'
  const partes: string[] = []
  partes.push(`Foram realizados ${registros.length} ${registros.length === 1 ? 'rodeio' : 'rodeios'} no período.`)
  partes.push(`Foram acompanhados ${porLote.length} ${porLote.length === 1 ? 'lote' : 'lotes'} em ${porPasto.length} ${porPasto.length === 1 ? 'pasto' : 'pastos'}.`)
  const escores = registros.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)
  if (escores.length) {
    partes.push(`O escore corporal médio do gado foi ${formatarNumero(media(escores) ?? 0, 1)} (escala de 1 a 5).`)
  }
  const comEscore = porLote.filter((l) => l.escore_medio !== null)
  const piorEscore = comEscore.sort((a, b) => (a.escore_medio ?? 0) - (b.escore_medio ?? 0))[0]
  if (piorEscore && (piorEscore.escore_medio ?? 5) < 3) {
    partes.push(`Atenção: o lote ${piorEscore.nome} teve o menor escore médio (${formatarNumero(piorEscore.escore_medio ?? 0, 1)}).`)
  }
  if (porLote.length > 1) {
    const maisRodado = porLote[0]
    partes.push(`O lote ${maisRodado.nome} foi o mais acompanhado, com ${maisRodado.rodeios} ${maisRodado.rodeios === 1 ? 'registro' : 'registros'}.`)
  }
  const comMeta = registros.filter((r) => r.meta_intervalo_dias != null && r.meta_intervalo_dias > 0)
  if (comMeta.length) {
    const dentro = comMeta.filter((r) => situacaoMetaRodeio(r) === 'dentro').length
    const fora = comMeta.filter((r) => situacaoMetaRodeio(r) === 'fora').length
    const semAnterior = comMeta.length - dentro - fora
    let frase = `Quanto à meta de intervalo entre rodeios, ${dentro} ficaram dentro e ${fora} fora da meta`
    if (semAnterior) frase += ` (${semAnterior} sem rodeio anterior para comparar)`
    partes.push(`${frase}.`)
  }
  const alertas = frequencia.reduce((s, item) => s + item.valor, 0)
  if (alertas > 0) {
    const top = frequencia[0]
    partes.push(`Houve ${alertas} ${alertas === 1 ? 'alerta' : 'alertas'} de diagnóstico; o mais frequente foi "${top.label}" (${top.valor}x).`)
  } else {
    partes.push('Nenhum alerta de diagnóstico foi registrado nos rodeios do período.')
  }
  return partes.join(' ')
}

export function calcularResumoRodeio(registros: RegistroRodeio[]): ResumoRodeio {
  const cabecas = registros.map((r) => Number(r.total_cabecas) || 0)
  const escoresGado = registros.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)
  const escoresFezes = registros.map((r) => r.escore_fezes).filter((v): v is number => v !== null && v !== undefined)

  const freqMap = new Map<string, number>()
  let alertasSanitarios = 0
  let pendenciasInfra = 0
  let rodeiosComAlerta = 0
  for (const registro of registros) {
    const alertas = alertasDoRegistro(registro.diagnosticos)
    if (alertas.length) rodeiosComAlerta += 1
    for (const alerta of alertas) {
      if (alerta.sanitario) alertasSanitarios += 1
      else pendenciasInfra += 1
      freqMap.set(alerta.label, (freqMap.get(alerta.label) ?? 0) + 1)
    }
  }
  const frequencia = Array.from(freqMap.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)

  const porCategoria = CATEGORIAS_RODEIO.map((cat) => ({
    label: cat.label,
    valor: registros.reduce((s, r) => s + (Number(r[cat.key]) || 0), 0),
  }))

  const porLote = resumirPorCampo(registros, 'lote')
  const porPasto = resumirPorCampo(registros, 'pasto')

  const comMeta = registros.filter((r) => r.meta_intervalo_dias != null && r.meta_intervalo_dias > 0)

  return {
    total_rodeios: registros.length,
    cabecas_contadas: cabecas.reduce((s, v) => s + v, 0),
    media_cabecas: media(cabecas),
    escore_gado_medio: media(escoresGado),
    escore_fezes_medio: media(escoresFezes),
    alertas_sanitarios: alertasSanitarios,
    pendencias_infra: pendenciasInfra,
    rodeios_com_alerta: rodeiosComAlerta,
    rodeios_com_meta: comMeta.length,
    dentro_meta: comMeta.filter((r) => situacaoMetaRodeio(r) === 'dentro').length,
    fora_meta: comMeta.filter((r) => situacaoMetaRodeio(r) === 'fora').length,
    por_categoria: porCategoria,
    frequencia_alertas: frequencia,
    por_lote: porLote,
    por_pasto: porPasto,
    serie_diaria: serieDiariaRodeio(registros),
    insights: gerarInsights(registros, porLote, porPasto, frequencia),
  }
}
