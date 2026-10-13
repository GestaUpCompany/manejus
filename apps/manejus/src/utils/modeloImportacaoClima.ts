import ExcelJS from 'exceljs'
import {
  COLUNAS_FIXAS_CLIMA,
  COLUNA_OBSERVACAO,
  MM_MAXIMO,
  OBSERVACAO_MAX,
  SIM_NAO,
  TEMPERATURA_MAX,
  TEMPERATURA_MIN,
  TEMPO_ATUAL_LABELS,
  nomeColunaPluviometro,
  type PluviometroModelo,
} from '../services/climaImportacao'

// ============================================================================
// Planilha-modelo de importação de clima: aba "Importação" com uma linha por
// leitura (data + hora), uma coluna "<pluviômetro> (mm)" para cada pluviômetro
// ativo da fazenda e dropdowns (defined names) na aba oculta "Listas".
//
// Validações no Excel (bloqueiam a digitação inválida): data real e não
// futura, hora hh:mm de 00:00 a 23:59, responsável da lista de funcionários,
// listas de tempo/Sim-Não, números dentro de faixa e tamanho da observação.
// Quem cola valores de fora ainda passa por essas regras na importação, que
// repete todas as checagens. A aba é protegida (sem senha) só para evitar
// edição acidental do cabeçalho; as células de dados ficam livres.
// ============================================================================

const ULTIMA_LINHA_VALIDACAO = 501

const COLUNAS_OBRIGATORIAS_CLIMA: readonly string[] = ['Data', 'Hora', 'Responsável']

export interface OpcoesModeloClima {
  pluviometros: PluviometroModelo[]
  /** Nomes de funcionários ativos; vazio = responsável como texto livre. */
  responsaveis: string[]
}

const NOTAS_CABECALHO: Record<string, string> = {
  Data: 'Obrigatório. Formato dd/mm/aaaa, sem datas futuras. No Excel 365/Web o duplo clique abre o calendário.',
  Hora: 'Obrigatório. Formato hh:mm de 00:00 a 23:59 (ex.: 07:30). Junto com a data identifica a leitura: se já existir registro nessa data e hora, a linha é ignorada.',
  Responsável: 'Obrigatório. Selecione na lista de funcionários cadastrados.',
  'Tempo atual': 'Opcional. Selecione na lista.',
  Choveu: 'Opcional. Sim ou Não. Se for Não, os pluviômetros da linha devem ficar vazios ou com 0.',
  'Esvaziou pluviômetros': 'Opcional. Sim ou Não.',
  'Temperatura (°C)': `Opcional. Entre ${TEMPERATURA_MIN} e ${TEMPERATURA_MAX}, 1 casa decimal. Vale para as medições dos pluviômetros da linha.`,
  'Umidade relativa (%)': 'Opcional. Entre 0 e 100.',
  [COLUNA_OBSERVACAO]: `Opcional. Texto livre, até ${OBSERVACAO_MAX} caracteres.`,
}

