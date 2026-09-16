import { supabase } from '../../services/supabaseClient'
import type { DadosPDFRelatorioAbastecimento } from '../../utils/relatorioAbastecimentoPDF'
import type { DadosPDFBebedouros } from '../../utils/relatorioBebedourosPDF'
import type { LoteRelatorio } from '../../utils/relatorioConsumoPDF'
import type { LinhaMorte, ParametrosRelatorioMorte, PastoGeo, ResumoMorte } from '../../utils/relatorioMortePDF'
import type { TipoRelatorioGeral } from './catalogo'
import type { DadosPDFBoletimRebanho } from './boletimRebanho'

interface FazendaRelatorio {
  id: string
  nome: string
  logoUrl?: string | null
}

interface RegistroAbastecimento {
  maquina: string
  marca?: string
  modelo?: string
  combustivel: string
  operacao: string
  litros: number
  data: string
  operador?: string
  placa?: string
  trabalho_periodo?: number | null
  unidade_trabalho?: string | null
}

interface Bebedouro {
  id: string
  nome: string
  meta_intervalo_limpeza: number | null
}

interface Limpeza {
  bebedouro_id: string
  bebedouro_nome: string
  data_limpeza: string
  responsavel: string | null
}

interface RegistroBebedouro {
  id: string
  data: string
  numero_bebedouro: string | null
  responsavel: string | null
  observacao: string | null
  checklist: Record<string, { valor: boolean; observacao?: string }> | null
}

interface DadosMorteRpc {
  linhas: LinhaMorte[]
  resumo: ResumoMorte
  rebanho_total?: number
  pastos_geo?: PastoGeo[]
  periodo_anterior?: {
    total_mortes: number
    taxa_mortalidade: number | null
    data_inicio: string
    data_fim: string
  }
}

export type PayloadRelatorioGeral =
  | { tipo: 'abastecimento'; dados: DadosPDFRelatorioAbastecimento }
  | { tipo: 'consumo'; dados: { dataInicio: string; dataFim: string; fazendaNome: string; fazendaLogoUrl?: string | null; lotes: LoteRelatorio[] } }
  | { tipo: 'bebedouros'; dados: DadosPDFBebedouros }
  | { tipo: 'morte'; dados: ParametrosRelatorioMorte }
  | { tipo: 'boletim_rebanho'; dados: DadosPDFBoletimRebanho & { fazendaNome: string; fazendaLogoUrl?: string | null } }

const CHECKLIST_ITEMS = [
  { key: 'agua_suficiente', label: 'Água insuficiente' },
  { key: 'vazao_bebedouro_ideal', label: 'Vazão não ideal' },
  { key: 'espacamento_bebedouro_ideal', label: 'Espaçamento não ideal' },
  { key: 'boia_protecao_boas_condicoes', label: 'Bóia/proteção em más condições' },
  { key: 'aterro_acesso_bebedouro_ideal', label: 'Aterro/acesso não ideal' },
]

const PRECOS_KG_DEFAULT: Record<string, number> = {
  Bezerro: 12,
  Bezerra: 11.5,
  Novilha: 11,
  Garrote: 9.5,
  'Boi Magro': 10,
  'Boi Gordo': 11.67,
  Vaca: 10.83,
  Touro: 15,
}

