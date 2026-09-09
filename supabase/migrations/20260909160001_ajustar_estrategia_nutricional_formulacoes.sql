-- ============================================================================
-- MIGRAÇÃO - Ajustar estratégia nutricional para usar formulacoes como fonte única
-- ============================================================================
-- 1. Atualiza CHECK constraint para aceitar os tipos reais da tabela formulacoes.
-- 2. Atualiza trigger para buscar o nome cacheado apenas em public.formulacoes.
-- ============================================================================

-- 1. Atualizar CHECK constraint
ALTER TABLE public.individuos
DROP CONSTRAINT IF EXISTS individuos_estrategia_nutricional_tipo_check;

ALTER TABLE public.individuos
ADD CONSTRAINT individuos_estrategia_nutricional_tipo_check
CHECK (
  estrategia_nutricional_tipo IS NULL OR
  estrategia_nutricional_tipo = ANY (ARRAY['Ração', 'Proteico', 'Proteico-Energético', 'Sal Mineral'])
);

-- 2. Recriar trigger/function para buscar nome em formulacoes
CREATE OR REPLACE FUNCTION public.cache_estrategia_nutricional_nome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  strategy_nome TEXT;
BEGIN
  -- Se não há ID, limpa o nome cacheado
  IF NEW.estrategia_nutricional_id IS NULL THEN
    NEW.estrategia_nutricional_nome := NULL;
    RETURN NEW;
  END IF;

  -- Busca o nome na tabela formulacoes (fonte única)
  SELECT nome INTO strategy_nome
  FROM public.formulacoes
  WHERE id = NEW.estrategia_nutricional_id;

  NEW.estrategia_nutricional_nome := strategy_nome;

  RETURN NEW;
END;
$$;
