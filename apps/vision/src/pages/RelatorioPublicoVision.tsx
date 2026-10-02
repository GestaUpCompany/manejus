import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@gestaup/supabase'
import { decompressPayload, mountRelatorio } from '../report/vision'

export function RelatorioPublicoVision() {
  const { token } = useParams<{ token: string }>()
  const hostRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      if (!token || !hostRef.current) return
      try {
        const { data: rel, error: relErr } = await supabase
          .from('relatorios_publicos')
          .select('fazenda_id, titulo, config, expira_em')
          .eq('id', token)
          .eq('tipo', 'vision')
          .eq('ativo', true)
          .maybeSingle()

        if (relErr || !rel) throw new Error('Relatório não encontrado ou link desativado.')
        if (rel.expira_em && new Date(rel.expira_em) < new Date()) {
          throw new Error('Este link de relatório expirou.')
        }

        const { data: b64, error: payErr } = await supabase.rpc('vision_relatorio_payload', { p_token: token })
        if (payErr || !b64) throw new Error('Não foi possível carregar os dados do relatório.')

        const payload = await decompressPayload(b64)
        if (cancelado || !hostRef.current) return

        mountRelatorio(hostRef.current, payload, {
          public: true,
          hiddenPages: (rel.config as { paginas_ocultas?: string[] })?.paginas_ocultas ?? [],
          titulo: rel.titulo ?? 'Relatório Vision',
        })
        setEstado('ok')
      } catch (e) {
        if (!cancelado) {
          setMensagem(e instanceof Error ? e.message : 'Falha ao carregar o relatório.')
          setEstado('erro')
        }
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [token])

  return (
    <div className="min-h-screen bg-[#EEF2F6]">
      {estado === 'carregando' && (
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
          Carregando relatório…
        </div>
      )}
      {estado === 'erro' && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-xl border border-red-200 bg-white px-8 py-6 text-center shadow-sm">
            <p className="text-base font-semibold text-red-700">Relatório indisponível</p>
            <p className="mt-1 text-sm text-gray-500">{mensagem}</p>
          </div>
        </div>
      )}
      <div ref={hostRef} />
    </div>
  )
}
