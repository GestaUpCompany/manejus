import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, DetailLayout, DetailSection, DetailField, formatValue, Input, Select, Modal, ConfirmModal, useToast } from '@gestaup/ui'
import { formatDateTime, formatDate, toFarmDateOnly, FARM_TIMEZONE } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'
import { LEITURA_COCHO_DESCRICOES } from './RegistrosLeituraCocho'

function formatKg(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** Converte data + hora de parede no fuso da fazenda para ISO UTC. */
function farmDateTimeToIso(dateStr: string, timeStr: string): string {
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: FARM_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dateStr}T${timeStr || '00:00'}:00Z`))
  const offset = (offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '')
  return new Date(`${dateStr}T${timeStr || '00:00'}:00${offset}`).toISOString()
}

/** Extrai hora (HH:mm) de um timestamptz no fuso da fazenda. */
function toFarmTimeOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return '00:00'
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FARM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateStr))
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00'
  return `${get('hour')}:${get('minute')}`
}

const NOTAS_OPCOES = [
  { value: '', label: 'Sem nota' },
  ...[-1, 0, 1, 2, 3].map(n => ({ value: String(n), label: `${n} - ${LEITURA_COCHO_DESCRICOES[n]}` })),
]

interface Opcao {
  id: string
  nome: string
}

interface EditTratoForm {
  data: string
  hora: string
  curral_id: string
  lote_id: string
  ordem_trato: string
  kg_planejado: string
  kg_ofertado_real: string
  leitura_cocho_nota: string
}

interface RegistroTrato {
  id: string
  fazenda_id: string
  data: string
  curral_id?: string | null
  lote_id?: string | null
  ordem_trato: number
  kg_planejado?: number | null
  kg_ofertado_real?: number | null
  leitura_cocho_nota?: number | null
  origem: string
  curral?: { nome: string } | null
  lote?: { nome: string } | null
  nome_usuario?: string | null
}

export function TratoConfinamentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [lotes, setLotes] = useState<Opcao[]>([])
  const [currais, setCurrais] = useState<Opcao[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditTratoForm | null>(null)
  const [registro, setRegistro] = useState<RegistroTrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return
    setFazendaId(fazendaId)

    const { data, error } = await supabase
      .from('registros_oferta_trato')
      .select('*, curral:currais(nome), lote:lotes(nome)')
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
      setRegistro(data as RegistroTrato)
    }

    setLoading(false)
  }

  const canManage = !!user && (user.papel === 'admin' || user.papel === 'super_admin' || user.papel === 'controller')

  const handleStartEdit = async () => {
    if (!registro || !fazendaId) return
    setEditForm({
      data: toFarmDateOnly(registro.data) || '',
      hora: toFarmTimeOnly(registro.data),
      curral_id: registro.curral_id || '',
      lote_id: registro.lote_id || '',
      ordem_trato: String(registro.ordem_trato),
      kg_planejado: registro.kg_planejado != null ? String(Math.round(Number(registro.kg_planejado) * 100) / 100) : '',
      kg_ofertado_real: registro.kg_ofertado_real != null ? String(Math.round(Number(registro.kg_ofertado_real) * 100) / 100) : '',
      leitura_cocho_nota: registro.leitura_cocho_nota != null ? String(registro.leitura_cocho_nota) : '',
    })
    setFormError(null)
    setIsEditing(true)

    const [lotesRes, curraisRes] = await Promise.all([
      supabase.from('lotes').select('id, nome').eq('fazenda_id', fazendaId).eq('ativo', true).order('nome'),
      supabase.from('currais').select('id, nome').eq('fazenda_id', fazendaId).eq('ativo', true).order('nome'),
    ])
    setLotes((lotesRes.data || []) as Opcao[])
    setCurrais((curraisRes.data || []) as Opcao[])
  }

  const handleSaveEdit = async () => {
    if (!registro || !editForm || !user || !fazendaId || isSubmitting) return
    if (!editForm.data || !editForm.curral_id) {
      setFormError('Data e curral são obrigatórios.')
      return
    }
    setIsSubmitting(true)
    setFormError(null)
    try {
      const campos: Record<string, unknown> = {
        data: farmDateTimeToIso(editForm.data, editForm.hora),
        curral_id: editForm.curral_id,
        lote_id: editForm.lote_id || null,
        ordem_trato: parseInt(editForm.ordem_trato, 10) || 1,
        kg_planejado: editForm.kg_planejado ? parseFloat(editForm.kg_planejado) : null,
        kg_ofertado_real: editForm.kg_ofertado_real ? parseFloat(editForm.kg_ofertado_real) : null,
        leitura_cocho_nota: editForm.leitura_cocho_nota !== '' ? parseInt(editForm.leitura_cocho_nota, 10) : null,
      }
      const { error } = await supabase.rpc('editar_registro_oferta_trato', {
        p_id: registro.id,
        p_fazenda_id: fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_campos: campos,
      })
      if (error) {
        setFormError(error.code === '23505'
          ? 'Já existe um trato para este curral nesta data e ordem.'
          : error.message || 'Erro ao salvar edição')
        return
      }
      toast.success('Trato atualizado com sucesso.')
      setIsEditing(false)
      await loadRegistro()
    } catch (err) {
      console.error('Erro ao editar trato:', err)
      setFormError('Erro inesperado ao salvar edição')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!registro || !user || !fazendaId || isSubmitting) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('excluir_registro_oferta_trato', {
        p_id: registro.id,
        p_fazenda_id: fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
      })
      if (error) {
        console.error('Erro ao excluir trato:', error)
        toast.error(error.message || 'Erro ao excluir trato')
        return
      }
      toast.success('Trato excluído com sucesso.')
      navigate('/controller/cadernetas/trato-confinamento')
    } catch (err) {
      console.error('Erro ao excluir trato:', err)
      toast.error('Erro inesperado ao excluir trato')
    } finally {
      setIsSubmitting(false)
    }
  }

  const actions = canManage ? (
    <>
      <Button variant="primary" onClick={handleStartEdit} className="text-sm">
        Editar
      </Button>
      <Button variant="danger" onClick={() => setIsDeleteConfirmOpen(true)} className="text-sm">
        Excluir
      </Button>
    </>
  ) : undefined

  const notaCocho = registro?.leitura_cocho_nota
  const notaDescricao = notaCocho != null ? LEITURA_COCHO_DESCRICOES[notaCocho] : null

  return (
    <>
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/trato-confinamento')}
      onRetry={loadRegistro}
      title="Detalhes do Trato"
      actions={actions}
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Ordem do Trato" value={`${registro!.ordem_trato}º`} />
                <DetailField label="Origem" value={formatValue(registro!.origem)} />
              </div>
            </DetailSection>

            <DetailSection title="Local" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Curral" value={formatValue(registro!.curral?.nome)} />
                <DetailField label="Lote" value={formatValue(registro!.lote?.nome)} />
              </div>
            </DetailSection>

            <DetailSection title="Oferta" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Planejado (kg)" value={formatKg(registro!.kg_planejado)} />
                <DetailField label="Ofertado Real (kg)" value={formatKg(registro!.kg_ofertado_real)} />
                <DetailField
                  label="Nota do Cocho"
                  value={notaCocho != null ? `${notaCocho}${notaDescricao ? ` — ${notaDescricao}` : ''}` : '-'}
                />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>

    <Modal isOpen={isEditing} onClose={() => !isSubmitting && setIsEditing(false)} title="Editar trato" size="md">
      {editForm && (
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" value={editForm.data} onChange={e => setEditForm({ ...editForm, data: e.target.value })} />
            <Input label="Hora" type="time" value={editForm.hora} onChange={e => setEditForm({ ...editForm, hora: e.target.value })} />
          </div>
          <Select
            label="Curral"
            options={currais.map(c => ({ value: c.id, label: c.nome }))}
            value={editForm.curral_id}
            onChange={v => setEditForm({ ...editForm, curral_id: v })}
          />
          <Select
            label="Lote"
            options={[{ value: '', label: 'Sem lote' }, ...lotes.map(l => ({ value: l.id, label: l.nome }))]}
            value={editForm.lote_id}
            onChange={v => setEditForm({ ...editForm, lote_id: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ordem do trato" type="number" min={1} value={editForm.ordem_trato} onChange={e => setEditForm({ ...editForm, ordem_trato: e.target.value })} />
            <Select label="Leitura de cocho" options={NOTAS_OPCOES} value={editForm.leitura_cocho_nota} onChange={v => setEditForm({ ...editForm, leitura_cocho_nota: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Kg planejado" type="number" step="0.1" min={0} value={editForm.kg_planejado} onChange={e => setEditForm({ ...editForm, kg_planejado: e.target.value })} />
            <Input label="Kg ofertado (real)" type="number" step="0.1" min={0} value={editForm.kg_ofertado_real} onChange={e => setEditForm({ ...editForm, kg_ofertado_real: e.target.value })} />
          </div>
          <p className="text-xs text-content-muted">O consumo e o custo do confinamento são recalculados automaticamente.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>

    {registro && (
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => !isSubmitting && setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir trato"
        message={`Confirma a exclusão do trato ${registro.ordem_trato}º de ${registro.curral?.nome || 'curral'} em ${formatDate(registro.data)}?\n\nO registro será marcado como excluído e sairá dos relatórios. O consumo do confinamento será recalculado. A operação fica registrada na auditoria.`}
        confirmText={isSubmitting ? 'Excluindo...' : 'Excluir'}
        cancelText="Cancelar"
        variant="danger"
      />
    )}
    </>
  )
}
