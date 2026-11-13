// Renderers anuais dos estoques da fase 2C: Almoxarifado, Farmácia e Cantina. As três RPCs têm o mesmo
// formato (get_infografico_anual_<x>: fluxos em R$ por mês, valor em estoque de hoje, itens em alerta,
// ranking de consumo e curva ABC), então há um único molde e só mudam rótulos e notas.

import { comparador, concentracao, mesForaDoPadrao, serieAnterior, variacaoForte } from './analise.js'
import { MESES, atencao, colunas, fmt, fmtInt, fmtMoeda, kpisAnuais, plural, ranking, reguaAnual, renderSecaoAnual, rodape, serie, tendencias } from './comum.js'

const nomeMes = (m) => (m ? MESES[Number(m) - 1] : '—')
const L = (casas = 0) => (v) => (casas ? fmt(v, casas) : fmtInt(v))

function pico(mensal, campo) {
  return (mensal || []).reduce((a, m) => (Number(m?.[campo]) > Number(a?.[campo] ?? 0) ? m : a), null)
}

const CONFIG = {
  almoxarifado: {
    titulo: 'Almoxarifado',
    consumo: 'Consumo líquido',
    consumoNota: 'Consumo líquido = retiradas (baixas e estornos) menos devoluções aprovadas, em R$ ao custo do movimento, com piso em zero por item.',
    entidade: 'itens',
  },
  farmacia: {
    titulo: 'Farmácia',
    consumo: 'Consumo',
    consumoNota: 'Consumo = baixas e estornos de medicamentos e vacinas com controle de estoque, em R$ ao custo do movimento.',
    entidade: 'medicamentos',
  },
  estoque: {
    titulo: 'Estoque de Insumos',
    consumo: 'Consumo',
    consumoNota: 'Consumo = baixas e consumos de insumos e formulações, em R$ ao custo do movimento (ou ao custo atual do item quando o movimento não traz custo). Entradas = compras; formulações fabricadas aparecem separadas, como produção.',
    entidade: 'itens',
  },
  cantina: {
    titulo: 'Cantina',
    consumo: 'Consumo',
    consumoNota: 'Consumo = baixas e estornos dos itens da cozinha com controle de estoque, em R$ ao custo do movimento. O custo por refeição é o consumo de estoque dividido pelas refeições servidas no mesmo período.',
    entidade: 'itens',
  },
}

export function resumoEstoque(secao) {
  const c = CONFIG[secao]
  return (d) => {
    const k = d.kpis || {}
    const consumo = serie(d.mensal, 'consumo_valor', d.ultimo_mes)
    return {
      titulo: c.titulo,
      valor: fmtMoeda(k.consumo_valor),
      rotulo: 'de consumo no ano',
      linhas: [`Entradas: ${fmtMoeda(k.entradas_valor)}`, `Em estoque: ${fmtMoeda(k.valor_estoque)}`],
      serie: consumo,
      anteriores: serieAnterior(d, 'consumo_valor'),
      delta: comparador(secao, d).delta('consumo'),
      tom: 'dourado',
      calendario: { rotulo: `${c.titulo} · movimentos`, valores: serie(d.mensal, 'movimentos', d.ultimo_mes), formato: L(0), tom: 'dourado' },
    }
  }
}

