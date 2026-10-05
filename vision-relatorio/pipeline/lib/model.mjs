// Modelo canônico do relatório Vision'Up.
// Contrato: buildModel(sheets, params) → JSON com tudo que as 17 páginas precisam.
// O adaptador (hoje XLSM, amanhã Supabase) é a única peça que muda.
import { toDate, toNum, toStr, inPeriod } from './core.mjs';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const round = (v) => Math.round(v);
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
// chave de ordenação de faixa etária: "0 a 4 meses"→0, "Acima 36 meses"→36+
const faixaEtariaKey = (cat) => {
  const m = String(cat).match(/(\d+)/);
  return m ? Number(m[1]) + (/acima|>/i.test(cat) ? 0.5 : 0) : 999;
};
const avg = (arr, f) => arr.length ? sum(arr, f) / arr.length : 0;
// Nome da contraparte num grupo de lotes: 'Vários' só quando há nomes
// diferentes preenchidos; o próprio nome quando todos iguais; '' em branco.
const nomeOuVarios = (g, get) => {
  const nomes = new Set(g.map(get).filter(Boolean));
  return nomes.size > 1 ? 'Vários' : [...nomes][0] || '';
};
const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

// ---------- leitura das abas ----------

function readCadastros(rows) {
  // Q17 = Área Útil (ha); cast Int64 do modelo → trunca
  const area = toNum(rows?.[16]?.[16]);
  const categorias = [];
  for (let r = 7; r <= 16; r++) {
    const c = toStr(rows?.[r]?.[1]);
    if (c) categorias.push(c);
  }
  return { areaHa: Math.trunc(area), categorias };
}

function readEstoque(rows) {
  // Blocos mensais de 11 linhas: 10 categorias + "Total do Rebanho". Col A = data fim do mês.
  const blocos = new Map(); // "2026-08" -> { linhas: [...], total: {...} }
  for (const r of rows) {
    const d = toDate(r?.[0]);
    const desc = toStr(r?.[5]);
    if (!d || !desc) continue;
    const key = ym(d);
    const linha = {
      descricao: desc,
      saldoIni: toNum(r[6]), atIni: toNum(r[10]), valorAtIni: toNum(r[11]), valorIni: toNum(r[12]),
      compras: toNum(r[13]), vendas: toNum(r[14]), mortes: toNum(r[15]), consumo: toNum(r[16]),
      nasc: toNum(r[17]), transfE: toNum(r[18]), transfS: toNum(r[19]), evolS: toNum(r[20]), evolE: toNum(r[21]),
      saldoFim: toNum(r[22]), pesoKg: toNum(r[23]), rendCarc: toNum(r[24]),
      at: toNum(r[26]), valorAt: toNum(r[27]), valorTotal: toNum(r[28]),
    };
    if (!blocos.has(key)) blocos.set(key, { linhas: [], total: null });
    if (/total/i.test(desc)) blocos.get(key).total = linha;
    else blocos.get(key).linhas.push(linha);
  }
  return blocos;
}

function readDiarias(rows) {
  // B=data, H=Saldo Diário Final. Linhas projetadas até 2029 — filtrar por período sempre.
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[1]);
    if (!d) continue;
    out.push({ data: d, saldoFinal: toNum(r[7]) });
  }
  return out;
}

function readDiariasCategoria(rows) {
  // D=data, E=categoria, F=SI, G..O=eventos, P=SF
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[3]);
    const cat = toStr(r?.[4]);
    if (!d || !cat) continue;
    out.push({
      data: d, categoria: cat,
      si: toNum(r[5]), compras: toNum(r[6]), vendas: toNum(r[7]), mortes: toNum(r[8]),
      consumo: toNum(r[9]), nasc: toNum(r[10]), transfE: toNum(r[11]), transfS: toNum(r[12]),
      evolS: toNum(r[13]), evolE: toNum(r[14]), sf: toNum(r[15]),
    });
  }
  return out;
}

function readCompras(rows) {
  // B=data compra, F=tipo, G=cab, H=categoria, I=fornecedor, L=pesoKg, M=pesoMedio,
  // N=rendCarc, O=peso@, P=total@, T=totalCompra, U=R$/cab, V=R$/@, W=R$/kg, X=R$@BoiGordo
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[1]);
    const cab = toNum(r?.[6]);
    if (!d || !cab) continue;
    const pesoKg = toNum(r[11]);
    const pesoMedio = toNum(r[12]) || (cab ? pesoKg / cab : 0);
    const rendCarc = toNum(r[13]);
    const pesoAt = toNum(r[14]) || (pesoMedio * rendCarc / 15);
    const at = toNum(r[15]) || pesoAt * cab;
    out.push({
      data: d, tipo: toStr(r[5]), cab, categoria: toStr(r[7]), fornecedor: toStr(r[8]),
      status: toStr(r[3]), destino: toStr(r[9]),
      pesoKg, pesoMedio, rendCarc, at,
      total: toNum(r[19]), rsCab: toNum(r[20]), rsAt: toNum(r[21]), rsKg: toNum(r[22]),
      rsBoiGordo: toNum(r[23]),
    });
  }
  return out;
}

