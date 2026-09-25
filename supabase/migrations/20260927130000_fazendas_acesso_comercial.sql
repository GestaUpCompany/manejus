-- Feature flag do módulo comercial (comunicado de venda/compra, recebimento).
-- Segue o mesmo padrão de fazendas.acesso_confinamento: o PWA filtra as
-- cadernetas do grupo "Comercial" quando a fazenda não tem o acesso liberado.
ALTER TABLE public.fazendas
  ADD COLUMN IF NOT EXISTS acesso_comercial boolean NOT NULL DEFAULT false;
