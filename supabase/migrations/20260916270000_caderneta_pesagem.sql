-- Caderneta Pesagem (PWA): sessão de manejo cronometrada com captura animal a animal.
-- 1) registros_pesagem: uma linha por animal, campos de sessão desnormalizados
-- 2) individuos.idade_era (padrão IND-EA)
-- 3) individuos.categoria: CHECK ampliado para o vocabulário de lote_categorias
-- 4) trigger de upsert em individuos a partir de registros_pesagem

-- ============================================================================
-- 1) Tabela registros_pesagem
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.registros_pesagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id text UNIQUE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  dispositivo_id uuid REFERENCES public.dispositivos(id) ON DELETE SET NULL,
  nome_usuario text,
  data timestamp with time zone NOT NULL,
  responsavel text,

  -- Sessão de manejo (desnormalizado em cada linha de animal)
  tipo_manejo text NOT NULL,
  equipe_ajustada boolean,
  balanca_aferida boolean,
  checklist_conferido boolean,
  curral_limpo boolean,
  horario_inicio timestamp with time zone,
  horario_fim timestamp with time zone,
  tempo_total_min numeric,
  tempo_medio_min_cab numeric,

  -- Dados do animal
  id_chip text,
  id_brinco text,
  lote text,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  categoria text,
  sexo text,
  peso_kg numeric,
  raca text,
  idade_era text,
  idade_dias integer,
  acidente boolean,
  manejo_calmo boolean,
  gritaria boolean,
  manejo_agil boolean,
  tempo_preenchimento_seg numeric,
  individuo_id uuid REFERENCES public.individuos(id) ON DELETE SET NULL,

  sync_status text DEFAULT 'pending',
  version integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

ALTER TABLE public.registros_pesagem
  ADD CONSTRAINT registros_pesagem_tipo_manejo_check
    CHECK (tipo_manejo = ANY (ARRAY['abate', 'compra', 'venda_vivo', 'transf_saida', 'transf_entrada', 'apartacao'])),
  ADD CONSTRAINT registros_pesagem_sexo_check
    CHECK (sexo IS NULL OR sexo = ANY (ARRAY['Macho', 'Fêmea'])),
  ADD CONSTRAINT registros_pesagem_idade_era_check
    CHECK (idade_era IS NULL OR idade_era = ANY (ARRAY['0-4m', '5-12m', '13-24m', '25-36m', '>36m'])),
  ADD CONSTRAINT registros_pesagem_ao_menos_um_id_check
    CHECK ((id_chip IS NOT NULL AND id_chip <> '') OR (id_brinco IS NOT NULL AND id_brinco <> ''));

