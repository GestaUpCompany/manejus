// Renderers anuais da fase 2 (Maternidade e Manejo de Pastagens). Mesma estrutura das seções da fase 1
// (secoes.js): veredito, tendência, pontos de atenção, régua mês a mês e rankings do ano.

import { comparador, concentracao, lacuna, mesForaDoPadrao, serieAnterior, variacaoForte } from './analise.js'
import { MESES, atencao, colunas, fmt, fmtInt, kpisAnuais, plural, ranking, reguaAnual, renderSecaoAnual, rodape, serie, tendencias } from './comum.js'

const nomeMes = (m) => (m ? MESES[Number(m) - 1] : '—')
const pct = (parte, todo, casas = 0) => (Number(todo) > 0 ? `${fmt((Number(parte) / Number(todo)) * 100, casas)}%` : '—')
const pctFrac = (v, casas = 0) => (v == null ? '—' : `${fmt(Number(v) * 100, casas)}%`)
const mesesComValor = (vals) => vals.filter((v) => Number(v) > 0).length
const L = (casas = 0, sufixo = '') => (v) => `${casas ? fmt(v, casas) : fmtInt(v)}${sufixo}`

function pico(mensal, campo) {
  return (mensal || []).reduce((a, m) => (Number(m?.[campo]) > Number(a?.[campo] ?? 0) ? m : a), null)
}

const cobertura = (vals, ult) => `${mesesComValor(vals)} de ${plural(ult, 'mês', 'meses')} com registro`

// ─────────────────────────── Maternidade ───────────────────────────
export function resumoMaternidade(d) {
  const k = d.kpis || {}
  const partos = serie(d.mensal, 'partos', d.ultimo_mes)
  return {
    titulo: 'Maternidade',
    valor: fmtInt(k.partos),
    rotulo: 'partos no ano',
    linhas: [`${fmtInt(k.crias)} crias · ${pctFrac(k.taxa_perda)} perdidas`, `Peso ao nascer: ${k.peso_medio_kg != null ? `${fmt(k.peso_medio_kg, 1)} kg` : '—'}`],
    serie: partos,
    anteriores: serieAnterior(d, 'partos'),
    delta: comparador('maternidade', d).delta('partos'),
    tom: 'verde',
    // Parto é sazonal: mês sem parto não é falta de lançamento.
    calendario: { rotulo: 'Maternidade · partos', valores: partos, formato: L(0), eventual: true },
  }
}

