-- ============================================================================
-- Transferência: RLS compartilhada entre origem e destino
--
-- A OS de transferência é compartilhada: o laudo de recebimento é gravado
-- pelo peão da fazenda DESTINO (fazenda_id = destino) e as entradas creditadas
-- na conferência também ficam no destino. Sem policies extras, a origem não
-- enxerga os recebimentos/documentos da própria OS e o destino não vê as
-- movimentações de saída da origem.
--
-- Este arquivo adiciona policies SOMENTE-SELECT (mais INSERT de documentos)
-- baseadas no acesso a qualquer uma das pontas da OS. Escritas seguem na
-- policy existente por fazenda_id da linha.
-- ============================================================================

-- Helper: o usuário atual tem acesso à OS por qualquer uma das pontas
CREATE OR REPLACE FUNCTION public.user_has_os_access(p_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.ordens_servico os
    WHERE os.id = p_os_id
      AND (
        public.get_peao_fazenda_id() IN (os.fazenda_id, os.fazenda_destino_id)
        OR public.user_has_fazenda_access(os.fazenda_id)
        OR (os.fazenda_destino_id IS NOT NULL AND public.user_has_fazenda_access(os.fazenda_destino_id))
      )
  );
$function$;

-- os_recebimentos: a origem enxerga os laudos gravados pelo destino
DROP POLICY IF EXISTS "os_recebimentos_select_via_os" ON public.os_recebimentos;
CREATE POLICY "os_recebimentos_select_via_os" ON public.os_recebimentos
  FOR SELECT TO authenticated
  USING (public.user_has_os_access(os_id));

-- registros_movimentacao: cada ponta enxerga as movimentações da OS na outra
-- fazenda (saída na origem, entradas conferidas no destino)
DROP POLICY IF EXISTS "movimentacao_select_via_os" ON public.registros_movimentacao;
CREATE POLICY "movimentacao_select_via_os" ON public.registros_movimentacao
  FOR SELECT TO authenticated
  USING (os_id IS NOT NULL AND public.user_has_os_access(os_id));

-- os_documentos: GTA/laudos/vídeo ficam visíveis para as duas fazendas da OS;
-- INSERT pela via da OS permite ao controller do destino anexar a GTA mesmo
-- quando o documento fica com fazenda_id da origem.
DROP POLICY IF EXISTS "os_documentos_select_via_os" ON public.os_documentos;
CREATE POLICY "os_documentos_select_via_os" ON public.os_documentos
  FOR SELECT TO authenticated
  USING (public.user_has_os_access(os_id));

DROP POLICY IF EXISTS "os_documentos_insert_via_os" ON public.os_documentos;
CREATE POLICY "os_documentos_insert_via_os" ON public.os_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_os_access(os_id));
