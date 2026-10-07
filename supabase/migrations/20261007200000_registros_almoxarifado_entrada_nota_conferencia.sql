-- Entrada de almoxarifado no layout novo do PWA: foto da nota fiscal em foto_url (ou sem_nota = true)
-- e conferencia do recebimento. Colunas nullable: saidas, devolucoes e entradas antigas ficam NULL.
-- A validade de medicamentos fica por item, dentro do JSON de itens (sem coluna nova).
ALTER TABLE public.registros_almoxarifado
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS sem_nota boolean,
  ADD COLUMN IF NOT EXISTS chegou_tudo boolean,
  ADD COLUMN IF NOT EXISTS item_danificado boolean;
