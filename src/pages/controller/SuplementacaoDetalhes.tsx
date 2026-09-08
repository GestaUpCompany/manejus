import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, DetailLayout, DetailSection, DetailField, formatValue, Input, Modal, ConfirmModal, useToast } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { useLotes } from '../../hooks/useFazendaQueries'

interface RegistroSuplementacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  tratador?: string
  pasto?: string
  pasto_id?: string
  lote?: string
  lote_id?: string
  formulacao?: string
  categorias?: string
  leitura?: string
  kg_cocho?: number
  kg_deposito?: number
  n_cabecas?: number
  qtd_bezerros?: number
  peso_vivo_kg?: number
  consumo_medio_geral_kg_mn?: number
  consumo_medio_geral_kg_ms?: number
  consumo_medio_geral_percent_pv?: number
  custo_medio_reais_cab_dia?: number
  escore_fezes?: string
  checklist?: {
    limpeza_cocho?: { valor: boolean; observacao: string }
    cochos_condicoes?: { valor: boolean; observacao: string }
    deposito_condicoes?: { valor: boolean; observacao: string }
    aterro_acesso_ideal?: { valor: boolean; observacao: string }
  }
  sync_status?: string
  created_at: string
  updated_at?: string
}

interface EditForm {
  data: string
  tratador: string
  lote_id: string
  lote_nome: string
  formulacao: string
  kg_cocho: string
  kg_deposito: string
  leitura: string
  escore_fezes: string
}

function capitalizeWords(str: string): string {
  return str.split(', ').map(word => {
    return word.split(' ').map(subword => {
      return subword.charAt(0).toUpperCase() + subword.slice(1).toLowerCase()
    }).join(' ')
  }).join(', ')
}

function boolSimNao(valor?: boolean): string {
  if (valor === undefined || valor === null) return '-'
  return valor ? 'Sim' : 'Não'
}

