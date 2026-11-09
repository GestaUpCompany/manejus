-- Nome de lote único só entre lotes ATIVOS (não excluídos).
-- Alinha o trigger com o índice único parcial lotes_unique_fazenda_nome_ativo (WHERE ativo = true).
-- Antes: lote inativo (ativo=false, deleted_at IS NULL) bloqueava o nome, impedindo salvar um lote ativo
-- com o mesmo nome (caso Fazenda Chibata: "LOTE 17" inativo impedia vincular o "LOTE 17" ativo ao pasto).

CREATE OR REPLACE FUNCTION public.check_lote_nome_unico_fazenda()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_conflito uuid;
BEGIN
  -- Só conflita com lote ativo e não excluído na mesma fazenda (espelha o índice parcial).
  SELECT id INTO v_conflito
  FROM lotes
  WHERE fazenda_id = NEW.fazenda_id
    AND lower(unaccent(nome)) = lower(unaccent(NEW.nome))
    AND deleted_at IS NULL
    AND ativo = true
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
