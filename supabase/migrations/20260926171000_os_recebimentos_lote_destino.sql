-- os_recebimentos: lote de destino da carga. As movimentações de Entrada
-- geradas pelo laudo gravam o mesmo lote em lote_origem_id (convenção do
-- schema: para Entrada, o lote receptor vai em lote_origem_id), mas persistir
-- aqui facilita exibição no painel e auditoria sem join em movimentações.
ALTER TABLE public.os_recebimentos
  ADD COLUMN IF NOT EXISTS lote_destino_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote_destino text;

CREATE INDEX IF NOT EXISTS idx_os_recebimentos_lote ON public.os_recebimentos(lote_destino_id);
