-- Farm Plan - schema inicial (fase 0)
-- Produto novo de gestao de execucao e gente por fazenda (apps/farmplan).
-- Substitui o modulo legado de atividades (atividades, atividade_funcionarios,
-- atividade_sessoes, atividade_imprevistos, rotinas, execucoes_rotina).
-- Migracao de dados do schema legado acontece em migration pontual posterior,
-- com backup previo. Este arquivo e apenas estrutural (idempotente).
--
-- Modelo: plano anual por fazenda; atividades com mapa de 53 semanas
-- (fp_atividade_semanas) e baixa por dia (fp_atividade_baixas); sessoes de
-- cronometro opcionais por baixa; extras fora do plano; contrato de resultados
-- por funcionario com avaliacoes semanais; indicadores de gente/execucao.

-- ============================================================
-- 0) Extensoes em tabelas existentes
-- ============================================================

-- funcionarios: apelido de exibicao, superior direto (organograma/avaliacao)
-- e papel dentro do FarmPlan para gating do app de campo
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS apelido text,
  ADD COLUMN IF NOT EXISTS superior_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS farmplan_papel text NOT NULL DEFAULT 'colaborador'
    CHECK (farmplan_papel IN ('colaborador','lider','gestor'));

CREATE INDEX IF NOT EXISTS idx_funcionarios_superior ON public.funcionarios(superior_id);

-- setores: dono do setor (quem coordena as atividades do setor)
ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL;

-- fazendas: se o colaborador ve o proprio escore no app
ALTER TABLE public.fazendas
  ADD COLUMN IF NOT EXISTS fp_escore_visivel_colaborador boolean NOT NULL DEFAULT true;

-- ============================================================
-- 1) Equipes N:N proprias do FarmPlan
-- A tabela legada `equipes` nao existe no banco remoto (as migrations
-- criar_equipes ficaram divergentes); "equipe" hoje e texto livre em
-- registros (equipe_nomes). FarmPlan cria seu proprio par de tabelas.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_equipes_fazenda_nome
  ON public.fp_equipes(fazenda_id, nome) WHERE ativo = true AND deleted_at IS NULL;

CREATE TRIGGER trg_fp_equipes_updated_at BEFORE UPDATE ON public.fp_equipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fp_equipe_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.fp_equipes(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe_id, funcionario_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_equipe_membros_func ON public.fp_equipe_membros(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fp_equipe_membros_fazenda ON public.fp_equipe_membros(fazenda_id);

-- ============================================================
-- 2) Planos anuais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano smallint NOT NULL,
  semana1_inicio date NOT NULL, -- segunda-feira da semana 1 (ex.: 2025-12-29 para 2026)
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (fazenda_id, ano)
);
CREATE INDEX IF NOT EXISTS idx_fp_planos_fazenda ON public.fp_planos(fazenda_id);

CREATE TRIGGER trg_fp_planos_updated_at BEFORE UPDATE ON public.fp_planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semana atual de um plano (1..53), no fuso da operacao
CREATE OR REPLACE FUNCTION public.fp_semana_atual(p_plano_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, LEAST(53,
    ((now() AT TIME ZONE 'America/Cuiaba')::date - semana1_inicio) / 7 + 1
  ))::smallint
  FROM public.fp_planos
  WHERE id = p_plano_id;
$$;

-- ============================================================
-- 3) Criterios de comportamento (catalogo)
-- fazenda_id NULL = criterio global da metodologia; preenchido = local
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_criterios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_criterios_fazenda ON public.fp_criterios(fazenda_id);

