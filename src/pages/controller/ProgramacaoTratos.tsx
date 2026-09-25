import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton, Input } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import {
  SISTEMA_POR_TIPO,
  TipoProgramacao,
  VigenciaProgramacao,
  OcupacaoEmTrato,
  getOcupacoesEmTrato,
  getProgramacaoTratos,
  getTiposExistentes,
  getVigenciasProgramacao,
  saveProgramacaoTratos,
  setOcupacaoKgDia1,
} from '../../services/programacaoTratosService'
import { toFarmDateOnly } from '../../utils/formatDate'

interface PercentualTrato {
  ordem_trato: number
  percentual: string
  horario_sugerido: string
}

interface NotaLeituraConfig {
  id: string
  nota: number
  percentual_ajuste: number
  descricao: string | null
}

const DISTRIBUICAO_PADRAO_4: Record<number, string> = { 1: '30', 2: '20', 3: '20', 4: '30' }

const TIPOS: { value: TipoProgramacao; label: string }[] = [
  { value: 'confinamento', label: 'Confinamento' },
  { value: 'sequestro', label: 'Sequestro' },
  { value: 'tip', label: 'TIP' },
]

const DESCRICOES_FIXAS: Record<number, string> = {
  [-1]: 'Cocho vazio (lambido)',
  0: 'Cocho limpo (sem sobras)',
  1: 'Poucas sobras (rapinha)',
  2: 'Sobras moderadas',
  3: 'Sobras em excesso',
}

const NOTAS_ORDEM = [-1, 0, 1, 2, 3]
const DATA_FIM_SEM_FIM = '9999-12-31'

function hojeISO(): string {
  return toFarmDateOnly(new Date().toISOString()) || new Date().toISOString().slice(0, 10)
}

