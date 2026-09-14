import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button, NumericInput, Input, useToast } from '../ui'
import { supabase } from '../../services/supabaseClient'

interface Props {
  isOpen: boolean
  onClose: () => void
  loteCategoriaId: string
  categoriaNome: string
  pesoProjetadoAtual: number | null
  gmd: string | null
  dataAjusteAtual: string | null
  usuarioId: string | undefined
  onCorrigido: () => void
}

export function CorrigirPesoModal({
  isOpen,
  onClose,
  loteCategoriaId,
  categoriaNome,
  pesoProjetadoAtual,
  gmd,
  dataAjusteAtual,
  usuarioId,
  onCorrigido,
}: Props) {
  const toast = useToast()
  const [pesoNovo, setPesoNovo] = useState('')
  const [dataPesagem, setDataPesagem] = useState('')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Resetar campos ao abrir
  useEffect(() => {
    if (isOpen) {
      setPesoNovo('')
      setMotivo('')
      const today = new Date().toISOString().split('T')[0]
      setDataPesagem(today)
    }
  }, [isOpen])

  const pesoNovoNum = pesoNovo ? parseFloat(pesoNovo.replace(',', '.')) : null
  const pesoProjNum = pesoProjetadoAtual ?? null
  const diff = pesoNovoNum != null && pesoProjNum != null ? pesoNovoNum - pesoProjNum : null
  const diffPct = diff != null && pesoProjNum != null && pesoProjNum > 0 ? (diff / pesoProjNum) * 100 : null

  const podeConfirmar = !!pesoNovoNum && pesoNovoNum > 0 && !!dataPesagem && !submitting

  const handleConfirmar = async () => {
    if (!pesoNovoNum || !dataPesagem) return
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('corrigir_peso_categoria', {
        p_lote_categoria_id: loteCategoriaId,
        p_peso_novo_kg_cab: pesoNovoNum,
        p_data_pesagem: dataPesagem,
        p_motivo: motivo.trim() || null,
        p_usuario_id: usuarioId || null,
      })
      if (error) throw error
      toast.success('Peso corrigido com sucesso.')
      onCorrigido()
      onClose()
    } catch (err: any) {
      console.error('Erro ao corrigir peso:', err)
      toast.error(err.message || 'Erro ao corrigir peso.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Corrigir peso — ${categoriaNome}`} size="md">
      <div className="space-y-4">
        {/* Peso projetado atual (read-only) */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
          <div className="text-xs text-gray-500 mb-0.5">Peso projetado atual</div>
          <div className="text-lg font-semibold text-gray-800">
            {pesoProjNum != null
              ? `${pesoProjNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/cab`
              : '—'}
          </div>
          {dataAjusteAtual && (
            <div className="text-xs text-gray-500 mt-0.5">
              Projetado desde {new Date(dataAjusteAtual + 'T00:00:00').toLocaleDateString('pt-BR')}
              {gmd ? ` · GMD ${gmd} kg/dia` : ''}
            </div>
          )}
        </div>

        {/* Peso real medido (obrigatório) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Peso real medido (kg/cab) <span className="text-red-500">*</span>
          </label>
          <NumericInput
            value={pesoNovo}
            onChange={setPesoNovo}
            placeholder="0,00"
            decimalPlaces={2}
            autoFocus
          />
          {diff != null && (
            <p className={`text-xs mt-1 ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              Diferença: {diff > 0 ? '+' : ''}{diff.toFixed(2).replace('.', ',')} kg
              {diffPct != null ? ` (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1).replace('.', ',')}%)` : ''}
            </p>
          )}
        </div>

        {/* Data da pesagem (obrigatória) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Data da pesagem <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={dataPesagem}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setDataPesagem(e.target.value)}
          />
        </div>

        {/* Motivo (opcional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motivo <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pesagem real na balança, ajuste de estimativa..."
          />
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          A partir da data da pesagem, a projeção automática de peso passará a usar o valor informado como referência.
          O histórico de consumo (registros de suplementação) será recalculado automaticamente.
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirmar}
            disabled={!podeConfirmar}
          >
            {submitting ? 'Confirmando...' : 'Confirmar correção'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
