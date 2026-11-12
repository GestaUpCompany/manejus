// Renderers das seções do Infográfico Anual (fase 1). Cada um recebe o JSON da
// RPC get_infografico_anual_<secao> + { fazendaNome, logoGestao, logoFazenda }.

import {
  CORES,
  MESES,
  PALETA,
  escapeHtml,
  fmt,
  fmtInt,
  fmtMoeda,
  grade,
  grafico,
  kpi,
  mesesLabels,
  nota,
  plural,
  renderSecaoAnual,
  serie,
  tabela,
} from './comum.js'

const nomeMes = (m) => (m ? MESES[Number(m) - 1] : '—')
const kpis = (itens, colunas = 4) => `<div class="kpi-grid" style="grid-template-columns:repeat(${colunas},1fr)">${itens.join('')}</div>`
const ressalva = (texto) => (texto ? `<div class="anual-ressalva">${escapeHtml(texto)}</div>` : '')

// ─────────────────────────── Combustível ───────────────────────────
export async function renderCombustivelAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const labels = mesesLabels(ult)
  const combustiveis = d.combustiveis || []
  const sec = { sec: 'Combustível', lbl: 'Visão do ano' }
  const secT = { sec: 'Máquinas e tanques', lbl: 'Ranking do ano' }

  const g1 = grafico({
    id: 'anual-comb-litros',
    titulo: 'Litros abastecidos por mês',
    subtitulo: 'Por tipo de combustível; total no topo',
    labels,
    empilhado: true,
    datasets: combustiveis.map((c, i) => ({ label: c, data: serie(d.mensal, (m) => m?.por_combustivel?.[c] ?? 0, ult), cor: PALETA[i % PALETA.length] })),
  })
  const g2 = grafico({
    id: 'anual-comb-tanques',
    titulo: 'Entradas e saídas dos tanques por mês',
    subtitulo: 'Litros comprados × litros baixados',
    labels,
    datasets: [
      { label: 'Entradas', data: serie(d.mensal, 'entradas_l', ult), cor: CORES.verde },
      { label: 'Saídas', data: serie(d.mensal, 'baixas_l', ult), cor: CORES.dourado },
    ],
  })

  const mesPico = (d.mensal || []).reduce((a, m) => (Number(m.litros) > Number(a?.litros ?? -1) ? m : a), null)
  const leitura = Number(k.litros) > 0
    ? `Foram abastecidos ${fmtInt(k.litros)} L em ${fmtInt(k.abastecimentos)} abastecimentos de ${fmtInt(k.maquinas)} máquina(s). O mês de maior consumo foi ${nomeMes(mesPico?.mes)} (${fmtInt(mesPico?.litros)} L). Os tanques receberam ${fmtInt(k.entradas_l)} L (${fmtMoeda(k.entradas_valor)}) e terminaram o período com ${fmtInt(k.saldo_final_l)} L.`
    : 'Nenhum abastecimento registrado no ano.'

  const maquinas = (d.por_maquina || []).map((m) => [
    escapeHtml(m.label),
    fmtInt(m.abastecimentos),
    fmtInt(m.litros),
    m.consumo_medio != null && Number(m.consumo_medio) > 0 ? `${fmt(m.consumo_medio, 2)} L/${escapeHtml(m.unidade || 'un')}` : '—',
  ])
  const demais = d.maquinas_demais || {}
  if (Number(demais.qtd) > 0) maquinas.push([`Demais ${fmtInt(demais.qtd)} máquina(s)`, '—', fmtInt(demais.litros), '—'])
  const operacoes = (d.por_operacao || []).map((o) => [escapeHtml(o.label), fmtInt(o.valor), Number(k.litros) > 0 ? `${fmt((Number(o.valor) / Number(k.litros)) * 100, 1)}%` : '—'])
  const tanques = (d.tanques || []).map((t) => [escapeHtml(t.nome), escapeHtml(t.combustivel), fmtInt(t.saldo_inicial_l), fmtInt(t.entradas_l), fmtInt(t.baixas_l), fmtInt(t.ajustes_l), fmtInt(t.saldo_final_l)])

  return renderSecaoAnual({
    titulo: 'Combustível no Ano',
    dados: d,
    ...d.__marca,
    charts: [g1.spec, g2.spec],
    blocos: [
      { html: nota(leitura), ...sec },
      {
        html: kpis([
          kpi(`${fmtInt(k.litros)} L`, 'Litros abastecidos', `${fmtInt(k.abastecimentos)} abastecimentos`),
          kpi(fmtInt(k.maquinas), 'Máquinas abastecidas', 'No ano'),
          kpi(`${fmtInt(k.entradas_l)} L`, 'Entradas nos tanques', fmtMoeda(k.entradas_valor), 'gold'),
          kpi(`${fmtInt(k.saldo_final_l)} L`, 'Saldo dos tanques no fim', `Início do ano: ${fmtInt(k.saldo_inicial_l)} L`),
        ]),
        ...sec,
      },
      { html: grade([g1.html, g2.html], 2), ...sec },
      { html: tabela('Máquinas que mais consumiram', 'Top 10 do ano', [{ label: 'Máquina', width: '46%' }, { label: 'Abastecimentos', numeric: true }, { label: 'Litros', numeric: true }, { label: 'Consumo médio', numeric: true }], maquinas), tipo: 'tabela', ...secT },
      { html: tabela('Litros por operação', 'Ano inteiro', [{ label: 'Operação', width: '60%' }, { label: 'Litros', numeric: true }, { label: '% do total', numeric: true }], operacoes), tipo: 'tabela', ...secT },
      { html: tabela('Tanques no ano', 'Litros', [{ label: 'Tanque', width: '26%' }, { label: 'Combustível', width: '18%' }, { label: 'Início', numeric: true }, { label: 'Entradas', numeric: true }, { label: 'Saídas', numeric: true }, { label: 'Ajustes', numeric: true }, { label: 'Fim', numeric: true }], tanques), tipo: 'tabela', ...secT },
    ],
  })
}

