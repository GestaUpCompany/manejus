// Renderers das seções do Infográfico Anual. Cada um recebe o JSON da RPC
// get_infografico_anual_<secao> + __marca ({ fazendaNome, logoGestao, logoFazenda }).
//
// Estrutura fixa de cada seção (visão macro, sem registro diário):
//   1. Veredito: KPIs com destaque, contexto e variação contra o mesmo período do ano anterior.
//   2. Tendência: mini-gráficos de 12 meses com o ano anterior em cinza por trás.
//   3. Exceções: "Pontos de atenção" gerados por regra (analise.js).
//   4. Consulta: régua métricas × meses, rankings do ano e notas de método.

import { comparador, concentracao, lacuna, mesForaDoPadrao, serieAnterior, variacaoForte } from './analise.js'
import {
  CORES,
  atencao,
  MESES,
  TONS,
  colunas,
  escapeHtml,
  fmt,
  fmtInt,
  fmtMoeda,
  grafico,
  kpisAnuais,
  mesesLabels,
  miniBarras,
  plural,
  ranking,
  reguaAnual,
  renderSecaoAnual,
  rodape,
  serie,
  tabela,
  tendencias,
} from './comum.js'

import { resumoBebedouros, resumoMaternidade, resumoPastagens } from './secoes2.js'
import { resumoAlmoxarifado, resumoCantina, resumoEstoqueInsumos, resumoFarmacia } from './secoes3.js'

const nomeMes = (m) => (m ? MESES[Number(m) - 1] : '—')
const soma = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0)
const pct = (parte, todo, casas = 0) => (Number(todo) > 0 ? `${fmt((Number(parte) / Number(todo)) * 100, casas)}%` : '—')
const mesesComValor = (vals) => vals.filter((v) => Number(v) > 0).length

function pico(mensal, campo) {
  return (mensal || []).reduce((a, m) => (Number(m?.[campo]) > Number(a?.[campo] ?? 0) ? m : a), null)
}

function cobertura(vals, ult) {
  return `${mesesComValor(vals)} de ${plural(ult, 'mês', 'meses')} com registro`
}

const L = (casas = 0, sufixo = '') => (v) => `${casas ? fmt(v, casas) : fmtInt(v)}${sufixo}`

// ─────────────────────────── Combustível ───────────────────────────
export function resumoCombustivel(d) {
  const k = d.kpis || {}
  const litros = serie(d.mensal, 'litros', d.ultimo_mes)
  return {
    titulo: 'Combustível',
    valor: `${fmtInt(k.litros)} L`,
    rotulo: 'abastecidos no ano',
    linhas: [`${fmtInt(k.abastecimentos)} abastecimentos`, `Entradas: ${fmtInt(k.entradas_l)} L`],
    serie: litros,
    anteriores: serieAnterior(d, 'litros'),
    delta: comparador('combustivel', d).delta('litros'),
    tom: 'verde',
    calendario: { rotulo: 'Combustível · abastecimentos', valores: serie(d.mensal, 'abastecimentos', d.ultimo_mes), formato: L(0) },
  }
}

