import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, CardItem, ConfirmModal, useToast } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).replace('.', ',')
}

function capitalizeWords(str: string): string {
  return str.split(/([ -])/).map(part => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1)).join('')
}

interface Dieta {
  id: string
  fazenda_id: string
  nome: string
  descricao?: string
  tipo?: string
  categoria?: string
  insumos?: DietaInsumoCalc[]
  consumo_ms_percent_pv?: number
  peso_vivo_medio?: number
  gmd?: number
  sistema_producao?: string
  custo_total?: number
  custo_dieta_reais_cab_dia?: number
  consumo_mn_kg_cab_dia?: number
  teor_ms_dieta?: number
  custo_ms_tonelada?: number
  custo_mn_tonelada?: number
  consumo_ms_kg_cab_dia?: number
  ativo: boolean
  e_premix?: boolean
  categoria_inferida_automaticamente?: boolean
  categoria_inferida_observacao?: string
  created_at: string
  updated_at: string
}

interface InsumoOption {
  id: string
  nome: string
  teor_ms?: number
  preco_ton_mn?: number
  formulacao_origem_id?: string | null
}

interface FormulacaoCategoriaGmd {
  id?: string
  formulacao_id?: string
  categoria: string
  gmd: number
  ordem: number
}

const CATEGORIAS_DISPONIVEIS = [
  'vaca', 'touro', 'boi gordo', 'boi magro', 'garrote',
  'bezerro', 'bezerra', 'novilha',
]

interface DietaInsumoCalc {
  insumo_id: string
  nome: string
  teor_ms: number
  preco_ton_mn: number
  formula_teor_ms: number
  formula_mn_bruta?: number
  formula_mn_percent?: number
  custo_kg_mn?: number
  custo_kg_ms?: number
  consumo_kg_mn_por_kg_pv?: number
  consumo_kg_ms_por_kg_pv?: number
}

function DecimalInput({
  id,
  value,
  onChange,
  className,
  decimals = 2,
}: {
  id?: string
  value: number
  onChange: (val: number) => void
  className?: string
  decimals?: number
}) {
  const [raw, setRaw] = useState(value.toFixed(decimals).replace('.', ','))

  useEffect(() => {
    const formatted = value.toFixed(decimals).replace('.', ',')
    // Only sync from prop if user is not actively editing (avoids cursor jump)
    if (document.activeElement !== document.getElementById(id || '')) {
      setRaw(formatted)
    }
  }, [value, id, decimals])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace('.', ',')
    // Allow only digits and at most one comma
    v = v.replace(/[^\d,]/g, '')
    const parts = v.split(',')
    if (parts.length > 2) {
      v = parts[0] + ',' + parts.slice(1).join('')
    }
    setRaw(v)
  }

  const handleBlur = () => {
    const num = parseFloat(raw.replace(',', '.')) || 0
    onChange(num)
    setRaw(num.toFixed(decimals).replace('.', ','))
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  )
}

