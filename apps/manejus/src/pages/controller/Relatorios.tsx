import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { getFazendaIdForUser } from '@gestaup/shared'
import { useToast, PageSkeleton, ConfirmModal } from '@gestaup/ui'
import { RelatorioGeralModal } from '../../components/relatorios/RelatorioGeralModal'
import { carregarRelatorioZootecnico, gerarExcelZootecnico } from '../../services/relatorioZootecnicoService'
import { gerarRelatorioZootecnicoPDFPuppeteer } from '../../utils/relatorioZootecnicoPDFPuppeteer'

interface RelatorioPublico {
  id: string
  tipo: string
  titulo: string
  criado_em: string
  expira_em: string | null
  ativo: boolean
  config?: { escopo?: string } | null
}

interface RelatorioDisponivel {
  tipo: string
  titulo: string
  descricao: string
  icone: string
  rotaPdf?: string
  escopo?: 'insumos' | 'formulacoes'
}

const RELATORIOS_DISPONIVEIS: RelatorioDisponivel[] = [
  {
    tipo: 'combustivel',
    titulo: 'Combustível',
    descricao: 'Abastecimento por máquina/veículo, combustível e operação, e estoque por tanque com extrato, no mesmo período.',
    icone: '⛽',
  },
  {
    tipo: 'consumo',
    titulo: 'Consumo',
    descricao: 'CMS (kg/cab/dia) em matéria natural e matéria seca, consumo %PV, leitura de cocho e custo por lote e período.',
    icone: '🌿',
  },
  {
    tipo: 'tratos',
    titulo: 'Acompanhamento de Tratos',
    descricao: 'Desvio de kg ofertado vs planejado e pontualidade de horários por lote e trato.',
    icone: '🐂',
  },
  {
    tipo: 'atividades',
    titulo: 'Atividades',
    descricao: 'Produtividade por funcionário, tempo produtivo, taxa de conclusão, atividades não previstas e imprevistos por período.',
    icone: '📋',
  },
  {
    tipo: 'bebedouros',
    titulo: 'Bebedouros',
    descricao: 'Status de limpeza, histórico e qualidade da água por bebedouro e período.',
    icone: '💧',
  },
  {
    tipo: 'clima',
    titulo: 'Clima',
    descricao: 'Chuva acumulada média da fazenda e por pluviômetro (região), temperatura e umidade por período.',
    icone: '🌧️',
  },
  {
    tipo: 'morte',
    titulo: 'Mortes',
    descricao: 'Registros de morte por causa, categoria e sexo, taxa de mortalidade, peso médio e perda financeira estimada por animal (preço por kg vivo por categoria).',
    icone: '💀',
  },
  {
    tipo: 'rodeio',
    titulo: 'Rodeio de Gado',
    descricao: 'Contagem de cabeças por categoria, escore do gado e de fezes, e alertas de diagnóstico por pasto, lote e período.',
    icone: '🤠',
  },
  {
    tipo: 'pastagens',
    titulo: 'Manejo de Pastagens',
    descricao: 'Movimentações entre pastos, avaliação saída/entrada, histórico de ocupação com dias em pasto, taxa de lotação (UA/ha) e desvio da meta.',
    icone: '🌾',
  },
  {
    tipo: 'estoque',
    titulo: 'Estoque de Insumos',
    descricao: 'Apoio à decisão sobre insumos: o que repor e quanto comprar, capital parado ou em excesso, cobertura, consumo do período, valor em estoque e curva ABC.',
    icone: '📦',
    escopo: 'insumos',
  },
  {
    tipo: 'estoque',
    titulo: 'Estoque de Formulações',
    descricao: 'Apoio à decisão sobre formulações: o que repor e quanto comprar, capital parado ou em excesso, cobertura, consumo do período, valor em estoque e curva ABC.',
    icone: '📦',
    escopo: 'formulacoes',
  },
  {
    tipo: 'cantina',
    titulo: 'Cantina',
    descricao: 'Estoque da cozinha por item (saldo inicial, entradas, baixas e saldo final), refeições servidas, custo por refeição, marmitas, pratos feitos e extrato por período.',
    icone: '🍽️',
  },
]

