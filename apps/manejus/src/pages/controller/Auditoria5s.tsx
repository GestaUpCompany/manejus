import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { exportToXLSX } from '@gestaup/shared'
import { Button, Card, CardSkeleton, EmptyState } from '@gestaup/ui'
import { AUDITORIA_5S_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { pendenciasPorSetor } from '../../features/pendencias5s/calculo'
import { useAuditorias5s } from '../../hooks/useAuditorias5s'
import { Auditoria5sAbas, type AbaAuditoria } from './Auditoria5sAbas'
import { Auditoria5sFiltros, type PresetPeriodo } from './Auditoria5sFiltros'
import { Icone } from './Auditoria5sIcone'
import { Auditoria5sLista } from './Auditoria5sLista'
import { Auditoria5sPendencias } from './Auditoria5sPendencias'
import { Auditoria5sVisaoGeral } from './Auditoria5sVisaoGeral'
import { Auditoria5sSetor } from './Auditoria5sSetor'

type Aba = 'geral' | 'setor' | 'pendencias' | 'auditorias'

const ABAS_VALIDAS: Aba[] = ['geral', 'setor', 'pendencias', 'auditorias']
const ID_BASE = 'auditoria5s'

const PRESETS: { dias: number | null; rotulo: string }[] = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
  { dias: null, rotulo: 'Tudo' },
]

