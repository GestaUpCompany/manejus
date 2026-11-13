-- Infográfico Anual, fase 2B: Bebedouros.
-- Diferente das outras seções, o relatório mensal de bebedouros não tem RPC de dados (o cálculo roda no
-- navegador, em features/relatorioBebedouros/calculos.ts). Esta RPC lê direto das tabelas e repete as regras:
--  - só entram os bebedouros permitidos pelo relatório (get_bebedouros_permitidos_relatorio_fazenda, que
--    também valida o acesso do usuário à fazenda);
--  - intervalo de uma limpeza = dias desde a limpeza anterior do mesmo bebedouro (a anterior pode ser do
--    ano passado); dentro da meta se <= meta, acima se <= teto(meta x 1,3), muito acima no resto; sem meta
--    ou primeira limpeza não entram no percentual;
--  - situação no fim do período (hoje, no ano corrente): em dia / atrasado / crítico / sem registro / sem meta,
--    pelos mesmos limites; ocorrência = registro de checklist com algum item respondido "não".
-- Devolve só agregados (12 meses, totais do ano, rankings top 10). Aditiva: só cria função nova.
-- Rollback em supabase/rollbacks/.

CREATE OR REPLACE FUNCTION public.get_infografico_anual_bebedouros(p_fazenda_id uuid, p_ano int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ini date; v_fim date; v_ult int; v_ids uuid[];
BEGIN
  IF p_ano IS NULL OR p_ano < 2020 OR p_ano > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;
  SELECT data_inicio, data_fim, ultimo_mes INTO v_ini, v_fim, v_ult FROM public._infografico_anual_periodo(p_ano);
  -- Valida o acesso à fazenda e devolve os bebedouros que o relatório considera.
  SELECT COALESCE(array_agg(bebedouro_id), '{}'::uuid[]) INTO v_ids FROM public.get_bebedouros_permitidos_relatorio_fazenda(p_fazenda_id);

  RETURN (
    WITH b AS (
      SELECT id, nome, NULLIF(meta_intervalo_limpeza, 0) AS meta
      FROM bebedouros
      WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND id = ANY(v_ids)
    ),
    l AS (
      SELECT h.bebedouro_id, h.data_limpeza,
             lag(h.data_limpeza) OVER (PARTITION BY h.bebedouro_id ORDER BY h.data_limpeza) AS anterior
      FROM historico_limpezas_bebedouros h
      JOIN b ON b.id = h.bebedouro_id
      WHERE h.fazenda_id = p_fazenda_id AND h.data_limpeza <= v_fim
    ),
    ly AS (
      SELECT l.bebedouro_id, b.nome, b.meta,
             extract(month FROM l.data_limpeza)::int AS mes,
             CASE WHEN l.anterior IS NULL THEN NULL ELSE l.data_limpeza - l.anterior END AS intervalo
      FROM l JOIN b ON b.id = l.bebedouro_id
      WHERE l.data_limpeza >= v_ini
    ),
    lc AS (
      SELECT ly.*,
             CASE WHEN meta IS NULL OR intervalo IS NULL THEN NULL
                  WHEN intervalo <= meta THEN 'dentro'
                  WHEN intervalo <= ceil(meta * 1.3) THEN 'acima'
                  ELSE 'muito' END AS faixa
      FROM ly
    ),
    sit AS (
      SELECT b.id, b.nome, b.meta,
             (SELECT max(l.data_limpeza) FROM l WHERE l.bebedouro_id = b.id) AS ultima
      FROM b
    ),
    st AS (
      SELECT sit.*, (v_fim - ultima) AS dias,
             CASE WHEN ultima IS NULL THEN 'sem_registro'
                  WHEN meta IS NULL THEN 'sem_meta'
                  WHEN (v_fim - ultima) <= meta THEN 'em_dia'
                  WHEN (v_fim - ultima) <= ceil(meta * 1.3) THEN 'atrasado'
                  ELSE 'critico' END AS status
      FROM sit
    ),
    r AS (
      SELECT extract(month FROM (x.data AT TIME ZONE 'America/Cuiaba'))::int AS mes,
             NULLIF(btrim(x.numero_bebedouro), '') AS nome,
             x.checklist AS ck
      FROM registros_bebedouros x
      WHERE x.fazenda_id = p_fazenda_id AND x.deleted_at IS NULL
        AND (x.data AT TIME ZONE 'America/Cuiaba')::date BETWEEN v_ini AND v_fim
        AND x.numero_bebedouro IN (SELECT nome FROM b)
    ),
    itens(chave, rotulo) AS (
      VALUES ('agua_suficiente', 'Água insuficiente'),
             ('vazao_bebedouro_ideal', 'Vazão não ideal'),
             ('espacamento_bebedouro_ideal', 'Espaçamento não ideal'),
             ('boia_protecao_boas_condicoes', 'Bóia/proteção em más condições'),
             ('aterro_acesso_bebedouro_ideal', 'Aterro/acesso não ideal')
    ),
    rc AS (
      -- Com checklist = respondeu ao menos um dos itens (outras chaves, como a foto, não contam).
      SELECT r.*,
             (jsonb_typeof(ck) = 'object' AND EXISTS (SELECT 1 FROM itens i WHERE ck ? i.chave)) AS com_check,
             (jsonb_typeof(ck) = 'object' AND EXISTS (SELECT 1 FROM itens i WHERE ck->i.chave->>'valor' = 'false')) AS ocorrencia
      FROM r
    ),
    meses AS (SELECT generate_series(1, v_ult) AS mes)
    SELECT jsonb_build_object(
      'ano', p_ano, 'ultimo_mes', v_ult,
      'kpis', jsonb_build_object(
        'bebedouros', (SELECT count(*) FROM b),
        'limpezas', (SELECT count(*) FROM lc),
        'bebedouros_limpos', (SELECT count(DISTINCT bebedouro_id) FROM lc),
        'intervalo_medio_dias', (SELECT round(avg(intervalo), 1) FROM lc WHERE intervalo IS NOT NULL),
        'avaliadas', (SELECT count(*) FROM lc WHERE faixa IS NOT NULL),
        'dentro_meta', (SELECT count(*) FROM lc WHERE faixa = 'dentro'),
        'acima_meta', (SELECT count(*) FROM lc WHERE faixa = 'acima'),
        'muito_acima_meta', (SELECT count(*) FROM lc WHERE faixa = 'muito'),
        'em_dia', (SELECT count(*) FROM st WHERE status = 'em_dia'),
        'atrasados', (SELECT count(*) FROM st WHERE status = 'atrasado'),
        'criticos', (SELECT count(*) FROM st WHERE status = 'critico'),
        'sem_registro', (SELECT count(*) FROM st WHERE status = 'sem_registro'),
        'sem_meta', (SELECT count(*) FROM st WHERE status = 'sem_meta'),
        'registros', (SELECT count(*) FROM rc),
        'com_checklist', (SELECT count(*) FROM rc WHERE com_check),
        'com_ocorrencia', (SELECT count(*) FROM rc WHERE ocorrencia)
      ),
      'mensal', (
        SELECT jsonb_agg(jsonb_build_object(
          'mes', meses.mes,
          'limpezas', (SELECT count(*) FROM lc WHERE lc.mes = meses.mes),
          'avaliadas', (SELECT count(*) FROM lc WHERE lc.mes = meses.mes AND faixa IS NOT NULL),
          'dentro_meta', (SELECT count(*) FROM lc WHERE lc.mes = meses.mes AND faixa = 'dentro'),
          'registros', (SELECT count(*) FROM rc WHERE rc.mes = meses.mes),
          'com_checklist', (SELECT count(*) FROM rc WHERE rc.mes = meses.mes AND com_check),
          'ocorrencias', (SELECT count(*) FROM rc WHERE rc.mes = meses.mes AND ocorrencia)
        ) ORDER BY meses.mes) FROM meses
      ),
      'por_item', (
        SELECT jsonb_agg(jsonb_build_object(
          'label', i.rotulo,
          'valor', (SELECT count(*) FROM rc WHERE com_check AND ck->i.chave->>'valor' = 'false')
        ) ORDER BY (SELECT count(*) FROM rc WHERE com_check AND ck->i.chave->>'valor' = 'false') DESC, i.rotulo)
        FROM itens i
      ),
      'mais_ocorrencias', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', COALESCE(nome, 'Sem identificação'), 'valor', n) ORDER BY n DESC, nome)
        FROM (SELECT nome, count(*) n FROM rc WHERE ocorrencia GROUP BY nome ORDER BY count(*) DESC, nome LIMIT 10) q), '[]'::jsonb),
      'mais_limpezas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'valor', n, 'meta', meta, 'intervalo_medio', media) ORDER BY n DESC, nome)
        FROM (SELECT nome, max(meta) AS meta, count(*) n, round(avg(intervalo), 1) AS media
              FROM lc GROUP BY nome ORDER BY count(*) DESC, nome LIMIT 10) q), '[]'::jsonb),
      'mais_atrasados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', nome, 'dias', dias, 'meta', meta, 'status', status) ORDER BY dias DESC)
        FROM (SELECT nome, dias, meta, status FROM st WHERE status IN ('atrasado', 'critico') ORDER BY dias DESC LIMIT 10) q), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_infografico_anual_bebedouros(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infografico_anual_bebedouros(uuid, int) TO authenticated;
