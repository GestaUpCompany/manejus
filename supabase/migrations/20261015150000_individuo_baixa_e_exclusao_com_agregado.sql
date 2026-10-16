-- ============================================================================
-- Indivíduos / Fase 0.1: baixa manual e exclusão passam a respeitar o agregado (lote_categorias)
-- ============================================================================
-- Achado: a baixa manual (Doação, Descarte, Outro) e a exclusão de um indivíduo só alteravam `individuos`.
-- O `quant_atual` do lote/categoria continuava contando a cabeça. Morte (trigger em registros_morte) e
-- venda/abate/transferência (OS) já baixam o agregado primeiro e o indivíduo acompanha; este é o único
-- caminho que ficava de fora.
--
-- 1) baixar_individuo: status Vivo ou Doado.
--    Doado + motivo Doação          -> Saída agregada com motivo_movimentacao 'Doação'
--    Doado + motivo Descarte/Outro  -> Saída agregada com motivo_movimentacao 'Saída' (tipo_saida NULL)
--    Vivo                           -> estorna (soft-delete) a Saída agregada gerada por uma baixa manual anterior
--    Baixa repetida                 -> estorna a anterior e grava a nova (data/motivo corrigidos)
--    Abatido / Venda Vivo / Transferido NÃO são aceitos: só pela OS. Morto: só pela Caderneta de Morte.
--    Animal baixado por OS ou por morte não pode ser alterado aqui (estorne a OS / a morte).
-- 2) excluir_individuo: soft-delete do animal + estorno das movimentações agregadas do PRÓPRIO animal
--    (registros_movimentacao com individuo_id, 1 cabeça, sem OS). Bloqueia se houver morte ou OS vinculada.
--    Animais que já estavam no agregado (sem movimentação própria) continuam contados.
--
-- Tudo numa transação (uma função). O trigger AFTER INSERT de registros_movimentacao recalcula o quant_atual
-- na baixa; no estorno o recálculo é feito aqui (mesmo padrão de estornar_baixa_os).
-- Retrocompatível: só funções novas; PWA não é afetado. Nenhum dado existente é alterado.
-- Rollback: supabase/rollbacks/20261015150000_individuo_baixa_e_exclusao_com_agregado_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.baixar_individuo(
  p_fazenda_id uuid,
  p_individuo_id uuid,
  p_status text,
  p_data_saida date DEFAULT NULL,
  p_motivo_saida text DEFAULT NULL,
  p_destino_saida text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_ind RECORD;
  v_cat RECORD;
  v_mov RECORD;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_data_mov timestamptz;
  v_corte timestamptz;
  v_motivo_mov tipo_movimentacao_motivo;
  v_nome_usuario text;
  v_lote_nome text;
  v_ident text;
  v_estornadas integer := 0;
  v_mov_id uuid;
  v_quant_atual integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('Vivo', 'Doado') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Venda, abate e transferência são registrados pela Ordem de Serviço; morte pela Caderneta de Morte.');
  END IF;

  SELECT * INTO v_ind
  FROM public.individuos
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Indivíduo não encontrado');
  END IF;

  IF v_ind.status IN ('Abatido', 'Venda Vivo', 'Transferido', 'Morto') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este animal foi baixado por ' || CASE WHEN v_ind.status = 'Morto' THEN 'morte' ELSE 'Ordem de Serviço' END
               || ' (' || v_ind.status || '). Estorne por lá para alterar.');
  END IF;

  -- Valida a entrada ANTES de qualquer escrita (retornos de erro abaixo não desfazem o estorno)
  IF p_status = 'Doado' THEN
    IF p_data_saida IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Informe a data da saída');
    END IF;
    IF p_data_saida > v_hoje THEN
      RETURN jsonb_build_object('success', false, 'error', 'A data da saída não pode ser futura');
    END IF;
    IF p_motivo_saida IS NULL OR p_motivo_saida NOT IN ('Doação', 'Descarte', 'Outro') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Motivo inválido para baixa manual (Doação, Descarte ou Outro)');
    END IF;
  END IF;

  v_ident := COALESCE(NULLIF(v_ind.id_brinco, ''), NULLIF(v_ind.id_chip, ''), NULLIF(v_ind.id_manejo, ''),
                      NULLIF(v_ind.id_provisorio_cria, ''), v_ind.id::text);

  -- Estorna a Saída agregada de uma baixa manual anterior (Vivo -> reativar; Doado de novo -> regravar)
  FOR v_mov IN
    SELECT id, COALESCE(lote_origem_id, lote_destino_id) AS lote_id, categoria
    FROM public.registros_movimentacao
    WHERE individuo_id = v_ind.id
      AND fazenda_id = p_fazenda_id
      AND deleted_at IS NULL
      AND os_id IS NULL
      AND motivo_movimentacao IN ('Saída', 'Doação')
      AND causa_observacao LIKE 'Baixa manual:%'
  LOOP
    UPDATE public.registros_movimentacao SET deleted_at = now(), updated_at = now() WHERE id = v_mov.id;
    v_estornadas := v_estornadas + 1;
    IF v_mov.lote_id IS NOT NULL AND v_mov.categoria IS NOT NULL THEN
      UPDATE public.lote_categorias
      SET quant_atual = public.calculate_quant_atual(v_mov.lote_id, v_mov.categoria), updated_at = now()
      WHERE lote_id = v_mov.lote_id AND LOWER(categoria) = LOWER(v_mov.categoria) AND ativo = true;
    END IF;
  END LOOP;

  IF p_status = 'Vivo' THEN
    UPDATE public.individuos
    SET status = 'Vivo', data_saida = NULL, motivo_saida = NULL, destino_saida = NULL, updated_at = now()
    WHERE id = v_ind.id;
    RETURN jsonb_build_object('success', true, 'status', 'Vivo', 'movimentacoes_estornadas', v_estornadas);
  END IF;

  -- ---- Doado ---- (entradas já validadas acima, antes de qualquer escrita)
  -- Sem lote/categoria não há agregado a baixar: registra só a saída do indivíduo
  IF v_ind.lote_atual IS NOT NULL AND v_ind.categoria IS NOT NULL THEN
    SELECT lc.* INTO v_cat
    FROM public.lote_categorias lc
    JOIN public.lotes l ON l.id = lc.lote_id
    WHERE lc.lote_id = v_ind.lote_atual
      AND l.fazenda_id = p_fazenda_id
      AND LOWER(lc.categoria) = LOWER(v_ind.categoria)
      AND lc.ativo = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A categoria "%" do animal não existe (ativa) no lote dele. Corrija o lote/categoria antes da baixa.', v_ind.categoria
        USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_cat.quant_atual, 0) <= 0 THEN
      RAISE EXCEPTION 'A categoria "%" está com 0 cabeças no lote; a baixa não teria efeito no agregado. Confira o lote do animal.', v_cat.categoria
        USING ERRCODE = 'P0001';
    END IF;

    -- calculate_quant_atual só soma movimentações a partir da criação da categoria (quando há base)
    IF COALESCE(v_cat.quant_base, v_cat.quant_inicial) IS NOT NULL THEN
      v_corte := v_cat.created_at;
    END IF;

    v_data_mov := CASE WHEN p_data_saida = v_hoje THEN now()
                       ELSE ((p_data_saida + time '12:00') AT TIME ZONE 'America/Cuiaba') END;
    IF v_corte IS NOT NULL AND v_data_mov < v_corte THEN
      IF p_data_saida < (v_corte AT TIME ZONE 'America/Cuiaba')::date THEN
        RAISE EXCEPTION 'A data da saída é anterior à criação da categoria "%" no lote (%).',
          v_cat.categoria, to_char(v_corte AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY')
          USING ERRCODE = 'P0001';
      END IF;
      v_data_mov := v_corte;
    END IF;

    v_motivo_mov := CASE WHEN p_motivo_saida = 'Doação' THEN 'Doação' ELSE 'Saída' END::tipo_movimentacao_motivo;
    SELECT u.nome INTO v_nome_usuario FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;
    SELECT nome INTO v_lote_nome FROM public.lotes WHERE id = v_ind.lote_atual;

    INSERT INTO public.registros_movimentacao (
      fazenda_id, nome_usuario, data, lote_origem, destino, numero_cabecas, peso_vivo_atual_kg,
      motivo_movimentacao, causa_observacao, categoria, lote_origem_id, individuo_id
    ) VALUES (
      p_fazenda_id, COALESCE(v_nome_usuario, 'Painel'), v_data_mov, v_lote_nome, NULLIF(btrim(p_destino_saida), ''),
      1, v_ind.peso_atual_kg, v_motivo_mov,
      'Baixa manual: ' || p_motivo_saida || ' de ' || v_ident,
      v_cat.categoria, v_ind.lote_atual, v_ind.id
    )
    RETURNING id INTO v_mov_id;

    SELECT quant_atual INTO v_quant_atual FROM public.lote_categorias WHERE id = v_cat.id;
  END IF;

  UPDATE public.individuos
  SET status = 'Doado',
      data_saida = p_data_saida,
      motivo_saida = p_motivo_saida,
      destino_saida = NULLIF(btrim(p_destino_saida), ''),
      updated_at = now()
  WHERE id = v_ind.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'Doado',
    'movimentacao_id', v_mov_id,
    'movimentacoes_estornadas', v_estornadas,
    'quant_atual_categoria', v_quant_atual
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_individuo(
  p_fazenda_id uuid,
  p_individuo_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_ind RECORD;
  v_par RECORD;
  v_estornadas integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT * INTO v_ind
  FROM public.individuos
  WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Indivíduo não encontrado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_morte
    WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este animal tem um registro de morte. Exclua a morte na Caderneta de Morte antes.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registros_movimentacao
    WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL AND os_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este animal está vinculado a uma Ordem de Serviço. Estorne a OS antes de excluir.');
  END IF;

  -- Pares (lote, categoria) afetados, antes do soft-delete
  CREATE TEMP TABLE IF NOT EXISTS tmp_exclusao_individuo_pares (lote_id uuid, categoria text) ON COMMIT DROP;
  DELETE FROM tmp_exclusao_individuo_pares;
  INSERT INTO tmp_exclusao_individuo_pares (lote_id, categoria)
  SELECT DISTINCT COALESCE(lote_origem_id, lote_destino_id), categoria
  FROM public.registros_movimentacao
  WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND os_id IS NULL AND numero_cabecas = 1
    AND COALESCE(lote_origem_id, lote_destino_id) IS NOT NULL AND categoria IS NOT NULL;

  UPDATE public.registros_movimentacao
  SET deleted_at = now(), updated_at = now()
  WHERE individuo_id = v_ind.id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    AND os_id IS NULL AND numero_cabecas = 1;
  GET DIAGNOSTICS v_estornadas = ROW_COUNT;

  FOR v_par IN SELECT lote_id, categoria FROM tmp_exclusao_individuo_pares LOOP
    UPDATE public.lote_categorias
    SET quant_atual = public.calculate_quant_atual(v_par.lote_id, v_par.categoria), updated_at = now()
    WHERE lote_id = v_par.lote_id AND LOWER(categoria) = LOWER(v_par.categoria) AND ativo = true;
  END LOOP;

  UPDATE public.individuos SET deleted_at = now(), updated_at = now() WHERE id = v_ind.id;

  RETURN jsonb_build_object('success', true, 'movimentacoes_estornadas', v_estornadas);
END;
$function$;

REVOKE ALL ON FUNCTION public.baixar_individuo(uuid, uuid, text, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.excluir_individuo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.baixar_individuo(uuid, uuid, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_individuo(uuid, uuid) TO authenticated;
