-- A view itens_almoxarifado_pwa roda com os privilégios do dono (de propósito: esconde
-- custo_unitario e ignora a policy de admin/controller da tabela), mas não filtrava
-- por fazenda: qualquer usuário autenticado lia o catálogo, a classificação e o saldo
-- de TODAS as fazendas. Agora só devolve itens de fazendas com vínculo ativo do usuário.
CREATE OR REPLACE VIEW public.itens_almoxarifado_pwa AS
SELECT id, fazenda_id, nome, classificacao, unidade, estoque_atual, controla_estoque, ativo
FROM public.itens_almoxarifado
WHERE ativo = true
  AND deleted_at IS NULL
  AND public.user_has_fazenda_access(fazenda_id);
