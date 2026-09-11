-- Adiciona coluna tipo_registro na tabela registros_enfermaria
-- para classificar registros como Curativo ou Preventivo.
-- O tipo é do registro, não do tratamento, visto que um registro
-- pode conter 1+ medicamentos/tratamentos.

ALTER TABLE registros_enfermaria
ADD COLUMN IF NOT EXISTS tipo_registro text;
