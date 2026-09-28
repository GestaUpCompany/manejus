export type CadernetaImage =
  | 'maternidade'
  | 'movimentacao'
  | 'pastagens'
  | 'bebedouros'
  | 'rodeio'
  | 'suplementacao'
  | 'enfermaria'
  | 'morte'
  | 'clima'
  | 'abastecimento'
  | 'cantina'
  | 'limpeza'
  | 'operacoes-maquinas'
  | 'almoxarifado'
  | 'manutencao-maquinas'
  | 'problemas'

export const CADERNETA_IMAGES: Record<CadernetaImage, string> = {
  maternidade: '/images/cadernetas/maternidade.png',
  movimentacao: '/images/cadernetas/movimentacao.png',
  pastagens: '/images/cadernetas/pastagens.png',
  bebedouros: '/images/cadernetas/bebedouros.png',
  rodeio: '/images/cadernetas/rodeio.png',
  suplementacao: '/images/cadernetas/suplementacao.png',
  enfermaria: '/images/cadernetas/enfermaria.png',
  morte: '/images/cadernetas/morte.png',
  clima: '/images/cadernetas/clima.png',
  abastecimento: '/images/cadernetas/abastecimento.png',
  cantina: '/images/cadernetas/cantina.png',
  limpeza: '/images/cadernetas/limpeza.png',
  'operacoes-maquinas': '/images/cadernetas/operacoes-maquinas.png',
  almoxarifado: '/images/almoxarifado.png',
  'manutencao-maquinas': '/images/manutencao-maquinas.png',
  problemas: '/images/problemas.png',
}

export const CADERNETA_TITLES: Record<CadernetaImage, string> = {
  maternidade: 'Maternidade',
  movimentacao: 'Movimentação',
  pastagens: 'Pastagens',
  bebedouros: 'Bebedouros',
  rodeio: 'Rodeio',
  suplementacao: 'Suplementação',
  enfermaria: 'Enfermaria',
  morte: 'Morte',
  clima: 'Clima',
  abastecimento: 'Abastecimento',
  cantina: 'Alimentação',
  limpeza: 'Limpeza',
  'operacoes-maquinas': 'Operações de Máquinas',
  almoxarifado: 'Almoxarifado',
  'manutencao-maquinas': 'Manutenção de Máquinas',
  problemas: 'Problemas',
}

export const CADERNETA_DESCRIPTIONS: Record<CadernetaImage, string> = {
  maternidade: 'Registros de nascimentos e partos',
  movimentacao: 'Registros de movimentação de animais',
  pastagens: 'Registros de manejo de pastagens',
  bebedouros: 'Registros de leitura de bebedouros',
  rodeio: 'Registros de manejos e rodeios',
  suplementacao: 'Registros de suplementação alimentar',
  enfermaria: 'Registros de tratamentos e enfermidades',
  morte: 'Registros de óbitos e mortes',
  clima: 'Registros de clima e temperatura',
  abastecimento: 'Registros de abastecimento de veículos',
  cantina: 'Registros de alimentação (cantina e marmita)',
  limpeza: 'Registros de limpeza e manutenção',
  'operacoes-maquinas': 'Registros de operações de máquinas',
  almoxarifado: 'Registros de almoxarifado',
  'manutencao-maquinas': 'Registros de manutenção de máquinas',
  problemas: 'Registros de problemas',
}

export const LOGO_GESTAUP = '/images/logo/logo-gestaup.png'
