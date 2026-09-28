import { useEffect, useState } from 'react'
import { getGruposWithFazendas, createGrupo, updateGrupo, deleteGrupo, setFazendasDoGrupo, GrupoWithFazendas } from '../../services/gruposService'
import { getFazendas, Fazenda } from '../../services/fazendasService'
import { Button, Card, Input, Modal, ConfirmModal, MultiSelect } from '../../components/ui'

export function GruposList() {
  const [grupos, setGrupos] = useState<GrupoWithFazendas[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGrupoName, setNewGrupoName] = useState('')
  const [newGrupoFazendas, setNewGrupoFazendas] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const [editingGrupo, setEditingGrupo] = useState<GrupoWithFazendas | null>(null)
  const [editName, setEditName] = useState('')
  const [editFazendas, setEditFazendas] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [deletingGrupo, setDeletingGrupo] = useState<GrupoWithFazendas | null>(null)

  const [fazendas, setFazendas] = useState<Fazenda[]>([])

  useEffect(() => {
    loadGrupos()
    getFazendas().then(setFazendas)
  }, [])

  const loadGrupos = async () => {
    setLoading(true)
    const data = await getGruposWithFazendas()
    setGrupos(data)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newGrupoName.trim()) return
    setCreating(true)
    const result = await createGrupo(newGrupoName.trim())
    if (result) {
      await setFazendasDoGrupo(result.id, newGrupoFazendas)
      setShowCreateModal(false)
      setNewGrupoName('')
      setNewGrupoFazendas([])
      loadGrupos()
    }
    setCreating(false)
  }

  const handleSaveEdit = async () => {
    if (!editingGrupo || !editName.trim()) return
    setSaving(true)
    const result = await updateGrupo(editingGrupo.id, { nome: editName.trim() })
    if (result) {
      await setFazendasDoGrupo(editingGrupo.id, editFazendas)
      setEditingGrupo(null)
      setEditName('')
      setEditFazendas([])
      loadGrupos()
    }
    setSaving(false)
  }

  const handleToggleAtivo = async (grupo: GrupoWithFazendas) => {
    await updateGrupo(grupo.id, { ativo: !grupo.ativo })
    loadGrupos()
  }

  const handleDelete = async () => {
    if (!deletingGrupo) return
    await deleteGrupo(deletingGrupo.id)
    setDeletingGrupo(null)
    loadGrupos()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Grupos de Fazendas</h2>
        <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto text-sm">
          Novo Grupo
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-600">Carregando...</p>
      ) : grupos.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center">
          <p className="text-gray-600 mb-4">Nenhum grupo cadastrado</p>
          <Button onClick={() => setShowCreateModal(true)} className="text-sm">
            Criar Primeiro Grupo
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {grupos.map((grupo) => (
            <Card key={grupo.id} className="bg-white p-4 sm:p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 mb-1 text-sm sm:text-base truncate">{grupo.nome}</h3>
                  <p className="text-xs text-gray-500">{grupo.fazendas.length} fazenda(s)</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    grupo.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {grupo.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              {grupo.fazendas.length > 0 && (
                <div className="mb-3 space-y-1">
                  {grupo.fazendas.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className={`w-2 h-2 rounded-full ${f.ativo ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="truncate">{f.nome}</span>
                      <span className="text-gray-400">({f.acesso_id})</span>
                    </div>
                  ))}
                </div>
              )}

              {grupo.fazendas.length === 0 && (
                <p className="text-xs text-gray-400 mb-3 italic">Nenhuma fazenda vinculada</p>
              )}

              <div className="pt-3 border-t border-gray-200 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingGrupo(grupo)
                    setEditName(grupo.nome)
                    setEditFazendas(grupo.fazendas.map(f => f.id))
                  }}
                  className="flex-1 text-xs sm:text-sm"
                >
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleToggleAtivo(grupo)}
                  className="flex-1 text-xs sm:text-sm"
                >
                  {grupo.ativo ? 'Desativar' : 'Ativar'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDeletingGrupo(grupo)}
                  className="text-xs sm:text-sm text-red-600 hover:text-red-700"
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Novo Grupo" size="md" contentClassName="min-h-[450px]">
        <div className="space-y-4">
          <Input
            label="Nome do Grupo *"
            value={newGrupoName}
            onChange={(e) => setNewGrupoName(e.target.value)}
            placeholder="Ex: Grupo Alegria"
            autoFocus
          />
          <MultiSelect
            label="Fazendas do Grupo"
            options={fazendas.map(f => ({ id: f.id, name: f.nome, subtitle: f.acesso_id }))}
            value={newGrupoFazendas}
            onChange={setNewGrupoFazendas}
            placeholder="Selecione as fazendas..."
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !newGrupoName.trim()}>
              {creating ? 'Criando...' : 'Criar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editingGrupo} onClose={() => setEditingGrupo(null)} title="Editar Grupo" size="md" contentClassName="min-h-[450px]">
        <div className="space-y-4">
          <Input
            label="Nome do Grupo *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoFocus
          />
          <MultiSelect
            label="Fazendas do Grupo"
            options={fazendas.map(f => ({ id: f.id, name: f.nome, subtitle: f.acesso_id }))}
            value={editFazendas}
            onChange={setEditFazendas}
            placeholder="Selecione as fazendas..."
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setEditingGrupo(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deletingGrupo}
        onClose={() => setDeletingGrupo(null)}
        onConfirm={handleDelete}
        title="Excluir Grupo"
        message={`Tem certeza que deseja excluir o grupo "${deletingGrupo?.nome}"? As fazendas vinculadas ficarão sem grupo.`}
        confirmText="Excluir"
        variant="danger"
      />
    </div>
  )
}