function agregarAbastecimento(registros: RegistroAbastecimento[], chave: (r: RegistroAbastecimento) => string) {
  const valores = new Map<string, number>()
  for (const registro of registros) {
    const label = chave(registro)
    if (label) valores.set(label, (valores.get(label) ?? 0) + Number(registro.litros))
  }
  return [...valores.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
}

async function carregarAbastecimento(
  fazenda: FazendaRelatorio,
  dataInicio: string,
  dataFim: string,
): Promise<PayloadRelatorioGeral> {
  const { data, error } = await supabase.rpc('get_dados_relatorio_abastecimento_fazenda', {
    p_fazenda_id: fazenda.id,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  })
  if (error) throw error
  const registros = ((data?.dados?.registros ?? []) as RegistroAbastecimento[]).map((r) => ({
    ...r,
    litros: Number(r.litros),
  }))
  const grupos = new Map<string, RegistroAbastecimento[]>()
  for (const registro of registros) {
    const grupo = grupos.get(registro.maquina) ?? []
    grupo.push(registro)
    grupos.set(registro.maquina, grupo)
  }
  const detalhesPorMaquina = [...grupos.entries()].map(([maquina, itens]) => {
    const totalLitros = itens.reduce((soma, item) => soma + item.litros, 0)
    const totalTrabalho = itens.reduce((soma, item) => soma + Number(item.trabalho_periodo ?? 0), 0)
    const datas = itens.map((item) => item.data).filter(Boolean).sort()
    return {
      maquina,
      marca: itens[0]?.marca,
      modelo: itens[0]?.modelo,
      totalLitros,
      numAbastecimentos: itens.length,
      mediaLitros: itens.length ? totalLitros / itens.length : 0,
      maiorAbastecimento: Math.max(0, ...itens.map((item) => item.litros)),
      primeiraData: datas[0] ?? '',
      ultimaData: datas[datas.length - 1] ?? '',
      combustiveis: [...new Set(itens.map((item) => item.combustivel).filter(Boolean))].sort(),
      operadores: [...new Set(itens.map((item) => item.operador).filter((v): v is string => Boolean(v)))].sort(),
      placas: [...new Set(itens.map((item) => item.placa).filter((v): v is string => Boolean(v)))].sort(),
      unidadeTrabalho: itens[0]?.unidade_trabalho ?? null,
      totalTrabalho: totalTrabalho > 0 ? totalTrabalho : null,
      consumoMedio: totalTrabalho > 0 ? totalLitros / totalTrabalho : null,
    }
  }).sort((a, b) => b.totalLitros - a.totalLitros)
  const porMaquina = detalhesPorMaquina.map((item) => ({
    label: item.maquina,
    valor: item.totalLitros,
    marca: item.marca,
    modelo: item.modelo,
  }))
  return {
    tipo: 'abastecimento',
    dados: {
      titulo: 'Relatório de Abastecimento',
      fazendaNome: fazenda.nome,
      fazendaLogoUrl: fazenda.logoUrl,
      filtros: { dataInicio, dataFim, maquinas: [], combustiveis: [], operacoes: [] },
      porMaquina,
      porCombustivel: agregarAbastecimento(registros, (r) => r.combustivel),
      porOperacao: agregarAbastecimento(registros, (r) => r.operacao),
      totalLitros: registros.reduce((soma, item) => soma + item.litros, 0),
      totalRegistros: registros.length,
      detalhesPorMaquina,
    },
  }
}

async function carregarConsumo(
  fazenda: FazendaRelatorio,
  dataInicio: string,
  dataFim: string,
): Promise<PayloadRelatorioGeral> {
  const { data, error } = await supabase.rpc('get_dados_relatorio_consumo_fazenda', {
    p_fazenda_id: fazenda.id,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  })
  if (error) throw error
  const lotes = (data?.dados?.lotes ?? []) as Array<{ info: LoteRelatorio['info']; dados: LoteRelatorio['dados'] }>
  return {
    tipo: 'consumo',
    dados: {
      dataInicio,
      dataFim,
      fazendaNome: fazenda.nome,
      fazendaLogoUrl: fazenda.logoUrl,
      lotes: lotes
        .filter((lote) => !lote.info.erro || lote.info.erro.length === 0)
        .map((lote) => ({
          info: {
            ...lote.info,
            fazenda_id: fazenda.id,
            fazenda_nome: fazenda.nome,
            fazenda_logo_url: fazenda.logoUrl,
          },
          dados: lote.dados ?? [],
        })),
    },
  }
}

function statusLimpeza(dias: number | null, meta: number | null) {
  if (dias === null) return { label: 'Sem registro', cor: '#6B7280' }
  if (!meta || meta <= 0) return { label: `${dias}d`, cor: '#6B7280' }
  if (dias <= meta) return { label: 'Em dia', cor: '#22C55E' }
  if (dias <= Math.ceil(meta * 1.3)) return { label: 'Atrasado', cor: '#F59E0B' }
  return { label: 'Atraso crítico', cor: '#EF4444' }
}

function dataLocal(valor: string) {
  return new Date(`${valor.split('T')[0]}T00:00:00`)
}

async function carregarBebedouros(
  fazenda: FazendaRelatorio,
  dataInicio: string,
  dataFim: string,
): Promise<PayloadRelatorioGeral> {
  const permitidos = await supabase.rpc('get_bebedouros_permitidos_relatorio_fazenda', {
    p_fazenda_id: fazenda.id,
  })
  if (permitidos.error) throw permitidos.error
  const idsPermitidos = new Set((permitidos.data ?? []).map((item: { bebedouro_id: string }) => item.bebedouro_id))
  const [bebedourosRes, limpezasRes, registrosRes] = await Promise.all([
    supabase.from('bebedouros').select('id, nome, meta_intervalo_limpeza').eq('fazenda_id', fazenda.id).is('deleted_at', null).order('nome'),
    supabase.from('historico_limpezas_bebedouros').select('bebedouro_id, data_limpeza, responsavel, bebedouro:bebedouros(nome)').eq('fazenda_id', fazenda.id).lte('data_limpeza', `${dataFim}T23:59:59`).order('data_limpeza', { ascending: false }),
    supabase.from('registros_bebedouros').select('id, data, numero_bebedouro, responsavel, observacao, checklist').eq('fazenda_id', fazenda.id).is('deleted_at', null).gte('data', `${dataInicio}T00:00:00`).lte('data', `${dataFim}T23:59:59`).order('data', { ascending: false }),
  ])
  const erro = bebedourosRes.error || limpezasRes.error || registrosRes.error
  if (erro) throw erro
  const bebedouros = (bebedourosRes.data ?? []).filter((item) => idsPermitidos.has(item.id)) as Bebedouro[]
  const nomes = new Set(bebedouros.map((item) => item.nome))
  const limpezas = (limpezasRes.data ?? [])
    .filter((item) => idsPermitidos.has(item.bebedouro_id))
    .map((item) => ({
      bebedouro_id: item.bebedouro_id,
      bebedouro_nome: Array.isArray(item.bebedouro) ? item.bebedouro[0]?.nome ?? '' : (item.bebedouro as { nome?: string } | null)?.nome ?? '',
      data_limpeza: item.data_limpeza,
      responsavel: item.responsavel,
    })) as Limpeza[]
  const registros = (registrosRes.data ?? []).filter((item) => item.numero_bebedouro && nomes.has(item.numero_bebedouro)) as RegistroBebedouro[]
  const dataReferencia = dataLocal(dataFim)
  const status = bebedouros.map((bebedouro) => {
    const historico = limpezas.filter((item) => item.bebedouro_id === bebedouro.id).sort((a, b) => dataLocal(b.data_limpeza).getTime() - dataLocal(a.data_limpeza).getTime())
    const ultima = historico[0]
    const dias = ultima ? Math.max(Math.round((dataReferencia.getTime() - dataLocal(ultima.data_limpeza).getTime()) / 86_400_000), 0) : null
    const situacao = statusLimpeza(dias, bebedouro.meta_intervalo_limpeza)
    return {
      nome: bebedouro.nome,
      dias,
      cor: situacao.cor,
      meta: bebedouro.meta_intervalo_limpeza,
      ultimaLimpeza: ultima?.data_limpeza ?? null,
      limpezasNoPeriodo: historico.filter((item) => item.data_limpeza.split('T')[0] >= dataInicio && item.data_limpeza.split('T')[0] <= dataFim).length,
      statusLabel: situacao.label,
    }
  })
  const total = status.length
  const emDia = status.filter((item) => item.statusLabel === 'Em dia').length
  const atrasado = status.filter((item) => item.statusLabel === 'Atrasado').length
  const critico = status.filter((item) => item.statusLabel === 'Atraso crítico').length
  const semRegistro = status.filter((item) => item.statusLabel === 'Sem registro').length
  const comChecklist = registros.filter((item) => item.checklist && Object.keys(item.checklist).length > 0)
  const ocorrencias = comChecklist.flatMap((registro) => {
    const negativos = CHECKLIST_ITEMS.filter((item) => registro.checklist?.[item.key]?.valor === false)
    if (!negativos.length) return []
    return [{
      data: registro.data,
      bebedouro: registro.numero_bebedouro ?? 'Sem identificação',
      itensNegativos: negativos.map((item) => item.label).join(', '),
      obsItens: negativos.map((item) => registro.checklist?.[item.key]?.observacao).filter(Boolean).join('; '),
      obsGeral: registro.observacao ?? '',
      responsavel: registro.responsavel ?? '',
    }]
  })
  const itensRanking = CHECKLIST_ITEMS.map((item) => {
    const negativosItem = comChecklist.filter((registro) => registro.checklist?.[item.key]?.valor === false).length
    return {
      label: item.label,
      pctNegativo: comChecklist.length ? Math.round((negativosItem / comChecklist.length) * 100) : 0,
      negativos: negativosItem,
      total: comChecklist.length,
    }
  }).sort((a, b) => b.pctNegativo - a.pctNegativo)
  const maisProblematico = itensRanking[0]?.pctNegativo > 0 ? itensRanking[0] : null
  const maisAtrasado = status.filter((item) => item.dias !== null && item.statusLabel !== 'Em dia').sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))[0]
  const ehDiaUnico = dataInicio === dataFim
  const limpezasDoDia = ehDiaUnico ? bebedouros.flatMap((bebedouro) => {
    const historico = limpezas.filter((item) => item.bebedouro_id === bebedouro.id).sort((a, b) => dataLocal(b.data_limpeza).getTime() - dataLocal(a.data_limpeza).getTime())
    const atual = historico.find((item) => item.data_limpeza.split('T')[0] === dataInicio)
    if (!atual) return []
    const anterior = historico[historico.indexOf(atual) + 1]
    const intervalo = anterior ? Math.max(Math.round((dataLocal(atual.data_limpeza).getTime() - dataLocal(anterior.data_limpeza).getTime()) / 86_400_000), 0) : null
    const situacao = intervalo === null || !bebedouro.meta_intervalo_limpeza
      ? { label: 'Primeira limpeza', cor: '#6B7280' }
      : intervalo <= bebedouro.meta_intervalo_limpeza
        ? { label: 'Dentro da meta', cor: '#22C55E' }
        : intervalo <= Math.ceil(bebedouro.meta_intervalo_limpeza * 1.3)
          ? { label: 'Acima da meta', cor: '#F59E0B' }
          : { label: 'Muito acima da meta', cor: '#EF4444' }
    return [{
      nome: bebedouro.nome,
      intervalo,
      cor: situacao.cor,
      meta: bebedouro.meta_intervalo_limpeza,
      dataLimpeza: atual.data_limpeza,
      dataLimpezaAnterior: anterior?.data_limpeza ?? null,
      statusLabel: situacao.label,
      responsavel: atual.responsavel,
    }]
  }) : []
  const intervalos = limpezasDoDia.map((item) => item.intervalo).filter((item): item is number => item !== null)
  return {
    tipo: 'bebedouros',
    dados: {
      titulo: 'Relatório de Bebedouros',
      fazendaNome: fazenda.nome,
      fazendaLogoUrl: fazenda.logoUrl,
      dataInicio,
      dataFim,
      ehDiaUnico,
      diaUnico: ehDiaUnico ? dataInicio : undefined,
      limpezaKPIs: ehDiaUnico ? undefined : { total, emDia, atrasado, critico, semRegistro, pctEmDia: total ? Math.round((emDia / total) * 100) : 0 },
      limpezaDiaKPIs: ehDiaUnico ? {
        limposNoDia: limpezasDoDia.length,
        dentroMeta: limpezasDoDia.filter((item) => item.statusLabel === 'Dentro da meta').length,
        acimaMeta: limpezasDoDia.filter((item) => item.statusLabel === 'Acima da meta').length,
        muitoAcima: limpezasDoDia.filter((item) => item.statusLabel === 'Muito acima da meta').length,
        intervaloMedio: intervalos.length ? Math.round(intervalos.reduce((soma, item) => soma + item, 0) / intervalos.length) : null,
      } : undefined,
      limpezasDoDia: ehDiaUnico ? limpezasDoDia : undefined,
      maisAtrasado: !ehDiaUnico && maisAtrasado?.dias !== null && maisAtrasado?.meta != null ? { nome: maisAtrasado.nome, dias: maisAtrasado.dias, meta: maisAtrasado.meta } : null,
      statusPorBebedouro: ehDiaUnico ? undefined : status,
      checklistKPIs: {
        totalRegistros: registros.length,
        comChecklist: comChecklist.length,
        negativos: ocorrencias.length,
        pctNegativos: comChecklist.length ? Math.round((ocorrencias.length / comChecklist.length) * 100) : 0,
        itemMaisProblematico: maisProblematico,
      },
      itensRanking,
      ocorrencias,
    },
  }
}

