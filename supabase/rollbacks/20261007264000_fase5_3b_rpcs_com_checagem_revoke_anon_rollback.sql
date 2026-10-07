-- ROLLBACK da Fase 5.3b (migration 20261007264000_fase5_3b_rpcs_com_checagem_revoke_anon.sql)
-- NÃO fica em supabase/migrations/ de propósito. Reabre EXECUTE (ACL original: PUBLIC) nas 51 RPCs.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
