-- ============================================================================
-- Histórico completo de dietas (formulações) e de alterações em insumos
-- ============================================================================
-- Objetivo: reconstruir a linha de vida nutricional do lote. Cada alteração
-- crítica de uma dieta (composição, parâmetros, categorias/GMD) ou de um insumo
-- usado por ela (preço, teor de MS, nome, tipo, ativo) gera uma VERSÃO completa
-- da dieta com período de vigência. Cruzando planos_nutricionais (data_inicio /
-- data_fim) com as versões, sabe-se qual composição o lote consumiu em cada dia.
--
-- 1) formulacoes_versoes: foto append-only (dados + composição + GMD por categoria)
-- 2) insumos_edicoes: antes/depois append-only das alterações de insumo
-- 3) _registrar_versao_formulacao: único ponto de escrita, com dedupe por hash
-- 4) trigger em insumos: registra edição e gera versão nas dietas que o usam
-- 5) backfill: versão 1 de cada formulação existente
--
-- A trigger legada trg_snapshot_formulacao / formulacoes_historico (migration C)
-- é mantida; fica como histórico parcial anterior a esta migration.
-- Alterações anteriores a esta migration não são recuperáveis (composição nunca
-- foi gravada).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) formulacoes_versoes
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.formulacoes_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  formulacao_id uuid NOT NULL,
  versao integer NOT NULL,
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  vigente_ate timestamptz,
  origem text NOT NULL CHECK (origem IN ('edicao_dieta', 'alteracao_insumo', 'backfill')),
  insumo_origem_id uuid,
  dados jsonb NOT NULL,
  composicao jsonb NOT NULL DEFAULT '[]'::jsonb,
  categorias_gmd jsonb NOT NULL DEFAULT '[]'::jsonb,
  hash text NOT NULL,
  usuario_id uuid,
  motivo text,
  UNIQUE (formulacao_id, versao)
);

COMMENT ON TABLE public.formulacoes_versoes IS
'Versões completas das dietas (append-only). dados = linha de formulacoes (sem updated_at/versao); composicao = insumos com formula_teor_ms e teor_ms/preco_ton_mn do insumo NO MOMENTO; categorias_gmd = GMD por categoria. vigente_ate nulo = versão atual. Sem FK para formulação/insumo para sobreviver a exclusões. Escrita só por _registrar_versao_formulacao.';

CREATE INDEX IF NOT EXISTS idx_formulacoes_versoes_form ON public.formulacoes_versoes (formulacao_id, vigente_desde DESC);
CREATE INDEX IF NOT EXISTS idx_formulacoes_versoes_fazenda ON public.formulacoes_versoes (fazenda_id);

ALTER TABLE public.formulacoes_versoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS formulacoes_versoes_leitura ON public.formulacoes_versoes;
CREATE POLICY formulacoes_versoes_leitura ON public.formulacoes_versoes FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.formulacoes_versoes FROM anon;
REVOKE ALL ON public.formulacoes_versoes FROM authenticated;
GRANT SELECT ON public.formulacoes_versoes TO authenticated;

-- --------------------------------------------------------------------------
-- 2) insumos_edicoes
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insumos_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  insumo_id uuid NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.insumos_edicoes IS
'Histórico append-only das alterações de insumo (nome, tipo, teor_ms, preco_ton_mn, ativo). Gravado por trigger em insumos. Sem FK para sobreviver a exclusões.';

