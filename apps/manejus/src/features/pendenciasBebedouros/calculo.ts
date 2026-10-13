// Pendências do checklist de Bebedouros: itens marcados como problema (valor = false) em registros do
// mesmo bebedouro que ainda não foram resolvidos. Funções puras, sem acesso a rede.
//
// Esta é a mesma regra do PWA (frontend/src/utils/pendenciasBebedouro.ts), com os mesmos casos de teste,
// mais o agrupamento por bebedouro, o id do registro de origem (para abrir o detalhe) e as métricas.
// Mudou uma, mude a outra.
//
// O estado é derivado do histórico, sem tabela própria: percorrendo os registros do bebedouro em ordem
// de `data` (momento do evento; o PWA grava offline e os registros chegam fora de ordem), um `false` abre a
// pendência e o próximo `true` do mesmo item a resolve. Registro sem o item (só foto, checklist inativo no
// dia) é "não verificado": não abre nem resolve.

export const ITENS_CHECKLIST_BEBEDOURO = [
  { chave: 'agua_suficiente', label: 'Água insuficiente' },
  { chave: 'vazao_bebedouro_ideal', label: 'Vazão da bóia fora do ideal' },
  { chave: 'boia_protecao_boas_condicoes', label: 'Bóia/proteção em más condições' },
  { chave: 'aterro_acesso_bebedouro_ideal', label: 'Aterro/acesso inadequado' },
  { chave: 'espacamento_bebedouro_ideal', label: 'Espaçamento inadequado' },
] as const

export interface RegistroChecklistBebedouro {
  /** id do registro em registros_bebedouros (link para o detalhe) */
  id?: string
  data: string
  localId?: string | null
  checklist: Record<string, any> | null
}

export interface PendenciaAberta {
  chave: string
  label: string
  /** Data do primeiro `false` da sequência atual. */
  desde: string
  /** Data do `false` mais recente (de onde vêm observação e foto). */
  ultimaData: string
  observacao: string
  fotoUrl: string | null
  ocorrencias: number
  registroDesdeId: string | null
  registroUltimoId: string | null
}

export interface PendenciaResolvida {
  chave: string
  label: string
  abertaEm: string
  resolvidaEm: string
  registroAbertaId: string | null
  registroResolvidaId: string | null
}

