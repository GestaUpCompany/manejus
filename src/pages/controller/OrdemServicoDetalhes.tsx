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
  sexo: string | null
  numero_cabecas: number | null
  peso_vivo_atual_kg: number | null
  observacao: string | null
  os_recebimento_id: string | null
}

interface ContagemRecebimento {
  categoria: string
  femeas: number
  machos: number
}

interface ChecklistRecebimento {
  item: string
  resposta: 'S' | 'N'
  observacao: string | null
}

interface OsRecebimento {
  id: string
  numero_gta: string | null
  numero_nf: string | null
  doc_origem: string | null
  transportadora: string | null
  placa_veiculo: string | null
  placa_reboque: string | null
  motorista: string | null
  data_chegada: string | null
  hora_chegada: string | null
  peso_medio_balancao: number | null
  peso_origem: number | null
  hora_pesagem: string | null
  contagens: ContagemRecebimento[] | null
  checklist: ChecklistRecebimento[] | null
  score_corporal: number | null
  mortes: number | null
  destino: string | null
  lote_destino: string | null
  responsavel: string | null
  auxiliar: string | null
  nome_usuario: string | null
  created_at: string
}

interface CompraDetalhes {
  origemLocalizacao?: string | null
  categoria?: string | null
  raca?: string | null
  jejumHoras?: number | null
  tipoPesagem?: string | null
  valorKg?: number | null
  pesoMedioUa?: number | null
  valorUa?: number | null
  favorecido?: { nome?: string | null; cpfCnpj?: string | null; banco?: string | null; pixConta?: string | null } | null
  transporte?: {
    transportadora?: string | null
    motorista?: string | null
    tipoVeiculo?: string | null
    placaVeiculo?: string | null
    placaReboque?: string | null
    distanciaKm?: number | null
  } | null
  corretor?: { nome?: string | null; comissao?: number | null; dadosBancarios?: string | null } | null
  historicoNutricional?: string | null
  despesas?: string | null
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
  // Compra
  origem_municipio_uf: string | null
  modo_preco: 'por_kg' | 'por_ua' | null
  valor_total_previsto: number | null
  forma_pagamento: string | null
  data_saida: string | null
  valor_frete: number | null
  mortes_transporte: number | null
  divergencia_obs: string | null
  compra_detalhes: CompraDetalhes | null
}

const fmtBRL = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '-'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_DOC_LABEL: Record<string, string> = {
  romaneio: 'Romaneio',
  acerto: 'Acerto',
  gta: 'GTA',
  nota_fiscal: 'Nota Fiscal',
  laudo: 'Laudo',
  video: 'Vídeo (descarregamento)',
  outro: 'Outro',
}

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  ted: 'TED',
  dinheiro: 'Dinheiro',
}

