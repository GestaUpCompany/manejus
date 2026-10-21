// Prévia local do HTML do PDF do relatório de Clima, com recarga automática.
//
// Para que serve: iterar o visual da página 1 (KPIs, gráficos Chart.js, tabelas)
// sem gerar PDF, subir a Vercel ou depender de dados reais. Importa a MESMA
// função do endpoint (`renderClimaHtml` em api/pdf/clima.js), então os gráficos
// são desenhados pelo mesmo código; ao salvar clima.js (ou algo em _shared/) a
// aba recarrega sozinha.
//
// Limites (ver CLAUDE.md): mostra o HTML que o Chromium converteria em PDF, não
// o PDF; quebras de página e impressão podem diferir um pouco. Os dados são
// SINTÉTICOS (9 pluviômetros, 5 datas): não toca o banco e não substitui
// conferir o PDF real de uma fazenda. Só escuta em 127.0.0.1.
//
// Uso (na pasta apps/manejus, ou `pnpm preview:clima` na raiz):
//   node scripts/preview-clima.mjs            # abre em http://127.0.0.1:5199
//   PREVIEW_PORT=5300 node scripts/preview-clima.mjs
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const esteArquivo = fileURLToPath(import.meta.url)
const raiz = path.resolve(path.dirname(esteArquivo), '..')
const pdfDir = path.join(raiz, 'api', 'pdf')

// Dados sintéticos no formato do relatório; mm por pluviômetro em cada data.
function dadosExemplo() {
  const datas = ['2026-09-01', '2026-09-22', '2026-10-04', '2026-10-09', '2026-10-15']
  const mm = {
    '01': [15, 18, 85, 10, 30], '02': [12, 0, 64, 12, 30], '03': [12, 62, 64, 15, 29],
    '04': [12, 58, 64, 15, 29], '05': [22, 0, 90, 22, 44], '06': [17, 21, 84, 38, 38],
    '07': [12, 18, 50, 32, 15], '08': [8, 29, 80, 35, 36], '09': [10, 22, 72, 32, 28],
  }
  const registros = []
  for (const [nome, vals] of Object.entries(mm)) {
    vals.forEach((v, i) => {
      if (v > 0) {
        registros.push({
          registro_id: `${nome}-${i}`, data: datas[i], horario: '07:00', pluviometro_id: nome, pluviometro_nome: nome,
          pluviometro_localizacao: null, medicao_mm: v, temperatura: null, temperatura_media: null,
          umidade_relativa: null, responsavel: 'Teste', nome_usuario: null, observacao: null,
        })
      }
    })
  }
  const acumulado = Object.fromEntries(Object.keys(mm).map((k) => [k, 0]))
  const serie = datas.map((d, i) => {
    for (const k of Object.keys(mm)) acumulado[k] += mm[k][i]
    const v = Object.values(acumulado)
    return {
      data: d, data_label: `${d.slice(8)}/${d.slice(5, 7)}`, temp_media: null,
      acum_fazenda: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2), acum_min: Math.min(...v), acum_max: Math.max(...v),
    }
  })
  const resumo = Object.entries(acumulado)
    .map(([k, tot]) => ({
      pluviometro_id: k, pluviometro_nome: k, pluviometro_localizacao: null,
      n_medicoes: mm[k].filter((x) => x > 0).length, mm_total: tot, mm_medio: tot / 5,
      maior_leitura: Math.max(...mm[k]), temp_min: null, temp_max: null,
    }))
    .sort((a, b) => b.mm_total - a.mm_total)
  const media = Object.values(acumulado).reduce((s, x) => s + x, 0) / 9
  return {
    dataInicio: '2026-09-01', dataFim: '2026-10-20', fazendaNome: 'Fazenda de exemplo (dados sintéticos)',
    logoGestao: '', logoFazenda: '',
    kpis: { mm_total: media, n_pluviometros: 9, n_leituras: registros.length, dias_com_chuva: 5, temp_media: null, temp_min: null, temp_max: null, umidade_media: null },
    pluviometros: Object.keys(mm), serie, resumo, registros,
  }
}

// Modo filho: imprime o HTML na saída padrão. Cada requisição roda num
// processo novo para não reaproveitar módulos em cache depois de uma edição.
if (process.argv.includes('--render')) {
  const { renderClimaHtml } = await import(pathToFileURL(path.join(pdfDir, 'clima.js')).href)
  process.stdout.write(await renderClimaHtml(dadosExemplo()))
  process.exit(0)
}

function renderizar() {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [esteArquivo, '--render'], { cwd: raiz })
    let out = ''
    let err = ''
    filho.stdout.on('data', (c) => (out += c))
    filho.stderr.on('data', (c) => (err += c))
    filho.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `saída ${code}`))))
  })
}

// Versão = data de modificação mais recente do que influencia o HTML.
function versao() {
  const arquivos = [esteArquivo, path.join(pdfDir, 'clima.js')]
  const shared = path.join(pdfDir, '_shared')
  for (const f of readdirSync(shared)) if (f.endsWith('.js')) arquivos.push(path.join(shared, f))
  return Math.max(...arquivos.map((f) => statSync(f).mtimeMs))
}

const RECARGA = `<script>(function(){var v=null;setInterval(function(){fetch('/__versao').then(function(r){return r.text()}).then(function(t){if(v===null)v=t;else if(t!==v)location.reload()}).catch(function(){})},800)})()</script>`

const porta = Number(process.env.PREVIEW_PORT) || 5199
createServer(async (req, res) => {
  if (req.url === '/__versao') {
    res.setHeader('Cache-Control', 'no-store')
    return res.end(String(versao()))
  }
  try {
    const html = await renderizar()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(html.replace('</body>', `${RECARGA}</body>`))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<meta charset="utf-8"><pre style="padding:16px;color:#b91c1c">Erro ao montar o HTML do relatório:\n\n${String(e.message).replace(/</g, '&lt;')}</pre>${RECARGA}`)
  }
}).listen(porta, '127.0.0.1', () => {
  console.log(`Prévia do relatório de Clima (dados sintéticos): http://127.0.0.1:${porta}`)
  console.log('Edite api/pdf/clima.js ou api/pdf/_shared/*.js: a aba recarrega sozinha. Ctrl+C para sair.')
})
