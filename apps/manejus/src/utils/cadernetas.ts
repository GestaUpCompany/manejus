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