/** YYYY-MM-DD de N dias atrás (data local do navegador). */
const diasAtras = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Auditoria5s() {
  const [searchParams, setSearchParams] = useSearchParams()
  const abaParam = searchParams.get('aba')
  const aba: Aba = ABAS_VALIDAS.includes(abaParam as Aba) ? (abaParam as Aba) : 'geral'
  const setorChave = searchParams.get('setor')

  const { registros, setores, fazendaNome, loading, erro } = useAuditorias5s()
  const [dataInicio, setDataInicio] = useState(() => diasAtras(365))
  const [dataFim, setDataFim] = useState('')
  const [responsavelFiltro, setResponsavelFiltro] = useState('')
  const [setorLista, setSetorLista] = useState('')

  const irPara = (novaAba: Aba, setor?: string | null) => {
    const params: Record<string, string> = {}
    if (novaAba !== 'geral') params.aba = novaAba
    if (setor) params.setor = setor
    setSearchParams(params)
  }

  const nomesResponsaveis = useMemo(() => [...new Set(registros.map((r) => r.responsavel).filter(Boolean) as string[])].sort(), [registros])
  const nomesSetores = useMemo(() => [...new Set(registros.map((r) => r.setor).filter(Boolean) as string[])].sort(), [registros])

  // Período e responsável valem para a visão geral, por setor e lista. Pendências são o estado atual (histórico inteiro).
  const filtrados = useMemo(
    () =>
      registros.filter((r) => {
        const dia = r.data.slice(0, 10)
        return (!dataInicio || dia >= dataInicio) && (!dataFim || dia <= dataFim) && (!responsavelFiltro || r.responsavel === responsavelFiltro)
      }),
    [registros, dataInicio, dataFim, responsavelFiltro]
  )

  const pendencias = useMemo(
    () =>
      pendenciasPorSetor(
        registros.map((r) => ({
          id: r.id,
          data: r.data,
          localId: r.local_id ?? null,
          setor: r.setor ?? null,
          setorId: r.setor_id ?? null,
          itens: r.itens ?? null,
          naoConformidades: r.nao_conformidades ?? null,
        }))
      ),
    [registros]
  )

  const filtradosLista = useMemo(() => filtrados.filter((r) => !setorLista || r.setor === setorLista), [filtrados, setorLista])

  const limparFiltros = () => {
    setDataInicio(diasAtras(365))
    setDataFim('')
    setResponsavelFiltro('')
    setSetorLista('')
  }

  const abas: AbaAuditoria<Aba>[] = [
    { valor: 'geral', rotulo: 'Visão geral', icone: 'visaoGeral' },
    { valor: 'setor', rotulo: 'Por setor', icone: 'setor' },
    { valor: 'pendencias', rotulo: 'Pendências', icone: 'pendencias', contagem: pendencias.abertas.length, destaque: true },
    { valor: 'auditorias', rotulo: 'Auditorias', icone: 'auditorias', contagem: registros.length },
  ]

  const presetsPeriodo: PresetPeriodo[] = PRESETS.map((p) => ({
    rotulo: p.rotulo,
    ativo: p.dias === null ? dataInicio === '' && dataFim === '' : dataInicio === diasAtras(p.dias) && dataFim === '',
    aplicar: () => {
      setDataInicio(p.dias === null ? '' : diasAtras(p.dias))
      setDataFim('')
    },
  }))

  // Filtros fora do padrão (12 meses, sem data final, sem responsável); o setor só conta na lista, onde ele existe
  const filtrosAtivos = (dataInicio !== diasAtras(365) || dataFim !== '' ? 1 : 0) + (responsavelFiltro ? 1 : 0) + (aba === 'auditorias' && setorLista ? 1 : 0)
  const naLista = aba === 'auditorias'

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Carregando auditorias" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <header className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Auditoria 5S</h2>
        <p className="text-sm text-content">
          Conformidade dos setores, pendências e histórico das auditorias{fazendaNome ? ` · ${fazendaNome}` : ''}
        </p>
      </header>

      {erro && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          <Icone nome="pendencias" className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">Não foi possível carregar todas as auditorias</p>
            <p>{erro}</p>
          </div>
        </div>
      )}

      <Auditoria5sAbas
        abas={abas}
        ativa={aba}
        idBase={ID_BASE}
        rotuloAria="Visão da auditoria"
        onSelecionar={(valor) => irPara(valor, valor === 'setor' || valor === 'pendencias' ? setorChave : null)}
      />

      <div role="tabpanel" id={`${ID_BASE}-painel`} aria-labelledby={`${ID_BASE}-aba-${aba}`} className="space-y-4 sm:space-y-6 min-w-0">
        {aba !== 'pendencias' && (
          <Auditoria5sFiltros
            presets={presetsPeriodo}
            dataInicio={dataInicio}
            dataFim={dataFim}
            onDataInicio={setDataInicio}
            onDataFim={setDataFim}
            responsavel={responsavelFiltro}
            onResponsavel={setResponsavelFiltro}
            nomesResponsaveis={nomesResponsaveis}
            nomesSetores={naLista ? nomesSetores : undefined}
            setor={setorLista}
            onSetor={setSetorLista}
            totalFiltrado={naLista ? filtradosLista.length : filtrados.length}
            total={registros.length}
            filtrosAtivos={filtrosAtivos}
            onLimpar={limparFiltros}
            avisoPendencias={!naLista}
            acoes={
              naLista ? (
                <Button size="sm" onClick={() => exportToXLSX(filtradosLista, AUDITORIA_5S_EXPORT_CONFIG, fazendaNome)} disabled={filtradosLista.length === 0}>
                  <Icone nome="exportar" className="mr-2 h-4 w-4" />
                  Exportar XLSX
                </Button>
              ) : undefined
            }
          />
        )}

        {aba === 'geral' && (
          <Auditoria5sVisaoGeral
            registros={filtrados}
            setores={setores}
            pendenciasAbertas={pendencias.abertas}
            fazendaNome={fazendaNome}
            onAbrirSetor={(chave) => irPara('setor', chave)}
            onVerPendencias={(chave) => irPara('pendencias', chave ?? null)}
          />
        )}

        {aba === 'setor' && (
          <Auditoria5sSetor
            registrosPeriodo={filtrados}
            todosRegistros={registros}
            setores={setores}
            setorChave={setorChave}
            pendenciasAbertas={pendencias.abertas}
            pendenciasResolvidas={pendencias.resolvidas}
            fazendaNome={fazendaNome}
            onSelecionar={(chave) => irPara(chave ? 'setor' : 'geral', chave)}
            onVerPendencias={(chave) => irPara('pendencias', chave)}
          />
        )}

        {aba === 'pendencias' && (
          <Auditoria5sPendencias registros={registros} fazendaNome={fazendaNome} setorChave={setorChave} onLimparSetor={() => irPara('pendencias')} />
        )}

        {naLista &&
          (registros.length === 0 ? (
            <Card className="bg-surface-1" disableHover>
              <EmptyState
                title="Nenhuma auditoria 5S registrada"
                description="As auditorias feitas no aplicativo de campo aparecem aqui."
                icon={<Icone nome="auditorias" className="h-6 w-6 text-content-muted" />}
              />
            </Card>
          ) : filtradosLista.length === 0 ? (
            <Card className="bg-surface-1" disableHover>
              <EmptyState
                title="Nenhuma auditoria com esses filtros"
                description="Amplie o período ou limpe os filtros para ver as auditorias."
                icon={<Icone nome="auditorias" className="h-6 w-6 text-content-muted" />}
                action={
                  <Button variant="secondary" size="sm" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                }
              />
            </Card>
          ) : (
            <Auditoria5sLista registros={filtradosLista} />
          ))}
      </div>
    </div>
  )
}
