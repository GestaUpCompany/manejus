-- ============================================================================
-- Manejo de curral / etapa 1: tabelas (sessão, linhas por animal, pendências de designação de lote)
-- ============================================================================
-- Só estrutura nova e aditiva; nenhuma tabela existente é alterada e nenhum trigger toca lote_categorias.
--   * sessoes_manejo_curral: uma por sessão de curral. O PWA (peão) grava direto, como nas demais cadernetas
--     (policy por vínculo da fazenda). local_id é a chave de idempotência do sync.
--   * registros_manejo_curral: uma linha por animal. peso_kg é informativo e fica só aqui (não alimenta o agregado).
--     status_processamento e erro são preenchidos só pela RPC aplicar_manejo_curral (etapa 2).
--   * pendencias_designacao_lote: nasce na RPC (etapa 2) quando o lote de destino difere do atual do animal.
--     Leitura por fazenda; escrita só pelas RPCs (nenhum INSERT/UPDATE/DELETE direto).
-- Rollback: supabase/rollbacks/20261016230000_manejo_curral_tabelas_rollback.sql
-- ============================================================================

CREATE TABLE public.sessoes_manejo_curral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas (id),
  local_id text,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  responsavel text,
  observacao text,
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  sync_status text NOT NULL DEFAULT 'synced',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_sessoes_manejo_curral_local ON public.sessoes_manejo_curral (fazenda_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX idx_sessoes_manejo_curral_fazenda_data ON public.sessoes_manejo_curral (fazenda_id, data DESC);

CREATE TABLE public.registros_manejo_curral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas (id),
  sessao_id uuid NOT NULL REFERENCES public.sessoes_manejo_curral (id) ON DELETE CASCADE,
  local_id text,
  ordem integer,
  individuo_id uuid REFERENCES public.individuos (id),
  identificador_lido text,
  id_provisorio_anterior text,
  id_brinco_novo text,
  id_chip_novo text,
  id_manejo_novo text,
  motivo_troca text CHECK (motivo_troca IS NULL OR motivo_troca IN ('definitivo', 'perdido', 'trocado')),
  peso_kg numeric(8, 2) CHECK (peso_kg IS NULL OR peso_kg > 0),
  lote_destino_id uuid REFERENCES public.lotes (id),
  sexo text,
  categoria text,
  raca text,
  observacao text,
  status_processamento text NOT NULL DEFAULT 'pendente' CHECK (status_processamento IN ('pendente', 'aplicado', 'conflito')),
  erro text,
  sync_status text NOT NULL DEFAULT 'synced',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_registros_manejo_curral_local ON public.registros_manejo_curral (fazenda_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX idx_registros_manejo_curral_sessao ON public.registros_manejo_curral (sessao_id);
CREATE INDEX idx_registros_manejo_curral_individuo ON public.registros_manejo_curral (individuo_id);

CREATE TABLE public.pendencias_designacao_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas (id),
  registro_manejo_id uuid NOT NULL REFERENCES public.registros_manejo_curral (id) ON DELETE CASCADE,
  individuo_id uuid NOT NULL REFERENCES public.individuos (id),
  lote_origem_id uuid REFERENCES public.lotes (id),
  lote_destino_id uuid NOT NULL REFERENCES public.lotes (id),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'confirmada', 'descartada')),
  resolvida_por uuid,
  resolvida_em timestamptz,
  evento_movimentacao_id uuid REFERENCES public.registros_movimentacao (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- no máximo uma pendência aberta por animal
CREATE UNIQUE INDEX uq_pendencias_designacao_aberta ON public.pendencias_designacao_lote (individuo_id) WHERE status = 'aberta';
CREATE INDEX idx_pendencias_designacao_fazenda ON public.pendencias_designacao_lote (fazenda_id, status);

ALTER TABLE public.sessoes_manejo_curral ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_manejo_curral ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendencias_designacao_lote ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessoes_manejo_curral_fazenda ON public.sessoes_manejo_curral FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY registros_manejo_curral_fazenda ON public.registros_manejo_curral FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id))
  WITH CHECK (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));
CREATE POLICY pendencias_designacao_lote_leitura ON public.pendencias_designacao_lote FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.caller_has_fazenda_access(fazenda_id));

REVOKE ALL ON public.sessoes_manejo_curral, public.registros_manejo_curral, public.pendencias_designacao_lote FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sessoes_manejo_curral TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.registros_manejo_curral TO authenticated;
GRANT SELECT ON public.pendencias_designacao_lote TO authenticated;
