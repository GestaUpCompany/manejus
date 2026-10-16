-- ============================================================================
-- Indivíduos / Fase 1.7: rastreabilidade (SISBOV/PNIB) e histórico de identificações
-- ============================================================================
-- Norma (IN MAPA 51/2018): o número SISBOV tem 15 dígitos numéricos; os 3 primeiros são o código do Brasil (076) e os
-- 12 seguintes identificam o animal (único em todo o território nacional); o "número de manejo" são os dígitos 10 a 15.
-- Não há dígito verificador na norma. Para o PNIB não há formato próprio confirmado: o campo é livre (apenas aparado).
--
-- 1) individuos: codigo_sisbov (CHECK ^076[0-9]{12}$, único global entre animais não excluídos), codigo_pnib,
--    dispositivo_tipo (brinco | brinco_eletronico | botton | bolus | outro), data_identificacao,
--    data_vacina_brucelose. Já existiam data_insercao_rastreabilidade e data_liberacao_sisbov.
-- 2) trg_individuos_normaliza_identificadores passa a aparar também codigo_sisbov e codigo_pnib.
-- 3) individuo_identificacoes: histórico (campo, valor anterior, valor novo, quem, quando) preenchido por trigger em
--    qualquer mudança de brinco, chip, manejo, provisório, SISBOV ou PNIB (troca de brinco, provisório -> definitivo).
--    Leitura por fazenda (RLS); ninguém escreve direto (só o trigger).
-- 4) vw_individuo_linha_do_tempo ganha o tipo 'identificacao'.
-- 5) salvar_individuo aceita os campos novos (lista permitida).
-- Retrocompatível: só colunas/tabela novas, nulas por padrão; PWA não lê nem escreve. Nenhum dado existente é alterado.
-- Rollback: supabase/rollbacks/20261016160000_rastreabilidade_sisbov_e_historico_identificacao_rollback.sql
-- ============================================================================

ALTER TABLE public.individuos
  ADD COLUMN IF NOT EXISTS codigo_sisbov text,
  ADD COLUMN IF NOT EXISTS codigo_pnib text,
  ADD COLUMN IF NOT EXISTS dispositivo_tipo text,
  ADD COLUMN IF NOT EXISTS data_identificacao date,
  ADD COLUMN IF NOT EXISTS data_vacina_brucelose date;

ALTER TABLE public.individuos DROP CONSTRAINT IF EXISTS individuos_codigo_sisbov_check;
ALTER TABLE public.individuos
  ADD CONSTRAINT individuos_codigo_sisbov_check CHECK (codigo_sisbov IS NULL OR codigo_sisbov ~ '^076[0-9]{12}$');
