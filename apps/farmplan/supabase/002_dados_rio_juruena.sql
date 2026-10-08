-- =====================================================================
-- FARM PLAN · Gesta'Up
-- 002 · Dados da Fazenda Rio Juruena (Semana 1, dia 1)
-- Origem: planilha "Farm Plan - Faz. Rio Juruena - GestaUp 2026"
-- 24 pessoas · setores · 4 equipes · 173 atividades · planejamento 2026
--
-- Rode UMA vez só. Se rodar de novo, ele avisa e não duplica nada.
-- =====================================================================

-- Duas colunas novas, úteis para importar planilhas:
alter table pessoas    add column if not exists setor_id uuid references setores(id);
alter table atividades add column if not exists codigo_planilha int;   -- nº da linha na planilha

do $$
declare
  fz uuid;
begin
  select id into fz from fazendas where nome = 'Fazenda Rio Juruena';
  if fz is null then raise exception 'Fazenda Rio Juruena não encontrada'; end if;
  if exists (select 1 from atividades where fazenda_id = fz) then
    raise exception 'Os dados da Rio Juruena já foram carregados. Nada foi alterado.';
  end if;

  -- 1. PESSOAS
  insert into pessoas (fazenda_id, apelido, nome, cargo) values
    (fz, 'Agnaldo', 'Agnaldo Barros da Silva', 'Líder de Máquinas'),
    (fz, 'Alessandro', 'Alessandro de Oliveira', 'Líder de Gado'),
    (fz, 'Daniel', 'Daniel da Silva Liberato', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Diego', 'Diego Ferreira de Lima', 'Operador de Máquinas I'),
    (fz, 'Dircilei', 'Dircilei Jumes Martendal', 'Assistente ADM'),
    (fz, 'Edivaldo', 'Edivaldo Ferreira Cesareto da Silva', 'Tratador'),
    (fz, 'Evilazio', 'Evilazio Martins Pereira', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Genilson', 'Genilson Ferreira Cesareto', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Jhennifer', 'Jhennifer Rayssa da Silva', 'Assistente ADM'),
    (fz, 'Jhony Max', 'Jhony Max Carvalho dos Santos', 'Líder de Gado'),
    (fz, 'José Lúcio', 'José Lúcio de Oliveira', 'Trabalhador Agropecuário I (Limpeza)'),
    (fz, 'José Maurício', 'José Maurício da Silva Liberato', 'Operador de Máquinas I'),
    (fz, 'Maicon', 'Maicon Douglas Zerbielli de Oliveira', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Maria Helena', 'Maria Helena da Silva de Oliveira', 'Cozinheira/Faxineira'),
    (fz, 'Mariany', 'Mariany Carvalho Botelho', 'Controller'),
    (fz, 'Mickael', 'Mickael Monteiro', 'Diretor'),
    (fz, 'Odirlei', 'Odirlei José Martendal', 'Gerente Geral'),
    (fz, 'Pedro Antônio', 'Pedro Antonio Jumes Martendal', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Pedro Lopes', 'Pedro Lopes dos Santos', 'Trabalhador Agropecuário Geral II'),
    (fz, 'Saylon', 'Saylon Souza Gonçalves', 'Técnico'),
    (fz, 'Vanessa', 'Vanessa Matilde da Silva', 'Administrativo'),
    (fz, 'Wesley', 'Wesley de Andrade da Silva', null),
    (fz, 'Peterson', 'Peterson de Oliveira Sanches Moreira', null),
    (fz, 'Eliezer', 'Eliezer Wendler de Carvalho', null);
  -- quem responde a quem (organograma)
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Agnaldo';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Alessandro';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Daniel';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Diego';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Mickael') where fazenda_id=fz and apelido='Dircilei';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Edivaldo';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Evilazio';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Genilson';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Vanessa') where fazenda_id=fz and apelido='Jhennifer';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Jhony Max';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='José Lúcio';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='José Maurício';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Agnaldo') where fazenda_id=fz and apelido='Maicon';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Mariany') where fazenda_id=fz and apelido='Maria Helena';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Mariany';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Mickael') where fazenda_id=fz and apelido='Odirlei';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Pedro Antônio';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Pedro Lopes';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Odirlei') where fazenda_id=fz and apelido='Saylon';
  update pessoas set superior_id = (select id from pessoas where fazenda_id=fz and apelido='Mickael') where fazenda_id=fz and apelido='Vanessa';

  -- 2. SETORES (e o dono de cada um)
  insert into setores (fazenda_id, nome, dono_id) values
    (fz, 'Administrativo', (select id from pessoas where fazenda_id=fz and apelido='Vanessa')),
    (fz, 'Controller', (select id from pessoas where fazenda_id=fz and apelido='Mariany')),
    (fz, 'Diretoria', (select id from pessoas where fazenda_id=fz and apelido='Mickael')),
    (fz, 'Gado', (select id from pessoas where fazenda_id=fz and apelido='Saylon')),
    (fz, 'Geral', (select id from pessoas where fazenda_id=fz and apelido='Odirlei')),
    (fz, 'Gerência', (select id from pessoas where fazenda_id=fz and apelido='Odirlei')),
    (fz, 'Máquinas', (select id from pessoas where fazenda_id=fz and apelido='Agnaldo')),
    (fz, 'Operacional', (select id from pessoas where fazenda_id=fz and apelido='Agnaldo')),
    (fz, 'RH', (select id from pessoas where fazenda_id=fz and apelido='Dircilei')),
    (fz, 'Técnico', (select id from pessoas where fazenda_id=fz and apelido='Saylon')),
    (fz, 'Terceirizado', (select id from pessoas where fazenda_id=fz and apelido='Odirlei')),
    (fz, 'Gerencial', null),
    (fz, 'Fábrica de Ração', null);
  -- setor de cada pessoa
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Máquinas') where fazenda_id=fz and apelido='Agnaldo';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Gado') where fazenda_id=fz and apelido='Alessandro';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='Daniel';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Máquinas') where fazenda_id=fz and apelido='Diego';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='RH') where fazenda_id=fz and apelido='Dircilei';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Máquinas') where fazenda_id=fz and apelido='Edivaldo';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='Evilazio';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='Genilson';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Administrativo') where fazenda_id=fz and apelido='Jhennifer';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Gado') where fazenda_id=fz and apelido='Jhony Max';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='José Lúcio';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Máquinas') where fazenda_id=fz and apelido='José Maurício';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='Maicon';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Geral') where fazenda_id=fz and apelido='Maria Helena';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Controller') where fazenda_id=fz and apelido='Mariany';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Diretoria') where fazenda_id=fz and apelido='Mickael';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Diretoria') where fazenda_id=fz and apelido='Odirlei';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Geral') where fazenda_id=fz and apelido='Pedro Antônio';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Operacional') where fazenda_id=fz and apelido='Pedro Lopes';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Técnico') where fazenda_id=fz and apelido='Saylon';
  update pessoas set setor_id = (select id from setores where fazenda_id=fz and nome='Administrativo') where fazenda_id=fz and apelido='Vanessa';

  -- 3. EQUIPES, líderes e membros
  insert into equipes (fazenda_id, nome, lider_id) values
    (fz, 'Equipe Máquinas', (select id from pessoas where fazenda_id=fz and apelido='Agnaldo')),
    (fz, 'Equipe Gado', (select id from pessoas where fazenda_id=fz and apelido='Alessandro')),
    (fz, 'Alojados', null),
    (fz, 'Terceirizado', null);
  insert into equipe_membros (equipe_id, pessoa_id)
  select e.id, p.id from (values
    ('Equipe Máquinas', 'Agnaldo'),
    ('Equipe Máquinas', 'Diego'),
    ('Equipe Máquinas', 'José Maurício'),
    ('Equipe Máquinas', 'José Lúcio'),
    ('Equipe Gado', 'Alessandro'),
    ('Equipe Gado', 'Jhony Max'),
    ('Equipe Gado', 'Saylon'),
    ('Alojados', 'Evilazio'),
    ('Alojados', 'Genilson'),
    ('Alojados', 'Maicon'),
    ('Alojados', 'Pedro Lopes')
  ) as m(equipe, pessoa)
  join equipes e on e.fazenda_id=fz and e.nome=m.equipe
  join pessoas p on p.fazenda_id=fz and p.apelido=m.pessoa;

  -- 4. ATIVIDADES (biblioteca do plano anual)
  insert into atividades (fazenda_id, codigo_planilha, nome, setor_id, tipo, urgencia, coordenador_id, executor_pessoa_id, executor_equipe_id, local, dias, como_fazer)
  select fz, a.cod, a.nome,
         (select id from setores where fazenda_id=fz and nome=a.setor),
         a.tipo, a.urg,
         (select id from pessoas where fazenda_id=fz and apelido=a.coord),
         (select id from pessoas where fazenda_id=fz and apelido=a.quem),
         (select id from equipes where fazenda_id=fz and nome=a.quem),
         a.local, a.dias::boolean[], a.cmf::jsonb
  from (values
    (1, 'Leitura de cocho', 'Gado', '1 - Rotina', 3, 'Mariany', 'José Maurício', 'Todos as praças AF', '{true,true,true,true,true,true,true}', null),
    (2, 'Bebedouros - Limpeza', 'Gado', '1 - Rotina', 1, 'Agnaldo', 'Evilazio', 'Todos os bebedouros', '{true,false,true,false,true,false,false}', null),
    (3, 'Bebedouros - Instalação /Manutenção', 'Operacional', '1 - Rotina', 2, 'Agnaldo', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (4, 'Cerca - Aceiro (gradagem) /(herbicida)', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Daniel', null, '{true,false,false,false,false,false,false}', null),
    (5, 'Cerca - Construção', 'Gado', '4 - Estruturação', 1, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (6, 'Cerca - Desmanchar', 'Gado', '4 - Estruturação', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (7, 'Cerca - Manutenção', 'Gado', '2 - Estratégica', 2, 'Agnaldo', 'Equipe Gado', 'Cerca Tip2', '{false,false,true,false,false,false,false}', null),
    (8, 'Cerca - Tirar Madeiras', 'Terceirizado', '4 - Estruturação', 3, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (9, 'Cerca Elétrica - Aceiro / Manutenção', 'Gado', '4 - Estruturação', 3, 'Odirlei', 'Equipe Máquinas', 'Aceiro na Tip2', '{false,false,true,false,false,false,false}', null),
    (10, 'Cerca Elétrica - Instalação do Aparelho de Choque', 'Operacional', '4 - Estruturação', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (11, 'Cerca Elétrica - Construção', 'Gado', '4 - Estruturação', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (12, 'Cerca Elétrica - Placa Solar', 'Máquinas', '4 - Estruturação', 3, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (13, 'Cerca Elétrica - Revisão do Choque', 'Geral', '1 - Rotina', 3, 'Odirlei', 'Agnaldo', 'Cercas AF', '{true,false,false,false,false,false,false}', null),
    (14, 'Cocho - Cascalhamento', 'Gado', '2 - Estratégica', 2, 'Agnaldo', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (15, 'Cocho - Construção e Montagem', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (16, 'Cocho - Manutenção /Limpeza', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Genilson', 'Limpeza sequestro', '{true,true,true,true,true,true,false}', null),
    (17, 'Confinamento - Tratar dos Animais', 'Gado', '1 - Rotina', 1, 'Mariany', 'Edivaldo', 'Todos os Lotes de Rip e Confinamento', '{true,true,true,true,true,true,true}', null),
    (18, 'Curral / Baia - Limpeza', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (19, 'Curral - Manutenção', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (20, 'Serviço com Esteira', 'Operacional', '4 - Estruturação', 2, 'Agnaldo', 'José Maurício', null, '{true,false,false,false,false,false,false}', null),
    (21, 'Alojamento - Limpeza - Manutenção', 'Geral', '1 - Rotina', 2, 'Dircilei', 'Alojados', 'Alojamentos RJ(limpeza)', '{false,false,false,true,false,false,false}', null),
    (22, 'Curral - Manutenção Remangas', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (23, 'Curral - Manutenção Tronco de Contenção', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Agnaldo', null, '{true,false,false,false,false,false,false}', null),
    (24, 'Curral - Montagem de Remangas', 'Terceirizado', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (25, 'Curral - Terraplanagem', 'Máquinas', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (26, 'Depósito de Defensivos - Construção', 'Terceirizado', '5 - Projeto', 1, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (27, 'Depósito de Defensivos - Limpeza e organização', 'Gerencial', '5 - Projeto', 2, 'Dircilei', 'Evilazio', null, '{true,false,false,false,false,false,false}', null),
    (28, 'Erosão - Contenção', 'Máquinas', '2 - Estratégica', 1, 'Agnaldo', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (29, 'Estrada - Construção', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (30, 'Estrada - Manutenção', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (31, 'Fábrica - Limpeza', 'Operacional', '1 - Rotina', 2, 'Dircilei', 'Evilazio', 'Fabrica AF', '{false,false,false,true,false,false,false}', null),
    (32, 'Gado - Abate (cantina/funcionários)', 'Geral', '2 - Estratégica', 3, 'Dircilei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (33, 'Gado - Apartação', 'Gerencial', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (34, 'Gado - Auditoria do Rebanho', 'Gado', '2 - Estratégica', 1, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (35, 'Gado - Combate de Carrapatos', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (36, 'Gado - Combate Mosca - do - chifres', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (37, 'Gado - Compra de Animais', 'Gerencial', '2 - Estratégica', 2, 'Odirlei', 'Odirlei', null, '{true,false,false,false,false,false,false}', null),
    (38, 'Gado - Embarque', 'Administrativo', '2 - Estratégica', 1, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (39, 'Gado - Evolução do Rebanho/Indea', 'Gerencial', '2 - Estratégica', 1, 'Odirlei', 'Mariany', null, '{true,false,false,false,false,false,false}', null),
    (40, 'Gado - Identificação dos Animais', 'Administrativo', '2 - Estratégica', 1, 'Jhony Max', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (41, 'Gado - Pesagem', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (42, 'Gado - Rodeio nos Lotes', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Gado', 'Todos os Lotes AF e RJ', '{false,true,true,true,true,false,false}', null),
    (43, 'Gado - Suplementação - Distribuição', 'Gado', '2 - Estratégica', 2, 'Mariany', 'Genilson', null, '{true,false,false,false,false,false,false}', null),
    (44, 'Gado - Suplementação Fornecimento', 'Máquinas', '1 - Rotina', 1, 'Mariany', 'Edivaldo', null, '{true,false,false,false,false,false,false}', null),
    (45, 'Gado - Tirar Nota e GTA', 'Gerencial', '2 - Estratégica', 1, null, null, null, '{true,false,false,false,false,false,false}', null),
    (46, 'Gado - Vacinação Brucelose', 'Gado', '2 - Estratégica', 1, 'Odirlei', 'Alessandro', null, '{true,false,false,false,false,false,false}', null),
    (47, 'Gado - Vacinação Carbunculo', 'Gado', '2 - Estratégica', 1, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (48, 'Gado - Vacinação Raiva', 'Gado', '2 - Estratégica', 1, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (49, 'Gado - Vermifugação', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (50, 'Gestão - Manejus Implantação', 'Gerencial', '1 - Rotina', 1, 'Mickael', 'Mariany', null, '{true,false,false,false,false,false,false}', null),
    (51, 'Gestão - Pluviometro - Ler e Anotar', 'Administrativo', '1 - Rotina', 3, 'Mariany', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (52, 'Gestão - Reunião Mensal - 1 hora', 'Gerencial', '1 - Rotina', 2, 'Odirlei', 'Odirlei', null, '{true,false,false,false,false,false,false}', null),
    (53, 'Gestão - Reunião Semanal - 20 min', 'Gerencial', '1 - Rotina', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (54, 'Herbicidas - Devolução de Embalagens', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (55, 'Implementos - Organização/ Manutenção', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', 'Carreta Drone T50 lixando p/reforma', '{true,true,true,true,true,false,false}', null),
    (56, 'Lava Jato e Rampa - Construção', 'Terceirizado', '5 - Projeto', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (57, 'Máquinas - Limpeza', 'Máquinas', '2 - Estratégica', 3, 'Agnaldo', 'Equipe Máquinas', 'Lavador', '{true,false,false,false,false,true,false}', null),
    (58, 'Máquinas - Manutenção', 'Máquinas', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', 'Radiador do Trator esteira retirado', '{false,false,false,false,true,false,false}', null),
    (59, 'Máquinas - Revisão', 'Máquinas', '2 - Estratégica', 1, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (60, 'Oficina - Limpeza', 'Máquinas', '2 - Estratégica', 3, 'Agnaldo', 'Evilazio', 'Oficina AF', '{false,false,false,false,false,true,false}', null),
    (61, 'Oficina - Organização', 'Máquinas', '2 - Estratégica', 3, 'Agnaldo', 'Equipe Máquinas', 'Oficina AF', '{true,true,true,true,true,true,false}', null),
    (62, 'Pasto - Adubação', 'Máquinas', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (63, 'Pasto - Calagem', 'Operacional', '2 - Estratégica', 3, 'Odirlei', 'Daniel', 'Pasto D.128 e A7.1', '{true,true,true,true,true,false,false}', null),
    (64, 'Pasto - Combate Cupim', 'Máquinas', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (65, 'Pasto - Combate Formigas', 'Máquinas', '2 - Estratégica', 3, null, null, null, '{true,false,false,false,false,false,false}', null),
    (66, 'Pasto - Comprar Sementes de Pastagens', 'Gerencial', '2 - Estratégica', 3, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (67, 'Pasto - Construção de Remangas', 'Operacional', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (68, 'Pasto - Curva de Nível', 'Máquinas', '2 - Estratégica', 3, null, null, null, '{true,false,false,false,false,false,false}', null),
    (69, 'Pasto - Gradagem de Pastagem', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'José Maurício', 'A7.2', '{false,false,false,true,true,true,false}', null),
    (70, 'Pasto - Herbicida - Aplicação Basal', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (71, 'Pasto - Herbicida - Aplicação Foliar', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'José Maurício', null, '{true,false,false,false,false,false,false}', null),
    (72, 'Pasto - Herbicida - Cotação/Compra', 'Gerencial', '2 - Estratégica', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (73, 'Pasto - Herbicida - Revisão Pulverizador', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (74, 'Pasto - Herbicida - Drone', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Pedro Antônio', null, '{true,false,false,false,false,false,false}', null),
    (75, 'Pasto - Inseticida - Aplicação Cigarrinhas', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Pedro Antônio', null, '{true,false,false,false,false,false,false}', null),
    (76, 'Pasto - Inseticida - Aplicação Lagartas', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Pedro Antônio', null, '{true,false,false,false,false,false,false}', null),
    (77, 'Pasto - Limpeza (Ossos, Lascas, Galhos,Pedras,Arame)', 'Geral', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (78, 'Serviços - Com Pá Carregadeira', 'Máquinas', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', 'Fabrica AF(silo)', '{true,true,true,true,true,true,true}', null),
    (79, 'Porteira - Construção', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (80, 'Porteira - Manutenção', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (81, 'Pasto - Manutenção de Remangas', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (82, 'Pasto - Manutenção de Represas', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Diego', null, '{true,false,false,false,false,false,false}', null),
    (83, 'Pasto - Roçada de Pastos', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Maicon', 'A2.1 ,A6.2', '{true,true,true,true,true,false,false}', null),
    (84, 'Poço Artesiano - Construção', 'Terceirizado', '5 - Projeto', 2, null, null, null, '{true,false,false,false,false,false,false}', null),
    (85, 'Poço Artesiano - Manutenção', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (86, 'Pasto - Plantio Lavoura / Silo / Capim', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (87, 'Pasto - Manejo de Pastagens', 'Gado', '2 - Estratégica', 1, 'Mariany', 'Equipe Gado', 'Escritório RJ', '{true,true,true,true,true,true,false}', null),
    (88, 'Porteiras - Instalação', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (89, 'Posto de Abastecimento - Construção / Manutenção', 'Terceirizado', '5 - Projeto', 2, 'Odirlei', 'Agnaldo', null, '{true,false,false,false,false,false,false}', null),
    (90, 'Produzir Ração_ Suplemento', 'Operacional', '1 - Rotina', 1, 'Mariany', 'Edivaldo', 'Fabrica AF', '{true,true,true,true,true,true,true}', null),
    (91, 'Rede Hidráulica - Cotação', 'Administrativo', '5 - Projeto', 2, null, null, null, '{true,false,false,false,false,false,false}', null),
    (92, 'Rede Hidraulica - Manutenção - Instalação', 'Operacional', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', 'Troca do conversor da bomba ,C14', '{false,true,false,true,false,false,false}', null),
    (93, 'Reservatório - Cerca e Gramado', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Evilazio', null, '{true,false,false,false,false,false,false}', null),
    (94, 'Reservatório - Construção', 'Terceirizado', '5 - Projeto', 1, null, null, null, '{true,false,false,false,false,false,false}', null),
    (95, 'Reservatório - Manutenção /Limpeza', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (96, 'Reservatório - Monitoramento do Nível', 'Gerencial', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', 'Reservatório AF', '{true,true,true,true,true,true,true}', null),
    (97, 'Sede - Adubação das Mudas', 'Administrativo', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (98, 'Sede - Galinheiro', 'Operacional', '2 - Estratégica', 2, 'Dircilei', 'Pedro Lopes', 'Galinheiro', '{true,true,true,true,true,true,false}', null),
    (99, 'Sede - Herbicidas / inseticida', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Pedro Lopes', null, '{true,false,false,false,false,false,false}', null),
    (100, 'Sede - Horta', 'Operacional', '1 - Rotina', 2, 'Dircilei', 'Pedro Lopes', 'Horta', '{true,true,true,true,true,true,false}', null),
    (101, 'Sede - Limpeza do Terreiro (Herbicidas)', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (102, 'Sede - Limpeza Placa Solar', 'Administrativo', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (103, 'Sede - Lixo - Recolhimento', 'Operacional', '1 - Rotina', 2, 'Dircilei', 'Maicon', 'Casinha das Lixeiras AF e RJ', '{false,false,false,false,false,true,false}', null),
    (104, 'Sede - Mandiocal', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'José Lúcio', null, '{true,false,false,false,false,false,false}', null),
    (105, 'Sede - Manutenção Casas', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (106, 'Sede - Plantio de Mudas', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'José Maurício', null, '{true,false,false,false,false,false,false}', null),
    (107, 'Sede - Poda de Arvores e Mudas', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'José Lúcio', null, '{true,false,false,false,false,false,false}', null),
    (108, 'Sede - Roçar a Grama', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'José Maurício', null, '{true,false,false,false,false,false,false}', null),
    (109, 'Tanques/Lagoas de Decantação - Construção', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (110, 'Tecnologia - Instalação de Câmeras/Manutenção', 'Gerencial', '4 - Estruturação', 2, 'Dircilei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (111, 'Tecnologia - Internet - Starlynk', 'Terceirizado', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (112, 'Tropa - Casqueamento', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (113, 'Tropa - Combate de Carrapatos', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (114, 'Tropa - Doma', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (115, 'Tropa - Tosa', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (116, 'Tropa - Trato Ração', 'Gado', '1 - Rotina', 2, 'Mariany', 'Equipe Gado', 'Tropa AF e RJ', '{true,true,true,true,true,true,false}', null),
    (117, 'Tropa_Vermifugação e Vacinação', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Equipe Gado', null, '{true,false,false,false,false,false,false}', null),
    (118, 'Vagão - Limpeza', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Edivaldo', null, '{true,false,false,false,false,false,false}', null),
    (119, 'Vagão - Manutenção', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Edivaldo', 'Pneu do vagão', '{false,false,false,true,false,false,false}', null),
    (120, 'Veículos - Limpeza', 'Gerencial', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', 'Lavador', '{false,false,false,false,false,true,false}', null),
    (121, 'Veículos - Manutenção', 'Terceirizado', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', 'amarok', '{true,true,true,true,true,true,false}', null),
    (122, 'Veículos - Revisão', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (123, 'Volumoso - Adubação', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'José Maurício', null, '{true,false,false,false,false,false,false}', null),
    (124, 'Volumoso - Controle de Formigas', 'Máquinas', '2 - Estratégica', 2, null, null, null, '{true,false,false,false,false,false,false}', null),
    (125, 'Volumoso - Cotação e Contratação Máquina', 'Gerencial', '2 - Estratégica', 2, null, null, null, '{true,false,false,false,false,false,false}', null),
    (126, 'Volumoso - Ensilagem', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (127, 'Volumoso - Herbicidas', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', null, null, '{true,false,false,false,false,false,false}', null),
    (128, 'Volumoso - Pastejo', 'Gado', '2 - Estratégica', 2, null, null, null, '{true,false,false,false,false,false,false}', null),
    (129, 'Volumoso - Roçadeira', 'Máquinas', '2 - Estratégica', 2, 'Odirlei', null, null, '{true,false,false,false,false,false,false}', null),
    (130, 'Milho - Colheita', 'Máquinas', '2 - Estratégica', 1, null, null, null, '{true,false,false,false,false,false,false}', null),
    (131, 'Sede - Barracão', 'Operacional', '2 - Estratégica', 3, 'Odirlei', 'Evilazio', 'Garagem RJ', '{false,false,false,false,false,true,false}', null),
    (132, 'Sede - Pomar', 'Operacional', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (133, 'Represa - Manutenção', 'Máquinas', '2 - Estratégica', 3, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (134, 'Rede hidráulica - Silo', 'Máquinas', '4 - Estruturação', 1, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (135, 'Silo - Cerca / cobrir monte / Manutenção', 'Operacional', '4 - Estruturação', 1, 'Odirlei', 'Equipe Máquinas', 'Manutenção lona do silo (vento rasgou)', '{true,true,false,false,false,false,false}', null),
    (136, 'Almoxarifado - Organização', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (137, 'Adubo - Cotar e Comprar Safra 24/25', 'Administrativo', '2 - Estratégica', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (138, 'Confinamento - Molhar Curral (pipa)', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Maicon', null, '{true,false,false,false,false,false,false}', null),
    (139, 'Pastos - Aterro', 'Máquinas', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (140, 'Reunião Geral', 'Administrativo', '3 - Gestão', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (141, 'Compra da bomba para abastecimento (Rondônia)', 'Operacional', '4 - Estruturação', 1, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (142, 'Lixão - limpeza', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (143, 'Pasto - Cotação Calcário', 'Administrativo', '4 - Estruturação', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (144, 'Instalação de Mata-burro', null, '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (145, 'Carneiros - limpeza casinha - bebedouro', 'Geral', '4 - Estruturação', 2, 'Odirlei', 'Pedro Lopes', 'Casinha dos Carneiros', '{false,false,false,true,false,false,false}', null),
    (146, 'Ampliação do Barracão Água Fria', 'Fábrica de Ração', '2 - Estratégica', 2, 'Mickael', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (147, 'Tropa Castração', 'Gado', '2 - Estratégica', 2, 'Odirlei', 'Jhony Max', null, '{true,false,false,false,false,false,false}', null),
    (148, 'Barracão Organização', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Evilazio', 'Barracão AF', '{true,true,true,true,true,true,false}', null),
    (149, 'Construção Hangar', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (150, 'Aplicação de Herbicidas Navalhão', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (151, 'Recebimento Diesel / Gasolina', 'Administrativo', '2 - Estratégica', 1, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (152, 'Limpeza Bambuzal', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Daniel', null, '{true,false,false,false,false,false,false}', null),
    (153, 'Limpeza Pátio Água Fria /Rio Juruena', 'Operacional', '2 - Estratégica', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (154, 'Despachar - Carnes / e outros (Cuiabá)', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (155, 'Gestao Gerente de Pasto', 'Gado', '3 - Gestão', 2, 'Odirlei', 'Equipe Gado', 'Escritório RJ', '{true,true,false,false,false,false,false}', null),
    (156, 'Construção de baia / Silo', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (157, 'Auditoria - conferência de estoque medicamentos', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null),
    (158, 'Cotação de Sementes', 'Operacional', '4 - Estruturação', 2, 'Mickael', 'Odirlei', null, '{true,false,false,false,false,false,false}', null),
    (159, 'Transportar Madeiras para o pátio', 'Máquinas', '2 - Estratégica', 2, 'Agnaldo', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (160, 'Serviços com PC', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (161, 'Construção - Manutenção/ de praça alimentação(Tip)', 'Operacional', '4 - Estruturação', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (162, 'Compra Para Cantina', 'Administrativo', '1 - Rotina', 1, 'Dircilei', 'Dircilei', null, '{true,false,false,false,false,false,false}', null),
    (163, 'Compra Funcionários', 'Operacional', '2 - Estratégica', 2, 'Odirlei', null, null, '{true,false,false,false,false,false,false}', null),
    (164, 'Sede - Limpeza de Pátio', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (165, 'Fábrica - DDG - Torta', 'Operacional', '2 - Estratégica', 1, 'Odirlei', 'Terceirizado', 'DDG GC', '{false,false,false,true,false,false,false}', null),
    (166, 'Fábrica - Ureia - Núcleo - Sal Branco', 'Gado', '2 - Estratégica', 1, 'Mickael', 'Mickael', null, '{true,false,false,false,false,false,false}', null),
    (167, 'Carneiros - Vermifugação', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Alessandro', null, '{true,false,false,false,false,false,false}', null),
    (168, 'Carneiros - Carbunculo', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (169, 'Carneiros - Castração', 'Gado', '1 - Rotina', 2, 'Odirlei', 'Alessandro', null, '{true,false,false,false,false,false,false}', null),
    (170, 'Peixe - Raçao - Tratar', 'Operacional', '1 - Rotina', 3, 'Agnaldo', 'Agnaldo', 'D23.1 e Represa das Placas', '{true,true,true,true,true,true,true}', null),
    (171, 'Reservatório - Placa Solar', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Equipe Máquinas', null, '{true,false,false,false,false,false,false}', null),
    (172, 'Fabrica - Manutenção', 'Operacional', '1 - Rotina', 2, 'Odirlei', 'Genilson', null, '{true,false,false,false,false,false,false}', null),
    (173, 'Fabrica - Milho', 'Gado', '2 - Estratégica', 1, 'Mickael', 'Terceirizado', null, '{true,false,false,false,false,false,false}', null)
  ) as a(cod, nome, setor, tipo, urg, coord, quem, local, dias, cmf);

  -- 5. PLANEJAMENTO 2026: semana e status de cada atividade (1742 marcações)
  --    status: 1 planejado, 2 concluído, 3 em andamento, 4 atrasado, 5 pausado
  insert into planejamento (fazenda_id, atividade_id, ano, semana, status, observacao)
  select fz, a.id, 2026, p.semana, p.status, p.obs
  from (values
    (1,25,2,null),(1,26,2,null),(1,27,2,null),(1,28,2,null),(1,29,2,null),(1,30,2,null)
    ,(1,31,2,null),(1,32,2,null),(1,33,2,null),(1,34,2,null),(1,35,2,null),(1,36,2,null)
    ,(1,37,2,null),(1,38,2,null),(1,39,1,null),(2,1,2,null),(2,2,2,null),(2,3,2,null)
    ,(2,4,2,null),(2,5,2,null),(2,6,2,null),(2,7,2,null),(2,8,2,null),(2,9,2,null)
    ,(2,10,2,null),(2,11,2,null),(2,12,2,null),(2,13,2,null),(2,14,2,null),(2,15,2,null)
    ,(2,16,2,null),(2,17,2,null),(2,18,2,null),(2,19,2,null),(2,20,2,null),(2,21,2,null)
    ,(2,22,2,null),(2,23,2,null),(2,24,2,null),(2,25,2,null),(2,26,2,null),(2,27,2,null)
    ,(2,28,2,null),(2,29,2,null),(2,30,2,null),(2,31,2,null),(2,32,2,null),(2,33,2,null)
    ,(2,34,2,null),(2,35,2,null),(2,36,2,null),(2,37,2,null),(2,38,2,null),(2,39,1,null)
    ,(3,1,3,null),(3,2,2,null),(3,9,2,null),(3,10,2,null),(3,12,2,null),(3,16,2,null)
    ,(3,19,2,null),(3,20,2,null),(3,23,2,null),(3,24,2,null),(3,25,2,null),(3,26,2,null)
    ,(3,27,2,null),(3,29,2,null),(3,31,2,null),(3,35,2,null),(3,38,2,null),(4,2,3,null)
    ,(4,3,2,null),(4,10,3,null),(4,11,3,null),(4,12,3,null),(4,13,4,null),(4,14,4,null)
    ,(4,15,2,null),(4,16,2,null),(4,18,3,null),(4,19,4,null),(4,20,2,null),(4,25,2,null)
    ,(5,12,3,null),(5,13,3,null),(5,14,2,null),(5,15,3,null),(5,16,2,null),(5,21,2,null)
    ,(5,22,2,null),(5,27,3,null),(5,28,3,null),(5,29,2,null),(5,33,2,null),(5,34,2,null)
    ,(5,36,2,null),(6,23,3,null),(6,24,4,null),(6,25,2,null),(6,32,2,null),(6,34,2,null)
    ,(7,1,2,null),(7,2,2,null),(7,3,2,null),(7,4,2,null),(7,7,2,null),(7,8,2,null)
    ,(7,12,3,null),(7,13,4,null),(7,14,2,null),(7,15,2,null),(7,16,2,null),(7,17,2,null)
    ,(7,18,2,null),(7,19,2,null),(7,20,2,null),(7,21,2,null),(7,24,2,null),(7,25,2,null)
    ,(7,26,2,null),(7,28,2,null),(7,30,2,null),(7,31,2,null),(7,32,2,null),(7,33,2,null)
    ,(7,35,2,null),(7,37,2,null),(7,38,2,null),(7,39,1,null),(8,5,2,null),(8,13,3,null)
    ,(8,14,3,null),(8,15,3,null),(8,16,3,null),(8,17,2,null),(8,18,2,null),(8,23,3,null)
    ,(8,24,2,null),(8,25,2,null),(8,26,2,null),(8,30,2,null),(9,17,2,null),(9,39,1,null)
    ,(10,23,2,null),(11,17,2,null),(11,29,2,null),(13,1,2,null),(13,2,2,null),(13,3,2,null)
    ,(13,4,4,null),(13,5,2,null),(13,6,2,null),(13,7,2,null),(13,8,2,null),(13,9,2,null)
    ,(13,10,2,null),(13,11,2,null),(13,12,2,null),(13,13,2,null),(13,14,2,null),(13,15,2,null)
    ,(13,16,2,null),(13,17,2,null),(13,18,2,null),(13,19,2,null),(13,20,2,null),(13,21,2,null)
    ,(13,22,2,null),(13,23,2,null),(13,24,2,null),(13,25,2,null),(13,26,2,null),(13,27,4,null)
    ,(13,28,2,null),(13,30,2,null),(13,31,2,null),(13,32,2,null),(13,33,2,null),(13,34,2,null)
    ,(13,35,2,null),(13,36,2,null),(13,37,2,null),(13,38,2,null),(13,39,1,null),(14,5,2,null)
    ,(14,6,2,null),(14,16,3,null),(14,17,2,null),(14,25,2,null),(14,26,2,null),(14,31,2,null)
    ,(14,34,2,null),(14,36,2,null),(14,38,2,null),(15,12,3,null),(15,13,3,null),(15,14,2,null)
    ,(15,15,3,null),(15,16,2,null),(15,18,2,null),(15,26,3,null),(15,27,2,null),(15,33,3,null)
    ,(15,34,2,null),(15,35,2,null),(15,36,3,null),(15,37,2,null),(16,4,2,null),(16,26,2,null)
    ,(16,29,2,null),(16,31,2,null),(16,32,2,null),(16,33,2,null),(16,34,2,null),(16,35,2,null)
    ,(16,36,2,null),(16,37,2,null),(16,38,2,null),(16,39,1,null),(17,1,2,null),(17,2,2,null)
    ,(17,3,2,null),(17,4,2,null),(17,5,2,null),(17,6,2,null),(17,7,2,null),(17,8,2,null)
    ,(17,9,2,null),(17,10,2,null),(17,11,2,null),(17,12,2,null),(17,13,2,null),(17,14,2,null)
    ,(17,15,2,null),(17,16,2,null),(17,17,2,null),(17,18,2,null),(17,19,2,null),(17,20,2,null)
    ,(17,21,2,null),(17,22,2,null),(17,23,2,null),(17,24,2,null),(17,25,2,null),(17,26,2,null)
    ,(17,27,2,null),(17,28,2,null),(17,29,2,null),(17,30,2,null),(17,31,2,null),(17,32,2,null)
    ,(17,33,2,null),(17,34,2,null),(17,35,2,null),(17,36,2,null),(17,37,2,null),(17,38,2,null)
    ,(17,39,1,null),(18,1,2,null),(18,2,2,null),(18,3,2,null),(18,4,2,null),(18,5,3,null)
    ,(18,6,3,null),(18,7,4,null),(18,8,2,null),(18,9,2,null),(18,10,2,null),(18,11,2,null)
    ,(18,12,2,null),(18,13,2,null),(18,14,2,null),(18,15,2,null),(18,16,2,null),(18,17,2,null)
    ,(18,18,2,null),(18,19,2,null),(18,20,2,null),(18,21,2,null),(18,22,2,null),(18,23,2,null)
    ,(18,24,2,null),(18,25,2,null),(18,26,2,null),(18,27,2,null),(18,28,2,null),(18,29,2,null)
    ,(18,30,2,null),(18,32,2,null),(18,33,2,null),(18,34,2,null),(18,35,2,null),(18,36,2,null)
    ,(18,37,2,null),(18,38,2,null),(19,4,2,null),(19,8,2,null),(19,17,2,null),(19,24,2,null)
    ,(19,35,2,null),(20,4,2,null),(20,5,2,null),(20,11,2,null),(20,12,2,null),(20,25,2,null)
    ,(20,26,2,null),(20,27,2,null),(21,19,2,null),(21,20,2,null),(21,21,2,null),(21,22,2,null)
    ,(21,23,2,null),(21,24,4,null),(21,25,2,null),(21,26,4,null),(21,27,2,null),(21,28,2,null)
    ,(21,29,4,null),(21,30,4,null),(21,31,2,null),(21,32,2,null),(21,33,2,null),(21,34,2,null)
    ,(21,35,4,null),(21,36,2,null),(21,37,2,null),(21,38,2,null),(21,39,1,null),(22,1,2,null)
    ,(22,13,4,null),(22,14,2,null),(22,25,2,null),(22,28,3,null),(22,29,4,null),(22,30,4,null)
    ,(22,32,2,null),(27,4,2,null),(27,20,2,null),(27,26,2,null),(27,30,3,null),(27,31,3,null)
    ,(27,32,2,null),(28,4,4,null),(28,16,3,null),(28,17,2,null),(30,3,2,null),(30,6,2,null)
    ,(30,7,2,null),(30,8,2,null),(30,9,3,null),(30,10,3,null),(30,11,3,null),(30,12,2,null)
    ,(30,14,4,null),(30,15,3,null),(30,16,3,null),(30,17,2,null),(30,18,2,null),(30,21,2,null)
    ,(30,26,2,null),(30,30,2,null),(30,31,2,null),(30,37,2,null),(31,1,2,null),(31,2,2,null)
    ,(31,3,2,null),(31,4,2,null),(31,5,2,null),(31,6,2,null),(31,7,2,null),(31,8,2,null)
    ,(31,9,2,null),(31,10,2,null),(31,11,2,null),(31,12,2,null),(31,13,2,null),(31,14,2,null)
    ,(31,15,2,null),(31,16,2,null),(31,18,2,null),(31,19,2,null),(31,20,2,null),(31,21,2,null)
    ,(31,22,2,null),(31,23,2,null),(31,24,2,null),(31,25,2,null),(31,26,2,null),(31,27,2,null)
    ,(31,28,2,null),(31,29,2,null),(31,35,2,null),(31,36,2,null),(31,37,2,null),(31,38,2,null)
    ,(31,39,1,null),(32,3,2,null),(32,4,2,null),(32,8,2,null),(32,9,2,null),(32,10,2,null)
    ,(32,15,2,null),(32,16,2,null),(32,18,2,null),(32,19,2,null),(32,22,2,null),(32,25,2,null)
    ,(32,29,2,null),(32,32,2,null),(32,34,2,null),(32,36,2,null),(32,38,2,null),(33,2,2,null)
    ,(33,3,2,null),(33,4,2,null),(33,5,2,null),(33,6,2,null),(33,7,3,null),(33,8,2,null)
    ,(33,9,2,null),(33,10,2,null),(33,12,2,null),(33,13,2,null),(33,14,2,null),(33,16,2,null)
    ,(33,17,2,null),(33,18,2,null),(33,20,2,null),(33,23,3,null),(33,24,2,null),(33,25,2,null)
    ,(33,26,2,null),(33,27,2,null),(33,29,2,null),(33,30,2,null),(33,33,2,null),(33,34,2,null)
    ,(34,5,2,null),(35,2,2,null),(35,3,2,null),(35,4,2,null),(35,14,2,null),(36,2,2,null)
    ,(36,3,2,null),(36,4,2,null),(36,12,2,null),(36,14,2,null),(36,16,2,null),(36,17,2,null)
    ,(36,18,2,null),(36,19,2,null),(36,20,2,null),(37,4,2,null),(38,4,2,null),(38,6,2,null)
    ,(38,7,3,null),(38,8,2,null),(38,9,2,null),(38,13,2,null),(38,22,2,null),(38,23,3,null)
    ,(38,24,2,null),(38,25,2,null),(38,26,2,null),(38,30,2,null),(38,33,2,null),(39,20,2,null)
    ,(40,2,2,null),(40,3,2,null),(40,6,2,null),(40,7,2,null),(40,10,4,null),(40,11,2,null)
    ,(40,12,2,null),(40,19,2,null),(40,21,2,null),(40,22,4,null),(40,23,2,null),(40,30,2,null)
    ,(40,31,2,null),(41,2,2,null),(41,3,2,null),(41,4,2,null),(41,5,2,null),(41,6,2,null)
    ,(41,7,2,null),(41,8,2,null),(41,9,2,null),(41,10,2,null),(41,11,2,null),(41,12,2,null)
    ,(41,13,2,null),(41,14,2,null),(41,16,2,null),(41,17,2,null),(41,18,2,null),(41,19,2,null)
    ,(41,20,2,null),(41,22,2,null),(41,23,3,null),(41,24,2,null),(41,25,2,null),(41,26,2,null)
    ,(41,27,2,null),(41,29,2,null),(41,30,2,null),(41,31,2,null),(41,33,2,null),(41,34,2,null)
    ,(41,35,2,null),(42,1,2,null),(42,2,2,null),(42,3,2,null),(42,4,2,null),(42,5,2,null)
    ,(42,6,2,null),(42,7,2,null),(42,8,2,null),(42,9,2,null),(42,10,2,null),(42,11,2,null)
    ,(42,12,2,null),(42,13,2,null),(42,14,2,null),(42,15,2,null),(42,16,2,null),(42,17,2,null)
    ,(42,18,2,null),(42,19,2,null),(42,20,2,null),(42,21,2,null),(42,22,2,null),(42,24,2,null)
    ,(42,25,2,null),(42,26,2,null),(42,27,2,null),(42,28,2,null),(42,29,2,null),(42,30,2,null)
    ,(42,31,2,null),(42,32,2,null),(42,33,2,null),(42,34,2,null),(42,35,2,null),(42,36,2,null)
    ,(42,37,2,null),(42,38,2,null),(42,39,1,null),(43,2,2,null),(43,3,2,null),(43,4,2,null)
    ,(43,5,2,null),(43,6,2,null),(43,7,2,null),(43,8,2,null),(43,9,2,null),(43,10,2,null)
    ,(43,11,2,null),(43,12,2,null),(43,13,2,null),(43,14,2,null),(43,15,2,null),(43,16,2,null)
    ,(43,17,2,null),(43,18,2,null),(43,19,2,null),(43,20,2,null),(43,21,2,null),(43,23,2,null)
    ,(43,24,2,null),(43,25,2,null),(43,26,2,null),(43,27,2,null),(43,28,2,null),(46,21,2,null)
    ,(47,2,2,null),(47,3,2,null),(47,4,2,null),(47,5,2,null),(47,6,2,null),(47,7,2,null)
    ,(47,9,2,null),(47,10,4,null),(47,11,2,null),(47,12,2,null),(47,19,2,null),(47,26,2,null)
    ,(47,30,2,null),(47,31,2,null),(47,37,2,null),(48,2,2,null),(48,3,2,null),(48,6,2,null)
    ,(48,9,2,null),(48,10,4,null),(48,11,2,null),(48,12,2,null),(48,19,2,null),(49,2,2,null)
    ,(49,3,2,null),(49,6,2,null),(49,7,2,null),(49,10,4,null),(49,11,2,null),(49,12,2,null)
    ,(49,13,2,null),(49,14,2,null),(49,17,2,null),(49,18,2,null),(49,19,2,null),(49,20,2,null)
    ,(49,24,2,null),(49,27,2,null),(49,30,2,null),(49,31,2,null),(51,1,2,null),(51,2,2,null)
    ,(51,3,2,null),(51,4,2,null),(51,5,2,null),(51,6,2,null),(51,7,2,null),(51,8,2,null)
    ,(51,9,2,null),(51,10,2,null),(51,11,2,null),(51,12,2,null),(51,13,2,null),(51,14,2,null)
    ,(51,15,2,null),(51,16,2,null),(51,17,2,null),(51,18,2,null),(51,19,2,null),(51,26,2,null)
    ,(51,29,2,null),(51,33,2,null),(51,37,2,null),(52,1,3,null),(52,2,2,null),(52,33,3,null)
    ,(52,36,2,null),(53,1,2,null),(53,2,2,null),(53,3,2,null),(53,4,2,null),(53,5,2,null)
    ,(53,7,2,null),(53,8,2,null),(53,9,2,null),(53,10,2,null),(53,11,2,null),(53,12,2,null)
    ,(53,13,2,null),(53,14,2,null),(53,15,2,null),(53,16,2,null),(53,17,2,null),(53,18,2,null)
    ,(53,19,2,null),(53,20,2,null),(53,21,2,null),(53,22,2,null),(53,23,2,null),(53,24,2,null)
    ,(53,25,2,null),(53,26,2,null),(53,27,2,null),(53,33,2,null),(53,35,2,null),(53,37,2,null)
    ,(53,38,2,null),(54,26,3,null),(54,27,3,null),(54,28,3,null),(54,29,3,null),(54,30,2,null)
    ,(55,1,2,null),(55,5,4,null),(55,6,4,null),(55,7,3,null),(55,8,2,null),(55,9,2,null)
    ,(55,10,2,null),(55,12,2,null),(55,16,3,null),(55,17,2,null),(55,29,2,null),(55,33,3,null)
    ,(55,34,2,null),(55,37,2,null),(55,38,2,null),(55,39,1,null),(56,11,3,null),(56,12,3,null)
    ,(56,13,3,null),(56,14,3,null),(56,15,3,null),(56,16,3,null),(56,17,2,null),(56,18,2,null)
    ,(57,1,2,null),(57,2,2,null),(57,3,2,null),(57,4,2,null),(57,5,2,null),(57,6,2,null)
    ,(57,7,2,null),(57,8,2,null),(57,9,2,null),(57,10,2,null),(57,11,2,null),(57,12,2,null)
    ,(57,13,2,null),(57,14,2,null),(57,15,2,null),(57,16,2,null),(57,17,2,null),(57,18,2,null)
    ,(57,19,2,null),(57,20,2,null),(57,21,2,null),(57,22,2,null),(57,23,2,null),(57,24,2,null)
    ,(57,25,2,null),(57,26,2,null),(57,28,2,null),(57,29,2,null),(57,30,2,null),(57,31,2,null)
    ,(57,32,2,null),(57,33,2,null),(57,34,2,null),(57,35,2,null),(57,36,3,null),(57,37,2,null)
    ,(57,38,2,null),(57,39,1,null),(58,1,3,null),(58,2,2,null),(58,3,3,null),(58,4,2,null)
    ,(58,5,3,null),(58,6,2,null),(58,7,2,null),(58,8,2,null),(58,9,2,null),(58,10,2,null)
    ,(58,11,2,null),(58,12,2,null),(58,13,2,null),(58,15,2,null),(58,19,3,null),(58,20,3,null)
    ,(58,21,3,null),(58,22,2,null),(58,23,2,null),(58,24,2,null),(58,25,2,null),(58,29,2,null)
    ,(58,30,2,null),(58,31,2,null),(58,32,2,null),(58,33,2,null),(58,34,2,null),(58,35,2,null)
    ,(58,37,2,null),(58,38,3,null),(58,39,1,null),(59,2,2,null),(59,4,2,null),(59,19,2,null)
    ,(59,24,2,null),(60,1,2,null),(60,2,2,null),(60,3,2,null),(60,4,2,null),(60,5,2,null)
    ,(60,6,2,null),(60,7,2,null),(60,8,2,null),(60,9,2,null),(60,10,2,null),(60,11,2,null)
    ,(60,12,2,null),(60,14,2,null),(60,15,2,null),(60,16,2,null),(60,17,2,null),(60,18,2,null)
    ,(60,19,2,null),(60,21,2,null),(60,22,2,null),(60,23,2,null),(60,24,2,null),(60,25,2,null)
    ,(60,26,2,null),(60,27,2,null),(60,28,2,null),(60,29,2,null),(60,30,2,null),(60,31,2,null)
    ,(60,32,2,null),(60,35,2,null),(60,36,2,null),(60,37,2,null),(60,38,2,null),(60,39,1,null)
    ,(61,1,2,null),(61,2,2,null),(61,3,2,null),(61,4,2,null),(61,5,2,null),(61,6,2,null)
    ,(61,7,2,null),(61,8,2,null),(61,9,2,null),(61,10,2,null),(61,11,2,null),(61,12,2,null)
    ,(61,13,2,null),(61,14,2,null),(61,15,2,null),(61,16,2,null),(61,17,2,null),(61,18,2,null)
    ,(61,20,2,null),(61,21,2,null),(61,22,2,null),(61,23,2,null),(61,24,2,null),(61,25,2,null)
    ,(61,26,2,null),(61,33,2,null),(61,34,2,null),(61,37,2,null),(61,38,2,null),(61,39,1,null)
    ,(62,8,3,null),(62,9,2,null),(63,2,4,null),(63,3,2,null),(63,39,1,null),(67,17,2,null)
    ,(67,18,3,null),(67,19,2,null),(67,22,2,null),(67,33,3,null),(67,34,2,null),(69,4,4,null)
    ,(69,5,4,null),(69,6,3,null),(69,7,3,null),(69,8,2,null),(69,9,3,null),(69,10,3,null)
    ,(69,11,2,null),(69,38,3,null),(69,39,1,null),(71,5,2,null),(71,18,2,null),(74,1,2,null)
    ,(74,3,3,null),(74,4,2,null),(74,5,2,null),(74,6,3,null),(74,7,3,null),(74,8,3,null)
    ,(74,9,2,null),(74,10,3,null),(74,11,3,null),(74,12,2,null),(74,13,2,null),(74,14,3,null)
    ,(74,15,2,null),(75,4,2,null),(75,5,2,null),(75,6,3,null),(75,7,2,null),(75,9,2,null)
    ,(75,14,2,null),(76,24,2,null),(77,4,2,null),(77,6,2,null),(77,9,3,null),(77,10,3,null)
    ,(77,11,4,null),(77,18,2,null),(78,1,2,null),(78,2,4,null),(78,3,2,null),(78,4,2,null)
    ,(78,6,2,null),(78,7,2,null),(78,9,3,null),(78,10,3,null),(78,11,4,null),(78,13,2,null)
    ,(78,14,2,null),(78,16,3,null),(78,17,2,null),(78,18,2,null),(78,19,2,null),(78,20,2,null)
    ,(78,21,2,null),(78,22,2,null),(78,23,2,null),(78,24,2,null),(78,25,2,null),(78,26,2,null)
    ,(78,27,2,null),(78,28,2,null),(78,29,2,null),(78,30,2,null),(78,31,2,null),(78,32,2,null)
    ,(78,34,2,null),(78,35,2,null),(78,36,2,null),(78,37,2,null),(78,38,2,null),(78,39,1,null)
    ,(79,13,3,null),(79,14,2,null),(79,32,2,null),(80,2,2,null),(80,4,4,null),(80,5,4,null)
    ,(80,8,2,null),(80,11,2,null),(80,20,2,null),(80,23,2,null),(80,28,3,null),(80,29,4,null)
    ,(80,30,4,null),(80,32,2,null),(81,24,2,null),(81,28,2,null),(81,35,2,null),(83,4,2,null)
    ,(83,7,3,null),(83,8,3,null),(83,9,3,null),(83,10,3,null),(83,11,3,null),(83,12,3,null)
    ,(83,14,3,null),(83,15,2,null),(83,36,3,null),(83,37,2,null),(83,38,2,null),(83,39,1,null)
    ,(85,23,2,null),(86,4,2,null),(86,5,2,null),(86,7,2,null),(86,8,2,null),(86,9,2,null)
    ,(86,11,2,null),(86,12,3,null),(86,18,2,null),(87,1,2,null),(87,2,2,null),(87,3,2,null)
    ,(87,4,2,null),(87,5,2,null),(87,6,2,null),(87,7,2,null),(87,8,2,null),(87,9,2,null)
    ,(87,10,2,null),(87,11,2,null),(87,12,2,null),(87,13,2,null),(87,14,2,null),(87,15,2,null)
    ,(87,16,2,null),(87,17,2,null),(87,18,2,null),(87,19,2,null),(87,20,2,null),(87,22,2,null)
    ,(87,24,2,null),(87,25,2,null),(87,26,2,null),(87,27,2,null),(87,28,2,null),(87,29,2,null)
    ,(87,30,2,null),(87,31,2,null),(87,32,2,null),(87,33,2,null),(87,34,2,null),(87,36,2,null)
    ,(87,37,2,null),(87,38,2,null),(87,39,1,null),(88,5,2,null),(88,14,2,null),(88,16,2,null)
    ,(88,17,2,null),(88,18,3,null),(88,19,2,null),(88,21,2,null),(88,22,2,null),(88,23,2,null)
    ,(88,24,2,null),(88,33,3,null),(88,34,2,null),(88,36,2,null),(88,37,2,null),(90,1,2,null)
    ,(90,2,2,null),(90,3,2,null),(90,4,2,null),(90,5,2,null),(90,6,2,null),(90,7,2,null)
    ,(90,8,2,null),(90,9,2,null),(90,10,2,null),(90,11,2,null),(90,12,2,null),(90,13,2,null)
    ,(90,14,2,null),(90,15,2,null),(90,16,2,null),(90,17,2,null),(90,18,2,null),(90,19,2,null)
    ,(90,20,2,null),(90,21,2,null),(90,22,2,null),(90,24,2,null),(90,25,2,null),(90,26,2,null)
    ,(90,27,2,null),(90,28,2,null),(90,29,2,null),(90,30,2,null),(90,31,2,null),(90,32,2,null)
    ,(90,33,2,null),(90,34,2,null),(90,35,2,null),(90,36,2,null),(90,37,2,null),(90,38,2,null)
    ,(90,39,1,null),(92,2,4,null),(92,3,2,null),(92,8,2,null),(92,10,2,null),(92,12,2,null)
    ,(92,14,2,null),(92,16,2,null),(92,17,2,null),(92,22,2,null),(92,23,2,null),(92,29,2,null)
    ,(92,30,2,null),(92,33,2,null),(92,36,2,null),(92,37,2,null),(92,39,1,null),(93,5,2,null)
    ,(93,17,2,null),(95,8,2,null),(95,16,2,null),(96,36,2,null),(96,37,2,null),(96,38,2,null)
    ,(96,39,1,null),(98,1,2,null),(98,2,2,null),(98,3,2,null),(98,4,2,null),(98,5,2,null)
    ,(98,6,2,null),(98,7,2,null),(98,8,2,null),(98,9,2,null),(98,10,2,null),(98,11,2,null)
    ,(98,12,2,null),(98,13,2,null),(98,14,2,null),(98,15,2,null),(98,16,2,null),(98,17,2,null)
    ,(98,18,2,null),(98,19,2,null),(98,20,2,null),(98,21,2,null),(98,22,2,null),(98,23,2,null)
    ,(98,24,2,null),(98,25,2,null),(98,26,2,null),(98,27,2,null),(98,28,2,null),(98,29,2,null)
    ,(98,30,2,null),(98,31,2,null),(98,32,2,null),(98,33,2,null),(98,34,2,null),(98,35,2,null)
    ,(98,36,2,null),(98,37,2,null),(98,38,2,null),(98,39,1,null),(99,3,3,null),(99,5,2,null)
    ,(99,12,2,null),(99,16,2,null),(99,19,2,null),(99,27,2,null),(99,34,2,null),(99,37,2,null)
    ,(100,1,2,null),(100,2,2,null),(100,3,2,null),(100,4,2,null),(100,5,2,null),(100,6,2,null)
    ,(100,7,2,null),(100,8,2,null),(100,9,2,null),(100,10,2,null),(100,11,2,null),(100,12,2,null)
    ,(100,13,2,null),(100,14,2,null),(100,15,2,null),(100,16,2,null),(100,17,2,null),(100,18,2,null)
    ,(100,19,2,null),(100,20,2,null),(100,21,2,null),(100,22,2,null),(100,23,2,null),(100,24,2,null)
    ,(100,25,2,null),(100,26,2,null),(100,27,2,null),(100,28,2,null),(100,29,2,null),(100,30,2,null)
    ,(100,31,2,null),(100,32,2,null),(100,33,2,null),(100,34,2,null),(100,35,2,null),(100,36,2,null)
    ,(100,37,2,null),(100,38,2,null),(100,39,1,null),(101,17,2,null),(101,24,2,null),(102,25,2,null)
    ,(102,38,2,null),(103,1,2,null),(103,2,2,null),(103,3,2,null),(103,4,2,null),(103,5,2,null)
    ,(103,6,2,null),(103,7,2,null),(103,8,2,null),(103,9,2,null),(103,10,2,null),(103,11,2,null)
    ,(103,12,2,null),(103,13,2,null),(103,14,2,null),(103,15,2,null),(103,16,2,null),(103,17,2,null)
    ,(103,19,2,null),(103,20,2,null),(103,21,2,null),(103,22,2,null),(103,24,2,null),(103,25,2,null)
    ,(103,26,2,null),(103,27,2,null),(103,28,2,null),(103,29,2,null),(103,30,2,null),(103,31,2,null)
    ,(103,32,2,null),(103,33,2,null),(103,34,2,null),(103,35,2,null),(103,36,2,null),(103,37,2,null)
    ,(103,38,2,null),(103,39,1,null),(105,1,3,null),(105,2,3,null),(105,3,4,null),(105,9,3,null)
    ,(105,10,2,null),(105,24,4,null),(105,25,3,null),(105,26,3,null),(105,27,3,null),(105,28,3,null)
    ,(105,29,3,null),(105,30,2,null),(105,32,2,null),(105,35,2,null),(108,5,3,null),(108,6,2,null)
    ,(108,18,2,null),(108,35,2,null),(110,25,2,null),(110,35,2,null),(112,29,2,null),(113,32,2,null)
    ,(113,38,2,null),(115,8,4,null),(115,10,2,null),(115,13,2,null),(115,21,4,null),(115,22,2,null)
    ,(115,23,2,null),(115,29,2,null),(115,31,2,null),(115,36,3,null),(115,37,2,null),(116,1,2,null)
    ,(116,2,2,null),(116,3,2,null),(116,4,2,null),(116,5,2,null),(116,6,2,null),(116,7,2,null)
    ,(116,8,2,null),(116,9,2,null),(116,10,2,null),(116,11,2,null),(116,12,2,null),(116,13,2,null)
    ,(116,14,2,null),(116,15,2,null),(116,16,2,null),(116,17,2,null),(116,18,2,null),(116,19,2,null)
    ,(116,20,2,null),(116,21,2,null),(116,22,2,null),(116,23,2,null),(116,24,2,null),(116,25,2,null)
    ,(116,26,2,null),(116,27,2,null),(116,28,2,null),(116,29,2,null),(116,30,2,null),(116,31,2,null)
    ,(116,32,2,null),(116,33,2,null),(116,34,2,null),(116,35,2,null),(116,36,2,null),(116,37,2,null)
    ,(116,38,2,null),(116,39,1,null),(117,10,2,null),(117,12,2,null),(117,13,2,null),(117,26,2,null)
    ,(117,36,3,null),(117,37,2,null),(118,1,2,null),(118,2,2,null),(118,3,2,null),(118,4,2,null)
    ,(118,5,2,null),(118,7,2,null),(118,9,2,null),(118,10,2,null),(118,13,2,null),(118,16,2,null)
    ,(118,20,2,null),(118,21,2,null),(118,22,2,null),(118,25,2,null),(118,26,2,null),(119,1,2,null)
    ,(119,2,2,null),(119,3,2,null),(119,4,2,null),(119,5,2,null),(119,7,2,null),(119,9,2,null)
    ,(119,10,2,null),(119,11,2,null),(119,12,2,null),(119,13,2,null),(119,14,2,null),(119,15,2,null)
    ,(119,16,2,null),(119,17,2,null),(119,18,2,null),(119,19,2,null),(119,20,2,null),(119,21,2,null)
    ,(119,22,2,null),(119,23,2,null),(119,24,2,null),(119,25,2,null),(119,26,2,null),(119,27,2,null)
    ,(119,29,2,null),(119,30,2,null),(119,31,2,null),(119,32,2,null),(119,33,2,null),(119,36,2,null)
    ,(119,37,2,null),(119,39,2,null),(120,1,2,null),(120,2,2,null),(120,3,2,null),(120,4,2,null)
    ,(120,5,2,null),(120,6,4,null),(120,7,2,null),(120,8,2,null),(120,9,2,null),(120,10,2,null)
    ,(120,11,2,null),(120,13,2,null),(120,14,2,null),(120,15,2,null),(120,16,2,null),(120,17,2,null)
    ,(120,18,2,null),(120,19,2,null),(120,20,2,null),(120,22,2,null),(120,23,2,null),(120,24,2,null)
    ,(120,25,2,null),(120,26,2,null),(120,27,2,null),(120,28,2,null),(120,29,2,null),(120,30,2,null)
    ,(120,31,2,null),(120,32,2,null),(120,33,2,null),(120,34,2,null),(120,36,2,null),(120,37,2,null)
    ,(120,38,2,null),(120,39,1,null),(121,2,3,null),(121,3,2,null),(121,8,2,null),(121,9,2,null)
    ,(121,10,2,null),(121,12,3,null),(121,13,3,null),(121,14,3,null),(121,15,2,null),(121,16,2,null)
    ,(121,20,3,null),(121,21,2,null),(121,25,2,null),(121,26,2,null),(121,31,2,null),(121,32,3,null)
    ,(121,33,2,null),(121,34,3,null),(121,35,3,null),(121,36,3,null),(121,37,3,null),(121,38,3,null)
    ,(121,39,1,null),(122,9,2,null),(131,1,2,null),(131,2,2,null),(131,3,2,null),(131,4,3,null)
    ,(131,5,3,null),(131,6,3,null),(131,7,3,null),(131,8,3,null),(131,9,2,null),(131,10,2,null)
    ,(131,11,2,null),(131,12,2,null),(131,13,2,null),(131,14,2,null),(131,15,2,null),(131,16,2,null)
    ,(131,17,2,null),(131,18,2,null),(131,19,2,null),(131,20,2,null),(131,21,2,null),(131,22,2,null)
    ,(131,23,2,null),(131,24,2,null),(131,25,2,null),(131,26,2,null),(131,27,2,null),(131,28,2,null)
    ,(131,29,2,null),(131,30,2,null),(131,31,2,null),(131,32,2,null),(131,33,2,null),(131,34,2,null)
    ,(131,35,2,null),(131,36,2,null),(131,37,2,null),(131,38,2,null),(131,39,1,null),(132,20,2,null)
    ,(132,25,2,null),(132,26,2,null),(132,27,2,null),(132,28,2,null),(132,29,2,null),(132,30,2,null)
    ,(132,31,2,null),(132,32,2,null),(132,33,2,null),(132,34,2,null),(132,35,2,null),(132,36,2,null)
    ,(132,37,2,null),(133,24,2,null),(133,35,2,null),(135,1,2,null),(135,18,2,null),(135,35,2,null)
    ,(135,39,1,null),(136,3,2,null),(136,4,2,null),(136,5,2,null),(136,7,2,null),(136,9,2,null)
    ,(136,10,2,null),(136,11,2,null),(136,12,2,null),(136,14,2,null),(136,16,2,null),(136,17,2,null)
    ,(136,18,2,null),(136,19,2,null),(136,20,2,null),(136,21,2,null),(136,22,2,null),(136,23,2,null)
    ,(136,24,2,null),(136,26,2,null),(136,28,2,null),(136,33,2,null),(136,34,2,null),(136,36,2,null)
    ,(138,35,2,null),(138,37,2,null),(142,5,2,null),(145,3,2,null),(145,4,2,null),(145,5,2,null)
    ,(145,6,2,null),(145,7,2,null),(145,8,2,null),(145,9,2,null),(145,10,2,null),(145,11,2,null)
    ,(145,12,2,null),(145,13,2,null),(145,14,2,null),(145,15,2,null),(145,16,2,null),(145,17,2,null)
    ,(145,18,2,null),(145,19,2,null),(145,20,2,null),(145,21,2,null),(145,22,2,null),(145,23,2,null)
    ,(145,24,2,null),(145,25,2,null),(145,26,2,null),(145,27,2,null),(145,28,2,null),(145,29,2,null)
    ,(145,30,2,null),(145,31,2,null),(145,32,2,null),(145,33,2,null),(145,34,2,null),(145,35,2,null)
    ,(145,36,2,null),(145,37,2,null),(145,38,2,null),(145,39,1,null),(148,1,2,null),(148,2,2,null)
    ,(148,3,2,null),(148,4,2,null),(148,5,2,null),(148,6,2,null),(148,7,2,null),(148,8,2,null)
    ,(148,9,2,null),(148,10,2,null),(148,11,2,null),(148,12,2,null),(148,13,2,null),(148,14,2,null)
    ,(148,15,2,null),(148,16,2,null),(148,17,2,null),(148,19,2,null),(148,20,2,null),(148,21,2,null)
    ,(148,22,2,null),(148,23,2,null),(148,24,2,null),(148,25,2,null),(148,26,2,null),(148,27,2,null)
    ,(148,28,2,null),(148,29,2,null),(148,30,2,null),(148,31,2,null),(148,32,2,null),(148,36,2,null)
    ,(148,37,2,null),(148,38,2,null),(148,39,1,null),(150,3,2,null),(150,4,3,null),(150,10,3,null)
    ,(150,12,3,null),(150,13,3,null),(150,14,3,null),(150,15,3,null),(150,16,2,null),(150,17,3,null)
    ,(150,18,3,null),(151,2,2,null),(151,7,2,null),(151,11,2,null),(151,15,2,null),(151,16,2,null)
    ,(151,18,2,null),(151,20,2,null),(151,24,2,null),(151,29,2,null),(151,33,2,null),(151,37,2,null)
    ,(154,4,2,null),(154,9,2,null),(154,16,2,null),(154,21,2,null),(154,26,2,null),(154,33,2,null)
    ,(154,37,2,null),(155,2,2,null),(155,7,2,null),(155,11,2,null),(155,15,2,null),(155,19,2,null)
    ,(155,24,2,null),(155,30,2,null),(155,39,1,null),(156,3,2,null),(157,24,2,null),(159,5,2,null)
    ,(159,10,4,null),(159,11,4,null),(159,14,2,null),(159,24,2,null),(159,25,3,null),(159,26,2,null)
    ,(159,29,2,null),(159,33,3,null),(159,38,2,null),(160,3,2,null),(160,4,3,null),(160,5,3,null)
    ,(160,6,3,null),(160,7,3,null),(160,8,2,null),(160,9,3,null),(160,10,3,null),(160,11,3,null)
    ,(160,12,2,null),(160,16,3,null),(160,17,2,null),(161,6,2,null),(161,12,3,null),(161,20,2,null)
    ,(162,1,2,null),(162,6,2,null),(162,10,2,null),(162,14,2,null),(162,18,2,null),(162,23,2,null)
    ,(162,28,2,null),(162,32,2,null),(162,36,2,null),(163,2,2,null),(163,6,2,null),(163,10,2,null)
    ,(163,15,2,null),(163,19,2,null),(163,23,2,null),(163,28,2,null),(163,32,2,null),(163,36,2,null)
    ,(164,20,2,null),(165,6,2,null),(165,13,2,null),(165,16,2,null),(165,19,2,null),(165,22,2,null)
    ,(165,26,2,null),(165,27,2,null),(165,30,2,null),(165,31,2,null),(165,34,2,null),(165,36,2,null)
    ,(165,37,2,null),(165,39,1,null),(166,3,2,null),(166,6,2,null),(166,8,2,null),(166,10,2,null)
    ,(166,14,3,null),(166,15,2,null),(166,17,2,null),(166,19,2,null),(166,20,2,null),(166,23,2,null)
    ,(166,25,2,null),(166,27,2,null),(166,29,2,null),(166,31,2,null),(166,35,2,null),(166,36,2,null)
    ,(166,37,2,null),(167,15,2,null),(167,31,3,null),(167,32,4,null),(167,33,2,null),(169,15,2,null)
    ,(169,33,2,null),(170,1,2,null),(170,2,2,null),(170,3,2,null),(170,4,2,null),(170,5,2,null)
    ,(170,6,2,null),(170,7,2,null),(170,8,2,null),(170,9,2,null),(170,10,2,null),(170,11,2,null)
    ,(170,12,2,null),(170,13,2,null),(170,14,2,null),(170,15,2,null),(170,16,2,null),(170,17,2,null)
    ,(170,18,2,null),(170,19,2,null),(170,20,2,null),(170,21,2,null),(170,22,2,null),(170,23,2,null)
    ,(170,24,2,null),(170,25,2,null),(170,26,2,null),(170,27,2,null),(170,28,2,null),(170,29,2,null)
    ,(170,30,2,null),(170,31,2,null),(170,32,2,null),(170,33,2,null),(170,34,2,null),(170,35,2,null)
    ,(170,36,2,null),(170,37,2,null),(170,38,2,null),(170,39,1,null),(171,17,2,null),(171,20,2,null)
    ,(171,21,2,null),(171,23,2,null),(171,24,2,null),(171,25,2,null),(171,26,2,null),(171,27,2,null)
    ,(171,28,2,null),(171,30,2,null),(171,31,2,null),(171,35,2,null),(171,36,2,null),(171,37,2,null)
    ,(171,38,2,null),(172,17,2,null),(172,19,2,null),(172,24,2,null),(173,1,2,null),(173,4,2,null)
    ,(173,7,2,null),(173,12,2,null),(173,15,2,null),(173,16,2,null),(173,18,2,null),(173,19,2,null)
    ,(173,21,2,null),(173,22,2,null),(173,23,2,null),(173,24,2,null),(173,26,2,null),(173,27,2,null)
    ,(173,28,2,null),(173,29,2,null),(173,30,2,null),(173,31,2,null),(173,32,3,null),(173,33,2,null)
    ,(173,35,2,null),(173,37,2,null)
  ) as p(cod, semana, status, obs)
  join atividades a on a.fazenda_id=fz and a.codigo_planilha=p.cod;

  raise notice 'Rio Juruena carregada com sucesso.';
end $$;

-- Conferência: quantas linhas ficaram em cada tabela
select 'pessoas' as tabela, count(*) from pessoas
union all select 'setores', count(*) from setores
union all select 'equipes', count(*) from equipes
union all select 'membros de equipe', count(*) from equipe_membros
union all select 'atividades', count(*) from atividades
union all select 'planejamento (semanas marcadas)', count(*) from planejamento;
