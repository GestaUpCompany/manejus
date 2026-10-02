-- Estende get_dashboard_stats com contagens das cadernetas novas do PWA
-- (entradas de estoque, confinamento, comercial e pesagem) para o dashboard
-- do controller exibir os mesmos módulos do app.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_fazenda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_result jsonb;
BEGIN
  -- Bounds do dia atual em timezone Cuiabá
  v_today_start := (CURRENT_DATE::timestamptz AT TIME ZONE 'America/Cuiaba');
  v_today_end := ((CURRENT_DATE + 1)::timestamptz AT TIME ZONE 'America/Cuiaba');

  SELECT jsonb_build_object(
    'cadastroStats', jsonb_build_object(
      'pastos',        (SELECT COUNT(*) FROM pastos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL),
      'lotes',         (SELECT COUNT(*) FROM lotes WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL),
      'funcionarios',  (SELECT COUNT(*) FROM funcionarios WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'insumos',       (SELECT COUNT(*) FROM insumos WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'pluviometros',  (SELECT COUNT(*) FROM pluviometros WHERE fazenda_id = p_fazenda_id AND ativo = true),
      'medicamentos',  (SELECT COUNT(*) FROM medicamentos WHERE fazenda_id = p_fazenda_id AND ativo = true AND deleted_at IS NULL)
    ),
    'cadernetaStats', jsonb_build_object(
      'maternidade',         (SELECT COUNT(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'enfermaria',          (SELECT COUNT(*) FROM registros_enfermaria WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'pastagens',           (SELECT COUNT(*) FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'rodeio',              (SELECT COUNT(*) FROM registros_rodeio WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'suplementacao',       (SELECT COUNT(*) FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'bebedouros',          (SELECT COUNT(*) FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'movimentacao',        (SELECT COUNT(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'morte',               (SELECT COUNT(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'clima',               (SELECT COUNT(*) FROM registros_clima WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'abastecimento',       (SELECT COUNT(*) FROM registros_abastecimento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'cantina',             (SELECT COUNT(*) FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'limpeza',             (SELECT COUNT(*) FROM registros_limpeza WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'operacoes-maquinas',  (SELECT COUNT(*) FROM registros_operacoes_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'almoxarifado',        (SELECT COUNT(*) FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'manutencao-maquinas', (SELECT COUNT(*) FROM registros_manutencao_maquinas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'problemas',           (SELECT COUNT(*) FROM registros_problemas WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'pesagem',             (SELECT COUNT(*) FROM registros_pesagem WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'leitura-cocho',       (SELECT COUNT(*) FROM registros_leitura_cocho WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'trato-confinamento',  (SELECT COUNT(*) FROM registros_oferta_trato WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'fabrica-confinamento',(SELECT COUNT(*) FROM registros_fabrica_confinamento WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'entrada-insumos',     (SELECT COUNT(*) FROM registros_entrada_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'saida-insumos',       (SELECT COUNT(*) FROM registros_saida_insumos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL),
      'entrada-combustivel', (SELECT COUNT(*) FROM movimentacoes_combustivel WHERE fazenda_id = p_fazenda_id AND tipo_movimentacao = 'entrada' AND origem = 'pwa_entrada'),
      'entrada-almoxarifado',(SELECT COUNT(*) FROM registros_almoxarifado WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'entrada'),
      'entrada-cantina',     (SELECT COUNT(*) FROM registros_alimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND modo = 'entrada'),
      'comunicado-venda',        (SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'venda'),
      'comunicado-compra',       (SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'compra'),
      'comunicado-transferencia',(SELECT COUNT(*) FROM ordens_servico WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND tipo = 'transferencia'),
      'recebimento-compra',  (SELECT COUNT(*) FROM os_recebimentos WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL)
    ),
    'registrosHoje',
      (SELECT COUNT(*) FROM registros_maternidade WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_enfermaria WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_pastagens WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_rodeio WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_suplementacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_bebedouros WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_movimentacao WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end) +
      (SELECT COUNT(*) FROM registros_morte WHERE fazenda_id = p_fazenda_id AND deleted_at IS NULL AND data >= v_today_start AND data < v_today_end)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;

-- =============================================================================
-- Inclui as tabelas novas na view unificada de rastreio de cadernetas.
-- Colunas e tipos idênticos às existentes (movimentacoes_combustivel não tem
-- nome_usuario/deleted_at: entra com NULLs para manter o shape da view).
-- =============================================================================
CREATE OR REPLACE VIEW public.v_registros_unificado AS
SELECT 'registros_abastecimento'::text  AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_abastecimento
UNION ALL
SELECT 'registros_alimentacao'::text     AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_alimentacao
UNION ALL
SELECT 'registros_almoxarifado'::text    AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_almoxarifado
UNION ALL
SELECT 'registros_bebedouros'::text      AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_bebedouros
UNION ALL
SELECT 'registros_clima'::text           AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_clima
UNION ALL
SELECT 'registros_enfermaria'::text      AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_enfermaria
UNION ALL
SELECT 'registros_entrada_insumos'::text AS caderneta, id::text, fazenda_id, nome_usuario, NULL::date AS data, created_at, deleted_at FROM public.registros_entrada_insumos
UNION ALL
SELECT 'registros_leitura_cocho'::text   AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_leitura_cocho
UNION ALL
SELECT 'registros_limpeza'::text         AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_limpeza
UNION ALL
SELECT 'registros_manutencao_maquinas'::text AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_manutencao_maquinas
UNION ALL
SELECT 'registros_maternidade'::text     AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_maternidade
UNION ALL
SELECT 'registros_morte'::text           AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_morte
UNION ALL
SELECT 'registros_movimentacao'::text    AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_movimentacao
UNION ALL
SELECT 'registros_oferta_trato'::text    AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_oferta_trato
UNION ALL
SELECT 'registros_operacoes_maquinas'::text AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_operacoes_maquinas
UNION ALL
SELECT 'registros_pastagens'::text       AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_pastagens
UNION ALL
SELECT 'registros_problemas'::text       AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_problemas
UNION ALL
SELECT 'registros_rodeio'::text          AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_rodeio
UNION ALL
SELECT 'registros_saida_insumos'::text   AS caderneta, id::text, fazenda_id, nome_usuario, NULL::date AS data, created_at, deleted_at FROM public.registros_saida_insumos
UNION ALL
SELECT 'registros_suplementacao'::text   AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_suplementacao
UNION ALL
SELECT 'registros_fabrica_confinamento'::text AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_fabrica_confinamento
UNION ALL
SELECT 'registros_pesagem'::text         AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.registros_pesagem
UNION ALL
SELECT 'movimentacoes_combustivel'::text AS caderneta, id::text, fazenda_id, NULL::text AS nome_usuario, data, created_at, NULL::timestamptz AS deleted_at FROM public.movimentacoes_combustivel
UNION ALL
SELECT 'ordens_servico'::text            AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.ordens_servico
UNION ALL
SELECT 'os_recebimentos'::text           AS caderneta, id::text, fazenda_id, nome_usuario, data, created_at, deleted_at FROM public.os_recebimentos;
