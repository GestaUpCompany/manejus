/**
 * Taxa de prenhez dos protocolos de IATF. Cada Inseminação ligada a um lote de protocolo (eventos_reprodutivos.protocolo_lote_id)
 * é uma tentativa. O resultado dela é o diagnóstico mais recente da mesma fêmea feito a partir da data da IA e ANTES da próxima
 * cobertura/IA dela (um diagnóstico de outro ciclo não é atribuído a esta tentativa). Diagnóstico "Inconclusivo" não entra na
 * taxa sobre diagnosticadas. Tudo é leitura: nada aqui grava no banco.
 */

export type DimensaoIatf = 'protocolo' | 'lote' | 'touro' | 'semen' | 'tecnico'

export const DIMENSOES_IATF: { value: DimensaoIatf; label: string }[] = [
  { value: 'protocolo', label: 'Protocolo' },
  { value: 'lote', label: 'Lote de protocolo' },
  { value: 'touro', label: 'Touro / sêmen' },
  { value: 'semen', label: 'Partida do sêmen' },
  { value: 'tecnico', label: 'Inseminador' },
]

export interface InseminacaoIatf {
  id: string
  individuo_id: string
  data: string
  touro_nome: string | null
  semen_partida: string | null
  tecnico: string | null
  protocolo_lote_id: string
  lote_nome: string
  protocolo_nome: string
}

/** Qualquer evento da fêmea que importa para achar o diagnóstico e o limite do ciclo. */
export interface EventoDaFemeaIatf {
  id: string
  individuo_id: string
  tipo: string
  data: string
  created_at?: string
  resultado: string | null
}

export type ResultadoTentativa = 'Prenha' | 'Vazia' | 'Inconclusivo' | 'Sem diagnóstico'

export interface Tentativa extends InseminacaoIatf {
  resultado: ResultadoTentativa
}

export interface LinhaRelatorioIatf {
  chave: string
  inseminadas: number
  prenhes: number
  vazias: number
  inconclusivas: number
  semDiagnostico: number
  /** prenhes / inseminadas (0 a 100) */
  taxaSobreInseminadas: number | null
  /** prenhes / (prenhes + vazias) (0 a 100) */
  taxaSobreDiagnosticadas: number | null
}

const SEM_INFORMACAO = 'Não informado'

const arredondar = (n: number) => Math.round(n * 10) / 10

/** Resultado de cada IA do lote de protocolo. */
export function tentativasIatf(inseminacoes: InseminacaoIatf[], eventos: EventoDaFemeaIatf[]): Tentativa[] {
  const porFemea = new Map<string, EventoDaFemeaIatf[]>()
  for (const e of eventos) {
    const lista = porFemea.get(e.individuo_id)
    if (lista) lista.push(e)
    else porFemea.set(e.individuo_id, [e])
  }
  return inseminacoes.map((ia) => {
    const doAnimal = porFemea.get(ia.individuo_id) ?? []
    // Limite do ciclo: a próxima cobertura/IA da fêmea em data posterior à desta IA
    const proximoCiclo = doAnimal
      .filter((e) => (e.tipo === 'Cobertura' || e.tipo === 'Inseminação') && e.id !== ia.id && e.data > ia.data)
      .map((e) => e.data)
      .sort()[0]
    const diag = doAnimal
      .filter((e) => e.tipo === 'Diagnóstico de gestação' && e.data >= ia.data && (!proximoCiclo || e.data < proximoCiclo))
      .sort((a, b) => b.data.localeCompare(a.data) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
    const resultado: ResultadoTentativa =
      !diag ? 'Sem diagnóstico' : diag.resultado === 'Prenha' ? 'Prenha' : diag.resultado === 'Vazia' ? 'Vazia' : 'Inconclusivo'
    return { ...ia, resultado }
  })
}

const chaveDaDimensao = (t: Tentativa, dim: DimensaoIatf): string => {
  const limpo = (v: string | null) => (v && v.trim() !== '' ? v.trim() : SEM_INFORMACAO)
  switch (dim) {
    case 'protocolo':
      return limpo(t.protocolo_nome)
    case 'lote':
      return limpo(t.lote_nome)
    case 'touro':
      return limpo(t.touro_nome)
    case 'semen':
      return limpo(t.semen_partida)
    case 'tecnico':
      return limpo(t.tecnico)
  }
}

function linhaDe(chave: string, tentativas: Tentativa[]): LinhaRelatorioIatf {
  const conta = (r: ResultadoTentativa) => tentativas.filter((t) => t.resultado === r).length
  const prenhes = conta('Prenha')
  const vazias = conta('Vazia')
  const conclusivas = prenhes + vazias
  return {
    chave,
    inseminadas: tentativas.length,
    prenhes,
    vazias,
    inconclusivas: conta('Inconclusivo'),
    semDiagnostico: conta('Sem diagnóstico'),
    taxaSobreInseminadas: tentativas.length > 0 ? arredondar((prenhes / tentativas.length) * 100) : null,
    taxaSobreDiagnosticadas: conclusivas > 0 ? arredondar((prenhes / conclusivas) * 100) : null,
  }
}

/** Uma linha por valor da dimensão, da maior para a menor quantidade de IAs; "Não informado" vai por último. */
export function agruparTentativas(tentativas: Tentativa[], dim: DimensaoIatf): LinhaRelatorioIatf[] {
  const grupos = new Map<string, Tentativa[]>()
  for (const t of tentativas) {
    const k = chaveDaDimensao(t, dim)
    const g = grupos.get(k)
    if (g) g.push(t)
    else grupos.set(k, [t])
  }
  return [...grupos.entries()]
    .map(([chave, lista]) => linhaDe(chave, lista))
    .sort((a, b) => {
      if (a.chave === SEM_INFORMACAO) return 1
      if (b.chave === SEM_INFORMACAO) return -1
      return b.inseminadas - a.inseminadas || a.chave.localeCompare(b.chave, 'pt-BR')
    })
}

export function totalIatf(tentativas: Tentativa[]): LinhaRelatorioIatf {
  return linhaDe('Total', tentativas)
}

export const formatarTaxa = (t: number | null): string => (t == null ? '-' : `${t.toLocaleString('pt-BR')}%`)

/** Colunas do Excel do relatório (a linha vem de agruparTentativas). */
export const RELATORIO_IATF_EXPORT_CONFIG = {
  tableName: 'relatorio_iatf',
  sheetName: 'Taxa de prenhez IATF',
  columns: [
    { source: 'chave', header: 'Grupo' },
    { source: 'inseminadas', header: 'Inseminadas' },
    { source: 'prenhes', header: 'Prenhes' },
    { source: 'vazias', header: 'Vazias' },
    { source: 'inconclusivas', header: 'Inconclusivas' },
    { source: 'semDiagnostico', header: 'Sem diagnóstico' },
    { source: 'taxaSobreInseminadas', header: 'Taxa sobre inseminadas (%)' },
    { source: 'taxaSobreDiagnosticadas', header: 'Taxa sobre diagnosticadas (%)' },
  ],
}