CREATE INDEX IF NOT EXISTS idx_insumos_edicoes_insumo ON public.insumos_edicoes (insumo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_insumos_edicoes_fazenda ON public.insumos_edicoes (fazenda_id);

ALTER TABLE public.insumos_edicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insumos_edicoes_leitura ON public.insumos_edicoes;
CREATE POLICY insumos_edicoes_leitura ON public.insumos_edicoes FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.insumos_edicoes FROM anon;
REVOKE ALL ON public.insumos_edicoes FROM authenticated;
GRANT SELECT ON public.insumos_edicoes TO authenticated;

-- --------------------------------------------------------------------------
-- 3) _registrar_versao_formulacao (único ponto de escrita, dedupe por hash)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._registrar_versao_formulacao(
  p_formulacao_id uuid,
  p_origem text,
  p_insumo_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_form RECORD;
  v_dados jsonb;
  v_comp jsonb;
  v_gmd jsonb;
  v_hash text;
  v_ultima RECORD;
  v_versao integer;
  v_agora timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_form FROM public.formulacoes WHERE id = p_formulacao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_dados := to_jsonb(v_form) - 'updated_at' - 'versao';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'insumo_id', fi.insumo_id,
           'nome', i.nome,
           'tipo', i.tipo,
           'formula_teor_ms', fi.formula_teor_ms,
           'ordem', fi.ordem,
           'teor_ms', i.teor_ms,
           'preco_ton_mn', i.preco_ton_mn
         ) ORDER BY fi.ordem, fi.insumo_id), '[]'::jsonb)
  INTO v_comp
  FROM public.formulacao_insumos fi
  JOIN public.insumos i ON i.id = fi.insumo_id
  WHERE fi.formulacao_id = p_formulacao_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'categoria', fcg.categoria,
           'gmd', fcg.gmd,
           'ordem', fcg.ordem
         ) ORDER BY fcg.ordem, fcg.categoria), '[]'::jsonb)
  INTO v_gmd
  FROM public.formulacao_categorias_gmd fcg
  WHERE fcg.formulacao_id = p_formulacao_id;

  v_hash := md5(v_dados::text || v_comp::text || v_gmd::text);

  SELECT * INTO v_ultima FROM public.formulacoes_versoes
  WHERE formulacao_id = p_formulacao_id
  ORDER BY versao DESC LIMIT 1;

  IF FOUND AND v_ultima.hash = v_hash THEN
    RETURN v_ultima.versao;
  END IF;

  v_versao := COALESCE(v_ultima.versao, 0) + 1;

  IF FOUND THEN
    UPDATE public.formulacoes_versoes SET vigente_ate = v_agora WHERE id = v_ultima.id;
  END IF;

  INSERT INTO public.formulacoes_versoes
    (fazenda_id, formulacao_id, versao, vigente_desde, origem, insumo_origem_id,
     dados, composicao, categorias_gmd, hash, usuario_id, motivo)
  VALUES
    (v_form.fazenda_id, p_formulacao_id, v_versao, v_agora, p_origem, p_insumo_id,
     v_dados, v_comp, v_gmd, v_hash, auth.uid(), NULLIF(btrim(p_motivo), ''));

  RETURN v_versao;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._registrar_versao_formulacao(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4) Trigger em insumos: registra a edição e versiona as dietas que o usam
-- --------------------------------------------------------------------------
-- O nome começa depois de trigger_recalc_formulacoes_on_insumo (ordem alfabética
-- dos AFTER triggers), então o recálculo dos derivados já ocorreu quando a versão
-- é fotografada.
CREATE OR REPLACE FUNCTION public.trigger_registrar_edicao_insumo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_formulacao_id uuid;
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.teor_ms IS DISTINCT FROM OLD.teor_ms
     OR NEW.preco_ton_mn IS DISTINCT FROM OLD.preco_ton_mn
     OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN

    INSERT INTO public.insumos_edicoes (fazenda_id, insumo_id, antes, depois, usuario_id)
    VALUES (
      NEW.fazenda_id, NEW.id,
      jsonb_build_object('nome', OLD.nome, 'tipo', OLD.tipo, 'teor_ms', OLD.teor_ms,
                         'preco_ton_mn', OLD.preco_ton_mn, 'ativo', OLD.ativo),
      jsonb_build_object('nome', NEW.nome, 'tipo', NEW.tipo, 'teor_ms', NEW.teor_ms,
                         'preco_ton_mn', NEW.preco_ton_mn, 'ativo', NEW.ativo),
      auth.uid()
    );

    FOR v_formulacao_id IN
      SELECT DISTINCT formulacao_id FROM public.formulacao_insumos WHERE insumo_id = NEW.id
    LOOP
      PERFORM public._registrar_versao_formulacao(v_formulacao_id, 'alteracao_insumo', NEW.id, NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_registrar_edicao_insumo ON public.insumos;
CREATE TRIGGER trigger_registrar_edicao_insumo
  AFTER UPDATE ON public.insumos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_registrar_edicao_insumo();

-- --------------------------------------------------------------------------
-- 5) Backfill: versão 1 de cada formulação existente
-- --------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.formulacoes LOOP
    PERFORM public._registrar_versao_formulacao(r.id, 'backfill', NULL, 'Estado inicial no início do histórico');
  END LOOP;
  -- A primeira versão vale desde a criação da formulação (quando conhecida).
  UPDATE public.formulacoes_versoes v
  SET vigente_desde = COALESCE((to_jsonb(f)->>'created_at')::timestamptz, v.vigente_desde)
  FROM public.formulacoes f
  WHERE v.formulacao_id = f.id AND v.versao = 1 AND v.origem = 'backfill';
END;
$$;
