import { useEffect, useMemo, useState } from 'react'
import { Modal, useToast } from '../ui'
import { RelatorioCapaGallery } from './RelatorioCapaGallery'
import { RELATORIOS_GERAIS, type TipoRelatorioGeral } from '../../features/relatorioGeral/catalogo'
import { agruparBoletim, listarLocaisBoletim, normalizarPlanilhaBoletim, type DadosPDFBoletimRebanho, type ResultadoNormalizacaoBoletim } from '../../features/relatorioGeral/boletimRebanho'
import { contarDiasInclusivos, formatarPeriodoCapa, validarPeriodoRelatorio } from '../../features/relatorioGeral/periodo'
import { carregarRelatoriosGerais } from '../../features/relatorioGeral/loaders'
import { baixarRelatorioGeral, gerarRelatorioGeral } from '../../services/relatorioGeralService'
import { carregarPlanilhaBoletim, enviarPlanilhaBoletim } from '../../services/boletimRebanhoService'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
}

const ORDEM_PADRAO = RELATORIOS_GERAIS.map((item) => item.id)
const SELECIONADOS_PADRAO = new Set<TipoRelatorioGeral>(ORDEM_PADRAO.filter((id) => id !== 'boletim_rebanho'))
const ANO_ATUAL = new Date().getFullYear()

const chaveLocaisOcultos = (fazenda: string, ano: number) => `infografico:locais-ocultos:${fazenda}:${ano}`