function readVendas(rows) {
  // D=data, H=tipo, I=cab, J=categoria, K=sexo, W=pesoKgFinal, AD=rendCarc,
  // AF=@abatidas, AJ=comprador, AN=valorLiq, AO=R$/@, AP=R$/cab, AQ=R$/kgPV
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[3]);
    const cab = toNum(r?.[8]);
    if (!d || !cab) continue;
    out.push({
      data: d, tipo: toStr(r[7]), cab, categoria: toStr(r[9]), sexo: toStr(r[10]),
      kgFinal: toNum(r[22]), rendCarc: toNum(r[29]), atAbatidas: toNum(r[31]),
      comprador: toStr(r[35]), valorLiq: toNum(r[39]), rsAt: toNum(r[40]),
      rsCab: toNum(r[41]), rsKgPV: toNum(r[42]),
    });
  }
  return out;
}

function readMortesConsumos(rows) {
  // B=data, E=categoria, K=@, M=R$, P=flag, Q=causa, R=local
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[1]);
    const flag = toStr(r?.[15]);
    if (!d || !flag) continue;
    out.push({
      data: d, categoria: toStr(r[4]), at: toNum(r[10]), valor: toNum(r[12]),
      tipo: flag, causa: toStr(r[16]), local: toStr(r[17]),
    });
  }
  return out;
}

function readNascimentos(rows) {
  // B=data, C=quant, D=pesoNasc, G=categoria, H=sexo, I=raça
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[1]);
    const q = toNum(r?.[2]);
    if (!d || !q) continue;
    out.push({
      data: d, quant: q, pesoNasc: toNum(r[3]),
      categoria: toStr(r[6]), sexo: toStr(r[7]), raca: toStr(r[8]),
    });
  }
  return out;
}

function readDesembolsos(rows) {
  // C=dataPag, D=status, F=tipo, G=plano, H=centroCusto, I=item, N=valor
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[2]);
    const tipo = toStr(r?.[5]);
    const valor = toNum(r?.[13]);
    if (!d || !tipo) continue;
    out.push({
      data: d, status: toStr(r[3]), tipo, plano: toStr(r[6]),
      centroCusto: toStr(r[7]), item: toStr(r[8]), valor,
    });
  }
  return out;
}

function readReceitas(rows) {
  // C=data, D=status, F=classificacao, G=plano(descricao), J=empresa, P=valorLiq
  const out = [];
  for (const r of rows) {
    const d = toDate(r?.[2]);
    const valor = toNum(r?.[15]);
    if (!d) continue;
    out.push({
      data: d, status: toStr(r[3]), classificacao: toStr(r[5]), plano: toStr(r[6]),
      empresa: toStr(r[9]), valorLiq: valor,
    });
  }
  return out;
}

// ---------- modelo ----------

// Linhas pré-lidas das abas (saída dos read*). É o payload do relatório
// interativo: serializável, sem datas cruas de planilha nem colunas inúteis.
export function extractReads(sheets) {
  return {
    cad: readCadastros(sheets['Cadastros'] || []),
    estoque: Object.fromEntries(readEstoque(sheets['Estoque'] || [])),
    diarias: readDiarias(sheets['Diárias'] || []),
    diariasCat: readDiariasCategoria(sheets['Diárias_Categoria'] || []),
    comprasAll: readCompras(sheets['Compra_Gado'] || []),
    vendasAll: readVendas(sheets['Venda_Gado'] || []),
    mortesAll: readMortesConsumos(sheets['Mortes_Consumos'] || []),
    nascAll: readNascimentos(sheets['Nascimentos'] || []),
    desembAll: readDesembolsos(sheets['Desembolsos Realizados'] || []),
    receitasAll: readReceitas(sheets['Receitas_Mensais'] || []),
  };
}

export function buildModel(sheets, params = {}) {
  return buildModelFromReads(extractReads(sheets), params);
}

