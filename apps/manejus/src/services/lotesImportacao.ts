import { supabase } from '@gestaup/supabase'
import { usaCurral } from '../utils/lotes'

// ============================================================================
// Importação de lotes + categorias via planilha-modelo (aba única, 1 linha por
// categoria). Espelha o que o formulário de Lotes.tsx grava: insert em `lotes`
// (o trigger trg_lotes_pasto_historico abre o histórico quando pasto_id vem
// preenchido), `alocar_lote_curral` para lotes de curral e insert em
// `lote_categorias` com quant_atual = quant_inicial (mesma regra do form).
// ============================================================================

export const SISTEMAS_PRODUCAO = ['Cria', 'Confinamento', 'Engorda', 'Recria', 'RIP', 'Sequestro', 'TIP'] as const
export const DESTINOS = ['corte', 'reprodução', 'enfermaria'] as const
export const CATEGORIAS = [
  'bezerro ao pé',
  'bezerra ao pé',
  'bezerro',
  'bezerra',
  'garrote',
  'novilha',
  'boi magro',
  'boi gordo',
  'tourinho',
  'touro',
  'vaca',
  'tropa',
] as const
export const SEXOS = ['macho', 'fêmea'] as const

export const COLUNAS_MODELO = [
  'Lote',
  'Sistema de Produção',
  'Pasto',
  'Curral',
  'Destino',
  'Categoria',
  'Quantidade (cab)',
  'Data Pesagem',
  'Peso Entrada (kg/cab)',
  'Peso Atual (kg/cab)',
  'Sexo',
  'Raça',
  'Idade (meses)',
] as const

const COLUNAS_OBRIGATORIAS = ['lote', 'sistema de producao', 'pasto', 'curral', 'categoria', 'quantidade cab']

export function norm(v: unknown): string {
  return (v ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function normHeader(v: unknown): string {
  return norm(v).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildMap(opcoes: readonly string[], aliases: Record<string, string> = {}): Map<string, string> {
  const map = new Map<string, string>()
  for (const o of opcoes) map.set(norm(o), o)
  for (const [alias, canonico] of Object.entries(aliases)) map.set(norm(alias), canonico)
  return map
}

const SISTEMA_MAP = buildMap(SISTEMAS_PRODUCAO)
const DESTINO_MAP = buildMap(DESTINOS, { abate: 'corte', reproducao: 'reprodução' })
const CATEGORIA_MAP = buildMap(CATEGORIAS)
const SEXO_MAP = buildMap(SEXOS, { femea: 'fêmea', m: 'macho', f: 'fêmea' })

export interface LinhaBruta {
  linha: number
  valores: Record<string, unknown>
}

export interface ParsePlanilhaResult {
  linhas: LinhaBruta[]
  erro?: string
}

// Localiza a linha de cabeçalho (contém "Lote" e "Categoria") e mapeia as
// colunas pelo nome normalizado, tolerando pontuação e caixa diferentes.
export function parseLinhasPlanilha(jsonData: unknown[][]): ParsePlanilhaResult {
  if (!jsonData || jsonData.length < 2) {
    return { linhas: [], erro: 'Arquivo vazio ou sem dados' }
  }

  let headerRowIdx = -1
  const colIndices: Record<string, number> = {}

  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i]
    if (!Array.isArray(row)) continue
    const headers = row.map((h) => normHeader(h))
    if (headers.includes('lote') && headers.includes('categoria')) {
      headerRowIdx = i
      headers.forEach((h, idx) => {
        if (h && colIndices[h] === undefined) colIndices[h] = idx
      })
      break
    }
  }

  if (headerRowIdx < 0) {
    return {
      linhas: [],
      erro: 'Cabeçalho não encontrado. Baixe a planilha-modelo e não altere os nomes das colunas.',
    }
  }

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => colIndices[c] === undefined)
  if (faltando.length > 0) {
    return { linhas: [], erro: `Colunas obrigatórias faltando: ${faltando.join(', ')}` }
  }

  const linhas: LinhaBruta[] = []
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i]
    if (!Array.isArray(row)) continue

    const valores: Record<string, unknown> = {}
    for (const [campo, idx] of Object.entries(colIndices)) {
      valores[campo] = row[idx]
    }

    const vazia = ['lote', 'categoria', 'quantidade cab', 'pasto', 'curral'].every(
      (c) => norm(valores[c]) === ''
    )
    if (vazia) continue

    linhas.push({ linha: i + 1, valores })
  }

  return { linhas }
}

function str(v: unknown): string {
  return (v ?? '').toString().trim()
}

