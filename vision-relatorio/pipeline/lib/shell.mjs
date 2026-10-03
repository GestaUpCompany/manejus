 // Chrome comum das páginas do relatório (1280x720, canvas PBIX).
import { esc } from './fmt.mjs';

const BASE_CSS = `
@page { size: 1280px 720px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --blue: #0B3D6E; --green: #17A34A; --green-dark: #0F7A38; --green-light: #7CC98A;
  --ink: #12263A; --muted: #5B6B7B; --line: #E3E8EE; --soft: #F4F7F9;
  --red: #B0443C; --amber: #B8860B; --slate: #8FA3B5;
}
body { font-family: 'Archivo', 'Segoe UI', sans-serif; }
.page { width: 1280px; height: 720px; position: relative; overflow: hidden; background: #F5F8FA; display: flex; flex-direction: column; }
.page-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 48px 8px 48px; }
.title-block h1 { font-size:33px; font-weight: 800; color: var(--blue); letter-spacing: -0.5px; }
.title-block .t-sub { font-size:18px; font-weight: 700; color: var(--muted); letter-spacing: 0; }
.title-block .kicker { font-size:12px; font-weight: 700; letter-spacing: 3px; color: var(--green-dark); text-transform: uppercase; margin-top: 5px; }
.page-logo { height: 62px; }

.kpis { display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 48px 10px 48px; }
.kpi { border: 1px solid var(--line); border-radius: 10px; border-top: 3px solid var(--green); padding: 8px 14px 9px 14px; background: #fff; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); width: fit-content; min-width: 180px; }
.kpi.blue-top { border-top-color: var(--blue); }
.kpi.red-top { border-top-color: var(--red); }
.kpi.amber-top { border-top-color: var(--amber); }
.kpi .lbl { font-size:10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
.kpi .val { font-size:24px; font-weight: 800; color: var(--blue); letter-spacing: -0.3px; }
.kpi .val small { font-size:13px; font-weight: 600; color: var(--muted); }

.table-wrap, .fc-wrap { margin: 0 48px; padding: 10px 18px 14px 18px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
table { width: 100%; border-collapse: collapse; font-size:14px; }
thead .cols th { font-size:10.5px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: var(--muted); padding: 5px 8px; border-bottom: 2px solid var(--ink); text-align: right; white-space: nowrap; }
thead .cols th:first-child { text-align: left; }
thead .grp th { font-size:11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; padding: 4px 8px; text-align: right; color: var(--ink); }
thead .grp th.ent { color: var(--green-dark); }
thead .grp th.sai { color: var(--red); }
tbody td { padding: 6.5px 8px; border-bottom: 1px solid var(--line); text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody td.cat { text-align: left; font-weight: 500; }
tbody tr.zero td { color: #9AA8B5; }
tbody td.in { color: var(--green-dark); }
tbody td.out { color: var(--red); }
tbody tr.total td { font-weight: 700; color: var(--blue); border-top: 2px solid var(--ink); border-bottom: none; background: var(--soft); }
tbody tr.total td:first-child { border-radius: 0 0 0 8px; }
tbody tr.total td:last-child { border-radius: 0 0 8px 0; }
td.strong { font-weight: 700; }

.chart-wrap { margin: 8px 48px 0 48px; padding: 12px 18px 8px 18px; flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
.chart1, .chart2 { margin: 0 48px 10px 48px; padding: 12px 18px 10px 18px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
.chart-row > div, .content > div, .charts > div:not(.charts-bottom), .charts-bottom > div, .bottom-row > div { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
.chart-title { font-size:12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; display: flex; align-items: center; gap: 18px; }
.legend { display: flex; gap: 16px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
.legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.legend .sw.bar { background: var(--blue); }
.legend .sw.line { background: var(--green); border-radius: 50%; height: 4px; width: 16px; vertical-align: 2px; }

svg text.axis, .axis text { font-family: 'Archivo'; font-size:11.5px; fill: var(--muted); font-weight: 600; }
text.axis.dense { font-size:9px; }
.vlbl { font-family: 'Archivo'; font-size:11.5px; fill: var(--blue); font-weight: 700; }
.vlbl.w { fill: #fff; }
.vlbl.h { paint-order: stroke; stroke: #fff; stroke-width: 1.2px; stroke-linejoin: round; font-weight: 600; }
.vlbl.dense { font-size:9px; }
.vlbl.dense.h { stroke-width: 1px; }
.llbl { font-family: 'Archivo'; font-size:11px; fill: var(--green-dark); font-weight: 600; paint-order: stroke; stroke: #fff; stroke-width: 1.5px; stroke-linejoin: round; }
.llbl.w { fill: #fff; stroke-width: 0; }
.llbl.dense { font-size:8.5px; stroke-width: 1.5px; }
.llbl.dense.w { stroke-width: 0; }
.barlbl { font-family: 'Archivo'; font-size:11.5px; fill: var(--blue); font-weight: 700; }
.linelbl { font-family: 'Archivo'; font-size:11px; fill: #fff; font-weight: 600; }

.panels { display: flex; gap: 16px; padding: 0 48px; }
.panel { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: #fff; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
.panel h3 { font-size:12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.caption { font-size:11px; color: var(--muted); margin-top: 6px; }

.page-foot { display: flex; align-items: center; justify-content: space-between; padding: 6px 48px 14px 48px; font-size:12px; color: var(--muted); margin-top: auto; }
.page-foot .num { font-weight: 800; color: var(--blue); font-size:14.5px; }
.bottom-rule { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: var(--blue); }
.bottom-rule::after { content:''; position:absolute; bottom:4px; left:0; right:0; height:2px; background: var(--green); }
`;

export function pageShell({ kicker, title, pageNum, logoSrc, fazenda, body, extraCss = '' }) {
  const kickerTxt = fazenda ? `${kicker} · ${fazenda}` : kicker;
  const ti = title.indexOf(' · ');
  const titleHtml = ti > 0
    ? `${esc(title.slice(0, ti))} <span class="t-sub">· ${esc(title.slice(ti + 3))}</span>`
    : esc(title);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${BASE_CSS}${extraCss}</style>
</head>
<body>
<div class="page">
  <div class="page-head">
    <div class="title-block">
      <h1>${titleHtml}</h1>
      <div class="kicker">${esc(kickerTxt)}</div>
    </div>
    ${logoSrc ? `<img class="page-logo" src="${esc(logoSrc)}" alt="">` : ''}
  </div>
${body}
  <div class="page-foot">
    <div>Vision'Up · Gesta'Up Intelligence</div>
    <div>@gestaup.company</div>
    <div class="num">${esc(String(pageNum).padStart(2, '0'))}</div>
  </div>
  <div class="bottom-rule"></div>
</div>
</body>
</html>`;
}
