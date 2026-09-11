import { useEffect, useMemo, useState, ReactNode } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, ConfirmModal, CardItem, Modal, MultiSelect, useToast } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { updateFazenda } from '../../services/fazendasService'
import type { ExpedienteDias, ExpedienteDia } from '../../services/fazendasService'
import { hashPin } from '../../utils/pinHash'
import { CADERNETAS } from '../../utils/cadernetas'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import type * as XLSXType from 'xlsx'

interface TabConfig {
  key: string
  label: string
  singular?: string
  gender?: 'm' | 'f'
  table: string
  fields: { name: string; label: string; required?: boolean; placeholder?: string; options?: { label: string; value: string }[]; showIf?: (formData: Record<string, string>) => boolean }[]
  searchPlaceholder: string
  statusField?: 'ativo' | 'status'
  orderBy?: string
  category: string
  icon: ReactNode
}

// Simple inline SVG icons
const iconGenetica = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
)
const iconInfra = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
)
const iconMaquina = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
)
const iconSaude = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
)
const iconOperacional = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
)
const iconAgua = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
)

const tabs: TabConfig[] = [
  {
    key: 'racas',
    label: 'Raças',
    singular: 'Raça',
    gender: 'f',
    table: 'racas',
    fields: [{ name: 'nome', label: 'Nome', required: true, placeholder: 'Nome da raça' }],
    searchPlaceholder: 'Buscar raça...',
    category: 'Genética',
    icon: iconGenetica,
  },
  {
    key: 'locais',
    label: 'Locais',
    singular: 'Local',
    table: 'locais',
    fields: [{ name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do local' }],
    searchPlaceholder: 'Buscar local...',
    category: 'Infraestrutura',
    icon: iconInfra,
  },
  {
    key: 'causas-morte',
    label: 'Causas de Morte',
    singular: 'Causa de Morte',
    gender: 'f',
    table: 'causas_morte',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome da causa de morte' },
      { name: 'descricao', label: 'Descrição', placeholder: 'Descrição opcional' },
    ],
    searchPlaceholder: 'Buscar causa de morte...',
    category: 'Saúde & Reprodução',
    icon: iconSaude,
  },
  {
    key: 'implementos',
    label: 'Implementos',
    singular: 'Implemento',
    table: 'implementos',
    fields: [{ name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do implemento' }],
    searchPlaceholder: 'Buscar implemento...',
    category: 'Máquinas & Equipamentos',
    icon: iconMaquina,
  },
  {
    key: 'vagoes',
    label: 'Vagões',
    singular: 'Vagão',
    table: 'vagoes',
    fields: [
      { name: 'marca', label: 'Marca', required: true, placeholder: 'Ex: IRL, Reboval, Star' },
      { name: 'modelo', label: 'Modelo', required: true, placeholder: 'Ex: 14000, RDS 9000' },
      { name: 'capacidade_kg', label: 'Capacidade (kg)', placeholder: 'Ex: 14000' },
    ],
    searchPlaceholder: 'Buscar vagão...',
    category: 'Máquinas & Equipamentos',
    icon: iconMaquina,
  },
  {
    key: 'tratamentos',
    label: 'Tratamentos de Maternidade',
    singular: 'Tratamento de Maternidade',
    table: 'tratamentos',
    fields: [{ name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do tratamento' }],
    searchPlaceholder: 'Buscar tratamento...',
    category: 'Saúde & Reprodução',
    icon: iconSaude,
  },
  {
    key: 'itens-almoxarifado',
    label: 'Itens do Almoxarifado',
    singular: 'Item do Almoxarifado',
    table: 'itens_almoxarifado',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do item' },
      { name: 'classificacao', label: 'Classificação', placeholder: 'Selecione uma classificação', options: [
        { value: 'Ferramentas', label: 'Ferramentas' },
        { value: 'Peças', label: 'Peças' },
        { value: 'Hidráulica', label: 'Hidráulica' },
        { value: 'Elétrica', label: 'Elétrica' },
        { value: 'Insumos', label: 'Insumos' },
        { value: 'Fertilizantes', label: 'Fertilizantes' },
        { value: 'Corretivos', label: 'Corretivos' },
        { value: 'Defensivos', label: 'Defensivos' },
        { value: 'Herbicidas', label: 'Herbicidas' },
        { value: 'Fungicidas', label: 'Fungicidas' },
        { value: 'Inseticidas', label: 'Inseticidas' },
        { value: 'Adjuvantes', label: 'Adjuvantes' },
        { value: 'Sementes', label: 'Sementes' },
        { value: 'Medicamentos', label: 'Medicamentos' },
        { value: 'Equipamentos', label: 'Equipamentos' },
        { value: 'Combustíveis', label: 'Combustíveis' },
        { value: 'Lubrificantes', label: 'Lubrificantes' },
        { value: 'EPI', label: 'EPI' },
        { value: 'Materiais de Construção', label: 'Materiais de Construção' },
      ] },
    ],
    searchPlaceholder: 'Buscar item...',
    category: 'Operacional',
    icon: iconOperacional,
  },
  {
    key: 'itens-supermercado',
    label: 'Itens de Supermercado',
    singular: 'Item de Supermercado',
    table: 'itens_supermercado',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do item' },
      { name: 'unidade_medida', label: 'Unidade de Medida', placeholder: 'Ex: kg, un, litro' },
    ],
    searchPlaceholder: 'Buscar item...',
    category: 'Operacional',
    icon: iconOperacional,
  },
  {
    key: 'pluviometros',
    label: 'Pluviômetros',
    singular: 'Pluviômetro',
    table: 'pluviometros',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do pluviômetro' },
      { name: 'localizacao', label: 'Localização', placeholder: 'Localização do pluviômetro' },
    ],
    searchPlaceholder: 'Buscar pluviômetro...',
    category: 'Infraestrutura',
    icon: iconAgua,
  },
  {
    key: 'maquinas-veiculos',
    label: 'Máquinas e Veículos',
    singular: 'Máquina/Veículo',
    gender: 'f',
    table: 'maquinas_veiculos',
    fields: [
      { name: 'marca', label: 'Marca', required: true, placeholder: 'Ex: John Deere, Massey Ferguson' },
      { name: 'modelo', label: 'Modelo', required: true, placeholder: 'Ex: 6110J, 4292' },
      { name: 'tipo', label: 'Tipo', required: true, options: [{ label: 'Máquina', value: 'Maquina' }, { label: 'Veículo', value: 'Veiculo' }] },
      { name: 'categoria', label: 'Categoria', required: true, options: [
        { label: 'Trator', value: 'Trator' },
        { label: 'Colheitadeira', value: 'Colheitadeira' },
        { label: 'Caminhão', value: 'Caminhao' },
        { label: 'Carro', value: 'Carro' },
        { label: 'Motocicleta', value: 'Motocicleta' },
        { label: 'Pulverizador', value: 'Pulverizador' },
        { label: 'Adubadeira', value: 'Adubadeira' },
        { label: 'Semeadora', value: 'Semeadora' },
        { label: 'Grade', value: 'Grade' },
        { label: 'Subsolador', value: 'Subsolador' },
        { label: 'Plaina', value: 'Plaina' },
        { label: 'Roçadeira', value: 'Rocadeira' },
        { label: 'Guincho', value: 'Guincho' },
        { label: 'Outro', value: 'Outro' },
      ]},
      { name: 'outro_categoria', label: 'Especificar Categoria', required: true, placeholder: 'Descreva a categoria', showIf: (d) => d.categoria === 'Outro' },
      { name: 'placa', label: 'Placa', placeholder: 'Placa' },
      { name: 'status', label: 'Status', options: [{ label: 'Ativo', value: 'Ativo' }, { label: 'Inativo', value: 'Inativo' }, { label: 'Manutenção', value: 'Manutencao' }] },
    ],
    searchPlaceholder: 'Buscar máquina/veículo...',
    statusField: 'status',
    category: 'Máquinas & Equipamentos',
    icon: iconMaquina,
  },
  {
    key: 'setores',
    label: 'Setores',
    table: 'setores',
    fields: [{ name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do setor' }],
    searchPlaceholder: 'Buscar setor...',
    category: 'Operacional',
    icon: iconOperacional,
  },
  {
    key: 'funcionarios',
    label: 'Funcionários',
    singular: 'Funcionário',
    table: 'funcionarios',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do funcionário' },
      { name: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
      { name: 'telefone', label: 'Telefone', placeholder: '(00) 00000-0000' },
      { name: 'cargo', label: 'Cargo', placeholder: 'Ex: Veterinário, Capataz' },
    ],
    searchPlaceholder: 'Buscar funcionário...',
    category: 'Operacional',
    icon: iconOperacional,
  },
  {
    key: 'medicamentos',
    label: 'Medicamentos',
    singular: 'Medicamento',
    table: 'medicamentos',
    fields: [
      { name: 'nome_comercial', label: 'Nome Comercial', required: true, placeholder: 'Nome do medicamento' },
      { name: 'principio_ativo', label: 'Princípio Ativo', required: true, placeholder: 'Princípio ativo' },
      { name: 'tipo', label: 'Tipo', required: true, options: [
        { label: 'Antibiótico', value: 'Antibiotico' },
        { label: 'Vermífugo', value: 'Vermifugo' },
        { label: 'Carrapaticida', value: 'Carrapaticida' },
        { label: 'Vacina', value: 'Vacina' },
        { label: 'Anti-inflamatório', value: 'Anti_inflamatorio' },
        { label: 'Analgésico', value: 'Analgesico' },
        { label: 'Hormônio', value: 'Hormonio' },
        { label: 'Vitamina/Mineral', value: 'Vitamina_Mineral' },
        { label: 'Probiótico', value: 'Probiotico' },
        { label: 'Anti-stress', value: 'Anti_stress' },
        { label: 'Coccidiostático', value: 'Coccidiostatico' },
        { label: 'Flúido oral/Eletrólitos', value: 'Fluido_oral' },
        { label: 'Outro', value: 'Outro' },
      ]},
      { name: 'outro_tipo', label: 'Especificar Tipo', required: true, placeholder: 'Descreva o tipo', showIf: (d) => d.tipo === 'Outro' },
      { name: 'dose_recomendada', label: 'Dose Recomendada', required: true, placeholder: 'Ex: 1ml/50kg' },
    ],
    searchPlaceholder: 'Buscar medicamento...',
    orderBy: 'nome_comercial',
    category: 'Saúde & Reprodução',
    icon: iconSaude,
  },
  {
    key: 'bebedouros',
    label: 'Bebedouros',
    singular: 'Bebedouro',
    table: 'bebedouros',
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nome do bebedouro' },
      { name: 'capacidade', label: 'Capacidade (L)', placeholder: 'Ex: 500' },
      { name: 'meta_intervalo_limpeza', label: 'Meta Intervalo Limpeza (dias)', placeholder: 'Ex: 30' },
      { name: 'setor_id', label: 'Setor', placeholder: 'Selecione um setor' },
    ],
    searchPlaceholder: 'Buscar bebedouro...',
    category: 'Infraestrutura',
    icon: iconAgua,
  },
]

interface GenericItem {
  id: string
  fazenda_id: string
  nome: string
  nome_comercial?: string
  descricao?: string
  classificacao?: string
  localizacao?: string
  unidade_medida?: string
  tipo?: string
  categoria?: string
  modelo?: string
  placa?: string
  status?: string
  cpf?: string
  telefone?: string
  cargo?: string
  principio_ativo?: string
  dose_recomendada?: string
  capacidade?: number
  meta_intervalo_limpeza?: number
  ativo: boolean
  [key: string]: any
}

interface TabState {
  items: GenericItem[]
  loading: boolean
  showForm: boolean
  editingItem: GenericItem | null
  searchTerm: string
  formData: Record<string, string>
  submitting: boolean
}

const defaultTabState: TabState = {
  items: [],
  loading: true,
  showForm: false,
  editingItem: null,
  searchTerm: '',
  formData: {},
  submitting: false,
}

// Formata inteiro com separadores de milhar (ponto)
function formatIntWithThousands(value: string | number | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('pt-BR')
}

// Extrai apenas os dígitos de um valor formatado
function parseFormattedInt(value: string): string {
  return value.replace(/\D/g, '')
}

// Retorna o artigo indefinido conforme o gênero
function novoArtigo(tab: TabConfig): string {
  return tab.gender === 'f' ? 'Nova' : 'Novo'
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const TIMEZONES_BR = [
  { value: 'America/Cuiaba', label: 'Cuiabá (MT)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (SP)' },
  { value: 'America/Manaus', label: 'Manaus (AM)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (CE)' },
  { value: 'America/Recife', label: 'Recife (PE)' },
  { value: 'America/Bahia', label: 'Salvador (BA)' },
  { value: 'America/Belem', label: 'Belém (PA)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (RO)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (RR)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (MS)' },
  { value: 'America/Araguaina', label: 'Araguaína (TO)' },
]

function defaultExpediente(): ExpedienteDias {
  return {
    0: { ativo: false, inicio: '06:00', fim: '18:00' },
    1: { ativo: true, inicio: '06:00', fim: '18:00' },
    2: { ativo: true, inicio: '06:00', fim: '18:00' },
    3: { ativo: true, inicio: '06:00', fim: '18:00' },
    4: { ativo: true, inicio: '06:00', fim: '18:00' },
    5: { ativo: true, inicio: '06:00', fim: '18:00' },
    6: { ativo: true, inicio: '06:00', fim: '12:00' },
  }
}

function resumoExpediente(dias: ExpedienteDias): string {
  const ativos = DIAS_SEMANA
    .map((nome, dia) => ({ nome, dia, config: dias[dia] }))
    .filter((d) => d.config?.ativo)

  if (ativos.length === 0) return 'Nenhum dia ativo'

  // Agrupar dias com mesmo horário
  const grupos: { dias: string[]; inicio: string; fim: string }[] = []
  for (const d of ativos) {
    const inicio = d.config!.inicio || '06:00'
    const fim = d.config!.fim || '18:00'
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.inicio === inicio && ultimo.fim === fim) {
      ultimo.dias.push(d.nome.slice(0, 3))
    } else {
      grupos.push({ dias: [d.nome.slice(0, 3)], inicio, fim })
    }
  }

  return grupos
    .map((g) => `${g.dias.join(', ')} ${g.inicio}-${g.fim}`)
    .join(' | ')
}

export function CadastrosAuxiliares() {
  const { user } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState(tabs[0].key)
  const [tabStates, setTabStates] = useState<Record<string, TabState>>(
    () => Object.fromEntries(tabs.map((t) => [t.key, { ...defaultTabState }]))
  )
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ tab: string; id: string } | null>(null)
  const [showRbacAlertModal, setShowRbacAlertModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [setores, setSetores] = useState<{id: string, nome: string}[]>([])
  const [funcionariosComSetor, setFuncionariosComSetor] = useState<{id: string, nome: string, setor_ids: string[], setor_nomes: string[], cargo: string | null, ativo: boolean}[]>([])
  const [setorEmEdicao, setSetorEmEdicao] = useState<{id: string | null, nome: string, funcionario_ids: string[]} | null>(null)
  const [salvandoSetor, setSalvandoSetor] = useState(false)
  const [atribuindoFunc, setAtribuindoFunc] = useState<string | null>(null)
  const [setorParaExcluir, setSetorParaExcluir] = useState<string | null>(null)
  const [funcionarioRbac, setFuncionarioRbac] = useState({
    acessa_app: false,
    pin: '',
    cadernetas_permitidas: [] as string[],
    expediente_override: null as ExpedienteDias | null,
  })
  const [funcionarioErrors, setFuncionarioErrors] = useState<Record<string, string>>({})
  const [mostrarApenasComAcesso, setMostrarApenasComAcesso] = useState(false)
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [controleAcessoHabilitado, setControleAcessoHabilitado] = useState(false)
  const [controleAcessoLoading, setControleAcessoLoading] = useState(false)
  const [expedienteHabilitado, setExpedienteHabilitado] = useState(false)
  const [expedienteTimezone, setExpedienteTimezone] = useState('America/Cuiaba')
  const [expedienteDias, setExpedienteDias] = useState<ExpedienteDias>(defaultExpediente())
  const [expedienteLoading, setExpedienteLoading] = useState(false)
  const [expedienteExpandido, setExpedienteExpandido] = useState(false)
  const [cadernetasExpandidas, setCadernetasExpandidas] = useState<Record<string, boolean>>({})

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const ITENS_POR_PAGINA = 12

  const currentTab = tabs.find((t) => t.key === activeTab)!
  const state = tabStates[activeTab] || { ...defaultTabState }

  // Setores ordenados: primeiro os que têm funcionários, depois os vazios
  const setoresOrdenados = useMemo(() => {
    const term = tabStates.setores?.searchTerm?.toLowerCase() || ''
    const filtrados = setores.filter((s) => s.nome.toLowerCase().includes(term))
    const comMembros = filtrados.filter((s) =>
      funcionariosComSetor.some((f) => f.setor_ids.includes(s.id) && f.ativo)
    )
    const semMembros = filtrados.filter((s) =>
      !funcionariosComSetor.some((f) => f.setor_ids.includes(s.id) && f.ativo)
    )
    return [...comMembros, ...semMembros]
  }, [setores, funcionariosComSetor, tabStates.setores?.searchTerm])

  useEffect(() => {
    loadFazendaVinculada()
  }, [user])

  useEffect(() => {
    if (activeTab !== 'equipes') {
      loadItems(activeTab)
    }
    if (activeTab === 'bebedouros') {
      loadSetores()
    }
    if (activeTab === 'funcionarios' || activeTab === 'setores') {
      loadSetoresComFuncionarios()
    }
  }, [activeTab, user])

  useEffect(() => {
    setPaginaAtual(1)
  }, [state.searchTerm, activeTab, mostrarApenasComAcesso])

  const loadFazendaVinculada = async () => {
    const id = await getFazendaId()
    if (!id) return
    setFazendaId(id)

    const { data, error } = await supabase
      .from('fazendas')
      .select('controle_acesso_habilitado, expediente_habilitado, expediente_timezone, expediente_dias')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Erro ao buscar configuração de acesso da fazenda:', error)
    } else if (data) {
      setControleAcessoHabilitado(!!data.controle_acesso_habilitado)
      setExpedienteHabilitado(!!data.expediente_habilitado)
      setExpedienteTimezone(data.expediente_timezone || 'America/Cuiaba')
      setExpedienteDias(
        data.expediente_dias && typeof data.expediente_dias === 'object'
          ? { ...defaultExpediente(), ...data.expediente_dias }
          : defaultExpediente()
      )
    }
  }

  const loadSetores = async () => {
    const fazendaId = await getFazendaId()
    if (!fazendaId) return

    const { data, error } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar setores:', error)
    } else {
      setSetores(data || [])
    }
  }

  const loadSetoresComFuncionarios = async () => {
    const fazendaId = await getFazendaId()
    if (!fazendaId) return

    // Buscar setores e funcionários com setores em paralelo (são independentes)
    const [
      { data, error },
      { data: funcData, error: funcError },
    ] = await Promise.all([
      supabase
        .from('setores')
        .select('id, nome')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome', { ascending: true }),
      supabase
        .from('v_funcionarios_com_setores')
        .select('funcionario_id, nome, cargo, ativo, setor_ids, setor_nomes')
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .order('nome', { ascending: true }),
    ])

    if (error) {
      console.error('Erro ao buscar setores:', error)
    } else {
      setSetores(data || [])
    }

    if (funcError) {
      console.error('Erro ao buscar funcionários com setor:', funcError)
    } else {
      setFuncionariosComSetor((funcData || []).map((f: any) => ({
        id: f.funcionario_id,
        nome: f.nome,
        setor_ids: f.setor_ids || [],
        setor_nomes: f.setor_nomes || [],
        cargo: f.cargo || null,
        ativo: f.ativo,
      })))
    }
  }

  const handleSalvarSetor = async () => {
    if (!setorEmEdicao?.nome.trim()) return
    const fazendaId = await getFazendaId()
    if (!fazendaId) return

    setSalvandoSetor(true)
    try {
      let setorId = setorEmEdicao.id

      if (setorId) {
        // Editar
        const { error } = await supabase
          .from('setores')
          .update({ nome: setorEmEdicao.nome.trim() })
          .eq('id', setorId)
        if (error) throw error
      } else {
        // Criar
        const { data, error } = await supabase
          .from('setores')
          .insert({ fazenda_id: fazendaId, nome: setorEmEdicao.nome.trim(), ativo: true })
          .select('id')
          .single()
        if (error) throw error
        setorId = data.id
      }

      // Atribuir funcionarios selecionados via junction N:N
      if (setorId) {
        // Membros atuais deste setor
        const membrosAtuais = funcionariosComSetor.filter(
          (f) => f.setor_ids.includes(setorId) && f.ativo
        )
        const atuaisIds = membrosAtuais.map((m) => m.id)
        const novosIds = setorEmEdicao.funcionario_ids.filter((id) => !atuaisIds.includes(id))
        const removidosIds = atuaisIds.filter((id) => !setorEmEdicao.funcionario_ids.includes(id))

        // Inserir novos vinculos
        for (const funcId of novosIds) {
          await supabase
            .from('funcionario_setores')
            .insert({ funcionario_id: funcId, setor_id: setorId, fazenda_id: fazendaId })
        }
        // Remover vinculos desmarcados
        for (const funcId of removidosIds) {
          await supabase
            .from('funcionario_setores')
            .delete()
            .eq('funcionario_id', funcId)
            .eq('setor_id', setorId)
        }
      }

      setSetorEmEdicao(null)
      await loadSetoresComFuncionarios()
      toast.success('Setor salvo com sucesso.')
    } catch (err) {
      console.error('Erro ao salvar setor:', err)
      toast.error('Erro ao salvar setor.')
    } finally {
      setSalvandoSetor(false)
    }
  }

  const handleExcluirSetor = async (setorId: string) => {
    setSetorParaExcluir(setorId)
  }

  const confirmarExclusaoSetor = async () => {
    if (!setorParaExcluir) return
    try {
      // Desvincular funcionários da junction
      await supabase
        .from('funcionario_setores')
        .delete()
        .eq('setor_id', setorParaExcluir)
      // Soft delete
      await supabase
        .from('setores')
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq('id', setorParaExcluir)
      await loadSetoresComFuncionarios()
    } catch (err) {
      console.error('Erro ao excluir setor:', err)
      toast.error('Erro ao excluir setor.')
    } finally {
      setSetorParaExcluir(null)
    }
  }

  const handleAtribuirSetor = async (funcionarioId: string, setorId: string) => {
    setAtribuindoFunc(funcionarioId)
    try {
      // Adicionar vínculo na junction (N:N: não remove outros setores)
      const { error } = await supabase
        .from('funcionario_setores')
        .insert({ funcionario_id: funcionarioId, setor_id: setorId, fazenda_id: fazendaId })
      if (error && error.code !== '23505') throw error // 23505 = duplicate, ignorar
      await loadSetoresComFuncionarios()
    } catch (err) {
      console.error('Erro ao atribuir setor:', err)
      toast.error('Erro ao atribuir setor.')
    } finally {
      setAtribuindoFunc(null)
    }
  }

  const handleRemoverDoSetor = async (funcionarioId: string, setorId: string) => {
    setAtribuindoFunc(funcionarioId)
    try {
      const { error } = await supabase
        .from('funcionario_setores')
        .delete()
        .eq('funcionario_id', funcionarioId)
        .eq('setor_id', setorId)
      if (error) throw error
      await loadSetoresComFuncionarios()
    } catch (err) {
      console.error('Erro ao remover do setor:', err)
      toast.error('Erro ao remover do setor.')
    } finally {
      setAtribuindoFunc(null)
    }
  }

  const getFazendaId = async (): Promise<string | null> => {
    if (!user) return null
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return null
    return vinculos[0].fazenda_id
  }

  const loadItems = async (tabKey: string) => {
    const fazendaId = await getFazendaId()
    if (!fazendaId) return

    const tab = tabs.find((t) => t.key === tabKey)!
    let query = supabase
      .from(tab.table)
      .select('*')
      .eq('fazenda_id', fazendaId)

    // Tabelas com soft delete (deleted_at) filtram registros excluídos
    if (tabKey === 'funcionarios') {
      query = query.is('deleted_at', null)
    }

    const { data, error } = await query.order(tab.orderBy || 'nome', { ascending: true })

    if (error) {
      console.error(`Erro ao buscar ${tab.label}:`, error)
    }

    setTabStates((prev) => ({
      ...prev,
      [tabKey]: {
        ...prev[tabKey],
        items: data || [],
        loading: false,
      },
    }))
  }

  const getInitialFormData = (tab: TabConfig): Record<string, string> => {
    const data: Record<string, string> = {}
    tab.fields.forEach((f) => (data[f.name] = ''))
    return data
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setTabStates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], submitting: true },
    }))

    const fazendaId = await getFazendaId()
    if (!fazendaId) {
      setTabStates((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab], submitting: false },
      }))
      return
    }

    const tab = tabs.find((t) => t.key === activeTab)!
    const data: any = { fazenda_id: fazendaId }
    tab.fields.forEach((f) => {
      const value = state.formData[f.name]
      data[f.name] = value || null
    })

    // Converter capacidade_kg de formatado para número puro
    if (activeTab === 'vagoes' && data.capacidade_kg) {
      const digits = parseFormattedInt(data.capacidade_kg)
      data.capacidade_kg = digits ? parseInt(digits, 10) : null
    }

    // Auto-populate nome for maquinas-veiculos from marca + modelo
    if (activeTab === 'maquinas-veiculos' && !data.nome) {
      const marca = state.formData.marca || ''
      const modelo = state.formData.modelo || ''
      data.nome = `${marca} ${modelo}`.trim() || null
    }

    // Auto-populate nome for vagoes from marca + modelo
    if (activeTab === 'vagoes' && !data.nome) {
      const marca = state.formData.marca || ''
      const modelo = state.formData.modelo || ''
      data.nome = `${marca} ${modelo}`.trim() || null
    }

    // RBAC para funcionários
    if (activeTab === 'funcionarios') {
      data.acessa_app = funcionarioRbac.acessa_app

      if (funcionarioRbac.acessa_app) {
        const temPinAtual = !!state.editingItem?.pin_hash
        if (!/^[0-9]{4}$/.test(funcionarioRbac.pin) && !temPinAtual) {
          setFuncionarioErrors({ pin: 'PIN deve ter exatamente 4 dígitos numéricos.' })
          setTabStates((prev) => ({
            ...prev,
            [activeTab]: { ...prev[activeTab], submitting: false },
          }))
          return
        }

        if (funcionarioRbac.cadernetas_permitidas.length === 0) {
          setFuncionarioErrors({ cadernetas: 'Selecione pelo menos uma caderneta.' })
          setTabStates((prev) => ({
            ...prev,
            [activeTab]: { ...prev[activeTab], submitting: false },
          }))
          return
        }

        data.cadernetas_permitidas = funcionarioRbac.cadernetas_permitidas
        data.expediente_override = funcionarioRbac.expediente_override

        // Gerar pin_hash antes do insert/update para evitar race condition
        // (insert sem pin_hash + update separado podia deixar funcionario em estado quebrado)
        if (funcionarioRbac.pin) {
          if (state.editingItem) {
            // Edição com PIN novo: incluir pin_hash no update
            const pinHash = await hashPin(funcionarioRbac.pin, state.editingItem.id, fazendaId)
            data.pin_hash = pinHash
          } else {
            // Novo funcionário: gerar UUID antes do insert para poder computar o hash
            const newId = crypto.randomUUID()
            const pinHash = await hashPin(funcionarioRbac.pin, newId, fazendaId)
            data.id = newId
            data.pin_hash = pinHash
          }
        }
      } else {
        data.pin_hash = null
        data.cadernetas_permitidas = []
        data.expediente_override = null
      }
    }

    let error

    if (state.editingItem) {
      const { error: updateError } = await supabase
        .from(tab.table)
        .update(data)
        .eq('id', state.editingItem.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from(tab.table).insert(data).select()
      error = insertError
    }

    if (error) {
      console.error(`Erro ao salvar ${tab.label}:`, error)
      toast.error('Erro ao salvar. Verifique se já não existe um registro com este nome.')
    } else {
      setFuncionarioErrors({})
      setTabStates((prev) => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          formData: getInitialFormData(tab),
          showForm: false,
          editingItem: null,
          submitting: false,
        },
      }))
      loadItems(activeTab)
      toast.success(state.editingItem ? `${tab.singular || tab.label} atualizado(a) com sucesso.` : `${tab.singular || tab.label} criado(a) com sucesso.`)
    }

    setTabStates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], submitting: false },
    }))
  }

  const handleEdit = (item: GenericItem) => {
    setFuncionarioErrors({})
    const tab = tabs.find((t) => t.key === activeTab)!
    const formData: Record<string, string> = {}
    tab.fields.forEach((f) => {
      formData[f.name] = item[f.name] || ''
    })

    // Formatar capacidade_kg com separadores de milhar ao editar
    if (activeTab === 'vagoes' && formData.capacidade_kg) {
      formData.capacidade_kg = formatIntWithThousands(formData.capacidade_kg)
    }

    if (activeTab === 'funcionarios') {
      setFuncionarioRbac({
        acessa_app: !!item.acessa_app,
        pin: '',
        cadernetas_permitidas: Array.isArray(item.cadernetas_permitidas) ? item.cadernetas_permitidas : [],
        expediente_override: item.expediente_override || null,
      })
    }

    setTabStates((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        editingItem: item,
        formData,
        showForm: true,
      },
    }))
  }

  const handleCancel = () => {
    const tab = tabs.find((t) => t.key === activeTab)!
    setFuncionarioErrors({})
    setFuncionarioRbac({
      acessa_app: false,
      pin: '',
      cadernetas_permitidas: [],
      expediente_override: null,
    })
    setTabStates((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        editingItem: null,
        formData: getInitialFormData(tab),
        showForm: false,
      },
    }))
  }

  const handleDeleteClick = (id: string) => {
    setItemToDelete({ tab: activeTab, id })
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    const tab = tabs.find((t) => t.key === itemToDelete.tab)!

    let error
    if (itemToDelete.tab === 'vagoes') {
      // Vagões: exclusão definitiva (hard delete)
      const { error: deleteError } = await supabase
        .from(tab.table)
        .delete()
        .eq('id', itemToDelete.id)
      error = deleteError
    } else {
      // Demais cadastros: soft delete (inativar)
      const { error: updateError } = await supabase
        .from(tab.table)
        .update({ ativo: false, deleted_at: new Date().toISOString() })
        .eq('id', itemToDelete.id)
      error = updateError
    }

    if (error) {
      console.error(`Erro ao excluir ${tab.label}:`, error)
    } else {
      loadItems(itemToDelete.tab)
    }

    setShowDeleteModal(false)
    setItemToDelete(null)
  }

  const isItemActive = (item: GenericItem, tab: TabConfig) => {
    if (tab.statusField === 'status') {
      return item.status === 'Ativo'
    }
    return !!item.ativo
  }

  const handleToggleActive = async (item: GenericItem) => {
    const tab = tabs.find((t) => t.key === activeTab)!
    const active = isItemActive(item, tab)
    const updateData =
      tab.statusField === 'status'
        ? { status: active ? 'Inativo' : 'Ativo' }
        : { ativo: !active }
    const { error } = await supabase
      .from(tab.table)
      .update(updateData)
      .eq('id', item.id)

    if (error) {
      console.error('Erro ao atualizar status:', error)
    } else {
      loadItems(activeTab)
    }
  }

  const setFormField = (field: string, value: string) => {
    setTabStates((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        formData: { ...prev[activeTab].formData, [field]: value },
      },
    }))
  }

  const setSearchTerm = (value: string) => {
    setTabStates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], searchTerm: value },
    }))
  }

  const handleToggleControleAcesso = async () => {
    if (!fazendaId) return

    const novoEstado = !controleAcessoHabilitado

    if (novoEstado) {
      const { data: funcionariosComAcesso, error } = await supabase
        .from('funcionarios')
        .select('id')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .eq('acessa_app', true)
        .not('pin_hash', 'is', null)
        .limit(1)

      if (error) {
        console.error('Erro ao verificar funcionários com acesso:', error)
        return
      }

      if (!funcionariosComAcesso || funcionariosComAcesso.length === 0) {
        setShowRbacAlertModal(true)
        return
      }
    }

    setControleAcessoLoading(true)
    const atualizada = await updateFazenda(fazendaId, { controle_acesso_habilitado: novoEstado })
    setControleAcessoLoading(false)

    if (atualizada) {
      setControleAcessoHabilitado(novoEstado)
    } else {
      console.error('Erro ao atualizar controle de acesso da fazenda')
    }
  }

  const handleToggleExpediente = async () => {
    if (!fazendaId) return
    if (!controleAcessoHabilitado) {
      toast.error('Ative o controle de acesso por funcionário antes de definir o expediente.')
      return
    }

    const novoEstado = !expedienteHabilitado
    setExpedienteLoading(true)
    const atualizada = await updateFazenda(fazendaId, { expediente_habilitado: novoEstado })
    setExpedienteLoading(false)

    if (atualizada) {
      setExpedienteHabilitado(novoEstado)
      toast.success(novoEstado ? 'Expediente ativado.' : 'Expediente desativado.')
    } else {
      toast.error('Erro ao atualizar expediente da fazenda.')
    }
  }

  const handleSalvarExpediente = async () => {
    if (!fazendaId) return
    setExpedienteLoading(true)
    const atualizada = await updateFazenda(fazendaId, {
      expediente_timezone: expedienteTimezone,
      expediente_dias: expedienteDias,
    })
    setExpedienteLoading(false)

    if (atualizada) {
      toast.success('Expediente salvo com sucesso.')
    } else {
      toast.error('Erro ao salvar expediente.')
    }
  }

  const handleExpedienteDiaChange = (dia: number, campo: keyof ExpedienteDia, valor: string | boolean) => {
    setExpedienteDias((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], [campo]: valor },
    }))
  }

  const setShowForm = (show: boolean) => {
    setTabStates((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        showForm: show,
        formData: show ? prev[activeTab].formData : getInitialFormData(currentTab),
        editingItem: show ? prev[activeTab].editingItem : null,
      },
    }))
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return

    const file = e.target.files[0]
    setImporting(true)
    setImportError(null)
    setImportSuccess(null)

    try {
      if (!user) {
        setImportError('Usuário não autenticado')
        setImporting(false)
        return
      }

      const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

      if (!vinculos || vinculos.length === 0) {
        setImportError('Nenhuma fazenda vinculada ao usuário')
        setImporting(false)
        return
      }

      const fazendaId = vinculos[0].fazenda_id

      const { data: existingBebedouros } = await supabase
        .from('bebedouros')
        .select('nome')
        .eq('fazenda_id', fazendaId)

      const existingNames = new Set(existingBebedouros?.map(b => b.nome.toLowerCase()) || [])

      const data = await file.arrayBuffer()
      const XLSX = await import('xlsx') as typeof XLSXType
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

      if (jsonData.length < 2) {
        setImportError('Arquivo vazio ou sem dados')
        setImporting(false)
        return
      }

      const headers = jsonData[0].map((h: any) => h?.toString().trim())
      const rows = jsonData.slice(1)

      const requiredColumns = ['Nome/Numero', 'Capacidade (L)']
      const headersLower = headers.map(h => h.toLowerCase())
      const missingColumns = requiredColumns.filter(col => !headersLower.includes(col.toLowerCase()))

      if (missingColumns.length > 0) {
        setImportError(`Colunas obrigatórias faltando: ${missingColumns.join(', ')}`)
        setImporting(false)
        return
      }

      const colIndices: { [key: string]: number } = {}
      headers.forEach((header, index) => {
        colIndices[header.toLowerCase()] = index
      })

      const bebedourosToInsert: any[] = []
      const duplicates: { row: number; name: string }[] = []
      const invalidRows: { row: number; name: string; missingFields: string[] }[] = []
      let totalRowsProcessed = 0

      rows.forEach((row, rowIndex) => {
        const rowNum = rowIndex + 2
        const dataColumns = row.slice(0, 3)
        if (!row || row.length === 0 || dataColumns.every(cell => cell === undefined || cell === null || cell === '')) {
          return
        }

        totalRowsProcessed++

        try {
          const nome = row[colIndices['nome/numero']]?.toString().trim()
          const capacidade = parseFloat(row[colIndices['capacidade (l)']])
          const metaIntervalo = colIndices['meta de intervalo de limpeza (dias)'] !== undefined ? row[colIndices['meta de intervalo de limpeza (dias)']] ? parseInt(row[colIndices['meta de intervalo de limpeza (dias)']]) : null : null

          if (nome && existingNames.has(nome.toLowerCase())) {
            duplicates.push({ row: rowNum, name: nome })
            return
          }

          const missingFields: string[] = []
          if (!nome) missingFields.push('Nome/Numero')
          if (isNaN(capacidade) || capacidade <= 0) missingFields.push('Capacidade (L) - deve ser número positivo')

          if (metaIntervalo !== null && (isNaN(metaIntervalo) || metaIntervalo <= 0)) {
            missingFields.push('Meta de Intervalo de Limpeza (dias) - deve ser número positivo')
          }

          if (missingFields.length > 0) {
            invalidRows.push({ row: rowNum, name: nome || '(sem nome)', missingFields })
            return
          }

          bebedourosToInsert.push({
            fazenda_id: fazendaId,
            nome,
            capacidade,
            meta_intervalo_limpeza: metaIntervalo,
            ativo: true,
          })
        } catch {
          invalidRows.push({ row: rowNum, name: '(erro ao processar)', missingFields: ['Erro ao processar dados'] })
        }
      })

      if (bebedourosToInsert.length === 0) {
        setImportError('Nenhum dado válido para importar')
        setImporting(false)
        return
      }

      const { error: insertError } = await supabase.from('bebedouros').insert(bebedourosToInsert)

      if (insertError) {
        setImportError(`Erro ao inserir dados: ${insertError.message}`)
        setImporting(false)
        return
      }

      let successMessage = ''
      const totalSkipped = duplicates.length + invalidRows.length

      if (totalSkipped > 0) {
        successMessage = `${bebedourosToInsert.length} de ${totalRowsProcessed} bebedouros importados com sucesso!`
      } else {
        successMessage = `${bebedourosToInsert.length} bebedouros importados com sucesso!`
      }

      if (duplicates.length > 0) {
        successMessage += `\n\n${duplicates.length} linhas puladas porque já existem:\n${duplicates.map(d => `- Linha ${d.row}: "${d.name}"`).join('\n')}`
      }

      if (invalidRows.length > 0) {
        successMessage += `\n\n${invalidRows.length} linhas com erros de validação:\n${invalidRows.map(i => `- Linha ${i.row}: "${i.name}" - Campos inválidos: ${i.missingFields.join(', ')}`).join('\n')}`
        successMessage += '\n\nVolte à planilha, localize os bebedouros com dados irregulares/faltantes, realize as correções indicadas acima e faça upload do arquivo novamente.'
      }

      setImportSuccess(successMessage)
      loadItems('bebedouros')

      e.target.value = ''
    } catch (error) {
      setImportError(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    window.location.href = "/Modelo Bebedouros - Gesta'Up.xlsx"
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  const filteredItems = useMemo(() => {
    const search = state.searchTerm.toLowerCase().trim()
    return state.items.filter((item) => {
      if (activeTab === 'funcionarios' && mostrarApenasComAcesso && !item.acessa_app) return false
      if (!search) return true
      return (
        item.nome.toLowerCase().includes(search) ||
        currentTab.fields.some((f) => {
          const val = item[f.name]
          return val && String(val).toLowerCase().includes(search)
        })
      )
    })
  }, [state.items, state.searchTerm, activeTab, mostrarApenasComAcesso, currentTab.fields])

  const totalPaginas = Math.max(1, Math.ceil(filteredItems.length / ITENS_POR_PAGINA))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const itensPaginados = filteredItems.slice((paginaSegura - 1) * ITENS_POR_PAGINA, paginaSegura * ITENS_POR_PAGINA)

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Cadastros Auxiliares</h2>
      </div>

      {/* Compact Category + Tab Bar */}
      {(() => {
        const groups = tabs.reduce<Record<string, TabConfig[]>>((acc, tab) => {
          acc[tab.category] = acc[tab.category] || []
          acc[tab.category].push(tab)
          return acc
        }, {})
        const categoryOrder = ['Genética', 'Infraestrutura', 'Máquinas & Equipamentos', 'Saúde & Reprodução', 'Operacional']
        const activeCategory = tabs.find((t) => t.key === activeTab)?.category || categoryOrder[0]
        return (
          <div className="border-b border-gray-200 pb-1 space-y-2">
            {/* Category pills */}
            <div className="flex flex-wrap gap-1">
              {categoryOrder.map((cat) => {
                if (!groups[cat]) return null
                const isActive = cat === activeCategory
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      const firstTab = groups[cat][0]
                      if (firstTab) setActiveTab(firstTab.key)
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-full transition-colors min-h-[32px] ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
            {/* Tabs in active category */}
            <div className="flex flex-wrap gap-1">
              {groups[activeCategory]?.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2 text-sm font-medium rounded-lg transition-colors min-h-[40px] ${
                    activeTab === tab.key
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Active Tab Content */}
      <div className="space-y-4 max-w-full">
        {activeTab === 'funcionarios' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Controle de acesso por funcionário</p>
                <p className="text-xs text-gray-500">
                  {controleAcessoHabilitado
                    ? 'Ativado: app exige login do funcionário e mostra apenas cadernetas permitidas.'
                    : 'Desativado: app funciona sem login (qualquer pessoa vê todas as cadernetas).'}
                </p>
              </div>
              <button
                type="button"
                disabled={controleAcessoLoading}
                onClick={handleToggleControleAcesso}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  controleAcessoHabilitado ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    controleAcessoHabilitado ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'funcionarios' && controleAcessoHabilitado && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              type="button"
              onClick={() => setExpedienteExpandido(!expedienteExpandido)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-800">Horário de expediente</p>
                  <p className="text-xs text-gray-500">
                    {expedienteHabilitado
                      ? 'Ativado: fora do expediente o app bloqueia acesso.'
                      : 'Desativado: o app funciona 24h.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  role="switch"
                  aria-checked={expedienteHabilitado}
                  onClick={(e) => { e.stopPropagation(); if (!expedienteLoading) handleToggleExpediente() }}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${expedienteLoading ? 'opacity-50' : ''} ${expedienteHabilitado ? 'bg-primary' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${expedienteHabilitado ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${expedienteExpandido ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expedienteExpandido && expedienteHabilitado && (
              <div className="space-y-4 border-t border-gray-100 p-4 pt-4">
                <p className="text-xs text-gray-500 italic">
                  Resumo: {resumoExpediente(expedienteDias)}
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuso horário</label>
                  <select
                    value={expedienteTimezone}
                    onChange={(e) => setExpedienteTimezone(e.target.value)}
                    className="w-full sm:max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-accent min-h-[44px]"
                  >
                    {TIMEZONES_BR.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Dias da semana</p>
                  {DIAS_SEMANA.map((nome, dia) => (
                    <div key={dia} className="flex items-center gap-3 py-1">
                      <label className="flex items-center gap-2 w-28 shrink-0">
                        <input
                          type="checkbox"
                          checked={expedienteDias[dia]?.ativo ?? false}
                          onChange={(e) => handleExpedienteDiaChange(dia, 'ativo', e.target.checked)}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">{nome}</span>
                      </label>
                      {(expedienteDias[dia]?.ativo) && (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time"
                            value={expedienteDias[dia]?.inicio || '06:00'}
                            onChange={(e) => handleExpedienteDiaChange(dia, 'inicio', e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:border-accent"
                          />
                          <span className="text-xs text-gray-400">até</span>
                          <input
                            type="time"
                            value={expedienteDias[dia]?.fim || '18:00'}
                            onChange={(e) => handleExpedienteDiaChange(dia, 'fim', e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:border-accent"
                          />
                        </div>
                      )}
                      {!(expedienteDias[dia]?.ativo) && (
                        <span className="text-xs text-gray-400">Sem expediente</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={expedienteLoading}
                    onClick={handleSalvarExpediente}
                    className="min-h-[40px]"
                  >
                    {expedienteLoading ? 'Salvando...' : 'Salvar expediente'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search + Add (oculto nas abas com UI própria: equipes e setores) */}
        {activeTab !== 'equipes' && activeTab !== 'setores' && (
        <div className="sticky top-0 z-10 bg-gray-50 py-2 -mx-1 px-1 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <Input
              type="text"
              placeholder={currentTab.searchPlaceholder}
              value={state.searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-xs border-gray-200 focus:border-accent h-10"
            />
            {activeTab === 'funcionarios' && (
              <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={mostrarApenasComAcesso}
                  onChange={(e) => setMostrarApenasComAcesso(e.target.checked)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                Com acesso ao app
              </label>
            )}
            {activeTab === 'funcionarios' && filteredItems.length > 0 && (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {filteredItems.length} {filteredItems.length === 1 ? 'funcionário' : 'funcionários'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {activeTab === 'bebedouros' && (
              <>
                <Button onClick={downloadTemplate} variant="secondary" className="h-10 min-h-[44px] flex-1 sm:flex-none text-sm">
                  Baixar Modelo
                </Button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  disabled={importing}
                  className="hidden"
                  id="import-excel"
                />
                <Button
                  onClick={() => document.getElementById('import-excel')?.click()}
                  variant="secondary"
                  className="h-10 min-h-[44px] flex-1 sm:flex-none text-sm"
                  disabled={importing}
                >
                  {importing ? 'Importando...' : 'Importar Excel'}
                </Button>
              </>
            )}
            <Button onClick={() => setShowForm(true)} className="h-10 min-h-[44px] flex-1 sm:flex-none">
              {novoArtigo(currentTab)} {currentTab.singular || currentTab.label}
            </Button>
          </div>
        </div>
        )}

        {/* Import Messages */}
        {importError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <p className="font-medium">Erro na importação:</p>
            <pre className="text-sm mt-1 whitespace-pre-wrap">{importError}</pre>
          </div>
        )}

        {importSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            <p className="font-medium whitespace-pre-line">{importSuccess}</p>
          </div>
        )}

        {/* UI customizada da aba Setores (com gestão de membros) */}
        {activeTab === 'setores' && (
          <div className="space-y-4">
            {/* Header com busca + botão Novo Setor */}
            {!setorEmEdicao && (
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <Input
                  type="text"
                  placeholder="Buscar setor..."
                  value={state.searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:max-w-xs border-gray-200 focus:border-accent h-10"
                />
                <Button
                  onClick={() => setSetorEmEdicao({ id: null, nome: '', funcionario_ids: [] })}
                  className="h-10 min-h-[44px] flex-1 sm:flex-none"
                >
                  Novo Setor
                </Button>
              </div>
            )}

            {/* Formulário inline de criar/editar setor */}
            {setorEmEdicao && (
              <Card className="bg-white p-4 border-0 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  {setorEmEdicao.id ? 'Editar Setor' : 'Novo Setor'}
                </h3>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={setorEmEdicao.nome}
                      onChange={(e) => setSetorEmEdicao({ ...setorEmEdicao, nome: e.target.value })}
                      placeholder="Nome do setor"
                      autoFocus
                      className="border-gray-200 focus:border-accent"
                    />
                    <Button onClick={handleSalvarSetor} disabled={salvandoSetor || !setorEmEdicao.nome.trim()} className="flex-shrink-0">
                      {salvandoSetor ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button variant="secondary" onClick={() => setSetorEmEdicao(null)} className="flex-shrink-0">
                      Cancelar
                    </Button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Membros do setor
                    </label>
                    <MultiSelect
                      options={funcionariosComSetor
                        .filter((f) => f.ativo)
                        .map((f) => ({ id: f.id, name: f.nome, category: f.cargo || (f.setor_nomes.length > 0 ? f.setor_nomes.join(', ') : undefined) }))}
                      value={setorEmEdicao.funcionario_ids}
                      onChange={(ids) => setSetorEmEdicao({ ...setorEmEdicao, funcionario_ids: ids })}
                      placeholder="Selecione os funcionários deste setor"
                    />
                    {setorEmEdicao.funcionario_ids.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {setorEmEdicao.funcionario_ids.length} funcionário(s) selecionado(s)
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Lista de setores com seus funcionários */}
            {setores.length === 0 && !setorEmEdicao ? (
              <Card className="bg-white p-8 border-0 shadow-sm text-center">
                <p className="text-gray-600 mb-4">Nenhum setor cadastrado</p>
                <Button onClick={() => setSetorEmEdicao({ id: null, nome: '', funcionario_ids: [] })}>
                  Criar Primeiro Setor
                </Button>
              </Card>
            ) : (
              <>
                {setoresOrdenados.map((setor) => {
                  const membros = funcionariosComSetor.filter((f) => f.setor_ids.includes(setor.id) && f.ativo)
                  return (
                    <Card key={setor.id} className="bg-white p-4 border-0 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" />
                          </svg>
                          <h3 className="font-semibold text-gray-800">{setor.nome}</h3>
                          <span className="text-xs text-gray-500">({membros.length} {membros.length === 1 ? 'membro' : 'membros'})</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSetorEmEdicao({
                              id: setor.id,
                              nome: setor.nome,
                              funcionario_ids: funcionariosComSetor
                                .filter((f) => f.setor_ids.includes(setor.id) && f.ativo)
                                .map((f) => f.id),
                            })}
                            className="text-xs text-primary hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleExcluirSetor(setor.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>

                      {membros.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {membros.map((m) => (
                            <span key={m.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                              {m.nome}
                              {m.cargo && <span className="text-gray-400">· {m.cargo}</span>}
                              <button
                                onClick={() => handleRemoverDoSetor(m.id, setor.id)}
                                disabled={atribuindoFunc === m.id}
                                className="text-gray-400 hover:text-red-500 ml-0.5"
                                title="Remover do setor"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Nenhum membro neste setor</p>
                      )}
                    </Card>
                  )
                })}

                {/* Funcionários sem setor */}
                {(() => {
                  const semSetor = funcionariosComSetor.filter((f) => f.setor_ids.length === 0 && f.ativo)
                  if (semSetor.length === 0) return null
                  return (
                    <Card className="bg-white p-4 border-0 shadow-sm">
                      <h3 className="font-semibold text-gray-800 mb-1">Funcionários sem setor</h3>
                      <p className="text-xs text-gray-500 mb-3">Atribua cada funcionário a um setor</p>
                      <div className="space-y-2">
                        {semSetor.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-gray-800">{f.nome}</span>
                              {f.cargo && <span className="text-xs text-gray-400 ml-2">{f.cargo}</span>}
                            </div>
                            <select
                              value=""
                              onChange={(e) => e.target.value && handleAtribuirSetor(f.id, e.target.value)}
                              disabled={atribuindoFunc === f.id}
                              className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-accent bg-white min-h-[36px]"
                            >
                              <option value="">Atribuir...</option>
                              {setores.map((s) => (
                                <option key={s.id} value={s.id}>{s.nome}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                })()}
              </>
            )}
          </div>
        )}

        {/* Form (não mostra para a aba setores, que tem UI própria) */}
        {state.showForm && activeTab !== 'setores' && (
          <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">
              {state.editingItem ? `Editar ${currentTab.singular || currentTab.label}` : `${novoArtigo(currentTab)} ${currentTab.singular || currentTab.label}`}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {currentTab.fields.filter((field) => !field.showIf || field.showIf(state.formData)).map((field) => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {field.name === 'setor_id' ? (
                      <select
                        value={state.formData[field.name] || ''}
                        onChange={(e) => setFormField(field.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white"
                      >
                        <option value="">{field.placeholder || 'Selecione'}</option>
                        {setores.map((setor) => (
                          <option key={setor.id} value={setor.id}>{setor.nome}</option>
                        ))}
                      </select>
                    ) : field.options ? (
                      <select
                        value={state.formData[field.name] || ''}
                        onChange={(e) => setFormField(field.name, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white"
                      >
                        <option value="">Selecione</option>
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : field.name === 'capacidade_kg' ? (
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={state.formData[field.name] || ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '')
                          setFormField(field.name, digits ? formatIntWithThousands(digits) : '')
                        }}
                        required={field.required}
                        placeholder={field.placeholder}
                        autoComplete="off"
                        className="border-gray-200 focus:border-accent min-h-[44px]"
                      />
                    ) : (
                      <Input
                        type="text"
                        value={state.formData[field.name] || ''}
                        onChange={(e) => setFormField(field.name, e.target.value)}
                        required={field.required}
                        placeholder={field.placeholder}
                        autoComplete="off"
                        className="border-gray-200 focus:border-accent min-h-[44px]"
                      />
                    )}
                  </div>
                ))}

                {activeTab === 'funcionarios' && (
                  <div className="md:col-span-2 space-y-4 border-t border-gray-100 pt-4 mt-2">
                    <div className="flex items-center gap-3 py-2">
                      <button
                        type="button"
                        onClick={() => setFuncionarioRbac({ ...funcionarioRbac, acessa_app: !funcionarioRbac.acessa_app })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          funcionarioRbac.acessa_app ? 'bg-primary' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            funcionarioRbac.acessa_app ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <label className="text-sm font-medium text-gray-700">
                        Acessa o app das cadernetas
                      </label>
                    </div>

                    {funcionarioRbac.acessa_app && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                            PIN {state.editingItem?.pin_hash ? '(deixe em branco para manter)' : '*'}
                          </label>
                          <Input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            value={funcionarioRbac.pin}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '')
                              setFuncionarioRbac({ ...funcionarioRbac, pin: value })
                              if (funcionarioErrors.pin) setFuncionarioErrors((p) => ({ ...p, pin: '' }))
                            }}
                            placeholder="4 dígitos"
                            autoComplete="new-password"
                            className={`focus:border-accent min-h-[44px] ${funcionarioErrors.pin ? 'border-red-400' : 'border-gray-200'}`}
                          />
                          {funcionarioErrors.pin && <p className="text-xs text-red-600 mt-1">{funcionarioErrors.pin}</p>}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Cadernetas permitidas *
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setFuncionarioRbac({
                                  ...funcionarioRbac,
                                  cadernetas_permitidas:
                                    funcionarioRbac.cadernetas_permitidas.length === CADERNETAS.length
                                      ? []
                                      : CADERNETAS.map((c) => c.id),
                                })
                              }
                              className="text-xs text-primary hover:underline"
                            >
                              {funcionarioRbac.cadernetas_permitidas.length === CADERNETAS.length
                                ? 'Limpar seleção'
                                : 'Selecionar todas'}
                            </button>
                          </div>
                          {funcionarioErrors.cadernetas && (
                            <p className="text-xs text-red-600 mb-2">{funcionarioErrors.cadernetas}</p>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {CADERNETAS.map((caderneta) => (
                              <label
                                key={caderneta.id}
                                className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={funcionarioRbac.cadernetas_permitidas.includes(caderneta.id)}
                                  onChange={(e) => {
                                    if (funcionarioErrors.cadernetas) setFuncionarioErrors((p) => ({ ...p, cadernetas: '' }))
                                    const selected = funcionarioRbac.cadernetas_permitidas
                                    if (e.target.checked) {
                                      setFuncionarioRbac({
                                        ...funcionarioRbac,
                                        cadernetas_permitidas: [...selected, caderneta.id],
                                      })
                                    } else {
                                      setFuncionarioRbac({
                                        ...funcionarioRbac,
                                        cadernetas_permitidas: selected.filter((id) => id !== caderneta.id),
                                      })
                                    }
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <span className="text-xs text-gray-700">{caderneta.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {expedienteHabilitado && (
                          <div className="space-y-3 border-t border-gray-100 pt-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setFuncionarioRbac({
                                    ...funcionarioRbac,
                                    expediente_override: funcionarioRbac.expediente_override ? null : defaultExpediente(),
                                  })
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  funcionarioRbac.expediente_override ? 'bg-primary' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    funcionarioRbac.expediente_override ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                              <label className="text-sm font-medium text-gray-700">
                                Horário personalizado
                              </label>
                              <span className="text-xs text-gray-400">
                                {funcionarioRbac.expediente_override ? 'Usa horário próprio' : 'Usa horário da fazenda'}
                              </span>
                            </div>

                            {funcionarioRbac.expediente_override && (() => {
                              const override = funcionarioRbac.expediente_override
                              return (
                              <div className="space-y-2 pl-2">
                                <p className="text-xs text-gray-500 italic">
                                  Resumo: {resumoExpediente(override)}
                                </p>
                                {DIAS_SEMANA.map((nome, dia) => (
                                  <div key={dia} className="flex items-center gap-3 py-0.5">
                                    <label className="flex items-center gap-2 w-28 shrink-0">
                                      <input
                                        type="checkbox"
                                        checked={override[dia]?.ativo ?? false}
                                        onChange={(e) =>
                                          setFuncionarioRbac({
                                            ...funcionarioRbac,
                                            expediente_override: {
                                              ...override,
                                              [dia]: { ...override[dia], ativo: e.target.checked },
                                            },
                                          })
                                        }
                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                      />
                                      <span className="text-xs text-gray-700">{nome}</span>
                                    </label>
                                    {(override[dia]?.ativo) && (
                                      <div className="flex items-center gap-2 flex-1">
                                        <input
                                          type="time"
                                          value={override[dia]?.inicio || '06:00'}
                                          onChange={(e) =>
                                            setFuncionarioRbac({
                                              ...funcionarioRbac,
                                              expediente_override: {
                                                ...override,
                                                [dia]: { ...override[dia], inicio: e.target.value },
                                              },
                                            })
                                          }
                                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:border-accent"
                                        />
                                        <span className="text-xs text-gray-400">até</span>
                                        <input
                                          type="time"
                                          value={override[dia]?.fim || '18:00'}
                                          onChange={(e) =>
                                            setFuncionarioRbac({
                                              ...funcionarioRbac,
                                              expediente_override: {
                                                ...override,
                                                [dia]: { ...override[dia], fim: e.target.value },
                                              },
                                            })
                                          }
                                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:border-accent"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Button type="submit" disabled={state.submitting} className="w-full sm:w-auto min-h-[44px]">
                  {state.submitting ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button variant="secondary" onClick={handleCancel} className="w-full sm:w-auto min-h-[44px]">
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Items Grid (oculto na aba equipes) */}
        {activeTab !== 'equipes' && state.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : activeTab !== 'equipes' && activeTab !== 'setores' && !state.showForm && filteredItems.length === 0 ? (
          <Card className="bg-white p-8 sm:p-12 border-0 shadow-sm text-center">
            <p className="text-gray-600 mb-4 text-sm sm:text-base">{currentTab.gender === 'f' ? 'Nenhuma' : 'Nenhum'} {(currentTab.singular || currentTab.label).toLowerCase()} cadastrado</p>
            <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
              Criar Primeir{currentTab.gender === 'f' ? 'a' : 'o'} {currentTab.singular || currentTab.label}
            </Button>
          </Card>
        ) : activeTab !== 'equipes' && activeTab !== 'setores' && !state.showForm ? (          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {itensPaginados.map((item) => (
              <CardItem
                key={item.id}
                title={item.nome || item.nome_comercial || 'Sem nome'}
                subtitle={
                  <div className="flex flex-col gap-0.5">
                    {currentTab.fields
                      .filter((f) => !['nome', 'nome_comercial'].includes(f.name) && item[f.name])
                      .map((f) => (
                        <span key={f.name}>
                          {f.label}: {f.name === 'setor_id'
                            ? setores.find(s => s.id === item[f.name])?.nome || item[f.name]
                            : f.name === 'capacidade_kg'
                              ? formatIntWithThousands(String(item[f.name]))
                              : item[f.name]
                          }
                        </span>
                      ))}
                  </div>
                }
                status={item.ativo}
                onClick={() => handleEdit(item)}
              >
                {activeTab === 'funcionarios' && item.acessa_app && (
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Acessa o app
                      </span>
                      {item.expediente_override && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800" title="Horário personalizado">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Horário próprio
                        </span>
                      )}
                    </div>
                    {Array.isArray(item.cadernetas_permitidas) && item.cadernetas_permitidas.length > 0 && (() => {
                      const total = item.cadernetas_permitidas.length
                      const conhecidas = CADERNETAS.length
                      const todas = total >= conhecidas || total >= conhecidas * 0.9
                      if (todas) {
                        return (
                          <p className="text-xs text-gray-500 font-medium">
                            Cadernetas: todas ({total})
                          </p>
                        )
                      }
                      const muitas = total > 8
                      return (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500 font-medium">
                              Cadernetas ({total}):
                            </p>
                            {muitas && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCadernetasExpandidas(prev => ({ ...prev, [item.id]: !prev[item.id] })) }}
                                className="text-xs text-primary hover:underline"
                              >
                                {cadernetasExpandidas[item.id] ? 'ocultar' : 'ver lista'}
                              </button>
                            )}
                          </div>
                          {(!muitas || cadernetasExpandidas[item.id]) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.cadernetas_permitidas.map((id: string) => {
                                const label = CADERNETAS.find((c) => c.id === id)?.label || id
                                return (
                                  <span key={id} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                                    {label}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
                {activeTab === 'funcionarios' && !item.acessa_app && (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Sem acesso ao app
                    </span>
                    {item.cargo && (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-medium">Cargo:</span> {item.cargo}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-auto pt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 min-w-[70px] text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(item)
                    }}
                  >
                    Editar
                  </Button>
                  {activeTab !== 'vagoes' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 min-w-[70px] text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 text-gray-700 hover:bg-gray-300"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleActive(item)
                      }}
                    >
                      {isItemActive(item, currentTab) ? 'Desativar' : 'Ativar'}
                    </Button>
                  )}
                  {activeTab !== 'vagoes' && !isItemActive(item, currentTab) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 min-w-[70px] text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 bg-red-600 text-white hover:bg-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteClick(item.id)
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </CardItem>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">
                {activeTab === 'funcionarios'
                  ? `Mostrando ${(paginaSegura - 1) * ITENS_POR_PAGINA + 1}-${Math.min(paginaSegura * ITENS_POR_PAGINA, filteredItems.length)} de ${filteredItems.length}`
                  : `Mostrando ${(paginaSegura - 1) * ITENS_POR_PAGINA + 1}-${Math.min(paginaSegura * ITENS_POR_PAGINA, filteredItems.length)} de ${filteredItems.length}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaSegura === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-xs text-gray-500">
                  Página {paginaSegura} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaSegura === totalPaginas}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
          </>
        ) : null}
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title={activeTab === 'vagoes' ? 'Excluir Registro' : 'Excluir Registro'}
        message={activeTab === 'vagoes'
          ? 'O registro será excluído permanentemente. Esta ação não pode ser desfeita.'
          : 'O registro será excluído permanentemente e não aparecerá mais na lista. O histórico é preservado. Esta ação não pode ser desfeita.'}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      <Modal
        isOpen={showRbacAlertModal}
        onClose={() => setShowRbacAlertModal(false)}
        title="Controle de acesso"
        size="sm"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-2xl text-blue-600">ℹ️</span>
          </div>
          <div className="flex-1">
            <p className="text-gray-700">
              Cadastre pelo menos um funcionário com acesso ao app antes de ativar o controle de acesso.
            </p>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <Button onClick={() => setShowRbacAlertModal(false)} className="min-h-[44px]">
            Entendido
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!setorParaExcluir}
        onClose={() => setSetorParaExcluir(null)}
        onConfirm={confirmarExclusaoSetor}
        title="Excluir setor?"
        message="Os funcionários ficarão sem setor."
        confirmText="Excluir"
        variant="danger"
      />
    </div>
  )
}
