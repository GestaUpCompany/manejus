-- Vision'Up: permite ao usuário autenticado regenerar PDF a partir de um link
-- já gerado. Diferente de vision_relatorio_payload (pública, por token), esta
-- não checa ativo/expira_em: o dono pode baixar o PDF mesmo de link desativado.
-- Retorna NULL quando o relatório não tem payload salvo.

CREATE OR REPLACE FUNCTION public.vision_baixar_payload(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload text;
BEGIN
  IF NOT vision_tem_acesso() THEN
    RAISE EXCEPTION 'Acesso Vision negado';
  END IF;
  SELECT pp.payload INTO v_payload
  FROM relatorio_publico_payloads pp
  JOIN relatorios_publicos rp ON rp.id = pp.relatorio_id
  WHERE pp.relatorio_id = p_id AND rp.tipo = 'vision';
  RETURN v_payload;
END;
$$;
