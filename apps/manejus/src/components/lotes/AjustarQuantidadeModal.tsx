import { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Input, useToast } from '@gestaup/ui'
import { supabase } from '@gestaup/supabase'

interface CategoriaAtual {
  id: string
  categoria: string
  quant_atual: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  loteId: string
  loteNome: string
  usuarioId: string | undefined
  usuarioEmail: string | undefined
  onAjustado: () => void
}

// Ajusta a quantidade das categorias que já existem no lote, gravando um movimento 'Ajuste' (aparece no
// histórico do lote e entra no calculate_quant_atual, então não é desfeito por recálculos). Usa a RPC
// ajustar_quantidade_lote_categoria, que valida permissão, motivo e o resultado final.
export function AjustarQuantidadeModal({
  isOpen,
  onClose,
  fazendaId,
  loteId,
  loteNome,
  usuarioId,
  usuarioEmail,
  onAjustado,
}: Props) {
  const toast = useToast()
  const [categorias, setCategorias] = useState<CategoriaAtual[]>([])
  const [novas, setNovas] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setNovas({})
    setMotivo('')
    setLoading(true)
    supabase
      .from('lote_categorias')
      .select('id, categoria, quant_atual')
      .eq('lote_id', loteId)
      .eq('ativo', true)
      .order('categoria')
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao carregar as categorias do lote.')
        setCategorias((data || []).map((c: any) => ({ id: c.id, categoria: c.categoria, quant_atual: Number(c.quant_atual) || 0 })))
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loteId])

  const parseQtd = (v: string | undefined): number | null => {
    if (v === undefined || v.trim() === '') return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 ? n : NaN
  }

  const alteracoes = useMemo(() => {
    const lista: { categoria: string; antes: number; depois: number }[] = []
    for (const c of categorias) {
      const q = parseQtd(novas[c.id])
      if (q !== null && !Number.isNaN(q) && q !== c.quant_atual) {
        lista.push({ categoria: c.categoria, antes: c.quant_atual, depois: q })
      }
    }
    return lista
  }, [categorias, novas])

  const entradaInvalida = categorias.some((c) => Number.isNaN(parseQtd(novas[c.id])))
  const podeConfirmar = alteracoes.length > 0 && motivo.trim().length > 0 && !entradaInvalida && !submitting

  const handleConfirmar = async () => {
    if (!usuarioId || !podeConfirmar) return
    setSubmitting(true)
    const feitas: string[] = []
    try {
      for (const a of alteracoes) {
        const { error } = await supabase.rpc('ajustar_quantidade_lote_categoria', {
          p_fazenda_id: fazendaId,
          p_lote_id: loteId,
          p_categoria: a.categoria,
          p_nova_quantidade: a.depois,
          p_observacao: motivo.trim(),
          p_usuario_id: usuarioId,
          p_usuario_email: usuarioEmail ?? '',
        })
        if (error) throw new Error(`${a.categoria}: ${error.message}`)
        feitas.push(a.categoria)
      }
      toast.success('Quantidades ajustadas.')
      onAjustado()
      onClose()
    } catch (err: any) {
      console.error('Erro ao ajustar quantidades:', err)
      toast.error(
        feitas.length > 0
          ? `${err.message || 'Erro ao ajustar'} (já ajustadas: ${feitas.join(', ')}).`
          : err.message || 'Erro ao ajustar quantidades.'
      )
      if (feitas.length > 0) onAjustado()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Ajustar quantidades — ${loteNome}`} size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          Use para corrigir lançamentos errados ou faltantes. Cada alteração vira um movimento de <strong>Ajuste</strong> no
          histórico do lote (com o motivo abaixo) e não é desfeita por recálculos.
        </div>

        {loading ? (
          <p className="text-sm text-content-muted">Carregando categorias...</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 text-xs font-medium text-content-muted">
              <span>Categoria</span>
              <span className="text-right">Atual</span>
              <span>Nova</span>
            </div>
            {categorias.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_5rem_6rem] gap-2 items-center">
                <span className="text-sm text-content capitalize">{c.categoria}</span>
                <span className="text-sm text-right text-content-muted">{c.quant_atual}</span>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={novas[c.id] ?? ''}
                  placeholder={String(c.quant_atual)}
                  onChange={(e) => setNovas((p) => ({ ...p, [c.id]: e.target.value }))}
                  aria-label={`Nova quantidade de ${c.categoria}`}
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Motivo do ajuste <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: lançamentos de apartação não feitos"
          />
        </div>

        {alteracoes.length > 0 && (
          <ul className="text-sm space-y-1 rounded-lg bg-surface-2 border border-border-base px-3 py-2">
            {alteracoes.map((a) => (
              <li key={a.categoria} className="capitalize">
                {a.categoria}: {a.antes} → <strong>{a.depois}</strong>{' '}
                <span className={a.depois > a.antes ? 'text-green-600' : 'text-red-600'}>
                  ({a.depois > a.antes ? '+' : ''}
                  {a.depois - a.antes})
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirmar} disabled={!podeConfirmar}>
            {submitting ? 'Ajustando...' : 'Confirmar ajuste'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