export function Formulacoes() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const [formulacoes, setFormulacoes] = useState<Dieta[]>([])
  const [insumos, setInsumos] = useState<InsumoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingFormulacao, setEditingFormulacao] = useState<Dieta | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    tipo: '',
    categoria: '',
    consumo_ms_percent_pv: '0.30',
    peso_vivo_medio: '435.00',
    gmd: '0,000',
    sistema_producao: '',
    ativo: true,
    e_premix: false,
  })
  const [selectedInsumos, setSelectedInsumos] = useState<DietaInsumoCalc[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [premixFilter, setPremixFilter] = useState<'todos' | 'tmr' | 'premix'>('todos')
  const [sistemaFilter, setSistemaFilter] = useState<'todos' | 'pasto' | 'confinamento'>('todos')
  const [categoriasGmd, setCategoriasGmd] = useState<FormulacaoCategoriaGmd[]>([])
  const [blockedCategorias, setBlockedCategorias] = useState<Record<string, { nome: string; categorias: string[] }[]>>({})
  const [saveWarning, setSaveWarning] = useState<{
    categoriasRemovidas: { categoria: string; lotes: { nome: string; categorias: string[] }[] }[]
  } | null>(null)

  useEffect(() => {
    loadFormulacoes()
    loadInsumos()
  }, [user])

  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && formulacoes.length > 0) {
      const formulacaoToEdit = formulacoes.find(f => f.id === editId)
      if (formulacaoToEdit) {
        handleEdit(formulacaoToEdit)
      }
    }
  }, [searchParams, formulacoes])

  // Resetar e_premix para false quando há um premix selecionado como ingrediente (evita premix aninhado)
  useEffect(() => {
    if (selectedInsumos.some(s => insumos.find(i => i.id === s.insumo_id)?.formulacao_origem_id != null) && formData.e_premix) {
      setFormData(prev => ({ ...prev, e_premix: false }))
    }
  }, [selectedInsumos, insumos])

  const loadFormulacoes = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []
    if (!vinculos || vinculos.length === 0) return
    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('formulacoes')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar formulações:', error)
    } else {
      // Buscar contagem de insumos por formulação na tabela de junção
      const formulacaoIds = (data || []).map((f: any) => f.id)
      let insumoCounts: Record<string, number> = {}
      if (formulacaoIds.length > 0) {
        const { data: juncaoData } = await supabase
          .from('formulacao_insumos')
          .select('formulacao_id')
          .in('formulacao_id', formulacaoIds)
        if (juncaoData) {
          insumoCounts = juncaoData.reduce((acc: Record<string, number>, row: any) => {
            acc[row.formulacao_id] = (acc[row.formulacao_id] || 0) + 1
            return acc
          }, {})
        }
      }
      const mapped = (data || []).map((f: any) => ({
        ...f,
        insumos: insumoCounts[f.id] ? Array(insumoCounts[f.id]).fill({}) : [],
      })) as Dieta[]
      setFormulacoes(mapped)
    }
    setLoading(false)
  }

  const loadInsumos = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []
    if (!vinculos || vinculos.length === 0) return
    const fazendaId = vinculos[0].fazenda_id

    const { data } = await supabase
      .from('insumos')
      .select('id, nome, teor_ms, preco_ton_mn, formulacao_origem_id')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome')

    setInsumos(data as InsumoOption[] || [])
  }

  // Calculate all derived fields
  const calcularFormulacao = (items: DietaInsumoCalc[]): DietaInsumoCalc[] => {
    // Step 1: Calculate formula_mn_bruta for each item (keep full precision)
    const withBruta = items.map(item => {
      const ms = item.teor_ms / 100
      const mnBruta = ms > 0 ? (item.formula_teor_ms / ms) : 0
      return { ...item, formula_mn_bruta: mnBruta }
    })

    // Step 2: Normalize to 100% (keep 4 decimal places for percent)
    const totalBruta = withBruta.reduce((sum, i) => sum + (i.formula_mn_bruta || 0), 0)
    const withNormalized = withBruta.map(item => {
      const mnPercent = totalBruta > 0 ? ((item.formula_mn_bruta || 0) / totalBruta) * 100 : 0
      return { ...item, formula_mn_percent: mnPercent }
    })

    // Step 3: Calculate costs and consumption per kg of PV (independent of categoria)
    const metaPV = parseFloat(formData.consumo_ms_percent_pv) || 0
    const consumoMSBase = (metaPV / 100)
    return withNormalized.map(item => {
      const ms = item.teor_ms / 100
      const custoTonelada = (item.formula_mn_percent || 0) * item.preco_ton_mn / 100
      const custoKgMN = custoTonelada / 1000
      const custoKgMS = ms > 0 ? custoKgMN / ms : 0
      // Consumo por kg de peso vivo (kg de MS/MN por kg de PV/dia)
      const consumoMNporKgPV = consumoMSBase * ((item.formula_mn_percent || 0) / 100)
      const consumoMSporKgPV = consumoMNporKgPV * ms
      return {
        ...item,
        custo_kg_mn: custoKgMN,
        custo_kg_ms: custoKgMS,
        consumo_kg_mn_por_kg_pv: consumoMNporKgPV,
        consumo_kg_ms_por_kg_pv: consumoMSporKgPV,
      }
    })
  }

  const recalculated = useMemo(
    () => calcularFormulacao(selectedInsumos),
    [selectedInsumos, formData.consumo_ms_percent_pv]
  )

  // Compute totals from exact (unrounded) values
  const custoTotalExact = recalculated.reduce((sum, i) => sum + ((i.custo_kg_mn || 0) * 1000), 0)
  const teorMSDietaExact = recalculated.reduce((sum, i) => sum + ((i.formula_mn_percent || 0) * i.teor_ms), 0) / 100

  const custoTotal = parseFloat(custoTotalExact.toFixed(2))
  const teorMSDieta = parseFloat(teorMSDietaExact.toFixed(2))
  // Custo por kg (independente de categoria e peso vivo)
  const custoKgMN = parseFloat((custoTotalExact / 1000).toFixed(4))
  const custoKgMS = parseFloat((custoTotalExact / (teorMSDietaExact / 100) / 1000).toFixed(4))

  // Detecta se há um premix (insumo gerado) selecionado como ingrediente
  const temPremixSelecionado = selectedInsumos.some(s => {
    const insumo = insumos.find(i => i.id === s.insumo_id)
    return insumo?.formulacao_origem_id != null
  })

  const handleAddInsumo = (insumoId: string) => {
    const insumo = insumos.find(i => i.id === insumoId)
    if (!insumo || selectedInsumos.some(s => s.insumo_id === insumoId)) return
    setSelectedInsumos(prev => [...prev, {
      insumo_id: insumo.id,
      nome: insumo.nome,
      teor_ms: insumo.teor_ms || 0,
      preco_ton_mn: insumo.preco_ton_mn || 0,
      formula_teor_ms: 0,
    }])
  }

  const handleRemoveInsumo = (index: number) => {
    setSelectedInsumos(prev => prev.filter((_, i) => i !== index))
  }

  const formulaMsTotal = selectedInsumos.reduce((sum, i) => sum + i.formula_teor_ms, 0)

  const handleFormulaChange = (index: number, val: number) => {
    setSelectedInsumos(prev => {
      const next = [...prev]
      const currentVal = next[index]?.formula_teor_ms || 0
      const otherSum = formulaMsTotal - currentVal
      const maxAllowed = Math.max(0, 100 - otherSum)
      const clamped = Math.min(val, maxAllowed)
      next[index] = { ...next[index], formula_teor_ms: parseFloat(clamped.toFixed(2)) }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saveWarning) {
      // Segunda chamada: usuário confirmou, prosseguir com o save
      setSaveWarning(null)
    }
    setSubmitting(true)

    if (!user) {
      setSubmitting(false)
      return
    }

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmitting(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id
    const metaPV = parseFloat(parseFloat(formData.consumo_ms_percent_pv || '0').toFixed(2))
    const gmd = null

    // Validação bloqueante: colisão de nome com insumo atômico ativo
    if (formData.e_premix) {
      const { data: colisao } = await supabase
        .from('insumos')
        .select('id, nome')
        .eq('fazenda_id', fazendaId)
        .eq('nome', formData.nome)
        .eq('ativo', true)
        .is('formulacao_origem_id', null)
        .maybeSingle()

      if (colisao) {
        toast.error(
          `Já existe um insumo atômico chamado "${formData.nome}". ` +
          `Renomeie a formulação ou o insumo existente para evitar confusão no select de ingredientes.`
        )
        setSubmitting(false)
        return
      }
    }

    // Verificar se categorias em uso por lotes ativos foram removidas
    if (editingFormulacao && !formData.e_premix && !saveWarning) {
      const categoriasAtuais = categoriasGmd.map(c => c.categoria.toLowerCase().trim())
      const categoriasRemovidas = Object.keys(blockedCategorias).filter(cat => !categoriasAtuais.includes(cat))
      if (categoriasRemovidas.length > 0) {
        const detalhes = categoriasRemovidas.map(cat => ({
          categoria: cat,
          lotes: blockedCategorias[cat],
        }))
        setSaveWarning({ categoriasRemovidas: detalhes })
        setSubmitting(false)
        return
      }
    }

    const data = {
      fazenda_id: fazendaId,
      nome: formData.nome,
      descricao: formData.descricao || null,
      tipo: formData.tipo || null,
      consumo_ms_percent_pv: formData.e_premix ? 0 : metaPV,
      gmd: formData.e_premix ? null : (gmd || null),
      ativo: formData.ativo,
      e_premix: formData.e_premix,
      sistema_producao: formData.sistema_producao || null,
      categoria_inferida_automaticamente: false,
      categoria_inferida_observacao: null,
    }

    let error
    let savedFormulacaoId: string | null = null
    if (editingFormulacao) {
      const { error: updateError } = await supabase
        .from('formulacoes')
        .update(data)
        .eq('id', editingFormulacao.id)
      error = updateError
      savedFormulacaoId = editingFormulacao.id
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('formulacoes')
        .insert(data)
        .select('id')
        .single()
      error = insertError
      savedFormulacaoId = inserted?.id || null
    }

    if (error) {
      console.error('Erro ao salvar formulação:', error)
    } else {
      // Sincronizar insumos na tabela de junção (DELETE + INSERT)
      // O trigger recalcula automaticamente os campos derivados de formulacoes
      if (savedFormulacaoId) {
        await supabase
          .from('formulacao_insumos')
          .delete()
          .eq('formulacao_id', savedFormulacaoId)

        if (recalculated.length > 0) {
          const juncaoRows = recalculated.map((item, idx) => ({
            formulacao_id: savedFormulacaoId,
            insumo_id: item.insumo_id,
            formula_teor_ms: item.formula_teor_ms,
            ordem: idx,
          }))
          const { error: juncaoError } = await supabase
            .from('formulacao_insumos')
            .insert(juncaoRows)
          if (juncaoError) {
            console.error('Erro ao salvar insumos da formulação:', juncaoError)
          }
        }

        // Sincronizar categorias GMD (DELETE + INSERT)
        if (!formData.e_premix) {
          await supabase
            .from('formulacao_categorias_gmd')
            .delete()
            .eq('formulacao_id', savedFormulacaoId)

          if (categoriasGmd.length > 0) {
            const fcgRows = categoriasGmd.map((cat, idx) => ({
              formulacao_id: savedFormulacaoId,
              categoria: cat.categoria.toLowerCase().trim(),
              gmd: cat.gmd,
              ordem: idx,
            }))
            const { error: fcgError } = await supabase
              .from('formulacao_categorias_gmd')
              .insert(fcgRows)
            if (fcgError) {
              console.error('Erro ao salvar categorias GMD:', fcgError)
            }
          }
        }
      }

      // Upsert do insumo gerado se a formulação é premix
      if (formData.e_premix && savedFormulacaoId) {
        const insumoData = {
          fazenda_id: fazendaId,
          nome: formData.nome,
          tipo: 'Premix',
          teor_ms: teorMSDieta,
          preco_ton_mn: custoTotal,
          ativo: formData.ativo,
          deleted_at: formData.ativo ? null : new Date().toISOString(),
          formulacao_origem_id: savedFormulacaoId,
        }

        const { data: existingInsumo } = await supabase
          .from('insumos')
          .select('id')
          .eq('formulacao_origem_id', savedFormulacaoId)
          .maybeSingle()

        if (existingInsumo) {
          await supabase.from('insumos').update(insumoData).eq('id', existingInsumo.id)
        } else {
          await supabase.from('insumos').insert(insumoData)
        }
      }

      // Desmarcação do premix: desativar insumo gerado
      if (!formData.e_premix && editingFormulacao?.e_premix) {
        await supabase
          .from('insumos')
          .update({ ativo: false, deleted_at: new Date().toISOString() })
          .eq('formulacao_origem_id', editingFormulacao.id)
      }

      setFormData({
        nome: '',
        descricao: '',
        tipo: '',
        categoria: '',
        consumo_ms_percent_pv: '0.30',
        peso_vivo_medio: '435.00',
        gmd: '0,000',
        sistema_producao: '',
        ativo: true,
        e_premix: false,
      })
      setSelectedInsumos([])
      setCategoriasGmd([])
      setBlockedCategorias({})
      setSaveWarning(null)
      setShowForm(false)
      setEditingFormulacao(null)
      await Promise.all([loadFormulacoes(), loadInsumos()])
    }
    setSubmitting(false)
  }

  const handleNewForm = () => {
    loadInsumos()
    setBlockedCategorias({})
    setSaveWarning(null)
    setShowForm(true)
  }

  const handleEdit = async (dieta: Dieta) => {
    loadInsumos()
    setEditingFormulacao(dieta)
    setFormData({
      nome: dieta.nome,
      descricao: dieta.descricao || '',
      tipo: dieta.tipo || '',
      categoria: dieta.categoria || '',
      consumo_ms_percent_pv: dieta.consumo_ms_percent_pv?.toFixed(2) || '0.30',
      peso_vivo_medio: dieta.peso_vivo_medio?.toFixed(2) || '435.00',
      gmd: dieta.gmd?.toFixed(3).replace('.', ',') || '0,000',
      sistema_producao: dieta.sistema_producao || '',
      ativo: dieta.ativo,
      e_premix: dieta.e_premix ?? false,
    })

    // Buscar insumos da tabela de junção com JOIN em insumos
    const { data: juncaoData } = await supabase
      .from('formulacao_insumos')
      .select(`
        formula_teor_ms,
        ordem,
        insumo:insumos!insumo_id(id, nome, teor_ms, preco_ton_mn)
      `)
      .eq('formulacao_id', dieta.id)
      .order('ordem', { ascending: true })

    const insumosFromJuncao: DietaInsumoCalc[] = (juncaoData || []).map((row: any) => ({
      insumo_id: row.insumo?.id || '',
      nome: row.insumo?.nome || '',
      teor_ms: row.insumo?.teor_ms || 0,
      preco_ton_mn: row.insumo?.preco_ton_mn || 0,
      formula_teor_ms: row.formula_teor_ms || 0,
    }))

    setSelectedInsumos(insumosFromJuncao)

    // Carregar categorias GMD da formulação
    const { data: fcgData } = await supabase
      .from('formulacao_categorias_gmd')
      .select('id, formulacao_id, categoria, gmd, ordem')
      .eq('formulacao_id', dieta.id)
      .order('ordem', { ascending: true })

    // Verificar quais categorias estão em uso por lotes ativos (bloquear remoção)
    // Fazer todas as queries antes de setar estado para evitar race condition
    const blockedMap: Record<string, { nome: string; categorias: string[] }[]> = {}
    const { data: lotesAfetados } = await supabase
      .from('lotes')
      .select('id, nome')
      .eq('formulacao_id', dieta.id)
      .eq('ativo', true)

    if (lotesAfetados && lotesAfetados.length > 0) {
      // Buscar todas as categorias ativas de todos os lotes afetados em uma query
      const loteIds = lotesAfetados.map(l => l.id)
      const { data: allCats } = await supabase
        .from('lote_categorias')
        .select('lote_id, categoria')
        .in('lote_id', loteIds)
        .eq('ativo', true)
        .is('data_fim', null)

      // Indexar categorias por lote
      const catsByLote: Record<string, string[]> = {}
      for (const c of (allCats || [])) {
        const key = c.lote_id
        if (!catsByLote[key]) catsByLote[key] = []
        catsByLote[key].push(c.categoria.toLowerCase().trim())
      }

      // Para cada categoria da formulação, verificar quais lotes a usam
      for (const cat of (fcgData || [])) {
        const catName = cat.categoria.toLowerCase().trim()
        const lotesCom: { nome: string; categorias: string[] }[] = []
        for (const lote of lotesAfetados) {
          const loteCats = catsByLote[lote.id] || []
          if (loteCats.includes(catName)) {
            lotesCom.push({ nome: lote.nome, categorias: [cat.categoria] })
          }
        }
        if (lotesCom.length > 0) {
          blockedMap[catName] = lotesCom
        }
      }
    }

    // Setar todo o estado junto para evitar re-render com estado parcial
    setCategoriasGmd((fcgData || []) as FormulacaoCategoriaGmd[])
    setBlockedCategorias(blockedMap)

    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingFormulacao(null)
    setFormData({
      nome: '',
      descricao: '',
      tipo: '',
      categoria: '',
      consumo_ms_percent_pv: '0.30',
      peso_vivo_medio: '435.00',
      gmd: '0,000',
      sistema_producao: '',
      ativo: true,
      e_premix: false,
    })
    setSelectedInsumos([])
    setCategoriasGmd([])
    setBlockedCategorias({})
    setSaveWarning(null)
    setShowForm(false)
  }

  const handleToggleActive = async (dieta: Dieta) => {
    // Se está desativando, verificar se a formulação está em uso por lotes ativos
    if (dieta.ativo) {
      const { data: lotesUsando } = await supabase
        .from('lotes')
        .select('id, nome')
        .eq('formulacao_id', dieta.id)
        .eq('ativo', true)
      if (lotesUsando && lotesUsando.length > 0) {
        toast.error(`Não é possível desativar a formulação "${dieta.nome}" porque está em uso por ${lotesUsando.length} ${lotesUsando.length === 1 ? 'lote ativo' : 'lotes ativos'}: ${lotesUsando.map(l => l.nome).join(', ')}. Remova a formulação dos lotes antes de desativar.`)
        return
      }
    }

    const updates: { ativo: boolean; deleted_at?: string | null } = { ativo: !dieta.ativo }
    if (!dieta.ativo) {
      // Reativando: limpa o deleted_at
      updates.deleted_at = null
    } else {
      // Desativando: marca deleted_at (soft delete)
      updates.deleted_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('formulacoes')
      .update(updates)
      .eq('id', dieta.id)

    if (error) {
      console.error('Erro ao atualizar formulação:', error)
    } else {
      // Se a formulação é premix, desativar/reativar o insumo gerado junto
      if (dieta.e_premix) {
        await supabase
          .from('insumos')
          .update({ ativo: !dieta.ativo, deleted_at: !dieta.ativo ? new Date().toISOString() : null })
          .eq('formulacao_origem_id', dieta.id)
      }
      await Promise.all([loadFormulacoes(), loadInsumos()])
    }
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar formulações',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
    {
      key: 'Escape',
      description: 'Fechar formulário',
      action: () => {
        if (showForm) handleCancel()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Formulações</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar formulação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-gray-200 focus:border-accent h-10"
          />
          <button
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className={`px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-200 border-2 whitespace-nowrap h-10 ${
              showInactive
                ? 'bg-primary text-white border-primary hover:bg-primary/90'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {showInactive ? (
              <>
                <span className="sm:hidden">✓ Mostrando</span>
                <span className="hidden sm:inline">✓ Mostrando Desativados</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Mostrar</span>
                <span className="hidden sm:inline">Mostrar Desativados</span>
              </>
            )}
          </button>
          <select
            value={premixFilter}
            onChange={(e) => setPremixFilter(e.target.value as 'todos' | 'tmr' | 'premix')}
            className="px-3 py-2 rounded-lg font-medium transition-all duration-200 border-2 h-10 bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="todos">Todas</option>
            <option value="tmr">Só TMR</option>
            <option value="premix">Só Premix</option>
          </select>
          <Button onClick={handleNewForm} className="h-10">Nova Formulação</Button>
        </div>
      </div>

      {!showForm && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSistemaFilter('todos')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${sistemaFilter === 'todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Todos <span className="opacity-60 ml-1">{formulacoes.filter(d => (showInactive || d.ativo) && (premixFilter === 'todos' || (premixFilter === 'premix' && d.e_premix) || (premixFilter === 'tmr' && !d.e_premix)) && (d.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (d.tipo && d.tipo.toLowerCase().includes(searchTerm.toLowerCase())))).length}</span>
          </button>
          <button
            onClick={() => setSistemaFilter('pasto')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${sistemaFilter === 'pasto' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Pasto <span className="opacity-60 ml-1">{formulacoes.filter(d => (showInactive || d.ativo) && (premixFilter === 'todos' || (premixFilter === 'premix' && d.e_premix) || (premixFilter === 'tmr' && !d.e_premix)) && d.sistema_producao !== 'Confinamento' && (d.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (d.tipo && d.tipo.toLowerCase().includes(searchTerm.toLowerCase())))).length}</span>
          </button>
          <button
            onClick={() => setSistemaFilter('confinamento')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${sistemaFilter === 'confinamento' ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Confinamento <span className="opacity-60 ml-1">{formulacoes.filter(d => (showInactive || d.ativo) && (premixFilter === 'todos' || (premixFilter === 'premix' && d.e_premix) || (premixFilter === 'tmr' && !d.e_premix)) && d.sistema_producao === 'Confinamento' && (d.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (d.tipo && d.tipo.toLowerCase().includes(searchTerm.toLowerCase())))).length}</span>
          </button>
        </div>
      )}

      {showForm && (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              {editingFormulacao ? 'Editar Formulação' : 'Nova Formulação'}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Fechar formulário"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Nome *</label>
                <Input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Nome da formulação"
                  className="border-gray-200 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Tipo</label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base border-gray-200 focus:border-accent bg-white"
                >
                  <option value="">Selecione...</option>
                  <option value="Sal Mineral">Sal Mineral</option>
                  <option value="Sal Adensado">Sal Adensado</option>
                  <option value="Proteico">Proteico</option>
                  <option value="Proteico-Energético">Proteico-Energético</option>
                  <option value="Ração">Ração</option>
                </select>
              </div>
              {!formData.e_premix && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Meta Consumo MS (%PV)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.consumo_ms_percent_pv}
                  onChange={(e) => setFormData({ ...formData, consumo_ms_percent_pv: e.target.value })}
                  placeholder="Ex: 0.30"
                  className="border-gray-200 focus:border-accent"
                />
              </div>
              )}
              {/* Categoria oculta: custo por categoria será calculado futuramente */}
            </div>

            {/* Descrição */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Descrição</label>
                <Input
                  type="text"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição opcional"
                  className="border-gray-200 focus:border-accent"
                />
              </div>
              {/* Peso Vivo Médio oculto: custo por categoria será calculado futuramente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Sistema de Produção</label>
                <select
                  value={formData.sistema_producao}
                  onChange={(e) => setFormData({ ...formData, sistema_producao: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base border-gray-200 focus:border-accent bg-white"
                >
                  <option value="">Ambos</option>
                  <option value="Pasto">Pasto</option>
                  <option value="Confinamento">Confinamento</option>
                </select>
              </div>
            </div>

            {/* Categorias GMD por formulação (TMR only) */}
            {!formData.e_premix && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">GMD por Categoria</label>
                <span className="text-xs text-gray-500">Define o GMD usado para evolução de peso de cada categoria do lote</span>
              </div>

              {categoriasGmd.length > 0 && (
                <div className="space-y-2 mb-3">
                  {categoriasGmd.map((cat, idx) => {
                    const catKey = cat.categoria.toLowerCase().trim()
                    const blocked = blockedCategorias[catKey]
                    return (
                    <div key={idx} className="bg-gray-50 rounded-lg p-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 capitalize">{cat.categoria}</span>
                          {blocked && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded font-medium">
                              em uso ({blocked.length} {blocked.length === 1 ? 'lote' : 'lotes'})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <DecimalInput
                            value={cat.gmd}
                            onChange={(val) => {
                              setCategoriasGmd(prev => prev.map((c, i) => i === idx ? { ...c, gmd: val } : c))
                            }}
                            decimals={3}
                            className="w-24 text-right border-gray-200 focus:border-accent py-1"
                          />
                          <span className="text-xs text-gray-500">kg/dia</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoriasGmd(prev => prev.filter((_, i) => i !== idx))
                          }}
                          title={blocked ? 'Categoria em uso: confirmação será pedida ao salvar' : 'Remover categoria'}
                          className={`transition-colors p-1 ${
                            blocked ? 'text-amber-400 hover:text-amber-600' : 'text-red-400 hover:text-red-600'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {blocked && (
                        <p className="text-xs text-amber-700 mt-1 pl-1">
                          Em uso no {blocked.map(l => l.nome).join(', ')}. Remover fará essa categoria parar de evoluir peso. Confirmação será pedida ao salvar.
                        </p>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}

              {categoriasGmd.length === 0 && (
                <p className="text-sm text-gray-500 mb-3">Nenhuma categoria com GMD cadastrada. Adicione categorias abaixo.</p>
              )}

              <select
                onChange={(e) => {
                  if (e.target.value) {
                    const cat = e.target.value
                    if (!categoriasGmd.some(c => c.categoria.toLowerCase().trim() === cat.toLowerCase().trim())) {
                      setCategoriasGmd(prev => [...prev, { categoria: cat, gmd: 0, ordem: prev.length }])
                    }
                    e.target.value = ''
                  }
                }}
                className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white text-sm"
              >
                <option value="">Adicionar categoria...</option>
                {CATEGORIAS_DISPONIVEIS.map(cat => (
                  <option key={cat} value={cat}>{capitalizeWords(cat)}</option>
                ))}
              </select>
            </div>
            )}

            {/* Premix toggle (always visible) */}
            {/* Premix toggle (hidden when a premix is selected as ingredient, to prevent nested premix) */}
            {!temPremixSelecionado && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, e_premix: !formData.e_premix })}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 border-2 ${
                  formData.e_premix
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                    : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {formData.e_premix ? '✓ Premix' : 'Premix'}
              </button>
              <span className="text-xs text-gray-500 leading-tight">
                Marque se esta formulação é um premix. Ela gerará automaticamente um insumo
                para uso em outras formulações (TMR do vagão).
              </span>
            </div>
            )}
            {temPremixSelecionado && formData.e_premix && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-300 text-xs text-blue-900">
                Esta formulação contém um premix como ingrediente, então não pode ser um premix.
                O modo premix foi desativado.
              </div>
            )}

            {/* Add insumo */}
            <div className="border-t border-gray-200 pt-4">
              {formData.e_premix && selectedInsumos.length === 0 && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
                  <p className="font-semibold mb-1">Premix sem insumos</p>
                  <p>
                    Um premix deve conter pelo menos um insumo para gerar um ingrediente válido
                    (com teor MS e preço corretos). Adicione os ingredientes do premix abaixo.
                  </p>
                </div>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-2">Adicionar Insumo</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddInsumo(e.target.value)
                    e.target.value = ''
                  }
                }}
                className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white text-sm"
              >
                <option value="">Selecione um insumo...</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} {i.teor_ms !== undefined ? `(Teor MS: ${i.teor_ms}%)` : ''} {i.preco_ton_mn !== undefined ? `- R$ ${i.preco_ton_mn}/Ton/MN` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Formulation Table */}
            {selectedInsumos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-center p-2 font-medium text-gray-700">Insumos</th>
                      <th className="text-center p-2 font-medium text-gray-700">Teor MS (%)</th>
                      <th className="text-center p-2 font-medium text-gray-700">Preço (R$/Ton/MN)</th>
                      <th className="text-center p-2 font-medium text-gray-700 bg-green-50">Form. MS (%)</th>
                      <th className="text-center p-2 font-medium text-gray-700">Form. MN (%)</th>
                      <th className="text-center p-2 font-medium text-gray-700">Custo (R$/kg MN)</th>
                      <th className="text-center p-2 font-medium text-gray-700">Custo (R$/kg MS)</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recalculated.map((item, idx) => (
                      <tr key={item.insumo_id + idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2 text-center font-medium text-gray-800">{item.nome}</td>
                        <td className="p-2 text-center text-gray-600">{fmt(item.teor_ms)}%</td>
                        <td className="p-2 text-center text-gray-600">
                          R$ {(item.preco_ton_mn || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center bg-green-50">
                          <DecimalInput
                            id={`formula-ms-${idx}`}
                            value={item.formula_teor_ms}
                            onChange={(val) => handleFormulaChange(idx, val)}
                            className="w-20 text-center border-gray-200 focus:border-accent py-1"
                          />
                        </td>
                        <td className="p-2 text-center text-gray-600">{fmt(item.formula_mn_percent || 0)}%</td>
                        <td className="p-2 text-center text-gray-600">
                          R$ {(item.custo_kg_mn || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </td>
                        <td className="p-2 text-center text-gray-600">
                          R$ {(item.custo_kg_ms || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveInsumo(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="p-2 text-center text-gray-800">Total</td>
                      <td className="p-2 text-center text-gray-800 relative" title="Teor de Matéria Seca da Dieta">
                        {fmt(teorMSDieta)}%
                        <span className="absolute bottom-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-yellow-400"></span>
                      </td>
                      <td className="p-2"></td>
                      <td className={`p-2 text-center ${Math.abs(formulaMsTotal - 100) < 0.01 ? 'text-green-700' : 'text-amber-600'}`}>
                        {fmt(formulaMsTotal)}%
                      </td>
                      <td className="p-2 text-center text-gray-800">
                        {fmt(recalculated.reduce((s, i) => s + (i.formula_mn_percent || 0), 0))}%
                      </td>
                      <td className="p-2 text-center text-gray-800">
                        R$ {custoKgMN.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                      <td className="p-2 text-center text-gray-800">
                        R$ {custoKgMS.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                      <td className="p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Banner de resumo removido: custo por categoria será calculado futuramente */}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar Formulação'}
              </Button>
              <Button variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, ativo: !formData.ativo })}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 border-2 ${
                  formData.ativo
                    ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {formData.ativo ? '✓ Ativo' : '✗ Inativo'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && formulacoes.length === 0 ? (
        <Card className="bg-white p-12 border-0 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Nenhuma formulação cadastrada</p>
          <Button onClick={handleNewForm}>Criar Primeira Formulação</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formulacoes
            .filter((dieta) =>
              (showInactive || dieta.ativo) &&
              (premixFilter === 'todos' ||
               (premixFilter === 'premix' && dieta.e_premix) ||
               (premixFilter === 'tmr' && !dieta.e_premix)) &&
              (sistemaFilter === 'todos' ||
               (sistemaFilter === 'pasto' && dieta.sistema_producao !== 'Confinamento') ||
               (sistemaFilter === 'confinamento' && dieta.sistema_producao === 'Confinamento')) &&
              (dieta.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (dieta.tipo && dieta.tipo.toLowerCase().includes(searchTerm.toLowerCase())))
            )
            .map((dieta) => (
              <CardItem
                key={dieta.id}
                title={dieta.nome}
                subtitle={
                  dieta.e_premix
                    ? `Premix • ${capitalizeWords(dieta.tipo || 'Sem tipo')}`
                    : (dieta.tipo ? capitalizeWords(dieta.tipo) : undefined)
                }
                status={dieta.ativo}
                onClick={() => handleEdit(dieta)}
              >
                <div className="space-y-1 mb-4 text-sm text-gray-600">
                  {dieta.sistema_producao && (
                    <p>
                      <span className="font-medium">Sistema:</span>{' '}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dieta.sistema_producao === 'Confinamento' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {dieta.sistema_producao === 'Confinamento' ? 'Confinamento' : 'Pasto'}
                      </span>
                    </p>
                  )}
                  {!dieta.e_premix && dieta.consumo_ms_percent_pv != null && (
                    <p><span className="font-medium">Meta MS (%PV):</span> {fmt(dieta.consumo_ms_percent_pv)}%</p>
                  )}
                  {!dieta.e_premix && dieta.gmd != null && (
                    <p><span className="font-medium">GMD Base:</span> {fmt(dieta.gmd, 3)} kg/Cab/Dia</p>
                  )}
                  {dieta.custo_mn_tonelada != null && (
                    <p><span className="font-medium">Custo MN:</span> R$ {(dieta.custo_mn_tonelada / 1000).toFixed(4)}/kg</p>
                  )}
                  {dieta.custo_ms_tonelada != null && (
                    <p><span className="font-medium">Custo MS:</span> R$ {(dieta.custo_ms_tonelada / 1000).toFixed(4)}/kg</p>
                  )}
                  {dieta.insumos && dieta.insumos.length > 0 && (
                    <p><span className="font-medium">Insumos:</span> {dieta.insumos.length}</p>
                  )}
                </div>

                <div className="flex gap-2 mt-auto pt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(dieta)
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(dieta)
                    }}
                  >
                    {dieta.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              </CardItem>
            ))}
        </div>
      ) : null}

      {/* Aviso ao salvar formulação com categoria removida em uso */}
      <ConfirmModal
        isOpen={!!saveWarning}
        title="Categorias em uso serão removidas"
        variant="danger"
        message={
          saveWarning
            ? `As seguintes categorias estão em uso por lotes ativos e serão removidas da formulação:\n\n${saveWarning.categoriasRemovidas
                .map(c => `  • "${c.categoria}"\n      Lotes afetados: ${c.lotes.map(l => l.nome).join(', ')}`)
                .join('\n\n')}\n\nEssas categorias pararão de evoluir peso (GMD ficará nulo). Deseja continuar?`
            : ''
        }
        onConfirm={() => {
          handleSubmit({ preventDefault: () => {} } as React.FormEvent)
        }}
        onClose={() => setSaveWarning(null)}
      />
    </div>
  )
}
