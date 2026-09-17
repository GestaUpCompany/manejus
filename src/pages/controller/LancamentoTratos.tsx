import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
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
} from '../../services/lancamentoTratosService'
import { baixarPlanilhaTratosCampo } from '../../utils/planilhaTratosCampo'
import type { TipoProgramacao } from '../../services/programacaoTratosService'

const TIPOS: { value: TipoProgramacao; label: string }[] = [
  { value: 'engorda', label: 'Engorda' },
  { value: 'sequestro', label: 'Sequestro' },
  { value: 'tip', label: 'TIP' },
]

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
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
  if (valor == null) return 'border-yellow-400 bg-white focus:border-primary'
  return 'border-green-500 bg-green-50 text-green-800 focus:border-green-600'
}

export function LancamentoTratos() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [data, setData] = useState(hojeISO)
  const [tipo, setTipo] = useState<TipoProgramacao>('engorda')
  const [linhas, setLinhas] = useState<LancamentoTratoLinha[]>([])
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
    const kgReal = parseKgLancamento(valor)
    setLinhas((atuais) => atuais.map((linha) => {
      if (linha.curralId !== curralId) return linha
      return {
        ...linha,
        tratos: linha.tratos.map((trato) => trato.ordemTrato === ordemTrato ? { ...trato, kgReal } : trato),
      }
    }))
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
      setError('Não foi possível salvar os lançamentos. Verifique os campos e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const baixar = async () => {
    if (!dados || !fazenda?.nome) return
    await baixarPlanilhaTratosCampo(dados, fazenda.nome)
  }

  const dados = fazendaId && programacaoId ? { fazendaId, data, tipo, programacaoId, linhas } : null
  const tratosPreenchidos = linhas.reduce((total, linha) => total + linha.tratos.filter((trato) => trato.kgReal !== null).length, 0)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Lançamento de Tratos</h1>
          <p className="text-sm text-content-muted mt-1">Digite os valores reais da folha de campo por curral.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={baixar} disabled={!dados || linhas.length === 0}>Baixar Folha de Trato</Button>
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
            <table className="min-w-[1250px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2 text-content-muted">
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Lote</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Curral</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-left">Dieta em uso</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Cab.</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Trato anterior</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-center">Leitura</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Previsto dia</th>
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">kg/cab/dia</th>
                  {Array.from({ length: quantidadeTratos }, (_, index) => <th key={index} colSpan={2} className="border border-border-base px-3 py-2 text-center">{index + 1}º Trato</th>)}
                  <th rowSpan={2} className="border border-border-base px-3 py-2 text-right">Total projetado</th>
                </tr>
                <tr className="bg-surface-2 text-xs text-content-muted">
                  {Array.from({ length: quantidadeTratos }, (_, index) => <Fragment key={index}><th className="border border-border-base px-3 py-1 text-right">Previsto</th><th className="border border-border-base px-3 py-1 text-right">Real</th></Fragment>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
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
                          <input aria-label={`Real ${linha.loteNome}, trato ${trato.ordemTrato}`} className={`w-24 rounded-md border-2 px-2 py-2 text-right font-semibold outline-none ${classeReal(trato.kgReal)}`} inputMode="decimal" value={trato.kgReal == null ? '' : String(trato.kgReal).replace('.', ',')} onChange={(event) => atualizarReal(linha.curralId, trato.ordemTrato, event.target.value)} />
                        </td>
                      </Fragment>
                    ))}
                    <td className="border border-border-base px-3 py-3 text-right font-semibold">{formatarNumero(linha.tratos.reduce((sum, trato) => sum + (trato.kgPlanejado || 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
