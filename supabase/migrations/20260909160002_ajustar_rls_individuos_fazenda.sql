-- ============================================================================
-- MIGRAÇÃO - Ajustar RLS da tabela individuos para escopo por fazenda
-- ============================================================================
-- 1. Sincroniza auth_id dos usuarios com auth.users.id baseado no email.
-- 2. Vincula controller@teste2.com à Fazenda Teste.
-- 3. Recria políticas RLS restritas por fazenda via auth_id.
-- ============================================================================

-- 1. Sincronizar auth_id com auth.users.id
UPDATE public.usuarios u
SET auth_id = au.id
FROM auth.users au
WHERE u.email = au.email
  AND (u.auth_id IS NULL OR u.auth_id <> au.id);

-- 2. Vincular controller@teste2.com à Fazenda Teste (se ainda não houver vínculo ativo)
INSERT INTO public.usuario_fazenda (usuario_id, fazenda_id, papel, ativo)
SELECT '90244931-0270-4a7f-adcb-039ae1e58146', 'a4756676-d780-42b8-b964-0f33efedf22d', 'controller', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuario_fazenda
  WHERE usuario_id = '90244931-0270-4a7f-adcb-039ae1e58146'
    AND fazenda_id = 'a4756676-d780-42b8-b964-0f33efedf22d'
    AND ativo = true
);

-- 3. Remover políticas antigas (permissivas demais)
DROP POLICY IF EXISTS "Authenticated select individuos" ON public.individuos;
DROP POLICY IF EXISTS "Authenticated insert individuos" ON public.individuos;
DROP POLICY IF EXISTS "Authenticated update individuos" ON public.individuos;
DROP POLICY IF EXISTS "Authenticated delete individuos" ON public.individuos;

-- 4. Garante RLS habilitado e forçado
ALTER TABLE public.individuos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individuos FORCE ROW LEVEL SECURITY;

-- 5. Criar políticas restritas por fazenda via auth_id
CREATE POLICY "Authenticated select individuos"
  ON public.individuos
  FOR SELECT
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

CREATE POLICY "Authenticated insert individuos"
  ON public.individuos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

CREATE POLICY "Authenticated update individuos"
  ON public.individuos
  FOR UPDATE
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  )
  WITH CHECK (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

CREATE POLICY "Authenticated delete individuos"
  ON public.individuos
  FOR DELETE
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );
