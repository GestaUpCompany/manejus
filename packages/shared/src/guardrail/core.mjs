// Guardrail: nenhuma requisição mutável pode alcançar outra fazenda além da fazenda de testes.
//
// Núcleo PURO (sem dependências, sem I/O) usado pelo CLI de teste (scripts/teste-api.mjs) e, no futuro,
// pelo cliente do app e por hooks. Política: FALHA FECHADA. Qualquer requisição mutável cujo escopo de
// fazenda não possa ser PROVADO a partir da própria requisição é abortada com GuardrailError.
//
// Por que não confiar só na RLS: várias tabelas ainda têm policies `true` de escrita (qualquer usuário
// logado, de qualquer fazenda), então a RLS não é um limite suficiente. Esta trava confere o fazenda_id
// no corpo/filtro ANTES de enviar.

export const FAZENDA_TESTES_ID = 'd649c65e-16ab-4b77-a84b-df937aa41cc3'
export const SUPABASE_PROJECT_REF = 'nrwljcvhwbezmoummxbl'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tabelas que nunca podem ser alteradas por este canal, mesmo com filtro de fazenda. */
export const TABELAS_PROIBIDAS = new Set([
  'fazendas',
  'usuarios',
  'usuario_fazenda',
  'grupos_fazenda',
  'peoes',
  'impersonation_sessions',
  'audit_log',
  'ia_config_global',
])

/** RPCs de leitura, reconhecidas pelo prefixo do nome (convenção do schema). */
const RPC_LEITURA_RE = /^(get|calcular|calculate|listar|obter|resumo)_[a-z0-9_]+$/

export class GuardrailError extends Error {
  constructor(mensagem, detalhe = {}) {
    super(`[GUARDRAIL] ${mensagem}`)
    this.name = 'GuardrailError'
    this.detalhe = detalhe
  }
}

function falhar(mensagem, detalhe) {
  throw new GuardrailError(mensagem, detalhe)
}

/** Aborta a execução se o id não for EXATAMENTE a fazenda de testes (UUID puro, sem sufixos). */
export function assertFazendaDeTestes(fazendaId, permitido = FAZENDA_TESTES_ID) {
  if (
    typeof fazendaId !== 'string' ||
    !UUID_RE.test(fazendaId) ||
    fazendaId.toLowerCase() !== String(permitido).toLowerCase()
  ) {
    falhar(`fazenda_id "${String(fazendaId)}" não é a fazenda de testes (${permitido}). Execução cancelada.`, {
      fazendaId,
      permitido,
    })
  }
  return permitido
}

/**
 * Aborta se o ambiente não for o de teste. Não existe banco de teste separado: "ambiente de teste" é o
 * projeto Supabase conhecido + a fazenda de testes configurada explicitamente + fora de produção.
 */
export function assertAmbienteDeTeste({ nodeEnv, supabaseUrl, fazendaConfigurada } = {}) {
  if (nodeEnv === 'production') {
    falhar('NODE_ENV=production: o guardrail de teste não roda em produção.', { nodeEnv })
  }
  let host
  try {
    host = new URL(supabaseUrl).hostname
  } catch {
    falhar('URL do Supabase ausente ou inválida.', { supabaseUrl })
  }
  if (host !== `${SUPABASE_PROJECT_REF}.supabase.co`) {
    falhar(`Projeto Supabase inesperado (${host}). Esperado ${SUPABASE_PROJECT_REF}.`, { host })
  }
  assertFazendaDeTestes(fazendaConfigurada)
}

function lerCorpoJson(body, contexto) {
  if (typeof body !== 'string' || body.trim() === '') {
    falhar(`${contexto}: corpo ausente ou não textual; não é possível provar a fazenda.`, { body: typeof body })
  }
  try {
    return JSON.parse(body)
  } catch {
    falhar(`${contexto}: corpo não é JSON válido.`)
  }
}

function verificarAuth(metodo, path, u) {
  const permitido =
    (metodo === 'POST' && path === '/auth/v1/token' && ['password', 'refresh_token'].includes(u.searchParams.get('grant_type'))) ||
    (metodo === 'POST' && path === '/auth/v1/logout') ||
    (metodo === 'GET' && path === '/auth/v1/user')
  if (!permitido) falhar(`Endpoint de autenticação não permitido: ${metodo} ${path}`, { metodo, path })
}

function verificarRpc(metodo, path, u, body, opcoes, permitido) {
  const fn = decodeURIComponent(path.slice('/rest/v1/rpc/'.length))
  if (metodo !== 'POST' && metodo !== 'GET') falhar(`Método não permitido em RPC: ${metodo}`, { fn })
  if (RPC_LEITURA_RE.test(fn)) return
  if (opcoes.rpcsVerificadas && opcoes.rpcsVerificadas.has(fn)) return

  const params = metodo === 'POST' ? lerCorpoJson(body, `RPC ${fn}`) : Object.fromEntries(u.searchParams)
  if (params && typeof params === 'object' && 'p_fazenda_id' in params) {
    assertFazendaDeTestes(params.p_fazenda_id, permitido)
    return
  }
  falhar(`RPC "${fn}" não é de leitura e não traz p_fazenda_id: não há como provar a fazenda. Abortado.`, { fn })
}

