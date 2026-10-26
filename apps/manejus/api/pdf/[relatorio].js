// Função única de PDF. O Vercel (plano Hobby) aceita no máximo 12 Serverless
// Functions por deploy; cada arquivo em api/pdf/ virava uma função. Os
// relatórios ficam em _relatorios/ (prefixo _ fora da contagem) e este arquivo
// despacha pela URL: POST /api/pdf/<relatorio>, igual ao endpoint de antes.
// boletimRebanho não entra: é só renderizador usado pelo front e pelos testes.

import abastecimento from './_relatorios/abastecimento.js'
import bebedouros from './_relatorios/bebedouros.js'
import cantina from './_relatorios/cantina.js'
import clima from './_relatorios/clima.js'
import combustivel from './_relatorios/combustivel.js'
import consumo from './_relatorios/consumo.js'
import estoque from './_relatorios/estoque.js'
import estoqueCombustivel from './_relatorios/estoqueCombustivel.js'
import geral from './_relatorios/geral.js'
import morte from './_relatorios/morte.js'
import pastagens from './_relatorios/pastagens.js'
import rodeio from './_relatorios/rodeio.js'
import zootecnico from './_relatorios/zootecnico.js'

const RELATORIOS = {
  abastecimento,
  bebedouros,
  cantina,
  clima,
  combustivel,
  consumo,
  estoque,
  estoqueCombustivel,
  geral,
  morte,
  pastagens,
  rodeio,
  zootecnico,
}

export default async function handler(req, res) {
  const nome = req.query?.relatorio
  if (!Object.hasOwn(RELATORIOS, nome)) {
    res.status(404).json({ error: 'Relatório não encontrado' })
    return
  }
  return RELATORIOS[nome](req, res)
}
