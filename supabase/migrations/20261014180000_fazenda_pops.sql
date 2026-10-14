-- POPs personalizados por fazenda: bucket público (URLs estáveis, cacheáveis offline) + tabela de páginas.
-- Retrocompatível: sem linhas em fazenda_pops, o PWA continua usando as imagens padrão de public/docs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pops',
  'pops',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública do bucket (público por natureza); escrita só com acesso à fazenda da pasta.
DROP POLICY IF EXISTS "pops-insert" ON storage.objects;
CREATE POLICY "pops-insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pops'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "pops-update" ON storage.objects;
CREATE POLICY "pops-update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'pops'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'pops'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "pops-delete" ON storage.objects;
CREATE POLICY "pops-delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'pops'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN public.user_has_fazenda_access(((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE TABLE IF NOT EXISTS public.fazenda_pops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug IN ('maternidade', 'pastagens', 'cocho', 'bebedouros', 'fezes', 'escore')),
  ordem integer NOT NULL CHECK (ordem >= 1),
  path text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.fazenda_pops IS 'Páginas (imagens) dos POPs personalizados por fazenda. Sem linhas para o slug, o PWA usa o POP padrão de public/docs.';

CREATE UNIQUE INDEX IF NOT EXISTS fazenda_pops_slug_ordem_uq
  ON public.fazenda_pops (fazenda_id, slug, ordem) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fazenda_pops_fazenda_idx ON public.fazenda_pops (fazenda_id);

ALTER TABLE public.fazenda_pops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fazenda_pops_select" ON public.fazenda_pops;
CREATE POLICY "fazenda_pops_select" ON public.fazenda_pops
FOR SELECT TO authenticated
USING (public.user_has_fazenda_access(fazenda_id));

DROP POLICY IF EXISTS "fazenda_pops_insert" ON public.fazenda_pops;
CREATE POLICY "fazenda_pops_insert" ON public.fazenda_pops
FOR INSERT TO authenticated
WITH CHECK (public.user_has_fazenda_access(fazenda_id));

DROP POLICY IF EXISTS "fazenda_pops_update" ON public.fazenda_pops;
CREATE POLICY "fazenda_pops_update" ON public.fazenda_pops
FOR UPDATE TO authenticated
USING (public.user_has_fazenda_access(fazenda_id))
WITH CHECK (public.user_has_fazenda_access(fazenda_id));

DROP POLICY IF EXISTS "fazenda_pops_delete" ON public.fazenda_pops;
CREATE POLICY "fazenda_pops_delete" ON public.fazenda_pops
FOR DELETE TO authenticated
USING (public.user_has_fazenda_access(fazenda_id));