// ─────────────────────────── Consumo ───────────────────────────
export async function renderConsumoAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const labels = mesesLabels(ult)
  const sec = { sec: 'Consumo', lbl: 'Visão do ano' }
  const secT = { sec: 'Lotes', lbl: 'Ranking do ano' }
  const temConf = (d.mensal || []).some((m) => Number(m.confinamento?.lote_dias) > 0)
  const temPasto = (d.mensal || []).some((m) => Number(m.pasto?.lote_dias) > 0)
  const porManejo = (campo) => [
    temPasto ? { label: 'Pasto', data: serie(d.mensal, (m) => m?.pasto?.[campo], ult), cor: CORES.verdeClaro } : null,
    temConf ? { label: 'Confinamento', data: serie(d.mensal, (m) => m?.confinamento?.[campo], ult), cor: CORES.azul } : null,
  ].filter(Boolean)

  const g1 = grafico({ id: 'anual-cons-ms', titulo: 'Consumo de MS por mês', subtitulo: 'kg de matéria seca por cabeça por dia', labels, casas: 2, datasets: porManejo('ms'), yTitulo: 'kg MS/cab/dia' })
  const g2 = grafico({ id: 'anual-cons-pv', titulo: 'Consumo em % do peso vivo por mês', subtitulo: 'Média dos lote-dias do mês', labels, casas: 2, datasets: porManejo('pv').map((x) => ({ ...x, tipo: 'line' })), yTitulo: '% PV' })
  const g3 = grafico({ id: 'anual-cons-custo', titulo: 'Custo por cabeça por dia', subtitulo: 'R$/cab/dia, média do mês', labels, casas: 2, datasets: porManejo('custo'), yTitulo: 'R$/cab/dia' })
  const g4 = grafico({ id: 'anual-cons-dias', titulo: 'Lote-dias com trato por mês', subtitulo: 'Quantos lotes × dias foram tratados', labels, datasets: porManejo('lote_dias'), empilhado: true })

  const leitura = Number(k.lote_dias) > 0
    ? `No ano foram ${fmtInt(k.lote_dias)} lote-dias com trato em ${fmtInt(k.lotes)} lote(s). O consumo médio foi de ${fmt(k.ms_kg_cab_dia, 2)} kg de MS por cabeça por dia (${fmt(k.pct_pv, 2)}% do peso vivo), a um custo médio de ${fmtMoeda(k.custo_cab_dia)} por cabeça por dia.`
    : 'Nenhum trato registrado no ano.'

  const lotes = (d.por_lote || []).map((l) => [
    escapeHtml(l.lote),
    l.manejo === 'confinamento' ? 'Confinamento' : 'Pasto',
    fmtInt(l.dias),
    fmt(l.mn, 2),
    fmt(l.ms, 2),
    fmt(l.pv, 2),
    l.custo != null ? fmtMoeda(l.custo) : '—',
  ])
  if (Number(d.lotes_demais) > 0) lotes.push([`Demais ${fmtInt(d.lotes_demais)} lote(s)`, '', '', '', '', '', ''])

  return renderSecaoAnual({
    titulo: 'Consumo no Ano',
    dados: d,
    ...d.__marca,
    charts: [g1.spec, g2.spec, g3.spec, g4.spec],
    blocos: [
      { html: nota(leitura), ...sec },
      {
        html: kpis([
          kpi(fmt(k.ms_kg_cab_dia, 2), 'kg MS/cab/dia', `Matéria natural: ${fmt(k.mn_kg_cab_dia, 2)} kg`),
          kpi(`${fmt(k.pct_pv, 2)}%`, 'Consumo em % do PV', 'Média do ano'),
          kpi(fmtMoeda(k.custo_cab_dia), 'Custo por cabeça/dia', 'Média do ano', 'gold'),
          kpi(fmtInt(k.lote_dias), 'Lote-dias com trato', `${fmtInt(k.lotes)} lote(s)`),
        ]),
        ...sec,
      },
      { html: ressalva('Os índices do ano são médias sobre todos os dias com trato de todos os lotes (cada lote-dia pesa igual). O relatório não traz MS total nem custo total do ano porque o número de cabeças de cada dia não está disponível.'), ...sec },
      { html: grade([g1.html, g2.html], 2), ...sec },
      { html: grade([g3.html, g4.html], 2), sec: 'Consumo', lbl: 'Custo e cobertura' },
      { html: tabela('Lotes no ano', 'Médias dos dias com trato (top 15 por dias)', [{ label: 'Lote', width: '28%' }, { label: 'Manejo' }, { label: 'Dias', numeric: true }, { label: 'MN kg/cab/dia', numeric: true }, { label: 'MS kg/cab/dia', numeric: true }, { label: '% PV', numeric: true }, { label: 'R$/cab/dia', numeric: true }], lotes), tipo: 'tabela', ...secT },
    ],
  })
}

