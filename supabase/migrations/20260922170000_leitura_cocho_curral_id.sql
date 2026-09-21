-- Normaliza o vínculo da leitura de cocho com o curral.
--
-- registros_leitura_cocho identificava o local só por pasto_curral (texto
-- livre) + pasto_id, então a regra "uma leitura por curral por dia" existia
-- apenas no app. Dois dispositivos offline podiam criar leituras duplicadas
-- para o mesmo curral/dia e o sync inseria ambas (local_id distinto).
--
-- 1) Nova coluna curral_id (FK currais). Backfill é operação de dados e fica
--    fora desta migration: roda por fazenda via MCP (testada primeiro na
--    Fazenda Gesta'Up, depois Jacamim).
-- 2) Índice único parcial por (fazenda, curral, dia operacional) só para linhas
--    com curral_id preenchido — leituras de pasto (sem curral) e linhas
--    excluídas não participam.
-- 3) editar_registro_leitura_cocho aceita curral_id na whitelist; quando
--    informado, valida que pertence à fazenda e sincroniza pasto_curral com o
--    nome do curral (e zera pasto_id, já que passa a ser leitura de curral).

ALTER TABLE public.registros_leitura_cocho
  ADD COLUMN IF NOT EXISTS curral_id uuid REFERENCES public.currais(id);

CREATE UNIQUE INDEX IF NOT EXISTS registros_leitura_cocho_curral_dia_uk
  ON public.registros_leitura_cocho (
    fazenda_id,
    curral_id,
    ((data AT TIME ZONE 'America/Cuiaba')::date)
  )
  WHERE deleted_at IS NULL AND curral_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.editar_registro_leitura_cocho(
  p_id uuid,
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_usuario_email text,
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old registros_leitura_cocho%ROWTYPE;
  v_new_rec registros_leitura_cocho%ROWTYPE;
  v_filtered jsonb := '{}'::jsonb;
  v_campo text;
  v_campos_permitidos text[] := ARRAY['data','responsavel','pasto_curral','pasto_id','lote','lote_id','leitura_cocho','curral_id'];
  v_is_controller boolean;
  v_auth_id uuid; v_auth_email text; v_auth_nome text;
BEGIN
  SELECT u.id, u.email, u.nome INTO v_auth_id, v_auth_email, v_auth_nome
    FROM usuarios u WHERE u.auth_id = auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  PERFORM set_config('app.current_user_id', v_auth_id::text, true);
  PERFORM set_config('app.current_user_email', COALESCE(v_auth_email, ''), true);
  PERFORM set_config('app.current_user_nome', COALESCE(v_auth_nome, ''), true);

  SELECT EXISTS(
    SELECT 1 FROM usuario_fazenda uf
    WHERE uf.usuario_id = v_auth_id
      AND uf.fazenda_id = p_fazenda_id
      AND uf.papel IN ('admin', 'controller')
      AND uf.ativo = true
  ) INTO v_is_controller;

  IF NOT v_is_controller THEN
    RAISE EXCEPTION 'Permissão negada: apenas controllers e admins podem editar leituras de cocho';
  END IF;

  SELECT * INTO v_old
  FROM registros_leitura_cocho
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já excluído';
  END IF;

  FOR v_campo IN SELECT jsonb_object_keys(p_campos) LOOP
    IF v_campo = ANY(v_campos_permitidos) THEN
      v_filtered := v_filtered || jsonb_build_object(v_campo, p_campos->v_campo);
    END IF;
  END LOOP;

  v_new_rec := jsonb_populate_record(v_old, v_filtered);

  IF v_new_rec.leitura_cocho IS NOT NULL
     AND (v_new_rec.leitura_cocho < -1 OR v_new_rec.leitura_cocho > 3) THEN
    RAISE EXCEPTION 'Nota de leitura inválida: deve estar entre -1 e 3';
  END IF;

  IF v_new_rec.data IS NULL THEN
    RAISE EXCEPTION 'Data é obrigatória';
  END IF;

  -- Garante que lote/pasto/curral informados pertencem à mesma fazenda
  IF v_new_rec.lote_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM lotes WHERE id = v_new_rec.lote_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Lote não pertence a esta fazenda';
  END IF;

  IF v_new_rec.pasto_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pastos WHERE id = v_new_rec.pasto_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Pasto não pertence a esta fazenda';
  END IF;

  IF v_new_rec.curral_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM currais WHERE id = v_new_rec.curral_id AND fazenda_id = p_fazenda_id
  ) THEN
    RAISE EXCEPTION 'Curral não pertence a esta fazenda';
  END IF;

  -- Quando o curral é definido explicitamente, sincroniza o texto legado e
  -- zera pasto_id (a leitura passa a ser de curral, não de pasto).
  IF v_filtered ? 'curral_id' AND v_new_rec.curral_id IS NOT NULL THEN
    SELECT c.nome INTO v_new_rec.pasto_curral
    FROM currais c WHERE c.id = v_new_rec.curral_id;
    v_new_rec.pasto_id := NULL;
  END IF;

  -- Se a nota mudou, re-resolve a configuração correspondente para não ficar
  -- apontando para o percentual da nota antiga.
  IF v_new_rec.leitura_cocho IS DISTINCT FROM v_old.leitura_cocho THEN
    SELECT nlc.id INTO v_new_rec.nota_config_id
    FROM notas_leitura_cocho_config nlc
    WHERE nlc.fazenda_id = p_fazenda_id
      AND nlc.nota = v_new_rec.leitura_cocho;
  END IF;

  UPDATE registros_leitura_cocho SET
    data = v_new_rec.data,
    responsavel = v_new_rec.responsavel,
    pasto_curral = v_new_rec.pasto_curral,
    pasto_id = v_new_rec.pasto_id,
    lote = v_new_rec.lote,
    lote_id = v_new_rec.lote_id,
    leitura_cocho = v_new_rec.leitura_cocho,
    nota_config_id = v_new_rec.nota_config_id,
    curral_id = v_new_rec.curral_id,
    updated_at = NOW()
  WHERE id = p_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
  RETURNING * INTO v_new_rec;

  RETURN to_jsonb(v_new_rec);
END;
$function$;
