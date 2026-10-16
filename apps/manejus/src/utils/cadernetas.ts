export interface CadernetaOption {
  id: string
  label: string
}

export interface CadernetaGrupoItem {
  id: string
  path: string
}

export interface CadernetaGrupo {
  nome: string
  cor: string
  itens: CadernetaGrupoItem[]
}

// Agrupamento e ordem replicados do menu de módulos do PWA
// (frontend/src/utils/constants.ts: CADERNETAS + CADERNETA_GRUPO_ORDEM)
export const CADERNETA_GRUPOS: CadernetaGrupo[] = [
  {
    nome: 'Suplementação a Pasto',
    cor: '#223ecb',
    itens: [
      { id: 'suplementacao', path: '/controller/cadernetas/suplementacao' },
      { id: 'saida-insumos', path: '/controller/cadernetas/saida-insumos' },
    ],
  },
  {
    nome: 'Confinamento & TIP',
    cor: '#8B4513',
    itens: [
      { id: 'leitura-cocho', path: '/controller/cadernetas/leitura-cocho' },
      { id: 'trato-confinamento', path: '/controller/cadernetas/trato-confinamento' },
      { id: 'fabrica-confinamento', path: '/controller/cadernetas/fabrica-confinamento' },
    ],
  },
  {
    nome: 'Gado & Pastagens',
    cor: '#6D9E3B',
    itens: [
      { id: 'rodeio', path: '/controller/cadernetas/rodeio' },
      { id: 'movimentacao', path: '/controller/cadernetas/movimentacao' },
      { id: 'pastagens', path: '/controller/cadernetas/pastagens' },
      { id: 'morte', path: '/controller/cadernetas/morte' },
      { id: 'enfermaria', path: '/controller/cadernetas/enfermaria' },
      { id: 'maternidade', path: '/controller/cadernetas/maternidade' },
      { id: 'pesagem', path: '/controller/cadernetas/pesagem' },
      { id: 'manejo-curral', path: '/controller/cadernetas/manejo-curral' },
      { id: 'sanidade', path: '/controller/manejo-sanitario' },
      { id: 'reproducao', path: '/controller/reproducao' },
      { id: 'recebimento-compra', path: '/controller/cadernetas/recebimento-compra' },
    ],
  },
  {
    nome: 'Comercial',
    cor: '#1D4ED8',
    itens: [
      { id: 'comunicado-venda', path: '/controller/cadernetas/comunicado-venda' },
      { id: 'comunicado-compra', path: '/controller/cadernetas/comunicado-compra' },
      { id: 'comunicado-transferencia', path: '/controller/cadernetas/comunicado-transferencia' },
    ],
  },
  {
    nome: 'Infraestrutura & Geral',
    cor: '#b7b712',
    itens: [
      { id: 'bebedouros', path: '/controller/cadernetas/bebedouros' },
      { id: 'limpeza', path: '/controller/cadernetas/limpeza' },
      { id: 'problemas', path: '/controller/cadernetas/problemas' },
      { id: 'clima', path: '/controller/cadernetas/clima' },
    ],
  },
  {
    nome: 'Máquinas',
    cor: '#4A6FA5',
    itens: [
      { id: 'operacoes-maquinas', path: '/controller/cadernetas/operacoes-maquinas' },
      { id: 'manutencao-maquinas', path: '/controller/cadernetas/manutencao-maquinas' },
    ],
  },
  {
    nome: 'Saída de Estoque',
    cor: '#9e1f16',
    itens: [
      { id: 'abastecimento', path: '/controller/cadernetas/abastecimento' },
      { id: 'almoxarifado', path: '/controller/cadernetas/almoxarifado' },
      { id: 'cantina', path: '/controller/cadernetas/alimentacao' },
    ],
  },
  {
    nome: 'Entrada de Estoque',
    cor: '#148c76',
    itens: [
      { id: 'entrada-insumos', path: '/controller/cadernetas/entrada-insumos' },
      { id: 'entrada-combustivel', path: '/controller/cadernetas/entrada-combustivel' },
      { id: 'entrada-almoxarifado', path: '/controller/cadernetas/entrada-almoxarifado' },
      { id: 'entrada-cantina', path: '/controller/cadernetas/entrada-cantina' },
    ],
  },
]