function parseNumero(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = str(v)
  // Com vírgula assume formato BR ("1.234,56"); sem vírgula o ponto é decimal
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

export function parseData(v: unknown): string | null | number {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial do Excel (dias desde 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? NaN : d.toISOString().slice(0, 10)
  }
  const s = str(v)
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (br) {
    const ano = br[3].length === 2 ? (parseInt(br[3]) > 50 ? `19${br[3]}` : `20${br[3]}`) : br[3]
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return NaN
}

export interface CategoriaImportada {
  linha: number
  categoria: string
  quantInicial: number
  dataPesagem: string | null
  pesoEntradaKgCab: number | null
  pesoVivoAtualKgCab: number | null
  sexo: string | null
  raca: string | null
  idade: number | null
}

export interface LoteImportado {
  nome: string
  sistema: string
  destino: string | null
  pastoId: string | null
  curralId: string | null
  categorias: CategoriaImportada[]
}

export interface ErroLinha {
  linha: number
  lote: string
  erros: string[]
}

export interface ContextoImportacao {
  lotesNomesExistentes: Set<string>
  pastos: Map<string, { id: string; nome: string }>
  currais: Map<string, { id: string; nome: string }>
}

export interface ResultadoValidacao {
  lotes: LoteImportado[]
  errosLinhas: ErroLinha[]
  duplicadosBanco: { nome: string; linhas: number[] }[]
}

export function validarLinhas(linhas: LinhaBruta[], ctx: ContextoImportacao): ResultadoValidacao {
  const errosLinhas: ErroLinha[] = []
  const grupos = new Map<string, { nome: string; linhas: LinhaBruta[] }>()

  for (const l of linhas) {
    const nome = str(l.valores['lote'])
    if (!nome) {
      errosLinhas.push({ linha: l.linha, lote: '(sem nome)', erros: ['Lote é obrigatório'] })
      continue
    }
    const key = norm(nome)
    if (!grupos.has(key)) grupos.set(key, { nome, linhas: [] })
    grupos.get(key)!.linhas.push(l)
  }

  const lotes: LoteImportado[] = []
  const duplicadosBanco: ResultadoValidacao['duplicadosBanco'] = []

  for (const [key, grupo] of grupos) {
    if (ctx.lotesNomesExistentes.has(key)) {
      duplicadosBanco.push({ nome: grupo.nome, linhas: grupo.linhas.map((l) => l.linha) })
      continue
    }

    // Atributos de nível de lote: vem da primeira linha do grupo; linhas
    // seguintes podem deixar vazio (herdam) mas não podem divergir.
    const ref = grupo.linhas[0].valores
    const sistemaCanon = SISTEMA_MAP.get(norm(ref['sistema de producao']))
    const errosGrupo: ErroLinha[] = []

    if (!sistemaCanon) {
      errosGrupo.push({
        linha: grupo.linhas[0].linha,
        lote: grupo.nome,
        erros: [`Sistema de Produção inválido ou vazio (use: ${SISTEMAS_PRODUCAO.join(', ')})`],
      })
    }

    const destinoCanon = norm(ref['destino']) ? DESTINO_MAP.get(norm(ref['destino'])) ?? undefined : null
    if (norm(ref['destino']) && destinoCanon === undefined) {
      errosGrupo.push({
        linha: grupo.linhas[0].linha,
        lote: grupo.nome,
        erros: ['Destino inválido (use: corte, reprodução ou enfermaria)'],
      })
    }

    const isConfinamento = sistemaCanon ? usaCurral(sistemaCanon) : false
    let pastoId: string | null = null
    let curralId: string | null = null

    if (sistemaCanon) {
      if (isConfinamento) {
        const curralNome = str(ref['curral'])
        if (!curralNome) {
          errosGrupo.push({
            linha: grupo.linhas[0].linha,
            lote: grupo.nome,
            erros: [`Lote de ${sistemaCanon} exige a coluna Curral preenchida`],
          })
        } else {
          const found = ctx.currais.get(norm(curralNome))
          if (!found) {
            errosGrupo.push({
              linha: grupo.linhas[0].linha,
              lote: grupo.nome,
              erros: [`Curral "${curralNome}" não encontrado no cadastro da fazenda`],
            })
          } else {
            curralId = found.id
          }
        }
      } else {
        const pastoNome = str(ref['pasto'])
        if (!pastoNome) {
          errosGrupo.push({
            linha: grupo.linhas[0].linha,
            lote: grupo.nome,
            erros: [`Lote de pasto exige a coluna Pasto preenchida`],
          })
        } else {
          const found = ctx.pastos.get(norm(pastoNome))
          if (!found) {
            errosGrupo.push({
              linha: grupo.linhas[0].linha,
              lote: grupo.nome,
              erros: [`Pasto "${pastoNome}" não encontrado no cadastro da fazenda`],
            })
          } else {
            pastoId = found.id
          }
        }
      }
    }

    // Divergência de atributos de lote entre linhas do mesmo grupo
    const divergentes = grupo.linhas.slice(1).filter((l) => {
      const s = norm(l.valores['sistema de producao'])
      const d = norm(l.valores['destino'])
      const local = norm(l.valores[isConfinamento ? 'curral' : 'pasto'])
      const refS = norm(ref['sistema de producao'])
      const refD = norm(ref['destino'])
      const refL = norm(ref[isConfinamento ? 'curral' : 'pasto'])
      return (s && s !== refS) || (d && d !== refD) || (local && local !== refL)
    })
    for (const l of divergentes) {
      errosGrupo.push({
        linha: l.linha,
        lote: grupo.nome,
        erros: [`Diverge dos dados do lote definidos na linha ${grupo.linhas[0].linha} (sistema, destino ou ${isConfinamento ? 'curral' : 'pasto'} diferentes)`],
      })
    }

    // Validação por categoria
    const categorias: CategoriaImportada[] = []
    const categoriasVistas = new Set<string>()

    for (const l of grupo.linhas) {
      if (errosGrupo.some((e) => e.linha === l.linha)) continue

      const erros: string[] = []
      const v = l.valores

      const catCanon = CATEGORIA_MAP.get(norm(v['categoria']))
      if (!norm(v['categoria'])) {
        erros.push('Categoria é obrigatória')
      } else if (!catCanon) {
        erros.push(`Categoria "${str(v['categoria'])}" inválida`)
      } else if (categoriasVistas.has(norm(catCanon))) {
        erros.push(`Categoria "${catCanon}" duplicada no mesmo lote`)
      }

      const quant = parseNumero(v['quantidade cab'])
      if (quant === null || isNaN(quant) || !Number.isInteger(quant) || quant <= 0) {
        erros.push('Quantidade (cab) deve ser um inteiro maior que zero')
      }

      const dataPesagem = parseData(v['data pesagem'])
      if (typeof dataPesagem === 'number' && isNaN(dataPesagem)) {
        erros.push('Data Pesagem inválida (use dd/mm/aaaa)')
      }

      const pesoEntrada = parseNumero(v['peso entrada kg cab'])
      if (pesoEntrada !== null && (isNaN(pesoEntrada) || pesoEntrada <= 0)) {
        erros.push('Peso Entrada (kg/cab) deve ser número positivo')
      }
      const pesoAtual = parseNumero(v['peso atual kg cab'])
      if (pesoAtual !== null && (isNaN(pesoAtual) || pesoAtual <= 0)) {
        erros.push('Peso Atual (kg/cab) deve ser número positivo')
      }

      const idade = parseNumero(v['idade meses'])
      if (idade !== null && (isNaN(idade) || !Number.isInteger(idade) || idade < 0)) {
        erros.push('Idade (meses) deve ser inteiro não negativo')
      }

      let sexoCanon: string | null = null
      if (norm(v['sexo'])) {
        const s = SEXO_MAP.get(norm(v['sexo']))
        if (!s) erros.push('Sexo inválido (use: macho ou fêmea)')
        else sexoCanon = s
      }

      if (erros.length > 0) {
        errosGrupo.push({ linha: l.linha, lote: grupo.nome, erros })
        continue
      }

      categoriasVistas.add(norm(catCanon!))
      categorias.push({
        linha: l.linha,
        categoria: catCanon!,
        quantInicial: quant as number,
        dataPesagem: (dataPesagem as string | null) ?? null,
        pesoEntradaKgCab: pesoEntrada as number | null,
        pesoVivoAtualKgCab: (pesoAtual as number | null) ?? (pesoEntrada as number | null),
        sexo: sexoCanon,
        raca: str(v['raca']) || null,
        idade: idade as number | null,
      })
    }

    errosLinhas.push(...errosGrupo)

    // Só importa o grupo se TODAS as linhas dele passarem — lote parcial
    // criaria categorias faltando sem o usuário perceber.
    if (errosGrupo.length === 0 && sistemaCanon && categorias.length > 0) {
      lotes.push({
        nome: grupo.nome,
        sistema: sistemaCanon,
        destino: destinoCanon ?? null,
        pastoId,
        curralId,
        categorias,
      })
    }
  }

  return { lotes, errosLinhas, duplicadosBanco }
}

export interface FalhaBanco {
  nome: string
  erro: string
}

export interface ResumoImportacao {
  lotesImportados: string[]
  duplicadosBanco: { nome: string; linhas: number[] }[]
  errosLinhas: ErroLinha[]
  falhasBanco: FalhaBanco[]
  totalLinhas: number
}

export async function importarLotesValidos(
  lotes: LoteImportado[],
  fazendaId: string
): Promise<{ importados: string[]; falhas: FalhaBanco[] }> {
  const importados: string[] = []
  const falhas: FalhaBanco[] = []

  for (const lote of lotes) {
    const nCabecas = lote.categorias.reduce((acc, c) => acc + c.quantInicial, 0)

    const { data: novoLote, error: loteError } = await supabase
      .from('lotes')
      .insert({
        fazenda_id: fazendaId,
        nome: lote.nome,
        n_cabecas: nCabecas,
        ativo: true,
        pasto_id: lote.pastoId,
        sistema_producao: lote.sistema,
        destino: lote.destino,
      })
      .select('id')
      .single()

    if (loteError || !novoLote) {
      falhas.push({ nome: lote.nome, erro: loteError?.message || 'Erro ao criar lote' })
      continue
    }

    const falharELimpar = async (erro: string) => {
      // Remove o lote recém-criado para não deixar lote órfão sem categorias
      // e liberar o nome para nova tentativa após corrigir a planilha.
      await supabase
        .from('lotes')
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq('id', novoLote.id)
      falhas.push({ nome: lote.nome, erro })
    }

    if (lote.curralId) {
      const { data: alocRes, error: alocError } = await supabase.rpc('alocar_lote_curral', {
        p_curral_id: lote.curralId,
        p_lote_id: novoLote.id,
      })
      if (alocError || !alocRes?.success) {
        await falharELimpar(`Erro ao alocar curral: ${alocRes?.error || alocError?.message}`)
        continue
      }
    }

    const categoriasPayload = lote.categorias.map((c) => ({
      lote_id: novoLote.id,
      categoria: c.categoria,
      quant_inicial: c.quantInicial,
      quant_atual: c.quantInicial,
      data_pesagem: c.dataPesagem,
      peso_entrada_kg_cab: c.pesoEntradaKgCab,
      peso_vivo_atual_kg_cab: c.pesoVivoAtualKgCab,
      sexo: c.sexo,
      raca: c.raca,
      idade: c.idade,
      ativo: true,
      morte: 0,
      consumo: 0,
      abate: 0,
      transf_entrada: 0,
      transf_saida: 0,
    }))

    const { error: catError } = await supabase.from('lote_categorias').insert(categoriasPayload)
    if (catError) {
      await falharELimpar(`Erro ao criar categorias: ${catError.message}`)
      continue
    }

    importados.push(lote.nome)
  }

  return { importados, falhas }
}

export async function carregarContextoImportacao(fazendaId: string): Promise<ContextoImportacao> {
  const [lotesRes, pastosRes, curraisRes] = await Promise.all([
    supabase.from('lotes').select('nome').eq('fazenda_id', fazendaId).is('deleted_at', null),
    supabase.from('pastos').select('id, nome').eq('fazenda_id', fazendaId).is('deleted_at', null).eq('ativo', true),
    supabase.from('currais').select('id, nome').eq('fazenda_id', fazendaId).is('deleted_at', null).eq('ativo', true),
  ])

  const lotesNomesExistentes = new Set<string>((lotesRes.data || []).map((l: any) => norm(l.nome)))
  const pastos = new Map<string, { id: string; nome: string }>(
    (pastosRes.data || []).map((p: any) => [norm(p.nome), { id: p.id, nome: p.nome }])
  )
  const currais = new Map<string, { id: string; nome: string }>(
    (curraisRes.data || []).map((c: any) => [norm(c.nome), { id: c.id, nome: c.nome }])
  )

  return { lotesNomesExistentes, pastos, currais }
}

export async function lerPlanilhaLotes(file: File): Promise<ParsePlanilhaResult> {
  const data = await file.arrayBuffer()
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })

  // Procura a aba da planilha-modelo (a que tem cabeçalho com Lote+Categoria)
  for (const sheetName of workbook.SheetNames) {
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][]
    const tentativa = parseLinhasPlanilha(jsonData)
    if (!tentativa.erro) return tentativa
  }

  const primeira = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
  }) as unknown[][]
  return parseLinhasPlanilha(primeira)
}
