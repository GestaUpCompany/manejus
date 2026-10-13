import { supabase } from '@gestaup/supabase'
import { buildMap, norm, normHeader, parseData, parseNumero } from './lotesImportacao'

// ============================================================================
// Importação de registros de clima via planilha-modelo (aba única, uma linha
// por leitura = data + hora). Os pluviômetros ativos da fazenda viram colunas
// "<nome> (mm)". Grava direto em `registros_clima` (a policy da tabela permite
// insert por membros da fazenda). Idempotência: `local_id` determinístico
// (índice único) + checagem prévia de data/hora já existentes.
// ============================================================================

const FUSO_FAZENDA = 'America/Cuiaba'

export const TEMPO_ATUAL_LABELS: Record<string, string> = {
  sol: 'Sol',
  nublado: 'Nublado',
  chuva_fraca: 'Chuva fraca',
  chuva_forte: 'Chuva forte',
  temporal: 'Temporal',
  vento_forte: 'Vento forte',
  frio: 'Frio',
  seco_poeira: 'Seco / poeira',
}

export const COLUNAS_FIXAS_CLIMA = [
  'Data',
  'Hora',
  'Responsável',
  'Tempo atual',
  'Choveu',
  'Esvaziou pluviômetros',
  'Temperatura (°C)',
  'Umidade relativa (%)',
] as const

export const COLUNA_OBSERVACAO = 'Observação'

export const SIM_NAO = ['Sim', 'Não'] as const

export function nomeColunaPluviometro(nome: string): string {
  return `${nome} (mm)`
}

const TEMPO_MAP = buildMap(
  Object.values(TEMPO_ATUAL_LABELS),
  Object.fromEntries(Object.entries(TEMPO_ATUAL_LABELS).map(([valor, rotulo]) => [valor, rotulo]))
)
const TEMPO_VALOR_POR_ROTULO = new Map(Object.entries(TEMPO_ATUAL_LABELS).map(([valor, rotulo]) => [rotulo, valor]))

// Limites de sanidade (espelham a RPC de edição e as validações da planilha)
export const MM_MAXIMO = 500
export const TEMPERATURA_MIN = -60
export const TEMPERATURA_MAX = 60
export const OBSERVACAO_MAX = 500
export const ANO_MINIMO = 2000

export interface PluviometroModelo {
  id: string
  nome: string
  localizacao: string | null
}

export interface LinhaBrutaClima {
  linha: number
  valores: Record<string, unknown>
}

export interface ParseClimaResult {
  linhas: LinhaBrutaClima[]
  erro?: string
}

export function parseLinhasClima(jsonData: unknown[][]): ParseClimaResult {
  if (!jsonData || jsonData.length < 2) {
    return { linhas: [], erro: 'Arquivo vazio ou sem dados' }
  }

  let headerRowIdx = -1
  const colIndices: Record<string, number> = {}

  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i]
    if (!Array.isArray(row)) continue
    const headers = row.map((h) => normHeader(h))
    if (headers.includes('data') && headers.includes('hora') && headers.includes('responsavel')) {
      headerRowIdx = i
      headers.forEach((h, idx) => {
        if (h && colIndices[h] === undefined) colIndices[h] = idx
      })
      break
    }
  }

  if (headerRowIdx < 0) {
    return {
      linhas: [],
      erro: 'Cabeçalho não encontrado. Baixe a planilha-modelo e não altere os nomes das colunas.',
    }
  }

  const linhas: LinhaBrutaClima[] = []
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i]
    if (!Array.isArray(row)) continue

    const valores: Record<string, unknown> = {}
    for (const [campo, idx] of Object.entries(colIndices)) {
      valores[campo] = row[idx]
    }

    const vazia = Object.values(valores).every((v) => norm(v) === '')
    if (vazia) continue

    linhas.push({ linha: i + 1, valores })
  }

  return { linhas }
}

export async function lerPlanilhaClima(file: File): Promise<ParseClimaResult> {
  const data = await file.arrayBuffer()
  const XLSX = await import('xlsx')
  // Sem cellDates: data e hora chegam como número serial do Excel, o que evita
  // deslocamentos de fuso em células de hora (Date de 1899) e é tratado por
  // parseData/parseHora.
  const workbook = XLSX.read(data, { type: 'array' })

  for (const sheetName of workbook.SheetNames) {
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][]
    const tentativa = parseLinhasClima(jsonData)
    if (!tentativa.erro) return tentativa
  }

  const primeira = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
  }) as unknown[][]
  return parseLinhasClima(primeira)
}

