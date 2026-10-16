DROP INDEX IF EXISTS public.eventos_reprodutivos_local_id_key;
ALTER TABLE public.eventos_reprodutivos DROP CONSTRAINT IF EXISTS eventos_reprodutivos_origem_check;
ALTER TABLE public.eventos_reprodutivos DROP COLUMN IF EXISTS origem, DROP COLUMN IF EXISTS local_id;
