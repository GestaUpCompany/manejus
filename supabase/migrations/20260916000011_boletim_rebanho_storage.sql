-- Permite armazenar a planilha-fonte anual do Boletim de Rebanho no bucket
-- privado já usado pelas capas do infográfico.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ]
WHERE id = 'relatorios-gerais';
