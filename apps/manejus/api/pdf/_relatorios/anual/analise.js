// Camadas de análise do Infográfico Anual:
//   1. Veredito — métricas comparáveis do ano contra o ano anterior NO MESMO PERÍODO (jan até o
//      último mês do ano atual), calculadas do mesmo jeito nos dois anos a partir das séries mensais.
//   3. Exceções — frases geradas por regra: mês fora do padrão, concentração, lacuna de lançamento,
//      variação forte contra o ano anterior.
// A camada 2 (tendência) usa serieAnterior() para desenhar o ano anterior atrás das barras.

import { MESES, fmt, fmtInt, fmtMoeda, num, variacao } from './comum.js'

const somaMeses = (mensal, campo, ult) =>
  (mensal || []).filter((m) => Number(m.mes) <= ult).reduce((s, m) => s + (Number(typeof campo === 'function' ? campo(m) : m?.[campo]) || 0), 0)

const razao = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : null)

// Métricas comparáveis por seção: { chave: { valor(mensal, ult), bom, rotulo, formato, absoluta? } }
export const COMPARAVEIS = {
  combustivel: {
    litros: { rotulo: 'litros abastecidos', bom: 'neutro', valor: (m, u) => somaMeses(m, 'litros', u), formato: (v) => `${fmtInt(v)} L` },
    abastecimentos: { rotulo: 'abastecimentos', bom: 'neutro', valor: (m, u) => somaMeses(m, 'abastecimentos', u), formato: fmtInt },
    entradas: { rotulo: 'litros comprados', bom: 'neutro', valor: (m, u) => somaMeses(m, 'entradas_l', u), formato: (v) => `${fmtInt(v)} L` },
  },
  consumo: {
    custo: { rotulo: 'custo alimentar', bom: 'neutro', valor: (m, u) => somaMeses(m, 'custo_total', u), formato: fmtMoeda },
    ms_t: { rotulo: 'MS fornecida', bom: 'neutro', valor: (m, u) => somaMeses(m, 'ms_total_kg', u) / 1000, formato: (v) => `${fmt(v, 1)} t` },
    cab_dias: { rotulo: 'cabeça-dias tratadas', bom: 'neutro', valor: (m, u) => somaMeses(m, 'cab_dias', u), formato: fmtInt },
    ms_cab: { rotulo: 'kg MS/cab/dia', bom: 'neutro', valor: (m, u) => razao(somaMeses(m, 'ms_total_kg', u), somaMeses(m, 'cab_dias', u)), formato: (v) => fmt(v, 2) },
    custo_cab: { rotulo: 'custo por cabeça/dia', bom: 'baixo', valor: (m, u) => razao(somaMeses(m, 'custo_total', u), somaMeses(m, 'cab_dias', u)), formato: fmtMoeda },
  },
  clima: {
    mm: { rotulo: 'chuva', bom: 'neutro', valor: (m, u) => somaMeses(m, 'mm_fazenda', u), formato: (v) => `${fmt(v, 0)} mm` },
    dias: { rotulo: 'dias com chuva', bom: 'neutro', valor: (m, u) => somaMeses(m, 'dias_chuva', u), formato: fmtInt },
  },
  morte: {
    mortes: { rotulo: 'mortes', bom: 'baixo', valor: (m, u) => somaMeses(m, 'mortes', u), formato: fmtInt },
    taxa: {
      rotulo: 'taxa de mortalidade',
      bom: 'baixo',
      absoluta: true,
      valor: (m, u) => {
        const meses = (m || []).filter((x) => Number(x.mes) <= u && Number(x.rebanho) > 0)
        const reb = meses.length ? meses.reduce((s, x) => s + Number(x.rebanho), 0) / meses.length : 0
        return reb > 0 ? (somaMeses(m, 'mortes', u) / reb) * 100 : null
      },
      formato: (v) => `${fmt(v, 2)}%`,
    },
    perda: { rotulo: 'perda estimada', bom: 'baixo', valor: (m, u) => somaMeses(m, 'perda', u), formato: fmtMoeda },
  },
  rodeio: {
    rodeios: { rotulo: 'rodeios', bom: 'alto', valor: (m, u) => somaMeses(m, 'rodeios', u), formato: fmtInt },
    alertas: { rotulo: 'alertas', bom: 'baixo', valor: (m, u) => somaMeses(m, (x) => (Number(x.alertas_sanitarios) || 0) + (Number(x.pendencias_infra) || 0), u), formato: fmtInt },
    escore: {
      rotulo: 'escore médio do gado',
      bom: 'alto',
      absoluta: true,
      unidade: 'pt',
      casas: 1,
      valor: (m, u) => razao(somaMeses(m, (x) => (num(x.escore_gado) ?? 0) * (Number(x.rodeios) || 0), u), somaMeses(m, (x) => (x.escore_gado != null ? Number(x.rodeios) || 0 : 0), u)),
      formato: (v) => fmt(v, 1),
    },
  },
}

