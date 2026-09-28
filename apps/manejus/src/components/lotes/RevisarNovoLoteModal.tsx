import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui'
import { supabase } from '../../services/supabaseClient'
import { usaCurral } from '../../utils/lotes'

interface CategoriaSnapshot {
  categoria: string
  numero_cabecas: number
  quant_inicial: number
  quant_atual: number
  data_pesagem: string
  raca?: string | null
  sexo?: string | null
  idade?: number | null
  peso_entrada_kg_cab?: number | null
  peso_entrada_arrobas?: number | null
  peso_vivo_atual_kg_cab?: number | null
  peso_vivo_meta_kg_cab?: number | null
  peso_vivo_atual_arroba_cab?: number | null
  rc_inicial?: number | null
  rc_final?: number | null
  rc_atual?: number | null
  periodo?: number | null
  dias_restantes_meta?: number | null
  data_meta_projetada?: string | null
  estrategia_nutricional?: string | null
  qtd_bezerros?: number | null
  consumo_meta_porcentagem_pesovivo?: number | null
  peso_venda_meta_arroba?: number | null
  margem_lucro_percent?: number | null
  preco_custo_reais_arroba?: number | null
  preco_custo_cab?: number | null
  preco_venda_projetado_reais_arroba?: number | null
  preco_venda_sugerido_cab?: number | null
  producao_atual_arroba_cab?: number | null
  producao_projetada_arroba_cab?: number | null
  preco_entrada_reais_arroba?: number | null
  faturamento_projetado_reais_lote_categoria?: number | null
  venda_total_arroba_lote_categoria?: number | null
  agio_percent?: number | null
  custo_frete_reais_cab?: number | null
  custo_comissao_reais_cab?: number | null
  custo_sanidade_reais_cab?: number | null
  custo_identificacao_rastreabilidade_reais_cab?: number | null
  custo_total_entrada_reais_cab?: number | null
  custo_total_entrada_reais_lote?: number | null
  preco_entrada_reais_kg?: number | null
  preco_entrada_reais_cab?: number | null
  custo_operacional_reais_cab_dia?: number | null
}

interface SolicitacaoNovoLote {
  id: string
  fazenda_id: string
  lote_origem_id: string
  lote_origem_nome: string
  dados_lote_proposto: any
  categorias: CategoriaSnapshot[]
  dados_movimentacao: any
  status: string
  created_at: string
  motivo_rejeicao?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  solicitacao: SolicitacaoNovoLote | null
  pastos: { id: string; nome: string }[]
  currais: { id: string; nome: string }[]
  usuarioId: string
  onAprovado: () => void
  onRejeitado: () => void
}

const SISTEMA_PRODUCAO_OPTS = [
  'Cria', 'Confinamento', 'Engorda', 'Recria', 'RIP', 'Sequestro', 'TIP',
]

const DESTINO_OPTS = [
  { value: 'corte', label: 'Abate' },
  { value: 'reprodução', label: 'Reprodução' },
  { value: 'enfermaria', label: 'Enfermaria' },
]