-- Seed dos criterios globais da metodologia (lista do Farm Plan Rio Juruena)
INSERT INTO public.fp_criterios (fazenda_id, nome, ordem) VALUES
  (NULL,'Agenda do Dia - Planeja Bem e Executa Bem as Atividades Diárias',1),
  (NULL,'Agilidade - Trabalha Com Agilidade nas Tarefas Diárias',2),
  (NULL,'Ambiente de Trabalho - Mantém Organizado e Limpo',3),
  (NULL,'Ambiente de Trabalho - Conservação e Manutenção Correta',4),
  (NULL,'Anotações - Realiza e Repassa as Anotações de Tarefas',5),
  (NULL,'Capricho - Realiza as Tarefas Com Dedicação e Empenho',6),
  (NULL,'Comunicação - Se Comunica Bem Com Colegas e Líder',7),
  (NULL,'Educação - Trata com Igualdade Todos na Empresa',8),
  (NULL,'EPI''s/Uniforme - Utiliza Adequadamente no Trabalho',9),
  (NULL,'Escritório - Ajuda a Manter o Escritório Limpo e Organizado',10),
  (NULL,'Estrutura - Zelo Pela Estrutura da Fazenda',11),
  (NULL,'Expectativas - Faz Além do Que É Solicitado',12),
  (NULL,'Faltas/Ausência - Frequência de Trabalho Regular',13),
  (NULL,'Ferramentas de Comunicação - Utiliza Corretamente',14),
  (NULL,'Gratidão - É Sempre Grato e Não Reclama',15),
  (NULL,'Improvisação - Lida Bem Com Imprevistos',16),
  (NULL,'Iniciativa de Trabalho - Não Espera Mandar',17),
  (NULL,'Manutenção - Cuida e Zela Pelas Máquinas/Ferramentas',18),
  (NULL,'Materiais e Ferramentas de Trabalho - Solicita Com Antecedência',19),
  (NULL,'Maturidade - Sabe Separar Vida Pessoal e Profissional',20),
  (NULL,'Moradia - Zelo Pela Moradia/Quintal/Alojamento',21),
  (NULL,'Parceria - Ajuda os Demais Setores Quando Preciso',22),
  (NULL,'Plano Semanal - Sempre Atento ao Plano Semanal de Trabalho',23),
  (NULL,'Pontualidade - Inicia Jornada de Trabalho nos Horários Corretos',24),
  (NULL,'Prazo - Cumpre as Atividades Dentro do Esperado',25),
  (NULL,'Priorização - Sabe Priorizar as Tarefas (Urgente/Importante)',26),
  (NULL,'Programação de Trabalho - Planeja Com Antecedência',27),
  (NULL,'Zelo Com as Máquinas, Ferramentas e Veículos',28),
  (NULL,'Zelo Com os Animais - Cuida Bem dos Animais',29),
  (NULL,'Bebida - Consumo Adequado S/ Interferência no Trabalho',30),
  (NULL,'Conduta - Mantém-se Sóbrio e com Postura Profissional Durante Todo o Horário de Trabalho',31),
  (NULL,'Comprometimento na Execução das Tarefas',32),
  (NULL,'Prazo - Cumpre as Atividades Dentro do Prazo Combinado',33),
  (NULL,'Liderança/Comunicação Eficaz',34)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4) Indicadores (painel de bordo de gente/execucao)
-- origem: 'manual' (gestor lanca), 'escore' (media das avaliacoes),
-- 'atividades' (% concluidas no mes) - calculados pelo proprio FarmPlan.
-- KPIs de rebanho/financeiro ficam fora do produto (decisao 2026-09-30).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_indicadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  unidade text NOT NULL DEFAULT '',
  direcao text NOT NULL DEFAULT 'up' CHECK (direcao IN ('up','down')),
  meta_valor numeric,
  atencao_valor numeric, -- limiar da zona de atencao
  meta_label text,       -- texto amigavel da meta (ex.: "acima de 6,0")
  casas_decimais smallint NOT NULL DEFAULT 2,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','escore','atividades')),
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fp_indicadores_fazenda ON public.fp_indicadores(fazenda_id);

CREATE TRIGGER trg_fp_indicadores_updated_at BEFORE UPDATE ON public.fp_indicadores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fp_indicador_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador_id uuid NOT NULL REFERENCES public.fp_indicadores(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano smallint NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor numeric,
  lancado_por uuid,
  lancado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicador_id, ano, mes)
);
CREATE INDEX IF NOT EXISTS idx_fp_ind_valores_fazenda ON public.fp_indicador_valores(fazenda_id);

