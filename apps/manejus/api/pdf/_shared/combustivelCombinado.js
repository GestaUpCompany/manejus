// Definição ÚNICA do relatório de combustível combinado (estoque + abastecimento), resumo sem lançamentos.
// É usada pelo PDF individual (_relatorios/combustivel.js) e pelo Infográfico Mensal (reportRegistry.js e
// geral.js), para que uma mudança aqui apareça nos dois. Para mudar o que o combinado mostra, altere ESTE
// arquivo; não repita estas regras nos chamadores.
//
//  - Sem tabelas de lançamentos: nada de detalhamento por máquina, operadores e placas, nem extrato de movimentações.
//  - A tabela de tanques vem só da parte de estoque; o abastecimento não leva tanques (evita a tabela duas vezes).
//  - O estoque vem primeiro e o abastecimento depois; a numeração "Página X de Y" é contínua.

export const OPCOES_ABASTECIMENTO_COMBINADO = { incluirDetalhes: false }
export const OPCOES_ESTOQUE_COMBINADO = { incluirExtrato: false }

// Dados do abastecimento como o combinado os usa: sem tanques (o estoque já mostra o saldo deles).
export function prepararAbastecimentoCombinado(dados) {
  return { ...dados, tanques: [] }
}

// Dados do estoque como o combinado os usa: sem extrato (as movimentações não são renderizadas).
export function prepararEstoqueCombinado(dados) {
  return { ...dados, movimentacoes: [] }
}

// No Infográfico, coloca a seção de estoque de combustível antes da de abastecimento (mesma ordem do PDF individual).
// Só troca de lugar quando as duas existem e estão invertidas; as demais seções não mudam de posição.
export function ordenarSecoesCombustivel(reports) {
  const iEstoque = reports.findIndex((report) => report?.tipo === 'estoque_combustivel')
  const iAbast = reports.findIndex((report) => report?.tipo === 'abastecimento')
  if (iEstoque < 0 || iAbast < 0 || iEstoque < iAbast) return reports
  const resultado = [...reports]
  ;[resultado[iEstoque], resultado[iAbast]] = [resultado[iAbast], resultado[iEstoque]]
  return resultado
}
