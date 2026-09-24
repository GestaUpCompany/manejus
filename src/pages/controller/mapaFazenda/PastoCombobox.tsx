// Combobox pesquisável para escolher o pasto de uma linha da revisão de
// importação. O <select> nativo não escala para 100+ pastos; aqui um campo
// de busca filtra por nome normalizado. Portal para escapar do overflow da modal.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizarNome } from './nomeMatch'
import type { PastoCandidato } from './nomeMatch'

interface Props {
  value: string
  onChange: (pastoId: string) => void
  /** candidatos sugeridos (topo da lista) */
  candidatos: PastoCandidato[]
  /** demais pastos */
  restantes: PastoCandidato[]
  disabled?: boolean
  emConflito?: boolean
}

function rotulo(p: PastoCandidato) {
  return `${p.nome}${p.temGeo ? ' (substitui geometria)' : ''}`
}

export function PastoCombobox({ value, onChange, candidatos, restantes, disabled, emConflito }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const todos = useMemo(
    () => [...candidatos, ...restantes],
    [candidatos, restantes]
  )
  const selecionado = todos.find((p) => p.id === value) || null

  const filtrar = (lista: PastoCandidato[]) => {
    const q = normalizarNome(busca)
    if (!q) return lista
    return lista.filter((p) => normalizarNome(p.nome).includes(q))
  }
  const candFiltrados = filtrar(candidatos)
  const restFiltrados = filtrar(restantes)
  const mostrarNaoAssociar = !busca || normalizarNome('nao associar').includes(normalizarNome(busca))

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = 280
    if (spaceBelow >= dropdownHeight || spaceBelow >= rect.top) {
      setDropdownStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260), zIndex: 9999 })
    } else {
      setDropdownStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: Math.max(rect.width, 260), zIndex: 9999 })
    }
  }, [])

  useEffect(() => {
    if (!aberto) return
    updatePosition()
    setBusca('')
    inputRef.current?.focus()
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setAberto(false)
    }
    const handleScroll = () => updatePosition()
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [aberto, updatePosition])

  const escolher = (id: string) => {
    onChange(id)
    setAberto(false)
  }

  const renderOpcao = (p: PastoCandidato) => (
    <button
      key={p.id}
      type="button"
      onClick={() => escolher(p.id)}
      className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors ${
        p.id === value ? 'bg-primary/10 text-primary dark:text-primary-light font-medium' : 'text-content'
      }`}
    >
      {rotulo(p)}
    </button>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
        className={`w-56 shrink-0 px-2 py-1.5 border rounded-lg text-sm text-left bg-surface-1 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 flex items-center justify-between gap-2 ${
          emConflito ? 'border-red-500' : 'border-surface-3'
        }`}
      >
        <span className={`truncate ${selecionado ? 'text-content-strong' : 'text-content-faint'}`}>
          {selecionado ? rotulo(selecionado) : '— não associar —'}
        </span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-content-faint transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={dropdownRef} style={dropdownStyle} className="bg-surface-1 border border-border-base rounded-lg shadow-xl flex flex-col max-h-72">
          <div className="p-2 border-b border-border-base">
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pasto..."
              className="w-full px-2 py-1.5 text-sm border border-surface-3 rounded bg-surface-1 text-content-strong focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {mostrarNaoAssociar && (
              <button
                type="button"
                onClick={() => escolher('')}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors ${
                  !value ? 'bg-primary/10 text-primary dark:text-primary-light font-medium' : 'text-content-faint'
                }`}
              >
                — não associar —
              </button>
            )}
            {candFiltrados.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-content-faint bg-surface-2">Sugeridos</div>
                {candFiltrados.map(renderOpcao)}
              </>
            )}
            {restFiltrados.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-content-faint bg-surface-2">Todos os pastos</div>
                {restFiltrados.map(renderOpcao)}
              </>
            )}
            {candFiltrados.length === 0 && restFiltrados.length === 0 && (
              <div className="p-3 text-center text-content-muted text-sm">Nenhum pasto encontrado</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
