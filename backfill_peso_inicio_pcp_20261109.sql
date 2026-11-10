-- ============================================================================
-- Backfill pontual de plano_categoria_personalizacao.peso_inicio_kg_cab (09/11/2026)
-- NAO e migration estrutural: dado operacional, sem arquivo em supabase/migrations.
-- ============================================================================
-- Causa: planos trocados por migrar_plano_lote/_encerrar_plano_lote (antes de 19/10) gravavam a personalizacao sem
-- peso_inicio. O cron update_dados_lotes (e recalcular_peso_vivo_lote / calc_cabecas_peso_lote_em) usa
-- COALESCE(pcp.peso_inicio_kg_cab, peso_entrada), faz o peso voltar ao de entrada na 1a noite e perde o ganho do plano anterior.
--
-- Valor gravado: peso_inicial_kg_cab do snapshot de entrada do plano atual (planos_nutricionais_snapshots, tipo 'entrada'),
-- congelado na lista abaixo em 09/11/2026 (linhas verificadas contra o audit_log da queda de peso).
--
-- ESCOPO: 34 linhas, 8 fazendas. Contagem por fazenda confere no bloco de verificacao.
-- FORA DE PROPOSITO (nao entram):
--   * Chibata LOTE 17 (3 linhas): peso atual ja foi sobrescrito hoje por outra rotina; aguardar investigacao.
--   * Jacamim CM - 04: peso inicial do snapshot (315,5) esta abaixo do peso de entrada atual (357); foi calculado com entrada errada.
--   * 3 linhas com snapshot 0 (Brilhante "Lote Atual P1", Jacamim "Lote femeas angus", Santa Vitoria "Lote 10"): valor invalido.
-- Grupos: A = peso pre-queda igual ao snapshot; B = diferenca <= 6,5 kg; C = diferenca 15 a 46 kg (valor do snapshot,
--         decisao do usuario); D = sem queda no audit (deltas triviais ou ajuste manual).
--
-- SEGURANCA: um unico bloco DO (atomico). Cria o backup ANTES de alterar, aborta se qualquer contagem divergir.
-- UPDATE so em linhas com peso_inicio_kg_cab IS NULL. Nao toca em lote_categorias, fazendas, usuarios, etc.
-- Efeito esperado: no proximo cron (23:00 America/Cuiaba) o peso de cada categoria passa a peso_inicio + GMD x dias do plano.
-- Reversao: backfill_peso_inicio_pcp_20261109_rollback.sql (volta a NULL so onde o valor ainda e o gravado aqui).
-- Depois de rodar: registrar IDs em docs/HISTORICO.md (a tabela de backup tem tudo).
-- ============================================================================

DO $backfill$
DECLARE
  v_n integer;
  v_esperado integer := 34;
  v_fazendas_esperadas jsonb := '{
    "f5d64d63-838e-42cc-9fe3-60f3ea7bb692": 2,
    "d3965505-74d5-4af7-9858-f773d2e8aab3": 12,
    "d8900758-1e41-4855-a55e-17f8e00fea7e": 2,
    "c4d13f1f-a785-4bcd-8e72-4ac4b28ee034": 10,
    "a53d7375-15c8-44fe-98d8-90e9f8423c65": 1,
    "a6640dd6-94b6-4828-a3b1-b7b31c892bf9": 1,
    "867f70e7-9e08-4e03-b793-bd64d8e4a71c": 3,
    "a6559695-250d-4902-b159-f52a9c1540ab": 3
  }'::jsonb;
  v_fz record;
