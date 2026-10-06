import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, DetailLayout, DetailSection, DetailField, formatValue, Input, Modal, ConfirmModal, Select, useToast } from '@gestaup/ui'
import { formatDate, toFarmDateOnly, FARM_TIMEZONE } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface MedicaoClima {
  pluviometro_id?: string | null
  pluviometro_nome?: string | null
  pluviometro_localizacao?: string | null
  medicao?: number | null
  temperatura?: number | null
  horario?: string | null
}

interface RegistroClima {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  responsavel: string
  temperatura_media?: number
  tempo_atual?: string
  umidade_relativa?: number
  esvaziou_pluviometros?: boolean | null
  choveu?: boolean | null
  observacao?: string
  medicoes?: MedicaoClima[]
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

interface MedicaoEdit {
  pluviometro_id: string
  pluviometro_nome: string
  pluviometro_localizacao: string
  medicao: string
  temperatura: string
  horario: string
}

interface EditForm {
  data: string
  hora: string
  responsavel: string
  tempo_atual: string
  temperatura_media: string
  umidade_relativa: string
  esvaziou_pluviometros: string
  choveu: string
  observacao: string
  medicoes: MedicaoEdit[]
}

interface Pluviometro {
  id: string
  nome: string
  localizacao: string | null
}

// Valores de tempo_atual gravados pela tela nova do PWA
const TEMPO_ATUAL_LABELS: Record<string, string> = {
  sol: 'Sol',
  nublado: 'Nublado',
  chuva_fraca: 'Chuva fraca',
  chuva_forte: 'Chuva forte',
  temporal: 'Temporal',
  vento_forte: 'Vento forte',
  frio: 'Frio',
  seco_poeira: 'Seco / poeira',
}

const TEMPO_ATUAL_OPCOES = [
  { value: '', label: '-' },
  ...Object.entries(TEMPO_ATUAL_LABELS).map(([value, label]) => ({ value, label })),
]

const SIM_NAO_OPCOES = [
  { value: '', label: '-' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
]

function boolSimNao(valor?: boolean | null): string {
  if (valor === null || valor === undefined) return '-'
  return valor ? 'Sim' : 'Não'
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

export function RegistrosClimaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [registro, setRegistro] = useState<RegistroClima | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [pluviometros, setPluviometros] = useState<Pluviometro[]>([])
  const [fazendaId, setFazendaId] = useState<string | null>(null)

  const canManage = user && (user.papel === 'admin' || user.papel === 'super_admin' || user.papel === 'controller')

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    setFazendaId(_fazendaId)

    const { data, error } = await supabase
      .from('registros_clima')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', _fazendaId)
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
      setRegistro(data as RegistroClima)
    }

    setLoading(false)
  }

  const loadPluviometros = async () => {
    if (!fazendaId) return
    const { data } = await supabase
      .from('pluviometros')
      .select('id, nome, localizacao')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome')
    if (data) setPluviometros(data as Pluviometro[])
  }

  const handleStartEdit = async () => {
    if (!registro) return
    await loadPluviometros()
    setEditForm({
      data: toFarmDateOnly(registro.data) || '',
      hora: toFarmTimeOnly(registro.data),
      responsavel: registro.responsavel || '',
      tempo_atual: registro.tempo_atual || '',
      temperatura_media: registro.temperatura_media?.toString() || '',
      umidade_relativa: registro.umidade_relativa?.toString() || '',
      esvaziou_pluviometros: registro.esvaziou_pluviometros === null || registro.esvaziou_pluviometros === undefined ? '' : registro.esvaziou_pluviometros ? 'sim' : 'nao',
      choveu: registro.choveu === null || registro.choveu === undefined ? '' : registro.choveu ? 'sim' : 'nao',
      observacao: registro.observacao || '',
      medicoes: (registro.medicoes || []).map(m => ({
        pluviometro_id: m.pluviometro_id || '',
        pluviometro_nome: m.pluviometro_nome || '',
        pluviometro_localizacao: m.pluviometro_localizacao || '',
        medicao: m.medicao != null ? String(m.medicao) : '',
        temperatura: m.temperatura != null ? String(m.temperatura) : '',
        horario: m.horario || '',
      })),
    })
    setErrorMsg(null)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm || !registro || !user || isSubmitting) return
    if (!editForm.data) {
      setErrorMsg('Data é obrigatória.')
      return
    }
    if (!editForm.responsavel.trim()) {
      setErrorMsg('Responsável é obrigatório.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      // temperatura_media é derivada das temperaturas das medições (mesma regra
      // do PWA); se nenhuma medição tem temperatura, usa o valor manual.
      const temps = editForm.medicoes
        .map(m => m.temperatura)
        .filter(t => t !== '')
        .map(Number)
        .filter(t => !isNaN(t))
      const tempMedia = temps.length > 0
        ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1))
        : (editForm.temperatura_media !== '' ? parseFloat(editForm.temperatura_media) : null)