-- Seed por fazenda: escore da equipe, % atividades concluidas, faltas
CREATE OR REPLACE FUNCTION public.fp_seed_indicadores(p_fazenda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fp_indicadores (fazenda_id, nome, unidade, direcao, meta_valor, atencao_valor, meta_label, casas_decimais, origem, ordem)
  SELECT p_fazenda_id, x.* FROM (VALUES
    ('Escore de desempenho da equipe','nota 0 a 10','up',6.01,6,'acima de 6,0',2,'escore',1),
    ('Atividades concluídas','% no mês','up',60.1,60,'acima de 60%',0,'atividades',2),
    ('Faltas de colaboradores','no mês','down',5,10,'até 5',0,'manual',3)
  ) AS x(nome,unidade,direcao,meta_valor,atencao_valor,meta_label,casas_decimais,origem,ordem)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fp_indicadores i
    WHERE i.fazenda_id = p_fazenda_id AND i.nome = x.nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_seed_indicadores_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fp_seed_indicadores(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_seed_indicadores ON public.fazendas;
CREATE TRIGGER trg_fp_seed_indicadores
  AFTER INSERT ON public.fazendas
  FOR EACH ROW EXECUTE FUNCTION public.fp_seed_indicadores_trigger();

SELECT public.fp_seed_indicadores(f.id) FROM public.fazendas f;

-- ============================================================
-- 5) Categorias de imprevisto (por fazenda, mesmo padrao do legado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_imprevisto_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, nome)
);

