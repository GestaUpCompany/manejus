import type {
  FpAtividade,
  FpAtividadeSemana,
  FpBaixa,
  FpExtra,
  FpPlano,
  FuncionarioFp,
} from '../types/farmplan'
import { DIAS_SEMANA_CURTO, FP_STATUS_LABEL, FP_TIPO_LABEL, datasDaSemana } from '../types/farmplan'


function nomeDe(funcionarios: FuncionarioFp[], id: string | null): string {
  if (!id) return '—'
  const f = funcionarios.find((x) => x.id === id)
  return f?.apelido || f?.nome || '—'
}

// Evita "Equipe Equipe de Gado" quando o nome ja comeca com "Equipe"
function nomeEquipe(nome: string | undefined): string {
  if (!nome) return '—'
  return /^equipe/i.test(nome.trim()) ? nome : `Equipe ${nome}`
}

async function novoDoc(titulo: string, subtitulo: string) {
  const jsPDFMod = await import('jspdf')
  const doc = new jsPDFMod.default({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFillColor(15, 100, 55)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Farm Plan', 10, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(subtitulo, 10, 16)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  const tw = doc.getTextWidth(titulo)
  doc.text(titulo, pageW - 10 - tw, 13)

  return doc
}

// ============ Relatório semanal ============

export interface RelatorioSemanalInput {
  fazendaNome: string
  plano: FpPlano
  semana: number
  atividades: FpAtividade[]
  semanas: FpAtividadeSemana[]
  baixas: FpBaixa[]
  extras: FpExtra[]
  funcionarios: FuncionarioFp[]
  equipes: { id: string; nome: string }[]
  recado: string | null
}

export async function gerarRelatorioSemanal(input: RelatorioSemanalInput) {
  const autoTableMod = await import('jspdf-autotable')
  const autoTable = autoTableMod.default

  const datas = datasDaSemana(input.plano.semana1_inicio, input.semana)
  const periodo = `${datas[0].toLocaleDateString('pt-BR')} a ${datas[6].toLocaleDateString('pt-BR')}`
  const doc = await novoDoc(
    `Relatório semanal · Semana ${input.semana}`,
    `${input.fazendaNome} · Plano ${input.plano.ano} · ${periodo}`,
  )

  const semMap = new Map(input.semanas.map((s) => [s.atividade_id, s]))
  const baixaMap = new Map(
    input.baixas.map((b) => [`${b.atividade_id}:${b.dia}`, b.feita]),
  )
  const ativasDaSemana = input.atividades.filter((a) => semMap.has(a.id))

  let y = 28

  // Resumo
  const contagens = [0, 0, 0, 0, 0]
  for (const s of semMap.values()) contagens[s.status - 1]++
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(
    `Planejadas: ${contagens[0]}   Concluídas: ${contagens[1]}   Em andamento: ${contagens[2]}   Atrasadas: ${contagens[3]}   Pausadas: ${contagens[4]}`,
    10,
    y,
  )
  y += 4

  if (input.recado) {
    doc.setTextColor(15, 100, 55)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    const linhas = doc.splitTextToSize(`Recado da semana: ${input.recado}`, 190)
    doc.text(linhas, 10, y + 3)
    y += linhas.length * 4 + 3
  }
  y += 2

  autoTable(doc, {
    startY: y,
    head: [['Atividade', 'Executor', 'Tipo', 'Status', ...DIAS_SEMANA_CURTO]],
    body: ativasDaSemana.map((a) => {
      const s = semMap.get(a.id)
      const executor = a.executor_funcionario_id
        ? nomeDe(input.funcionarios, a.executor_funcionario_id)
        : a.executor_equipe_id
          ? nomeEquipe(input.equipes.find((e) => e.id === a.executor_equipe_id)?.nome)
          : '—'
      return [
        a.nome + (s?.carry_from ? ` (veio da sem. ${s.carry_from})` : ''),
        executor,
        FP_TIPO_LABEL[a.tipo],
        s ? FP_STATUS_LABEL[s.status] : '—',
        // Fonte padrao do jsPDF nao tem glifos ✓/○; usar apenas latin-1
        ...DIAS_SEMANA_CURTO.map((_, d) =>
          !a.dias_semana[d] ? '·' : baixaMap.get(`${a.id}:${d}`) ? 'x' : '—',
        ),
      ]
    }),
    styles: { fontSize: 7.5, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 100, 55] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 28 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22 } },
  })

  // @ts-expect-error autoTable adiciona lastAutoTable/finalY ao doc
  let finalY = doc.lastAutoTable?.finalY ?? y + 20

  if (input.extras.length) {
    autoTable(doc, {
      startY: finalY + 8,
      head: [['Extras (fora do plano)', 'Dia', 'Responsável', 'Obs']],
      body: input.extras.map((e) => [
        e.nome,
        DIAS_SEMANA_CURTO[e.dia] ?? e.dia,
        nomeDe(input.funcionarios, e.funcionario_id),
        e.observacao ?? '',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [180, 120, 20] },
    })
    // @ts-expect-error idem
    finalY = doc.lastAutoTable?.finalY ?? finalY + 20
  }

  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')} · Farm Plan · Gesta'Up`,
    10,
    doc.internal.pageSize.getHeight() - 8,
  )

  doc.save(`farmplan_semana_${input.semana}_${input.plano.ano}.pdf`)
}

// ============ Relatório mensal ============

export interface RelatorioMensalInput {
  fazendaNome: string
  plano: FpPlano
  mesIdx: number // 0-11
  mesNome: string
  semanasDoMes: number[]
  semanas: FpAtividadeSemana[]
  indicadores: { nome: string; unidade: string; metaLabel: string | null; valor: number | null; casas: number }[]
  escoreMedio: number | null
}

export async function gerarRelatorioMensal(input: RelatorioMensalInput) {
  const autoTableMod = await import('jspdf-autotable')
  const autoTable = autoTableMod.default

  const doc = await novoDoc(
    `Relatório mensal · ${input.mesNome} ${input.plano.ano}`,
    `${input.fazendaNome} · Farm Plan`,
  )

  // Resumo por status no mês
  const semanasSet = new Set(input.semanasDoMes)
  const doMes = input.semanas.filter((s) => semanasSet.has(s.semana))
  const contagens = [0, 0, 0, 0, 0]
  for (const s of doMes) contagens[s.status - 1]++
  const pct = doMes.length ? Math.round((contagens[1] / doMes.length) * 100) : 0

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(
    `Semanas ${input.semanasDoMes.join(', ')} · ${doMes.length} atividades programadas · ${pct}% concluídas`,
    10,
    30,
  )
  doc.text(
    `Planejadas: ${contagens[0]}   Concluídas: ${contagens[1]}   Em andamento: ${contagens[2]}   Atrasadas: ${contagens[3]}   Pausadas: ${contagens[4]}`,
    10,
    35,
  )

  autoTable(doc, {
    startY: 42,
    head: [['Semana', 'Período', 'Planejadas', 'Concluídas', 'Andamento', 'Atrasadas', 'Pausadas']],
    body: input.semanasDoMes.map((sem) => {
      const datas = datasDaSemana(input.plano.semana1_inicio, sem)
      const daSem = input.semanas.filter((s) => s.semana === sem)
      const c = [0, 0, 0, 0, 0]
      for (const s of daSem) c[s.status - 1]++
      return [
        `Semana ${sem}`,
        `${datas[0].toLocaleDateString('pt-BR')} – ${datas[6].toLocaleDateString('pt-BR')}`,
        ...c.map(String),
      ]
    }),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 100, 55] },
  })

  // @ts-expect-error autoTable adiciona lastAutoTable ao doc
  let finalY = doc.lastAutoTable?.finalY ?? 50

  if (input.indicadores.length) {
    autoTable(doc, {
      startY: finalY + 8,
      head: [['Indicador', 'Unidade', 'Meta', 'Valor do mês']],
      body: input.indicadores.map((i) => [
        i.nome,
        i.unidade,
        i.metaLabel ?? '—',
        i.valor !== null ? i.valor.toFixed(i.casas) : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 100, 55] },
    })
    // @ts-expect-error idem
    finalY = doc.lastAutoTable?.finalY ?? finalY + 20
  }

  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')} · Farm Plan · Gesta'Up`,
    10,
    doc.internal.pageSize.getHeight() - 8,
  )

  doc.save(`farmplan_${String(input.mesIdx + 1).padStart(2, '0')}_${input.plano.ano}.pdf`)
}