export function renderEstoqueAnual(secao) {
  const c = CONFIG[secao]
  return async (d) => {
    const k = d.kpis || {}
    const ult = d.ultimo_mes
    const vis = { sec: 'Visão do ano' }
    const consumo = serie(d.mensal, 'consumo_valor', ult)
    const entradas = serie(d.mensal, 'entradas_valor', ult)
    const mPico = pico(d.mensal, 'consumo_valor')
    const cmp = comparador(secao, d)
    const itens = (d.por_item || []).map((i) => ({ rotulo: i.label, valor: i.consumo_valor, texto: fmtMoeda(i.consumo_valor), extra: `${fmt(i.consumo_qtd, 1)} ${i.unidade ?? ''}`.trim() }))
    const classif = (d.por_classificacao || []).map((i) => ({ rotulo: i.label, valor: i.valor, texto: fmtMoeda(i.valor), extra: plural(i.itens, 'item', 'itens') }))
    const alerta = (d.em_alerta || []).map((i) => ({
      rotulo: i.label,
      valor: Math.max(Number(i.minimo) - Number(i.saldo), 0) || 0.0001,
      texto: `${fmt(i.saldo, 1)} / ${fmt(i.minimo, 1)}`,
      extra: i.unidade ?? '',
    }))
    const nomesAlerta = (d.em_alerta || []).slice(0, 3).map((i) => i.label).join(', ')

    const extraBlocos = []
    if (secao === 'estoque') {
      const origemNome = { saida_insumos: 'Produção de formulações', suplementacao: 'Suplementação', fabrica_confinamento: 'Fábrica do confinamento' }
      extraBlocos.push({
        html: colunas([
          ranking('Consumo por origem', 'R$ no ano', (d.por_origem || []).map((o) => ({ rotulo: origemNome[o.label] ?? o.label, valor: o.valor, texto: fmtMoeda(o.valor) })), { tom: 'dourado' }),
          ranking(
            'Insumos × formulações',
            'Consumo no ano · valor em estoque',
            [
              { rotulo: 'Insumos', valor: k.consumo_valor_insumos, texto: fmtMoeda(k.consumo_valor_insumos), extra: `estoque ${fmtMoeda(k.valor_estoque_insumos)}` },
              { rotulo: 'Formulações', valor: k.consumo_valor_formulacoes, texto: fmtMoeda(k.consumo_valor_formulacoes), extra: `estoque ${fmtMoeda(k.valor_estoque_formulacoes)}` },
            ],
            { tom: 'azul' },
          ),
        ]),
        ...vis,
      })
    }
    if (d.refeicoes) {
      const rf = d.refeicoes
      const rk = rf.kpis || {}
      extraBlocos.push(
        {
          html: kpisAnuais(
            { rotulo: 'Refeições servidas', valor: fmtInt(rk.refeicoes), contexto: `Café ${fmtInt(rk.cafe_manha)} · lanche ${fmtInt(rk.lanches)} · almoço ${fmtInt(rk.almocos)} · jantar ${fmtInt(rk.jantares)}` },
            [
              { rotulo: 'Custo por refeição', valor: rk.custo_por_refeicao != null ? fmtMoeda(rk.custo_por_refeicao) : '—', contexto: 'Consumo de estoque dividido pelas refeições do ano', tom: 'dourado' },
              { rotulo: 'Marmitas', valor: fmtInt(rk.marmitas), contexto: fmtMoeda(rk.marmitas_valor), tom: 'azul' },
              { rotulo: 'Pratos feitos', valor: fmtInt(rk.pratos_feitos), contexto: fmtMoeda(rk.pratos_feitos_valor), tom: 'azul' },
            ],
          ),
          ...vis,
        },
        {
          html: reguaAnual(
            'Refeições mês a mês',
            'Registros da cozinha (cantina, marmita e prato feito)',
            [
              { rotulo: 'Refeições servidas', valores: serie(rf.mensal, 'refeicoes', ult), ano: fmtInt(rk.refeicoes), formato: L(0) },
              { rotulo: 'Custo por refeição (R$)', valores: serie(rf.mensal, 'custo_por_refeicao', ult), ano: rk.custo_por_refeicao != null ? fmt(rk.custo_por_refeicao, 2) : '—', formato: L(2), tom: 'dourado', semCor: true },
              { rotulo: 'Marmitas', valores: serie(rf.mensal, 'marmitas', ult), ano: fmtInt(rk.marmitas), formato: L(0), tom: 'azul' },
              { rotulo: 'Pratos feitos', valores: serie(rf.mensal, 'pratos_feitos', ult), ano: fmtInt(rk.pratos_feitos), formato: L(0), tom: 'azul' },
            ],
            ult,
          ),
          ...vis,
        },
      )
    }
    const prodLinha = Number(k.producao_valor) > 0 ? [{ rotulo: 'Produção de formulações (R$)', valores: serie(d.mensal, 'producao_valor', ult), ano: fmtMoeda(k.producao_valor).replace('R$ ', ''), formato: L(0), tom: 'verde' }] : []

    const regua = reguaAnual(
      'Mês a mês',
      'Valores em R$ ao custo de cada movimento',
      [
        { rotulo: 'Entradas (R$)', valores: entradas, ano: fmtMoeda(k.entradas_valor).replace('R$ ', ''), formato: L(0), tom: 'azul' },
        ...prodLinha,
        { rotulo: `${c.consumo} (R$)`, valores: consumo, ano: fmtMoeda(k.consumo_valor).replace('R$ ', ''), formato: L(0), tom: 'dourado' },
        { rotulo: 'Movimentos', valores: serie(d.mensal, 'movimentos', ult), ano: fmtInt(k.movimentos), formato: L(0), semCor: true },
      ],
      ult,
    )

    const notas = [
      c.consumoNota,
      'Valor em estoque = saldo atual (nunca negativo) x custo médio atual, posição de hoje. O saldo inicial e final do período por item está no relatório mensal.',
      'Ajustes de saldo não contam como entrada nem como consumo.',
      secao === 'estoque' ? 'O insumo usado para produzir uma formulação conta no consumo do insumo, e a formulação é consumida depois na suplementação: o mesmo valor aparece nas duas pontas (veja o consumo por origem). Itens em alerta incluem os de saldo negativo, que o relatório mensal conta à parte.' : null,
      Number(k.sem_custo) > 0 ? `${plural(k.sem_custo, 'item tem', 'itens têm')} saldo sem custo cadastrado e entra no estoque com R$ 0,00.` : null,
    ]

    return renderSecaoAnual({
      titulo: c.titulo,
      dados: d,
      ...d.__marca,
      blocos: [
        {
          html: kpisAnuais(
            { rotulo: `${c.consumo} no ano`, valor: fmtMoeda(k.consumo_valor), delta: cmp.delta('consumo'), contexto: `${plural(k.itens_com_consumo, 'item com consumo', 'itens com consumo')}${mPico ? ` · pico em ${nomeMes(mPico.mes)} (${fmtMoeda(mPico.consumo_valor)})` : ''}` },
            [
              { rotulo: 'Entradas no ano', valor: fmtMoeda(k.entradas_valor), delta: cmp.delta('entradas'), contexto: Number(k.devolucoes_valor) > 0 ? `Devoluções ao estoque: ${fmtMoeda(k.devolucoes_valor)}` : Number(k.producao_valor) > 0 ? `Compras · produção de formulações: ${fmtMoeda(k.producao_valor)}` : `${plural(k.movimentos, 'movimento', 'movimentos')} no ano`, tom: 'azul' },
              { rotulo: 'Valor em estoque hoje', valor: fmtMoeda(k.valor_estoque), contexto: `${plural(k.itens, 'item controlado', 'itens controlados')}${Number(k.sem_custo) > 0 ? ` · ${fmtInt(k.sem_custo)} sem custo` : ''}` },
              { rotulo: 'Itens em alerta', valor: fmtInt(k.em_alerta), contexto: Number(k.em_alerta) > 0 ? `${fmtInt(k.negativos)} com saldo negativo · abaixo ou no mínimo` : 'Nenhum abaixo do mínimo', tom: Number(k.em_alerta) > 0 ? 'vermelho' : undefined },
            ],
          ),
          ...vis,
        },
        {
          html: tendencias(
            [
              { titulo: `${c.consumo} (R$)`, total: fmtMoeda(k.consumo_valor), valores: consumo, anteriores: serieAnterior(d, 'consumo_valor'), tom: 'dourado' },
              { titulo: 'Entradas (R$)', total: fmtMoeda(k.entradas_valor), valores: entradas, anteriores: serieAnterior(d, 'entradas_valor'), tom: 'azul' },
            ],
            ult,
            cmp.anoAnterior,
          ),
          ...vis,
        },
        {
          html: atencao([
            Number(k.em_alerta) > 0 ? `${plural(k.em_alerta, 'item em alerta', 'itens em alerta')} de estoque${nomesAlerta ? `: ${nomesAlerta}${Number(k.em_alerta) > 3 ? ' e outros' : ''}` : ''}.` : null,
            variacaoForte(cmp, 'consumo'),
            concentracao(itens, k.consumo_valor, { oque: 'do consumo do ano' }),
            Number(k.itens_com_consumo) >= 5 ? `${fmtInt(k.itens_80pct)} de ${plural(k.itens_com_consumo, 'item', 'itens')} com consumo respondem por 80% do valor consumido (curva ABC).` : null,
            mesForaDoPadrao(consumo, { nome: 'consumo', formato: fmtMoeda }),
          ]),
          ...vis,
        },
        { html: regua, ...vis },
        {
          html: colunas(
            [
              ranking('Itens que mais consumiram', 'R$ no ano · quantidade', itens, { tom: 'dourado' }),
              ranking('Consumo por classificação', 'R$ no ano · itens', classif, { tom: 'azul' }),
              ranking('Itens em alerta', 'Saldo / mínimo', alerta, { tom: 'vermelho' }),
            ],
            '1.4fr 1fr 1fr',
          ),
          ...vis,
        },
        ...extraBlocos,
        { html: rodape(notas), ...vis },
      ],
    })
  }
}

export const renderAlmoxarifadoAnual = renderEstoqueAnual('almoxarifado')
export const renderFarmaciaAnual = renderEstoqueAnual('farmacia')
export const renderCantinaAnual = renderEstoqueAnual('cantina')
export const resumoAlmoxarifado = resumoEstoque('almoxarifado')
export const resumoFarmacia = resumoEstoque('farmacia')
export const resumoCantina = resumoEstoque('cantina')
export const renderEstoqueInsumosAnual = renderEstoqueAnual('estoque')
export const resumoEstoqueInsumos = resumoEstoque('estoque')
