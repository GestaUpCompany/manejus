import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, Input, EmptyState, Modal, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { ENTRADA_CANTINA_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface RegistroEntradaCantina {
  id: string
  fazenda_id: string
  data: string
  quem_recebeu?: string | null
  itens?: any[] | null
  itens_detalhe?: any[] | null
  observacao?: string | null
  nome_usuario?: string | null
  created_at: string
}

interface ItemEdicao {
  nome: string
  unidade: string
  quantidade: string
  custo: string
}

interface FormEdicao {
  data: string
  quem: string
  observacao: string
  itens: ItemEdicao[]
}

const numeroBR = (texto: string | undefined | null) => {
  const n = Number(String(texto ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function EntradaCantina() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroEntradaCantina[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')
  const [editando, setEditando] = useState<RegistroEntradaCantina | null>(null)
  const [edit, setEdit] = useState<FormEdicao>({ data: '', quem: '', observacao: '', itens: [] })
  const [salvandoEdit, setSalvandoEdit] = useState(false)
  const [erroEdit, setErroEdit] = useState<string | null>(null)

  useEffect(() => {
    loadRegistros()
  }, [user])

  const loadRegistros = async () => {
    if (!user) return

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return

    getFazendaNome(fazendaId).then(setFazendaNome)

    const { data, error } = await supabase
      .from('registros_alimentacao')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .eq('modo', 'entrada')
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar entradas de cantina:', error)
    } else {
      setRegistros(data as RegistroEntradaCantina[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.quem_recebeu && registro.quem_recebeu.toLowerCase().includes(search)) ||
      (registro.observacao && registro.observacao.toLowerCase().includes(search)) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(search)) ||
      (Array.isArray(registro.itens_detalhe) && registro.itens_detalhe.some((item: any) =>
        JSON.stringify(item).toLowerCase().includes(search)
      ))

    const matchesDataInicio = !dataInicio || registro.data >= dataInicio
    const matchesDataFim = !dataFim || registro.data <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data)
    const dateB = new Date(b.data)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  const abrirEdicao = (registro: RegistroEntradaCantina) => {
    setErroEdit(null)
    setEditando(registro)
    setEdit({
      data: String(registro.data).slice(0, 10),
      quem: registro.quem_recebeu ?? '',
      observacao: registro.observacao ?? '',
      itens: (registro.itens_detalhe ?? []).map((item: any) => ({
        nome: item.nome ?? '',
        unidade: item.unidade_medida ?? '',
        quantidade: String(item.quantidade ?? '').replace('.', ','),
        custo: item.custo_unitario != null ? String(item.custo_unitario).replace('.', ',') : String(item.custoUnitario ?? ''),
      })),
    })
  }

  const setItemEdicao = (idx: number, parcial: Partial<ItemEdicao>) =>
    setEdit((prev) => ({ ...prev, itens: prev.itens.map((it, i) => (i === idx ? { ...it, ...parcial } : it)) }))

  const salvarEdicao = async () => {
    if (!editando) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.data)) return setErroEdit('Informe a data da entrada')
    if (edit.itens.some((i) => numeroBR(i.quantidade) <= 0 || numeroBR(i.custo) <= 0)) {
      return setErroEdit('Quantidade e custo unitário de cada item devem ser maiores que zero')
    }

    const originais = editando.itens_detalhe ?? []
    const itensDetalhe = originais.map((orig: any, idx: number) => {
      const e = edit.itens[idx]
      const q = numeroBR(e.quantidade)
      const c = numeroBR(e.custo)
      return {
        ...orig,
        quantidade: String(q),
        custo_unitario: c,
        valor_total: Math.round(q * c * 100) / 100,
        custoUnitario: e.custo,
      }
    })
    // Mesmo formato do PWA: mapa "nome (unidade)" -> quantidade
    const itens: Record<string, string> = {}
    itensDetalhe.forEach((i: any) => {
      itens[`${i.nome} (${i.unidade_medida})`] = i.quantidade
    })

    // Preserva a hora e o fuso originais; troca só a data
    const dataIso = `${edit.data}${String(editando.data).slice(10)}`

    setSalvandoEdit(true)
    setErroEdit(null)
    const { error } = await supabase
      .from('registros_alimentacao')
      .update({
        data: dataIso,
        quem_recebeu: edit.quem.trim() || null,
        observacao: edit.observacao.trim() || null,
        itens,
        itens_detalhe: itensDetalhe,
      })
      .eq('id', editando.id)
      .eq('fazenda_id', editando.fazenda_id)
    setSalvandoEdit(false)

    if (error) return setErroEdit(error.message)
    setEditando(null)
    await loadRegistros()
  }

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Entrada na Cantina</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(filteredRegistros, ENTRADA_CANTINA_EXPORT_CONFIG, fazendaNome)}
        exportDisabled={filteredRegistros.length === 0}
        onClear={() => {
          setSearchTerm('')
          setDataInicio('')
          setDataFim('')
        }}
      >
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Quem recebeu, itens, observação..."
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Início">
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Fim">
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="text-sm"
          />
        </FilterField>
      </FilterToolbar>

      {registros.length === 0 ? (
        <EmptyState title="Nenhuma entrada de cantina encontrada" />
      ) : filteredRegistros.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Nenhum registro encontrado com os filtros aplicados" />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros.map((registro) => (
              <Card
                key={registro.id}
                className="p-4"
                onClick={() => navigate(`/controller/cadernetas/entrada-cantina/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDateTime(registro.data)}
                    </span>
                  </div>
                  <span
                    className="text-xs sm:text-sm px-2 py-1 rounded-full bg-primary/10 text-primary dark:text-primary-light"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')
                    }}
                  >
                    {dateSortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Usuário:</span>
                    <span className="text-content-strong font-medium">{registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Quem Recebeu:</span>
                    <span className="text-content-strong font-medium">{registro.quem_recebeu || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Itens:</span>
                    <span className="text-content-strong font-medium">
                      {Array.isArray(registro.itens_detalhe) ? `${registro.itens_detalhe.length} item(s)` : '-'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      abrirEdicao(registro)
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </Th>
                  <Th>Usuário</Th>
                  <Th>Quem Recebeu</Th>
                  <Th>Itens</Th>
                  <Th>Observação</Th>
                  <Th>Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/entrada-cantina/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDateTime(registro.data)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{registro.quem_recebeu || '-'}</Td>
                    <Td>{Array.isArray(registro.itens_detalhe) ? `${registro.itens_detalhe.length} item(s)` : '-'}</Td>
                    <Td className="text-content-muted max-w-xs truncate">{registro.observacao || '-'}</Td>
                    <Td>
                      <Button
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirEdicao(registro)
                        }}
                      >
                        Editar
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </>
      )}

      <Modal isOpen={!!editando} onClose={() => setEditando(null)} title="Editar entrada na cantina">
        <div className="space-y-4">
          <Input label="Data" type="date" value={edit.data} onChange={(e) => setEdit({ ...edit, data: e.target.value })} />
          <Input label="Quem recebeu" value={edit.quem} onChange={(e) => setEdit({ ...edit, quem: e.target.value })} />
          <Input label="Observação" value={edit.observacao} onChange={(e) => setEdit({ ...edit, observacao: e.target.value })} />

          {edit.itens.map((item, idx) => (
            <div key={idx} className="space-y-2 rounded-lg border border-border-base p-3">
              <p className="font-semibold text-content-strong">
                {item.nome} <span className="text-sm text-content-muted">({item.unidade})</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Quantidade"
                  value={item.quantidade}
                  onChange={(e) => setItemEdicao(idx, { quantidade: e.target.value.replace(/[^0-9,.]/g, '') })}
                />
                <Input
                  label="Custo unitário (R$)"
                  value={item.custo}
                  onChange={(e) => setItemEdicao(idx, { custo: e.target.value.replace(/[^0-9,.]/g, '') })}
                />
              </div>
              <p className="text-sm text-content">
                Total do item:{' '}
                {(numeroBR(item.quantidade) * numeroBR(item.custo)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          ))}

          {erroEdit && <p className="text-sm text-red-700">{erroEdit}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={salvarEdicao} disabled={salvandoEdit}>
              {salvandoEdit ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)} disabled={salvandoEdit}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
