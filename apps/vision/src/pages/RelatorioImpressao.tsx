import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { baixarPdfRelatorio, decompressPayload, mountRelatorio } from '../report/vision'

interface PrintJob {
  b64: string
  hiddenPages: string[]
  titulo: string
  ts?: number
  preview?: boolean
}

export function RelatorioImpressao() {
  const hostRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef(false)
  const navigate = useNavigate()
  const [erro, setErro] = useState('')
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    let cancelado = false

    async function montar(j: PrintJob) {
      const payload = await decompressPayload(j.b64)
      if (cancelado || !hostRef.current) return
      // attachShadow não permite remontar no mesmo elemento: novo host por job.
      const host = document.createElement('div')
      hostRef.current.replaceChildren(host)
      mountRelatorio(host, payload, {
        hiddenPages: j.hiddenPages,
        autoPrint: !j.preview,
        titulo: j.titulo,
        // O botão "Baixar PDF" do próprio relatório gera via Puppeteer no
        // servidor — window.print() sairia com cabeçalho/rodapé do navegador
        // e as lâminas fatiadas em A4.
        onPdf: () => baixarPdfRelatorio(payload, { hiddenPages: j.hiddenPages, titulo: j.titulo }),
      })
    }

    async function carregarJob(j: PrintJob | null) {
      const expirado = j?.ts ? Date.now() - j.ts > 2 * 60 * 60 * 1000 : true
      if (!j || expirado) {
        setErro('Nenhum relatório preparado. Gere o PDF a partir da página do relatório.')
        return
      }
      setErro('')
      previewRef.current = !!j.preview
      setPreview(!!j.preview)
      await montar(j)
      // Job de impressão é descartável; o de prévia fica para F5 e re-montagens.
      if (!j.preview) localStorage.removeItem('vision-print-job')
    }

    // 'vision-print-job' = fluxo de impressão; 'vision-preview-job' = prévia
    // descartável. Chaves separadas: um "Baixar PDF" não pode atropelar o
    // conteúdo de uma aba de prévia aberta (e vice-versa).
    const rawPrint = localStorage.getItem('vision-print-job')
    const rawPreview = localStorage.getItem('vision-preview-job')
    carregarJob(
      rawPrint ? (JSON.parse(rawPrint) as PrintJob) : rawPreview ? (JSON.parse(rawPreview) as PrintJob) : null,
    ).catch((e) => {
      if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha ao montar o relatório.')
    })

    // Modo prévia: a tela de geração publica cada novo job neste canal e a aba
    // remonta sozinha — fluxo "corrige na planilha, sobe de novo, confere" sem
    // criar links de teste no banco nem reabrir o diálogo de impressão.
    const canal = new BroadcastChannel('vision-preview-job')
    canal.onmessage = (e) => {
      const j = e.data as PrintJob
      localStorage.setItem('vision-preview-job', JSON.stringify(j))
      carregarJob(j).catch((err) => setErro(err instanceof Error ? err.message : String(err)))
    }

    // Aberta via window.open: fechar a aba devolve o usuário à tela de geração
    // intacta. No fallback de mesmo-tab (popup bloqueado), navega de volta.
    const voltar = () => {
      // Na prévia o usuário pode imprimir pelo botão do próprio relatório;
      // fechar a aba aqui quebraria o fluxo de conferência.
      if (previewRef.current) return
      if (window.opener) window.close()
      else navigate('/relatorios/vision')
    }
    window.addEventListener('afterprint', voltar)
    return () => {
      cancelado = true
      canal.close()
      window.removeEventListener('afterprint', voltar)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#EEF2F6]">
      <style>{'@media print { .vision-print-bar { display: none !important; } body { background: #fff; } }'}</style>
      <div className="vision-print-bar sticky top-0 z-50 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <button
          onClick={() => navigate('/relatorios/vision')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Voltar
        </button>
        <p className="text-sm text-gray-500">
          {preview
            ? 'Prévia descartável: nada foi publicado. A aba se atualiza sozinha a cada novo upload na tela de geração.'
            : <>No diálogo de impressão, escolha <b>"Salvar como PDF"</b>. Layout paisagem 1280×720, uma página por slide.</>}
        </p>
      </div>
      {erro ? (
        <div className="flex items-center justify-center py-24">
          <div className="rounded-xl border border-red-200 bg-white px-8 py-6 text-center shadow-sm">
            <p className="text-base font-semibold text-red-700">Relatório indisponível</p>
            <p className="mt-1 text-sm text-gray-500">{erro}</p>
          </div>
        </div>
      ) : (
        <div ref={hostRef} />
      )}
    </div>
  )
}
