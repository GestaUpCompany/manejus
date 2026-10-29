-- ============================================================================
-- Tropa por espécie e sexo: categorias de equídeos + RPC detalhar_tropa
-- ============================================================================
-- Decisão (28/10/2026): a "tropa" deixa de ser uma categoria única e passa a ter uma categoria por
-- espécie e sexo, igual ao gado (padrão GTA/IBGE):
--   equino:  cavalo / égua      asinino: jumento / jumenta      muar: burro / mula
-- Cada categoria é uma lote_categorias comum: quant_atual vem de calculate_quant_atual(lote, categoria),
-- então morte, saída, transferência e apartação já ficam separadas por espécie sem tocar em triggers.
-- Sem categoria de jovem (potro etc.): equídeos não entram na recategorização.
--
-- detalhar_tropa converte uma categoria 'tropa' legada nas categorias novas, dividindo o saldo:
--   * aborta se a tropa tiver morte ou movimentação registrada (conversão só sobre saldo sem histórico);
--   * a soma da divisão tem que ser igual ao saldo da tropa;
--   * cria uma lote_categorias por categoria informada (campos copiados da tropa) e encerra a tropa
--     (ativo=false, data_fim=now()), tudo na mesma transação.
-- Rollback: supabase/rollbacks/20261028100000_equideos_categorias_e_detalhar_tropa_rollback.sql
-- ============================================================================

INSERT INTO public.categorias_animais (slug, nome, sexo, ordem) VALUES
  ('cavalo',  'Cavalo',  'Macho', 80),
  ('égua',    'Égua',    'Fêmea', 81),
  ('jumento', 'Jumento', 'Macho', 82),
  ('jumenta', 'Jumenta', 'Fêmea', 83),
  ('burro',   'Burro',   'Macho', 84),
  ('mula',    'Mula',    'Fêmea', 85)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categoria_aliases (alias, slug, motivo) VALUES
  ('egua', 'égua', 'sem acento')
ON CONFLICT (alias) DO NOTHING;

CREATE OR REPLACE FUNCTION public.detalhar_tropa(
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
  PERFORM public.guard_w_lote_categoria(p_lote_categoria_id);

  IF p_divisao IS NULL OR jsonb_typeof(p_divisao) <> 'object' OR p_divisao = '{}'::jsonb THEN
    RAISE EXCEPTION 'Informe a divisão da tropa por espécie e sexo.';
  END IF;

  SELECT * INTO v_origem
  FROM public.lote_categorias
  WHERE id = p_lote_categoria_id AND ativo = true AND data_fim IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada ou já encerrada.';
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

GRANT EXECUTE ON FUNCTION public.detalhar_tropa(uuid, jsonb) TO authenticated;
