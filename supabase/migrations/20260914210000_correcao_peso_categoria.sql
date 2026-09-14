-- Correção de peso real por categoria do lote
--
-- Cria tabela de auditoria peso_correcoes e RPC corrigir_peso_categoria.
-- O fluxo: usuário informa o peso real medido na balança e a data da pesagem.
-- A RPC guarda o peso anterior na auditoria, atualiza peso_vivo_atual_kg_cab
-- e data_ajuste_peso = data da pesagem. A trigger existente
-- (trigger_recalc_peso_lote_cat) recalcula registros_suplementacao.peso_vivo_kg
-- em cascata. O cron update_dados_lotes passa a projetar incrementalmente
-- a partir da data da pesagem.

-- ============================================================
-- 1. Tabela de auditoria
-- ============================================================

CREATE TABLE IF NOT EXISTS public.peso_correcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  lote_categoria_id uuid NOT NULL REFERENCES public.lote_categorias(id) ON DELETE CASCADE,
  peso_anterior_kg_cab numeric(10,2) NOT NULL,
  peso_novo_kg_cab numeric(10,2) NOT NULL,
  data_pesagem date NOT NULL,
  motivo text,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_peso_correcoes_lote_categoria_id
  ON public.peso_correcoes(lote_categoria_id);
CREATE INDEX IF NOT EXISTS idx_peso_correcoes_fazenda_id
  ON public.peso_correcoes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_peso_correcoes_created_at
  ON public.peso_correcoes(created_at DESC);

ALTER TABLE public.peso_correcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view farm peso_correcoes" ON public.peso_correcoes
FOR SELECT TO authenticated
USING (
  fazenda_id IN (
    SELECT fazenda_id
    FROM public.usuario_fazenda
    WHERE usuario_id = auth.uid()
  )
);

CREATE POLICY "Users can insert farm peso_correcoes" ON public.peso_correcoes
FOR INSERT TO authenticated
WITH CHECK (
  fazenda_id IN (
    SELECT fazenda_id
    FROM public.usuario_fazenda
    WHERE usuario_id = auth.uid()
  )
);

GRANT SELECT, INSERT ON public.peso_correcoes TO authenticated;

-- ============================================================
-- 2. RPC corrigir_peso_categoria
-- ============================================================

CREATE OR REPLACE FUNCTION public.corrigir_peso_categoria(
  p_lote_categoria_id uuid,
  p_peso_novo_kg_cab numeric,
  p_data_pesagem date,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_lote_id uuid;
  v_fazenda_id uuid;
  v_peso_anterior numeric;
BEGIN
  IF p_peso_novo_kg_cab IS NULL OR p_peso_novo_kg_cab <= 0 THEN
    RAISE EXCEPTION 'Peso novo deve ser positivo';
  END IF;
  IF p_data_pesagem IS NULL THEN
    RAISE EXCEPTION 'Data da pesagem é obrigatória';
  END IF;
  IF p_data_pesagem > CURRENT_DATE THEN
    RAISE EXCEPTION 'Data da pesagem não pode ser futura';
  END IF;

  SELECT lc.lote_id, l.fazenda_id, lc.peso_vivo_atual_kg_cab
  INTO v_lote_id, v_fazenda_id, v_peso_anterior
  FROM lote_categorias lc
  JOIN lotes l ON l.id = lc.lote_id
  WHERE lc.id = p_lote_categoria_id
    AND lc.ativo = true
    AND lc.data_fim IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria ativa não encontrada';
  END IF;

  INSERT INTO peso_correcoes (
    fazenda_id, lote_id, lote_categoria_id,
    peso_anterior_kg_cab, peso_novo_kg_cab, data_pesagem, motivo, usuario_id
  ) VALUES (
    v_fazenda_id, v_lote_id, p_lote_categoria_id,
    COALESCE(v_peso_anterior, 0), p_peso_novo_kg_cab, p_data_pesagem, p_motivo, p_usuario_id
  );

  UPDATE lote_categorias
  SET peso_vivo_atual_kg_cab = p_peso_novo_kg_cab,
      data_ajuste_peso = p_data_pesagem
  WHERE id = p_lote_categoria_id;
  -- trigger_recalc_peso_lote_cat dispara automaticamente (AFTER UPDATE OF
  -- data_ajuste_peso, peso_vivo_atual_kg_cab) com p_ajuste_manual=true
  -- (data_ajuste_peso mudou), recalculando registros_suplementacao.peso_vivo_kg
  -- e em cascata consumo_pct_pv.
END;
$func$;

GRANT EXECUTE ON FUNCTION public.corrigir_peso_categoria TO authenticated;
