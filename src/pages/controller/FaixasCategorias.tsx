import { Fragment, useEffect, useState, useCallback } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, ConfirmModal, Modal, EmptyState, PageSkeleton } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { exportToXLSXMultiSheet, type ColumnConfig } from '../../utils/exportXLSX'

interface FaixaCategoria {
  id: string
  fazenda_id: string
  nome: string
  sexo: 'M' | 'F'
  peso_min: number
  peso_max: number
  ordem: number
  cor: string | null
  ativo: boolean
  destino: string | null
}

interface LoteCategoriaCronologia {
  id: string
  lote_id: string
  categoria: string
  sexo: string | null
  quant_atual: number | null
  peso_vivo_atual_kg_cab: number | null
  peso_entrada_kg_cab: number | null
  data_pesagem: string | null
  data_fim: string | null
  ativo: boolean
  categoria_origem_id: string | null
  created_at?: string | null
  lote_nome?: string
  lote_destino?: string | null
}

interface FormulacaoOpcao {
  id: string
  nome: string
  categoria: string | null
}

interface SnapshotPlanoNutricional {
  id?: string
  nome?: string | null
  formulacao_id?: string | null
  peso_inicio_kg_cab?: number | null
  peso_meta_kg?: number | null
  gmd_planejado?: number | null
  ordem?: number | null
  data_inicio?: string | null
  data_fim?: string | null
  ativo?: boolean | null
}

interface SnapshotLoteCategoria {
  id?: string
  categoria?: string | null
  sexo?: string | null
  raca?: string | null
  idade?: number | null
  quant_atual?: number | null
  quant_inicial?: number | null
  peso_vivo_atual_kg_cab?: number | null
  peso_entrada_kg_cab?: number | null
  gmd?: number | null
  rc_atual?: number | null
  rc_inicial?: number | null
  rc_final?: number | null
  formulacao_id?: string | null
  estrategia_nutricional?: string | null
  consumo?: number | null
  consumo_meta_porcentagem_pesovivo?: number | null
  abate?: number | null
  morte?: number | null
  transf_entrada?: number | null
  transf_saida?: number | null
  periodo?: number | null
  data_pesagem?: string | null
  data_meta_projetada?: string | null
  dias_restantes_meta?: number | null
  peso_vivo_meta_kg_cab?: number | null
  custo_operacional_reais_cab_dia?: number | null
  preco_custo_cab?: number | null
  preco_custo_reais_arroba?: number | null
}

interface SnapshotLote {
  nome?: string | null
  n_cabecas?: number | null
  categorias?: string | null
  sexo?: string | null
  raca?: string | null
  idade_meses?: number | null
  idade?: number | null
  sistema_producao?: string | null
  destino?: string | null
  peso_vivo_kg?: number | null
  peso_entrada_kg_cab?: number | null
  peso_vivo_meta_kg?: number | null
  gmd?: string | null
  periodo?: number | null
  dias_restantes_meta?: number | null
  data_pesagem?: string | null
  data_meta?: string | null
  estrategia_nutricional?: string | null
  rc_inicial?: number | null
  preco_kg?: number | null
  preco_cab?: number | null
  custo_operacional_reais_cab_dia?: number | null
  ativo?: boolean | null
  pasto_id?: string | null
  produtor_rural?: string | null
  propriedade_origem?: string | null
  numero_contrato?: string | null
  mes_competencia?: string | null
}

interface SnapshotPerformancePlano {
  duracao_dias?: number | null
  ganho_peso_total_kg_cab?: number | null
  gmd_realizado?: number | null
  gmd_planejado?: number | null
  producao_arroba_lote?: number | null
  mortalidade_percent?: number | null
  motivo_migracao?: string | null
  tipo_snapshot?: string | null
  plano_anterior_id?: string | null
  plano_posterior_id?: string | null
}

interface SnapshotMetricasPlano {
  custo_operacional_total_cab?: number | null
  custo_total_producao_cab?: number | null
  progresso_meta_percent?: number | null
  ganho_arroba_cab?: number | null
  peso_vivo_medio_lote?: number | null
  peso_inicial_kg_cab?: number | null
  rc_inicio?: number | null
  rc_atual?: number | null
  quant_inicial?: number | null
  quant_atual?: number | null
  morte?: number | null
  data_pesagem?: string | null
  data_meta_projetada?: string | null
  dias_restantes_meta?: number | null
}

interface SnapshotTransicao {
  manter_formulacao?: boolean | null
  nova_formulacao_id?: string | null
  lote_categoria_origem?: SnapshotLoteCategoria | null
  lote_origem?: SnapshotLote | null
  plano_nutricional_origem?: SnapshotPlanoNutricional | null
  metricas_plano_nutricional?: SnapshotMetricasPlano | null
  performance_plano_nutricional?: SnapshotPerformancePlano | null
}

interface TransicaoHistorico {
  id: string
  categoria_origem: string
  categoria_destino: string
  peso_na_transicao_kg: number | null
  data_transicao: string
  motivo: string
  snapshot_jsonb?: SnapshotTransicao | null
}

const SEXO_LABEL: Record<string, string> = { M: 'Machos', F: 'Fêmeas' }

const capitalizeCategoria = (s: string) =>
  s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

function Campo({ label, valor }: { label: string; valor: unknown }) {
  const v = valor === null || valor === undefined || valor === '' ? '—' : String(valor)
  return (
    <div className="flex gap-1">
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-800">{v}</span>
    </div>
  )
}