BEGIN
  -- 0. O backup nao pode existir (evita sobrescrever um backup anterior)
  IF to_regclass('public.backup_pcp_peso_inicio_20261109') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: public.backup_pcp_peso_inicio_20261109 ja existe';
  END IF;

  CREATE TEMP TABLE alvo (
    pcp_id uuid PRIMARY KEY,
    fazenda_id uuid NOT NULL,
    lote_id uuid NOT NULL,
    novo numeric NOT NULL CHECK (novo > 0),
    grupo text NOT NULL,
    descr text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO alvo (pcp_id, fazenda_id, lote_id, novo, grupo, descr) VALUES
    ('f3bc0093-936d-43e3-b16e-ba72641d5667'::uuid, 'f5d64d63-838e-42cc-9fe3-60f3ea7bb692'::uuid, '94469c1b-aa18-4d53-9a85-8bf47417ba39'::uuid, 270.13::numeric, 'B', 'Fazenda Brilhante | Lote 4 | bezerra | 24 cab'),
    ('65efe1e6-c392-4539-8c67-0f80bea2e38f'::uuid, 'f5d64d63-838e-42cc-9fe3-60f3ea7bb692'::uuid, '94469c1b-aa18-4d53-9a85-8bf47417ba39'::uuid, 472.80::numeric, 'C', 'Fazenda Brilhante | Lote 4 | vaca | 12 cab'),
    ('276bd065-4487-435d-97c6-b8cc986009ff'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '1977e555-cbb2-4dab-85fb-5e28fd54c830'::uuid, 513.80::numeric, 'A', 'Fazenda Chibata | ENFERMARIA | garrote | 10 cab'),
    ('fbdcbe2c-d26e-4222-8f47-6b8ad1a101ce'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '1977e555-cbb2-4dab-85fb-5e28fd54c830'::uuid, 515.00::numeric, 'A', 'Fazenda Chibata | ENFERMARIA | vaca | 1 cab'),
    ('a411f8a5-0d91-4ad7-b656-e494f17602e3'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '79892a08-6a50-4e3e-a4a1-1a58116edfdb'::uuid, 526.35::numeric, 'A', 'Fazenda Chibata | LOTE 10 | boi magro | 113 cab'),
    ('e27019dc-eb45-409f-9817-eb6872fda39b'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '1489db5c-c116-4b4a-bf5d-bfeed4803606'::uuid, 472.10::numeric, 'B', 'Fazenda Chibata | LOTE 12 | vaca | 73 cab'),
    ('cfd143aa-380b-456d-8059-fc99f571a764'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '33a73370-8b31-4c61-98e3-16185e485c82'::uuid, 809.45::numeric, 'A', 'Fazenda Chibata | LOTE 14 | touro | 19 cab'),
    ('7dac0f97-d45c-4f78-ab19-4bd1895df6ba'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '8614cd41-e0bd-4a80-b0fe-5424cefe50fb'::uuid, 392.45::numeric, 'B', 'Fazenda Chibata | LOTE 2 | novilha | 161 cab'),
    ('e2a8a8ea-190c-41da-83e3-faf64cb0859c'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, 'd6b76661-627c-4d09-a0d9-a3956f828810'::uuid, 479.35::numeric, 'B', 'Fazenda Chibata | LOTE 4 | vaca | 161 cab'),
    ('942136c0-f528-480d-8b78-815b7761f0a1'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '4c713906-2ae5-45f4-96ac-d2f8f11efd38'::uuid, 479.35::numeric, 'B', 'Fazenda Chibata | LOTE 5 | vaca | 65 cab'),
    ('64cbf2c2-510b-45a7-af72-17fdc85d1fd8'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '8b3894a7-1d7d-4b2f-b501-25d298b91a25'::uuid, 479.35::numeric, 'B', 'Fazenda Chibata | LOTE 6 | vaca | 107 cab'),
    ('91c8051a-fc2d-4f11-987a-f63f11a9175c'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '39b98da4-8d9d-4637-95e4-42ff1c7225aa'::uuid, 167.85::numeric, 'A', 'Fazenda Chibata | LOTE 7 | bezerra | 150 cab'),
    ('32b99a35-7b9e-4cc1-83ce-a1be9802dece'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, '4abfaa49-c062-4414-977f-fa801e217b0a'::uuid, 524.35::numeric, 'A', 'Fazenda Chibata | LOTE 8 | boi magro | 113 cab'),
    ('4c407190-62f8-4383-917b-19907ae8853a'::uuid, 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid, 'e1b688b0-3648-44c2-af37-04133d244134'::uuid, 446.35::numeric, 'A', 'Fazenda Chibata | LOTE 9 | garrote | 116 cab'),
    ('6eacd5f9-6a5d-4b29-b3e2-580144cdc165'::uuid, 'd8900758-1e41-4855-a55e-17f8e00fea7e'::uuid, '70487324-305f-4f97-971a-fb063cec9895'::uuid, 450.50::numeric, 'A', 'Fazenda Jacamim | CM- 03 | garrote | 195 cab'),
    ('dded9579-644f-44f4-92d8-037cad7b9cac'::uuid, 'd8900758-1e41-4855-a55e-17f8e00fea7e'::uuid, '81fc5a48-c7fb-49cf-b675-23e3f3ef0e7b'::uuid, 297.00::numeric, 'A', 'Fazenda Jacamim | Desmama Marape 2/3 08/07 | garrote | 228 cab'),
    ('b7938775-e996-4ead-8c20-5567724dbbba'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, 'a64c9abb-74dc-4e8e-80f6-77a01faee7c5'::uuid, 421.40::numeric, 'D', 'Fazenda Marcon | 204 | novilha | 55 cab'),
    ('1963f7cb-4d39-45c0-a668-3460518cf3f0'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '1256a07d-a18e-4110-9adc-fae3f6b7d248'::uuid, 450.50::numeric, 'D', 'Fazenda Marcon | 210 | vaca | 5 cab'),
    ('db9dff05-162a-4bbc-b0f8-507713d1991f'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, 'b5968e13-4965-4fc1-bc99-6888f8ae6b92'::uuid, 440.60::numeric, 'A', 'Fazenda Marcon | Lote 123 | novilha | 12 cab'),
    ('745acae8-3a98-4384-85bd-e17abf47abc7'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, 'b17524ad-5a08-403d-8ee0-719cb514e5ea'::uuid, 622.10::numeric, 'C', 'Fazenda Marcon | Lote 143 | boi magro | 109 cab'),
    ('3100961e-3f11-4fb4-8a62-618e2f1140e4'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '5fc5ac05-7ec0-437a-9c1a-0cc244df6ef2'::uuid, 422.80::numeric, 'C', 'Fazenda Marcon | Lote 149 | novilha | 3 cab'),
    ('e916edda-1a06-4b6a-9e6f-d393d34c18b5'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '5fc5ac05-7ec0-437a-9c1a-0cc244df6ef2'::uuid, 924.50::numeric, 'A', 'Fazenda Marcon | Lote 149 | touro | 1 cab'),
    ('e15915aa-09ae-4c8c-a2ae-d06ec2691aef'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '5fc5ac05-7ec0-437a-9c1a-0cc244df6ef2'::uuid, 482.80::numeric, 'C', 'Fazenda Marcon | Lote 149 | vaca | 6 cab'),
    ('ac355697-3615-417f-bf64-8dff6421cdb0'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, 'cfd0cd40-6077-4ce0-a832-6b943d9cab2b'::uuid, 406.70::numeric, 'C', 'Fazenda Marcon | Lote 179 | novilha | 43 cab'),
    ('4cc670ee-a050-462b-bb51-b659e5b052d9'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '703016db-860a-4042-8c52-0168accde17b'::uuid, 236.60::numeric, 'B', 'Fazenda Marcon | Lote 185 | novilha | 145 cab'),
    ('02594fed-4dac-4807-bc6c-a449b76e0d4e'::uuid, 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034'::uuid, '64be3e13-c190-4be2-b40e-ab84487f54b9'::uuid, 433.10::numeric, 'A', 'Fazenda Marcon | Lote 20 | novilha | 51 cab'),
    ('b44521c7-e047-4f7b-be4e-020e5a764d1f'::uuid, 'a53d7375-15c8-44fe-98d8-90e9f8423c65'::uuid, 'ec09167c-0455-4a6c-8ea6-224b9afb1709'::uuid, 190.64::numeric, 'A', 'Fazenda Santa Cecília | Lote 04 (Novilhas Leves) | novilha | 140 cab'),
    ('b3e0ace5-ba31-4735-b6fc-4a9152f213c4'::uuid, 'a6640dd6-94b6-4828-a3b1-b7b31c892bf9'::uuid, '459b8236-acb8-45ad-a251-301f08964e05'::uuid, 671.18::numeric, 'A', 'GBJ - Faz. Mirandópolis | LOTE 23P | boi gordo | 130 cab'),
    ('08724388-4d48-41e6-a97e-2ee912f9e11e'::uuid, '867f70e7-9e08-4e03-b793-bd64d8e4a71c'::uuid, '24775e79-7133-4156-8ccc-c83555757537'::uuid, 237.90::numeric, 'B', 'Santa Vitória | Lote 11 | garrote | 88 cab'),
    ('d6f239a2-6f11-4d11-86a8-73c95f35679f'::uuid, '867f70e7-9e08-4e03-b793-bd64d8e4a71c'::uuid, '81c8d28f-c78f-4139-bfbd-f6ff576feb4f'::uuid, 217.85::numeric, 'B', 'Santa Vitória | Lote 13 | bezerro | 190 cab'),
    ('46c011cb-a515-4e63-ab75-ab7451fd2c21'::uuid, '867f70e7-9e08-4e03-b793-bd64d8e4a71c'::uuid, '81c8d28f-c78f-4139-bfbd-f6ff576feb4f'::uuid, 231.85::numeric, 'B', 'Santa Vitória | Lote 13 | garrote | 63 cab'),
    ('ea8fe227-1668-44aa-9b3a-b7d166cae111'::uuid, 'a6559695-250d-4902-b159-f52a9c1540ab'::uuid, '4c4d6064-d02c-4c19-bb2c-aa98a0d2bd67'::uuid, 233.86::numeric, 'D', 'Sementes Tropical - Arizona | AR-26-012 | bezerro | 33 cab'),
    ('37342278-1222-4de9-8f38-0d965963b6bb'::uuid, 'a6559695-250d-4902-b159-f52a9c1540ab'::uuid, '4c4d6064-d02c-4c19-bb2c-aa98a0d2bd67'::uuid, 404.00::numeric, 'A', 'Sementes Tropical - Arizona | AR-26-012 | garrote | 55 cab'),
    ('c387cdc2-32cd-4986-96d3-894bcb43afdb'::uuid, 'a6559695-250d-4902-b159-f52a9c1540ab'::uuid, '0c020ae8-f060-426c-9afe-1adb130ab7d7'::uuid, 257.15::numeric, 'A', 'Sementes Tropical - Arizona | AR-26-06 | bezerro | 53 cab');

  -- 1. Contagem da lista
  SELECT count(*) INTO v_n FROM alvo;
  IF v_n <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: lista tem % linhas, esperado %', v_n, v_esperado;
  END IF;

  -- 2. Contagem por fazenda confere com a autorizada
  FOR v_fz IN SELECT key AS fazenda_id, value::int AS esperado FROM jsonb_each_text(v_fazendas_esperadas) AS t(key, value) LOOP
    SELECT count(*) INTO v_n FROM alvo WHERE fazenda_id = v_fz.fazenda_id::uuid;
    IF v_n <> v_fz.esperado THEN
      RAISE EXCEPTION 'ABORTADO: fazenda % tem % linhas, esperado %', v_fz.fazenda_id, v_n, v_fz.esperado;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM alvo WHERE fazenda_id::text NOT IN (SELECT jsonb_object_keys(v_fazendas_esperadas));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: % linhas de fazenda fora da lista autorizada', v_n;
  END IF;

  -- 3. Cada linha existe, esta ativa, sem peso_inicio, e a fazenda/lote da linha batem com a lista
  SELECT count(*) INTO v_n
  FROM alvo a
  JOIN plano_categoria_personalizacao p ON p.id = a.pcp_id
  JOIN planos_nutricionais pn ON pn.id = p.plano_id AND pn.ativo AND pn.data_fim IS NULL
  JOIN lotes l ON l.id = pn.lote_id AND l.id = a.lote_id AND l.fazenda_id = a.fazenda_id
  WHERE p.ativo AND p.peso_inicio_kg_cab IS NULL;
  IF v_n <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: so % de % linhas seguem ativas, sem peso_inicio e coerentes com fazenda/lote (algo mudou desde a previa)', v_n, v_esperado;
  END IF;

  -- 4. Nada do Lote 17 de Chibata (excluido de proposito)
  SELECT count(*) INTO v_n
  FROM alvo a JOIN lotes l ON l.id = a.lote_id
  WHERE upper(l.nome) = 'LOTE 17' AND a.fazenda_id = 'd3965505-74d5-4af7-9858-f773d2e8aab3'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: a lista contem % linha(s) do Lote 17 de Chibata', v_n;
  END IF;

  -- 5. BACKUP (antes de qualquer alteracao)
  CREATE TABLE public.backup_pcp_peso_inicio_20261109 AS
  SELECT a.pcp_id, a.fazenda_id, a.lote_id, a.grupo, a.descr,
         p.lote_categoria_id, p.plano_id,
         p.peso_inicio_kg_cab AS peso_inicio_antigo,
         a.novo AS peso_inicio_novo,
         lc.peso_vivo_atual_kg_cab AS pv_antes,
         lc.data_ajuste_peso AS data_ajuste_peso_antes,
         now() AS backup_em
  FROM alvo a
  JOIN plano_categoria_personalizacao p ON p.id = a.pcp_id
  JOIN lote_categorias lc ON lc.id = p.lote_categoria_id;
  ALTER TABLE public.backup_pcp_peso_inicio_20261109 ADD PRIMARY KEY (pcp_id);
  ALTER TABLE public.backup_pcp_peso_inicio_20261109 ENABLE ROW LEVEL SECURITY;

  SELECT count(*) INTO v_n FROM public.backup_pcp_peso_inicio_20261109;
  IF v_n <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: backup tem % linhas, esperado %', v_n, v_esperado;
  END IF;

  -- 6. ALTERACAO (so onde ainda esta NULL)
  UPDATE plano_categoria_personalizacao p
  SET peso_inicio_kg_cab = a.novo
  FROM alvo a
  WHERE p.id = a.pcp_id AND p.peso_inicio_kg_cab IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: UPDATE alterou % linhas, esperado %', v_n, v_esperado;
  END IF;

  -- 7. Verificacao final: todos os valores gravados batem com a lista
  SELECT count(*) INTO v_n
  FROM alvo a JOIN plano_categoria_personalizacao p ON p.id = a.pcp_id
  WHERE p.peso_inicio_kg_cab = a.novo;
  IF v_n <> v_esperado THEN
    RAISE EXCEPTION 'ABORTADO: apos o UPDATE, so % de % linhas tem o valor esperado', v_n, v_esperado;
  END IF;

  RAISE NOTICE 'OK: % linhas atualizadas; backup em public.backup_pcp_peso_inicio_20261109', v_esperado;
END
$backfill$;

-- ============================================================================
-- VERIFICACAO (rodar depois, so leitura)
-- ============================================================================
-- select fazenda_id, count(*) from public.backup_pcp_peso_inicio_20261109 group by 1 order by 1;   -- 2,12,2,10,1,1,3,3
-- select count(*) from plano_categoria_personalizacao p join public.backup_pcp_peso_inicio_20261109 b on b.pcp_id=p.id
--   where p.peso_inicio_kg_cab = b.peso_inicio_novo;                                                -- 34
-- Amanha, depois do cron das 23:00 (Cuiaba), conferir Chibata LOTE 8: boi magro = 524,35 + 1,45 x dias do plano (~601 kg).

-- ============================================================================
-- ETAPA 2 (OPCIONAL, SEPARADA, exige autorizacao propria): corrigir o %PV historico dos registros de suplementacao.
-- recalcular_peso_vivo_lote reescreve peso_vivo_kg de TODOS os registros do lote (e o trigger recalcula o %PV).
-- Nao e necessaria para o peso das categorias (o cron cuida). Rodar um lote por vez, comecando por um lote de Chibata:
-- select public.recalcular_peso_vivo_lote('4abfaa49-c062-4414-977f-fa801e217b0a'::uuid, false);  -- Chibata LOTE 8
-- ============================================================================
