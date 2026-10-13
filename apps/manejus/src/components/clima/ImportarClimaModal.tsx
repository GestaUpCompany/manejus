import { useRef, useState } from 'react'
import { Modal, Button, useToast } from '@gestaup/ui'
import { baixarModeloImportacaoClima } from '../../utils/modeloImportacaoClima'
import {
  carregarContextoClima,
  importarClimaValidos,
  lerPlanilhaClima,
  validarLinhasClima,
  type PluviometroModelo,
  type ResumoImportacaoClima,
} from '../../services/climaImportacao'

interface Props {
  isOpen: boolean
  onClose: () => void
  fazendaId: string | undefined
  nomeUsuario: string
  pluviometros: PluviometroModelo[]
  responsaveis: string[]
  onImported: () => void
}

const plural = (n: number, singular: string, pluralForma: string) => (n > 1 ? pluralForma : singular)

export function ImportarClimaModal({ isOpen, onClose, fazendaId, nomeUsuario, pluviometros, responsaveis, onImported }: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [importando, setImportando] = useState(false)
  const [baixandoModelo, setBaixandoModelo] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [resumo, setResumo] = useState<ResumoImportacaoClima | null>(null)

  const handleBaixarModelo = async () => {
    setBaixandoModelo(true)
    try {
      await baixarModeloImportacaoClima({ pluviometros, responsaveis })
    } catch (err) {
      console.error('Erro ao gerar planilha-modelo:', err)
      toast.error('Erro ao gerar a planilha-modelo.')
    } finally {
      setBaixandoModelo(false)
    }
  }

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setArquivo(e.target.files?.[0] || null)
    setErroGeral(null)
    setResumo(null)
  }

  const handleImportar = async () => {
    if (!arquivo || !fazendaId) return
    setImportando(true)
    setErroGeral(null)
    setResumo(null)

    try {
      const parse = await lerPlanilhaClima(arquivo)
      if (parse.erro) {
        setErroGeral(parse.erro)
        return
      }

      const ctx = await carregarContextoClima(fazendaId, pluviometros, responsaveis, parse.linhas)
      const validacao = validarLinhasClima(parse.linhas, ctx)
      if (validacao.colunasDesconhecidas.length > 0) {
        setErroGeral(
          `A planilha tem colunas que não correspondem ao modelo desta fazenda: ${validacao.colunasDesconhecidas.join(', ')}.\n` +
            'Baixe o modelo novamente (os pluviômetros ativos podem ter mudado) e copie os dados para ele.'
        )
        return
      }
      const { importados, falhas } = await importarClimaValidos(validacao.registros, fazendaId, nomeUsuario)

      setResumo({
        importados,
        duplicados: validacao.duplicados,
        errosLinhas: validacao.errosLinhas,
        falhasBanco: falhas,
        totalLinhas: parse.linhas.length,
      })

      if (importados > 0) {
        toast.success(`${importados} ${plural(importados, 'registro importado', 'registros importados')} com sucesso.`)
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

  const temProblemas =
    resumo && (resumo.errosLinhas.length > 0 || resumo.duplicados.length > 0 || resumo.falhasBanco.length > 0)

  return (
    <Modal isOpen={isOpen} onClose={handleFechar} title="Importar registros de clima por planilha" size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 border border-border-base px-3 py-2 text-xs text-content-muted space-y-1">
          <p>1. Baixe a planilha-modelo (já vem com uma coluna para cada pluviômetro ativo da fazenda).</p>
          <p>2. Preencha <strong>uma linha por leitura</strong>, com data, hora (hh:mm) e responsável (escolha na lista). Se já existir registro na mesma data e hora, a linha é ignorada.</p>
          <p>3. Envie o arquivo preenchido. Linhas com erro são listadas aqui e não são importadas.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="secondary" onClick={handleBaixarModelo} disabled={baixandoModelo || importando}>
            {baixandoModelo ? 'Gerando...' : 'Baixar planilha-modelo'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleSelecionarArquivo} className="hidden" />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            Selecionar arquivo
          </Button>
          {arquivo && <span className="text-sm text-content-muted truncate max-w-[220px]">{arquivo.name}</span>}
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
            {resumo.importados > 0 && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg">
                <p className="font-medium text-sm">
                  {resumo.importados} de {resumo.totalLinhas} {plural(resumo.totalLinhas, 'linha importada', 'linhas importadas')} com sucesso.
                </p>
              </div>
            )}

            {resumo.duplicados.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-3 py-2 rounded-lg max-h-40 overflow-y-auto">
                <p className="font-medium text-sm">
                  {resumo.duplicados.length} {plural(resumo.duplicados.length, 'linha ignorada', 'linhas ignoradas')} porque já existe registro na mesma data e hora:
                </p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.duplicados.map((d) => `- Linha ${d.linha} (${d.chave})`).join('\n')}
                </pre>
              </div>
            )}

            {resumo.errosLinhas.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg max-h-56 overflow-y-auto">
                <p className="font-medium text-sm">
                  {resumo.errosLinhas.length} {plural(resumo.errosLinhas.length, 'linha com erro', 'linhas com erro')} de validação:
                </p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.errosLinhas.map((e) => `- Linha ${e.linha}: ${e.erros.join('; ')}`).join('\n')}
                </pre>
              </div>
            )}

            {resumo.falhasBanco.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg">
                <p className="font-medium text-sm">
                  {resumo.falhasBanco.length} {plural(resumo.falhasBanco.length, 'linha falhou', 'linhas falharam')} ao gravar no banco:
                </p>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {resumo.falhasBanco.map((f) => `- Linha ${f.linha}: ${f.erro}`).join('\n')}
                </pre>
              </div>
            )}

            {temProblemas && (
              <p className="text-xs text-content-faint">
                Corrija a planilha e envie novamente. Linhas já importadas são ignoradas na reimportação.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