// Campos editáveis da categoria (excluindo gmd), agrupados por seção
const SECOES_CATEGORIA: {
  titulo: string
  classes: { box: string; title: string }
  campos: { key: keyof CategoriaSnapshot; label: string; type: 'text' | 'number' | 'date' }[]
}[] = [
  {
    titulo: 'Entrada & Pesagem',
    classes: { box: 'bg-primary/10 border-primary/30', title: 'text-primary dark:text-primary-light' },
    campos: [
      { key: 'data_pesagem', label: 'Data Entrada', type: 'date' },
      { key: 'peso_entrada_kg_cab', label: 'Peso Entrada (kg/cab)', type: 'number' },
      { key: 'peso_vivo_atual_kg_cab', label: 'Peso Vivo Atual (kg/cab)', type: 'number' },
    ],
  },
  {
    titulo: 'Preços & Venda',
    classes: { box: 'bg-amber-500/10 border-amber-500/30', title: 'text-amber-700 dark:text-amber-300' },
    campos: [
      { key: 'preco_entrada_reais_kg', label: 'Preço Entrada (R$/kg)', type: 'number' },
      { key: 'preco_entrada_reais_cab', label: 'Preço Entrada (R$/cab)', type: 'number' },
      { key: 'preco_entrada_reais_arroba', label: 'Preço Entrada (R$/@)', type: 'number' },
      { key: 'preco_custo_reais_arroba', label: 'Preço Custo (R$/@)', type: 'number' },
      { key: 'preco_custo_cab', label: 'Preço Custo (R$/cab)', type: 'number' },
      { key: 'preco_venda_projetado_reais_arroba', label: 'Preço Venda Projetado (R$/@)', type: 'number' },
      { key: 'preco_venda_sugerido_cab', label: 'Preço Venda Sugerido (R$/cab)', type: 'number' },
      { key: 'margem_lucro_percent', label: 'Margem Lucro (%)', type: 'number' },
      { key: 'faturamento_projetado_reais_lote_categoria', label: 'Faturamento Projetado (R$)', type: 'number' },
      { key: 'venda_total_arroba_lote_categoria', label: 'Venda Total (@)', type: 'number' },
      { key: 'agio_percent', label: 'Ágio (%)', type: 'number' },
    ],
  },
  {
    titulo: 'Custos',
    classes: { box: 'bg-red-500/10 border-red-500/30', title: 'text-red-700 dark:text-red-300' },
    campos: [
      { key: 'custo_frete_reais_cab', label: 'Custo Frete (R$/cab)', type: 'number' },
      { key: 'custo_comissao_reais_cab', label: 'Custo Comissão (R$/cab)', type: 'number' },
      { key: 'custo_sanidade_reais_cab', label: 'Custo Sanidade (R$/cab)', type: 'number' },
      { key: 'custo_identificacao_rastreabilidade_reais_cab', label: 'Custo Identificação (R$/cab)', type: 'number' },
      { key: 'custo_total_entrada_reais_cab', label: 'Custo Total Entrada (R$/cab)', type: 'number' },
      { key: 'custo_total_entrada_reais_lote', label: 'Custo Total Entrada (R$/lote)', type: 'number' },
      { key: 'custo_operacional_reais_cab_dia', label: 'Custo Operacional (R$/cab/dia)', type: 'number' },
    ],
  },
]

