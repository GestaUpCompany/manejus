-- ============================================================================
-- registros_pastagens: recria tempo_ocupacao / tempo_vedacao como text
-- ============================================================================
-- Contexto: as colunas foram criadas como integer em 20260508194751 e dropadas
-- no mesmo dia em 20260508195134 — tipo errado: o PWA grava texto formatado
-- ("17 dias/410 horas", "Primeiro uso", "Menos de 1 hora"), não inteiro.
-- Sem as colunas, o sync descartava os campos e o texto compartilhado saía
-- "Tempo de ocupação: —" / "Tempo de vedação: —" em todo registro.
--
-- A semântica é snapshot no momento do manejo (calculado no PastagensPage a
-- partir da última entrada/saída do pasto), por isso coluna texto gravada pelo
-- aparelho em vez de valor derivado no banco.
-- ============================================================================

ALTER TABLE registros_pastagens
  ADD COLUMN IF NOT EXISTS tempo_ocupacao text,
  ADD COLUMN IF NOT EXISTS tempo_vedacao text;
