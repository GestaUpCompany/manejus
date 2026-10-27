// ESPELHO de Caderneta-Digital-Gesta-Up/frontend/src/utils/cantinaMarmitas.ts (PWA). Mantenha os dois iguais.
// Marmitas da cantina separadas por quem come: internas (funcionários da fazenda) e
// terceirizadas (trabalhadores de empresas terceirizadas), com quantidade por refeição.
// O formulário guarda strings (Stepper); o registro guarda números em `marmitasDetalhe`
// (coluna `marmitas_detalhe`). `quantidade_marmitas` continua sendo o total geral.

export const REFEICOES_MARMITA = [
  { campo: 'cafe_manha', label: 'Café da manhã', icone: '☕' },
  { campo: 'lanche', label: 'Lanche', icone: '🥪' },
  { campo: 'almoco', label: 'Almoço', icone: '🍛' },
  { campo: 'jantar', label: 'Jantar', icone: '🍲' },
] as const

export type CampoRefeicaoMarmita = (typeof REFEICOES_MARMITA)[number]['campo']

export type QuantidadesTexto = Record<CampoRefeicaoMarmita, string>
export type QuantidadesNumero = Record<CampoRefeicaoMarmita, number>

export interface EmpresaTerceirizadaForm extends QuantidadesTexto {
  /** Chave local da linha (só para o React), não vai para o registro */
  id: string
  empresa: string
}

export interface GradeMarmitasForm {
  interna: QuantidadesTexto
  terceirizadas: EmpresaTerceirizadaForm[]
}

export interface EmpresaTerceirizadaDetalhe extends QuantidadesNumero {
  empresa: string
}

export interface MarmitasDetalhe {
  interna: QuantidadesNumero
  terceirizadas: EmpresaTerceirizadaDetalhe[]
}

export interface TotaisMarmitas {
  internas: number
  terceirizadas: number
  geral: number
  porRefeicao: QuantidadesNumero
}

const CAMPOS = REFEICOES_MARMITA.map((r) => r.campo)

const quantidadesTextoVazias = (): QuantidadesTexto => ({ cafe_manha: '', lanche: '', almoco: '', jantar: '' })
const quantidadesNumeroVazias = (): QuantidadesNumero => ({ cafe_manha: 0, lanche: 0, almoco: 0, jantar: 0 })

