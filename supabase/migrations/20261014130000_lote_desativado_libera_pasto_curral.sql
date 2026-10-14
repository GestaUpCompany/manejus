-- Lote desativado ou excluido (soft-delete) libera o pasto e o curral que ocupava.
--
-- Antes: so o botao "Desativar" da tela de Lotes limpava lotes.pasto_id e currais.lote_id (no front,
-- em duas chamadas). Excluir lote, transferencia total, SQL direto e importacao deixavam o vinculo
-- preso: 26 lotes inativos com pasto_id e 7 currais apontando para lote inativo/excluido (14/10/2026).
--
-- Agora o banco garante. Nao restaura o vinculo ao reativar o lote (igual ao comportamento do front).
--
-- Detalhes:
--   * AFTER UPDATE: os updates em lotes.pasto_id e currais.lote_id disparam os triggers normais
--     (sincroniza individuos.pasto_atual, fecha lote_curral_historico, auditoria, exclusividade).
--   * trg_lotes_pasto_historico ignora execucao aninhada (pg_trigger_depth() > 1), entao o historico
--     do pasto (lote_pasto_historico) e fechado aqui, explicitamente.
--   * Falha vira WARNING: desativar o lote nunca pode quebrar por causa da limpeza.
--   * Nao ha recursao: o trigger so observa ativo/deleted_at, e o update interno muda pasto_id.
--
-- Os vinculos antigos ja existentes NAO sao limpos aqui (dado operacional, exige autorizacao por fazenda).

CREATE OR REPLACE FUNCTION public.trg_lote_desativado_libera_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  BEGIN
    IF NEW.pasto_id IS NOT NULL THEN
      UPDATE public.lote_pasto_historico
         SET data_final = v_hoje, data_hora_saida = now(), updated_at = now()
       WHERE lote_id = NEW.id
         AND data_hora_saida IS NULL;

      UPDATE public.lotes SET pasto_id = NULL WHERE id = NEW.id;
    END IF;

    UPDATE public.currais
       SET lote_id = NULL, updated_at = now()
     WHERE lote_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_lote_desativado_libera_local (lote %): %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_lote_desativado_libera_local() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lote_desativado_libera_local ON public.lotes;
CREATE TRIGGER trg_lote_desativado_libera_local
  AFTER UPDATE OF ativo, deleted_at ON public.lotes
  FOR EACH ROW
  WHEN (
    (NEW.ativo IS NOT TRUE OR NEW.deleted_at IS NOT NULL)
    AND (OLD.ativo IS DISTINCT FROM NEW.ativo OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  )
  EXECUTE FUNCTION public.trg_lote_desativado_libera_local();
