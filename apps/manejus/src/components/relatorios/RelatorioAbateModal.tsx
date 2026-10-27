import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, useToast } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import type { TipoSaida } from '../../features/relatorioAbate/agregacao'
import {
  carregarRelatorioAbate,
  gerarExcelAbate,
  listarLotesComSaida,
  type LoteElegivel,
} from '../../services/relatorioAbateService'
import { gerarRelatorioAbatePDF } from '../../utils/relatorioAbatePDF'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
}

type Situacao = 'todos' | 'desativados' | 'ativos'
type Formato = 'pdf' | 'excel'

// Referência estável: um `= []` inline criaria um array novo a cada render e reiniciaria o efeito de seleção
const SEM_LOTES: LoteElegivel[] = []

const SITUACOES: Array<{ valor: Situacao; rotulo: string }> = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'desativados', rotulo: 'Desativados' },
  { valor: 'ativos', rotulo: 'Ativos' },
]

const chip = (ativo: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    ativo ? 'border-primary bg-primary text-white' : 'border-surface-3 bg-surface-1 text-content hover:bg-surface-2'
  }`

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function RelatorioAbateModal({ isOpen, onClose, fazendaId, fazendaNome, fazendaLogoUrl }: Props) {
  const toast = useToast()
  const [tipos, setTipos] = useState<TipoSaida[]>(['Abate', 'Venda'])
  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [gerando, setGerando] = useState<Formato | null>(null)

  const filtroValido = tipos.length > 0

  const { data: lotes = SEM_LOTES, isFetching, error } = useQuery({
    queryKey: ['relatorio-abate-lotes', fazendaId, [...tipos].sort().join(',')],
    queryFn: () => listarLotesComSaida(fazendaId, { tipos }),
    enabled: isOpen && filtroValido,
  })

  // Ao abrir ou mudar o tipo, a lista nova começa sem nenhum lote marcado
  useEffect(() => {
    setSelecionados(new Set())
  }, [lotes])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lotes.filter(
      (l) =>
        (situacao === 'todos' || (situacao === 'ativos' ? l.ativo : !l.ativo)) &&
        (!termo || l.nome.toLowerCase().includes(termo)),
    )
  }, [lotes, situacao, busca])

  const marcadosVisiveis = visiveis.filter((l) => selecionados.has(l.loteId)).length
  const todosVisiveisMarcados = visiveis.length > 0 && marcadosVisiveis === visiveis.length
  const lotesEscolhidos = lotes.filter((l) => selecionados.has(l.loteId))

  const alternarTipo = (tipo: TipoSaida) =>
    setTipos((atual) => (atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]))

  const alternarLote = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(id)) novo.add(id)
      return novo
    })

  const alternarVisiveis = () =>
    setSelecionados((atual) => {
      const novo = new Set(atual)
      for (const l of visiveis) {
        if (todosVisiveisMarcados) novo.delete(l.loteId)
        else novo.add(l.loteId)
      }
      return novo
    })

  const gerar = async (formato: Formato) => {
    if (lotesEscolhidos.length === 0) return
    setGerando(formato)
    try {
      const dados = await carregarRelatorioAbate(fazendaId, fazendaNome, lotesEscolhidos, { tipos })
      if (dados.lotes.length === 0) throw new Error('Nenhum dos lotes escolhidos pôde ser carregado.')
      const base = `Relatório de Abate - ${fazendaNome}`
      if (formato === 'excel') baixar(await gerarExcelAbate(dados), `${base}.xlsx`)
      else baixar(await gerarRelatorioAbatePDF({ fazendaId, fazendaLogoUrl, dados }), `${base}.pdf`)
      if (dados.falhas.length > 0) toast.error(`Gerado sem ${dados.falhas.length} lote(s): ${dados.falhas.map((f) => f.nome).join(', ')}`)
      else toast.success(formato === 'excel' ? 'Planilha de abate gerada' : 'PDF do relatório de abate gerado')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o relatório de abate')
    } finally {
      setGerando(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!gerando) onClose() }} title="Relatório de Abate" size="xl">
      <div className="space-y-5">
        <p className="max-w-2xl text-sm text-content-muted">
          Histórico completo do lote e de cada categoria, da criação até a saída por abate ou venda. Escolha os lotes
          abaixo; os mais recentes aparecem primeiro. Lotes que ainda têm animais (venda parcial) entram com o histórico até hoje.
        </p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold text-content-strong">Tipo de saída</legend>
              <div className="mt-2 flex gap-2">
                {(['Abate', 'Venda'] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={tipos.includes(t)} disabled={gerando !== null} onClick={() => alternarTipo(t)} className={chip(tipos.includes(t))}>
                    {t}
                  </button>
                ))}
              </div>
              {tipos.length === 0 && <p role="alert" className="mt-2 text-xs text-red-600">Escolha ao menos um tipo.</p>}
              <p className="mt-2 text-xs text-content-faint">Abate: movimentação com motivo Abate. Venda: saída com subtipo Venda.</p>
            </fieldset>
          </div>

          <section aria-label="Lotes" className="flex min-w-0 flex-col rounded-xl border border-border-base bg-surface-2/50">
            <div className="flex flex-wrap items-center gap-2 border-b border-border-base p-3">
              <input
                type="search"
                name="abate-busca"
                aria-label="Buscar lote"
                placeholder="Buscar lote…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-surface-3 bg-surface-1 px-3 py-1.5 text-sm text-content-strong"
              />
              <div className="flex gap-1.5" role="group" aria-label="Situação do lote">
                {SITUACOES.map((s) => (
                  <button key={s.valor} type="button" aria-pressed={situacao === s.valor} onClick={() => setSituacao(s.valor)} className={chip(situacao === s.valor)}>
                    {s.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 text-xs text-content-muted">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-content">
                <input type="checkbox" checked={todosVisiveisMarcados} disabled={visiveis.length === 0} onChange={alternarVisiveis} className="h-4 w-4 accent-primary" />
                {todosVisiveisMarcados ? 'Desmarcar' : 'Marcar'} os {visiveis.length} listados
              </label>
              <span className="tabular-nums" aria-live="polite">{isFetching ? 'Buscando…' : `${lotesEscolhidos.length} de ${lotes.length} selecionados`}</span>
            </div>

            <ul className="max-h-72 divide-y divide-border-base overflow-y-auto border-t border-border-base">
              {error ? (
                <li className="p-4 text-sm text-red-600">Não foi possível listar os lotes. Tente de novo.</li>
              ) : !filtroValido ? (
                <li className="p-4 text-sm text-content-muted">Escolha ao menos um tipo de saída para listar os lotes.</li>
              ) : !isFetching && lotes.length === 0 ? (
                <li className="p-4 text-sm text-content-muted">Nenhum lote com saída por {tipos.join(' ou ').toLowerCase()}.</li>
              ) : !isFetching && visiveis.length === 0 ? (
                <li className="p-4 text-sm text-content-muted">Nenhum lote corresponde à busca ou à situação escolhida.</li>
              ) : (
                visiveis.map((l) => <LinhaLote key={l.loteId} lote={l} marcado={selecionados.has(l.loteId)} onToggle={() => alternarLote(l.loteId)} />)
              )}
            </ul>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-base pt-4">
          <p className="text-xs text-content-muted" aria-live="polite">
            {gerando ? `Montando o histórico de ${lotesEscolhidos.length} ${lotesEscolhidos.length === 1 ? 'lote' : 'lotes'}…` : 'O histórico de cada lote é montado na hora, com os dados mais recentes.'}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={gerando !== null} onClick={onClose} className="rounded-lg border border-surface-3 px-4 py-2 text-sm font-semibold text-content transition-colors hover:bg-surface-2 disabled:opacity-50">
              Fechar
            </button>
            <button type="button" disabled={gerando !== null || lotesEscolhidos.length === 0} onClick={() => gerar('excel')} className="rounded-lg border border-surface-3 px-4 py-2 text-sm font-semibold text-content transition-colors hover:bg-surface-2 disabled:opacity-50">
              {gerando === 'excel' ? 'Gerando…' : 'Excel'}
            </button>
            <button type="button" disabled={gerando !== null || lotesEscolhidos.length === 0} onClick={() => gerar('pdf')} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
              {gerando === 'pdf' ? 'Gerando…' : 'Gerar PDF'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function LinhaLote({ lote, marcado, onToggle }: { lote: LoteElegivel; marcado: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2">
        <input type="checkbox" checked={marcado} onChange={onToggle} className="h-4 w-4 shrink-0 accent-primary" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-content-strong">
            <span className="truncate">{lote.nome}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${lote.ativo ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
              {lote.ativo ? 'Ativo' : 'Desativado'}
            </span>
          </span>
          <span className="text-xs tabular-nums text-content-muted">
            {[lote.cabecasAbate > 0 && `${lote.cabecasAbate} abate`, lote.cabecasVenda > 0 && `${lote.cabecasVenda} venda`].filter(Boolean).join(' · ')} · última saída {formatDate(lote.ultimaSaida)}
          </span>
        </span>
      </label>
    </li>
  )
}
