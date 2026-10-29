-- ============================================================================
-- detalhar_tropa passa a receber p_fazenda_id
-- ============================================================================
-- Mesmo padrão de atribuir_plano_em_massa: a RPC mutável prova a fazenda (guard_w_fazenda) e confere que
-- a categoria pertence a ela. Também permite exercitar a função pelo canal de teste (scripts/teste-api.mjs),
-- cujo guardrail aborta RPC mutável sem p_fazenda_id.
-- Troca de assinatura: DROP da versão (uuid, jsonb) criada em 20261028100000 e recriação com 3 parâmetros.
-- Rollback: supabase/rollbacks/20261028110000_detalhar_tropa_exige_fazenda_rollback.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.detalhar_tropa(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.detalhar_tropa(
  p_fazenda_id uuid,
  p_lote_categoria_id uuid,
  p_divisao jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equideos CONSTANT text[] := ARRAY['cavalo', 'égua', 'jumento', 'jumenta', 'burro', 'mula'];
  v_origem public.lote_categorias%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_saldo integer;
  v_soma integer := 0;
  v_item record;
  v_slug text;
  v_qtd integer;
  v_sexo text;
  v_gmd numeric;
  v_nova jsonb;
  v_novo_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_vistos text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.guard_w_fazenda(p_fazenda_id);

  IF p_divisao IS NULL OR jsonb_typeof(p_divisao) <> 'object' OR p_divisao = '{}'::jsonb THEN
    RAISE EXCEPTION 'Informe a divisão da tropa por espécie e sexo.';
  END IF;

  SELECT lc.* INTO v_origem
  FROM public.lote_categorias lc
  JOIN public.lotes l ON l.id = lc.lote_id
  WHERE lc.id = p_lote_categoria_id
    AND l.fazenda_id = p_fazenda_id
    AND lc.ativo = true
    AND lc.data_fim IS NULL
  FOR UPDATE OF lc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada nesta fazenda ou já encerrada.';
  END IF;
  IF lower(btrim(v_origem.categoria)) <> 'tropa' THEN
    RAISE EXCEPTION 'Só a categoria "tropa" pode ser detalhada por espécie e sexo.';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = v_origem.lote_id;

  -- Conversão só sobre saldo sem histórico: com registro, os lançamentos antigos ficariam na categoria encerrada.
  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao m
    WHERE (m.lote_origem_id = v_origem.lote_id OR m.lote_destino_id = v_origem.lote_id)
      AND lower(m.categoria) = 'tropa' AND m.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.registros_morte r
    WHERE r.lote_id = v_origem.lote_id AND lower(r.categoria) = 'tropa' AND r.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta tropa já tem morte ou movimentação registrada e não pode ser convertida pela tela. Fale com o suporte.';
  END IF;

  v_saldo := COALESCE(v_origem.quant_base, v_origem.quant_inicial, 0);
  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'A tropa não tem saldo a dividir.';
  END IF;

  -- Valida a divisão antes de escrever qualquer coisa.
  FOR v_item IN SELECT key, value FROM jsonb_each(p_divisao) LOOP
    v_slug := public.categoria_canonica(v_item.key);
    IF v_slug IS NULL OR NOT (v_slug = ANY (v_equideos)) THEN
      RAISE EXCEPTION 'Categoria inválida na divisão: %', v_item.key;
    END IF;
    IF v_slug = ANY (v_vistos) THEN
      RAISE EXCEPTION 'Categoria repetida na divisão: %', v_slug;
    END IF;
    v_vistos := v_vistos || v_slug;
    IF jsonb_typeof(v_item.value) <> 'number' OR (v_item.value #>> '{}') !~ '^[0-9]+$' OR (v_item.value #>> '{}')::integer <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para %: informe um inteiro maior que zero.', v_slug;
    END IF;
    v_soma := v_soma + (v_item.value #>> '{}')::integer;
  END LOOP;

  IF v_soma <> v_saldo THEN
    RAISE EXCEPTION 'A soma da divisão (%) deve ser igual ao saldo da tropa (%).', v_soma, v_saldo;
  END IF;

  FOR v_item IN SELECT key, value FROM jsonb_each(p_divisao) LOOP
    v_slug := public.categoria_canonica(v_item.key);
    v_qtd := (v_item.value #>> '{}')::integer;
    v_sexo := CASE WHEN v_slug IN ('cavalo', 'jumento', 'burro') THEN 'macho' ELSE 'fêmea' END;

    -- GMD da formulação do lote para a categoria nova; sem correspondência, mantém o da tropa.
    v_gmd := NULL;
    IF v_lote.formulacao_id IS NOT NULL THEN
      SELECT fcg.gmd INTO v_gmd
      FROM public.formulacao_categorias_gmd fcg
      WHERE fcg.formulacao_id = v_lote.formulacao_id
        AND lower(btrim(fcg.categoria)) = v_slug
      LIMIT 1;
      IF v_gmd IS NOT NULL AND v_lote.destino = 'enfermaria' THEN
        v_gmd := v_gmd * 0.5;
      END IF;
    END IF;

    v_novo_id := gen_random_uuid();
    v_nova := to_jsonb(v_origem) || jsonb_build_object(
      'id', v_novo_id,
      'categoria', v_slug,
      'sexo', v_sexo,
      'quant_inicial', v_qtd,
      'quant_atual', v_qtd,
      'quant_base', NULL,
      'morte', 0, 'consumo', 0, 'abate', 0, 'transf_entrada', 0, 'transf_saida', 0,
      'ativo', true,
      'data_fim', NULL,
      'categoria_origem_id', v_origem.id,
      'created_at', now(),
      'updated_at', now()
    );
    IF v_gmd IS NOT NULL THEN
      v_nova := v_nova || jsonb_build_object('gmd', v_gmd::text);
    END IF;

    INSERT INTO public.lote_categorias
    SELECT * FROM jsonb_populate_record(NULL::public.lote_categorias, v_nova);

    v_ids := v_ids || to_jsonb(v_novo_id);
  END LOOP;

  UPDATE public.lote_categorias
  SET ativo = false, data_fim = now()
  WHERE id = v_origem.id;

  RETURN v_ids;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.detalhar_tropa(uuid, uuid, jsonb) TO authenticated;
