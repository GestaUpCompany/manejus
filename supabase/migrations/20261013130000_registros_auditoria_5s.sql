-- Checklist Auditoria 5S do PWA: tabela registros_auditoria_5s
--
-- Uma linha = uma auditoria completa (setor + responsavel + 25 itens C/N em 5 pilares:
-- Utilizacao, Organizacao, Limpeza, Padronizacao, Disciplina).
--
-- Decisoes:
--  * itens guarda { chave_do_item: 'C' | 'N' } (ex.: utilizacao_1). A chave e estavel; o texto da
--    pergunta vive no app e pode mudar sem quebrar o historico.
--  * observacoes guarda { pilar: texto } (um campo de observacoes por pilar, como na ficha de papel).
--  * Totais e percentual sao gravados pelo PWA para facilitar filtros e metricas no painel.
--
-- Rollback: supabase/rollbacks/20261013130000_registros_auditoria_5s_rollback.sql

CREATE TABLE IF NOT EXISTS public.registros_auditoria_5s (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  dispositivo_id uuid,
  nome_usuario text,
  local_id text,
  data timestamptz NOT NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  setor text NOT NULL,
  responsavel text NOT NULL,
  itens jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes jsonb,
  total_itens integer NOT NULL DEFAULT 0,
  total_conformes integer NOT NULL DEFAULT 0,
  total_nao_conformes integer NOT NULL DEFAULT 0,
  percentual_conformidade numeric(5,2),
  sync_status text DEFAULT 'synced',
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT registros_auditoria_5s_totais_check
    CHECK (total_conformes >= 0 AND total_nao_conformes >= 0 AND total_conformes + total_nao_conformes <= total_itens)
);

COMMENT ON TABLE public.registros_auditoria_5s IS
  'Auditoria 5S registrada no PWA (checklist C/N por item, 5 pilares). itens = {chave: C|N}; observacoes = {pilar: texto}.';

CREATE UNIQUE INDEX IF NOT EXISTS registros_auditoria_5s_local_id_key ON public.registros_auditoria_5s (local_id);
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_5s_fazenda ON public.registros_auditoria_5s (fazenda_id);
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_5s_data ON public.registros_auditoria_5s (data);
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_5s_setor ON public.registros_auditoria_5s (setor_id);
CREATE INDEX IF NOT EXISTS idx_registros_auditoria_5s_deleted ON public.registros_auditoria_5s (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.registros_auditoria_5s ENABLE ROW LEVEL SECURITY;

-- caller_has_fazenda_access cobre usuarios do painel e o peao do PWA.
DROP POLICY IF EXISTS registros_auditoria_5s_select ON public.registros_auditoria_5s;
DROP POLICY IF EXISTS registros_auditoria_5s_insert ON public.registros_auditoria_5s;
DROP POLICY IF EXISTS registros_auditoria_5s_update ON public.registros_auditoria_5s;
DROP POLICY IF EXISTS registros_auditoria_5s_delete ON public.registros_auditoria_5s;

CREATE POLICY registros_auditoria_5s_select ON public.registros_auditoria_5s
  FOR SELECT TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_auditoria_5s_insert ON public.registros_auditoria_5s
  FOR INSERT TO authenticated
  WITH CHECK (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_auditoria_5s_update ON public.registros_auditoria_5s
  FOR UPDATE TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_auditoria_5s_delete ON public.registros_auditoria_5s
  FOR DELETE TO authenticated
  USING (public.caller_has_fazenda_access(fazenda_id));

-- Minimo privilegio: os privilegios padrao do Supabase dariam tambem TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON public.registros_auditoria_5s FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_auditoria_5s TO authenticated;

CREATE OR REPLACE TRIGGER update_registros_auditoria_5s_updated_at
  BEFORE UPDATE ON public.registros_auditoria_5s
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
