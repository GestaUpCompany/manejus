-- =====================================================================
-- FARM PLAN · 017 · Virada de Ano
-- copiar_plano_ano: monta o plano do ano novo copiando as semanas
-- marcadas no ano anterior (tudo volta como "Planejado").
-- Não copia as repetições "Atrasada da semana X" e não duplica nada.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create or replace function copiar_plano_ano(p_fazenda uuid, p_de int, p_para int)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_semanas int; v_n int;
begin
  if not tenho_papel(p_fazenda, array['consultor','gestor','administrativo']) then
    raise exception 'Só Gestor, Administrativo ou Consultor Pode Montar o Plano do Ano.';
  end if;
  if p_para <> p_de + 1 then raise exception 'Só Dá para Copiar do Ano Anterior.'; end if;
  v_semanas := extract(week from make_date(p_para, 12, 28))::int;   -- 52 ou 53 semanas no ano novo
  insert into planejamento (fazenda_id, atividade_id, ano, semana, status)
  select distinct p.fazenda_id, p.atividade_id, p_para, p.semana, 1
  from planejamento p
  where p.fazenda_id = p_fazenda and p.ano = p_de and p.semana <= v_semanas
    and coalesce(p.observacao, '') not like 'Atrasada%'
  on conflict (atividade_id, ano, semana) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function copiar_plano_ano(uuid, int, int) from public;
grant execute on function copiar_plano_ano(uuid, int, int) to authenticated;

select 'Virada de ano pronta' as resultado;
