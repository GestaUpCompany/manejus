-- Rollback: volta a checar nome contra todos os lotes não excluídos (inclusive inativos).

CREATE OR REPLACE FUNCTION public.check_lote_nome_unico_fazenda()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_conflito uuid;
BEGIN
  SELECT id INTO v_conflito
  FROM lotes
  WHERE fazenda_id = NEW.fazenda_id
    AND lower(unaccent(nome)) = lower(unaccent(NEW.nome))
    AND deleted_at IS NULL
    AND id <> NEW.id
  LIMIT 1;

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe um lote com o nome "%" nesta fazenda (id: %). Nomes sao comparados ignorando maiusculas e acentos.',
      NEW.nome, v_conflito
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;
