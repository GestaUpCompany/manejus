import ExcelJS from 'exceljs'
import { COLUNAS_MODELO, SISTEMAS_PRODUCAO, DESTINOS, CATEGORIAS, SEXOS } from '../services/lotesImportacao'

// ============================================================================
// Gera a planilha-modelo de importação de lotes: aba "Importação" com uma
// linha por categoria e dropdowns (data validation) alimentados pelas listas
// cadastradas da fazenda na aba oculta "Listas". Os dropdowns usam defined
// names (em vez de referência direta a outra aba) para funcionar também em
// versões antigas do Excel e no LibreOffice.
// ============================================================================

export interface OpcoesModeloLotes {
  pastos: string[]
  currais: string[]
  racas: string[]
}

const ULTIMA_LINHA_VALIDACAO = 501

const NOTAS_CABECALHO: Record<string, string> = {
  Lote: 'Nome do lote. Repita o mesmo nome nas linhas das categorias que pertencem ao mesmo lote.',
  'Sistema de Produção': 'Selecione na lista. Confinamento, TIP e Sequestro exigem a coluna Curral; os demais exigem Pasto.',
  Pasto: 'Obrigatório para lotes de pasto (Cria, Engorda, Recria, RIP). Selecione na lista.',
  Curral: 'Obrigatório para Confinamento, TIP e Sequestro. Selecione na lista.',
  Destino: 'Opcional. corte (abate), reprodução ou enfermaria.',
  Categoria: 'Obrigatório. Selecione na lista. Não repita a mesma categoria dentro do mesmo lote.',
  'Quantidade (cab)': 'Obrigatório. Número inteiro de cabeças da categoria.',
  'Data Pesagem': 'Opcional. Campo de data: no Excel 365/Web o duplo clique abre o calendário; texto livre é bloqueado.',
  'Peso Entrada (kg/cab)': 'Opcional. Peso médio de entrada em kg por cabeça.',
  'Peso Atual (kg/cab)': 'Opcional. Se vazio, usa o Peso Entrada.',
  Sexo: 'Opcional. macho ou fêmea.',
  'Idade (meses)': 'Opcional. Número inteiro.',
}

export async function gerarWorkbookModeloLotes({ pastos, currais, racas }: OpcoesModeloLotes) {
  const wb = new ExcelJS.Workbook()

  // ---- Aba de preenchimento ----
  const ws = wb.addWorksheet('Importação')
  ws.addRow([...COLUNAS_MODELO])

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  headerRow.height = 28

  const larguras = [22, 20, 24, 24, 14, 16, 16, 14, 20, 18, 10, 16, 14]
  COLUNAS_MODELO.forEach((_, i) => {
    ws.getColumn(i + 1).width = larguras[i]
    const nota = NOTAS_CABECALHO[COLUNAS_MODELO[i]]
    if (nota) ws.getCell(`${String.fromCharCode(65 + i)}1`).note = nota
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // ---- Aba oculta com as listas ----
  const listas = wb.addWorksheet('Listas')
  const definicoes: { titulo: string; valores: readonly string[]; nome: string }[] = [
    { titulo: 'Pastos', valores: pastos, nome: 'ListaPastos' },
    { titulo: 'Currais', valores: currais, nome: 'ListaCurrais' },
    { titulo: 'Sistemas', valores: SISTEMAS_PRODUCAO, nome: 'ListaSistemas' },
    { titulo: 'Destinos', valores: DESTINOS, nome: 'ListaDestinos' },
    { titulo: 'Categorias', valores: CATEGORIAS, nome: 'ListaCategorias' },
    { titulo: 'Sexos', valores: SEXOS, nome: 'ListaSexos' },
    { titulo: 'Raças', valores: racas, nome: 'ListaRacas' },
  ]

  definicoes.forEach((def, colIdx) => {
    const col = colIdx + 1
    const letra = String.fromCharCode(64 + col)
    listas.getCell(`${letra}1`).value = def.titulo
    listas.getCell(`${letra}1`).font = { bold: true }
    listas.getColumn(col).width = 22
    def.valores.forEach((v, i) => {
      listas.getCell(`${letra}${i + 2}`).value = v
    })
    // Lista vazia aponta para uma célula em branco para não gerar range inválido
    const ultimaLinha = Math.max(def.valores.length + 1, 2)
    wb.definedNames.add(`Listas!$${letra}$2:$${letra}$${ultimaLinha}`, def.nome)
  })

  listas.state = 'hidden'

  // ---- Dropdowns na aba de preenchimento ----
  // dataValidations.add existe no runtime do exceljs mas não no typing (o d.ts
  // só expõe a validação por célula). Cast mínimo para usar a API de range.
  const wsValidacoes = ws as unknown as {
    dataValidations: { add: (address: string, validation: ExcelJS.DataValidation) => void }
  }
  const vinculos: { coluna: string; lista: string }[] = [
    { coluna: 'B', lista: 'ListaSistemas' },
    { coluna: 'C', lista: 'ListaPastos' },
    { coluna: 'D', lista: 'ListaCurrais' },
    { coluna: 'E', lista: 'ListaDestinos' },
    { coluna: 'F', lista: 'ListaCategorias' },
    { coluna: 'K', lista: 'ListaSexos' },
    { coluna: 'L', lista: 'ListaRacas' },
  ]
  for (const { coluna, lista } of vinculos) {
    wsValidacoes.dataValidations.add(`${coluna}2:${coluna}${ULTIMA_LINHA_VALIDACAO}`, {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Valor inválido',
      error: 'Selecione um valor da lista.',
      formulae: [lista],
    })
  }

  // Data Pesagem (coluna H): validação de data transforma a célula em campo
  // de data — no Excel 365/Web o duplo clique abre o seletor de calendário e
  // texto inválido é rejeitado na entrada, evitando data errada na planilha.
  wsValidacoes.dataValidations.add(`H2:H${ULTIMA_LINHA_VALIDACAO}`, {
    type: 'date',
    operator: 'between',
    allowBlank: true,
    showInputMessage: true,
    promptTitle: 'Data de pesagem',
    prompt: 'Informe uma data (dd/mm/aaaa). No Excel 365/Web, clique duas vezes na célula para abrir o calendário.',
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Data inválida',
    error: 'Este campo aceita somente datas. Use o formato dd/mm/aaaa.',
    formulae: ['2000-01-01', '2100-12-31'],
  })

  // Formato de data na coluna H (Data Pesagem)
  for (let r = 2; r <= ULTIMA_LINHA_VALIDACAO; r++) {
    ws.getCell(`H${r}`).numFmt = 'DD/MM/YYYY'
  }

  return wb
}

export async function baixarModeloImportacaoLotes(opcoes: OpcoesModeloLotes) {
  const wb = await gerarWorkbookModeloLotes(opcoes)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Modelo Importação Lotes - GestaUp.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