function formatarNumero(valor: number, casas: number) {
  return valor.toFixed(casas).replace('.', ',')
}

function agregarMortes(linhas: LinhaMorte[], chave: (linha: LinhaMorte) => string | null) {
  const mapa = new Map<string, number>()
  for (const linha of linhas) {
    const label = chave(linha)
    if (label) mapa.set(label, (mapa.get(label) ?? 0) + 1)
  }
  return [...mapa.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
}

async function carregarMortes(
  fazenda: FazendaRelatorio,
  dataInicio: string,
  dataFim: string,
): Promise<PayloadRelatorioGeral> {
  const { data, error } = await supabase.rpc('get_dados_relatorio_morte_fazenda', {
    p_fazenda_id: fazenda.id,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
  })
  if (error) throw error
  const dados = data?.dados as DadosMorteRpc
  const linhas = dados?.linhas ?? []
  const { data: precosData } = await supabase.from('precos_categorias').select('categoria, preco_kg').eq('fazenda_id', fazenda.id)
  const precos = Object.fromEntries((precosData ?? []).map((item) => [item.categoria, Number(item.preco_kg)]))
  const porCausa = agregarMortes(linhas, (linha) => linha.causa_morte)
  const porCategoria = agregarMortes(linhas, (linha) => linha.categoria)
  const porSexo = agregarMortes(linhas, (linha) => linha.sexo)
  const porPasto = agregarMortes(linhas, (linha) => linha.pasto)
  const pesos = linhas.map((linha) => linha.peso_vivo).filter((peso): peso is number => peso != null)
  const pesoTotal = pesos.reduce((soma, peso) => soma + peso, 0)
  const perdaEstimada = linhas.reduce((soma, linha) => {
    if (linha.peso_vivo == null) return soma
    return soma + linha.peso_vivo * (precos[linha.categoria ?? ''] ?? PRECOS_KG_DEFAULT[linha.categoria ?? ''] ?? 10)
  }, 0)
  const causas = [...new Set(linhas.map((linha) => linha.causa_morte).filter((item): item is string => Boolean(item)))].sort()
  const categorias = [...new Set(linhas.map((linha) => linha.categoria).filter((item): item is string => Boolean(item)))].sort()
  const matriz = Object.fromEntries(causas.map((causa) => [causa, Object.fromEntries(categorias.map((categoria) => [categoria, 0]))])) as Record<string, Record<string, number>>
  for (const linha of linhas) if (linha.causa_morte && linha.categoria) matriz[linha.causa_morte][linha.categoria] += 1
  const diagnosticos = new Map<string, number>()
  for (const linha of linhas) {
    for (const [chave, item] of Object.entries(linha.diagnosticos ?? {})) {
      if (item.valor === 'S') diagnosticos.set(chave, (diagnosticos.get(chave) ?? 0) + 1)
    }
  }
  const taxaMortalidade = dados.rebanho_total ? (linhas.length / dados.rebanho_total) * 100 : null
  const anterior = dados.periodo_anterior
  const variacaoMortes = anterior?.total_mortes ? ((linhas.length - anterior.total_mortes) / anterior.total_mortes) * 100 : null
  const insights: string[] = []
  if (!linhas.length) {
    insights.push('Nenhuma morte registrada no período selecionado.')
  } else {
    if (taxaMortalidade != null) insights.push(`A taxa de mortalidade no período foi ${formatarNumero(taxaMortalidade, 2)}% (${linhas.length} ${linhas.length === 1 ? 'morte' : 'mortes'} em um rebanho de ${dados.rebanho_total} cabeças).`)
    if (variacaoMortes != null) insights.push(`Houve ${variacaoMortes > 0 ? 'aumento' : 'redução'} de ${formatarNumero(Math.abs(variacaoMortes), 1)}% nas mortes em relação ao período anterior (${anterior?.total_mortes ?? 0} mortes).`)
    else if (anterior?.total_mortes === 0) insights.push(`Nenhuma morte foi registrada no período anterior (${anterior.data_inicio} a ${anterior.data_fim}).`)
    if (porCausa[0]) insights.push(`A causa principal foi ${porCausa[0].label} (${porCausa[0].valor} ${porCausa[0].valor === 1 ? 'caso' : 'casos'}, ${formatarNumero((porCausa[0].valor / linhas.length) * 100, 0)}% do total).`)
    if (porCategoria[0]) insights.push(`A categoria mais afetada foi ${porCategoria[0].label} com ${porCategoria[0].valor} ${porCategoria[0].valor === 1 ? 'morte' : 'mortes'}.`)
    if (porPasto[0] && porPasto.length > 1 && (porPasto[0].valor / linhas.length) * 100 >= 30) insights.push(`O pasto ${porPasto[0].label} concentrou ${formatarNumero((porPasto[0].valor / linhas.length) * 100, 0)}% das mortes (${porPasto[0].valor}), merecendo atenção prioritária.`)
    if (perdaEstimada > 0) insights.push(`A perda estimada é de R$ ${perdaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${formatarNumero(pesoTotal, 0)} kg perdidos, precificados por categoria).`)
  }
  const resumo: ResumoMorte = {
    ...dados.resumo,
    total_mortes: linhas.length,
    media_por_dia: dados.resumo?.media_por_dia ?? null,
    peso_medio: pesos.length ? pesoTotal / pesos.length : null,
    causa_mais_frequente: porCausa[0]?.label ?? null,
    causa_mais_frequente_count: porCausa[0]?.valor ?? null,
    por_causa: porCausa,
    por_categoria: porCategoria,
    por_sexo: porSexo,
    por_pasto: porPasto,
    matriz_causa_categoria: { causas, categorias, matriz },
    frequencia_diagnosticos: [...diagnosticos.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor),
    taxa_mortalidade: taxaMortalidade,
    rebanho_total: dados.rebanho_total ?? 0,
    perda_estimada: perdaEstimada,
    peso_total_perdido: pesoTotal,
    periodo_anterior: anterior ?? null,
    variacao_mortes: variacaoMortes,
    insights: insights.join(' '),
  }
  return {
    tipo: 'morte',
    dados: { dataInicio, dataFim, fazendaNome: fazenda.nome, fazendaLogoUrl: fazenda.logoUrl, linhas, resumo, pastosGeo: dados?.pastos_geo ?? [] },
  }
}

export interface OpcoesCarregamentoRelatorios {
  boletim?: DadosPDFBoletimRebanho
}

async function carregarBoletim(
  fazenda: FazendaRelatorio,
  _dataInicio: string,
  _dataFim: string,
  opcoes?: OpcoesCarregamentoRelatorios,
): Promise<PayloadRelatorioGeral> {
  if (!opcoes?.boletim) throw new Error('Selecione uma planilha e um mês de referência para o Boletim de Rebanho.')
  return {
    tipo: 'boletim_rebanho',
    dados: {
      ...opcoes.boletim,
      fazendaNome: fazenda.nome,
      fazendaLogoUrl: fazenda.logoUrl,
    },
  }
}

const LOADERS: Record<TipoRelatorioGeral, (fazenda: FazendaRelatorio, dataInicio: string, dataFim: string, opcoes?: OpcoesCarregamentoRelatorios) => Promise<PayloadRelatorioGeral>> = {
  abastecimento: carregarAbastecimento,
  consumo: carregarConsumo,
  bebedouros: carregarBebedouros,
  morte: carregarMortes,
  boletim_rebanho: carregarBoletim,
}

export async function carregarRelatoriosGerais(
  tipos: TipoRelatorioGeral[],
  fazenda: FazendaRelatorio,
  dataInicio: string,
  dataFim: string,
  onEtapa?: (titulo: string) => void,
  opcoes?: OpcoesCarregamentoRelatorios,
): Promise<PayloadRelatorioGeral[]> {
  const resultados: PayloadRelatorioGeral[] = []
  for (const tipo of tipos) {
    onEtapa?.(`Carregando ${tipo}`)
    resultados.push(await LOADERS[tipo](fazenda, dataInicio, dataFim, opcoes))
  }
  return resultados
}
