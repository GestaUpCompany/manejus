import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, toFarmDateOnly } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, NumericInput, Modal, useToast } from '@gestaup/ui'
import {
  calculateCompletenessScore,
  getSyncStatusFromScore,
  validateIndividuo,
  categoriasMacho,
  categoriasFemea,
  origens,
  dispositivosIdentificacao,
} from '../../utils/individualValidation'
import {
  checkDuplicateIdentification,
  getIdentificationLabel,
  type IdentificationField,
} from '../../utils/checkDuplicateIdentification'
import { getFazendaIdForUser } from '@gestaup/shared'
import { useLotes } from '@gestaup/shared'

interface SelectOption {
  id: string
  nome: string
}

const INITIAL_FORM = {
  id_manejo: '',
  id_brinco: '',
  id_chip: '',
  id_provisorio_cria: '',
  sexo: '',
  categoria: '',
  raca: '',
  data_nascimento: '',
  peso_nascimento_kg: '',
  peso_atual_kg: '',
  status: 'Vivo',
  origem: '',
  data_entrada_fazenda: '',
  pv_entrada_kg: '',
  preco_entrada_reais_kg: '',
  preco_entrada_reais_arroba: '',
  preco_entrada_reais_cabeca: '',
  preco_arroba_boi_gordo: '',
  agio_desagio: '',
  data_formacao_lote: '',
  lote_atual: '',
  protocolo_sanitario: '',
  fornecedor: '',
  propriedade_origem: '',
  propriedade_atual: '',
  pai: '',
  mae: '',
  estrategia_nutricional_tipo: '',
  estrategia_nutricional_id: '',
  estrategia_nutricional_nome: '',
  gmd_kg_cab_dia: '',
  peso_meta_kg: '',
  data_desmama: '',
  peso_desmama_kg: '',
  pasto_atual: '',
  setor_atual: '',
  data_insercao_rastreabilidade: '',
  data_liberacao_sisbov: '',
  codigo_sisbov: '',
  codigo_pnib: '',
  dispositivo_tipo: '',
  data_identificacao: '',
  data_vacina_brucelose: '',
}

