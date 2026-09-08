import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, ConfirmModal, useToast } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface LinhaConfinamento {
  id: string
  fazenda_id: string
  nome: string
  largura_m: number | null
  comprimento_m: number | null
  metros_cocho_m: number | null
  ativo: boolean
}

interface Curral {
  id: string
  fazenda_id: string
  nome: string
  lote_id: string | null
  formulacao_id: string | null
  linha_id: string | null
  ativo: boolean
  lote_nome?: string
  formulacao_nome?: string
}

interface Lote {
  id: string
  nome: string
  n_cabecas?: number | null
  pasto_id?: string | null
}

interface CategoriaInfo {
  categoria: string
  quant_atual: number | null
  peso_vivo_atual_kg_cab: number | null
  gmd: string | null
  estrategia_nutricional: string | null
}

interface LoteInfo {
  n_cabecas: number | null
  peso_vivo_medio: number | null
  gmd_medio: number | null
  estrategias: string[]
  categorias: CategoriaInfo[]
  formulacao_nome: string | null
}

function formatCategoria(texto: string): string {
  return texto
    .split(' ')
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''))
    .join(' ')
}

export function Currais() {
  const { user } = useAuth()
  const toast = useToast()
  const [linhas, setLinhas] = useState<LinhaConfinamento[]>([])
  const [currais, setCurrais] = useState<Curral[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  // Linha form
  const [showLinhaForm, setShowLinhaForm] = useState(false)
  const [editingLinha, setEditingLinha] = useState<LinhaConfinamento | null>(null)
  const [linhaFormData, setLinhaFormData] = useState({
    nome: '',
    largura_m: '',
    comprimento_m: '',
    metros_cocho_m: '',
  })
  const [submittingLinha, setSubmittingLinha] = useState(false)

  // Curral form
  const [showCurralForm, setShowCurralForm] = useState(false)
  const [editingCurral, setEditingCurral] = useState<Curral | null>(null)
  const [curralFormData, setCurralFormData] = useState({
    nome: '',
    lote_id: '',
    linha_id: '',
  })
  const [loteInfo, setLoteInfo] = useState<LoteInfo | null>(null)
  const [fetchingLoteInfo, setFetchingLoteInfo] = useState(false)
  const [submittingCurral, setSubmittingCurral] = useState(false)

  // Expanded linha accordion
  const [expandedLinha, setExpandedLinha] = useState<string | null>(null)

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'linha' | 'curral'; id: string; nome: string } | null>(null)

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((linha) => {
      if (!showInactive && !linha.ativo) return false
      return true
    })
  }, [linhas, showInactive])

  const curraisPorLinha = useMemo(() => {
    const map: Record<string, Curral[]> = {}
    currais.forEach((c) => {
      if (c.linha_id) {
        if (!map[c.linha_id]) map[c.linha_id] = []
        map[c.linha_id].push(c)
      }
    })
    return map
  }, [currais])

  const curraisSemLinha = useMemo(() => {
    return currais.filter((c) => !c.linha_id)
  }, [currais])

  const loadData = async () => {
    if (!user) return
    setLoading(true)

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setLoading(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const [linhasData, curraisData, lotesData] = await Promise.all([
      supabase
        .from('linhas_confinamento')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .order('nome', { ascending: true }),
      supabase
        .from('currais')
        .select('*, lotes(nome)')
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .order('nome', { ascending: true }),
      supabase.from('lotes').select('id, nome, n_cabecas, pasto_id').eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null).order('nome'),
    ])

    if (linhasData.error) {
      console.error('Erro ao buscar linhas:', linhasData.error)
    } else {
      setLinhas(linhasData.data || [])
    }

    let curraisMapeados: Curral[] = []
    if (curraisData.error) {
      console.error('Erro ao buscar currais:', curraisData.error)
    } else {
      curraisMapeados = (curraisData.data || []).map((c: any) => ({
        ...c,
        lote_nome: c.lotes?.nome || null,
        formulacao_nome: null,
      }))
    }

    // Buscar formulação ativa do plano nutricional vigente de cada lote vinculado
    const lotesComCurral = curraisMapeados
      .filter((c) => c.lote_id)
      .map((c) => c.lote_id as string)
    if (lotesComCurral.length > 0) {
      const { data: planosData } = await supabase
        .from('planos_nutricionais')
        .select('lote_id, formulacao_id, formulacoes!inner(nome)')
        .in('lote_id', lotesComCurral)
        .is('data_fim', null)
      if (planosData) {
        const formulacoesPorLote: Record<string, string> = {}
        for (const p of planosData as any[]) {
          if (p.lote_id && p.formulacoes?.nome && !formulacoesPorLote[p.lote_id]) {
            formulacoesPorLote[p.lote_id] = p.formulacoes.nome
          }
        }
        curraisMapeados = curraisMapeados.map((c) =>
          c.lote_id && formulacoesPorLote[c.lote_id]
            ? { ...c, formulacao_nome: formulacoesPorLote[c.lote_id] }
            : c
        )
      }
    }
    setCurrais(curraisMapeados)

    if (lotesData.error) {
      console.error('Erro ao buscar lotes:', lotesData.error)
    } else {
      setLotes(lotesData.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [user])

  const fetchLoteInfo = async (loteId: string) => {
    if (!loteId) {
      setLoteInfo(null)
      return
    }
    setFetchingLoteInfo(true)
    try {
      const [loteData, categoriasData, planoData] = await Promise.all([
        supabase.from('lotes').select('n_cabecas').eq('id', loteId).single(),
        supabase
          .from('lote_categorias')
          .select('categoria, quant_atual, peso_vivo_atual_kg_cab, gmd, estrategia_nutricional')
          .eq('lote_id', loteId)
          .eq('ativo', true),
        supabase
          .from('planos_nutricionais')
          .select('formulacao_id, formulacoes!inner(nome)')
          .eq('lote_id', loteId)
          .is('data_fim', null)
          .order('data_inicio', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const categorias: CategoriaInfo[] = (categoriasData.data || []).map((c: any) => ({
        categoria: c.categoria,
        quant_atual: c.quant_atual,
        peso_vivo_atual_kg_cab: c.peso_vivo_atual_kg_cab,
        gmd: c.gmd,
        estrategia_nutricional: c.estrategia_nutricional,
      }))

      const totalCabecas = categorias.reduce((sum, c) => sum + (c.quant_atual ?? 0), 0)

      const pesoTotal = categorias.reduce(
        (sum, c) => sum + ((c.quant_atual ?? 0) * (c.peso_vivo_atual_kg_cab ?? 0)),
        0
      )

      const gmdTotal = categorias.reduce((sum, c) => {
        const gmdNum = c.gmd ? parseFloat(c.gmd) : 0
        return sum + ((c.quant_atual ?? 0) * (Number.isFinite(gmdNum) ? gmdNum : 0))
      }, 0)

      const estrategias = Array.from(
        new Set(categorias.map((c) => c.estrategia_nutricional).filter(Boolean))
      ) as string[]

      setLoteInfo({
        n_cabecas: loteData.data?.n_cabecas ?? null,
        peso_vivo_medio: totalCabecas > 0 ? pesoTotal / totalCabecas : null,
        gmd_medio: totalCabecas > 0 ? gmdTotal / totalCabecas : null,
        estrategias,
        categorias,
        formulacao_nome: (planoData.data as any)?.formulacoes?.nome ?? null,
      })
    } catch {
      setLoteInfo(null)
    }
    setFetchingLoteInfo(false)
  }

  // Linha handlers
  const handleLinhaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingLinha(true)

    if (!user) {
      setSubmittingLinha(false)
      return
    }

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmittingLinha(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const data = {
      fazenda_id: fazendaId,
      nome: linhaFormData.nome,
      largura_m: linhaFormData.largura_m ? parseFloat(linhaFormData.largura_m) : null,
      comprimento_m: linhaFormData.comprimento_m ? parseFloat(linhaFormData.comprimento_m) : null,
      metros_cocho_m: linhaFormData.metros_cocho_m ? parseFloat(linhaFormData.metros_cocho_m) : null,
    }

    let error
    if (editingLinha) {
      const { error: updateError } = await supabase.from('linhas_confinamento').update(data).eq('id', editingLinha.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('linhas_confinamento').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar linha:', error)
    } else {
      setLinhaFormData({ nome: '', largura_m: '', comprimento_m: '', metros_cocho_m: '' })
      setEditingLinha(null)
      setShowLinhaForm(false)
      loadData()
    }

    setSubmittingLinha(false)
  }

  const handleLinhaEdit = (linha: LinhaConfinamento) => {
    setEditingLinha(linha)
    setLinhaFormData({
      nome: linha.nome,
      largura_m: linha.largura_m?.toString() || '',
      comprimento_m: linha.comprimento_m?.toString() || '',
      metros_cocho_m: linha.metros_cocho_m?.toString() || '',
    })
    setShowLinhaForm(true)
  }

  const handleLinhaCancel = () => {
    setEditingLinha(null)
    setLinhaFormData({ nome: '', largura_m: '', comprimento_m: '', metros_cocho_m: '' })
    setShowLinhaForm(false)
  }

  const handleLinhaToggleActive = async (linha: LinhaConfinamento) => {
    const { error } = await supabase.from('linhas_confinamento').update({ ativo: !linha.ativo }).eq('id', linha.id)
    if (error) {
      console.error('Erro ao atualizar linha:', error)
    } else {
      loadData()
    }
  }

  const handleLinhaDelete = async (id: string) => {
    // Desassociar todos os currais da linha antes de excluir
    await supabase.from('currais').update({ linha_id: null, lote_id: null }).eq('linha_id', id)
    const { error } = await supabase.from('linhas_confinamento').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      console.error('Erro ao excluir linha:', error)
    } else {
      loadData()
    }
  }

  // Curral handlers
  const handleCurralSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingCurral(true)

    if (!user) {
      setSubmittingCurral(false)
      return
    }

    // Validar: lote com pasto nao pode ser vinculado a curral
    if (curralFormData.lote_id) {
      const loteSel = lotes.find(l => l.id === curralFormData.lote_id)
      if (loteSel?.pasto_id) {
        toast.error('Este lote está alocado em um pasto e não pode ser vinculado a um curral simultaneamente. Remova-o do pasto primeiro.')
        setSubmittingCurral(false)
        return
      }
    }

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmittingCurral(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const data = {
      fazenda_id: fazendaId,
      nome: curralFormData.nome,
      lote_id: curralFormData.lote_id || null,
      linha_id: curralFormData.linha_id || null,
    }

    let error
    if (editingCurral) {
      const { error: updateError } = await supabase.from('currais').update(data).eq('id', editingCurral.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('currais').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar curral:', error)
    } else {
      setCurralFormData({ nome: '', lote_id: '', linha_id: '' })
      setLoteInfo(null)
      setEditingCurral(null)
      setShowCurralForm(false)
      loadData()
    }

    setSubmittingCurral(false)
  }

  const handleCurralEdit = (curral: Curral) => {
    setEditingCurral(curral)
    setCurralFormData({
      nome: curral.nome,
      lote_id: curral.lote_id || '',
      linha_id: curral.linha_id || '',
    })
    if (curral.lote_id) fetchLoteInfo(curral.lote_id)
    else setLoteInfo(null)
    setShowCurralForm(true)
  }

  const handleCurralCancel = () => {
    setEditingCurral(null)
    setCurralFormData({ nome: '', lote_id: '', linha_id: '' })
    setLoteInfo(null)
    setShowCurralForm(false)
  }

  const handleCurralToggleActive = async (curral: Curral) => {
    // Ao desativar, desassociar o lote do curral automaticamente
    const updates: { ativo: boolean; lote_id?: null } = { ativo: !curral.ativo }
    if (curral.ativo && curral.lote_id) {
      updates.lote_id = null
    }
    const { error } = await supabase.from('currais').update(updates).eq('id', curral.id)
    if (error) {
      console.error('Erro ao atualizar curral:', error)
    } else {
      loadData()
    }
  }

  const handleCurralDelete = async (id: string) => {
    const { error } = await supabase.from('currais').update({ deleted_at: new Date().toISOString(), lote_id: null }).eq('id', id)
    if (error) {
      console.error('Erro ao excluir curral:', error)
    } else {
      loadData()
    }
  }

  const openNewCurralInLinha = (linhaId: string) => {
    setEditingCurral(null)
    setCurralFormData({ nome: '', lote_id: '', linha_id: linhaId })
    setLoteInfo(null)
    setShowCurralForm(true)
  }

  const resetCurralForm = () => {
    setEditingCurral(null)
    setCurralFormData({ nome: '', lote_id: '', linha_id: '' })
    setLoteInfo(null)
    setShowCurralForm(true)
  }

  const resetLinhaForm = () => {
    setEditingLinha(null)
    setLinhaFormData({ nome: '', largura_m: '', comprimento_m: '', metros_cocho_m: '' })
    setShowLinhaForm(true)
  }

  const renderCurralCard = (curral: Curral) => (
    <Card key={curral.id} className="p-4 shadow-sm border-0">
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-semibold text-gray-800">{curral.nome}</h4>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            curral.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {curral.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>
      <div className="space-y-1 text-sm text-gray-600 mb-4">
        <p>
          <span className="font-medium">Lote:</span> {curral.lote_nome || '-'}
        </p>
        <p>
          <span className="font-medium">Formulação:</span> {curral.formulacao_nome || '-'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto pt-3">
        <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => handleCurralEdit(curral)}>
          Editar
        </Button>
        <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => handleCurralToggleActive(curral)}>
          {curral.ativo ? 'Desativar' : 'Ativar'}
        </Button>
        {!curral.ativo && (
          <Button size="sm" variant="secondary" className="flex-1 min-w-[70px] text-red-600 hover:text-red-700" onClick={() => setDeleteTarget({ type: 'curral', id: curral.id, nome: curral.nome })}>
            Excluir
          </Button>
        )}
      </div>
    </Card>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Confinamento</h2>
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!showLinhaForm && !showCurralForm && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Confinamento</h2>
            <p className="text-sm text-gray-500">Linhas e currais de confinamento.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={resetLinhaForm}>Nova Linha</Button>
            <Button variant="secondary" onClick={resetCurralForm}>Novo Curral</Button>
          </div>
        </div>
      )}

      {/* Toggle inativos */}
      {!showLinhaForm && !showCurralForm && (
        <div className="flex justify-end">
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
        </div>
      )}

      {/* Formulário de Linha */}
      {showLinhaForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {editingLinha ? 'Editar Linha' : 'Nova Linha'}
            </h3>
            <button
              type="button"
              onClick={handleLinhaCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Fechar formulário"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleLinhaSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Nome <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={linhaFormData.nome}
                  onChange={(e) => setLinhaFormData({ ...linhaFormData, nome: e.target.value })}
                  required
                  placeholder="Nome da linha"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Largura (m)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={linhaFormData.largura_m}
                  onChange={(e) => setLinhaFormData({ ...linhaFormData, largura_m: e.target.value })}
                  placeholder="0.00"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Comprimento (m)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={linhaFormData.comprimento_m}
                  onChange={(e) => setLinhaFormData({ ...linhaFormData, comprimento_m: e.target.value })}
                  placeholder="0.00"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Metros de cocho (m)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={linhaFormData.metros_cocho_m}
                  onChange={(e) => setLinhaFormData({ ...linhaFormData, metros_cocho_m: e.target.value })}
                  placeholder="0.00"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-8 pt-2">
              <Button type="submit" disabled={submittingLinha}>
                {submittingLinha ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleLinhaCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Formulário de Curral */}
      {showCurralForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {editingCurral ? 'Editar Curral' : 'Novo Curral'}
            </h3>
            <button
              type="button"
              onClick={handleCurralCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Fechar formulário"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleCurralSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Nome <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={curralFormData.nome}
                  onChange={(e) => setCurralFormData({ ...curralFormData, nome: e.target.value })}
                  required
                  placeholder="Nome do curral"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Linha</label>
                <select
                  value={curralFormData.linha_id}
                  onChange={(e) => setCurralFormData({ ...curralFormData, linha_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 text-sm min-h-[44px]"
                >
                  <option value="">Sem linha</option>
                  {linhasFiltradas.map((linha) => (
                    <option key={linha.id} value={linha.id}>
                      {linha.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Lote</label>
                <select
                  value={curralFormData.lote_id}
                  onChange={(e) => {
                    const loteId = e.target.value
                    setCurralFormData({ ...curralFormData, lote_id: loteId })
                    fetchLoteInfo(loteId)
                  }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 text-sm min-h-[44px]"
                >
                  <option value="">Selecione...</option>
                  {lotes.map((lote) => (
                    <option key={lote.id} value={lote.id} disabled={!!lote.pasto_id}>
                      {lote.nome}{lote.pasto_id ? ' (em pasto)' : ''}
                    </option>
                  ))}
                </select>
                {curralFormData.lote_id && lotes.find(l => l.id === curralFormData.lote_id)?.pasto_id && (
                  <p className="text-xs text-red-500 mt-1">
                    Este lote está alocado em um pasto. Remova-o do pasto antes de vincular a um curral.
                  </p>
                )}
              </div>
            </div>

            {/* Info on-the-fly do lote */}
            {curralFormData.lote_id && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700">
                {fetchingLoteInfo ? (
                  <p className="text-gray-500">Carregando...</p>
                ) : loteInfo ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span>
                      <span className="font-medium">Cabeças:</span>{' '}
                      {loteInfo.n_cabecas ??
                        loteInfo.categorias.reduce((sum, c) => sum + (c.quant_atual ?? 0), 0) ??
                        '-'}
                    </span>
                    {loteInfo.formulacao_nome && (
                      <span>
                        <span className="font-medium">Formulação ativa:</span>{' '}
                        {loteInfo.formulacao_nome}
                      </span>
                    )}
                    {loteInfo.peso_vivo_medio != null && loteInfo.peso_vivo_medio > 0 && (
                      <span>
                        <span className="font-medium">PV médio:</span>{' '}
                        {loteInfo.peso_vivo_medio.toFixed(0)} kg
                      </span>
                    )}
                    {loteInfo.gmd_medio != null && loteInfo.gmd_medio > 0 && (
                      <span>
                        <span className="font-medium">GMD:</span>{' '}
                        {loteInfo.gmd_medio.toFixed(2)} kg/dia
                      </span>
                    )}
                    {loteInfo.estrategias.length > 0 && (
                      <span>
                        <span className="font-medium">Dieta:</span>{' '}
                        {loteInfo.estrategias.map(formatCategoria).join(', ')}
                      </span>
                    )}
                    {loteInfo.categorias.length > 0 && (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Categoria(s):</span>
                        {loteInfo.categorias.map((cat, i) => (
                          <span key={i} className="text-gray-700">
                            {formatCategoria(cat.categoria)}
                            {loteInfo.categorias.length > 1 && ` (${cat.quant_atual ?? 0})`}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Nenhuma informação encontrada.</p>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-8 pt-2">
              <Button type="submit" disabled={submittingCurral}>
                {submittingCurral ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCurralCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Listagem: Linhas com currais */}
      {!showLinhaForm && !showCurralForm && (
        <div className="space-y-4">
          {linhasFiltradas.map((linha) => {
            const curraisDaLinha = curraisPorLinha[linha.id] || []
            const isExpanded = expandedLinha === linha.id
            return (
              <Card key={linha.id} className="border-0 shadow-sm overflow-hidden">
                {/* Header da linha */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedLinha(isExpanded ? null : linha.id)}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-gray-800">{linha.nome}</h3>
                      <p className="text-xs text-gray-500">
                        {curraisDaLinha.length} curral(is)
                        {linha.largura_m != null && ` · ${linha.largura_m}m larg`}
                        {linha.comprimento_m != null && ` · ${linha.comprimento_m}m comp`}
                        {linha.metros_cocho_m != null && ` · ${linha.metros_cocho_m}m cocho`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <span
                      className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                        linha.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {linha.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => handleLinhaEdit(linha)}>
                      Editar Linha
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => openNewCurralInLinha(linha.id)}>
                      + Curral
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1 min-w-[70px]" onClick={() => handleLinhaToggleActive(linha)}>
                      {linha.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    {!linha.ativo && (
                      <Button size="sm" variant="secondary" className="flex-1 min-w-[70px] text-red-600 hover:text-red-700" onClick={() => setDeleteTarget({ type: 'linha', id: linha.id, nome: linha.nome })}>
                        Excluir
                      </Button>
                    )}
                  </div>
                </div>

                {/* Currais da linha (accordion) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                    {curraisDaLinha.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {curraisDaLinha.map(renderCurralCard)}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Nenhum curral atribuído a esta linha.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}

          {/* Currais sem linha */}
          {curraisSemLinha.length > 0 && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedLinha(expandedLinha === '__sem_linha' ? null : '__sem_linha')}
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${expandedLinha === '__sem_linha' ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-gray-800">Currais sem linha</h3>
                    <p className="text-xs text-gray-500">{curraisSemLinha.length} curral(is)</p>
                  </div>
                </div>
              </div>
              {expandedLinha === '__sem_linha' && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {curraisSemLinha.map(renderCurralCard)}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Empty state */}
          {linhas.length === 0 && currais.length === 0 && (
            <Card className="p-8 text-center border-0">
              <p className="text-gray-600">Nenhuma linha ou curral cadastrado.</p>
            </Card>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          if (deleteTarget.type === 'linha') handleLinhaDelete(deleteTarget.id)
          else handleCurralDelete(deleteTarget.id)
          setDeleteTarget(null)
        }}
        title={`Excluir ${deleteTarget?.type === 'linha' ? 'linha' : 'curral'}`}
        message={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Esta ação é permanente e o item não aparecerá mais na lista, mesmo com o filtro de desativados ativado.`}
        confirmText="Excluir definitivamente"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  )
}
