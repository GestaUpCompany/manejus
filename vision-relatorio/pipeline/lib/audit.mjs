// Auditoria da planilha Vision antes de gerar o relatório.
// Roda sobre as abas brutas (não sobre `reads`): extractReads descarta linhas
// inválidas silenciosamente e perde o número da linha — aqui é justamente o
// que se quer enxergar. O índice do array + 1 é a linha do Excel (o extrator
// preserva a posição: linhas vazias chegam como arrays vazios).
// Saída: [{ sev: 'erro'|'aviso', aba, coluna, campo, linhas[], msg, impacto }]
// Um issue por regra — nunca um por linha; a UI expande a lista de linhas.
import { toDate, toNum, toStr, NEEDED_SHEETS } from './core.mjs';

// nº da linha no Excel: o extrator grava o atributo r do <row> em r._r;
// em JSON de extrato (que perde o _r) cai no índice + 1.
const lnOf = (r, i) => r?._r ?? i + 1;

const COL = (i) => {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

// comprime lista de linhas em faixas: [10,11,12,431] → "10–12, 431"
export function fmtLinhas(linhas) {
  const sorted = [...linhas].sort((a, b) => a - b);
  const parts = [];
  let a = sorted[0], prev = sorted[0];
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(a === prev ? `${a}` : `${a}–${prev}`);
    a = prev = n;
  }
  if (a != null) parts.push(a === prev ? `${a}` : `${a}–${prev}`);
  return parts.join(', ');
}

