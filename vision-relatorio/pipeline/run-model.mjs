// Runner: XLSM → modelo canônico → validação contra golden.
// Uso: node run-model.mjs <arquivo.xlsm> --ini 2026-01-01 --fim 2026-08-31 [--golden golden/guanabara.json] [--out model.json]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadWorkbook, loadExtracted, parseISODate, NEEDED_SHEETS } from './lib/loader.mjs';
import { buildModel } from './lib/model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
if (!file) { console.error('uso: run-model.mjs <xlsm> --ini YYYY-MM-DD --fim YYYY-MM-DD [--golden f.json] [--out out.json]'); process.exit(1); }

const ini = parseISODate(opt('ini', '2026-01-01'));
const fim = parseISODate(opt('fim', '2026-08-31'));
const saldoIni = Number(opt('saldo', '0'));

const resolved = path.resolve(file);
const { sheets, allNames } = resolved.endsWith('.json')
  ? await loadExtracted(resolved)
  : loadWorkbook(resolved);
console.log(`[load] ${path.basename(file)}: ${allNames.length} abas; parseadas ${Object.keys(sheets).length}`);

const missing = NEEDED_SHEETS.filter(s => !sheets[s]);
if (missing.length) console.warn(`[warn] abas ausentes: ${missing.join(', ')}`);

const model = buildModel(sheets, { ini, fim, saldoCaixaInicial: saldoIni });
const out = opt('out', null);
if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(model, (k, v) => v instanceof Date ? v.toISOString().slice(0, 10) : v, 2));

// ---------- validação ----------
const goldenPath = opt('golden', null);
if (!goldenPath) { console.log('[ok] modelo gerado' + (out ? ` em ${out}` : '')); process.exit(0); }

const golden = JSON.parse(fs.readFileSync(path.resolve(goldenPath), 'utf8'));
const errors = [];
const TOL = { money: 0.05, ratio: 0.005, int: 0.5 };
const only = opt('only', '').split(',').map(s => s.trim()).filter(Boolean);
const want = (s) => !only.length || only.includes(s);

function get(obj, pathExpr) {
  return pathExpr.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    const m = k.match(/^(\w+)\[(\d+)\]$/);
    if (m) return o[m[1]]?.[Number(m[2])];
    return o[k];
  }, obj);
}

function check(expr, expected, tol = TOL.money, actualOverride) {
  const actual = actualOverride ?? get(model, expr);
  if (actual == null) { errors.push(`${expr}: esperado ${expected}, veio undefined`); return; }
  const diff = Math.abs(actual - expected);
  const ok = diff <= Math.max(tol, Math.abs(expected) * tol / 100);
  if (!ok) errors.push(`${expr}: esperado ${expected}, veio ${typeof actual === 'number' ? actual.toFixed(4) : actual} (diff ${diff.toFixed(4)})`);
}

const m = (e, p, t) => check(e, get(golden, p) ?? e.split('.').pop(), t);
const walk = (g, prefix = '') => {
  for (const [k, v] of Object.entries(g)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') check(p, v, TOL.money);
    else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') for (const [kk, vv] of Object.entries(item)) {
          if (typeof vv === 'number') check(`${p}[${i}].${kk}`, vv, TOL.money);
        }
      });
    } else if (typeof v === 'object' && v) walk(v, p);
  }
};

