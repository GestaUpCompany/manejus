import { useEffect, useMemo, useState } from 'react'
import { useAuth, getFazendaIdForUser } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card } from '@gestaup/ui'

interface ItemComposicao {
  insumo_id: string
  nome: string
  tipo: string | null
  formula_teor_ms: number
  ordem: number
  teor_ms: number | null
  preco_ton_mn: number | null
}

interface CategoriaGmd {
  categoria: string
  gmd: number
  ordem: number
}

interface Conteudo {
  dados: Record<string, any>
  composicao: ItemComposicao[]
  categorias_gmd: CategoriaGmd[]
}

type Origem = 'edicao_dieta' | 'alteracao_insumo' | 'backfill'

interface VersaoDieta extends Conteudo {
  id: string
  versao: number
  origem: Origem
  vigente_desde: string
  vigente_ate: string | null
  motivo: string | null
}

interface Segmento extends Conteudo {
  plano_id: string
  plano_nome: string
  plano_inicio: string
  plano_fim: string | null
  formulacao_id: string
  versao: number
  segmento_inicio: string
  segmento_fim: string | null
  origem: Origem
  motivo: string | null
}

interface Opcao {
  id: string
  nome: string
}

interface MudancaCampo {
  campo: string
  de: unknown
  para: unknown
}

interface Diferenca {
  campos: MudancaCampo[]
  adicionados: ItemComposicao[]
  removidos: ItemComposicao[]
  alterados: { nome: string; mudancas: MudancaCampo[] }[]
  gmd: { de: string; para: string } | null
}

const ORIGEM_LABEL: Record<Origem, string> = {
  edicao_dieta: 'Edição da dieta',
  alteracao_insumo: 'Alteração de insumo',
  backfill: 'Estado inicial',
}

const CAMPOS_DIETA: [string, string][] = [
  ['nome', 'Nome'],
  ['tipo', 'Tipo'],
  ['consumo_ms_percent_pv', 'Meta MS (%PV)'],
  ['sistema_producao', 'Sistema de produção'],
  ['forma_fornecimento', 'Forma de fornecimento'],
  ['kg_por_saco', 'kg por saco'],
  ['ativo', 'Ativa'],
  ['e_creep', 'Creep'],
  ['e_premix', 'Premix'],
  ['custo_total', 'Custo (R$/ton MN)'],
]

