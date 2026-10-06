-- Isolamento de tenant (incidente: pasto Serrinha 5 / Fazenda Marcon).
--
-- Problema: pastos, lotes, fazendas, usuario_fazenda e peoes tinham policies com
-- qual/check = true (inclusive para anon e public), permitindo que qualquer
-- autenticado lesse e alterasse dados de qualquer fazenda. usuario_fazenda
-- permitia auto-vinculo a qualquer fazenda (escalacao de privilegio).
--
-- Padrao aplicado:
--   - caller_has_fazenda_access(uuid): cobre usuarios do painel (usuario_fazenda)
--     e peoes do PWA (auth.jwt()->>'email' -> peoes -> fazendas.acesso_id).
--   - user_has_fazenda_role(uuid, text[]): novo helper para checks por papel.
--   - sincronizar_historico_pasto_lote_edit ganha verificacao de vinculo, pois e
--     security definer e foi o caminho usado para mover lotes entre fazendas.

-- ---------------------------------------------------------------------------
-- Helper: papel do usuario autenticado em uma fazenda especifica
-- ---------------------------------------------------------------------------
create or replace function public.user_has_fazenda_role(
  p_fazenda_id uuid,
  p_papeis text[]
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.usuario_fazenda uf
    join public.usuarios u on u.id = uf.usuario_id
    where (uf.usuario_id = auth.uid() or u.auth_id = auth.uid())
      and uf.fazenda_id = p_fazenda_id
      and uf.ativo = true
      and u.ativo = true
      and uf.papel = any(p_papeis)
  );
$$;

grant execute on function public.user_has_fazenda_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- fazendas
-- ---------------------------------------------------------------------------
drop policy if exists "Anon delete fazendas" on public.fazendas;
drop policy if exists "Anon insert fazendas" on public.fazendas;
drop policy if exists "Anon update fazendas" on public.fazendas;
drop policy if exists "Auth delete fazendas" on public.fazendas;
drop policy if exists "Auth insert fazendas" on public.fazendas;
drop policy if exists "Auth update fazendas" on public.fazendas;
drop policy if exists "Enable public read access" on public.fazendas;
drop policy if exists "fazendas_grupo_id_select" on public.fazendas;
drop policy if exists "require_active_access" on public.fazendas;
drop policy if exists "Users can update their farms" on public.fazendas;
drop policy if exists "Users can view their farms" on public.fazendas;

-- Leitura: vinculo direto (painel ou peao), admin, ou fazenda do mesmo grupo
-- (necessario para transferencia de lotes entre fazendas do grupo).
create policy "fazendas_select_vinculo_ou_grupo" on public.fazendas
  for select to authenticated
  using (
    public.caller_has_fazenda_access(id)
    or public.is_admin_user()
    or (
      grupo_id is not null
      and exists (
        select 1
        from public.fazendas mf
        where mf.grupo_id = fazendas.grupo_id
          and public.caller_has_fazenda_access(mf.id)
      )
    )
  );

create policy "fazendas_insert_admin" on public.fazendas
  for insert to authenticated
  with check (public.is_admin_user());

create policy "fazendas_update_admin_controller" on public.fazendas
  for update to authenticated
  using (
    public.is_admin_user()
    or public.user_has_fazenda_role(id, '{admin,controller}')
  )
  with check (
    public.is_admin_user()
    or public.user_has_fazenda_role(id, '{admin,controller}')
  );

