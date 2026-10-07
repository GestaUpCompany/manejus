-- ============================================================================
-- Fase 5.3b (segurança): RPCs que já checam acesso -> fechar para `anon` (defesa em profundidade)
-- ============================================================================
-- Revisão (07/10/2026) do corpo das 51 RPCs SECURITY DEFINER abaixo, todas executáveis por `anon`:
--  * Autorizam pelo OBJETO alvo (caller_has_fazenda_access / user_has_fazenda_access sobre a fazenda
--    do registro, curral, OS, estrada, ponto...) ou por auth.uid() -> usuarios.id; nenhuma confia em
--    p_usuario_id para autorizar (editar/excluir_registro_* ignoram p_usuario_id/p_usuario_email e usam
--    usuarios.auth_id = auth.uid(); fechar_os_venda só usa p_usuario_id como fallback de closed_by,
--    depois de passar user_has_fazenda_access). cancelar/conferir/estornar/fechar exigem !caller_is_peao.
--  * `anon` já era negado pelo corpo (auth.uid() NULL), mas pagava a chamada e dependia de cada corpo
--    estar certo para sempre. Aqui removemos o EXECUTE de PUBLIC/anon; authenticated e service_role
--    mantidos. Sem dependências em policies/views/defaults/triggers/cron e sem chamadores DB->DB
--    (verificado em pg_depend, prosrc e cron.job).
--
-- Fora desta migration (decisão):
--  * get_relatorio_consumo (2 overloads): relatório público por token -> mantém anon (Fase 5.4).
--  * helpers de autorização (caller_*, user_has_*, is_*, vision_tem_acesso...): as policies dependem.
--  * funções de gatilho (retorno trigger): migration própria (5.3c).
-- Rollback: supabase/rollbacks/20261007264000_fase5_3b_rpcs_com_checagem_revoke_anon_rollback.sql
-- ============================================================================

DO $$
DECLARE
  r record;
  v_total int := 0;
  v_esperado constant int := 51;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'alocar_lote_curral','atualizar_estrada','atualizar_ponto','cancelar_os_venda',
        'conferir_recebimento_transferencia','criar_item_almoxarifado_pwa','criar_item_cantina_pwa',
        'detectar_gaps_estradas','editar_registro_clima','editar_registro_leitura_cocho',
        'editar_registro_oferta_trato','editar_registro_suplementacao','encontrar_pasto_por_ponto',
        'encontrar_rota','encontrar_rota_multi','estornar_baixa_os','excluir_registro_clima',
        'excluir_registro_leitura_cocho','excluir_registro_oferta_trato','excluir_registro_suplementacao',
        'fechar_os_venda','get_bebedouros_com_geometria','get_currais_com_geometria',
        'get_detalhes_curral_mapa','get_detalhes_pasto_mapa','get_lote_por_curral','get_lote_por_pasto',
        'get_pastos_com_geometria','reconstruir_topologia_estradas','remover_area','remover_estrada',
        'remover_geometria_bebedouro','remover_geometria_curral','remover_geometria_pasto',
        'remover_geometrias_lote','remover_ponto','salvar_estrada','salvar_geometria_bebedouro',
        'salvar_geometria_curral','salvar_geometria_pasto','salvar_geometrias_mapa',
        'salvar_geometrias_pastos','salvar_ponto','sincronizar_historico_pasto_lote_edit',
        'validar_conectividade_estradas','vision_atualizar_payload','vision_atualizar_relatorio',
        'vision_baixar_payload','vision_criar_relatorio','vision_excluir_relatorio','vision_listar_relatorios'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    v_total := v_total + 1;
  END LOOP;

  IF v_total <> v_esperado THEN
    RAISE EXCEPTION 'Fase 5.3b: esperava % funções, encontrei %', v_esperado, v_total;
  END IF;
END $$;
