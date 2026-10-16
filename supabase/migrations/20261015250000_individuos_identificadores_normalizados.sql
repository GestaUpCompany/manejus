-- ============================================================================
-- Indivíduos / Fase 0.7 (banco): identificadores sem espaços sobrando e únicos sem diferenciar maiúsculas
-- ============================================================================
-- Achado: os índices únicos comparavam o texto exato, então "928 F" e "928 F " (ou "Boto F" e "Boto f")
-- conviviam. Em 5 pares de uma fazenda real, 4 eram a cria gravada com o brinco da mãe + espaço.
-- Os dados foram corrigidos antes (backup.individuos_identificacao_20261015; ver HISTORICO).
--   * Trigger BEFORE INSERT/UPDATE: id_brinco, id_chip, id_manejo e id_provisorio_cria passam por btrim e
--     texto vazio vira NULL. A caixa é preservada, porque várias funções (OS, maternidade, reprodução) e o PWA
--     comparam o texto exato.
--   * Índices únicos por fazenda passam a usar upper(): "Boto F" e "Boto f" colidem.
-- Rollback: supabase/rollbacks/20261015250000_individuos_identificadores_normalizados_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_individuos_normaliza_identificadores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id_brinco := NULLIF(btrim(NEW.id_brinco), '');
  NEW.id_chip := NULLIF(btrim(NEW.id_chip), '');
  NEW.id_manejo := NULLIF(btrim(NEW.id_manejo), '');
  NEW.id_provisorio_cria := NULLIF(btrim(NEW.id_provisorio_cria), '');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_individuos_normaliza_identificadores ON public.individuos;
CREATE TRIGGER trg_individuos_normaliza_identificadores
  BEFORE INSERT OR UPDATE OF id_brinco, id_chip, id_manejo, id_provisorio_cria ON public.individuos
  FOR EACH ROW EXECUTE FUNCTION public.trg_individuos_normaliza_identificadores();

DROP INDEX IF EXISTS public.idx_individuos_fazenda_brinco_unico;
DROP INDEX IF EXISTS public.idx_individuos_fazenda_chip_unico;
DROP INDEX IF EXISTS public.idx_individuos_fazenda_manejo_unico;

CREATE UNIQUE INDEX idx_individuos_fazenda_brinco_unico
  ON public.individuos (fazenda_id, upper(id_brinco))
  WHERE deleted_at IS NULL AND id_brinco IS NOT NULL AND id_brinco <> '';
CREATE UNIQUE INDEX idx_individuos_fazenda_chip_unico
  ON public.individuos (fazenda_id, upper(id_chip))
  WHERE deleted_at IS NULL AND id_chip IS NOT NULL AND id_chip <> '';
CREATE UNIQUE INDEX idx_individuos_fazenda_manejo_unico
  ON public.individuos (fazenda_id, upper(id_manejo))
  WHERE deleted_at IS NULL AND id_manejo IS NOT NULL AND id_manejo <> '';
