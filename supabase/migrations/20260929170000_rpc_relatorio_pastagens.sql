-- Relatório de Manejo de Pastagens (link público + Infográfico Mensal).
--
-- Parte 1: correção de bug nas views de ocupação. Tanto
-- v_historico_ocupacao_pasto quanto v_lote_pasto_ocupacao_atual faziam
--   LEFT JOIN modulos_pastos m ON h.modulo_id = p.modulo_id
-- sem referenciar `m` no ON, o que vira produto cartesiano com TODOS os
-- módulos quando h.modulo_id = p.modulo_id (a tela Histórico de Ocupação
-- exibia a mesma ocupação repetida com nomes de módulos diferentes).
-- Correção: m.id = h.modulo_id (módulo gravado no histórico pelo trigger).
-- Colunas mantidas idênticas, só muda a condição do join.
--
-- Parte 2: get_dados_relatorio_pastagens (pública, validada por token em
-- relatorios_publicos tipo 'pastagens') + variante *_fazenda para o
-- Infográfico Mensal, mesmo padrão de get_dados_relatorio_rodeio.
--
-- Retorna JSON com:
--   fazenda_id
--   dados: { fazenda_nome, fazenda_logo_url, timezone,
--            pastos_disponiveis, lotes_disponiveis,
--            responsaveis_disponiveis, modulos_disponiveis,
--            pastos_info: [{nome, area_util_ha, especie, nivel_degradacao,
--                           modulo, meta_ocupacao_dias}],
--            registros: [trocas de pasto do período],
--            ocupacoes: [períodos de ocupação que intersectam o período] }
--
-- registros vem de registros_pastagens; ocupacoes vem de
-- lote_pasto_historico (join em lotes para obter fazenda_id, já que o
-- histórico não tem a coluna própria) com nomes de pasto/módulo resolvidos.

-- ---------------------------------------------------------------------------
-- Parte 1: views corrigidas (defs idênticas às originais, exceto o ON do join)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_historico_ocupacao_pasto AS
 SELECT h.id AS historico_id,
    h.lote_id,
    l.nome AS lote_nome,
    h.pasto_id,
    p.nome AS pasto_nome,
    h.modulo_id,
    m.nome AS modulo_nome,
    h.data_hora_entrada,
    h.data_hora_saida,
    h.cabecas_entrada,
    h.peso_vivo_medio_entrada_kg,
    h.cabecas_saida,
    h.peso_vivo_medio_saida_kg,
    h.meta_intervalo_ocupacao_dias,
    h.desvio_tempo_ocupacao_percent,
        CASE
            WHEN h.data_hora_saida IS NULL THEN
            CASE
                WHEN p.area_util_ha IS NOT NULL AND p.area_util_ha > 0::numeric THEN round(COALESCE(( SELECT sum(lc.quant_atual::numeric * lc.peso_vivo_atual_kg_cab) AS sum
                   FROM lote_categorias lc
                  WHERE lc.lote_id = h.lote_id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), h.cabecas_entrada::numeric * h.peso_vivo_medio_entrada_kg) / 450.0 / p.area_util_ha, 2)
                ELSE NULL::numeric
            END
            ELSE h.taxa_lotacao_ua_ha
        END AS taxa_lotacao_ua_ha,
        CASE
            WHEN h.data_hora_saida IS NOT NULL THEN round(EXTRACT(epoch FROM h.data_hora_saida - h.data_hora_entrada) / 86400.0, 2)
            ELSE NULL::numeric
        END AS periodo_ocupacao_dias,
        CASE
            WHEN h.data_hora_saida IS NOT NULL THEN round(EXTRACT(epoch FROM h.data_hora_saida - h.data_hora_entrada) / 3600.0, 2)
            ELSE NULL::numeric
        END AS periodo_ocupacao_horas
   FROM lote_pasto_historico h
     JOIN lotes l ON h.lote_id = l.id
     LEFT JOIN pastos p ON h.pasto_id = p.id
     LEFT JOIN modulos_pastos m ON m.id = h.modulo_id
  ORDER BY h.data_hora_entrada DESC;

