-- get_atividades_funcionario passa a retornar justificativa, justificada_at e atrasada.
-- PWA precisa de justificativa para exibir o texto no card (RPC nao retornava,
-- entao o merge online sempre zerava o campo) e de atrasada para exibir badge
-- "Atrasada" em atividades pendentes com data_fim vencida.

DROP FUNCTION IF EXISTS public.get_atividades_funcionario(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_atividades_funcionario(p_fazenda_id uuid, p_funcionario_id uuid)
RETURNS TABLE(
  id uuid,
  atividade_id uuid,
  status_individual text,
  inicio_at timestamp with time zone,
  fim_at timestamp with time zone,
  detalhamento text,
  justificativa text,
  justificada_at timestamp with time zone,
  tempo_gasto_segundos integer,
  titulo text,
  descricao text,
  local text,
  data_inicio date,
  data_fim date,
  prioridade integer,
  status text,
  nao_prevista boolean,
  atrasada boolean,
  setor_nome text,
  foto_url text,
  latitude double precision,
  longitude double precision,
  gps_accuracy double precision
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT
    af.id, af.atividade_id, af.status_individual, af.inicio_at, af.fim_at,
    af.detalhamento, af.justificativa, af.justificada_at, af.tempo_gasto_segundos,
    a.titulo, a.descricao, a.local, a.data_inicio, a.data_fim,
    a.prioridade, a.status, a.nao_prevista, a.atrasada,
    s.nome AS setor_nome,
    af.foto_url, af.latitude, af.longitude, af.gps_accuracy
  FROM atividade_funcionarios af
  JOIN atividades a ON a.id = af.atividade_id
  LEFT JOIN setores s ON s.id = a.setor_id
  WHERE a.fazenda_id = p_fazenda_id
    AND af.funcionario_id = p_funcionario_id
    AND a.deleted_at IS NULL
  ORDER BY a.data_inicio DESC, a.prioridade ASC;
$function$;