// ─────────────────────────── Clima ───────────────────────────
export async function renderClimaAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const labels = mesesLabels(ult)
  const sec = { sec: 'Clima', lbl: 'Visão do ano' }
  const secT = { sec: 'Pluviômetros', lbl: 'Total do ano' }
  const chuva = serie(d.mensal, 'mm_fazenda', ult)
  let acc = 0
  const acumulado = chuva.map((v) => Number((acc += Number(v) || 0).toFixed(1)))
  const temTemp = (d.mensal || []).some((m) => m.temp_media != null)

  const g1 = grafico({
    id: 'anual-clima-chuva',
    titulo: 'Chuva por mês e acumulado do ano',
    subtitulo: 'Média dos pluviômetros (mm)',
    labels,
    casas: 1,
    yTitulo: 'mm no mês',
    y2Titulo: 'mm acumulado',
    datasets: [
      { label: 'Chuva no mês', data: chuva, cor: CORES.azulClaro },
      { label: 'Acumulado', data: acumulado, cor: CORES.azul, tipo: 'line', eixo: 'y2' },
    ],
  })
  const g2 = grafico({
    id: 'anual-clima-dias',
    titulo: 'Dias de chuva por mês',
    subtitulo: 'Forte: 25 a 50 mm numa região · Torrencial: 50 mm ou mais',
    labels,
    empilhado: true,
    datasets: [
      { label: 'Normal', data: serie(d.mensal, (m) => (Number(m?.dias_chuva) || 0) - (Number(m?.dias_forte) || 0) - (Number(m?.dias_torrencial) || 0), ult), cor: '#9DB7CE' },
      { label: 'Forte', data: serie(d.mensal, 'dias_forte', ult), cor: '#6F9BC8' },
      { label: 'Torrencial', data: serie(d.mensal, 'dias_torrencial', ult), cor: '#1E3A5F' },
    ],
  })
  const g3 = temTemp
    ? grafico({
        id: 'anual-clima-temp',
        titulo: 'Temperatura e umidade médias por mês',
        subtitulo: 'Meses sem leitura ficam em branco',
        labels,
        casas: 1,
        yTitulo: '°C',
        y2Titulo: '% UR',
        datasets: [
          { label: 'Temperatura (°C)', data: serie(d.mensal, 'temp_media', ult), cor: CORES.vermelho, tipo: 'line' },
          { label: 'Umidade (%)', data: serie(d.mensal, 'umidade_media', ult), cor: CORES.azulClaro, tipo: 'line', eixo: 'y2' },
        ],
      })
    : { html: '', spec: null }

  const leitura = Number(k.pluviometros) > 0
    ? `Choveu em média ${fmt(k.mm_total, 1)} mm no ano, em ${fmtInt(k.dias_com_chuva)} dias. O mês mais chuvoso foi ${nomeMes(k.mes_mais_chuvoso)}. Houve ${plural(k.dias_forte, 'dia', 'dias')} de chuva forte e ${plural(k.dias_torrencial, 'dia torrencial', 'dias torrenciais')}; o maior volume num dia foi ${fmt(k.maior_dia_mm, 1)} mm numa região.`
    : 'Nenhuma leitura de clima registrada no ano.'

  const meses = (d.mensal || []).map((m) => [
    escapeHtml(nomeMes(m.mes)),
    fmt(m.mm_fazenda, 1),
    Number(k.pluviometros) > 1 ? `${fmt(m.mm_min, 1)} a ${fmt(m.mm_max, 1)}` : '—',
    fmtInt(m.dias_chuva),
    fmtInt(m.dias_forte),
    fmtInt(m.dias_torrencial),
    m.temp_media != null ? `${fmt(m.temp_media, 1)} °C` : '—',
  ])
  const pluvs = (d.por_pluviometro || []).map((p) => [escapeHtml(p.nome), fmt(p.mm_total, 1), fmtInt(p.leituras), fmt(p.maior_leitura, 1)])

  return renderSecaoAnual({
    titulo: 'Clima no Ano',
    dados: d,
    ...d.__marca,
    charts: [g1.spec, g2.spec, g3.spec],
    blocos: [
      { html: nota(leitura), ...sec },
      {
        html: kpis([
          kpi(`${fmt(k.mm_total, 1)} mm`, 'Chuva acumulada no ano', `Média de ${fmtInt(k.pluviometros)} pluviômetro(s)`),
          kpi(fmtInt(k.dias_com_chuva), 'Dias com chuva', `Mês mais chuvoso: ${nomeMes(k.mes_mais_chuvoso)}`),
          kpi(`${fmtInt(k.dias_forte)} / ${fmtInt(k.dias_torrencial)}`, 'Dias fortes / torrenciais', `Maior dia: ${fmt(k.maior_dia_mm, 1)} mm`, Number(k.dias_torrencial) > 0 ? 'red' : 'gold'),
          kpi(k.temp_media != null ? `${fmt(k.temp_media, 1)} °C` : '—', 'Temperatura média', k.temp_min != null ? `Mín. ${fmt(k.temp_min, 1)} · Máx. ${fmt(k.temp_max, 1)} °C${k.umidade_media != null ? ` · UR ${fmt(k.umidade_media, 0)}%` : ''}` : 'Sem leitura de temperatura'),
        ]),
        ...sec,
      },
      { html: grade([g1.html, g2.html], 2), ...sec },
      { html: g3.html ? grade([g3.html], 1) : '', sec: 'Clima', lbl: 'Temperatura' },
      { html: tabela('Chuva por pluviômetro', 'Total do ano', [{ label: 'Pluviômetro', width: '46%' }, { label: 'Total (mm)', numeric: true }, { label: 'Leituras', numeric: true }, { label: 'Maior leitura (mm)', numeric: true }], pluvs), tipo: 'tabela', ...secT },
      { html: tabela('Resumo mês a mês', 'mm = média dos pluviômetros', [{ label: 'Mês', width: '18%' }, { label: 'Chuva (mm)', numeric: true }, { label: 'Faixa entre regiões', numeric: true }, { label: 'Dias de chuva', numeric: true }, { label: 'Fortes', numeric: true }, { label: 'Torrenciais', numeric: true }, { label: 'Temp. média', numeric: true }], meses), tipo: 'tabela', sec: 'Clima', lbl: 'Mês a mês' },
    ],
  })
}

