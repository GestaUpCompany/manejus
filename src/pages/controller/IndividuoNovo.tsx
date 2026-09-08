import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, NumericInput, Modal, useToast } from '../../components/ui'
import {
  calculateCompletenessScore,
  getSyncStatusFromScore,
  validateIndividuo,
  categoriasMacho,
  categoriasFemea,
  origens,
} from '../../utils/individualValidation'
import {
  checkDuplicateIdentification,
  getIdentificationLabel,
  type IdentificationField,
} from '../../utils/checkDuplicateIdentification'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { useLotes } from '../../hooks/useFazendaQueries'

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
}

export function IndividuoNovo() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(INITIAL_FORM)
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

    const mapIndividuos = (data: any[] | null): SelectOption[] =>
      (data || []).map((item) => ({
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

  const confirmLoteChange = useCallback(() => {
    setShowLoteChangeModal(false)
    setPendingLoteChange(null)
    executeSubmit()
  }, [])

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

    const validationErrors = validateIndividuo(form)
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

  const executeSubmit = async () => {
    setSubmitting(true)

    try {
      if (isEditMode) {
        // Atualizar indivíduo existente
        const dataToUpdate: any = {
          id_manejo: form.id_manejo,
          id_brinco: form.id_brinco,
          id_chip: form.id_chip,
          id_provisorio_cria: form.id_provisorio_cria,
          sexo: form.sexo,
          categoria: form.categoria,
          raca: form.raca,
          data_nascimento: form.data_nascimento,
          peso_nascimento_kg: form.peso_nascimento_kg ? Number(String(form.peso_nascimento_kg).replace(',', '.')) : null,
          peso_atual_kg: form.peso_atual_kg ? Number(String(form.peso_atual_kg).replace(',', '.')) : null,
          status: form.status,
          origem: form.origem,
          data_entrada_fazenda: form.data_entrada_fazenda,
          pv_entrada_kg: form.pv_entrada_kg ? Number(String(form.pv_entrada_kg).replace(',', '.')) : null,
          preco_entrada_reais_kg: form.preco_entrada_reais_kg ? Number(String(form.preco_entrada_reais_kg).replace(',', '.')) : null,
          preco_entrada_reais_arroba: form.preco_entrada_reais_arroba ? Number(String(form.preco_entrada_reais_arroba).replace(',', '.')) : null,
          preco_entrada_reais_cabeca: form.preco_entrada_reais_cabeca ? Number(String(form.preco_entrada_reais_cabeca).replace(',', '.')) : null,
          preco_arroba_boi_gordo: form.preco_arroba_boi_gordo ? Number(String(form.preco_arroba_boi_gordo).replace(',', '.')) : null,
          agio_desagio: form.agio_desagio ? Number(String(form.agio_desagio).replace(',', '.')) : null,
          data_formacao_lote: form.data_formacao_lote,
          lote_atual: form.lote_atual,
          protocolo_sanitario: form.protocolo_sanitario,
          fornecedor: form.fornecedor,
          propriedade_origem: form.propriedade_origem,
          propriedade_atual: form.propriedade_atual,
          pai: form.pai,
          mae: form.mae,
          estrategia_nutricional_tipo: form.estrategia_nutricional_tipo,
          estrategia_nutricional_id: form.estrategia_nutricional_id,
          estrategia_nutricional_nome: form.estrategia_nutricional_nome,
          gmd_kg_cab_dia: form.gmd_kg_cab_dia ? Number(String(form.gmd_kg_cab_dia).replace(',', '.')) : null,
          peso_meta_kg: form.peso_meta_kg ? Number(String(form.peso_meta_kg).replace(',', '.')) : null,
          data_desmama: form.data_desmama,
          peso_desmama_kg: form.peso_desmama_kg ? Number(String(form.peso_desmama_kg).replace(',', '.')) : null,
          pasto_atual: form.pasto_atual,
          setor_atual: form.setor_atual,
          data_insercao_rastreabilidade: form.data_insercao_rastreabilidade,
          data_liberacao_sisbov: form.data_liberacao_sisbov,
          updated_at: new Date().toISOString()
        }

        // Converter strings vazias para null para campos opcionais (datas, selects, textos)
        Object.keys(dataToUpdate).forEach((key) => {
          if (dataToUpdate[key] === '') {
            dataToUpdate[key] = null
          }
        })

        const { error } = await supabase
          .from('individuos')
          .update(dataToUpdate)
          .eq('id', editId)
          .eq('fazenda_id', fazendaId)

        if (error) {
          console.error('Erro ao atualizar indivíduo:', error)
          toast.error('Erro ao atualizar indivíduo: ' + error.message)
          setSubmitting(false)
          return
        }

        // Atualizar dados nutricionais herdados se houver lote/categoria
        if (form.lote_atual && form.categoria) {
          try {
            const { data: categoriaData } = await supabase
              .from('lote_categorias')
              .select('estrategia_nutricional, gmd, peso_vivo_meta_kg_cab, formulacao_id')
              .eq('lote_id', form.lote_atual)
              .eq('categoria', form.categoria)
              .eq('ativo', true)
              .maybeSingle()

            if (categoriaData) {
              let estrategiaMapeada = 'Ração'
              if (categoriaData.estrategia_nutricional) {
                if (categoriaData.estrategia_nutricional.includes('Proteico') || categoriaData.estrategia_nutricional.includes('Proteinado')) {
                  estrategiaMapeada = 'Proteico-Energético'
                } else if (categoriaData.estrategia_nutricional.includes('Ração')) {
                  estrategiaMapeada = 'Ração'
                }
              }

              await supabase
                .from('individuos')
                .update({
                  estrategia_nutricional_tipo: estrategiaMapeada,
                  estrategia_nutricional_nome: categoriaData.estrategia_nutricional,
                  gmd_kg_cab_dia: categoriaData.gmd ? parseFloat(categoriaData.gmd.replace(',', '.')) : null,
                  peso_meta_kg: categoriaData.peso_vivo_meta_kg_cab,
                  estrategia_nutricional_id: categoriaData.formulacao_id
                })
                .eq('id', editId)
            }
          } catch (nutriError) {
            console.error('Erro ao atualizar dados nutricionais:', nutriError)
          }
        }

        // Realocar indivíduo para novo lote/categoria quando alterado
        if (loteOriginal && (loteOriginal !== form.lote_atual || categoriaOriginal !== form.categoria)) {
          try {
            const dataMovimentacao = new Date().toISOString()
            const identificacao = form.id_brinco || form.id_chip || form.id_manejo || 'Indivíduo'

            // Registrar saída do lote/categoria original
            if (loteOriginal && categoriaOriginal) {
              await supabase.from('registros_movimentacao').insert({
                fazenda_id: fazendaId,
                lote_origem_id: loteOriginal,
                lote_destino_id: null,
                categoria: categoriaOriginal,
                numero_cabecas: 1,
                data: dataMovimentacao.split('T')[0],
                peso_vivo_atual_kg: form.peso_atual_kg ? Number(String(form.peso_atual_kg).replace(',', '.')) : null,
                motivo_movimentacao: 'Saída',
                causa_observacao: `Saída por realocação de ${identificacao}`,
                individuo_id: editId || null,
              })

              // Decrementar quantidade da categoria original
              const { data: categoriaSaida } = await supabase
                .from('lote_categorias')
                .select('quant_atual')
                .eq('lote_id', loteOriginal)
                .eq('categoria', categoriaOriginal)
                .eq('ativo', true)
                .single()

              if (categoriaSaida && (categoriaSaida.quant_atual || 0) > 0) {
                await supabase
                  .from('lote_categorias')
                  .update({ quant_atual: categoriaSaida.quant_atual - 1 })
                  .eq('lote_id', loteOriginal)
                  .eq('categoria', categoriaOriginal)
                  .eq('ativo', true)
              }
            }

            // Registrar entrada no lote/categoria atual
            if (form.lote_atual && form.categoria) {
              await supabase.from('registros_movimentacao').insert({
                fazenda_id: fazendaId,
                lote_origem_id: null,
                lote_destino_id: form.lote_atual,
                categoria: form.categoria,
                numero_cabecas: 1,
                data: dataMovimentacao.split('T')[0],
                peso_vivo_atual_kg: form.peso_atual_kg ? Number(String(form.peso_atual_kg).replace(',', '.')) : null,
                motivo_movimentacao: 'Entrada',
                causa_observacao: `Entrada por realocação de ${identificacao}`,
                individuo_id: editId || null,
              })

              await supabase.rpc('update_quant_atual_with_data', {
                p_lote_id: form.lote_atual,
                p_categoria: form.categoria,
                p_raca: form.raca,
                p_sexo: form.sexo,
              })
            }
          } catch (movError) {
            console.error('Erro ao registrar realocação de lote:', movError)
          }
        }

        // Atualizar lote/categoria original para futuras movimentações dentro desta edição
        setLoteOriginal(form.lote_atual)
        setCategoriaOriginal(form.categoria)

        openSuccessModal(
          'Sucesso!',
          'Indivíduo atualizado com sucesso.',
          () => navigate('/controller/individuos')
        )
      } else {
        // Criar novo indivíduo
        const dataToInsert: any = {
          fazenda_id: fazendaId,
          ...form,
          sync_status: syncStatus,
        }

        Object.keys(dataToInsert).forEach((key) => {
          if (dataToInsert[key] === '') {
            dataToInsert[key] = null
          }
        })

        const numericFields = [
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

        numericFields.forEach((field) => {
          if (dataToInsert[field]) {
            dataToInsert[field] = Number(String(dataToInsert[field]).replace(',', '.'))
          }
        })

        const { data, error } = await supabase.from('individuos').insert(dataToInsert).select('id').single()

        if (error) {
          console.error('Erro ao criar indivíduo:', error)
          toast.error('Erro ao criar indivíduo: ' + error.message)
          setSubmitting(false)
          return
        }

        // Registrar no histórico do lote, atualizar quantidade e herdar dados nutricionais
        if (form.lote_atual && form.categoria) {
          try {
            // Buscar dados nutricionais da categoria do lote
            const { data: categoriaData } = await supabase
              .from('lote_categorias')
              .select('estrategia_nutricional, gmd, peso_vivo_meta_kg_cab, formulacao_id')
              .eq('lote_id', form.lote_atual)
              .eq('categoria', form.categoria)
              .eq('ativo', true)
              .maybeSingle()

            // Atualizar indivíduo com dados nutricionais herdados
            if (categoriaData) {
              // Mapear estratégia nutricional para valores compatíveis
              let estrategiaMapeada = 'Ração'; // valor padrão
              if (categoriaData.estrategia_nutricional) {
                if (categoriaData.estrategia_nutricional.includes('Proteico') || categoriaData.estrategia_nutricional.includes('Proteinado')) {
                  estrategiaMapeada = 'Proteico-Energético';
                } else if (categoriaData.estrategia_nutricional.includes('Ração')) {
                  estrategiaMapeada = 'Ração';
                }
              }

              await supabase
                .from('individuos')
                .update({
                  estrategia_nutricional_tipo: estrategiaMapeada,
                  estrategia_nutricional_nome: categoriaData.estrategia_nutricional,
                  gmd_kg_cab_dia: categoriaData.gmd ? parseFloat(categoriaData.gmd.replace(',', '.')) : null,
                  peso_meta_kg: categoriaData.peso_vivo_meta_kg_cab,
                  estrategia_nutricional_id: categoriaData.formulacao_id
                })
                .eq('id', data.id)
            }

            // Registrar entrada no histórico do lote (unificado em registros_movimentacao)
            const historicoData = {
              fazenda_id: fazendaId,
              lote_origem_id: null,
              lote_destino_id: form.lote_atual,
              categoria: form.categoria,
              numero_cabecas: 1,
              data: new Date().toISOString().split('T')[0],
              individuo_id: data.id,
              peso_vivo_atual_kg: form.peso_atual_kg ? Number(form.peso_atual_kg) : null,
              motivo_movimentacao: 'Entrada' as const,
              causa_observacao: `Entrada de indivíduo: ${form.id_brinco || form.id_chip || form.id_manejo || form.id_provisorio_cria || 'Sem identificação'}`
            }

            await supabase.from('registros_movimentacao').insert(historicoData)

            // Atualizar quantidade e dados na categoria do lote
            await supabase.rpc('update_quant_atual_with_data', {
              p_lote_id: form.lote_atual,
              p_categoria: form.categoria,
              p_raca: form.raca,
              p_sexo: form.sexo
            })

          } catch (histError) {
            console.error('Erro ao registrar histórico do lote:', histError)
            // Não falhar a criação do indivíduo se o histórico falhar
          }
        }

        openSuccessModal(
          'Sucesso!',
          'Indivíduo criado com sucesso.',
          () => navigate('/controller/individuos')
        )
      }
    } catch (error) {
      console.error('Erro ao salvar indivíduo:', error)
      toast.error('Erro ao salvar indivíduo: ' + (error as Error).message)
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
        <h2 className="text-2xl font-bold text-gray-800">
          {isEditMode ? 'Editar Indivíduo' : 'Novo Indivíduo'}
        </h2>
      </div>

      {/* Score de completude */}
      <Card className="p-4 border-0 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Completude do cadastro</span>
          <span className="text-sm font-bold text-gray-900">{score}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className={`${getScoreColor()} h-2.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Seção Principal - Identificação e Peso */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Identificação e Dados Principais</h3>
            <p className="text-sm text-gray-600 mt-1">Informações essenciais do animal</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Identificação */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Identificação</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                      Brinco <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.id_brinco}
                      onChange={(e) => handleChange('id_brinco', e.target.value)}
                      onBlur={() => handleIdentificationBlur('id_brinco')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Ex: BR12345"
                    />
                    {errors.id_brinco && <p className="text-red-500 text-xs mt-1">{errors.id_brinco}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Chip</label>
                    <input
                      type="text"
                      value={form.id_chip}
                      onChange={(e) => handleChange('id_chip', e.target.value)}
                      onBlur={() => handleIdentificationBlur('id_chip')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Ex: 985200000123456"
                    />
                    {errors.id_chip && <p className="text-red-500 text-xs mt-1">{errors.id_chip}</p>}
                  </div>
                </div>
              </div>
              
              {/* Características */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Características</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                      Sexo <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.sexo}
                      onChange={(e) => handleChange('sexo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Selecione</option>
                      <option value="Macho">Macho</option>
                      <option value="Fêmea">Fêmea</option>
                    </select>
                    {errors.sexo && <p className="text-red-500 text-xs mt-1">{errors.sexo}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                      Raça <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.raca}
                      onChange={(e) => handleChange('raca', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Classificação</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                      Categoria <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.categoria}
                      onChange={(e) => handleChange('categoria', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Selecione</option>
                      {categoriaOptions.map((categoria: string) => (
                        <option key={categoria} value={categoria}>{categoria}</option>
                      ))}
                    </select>
                    {errors.categoria && <p className="text-red-500 text-xs mt-1">{errors.categoria}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="Vivo">Vivo</option>
                      <option value="Morto">Morto</option>
                      <option value="Vendido">Vendido</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Peso - Destaque */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Peso</h4>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-900 mb-2">Peso Atual (kg)</label>
                  <NumericInput
                    value={form.peso_atual_kg}
                    onChange={(value) => handleNumericChange('peso_atual_kg', value)}
                    error={errors.peso_atual_kg}
                    placeholder="0.0"
                    className="border-blue-300 bg-white/70 backdrop-blur-sm"
                  />
                  {errors.peso_atual_kg && <p className="text-red-500 text-xs mt-1">{errors.peso_atual_kg}</p>}
                </div>
              </div>
            </div>
            
            {/* Identificadores Adicionais */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Manejo</label>
                <input
                  type="text"
                  value={form.id_manejo}
                  onChange={(e) => handleChange('id_manejo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Ex: M001"
                />
                {errors.id_manejo && <p className="text-red-500 text-xs mt-1">{errors.id_manejo}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Provisório (cria)</label>
                <input
                  type="text"
                  value={form.id_provisorio_cria}
                  onChange={(e) => handleChange('id_provisorio_cria', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Ex: CRIA001"
                />
                {errors.id_provisorio_cria && <p className="text-red-500 text-xs mt-1">{errors.id_provisorio_cria}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Card Nascimento e Origem */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Dados de Nascimento e Origem</h3>
            <p className="text-sm text-gray-600 mt-1">Informações de nascimento e procedência</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Data de nascimento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => handleChange('data_nascimento', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {errors.data_nascimento && <p className="text-red-500 text-xs mt-1">{errors.data_nascimento}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Peso ao nascer (kg)</label>
                <NumericInput
                  value={form.peso_nascimento_kg}
                  onChange={(value) => handleNumericChange('peso_nascimento_kg', value)}
                  error={errors.peso_nascimento_kg}
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Origem</label>
                <select
                  value={form.origem}
                  onChange={(e) => handleChange('origem', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Entrada na Fazenda (Dados Financeiros)</h3>
            <p className="text-sm text-gray-600 mt-1">Informações de compra e entrada</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data de entrada</label>
                <input
                  type="date"
                  value={form.data_entrada_fazenda}
                  onChange={(e) => handleChange('data_entrada_fazenda', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
                {errors.data_entrada_fazenda && <p className="text-red-500 text-xs mt-1">{errors.data_entrada_fazenda}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">PV entrada (kg)</label>
                <NumericInput
                  value={form.pv_entrada_kg}
                  onChange={(value) => handleNumericChange('pv_entrada_kg', value)}
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Preço entrada (R$/kg)</label>
                <NumericInput
                  value={form.preco_entrada_reais_kg}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_kg', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Preço entrada (R$/@)</label>
                <NumericInput
                  value={form.preco_entrada_reais_arroba}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_arroba', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Preço entrada (R$/cabeça)</label>
                <NumericInput
                  value={form.preco_entrada_reais_cabeca}
                  onChange={(value) => handleNumericChange('preco_entrada_reais_cabeca', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Preço arroba boi gordo</label>
                <NumericInput
                  value={form.preco_arroba_boi_gordo}
                  onChange={(value) => handleNumericChange('preco_arroba_boi_gordo', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Ágio/Deságio</label>
                <NumericInput
                  value={form.agio_desagio}
                  onChange={(value) => handleNumericChange('agio_desagio', value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Fornecedor</label>
                <select
                  value={form.fornecedor}
                  onChange={(e) => handleChange('fornecedor', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Propriedade de origem</label>
                <input
                  type="text"
                  value={form.propriedade_origem}
                  onChange={(e) => handleChange('propriedade_origem', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Propriedade de origem"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Propriedade atual</label>
                <input
                  type="text"
                  value={form.propriedade_atual}
                  onChange={(e) => handleChange('propriedade_atual', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  placeholder="Propriedade atual"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card Localização e Filiação */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Localização e Filiação</h3>
            <p className="text-sm text-gray-600 mt-1">Localização no sistema e linhagem</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Lote atual</label>
                <select
                  value={form.lote_atual}
                  onChange={(e) => handleChange('lote_atual', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Pasto atual</label>
                <div className="text-sm text-gray-900 min-h-[42px] flex items-center px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                  {pastoDoLote || (
                    <span className="text-gray-400 italic">Selecione um lote para exibir o pasto</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Setor atual</label>
                <select
                  value={form.setor_atual}
                  onChange={(e) => handleChange('setor_atual', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Pai</label>
                <select
                  value={form.pai}
                  onChange={(e) => handleChange('pai', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Selecione...</option>
                  {individuosMacho.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Mãe</label>
                <select
                  value={form.mae}
                  onChange={(e) => handleChange('mae', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-green-50 to-lime-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Nutrição (Herdado do Lote)</h3>
            <p className="text-sm text-gray-600 mt-1">Dados nutricionais definidos pela categoria do lote</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estratégia nutricional</label>
                <p className="text-sm text-gray-900 min-h-[24px] flex items-center">
                  {form.estrategia_nutricional_nome || (
                    <span className="text-gray-400 italic">Definida pela categoria do lote</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">GMD (kg/cab/dia)</label>
                <p className="text-sm text-gray-900 min-h-[24px] flex items-center">
                  {form.gmd_kg_cab_dia || (
                    <span className="text-gray-400 italic">Definido pela categoria do lote</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Peso meta (kg)</label>
                <p className="text-sm text-gray-900 min-h-[24px] flex items-center">
                  {form.peso_meta_kg ? `${form.peso_meta_kg} kg` : (
                    <span className="text-gray-400 italic">Definido pela categoria do lote</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card Desmama */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-pink-50 to-rose-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Desmama</h3>
            <p className="text-sm text-gray-600 mt-1">Registro de dados da desmama</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data da desmama</label>
                <input
                  type="date"
                  value={form.data_desmama}
                  onChange={(e) => handleChange('data_desmama', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                />
                {errors.data_desmama && <p className="text-red-500 text-xs mt-1">{errors.data_desmama}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Peso na desmama (kg)</label>
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-50 to-sky-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Sisbov e Rastreabilidade</h3>
            <p className="text-sm text-gray-600 mt-1">Dados de rastreabilidade e SISBOV</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data de inserção na rastreabilidade</label>
                <input
                  type="date"
                  value={form.data_insercao_rastreabilidade}
                  onChange={(e) => handleChange('data_insercao_rastreabilidade', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_insercao_rastreabilidade && <p className="text-red-500 text-xs mt-1">{errors.data_insercao_rastreabilidade}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data de liberação SISBOV</label>
                <input
                  type="date"
                  value={form.data_liberacao_sisbov}
                  onChange={(e) => handleChange('data_liberacao_sisbov', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
                {errors.data_liberacao_sisbov && <p className="text-red-500 text-xs mt-1">{errors.data_liberacao_sisbov}</p>}
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
          <p className="text-gray-700">
            Você está alterando o lote deste indivíduo para:
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              <strong className="text-gray-900">Novo lote:</strong> {pendingLoteChange?.loteNome}
            </p>
            {pendingLoteChange?.pastoNome && (
              <p className="text-sm text-gray-600 mt-1">
                <strong className="text-gray-900">Pasto:</strong> {pendingLoteChange.pastoNome}
              </p>
            )}
            {form.categoria && (
              <p className="text-sm text-gray-600 mt-1">
                <strong className="text-gray-900">Categoria:</strong> {form.categoria}
              </p>
            )}
          </div>

          <div className="text-sm text-gray-600 space-y-1">
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
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-700 mb-6">{successModal.message}</p>
          <Button onClick={successModal.onClose} className="w-full sm:w-auto">
            OK
          </Button>
        </div>
      </Modal>
    </div>
  )
}
