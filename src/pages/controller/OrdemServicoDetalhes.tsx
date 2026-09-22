import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import {
  Button, Card, Input, Select, Modal, ConfirmModal, useToast,
  DetailLayout, DetailSection, DetailField, formatValue,
} from '../../components/ui'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { STATUS_OS, TIPO_OS, TIPO_VENDA, type OrdemServico } from './OrdensServico'
import {
  listarDocumentosOs, uploadDocumentoOs, excluirDocumentoOs,
  type OsDocumentoComUrl, type TipoDocumentoOs,
} from '../../services/osDocumentosService'
import { validarDocumento } from '../../utils/comprimirDocumento'

interface MovimentacaoOs {
  id: string
  data: string
  lote_origem: string | null
  categoria: string | null
  numero_cabecas: number | null
  peso_vivo_atual_kg: number | null
  observacao: string | null
}

interface OrdemServicoFull extends OrdemServico {
  corretora: string | null
  venda_direta: boolean | null
  sexo: string | null
  idade_era: string | null
  data_prevista_abate: string | null
  preco_arroba: number | null
  data_prevista_pagamento: string | null
  observacao: string | null
  valor_acerto: number | null
  data_credito: string | null
  closed_at: string | null
  motivo_cancelamento: string | null
  cancelada_at: string | null
}

const fmtBRL = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '-'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_DOC_LABEL: Record<string, string> = {
  romaneio: 'Romaneio',
  acerto: 'Acerto',
  outro: 'Outro',
}