// checks com tolerância apropriada por tipo
if (want('meta')) for (const [k, v] of Object.entries(golden.meta || {})) check(`meta.${k}`, v, k === 'rebanhoMedio' ? 0.5 : TOL.int);
if (want('estoque') && golden.estoque) {
  for (const lado of ['inicial', 'final']) {
    check(`estoque.totais.${lado}.cab`, golden.estoque.totais[lado].cab, 0.5);
    check(`estoque.totais.${lado}.at`, golden.estoque.totais[lado].at, 0.5);
    check(`estoque.totais.${lado}.valorAt`, golden.estoque.totais[lado].valorAt, 0.05);
    check(`estoque.totais.${lado}.valor`, golden.estoque.totais[lado].valor, 0.5);
  }
}
if (want('rebanho') && golden.rebanho) {
  check('rebanho.saldoFinal', golden.rebanho.saldoFinal, 0.5);
  check('rebanho.pesoVivoMedio', golden.rebanho.pesoVivoMedio, 0.5);
  check('rebanho.uahaMedia', golden.rebanho.uahaMedia, 0.02);
  golden.rebanho.serieMensal?.forEach((s, i) => {
    check(`rebanho.serieMensal[${i}].rebanhoMedio`, s.rebanhoMedio, 1);
    if (s.uaha != null) check(`rebanho.serieMensal[${i}].uaha`, s.uaha, 0.01);
  });
  if (golden.rebanho.matrizTotal) {
    const t = golden.rebanho.matrizTotal;
    const sum = (f) => model.rebanho.matriz.reduce((a, x) => a + x[f], 0);
    for (const [k, v] of Object.entries(t)) {
      const a = k === 'si' || k === 'sf' ? sum(k) : sum(k);
      if (Math.abs(a - v) > 0.5) errors.push(`rebanho.matriz.${k}: esperado ${v}, veio ${a}`);
    }
  }
}
if (want('compras') && golden.compras) {
  check('compras.cab', golden.compras.cab, 0.5);
  check('compras.total', golden.compras.total, 0.05);
  check('compras.rsAt', golden.compras.rsAt, 0.05);
  check('compras.rsKg', golden.compras.rsKg, 0.05);
  check('compras.rsCab', golden.compras.rsCab, 0.05);
  for (const [mes, cab] of Object.entries(golden.compras.mensal || {})) {
    const row = model.compras.mensal.find(x => x.mes === mes);
    if (!row || Math.abs(row.cab - cab) > 0.5) errors.push(`compras.mensal.${mes}: esperado ${cab}, veio ${row?.cab}`);
  }
}
if (want('vendasAbate') && golden.vendasAbate) {
  // p.06 foi dividida em machos/fêmeas: o golden do total é validado pela soma
  // das duas páginas (rsAt/rsKg são razões, recompostas de valor e at/kg).
  const m = model.vendasAbateM, f = model.vendasAbateF, g = golden.vendasAbate;
  const comb = (k) => (m?.[k] ?? 0) + (f?.[k] ?? 0);
  check('vendasAbate.cab', g.cab, 0.5, comb('cab'));
  check('vendasAbate.at', g.at, TOL.money, comb('at'));
  check('vendasAbate.valor', g.valor, TOL.money, comb('valor'));
  const at = comb('at'), kg = comb('kg'), val = comb('valor');
  check('vendasAbate.rsAt', g.rsAt, 0.02, at ? val / at : 0);
  check('vendasAbate.rsKg', g.rsKg, 0.02, kg ? val / kg : 0);
}
if (want('vendas') && golden.vendas) {
  check('vendas.cab', golden.vendas.cab, 0.5);
  check('vendas.valor', golden.vendas.valor, 0.05);
  check('vendas.giroEstoque', golden.vendas.giroEstoque, 0.001);
}
if (want('nascimentos') && golden.nascimentos) {
  check('nascimentos.total', golden.nascimentos.total, 0.5);
  check('nascimentos.pesoMedio', golden.nascimentos.pesoMedio, 0.5);
}
for (const sec of ['mortes', 'consumo']) {
  if (!golden[sec] || !want(sec)) continue;
  check(`${sec}.count`, golden[sec].count, 0.5);
  check(`${sec}.at`, golden[sec].at, 0.5);
  check(`${sec}.valor`, golden[sec].valor, 0.5);
  check(`${sec}.taxa`, golden[sec].taxa, 0.0005);
}
if (want('desembolso') && golden.desembolso) {
  check('desembolso.total', golden.desembolso.total, 0.05);
  check('desembolso.mediaMensal', golden.desembolso.mediaMensal, 0.05);
  check('desembolso.porHa', golden.desembolso.porHa, 0.05);
  check('desembolso.custoDiariaCab', golden.desembolso.custoDiariaCab, 0.01);
  golden.desembolso.porTipo?.forEach((t, i) => {
    const row = model.desembolso.porTipo.find(x => x.tipo === t.tipo);
    if (!row) errors.push(`desembolso.porTipo: tipo ${t.tipo} ausente`);
    else if (Math.abs(row.valor - t.valor) > 0.05) errors.push(`desembolso.porTipo.${t.tipo}: esperado ${t.valor}, veio ${row.valor.toFixed(2)}`);
  });
  check('desembolso.cf.total', golden.desembolso.cf.total, 0.05);
  check('desembolso.cf.cvTotal', golden.desembolso.cf.cvTotal, 0.05);
  check('desembolso.custeio.total', golden.desembolso.custeio.total, 0.05);
  check('desembolso.custeio.porHa', golden.desembolso.custeio.porHa, 0.05);
  check('desembolso.custeio.custoDiariaCab', golden.desembolso.custeio.custoDiariaCab, 0.01);
}
if (want('pareto') && golden.pareto) {
  check('pareto.base', golden.pareto.base, 0.05);
  check('pareto.corteIdx', golden.pareto.corteIdx, 0.1);
  check('pareto.val80', golden.pareto.val80, 0.05);
  check('pareto.pctPlanos', golden.pareto.pctPlanos, 0.001);
  check('pareto.planosDistintos', golden.pareto.planosDistintos, 0.5);
}
if (want('receitas') && golden.receitas) {
  check('receitas.total', golden.receitas.total, 0.05);
  check('receitas.mediaMensal', golden.receitas.mediaMensal, 0.05);
  check('receitas.porHa', golden.receitas.porHa, 0.05);
  check('receitas.porCab', golden.receitas.porCab, 0.05);
  check('receitas.lancamentos', golden.receitas.lancamentos, 0.5);
}
if (want('fluxoCaixa') && golden.fluxoCaixa) {
  check('fluxoCaixa.entradas', golden.fluxoCaixa.entradas, 0.05);
  check('fluxoCaixa.saidas', golden.fluxoCaixa.saidas, 0.05);
  check('fluxoCaixa.saldoFinal', golden.fluxoCaixa.saldoFinal, 0.5);
}
if (want('vivos') && golden.vivos) {
  for (const [k, v] of Object.entries(golden.vivos)) {
    check(`vivos.${k}`, v, k === 'rsAt' || k === 'rsKg' ? 0.02 : k === 'lotes' || k === 'cab' ? 0.5 : TOL.money);
  }
}
if (want('indices') && golden.indices) {
  for (const [k, v] of Object.entries(golden.indices)) check(`indices.${k}`, v, k === 'txDesfrute' ? 0.001 : TOL.money);
}

if (errors.length) {
  console.log(`\n[FAIL] ${errors.length} divergências:`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(2);
}
console.log('\n[PASS] todos os valores golden reconciliados');
