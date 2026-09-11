-- Adiciona controle de expediente (horario de atividade) na fazenda e override por funcionario.
-- So tem efeito quando controle_acesso_habilitado = true. Fora do expediente, o PWA bloqueia acesso.

-- Expediente da fazenda (padrao para todos os funcionarios)
ALTER TABLE fazendas
  ADD COLUMN IF NOT EXISTS expediente_habilitado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS expediente_timezone TEXT DEFAULT 'America/Cuiaba',
  ADD COLUMN IF NOT EXISTS expediente_dias JSONB;

-- Override opcional por funcionario (null = herda o padrao da fazenda)
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS expediente_override JSONB;

COMMENT ON COLUMN fazendas.expediente_habilitado IS 'Quando true, o app bloqueia acesso fora do expediente (apenas se controle_acesso_habilitado tambem for true)';
COMMENT ON COLUMN fazendas.expediente_timezone IS 'Timezone IANA para calculo do horario local da fazenda (ex: America/Cuiaba)';
COMMENT ON COLUMN fazendas.expediente_dias IS 'JSONB com horarios por dia da semana (0=dom..6=sab). Cada dia: {ativo: bool, inicio: "HH:MM", fim: "HH:MM"}';
COMMENT ON COLUMN funcionarios.expediente_override IS 'Override de expediente por funcionario. Null = herda padrao da fazenda. Mesma estrutura de expediente_dias';

-- Estende o trigger de invalidacao de cache para disparar quando campos de expediente mudarem.
-- O PWA percebe a mudanca via rbac_versao e recarrega os dados do expediente.
CREATE OR REPLACE FUNCTION incrementar_rbac_versao_on_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.controle_acesso_habilitado IS DISTINCT FROM OLD.controle_acesso_habilitado
     OR NEW.expediente_habilitado IS DISTINCT FROM OLD.expediente_habilitado
     OR NEW.expediente_dias IS DISTINCT FROM OLD.expediente_dias
     OR NEW.expediente_timezone IS DISTINCT FROM OLD.expediente_timezone THEN
    NEW.rbac_versao := OLD.rbac_versao + 1;
  END IF;
  RETURN NEW;
END;
$$;