function lerLocaisOcultos(fazenda: string, ano: number): Set<string> {
  try {
    const bruto = localStorage.getItem(chaveLocaisOcultos(fazenda, ano))
    const lista: unknown = bruto ? JSON.parse(bruto) : []
    return new Set(Array.isArray(lista) ? lista.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

export function RelatorioGeralModal({ isOpen, onClose, fazendaId, fazendaNome, fazendaLogoUrl }: Props) {
  const toast = useToast()
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [anoBoletim, setAnoBoletim] = useState(ANO_ATUAL)
  const [mesBoletim, setMesBoletim] = useState<number | null>(null)
  const [ordem, setOrdem] = useState<TipoRelatorioGeral[]>(ORDEM_PADRAO)
  const [selecionados, setSelecionados] = useState<Set<TipoRelatorioGeral>>(new Set(SELECIONADOS_PADRAO))
  const [boletim, setBoletim] = useState<ResultadoNormalizacaoBoletim | null>(null)
  const [nomeArquivoBoletim, setNomeArquivoBoletim] = useState('')
  const [locaisOcultos, setLocaisOcultos] = useState<Set<string>>(new Set())
  const [carregandoPlanilha, setCarregandoPlanilha] = useState(false)
  const [imagemCapa, setImagemCapa] = useState<string | null>(null)
  const [imagemCapaPreview, setImagemCapaPreview] = useState('/images/capa-padrao.png')
  const [gerando, setGerando] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  const aplicarPlanilha = async (file: File, persistir: boolean) => {
    setCarregandoPlanilha(true)
    try {
      const resultado = normalizarPlanilhaBoletim(await file.arrayBuffer())
      if (!resultado.registros.some((registro) => registro.mesNumero === 13 && registro.fazenda === 'Consolidado')) {
        throw new Error('A planilha não contém o bloco Consolidado na aba GERAL.')
      }
      if (persistir) await enviarPlanilhaBoletim(fazendaId, anoBoletim, file)
      setBoletim(resultado)
      setNomeArquivoBoletim(file.name)
      setMesBoletim((atual) => atual && resultado.mesesDisponiveis.some((mes) => mes.numero === atual) ? atual : resultado.mesesDisponiveis[0]?.numero ?? null)
      if (persistir) toast.success('Planilha do boletim salva com sucesso.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler a planilha do boletim.')
      setBoletim(null)
      setNomeArquivoBoletim('')
      setMesBoletim(null)
    } finally {
      setCarregandoPlanilha(false)
    }
  }

  const carregarPersistida = async (ano: number) => {
    setCarregandoPlanilha(true)
    try {
      const file = await carregarPlanilhaBoletim(fazendaId, ano)
      if (file) await aplicarPlanilha(file, false)
      else {
        setBoletim(null)
        setNomeArquivoBoletim('')
        setMesBoletim(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a planilha salva.')
    } finally {
      setCarregandoPlanilha(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setDataInicio('')
    setDataFim('')
    setAnoBoletim(ANO_ATUAL)
    setMesBoletim(null)
    setOrdem(ORDEM_PADRAO)
    setSelecionados(new Set(SELECIONADOS_PADRAO))
    setBoletim(null)
    setNomeArquivoBoletim('')
    setImagemCapa(null)
    setImagemCapaPreview('')
    setEtapa('')
    setLocaisOcultos(lerLocaisOcultos(fazendaId, ANO_ATUAL))
  }, [isOpen, fazendaId])

  useEffect(() => {
    if (!isOpen) return
    setLocaisOcultos(lerLocaisOcultos(fazendaId, anoBoletim))
    void carregarPersistida(anoBoletim)
  }, [isOpen, anoBoletim])

  const tiposSelecionados = ordem.filter((id) => selecionados.has(id))
  const temBoletim = tiposSelecionados.includes('boletim_rebanho')
  const temOperacionais = tiposSelecionados.some((id) => id !== 'boletim_rebanho')
  const erroPeriodo = temOperacionais ? validarPeriodoRelatorio(dataInicio, dataFim) : null
  const dias = contarDiasInclusivos(dataInicio, dataFim)
  const locaisDisponiveis = useMemo(() => (boletim ? listarLocaisBoletim(boletim.registros) : []), [boletim])
  const dadosBoletim: DadosPDFBoletimRebanho | undefined = useMemo(() => {
    if (!boletim || !mesBoletim) return undefined
    const mes = boletim.mesesDisponiveis.find((item) => item.numero === mesBoletim)
    if (!mes) return undefined
    const agrupado = agruparBoletim(boletim.registros, mesBoletim, locaisOcultos)
    return { ano: anoBoletim, mesReferencia: mes.nome, mesNumero: mesBoletim, ...agrupado }
  }, [boletim, mesBoletim, anoBoletim, locaisOcultos])
  const locaisIncluidos = locaisDisponiveis.filter((local) => !locaisOcultos.has(local)).length
  const todosLocaisOcultos = locaisDisponiveis.length > 0 && locaisIncluidos === 0
  const podeGerar = tiposSelecionados.length > 0 && !gerando && !carregandoPlanilha && (!temOperacionais || !erroPeriodo) && (!temBoletim || Boolean(dadosBoletim))
  const resumo = useMemo(() => tiposSelecionados.map((id) => RELATORIOS_GERAIS.find((item) => item.id === id)?.titulo).filter(Boolean).join(' · '), [tiposSelecionados])
  const periodoCapa = formatarPeriodoCapa(dataInicio, dataFim) || (dadosBoletim ? `${dadosBoletim.mesReferencia} de ${dadosBoletim.ano}` : '')

  const toggle = (id: TipoRelatorioGeral) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  const gravarLocaisOcultos = (ocultos: Set<string>) => {
    setLocaisOcultos(ocultos)
    try {
      localStorage.setItem(chaveLocaisOcultos(fazendaId, anoBoletim), JSON.stringify([...ocultos]))
    } catch {
      // localStorage indisponível: mantém apenas o estado em memória
    }
  }

  const toggleLocal = (local: string) => {
    const proximo = new Set(locaisOcultos)
    if (proximo.has(local)) proximo.delete(local)
    else proximo.add(local)
    gravarLocaisOcultos(proximo)
  }

  const handleDragStart = (index: number) => setDraggingIndex(index)
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    if (draggingIndex === null || draggingIndex === index) return
    setOrdem((atual) => {
      const novaOrdem = [...atual]
      const [moved] = novaOrdem.splice(draggingIndex, 1)
      novaOrdem.splice(index, 0, moved)
      return novaOrdem
    })
    setDraggingIndex(index)
  }
  const handleDragEnd = () => setDraggingIndex(null)
  const selecionarCapa = (path: string | null, previewUrl = '') => {
    setImagemCapa(path)
    setImagemCapaPreview(previewUrl)
  }

  const gerar = async () => {
    if (!podeGerar) return
    setGerando(true)
    try {
      const reports = await carregarRelatoriosGerais(tiposSelecionados, { id: fazendaId, nome: fazendaNome, logoUrl: fazendaLogoUrl }, dataInicio, dataFim, setEtapa, { boletim: dadosBoletim })
      setEtapa('Montando relatório')
      const blob = await gerarRelatorioGeral({ fazendaId, fazendaNome, fazendaLogoUrl, dataInicio, dataFim, periodoLabel: periodoCapa, imagemCapaPath: imagemCapa ?? undefined, reports })
      setEtapa('Baixando arquivo')
      baixarRelatorioGeral(blob, fazendaNome, dataInicio || String(anoBoletim), dataFim || dadosBoletim?.mesReferencia || '')
      toast.success('Infográfico mensal gerado com sucesso.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o infográfico mensal.')
    } finally {
      setGerando(false)
      setEtapa('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!gerando) onClose() }} title="Infográfico Mensal" size="xl">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-content-strong">Período dos relatórios operacionais</h3>
            <p className="mb-3 text-xs text-content-muted">Obrigatório quando houver relatórios operacionais selecionados. O Boletim de Rebanho usa mês próprio.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-content">Data inicial<input type="date" name="relatorio-data-inicio" value={dataInicio} disabled={gerando || !temOperacionais} onChange={(event) => setDataInicio(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-content-strong disabled:opacity-50" /></label>
              <label className="text-xs font-medium text-content">Data final<input type="date" name="relatorio-data-fim" value={dataFim} disabled={gerando || !temOperacionais} onChange={(event) => setDataFim(event.target.value)} className="mt-1 w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-content-strong disabled:opacity-50" /></label>
            </div>
            {erroPeriodo && <p className="mt-2 text-xs text-red-600">{erroPeriodo}</p>}
            {dias && !erroPeriodo && temOperacionais && <p className="mt-2 text-xs font-medium text-primary">Período de {dias} {dias === 1 ? 'dia' : 'dias'}.</p>}
          </section>

          <section className="rounded-xl border border-border-base bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-content-strong">Fonte do Boletim de Rebanho</h3><p className="mt-1 text-xs text-content-muted">Uma planilha ativa por fazenda e ano.</p></div>
              <label className="text-xs font-medium text-content">Ano<input type="number" min="2000" max="2100" value={anoBoletim} disabled={gerando || carregandoPlanilha || !temBoletim} onChange={(event) => setAnoBoletim(Number(event.target.value) || ANO_ATUAL)} className="ml-2 w-24 rounded-lg border border-surface-3 bg-surface-1 px-2 py-1 text-sm text-content-strong disabled:opacity-50" /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary ${gerando || carregandoPlanilha || !temBoletim ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-primary/10'}`}>
                {carregandoPlanilha ? 'Carregando...' : temBoletim ? 'Enviar ou substituir planilha' : 'Selecione o boletim para liberar o upload'}
                <input type="file" accept=".xlsx,.xlsm,.xls" disabled={gerando || carregandoPlanilha || !temBoletim} onChange={(event) => { const file = event.target.files?.[0]; if (file) void aplicarPlanilha(file, true); event.currentTarget.value = '' }} className="sr-only" />
              </label>
              <span className="text-xs text-content-muted">{nomeArquivoBoletim || 'Nenhuma planilha salva para este ano.'}</span>
            </div>
            {temBoletim && boletim && <label className="mt-3 block text-xs font-medium text-content">Mês de referência<select value={mesBoletim ?? ''} disabled={gerando || carregandoPlanilha} onChange={(event) => setMesBoletim(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-surface-3 bg-surface-1 px-3 py-2 text-sm text-content-strong">{boletim.mesesDisponiveis.map((mes) => <option key={mes.numero} value={mes.numero}>{mes.nome}</option>)}</select></label>}
            {temBoletim && boletim && locaisDisponiveis.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-content">Locais incluídos ({locaisIncluidos} de {locaisDisponiveis.length})</span>
                  <div className="flex gap-3 text-xs font-semibold text-primary">
                    <button type="button" disabled={gerando} onClick={() => gravarLocaisOcultos(new Set())} className="hover:underline disabled:opacity-50">Todos</button>
                    <button type="button" disabled={gerando} onClick={() => gravarLocaisOcultos(new Set(locaisDisponiveis))} className="hover:underline disabled:opacity-50">Nenhum</button>
                  </div>
                </div>
                <div className="mt-2 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {locaisDisponiveis.map((local) => (
                    <label key={local} className="flex items-center gap-2 rounded-lg border border-border-base bg-surface-1 px-2 py-1.5 text-xs text-content-strong">
                      <input type="checkbox" checked={!locaisOcultos.has(local)} disabled={gerando} onChange={() => toggleLocal(local)} className="h-4 w-4 flex-shrink-0 rounded border-surface-3 text-primary" />
                      <span className="truncate">{local}</span>
                    </label>
                  ))}
                </div>
                {todosLocaisOcultos && <p className="mt-2 text-xs text-amber-600">Todos os locais ocultos: o boletim sairá apenas com o Consolidado.</p>}
              </div>
            )}
            {temBoletim && !boletim && <p className="mt-3 text-xs text-red-600">Envie a planilha para selecionar o mês de referência.</p>}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-content-strong">Conteúdo e ordem</h3>
            <p className="mb-3 text-xs text-content-muted">Selecione as seções e arraste os cards para definir a ordem do PDF.</p>
            <div className="space-y-2">
              {ordem.map((id, index) => {
                const item = RELATORIOS_GERAIS.find((relatorio) => relatorio.id === id)!
                return <div key={id} draggable={!gerando} onDragStart={() => handleDragStart(index)} onDragOver={(event) => handleDragOver(event, index)} onDragEnd={handleDragEnd} className={`flex items-center gap-3 rounded-lg border p-3 transition-opacity ${selecionados.has(id) ? 'border-primary/40 bg-primary/10' : 'border-border-base bg-surface-2'} ${draggingIndex === index ? 'opacity-50' : 'opacity-100'} ${gerando ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                  <input type="checkbox" checked={selecionados.has(id)} disabled={gerando} onChange={() => toggle(id)} className="h-4 w-4 rounded border-surface-3 text-primary" />
                  <svg className="h-4 w-4 flex-shrink-0 text-content-faint" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" /></svg>
                  <span className="w-5 text-center text-xs font-semibold text-content-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-content-strong">{item.titulo}</p><p className="truncate text-xs text-content-muted">{item.descricao}</p></div>
                </div>
              })}
            </div>
            {tiposSelecionados.length === 0 && <p className="mt-2 text-xs text-red-600">Selecione pelo menos um relatório.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-content-strong">Prévia da capa</h3><p className="text-xs text-content-muted">Atualiza conforme você escolhe a imagem e o período.</p></div><span className="text-[10px] font-semibold uppercase tracking-wide text-content-faint">A4 paisagem</span></div>
            <div className="relative aspect-[1.414/1] overflow-hidden rounded-xl bg-gradient-to-br from-green-900 via-green-700 to-blue-900 shadow-sm">{imagemCapaPreview && <img src={imagemCapaPreview} alt="Prévia da imagem de capa" className="absolute inset-0 h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-r from-green-950/90 via-green-800/65 to-blue-950/45" /><div className="relative flex h-full flex-col justify-between p-4 text-white sm:p-5"><div className="flex items-center gap-2"><img src="/images/manejus360.png" alt="Manej'Us 360" className="h-7 w-7 rounded-md bg-white p-1 object-contain" /><span className="text-xs font-bold sm:text-sm">Manej'Us <b className="text-amber-300">360</b></span></div><div><p className="text-[8px] font-bold uppercase tracking-[0.2em] text-green-100 sm:text-[9px]">Gestão integrada da fazenda</p><h4 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">Infográfico Mensal</h4><p className="mt-1 text-xs text-green-50 sm:text-sm">Registros Operacionais</p><span className="mt-3 inline-flex rounded border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-semibold sm:text-xs">{periodoCapa || 'Período do relatório'}</span></div><div className="flex items-center gap-2 border-t border-white/25 pt-3"><div className="flex items-center gap-1.5"><img src="/images/gestaupcompany.png" alt="GestaUp Company" className="h-7 w-10 rounded bg-white p-1 object-contain" />{fazendaLogoUrl && <img src={fazendaLogoUrl} alt={fazendaNome} className="h-7 w-10 rounded bg-white p-1 object-contain" />}<span className="ml-1 text-[9px] font-semibold sm:text-[10px]">{fazendaNome}</span></div></div></div></div>
          </section>
          <RelatorioCapaGallery fazendaId={fazendaId} selecionada={imagemCapa} onSelect={selecionarCapa} disabled={gerando} />
          <section className="rounded-xl border border-border-base bg-surface-2 p-4"><h3 className="text-sm font-semibold text-content-strong">Resumo</h3><dl className="mt-3 space-y-2 text-xs"><div><dt className="text-content-muted">Fazenda</dt><dd className="font-medium text-content-strong">{fazendaNome}</dd></div><div><dt className="text-content-muted">Referência da capa</dt><dd className="font-medium text-content-strong">{periodoCapa || 'Aguardando período'}</dd></div><div><dt className="text-content-muted">Seções</dt><dd className="font-medium text-content-strong">{resumo || 'Nenhuma selecionada'}</dd></div></dl></section>
          <button type="button" disabled={!podeGerar} onClick={gerar} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50">{gerando ? etapa || 'Preparando relatório' : 'Gerar e baixar PDF'}</button>
          {gerando && <div className="flex items-center justify-center gap-2 text-xs text-content-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-primary" />Aguarde, não feche esta janela.</div>}
        </div>
      </div>
    </Modal>
  )
}
