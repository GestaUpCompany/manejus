-- ROLLBACK da Fase 3 (migration 20261007240000_fase3_usuarios_s4.sql)
-- NÃO fica em supabase/migrations/ de propósito. ATENÇÃO: reverter REABRE a brecha S4
-- (qualquer usuário logado vira super_admin). Usar só para recuperar acesso em emergência.

DROP TRIGGER IF EXISTS trg_usuarios_protege_colunas ON public.usuarios;
DROP FUNCTION IF EXISTS public.trg_usuarios_protege_colunas();

DROP POLICY IF EXISTS "usuarios_insert_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;

CREATE POLICY "Allow authenticated insert" ON public.usuarios
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON public.usuarios
  FOR UPDATE TO authenticated USING (true);

-- "Users can update own profile" voltava sem WITH CHECK
DROP POLICY IF EXISTS "Users can update own profile" ON public.usuarios;
CREATE POLICY "Users can update own profile" ON public.usuarios
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR (auth_id = auth.uid()));

-- Privilégios originais (anon e authenticated tinham todos)
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.usuarios TO anon;
GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.usuarios TO authenticated;
