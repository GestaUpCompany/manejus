import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, DetailLayout, DetailSection, DetailField, formatValue, Input, Modal, useToast } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroPastagens {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  manejador?: string
  lote?: string
  pasto_saida?: string
  avaliacao_saida?: number
  pasto_saida_area_util?: string
  pasto_saida_especie?: string
  tempo_ocupacao?: string
  pasto_entrada?: string
  avaliacao_entrada?: number
  pasto_entrada_area_util?: string
  pasto_entrada_especie?: string
  tempo_vedacao?: string
  vaca?: number
  touro?: number
  bezerro?: number
  boi_magro?: number
  garrote?: number
  novilha?: number
  escore_gado?: number
  escore_fezes?: number
  numero_pessoas_manejo?: number
  sync_status?: string
  created_at: string
  updated_at?: string
}

interface EditForm {
  data: string
  avaliacao_saida: string
  escore_gado: string
  escore_fezes: string
  numero_pessoas_manejo: string
}

interface OpcaoSeletor {
  value: string
  label: string
  dot: string
}

// Mesmas opções e cores do manejo de pastagens no PWA
const AVALIACOES_PASTO: OpcaoSeletor[] = [
  { value: '1', label: '1 · Rapado', dot: 'bg-red-500' },
  { value: '2', label: '2 · Ideal p/ sair', dot: 'bg-green-500' },
  { value: '3', label: '3 · Médio', dot: 'bg-yellow-400' },
  { value: '4', label: '4 · Ideal p/ entrar', dot: 'bg-green-500' },
  { value: '5', label: '5 · Passado', dot: 'bg-red-500' },
]

const ESCORES_CORPORAIS: OpcaoSeletor[] = [
  { value: '1', label: '1 · Muito magro', dot: 'bg-red-500' },
  { value: '2', label: '2 · Magro', dot: 'bg-yellow-400' },
  { value: '3', label: '3 · Bom', dot: 'bg-green-500' },
  { value: '4', label: '4 · Gordo', dot: 'bg-yellow-400' },
  { value: '5', label: '5 · Muito gordo', dot: 'bg-red-500' },
]

const ESCORES_FEZES: OpcaoSeletor[] = [
  { value: '1', label: '1 · Líquida', dot: 'bg-red-500' },
  { value: '2', label: '2 · Mole', dot: 'bg-yellow-400' },
  { value: '3', label: '3 · Ideal', dot: 'bg-green-500' },
  { value: '4', label: '4 · Firme', dot: 'bg-yellow-400' },
  { value: '5', label: '5 · Seca', dot: 'bg-red-500' },
]

// Cuiabá (fuso do PWA) está em UTC-4 o ano todo desde 2019, sem horário de verão
const FUSO_CUIABA = 'America/Cuiaba'
const OFFSET_CUIABA = '-04:00'

/** Data (AAAA-MM-DD) do registro no fuso de Cuiabá, que é o fuso em que o peão lançou */
function dataCuiaba(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO_CUIABA }).format(new Date(iso))
}

