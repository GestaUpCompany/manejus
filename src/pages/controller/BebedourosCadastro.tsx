import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardItem } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import type * as XLSXType from 'xlsx'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Bebedouro {
  id: string
  fazenda_id: string
  nome: string
  capacidade?: number
  data_ultima_limpeza?: string
  meta_intervalo_limpeza?: number
  setor_id?: string
  setores?: { nome: string }
  ativo: boolean
  created_at: string
  updated_at?: string
  data_ultima_limpeza_historico?: string
}

export function BebedourosCadastro() {
  const { user } = useAuth()
  const [bebedouros, setBebedouros] = useState<Bebedouro[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingBebedouro, setEditingBebedouro] = useState<Bebedouro | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    nome: '',
    capacidade: '',
    data_ultima_limpeza: '',
    meta_intervalo_limpeza: '',
    setor_id: ''
  })
  const [setores, setSetores] = useState<{id: string, nome: string}[]>([])

  useEffect(() => {
    loadBebedouros()
    loadSetores()
  }, [user])

  const loadSetores = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar setores:', error)
    } else {
      setSetores(data || [])
    }
  }

  const loadBebedouros = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('bebedouros')
      .select('*, setores(nome)')
      .eq('fazenda_id', fazendaId)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar bebedouros:', error)
    } else {
      const bebedourosWithHistorico = await Promise.all(
        (data as Bebedouro[]).map(async (bebedouro) => {
          const { data: ultimaLimpeza } = await supabase
            .from('historico_limpezas_bebedouros')
            .select('data_limpeza')
            .eq('bebedouro_id', bebedouro.id)
            .order('data_limpeza', { ascending: false })
            .limit(1)

          return {
            ...bebedouro,
            data_ultima_limpeza_historico: ultimaLimpeza && ultimaLimpeza.length > 0 ? ultimaLimpeza[0].data_limpeza : null
          }
        })
      )
      setBebedouros(bebedourosWithHistorico)
    }

    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSubmitting(true)

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmitting(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const bebedouroData = {
      fazenda_id: fazendaId,
      nome: formData.nome,
      capacidade: formData.capacidade ? parseFloat(formData.capacidade) : null,
      data_ultima_limpeza: formData.data_ultima_limpeza || null,
      meta_intervalo_limpeza: formData.meta_intervalo_limpeza ? parseInt(formData.meta_intervalo_limpeza) : null,
      setor_id: formData.setor_id || null,
      ativo: true
    }

    let error
    if (editingBebedouro) {
      const result = await supabase
        .from('bebedouros')
        .update(bebedouroData)
        .eq('id', editingBebedouro.id)
      error = result.error
    } else {
      const result = await supabase
        .from('bebedouros')
        .insert(bebedouroData)
      error = result.error
    }

    if (error) {
      console.error('Erro ao salvar bebedouro:', error)
    } else {
      handleCancel()
      loadBebedouros()
    }

    setSubmitting(false)
  }

  const handleEdit = (bebedouro: Bebedouro) => {
    setEditingBebedouro(bebedouro)
    setFormData({
      nome: bebedouro.nome,
      capacidade: bebedouro.capacidade?.toString() || '',
      data_ultima_limpeza: bebedouro.data_ultima_limpeza_historico || '',
      meta_intervalo_limpeza: bebedouro.meta_intervalo_limpeza?.toString() || '',
      setor_id: bebedouro.setor_id || ''
    })
    setShowForm(true)
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar bebedouros',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  const handleToggleActive = async (bebedouro: Bebedouro) => {
    const { error } = await supabase
      .from('bebedouros')
      .update({ ativo: !bebedouro.ativo })
      .eq('id', bebedouro.id)

    if (error) {
      console.error('Erro ao atualizar bebedouro:', error)
    } else {
      loadBebedouros()
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

      // Buscar bebedouros existentes para verificar duplicatas
      const { data: existingBebedouros } = await supabase
        .from('bebedouros')
        .select('nome')
        .eq('fazenda_id', fazendaId)

      const existingNames = new Set(existingBebedouros?.map(b => b.nome.toLowerCase()) || [])

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
      const requiredColumns = ['Nome/Numero', 'Capacidade (L)']
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
      const bebedourosToInsert: any[] = []
      const duplicates: { row: number; name: string }[] = []
      const invalidRows: { row: number; name: string; missingFields: string[] }[] = []
      let totalRowsProcessed = 0

      rows.forEach((row, rowIndex) => {
        const rowNum = rowIndex + 2 // Excel row number (1-indexed + header)

        console.log(`Linha ${rowNum}:`, row)

        // Skip empty rows (only check first 3 columns - the actual data columns)
        const dataColumns = row.slice(0, 3)
        if (!row || row.length === 0 || dataColumns.every(cell => cell === undefined || cell === null || cell === '')) {
          console.log(`Linha ${rowNum}: pulando linha vazia`)
          return
        }

        totalRowsProcessed++

        try {
          const nome = row[colIndices['nome/numero']]?.toString().trim()
          const capacidadeRaw = row[colIndices['capacidade (l)']]
          let capacidade = parseFloat(capacidadeRaw)
          if (isNaN(capacidade) && typeof capacidadeRaw === 'string') {
            const match = capacidadeRaw.match(/(\d[\d.]*)/i)
            if (match) {
              capacidade = parseFloat(match[1].replace(/\./g, ''))
            }
          }
          const metaIntervalo = colIndices['meta de intervalo de limpeza (dias)'] !== undefined ? row[colIndices['meta de intervalo de limpeza (dias)']] ? parseInt(row[colIndices['meta de intervalo de limpeza (dias)']]) : null : null

          // Verificar duplicata de nome
          if (nome && existingNames.has(nome.toLowerCase())) {
            duplicates.push({ row: rowNum, name: nome })
            console.log(`Linha ${rowNum}: pulando nome duplicado - ${nome}`)
            return
          }

          // Validações - coletar campos faltantes
          const missingFields: string[] = []
          if (!nome) missingFields.push('Nome/Numero')
          if (isNaN(capacidade) || capacidade <= 0) missingFields.push('Capacidade (L) - deve ser número positivo')

          if (metaIntervalo !== null && (isNaN(metaIntervalo) || metaIntervalo <= 0)) {
            missingFields.push('Meta de Intervalo de Limpeza (dias) - deve ser número positivo')
          }

          // Se houver erros de validação, adicionar a invalidRows e continuar
          if (missingFields.length > 0) {
            invalidRows.push({ row: rowNum, name: nome || '(sem nome)', missingFields })
            console.log(`Linha ${rowNum}: linha inválida - ${missingFields.join(', ')}`)
            return
          }

          // Se passou todas as validações, adicionar para inserção
          bebedourosToInsert.push({
            fazenda_id: fazendaId,
            nome,
            capacidade,
            meta_intervalo_limpeza: metaIntervalo,
            ativo: true,
          })
        } catch (err) {
          invalidRows.push({ row: rowNum, name: '(erro ao processar)', missingFields: ['Erro ao processar dados'] })
        }
      })

      if (bebedourosToInsert.length === 0) {
        setImportError('Nenhum dado válido para importar')
        setImporting(false)
        return
      }

      // Inserir no banco de dados
      const { error: insertError } = await supabase.from('bebedouros').insert(bebedourosToInsert)

      if (insertError) {
        setImportError(`Erro ao inserir dados: ${insertError.message}`)
        setImporting(false)
        return
      }

      let successMessage = ''
      const totalSkipped = duplicates.length + invalidRows.length

      if (totalSkipped > 0) {
        successMessage = `${bebedourosToInsert.length} de ${totalRowsProcessed} bebedouros importados com sucesso!`
      } else {
        successMessage = `${bebedourosToInsert.length} bebedouros importados com sucesso!`
      }

      if (duplicates.length > 0) {
        successMessage += `\n\n${duplicates.length} linhas puladas porque já existem:\n${duplicates.map(d => `- Linha ${d.row}: "${d.name}"`).join('\n')}`
      }

      if (invalidRows.length > 0) {
        successMessage += `\n\n${invalidRows.length} linhas com erros de validação:\n${invalidRows.map(i => `- Linha ${i.row}: "${i.name}" - Campos inválidos: ${i.missingFields.join(', ')}`).join('\n')}`
        successMessage += '\n\nVolte à planilha, localize os bebedouros com dados irregulares/faltantes, realize as correções indicadas acima e faça upload do arquivo novamente.'
      }

      setImportSuccess(successMessage)
      loadBebedouros()

      // Limpar input
      e.target.value = ''
    } catch (error) {
      setImportError(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    window.location.href = '/Modelo Bebedouros - Gesta\'Up.xlsx'
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingBebedouro(null)
    setFormData({ nome: '', capacidade: '', data_ultima_limpeza: '', meta_intervalo_limpeza: '', setor_id: '' })
  }

  if (loading) {
    return <p className="text-gray-600">Carregando...</p>
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Bebedouros</h2>
        <div className="flex flex-col sm:flex-row gap-2 items-start w-full md:w-auto">
          <Input
            type="text"
            placeholder="Buscar bebedouro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:max-w-xs border-gray-200 focus:border-accent h-10 text-sm"
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
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button onClick={() => setShowForm(true)} className="h-10 text-sm flex-1 sm:flex-none">Novo Bebedouro</Button>
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

      {/* Import Messages */}
      {importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Erro na importação:</p>
          <pre className="text-sm mt-1 whitespace-pre-wrap">{importError}</pre>
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          <p className="font-medium whitespace-pre-line">{importSuccess}</p>
        </div>
      )}

      {showForm && (
        <Card className="bg-white p-6 border-0 shadow-sm" disableHover>
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            {editingBebedouro ? 'Editar Bebedouro' : 'Novo Bebedouro'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome/Número *
              </label>
              <Input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Nome ou número do bebedouro"
                className="border-gray-200 focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacidade (L)
              </label>
              <Input
                type="number"
                value={formData.capacidade}
                onChange={(e) => setFormData({ ...formData, capacidade: e.target.value })}
                placeholder="Capacidade em litros"
                className="border-gray-200 focus:border-accent"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data da Última Limpeza
              </label>
              <Input
                type="date"
                value={formData.data_ultima_limpeza}
                onChange={(e) => setFormData({ ...formData, data_ultima_limpeza: e.target.value })}
                className="border-gray-200 focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta de Intervalo de Limpeza (dias)
              </label>
              <Input
                type="number"
                value={formData.meta_intervalo_limpeza}
                onChange={(e) => setFormData({ ...formData, meta_intervalo_limpeza: e.target.value })}
                placeholder="Intervalo em dias"
                className="border-gray-200 focus:border-accent"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Setor
              </label>
              <select
                value={formData.setor_id}
                onChange={(e) => setFormData({ ...formData, setor_id: e.target.value })}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] border border-gray-200 rounded-lg focus:outline-none focus:border-accent bg-white text-gray-700"
              >
                <option value="">Selecione um setor</option>
                {setores.map((setor) => (
                  <option key={setor.id} value={setor.id}>{setor.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && bebedouros.length === 0 ? (
        <Card className="bg-white p-12 border-0 shadow-sm text-center" disableHover>
          <p className="text-gray-600 mb-4">Nenhum bebedouro cadastrado</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeiro Bebedouro</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bebedouros
            .filter((bebedouro) => (showInactive || bebedouro.ativo))
            .filter((bebedouro) =>
              bebedouro.nome.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((bebedouro) => (
              <CardItem
                key={bebedouro.id}
                title={bebedouro.nome}
                subtitle={[
                  bebedouro.capacidade ? `Capacidade: ${bebedouro.capacidade} L` : undefined,
                  bebedouro.setores?.nome ? `Setor: ${bebedouro.setores.nome}` : undefined
                ].filter(Boolean).join(' | ') || undefined}
                status={bebedouro.ativo}
                onClick={() => handleEdit(bebedouro)}
              >
                {bebedouro.data_ultima_limpeza_historico && (
                  <p className="text-sm text-gray-500 mb-4">
                    Última limpeza: {formatDate(bebedouro.data_ultima_limpeza_historico)}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(bebedouro)
                    }}
                  >
                    {bebedouro.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(bebedouro)
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </CardItem>
            ))}
        </div>
      ) : null}
    </div>
  )
}
