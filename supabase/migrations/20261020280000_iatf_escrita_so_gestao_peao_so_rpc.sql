-- ============================================================================
-- IATF (auditoria item 7): escrita direta nas tabelas de IATF só para a gestão; o peão usa só as RPCs
-- ============================================================================
-- Achado (20/10/2026): as 5 tabelas de IATF tinham uma policy FOR ALL para qualquer usuário com acesso à fazenda, inclusive
-- o login de peão do PWA. O PWA só precisa das RPCs (criar lote, marcar passo, registrar IA), mas hoje o peão podia editar
-- protocolos, apagar tarefas ou lotes direto pela API. Além disso copiar_modelo_protocolo_iatf era SECURITY DEFINER chamável
-- por authenticated (aviso do advisor).
-- Agora:
--   * policies: SELECT para quem tem acesso à fazenda (como antes, o PWA continua lendo); INSERT/UPDATE/DELETE só para admin
--     ou usuário com acesso que NÃO seja peão (caller_is_peao());
--   * as RPCs que o peão usa (criar_lote_protocolo_iatf, marcar_tarefa_protocolo_iatf, registrar_ia_lote_protocolo) e
--     desfazer_ia_lote_protocolo passam a SECURITY DEFINER, com checagem de acesso à fazenda logo na entrada ("Sem acesso à
--     fazenda"). Chamada sem usuário (auth.uid() nulo: cron, gatilho de sistema, service role) segue permitida;
--   * desfazer (desfazer_ia_lote_protocolo e marcar com data nula) passa a ser só da gestão: o PWA nunca o oferece;
--   * copiar_modelo_protocolo_iatf passa a SECURITY INVOKER (a RLS acima já limita a escrita à gestão): zera o aviso do advisor.
-- eventos_reprodutivos NÃO muda: o PWA grava reprodução direto nela (fica para tratamento à parte).
-- Corpos das funções idênticos aos de 20261020250000 (marcar, registrar_ia), 20261020260000 (criar_lote) e 20261020230000
-- (desfazer), acrescidos só da checagem de acesso, do SECURITY DEFINER e do filtro por fazenda na busca de reenvio por
-- local_id (para a versão DEFINER não devolver dado de outra fazenda).
-- Rollback: supabase/rollbacks/20261020280000_iatf_escrita_so_gestao_peao_so_rpc_rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------- policies
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['protocolos_iatf', 'protocolos_iatf_passos', 'lotes_protocolo_iatf', 'lotes_protocolo_iatf_femeas', 'lotes_protocolo_iatf_tarefas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))',
      t || '_leitura', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin_user() OR (public.caller_has_fazenda_access(fazenda_id) AND NOT public.caller_is_peao())) WITH CHECK (public.is_admin_user() OR (public.caller_has_fazenda_access(fazenda_id) AND NOT public.caller_is_peao()))',
      t || '_escrita_gestao', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------- copiar_modelo: INVOKER
CREATE OR REPLACE FUNCTION public.copiar_modelo_protocolo_iatf(p_fazenda_id uuid)
RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_nome text := 'IATF clássico (D0/D8/D10)';
  v_n integer := 1;
BEGIN
  IF NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Nome livre: acrescenta (2), (3)... se a fazenda já copiou o modelo
  WHILE EXISTS (
    SELECT 1 FROM public.protocolos_iatf p
    WHERE p.fazenda_id = p_fazenda_id AND p.deleted_at IS NULL AND lower(btrim(p.nome)) = lower(v_nome)
  ) LOOP
    v_n := v_n + 1;
    v_nome := 'IATF clássico (D0/D8/D10) (' || v_n || ')';
  END LOOP;

  INSERT INTO public.protocolos_iatf (fazenda_id, nome, descricao)
  VALUES (p_fazenda_id, v_nome,
          'Modelo clássico: D0 implante de progesterona + estradiol; D8 retirada, prostaglandina e eCG; D10 inseminação. Ajuste produtos e doses ao protocolo do veterinário.')
  RETURNING id INTO v_id;

  INSERT INTO public.protocolos_iatf_passos (protocolo_id, fazenda_id, dia, ordem, rotulo, tipo, medicamento_nome)
  VALUES
    (v_id, p_fazenda_id, 0, 1, 'Implante de progesterona + estradiol', 'Aplicacao', 'Progesterona + benzoato de estradiol'),
    (v_id, p_fazenda_id, 8, 2, 'Retirada do implante + prostaglandina + eCG', 'Retirada', 'Prostaglandina + eCG'),
    (v_id, p_fazenda_id, 10, 3, 'Inseminação (IA)', 'Inseminacao', NULL);

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------- criar_lote: DEFINER + acesso
CREATE OR REPLACE FUNCTION public.criar_lote_protocolo_iatf(
  p_fazenda_id uuid,
  p_protocolo_id uuid,
  p_nome text,
  p_data_d0 date,
  p_individuos uuid[],
  p_estacao_id uuid DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL,
  p_origem text DEFAULT 'painel'
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_prot record;
  v_ids uuid[];
  v_conf text;
  v_nconf integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reenvio do mesmo lote (PWA futuro): devolve o que já existe (só da própria fazenda)
  IF p_local_id IS NOT NULL THEN
    SELECT l.id INTO v_id FROM public.lotes_protocolo_iatf l WHERE l.local_id = p_local_id AND l.fazenda_id = p_fazenda_id;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome do lote' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_d0 IS NULL THEN
    RAISE EXCEPTION 'Informe o D0' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.id, p.ativo INTO v_prot
  FROM public.protocolos_iatf p
  WHERE p.id = p_protocolo_id AND p.fazenda_id = p_fazenda_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocolo não encontrado nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_prot.ativo THEN
    RAISE EXCEPTION 'O protocolo está inativo' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.protocolos_iatf_passos s WHERE s.protocolo_id = p_protocolo_id AND s.tipo = 'Inseminacao';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O protocolo precisa ter um passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma fêmea' USING ERRCODE = 'check_violation';
  END IF;

  -- Fêmea já ativa em outro lote de protocolo em andamento (a lista mostra até 5)
  SELECT count(*), string_agg(q.txt, ', ')
    INTO v_nconf, v_conf
  FROM (
    SELECT COALESCE(i.id_brinco, i.id_manejo, i.id_chip, 'sem identificação') || ' (lote "' || l.nome || '")' AS txt
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.lotes_protocolo_iatf l ON l.id = f.lote_protocolo_id AND l.deleted_at IS NULL AND l.status = 'Em andamento'
    JOIN public.individuos i ON i.id = f.individuo_id
    WHERE f.status = 'Ativa' AND f.individuo_id = ANY (v_ids)
    ORDER BY 1
    LIMIT 5
  ) q;
  IF v_nconf > 0 THEN
    RAISE EXCEPTION 'Fêmea(s) já em outro lote de protocolo em andamento: %. Descarte-a(s) de lá ou cancele aquele lote', v_conf
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.lotes_protocolo_iatf (fazenda_id, protocolo_id, nome, data_d0, estacao_id, responsavel, local_id, origem)
  VALUES (p_fazenda_id, p_protocolo_id, btrim(p_nome), p_data_d0, p_estacao_id, NULLIF(btrim(p_responsavel), ''), p_local_id,
          CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END)
  RETURNING id INTO v_id;

  -- O gatilho valida sexo, vida e fazenda de cada fêmea
  INSERT INTO public.lotes_protocolo_iatf_femeas (lote_protocolo_id, fazenda_id, individuo_id)
  SELECT v_id, p_fazenda_id, x FROM unnest(v_ids) AS x;

  INSERT INTO public.lotes_protocolo_iatf_tarefas
    (lote_protocolo_id, fazenda_id, passo_id, dia, ordem, rotulo, tipo, medicamento_id, medicamento_nome, dose, data_prevista)
  SELECT v_id, p_fazenda_id, s.id, s.dia, s.ordem, s.rotulo, s.tipo, s.medicamento_id, s.medicamento_nome, s.dose,
         p_data_d0 + s.dia
  FROM public.protocolos_iatf_passos s
  WHERE s.protocolo_id = p_protocolo_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------- desfazer: DEFINER + só gestão
CREATE OR REPLACE FUNCTION public.desfazer_ia_lote_protocolo(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_individuos uuid[] DEFAULT NULL
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t record;
  v_l record;
  v_alvo uuid[];
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND public.caller_is_peao() THEN
    RAISE EXCEPTION 'Desfazer a inseminação é feito pelo painel de gestão' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.id, t.tipo, t.lote_protocolo_id, t.feita_em INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_t.tipo <> 'Inseminacao' THEN
    RAISE EXCEPTION 'A tarefa não é o passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  SELECT l.id, l.status INTO v_l
  FROM public.lotes_protocolo_iatf l WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_l.status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;

  -- Fêmeas afetadas: as informadas, ou todas as que têm Inseminação ativa neste lote
  SELECT COALESCE(array_agg(DISTINCT e.individuo_id), '{}') INTO v_alvo
  FROM public.eventos_reprodutivos e
  WHERE e.protocolo_lote_id = v_l.id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
    AND (p_individuos IS NULL OR e.individuo_id = ANY (p_individuos));

  -- Diagnóstico lançado a partir da data da IA ficaria sem origem: o diagnóstico precisa ser tratado antes
  IF EXISTS (
    SELECT 1
    FROM public.eventos_reprodutivos ia
    JOIN public.eventos_reprodutivos dg ON dg.individuo_id = ia.individuo_id
    WHERE ia.protocolo_lote_id = v_l.id AND ia.tipo = 'Inseminação' AND ia.deleted_at IS NULL
      AND ia.individuo_id = ANY (v_alvo)
      AND dg.tipo = 'Diagnóstico de gestação' AND dg.deleted_at IS NULL AND dg.data >= ia.data
  ) THEN
    RAISE EXCEPTION 'Não é possível desfazer: há fêmea com diagnóstico de gestação lançado depois da IA'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.eventos_reprodutivos e
     SET deleted_at = now()
   WHERE e.protocolo_lote_id = v_l.id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
     AND e.individuo_id = ANY (v_alvo);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Reabre o passo de IA (algo foi desfeito) e o lote volta a "Em andamento"
  IF v_t.feita_em IS NOT NULL THEN
    UPDATE public.lotes_protocolo_iatf_tarefas
       SET feita_em = NULL, feita_por = NULL, local_id = NULL, updated_at = now()
     WHERE id = p_tarefa_id;
  END IF;
  UPDATE public.lotes_protocolo_iatf l
     SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.lotes_protocolo_iatf_tarefas t WHERE t.lote_protocolo_id = l.id AND t.feita_em IS NULL
         ) THEN 'Em andamento' ELSE 'Concluído' END
   WHERE l.id = v_l.id;

  RETURN v_n;
END;
$function$;

-- ---------------------------------------------------------------- marcar: DEFINER + acesso; desfazer só gestão
CREATE OR REPLACE FUNCTION public.marcar_tarefa_protocolo_iatf(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_feita_em date,
  p_observacao text DEFAULT NULL,
  p_responsavel text DEFAULT NULL,
  p_local_id text DEFAULT NULL
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_t record;
  v_l record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_feita_em IS NULL AND auth.uid() IS NOT NULL AND public.caller_is_peao() THEN
    RAISE EXCEPTION 'Desfazer a marcação de um passo é feito pelo painel de gestão' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.id, t.tipo, t.lote_protocolo_id INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT l.status, l.data_d0 INTO v_l FROM public.lotes_protocolo_iatf l
  WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_l.status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;

  IF p_feita_em IS NULL AND v_t.tipo = 'Inseminacao' THEN
    PERFORM public.desfazer_ia_lote_protocolo(p_fazenda_id, p_tarefa_id, NULL);
    RETURN;
  END IF;

  IF p_feita_em IS NOT NULL AND p_feita_em > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_feita_em IS NOT NULL AND p_feita_em < v_l.data_d0 THEN
    RAISE EXCEPTION 'A data de execução não pode ser anterior ao D0 do lote (%)', to_char(v_l.data_d0, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.lotes_protocolo_iatf_tarefas
     SET feita_em = p_feita_em,
         feita_por = CASE WHEN p_feita_em IS NULL THEN NULL ELSE NULLIF(btrim(p_responsavel), '') END,
         observacao = CASE WHEN p_feita_em IS NULL THEN observacao ELSE COALESCE(NULLIF(btrim(p_observacao), ''), observacao) END,
         local_id = CASE WHEN p_feita_em IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(p_local_id), ''), local_id) END,
         updated_at = now()
   WHERE id = p_tarefa_id;

  -- O lote conclui sozinho quando não resta tarefa pendente e reabre se uma marcação for desfeita
  UPDATE public.lotes_protocolo_iatf l
     SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.lotes_protocolo_iatf_tarefas t WHERE t.lote_protocolo_id = l.id AND t.feita_em IS NULL
         ) THEN 'Em andamento' ELSE 'Concluído' END
   WHERE l.id = v_t.lote_protocolo_id;
END;
$function$;

-- ---------------------------------------------------------------- registrar_ia: DEFINER + acesso
CREATE OR REPLACE FUNCTION public.registrar_ia_lote_protocolo(
  p_fazenda_id uuid,
  p_tarefa_id uuid,
  p_data date,
  p_touro_nome text DEFAULT NULL,
  p_semen_partida text DEFAULT NULL,
  p_tecnico text DEFAULT NULL,
  p_individuos uuid[] DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_local_id text DEFAULT NULL,
  p_origem text DEFAULT 'painel'
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t record;
  v_l record;
  v_ids uuid[];
  v_pend uuid[];
  v_n integer;
  v_total integer;
  v_restam integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.id, t.tipo, t.lote_protocolo_id, t.feita_em INTO v_t
  FROM public.lotes_protocolo_iatf_tarefas t WHERE t.id = p_tarefa_id AND t.fazenda_id = p_fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta fazenda' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_t.tipo <> 'Inseminacao' THEN
    RAISE EXCEPTION 'A tarefa não é o passo de Inseminação' USING ERRCODE = 'check_violation';
  END IF;

  -- Reenvio da mesma chamada (a fila offline do PWA reenvia até confirmar): já gravada, não repete nada
  IF p_local_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.eventos_reprodutivos e WHERE e.fazenda_id = p_fazenda_id AND e.local_id LIKE (p_local_id || ':%')
  ) THEN
    RETURN 0;
  END IF;

  SELECT l.id, l.status, l.estacao_id, l.data_d0 INTO v_l
  FROM public.lotes_protocolo_iatf l WHERE l.id = v_t.lote_protocolo_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de protocolo não encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_l.status = 'Cancelado' THEN
    RAISE EXCEPTION 'O lote está cancelado' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe a data da inseminação' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data > (now() AT TIME ZONE 'America/Cuiaba')::date THEN
    RAISE EXCEPTION 'A data de execução não pode ser futura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data < v_l.data_d0 THEN
    RAISE EXCEPTION 'A data de execução não pode ser anterior ao D0 do lote (%)', to_char(v_l.data_d0, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fêmea "ativa" no lote = vínculo Ativa E animal vivo e não excluído
  IF p_individuos IS NULL THEN
    SELECT COALESCE(array_agg(f.individuo_id), '{}') INTO v_ids
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
    WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa';
  ELSE
    SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(p_individuos) AS x WHERE x IS NOT NULL;
    SELECT count(*) INTO v_total
    FROM public.lotes_protocolo_iatf_femeas f
    JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
    WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa' AND f.individuo_id = ANY (v_ids);
    IF v_total <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Há fêmea que não é ativa neste lote de protocolo' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhuma fêmea ativa para inseminar' USING ERRCODE = 'check_violation';
  END IF;

  -- Só as fêmeas sem Inseminação ativa neste lote de protocolo entram (não duplica por reenvio ou por desfazer/refazer)
  SELECT COALESCE(array_agg(x), '{}') INTO v_pend
  FROM unnest(v_ids) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM public.eventos_reprodutivos e
    WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = x AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
  );

  IF cardinality(v_pend) = 0 THEN
    -- Passo já concluído e nada a gravar: mantém a recusa que o PWA e o painel já traduzem
    IF v_t.feita_em IS NOT NULL THEN
      RAISE EXCEPTION 'A inseminação deste lote já foi registrada em %', to_char(v_t.feita_em, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
    -- Passo aberto, fêmeas informadas já inseminadas e outras ainda sem IA: a chamada não teria efeito
    IF EXISTS (
      SELECT 1 FROM public.lotes_protocolo_iatf_femeas f
      JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
      WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa'
        AND NOT EXISTS (
          SELECT 1 FROM public.eventos_reprodutivos e
          WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'As fêmeas informadas já têm inseminação neste lote' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.eventos_reprodutivos
    (fazenda_id, individuo_id, tipo, data, estacao_id, touro_nome, semen_partida, tecnico, observacao, responsavel,
     protocolo_lote_id, local_id, origem)
  SELECT p_fazenda_id, x, 'Inseminação', p_data, v_l.estacao_id, NULLIF(btrim(p_touro_nome), ''),
         NULLIF(btrim(p_semen_partida), ''), NULLIF(btrim(p_tecnico), ''), NULLIF(btrim(p_observacao), ''),
         NULLIF(btrim(p_tecnico), ''), v_l.id,
         CASE WHEN p_local_id IS NULL THEN NULL ELSE p_local_id || ':' || x END,
         CASE WHEN p_origem = 'pwa' THEN 'pwa' ELSE 'painel' END
  FROM unnest(v_pend) AS x
  ON CONFLICT (local_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- A tarefa só é concluída quando todas as fêmeas ativas (vivas) do lote já têm Inseminação
  SELECT count(*) INTO v_restam
  FROM public.lotes_protocolo_iatf_femeas f
  JOIN public.individuos i ON i.id = f.individuo_id AND i.status = 'Vivo' AND i.deleted_at IS NULL
  WHERE f.lote_protocolo_id = v_l.id AND f.status = 'Ativa'
    AND NOT EXISTS (
      SELECT 1 FROM public.eventos_reprodutivos e
      WHERE e.protocolo_lote_id = v_l.id AND e.individuo_id = f.individuo_id AND e.tipo = 'Inseminação' AND e.deleted_at IS NULL
    );
  IF v_restam = 0 THEN
    PERFORM public.marcar_tarefa_protocolo_iatf(p_fazenda_id, p_tarefa_id, p_data, p_observacao, p_tecnico, p_local_id);
  END IF;

  RETURN v_n;
END;
$function$;