CREATE OR REPLACE FUNCTION public.fp_seed_imprevisto_categorias(p_fazenda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fp_imprevisto_categorias (fazenda_id, nome)
  SELECT p_fazenda_id, c.nome FROM (VALUES
    ('Chuva/Tempo'),('Gado escapou'),('Cerca/instalação'),
    ('Equipamento/veículo'),('Peão indisponível'),('Outro')
  ) AS c(nome)
  ON CONFLICT (fazenda_id, nome) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_seed_imprevisto_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fp_seed_imprevisto_categorias(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_seed_imprevisto ON public.fazendas;
CREATE TRIGGER trg_fp_seed_imprevisto
  AFTER INSERT ON public.fazendas
  FOR EACH ROW EXECUTE FUNCTION public.fp_seed_imprevisto_trigger();

SELECT public.fp_seed_imprevisto_categorias(f.id) FROM public.fazendas f;

-- ============================================================
-- 6) Atividades
-- tipo: 1 Rotina, 2 Estratégica, 3 Gestão, 4 Estruturação, 5 Projeto
-- urgencia: 1 Alta, 2 Média, 3 Baixa
-- dias_semana: boolean[7] seg-dom (exige ao menos um dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.fp_planos(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  local text,
  coordenador_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  executor_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  executor_equipe_id uuid REFERENCES public.fp_equipes(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  tipo smallint NOT NULL DEFAULT 2 CHECK (tipo BETWEEN 1 AND 5),
  urgencia smallint NOT NULL DEFAULT 2 CHECK (urgencia BETWEEN 1 AND 3),
  dias_semana boolean[] NOT NULL DEFAULT '{f,f,f,f,f,f,f}'::boolean[]
    CHECK (cardinality(dias_semana) = 7),
  metodologia text,  -- 2o M
  maquinas text,     -- 3o M
  materiais text,    -- 4o M
  meta text,         -- 5o M
  exige_sessao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fp_atividades_plano ON public.fp_atividades(plano_id);
CREATE INDEX IF NOT EXISTS idx_fp_atividades_fazenda ON public.fp_atividades(fazenda_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fp_atividades_executor_func ON public.fp_atividades(executor_funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fp_atividades_equipe ON public.fp_atividades(executor_equipe_id);

CREATE TRIGGER trg_fp_atividades_updated_at BEFORE UPDATE ON public.fp_atividades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- status: 1 Planejado, 2 Concluído, 3 Em andamento, 4 Atrasado, 5 Pausado
CREATE TABLE IF NOT EXISTS public.fp_atividade_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.fp_atividades(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  semana smallint NOT NULL CHECK (semana BETWEEN 1 AND 53),
  status smallint NOT NULL DEFAULT 1 CHECK (status BETWEEN 1 AND 5),
  observacao text, -- observacao da semana (ex.: local do giro)
  carry_from smallint, -- semana de origem do rollover (marca "atrasada da sem. N")
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, semana)
);
CREATE INDEX IF NOT EXISTS idx_fp_sem_fazenda ON public.fp_atividade_semanas(fazenda_id, semana);

CREATE TRIGGER trg_fp_sem_updated_at BEFORE UPDATE ON public.fp_atividade_semanas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7) Baixas por dia + sessoes de cronometro (opcionais)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_atividade_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.fp_atividades(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  semana smallint NOT NULL CHECK (semana BETWEEN 1 AND 53),
  dia smallint NOT NULL CHECK (dia BETWEEN 0 AND 6), -- 0=seg .. 6=dom
  feita boolean NOT NULL DEFAULT false,
  observacao text,
  foto_url text,
  feita_por_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  feita_por_usuario_id uuid,
  feita_at timestamptz NOT NULL DEFAULT now(),
  tempo_gasto_segundos int, -- derivado de fp_baixa_sessoes
  local_id text, -- idempotencia de sync offline do PWA
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, semana, dia)
);
CREATE INDEX IF NOT EXISTS idx_fp_baixas_fazenda ON public.fp_atividade_baixas(fazenda_id, semana, dia);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_baixas_local_id ON public.fp_atividade_baixas(local_id) WHERE local_id IS NOT NULL;

CREATE TRIGGER trg_fp_baixas_updated_at BEFORE UPDATE ON public.fp_atividade_baixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fp_baixa_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baixa_id uuid NOT NULL REFERENCES public.fp_atividade_baixas(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  inicio_at timestamptz NOT NULL,
  fim_at timestamptz,
  duracao_segundos int,
  trabalhada boolean NOT NULL DEFAULT true,
  motivo_pausa text,
  imprevisto_categoria_id uuid REFERENCES public.fp_imprevisto_categorias(id) ON DELETE SET NULL,
  impacto_minutos int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_sessoes_baixa ON public.fp_baixa_sessoes(baixa_id);
CREATE INDEX IF NOT EXISTS idx_fp_sessoes_abertas ON public.fp_baixa_sessoes(baixa_id) WHERE fim_at IS NULL;

-- Recalcula tempo_gasto_segundos da baixa ao fechar/mexer em sessoes
CREATE OR REPLACE FUNCTION public.fp_recalc_tempo_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baixa uuid;
BEGIN
  v_baixa := COALESCE(NEW.baixa_id, OLD.baixa_id);
  IF v_baixa IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.fp_atividade_baixas b
  SET tempo_gasto_segundos = (
    SELECT COALESCE(SUM(s.duracao_segundos), 0)
    FROM public.fp_baixa_sessoes s
    WHERE s.baixa_id = v_baixa AND s.trabalhada = true AND s.duracao_segundos IS NOT NULL
  )
  WHERE b.id = v_baixa;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_fp_recalc_tempo_baixa
  AFTER INSERT OR UPDATE OR DELETE ON public.fp_baixa_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.fp_recalc_tempo_baixa();

-- Status da semana derivado das baixas (espelha setDay do prototipo):
-- todos os dias planejados feitos -> 2; algum feito -> 3 (preserva 4/5);
-- nenhum feito -> 1 se era 2/3 (preserva 4/5)
CREATE OR REPLACE FUNCTION public.fp_recalc_status_semana()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativ uuid := COALESCE(NEW.atividade_id, OLD.atividade_id);
  v_sem smallint := COALESCE(NEW.semana, OLD.semana);
  v_dias boolean[];
  v_planejados int;
  v_feitos int;
  v_status smallint;
BEGIN
  SELECT a.dias_semana INTO v_dias FROM public.fp_atividades a WHERE a.id = v_ativ;
  IF v_dias IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT count(*) INTO v_planejados
  FROM generate_series(0,6) d WHERE v_dias[d+1];

  SELECT count(*) INTO v_feitos
  FROM generate_series(0,6) d
  WHERE v_dias[d+1] AND EXISTS (
    SELECT 1 FROM public.fp_atividade_baixas b
    WHERE b.atividade_id = v_ativ AND b.semana = v_sem AND b.dia = d AND b.feita
  );

  SELECT s.status INTO v_status FROM public.fp_atividade_semanas s
  WHERE s.atividade_id = v_ativ AND s.semana = v_sem;
  IF v_status IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF v_planejados > 0 AND v_feitos = v_planejados THEN
    UPDATE public.fp_atividade_semanas SET status = 2
    WHERE atividade_id = v_ativ AND semana = v_sem AND status <> 2;
  ELSIF v_feitos > 0 THEN
    UPDATE public.fp_atividade_semanas SET status = 3
    WHERE atividade_id = v_ativ AND semana = v_sem AND status NOT IN (4,5);
  ELSE
    UPDATE public.fp_atividade_semanas SET status = 1
    WHERE atividade_id = v_ativ AND semana = v_sem AND status IN (2,3);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_fp_recalc_status_semana
  AFTER INSERT OR UPDATE OF feita OR DELETE ON public.fp_atividade_baixas
  FOR EACH ROW EXECUTE FUNCTION public.fp_recalc_status_semana();

-- ============================================================
-- 8) Extras (lancamentos fora do plano, por dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  semana smallint NOT NULL CHECK (semana BETWEEN 1 AND 53),
  dia smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),
  nome text NOT NULL,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  equipe_id uuid REFERENCES public.fp_equipes(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  observacao text,
  criado_por_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  criado_por_usuario_id uuid,
  local_id text, -- idempotencia de sync offline
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_extras_fazenda ON public.fp_extras(fazenda_id, semana, dia);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_extras_local_id ON public.fp_extras(local_id) WHERE local_id IS NOT NULL;

-- ============================================================
-- 9) Contrato de resultados + avaliacoes semanais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_contrato_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('tarefa','comportamento')),
  descricao text NOT NULL,
  criterio_id uuid REFERENCES public.fp_criterios(id) ON DELETE SET NULL,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fp_contrato_func ON public.fp_contrato_itens(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fp_contrato_fazenda ON public.fp_contrato_itens(fazenda_id);

CREATE TRIGGER trg_fp_contrato_updated_at BEFORE UPDATE ON public.fp_contrato_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fp_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_item_id uuid NOT NULL REFERENCES public.fp_contrato_itens(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano smallint NOT NULL,
  semana smallint NOT NULL CHECK (semana BETWEEN 1 AND 53),
  nota numeric(3,1) CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10)),
  nsa boolean NOT NULL DEFAULT false,
  avaliador_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  avaliador_usuario_id uuid,
  avaliado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_item_id, ano, semana),
  CHECK (NOT (nsa AND nota IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_fp_aval_fazenda ON public.fp_avaliacoes(fazenda_id, ano, semana);
CREATE INDEX IF NOT EXISTS idx_fp_aval_func ON public.fp_avaliacoes(funcionario_id, ano, semana);

-- ============================================================
-- 10) Recados da semana
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_recados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.fp_planos(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  semana smallint NOT NULL CHECK (semana BETWEEN 1 AND 53),
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, semana)
);

CREATE TRIGGER trg_fp_recados_updated_at BEFORE UPDATE ON public.fp_recados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 11) Templates de atividade (biblioteca + recorrencia)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fp_atividade_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  local text,
  coordenador_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  executor_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  executor_equipe_id uuid REFERENCES public.fp_equipes(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  tipo smallint NOT NULL DEFAULT 2 CHECK (tipo BETWEEN 1 AND 5),
  urgencia smallint NOT NULL DEFAULT 2 CHECK (urgencia BETWEEN 1 AND 3),
  dias_semana boolean[] NOT NULL DEFAULT '{f,f,f,f,f,f,f}'::boolean[]
    CHECK (cardinality(dias_semana) = 7),
  metodologia text,
  maquinas text,
  materiais text,
  meta text,
  rep_a_cada smallint NOT NULL DEFAULT 1, -- repetir a cada N semanas ao aplicar
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fp_templates_fazenda ON public.fp_atividade_templates(fazenda_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_fp_templates_updated_at BEFORE UPDATE ON public.fp_atividade_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 12) RPCs de escrita (espelham setDay/setWeek/rollover do prototipo)
-- ============================================================

-- Baixa de um dia (chamada pelo PWA e pelo web). Mantem baixa como linha
-- viva: feita=false preserva observacao/sessoes ao desmarcar.
CREATE OR REPLACE FUNCTION public.fp_set_dia(
  p_atividade_id uuid,
  p_semana smallint,
  p_dia smallint,
  p_feita boolean,
  p_feita_por_funcionario_id uuid DEFAULT NULL,
  p_feita_por_usuario_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_local_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda uuid;
  v_id uuid;
BEGIN
  SELECT fazenda_id INTO v_fazenda FROM public.fp_atividades WHERE id = p_atividade_id;
  IF v_fazenda IS NULL THEN RAISE EXCEPTION 'atividade nao encontrada'; END IF;

  INSERT INTO public.fp_atividade_baixas
    (atividade_id, fazenda_id, semana, dia, feita, observacao,
     feita_por_funcionario_id, feita_por_usuario_id, feita_at, local_id)
  VALUES
    (p_atividade_id, v_fazenda, p_semana, p_dia, p_feita, p_observacao,
     p_feita_por_funcionario_id, p_feita_por_usuario_id, now(), p_local_id)
  ON CONFLICT (atividade_id, semana, dia) DO UPDATE SET
    feita = EXCLUDED.feita,
    observacao = COALESCE(EXCLUDED.observacao, fp_atividade_baixas.observacao),
    feita_por_funcionario_id = COALESCE(EXCLUDED.feita_por_funcionario_id, fp_atividade_baixas.feita_por_funcionario_id),
    feita_por_usuario_id = COALESCE(EXCLUDED.feita_por_usuario_id, fp_atividade_baixas.feita_por_usuario_id),
    feita_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Status da semana (pincel do plano anual / popup de status).
-- Espelha setWeek: 0/NULL remove; 2 marca todos os dias planejados como feitos;
-- 1 limpa as baixas da semana.
CREATE OR REPLACE FUNCTION public.fp_set_status_semana(
  p_atividade_id uuid,
  p_semana smallint,
  p_status smallint -- 0 remove a semana
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fazenda uuid;
  v_dias boolean[];
BEGIN
  SELECT fazenda_id, dias_semana INTO v_fazenda, v_dias
  FROM public.fp_atividades WHERE id = p_atividade_id;
  IF v_fazenda IS NULL THEN RAISE EXCEPTION 'atividade nao encontrada'; END IF;

  IF p_status IS NULL OR p_status = 0 THEN
    DELETE FROM public.fp_atividade_baixas WHERE atividade_id = p_atividade_id AND semana = p_semana;
    DELETE FROM public.fp_atividade_semanas WHERE atividade_id = p_atividade_id AND semana = p_semana;
    RETURN;
  END IF;

  INSERT INTO public.fp_atividade_semanas (atividade_id, fazenda_id, semana, status)
  VALUES (p_atividade_id, v_fazenda, p_semana, p_status)
  ON CONFLICT (atividade_id, semana) DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  IF p_status = 2 THEN
    INSERT INTO public.fp_atividade_baixas (atividade_id, fazenda_id, semana, dia, feita)
    SELECT p_atividade_id, v_fazenda, p_semana, d, true
    FROM generate_series(0,6) d WHERE v_dias[d+1]
    ON CONFLICT (atividade_id, semana, dia) DO UPDATE SET feita = true, updated_at = now();
  ELSIF p_status = 1 THEN
    DELETE FROM public.fp_atividade_baixas WHERE atividade_id = p_atividade_id AND semana = p_semana;
  END IF;
END;
$$;

-- Rollover semanal: semanas passadas nao concluidas/pausadas viram Atrasado
-- e propagam para a semana seguinte como Planejado com carry_from na origem.
CREATE OR REPLACE FUNCTION public.fp_rollover()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  w record;
  v_cur smallint;
  v_n int := 0;
  v_nx record;
BEGIN
  FOR r IN SELECT id, fazenda_id FROM public.fp_planos WHERE ativo = true AND deleted_at IS NULL LOOP
    v_cur := public.fp_semana_atual(r.id);
    IF v_cur IS NULL OR v_cur < 2 THEN CONTINUE; END IF;

    FOR w IN
      SELECT s.atividade_id, s.semana, s.carry_from
      FROM public.fp_atividade_semanas s
      JOIN public.fp_atividades a ON a.id = s.atividade_id
      WHERE a.plano_id = r.id AND a.deleted_at IS NULL
        AND s.semana < v_cur AND s.status IN (1,3,4)
    LOOP
      UPDATE public.fp_atividade_semanas
      SET status = 4, updated_at = now()
      WHERE atividade_id = w.atividade_id AND semana = w.semana AND status <> 4;
      v_n := v_n + 1;

      IF w.semana < 53 THEN
        SELECT status INTO v_nx FROM public.fp_atividade_semanas
        WHERE atividade_id = w.atividade_id AND semana = w.semana + 1;

        IF NOT FOUND THEN
          INSERT INTO public.fp_atividade_semanas (atividade_id, fazenda_id, semana, status, carry_from)
          VALUES (w.atividade_id, r.fazenda_id, w.semana + 1, 1, COALESCE(w.carry_from, w.semana));
        ELSIF v_nx.status <> 2 THEN
          UPDATE public.fp_atividade_semanas
          SET carry_from = COALESCE(w.carry_from, w.semana), updated_at = now()
          WHERE atividade_id = w.atividade_id AND semana = w.semana + 1
            AND carry_from IS DISTINCT FROM COALESCE(w.carry_from, w.semana);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Cron: segunda-feira 04:00 UTC (~00:00 America/Cuiaba)
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('fp_rollover_semanal');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('fp_rollover_semanal', '0 4 * * 1', 'SELECT public.fp_rollover();');

-- ============================================================
-- 13) RLS + grants
-- Padrao: leitura/escrita para usuario vinculado a fazenda ou peao da fazenda.
-- fp_criterios: linhas globais (fazenda_id NULL) legiveis por todos
-- autenticados; escrita so em linhas da propria fazenda.
-- ============================================================
ALTER TABLE public.fp_equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_equipe_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_indicador_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_imprevisto_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_atividade_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_atividade_baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_baixa_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_contrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_recados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_atividade_templates ENABLE ROW LEVEL SECURITY;

-- Helper local para montar a mesma policy em todas as tabelas fp_*
DO $$
DECLARE
  t text;
  tabs text[] := ARRAY[
    'fp_equipes','fp_equipe_membros','fp_planos','fp_indicadores','fp_indicador_valores',
    'fp_imprevisto_categorias','fp_atividades','fp_atividade_semanas',
    'fp_atividade_baixas','fp_baixa_sessoes','fp_extras','fp_contrato_itens',
    'fp_avaliacoes','fp_recados','fp_atividade_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
       USING (public.user_has_fazenda_access(fazenda_id) OR public.get_peao_fazenda_id() = fazenda_id)',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated
       USING (public.user_has_fazenda_access(fazenda_id) OR public.get_peao_fazenda_id() = fazenda_id)
       WITH CHECK (public.user_has_fazenda_access(fazenda_id) OR public.get_peao_fazenda_id() = fazenda_id)',
      t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- fp_criterios: leitura de globais + da fazenda; escrita so por fazenda
CREATE POLICY fp_criterios_select ON public.fp_criterios FOR SELECT TO authenticated
  USING (fazenda_id IS NULL
         OR public.user_has_fazenda_access(fazenda_id)
         OR public.get_peao_fazenda_id() = fazenda_id);
CREATE POLICY fp_criterios_write ON public.fp_criterios FOR ALL TO authenticated
  USING (public.user_has_fazenda_access(fazenda_id))
  WITH CHECK (public.user_has_fazenda_access(fazenda_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_criterios TO authenticated;

GRANT EXECUTE ON FUNCTION public.fp_semana_atual(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_set_dia(uuid, smallint, smallint, boolean, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_set_status_semana(uuid, smallint, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_rollover() TO authenticated;

-- ============================================================
-- 14) Realtime (postgres_changes) para as tabelas de operacao diaria
-- ============================================================
DO $$
DECLARE
  t text;
  rtabs text[] := ARRAY[
    'fp_atividades','fp_atividade_semanas','fp_atividade_baixas',
    'fp_baixa_sessoes','fp_extras','fp_avaliacoes','fp_contrato_itens',
    'fp_recados','fp_indicador_valores'
  ];
BEGIN
  FOREACH t IN ARRAY rtabs LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN undefined_object OR duplicate_object THEN
      NULL; -- publicacao inexistente ou tabela ja publicada
    END;
  END LOOP;
END $$;
