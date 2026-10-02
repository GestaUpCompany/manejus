import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@gestaup/supabase'
import { useToast } from '@gestaup/ui'
import {
  PAGE_TITLES,
  computeRange,
  extractReads,
  payloadFromReads,
  payloadToB64,
  sheetsFromFile,
  type FazendaRef,
  type RelatorioPayload,
} from '../report/vision'

const PAGE_IDS = Object.keys(PAGE_TITLES).sort()

interface Fazenda extends FazendaRef {
  acesso_id: string
}

interface LinkRow {
  id: string
  titulo: string
  config: { paginas_ocultas?: string[] }
  criado_em: string
  expira_em: string | null
  ativo: boolean
  fazenda_nome?: string
}

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STOPWORDS = new Set(['fazenda', 'faz', 'grupo', 'agropecuaria', 'de', 'da', 'do', 'das', 'dos', 'e'])

const normTokens = (s: string) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t && !STOPWORDS.has(t)),
  )

// Prefixo só vale a partir de 5 caracteres: cobre plural ("semente"/"sementes") e
// nomes colados ("gesta"/"gestaup") sem transformar "nova" em hit de "Novapec".
const tokMatch = (a: string, b: string) =>
  a === b || (a.length >= 5 && b.startsWith(a)) || (b.length >= 5 && a.startsWith(b))

const scoreFazenda = (tf: Set<string>, fonte: Set<string>) => {
  if (!tf.size) return 0
  const hits = [...tf].filter((t) => [...fonte].some((s) => tokMatch(t, s))).length
  return hits / tf.size
}

// O nome da fazenda vem em Cadastros!B3 ("Cadastro de Referências - <nome>")
// ou na célula logo abaixo do rótulo "Nome Fazenda".
function nomeDaPlanilha(cad: unknown[][] | undefined): string {
  if (!cad) return ''
  const m = String(cad[2]?.[1] ?? '').match(/refer[eê]ncias\s*[-–]\s*(.+)/i)
  if (m?.[1]) return m[1].trim()
  const idx = cad.findIndex((r) => String(r?.[1] ?? '').trim().toLowerCase() === 'nome fazenda')
  for (let r = idx + 1; idx >= 0 && r < Math.min(idx + 4, cad.length); r++) {
    const v = String(cad[r]?.[1] ?? '').trim()
    if (v) return v
  }
  return ''
}

// Casa o nome detectado com as fazendas ativas por sobreposição de tokens.
// O nome da planilha é a fonte principal; o nome do arquivo só entra se ela falhar.
// Só aceita se houver um único melhor candidato com >=50% dos tokens presentes.
function detectarFazenda(nomePlanilha: string, nomeArquivo: string, fazendas: Fazenda[]): Fazenda | undefined {
  const fontes = [nomePlanilha, nomeArquivo.replace(/\.[^.]+$/, '')].map(normTokens).filter((s) => s.size)
  for (const fonte of fontes) {
    let melhor: Fazenda | undefined
    let melhorScore = 0
    let empate = false
    for (const f of fazendas) {
      const score = scoreFazenda(normTokens(f.nome), fonte)
      if (score > melhorScore) {
        melhor = f
        melhorScore = score
        empate = false
      } else if (score === melhorScore && score > 0) {
        empate = true
      }
    }
    if (melhor && melhorScore >= 0.5 && !empate) return melhor
  }
  return undefined
}

