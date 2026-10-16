import { useMemo, useState } from 'react'
import { Button, useToast } from '@gestaup/ui'
import { useCandidatosMorte, useDesvincularAnimalMorte, useVincularAnimalMorte, type MorteParaAnimal } from '../hooks/useAnimalDaMorte'

const campo =
  'w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all'

interface Props {
  morte: MorteParaAnimal & { individuo_id?: string | null }
  onAlterado: () => void
}

/** Informa (ou desfaz) qual animal identificado morreu numa morte já registrada. A contagem do lote não muda: a morte já a descontou. */
export function AnimalDaMorte({ morte, onAlterado }: Props) {
  const toast = useToast()
  const jaTem = !!morte.individuo_id
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const candidatos = useCandidatosMorte(morte, !jaTem)
  const vincular = useVincularAnimalMorte(morte)
  const desvincular = useDesvincularAnimalMorte(morte)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = candidatos.data ?? []
    return termo ? lista.filter((a) => a.identificacao.toLowerCase().includes(termo)) : lista
  }, [candidatos.data, busca])

  const aoVincular = async () => {
    if (!selecionado) return
    try {
      await vincular.mutateAsync(selecionado)
      toast.success('Animal informado e baixado como morto.')
      setSelecionado(null)
      onAlterado()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const aoDesvincular = async () => {
    try {
      await desvincular.mutateAsync()
      toast.success('Ligação desfeita; o animal voltou a Vivo.')
      onAlterado()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (jaTem) {
    return (
      <div className="mt-3 pt-3 border-t border-border-base flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-content-muted">Se o animal foi informado por engano, desfaça para devolvê-lo a Vivo.</p>
        <Button variant="secondary" onClick={aoDesvincular} disabled={desvincular.isPending}>
          Desfazer ligação
        </Button>
      </div>
    )
  }

  if (!morte.categoria) return null

  return (
    <div className="mt-3 pt-3 border-t border-border-base space-y-3">
      <p className="text-sm text-content-muted">
        Esta morte não tem animal identificado. Informe qual foi para baixá-lo como morto; a contagem do lote não muda, porque a morte já a descontou.
      </p>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por brinco, chip ou manejo" className={campo} />
      {candidatos.isLoading ? (
        <p className="text-sm text-content-muted">Carregando animais...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-content-muted">Nenhum animal identificado vivo desta categoria neste lote.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto divide-y divide-border-base rounded-lg border border-surface-3">
          {filtrados.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="radio" name="animal-da-morte" checked={selecionado === a.id} onChange={() => setSelecionado(a.id)} />
                <span className="text-content-strong">{a.identificacao}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={aoVincular} disabled={!selecionado || vincular.isPending}>
        Informar animal
      </Button>
    </div>
  )
}
