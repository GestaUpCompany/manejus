import { TableExportConfig } from './exportXLSX'

export const MATERNIDADE_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_maternidade',
  sheetName: 'Maternidade',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'peso_cria_kg', header: 'Peso Cria (kg)', format: 'number' },
    { source: 'id_provisorio_cria', header: 'ID Provisório' },
    { source: 'tratamento', header: 'Tratamentos' },
    { source: 'tipo_parto', header: 'Tipo de Parto', transform: (value) => Array.isArray(value) ? value.join(', ') : value },
    { source: 'sexo', header: 'Sexo' },
    { source: 'raca', header: 'Raça' },
    { source: 'categoria_mae', header: 'Categoria da Mãe' },
    { source: 'escore_matriz', header: 'Escore Matriz', format: 'number' },
    { source: 'id_chip_mae', header: 'Chip Mãe' },
    { source: 'id_brinco_cria', header: 'Brinco Cria' },
    { source: 'id_chip_cria', header: 'Chip Cria' },
    { source: 'id_brinco_mae', header: 'Brinco Mãe' },
    { source: 'id_manejo_mae', header: 'ID Manejo Mãe' },
    { source: 'individuo_mae', header: 'Brinco Mãe (Cadastro)', transform: (value) => value?.id_brinco || '' },
    { source: 'individuo_cria', header: 'Brinco Cria (Cadastro)', transform: (value) => value?.id_brinco || '' },
    { source: 'docilidade_matriz', header: 'Docilidade Matriz' },
    { source: 'observacao_parto', header: 'Observações' }
  ]
}

export const PASTAGENS_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_pastagens',
  sheetName: 'Pastagens',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'manejador', header: 'Manejador' },
    { source: 'lote', header: 'Lote' },
    { source: 'pasto_saida', header: 'Pasto Saída' },
    { source: 'avaliacao_saida', header: 'Avaliação Saída', format: 'number' },
    { source: 'pasto_entrada', header: 'Pasto Entrada' },
    { source: 'avaliacao_entrada', header: 'Avaliação Entrada', format: 'number' },
    { source: 'vaca', header: 'Vaca', format: 'number' },
    { source: 'touro', header: 'Touro', format: 'number' },
    { source: 'bezerro', header: 'Bezerro', format: 'number' },
    { source: 'boi_magro', header: 'Boi Magro', format: 'number' },
    { source: 'garrote', header: 'Garrote', format: 'number' },
    { source: 'novilha', header: 'Novilha', format: 'number' },
    { source: 'total_animais', header: 'Total Animais', format: 'number' },
    { source: 'escore_gado', header: 'Escore Gado', format: 'number' },
    { source: 'escore_fezes', header: 'Escore Fezes', format: 'number' },
    { source: 'numero_pessoas_manejo', header: 'Nº Pessoas Manejo', format: 'number' },
    { source: 'pasto_saida_area_util', header: 'Pasto Saída Área Útil' },
    { source: 'pasto_saida_especie', header: 'Pasto Saída Espécie' },
    { source: 'pasto_entrada_area_util', header: 'Pasto Entrada Área Útil' },
    { source: 'pasto_entrada_especie', header: 'Pasto Entrada Espécie' },
    { source: 'gado_contado', header: 'Gado Contado' },
    { source: 'avaliacao_geral', header: 'Animal Morto', transform: (value) => value?.animalMorto?.valor || '' },
    { source: 'avaliacao_geral', header: 'Animal Morto Obs', transform: (value) => value?.animalMorto?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Bebedouros/Cochos', transform: (value) => value?.bebedourosCochos?.valor || '' },
    { source: 'avaliacao_geral', header: 'Bebedouros/Cochos Obs', transform: (value) => value?.bebedourosCochos?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Carrapatos/Moscas', transform: (value) => value?.carrapatosMoscas?.valor || '' },
    { source: 'avaliacao_geral', header: 'Carrapatos/Moscas Obs', transform: (value) => value?.carrapatosMoscas?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Animais Entreverados', transform: (value) => value?.animaisEntreverados?.valor || '' },
    { source: 'avaliacao_geral', header: 'Animais Entreverados Obs', transform: (value) => value?.animaisEntreverados?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Pastagens Taxa Lotação Adequada', transform: (value) => value?.pastagensTaxaLotacao?.valor || '' },
    { source: 'avaliacao_geral', header: 'Pastagens Taxa Lotação Adequada Obs', transform: (value) => value?.pastagensTaxaLotacao?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Cercas/Cochos/Porteiras', transform: (value) => value?.cercasCochosPorteiras?.valor || '' },
    { source: 'avaliacao_geral', header: 'Cercas/Cochos/Porteiras Obs', transform: (value) => value?.cercasCochosPorteiras?.observacao || '' },
    { source: 'avaliacao_geral', header: 'Animais Machucados/Doentes', transform: (value) => value?.animaisMachucadosDoentesBichados?.valor || '' },
    { source: 'avaliacao_geral', header: 'Animais Machucados/Doentes Obs', transform: (value) => value?.animaisMachucadosDoentesBichados?.observacao || '' },
    { source: 'equipe_nomes', header: 'Equipe Nomes', transform: (value) => Array.isArray(value) ? value.join(', ') : value }
  ]
}

export const ALMOXARIFADO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_almoxarifado',
  sheetName: 'Almoxarifado',
  columns: [
    { source: 'data', header: 'Data', format: 'datetime' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'quem_entregou', header: 'Quem Entregou' },
    { source: 'quem_pegou', header: 'Quem Pegou' },
    { source: 'setor', header: 'Setor' },
    { source: 'itens', header: 'Itens', transform: (value) => {
      if (!value) return ''
      if (Array.isArray(value)) {
        return value.map((item: any) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const tipo = item.tipo || item.tipoClassificacao || 'Item'
            const qtd = item.quantidade || '-'
            const setor = item.setor || ''
            const dev = item.necessitaDevolucao === 'S' && item.prazoDevolucao ? `, devolução até ${item.prazoDevolucao}` : ''
            const obs = item.observacao ? `, ${item.observacao}` : ''
            const setorStr = setor ? `, ${setor}` : ''
            return `${tipo} (${qtd}${setorStr}${dev}${obs})`
          }
          return String(item)
        }).join(' | ')
      }
      if (typeof value === 'object') {
        return Object.entries(value)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')
      }
      return String(value)
    }},
    { source: 'observacao', header: 'Observação' }
  ]
}

