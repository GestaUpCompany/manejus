-- Restaura a versão com || (com o defeito). Só para reverter a 20261023130000.
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
    v := v || 'outro parto'; END IF;
  IF EXISTS (SELECT 1 FROM individuos f WHERE f.deleted_at IS NULL AND f.id IS DISTINCT FROM p_ignorar_filho
             AND p_individuo_id IN (f.mae, f.mae_adotiva_id, f.pai)) THEN
    v := v || 'filhos cadastrados'; END IF;
  IF EXISTS (SELECT 1 FROM aplicacoes_sanitarias x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'aplicações sanitárias'; END IF;
  IF EXISTS (SELECT 1 FROM eventos_reprodutivos x WHERE (x.individuo_id = p_individuo_id OR x.touro_id = p_individuo_id) AND x.deleted_at IS NULL) THEN
    v := v || 'eventos reprodutivos'; END IF;
  IF EXISTS (SELECT 1 FROM registros_enfermaria x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'enfermaria'; END IF;
  IF EXISTS (SELECT 1 FROM registros_manejo_curral x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'manejo de curral'; END IF;
  IF EXISTS (SELECT 1 FROM registros_morte x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'morte'; END IF;
  IF EXISTS (SELECT 1 FROM registros_movimentacao x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'movimentação'; END IF;
  IF EXISTS (SELECT 1 FROM registros_pesagem x WHERE x.individuo_id = p_individuo_id AND x.deleted_at IS NULL) THEN
    v := v || 'pesagem'; END IF;
  IF EXISTS (SELECT 1 FROM evento_individuos x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'eventos vinculados'; END IF;
  IF EXISTS (SELECT 1 FROM pendencias_designacao_lote x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'pendência de designação de lote'; END IF;
  IF EXISTS (SELECT 1 FROM lote_historico x WHERE x.individuo_id = p_individuo_id) THEN
    v := v || 'histórico de lote'; END IF;
  RETURN v;
END;
$function$;
