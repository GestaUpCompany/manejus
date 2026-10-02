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
  | 'pesagem'
  | 'leitura-cocho'
  | 'trato-confinamento'
  | 'fabrica-confinamento'
  | 'entrada-insumos'
  | 'saida-insumos'
  | 'entrada-combustivel'
  | 'entrada-almoxarifado'
  | 'entrada-cantina'
  | 'comunicado-venda'
  | 'comunicado-compra'
  | 'comunicado-transferencia'
  | 'recebimento-compra'

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
  pesagem: '/images/cadernetas/pesagem.png',
  'leitura-cocho': '/images/cadernetas/leitura-cocho.png',
  'trato-confinamento': '/images/cadernetas/trato-confinamento.png',
  'fabrica-confinamento': '/images/cadernetas/fabrica-confinamento.png',
  'entrada-insumos': '/images/cadernetas/entrada.png',
  'saida-insumos': '/images/cadernetas/producao.png',
  'entrada-combustivel': '/images/cadernetas/entradacombustivel.png',
  'entrada-almoxarifado': '/images/almoxarifado.png',
  'entrada-cantina': '/images/cadernetas/cantina.png',
  'comunicado-venda': '/images/cadernetas/comunicado.png',
  'comunicado-compra': '/images/cadernetas/comunicado.png',
  'comunicado-transferencia': '/images/cadernetas/movimentacao.png',
  'recebimento-compra': '/images/cadernetas/recepcao.jpg',
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
  pesagem: 'Pesagem',
  'leitura-cocho': 'Leitura de Cocho',
  'trato-confinamento': 'Trato Confinamento',
  'fabrica-confinamento': 'Carregamento Vagão',
  'entrada-insumos': 'Entrada de Insumos',
  'saida-insumos': 'Produção Fábrica',
  'entrada-combustivel': 'Entrada de Combustível',
  'entrada-almoxarifado': 'Entrada Almoxarifado',
  'entrada-cantina': 'Entrada Cantina',
  'comunicado-venda': 'Comunicado de Venda',
  'comunicado-compra': 'Comunicado de Compra',
  'comunicado-transferencia': 'Comunicado de Transferência',
  'recebimento-compra': 'Recebimento de Compra',
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
  pesagem: 'Registros de pesagem de animais',
  'leitura-cocho': 'Registros de leitura de cocho',
  'trato-confinamento': 'Registros de oferta de trato',
  'fabrica-confinamento': 'Registros de carregamento do vagão',
  'entrada-insumos': 'Registros de entrada de insumos',
  'saida-insumos': 'Registros de produção na fábrica',
  'entrada-combustivel': 'Registros de entrada de combustível',
  'entrada-almoxarifado': 'Registros de entrada no almoxarifado',
  'entrada-cantina': 'Registros de entrada na cantina',
  'comunicado-venda': 'Comunicados de venda de animais',
  'comunicado-compra': 'Comunicados de compra de animais',
  'comunicado-transferencia': 'Comunicados de transferência entre fazendas',
  'recebimento-compra': 'Recepção de animais comprados',
}

export const LOGO_GESTAUP = '/images/logo/logo-gestaup.png'