export async function renderMaternidadeAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const partos = serie(d.mensal, 'partos', ult)
  const mortas = serie(d.mensal, 'crias_mortas', ult)
  const mPico = pico(d.mensal, 'partos')
  const cmp = comparador('maternidade', d)

  const regua = reguaAnual(
    'Mês a mês',
    'Parto é sazonal: mês vazio não indica falta de lançamento',
    [
      { rotulo: 'Partos', valores: partos, ano: fmtInt(k.partos), formato: L(0) },
      { rotulo: 'Crias nascidas', valores: serie(d.mensal, 'crias', ult), ano: fmtInt(k.crias), formato: L(0) },
      { rotulo: 'Crias perdidas', valores: mortas, ano: fmtInt(k.crias_mortas), formato: L(0), tom: 'vermelho' },
      { rotulo: 'Partos com intercorrência', valores: serie(d.mensal, 'intercorrencias', ult), ano: fmtInt(k.partos_intercorrencia), formato: L(0), tom: 'dourado' },
      { rotulo: 'Peso médio ao nascer (kg)', valores: serie(d.mensal, 'peso_medio_kg', ult), ano: k.peso_medio_kg != null ? fmt(k.peso_medio_kg, 1) : '—', formato: L(1), tom: 'azul', semCor: true },
    ],
    ult,
  )

  const dist = (lista) => (lista || []).map((x) => ({ rotulo: x.label, valor: x.valor, extra: pct(x.valor, k.crias) }))
  const sexo = dist(d.por_sexo)
  const frases = [
    variacaoForte(cmp, 'crias_mortas'),
    variacaoForte(cmp, 'partos'),
    Number(k.taxa_perda) >= 0.1 ? `Perda de crias de ${pctFrac(k.taxa_perda)} no ano (${fmtInt(k.crias_mortas)} de ${fmtInt(k.crias)}), entre abortos e natimortos.` : null,
    mesForaDoPadrao(partos, { nome: 'partos' }),
  ]

  const notas = [
    'Cria perdida = aborto ou natimorto. Parto = ninhada: gêmeos contam como um parto e duas crias. Intercorrência = cesárea, parto auxiliado, aborto ou natimorto.',
    d.truncado ? 'O ano passou de 5.000 registros e os mais antigos ficaram de fora: os totais estão subestimados.' : null,
    Number(k.crias_vivas) > 0 && Number(k.pesadas) < Number(k.crias_vivas) ? `O peso médio considera só as ${fmtInt(k.pesadas)} crias vivas com peso registrado (de ${fmtInt(k.crias_vivas)}).` : null,
  ]

  return renderSecaoAnual({
    titulo: 'Maternidade',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Partos no ano', valor: fmtInt(k.partos), delta: cmp.delta('partos'), contexto: `${plural(k.crias, 'cria', 'crias')} · ${plural(k.partos_gemeos, 'parto de gêmeos', 'partos de gêmeos')}${mPico ? ` · pico em ${nomeMes(mPico.mes)} (${fmtInt(mPico.partos)})` : ''}` },
          [
            { rotulo: 'Perda de crias', valor: pctFrac(k.taxa_perda, 1), delta: cmp.delta('taxa_perda'), contexto: `${fmtInt(k.crias_mortas)} de ${fmtInt(k.crias)} crias (aborto ou natimorto)`, tom: Number(k.crias_mortas) > 0 ? 'vermelho' : undefined },
            { rotulo: 'Partos com intercorrência', valor: pctFrac(k.taxa_intercorrencia, 0), delta: cmp.delta('intercorrencias'), contexto: `${fmtInt(k.partos_intercorrencia)} de ${fmtInt(k.partos)} partos · ${fmtInt(k.partos_medicados)} medicados`, tom: 'dourado' },
            { rotulo: 'Peso médio ao nascer', valor: k.peso_medio_kg != null ? `${fmt(k.peso_medio_kg, 1)} kg` : '—', contexto: `${plural(k.pesadas, 'cria pesada', 'crias pesadas')} · ${fmtInt(k.machos)} machos · ${fmtInt(k.femeas)} fêmeas`, tom: 'azul' },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Partos', total: fmtInt(k.partos), valores: partos, anteriores: serieAnterior(d, 'partos') },
            { titulo: 'Crias perdidas', total: fmtInt(k.crias_mortas), valores: mortas, anteriores: serieAnterior(d, 'crias_mortas'), tom: 'vermelho' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      { html: atencao(frases), ...vis },
      { html: regua, ...vis },
      {
        html: colunas(
          [
            ranking('Tipo de parto', 'Crias · % do total', dist(d.por_tipo_parto), { tom: 'dourado' }),
            ranking('Categoria da mãe', 'Crias · % do total', dist(d.por_categoria_mae)),
            ranking('Medicamentos mais usados', 'Aplicações no ano', (d.medicamentos || []).map((m) => ({ rotulo: m.label, valor: m.valor })), { tom: 'azul' }),
          ],
          '1fr 1fr 1fr',
        ),
        ...vis,
      },
      { html: colunas([ranking('Sexo das crias', 'Crias · % do total', sexo, { tom: 'azul' }), ranking('Raça', 'Crias · % do total', dist(d.por_raca))]), ...vis },
      { html: rodape(notas), ...vis },
    ],
  })
}

// ─────────────────────────── Manejo de Pastagens ───────────────────────────
export function resumoPastagens(d) {
  const k = d.kpis || {}
  const movs = serie(d.mensal, 'movimentacoes', d.ultimo_mes)
  return {
    titulo: 'Manejo de pastagens',
    valor: fmtInt(k.movimentacoes),
    rotulo: 'movimentações no ano',
    linhas: [`Lotação média: ${k.ua_ha_medio != null ? `${fmt(k.ua_ha_medio, 2)} UA/ha` : '—'}`, `${fmtInt(k.dias_pasto)} dias-pasto`],
    serie: movs,
    anteriores: serieAnterior(d, 'movimentacoes'),
    delta: comparador('pastagens', d).delta('movimentacoes'),
    tom: 'verde',
    calendario: { rotulo: 'Pastagens · movimentações', valores: movs, formato: L(0) },
  }
}

