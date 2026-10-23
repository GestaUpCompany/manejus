-- ============================================================================
-- Maternidade: excluir o parto que criou a categoria ajusta o quant_inicial dela
-- ============================================================================
-- Simulação (23/10/2026, fazenda de testes, lotes SIM-CAT-1 e SIM-CAT-2): fn_ensure_categoria_bezerro_ao_pe cria
-- a categoria com quant_inicial = 1 e created_at = data do parto + 1s; o 1 representa o parto criador. Ao excluir
-- esse parto com outros ativos, o quant_inicial seguia 1 e o saldo sobrava 1 (1 parto real, saldo 2).
-- Zerar o quant_inicial não serve: se existe parto remanescente ANTERIOR ao created_at da categoria (chegou
-- fora de ordem), a função de saldo não o conta e é o quant_inicial que o segura.
--
-- Regra: depois do soft-delete, quant_inicial := nº de partos ativos remanescentes (mesmo lote e sexo, sem
-- aborto/natimorto) com data < created_at da categoria. Os de data >= created_at já são contados por
-- calculate_quant_atual. O created_at não muda (as movimentações da categoria ficam como estão). Se o novo valor
-- for 0 e a categoria não tiver outro uso, ela é desativada (comportamento da 20261023100000).
--
-- Mudanças:
--   1. lock_quant_inicial aceita a flag de sessão app.ajuste_quant_inicial = 'on' (local à transação). Só
--      excluir_registro_maternidade a liga, e só para categoria com a assinatura de criada pelo parto
--      (quant_inicial = 1 e created_at = data + 1s). Qualquer outro UPDATE continua recusado.
--   2. previa_exclusao_maternidade_interna: devolve quant_inicial_novo e motivo_bloqueio; categoria criada pelo
--      parto que já foi recategorizada (quant_base preenchido) BLOQUEIA a exclusão (ajuste manual).
--   3. excluir_registro_maternidade: aplica a regra acima. Deixa de devolver categoria_mantida_com_outros_usos.
-- Impacto no PWA: nenhum no contrato. Rollback:
-- supabase/rollbacks/20261023120000_maternidade_exclusao_ajusta_quant_inicial_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_quant_inicial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.quant_inicial IS NOT NULL AND NEW.quant_inicial IS DISTINCT FROM OLD.quant_inicial
     AND COALESCE(current_setting('app.ajuste_quant_inicial', true), '') <> 'on' THEN
    RAISE EXCEPTION 'quant_inicial é imutável após a criação da categoria (valor atual: %). Use movimentações para ajustar o quant_atual.', OLD.quant_inicial;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.previa_exclusao_maternidade_interna(p_id uuid, p_fazenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
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
  v_cat_recat boolean := false;
  v_cat_outros boolean := false;
  v_qi_novo integer;
  v_notif integer := 0;
  v_motivo text;
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
      v_cat_criada := v_lc.quant_inicial = 1
        AND abs(extract(epoch FROM (v_lc.created_at - (p.data + interval '1 second')))) < 1;
      v_cat_recat := v_lc.quant_base IS NOT NULL;
      v_cat_outros := EXISTS (
          SELECT 1 FROM registros_maternidade o WHERE o.id <> p.id AND o.deleted_at IS NULL AND o.lote_id = p.lote_id
            AND o.sexo = p.sexo AND (o.tipo_parto IS NULL OR NOT (o.tipo_parto ? 'Aborto' OR o.tipo_parto ? 'Natimorto')))
        OR EXISTS (SELECT 1 FROM registros_movimentacao r WHERE r.deleted_at IS NULL AND LOWER(r.categoria) = LOWER(v_cat)
            AND p.lote_id IN (r.lote_origem_id, r.lote_destino_id))
        OR EXISTS (SELECT 1 FROM registros_morte r WHERE r.deleted_at IS NULL AND r.lote_id = p.lote_id AND LOWER(r.categoria) = LOWER(v_cat));
      SELECT count(*) INTO v_qi_novo FROM registros_maternidade o
      WHERE o.id <> p.id AND o.deleted_at IS NULL AND o.lote_id = p.lote_id AND o.sexo = p.sexo
        AND (o.tipo_parto IS NULL OR NOT (o.tipo_parto ? 'Aborto' OR o.tipo_parto ? 'Natimorto'))
        AND o.data < v_lc.created_at;
    ELSE
      v_cat := NULL;
    END IF;
  END IF;

  v_motivo := CASE
    WHEN cardinality(v_cria_motivos) > 0 THEN
      'a cria deste parto já tem outro uso (' || array_to_string(v_cria_motivos, ', ') || ')'
    WHEN v_cat_criada AND v_cat_recat THEN
      'a categoria ' || v_cat || ' deste lote foi criada por este parto e já foi recategorizada; ajuste o saldo manualmente antes de excluir'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'pode_excluir', v_motivo IS NULL,
    'motivo_bloqueio', v_motivo,
    'cria', jsonb_build_object('id', p.individuo_id_cria, 'criada_pelo_parto', v_cria_criada, 'motivos_bloqueio', to_jsonb(v_cria_motivos)),
    'mae', jsonb_build_object('id', p.individuo_id_mae, 'criada_pelo_parto', v_mae_criada, 'elegivel_exclusao', v_mae_elegivel),
    'categoria', jsonb_build_object('nome', v_cat, 'criada_pelo_parto', v_cat_criada, 'tem_outros_usos', v_cat_outros,
                                    'quant_inicial_novo', v_qi_novo),
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
  v_qi_novo integer;
  v_qi_ajustado boolean := false;
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
    RAISE EXCEPTION 'Exclusão bloqueada: %', v_previa->>'motivo_bloqueio';
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
    IF (v_previa->'categoria'->>'criada_pelo_parto')::boolean THEN
      v_qi_novo := (v_previa->'categoria'->>'quant_inicial_novo')::integer;
      IF v_qi_novo = 0 AND NOT (v_previa->'categoria'->>'tem_outros_usos')::boolean THEN
        UPDATE lote_categorias SET ativo = false, quant_atual = 0
        WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true;
        v_cat_desativada := true;
      ELSE
        -- O 1 do quant_inicial representava este parto: passa a valer só os remanescentes anteriores ao created_at.
        PERFORM set_config('app.ajuste_quant_inicial', 'on', true);
        UPDATE lote_categorias SET quant_inicial = v_qi_novo
        WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true;
        PERFORM set_config('app.ajuste_quant_inicial', '', true);
        v_qi_ajustado := true;
        UPDATE lote_categorias SET quant_atual = calculate_quant_atual(p.lote_id, v_cat)
        WHERE lote_id = p.lote_id AND LOWER(categoria) = LOWER(v_cat) AND ativo = true;
      END IF;
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
    'categoria_quant_inicial_ajustado', CASE WHEN v_qi_ajustado THEN v_qi_novo END
  );
END;
$function$;