export function RelatorioVision() {
  const toast = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const [fazendas, setFazendas] = useState<Fazenda[]>([])
  const [fazendaId, setFazendaId] = useState('')
  const [arquivoNome, setArquivoNome] = useState('')
  const [reads, setReads] = useState<Record<string, unknown[]> | null>(null)
  const [range, setRange] = useState<{ min: string; max: string } | null>(null)

  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [saldoCaixa, setSaldoCaixa] = useState('0')
  const [anoGiro, setAnoGiro] = useState('')
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())

  const [links, setLinks] = useState<LinkRow[]>([])
  const [gerando, setGerando] = useState<'link' | 'pdf' | null>(null)
  const [baixandoLink, setBaixandoLink] = useState<string | null>(null)
  const [linkGerado, setLinkGerado] = useState('')
  const [processando, setProcessando] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [erro, setErro] = useState('')
  const [detect, setDetect] = useState<{ nome: string; arquivo: string } | null>(null)

  const fazenda = useMemo(() => fazendas.find((f) => f.id === fazendaId), [fazendas, fazendaId])

  useEffect(() => {
    supabase
      .from('fazendas')
      .select('id, nome, acesso_id, logo_url')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) setErro(`Erro ao carregar fazendas: ${error.message}`)
        else setFazendas((data ?? []) as Fazenda[])
      })
  }, [])

  // Sem p_fazenda_id a RPC lista todos os links Vision (o controller gerencia
  // qualquer fazenda). Carrega no mount: não depende de fazenda nem planilha.
  const carregarLinks = useCallback(async () => {
    const { data, error } = await supabase.rpc('vision_listar_relatorios', {})
    if (error) setErro(`Erro ao listar links: ${error.message}`)
    else setLinks((data ?? []) as LinkRow[])
  }, [])

  useEffect(() => {
    carregarLinks()
  }, [carregarLinks])

  useEffect(() => {
    setLinkGerado('')
  }, [fazendaId])

  // Tenta associar a planilha a uma fazenda ativa quando a lista estiver pronta.
  // Não sobrescreve uma escolha manual já feita.
  useEffect(() => {
    if (!detect || fazendaId || !fazendas.length) return
    const f = detectarFazenda(detect.nome, detect.arquivo, fazendas)
    if (f) {
      setFazendaId(f.id)
      toast.success(`Fazenda identificada na planilha: ${f.nome}`)
    } else if (detect.nome) {
      toast.warning(`Não foi possível associar "${detect.nome}" a uma fazenda ativa. Selecione manualmente.`)
    }
    setDetect(null)
  }, [detect, fazendaId, fazendas, toast])

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setErro('')
    setProcessando(true)
    setArquivoNome(file.name)
    try {
      const { sheets, missing } = await sheetsFromFile(file)
      if (missing.length) toast.warning(`Abas não encontradas na planilha: ${missing.join(', ')}`)
      setDetect({ nome: nomeDaPlanilha(sheets['Cadastros']), arquivo: file.name })
      const r = extractReads(sheets)
      const rg = computeRange(r)
      setReads(r)
      setRange(rg)
      const agora = new Date()
      const ano = agora.getFullYear()
      const ultimoDiaMesAtual = String(new Date(ano, agora.getMonth() + 1, 0).getDate()).padStart(2, '0')
      const fimMesAtual = `${ano}-${String(agora.getMonth() + 1).padStart(2, '0')}-${ultimoDiaMesAtual}`
      let iniPadrao = `${ano}-01-01` < rg.min ? rg.min : `${ano}-01-01`
      let fimPadrao = fimMesAtual > rg.max ? rg.max : fimMesAtual
      if (iniPadrao > fimPadrao) {
        iniPadrao = rg.min
        fimPadrao = rg.max
      }
      setIni(iniPadrao)
      setFim(fimPadrao)
      setAnoGiro(String(ano))
    } catch (e) {
      setErro(`Falha ao ler a planilha: ${e instanceof Error ? e.message : String(e)}`)
      setReads(null)
      setRange(null)
      setArquivoNome('')
    } finally {
      setProcessando(false)
    }
  }, [toast])

  // Drop em qualquer lugar da página. Sem preventDefault em dragover/drop o
  // navegador abriria o arquivo numa navegação nova e o usuário perderia a tela.
  useEffect(() => {
    const ehArquivo = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const onDragEnter = (e: DragEvent) => {
      if (!ehArquivo(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (ehArquivo(e)) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!ehArquivo(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!ehArquivo(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!processando) onFile(e.dataTransfer?.files?.[0])
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFile, processando])

  function montarPayload(): RelatorioPayload | null {
    if (!reads || !fazenda) return null
    return payloadFromReads(reads, fazenda, {
      ini: ini || undefined,
      fim: fim || undefined,
      saldoCaixaInicial: Number(saldoCaixa.replace(',', '.')) || 0,
      anoBaseGiro: Number(anoGiro) || undefined,
    })
  }

  async function gerarLink() {
    const payload = montarPayload()
    if (!payload || !fazenda) return
    setGerando('link')
    setErro('')
    try {
      const b64 = await payloadToB64(payload)
      const { data, error } = await supabase.rpc('vision_criar_relatorio', {
        p_fazenda_id: fazenda.id,
        p_titulo: `Relatório Vision — ${fazenda.nome}`,
        p_config: {
          paginas_ocultas: [...ocultas],
          ini,
          fim,
          saldo_caixa_inicial: Number(saldoCaixa.replace(',', '.')) || 0,
          ano_base_giro: Number(anoGiro) || undefined,
        },
        p_payload: b64,
      })
      if (error) throw error
      const url = `${window.location.origin}/r/${data}`
      setLinkGerado(url)
      carregarLinks()
    } catch (e) {
      setErro(`Erro ao gerar link: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGerando(null)
    }
  }

  async function baixarPdf() {
    const payload = montarPayload()
    if (!payload || !fazenda) return
    setGerando('pdf')
    setErro('')
    try {
      const b64 = await payloadToB64(payload)
      // localStorage (não sessionStorage): o job precisa atravessar para a aba
      // nova de impressão. Abrir em nova aba preserva o estado desta tela —
      // sem isso, voltar da impressão zerava planilha, fazenda e configs.
      localStorage.setItem(
        'vision-print-job',
        JSON.stringify({
          b64,
          hiddenPages: [...ocultas],
          titulo: `Relatório Vision — ${fazenda.nome}`,
          ts: Date.now(),
        }),
      )
      const win = window.open('/relatorios/imprimir', '_blank')
      if (!win) navigate('/relatorios/imprimir')
    } catch (e) {
      setErro(`Erro ao preparar PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGerando(null)
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Link copiado para a área de transferência.')
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione e copie o link.')
    }
  }

  // Regenera o PDF a partir do payload salvo no link, sem precisar da planilha.
  // Funciona mesmo com o link inativo/expirado (RPC autenticada, sem checagem pública).
  async function baixarPdfDoLink(link: LinkRow) {
    setBaixandoLink(link.id)
    setErro('')
    try {
      const { data, error } = await supabase.rpc('vision_baixar_payload', { p_id: link.id })
      if (error) throw error
      if (!data) throw new Error('Este link não tem payload salvo.')
      localStorage.setItem(
        'vision-print-job',
        JSON.stringify({
          b64: data,
          hiddenPages: link.config?.paginas_ocultas ?? [],
          titulo: link.titulo,
          ts: Date.now(),
        }),
      )
      const win = window.open('/relatorios/imprimir', '_blank')
      if (!win) navigate('/relatorios/imprimir')
    } catch (e) {
      setErro(`Erro ao preparar PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBaixandoLink(null)
    }
  }

  async function alternarAtivo(link: LinkRow) {
    const { error } = await supabase.rpc('vision_atualizar_relatorio', { p_id: link.id, p_ativo: !link.ativo })
    if (error) toast.error(`Erro: ${error.message}`)
    else carregarLinks()
  }

  async function excluir(link: LinkRow) {
    if (!window.confirm(`Excluir definitivamente o link "${link.titulo}"?`)) return
    const { error } = await supabase.rpc('vision_excluir_relatorio', { p_id: link.id })
    if (error) toast.error(`Erro: ${error.message}`)
    else carregarLinks()
  }

  const pronto = !!(reads && fazenda)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Relatório Vision</h1>
        <p className="text-content-muted mt-1">
          Gere o relatório financeiro completo a partir da planilha Vision: link público interativo ou PDF.
        </p>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>
      )}

      {/* Passo 1: fazenda + planilha */}
      <section className="bg-surface-1 rounded-xl border border-border-base p-5 space-y-4">
        <h2 className="text-sm font-semibold text-content uppercase tracking-wide">1. Fazenda e dados</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Fazenda</label>
            <select
              value={fazendaId}
              onChange={(e) => setFazendaId(e.target.value)}
              className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Selecione a fazenda…</option>
              {fazendas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Planilha Vision (.xlsm ou extrato .json)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsm,.xlsx,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                onFile(f)
              }}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => !processando && fileRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !processando) fileRef.current?.click()
              }}
              className={`flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-3 py-3 text-center transition-colors ${
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border-base bg-surface-1 hover:bg-surface-2'
              } ${processando ? 'cursor-wait opacity-60' : ''}`}
            >
              <span className="max-w-full truncate text-sm font-medium text-content-strong">
                {processando ? 'Lendo planilha…' : arquivoNome || 'Arraste a planilha aqui ou clique para escolher'}
              </span>
              {!arquivoNome && !processando && (
                <span className="text-xs text-content-faint">.xlsm, .xlsx ou .json</span>
              )}
            </div>
            <p className="text-xs text-content-faint mt-1">
              Aceita .xlsm/.xlsx de qualquer tamanho.
            </p>
          </div>
        </div>
        {range && (
          <p className="text-sm text-content-muted">
            Dados detectados de <b className="text-content-strong">{range.min.split('-').reverse().join('/')}</b> a{' '}
            <b className="text-content-strong">{range.max.split('-').reverse().join('/')}</b>.
          </p>
        )}
      </section>

      {/* Passo 2: período + abas */}
      {reads && (
        <section className="bg-surface-1 rounded-xl border border-border-base p-5 space-y-4">
          <h2 className="text-sm font-semibold text-content uppercase tracking-wide">2. Período e páginas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">Início</label>
              <input
                type="date"
                value={ini}
                min={range?.min}
                max={fim || range?.max}
                onChange={(e) => {
                  setIni(e.target.value)
                  if (e.target.value > fim) setFim(e.target.value)
                }}
                className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">Fim</label>
              <input
                type="date"
                value={fim}
                min={ini || range?.min}
                max={range?.max}
                onChange={(e) => setFim(e.target.value)}
                className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">Saldo de caixa inicial (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={saldoCaixa}
                onChange={(e) => setSaldoCaixa(e.target.value)}
                className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">Ano-base do giro</label>
              <input
                type="number"
                value={anoGiro}
                onChange={(e) => setAnoGiro(e.target.value)}
                className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-content">Ocultar páginas ({ocultas.size} selecionadas)</label>
              {ocultas.size > 0 && (
                <button onClick={() => setOcultas(new Set())} className="text-xs text-primary hover:underline">
                  Reexibir todas
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              {PAGE_IDS.map((id) => (
                <label
                  key={id}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
                    ocultas.has(id)
                      ? 'border-red-300 bg-red-50 text-red-800 line-through'
                      : 'border-border-base bg-surface-1 text-content hover:bg-surface-2'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={ocultas.has(id)}
                    onChange={() =>
                      setOcultas((s) => {
                        const n = new Set(s)
                        if (n.has(id)) n.delete(id)
                        else n.add(id)
                        return n
                      })
                    }
                    className="accent-red-600"
                  />
                  <span className="truncate" title={PAGE_TITLES[id]}>
                    <span className="font-semibold">{id.slice(1)}</span> {PAGE_TITLES[id]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Passo 3: gerar */}
      {reads && (
        <section className="bg-surface-1 rounded-xl border border-border-base p-5 space-y-4">
          <h2 className="text-sm font-semibold text-content uppercase tracking-wide">3. Gerar</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={gerarLink}
              disabled={!pronto || gerando !== null}
              className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gerando === 'link' ? 'Gerando…' : 'Gerar link público'}
            </button>
            <button
              onClick={baixarPdf}
              disabled={!pronto || gerando !== null}
              className="rounded-lg bg-[#0B3D6E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082F56] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gerando === 'pdf' ? 'Preparando…' : 'Baixar PDF'}
            </button>
          </div>
          <p className="text-xs text-content-faint">
            O link abre o relatório interativo (sem botão de PDF). O PDF abre a visualização de impressão: use
            "Salvar como PDF" no diálogo do navegador.
          </p>
          {linkGerado && (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2">
              <span className="flex-1 truncate text-sm font-medium text-green-900">{linkGerado}</span>
              <button
                onClick={() => copiar(linkGerado)}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Copiar
              </button>
              <a
                href={linkGerado}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-green-700 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
              >
                Abrir
              </a>
            </div>
          )}
        </section>
      )}

      {/* Links existentes */}
      {links.length > 0 && (
        <section className="bg-surface-1 rounded-xl border border-border-base p-5">
          <h2 className="text-sm font-semibold text-content uppercase tracking-wide mb-3">
            Links gerados
          </h2>
          <div className="space-y-2">
            {links.map((l) => {
              const url = `${window.location.origin}/r/${l.id}`
              const expirado = l.expira_em && new Date(l.expira_em) < new Date()
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border-base px-3 py-2"
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      !l.ativo ? 'bg-gray-400' : expirado ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    title={!l.ativo ? 'Inativo' : expirado ? 'Expirado' : 'Ativo'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content-strong truncate">{l.titulo}</p>
                    <p className="text-xs text-content-faint">
                      {fmtDataHora(l.criado_em)}
                      {l.fazenda_nome ? ` · ${l.fazenda_nome}` : ''}
                      {l.config?.paginas_ocultas?.length
                        ? ` · ${l.config.paginas_ocultas.length} página(s) oculta(s)`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => baixarPdfDoLink(l)}
                    disabled={baixandoLink === l.id}
                    className="rounded-md border border-border-base px-2.5 py-1 text-xs font-medium text-content hover:bg-surface-2 disabled:opacity-50"
                  >
                    {baixandoLink === l.id ? 'Gerando…' : 'Baixar PDF'}
                  </button>
                  <button
                    onClick={() => copiar(url)}
                    className="rounded-md border border-border-base px-2.5 py-1 text-xs font-medium text-content hover:bg-surface-2"
                  >
                    Copiar link
                  </button>
                  <button
                    onClick={() => alternarAtivo(l)}
                    className="rounded-md border border-border-base px-2.5 py-1 text-xs font-medium text-content hover:bg-surface-2"
                  >
                    {l.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                  <button
                    onClick={() => excluir(l)}
                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Excluir
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="flex h-[70%] w-[80%] items-center justify-center rounded-2xl border-4 border-dashed border-white/80">
            <p className="text-xl font-semibold text-white drop-shadow">Solte a planilha para carregar</p>
          </div>
        </div>
      )}
    </div>
  )
}