/** Hora "HH:mm" a partir de texto, fração de dia do Excel ou Date. NaN se inválida. */
export function parseHora(v: unknown): string | null | number {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) {
    const minutos = Math.round((v.getTime() % 86400000) / 60000 + 1440) % 1440
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
  }
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1) {
    const minutos = Math.round(v * 1440) % 1440
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
  }
  const m = (v ?? '').toString().trim().match(/^(\d{1,2})[:h](\d{2})(?::\d{2})?$/)
  if (m) {
    const h = parseInt(m[1])
    const min = parseInt(m[2])
    if (h <= 23 && min <= 59) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return NaN
}

/** Sim/Não: devolve true/false, null se vazio e undefined se o texto for inválido. */
export function parseSimNao(v: unknown): boolean | null | undefined {
  const t = norm(v)
  if (t === '') return null
  if (['sim', 's', 'verdadeiro', 'true', '1'].includes(t)) return true
  if (['nao', 'n', 'falso', 'false', '0'].includes(t)) return false
  return undefined
}

/** Converte data + hora de parede no fuso da fazenda para ISO UTC. */
export function fazendaDataHoraParaIso(data: string, hora: string): string {
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_FAZENDA,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${data}T${hora}:00Z`))
  const offset = (offsetParts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '')
  return new Date(`${data}T${hora}:00${offset}`).toISOString()
}

/** Chave "YYYY-MM-DD HH:mm" de um timestamptz no fuso da fazenda. */
export function chaveDataHoraFazenda(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_FAZENDA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  const hora = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hora}:${get('minute')}`
}

export interface RegistroClimaImportado {
  linha: number
  chave: string
  data: string
  localId: string
  responsavel: string
  tempoAtual: string | null
  choveu: boolean | null
  esvaziouPluviometros: boolean | null
  temperatura: number | null
  umidade: number | null
  observacao: string | null
  medicoes: {
    pluviometro_id: string
    pluviometro_nome: string
    pluviometro_localizacao: string | null
    medicao: number
    temperatura: number | null
    horario: string
  }[]
}

export interface ErroLinhaClima {
  linha: number
  erros: string[]
}

export interface ContextoClima {
  fazendaId: string
  pluviometros: PluviometroModelo[]
  /** Nomes de funcionários ativos; quando vazio, o responsável é texto livre. */
  responsaveis: string[]
  /** Chaves "YYYY-MM-DD HH:mm" (fuso da fazenda) já existentes no banco. */
  existentes: Set<string>
}

export interface ResultadoValidacaoClima {
  registros: RegistroClimaImportado[]
  errosLinhas: ErroLinhaClima[]
  duplicados: { linha: number; chave: string }[]
  /** Colunas "(mm)" da planilha que não correspondem a um pluviômetro ativo. */
  colunasDesconhecidas: string[]
}