ALTER TABLE public.individuos DROP CONSTRAINT IF EXISTS individuos_dispositivo_tipo_check;
ALTER TABLE public.individuos
  ADD CONSTRAINT individuos_dispositivo_tipo_check
  CHECK (dispositivo_tipo IS NULL OR dispositivo_tipo IN ('brinco', 'brinco_eletronico', 'botton', 'bolus', 'outro'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_individuos_codigo_sisbov_unico
  ON public.individuos (codigo_sisbov)
  WHERE codigo_sisbov IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_individuos_normaliza_identificadores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id_brinco := NULLIF(btrim(NEW.id_brinco), '');
  NEW.id_chip := NULLIF(btrim(NEW.id_chip), '');
  NEW.id_manejo := NULLIF(btrim(NEW.id_manejo), '');
  NEW.id_provisorio_cria := NULLIF(btrim(NEW.id_provisorio_cria), '');
  NEW.codigo_sisbov := NULLIF(btrim(NEW.codigo_sisbov), '');
  NEW.codigo_pnib := NULLIF(btrim(NEW.codigo_pnib), '');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_individuos_normaliza_identificadores ON public.individuos;
CREATE TRIGGER trg_individuos_normaliza_identificadores
  BEFORE INSERT OR UPDATE OF id_brinco, id_chip, id_manejo, id_provisorio_cria, codigo_sisbov, codigo_pnib ON public.individuos
  FOR EACH ROW EXECUTE FUNCTION public.trg_individuos_normaliza_identificadores();

CREATE TABLE IF NOT EXISTS public.individuo_identificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas (id),
  individuo_id uuid NOT NULL REFERENCES public.individuos (id),
  campo text NOT NULL CHECK (campo IN ('id_brinco', 'id_chip', 'id_manejo', 'id_provisorio_cria', 'codigo_sisbov', 'codigo_pnib')),
  valor_anterior text,
  valor_novo text,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_individuo_identificacoes_individuo ON public.individuo_identificacoes (individuo_id, alterado_em DESC);

ALTER TABLE public.individuo_identificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS individuo_identificacoes_leitura ON public.individuo_identificacoes;
CREATE POLICY individuo_identificacoes_leitura ON public.individuo_identificacoes FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
REVOKE ALL ON public.individuo_identificacoes FROM anon, authenticated;
GRANT SELECT ON public.individuo_identificacoes TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_individuos_historico_identificacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_campo text;
  v_old text;
  v_new text;
BEGIN
  FOREACH v_campo IN ARRAY ARRAY['id_brinco', 'id_chip', 'id_manejo', 'id_provisorio_cria', 'codigo_sisbov', 'codigo_pnib'] LOOP
    v_old := to_jsonb(OLD) ->> v_campo;
    v_new := to_jsonb(NEW) ->> v_campo;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.individuo_identificacoes (fazenda_id, individuo_id, campo, valor_anterior, valor_novo, alterado_por)
      VALUES (NEW.fazenda_id, NEW.id, v_campo, v_old, v_new, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_individuos_historico_identificacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_individuos_historico_identificacao ON public.individuos;
CREATE TRIGGER trg_individuos_historico_identificacao
  AFTER UPDATE OF id_brinco, id_chip, id_manejo, id_provisorio_cria, codigo_sisbov, codigo_pnib ON public.individuos
  FOR EACH ROW EXECUTE FUNCTION public.trg_individuos_historico_identificacao();

-- ---- linha do tempo: tipo identificacao ----
CREATE OR REPLACE VIEW public.vw_individuo_linha_do_tempo
WITH (security_invoker = true) AS
SELECT i.id AS individuo_id, i.fazenda_id, i.created_at AS data, 'cadastro'::text AS tipo,
       'Cadastro no sistema'::text AS titulo,
       NULLIF(concat_ws(' · ', i.origem, i.categoria), '') AS detalhe,
       'individuos'::text AS origem_tabela, i.id AS origem_id
FROM public.individuos i
WHERE i.deleted_at IS NULL

UNION ALL
SELECT p.individuo_id, p.fazenda_id, p.data, 'pesagem',
       'Pesagem' || COALESCE(': ' || trim(to_char(p.peso_kg, 'FM999999990.##')) || ' kg', ''),
       NULLIF(concat_ws(' · ', p.tipo_manejo, p.lote), ''),
       'registros_pesagem', p.id
FROM public.registros_pesagem p
WHERE p.deleted_at IS NULL AND p.individuo_id IS NOT NULL

UNION ALL
SELECT m.individuo_id, m.fazenda_id, m.data, 'movimentacao',
       concat_ws(' · ', m.motivo_movimentacao::text, m.subtipo),
       NULLIF(concat_ws(' · ', m.categoria, m.causa_observacao), ''),
       'registros_movimentacao', m.id
FROM public.registros_movimentacao m
WHERE m.deleted_at IS NULL AND m.individuo_id IS NOT NULL

UNION ALL
SELECT e.individuo_id, e.fazenda_id, m.data, 'movimentacao_grupo',
       'Movimentação em grupo (' || m.numero_cabecas || ' cab.)',
       concat_ws(' ', COALESCE(lo.nome, '?'), '→', COALESCE(ld.nome, '?'), '· ' || m.categoria),
       'registros_movimentacao', m.id
FROM public.evento_individuos e
JOIN public.registros_movimentacao m ON m.id = e.evento_id AND m.deleted_at IS NULL
LEFT JOIN public.lotes lo ON lo.id = m.lote_origem_id
LEFT JOIN public.lotes ld ON ld.id = m.lote_destino_id

UNION ALL
SELECT r.individuo_id_mae, r.fazenda_id, r.data, 'parto_mae', 'Parto',
       NULLIF(concat_ws(' · ', r.sexo, CASE WHEN r.peso_cria_kg IS NOT NULL THEN trim(to_char(r.peso_cria_kg, 'FM999990.##')) || ' kg' END), ''),
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_mae IS NOT NULL

UNION ALL
SELECT r.individuo_id_cria, r.fazenda_id, r.data, 'nascimento', 'Nascimento',
       NULLIF(concat_ws(' · ', r.sexo, CASE WHEN r.peso_cria_kg IS NOT NULL THEN trim(to_char(r.peso_cria_kg, 'FM999990.##')) || ' kg' END), ''),
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_cria IS NOT NULL

UNION ALL
SELECT r.individuo_id_mae_adotiva, r.fazenda_id, r.data, 'parto_adotiva', 'Mãe adotiva de uma cria', NULL::text,
       'registros_maternidade', r.id
FROM public.registros_maternidade r
WHERE r.deleted_at IS NULL AND r.individuo_id_mae_adotiva IS NOT NULL

UNION ALL
SELECT mo.individuo_id, mo.fazenda_id, mo.data, 'morte', 'Morte',
       NULLIF(concat_ws(' · ', mo.causa_morte, mo.lote), ''),
       'registros_morte', mo.id
FROM public.registros_morte mo
WHERE mo.deleted_at IS NULL AND mo.individuo_id IS NOT NULL

UNION ALL
SELECT ev.individuo_id, ev.fazenda_id, (ev.data::timestamp AT TIME ZONE 'America/Cuiaba'), 'reprodutivo',
       ev.tipo || COALESCE(': ' || ev.resultado, ''),
       NULLIF(concat_ws(' · ', ev.touro_nome, ev.observacao), ''),
       'eventos_reprodutivos', ev.id
FROM public.eventos_reprodutivos ev
WHERE ev.deleted_at IS NULL

UNION ALL
SELECT h.individuo_id, h.fazenda_id, h.alterado_em, 'identificacao',
       'Identificação alterada: ' || CASE h.campo
         WHEN 'id_brinco' THEN 'brinco' WHEN 'id_chip' THEN 'chip' WHEN 'id_manejo' THEN 'ID de manejo'
         WHEN 'id_provisorio_cria' THEN 'ID provisório' WHEN 'codigo_sisbov' THEN 'código SISBOV'
         WHEN 'codigo_pnib' THEN 'código PNIB' ELSE h.campo END,
       COALESCE(h.valor_anterior, '(vazio)') || ' → ' || COALESCE(h.valor_novo, '(vazio)'),
       'individuo_identificacoes', h.id
FROM public.individuo_identificacoes h;


GRANT SELECT ON public.vw_individuo_linha_do_tempo TO authenticated;

-- ---- salvar_individuo: campos de rastreabilidade na lista permitida ----
CREATE OR REPLACE FUNCTION public.salvar_individuo(
  p_fazenda_id uuid,
  p_individuo_id uuid,
  p_dados jsonb,
  p_data_movimentacao date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_permitidas text[] := ARRAY[
    'id_manejo', 'id_brinco', 'id_chip', 'id_provisorio_cria', 'sexo', 'categoria', 'raca',
    'data_nascimento', 'peso_nascimento_kg', 'peso_atual_kg', 'origem', 'data_entrada_fazenda', 'pv_entrada_kg',
    'preco_entrada_reais_kg', 'preco_entrada_reais_arroba', 'preco_entrada_reais_cabeca', 'preco_arroba_boi_gordo',
    'agio_desagio', 'data_formacao_lote', 'lote_atual', 'protocolo_sanitario', 'fornecedor', 'propriedade_origem',
    'propriedade_atual', 'pai', 'mae', 'estrategia_nutricional_tipo', 'estrategia_nutricional_id',
    'estrategia_nutricional_nome', 'gmd_kg_cab_dia', 'peso_meta_kg', 'data_desmama', 'peso_desmama_kg',
    'pasto_atual', 'setor_atual', 'data_insercao_rastreabilidade', 'data_liberacao_sisbov', 'sync_status',
    'codigo_sisbov', 'codigo_pnib', 'dispositivo_tipo', 'data_identificacao', 'data_vacina_brucelose'
  ];
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_data date;
  v_dados jsonb;
  v_ind public.individuos%ROWTYPE;
  v_cat_ori public.lote_categorias%ROWTYPE;
  v_cat_dst public.lote_categorias%ROWTYPE;
  v_id uuid;
  v_criando boolean := p_individuo_id IS NULL;
  v_lote_ori uuid;
  v_cat_ori_nome text;
  v_lote_novo uuid;
  v_cat_novo text;
  v_status text;
  v_peso numeric;
  v_peso_mudou boolean := false;
  v_mudou_local boolean := false;
  v_cols text;
  v_sets text;
  v_nome_usuario text;
  v_ident text;
  v_movs integer := 0;
  v_peso_dst numeric;
BEGIN
  IF public.caller_is_peao() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação restrita ao painel de gestão');
  END IF;
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem acesso à fazenda');
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dados inválidos');
  END IF;

  v_data := COALESCE(p_data_movimentacao, v_hoje);
  IF v_data > v_hoje THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data da movimentação não pode ser futura');
  END IF;

  -- Só colunas permitidas; texto vazio vira NULL
  SELECT COALESCE(jsonb_object_agg(e.key, CASE WHEN e.value = '""'::jsonb THEN 'null'::jsonb ELSE e.value END), '{}'::jsonb)
  INTO v_dados
  FROM jsonb_each(p_dados) e
  WHERE e.key = ANY (v_permitidas);

  IF NOT v_criando THEN
    SELECT * INTO v_ind
    FROM public.individuos
    WHERE id = p_individuo_id AND fazenda_id = p_fazenda_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Indivíduo não encontrado');
    END IF;
    v_lote_ori := v_ind.lote_atual;
    v_cat_ori_nome := v_ind.categoria;
    v_status := v_ind.status;
  ELSE
    v_status := 'Vivo';
  END IF;

  v_lote_novo := CASE WHEN v_dados ? 'lote_atual' THEN NULLIF(v_dados->>'lote_atual', '')::uuid ELSE v_lote_ori END;
  v_cat_novo := CASE WHEN v_dados ? 'categoria' THEN v_dados->>'categoria' ELSE v_cat_ori_nome END;

  v_mudou_local := v_status = 'Vivo'
    AND (v_lote_novo IS NOT NULL AND v_cat_novo IS NOT NULL)
    AND (v_criando OR v_lote_novo IS DISTINCT FROM v_lote_ori OR lower(v_cat_novo) IS DISTINCT FROM lower(COALESCE(v_cat_ori_nome, '')));
  -- Tirar o animal de um lote sem destino também mexe no agregado
  IF NOT v_criando AND v_status = 'Vivo' AND v_lote_novo IS NULL AND v_lote_ori IS NOT NULL THEN
    v_mudou_local := true;
  END IF;

  IF NOT v_criando AND v_status <> 'Vivo'
     AND (v_lote_novo IS DISTINCT FROM v_lote_ori OR lower(COALESCE(v_cat_novo, '')) IS DISTINCT FROM lower(COALESCE(v_cat_ori_nome, ''))) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Animal baixado (' || v_status || ') não muda de lote ou categoria.');
  END IF;

  v_peso := CASE WHEN v_dados ? 'peso_atual_kg' THEN NULLIF(v_dados->>'peso_atual_kg', '')::numeric ELSE
              CASE WHEN v_criando THEN NULL ELSE v_ind.peso_atual_kg END END;
  v_peso_mudou := v_dados ? 'peso_atual_kg' AND v_peso IS NOT NULL
                  AND (v_criando OR v_peso IS DISTINCT FROM v_ind.peso_atual_kg);

  v_ident := COALESCE(NULLIF(v_dados->>'id_brinco', ''), NULLIF(v_dados->>'id_chip', ''), NULLIF(v_dados->>'id_manejo', ''),
                      NULLIF(v_dados->>'id_provisorio_cria', ''),
                      CASE WHEN v_criando THEN NULL ELSE COALESCE(v_ind.id_brinco, v_ind.id_chip, v_ind.id_manejo, v_ind.id_provisorio_cria) END,
                      'Indivíduo');

  -- ---- valida lote/categoria antes de qualquer escrita ----
  IF v_mudou_local THEN
    IF v_lote_novo IS NOT NULL AND v_cat_novo IS NOT NULL THEN
      SELECT lc.* INTO v_cat_dst
      FROM public.lote_categorias lc JOIN public.lotes l ON l.id = lc.lote_id
      WHERE lc.lote_id = v_lote_novo AND l.fazenda_id = p_fazenda_id
        AND lower(lc.categoria) = lower(v_cat_novo) AND lc.ativo = true
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A categoria "%" não existe (ativa) no lote de destino.', v_cat_novo USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF NOT v_criando AND v_lote_ori IS NOT NULL AND v_cat_ori_nome IS NOT NULL THEN
      SELECT lc.* INTO v_cat_ori
      FROM public.lote_categorias lc JOIN public.lotes l ON l.id = lc.lote_id
      WHERE lc.lote_id = v_lote_ori AND l.fazenda_id = p_fazenda_id
        AND lower(lc.categoria) = lower(v_cat_ori_nome) AND lc.ativo = true
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A categoria "%" do animal não existe (ativa) no lote de origem. Corrija o cadastro de lotes antes de mover o animal.', v_cat_ori_nome
          USING ERRCODE = 'P0001';
      END IF;
      IF COALESCE(v_cat_ori.quant_atual, 0) <= 0 THEN
        RAISE EXCEPTION 'A categoria "%" está com 0 cabeças no lote de origem; a saída não teria efeito no agregado.', v_cat_ori.categoria
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- ---- grava o indivíduo ----
  IF v_criando THEN
    SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(v_dados) k;
    IF v_cols IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Nenhum dado informado');
    END IF;
    EXECUTE format(
      'INSERT INTO public.individuos (fazenda_id, status, %1$s) SELECT $1, ''Vivo'', %1$s FROM jsonb_populate_record(NULL::public.individuos, $2) RETURNING id',
      v_cols) INTO v_id USING p_fazenda_id, v_dados;
    IF v_peso_mudou THEN
      UPDATE public.individuos SET peso_atual_origem = 'manual', peso_atual_data = v_hoje WHERE id = v_id;
    END IF;
  ELSE
    v_id := v_ind.id;
    SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_sets FROM jsonb_object_keys(v_dados) k;
    IF v_sets IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.individuos i SET %s, updated_at = now() FROM jsonb_populate_record(NULL::public.individuos, $1) r WHERE i.id = $2',
        v_sets) USING v_dados, v_id;
    END IF;
    IF v_peso_mudou THEN
      UPDATE public.individuos SET peso_atual_origem = 'manual', peso_atual_data = v_hoje WHERE id = v_id;
    END IF;
    IF v_mudou_local THEN
      UPDATE public.individuos SET localizacao_incerta_desde = NULL WHERE id = v_id;
    END IF;
  END IF;

  -- ---- herança nutricional da categoria do lote (criação ou mudança de local) ----
  IF (v_criando OR v_mudou_local) AND v_cat_dst.id IS NOT NULL THEN
    UPDATE public.individuos
    SET estrategia_nutricional_tipo = CASE
          WHEN v_cat_dst.estrategia_nutricional ILIKE '%Proteico%' OR v_cat_dst.estrategia_nutricional ILIKE '%Proteinado%' THEN 'Proteico-Energético'
          ELSE 'Ração' END,
        estrategia_nutricional_nome = v_cat_dst.estrategia_nutricional,
        gmd_kg_cab_dia = CASE WHEN v_cat_dst.gmd ~ '^\s*[0-9]+([.,][0-9]+)?\s*$'
                              THEN replace(btrim(v_cat_dst.gmd), ',', '.')::numeric ELSE NULL END,
        peso_meta_kg = v_cat_dst.peso_vivo_meta_kg_cab,
        estrategia_nutricional_id = v_cat_dst.formulacao_id
    WHERE id = v_id;
  END IF;

  -- ---- movimentação agregada: Saída antes da Entrada (os contadores seguem a sequência) ----
  IF v_mudou_local THEN
    SELECT u.nome INTO v_nome_usuario FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;

    IF v_cat_ori.id IS NOT NULL THEN
      INSERT INTO public.registros_movimentacao (
        fazenda_id, nome_usuario, data, lote_origem, numero_cabecas, peso_vivo_atual_kg,
        motivo_movimentacao, causa_observacao, categoria, lote_origem_id, individuo_id
      ) VALUES (
        p_fazenda_id, COALESCE(v_nome_usuario, 'Painel'), public.data_movimentacao_individuo(v_data, v_cat_ori),
        (SELECT nome FROM public.lotes WHERE id = v_lote_ori), 1, v_peso, 'Saída',
        'Saída por realocação de ' || v_ident, v_cat_ori.categoria, v_lote_ori, v_id
      );
      v_movs := v_movs + 1;
    END IF;

    IF v_cat_dst.id IS NOT NULL THEN
      v_peso_dst := COALESCE(v_peso, v_cat_dst.peso_vivo_atual_kg_cab);
      INSERT INTO public.registros_movimentacao (
        fazenda_id, nome_usuario, data, lote_origem, numero_cabecas, peso_vivo_atual_kg,
        motivo_movimentacao, causa_observacao, categoria, lote_origem_id, individuo_id
      ) VALUES (
        p_fazenda_id, COALESCE(v_nome_usuario, 'Painel'), public.data_movimentacao_individuo(v_data, v_cat_dst),
        (SELECT nome FROM public.lotes WHERE id = v_lote_novo), 1, v_peso_dst, 'Entrada',
        CASE WHEN v_criando THEN 'Entrada de indivíduo: ' ELSE 'Entrada por realocação de ' END || v_ident,
        v_cat_dst.categoria, v_lote_novo, v_id
      );
      v_movs := v_movs + 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'movimentacoes', v_movs);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.salvar_individuo(uuid, uuid, jsonb, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.salvar_individuo(uuid, uuid, jsonb, date) FROM anon, public;
