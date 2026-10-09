import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, ConfirmModal, DetailLayout, DetailSection, DetailField, Input, Modal, Select, formatValue, useToast } from '@gestaup/ui'
import { formatDateTime, toFarmDateOnly, FARM_TIMEZONE } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroAlimentacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  modo?: string
  quem_recebeu?: string
  itens_detalhe?: any[]
  numero_cozinheiras?: number
  quem_cozinhou?: string
  quem_ajudou?: string
  numero_cafe_manha?: number
  numero_lanches?: number
  numero_refeicoes_almoco?: number
  numero_refeicoes_jantar?: number
  fornecedor?: string
  quantidade_marmitas?: number
  preco_unitario?: number
  destinatario?: string
  itens?: any[]
  observacao?: string
  nome_usuario?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

interface ItemCatalogo {
  id: string
  nome: string
  unidade_medida: string
}

interface ItemForm {
  itemId: string
  quantidade: string
}

interface FormEdicao {
  data: string
  hora: string
  observacao: string
  itens: ItemForm[]
  fornecedor: string
  quantidade_marmitas: string
  preco_unitario: string
  destinatario: string
}

interface SaldoNegativo {
  nome: string
  estoque_atual: number
}

/** Converte data + hora de parede no fuso da fazenda para ISO UTC. */
function farmDateTimeToIso(dateStr: string, timeStr: string): string {
  const t = timeStr || '00:00'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FARM_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dateStr}T${t}:00Z`))
  const offset = (parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '')
  return new Date(`${dateStr}T${t}:00${offset}`).toISOString()
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

export function RegistrosSaidaCantinaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroAlimentacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const toast = useToast()
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [form, setForm] = useState<FormEdicao | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canManage = !!user && (user.papel === 'admin' || user.papel === 'controller')
  const editavel = !!registro && registro.modo !== 'entrada'

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
      .from('registros_alimentacao')
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
      setRegistro(data as RegistroAlimentacao)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/alimentacao'

  const avisarSaldosNegativos = (saldos: SaldoNegativo[] | undefined) => {
    if (!saldos || saldos.length === 0) return
    toast.warning(`Estoque negativo após a correção: ${saldos.map(s => `${s.nome} (${s.estoque_atual})`).join(', ')}`)
  }

  const abrirEdicao = async () => {
    if (!registro) return
    setFormError(null)
    if (registro.modo !== 'marmita') {
      const { data, error } = await supabase
        .from('itens_cantina')
        .select('id, nome, unidade_medida')
        .eq('fazenda_id', registro.fazenda_id)
        .is('deleted_at', null)
        .order('nome')
      if (error) {
        toast.error('Erro ao carregar itens da cantina')
        return
      }
      setCatalogo((data || []) as ItemCatalogo[])
    }
    setForm({
      data: toFarmDateOnly(registro.data) || '',
      hora: toFarmTimeOnly(registro.data),
      observacao: registro.observacao || '',
      itens: (registro.itens_detalhe || []).map((i: any) => ({
        itemId: String(i.itemId || ''),
        quantidade: String(i.quantidade ?? ''),
      })),
      fornecedor: registro.fornecedor || '',
      quantidade_marmitas: registro.quantidade_marmitas != null ? String(registro.quantidade_marmitas) : '',
      preco_unitario: registro.preco_unitario != null ? String(registro.preco_unitario) : '',
      destinatario: registro.destinatario || '',
    })
  }

  const salvarEdicao = async () => {
    if (!registro || !form) return
    if (!form.data) {
      setFormError('Informe a data')
      return
    }
    const campos: Record<string, unknown> = {
      data: farmDateTimeToIso(form.data, form.hora),
      observacao: form.observacao.trim() || null,
    }
    if (registro.modo === 'marmita') {
      campos.fornecedor = form.fornecedor.trim()
      campos.quantidade_marmitas = form.quantidade_marmitas === '' ? null : Number(form.quantidade_marmitas)
      campos.preco_unitario = form.preco_unitario === '' ? null : Number(form.preco_unitario)
      campos.destinatario = form.destinatario.trim()
    } else {
      campos.itens_detalhe = form.itens.map(i => ({ itemId: i.itemId, quantidade: i.quantidade.replace(',', '.') }))
    }

    setSubmitting(true)
    setFormError(null)
    const { data, error } = await supabase.rpc('editar_registro_saida_cantina', {
      p_id: registro.id,
      p_fazenda_id: registro.fazenda_id,
      p_campos: campos,
    })
    setSubmitting(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setForm(null)
    toast.success('Registro atualizado. O estoque foi recalculado.')
    avisarSaldosNegativos((data as any)?.saldos_negativos)
    await loadRegistro()
  }

  const excluirRegistro = async () => {
    if (!registro) return
    setSubmitting(true)
    const { data, error } = await supabase.rpc('excluir_registro_saida_cantina', {
      p_id: registro.id,
      p_fazenda_id: registro.fazenda_id,
    })
    setSubmitting(false)
    setConfirmDelete(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Registro excluído. O estoque foi estornado.')
    avisarSaldosNegativos((data as any)?.saldos_negativos)
    navigate(backUrl)
  }

  const atualizarItem = (index: number, patch: Partial<ItemForm>) =>
    setForm(f => f && { ...f, itens: f.itens.map((it, i) => (i === index ? { ...it, ...patch } : it)) })

  return (
    <>
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Alimentação"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Badge do modo */}
            {registro!.modo && (
              <div className="flex items-center justify-between gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  registro!.modo === 'marmita'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : registro!.modo === 'entrada'
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-primary/10 text-primary dark:text-primary-light'
                }`}>
                  {registro!.modo === 'marmita' ? 'Marmita' : registro!.modo === 'entrada' ? 'Entrada' : 'Cantina'}
                </span>
                {canManage && editavel && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={abrirEdicao}>Editar</Button>
                    <Button variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
                  </div>
                )}
              </div>
            )}

            {registro!.modo === 'entrada' ? (
              <DetailSection title="Informações Gerais">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <DetailField label="Data" value={formatDateTime(registro!.data)} />
                  <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                  <DetailField label="Quem Recebeu" value={formatValue(registro!.quem_recebeu)} />
                </div>
              </DetailSection>
            ) : registro!.modo === 'marmita' ? (
              <>
                {/* Informações da Marmita */}
                <DetailSection title="Informações Gerais">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <DetailField label="Data" value={formatDateTime(registro!.data)} />
                    <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                    <DetailField label="Fornecedor" value={formatValue(registro!.fornecedor)} />
                    <DetailField label="Destinatário" value={formatValue(registro!.destinatario)} />
                  </div>
                </DetailSection>

                {/* Detalhes da Marmita */}
                <DetailSection title="Detalhes" highlighted>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DetailField label="Qtd. Marmitas" value={formatValue(registro!.quantidade_marmitas)} />
                    <DetailField label="Preço Unit." value={registro!.preco_unitario ? `R$ ${Number(registro!.preco_unitario).toFixed(2).replace('.', ',')}` : '-'} />
                    <DetailField label="Valor Total" value={(registro!.quantidade_marmitas && registro!.preco_unitario) ? `R$ ${(registro!.quantidade_marmitas * Number(registro!.preco_unitario)).toFixed(2).replace('.', ',')}` : '-'} />
                  </div>
                </DetailSection>
              </>
            ) : (
              <>
                {/* Informações Gerais */}
                <DetailSection title="Informações Gerais">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <DetailField label="Data" value={formatDateTime(registro!.data)} />
                    <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                    <DetailField label="Nº Cozinheiras" value={formatValue(registro!.numero_cozinheiras)} />
                    <DetailField label="Quem Cozinhou" value={formatValue(registro!.quem_cozinhou)} />
                    <DetailField label="Quem Ajudou" value={formatValue(registro!.quem_ajudou)} />
                  </div>
                </DetailSection>

                {/* Quantidades */}
                <DetailSection title="Quantidades" highlighted>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <DetailField label="Café Manhã" value={formatValue(registro!.numero_cafe_manha)} />
                    <DetailField label="Lanches" value={formatValue(registro!.numero_lanches)} />
                    <DetailField label="Almoço" value={formatValue(registro!.numero_refeicoes_almoco)} />
                    <DetailField label="Jantar" value={formatValue(registro!.numero_refeicoes_jantar)} />
                  </div>
                </DetailSection>
              </>
            )}

            {/* Itens */}
            {registro!.itens_detalhe && registro!.itens_detalhe.length > 0 ? (
              <DetailSection title="Itens" highlighted>
                <div className="space-y-2">
                  {registro!.itens_detalhe.map((item: any, index: number) => (
                    <p key={index} className="text-sm">
                      <span className="font-medium text-content">{item.nome || 'Item'}:</span> {item.quantidade || '-'} {item.unidade_medida || item.unidade || ''}
                    </p>
                  ))}
                </div>
              </DetailSection>
            ) : registro!.itens && typeof registro!.itens === 'object' && !Array.isArray(registro!.itens) && Object.keys(registro!.itens).length > 0 ? (
              <DetailSection title="Itens" highlighted>
                <div className="space-y-2">
                  {Object.entries(registro!.itens as Record<string, unknown>).map(([nome, qtd], index) => (
                    <p key={index} className="text-sm">
                      <span className="font-medium text-content">{nome}:</span> {String(qtd)}
                    </p>
                  ))}
                </div>
              </DetailSection>
            ) : Array.isArray(registro!.itens) && registro!.itens.length > 0 ? (
              <DetailSection title="Itens" highlighted>
                <div className="space-y-2">
                  {registro!.itens.map((item: any, index: number) => (
                    <p key={index} className="text-sm">
                      <span className="font-medium text-content">{item.nome || item.item || 'Item'}:</span> {item.quantidade || '-'} {item.unidade || ''}
                    </p>
                  ))}
                </div>
              </DetailSection>
            ) : null}

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

    <Modal isOpen={!!form} onClose={() => setForm(null)} title="Editar saída de cantina" size="md">
      {form && registro && (
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            <Input label="Hora" type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} />
          </div>

          {registro.modo === 'marmita' ? (
            <>
              <Input label="Fornecedor" value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} />
              <Input label="Destinatário" value={form.destinatario} onChange={e => setForm({ ...form, destinatario: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Qtd. marmitas" type="number" min={1} value={form.quantidade_marmitas} onChange={e => setForm({ ...form, quantidade_marmitas: e.target.value })} />
                <Input label="Preço unitário" type="number" step="0.01" min={0} value={form.preco_unitario} onChange={e => setForm({ ...form, preco_unitario: e.target.value })} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-content-strong">Itens</p>
              {form.itens.map((it, index) => {
                const usados = form.itens.filter((_, i) => i !== index).map(x => x.itemId)
                return (
                  <div key={index} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-end">
                    <Select
                      options={[
                        { value: '', label: 'Selecione' },
                        ...catalogo.filter(c => !usados.includes(c.id)).map(c => ({ value: c.id, label: `${c.nome} (${c.unidade_medida})` })),
                      ]}
                      value={it.itemId}
                      onChange={v => atualizarItem(index, { itemId: v })}
                    />
                    <Input
                      type="number"
                      step="0.001"
                      min={0}
                      value={it.quantidade}
                      onChange={e => atualizarItem(index, { quantidade: e.target.value })}
                    />
                    <Button variant="secondary" onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== index) })}>
                      Remover
                    </Button>
                  </div>
                )
              })}
              <Button variant="secondary" onClick={() => setForm({ ...form, itens: [...form.itens, { itemId: '', quantidade: '' }] })}>
                Adicionar item
              </Button>
            </div>
          )}

          <Input label="Observação" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" onClick={salvarEdicao} disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>

    <ConfirmModal
      isOpen={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      onConfirm={excluirRegistro}
      title="Excluir saída de cantina"
      message={`Confirma a exclusão deste registro de ${registro ? formatDateTime(registro.data) : ''}?\n\nO registro sai dos relatórios e o estoque dos itens é estornado automaticamente. A operação fica registrada na auditoria.`}
      confirmText="Excluir"
      variant="danger"
    />
    </>
  )
}