CREATE INDEX IF NOT EXISTS idx_registros_pesagem_fazenda_id ON public.registros_pesagem(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_registros_pesagem_data ON public.registros_pesagem(data);
CREATE INDEX IF NOT EXISTS idx_registros_pesagem_sync_status ON public.registros_pesagem(sync_status);
CREATE INDEX IF NOT EXISTS idx_registros_pesagem_lote_id ON public.registros_pesagem(lote_id);
CREATE INDEX IF NOT EXISTS idx_registros_pesagem_individuo_id ON public.registros_pesagem(individuo_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registros_pesagem_updated_at ON public.registros_pesagem;
CREATE TRIGGER registros_pesagem_updated_at
  BEFORE UPDATE ON public.registros_pesagem
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.registros_pesagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage farm registros_pesagem records" ON public.registros_pesagem;
DROP POLICY IF EXISTS "Users can view farm registros_pesagem records" ON public.registros_pesagem;

CREATE POLICY "Users can manage farm registros_pesagem records"
  ON public.registros_pesagem
  FOR ALL
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  )
  WITH CHECK (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

CREATE POLICY "Users can view farm registros_pesagem records"
  ON public.registros_pesagem
  FOR SELECT
  TO authenticated
  USING (
    fazenda_id IN (
      SELECT uf.fazenda_id
      FROM public.usuario_fazenda uf
      JOIN public.usuarios u ON u.id = uf.usuario_id
      WHERE u.auth_id = auth.uid() AND uf.ativo = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_pesagem TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_pesagem TO anon;

-- ============================================================================
-- 2) individuos.idade_era (padrão IND-EA)
-- ============================================================================
ALTER TABLE public.individuos ADD COLUMN IF NOT EXISTS idade_era text;

ALTER TABLE public.individuos
  ADD CONSTRAINT individuos_idade_era_check
    CHECK (idade_era IS NULL OR idade_era = ANY (ARRAY['0-4m', '5-12m', '13-24m', '25-36m', '>36m']));

-- ============================================================================
-- 3) Categorias de lote passam a ser aceitas em individuos.categoria
-- ============================================================================
ALTER TABLE public.individuos DROP CONSTRAINT individuos_categoria_check;
ALTER TABLE public.individuos
  ADD CONSTRAINT individuos_categoria_check
    CHECK (categoria = ANY (ARRAY[
      'Bezerro ao Pé', 'Bezerra ao Pé', 'Bezerro Desmama', 'Bezerra Desmama',
      'Garrote', 'Novilha', 'Boi Magro', 'Primípara',
      'Vaca Parida', 'Vaca Prenha', 'Vaca Vazia', 'Vaca Descarte', 'Touro',
      'Bezerro', 'Bezerra', 'Boi Gordo', 'Tourinho', 'Tropa', 'Vaca'
    ]));

-- Estende a validação sexo x categoria para os novos valores
CREATE OR REPLACE FUNCTION public.trg_individuos_validar_sexo_categoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
BEGIN
  IF NEW.sexo = 'Macho' AND NEW.categoria = ANY (ARRAY['Bezerra ao Pé', 'Bezerra Desmama', 'Novilha', 'Primípara', 'Vaca Parida', 'Vaca Prenha', 'Vaca Vazia', 'Vaca Descarte', 'Bezerra', 'Vaca', 'Tropa']) THEN
    RAISE EXCEPTION 'Categoria % não é permitida para indivíduos do sexo Macho', NEW.categoria;
  END IF;

  IF NEW.sexo = 'Fêmea' AND NEW.categoria = ANY (ARRAY['Bezerro ao Pé', 'Bezerro Desmama', 'Garrote', 'Boi Magro', 'Touro', 'Bezerro', 'Boi Gordo', 'Tourinho']) THEN
    RAISE EXCEPTION 'Categoria % não é permitida para indivíduos do sexo Fêmea', NEW.categoria;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 4) Upsert em individuos a partir de registros_pesagem
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_registros_pesagem_upsert_individuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Cuiaba'
AS $function$
DECLARE
  v_individuo_id uuid;
BEGIN
  -- Localiza indivíduo existente pelo chip ou brinco na mesma fazenda (chip tem prioridade)
  SELECT i.id INTO v_individuo_id
  FROM public.individuos i
  WHERE i.fazenda_id = NEW.fazenda_id
    AND i.deleted_at IS NULL
    AND (
      (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip)
      OR (NEW.id_brinco IS NOT NULL AND NEW.id_brinco <> '' AND i.id_brinco = NEW.id_brinco)
    )
  ORDER BY
    (NEW.id_chip IS NOT NULL AND NEW.id_chip <> '' AND i.id_chip = NEW.id_chip) DESC,
    i.created_at
  LIMIT 1;

  IF v_individuo_id IS NOT NULL THEN
    UPDATE public.individuos
    SET
      id_chip = COALESCE(NULLIF(NEW.id_chip, ''), id_chip),
      id_brinco = COALESCE(NULLIF(NEW.id_brinco, ''), id_brinco),
      sexo = COALESCE(NEW.sexo, sexo),
      categoria = COALESCE(NEW.categoria, categoria),
      raca = COALESCE(NEW.raca, raca),
      lote_atual = COALESCE(NEW.lote_id, lote_atual),
      peso_atual_kg = COALESCE(NEW.peso_kg, peso_atual_kg),
      idade_era = COALESCE(NEW.idade_era, idade_era),
      idade_atual_dias = COALESCE(NEW.idade_dias, idade_atual_dias),
      updated_at = now()
    WHERE id = v_individuo_id;
  ELSE
    INSERT INTO public.individuos (
      fazenda_id, id_chip, id_brinco, sexo, categoria, raca,
      lote_atual, peso_atual_kg, idade_era, idade_atual_dias,
      status, origem
    ) VALUES (
      NEW.fazenda_id,
      NULLIF(NEW.id_chip, ''),
      NULLIF(NEW.id_brinco, ''),
      NEW.sexo,
      NEW.categoria,
      NEW.raca,
      NEW.lote_id,
      NEW.peso_kg,
      NEW.idade_era,
      NEW.idade_dias,
      'Vivo',
      CASE NEW.tipo_manejo
        WHEN 'compra' THEN 'Compra'
        WHEN 'transf_entrada' THEN 'Transferência'
        ELSE 'Cadastro Manual'
      END
    )
    RETURNING id INTO v_individuo_id;
  END IF;

  NEW.individuo_id := v_individuo_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_registros_pesagem_upsert_individuo ON public.registros_pesagem;
CREATE TRIGGER trg_registros_pesagem_upsert_individuo
  BEFORE INSERT ON public.registros_pesagem
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_registros_pesagem_upsert_individuo();
