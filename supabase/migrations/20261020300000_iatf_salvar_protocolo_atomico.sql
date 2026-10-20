-- ============================================================================
-- IATF (auditoria item 9): salvar protocolo e passos numa única transação
-- ============================================================================
-- Achado (20/10/2026): o painel editava o protocolo com três chamadas separadas (atualiza o protocolo, apaga todos os
-- passos, reinsere) e, se a reinserção falhasse, tentava restaurar pelo cliente. Uma queda de rede entre as chamadas deixava
-- o protocolo sem passos.
-- Agora salvar_protocolo_iatf(p_fazenda_id, p_protocolo_id, p_nome, p_descricao, p_passos jsonb) cria (p_protocolo_id nulo) ou
-- edita o protocolo e troca os passos numa única transação: se algo falhar, nada muda.
--   * valida nome, ao menos um passo, exatamente um passo de Inseminação, dia inteiro de 0 a 30 e descrição de cada passo;
--   * nome repetido na fazenda vira a mensagem "Já existe um protocolo com esse nome nesta fazenda";
--   * SECURITY INVOKER: a RLS do item 7 continua valendo (só a gestão grava); a checagem de acesso à fazenda é explícita;
--   * lotes já criados não mudam (as tarefas guardam um retrato dos passos).
-- p_passos: array JSON de objetos {dia, rotulo, tipo, medicamento_nome, dose}, na ordem desejada (a ordem vira o campo ordem).
-- Só cria uma função; nenhum dado nem tabela é tocado.
-- Rollback: supabase/rollbacks/20261020300000_iatf_salvar_protocolo_atomico_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.salvar_protocolo_iatf(
  p_fazenda_id uuid,
  p_protocolo_id uuid,
  p_nome text,
  p_descricao text,
  p_passos jsonb
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_n integer;
  v_ias integer;
  v_ruim integer;
BEGIN
  IF NOT (public.is_admin_user() OR public.caller_has_fazenda_access(p_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso à fazenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome do protocolo' USING ERRCODE = 'check_violation';
  END IF;
  IF p_passos IS NULL OR jsonb_typeof(p_passos) <> 'array' OR jsonb_array_length(p_passos) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um passo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE x.tipo = 'Inseminacao'),
         count(*) FILTER (WHERE x.dia IS NULL OR x.dia < 0 OR x.dia > 30 OR x.rotulo IS NULL OR btrim(x.rotulo) = ''
                          OR x.tipo NOT IN ('Aplicacao', 'Retirada', 'Inseminacao', 'Outro'))
    INTO v_ias, v_ruim
  FROM jsonb_to_recordset(p_passos) AS x(dia integer, rotulo text, tipo text);
  IF v_ruim > 0 THEN
    RAISE EXCEPTION 'Cada passo precisa de dia inteiro de 0 a 30, descrição e tipo válido' USING ERRCODE = 'check_violation';
  END IF;
  IF v_ias <> 1 THEN
    RAISE EXCEPTION 'O protocolo precisa ter exatamente um passo de Inseminação (IA)' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    IF p_protocolo_id IS NULL THEN
      INSERT INTO public.protocolos_iatf (fazenda_id, nome, descricao)
      VALUES (p_fazenda_id, btrim(p_nome), NULLIF(btrim(p_descricao), ''))
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.protocolos_iatf
         SET nome = btrim(p_nome), descricao = NULLIF(btrim(p_descricao), '')
       WHERE id = p_protocolo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Protocolo não encontrado nesta fazenda' USING ERRCODE = 'foreign_key_violation';
      END IF;
      DELETE FROM public.protocolos_iatf_passos WHERE protocolo_id = v_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um protocolo com esse nome nesta fazenda' USING ERRCODE = 'unique_violation';
  END;

  INSERT INTO public.protocolos_iatf_passos (protocolo_id, fazenda_id, dia, ordem, rotulo, tipo, medicamento_nome, dose)
  SELECT v_id, p_fazenda_id, (e.v ->> 'dia')::integer, e.n::integer, btrim(e.v ->> 'rotulo'), e.v ->> 'tipo',
         NULLIF(btrim(e.v ->> 'medicamento_nome'), ''), NULLIF(btrim(e.v ->> 'dose'), '')
  FROM jsonb_array_elements(p_passos) WITH ORDINALITY AS e(v, n);

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_protocolo_iatf(uuid, uuid, text, text, jsonb) TO authenticated;
