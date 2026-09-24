import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Card, Input } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import {
  carregarLancamentoTratos,
  limparReaisLancamento,
  parseKgLancamento,
  salvarLancamentosTratos,
  type LancamentoTratoLinha,
  type LancamentoTratosData,
} from '../../services/lancamentoTratosService'
import type { TipoProgramacao } from '../../services/programacaoTratosService'
import { toFarmDateOnly } from '../../utils/formatDate'

const TIPOS: { value: TipoProgramacao; label: string }[] = [
  { value: 'confinamento', label: 'Confinamento' },
  { value: 'sequestro', label: 'Sequestro' },
  { value: 'tip', label: 'TIP' },
]

function hojeISO(): string {
  return toFarmDateOnly(new Date().toISOString()) || new Date().toISOString().slice(0, 10)
}

function formatarNumero(valor: number | null, casas = 1): string {
  if (valor == null || !Number.isFinite(valor)) return '—'
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function classeReal(valor: number | null): string {
  if (valor != null && valor < 0) return 'border-red-500 bg-red-50 text-red-700 focus:border-red-600'
  if (valor == null) return 'border-yellow-400 bg-white focus:border-primary'
  return 'border-green-500 bg-green-50 text-green-800 focus:border-green-600'
}

function totalRealizadoLinha(linha: LancamentoTratoLinha): number | null {
  const preenchidos = linha.tratos.filter((trato) => trato.kgReal != null)
  if (preenchidos.length === 0) return null
  return preenchidos.reduce((sum, trato) => sum + (trato.kgReal ?? 0), 0)
}

function focarTratoAbaixo(linhaIndex: number, ordemTrato: number) {
  const proximo = document.querySelector<HTMLInputElement>(
    `input[data-linha-index="${linhaIndex + 1}"][data-ordem-trato="${ordemTrato}"]`
  )
  if (!proximo) return
  proximo.focus()
  proximo.select()
}

const REGEX_REAL = /^-?\d{0,4}([.,]\d{0,2})?$/

function chaveTrato(curralId: string, ordemTrato: number): string {
  return `${curralId}:${ordemTrato}`
}

function numeroFolha(valor: number | null, casas = 1): string {
  if (valor == null || !Number.isFinite(valor)) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function FolhaTratoImpressao({ dados, fazendaNome, fazendaLogoUrl, tipoLabel }: { dados: LancamentoTratosData; fazendaNome: string; fazendaLogoUrl?: string | null; tipoLabel: string }) {
  const quantidadeTratos = dados.linhas.reduce((maior, linha) => Math.max(maior, linha.quantidadeTratos), 0)
  return (
    <div className="trato-print-root" aria-hidden="true">
      <div className="trato-print-brand">
        <div className="trato-print-brand-side">
          <img src="/images/manejus360.png" alt="Manej'Us 360" />
          <span>Manej'Us <b>360</b></span>
        </div>
        <div className="trato-print-brand-side">
          {fazendaLogoUrl && <img src={fazendaLogoUrl} alt={fazendaNome} />}
          <span>{fazendaNome}</span>
        </div>
      </div>
      <h1>Folha de Trato {tipoLabel} - {fazendaNome}</h1>
      <div className="trato-print-meta">
        <span>Data do Trato: {formatarData(dados.data)}</span>
        <span>Tipo de programação: {tipoLabel}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Lote</th>
            <th rowSpan={2}>Curral</th>
            <th rowSpan={2}>Dieta em Uso</th>
            <th rowSpan={2}>Qtd. Cab.</th>
            <th rowSpan={2}>Trato Anterior (kg)</th>
            <th rowSpan={2}>Leitura do Dia</th>
            <th rowSpan={2}>Trato Diário Previsto (kg)</th>
            <th rowSpan={2}>Consumo Dia (kg/cab/dia)</th>
            {Array.from({ length: quantidadeTratos }, (_, index) => <th key={index} colSpan={2}>{index + 1}º Trato</th>)}
            <th rowSpan={2}>Total Previsto (kg)</th>
          </tr>
          <tr>
            {Array.from({ length: quantidadeTratos }, (_, index) => (
              <Fragment key={index}><th>Previsto</th><th>Real</th></Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.linhas.map((linha) => (
            <tr key={linha.curralId}>
              <td>{linha.loteNome}</td>
              <td>{linha.curralNome}</td>
              <td>{linha.dietaNome || ''}</td>
              <td>{linha.quantidadeCabecas ?? ''}</td>
              <td>{numeroFolha(linha.tratoAnteriorKg)}</td>
              <td>{linha.leituraDia ?? ''}</td>
              <td>{numeroFolha(linha.kgBaseDia)}</td>
              <td>{numeroFolha(linha.consumoKgCabDia, 2)}</td>
              {linha.tratos.map((trato) => (
                <Fragment key={trato.ordemTrato}>
                  <td>{numeroFolha(trato.kgPlanejado)}</td>
                  <td className="trato-print-real" />
                </Fragment>
              ))}
              {Array.from({ length: quantidadeTratos - linha.tratos.length }, (_, index) => (
                <Fragment key={index}><td /><td className="trato-print-real" /></Fragment>
              ))}
              <td>{numeroFolha(linha.tratos.reduce((sum, trato) => sum + (trato.kgPlanejado || 0), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LancamentoTratos() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [data, setData] = useState(hojeISO)
  const [tipo, setTipo] = useState<TipoProgramacao>('confinamento')
  const [linhas, setLinhas] = useState<LancamentoTratoLinha[]>([])
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [programacaoId, setProgramacaoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const resultado = await carregarLancamentoTratos(fazendaId, data, tipo)
      setProgramacaoId(resultado?.programacaoId || null)
      setLinhas(resultado?.linhas || [])
      setEditando({})
    } catch (err) {
      console.error('Erro ao carregar lançamento de tratos:', err)
      setProgramacaoId(null)
      setLinhas([])
      setError('Não foi possível carregar a programação de tratos.')
    } finally {
      setLoading(false)
    }
  }, [fazendaId, data, tipo])

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id).then(setFazendaId).catch(() => setError('Não foi possível identificar a fazenda.'))
  }, [user])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const quantidadeTratos = useMemo(
    () => linhas.reduce((maior, linha) => Math.max(maior, linha.quantidadeTratos), 0),
    [linhas]
  )

  const atualizarReal = (curralId: string, ordemTrato: number, valor: string) => {
    if (!REGEX_REAL.test(valor)) return
    const kgReal = parseKgLancamento(valor)
    setEditando((atuais) => ({ ...atuais, [chaveTrato(curralId, ordemTrato)]: valor }))
    setLinhas((atuais) => atuais.map((linha) => {
      if (linha.curralId !== curralId) return linha
      return {
        ...linha,
        tratos: linha.tratos.map((trato) => trato.ordemTrato === ordemTrato ? { ...trato, kgReal } : trato),
      }
    }))
    setSuccess(null)
  }

  const finalizarEdicao = (curralId: string, ordemTrato: number) => {
    setEditando((atuais) => {
      const copia = { ...atuais }
      delete copia[chaveTrato(curralId, ordemTrato)]
      return copia
    })
  }

  const preencherRealComPrevisto = (curralId: string) => {
    setLinhas((atuais) => atuais.map((linha) => {
      if (linha.curralId !== curralId) return linha
      return {
        ...linha,
        tratos: linha.tratos.map((trato) => ({
          ...trato,
          kgReal: trato.kgPlanejado == null ? null : Math.round(trato.kgPlanejado * 100) / 100,
        })),
      }
    }))
    setSuccess(null)
  }

  const limparRealLinha = (curralId: string) => {
    setLinhas((atuais) => atuais.map((linha) => {
      if (linha.curralId !== curralId) return linha
      return {
        ...linha,
        tratos: linha.tratos.map((trato) => ({ ...trato, kgReal: null })),
      }
    }))
    setSuccess(null)
  }

  const limparTodosReais = () => {
    setLinhas((atuais) => limparReaisLancamento(atuais))
    setSuccess(null)
  }

  const salvar = async () => {
    if (!fazendaId || !programacaoId || !user) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await salvarLancamentosTratos({
        fazendaId,
        data,
        programacaoId,
        nomeUsuario: user.nome,
        linhas,
      })
      setLinhas((atuais) => limparReaisLancamento(atuais))
      setSuccess('Lançamentos salvos com sucesso.')
    } catch (err) {
      console.error('Erro ao salvar lançamento de tratos:', err)
      const mensagem = err && typeof err === 'object' && 'message' in err && err.message
        ? String(err.message)
        : 'Não foi possível salvar os lançamentos. Verifique os campos e tente novamente.'
      setError(mensagem)
    } finally {
      setSaving(false)
    }
  }

  const imprimir = () => window.print()

  const dados = fazendaId && programacaoId ? { fazendaId, data, tipo, programacaoId, linhas } : null
  const tratosPreenchidos = linhas.reduce((total, linha) => total + linha.tratos.filter((trato) => trato.kgReal !== null).length, 0)
  const avisos = linhas.flatMap((linha) => {
    const faltantes: string[] = []
    if (!linha.loteId) faltantes.push('sem lote vinculado')
    if (!linha.dietaNome) faltantes.push('sem dieta ativa')
    if (!linha.quantidadeCabecas) faltantes.push('sem cabeças ativas')
    return faltantes.length ? [`${linha.curralNome} (${linha.loteNome}): ${faltantes.join(', ')}`] : []
  })

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Lançamento de Tratos</h1>
          <p className="text-sm text-content-muted mt-1">Digite os valores reais da folha de campo por curral.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={imprimir} disabled={!dados || linhas.length === 0}>Imprimir Folha de Trato</Button>
          <Button onClick={salvar} disabled={!dados || saving || tratosPreenchidos === 0}>{saving ? 'Salvando...' : 'Salvar lançamentos'}</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <Input label="Data do trato" type="date" value={data} onChange={(event) => setData(event.target.value)} />
          <div>
            <label className="block text-sm font-medium text-content mb-1">Tipo de programação</label>
            <select value={tipo} onChange={(event) => setTipo(event.target.value as TipoProgramacao)} className="w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-primary">
              {TIPOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="text-sm text-content-muted sm:text-right">{loading ? 'Carregando...' : `${linhas.length} curral(is), ${quantidadeTratos} trato(s) no dia`}</div>
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">{success}</div>}
      {!loading && avisos.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">Dados incompletos em {avisos.length} curral(is):</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
          </ul>
        </div>
      )}

      {!loading && !programacaoId && (
        <Card className="p-8 text-center text-content-muted">
          <p className="font-semibold">Nenhuma programação ativa para {formatarData(data)}.</p>
          <p className="text-sm mt-1">Configure a programação antes de lançar ou imprimir os tratos.</p>
        </Card>
      )}

      {!loading && programacaoId && linhas.length === 0 && (
        <Card className="p-8 text-center text-content-muted">A programação selecionada não possui currais configurados.</Card>
      )}

      {linhas.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[1350px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2 text-content-muted">
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Lote</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Curral</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Dieta</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Cab.</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Trato anterior</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-center">Leitura</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Previsto</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">kg/cab/dia</th>
                  {Array.from({ length: quantidadeTratos }, (_, index) => <th key={index} colSpan={2} className="border border-border-base px-3 py-2 text-center">{index + 1}º Trato</th>)}
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Total previsto</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Total realizado</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>Ações</span>
                      <button type="button" title="Limpar todos os tratos realizados" onClick={limparTodosReais} disabled={tratosPreenchidos === 0} className="rounded-md border border-border-base bg-surface-1 px-2 py-1 text-xs font-medium text-content-muted hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed">Limpar tudo</button>
                    </div>
                  </th>
                </tr>
                <tr className="bg-surface-2 text-xs text-content-muted">
                  {Array.from({ length: quantidadeTratos }, (_, index) => <Fragment key={index}><th className="border border-border-base px-3 py-1 text-right">Previsto</th><th className="border border-border-base px-3 py-1 text-right">Real</th></Fragment>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, linhaIndex) => (
                  <tr key={linha.curralId} className="odd:bg-surface-1 even:bg-surface-2/40">
                    <td className="border border-border-base px-3 py-3 font-semibold text-content-strong">{linha.loteNome}</td>
                    <td className="border border-border-base px-3 py-3 text-content">{linha.curralNome}</td>
                    <td className="border border-border-base px-3 py-3 text-content-muted">{linha.dietaNome || '—'}</td>
                    <td className="border border-border-base px-3 py-3 text-right">{linha.quantidadeCabecas ?? '—'}</td>
                    <td className="border border-border-base px-3 py-3 text-right">{formatarNumero(linha.tratoAnteriorKg)}</td>
                    <td className="border border-border-base px-3 py-3 text-center">{linha.leituraDia ?? '—'}{linha.ajusteLeituraPct != null ? ` (${linha.ajusteLeituraPct > 0 ? '+' : ''}${linha.ajusteLeituraPct}%)` : ''}</td>
                    <td className="border border-border-base px-3 py-3 text-right font-semibold">{formatarNumero(linha.kgBaseDia)}</td>
                    <td className="border border-border-base px-3 py-3 text-right">{formatarNumero(linha.consumoKgCabDia, 2)}</td>
                    {linha.tratos.map((trato) => (
                      <Fragment key={trato.ordemTrato}>
                        <td className="border border-border-base px-3 py-3 text-right font-semibold">{formatarNumero(trato.kgPlanejado)}</td>
                        <td className="border border-border-base px-2 py-2 text-right">
                          <input aria-label={`Real ${linha.loteNome}, trato ${trato.ordemTrato}`} data-linha-index={linhaIndex} data-ordem-trato={trato.ordemTrato} className={`w-20 rounded-md border-2 px-2 py-2 text-right font-semibold outline-none ${classeReal(trato.kgReal)}`} inputMode="decimal" value={editando[chaveTrato(linha.curralId, trato.ordemTrato)] ?? (trato.kgReal == null ? '' : String(trato.kgReal).replace('.', ','))} onChange={(event) => atualizarReal(linha.curralId, trato.ordemTrato, event.target.value)} onBlur={() => finalizarEdicao(linha.curralId, trato.ordemTrato)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); focarTratoAbaixo(linhaIndex, trato.ordemTrato) } }} />
                        </td>
                      </Fragment>
                    ))}
                    <td className="border border-border-base px-3 py-3 text-right font-semibold">{formatarNumero(linha.tratos.reduce((sum, trato) => sum + (trato.kgPlanejado || 0), 0))}</td>
                    <td className="border border-border-base px-3 py-3 text-right font-semibold text-content-strong">{formatarNumero(totalRealizadoLinha(linha))}</td>
                    <td className="border border-border-base px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" title="Preencher realizado com o previsto" onClick={() => preencherRealComPrevisto(linha.curralId)} className="rounded-md border border-border-base bg-surface-2 px-2 py-1 text-xs font-medium text-content-muted hover:bg-surface-1 hover:text-content">= previsto</button>
                        <button type="button" title="Limpar tratos realizados desta linha" onClick={() => limparRealLinha(linha.curralId)} className="rounded-md border border-border-base bg-surface-2 px-2 py-1 text-xs font-medium text-content-muted hover:bg-red-50 hover:text-red-700 hover:border-red-300">Limpar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dados && linhas.length > 0 && createPortal(
        <FolhaTratoImpressao
          dados={dados}
          fazendaNome={fazenda?.nome || ''}
          fazendaLogoUrl={fazenda?.logo_url}
          tipoLabel={TIPOS.find((item) => item.value === tipo)?.label ?? tipo}
        />,
        document.body
      )}
    </div>
  )
}
