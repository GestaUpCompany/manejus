// Visão por setor da Auditoria 5S (macro: comparar setores; micro: evolução de um setor).
// Funções puras, sem acesso a rede, para as telas do Painel (pages/controller/Auditoria5s*.tsx) e testes.
//
// Regras que valem para tudo aqui:
//  * A chave do setor é a MESMA das pendências (setor_id, ou o nome em minúsculas quando não há id), para que
//    cartão, ranking e pendência falem do mesmo setor. O nome exibido é o do registro mais recente (setor renomeado
//    mantém o histórico pelo id).
//  * Nota 0 é nota: compara-se `typeof === 'number'`, nunca valor falsy. Auditoria antiga (sem nota) entra na
//    conformidade, mas não na nota.
//  * Tendência = última nota vs nota anterior do mesmo setor (só auditorias com nota); null com menos de 2.

import { SECOES_5S } from './itens'
import { inicioDaSemana, notaMedia, porPilar, rankingItens, resultadoRegistro, type RegistroAuditoria5s } from './agregacao'
import type { PendenciaAberta5s } from '../pendencias5s/calculo'

/** Auditoria sem registro há mais que isso é sinalizada como "antiga". */
export const LIMIAR_AUDITORIA_ANTIGA_DIAS = 30

const instante = (iso: string): number => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

const percentualDe = (conformes: number, respondidos: number): number | null =>
  respondidos > 0 ? Math.round((conformes / respondidos) * 10000) / 100 : null

const arredonda1 = (n: number) => Math.round(n * 10) / 10

const diasEntre = (deIso: string, ateIso: string): number => Math.max(0, Math.floor((instante(ateIso) - instante(deIso)) / 86_400_000))

export function chaveSetor(r: Pick<RegistroAuditoria5s, 'setor_id' | 'setor'>): string {
  return r.setor_id || (r.setor ?? '').trim().toLowerCase() || 'sem-setor'
}

export interface GrupoSetor {
  chave: string
  nome: string
  /** `data` crescente. */
  registros: RegistroAuditoria5s[]
}

export function agruparPorSetor(registros: RegistroAuditoria5s[]): GrupoSetor[] {
  const grupos = new Map<string, GrupoSetor & { ultima: number }>()
  for (const r of registros) {
    const chave = chaveSetor(r)
    const nome = (r.setor ?? '').trim() || 'Sem setor'
    const grupo = grupos.get(chave) ?? { chave, nome, registros: [], ultima: -1 }
    grupo.registros.push(r)
    if (instante(r.data) >= grupo.ultima) {
      grupo.ultima = instante(r.data)
      grupo.nome = nome
    }
    grupos.set(chave, grupo)
  }
  return [...grupos.values()].map(({ ultima: _ultima, ...g }) => ({ ...g, registros: [...g.registros].sort((a, b) => instante(a.data) - instante(b.data)) }))
}

export type Tendencia = 'alta' | 'baixa' | 'estavel'

export interface ResumoSetor {
  chave: string
  nome: string
  auditorias: number
  notaMedia: number | null
  ultimaNota: number | null
  notaAnterior: number | null
  /** Última nota menos a anterior (null com menos de 2 notas). */
  delta: number | null
  tendencia: Tendencia | null
  /** Conformidade ponderada pelos itens respondidos (C+N). */
  percentual: number | null
  naoConformes: number
  ultimaData: string | null
  diasDesdeUltima: number | null
}

export function resumirSetor(grupo: GrupoSetor, agoraIso: string): ResumoSetor {
  const { registros } = grupo
  let conformes = 0
  let naoConformes = 0
  for (const r of registros) {
    const res = resultadoRegistro(r)
    conformes += res.conformes
    naoConformes += res.naoConformes
  }
  const notas = registros.filter((r) => typeof r.nota_geral === 'number').map((r) => r.nota_geral as number)
  const ultimaNota = notas.length > 0 ? notas[notas.length - 1] : null
  const notaAnterior = notas.length > 1 ? notas[notas.length - 2] : null
  const delta = ultimaNota !== null && notaAnterior !== null ? arredonda1(ultimaNota - notaAnterior) : null
  const ultimaData = registros.length > 0 ? registros[registros.length - 1].data : null
  return {
    chave: grupo.chave,
    nome: grupo.nome,
    auditorias: registros.length,
    notaMedia: notaMedia(registros),
    ultimaNota,
    notaAnterior,
    delta,
    tendencia: delta === null ? null : delta > 0 ? 'alta' : delta < 0 ? 'baixa' : 'estavel',
    percentual: percentualDe(conformes, conformes + naoConformes),
    naoConformes,
    ultimaData,
    diasDesdeUltima: ultimaData ? diasEntre(ultimaData, agoraIso) : null,
  }
}

