-- ============================================================================
-- Maternidade: exclusão pelo painel desfaz tudo que o parto causou
-- ============================================================================
-- Um INSERT em registros_maternidade cria a cria (individuos), pode criar a mãe (origem NULL), pode criar a
-- categoria Bezerro/Bezerra ao Pé no lote (quant_inicial 1), gera notificações "Indivíduo criado
-- automaticamente" e recalcula quant_atual. O soft-delete isolado só estornava a cria (trg_maternidade_estorna_cria).
--
-- Esta migration adiciona:
--   1. individuo_usos_do_parto: lista os motivos pelos quais um animal tem outro uso além do parto.
--   2. previa_exclusao_maternidade: prévia somente leitura do que a exclusão desfaz (e se está bloqueada).
--   3. excluir_registro_maternidade: soft-delete do parto + estorno da cria (gatilho existente), remoção das
--      notificações, mãe opcional (p_excluir_mae) ou recálculo dela, e recálculo/desativação da categoria do lote.
-- Decisões (23/10/2026): cria com outro uso BLOQUEIA a exclusão; a mãe criada pelo parto só é excluída se o
-- usuário marcar. quant_inicial é imutável (20260813170000): categoria criada pelo parto é desativada só quando
-- nenhum outro parto/movimentação/morte a usa; senão é mantida e o retorno avisa.
-- Impacto no PWA: nenhum no contrato. Rollback:
-- supabase/rollbacks/20261023100000_excluir_registro_maternidade_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.individuo_usos_do_parto(
  p_individuo_id uuid,
  p_parto_id uuid,
  p_ignorar_filho uuid DEFAULT NULL
)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (SELECT 1 FROM registros_maternidade m WHERE m.id <> p_parto_id AND m.deleted_at IS NULL
             AND p_individuo_id IN (m.individuo_id_mae, m.individuo_id_cria, m.individuo_id_mae_adotiva)) THEN
    v := v || 'outro parto'; END IF;
  IF EXISTS (SELECT 1 FROM individuos f WHERE f.deleted_at IS NULL AND f.id IS DISTINCT FROM p_ignorar_filho
             AND p_individuo_id IN (f.mae, f.mae_adotiva_id, f.pai)) THEN
    v := v || 'filhos cadastrados'; END IF;
  IF EXISTS (SELECT 1 FROM aplicacoes_sanitarias x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'aplicações sanitárias'; END IF;
  IF EXISTS (SELECT 1 FROM eventos_reprodutivos x WHERE (x.individuo_id = p_individuo_id OR x.touro_id = p_individuo_id) AND x.deleted_at IS NULL) THEN
    v := v || 'eventos reprodutivos'; END IF;
  IF EXISTS (SELECT 1 FROM registros_enfermaria x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'enfermaria'; END IF;
  IF EXISTS (SELECT 1 FROM registros_manejo_curral x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'manejo de curral'; END IF;
  IF EXISTS (SELECT 1 FROM registros_morte x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'morte'; END IF;
  IF EXISTS (SELECT 1 FROM registros_movimentacao x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'movimentação'; END IF;
  IF EXISTS (SELECT 1 FROM registros_pesagem x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'pesagem'; END IF;
  IF EXISTS (SELECT 1 FROM evento_individuos x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'eventos vinculados'; END IF;
  IF EXISTS (SELECT 1 FROM pendencias_designacao_lote x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'pendência de designação de lote'; END IF;
  IF EXISTS (SELECT 1 FROM lote_historico x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'histórico de lote'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.previa_exclusao_maternidade(p_id uuid, p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  p registros_maternidade%ROWTYPE;
  c individuos%ROWTYPE;
  m individuos%ROWTYPE;
  v_cria_criada boolean := false;
  v_cria_motivos text[] := ARRAY[]::text[];
  v_mae_criada boolean := false;
  v_mae_elegivel boolean := false;
  v_cat text;
  v_lc lote_categorias%ROWTYPE;
  v_cat_criada boolean := false;
  v_cat_outros boolean := false;
  v_notif integer := 0;
BEGIN
  SELECT * INTO p FROM registros_maternidade WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído'; END IF;

  IF p.individuo_id_cria IS NOT NULL THEN
    SELECT * INTO c FROM individuos WHERE id = p.individuo_id_cria AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
    IF FOUND AND c.origem = 'Nascimento' AND abs(extract(epoch FROM (c.created_at - p.created_at))) <= 120 THEN
      v_cria_criada := true;
      v_cria_motivos := individuo_usos_do_parto(c.id, p.id);
      SELECT count(*) INTO v_notif FROM notificacoes n
      WHERE n.fazenda_id = p_fazenda_id AND n.titulo = 'Indivíduo criado automaticamente'
        AND n.acao_url = '/controller/individuos/' || c.id;
    END IF;
  END IF;

  IF p.individuo_id_mae IS NOT NULL THEN
    SELECT * INTO m FROM individuos WHERE id = p.individuo_id_mae AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
    IF FOUND AND m.origem IS NULL AND m.status = 'Vivo'
       AND abs(extract(epoch FROM (m.created_at - p.created_at))) <= 120 THEN
      v_mae_criada := true;
      v_mae_elegivel := cardinality(individuo_usos_do_parto(m.id, p.id, p.individuo_id_cria)) = 0;
    END IF;
  END IF;

  IF p.lote_id IS NOT NULL AND p.sexo IS NOT NULL
     AND NOT (COALESCE(p.tipo_parto, '[]'::jsonb) ? 'Aborto' OR COALESCE(p.tipo_parto, '[]'::jsonb) ? 'Natimorto') THEN
    v_cat := CASE WHEN p.sexo = 'Fêmea' THEN 'Bezerra ao Pé' ELSE 'Bezerro ao Pé' END;
    SELECT * INTO v_lc FROM lote_categorias
    WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true LIMIT 1;
    IF FOUND THEN
      v_cat_criada := v_lc.quant_inicial = 1 AND v_lc.quant_base IS NULL
        AND abs(extract(epoch FROM (v_lc.created_at - (p.data + interval '1 second')))) < 1;
      v_cat_outros := EXISTS (
          SELECT 1 FROM registros_maternidade o WHERE o.id <> p.id AND o.deleted_at IS NULL AND o.lote_id = p.lote_id
            AND o.sexo = p.sexo AND (o.tipo_parto IS NULL OR NOT (o.tipo_parto ? 'Aborto' OR o.tipo_parto ? 'Natimorto')))
        OR EXISTS (SELECT 1 FROM registros_movimentacao r WHERE r.deleted_at IS NULL AND LOWER(r.categoria) = LOWER(v_cat)
            AND p.lote_id IN (r.lote_origem_id, r.lote_destino_id))
        OR EXISTS (SELECT 1 FROM registros_morte r WHERE r.deleted_at IS NULL AND r.lote_id = p.lote_id AND LOWER(r.categoria) = LOWER(v_cat));
    ELSE
      v_cat := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'pode_excluir', cardinality(v_cria_motivos) = 0,
    'cria', jsonb_build_object('id', p.individuo_id_cria, 'criada_pelo_parto', v_cria_criada, 'motivos_bloqueio', to_jsonb(v_cria_motivos)),
    'mae', jsonb_build_object('id', p.individuo_id_mae, 'criada_pelo_parto', v_mae_criada, 'elegivel_exclusao', v_mae_elegivel),
    'categoria', jsonb_build_object('nome', v_cat, 'criada_pelo_parto', v_cat_criada, 'tem_outros_usos', v_cat_outros),
    'notificacoes', v_notif
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_registro_maternidade(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_excluir_mae boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p registros_maternidade%ROWTYPE;
  v_is_controller boolean;
  v_previa jsonb;
  v_cat text;
  v_cria_id uuid;
  v_mae_excluida boolean := false;
  v_cat_desativada boolean := false;
  v_notif integer := 0;
BEGIN
  PERFORM set_config('app.current_user_id', p_usuario_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(p_usuario_email, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = p_usuario_id AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller') AND uf.ativo = true
  ) INTO v_is_controller;
  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem excluir registros de maternidade';
  END IF;

  SELECT * INTO p FROM registros_maternidade
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído'; END IF;

  v_previa := previa_exclusao_maternidade(p_id, p_fazenda_id);
  IF NOT (v_previa->>'pode_excluir')::boolean THEN
    RAISE EXCEPTION 'Exclusão bloqueada: a cria deste parto tem outro uso (%)',
      (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_previa->'cria'->'motivos_bloqueio') x);
  END IF;
  v_cria_id := p.individuo_id_cria;

  -- Soft-delete do parto: o gatilho trg_maternidade_estorna_cria estorna a cria e
  -- update_classificacao_matriz_on_maternidade reclassifica a mãe (quando origem não é NULL).
  UPDATE registros_maternidade SET deleted_at = now(), updated_at = now() WHERE id = p.id;

  IF (v_previa->'cria'->>'criada_pelo_parto')::boolean THEN
    IF EXISTS (SELECT 1 FROM individuos WHERE id = v_cria_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Falha ao estornar a cria do parto';
    END IF;
    DELETE FROM notificacoes
    WHERE fazenda_id = p_fazenda_id AND titulo = 'Indivíduo criado automaticamente'
      AND acao_url = '/controller/individuos/' || v_cria_id;
    GET DIAGNOSTICS v_notif = ROW_COUNT;
  END IF;

  -- Mãe
  IF p.individuo_id_mae IS NOT NULL THEN
    IF p_excluir_mae AND (v_previa->'mae'->>'elegivel_exclusao')::boolean THEN
      UPDATE individuos SET deleted_at = now(), updated_at = now()
      WHERE id = p.individuo_id_mae AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
      v_mae_excluida := true;
    ELSE
      UPDATE individuos
      SET classificacao_matriz = compute_classificacao_matriz(id),
          numero_partos = (SELECT count(*) FROM registros_maternidade
                           WHERE individuo_id_mae = individuos.id AND deleted_at IS NULL)
      WHERE id = p.individuo_id_mae AND fazenda_id = p_fazenda_id AND sexo = 'Fêmea';
    END IF;
  END IF;

  -- Lote: categoria Bezerro/Bezerra ao Pé
  v_cat := v_previa->'categoria'->>'nome';
  IF v_cat IS NOT NULL THEN
    IF (v_previa->'categoria'->>'criada_pelo_parto')::boolean
       AND NOT (v_previa->'categoria'->>'tem_outros_usos')::boolean THEN
      UPDATE lote_categorias SET ativo = false, quant_atual = 0
      WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true;
      v_cat_desativada := true;
    ELSE
      UPDATE lote_categorias SET quant_atual = calculate_quant_atual(p.lote_id, v_cat)
      WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'id', p.id,
    'cria_estornada', (v_previa->'cria'->>'criada_pelo_parto')::boolean,
    'notificacoes_removidas', v_notif,
    'mae_excluida', v_mae_excluida,
    'categoria_desativada', v_cat_desativada,
    'categoria_mantida_com_outros_usos',
      COALESCE((v_previa->'categoria'->>'criada_pelo_parto')::boolean
               AND (v_previa->'categoria'->>'tem_outros_usos')::boolean, false)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.previa_exclusao_maternidade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_registro_maternidade(uuid, uuid, uuid, text, boolean) TO authenticated;
