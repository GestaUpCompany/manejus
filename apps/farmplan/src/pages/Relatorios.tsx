import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Button, Select, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  useSemanaDados,
  usePlanoSemanas,
  useFuncionariosFp,
  useEquipesFp,
} from '../services/farmplanService'
import { useAtividades } from '../services/cadastrosService'
import { useIndicadores, useIndicadorValores } from '../services/indicadoresService'
import { useAvaliacoesAno } from '../services/equipeService'
import { gerarRelatorioSemanal, gerarRelatorioMensal } from '../utils/relatoriosPDF'
import { semanasIntersectamMes } from '../types/farmplan'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function Relatorios() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: atividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: todasSemanas } = usePlanoSemanas(fazendaId, plano?.id, atividadeIds)
  const { data: indicadores } = useIndicadores(fazendaId)
  const { data: valores } = useIndicadorValores(fazendaId, plano?.ano)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, plano?.ano)
  const toast = useToast()

  const [semanaSel, setSemanaSel] = useState('')
  const [mesSel, setMesSel] = useState(String(new Date().getMonth()))
  const [gerando, setGerando] = useState(false)

  const semanaNum = Number(semanaSel) || plano?.semanaAtual || 1
  const { data: dadosSemana } = useSemanaDados(fazendaId, plano?.id, semanaNum)

  const semanaOptions = Array.from({ length: 53 }, (_, i) => ({
    value: String(i + 1),
    label: `Semana ${i + 1}${i + 1 === plano?.semanaAtual ? ' (atual)' : ''}`,
  }))
  const mesOptions = MESES.map((m, i) => ({ value: String(i), label: m }))

  const gerarSemanal = async () => {
    if (!plano || !fazenda || !dadosSemana) return
    setGerando(true)
    try {
      const { data: recadoRow } = await supabase
        .from('fp_recados')
        .select('texto')
        .eq('plano_id', plano.id)
        .eq('semana', semanaNum)
        .maybeSingle()
      await gerarRelatorioSemanal({
        fazendaNome: fazenda.nome,
        plano,
        semana: semanaNum,
        atividades: dadosSemana.atividades,
        semanas: dadosSemana.semanas,
        baixas: dadosSemana.baixas,
        extras: dadosSemana.extras,
        funcionarios: funcionarios ?? [],
        equipes: (equipes ?? []).map((e) => ({ id: e.id, nome: e.nome })),
        recado: recadoRow?.texto ?? null,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  const gerarMensal = async () => {
    if (!plano || !fazenda) return
    setGerando(true)
    try {
      const mesIdx = Number(mesSel)
      const semanasDoMes = semanasIntersectamMes(plano.semana1_inicio, plano.ano, mesIdx)

      const notasMes = (avaliacoes ?? []).filter(
        (a) => !a.nsa && a.nota !== null && semanasDoMes.includes(a.semana),
      )
      const escoreMedio = notasMes.length
        ? notasMes.reduce((s, a) => s + Number(a.nota), 0) / notasMes.length
        : null

      const semMes = (todasSemanas ?? []).filter((s) => semanasDoMes.includes(s.semana))
      const pctAtividades = semMes.length
        ? (semMes.filter((s) => s.status === 2).length / semMes.length) * 100
        : null

      const inds = (indicadores ?? []).map((ind) => {
        let valor: number | null = null
        if (ind.origem === 'escore') valor = escoreMedio
        else if (ind.origem === 'atividades') valor = pctAtividades
        else {
          const row = (valores ?? []).find((v) => v.indicador_id === ind.id && v.mes === mesIdx + 1)
          valor = row?.valor ?? null
        }
        return {
          nome: ind.nome,
          unidade: ind.unidade,
          metaLabel: ind.meta_label,
          valor,
          casas: ind.casas_decimais,
        }
      })

      await gerarRelatorioMensal({
        fazendaNome: fazenda.nome,
        plano,
        mesIdx,
        mesNome: MESES[mesIdx],
        semanasDoMes,
        semanas: todasSemanas ?? [],
        indicadores: inds,
        escoreMedio,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  if (loadingPlano) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Relatórios</h1>
        <p className="text-content-muted mt-1">
          PDFs para compartilhar no grupo da fazenda (WhatsApp).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <Card className="p-5 space-y-3" disableHover>
          <h2 className="font-semibold text-content-strong">Relatório semanal</h2>
          <p className="text-xs text-content-muted">
            Status das atividades, baixas por dia, extras e recado da semana.
          </p>
          <Select
            label="Semana"
            options={semanaOptions}
            value={String(semanaNum)}
            onChange={setSemanaSel}
          />
          <Button onClick={gerarSemanal} disabled={gerando}>
            {gerando ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        </Card>

        <Card className="p-5 space-y-3" disableHover>
          <h2 className="font-semibold text-content-strong">Relatório mensal</h2>
          <p className="text-xs text-content-muted">
            Consolidado por semana e indicadores do mês (escore, % atividades, faltas).
          </p>
          <Select label="Mês" options={mesOptions} value={mesSel} onChange={setMesSel} />
          <Button onClick={gerarMensal} disabled={gerando}>
            {gerando ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        </Card>
      </div>
    </div>
  )
}
