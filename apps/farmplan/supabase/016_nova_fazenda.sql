-- =====================================================================
-- FARM PLAN · 016 · Nova Fazenda (para importar a planilha de outro cliente)
-- criar_fazenda: o consultor cria uma fazenda na mesma consultoria e já
--                ganha acesso de consultor nela.
-- apagar_fazenda: desfaz uma importação errada (só consultor, e precisa
--                 digitar o nome exato da fazenda).
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create or replace function criar_fazenda(p_nome text, p_uf text default null, p_municipio text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_conta uuid; v_fz uuid;
begin
  select f.conta_id into v_conta
  from acessos a join fazendas f on f.id = a.fazenda_id
  where a.user_id = auth.uid() and a.papel = 'consultor'
  limit 1;
  if v_conta is null then raise exception 'Só o Consultor Pode Criar Fazendas.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o Nome da Fazenda.'; end if;
  if exists (select 1 from fazendas where conta_id = v_conta and lower(trim(nome)) = lower(trim(p_nome))) then
    raise exception 'Já Existe uma Fazenda com Esse Nome.';
  end if;
  insert into fazendas (conta_id, nome, uf, municipio) values (v_conta, trim(p_nome), upper(nullif(trim(p_uf), '')), nullif(trim(p_municipio), ''))
  returning id into v_fz;
  insert into acessos (user_id, fazenda_id, papel) values (auth.uid(), v_fz, 'consultor');
  return v_fz;
end $$;

create or replace function apagar_fazenda(p_fazenda uuid, p_confirma_nome text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_nome text;
begin
  if not tenho_papel(p_fazenda, array['consultor']) then raise exception 'Só o Consultor Pode Apagar uma Fazenda.'; end if;
  select nome into v_nome from fazendas where id = p_fazenda;
  if v_nome is null or lower(trim(v_nome)) <> lower(trim(p_confirma_nome)) then raise exception 'O Nome Digitado Não Confere.'; end if;
  delete from fazendas where id = p_fazenda;
  return v_nome || ' apagada';
end $$;

revoke all on function criar_fazenda(text, text, text) from public;
revoke all on function apagar_fazenda(uuid, text) from public;
grant execute on function criar_fazenda(text, text, text) to authenticated;
grant execute on function apagar_fazenda(uuid, text) to authenticated;

select 'Funções de Nova Fazenda prontas' as resultado;
