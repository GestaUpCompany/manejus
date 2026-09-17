import * as XLSX from 'xlsx'

export const BOLETIM_MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export const BOLETIM_CATEGORIAS = [
  '0 a 4 meses - Fêmea',
  '0 a 4 meses - Macho',
  '5 a 12 meses - Fêmea',
  '5 a 12 meses - Macho',
  '13 a 24 meses - Fêmea',
  '13 a 24 meses - Macho',
  '25 a 36 meses - Fêmea',
  '25 a 36 meses - Macho',
  'Acima 36 meses - Fêmea',
  'Acima 36 meses - Macho',
] as const

export type CampoNumericoBoletim =
  | 'inic'
  | 'com'
  | 'vend'
  | 'mort'
  | 'cons'
  | 'nasc'
  | 'ent'
  | 'sai'
  | 'evolMais'
  | 'evolMenos'
  | 'final'
  | 'pesoMedioKg'
  | 'pesoTotalKg'
  | 'totalUa'
  | 'valorKg'
  | 'valorTotal'

export interface RegistroBoletimRebanho {
  fazenda: string
  mes: string
  mesNumero: number
  descricao: string
  inic: number | null
  com: number | null
  vend: number | null
  mort: number | null
  cons: number | null
  nasc: number | null
  ent: number | null
  sai: number | null
  evolMais: number | null
  evolMenos: number | null
  final: number | null
  pesoMedioKg: number | null
  pesoTotalKg: number | null
  totalUa: number | null
  valorKg: number | null
  valorTotal: number | null
}

export interface DadosPDFBoletimRebanho {
  ano: number
  mesReferencia: string
  mesNumero: number
  geral: RegistroBoletimRebanho[]
  locais: { fazenda: string; registros: RegistroBoletimRebanho[] }[]
  locaisGeral: { fazenda: string; registros: RegistroBoletimRebanho[] }[]
}

export interface ResultadoNormalizacaoBoletim {
  registros: RegistroBoletimRebanho[]
  mesesDisponiveis: { nome: string; numero: number }[]
  avisos: string[]
}

const CAMPOS_NUMERICOS: CampoNumericoBoletim[] = [
  'inic', 'com', 'vend', 'mort', 'cons', 'nasc', 'ent', 'sai',
  'evolMais', 'evolMenos', 'final', 'pesoMedioKg', 'pesoTotalKg',
  'totalUa', 'valorKg', 'valorTotal',
]

const COLUNAS_HEADER = [
  'Descrição', 'Inic.', 'Com.', 'Vend.', 'Mort.', 'Cons.', 'Nasc.', 'Ent.', 'Saí.',
  'Evol +', 'Evol -', 'Final', 'Peso Médio (kg)', 'Peso Total (kg)', 'Total UA',
  'Valor (kg)', 'Valor Total',
]

const MESES_COM_GERAL = [...BOLETIM_MESES, 'GERAL'] as const

function normalizarTexto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function paraNumero(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value !== 'string') return null
  const texto = value.trim()
  if (!texto) return null
  const numero = Number(texto.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

function pareceCategoria(value: string): boolean {
  return /\bmeses\b/i.test(value) && /\b(fêmea|macho)\b/i.test(value)
}

function numeroMes(nome: string): number | null {
  const index = BOLETIM_MESES.indexOf(nome as typeof BOLETIM_MESES[number])
  if (index >= 0) return index + 1
  if (nome === 'GERAL') return 13
  return null
}

function valorCelula(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const address = XLSX.utils.encode_cell({ r: row, c: col })
  return sheet[address]?.v ?? null
}

function linhaOculta(sheet: XLSX.WorkSheet, row: number): boolean {
  return Boolean(sheet['!rows']?.[row]?.hidden)
}

function nomeLocalAnterior(sheet: XLSX.WorkSheet, headerRow: number): string | null {
  for (let row = headerRow - 1; row >= 0; row -= 1) {
    if (linhaOculta(sheet, row)) continue
    const value = normalizarTexto(valorCelula(sheet, row, 1))
    if (!value || value === 'Total do Rebanho') continue
    if (value === 'Descrição') return null
    if (value.toLowerCase().startsWith('estamos na semana')) continue
    if (value.toLowerCase().startsWith('estamos no mês')) continue
    if (pareceCategoria(value)) continue
    return value
  }
  return null
}

function criarRegistro(sheet: XLSX.WorkSheet, row: number, local: string, mes: string, mesNumero: number): RegistroBoletimRebanho {
  const registro = {
    fazenda: local,
    mes,
    mesNumero,
    descricao: normalizarTexto(valorCelula(sheet, row, 1)),
    inic: null,
    com: null,
    vend: null,
    mort: null,
    cons: null,
    nasc: null,
    ent: null,
    sai: null,
    evolMais: null,
    evolMenos: null,
    final: null,
    pesoMedioKg: null,
    pesoTotalKg: null,
    totalUa: null,
    valorKg: null,
    valorTotal: null,
  } as RegistroBoletimRebanho

  CAMPOS_NUMERICOS.forEach((campo, index) => {
    registro[campo] = paraNumero(valorCelula(sheet, row, index + 2))
  })
  return registro
}

function extrairRegistrosDaAba(sheet: XLSX.WorkSheet, nomeAba: string): { registros: RegistroBoletimRebanho[]; locais: string[] } {
  const mesNumero = numeroMes(nomeAba)
  if (mesNumero === null || !sheet['!ref']) return { registros: [], locais: [] }
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const registros: RegistroBoletimRebanho[] = []
  const locais: string[] = []

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    if (linhaOculta(sheet, row)) continue
    if (normalizarTexto(valorCelula(sheet, row, 1)) !== 'Descrição') continue
    const local = nomeLocalAnterior(sheet, row) ?? 'Consolidado'
    const header = Array.from({ length: COLUNAS_HEADER.length }, (_, index) => normalizarTexto(valorCelula(sheet, row, 1 + index)))
    if (header[0] !== COLUNAS_HEADER[0]) continue

    const antesDoBloco = registros.length
    for (let dataRow = row + 1; dataRow <= Math.min(row + 12, range.e.r); dataRow += 1) {
      if (linhaOculta(sheet, dataRow)) continue
      const descricao = normalizarTexto(valorCelula(sheet, dataRow, 1))
      if (!descricao || descricao === 'Total do Rebanho') break
      registros.push(criarRegistro(sheet, dataRow, local, nomeAba, mesNumero))
    }
    if (registros.length > antesDoBloco && !locais.includes(local)) locais.push(local)
  }

  const consolidado = locais.includes('Consolidado')
    ? 'Consolidado'
    : (nomeAba === 'GERAL' || locais.length > 1 ? locais[locais.length - 1] : undefined)
  if (consolidado && consolidado !== 'Consolidado') {
    for (const registro of registros) {
      if (registro.fazenda === consolidado) registro.fazenda = 'Consolidado'
    }
    locais.splice(locais.indexOf(consolidado), 1, 'Consolidado')
  }
  return { registros, locais }
}