// ─────────────────────────── Mortes ───────────────────────────
export async function renderMorteAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const labels = mesesLabels(ult)
  const sec = { sec: 'Mortalidade', lbl: 'Visão do ano' }
  const secT = { sec: 'Causas e categorias', lbl: 'Total do ano' }
  const estimado = Boolean(k.rebanho_estimado)

  const g1 = grafico({
    id: 'anual-morte-mes',
    titulo: 'Mortes e taxa de mortalidade por mês',
    subtitulo: `Taxa = mortes do mês / rebanho no início do mês${estimado ? ' (rebanho estimado)' : ''}`,
    labels,
    yTitulo: 'Mortes',
    y2Titulo: 'Taxa (%)',
    datasets: [
      { label: 'Mortes', data: serie(d.mensal, 'mortes', ult), cor: CORES.vermelho },
      { label: 'Taxa (%)', data: serie(d.mensal, 'taxa', ult), cor: CORES.azul, tipo: 'line', eixo: 'y2', casas: 2 },
    ],
  })
  const top = (lista, n) => (lista || []).slice(0, n)
  const g2 = grafico({
    id: 'anual-morte-causa',
    titulo: 'Mortes por causa',
    subtitulo: 'Total do ano',
    labels: top(d.por_causa, 10).map((c) => c.label),
    horizontal: true,
    datasets: [{ label: 'Mortes', data: top(d.por_causa, 10).map((c) => c.valor), cor: CORES.vermelho }],
  })
  const g3 = grafico({
    id: 'anual-morte-categoria',
    titulo: 'Mortes por categoria',
    subtitulo: 'Total do ano',
    labels: top(d.por_categoria, 10).map((c) => c.label),
    horizontal: true,
    datasets: [{ label: 'Mortes', data: top(d.por_categoria, 10).map((c) => c.valor), cor: CORES.dourado }],
  })

  const mesPico = (d.mensal || []).reduce((a, m) => (Number(m.mortes) > Number(a?.mortes ?? 0) ? m : a), null)
  const leitura = Number(k.mortes) > 0
    ? `Foram ${fmtInt(k.mortes)} mortes no ano, taxa de ${fmt(k.taxa_mortalidade, 2)}% sobre um rebanho médio de ${fmtInt(k.rebanho_medio)} cabeças. A causa principal foi ${k.causa_principal}. O mês com mais mortes foi ${nomeMes(mesPico?.mes)} (${fmtInt(mesPico?.mortes)}). A perda estimada é de ${fmtMoeda(k.perda_estimada)}.`
    : 'Nenhuma morte registrada no ano.'
  const avisos = []
  if (estimado) {
    avisos.push(
      `Rebanho estimado em ${fmtInt(k.meses_rebanho_estimado)} de ${plural(ult, 'mês', 'meses')}: reconstruído a partir do rebanho atual e das movimentações registradas (entradas, saídas, transferências, nascimentos e mortes). Lotes cadastrados sem lançamento de entrada ou excluídos sem lançamento de saída deslocam a estimativa.`,
    )
  }
  if (Number(k.mortes) > 0 && Number(k.mortes_com_peso) < Number(k.mortes)) {
    avisos.push(`A perda estimada considera só ${Number(k.mortes_com_peso) === 1 ? 'a morte' : `as ${fmtInt(k.mortes_com_peso)} mortes`} com peso vivo registrado (de ${fmtInt(k.mortes)}).`)
  }

  const categorias = (d.por_categoria || []).map((c) => [escapeHtml(c.label), fmtInt(c.valor), Number(k.mortes) > 0 ? `${fmt((c.valor / k.mortes) * 100, 0)}%` : '—', fmtMoeda(c.perda)])
  const mesesTab = (d.mensal || []).map((m) => [escapeHtml(nomeMes(m.mes)), fmtInt(m.mortes), `${fmtInt(m.rebanho)}${m.rebanho_estimado ? '*' : ''}`, m.taxa != null ? `${fmt(m.taxa, 2)}%` : '—', fmtMoeda(m.perda)])

  const causas = [...new Set((d.matriz || []).map((x) => x.causa))].sort()
  const cats = (d.por_categoria || []).map((c) => c.label)
  const cel = new Map((d.matriz || []).map((x) => [`${x.causa}|${x.categoria}`, x.valor]))
  const matrizRows = causas.map((c) => [escapeHtml(c), ...cats.map((cat) => (cel.get(`${c}|${cat}`) ? `<strong>${fmtInt(cel.get(`${c}|${cat}`))}</strong>` : '·'))])

  return renderSecaoAnual({
    titulo: 'Mortalidade no Ano',
    dados: d,
    ...d.__marca,
    charts: [g1.spec, g2.spec, g3.spec],
    blocos: [
      { html: nota(leitura), ...sec },
      {
        html: kpis([
          kpi(fmtInt(k.mortes), 'Mortes no ano', `Causa principal: ${k.causa_principal ?? '—'}`, Number(k.mortes) > 0 ? 'red' : 'green'),
          kpi(k.taxa_mortalidade != null ? `${fmt(k.taxa_mortalidade, 2)}%` : '—', 'Taxa de mortalidade do ano', `Rebanho médio${estimado ? ' estimado' : ''}: ${fmtInt(k.rebanho_medio)} cab.`, 'red'),
          kpi(fmtMoeda(k.perda_estimada), 'Perda estimada', `${fmtInt(k.peso_total)} kg vivos`, 'gold'),
          kpi(fmtInt((d.por_causa || []).length), 'Causas registradas', `${fmtInt((d.por_categoria || []).length)} categoria(s) afetada(s)`),
        ]),
        ...sec,
      },
      { html: avisos.length ? ressalva(avisos.join(' ')) : '', ...sec },
      { html: grade([g1.html], 1), ...sec },
      { html: grade([g2.html, g3.html], 2), ...secT },
      { html: tabela('Mortes por categoria', 'Perda pelo preço por kg da categoria', [{ label: 'Categoria', width: '40%' }, { label: 'Mortes', numeric: true }, { label: '% do total', numeric: true }, { label: 'Perda estimada', numeric: true }], categorias), tipo: 'tabela', ...secT },
      {
        html: cats.length && causas.length ? tabela('Causa × categoria', 'Mortes no ano', [{ label: 'Causa', width: '22%' }, ...cats.map((c) => ({ label: c, numeric: true }))], matrizRows) : '',
        tipo: 'tabela',
        ...secT,
      },
      { html: tabela('Resumo mês a mês', estimado ? '* rebanho estimado' : 'Rebanho no início do mês', [{ label: 'Mês', width: '22%' }, { label: 'Mortes', numeric: true }, { label: 'Rebanho', numeric: true }, { label: 'Taxa', numeric: true }, { label: 'Perda estimada', numeric: true }], mesesTab), tipo: 'tabela', sec: 'Mortalidade', lbl: 'Mês a mês' },
    ],
  })
}