export function RevisarNovoLoteModal({
  isOpen,
  onClose,
  solicitacao,
  pastos,
  currais,
  usuarioId,
  onAprovado,
  onRejeitado,
}: Props) {
  const [dadosLote, setDadosLote] = useState<any>({})
  const [categorias, setCategorias] = useState<CategoriaSnapshot[]>([])
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [motivoRejeicao, setMotivoRejeicao] = useState('')

  useEffect(() => {
    if (solicitacao) {
      const dadosPropostos = typeof solicitacao.dados_lote_proposto === 'string'
        ? JSON.parse(solicitacao.dados_lote_proposto)
        : solicitacao.dados_lote_proposto
      const cats = typeof solicitacao.categorias === 'string'
        ? JSON.parse(solicitacao.categorias)
        : solicitacao.categorias
      setDadosLote({ ...dadosPropostos })
      setCategorias([...cats])
      setError(null)
      setShowRejectInput(false)
      setMotivoRejeicao('')
    }
  }, [solicitacao])

  if (!solicitacao) return null

  const isConfinamento = usaCurral(dadosLote.sistema_producao)

  const handleAprovar = async () => {
    if (!solicitacao) return
    setProcessing(true)
    setError(null)
    try {
      // Validar campos obrigatórios
      if (!dadosLote.nome?.trim()) {
        setError('Nome do lote é obrigatório')
        setProcessing(false)
        return
      }
      if (!dadosLote.sistema_producao) {
        setError('Sistema de produção é obrigatório')
        setProcessing(false)
        return
      }
      if (!dadosLote.destino) {
        setError('Destino é obrigatório')
        setProcessing(false)
        return
      }
      if (isConfinamento && !dadosLote.curral_id) {
        setError('Curral é obrigatório para confinamento')
        setProcessing(false)
        return
      }
      if (!isConfinamento && !dadosLote.pasto_id) {
        setError('Pasto é obrigatório para não-confinamento')
        setProcessing(false)
        return
      }

      const { data, error: rpcError } = await supabase.rpc('aprovar_solicitacao_novo_lote', {
        p_solicitacao_id: solicitacao.id,
        p_dados_lote_editado: dadosLote,
        p_categorias_editadas: categorias,
        p_usuario_id: usuarioId,
      })

      if (rpcError) throw rpcError
      if (data && data.success === false) {
        throw new Error(data.error || 'Erro ao aprovar solicitação')
      }

      onAprovado()
      onClose()
    } catch (err: any) {
      console.error('[RevisarNovoLoteModal] Erro ao aprovar:', err)
      setError(err?.message || 'Erro ao aprovar solicitação')
    } finally {
      setProcessing(false)
    }
  }

  const handleRejeitar = async () => {
    if (!solicitacao) return
    setProcessing(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('rejeitar_solicitacao_novo_lote', {
        p_solicitacao_id: solicitacao.id,
        p_motivo: motivoRejeicao || null,
        p_usuario_id: usuarioId,
      })

      if (rpcError) throw rpcError
      if (data && data.success === false) {
        throw new Error(data.error || 'Erro ao rejeitar solicitação')
      }

      onRejeitado()
      onClose()
    } catch (err: any) {
      console.error('[RevisarNovoLoteModal] Erro ao rejeitar:', err)
      setError(err?.message || 'Erro ao rejeitar solicitação')
    } finally {
      setProcessing(false)
    }
  }

  const updateCategoria = (index: number, key: keyof CategoriaSnapshot, value: any) => {
    setCategorias(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      // Sincronizar quant_inicial e quant_atual com numero_cabecas
      if (key === 'numero_cabecas') {
        next[index].quant_inicial = value
        next[index].quant_atual = value
      }
      return next
    })
  }

  const totalCabecas = categorias.reduce((sum, c) => sum + (Number(c.numero_cabecas) || 0), 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Revisar Solicitação de Novo Lote" size="xl">
      <div className="space-y-6">
        {/* Informações da movimentação */}
        <div className="bg-surface-2 rounded-lg p-4 border border-border-base">
          <h3 className="text-sm font-bold text-content mb-3">Informações da Movimentação</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-semibold text-content-muted">Data:</span>{' '}
              {solicitacao.dados_movimentacao?.data || '—'}
            </div>
            <div>
              <span className="font-semibold text-content-muted">Usuário:</span>{' '}
              {solicitacao.dados_movimentacao?.usuario || '—'}
            </div>
            <div>
              <span className="font-semibold text-content-muted">Lote Origem:</span>{' '}
              {solicitacao.lote_origem_nome}
            </div>
            <div>
              <span className="font-semibold text-content-muted">Motivo:</span>{' '}
              {solicitacao.dados_movimentacao?.motivo} / {solicitacao.dados_movimentacao?.subtipo}
            </div>
            {(solicitacao.dados_movimentacao?.observacao || solicitacao.dados_movimentacao?.causa_observacao) && (
              <div className="col-span-2">
                <span className="font-semibold text-content-muted">Observação:</span>{' '}
                {solicitacao.dados_movimentacao.observacao || solicitacao.dados_movimentacao.causa_observacao}
              </div>
            )}
            <div className="col-span-2">
              <span className="font-semibold text-content-muted">Total de Cabeças:</span>{' '}
              <span className="font-bold text-primary dark:text-primary-light">{totalCabecas}</span>
            </div>
            <div className="col-span-2">
              <span className="font-semibold text-content-muted">Categorias Movimentadas:</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {categorias.map((cat, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary dark:text-primary-light text-xs font-semibold px-2 py-1 rounded-full"
                  >
                    {cat.categoria.charAt(0).toUpperCase() + cat.categoria.slice(1)} ({cat.numero_cabecas} cab.)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dados do lote (editáveis) */}
        <div className="bg-primary/10 rounded-lg p-4 border border-primary/30">
          <h3 className="text-sm font-bold text-primary dark:text-primary-light mb-3">Dados do Novo Lote</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-content mb-1">NOME DO LOTE *</label>
              <input
                type="text"
                value={dadosLote.nome || ''}
                onChange={(e) => setDadosLote({ ...dadosLote, nome: e.target.value })}
                className="w-full px-3 py-2 border border-surface-3 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-content mb-1">SISTEMA DE PRODUÇÃO *</label>
              <select
                value={dadosLote.sistema_producao || ''}
                onChange={(e) => {
                  const novoSistema = e.target.value
                  setDadosLote({
                    ...dadosLote,
                    sistema_producao: novoSistema,
                    pasto_id: usaCurral(novoSistema) ? '' : dadosLote.pasto_id,
                    curral_id: usaCurral(novoSistema) ? dadosLote.curral_id : '',
                  })
                }}
                className="w-full px-3 py-2 border border-surface-3 rounded-md text-sm"
              >
                <option value="">Selecione</option>
                {SISTEMA_PRODUCAO_OPTS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-content mb-1">DESTINO *</label>
              <select
                value={dadosLote.destino || ''}
                onChange={(e) => setDadosLote({ ...dadosLote, destino: e.target.value })}
                className="w-full px-3 py-2 border border-surface-3 rounded-md text-sm"
              >
                <option value="">Selecione</option>
                {DESTINO_OPTS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-content mb-1">
                {isConfinamento ? 'CURRAL *' : 'PASTO *'}
              </label>
              {isConfinamento ? (
                <select
                  value={dadosLote.curral_id || ''}
                  onChange={(e) => setDadosLote({ ...dadosLote, curral_id: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md text-sm"
                >
                  <option value="">Selecione</option>
                  {currais.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={dadosLote.pasto_id || ''}
                  onChange={(e) => setDadosLote({ ...dadosLote, pasto_id: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md text-sm"
                >
                  <option value="">Selecione</option>
                  {pastos.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Categorias (editáveis, sem gmd) */}
        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-300 mb-3">
            Categorias ({categorias.length})
          </h3>
          <div className="space-y-4">
            {categorias.map((cat, idx) => (
              <div key={idx} className="bg-surface-1 rounded-lg p-3 border border-border-base">
                <h4 className="text-sm font-bold text-content-strong mb-3">
                  Categoria {idx + 1}: {cat.categoria} — {cat.numero_cabecas} cabeças
                </h4>
                <div className="space-y-3">
                  {SECOES_CATEGORIA.map((secao) => (
                    <div key={secao.titulo} className={`rounded-lg p-3 border ${secao.classes.box}`}>
                      <h5 className={`text-xs font-bold mb-2 uppercase tracking-wide ${secao.classes.title}`}>
                        {secao.titulo}
                      </h5>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {secao.campos.map(({ key, label, type }) => (
                          <div key={String(key)}>
                            <label className="block text-xs font-medium text-content-muted mb-0.5">{label}</label>
                            <input
                              type={type}
                              value={(cat[key] as any) ?? ''}
                              onChange={(e) => {
                                const val = type === 'number'
                                  ? (e.target.value === '' ? null : Number(e.target.value))
                                  : e.target.value
                                updateCategoria(idx, key, val)
                              }}
                              className="w-full px-2 py-1 border border-surface-3 rounded text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Rejeição com motivo */}
        {showRejectInput && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <label className="block text-sm font-bold text-red-700 dark:text-red-300 mb-2">
              Motivo da Rejeição (opcional)
            </label>
            <textarea
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da rejeição, se desejar..."
              className="w-full px-3 py-2 border border-red-500/30 rounded-md text-sm"
            />
            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleRejeitar}
                variant="primary"
                size="sm"
                disabled={processing}
              >
                {processing ? 'CONFIRMANDO...' : 'CONFIRMAR REJEIÇÃO'}
              </Button>
              <Button
                onClick={() => setShowRejectInput(false)}
                variant="secondary"
                size="sm"
                disabled={processing}
              >
                CANCELAR
              </Button>
            </div>
          </div>
        )}

        {/* Ações */}
        {!showRejectInput && (
          <div className="flex gap-3 justify-end">
            <Button
              onClick={() => setShowRejectInput(true)}
              variant="secondary"
              size="md"
              disabled={processing}
              className="text-red-500 border-red-500/30 hover:bg-red-500/10"
            >
              REJEITAR
            </Button>
            <Button
              onClick={handleAprovar}
              variant="primary"
              size="md"
              disabled={processing}
            >
              {processing ? 'APROVANDO...' : 'APROVAR E CRIAR LOTE'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
