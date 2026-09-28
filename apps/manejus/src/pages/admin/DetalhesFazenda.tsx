import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFazendas, Fazenda } from '../../services/fazendasService'
import { supabase } from '../../services/supabaseClient'
import { Button, Card } from '../../components/ui'

interface CadastroStats {
  pastos: number
  lotes: number
  bebedouros: number
  currais: number
  funcionarios: number
  insumos: number
  formulacoes: number
  usuarios: number
}

interface RebanhoStats {
  totalCabecas: number
  totalPesoKg: number
  pesoMedioKg: number
}

interface AtividadeRecente {
  ultimoRegSuplementacao: string | null
  ultimaMovimentacao: string | null
  totalRegsSuplementacao: number
  totalRegsMovimentacao: number
}

interface UsuarioFazendaInfo {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  ultimo_acesso: string | null
}

function formatarData(iso: string | null): string {
  if (!iso) return 'Sem registro'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function DetalhesFazenda() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [fazenda, setFazenda] = useState<Fazenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<CadastroStats>({
    pastos: 0,
    lotes: 0,
    bebedouros: 0,
    currais: 0,
    funcionarios: 0,
    insumos: 0,
    formulacoes: 0,
    usuarios: 0,
  })
  const [rebanho, setRebanho] = useState<RebanhoStats>({
    totalCabecas: 0,
    totalPesoKg: 0,
    pesoMedioKg: 0,
  })
  const [atividade, setAtividade] = useState<AtividadeRecente>({
    ultimoRegSuplementacao: null,
    ultimaMovimentacao: null,
    totalRegsSuplementacao: 0,
    totalRegsMovimentacao: 0,
  })
  const [usuarios, setUsuarios] = useState<UsuarioFazendaInfo[]>([])

  useEffect(() => {
    loadFazenda()
    if (id) {
      loadStats(id)
      loadRebanho(id)
      loadAtividade(id)
      loadUsuarios(id)
    }
  }, [id])

  const loadFazenda = async () => {
    if (!id) return
    const fazendas = await getFazendas()
    const found = fazendas.find(f => f.id === id)
    setFazenda(found || null)
    setLoading(false)
  }

  const loadStats = async (fazendaId: string) => {
    const [
      { count: pastosCount },
      { count: lotesCount },
      { count: bebedourosCount },
      { count: curraisCount },
      { count: funcionariosCount },
      { count: insumosCount },
      { count: formulacoesCount },
      { count: usuariosCount },
    ] = await Promise.all([
      supabase.from('pastos').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId).is('deleted_at', null),
      supabase.from('lotes').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId).is('deleted_at', null),
      supabase.from('bebedouros').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId).eq('ativo', true),
      supabase.from('currais').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId).is('deleted_at', null),
      supabase.from('funcionarios').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId),
      supabase.from('insumos').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId),
      supabase.from('formulacoes').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId).eq('ativo', true),
      supabase.from('usuario_fazenda').select('*', { count: 'exact', head: true }).eq('fazenda_id', fazendaId),
    ])

    setStats({
      pastos: pastosCount || 0,
      lotes: lotesCount || 0,
      bebedouros: bebedourosCount || 0,
      currais: curraisCount || 0,
      funcionarios: funcionariosCount || 0,
      insumos: insumosCount || 0,
      formulacoes: formulacoesCount || 0,
      usuarios: usuariosCount || 0,
    })
  }

  const loadRebanho = async (fazendaId: string) => {
    const { data } = await supabase
      .from('lotes')
      .select('numero_cabecas, peso_vivo_kg')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)

    if (!data) return

    const totalCabecas = data.reduce((sum, l) => sum + (l.numero_cabecas || 0), 0)
    const totalPesoKg = data.reduce((sum, l) => sum + (l.peso_vivo_kg || 0), 0)
    const pesoMedioKg = totalCabecas > 0 ? totalPesoKg / totalCabecas : 0

    setRebanho({
      totalCabecas,
      totalPesoKg: Math.round(totalPesoKg),
      pesoMedioKg: Math.round(pesoMedioKg),
    })
  }

  const loadAtividade = async (fazendaId: string) => {
    const [
      { data: regSupData, count: regSupCount },
      { data: movData, count: movCount },
    ] = await Promise.all([
      supabase
        .from('registros_suplementacao')
        .select('created_at')
        .eq('fazenda_id', fazendaId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('registros_movimentacao')
        .select('data')
        .eq('fazenda_id', fazendaId)
        .order('data', { ascending: false })
        .limit(1),
    ])

    setAtividade({
      ultimoRegSuplementacao: regSupData?.[0]?.created_at || null,
      ultimaMovimentacao: movData?.[0]?.data || null,
      totalRegsSuplementacao: regSupCount || 0,
      totalRegsMovimentacao: movCount || 0,
    })
  }

  const loadUsuarios = async (fazendaId: string) => {
    const { data } = await supabase
      .from('usuario_fazenda')
      .select(`
        usuario_id,
        papel,
        ativo,
        usuarios:usuario_id (id, nome, email, ultimo_acesso)
      `)
      .eq('fazenda_id', fazendaId)

    if (!data) return

    const usuariosInfo: UsuarioFazendaInfo[] = data.map((item: any) => ({
      id: item.usuarios?.id || item.usuario_id,
      nome: item.usuarios?.nome || 'Sem nome',
      email: item.usuarios?.email || 'Sem email',
      papel: item.papel,
      ativo: item.ativo,
      ultimo_acesso: item.usuarios?.ultimo_acesso || null,
    }))

    setUsuarios(usuariosInfo)
  }

  if (loading) {
    return <p className="text-gray-600">Carregando...</p>
  }

  if (!fazenda) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Fazenda não encontrada</p>
        <Button onClick={() => navigate('/admin/fazendas')} className="mt-4">
          Voltar
        </Button>
      </div>
    )
  }

  const cardsCadastros = [
    { label: 'Pastos', value: stats.pastos, color: 'text-primary' },
    { label: 'Lotes', value: stats.lotes, color: 'text-blue-600' },
    { label: 'Bebedouros', value: stats.bebedouros, color: 'text-cyan-600' },
    { label: 'Currais', value: stats.currais, color: 'text-indigo-600' },
    { label: 'Funcionários', value: stats.funcionarios, color: 'text-green-600' },
    { label: 'Insumos', value: stats.insumos, color: 'text-purple-600' },
    { label: 'Formulações', value: stats.formulacoes, color: 'text-orange-600' },
    { label: 'Usuários', value: stats.usuarios, color: 'text-pink-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Button variant="secondary" onClick={() => navigate('/admin/fazendas')} className="mb-4">
            Voltar
          </Button>
          <h2 className="text-3xl font-bold text-gray-800">{fazenda.nome}</h2>
          <p className="text-gray-600">{fazenda.cnpj || 'Sem CNPJ'}</p>
        </div>
        <Button onClick={() => navigate(`/admin/fazendas/${fazenda.id}`)}>
          Editar Fazenda
        </Button>
      </div>

      {/* Informações da Fazenda */}
      <Card className="bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Informações</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Acesso ID</p>
            <p className="font-medium">{fazenda.acesso_id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="font-medium">{fazenda.email || 'Não informado'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Telefone</p>
            <p className="font-medium">{fazenda.telefone || 'Não informado'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Endereço</p>
            <p className="font-medium">{fazenda.endereco || 'Não informado'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-3 py-1 rounded-full text-sm ${
              fazenda.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {fazenda.ativo ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Confinamento</p>
            <span className={`px-3 py-1 rounded-full text-sm ${
              fazenda.acesso_confinamento ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {fazenda.acesso_confinamento ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
      </Card>

      {/* Rebanho */}
      <Card className="bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Rebanho</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Total de cabeças</p>
            <p className="text-3xl font-bold text-primary">{formatarNumero(rebanho.totalCabecas)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Peso vivo total (kg)</p>
            <p className="text-3xl font-bold text-blue-600">{formatarNumero(rebanho.totalPesoKg)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Peso médio (kg/cab)</p>
            <p className="text-3xl font-bold text-green-600">{formatarNumero(rebanho.pesoMedioKg)}</p>
          </div>
        </div>
      </Card>

      {/* Cadastros */}
      <Card className="bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Cadastros</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cardsCadastros.map((c) => (
            <div key={c.label} className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className={`text-3xl font-bold ${c.color}`}>{formatarNumero(c.value)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Atividade Recente */}
      <Card className="bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Atividade Recente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Último registro de suplementação</p>
            <p className="font-medium">{formatarData(atividade.ultimoRegSuplementacao)}</p>
            <p className="text-xs text-gray-400 mt-1">{formatarNumero(atividade.totalRegsSuplementacao)} registros no total</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">Última movimentação</p>
            <p className="font-medium">{formatarData(atividade.ultimaMovimentacao)}</p>
            <p className="text-xs text-gray-400 mt-1">{formatarNumero(atividade.totalRegsMovimentacao)} movimentações no total</p>
          </div>
        </div>
      </Card>

      {/* Usuários Vinculados */}
      <Card className="bg-white p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Usuários Vinculados</h3>
        {usuarios.length === 0 ? (
          <p className="text-gray-500">Nenhum usuário vinculado a esta fazenda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Papel</th>
                  <th className="py-2 pr-4">Último acesso</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-800">{u.nome}</td>
                    <td className="py-2 pr-4 text-gray-600">{u.email}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        u.papel === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {u.papel}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{formatarData(u.ultimo_acesso)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        u.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
