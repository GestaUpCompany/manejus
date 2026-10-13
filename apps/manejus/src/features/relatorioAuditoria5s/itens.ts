// Cópia dos itens da Auditoria 5S do PWA (frontend/src/utils/auditoria5sItens.ts).
// A chave é o que fica gravado em registros_auditoria_5s.itens ('C' | 'N' | 'NA'); ao mudar a lista, atualize os dois repos.

export interface Item5S {
  chave: string
  texto: string
  /** Texto do item quando respondido N: a não conformidade como afirmação (usado em mensagens e relatórios). */
  negativa: string
}

export interface Secao5S {
  id: string
  titulo: string
  itens: Item5S[]
}

export const SECOES_5S: Secao5S[] = [
  {
    id: 'utilizacao',
    titulo: 'Utilização',
    itens: [
      { chave: 'utilizacao_1', texto: 'Existe material em desuso no local?', negativa: 'Há material em desuso no local.' },
      { chave: 'utilizacao_2', texto: 'Os itens estão em perfeitas condições de uso?', negativa: 'Há itens que não estão em perfeitas condições de uso.' },
      { chave: 'utilizacao_3', texto: 'Estão apenas os materiais necessário para as atividades?', negativa: 'Há materiais além dos necessários para as atividades.' },
      { chave: 'utilizacao_4', texto: 'Existe local para descarte de itens em desuso no setor?', negativa: 'Não existe local para descarte de itens em desuso no setor.' },
      { chave: 'utilizacao_5', texto: 'Os descartes estão sendo feitos da forma correta?', negativa: 'Os descartes não estão sendo feitos da forma correta.' },
    ],
  },
  {
    id: 'organizacao',
    titulo: 'Organização',
    itens: [
      { chave: 'organizacao_1', texto: 'A identificação visual está adequada?', negativa: 'A identificação visual não está adequada.' },
      { chave: 'organizacao_2', texto: 'As ferramentas estão em seu devido lugar?', negativa: 'As ferramentas não estão em seu devido lugar.' },
      { chave: 'organizacao_3', texto: 'Todos os itens estão identificados?', negativa: 'Há itens sem identificação.' },
      { chave: 'organizacao_4', texto: 'O layout facilita o fluxo de trabalho?', negativa: 'O layout não facilita o fluxo de trabalho.' },
      { chave: 'organizacao_5', texto: 'É possível localizar os itens facilmente?', negativa: 'Não é possível localizar os itens facilmente.' },
    ],
  },
  {
    id: 'limpeza',
    titulo: 'Limpeza',
    itens: [
      { chave: 'limpeza_1', texto: 'O ambiente está limpo e em boas condições de uso?', negativa: 'O ambiente não está limpo ou em boas condições de uso.' },
      { chave: 'limpeza_2', texto: 'As ferramentas estão sem sujeira acumulada?', negativa: 'Há sujeira acumulada nas ferramentas.' },
      { chave: 'limpeza_3', texto: 'A rotina de limpeza do local está sendo cumprida?', negativa: 'A rotina de limpeza do local não está sendo cumprida.' },
      { chave: 'limpeza_4', texto: 'Fontes de sujeira foram eliminadas?', negativa: 'Há fontes de sujeira que não foram eliminadas.' },
      { chave: 'limpeza_5', texto: 'O material necessário para limpeza está abastecido?', negativa: 'O material necessário para limpeza não está abastecido.' },
    ],
  },
  {
    id: 'padronizacao',
    titulo: 'Padronização',
    itens: [
      { chave: 'padronizacao_1', texto: 'Os padrões estão sendo seguidos?', negativa: 'Os padrões não estão sendo seguidos.' },
      { chave: 'padronizacao_2', texto: 'Os procedimentos estão visíveis?', negativa: 'Os procedimentos não estão visíveis.' },
      { chave: 'padronizacao_3', texto: 'Está sendo padronizado os novos itens inclusos?', negativa: 'Os novos itens inclusos não estão sendo padronizados.' },
      { chave: 'padronizacao_4', texto: 'O padrão visual está conforme?', negativa: 'O padrão visual não está conforme.' },
      { chave: 'padronizacao_5', texto: 'Novos colaboradores foram treinados quanto aos padrões?', negativa: 'Há novos colaboradores que não foram treinados quanto aos padrões.' },
    ],
  },
  {
    id: 'disciplina',
    titulo: 'Disciplina',
    itens: [
      { chave: 'disciplina_1', texto: 'A equipe está seguindo o padrão definido?', negativa: 'A equipe não está seguindo o padrão definido.' },
      { chave: 'disciplina_2', texto: 'As não conformidades anteriores foram corrigidas?', negativa: 'As não conformidades anteriores não foram corrigidas.' },
      { chave: 'disciplina_3', texto: 'O dono de área está tendo a colaboração da equipe?', negativa: 'O dono de área não está tendo a colaboração da equipe.' },
      { chave: 'disciplina_4', texto: 'O 5S segue sem necessidade de cobrança pela liderança?', negativa: 'O 5S precisa de cobrança da liderança para ser seguido.' },
      { chave: 'disciplina_5', texto: 'As não conformidades estão sendo corrigidas no prazo?', negativa: 'As não conformidades não estão sendo corrigidas no prazo.' },
    ],
  },
]