/** Inteiro >= 0 a partir do texto do Stepper; qualquer outra coisa vira 0 */
export function inteiroDe(valor: unknown): number {
  const n = Math.floor(Number(String(valor ?? '').replace(',', '.')))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function gradeVazia(): GradeMarmitasForm {
  return { interna: quantidadesTextoVazias(), terceirizadas: [] }
}

export function empresaVazia(): EmpresaTerceirizadaForm {
  return { id: crypto.randomUUID(), empresa: '', ...quantidadesTextoVazias() }
}

/** Remove espaços sobrando: "  Construtora   Silva " -> "Construtora Silva" */
export function normalizarEmpresa(nome: unknown): string {
  return String(nome ?? '').replace(/\s+/g, ' ').trim()
}

/** Chave de agrupamento: ignora maiúsculas, acentos e espaços sobrando */
export function chaveEmpresa(nome: unknown): string {
  return normalizarEmpresa(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const somaCampos = (q: Partial<Record<CampoRefeicaoMarmita, unknown>>): number =>
  CAMPOS.reduce((s, c) => s + inteiroDe(q[c]), 0)

/** Grade do formulário -> detalhe numérico. Junta empresas repetidas e descarta linhas sem quantidade. */
export function paraDetalhe(grade: GradeMarmitasForm): MarmitasDetalhe {
  const interna = quantidadesNumeroVazias()
  for (const c of CAMPOS) interna[c] = inteiroDe(grade.interna[c])

  const porChave = new Map<string, EmpresaTerceirizadaDetalhe>()
  for (const linha of grade.terceirizadas) {
    if (somaCampos(linha) === 0) continue
    const empresa = normalizarEmpresa(linha.empresa)
    const chave = chaveEmpresa(empresa)
    const atual = porChave.get(chave) ?? { empresa, ...quantidadesNumeroVazias() }
    for (const c of CAMPOS) atual[c] += inteiroDe(linha[c])
    porChave.set(chave, atual)
  }
  return { interna, terceirizadas: [...porChave.values()] }
}

export function totaisDetalhe(detalhe: MarmitasDetalhe): TotaisMarmitas {
  const porRefeicao = quantidadesNumeroVazias()
  for (const c of CAMPOS) {
    porRefeicao[c] = inteiroDe(detalhe.interna[c]) + detalhe.terceirizadas.reduce((s, t) => s + inteiroDe(t[c]), 0)
  }
  const internas = somaCampos(detalhe.interna)
  const terceirizadas = detalhe.terceirizadas.reduce((s, t) => s + somaCampos(t), 0)
  return { internas, terceirizadas, geral: internas + terceirizadas, porRefeicao }
}

/** Detalhe salvo -> grade editável (campos vazios no lugar de zero) */
export function detalheParaGrade(detalhe: MarmitasDetalhe): GradeMarmitasForm {
  const texto = (q: Partial<Record<CampoRefeicaoMarmita, unknown>>): QuantidadesTexto => ({
    cafe_manha: inteiroDe(q.cafe_manha) > 0 ? String(inteiroDe(q.cafe_manha)) : '',
    lanche: inteiroDe(q.lanche) > 0 ? String(inteiroDe(q.lanche)) : '',
    almoco: inteiroDe(q.almoco) > 0 ? String(inteiroDe(q.almoco)) : '',
    jantar: inteiroDe(q.jantar) > 0 ? String(inteiroDe(q.jantar)) : '',
  })
  return {
    interna: texto(detalhe.interna ?? {}),
    terceirizadas: (detalhe.terceirizadas ?? []).map((t) => ({ id: crypto.randomUUID(), empresa: t.empresa, ...texto(t) })),
  }
}

/** "30 int. + 17 terc." para listas; vazio quando não há divisão */
export function divisaoMarmitas(detalhe: MarmitasDetalhe | null | undefined): string {
  if (!detalhe?.interna) return ''
  const t = totaisDetalhe({ interna: detalhe.interna, terceirizadas: detalhe.terceirizadas ?? [] })
  return `${t.internas} int. + ${t.terceirizadas} terc.`
}

/** "Almoço 30 · Jantar 20" (só refeições com quantidade); "—" quando não há nenhuma */
export function resumoRefeicoes(q: Partial<Record<CampoRefeicaoMarmita, unknown>>): string {
  const partes = REFEICOES_MARMITA.filter((r) => inteiroDe(q[r.campo]) > 0).map((r) => `${r.label} ${inteiroDe(q[r.campo])}`)
  return partes.length > 0 ? partes.join(' · ') : '—'
}

/** Texto do campo legado `destinatario`: empresas terceirizadas, ou "Funcionários" se só há internas */
export function destinatarioDoDetalhe(detalhe: MarmitasDetalhe): string {
  const empresas = detalhe.terceirizadas.map((t) => t.empresa).filter(Boolean)
  return empresas.length > 0 ? empresas.join(', ') : 'Funcionários'
}

/** Pendência do formulário (texto curto) ou undefined quando a grade está completa */
export function pendenciaGrade(grade: GradeMarmitasForm): string | undefined {
  if (totaisDetalhe(paraDetalhe(grade)).geral === 0) return 'Informe a quantidade de marmitas de pelo menos uma refeição'
  const semEmpresa = grade.terceirizadas.some((t) => somaCampos(t) > 0 && !normalizarEmpresa(t.empresa))
  if (semEmpresa) return 'Informe a empresa terceirizada'
  return undefined
}

/** Valida o detalhe já salvo (usado no validateCantina). Retorna a mensagem de erro ou null. */
export function erroDoDetalhe(detalhe: unknown): string | null {
  if (!detalhe || typeof detalhe !== 'object') return 'Informe as marmitas por refeição'
  const d = detalhe as Partial<MarmitasDetalhe>
  const quantidadeValida = (q: unknown) =>
    !!q && typeof q === 'object' && CAMPOS.every((c) => Number.isInteger((q as Record<string, unknown>)[c]) && (q as Record<string, number>)[c] >= 0)
  if (!quantidadeValida(d.interna) || !Array.isArray(d.terceirizadas) || !d.terceirizadas.every(quantidadeValida)) {
    return 'Quantidades de marmitas inválidas'
  }
  if (d.terceirizadas.some((t) => !normalizarEmpresa(t.empresa))) return 'Informe a empresa terceirizada'
  if (totaisDetalhe(d as MarmitasDetalhe).geral <= 0) return 'Informe a quantidade de marmitas de pelo menos uma refeição'
  return null
}

/** Nomes distintos de empresa (primeira grafia vista) a partir de detalhes salvos */
export function empresasDosDetalhes(detalhes: unknown[]): string[] {
  const vistos = new Map<string, string>()
  for (const d of detalhes) {
    const lista = (d as Partial<MarmitasDetalhe> | null)?.terceirizadas
    if (!Array.isArray(lista)) continue
    for (const t of lista) {
      const nome = normalizarEmpresa(t?.empresa)
      if (nome && !vistos.has(chaveEmpresa(nome))) vistos.set(chaveEmpresa(nome), nome)
    }
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
