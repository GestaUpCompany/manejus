-- Correção de 20261027150000_abastecimento_tanque_padrao.sql: min(uuid) não existe
-- no Postgres, então todo INSERT com tanque_id NULL falhava (42883). Troca por
-- array_agg(id)[1], que só é usado quando count(*) = 1. Recria o trigger para
-- que o estado final seja o mesmo, mesmo que o trigger tenha sido removido à mão.

CREATE OR REPLACE FUNCTION public.abastecimento_tanque_padrao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd integer;
  v_tanque_id uuid;
BEGIN
  IF NEW.tanque_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), (array_agg(id))[1]
    INTO v_qtd, v_tanque_id
    FROM public.tanques_combustivel
   WHERE fazenda_id = NEW.fazenda_id
     AND deleted_at IS NULL
     AND ativo
     AND tipo_combustivel = NEW.combustivel
     AND created_at <= NEW.data;

  IF v_qtd = 1 THEN
    NEW.tanque_id := v_tanque_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_abastecimento_tanque_padrao ON public.registros_abastecimento;

CREATE TRIGGER trg_abastecimento_tanque_padrao
  BEFORE INSERT ON public.registros_abastecimento
  FOR EACH ROW
  EXECUTE FUNCTION public.abastecimento_tanque_padrao();
