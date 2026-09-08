const columnsToRemove = ['id', 'fazenda_id', 'dispositivo_id', 'nome_usuario', 'created_at', 'updated_at', 'deleted_at', 'lote_id', 'pasto_id', 'sync_status', 'version', 'espacamento_cocho_cm_cab', 'espacamento_cocho_obs', 'espacamento_cocho_detalhes', 'checklist', 'espacamento_cocho_ideal']

function prepareDataForExport(data: any[]): any[] {
  return data.map(row => {
    const newRow: any = {}
    Object.keys(row).forEach(key => {
      if (!columnsToRemove.includes(key)) {
        // Renomear colunas
        let newKey = key
        if (key === 'kg_cocho') newKey = 'Kg Cocho'
        if (key === 'kg_deposito') newKey = 'Kg Deposito'
        if (key === 'escore_fezes') newKey = 'Escore Fezes'

        // Colocar iniciais maiúsculas em todas as colunas
        newKey = newKey.split('_').map(word => {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        }).join(' ')

        // Formatar data para padrão brasileiro
        if (key === 'data' && row[key]) {
          const date = new Date(row[key])
          const day = String(date.getDate()).padStart(2, '0')
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const year = date.getFullYear()
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          const seconds = String(date.getSeconds()).padStart(2, '0')
          newRow[newKey] = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
        } else {
          newRow[newKey] = row[key]
        }
      }
    })
    return newRow
  })
}

export function exportToCSV(data: any[], filename: string, onEmpty?: () => void) {
  if (data.length === 0) {
    if (onEmpty) onEmpty()
    else alert('Nenhum dado para exportar')
    return
  }

  const preparedData = prepareDataForExport(data)

  // Obter headers das chaves do primeiro objeto
  const headers = Object.keys(preparedData[0])

  // Converter dados para formato CSV
  const csvRows = []

  // Adicionar headers
  csvRows.push(headers.join(','))

  // Adicionar linhas de dados
  for (const row of preparedData) {
    const values = headers.map(header => {
      const value = row[header]
      // Tratar valores null/undefined
      if (value === null || value === undefined) return ''
      // Tratar datas
      if (value instanceof Date) return value.toLocaleDateString('pt-BR')
      // Converter para string e escapar vírgulas
      const stringValue = String(value)
      return stringValue.includes(',') ? `"${stringValue}"` : stringValue
    })
    csvRows.push(values.join(','))
  }

  // Criar blob e download
  const csvString = csvRows.join('\n')
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}
