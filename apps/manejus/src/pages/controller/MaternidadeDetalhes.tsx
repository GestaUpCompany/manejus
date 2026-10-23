import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, DetailLayout, DetailSection, DetailField, Modal, formatValue, useToast } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroMaternidade {
  id: string
  fazenda_id: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  peso_cria_kg?: number
  numero_cria?: string
  tratamento?: string
  tipo_parto?: string
  sexo?: string
  raca?: string
  numero_mae?: string
  categoria_mae?: string
  escore_matriz?: string
  id_brinco_mae?: string
  id_chip_mae?: string
  id_brinco_cria?: string
  id_chip_cria?: string
  id_provisorio_cria?: string
  individuo_id_cria?: string
  medicamentos?: Record<string, any>
  sync_status?: string
  created_at: string
  updated_at?: string
}

interface PreviaExclusao {
  pode_excluir: boolean
  motivo_bloqueio: string | null
  cria: { id: string | null; criada_pelo_parto: boolean; motivos_bloqueio: string[] }
  mae: { id: string | null; criada_pelo_parto: boolean; elegivel_exclusao: boolean }
  categoria: {
    nome: string | null
    criada_pelo_parto: boolean
    tem_outros_usos: boolean
    quant_inicial_novo: number | null
  }
  notificacoes: number
}