// 'todos' é o escopo antigo (insumos e formulações juntos): não é mais criado, mas links antigos ainda o têm
const ESCOPOS_ESTOQUE = [
  { value: 'todos', label: 'Insumos e formulações' },
  { value: 'insumos', label: 'Somente insumos' },
  { value: 'formulacoes', label: 'Somente formulações' },
]

function tituloEstoquePorEscopo(escopo: 'insumos' | 'formulacoes', fazendaNome: string | null): string {
  const base = `Relatório de Estoque de ${escopo === 'insumos' ? 'Insumos' : 'Formulações'}`
  return fazendaNome ? `${base} - ${fazendaNome}` : base
}

const ROTULOS_TIPO: Record<string, string> = {
  estoque: 'Estoque',
  estoque_combustivel: 'Estoque de Combustível',
}

function rotuloTipo(tipo: string): string {
  const rotulo = ROTULOS_TIPO[tipo] ?? RELATORIOS_DISPONIVEIS.find((r) => r.tipo === tipo)?.titulo
  if (rotulo) return rotulo
  const texto = tipo.replace(/_/g, ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function tituloExibicao(titulo: string, fazendaNome: string | null): string {
  const sufixo = fazendaNome ? ` - ${fazendaNome}` : ''
  const semSufixo = sufixo && titulo.endsWith(sufixo) ? titulo.slice(0, -sufixo.length) : titulo
  return semSufixo.replace(/^Relatório de /, '')
}

export function Relatorios() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [fazendaLogoUrl, setFazendaLogoUrl] = useState<string | null>(null)
  const [acessoConfinamento, setAcessoConfinamento] = useState(false)
  const [modalRelatorioGeral, setModalRelatorioGeral] = useState(false)
  const [linksAtivos, setLinksAtivos] = useState<RelatorioPublico[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [relatorioSelecionado, setRelatorioSelecionado] = useState<RelatorioDisponivel | null>(null)
  const [tituloLink, setTituloLink] = useState('')
  const [linkGerado, setLinkGerado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [diasZootecnico, setDiasZootecnico] = useState(22)
  const [gerandoZootecnico, setGerandoZootecnico] = useState(false)
  const [gerandoZootecnicoPdf, setGerandoZootecnicoPdf] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: string; id?: string; ids?: string[] } | null>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])

  useEffect(() => {
    if (user) {
      carregarFazenda()
    }
  }, [user])

  const exportarZootecnico = async () => {
    if (!fazendaId || !fazendaNome) return
    setGerandoZootecnico(true)
    try {
      const dados = await carregarRelatorioZootecnico(fazendaId, fazendaNome, diasZootecnico)
      const blob = await gerarExcelZootecnico(dados, diasZootecnico)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Relatório Zootécnico - ${fazendaNome}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Relatório zootécnico gerado')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível gerar o relatório zootécnico')
    } finally {
      setGerandoZootecnico(false)
    }
  }

  const baixarPdfZootecnico = async () => {
    if (!fazendaId || !fazendaNome) return
    setGerandoZootecnicoPdf(true)
    try {
      const dados = await carregarRelatorioZootecnico(fazendaId, fazendaNome, diasZootecnico)
      const blob = await gerarRelatorioZootecnicoPDFPuppeteer({ fazendaId, fazendaLogoUrl, dados, dias: diasZootecnico })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Relatório Zootécnico - ${fazendaNome}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF do relatório zootécnico gerado')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o PDF do relatório zootécnico')
    } finally {
      setGerandoZootecnicoPdf(false)
    }
  }

  const carregarFazenda = async () => {
    if (!user) return
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    if (fid) {
      const { data: fazendaData } = await supabase
        .from('fazendas')
        .select('nome, logo_url, acesso_confinamento')
        .eq('id', fid)
        .maybeSingle()
      setFazendaNome(fazendaData?.nome ?? null)
      setFazendaLogoUrl(fazendaData?.logo_url ?? null)
      setAcessoConfinamento(fazendaData?.acesso_confinamento ?? false)
      await carregarLinks(fid)
    }
    setLoading(false)
  }

  const carregarLinks = async (fid: string) => {
    const { data, error } = await supabase
      .from('relatorios_publicos')
      .select('id, tipo, titulo, criado_em, expira_em, ativo, config')
      .eq('fazenda_id', fid)
      .order('criado_em', { ascending: false })

    if (error) {
      console.error('Erro ao carregar links:', error)
    } else {
      setLinksAtivos(data as RelatorioPublico[])
    }
  }

  const abrirModalGerarLink = (rel: RelatorioDisponivel) => {
    setRelatorioSelecionado(rel)
    const tituloPadrao = rel.escopo
      ? tituloEstoquePorEscopo(rel.escopo, fazendaNome)
      : fazendaNome
        ? `Relatório de ${rel.titulo} - ${fazendaNome}`
        : `Relatório de ${rel.titulo}`
    setTituloLink(tituloPadrao)
    setLinkGerado(null)
    setCopiado(false)
    setModalAberto(true)
  }

  const gerarLink = async () => {
    if (!fazendaId || !relatorioSelecionado || !user) return

    const { data, error } = await supabase
      .from('relatorios_publicos')
      .insert({
        fazenda_id: fazendaId,
        tipo: relatorioSelecionado.tipo,
        titulo: tituloLink.trim() || relatorioSelecionado.titulo,
        criado_por: user.id,
        ...(relatorioSelecionado.escopo ? { config: { escopo: relatorioSelecionado.escopo } } : {}),
      })
      .select('id')
      .single()

    if (error) {
      console.error('Erro ao gerar link:', error)
      toast.error('Erro ao gerar link. Tente novamente.')
      return
    }

    const url = `${window.location.origin}/r/${data.id}`
    setLinkGerado(url)
    await carregarLinks(fazendaId)
  }

  const copiarLink = async () => {
    if (!linkGerado) return
    try {
      await navigator.clipboard.writeText(linkGerado)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch (err) {
      console.error('Erro ao copiar:', err)
    }
  }

  const desativarLink = async (id: string) => {
    if (!fazendaId) return
    setConfirmAction({ type: 'desativar', id })
  }

  const desativarLinkExec = async (id: string) => {
    if (!fazendaId) return

    const { error } = await supabase
      .from('relatorios_publicos')
      .update({ ativo: false })
      .eq('id', id)

    if (error) {
      console.error('Erro ao desativar link:', error)
      toast.error('Erro ao desativar link.')
    } else {
      await carregarLinks(fazendaId)
    }
  }

  const reativarLink = async (id: string) => {
    if (!fazendaId) return

    const { error } = await supabase
      .from('relatorios_publicos')
      .update({ ativo: true })
      .eq('id', id)

    if (error) {
      console.error('Erro ao reativar link:', error)
      toast.error('Erro ao reativar link.')
    } else {
      await carregarLinks(fazendaId)
    }
  }

  const excluirLink = async (id: string) => {
    if (!fazendaId) return
    setConfirmAction({ type: 'excluir', id })
  }

  const excluirLinkExec = async (id: string) => {
    if (!fazendaId) return

    const { error } = await supabase
      .from('relatorios_publicos')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erro ao excluir link:', error)
      toast.error('Erro ao excluir link.')
    } else {
      await carregarLinks(fazendaId)
    }
  }

  const desativarVarios = async (ids: string[]) => {
    if (!fazendaId) return
    const { error } = await supabase.from('relatorios_publicos').update({ ativo: false }).in('id', ids)
    if (error) {
      console.error('Erro ao desativar links:', error)
      toast.error('Erro ao desativar links.')
    } else {
      setSelecionados([])
      await carregarLinks(fazendaId)
    }
  }

  const excluirVarios = async (ids: string[]) => {
    if (!fazendaId) return
    const { error } = await supabase.from('relatorios_publicos').delete().in('id', ids)
    if (error) {
      console.error('Erro ao excluir links:', error)
      toast.error('Erro ao excluir links.')
    } else {
      setSelecionados([])
      await carregarLinks(fazendaId)
    }
  }

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, id, ids } = confirmAction
    setConfirmAction(null)
    if (ids) {
      if (type === 'desativar') await desativarVarios(ids)
      else await excluirVarios(ids)
      return
    }
    if (type === 'desativar' && id) {
      await desativarLinkExec(id)
    } else if (type === 'excluir' && id) {
      await excluirLinkExec(id)
    }
  }

  const linksVisiveis = linksAtivos.filter((l) => showInactive || l.ativo)
  const selecionadosVisiveis = linksVisiveis.filter((l) => selecionados.includes(l.id)).map((l) => l.id)
  const todosSelecionados = linksVisiveis.length > 0 && selecionadosVisiveis.length === linksVisiveis.length

  const toggleSelecao = (id: string) => {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))
  }

  const toggleTodos = () => {
    setSelecionados(todosSelecionados ? [] : linksVisiveis.map((l) => l.id))
  }

  const relatoriosFiltrados = acessoConfinamento
    ? RELATORIOS_DISPONIVEIS
    : RELATORIOS_DISPONIVEIS.filter((rel) => rel.tipo !== 'tratos')

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1 border-b border-border-base pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-content-faint">Central de relatórios</p>
        <h1 className="text-3xl font-bold tracking-tight text-content-strong">Relatórios</h1>
        <p className="max-w-2xl text-sm text-content-muted">
          Gere PDFs, planilhas ou links públicos interativos para compartilhar com quem não tem login.
        </p>
      </header>

      {fazendaId && fazendaNome && (
        <section aria-label="Relatórios consolidados" className="grid gap-4 lg:grid-cols-5">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-900 via-green-800 to-blue-900 p-6 text-white shadow-sm lg:col-span-3">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border-[28px] border-white/5" />
            <div aria-hidden className="pointer-events-none absolute -bottom-14 right-16 h-36 w-36 rounded-full border-[20px] border-white/5" />
            <div className="relative flex h-full flex-col justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-100">Relatório consolidado</p>
                <h2 className="mt-2 text-2xl font-bold">Infográfico Mensal</h2>
                <p className="mt-2 text-sm text-green-50/90">
                  Abastecimento, Consumo, Bebedouros e Mortes em um único PDF, com período comum, ordem personalizada e capa institucional.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setModalRelatorioGeral(true)}
                  className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-primary-dark shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:bg-surface-1 dark:text-white dark:hover:bg-surface-3"
                >
                  Montar relatório →
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border-base bg-surface-1 p-6 shadow-sm lg:col-span-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-content-faint">Controle de lotes</p>
              <h2 className="mt-2 text-lg font-bold text-content-strong">Relatório Zootécnico</h2>
              <p className="mt-1 text-sm text-content-muted">
                Pesos, metas, consumo (geral e por janela), valor de estoque e custo alimentar.
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-content">
              Janela de consumo (dias)
              <input
                type="number"
                min={1}
                max={365}
                value={diasZootecnico}
                onChange={(e) => setDiasZootecnico(Math.max(1, Math.min(365, Number(e.target.value) || 22)))}
                className="w-20 rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-right tabular-nums"
              />
            </label>
            <div className="mt-auto grid grid-cols-3 gap-2">
              <button type="button" onClick={() => navigate(`/controller/relatorios/zootecnico?dias=${diasZootecnico}`)} className="rounded-lg border border-surface-3 px-3 py-2 text-sm font-semibold text-content transition-colors hover:bg-surface-2">
                Visualizar
              </button>
              <button type="button" disabled={gerandoZootecnicoPdf} onClick={baixarPdfZootecnico} className="rounded-lg border border-surface-3 px-3 py-2 text-sm font-semibold text-content transition-colors hover:bg-surface-2 disabled:opacity-50">
                {gerandoZootecnicoPdf ? 'Gerando…' : 'PDF'}
              </button>
              <button type="button" disabled={gerandoZootecnico} onClick={exportarZootecnico} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                {gerandoZootecnico ? 'Gerando…' : 'Excel'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Relatórios disponíveis */}
      <section aria-labelledby="titulo-disponiveis">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="titulo-disponiveis" className="text-lg font-bold text-content-strong">Relatórios com link público</h2>
          <span className="text-xs tabular-nums text-content-faint">{relatoriosFiltrados.length} disponíveis</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {relatoriosFiltrados.map((rel) => {
            const linkAtivo = linksAtivos.find(
              (l) => l.tipo === rel.tipo && l.ativo && (!rel.escopo || l.config?.escopo === rel.escopo)
            )
            return (
              <article
                key={`${rel.tipo}-${rel.escopo ?? ''}`}
                className={`flex items-center gap-4 rounded-xl border bg-surface-1 p-4 transition-colors hover:bg-surface-2/60 ${
                  linkAtivo ? 'border-green-600/40' : 'border-border-base'
                }`}
              >
                <span aria-hidden className="text-2xl">{rel.icone}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-content-strong">
                    {rel.titulo}
                    {linkAtivo && <span role="img" aria-label="Link ativo" title="Link ativo" className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-content-muted">{rel.descricao}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {linkAtivo ? (
                    <>
                      <a
                        href={`${window.location.origin}/r/${linkAtivo.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-green-700 hover:text-green-800"
                      >
                        Abrir ↗
                      </a>
                      {rel.tipo === 'estoque' && (
                        <button
                          onClick={() => abrirModalGerarLink(rel)}
                          className="text-xs font-medium text-content-muted hover:text-content"
                        >
                          Novo link
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => abrirModalGerarLink(rel)}
                      className="rounded-lg border border-green-700 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-700 hover:text-white dark:border-green-500 dark:text-green-400 dark:hover:bg-green-700 dark:hover:text-white"
                    >
                      Gerar link
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Links públicos */}
      {linksAtivos.length > 0 && (
        <section aria-labelledby="titulo-links" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="titulo-links" className="text-lg font-bold text-content-strong">Links públicos</h2>
              <span className="text-xs tabular-nums text-content-faint">
                {linksAtivos.filter((l) => l.ativo).length} ativos
              </span>
            </div>
            <button
              type="button"
              aria-pressed={showInactive}
              onClick={() => setShowInactive(!showInactive)}
              className="text-xs font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
            >
              {showInactive ? 'Ocultar desativados' : `Mostrar desativados (${linksAtivos.length - linksAtivos.filter((l) => l.ativo).length})`}
            </button>
          </div>

          {selecionadosVisiveis.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/10 px-4 py-2.5 text-sm">
              <span className="font-medium text-content-strong">{selecionadosVisiveis.length} selecionado(s)</span>
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => setConfirmAction({ type: 'desativar', ids: selecionadosVisiveis })} className="font-medium text-amber-600 hover:text-amber-700">
                  Desativar
                </button>
                <button type="button" onClick={() => setConfirmAction({ type: 'excluir', ids: selecionadosVisiveis })} className="font-medium text-red-600 hover:text-red-700">
                  Excluir
                </button>
                <button type="button" onClick={() => setSelecionados([])} className="text-content-muted hover:text-content">
                  Limpar
                </button>
              </div>
            </div>
          )}

          {linksVisiveis.length === 0 && (
            <p className="rounded-xl border border-dashed border-border-base px-4 py-6 text-center text-sm text-content-muted">
              Nenhum link ativo. Os desativados ficam ocultos até você mostrá-los.
            </p>
          )}
          {linksVisiveis.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-base bg-surface-1">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-content-faint">
                    <th className="w-10 py-2.5 pl-4">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos"
                        checked={todosSelecionados}
                        onChange={toggleTodos}
                        className="h-4 w-4 rounded border-surface-3 accent-primary"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-medium">Relatório</th>
                    <th className="py-2.5 px-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {linksVisiveis.map((link) => {
                    const escopo = link.tipo === 'estoque' && link.config?.escopo
                      ? ESCOPOS_ESTOQUE.find((e) => e.value === link.config?.escopo)?.label
                      : null
                    const titulo = tituloExibicao(link.titulo, fazendaNome)
                    const tipoLabel = rotuloTipo(link.tipo)
                    const mostrarTipo = !titulo.toLowerCase().startsWith(tipoLabel.toLowerCase())
                    return (
                      <tr key={link.id} className={`hover:bg-surface-2 ${link.ativo ? '' : 'opacity-60'}`}>
                        <td className="w-10 py-3 pl-4">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${link.titulo}`}
                            checked={selecionados.includes(link.id)}
                            onChange={() => toggleSelecao(link.id)}
                            className="h-4 w-4 rounded border-surface-3 accent-primary"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-medium text-content-strong">{titulo}</p>
                          <p className="mt-0.5 text-xs text-content-muted">
                            {[mostrarTipo ? tipoLabel : null, escopo, new Date(link.criado_em).toLocaleDateString('pt-BR')]
                              .filter(Boolean)
                              .join(' · ')}
                            {!link.ativo && <span className="text-content-faint"> · desativado</span>}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-4 whitespace-nowrap text-xs font-medium">
                            {link.ativo && (
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/r/${link.id}`
                                  navigator.clipboard.writeText(url)
                                  toast.success('Link copiado: ' + url)
                                }}
                                className="text-green-700 hover:text-green-800"
                              >
                                Copiar
                              </button>
                            )}
                            {link.ativo ? (
                              <button onClick={() => desativarLink(link.id)} className="text-content-muted hover:text-content">
                                Desativar
                              </button>
                            ) : (
                              <button onClick={() => reativarLink(link.id)} className="text-green-700 hover:text-green-800">
                                Reativar
                              </button>
                            )}
                            <button onClick={() => excluirLink(link.id)} className="text-red-600 hover:text-red-700">
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </section>
      )}



      {/* Modal de geração de link */}
      {modalAberto && relatorioSelecionado && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalAberto(false)}
        >
          <div
            className="bg-surface-1 rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-content-strong">
                  Gerar link público
                </h3>
                <p className="text-sm text-content-muted mt-1">
                  {relatorioSelecionado.icone} {relatorioSelecionado.titulo}
                </p>
              </div>
              <button
                onClick={() => setModalAberto(false)}
                aria-label="Fechar"
                className="text-content-faint hover:text-content-muted"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!linkGerado ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-content mb-1">
                    Título do relatório
                  </label>
                  <input
                    type="text"
                    value={tituloLink}
                    onChange={(e) => setTituloLink(e.target.value)}
                    placeholder="Ex: Relatório de abastecimento - Janeiro"
                    className="w-full rounded-lg border border-surface-3 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
                  />
                </div>

                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800">
                    O link será público e acessível por qualquer pessoa que o tenha.
                    Não é necessário login. Você pode desativar o link a qualquer momento.
                  </p>
                </div>

                <button
                  onClick={gerarLink}
                  className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 transition-colors"
                >
                  Gerar link
                </button>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-content mb-1">
                    Link gerado
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={linkGerado}
                      readOnly
                      className="flex-1 rounded-lg border border-surface-3 px-3 py-2 text-sm bg-surface-2"
                    />
                    <button
                      onClick={copiarLink}
                      className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors whitespace-nowrap"
                    >
                      {copiado ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>

                <a
                  href={linkGerado}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center rounded-lg border border-surface-3 px-4 py-2.5 text-sm font-medium text-content hover:bg-surface-2 transition-colors mb-2"
                >
                  Abrir relatório
                </a>

                <button
                  onClick={() => setModalAberto(false)}
                  className="block w-full text-center text-sm text-content-muted hover:text-content"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {fazendaId && fazendaNome && (
        <RelatorioGeralModal
          isOpen={modalRelatorioGeral}
          onClose={() => setModalRelatorioGeral(false)}
          fazendaId={fazendaId}
          fazendaNome={fazendaNome}
          fazendaLogoUrl={fazendaLogoUrl}
        />
      )}

      <ConfirmModal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={
          confirmAction?.type === 'desativar'
            ? `Desativar ${confirmAction?.ids ? `${confirmAction.ids.length} links` : 'link público'}`
            : `Excluir ${confirmAction?.ids ? `${confirmAction.ids.length} links` : 'link público'}`
        }
        message={
          confirmAction?.type === 'desativar'
            ? 'O relatório deixará de ser acessível pelo link, mas pode ser reativado depois.'
            : 'O registro será removido permanentemente e o link deixará de funcionar.'
        }
        confirmText={confirmAction?.type === 'desativar' ? 'Desativar' : 'Excluir'}
        variant="danger"
      />
    </div>
  )
}
