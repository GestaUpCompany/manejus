import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { decompressPayload, mountRelatorio } from '../report/vision'

interface PrintJob {
  b64: string
  hiddenPages: string[]
  titulo: string
  ts?: number
}

export function RelatorioImpressao() {
  const hostRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [erro, setErro] = useState('')

  useEffect(() => {
    const raw = localStorage.getItem('vision-print-job')
    const job = raw ? (JSON.parse(raw) as PrintJob) : null
    const expirado = job?.ts ? Date.now() - job.ts > 2 * 60 * 60 * 1000 : false
    if (!job || expirado || !hostRef.current) {
      setErro('Nenhum relatório preparado. Gere o PDF a partir da página do relatório.')
      return
    }
    let cancelado = false

    async function montar(j: PrintJob) {
      const payload = await decompressPayload(j.b64)
      if (cancelado || !hostRef.current) return
      localStorage.removeItem('vision-print-job')
      mountRelatorio(hostRef.current, payload, {
        hiddenPages: j.hiddenPages,
        autoPrint: true,
        titulo: j.titulo,
      })
    }

    montar(job).catch((e) => {
      if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha ao montar o relatório.')
    })

    // Aberta via window.open: fechar a aba devolve o usuário à tela de geração
    // intacta. No fallback de mesmo-tab (popup bloqueado), navega de volta.
    const voltar = () => {
      if (window.opener) window.close()
      else navigate('/relatorios/vision')
    }
    window.addEventListener('afterprint', voltar)
    return () => {
      cancelado = true
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
          No diálogo de impressão, escolha <b>"Salvar como PDF"</b>. Layout paisagem 1280×720, uma página por slide.
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