function verificarTabela(metodo, path, u, body, permitido) {
  const tabela = decodeURIComponent(path.slice('/rest/v1/'.length))
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return // leitura é livre
  if (TABELAS_PROIBIDAS.has(tabela)) falhar(`Tabela "${tabela}" não pode ser alterada por este canal.`, { tabela })

  if (metodo === 'POST' || metodo === 'PUT') {
    const dados = lerCorpoJson(body, `${metodo} ${tabela}`)
    const linhas = Array.isArray(dados) ? dados : [dados]
    if (linhas.length === 0) falhar(`${metodo} ${tabela}: lista vazia.`)
    for (const linha of linhas) {
      if (!linha || typeof linha !== 'object') falhar(`${metodo} ${tabela}: linha inválida.`)
      assertFazendaDeTestes(linha.fazenda_id, permitido)
    }
    return
  }

  if (metodo === 'PATCH' || metodo === 'DELETE') {
    // Todos os parâmetros da query são combinados com AND no PostgREST: basta existir fazenda_id=eq.<teste>.
    const alvo = `eq.${permitido.toLowerCase()}`
    const ok = u.searchParams.getAll('fazenda_id').some((v) => v.toLowerCase() === alvo)
    if (!ok) falhar(`${metodo} ${tabela} sem o filtro fazenda_id=eq.${permitido}. Abortado.`, { tabela })
    if (metodo === 'PATCH') {
      const dados = lerCorpoJson(body, `PATCH ${tabela}`)
      if (dados && typeof dados === 'object' && 'fazenda_id' in dados) assertFazendaDeTestes(dados.fazenda_id, permitido)
    }
    return
  }

  falhar(`Método não permitido em tabela: ${metodo}`, { tabela })
}

/**
 * Valida UMA requisição HTTP ao Supabase. Lança GuardrailError se não puder provar que ela só toca a
 * fazenda de testes. Leituras (GET/HEAD) de tabelas passam; todo o resto é falha fechada.
 *
 * opcoes.fazendaPermitida   (padrão: FAZENDA_TESTES_ID)
 * opcoes.hostsPermitidos    (padrão: o host do projeto)
 * opcoes.rpcsVerificadas    Set de RPCs que o CHAMADOR já provou, por outro meio, pertencerem à fazenda de testes
 * opcoes.functionsPermitidas lista de Edge Functions permitidas
 */
export function assertRequisicaoPermitida({ method, url, body } = {}, opcoes = {}) {
  const permitido = opcoes.fazendaPermitida ?? FAZENDA_TESTES_ID
  const metodo = String(method || 'GET').toUpperCase()

  let u
  try {
    u = new URL(url)
  } catch {
    falhar('URL da requisição inválida.', { url })
  }
  const hosts = opcoes.hostsPermitidos ?? [`${SUPABASE_PROJECT_REF}.supabase.co`]
  if (!hosts.includes(u.hostname)) falhar(`Host não permitido: ${u.hostname}`, { host: u.hostname })

  const path = u.pathname
  if (path.startsWith('/auth/v1/')) return verificarAuth(metodo, path, u)
  if (path.startsWith('/rest/v1/rpc/')) return verificarRpc(metodo, path, u, body, opcoes, permitido)
  if (path.startsWith('/rest/v1/')) return verificarTabela(metodo, path, u, body, permitido)
  if (path.startsWith('/storage/v1/')) {
    if (['GET', 'HEAD'].includes(metodo)) return
    falhar('Escrita em storage não é permitida por este canal.', { path })
  }
  if (path.startsWith('/functions/v1/')) {
    const nome = path.slice('/functions/v1/'.length).split('/')[0]
    if ((opcoes.functionsPermitidas ?? []).includes(nome)) return
    falhar(`Edge Function "${nome}" não permitida por este canal.`, { nome })
  }
  falhar(`Endpoint desconhecido: ${path}`, { path })
}

async function normalizarRequisicao(input, init) {
  const textual = (b) => (b === undefined || b === null || typeof b === 'string' ? b : '__corpo_nao_textual__')
  if (typeof input === 'string' || input instanceof URL) {
    return { url: String(input), method: init.method, body: textual(init.body) }
  }
  const method = init.method ?? input.method
  let body = init.body
  if (body === undefined && !['GET', 'HEAD'].includes(String(method).toUpperCase())) {
    body = await input.clone().text()
  }
  return { url: input.url, method, body: textual(body) }
}

/** Envolve um `fetch`: se a requisição violar a regra, lança GuardrailError e o fetch real NUNCA é chamado. */
export function criarFetchGuardado(fetchReal, opcoes = {}) {
  return async function fetchGuardado(input, init = {}) {
    assertRequisicaoPermitida(await normalizarRequisicao(input, init), opcoes)
    return fetchReal(input, init)
  }
}
