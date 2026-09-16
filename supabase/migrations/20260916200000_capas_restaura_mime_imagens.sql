-- A migration 20260916000011 substituiu allowed_mime_types em vez de
-- acrescentar, removendo image/png, image/jpeg e image/webp usados pelas
-- capas do infografico. Restaura a lista completa: imagens + planilhas.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream'
]
WHERE id = 'relatorios-gerais';
