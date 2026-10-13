# Farm Plan · Gesta'Up

Aplicativo de planejamento e execução de tarefas de fazendas: plano anual, plano do mês, tarefas da semana, baixas diárias feitas pela equipe no celular (inclusive sem internet), avaliação de desempenho, contrato de resultados, indicadores e relatórios para o produtor.

Origem: repo `weltoncabralgestaup/farmplan`, importado como snapshot (sem histórico) para `apps/farmplan` em 2026-10-07.

## Stack

- Site **estático**: HTML + JS vanilla (ES modules) + `estilo.css`. Não tem `package.json`, build, TypeScript, lint nem testes. O pnpm e os scripts da raiz (`pnpm -r ...`) ignoram esta pasta.
- Banco/Auth/Storage/Realtime: Supabase, projeto **FarmPlan** `tcjrztbivvosrxjnjqom` (sa-east-1). É um banco **separado** do painel (`nrwljcvhwbezmoummxbl`).
- Cliente: `vendor/supabase.mjs` (cópia local para abrir offline). Planilhas: `vendor/xlsx.full.min.js`.
- PWA: `manifest.json` + `sw.js` + fila offline em IndexedDB (`offline.js`).
- Hospedagem: Vercel, projeto `farmplan` (https://farmplan-fawn.vercel.app), sem build; `vercel.json` define headers de segurança, `Cache-Control: no-cache` no `sw.js` e rewrites `/instalar` e `/apresentacao`.

## Rodar localmente

```
cd apps/farmplan
npx serve .      # qualquer servidor estático; o service worker só registra em https ou localhost
```

Não existe ambiente de dev separado: o código local fala com o Supabase de produção (`comum.js`). Cuidado ao testar com dados reais.

## Telas (arquivos `*.html`)

| Arquivo | Função |
|---|---|
| `index.html` | App do dia (colaborador): tarefas, baixa, Não Deu, Fora do Plano, fotos/vídeo/áudio, cronômetro, relatório do dia |
| `painel.html` | Painel do gestor: baixas do dia, quem mandou relatório |
| `consultor.html` | Painel do consultor: todas as fazendas da consultoria, alertas |
| `plano.html` / `mes.html` / `semana-pdf.html` | Plano anual, plano mensal, plano semanal em PDF |
| `reuniao.html` | Reunião de 10 min e compromisso semanal dos líderes |
| `execucao.html` | Tempo de execução e meta das atividades |
| `imprevistos.html` | Imprevistos e Fora do Plano |
| `avaliacao.html` / `contrato.html` / `equipe.html` | Avaliação de desempenho, contrato de resultados, equipe do mês |
| `indicadores.html` | Painel de bordo (indicadores com meta e farol) |
| `relatorio.html` / `relatorios.html` | Relatório mensal e central de relatórios |
| `galeria.html` | Fotos, vídeos e áudios enviados pelo app |
| `cadastros.html` | Pessoas, equipes, setores, funções, cargos, biblioteca, acessos (maior tela, ~124 KB) |
| `nova-fazenda.html` / `importar.html` | Criar fazenda e importar planilha de outro cliente |
| `instalar.html` / `aplicativo.html` / `apresentacao.html` | Instalação do PWA, página do app, apresentação comercial |

## Módulos JS compartilhados

- `comum.js`: cliente Supabase (URL e chave publishable fixas no código), ano/semanas ISO, constantes (`STATUS`, `PAPEL`, `TIPOS`), `tc()` (regra de caixa de texto), registro do service worker.
- `offline.js`: cache local e **fila de envio** (baixas, Fora do Plano, mídia, relatório) enviada em ordem quando volta o sinal.
- `midia.js` (fotos/vídeo/áudio → Storage `midias`), `tempo.js` (cronômetro), `voz.js` (ditado), `pop.js` (POP em PDF, bucket `pops`), `ajuda.js` (ajuda contextual), `excel.js` (import/export).
- `sw.js`: cache das telas; **ao alterar arquivos do app, incrementar `VERSAO`** (hoje `farmplan-v64`) e manter a lista `BASE` em dia. Nunca guarda chamadas `*.supabase.co`.

## Modelo de dados

Hierarquia multi-tenant: `contas` (consultoria) → `fazendas` → `pessoas`, `equipes`, `setores`, `atividades`, `planejamento` (semana a semana), `baixas`. Acesso por `acessos` (usuário × fazenda × papel) com RLS desde o 003.

Papéis: `consultor` (vê todas as fazendas da conta), `gestor`, `administrativo`, `lider`, `colaborador`. Salário (`remuneracao`) só para gestor, administrativo e consultor.

Tabelas: contas, fazendas, acessos, pessoas, setores, equipes, equipe_membros, atividades, planejamento, baixas, viradas, criterios, contrato_itens, avaliacoes, funcoes, cargos, remuneracao, compromissos, fora_do_plano, biblioteca, indicadores, indicador_valores, midias, execucoes, relatorios_dia, consultores, avisos_inscricoes.

Regras de negócio relevantes:
- Virada de semana toda segunda 06:00 UTC (`virar_semana`, 011): o que teve baixa "Feito" em todos os dias vira Concluído; o resto fica Atrasado e é replicado na semana seguinte.
- Status muda sozinho conforme as baixas (030) e a tela atualiza via Realtime (029).
- Nota do colaborador = `peso_tarefas`% (padrão 70) das funções + restante dos comportamentos (010); frequência da avaliação por fazenda (034).
- Login de campo sem e-mail: usuário vira `usuario@campo.gestaup.com` (Edge Function `criar-acesso`).

## Migrações SQL

`supabase/001` a `035` + `conferir_configuracao.sql` são scripts manuais **numerados e idempotentes**, rodados no SQL Editor do Supabase do Farm Plan. **Não** usam `supabase db push` e **não** ficam em `supabase/migrations/` da raiz (aquele é do banco do painel; misturar quebraria o `db push` de lá). Próxima: `036_*.sql`, mantendo comentários em pt-BR e a regra "pode rodar mais de uma vez". `conferir_configuracao.sql` lista o que está ligado (extensões `pg_cron`/`pg_net`, tabelas, funções).

## Edge Functions

Fontes em `supabase/funcoes/*.ts` (nome fora do padrão da CLI, que espera `supabase/functions/<nome>/index.ts`). Ambas com **Verify JWT desligado** (conferem o usuário internamente).

- `criar-acesso`: cria/troca senha de login de campo e cadastra consultores. Só gestor/consultor da fazenda. Usa a service role do próprio Supabase.
- `enviar-avisos`: push 06:30 (tarefas do dia) e 17:00 (relatório do dia); alerta do consultor 08:00; relatório mensal em PDF por e-mail (dia 1º, Resend); relatório semanal em PDF no WhatsApp (segunda 07:00, Cloud API da Meta). Modos de teste: `{ teste: true }`, `{ mensal_teste: <fazenda_id> }`, `{ semanal_teste: <fazenda_id> }`.

Para publicar após editar: copiar o arquivo para `supabase/functions/<nome>/index.ts` num diretório de trabalho e `supabase functions deploy <nome> --no-verify-jwt --project-ref tcjrztbivvosrxjnjqom`.

Secrets (Edge Functions › Secrets): `VAPID_PUBLICA`, `VAPID_PRIVADA`, `AVISO_CHAVE`, `SITE_URL` (= https://farmplan-fawn.vercel.app), `RESEND_API_KEY`, `EMAIL_REMETENTE`; opcionais para WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_MODELO`, `WHATSAPP_IDIOMA`, `WHATSAPP_VERSAO`. O código tem fallback para o domínio antigo `farmplan-lime.vercel.app` se `SITE_URL` faltar.

Agendamentos (`pg_cron`): `farmplan-virada-semanal` está na migration 011 e `farmplan-relatorio-semanal` na 028. Os demais (manhã, tarde, consultor, mensal) ficam fora do repo, num "arquivo de Segredos", porque levam a `AVISO_CHAVE` e a URL da função.

## Pendências e riscos conhecidos

- **Conferir os crons no projeto novo**: rodar `conferir_configuracao.sql` e `select * from cron.job;`. Jobs migrados do projeto antigo podem chamar a URL da função do projeto de origem; recriá-los apontando para `https://tcjrztbivvosrxjnjqom.supabase.co/functions/v1/enviar-avisos` com a `AVISO_CHAVE` atual.
- A chave publishable e a URL do Supabase estão fixas em `comum.js` (aceitável: a chave é pública e a segurança está nas RLS). Trocar de projeto exige editar esse arquivo, o que também invalida o cache do `sw.js` (subir `VERSAO`).
- Sem testes automatizados nem CI. Validar manualmente login, baixa offline e sincronização depois de qualquer mudança em `offline.js`/`sw.js`.
- Auth › URL Configuration deve conter https://farmplan-fawn.vercel.app (Site URL e Redirect URLs).
- Vercel: deploy hoje é feito pela CLI. Para deploy por push, conectar o repo em Settings › Git e definir Root Directory `apps/farmplan`.
