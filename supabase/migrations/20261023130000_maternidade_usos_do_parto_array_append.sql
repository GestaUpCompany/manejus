-- ============================================================================
-- Maternidade: corrige individuo_usos_do_parto (22P02 ao encontrar um uso)
-- ============================================================================
-- Achado no teste T6 (23/10/2026, fazenda de testes): `v := v || 'pesagem'` faz o Postgres ler o texto como
-- literal de array ("malformed array literal"), então a prévia e a exclusão falhavam sempre que a cria
-- tinha algum outro uso, justamente o caso que deveria BLOQUEAR com mensagem. Troca por array_append nos 12
-- ramos. Só o corpo muda; assinatura, SECURITY DEFINER e permissões (sem acesso direto) ficam como estão.
-- Impacto no PWA: nenhum. Rollback:
-- supabase/rollbacks/20261023130000_maternidade_usos_do_parto_array_append_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.individuo_usos_do_parto(
  p_individuo_id uuid,
  p_parto_id uuid,
  p_ignorar_filho uuid DEFAULT NULL
)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (SELECT 1 FROM registros_maternidade m WHERE m.id <> p_parto_id AND m.deleted_at IS NULL
             AND p_individuo_id IN (m.individuo_id_mae, m.individuo_id_cria, m.individuo_id_mae_adotiva)) THEN
    v := array_append(v, 'outro parto'); END IF;
  IF EXISTS (SELECT 1 FROM individuos f WHERE f.deleted_at IS NULL AND f.id IS DISTINCT FROM p_ignorar_filho
             AND p_individuo_id IN (f.mae, f.mae_adotiva_id, f.pai)) THEN
    v := array_append(v, 'filhos cadastrados'); END IF;
  IF EXISTS (SELECT 1 FROM aplicacoes_sanitarias x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'aplicações sanitárias'); END IF;
  IF EXISTS (SELECT 1 FROM eventos_reprodutivos x WHERE (x.individuo_id = p_individuo_id OR x.touro_id = p_individuo_id) AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'eventos reprodutivos'); END IF;
  IF EXISTS (SELECT 1 FROM registros_enfermaria x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'enfermaria'); END IF;
  IF EXISTS (SELECT 1 FROM registros_manejo_curral x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'manejo de curral'); END IF;
  IF EXISTS (SELECT 1 FROM registros_morte x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'morte'); END IF;
  IF EXISTS (SELECT 1 FROM registros_movimentacao x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'movimentação'); END IF;
  IF EXISTS (SELECT 1 FROM registros_pesagem x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := array_append(v, 'pesagem'); END IF;
  IF EXISTS (SELECT 1 FROM evento_individuos x WHERE x.individuo_id = p_individuo_id) THEN
    v := array_append(v, 'eventos vinculados'); END IF;
  IF EXISTS (SELECT 1 FROM pendencias_designacao_lote x WHERE x.individuo_id = p_individuo_id) THEN
    v := array_append(v, 'pendência de designação de lote'); END IF;
  IF EXISTS (SELECT 1 FROM lote_historico x WHERE x.individuo_id = p_individuo_id) THEN
    v := array_append(v, 'histórico de lote'); END IF;
  RETURN v;
END;
$function$;
