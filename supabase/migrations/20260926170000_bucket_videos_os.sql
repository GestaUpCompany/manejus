-- ============================================================================
-- Vídeo de descarregamento (laudo de recebimento de compra)
-- O bucket 'documentos-os' aceita só imagem/PDF até 15 MB; vídeos de
-- descarregamento são maiores e vão para bucket próprio 'videos-os'.
-- os_documentos.bucket registra em qual bucket o arquivo está (default
-- 'documentos-os' mantém compatibilidade com os documentos já gravados).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'videos-os',
  'videos-os',
  false,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'],
  524288000 -- 500 MB
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "videos-os-read" ON storage.objects;
CREATE POLICY "videos-os-read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'videos-os');

DROP POLICY IF EXISTS "videos-os-upload" ON storage.objects;
CREATE POLICY "videos-os-upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos-os');

DROP POLICY IF EXISTS "videos-os-update" ON storage.objects;
CREATE POLICY "videos-os-update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'videos-os')
WITH CHECK (bucket_id = 'videos-os');

DROP POLICY IF EXISTS "videos-os-delete" ON storage.objects;
CREATE POLICY "videos-os-delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'videos-os');

ALTER TABLE public.os_documentos
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'documentos-os';
