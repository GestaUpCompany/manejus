import { useEffect, useState } from 'react'
import { Modal, Button, NumericInput, useToast } from '@gestaup/ui'
import { supabase } from '@gestaup/supabase'
import { EQUIDEOS, ESPECIES_EQUIDEOS, montarDivisaoTropa, validarDivisaoTropa } from '../../utils/equideos'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  loteCategoriaId: string
  /** Saldo atual da tropa (quant_base ou quant_inicial) a dividir entre as categorias. */
  saldo: number
  onConvertido: () => void
}

export function DetalharTropaModal({ isOpen, onClose, fazendaId, loteCategoriaId, saldo, onConvertido }: Props) {
  const toast = useToast()
  const [divisao, setDivisao] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) setDivisao({})
  }, [isOpen])

  const { soma, faltam, valida } = validarDivisaoTropa(divisao, saldo)

  const handleConfirmar = async () => {
    if (!valida) return
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('detalhar_tropa', {
        p_fazenda_id: fazendaId,
        p_lote_categoria_id: loteCategoriaId,
        p_divisao: montarDivisaoTropa(divisao),
      })
      if (error) throw error
      toast.success('Tropa dividida por espécie e sexo.')
      onConvertido()
      onClose()
    } catch (err: any) {
      console.error('Erro ao detalhar tropa:', err)
      toast.error(err.message || 'Erro ao dividir a tropa.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dividir tropa por espécie e sexo" size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 border border-border-base px-3 py-2">
          <div className="text-xs text-content-muted mb-0.5">Animais na tropa</div>
          <div className="text-lg font-semibold text-content-strong">{saldo} cab</div>
        </div>

        <p className="text-sm text-content">
          Informe quantos animais há de cada espécie e sexo. A soma precisa ser igual ao total da tropa.
        </p>

        <div className="space-y-3">
          {ESPECIES_EQUIDEOS.map((especie) => (
            <div key={especie}>
              <div className="text-sm font-semibold text-content-strong mb-1">{especie}</div>
              <div className="grid grid-cols-2 gap-2">
                {EQUIDEOS.filter((e) => e.especie === especie).map((e) => (
                  <div key={e.slug}>
                    <label className="block text-xs font-medium text-content mb-1">{e.rotulo}</label>
                    <NumericInput
                      value={divisao[e.slug] ?? ''}
                      onChange={(value) => setDivisao((prev) => ({ ...prev, [e.slug]: value }))}
                      placeholder="0"
                      decimalPlaces={0}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className={`text-sm font-medium ${
            valida ? 'text-green-600' : faltam < 0 ? 'text-red-600' : 'text-content-muted'
          }`}
        >
          {valida
            ? `Soma conferida: ${soma} de ${saldo} cab.`
            : faltam < 0
              ? `Passou ${-faltam} cab do total (${soma} de ${saldo}).`
              : `Faltam ${faltam} cab para distribuir (${soma} de ${saldo}).`}
        </div>

        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
          A tropa atual será encerrada e cada espécie e sexo passa a ser uma categoria própria, com mortes, saídas e
          transferências separadas. Depois de dividir, não é possível desfazer pela tela.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirmar} disabled={!valida || submitting}>
            {submitting ? 'Dividindo...' : 'Dividir tropa'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
