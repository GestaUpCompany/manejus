-- Enfermaria: guarda o ID manejo do animal (antes só brinco e chip eram gravados)
ALTER TABLE public.registros_enfermaria
  ADD COLUMN IF NOT EXISTS id_manejo text;

COMMENT ON COLUMN public.registros_enfermaria.id_manejo IS 'ID manejo do animal informado na Enfermaria (o animal pode não estar no cadastro)';
