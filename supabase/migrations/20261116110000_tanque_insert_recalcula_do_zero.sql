-- Corrige a entrada contada em dobro no saldo do tanque de combustível.
--
-- Problema: ao inserir uma movimentação, dois triggers AFTER rodam em ordem alfabética:
--   1) trg_mov_combustivel_saldos grava saldo_anterior/saldo_posterior na própria linha.
--      Esse UPDATE dispara update_tanque_saldo_custo (ramo UPDATE), que recalcula o tanque
--      do zero, já incluindo a linha nova.
--   2) trigger_update_tanque_saldo_custo (ramo INSERT) lê o saldo JÁ recalculado e soma a
--      entrada de novo, no caminho incremental.
-- Resultado: entrada de 100 L em tanque zerado vira saldo de 200 L (confirmado no Painel e no PWA).
--
-- Correção: no INSERT, o caminho incremental deixa de existir. Todo INSERT recalcula o tanque
-- do zero com recalcular_custo_medio_tanque, que é idempotente e não depende da ordem dos
-- triggers. Os ramos UPDATE e DELETE já recalculavam; só o INSERT muda.
--
-- Não altera dados. Tanques já divergentes na produção continuam divergentes até um
-- recálculo explícito por fazenda (ver rollbacks e a seção de backfill no HISTORICO).

CREATE OR REPLACE FUNCTION public.update_tanque_saldo_custo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    -- Recalcular do zero apos remocao (WAC nao e invertivel sem historico)
    PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    RETURN OLD;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    -- Sempre recalcula do zero: o trigger de replay (trg_mov_combustivel_saldos) pode
    -- disparar UPDATEs nesta mesma linha antes deste trigger, e o caminho incremental
    -- somaria a movimentação duas vezes.
    PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Recalcular do zero (simples e seguro para WAC)
    PERFORM public.recalcular_custo_medio_tanque(NEW.tanque_id);
    -- Se mudou de tanque, recalcular o antigo tambem
    IF OLD.tanque_id IS DISTINCT FROM NEW.tanque_id THEN
      PERFORM public.recalcular_custo_medio_tanque(OLD.tanque_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;