export const BEBEDOUROS_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_bebedouros',
  sheetName: 'Bebedouros',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'responsavel', header: 'Responsável' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'leitura_bebedouro', header: 'Leitura Bebedouro', format: 'number' },
    { source: 'numero_bebedouro', header: 'Nº Bebedouro' },
    { source: 'checklist', header: 'Água Suficiente', transform: (value) => value?.agua_suficiente?.valor ? 'Sim' : 'Não' },
    { source: 'checklist', header: 'Água Suficiente Obs', transform: (value) => value?.agua_suficiente?.observacao || '' },
    { source: 'checklist', header: 'Vazão Bebedouro Ideal', transform: (value) => value?.vazao_bebedouro_ideal?.valor ? 'Sim' : 'Não' },
    { source: 'checklist', header: 'Vazão Bebedouro Ideal Obs', transform: (value) => value?.vazao_bebedouro_ideal?.observacao || '' },
    { source: 'checklist', header: 'Espaçamento Bebedouro Ideal', transform: (value) => value?.espacamento_bebedouro_ideal?.valor ? 'Sim' : 'Não' },
    { source: 'checklist', header: 'Espaçamento Bebedouro Ideal Obs', transform: (value) => value?.espacamento_bebedouro_ideal?.observacao || '' },
    { source: 'checklist', header: 'Boia/Proteção Boas Condições', transform: (value) => value?.boia_protecao_boas_condicoes?.valor ? 'Sim' : 'Não' },
    { source: 'checklist', header: 'Boia/Proteção Boas Condições Obs', transform: (value) => value?.boia_protecao_boas_condicoes?.observacao || '' },
    { source: 'checklist', header: 'Aterro/Acesso Bebedouro Ideal', transform: (value) => value?.aterro_acesso_bebedouro_ideal?.valor ? 'Sim' : 'Não' },
    { source: 'checklist', header: 'Aterro/Acesso Bebedouro Ideal Obs', transform: (value) => value?.aterro_acesso_bebedouro_ideal?.observacao || '' },
    { source: 'observacao', header: 'Observação' }
  ]
}

