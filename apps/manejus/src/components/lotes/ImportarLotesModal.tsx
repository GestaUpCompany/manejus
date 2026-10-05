import { useRef, useState } from 'react'
import { Modal, Button, useToast } from '@gestaup/ui'
import { baixarModeloImportacaoLotes } from '../../utils/modeloImportacaoLotes'
import {
  carregarContextoImportacao,
  importarLotesValidos,
  lerPlanilhaLotes,
  validarLinhas,
  type ResumoImportacao,
} from '../../services/lotesImportacao'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string | undefined
  pastos: { id: string; nome: string }[]
  currais: { id: string; nome: string }[]
  racas: { id: string; nome: string }[]
  onImported: () => void
}

export function ImportarLotesModal({ isOpen, onClose, fazendaId, pastos, currais, racas, onImported }: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [importando, setImportando] = useState(false)
  const [baixandoModelo, setBaixandoModelo] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null)

  const handleBaixarModelo = async () => {
    setBaixandoModelo(true)
    try {
      await baixarModeloImportacaoLotes({
        pastos: pastos.map((p) => p.nome),
        currais: currais.map((c) => c.nome),
        racas: racas.map((r) => r.nome),
      })
    } catch (err) {
      console.error('Erro ao gerar planilha-modelo:', err)
      toast.error('Erro ao gerar a planilha-modelo.')
    } finally {
      setBaixandoModelo(false)
    }
  }

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setArquivo(file)
    setErroGeral(null)
    setResumo(null)
  }

  const handleImportar = async () => {
    if (!arquivo || !fazendaId) return
    setImportando(true)
    setErroGeral(null)
    setResumo(null)

    try {
      const parse = await lerPlanilhaLotes(arquivo)
      if (parse.erro) {
        setErroGeral(parse.erro)
        return
      }

      const ctx = await carregarContextoImportacao(fazendaId)
      const validacao = validarLinhas(parse.linhas, ctx)
      const { importados, falhas } = await importarLotesValidos(validacao.lotes, fazendaId)

      setResumo({
        lotesImportados: importados,
        duplicadosBanco: validacao.duplicadosBanco,
        errosLinhas: validacao.errosLinhas,
        falhasBanco: falhas,
        totalLinhas: parse.linhas.length,
      })

      if (importados.length > 0) {
        toast.success(`${importados.length} lote${importados.length > 1 ? 's' : ''} importado${importados.length > 1 ? 's' : ''} com sucesso.`)
        onImported()
      }
    } catch (err) {
      console.error('Erro na importação:', err)
      setErroGeral(`Erro ao processar arquivo: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
    } finally {
      setImportando(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFechar = () => {
    setArquivo(null)
    setErroGeral(null)
    setResumo(null)
    onClose()
  }

  const temProblemas = resumo && (resumo.errosLinhas.length > 0 || resumo.duplicadosBanco.length > 0 || resumo.falhasBanco.length > 0)

  return (
    <Modal isOpen={isOpen} onClose={handleFechar} title="Importar lotes por planilha" size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 border border-border-base px-3 py-2 text-xs text-content-muted space-y-1">
          <p>1. Baixe a planilha-modelo (já vem com seletores de pastos, currais e categorias cadastrados na fazenda).</p>
          <p>2. Preencha <strong>uma linha por categoria</strong>, repetindo o nome do lote nas linhas do mesmo lote.</p>
          <p>3. Envie o arquivo preenchido. Linhas com erro são listadas aqui e não são importadas; lotes só são criados quando todas as linhas do lote estão válidas.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="secondary" onClick={handleBaixarModelo} disabled={baixandoModelo || importando}>
            {baixandoModelo ? 'Gerando...' : 'Baixar planilha-modelo'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleSelecionarArquivo}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
          >
            Selecionar arquivo
          </Button>
          {arquivo && (
            <span className="text-sm text-content-muted truncate max-w-[220px]">{arquivo.name}</span>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={handleImportar}
            disabled={!arquivo || importando || !fazendaId}
            className="ml-auto"
          >
            {importando ? 'Importando...' : 'Importar'}
          </Button>
        </div>

        {erroGeral && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg">
            <p className="font-medium text-sm">Erro na importação:</p>
            <pre className="text-xs mt-1 whitespace-pre-wrap">{erroGeral}</pre>
          </div>
        )}

        {resumo && (
          <div className="space-y-3">
            {resumo.lotesImportados.length > 0 && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg">
                <p className="font-medium text-sm">
                  {resumo.lotesImportados.length} lote{resumo.lotesImportados.length > 1 ? 's' : ''} importado{resumo.lotesImportados.length > 1 ? 's' : ''} com sucesso:
                </p>
                <p className="text-xs mt-1">{resumo.lotesImportados.join(', ')}</p>
              </div>
            )}

            {resumo.duplicadosBanco.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-3 py-2 rounded-lg">
                <p className="font-medium text-sm">{resumo.duplicadosBanco.length} lote{resumo.duplicadosBanco.length > 1 ? 's' : ''} pulado{resumo.duplicadosBanco.length > 1 ? 's' : ''} porque já existe no cadastro:</p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.duplicadosBanco.map((d) => `- "${d.nome}" (linhas ${d.linhas.join(', ')})`).join('\n')}
                </pre>
              </div>
            )}

            {resumo.errosLinhas.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg max-h-56 overflow-y-auto">
                <p className="font-medium text-sm">{resumo.errosLinhas.length} linha{resumo.errosLinhas.length > 1 ? 's' : ''} com erro de validação:</p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.errosLinhas.map((e) => `- Linha ${e.linha} (${e.lote}): ${e.erros.join('; ')}`).join('\n')}
                </pre>
              </div>
            )}

            {resumo.falhasBanco.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg">
                <p className="font-medium text-sm">{resumo.falhasBanco.length} lote{resumo.falhasBanco.length > 1 ? 's' : ''} falharam ao gravar no banco:</p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.falhasBanco.map((f) => `- "${f.nome}": ${f.erro}`).join('\n')}
                </pre>
              </div>
            )}

            {temProblemas && (
              <p className="text-xs text-content-faint">
                Corrija a planilha e envie novamente. Somente os lotes com erro precisam ser reenviados.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
