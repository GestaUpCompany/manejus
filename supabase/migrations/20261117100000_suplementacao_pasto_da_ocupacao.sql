-- Suplementação: o pasto do registro passa a vir da ocupação do lote no momento do registro
-- (último movimento de pastagem com data <= data do registro), e não mais do payload enviado pelo PWA.
-- Não altera registros já gravados: só novos INSERTs e UPDATEs de lote/data/pasto.
-- Se o lote não tiver nenhum movimento de pastagem, o valor enviado pelo payload é mantido.

create or replace function fn_suplementacao_pasto_da_ocupacao()
returns trigger
language plpgsql
as $$
declare
  v_pasto_id uuid;
  v_nome text;
begin
  if new.lote_id is null or new.data is null then
    return new;
  end if;

  -- Pasto em que o lote estava no momento do registro
  select r.pasto_entrada_id
    into v_pasto_id
    from registros_pastagens r
   where r.fazenda_id = new.fazenda_id
     and r.lote_id = new.lote_id
     and r.deleted_at is null
     and r.data <= new.data
   order by r.data desc
   limit 1;

  -- Registro anterior ao primeiro movimento: o lote estava no pasto de saída do primeiro movimento
  if v_pasto_id is null then
    select r.pasto_saida_id
      into v_pasto_id
      from registros_pastagens r
     where r.fazenda_id = new.fazenda_id
       and r.lote_id = new.lote_id
       and r.deleted_at is null
     order by r.data asc
     limit 1;
  end if;

  if v_pasto_id is not null then
    select p.nome into v_nome from pastos p where p.id = v_pasto_id;
    new.pasto_id := v_pasto_id;
    new.pasto := v_nome;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_suplementacao_pasto_da_ocupacao on registros_suplementacao;
create trigger trg_suplementacao_pasto_da_ocupacao
  before insert or update of lote_id, data, pasto, pasto_id
  on registros_suplementacao
  for each row
  execute function fn_suplementacao_pasto_da_ocupacao();
