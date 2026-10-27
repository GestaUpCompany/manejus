-- Abastecimento sincronizado sem tanque_id (PWA com cache de tanques ausente ou
-- fila offline) não gerava baixa de estoque: baixa_automatica_abastecimento sai
-- sem fazer nada quando tanque_id é NULL. Este trigger preenche o tanque antes
-- do INSERT, quando há exatamente um tanque ativo da fazenda com o mesmo tipo de
-- combustível criado até a data do abastecimento. Se houver zero ou mais de um
-- candidato, a linha segue sem tanque (comportamento anterior).

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

  SELECT count(*), min(id)
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

CREATE TRIGGER trg_abastecimento_tanque_padrao
  BEFORE INSERT ON public.registros_abastecimento
  FOR EACH ROW
  EXECUTE FUNCTION public.abastecimento_tanque_padrao();