export async function renderCombustivelAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const litros = serie(d.mensal, 'litros', ult)
  const mPico = pico(d.mensal, 'litros')
  const combustiveis = d.combustiveis || []
  const vis = { sec: 'Visão do ano' }
  const det = { sec: 'Tanques' }
  const porComb = (c) => serie(d.mensal, (m) => m?.por_combustivel?.[c] ?? 0, ult)
  const cmp = comparador('combustivel', d)
  const abast = serie(d.mensal, 'abastecimentos', ult)

  const regua = reguaAnual(
    'Mês a mês',
    'Cor relativa a cada linha · hachurado: meses ainda não decorridos',
    [
      { rotulo: 'Litros abastecidos', valores: litros, ano: `${fmtInt(k.litros)} L`, formato: L(0) },
      ...combustiveis.map((c) => ({ rotulo: c, sub: true, valores: porComb(c), ano: fmtInt(soma(porComb(c))), formato: L(0) })),
      { rotulo: 'Abastecimentos', valores: serie(d.mensal, 'abastecimentos', ult), ano: fmtInt(k.abastecimentos), formato: L(0), tom: 'azul' },
      { rotulo: 'Entradas nos tanques (L)', valores: serie(d.mensal, 'entradas_l', ult), ano: fmtInt(k.entradas_l), formato: L(0), tom: 'dourado' },
      { rotulo: 'Saídas dos tanques (L)', valores: serie(d.mensal, 'baixas_l', ult), ano: fmtInt(soma(serie(d.mensal, 'baixas_l', ult))), formato: L(0), tom: 'dourado' },
    ],
    ult,
  )

  const maquinas = (d.por_maquina || []).map((m) => ({ rotulo: m.label, valor: m.litros, texto: `${fmtInt(m.litros)} L`, extra: pct(m.litros, k.litros) }))
  const demais = d.maquinas_demais || {}
  if (Number(demais.qtd) > 0) maquinas.push({ rotulo: `Demais ${fmtInt(demais.qtd)} máquinas`, valor: demais.litros, texto: `${fmtInt(demais.litros)} L`, extra: pct(demais.litros, k.litros) })
  const operacoes = (d.por_operacao || []).map((o) => ({ rotulo: o.label, valor: o.valor, texto: `${fmtInt(o.valor)} L`, extra: pct(o.valor, k.litros) }))
  const tanques = (d.tanques || []).map((t) => [
    escapeHtml(t.nome),
    escapeHtml(t.combustivel),
    fmtInt(t.saldo_inicial_l),
    fmtInt(t.entradas_l),
    fmtInt(t.baixas_l),
    fmtInt(t.ajustes_l),
    `<strong>${fmtInt(t.saldo_final_l)}</strong>`,
  ])

  return renderSecaoAnual({
    titulo: 'Combustível',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Litros abastecidos', valor: `${fmtInt(k.litros)} L`, delta: cmp.delta('litros'), contexto: `${plural(k.abastecimentos, 'abastecimento', 'abastecimentos')} · ${plural(k.maquinas, 'máquina', 'máquinas')} · ${cobertura(litros, ult)}` },
          [
            { rotulo: 'Mês de maior consumo', valor: mPico ? nomeMes(mPico.mes) : '—', contexto: mPico ? `${fmtInt(mPico.litros)} L · ${pct(mPico.litros, k.litros)} do ano` : 'Sem abastecimento', tom: 'azul' },
            { rotulo: 'Comprado para os tanques', valor: `${fmtInt(k.entradas_l)} L`, delta: cmp.delta('entradas'), contexto: fmtMoeda(k.entradas_valor), tom: 'dourado' },
            { rotulo: 'Saldo dos tanques no fim', valor: `${fmtInt(k.saldo_final_l)} L`, contexto: `Início do ano: ${fmtInt(k.saldo_inicial_l)} L` },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Litros abastecidos', total: `${fmtInt(k.litros)} L`, valores: litros, anteriores: serieAnterior(d, 'litros') },
            { titulo: 'Abastecimentos', total: fmtInt(k.abastecimentos), valores: abast, anteriores: serieAnterior(d, 'abastecimentos'), tom: 'azul' },
            { titulo: 'Compras para os tanques', total: `${fmtInt(k.entradas_l)} L`, valores: serie(d.mensal, 'entradas_l', ult), anteriores: serieAnterior(d, 'entradas_l'), tom: 'dourado' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'litros'),
          mesForaDoPadrao(litros, { nome: 'litros abastecidos', formato: (v) => `${fmtInt(v)} L` }),
          concentracao(maquinas, k.litros, { oque: 'dos litros abastecidos no ano' }),
          lacuna(abast, ult, { oque: 'abastecimento lançado' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      { html: colunas([ranking('Consumo por máquina', 'Litros · % do ano', maquinas), ranking('Consumo por operação', 'Litros · % do ano', operacoes, { tom: 'azul' })]), ...vis },
      {
        html: tabela('Tanques no ano', 'Litros', [{ label: 'Tanque', width: '24%' }, { label: 'Combustível', width: '18%' }, { label: 'Início', numeric: true }, { label: 'Entradas', numeric: true }, { label: 'Saídas', numeric: true }, { label: 'Ajustes', numeric: true }, { label: 'Fim', numeric: true }], tanques),
        tipo: 'tabela',
        ...det,
      },
    ],
  })
}

// ─────────────────────────── Consumo ───────────────────────────
export function resumoConsumo(d) {
  const k = d.kpis || {}
  return {
    titulo: 'Consumo',
    valor: fmtMoeda(k.custo_total),
    rotulo: 'de custo alimentar no ano',
    linhas: [`${fmt(k.ms_kg_cab_dia, 2)} kg MS/cab/dia · ${fmt(k.pct_pv, 2)}% PV`, `${fmt(Number(k.ms_total_kg) / 1000, 1)} t de MS fornecidas`],
    serie: serie(d.mensal, 'custo_total', d.ultimo_mes),
    anteriores: serieAnterior(d, 'custo_total'),
    delta: comparador('consumo', d).delta('custo'),
    tom: 'dourado',
    calendario: { rotulo: 'Consumo · registros de trato', valores: serie(d.mensal, 'registros', d.ultimo_mes), formato: L(0) },
  }
}

export async function renderConsumoAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const det = { sec: 'Lotes' }
  const temConf = (d.mensal || []).some((m) => Number(m.confinamento?.lote_dias) > 0)
  const temPasto = (d.mensal || []).some((m) => Number(m.pasto?.lote_dias) > 0)
  const dias = serie(d.mensal, 'lote_dias', ult)
  const cmp = comparador('consumo', d)
  const custoMes = serie(d.mensal, 'custo_total', ult)
  // Índice do ano de cada manejo: média dos meses ponderada pelas cabeça-dias de cada mês.
  const anoManejo = (manejo, campo) => {
    let soma = 0
    let peso = 0
    for (const m of d.mensal || []) {
      const x = m?.[manejo]
      if (x?.[campo] != null && Number(x.cab_dias) > 0) {
        soma += Number(x[campo]) * Number(x.cab_dias)
        peso += Number(x.cab_dias)
      }
    }
    return peso > 0 ? soma / peso : null
  }
  const porManejo = (rotulo, campo, formato, tom) => {
    const linhas = []
    for (const [manejo, tem] of [['confinamento', temConf], ['pasto', temPasto]]) {
      if (!tem) continue
      const ano = anoManejo(manejo, campo)
      linhas.push({ rotulo: `${rotulo} · ${manejo}`, valores: serie(d.mensal, (m) => m?.[manejo]?.[campo], ult), formato, tom, ano: ano == null ? '—' : formato(ano) })
    }
    return linhas
  }

  const regua = reguaAnual(
    'Mês a mês',
    'Índices ponderados por cabeças × dias · coluna Ano: ano inteiro',
    [
      { rotulo: 'Custo alimentar (R$)', valores: serie(d.mensal, 'custo_total', ult), ano: fmtMoeda(k.custo_total).replace('R$ ', ''), formato: L(0), tom: 'dourado' },
      { rotulo: 'MS fornecida (t)', valores: serie(d.mensal, (m) => (Number(m?.ms_total_kg) || 0) / 1000, ult), ano: fmt(Number(k.ms_total_kg) / 1000, 1), formato: L(1) },
      { rotulo: 'Cabeça-dias tratadas', valores: serie(d.mensal, 'cab_dias', ult), ano: fmtInt(k.cab_dias), formato: L(0), tom: 'azul' },
      ...porManejo('kg MS/cab/dia', 'ms', L(2), 'verde'),
      ...porManejo('% do PV', 'pv', L(2), 'verde'),
      ...porManejo('R$/cab/dia', 'custo', L(2), 'dourado'),
    ],
    ult,
  )

  const lotes = (d.por_lote || []).map((l) => [
    escapeHtml(l.lote),
    l.manejo === 'confinamento' ? 'Confinamento' : 'Pasto',
    fmtInt(l.dias),
    fmtInt(l.cabecas_medias),
    `<strong>${fmt(l.ms, 2)}</strong>`,
    `${fmt(l.pv, 2)}%`,
    l.custo != null ? fmtMoeda(l.custo) : '—',
    `<strong>${fmtMoeda(l.custo_total)}</strong>`,
  ])
  if (Number(d.lotes_demais) > 0) lotes.push([`<em>Demais ${fmtInt(d.lotes_demais)} lotes</em>`, '', '', '', '', '', '', ''])
  const msLotes = (d.por_lote || []).map((l) => ({ rotulo: l.lote, valor: l.ms, texto: fmt(l.ms, 2), extra: `${fmt(l.pv, 2)}% PV` }))
  const custoLotes = (d.por_lote || []).filter((l) => Number(l.custo_total) > 0).map((l) => ({ rotulo: l.lote, valor: l.custo_total, texto: fmtMoeda(l.custo_total), extra: pct(l.custo_total, k.custo_total) }))

  return renderSecaoAnual({
    titulo: 'Consumo',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Custo alimentar do ano', valor: fmtMoeda(k.custo_total), delta: cmp.delta('custo'), contexto: `${fmtMoeda(k.custo_cab_dia)} por cabeça/dia · ${fmtInt(k.cab_dias)} cabeça-dias` },
          [
            { rotulo: 'Consumo de matéria seca', valor: `${fmt(k.ms_kg_cab_dia, 2)} kg`, delta: cmp.delta('ms_cab'), contexto: `por cab./dia · ${fmt(Number(k.ms_total_kg) / 1000, 1)} t fornecidas no ano` },
            { rotulo: 'Consumo em % do PV', valor: `${fmt(k.pct_pv, 2)}%`, contexto: `Matéria natural: ${fmt(k.mn_kg_cab_dia, 2)} kg/cab/dia` },
            { rotulo: 'Rebanho tratado', valor: `${fmtInt(k.cabecas_medias)} cab.`, delta: cmp.delta('cab_dias'), contexto: `média por dia · ${plural(k.lotes, 'lote', 'lotes')} · ${cobertura(dias, ult)}`, tom: 'azul' },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Custo alimentar (R$)', total: fmtMoeda(k.custo_total), valores: custoMes, anteriores: serieAnterior(d, 'custo_total'), tom: 'dourado' },
            { titulo: 'MS fornecida (t)', total: `${fmt(Number(k.ms_total_kg) / 1000, 1)} t`, valores: serie(d.mensal, (m) => (Number(m?.ms_total_kg) || 0) / 1000, ult), anteriores: serieAnterior(d, (m) => (Number(m?.ms_total_kg) || 0) / 1000) },
            { titulo: 'Cabeça-dias tratadas', total: fmtInt(k.cab_dias), valores: serie(d.mensal, 'cab_dias', ult), anteriores: serieAnterior(d, 'cab_dias'), tom: 'azul' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'custo_cab'),
          variacaoForte(cmp, 'custo'),
          mesForaDoPadrao(custoMes, { nome: 'custo alimentar', formato: fmtMoeda }),
          concentracao(custoLotes, k.custo_total, { oque: 'do custo alimentar do ano' }),
          lacuna(serie(d.mensal, 'registros', ult), ult, { oque: 'registro de trato' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      { html: colunas([ranking('Consumo de MS por lote', 'kg MS/cab/dia · % do PV', msLotes), ranking('Custo alimentar por lote', 'R$ no ano · % do total', custoLotes, { tom: 'dourado' })]), ...vis },
      {
        html: tabela('Lotes no ano', 'Ponderado por cabeças × dias · top 15 por custo', [{ label: 'Lote', width: '24%' }, { label: 'Manejo' }, { label: 'Dias', numeric: true }, { label: 'Cab. médias', numeric: true }, { label: 'kg MS/cab/dia', numeric: true }, { label: '% PV', numeric: true }, { label: 'R$/cab/dia', numeric: true }, { label: 'Custo no ano', numeric: true }], lotes),
        tipo: 'tabela',
        ...det,
      },
      {
        html: rodape([
          'Índices e totais ponderados por cabeças × dias: no confinamento, as cabeças de cada dia; no pasto, as do registro de suplementação, multiplicadas pelos dias do intervalo até o registro seguinte. O intervalo de pasto entra no mês do registro que o fecha.',
          Number(k.pontos_cabecas_estimadas) > 0 ? `${plural(k.pontos_cabecas_estimadas, 'registro sem nº de cabeças usou', 'registros sem nº de cabeças usaram')} o rebanho do lote na data.` : '',
          Number(k.pontos_sem_cabecas) > 0 ? `${plural(k.pontos_sem_cabecas, 'registro ficou', 'registros ficaram')} fora da ponderação por falta do nº de cabeças.` : '',
        ]),
        ...det,
      },
    ],
  })
}

// ─────────────────────────── Clima ───────────────────────────
export function resumoClima(d) {
  const k = d.kpis || {}
  const chuva = serie(d.mensal, 'mm_fazenda', d.ultimo_mes)
  return {
    titulo: 'Clima',
    valor: `${fmt(k.mm_total, 0)} mm`,
    rotulo: 'de chuva no ano',
    linhas: [`${plural(k.dias_com_chuva, 'dia', 'dias')} com chuva`, `Mais chuvoso: ${nomeMes(k.mes_mais_chuvoso)}`],
    serie: chuva,
    anteriores: serieAnterior(d, 'mm_fazenda'),
    delta: comparador('clima', d).delta('mm'),
    tom: 'azul',
    calendario: { rotulo: 'Clima · leituras', valores: serie(d.mensal, 'leituras', d.ultimo_mes), formato: L(0), tom: 'azul' },
  }
}

export async function renderClimaAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const chuva = serie(d.mensal, 'mm_fazenda', ult)
  let acc = 0
  const acumulado = chuva.map((v) => Number((acc += Number(v) || 0).toFixed(1)))
  const temTemp = (d.mensal || []).some((m) => m.temp_media != null)
  const temUmid = (d.mensal || []).some((m) => m.umidade_media != null)
  const mesChuvoso = (d.mensal || []).find((m) => Number(m.mes) === Number(k.mes_mais_chuvoso))
  const cmp = comparador('clima', d)

  const g = grafico({
    id: 'anual-clima-chuva',
    titulo: 'Chuva por mês e acumulado do ano',
    subtitulo: 'Média dos pluviômetros (mm)',
    labels: mesesLabels(ult),
    casas: 1,
    yTitulo: 'mm no mês',
    y2Titulo: 'acumulado',
    datasets: [
      { label: 'Chuva no mês', data: chuva, cor: CORES.azulClaro },
      { label: 'Acumulado', data: acumulado, cor: CORES.azul, tipo: 'line', eixo: 'y2' },
      ...(d.__anterior
        ? [{ label: `Chuva em ${Number(d.ano) - 1}`, data: (serieAnterior(d, 'mm_fazenda') || []).slice(0, Number(ult) || 12), cor: '#b9c3be', tipo: 'line' }]
        : []),
    ],
  })

  const regua = reguaAnual(
    'Mês a mês',
    'Forte: 25 a 50 mm num dia numa região · torrencial: 50 mm ou mais',
    [
      { rotulo: 'Chuva (mm)', valores: chuva, ano: `${fmt(k.mm_total, 0)} mm`, formato: L(0), tom: 'azul' },
      { rotulo: 'Dias com chuva', valores: serie(d.mensal, 'dias_chuva', ult), ano: fmtInt(k.dias_com_chuva), formato: L(0), tom: 'azul' },
      { rotulo: 'Dias de chuva forte', valores: serie(d.mensal, 'dias_forte', ult), ano: fmtInt(k.dias_forte), formato: L(0), tom: 'dourado' },
      { rotulo: 'Dias torrenciais', valores: serie(d.mensal, 'dias_torrencial', ult), ano: fmtInt(k.dias_torrencial), formato: L(0), tom: 'vermelho' },
      temTemp ? { rotulo: 'Temperatura média (°C)', valores: serie(d.mensal, 'temp_media', ult), ano: `${fmt(k.temp_media, 1)} °C`, formato: L(1), tom: 'vermelho' } : null,
      temUmid ? { rotulo: 'Umidade média (%)', valores: serie(d.mensal, 'umidade_media', ult), ano: `${fmt(k.umidade_media, 0)}%`, formato: L(0), tom: 'azul' } : null,
    ],
    ult,
  )
  const pluvs = (d.por_pluviometro || []).map((p) => ({ rotulo: p.nome, valor: p.mm_total, texto: `${fmt(p.mm_total, 1)} mm`, extra: `${fmtInt(p.leituras)} leituras` }))

  return renderSecaoAnual({
    titulo: 'Clima',
    dados: d,
    ...d.__marca,
    charts: [g.spec],
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Chuva acumulada', valor: `${fmt(k.mm_total, 1)} mm`, delta: cmp.delta('mm'), contexto: `Média de ${plural(k.pluviometros, 'pluviômetro', 'pluviômetros')} · ${cobertura(chuva, ult)}` },
          [
            { rotulo: 'Mês mais chuvoso', valor: nomeMes(k.mes_mais_chuvoso), contexto: mesChuvoso ? `${fmt(mesChuvoso.mm_fazenda, 1)} mm · ${pct(mesChuvoso.mm_fazenda, k.mm_total)} do ano` : '—', tom: 'azul' },
            { rotulo: 'Dias com chuva', valor: fmtInt(k.dias_com_chuva), delta: cmp.delta('dias'), contexto: `${plural(k.dias_forte, 'forte', 'fortes')} · ${plural(k.dias_torrencial, 'torrencial', 'torrenciais')} · maior dia ${fmt(k.maior_dia_mm, 1)} mm`, tom: 'azul' },
            { rotulo: 'Temperatura média', valor: k.temp_media != null ? `${fmt(k.temp_media, 1)} °C` : '—', contexto: k.temp_min != null ? `Mín. ${fmt(k.temp_min, 1)} · máx. ${fmt(k.temp_max, 1)} °C` : 'Sem leitura de temperatura', tom: 'vermelho' },
          ],
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'mm'),
          Number(k.dias_torrencial) > 0 ? `${plural(k.dias_torrencial, 'dia teve', 'dias tiveram')} chuva torrencial (50 mm ou mais numa região); o maior foi de ${fmt(k.maior_dia_mm, 1)} mm.` : null,
          lacuna(serie(d.mensal, 'leituras', ult), ult, { oque: 'leitura de chuva lançada' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      { html: colunas([g.html, ranking('Chuva por pluviômetro', 'Total do ano', pluvs, { tom: 'azul', max: 10 })], '1.6fr 1fr'), ...vis },
      { html: rodape(['A chuva da fazenda é a média dos pluviômetros: cada um representa uma região, então somar os totais superestimaria a chuva.']), ...vis },
    ],
  })
}

// ─────────────────────────── Mortes ───────────────────────────
export function resumoMorte(d) {
  const k = d.kpis || {}
  const mortes = serie(d.mensal, 'mortes', d.ultimo_mes)
  return {
    titulo: 'Mortalidade',
    valor: fmtInt(k.mortes),
    rotulo: 'mortes no ano',
    linhas: [`Taxa: ${k.taxa_mortalidade != null ? `${fmt(k.taxa_mortalidade, 2)}%` : '—'}${k.rebanho_estimado ? ' (rebanho estimado)' : ''}`, `Perda: ${fmtMoeda(k.perda_estimada)}`],
    serie: mortes,
    anteriores: serieAnterior(d, 'mortes'),
    delta: comparador('morte', d).delta('mortes'),
    tom: 'vermelho',
    // Mês sem morte não é falta de lançamento: fica fora da contagem de meses sem registro.
    calendario: { rotulo: 'Mortalidade · mortes', valores: mortes, formato: L(0), tom: 'vermelho', eventual: true },
  }
}

export async function renderMorteAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const det = { sec: 'Causas × categorias' }
  const estimado = Boolean(k.rebanho_estimado)
  const mortes = serie(d.mensal, 'mortes', ult)
  const mPico = pico(d.mensal, 'mortes')
  const principal = (d.por_causa || [])[0]
  const cmp = comparador('morte', d)

  const regua = reguaAnual(
    'Mês a mês',
    `${estimado ? 'Rebanho no início do mês, estimado pelo histórico' : 'Rebanho no início do mês'} · cor da taxa: escala fixa até 1% ao mês`,
    [
      { rotulo: 'Mortes', valores: mortes, ano: fmtInt(k.mortes), formato: L(0), tom: 'vermelho' },
      { rotulo: 'Taxa de mortalidade (%)', valores: serie(d.mensal, 'taxa', ult), ano: k.taxa_mortalidade != null ? `${fmt(k.taxa_mortalidade, 2)}%` : '—', formato: L(2), tom: 'vermelho', escalaMax: 1 },
      { rotulo: `Rebanho${estimado ? ' (estimado)' : ''}`, valores: serie(d.mensal, 'rebanho', ult), ano: `${fmtInt(k.rebanho_medio)} méd.`, formato: L(0), semCor: true },
      { rotulo: 'Perda estimada (R$)', valores: serie(d.mensal, 'perda', ult), ano: fmtMoeda(k.perda_estimada).replace('R$ ', ''), formato: L(0), tom: 'dourado' },
    ],
    ult,
  )

  const causas = (d.por_causa || []).map((c) => ({ rotulo: c.label, valor: c.valor, extra: pct(c.valor, k.mortes) }))
  const cats = (d.por_categoria || []).map((c) => ({ rotulo: c.label, valor: c.valor, extra: Number(c.perda) > 0 ? fmtMoeda(c.perda) : '—' }))

  const listaCausas = [...new Set((d.matriz || []).map((x) => x.causa))].sort()
  const listaCats = (d.por_categoria || []).map((c) => c.label)
  const celula = new Map((d.matriz || []).map((x) => [`${x.causa}|${x.categoria}`, Number(x.valor)]))
  const maxCel = Math.max(1, ...celula.values())
  const matriz =
    listaCausas.length && listaCats.length
      ? `<div class="table-block"><h3 class="table-title">Causa × categoria<span>Mortes no ano · cor pela quantidade</span></h3><table class="regua"><thead><tr><th class="rg-met">Causa</th>${listaCats.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th class="rg-ano">Total</th></tr></thead><tbody>${listaCausas
          .map((causa) => {
            const tot = listaCats.reduce((s, c) => s + (celula.get(`${causa}|${c}`) || 0), 0)
            return `<tr><td class="rg-met">${escapeHtml(causa)}</td>${listaCats
              .map((c) => {
                const v = celula.get(`${causa}|${c}`) || 0
                if (!v) return '<td class="rg-zero">·</td>'
                const a = 0.15 + 0.75 * (v / maxCel)
                return `<td style="background:rgba(${TONS.vermelho.rgb},${a.toFixed(2)})${a > 0.55 ? ';color:#fff' : ''}">${v}</td>`
              })
              .join('')}<td class="rg-ano" style="color:${TONS.vermelho.cor}">${tot}</td></tr>`
          })
          .join('')}</tbody></table></div>`
      : ''

  const notas = []
  if (estimado) {
    notas.push(
      `Rebanho estimado em ${fmtInt(k.meses_rebanho_estimado)} de ${plural(ult, 'mês', 'meses')}: reconstruído a partir do rebanho atual e das movimentações registradas (entradas, saídas, transferências, nascimentos e mortes). Lotes cadastrados sem lançamento de entrada ou excluídos sem lançamento de saída deslocam a estimativa.`,
    )
  }
  if (Number(k.mortes) > 0 && Number(k.mortes_com_peso) < Number(k.mortes)) {
    notas.push(`A perda estimada considera só ${Number(k.mortes_com_peso) === 1 ? 'a morte' : `as ${fmtInt(k.mortes_com_peso)} mortes`} com peso vivo registrado (de ${fmtInt(k.mortes)}), ao preço por kg da categoria.`)
  }

  return renderSecaoAnual({
    titulo: 'Mortalidade',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Mortes no ano', valor: fmtInt(k.mortes), delta: cmp.delta('mortes'), contexto: mPico ? `Pico em ${nomeMes(mPico.mes)} (${fmtInt(mPico.mortes)}) · ${cobertura(mortes, ult)}` : 'Nenhuma morte registrada' },
          [
            { rotulo: 'Taxa de mortalidade', valor: k.taxa_mortalidade != null ? `${fmt(k.taxa_mortalidade, 2)}%` : '—', delta: cmp.delta('taxa'), contexto: `Sobre rebanho médio${estimado ? ' estimado' : ''} de ${fmtInt(k.rebanho_medio)} cab.`, tom: 'vermelho' },
            { rotulo: 'Perda estimada', valor: fmtMoeda(k.perda_estimada), delta: cmp.delta('perda'), contexto: `${fmtInt(k.peso_total)} kg vivos perdidos`, tom: 'dourado' },
            { rotulo: 'Causa principal', valor: k.causa_principal ?? '—', contexto: principal ? `${plural(principal.valor, 'morte', 'mortes')} · ${pct(principal.valor, k.mortes)} do total` : '', tom: 'vermelho' },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Mortes', total: fmtInt(k.mortes), valores: mortes, anteriores: serieAnterior(d, 'mortes'), tom: 'vermelho' },
            { titulo: 'Perda estimada (R$)', total: fmtMoeda(k.perda_estimada), valores: serie(d.mensal, 'perda', ult), anteriores: serieAnterior(d, 'perda'), tom: 'dourado' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'mortes'),
          mesForaDoPadrao(mortes, { nome: 'mortes' }),
          concentracao(causas, k.mortes, { oque: 'das mortes do ano' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      { html: colunas([ranking('Por causa', 'Mortes · % do total', causas, { tom: 'vermelho' }), ranking('Por categoria', 'Mortes · perda estimada', cats, { tom: 'dourado' })]), ...vis },
      { html: rodape(notas), ...vis },
      { html: matriz, tipo: 'tabela', ...det },
    ],
  })
}

// ─────────────────────────── Rodeio ───────────────────────────
export function resumoRodeio(d) {
  const k = d.kpis || {}
  const rodeios = serie(d.mensal, 'rodeios', d.ultimo_mes)
  return {
    titulo: 'Rodeio de gado',
    valor: fmtInt(k.rodeios),
    rotulo: 'rodeios no ano',
    linhas: [`${fmt(k.pct_rodeios_com_alerta, 0)}% com alerta`, `Escore médio do gado: ${fmt(k.escore_gado_medio, 1)}`],
    serie: rodeios,
    anteriores: serieAnterior(d, 'rodeios'),
    delta: comparador('rodeio', d).delta('rodeios'),
    tom: 'verde',
    calendario: { rotulo: 'Rodeio · rodeios', valores: rodeios, formato: L(0) },
  }
}

export async function renderRodeioAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const vis = { sec: 'Visão do ano' }
  const rodeios = serie(d.mensal, 'rodeios', ult)
  const totalAlertas = (Number(k.alertas_sanitarios) || 0) + (Number(k.pendencias_infra) || 0)
  const avaliados = (Number(k.dentro_meta) || 0) + (Number(k.fora_meta) || 0)
  const cmp = comparador('rodeio', d)
  const alertasMes = serie(d.mensal, (m) => (Number(m?.alertas_sanitarios) || 0) + (Number(m?.pendencias_infra) || 0), ult)

  const regua = reguaAnual(
    'Mês a mês',
    'Escores de 1 a 5 (sem cor: não é volume)',
    [
      { rotulo: 'Rodeios', valores: rodeios, ano: fmtInt(k.rodeios), formato: L(0) },
      { rotulo: 'Alertas sanitários', valores: serie(d.mensal, 'alertas_sanitarios', ult), ano: fmtInt(k.alertas_sanitarios), formato: L(0), tom: 'vermelho' },
      { rotulo: 'Pendências de infraestrutura', valores: serie(d.mensal, 'pendencias_infra', ult), ano: fmtInt(k.pendencias_infra), formato: L(0), tom: 'dourado' },
      { rotulo: 'Escore do gado', valores: serie(d.mensal, 'escore_gado', ult), ano: fmt(k.escore_gado_medio, 1), formato: L(1), semCor: true },
      { rotulo: 'Escore de fezes', valores: serie(d.mensal, 'escore_fezes', ult), ano: fmt(k.escore_fezes_medio, 1), formato: L(1), semCor: true },
    ],
    ult,
  )
  const diag = (d.por_diagnostico || []).filter((x) => Number(x.valor) > 0).map((x) => ({ rotulo: x.label, valor: x.valor, extra: x.sanitario ? 'sanitário' : 'infra' }))
  const local = (lista) => (lista || []).filter((x) => Number(x.alertas) > 0).map((x) => ({ rotulo: x.nome, valor: x.alertas, texto: fmtInt(x.alertas), extra: `${fmtInt(x.rodeios)} rod.` }))

  return renderSecaoAnual({
    titulo: 'Rodeio de Gado',
    dados: d,
    ...d.__marca,
    blocos: [
      {
        html: kpisAnuais(
          { rotulo: 'Rodeios realizados', valor: fmtInt(k.rodeios), delta: cmp.delta('rodeios'), contexto: `${plural(k.lotes, 'lote', 'lotes')} · ${plural(k.pastos, 'pasto', 'pastos')} · ${cobertura(rodeios, ult)}` },
          [
            { rotulo: 'Rodeios com alerta', valor: `${fmt(k.pct_rodeios_com_alerta, 0)}%`, contexto: `${plural(totalAlertas, 'alerta', 'alertas')}: ${fmtInt(k.alertas_sanitarios)} sanitários · ${fmtInt(k.pendencias_infra)} infra`, tom: totalAlertas > 0 ? 'vermelho' : undefined },
            { rotulo: 'Escore médio do gado', valor: fmt(k.escore_gado_medio, 1), delta: cmp.delta('escore'), contexto: `Fezes: ${fmt(k.escore_fezes_medio, 1)} · escala de 1 a 5` },
            avaliados > 0
              ? { rotulo: 'Dentro da meta de intervalo', valor: pct(k.dentro_meta, avaliados), contexto: `${fmtInt(k.dentro_meta)} dentro · ${fmtInt(k.fora_meta)} fora`, tom: Number(k.fora_meta) > 0 ? 'dourado' : undefined }
              : { rotulo: 'Cabeças por rodeio', valor: fmtInt(k.cabecas_media), contexto: 'média de cabeças contadas', tom: 'azul' },
          ],
        ),
        ...vis,
      },
      {
        html: tendencias(
          [
            { titulo: 'Rodeios', total: fmtInt(k.rodeios), valores: rodeios, anteriores: serieAnterior(d, 'rodeios') },
            { titulo: 'Alertas (sanitários + infra)', total: fmtInt(totalAlertas), valores: alertasMes, anteriores: serieAnterior(d, (m) => (Number(m?.alertas_sanitarios) || 0) + (Number(m?.pendencias_infra) || 0)), tom: 'vermelho' },
          ],
          ult,
          cmp.anoAnterior,
        ),
        ...vis,
      },
      {
        html: atencao([
          variacaoForte(cmp, 'alertas'),
          variacaoForte(cmp, 'rodeios'),
          concentracao(local(d.por_pasto), totalAlertas, { oque: 'dos alertas do ano' }),
          lacuna(rodeios, ult, { oque: 'rodeio lançado' }),
        ]),
        ...vis,
      },
      { html: regua, ...vis },
      {
        html: colunas(
          [
            ranking('Alertas por diagnóstico', 'Total do ano', diag, { tom: 'vermelho' }),
            ranking('Pastos com mais alertas', 'Alertas no ano', local(d.por_pasto), { tom: 'dourado' }),
            ranking('Lotes com mais alertas', 'Alertas no ano', local(d.por_lote), { tom: 'dourado' }),
          ],
          '1fr 1fr 1fr',
        ),
        ...vis,
      },
    ],
  })
}

// ─────────────────────────── O ano em números (abertura) ───────────────────────────
export const RESUMOS = {
  bebedouros: resumoBebedouros,
  estoque: resumoEstoqueInsumos,
  almoxarifado: resumoAlmoxarifado,
  farmacia: resumoFarmacia,
  cantina: resumoCantina,
  maternidade: resumoMaternidade,
  pastagens: resumoPastagens,
  combustivel: resumoCombustivel,
  consumo: resumoConsumo,
  clima: resumoClima,
  morte: resumoMorte,
  rodeio: resumoRodeio,
}

/** dados: { ano, ultimo_mes, secoes: [{ secao, data }], __marca } */
export async function renderResumoAnual(d) {
  const ult = d.ultimo_mes
  const itens = (d.secoes || []).filter((s) => RESUMOS[s.secao]).map((s) => RESUMOS[s.secao](s.data))
  const cards = itens
    .map(
      (r) =>
        `<div class="rs-card rs-${r.tom}"><div class="ak-rot">${escapeHtml(r.titulo)}</div><div class="rs-val">${escapeHtml(r.valor)}</div><div class="rs-rot">${escapeHtml(r.rotulo)}</div>${r.delta ? `<div class="ak-delta ak-d-${r.delta.tom}">${escapeHtml(r.delta.texto)}</div>` : ''}${miniBarras(r.serie, ult, r.tom, r.anteriores)}<div class="rs-lin">${r.linhas.map((l) => `<span>${escapeHtml(l)}</span>`).join('')}</div></div>`,
    )
    .join('')
  const calendario = reguaAnual(
    'Calendário do ano',
    'Registros lançados em cada caderneta por mês · vazio: nenhum registro',
    itens.map((r) => ({
      rotulo: r.calendario.rotulo,
      valores: r.calendario.valores,
      ano: `${mesesComValor(r.calendario.valores)}/${ult} meses`,
      formato: r.calendario.formato,
      tom: r.calendario.tom ?? r.tom,
    })),
    ult,
  )
  const semRegistro = itens
    .filter((r) => !r.calendario.eventual)
    .map((r) => ({ t: r.titulo, n: ult - mesesComValor(r.calendario.valores) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  const leitura = semRegistro.length
    ? `Meses sem registro no período: ${semRegistro.map((x) => `${x.t} ${x.n}`).join(' · ')}. Mês vazio pode ser falta de lançamento, e não ausência do evento.`
    : ''

  // Até 5 cartões numa fileira; acima disso, duas fileiras (11 cartões = 6 + 5) para caber na página.
  const colunasResumo = itens.length <= 5 ? itens.length || 1 : Math.ceil(itens.length / 2)
  const compacto = colunasResumo >= 6 ? '.rs-val{font-size:19px}.rs-card{padding:3mm 2.4mm 2.5mm}.rs-card .mb{height:30mm}' : ''
  const css = `<style>.rs-grid{display:grid;grid-template-columns:repeat(${colunasResumo},1fr);gap:3mm;margin-bottom:6mm}.rs-card{border:1px solid #dce5df;border-top:3px solid #0b6a42;border-radius:6px;padding:3mm 3.2mm 2.5mm}.rs-azul{border-top-color:#1E3A5F}.rs-vermelho{border-top-color:#b5413a}.rs-val{font-size:25px;font-weight:700;color:#26352e;margin-top:1.5mm;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rs-rot{font-size:10px;color:#7a8981;margin-bottom:2.5mm}.rs-lin{display:flex;flex-direction:column;gap:.6mm;margin-top:2.2mm;font-size:10px;color:#30463a}.rs-card .mb{height:26mm}.rs-card .ak-delta{margin:0 0 2mm}${compacto}</style>`

  return renderSecaoAnual({
    titulo: 'O Ano em Números',
    dados: d,
    ...d.__marca,
    blocos: [
      { html: `${css}${itens.some((r) => r.anteriores) ? `<div class="td-leg" style="justify-content:flex-end;margin:-2mm 0 1.5mm"><i></i>${escapeHtml(String(d.ano))} <b></b>${escapeHtml(String(Number(d.ano) - 1))} (mesmo período na comparação)</div>` : ''}<div class="rs-grid">${cards}</div>`, sec: 'Resumo' },
      { html: calendario, sec: 'Resumo' },
      { html: rodape([leitura]), sec: 'Resumo' },
    ],
  })
}
