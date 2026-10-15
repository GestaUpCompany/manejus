// Cores e textos compartilhados pelas telas da Auditoria 5S (visão geral, por setor, lista e detalhe).

import type { Tendencia } from './porSetor'

export const COR_OK = '#10B981'
export const COR_ALERTA = '#F59E0B'
export const COR_RUIM = '#EF4444'
export const COR_NEUTRA = '#9CA3AF'
export const COR_NOTA = '#2563EB'

/** Conformidade: >= 90 verde, >= 70 âmbar, abaixo vermelho. */
export const corPercentual = (p: number | null | undefined) => (typeof p !== 'number' ? COR_NEUTRA : p >= 90 ? COR_OK : p >= 70 ? COR_ALERTA : COR_RUIM)

/** Nota de 0 a 5: >= 4 verde, >= 2 âmbar, abaixo vermelho. */
export const corNota = (n: number | null | undefined) => (typeof n !== 'number' ? COR_NEUTRA : n >= 4 ? COR_OK : n >= 2 ? COR_ALERTA : COR_RUIM)

export const textoPercentual = (p: number | null | undefined) =>
  typeof p !== 'number' ? '-' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export const textoNota = (n: number | null | undefined) =>
  typeof n !== 'number' ? '-' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/5`

export const textoDelta = (d: number | null) => (d === null ? '' : `${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`)

export const SETA_TENDENCIA: Record<Tendencia, string> = { alta: '▲', baixa: '▼', estavel: '=' }

export const corTendencia = (t: Tendencia | null) => (t === 'alta' ? COR_OK : t === 'baixa' ? COR_RUIM : COR_NEUTRA)

/** Série categórica (cores distinguíveis; a mesma ordem de setores gera sempre as mesmas cores). */
export const PALETA_SERIES = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#0EA5E9', '#A855F7']

export const corDaSerie = (indice: number) => PALETA_SERIES[indice % PALETA_SERIES.length]

/** dd/mm de uma data ISO (sem depender do fuso do navegador). */
export const rotuloDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export const rotuloPeriodo = (periodo: string, agrupamento: 'semana' | 'mes') =>
  agrupamento === 'mes' ? `${periodo.slice(5, 7)}/${periodo.slice(0, 4)}` : rotuloDia(periodo)

export const textoDiasDesde = (dias: number | null) => (dias === null ? 'sem auditoria' : dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`)

export const LABEL = 'block text-xs sm:text-sm font-medium text-content mb-1 leading-tight'
export const SELECT =
  'w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary/40'
