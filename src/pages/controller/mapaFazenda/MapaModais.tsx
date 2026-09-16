// Modais do mapa: confirmar remoção, remoção em lote, nomear estrada/ponto/fábrica, associar curral, tipo de associação
import { Button, Modal } from '../../../components/ui'
import { TIPOS_PONTO } from '../mapaFazenda/mapaConfig'

// Modal: confirmar remoção de geometria
interface ConfirmarRemocaoProps {
  isOpen: boolean
  onClose: () => void
  confirmarRemocao: { tipo: string; nome: string } | null
  removendo: boolean
  onConfirmar: () => void
}

export function ConfirmarRemocaoModal({ isOpen, onClose, confirmarRemocao, removendo, onConfirmar }: ConfirmarRemocaoProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remover do Mapa" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Tem certeza que deseja remover a geometria de{' '}
          <strong>{confirmarRemocao?.tipo === 'pasto' ? 'pasto' : 'bebedouro'}</strong>{' '}
          <strong>{confirmarRemocao?.nome}</strong> do mapa?
        </p>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
          O cadastro não será excluído, apenas a delimitação geográfica será removida.
          Você poderá redesenhar ou reimportar a geometria depois.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onConfirmar} disabled={removendo} className="bg-red-600 hover:bg-red-700">
            {removendo ? 'Removendo...' : 'Remover Geometria'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: confirmar remoção em lote
interface RemocaoLoteProps {
  isOpen: boolean
  onClose: () => void
  quantidadePastos: number
  removerBebedourosLote: boolean
  setRemoverBebedourosLote: (v: boolean) => void
  removendoLote: boolean
  onConfirmar: () => void
}

export function RemocaoLoteModal({ isOpen, onClose, quantidadePastos, removerBebedourosLote, setRemoverBebedourosLote, removendoLote, onConfirmar }: RemocaoLoteProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remover Geometrias em Lote" size="md">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Tem certeza que deseja remover a geometria de{' '}
          <strong>{quantidadePastos} pasto(s)</strong> do mapa?
        </p>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
          Os cadastros não serão excluídos, apenas as delimitações geográficas serão removidas.
          Você poderá redesenhar ou reimportar as geometrias depois.
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-content">
          <input
            type="checkbox"
            checked={removerBebedourosLote}
            onChange={(e) => setRemoverBebedourosLote(e.target.checked)}
            className="w-4 h-4 rounded border-surface-3 text-primary focus:ring-blue-500"
          />
          Remover também as geometrias dos bebedouros dentro destes pastos
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onConfirmar} disabled={removendoLote} className="bg-red-600 hover:bg-red-700">
            {removendoLote ? 'Removendo...' : `Remover ${quantidadePastos} Pasto(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: nomear estrada
interface NomearEstradaProps {
  isOpen: boolean
  onClose: () => void
  nomeEstrada: string
  setNomeEstrada: (v: string) => void
  salvando: boolean
  onSalvar: () => void
}

export function NomearEstradaModal({ isOpen, onClose, nomeEstrada, setNomeEstrada, salvando, onSalvar }: NomearEstradaProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nomear Estrada" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Digite um nome para esta estrada. Ela será usada para cálculo de rotas dentro da fazenda.
        </p>
        <input
          type="text"
          value={nomeEstrada}
          onChange={(e) => setNomeEstrada(e.target.value)}
          placeholder="Ex: Estrada principal, Acesso ao curral, etc."
          className="w-full px-3 py-2 border border-surface-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && nomeEstrada.trim()) onSalvar() }}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onSalvar} disabled={!nomeEstrada.trim() || salvando}>
            {salvando ? 'Salvando...' : 'Salvar Estrada'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: nomear ponto de interesse
interface NomearPontoProps {
  isOpen: boolean
  onClose: () => void
  tipoPontoSelecionado: string
  setTipoPontoSelecionado: (v: string) => void
  nomePonto: string
  setNomePonto: (v: string) => void
  salvando: boolean
  onSalvar: () => void
}

export function NomearPontoModal({ isOpen, onClose, tipoPontoSelecionado, setTipoPontoSelecionado, nomePonto, setNomePonto, salvando, onSalvar }: NomearPontoProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Marcar Ponto de Interesse" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-content mb-1">Tipo</label>
          <select
            value={tipoPontoSelecionado}
            onChange={(e) => setTipoPontoSelecionado(e.target.value)}
            className="w-full px-3 py-2 border border-surface-3 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {TIPOS_PONTO.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-content mb-1">Nome</label>
          <input
            type="text"
            value={nomePonto}
            onChange={(e) => setNomePonto(e.target.value)}
            placeholder="Ex: Fábrica de ração 1, Curral de manejo, etc."
            className="w-full px-3 py-2 border border-surface-3 rounded-lg focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && nomePonto.trim()) onSalvar() }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onSalvar} disabled={!nomePonto.trim() || salvando}>
            {salvando ? 'Salvando...' : 'Salvar Ponto'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: nomear fábrica
interface NomearFabricaProps {
  isOpen: boolean
  onClose: () => void
  nomeFabrica: string
  setNomeFabrica: (v: string) => void
  salvando: boolean
  onSalvar: () => void
}

export function NomearFabricaModal({ isOpen, onClose, nomeFabrica, setNomeFabrica, salvando, onSalvar }: NomearFabricaProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nomear Fábrica" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Digite um nome para esta fábrica. Ela será o ponto de origem das rotas do vagão de suplemento.
        </p>
        <input
          type="text"
          value={nomeFabrica}
          onChange={(e) => setNomeFabrica(e.target.value)}
          placeholder="Ex: Fábrica de ração 1"
          className="w-full px-3 py-2 border border-surface-3 rounded-lg focus:ring-2 focus:ring-blue-500"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && nomeFabrica.trim()) onSalvar() }}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onSalvar} disabled={!nomeFabrica.trim() || salvando}>
            {salvando ? 'Salvando...' : 'Salvar Fábrica'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: associar curral
interface AssociarCurralProps {
  isOpen: boolean
  onClose: () => void
  curraisSemGeo: { id: string; nome: string }[]
  curralSelecionadoAssoc: string
  setCurralSelecionadoAssoc: (v: string) => void
  salvando: boolean
  onSalvar: () => void
}

export function AssociarCurralModal({ isOpen, onClose, curraisSemGeo, curralSelecionadoAssoc, setCurralSelecionadoAssoc, salvando, onSalvar }: AssociarCurralProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Associar ao Curral" size="sm">
      <div className="space-y-4">
        {curraisSemGeo.length === 0 ? (
          <p className="text-sm text-content-muted">
            Não há currais sem geometria disponíveis. Todos os currais já têm área delimitada ou não há currais cadastrados.
          </p>
        ) : (
          <>
            <p className="text-sm text-content-muted">
              Selecione o curral ao qual esta área pertence.
            </p>
            <select
              value={curralSelecionadoAssoc}
              onChange={(e) => setCurralSelecionadoAssoc(e.target.value)}
              className="w-full px-3 py-2 border border-surface-3 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um curral...</option>
              {curraisSemGeo.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onSalvar} disabled={!curralSelecionadoAssoc || salvando}>
            {salvando ? 'Salvando...' : 'Salvar Curral'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Modal: perguntar tipo de associação (pasto ou fábrica)
interface AssocTipoProps {
  isOpen: boolean
  onClose: () => void
  onSelecionarPasto: () => void
  onSelecionarFabrica: () => void
}

export function AssocTipoModal({ isOpen, onClose, onSelecionarPasto, onSelecionarFabrica }: AssocTipoProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Associar Área Importada" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-content-muted">
          Esta área importada é um pasto ou uma fábrica?
        </p>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onSelecionarPasto} className="flex-1">
            Pasto
          </Button>
          <Button variant="secondary" onClick={onSelecionarFabrica} className="flex-1">
            Fábrica
          </Button>
        </div>
      </div>
    </Modal>
  )
}
