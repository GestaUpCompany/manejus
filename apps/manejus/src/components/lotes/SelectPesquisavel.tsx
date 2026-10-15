// Select com busca dentro da lista, para escolher pasto/curral quando há muitos.
// Dropdown em portal para escapar do overflow da modal.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Opcao {
  value: string
  label: string
}

interface Props {
  options: Opcao[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  error?: boolean
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function SelectPesquisavel({ options, value, onChange, placeholder = 'Selecione', searchPlaceholder = 'Buscar...', emptyMessage = 'Nada encontrado', error }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const [estilo, setEstilo] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const selecionada = options.find((o) => o.value === value)
  const filtradas = useMemo(() => {
    const q = normalizar(busca)
    return q ? options.filter((o) => normalizar(o.label).includes(q)) : options
  }, [options, busca])

  const atualizarPosicao = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const abaixo = window.innerHeight - rect.bottom
    // trigger fora da tela (formulário rolado): fecha em vez de mostrar a lista solta
    if (rect.bottom < 0 || rect.top > window.innerHeight) return setAberto(false)
    const base = { position: 'fixed', left: rect.left, width: Math.max(rect.width, 220), zIndex: 9999 } as const
    setEstilo(abaixo >= 300 || abaixo >= rect.top ? { ...base, top: rect.bottom + 4 } : { ...base, bottom: window.innerHeight - rect.top + 4 })
  }, [])

  useEffect(() => {
    if (!aberto) return
    setBusca('')
    setAtivo(0)
    const fora = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', atualizarPosicao, true)
    window.addEventListener('resize', atualizarPosicao)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', atualizarPosicao, true)
      window.removeEventListener('resize', atualizarPosicao)
    }
  }, [aberto, atualizarPosicao])

  // Posiciona antes de pintar e só então foca (sem rolar a página): focar o portal ainda sem
  // posição o levava ao fim do body e a página rolava junto.
  useLayoutEffect(() => {
    if (!aberto) return
    atualizarPosicao()
    inputRef.current?.focus({ preventScroll: true })
  }, [aberto, atualizarPosicao])

  // mantém o item destacado visível ao navegar pelo teclado
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-idx="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  const escolher = (v: string) => {
    onChange(v)
    setAberto(false)
    triggerRef.current?.focus()
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((i) => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradas[ativo]) escolher(filtradas[ativo].value)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setAberto(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] border rounded-lg focus:outline-none focus:border-accent ${error ? 'border-red-400' : 'border-border-base'} bg-surface-1 text-left flex items-center justify-between gap-2`}
      >
        <span className={`truncate ${selecionada ? 'text-content-strong' : 'text-content-faint'}`}>{selecionada ? selecionada.label : placeholder}</span>
        <svg className={`w-4 h-4 shrink-0 text-content-faint transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto &&
        createPortal(
          <div ref={dropdownRef} style={estilo} className="flex max-h-72 flex-col rounded-lg border border-border-base bg-surface-1 shadow-xl">
            <div className="border-b border-border-base p-2">
              <input
                ref={inputRef}
                type="text"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setAtivo(0)
                }}
                onKeyDown={teclas}
                placeholder={searchPlaceholder}
                className="w-full rounded border border-surface-3 bg-surface-1 px-2 py-1.5 text-sm text-content-strong focus:outline-none focus:border-accent"
              />
            </div>
            <div ref={listaRef} role="listbox" className="flex-1 overflow-y-auto">
              {filtradas.length === 0 ? (
                <div className="p-3 text-center text-sm text-content-muted">{emptyMessage}</div>
              ) : (
                filtradas.map((o, i) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    data-idx={i}
                    onClick={() => escolher(o.value)}
                    onMouseEnter={() => setAtivo(i)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${i === ativo ? 'bg-surface-2' : ''} ${
                      o.value === value ? 'font-medium text-primary dark:text-primary-light' : 'text-content'
                    }`}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
