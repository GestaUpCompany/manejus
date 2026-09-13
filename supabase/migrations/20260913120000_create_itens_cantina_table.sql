-- Create itens_cantina table
-- Catálogo de alimentos da cantina, com classificação e unidade de medida.
-- Substitui itens_supermercado para a caderneta de cantina (classificação -> item).

CREATE TABLE public.itens_cantina (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  classificacao text NOT NULL CHECK (classificacao IN ('Perecíveis', 'Não Perecíveis', 'Bebidas', 'Limpeza/Higiene', 'Hortifruti', 'Carnes')),
  unidade_medida text NOT NULL CHECK (unidade_medida IN ('kg', 'g', 'L', 'mL', 'Unidade', 'Pacote')),
  ativo boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX idx_itens_cantina_fazenda_id ON public.itens_cantina(fazenda_id);
CREATE INDEX idx_itens_cantina_ativo ON public.itens_cantina(ativo);
CREATE INDEX idx_itens_cantina_classificacao ON public.itens_cantina(classificacao);
CREATE INDEX idx_itens_cantina_deleted_at ON public.itens_cantina(deleted_at) WHERE deleted_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.itens_cantina ENABLE ROW LEVEL SECURITY;

-- Policies (same pattern as itens_almoxarifado: allow all authenticated users)
CREATE POLICY "Authenticated select itens_cantina"
ON public.itens_cantina FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated insert itens_cantina"
ON public.itens_cantina FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated update itens_cantina"
ON public.itens_cantina FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated delete itens_cantina"
ON public.itens_cantina FOR DELETE
TO authenticated
USING (true);

-- Grant permissions
GRANT ALL ON TABLE public.itens_cantina TO authenticated;
