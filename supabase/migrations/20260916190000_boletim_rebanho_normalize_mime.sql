-- O Storage normaliza o MIME do XLSM para minúsculas antes de validar
-- allowed_mime_types. Mantemos a lista alinhada ao valor efetivamente recebido.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream'
]
WHERE id = 'relatorios-gerais';
