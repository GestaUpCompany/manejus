import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@gestaup/ui'
import { POP_SLUGS, POPS_INFO, type PopSlug } from '../../features/pops/pops'
import { prepararPaginasPop } from '../../features/pops/paginas'
import { listarPops, restaurarPopPadrao, substituirPop } from '../../services/popsService'

interface Props {
  fazendaId: string
}

export function PopsConfig({ fazendaId }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [slugAtivo, setSlugAtivo] = useState<PopSlug | null>(null)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const queryKey = ['fazenda-pops', fazendaId]
  const { data: paginas = [], isLoading } = useQuery({ queryKey, queryFn: () => listarPops(fazendaId) })

  const enviar = useMutation({
    mutationFn: async ({ slug, arquivos }: { slug: PopSlug; arquivos: File[] }) => {
      const blobs = await prepararPaginasPop(arquivos)
      await substituirPop(fazendaId, slug, blobs)
      return { slug, total: blobs.length }
    },
    onSuccess: ({ slug, total }) => {
      setErro('')
      setSucesso(`${POPS_INFO[slug].titulo} atualizado com ${total} página${total > 1 ? 's' : ''}.`)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (e: unknown) => {
      setSucesso('')
      setErro(e instanceof Error ? e.message : 'Erro ao enviar o POP.')
    },
  })

  const restaurar = useMutation({
    mutationFn: (slug: PopSlug) => restaurarPopPadrao(fazendaId, slug),
    onSuccess: (_, slug) => {
      setErro('')
      setSucesso(`${POPS_INFO[slug].titulo} voltou ao padrão.`)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: () => {
      setSucesso('')
      setErro('Erro ao restaurar o POP padrão.')
    },
  })

  const ocupado = enviar.isPending || restaurar.isPending

  const escolher = (slug: PopSlug) => {
    setSlugAtivo(slug)
    setErro('')
    setSucesso('')
    inputRef.current?.click()
  }

  const aoSelecionar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (slugAtivo && arquivos.length) enviar.mutate({ slug: slugAtivo, arquivos })
  }

  return (
    <Card className="bg-surface-1 p-6 mt-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-content-strong">POPs das Cadernetas</h3>
          <p className="text-sm text-content-muted mt-1">
            Envie o POP da sua fazenda para substituir o padrão que aparece no botão amarelo da caderneta.
            Aceita PDF (todas as páginas) ou imagens JPG, PNG e WebP em retrato, formato A4 (ex.: 1240 × 1755 px).
            Com várias imagens, a ordem das páginas segue o nome dos arquivos. O celular baixa o POP novo ao abrir o app com internet.
          </p>
        </div>

        {erro && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-500">{erro}</p>
          </div>
        )}
        {sucesso && (
          <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-3">
            <p className="text-sm text-green-500">{sucesso}</p>
          </div>
        )}

        <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={aoSelecionar} />

        {isLoading ? (
          <p className="text-content-muted text-sm">Carregando...</p>
        ) : (
          <ul className="space-y-3">
            {POP_SLUGS.map((slug) => {
              const doSlug = paginas.filter((p) => p.slug === slug)
              const personalizado = doSlug.length > 0
              const enviando = enviar.isPending && enviar.variables?.slug === slug
              return (
                <li key={slug} className="rounded-lg border-2 border-surface-3 bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-content-strong">
                        {POPS_INFO[slug].titulo}{' '}
                        <span className={`ml-2 text-xs font-medium ${personalizado ? 'text-green-500' : 'text-content-faint'}`}>
                          {personalizado ? `Personalizado (${doSlug.length} pág.)` : 'Padrão'}
                        </span>
                      </p>
                      <p className="text-xs text-content-muted">Aparece em: {POPS_INFO[slug].cadernetas}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => escolher(slug)}
                        disabled={ocupado}
                        className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {enviando ? 'Enviando...' : personalizado ? 'Substituir' : 'Enviar POP'}
                      </button>
                      {personalizado && (
                        <button
                          type="button"
                          onClick={() => restaurar.mutate(slug)}
                          disabled={ocupado}
                          className="px-3 py-2 rounded-lg text-sm font-semibold text-content-strong border-2 border-surface-3 hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Restaurar padrão
                        </button>
                      )}
                    </div>
                  </div>
                  {personalizado && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {doSlug.map((p) => (
                        <img
                          key={p.id}
                          src={p.url}
                          alt={`${POPS_INFO[slug].titulo} - página ${p.ordem}`}
                          loading="lazy"
                          className="h-28 w-auto rounded border border-surface-3 bg-white"
                        />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