export function auditSheets(sheets) {
  const issues = [];
  const acc = new Map();
  const DIA = 86400000;
  const push = (sev, aba, col, campo, linha, msg, impacto) => {
    const key = `${aba}|${campo}|${msg}`;
    if (!acc.has(key)) {
      const it = { sev, aba, coluna: col != null ? COL(col) : null, campo, linhas: [], msg, impacto };
      acc.set(key, it); issues.push(it);
    }
    if (linha != null) acc.get(key).linhas.push(linha);
  };

  // ---------- abas ausentes → página sai vazia ----------
  const PAGES_POR_ABA = {
    'Cadastros': 'área da fazenda (p.18 zera os indicadores por hectare)',
    'Estoque': 'p.02 Auditoria de Estoque e a base de rebanho de todo o relatório',
    'Diárias': 'saldo de rebanho por dia (p.03, p.18)',
    'Diárias_Categoria': 'movimentação por categoria (p.03, p.07)',
    'Compra_Gado': 'p.04 Compra de Animais e p.05 Resumo de Compras',
    'Venda_Gado': 'p.06 Vendas · Abate, p.07 Resumo de Vendas e p.19 Animais Vivos',
    'Mortes_Consumos': 'p.09 Mortes e p.10 Consumo e Doações',
    'Nascimentos': 'p.08 Nascimentos',
    'Desembolsos Realizados': 'p.11 a p.14 (desembolso, custeio, pareto) e fluxo de caixa p.17',
    'Receitas_Mensais': 'p.15 Receitas e p.16 Receitas por Tipo',
  };
  for (const nome of NEEDED_SHEETS) {
    if (!sheets[nome]) push('erro', nome, null, null, null, `Aba "${nome}" não existe no arquivo`, `${PAGES_POR_ABA[nome] ?? 'parte do relatório'} sai vazia`);
  }

  const rows = (n) => sheets[n] || [];

  // ---------- possível truncamento após 200 linhas vazias ----------
  // O extrator para cedo; se a aba declara linhas além do ponto de parada,
  // pode haver dados reais embaixo de um trecho vazio.
  for (const nome of NEEDED_SHEETS) {
    const t = sheets[nome]?._truncado;
    if (t) push('aviso', nome, null, null, null,
      `Leitura parou na linha ${t.ultimaLida}, mas a aba declara dados até a linha ${t.declarada}`,
      'se houver linhas preenchidas abaixo de um trecho de 200+ linhas vazias, elas foram cortadas e não entram no relatório — confira o fim da aba no Excel');
  }

  // índice da linha de cabeçalho: primeira linha com /data/i na coluna `colData`.
  // Só auditamos linhas abaixo dela, para não marcar títulos/abelhas como "linha ignorada".
  const headerIdx = (aba, colData) => {
    const rs = rows(aba);
    for (let i = 0; i < Math.min(20, rs.length); i++) {
      if (/data/i.test(toStr(rs[i]?.[colData]))) return i;
    }
    return -1;
  };

  // ---------- Cadastros: área útil ----------
  {
    const cad = rows('Cadastros');
    const area = toNum(cad?.[16]?.[16]);
    if (cad.length && !area) {
      push('erro', 'Cadastros', 16, 'Área Útil (ha)', rows('Cadastros')[16]?._r ?? 17,
        'Área útil da fazenda vazia ou zerada',
        'todos os indicadores por hectare da p.18 (produção/ha, custeio/ha, faturamento/ha) saem zerados');
    }
  }
  const categoriasCad = new Set();
  for (let r = 7; r <= 16; r++) {
    const c = toStr(rows('Cadastros')?.[r]?.[1]);
    if (c) categoriasCad.add(c);
  }
  const catOk = (cat) => !cat || !categoriasCad.size || categoriasCad.has(cat);

  // ---------- datas fora da faixa do conjunto ----------
  // Um ano digitado errado (2206 em vez de 2026) estica o período inteiro do
  // relatório. Marca qualquer data com ano > (maior ano da planilha + 1) ou
  // < 2000. Passa antes das checagens por aba para acumular todas as colunas
  // de data de uma vez.
  const dateCols = [
    ['Venda_Gado', 3], ['Compra_Gado', 1], ['Diárias_Categoria', 3],
    ['Desembolsos Realizados', 2], ['Receitas_Mensais', 2],
    ['Mortes_Consumos', 1], ['Nascimentos', 1], ['Estoque', 0],
  ];
  let maxAno = 0;
  for (const [aba, col] of dateCols) {
    for (const r of rows(aba)) {
      const d = toDate(r?.[col]);
      if (d && d.getUTCFullYear() > maxAno && d.getUTCFullYear() < 2100) maxAno = d.getUTCFullYear();
    }
  }
  if (maxAno) {
    for (const [aba, col] of dateCols) {
      const rs = rows(aba);
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i] || [];
        const d = toDate(r[col]);
        if (d && (d.getUTCFullYear() > maxAno + 1 || d.getUTCFullYear() < 2000)) {
          push('erro', aba, col, 'Data', lnOf(r, i),
            `Data fora da faixa (${d.getUTCFullYear()})`,
            'estica ou desloca o período inteiro do relatório — todos os meses entre essa data e o restante aparecem nos gráficos');
        }
      }
    }
  }

  // ---------- grafia divergente dentro da mesma coluna ----------
  // Dois valores que só diferem por caixa/espaço/acento criam categorias
  // fantasma nas agregações (ex.: "investimentos_e_Estruturação" vs
  // "Investimentos_e_Estruturação" no pareto da p.14). Reporta a forma menos
  // frequente.
  const normKey = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const grafiaCols = [
    ['Desembolsos Realizados', 5, 'Tipo de Desembolso', 'vira uma categoria à parte no pareto da p.14 e nas tabelas de desembolso da p.11–p.13'],
    ['Desembolsos Realizados', 6, 'Plano de Contas', 'vira uma categoria à parte no pareto da p.14'],
    ['Receitas_Mensais', 6, 'Plano de Contas', 'vira uma categoria à parte nas receitas por tipo da p.15/p.16'],
    ['Receitas_Mensais', 9, 'Empresa', 'vira uma empresa à parte no detalhamento da p.15'],
    ['Venda_Gado', 35, 'Frigorífico/Comprador', 'o mesmo comprador aparece como duas linhas na p.06 e p.19'],
    ['Compra_Gado', 8, 'Fornecedor', 'o mesmo fornecedor aparece como duas linhas na p.05'],
  ];
  for (const [aba, col, campo, impacto] of grafiaCols) {
    const rs = rows(aba);
    const colData = dateCols.find((d) => d[0] === aba)?.[1] ?? 1;
    const h0 = headerIdx(aba, colData);
    const freq = new Map(); // normKey -> Map<raw, {n, linhas[]}>
    for (let i = Math.max(0, h0 + 1); i < rs.length; i++) {
      const v = toStr(rs[i]?.[col]);
      if (!v) continue;
      const k = normKey(v);
      if (!freq.has(k)) freq.set(k, new Map());
      const m = freq.get(k);
      if (!m.has(v)) m.set(v, { n: 0, linhas: [] });
      m.get(v).n++;
      m.get(v).linhas.push(lnOf(rs[i], i));
    }
    for (const m of freq.values()) {
      if (m.size < 2) continue;
      const variantes = [...m.entries()].sort((a, b) => b[1].n - a[1].n);
      const canon = variantes[0][0];
      for (const [v, info] of variantes.slice(1)) {
        for (const ln of info.linhas) {
          push('erro', aba, col, campo, ln,
            `"${v}" difere de "${canon}" só por grafia (caixa/espaço/acento)`,
            impacto);
        }
      }
    }
  }

  // ---------- Venda_Gado: D=data H=tipo I=cab J=categoria AD=rendCarc AJ=comprador AN=valorLiq ----------
  const vg0 = headerIdx('Venda_Gado', 3);
  const vgCod = new Map();
  for (let i = vg0 + 1; i < rows('Venda_Gado').length; i++) {
    const r = rows('Venda_Gado')[i] || [];
    const ln = lnOf(r, i);
    const temAlgo = r.some((v) => v != null && v !== '');
    if (!temAlgo) continue;
    const d = toDate(r[3]), cab = toNum(r[8]);
    if (!d || !cab) {
      // linha com conteúdo que o modelo ignora (sem data ou sem cabeças)
      if (toStr(r[7]) || toNum(r[8]) || toNum(r[0])) {
        push('aviso', 'Venda_Gado', !d ? 3 : 8, !d ? 'Data Venda' : 'Quant. Cab.', ln,
          'Linha com dados mas sem ' + (!d ? 'data de venda' : 'quantidade de cabeças'),
          'essa linha é ignorada — não entra em nenhuma soma das páginas de vendas');
      }
      continue;
    }
    const status = toStr(r[5]);
    if (!status) {
      push('aviso', 'Venda_Gado', 5, 'Status', ln,
        'Venda sem status',
        'a linha entra como recebida no fluxo de caixa da p.17 — se ainda não foi paga, a caixa sai mais alta que o real');
    } else if (!/^(pago|em aberto)$/i.test(status)) {
      push('erro', 'Venda_Gado', 5, 'Status', ln,
        `Status "${status}" não reconhecido`,
        'o relatório só entende "Pago" e "Em Aberto" — qualquer outro valor é tratado como recebido, entrando no fluxo de caixa da p.17 antes da hora');
    }
    const tipoV = toStr(r[7]);
    if (!tipoV) {
      push('aviso', 'Venda_Gado', 7, 'Tipo de Venda', ln,
        'Venda sem tipo (Abate/Vivo)',
        'a venda entra no total de cabeças mas cai fora tanto da p.06 (Abate) quanto da p.19 (Animais Vivos)');
    } else if (!/^abate/i.test(tipoV) && !/vivo/i.test(tipoV)) {
      push('aviso', 'Venda_Gado', 7, 'Tipo de Venda', ln,
        `Tipo de venda "${tipoV}" não é Abate nem Vivo`,
        'a venda entra no total de cabeças mas cai fora tanto da p.06 (Abate) quanto da p.19 (Animais Vivos)');
    }
    // coerência de datas: pagamento muito antes da venda (adiantamento de dias
    // é normal; >31 dias para trás indica ano digitado errado), ou venda antes
    // da entrada
    const dPagV = toDate(r[4]);
    if (dPagV && d - dPagV > 31 * DIA) {
      push('erro', 'Venda_Gado', 4, 'Data Pagamento', ln,
        'Data de pagamento anterior à data da venda',
        'o recebimento cai num mês anterior à venda no fluxo de caixa — provável ano digitado errado');
    }
    const dEnt = toDate(r[11]);
    if (dEnt && dEnt > d) {
      push('erro', 'Venda_Gado', 11, 'Data Entrada', ln,
        'Data de entrada posterior à data da venda',
        'o período de engorda sai negativo na p.06 — provável data de venda ou de entrada digitada errada');
    }
    if (!toStr(r[35])) {
      push('aviso', 'Venda_Gado', 35, 'Frigorífico/Comprador', ln,
        'Venda sem frigorífico/comprador',
        'a p.06 "Volume por empresa" e a p.19 mostram uma linha sem nome como fornecedor');
    }
    const valorLiq = toNum(r[39]);
    if (!valorLiq && status === 'Em Aberto') {
      push('aviso', 'Venda_Gado', 39, 'Valor Líquido', ln,
        'Venda "Em Aberto" (ainda não recebida)',
        'entra nas cabeças vendidas mas com valor R$ 0 — a média R$/@ da p.06 e a p.19 ficam subestimadas até o recebimento ser lançado');
    } else if (!valorLiq && status !== 'Em Aberto') {
      push('erro', 'Venda_Gado', 39, 'Valor Líquido', ln,
        'Venda com valor líquido zerado',
        'puxa a média R$/@ da p.06 para baixo e não entra no fluxo de caixa da p.17');
    }
    if (/abate/i.test(toStr(r[7])) && !toNum(r[29])) {
      push('aviso', 'Venda_Gado', 29, 'Rend. Carcaça', ln,
        'Venda de abate sem rendimento de carcaça',
        'o RC% da p.06 (gráfico e coluna RC da tabela) sai zerado para esse frigorífico');
    }
    if (!toStr(r[9])) {
      push('aviso', 'Venda_Gado', 9, 'Categoria', ln,
        'Venda sem categoria do animal',
        'o lote some das tabelas por categoria da p.07 e p.19');
    } else if (!catOk(toStr(r[9]))) {
      push('aviso', 'Venda_Gado', 9, 'Categoria', ln,
        `Categoria "${toStr(r[9])}" não existe no cadastro da fazenda`,
        'cria uma linha fantasma nas tabelas por categoria da p.07 e p.19');
    }
    // possível lançamento duplicado: mesmo código + lote + data + quantidade.
    // (o código embute data/qtd/tipo, então lotes distintos podem compartilhá-lo;
    // só repetição de TODOS os campos indica linha lançada em dobro.)
    const chaveV = [toStr(r[6]), toStr(r[2]), String(r[3]), cab, toStr(r[9])].join('|');
    if (toStr(r[6])) {
      const seen = vgCod.get(chaveV);
      if (seen) {
        push('aviso', 'Venda_Gado', 6, 'Cód. Movimentação', ln,
          `Linha idêntica à linha ${seen} (mesmo lote, código, data e quantidade)`,
          'se for lançamento em dobro, as cabeças e o valor contam duas vezes na p.06/p.07 — confira se são vendas distintas');
      } else vgCod.set(chaveV, ln);
    }
  }

  // ---------- Compra_Gado: B=data F=tipo G=cab H=categoria I=fornecedor N=rendCarc T=total ----------
  const cg0 = headerIdx('Compra_Gado', 1);
  const cgCod = new Map();
  for (let i = cg0 + 1; i < rows('Compra_Gado').length; i++) {
    const r = rows('Compra_Gado')[i] || [];
    const ln = lnOf(r, i);
    if (!r.some((v) => v != null && v !== '')) continue;
    const d = toDate(r[1]), cab = toNum(r[6]);
    if (!d || !cab) {
      if (toStr(r[5]) || toNum(r[6])) {
        push('aviso', 'Compra_Gado', !d ? 1 : 6, !d ? 'Data Compra' : 'Quant. Cab.', ln,
          'Linha com dados mas sem ' + (!d ? 'data' : 'quantidade'),
          'essa compra é ignorada — não entra na p.04 nem na p.05');
      }
      continue;
    }
    const statusC = toStr(r[3]);
    if (!statusC) {
      push('aviso', 'Compra_Gado', 3, 'Status', ln,
        'Compra sem status',
        'a linha entra como paga no fluxo de caixa — se ainda não foi paga, o desembolso sai antecipado');
    } else if (!/^(pago|em aberto)$/i.test(statusC)) {
      push('erro', 'Compra_Gado', 3, 'Status', ln,
        `Status "${statusC}" não reconhecido`,
        'o relatório só entende "Pago" e "Em Aberto" — outro valor é tratado como pago e entra no desembolso/fluxo de caixa antes da hora');
    }
    const dPagC = toDate(r[2]);
    if (dPagC && d - dPagC > 31 * DIA) {
      push('erro', 'Compra_Gado', 2, 'Data de Pagamento', ln,
        'Data de pagamento anterior à data da compra',
        'o desembolso cai num mês anterior à compra no fluxo de caixa — provável ano digitado errado');
    }
    const codC = toStr(r[4]);
    if (codC) {
      const chaveC = [codC, String(r[1]), cab, toStr(r[7])].join('|');
      const seen = cgCod.get(chaveC);
      if (seen) {
        push('aviso', 'Compra_Gado', 4, 'Cód. Movimentação', ln,
          `Linha idêntica à linha ${seen} (mesmo código, data e quantidade)`,
          'se for lançamento em dobro, as cabeças e o valor contam duas vezes na p.04/p.05 — confira se são compras distintas');
      } else cgCod.set(chaveC, ln);
    }
    if (!toStr(r[8])) {
      push('aviso', 'Compra_Gado', 8, 'Fornecedor', ln,
        'Compra sem fornecedor',
        'a p.05 mostra o fornecedor em branco no detalhamento por lote');
    }
    if (!toNum(r[19])) {
      push('aviso', 'Compra_Gado', 19, 'Total da Compra', ln,
        'Compra com valor total zerado',
        'a média R$/@ de compra da p.04 fica subestimada e o valor não entra no desembolso');
    }
    if (!toStr(r[7])) {
      push('aviso', 'Compra_Gado', 7, 'Categoria', ln,
        'Compra sem categoria',
        'o lote some das tabelas por categoria da p.05');
    } else if (!catOk(toStr(r[7]))) {
      push('aviso', 'Compra_Gado', 7, 'Categoria', ln,
        `Categoria "${toStr(r[7])}" não existe no cadastro da fazenda`,
        'cria uma linha fantasma nas tabelas por categoria da p.05');
    }
  }

  // ---------- Diárias_Categoria: D=data E=categoria ----------
  for (let i = 0; i < rows('Diárias_Categoria').length; i++) {
    const r = rows('Diárias_Categoria')[i] || [];
    const d = toDate(r[3]);
    if (!d) continue;
    const cat = toStr(r[4]);
    if (!cat) {
      push('aviso', 'Diárias_Categoria', 4, 'Categoria', lnOf(r, i),
        'Linha de movimentação sem categoria',
        'a linha é ignorada — a movimentação da p.03/p.07 fica menor que a real');
    } else if (categoriasCad.size && !categoriasCad.has(cat)) {
      push('aviso', 'Diárias_Categoria', 4, 'Categoria', lnOf(r, i),
        `Categoria "${cat}" não existe no cadastro da fazenda`,
        'cria uma linha fantasma nas tabelas por categoria da p.03 e p.07 (nome divergente da aba Cadastros)');
    }
  }

  // ---------- Estoque: blocos mensais; continuidade e completude ----------
  {
    const blocos = [];
    const catPorMes = new Map(); // ym -> Set<categoria>
    for (let i = 0; i < rows('Estoque').length; i++) {
      const r = rows('Estoque')[i] || [];
      const d = toDate(r[0]);
      const desc = toStr(r[5]);
      if (!d || !desc) continue;
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (/total/i.test(desc)) {
        blocos.push({ ym, si: toNum(r[6]), sf: toNum(r[22]), ln: lnOf(r, i) });
      } else {
        if (!catPorMes.has(ym)) catPorMes.set(ym, new Set());
        catPorMes.get(ym).add(desc);
      }
    }
    // mês com menos categorias que o esperado → tabela da p.02 sai furada
    if (catPorMes.size) {
      const esperado = Math.max(categoriasCad.size, ...[...catPorMes.values()].map((s) => s.size));
      for (const [ym, cats] of catPorMes) {
        if (cats.size < esperado) {
          const falta = [...categoriasCad].filter((c) => !cats.has(c));
          push('aviso', 'Estoque', 5, 'Categoria', null,
            `Mês ${ym} tem só ${cats.size} de ${esperado} categorias${falta.length ? ` (faltam: ${falta.join(', ')})` : ''}`,
            'a tabela de estoque da p.02 mostra esse mês com buraco — a linha da categoria sai vazia ou ausente');
        }
      }
    }
    for (let i = 1; i < blocos.length; i++) {
      const [ant, cur] = [blocos[i - 1], blocos[i]];
      const [ya, ma] = ant.ym.split('-').map(Number);
      const [yc, mc] = cur.ym.split('-').map(Number);
      const diff = (yc * 12 + mc) - (ya * 12 + ma);
      if (diff > 1) {
        push('aviso', 'Estoque', 0, 'Data', cur.ln,
          `Sem bloco de estoque entre ${ant.ym} e ${cur.ym}`,
          'a p.02 e os gráficos mensais mostram um salto de um mês para outro sem continuidade');
      }
      if (ant.sf && cur.si && Math.abs(cur.si - ant.sf) > 0.5) {
        push('erro', 'Estoque', 6, 'Saldo Inicial', cur.ln,
          `Saldo inicial de ${cur.ym} (${cur.si}) não bate com o saldo final de ${ant.ym} (${ant.sf})`,
          'a p.02 mostra estoque quebrando entre meses — indica mês editado na mão ou fórmula quebrada');
      }
    }
  }

  // ---------- Desembolsos: C=data D=status F=tipo G=plano N=valor ----------
  for (let i = 0; i < rows('Desembolsos Realizados').length; i++) {
    const r = rows('Desembolsos Realizados')[i] || [];
    if (!r.some((v) => v != null && v !== '')) continue;
    const d = toDate(r[2]);
    if (!d) continue;
    const statusD = toStr(r[3]);
    if (!statusD) {
      push('aviso', 'Desembolsos Realizados', 3, 'Status', lnOf(r, i),
        'Desembolso sem status',
        'a linha entra como paga no fluxo de caixa e no desembolso — se ainda não foi paga, os valores saem antecipados');
    } else if (!/^(pago|em aberto)$/i.test(statusD)) {
      push('erro', 'Desembolsos Realizados', 3, 'Status', lnOf(r, i),
        `Status "${statusD}" não reconhecido`,
        'o relatório só entende "Pago" e "Em Aberto" — outro valor entra como pago no desembolso e no fluxo de caixa');
    }
    if (!toStr(r[5])) {
      push('aviso', 'Desembolsos Realizados', 5, 'Tipo (CF/CV)', lnOf(r, i),
        'Desembolso sem tipo de custo (CF/CV)',
        'a linha é ignorada — o desembolso da p.11, o custeio da p.13 e o pareto da p.14 ficam menores que o real');
    }
    if (!toStr(r[6])) {
      push('aviso', 'Desembolsos Realizados', 6, 'Plano de Contas', lnOf(r, i),
        'Desembolso sem plano de contas',
        'aparece como categoria vazia no pareto da p.14 e nas tabelas de desembolso');
    }
  }

  // ---------- Receitas: C=data D=status G=plano J=empresa P=valorLiq ----------
  for (let i = 0; i < rows('Receitas_Mensais').length; i++) {
    const r = rows('Receitas_Mensais')[i] || [];
    if (!r.some((v) => v != null && v !== '')) continue;
    const d = toDate(r[2]);
    if (!d) continue;
    const statusR = toStr(r[3]);
    if (!statusR) {
      push('aviso', 'Receitas_Mensais', 3, 'Status', lnOf(r, i),
        'Receita sem status',
        'a linha entra como recebida no fluxo de caixa — se ainda não foi recebida, a caixa sai mais alta que o real');
    } else if (!/^(pago|em aberto)$/i.test(statusR)) {
      push('erro', 'Receitas_Mensais', 3, 'Status', lnOf(r, i),
        `Status "${statusR}" não reconhecido`,
        'o relatório só entende "Pago" e "Em Aberto" — outro valor entra como recebido no fluxo de caixa');
    }
    if (!toStr(r[6])) {
      push('aviso', 'Receitas_Mensais', 6, 'Plano de Contas', lnOf(r, i),
        'Receita sem plano de contas',
        'aparece como categoria vazia na p.15 e p.16');
    }
    if (!toStr(r[9])) {
      push('aviso', 'Receitas_Mensais', 9, 'Empresa', lnOf(r, i),
        'Receita sem empresa/origem',
        'aparece sem nome no detalhamento por empresa da p.15');
    }
  }

  // ---------- Mortes_Consumos: B=data E=categoria P=flag ----------
  for (let i = 0; i < rows('Mortes_Consumos').length; i++) {
    const r = rows('Mortes_Consumos')[i] || [];
    if (!r.some((v) => v != null && v !== '')) continue;
    const d = toDate(r[1]);
    if (!d) continue;
    if (!toStr(r[15])) {
      push('aviso', 'Mortes_Consumos', 15, 'Tipo (Morte/Consumo)', lnOf(r, i),
        'Lançamento sem tipo Morte/Consumo',
        'a linha é ignorada — não entra na p.09 nem na p.10');
    } else if (!/^(morte|consumo|doa)/i.test(toStr(r[15]))) {
      push('aviso', 'Mortes_Consumos', 15, 'Tipo (Morte/Consumo)', lnOf(r, i),
        `Tipo "${toStr(r[15])}" não é Morte, Consumo nem Doação`,
        'a linha é ignorada pela p.09 e pela p.10, que só separam esses tipos');
    }
    const catM = toStr(r[4]);
    if (!catM) {
      push('aviso', 'Mortes_Consumos', 4, 'Categoria', lnOf(r, i),
        'Lançamento sem categoria do animal',
        'entra no total de mortes/consumos mas some das tabelas por categoria da p.09 e p.10');
    } else if (!catOk(catM)) {
      push('aviso', 'Mortes_Consumos', 4, 'Categoria', lnOf(r, i),
        `Categoria "${catM}" não existe no cadastro da fazenda`,
        'cria uma linha fantasma nas tabelas por categoria da p.09 e p.10');
    }
  }

  // ---------- Nascimentos: B=data C=quant ----------
  for (let i = 0; i < rows('Nascimentos').length; i++) {
    const r = rows('Nascimentos')[i] || [];
    if (!r.some((v) => v != null && v !== '')) continue;
    const d = toDate(r[1]);
    if (!d) continue;
    if (!toNum(r[2])) {
      push('aviso', 'Nascimentos', 2, 'Quantidade', lnOf(r, i),
        'Nascimento sem quantidade',
        'a linha é ignorada na p.08');
    }
    const catN = toStr(r[6]);
    if (!catN) {
      push('aviso', 'Nascimentos', 6, 'Categoria', lnOf(r, i),
        'Nascimento sem categoria do animal',
        'entra no total de nascimentos mas some das tabelas por categoria da p.08');
    } else if (!catOk(catN)) {
      push('aviso', 'Nascimentos', 6, 'Categoria', lnOf(r, i),
        `Categoria "${catN}" não existe no cadastro da fazenda`,
        'cria uma linha fantasma nas tabelas da p.08');
    }
  }

  return issues.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'erro' ? -1 : 1));
}