// ─────────────────────────── Rodeio ───────────────────────────
export async function renderRodeioAnual(d) {
  const k = d.kpis || {}
  const ult = d.ultimo_mes
  const labels = mesesLabels(ult)
  const sec = { sec: 'Rodeio de gado', lbl: 'Visão do ano' }
  const secT = { sec: 'Pastos e lotes', lbl: 'Ranking do ano' }

  const g1 = grafico({
    id: 'anual-rodeio-mes',
    titulo: 'Rodeios e alertas por mês',
    subtitulo: 'Alertas: sanitários e de infraestrutura',
    labels,
    datasets: [
      { label: 'Rodeios', data: serie(d.mensal, 'rodeios', ult), cor: CORES.verde },
      { label: 'Alertas sanitários', data: serie(d.mensal, 'alertas_sanitarios', ult), cor: CORES.vermelho },
      { label: 'Pendências de infra', data: serie(d.mensal, 'pendencias_infra', ult), cor: CORES.dourado },
    ],
  })
  const g2 = grafico({
    id: 'anual-rodeio-escore',
    titulo: 'Escore médio por mês',
    subtitulo: 'Escala de 1 a 5',
    labels,
    casas: 1,
    datasets: [
      { label: 'Escore do gado', data: serie(d.mensal, 'escore_gado', ult), cor: CORES.verde, tipo: 'line' },
      { label: 'Escore de fezes', data: serie(d.mensal, 'escore_fezes', ult), cor: CORES.dourado, tipo: 'line' },
    ],
  })
  const diag = d.por_diagnostico || []
  const g3 = grafico({
    id: 'anual-rodeio-diag',
    titulo: 'Alertas por diagnóstico',
    subtitulo: 'Total do ano',
    labels: diag.map((x) => x.label),
    horizontal: true,
    datasets: [{ label: 'Alertas', data: diag.map((x) => x.valor), cor: CORES.vermelho }],
  })

  const totalAlertas = (Number(k.alertas_sanitarios) || 0) + (Number(k.pendencias_infra) || 0)
  const avaliados = (Number(k.dentro_meta) || 0) + (Number(k.fora_meta) || 0)
  const leitura = Number(k.rodeios) > 0
    ? `Foram ${plural(k.rodeios, 'rodeio', 'rodeios')} em ${plural(k.lotes, 'lote', 'lotes')} e ${plural(k.pastos, 'pasto', 'pastos')}. ${fmt(k.pct_rodeios_com_alerta, 0)}% dos rodeios tiveram algum alerta (${fmtInt(k.alertas_sanitarios)} sanitários, ${fmtInt(k.pendencias_infra)} de infraestrutura). Escore médio do gado: ${fmt(k.escore_gado_medio, 1)}.`
    : 'Nenhum rodeio registrado no ano.'
  const local = (lista) => (lista || []).map((x) => [escapeHtml(x.nome), fmtInt(x.rodeios), fmtInt(x.alertas), fmt(x.escore, 1)])
  const colsLocal = (nome) => [{ label: nome, width: '46%' }, { label: 'Rodeios', numeric: true }, { label: 'Alertas', numeric: true }, { label: 'Escore médio', numeric: true }]

  return renderSecaoAnual({
    titulo: 'Rodeio de Gado no Ano',
    dados: d,
    ...d.__marca,
    charts: [g1.spec, g2.spec, g3.spec],
    blocos: [
      { html: nota(leitura), ...sec },
      {
        html: kpis([
          kpi(fmtInt(k.rodeios), 'Rodeios realizados', `${fmtInt(k.lotes)} lotes · ${fmtInt(k.pastos)} pastos`),
          kpi(`${fmt(k.pct_rodeios_com_alerta, 0)}%`, 'Rodeios com alerta', `${fmtInt(totalAlertas)} alertas no ano`, totalAlertas > 0 ? 'red' : 'green'),
          kpi(fmt(k.escore_gado_medio, 1), 'Escore médio do gado', `Fezes: ${fmt(k.escore_fezes_medio, 1)} (1-5)`),
          kpi(avaliados > 0 ? `${fmt((k.dentro_meta / avaliados) * 100, 0)}%` : '—', 'Dentro da meta de intervalo', avaliados > 0 ? `${fmtInt(k.dentro_meta)} dentro · ${fmtInt(k.fora_meta)} fora` : 'Lotes sem meta configurada', Number(k.fora_meta) > 0 ? 'gold' : 'green'),
        ]),
        ...sec,
      },
      { html: grade([g1.html, g2.html], 2), ...sec },
      { html: diag.length ? grade([g3.html], 1) : '', ...secT },
      { html: grade([tabela('Pastos com mais alertas', 'Top 10 do ano', colsLocal('Pasto'), local(d.por_pasto)), tabela('Lotes com mais alertas', 'Top 10 do ano', colsLocal('Lote'), local(d.por_lote))], 2), ...secT },
    ],
  })
}