create policy "fazendas_delete_admin" on public.fazendas
  for delete to authenticated
  using (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- usuario_fazenda (fecha escalacao de privilegio por auto-vinculo)
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated delete usuario_fazenda" on public.usuario_fazenda;
drop policy if exists "Authenticated insert usuario_fazenda" on public.usuario_fazenda;
drop policy if exists "Authenticated update usuario_fazenda" on public.usuario_fazenda;
drop policy if exists "require_active_access" on public.usuario_fazenda;
-- Auto-insercao permitia vincular-se a qualquer fazenda com qualquer papel.
drop policy if exists "Users can insert their farm associations" on public.usuario_fazenda;
-- Mantidas: "Users can view/delete their farm associations" (escopo proprio),
-- "Admins podem ler todos os vinculos" e "Usuarios podem ler vinculos das suas
-- fazendas" (membros veem co-membros da mesma fazenda).

-- Gestao de vinculos: admin global ou admin da propria fazenda.
create policy "usuario_fazenda_manage_admin" on public.usuario_fazenda
  for all to authenticated
  using (
    public.is_admin_user()
    or public.user_has_fazenda_role(fazenda_id, '{admin}')
  )
  with check (
    public.is_admin_user()
    or public.user_has_fazenda_role(fazenda_id, '{admin}')
  );

-- ---------------------------------------------------------------------------
-- pastos
-- ---------------------------------------------------------------------------
drop policy if exists "pastos_update_public" on public.pastos;
drop policy if exists "pastos_select_active" on public.pastos;
drop policy if exists "pastos_insert_auth" on public.pastos;
drop policy if exists "pastos_delete_active" on public.pastos;
drop policy if exists "Authenticated delete pastos" on public.pastos;
drop policy if exists "Authenticated select pastos" on public.pastos;
drop policy if exists "Authenticated update pastos" on public.pastos;

create policy "pastos_select_fazenda" on public.pastos
  for select to authenticated
  using (public.caller_has_fazenda_access(fazenda_id));

create policy "pastos_insert_fazenda" on public.pastos
  for insert to authenticated
  with check (public.caller_has_fazenda_access(fazenda_id));

create policy "pastos_update_fazenda" on public.pastos
  for update to authenticated
  using (
    public.caller_has_fazenda_access(fazenda_id)
    and deleted_at is null
  )
  with check (public.caller_has_fazenda_access(fazenda_id));

create policy "pastos_delete_fazenda" on public.pastos
  for delete to authenticated
  using (
    public.caller_has_fazenda_access(fazenda_id)
    and deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- lotes
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated delete lotes" on public.lotes;
drop policy if exists "Authenticated insert lotes" on public.lotes;
drop policy if exists "Authenticated select lotes" on public.lotes;
drop policy if exists "Authenticated update lotes" on public.lotes;

create policy "lotes_select_fazenda" on public.lotes
  for select to authenticated
  using (
    public.caller_has_fazenda_access(fazenda_id)
    and deleted_at is null
  );

create policy "lotes_insert_fazenda" on public.lotes
  for insert to authenticated
  with check (public.caller_has_fazenda_access(fazenda_id));

create policy "lotes_update_fazenda" on public.lotes
  for update to authenticated
  using (
    public.caller_has_fazenda_access(fazenda_id)
    and deleted_at is null
  )
  with check (public.caller_has_fazenda_access(fazenda_id));

create policy "lotes_delete_fazenda" on public.lotes
  for delete to authenticated
  using (
    public.caller_has_fazenda_access(fazenda_id)
    and deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- peoes (tabela guarda senha do PWA; escrita estava aberta a qualquer autenticado)
-- ---------------------------------------------------------------------------
drop policy if exists "Auth delete peoes" on public.peoes;
drop policy if exists "Auth insert peoes" on public.peoes;
drop policy if exists "Auth update peoes" on public.peoes;
-- Mantidas as policies de service_role usadas pelas edge functions.

create policy "peoes_manage_admin_controller" on public.peoes
  for all to authenticated
  using (
    public.is_admin_user()
    or exists (
      select 1
      from public.fazendas f
      where f.acesso_id = peoes.fazenda_id
        and public.user_has_fazenda_role(f.id, '{admin,controller}')
    )
  )
  with check (
    public.is_admin_user()
    or exists (
      select 1
      from public.fazendas f
      where f.acesso_id = peoes.fazenda_id
        and public.user_has_fazenda_role(f.id, '{admin,controller}')
    )
  );

-- ---------------------------------------------------------------------------
-- sincronizar_historico_pasto_lote_edit: verificar vinculo antes de escrever
-- (funcao security definer; era o caminho de movimentacao de lote sem check)
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_historico_pasto_lote_edit(
  p_lote_id uuid,
  p_pasto_id_anterior uuid,
  p_pasto_id_novo uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
set "TimeZone" to 'America/Cuiaba'
as $function$
DECLARE
  v_fazenda_id uuid;
  v_cabecas integer;
  v_peso numeric;
  v_modulo_novo_id uuid;
  v_modulo_anterior_id uuid;
  v_meta_pasto integer;
  v_meta_modulo integer;
  v_historico_modulo_aberto_id uuid;
  v_historico_modulo_aberto_modulo_id uuid;
BEGIN
  -- Se não mudou pasto, nada a fazer
  IF p_pasto_id_anterior IS NOT DISTINCT FROM p_pasto_id_novo THEN
    RETURN;
  END IF;

  -- Buscar fazenda do lote e verificar vinculo do chamador antes de qualquer escrita
  SELECT fazenda_id INTO v_fazenda_id FROM public.lotes WHERE id = p_lote_id;
  IF v_fazenda_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.caller_has_fazenda_access(v_fazenda_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuario sem vinculo com a fazenda do lote %', p_lote_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Se o novo pasto é NULL (lote desativado ou confinamento), apenas fechar histórico aberto
  IF p_pasto_id_novo IS NULL THEN
    UPDATE public.lote_pasto_historico
    SET data_hora_saida = now(),
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

    -- Fechar histórico de módulo aberto
    UPDATE public.lote_modulo_historico
    SET data_hora_saida = now(),
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

    RETURN;
  END IF;

  SELECT modulo_id, meta_intervalo_ocupacao_dias INTO v_modulo_novo_id, v_meta_pasto
  FROM public.pastos WHERE id = p_pasto_id_novo;

  SELECT modulo_id INTO v_modulo_anterior_id
  FROM public.pastos WHERE id = p_pasto_id_anterior;

  -- Métricas atuais do lote
  v_cabecas := public.calcular_cabecas_lote(p_lote_id);
  v_peso := public.calcular_peso_medio_lote(p_lote_id);

  -- 1. Fechar histórico de pasto aberto (do pasto anterior)
  UPDATE public.lote_pasto_historico
  SET data_hora_saida = now(),
      cabecas_saida = v_cabecas,
      peso_vivo_medio_saida_kg = v_peso,
      updated_at = now()
  WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;

  -- Ativar flag para que trg_sync_lote_modulo não duplique a inserção
  -- em lote_modulo_historico (passo 4 abaixo gerencia isso)
  PERFORM set_config('app.skip_sync_lote_modulo', 'true', true);

  -- 2. Abrir novo histórico de pasto
  INSERT INTO public.lote_pasto_historico (
    lote_id, pasto_id, data_hora_entrada, data_hora_saida,
    cabecas_entrada, peso_vivo_medio_entrada_kg,
    modulo_id, meta_intervalo_ocupacao_dias,
    created_at, updated_at
  )
  VALUES (
    p_lote_id, p_pasto_id_novo, now(), NULL,
    v_cabecas, v_peso,
    v_modulo_novo_id, v_meta_pasto,
    now(), now()
  );

  -- Desativar flag: passo 4 agora gerencia lote_modulo_historico
  PERFORM set_config('app.skip_sync_lote_modulo', 'false', true);

  -- 3. Atualizar indivíduos
  UPDATE public.individuos
  SET pasto_atual = p_pasto_id_novo,
      updated_at = now()
  WHERE fazenda_id = v_fazenda_id AND lote_atual = p_lote_id;

  -- 4. Gerenciar histórico de módulo
  SELECT meta_intervalo_ocupacao_dias INTO v_meta_modulo
  FROM public.modulos_pastos WHERE id = v_modulo_novo_id;

  IF v_modulo_novo_id IS NOT NULL THEN
    -- Verificar histórico de módulo aberto
    SELECT id, modulo_id
    INTO v_historico_modulo_aberto_id, v_historico_modulo_aberto_modulo_id
    FROM public.lote_modulo_historico
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL
    LIMIT 1;

    IF v_historico_modulo_aberto_id IS NULL THEN
      -- Primeiro módulo: abrir histórico
      INSERT INTO public.lote_modulo_historico (
        lote_id, modulo_id, data_hora_entrada,
        cabecas_entrada, peso_vivo_medio_entrada_kg,
        meta_intervalo_ocupacao_dias,
        created_at, updated_at
      )
      VALUES (
        p_lote_id, v_modulo_novo_id, now(),
        v_cabecas, v_peso,
        v_meta_modulo,
        now(), now()
      );
    ELSIF v_historico_modulo_aberto_modulo_id IS DISTINCT FROM v_modulo_novo_id THEN
      -- Mudou de módulo: fechar antigo e abrir novo
      UPDATE public.lote_modulo_historico
      SET data_hora_saida = now(),
          cabecas_saida = v_cabecas,
          peso_vivo_medio_saida_kg = v_peso,
          updated_at = now()
      WHERE id = v_historico_modulo_aberto_id;

      INSERT INTO public.lote_modulo_historico (
        lote_id, modulo_id, data_hora_entrada,
        cabecas_entrada, peso_vivo_medio_entrada_kg,
        meta_intervalo_ocupacao_dias,
        created_at, updated_at
      )
      VALUES (
        p_lote_id, v_modulo_novo_id, now(),
        v_cabecas, v_peso,
        v_meta_modulo,
        now(), now()
      );
    END IF;
  ELSE
    -- Novo pasto não tem módulo: fechar qualquer histórico de módulo aberto
    UPDATE public.lote_modulo_historico
    SET data_hora_saida = now(),
        cabecas_saida = v_cabecas,
        peso_vivo_medio_saida_kg = v_peso,
        updated_at = now()
    WHERE lote_id = p_lote_id AND data_hora_saida IS NULL;
  END IF;
END;
$function$;
