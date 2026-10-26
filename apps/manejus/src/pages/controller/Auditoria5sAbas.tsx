import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Icone, type NomeIcone } from './Auditoria5sIcone'

export interface AbaAuditoria<T extends string> {
  valor: T
  rotulo: string
  icone: NomeIcone
  /** Número mostrado ao lado do rótulo (ex.: pendências abertas). */
  contagem?: number
  /** Contagem em âmbar quando maior que zero (algo pede atenção). */
  destaque?: boolean
}

interface Auditoria5sAbasProps<T extends string> {
  abas: AbaAuditoria<T>[]
  ativa: T
  onSelecionar: (valor: T) => void
  /** Prefixo dos ids; o painel da aba ativa deve usar `${idBase}-painel` e `aria-labelledby=${idBase}-aba-<valor>`. */
  idBase: string
  rotuloAria: string
}

/**
 * Abas no padrão WAI-ARIA: setas esquerda/direita, Home e End trocam de aba (e movem o foco),
 * só a aba ativa entra na ordem do Tab. Em telas estreitas rolam na horizontal em vez de quebrar linha.
 */
export function Auditoria5sAbas<T extends string>({ abas, ativa, onSelecionar, idBase, rotuloAria }: Auditoria5sAbasProps<T>) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([])

  // Em tela estreita a faixa rola: a aba ativa precisa estar à vista (ex.: ao abrir o link direto de "Auditorias")
  useEffect(() => {
    const indice = abas.findIndex((a) => a.valor === ativa)
    botoes.current[indice]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa])

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const total = abas.length
    const destino =
      e.key === 'ArrowRight' ? (indice + 1) % total : e.key === 'ArrowLeft' ? (indice - 1 + total) % total : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : -1
    if (destino < 0) return
    e.preventDefault()
    onSelecionar(abas[destino].valor)
    botoes.current[destino]?.focus()
  }

  return (
    <div role="tablist" aria-label={rotuloAria} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none] sm:inline-flex [&::-webkit-scrollbar]:hidden">
      {abas.map((aba, i) => {
        const selecionada = aba.valor === ativa
        const comAlerta = aba.destaque && (aba.contagem ?? 0) > 0
        return (
          <button
            key={aba.valor}
            ref={(el) => {
              botoes.current[i] = el
            }}
            id={`${idBase}-aba-${aba.valor}`}
            type="button"
            role="tab"
            aria-selected={selecionada}
            aria-controls={`${idBase}-painel`}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onSelecionar(aba.valor)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={`flex min-h-[44px] flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 ${
              selecionada ? 'bg-primary text-white shadow' : 'text-content hover:bg-surface-1'
            }`}
          >
            <Icone nome={aba.icone} className="h-4 w-4" />
            {aba.rotulo}
            {typeof aba.contagem === 'number' && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  comAlerta ? 'bg-amber-500 text-white' : selecionada ? 'bg-white/20 text-white' : 'bg-surface-3 text-content-muted'
                }`}
              >
                {aba.contagem}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
