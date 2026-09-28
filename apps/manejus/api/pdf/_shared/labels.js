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