export interface LinhaSetorDetalhada extends ResumoSetor {
  pendenciasAbertas: number
  /** Últimas notas (mais antiga primeiro) para o mini-gráfico; só auditorias com nota. */
  serieNotas: number[]
  /** Setor cadastrado sem nenhuma auditoria no conjunto. */
  semAuditoria: boolean
}

/**
 * Uma linha por setor: os que têm auditoria no conjunto (já filtrado por período/responsável) e, opcionalmente, os
 * cadastrados sem auditoria (esmaecidos na tela). `pendenciasPorChave` vem do estado ATUAL (histórico inteiro).
 */
export function linhasDosSetores(
  registros: RegistroAuditoria5s[],
  agoraIso: string,
  opcoes: {
    pendenciasPorChave?: Map<string, number>
    cadastrados?: { id: string; nome: string }[]
    pontosSparkline?: number
  } = {}
): LinhaSetorDetalhada[] {
  const { pendenciasPorChave = new Map<string, number>(), cadastrados = [], pontosSparkline = 8 } = opcoes
  const linhas: LinhaSetorDetalhada[] = agruparPorSetor(registros).map((g) => ({
    ...resumirSetor(g, agoraIso),
    pendenciasAbertas: pendenciasPorChave.get(g.chave) ?? 0,
    serieNotas: g.registros.filter((r) => typeof r.nota_geral === 'number').map((r) => r.nota_geral as number).slice(-pontosSparkline),
    semAuditoria: false,
  }))
  const chaves = new Set(linhas.map((l) => l.chave))
  const nomes = new Set(linhas.map((l) => l.nome.toLowerCase().trim()))
  for (const s of cadastrados) {
    if (chaves.has(s.id) || nomes.has(s.nome.toLowerCase().trim())) continue
    linhas.push({
      chave: s.id,
      nome: s.nome,
      auditorias: 0,
      notaMedia: null,
      ultimaNota: null,
      notaAnterior: null,
      delta: null,
      tendencia: null,
      percentual: null,
      naoConformes: 0,
      ultimaData: null,
      diasDesdeUltima: null,
      pendenciasAbertas: pendenciasPorChave.get(s.id) ?? 0,
      serieNotas: [],
      semAuditoria: true,
    })
  }
  return linhas
}

export type CriterioOrdem = 'pior-nota' | 'mais-pendencias' | 'mais-antiga' | 'nome'

/** Ordena para a grade de cartões; setor sem dado (nota, auditoria) vai sempre para o fim. */
export function ordenarLinhas(linhas: LinhaSetorDetalhada[], criterio: CriterioOrdem): LinhaSetorDetalhada[] {
  const porNome = (a: LinhaSetorDetalhada, b: LinhaSetorDetalhada) => a.nome.localeCompare(b.nome)
  const comFim = (v: number | null, fim: number) => (v === null ? fim : v)
  const copia = [...linhas]
  switch (criterio) {
    case 'pior-nota':
      return copia.sort((a, b) => comFim(a.ultimaNota, 99) - comFim(b.ultimaNota, 99) || comFim(a.percentual, 101) - comFim(b.percentual, 101) || porNome(a, b))
    case 'mais-pendencias':
      return copia.sort((a, b) => b.pendenciasAbertas - a.pendenciasAbertas || porNome(a, b))
    case 'mais-antiga':
      return copia.sort((a, b) => comFim(b.diasDesdeUltima, -1) - comFim(a.diasDesdeUltima, -1) || porNome(a, b))
    default:
      return copia.sort(porNome)
  }
}

export interface PontoAuditoria {
  id: string
  data: string
  responsavel: string | null
  nota: number | null
  percentual: number | null
  naoConformes: number
}