CREATE OR REPLACE VIEW public.v_lote_pasto_ocupacao_atual AS
 SELECT h.id AS historico_id,
    h.lote_id,
    l.nome AS lote_nome,
    h.pasto_id,
    p.nome AS pasto_nome,
    h.modulo_id,
    m.nome AS modulo_nome,
    h.data_hora_entrada,
    h.cabecas_entrada,
    h.peso_vivo_medio_entrada_kg,
    h.meta_intervalo_ocupacao_dias,
    COALESCE(( SELECT sum(lc.quant_atual) AS sum
           FROM lote_categorias lc
          WHERE lc.lote_id = h.lote_id AND lc.ativo = true AND lc.quant_atual > 0), h.cabecas_entrada::bigint) AS cabecas_atual,
    COALESCE(calcular_peso_medio_lote(h.lote_id), h.peso_vivo_medio_entrada_kg) AS peso_vivo_medio_atual_kg,
        CASE
            WHEN p.area_util_ha IS NOT NULL AND p.area_util_ha > 0::numeric THEN round(COALESCE(( SELECT sum(lc.quant_atual::numeric * lc.peso_vivo_atual_kg_cab) AS sum
               FROM lote_categorias lc
              WHERE lc.lote_id = h.lote_id AND lc.ativo = true AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL), h.cabecas_entrada::numeric * h.peso_vivo_medio_entrada_kg) / 450.0 / p.area_util_ha, 2)
            ELSE NULL::numeric
        END AS taxa_lotacao_ua_ha,
    round(EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0, 2) AS periodo_ocupacao_dias,
    round(EXTRACT(epoch FROM now() - h.data_hora_entrada) / 3600.0, 2) AS periodo_ocupacao_horas,
        CASE
            WHEN h.meta_intervalo_ocupacao_dias IS NOT NULL THEN GREATEST(0::numeric, round(EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0 - h.meta_intervalo_ocupacao_dias::numeric, 2))
            ELSE NULL::numeric
        END AS dias_acima_meta,
        CASE
            WHEN h.meta_intervalo_ocupacao_dias IS NOT NULL AND h.meta_intervalo_ocupacao_dias > 0 THEN round((EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0 - h.meta_intervalo_ocupacao_dias::numeric) / h.meta_intervalo_ocupacao_dias::numeric * 100.0, 2)
            ELSE NULL::numeric
        END AS desvio_percentual_atual,
        CASE
            WHEN h.meta_intervalo_ocupacao_dias IS NOT NULL AND (EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0) > h.meta_intervalo_ocupacao_dias::numeric THEN true
            ELSE false
        END AS meta_excedida
   FROM lote_pasto_historico h
     JOIN lotes l ON h.lote_id = l.id
     LEFT JOIN pastos p ON h.pasto_id = p.id
     LEFT JOIN modulos_pastos m ON m.id = h.modulo_id
  WHERE h.data_hora_saida IS NULL;