const CADERNETA_LABELS: Record<string, string> = {
  maternidade: 'Maternidade',
  pastagens: 'Manejo Pastagens',
  rodeio: 'Rodeio Gado',
  suplementacao: 'Suplementação',
  bebedouros: 'Bebedouros',
  movimentacao: 'Movimentação',
  enfermaria: 'Enfermaria',
  morte: 'Morte',
  clima: 'Clima',
  abastecimento: 'Abastecimento',
  cantina: 'Alimentação',
  limpeza: 'Limpeza',
  'auditoria-5s': 'Auditoria 5S',
  'operacoes-maquinas': 'Operações de Máquinas',
  'manutencao-maquinas': 'Manutenção de Máquinas',
  problemas: 'Problemas',
  almoxarifado: 'Almoxarifado',
  'entrada-combustivel': 'Entrada de Combustível',
  'entrada-almoxarifado': 'Entrada de Almoxarifado',
  'entrada-cantina': 'Entrada de Cantina',
  'entrada-insumos': 'Entrada de Insumos',
  'saida-insumos': 'Produção Fábrica',
  'leitura-cocho': 'Leitura de Cocho',
  'trato-confinamento': 'Trato Confinamento',
  'fabrica-confinamento': 'Carregamento Vagão',
  pesagem: 'Pesagem',
  'manejo-curral': 'Manejo de Curral',
  sanidade: 'Sanidade',
  reproducao: 'Reprodução',
  'comunicado-venda': 'Comunicado de Venda',
  'comunicado-compra': 'Comunicado de Compra',
  'comunicado-transferencia': 'Comunicado de Transferência',
  'recebimento-compra': 'Recepção de Animais',
}

// Lista flat na mesma sequência dos grupos (usada por RBAC e rotinas)
export const CADERNETAS: CadernetaOption[] = CADERNETA_GRUPOS.flatMap((grupo) =>
  grupo.itens.map((item) => ({
    id: item.id,
    label: CADERNETA_LABELS[item.id] || item.id,
  }))
)

// Checklists e auditorias periódicas (menu "Checklists" do Painel), separados das cadernetas de registro de campo.
export const CHECKLIST_ITENS = [
  { id: 'auditoria-5s', path: '/controller/checklists/auditoria-5s' },
] as const

/** Fazenda de testes (Gesta'Up): única que enxerga as cadernetas ainda em teste. */
export const FAZENDA_DE_TESTES_ID = 'd649c65e-16ab-4b77-a84b-df937aa41cc3'

/** Cadernetas novas, liberadas só para a fazenda de testes até serem validadas no campo (espelha o PWA). */
export const CADERNETAS_EM_TESTE: readonly string[] = ['manejo-curral', 'sanidade', 'reproducao']

/** Caderneta em teste só aparece na fazenda de testes; enquanto a fazenda não é conhecida, fica oculta. */
export function cadernetaVisivelNaFazenda(cadernetaId: string, fazendaId: string | null | undefined): boolean {
  return !CADERNETAS_EM_TESTE.includes(cadernetaId) || fazendaId === FAZENDA_DE_TESTES_ID
}

export function cadernetasDaFazenda(fazendaId: string | null | undefined): CadernetaOption[] {
  return CADERNETAS.filter((c) => cadernetaVisivelNaFazenda(c.id, fazendaId))
}

export function gruposDaFazenda(fazendaId: string | null | undefined): CadernetaGrupo[] {
  return CADERNETA_GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => cadernetaVisivelNaFazenda(i.id, fazendaId)) })).filter(
    (g) => g.itens.length > 0
  )
}
