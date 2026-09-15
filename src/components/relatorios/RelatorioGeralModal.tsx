import { useEffect, useMemo, useState } from 'react'
import { Modal, useToast } from '../ui'
import { RelatorioCapaGallery } from './RelatorioCapaGallery'
import { RELATORIOS_GERAIS, moverRelatorio, type TipoRelatorioGeral } from '../../features/relatorioGeral/catalogo'
import { contarDiasInclusivos, formatarPeriodoCapa, validarPeriodoRelatorio } from '../../features/relatorioGeral/periodo'
import { carregarRelatoriosGerais } from '../../features/relatorioGeral/loaders'
import { baixarRelatorioGeral, gerarRelatorioGeral } from '../../services/relatorioGeralService'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
}

const ORDEM_PADRAO = RELATORIOS_GERAIS.map((item) => item.id)

export function RelatorioGeralModal({ isOpen, onClose, fazendaId, fazendaNome, fazendaLogoUrl }: Props) {
  const toast = useToast()
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [ordem, setOrdem] = useState<TipoRelatorioGeral[]>(ORDEM_PADRAO)
  const [selecionados, setSelecionados] = useState<Set<TipoRelatorioGeral>>(new Set(ORDEM_PADRAO))
  const [imagemCapa, setImagemCapa] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [etapa, setEtapa] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setDataInicio('')
    setDataFim('')
    setOrdem(ORDEM_PADRAO)
    setSelecionados(new Set(ORDEM_PADRAO))
    setImagemCapa(null)
    setEtapa('')
  }, [isOpen])

  const tiposSelecionados = ordem.filter((id) => selecionados.has(id))
  const erroPeriodo = dataInicio || dataFim ? validarPeriodoRelatorio(dataInicio, dataFim) : null
  const dias = contarDiasInclusivos(dataInicio, dataFim)
  const podeGerar = tiposSelecionados.length > 0 && validarPeriodoRelatorio(dataInicio, dataFim) === null && !gerando
  const resumo = useMemo(() => tiposSelecionados.map((id) => RELATORIOS_GERAIS.find((item) => item.id === id)?.titulo).filter(Boolean).join(' · '), [tiposSelecionados])

  const toggle = (id: TipoRelatorioGeral) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  const gerar = async () => {
    if (!podeGerar) return
    setGerando(true)
    try {
      const reports = await carregarRelatoriosGerais(tiposSelecionados, {
        id: fazendaId,
        nome: fazendaNome,
        logoUrl: fazendaLogoUrl,
      }, dataInicio, dataFim, setEtapa)
      setEtapa('Montando relatório')
      const blob = await gerarRelatorioGeral({
        fazendaId,
        fazendaNome,
        fazendaLogoUrl,
        dataInicio,
        dataFim,
        periodoLabel: formatarPeriodoCapa(dataInicio, dataFim),
        imagemCapaPath: imagemCapa ?? undefined,
        reports,
      })
      setEtapa('Baixando arquivo')
      baixarRelatorioGeral(blob, fazendaNome, dataInicio, dataFim)
      toast.success('Relatório mensal gerado com sucesso.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o relatório mensal.')
    } finally {
      setGerando(false)
      setEtapa('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!gerando) onClose() }} title="Relatório Mensal Completo" size="xl">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-900">Período do relatório</h3>
            <p className="mb-3 text-xs text-gray-500">Informe até 31 dias consecutivos.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-700">Data inicial<input type="date" name="relatorio-data-inicio" value={dataInicio} disabled={gerando} onChange={(event) => setDataInicio(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-700">Data final<input type="date" name="relatorio-data-fim" value={dataFim} disabled={gerando} onChange={(event) => setDataFim(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
            </div>
            {erroPeriodo && <p className="mt-2 text-xs text-red-600">{erroPeriodo}</p>}
            {dias && !erroPeriodo && <p className="mt-2 text-xs font-medium text-green-700">Período de {dias} {dias === 1 ? 'dia' : 'dias'}.</p>}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Conteúdo e ordem</h3>
            <p className="mb-3 text-xs text-gray-500">Selecione as seções e use os botões para definir a ordem do PDF.</p>
            <div className="space-y-2">
              {ordem.map((id, index) => {
                const item = RELATORIOS_GERAIS.find((relatorio) => relatorio.id === id)!
                return <div key={id} className={`flex items-center gap-3 rounded-lg border p-3 ${selecionados.has(id) ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-gray-50'}`}>
                  <input type="checkbox" checked={selecionados.has(id)} disabled={gerando} onChange={() => toggle(id)} className="h-4 w-4 rounded border-gray-300 text-green-700" />
                  <span className="w-5 text-center text-xs font-semibold text-gray-400">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900">{item.titulo}</p><p className="truncate text-xs text-gray-500">{item.descricao}</p></div>
                  <div className="flex gap-1">
                    <button type="button" disabled={gerando || index === 0} onClick={() => setOrdem((atual) => moverRelatorio(atual, id, -1))} aria-label={`Subir ${item.titulo}`} className="rounded border border-gray-300 p-1.5 text-gray-600 disabled:opacity-30"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button>
                    <button type="button" disabled={gerando || index === ordem.length - 1} onClick={() => setOrdem((atual) => moverRelatorio(atual, id, 1))} aria-label={`Descer ${item.titulo}`} className="rounded border border-gray-300 p-1.5 text-gray-600 disabled:opacity-30"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                  </div>
                </div>
              })}
            </div>
            {tiposSelecionados.length === 0 && <p className="mt-2 text-xs text-red-600">Selecione pelo menos um relatório.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <RelatorioCapaGallery fazendaId={fazendaId} selecionada={imagemCapa} onSelect={setImagemCapa} disabled={gerando} />
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Resumo</h3>
            <dl className="mt-3 space-y-2 text-xs"><div><dt className="text-gray-500">Fazenda</dt><dd className="font-medium text-gray-900">{fazendaNome}</dd></div><div><dt className="text-gray-500">Referência da capa</dt><dd className="font-medium text-gray-900">{formatarPeriodoCapa(dataInicio, dataFim) || 'Aguardando período'}</dd></div><div><dt className="text-gray-500">Seções</dt><dd className="font-medium text-gray-900">{resumo || 'Nenhuma selecionada'}</dd></div></dl>
          </section>
          <button type="button" disabled={!podeGerar} onClick={gerar} className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">{gerando ? etapa || 'Preparando relatório' : 'Gerar e baixar PDF'}</button>
          {gerando && <div className="flex items-center justify-center gap-2 text-xs text-gray-600"><span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-green-700" />Aguarde, não feche esta janela.</div>}
        </div>
      </div>
    </Modal>
  )
}