export function buildModelFromReads(reads, { ini, fim, saldoCaixaInicial = 0, anoBaseGiro = 2025 } = {}) {
  const { cad, diarias, diariasCat, comprasAll, vendasAll, mortesAll, nascAll, desembAll, receitasAll } = reads;
  const estoque = reads.estoque instanceof Map ? reads.estoque : new Map(Object.entries(reads.estoque || {}));

  const compras = comprasAll.filter(x => inPeriod(x.data, ini, fim));
  const vendas = vendasAll.filter(x => inPeriod(x.data, ini, fim));
  const vendasAbate = vendas.filter(x => /^abate/i.test(x.tipo));
  const vendasVivo = vendas.filter(x => /vivo/i.test(x.tipo));
  const mortes = mortesAll.filter(x => inPeriod(x.data, ini, fim) && /^morte/i.test(x.tipo));
  const consumos = mortesAll.filter(x => inPeriod(x.data, ini, fim) && /^consumo/i.test(x.tipo));
  const nasc = nascAll.filter(x => inPeriod(x.data, ini, fim));
  const desemb = desembAll.filter(x => inPeriod(x.data, ini, fim) && x.status !== 'Em Aberto');
  const receitas = receitasAll.filter(x => inPeriod(x.data, ini, fim) && x.status !== 'Em Aberto');

  // meses do período (labels "2026-01"...)
  const meses = [];
  {
    const c = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), 1));
    while (c <= fim) { meses.push(ym(c)); c.setUTCMonth(c.getUTCMonth() + 1); }
  }
  const nMeses = meses.length;
  const nDias = Math.round((fim - ini) / 86400000) + 1;

  // Diárias no período (a aba projeta até 2029 — cortar)
  const diariasPeriodo = diarias.filter(x => inPeriod(x.data, ini, fim));
  const animalDias = sum(diariasPeriodo, x => x.saldoFinal);
  const rebanhoMedio = animalDias / nDias;
  const rebMedioPorMes = new Map();
  for (const [k, g] of groupBy(diariasPeriodo, x => ym(x.data))) {
    rebMedioPorMes.set(k, avg(g, x => x.saldoFinal));
  }

  // ---------- p.2 Estoque (jan do ano de ini × mês de fim) ----------
  // Meses futuros têm saldo zerado por guarda da planilha (A>TODAY()); usar o
  // último bloco do período com saldo real como "mês de referência".
  const keyJan = `${ini.getUTCFullYear()}-01`;
  let keyFim = ym(fim);
  // Preferência: último bloco com avaliação completa (saldo e valor preenchidos —
  // meses projetados da Aruã têm cabeças mas inputs X/AB vazios, zerando @ e R$).
  // Fallback: último bloco com saldo.
  let keyFimSaldo = null;
  for (let i = meses.length - 1; i >= 0; i--) {
    const b = estoque.get(meses[i]);
    if (!b) continue;
    const saldo = b.total?.saldoFim || sum(b.linhas, l => l.saldoFim);
    if (saldo <= 0) continue;
    if (keyFimSaldo == null) keyFimSaldo = meses[i];
    if (sum(b.linhas, l => l.valorTotal) > 0) { keyFim = meses[i]; break; }
  }
  if (!estoque.get(keyFim) || (estoque.get(keyFim).total?.saldoFim || sum(estoque.get(keyFim).linhas, l => l.saldoFim)) <= 0) {
    keyFim = keyFimSaldo ?? keyFim;
  }
  const blocoJan = estoque.get(keyJan) || { linhas: [], total: null };
  const blocoFim = estoque.get(keyFim) || { linhas: [], total: null };

  const estoquePage = {
    mesIni: keyJan, mesFim: keyFim,
    inicial: blocoJan.linhas.map(l => ({
      descricao: l.descricao, cab: l.saldoIni, at: l.atIni, valorAt: l.valorAtIni, valor: l.valorIni,
    })),
    final: blocoFim.linhas.map(l => ({
      descricao: l.descricao, cab: l.saldoFim, at: l.at, valorAt: l.valorAt, valor: l.valorTotal,
    })),
  };
  const totIni = { cab: sum(estoquePage.inicial, x => x.cab), at: sum(estoquePage.inicial, x => x.at), valor: sum(estoquePage.inicial, x => x.valor) };
  totIni.valorAt = totIni.at ? totIni.valor / totIni.at : 0;
  const totFim = { cab: sum(estoquePage.final, x => x.cab), at: sum(estoquePage.final, x => x.at), valor: sum(estoquePage.final, x => x.valor) };
  totFim.valorAt = totFim.at ? totFim.valor / totFim.at : 0;
  estoquePage.totais = { inicial: totIni, final: totFim };

  // ---------- p.3 Rebanho período ----------
  const dcPeriodo = diariasCat.filter(x => inPeriod(x.data, ini, fim));
  const dcPorCat = groupBy(dcPeriodo, x => x.categoria);
  const matriz = [];
  for (const cat of cad.categorias) {
    const g = (dcPorCat.get(cat) || []).sort((a, b) => a.data - b.data);
    const first = g[0], last = g[g.length - 1];
    matriz.push({
      categoria: cat,
      si: first ? first.si : 0,
      compras: sum(g, x => x.compras), vendas: sum(g, x => x.vendas),
      mortes: sum(g, x => x.mortes), consumo: sum(g, x => x.consumo),
      nasc: sum(g, x => x.nasc), transfE: sum(g, x => x.transfE), transfS: sum(g, x => x.transfS),
      evolS: sum(g, x => x.evolS), evolE: sum(g, x => x.evolE),
      sf: last ? last.sf : 0,
    });
  }
  // Mapa de pesos de referência: último bloco ≤ fim com pesos preenchidos
  // (inputs manuais; a Aruã deixa blocos tardios sem peso).
  let blocoPesos = blocoFim;
  for (let i = meses.length - 1; i >= 0; i--) {
    const b = estoque.get(meses[i]);
    if (b && sum(b.linhas, l => l.pesoKg) > 0) { blocoPesos = b; break; }
  }
  const pesoPorCat = new Map(blocoPesos.linhas.map(l => [l.descricao, l.pesoKg]));

  // UA diário por mês via Diárias_Categoria (fallback para meses sem bloco Estoque)
  const dcPorMesDia = new Map();
  for (const r of dcPeriodo) {
    const k = ym(r.data);
    if (!dcPorMesDia.has(k)) dcPorMesDia.set(k, new Map());
    const dia = dcPorMesDia.get(k);
    dia.set(r.data.getTime(), (dia.get(r.data.getTime()) || 0) + r.sf * (pesoPorCat.get(r.categoria) || 0) / 450);
  }

  // UA/ha por mês via DAX real: Σ_categoria(Estoque!SF × pesoVivo kg ÷ 450) ÷ área.
  // Meses sem bloco Estoque (projeção) caem para a média diária de Diárias_Categoria.
  const mesesComDados = meses.filter(k => k <= (keyFimSaldo ?? keyFim));
  const uahaPorMes = mesesComDados.map(k => {
    const bloco = estoque.get(k);
    let ua = 0;
    if (bloco) {
      ua = sum(bloco.linhas, l => l.saldoFim * (l.pesoKg || pesoPorCat.get(l.descricao) || 0) / 450);
    } else {
      const dias = dcPorMesDia.get(k);
      if (dias) ua = avg([...dias.values()]);
    }
    return { mes: k, uaha: ua / cad.areaHa, rebMedio: rebMedioPorMes.get(k) || 0 };
  });
  const uahaMedia = avg(uahaPorMes, x => x.uaha);
  const pesoVivoMedioRef = avg(blocoPesos.linhas, l => l.pesoKg);
  const rebanhoPage = {
    matriz,
    saldoFinal: sum(matriz, x => x.sf),
    pesoVivoMedio: pesoVivoMedioRef,
    uahaMedia,
    serieMensal: uahaPorMes.map(x => ({ mes: x.mes, rebanhoMedio: x.rebMedio, uaha: x.uaha })),
  };

  // ---------- p.4/p.5 Compras ----------
  // p.4 conta somente compras de fato (exclui transferências de entrada);
  // o pivot da p.5 continua com todas as linhas (separa por tipo)
  const comprasSo = compras.filter(x => !/^tran(s)?f/i.test(x.tipo));
  const comprasPage = {
    cab: sum(comprasSo, x => x.cab),
    total: sum(comprasSo, x => x.total),
    at: sum(comprasSo, x => x.at),
    kg: sum(comprasSo, x => x.pesoKg),
    mensal: meses.map(k => ({ mes: k, cab: sum(comprasSo.filter(c => ym(c.data) === k), x => x.cab) })),
    porCategoria: [...groupBy(comprasSo, x => x.categoria)].map(([k, g]) => ({ categoria: k, cab: sum(g, x => x.cab) })).sort((a, b) => b.cab - a.cab),
    porTipo: [...groupBy(comprasSo, x => x.tipo)].map(([k, g]) => ({ tipo: k, cab: sum(g, x => x.cab) })).sort((a, b) => b.cab - a.cab),
    porCategoriaTipo: [...groupBy(comprasSo, x => x.categoria)].map(([k, g]) => ({
      categoria: k, cab: sum(g, x => x.cab),
      tipos: [...groupBy(g, x => x.tipo)].map(([t, gg]) => ({ tipo: t, cab: sum(gg, x => x.cab) })),
    })).sort((a, b) => b.cab - a.cab),
    porFornecedor: [...groupBy(comprasSo, x => x.fornecedor)].map(([k, g]) => ({ fornecedor: k, cab: sum(g, x => x.cab) })).sort((a, b) => b.cab - a.cab),
  };
  comprasPage.rsAt = comprasPage.at ? comprasPage.total / comprasPage.at : 0;
  comprasPage.rsKg = comprasPage.kg ? comprasPage.total / comprasPage.kg : 0;
  comprasPage.rsCab = comprasPage.cab ? comprasPage.total / comprasPage.cab : 0;
  // p.5 pivot: tipo → categoria → data; médias são AVG por lote (M, U, V)
  comprasPage.pivot = [...groupBy(compras, x => x.tipo)].map(([tipo, gTipo]) => ({
    tipo,
    cab: sum(gTipo, x => x.cab), at: sum(gTipo, x => x.at), pesoMedio: avg(gTipo, x => x.pesoMedio),
    rsCab: avg(gTipo, x => x.rsCab), rsAt: avg(gTipo, x => x.rsAt), total: sum(gTipo, x => x.total),
    categorias: [...groupBy(gTipo, x => x.categoria)].map(([cat, gCat]) => ({
      categoria: cat,
      cab: sum(gCat, x => x.cab), at: sum(gCat, x => x.at), pesoMedio: avg(gCat, x => x.pesoMedio),
      rsCab: avg(gCat, x => x.rsCab), rsAt: avg(gCat, x => x.rsAt), total: sum(gCat, x => x.total),
      lotes: [...groupBy(gCat, x => x.data.getTime())].map(([t, gD]) => ({
        data: new Date(Number(t)), nLotes: gD.length, fornecedor: nomeOuVarios(gD, x => x.fornecedor),
        cab: sum(gD, x => x.cab), at: sum(gD, x => x.at), pesoMedio: avg(gD, x => x.pesoMedio),
        rsCab: avg(gD, x => x.rsCab), rsAt: avg(gD, x => x.rsAt), total: sum(gD, x => x.total),
      })).sort((a, b) => a.data - b.data),
    })).sort((a, b) => a.categoria.localeCompare(b.categoria)),
  })).sort((a, b) => a.tipo.localeCompare(b.tipo));
  // Total geral da pivot: médias aritméticas por lote (AVG de M/U/V), não razões de soma
  comprasPage.pivotTotal = {
    cab: comprasPage.cab, at: comprasPage.at, total: comprasPage.total,
    pesoMedio: avg(compras, x => x.pesoMedio), rsCab: avg(compras, x => x.rsCab), rsAt: avg(compras, x => x.rsAt),
  };

  // ---------- p.6 Vendas abate (duas páginas: machos e fêmeas) ----------
  const vendasCards = (v) => {
    const cab = sum(v, x => x.cab), at = sum(v, x => x.atAbatidas), kg = sum(v, x => x.kgFinal), val = sum(v, x => x.valorLiq);
    return { cab, at, kg, valor: val, rsAt: at ? val / at : 0, rsKg: kg ? val / kg : 0 };
  };
  // campo "Frigorífico/Comprador" mistura pessoa jurídica e física; o gráfico de
  // preço × RC% usa só frigoríficos (sufixo societário ou marca conhecida)
  const isFrigorifico = (n) => /ltda|s\.?\s?a\.?\b|eireli|epp|\bme\b|frigo|foods|carnes|abatedouro|marfrig|minerva|jbs/i.test(n);
  const aggVendasAbate = (rows) => {
    const porEmpresa = [...groupBy(rows, x => x.comprador || 'Não informado')].map(([k, g]) => ({
      empresa: k, lotes: g.length, cab: sum(g, x => x.cab),
      rsAt: avg(g, x => x.rsAt), rendCarc: avg(g, x => x.rendCarc),
    })).sort((a, b) => b.cab - a.cab);
    return {
      ...vendasCards(rows),
      // eixo só com meses que tiveram venda: mês ausente no eixo = sem venda (conv. p.19)
      mensal: meses.map(k => {
        const g = rows.filter(v => ym(v.data) === k);
        return { mes: k, cab: sum(g, x => x.cab), rsAt: g.length ? avg(g, x => x.rsAt) : null };
      }).filter(m => m.cab > 0),
      porEmpresa,
      porEmpresaFrigo: porEmpresa.filter(e => isFrigorifico(e.empresa)),
    };
  };
  const vendasAbateMPage = aggVendasAbate(vendasAbate.filter(x => /^m/i.test(x.sexo)));
  const vendasAbateFPage = aggVendasAbate(vendasAbate.filter(x => /^f/i.test(x.sexo)));

  // ---------- p.6/p.7 Transferências entre fazendas ----------
  // Entrada: "Transf/Tranf Entrada" na Compra_Gado; saída: "Transf Saída" na
  // Venda_Gado (tipo previsto na planilha, ainda sem uso nas fazendas). Os
  // valores financeiros são sempre zerados: a movimentação é só física, e o
  // status "Em Aberto" refere-se ao financeiro, não ao deslocamento.
  const isTransf = (t) => /^tran(s)?f/i.test(t);
  const sexoDaCategoria = (c) => /f[eê]mea/i.test(c) ? 'Fêmea' : /macho/i.test(c) ? 'Macho' : '';
  const aggTransf = (rows, pesoFn, sexoFn) => ({
    cab: sum(rows, x => x.cab),
    lotes: rows.length,
    pesoMedio: avg(rows, pesoFn),
    mensal: meses.map(k => {
      const g = rows.filter(v => ym(v.data) === k);
      return { mes: k, cab: sum(g, x => x.cab), pesoMedio: g.length ? avg(g, pesoFn) : null };
    }).filter(m => m.cab > 0),
    porCategoria: [...groupBy(rows, x => x.categoria || 'Não informado')].map(([k, g]) => ({
      categoria: k, cab: sum(g, x => x.cab), pesoMedio: avg(g, pesoFn),
    })).sort((a, b) => b.cab - a.cab),
    porSexo: [...groupBy(rows, sexoFn)].map(([k, g]) => ({ sexo: k || 'Não informado', cab: sum(g, x => x.cab) }))
      .sort((a, b) => b.cab - a.cab),
    lista: rows.map(x => ({ data: x.data, categoria: x.categoria || 'Não informado', cab: x.cab, pesoMedio: pesoFn(x) }))
      .sort((a, b) => a.data - b.data),
  });
  const transfE = compras.filter(x => isTransf(x.tipo));
  const transfS = vendas.filter(x => isTransf(x.tipo));
  const transfEntradaPage = aggTransf(transfE, x => x.pesoMedio, x => sexoDaCategoria(x.categoria));
  const transfSaidaPage = aggTransf(transfS, x => (x.cab ? x.kgFinal / x.cab : 0), x => x.sexo);
  // Transferência de saída não é venda: fora dos KPIs e do pivot de vendas.
  const vendasComerciais = vendas.filter(x => !isTransf(x.tipo));

  // ---------- p.7 Resumo vendas ----------
  const giroDenominador = sum(
    [...estoque.entries()].filter(([k]) => k.startsWith(`${anoBaseGiro}-`))
      .flatMap(([, b]) => b.linhas), l => l.saldoIni);
  const vendasPage = {
    cab: sum(vendasComerciais, x => x.cab),
    valor: sum(vendasComerciais, x => x.valorLiq),
    giroEstoque: giroDenominador ? sum(vendasComerciais, x => x.cab) / giroDenominador : 0,
    pivot: [...groupBy(vendasComerciais, x => x.tipo)].map(([tipo, gTipo]) => ({
      tipo,
      cab: sum(gTipo, x => x.cab), at: sum(gTipo, x => x.atAbatidas),
      rsAt: avg(gTipo, x => x.rsAt), total: sum(gTipo, x => x.valorLiq),
      categorias: [...groupBy(gTipo, x => x.categoria)].map(([cat, gCat]) => ({
        categoria: cat,
        cab: sum(gCat, x => x.cab), at: sum(gCat, x => x.atAbatidas),
        rsAt: avg(gCat, x => x.rsAt), total: sum(gCat, x => x.valorLiq),
        lotes: [...groupBy(gCat, x => x.data.getTime())].map(([t, gD]) => ({
          data: new Date(Number(t)), comprador: nomeOuVarios(gD, x => x.comprador), nLotes: gD.length,
          cab: sum(gD, x => x.cab), at: sum(gD, x => x.atAbatidas),
          rsAt: avg(gD, x => x.rsAt), total: sum(gD, x => x.valorLiq),
        })).sort((a, b) => a.data - b.data),
      })).sort((a, b) => faixaEtariaKey(a.categoria) - faixaEtariaKey(b.categoria)),
    })),
  };

  // ---------- p.8 Nascimentos ----------
  const nascPage = {
    total: sum(nasc, x => x.quant),
    pesoMedio: avg(nasc, x => x.pesoNasc),
    mensal: [...groupBy(nasc, x => ym(x.data))].map(([k, g]) => ({
      mes: k, quant: sum(g, x => x.quant), pesoMedio: avg(g, x => x.pesoNasc),
    })).sort((a, b) => a.mes.localeCompare(b.mes)),
    porSexo: [...groupBy(nasc, x => x.sexo)].map(([k, g]) => ({ sexo: k, quant: sum(g, x => x.quant) })),
    porRacaSexo: [...groupBy(nasc, x => `${x.raca}|${x.sexo}`)].map(([k, g]) => ({ raca: k.split('|')[0], sexo: k.split('|')[1], quant: sum(g, x => x.quant) })),
    porCategoria: [...groupBy(nasc, x => x.categoria)].map(([k, g]) => ({ categoria: k, quant: sum(g, x => x.quant) })),
  };

  // ---------- p.9/p.10 Mortes e Consumo ----------
  const mcPage = (lista) => ({
    count: lista.length,
    at: sum(lista, x => Math.round(x.at)),
    valor: sum(lista, x => Math.round(x.valor)),
    taxa: rebanhoMedio ? lista.length / rebanhoMedio : 0,
    mensal: meses.map(k => ({ mes: k, count: lista.filter(x => ym(x.data) === k).length })),
    porCausa: [...groupBy(lista, x => x.causa)].map(([k, g]) => ({ causa: k, count: g.length })).sort((a, b) => b.count - a.count),
    porCategoria: [...groupBy(lista, x => x.categoria)].map(([k, g]) => ({ categoria: k, count: g.length })).sort((a, b) => b.count - a.count),
  });
  const mortesPage = mcPage(mortes);
  const consumoPage = mcPage(consumos);

  // ---------- p.11/12/13 Desembolso ----------
  const desembTotal = sum(desemb, x => x.valor);
  const desembPorMes = meses.map(k => ({
    mes: k, valor: sum(desemb.filter(d => ym(d.data) === k), x => x.valor),
  }));
  // agrupamento por tipo case-insensitive (Aruã tem "investimentos_e_Estruturação" vs "Investimentos_e_Estruturação")
  const desembPorTipo = [...groupBy(desemb, x => x.tipo.toLowerCase())].map(([k, g]) => ({ tipo: g[0].tipo, valor: sum(g, x => x.valor) })).sort((a, b) => b.valor - a.valor);
  const desembPorPlano = [...groupBy(desemb, x => `${x.tipo.toLowerCase()}|${x.plano}`)].map(([k, g]) => ({
    tipo: g[0].tipo, plano: g[0].plano, valor: sum(g, x => x.valor),
  })).sort((a, b) => b.valor - a.valor);

  const isCF = (t) => /fixos/i.test(t);
  const isCV = (t) => /vari.veis/i.test(t);
  const isCG = (t) => /compra.*gado/i.test(t);
  const cfcv = desemb.filter(d => isCF(d.tipo) || isCV(d.tipo));
  const cfcvPorMes = meses.map(k => {
    const g = cfcv.filter(d => ym(d.data) === k);
    const cf = sum(g.filter(d => isCF(d.tipo)), x => x.valor);
    const cv = sum(g.filter(d => isCV(d.tipo)), x => x.valor);
    const adMes = sum(diariasPeriodo.filter(x => ym(x.data) === k), x => x.saldoFinal);
    return { mes: k, cf, cv, total: cf + cv, animalDias: adMes, rebMedio: rebMedioPorMes.get(k) || 0 };
  });
  const cfTotal = sum(cfcv.filter(d => isCF(d.tipo)), x => x.valor);
  const cvTotal = sum(cfcv.filter(d => isCV(d.tipo)), x => x.valor);
  const cfcvTotal = cfTotal + cvTotal;

  // eixo termina no último mês com dado (meses projetados zerados à direita ficam fora)
  const lastVal = (arr, key) => { let i = arr.length - 1; while (i >= 0 && !arr[i][key]) i--; return i; };
  const desembPorMesT = desembPorMes.slice(0, lastVal(desembPorMes, 'valor') + 1);
  const cfcvPorMesT = cfcvPorMes.slice(0, lastVal(cfcvPorMes, 'total') + 1);

  const desembolsoPage = {
    total: desembTotal,
    mediaMensal: desembTotal / nMeses,
    porHa: desembTotal / cad.areaHa,
    custoDiariaCab: animalDias ? desembTotal / animalDias : 0,
    mensal: desembPorMesT.map(m => ({ ...m, porHa: m.valor / cad.areaHa })),
    porTipo: desembPorTipo.map(t => ({ ...t, pct: desembTotal ? t.valor / desembTotal : 0 })),
    rankingPlanos: desembPorPlano,
    cf: { total: cfTotal, cvTotal, cfcvTotal, relacao: cfcvTotal ? [cfTotal / cfcvTotal, cvTotal / cfcvTotal] : [0, 0] },
    mensalCfCv: cfcvPorMesT.map(m => ({
      ...m, porHa: m.total / cad.areaHa,
      pctCf: m.total ? m.cf / m.total : 0, pctCv: m.total ? m.cv / m.total : 0,
      custoDiariaCab: m.animalDias ? m.total / m.animalDias : 0,
    })),
    custeio: {
      total: cfcvTotal,
      mediaMensal: cfcvTotal / nMeses,
      porHa: cfcvTotal / cad.areaHa,
      porHaMes: nMeses ? cfcvTotal / nMeses / cad.areaHa : 0,
      custoDiariaCab: animalDias ? cfcvTotal / animalDias : 0,
    },
  };

  // ---------- p.14 Pareto (exclui Compra_de_Gado; corte ≥80%) ----------
  const paretoBase = desemb.filter(d => !isCG(d.tipo));
  const paretoTotal = sum(paretoBase, x => x.valor);
  // denominador do % planos = planos distintos na aba inteira excl. Compra de Gado (spec p.14)
  const planosDistintos = new Set(desembAll.filter(d => !isCG(d.tipo) && d.plano).map(d => d.plano)).size;
  let acum = 0;
  const paretoLinhas = [...groupBy(paretoBase, x => `${x.tipo.toLowerCase()}|${x.plano}`)]
    .map(([k, g]) => ({ tipo: g[0].tipo, plano: g[0].plano, valor: sum(g, x => x.valor) }))
    .sort((a, b) => b.valor - a.valor)
    .map(l => { acum += l.valor; return { ...l, acum, pct: paretoTotal ? acum / paretoTotal : 0 }; });
  const corteIdx = paretoLinhas.findIndex(l => l.pct >= 0.8);
  const paretoPage = {
    base: paretoTotal,
    linhas: paretoLinhas,
    corteIdx,
    val80: corteIdx >= 0 ? paretoLinhas[corteIdx].acum : paretoTotal,
    pctPlanos: planosDistintos ? (corteIdx + 1) / planosDistintos : 0,
    planosDistintos,
  };

  // ---------- p.15/16 Receitas ----------
  const recTotal = sum(receitas, x => x.valorLiq);
  const recPorMesAll = meses.map(k => ({ mes: k, valor: sum(receitas.filter(r => ym(r.data) === k), x => x.valorLiq) }));
  const recPorMes = recPorMesAll.slice(0, lastVal(recPorMesAll, 'valor') + 1);
  const receitasPage = {
    total: recTotal,
    mediaMensal: recTotal / nMeses,
    porHa: recTotal / cad.areaHa,
    porCab: rebanhoMedio ? recTotal / rebanhoMedio : 0,
    lancamentos: receitas.length,
    mensal: recPorMes.map(m => ({ ...m, porHa: m.valor / cad.areaHa })),
    porCategoria: [...groupBy(receitas, x => x.plano)].map(([k, g]) => ({ plano: k, valor: sum(g, x => x.valorLiq) })).sort((a, b) => b.valor - a.valor),
    porTipo: [...groupBy(receitas, x => x.classificacao)].map(([k, g]) => ({ tipo: k, valor: sum(g, x => x.valorLiq) })).sort((a, b) => b.valor - a.valor),
    porEmpresa: [...groupBy(receitas, x => x.empresa)].map(([k, g]) => ({
      empresa: k, valor: sum(g, x => x.valorLiq),
      lancamentos: [...groupBy(g, x => x.data.getTime())].map(([t, gD]) => ({
        data: new Date(Number(t)), valor: sum(gD, x => x.valorLiq),
      })).sort((a, b) => a.data - b.data),
    })).sort((a, b) => b.valor - a.valor),
  };

  // ---------- p.17 Fluxo de Caixa ----------
  let saldo = saldoCaixaInicial;
  const fluxo = meses.map(k => {
    const entrada = receitas.filter(r => ym(r.data) === k).reduce((a, x) => a + x.valorLiq, 0);
    const saida = desemb.filter(d => ym(d.data) === k).reduce((a, x) => a + x.valor, 0);
    const resultado = entrada - saida;
    const linha = { mes: k, saldoIni: saldo, entrada, saida, resultado, saldoFim: saldo + resultado };
    saldo = linha.saldoFim;
    return linha;
  });

  // ---------- p.18 Índices ----------
  const siAt = totIni.at, sfAt = totFim.at;
  const entradasAt = comprasPage.at;   // só compras (quirk do modelo)
  const saidasAt = sum(vendasAbate, x => x.atAbatidas); // só vendas abate
  const atProduzida = sfAt + saidasAt - entradasAt - siAt;
  // @ produzida por mês: Δ do estoque em @ + saídas − entradas do mês. O mês
  // inicial usa o saldo inicial do período como base; meses além do último
  // bloco de estoque real são projetados e ficam de fora.
  const atProduzidaPorMes = [];
  {
    let atAnt = siAt;
    for (const k of meses) {
      if (k > keyFim) break;
      const b = estoque.get(k);
      if (!b) continue;
      const atF = sum(b.linhas, x => x.at);
      const e = sum(comprasSo.filter(c => ym(c.data) === k), x => x.at);
      const s = sum(vendasAbate.filter(v => ym(v.data) === k), x => x.atAbatidas);
      atProduzidaPorMes.push({ mes: k, at: atF + s - e - atAnt });
      atAnt = atF;
    }
  }
  const indices = {
    estoqueInicialAt: siAt,
    estoqueFinalAt: sfAt,
    entradasAt, saidasAt, atProduzida,
    rebanhoMedio, uahaMedia,
    txDesfrute: rebanhoMedio ? sum(vendasAbate, x => x.cab) / rebanhoMedio : 0,
    producaoAtHa: atProduzida / cad.areaHa,
    atPorMes: atProduzidaPorMes,
    faturamento: recTotal,
    desembolso: desembTotal,
    resultado: recTotal - desembTotal,
    margem: recTotal ? (recTotal - desembTotal) / recTotal : 0,
    resultadoHa: (recTotal - desembTotal) / cad.areaHa,
    resultadoCab: rebanhoMedio ? (recTotal - desembTotal) / rebanhoMedio : 0,
    txMortalidade: mortesPage.taxa,
    nascimentos: nascPage.total,
    mortes: mortesPage.count,
    consumos: consumoPage.count,
    custoDiariaCab: desembolsoPage.custoDiariaCab,
    custeioPorAt: atProduzida ? cfcvTotal / atProduzida : 0,
    custeioHa: desembolsoPage.custeio.porHa,
    desembolsoCab: rebanhoMedio ? desembTotal / rebanhoMedio : 0,
    desembolsoHa: desembolsoPage.porHa,
    despesaMediaMensal: desembolsoPage.mediaMensal,
    faturamentoHa: receitasPage.porHa,
    faturamentoMedioMensal: receitasPage.mediaMensal,
  };

  // ---------- p.19 Vivos ----------
  const vivosPage = {
    ...vendasCards(vendasVivo),
    lotes: vendasVivo.length,
    mensal: [...groupBy(vendasVivo, x => ym(x.data))].map(([k, g]) => ({
      mes: k, cab: sum(g, x => x.cab), rsAt: avg(g, x => x.rsAt),
    })).sort((a, b) => a.mes.localeCompare(b.mes)),
    porCategoria: [...groupBy(vendasVivo, x => x.categoria)].map(([k, g]) => ({
      categoria: k, cab: sum(g, x => x.cab), rsAt: avg(g, x => x.rsAt),
    })).sort((a, b) => b.cab - a.cab),
    porComprador: [...groupBy(vendasVivo, x => x.comprador || 'Não informado')].map(([k, g]) => ({
      comprador: k, cab: sum(g, x => x.cab), valor: sum(g, x => x.valorLiq),
    })).sort((a, b) => b.cab - a.cab),
  };

  return {
    meta: {
      ini, fim, meses, nMeses, nDias, areaHa: cad.areaHa, categorias: cad.categorias,
      saldoCaixaInicial, anoBaseGiro,
      rebanhoMedio, animalDias,
    },
    estoque: estoquePage,
    rebanho: rebanhoPage,
    compras: comprasPage,
    vendasAbateM: vendasAbateMPage,
    vendasAbateF: vendasAbateFPage,
    transfE: transfEntradaPage,
    transfS: transfSaidaPage,
    vendas: vendasPage,
    nascimentos: nascPage,
    mortes: mortesPage,
    consumo: consumoPage,
    desembolso: desembolsoPage,
    pareto: paretoPage,
    receitas: receitasPage,
    fluxoCaixa: { linhas: fluxo, saldoInicial: saldoCaixaInicial, entradas: recTotal, saidas: desembTotal, saldoFinal: saldo },
    indices,
    vivos: vivosPage,
  };
}
