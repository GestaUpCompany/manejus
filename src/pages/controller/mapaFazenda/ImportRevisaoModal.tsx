// Tela de revisão pós-importação KML/KMZ: usuário confirma/corrige os matches
// sugeridos entre polígonos do arquivo e pastos cadastrados antes de salvar.
import { useMemo, useState } from 'react'
import { Button, Modal } from '../../../components/ui'
import { linhasEmConflito } from './nomeMatch'
import type { MatchRow, MatchStatus, PastoCandidato } from './nomeMatch'
import { normalizarNome } from './nomeMatch'
import { PastoCombobox } from './PastoCombobox'
import type { FeatureImportadaItem } from './importKml'

interface Props {
  isOpen: boolean
  onClose: () => void
  rows: MatchRow[]
  pastos: PastoCandidato[]
  aplicando: { atual: number; total: number } | null
  onChangeRow: (importId: string, pastoId: string) => void
  onToggleIgnorar: (importId: string) => void
  onIgnorarFolder: (folder: string | null, ignorar: boolean) => void
  /** Ignora (ou restaura) em massa as linhas cujo pasto selecionado já tem geometria */
  onIgnorarComGeometria: (ignorar: boolean) => void
  /** Ignora (ou restaura) em massa as linhas de pastas onde nenhuma linha tem candidato */
  onIgnorarSemMatch: (ignorar: boolean) => void
  onAplicar: () => void
  /** Voa até a geometria no mapa e a destaca (conferência visual do match) */
  onFocarItem?: (item: FeatureImportadaItem) => void
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  auto: 'match exato',
  sugestao: 'aproximado',
  ambiguo: 'ambíguo',
  sem_match: 'sem match',
  sem_nome: 'sem nome',
}

const STATUS_CLASS: Record<MatchStatus, string> = {
  auto: 'bg-green-500/15 text-green-800 dark:text-green-200 border-green-500/40',
  sugestao: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40',
  ambiguo: 'bg-orange-500/15 text-orange-800 dark:text-orange-200 border-orange-500/40',
  sem_match: 'bg-surface-2 text-content-muted border-surface-3',
  sem_nome: 'bg-surface-2 text-content-faint border-surface-3',
}

const ORDEM_STATUS: MatchStatus[] = ['auto', 'sugestao', 'ambiguo', 'sem_match', 'sem_nome']

