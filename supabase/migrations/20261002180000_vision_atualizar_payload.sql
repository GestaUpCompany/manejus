-- Vision'Up: suporte ao fluxo de iteração da planilha (corrige dados, sobe de
-- novo, confere). O link público já compartilhado continua o mesmo; só o
-- payload e a config são substituídos.
--
-- 1) vision_listar_relatorios passa a expor fazenda_id para que a UI saiba a
--    qual fazenda cada link pertence (atualizar dados de um link só faz
--    sentido com a planilha da mesma fazenda carregada). Mudança de row type
--    exige DROP + CREATE.
-- 2) vision_atualizar_payload substitui payload/config de um link existente.

DROP FUNCTION IF EXISTS public.vision_listar_relatorios(uuid);

CREATE FUNCTION public.vision_listar_relatorios(p_fazenda_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, titulo text, config jsonb, criado_em timestamptz, expira_em timestamptz, ativo boolean, fazenda_id uuid, fazenda_nome text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rp.id, rp.titulo, rp.config, rp.criado_em, rp.expira_em, rp.ativo, rp.fazenda_id, f.nome AS fazenda_nome
  FROM relatorios_publicos rp
  JOIN fazendas f ON f.id = rp.fazenda_id
  WHERE rp.tipo = 'vision'
    AND (p_fazenda_id IS NULL OR rp.fazenda_id = p_fazenda_id)
    AND vision_tem_acesso()
  ORDER BY rp.criado_em DESC
$$;

CREATE OR REPLACE FUNCTION public.vision_atualizar_payload(p_id uuid, p_payload text, p_config jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT vision_tem_acesso() THEN
    RAISE EXCEPTION 'Acesso Vision negado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM relatorios_publicos WHERE id = p_id AND tipo = 'vision') THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;
  IF p_config IS NOT NULL THEN
    UPDATE relatorios_publicos SET config = p_config WHERE id = p_id;
  END IF;
  INSERT INTO relatorio_publico_payloads (relatorio_id, payload)
    VALUES (p_id, p_payload)
    ON CONFLICT (relatorio_id) DO UPDATE SET payload = EXCLUDED.payload;
END;
$$;
