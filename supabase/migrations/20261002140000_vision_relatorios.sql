-- Vision'Up: acesso ao app + relatório público com payload embutido.
--
-- 1) usuarios.acesso_vision: flag que libera o app Vision'Up. No MVP somente
--    controller.gestaup@gmail.com recebe (UPDATE pontual fora da migration).
--    O campo chega ao frontend automaticamente porque authService usa select('*').
--
-- 2) relatorio_publico_payloads: blob gzip+base64 do relatório Vision
--    (linhas detalhadas para reconstrução do modelo no browser). Fica fora de
--    relatorios_publicos para que o SELECT público do link não arraste ~1.5MB;
--    sem policy de leitura: o acesso é exclusivamente via RPC com token válido.
--
-- 3) RPCs SECURITY DEFINER gateadas por vision_tem_acesso(): o usuário do
--    Vision escolhe qualquer fazenda ativa, então a regra de "membro da
--    fazenda" da policy padrão de relatorios_publicos não se aplica — a
--    autorização é a flag acesso_vision.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS acesso_vision boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.acesso_vision IS
  'true = usuário pode acessar o app Vision''Up (relatórios financeiros).';

CREATE TABLE IF NOT EXISTS public.relatorio_publico_payloads (
  relatorio_id uuid PRIMARY KEY REFERENCES public.relatorios_publicos(id) ON DELETE CASCADE,
  payload text NOT NULL
);

ALTER TABLE public.relatorio_publico_payloads ENABLE ROW LEVEL SECURITY;
-- Sem policies: nem authenticated nem anon leem a tabela diretamente.

CREATE OR REPLACE FUNCTION public.vision_tem_acesso()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_id = auth.uid() AND u.ativo = true AND u.acesso_vision = true
  )
$$;

CREATE OR REPLACE FUNCTION public.vision_criar_relatorio(
  p_fazenda_id uuid,
  p_titulo text,
  p_config jsonb DEFAULT '{}'::jsonb,
  p_payload text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT vision_tem_acesso() THEN
    RAISE EXCEPTION 'Acesso Vision negado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fazendas WHERE id = p_fazenda_id AND ativo = true) THEN
    RAISE EXCEPTION 'Fazenda inválida ou inativa';
  END IF;
  INSERT INTO relatorios_publicos (fazenda_id, tipo, titulo, criado_por, config)
    VALUES (
      p_fazenda_id, 'vision', p_titulo,
      (SELECT id FROM usuarios WHERE auth_id = auth.uid()),
      COALESCE(p_config, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
  IF p_payload IS NOT NULL THEN
    INSERT INTO relatorio_publico_payloads (relatorio_id, payload) VALUES (v_id, p_payload);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vision_listar_relatorios(p_fazenda_id uuid)
RETURNS TABLE(id uuid, titulo text, config jsonb, criado_em timestamptz, expira_em timestamptz, ativo boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rp.id, rp.titulo, rp.config, rp.criado_em, rp.expira_em, rp.ativo
  FROM relatorios_publicos rp
  WHERE rp.fazenda_id = p_fazenda_id AND rp.tipo = 'vision' AND vision_tem_acesso()
  ORDER BY rp.criado_em DESC
$$;

CREATE OR REPLACE FUNCTION public.vision_atualizar_relatorio(p_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT vision_tem_acesso() THEN
    RAISE EXCEPTION 'Acesso Vision negado';
  END IF;
  UPDATE relatorios_publicos SET ativo = p_ativo WHERE id = p_id AND tipo = 'vision';
END;
$$;

CREATE OR REPLACE FUNCTION public.vision_excluir_relatorio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT vision_tem_acesso() THEN
    RAISE EXCEPTION 'Acesso Vision negado';
  END IF;
  DELETE FROM relatorios_publicos WHERE id = p_id AND tipo = 'vision';
  -- payload sai por ON DELETE CASCADE
END;
$$;

-- Leitura pública do payload: exige token válido de relatório ativo/não expirado.
-- Não checa vision_tem_acesso() — o destinatário do link é anônimo.
CREATE OR REPLACE FUNCTION public.vision_relatorio_payload(p_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload text;
BEGIN
  SELECT pp.payload INTO v_payload
  FROM relatorios_publicos rp
  JOIN relatorio_publico_payloads pp ON pp.relatorio_id = rp.id
  WHERE rp.id = p_token
    AND rp.tipo = 'vision'
    AND rp.ativo = true
    AND (rp.expira_em IS NULL OR rp.expira_em > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido ou expirado';
  END IF;
  RETURN v_payload;
END;
$$;