export function SuplementacaoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [registro, setRegistro] = useState<RegistroSuplementacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [formulacoes, setFormulacoes] = useState<{ nome: string }[]>([])
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [leituraDropdownOpen, setLeituraDropdownOpen] = useState(false)
  const [escoreDropdownOpen, setEscoreDropdownOpen] = useState(false)
  const leituraDropdownRef = useRef<HTMLDivElement>(null)
  const escoreDropdownRef = useRef<HTMLDivElement>(null)

  const { data: lotesData = [] } = useLotes(fazendaId || undefined)
  const lotes = lotesData.filter(l => l.ativo)

  const canDelete = user && (user.papel === 'admin' || user.papel === 'super_admin' || user.papel === 'controller')

  const FAZENDAS_HABILITADAS = [
    'f8be22c5-12e9-4bda-a813-fae8cb3d47ec', // Guanabara
    'f5d64d63-838e-42cc-9fe3-60f3ea7bb692', // Brilhante
    'd54abd92-5783-407a-8adb-15c31388ebc4' // Doce Ilusão
  ]
  const featureHabilitada = fazendaId ? FAZENDAS_HABILITADAS.includes(fazendaId) : false

  const handleEditFormulacao = async () => {
    if (!registro?.formulacao || !user) return

    const _fazendaId = await getFazendaIdForUser(user.id)

    if (!_fazendaId) return

    const { data: formulacao } = await supabase
      .from('formulacoes')
      .select('id')
      .eq('nome', registro.formulacao)
      .eq('fazenda_id', _fazendaId)
      .single()

    if (formulacao) {
      navigate(`/controller/formulacoes?edit=${formulacao.id}`)
    }
  }

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (leituraDropdownRef.current && !leituraDropdownRef.current.contains(e.target as Node)) {
        setLeituraDropdownOpen(false)
      }
      if (escoreDropdownRef.current && !escoreDropdownRef.current.contains(e.target as Node)) {
        setEscoreDropdownOpen(false)
      }
    }
    if (leituraDropdownOpen || escoreDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [leituraDropdownOpen])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)

    if (!_fazendaId) return

    setFazendaId(_fazendaId)

    const { data, error } = await supabase
      .from('registros_suplementacao')
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
      setRegistro(data as RegistroSuplementacao)
    }

    setLoading(false)
  }

  const loadOptions = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    if (!_fazendaId) return

    const { data: formulacoesData } = await supabase
      .from('formulacoes')
      .select('nome')
      .eq('fazenda_id', _fazendaId)
      .eq('ativo', true)
      .order('nome')

    if (formulacoesData) setFormulacoes(formulacoesData)
  }

  const handleStartEdit = async () => {
    if (!registro) return
    await loadOptions()
    const dataDate = registro.data ? new Date(registro.data).toISOString().split('T')[0] : ''
    setEditForm({
      data: dataDate,
      tratador: registro.tratador || '',
      lote_id: registro.lote_id || '',
      lote_nome: registro.lote || '',
      formulacao: registro.formulacao || '',
      kg_cocho: registro.kg_cocho?.toString() || '',
      kg_deposito: registro.kg_deposito?.toString() || '',
      leitura: registro.leitura || '',
      escore_fezes: registro.escore_fezes || '',
    })
    setErrorMsg(null)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm || !registro || !user || isSubmitting) return

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      const loteSelecionado = lotes.find(l => l.id === editForm.lote_id)

      const campos: Record<string, unknown> = {
        data: editForm.data ? new Date(editForm.data + 'T08:00:00').toISOString() : null,
        tratador: editForm.tratador || null,
        lote_id: editForm.lote_id || null,
        lote: loteSelecionado?.nome || null,
        formulacao: editForm.formulacao || null,
        kg_cocho: editForm.kg_cocho ? parseFloat(editForm.kg_cocho) : null,
        kg_deposito: editForm.kg_deposito ? parseFloat(editForm.kg_deposito) : 0,
        leitura: editForm.leitura || null,
        escore_fezes: editForm.escore_fezes || null,
      }

      const { data, error } = await supabase.rpc('editar_registro_suplementacao', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_campos: campos,
      })

      if (error) {
        if (error.code === '23505') {
          setErrorMsg('Já existe um registro ativo para este lote, formulação e data. Edite a data ou exclua o registro duplicado primeiro.')
        } else {
          setErrorMsg(error.message || 'Erro ao salvar edição')
        }
        return
      }

      if (data) {
        setRegistro(data as RegistroSuplementacao)
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

      const { error } = await supabase.rpc('excluir_registro_suplementacao', {
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
      navigate('/controller/cadernetas/suplementacao')
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      toast.error('Erro inesperado ao excluir registro')
    } finally {
      setIsSubmitting(false)
    }
  }

  const backUrl = '/controller/cadernetas/suplementacao'

  const actions = (
    <>
      {featureHabilitada && (
        <Button variant="primary" onClick={handleStartEdit} className="text-sm">
          Editar
        </Button>
      )}
      {featureHabilitada && canDelete && (
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

  return (
    <>
      <DetailLayout
        loading={loading}
        loadError={loadError}
        notFound={!registro}
        onBack={() => navigate(backUrl)}
        onRetry={loadRegistro}
        title="Detalhes do Registro de Suplementação"
        actions={actions}
      >
        {() => (
          <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="space-y-6">
              {/* Informações Gerais */}
              <DetailSection title="Informações Gerais">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <DetailField label="Data" value={formatDate(registro!.data)} />
                  <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                  <DetailField label="Tratador" value={formatValue(registro!.tratador)} />
                  <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
                  <DetailField label="Lote" value={formatValue(registro!.lote)} />
                </div>
              </DetailSection>

              {/* Formulação e Gado */}
              <DetailSection title="Formulação e Gado" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <DetailField label="Formulação" value={formatValue(registro!.formulacao)} />
                    {registro!.formulacao && (
                      <button
                        onClick={handleEditFormulacao}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        Visualizar
                      </button>
                    )}
                  </div>
                  <DetailField label="Categorias" value={registro!.categorias ? capitalizeWords(registro!.categorias) : '-'} />
                </div>
              </DetailSection>

              {/* Quantidades */}
              <DetailSection title="Quantidades">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr><td className="px-4 py-2 text-sm text-gray-900">KG Cocho</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.kg_cocho || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-gray-900">KG Depósito</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.kg_deposito || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-gray-900">Nº Cabeças</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{formatValue(registro!.n_cabecas)}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-gray-900">Qtd Bezerros</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{formatValue(registro!.qtd_bezerros)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </DetailSection>

              {/* Indicadores */}
              <DetailSection title="Indicadores" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailField label="Leitura de cocho" value={formatValue(registro!.leitura)} />
                  <DetailField label="Escore Fezes" value={formatValue(registro!.escore_fezes)} />
                  <DetailField label="Peso Vivo (kg)" value={registro!.peso_vivo_kg ? Number(registro!.peso_vivo_kg).toFixed(2) : '-'} />
                </div>
              </DetailSection>

              {/* Métricas de Consumo */}
              <DetailSection title="Métricas de Consumo" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <DetailField label="Consumo MN (kg/cab/dia)" value={registro!.consumo_medio_geral_kg_mn ? Number(registro!.consumo_medio_geral_kg_mn).toFixed(4) : '-'} />
                  <DetailField label="Consumo MS (kg/cab/dia)" value={registro!.consumo_medio_geral_kg_ms ? Number(registro!.consumo_medio_geral_kg_ms).toFixed(4) : '-'} />
                  <DetailField label="Consumo %PV" value={registro!.consumo_medio_geral_percent_pv ? Number(registro!.consumo_medio_geral_percent_pv).toFixed(4) : '-'} />
                  <DetailField label="Custo (R$/cab/dia)" value={registro!.custo_medio_reais_cab_dia ? Number(registro!.custo_medio_reais_cab_dia).toFixed(4) : '-'} />
                </div>
                <p className="text-xs text-gray-500 mt-2">Métricas recalculadas automaticamente após edição. O último registro da série fica sem consumo até que um novo registro seja adicionado.</p>
              </DetailSection>

              {/* Condições do Cocho */}
              <DetailSection title="Condições do Cocho" highlighted>
                <div className="space-y-4">
                  {registro!.checklist?.limpeza_cocho && (
                    <div className="space-y-1">
                      <DetailField label="Limpeza de cocho foi realizada?" value={boolSimNao(registro!.checklist.limpeza_cocho.valor)} />
                      {registro!.checklist.limpeza_cocho.observacao && <p className="text-sm text-gray-600"><span className="font-medium">Obs.:</span> {registro!.checklist.limpeza_cocho.observacao}</p>}
                    </div>
                  )}
                  {registro!.checklist?.cochos_condicoes && (
                    <div className="space-y-1">
                      <DetailField label="Cochos estão em boas condições?" value={boolSimNao(registro!.checklist.cochos_condicoes.valor)} />
                      {registro!.checklist.cochos_condicoes.observacao && <p className="text-sm text-gray-600"><span className="font-medium">Obs.:</span> {registro!.checklist.cochos_condicoes.observacao}</p>}
                    </div>
                  )}
                  {registro!.checklist?.aterro_acesso_ideal && (
                    <div className="space-y-1">
                      <DetailField label="Aterro / acesso ao cocho está ideal?" value={boolSimNao(registro!.checklist.aterro_acesso_ideal.valor)} />
                      {registro!.checklist.aterro_acesso_ideal.observacao && <p className="text-sm text-gray-600"><span className="font-medium">Obs.:</span> {registro!.checklist.aterro_acesso_ideal.observacao}</p>}
                    </div>
                  )}
                  {registro!.checklist?.deposito_condicoes && (
                    <div className="space-y-1">
                      <DetailField label="Depósito está em boas condições?" value={boolSimNao(registro!.checklist.deposito_condicoes.valor)} />
                      {registro!.checklist.deposito_condicoes.observacao && <p className="text-sm text-gray-600"><span className="font-medium">Obs.:</span> {registro!.checklist.deposito_condicoes.observacao}</p>}
                    </div>
                  )}
                </div>
              </DetailSection>
            </div>
          </Card>
        )}
      </DetailLayout>

      {/* Modal de Edição */}
      {isEditing && editForm && (
        <Modal
          isOpen={isEditing}
          onClose={() => !isSubmitting && setIsEditing(false)}
          title="Editar Registro de Suplementação"
          size="lg"
        >
          <div className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <Input
                  type="date"
                  value={editForm.data}
                  onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tratador</label>
                <Input
                  type="text"
                  value={editForm.tratador}
                  onChange={(e) => setEditForm({ ...editForm, tratador: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lote</label>
                <select
                  value={editForm.lote_id}
                  onChange={(e) => setEditForm({ ...editForm, lote_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                >
                  <option value="">Sem lote</option>
                  {lotes.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Formulação</label>
                <select
                  value={editForm.formulacao}
                  onChange={(e) => setEditForm({ ...editForm, formulacao: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                >
                  <option value="">Sem formulação</option>
                  {formulacoes.map(f => (
                    <option key={f.nome} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KG Cocho</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.kg_cocho}
                  onChange={(e) => setEditForm({ ...editForm, kg_cocho: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KG Depósito</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.kg_deposito}
                  onChange={(e) => setEditForm({ ...editForm, kg_deposito: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leitura de Cocho</label>
                <div className="relative" ref={leituraDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setLeituraDropdownOpen(!leituraDropdownOpen)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] flex items-center gap-2 bg-white"
                  >
                    {editForm.leitura && (
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          editForm.leitura === '-1' ? 'bg-red-500'
                          : editForm.leitura === '0' ? 'bg-yellow-500'
                          : editForm.leitura === '1' ? 'bg-green-500'
                          : editForm.leitura === '2' ? 'bg-yellow-500'
                          : editForm.leitura === '3' ? 'bg-red-500'
                          : ''
                        }`}
                      />
                    )}
                    <span>
                      {editForm.leitura === '' || !editForm.leitura ? '-'
                      : editForm.leitura === '-1' ? '-1'
                      : editForm.leitura === '0' ? '0'
                      : editForm.leitura === '1' ? '1'
                      : editForm.leitura === '2' ? '2'
                      : editForm.leitura === '3' ? '3'
                      : '-'}
                    </span>
                  </button>
                  {leituraDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {[
                        { value: '', label: '-', color: '' },
                        { value: '-1', label: '-1', color: 'bg-red-500' },
                        { value: '0', label: '0', color: 'bg-yellow-500' },
                        { value: '1', label: '1', color: 'bg-green-500' },
                        { value: '2', label: '2', color: 'bg-yellow-500' },
                        { value: '3', label: '3', color: 'bg-red-500' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setEditForm({ ...editForm, leitura: opt.value })
                            setLeituraDropdownOpen(false)
                          }}
                          className={`w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 ${
                            editForm.leitura === opt.value ? 'bg-blue-50 font-medium' : ''
                          }`}
                        >
                          {opt.color ? (
                            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.color}`} />
                          ) : (
                            <span className="w-3 h-3 flex-shrink-0" />
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escore Fezes</label>
                <div className="relative" ref={escoreDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setEscoreDropdownOpen(!escoreDropdownOpen)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] flex items-center gap-2 bg-white"
                  >
                    {editForm.escore_fezes && (
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          editForm.escore_fezes === '1' ? 'bg-red-500'
                          : editForm.escore_fezes === '2' ? 'bg-yellow-500'
                          : editForm.escore_fezes === '3' ? 'bg-green-500'
                          : editForm.escore_fezes === '4' ? 'bg-yellow-500'
                          : editForm.escore_fezes === '5' ? 'bg-red-500'
                          : ''
                        }`}
                      />
                    )}
                    <span>{editForm.escore_fezes || '-'}</span>
                  </button>
                  {escoreDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {[
                        { value: '', label: '-', color: '' },
                        { value: '1', label: '1', color: 'bg-red-500' },
                        { value: '2', label: '2', color: 'bg-yellow-500' },
                        { value: '3', label: '3', color: 'bg-green-500' },
                        { value: '4', label: '4', color: 'bg-yellow-500' },
                        { value: '5', label: '5', color: 'bg-red-500' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setEditForm({ ...editForm, escore_fezes: opt.value })
                            setEscoreDropdownOpen(false)
                          }}
                          className={`w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 ${
                            editForm.escore_fezes === opt.value ? 'bg-blue-50 font-medium' : ''
                          }`}
                        >
                          {opt.color ? (
                            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.color}`} />
                          ) : (
                            <span className="w-3 h-3 flex-shrink-0" />
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
              O peso vivo e as métricas de consumo serão recalculados automaticamente após salvar.
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
          title="Excluir Registro de Suplementação"
          message={`Tem certeza que deseja excluir o registro de ${formatDate(registro.data)}?\n\nLote: ${registro.lote || '-'}\nFormulação: ${registro.formulacao || '-'}\nKG Cocho: ${registro.kg_cocho || 0}\n\nO registro será marcado como excluído. As métricas de consumo da série serão recalculadas automaticamente.`}
          confirmText={isSubmitting ? 'Excluindo...' : 'Excluir'}
          cancelText="Cancelar"
          variant="danger"
        />
      )}
    </>
  )
}