export function ImportRevisaoModal({
  isOpen, onClose, rows, pastos, aplicando,
  onChangeRow, onToggleIgnorar, onIgnorarFolder, onIgnorarComGeometria, onIgnorarSemMatch, onAplicar, onFocarItem,
}: Props) {
  // Pastas iniciam colapsadas: usuário expande só o que quer revisar
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  // Busca livre: filtra linhas por nome do item ou do pasto selecionado
  const [busca, setBusca] = useState('')

  const conflitos = useMemo(() => linhasEmConflito(rows), [rows])

  const pastosById = useMemo(() => new Map(pastos.map((p) => [p.id, p])), [pastos])

  const gruposCompletos = useMemo(() => {
    const map = new Map<string, MatchRow[]>()
    rows.forEach((r) => {
      const key = r.item.folder || '(sem pasta)'
      const arr = map.get(key) || []
      arr.push(r)
      map.set(key, arr)
    })
    return Array.from(map.entries())
      .map(([folder, items]) => ({
        folder,
        items: [...items].sort(
          (a, b) => ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status)
        ),
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }, [rows])

  // Busca filtra linhas por nome original/limpo do item, pasta ou pasto selecionado
  const grupos = useMemo(() => {
    const q = normalizarNome(busca)
    if (!q) return gruposCompletos
    return gruposCompletos
      .map((g) => ({
        ...g,
        items: g.items.filter((r) =>
          normalizarNome(
            [r.item.nomeOriginal, r.item.nomeLimpo, g.folder, pastosById.get(r.pastoSelecionado)?.nome]
              .filter(Boolean)
              .join(' ')
          ).includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [gruposCompletos, busca, pastosById])

  // Pastas onde nenhuma linha tem candidato nem seleção (descarte em massa)
  const pastasSemMatch = gruposCompletos.filter((g) =>
    g.items.every((r) => r.candidatos.length === 0 && !r.pastoSelecionado)
  )
  const rowsSemMatch = pastasSemMatch.flatMap((g) => g.items)
  const semMatchPendentes = rowsSemMatch.filter((r) => !r.ignorado).length

  const contadores = useMemo(() => {
    const c: Record<string, number> = { auto: 0, sugestao: 0, ambiguo: 0, sem_match: 0, sem_nome: 0, ignorado: 0 }
    rows.forEach((r) => {
      if (r.ignorado) c.ignorado++
      else c[r.status]++
    })
    return c
  }, [rows])

  const aplicaveis = rows.filter((r) => !r.ignorado && r.pastoSelecionado)
  const bloqueado = conflitos.size > 0 || aplicando !== null

  // Linhas cujo pasto selecionado já tem geometria salva
  const comGeoIds = useMemo(
    () => new Set(pastos.filter((p) => p.temGeo).map((p) => p.id)),
    [pastos]
  )
  const rowsComGeo = rows.filter((r) => r.pastoSelecionado && comGeoIds.has(r.pastoSelecionado))
  const comGeoPendentes = rowsComGeo.filter((r) => !r.ignorado).length

  const toggleExpandido = (folder: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const opcoesPara = (row: MatchRow) => {
    const idsCandidatos = new Set(row.candidatos.map((c) => c.id))
    const restantes = [...pastos]
      .filter((p) => !idsCandidatos.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
    return { candidatos: row.candidatos, restantes }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Revisar Associações Importadas" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          O sistema sugeriu associações entre os polígonos do arquivo e os pastos cadastrados.
          Revise antes de aplicar: nada é salvo até você confirmar. Itens sem match costumam ser
          áreas que não são pastos (lavoura, APP, reserva) — ignore em massa por pasta.
        </p>

        {/* Contadores */}
        <div className="flex flex-wrap gap-2 text-xs">
          {contadores.auto > 0 && (
            <span className="px-2 py-1 rounded border border-green-500/40 bg-green-500/15 text-green-800 dark:text-green-200">
              {contadores.auto} exatos
            </span>
          )}
          {contadores.sugestao > 0 && (
            <span className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200">
              {contadores.sugestao} aproximados
            </span>
          )}
          {contadores.ambiguo > 0 && (
            <span className="px-2 py-1 rounded border border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-200">
              {contadores.ambiguo} ambíguos
            </span>
          )}
          {contadores.sem_match + contadores.sem_nome > 0 && (
            <span className="px-2 py-1 rounded border border-surface-3 bg-surface-2 text-content-muted">
              {contadores.sem_match + contadores.sem_nome} sem match
            </span>
          )}
          {contadores.ignorado > 0 && (
            <span className="px-2 py-1 rounded border border-surface-3 bg-surface-2 text-content-faint line-through">
              {contadores.ignorado} ignorados
            </span>
          )}
          {conflitos.size > 0 && (
            <span className="px-2 py-1 rounded border border-red-500/40 bg-red-500/15 text-red-800 dark:text-red-200 font-medium">
              {conflitos.size} em conflito — resolva antes de aplicar
            </span>
          )}
        </div>

        {/* Descartes em massa + busca */}
        <div className="flex flex-wrap items-center gap-2">
          {rowsComGeo.length > 0 && (
            <button
              type="button"
              onClick={() => onIgnorarComGeometria(comGeoPendentes > 0)}
              className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
              title="Linhas cujo pasto selecionado já tem geometria salva (aplicar substituiria)"
            >
              {comGeoPendentes > 0
                ? `Ignorar ${comGeoPendentes} com geometria`
                : `Restaurar ${rowsComGeo.length} com geometria`}
            </button>
          )}
          {rowsSemMatch.length > 0 && (
            <button
              type="button"
              onClick={() => onIgnorarSemMatch(semMatchPendentes > 0)}
              className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
              title="Linhas de pastas onde nenhum item tem candidato de match"
            >
              {semMatchPendentes > 0
                ? `Ignorar ${semMatchPendentes} sem match`
                : `Restaurar ${rowsSemMatch.length} sem match`}
            </button>
          )}
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou pasto..."
            className="ml-auto px-2 py-1 text-xs border border-surface-3 rounded-lg bg-surface-1 text-content-strong focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>

        {/* Grupos por pasta */}
        <div className="space-y-2">
          {grupos.map(({ folder, items }) => {
            // durante a busca os grupos com resultado ficam abertos
            const colapsado = busca.trim() === '' && !expandidos.has(folder)
            const ignoradosNoGrupo = items.filter((r) => r.ignorado).length
            const todosIgnorados = ignoradosNoGrupo === items.length
            const contGrupo: Record<string, number> = {}
            items.forEach((r) => {
              if (!r.ignorado) contGrupo[r.status] = (contGrupo[r.status] || 0) + 1
            })
            return (
              <div key={folder} className="border border-border-base rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-2">
                  <button
                    type="button"
                    onClick={() => toggleExpandido(folder)}
                    className="text-content-faint hover:text-content-muted"
                    aria-label={colapsado ? 'Expandir' : 'Recolher'}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${colapsado ? '' : 'rotate-90'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="text-sm font-medium text-content-strong flex-1 truncate">
                    {folder}
                    <span className="ml-2 text-xs font-normal text-content-muted">
                      {items.length} {items.length === 1 ? 'item' : 'itens'}
                      {contGrupo.auto ? ` · ${contGrupo.auto} exatos` : ''}
                      {contGrupo.sugestao ? ` · ${contGrupo.sugestao} aprox.` : ''}
                      {contGrupo.ambiguo ? ` · ${contGrupo.ambiguo} ambíguos` : ''}
                      {ignoradosNoGrupo > 0 && ` · ${ignoradosNoGrupo} ignorado${ignoradosNoGrupo === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  {todosIgnorados ? (
                    <button
                      type="button"
                      onClick={() => onIgnorarFolder(folder === '(sem pasta)' ? null : folder, false)}
                      className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
                    >
                      Restaurar pasta
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onIgnorarFolder(folder === '(sem pasta)' ? null : folder, true)}
                      className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
                    >
                      Ignorar pasta
                    </button>
                  )}
                </div>

                {!colapsado && (
                  <div className="divide-y divide-border-base">
                    {items.map((row) => {
                      const emConflito = conflitos.has(row.item.importId)
                      const { candidatos, restantes } = opcoesPara(row)
                      return (
                        <div
                          key={row.item.importId}
                          className={`flex items-center gap-3 px-3 py-2 text-sm ${
                            row.ignorado ? 'opacity-40' : ''
                          } ${emConflito ? 'bg-red-500/10' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-content truncate" title={row.item.nomeOriginal}>
                              {row.item.nomeOriginal || '(sem nome)'}
                            </div>
                            <div className="text-xs text-content-faint truncate">
                              {row.item.nomeLimpo && row.item.nomeLimpo !== row.item.nomeOriginal
                                ? `→ ${row.item.nomeLimpo}`
                                : ''}
                              {row.item.parteInfo ? ` · ${row.item.parteInfo}` : ''}
                              {row.applyErro ? ` · erro: ${row.applyErro}` : ''}
                              {emConflito ? ' · mesmo pasto em outra linha' : ''}
                            </div>
                          </div>

                          <span className={`shrink-0 px-2 py-0.5 rounded border text-xs ${STATUS_CLASS[row.status]}`}>
                            {row.ignorado ? 'ignorado' : STATUS_LABEL[row.status]}
                          </span>

                          <PastoCombobox
                            value={row.pastoSelecionado}
                            onChange={(id) => onChangeRow(row.item.importId, id)}
                            candidatos={candidatos}
                            restantes={restantes}
                            disabled={row.ignorado}
                            emConflito={emConflito}
                          />

                          {onFocarItem && (
                            <button
                              type="button"
                              onClick={() => onFocarItem(row.item)}
                              className="shrink-0 p-1.5 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
                              title="Ver no mapa"
                              aria-label="Ver no mapa"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleIgnorar(row.item.importId)}
                            className="shrink-0 text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
                            title={row.ignorado ? 'Restaurar' : 'Ignorar este item'}
                          >
                            {row.ignorado ? 'Restaurar' : 'Ignorar'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-base">
          <span className="text-sm text-content-muted">
            {aplicando
              ? `Salvando ${aplicando.atual}/${aplicando.total}...`
              : `${aplicaveis.length} ${aplicaveis.length === 1 ? 'associação pronta' : 'associações prontas'} para aplicar`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={aplicando !== null}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={onAplicar}
              disabled={aplicaveis.length === 0 || bloqueado}
            >
              {aplicando ? 'Aplicando...' : `Aplicar ${aplicaveis.length} Associações`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
