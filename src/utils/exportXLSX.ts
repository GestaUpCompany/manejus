import type ExcelJS from 'exceljs'
import { formatDate, formatDateTime } from './formatDate'

export type ColumnFormat = 'date' | 'datetime' | 'number' | 'boolean' | 'text'

export interface ColumnConfig {
  source: string
  header: string
  format?: ColumnFormat
  transform?: (value: any) => any
}

export interface TableExportConfig {
  tableName: string
  sheetName: string
  columns: ColumnConfig[]
}

export interface SheetConfig {
  sheetName: string
  columns: ColumnConfig[]
}

export interface MultiSheetExportConfig {
  tableName: string
  sheets: { data: any[]; config: SheetConfig }[]
}

// Columns to automatically exclude from all exports
// Matches the old CSV columnsToRemove plus the original XLSX exclusions
const EXCLUDED_COLUMNS = new Set([
  'id',
  'fazenda_id',
  'dispositivo_id',
  'nome_usuario',
  'sync_status',
  'version',
  'created_at',
  'updated_at',
  'deleted_at',
  'lote_id',
  'pasto_id',
  'espacamento_cocho_cm_cab',
  'espacamento_cocho_obs',
  'espacamento_cocho_detalhes',
  'checklist',
  'espacamento_cocho_ideal',
  'pasto_saida_id',
  'pasto_entrada_id',
  'parto_vinculo_id',
  'lote_origem_id',
  'lote_destino_id',
  'individuo_id',
  'individuo_id_mae',
  'individuo_id_cria',
  'maquina_veiculo_id',
  'qtd_bezerros',
])

function formatValue(value: any, format?: ColumnFormat): any {
  if (value === null || value === undefined) {
    return ''
  }

  switch (format) {
    case 'date':
      return formatDate(value)
    case 'datetime':
      return formatDateTime(value)
    case 'number':
      return typeof value === 'number' ? value : Number(value) || 0
    case 'boolean':
      return value === true ? 'Sim' : value === false ? 'Não' : value
    case 'text':
    default:
      return value
  }
}

// Auto-generate header from snake_case key, same as old CSV
function autoHeader(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Format data field the same way the old CSV did: dd/MM/yyyy HH:mm:ss
function formatDataField(value: any): string {
  if (!value) return ''
  const date = new Date(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

// Build the full column list: configured columns + any extra data columns not in config
// Config columns that don't exist in the data are skipped (avoids phantom empty columns)
function buildColumnList(data: any[], configColumns: ColumnConfig[]): {
  configCols: ColumnConfig[]
  extraKeys: string[]
} {
  const configSources = new Set(configColumns.map(c => c.source))

  // Collect all keys that actually exist in the data
  const dataKeys = new Set<string>()
  for (const row of data) {
    if (!row || typeof row !== 'object') continue
    for (const key of Object.keys(row)) {
      dataKeys.add(key)
    }
  }

  // Keep config columns that exist in data.
  // Config columns bypass EXCLUDED_COLUMNS so explicitly-configured fields
  // (e.g. checklist in Bebedouros) always pass through.
  const filteredConfigCols = configColumns.filter(
    col => dataKeys.has(col.source)
  )

  // Scan data for keys not in config and not excluded
  const extraKeys: string[] = []
  const seen = new Set<string>()
  for (const row of data) {
    if (!row || typeof row !== 'object') continue
    for (const key of Object.keys(row)) {
      if (EXCLUDED_COLUMNS.has(key) || configSources.has(key) || seen.has(key)) continue
      seen.add(key)
      extraKeys.push(key)
    }
  }

  return { configCols: filteredConfigCols, extraKeys }
}

interface ResolvedColumn {
  header: string
  value: any
}

function resolveRow(row: any, configCols: ColumnConfig[], extraKeys: string[]): ResolvedColumn[] {
  const resolved: ResolvedColumn[] = []

  configCols.forEach(col => {
    const value = row[col.source]
    resolved.push({
      header: col.header,
      value: col.transform ? col.transform(value) : formatValue(value, col.format),
    })
  })

  extraKeys.forEach(key => {
    const value = row[key]
    let resolvedValue: any
    if (key === 'data') {
      resolvedValue = formatDataField(value)
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      resolvedValue = JSON.stringify(value)
    } else if (Array.isArray(value)) {
      resolvedValue = value.join(', ')
    } else {
      resolvedValue = value
    }
    resolved.push({ header: autoHeader(key), value: resolvedValue })
  })

  return resolved
}

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F0F0' },
  }
}

function applyDataStyle(cell: ExcelJS.Cell) {
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function autoFitColumns(worksheet: ExcelJS.Worksheet, headers: string[]) {
  worksheet.columns.forEach((col, i) => {
    const header = headers[i] ?? ''
    let maxLen = String(header).length
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const cell = worksheet.getCell(r, i + 1)
      const cellValue = cell.value ?? ''
      const len = String(cellValue).length
      if (len > maxLen) maxLen = len
    }
    col.width = Math.min(Math.max(maxLen + 2, 10), 40)
  })
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, tableName: string) {
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `${tableName}_${timestamp}.xlsx`
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportToXLSX(data: any[], config: TableExportConfig): Promise<void> {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  const { configCols, extraKeys } = buildColumnList(data, config.columns)

  const ExcelJSMod = await import('exceljs')
  const workbook = new ExcelJSMod.default.Workbook()
  const worksheet = workbook.addWorksheet(config.sheetName)

  // Build resolved rows
  const resolvedRows = data.map(row => resolveRow(row, configCols, extraKeys))
  const headers = resolvedRows.length > 0 ? resolvedRows[0].map(c => c.header) : configCols.map(c => c.header)

  // Header
  const headerRow = worksheet.addRow(headers)
  headerRow.eachCell(cell => applyHeaderStyle(cell))

  // Data
  for (const resolved of resolvedRows) {
    const excelRow = worksheet.addRow(resolved.map(c => c.value))
    excelRow.eachCell(cell => applyDataStyle(cell))
  }

  autoFitColumns(worksheet, headers)
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  await downloadWorkbook(workbook, config.tableName)
}

export async function exportToXLSXMultiSheet(config: MultiSheetExportConfig): Promise<void> {
  const ExcelJSMod = await import('exceljs')
  const workbook = new ExcelJSMod.default.Workbook()
  const usedNames = new Set<string>()

  for (const sheet of config.sheets) {
    if (!sheet.data || sheet.data.length === 0) continue

    const { configCols, extraKeys } = buildColumnList(sheet.data, sheet.config.columns)
    const resolvedRows = sheet.data.map(row => resolveRow(row, configCols, extraKeys))
    const headers = resolvedRows.length > 0 ? resolvedRows[0].map(c => c.header) : configCols.map(c => c.header)

    // Garante nome único de aba (Excel limita a 31 chars)
    let name = sheet.config.sheetName.slice(0, 31)
    let suffix = 1
    while (usedNames.has(name)) {
      const base = sheet.config.sheetName.slice(0, 28)
      name = `${base} (${suffix})`
      suffix++
    }
    usedNames.add(name)

    const worksheet = workbook.addWorksheet(name)

    // Header
    const headerRow = worksheet.addRow(headers)
    headerRow.eachCell(cell => applyHeaderStyle(cell))

    // Data
    for (const resolved of resolvedRows) {
      const excelRow = worksheet.addRow(resolved.map(c => c.value))
      excelRow.eachCell(cell => applyDataStyle(cell))
    }

    autoFitColumns(worksheet, headers)
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  await downloadWorkbook(workbook, config.tableName)
}
