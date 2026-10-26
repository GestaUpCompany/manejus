// Pendências da Auditoria 5S: itens respondidos N em auditorias do mesmo setor que ainda não foram resolvidos.
// Funções puras, sem acesso a rede.
//
// Esta é a mesma regra do PWA (frontend/src/utils/pendencias5s.ts), com os mesmos casos de teste, mais o
// agrupamento por setor, o id do registro de origem (para abrir o detalhe) e as métricas. Mudou uma, mude a outra.
//
// O estado é derivado do histórico, sem tabela própria: percorrendo as auditorias do setor em ordem de `data`
// (momento do evento; o PWA grava offline e os registros chegam fora de ordem), um `N` abre a pendência e o
// próximo `C` do mesmo item a resolve. `NA` e item ausente são "não verificado": não abrem nem resolvem.
// A observação e a foto vêm de `nao_conformidades[chave]` (auditorias antigas abrem pendência sem evidência).

import { SECOES_5S } from '../relatorioAuditoria5s/itens'

export interface RegistroPendencia5s {
  /** id do registro em registros_auditoria_5s (link para o detalhe) */
  id?: string
  data: string
  localId?: string | null
  itens: Record<string, any> | null
  naoConformidades?: Record<string, any> | null
}

/** Medida do plano de ação, gravada em nao_conformidades[chave].plano_acao. */
export interface MedidaPlano5s {
  id: string
  descricao: string
  responsavel: string | null
  /** YYYY-MM-DD */
  prazo: string | null
  concluida: boolean
  concluida_em: string | null
}

export interface PlanoAcao5s {
  medidas: MedidaPlano5s[]
  criado_em: string | null
  atualizado_em: string | null
}

/** sem_plano: nenhuma medida; atrasado: alguma medida aberta com prazo já vencido; concluido: todas feitas. */
export type SituacaoPlano5s = 'sem_plano' | 'em_dia' | 'atrasado' | 'concluido'

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)

/** Lê o plano de uma não conformidade do JSON do banco ou do sync; formato inválido vira null (auditorias antigas não têm o campo). */
export function lerPlanoAcao5s(evidencia: any): PlanoAcao5s | null {
  const bruto = evidencia?.plano_acao
  if (!bruto || !Array.isArray(bruto.medidas)) return null
  const medidas: MedidaPlano5s[] = bruto.medidas
    .filter((m: any) => texto(m?.descricao))
    .map((m: any, i: number) => ({
      id: texto(m.id) ?? `m${i}`,
      descricao: texto(m.descricao)!,
      responsavel: texto(m.responsavel),
      prazo: texto(m.prazo),
      concluida: m.concluida === true,
      concluida_em: texto(m.concluida_em),
    }))
  return medidas.length > 0 ? { medidas, criado_em: texto(bruto.criado_em), atualizado_em: texto(bruto.atualizado_em) } : null
}

/** Situação do plano em `agoraIso` (compara o prazo como data local YYYY-MM-DD). */
export function situacaoPlano5s(plano: PlanoAcao5s | null, agoraIso: string): SituacaoPlano5s {
  if (!plano || plano.medidas.length === 0) return 'sem_plano'
  if (plano.medidas.every((m) => m.concluida)) return 'concluido'
  const hoje = agoraIso.slice(0, 10)
  const atrasada = plano.medidas.some((m) => !m.concluida && m.prazo !== null && m.prazo < hoje)
  return atrasada ? 'atrasado' : 'em_dia'
}

export interface PendenciaAberta5s {
  chave: string
  /** Não conformidade como afirmação (ex.: "Há material em desuso no local."). */
  label: string
  secao: string
  /** Data do primeiro `N` da sequência atual. */
  desde: string
  /** Data do `N` mais recente (de onde vêm observação, foto e plano). */
  ultimaData: string
  observacao: string
  fotoUrl: string | null
  /** Plano de ação mais recente da sequência (null se nenhum N registrou plano). */
  planoAcao: PlanoAcao5s | null
  ocorrencias: number
  registroDesdeId: string | null
  registroUltimoId: string | null
}

export interface PendenciaResolvida5s {
  chave: string
  label: string
  secao: string
  abertaEm: string
  resolvidaEm: string
  /** Último plano de ação registrado antes da resolução. */
  planoAcao: PlanoAcao5s | null
  registroAbertaId: string | null
  registroResolvidaId: string | null
}

export interface ResultadoPendencias5s {
  abertas: PendenciaAberta5s[]
  resolvidas: PendenciaResolvida5s[]
}

const instante = (iso: string): number => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Dias inteiros entre duas datas ISO (mínimo 0). */
export function diasEntre(deIso: string, ateIso: string): number {
  return Math.max(0, Math.floor((instante(ateIso) - instante(deIso)) / 86_400_000))
}

/** `data` crescente, desempate estável por localId/id; o mesmo registro (mesmo localId) conta uma vez só. */
function ordenarSemDuplicatas(registros: RegistroPendencia5s[]): RegistroPendencia5s[] {
  const vistos = new Set<string>()
  const unicos = registros.filter((r) => {
    if (!r.localId) return true
    if (vistos.has(r.localId)) return false
    vistos.add(r.localId)
    return true
  })
  const desempate = (r: RegistroPendencia5s) => String(r.localId ?? r.id ?? '')
  return [...unicos].sort((a, b) => instante(a.data) - instante(b.data) || desempate(a).localeCompare(desempate(b)))
}

