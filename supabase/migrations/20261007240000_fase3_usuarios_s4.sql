-- ============================================================================
-- Fase 3 (segurança, S4): public.usuarios — fim da autopromoção a admin/super_admin
-- ============================================================================
-- Problema (auditoria 07/10/2026): as policies `Allow authenticated insert` (check true) e
-- `Allow authenticated update` (qual true) e a policy "own profile" sem WITH CHECK deixavam
-- QUALQUER usuário logado (peão/controller) executar
--     UPDATE usuarios SET papel = 'super_admin' WHERE id = auth.uid()
-- (comprovado em transação revertida: is_admin_user() virou true e os insumos visíveis foram de
-- 15 para 200). Como is_admin_user()/is_super_admin()/impersonate-user/change-user-password
-- confiam em usuarios.papel, isso quebrava TODO o isolamento de tenant.
--
-- Correção:
--  * INSERT e UPDATE de terceiros só para admin (is_admin_user()); o próprio usuário só atualiza
--    a própria linha (agora com WITH CHECK).
--  * Trigger BEFORE INSERT/UPDATE protege colunas sensíveis para clientes da API (authenticated/
--    anon). service_role (Edge Functions), postgres e funções SECURITY DEFINER passam.
--      - super_admin: sem restrições;
--      - admin: pode criar apenas `controller` e ativar/desativar (ativo, acesso_vision) usuários
--        `controller`; NÃO altera papel, id, auth_id, email, created_at, nem status de admin/super_admin;
--      - demais: só nome, telefone e ultimo_acesso da própria linha.
--  * Hardening de privilégios: anon sem acesso; authenticated sem DELETE/TRUNCATE/REFERENCES/TRIGGER.
-- Rollback: supabase/rollbacks/20261007240000_fase3_usuarios_s4_rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.usuarios;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.usuarios;

CREATE POLICY "usuarios_insert_admin" ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY "usuarios_update_admin" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

ALTER POLICY "Users can update own profile" ON public.usuarios
  USING ((id = auth.uid()) OR (auth_id = auth.uid()))
  WITH CHECK ((id = auth.uid()) OR (auth_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. Trigger de proteção de colunas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_usuarios_protege_colunas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Só restringe clientes da API (o PostgREST assume authenticated/anon). service_role, postgres
  -- e funções SECURITY DEFINER (current_user = dono) passam.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.papel IS DISTINCT FROM 'controller' THEN
      RAISE EXCEPTION 'Somente super_admin cria usuários admin/super_admin'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_id IS DISTINCT FROM OLD.auth_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Colunas de identidade do usuário não podem ser alteradas'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.papel IS DISTINCT FROM OLD.papel THEN
    RAISE EXCEPTION 'Somente super_admin altera o papel de um usuário'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo
     OR NEW.acesso_vision IS DISTINCT FROM OLD.acesso_vision THEN
    IF NOT (public.is_admin_user() AND OLD.papel = 'controller') THEN
      RAISE EXCEPTION 'Sem permissão para alterar status/acesso deste usuário'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_protege_colunas ON public.usuarios;
CREATE TRIGGER trg_usuarios_protege_colunas
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_usuarios_protege_colunas();

-- ----------------------------------------------------------------------------
-- 3. Hardening de privilégios
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.usuarios FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.usuarios FROM authenticated;
