import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, ConfirmModal, MultiSelect, EmptyState, PageSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import type * as XLSXType from 'xlsx'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Pasto {
  id: string
  fazenda_id: string
  nome: string
  setor?: string
  tipo?: string
  metragem_cocho_m?: number
  nivel_degradacao?: number
  area_total_ha?: number
  area_util_porcentagem?: number
  area_util_ha?: number
  especie?: string
  altura_entrada_cm?: number
  altura_saida_cm?: number
  possui_deposito?: boolean
  kg_deposito?: number
  fonte_agua_principal?: string
  bebedouros?: {id: string, nome: string}[]
  modulo_id?: string
  modulo_nome?: string
  modulo_ativo?: boolean
  meta_intervalo_ocupacao_dias?: number
  ativo: boolean
}

export function Pastos() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [pastos, setPastos] = useState<Pasto[]>([])
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [bebedouros, setBebedouros] = useState<{id: string, nome: string, capacidade?: number}[]>([])
  const [selectedBebedouros, setSelectedBebedouros] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPasto, setEditingPasto] = useState<Pasto | null>(null)
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [ocupacaoPorPasto, setOcupacaoPorPasto] = useState<Record<string, any>>({})
  const [formData, setFormData] = useState({
    nome: '',
    setor: '',
    tipo: '',
    metragem_cocho_m: '',
    nivel_degradacao: '',
    area_total_ha: '',
    area_util_porcentagem: '',
    area_util_ha: '',
    especie: '',
    altura_entrada_cm: '',
    altura_saida_cm: '',
    possui_deposito: false,
    kg_deposito: '',
    fonte_agua_principal: '',
    meta_intervalo_ocupacao_dias: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [pastoToDelete, setPastoToDelete] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const ITENS_POR_PAGINA = 12

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

    const [pastosData, setoresData, bebedourosData] = await Promise.all([
      supabase.from('pastos').select('*, modulos_pastos!left(nome, ativo)').eq('fazenda_id', fazendaId).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('setores').select('id, nome').eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null).order('nome'),
      supabase.from('bebedouros').select('id, nome, capacidade').eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null).order('nome'),
    ])

    if (pastosData.error) {
      console.error('Erro ao buscar pastos:', pastosData.error)
    } else {
      const pastosWithModulo = (pastosData.data as any[]).map((pasto) => ({
        ...pasto,
        modulo_nome: pasto.modulos_pastos?.nome || null,
        modulo_ativo: pasto.modulos_pastos?.ativo ?? true,
        bebedouros: [] as { id: string; nome: string }[],
      }))
      setPastos(pastosWithModulo as Pasto[])
    }

    if (setoresData.error) {
      console.error('Erro ao buscar setores:', setoresData.error)
    } else {
      setSetores(setoresData.data as { id: string; nome: string }[])
    }

    if (bebedourosData.error) {
      console.error('Erro ao buscar bebedouros:', bebedourosData.error)
    } else {
      setBebedouros(bebedourosData.data as { id: string; nome: string; capacidade?: number }[])
    }

    // Carregar ocupação apenas se houver pastos
    const pastosCarregados = (pastosData.data as any[]) || []
    if (pastosCarregados.length > 0) {
      const pastoIds = pastosCarregados.map((p) => p.id)
      const [ocupacaoRes, vinculosRes] = await Promise.all([
        supabase.from('v_lote_pasto_ocupacao_atual').select('*').in('pasto_id', pastoIds),
        supabase.from('pasto_bebedouros').select('pasto_id, bebedouros(id, nome)').in('pasto_id', pastoIds),
      ])

      if (ocupacaoRes.data) {
        const ocupacaoMap: Record<string, any> = {}
        ocupacaoRes.data.forEach((item: any) => {
          ocupacaoMap[item.pasto_id] = item
        })
        setOcupacaoPorPasto(ocupacaoMap)
      }

      if (vinculosRes.data) {
        const bebedourosPorPasto: Record<string, { id: string; nome: string }[]> = {}
        ;(vinculosRes.data as any[]).forEach((row) => {
          const b = row.bebedouros
          if (b) {
            const arr = Array.isArray(b) ? b : [b]
            bebedourosPorPasto[row.pasto_id] = arr.map((x: any) => ({ id: x.id, nome: x.nome }))
          }
        })
        setPastos((prev) =>
          prev.map((p) => ({
            ...p,
            bebedouros: bebedourosPorPasto[p.id] || [],
          }))
        )
      }
    } else {
      setOcupacaoPorPasto({})
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [user])

  useEffect(() => {
    setPaginaAtual(1)
  }, [searchTerm, showInactive])

  // Abrir formulário de edição direto via query param ?pasto=id (ex: vindo de notificação)
  useEffect(() => {
    const pastoId = searchParams.get('pasto')
    if (!pastoId || pastos.length === 0) return
    const pasto = pastos.find(p => p.id === pastoId)
    if (pasto) handleEdit(pasto)
  }, [searchParams, pastos])

  const pastosFiltrados = useMemo(() => {
    const termo = searchTerm.toLowerCase().trim()
    return pastos.filter((pasto) => {
      if (!showInactive && !pasto.ativo) return false
      if (!termo) return true
      return (
        pasto.nome.toLowerCase().includes(termo) ||
        (pasto.especie && pasto.especie.toLowerCase().includes(termo))
      )
    })
  }, [pastos, searchTerm, showInactive])

  const totalPaginas = Math.max(1, Math.ceil(pastosFiltrados.length / ITENS_POR_PAGINA))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const itensPaginados = pastosFiltrados.slice((paginaSegura - 1) * ITENS_POR_PAGINA, paginaSegura * ITENS_POR_PAGINA)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    if (!user) {
      setSubmitting(false)
      return
    }

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmitting(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const data = {
      fazenda_id: fazendaId,
      nome: formData.nome.trim(),
      setor: formData.setor || null,
      tipo: formData.tipo || null,
      metragem_cocho_m: formData.metragem_cocho_m ? parseFloat(formData.metragem_cocho_m) : null,
      nivel_degradacao: formData.nivel_degradacao ? parseInt(formData.nivel_degradacao) : null,
      area_total_ha: formData.area_total_ha ? parseFloat(formData.area_total_ha) : null,
      area_util_porcentagem: formData.area_util_porcentagem ? parseFloat(formData.area_util_porcentagem) : null,
      area_util_ha: formData.area_total_ha && formData.area_util_porcentagem
        ? parseFloat(formData.area_total_ha) * (parseFloat(formData.area_util_porcentagem) / 100)
        : formData.area_util_ha ? parseFloat(formData.area_util_ha) : null,
      especie: formData.especie || null,
      altura_entrada_cm: formData.altura_entrada_cm ? parseFloat(formData.altura_entrada_cm) : null,
      altura_saida_cm: formData.altura_saida_cm ? parseFloat(formData.altura_saida_cm) : null,
      possui_deposito: formData.possui_deposito,
      kg_deposito: formData.kg_deposito ? parseFloat(formData.kg_deposito) : null,
      fonte_agua_principal: formData.fonte_agua_principal || null,
      meta_intervalo_ocupacao_dias: formData.meta_intervalo_ocupacao_dias ? parseInt(formData.meta_intervalo_ocupacao_dias) : null,
    }

    let error
    let pastoId: string | null = null

    if (editingPasto) {
      // Atualizar pasto existente
      const { error: updateError } = await supabase
        .from('pastos')
        .update(data)
        .eq('id', editingPasto.id)
      error = updateError
      pastoId = editingPasto.id
    } else {
      // Criar novo pasto
      const { error: insertError, data: inserted } = await supabase.from('pastos').insert(data).select('id').single()
      error = insertError
      pastoId = inserted?.id || null
    }

    // Sincronizar vínculos pasto_bebedouros (junction)
    if (!error && pastoId) {
      const { error: delError } = await supabase
        .from('pasto_bebedouros')
        .delete()
        .eq('pasto_id', pastoId)

      if (!delError && selectedBebedouros.length > 0) {
        const rows = selectedBebedouros.map((bebedouro_id) => ({ pasto_id: pastoId, bebedouro_id }))
        await supabase.from('pasto_bebedouros').insert(rows)
      }
    }

    if (error) {
      console.error('Erro ao salvar pasto:', error)
    } else {

      setFormData({
        nome: '',
        setor: '',
        tipo: '',
        metragem_cocho_m: '',
        nivel_degradacao: '',
        area_total_ha: '',
        area_util_porcentagem: '',
        area_util_ha: '',
        especie: '',
        altura_entrada_cm: '',
        altura_saida_cm: '',
        possui_deposito: false,
        kg_deposito: '',
        fonte_agua_principal: '',
        meta_intervalo_ocupacao_dias: '',
      })
      setSelectedBebedouros([])
      setShowForm(false)
      setEditingPasto(null)
      loadData()
    }

    setSubmitting(false)
  }

  const handleEdit = async (pasto: Pasto) => {
    setEditingPasto(pasto)
    setFormData({
      nome: pasto.nome,
      setor: pasto.setor || '',
      tipo: pasto.tipo || '',
      metragem_cocho_m: pasto.metragem_cocho_m?.toString() || '',
      nivel_degradacao: pasto.nivel_degradacao?.toString() || '',
      area_total_ha: pasto.area_total_ha?.toString() || '',
      area_util_porcentagem: pasto.area_util_porcentagem?.toString() || '',
      area_util_ha: pasto.area_util_ha?.toString() || '',
      especie: pasto.especie || '',
      altura_entrada_cm: pasto.altura_entrada_cm?.toString() || '',
      altura_saida_cm: pasto.altura_saida_cm?.toString() || '',
      possui_deposito: pasto.possui_deposito || false,
      kg_deposito: pasto.kg_deposito?.toString() || '',
      fonte_agua_principal: pasto.fonte_agua_principal || '',
      meta_intervalo_ocupacao_dias: pasto.meta_intervalo_ocupacao_dias?.toString() || '',
    })

    // Load associated bebedouros from junction (pasto_bebedouros)
    setSelectedBebedouros(pasto.bebedouros?.map(b => b.id) || [])

    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingPasto(null)
    setFormData({
      nome: '',
      setor: '',
      tipo: '',
      metragem_cocho_m: '',
      nivel_degradacao: '',
      area_total_ha: '',
      area_util_porcentagem: '',
      area_util_ha: '',
      especie: '',
      altura_entrada_cm: '',
      altura_saida_cm: '',
      possui_deposito: false,
      kg_deposito: '',
      fonte_agua_principal: '',
      meta_intervalo_ocupacao_dias: '',
    })
    setSelectedBebedouros([])
    setShowForm(false)
  }

  const handleDeleteClick = (id: string) => {
    setPastoToDelete(id)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!pastoToDelete) return

    const { error } = await supabase
      .from('pastos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', pastoToDelete)

    if (error) {
      console.error('Erro ao excluir pasto:', error)
    } else {
      loadData()
    }

    setShowDeleteModal(false)
    setPastoToDelete(null)
  }

  const handleToggleActive = async (pasto: Pasto) => {
    const { error } = await supabase
      .from('pastos')
      .update({ ativo: !pasto.ativo })
      .eq('id', pasto.id)

    if (error) {
      console.error('Erro ao atualizar pasto:', error)
    } else {
      loadData()
    }
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return

    const file = e.target.files[0]
    setImporting(true)
    setImportError(null)
    setImportSuccess(null)

    try {
      if (!user) {
        setImportError('Usuário não autenticado')
        setImporting(false)
        return
      }

      // Buscar fazenda vinculada
      const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

      if (!vinculos || vinculos.length === 0) {
        setImportError('Nenhuma fazenda vinculada ao usuário')
        setImporting(false)
        return
      }

      const fazendaId = vinculos[0].fazenda_id

      // Buscar pastos existentes para verificar duplicatas
      const { data: existingPastos } = await supabase
        .from('pastos')
        .select('nome')
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)

      const existingNames = new Set(existingPastos?.map(p => p.nome.toLowerCase()) || [])

      // Ler arquivo Excel
      const data = await file.arrayBuffer()
      const XLSX = await import('xlsx') as typeof XLSXType
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

      if (jsonData.length < 2) {
        setImportError('Arquivo vazio ou sem dados')
        setImporting(false)
        return
      }

      // Mapear colunas (linha 0 são os cabeçalhos)
      const headers = jsonData[0].map((h: any) => h?.toString().trim())
      const rows = jsonData.slice(1)

      console.log('Headers encontrados:', headers)

      // Validar colunas obrigatórias (case-insensitive)
      const requiredColumns = ['Nome', 'Especie', 'Area Util (ha)', 'Altura Entrada (cm)', 'Altura Saida (cm)']
      const headersLower = headers.map(h => h.toLowerCase())
      const missingColumns = requiredColumns.filter(col => !headersLower.includes(col.toLowerCase()))

      if (missingColumns.length > 0) {
        setImportError(`Colunas obrigatórias faltando: ${missingColumns.join(', ')}`)
        setImporting(false)
        return
      }

      // Mapear índices das colunas (case-insensitive)
      const colIndices: { [key: string]: number } = {}
      headers.forEach((header, index) => {
        colIndices[header.toLowerCase()] = index
      })

      console.log('Índices das colunas:', colIndices)

      // Validar e processar dados
      const pastosToInsert: any[] = []
      const duplicates: { row: number; name: string }[] = []
      const invalidRows: { row: number; name: string; missingFields: string[] }[] = []
      let totalRowsProcessed = 0

      rows.forEach((row, rowIndex) => {
        const rowNum = rowIndex + 2 // Excel row number (1-indexed + header)

        console.log(`Linha ${rowNum}:`, row)

        // Skip empty rows (only check first 9 columns - the actual data columns)
        const dataColumns = row.slice(0, 9)
        if (!row || row.length === 0 || dataColumns.every(cell => cell === undefined || cell === null || cell === '')) {
          console.log(`Linha ${rowNum}: pulando linha vazia`)
          return
        }

        totalRowsProcessed++

        try {
          const nome = row[colIndices['nome']]?.toString().trim()
          const especie = row[colIndices['especie']]?.toString().trim()
          const areaUtil = parseFloat(row[colIndices['area util (ha)']])
          const alturaEntrada = parseFloat(row[colIndices['altura entrada (cm)']])
          const alturaSaida = parseFloat(row[colIndices['altura saida (cm)']])
          const tipo = colIndices['tipo'] !== undefined ? row[colIndices['tipo']]?.toString().trim() || null : null
          const setor = colIndices['setor'] !== undefined ? row[colIndices['setor']]?.toString().trim() || null : null
          const metragemCocho = colIndices['metragem cocho (m)'] !== undefined && row[colIndices['metragem cocho (m)']] ? parseFloat(row[colIndices['metragem cocho (m)']]) : null
          const nivelDegradacao = colIndices['nivel degradacao'] !== undefined ? row[colIndices['nivel degradacao']] ? parseInt(row[colIndices['nivel degradacao']]) : null : null
          const areaTotalHa = colIndices['area total (ha)'] !== undefined ? row[colIndices['area total (ha)']] ? parseFloat(row[colIndices['area total (ha)']]) : null : null
          const areaUtilPorcentagem = colIndices['area util (%)'] !== undefined ? row[colIndices['area util (%)']] ? parseFloat(row[colIndices['area util (%)']]) : null : null

          // Verificar duplicata de nome
          if (nome && existingNames.has(nome.toLowerCase())) {
            duplicates.push({ row: rowNum, name: nome })
            console.log(`Linha ${rowNum}: pulando nome duplicado - ${nome}`)
            return
          }

          // Validações - coletar campos faltantes
          const missingFields: string[] = []
          if (!nome) missingFields.push('Nome')
          if (!especie) missingFields.push('Especie')
          if (isNaN(areaUtil) || areaUtil <= 0) missingFields.push('Area Util (ha) - deve ser número positivo')
          if (isNaN(alturaEntrada) || alturaEntrada <= 0) missingFields.push('Altura Entrada (cm) - deve ser número positivo')
          if (isNaN(alturaSaida) || alturaSaida <= 0) missingFields.push('Altura Saida (cm) - deve ser número positivo')
          if (metragemCocho !== null && (isNaN(metragemCocho) || metragemCocho <= 0)) missingFields.push('Metragem Cocho (m) - deve ser número positivo')

          const tiposValidos = ['Cria', 'Confinamento', 'Engorda', 'Enfermaria', 'Recria', 'RIP', 'TIP', 'Volumosos']
          if (tipo && !tiposValidos.includes(tipo)) {
            missingFields.push(`Tipo - deve ser um dos seguintes: ${tiposValidos.join(', ')}`)
          }

          if (nivelDegradacao !== null && (isNaN(nivelDegradacao) || nivelDegradacao < 1 || nivelDegradacao > 5)) {
            missingFields.push('Nivel Degradacao - deve ser entre 1 e 5')
          }

          if (areaTotalHa !== null && (isNaN(areaTotalHa) || areaTotalHa <= 0)) {
            missingFields.push('Area Total (ha) - deve ser número positivo')
          }

          if (areaUtilPorcentagem !== null && (isNaN(areaUtilPorcentagem) || areaUtilPorcentagem < 0 || areaUtilPorcentagem > 100)) {
            missingFields.push('Area Util (%) - deve ser entre 0 e 100')
          }

          // Se houver erros de validação, adicionar a invalidRows e continuar
          if (missingFields.length > 0) {
            invalidRows.push({ row: rowNum, name: nome || '(sem nome)', missingFields })
            console.log(`Linha ${rowNum}: linha inválida - ${missingFields.join(', ')}`)
            return
          }

          // Se passou todas as validações, adicionar para inserção
          pastosToInsert.push({
            fazenda_id: fazendaId,
            nome,
            setor,
            tipo,
            metragem_cocho_m: metragemCocho,
            nivel_degradacao: nivelDegradacao,
            area_total_ha: areaTotalHa,
            area_util_porcentagem: areaUtilPorcentagem,
            area_util_ha: areaTotalHa && areaUtilPorcentagem 
              ? areaTotalHa * (areaUtilPorcentagem / 100)
              : areaUtil,
            especie,
            altura_entrada_cm: alturaEntrada,
            altura_saida_cm: alturaSaida,
            ativo: true,
          })
        } catch (err) {
          invalidRows.push({ row: rowNum, name: '(erro ao processar)', missingFields: ['Erro ao processar dados'] })
        }
      })

      if (pastosToInsert.length === 0) {
        setImportError('Nenhum dado válido para importar')
        setImporting(false)
        return
      }

      // Inserir no banco de dados
      const { error: insertError } = await supabase.from('pastos').insert(pastosToInsert)

      if (insertError) {
        setImportError(`Erro ao inserir dados: ${insertError.message}`)
        setImporting(false)
        return
      }

      let successMessage = ''
      const totalSkipped = duplicates.length + invalidRows.length

      if (totalSkipped > 0) {
        successMessage = `${pastosToInsert.length} de ${totalRowsProcessed} pastos importados com sucesso!`
      } else {
        successMessage = `${pastosToInsert.length} pastos importados com sucesso!`
      }

      if (duplicates.length > 0) {
        successMessage += `\n\n${duplicates.length} linhas puladas porque já existem:\n${duplicates.map(d => `- Linha ${d.row}: "${d.name}"`).join('\n')}`
      }

      if (invalidRows.length > 0) {
        successMessage += `\n\n${invalidRows.length} linhas com erros de validação:\n${invalidRows.map(i => `- Linha ${i.row}: "${i.name}" - Campos inválidos: ${i.missingFields.join(', ')}`).join('\n')}`
        successMessage += '\n\nVolte à planilha, localize os pastos com dados irregulares/faltantes, realize as correções indicadas acima e faça upload do arquivo novamente.'
      }

      setImportSuccess(successMessage)
      loadData()

      // Limpar input
      e.target.value = ''
    } catch (error) {
      setImportError(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    window.location.href = '/Modelo Pastos - Gesta\'Up.xlsx'
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar pastos',
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
    return <PageSkeleton variant="grid" />
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!showForm && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Pastos</h2>
          <div className="flex flex-col sm:flex-row gap-2 items-start w-full md:w-auto">
            <Input
              type="text"
              placeholder="Buscar pasto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-xs border-gray-200 focus:border-accent h-10 text-sm"
            />
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button onClick={() => setShowForm(true)} className="h-10 text-sm flex-1 sm:flex-none">Novo Pasto</Button>
              <Button onClick={downloadTemplate} variant="secondary" className="h-10 text-sm flex-1 sm:flex-none">Baixar Modelo</Button>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportExcel}
                disabled={importing}
                className="hidden"
                id="import-excel"
              />
              <Button
                onClick={() => document.getElementById('import-excel')?.click()}
                variant="secondary"
                className="h-10 text-sm flex-1 sm:flex-none"
                disabled={importing}
              >
                {importing ? 'Importando...' : 'Importar Excel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toggle */}
      {!showForm && (
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

      {/* Import Messages */}
      {importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg">
          <p className="font-medium text-sm sm:text-base">Erro na importação:</p>
          <pre className="text-xs sm:text-sm mt-1 whitespace-pre-wrap">{importError}</pre>
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg">
          <p className="font-medium text-sm sm:text-base whitespace-pre-line">{importSuccess}</p>
        </div>
      )}

      {showForm && (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-800">
                {editingPasto ? 'Editar Pasto' : 'Novo Pasto'}
              </h3>
              {editingPasto && !editingPasto.ativo && editingPasto.modulo_id && editingPasto.modulo_ativo === false && (
                <div className="mt-1">
                  <p className="text-sm text-amber-600">
                    Este pasto foi desativado porque seu módulo "{editingPasto.modulo_nome}" também foi desativado.
                    Para reativar este pasto, será necessário reativar seu módulo primeiro.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => navigate('/controller/modulos-pastos', { state: { editModuloId: editingPasto.modulo_id } })}
                  >
                    Ir para Módulo
                  </Button>
                </div>
              )}
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Nome <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Nome do pasto"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Setor
                </label>
                <select
                  value={formData.setor}
                  onChange={(e) => setFormData({ ...formData, setor: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 transition-all text-sm"
                >
                  <option value="">Selecione...</option>
                  {setores.map((setor) => (
                    <option key={setor.id} value={setor.nome}>
                      {setor.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Sistema de Produção
                </label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 transition-all text-sm"
                >
                  <option value="">Selecione...</option>
                  <option value="Cria">Cria</option>
                  <option value="Confinamento">Confinamento</option>
                  <option value="Engorda">Engorda</option>
                  <option value="Enfermaria">Enfermaria</option>
                  <option value="Recria">Recria</option>
                  <option value="RIP">RIP</option>
                  <option value="TIP">TIP</option>
                  <option value="Volumosos">Volumosos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Metragem Cocho (m)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.metragem_cocho_m}
                  onChange={(e) => setFormData({ ...formData, metragem_cocho_m: e.target.value })}
                  placeholder="0"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Nível Degradação
                </label>
                <select
                  value={formData.nivel_degradacao}
                  onChange={(e) => setFormData({ ...formData, nivel_degradacao: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 transition-all text-sm"
                >
                  <option value="">Selecione...</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Área Total (ha)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.area_total_ha}
                  onChange={(e) => {
                    setFormData({ ...formData, area_total_ha: e.target.value })
                    // Auto-calculate area_util_ha if both fields are filled
                    if (e.target.value && formData.area_util_porcentagem) {
                      const calculated = parseFloat(e.target.value) * (parseFloat(formData.area_util_porcentagem) / 100)
                      setFormData(prev => ({ ...prev, area_util_ha: calculated.toFixed(2) }))
                    }
                  }}
                  placeholder="Ex: 100"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Área Útil (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.area_util_porcentagem}
                  onChange={(e) => {
                    setFormData({ ...formData, area_util_porcentagem: e.target.value })
                    // Auto-calculate area_util_ha if both fields are filled
                    if (e.target.value && formData.area_total_ha) {
                      const calculated = parseFloat(formData.area_total_ha) * (parseFloat(e.target.value) / 100)
                      setFormData(prev => ({ ...prev, area_util_ha: calculated.toFixed(2) }))
                    }
                  }}
                  placeholder="Ex: 80"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Área Útil (ha)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.area_util_ha}
                  readOnly
                  placeholder="Calculado automaticamente"
                  className="border-gray-200 focus:border-accent text-sm bg-gray-50"
                />
              </div>
              {editingPasto && editingPasto.modulo_nome && (
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                    Módulo
                  </label>
                  <Input
                    type="text"
                    value={editingPasto.modulo_nome}
                    disabled
                    className="bg-gray-50 border-gray-200 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Meta de Ocupação (dias)
                </label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={formData.meta_intervalo_ocupacao_dias}
                  onChange={(e) => setFormData({ ...formData, meta_intervalo_ocupacao_dias: e.target.value })}
                  placeholder="Ex: 7"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Espécie <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.especie}
                onChange={(e) => setFormData({ ...formData, especie: e.target.value })}
                required
                placeholder="Ex: Brachiaria"
                className="border-gray-200 focus:border-accent text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Altura Entrada (cm) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.altura_entrada_cm}
                  onChange={(e) => setFormData({ ...formData, altura_entrada_cm: e.target.value })}
                  required
                  placeholder="Ex: 15.0"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Altura Saída (cm) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.altura_saida_cm}
                  onChange={(e) => setFormData({ ...formData, altura_saida_cm: e.target.value })}
                  required
                  placeholder="Ex: 5.0"
                  className="border-gray-200 focus:border-accent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Fonte de Água Principal
              </label>
              <select
                value={formData.fonte_agua_principal}
                onChange={(e) => setFormData({ ...formData, fonte_agua_principal: e.target.value })}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] rounded-lg border-2 border-gray-200 focus:border-accent bg-white text-gray-700 transition-all text-sm"
              >
                <option value="">Selecione...</option>
                <option value="Bebedouro">Bebedouro</option>
                <option value="Córrego">Córrego</option>
                <option value="Represa">Represa</option>
                <option value="Rio">Rio</option>
              </select>
            </div>

            <MultiSelect
              options={bebedouros.map(b => ({
                id: b.id,
                name: b.nome,
                subtitle: b.capacidade ? `Capacidade: ${b.capacidade} L` : undefined
              }))}
              value={selectedBebedouros}
              onChange={setSelectedBebedouros}
              placeholder="Selecione bebedouros..."
              label="Bebedouros"
              className="border-gray-200 focus:border-accent"
              />

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Possui depósito?</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, possui_deposito: !formData.possui_deposito })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.possui_deposito ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.possui_deposito ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>

              {formData.possui_deposito && (
                <div className="w-1/4 pl-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kg no depósito <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.kg_deposito}
                    onChange={(e) => setFormData({ ...formData, kg_deposito: e.target.value })}
                    required
                    placeholder="Ex: 1000"
                    className="border-gray-200 focus:border-accent"
                  />
                </div>
              )}
            </div>

            {editingPasto && (
              <div className="border-t-2 border-gray-100 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Ocupação Atual
                </h3>
                {ocupacaoPorPasto[editingPasto.id] ? (
                  <div className={`rounded-xl p-4 space-y-2 ${ocupacaoPorPasto[editingPasto.id].meta_excedida ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    {ocupacaoPorPasto[editingPasto.id].meta_excedida && (
                      <p className="text-xs font-bold text-red-700 flex items-center gap-1">
                        ⚠️ Meta de ocupação excedida em {ocupacaoPorPasto[editingPasto.id].dias_acima_meta} dia(s)
                      </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Lote</p>
                        <p className="text-sm font-medium text-gray-800">{ocupacaoPorPasto[editingPasto.id].lote_nome}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Tempo de ocupação</p>
                        <p className="text-sm font-medium text-gray-800">{ocupacaoPorPasto[editingPasto.id].periodo_ocupacao_dias} dias</p>
                      </div>
                      {ocupacaoPorPasto[editingPasto.id].taxa_lotacao_ua_ha != null && (
                        <div>
                          <p className="text-xs text-gray-500">Taxa de lotação</p>
                          <p className="text-sm font-semibold text-blue-700">{Number(ocupacaoPorPasto[editingPasto.id].taxa_lotacao_ua_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UA/ha</p>
                        </div>
                      )}
                      {ocupacaoPorPasto[editingPasto.id].meta_intervalo_ocupacao_dias && (
                        <div>
                          <p className="text-xs text-gray-500">Meta</p>
                          <p className={`text-sm font-medium ${ocupacaoPorPasto[editingPasto.id].meta_excedida ? 'text-red-700' : 'text-green-700'}`}>
                            {ocupacaoPorPasto[editingPasto.id].meta_intervalo_ocupacao_dias} dias
                          </p>
                        </div>
                      )}
                      {ocupacaoPorPasto[editingPasto.id].cabecas_entrada && (
                        <div>
                          <p className="text-xs text-gray-500">Cabeças na entrada</p>
                          <p className="text-sm font-medium text-gray-800">{ocupacaoPorPasto[editingPasto.id].cabecas_entrada}</p>
                        </div>
                      )}
                      {ocupacaoPorPasto[editingPasto.id].peso_vivo_medio_entrada_kg && (
                        <div>
                          <p className="text-xs text-gray-500">Peso médio entrada</p>
                          <p className="text-sm font-medium text-gray-800">{Number(ocupacaoPorPasto[editingPasto.id].peso_vivo_medio_entrada_kg).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</p>
                        </div>
                      )}
                      {ocupacaoPorPasto[editingPasto.id].data_hora_entrada && (
                        <div>
                          <p className="text-xs text-gray-500">Data de entrada</p>
                          <p className="text-sm font-medium text-gray-800">{new Date(ocupacaoPorPasto[editingPasto.id].data_hora_entrada).toLocaleDateString('pt-BR')}</p>
                        </div>
                      )}
                    </div>
                    {ocupacaoPorPasto[editingPasto.id].desvio_percentual_atual != null && (
                      <p className={`text-xs mt-1 ${ocupacaoPorPasto[editingPasto.id].meta_excedida ? 'text-red-600' : 'text-green-600'}`}>
                        Desvio atual: {ocupacaoPorPasto[editingPasto.id].desvio_percentual_atual > 0 ? '+' : ''}{Number(ocupacaoPorPasto[editingPasto.id].desvio_percentual_atual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl p-4 bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-500">Nenhum lote ocupando este pasto no momento.</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none text-sm">
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCancel} className="flex-1 sm:flex-none text-sm">
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && pastosFiltrados.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'Nenhum pasto encontrado para a busca' : 'Nenhum pasto cadastrado'}
          action={!searchTerm ? <Button onClick={() => setShowForm(true)} className="text-sm">Criar Primeiro Pasto</Button> : undefined}
        />
      ) : !showForm ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {itensPaginados.map((pasto) => (
              <Card
                key={pasto.id}
                className={`p-4 sm:p-6 shadow-sm cursor-pointer transition-all hover:shadow-xl flex flex-col ${
                  ocupacaoPorPasto[pasto.id]?.meta_excedida
                    ? 'border-2 border-red-400'
                    : 'border-0'
                }`}
                onClick={() => handleEdit(pasto)}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-base sm:text-lg">{pasto.nome}</h3>
                    {pasto.area_util_ha && (
                      <p className="text-xs sm:text-sm text-gray-500">Área Útil: {pasto.area_util_ha} ha</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {ocupacaoPorPasto[pasto.id]?.meta_excedida && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center gap-1">
                        ⚠️ Meta excedida
                      </span>
                    )}
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium self-start md:self-auto ${
                        pasto.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {pasto.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 mb-4 flex-grow">
                  {pasto.setor && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Setor:</span> {pasto.setor}</p>
                  )}
                  {pasto.tipo && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Sistema de Produção:</span> {pasto.tipo}</p>
                  )}
                  {pasto.area_total_ha && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Área Total:</span> {pasto.area_total_ha} ha</p>
                  )}
                  {pasto.area_util_porcentagem && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Área Útil:</span> {pasto.area_util_porcentagem}%</p>
                  )}
                  {pasto.area_util_ha && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Área Útil (ha):</span> {pasto.area_util_ha} ha</p>
                  )}
                  {pasto.especie && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Espécie:</span> {pasto.especie}</p>
                  )}
                  {pasto.modulo_nome && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Módulo:</span> {pasto.modulo_nome}</p>
                  )}
                  {pasto.metragem_cocho_m && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Metragem Cocho:</span> {pasto.metragem_cocho_m} m</p>
                  )}
                  {pasto.nivel_degradacao && (
                    <p className="text-sm text-gray-500"><span className="font-medium">Nível Degradação:</span> {pasto.nivel_degradacao}</p>
                  )}
                  {(pasto.altura_entrada_cm || pasto.altura_saida_cm) && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Alturas:</span>{' '}
                      {pasto.altura_entrada_cm && `Entrada: ${pasto.altura_entrada_cm} cm`}
                      {pasto.altura_entrada_cm && pasto.altura_saida_cm && ' | '}
                      {pasto.altura_saida_cm && `Saída: ${pasto.altura_saida_cm} cm`}
                    </p>
                  )}
                  {ocupacaoPorPasto[pasto.id] && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-sm text-gray-500"><span className="font-medium">Lote:</span> {ocupacaoPorPasto[pasto.id].lote_nome}</p>
                      <p className="text-sm text-gray-500"><span className="font-medium">Tempo de ocupação:</span> {ocupacaoPorPasto[pasto.id].periodo_ocupacao_dias} dias</p>
                      {ocupacaoPorPasto[pasto.id].meta_intervalo_ocupacao_dias && (
                        <p className={`text-sm ${ocupacaoPorPasto[pasto.id].meta_excedida ? 'text-red-600' : 'text-gray-500'}`}>
                          <span className="font-medium">Meta:</span> {ocupacaoPorPasto[pasto.id].meta_intervalo_ocupacao_dias} dias
                          {ocupacaoPorPasto[pasto.id].meta_excedida && (
                            <span className="ml-2">(⚠️ Excedida em {ocupacaoPorPasto[pasto.id].dias_acima_meta} dias)</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-auto pt-3">
                  <button
                    className="rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 focus:ring-gray-500 hover:shadow-md hover:bg-gray-300 flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(pasto)
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className={`rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 focus:ring-gray-500 hover:shadow-md hover:bg-gray-300 text-red-600 hover:text-red-700`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(pasto)
                    }}
                  >
                    {pasto.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    className="rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 focus:ring-gray-500 hover:shadow-md hover:bg-gray-300 text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteClick(pasto.id)
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-xs text-gray-500">
                Página {paginaSegura} de {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      ) : null}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Pasto"
        message="Tem certeza que deseja excluir este pasto? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  )
}
