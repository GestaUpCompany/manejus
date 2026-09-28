import { useEffect, useRef, useState } from 'react'
import { ConfirmModal } from '../ui'
import { excluirImagemCapa, enviarImagemCapa, listarImagensCapa, type ImagemCapa } from '../../services/relatorioCapasService'

interface Props {
  fazendaId: string
  selecionada: string | null
  onSelect: (path: string | null, previewUrl?: string) => void
  disabled?: boolean
}

export function RelatorioCapaGallery({ fazendaId, selecionada, onSelect, disabled }: Props) {
  const [imagens, setImagens] = useState<ImagemCapa[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [excluir, setExcluir] = useState<ImagemCapa | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = async () => {
    setLoading(true)
    try {
      setImagens(await listarImagensCapa(fazendaId))
      setError('')
    } catch {
      setError('Não foi possível carregar as imagens de capa.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [fazendaId])

  const handleUpload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await enviarImagemCapa(fazendaId, file)
      await carregar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    try {
      await excluirImagemCapa(excluir.path)
      if (selecionada === excluir.path) onSelect(null, '')
      setExcluir(null)
      await carregar()
    } catch {
      setError('Não foi possível excluir a imagem.')
      setExcluir(null)
      await carregar()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-content-strong">Imagem de fundo</h4>
          <p className="text-xs text-content-muted">Opcional, exclusiva desta fazenda.</p>
        </div>
        <label className={`rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10'}`}>
          {uploading ? 'Enviando...' : 'Adicionar imagem'}
          <input ref={inputRef} type="file" name="relatorio-imagem-capa" accept="image/png,image/jpeg,image/webp" disabled={disabled || uploading} onChange={(event) => handleUpload(event.target.files?.[0])} className="sr-only" />
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" disabled={disabled} onClick={() => onSelect(null, '/images/capa-padrao.png')} className={`relative aspect-[1.414/1] overflow-hidden rounded-lg border-2 p-3 text-left text-xs font-semibold text-white ${selecionada === null ? 'border-amber-400 ring-2 ring-amber-200' : 'border-transparent'}`}>
          <img src="/images/capa-padrao.png" alt="Capa padrão" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-r from-green-950/85 via-green-800/55 to-blue-950/40" />
          <span className="relative">Capa padrão</span>
        </button>
        {loading ? (
          <div className="aspect-[1.414/1] animate-pulse rounded-lg bg-surface-2" />
        ) : imagens.map((imagem) => (
          <div key={imagem.path} className={`group relative aspect-[1.414/1] overflow-hidden rounded-lg border-2 ${selecionada === imagem.path ? 'border-amber-400 ring-2 ring-amber-200' : 'border-border-base'}`}>
            <button type="button" disabled={disabled} onClick={() => onSelect(imagem.path, imagem.previewUrl)} className="h-full w-full" title={imagem.nome}>
              <img src={imagem.previewUrl} alt={imagem.nome} className="h-full w-full object-cover" />
            </button>
            <button type="button" disabled={disabled} onClick={() => setExcluir(imagem)} className="absolute right-1 top-1 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-red-700 shadow opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
              Excluir
            </button>
          </div>
        ))}
      </div>
      <ConfirmModal isOpen={excluir !== null} onClose={() => setExcluir(null)} onConfirm={confirmarExclusao} title="Excluir imagem de capa" message="Esta imagem será removida da biblioteca da fazenda." confirmText="Excluir" />
    </div>
  )
}
