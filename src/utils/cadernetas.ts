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
  { id: 'entrada-almoxarifado', label: 'Almoxarifado' },
  { id: 'entrada-cantina', label: 'Cantina' },
  { id: 'entrada-insumos', label: 'Entrada de Insumos' },
  { id: 'saida-insumos', label: 'Produção Fábrica' },
  { id: 'leitura-cocho', label: 'Leitura de Cocho' },
  { id: 'trato-confinamento', label: 'Trato Confinamento' },
  { id: 'pesagem', label: 'Pesagem' },
  { id: 'comunicado-venda', label: 'Comunicado de Venda' },
]