export function IndividuoNovo() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(INITIAL_FORM)
  const [statusOriginal, setStatusOriginal] = useState<string | undefined>(undefined)
  const [dataMovimentacao, setDataMovimentacao] = useState(
    () => toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().split('T')[0]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [successModal, setSuccessModal] = useState<{ isOpen: boolean; title: string; message: string; onClose: () => void }>({
    isOpen: false,
    title: '',
    message: '',
    onClose: () => {},
  })

  const openSuccessModal = (title: string, message: string, onClose?: () => void) => {
    setSuccessModal({
      isOpen: true,
      title,
      message,
      onClose: onClose || (() => setSuccessModal((prev) => ({ ...prev, isOpen: false }))),
    })
  }

  const [fazendaId, setFazendaId] = useState('')
  const [racas, setRacas] = useState<SelectOption[]>([])
  const [setores, setSetores] = useState<SelectOption[]>([])
  const [fornecedores, setFornecedores] = useState<SelectOption[]>([])
  const [individuosMacho, setIndividuosMacho] = useState<SelectOption[]>([])
  const [individuosFemea, setIndividuosFemea] = useState<SelectOption[]>([])
  const [pastoDoLote, setPastoDoLote] = useState<string>('')
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<string>('')
  const [loteOriginal, setLoteOriginal] = useState<string | null>(null)
  const [categoriaOriginal, setCategoriaOriginal] = useState<string | null>(null)
  const [showLoteChangeModal, setShowLoteChangeModal] = useState(false)
  const [pendingLoteChange, setPendingLoteChange] = useState<{ loteId: string; loteNome: string; pastoNome: string | null; categoriaData: any } | null>(null)

  const { data: lotesData = [] } = useLotes(fazendaId || undefined)
  const lotes = lotesData.filter(l => l.ativo)

  useEffect(() => {
    // Verificar se há ID na rota (rota direta) ou parâmetro edit
    const pathId = window.location.pathname.split('/').pop()
    const editId = searchParams.get('edit')
    const id = editId || (pathId !== 'novo' ? pathId : null)
    
    if (id && id !== 'novo') {
      setIsEditMode(true)
      setEditId(id)
    }
    loadAuxiliaryData()
  }, [user, searchParams])

  useEffect(() => {
    if (isEditMode && editId && fazendaId) {
      loadIndividuoData()
    }
  }, [isEditMode, editId, fazendaId])

  // Carregar nome do pasto ao abrir indivíduo ou quando lote/pasto mudar
  useEffect(() => {
    const loadPasto = async () => {
      if (!form.pasto_atual) {
        setPastoDoLote('')
        return
      }

      try {
        const { data: pastoData } = await supabase
          .from('pastos')
          .select('nome')
          .eq('id', form.pasto_atual)
          .single()

        setPastoDoLote(pastoData?.nome || '')
      } catch (error) {
        console.error('Erro ao carregar nome do pasto:', error)
        setPastoDoLote('')
      }
    }

    loadPasto()
  }, [form.pasto_atual])

  const loadAuxiliaryData = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazenda = vinculos[0].fazenda_id
    setFazendaId(fazenda)

    const [racasRes, setoresRes, fornecedoresRes, machosRes, femeasRes] =
      await Promise.all([
        supabase.from('racas').select('id, nome').eq('fazenda_id', fazenda).eq('ativo', true).is('deleted_at', null),
        supabase.from('setores').select('id, nome').eq('fazenda_id', fazenda).eq('ativo', true).is('deleted_at', null),
        supabase.from('fornecedores').select('id, nome').eq('fazenda_id', fazenda).eq('ativo', true).is('deleted_at', null),
        supabase
          .from('individuos')
          .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria')
          .eq('fazenda_id', fazenda)
          .eq('sexo', 'Macho')
          .is('deleted_at', null),
        supabase
          .from('individuos')
          .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria')
          .eq('fazenda_id', fazenda)
          .eq('sexo', 'Fêmea')
          .is('deleted_at', null),
      ])

    const mapOptions = (data: any[] | null): SelectOption[] =>
      (data || []).map((item) => ({ id: item.id, nome: item.nome }))

    // Um animal não pode ser pai/mãe de si mesmo
    const idAtual = searchParams.get('edit') || (() => {
      const last = window.location.pathname.split('/').pop()
      return last && last !== 'novo' ? last : null
    })()

    const mapIndividuos = (data: any[] | null): SelectOption[] =>
      (data || []).filter((item) => item.id !== idAtual).map((item) => ({
        id: item.id,
        nome:
          item.id_brinco ||
          item.id_chip ||
          item.id_manejo ||
          item.id_provisorio_cria ||
          item.id,
      }))

    setRacas(mapOptions(racasRes.data))
    setSetores(mapOptions(setoresRes.data))
    setFornecedores(mapOptions(fornecedoresRes.data))
    setIndividuosMacho(mapIndividuos(machosRes.data))
    setIndividuosFemea(mapIndividuos(femeasRes.data))
  }

  const loadIndividuoData = async () => {
    if (!editId || !fazendaId) return

    try {
      const { data: individuo, error } = await supabase
        .from('individuos')
        .select('*')
        .eq('id', editId)
        .eq('fazenda_id', fazendaId)
        .single()

      if (error) throw error

      if (individuo) {
        setLoteOriginal(individuo.lote_atual || null)
        setCategoriaOriginal(individuo.categoria || null)
        setStatusOriginal(individuo.status || 'Vivo')
        setForm({
          id_manejo: individuo.id_manejo || '',
          id_brinco: individuo.id_brinco || '',
          id_chip: individuo.id_chip || '',
          id_provisorio_cria: individuo.id_provisorio_cria || '',
          sexo: individuo.sexo || '',
          categoria: individuo.categoria || '',
          raca: individuo.raca || '',
          data_nascimento: individuo.data_nascimento || '',
          peso_nascimento_kg: individuo.peso_nascimento_kg || '',
          peso_atual_kg: individuo.peso_atual_kg || '',
          status: individuo.status || 'Vivo',
          origem: individuo.origem || '',
          data_entrada_fazenda: individuo.data_entrada_fazenda || '',
          pv_entrada_kg: individuo.pv_entrada_kg || '',
          preco_entrada_reais_kg: individuo.preco_entrada_reais_kg || '',
          preco_entrada_reais_arroba: individuo.preco_entrada_reais_arroba || '',
          preco_entrada_reais_cabeca: individuo.preco_entrada_reais_cabeca || '',
          preco_arroba_boi_gordo: individuo.preco_arroba_boi_gordo || '',
          agio_desagio: individuo.agio_desagio || '',
          data_formacao_lote: individuo.data_formacao_lote || '',
          lote_atual: individuo.lote_atual || '',
          protocolo_sanitario: individuo.protocolo_sanitario || '',
          fornecedor: individuo.fornecedor || '',
          propriedade_origem: individuo.propriedade_origem || '',
          propriedade_atual: individuo.propriedade_atual || '',
          pai: individuo.pai || '',
          mae: individuo.mae || '',
          estrategia_nutricional_tipo: individuo.estrategia_nutricional_tipo || '',
          estrategia_nutricional_id: individuo.estrategia_nutricional_id || '',
          estrategia_nutricional_nome: individuo.estrategia_nutricional_nome || '',
          gmd_kg_cab_dia: individuo.gmd_kg_cab_dia || '',
          peso_meta_kg: individuo.peso_meta_kg || '',
          data_desmama: individuo.data_desmama || '',
          peso_desmama_kg: individuo.peso_desmama_kg || '',
          pasto_atual: individuo.pasto_atual || '',
          setor_atual: individuo.setor_atual || '',
          data_insercao_rastreabilidade: individuo.data_insercao_rastreabilidade || '',
          data_liberacao_sisbov: individuo.data_liberacao_sisbov || '',
          codigo_sisbov: individuo.codigo_sisbov || '',
          codigo_pnib: individuo.codigo_pnib || '',
          dispositivo_tipo: individuo.dispositivo_tipo || '',
          data_identificacao: individuo.data_identificacao || '',
          data_vacina_brucelose: individuo.data_vacina_brucelose || '',
        })
      }
    } catch (error) {
      console.error('Erro ao carregar dados do indivíduo:', error)
    }
  }

  const handleChange = useCallback(async (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (field === 'sexo') {
      setForm((prev) => ({ ...prev, categoria: '' }))
    }

    // Carregar pasto automaticamente quando lote for selecionado
    if (field === 'lote_atual' && value) {
      try {
        const { data: loteData } = await supabase
          .from('lotes')
          .select('pasto_id')
          .eq('id', value)
          .single()

        if (loteData?.pasto_id) {
          setForm((prev) => ({ ...prev, pasto_atual: loteData.pasto_id }))

          // Buscar nome do pasto para exibição
          const { data: pastoData } = await supabase
            .from('pastos')
            .select('nome')
            .eq('id', loteData.pasto_id)
            .single()

          if (pastoData?.nome) {
            setPastoDoLote(pastoData.nome)
          }
        } else {
          setPastoDoLote('')
        }
      } catch (error) {
        console.error('Erro ao carregar pasto do lote:', error)
        setPastoDoLote('')
      }
    } else if (field === 'lote_atual' && !value) {
      setPastoDoLote('')
    }
  }, [errors])

  // Sem useCallback: precisa enxergar o form atual ao confirmar a troca de lote
  const confirmLoteChange = () => {
    setShowLoteChangeModal(false)
    setPendingLoteChange(null)
    executeSubmit()
  }

  const cancelLoteChange = useCallback(() => {
    setShowLoteChangeModal(false)
    setPendingLoteChange(null)
    setSubmitting(false)
  }, [])

  const handleNumericChange = useCallback((field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }, [errors])

  const handleIdentificationBlur = async (field: IdentificationField) => {
    if (!fazendaId) return
    const value = form[field]
    if (!value || value.trim() === '') return

    const isDuplicate = await checkDuplicateIdentification(fazendaId, field, value)
    if (isDuplicate) {
      setErrors((prev) => ({
        ...prev,
        [field]: `${getIdentificationLabel(field)} "${value}" já está em uso nesta fazenda.`,
      }))
    }
  }

  const validateDuplicates = async (): Promise<boolean> => {
    if (!fazendaId) return true

    const fields: IdentificationField[] = ['id_brinco', 'id_chip', 'id_manejo']
    let hasDuplicate = false

    for (const field of fields) {
      const value = form[field]
      if (!value || value.trim() === '') continue

      const isDuplicate = await checkDuplicateIdentification(fazendaId, field, value, isEditMode ? editId : undefined)
      if (isDuplicate) {
        hasDuplicate = true
        setErrors((prev) => ({
          ...prev,
          [field]: `${getIdentificationLabel(field)} "${value}" já está em uso nesta fazenda.`,
        }))
      }
    }

    return !hasDuplicate
  }

  const categoriaOptions = useMemo(() => 
    form.sexo === 'Macho'
      ? categoriasMacho
      : form.sexo === 'Fêmea'
      ? categoriasFemea
      : [], [form.sexo]
  )

  const score = useMemo(() => calculateCompletenessScore(form), [form])
  const syncStatus = useMemo(() => getSyncStatusFromScore(score), [score])

  const getScoreColor = useCallback(() => {
    if (score >= 100) return 'bg-green-500'
    if (score >= 70) return 'bg-yellow-500'
    return 'bg-red-500'
  }, [score])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationErrors = validateIndividuo(form, { statusOriginal })
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const hasDuplicates = !(await validateDuplicates())
    if (hasDuplicates) return

    // Se houver mudança de lote, abrir modal de confirmação antes de salvar
    if (isEditMode && loteOriginal && loteOriginal !== form.lote_atual) {
      try {
        const { data: loteData } = await supabase
          .from('lotes')
          .select('id, nome, pasto_id')
          .eq('id', form.lote_atual)
          .single()

        if (!loteData) {
          toast.error('Não foi possível carregar os dados do novo lote.')
          return
        }

        const { data: pastoData } = await supabase
          .from('pastos')
          .select('nome')
          .eq('id', loteData.pasto_id)
          .single()

        const { data: categoriaData } = await supabase
          .from('lote_categorias')
          .select('estrategia_nutricional, gmd, peso_vivo_meta_kg_cab')
          .eq('lote_id', form.lote_atual)
          .eq('categoria', form.categoria)
          .eq('ativo', true)
          .maybeSingle()

        setPendingLoteChange({
          loteId: form.lote_atual,
          loteNome: loteData.nome || 'Novo lote',
          pastoNome: pastoData?.nome || null,
          categoriaData,
        })
        setSubmitting(true)
        setShowLoteChangeModal(true)
      } catch (error) {
        console.error('Erro ao carregar dados do novo lote:', error)
        toast.error('Não foi possível carregar os dados do novo lote.')
      }
      return
    }

    await executeSubmit()
  }

  // Salva numa única transação (RPC): indivíduo, herança nutricional e Saída/Entrada agregadas.
  const executeSubmit = async () => {
    setSubmitting(true)

    try {
      const camposNumericos = [
        'peso_nascimento_kg',
        'peso_atual_kg',
        'pv_entrada_kg',
        'preco_entrada_reais_kg',
        'preco_entrada_reais_arroba',
        'preco_entrada_reais_cabeca',
        'preco_arroba_boi_gordo',
        'agio_desagio',
        'gmd_kg_cab_dia',
        'peso_meta_kg',
        'peso_desmama_kg',
      ]
      const dados: Record<string, unknown> = { ...form, sync_status: syncStatus }
      for (const chave of ['id_manejo', 'id_brinco', 'id_chip', 'id_provisorio_cria']) {
        if (typeof dados[chave] === 'string') dados[chave] = (dados[chave] as string).trim()
      }
      for (const campo of camposNumericos) {
        const valor = dados[campo]
        dados[campo] = valor === '' || valor == null ? null : Number(String(valor).replace(',', '.'))
      }
      Object.keys(dados).forEach((chave) => {
        if (dados[chave] === '') dados[chave] = null
      })

      const { data, error } = await supabase.rpc('salvar_individuo', {
        p_fazenda_id: fazendaId,
        p_individuo_id: isEditMode ? editId : null,
        p_dados: dados,
        p_data_movimentacao: dataMovimentacao || null,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível salvar o indivíduo.')

      if (isEditMode) {
        setLoteOriginal(form.lote_atual)
        setCategoriaOriginal(form.categoria)
      }
      openSuccessModal(
        'Sucesso!',
        isEditMode ? 'Indivíduo atualizado com sucesso.' : 'Indivíduo criado com sucesso.',
        () => navigate('/controller/individuos')
      )
    } catch (error) {
      console.error('Erro ao salvar indivíduo:', error)
      const mensagem = (error as Error).message
      toast.error(
        mensagem.includes('idx_individuos_codigo_sisbov_unico')
          ? 'Este código SISBOV já está cadastrado em outro animal.'
          : 'Erro ao salvar indivíduo: ' + mensagem
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => navigate('/controller/individuos')}>
          ← Voltar
        </Button>
        <h2 className="text-2xl font-bold text-content-strong">
          {isEditMode ? 'Editar Indivíduo' : 'Novo Indivíduo'}
        </h2>
      </div>

      {/* Score de completude */}
      <Card className="p-4 border-0 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-content">Completude do cadastro</span>
          <span className="text-sm font-bold text-content-strong">{score}%</span>
        </div>
        <div className="w-full bg-surface-3 rounded-full h-2.5">
          <div className={`${getScoreColor()} h-2.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Seção Principal - Identificação e Peso */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Identificação e Dados Principais</h3>
            <p className="text-sm text-content-muted mt-1">Informações essenciais do animal</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Identificação */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content uppercase tracking-wider">Identificação</h4>
                {errors.identificacao && <p className="text-red-500 text-xs">{errors.identificacao}</p>}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                      Brinco
                    </label>
                    <input
                      type="text"
                      value={form.id_brinco}
                      onChange={(e) => handleChange('id_brinco', e.target.value)}
                      onBlur={() => handleIdentificationBlur('id_brinco')}
                      className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Ex: BR12345"
                    />
                    {errors.id_brinco && <p className="text-red-500 text-xs mt-1">{errors.id_brinco}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Chip</label>
                    <input
                      type="text"
                      value={form.id_chip}
                      onChange={(e) => handleChange('id_chip', e.target.value)}
                      onBlur={() => handleIdentificationBlur('id_chip')}
                      className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Ex: 985200000123456"
                    />
                    {errors.id_chip && <p className="text-red-500 text-xs mt-1">{errors.id_chip}</p>}
                  </div>
                </div>
              </div>
              
              {/* Características */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content uppercase tracking-wider">Características</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                      Sexo <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.sexo}
                      onChange={(e) => handleChange('sexo', e.target.value)}
                      className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Selecione</option>
                      <option value="Macho">Macho</option>
                      <option value="Fêmea">Fêmea</option>
                    </select>
                    {errors.sexo && <p className="text-red-500 text-xs mt-1">{errors.sexo}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                      Raça <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.raca}
                      onChange={(e) => handleChange('raca', e.target.value)}
                      className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Selecione</option>
                      {racas.map(raca => (
                        <option key={raca.id} value={raca.nome}>{raca.nome}</option>
                      ))}
                    </select>
                    {errors.raca && <p className="text-red-500 text-xs mt-1">{errors.raca}</p>}
                  </div>
                </div>
              </div>
              
              {/* Classificação */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content uppercase tracking-wider">Classificação</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                      Categoria <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.categoria}
                      onChange={(e) => handleChange('categoria', e.target.value)}
                      className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Selecione</option>
                      {categoriaOptions.map((categoria: string) => (
                        <option key={categoria} value={categoria}>{categoria}</option>
                      ))}
                    </select>
                    {errors.categoria && <p className="text-red-500 text-xs mt-1">{errors.categoria}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Status</label>
                    <select
                      value={form.status}
                      disabled
                      title="O status muda pela baixa na ficha do animal, que também atualiza a quantidade do lote."
                      className="w-full px-3 py-2 bg-surface-2 text-content-muted border border-surface-3 rounded-lg cursor-not-allowed"
                    >
                      <option value={form.status}>{form.status}</option>
                    </select>
                    <p className="text-xs text-content-muted mt-1">
                      Para dar baixa ou reativar, use "Dar baixa / alterar status" na ficha do animal.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Peso - Destaque */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content uppercase tracking-wider">Peso</h4>
                <div className="bg-surface-2 rounded-xl p-4 border border-border-base">
                  <label className="block text-sm font-semibold text-content-strong mb-2">Peso Atual (kg)</label>
                  <NumericInput
                    value={form.peso_atual_kg}
                    onChange={(value) => handleNumericChange('peso_atual_kg', value)}
                    error={errors.peso_atual_kg}
                    placeholder="0.0"
                    className="border-surface-3 bg-surface-1/80 backdrop-blur-sm"
                  />
                  {errors.peso_atual_kg && <p className="text-red-500 text-xs mt-1">{errors.peso_atual_kg}</p>}
                </div>
              </div>
            </div>
            
            {/* Identificadores Adicionais */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Manejo</label>
                <input
                  type="text"
                  value={form.id_manejo}
                  onChange={(e) => handleChange('id_manejo', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Ex: M001"
                />
                {errors.id_manejo && <p className="text-red-500 text-xs mt-1">{errors.id_manejo}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Provisório (cria)</label>
                <input
                  type="text"
                  value={form.id_provisorio_cria}
                  onChange={(e) => handleChange('id_provisorio_cria', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Ex: CRIA001"
                />
                {errors.id_provisorio_cria && <p className="text-red-500 text-xs mt-1">{errors.id_provisorio_cria}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Card Nascimento e Origem */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Dados de Nascimento e Origem</h3>
            <p className="text-sm text-content-muted mt-1">Informações de nascimento e procedência</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                  Data de nascimento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => handleChange('data_nascimento', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {errors.data_nascimento && <p className="text-red-500 text-xs mt-1">{errors.data_nascimento}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Peso ao nascer (kg)</label>
                <NumericInput
                  value={form.peso_nascimento_kg}
                  onChange={(value) => handleNumericChange('peso_nascimento_kg', value)}
                  error={errors.peso_nascimento_kg}
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Origem</label>
                <select
                  value={form.origem}
                  onChange={(e) => handleChange('origem', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {origens.map((origem: string) => (
                    <option key={origem} value={origem}>{origem}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Card Entrada na Fazenda */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Entrada na Fazenda (Dados Financeiros)</h3>
            <p className="text-sm text-content-muted mt-1">Informações de compra e entrada</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data de entrada</label>
                <input
                  type="date"
                  value={form.data_entrada_fazenda}
                  onChange={(e) => handleChange('data_entrada_fazenda', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
                {errors.data_entrada_fazenda && <p className="text-red-500 text-xs mt-1">{errors.data_entrada_fazenda}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">PV entrada (kg)</label>
                <NumericInput
                  value={form.pv_entrada_kg}
                  onChange={(value) => handleNumericChange('pv_entrada_kg', value)}
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Preço entrada (R$/kg)</label>
                <NumericInput
                  value={form.preco_entrada_reais_kg}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_kg', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Preço entrada (R$/@)</label>
                <NumericInput
                  value={form.preco_entrada_reais_arroba}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_arroba', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Preço entrada (R$/cabeça)</label>
                <NumericInput
                  value={form.preco_entrada_reais_cabeca}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_cabeca', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Preço arroba boi gordo</label>
                <NumericInput
                  value={form.preco_arroba_boi_gordo}
                  onChange={(value) => handleNumericChange('preco_arroba_boi_gordo', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Ágio/Deságio</label>
                <NumericInput
                  value={form.agio_desagio}
                  onChange={(value) => handleNumericChange('agio_desagio', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Fornecedor</label>
                <select
                  value={form.fornecedor}
                  onChange={(e) => handleChange('fornecedor', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Propriedade de origem</label>
                <input
                  type="text"
                  value={form.propriedade_origem}
                  onChange={(e) => handleChange('propriedade_origem', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Propriedade de origem"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Propriedade atual</label>
                <input
                  type="text"
                  value={form.propriedade_atual}
                  onChange={(e) => handleChange('propriedade_atual', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Propriedade atual"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card Localização e Filiação */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Localização e Filiação</h3>
            <p className="text-sm text-content-muted mt-1">Localização no sistema e linhagem</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Lote atual</label>
                <select
                  value={form.lote_atual}
                  onChange={(e) => handleChange('lote_atual', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              {form.lote_atual && (!isEditMode || form.lote_atual !== loteOriginal || form.categoria !== categoriaOriginal) && (
                <div>
                  <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data da movimentação</label>
                  <input
                    type="date"
                    value={dataMovimentacao}
                    max={toFarmDateOnly(new Date().toISOString()) ?? undefined}
                    onChange={(e) => setDataMovimentacao(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-1 text-content-strong border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-content-muted mt-1">Data em que o animal entrou no lote (afeta a contagem do lote).</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Pasto atual</label>
                <div className="text-sm text-content-strong min-h-[42px] flex items-center px-3 py-2 border border-surface-3 rounded-lg bg-surface-2">
                  {pastoDoLote || (
                    <span className="text-content-faint italic">Selecione um lote para exibir o pasto</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Setor atual</label>
                <select
                  value={form.setor_atual}
                  onChange={(e) => handleChange('setor_atual', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Pai</label>
                <select
                  value={form.pai}
                  onChange={(e) => handleChange('pai', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {individuosMacho.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Mãe</label>
                <select
                  value={form.mae}
                  onChange={(e) => handleChange('mae', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {individuosFemea.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Card Nutrição */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Nutrição (Herdado do Lote)</h3>
            <p className="text-sm text-content-muted mt-1">Dados nutricionais definidos pela categoria do lote</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-surface-2 rounded-lg p-4 border border-border-base">
                <label className="block text-sm font-semibold text-content mb-2">Estratégia nutricional</label>
                <p className="text-sm text-content-strong min-h-[24px] flex items-center">
                  {form.estrategia_nutricional_nome || (
                    <span className="text-content-faint italic">Definida pela categoria do lote</span>
                  )}
                </p>
              </div>
              <div className="bg-surface-2 rounded-lg p-4 border border-border-base">
                <label className="block text-sm font-semibold text-content mb-2">GMD (kg/cab/dia)</label>
                <p className="text-sm text-content-strong min-h-[24px] flex items-center">
                  {form.gmd_kg_cab_dia || (
                    <span className="text-content-faint italic">Definido pela categoria do lote</span>
                  )}
                </p>
              </div>
              <div className="bg-surface-2 rounded-lg p-4 border border-border-base">
                <label className="block text-sm font-semibold text-content mb-2">Peso meta (kg)</label>
                <p className="text-sm text-content-strong min-h-[24px] flex items-center">
                  {form.peso_meta_kg ? `${form.peso_meta_kg} kg` : (
                    <span className="text-content-faint italic">Definido pela categoria do lote</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card Desmama */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Desmama</h3>
            <p className="text-sm text-content-muted mt-1">Registro de dados da desmama</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data da desmama</label>
                <input
                  type="date"
                  value={form.data_desmama}
                  onChange={(e) => handleChange('data_desmama', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                />
                {errors.data_desmama && <p className="text-red-500 text-xs mt-1">{errors.data_desmama}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Peso na desmama (kg)</label>
                <NumericInput
                  value={form.peso_desmama_kg}
                  onChange={(value) => handleNumericChange('peso_desmama_kg', value)}
                  placeholder="0.0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card Sisbov e Rastreabilidade */}
        <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm overflow-hidden">
          <div className="bg-surface-2 px-6 py-4 border-b border-border-base">
            <h3 className="text-lg font-semibold text-content-strong">Sisbov e Rastreabilidade</h3>
            <p className="text-sm text-content-muted mt-1">Dados de rastreabilidade e SISBOV</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data de inserção na rastreabilidade</label>
                <input
                  type="date"
                  value={form.data_insercao_rastreabilidade}
                  onChange={(e) => handleChange('data_insercao_rastreabilidade', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_insercao_rastreabilidade && <p className="text-red-500 text-xs mt-1">{errors.data_insercao_rastreabilidade}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data de liberação SISBOV</label>
                <input
                  type="date"
                  value={form.data_liberacao_sisbov}
                  onChange={(e) => handleChange('data_liberacao_sisbov', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_liberacao_sisbov && <p className="text-red-500 text-xs mt-1">{errors.data_liberacao_sisbov}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Código SISBOV (15 dígitos, começa com 076)</label>
                <input
                  type="text"
                  value={form.codigo_sisbov}
                  onChange={(e) => handleChange('codigo_sisbov', e.target.value)}
                  inputMode="numeric" maxLength={15} placeholder="076000000000000" className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.codigo_sisbov && <p className="text-red-500 text-xs mt-1">{errors.codigo_sisbov}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Código PNIB</label>
                <input
                  type="text"
                  value={form.codigo_pnib}
                  onChange={(e) => handleChange('codigo_pnib', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.codigo_pnib && <p className="text-red-500 text-xs mt-1">{errors.codigo_pnib}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Dispositivo de identificação</label>
                <select
                  value={form.dispositivo_tipo}
                  onChange={(e) => handleChange('dispositivo_tipo', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {dispositivosIdentificacao.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data da identificação (colocação do dispositivo)</label>
                <input
                  type="date"
                  value={form.data_identificacao}
                  onChange={(e) => handleChange('data_identificacao', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_identificacao && <p className="text-red-500 text-xs mt-1">{errors.data_identificacao}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data da vacina de brucelose</label>
                <input
                  type="date"
                  value={form.data_vacina_brucelose}
                  onChange={(e) => handleChange('data_vacina_brucelose', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_vacina_brucelose && <p className="text-red-500 text-xs mt-1">{errors.data_vacina_brucelose}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none">
            {submitting ? 'Salvando...' : (isEditMode ? 'Atualizar Indivíduo' : 'Salvar Indivíduo')}
          </Button>
          <Button variant="secondary" type="button" onClick={() => navigate('/controller/individuos')}>
            Cancelar
          </Button>
        </div>
      </form>

      <Modal
        isOpen={showLoteChangeModal}
        onClose={cancelLoteChange}
        title="Confirmar movimentação de lote"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-content">
            Você está alterando o lote deste indivíduo para:
          </p>

          <div className="bg-surface-2 border border-border-base rounded-lg p-4">
            <p className="text-sm text-content-muted">
              <strong className="text-content-strong">Novo lote:</strong> {pendingLoteChange?.loteNome}
            </p>
            {pendingLoteChange?.pastoNome && (
              <p className="text-sm text-content-muted mt-1">
                <strong className="text-content-strong">Pasto:</strong> {pendingLoteChange.pastoNome}
              </p>
            )}
            {form.categoria && (
              <p className="text-sm text-content-muted mt-1">
                <strong className="text-content-strong">Categoria:</strong> {form.categoria}
              </p>
            )}
          </div>

          <div className="text-sm text-content-muted space-y-1">
            <p>Ao salvar, o sistema irá:</p>
            <ul className="list-disc list-inside pl-2 space-y-1">
              <li>Registrar a saída do lote atual</li>
              <li>Registrar a entrada no novo lote</li>
              <li>Atualizar a quantidade de animais em ambos os lotes</li>
              <li>Sincronizar o pasto e os dados nutricionais herdados da categoria</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={cancelLoteChange} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={confirmLoteChange} className="w-full sm:w-auto">
              Confirmar movimentação
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={successModal.isOpen}
        onClose={successModal.onClose}
        title={successModal.title}
        size="sm"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-content mb-6">{successModal.message}</p>
          <Button onClick={successModal.onClose} className="w-full sm:w-auto">
            OK
          </Button>
        </div>
      </Modal>
    </div>
  )
}