const CAMPOS_INSUMO: [keyof ItemComposicao, string][] = [
  ['formula_teor_ms', 'Inclusão (%)'],
  ['teor_ms', 'Teor de MS (%)'],
  ['preco_ton_mn', 'Preço (R$/ton MN)'],
]

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function exibir(valor: unknown): string {
  if (valor == null || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (typeof valor === 'number') return fmt(valor)
  return String(valor)
}

function formatarData(iso: string | null): string {
  if (!iso || iso.startsWith('infinity')) return 'atual'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba', dateStyle: 'short', timeStyle: 'short' })
}

function formatarDataSimples(iso: string | null): string {
  if (!iso) return 'em andamento'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')
}

const iguais = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function textoGmd(categorias: CategoriaGmd[]): string {
  return categorias.map((c) => `${c.categoria} ${fmt(c.gmd, 3)}`).join(' · ')
}

function diferenca(anterior: Conteudo | null, atual: Conteudo): Diferenca {
  if (!anterior) return { campos: [], adicionados: [], removidos: [], alterados: [], gmd: null }

  const campos = CAMPOS_DIETA
    .filter(([chave]) => !iguais(anterior.dados[chave], atual.dados[chave]))
    .map(([chave, rotulo]) => ({ campo: rotulo, de: anterior.dados[chave], para: atual.dados[chave] }))

  const antigos = new Map(anterior.composicao.map((i) => [i.insumo_id, i]))
  const novos = new Set(atual.composicao.map((i) => i.insumo_id))

  const adicionados = atual.composicao.filter((i) => !antigos.has(i.insumo_id))
  const removidos = anterior.composicao.filter((i) => !novos.has(i.insumo_id))
  const alterados = atual.composicao.flatMap((i) => {
    const antes = antigos.get(i.insumo_id)
    if (!antes) return []
    const mudancas = CAMPOS_INSUMO
      .filter(([chave]) => !iguais(antes[chave], i[chave]))
      .map(([chave, rotulo]) => ({ campo: rotulo, de: antes[chave], para: i[chave] }))
    return mudancas.length ? [{ nome: i.nome, mudancas }] : []
  })

  const gmdAntes = textoGmd(anterior.categorias_gmd)
  const gmdDepois = textoGmd(atual.categorias_gmd)
  const gmd = gmdAntes !== gmdDepois ? { de: gmdAntes || '—', para: gmdDepois || '—' } : null

  return { campos, adicionados, removidos, alterados, gmd }
}

function BlocoVersao({
  origem,
  motivo,
  conteudo,
  diff,
  primeira,
}: {
  origem: Origem
  motivo: string | null
  conteudo: Conteudo
  diff: Diferenca
  primeira: boolean
}) {
  const semMudanca =
    !diff.campos.length && !diff.adicionados.length && !diff.removidos.length && !diff.alterados.length && !diff.gmd

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-black/5 px-2 py-0.5 text-xs font-medium text-content-strong dark:bg-white/10">
          {ORIGEM_LABEL[origem]}
        </span>
      </div>

      {motivo && <p className="text-sm italic text-content-muted">Motivo: {motivo}</p>}

      {primeira && <p className="text-sm text-content-muted">Sem versão anterior desta dieta para comparar.</p>}
      {!primeira && semMudanca && <p className="text-sm text-content-muted">Sem alteração de composição ou parâmetros.</p>}

      {!primeira && !semMudanca && (
        <ul className="space-y-1 text-sm">
          {diff.campos.map((m) => (
            <li key={m.campo} className="text-content-strong">
              <span className="font-medium">{m.campo}:</span> {exibir(m.de)} → {exibir(m.para)}
            </li>
          ))}
          {diff.adicionados.map((i) => (
            <li key={`add-${i.insumo_id}`} className="text-emerald-700 dark:text-emerald-400">
              + {i.nome} ({fmt(i.formula_teor_ms)}%)
            </li>
          ))}
          {diff.removidos.map((i) => (
            <li key={`rem-${i.insumo_id}`} className="text-rose-700 dark:text-rose-400">
              − {i.nome}
            </li>
          ))}
          {diff.alterados.map((a) => (
            <li key={a.nome} className="text-amber-700 dark:text-amber-400">
              {a.nome}:{' '}
              {a.mudancas.map((m) => `${m.campo} ${exibir(m.de)} → ${exibir(m.para)}`).join(' · ')}
            </li>
          ))}
          {diff.gmd && (
            <li className="text-content-strong">
              <span className="font-medium">GMD por categoria:</span> {diff.gmd.de} → {diff.gmd.para}
            </li>
          )}
        </ul>
      )}

      {conteudo.composicao.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs text-content-muted">
                <th className="py-1 pr-3 font-medium">Insumo</th>
                <th className="py-1 pr-3 text-right font-medium">Inclusão (%)</th>
                <th className="py-1 pr-3 text-right font-medium">Teor MS (%)</th>
                <th className="py-1 text-right font-medium">Preço (R$/ton MN)</th>
              </tr>
            </thead>
            <tbody>
              {conteudo.composicao.map((i) => (
                <tr key={i.insumo_id} className="border-b border-border-base/50 text-content-strong">
                  <td className="py-1 pr-3">{i.nome}</td>
                  <td className="py-1 pr-3 text-right">{fmt(i.formula_teor_ms)}</td>
                  <td className="py-1 pr-3 text-right">{fmt(i.teor_ms)}</td>
                  <td className="py-1 text-right">{fmt(i.preco_ton_mn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function HistoricoDietas() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [aba, setAba] = useState<'dieta' | 'lote'>('dieta')
  const [dietas, setDietas] = useState<Opcao[]>([])
  const [lotes, setLotes] = useState<Opcao[]>([])
  const [dietaId, setDietaId] = useState('')
  const [loteId, setLoteId] = useState('')
  const [versoes, setVersoes] = useState<VersaoDieta[]>([])
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id).then((id) => setFazendaId(id ?? null))
  }, [user])

  useEffect(() => {
    if (!fazendaId) return
    supabase
      .from('formulacoes')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .order('nome')
      .then(({ data }) => setDietas((data ?? []) as Opcao[]))
    supabase
      .from('lotes')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .order('nome')
      .then(({ data }) => setLotes((data ?? []) as Opcao[]))
  }, [fazendaId])

  useEffect(() => {
    if (!dietaId) {
      setVersoes([])
      return
    }
    let ativo = true
    setCarregando(true)
    setErro(null)
    supabase
      .from('formulacoes_versoes')
      .select('id, versao, origem, vigente_desde, vigente_ate, motivo, dados, composicao, categorias_gmd')
      .eq('formulacao_id', dietaId)
      .order('versao', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) setErro('Não foi possível carregar o histórico desta dieta.')
        setVersoes((data ?? []) as VersaoDieta[])
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [dietaId])

  useEffect(() => {
    if (!fazendaId || !loteId) {
      setSegmentos([])
      return
    }
    let ativo = true
    setCarregando(true)
    setErro(null)
    supabase
      .rpc('linha_nutricional_lote', { p_fazenda_id: fazendaId, p_lote_id: loteId })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) setErro('Não foi possível carregar a linha nutricional deste lote.')
        setSegmentos((data ?? []) as Segmento[])
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [fazendaId, loteId])

  // Linha do lote em ordem cronológica, com a versão anterior da mesma dieta para comparar
  const linha = useMemo(
    () => [...segmentos].sort((a, b) => Date.parse(a.segmento_inicio) - Date.parse(b.segmento_inicio)),
    [segmentos],
  )

  const planos = useMemo(() => {
    const mapa = new Map<string, { nome: string; inicio: string; fim: string | null; segs: Segmento[] }>()
    for (const s of segmentos) {
      const existente = mapa.get(s.plano_id)
      if (existente) existente.segs.push(s)
      else mapa.set(s.plano_id, { nome: s.plano_nome, inicio: s.plano_inicio, fim: s.plano_fim, segs: [s] })
    }
    return [...mapa.values()]
  }, [segmentos])

  const abas = [
    { id: 'dieta' as const, label: 'Por dieta' },
    { id: 'lote' as const, label: 'Por lote' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-content-strong">Histórico de Dietas</h2>
        <p className="text-sm text-content-muted">
          Alterações das dietas e de seus insumos, e a dieta que cada lote consumiu em cada período.
        </p>
      </div>

      <div className="flex gap-2">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              aba === a.id ? 'bg-emerald-600 text-white' : 'border border-border-base text-content-strong'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'dieta' && (
        <Card className="space-y-4 p-4">
          <label className="block text-sm font-medium text-content-strong">
            Dieta
            <select
              className="mt-1 w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong sm:w-96"
              value={dietaId}
              onChange={(e) => setDietaId(e.target.value)}
            >
              <option value="">Selecione uma dieta…</option>
              {dietas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>

          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          {carregando && <p className="text-sm text-content-muted">Carregando…</p>}
          {!carregando && dietaId && versoes.length === 0 && !erro && (
            <p className="text-sm text-content-muted">Nenhuma versão registrada para esta dieta.</p>
          )}

          <ol className="space-y-6">
            {versoes.map((v, idx) => {
              const anterior = versoes[idx + 1] ?? null
              return (
                <li key={v.id} className="border-l-2 border-border-base pl-4">
                  <div className="mb-2 text-sm font-semibold text-content-strong">
                    Versão {v.versao}
                    <span className="ml-2 font-normal text-content-muted">
                      vigente de {formatarData(v.vigente_desde)} até {formatarData(v.vigente_ate)}
                    </span>
                  </div>
                  <BlocoVersao
                    origem={v.origem}
                    motivo={v.motivo}
                    conteudo={v}
                    diff={diferenca(anterior, v)}
                    primeira={!anterior}
                  />
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {aba === 'lote' && (
        <Card className="space-y-4 p-4">
          <label className="block text-sm font-medium text-content-strong">
            Lote
            <select
              className="mt-1 w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong sm:w-96"
              value={loteId}
              onChange={(e) => setLoteId(e.target.value)}
            >
              <option value="">Selecione um lote…</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>

          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          {carregando && <p className="text-sm text-content-muted">Carregando…</p>}
          {!carregando && loteId && planos.length === 0 && !erro && (
            <p className="text-sm text-content-muted">Este lote não tem planos nutricionais com data de início.</p>
          )}

          {planos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-content-strong">Planos do lote</h3>
              <ul className="space-y-1 text-sm text-content-muted">
                {planos.map((p) => (
                  <li key={p.nome + p.inicio}>
                    <span className="font-medium text-content-strong">{p.nome}</span>: {formatarDataSimples(p.inicio)} até{' '}
                    {formatarDataSimples(p.fim)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="space-y-6">
            {linha.map((s, idx) => {
              const anterior = linha.slice(0, idx).reverse().find((x) => x.formulacao_id === s.formulacao_id) ?? null
              const trocouDieta = idx > 0 && linha[idx - 1].formulacao_id !== s.formulacao_id
              return (
                <li key={`${s.plano_id}-${s.versao}-${s.segmento_inicio}`} className="border-l-2 border-border-base pl-4">
                  <div className="mb-2 text-sm font-semibold text-content-strong">
                    {s.plano_nome} · Versão {s.versao}
                    <span className="ml-2 font-normal text-content-muted">
                      de {formatarData(s.segmento_inicio)} até {formatarData(s.segmento_fim)}
                    </span>
                  </div>
                  {trocouDieta && (
                    <p className="mb-2 text-xs font-medium uppercase text-amber-700 dark:text-amber-400">Troca de dieta</p>
                  )}
                  <BlocoVersao
                    origem={s.origem}
                    motivo={s.motivo}
                    conteudo={s}
                    diff={diferenca(anterior, s)}
                    primeira={!anterior}
                  />
                </li>
              )
            })}
          </ol>
        </Card>
      )}
    </div>
  )
}
