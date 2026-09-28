const XLSX = require('xlsx')
const path = "C:\\Users\\USER\\Documents\\GestaUp-Cadernetas-Gestao\\Vision Versão Slim - Gesta'Up 2025 - v. 09.06.25 - Agrop. Marca.xlsm"

console.log('lendo arquivo...')
const wb = XLSX.readFile(path, { cellFormula: true, cellStyles: false, bookVBA: false, sheetStubs: false })

console.log('=== ABAS ===')
console.log('total:', wb.SheetNames.length)

let totalCells = 0
let totalFormulas = 0
const funcCount = {}

wb.SheetNames.forEach(n => {
  const ws = wb.Sheets[n]
  const ref = ws['!ref'] || 'vazio'
  let cells = 0, formulas = 0
  for (const key in ws) {
    if (key[0] === '!') continue
    cells++
    if (ws[key].f) {
      formulas++
      const m = String(ws[key].f).match(/([A-Z][A-Z0-9\.]+)\s*\(/)
      if (m) funcCount[m[1]] = (funcCount[m[1]] || 0) + 1
    }
  }
  totalCells += cells
  totalFormulas += formulas
  // primeira linha nao vazia como amostra de cabecalho
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' })
  let sample = ''
  for (const r of rows.slice(0, 8)) {
    const line = r.filter(v => v !== '').slice(0, 6).join(' | ')
    if (line) { sample = line; break }
  }
  console.log(`\n- ${n}\n  range=${ref} celulas=${cells} formulas=${formulas}\n  amostra: ${String(sample).slice(0, 140)}`)
})

console.log('\n=== TOTAIS ===')
console.log('celulas:', totalCells, 'formulas:', totalFormulas)

console.log('\n=== FUNCOES MAIS USADAS ===')
Object.entries(funcCount).sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([f, c]) => console.log(`${f}: ${c}`))

console.log('\n=== NOMES DEFINIDOS ===')
const dn = wb.Workbook && wb.Workbook.Names ? wb.Workbook.Names : []
console.log('total:', dn.length)
dn.slice(0, 15).forEach(d => console.log('-', d.Name))

console.log('\n=== VBA ===')
console.log('vbaraw presente:', !!wb.vbaraw)

console.log('\n=== GRAVAFOS/OCULTAS ===')
const sheetsMeta = wb.Workbook && wb.Workbook.Sheets ? wb.Workbook.Sheets : []
sheetsMeta.forEach((s, i) => {
  if (s.Hidden) console.log('aba oculta:', wb.SheetNames[i])
})
