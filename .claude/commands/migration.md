---
description: Criar e aplicar migration estrutural seguindo o fluxo obrigatório
argument-hint: <nome-da-migration>
---

Criar a migration estrutural "$ARGUMENTS" seguindo rigorosamente o fluxo do AGENTS.md:

1. Se o SQL ainda não foi definido na conversa, perguntar o que a migration deve fazer antes de escrever. Confirmar que é estrutural (CREATE/ALTER TABLE, trigger, policy, índice, function); se for dado operacional pontual, parar e avisar que deve ir direto via MCP, sem arquivo.
2. Gerar timestamp no formato AAAAMMDDHHMMSS e criar `supabase/migrations/<timestamp>_$ARGUMENTS.sql`.
3. Rodar `supabase db push` para aplicar e registrar em `schema_migrations`.
4. Se falhar com "Remote migration versions not found in local migrations directory", criar placeholder local com o version remoto e rodar `supabase migration repair --status applied <version>` para as versões já aplicadas, depois repetir o push.
5. Commitar o arquivo com mensagem direta `-m "..."` (sem heredoc) e pushar.

Nunca usar `apply_migration` do MCP para migration estrutural. Antes de qualquer SQL que toque dados de fazenda, restringir à fazenda de testes `d649c65e-16ab-4b77-a84b-df937aa41cc3` ou pedir autorização explícita.
