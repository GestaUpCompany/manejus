// Paginação em fluxo, dirigida pelo conteúdo real.
//
// Em vez de cada relatório decidir páginas com limites fixos de linhas ("uma
// tabela = uma página"), o relatório declara BLOCOS dentro de <section
// class="flow">. Dentro do Chromium, ANTES de os gráficos serem desenhados, o
// motor mede a altura real de cada bloco (e de cada linha de tabela) com a
// largura e o CSS reais da página, empacota os blocos em páginas e divide as
// tabelas só quando necessário. Assim a quantidade de páginas é a mínima que
// o conteúdo exige, para qualquer volume de dados, e linhas que quebram texto
// em várias linhas são tratadas corretamente (sem estimativas).
//
// Marcação (gerada pelos helpers abaixo):
//   <section class="flow" data-page-class="x">
//     <template data-flow-head>…renderHeader com __SEC__/__LBL__…</template>
//     <template data-flow-foot>…rodapé…</template>
//     <div class="fb" data-sec=".." data-lbl="..">…bloco indivisível…</div>
//     <div class="table-block fb fb-table">…<h3 class="table-title">…<table>…</div>
//   </section>
//
// Regras do empacotador (packFlow, função pura testada em flow.test.ts):
//  - Bloco indivisível vai para a próxima página se não couber (a menos que a
//    página esteja vazia: então fica sozinho e é sinalizado como estouro).
//  - Tabela divide por linhas; cada fatia repete título e cabeçalho; uma
//    fatia só começa na página se couberem título + cabeçalho + as primeiras
//    `minRows` linhas (nunca página só com cabeçalho).
//  - `data-break="before"` força início de página.
//  - `data-keep-next="1"` (blocos de título/introdução) mantém o bloco na
//    mesma página do próximo; se não couberem juntos, ambos vão adiante.

import { escapeHtml } from './formatters.js'

/**
 * @param {number} capacity altura útil da página (px), já descontado o cabeçalho
 * @param {Array<{kind:'fixed'|'table', h?:number, mb?:number, breakBefore?:boolean,
 *   titleH?:number, headH?:number, rowsH?:number[], minRows?:number}>} blocks
 * @returns {Array<Array<{i:number, from?:number, to?:number}>>}
 */
export function packFlow(capacity, blocks) {
  const TOL = 0.5
  const pages = [[]]
  let used = 0
  const newPage = () => {
    if (pages[pages.length - 1].length > 0) pages.push([])
    used = 0
  }
  // Espaço mínimo que o bloco seguinte exige para começar na mesma página.
  const startNeed = (b) => {
    if (!b) return 0
    if (b.kind === 'fixed') return (b.h || 0) + (b.mb || 0)
    const rows = b.rowsH || []
    const take = Math.min(b.minRows || 2, rows.length)
    let need = (b.titleH || 0) + (b.headH || 0)
    for (let k = 0; k < take; k += 1) need += rows[k]
    return need
  }
  blocks.forEach((b, i) => {
    if (b.breakBefore && used > 0) newPage()
    // keepNext: título/introdução nunca fica sozinho no fim da página.
    if (b.keepNext && used > 0 && b.kind === 'fixed' && used + (b.h || 0) + (b.mb || 0) + startNeed(blocks[i + 1]) > capacity + TOL) newPage()
    if (b.kind === 'fixed') {
      const need = (b.h || 0) + (b.mb || 0)
      if (used > 0 && used + need > capacity + TOL) newPage()
      pages[pages.length - 1].push({ i })
      used += need
      return
    }
    const rows = b.rowsH || []
    const n = rows.length
    const head = (b.titleH || 0) + (b.headH || 0)
    const minRows = b.minRows || 2
    if (n === 0) return
    let start = 0
    while (start < n) {
      const minTake = Math.min(minRows, n - start)
      let minNeed = head
      for (let k = 0; k < minTake; k += 1) minNeed += rows[start + k]
      if (used > 0 && used + minNeed > capacity + TOL) {
        newPage()
        continue
      }
      let take = 0
      let h = head
      while (start + take < n && used + h + rows[start + take] <= capacity + TOL) {
        h += rows[start + take]
        take += 1
      }
      if (take === 0) {
        take = minTake
        h = minNeed
      }
      const end = start + take
      pages[pages.length - 1].push({ i, from: start, to: end })
      used += h + (end >= n ? b.mb || 0 : 0)
      start = end
      if (start < n) newPage()
    }
  })
  return pages.filter((p) => p.length > 0)
}

