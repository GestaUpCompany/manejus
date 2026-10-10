-- Curral x lote 1:1, parte 2: constraints
--
-- Aplicar DEPOIS de 20261010100000_curral_lote_1a1_funcoes.sql (as funcoes ja
-- respeitam a convencao de datas; sem elas, trocas no mesmo dia violariam estas
-- constraints). Os dados legados foram limpos antes (docs/HISTORICO.md, "Limpeza do
-- historico de ocupacao de currais"), mas a migration confere e aborta com mensagem
-- clara se ainda houver violacao.
--
-- Garante, em qualquer data (data_final inclusiva):
--   * um curral nao tem duas ocupacoes que se sobrepoem;
--   * um lote nao tem duas ocupacoes que se sobrepoem (nao ocupa dois currais ao mesmo tempo);
--   * data_final >= data_inicial;
--   * currais.lote_id unico entre currais nao excluidos.
--
-- Rollback: supabase/rollbacks/20261010101000_curral_lote_1a1_constraints_rollback.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
DECLARE
  v_curral int;
  v_lote int;
  v_datas int;
  v_currais int;
BEGIN
  SELECT count(*) INTO v_curral
    FROM public.lote_curral_historico a
    JOIN public.lote_curral_historico b
      ON a.curral_id = b.curral_id AND a.id < b.id
     AND a.data_inicial <= COALESCE(b.data_final, 'infinity'::date)
     AND b.data_inicial <= COALESCE(a.data_final, 'infinity'::date);

  SELECT count(*) INTO v_lote
    FROM public.lote_curral_historico a
    JOIN public.lote_curral_historico b
      ON a.lote_id = b.lote_id AND a.id < b.id
     AND a.data_inicial <= COALESCE(b.data_final, 'infinity'::date)
     AND b.data_inicial <= COALESCE(a.data_final, 'infinity'::date);

  SELECT count(*) INTO v_datas
    FROM public.lote_curral_historico
   WHERE data_final < data_inicial;

  SELECT count(*) INTO v_currais
    FROM (
      SELECT lote_id FROM public.currais
       WHERE lote_id IS NOT NULL AND deleted_at IS NULL
       GROUP BY lote_id HAVING count(*) > 1
    ) x;

  IF v_curral + v_lote + v_datas + v_currais > 0 THEN
    RAISE EXCEPTION 'Dados violam o 1:1 curral x lote: sobreposicoes por curral=%, por lote=%, datas invertidas=%, lotes em mais de um curral=%. Corrija antes de aplicar.',
      v_curral, v_lote, v_datas, v_currais;
  END IF;
END $$;

ALTER TABLE public.lote_curral_historico
  ADD CONSTRAINT lch_datas_validas
    CHECK (data_final IS NULL OR data_final >= data_inicial),
  ADD CONSTRAINT lch_sem_sobreposicao_curral
    EXCLUDE USING gist (
      curral_id WITH =,
      daterange(data_inicial, data_final, '[]') WITH &&
    ),
  ADD CONSTRAINT lch_sem_sobreposicao_lote
    EXCLUDE USING gist (
      lote_id WITH =,
      daterange(data_inicial, data_final, '[]') WITH &&
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_currais_lote_unico
  ON public.currais (lote_id)
  WHERE lote_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON CONSTRAINT lch_sem_sobreposicao_curral ON public.lote_curral_historico IS
  'Curral x lote 1:1: um curral nao tem duas ocupacoes sobrepostas (data_final inclusiva; o dia da troca e do lote que entra).';
COMMENT ON CONSTRAINT lch_sem_sobreposicao_lote ON public.lote_curral_historico IS
  'Curral x lote 1:1: um lote nao ocupa dois currais ao mesmo tempo.';
