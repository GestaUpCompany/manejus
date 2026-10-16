/**
 * Lê a lista colada ou carregada (CSV/TXT) na identificação de lote e devolve os objetos esperados pela RPC
 * identificar_animais_lote. Aceita separador `;`, `,` ou tabulação.
 *
 * - Com cabeçalho na 1ª linha (brinco, chip, manejo, provisorio, sexo, raca, peso, nascimento, sisbov, pnib,
 *   dispositivo, data_identificacao), as colunas seguem o cabeçalho.
 * - Sem cabeçalho, as colunas são: brinco, chip, peso. Uma linha com um só valor é um brinco.
 */
export interface AnimalLista {
  id_brinco?: string
  id_chip?: string
  id_manejo?: string
  id_provisorio_cria?: string
  sexo?: string
  raca?: string
  peso_atual_kg?: string
  data_nascimento?: string
  codigo_sisbov?: string
  codigo_pnib?: string
  dispositivo_tipo?: string
  data_identificacao?: string
}

const ALIAS: Record<string, keyof AnimalLista> = {
  brinco: 'id_brinco',
  id_brinco: 'id_brinco',
  chip: 'id_chip',
  id_chip: 'id_chip',
  manejo: 'id_manejo',
  id_manejo: 'id_manejo',
  provisorio: 'id_provisorio_cria',
  id_provisorio: 'id_provisorio_cria',
  id_provisorio_cria: 'id_provisorio_cria',
  sexo: 'sexo',
  raca: 'raca',
  raça: 'raca',
  peso: 'peso_atual_kg',
  peso_kg: 'peso_atual_kg',
  peso_atual_kg: 'peso_atual_kg',
  nascimento: 'data_nascimento',
  data_nascimento: 'data_nascimento',
  sisbov: 'codigo_sisbov',
  codigo_sisbov: 'codigo_sisbov',
  pnib: 'codigo_pnib',
  codigo_pnib: 'codigo_pnib',
  dispositivo: 'dispositivo_tipo',
  dispositivo_tipo: 'dispositivo_tipo',
  data_identificacao: 'data_identificacao',
}

const SEM_CABECALHO: (keyof AnimalLista)[] = ['id_brinco', 'id_chip', 'peso_atual_kg']

function dividir(linha: string): string[] {
  const sep = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : ','
  return linha.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
}

const normalizar = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')

export function parseListaAnimais(texto: string): AnimalLista[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (linhas.length === 0) return []

  const primeira = dividir(linhas[0]).map(normalizar)
  const temCabecalho = primeira.some((c) => c in ALIAS)
  const colunas: (keyof AnimalLista | undefined)[] = temCabecalho ? primeira.map((c) => ALIAS[c]) : SEM_CABECALHO
  const corpo = temCabecalho ? linhas.slice(1) : linhas

  return corpo.map((linha) => {
    const valores = dividir(linha)
    const animal: AnimalLista = {}
    colunas.forEach((campo, i) => {
      const valor = valores[i]
      if (campo && valor) animal[campo] = valor
    })
    return animal
  })
}