/** Pendências de UM setor (registros já filtrados por ele). */
export function calcularPendencias5s(registros: RegistroPendencia5s[]): ResultadoPendencias5s {
  const ordenados = ordenarSemDuplicatas(registros)
  const abertas: PendenciaAberta5s[] = []
  const resolvidas: PendenciaResolvida5s[] = []

  for (const secao of SECOES_5S) {
    for (const item of secao.itens) {
      let aberta = null as PendenciaAberta5s | null
      for (const registro of ordenados) {
        const resposta = registro.itens?.[item.chave]
        if (resposta === 'N') {
          const evidencia = registro.naoConformidades?.[item.chave]
          // Um "ainda pendente" sem foto/observação nova não apaga a evidência da ocorrência original
          const observacaoNova = typeof evidencia?.observacao === 'string' ? evidencia.observacao.trim() : ''
          const fotoNova = typeof evidencia?.foto_url === 'string' && evidencia.foto_url ? evidencia.foto_url : null
          // O plano segue a mesma regra da observação: o mais recente presente vence; sem plano novo, herda o anterior
          const planoNovo = lerPlanoAcao5s(evidencia)
          const base = {
            ultimaData: registro.data,
            observacao: observacaoNova || aberta?.observacao || '',
            fotoUrl: fotoNova ?? aberta?.fotoUrl ?? null,
            planoAcao: planoNovo ?? aberta?.planoAcao ?? null,
            registroUltimoId: registro.id ?? null,
          }
          aberta = aberta
            ? { ...aberta, ...base, ocorrencias: aberta.ocorrencias + 1 }
            : { chave: item.chave, label: item.negativa, secao: secao.titulo, desde: registro.data, ocorrencias: 1, registroDesdeId: registro.id ?? null, ...base }
        } else if (resposta === 'C' && aberta) {
          resolvidas.push({
            chave: item.chave,
            label: item.negativa,
            secao: secao.titulo,
            abertaEm: aberta.desde,
            resolvidaEm: registro.data,
            planoAcao: aberta.planoAcao,
            registroAbertaId: aberta.registroDesdeId,
            registroResolvidaId: registro.id ?? null,
          })
          aberta = null
        }
      }
      if (aberta) abertas.push(aberta)
    }
  }

  abertas.sort((a, b) => instante(a.desde) - instante(b.desde))
  resolvidas.sort((a, b) => instante(b.resolvidaEm) - instante(a.resolvidaEm))
  return { abertas, resolvidas }
}

export interface RegistroAuditoriaComSetor extends RegistroPendencia5s {
  setor: string | null
  setorId?: string | null
}

export interface PendenciaAbertaDoSetor extends PendenciaAberta5s {
  setor: string
  /** Mesma chave de agrupamento do setor usada no relatório (setor_id ou nome em minúsculas). */
  setorChave: string
}

export interface PendenciaResolvidaDoSetor extends PendenciaResolvida5s {
  setor: string
  setorChave: string
}

/** Pendências de todos os setores. Agrupa por setor_id (ou pelo nome sem caixa, quando não há id); mostra o nome do registro mais recente. */
export function pendenciasPorSetor(registros: RegistroAuditoriaComSetor[]): {
  abertas: PendenciaAbertaDoSetor[]
  resolvidas: PendenciaResolvidaDoSetor[]
} {
  const grupos = new Map<string, { nome: string; ultima: number; registros: RegistroAuditoriaComSetor[] }>()
  for (const r of registros) {
    const nome = (r.setor ?? '').trim()
    const chave = r.setorId || nome.toLowerCase()
    if (!chave) continue
    const grupo = grupos.get(chave) ?? { nome, ultima: -1, registros: [] }
    grupo.registros.push(r)
    if (instante(r.data) >= grupo.ultima) {
      grupo.ultima = instante(r.data)
      grupo.nome = nome
    }
    grupos.set(chave, grupo)
  }

  const abertas: PendenciaAbertaDoSetor[] = []
  const resolvidas: PendenciaResolvidaDoSetor[] = []
  for (const [chave, grupo] of grupos.entries()) {
    const resultado = calcularPendencias5s(grupo.registros)
    abertas.push(...resultado.abertas.map((p) => ({ ...p, setor: grupo.nome, setorChave: chave })))
    resolvidas.push(...resultado.resolvidas.map((p) => ({ ...p, setor: grupo.nome, setorChave: chave })))
  }
  abertas.sort((a, b) => instante(a.desde) - instante(b.desde) || a.setor.localeCompare(b.setor))
  resolvidas.sort((a, b) => instante(b.resolvidaEm) - instante(a.resolvidaEm))
  return { abertas, resolvidas }
}

export interface ResumoPendencias5s {
  abertas: number
  setoresAfetados: number
  maisAntigaDias: number | null
  /** Média de dias entre abrir e resolver (null sem resolvidas). */
  tempoMedioResolucaoDias: number | null
  resolvidasUltimos30Dias: number
}

export function resumoPendencias5s(
  abertas: PendenciaAbertaDoSetor[],
  resolvidas: PendenciaResolvidaDoSetor[],
  agoraIso: string
): ResumoPendencias5s {
  const tempos = resolvidas.map((r) => diasEntre(r.abertaEm, r.resolvidaEm))
  return {
    abertas: abertas.length,
    setoresAfetados: new Set(abertas.map((p) => p.setor.toLowerCase())).size,
    maisAntigaDias: abertas.length > 0 ? Math.max(...abertas.map((p) => diasEntre(p.desde, agoraIso))) : null,
    tempoMedioResolucaoDias: tempos.length > 0 ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null,
    resolvidasUltimos30Dias: resolvidas.filter((r) => diasEntre(r.resolvidaEm, agoraIso) <= 30 && instante(r.resolvidaEm) <= instante(agoraIso)).length,
  }
}