      const campos: Record<string, unknown> = {
        data: farmDateTimeToIso(editForm.data, editForm.hora),
        responsavel: editForm.responsavel.trim(),
        tempo_atual: editForm.tempo_atual || null,
        temperatura_media: tempMedia,
        umidade_relativa: editForm.umidade_relativa !== '' ? parseFloat(editForm.umidade_relativa) : null,
        esvaziou_pluviometros: editForm.esvaziou_pluviometros === '' ? null : editForm.esvaziou_pluviometros === 'sim',
        choveu: editForm.choveu === '' ? null : editForm.choveu === 'sim',
        observacao: editForm.observacao || null,
        medicoes: editForm.medicoes.map(m => ({
          pluviometro_id: m.pluviometro_id || null,
          pluviometro_nome: m.pluviometro_nome || null,
          pluviometro_localizacao: m.pluviometro_localizacao || null,
          medicao: m.medicao !== '' ? Number(m.medicao) : null,
          temperatura: m.temperatura !== '' ? Number(m.temperatura) : null,
          horario: m.horario || null,
        })),
      }

      const { data, error } = await supabase.rpc('editar_registro_clima', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_campos: campos,
      })

      if (error) {
        setErrorMsg(error.message || 'Erro ao salvar edição')
        return
      }

      if (data) {
        setRegistro(data as RegistroClima)
      }
      setIsEditing(false)
      toast.success('Registro editado com sucesso.')
    } catch (err) {
      console.error('Erro ao editar registro:', err)
      setErrorMsg('Erro inesperado ao salvar edição')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!registro || !user || isSubmitting) return

    setIsSubmitting(true)
    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      const { error } = await supabase.rpc('excluir_registro_clima', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
      })

      if (error) {
        console.error('Erro ao excluir registro:', error)
        toast.error(error.message || 'Erro ao excluir registro')
        return
      }

      toast.success('Registro excluído com sucesso.')
      navigate('/controller/cadernetas/clima')
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      toast.error('Erro inesperado ao excluir registro')
    } finally {
      setIsSubmitting(false)
    }
  }

  const backUrl = '/controller/cadernetas/clima'

  const actions = (
    <>
      {canManage && (
        <Button variant="primary" onClick={handleStartEdit} className="text-sm">
          Editar
        </Button>
      )}
      {canManage && (
        <Button
          variant="danger"
          onClick={() => setIsDeleteConfirmOpen(true)}
          className="text-sm"
        >
          Excluir
        </Button>
      )}
    </>
  )

  const tempsPreenchidas = editForm
    ? editForm.medicoes.map(m => m.temperatura).filter(t => t !== '').map(Number).filter(t => !isNaN(t))
    : []
  const tempMediaCalculada = tempsPreenchidas.length > 0
    ? (tempsPreenchidas.reduce((a, b) => a + b, 0) / tempsPreenchidas.length).toFixed(1)
    : null

  const pluviometrosParaAdicionar = pluviometros.filter(
    p => !(editForm?.medicoes || []).some(m => m.pluviometro_id === p.id)
  )

  const updateMedicao = (index: number, campo: keyof MedicaoEdit, valor: string) => {
    if (!editForm) return
    setEditForm({
      ...editForm,
      medicoes: editForm.medicoes.map((m, i) => i === index ? { ...m, [campo]: valor } : m),
    })
  }

  return (
    <>
      <DetailLayout
        loading={loading}
        loadError={loadError}
        notFound={!registro}
        onBack={() => navigate(backUrl)}
        onRetry={loadRegistro}
        title="Detalhes do Registro de Clima"
        actions={actions}
      >
        {() => (
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="space-y-6">
              {/* Informações Gerais */}
              <DetailSection title="Informações Gerais">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailField label="Data" value={formatDate(registro!.data)} />
                  <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                  <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                  <DetailField label="Temperatura Média" value={registro!.temperatura_media ? `${registro!.temperatura_media}°C` : '-'} />
                  <DetailField label="Tempo Atual" value={registro!.tempo_atual ? (TEMPO_ATUAL_LABELS[registro!.tempo_atual] ?? registro!.tempo_atual) : '-'} />
                  <DetailField label="Umidade Relativa" value={registro!.umidade_relativa != null ? `${registro!.umidade_relativa}%` : '-'} />
                  <DetailField label="Esvaziou Pluviômetros" value={boolSimNao(registro!.esvaziou_pluviometros)} />
                  {registro!.choveu !== null && registro!.choveu !== undefined && (
                    <DetailField label="Choveu desde Última Leitura" value={boolSimNao(registro!.choveu)} />
                  )}
                </div>
              </DetailSection>

              {/* Medições */}
              {registro!.medicoes && registro!.medicoes.length > 0 && (
                <DetailSection title="Medições">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-base">
                      <thead className="bg-surface-2">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Pluviômetro</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Localização</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Medição (mm)</th>
                          {registro!.medicoes.some((m) => m.temperatura !== null && m.temperatura !== undefined) && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Temperatura (°C)</th>
                          )}
                          {registro!.medicoes.some((m) => m.horario) && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Horário</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-surface-1 divide-y divide-border-base">
                        {registro!.medicoes.map((medicao, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                              {formatValue(medicao.pluviometro_nome)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                              {formatValue(medicao.pluviometro_localizacao)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                              {medicao.medicao !== undefined && medicao.medicao !== null ? `${medicao.medicao} mm` : '-'}
                            </td>
                            {registro!.medicoes!.some((m) => m.temperatura !== null && m.temperatura !== undefined) && (
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                                {medicao.temperatura !== null && medicao.temperatura !== undefined ? `${medicao.temperatura}°C` : '-'}
                              </td>
                            )}
                            {registro!.medicoes!.some((m) => m.horario) && (
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                                {medicao.horario || '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DetailSection>
              )}

              {/* Observação */}
              {registro!.observacao && (
                <DetailSection title="Observação" highlighted>
                  <p className="text-sm">{registro!.observacao}</p>
                </DetailSection>
              )}
            </div>
          </Card>
        )}
      </DetailLayout>

      {/* Modal de Edição */}
      {isEditing && editForm && (
        <Modal
          isOpen={isEditing}
          onClose={() => !isSubmitting && setIsEditing(false)}
          title="Editar Registro de Clima"
          size="lg"
        >
          <div className="space-y-4">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1">Data</label>
                <Input
                  type="date"
                  value={editForm.data}
                  onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Horário</label>
                <Input
                  type="time"
                  value={editForm.hora}
                  onChange={(e) => setEditForm({ ...editForm, hora: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Responsável</label>
                <Input
                  type="text"
                  value={editForm.responsavel}
                  onChange={(e) => setEditForm({ ...editForm, responsavel: e.target.value })}
                />
              </div>
              <Select
                label="Tempo Atual"
                options={TEMPO_ATUAL_OPCOES}
                value={editForm.tempo_atual}
                onChange={(v) => setEditForm({ ...editForm, tempo_atual: v })}
                placeholder="-"
              />
              <Select
                label="Esvaziou Pluviômetros"
                options={SIM_NAO_OPCOES}
                value={editForm.esvaziou_pluviometros}
                onChange={(v) => setEditForm({ ...editForm, esvaziou_pluviometros: v })}
                placeholder="-"
              />
              <Select
                label="Choveu desde Última Leitura"
                options={SIM_NAO_OPCOES}
                value={editForm.choveu}
                onChange={(v) => setEditForm({ ...editForm, choveu: v })}
                placeholder="-"
              />
              <div>
                <label className="block text-sm font-medium text-content mb-1">Umidade Relativa (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.umidade_relativa}
                  onChange={(e) => setEditForm({ ...editForm, umidade_relativa: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Temperatura Média (°C)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={tempMediaCalculada ?? editForm.temperatura_media}
                  onChange={(e) => setEditForm({ ...editForm, temperatura_media: e.target.value })}
                  disabled={tempMediaCalculada !== null}
                />
                {tempMediaCalculada !== null && (
                  <p className="text-xs text-content-muted mt-1">Calculada automaticamente das temperaturas das medições.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-content mb-1">Observação</label>
                <Input
                  type="text"
                  value={editForm.observacao}
                  onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })}
                />
              </div>
            </div>

            {/* Medições */}
            <div className="border-t border-border-base pt-4">
              <p className="text-sm font-medium text-content mb-3">Medições por Pluviômetro</p>
              {editForm.medicoes.length === 0 ? (
                <p className="text-sm text-content-muted">Nenhuma medição neste registro.</p>
              ) : (
                <div className="space-y-4">
                  {editForm.medicoes.map((medicao, index) => (
                    <div key={index} className="p-3 rounded-lg border border-border-base bg-surface-2/50">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content-strong leading-tight">
                            {medicao.pluviometro_nome || 'Pluviômetro'}
                          </p>
                          {medicao.pluviometro_localizacao && (
                            <p className="text-xs text-content-muted mt-0.5">{medicao.pluviometro_localizacao}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditForm({
                            ...editForm,
                            medicoes: editForm.medicoes.filter((_, i) => i !== index),
                          })}
                          className="w-8 h-8 rounded-full text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors text-lg leading-none flex items-center justify-center flex-shrink-0"
                          aria-label="Remover medição"
                        >
                          ×
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-content-muted mb-1">Medição (mm)</label>
                          <Input
                            type="number"
                            step="0.1"
                            value={medicao.medicao}
                            onChange={(e) => updateMedicao(index, 'medicao', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-content-muted mb-1">Horário</label>
                          <Input
                            type="time"
                            value={medicao.horario}
                            onChange={(e) => updateMedicao(index, 'horario', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-content-muted mb-1">Temperatura (°C)</label>
                          <Input
                            type="number"
                            step="0.1"
                            value={medicao.temperatura}
                            onChange={(e) => updateMedicao(index, 'temperatura', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pluviometrosParaAdicionar.length > 0 && (
                <div className="mt-3">
                  <Select
                    options={pluviometrosParaAdicionar.map(p => ({
                      value: p.id,
                      label: p.localizacao ? `${p.nome} (${p.localizacao})` : p.nome,
                    }))}
                    value=""
                    onChange={(pluviometroId) => {
                      const p = pluviometros.find(x => x.id === pluviometroId)
                      if (!p || !editForm) return
                      setEditForm({
                        ...editForm,
                        medicoes: [...editForm.medicoes, {
                          pluviometro_id: p.id,
                          pluviometro_nome: p.nome,
                          pluviometro_localizacao: p.localizacao || '',
                          medicao: '',
                          temperatura: '',
                          horario: '',
                        }],
                      })
                    }}
                    placeholder="+ Adicionar pluviômetro..."
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Modal de Exclusão */}
      {registro && (
        <ConfirmModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => !isSubmitting && setIsDeleteConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Excluir Registro de Clima"
          message={`Tem certeza que deseja excluir o registro de ${formatDate(registro.data)}?\n\nResponsável: ${registro.responsavel || '-'}\nMedições: ${registro.medicoes?.length || 0}\n\nO registro será marcado como excluído e ficará registrado na auditoria.`}
          confirmText={isSubmitting ? 'Excluindo...' : 'Excluir'}
          cancelText="Cancelar"
          variant="danger"
        />
      )}
    </>
  )
}
