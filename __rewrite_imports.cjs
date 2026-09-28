// Reescreve imports relativos que apontam para modulos movidos para packages/*.
// Estrategia: normaliza o specifier (remove ./ ../ e extensao) e casa contra a
// tabela de modulos movidos. Arquivos dentro do proprio pacote destino mantem
// imports relativos (evita auto-import pelo barrel).
const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/USER/Documents/GestaUp-Cadernetas-Gestao'

const moved = [
  ['services/supabaseClient', '@gestaup/supabase'],
  ['contexts/AuthContext', '@gestaup/shared'],
  ['services/authService', '@gestaup/shared'],
  ['services/fazendasService', '@gestaup/shared'],
  ['services/gruposService', '@gestaup/shared'],
  ['services/usuariosService', '@gestaup/shared'],
  ['services/usuarioFazendaService', '@gestaup/shared'],
  ['hooks/useTheme', '@gestaup/shared'],
  ['hooks/useKeyboardShortcuts', '@gestaup/shared'],
  ['hooks/useFazendaQueries', '@gestaup/shared'],
  ['utils/formatDate', '@gestaup/shared'],
  ['utils/parseValorBR', '@gestaup/shared'],
  ['utils/pinHash', '@gestaup/shared'],
  ['utils/fazendaContext', '@gestaup/shared'],
  ['utils/exportCSV', '@gestaup/shared'],
  ['utils/exportXLSX', '@gestaup/shared'],
  ['utils/comprimirDocumento', '@gestaup/shared'],
  ['components/ui', '@gestaup/ui'],
  ['ui', '@gestaup/ui'],
]

const pkgSrc = {
  '@gestaup/supabase': path.resolve(ROOT, 'packages/supabase/src'),
  '@gestaup/shared': path.resolve(ROOT, 'packages/shared/src'),
  '@gestaup/ui': path.resolve(ROOT, 'packages/ui/src'),
}

function normalize(spec) {
  return spec.replace(/^(\.\.?\/)*/, '').replace(/\.(tsx?|jsx?)$/, '')
}

function targetPkg(tail) {
  for (const [key, pkg] of moved) {
    if (tail === key || tail.endsWith('/' + key) || key.endsWith('/' + tail)) return pkg
    if (key === 'components/ui' && (tail === 'components/ui' || tail.startsWith('components/ui/'))) return pkg
    if (key === 'ui' && (tail === 'ui' || tail.startsWith('ui/'))) return pkg
  }
  return null
}

const re = /(from\s+['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g

function processFile(f) {
  const dir = path.dirname(f)
  const src = fs.readFileSync(f, 'utf8')
  const out = src.replace(re, (m, pre, spec, q) => {
    const pkg = targetPkg(normalize(spec))
    if (!pkg) return m
    if (dir.startsWith(pkgSrc[pkg])) return m // intra-pacote
    return pre + pkg + q
  })
  if (out !== src) { fs.writeFileSync(f, out); return true }
  return false
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p)
  }
  return acc
}

const targets = [
  path.resolve(ROOT, 'apps/manejus/src'),
  path.resolve(ROOT, 'packages/supabase/src'),
  path.resolve(ROOT, 'packages/shared/src'),
  path.resolve(ROOT, 'packages/ui/src'),
]

let changed = 0
for (const t of targets) {
  for (const f of walk(t, [])) {
    if (processFile(f)) { changed++; console.log('UPDATED', path.relative(ROOT, f)) }
  }
}
console.log('total atualizado:', changed)
