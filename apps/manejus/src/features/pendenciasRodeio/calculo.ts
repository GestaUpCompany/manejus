// Pendências do checklist do Rodeio: itens persistentes marcados como problema em rodeios do mesmo lote
// que ainda não foram resolvidos. Funções puras, sem acesso a rede.
//
// Esta é a mesma regra do PWA (frontend/src/utils/pendenciasRodeio.ts), com os mesmos casos de teste,
// mais o agrupamento por lote, o id do registro de origem (para abrir o detalhe) e as métricas.
// Mudou uma, mude a outra.
//
// O estado é derivado do histórico, sem tabela própria: percorrendo os rodeios do lote em ordem de `data`
// (momento do evento; o PWA grava offline e os registros chegam fora de ordem), um problema abre a
// pendência e o próximo "conforme" do mesmo item a resolve. `diagnosticos.<campo>.valor` é 'S'/'N' (texto):
// nestes itens 'N' = problema e 'S' = conforme; booleano legado (true = conforme) também é aceito.
// Valor vazio ou item ausente é "não verificado": não abre nem resolve.
//
// Só entram condições persistentes. Animal morto, doente, carrapato/mosca e entrevero são eventos pontuais.

export const ITENS_CHECKLIST_RODEIO = [
  { chave: 'bebedourosCochos', label: 'Bebedouros / cochos com problema' },
  { chave: 'pastagensTaxaLotacao', label: 'Pastagem / lotação inadequada' },
  { chave: 'cercasCochosPorteiras', label: 'Cercas / porteiras com problema' },
] as const

export interface RegistroDiagnosticoRodeio {
  /** id do registro em registros_rodeio (link para o detalhe) */
  id?: string
  data: string
  localId?: string | null
  diagnosticos: Record<string, any> | null
}

export interface PendenciaAberta {
  chave: string
  label: string
  /** Data do primeiro problema da sequência atual. */
  desde: string
  /** Data do problema mais recente (de onde vêm observação e foto). */
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

/** true = problema, false = conforme, null = não verificado. */
function situacaoDoValor(valor: unknown): boolean | null {
  if (valor === 'N') return true
  if (valor === 'S') return false
  if (valor === true) return false
  if (valor === false) return true
  return null
}

/** `data` crescente, desempate estável por localId/id; o mesmo registro (mesmo localId) conta uma vez só. */
function ordenarSemDuplicatas(registros: RegistroDiagnosticoRodeio[]): RegistroDiagnosticoRodeio[] {
  const vistos = new Set<string>()
  const unicos = registros.filter((r) => {
    if (!r.localId) return true
    if (vistos.has(r.localId)) return false
    vistos.add(r.localId)
    return true
  })
  const desempate = (r: RegistroDiagnosticoRodeio) => String(r.localId ?? r.id ?? '')
  return [...unicos].sort((a, b) => instante(a.data) - instante(b.data) || desempate(a).localeCompare(desempate(b)))
}

/** Pendências de UM lote (registros já filtrados por ele). */
export function calcularPendencias(registros: RegistroDiagnosticoRodeio[]): ResultadoPendencias {
  const ordenados = ordenarSemDuplicatas(registros)
  const abertas: PendenciaAberta[] = []
  const resolvidas: PendenciaResolvida[] = []

  for (const item of ITENS_CHECKLIST_RODEIO) {
    let aberta = null as PendenciaAberta | null
    for (const registro of ordenados) {
      const entrada = registro.diagnosticos?.[item.chave]
      if (!entrada || typeof entrada !== 'object') continue
      const problema = situacaoDoValor(entrada.valor)
      if (problema === null) continue

      if (problema) {
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

export interface RegistroRodeioComLote extends RegistroDiagnosticoRodeio {
  loteId: string | null
  /** Nome do lote gravado no registro (fallback de agrupamento e exibição). */
  lote: string | null
}

export interface PendenciaAbertaDoLote extends PendenciaAberta {
  lote: string
}

export interface PendenciaResolvidaDoLote extends PendenciaResolvida {
  lote: string
}

/** Pendências de todos os lotes. Agrupa por `lote_id` (sem id, pelo nome sem caixa); mostra o nome do registro mais recente. */
export function pendenciasPorLote(registros: RegistroRodeioComLote[]): {
  abertas: PendenciaAbertaDoLote[]
  resolvidas: PendenciaResolvidaDoLote[]
} {
  const grupos = new Map<string, { nome: string; ultima: number; registros: RegistroRodeioComLote[] }>()
  for (const r of registros) {
    const nome = (r.lote ?? '').trim()
    const chave = r.loteId ? `id:${r.loteId}` : nome ? `nome:${nome.toLowerCase()}` : ''
    if (!chave) continue
    const grupo = grupos.get(chave) ?? { nome, ultima: -1, registros: [] }
    grupo.registros.push(r)
    if (instante(r.data) >= grupo.ultima) {
      grupo.ultima = instante(r.data)
      if (nome) grupo.nome = nome
    }
    grupos.set(chave, grupo)
  }

  const abertas: PendenciaAbertaDoLote[] = []
  const resolvidas: PendenciaResolvidaDoLote[] = []
  for (const grupo of grupos.values()) {
    const resultado = calcularPendencias(grupo.registros)
    const nome = grupo.nome || 'Lote sem nome'
    abertas.push(...resultado.abertas.map((p) => ({ ...p, lote: nome })))
    resolvidas.push(...resultado.resolvidas.map((p) => ({ ...p, lote: nome })))
  }
  abertas.sort((a, b) => instante(a.desde) - instante(b.desde) || a.lote.localeCompare(b.lote))
  resolvidas.sort((a, b) => instante(b.resolvidaEm) - instante(a.resolvidaEm))
  return { abertas, resolvidas }
}

export interface ResumoPendencias {
  abertas: number
  lotesAfetados: number
  maisAntigaDias: number | null
  /** Média de dias entre abrir e resolver (null sem resolvidas). */
  tempoMedioResolucaoDias: number | null
  resolvidasUltimos30Dias: number
}

export function resumoPendencias(
  abertas: PendenciaAbertaDoLote[],
  resolvidas: PendenciaResolvidaDoLote[],
  agoraIso: string
): ResumoPendencias {
  const tempos = resolvidas.map((r) => diasEntre(r.abertaEm, r.resolvidaEm))
  return {
    abertas: abertas.length,
    lotesAfetados: new Set(abertas.map((p) => p.lote.toLowerCase())).size,
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
  return ITENS_CHECKLIST_RODEIO.map(({ chave, label }) => ({
    chave,
    label,
    abertas: abertas.filter((p) => p.chave === chave).length,
    resolvidas: resolvidas.filter((p) => p.chave === chave).length,
  }))
}
