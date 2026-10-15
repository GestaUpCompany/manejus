import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, getFazendaIdForUser } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { useToast, PageSkeleton } from '@gestaup/ui'
import { carregarRelatorioZootecnico, gerarExcelZootecnico } from '../../services/relatorioZootecnicoService'
import { colunasZootecnicas, montarTabelaZootecnica, type TabelaZootecnica } from '../../features/relatorioZootecnico/colunas'
import { aplicarConfigColunas, useConfigColunasZootecnico } from '../../features/relatorioZootecnico/configColunas'
import { usePredefinicoesColunas } from '../../features/relatorioZootecnico/predefinicoesColunas'
import { PredefinicoesColunasZootecnico } from '../../components/relatorios/PredefinicoesColunasZootecnico'
import { gerarRelatorioZootecnicoPDFPuppeteer } from '../../utils/relatorioZootecnicoPDFPuppeteer'

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function LinhaTabela({ valores, colunas, destaque, selecionadas }: { valores: string[]; colunas: TabelaZootecnica['colunas']; destaque?: 'geral' | 'total'; selecionadas: string[] }) {
  const fundo = destaque === 'geral' ? 'bg-green-100 dark:bg-green-900' : destaque === 'total' ? 'bg-green-50 dark:bg-green-900/50' : 'bg-surface-1'
  return (
    <tr className={destaque ? `${fundo} font-bold text-green-900 dark:text-green-100` : 'border-t border-border-subtle hover:bg-surface-2'}>
      {valores.map((valor, i) => (
        <td
          key={i}
          className={`whitespace-nowrap px-2 py-1.5 ${colunas[i].tipo === 'texto' ? 'text-left' : 'text-right tabular-nums'} ${i === 0 ? `sticky left-0 z-10 ${fundo}` : ''} ${selecionadas.includes(colunas[i].id) ? 'bg-red-100 dark:bg-red-900/40' : ''}`}
        >
          {valor}
        </td>
      ))}
    </tr>
  )
}

function IconeOcultar({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 20 20 4" />
    </svg>
  )
}

const fmtBr = (iso: string) => iso.split('-').reverse().join('/')

