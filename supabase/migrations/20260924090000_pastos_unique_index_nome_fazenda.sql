-- Impede nomes de pasto duplicados na mesma fazenda entre registros não excluídos.
-- Complementa a trava de nome duplicado no cadastro (Pastos.tsx) e o lookup
-- tolerante a duplicata no PWA (getPastoByNome), que foram a correção app-level
-- do bug "Pasto não encontrado" (2026-09-24).
CREATE UNIQUE INDEX ux_pastos_fazenda_nome_ativo
  ON public.pastos (fazenda_id, lower(nome))
  WHERE deleted_at IS NULL;
