-- Remove o campo setor de registros_limpeza (o PWA deixou de enviar o campo).
ALTER TABLE public.registros_limpeza DROP COLUMN IF EXISTS setor;
