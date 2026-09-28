// Seleção de pastas do KML/KMZ antes de carregar no mapa: só as pastas
// marcadas viram features importadas e entram na revisão de matches.
// As demais são descartadas antes de pesar a camada do mapa e o DOM.
import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '../../../components/ui'
import type { FeatureImportadaItem } from './importKml'

interface Props {
  isOpen: boolean
  onClose: () => void
  itens: FeatureImportadaItem[]
  onConfirm: (folders: Set<string | null>, salvarSemAssoc: Set<string | null>) => void
}

const SEM_PASTA = '(sem pasta)'

const TIPO_LABEL: Record<string, string> = {
  Polygon: 'polígonos',
  LineString: 'linhas',
  Point: 'pontos',
}

export function ImportFiltroModal({ isOpen, onClose, itens, onConfirm }: Props) {
  const grupos = useMemo(() => {
    const map = new Map<string | null, { total: number; porTipo: Record<string, number>; comNome: number }>()
    itens.forEach((i) => {
      const g = map.get(i.folder) || { total: 0, porTipo: {}, comNome: 0 }
      g.total++
      g.porTipo[i.tipoGeometria] = (g.porTipo[i.tipoGeometria] || 0) + 1
      if (i.nomeLimpo) g.comNome++
      map.set(i.folder, g)
    })
    return Array.from(map.entries()).sort((a, b) => (a[0] || '').localeCompare(b[0] || ''))
  }, [itens])

  // Pastas sem nenhum nome útil (só números/áreas) começam desmarcadas:
  // o caso comum ("quero só as de pecuária") sai num clique, sem
  // hardcode de nomes de pasta.
  const [selecionados, setSelecionados] = useState<Set<string | null>>(new Set())
  // Por pasta: itens que não casarem com pasto viram geometria de mapa
  // (área/estrada/ponto) em vez de serem descartados no apply. Vem
  // marcado por padrão; desmarcar exclui as sobras da pasta do save.
  const [salvarSemAssoc, setSalvarSemAssoc] = useState<Set<string | null>>(new Set())

  // O componente fica montado com itens vazios antes do parse, então a
  // seleção inicial é recalculada no efeito (não no useState) sempre que
  // a modal abre com um conjunto novo de itens.
  useEffect(() => {
    if (!isOpen) return
    setSelecionados(new Set(grupos.filter(([, g]) => g.comNome > 0).map(([f]) => f)))
    setSalvarSemAssoc(new Set(grupos.map(([f]) => f)))
  }, [isOpen, grupos])

  const toggle = (folder: string | null) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const toggleSemAssoc = (folder: string | null) => {
    setSalvarSemAssoc((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const totalSelecionado = grupos
    .filter(([f]) => selecionados.has(f))
    .reduce((acc, [, g]) => acc + g.total, 0)

  const resumoTipos = (porTipo: Record<string, number>) =>
    Object.entries(porTipo)
      .map(([t, n]) => `${n} ${TIPO_LABEL[t] || t.toLowerCase()}`)
      .join(' · ')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Pastas para Importar" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          O arquivo contém {itens.length} geometrias em {grupos.length} pastas.
          Marque só o que quer carregar: pastas desmarcadas não aparecem no mapa nem na revisão.
          Pastas sem nomes úteis (só medidas) já vêm desmarcadas. Por padrão, itens que não casarem
          com pasto são salvos no mapa como áreas/estradas/pontos; desmarque "salvar sem associação"
          na pasta cujas sobras você não quer gravar (ex.: lavoura).
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelecionados(new Set(grupos.map(([f]) => f)))}
            className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
          >
            Marcar todas
          </button>
          <button
            type="button"
            onClick={() => setSelecionados(new Set())}
            className="text-xs px-2 py-1 rounded border border-surface-3 text-content-muted hover:bg-surface-3"
          >
            Desmarcar todas
          </button>
        </div>

        <div className="border border-border-base rounded-lg divide-y divide-border-base max-h-[50vh] overflow-y-auto">
          {grupos.map(([folder, g]) => {
            const marcado = selecionados.has(folder)
            return (
              <div
                key={folder ?? SEM_PASTA}
                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 ${
                  marcado ? '' : 'opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggle(folder)}
                  className="w-4 h-4 shrink-0 accent-primary cursor-pointer"
                />
                <span className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(folder)}>
                  <span className="block text-sm font-medium text-content-strong truncate">
                    {folder || SEM_PASTA}
                  </span>
                  <span className="block text-xs text-content-faint">
                    {g.total} {g.total === 1 ? 'item' : 'itens'} · {resumoTipos(g.porTipo)} ·{' '}
                    <span className={g.comNome === 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                      {g.comNome === 0 ? 'sem nomes úteis' : `${g.comNome} nomes úteis`}
                    </span>
                  </span>
                </span>
                {marcado && (
                  <label
                    className="flex items-center gap-1.5 shrink-0 cursor-pointer text-xs text-content-muted"
                    title="Itens desta pasta que não casarem com pasto serão salvos no mapa (áreas, estradas, pontos)"
                  >
                    <input
                      type="checkbox"
                      checked={salvarSemAssoc.has(folder)}
                      onChange={() => toggleSemAssoc(folder)}
                      className="w-3.5 h-3.5 accent-teal-600"
                    />
                    salvar sem associação
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-base">
          <span className="text-sm text-content-muted">
            {totalSelecionado} {totalSelecionado === 1 ? 'geometria será carregada' : 'geometrias serão carregadas'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => onConfirm(selecionados, salvarSemAssoc)}
              disabled={totalSelecionado === 0}
            >
              Carregar {totalSelecionado} itens
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