/** Data de hoje (YYYY-MM-DD) no fuso da fazenda. */
export function hojeNaFazenda(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_FAZENDA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

/** True se a string YYYY-MM-DD é um dia real do calendário (rejeita 31/02). */
export function dataExiste(iso: string): boolean {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function casasDecimais(n: number): number {
  const s = n.toString()
  return s.includes('.') ? s.split('.')[1].length : 0
}

export function validarLinhasClima(
  linhas: LinhaBrutaClima[],
  ctx: ContextoClima,
  agora: Date = new Date()
): ResultadoValidacaoClima {
  const errosLinhas: ErroLinhaClima[] = []
  const duplicados: ResultadoValidacaoClima['duplicados'] = []
  const registros: RegistroClimaImportado[] = []
  const vistas = new Map<string, number>()
  const hoje = hojeNaFazenda(agora)

  const colunasPluv = ctx.pluviometros.map((p) => ({ p, chave: normHeader(nomeColunaPluviometro(p.nome)) }))
  const chavesFixas = new Set(
    [...COLUNAS_FIXAS_CLIMA, COLUNA_OBSERVACAO].map((c) => normHeader(c))
  )
  const chavesPluv = new Set(colunasPluv.map((c) => c.chave))
  const colunasDesconhecidas = linhas.length
    ? Object.keys(linhas[0].valores).filter((k) => !chavesFixas.has(k) && !chavesPluv.has(k))
    : []

  const responsaveisMap = new Map(ctx.responsaveis.map((n) => [norm(n), n]))

  for (const l of linhas) {
    const v = l.valores
    const erros: string[] = []

    const data = parseData(v['data'])
    if (data === null) erros.push('Data é obrigatória')
    else if (typeof data === 'number') erros.push('Data inválida (use dd/mm/aaaa)')
    else if (!dataExiste(data)) erros.push('Data inválida (o dia não existe no calendário)')
    else if (data > hoje) erros.push('Data no futuro: não é possível registrar uma leitura que ainda não aconteceu')
    else if (parseInt(data.slice(0, 4)) < ANO_MINIMO) erros.push(`Data anterior a ${ANO_MINIMO}`)

    const hora = parseHora(v['hora'])
    if (hora === null) erros.push('Hora é obrigatória (use hh:mm)')
    else if (typeof hora === 'number') erros.push('Hora inválida (use hh:mm, de 00:00 a 23:59)')
    else if (typeof data === 'string' && data === hoje && fazendaDataHoraParaIso(data, hora) > agora.toISOString()) {
      erros.push('Hora no futuro: a leitura ainda não aconteceu')
    }

    let responsavel = (v['responsavel'] ?? '').toString().trim().replace(/\s+/g, ' ')
    if (!responsavel) erros.push('Responsável é obrigatório')
    else if (ctx.responsaveis.length > 0) {
      const canonico = responsaveisMap.get(norm(responsavel))
      if (!canonico) erros.push(`Responsável "${responsavel}" não está cadastrado em Funcionários (escolha na lista)`)
      else responsavel = canonico
    } else if (responsavel.length > 100) {
      erros.push('Responsável muito longo (máximo 100 caracteres)')
    }

    let tempoAtual: string | null = null
    if (norm(v['tempo atual'])) {
      const rotulo = TEMPO_MAP.get(norm(v['tempo atual']))
      tempoAtual = rotulo ? TEMPO_VALOR_POR_ROTULO.get(rotulo) ?? null : null
      if (!tempoAtual) erros.push(`Tempo atual inválido (use: ${Object.values(TEMPO_ATUAL_LABELS).join(', ')})`)
    }

    const choveu = parseSimNao(v['choveu'])
    if (choveu === undefined) erros.push('Choveu deve ser Sim ou Não')
    const esvaziou = parseSimNao(v['esvaziou pluviometros'])
    if (esvaziou === undefined) erros.push('Esvaziou pluviômetros deve ser Sim ou Não')

    const temperatura = parseNumero(v['temperatura c'])
    if (temperatura !== null && (isNaN(temperatura) || temperatura < TEMPERATURA_MIN || temperatura > TEMPERATURA_MAX)) {
      erros.push(`Temperatura (°C) deve estar entre ${TEMPERATURA_MIN} e ${TEMPERATURA_MAX}`)
    } else if (temperatura !== null && casasDecimais(temperatura) > 1) {
      erros.push('Temperatura (°C) aceita no máximo 1 casa decimal')
    }
    const umidade = parseNumero(v['umidade relativa'])
    if (umidade !== null && (isNaN(umidade) || umidade < 0 || umidade > 100)) {
      erros.push('Umidade relativa (%) deve estar entre 0 e 100')
    }

    const medicoes: RegistroClimaImportado['medicoes'] = []
    for (const { p, chave } of colunasPluv) {
      const mm = parseNumero(v[chave])
      if (mm === null) continue
      const col = nomeColunaPluviometro(p.nome)
      if (isNaN(mm) || mm < 0) {
        erros.push(`${col} deve ser número maior ou igual a zero`)
        continue
      }
      if (mm > MM_MAXIMO) {
        erros.push(`${col}: ${mm} mm passa do máximo aceito (${MM_MAXIMO} mm); confira o valor`)
        continue
      }
      if (casasDecimais(mm) > 2) {
        erros.push(`${col} aceita no máximo 2 casas decimais`)
        continue
      }
      medicoes.push({
        pluviometro_id: p.id,
        pluviometro_nome: p.nome,
        pluviometro_localizacao: p.localizacao,
        medicao: mm,
        temperatura: temperatura as number | null,
        horario: typeof hora === 'string' ? hora : '',
      })
    }

    if (choveu === false && medicoes.some((m) => m.medicao > 0)) {
      erros.push('Choveu está como Não, mas há milímetros informados nos pluviômetros')
    }

    const observacao = (v['observacao'] ?? '').toString().trim()
    if (observacao.length > OBSERVACAO_MAX) {
      erros.push(`Observação muito longa (${observacao.length} caracteres; máximo ${OBSERVACAO_MAX})`)
    }

    if (erros.length > 0 || typeof data !== 'string' || typeof hora !== 'string') {
      errosLinhas.push({ linha: l.linha, erros })
      continue
    }

    const chave = `${data} ${hora}`
    const anterior = vistas.get(chave)
    if (anterior !== undefined) {
      errosLinhas.push({ linha: l.linha, erros: [`Mesma data e hora da linha ${anterior}`] })
      continue
    }
    vistas.set(chave, l.linha)

    if (ctx.existentes.has(chave)) {
      duplicados.push({ linha: l.linha, chave })
      continue
    }

    registros.push({
      linha: l.linha,
      chave,
      data: fazendaDataHoraParaIso(data, hora),
      localId: `painel-clima-${ctx.fazendaId}-${data}T${hora}`,
      responsavel,
      tempoAtual,
      choveu: choveu ?? null,
      esvaziouPluviometros: esvaziou ?? null,
      temperatura: temperatura as number | null,
      umidade: umidade as number | null,
      observacao: observacao || null,
      medicoes,
    })
  }

  return { registros, errosLinhas, duplicados, colunasDesconhecidas }
}

export async function carregarContextoClima(
  fazendaId: string,
  pluviometros: PluviometroModelo[],
  responsaveis: string[],
  linhas: LinhaBrutaClima[]
): Promise<ContextoClima> {
  const datas = linhas
    .map((l) => parseData(l.valores['data']))
    .filter((d): d is string => typeof d === 'string')
    .sort()

  const existentes = new Set<string>()
  if (datas.length > 0) {
    // Margem de 1 dia para cobrir a virada de fuso (UTC x Cuiabá)
    const inicio = new Date(`${datas[0]}T00:00:00Z`)
    inicio.setUTCDate(inicio.getUTCDate() - 1)
    const fim = new Date(`${datas[datas.length - 1]}T00:00:00Z`)
    fim.setUTCDate(fim.getUTCDate() + 2)

    const { data, error } = await supabase
      .from('registros_clima')
      .select('data')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .gte('data', inicio.toISOString())
      .lt('data', fim.toISOString())
      .limit(5000)
    if (error) throw new Error(`Erro ao consultar registros existentes: ${error.message}`)
    for (const r of data || []) existentes.add(chaveDataHoraFazenda((r as { data: string }).data))
  }

  return { fazendaId, pluviometros, responsaveis, existentes }
}

export interface FalhaClima {
  linha: number
  erro: string
}

function montarPayload(r: RegistroClimaImportado, fazendaId: string, nomeUsuario: string) {
  const comTemp = r.medicoes.filter((m) => m.temperatura !== null)
  return {
    fazenda_id: fazendaId,
    nome_usuario: nomeUsuario,
    data: r.data,
    responsavel: r.responsavel,
    tempo_atual: r.tempoAtual,
    choveu: r.choveu,
    esvaziou_pluviometros: r.esvaziouPluviometros,
    // Mesma regra da RPC de edição: média das temperaturas das medições; sem
    // medições, vale a temperatura informada na linha.
    temperatura_media: comTemp.length > 0 ? Math.round((comTemp.reduce((s, m) => s + (m.temperatura as number), 0) / comTemp.length) * 10) / 10 : r.temperatura,
    umidade_relativa: r.umidade,
    observacao: r.observacao,
    medicoes: r.medicoes,
    local_id: r.localId,
    sync_status: 'synced',
    version: 1,
  }
}

export async function importarClimaValidos(
  registros: RegistroClimaImportado[],
  fazendaId: string,
  nomeUsuario: string
): Promise<{ importados: number; falhas: FalhaClima[] }> {
  const falhas: FalhaClima[] = []
  let importados = 0

  // Um insert por registro: isola falhas (ex.: local_id já existente) sem
  // derrubar o lote inteiro.
  for (const r of registros) {
    const { error } = await supabase.from('registros_clima').insert(montarPayload(r, fazendaId, nomeUsuario))
    if (error) falhas.push({ linha: r.linha, erro: error.message })
    else importados++
  }

  return { importados, falhas }
}

export interface ResumoImportacaoClima {
  importados: number
  duplicados: { linha: number; chave: string }[]
  errosLinhas: ErroLinhaClima[]
  falhasBanco: FalhaClima[]
  totalLinhas: number
}