export function OrdemServicoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [os, setOs] = useState<OrdemServicoFull | null>(null)
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoOs[]>([])
  const [recebimentos, setRecebimentos] = useState<OsRecebimento[]>([])
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
    const osData = data as OrdemServicoFull
    setOs(osData)

    const [movRes, pesRes, docs, recRes] = await Promise.all([
      supabase
        .from('registros_movimentacao')
        .select('id, data, lote_origem, categoria, sexo, numero_cabecas, peso_vivo_atual_kg, observacao, os_recebimento_id')
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
      osData.tipo === 'compra'
        ? supabase
            .from('os_recebimentos')
            .select('*')
            .eq('os_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
    ])

    setMovimentacoes((movRes.data as MovimentacaoOs[]) || [])
    setTotalPesados(pesRes.count ?? 0)
    setDocumentos(docs)
    setRecebimentos(((recRes as any).data as OsRecebimento[]) || [])
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
    const isCompraOs = os.tipo === 'compra'
    const valor = valorAcerto ? Number(valorAcerto.replace(',', '.')) : NaN
    if (!valorAcerto || isNaN(valor) || valor <= 0) {
      toast.error(isCompraOs ? 'Informe o valor pago ao fornecedor' : 'Informe o valor do acerto recebido')
      return
    }
    if (!dataCredito) {
      toast.error(isCompraOs ? 'Informe a data do pagamento' : 'Informe a data em que o valor caiu na conta')
      return
    }
    setAcaoEmAndamento(true)
    const { data, error } = await supabase.rpc('fechar_os_venda', {
      p_os_id: os.id,
      p_valor_acerto: valor,
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

  const isCompra = os?.tipo === 'compra'
  const podeEstornar =
    os?.status === 'embarcada' || os?.status === 'aguardando_pagamento' || os?.status === 'recebida'
  const podeFechar = podeEstornar
  const podeCancelar = os?.status === 'aberta' || os?.status === 'recebida'
  const podeUpload = os?.status !== 'fechada' && os?.status !== 'cancelada'

  const totalRecebido = recebimentos.reduce(
    (acc, r) =>
      acc + (r.contagens ?? []).reduce((a, c) => a + (c.femeas || 0) + (c.machos || 0), 0),
    0,
  )
  const totalMortes = recebimentos.reduce((acc, r) => acc + (r.mortes || 0), 0)
  const pesoOrigemTotal = recebimentos.reduce((acc, r) => acc + (r.peso_origem || 0), 0)
  const pesoChegadaTotal = recebimentos.reduce((acc, r) => {
    const cabecas = (r.contagens ?? []).reduce((a, c) => a + (c.femeas || 0) + (c.machos || 0), 0)
    return acc + (r.peso_medio_balancao || 0) * cabecas
  }, 0)
  const quebraTransporte =
    pesoOrigemTotal > 0 && pesoChegadaTotal > 0
      ? ((pesoOrigemTotal - pesoChegadaTotal) / pesoOrigemTotal) * 100
      : null

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
            <DetailSection title={isCompra ? 'Comunicado de Compra' : 'Comunicado de Venda'} highlighted>
              {isCompra ? (
                <CompraDetalhesView os={os!} fmtBRL={fmtBRL} />
              ) : (
                <>
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
                </>
              )}
              {os!.observacao && (
                <p className="text-sm text-content mt-4">
                  <span className="font-medium text-content-muted">Observação:</span> {os!.observacao}
                </p>
              )}
            </DetailSection>
          </Card>

          {/* Embarque (venda) / Recebimentos (compra) */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <DetailSection title={isCompra ? 'Recebimentos por Carga' : 'Embarque (Pesagem)'}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <DetailField label="Animais Pesados" value={totalPesados} />
                <DetailField
                  label={isCompra ? 'Cabeças Recebidas' : 'Cabeças Embarcadas'}
                  value={`${os!.quantidade_embarcada ?? 0} de ${os!.quantidade_prevista ?? '-'}`}
                />
                {isCompra && (
                  <DetailField label="Cargas Recebidas" value={recebimentos.length} />
                )}
              </div>

              {isCompra && (
                <>
                  {recebimentos.length === 0 ? (
                    <p className="text-sm text-content-muted mb-4">Nenhuma carga recebida ainda.</p>
                  ) : (
                    <div className="space-y-4 mb-4">
                      {recebimentos.map((r, i) => (
                        <RecebimentoCard key={r.id} r={r} index={i} documentos={documentos} />
                      ))}
                    </div>
                  )}

                  {/* Divergência previsto vs recebido */}
                  <DetailSection title="Divergência">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                      <DetailField
                        label="Previsto vs Recebido"
                        value={`${os!.quantidade_prevista ?? '-'} → ${totalRecebido}`}
                      />
                      <DetailField label="Mortes no Transporte" value={totalMortes} />
                      <DetailField
                        label="Quebra de Transporte"
                        value={quebraTransporte !== null ? `${quebraTransporte.toFixed(1)}%` : '-'}
                      />
                    </div>
                    {(pesoOrigemTotal > 0 || pesoChegadaTotal > 0) && (
                      <p className="text-xs text-content-muted mb-2">
                        Peso origem: {pesoOrigemTotal > 0 ? `${pesoOrigemTotal.toFixed(0)} kg` : '-'} ·
                        Peso chegada (balanção): {pesoChegadaTotal > 0 ? `${pesoChegadaTotal.toFixed(0)} kg` : '-'}
                      </p>
                    )}
                    {os!.divergencia_obs && (
                      <p className="text-sm text-content">
                        <span className="font-medium text-content-muted">Ocorrência:</span> {os!.divergencia_obs}
                      </p>
                    )}
                  </DetailSection>
                </>
              )}
              {movimentacoes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border-base">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Data</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">{isCompra ? 'Lote Destino' : 'Lote Origem'}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Categoria</th>
                        {isCompra && (
                          <th className="px-4 py-2 text-left text-xs font-medium text-content-muted uppercase">Sexo</th>
                        )}
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
                          {isCompra && (
                            <td className="px-4 py-2 text-sm text-content-strong">{m.sexo || '-'}</td>
                          )}
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
                <p className="text-sm text-content-muted">
                  {isCompra ? 'Nenhuma entrada registrada ainda.' : 'Nenhum embarque registrado ainda.'}
                </p>
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
                      options={isCompra
                        ? [
                            { value: 'gta', label: 'GTA' },
                            { value: 'nota_fiscal', label: 'Nota Fiscal' },
                            { value: 'laudo', label: 'Laudo' },
                            { value: 'acerto', label: 'Acerto' },
                            { value: 'outro', label: 'Outro' },
                          ]
                        : [
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
            <DetailSection title={isCompra ? 'Pagamento e Fechamento' : 'Acerto e Fechamento'}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label={isCompra ? 'Valor Pago' : 'Valor do Acerto'} value={fmtBRL(os!.valor_acerto)} />
                <DetailField label={isCompra ? 'Data do Pagamento' : 'Data do Crédito'} value={formatDate(os!.data_credito)} />
                {os!.status === 'fechada' && (
                  <DetailField label="Fechada em" value={formatDateTime(os!.closed_at)} />
                )}
              </div>
              {podeFechar && (
                <p className="text-xs text-content-muted mt-3">
                  {isCompra
                    ? 'A OS de compra só fecha com a GTA anexada e depois de confirmar o pagamento ao fornecedor.'
                    : 'A OS só deve ser fechada depois de confirmar que o valor do acerto caiu na conta da fazenda.'}
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
            {isCompra
              ? 'Confirme o pagamento ao fornecedor. A GTA do recebimento precisa estar anexada nos documentos.'
              : 'Confirme que o valor do acerto caiu na conta da fazenda antes de fechar.'}
          </p>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">{isCompra ? 'Valor Pago (R$)' : 'Valor do Acerto (R$)'}</label>
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
        message={isCompra
          ? 'As movimentações de entrada desta OS serão revertidas (cabeças saem dos lotes de destino) e os laudos de recebimento serão estornados. Deseja continuar?'
          : 'As movimentações de saída desta OS serão revertidas (cabeças voltam aos lotes) e os animais marcados como vendidos retornam ao status anterior. Deseja continuar?'}
        confirmText="Estornar"
        variant="warning"
      />
    </>
  )
}

function CompraDetalhesView({ os, fmtBRL: fmt }: { os: OrdemServicoFull; fmtBRL: typeof fmtBRL }) {
  const d = os.compra_detalhes || {}
  const transp = d.transporte || {}
  const fav = d.favorecido || {}
  const corr = d.corretor || {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DetailField label="Comprador" value={formatValue(os.comprador)} />
        <DetailField label="Empresa" value={formatValue(os.fornecedor)} />
        {os.origem_fazenda && <DetailField label="Fazenda de Origem" value={formatValue(os.origem_fazenda)} />}
        {os.origem_municipio_uf && <DetailField label="Município/UF" value={formatValue(os.origem_municipio_uf)} />}
        {d.origemLocalizacao && <DetailField label="Localização" value={d.origemLocalizacao} />}
        <DetailField label="Quantidade Prevista" value={formatValue(os.quantidade_prevista)} />
        <DetailField label="Sexo" value={formatValue(os.sexo)} />
        <DetailField label="Idade (Era)" value={formatValue(os.idade_era)} />
        {d.categoria && <DetailField label="Categoria" value={d.categoria} />}
        {d.raca && <DetailField label="Raça" value={d.raca} />}
        {d.jejumHoras != null && <DetailField label="Jejum" value={`${d.jejumHoras} h`} />}
        {d.tipoPesagem && (
          <DetailField label="Tipo de Pesagem" value={d.tipoPesagem === 'individual' ? 'Individual' : 'Coletivo (balanço)'} />
        )}
        {os.data_saida && <DetailField label="Embarque na Origem" value={formatDate(os.data_saida)} />}
        <DetailField label="Chegada na Fazenda" value={formatDate(os.data_prevista_embarque)} />
      </div>

      {(os.modo_preco || os.valor_total_previsto != null || os.forma_pagamento || os.data_prevista_pagamento || fav.nome) && (
      <div>
        <p className="text-xs font-semibold text-content-muted uppercase mb-2">Preço e Pagamento</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DetailField
            label="Modo de Preço"
            value={os.modo_preco === 'por_ua' ? 'Por UA' : os.modo_preco === 'por_kg' ? 'Por KG' : '-'}
          />
          {os.modo_preco === 'por_kg' && d.valorKg != null && (
            <DetailField label="Valor/KG" value={fmt(d.valorKg)} />
          )}
          {os.modo_preco === 'por_ua' && (
            <>
              {d.pesoMedioUa != null && <DetailField label="Peso Médio (UA)" value={`${d.pesoMedioUa} kg`} />}
              {d.valorUa != null && <DetailField label="Valor/UA" value={fmt(d.valorUa)} />}
            </>
          )}
          <DetailField label="Valor Total Previsto" value={fmt(os.valor_total_previsto)} />
          <DetailField label="Forma de Pagamento" value={FORMA_PAGAMENTO_LABEL[os.forma_pagamento || ''] || formatValue(os.forma_pagamento)} />
          <DetailField label="Pagamento Previsto" value={formatDate(os.data_prevista_pagamento)} />
          {fav.nome && <DetailField label="Favorecido" value={fav.nome} />}
          {fav.cpfCnpj && <DetailField label="CPF/CNPJ" value={fav.cpfCnpj} />}
          {fav.pixConta && <DetailField label="Conta/Chave PIX" value={fav.pixConta} />}
          {fav.banco && <DetailField label="Banco" value={fav.banco} />}
        </div>
      </div>
      )}

      {(transp.transportadora || transp.motorista || os.valor_frete != null) && (
        <div>
          <p className="text-xs font-semibold text-content-muted uppercase mb-2">Transporte</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {transp.transportadora && <DetailField label="Transportadora" value={transp.transportadora} />}
            {transp.motorista && <DetailField label="Motorista" value={transp.motorista} />}
            {transp.tipoVeiculo && <DetailField label="Tipo de Veículo" value={transp.tipoVeiculo} />}
            {transp.placaVeiculo && <DetailField label="Placa" value={transp.placaVeiculo} />}
            {transp.placaReboque && <DetailField label="Placa Reboque" value={transp.placaReboque} />}
            {transp.distanciaKm != null && <DetailField label="Distância" value={`${transp.distanciaKm} km`} />}
            <DetailField label="Valor do Frete" value={fmt(os.valor_frete)} />
          </div>
        </div>
      )}

      {corr.nome && (
        <div>
          <p className="text-xs font-semibold text-content-muted uppercase mb-2">Corretagem</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailField label="Corretor" value={corr.nome} />
            {corr.comissao != null && <DetailField label="Comissão" value={`${corr.comissao}%`} />}
            {corr.dadosBancarios && <DetailField label="Dados Bancários" value={corr.dadosBancarios} />}
          </div>
        </div>
      )}

      {d.historicoNutricional && (
        <p className="text-sm text-content">
          <span className="font-medium text-content-muted">Histórico Nutricional:</span> {d.historicoNutricional}
        </p>
      )}
      {d.despesas && (
        <p className="text-sm text-content">
          <span className="font-medium text-content-muted">Despesas:</span> {d.despesas}
        </p>
      )}
    </div>
  )
}

function RecebimentoCard({
  r,
  index,
  documentos,
}: {
  r: OsRecebimento
  index: number
  documentos: OsDocumentoComUrl[]
}) {
  const [checklistAberto, setChecklistAberto] = useState(false)
  const totalCabecas = (r.contagens ?? []).reduce((a, c) => a + (c.femeas || 0) + (c.machos || 0), 0)
  const checklistSim = (r.checklist ?? []).filter((c) => c.resposta === 'S')
  const video = documentos.find((d) => d.os_recebimento_id === r.id && d.tipo === 'video')

  return (
    <div className="border border-border-base rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-content-strong">
          Carga {index + 1}{r.numero_gta ? ` · GTA ${r.numero_gta}` : ''}
        </p>
        <span className="text-xs text-content-muted">
          {formatDate(r.data_chegada)}{r.hora_chegada ? ` ${r.hora_chegada}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DetailField label="Nº NF" value={formatValue(r.numero_nf)} />
        <DetailField label="Doc. Origem" value={formatValue(r.doc_origem)} />
        <DetailField label="Transportadora" value={formatValue(r.transportadora)} />
        <DetailField
          label="Placas"
          value={[r.placa_veiculo, r.placa_reboque].filter(Boolean).join(' / ') || '-'}
        />
        <DetailField label="Motorista" value={formatValue(r.motorista)} />
        <DetailField label="Cabeças" value={totalCabecas || '-'} />
        <DetailField
          label="Peso Médio Balanço"
          value={r.peso_medio_balancao != null ? `${r.peso_medio_balancao} kg/cab` : '-'}
        />
        <DetailField
          label="Peso Origem"
          value={r.peso_origem != null ? `${r.peso_origem} kg` : '-'}
        />
        <DetailField label="Mortes" value={r.mortes ?? 0} />
        <DetailField label="Destino" value={r.destino === 'baia' ? 'Baia' : r.destino === 'pasto' ? 'Pasto' : formatValue(r.destino)} />
        <DetailField label="Lote" value={formatValue(r.lote_destino)} />
        {r.score_corporal != null && <DetailField label="Score Corporal" value={r.score_corporal} />}
        <DetailField label="Responsável" value={formatValue(r.responsavel || r.nome_usuario)} />
        {r.auxiliar && <DetailField label="Auxiliar" value={r.auxiliar} />}
      </div>

      {(r.contagens ?? []).length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-border-base">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-content-muted uppercase">Categoria</th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-content-muted uppercase">Fêmeas</th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-content-muted uppercase">Machos</th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-content-muted uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {(r.contagens ?? []).map((c, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-sm text-content-strong">{c.categoria}</td>
                  <td className="px-3 py-1.5 text-sm text-content-strong">{c.femeas || 0}</td>
                  <td className="px-3 py-1.5 text-sm text-content-strong">{c.machos || 0}</td>
                  <td className="px-3 py-1.5 text-sm text-content-strong">{(c.femeas || 0) + (c.machos || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {video?.signedUrl && (
        <div className="mt-3">
          <video src={video.signedUrl} controls preload="metadata" className="max-h-64 rounded-lg" />
        </div>
      )}

      {(r.checklist ?? []).length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setChecklistAberto((v) => !v)}
            className="text-sm text-primary hover:underline"
          >
            {checklistAberto ? 'Ocultar' : 'Ver'} checklist diagnóstico ({checklistSim.length} item(s) com "Sim")
          </button>
          {checklistAberto && (
            <ul className="mt-2 space-y-1">
              {(r.checklist ?? []).map((c, i) => (
                <li key={i} className="text-sm text-content flex gap-2">
                  <span className={`font-semibold ${c.resposta === 'S' ? 'text-amber-700' : 'text-green-700'}`}>
                    {c.resposta === 'S' ? 'SIM' : 'NÃO'}
                  </span>
                  <span>{c.item}{c.observacao ? ` — ${c.observacao}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
