-- ============================================================================
-- Maternidade: reenvio do PWA não apaga os vínculos com mãe, cria e mãe adotiva
-- ============================================================================
-- Achado (19/10/2026, auditoria de registros_maternidade): o PWA envia o parto com upsert por local_id.
-- Versões antigas do aparelho mandam individuo_id_mae, individuo_id_cria e individuo_id_mae_adotiva NULOS
-- (o servidor é quem criava a mãe e a cria pelos gatilhos de INSERT). Quando o mesmo registro é reenviado
-- (aparelho que sincroniza duas vezes), o ON CONFLICT DO UPDATE sobrescreve os vínculos com NULL. Caso real:
-- 6 partos da Fazenda Chibiu (08/10), com UPDATE de 14/10 zerando individuo_id_mae e individuo_id_cria.
-- A cria e a mãe NÃO foram duplicadas (o reenvio é um UPDATE, não dispara os gatilhos de INSERT), mas o parto
-- ficou sem ligação com os animais, e a cria passou a constar como "sem registro de nascimento".
--
-- Ação: gatilho BEFORE UPDATE que mantém o vínculo anterior quando o novo valor chega nulo. Trocar um vínculo
-- por outro animal continua permitido; só a perda para NULL é recusada em silêncio. Nenhum código do painel
-- ou do PWA zera esses campos de propósito (conferido por busca). Não altera dados existentes.
-- Impacto no PWA: nenhum no contrato (mesmas colunas). Rollback:
-- supabase/rollbacks/20261019100000_maternidade_preserva_vinculos_no_reenvio_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_maternidade_preserva_vinculos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.individuo_id_mae IS NULL AND OLD.individuo_id_mae IS NOT NULL THEN
    NEW.individuo_id_mae := OLD.individuo_id_mae;
  END IF;
  IF NEW.individuo_id_cria IS NULL AND OLD.individuo_id_cria IS NOT NULL THEN
    NEW.individuo_id_cria := OLD.individuo_id_cria;
  END IF;
  IF NEW.individuo_id_mae_adotiva IS NULL AND OLD.individuo_id_mae_adotiva IS NOT NULL THEN
    NEW.individuo_id_mae_adotiva := OLD.individuo_id_mae_adotiva;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_maternidade_preserva_vinculos ON public.registros_maternidade;
CREATE TRIGGER trg_maternidade_preserva_vinculos
  BEFORE UPDATE ON public.registros_maternidade
  FOR EACH ROW EXECUTE FUNCTION public.trg_maternidade_preserva_vinculos();