export function RelatorioZootecnico() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const diasInicial = Math.max(1, Math.min(365, Number(params.get('dias')) || 22))
  const [dias, setDias] = useState(diasInicial)
  const [ancora, setAncora] = useState<string | null>(null)
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<'pdf' | 'excel' | null>(null)

  const fazenda = useQuery({
    queryKey: ['zootecnico-fazenda', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const id = await getFazendaIdForUser(user!.id)
      if (!id) return null
      const { data } = await supabase.from('fazendas').select('nome, logo_url').eq('id', id).maybeSingle()
      return { id, nome: (data?.nome as string | undefined) ?? '', logoUrl: (data?.logo_url as string | null | undefined) ?? null }
    },
  })

  const relatorio = useQuery({
    queryKey: ['relatorio-zootecnico', fazenda.data?.id, dias],
    enabled: !!fazenda.data,
    queryFn: () => carregarRelatorioZootecnico(fazenda.data!.id, fazenda.data!.nome, dias),
  })

  const tabelaCompleta = useMemo(
    () => (relatorio.data ? montarTabelaZootecnica(relatorio.data.geral, relatorio.data.linhas, dias) : null),
    [relatorio.data, dias],
  )

  // Os ids não dependem da janela de dias, então a configuração vale para qualquer janela
  const idsColunas = useMemo(() => colunasZootecnicas(dias).map((c) => c.id), [dias])
  const colunasConfig = useConfigColunasZootecnico(`zootecnico-colunas:${user?.id ?? 'anon'}:${fazenda.data?.id ?? ''}`, idsColunas)

  const predefinicoes = usePredefinicoesColunas(`zootecnico-predefinicoes:${user?.id ?? 'anon'}:${fazenda.data?.id ?? ''}`, idsColunas)

  const tabela = useMemo(
    () => (tabelaCompleta ? aplicarConfigColunas(tabelaCompleta, colunasConfig.config) : null),
    [tabelaCompleta, colunasConfig.config],
  )

  const grupos = useMemo(() => {
    if (!tabela) return []
    const out: { nome: string; span: number }[] = []
    for (const c of tabela.colunas) {
      const ultimo = out[out.length - 1]
      if (ultimo && ultimo.nome === c.grupo) ultimo.span += 1
      else out.push({ nome: c.grupo, span: 1 })
    }
    return out
  }, [tabela])

  const ocultarColuna = (id: string) => {
    if (!tabela || tabela.colunas.length === 1) return
    colunasConfig.ocultar(id)
  }

  // Shift+clique na primeira e na última coluna do intervalo seleciona tudo entre elas
  const selecionarIntervalo = (id: string) => {
    if (!tabela) return
    if (!ancora || selecionadas.length > 1) {
      setAncora(id)
      setSelecionadas([id])
      return
    }
    const ids = tabela.colunas.map((c) => c.id)
    const [de, ate] = [ids.indexOf(ancora), ids.indexOf(id)].sort((a, b) => a - b)
    setSelecionadas(ids.slice(de, ate + 1))
    setAncora(null)
  }

  const limparSelecao = () => {
    setAncora(null)
    setSelecionadas([])
  }

  const ocultarSelecionadas = () => {
    if (!tabela || selecionadas.length === 0 || selecionadas.length >= tabela.colunas.length) return
    colunasConfig.ocultar(...selecionadas)
    limparSelecao()
  }

  useEffect(() => {
    if (selecionadas.length === 0) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') limparSelecao()
      else if (e.key === 'Enter' || e.key === 'Delete') {
        e.preventDefault()
        ocultarSelecionadas()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadas, tabela])

  const exportar = async (tipo: 'pdf' | 'excel') => {
    if (!relatorio.data || !fazenda.data) return
    setBaixando(tipo)
    try {
      if (tipo === 'pdf') {
        const blob = await gerarRelatorioZootecnicoPDFPuppeteer({ fazendaId: fazenda.data.id, dados: relatorio.data, dias, fazendaLogoUrl: fazenda.data.logoUrl })
        baixar(blob, `Relatório Zootécnico - ${fazenda.data.nome}.pdf`)
      } else {
        baixar(await gerarExcelZootecnico(relatorio.data, dias), `Relatório Zootécnico - ${fazenda.data.nome}.xlsx`)
      }
    } catch (err) {
      console.error(err)
      toast.error(`Não foi possível gerar o ${tipo === 'pdf' ? 'PDF' : 'Excel'}`)
    } finally {
      setBaixando(null)
    }
  }

  if (fazenda.isLoading) return <PageSkeleton variant="list" />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <button type="button" onClick={() => navigate('/controller/relatorios')} className="text-sm text-content-muted hover:text-content">
            ← Relatórios
          </button>
          <h1 className="text-2xl font-bold text-content-strong">Relatório Zootécnico dos Lotes</h1>
          {relatorio.data && (
            <p className="text-sm text-content-muted">
              Consumo da janela: {fmtBr(relatorio.data.janelaInicio)} a {fmtBr(relatorio.data.janelaFim)} ({dias} dias)
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-content">
            Janela de consumo (dias)
            <input
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(Math.max(1, Math.min(365, Number(e.target.value) || 22)))}
              className="ml-2 w-20 rounded-lg border border-surface-3 bg-surface-1 px-2 py-1"
            />
          </label>
          <button
            type="button"
            disabled={!relatorio.data || baixando !== null}
            onClick={() => exportar('pdf')}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {baixando === 'pdf' ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            disabled={!relatorio.data || baixando !== null}
            onClick={() => exportar('excel')}
            className="rounded-lg border border-surface-3 px-4 py-2 text-sm font-semibold text-content hover:bg-surface-2 disabled:opacity-50"
          >
            {baixando === 'excel' ? 'Gerando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {relatorio.isLoading && <PageSkeleton variant="list" />}
      {relatorio.isError && <p className="text-sm text-red-600">Não foi possível carregar o relatório.</p>}

      {tabelaCompleta && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
          <PredefinicoesColunasZootecnico
            lista={predefinicoes.lista}
            ativa={predefinicoes.ativa}
            config={colunasConfig.config}
            configDe={predefinicoes.configDe}
            onAplicar={(p) => {
              colunasConfig.aplicar(predefinicoes.configDe(p))
              predefinicoes.marcarAtiva(p.id)
            }}
            onSalvar={(nome) => predefinicoes.salvar(nome, colunasConfig.config)}
            onAtualizarAtiva={() => predefinicoes.atualizarAtiva(colunasConfig.config)}
            onExcluir={predefinicoes.excluir}
          />
          <span>
            Arraste os títulos para reordenar. Para ocultar: ícone <IconeOcultar className="inline h-3.5 w-3.5 align-text-bottom" /> no título, ou <kbd className="rounded border border-surface-3 px-1">Shift</kbd>+clique na primeira e na última coluna de um intervalo.
          </span>
          {colunasConfig.config.ocultas.map((id) => {
            const c = tabelaCompleta.colunas.find((x) => x.id === id)
            return c ? (
              <button key={id} type="button" onClick={() => colunasConfig.mostrar(id)} title={`Mostrar ${c.header}`} className="rounded-full border border-dashed border-surface-3 px-2 py-0.5 text-content hover:bg-surface-2">
                + {c.header}
                {c.grupo.startsWith('Consumo') ? ` (${c.grupo.replace('Consumo ', '')})` : ''}
              </button>
            ) : null
          })}
          {(colunasConfig.config.ocultas.length > 0 || colunasConfig.config.ordem.some((id, i) => id !== idsColunas[i])) && (
            <button type="button" onClick={colunasConfig.restaurarPadrao} className="font-medium text-primary hover:underline">Restaurar padrão</button>
          )}
        </div>
      )}

      {tabela && (
        <div className="overflow-auto rounded-xl border border-border-base bg-surface-1 max-h-[75vh]">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-20 bg-green-900 text-white">
              <tr>
                {grupos.map((g) => (
                  <th
                    key={g.nome}
                    colSpan={g.span}
                    className="select-none border-l border-green-700 px-2 py-1.5 text-center font-semibold first:border-l-0">
                    {g.nome}
                  </th>
                ))}
              </tr>
              <tr>
                {tabela.colunas.map((c, i) => (
                  <th
                    key={c.id}
                    draggable
                    tabIndex={0}
                    title="Arraste para reordenar. Shift+clique em duas colunas seleciona o intervalo."
                    onMouseDown={(e) => {
                      // evita iniciar arrasto/seleção de texto no Shift+clique
                      if (e.shiftKey) e.preventDefault()
                    }}
                    onClick={(e) => {
                      if (e.shiftKey) selecionarIntervalo(c.id)
                      else if (selecionadas.length > 0) limparSelecao()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault()
                        ocultarColuna(c.id)
                      }
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setArrastando(c.id)
                    }}
                    onDragOver={(e) => {
                      if (!arrastando) return
                      e.preventDefault()
                      setSobre(c.id)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (arrastando) colunasConfig.moverPara(arrastando, c.id)
                      setArrastando(null)
                      setSobre(null)
                    }}
                    onDragEnd={() => {
                      setArrastando(null)
                      setSobre(null)
                    }}
                    className={`group/col relative cursor-grab select-none whitespace-nowrap px-2 py-1.5 text-center font-semibold bg-green-900 active:cursor-grabbing ${i === 0 ? 'sticky left-0 z-30' : ''} ${arrastando === c.id ? 'opacity-40' : ''} ${selecionadas.includes(c.id) ? 'bg-red-800 ring-2 ring-inset ring-yellow-300' : ''} ${sobre === c.id && arrastando !== c.id ? 'shadow-[inset_3px_0_0_0_#facc15]' : ''}`}
                  >
                    {c.header}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        ocultarColuna(c.id)
                      }}
                      disabled={tabela.colunas.length === 1}
                      aria-label={`Ocultar ${c.header}`}
                      title="Ocultar coluna (Shift: o grupo todo)"
                      className="absolute right-0.5 top-0.5 rounded p-0.5 text-green-200 opacity-0 transition-opacity hover:bg-green-700 hover:text-white focus:opacity-100 group-hover/col:opacity-100 disabled:hidden"
                    >
                      <IconeOcultar />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LinhaTabela selecionadas={selecionadas} valores={tabela.geral} colunas={tabela.colunas} destaque="geral" />
              {tabela.secoes.map((secao) => (
                <Fragment key={secao.titulo}>
                  <tr className="bg-surface-2">
                    <td colSpan={tabela.colunas.length} className="sticky left-0 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-content-strong">
                      {secao.titulo}
                    </td>
                  </tr>
                  {secao.total && <LinhaTabela selecionadas={selecionadas} valores={secao.total} colunas={tabela.colunas} destaque="total" />}
                  {secao.linhas.map((linha, r) => (
                    <LinhaTabela key={r} selecionadas={selecionadas} valores={linha} colunas={tabela.colunas} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {tabela.secoes.length === 0 && <p className="p-4 text-sm text-content-muted">Nenhum lote ativo com animais.</p>}
        </div>
      )}
      {selecionadas.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-surface-3 bg-surface-1 px-4 py-2 text-sm shadow-lg">
          <span className="text-content">
            {ancora
              ? 'Shift+clique na última coluna do intervalo'
              : `${selecionadas.length} ${selecionadas.length === 1 ? 'coluna selecionada' : 'colunas selecionadas'}`}
          </span>
          {!ancora && (
            <button type="button" onClick={ocultarSelecionadas} disabled={selecionadas.length >= (tabela?.colunas.length ?? 0)} className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-3 py-1 font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              <IconeOcultar /> Ocultar
            </button>
          )}
          <button type="button" onClick={limparSelecao} className="text-content-muted hover:text-content">Cancelar (Esc)</button>
        </div>
      )}
    </div>
  )
}
