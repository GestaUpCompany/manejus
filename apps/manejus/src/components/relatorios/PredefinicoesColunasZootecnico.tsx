import { useEffect, useRef, useState } from 'react'
import type { ConfigColunas } from '../../features/relatorioZootecnico/configColunas'
import { mesmaConfig, type Predefinicao } from '../../features/relatorioZootecnico/predefinicoesColunas'

interface Props {
  lista: Predefinicao[]
  ativa: Predefinicao | null
  config: ConfigColunas
  configDe: (p: Predefinicao) => ConfigColunas
  onAplicar: (p: Predefinicao) => void
  onSalvar: (nome: string) => boolean
  onAtualizarAtiva: () => void
  onExcluir: (id: string) => void
}

export function PredefinicoesColunasZootecnico({ lista, ativa, config, configDe, onAplicar, onSalvar, onAtualizarAtiva, onExcluir }: Props) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const modificada = !!ativa && !mesmaConfig(configDe(ativa), config)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const salvar = () => {
    if (onSalvar(nome)) setNome('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="rounded-lg border border-surface-3 bg-surface-1 px-3 py-1.5 text-xs font-semibold text-content hover:bg-surface-2"
      >
        Predefinição: {ativa ? ativa.nome : 'nenhuma'}
        {modificada && <span className="ml-1 font-normal text-amber-600">(alterada)</span>} ▾
      </button>
      {aberto && (
        <div className="absolute left-0 z-40 mt-2 w-72 rounded-xl border border-border-base bg-surface-1 p-2 shadow-lg">
          {lista.length === 0 ? (
            <p className="px-2 py-2 text-xs text-content-muted">Nenhuma predefinição salva. Ajuste as colunas e salve abaixo.</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {lista.map((p) => (
                <li key={p.id} className="group flex items-center gap-1 rounded hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => {
                      onAplicar(p)
                      setAberto(false)
                    }}
                    className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm ${ativa?.id === p.id ? 'font-semibold text-primary' : 'text-content'}`}
                  >
                    {ativa?.id === p.id ? '✓ ' : ''}
                    {p.nome}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Excluir a predefinição "${p.nome}"?`) && onExcluir(p.id)}
                    aria-label={`Excluir ${p.nome}`}
                    title="Excluir"
                    className="px-2 py-1 text-content-faint opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {modificada && ativa && (
            <button type="button" onClick={onAtualizarAtiva} className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-surface-2">
              Atualizar "{ativa.nome}" com as colunas atuais
            </button>
          )}
          <form
            className="mt-1 flex gap-1 border-t border-border-subtle pt-2"
            onSubmit={(e) => {
              e.preventDefault()
              salvar()
            }}
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={40}
              placeholder="Salvar atual como..."
              className="min-w-0 flex-1 rounded-lg border border-surface-3 bg-surface-1 px-2 py-1 text-sm"
            />
            <button type="submit" disabled={!nome.trim()} className="rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
              Salvar
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