function letraColuna(indice: number): string {
  // indice 1-based; suporta além de Z (AA, AB...)
  let n = indice
  let s = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    s = String.fromCharCode(65 + resto) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function colunasModeloClima(pluviometros: PluviometroModelo[]): string[] {
  return [
    ...COLUNAS_FIXAS_CLIMA,
    ...pluviometros.map((p) => nomeColunaPluviometro(p.nome)),
    COLUNA_OBSERVACAO,
  ]
}

export async function gerarWorkbookModeloClima({ pluviometros, responsaveis }: OpcoesModeloClima) {
  const wb = new ExcelJS.Workbook()
  const colunas = colunasModeloClima(pluviometros)
  const nomesResponsaveis = [...new Map(responsaveis.map((n) => [n.trim().toLowerCase(), n.trim()])).values()]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const ws = wb.addWorksheet('Importação')
  // Obrigatórias levam " *" no título e cabeçalho vermelho; opcionais ficam
  // verdes. O asterisco não atrapalha a leitura (normHeader ignora pontuação).
  ws.addRow(colunas.map((c) => (COLUNAS_OBRIGATORIAS_CLIMA.includes(c) ? `${c} *` : c)))

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.eachCell((cell, col) => {
    const obrigatoria = COLUNAS_OBRIGATORIAS_CLIMA.includes(colunas[col - 1])
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: obrigatoria ? 'FFC62828' : 'FF2E7D32' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  headerRow.height = 32

  colunas.forEach((nome, i) => {
    ws.getColumn(i + 1).width = Math.max(14, Math.min(28, nome.length + 4))
    const nota = NOTAS_CABECALHO[nome]
    if (nota) ws.getCell(`${letraColuna(i + 1)}1`).note = nota
    else if (i >= COLUNAS_FIXAS_CLIMA.length && i < colunas.length - 1) {
      ws.getCell(`${letraColuna(i + 1)}1`).note = `Opcional. Milímetros medidos neste pluviômetro (0 a ${MM_MAXIMO}, até 2 casas decimais).`
    }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // ---- Aba de instruções (sem cabeçalho de dados: a importação a ignora) ----
  const instrucoes = wb.addWorksheet('Instruções')
  instrucoes.getColumn(1).width = 4
  instrucoes.getColumn(2).width = 90
  const linhasInstrucoes: [string, string?][] = [
    ['Como preencher', 'titulo'],
    ['Uma linha por leitura (data + hora). Linhas com data e hora já cadastradas são ignoradas.'],
    ['Cabeçalho vermelho com * = campo OBRIGATÓRIO (Data, Hora e Responsável).', 'obrigatoria'],
    ['Cabeçalho verde = campo opcional (pode ficar vazio).', 'opcional'],
    ['Passe o mouse nos cabeçalhos para ver as regras de cada coluna.'],
    ['Pluviômetros: deixe vazio se não houve leitura; use 0 se mediu e não choveu.'],
  ]
  linhasInstrucoes.forEach(([texto, tipo], i) => {
    const cell = instrucoes.getCell(i + 1, 2)
    cell.value = texto
    cell.alignment = { wrapText: true, vertical: 'top' }
    if (tipo === 'titulo') cell.font = { bold: true, size: 13 }
    if (tipo === 'obrigatoria') cell.font = { bold: true, color: { argb: 'FFC62828' } }
    if (tipo === 'opcional') cell.font = { bold: true, color: { argb: 'FF2E7D32' } }
  })

  // ---- Aba oculta com as listas ----
  const listas = wb.addWorksheet('Listas')
  const definicoes: { titulo: string; valores: readonly string[]; nome: string }[] = [
    { titulo: 'Tempo atual', valores: Object.values(TEMPO_ATUAL_LABELS), nome: 'ListaTempo' },
    { titulo: 'Sim/Não', valores: SIM_NAO, nome: 'ListaSimNao' },
  ]
  if (nomesResponsaveis.length > 0) {
    definicoes.push({ titulo: 'Responsáveis', valores: nomesResponsaveis, nome: 'ListaResponsaveis' })
  }
  definicoes.forEach((def, idx) => {
    const letra = letraColuna(idx + 1)
    listas.getCell(`${letra}1`).value = def.titulo
    listas.getCell(`${letra}1`).font = { bold: true }
    listas.getColumn(idx + 1).width = 26
    def.valores.forEach((v, i) => {
      listas.getCell(`${letra}${i + 2}`).value = v
    })
    wb.definedNames.add(`Listas!$${letra}$2:$${letra}$${def.valores.length + 1}`, def.nome)
  })
  listas.state = 'hidden'

  // ---- Validações (dataValidations.add existe no runtime, não no typing) ----
  const wsValidacoes = ws as unknown as {
    dataValidations: { add: (address: string, validation: ExcelJS.DataValidation) => void }
  }
  const faixa = (coluna: string) => `${coluna}2:${coluna}${ULTIMA_LINHA_VALIDACAO}`

  const lista = (coluna: string, formula: string, mensagem = 'Selecione um valor da lista.') =>
    wsValidacoes.dataValidations.add(faixa(coluna), {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Valor inválido',
      error: mensagem,
      formulae: [formula],
    })
  if (nomesResponsaveis.length > 0) {
    lista('C', 'ListaResponsaveis', 'Selecione um funcionário da lista. Para incluir alguém, cadastre-o em Funcionários.')
  } else {
    // Sem funcionários cadastrados não há o que listar: a validação de lista
    // vazia bloquearia tudo, então a coluna fica livre (a importação aceita texto).
    ws.getCell('C1').note = 'Obrigatório. Nenhum funcionário cadastrado: digite o nome de quem fez a leitura (máx. 100 caracteres).'
  }
  lista('D', 'ListaTempo')
  lista('E', 'ListaSimNao')
  lista('F', 'ListaSimNao')

  // Data: de 01/01/2000 até amanhã (folga de fuso). Validação "custom" porque o
  // tipo "date" do ExcelJS converte o limite para número fixo e não aceita
  // TODAY(); o limite dinâmico impede data futura mesmo com o modelo reaproveitado.
  wsValidacoes.dataValidations.add(faixa('A'), {
    type: 'custom',
    allowBlank: true,
    showInputMessage: true,
    promptTitle: 'Data da leitura',
    prompt: 'Informe uma data (dd/mm/aaaa), sem datas futuras.',
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Data inválida',
    error: 'Informe uma data válida (dd/mm/aaaa), de 2000 até hoje.',
    formulae: ['AND(ISNUMBER(A2),A2>=DATE(2000,1,1),A2<=TODAY()+1)'],
  })

  // Hora: célula de hora do Excel (aceita "7:30" ou "07:30") e valor entre
  // 00:00 e 23:59 (fração de dia 0 a 0,99930...). "25:00", "7h30" ou texto
  // são rejeitados na digitação.
  wsValidacoes.dataValidations.add(faixa('B'), {
    type: 'decimal',
    operator: 'between',
    allowBlank: true,
    showInputMessage: true,
    promptTitle: 'Hora da leitura',
    prompt: 'Digite no formato hh:mm, de 00:00 a 23:59 (ex.: 07:30).',
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Hora inválida',
    error: 'Digite a hora no formato hh:mm, de 00:00 a 23:59 (ex.: 07:30).',
    formulae: [0, 1439 / 1440],
  })

  const numerica = (coluna: string, min: number, max: number, titulo: string, msg: string) =>
    wsValidacoes.dataValidations.add(faixa(coluna), {
      type: 'decimal',
      operator: 'between',
      allowBlank: true,
      showInputMessage: true,
      promptTitle: titulo,
      prompt: msg,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Valor inválido',
      error: msg,
      formulae: [min, max],
    })
  numerica('G', TEMPERATURA_MIN, TEMPERATURA_MAX, 'Temperatura (°C)', `Informe um número entre ${TEMPERATURA_MIN} e ${TEMPERATURA_MAX}.`)
  numerica('H', 0, 100, 'Umidade relativa (%)', 'Informe um número entre 0 e 100.')
  pluviometros.forEach((p, i) => {
    numerica(
      letraColuna(COLUNAS_FIXAS_CLIMA.length + 1 + i),
      0,
      MM_MAXIMO,
      nomeColunaPluviometro(p.nome),
      `Informe os milímetros: número de 0 a ${MM_MAXIMO} (use 0 se não choveu; deixe vazio se não houve leitura).`
    )
  })

  const colObs = letraColuna(colunas.length)
  wsValidacoes.dataValidations.add(faixa(colObs), {
    type: 'textLength',
    operator: 'lessThanOrEqual',
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Texto muito longo',
    error: `A observação aceita até ${OBSERVACAO_MAX} caracteres.`,
    formulae: [OBSERVACAO_MAX],
  })

  // ---- Formatos e proteção do cabeçalho ----
  for (let r = 2; r <= ULTIMA_LINHA_VALIDACAO; r++) {
    ws.getCell(`A${r}`).numFmt = 'DD/MM/YYYY'
    ws.getCell(`B${r}`).numFmt = 'hh:mm'
    ws.getCell(`G${r}`).numFmt = '0.0'
    ws.getCell(`H${r}`).numFmt = '0'
    pluviometros.forEach((_, i) => {
      ws.getCell(`${letraColuna(COLUNAS_FIXAS_CLIMA.length + 1 + i)}${r}`).numFmt = '0.0#'
    })
    for (let c = 1; c <= colunas.length; c++) {
      ws.getCell(r, c).protection = { locked: false }
    }
  }

  // Sem senha: protege só o cabeçalho (renomear coluna faria a importação
  // ignorar os dados dela). Linhas e colunas continuam editáveis.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  })

  return wb
}

export async function baixarModeloImportacaoClima(opcoes: OpcoesModeloClima) {
  const wb = await gerarWorkbookModeloClima(opcoes)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Modelo Importação Clima - GestaUp.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
