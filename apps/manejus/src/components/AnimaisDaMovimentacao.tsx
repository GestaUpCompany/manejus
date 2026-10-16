import { useMemo, useState } from 'react'
import { Button, useToast } from '@gestaup/ui'
import {
  movimentacaoAceitaAnimais,
  useAnimaisDaMovimentacao,
  useCandidatosMovimentacao,
  useDesvincularAnimal,
  useVincularAnimais,
  type MovimentacaoParaAnimais,
} from '../hooks/useMovimentacaoAnimais'

const campo =
  'w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all'

/** "Quais animais" de uma movimentação por contagem: a quantidade continua sendo a do agregado; aqui só se diz quais foram. */
export function AnimaisDaMovimentacao({ movimentacao }: { movimentacao: MovimentacaoParaAnimais }) {
  const toast = useToast()
  const aceita = movimentacaoAceitaAnimais(movimentacao)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [confirmarRestantes, setConfirmarRestantes] = useState(false)

  const ligados = useAnimaisDaMovimentacao(aceita ? movimentacao.id : undefined)
  const candidatos = useCandidatosMovimentacao(movimentacao, ligados.data, aceita)
  const vincular = useVincularAnimais(movimentacao)
  const desvincular = useDesvincularAnimal(movimentacao)

  const total = movimentacao.numero_cabecas ?? 0
  const quantidadeLigada = ligados.data?.length ?? 0
  const vagas = Math.max(0, total - quantidadeLigada)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = candidatos.data ?? []
    return termo ? lista.filter((a) => a.identificacao.toLowerCase().includes(termo)) : lista
  }, [candidatos.data, busca])

  if (!aceita) return null

  const alternar = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const aoVincular = async () => {
    try {
      const r = await vincular.mutateAsync({ ids: [...selecionados], confirmarRestantes })
      toast.success(
        `${r.vinculados} animal(is) informado(s)${r.restantes_confirmados ? `; ${r.restantes_confirmados} confirmado(s) na origem` : ''}.`
      )
      setSelecionados(new Set())
      setConfirmarRestantes(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const aoDesvincular = async (id: string, identificacao: string) => {
    try {
      await desvincular.mutateAsync(id)
      toast.success(`${identificacao} voltou a ter localização incerta.`)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-muted">
        A movimentação tem <strong className="text-content-strong">{total}</strong> cabeça(s). Informar os animais identificados não muda a
        contagem: eles só passam a constar no lote de destino com a localização confirmada.
      </p>

      <div>
        <h4 className="text-sm font-semibold text-content-strong mb-2">
          Animais informados ({quantidadeLigada} de {total})
        </h4>
        {ligados.isLoading ? (
          <p className="text-sm text-content-muted">Carregando...</p>
        ) : quantidadeLigada === 0 ? (
          <p className="text-sm text-content-muted">Nenhum animal informado.</p>
        ) : (
          <ul className="divide-y divide-border-base rounded-lg border border-surface-3">
            {ligados.data!.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-content-strong">{a.identificacao}</span>
                <Button variant="secondary" onClick={() => aoDesvincular(a.id, a.identificacao)} disabled={desvincular.isPending}>
                  Desfazer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {vagas > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-content-strong">Informar mais animais (até {vagas})</h4>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por brinco, chip ou manejo" className={campo} />
          {candidatos.isLoading ? (
            <p className="text-sm text-content-muted">Carregando animais...</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-content-muted">Nenhum animal identificado disponível desta categoria nos lotes de origem e destino.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-border-base rounded-lg border border-surface-3">
              {filtrados.map((a) => {
                const marcado = selecionados.has(a.id)
                return (
                  <li key={a.id}>
                    <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={!marcado && selecionados.size >= vagas}
                        onChange={() => alternar(a.id)}
                      />
                      <span className="text-content-strong">{a.identificacao}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm text-content">
            <input type="checkbox" checked={confirmarRestantes} onChange={(e) => setConfirmarRestantes(e.target.checked)} className="mt-0.5" />
            <span>Os demais animais identificados deste lote de origem continuam nele (confirmar a localização deles).</span>
          </label>
          <Button onClick={aoVincular} disabled={selecionados.size === 0 || vincular.isPending}>
            Informar {selecionados.size > 0 ? `${selecionados.size} animal(is)` : 'animais'}
          </Button>
        </div>
      )}
    </div>
  )
}