export function OrdemServicoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [os, setOs] = useState<OrdemServicoFull | null>(null)
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoOs[]>([])
  const [totalPesados, setTotalPesados] = useState(0)
  const [documentos, setDocumentos] = useState<OsDocumentoComUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Upload de documento
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docTipo, setDocTipo] = useState<TipoDocumentoOs>('romaneio')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Ações de status
  const [showFecharModal, setShowFecharModal] = useState(false)
  const [valorAcerto, setValorAcerto] = useState('')
  const [dataCredito, setDataCredito] = useState('')
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [showEstornoModal, setShowEstornoModal] = useState(false)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false)

  useEffect(() => {
    loadTudo()
  }, [id, user])

  const loadTudo = async () => {
    if (!id || !user) return
    setLoadError(null)

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setOs(null)
      } else {
        console.error('Erro ao buscar OS:', error)
        setLoadError(error.message || 'Erro ao buscar OS')
      }
      setLoading(false)
      return
    }
    setOs(data as OrdemServicoFull)

    const [movRes, pesRes, docs] = await Promise.all([
      supabase
        .from('registros_movimentacao')
        .select('id, data, lote_origem, categoria, numero_cabecas, peso_vivo_atual_kg, observacao')
        .eq('os_id', id)
        .is('deleted_at', null)
        .order('data', { ascending: false }),
      supabase
        .from('registros_pesagem')
        .select('id', { count: 'exact', head: true })
        .eq('os_id', id)
        .is('deleted_at', null),
      listarDocumentosOs(id).catch((e) => {
        console.error('Erro ao listar documentos:', e)
        return [] as OsDocumentoComUrl[]
      }),
    ])

    setMovimentacoes((movRes.data as MovimentacaoOs[]) || [])
    setTotalPesados(pesRes.count ?? 0)
    setDocumentos(docs)
    setLoading(false)
  }

  const handleUpload = async () => {
    if (!docFile || !os || !user) return
    const erro = validarDocumento(docFile)
    if (erro) {
      toast.error(erro)
      return
    }
    setUploading(true)
    try {
      await uploadDocumentoOs(os.id, os.fazenda_id, docTipo, docFile, user.id)
      toast.success('Documento enviado')
      setDocFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setDocumentos(await listarDocumentosOs(os.id))
    } catch (e: any) {
      console.error('Erro no upload:', e)
      toast.error(e?.message || 'Erro ao enviar documento')
    } finally {
      setUploading(false)
    }
  }

  const handleExcluirDoc = async (doc: OsDocumentoComUrl) => {
    if (!confirm(`Excluir o documento "${doc.nome_arquivo || doc.tipo}"?`)) return
    try {
      await excluirDocumentoOs(doc)
      setDocumentos(documentos.filter((d) => d.id !== doc.id))
      toast.success('Documento excluído')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao excluir documento')
    }
  }

  const handleFechar = async () => {
    if (!os || !user) return
    setAcaoEmAndamento(true)
    const { data, error } = await supabase.rpc('fechar_os_venda', {
      p_os_id: os.id,
      p_valor_acerto: valorAcerto ? Number(valorAcerto.replace(',', '.')) : null,
      p_data_credito: dataCredito || null,
      p_usuario_id: user.id,
    })
    setAcaoEmAndamento(false)
    setShowFecharModal(false)
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Erro ao fechar OS')
      return
    }
    toast.success(`OS ${data.numero_os} fechada`)
    loadTudo()
  }

  const handleCancelar = async () => {
    if (!os || !user) return
    setAcaoEmAndamento(true)
    const { data, error } = await supabase.rpc('cancelar_os_venda', {
      p_os_id: os.id,
      p_motivo: motivoCancelamento || null,
      p_usuario_id: user.id,
    })
    setAcaoEmAndamento(false)
    setShowCancelarModal(false)
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Erro ao cancelar OS')
      return
    }
    toast.success(`OS ${data.numero_os} cancelada`)
    loadTudo()
  }

  const handleEstornar = async () => {
    if (!os || !user) return
    setAcaoEmAndamento(true)
    const { data, error } = await supabase.rpc('estornar_baixa_os', {
      p_os_id: os.id,
      p_usuario_id: user.id,
    })
    setAcaoEmAndamento(false)
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Erro ao estornar baixa')
      return
    }
    toast.success(
      `Baixa estornada: ${data.movimentacoes_estornadas} movimentações, ${data.individuos_revertidos} animais revertidos`,
    )
    loadTudo()
  }

  const podeEstornar = os?.status === 'embarcada' || os?.status === 'aguardando_pagamento'
  const podeFechar = podeEstornar
  const podeCancelar = os?.status === 'aberta'
  const podeUpload = os?.status !== 'fechada' && os?.status !== 'cancelada'

  return (
    <>
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!os}
      onBack={() => navigate('/controller/ordens-servico')}
      title={`OS ${os?.numero_os || ''}`}
      actions={
        <>
          {podeFechar && (
            <Button onClick={() => setShowFecharModal(true)} size="sm">
              Fechar OS
            </Button>
          )}
          {podeEstornar && (
            <Button variant="secondary" onClick={() => setShowEstornoModal(true)} size="sm">
              Estornar Baixa
            </Button>
          )}
          {podeCancelar && (
            <Button variant="danger" onClick={() => setShowCancelarModal(true)} size="sm">
              Cancelar OS
            </Button>
          )}
        </>
      }
    >
      {() => (
        <div className="space-y-4 sm:space-y-6">
          {/* Informações Gerais */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <DetailField label="Número" value={formatValue(os!.numero_os)} />
                <DetailField
                  label="Status"
                  value={
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_OS[os!.status]?.classes || ''}`}>
                      {STATUS_OS[os!.status]?.label || os!.status}
                    </span>
                  }
                />
                <DetailField label="Tipo" value={TIPO_OS[os!.tipo] || os!.tipo} />
                {os!.tipo_venda && (
                  <DetailField label="Tipo de Venda" value={TIPO_VENDA[os!.tipo_venda]} />
                )}
                <DetailField label="Criada em" value={formatDateTime(os!.created_at)} />
                <DetailField label="Usuário" value={formatValue(os!.nome_usuario)} />
                {os!.status === 'cancelada' && (
                  <>
                    <DetailField label="Cancelada em" value={formatDateTime(os!.cancelada_at)} />
                    <DetailField label="Motivo" value={formatValue(os!.motivo_cancelamento)} />
                  </>
                )}
              </div>
            </DetailSection>
          </Card>

          {/* Comunicado */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title="Comunicado de Venda" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <DetailField label="Vendedor" value={formatValue(os!.vendedor)} />
                <DetailField label="Comprador" value={formatValue(os!.comprador)} />
                <DetailField
                  label="Venda"
                  value={os!.venda_direta ? 'Direta' : `Corretora: ${os!.corretora || '-'}`}
                />
                <DetailField label="Quantidade Prevista" value={formatValue(os!.quantidade_prevista)} />
                <DetailField label="Sexo" value={formatValue(os!.sexo)} />
                <DetailField label="Idade (Era)" value={formatValue(os!.idade_era)} />
                <DetailField label="Embarque Previsto" value={formatDate(os!.data_prevista_embarque)} />
                {os!.tipo_venda === 'abate' && (
                  <DetailField label="Abate Previsto" value={formatDate(os!.data_prevista_abate)} />
                )}
                <DetailField label="Preço/Arroba" value={fmtBRL(os!.preco_arroba)} />
                <DetailField label="Pagamento Previsto" value={formatDate(os!.data_prevista_pagamento)} />
              </div>
              {os!.observacao && (
                <p className="text-sm text-content mt-4">
                  <span className="font-medium text-content-muted">Observação:</span> {os!.observacao}
                </p>
              )}
            </DetailSection>
          </Card>

          {/* Embarque */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title="Embarque (Pesagem)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <DetailField label="Animais Pesados" value={totalPesados} />
                <DetailField
                  label="Cabeças Embarcadas"
                  value={`${os!.quantidade_embarcada ?? 0} de ${os!.quantidade_prevista ?? '-'}`}
                />
              </div>
              {movimentacoes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border-base">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Data</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Lote Origem</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Categoria</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Cabeças</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Peso Médio (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base">
                      {movimentacoes.map((m) => (
                        <tr key={m.id}>
                          <td className="px-4 py-2 text-sm text-content-strong">{formatDate(m.data)}</td>
                          <td className="px-4 py-2 text-sm text-content-strong">{m.lote_origem || '-'}</td>
                          <td className="px-4 py-2 text-sm text-content-strong">{m.categoria || '-'}</td>
                          <td className="px-4 py-2 text-sm text-content-strong">{m.numero_cabecas ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-content-strong">
                            {m.peso_vivo_atual_kg != null ? m.peso_vivo_atual_kg.toFixed(1) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-content-muted">Nenhum embarque registrado ainda.</p>
              )}
            </DetailSection>
          </Card>

          {/* Documentos */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title="Documentos" highlighted>
              {podeUpload && (
                <div className="flex flex-col sm:flex-row gap-3 mb-4 items-start sm:items-end">
                  <div className="w-full sm:w-48">
                    <label className="block text-xs sm:text-sm font-medium text-content mb-1">Tipo</label>
                    <Select
                      value={docTipo}
                      onChange={(v) => setDocTipo(v as TipoDocumentoOs)}
                      options={[
                        ...(os!.tipo_venda === 'abate' ? [{ value: 'romaneio', label: 'Romaneio' }] : []),
                        { value: 'acerto', label: 'Acerto' },
                        { value: 'outro', label: 'Outro' },
                      ]}
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-xs sm:text-sm font-medium text-content mb-1">
                      Arquivo (imagem ou PDF, máx. 15 MB)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-content file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content-strong hover:file:bg-surface-3"
                    />
                  </div>
                  <Button onClick={handleUpload} disabled={!docFile || uploading} size="sm">
                    {uploading ? 'Enviando...' : 'Enviar'}
                  </Button>
                </div>
              )}
              {documentos.length === 0 ? (
                <p className="text-sm text-content-muted">Nenhum documento anexado.</p>
              ) : (
                <ul className="divide-y divide-border-base">
                  {documentos.map((doc) => (
                    <li key={doc.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-content-strong truncate">
                          {doc.nome_arquivo || doc.arquivo_url.split('/').pop()}
                        </p>
                        <p className="text-xs text-content-muted">
                          {TIPO_DOC_LABEL[doc.tipo] || doc.tipo} · {formatDateTime(doc.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.signedUrl && (
                          <a
                            href={doc.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Abrir
                          </a>
                        )}
                        {podeUpload && (
                          <button
                            onClick={() => handleExcluirDoc(doc)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </Card>

          {/* Acerto / Fechamento */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title="Acerto e Fechamento">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Valor do Acerto" value={fmtBRL(os!.valor_acerto)} />
                <DetailField label="Data do Crédito" value={formatDate(os!.data_credito)} />
                {os!.status === 'fechada' && (
                  <DetailField label="Fechada em" value={formatDateTime(os!.closed_at)} />
                )}
              </div>
              {podeFechar && (
                <p className="text-xs text-content-muted mt-3">
                  A OS só deve ser fechada depois de confirmar que o valor do acerto caiu na conta da fazenda.
                </p>
              )}
            </DetailSection>
          </Card>
        </div>
      )}
    </DetailLayout>
      {/* Modais */}
      <Modal isOpen={showFecharModal} onClose={() => setShowFecharModal(false)} title="Fechar OS" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-content">
            Confirme que o valor do acerto caiu na conta da fazenda antes de fechar.
          </p>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Valor do Acerto (R$)</label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 152340,50"
              value={valorAcerto}
              onChange={(e) => setValorAcerto(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Data do Crédito</label>
            <Input type="date" value={dataCredito} onChange={(e) => setDataCredito(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowFecharModal(false)}>Voltar</Button>
            <Button onClick={handleFechar} disabled={acaoEmAndamento}>
              {acaoEmAndamento ? 'Fechando...' : 'Confirmar Fechamento'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCancelarModal} onClose={() => setShowCancelarModal(false)} title="Cancelar OS" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Motivo do cancelamento</label>
            <Input
              type="text"
              placeholder="Ex: venda desfeita pelo comprador"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCancelarModal(false)}>Voltar</Button>
            <Button variant="danger" onClick={handleCancelar} disabled={acaoEmAndamento}>
              {acaoEmAndamento ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showEstornoModal}
        onClose={() => setShowEstornoModal(false)}
        onConfirm={handleEstornar}
        title="Estornar Baixa"
        message="As movimentações de saída desta OS serão revertidas (cabeças voltam aos lotes) e os animais marcados como vendidos retornam ao status anterior. Deseja continuar?"
        confirmText="Estornar"
        variant="warning"
      />
    </>
  )
}
