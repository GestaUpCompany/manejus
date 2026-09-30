-- Relatório de Pastagens: adiciona `ocupacoes_contexto` ao payload.
--
-- Motivo: o gráfico "Descanso entre ocupações" precisa comparar a ocupação
-- atual de cada pasto com a ocupação IMEDIATAMENTE ANTERIOR, mesmo quando
-- ela terminou antes do início do período do relatório (o array `ocupacoes`
-- só traz períodos que intersectam a janela). Sem essa linha de contexto o
-- descanso ficava sistematicamente vazio.
--
-- `ocupacoes_contexto` = para cada pasto com ocupação na janela, o último
-- período ENCERRADO anterior à primeira ocupação da janela. Vai em array
-- separado para não contaminar tabelas/KPIs que assumem interseção.
--
-- CREATE OR REPLACE da função inteira (assinatura idêntica); o wrapper
-- *_fazenda delega para ela e não muda.

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
  v_ocupacoes_ctx jsonb;
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
  -- v_lote_pasto_ocupacao_atual. pasto_id entra no CTE só para alimentar
  -- a CTE ctx (contexto de descanso) — não vai para o JSON.
  WITH oc AS (
    SELECT
      h.id,
      h.pasto_id,
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
  ),
  -- Contexto de descanso: para cada pasto ocupado na janela, a última
  -- ocupação ENCERRADA anterior à primeira ocupação da janela. Permite
  -- medir o descanso real entre ciclos mesmo quando o ciclo anterior
  -- terminou antes do período pedido.
  ctx AS (
    SELECT DISTINCT ON (o.pasto_id)
      o.pasto_id,
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
      round(EXTRACT(epoch FROM h.data_hora_saida - h.data_hora_entrada) / 86400.0, 2) AS periodo_dias,
      h.taxa_lotacao_ua_ha AS taxa_ua_ha,
      h.desvio_tempo_ocupacao_percent AS desvio_percent
    FROM (
      SELECT pasto_id, MIN(data_hora_entrada) AS primeira_entrada
      FROM oc WHERE pasto_id IS NOT NULL
      GROUP BY pasto_id
    ) o
    JOIN LATERAL (
      SELECT h2.* FROM lote_pasto_historico h2
      JOIN lotes l2 ON l2.id = h2.lote_id AND l2.fazenda_id = v_fazenda_id
      WHERE h2.pasto_id = o.pasto_id
        AND h2.data_hora_entrada < o.primeira_entrada
        AND h2.data_hora_saida IS NOT NULL
      ORDER BY h2.data_hora_entrada DESC
      LIMIT 1
    ) h ON true
    JOIN lotes l ON l.id = h.lote_id
    LEFT JOIN pastos p ON p.id = h.pasto_id
    LEFT JOIN modulos_pastos m ON m.id = h.modulo_id
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
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
    ) ORDER BY o.data_hora_entrada DESC) FROM oc o), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'historico_id', c.id,
      'lote', c.lote_nome,
      'pasto', c.pasto_nome,
      'modulo', c.modulo_nome,
      'data_entrada', to_char(c.data_hora_entrada AT TIME ZONE v_timezone, 'YYYY-MM-DD'),
      'data_saida', to_char(c.data_hora_saida AT TIME ZONE v_timezone, 'YYYY-MM-DD'),
      'em_andamento', false,
      'dias', c.periodo_dias,
      'cabecas_entrada', c.cabecas_entrada,
      'cabecas_saida', c.cabecas_saida,
      'peso_medio_entrada_kg', c.peso_vivo_medio_entrada_kg,
      'peso_medio_saida_kg', c.peso_vivo_medio_saida_kg,
      'taxa_lotacao_ua_ha', c.taxa_ua_ha,
      'meta_ocupacao_dias', c.meta_intervalo_ocupacao_dias,
      'desvio_percent', c.desvio_percent
    )) FROM ctx c), '[]'::jsonb)
  INTO v_ocupacoes, v_ocupacoes_ctx;

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
      'ocupacoes', v_ocupacoes,
      'ocupacoes_contexto', v_ocupacoes_ctx
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_pastagens(uuid, date, date) TO anon, authenticated;
