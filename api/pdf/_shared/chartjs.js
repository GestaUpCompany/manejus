// Carrega o build UMD do Chart.js do node_modules uma única vez por processo e
// entrega como string pronta para ser injetada inline no HTML que vai para o
// Puppeteer. Fazer isso no servidor evita que o cliente rasterize gráficos em
// PNG base64 (que inflava o payload até estourar o limite de body do endpoint).
//
// Vercel inclui automaticamente arquivos referenciados por require.resolve() no
// bundle da função, então isso funciona tanto local quanto em produção.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireFromHere = createRequire(import.meta.url)

let cachedScript = null

export function getChartJsScript() {
  if (cachedScript) return cachedScript
  // O package.json do chart.js não expõe o UMD em "exports" (nem o próprio
  // package.json), então resolvemos o entry principal e subimos um nível para
  // achar o diretório dist. O UMD existe no disco em
  // node_modules/chart.js/dist/chart.umd.min.js e é incluído no bundle da
  // função pela análise de arquivos do Vercel.
  const mainPath = requireFromHere.resolve('chart.js')
  const chartJsPath = join(dirname(mainPath), 'chart.umd.min.js')
  cachedScript = readFileSync(chartJsPath, 'utf8')
  return cachedScript
}
