-- ============================================================================
-- Indivíduos / Fase 1.1: tabela de domínio de categorias + aliases
-- ============================================================================
-- Achado: lote_categorias.categoria (chave do agregado) usa 'vaca', 'garrote', 'bezerro ao pé'..., enquanto
-- individuos.categoria usa 'Vaca Parida', 'Vaca Vazia', 'Bezerro Desmama'... Só 226 de 552 animais Vivos casavam
-- direto com uma categoria ativa do lote; com o mapeamento abaixo passam a 349 (194 não têm lote, 9 não têm categoria).
-- "Parida/Vazia/Prenha" são estados reprodutivos (v_status_reprodutivo os deriva dos eventos), não categorias.
--
-- Decisão do usuário (16/10/2026): aliases, sem reescrever individuos.categoria (não mexe nos triggers de
-- maternidade nem nas listas do PWA).
--   * categorias_animais   categoria canônica = exatamente a chave usada em lote_categorias.categoria (minúscula)
--   * categoria_aliases    texto alternativo (minúsculo) -> categoria canônica
--   * categoria_canonica(text) devolve a canônica de um texto (alias, ou a própria se já for canônica), ou NULL
-- Nenhuma tabela existente é alterada e nenhum dado é reescrito. Somente leitura para authenticated; anon sem acesso.
-- Rollback: supabase/rollbacks/20261016100000_categorias_animais_dominio_e_aliases_rollback.sql
-- ============================================================================

CREATE TABLE public.categorias_animais (
  slug text PRIMARY KEY CHECK (slug = lower(btrim(slug)) AND slug <> ''),
  nome text NOT NULL,
  sexo text CHECK (sexo IN ('Macho', 'Fêmea')),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categoria_aliases (
  alias text PRIMARY KEY CHECK (alias = lower(btrim(alias)) AND alias <> ''),
  slug text NOT NULL REFERENCES public.categorias_animais (slug),
  motivo text
);

INSERT INTO public.categorias_animais (slug, nome, sexo, ordem) VALUES
  ('bezerro ao pé', 'Bezerro ao Pé', 'Macho', 10),
  ('bezerra ao pé', 'Bezerra ao Pé', 'Fêmea', 11),
  ('bezerro', 'Bezerro', 'Macho', 20),
  ('bezerra', 'Bezerra', 'Fêmea', 21),
  ('garrote', 'Garrote', 'Macho', 30),
  ('novilha', 'Novilha', 'Fêmea', 31),
  ('boi magro', 'Boi Magro', 'Macho', 40),
  ('boi gordo', 'Boi Gordo', 'Macho', 50),
  ('tourinho', 'Tourinho', 'Macho', 60),
  ('touro', 'Touro', 'Macho', 61),
  ('vaca', 'Vaca', 'Fêmea', 70);

INSERT INTO public.categoria_aliases (alias, slug, motivo) VALUES
  ('vaca parida', 'vaca', 'estado reprodutivo (v_status_reprodutivo)'),
  ('vaca vazia', 'vaca', 'estado reprodutivo (v_status_reprodutivo)'),
  ('vaca prenha', 'vaca', 'estado reprodutivo (v_status_reprodutivo)'),
  ('vaca descarte', 'vaca', 'destino, não categoria'),
  ('primípara', 'vaca', 'vaca de 1º parto'),
  ('primipara', 'vaca', 'vaca de 1º parto (sem acento)'),
  ('bezerro desmama', 'bezerro', 'fase, mesma categoria do agregado'),
  ('bezerra desmama', 'bezerra', 'fase, mesma categoria do agregado'),
  ('bezerro ao pe', 'bezerro ao pé', 'sem acento'),
  ('bezerra ao pe', 'bezerra ao pé', 'sem acento');

CREATE OR REPLACE FUNCTION public.categoria_canonica(p_categoria text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT a.slug FROM public.categoria_aliases a WHERE a.alias = lower(btrim(p_categoria))),
    (SELECT c.slug FROM public.categorias_animais c WHERE c.slug = lower(btrim(p_categoria)))
  )
$function$;

ALTER TABLE public.categorias_animais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_animais_leitura ON public.categorias_animais FOR SELECT TO authenticated USING (true);
CREATE POLICY categoria_aliases_leitura ON public.categoria_aliases FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.categorias_animais, public.categoria_aliases FROM anon, authenticated;
GRANT SELECT ON public.categorias_animais, public.categoria_aliases TO authenticated;
REVOKE EXECUTE ON FUNCTION public.categoria_canonica(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.categoria_canonica(text) TO authenticated;