/**
 * Comparador de uma seção. Sem dados do ano anterior (RPC falhou ou ano < 2021), delta() devolve
 * null e o KPI fica sem selo; com ano anterior zerado, devolve "sem base em AAAA".
 */
export function comparador(secao, d) {
  const defs = COMPARAVEIS[secao] || {}
  const ult = Number(d.ultimo_mes) || 12
  const ant = d.__anterior
  const anoAnt = Number(d.ano) - 1
  const atual = (chave) => defs[chave]?.valor(d.mensal, ult) ?? null
  const anterior = (chave) => (ant ? defs[chave]?.valor(ant.mensal, ult) ?? null : null)
  return {
    temAnterior: Boolean(ant),
    anoAnterior: anoAnt,
    atual,
    anterior,
    delta(chave) {
      if (!ant || !defs[chave]) return null
      return variacao(atual(chave), anterior(chave), { bom: defs[chave].bom, anoAnterior: anoAnt, absoluta: defs[chave].absoluta, unidade: defs[chave].unidade, casas: defs[chave].casas })
    },
    /** Variação relativa (fração) para as regras de exceção; null sem base. */
    relativa(chave) {
      const a = num(atual(chave))
      const b = num(anterior(chave))
      if (a == null || b == null || b === 0) return null
      return (a - b) / Math.abs(b)
    },
    rotulo: (chave) => defs[chave]?.rotulo ?? chave,
  }
}

/** Série mensal do ano anterior (12 meses) para desenhar atrás das barras. */
export function serieAnterior(d, campo) {
  if (!d.__anterior) return null
  const porMes = new Map((d.__anterior.mensal || []).map((m) => [Number(m.mes), m]))
  return Array.from({ length: 12 }, (_, i) => {
    const m = porMes.get(i + 1)
    return num(typeof campo === 'function' ? campo(m) : m?.[campo]) ?? 0
  })
}

// ─────────────── Regras de exceção ───────────────

function mediana(xs) {
  const v = [...xs].sort((a, b) => a - b)
  const n = v.length
  return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0
}

/** Mês acima de 2× a mediana dos meses com registro (exige 3+ meses com valor). */
export function mesForaDoPadrao(valores, { nome, formato = fmtInt } = {}) {
  const com = valores.map((v, i) => ({ v: Number(v) || 0, i })).filter((x) => x.v > 0)
  if (com.length < 3) return null
  const med = mediana(com.map((x) => x.v))
  const fora = com.filter((x) => x.v > 2 * med).sort((a, b) => b.v - a.v)[0]
  if (!fora || med <= 0) return null
  return `${MESES[fora.i]} concentrou ${formato(fora.v)} de ${nome}, ${fmt(fora.v / med, 1)}× a mediana dos meses com registro.`
}

/** Um item responde por metade ou mais do total (exige 2+ itens). */
export function concentracao(itens, total, { oque, minimo = 0.5 } = {}) {
  const lista = (itens || []).filter((i) => Number(i.valor) > 0)
  if (lista.length < 2 || !(Number(total) > 0)) return null
  const top = [...lista].sort((a, b) => Number(b.valor) - Number(a.valor))[0]
  const share = Number(top.valor) / Number(total)
  if (share < minimo) return null
  return `${top.rotulo} responde por ${fmt(share * 100, 0)}% ${oque}.`
}

/** Meses sem lançamento numa caderneta que teve uso no ano (3+ meses vazios). */
export function lacuna(valores, ult, { oque } = {}) {
  const vals = valores.slice(0, ult)
  const com = vals.filter((v) => Number(v) > 0).length
  const sem = ult - com
  if (com === 0 || sem < 3) return null
  return `Sem ${oque} em ${sem} de ${ult} meses: confira se é ausência do evento ou falta de lançamento.`
}

/** Variação de 30% ou mais contra o mesmo período do ano anterior. */
export function variacaoForte(cmp, chave, { limite = 0.3 } = {}) {
  const r = cmp.relativa(chave)
  if (r == null || Math.abs(r) < limite) return null
  return `${cmp.rotulo(chave).replace(/^./, (c) => c.toUpperCase())} ${fmt(Math.abs(r) * 100, 0)}% ${r > 0 ? 'acima' : 'abaixo'} do mesmo período de ${cmp.anoAnterior}.`
}
