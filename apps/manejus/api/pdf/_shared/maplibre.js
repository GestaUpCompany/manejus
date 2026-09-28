import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireFromHere = createRequire(import.meta.url)

let cached = null

function resolveDist() {
  // Em dev vem de node_modules/maplibre-gl/dist. Em Vercel, o vercel.json
  // inclui esses arquivos no bundle da função via includeFiles.
  const files = { js: 'maplibre-gl.js', css: 'maplibre-gl.css' }
  const dirs = []
  try {
    const mainPath = requireFromHere.resolve('maplibre-gl')
    if (mainPath) dirs.push(dirname(mainPath))
  } catch {}
  dirs.push(join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist'))
  for (const dir of dirs) {
    const jsPath = join(dir, files.js)
    const cssPath = join(dir, files.css)
    if (existsSync(jsPath) && existsSync(cssPath)) return { jsPath, cssPath }
  }
  return null
}

function pkgVersion() {
  try {
    const pkgPath = requireFromHere.resolve('maplibre-gl/package.json')
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version
  } catch {
    return '5.24.0'
  }
}

async function fetchFromCdn() {
  // Fallback de rede: só atinge a internet se o dist local estiver ausente.
  const version = pkgVersion()
  const base = `https://cdn.jsdelivr.net/npm/maplibre-gl@${version}/dist`
  const [jsRes, cssRes] = await Promise.all([
    fetch(`${base}/maplibre-gl.js`),
    fetch(`${base}/maplibre-gl.css`),
  ])
  if (!jsRes.ok) throw new Error(`MapLibre CDN respondeu ${jsRes.status}`)
  return { script: await jsRes.text(), css: cssRes.ok ? await cssRes.text() : '' }
}

export async function getMaplibreAssets() {
  if (cached) return cached
  const local = resolveDist()
  if (local) {
    cached = { script: readFileSync(local.jsPath, 'utf8'), css: readFileSync(local.cssPath, 'utf8') }
    return cached
  }
  cached = await fetchFromCdn()
  return cached
}
