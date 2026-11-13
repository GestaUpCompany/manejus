-- Vínculo bebedouro <-> curral (espelho de pasto_bebedouros, só estado atual).
-- Diferenças em relação à junction de pasto: tem fazenda_id e RLS por tenant
-- (is_admin_user() OR caller_has_fazenda_access), em vez de policies USING (true).
-- Mudança retrocompatível: tabela nova + colunas opcionais; nada existente é alterado.

-- ============================================================================
-- 1. Tabela curral_bebedouros
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.curral_bebedouros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  curral_id uuid NOT NULL REFERENCES public.currais(id) ON DELETE CASCADE,
  bebedouro_id uuid NOT NULL REFERENCES public.bebedouros(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curral_id, bebedouro_id)
);

CREATE INDEX IF NOT EXISTS idx_curral_bebedouros_curral_id ON public.curral_bebedouros(curral_id);
CREATE INDEX IF NOT EXISTS idx_curral_bebedouros_bebedouro_id ON public.curral_bebedouros(bebedouro_id);
CREATE INDEX IF NOT EXISTS idx_curral_bebedouros_fazenda_id ON public.curral_bebedouros(fazenda_id);

-- fazenda_id deve ser a mesma do curral e do bebedouro (impede vínculo cruzado entre fazendas)
CREATE OR REPLACE FUNCTION public.trg_curral_bebedouros_valida_fazenda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.currais c WHERE c.id = NEW.curral_id AND c.fazenda_id = NEW.fazenda_id) THEN
    RAISE EXCEPTION 'Curral nao pertence a fazenda informada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bebedouros b WHERE b.id = NEW.bebedouro_id AND b.fazenda_id = NEW.fazenda_id) THEN
    RAISE EXCEPTION 'Bebedouro nao pertence a fazenda informada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS curral_bebedouros_valida_fazenda ON public.curral_bebedouros;
CREATE TRIGGER curral_bebedouros_valida_fazenda
  BEFORE INSERT OR UPDATE ON public.curral_bebedouros
  FOR EACH ROW EXECUTE FUNCTION public.trg_curral_bebedouros_valida_fazenda();

ALTER TABLE public.curral_bebedouros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS curral_bebedouros_select ON public.curral_bebedouros;
DROP POLICY IF EXISTS curral_bebedouros_insert ON public.curral_bebedouros;
DROP POLICY IF EXISTS curral_bebedouros_update ON public.curral_bebedouros;
DROP POLICY IF EXISTS curral_bebedouros_delete ON public.curral_bebedouros;

-- Leitura inclui o peão (caller_has_fazenda_access cobre peoes) para o PWA.
CREATE POLICY curral_bebedouros_select ON public.curral_bebedouros
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY curral_bebedouros_insert ON public.curral_bebedouros
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY curral_bebedouros_update ON public.curral_bebedouros
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY curral_bebedouros_delete ON public.curral_bebedouros
  FOR DELETE TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.curral_bebedouros FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curral_bebedouros TO authenticated, service_role;