export function MaternidadeDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [registro, setRegistro] = useState<RegistroMaternidade | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previa, setPrevia] = useState<PreviaExclusao | null>(null)
  const [previaLoading, setPreviaLoading] = useState(false)
  const [excluirMae, setExcluirMae] = useState(false)

  const canDelete = user && (user.papel === 'admin' || user.papel === 'super_admin' || user.papel === 'controller')

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('registros_maternidade')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setRegistro(null)
      } else {
        console.error('Erro ao buscar registro:', error)
        setLoadError(error.message || 'Erro ao buscar registro')
      }
    } else {
      setRegistro(data as RegistroMaternidade)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/maternidade'

  const handleOpenDelete = async () => {
    if (!registro || !user) return
    setPrevia(null)
    setExcluirMae(false)
    setIsDeleteOpen(true)
    setPreviaLoading(true)
    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return
      const { data, error } = await supabase.rpc('previa_exclusao_maternidade', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
      })
      if (error) {
        console.error('Erro na prévia de exclusão:', error)
        toast.error(error.message || 'Erro ao calcular o que será desfeito')
        setIsDeleteOpen(false)
        return
      }
      setPrevia(data as PreviaExclusao)
    } finally {
      setPreviaLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!registro || !user || isSubmitting) return

    setIsSubmitting(true)
    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      const { error } = await supabase.rpc('excluir_registro_maternidade', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_excluir_mae: excluirMae,
      })

      if (error) {
        console.error('Erro ao excluir registro:', error)
        toast.error(error.message || 'Erro ao excluir registro')
        return
      }

      toast.success('Registro excluído e ações do parto desfeitas.')
      navigate(backUrl)
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      toast.error('Erro inesperado ao excluir registro')
    } finally {
      setIsSubmitting(false)
    }
  }

  const actions = canDelete ? (
    <Button variant="danger" onClick={handleOpenDelete} className="text-sm">
      Excluir
    </Button>
  ) : undefined

  return (
    <>
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Maternidade"
      actions={actions}
    >
      {() => (
      <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
        <div className="space-y-6">
          {/* Informações Gerais */}
          <DetailSection title="Informações Gerais">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Data" value={formatDate(registro!.data)} />
              <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
            </div>
          </DetailSection>

          {/* Localização */}
          <DetailSection title="Localização">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Lote" value={formatValue(registro!.lote)} />
              <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
            </div>
          </DetailSection>

          {/* Informações dos Animais */}
          <DetailSection title="Informações dos Animais">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Mãe */}
              <div className="bg-surface-2 p-4 rounded-lg">
                <h4 className="font-medium text-content-strong mb-3">Mãe</h4>
                <div className="space-y-2">
                  <DetailField label="Número" value={formatValue(registro!.numero_mae)} />
                  <DetailField label="ID Brinco" value={formatValue(registro!.id_brinco_mae)} />
                  <DetailField label="ID Chip" value={formatValue(registro!.id_chip_mae)} />
                  <DetailField label="Categoria" value={formatValue(registro!.categoria_mae)} />
                  <DetailField label="Raça" value={formatValue(registro!.raca)} />
                </div>
              </div>

              {/* Cria */}
              <div className="bg-surface-2 p-4 rounded-lg">
                <h4 className="font-medium text-content-strong mb-3">Cria</h4>
                <div className="space-y-2">
                  <DetailField label="Número" value={formatValue(registro!.numero_cria)} />
                  <DetailField label="ID Provisório" value={formatValue(registro!.id_provisorio_cria)} />
                  <DetailField label="ID Brinco" value={formatValue(registro!.id_brinco_cria)} />
                  <DetailField label="ID Chip" value={formatValue(registro!.id_chip_cria)} />
                  <DetailField label="Sexo" value={formatValue(registro!.sexo)} />
                  <DetailField label="Peso (kg)" value={formatValue(registro!.peso_cria_kg)} />
                  {registro!.individuo_id_cria && (
                    <p className="text-sm pt-2 border-t border-border-base mt-2">
                      <span className="font-medium text-content">Indivíduo:</span>{' '}
                      <button
                        onClick={() => navigate(`/controller/individuos/${registro!.individuo_id_cria}`)}
                        className="text-primary dark:text-primary-light hover:underline font-medium"
                      >
                        Ver indivíduo
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </DetailSection>

          {/* Informações do Parto */}
          <DetailSection title="Informações do Parto" highlighted>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Tipo Parto" value={formatValue(registro!.tipo_parto)} />
              <DetailField label="Escore Matriz" value={formatValue(registro!.escore_matriz)} />
            </div>
            <div className="mt-3">
              <DetailField label="Tratamento" value={formatValue(registro!.tratamento)} />
            </div>
          </DetailSection>

          {/* Medicamentos */}
          {Array.isArray(registro!.medicamentos) && (registro!.medicamentos as any[]).length > 0 && (
            <DetailSection title="Medicamentos" highlighted>
              <div className="space-y-3">
                {(registro!.medicamentos as any[]).map((med: any, index: number) => (
                  <div key={index} className="border-b border-border-base pb-2 last:border-0 last:pb-0">
                    <DetailField label="Nome" value={formatValue(med.nomeComercial)} />
                    <DetailField label="Tipo" value={formatValue(med.tipo)} />
                    <DetailField label="Dose Aplicada" value={formatValue(med.doseAplicada)} />
                    {med.doseRecomendada && <DetailField label="Dose Recomendada" value={formatValue(med.doseRecomendada)} />}
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      </Card>
      )}
    </DetailLayout>

    {registro && (
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => !isSubmitting && setIsDeleteOpen(false)}
        title="Excluir Registro de Maternidade"
        size="sm"
      >
        <div className="space-y-3 text-content text-sm">
          <p>
            Tem certeza que deseja excluir o parto de {formatDate(registro.data)}
            {registro.numero_mae || registro.id_brinco_mae ? ` (mãe ${registro.id_brinco_mae || registro.numero_mae})` : ''}?
          </p>
          {previaLoading && <p className="text-content-subtle">Calculando o que será desfeito...</p>}
          {previa && !previa.pode_excluir && (
            <p className="rounded-lg bg-red-50 text-red-700 p-3">
              Exclusão bloqueada: {previa.motivo_bloqueio}.
            </p>
          )}
          {previa && previa.pode_excluir && (
            <>
              <p className="font-medium">Será desfeito:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>O registro de maternidade será marcado como excluído.</li>
                {previa.cria.criada_pelo_parto && <li>A cria cadastrada por este parto será excluída.</li>}
                {previa.notificacoes > 0 && (
                  <li>{previa.notificacoes} notificação(ões) de indivíduo incompleto será(ão) removida(s).</li>
                )}
                {previa.categoria.nome && (
                  <li>
                    {previa.categoria.criada_pelo_parto && previa.categoria.quant_inicial_novo === 0 && !previa.categoria.tem_outros_usos
                      ? `A categoria ${previa.categoria.nome} criada no lote por este parto será desativada.`
                      : previa.categoria.criada_pelo_parto
                        ? `A categoria ${previa.categoria.nome} foi criada por este parto: o saldo inicial dela será ajustado para ${previa.categoria.quant_inicial_novo ?? 0} e a quantidade recalculada.`
                        : `A quantidade de ${previa.categoria.nome} no lote será recalculada.`}
                  </li>
                )}
                {previa.mae.id && <li>O número de partos e a classificação da mãe serão recalculados.</li>}
              </ul>
              {previa.mae.elegivel_exclusao && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={excluirMae}
                    onChange={(e) => setExcluirMae(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>Excluir também a mãe, cadastrada automaticamente por este parto e sem outro uso.</span>
                </label>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
          <button
            onClick={() => setIsDeleteOpen(false)}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-4 py-2 text-content bg-surface-2 rounded-lg transition-all min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmDelete}
            disabled={isSubmitting || previaLoading || !previa || !previa.pode_excluir}
            className="flex-1 sm:flex-none px-4 py-2 text-white bg-red-600 rounded-lg transition-all min-h-[44px] disabled:opacity-50"
          >
            {isSubmitting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </Modal>
    )}
    </>
  )
}
