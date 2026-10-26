import { useId, useState, type ReactNode } from 'react'
import { Input } from '@gestaup/ui'
import { LABEL, SELECT } from '../../features/relatorioAuditoria5s/apresentacao'
import { Icone } from './Auditoria5sIcone'

export interface PresetPeriodo {
  rotulo: string
  ativo: boolean
  aplicar: () => void
}

interface Auditoria5sFiltrosProps {
  presets: PresetPeriodo[]
  dataInicio: string
  dataFim: string
  onDataInicio: (valor: string) => void
  onDataFim: (valor: string) => void
  responsavel: string
  onResponsavel: (valor: string) => void
  nomesResponsaveis: string[]
  /** Quando informado, mostra o filtro de setor (usado na lista de auditorias). */
  nomesSetores?: string[]
  setor?: string
  onSetor?: (valor: string) => void
  totalFiltrado: number
  total: number
  /** Quantos filtros estão diferentes do padrão; zero esconde o botão de limpar. */
  filtrosAtivos: number
  onLimpar: () => void
  /** Ações da tela (ex.: exportar), à direita da barra. */
  acoes?: ReactNode
  /** Avisa que as pendências ignoram o período (some na aba de pendências, que não usa esta barra). */
  avisoPendencias?: boolean
}

// Mesma altura (52 px) para período, datas e seletores, para os rótulos e os campos ficarem alinhados na linha
const ALTURA = 'h-[52px]'
const CAMPO_SELECT = `${SELECT} ${ALTURA}`

/**
 * Barra única de filtros: período (atalhos + datas), responsável e, na lista, setor.
 * No celular os campos ficam recolhidos atrás do botão "Filtros (n)"; o resultado ("X de Y auditorias"),
 * o limpar e as ações continuam à vista. O resultado é anunciado a leitores de tela quando os filtros mudam.
 */
export function Auditoria5sFiltros({
  presets,
  dataInicio,
  dataFim,
  onDataInicio,
  onDataFim,
  responsavel,
  onResponsavel,
  nomesResponsaveis,
  nomesSetores,
  setor = '',
  onSetor,
  totalFiltrado,
  total,
  filtrosAtivos,
  onLimpar,
  acoes,
  avisoPendencias = true,
}: Auditoria5sFiltrosProps) {
  const id = useId()
  const [aberto, setAberto] = useState(false)

  const botaoLimpar =
    filtrosAtivos > 0 ? (
      <button
        type="button"
        onClick={onLimpar}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-green-400"
      >
        <Icone nome="fechar" className="h-4 w-4" />
        Limpar filtros ({filtrosAtivos})
      </button>
    ) : null

  return (
    <section aria-label="Filtros" className="rounded-2xl border-2 border-border-base bg-surface-1 p-4 shadow-lg sm:p-5">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={`${id}-campos`}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between rounded-lg bg-surface-2 px-4 text-sm font-semibold text-content-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
      >
        <span>Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos} ativo${filtrosAtivos > 1 ? 's' : ''})` : ''}</span>
        <Icone nome="seta" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${aberto ? 'rotate-90' : ''}`} />
      </button>

      <div id={`${id}-campos`} className={`${aberto ? 'grid' : 'hidden'} mt-4 grid-cols-1 gap-4 sm:mt-0 sm:grid sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-end`}>
        <div role="group" aria-labelledby={`${id}-periodo`} className="sm:col-span-2 xl:col-span-1">
          <span id={`${id}-periodo`} className={LABEL}>
            Período
          </span>
          <div className={`flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl bg-surface-2 p-1 ${ALTURA}`}>
            {presets.map((p) => (
              <button
                key={p.rotulo}
                type="button"
                aria-pressed={p.ativo}
                onClick={p.aplicar}
                className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  p.ativo ? 'bg-primary text-white shadow' : 'text-content hover:bg-surface-1'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="xl:w-40">
          <label htmlFor={`${id}-inicio`} className={LABEL}>
            Data inicial
          </label>
          <Input id={`${id}-inicio`} type="date" value={dataInicio} onChange={(e) => onDataInicio(e.target.value)} className={`text-sm ${ALTURA}`} />
        </div>
        <div className="xl:w-40">
          <label htmlFor={`${id}-fim`} className={LABEL}>
            Data final
          </label>
          <Input id={`${id}-fim`} type="date" value={dataFim} onChange={(e) => onDataFim(e.target.value)} className={`text-sm ${ALTURA}`} />
        </div>

        <div className="xl:w-52">
          <label htmlFor={`${id}-responsavel`} className={LABEL}>
            Responsável
          </label>
          <select id={`${id}-responsavel`} className={CAMPO_SELECT} value={responsavel} onChange={(e) => onResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {nomesResponsaveis.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        {nomesSetores && onSetor && (
          <div className="xl:w-52">
            <label htmlFor={`${id}-setor`} className={LABEL}>
              Setor
            </label>
            <select id={`${id}-setor`} className={CAMPO_SELECT} value={setor} onChange={(e) => onSetor(e.target.value)}>
              <option value="">Todos</option>
              {nomesSetores.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Ações no desktop: à direita da linha de campos */}
        <div className="hidden flex-wrap items-center gap-2 sm:col-span-2 sm:flex xl:col-span-1 xl:ml-auto">
          {botaoLimpar}
          {acoes}
        </div>
      </div>

      {/* Ações no celular: sempre visíveis, mesmo com os campos recolhidos */}
      {(botaoLimpar || acoes) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
          {botaoLimpar}
          {acoes}
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-content">
        <span>
          <strong className="font-bold tabular-nums text-content-strong">{totalFiltrado}</strong> de {total} {total === 1 ? 'auditoria' : 'auditorias'}
        </span>
        {avisoPendencias && <span className="text-xs">· As pendências ignoram o período e mostram sempre o estado atual</span>}
      </p>
    </section>
  )
}
