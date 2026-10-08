-- =====================================================================
-- FARM PLAN · 029 · Atualização Automática no Site
-- Liga o "Realtime" do Supabase nas tabelas que a equipe muda pelo app.
-- Assim o Plano Anual, o Plano do Mês, as Tarefas da Semana, o Painel do Dia,
-- a Reunião de 10 Min e os Relatórios
-- mudam sozinhos, na hora, quando alguém dá baixa no celular.
-- (Sem este SQL o site também atualiza, mas só a cada 1 minuto.)
-- Pode rodar mais de uma vez.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['baixas', 'planejamento', 'atividades', 'execucoes', 'fora_do_plano', 'midias', 'relatorios_dia', 'compromissos', 'avaliacoes', 'indicador_valores'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select tablename as "Tabelas com Atualização Automática" from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;
