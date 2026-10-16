-- ROLLBACK de 20261015170000_individuos_revoga_privilegios_excedentes.sql
-- NÃO fica em supabase/migrations/ de propósito. Restaura os privilégios padrão do Supabase em individuos.
GRANT ALL ON TABLE public.individuos TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.individuos TO authenticated;
