export interface CadernetaOption {
  id: string
  label: string
}

export const CADERNETAS: CadernetaOption[] = [
  { id: 'maternidade', label: 'Maternidade' },
  { id: 'pastagens', label: 'Manejo Pastagens' },
  { id: 'rodeio', label: 'Rodeio Gado' },
  { id: 'suplementacao', label: 'Suplementação' },
  { id: 'bebedouros', label: 'Bebedouros' },
  { id: 'movimentacao', label: 'Movimentação' },
  { id: 'enfermaria', label: 'Enfermaria' },
  { id: 'morte', label: 'Morte' },
  { id: 'clima', label: 'Clima' },
  { id: 'abastecimento', label: 'Abastecimento' },
  { id: 'cantina', label: 'Alimentação' },
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'operacoes-maquinas', label: 'Operações de Máquinas' },
  { id: 'manutencao-maquinas', label: 'Manutenção de Máquinas' },
  { id: 'problemas', label: 'Problemas' },
  { id: 'almoxarifado', label: 'Almoxarifado' },
  { id: 'entrada-combustivel', label: 'Entrada de Combustível' },
  { id: 'entrada-almoxarifado', label: 'Entrada de Almoxarifado' },
  { id: 'entrada-cantina', label: 'Entrada de Cantina' },
  { id: 'entrada-insumos', label: 'Entrada de Insumos' },
  { id: 'saida-insumos', label: 'Produção Fábrica' },
  { id: 'leitura-cocho', label: 'Leitura de Cocho' },
  { id: 'trato-confinamento', label: 'Trato Confinamento' },
  { id: 'fabrica-confinamento', label: 'Carregamento Vagão' },
  { id: 'pesagem', label: 'Pesagem' },
  { id: 'comunicado-venda', label: 'Comunicado de Venda' },
  { id: 'comunicado-compra', label: 'Comunicado de Compra' },
  { id: 'comunicado-transferencia', label: 'Comunicado de Transferência' },
  { id: 'recebimento-compra', label: 'Recepção de Animais' },
]