export function normalizarPlanilhaBoletim(bytes: ArrayBuffer | Uint8Array): ResultadoNormalizacaoBoletim {
  const workbook = XLSX.read(bytes, { cellDates: true, cellNF: false, cellStyles: true })
  const registros: RegistroBoletimRebanho[] = []
  const avisos: string[] = []
  const mesesDisponiveis: { nome: string; numero: number }[] = []
  const vistos = new Set<string>()

  for (const nomeAba of MESES_COM_GERAL) {
    const sheet = workbook.Sheets[nomeAba]
    if (!sheet) continue
    const mesNumero = numeroMes(nomeAba)
    if (mesNumero === null) continue
    const extraidos = extrairRegistrosDaAba(sheet, nomeAba)
    if (nomeAba !== 'GERAL' && extraidos.registros.length > 0) mesesDisponiveis.push({ nome: nomeAba, numero: mesNumero })
    for (const registro of extraidos.registros) {
      const chave = `${registro.fazenda}||${registro.mes}||${registro.descricao}`
      if (vistos.has(chave)) {
        avisos.push(`Registro duplicado descartado: ${chave}`)
        continue
      }
      vistos.add(chave)
      registros.push(registro)
    }
  }

  if (!mesesDisponiveis.length) throw new Error('A planilha não contém abas mensais reconhecíveis com dados.')
  if (!workbook.Sheets.GERAL) avisos.push('Aba GERAL não encontrada; o resumo geral não poderá ser exibido.')
  return { registros, mesesDisponiveis, avisos }
}

const CAMPOS_MOVIMENTO: CampoNumericoBoletim[] = [
  'inic', 'com', 'vend', 'mort', 'cons', 'nasc', 'ent', 'sai',
  'evolMais', 'evolMenos', 'final',
]

function blocoZerado(registros: RegistroBoletimRebanho[]): boolean {
  return registros.every((registro) => CAMPOS_MOVIMENTO.every((campo) => registro[campo] == null || registro[campo] === 0))
}

function agruparPorFazenda(registros: RegistroBoletimRebanho[], mesNumero: number, excluir?: ReadonlySet<string>) {
  return [...new Set(registros
    .filter((registro) => registro.mesNumero === mesNumero && registro.fazenda !== 'Consolidado' && !excluir?.has(registro.fazenda))
    .map((registro) => registro.fazenda))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((fazenda) => ({ fazenda, registros: registros.filter((registro) => registro.mesNumero === mesNumero && registro.fazenda === fazenda) }))
    .filter((local) => !blocoZerado(local.registros))
}

export function agruparBoletim(registros: RegistroBoletimRebanho[], mesNumero: number, excluir?: ReadonlySet<string>) {
  const geral = registros.filter((registro) => registro.mesNumero === 13 && registro.fazenda === 'Consolidado')
  return { geral, locais: agruparPorFazenda(registros, mesNumero, excluir), locaisGeral: agruparPorFazenda(registros, 13, excluir) }
}

export function listarLocaisBoletim(registros: RegistroBoletimRebanho[]): string[] {
  const blocos = new Map<string, RegistroBoletimRebanho[]>()
  for (const registro of registros) {
    if (registro.fazenda === 'Consolidado') continue
    const chave = `${registro.fazenda}||${registro.mesNumero}`
    const bloco = blocos.get(chave)
    if (bloco) bloco.push(registro)
    else blocos.set(chave, [registro])
  }
  const locais = new Set<string>()
  for (const [chave, bloco] of blocos) {
    if (!blocoZerado(bloco)) locais.add(chave.split('||')[0])
  }
  return [...locais].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
