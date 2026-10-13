// Agregações da Auditoria 5S (registros_auditoria_5s). Funções puras, sem acesso a rede, para a tela
// do Painel (pages/controller/Auditoria5s.tsx) e para testes.
//
// O percentual é sempre recalculado a partir de `itens` (C/N), não dos totais gravados pelo PWA:
// assim uma auditoria antiga ou editada continua coerente com as respostas.

import { SECOES_5S } from './itens'

export interface RegistroAuditoria5s {
  id: string
  data: string
  setor: string | null
  setor_id: string | null
  responsavel: string | null
  nome_usuario?: string | null
  itens: Record<string, string> | null
  observacoes: Record<string, string> | null
}

export interface ResultadoSecao {
  id: string
  titulo: string
  conformes: number
  naoConformes: number
  percentual: number | null
}

export interface ResultadoRegistro {
  conformes: number
  naoConformes: number
  percentual: number | null
  secoes: ResultadoSecao[]
}

const percentualDe = (conformes: number, respondidos: number): number | null =>
  respondidos > 0 ? Math.round((conformes / respondidos) * 10000) / 100 : null

export function resultadoRegistro(registro: Pick<RegistroAuditoria5s, 'itens'>): ResultadoRegistro {
  const itens = registro.itens ?? {}
  const secoes = SECOES_5S.map((secao) => {
    let conformes = 0
    let naoConformes = 0
    for (const { chave } of secao.itens) {
      if (itens[chave] === 'C') conformes++
      else if (itens[chave] === 'N') naoConformes++
    }
    return { id: secao.id, titulo: secao.titulo, conformes, naoConformes, percentual: percentualDe(conformes, conformes + naoConformes) }
  })
  const conformes = secoes.reduce((acc, s) => acc + s.conformes, 0)
  const naoConformes = secoes.reduce((acc, s) => acc + s.naoConformes, 0)
  return { conformes, naoConformes, percentual: percentualDe(conformes, conformes + naoConformes), secoes }
}

/** Soma C/N de várias auditorias e devolve o percentual ponderado pelos itens respondidos. */
function somar(registros: Pick<RegistroAuditoria5s, 'itens'>[]) {
  let conformes = 0
  let naoConformes = 0
  for (const r of registros) {
    const res = resultadoRegistro(r)
    conformes += res.conformes
    naoConformes += res.naoConformes
  }
  return { conformes, naoConformes, percentual: percentualDe(conformes, conformes + naoConformes) }
}

export interface ResumoGeral {
  auditorias: number
  percentual: number | null
  itensNaoConformes: number
  setoresAuditados: number
}

export function resumoGeral(registros: RegistroAuditoria5s[]): ResumoGeral {
  const total = somar(registros)
  const setores = new Set(registros.map((r) => r.setor_id || r.setor).filter(Boolean))
  return {
    auditorias: registros.length,
    percentual: total.percentual,
    itensNaoConformes: total.naoConformes,
    setoresAuditados: setores.size,
  }
}

export interface LinhaSetor {
  setor: string
  auditorias: number
  percentual: number | null
  ultimaData: string
}

/** Pior conformidade primeiro (é onde a atenção precisa ir). */
export function porSetor(registros: RegistroAuditoria5s[]): LinhaSetor[] {
  const grupos = new Map<string, RegistroAuditoria5s[]>()
  for (const r of registros) {
    const nome = r.setor || 'Sem setor'
    grupos.set(nome, [...(grupos.get(nome) ?? []), r])
  }
  return [...grupos.entries()]
    .map(([setor, lista]) => ({
      setor,
      auditorias: lista.length,
      percentual: somar(lista).percentual,
      ultimaData: lista.reduce((max, r) => (r.data > max ? r.data : max), ''),
    }))
    .sort((a, b) => (a.percentual ?? 101) - (b.percentual ?? 101) || a.setor.localeCompare(b.setor))
}

export interface LinhaPilar {
  id: string
  titulo: string
  percentual: number | null
}

