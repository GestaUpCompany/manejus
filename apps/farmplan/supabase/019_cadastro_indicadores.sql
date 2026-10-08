-- =====================================================================
-- FARM PLAN · 019 · Cadastro de Indicadores
-- Cada indicador ganha: Grupo, Como Calcular e Responsável.
-- "ativo" passa a significar "Mostrar no Painel de Bordo".
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table indicadores add column if not exists grupo          text;
alter table indicadores add column if not exists descricao      text;
alter table indicadores add column if not exists responsavel_id uuid references pessoas(id) on delete set null;

-- Grupo e "Como Calcular" dos 12 indicadores padrão (só onde ainda está vazio)
update indicadores i set grupo = coalesce(i.grupo, v.grupo), descricao = coalesce(i.descricao, v.descricao)
from (values
  ('Taxa de Lotação da Fazenda',        'Pastagem',  'UA Médias do Mês ÷ Área de Pastagem (ha)'),
  ('Escore de Desempenho da Equipe',    'Equipe',    'Calculado pelo Sistema: Média das Notas da Avaliação Semanal no Mês'),
  ('Atividades Concluídas',             'Equipe',    'Calculado pelo Sistema: Semanas Concluídas ÷ Semanas Planejadas no Mês'),
  ('Custo Operacional',                 'Financeiro','Custo Operacional do Mês ÷ Cabeças Médias ÷ Dias do Mês'),
  ('GMD Peso Vivo · Recria',            'Rebanho',   'Ganho de Peso dos Lotes de Recria ÷ Cabeças ÷ Dias'),
  ('GMD Peso Vivo · Cria',              'Rebanho',   'Ganho de Peso dos Bezerros ÷ Cabeças ÷ Dias'),
  ('Eficiência Biológica na Engorda',   'Confinamento','kg de Matéria Seca Consumida ÷ @ Produzidas'),
  ('Espera para Processamento do Gado', 'Manejo',    'Dias Entre a Chegada do Gado e o Processamento'),
  ('Tempo de Processamento',            'Manejo',    'Minutos do Manejo ÷ Cabeças Processadas'),
  ('Manutenção de Máquinas',            'Máquinas',  'Gasto com Manutenção no Mês ÷ Valor das Máquinas × 100'),
  ('Faltas de Colaboradores',           'Equipe',    'Número de Faltas no Mês'),
  ('Mortalidade',                       'Rebanho',   'Cabeças Mortas no Mês')
) as v(nome, grupo, descricao)
where lower(i.nome) = lower(v.nome);

select 'Cadastro de indicadores pronto' as resultado;
