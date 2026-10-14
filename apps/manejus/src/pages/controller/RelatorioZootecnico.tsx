import { Fragment, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, getFazendaIdForUser } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { useToast, PageSkeleton } from '@gestaup/ui'
import { carregarRelatorioZootecnico, gerarExcelZootecnico } from '../../services/relatorioZootecnicoService'
import { montarTabelaZootecnica, type TabelaZootecnica } from '../../features/relatorioZootecnico/colunas'
import { gerarRelatorioZootecnicoPDFPuppeteer } from '../../utils/relatorioZootecnicoPDFPuppeteer'

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

function LinhaTabela({ valores, colunas, destaque }: { valores: string[]; colunas: TabelaZootecnica['colunas']; destaque?: 'geral' | 'total' }) {
  const fundo = destaque === 'geral' ? 'bg-green-100 dark:bg-green-900' : destaque === 'total' ? 'bg-green-50 dark:bg-green-900/50' : 'bg-surface-1'
  return (
    <tr className={destaque ? `${fundo} font-bold text-green-900 dark:text-green-100` : 'border-t border-border-subtle hover:bg-surface-2'}>
      {valores.map((valor, i) => (
        <td
          key={i}
          className={`whitespace-nowrap px-2 py-1.5 ${colunas[i].tipo === 'texto' ? 'text-left' : 'text-right tabular-nums'} ${i === 0 ? `sticky left-0 z-10 ${fundo}` : ''}`}
        >
          {valor}
        </td>
      ))}
    </tr>
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

  const tabela = useMemo(
    () => (relatorio.data ? montarTabelaZootecnica(relatorio.data.geral, relatorio.data.linhas, dias) : null),
    [relatorio.data, dias],
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

      {tabela && (
        <div className="overflow-auto rounded-xl border border-border-base bg-surface-1 max-h-[75vh]">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-20 bg-green-900 text-white">
              <tr>
                {grupos.map((g) => (
                  <th key={g.nome} colSpan={g.span} className="border-l border-green-700 px-2 py-1.5 text-center font-semibold first:border-l-0">
                    {g.nome}
                  </th>
                ))}
              </tr>
              <tr>
                {tabela.colunas.map((c, i) => (
                  <th
                    key={i}
                    className={`whitespace-nowrap px-2 py-1.5 text-center font-semibold bg-green-900 ${i === 0 ? 'sticky left-0 z-30' : ''}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LinhaTabela valores={tabela.geral} colunas={tabela.colunas} destaque="geral" />
              {tabela.secoes.map((secao) => (
                <Fragment key={secao.titulo}>
                  <tr className="bg-surface-2">
                    <td colSpan={tabela.colunas.length} className="sticky left-0 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-content-strong">
                      {secao.titulo}
                    </td>
                  </tr>
                  {secao.total && <LinhaTabela valores={secao.total} colunas={tabela.colunas} destaque="total" />}
                  {secao.linhas.map((linha, r) => (
                    <LinhaTabela key={r} valores={linha} colunas={tabela.colunas} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {tabela.secoes.length === 0 && <p className="p-4 text-sm text-content-muted">Nenhum lote ativo com animais.</p>}
        </div>
      )}
    </div>
  )
}
