import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { Card, CardSkeleton, Button, Modal } from '../../components/ui'
import type * as XLSXType from 'xlsx'
import { gerarRelatorioPlanosPDF } from '../../utils/relatorioPlanosPDF'

interface RegistroPlano {
  id: string
  plano_nutricional_id: string
  lote_categoria_id: string
  fazenda_id: string
  tipo_snapshot: 'entrada' | 'saida'
  snapshot: Record<string, any>
  metricas_derivadas: Record<string, any> | null
  duracao_dias: number | null
  ganho_peso_total_kg_cab: number | null
  gmd_realizado: number | null
  gmd_planejado: number | null
  producao_arroba_lote: number | null
  mortalidade_percent: number | null
  motivo_migracao: string | null
  plano_anterior_id: string | null
  plano_posterior_id: string | null
  created_at: string
  plano_nutricional: {
    nome: string
    formulacao_id: string
  } | null
  lote_categoria: {
    categoria: string
    lote_id: string
    lotes: {
      nome: string
    } | null
  } | null
  plano_posterior: {
    nome: string
  } | null
}

export interface PlanoAgrupado {
  plano_nutricional_id: string
  nomePlano: string
  nomeLote: string
  categoria: string
  entrada: RegistroPlano | null
  saida: RegistroPlano | null
  vigente: boolean
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function HistoricoPlanos() {
  const { user } = useAuth()
  const [planosAgrupados, setPlanosAgrupados] = useState<PlanoAgrupado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroLote, setFiltroLote] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportStep, setExportStep] = useState<1 | 2>(1)
  const [lotesSelecionados, setLotesSelecionados] = useState<Set<string>>(new Set())
  const [exportTipo, setExportTipo] = useState<'entrada' | 'saida' | 'ambos'>('ambos')

  const [exportingPDF, setExportingPDF] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfLotesSelecionados, setPdfLotesSelecionados] = useState<Set<string>>(new Set())

  useEffect(() => {
    carregarRegistros()
  }, [user])

  const carregarRegistros = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setLoading(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('planos_nutricionais_snapshots')
      .select(`
        *,
        plano_nutricional:plano_nutricional_id(nome, formulacao_id),
        lote_categoria:lote_categoria_id(
          categoria,
          lote_id,
          lotes:lote_id(nome)
        ),
        plano_posterior:plano_posterior_id(nome)
      `)
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao carregar registros:', error)
      setLoading(false)
      return
    }

    const todosRegistros = data as unknown as RegistroPlano[]

    // Buscar planos vigentes (ativos, sem data_fim) para marcar como vigente
    const planosIds = [...new Set(todosRegistros.map(r => r.plano_nutricional_id))]
    const { data: planosAtivos } = await supabase
      .from('planos_nutricionais')
      .select('id, ativo, data_fim')
      .in('id', planosIds)

    const ativosMap = new Map<string, boolean>()
    planosAtivos?.forEach(p => {
      ativosMap.set(p.id, p.ativo && !p.data_fim)
    })

    // Agrupar por plano_nutricional_id
    const agrupado = new Map<string, PlanoAgrupado>()
    for (const reg of todosRegistros) {
      const key = reg.plano_nutricional_id
      if (!agrupado.has(key)) {
        agrupado.set(key, {
          plano_nutricional_id: key,
          nomePlano: reg.plano_nutricional?.nome || '—',
          nomeLote: reg.lote_categoria?.lotes?.nome || 'Lote',
          categoria: reg.lote_categoria?.categoria || '',
          entrada: null,
          saida: null,
          vigente: ativosMap.get(key) || false,
        })
      }
      const grupo = agrupado.get(key)!
      if (reg.tipo_snapshot === 'entrada') {
        grupo.entrada = reg
      } else {
        grupo.saida = reg
      }
    }

    setPlanosAgrupados(Array.from(agrupado.values()).sort((a, b) => {
      const dataA = a.saida?.created_at || a.entrada?.created_at || ''
      const dataB = b.saida?.created_at || b.entrada?.created_at || ''
      return dataB.localeCompare(dataA)
    }))
    setLoading(false)
  }

  const planosFiltrados = planosAgrupados.filter((p) => {
    const nomeLote = p.nomeLote.toLowerCase()
    const categoria = p.categoria.toLowerCase()
    return (
      nomeLote.includes(filtroLote.toLowerCase()) &&
      categoria.includes(filtroCategoria.toLowerCase())
    )
  })

  const handleExportPDF = async () => {
    const planosParaPDF = pdfLotesSelecionados.size === 0
      ? planosFiltrados
      : planosFiltrados.filter((p) => pdfLotesSelecionados.has(p.nomeLote))

    if (planosParaPDF.length === 0) return
    setExportingPDF(true)
    try {
      let nomeFazenda = 'Fazenda'
      if (user) {
        const fazendaId = await getFazendaIdForUser(user.id)
        if (fazendaId) {
          const { data: fazenda } = await supabase
            .from('fazendas')
            .select('nome')
            .eq('id', fazendaId)
            .single()
          if (fazenda) nomeFazenda = fazenda.nome
        }
      }
      await gerarRelatorioPlanosPDF(planosParaPDF, nomeFazenda, { lote: filtroLote, categoria: filtroCategoria })
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
    } finally {
      setExportingPDF(false)
    }
  }

  const COLUNAS_EXPORT: { key: string; label: string }[] = [
    { key: 'lote', label: 'Lote' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'plano', label: 'Plano' },
    { key: 'tipo', label: 'Tipo de Registro' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'data_registro', label: 'Data do Registro' },
    { key: 'duracao_dias', label: 'Duração (dias)' },
    { key: 'peso_inicial_kg_cab', label: 'Peso Inicial (kg/cab)' },
    { key: 'peso_vivo_medio_lote', label: 'Peso Final (kg/cab)' },
    { key: 'ganho_peso_total_kg_cab', label: 'Ganho de Peso (kg/cab)' },
    { key: 'gmd_realizado', label: 'GMD Realizado (kg/dia)' },
    { key: 'gmd_planejado', label: 'GMD Planejado (kg/dia)' },
    { key: 'progresso_meta_percent', label: 'Progresso da Meta (%)' },
    { key: 'rc_inicio', label: 'RC Inicial (%)' },
    { key: 'rc_atual', label: 'RC Final (%)' },
    { key: 'ganho_arroba_cab', label: 'Ganho em Arroba (@/cab)' },
    { key: 'producao_arroba_lote', label: 'Produção do Lote (@)' },
    { key: 'quant_inicial', label: 'Quantidade Inicial (cab)' },
    { key: 'quant_atual', label: 'Quantidade Atual (cab)' },
    { key: 'morte', label: 'Mortes (cab)' },
    { key: 'mortalidade_percent', label: 'Mortalidade (%)' },
    { key: 'custo_operacional_total_cab', label: 'Custo Operacional (R$/cab)' },
    { key: 'custo_total_producao_cab', label: 'Custo Total (R$/cab)' },
    { key: 'peso_entrada_kg_cab', label: 'Peso de Entrada do Lote (kg/cab)' },
    { key: 'peso_vivo_atual_kg_cab', label: 'Peso Vivo Atual (kg/cab)' },
    { key: 'peso_vivo_meta_kg_cab', label: 'Peso Vivo Meta (kg/cab)' },
    { key: 'estrategia_nutricional', label: 'Estratégia Nutricional' },
    { key: 'data_pesagem', label: 'Data da Pesagem' },
    { key: 'data_meta_projetada', label: 'Data Meta Projetada' },
    { key: 'dias_restantes_meta', label: 'Dias Restantes para Meta' },
    { key: 'custo_total_entrada_reais_cab', label: 'Custo de Entrada (R$/cab)' },
    { key: 'custo_operacional_reais_cab_dia', label: 'Custo Operacional Diário (R$/cab/dia)' },
    { key: 'preco_entrada_reais_cab', label: 'Preço de Entrada (R$/cab)' },
    { key: 'preco_entrada_reais_kg', label: 'Preço de Entrada (R$/kg)' },
    { key: 'preco_custo_reais_arroba', label: 'Preço de Custo (R$/@)' },
    { key: 'preco_venda_sugerido_cab', label: 'Preço de Venda Sugerido (R$/cab)' },
    { key: 'margem_lucro_percent', label: 'Margem de Lucro (%)' },
    { key: 'agio_percent', label: 'Ágio (%)' },
    { key: 'custo_frete_reais_cab', label: 'Custo de Frete (R$/cab)' },
    { key: 'custo_comissao_reais_cab', label: 'Custo de Comissão (R$/cab)' },
    { key: 'custo_sanidade_reais_cab', label: 'Custo de Sanidade (R$/cab)' },
    { key: 'producao_atual_arroba_cab', label: 'Produção Atual (@/cab)' },
    { key: 'producao_projetada_arroba_cab', label: 'Produção Projetada (@/cab)' },
    { key: 'peso_vivo_atual_arroba_cab', label: 'Peso Vivo Atual (@/cab)' },
    { key: 'peso_entrada_arrobas', label: 'Peso de Entrada (@)' },
    { key: 'peso_venda_meta_arroba', label: 'Peso de Venda Meta (@)' },
  ]

  const motivoLabel = (motivo: string | null): string => {
    if (!motivo) return '—'
    const map: Record<string, string> = {
      inicio: 'Início',
      migracao: 'Migração',
      manual: 'Migração Manual',
      automatico: 'Migração Automática',
      encerramento: 'Encerramento',
    }
    return map[motivo] || motivo.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const roundNum = (val: any): any => {
    if (val == null) return '—'
    if (typeof val === 'number') return Math.round(val * 100) / 100
    return val
  }

  const fmtDate = (val: any): any => {
    if (val == null || val === '') return '—'
    if (typeof val === 'string') {
      const d = new Date(val)
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
    }
    return val
  }

  const DATE_KEYS = new Set(['data_pesagem', 'data_meta_projetada', 'created_at', 'data_inicio', 'data_fim'])

  const buildRow = (reg: RegistroPlano, plano: PlanoAgrupado): Record<string, any> => {
    const m = reg.metricas_derivadas || {}
    const s = reg.snapshot || {}
    const row: Record<string, any> = {}
    for (const col of COLUNAS_EXPORT) {
      switch (col.key) {
        case 'lote': row[col.label] = plano.nomeLote; break
        case 'categoria': row[col.label] = plano.categoria?.replace(/\b\w/g, (c) => c.toUpperCase()); break
        case 'plano': row[col.label] = plano.nomePlano; break
        case 'tipo': row[col.label] = reg.tipo_snapshot === 'entrada' ? 'Entrada' : 'Saída'; break
        case 'motivo': row[col.label] = motivoLabel(reg.motivo_migracao); break
        case 'data_registro': row[col.label] = reg.created_at ? new Date(reg.created_at).toLocaleDateString('pt-BR') : '—'; break
        case 'duracao_dias': row[col.label] = reg.duracao_dias ?? '—'; break
        case 'ganho_peso_total_kg_cab': row[col.label] = roundNum(reg.ganho_peso_total_kg_cab); break
        case 'gmd_realizado': row[col.label] = roundNum(reg.gmd_realizado); break
        case 'gmd_planejado': row[col.label] = roundNum(reg.gmd_planejado); break
        case 'producao_arroba_lote': row[col.label] = roundNum(reg.producao_arroba_lote); break
        case 'mortalidade_percent': row[col.label] = roundNum(reg.mortalidade_percent); break
        default: {
          const raw = m[col.key] ?? s[col.key]
          row[col.label] = DATE_KEYS.has(col.key) ? fmtDate(raw) : roundNum(raw)
        }
      }
    }
    return row
  }

  const exportXLSX = async () => {
    const XLSX = await import('xlsx') as typeof XLSXType
    const lotesParaExportar = lotesSelecionados.size === 0
      ? [...new Set(planosFiltrados.map((p) => p.nomeLote))]
      : [...lotesSelecionados]

    const tipoLabel = exportTipo === 'entrada' ? 'Entrada' : exportTipo === 'saida' ? 'Saida' : 'Entrada e Saida'
    const now = new Date()
    const dataArquivo = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    for (const nomeLote of lotesParaExportar) {
      const planosDoLote = planosFiltrados.filter((p) => p.nomeLote === nomeLote)
      if (planosDoLote.length === 0) continue

      const wb = XLSX.utils.book_new()

      if (exportTipo === 'entrada' || exportTipo === 'ambos') {
        const rows = planosDoLote.filter((p) => p.entrada).map((p) => buildRow(p.entrada!, p))
        if (rows.length > 0) {
          const ws = XLSX.utils.json_to_sheet(rows, { header: COLUNAS_EXPORT.map((c) => c.label) })
          XLSX.utils.book_append_sheet(wb, ws, 'Entrada')
        }
      }

      if (exportTipo === 'saida' || exportTipo === 'ambos') {
        const rows = planosDoLote.filter((p) => p.saida).map((p) => buildRow(p.saida!, p))
        if (rows.length > 0) {
          const ws = XLSX.utils.json_to_sheet(rows, { header: COLUNAS_EXPORT.map((c) => c.label) })
          XLSX.utils.book_append_sheet(wb, ws, 'Saída')
        }
      }

      const nomeArquivo = `Auditoria de Plano Nutricional - ${nomeLote} - ${tipoLabel} - ${dataArquivo}.xlsx`
      XLSX.writeFile(wb, nomeArquivo)
    }

    setExportModalOpen(false)
    setExportStep(1)
    setLotesSelecionados(new Set())
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">Histórico de Planos Nutricionais</h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Histórico de Planos Nutricionais</h2>
        {planosFiltrados.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setExportStep(1); setLotesSelecionados(new Set()); setExportModalOpen(true) }}>
              Exportar xlsx
            </Button>
            <Button size="sm" onClick={() => { setPdfLotesSelecionados(new Set()); setPdfModalOpen(true) }}>
              Exportar PDF
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Filtrar por lote..."
          value={filtroLote}
          onChange={(e) => setFiltroLote(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="text"
          placeholder="Filtrar por categoria..."
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {planosFiltrados.length === 0 ? (
        <Card className="bg-white p-8 border-0 shadow-sm text-center">
          <p className="text-gray-600">Nenhum registro de plano nutricional encontrado.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {planosFiltrados.map((plano) => {
            const ent = plano.entrada
            const sai = plano.saida
            const mEnt = ent?.metricas_derivadas
            const mSai = sai?.metricas_derivadas

            return (
              <Card key={plano.plano_nutricional_id} className="bg-white p-5 border-0 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {plano.nomeLote} —{' '}
                      <span className="capitalize">{plano.categoria}</span>
                    </h3>
                    <p className="text-sm text-gray-600">
                      Plano: {plano.nomePlano}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                      plano.vigente
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {plano.vigente ? 'Vigente' : (sai?.motivo_migracao === 'manual' ? 'Migrado Manualmente' : sai?.motivo_migracao === 'automatico' ? 'Migrado Automaticamente' : sai?.motivo_migracao === 'encerramento' ? 'Encerrado' : (sai?.motivo_migracao ? sai.motivo_migracao.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Encerrado'))}
                    </span>
                    {sai && (
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(sai.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Registro de Entrada */}
                  {ent && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">Entrada no Plano</h4>
                      {ent.created_at && (
                        <p className="text-xs text-blue-700 mb-2">
                          {new Date(ent.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Peso/cab:</span>
                          <p className="font-medium">{fmt(mEnt?.peso_inicial_kg_cab)} kg</p>
                        </div>
                        <div>
                          <span className="text-gray-600">RC:</span>
                          <p className="font-medium">{fmt(mEnt?.rc_inicio)}%</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Cabeças:</span>
                          <p className="font-medium">{mEnt?.quant_atual ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Produção lote:</span>
                          <p className="font-medium">{fmt(ent.producao_arroba_lote)} @</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Progresso meta:</span>
                          <p className="font-medium">{fmt(mEnt?.progresso_meta_percent)}%</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Custo/cab:</span>
                          <p className="font-medium">R$ {fmt(mEnt?.custo_total_producao_cab)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Registro de Saída */}
                  {sai ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-green-900 mb-3">Saída do Plano</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Peso/cab:</span>
                          <p className="font-medium">{fmt(mSai?.peso_vivo_medio_lote)} kg</p>
                        </div>
                        <div>
                          <span className="text-gray-600">RC:</span>
                          <p className="font-medium">{fmt(mSai?.rc_atual)}%</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Cabeças:</span>
                          <p className="font-medium">{mSai?.quant_atual ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Produção lote:</span>
                          <p className="font-medium">{fmt(sai.producao_arroba_lote)} @</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Duração:</span>
                          <p className="font-medium">{sai.duracao_dias || 0} dias</p>
                        </div>
                        <div>
                          <span className="text-gray-600">GMD realizado:</span>
                          <p className="font-medium">{fmt(sai.gmd_realizado, 3)} kg/dia</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Ganho peso/cab:</span>
                          <p className="font-medium">{fmt(sai.ganho_peso_total_kg_cab)} kg</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Ganho @/cab:</span>
                          <p className="font-medium">{fmt(mSai?.ganho_arroba_cab)} @</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Progresso meta:</span>
                          <p className="font-medium">{fmt(mSai?.progresso_meta_percent)}%</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Custo total/cab:</span>
                          <p className="font-medium">R$ {fmt(mSai?.custo_total_producao_cab)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-center">
                      <p className="text-sm text-yellow-800">Plano vigente — sem registro de saída</p>
                    </div>
                  )}
                </div>

                {/* Delta entre entrada e saída */}
                {ent && sai && mEnt && mSai && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Variação no Período</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Peso/cab:</span>
                        <p className="font-medium text-gray-900 flex items-center gap-1">
                          {(() => {
                            const delta = (mSai.peso_vivo_medio_lote ?? 0) - (mEnt.peso_inicial_kg_cab ?? 0)
                            return (
                              <>
                                {delta > 0 ? (
                                  <span className="text-green-600 font-bold">&uarr;</span>
                                ) : delta < 0 ? (
                                  <span className="text-red-600 font-bold">&darr;</span>
                                ) : null}
                                {fmt(delta)} kg
                              </>
                            )
                          })()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">RC:</span>
                        <p className="font-medium text-gray-900 flex items-center gap-1">
                          {(() => {
                            const delta = (mSai.rc_atual ?? 0) - (mEnt.rc_inicio ?? 0)
                            return (
                              <>
                                {delta > 0 ? (
                                  <span className="text-green-600 font-bold">&uarr;</span>
                                ) : delta < 0 ? (
                                  <span className="text-red-600 font-bold">&darr;</span>
                                ) : null}
                                {fmt(delta)} p.p.
                              </>
                            )
                          })()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Produção lote:</span>
                        <p className="font-medium text-gray-900 flex items-center gap-1">
                          {(() => {
                            const delta = (sai.producao_arroba_lote ?? 0) - (ent.producao_arroba_lote ?? 0)
                            return (
                              <>
                                {delta > 0 ? (
                                  <span className="text-green-600 font-bold">&uarr;</span>
                                ) : delta < 0 ? (
                                  <span className="text-red-600 font-bold">&darr;</span>
                                ) : null}
                                {fmt(delta)} @
                              </>
                            )
                          })()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Custo/cab:</span>
                        <p className="font-medium text-gray-900 flex items-center gap-1">
                          {(() => {
                            const delta = (mSai.custo_total_producao_cab ?? 0) - (mEnt.custo_total_producao_cab ?? 0)
                            return (
                              <>
                                {delta > 0 ? (
                                  <span className="text-red-600 font-bold">&uarr;</span>
                                ) : delta < 0 ? (
                                  <span className="text-green-600 font-bold">&darr;</span>
                                ) : null}
                                R$ {fmt(delta)}
                              </>
                            )
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {sai?.plano_posterior && (
                  <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
                    Próximo plano: <span className="font-medium text-gray-900">{sai.plano_posterior.nome}</span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>

      {/* Modal de Exportação */}
      <Modal isOpen={exportModalOpen} onClose={() => { setExportModalOpen(false); setExportStep(1) }} title="Exportar Auditoria" size="md">
        {exportStep === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-sm font-bold">1</span>
              <span className="text-sm font-semibold">Selecione os lotes para exportar</span>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => setLotesSelecionados(new Set())}
            >
              <input
                type="checkbox"
                id="selectAll"
                checked={lotesSelecionados.size === 0}
                onChange={(e) => { if (e.target.checked) setLotesSelecionados(new Set()) }}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="selectAll" className="text-sm font-medium text-gray-800 cursor-pointer">Todos os lotes</label>
            </div>

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {[...new Set(planosFiltrados.map((p) => p.nomeLote))].map((nomeLote) => (
                <div
                  key={nomeLote}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${lotesSelecionados.has(nomeLote) ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
                  onClick={() => {
                    const next = new Set(lotesSelecionados)
                    if (next.has(nomeLote)) next.delete(nomeLote)
                    else next.add(nomeLote)
                    setLotesSelecionados(next)
                  }}
                >
                  <input
                    type="checkbox"
                    id={`lote-${nomeLote}`}
                    checked={lotesSelecionados.has(nomeLote)}
                    onChange={(e) => {
                      const next = new Set(lotesSelecionados)
                      if (e.target.checked) next.add(nomeLote)
                      else next.delete(nomeLote)
                      setLotesSelecionados(next)
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor={`lote-${nomeLote}`} className="text-sm text-gray-700 cursor-pointer flex-1">{nomeLote}</label>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="danger" onClick={() => setExportModalOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => setExportStep(2)}>Avançar</Button>
            </div>
          </div>
        )}
        {exportStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-sm font-bold">2</span>
              <span className="text-sm font-semibold">Selecione o tipo de registro</span>
            </div>

            <div className="space-y-2">
              {[
                { val: 'entrada', label: 'Registro de Entrada', desc: 'Dados do estado inicial do plano' },
                { val: 'saida', label: 'Registro de Saída', desc: 'Dados do estado final do plano' },
                { val: 'ambos', label: 'Ambos (Entrada e Saída)', desc: 'Gera duas abas no arquivo' },
              ].map((opt) => (
                <div
                  key={opt.val}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${exportTipo === opt.val ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                  onClick={() => setExportTipo(opt.val as 'entrada' | 'saida' | 'ambos')}
                >
                  <input type="radio" name="exportTipo" checked={exportTipo === opt.val} onChange={() => setExportTipo(opt.val as 'entrada' | 'saida' | 'ambos')} className="w-4 h-4 mt-0.5 accent-primary" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Lotes selecionados:</span><span className="font-medium text-gray-800">{lotesSelecionados.size === 0 ? 'Todos' : lotesSelecionados.size}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tipo:</span><span className="font-medium text-gray-800">{exportTipo === 'entrada' ? 'Entrada' : exportTipo === 'saida' ? 'Saída' : 'Entrada e Saída'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Arquivos:</span><span className="font-medium text-gray-800">{lotesSelecionados.size > 1 || (lotesSelecionados.size === 0 && [...new Set(planosFiltrados.map((p) => p.nomeLote))].length > 1) ? 'Um por lote' : '1 arquivo'}</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="danger" onClick={() => setExportStep(1)}>Voltar</Button>
              <Button size="sm" onClick={exportXLSX}>Exportar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Exportação PDF */}
      <Modal isOpen={pdfModalOpen} onClose={() => setPdfModalOpen(false)} title="Exportar Relatório PDF" size="md">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-gray-700">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-sm font-bold">1</span>
            <span className="text-sm font-semibold">Selecione os lotes para o relatório</span>
          </div>

          <p className="text-xs text-gray-500 -mt-2 ml-9">
            O relatório PDF inclui sempre entrada e saída de cada plano. Planos sem saída mostram apenas a entrada.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => setPdfLotesSelecionados(new Set())}
          >
            <input
              type="checkbox"
              id="pdfSelectAll"
              checked={pdfLotesSelecionados.size === 0}
              onChange={(e) => { if (e.target.checked) setPdfLotesSelecionados(new Set()) }}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="pdfSelectAll" className="text-sm font-medium text-gray-800 cursor-pointer">Todos os lotes</label>
          </div>

          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
            {[...new Set(planosFiltrados.map((p) => p.nomeLote))].map((nomeLote) => (
              <div
                key={nomeLote}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${pdfLotesSelecionados.has(nomeLote) ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
                onClick={() => {
                  const next = new Set(pdfLotesSelecionados)
                  if (next.has(nomeLote)) next.delete(nomeLote)
                  else next.add(nomeLote)
                  setPdfLotesSelecionados(next)
                }}
              >
                <input
                  type="checkbox"
                  id={`pdf-lote-${nomeLote}`}
                  checked={pdfLotesSelecionados.has(nomeLote)}
                  onChange={(e) => {
                    const next = new Set(pdfLotesSelecionados)
                    if (e.target.checked) next.add(nomeLote)
                    else next.delete(nomeLote)
                    setPdfLotesSelecionados(next)
                  }}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor={`pdf-lote-${nomeLote}`} className="text-sm text-gray-700 cursor-pointer flex-1">{nomeLote}</label>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Lotes selecionados:</span><span className="font-medium text-gray-800">{pdfLotesSelecionados.size === 0 ? 'Todos' : pdfLotesSelecionados.size}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Conteúdo:</span><span className="font-medium text-gray-800">Entrada e Saída (completo)</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Formato:</span><span className="font-medium text-gray-800">PDF com gráficos e tabelas</span></div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="danger" onClick={() => setPdfModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => { setPdfModalOpen(false); handleExportPDF() }} disabled={exportingPDF}>
              {exportingPDF ? 'Gerando PDF...' : 'Gerar PDF'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