/* eslint-disable */
// Roda no Chromium (serializada com toString). Só usa escopo próprio.
function paginateFlows(packFlow) {
  var slice = Array.prototype.slice
  var flows = slice.call(document.querySelectorAll('section.flow'))
  var overflow = (window.__flowOverflow = window.__flowOverflow || [])
  function esc(s) {
    var d = document.createElement('div')
    d.textContent = s || ''
    return d.innerHTML
  }
  function px(v) {
    return parseFloat(v) || 0
  }
  function outer(el) {
    var cs = getComputedStyle(el)
    return el.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom)
  }
  flows.forEach(function (flow) {
    var headTpl = flow.querySelector('template[data-flow-head]').innerHTML
    var footTpl = flow.querySelector('template[data-flow-foot]').innerHTML
    var pageClass = flow.getAttribute('data-page-class') || ''
    var blocks = slice.call(flow.children).filter(function (el) {
      return el.classList && el.classList.contains('fb')
    })
    function mkPage(sec, lbl) {
      var p = document.createElement('section')
      p.className = 'page' + (pageClass ? ' ' + pageClass : '')
      p.innerHTML = headTpl.replace('__SEC__', esc(sec)).replace('__LBL__', esc(lbl)) + footTpl
      return p
    }
    var probe = mkPage('', '')
    probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden'
    document.body.appendChild(probe)
    var pcs = getComputedStyle(probe)
    var header = probe.querySelector('.report-header')
    var headerH = header ? outer(header) : 0
    var capacity = probe.clientHeight - px(pcs.paddingTop) - px(pcs.paddingBottom) - headerH

    var rowNodes = []
    var measured = blocks.map(function (el, idx) {
      var isTable = el.classList.contains('fb-table')
      var info = {
        kind: isTable ? 'table' : 'fixed',
        breakBefore: el.getAttribute('data-break') === 'before',
        keepNext: el.getAttribute('data-keep-next') === '1',
        minRows: parseInt(el.getAttribute('data-min-rows') || '2', 10),
      }
      probe.appendChild(el)
      var cs = getComputedStyle(el)
      info.mb = px(cs.marginBottom)
      if (isTable) {
        var title = el.querySelector('.table-title')
        var thead = el.querySelector('thead')
        var rows = slice.call(el.querySelectorAll('tbody > tr'))
        rowNodes[idx] = rows
        var tableEl = el.querySelector('table')
        info.titleH = title ? outer(title) : 0
        // Conteúdo extra do bloco (ex.: nota entre título e tabela) conta
        // junto ao título, pois não se repete nem se divide.
        var extra = el.getBoundingClientRect().height - info.titleH - (tableEl ? tableEl.getBoundingClientRect().height : 0)
        if (extra > 1) info.titleH += extra
        info.headH = (thead ? thead.getBoundingClientRect().height : 0) + 2
        info.rowsH = rows.map(function (r) {
          return r.getBoundingClientRect().height
        })
      } else {
        info.h = el.getBoundingClientRect().height + px(cs.marginTop)
      }
      probe.removeChild(el)
      return info
    })
    document.body.removeChild(probe)

    ;(window.__flowDebug = window.__flowDebug || []).push({ capacity: capacity, measured: measured })
    var plan = packFlow(capacity, measured)
    var lastSec = ''
    var lastLbl = ''
    plan.forEach(function (entries) {
      var first = blocks[entries[0].i]
      lastSec = first.getAttribute('data-sec') || lastSec
      lastLbl = first.getAttribute('data-lbl') || lastLbl
      var page = mkPage(lastSec, lastLbl)
      var footer = page.querySelector('.report-footer')
      entries.forEach(function (en) {
        var el = blocks[en.i]
        if (en.from === undefined) {
          page.insertBefore(el, footer)
          return
        }
        var all = rowNodes[en.i]
        if (en.from === 0 && en.to >= all.length) {
          page.insertBefore(el, footer)
          return
        }
        var wrap = el.cloneNode(false)
        var title = el.querySelector('.table-title')
        if (title) {
          var tc = title.cloneNode(true)
          if (en.from > 0 && tc.firstChild && tc.firstChild.nodeType === 3) {
            tc.firstChild.nodeValue = tc.firstChild.nodeValue + ' (continuação)'
          }
          wrap.appendChild(tc)
        }
        var table = el.querySelector('table')
        var tcl = table.cloneNode(false)
        slice.call(table.children).forEach(function (child) {
          if (child.tagName !== 'TBODY') tcl.appendChild(child.cloneNode(true))
        })
        var tbody = document.createElement('tbody')
        all.slice(en.from, en.to).forEach(function (tr) {
          tbody.appendChild(tr)
        })
        tcl.appendChild(tbody)
        wrap.appendChild(tcl)
        page.insertBefore(wrap, footer)
      })
      flow.parentNode.insertBefore(page, flow)
      var limite = page.getBoundingClientRect().bottom - px(getComputedStyle(page).paddingBottom)
      var fundo = 0
      slice.call(page.children).forEach(function (c) {
        if (c.classList.contains('fb')) fundo = Math.max(fundo, c.getBoundingClientRect().bottom)
      })
      if (fundo > limite + 1) {
        overflow.push({ section: lastSec, excesso: Math.round(fundo - limite) })
        if (window.console) console.warn('[flow] página com conteúdo estourando:', lastSec)
      }
    })
    flow.parentNode.removeChild(flow)
  })
}