export function FaixasCategorias() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [faixas, setFaixas] = useState<FaixaCategoria[]>([])
  const [loadingFaixas, setLoadingFaixas] = useState(true)
  const [savingAll, setSavingAll] = useState(false)
  const [sexoFiltro, setSexoFiltro] = useState<'M' | 'F'>('M')
  const [destinoFiltro, setDestinoFiltro] = useState<'corte' | 'reprodução' | 'enfermaria'>('corte')

  // Cronologia dos lotes
  const [lotesCategorias, setLotesCategorias] = useState<LoteCategoriaCronologia[]>([])
  const [loadingCronologia, setLoadingCronologia] = useState(true)
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<string | null>(null)
  const [transicoes, setTransicoes] = useState<TransicaoHistorico[]>([])
  const [transicaoExpandidaId, setTransicaoExpandidaId] = useState<string | null>(null)
  const [formulacoesMap, setFormulacoesMap] = useState<Record<string, { nome: string; consumo_ms_percent_pv: number | null }>>({})
  const [formulacaoLoteId, setFormulacaoLoteId] = useState<string | null>(null)
  const [categoriasFormulacaoLote, setCategoriasFormulacaoLote] = useState<string[]>([])
  const [totalCategoriasAtivasLote, setTotalCategoriasAtivasLote] = useState<number>(1)
  // Modal de recategorização
  const [recategorizando, setRecategorizando] = useState<LoteCategoriaCronologia | null>(null)
  const [novaCategoria, setNovaCategoria] = useState<string>('')
  const [manterFormulacao, setManterFormulacao] = useState<boolean>(true)
  const [formulacoesDisponiveis, setFormulacoesDisponiveis] = useState<FormulacaoOpcao[]>([])
  const [formulacaoSelecionada, setFormulacaoSelecionada] = useState<string>('')
  const [loadingFormulacoes, setLoadingFormulacoes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [erroRecategorizacao, setErroRecategorizacao] = useState<string | null>(null)
  const [sucessoRecategorizacao, setSucessoRecategorizacao] = useState<string | null>(null)

  // Modal de confirmação
  const [confirmRecategorizacao, setConfirmRecategorizacao] = useState(false)

  useEffect(() => {
    const loadFazenda = async () => {
      if (!user) return
      const fid = await getFazendaIdForUser(user.id)
      setFazendaId(fid)
      setLoadingFazenda(false)
    }
    loadFazenda()
  }, [user])

  const loadFormulacoesMap = useCallback(async () => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('formulacoes')
      .select('id, nome, consumo_ms_percent_pv')
      .eq('fazenda_id', fazendaId)
    if (error) {
      console.error('Erro ao carregar mapa de formulações:', error)
      setFormulacoesMap({})
    } else {
      const map: Record<string, { nome: string; consumo_ms_percent_pv: number | null }> = {}
      ;(data as { id: string; nome: string; consumo_ms_percent_pv: number | null }[] | null)?.forEach(f => {
        map[f.id] = { nome: f.nome, consumo_ms_percent_pv: f.consumo_ms_percent_pv }
      })
      setFormulacoesMap(map)
    }
  }, [fazendaId])

  const loadFaixas = useCallback(async () => {
    if (!fazendaId) return
    setLoadingFaixas(true)
    const { data, error } = await supabase
      .from('faixas_categorias')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('sexo', { ascending: true })
      .order('ordem', { ascending: true })
    if (error) {
      console.error('Erro ao carregar faixas:', error)
    } else {
      setFaixas(data as FaixaCategoria[])
    }
    setLoadingFaixas(false)
  }, [fazendaId])

  const loadCronologia = useCallback(async () => {
    if (!fazendaId) return
    setLoadingCronologia(true)
    // Buscar lotes da fazenda
    const { data: lotesData } = await supabase
      .from('lotes')
      .select('id, nome, destino')
      .eq('fazenda_id', fazendaId)
      .order('nome', { ascending: true })
    if (!lotesData || lotesData.length === 0) {
      setLotesCategorias([])
      setLoadingCronologia(false)
      return
    }
    const loteIds = lotesData.map(l => l.id)
    const loteMap = new Map(lotesData.map(l => [l.id, l]))

    // Buscar lote_categorias (ativas e encerradas) para reconstruir a cadeia
    const { data: catsData, error } = await supabase
      .from('lote_categorias')
      .select('*')
      .in('lote_id', loteIds)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Erro ao carregar cronologia:', error)
      setLotesCategorias([])
    } else {
      const enriquecidas: LoteCategoriaCronologia[] = (catsData || []).map(c => ({
        ...c,
        lote_nome: loteMap.get(c.lote_id)?.nome,
        lote_destino: loteMap.get(c.lote_id)?.destino ?? null,
      }))
      setLotesCategorias(enriquecidas)
    }
    setLoadingCronologia(false)
  }, [fazendaId])

  const loadTransicoes = useCallback(async () => {
    if (!fazendaId || !loteSelecionadoId) {
      setTransicoes([])
      return
    }
    const { data, error } = await supabase
      .from('lote_categorias_transicoes')
      .select('id, categoria_origem, categoria_destino, peso_na_transicao_kg, data_transicao, motivo, snapshot_jsonb')
      .eq('lote_id', loteSelecionadoId)
      .order('data_transicao', { ascending: false })
    if (error) {
      console.error('Erro ao carregar transições:', error)
      setTransicoes([])
    } else {
      setTransicoes(data as TransicaoHistorico[])
    }
  }, [fazendaId, loteSelecionadoId])

  useEffect(() => { if (fazendaId) loadFaixas() }, [fazendaId, loadFaixas])
  useEffect(() => { if (fazendaId) loadFormulacoesMap() }, [fazendaId, loadFormulacoesMap])
  useEffect(() => { if (fazendaId) loadCronologia() }, [fazendaId, loadCronologia])
  useEffect(() => { if (fazendaId && loteSelecionadoId) loadTransicoes() }, [fazendaId, loteSelecionadoId, loadTransicoes])

  const exportarTransicoes = () => {
    if (transicoes.length === 0) return
    const loteNome = lotesDisponiveis.find(l => l.id === loteEfetivoId)?.nome || 'lote'

    // Aba 1: Transições (dados da categoria + plano)
    const rowsTransicoes = transicoes.map(t => {
      const snap = t.snapshot_jsonb
      const lc = snap?.lote_categoria_origem
      const pn = snap?.plano_nutricional_origem
      return {
        data_transicao: t.data_transicao,
        categoria_origem: t.categoria_origem,
        categoria_destino: t.categoria_destino,
        peso_na_transicao_kg: t.peso_na_transicao_kg,
        motivo: t.motivo,
        sexo: lc?.sexo ?? '',
        raca: lc?.raca ?? '',
        idade: lc?.idade ?? '',
        quant_atual: lc?.quant_atual ?? '',
        peso_vivo_atual_kg_cab: lc?.peso_vivo_atual_kg_cab ?? '',
        peso_entrada_kg_cab: lc?.peso_entrada_kg_cab ?? '',
        gmd: lc?.gmd ?? '',
        rc_atual: lc?.rc_atual ?? '',
        rc_inicial: lc?.rc_inicial ?? '',
        formulacao_nome: lc?.formulacao_id ? (formulacoesMap[lc.formulacao_id]?.nome ?? lc.formulacao_id) : '',
        estrategia_nutricional: lc?.estrategia_nutricional ?? '',
        consumo_meta_pct_pv: lc?.formulacao_id ? (formulacoesMap[lc.formulacao_id]?.consumo_ms_percent_pv ?? '') : '',
        abate: lc?.abate ?? '',
        morte: lc?.morte ?? '',
        transf_entrada: lc?.transf_entrada ?? '',
        transf_saida: lc?.transf_saida ?? '',
        data_pesagem: lc?.data_pesagem ?? '',
        data_meta_projetada: lc?.data_meta_projetada ?? '',
        dias_restantes_meta: lc?.dias_restantes_meta ?? '',
        peso_vivo_meta_kg_cab: lc?.peso_vivo_meta_kg_cab ?? '',
        custo_operacional_reais_cab_dia: lc?.custo_operacional_reais_cab_dia ?? '',
        plano_nutricional: pn?.nome ?? '(sem plano ativo)',
        plano_formulacao_nome: pn?.formulacao_id ? (formulacoesMap[pn.formulacao_id]?.nome ?? pn.formulacao_id) : '',
        plano_peso_inicio_kg_cab: pn?.peso_inicio_kg_cab ?? '',
        plano_peso_meta_kg: pn?.peso_meta_kg ?? '',
        plano_gmd_planejado: pn?.gmd_planejado ?? '',
        plano_data_inicio: pn?.data_inicio ?? '',
        plano_data_fim: pn?.data_fim ?? '',
        // Métricas de performance do plano encerrado (capturadas pelo encerrar_plano_nutricional)
        plano_duracao_dias: snap?.performance_plano_nutricional?.duracao_dias ?? '',
        plano_ganho_peso_total_kg_cab: snap?.performance_plano_nutricional?.ganho_peso_total_kg_cab ?? '',
        plano_gmd_realizado: snap?.performance_plano_nutricional?.gmd_realizado ?? '',
        plano_mortalidade_percent: snap?.performance_plano_nutricional?.mortalidade_percent ?? '',
        plano_producao_arroba_lote: snap?.performance_plano_nutricional?.producao_arroba_lote ?? '',
        // Métricas derivadas calculadas no encerramento
        metrica_progresso_meta_percent: snap?.metricas_plano_nutricional?.progresso_meta_percent ?? '',
        metrica_ganho_arroba_cab: snap?.metricas_plano_nutricional?.ganho_arroba_cab ?? '',
        metrica_custo_operacional_total_cab: snap?.metricas_plano_nutricional?.custo_operacional_total_cab ?? '',
        metrica_custo_total_producao_cab: snap?.metricas_plano_nutricional?.custo_total_producao_cab ?? '',
        manter_formulacao: snap?.manter_formulacao ?? '',
        nova_formulacao_nome: snap?.nova_formulacao_id ? (formulacoesMap[snap.nova_formulacao_id]?.nome ?? snap.nova_formulacao_id) : '',
      }
    })

    const colunasTransicoes: ColumnConfig[] = [
      { source: 'data_transicao', header: 'Data', format: 'datetime' },
      { source: 'categoria_origem', header: 'Categoria origem' },
      { source: 'categoria_destino', header: 'Categoria destino' },
      { source: 'peso_na_transicao_kg', header: 'Peso na transição (kg)', format: 'number' },
      { source: 'motivo', header: 'Motivo' },
      { source: 'sexo', header: 'Sexo' },
      { source: 'raca', header: 'Raça' },
      { source: 'idade', header: 'Idade (meses)', format: 'number' },
      { source: 'quant_atual', header: 'Cabeças', format: 'number' },
      { source: 'peso_vivo_atual_kg_cab', header: 'Peso vivo atual (kg)', format: 'number' },
      { source: 'peso_entrada_kg_cab', header: 'Peso entrada (kg)', format: 'number' },
      { source: 'gmd', header: 'GMD (kg/dia)', format: 'number' },
      { source: 'rc_atual', header: 'RC atual', format: 'number' },
      { source: 'rc_inicial', header: 'RC inicial', format: 'number' },
      { source: 'formulacao_nome', header: 'Formulação' },
      { source: 'estrategia_nutricional', header: 'Estratégia nutricional' },
      { source: 'consumo_meta_pct_pv', header: 'Consumo meta (% PV)', format: 'number' },
      { source: 'abate', header: 'Abate', format: 'number' },
      { source: 'morte', header: 'Morte', format: 'number' },
      { source: 'transf_entrada', header: 'Transferência entrada', format: 'number' },
      { source: 'transf_saida', header: 'Transferência saída', format: 'number' },
      { source: 'data_pesagem', header: 'Data pesagem', format: 'date' },
      { source: 'data_meta_projetada', header: 'Data meta projetada', format: 'date' },
      { source: 'dias_restantes_meta', header: 'Dias restantes meta', format: 'number' },
      { source: 'peso_vivo_meta_kg_cab', header: 'Peso vivo meta (kg)', format: 'number' },
      { source: 'custo_operacional_reais_cab_dia', header: 'Custo operacional (R$/cab/dia)', format: 'number' },
      { source: 'plano_nutricional', header: 'Plano nutricional' },
      { source: 'plano_formulacao_nome', header: 'Plano - formulação' },
      { source: 'plano_peso_inicio_kg_cab', header: 'Plano - peso início (kg)', format: 'number' },
      { source: 'plano_peso_meta_kg', header: 'Plano - peso meta (kg)', format: 'number' },
      { source: 'plano_gmd_planejado', header: 'Plano - GMD planejado', format: 'number' },
      { source: 'plano_data_inicio', header: 'Plano - data início', format: 'date' },
      { source: 'plano_data_fim', header: 'Plano - data fim', format: 'date' },
      { source: 'plano_duracao_dias', header: 'Plano - duração (dias)', format: 'number' },
      { source: 'plano_ganho_peso_total_kg_cab', header: 'Plano - ganho peso total (kg/cab)', format: 'number' },
      { source: 'plano_gmd_realizado', header: 'Plano - GMD realizado', format: 'number' },
      { source: 'plano_mortalidade_percent', header: 'Plano - mortalidade (%)', format: 'number' },
      { source: 'plano_producao_arroba_lote', header: 'Plano - produção (@ lote)', format: 'number' },
      { source: 'metrica_progresso_meta_percent', header: 'Métrica - progresso meta (%)', format: 'number' },
      { source: 'metrica_ganho_arroba_cab', header: 'Métrica - ganho arroba (@/cab)', format: 'number' },
      { source: 'metrica_custo_operacional_total_cab', header: 'Métrica - custo operacional total (R$/cab)', format: 'number' },
      { source: 'metrica_custo_total_producao_cab', header: 'Métrica - custo total produção (R$/cab)', format: 'number' },
      { source: 'manter_formulacao', header: 'Manteve formulação', format: 'boolean' },
      { source: 'nova_formulacao_nome', header: 'Nova formulação' },
    ]

    // Aba 2: Lote (auditoria) - estado completo do lote no momento de cada transição
    // Pula transições antigas sem snapshot do lote (criadas antes da RPC ter o snapshot)
    const rowsLote = transicoes
      .filter(t => t.snapshot_jsonb?.lote_origem)
      .map(t => {
        const lote = t.snapshot_jsonb?.lote_origem
        return {
        data_transicao: t.data_transicao,
        categoria_origem: t.categoria_origem,
        categoria_destino: t.categoria_destino,
        lote_nome: lote?.nome ?? '',
        n_cabecas: lote?.n_cabecas ?? '',
        categorias: lote?.categorias ?? '',
        sexo: lote?.sexo ?? '',
        raca: lote?.raca ?? '',
        idade_meses: lote?.idade_meses ?? '',
        idade: lote?.idade ?? '',
        sistema_producao: lote?.sistema_producao ?? '',
        destino: lote?.destino ?? '',
        peso_vivo_kg: lote?.peso_vivo_kg ?? '',
        peso_entrada_kg_cab: lote?.peso_entrada_kg_cab ?? '',
        peso_vivo_meta_kg: lote?.peso_vivo_meta_kg ?? '',
        gmd: lote?.gmd ?? '',
        periodo: lote?.periodo ?? '',
        dias_restantes_meta: lote?.dias_restantes_meta ?? '',
        data_pesagem: lote?.data_pesagem ?? '',
        data_meta: lote?.data_meta ?? '',
        estrategia_nutricional: lote?.estrategia_nutricional ?? '',
        rc_inicial: lote?.rc_inicial ?? '',
        preco_kg: lote?.preco_kg ?? '',
        preco_cab: lote?.preco_cab ?? '',
        custo_operacional_reais_cab_dia: lote?.custo_operacional_reais_cab_dia ?? '',
        ativo: lote?.ativo ?? '',
        produtor_rural: lote?.produtor_rural ?? '',
        propriedade_origem: lote?.propriedade_origem ?? '',
        numero_contrato: lote?.numero_contrato ?? '',
        mes_competencia: lote?.mes_competencia ?? '',
      }
    })

    const colunasLote: ColumnConfig[] = [
      { source: 'data_transicao', header: 'Data da transição', format: 'datetime' },
      { source: 'categoria_origem', header: 'Categoria origem' },
      { source: 'categoria_destino', header: 'Categoria destino' },
      { source: 'lote_nome', header: 'Nome do lote' },
      { source: 'n_cabecas', header: 'Cabeças', format: 'number' },
      { source: 'categorias', header: 'Categorias' },
      { source: 'sexo', header: 'Sexo' },
      { source: 'raca', header: 'Raça' },
      { source: 'idade_meses', header: 'Idade (meses)', format: 'number' },
      { source: 'idade', header: 'Idade', format: 'number' },
      { source: 'sistema_producao', header: 'Sistema de produção' },
      { source: 'destino', header: 'Destino' },
      { source: 'peso_vivo_kg', header: 'Peso vivo total (kg)', format: 'number' },
      { source: 'peso_entrada_kg_cab', header: 'Peso entrada (kg/cab)', format: 'number' },
      { source: 'peso_vivo_meta_kg', header: 'Peso vivo meta (kg)', format: 'number' },
      { source: 'gmd', header: 'GMD', format: 'number' },
      { source: 'periodo', header: 'Período (dias)', format: 'number' },
      { source: 'dias_restantes_meta', header: 'Dias restantes meta', format: 'number' },
      { source: 'data_pesagem', header: 'Data pesagem', format: 'date' },
      { source: 'data_meta', header: 'Data meta', format: 'date' },
      { source: 'estrategia_nutricional', header: 'Estratégia nutricional' },
      { source: 'rc_inicial', header: 'RC inicial', format: 'number' },
      { source: 'preco_kg', header: 'Preço (R$/kg)', format: 'number' },
      { source: 'preco_cab', header: 'Preço (R$/cab)', format: 'number' },
      { source: 'custo_operacional_reais_cab_dia', header: 'Custo operacional (R$/cab/dia)', format: 'number' },
      { source: 'ativo', header: 'Ativo', format: 'boolean' },
      { source: 'produtor_rural', header: 'Produtor rural' },
      { source: 'propriedade_origem', header: 'Propriedade origem' },
      { source: 'numero_contrato', header: 'Número contrato' },
      { source: 'mes_competencia', header: 'Mês competência' },
    ]

    exportToXLSXMultiSheet({
      tableName: `auditoria_${loteNome}`,
      sheets: [
        { data: rowsTransicoes, config: { sheetName: 'Transições', columns: colunasTransicoes } },
        { data: rowsLote, config: { sheetName: 'Lote (auditoria)', columns: colunasLote } },
      ],
    })
  }

  const faixasDoSexo = faixas.filter(f =>
    f.sexo === sexoFiltro &&
    (destinoFiltro === 'enfermaria' || f.destino === null || f.destino === destinoFiltro)
  )

  const handleFaixaChange = (id: string, campo: 'peso_min' | 'peso_max' | 'cor', valor: string) => {
    setFaixas(prev => prev.map(f => {
      if (f.id !== id) return f
      if (campo === 'cor') return { ...f, cor: valor }
      const num = parseFloat(valor.replace(',', '.'))
      if (isNaN(num)) return f
      return { ...f, [campo]: num }
    }))
  }

  const salvarTodasFaixas = async () => {
    setSavingAll(true)
    for (const faixa of faixas) {
      const { error } = await supabase
        .from('faixas_categorias')
        .update({
          peso_min: faixa.peso_min,
          peso_max: faixa.peso_max,
          cor: faixa.cor,
        })
        .eq('id', faixa.id)
      if (error) {
        console.error(`Erro ao salvar faixa ${faixa.nome}:`, error)
      }
    }
    setSavingAll(false)
  }

  const lotesDisponiveis = Array.from(new Set(lotesCategorias.map(lc => lc.lote_id)))
    .filter(lid => {
      const cat = lotesCategorias.find(lc => lc.lote_id === lid && lc.data_fim === null && lc.ativo)
      if (!cat || cat.peso_vivo_atual_kg_cab == null) return false
      const sexoNorm = cat.sexo === 'fêmea' || cat.sexo === 'F' ? 'F' : 'M'
      const isEnfermaria = cat.lote_destino === 'enfermaria'
      const faixa = faixas.find(f =>
        f.ativo &&
        f.sexo === sexoNorm &&
        f.nome.toLowerCase() === cat.categoria.toLowerCase() &&
        (isEnfermaria || f.destino === null || f.destino === cat.lote_destino)
      )
      if (!faixa) return false
      return cat.peso_vivo_atual_kg_cab < faixa.peso_min || cat.peso_vivo_atual_kg_cab > faixa.peso_max
    })
    .map(lid => ({
      id: lid,
      nome: lotesCategorias.find(lc => lc.lote_id === lid)?.lote_nome || 'Lote',
      destino: lotesCategorias.find(lc => lc.lote_id === lid)?.lote_destino ?? null,
    }))

  // Garantir que o lote selecionado está na lista de pendentes
  const loteSelecionadoValido = lotesDisponiveis.some(l => l.id === loteSelecionadoId)
  const loteEfetivoId = loteSelecionadoValido ? loteSelecionadoId : lotesDisponiveis[0]?.id ?? null

  // Sincronizar lote selecionado com o primeiro lote pendente quando necessário
  useEffect(() => {
    if (lotesCategorias.length > 0 && !loteSelecionadoValido && lotesDisponiveis.length > 0) {
      setLoteSelecionadoId(lotesDisponiveis[0].id)
    }
  }, [lotesCategorias, loteSelecionadoValido, lotesDisponiveis])

  const categoriasDoLoteSelecionado = lotesCategorias
    .filter(lc => lc.lote_id === loteEfetivoId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  const categoriaAtiva = categoriasDoLoteSelecionado.find(c => c.data_fim === null && c.ativo)

  // Sugerir próxima categoria baseado nas faixas, sexo e destino do lote
  const sugerirProximaCategoria = (categoriaAtual: string, sexo: string | null, destino: string | null): string => {
    const sexoNormalizado = sexo === 'fêmea' || sexo === 'F' ? 'F' : 'M'
    const isEnfermaria = destino === 'enfermaria'
    const faixasSexo = faixas
      .filter(f => f.sexo === sexoNormalizado && f.ativo && (isEnfermaria || f.destino === null || f.destino === destino))
      .sort((a, b) => a.ordem - b.ordem)
    const idxAtual = faixasSexo.findIndex(f => f.nome.toLowerCase() === categoriaAtual.toLowerCase())
    if (idxAtual >= 0 && idxAtual < faixasSexo.length - 1) {
      return faixasSexo[idxAtual + 1].nome
    }
    return ''
  }

  const abrirRecategorizacao = async (loteCategoria: LoteCategoriaCronologia) => {
    setRecategorizando(loteCategoria)
    const sugerida = sugerirProximaCategoria(loteCategoria.categoria, loteCategoria.sexo, loteCategoria.lote_destino ?? null)
    setNovaCategoria(sugerida)
    setManterFormulacao(true)
    setFormulacaoSelecionada('')
    setErroRecategorizacao(null)

    // Carregar formulação vigente do lote e suas categorias cobertas
    setFormulacaoLoteId(null)
    setCategoriasFormulacaoLote([])
    setTotalCategoriasAtivasLote(1)
    const { data: loteData } = await supabase
      .from('lotes')
      .select('formulacao_id')
      .eq('id', loteCategoria.lote_id)
      .single()
    if (loteData?.formulacao_id) {
      setFormulacaoLoteId(loteData.formulacao_id)
      const { data: fcgData } = await supabase
        .from('formulacao_categorias_gmd')
        .select('categoria')
        .eq('formulacao_id', loteData.formulacao_id)
      setCategoriasFormulacaoLote((fcgData || []).map((r: any) => (r.categoria as string).toLowerCase()))
    }
    // Contar categorias ativas do lote para decidir se troca de formulação é permitida
    const { count } = await supabase
      .from('lote_categorias')
      .select('id', { count: 'exact', head: true })
      .eq('lote_id', loteCategoria.lote_id)
      .eq('ativo', true)
    setTotalCategoriasAtivasLote(count ?? 1)
    setSucessoRecategorizacao(null)
    setFormulacoesDisponiveis([])
    // Pré-carregar formulações só quando usuário escolher "trocar"
  }

  const carregarFormulacoes = async (categoriaDestino: string) => {
    if (!fazendaId) return
    setLoadingFormulacoes(true)
    const { data, error } = await supabase
      .from('formulacoes')
      .select('id, nome, categoria, e_premix')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .eq('e_premix', false)
      .order('nome', { ascending: true })
    if (error) {
      console.error('Erro ao carregar formulações:', error)
      setFormulacoesDisponiveis([])
    } else {
      // Soft mode: categoria destino primeiro, depois as outras
      const matched = (data as FormulacaoOpcao[]).filter(f => f.categoria?.toLowerCase() === categoriaDestino.toLowerCase())
      const others = (data as FormulacaoOpcao[]).filter(f => f.categoria?.toLowerCase() !== categoriaDestino.toLowerCase())
      setFormulacoesDisponiveis([...matched, ...others])
    }
    setLoadingFormulacoes(false)
  }

  useEffect(() => {
    if (recategorizando && !manterFormulacao && novaCategoria) {
      carregarFormulacoes(novaCategoria)
    }
  }, [manterFormulacao, novaCategoria, recategorizando])

  // Validação: peso fora da faixa da categoria destino
  const isEnfermariaRecat = recategorizando?.lote_destino === 'enfermaria'
  const faixaDestino = faixas.find(f =>
    f.nome.toLowerCase() === novaCategoria.toLowerCase() &&
    f.sexo === (recategorizando?.sexo === 'fêmea' || recategorizando?.sexo === 'F' ? 'F' : 'M') &&
    (isEnfermariaRecat || f.destino === null || f.destino === recategorizando?.lote_destino)
  )
  const pesoAtual = recategorizando?.peso_vivo_atual_kg_cab
  const pesoForaDaFaixa = faixaDestino && pesoAtual != null && (pesoAtual < faixaDestino.peso_min || pesoAtual > faixaDestino.peso_max)

  const confirmarRecategorizacao = async () => {
    if (!recategorizando || !novaCategoria) return
    if (!manterFormulacao && !formulacaoSelecionada) {
      setErroRecategorizacao('Selecione uma formulação ou escolha continuar com a atual.')
      return
    }
    setSubmitting(true)
    setErroRecategorizacao(null)
    const { error } = await supabase.rpc('recategorizar_lote_categoria', {
      p_lote_categoria_origem_id: recategorizando.id,
      p_categoria_destino: novaCategoria,
      p_manter_formulacao: manterFormulacao,
      p_nova_formulacao_id: manterFormulacao ? null : formulacaoSelecionada,
      p_usuario_id: user?.id || null,
      p_motivo: 'manual',
    })
    if (error) {
      setErroRecategorizacao(error.message)
    } else {
      setSucessoRecategorizacao(`Recategorização para "${novaCategoria}" concluída. Plano nutricional não iniciado: inicie manualmente quando desejar.`)
      setRecategorizando(null)
      setConfirmRecategorizacao(false)
      loadCronologia()
      loadTransicoes()
    }
    setSubmitting(false)
  }

  if (loadingFazenda) {
    return <PageSkeleton variant="list" />
  }

  if (!fazendaId) {
    return (
      <EmptyState title="Nenhuma fazenda vinculada ao seu usuário" />
    )
  }

  return (
    <div className="space-y-6 page-transition">
      {/* Toast pós-recategorização */}
      {sucessoRecategorizacao && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-white border border-green-300 shadow-lg rounded-lg p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
              <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{sucessoRecategorizacao}</p>
            </div>
            <button
              onClick={() => setSucessoRecategorizacao(null)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Faixas de Categorias</h2>
        <p className="text-sm text-gray-500 mt-1">
          Defina as faixas de peso por categoria e acompanhe a cronologia evolutiva do rebanho.
        </p>
      </div>

      {/* Seção 1: Edição de faixas */}
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-800">Faixas de Peso por Categoria</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSexoFiltro('M')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sexoFiltro === 'M' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Machos
            </button>
            <button
              onClick={() => setSexoFiltro('F')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sexoFiltro === 'F' ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Fêmeas
            </button>
            {sexoFiltro === 'M' && (
              <>
                <span className="w-px bg-gray-200 mx-1" />
                <button
                  onClick={() => setDestinoFiltro('corte')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${destinoFiltro === 'corte' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Abate
                </button>
                <button
                  onClick={() => setDestinoFiltro('reprodução')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${destinoFiltro === 'reprodução' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Reprodução
                </button>
              </>
            )}
            <span className="w-px bg-gray-200 mx-1" />
            <button
              onClick={() => setDestinoFiltro('enfermaria')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${destinoFiltro === 'enfermaria' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Enfermaria
            </button>
          </div>
        </div>

        {loadingFaixas ? (
          <CardSkeleton />
        ) : faixasDoSexo.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Nenhuma faixa cadastrada para {SEXO_LABEL[sexoFiltro]}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">Ordem</th>
                  <th className="py-2 pr-3 font-medium">Categoria</th>
                  <th className="py-2 pr-3 font-medium">Peso Mín (kg)</th>
                  <th className="py-2 pr-3 font-medium">Peso Máx (kg)</th>
                  <th className="py-2 pr-3 font-medium">Cor</th>
                </tr>
              </thead>
              <tbody>
                {faixasDoSexo.map((faixa, idx) => (
                  <tr key={faixa.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        {faixa.cor && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: faixa.cor }} />}
                        {faixa.nome}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        value={faixa.peso_min}
                        onChange={(e) => handleFaixaChange(faixa.id, 'peso_min', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border-gray-200"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        value={faixa.peso_max}
                        onChange={(e) => handleFaixaChange(faixa.id, 'peso_max', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border-gray-200"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="color"
                        value={faixa.cor || '#cccccc'}
                        onChange={(e) => handleFaixaChange(faixa.id, 'cor', e.target.value)}
                        className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-3">
          <Button
            onClick={salvarTodasFaixas}
            disabled={savingAll || faixas.length === 0}
          >
            {savingAll ? 'Salvando...' : 'Salvar todas as faixas'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          As faixas são valores iniciais editáveis por fazenda. Mudanças aqui não retroagem lotes já cadastrados.
        </p>
      </Card>

      {/* Seção 2: Cronologia dos lotes */}
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-800">Cronologia dos Lotes</h3>
          {lotesDisponiveis.length > 0 && (
            <select
              value={loteEfetivoId || ''}
              onChange={(e) => setLoteSelecionadoId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {lotesDisponiveis.map(l => (
                <option key={l.id} value={l.id}>{l.nome} ({l.destino === 'corte' ? 'Abate' : l.destino === 'reprodução' ? 'Reprodução' : l.destino === 'enfermaria' ? 'Enfermaria' : 'Sem destino'})</option>
              ))}
            </select>
          )}
        </div>

        {loadingCronologia ? (
          <CardSkeleton />
        ) : lotesDisponiveis.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Nenhum lote com recategorização pendente. Todos os pesos estão dentro das faixas de suas categorias.</p>
        ) : categoriasDoLoteSelecionado.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">Nenhuma categoria cadastrada para este lote.</p>
        ) : (
          <div className="space-y-3">
            {/* Linha do tempo visual */}
            <div className="flex items-stretch overflow-x-auto pt-3 pl-3 pr-2 pb-2 gap-2">
              {categoriasDoLoteSelecionado.map((cat, idx) => {
                const ativa = cat.data_fim === null && cat.ativo
                const faixaCor = faixas.find(f => f.nome.toLowerCase() === cat.categoria.toLowerCase())?.cor
                return (
                  <div
                    key={cat.id}
                    className={`relative flex-shrink-0 px-3 pt-5 pb-2 rounded-lg text-xs font-medium border-2 ${ativa ? 'text-white' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                    style={ativa ? { backgroundColor: faixaCor || '#3b82f6', borderColor: faixaCor || '#3b82f6' } : {}}
                    title={ativa ? 'Categoria ativa' : `Encerrada em ${cat.data_fim ? new Date(cat.data_fim).toLocaleDateString('pt-BR') : '?'}`}
                  >
                    <span
                      className={`absolute -top-2 -left-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${ativa ? 'bg-white text-gray-800 border border-gray-300' : 'bg-gray-200 text-gray-600'}`}
                      aria-label={`Etapa ${idx + 1}`}
                    >
                      {idx + 1}
                    </span>
                    <p className="font-semibold">{capitalizeCategoria(cat.categoria)}</p>
                    <p className="text-[10px] opacity-80">
                      {cat.peso_vivo_atual_kg_cab != null ? `${cat.peso_vivo_atual_kg_cab} kg` : 'sem peso'}
                      {cat.quant_atual != null && ` • ${cat.quant_atual} cab`}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Detalhe da categoria ativa + botão recategorizar */}
            {categoriaAtiva && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Categoria ativa: {capitalizeCategoria(categoriaAtiva.categoria)}</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Peso atual: {categoriaAtiva.peso_vivo_atual_kg_cab != null ? `${categoriaAtiva.peso_vivo_atual_kg_cab} kg` : 'não informado'}
                      {categoriaAtiva.quant_atual != null && ` • ${categoriaAtiva.quant_atual} cabeças`}
                      {categoriaAtiva.sexo && ` • Sexo: ${categoriaAtiva.sexo}`}
                      {categoriaAtiva.lote_destino && ` • Destino: ${categoriaAtiva.lote_destino === 'corte' ? 'Abate' : categoriaAtiva.lote_destino === 'reprodução' ? 'Reprodução' : categoriaAtiva.lote_destino === 'enfermaria' ? 'Enfermaria' : categoriaAtiva.lote_destino}`}
                    </p>
                  </div>
                  <Button
                    onClick={() => abrirRecategorizacao(categoriaAtiva)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    Recategorizar
                  </Button>
                </div>
              </div>
            )}

            {/* Histórico de transições */}
            {transicoes.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">Histórico de transições</h4>
                  <Button
                    variant="secondary"
                    onClick={exportarTransicoes}
                    className="text-xs px-3 py-1"
                  >
                    Exportar XLSX
                  </Button>
                </div>
                <div className="space-y-2">
                  {transicoes.map(t => {
                    const expandida = transicaoExpandidaId === t.id
                    const snap = t.snapshot_jsonb
                    const lc = snap?.lote_categoria_origem
                    const pn = snap?.plano_nutricional_origem
                    return (
                      <div key={t.id} className="bg-gray-50 rounded border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setTransicaoExpandidaId(expandida ? null : t.id)}
                          className="w-full flex items-center text-xs text-gray-600 p-2 hover:bg-gray-100 transition-colors"
                        >
                          <span className="text-gray-400 mr-2">{expandida ? '▼' : '▶'}</span>
                          <span className="font-medium">{new Date(t.data_transicao).toLocaleDateString('pt-BR')}</span>
                          <span className="mx-2">→</span>
                          <span>{capitalizeCategoria(t.categoria_origem)}</span>
                          <span className="mx-2">→</span>
                          <span className="font-medium">{capitalizeCategoria(t.categoria_destino)}</span>
                          {t.peso_na_transicao_kg != null && (
                            <span className="ml-2 text-gray-400">({t.peso_na_transicao_kg} kg)</span>
                          )}
                          <span className="ml-auto text-gray-400">{t.motivo}</span>
                        </button>
                        {expandida && lc && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-200 bg-white rounded-b">
                            <p className="text-xs font-semibold text-gray-700 mt-2 mb-1">Categoria no momento da transição</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                              <Campo label="Sexo" valor={lc.sexo} />
                              <Campo label="Raça" valor={lc.raca} />
                              <Campo label="Idade (meses)" valor={lc.idade} />
                              <Campo label="Cabeças" valor={lc.quant_atual} />
                              <Campo label="Peso vivo atual (kg)" valor={lc.peso_vivo_atual_kg_cab} />
                              <Campo label="Peso entrada (kg)" valor={lc.peso_entrada_kg_cab} />
                              <Campo label="GMD (kg/dia)" valor={lc.gmd} />
                              <Campo label="RC atual" valor={lc.rc_atual} />
                              <Campo label="RC inicial" valor={lc.rc_inicial} />
                              <Campo label="Estratégia nutricional" valor={lc.estrategia_nutricional} />
                              <Campo label="Consumo MS (% PV)" valor={lc.formulacao_id ? (formulacoesMap[lc.formulacao_id]?.consumo_ms_percent_pv ?? null) : null} />
                              <Campo label="Data pesagem" valor={lc.data_pesagem ? new Date(lc.data_pesagem).toLocaleDateString('pt-BR') : null} />
                              <Campo label="Data meta projetada" valor={lc.data_meta_projetada ? new Date(lc.data_meta_projetada).toLocaleDateString('pt-BR') : null} />
                              <Campo label="Dias restantes meta" valor={lc.dias_restantes_meta} />
                              <Campo label="Peso vivo meta (kg)" valor={lc.peso_vivo_meta_kg_cab} />
                              <Campo label="Custo operacional (R$/cab/dia)" valor={lc.custo_operacional_reais_cab_dia} />
                              <Campo label="Abate" valor={lc.abate} />
                              <Campo label="Morte" valor={lc.morte} />
                              <Campo label="Transferência entrada" valor={lc.transf_entrada} />
                              <Campo label="Transferência saída" valor={lc.transf_saida} />
                            </div>
                            <p className="text-xs font-semibold text-gray-700 mt-3 mb-1">Plano nutricional ativo</p>
                            {pn ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                                <Campo label="Nome do plano" valor={pn.nome} />
                                <Campo label="Formulação" valor={pn.formulacao_id ? (formulacoesMap[pn.formulacao_id]?.nome ?? pn.formulacao_id) : null} />
                                <Campo label="Peso início (kg)" valor={pn.peso_inicio_kg_cab} />
                                <Campo label="Peso meta (kg)" valor={pn.peso_meta_kg} />
                                <Campo label="GMD planejado" valor={pn.gmd_planejado} />
                                <Campo label="Data início" valor={pn.data_inicio ? new Date(pn.data_inicio).toLocaleDateString('pt-BR') : null} />
                                <Campo label="Data fim" valor={pn.data_fim ? new Date(pn.data_fim).toLocaleDateString('pt-BR') : null} />
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">Sem plano nutricional ativo no momento da transição.</p>
                            )}
                            <p className="text-xs font-semibold text-gray-700 mt-3 mb-1">Decisão de formulação</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <Campo label="Manteve formulação" valor={snap?.manter_formulacao === true ? 'Sim' : snap?.manter_formulacao === false ? 'Não' : null} />
                              <Campo label="Nova formulação" valor={snap?.nova_formulacao_id ? (formulacoesMap[snap.nova_formulacao_id]?.nome ?? snap.nova_formulacao_id) : null} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal de recategorização */}
      <Modal
        isOpen={!!recategorizando}
        onClose={() => { if (!submitting) setRecategorizando(null) }}
        title="Recategorizar lote"
      >
        {recategorizando && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p><span className="text-gray-500">Categoria atual:</span> <span className="font-medium">{capitalizeCategoria(recategorizando.categoria)}</span></p>
              <p><span className="text-gray-500">Peso atual:</span> <span className="font-medium">{recategorizando.peso_vivo_atual_kg_cab ?? 'não informado'} kg</span></p>
              <p><span className="text-gray-500">Cabeças:</span> <span className="font-medium">{recategorizando.quant_atual ?? 'não informado'}</span></p>
              {recategorizando.lote_destino && (
                <p><span className="text-gray-500">Destino:</span> <span className="font-medium">{recategorizando.lote_destino === 'corte' ? 'Abate' : recategorizando.lote_destino === 'reprodução' ? 'Reprodução' : recategorizando.lote_destino === 'enfermaria' ? 'Enfermaria' : recategorizando.lote_destino}</span></p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova categoria *</label>
              <select
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione a nova categoria...</option>
                {faixas
                  .filter(f => {
                    const sexoMatch = f.sexo === (recategorizando.sexo === 'fêmea' || recategorizando.sexo === 'F' ? 'F' : 'M')
                    if (!sexoMatch || !f.ativo) return false
                    const isEnfermaria = recategorizando.lote_destino === 'enfermaria'
                    return isEnfermaria || f.destino === null || f.destino === recategorizando.lote_destino
                  })
                  .sort((a, b) => a.ordem - b.ordem)
                  .map(f => (
                    <option key={f.id} value={f.nome}>
                      {f.nome} ({f.peso_min}-{f.peso_max} kg)
                    </option>
                  ))}
              </select>
            </div>

            {pesoForaDaFaixa && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900">
                Aviso: o peso atual ({pesoAtual} kg) está fora da faixa de {faixaDestino.nome} ({faixaDestino.peso_min}-{faixaDestino.peso_max} kg). Você pode prosseguir, mas revise se a recategorização é apropriada.
              </div>
            )}

            {formulacaoLoteId && novaCategoria && !categoriasFormulacaoLote.includes(novaCategoria.toLowerCase()) && manterFormulacao && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-red-900">
                <p className="font-semibold">A formulação vigente no lote não contempla essa nova categoria.</p>
                <p className="mt-1">
                  Não há GMD para essa categoria na formulação vigente do lote. A evolução de peso será interrompida para esta categoria.
                  Para manter a evolução, troque para uma formulação que contemple a categoria destino.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Formulação nutricional</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={manterFormulacao}
                    onChange={() => setManterFormulacao(true)}
                  />
                  Continuar com a formulação atual
                </label>
                {totalCategoriasAtivasLote <= 1 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={!manterFormulacao}
                      onChange={() => setManterFormulacao(false)}
                    />
                    Trocar formulação
                  </label>
                )}
              </div>
              {totalCategoriasAtivasLote > 1 && (
                <p className="text-xs text-gray-500 mt-1">
                  Este lote tem {totalCategoriasAtivasLote} categorias ativas. A formulação não pode ser trocada para não afetar as outras categorias. Edite a formulação vigente para contemplar a nova categoria, se necessário.
                </p>
              )}
            </div>

            {!manterFormulacao && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selecionar nova formulação *</label>
                {loadingFormulacoes ? (
                  <p className="text-xs text-gray-500">Carregando formulações...</p>
                ) : formulacoesDisponiveis.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhuma formulação ativa encontrada.</p>
                ) : (
                  <>
                    <select
                      value={formulacaoSelecionada}
                      onChange={(e) => setFormulacaoSelecionada(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Selecione...</option>
                      {formulacoesDisponiveis.map((f, idx) => {
                        const isMatched = f.categoria?.toLowerCase() === novaCategoria.toLowerCase()
                        const showSeparator = idx > 0 && isMatched && formulacoesDisponiveis[idx - 1].categoria?.toLowerCase() !== novaCategoria.toLowerCase()
                        return (
                          <Fragment key={f.id}>
                            {showSeparator && <option disabled>── outras categorias ──</option>}
                            <option value={f.id}>
                              {f.nome}{f.categoria ? ` (${f.categoria})` : ''}
                            </option>
                          </Fragment>
                        )
                      })}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Formulações da categoria "{novaCategoria}" aparecem primeiro; as outras abaixo do separador.
                    </p>
                  </>
                )}
              </div>
            )}

            {erroRecategorizacao && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">
                {erroRecategorizacao}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setRecategorizando(null)} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                onClick={() => setConfirmRecategorizacao(true)}
                disabled={submitting || !novaCategoria}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Recategorizar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmRecategorizacao}
        onClose={() => setConfirmRecategorizacao(false)}
        onConfirm={confirmarRecategorizacao}
        title="Confirmar recategorização"
        message={
          recategorizando
            ? `Confirmar a recategorização de "${capitalizeCategoria(recategorizando.categoria)}" para "${capitalizeCategoria(novaCategoria)}"? Esta ação encerra a categoria atual, cria uma nova e registra o histórico para auditoria. Não pode ser desfeita.`
            : ''
        }
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant="info"
      />
    </div>
  )
}