/** Um ponto por auditoria do setor (poucos pontos: não agrega). */
export function serieSetor(registros: RegistroAuditoria5s[]): PontoAuditoria[] {
  return [...registros]
    .sort((a, b) => instante(a.data) - instante(b.data))
    .map((r) => {
      const res = resultadoRegistro(r)
      return {
        id: r.id,
        data: r.data,
        responsavel: r.responsavel,
        nota: typeof r.nota_geral === 'number' ? r.nota_geral : null,
        percentual: res.percentual,
        naoConformes: res.naoConformes,
      }
    })
}

export type MetricaComparacao = 'nota' | 'percentual'

export interface PontoMulti {
  periodo: string
  /** Média da fazenda no período (todas as auditorias, não só dos setores selecionados). */
  media: number | null
  [chave: string]: number | string | null
}

/**
 * Período × setor para o gráfico comparativo. Cada valor é a média da métrica das auditorias do setor no período
 * (nota 0 a 5, ou conformidade 0 a 100); null quando o setor não tem dado ali (o gráfico liga os pontos).
 */
export function serieMultiSetor(
  registros: RegistroAuditoria5s[],
  agrupamento: 'semana' | 'mes',
  metrica: MetricaComparacao
): { setores: { chave: string; nome: string }[]; pontos: PontoMulti[] } {
  const valorDe = (r: RegistroAuditoria5s): number | null => (metrica === 'nota' ? (typeof r.nota_geral === 'number' ? r.nota_geral : null) : resultadoRegistro(r).percentual)
  const periodoDe = (r: RegistroAuditoria5s) => {
    const dia = r.data.slice(0, 10)
    return agrupamento === 'mes' ? dia.slice(0, 7) : inicioDaSemana(dia)
  }
  const media = (valores: number[]) => (valores.length > 0 ? arredonda1(valores.reduce((a, b) => a + b, 0) / valores.length) : null)

  const grupos = agruparPorSetor(registros)
  const periodos = new Map<string, { todos: number[]; porSetor: Map<string, number[]> }>()
  for (const g of grupos) {
    for (const r of g.registros) {
      const v = valorDe(r)
      if (v === null) continue
      const p = periodoDe(r)
      const entrada = periodos.get(p) ?? { todos: [], porSetor: new Map<string, number[]>() }
      entrada.todos.push(v)
      entrada.porSetor.set(g.chave, [...(entrada.porSetor.get(g.chave) ?? []), v])
      periodos.set(p, entrada)
    }
  }
  const pontos = [...periodos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, e]) => {
      const ponto: PontoMulti = { periodo, media: media(e.todos) }
      for (const g of grupos) ponto[g.chave] = media(e.porSetor.get(g.chave) ?? [])
      return ponto
    })
  return { setores: grupos.map((g) => ({ chave: g.chave, nome: g.nome })), pontos }
}

/** Setores a destacar por padrão no comparativo: todos se couberem, senão os de pior nota média. */
export function setoresPadraoComparacao(linhas: Pick<LinhaSetorDetalhada, 'chave' | 'notaMedia' | 'percentual' | 'semAuditoria'>[], max = 6): string[] {
  const comDado = linhas.filter((l) => !l.semAuditoria)
  if (comDado.length <= max) return comDado.map((l) => l.chave)
  return [...comDado]
    .sort((a, b) => (a.notaMedia ?? 99) - (b.notaMedia ?? 99) || (a.percentual ?? 101) - (b.percentual ?? 101))
    .slice(0, Math.max(1, max - 1))
    .map((l) => l.chave)
}

export interface PontoPilares {
  id: string
  data: string
  /** pilar (id) -> conformidade % */
  [pilar: string]: number | string | null
}

/** Conformidade por pilar a cada auditoria do setor. */
export function evolucaoPilaresSetor(registros: RegistroAuditoria5s[]): PontoPilares[] {
  return [...registros]
    .sort((a, b) => instante(a.data) - instante(b.data))
    .map((r) => {
      const res = resultadoRegistro(r)
      const ponto: PontoPilares = { id: r.id, data: r.data }
      SECOES_5S.forEach((s, i) => {
        ponto[s.id] = res.secoes[i].percentual
      })
      return ponto
    })
}

export interface LinhaMatriz {
  chave: string
  nome: string
  /** Na ordem de SECOES_5S; null = sem item avaliado no pilar. */
  pilares: (number | null)[]
  percentual: number | null
}

