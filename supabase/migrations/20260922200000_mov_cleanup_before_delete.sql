-- Fix: ao deletar um registro (retirada/entrada/devolucao), a FK
-- registro_origem_id ... ON DELETE SET NULL zera o vínculo ANTES do trigger
-- AFTER DELETE rodar (triggers de integridade referencial executam antes dos
-- triggers de usuário na mesma fase). Resultado: movimentações ficavam órfãs
-- e ativas, mantendo o saldo errado.
--
-- Solução: trigger BEFORE DELETE que soft-deleta as movimentações vinculadas
-- enquanto registro_origem_id ainda aponta para o registro. O AFTER DELETE
-- existente continua rodando (encontra nada ativo) e segue com o
-- reprocessamento de devoluções.

CREATE OR REPLACE FUNCTION public.registros_almoxarifado_before_delete_mov()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.movimentacoes_almoxarifado
     SET deleted_at = now(), updated_at = now()
   WHERE registro_origem_id = OLD.id
     AND deleted_at IS NULL;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_registros_almoxarifado_before_delete_mov
BEFORE DELETE ON public.registros_almoxarifado
FOR EACH ROW EXECUTE FUNCTION public.registros_almoxarifado_before_delete_mov();

-- Mesmo problema em registros_alimentacao -> movimentacoes_cantina.
CREATE OR REPLACE FUNCTION public.registros_alimentacao_before_delete_mov()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.movimentacoes_cantina
     SET deleted_at = now(), updated_at = now()
   WHERE registro_origem_id = OLD.id
     AND deleted_at IS NULL;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_registros_alimentacao_before_delete_mov
BEFORE DELETE ON public.registros_alimentacao
FOR EACH ROW EXECUTE FUNCTION public.registros_alimentacao_before_delete_mov();