/** Hora (HH:MM:SS) do registro no fuso de Cuiabá, para manter o horário ao trocar só a data */
function horaCuiaba(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_CUIABA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** Seletor com bolinha colorida, no mesmo estilo dos seletores de Suplementação */
function SeletorOpcao({ value, opcoes, onChange }: { value: string; opcoes: OpcaoSeletor[]; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const atual = opcoes.find((o) => o.value === value)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full px-3 py-2 border border-surface-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] flex items-center gap-2 bg-surface-1"
      >
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${atual?.dot ?? ''}`} />
        <span>{atual ? atual.label : '-'}</span>
      </button>
      {aberto && (
        <div className="absolute z-10 w-full mt-1 bg-surface-1 border border-surface-3 rounded-lg shadow-lg max-h-60 overflow-auto">
          {opcoes.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setAberto(false)
              }}
              className={`w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-2 ${
                value === opt.value ? 'bg-primary/10 font-medium' : ''
              }`}
            >
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PastagensDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [registro, setRegistro] = useState<RegistroPastagens | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)

  const loadRegistro = useCallback(async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('registros_pastagens')
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
      setRegistro(data as RegistroPastagens)
    }

    setLoading(false)
  }, [id, user])

  useEffect(() => {
    loadRegistro()
  }, [loadRegistro])

  const handleStartEdit = () => {
    if (!registro) return
    setEditForm({
      data: dataCuiaba(registro.data),
      avaliacao_saida: registro.avaliacao_saida?.toString() || '',
      escore_gado: registro.escore_gado?.toString() || '',
      escore_fezes: registro.escore_fezes?.toString() || '',
      numero_pessoas_manejo: registro.numero_pessoas_manejo?.toString() || '',
    })
    setErrorMsg(null)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm || !registro || !user || isSubmitting) return

    if (!editForm.data) {
      setErrorMsg('Informe a data do registro')
      return
    }
    if (registro.pasto_saida && !editForm.avaliacao_saida) {
      setErrorMsg('Informe a avaliação do pasto de saída')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      const campos: Record<string, unknown> = {
        data: `${editForm.data}T${horaCuiaba(registro.data)}${OFFSET_CUIABA}`,
        escore_gado: editForm.escore_gado ? Number(editForm.escore_gado) : null,
        escore_fezes: editForm.escore_fezes ? Number(editForm.escore_fezes) : null,
        numero_pessoas_manejo: editForm.numero_pessoas_manejo !== '' ? Number(editForm.numero_pessoas_manejo) : null,
      }
      // Só o pasto de saída tem avaliação; se a saída foi de curral, o campo não é enviado
      if (registro.pasto_saida) {
        campos.avaliacao_saida = Number(editForm.avaliacao_saida)
      }

      const { data, error } = await supabase.rpc('editar_registro_pastagens', {
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
        setRegistro(data as RegistroPastagens)
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

  const backUrl = '/controller/cadernetas/pastagens'

  const totalAnimais = (registro?.vaca || 0) + (registro?.touro || 0) + (registro?.bezerro || 0) + (registro?.boi_magro || 0) + (registro?.garrote || 0) + (registro?.novilha || 0)

  const actions = (
    <Button variant="primary" onClick={handleStartEdit} className="text-sm">
      Editar
    </Button>
  )

  return (
    <>
      <DetailLayout
        loading={loading}
        loadError={loadError}
        notFound={!registro}
        onBack={() => navigate(backUrl)}
        onRetry={loadRegistro}
        title="Detalhes do Registro de Pastagens"
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
                  <DetailField label="Manejador" value={formatValue(registro!.manejador)} />
                  <DetailField label="Lote" value={formatValue(registro!.lote)} />
                </div>
              </DetailSection>

              {/* Movimentação de Pasto */}
              <DetailSection title="Movimentação de Pasto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Pasto Saída */}
                  <div className="bg-surface-2 p-4 rounded-lg">
                    <h4 className="font-medium text-content-strong mb-3">Pasto Saída</h4>
                    <div className="space-y-2">
                      <DetailField label="Pasto" value={formatValue(registro!.pasto_saida)} />
                      <DetailField label="Área Útil" value={formatValue(registro!.pasto_saida_area_util)} />
                      <DetailField label="Espécie" value={formatValue(registro!.pasto_saida_especie)} />
                      <DetailField label="Avaliação" value={formatValue(registro!.avaliacao_saida)} />
                      <DetailField label="Tempo de Ocupação" value={formatValue(registro!.tempo_ocupacao)} />
                    </div>
                  </div>

                  {/* Pasto Entrada */}
                  <div className="bg-surface-2 p-4 rounded-lg">
                    <h4 className="font-medium text-content-strong mb-3">Pasto Entrada</h4>
                    <div className="space-y-2">
                      <DetailField label="Pasto" value={formatValue(registro!.pasto_entrada)} />
                      <DetailField label="Área Útil" value={formatValue(registro!.pasto_entrada_area_util)} />
                      <DetailField label="Espécie" value={formatValue(registro!.pasto_entrada_especie)} />
                      <DetailField label="Avaliação" value={formatValue(registro!.avaliacao_entrada)} />
                      <DetailField label="Tempo de Vedação" value={formatValue(registro!.tempo_vedacao)} />
                    </div>
                  </div>
                </div>
              </DetailSection>

              {/* Contagem de Animais */}
              <DetailSection title="Contagem de Animais">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border-base">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Categoria</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-content-muted uppercase">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface-1 divide-y divide-border-base">
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Vaca</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.vaca || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Touro</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.touro || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Bezerro</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.bezerro || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Boi Magro</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.boi_magro || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Garrote</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.garrote || 0}</td></tr>
                      <tr><td className="px-4 py-2 text-sm text-content-strong">Novilha</td><td className="px-4 py-2 text-sm text-content-strong text-right">{registro!.novilha || 0}</td></tr>
                      <tr className="bg-surface-2 font-bold">
                        <td className="px-4 py-2 text-sm text-content-strong">Total</td>
                        <td className="px-4 py-2 text-sm text-content-strong text-right">{totalAnimais}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailField label="Escore Gado" value={formatValue(registro!.escore_gado)} />
                  <DetailField label="Escore Fezes" value={formatValue(registro!.escore_fezes)} />
                  <DetailField label="Pessoas no Manejo" value={formatValue(registro!.numero_pessoas_manejo)} />
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
          title="Editar Registro de Pastagens"
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
                <label className="block text-sm font-medium text-content mb-1">Nº de pessoas no manejo</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.numero_pessoas_manejo}
                  onChange={(e) => setEditForm({ ...editForm, numero_pessoas_manejo: e.target.value })}
                />
              </div>
              {registro?.pasto_saida && (
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Avaliação do pasto de saída</label>
                  <SeletorOpcao
                    value={editForm.avaliacao_saida}
                    opcoes={AVALIACOES_PASTO}
                    onChange={(v) => setEditForm({ ...editForm, avaliacao_saida: v })}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-content mb-1">Escore corporal</label>
                <SeletorOpcao
                  value={editForm.escore_gado}
                  opcoes={ESCORES_CORPORAIS}
                  onChange={(v) => setEditForm({ ...editForm, escore_gado: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Escore de fezes</label>
                <SeletorOpcao
                  value={editForm.escore_fezes}
                  opcoes={ESCORES_FEZES}
                  onChange={(v) => setEditForm({ ...editForm, escore_fezes: v })}
                />
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/30 text-primary dark:text-primary-light px-4 py-3 rounded-lg text-sm">
              Ao alterar a data, o histórico de ocupação deste movimento (pasto, módulo e curral) é reajustado e as cabeças e o peso na data são recalculados. A alteração é recusada se a nova data ficar fora do intervalo entre o movimento anterior e o seguinte do lote.
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
    </>
  )
}