export const ENFERMARIA_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_enfermaria',
  sheetName: 'Enfermaria',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'brinco', header: 'Brinco' },
    { source: 'chip', header: 'Chip' },
    { source: 'categoria', header: 'Categoria' },
    { source: 'sexo', header: 'Sexo' },
    { source: 'raca', header: 'Raça' },
    { source: 'idade', header: 'Idade' },
    { source: 'tratamento_outros', header: 'Tratamento Outros' },
    { source: 'tratamento_obs', header: 'Observação do Tratamento' },
    { source: 'diagnosticos', header: 'Bicheira', transform: (value) => value?.bicheira?.valor === 'S' ? 'Sim' : value?.bicheira?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Bicheira Obs', transform: (value) => value?.bicheira?.observacao || '' },
    { source: 'diagnosticos', header: 'Cegueira', transform: (value) => value?.cegueira?.valor === 'S' ? 'Sim' : value?.cegueira?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Cegueira Obs', transform: (value) => value?.cegueira?.observacao || '' },
    { source: 'diagnosticos', header: 'Fraturas', transform: (value) => value?.fraturas?.valor === 'S' ? 'Sim' : value?.fraturas?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Fraturas Obs', transform: (value) => value?.fraturas?.observacao || '' },
    { source: 'diagnosticos', header: 'Febre Alta', transform: (value) => value?.febreAlta?.valor === 'S' ? 'Sim' : value?.febreAlta?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Febre Alta Obs', transform: (value) => value?.febreAlta?.observacao || '' },
    { source: 'diagnosticos', header: 'Picado por Cobra', transform: (value) => value?.picadoCobra?.valor === 'S' ? 'Sim' : value?.picadoCobra?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Picado por Cobra Obs', transform: (value) => value?.picadoCobra?.observacao || '' },
    { source: 'diagnosticos', header: 'Presença de Sangue', transform: (value) => value?.presencaSangue?.valor === 'S' ? 'Sim' : value?.presencaSangue?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Presença de Sangue Obs', transform: (value) => value?.presencaSangue?.observacao || '' },
    { source: 'diagnosticos', header: 'Andar Cambaleante', transform: (value) => value?.andarCambaleante?.valor === 'S' ? 'Sim' : value?.andarCambaleante?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Andar Cambaleante Obs', transform: (value) => value?.andarCambaleante?.observacao || '' },
    { source: 'diagnosticos', header: 'Pododermite/Cascos', transform: (value) => value?.pododermiteCascos?.valor === 'S' ? 'Sim' : value?.pododermiteCascos?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Pododermite/Cascos Obs', transform: (value) => value?.pododermiteCascos?.observacao || '' },
    { source: 'diagnosticos', header: 'Sintomas Pneumonia', transform: (value) => value?.sintomasPneumonia?.valor === 'S' ? 'Sim' : value?.sintomasPneumonia?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Sintomas Pneumonia Obs', transform: (value) => value?.sintomasPneumonia?.observacao || '' },
    { source: 'diagnosticos', header: 'Desordens Digestivas', transform: (value) => value?.desordensDigestivas?.valor === 'S' ? 'Sim' : value?.desordensDigestivas?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Desordens Digestivas Obs', transform: (value) => value?.desordensDigestivas?.observacao || '' },
    { source: 'diagnosticos', header: 'Incoordenação/Tremores', transform: (value) => value?.incoordenacaoTremores?.valor === 'S' ? 'Sim' : value?.incoordenacaoTremores?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Incoordenação/Tremores Obs', transform: (value) => value?.incoordenacaoTremores?.observacao || '' },
    { source: 'medicamentos', header: 'Medicamentos', transform: (value) => {
      if (!Array.isArray(value)) return ''
      return value.map((m: any) => `${m.nomeComercial || ''} (${m.tipo || ''}) ${m.doseAplicada || ''}`).join(' | ')
    }}
  ]
}

export const MANUTENCAO_MAQUINAS_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_manutencao_maquinas',
  sheetName: 'Manutenção de Máquinas',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'responsavel_checklist', header: 'Responsável' },
    { source: 'operador_motorista', header: 'Operador/Motorista' },
    { source: 'veiculo_trator', header: 'Máquina/Veículo' },
    { source: 'placa', header: 'Placa' },
    { source: 'odometro_horimetro', header: 'Odômetro/Horímetro' },
    { source: 'checklist', header: 'Assento Bom', transform: (value) => value?.assentoBom?.valor === 'S' ? 'Sim' : value?.assentoBom?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Assento Bom Obs', transform: (value) => value?.assentoBom?.observacao || '' },
    { source: 'checklist', header: 'Bateria Boa', transform: (value) => value?.bateriaBoa?.valor === 'S' ? 'Sim' : value?.bateriaBoa?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Bateria Boa Obs', transform: (value) => value?.bateriaBoa?.observacao || '' },
    { source: 'checklist', header: 'Freios Bons', transform: (value) => value?.freiosBons?.valor === 'S' ? 'Sim' : value?.freiosBons?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Freios Bons Obs', transform: (value) => value?.freiosBons?.observacao || '' },
    { source: 'checklist', header: 'Tapetes Bons', transform: (value) => value?.tapetesBons?.valor === 'S' ? 'Sim' : value?.tapetesBons?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Tapetes Bons Obs', transform: (value) => value?.tapetesBons?.observacao || '' },
    { source: 'checklist', header: 'Calibrou Pneus', transform: (value) => value?.calibrouPneus?.valor === 'S' ? 'Sim' : value?.calibrouPneus?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Calibrou Pneus Obs', transform: (value) => value?.calibrouPneus?.observacao || '' },
    { source: 'checklist', header: 'Limpou Radiador', transform: (value) => value?.limpouRadiador?.valor === 'S' ? 'Sim' : value?.limpouRadiador?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Limpou Radiador Obs', transform: (value) => value?.limpouRadiador?.observacao || '' },
    { source: 'checklist', header: 'Nível Água Ideal', transform: (value) => value?.nivelAguaIdeal?.valor === 'S' ? 'Sim' : value?.nivelAguaIdeal?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Nível Água Ideal Obs', transform: (value) => value?.nivelAguaIdeal?.observacao || '' },
    { source: 'checklist', header: 'Vidros Perfeitos', transform: (value) => value?.vidrosPerfeitos?.valor === 'S' ? 'Sim' : value?.vidrosPerfeitos?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Vidros Perfeitos Obs', transform: (value) => value?.vidrosPerfeitos?.observacao || '' },
    { source: 'checklist', header: 'Conferiu Elétrica', transform: (value) => value?.conferiuEletrica?.valor === 'S' ? 'Sim' : value?.conferiuEletrica?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Conferiu Elétrica Obs', transform: (value) => value?.conferiuEletrica?.observacao || '' },
    { source: 'checklist', header: 'Lavagem Realizada', transform: (value) => value?.lavagemRealizada?.valor === 'S' ? 'Sim' : value?.lavagemRealizada?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Lavagem Realizada Obs', transform: (value) => value?.lavagemRealizada?.observacao || '' },
    { source: 'checklist', header: 'Máquina Engraxada', transform: (value) => value?.maquinaEngraxada?.valor === 'S' ? 'Sim' : value?.maquinaEngraxada?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Máquina Engraxada Obs', transform: (value) => value?.maquinaEngraxada?.observacao || '' },
    { source: 'checklist', header: 'Conferiu Nível Óleo', transform: (value) => value?.conferiuNivelOleo?.valor === 'S' ? 'Sim' : value?.conferiuNivelOleo?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Conferiu Nível Óleo Obs', transform: (value) => value?.conferiuNivelOleo?.observacao || '' },
    { source: 'checklist', header: 'Abastecimento Realizado', transform: (value) => value?.abastecimentoRealizado?.valor === 'S' ? 'Sim' : value?.abastecimentoRealizado?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Abastecimento Realizado Obs', transform: (value) => value?.abastecimentoRealizado?.observacao || '' },
    { source: 'observacao', header: 'Observação' }
  ]
}

export const MOVIMENTACAO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_movimentacao',
  sheetName: 'Movimentação',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'lote_origem', header: 'Lote Origem' },
    { source: 'destino', header: 'Lote Destino' },
    { source: 'numero_cabecas', header: 'Nº Cabeças', format: 'number' },
    { source: 'peso_vivo_atual_kg', header: 'Peso Vivo Atual (kg)', format: 'number' },
    { source: 'categoria', header: 'Categoria' },
    { source: 'brinco', header: 'Brinco' },
    { source: 'chip', header: 'Chip' },
    { source: 'responsavel', header: 'Responsável' },
    { source: 'subtipo', header: 'Subtipo' },
    { source: 'motivo_movimentacao', header: 'Motivo da Movimentação' },
    { source: 'causa_observacao', header: 'Causa/Observação' },
    { source: 'lote_origem_nome', header: 'Lote Origem (Cadastro)', transform: (value) => value?.nome || '' },
    { source: 'lote_destino_nome', header: 'Lote Destino (Cadastro)', transform: (value) => value?.nome || '' },
    { source: 'individuo', header: 'Brinco (Cadastro)', transform: (value) => value?.id_brinco || '' },
    { source: 'tipo_saida', header: 'Tipo de Saída' },
    { source: 'tipo_entrada', header: 'Tipo de Entrada' },
    { source: 'fazenda_destino_nome', header: 'Fazenda Destino', transform: (value) => value?.nome || '' }
  ]
}

export const PROBLEMAS_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_problemas',
  sheetName: 'Problemas',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'setor', header: 'Setor' },
    { source: 'local', header: 'Local' },
    { source: 'tipo_problema', header: 'Tipo de Problema' },
    { source: 'tipo_problema_obs', header: 'Tipo de Problema Obs' },
    { source: 'descricao_problema', header: 'Descrição do Problema' },
    { source: 'tipo_ocorrencia', header: 'Tipo de Ocorrência' },
    { source: 'tipo_ocorrencia_obs', header: 'Tipo de Ocorrência Obs' },
    { source: 'gravidade_impacto', header: 'Gravidade do Impacto' },
    { source: 'gravidade_impacto_obs', header: 'Gravidade do Impacto Obs' },
    { source: 'prioridade', header: 'Prioridade' },
    { source: 'causa_identificada', header: 'Causa Identificada', format: 'boolean' },
    { source: 'causa_identificada_obs', header: 'Causa Identificada Obs' },
    { source: 'causa_raiz_identificada', header: 'Causa Raiz Identificada', format: 'boolean' },
    { source: 'causa_raiz_identificada_obs', header: 'Causa Raiz Identificada Obs' },
    { source: 'acao_corretiva_realizada', header: 'Ação Corretiva Realizada', format: 'boolean' },
    { source: 'acao_corretiva_realizada_obs', header: 'Ação Corretiva Realizada Obs' },
    { source: 'setor_resolve', header: 'Setor Resolve' }
  ]
}

export const ABASTECIMENTO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_abastecimento',
  sheetName: 'Abastecimento',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'quem_abasteceu', header: 'Quem Abasteceu' },
    { source: 'operador_motorista', header: 'Operador/Motorista' },
    { source: 'maquina_veiculo', header: 'Máquina/Veículo' },
    { source: 'placa', header: 'Placa' },
    { source: 'total_abastecido', header: 'Total Abastecido', format: 'number' },
    { source: 'total_bomba', header: 'Total Bomba', format: 'number' },
    { source: 'combustivel', header: 'Combustível' },
    { source: 'odometro_horimetro', header: 'Odômetro/Horímetro' },
    { source: 'tipo_operacao', header: 'Tipo de Operação' },
    { source: 'tipo_operacao_outros', header: 'Tipo de Operação Outros' },
    { source: 'observacao', header: 'Observação' }
  ]
}

export const ALIMENTACAO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_alimentacao',
  sheetName: 'Alimentação',
  columns: [
    { source: 'data', header: 'Data', format: 'datetime' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'modo', header: 'Modo' },
    { source: 'numero_cozinheiras', header: 'Nº Cozinheiras', format: 'number' },
    { source: 'quem_cozinhou', header: 'Quem Cozinhou' },
    { source: 'quem_ajudou', header: 'Quem Ajudou' },
    { source: 'numero_cafe_manha', header: 'Nº Café da Manhã', format: 'number' },
    { source: 'numero_lanches', header: 'Nº Lanches', format: 'number' },
    { source: 'numero_refeicoes_almoco', header: 'Nº Refeições Almoço', format: 'number' },
    { source: 'numero_refeicoes_jantar', header: 'Nº Refeições Jantar', format: 'number' },
    { source: 'fornecedor', header: 'Fornecedor' },
    { source: 'quantidade_marmitas', header: 'Quantidade Marmitas', format: 'number' },
    { source: 'preco_unitario', header: 'Preço Unitário (R$)', format: 'number' },
    { source: 'destinatario', header: 'Destinatário' },
    { source: 'quantidade_outros', header: 'Quantidade Outros' },
    { source: 'unidade_outros', header: 'Unidade Outros' },
    { source: 'nome_outros', header: 'Nome Outros' },
    { source: 'itens', header: 'Itens', transform: (value) => {
      if (!value) return ''
      if (Array.isArray(value)) {
        return value.map((item: any) => {
          if (typeof item === 'string') return item
          const nome = item.nome || item.item || 'Item'
          const qtd = item.quantidade ?? '-'
          const unidade = item.unidade || ''
          return `${nome}: ${qtd} ${unidade}`.trim()
        }).join(' | ')
      }
      if (typeof value === 'object') {
        return Object.entries(value)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')
      }
      return String(value)
    }},
    { source: 'observacao', header: 'Observação' }
  ]
}

export const CANTINA_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_alimentacao',
  sheetName: 'Cantina',
  columns: [
    { source: 'data', header: 'Data', format: 'datetime' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'modo', header: 'Modo' },
    { source: 'numero_cozinheiras', header: 'Nº Cozinheiras', format: 'number' },
    { source: 'quem_cozinhou', header: 'Quem Cozinhou' },
    { source: 'quem_ajudou', header: 'Quem Ajudou' },
    { source: 'numero_cafe_manha', header: 'Nº Café da Manhã', format: 'number' },
    { source: 'numero_lanches', header: 'Nº Lanches', format: 'number' },
    { source: 'numero_refeicoes_almoco', header: 'Nº Refeições Almoço', format: 'number' },
    { source: 'numero_refeicoes_jantar', header: 'Nº Refeições Jantar', format: 'number' },
    { source: 'fornecedor', header: 'Fornecedor' },
    { source: 'quantidade_marmitas', header: 'Quantidade Marmitas', format: 'number' },
    { source: 'preco_unitario', header: 'Preço Unitário (R$)', format: 'number' },
    { source: 'destinatario', header: 'Destinatário' },
    { source: 'quantidade_outros', header: 'Quantidade Outros' },
    { source: 'unidade_outros', header: 'Unidade Outros' },
    { source: 'nome_outros', header: 'Nome Outros' },
    { source: 'itens', header: 'Itens', transform: (value) => {
      if (!value) return ''
      if (Array.isArray(value)) {
        return value.map((item: any) => {
          if (typeof item === 'string') return item
          const nome = item.nome || item.item || 'Item'
          const qtd = item.quantidade ?? '-'
          const unidade = item.unidade || ''
          return `${nome}: ${qtd} ${unidade}`.trim()
        }).join(' | ')
      }
      if (typeof value === 'object') {
        return Object.entries(value)
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')
      }
      return String(value)
    }},
    { source: 'observacao', header: 'Observação' }
  ]
}

export const CLIMA_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_clima',
  sheetName: 'Clima',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'responsavel', header: 'Responsável' },
    { source: 'temperatura_media', header: 'Temperatura Média (°C)', format: 'number' },
    { source: 'umidade_relativa', header: 'Umidade Relativa (%)', format: 'number' },
    { source: 'medicoes', header: 'Medições', transform: (value) => {
      if (!Array.isArray(value)) return value ? String(value) : ''
      return value.map((m: any) => {
        const pluviometro = m.pluviometro_nome || 'Pluviômetro'
        const local = m.pluviometro_localizacao ? ` (${m.pluviometro_localizacao})` : ''
        const medicao = m.medicao !== undefined && m.medicao !== null ? `${m.medicao} mm` : 's/m'
        return `${pluviometro}${local}: ${medicao}`
      }).join(' | ')
    }},
    { source: 'observacao', header: 'Observação' }
  ]
}

export const LIMPEZA_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_limpeza',
  sheetName: 'Limpeza',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'numero_equipe', header: 'Nº Equipe', format: 'number' },
    { source: 'setor', header: 'Setor' },
    { source: 'local', header: 'Local' },
    { source: 'hora_inicio', header: 'Hora Início' },
    { source: 'hora_final', header: 'Hora Final' },
    { source: 'limpeza_realizada', header: 'Limpeza Realizada', transform: (value) => {
      if (!value) return ''
      if (Array.isArray(value)) {
        return value.map((item: string) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')
      }
      if (typeof value === 'object') {
        const tarefas = value.limpezaRealizada || value.tarefasRealizadas || []
        const lista = Array.isArray(tarefas)
          ? tarefas.map((item: string) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')
          : ''
        const detalhes = value.tarefas
        const detalhesStr = detalhes && typeof detalhes === 'object'
          ? Object.entries(detalhes).map(([k, v]) => `${k}: ${v}`).join('; ')
          : ''
        return [lista, detalhesStr].filter(Boolean).join(' | ')
      }
      return String(value)
    }},
    { source: 'observacao', header: 'Observação' }
  ]
}

export const MORTE_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_morte',
  sheetName: 'Morte',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'sexo', header: 'Sexo' },
    { source: 'raca', header: 'Raça' },
    { source: 'idade', header: 'Idade' },
    { source: 'peso_vivo', header: 'Peso Vivo (kg)', format: 'number' },
    { source: 'causa_morte', header: 'Causa da Morte' },
    { source: 'brinco', header: 'Brinco' },
    { source: 'chip', header: 'Chip' },
    { source: 'categoria', header: 'Categoria' },
    { source: 'categoria_outros', header: 'Categoria Outros' },
    { source: 'escore', header: 'Escore', format: 'number' },
    { source: 'nutricao_atual', header: 'Nutrição Atual' },
    { source: 'nutricao_anterior', header: 'Nutrição Anterior' },
    { source: 'diagnosticos', header: 'Inchaço', transform: (value) => value?.inchaco?.valor === 'S' ? 'Sim' : value?.inchaco?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Inchaço Obs', transform: (value) => value?.inchaco?.observacao || '' },
    { source: 'diagnosticos', header: 'Fraturas', transform: (value) => value?.fraturas?.valor === 'S' ? 'Sim' : value?.fraturas?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Fraturas Obs', transform: (value) => value?.fraturas?.observacao || '' },
    { source: 'diagnosticos', header: 'Medicado', transform: (value) => value?.medicado?.valor === 'S' ? 'Sim' : value?.medicado?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Medicado Obs', transform: (value) => value?.medicado?.observacao || '' },
    { source: 'diagnosticos', header: 'Morte Súbita', transform: (value) => value?.morteSubita?.valor === 'S' ? 'Sim' : value?.morteSubita?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Morte Súbita Obs', transform: (value) => value?.morteSubita?.observacao || '' },
    { source: 'diagnosticos', header: 'Decomposição', transform: (value) => value?.decomposicao?.valor === 'S' ? 'Sim' : value?.decomposicao?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Decomposição Obs', transform: (value) => value?.decomposicao?.observacao || '' },
    { source: 'diagnosticos', header: 'Animal Sozinho', transform: (value) => value?.animalSozinho?.valor === 'S' ? 'Sim' : value?.animalSozinho?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Animal Sozinho Obs', transform: (value) => value?.animalSozinho?.observacao || '' },
    { source: 'diagnosticos', header: 'Apatia/Fraqueza', transform: (value) => value?.apatiaFraqueza?.valor === 'S' ? 'Sim' : value?.apatiaFraqueza?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Apatia/Fraqueza Obs', transform: (value) => value?.apatiaFraqueza?.observacao || '' },
    { source: 'diagnosticos', header: 'Doenças Prévias', transform: (value) => value?.doencasPrevias?.valor === 'S' ? 'Sim' : value?.doencasPrevias?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Doenças Prévias Obs', transform: (value) => value?.doencasPrevias?.observacao || '' },
    { source: 'diagnosticos', header: 'Encontrado Vivo', transform: (value) => value?.encontradoVivo?.valor === 'S' ? 'Sim' : value?.encontradoVivo?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Encontrado Vivo Obs', transform: (value) => value?.encontradoVivo?.observacao || '' },
    { source: 'diagnosticos', header: 'Carrapatos/Moscas', transform: (value) => value?.carrapatosMoscas?.valor === 'S' ? 'Sim' : value?.carrapatosMoscas?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Carrapatos/Moscas Obs', transform: (value) => value?.carrapatosMoscas?.observacao || '' },
    { source: 'diagnosticos', header: 'Secreção Orifícios', transform: (value) => value?.secrecaoOrificios?.valor === 'S' ? 'Sim' : value?.secrecaoOrificios?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Secreção Orifícios Obs', transform: (value) => value?.secrecaoOrificios?.observacao || '' },
    { source: 'diagnosticos', header: 'Sinais Intoxicação', transform: (value) => value?.sinaisIntoxicacao?.valor === 'S' ? 'Sim' : value?.sinaisIntoxicacao?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Sinais Intoxicação Obs', transform: (value) => value?.sinaisIntoxicacao?.observacao || '' },
    { source: 'diagnosticos', header: 'Sintomas Pneumonia', transform: (value) => value?.sintomasPneumonia?.valor === 'S' ? 'Sim' : value?.sintomasPneumonia?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Sintomas Pneumonia Obs', transform: (value) => value?.sintomasPneumonia?.observacao || '' },
    { source: 'diagnosticos', header: 'Salivação Excessiva', transform: (value) => value?.salivacaoExcessiva?.valor === 'S' ? 'Sim' : value?.salivacaoExcessiva?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Salivação Excessiva Obs', transform: (value) => value?.salivacaoExcessiva?.observacao || '' },
    { source: 'diagnosticos', header: 'Desordens Digestivas', transform: (value) => value?.desordensDigestivas?.valor === 'S' ? 'Sim' : value?.desordensDigestivas?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Desordens Digestivas Obs', transform: (value) => value?.desordensDigestivas?.observacao || '' },
    { source: 'diagnosticos', header: 'Medicamentos Recentes', transform: (value) => value?.medicamentosRecentes?.valor === 'S' ? 'Sim' : value?.medicamentosRecentes?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Medicamentos Recentes Obs', transform: (value) => value?.medicamentosRecentes?.observacao || '' },
    { source: 'diagnosticos', header: 'Incoordenação/Tremores', transform: (value) => value?.incoordenacaoTremores?.valor === 'S' ? 'Sim' : value?.incoordenacaoTremores?.valor === 'N' ? 'Não' : '' },
    { source: 'diagnosticos', header: 'Incoordenação/Tremores Obs', transform: (value) => value?.incoordenacaoTremores?.observacao || '' }
  ]
}

export const OPERACOES_MAQUINAS_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_operacoes_maquinas',
  sheetName: 'Operações de Máquinas',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'veiculo_trator', header: 'Veículo/Trator' },
    { source: 'implemento_utilizado', header: 'Implemento Utilizado', transform: (value) => value || '' },
    { source: 'hora_inicial', header: 'Hora Inicial' },
    { source: 'hora_final', header: 'Hora Final' },
    { source: 'odometro_horimetro_inicial', header: 'Odômetro/Horímetro Inicial' },
    { source: 'odometro_horimetro_final', header: 'Odômetro/Horímetro Final' },
    { source: 'total_odometro_horimetro', header: 'Total Odômetro/Horímetro' },
    { source: 'tipo_operacao', header: 'Tipo de Operação' },
    { source: 'aplicacoes', header: 'Aplicações', transform: (value) => {
      if (!Array.isArray(value)) return ''
      return value.map((a: any) => {
        const insumo = a.insumo_aplicado || a.produto_aplicado || '-'
        const qtd = a.quantidade_total_aplicada || '-'
        const area = a.area_trabalhada || '-'
        const dose = a.dose_aplicada || '-'
        return `${insumo} (${qtd}, área ${area}, dose ${dose})`
      }).join(' | ')
    }},
    { source: 'checklist', header: 'Meta Diária Batida', transform: (value) => value?.meta_diaria_batida?.valor === 'S' ? 'Sim' : value?.meta_diaria_batida?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Meta Diária Batida Obs', transform: (value) => value?.meta_diaria_batida?.observacao || '' },
    { source: 'checklist', header: 'Algum Imprevisto', transform: (value) => value?.algum_imprevisto?.valor === 'S' ? 'Sim' : value?.algum_imprevisto?.valor === 'N' ? 'Não' : '' },
    { source: 'checklist', header: 'Algum Imprevisto Obs', transform: (value) => value?.algum_imprevisto?.observacao || '' },
    { source: 'observacao', header: 'Observação' }
  ]
}

export const SUPLEMENTACAO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_suplementacao',
  sheetName: 'Suplementação',
  columns: [
    { source: 'data', header: 'Data Atual', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'data_anterior', header: 'Data Anterior', format: 'date' },
    { source: 'intervalo_dias', header: 'Intervalo (dias)', format: 'number' },
    { source: 'data_proximo', header: 'Trato Seguinte', format: 'date' },
    { source: 'intervalo_ate_proximo_dias', header: 'Intervalo até seguinte (dias)', format: 'number' },
    { source: 'tratador', header: 'Tratador' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'formulacao', header: 'Formulação' },
    { source: 'leitura', header: 'Leitura', format: 'number' },
    { source: 'kg_cocho', header: 'Kg Cocho', format: 'number' },
    { source: 'total_acumulado_lote', header: 'Acumulado Lote (kg)', format: 'number' },
    { source: 'kg_deposito', header: 'Kg Depósito', format: 'number' },
    { source: 'n_cabecas', header: 'Nº Cabeças', format: 'number' },
    { source: 'peso_vivo_kg', header: 'Peso Vivo (kg)', format: 'number' },
    { source: 'categorias', header: 'Categorias' },
    { source: 'escore_fezes', header: 'Escore Fezes' },
    { source: 'consumo_medio_geral_kg_mn', header: 'Consumo (Kg MN/cab/dia)', format: 'number' },
    { source: 'consumo_medio_30dias_kg_mn', header: 'Consumo 30d (Kg MN/cab/dia)', format: 'number' },
    { source: 'consumo_medio_geral_kg_ms', header: 'Consumo (Kg MS/cab/dia)', format: 'number' },
    { source: 'consumo_medio_30dias_kg_ms', header: 'Consumo 30d (Kg MS/cab/dia)', format: 'number' },
    { source: 'consumo_medio_geral_percent_pv', header: 'Consumo (% PV)', format: 'number' },
    { source: 'consumo_medio_30dias_percent_pv', header: 'Consumo 30d (% PV)', format: 'number' },
    { source: 'custo_medio_reais_cab_dia', header: 'Custo (R$/cab/dia)', format: 'number' }
  ]
}

export const RODEIO_EXPORT_CONFIG: TableExportConfig = {
  tableName: 'registros_rodeio',
  sheetName: 'Rodeio',
  columns: [
    { source: 'data', header: 'Data', format: 'date' },
    { source: 'nome_usuario', header: 'Usuário' },
    { source: 'pasto', header: 'Pasto' },
    { source: 'lote', header: 'Lote' },
    { source: 'vaca', header: 'Vaca', format: 'number' },
    { source: 'touro', header: 'Touro', format: 'number' },
    { source: 'bezerro', header: 'Bezerro', format: 'number' },
    { source: 'boi', header: 'Boi', format: 'number' },
    { source: 'garrote', header: 'Garrote', format: 'number' },
    { source: 'novilha', header: 'Novilha', format: 'number' },
    { source: 'total_cabecas', header: 'Total Cabeças', format: 'number' },
    { source: 'escore_gado', header: 'Escore Gado', format: 'number' },
    { source: 'escore_fezes', header: 'Escore Fezes', format: 'number' },
    { source: 'equipe', header: 'Equipe (nº pessoas)', format: 'number' },
    { source: 'gado_contado', header: 'Gado Contado' },
    { source: 'diagnosticos', header: 'Animal Morto', transform: (value) => value?.animalMorto?.valor || '' },
    { source: 'diagnosticos', header: 'Animal Morto Obs', transform: (value) => value?.animalMorto?.observacao || '' },
    { source: 'diagnosticos', header: 'Bebedouros/Cochos', transform: (value) => value?.bebedourosCochos?.valor || '' },
    { source: 'diagnosticos', header: 'Bebedouros/Cochos Obs', transform: (value) => value?.bebedourosCochos?.observacao || '' },
    { source: 'diagnosticos', header: 'Carrapatos/Moscas', transform: (value) => value?.carrapatosMoscas?.valor || '' },
    { source: 'diagnosticos', header: 'Carrapatos/Moscas Obs', transform: (value) => value?.carrapatosMoscas?.observacao || '' },
    { source: 'diagnosticos', header: 'Animais Entreverados', transform: (value) => value?.animaisEntreverados?.valor || '' },
    { source: 'diagnosticos', header: 'Animais Entreverados Obs', transform: (value) => value?.animaisEntreverados?.observacao || '' },
    { source: 'diagnosticos', header: 'Pastagens Taxa Lotação Adequada', transform: (value) => value?.pastagensTaxaLotacao?.valor || '' },
    { source: 'diagnosticos', header: 'Pastagens Taxa Lotação Adequada Obs', transform: (value) => value?.pastagensTaxaLotacao?.observacao || '' },
    { source: 'diagnosticos', header: 'Cercas/Cochos/Porteiras', transform: (value) => value?.cercasCochosPorteiras?.valor || '' },
    { source: 'diagnosticos', header: 'Cercas/Cochos/Porteiras Obs', transform: (value) => value?.cercasCochosPorteiras?.observacao || '' },
    { source: 'diagnosticos', header: 'Animais Machucados/Doentes', transform: (value) => value?.animaisMachucadosDoentesBichados?.valor || '' },
    { source: 'diagnosticos', header: 'Animais Machucados/Doentes Obs', transform: (value) => value?.animaisMachucadosDoentesBichados?.observacao || '' },
    { source: 'equipe_nomes', header: 'Equipe Nomes', transform: (value) => Array.isArray(value) ? value.join(', ') : value }
  ]
}
