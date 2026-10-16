-- Volta a aplicar_manejo_curral da migration 20261016240000 e remove as colunas do tratamento.
-- Atenção: as aplicações sanitárias já geradas (local_id 'curral:...') continuam em aplicacoes_sanitarias.
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

REVOKE EXECUTE ON FUNCTION public.aplicar_manejo_curral(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_manejo_curral(uuid, uuid) TO authenticated;

ALTER TABLE public.registros_manejo_curral DROP COLUMN IF EXISTS aplicacao_id, DROP COLUMN IF EXISTS sem_tratamento;
ALTER TABLE public.sessoes_manejo_curral
  DROP CONSTRAINT IF EXISTS sessoes_manejo_curral_tratamento_tipo_check,
  DROP COLUMN IF EXISTS tratamento_diagnostico, DROP COLUMN IF EXISTS tratamento_intervalo_dias, DROP COLUMN IF EXISTS tratamento_carencia_dias,
  DROP COLUMN IF EXISTS tratamento_validade, DROP COLUMN IF EXISTS tratamento_lote_produto, DROP COLUMN IF EXISTS tratamento_via,
  DROP COLUMN IF EXISTS tratamento_dose, DROP COLUMN IF EXISTS tratamento_principio_ativo, DROP COLUMN IF EXISTS tratamento_produto_nome,
  DROP COLUMN IF EXISTS tratamento_medicamento_id, DROP COLUMN IF EXISTS tratamento_tipo;
