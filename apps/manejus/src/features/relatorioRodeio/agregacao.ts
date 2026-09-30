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
  { key: 'vaca', label: 'Vacas' },
  { key: 'touro', label: 'Touros' },
  { key: 'bezerro', label: 'Bezerros' },
  { key: 'boi', label: 'Bois' },
  { key: 'garrote', label: 'Garrotes' },
  { key: 'novilha', label: 'Novilhas' },
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

function gerarInsights(registros: RegistroRodeio[], porLote: ResumoLocalRodeio[], frequencia: AgregadoRodeio[]): string {
  if (!registros.length) return 'Nenhum rodeio registrado no período selecionado.'
  const partes: string[] = []
  const cabecas = registros.reduce((s, r) => s + (Number(r.total_cabecas) || 0), 0)
  partes.push(`Foram realizados ${registros.length} ${registros.length === 1 ? 'rodeio' : 'rodeios'} no período, com ${cabecas} cabeças contadas no acumulado.`)
  const escores = registros.map((r) => r.escore_gado).filter((v): v is number => v !== null && v !== undefined)
  if (escores.length) {
    partes.push(`O escore corporal médio do gado foi ${formatarNumero(media(escores) ?? 0, 1)} (escala de 1 a 5).`)
  }
  if (porLote.length > 1) {
    const maisRodado = porLote[0]
    partes.push(`O lote ${maisRodado.nome} foi o mais acompanhado, com ${maisRodado.rodeios} ${maisRodado.rodeios === 1 ? 'registro' : 'registros'}.`)
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

  return {
    total_rodeios: registros.length,
    cabecas_contadas: cabecas.reduce((s, v) => s + v, 0),
    media_cabecas: media(cabecas),
    escore_gado_medio: media(escoresGado),
    escore_fezes_medio: media(escoresFezes),
    alertas_sanitarios: alertasSanitarios,
    pendencias_infra: pendenciasInfra,
    rodeios_com_alerta: rodeiosComAlerta,
    por_categoria: porCategoria,
    frequencia_alertas: frequencia,
    por_lote: porLote,
    por_pasto: porPasto,
    serie_diaria: serieDiariaRodeio(registros),
    insights: gerarInsights(registros, porLote, frequencia),
  }
}