-- ---------------------------------------------------------------------------
-- Parte 2: RPC pública do relatório
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_pastagens(
  p_token uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
  v_fazenda_nome text;
  v_fazenda_logo_url text;
  v_timezone text;
  v_registros jsonb;
  v_ocupacoes jsonb;
  v_pastos jsonb;
  v_lotes jsonb;
  v_responsaveis jsonb;
  v_modulos jsonb;
  v_pastos_info jsonb;
BEGIN
  -- Validar token
  SELECT fazenda_id, ativo, expira_em INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token AND tipo = 'pastagens';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  -- Nome, logo e timezone da fazenda
  SELECT nome, logo_url, COALESCE(timezone, 'America/Cuiaba')
    INTO v_fazenda_nome, v_fazenda_logo_url, v_timezone
  FROM fazendas
  WHERE id = v_fazenda_id;

  -- Trocas de pasto do período. Nomes de pasto/lote resolvem pelo join no
  -- id (cadastro atual) com fallback para as colunas de texto legadas.
  WITH regs AS (
    SELECT
      r.id,
      r.data,
      r.horario_manejo,
      COALESCE(r.manejador, r.nome_usuario) AS responsavel,
      r.manejador,
      r.nome_usuario,
      COALESCE(l.nome, r.lote) AS lote_nome,
      COALESCE(ps.nome, r.pasto_saida) AS pasto_saida_nome,
      ms.nome AS modulo_saida_nome,
      r.avaliacao_saida,
      r.tempo_ocupacao,
      COALESCE(r.pasto_saida_area_util, ps.area_util_ha) AS pasto_saida_area,
      COALESCE(r.pasto_saida_especie, ps.especie) AS pasto_saida_esp,
      COALESCE(pe.nome, r.pasto_entrada) AS pasto_entrada_nome,
      me.nome AS modulo_entrada_nome,
      r.avaliacao_entrada,
      r.tempo_vedacao,
      COALESCE(r.pasto_entrada_area_util, pe.area_util_ha) AS pasto_entrada_area,
      COALESCE(r.pasto_entrada_especie, pe.especie) AS pasto_entrada_esp,
      r.vaca,
      r.touro,
      r.bezerro,
      r.boi_magro,
      r.garrote,
      r.novilha,
      r.total_animais,
      r.gado_contado,
      r.escore_gado,
      r.escore_fezes,
      r.numero_pessoas_manejo,
      r.equipe_nomes,
      r.avaliacao_geral,
      to_char(r.data AT TIME ZONE v_timezone, 'YYYY-MM-DD') AS data_dia
    FROM registros_pastagens r
    LEFT JOIN lotes l ON l.id = r.lote_id
    LEFT JOIN pastos ps ON ps.id = r.pasto_saida_id
    LEFT JOIN modulos_pastos ms ON ms.id = ps.modulo_id
    LEFT JOIN pastos pe ON pe.id = r.pasto_entrada_id
    LEFT JOIN modulos_pastos me ON me.id = pe.modulo_id
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND (p_data_inicio IS NULL OR (r.data AT TIME ZONE v_timezone)::date >= p_data_inicio)
      AND (p_data_fim IS NULL OR (r.data AT TIME ZONE v_timezone)::date <= p_data_fim)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'registro_id', r.id,
    'data', r.data_dia,
    'horario_manejo', COALESCE(to_char(r.horario_manejo, 'HH24:MI'), to_char(r.data AT TIME ZONE v_timezone, 'HH24:MI')),
    'responsavel', r.responsavel,
    'manejador', r.manejador,
    'nome_usuario', r.nome_usuario,
    'lote', r.lote_nome,
    'pasto_saida', r.pasto_saida_nome,
    'modulo_saida', r.modulo_saida_nome,
    'avaliacao_saida', r.avaliacao_saida,
    'tempo_ocupacao', r.tempo_ocupacao,
    'pasto_saida_area_util', r.pasto_saida_area,
    'pasto_saida_especie', r.pasto_saida_esp,
    'pasto_entrada', r.pasto_entrada_nome,
    'modulo_entrada', r.modulo_entrada_nome,
    'avaliacao_entrada', r.avaliacao_entrada,
    'tempo_vedacao', r.tempo_vedacao,
    'pasto_entrada_area_util', r.pasto_entrada_area,
    'pasto_entrada_especie', r.pasto_entrada_esp,
    'vaca', r.vaca,
    'touro', r.touro,
    'bezerro', r.bezerro,
    'boi_magro', r.boi_magro,
    'garrote', r.garrote,
    'novilha', r.novilha,
    'total_animais', r.total_animais,
    'gado_contado', r.gado_contado,
    'escore_gado', r.escore_gado,
    'escore_fezes', r.escore_fezes,
    'numero_pessoas_manejo', r.numero_pessoas_manejo,
    'equipe_nomes', r.equipe_nomes,
    'avaliacao_geral', r.avaliacao_geral
  ) ORDER BY r.data DESC), '[]'::jsonb)
  INTO v_registros
  FROM regs r;

  -- Histórico de ocupação (lote_pasto_historico): períodos que intersectam
  -- o intervalo do relatório no fuso da fazenda. O histórico não tem
  -- fazenda_id própria; o tenant vem do join em lotes. Ocupações abertas
  -- (data_hora_saida IS NULL) calculam dias/desvio/taxa até agora, como
  -- v_lote_pasto_ocupacao_atual.
  WITH oc AS (
    SELECT
      h.id,
      l.nome AS lote_nome,
      COALESCE(p.nome, 'Sem pasto') AS pasto_nome,
      m.nome AS modulo_nome,
      h.data_hora_entrada,
      h.data_hora_saida,
      h.cabecas_entrada,
      h.cabecas_saida,
      h.peso_vivo_medio_entrada_kg,
      h.peso_vivo_medio_saida_kg,
      h.meta_intervalo_ocupacao_dias,
      h.desvio_tempo_ocupacao_percent,
      CASE
        WHEN h.data_hora_saida IS NOT NULL
          THEN round(EXTRACT(epoch FROM h.data_hora_saida - h.data_hora_entrada) / 86400.0, 2)
        ELSE round(EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0, 2)
      END AS periodo_dias,
      CASE
        WHEN h.data_hora_saida IS NOT NULL THEN h.taxa_lotacao_ua_ha
        WHEN p.area_util_ha IS NOT NULL AND p.area_util_ha > 0::numeric
          THEN round(COALESCE((
               SELECT sum(lc.quant_atual::numeric * lc.peso_vivo_atual_kg_cab)
               FROM lote_categorias lc
               WHERE lc.lote_id = h.lote_id AND lc.ativo = true
                 AND lc.quant_atual > 0 AND lc.peso_vivo_atual_kg_cab IS NOT NULL
             ), h.cabecas_entrada::numeric * h.peso_vivo_medio_entrada_kg) / 450.0 / p.area_util_ha, 2)
        ELSE NULL::numeric
      END AS taxa_ua_ha,
      CASE
        WHEN h.data_hora_saida IS NOT NULL THEN h.desvio_tempo_ocupacao_percent
        WHEN h.meta_intervalo_ocupacao_dias IS NOT NULL AND h.meta_intervalo_ocupacao_dias > 0
          THEN round((EXTRACT(epoch FROM now() - h.data_hora_entrada) / 86400.0 - h.meta_intervalo_ocupacao_dias::numeric) / h.meta_intervalo_ocupacao_dias::numeric * 100.0, 2)
        ELSE NULL::numeric
      END AS desvio_percent
    FROM lote_pasto_historico h
    JOIN lotes l ON l.id = h.lote_id AND l.fazenda_id = v_fazenda_id
    LEFT JOIN pastos p ON p.id = h.pasto_id
    LEFT JOIN modulos_pastos m ON m.id = h.modulo_id
    WHERE (p_data_fim IS NULL OR (h.data_hora_entrada AT TIME ZONE v_timezone)::date <= p_data_fim)
      AND (p_data_inicio IS NULL OR h.data_hora_saida IS NULL OR (h.data_hora_saida AT TIME ZONE v_timezone)::date >= p_data_inicio)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'historico_id', o.id,
    'lote', o.lote_nome,
    'pasto', o.pasto_nome,
    'modulo', o.modulo_nome,
    'data_entrada', to_char(o.data_hora_entrada AT TIME ZONE v_timezone, 'YYYY-MM-DD'),
    'data_saida', CASE WHEN o.data_hora_saida IS NULL THEN NULL ELSE to_char(o.data_hora_saida AT TIME ZONE v_timezone, 'YYYY-MM-DD') END,
    'em_andamento', o.data_hora_saida IS NULL,
    'dias', o.periodo_dias,
    'cabecas_entrada', o.cabecas_entrada,
    'cabecas_saida', o.cabecas_saida,
    'peso_medio_entrada_kg', o.peso_vivo_medio_entrada_kg,
    'peso_medio_saida_kg', o.peso_vivo_medio_saida_kg,
    'taxa_lotacao_ua_ha', o.taxa_ua_ha,
    'meta_ocupacao_dias', o.meta_intervalo_ocupacao_dias,
    'desvio_percent', o.desvio_percent
  ) ORDER BY o.data_hora_entrada DESC), '[]'::jsonb)
  INTO v_ocupacoes
  FROM oc o;

  -- Dimensões para slicers: distintas de todo o histórico da fazenda (sem
  -- filtro de data), unindo registros e histórico de ocupação.
  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_pastos
  FROM (
    SELECT nome FROM pastos WHERE fazenda_id = v_fazenda_id AND deleted_at IS NULL AND nome IS NOT NULL
    UNION
    SELECT COALESCE(ps.nome, r.pasto_saida) FROM registros_pastagens r LEFT JOIN pastos ps ON ps.id = r.pasto_saida_id WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
    UNION
    SELECT COALESCE(pe.nome, r.pasto_entrada) FROM registros_pastagens r LEFT JOIN pastos pe ON pe.id = r.pasto_entrada_id WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
  ) d
  WHERE nome IS NOT NULL;

  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_lotes
  FROM (
    SELECT COALESCE(l.nome, r.lote) AS nome
    FROM registros_pastagens r LEFT JOIN lotes l ON l.id = r.lote_id
    WHERE r.fazenda_id = v_fazenda_id AND r.deleted_at IS NULL
    UNION
    SELECT l.nome FROM lote_pasto_historico h JOIN lotes l ON l.id = h.lote_id
    WHERE l.fazenda_id = v_fazenda_id
  ) d
  WHERE nome IS NOT NULL;

  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_responsaveis
  FROM (
    SELECT DISTINCT COALESCE(r.manejador, r.nome_usuario) AS nome
    FROM registros_pastagens r
    WHERE r.fazenda_id = v_fazenda_id
      AND r.deleted_at IS NULL
      AND COALESCE(r.manejador, r.nome_usuario) IS NOT NULL
  ) d;

  SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::jsonb)
  INTO v_modulos
  FROM (
    SELECT DISTINCT m.nome
    FROM modulos_pastos m
    WHERE m.fazenda_id = v_fazenda_id
      AND m.deleted_at IS NULL
      AND m.nome IS NOT NULL
  ) d;

  -- Cadastro dos pastos da fazenda para o resumo por pasto (área, espécie,
  -- nível de degradação, módulo e meta de ocupação).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nome', p.nome,
    'area_util_ha', p.area_util_ha,
    'especie', p.especie,
    'nivel_degradacao', p.nivel_degradacao,
    'modulo', m.nome,
    'meta_ocupacao_dias', p.meta_intervalo_ocupacao_dias
  ) ORDER BY p.nome), '[]'::jsonb)
  INTO v_pastos_info
  FROM pastos p
  LEFT JOIN modulos_pastos m ON m.id = p.modulo_id
  WHERE p.fazenda_id = v_fazenda_id
    AND p.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'fazenda_id', v_fazenda_id,
    'dados', jsonb_build_object(
      'fazenda_nome', v_fazenda_nome,
      'fazenda_logo_url', v_fazenda_logo_url,
      'timezone', v_timezone,
      'pastos_disponiveis', v_pastos,
      'lotes_disponiveis', v_lotes,
      'responsaveis_disponiveis', v_responsaveis,
      'modulos_disponiveis', v_modulos,
      'pastos_info', v_pastos_info,
      'registros', v_registros,
      'ocupacoes', v_ocupacoes
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_pastagens(uuid, date, date) TO anon, authenticated;

-- Variante para o Infográfico Mensal: recebe fazenda_id direto, valida acesso
-- do usuário autenticado e reutiliza a RPC pública via token temporário.
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_pastagens_fazenda(
  p_fazenda_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_token uuid;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_fazenda_access(p_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado à fazenda';
  END IF;
  INSERT INTO public.relatorios_publicos (fazenda_id, tipo, titulo)
  VALUES (p_fazenda_id, 'pastagens', 'Relatório temporário')
  RETURNING id INTO v_token;
  v_result := public.get_dados_relatorio_pastagens(v_token, p_data_inicio, p_data_fim);
  DELETE FROM public.relatorios_publicos WHERE id = v_token;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dados_relatorio_pastagens_fazenda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_pastagens_fazenda(uuid, date, date) TO authenticated;