// Numera "Página X de Y" em todas as páginas (inclusive capa/encerramento e
// relatórios sem fluxo) com base no DOM final.
function numberPages() {
  var pages = Array.prototype.slice.call(document.querySelectorAll('section.page'))
  var total = pages.length
  pages.forEach(function (page, idx) {
    Array.prototype.slice.call(page.querySelectorAll('span,div')).forEach(function (el) {
      if (el.children.length === 0 && /^Página \d+ de \d+$/.test((el.textContent || '').trim())) {
        el.textContent = 'Página ' + (idx + 1) + ' de ' + total
      }
    })
  })
}
/* eslint-enable */

export const FLOW_ENGINE_JS = `(function(){var packFlow=${packFlow.toString()};var paginate=${paginateFlows.toString()};window.__paginateFlows=function(){paginate(packFlow)};window.__numberPages=${numberPages.toString()};})();`

export const FLOW_CSS = `
.fb{margin-bottom:3mm}
.fb.fb-table{margin-bottom:5mm}
.fb-intro{display:flex;align-items:center;justify-content:space-between;gap:10px}
.fb-intro .section-kicker{margin:0}
.fb-intro .period-badge{margin-bottom:0;font-size:13px;padding:4px 10px}
`

// === Helpers de marcação usados pelos relatórios ===

function attrs({ sec, lbl, breakBefore, minRows, keepNext } = {}) {
  return `${keepNext ? ' data-keep-next="1"' : ''}${sec ? ` data-sec="${escapeHtml(sec)}"` : ''}${lbl ? ` data-lbl="${escapeHtml(lbl)}"` : ''}${breakBefore ? ' data-break="before"' : ''}${minRows ? ` data-min-rows="${minRows}"` : ''}`
}

/** Bloco indivisível (KPIs, gráficos, insights, notas). */
export function flowBlock(html, opts = {}) {
  if (!html) return ''
  return `<div class="fb"${attrs(opts)}>${html}</div>`
}

/**
 * Tabela divisível. `tableHtml` é o HTML padrão `<div class="table-block">
 * <h3 class="table-title">…</h3><table>…</table></div>` já usado pelos
 * relatórios; apenas marcamos o wrapper. Sem linhas no <tbody> → omitido.
 */
export function flowTable(tableHtml, opts = {}) {
  if (!tableHtml || !/<tbody>\s*<tr/.test(tableHtml)) return ''
  return tableHtml.replace('<div class="table-block">', `<div class="table-block fb fb-table"${attrs(opts)}>`)
}

/** Faixa "kicker + selo do período" na mesma linha (cabeçalho condensado). */
export function flowIntro(kickerText, badgeHtml) {
  return `<div class="fb-intro"><p class="section-kicker">${escapeHtml(kickerText)}</p>${badgeHtml}</div>`
}

/**
 * Monta a seção de fluxo. `headerHtml` deve ser gerado com
 * renderHeader({section:'__SEC__', sectionLabel:'__LBL__'}); `footerHtml`
 * com renderFooter (a numeração real é aplicada por numberPages no browser).
 */
export function flowSection({ headerHtml, footerHtml, blocks, pageClass = '' }) {
  const content = blocks.filter(Boolean).join('')
  if (!content) return ''
  return `<section class="flow"${pageClass ? ` data-page-class="${escapeHtml(pageClass)}"` : ''}><template data-flow-head>${headerHtml}</template><template data-flow-foot>${footerHtml}</template>${content}</section>`
}