function formatarDataVigencia(iso: string): string {
  if (iso === DATA_FIM_SEM_FIM) return 'sem fim'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function ConfiguracaoTratos() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Tipos ativos (confinamento, sequestro, TIP, ou múltiplos)
  const [tiposAtivos, setTiposAtivos] = useState<TipoProgramacao[]>([])
  // Tipo atualmente selecionado para edição
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoProgramacao>('confinamento')

  // Vigências ativas de todos os tipos (para exibição)
  const [vigencias, setVigencias] = useState<VigenciaProgramacao[]>([])

  // Cronograma por tipo (quantidade de tratos, data de aplicação, percentuais)
  const [configs, setConfigs] = useState<Record<string, {
    quantidadeTratos: string
    dataInicio: string
    percentuais: PercentualTrato[]
  }>>({})

  // Ocupações abertas (fonte da seção "Currais em trato")
  const [ocupacoes, setOcupacoes] = useState<OcupacaoEmTrato[]>([])
  const [kgInputs, setKgInputs] = useState<Record<string, string>>({})
  const [savingPrevistos, setSavingPrevistos] = useState(false)
  const [salvoPrevistos, setSalvoPrevistos] = useState(false)
  const [erroPrevistos, setErroPrevistos] = useState<string | null>(null)

  // Leitura de cocho
  const [notasLeitura, setNotasLeitura] = useState<NotaLeituraConfig[]>([])
  const [editandoNotas, setEditandoNotas] = useState<Record<number, string>>({})
  const [savingNotas, setSavingNotas] = useState(false)
  const [salvoNotas, setSalvoNotas] = useState(false)
  const [erroNotas, setErroNotas] = useState<string | null>(null)

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    setLoadingFazenda(false)
  }, [user])

  useEffect(() => {
    loadFazenda()
  }, [loadFazenda])

  const loadData = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    setErro(null)

    const [tiposExistentes, progConfinamento, progSequestro, progTip, ocupacoesData, vigenciasData, notasData] = await Promise.all([
      getTiposExistentes(fazendaId),
      getProgramacaoTratos(fazendaId, 'confinamento'),
      getProgramacaoTratos(fazendaId, 'sequestro'),
      getProgramacaoTratos(fazendaId, 'tip'),
      getOcupacoesEmTrato(fazendaId),
      getVigenciasProgramacao(fazendaId),
      supabase
        .from('notas_leitura_cocho_config')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('nota', { ascending: true }),
    ])

    setTiposAtivos(tiposExistentes.length > 0 ? tiposExistentes : ['confinamento'])
    setVigencias(vigenciasData)
    setOcupacoes(ocupacoesData)
    setKgInputs(
      Object.fromEntries(
        ocupacoesData.map((o) => [o.ocupacao_id, o.kg_mn_dia_dia1 != null ? String(o.kg_mn_dia_dia1) : ''])
      )
    )

    const newConfigs: Record<string, { quantidadeTratos: string; dataInicio: string; percentuais: PercentualTrato[] }> = {}

    for (const [tipo, prog] of [['confinamento', progConfinamento], ['sequestro', progSequestro], ['tip', progTip]] as const) {
      if (prog.programacao) {
        newConfigs[tipo] = {
          quantidadeTratos: String(prog.programacao.quantidade_tratos),
          dataInicio: prog.programacao.data_inicio,
          percentuais: prog.percentuais.map((p) => ({
            ordem_trato: p.ordem_trato,
            percentual: String(p.percentual),
            horario_sugerido: p.horario_sugerido || '',
          })),
        }
      } else {
        newConfigs[tipo] = {
          quantidadeTratos: '4',
          dataInicio: hojeISO(),
          percentuais: distribuirPercentuais(4),
        }
      }
    }

    setConfigs(newConfigs)

    // Leitura de cocho
    if (notasData.error) {
      setErroNotas(notasData.error.message)
    } else if (notasData.data) {
      const notas = notasData.data as NotaLeituraConfig[]
      setNotasLeitura(notas)
      const editMap: Record<number, string> = {}
      notas.forEach(n => {
        editMap[n.nota] = String(n.percentual_ajuste)
      })
      setEditandoNotas(editMap)
    }

    setLoading(false)
  }, [fazendaId])

  useEffect(() => {
    if (fazendaId) loadData()
  }, [fazendaId, loadData])

  function distribuirPercentuais(n: number): PercentualTrato[] {
    if (n === 4) {
      return [1, 2, 3, 4].map((i) => ({
        ordem_trato: i,
        percentual: DISTRIBUICAO_PADRAO_4[i],
        horario_sugerido: '',
      }))
    }
    const igual = (100 / n).toFixed(1)
    return Array.from({ length: n }, (_, i) => ({
      ordem_trato: i + 1,
      percentual: igual,
      horario_sugerido: '',
    }))
  }

  const configAtual = configs[tipoSelecionado] || {
    quantidadeTratos: '4',
    dataInicio: hojeISO(),
    percentuais: distribuirPercentuais(4),
  }

  const handleQuantidadeTratosChange = (value: string) => {
    const n = parseInt(value) || 0
    setConfigs((prev) => ({
      ...prev,
      [tipoSelecionado]: {
        ...prev[tipoSelecionado],
        quantidadeTratos: value,
        percentuais: n > 0 ? distribuirPercentuais(n) : [],
      },
    }))
  }

  const handleDataInicioChange = (value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [tipoSelecionado]: {
        ...prev[tipoSelecionado],
        dataInicio: value,
      },
    }))
  }

  const handlePercentualChange = (ordem: number, campo: 'percentual' | 'horario_sugerido', value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [tipoSelecionado]: {
        ...prev[tipoSelecionado],
        percentuais: (prev[tipoSelecionado]?.percentuais || []).map((p) =>
          p.ordem_trato === ordem ? { ...p, [campo]: value } : p
        ),
      },
    }))
  }

  const handleOcupacaoKgChange = (ocupacaoId: string, value: string) => {
    setKgInputs((prev) => ({ ...prev, [ocupacaoId]: value }))
  }

  const handleAdicionarTipo = (tipo: TipoProgramacao) => {
    if (!tiposAtivos.includes(tipo)) {
      setTiposAtivos([...tiposAtivos, tipo])
      setTipoSelecionado(tipo)
    }
  }

  const somaPercentuais = useMemo(() => {
    return (configAtual.percentuais || []).reduce((sum, p) => sum + (parseFloat(p.percentual) || 0), 0)
  }, [configAtual])

  const ocupacoesDoTipo = useMemo(() => {
    const sistemaEsperado = SISTEMA_POR_TIPO[tipoSelecionado]
    return ocupacoes.filter((o) => o.lote_sistema === sistemaEsperado)
  }, [ocupacoes, tipoSelecionado])

  const vigenciasDoTipo = useMemo(
    () => vigencias.filter((v) => v.tipo === tipoSelecionado),
    [vigencias, tipoSelecionado]
  )
  const vigenciaCorrespondente = vigenciasDoTipo.find(
    (v) => v.data_inicio === configAtual.dataInicio
  )

  const percentuaisValidos = Math.abs(somaPercentuais - 100) < 0.01
  const horariosPreenchidos = (configAtual.percentuais || []).every((p) => p.horario_sugerido !== '')

  const podeSalvar =
    parseInt(configAtual.quantidadeTratos) > 0 &&
    Boolean(configAtual.dataInicio) &&
    (configAtual.percentuais || []).length > 0 &&
    percentuaisValidos &&
    horariosPreenchidos

  const handleSalvar = async () => {
    if (!fazendaId || !podeSalvar) return
    setSaving(true)
    setSalvo(false)
    setErro(null)

    const result = await saveProgramacaoTratos(fazendaId, tipoSelecionado, {
      quantidade_tratos: parseInt(configAtual.quantidadeTratos),
      data_inicio: configAtual.dataInicio,
      percentuais: (configAtual.percentuais || []).map((p) => ({
        ordem_trato: p.ordem_trato,
        percentual: parseFloat(p.percentual) || 0,
        horario_sugerido: p.horario_sugerido || null,
      })),
    })

    if (result.success) {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
      if (!tiposAtivos.includes(tipoSelecionado)) {
        setTiposAtivos([...tiposAtivos, tipoSelecionado])
      }
      await loadData()
    } else {
      setErro(result.error)
    }

    setSaving(false)
  }

  const haAlteracoesPrevistos = ocupacoesDoTipo.some((o) => {
    const editado = kgInputs[o.ocupacao_id] ?? ''
    const salvo = o.kg_mn_dia_dia1 != null ? String(o.kg_mn_dia_dia1) : ''
    return editado.trim() !== salvo
  })

  const handleSalvarPrevistos = async () => {
    if (!fazendaId) return
    setSavingPrevistos(true)
    setSalvoPrevistos(false)
    setErroPrevistos(null)

    let teveErro = false
    for (const o of ocupacoesDoTipo) {
      const editado = (kgInputs[o.ocupacao_id] ?? '').trim()
      const salvo = o.kg_mn_dia_dia1 != null ? String(o.kg_mn_dia_dia1) : ''
      if (editado === salvo) continue

      const valor = editado === '' ? null : parseFloat(editado)
      if (editado !== '' && (isNaN(valor!) || valor! < 0)) {
        teveErro = true
        continue
      }
      const result = await setOcupacaoKgDia1(o.ocupacao_id, valor ?? null)
      if (!result.success) teveErro = true
    }

    if (teveErro) {
      setErroPrevistos('Erro ao salvar um ou mais previstos. Verifique os valores informados.')
    } else {
      setSalvoPrevistos(true)
      setTimeout(() => setSalvoPrevistos(false), 3000)
      await loadData()
    }

    setSavingPrevistos(false)
  }

  // Leitura de cocho
  const handleNotaPercentualChange = (nota: number, valor: string) => {
    setEditandoNotas(prev => ({ ...prev, [nota]: valor }))
  }

  const haAlteracoesNotas = notasLeitura.some(n => {
    const editado = parseFloat(editandoNotas[n.nota] || '0')
    return !isNaN(editado) && editado !== Number(n.percentual_ajuste)
  })

  const handleSalvarNotas = async () => {
    if (!fazendaId) return
    setSavingNotas(true)
    setSalvoNotas(false)
    setErroNotas(null)

    let teveErro = false
    for (const notaConfig of notasLeitura) {
      const novoValor = parseFloat(editandoNotas[notaConfig.nota] || '0')
      if (isNaN(novoValor)) continue

      const { error } = await supabase
        .from('notas_leitura_cocho_config')
        .update({ percentual_ajuste: novoValor, updated_at: new Date().toISOString() })
        .eq('id', notaConfig.id)

      if (error) {
        console.error(`Erro ao salvar nota ${notaConfig.nota}:`, error)
        teveErro = true
      }
    }

    if (!teveErro) {
      setSalvoNotas(true)
      setTimeout(() => setSalvoNotas(false), 3000)
      // Recarregar notas
      const { data } = await supabase
        .from('notas_leitura_cocho_config')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('nota', { ascending: true })
      if (data) {
        const notas = data as NotaLeituraConfig[]
        setNotasLeitura(notas)
        const editMap: Record<number, string> = {}
        notas.forEach(n => {
          editMap[n.nota] = String(n.percentual_ajuste)
        })
        setEditandoNotas(editMap)
      }
    } else {
      setErroNotas('Erro ao salvar uma ou mais notas.')
    }

    setSavingNotas(false)
  }

  const getNotaStyle = (nota: number) => {
    switch (nota) {
      case -1:
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' }
      case 0:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' }
      case 1:
        return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-500' }
      case 2:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' }
      case 3:
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' }
      default:
        return { bg: 'bg-surface-2', border: 'border-border-base', text: 'text-content', badge: 'bg-surface-20' }
    }
  }

  const formatPercentual = (valor: number) => {
    if (valor > 0) return `+${valor}%`
    if (valor === 0) return '0%'
    return `${valor}%`
  }

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <CardSkeleton />
      </div>
    )
  }

  const tiposPodeSerAdicionados = TIPOS.filter((t) => !tiposAtivos.includes(t.value))

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Configuração de Tratos</h1>
        <p className="text-sm text-content-muted mt-1">
          Defina o cronograma de tratos, o previsto de matéria natural do primeiro dia por curral e os ajustes de leitura de cocho.
        </p>
      </div>

      {/* Card explicativo */}
      <Card className="p-4 bg-surface-2 border-border-base">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-primary dark:text-primary-light shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-content">
            <p className="font-medium mb-1">Como funciona</p>
            <p>
              Um curral entra na folha de tratos automaticamente quando um lote do sistema correspondente
              (Confinamento, Sequestro ou TIP) é alocado nele, e sai quando o lote sai. O cronograma define
              quantos tratos por dia, a distribuição percentual e os horários; ele não liga nem desliga o trato de nenhum curral.
            </p>
            <p className="mt-2">
              O <strong>previsto de MN do dia 1</strong> é a sugestão inicial de oferta para aquela ocupação, ajustada a
              partir do dia seguinte pela leitura de cocho. Sem previsto, o curral continua na folha e o operador
              define a primeira oferta na hora do trato.
            </p>
            <p className="mt-2">
              <strong>Exemplo:</strong> se a nota foi <strong>2</strong> (sobras moderadas) e a porcentagem é <strong>-5%</strong>, o tratador reduz 5% da quantidade de comida no próximo trato.
            </p>
          </div>
        </div>
      </Card>

      {erro && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-200 font-medium">Erro ao salvar configuração</p>
          <p className="text-xs text-red-500 mt-1">{erro}</p>
        </div>
      )}

      {/* Seletor de tipo + adicionar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tiposAtivos.map((tipo) => {
          const t = TIPOS.find((x) => x.value === tipo)
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => setTipoSelecionado(tipo)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoSelecionado === tipo
                  ? 'bg-primary text-white'
                  : 'bg-surface-1 text-content-muted border border-border-base hover:bg-surface-2'
              }`}
            >
              {t?.label || tipo}
            </button>
          )
        })}
        {tiposPodeSerAdicionados.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => handleAdicionarTipo(t.value)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-content-muted border border-dashed border-surface-3 hover:bg-surface-2 hover:text-content transition-colors"
          >
            + {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-bold text-content-strong mb-4">
              Cronograma de tratos: {TIPOS.find((t) => t.value === tipoSelecionado)?.label}
            </h2>

            {vigenciasDoTipo.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium text-content-muted">Versões do cronograma:</span>
                {vigenciasDoTipo.map((v) => {
                  const vigenteHoje = v.data_inicio <= hojeISO() && v.data_fim >= hojeISO()
                  const emEdicao = v.data_inicio === configAtual.dataInicio
                  return (
                    <span
                      key={v.id}
                      className={`px-2 py-0.5 rounded-full border ${
                        emEdicao
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : vigenteHoje
                            ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                            : 'border-border-base bg-surface-2 text-content-muted'
                      }`}
                    >
                      {formatarDataVigencia(v.data_inicio)} → {formatarDataVigencia(v.data_fim)}
                      {vigenteHoje ? ' (vigente)' : ''}
                    </span>
                  )
                })}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-content mb-1 leading-tight line-clamp-2">
                Quantidade de tratos por dia
              </label>
              <Input
                type="number"
                min={1}
                value={configAtual.quantidadeTratos}
                onChange={(e) => handleQuantidadeTratosChange(e.target.value)}
                placeholder="Ex: 4"
                className="border-border-base focus:border-accent max-w-[200px]"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Aplicar a partir de <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={configAtual.dataInicio}
                  onChange={(e) => handleDataInicioChange(e.target.value)}
                  className="border-border-base focus:border-accent"
                />
                <p className="text-xs text-content-muted mt-1">
                  O cronograma vale até a próxima versão; não é a data de início do confinamento dos lotes.
                </p>
              </div>
            </div>
            {vigenciasDoTipo.length > 0 && !vigenciaCorrespondente && configAtual.dataInicio && (
              <p className="-mt-4 mb-4 text-xs font-medium text-amber-600 dark:text-amber-400">
                A data não corresponde a uma versão existente. Ao salvar, uma nova versão será criada e as versões sobrepostas serão ajustadas automaticamente.
              </p>
            )}

            {/* Tabela de percentuais por trato */}
            <div>
              <h3 className="text-sm font-semibold text-content mb-2">Distribuição percentual por trato</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-border-base rounded-lg">
                  <thead className="bg-surface-2 text-xs text-content-muted uppercase">
                    <tr>
                      <th className="px-4 py-2">Trato</th>
                      <th className="px-4 py-2">Percentual (%)</th>
                      <th className="px-4 py-2">Horário sugerido <span className="text-red-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(configAtual.percentuais || []).map((p) => (
                      <tr key={p.ordem_trato}>
                        <td className="px-4 py-2 font-medium text-content-strong">{p.ordem_trato}º</td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={p.percentual}
                            onChange={(e) => handlePercentualChange(p.ordem_trato, 'percentual', e.target.value)}
                            className="w-24 border-border-base focus:border-accent"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="time"
                            value={p.horario_sugerido}
                            onChange={(e) => handlePercentualChange(p.ordem_trato, 'horario_sugerido', e.target.value)}
                            className="w-32 border-border-base focus:border-accent"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-2 font-medium">
                    <tr>
                      <td className="px-4 py-2 text-content">Total</td>
                      <td className="px-4 py-2">
                        <span className={percentuaisValidos ? 'text-green-500' : 'text-red-500'}>
                          {somaPercentuais.toFixed(1)}%
                        </span>
                        {!percentuaisValidos && (
                          <span className="text-xs text-red-500 ml-2">(deve somar 100%)</span>
                        )}
                      </td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Botão salvar cronograma */}
            <div className="flex justify-end gap-3 items-center mt-6">
              {salvo && (
                <span className="text-sm text-green-500 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Salvo!
                </span>
              )}
              <Button
                onClick={handleSalvar}
                disabled={!podeSalvar || saving}
                className="px-6"
              >
                {saving ? 'Salvando...' : 'Salvar cronograma'}
              </Button>
            </div>

            {!podeSalvar && (
              <p className="text-xs text-content-faint text-right mt-2">
                {!percentuaisValidos && 'Os percentuais devem somar 100%. '}
                {!horariosPreenchidos && 'Todos os horários sugeridos devem ser preenchidos. '}
                {parseInt(configAtual.quantidadeTratos) <= 0 && 'A quantidade de tratos deve ser maior que zero. '}
              </p>
            )}
          </Card>

          {/* Card: Currais em trato (ocupação + previsto dia 1) */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-bold text-content-strong mb-1">
              Currais em trato: {TIPOS.find((t) => t.value === tipoSelecionado)?.label}
            </h2>
            <p className="text-sm text-content-muted mb-4">
              Estes currais aparecem na folha de tratos porque estão ocupados por lotes deste sistema.
              O previsto de MN do dia 1 é a oferta sugerida no primeiro dia da ocupação; em branco, a folha
              mostra "a definir" e o operador informa no primeiro trato. Do dia 2 em diante, a oferta
              segue a leitura de cocho.
            </p>

            {erroPrevistos && (
              <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl mb-4">
                <p className="text-sm text-red-700 dark:text-red-200 font-medium">Erro ao salvar previstos</p>
                <p className="text-xs text-red-500 mt-1">{erroPrevistos}</p>
              </div>
            )}

            {ocupacoesDoTipo.length === 0 ? (
              <div className="p-4 bg-surface-2 border border-border-base rounded-lg text-sm text-content-muted text-center">
                Nenhum curral ocupado por lote de {TIPOS.find((t) => t.value === tipoSelecionado)?.label} nesta fazenda.
                Aloque um lote em um curral para que ele apareça aqui e na folha de tratos.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-border-base rounded-lg">
                  <thead className="bg-surface-2 text-xs text-content-muted uppercase">
                    <tr>
                      <th className="px-4 py-2">Curral</th>
                      <th className="px-4 py-2">Lote</th>
                      <th className="px-4 py-2">Entrada</th>
                      <th className="px-4 py-2">Previsto MN dia 1 (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ocupacoesDoTipo.map((o) => (
                      <tr key={o.ocupacao_id}>
                        <td className="px-4 py-2 font-medium text-content-strong">{o.curral_nome}</td>
                        <td className="px-4 py-2 text-content-muted">{o.lote_nome || '—'}</td>
                        <td className="px-4 py-2 text-content-muted">{formatarDataVigencia(o.data_inicial)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.1"
                              value={kgInputs[o.ocupacao_id] ?? ''}
                              onChange={(e) => handleOcupacaoKgChange(o.ocupacao_id, e.target.value)}
                              placeholder="a definir"
                              className="w-28 border-border-base focus:border-accent"
                            />
                            {o.kg_mn_dia_dia1 == null && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-300">
                                a definir
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ocupacoesDoTipo.length > 0 && (
              <div className="flex justify-end gap-3 items-center mt-6">
                {salvoPrevistos && (
                  <span className="text-sm text-green-500 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Previstos salvos
                  </span>
                )}
                <Button
                  onClick={handleSalvarPrevistos}
                  disabled={savingPrevistos || !haAlteracoesPrevistos}
                  className="px-6"
                >
                  {savingPrevistos ? 'Salvando...' : 'Salvar previstos'}
                </Button>
              </div>
            )}
          </Card>

          {/* Seção: Leitura de Cocho */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-bold text-content-strong mb-1">Leitura de Cocho</h2>
            <p className="text-sm text-content-muted mb-4">
              Configure a porcentagem de ajuste para cada nota de leitura de cocho. As notas são fixas e não podem ser alteradas.
            </p>

            {erroNotas && (
              <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl mb-4">
                <p className="text-sm text-red-700 dark:text-red-200 font-medium">Erro ao carregar configurações de leitura</p>
                <p className="text-xs text-red-500 mt-1">{erroNotas}</p>
              </div>
            )}

            {notasLeitura.length === 0 ? (
              <div className="p-6 bg-surface-2 rounded-xl border-2 border-border-base text-center">
                <p className="text-sm text-content-muted">
                  {fazendaId
                    ? `Nenhuma configuração encontrada para esta fazenda (${fazendaId}).`
                    : 'Não foi possível identificar a fazenda do usuário.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {NOTAS_ORDEM.map(nota => {
                  const config = notasLeitura.find(n => n.nota === nota)
                  if (!config) return null
                  const style = getNotaStyle(nota)
                  const valorEditado = editandoNotas[nota] || ''

                  return (
                    <div
                      key={nota}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 bg-surface-1 rounded-xl border-2 ${style.border} ${style.bg}`}
                    >
                      {/* Badge da nota */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={`w-12 h-12 rounded-full ${style.badge} flex items-center justify-center text-white font-bold text-lg`}>
                          {nota}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-semibold ${style.text}`}>Nota {nota}</p>
                          <p className="text-xs text-content-muted">{DESCRICOES_FIXAS[nota]}</p>
                        </div>
                      </div>

                      {/* Descricao do efeito */}
                      <div className="flex-1 min-w-0 sm:text-right">
                        <p className="text-sm text-content-muted">
                          Ajuste no próximo trato:
                        </p>
                        <p className={`text-lg font-bold ${style.text}`}>
                          {formatPercentual(parseFloat(valorEditado) || 0)}
                        </p>
                      </div>

                      {/* Input de percentual */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            value={valorEditado}
                            onChange={e => handleNotaPercentualChange(nota, e.target.value)}
                            className="w-24 px-3 py-2 border-2 border-border-base rounded-lg text-center font-semibold text-content focus:border-accent focus:outline-none"
                            placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-faint text-sm pointer-events-none">%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Botão salvar leitura */}
            {notasLeitura.length > 0 && (
              <div className="flex items-center gap-3 mt-6">
                <Button
                  onClick={handleSalvarNotas}
                  disabled={savingNotas || !haAlteracoesNotas}
                  variant="primary"
                >
                  {savingNotas ? 'Salvando...' : 'Salvar leitura de cocho'}
                </Button>
                {salvoNotas && (
                  <span className="text-sm text-green-500 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Configurações salvas
                  </span>
                )}
                {haAlteracoesNotas && !salvoNotas && (
                  <span className="text-sm text-content-muted">
                    Alterações não salvas
                  </span>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
