import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton, Input } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import {
  TipoProgramacao,
  getCurraisFazenda,
  getProgramacaoTratos,
  getTiposExistentes,
  saveProgramacaoTratos,
} from '../../services/programacaoTratosService'

interface PercentualTrato {
  ordem_trato: number
  percentual: string
  horario_sugerido: string
}

interface CurralComKg {
  curral_id: string
  curral_nome: string
  lote_id: string | null
  lote_nome: string | null
  kg_mn_dia: string
}

interface NotaLeituraConfig {
  id: string
  nota: number
  percentual_ajuste: number
  descricao: string | null
}

const DISTRIBUICAO_PADRAO_4: Record<number, string> = { 1: '30', 2: '20', 3: '20', 4: '30' }

const TIPOS: { value: TipoProgramacao; label: string }[] = [
  { value: 'engorda', label: 'Engorda' },
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
const DATA_FIM_PADRAO = '9999-12-31'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ConfiguracaoTratos() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Tipos ativos (engorda, sequestro, TIP, ou múltiplos)
  const [tiposAtivos, setTiposAtivos] = useState<TipoProgramacao[]>([])
  // Tipo atualmente selecionado para edição
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoProgramacao>('engorda')

  // Configuração por tipo
  const [configs, setConfigs] = useState<Record<string, {
    quantidadeTratos: string
    dataInicio: string
    dataFim: string
    percentuais: PercentualTrato[]
    currais: CurralComKg[]
  }>>({})

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

    const [tiposExistentes, progEngorda, progSequestro, progTip, curraisFazenda, notasData] = await Promise.all([
      getTiposExistentes(fazendaId),
      getProgramacaoTratos(fazendaId, 'engorda'),
      getProgramacaoTratos(fazendaId, 'sequestro'),
      getProgramacaoTratos(fazendaId, 'tip'),
      getCurraisFazenda(fazendaId),
      supabase
        .from('notas_leitura_cocho_config')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('nota', { ascending: true }),
    ])

    setTiposAtivos(tiposExistentes.length > 0 ? tiposExistentes : ['engorda'])

    const newConfigs: Record<string, { quantidadeTratos: string; dataInicio: string; dataFim: string; percentuais: PercentualTrato[]; currais: CurralComKg[] }> = {}

    for (const [tipo, prog] of [['engorda', progEngorda], ['sequestro', progSequestro], ['tip', progTip]] as const) {
      // Mapa de kg MN salvos por curral
      const kgPorCurral: Record<string, string> = {}
      for (const c of prog.currais || []) {
        kgPorCurral[c.curral_id] = String(c.kg_mn_dia)
      }

      // Lista de currais da fazenda, mesclando com valores salvos
      const currais: CurralComKg[] = curraisFazenda.map((c) => ({
        curral_id: c.id,
        curral_nome: c.nome,
        lote_id: c.lote_id,
        lote_nome: c.lote_nome,
        kg_mn_dia: kgPorCurral[c.id] ?? '',
      }))

      if (prog.programacao) {
        newConfigs[tipo] = {
          quantidadeTratos: String(prog.programacao.quantidade_tratos),
          dataInicio: prog.programacao.data_inicio,
          dataFim: prog.programacao.data_fim,
          percentuais: prog.percentuais.map((p) => ({
            ordem_trato: p.ordem_trato,
            percentual: String(p.percentual),
            horario_sugerido: p.horario_sugerido || '',
          })),
          currais,
        }
      } else {
        newConfigs[tipo] = {
          quantidadeTratos: '4',
          dataInicio: hojeISO(),
          dataFim: DATA_FIM_PADRAO,
          percentuais: distribuirPercentuais(4),
          currais,
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
    dataFim: DATA_FIM_PADRAO,
    percentuais: distribuirPercentuais(4),
    currais: [],
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

  const handleVigenciaChange = (campo: 'dataInicio' | 'dataFim', value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [tipoSelecionado]: {
        ...prev[tipoSelecionado],
        [campo]: value,
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

  const handleCurralKgChange = (curralId: string, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [tipoSelecionado]: {
        ...prev[tipoSelecionado],
        currais: (prev[tipoSelecionado]?.currais || []).map((c) =>
          c.curral_id === curralId ? { ...c, kg_mn_dia: value } : c
        ),
      },
    }))
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

  const percentuaisValidos = Math.abs(somaPercentuais - 100) < 0.01
  const horariosPreenchidos = (configAtual.percentuais || []).every((p) => p.horario_sugerido !== '')

  const podeSalvar =
    parseInt(configAtual.quantidadeTratos) > 0 &&
    Boolean(configAtual.dataInicio) &&
    Boolean(configAtual.dataFim) &&
    configAtual.dataFim >= configAtual.dataInicio &&
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
      data_fim: configAtual.dataFim,
      percentuais: (configAtual.percentuais || []).map((p) => ({
        ordem_trato: p.ordem_trato,
        percentual: parseFloat(p.percentual) || 0,
        horario_sugerido: p.horario_sugerido || null,
      })),
      currais: (configAtual.currais || [])
        .filter((c) => c.kg_mn_dia !== '' && parseFloat(c.kg_mn_dia) > 0)
        .map((c) => ({
          curral_id: c.curral_id,
          lote_id: c.lote_id,
          kg_mn_dia: parseFloat(c.kg_mn_dia) || 0,
        })),
    })

    if (result.success) {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
      if (!tiposAtivos.includes(tipoSelecionado)) {
        setTiposAtivos([...tiposAtivos, tipoSelecionado])
      }
    } else {
      setErro(result.error)
    }

    setSaving(false)
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
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-500' }
      case 0:
        return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-500' }
      case 1:
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-500' }
      case 2:
        return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-500' }
      case 3:
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-500' }
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-500' }
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
        <h1 className="text-2xl font-bold text-gray-800">Configuração de Tratos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Defina a quantidade de tratos diários, a distribuição percentual por trato e os ajustes de leitura de cocho.
        </p>
      </div>

      {/* Card explicativo */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Como funciona</p>
            <p>
              Os percentuais por trato definem a distribuição do <strong>primeiro dia</strong>. Do segundo dia em diante,
              a oferta recomendada por curral e por trato será ajustada pela leitura de cocho do dia anterior.
            </p>
            <p className="mt-2">
              <strong>Exemplo:</strong> se a nota foi <strong>2</strong> (sobras moderadas) e a porcentagem é <strong>-5%</strong>, o tratador reduz 5% da quantidade de comida no próximo trato.
            </p>
          </div>
        </div>
      </Card>

      {erro && (
        <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <p className="text-sm text-red-700 font-medium">Erro ao salvar configuração</p>
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
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 border border-dashed border-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors"
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
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Configuração: {TIPOS.find((t) => t.value === tipoSelecionado)?.label}
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Quantidade de tratos por dia
              </label>
              <Input
                type="number"
                min={1}
                value={configAtual.quantidadeTratos}
                onChange={(e) => handleQuantidadeTratosChange(e.target.value)}
                placeholder="Ex: 4"
                className="border-gray-200 focus:border-accent max-w-[200px]"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de início <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={configAtual.dataInicio}
                  onChange={(e) => handleVigenciaChange('dataInicio', e.target.value)}
                  className="border-gray-200 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de fim <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  min={configAtual.dataInicio || undefined}
                  value={configAtual.dataFim}
                  onChange={(e) => handleVigenciaChange('dataFim', e.target.value)}
                  className="border-gray-200 focus:border-accent"
                />
              </div>
            </div>
            {configAtual.dataInicio && configAtual.dataFim && configAtual.dataFim < configAtual.dataInicio && (
              <p className="-mt-4 mb-4 text-sm font-medium text-red-600">
                A data de fim deve ser igual ou posterior à data de início.
              </p>
            )}

            {/* Tabela de percentuais por trato */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Distribuição percentual por trato</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2">Trato</th>
                      <th className="px-4 py-2">Percentual (%)</th>
                      <th className="px-4 py-2">Horário sugerido <span className="text-red-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(configAtual.percentuais || []).map((p) => (
                      <tr key={p.ordem_trato}>
                        <td className="px-4 py-2 font-medium text-gray-800">{p.ordem_trato}º</td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={p.percentual}
                            onChange={(e) => handlePercentualChange(p.ordem_trato, 'percentual', e.target.value)}
                            className="w-24 border-gray-200 focus:border-accent"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="time"
                            value={p.horario_sugerido}
                            onChange={(e) => handlePercentualChange(p.ordem_trato, 'horario_sugerido', e.target.value)}
                            className="w-32 border-gray-200 focus:border-accent"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td className="px-4 py-2 text-gray-700">Total</td>
                      <td className="px-4 py-2">
                        <span className={percentuaisValidos ? 'text-green-600' : 'text-red-600'}>
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

            {/* Tabela de kg MN por curral (Dia 1) */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                Quantidade total de MN (kg) por curral, Dia 1
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Informe o total diário de matéria natural (kg) que será trato em cada curral no primeiro dia.
                O aplicativo usará esses valores como previsão inicial, ajustada depois pelas leituras de cocho.
              </p>
              {(configAtual.currais || []).length === 0 ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
                  Nenhum curral ativo cadastrado para esta fazenda.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Curral</th>
                        <th className="px-4 py-2">Lote</th>
                        <th className="px-4 py-2">Total MN Dia 1 (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(configAtual.currais || []).map((c) => (
                        <tr key={c.curral_id}>
                          <td className="px-4 py-2 font-medium text-gray-800">{c.curral_nome}</td>
                          <td className="px-4 py-2 text-gray-600">{c.lote_nome || <span className="text-gray-400 italic">Sem lote</span>}</td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.1"
                              value={c.kg_mn_dia}
                              onChange={(e) => handleCurralKgChange(c.curral_id, e.target.value)}
                              placeholder="0"
                              className="w-28 border-gray-200 focus:border-accent"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-medium">
                      <tr>
                        <td className="px-4 py-2 text-gray-700" colSpan={2}>Total geral</td>
                        <td className="px-4 py-2">
                          <span className="text-gray-800">
                            {(configAtual.currais || []).reduce((sum, c) => sum + (parseFloat(c.kg_mn_dia) || 0), 0).toFixed(1)} kg
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Botão salvar */}
            <div className="flex justify-end gap-3 items-center mt-6">
              {salvo && (
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
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
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </Button>
            </div>

            {!podeSalvar && (
              <p className="text-xs text-gray-400 text-right mt-2">
                {!percentuaisValidos && 'Os percentuais devem somar 100%. '}
                {!horariosPreenchidos && 'Todos os horários sugeridos devem ser preenchidos. '}
                {parseInt(configAtual.quantidadeTratos) <= 0 && 'A quantidade de tratos deve ser maior que zero. '}
              </p>
            )}
          </Card>

          {/* Seção: Leitura de Cocho */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Leitura de Cocho</h2>
            <p className="text-sm text-gray-500 mb-4">
              Configure a porcentagem de ajuste para cada nota de leitura de cocho. As notas são fixas e não podem ser alteradas.
            </p>

            {erroNotas && (
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl mb-4">
                <p className="text-sm text-red-700 font-medium">Erro ao carregar configurações de leitura</p>
                <p className="text-xs text-red-500 mt-1">{erroNotas}</p>
              </div>
            )}

            {notasLeitura.length === 0 ? (
              <div className="p-6 bg-gray-50 rounded-xl border-2 border-gray-200 text-center">
                <p className="text-sm text-gray-500">
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
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 bg-white rounded-xl border-2 ${style.border} ${style.bg}`}
                    >
                      {/* Badge da nota */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={`w-12 h-12 rounded-full ${style.badge} flex items-center justify-center text-white font-bold text-lg`}>
                          {nota}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-semibold ${style.text}`}>Nota {nota}</p>
                          <p className="text-xs text-gray-500">{DESCRICOES_FIXAS[nota]}</p>
                        </div>
                      </div>

                      {/* Descricao do efeito */}
                      <div className="flex-1 min-w-0 sm:text-right">
                        <p className="text-sm text-gray-600">
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
                            className="w-24 px-3 py-2 border-2 border-gray-200 rounded-lg text-center font-semibold text-gray-700 focus:border-accent focus:outline-none"
                            placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
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
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Configurações salvas
                  </span>
                )}
                {haAlteracoesNotas && !salvoNotas && (
                  <span className="text-sm text-gray-500">
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
