import { createPortal } from 'react-dom'

export interface ColunaImpressao {
  titulo: string
  alinhamento?: 'left' | 'right' | 'center'
}

interface RelatorioListaImpressaoProps {
  titulo: string
  fazendaNome?: string | null
  periodo: string
  colunas: ColunaImpressao[]
  linhas: string[][]
  rodape?: string[]
}

/**
 * Raiz de impressão de uma lista (oculta na tela; exibida só em @media print, ver index.css).
 * Renderizada em document.body para a regra `body > *:not(...)` esconder o restante da página.
 */
export function RelatorioListaImpressao({ titulo, fazendaNome, periodo, colunas, linhas, rodape }: RelatorioListaImpressaoProps) {
  const emissao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })
  return createPortal(
    <div className="lista-print-root" aria-hidden="true">
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="lista-print-brand">
        <div className="lista-print-brand-side">
          <img src="/images/manejus360.png" alt="Manej'Us 360" />
          <span>Manej'Us <b>360</b></span>
        </div>
        {fazendaNome && <span>{fazendaNome}</span>}
      </div>
      <h1>{titulo}</h1>
      <div className="lista-print-meta">
        <span>{periodo}</span>
        <span>{linhas.length} registro(s) · Emitido em {emissao}</span>
      </div>
      <table>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.titulo} style={{ textAlign: c.alinhamento ?? 'left' }}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i}>
              {linha.map((valor, j) => (
                <td key={j} style={{ textAlign: colunas[j]?.alinhamento ?? 'left' }}>{valor}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && (
          <tfoot>
            <tr>
              {rodape.map((valor, j) => (
                <td key={j} style={{ textAlign: colunas[j]?.alinhamento ?? 'left' }}>{valor}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>,
    document.body,
  )
}