/** Mapa de calor: conformidade % por setor × pilar. */
export function matrizSetorPilar(registros: RegistroAuditoria5s[]): LinhaMatriz[] {
  return agruparPorSetor(registros)
    .map((g) => ({
      chave: g.chave,
      nome: g.nome,
      pilares: porPilar(g.registros).map((p) => p.percentual),
      percentual: resumirSetor(g, new Date().toISOString()).percentual,
    }))
    .sort((a, b) => (a.percentual ?? 101) - (b.percentual ?? 101) || a.nome.localeCompare(b.nome))
}

export interface ComparativoPilar {
  id: string
  titulo: string
  /** Auditoria mais recente do setor. */
  atual: number | null
  mediaSetor: number | null
  mediaFazenda: number | null
}

export function pilaresSetorVsFazenda(registrosSetor: RegistroAuditoria5s[], registrosFazenda: RegistroAuditoria5s[]): ComparativoPilar[] {
  const ordenados = [...registrosSetor].sort((a, b) => instante(a.data) - instante(b.data))
  const ultima = ordenados.length > 0 ? resultadoRegistro(ordenados[ordenados.length - 1]) : null
  const doSetor = porPilar(registrosSetor)
  const daFazenda = porPilar(registrosFazenda)
  return SECOES_5S.map((s, i) => ({
    id: s.id,
    titulo: s.titulo,
    atual: ultima ? ultima.secoes[i].percentual : null,
    mediaSetor: doSetor[i].percentual,
    mediaFazenda: daFazenda[i].percentual,
  }))
}

export interface ItemRecorrente {
  chave: string
  negativa: string
  secao: string
  naoConformes: number
  /** Auditorias do período em que o item foi avaliado (C ou N). */
  avaliacoes: number
  percentualNaoConforme: number
  ultimaOcorrencia: string | null
  /** `aberta` = pendência ativa agora; `resolvida` = houve N no período e hoje está fechada. */
  situacao: 'aberta' | 'resolvida'
  desde: string | null
  observacao: string
  fotoUrl: string | null
}

/**
 * Itens mais marcados N num setor, com a situação ATUAL (pendência aberta ou resolvida) e a evidência mais recente.
 * `registros` = auditorias do período; `abertas` = pendências abertas do setor (histórico inteiro).
 */
export function itensRecorrentesSetor(registros: RegistroAuditoria5s[], abertas: Pick<PendenciaAberta5s, 'chave' | 'desde'>[]): ItemRecorrente[] {
  const abertasPorChave = new Map(abertas.map((p) => [p.chave, p]))
  const ordenados = [...registros].sort((a, b) => instante(a.data) - instante(b.data))
  return rankingItens(registros).map((linha) => {
    let ultimaOcorrencia: string | null = null
    let observacao = ''
    let fotoUrl: string | null = null
    for (const r of ordenados) {
      if (r.itens?.[linha.chave] !== 'N') continue
      ultimaOcorrencia = r.data
      const ev = r.nao_conformidades?.[linha.chave]
      const obs = typeof ev?.observacao === 'string' ? ev.observacao.trim() : ''
      if (obs) observacao = obs
      if (typeof ev?.foto_url === 'string' && ev.foto_url) fotoUrl = ev.foto_url
    }
    const aberta = abertasPorChave.get(linha.chave)
    return {
      chave: linha.chave,
      negativa: linha.negativa,
      secao: linha.secao,
      naoConformes: linha.naoConformes,
      avaliacoes: linha.respondidos,
      percentualNaoConforme: linha.percentualNaoConforme,
      ultimaOcorrencia,
      situacao: aberta ? 'aberta' : 'resolvida',
      desde: aberta?.desde ?? null,
      observacao,
      fotoUrl,
    }
  })
}

/** Setores (por chave) afetados por cada item N no conjunto: usado na tabela global de itens críticos. */
export function setoresPorItem(registros: RegistroAuditoria5s[]): Map<string, number> {
  const mapa = new Map<string, Set<string>>()
  for (const r of registros) {
    for (const [chave, resposta] of Object.entries(r.itens ?? {})) {
      if (resposta !== 'N') continue
      const conjunto = mapa.get(chave) ?? new Set<string>()
      conjunto.add(chaveSetor(r))
      mapa.set(chave, conjunto)
    }
  }
  return new Map([...mapa.entries()].map(([k, v]) => [k, v.size]))
}
