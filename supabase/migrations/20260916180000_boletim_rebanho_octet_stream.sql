-- Alguns navegadores classificam planilhas Excel como application/octet-stream.
-- O frontend envia o MIME pela extensão, mas o bucket também aceita esse fallback
-- para não rejeitar arquivos Excel legítimos durante o upload.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream'
]
WHERE id = 'relatorios-gerais';