export function porPilar(registros: RegistroAuditoria5s[]): LinhaPilar[] {
  return SECOES_5S.map((secao, indice) => {
    let conformes = 0
    let respondidos = 0
    for (const r of registros) {
      const s = resultadoRegistro(r).secoes[indice]
      conformes += s.conformes
      respondidos += s.conformes + s.naoConformes
    }
    return { id: secao.id, titulo: secao.titulo, percentual: percentualDe(conformes, respondidos) }
  })
}

export interface LinhaItem {
  chave: string
  texto: string
  /** Não conformidade como afirmação (ex.: "Há material em desuso no local."). */
  negativa: string
  secao: string
  naoConformes: number
  respondidos: number
  percentualNaoConforme: number
}

/** Itens mais marcados como N, do pior para o melhor. Itens sem nenhum N ficam de fora. */
export function rankingItens(registros: RegistroAuditoria5s[]): LinhaItem[] {
  const linhas: LinhaItem[] = []
  for (const secao of SECOES_5S) {
    for (const item of secao.itens) {
      let naoConformes = 0
      let respondidos = 0
      for (const r of registros) {
        const v = r.itens?.[item.chave]
        if (v === 'N') naoConformes++
        if (v === 'C' || v === 'N') respondidos++
      }
      if (naoConformes > 0) {
        linhas.push({
          chave: item.chave,
          texto: item.texto,
          negativa: item.negativa,
          secao: secao.titulo,
          naoConformes,
          respondidos,
          percentualNaoConforme: Math.round((naoConformes / respondidos) * 10000) / 100,
        })
      }
    }
  }
  return linhas.sort((a, b) => b.naoConformes - a.naoConformes || b.percentualNaoConforme - a.percentualNaoConforme)
}

export interface PontoEvolucao {
  periodo: string
  auditorias: number
  percentual: number | null
}

/** Segunda-feira da semana da data (YYYY-MM-DD), em UTC para não depender do fuso do navegador. */
function inicioDaSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  const deslocamento = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - deslocamento)
  return d.toISOString().slice(0, 10)
}

export function evolucao(registros: RegistroAuditoria5s[], agrupamento: 'semana' | 'mes'): PontoEvolucao[] {
  const grupos = new Map<string, RegistroAuditoria5s[]>()
  for (const r of registros) {
    const dia = r.data.slice(0, 10)
    const chave = agrupamento === 'mes' ? dia.slice(0, 7) : inicioDaSemana(dia)
    grupos.set(chave, [...(grupos.get(chave) ?? []), r])
  }
  return [...grupos.entries()]
    .map(([periodo, lista]) => ({ periodo, auditorias: lista.length, percentual: somar(lista).percentual }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
}

export interface LinhaResponsavel {
  responsavel: string
  auditorias: number
  percentual: number | null
}

export function porResponsavel(registros: RegistroAuditoria5s[]): LinhaResponsavel[] {
  const grupos = new Map<string, RegistroAuditoria5s[]>()
  for (const r of registros) {
    const nome = r.responsavel || 'Sem responsável'
    grupos.set(nome, [...(grupos.get(nome) ?? []), r])
  }
  return [...grupos.entries()]
    .map(([responsavel, lista]) => ({ responsavel, auditorias: lista.length, percentual: somar(lista).percentual }))
    .sort((a, b) => b.auditorias - a.auditorias || a.responsavel.localeCompare(b.responsavel))
}

/** Setores cadastrados que não tiveram nenhuma auditoria no conjunto de registros (cobertura). */
export function setoresSemAuditoria(
  setoresCadastrados: { id: string; nome: string }[],
  registros: Pick<RegistroAuditoria5s, 'setor_id' | 'setor'>[]
): string[] {
  const auditadosIds = new Set(registros.map((r) => r.setor_id).filter(Boolean))
  const auditadosNomes = new Set(registros.map((r) => r.setor?.toLowerCase().trim()).filter(Boolean))
  return setoresCadastrados
    .filter((s) => !auditadosIds.has(s.id) && !auditadosNomes.has(s.nome.toLowerCase().trim()))
    .map((s) => s.nome)
    .sort((a, b) => a.localeCompare(b))
}
