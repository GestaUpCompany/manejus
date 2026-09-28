import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireFromHere = createRequire(import.meta.url)

let cachedScript = null

function resolveLocalUmd() {
  // Tenta achar o UMD do Chart.js no filesystem. Em dev ele vem de
  // node_modules/chart.js/dist/chart.umd.min.js. Em Vercel, o vercel.json
  // deve incluir esse arquivo no bundle da função.
  const candidates = []
  try {
    const mainPath = requireFromHere.resolve('chart.js')
    candidates.push(join(dirname(mainPath), 'chart.umd.min.js'))
    candidates.push(join(dirname(mainPath), 'chart.umd.js'))
  } catch {}
  candidates.push(join(process.cwd(), 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'))
  candidates.push(join(process.cwd(), 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}

async function fetchFromCdn() {
  // Fallback de rede: usado se o UMD não foi incluído no bundle. Só atinge
  // a internet se o arquivo local estiver ausente.
  const res = await fetch('https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js')
  if (!res.ok) throw new Error(`Chart.js CDN respondeu ${res.status}`)
  return res.text()
}

export async function getChartJsScript() {
  if (cachedScript) return cachedScript
  const localPath = resolveLocalUmd()
  if (localPath) {
    cachedScript = readFileSync(localPath, 'utf8')
    return cachedScript
  }
  cachedScript = await fetchFromCdn()
  return cachedScript
}
