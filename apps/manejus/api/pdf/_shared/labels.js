// Mapa único de rótulos amigáveis para diagnósticos de morte, unificando o que
// existia duplicado entre api/pdf/morte.js e src/utils/relatorioMortePDF.ts.
// Se o cliente adicionar um diagnóstico novo, o rótulo entra aqui e passa a
// aparecer corretamente em ambos os caminhos (jsPDF e Puppeteer).

export const DIAGNOSTIC_LABELS = {
  inchaco: 'Inchaço',
  fraturas: 'Fraturas',
  medicado: 'Foi medicado',
  infeccao: 'Infecção',
  parasitismo: 'Parasitismo',
  respiratorio: 'Respiratório',
  digestivo: 'Digestivo',
  acidente: 'Acidente',
  desconhecido: 'Desconhecido',
  morteSubita: 'Morte súbita',
  decomposicao: 'Decomposição',
  animalInchado: 'Animal inchado',
  animalSozinho: 'Animal sozinho',
  animalBicheira: 'Bicheira',
  apatiaFraqueza: 'Apatia/fragilidade',
  doencasPrevias: 'Doenças prévias',
  encontradoVivo: 'Encontrado vivo',
  carrapatosMoscas: 'Carrapatos/moscas',
  secrecaoOrificios: 'Secreção orifícios',
  sinaisIntoxicacao: 'Sinais intoxicação',
  sintomasPneumonia: 'Sintomas pneumonia',
  salivacaoExcessiva: 'Salivação excessiva',
  desordensDigestivas: 'Desordens digestivas',
  medicamentosRecentes: 'Medicamentos recentes',
  incoordenacaoTremores: 'Incoordenação/tremores',
  // Compatibilidade com variação antiga com cedilha estranha vinda do PWA
  incoordenaçãoTremores: 'Incoordenação/tremores',
}

export const diagLabel = (value) =>
  DIAGNOSTIC_LABELS[value] ??
  String(value ?? '—')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase())

// Diagnósticos da caderneta de Rodeio (registros_rodeio.diagnosticos).
// `inverted: true` = problema quando valor === 'S'; `inverted: false` =
// pergunta "OK?", alerta quando valor === 'N'. Mesma classificação do
// RODEIO_DIAGNOSTICOS do PWA (frontend/src/utils/pdfUtils.ts) e do módulo
// src/features/relatorioRodeio/agregacao.ts.
export const RODEIO_DIAGNOSTICOS = [
  { key: 'bebedourosCochos', label: 'Bebedouros/Cochos', inverted: false },
  { key: 'pastagensTaxaLotacao', label: 'Pastagens/Taxa de lotação', inverted: false },
  { key: 'cercasCochosPorteiras', label: 'Cercas/Cochos/Porteiras', inverted: false },
  { key: 'animaisMachucadosDoentesBichados', label: 'Animais machucados/doentes/bichados', inverted: true },
  { key: 'carrapatosMoscas', label: 'Carrapatos/Moscas', inverted: true },
  { key: 'animaisEntreverados', label: 'Animais entreverados', inverted: true },
  { key: 'animalMorto', label: 'Animal morto', inverted: true },
]

// Retorna os alertas de um registro de rodeio: itens fora do padrão
// esperado (problema sanitário ou pendência de infraestrutura).
export function rodeioAlertas(diagnosticos) {
  if (!diagnosticos || typeof diagnosticos !== 'object') return []
  const alertas = []
  for (const item of RODEIO_DIAGNOSTICOS) {
    const diag = diagnosticos[item.key]
    const valor = diag && diag.valor
    if (!valor) continue
    const ehAlerta = item.inverted ? valor === 'S' : valor === 'N'
    if (ehAlerta) {
      alertas.push({
        key: item.key,
        label: item.label,
        observacao: (diag && diag.observacao) || '',
        sanitario: item.inverted,
      })
    }
  }
  return alertas
}