-- ============================================================================
-- 2. RPC transacional para salvar os vínculos de um curral
--    (substitui o padrão delete+insert sem transação usado em pasto_bebedouros)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.salvar_curral_bebedouros(p_curral_id uuid, p_bebedouro_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_fazenda_id uuid;
BEGIN
  SELECT fazenda_id INTO v_fazenda_id FROM public.currais WHERE id = p_curral_id;
  IF v_fazenda_id IS NULL THEN
    RAISE EXCEPTION 'Curral nao encontrado';
  END IF;
  IF NOT (public.is_admin_user() OR public.caller_has_fazenda_access(v_fazenda_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta fazenda';
  END IF;

  DELETE FROM public.curral_bebedouros
  WHERE curral_id = p_curral_id
    AND NOT (bebedouro_id = ANY (COALESCE(p_bebedouro_ids, ARRAY[]::uuid[])));

  INSERT INTO public.curral_bebedouros (fazenda_id, curral_id, bebedouro_id)
  SELECT v_fazenda_id, p_curral_id, b.id
  FROM public.bebedouros b
  WHERE b.id = ANY (COALESCE(p_bebedouro_ids, ARRAY[]::uuid[]))
    AND b.fazenda_id = v_fazenda_id
  ON CONFLICT (curral_id, bebedouro_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_curral_bebedouros(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_curral_bebedouros(uuid, uuid[]) TO authenticated;

-- ============================================================================
-- 3. Relatório de Bebedouros: situação do local (pasto OU curral)
--    Nova RPC; get_bebedouros_situacao_pasto_relatorio continua intacta
--    (front já publicado depende dela).
--    - ocupado:   algum pasto ligado com lote no momento OU algum curral ligado com lote
--    - vago:      há local ligado, nenhum ocupado
--    - sem_local: nenhum pasto nem curral ligado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_bebedouros_situacao_local_relatorio(p_token uuid)
RETURNS TABLE (
  bebedouro_id uuid,
  pasto_nomes text[],
  curral_nomes text[],
  situacao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_fazenda_id uuid;
  v_ativo boolean;
  v_expira timestamptz;
BEGIN
  SELECT fazenda_id, ativo, expira_em
  INTO v_fazenda_id, v_ativo, v_expira
  FROM relatorios_publicos
  WHERE id = p_token
    AND tipo = 'bebedouros';

  IF NOT FOUND OR v_ativo = false OR (v_expira IS NOT NULL AND v_expira < now()) THEN
    RAISE EXCEPTION 'Token invalido ou expirado';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS bebedouro_id,
    COALESCE((
      SELECT array_agg(p.nome ORDER BY p.nome)
      FROM public.pasto_bebedouros pb
      JOIN public.pastos p ON p.id = pb.pasto_id
      WHERE pb.bebedouro_id = b.id AND p.fazenda_id = v_fazenda_id
    ), ARRAY[]::text[]) AS pasto_nomes,
    COALESCE((
      SELECT array_agg(c.nome ORDER BY c.nome)
      FROM public.curral_bebedouros cb
      JOIN public.currais c ON c.id = cb.curral_id
      WHERE cb.bebedouro_id = b.id AND c.fazenda_id = v_fazenda_id AND c.deleted_at IS NULL
    ), ARRAY[]::text[]) AS curral_nomes,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        WHERE pb.bebedouro_id = b.id AND p.fazenda_id = v_fazenda_id
      ) AND NOT EXISTS (
        SELECT 1 FROM public.curral_bebedouros cb
        JOIN public.currais c ON c.id = cb.curral_id
        WHERE cb.bebedouro_id = b.id AND c.fazenda_id = v_fazenda_id AND c.deleted_at IS NULL
      ) THEN 'sem_local'
      WHEN EXISTS (
        SELECT 1
        FROM public.pasto_bebedouros pb
        JOIN public.pastos p ON p.id = pb.pasto_id
        JOIN public.lote_pasto_historico h ON h.pasto_id = p.id AND h.data_hora_saida IS NULL
        JOIN public.lotes l ON l.id = h.lote_id AND l.fazenda_id = v_fazenda_id
        WHERE pb.bebedouro_id = b.id AND p.fazenda_id = v_fazenda_id
      ) OR EXISTS (
        SELECT 1
        FROM public.curral_bebedouros cb
        JOIN public.currais c ON c.id = cb.curral_id
        WHERE cb.bebedouro_id = b.id
          AND c.fazenda_id = v_fazenda_id
          AND c.deleted_at IS NULL
          AND c.lote_id IS NOT NULL
      ) THEN 'ocupado'
      ELSE 'vago'
    END AS situacao
  FROM bebedouros b
  WHERE b.fazenda_id = v_fazenda_id
    AND b.deleted_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bebedouros_situacao_local_relatorio(uuid) TO anon, authenticated;

-- ============================================================================
-- 4. registros_bebedouros: local da limpeza quando for curral (opcional, snapshot)
-- ============================================================================
ALTER TABLE public.registros_bebedouros
  ADD COLUMN IF NOT EXISTS curral_id uuid REFERENCES public.currais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curral text;

CREATE INDEX IF NOT EXISTS idx_registros_bebedouros_curral_id ON public.registros_bebedouros(curral_id);

NOTIFY pgrst, 'reload schema';