export async function renderPastagensAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const movs = serie(d.mensal, 'movimentacoes', ult)
  const dias = serie(d.mensal, 'dias_pasto', ult)
  const ua = serie(d.mensal, 'ua_ha', ult)
  const mPico = pico(d.mensal, 'movimentacoes')
  const cmp = comparador('pastagens', d)
  const porPasto = (d.por_pasto || []).map((p) => ({ rotulo: p.label, valor: p.dias, texto: `${fmtInt(p.dias)} d`, extra: `${fmtInt(p.ocupacoes)} ocup.` }))
  const porLote = (d.por_lote || []).map((p) => ({ rotulo: p.label, valor: p.dias, texto: `${fmtInt(p.dias)} d`, extra: plural(p.pastos, 'pasto', 'pastos') }))

  const regua = reguaAnual(
    'Mês a mês',
    'Dias-pasto: dias corridos de cada ocupação dentro do mês',
    [
      { rotulo: 'Movimentações', valores: movs, ano: fmtInt(k.movimentacoes), formato: L(0) },
      { rotulo: 'Cabeças movimentadas', valores: serie(d.mensal, 'cabecas', ult), ano: fmtInt(k.cabecas_movimentadas), formato: L(0) },
      { rotulo: 'Dias-pasto', valores: dias, ano: fmtInt(k.dias_pasto), formato: L(0), tom: 'azul' },
      { rotulo: 'Lotação (UA/ha)', valores: ua, ano: k.ua_ha_medio != null ? fmt(k.ua_ha_medio, 2) : '—', formato: L(2), tom: 'dourado' },
      { rotulo: 'Lotes em pasto', valores: serie(d.mensal, 'lotes', ult), ano: fmtInt(k.lotes), formato: L(0), semCor: true },
      { rotulo: 'Pastos ocupados', valores: serie(d.mensal, 'pastos', ult), ano: `${fmtInt(k.pastos_ocupados)} de ${fmtInt(k.pastos_cadastrados)}`, formato: L(0), semCor: true },
    ],
    ult,
  )

  const notas = [
    'Dias-pasto: cada ocupação (lote em um pasto) é distribuída pelos meses em que esteve no pasto, em dias corridos. Uma ocupação iniciada no ano anterior conta só a partir de janeiro; uma ainda aberta conta até hoje. A lotação do ano é a média da taxa de cada ocupação ponderada por esses dias.',
    Number(k.ocupacoes_concluidas) > 0 ? 'O desvio compara o tempo real da ocupação com a meta de ocupação cadastrada no pasto: negativo = saiu antes da meta, positivo = passou da meta. Só entram ocupações encerradas.' : null,
  ]

  return renderSecaoAnual({
    titulo: 'Manejo de Pastagens',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Movimentações de pasto', valor: fmtInt(k.movimentacoes), delta: cmp.delta('movimentacoes'), contexto: `${plural(k.cabecas_movimentadas, 'cabeça movimentada', 'cabeças movimentadas')}${mPico ? ` · pico em ${nomeMes(mPico.mes)} (${fmtInt(mPico.movimentacoes)})` : ''} · ${cobertura(movs, ult)}` },
          [
            { rotulo: 'Taxa de lotação', valor: k.ua_ha_medio != null ? `${fmt(k.ua_ha_medio, 2)} UA/ha` : '—', delta: cmp.delta('ua_ha'), contexto: 'Média ponderada pelos dias de ocupação', tom: 'azul' },
            { rotulo: 'Ocupação do ano', valor: `${fmtInt(k.dias_pasto)} dias-pasto`, delta: cmp.delta('dias_pasto'), contexto: `${fmtInt(k.pastos_ocupados)} de ${plural(k.pastos_cadastrados, 'pasto', 'pastos')} · ${plural(k.lotes, 'lote', 'lotes')}` },
            Number(k.ocupacoes_concluidas) > 0
              ? { rotulo: 'Ocupações acima da meta', valor: `${fmtInt(k.ocupacoes_acima_meta)} de ${fmtInt(k.ocupacoes_concluidas)}`, contexto: k.desvio_medio_percent != null ? `Ocupação encerrada em média ${fmt(Math.abs(k.desvio_medio_percent), 0)}% ${Number(k.desvio_medio_percent) > 0 ? 'acima' : 'abaixo'} da meta de dias` : 'Sem meta de ocupação cadastrada', tom: Number(k.ocupacoes_acima_meta) > 0 ? 'dourado' : undefined }
              : { rotulo: 'Área dos pastos', valor: `${fmt(k.area_total_ha, 0)} ha`, contexto: `${plural(k.pastos_cadastrados, 'pasto cadastrado', 'pastos cadastrados')}`, tom: 'azul' },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Movimentações', total: fmtInt(k.movimentacoes), valores: movs, anteriores: serieAnterior(d, 'movimentacoes') },
            { titulo: 'Dias-pasto', total: fmtInt(k.dias_pasto), valores: dias, anteriores: serieAnterior(d, 'dias_pasto'), tom: 'azul' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'movimentacoes'),
          variacaoForte(cmp, 'ua_ha'),
          concentracao(porPasto, k.dias_pasto, { oque: 'dos dias-pasto do ano' }),
          lacuna(movs, ult, { oque: 'troca de pasto lançada' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      {
        html: colunas([
          ranking('Pastos mais ocupados', 'Dias-pasto no ano · ocupações', porPasto, { tom: 'azul' }),
          ranking('Lotes com mais dias em pasto', 'Dias-pasto no ano · pastos usados', porLote),
        ]),
        ...vis,
      },
      { html: rodape(notas), ...vis },
    ],
  })
}
