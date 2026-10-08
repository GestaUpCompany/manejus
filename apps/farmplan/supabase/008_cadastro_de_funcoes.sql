-- =====================================================================
-- FARM PLAN · 008 · Cadastro de Funções (Atribuições)
-- Lista única de funções da fazenda. No contrato de cada colaborador
-- basta marcar as funções, sem precisar escrever toda vez.
-- Já traz todas as funções que estão hoje nos contratos (vindas da planilha).
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists funcoes (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  setor_id    uuid references setores(id) on delete set null,
  ativo       boolean not null default true,
  unique (fazenda_id, nome)
);
alter table funcoes enable row level security;
drop policy if exists "ver funcoes" on funcoes;
drop policy if exists "gerir funcoes" on funcoes;
create policy "ver funcoes"   on funcoes for select using (fazenda_id in (select minhas_fazendas()));
create policy "gerir funcoes" on funcoes for all using (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']))
                                         with check (tenho_papel(fazenda_id, array['consultor','gestor','administrativo']));

-- O item de contrato passa a apontar para a função do cadastro
alter table contrato_itens add column if not exists funcao_id uuid references funcoes(id) on delete cascade;

-- Carga: cada texto de tarefa vira uma função (com o setor mais comum de quem a tem)
insert into funcoes (fazenda_id, nome, setor_id)
select ci.fazenda_id, ci.texto,
       (select p2.setor_id from contrato_itens c2 join pessoas p2 on p2.id = c2.pessoa_id
         where c2.fazenda_id = ci.fazenda_id and c2.texto = ci.texto and p2.setor_id is not null
         group by p2.setor_id order by count(*) desc limit 1)
from contrato_itens ci
where ci.tipo = 'tarefa' and ci.texto is not null
group by ci.fazenda_id, ci.texto
on conflict (fazenda_id, nome) do nothing;

update contrato_itens ci set funcao_id = f.id
from funcoes f
where ci.tipo = 'tarefa' and ci.funcao_id is null and f.fazenda_id = ci.fazenda_id and f.nome = ci.texto;

-- Confere
select count(*) as funcoes_cadastradas,
       (select count(*) from contrato_itens where tipo = 'tarefa' and funcao_id is null) as itens_sem_funcao
from funcoes;