export interface ResultadoPendencias {
  abertas: PendenciaAberta[]
  resolvidas: PendenciaResolvida[]
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
function ordenarSemDuplicatas(registros: RegistroChecklistBebedouro[]): RegistroChecklistBebedouro[] {
  const vistos = new Set<string>()
  const unicos = registros.filter((r) => {
    if (!r.localId) return true
    if (vistos.has(r.localId)) return false
    vistos.add(r.localId)
    return true
  })
  const desempate = (r: RegistroChecklistBebedouro) => String(r.localId ?? r.id ?? '')
  return [...unicos].sort((a, b) => instante(a.data) - instante(b.data) || desempate(a).localeCompare(desempate(b)))
}

/** Pendências de UM bebedouro (registros já filtrados por ele). */
export function calcularPendencias(registros: RegistroChecklistBebedouro[]): ResultadoPendencias {
  const ordenados = ordenarSemDuplicatas(registros)
  const abertas: PendenciaAberta[] = []
  const resolvidas: PendenciaResolvida[] = []

  for (const item of ITENS_CHECKLIST_BEBEDOURO) {
    let aberta = null as PendenciaAberta | null
    for (const registro of ordenados) {
      const entrada = registro.checklist?.[item.chave]
      if (!entrada || typeof entrada.valor !== 'boolean') continue

      if (entrada.valor === false) {
        // Um "ainda pendente" sem foto/observação nova não apaga a evidência da ocorrência original
        const observacaoNova = typeof entrada.observacao === 'string' ? entrada.observacao : ''
        const fotoNova = typeof entrada.foto_url === 'string' && entrada.foto_url ? entrada.foto_url : null
        const base = {
          ultimaData: registro.data,
          observacao: observacaoNova || aberta?.observacao || '',
          fotoUrl: fotoNova ?? aberta?.fotoUrl ?? null,
          registroUltimoId: registro.id ?? null,
        }
        aberta = aberta
          ? { ...aberta, ...base, ocorrencias: aberta.ocorrencias + 1 }
          : { chave: item.chave, label: item.label, desde: registro.data, ocorrencias: 1, registroDesdeId: registro.id ?? null, ...base }
      } else if (aberta) {
        resolvidas.push({
          chave: item.chave,
          label: item.label,
          abertaEm: aberta.desde,
          resolvidaEm: registro.data,
          registroAbertaId: aberta.registroDesdeId,
          registroResolvidaId: registro.id ?? null,
        })
        aberta = null
      }
    }
    if (aberta) abertas.push(aberta)
  }

  abertas.sort((a, b) => instante(a.desde) - instante(b.desde))
  resolvidas.sort((a, b) => instante(b.resolvidaEm) - instante(a.resolvidaEm))
  return { abertas, resolvidas }
}

export interface RegistroBebedouroComNome extends RegistroChecklistBebedouro {
  numeroBebedouro: string | null
}

export interface PendenciaAbertaDoBebedouro extends PendenciaAberta {
  bebedouro: string
}

export interface PendenciaResolvidaDoBebedouro extends PendenciaResolvida {
  bebedouro: string
}

/** Pendências de todos os bebedouros. Agrupa pelo nome (sem caixa e sem espaços nas pontas); mostra o nome do registro mais recente. */
export function pendenciasPorBebedouro(registros: RegistroBebedouroComNome[]): {
  abertas: PendenciaAbertaDoBebedouro[]
  resolvidas: PendenciaResolvidaDoBebedouro[]
} {
  const grupos = new Map<string, { nome: string; ultima: number; registros: RegistroBebedouroComNome[] }>()
  for (const r of registros) {
    const nome = (r.numeroBebedouro ?? '').trim()
    if (!nome) continue
    const chave = nome.toLowerCase()
    const grupo = grupos.get(chave) ?? { nome, ultima: -1, registros: [] }
    grupo.registros.push(r)
    if (instante(r.data) >= grupo.ultima) {
      grupo.ultima = instante(r.data)
      grupo.nome = nome
    }
    grupos.set(chave, grupo)
  }

  const abertas: PendenciaAbertaDoBebedouro[] = []
  const resolvidas: PendenciaResolvidaDoBebedouro[] = []
  for (const grupo of grupos.values()) {
    const resultado = calcularPendencias(grupo.registros)
    abertas.push(...resultado.abertas.map((p) => ({ ...p, bebedouro: grupo.nome })))
    resolvidas.push(...resultado.resolvidas.map((p) => ({ ...p, bebedouro: grupo.nome })))
  }
  abertas.sort((a, b) => instante(a.desde) - instante(b.desde) || a.bebedouro.localeCompare(b.bebedouro))
  resolvidas.sort((a, b) => instante(b.resolvidaEm) - instante(a.resolvidaEm))
  return { abertas, resolvidas }
}

export interface ResumoPendencias {
  abertas: number
  bebedourosAfetados: number
  maisAntigaDias: number | null
  /** Média de dias entre abrir e resolver (null sem resolvidas). */
  tempoMedioResolucaoDias: number | null
  resolvidasUltimos30Dias: number
}

export function resumoPendencias(
  abertas: PendenciaAbertaDoBebedouro[],
  resolvidas: PendenciaResolvidaDoBebedouro[],
  agoraIso: string
): ResumoPendencias {
  const tempos = resolvidas.map((r) => diasEntre(r.abertaEm, r.resolvidaEm))
  return {
    abertas: abertas.length,
    bebedourosAfetados: new Set(abertas.map((p) => p.bebedouro.toLowerCase())).size,
    maisAntigaDias: abertas.length > 0 ? Math.max(...abertas.map((p) => diasEntre(p.desde, agoraIso))) : null,
    tempoMedioResolucaoDias: tempos.length > 0 ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null,
    resolvidasUltimos30Dias: resolvidas.filter((r) => diasEntre(r.resolvidaEm, agoraIso) <= 30 && instante(r.resolvidaEm) <= instante(agoraIso)).length,
  }
}

export interface LinhaItemPendencia {
  chave: string
  label: string
  abertas: number
  resolvidas: number
}

export function porItem(abertas: PendenciaAberta[], resolvidas: PendenciaResolvida[]): LinhaItemPendencia[] {
  return ITENS_CHECKLIST_BEBEDOURO.map(({ chave, label }) => ({
    chave,
    label,
    abertas: abertas.filter((p) => p.chave === chave).length,
    resolvidas: resolvidas.filter((p) => p.chave === chave).length,
  }))
}
