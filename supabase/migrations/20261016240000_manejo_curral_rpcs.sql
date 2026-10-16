-- ============================================================================
-- Manejo de curral / etapa 2: RPCs (aplicar a sessão, confirmar e descartar designações de lote)
-- ============================================================================
-- Nenhuma RPC altera quant_atual, peso ou consumo de lote_categorias por conta própria:
--   * aplicar_manejo_curral(p_fazenda_id, p_sessao_id): chamada pelo PWA (peão incluído) depois que a sessão e as
--     linhas sincronizam. Processa só linhas 'pendente' (idempotente). Por linha:
--       - acha o animal (individuo_id, ou identificador lido / provisório entre os Vivos da fazenda);
--       - sem animal: cadastra um novo SEM movimentação (a cabeça já está no agregado), se a linha trouxe
--         lote de destino, categoria, sexo e raça; senão a linha vira 'conflito';
--       - brinco/chip/manejo novos: se o número já é de outro animal não excluído (vivo ou baixado), a linha vira
--         'conflito' (vence quem sincronizou primeiro); senão atualiza o animal (o histórico sai pelo trigger
--         de individuo_identificacoes);
--       - lote de destino diferente do atual: cria UMA pendência de designação aberta por animal; não move ninguém.
--     O peso da linha NÃO é gravado em individuos nem em lote_categorias (fica só na linha).
--     Cada linha roda em sub-bloco: um erro inesperado marca só aquela linha como 'conflito'.
--   * confirmar_designacao_lote(p_fazenda_id, p_pendencia_ids): só painel. As pendências devem ter mesma origem, destino
--     e categoria do animal; gera UMA movimentação agregada 'Entrevero' (origem -> destino, N cabeças) e liga os animais
--     pela ponte evento_individuos (vincular_individuos_movimentacao). É o único ponto que muda contagem.
--   * descartar_designacao_lote(p_fazenda_id, p_pendencia_ids): só painel; marca 'descartada', sem mexer em nada.
-- Rollback: supabase/rollbacks/20261016240000_manejo_curral_rpcs_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_manejo_curral(p_fazenda_id uuid, p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_r public.registros_manejo_curral%ROWTYPE;
  v_ind public.individuos%ROWTYPE;
  v_achou boolean;
  v_lido text;
  v_brinco text;
  v_chip text;
  v_manejo text;
  v_slug text;
  v_cat public.categorias_animais%ROWTYPE;
  v_msg text;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_aplicados integer := 0;
  v_conflitos integer := 0;
  v_pendencias integer := 0;
  v_criados integer := 0;
BEGIN
  IF NOT public.caller_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sessoes_manejo_curral s
                 WHERE s.id = p_sessao_id AND s.fazenda_id = p_fazenda_id AND s.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada');
  END IF;

  FOR v_r IN
    SELECT * FROM public.registros_manejo_curral
    WHERE sessao_id = p_sessao_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
      AND status_processamento = 'pendente'
    ORDER BY ordem NULLS LAST, created_at
  LOOP
    BEGIN
      v_msg := NULL;
      v_achou := false;
      v_lido := NULLIF(btrim(COALESCE(v_r.identificador_lido, '')), '');
      v_brinco := NULLIF(btrim(COALESCE(v_r.id_brinco_novo, '')), '');
      v_chip := NULLIF(btrim(COALESCE(v_r.id_chip_novo, '')), '');
      v_manejo := NULLIF(btrim(COALESCE(v_r.id_manejo_novo, '')), '');

      -- 1) acha o animal
      IF v_r.individuo_id IS NOT NULL THEN
        SELECT * INTO v_ind FROM public.individuos
        WHERE id = v_r.individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL FOR UPDATE;
        v_achou := FOUND;
      END IF;
      IF NOT v_achou AND (v_lido IS NOT NULL OR NULLIF(btrim(COALESCE(v_r.id_provisorio_anterior, '')), '') IS NOT NULL) THEN
        SELECT * INTO v_ind FROM public.individuos i
        WHERE i.fazenda_id = p_fazenda_id AND i.deleted_at IS NULL AND i.status = 'Vivo'
          AND (upper(i.id_brinco) = upper(v_lido) OR upper(i.id_chip) = upper(v_lido)
               OR upper(i.id_manejo) = upper(v_lido) OR upper(i.id_provisorio_cria) = upper(v_lido)
               OR upper(i.id_provisorio_cria) = upper(btrim(COALESCE(v_r.id_provisorio_anterior, ''))))
        ORDER BY i.created_at LIMIT 1 FOR UPDATE;
        v_achou := FOUND;
      END IF;
      IF v_achou AND v_ind.status <> 'Vivo' THEN
        v_msg := 'O animal não está Vivo (' || v_ind.status || ')';
      END IF;

      -- 2) números novos não podem pertencer a outro animal não excluído (vivo ou baixado)
      IF v_msg IS NULL AND v_brinco IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL
             AND upper(x.id_brinco) = upper(v_brinco) AND (NOT v_achou OR x.id <> v_ind.id)) THEN
        v_msg := 'Brinco ' || v_brinco || ' já pertence a outro animal';
      END IF;
      IF v_msg IS NULL AND v_chip IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL
             AND upper(x.id_chip) = upper(v_chip) AND (NOT v_achou OR x.id <> v_ind.id)) THEN
        v_msg := 'Chip ' || v_chip || ' já pertence a outro animal';
      END IF;
      IF v_msg IS NULL AND v_manejo IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.individuos x WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL
             AND upper(x.id_manejo) = upper(v_manejo) AND (NOT v_achou OR x.id <> v_ind.id)) THEN
        v_msg := 'ID de manejo ' || v_manejo || ' já pertence a outro animal';
      END IF;
      IF v_msg IS NULL AND v_r.lote_destino_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.lotes l WHERE l.id = v_r.lote_destino_id AND l.fazenda_id = p_fazenda_id) THEN
        v_msg := 'Lote de destino não pertence à fazenda';
      END IF;

      -- 3) animal novo: sem movimentação (a cabeça já está no agregado do lote)
      IF v_msg IS NULL AND NOT v_achou THEN
        v_slug := public.categoria_canonica(v_r.categoria);
        IF v_r.lote_destino_id IS NULL OR v_slug IS NULL OR v_r.sexo IS NULL OR v_r.raca IS NULL
           OR (v_brinco IS NULL AND v_chip IS NULL AND v_manejo IS NULL AND NULLIF(btrim(COALESCE(v_r.id_provisorio_anterior, '')), '') IS NULL) THEN
          v_msg := 'Animal não encontrado; para cadastrar um novo informe identificação, lote, categoria, sexo e raça';
        ELSE
          SELECT * INTO v_cat FROM public.categorias_animais WHERE slug = v_slug;
          INSERT INTO public.individuos (
            fazenda_id, id_brinco, id_chip, id_manejo, id_provisorio_cria, sexo, raca, categoria, lote_atual, status, origem,
            data_identificacao
          ) VALUES (
            p_fazenda_id, v_brinco, v_chip, v_manejo, NULLIF(btrim(COALESCE(v_r.id_provisorio_anterior, '')), ''),
            v_r.sexo, v_r.raca, v_cat.nome, v_r.lote_destino_id, 'Vivo', 'Cadastro Manual', v_hoje
          ) RETURNING * INTO v_ind;
          v_criados := v_criados + 1;
          UPDATE public.registros_manejo_curral SET individuo_id = v_ind.id WHERE id = v_r.id;
        END IF;
      ELSIF v_msg IS NULL THEN
        -- 4) animal existente: troca/definição de identificação (histórico pelo trigger de individuo_identificacoes)
        UPDATE public.individuos
        SET id_brinco = COALESCE(v_brinco, id_brinco),
            id_chip = COALESCE(v_chip, id_chip),
            id_manejo = COALESCE(v_manejo, id_manejo),
            data_identificacao = COALESCE(data_identificacao, CASE WHEN v_brinco IS NOT NULL OR v_chip IS NOT NULL THEN v_hoje END),
            updated_at = now()
        WHERE id = v_ind.id
          AND (v_brinco IS NOT NULL OR v_chip IS NOT NULL OR v_manejo IS NOT NULL);
        IF v_r.individuo_id IS NULL THEN
          UPDATE public.registros_manejo_curral SET individuo_id = v_ind.id WHERE id = v_r.id;
        END IF;
      END IF;

      IF v_msg IS NOT NULL THEN
        UPDATE public.registros_manejo_curral
        SET status_processamento = 'conflito', erro = v_msg, updated_at = now() WHERE id = v_r.id;
        v_conflitos := v_conflitos + 1;
        CONTINUE;
      END IF;

      -- 5) designação de lote: vira pendência, nunca move o animal
      IF v_r.lote_destino_id IS NOT NULL AND v_ind.lote_atual IS DISTINCT FROM v_r.lote_destino_id AND v_ind.lote_atual IS NOT NULL THEN
        INSERT INTO public.pendencias_designacao_lote (
          fazenda_id, registro_manejo_id, individuo_id, lote_origem_id, lote_destino_id
        ) VALUES (p_fazenda_id, v_r.id, v_ind.id, v_ind.lote_atual, v_r.lote_destino_id)
        ON CONFLICT (individuo_id) WHERE status = 'aberta'
        DO UPDATE SET registro_manejo_id = EXCLUDED.registro_manejo_id,
                      lote_origem_id = EXCLUDED.lote_origem_id,
                      lote_destino_id = EXCLUDED.lote_destino_id,
                      created_at = now();
        v_pendencias := v_pendencias + 1;
      END IF;

      UPDATE public.registros_manejo_curral
      SET status_processamento = 'aplicado', erro = NULL, updated_at = now() WHERE id = v_r.id;
      v_aplicados := v_aplicados + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.registros_manejo_curral
      SET status_processamento = 'conflito', erro = left(SQLERRM, 300), updated_at = now() WHERE id = v_r.id;
      v_conflitos := v_conflitos + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'aplicados', v_aplicados, 'conflitos', v_conflitos,
    'pendencias_designacao', v_pendencias, 'animais_criados', v_criados);
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_designacao_lote(p_fazenda_id uuid, p_pendencia_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_ids uuid[];
  v_n integer;
  v_origens integer;
  v_destinos integer;
  v_cats integer;
  v_origem uuid;
  v_destino uuid;
  v_cat text;
  v_nome_origem text;
  v_nome_destino text;
  v_nome_usuario text;
  v_lc public.lote_categorias%ROWTYPE;
  v_mov_id uuid;
  v_vinc jsonb;
  v_invalidos integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_pendencia_ids, '{}'::uuid[])) x WHERE x IS NOT NULL) INTO v_ids;
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe ao menos uma pendência');
  END IF;

  -- todas abertas, da fazenda, de animais Vivos que ainda estão no lote de origem da pendência
  SELECT count(*) INTO v_n FROM public.pendencias_designacao_lote p WHERE p.id = ANY (v_ids) AND p.fazenda_id = p_fazenda_id AND p.status = 'aberta';
  IF v_n <> array_length(v_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Há pendência inexistente ou já resolvida');
  END IF;
  SELECT count(*) INTO v_invalidos
  FROM public.pendencias_designacao_lote p
  JOIN public.individuos i ON i.id = p.individuo_id
  WHERE p.id = ANY (v_ids) AND (i.deleted_at IS NOT NULL OR i.status <> 'Vivo' OR i.lote_atual IS DISTINCT FROM p.lote_origem_id);
  IF v_invalidos > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Há animal que não está mais Vivo ou não está mais no lote de origem; descarte essas pendências.');
  END IF;

  SELECT count(DISTINCT p.lote_origem_id), count(DISTINCT p.lote_destino_id), count(DISTINCT public.categoria_canonica(i.categoria)),
         min(p.lote_origem_id::text)::uuid, min(p.lote_destino_id::text)::uuid, min(public.categoria_canonica(i.categoria))
  INTO v_origens, v_destinos, v_cats, v_origem, v_destino, v_cat
  FROM public.pendencias_designacao_lote p JOIN public.individuos i ON i.id = p.individuo_id
  WHERE p.id = ANY (v_ids);
  IF v_origens <> 1 OR v_destinos <> 1 OR v_cats <> 1 OR v_cat IS NULL OR v_origem IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Confirme de cada vez animais com o mesmo lote de origem, de destino e categoria');
  END IF;

  SELECT lc.* INTO v_lc
  FROM public.lote_categorias lc
  WHERE lc.lote_id = v_origem AND lower(btrim(lc.categoria)) = v_cat AND lc.ativo = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'O lote de origem não tem essa categoria ativa');
  END IF;
  IF COALESCE(v_lc.quant_atual, 0) < v_n THEN
    RETURN jsonb_build_object('success', false,
      'error', 'O lote de origem tem ' || COALESCE(v_lc.quant_atual, 0) || ' cabeça(s) nessa categoria; não dá para mover ' || v_n);
  END IF;

  SELECT nome INTO v_nome_origem FROM public.lotes WHERE id = v_origem AND fazenda_id = p_fazenda_id;
  SELECT nome INTO v_nome_destino FROM public.lotes WHERE id = v_destino AND fazenda_id = p_fazenda_id;
  IF v_nome_origem IS NULL OR v_nome_destino IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote de origem ou destino não pertence à fazenda');
  END IF;
  SELECT u.nome INTO v_nome_usuario FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;

  -- único ponto que muda contagem: a movimentação agregada de apartação
  INSERT INTO public.registros_movimentacao (
    fazenda_id, nome_usuario, data, lote_origem, destino, numero_cabecas, motivo_movimentacao, categoria,
    lote_origem_id, lote_destino_id, causa_observacao
  ) VALUES (
    p_fazenda_id, COALESCE(v_nome_usuario, 'Painel'), now(), v_nome_origem, v_nome_destino, v_n, 'Entrevero', v_lc.categoria,
    v_origem, v_destino, 'Designação de lote confirmada (manejo de curral)'
  ) RETURNING id INTO v_mov_id;

  v_vinc := public.vincular_individuos_movimentacao(
    p_fazenda_id, v_mov_id, ARRAY(SELECT p.individuo_id FROM public.pendencias_designacao_lote p WHERE p.id = ANY (v_ids)), false);
  IF COALESCE((v_vinc ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_vinc ->> 'error', 'Falha ao ligar os animais à movimentação') USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pendencias_designacao_lote
  SET status = 'confirmada', resolvida_por = auth.uid(), resolvida_em = now(), evento_movimentacao_id = v_mov_id
  WHERE id = ANY (v_ids);

  RETURN jsonb_build_object('success', true, 'movimentados', v_n, 'movimentacao_id', v_mov_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.descartar_designacao_lote(p_fazenda_id uuid, p_pendencia_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  UPDATE public.pendencias_designacao_lote
  SET status = 'descartada', resolvida_por = auth.uid(), resolvida_em = now()
  WHERE fazenda_id = p_fazenda_id AND status = 'aberta' AND id = ANY (COALESCE(p_pendencia_ids, '{}'::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'descartadas', v_n);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.aplicar_manejo_curral(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirmar_designacao_lote(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.descartar_designacao_lote(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_manejo_curral(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_designacao_lote(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_designacao_lote(uuid, uuid[]) TO authenticated;
