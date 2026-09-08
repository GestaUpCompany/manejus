# Oportunidades de melhoria de frontend

Levantamento feito em 2026-09-07 a partir de análise sistemática do codebase em `src/`.
Cada item inclui problema, evidência (arquivo e linha), solução proposta, impacto e esforço.

---

## 1. ~~Performance: bundle de 5.9 MB sem code splitting~~ (concluído)

**Problema:** `App.tsx` importa todas as ~70 páginas estaticamente no topo do arquivo. Nenhum `React.lazy`, nenhum `Suspense`, nenhum `manualChunks` no Vite. O usuário que entra no dashboard carrega o código de todas as cadernetas, mapa da fazenda, admin, relatórios públicos e assistente de IA, mesmo sem acessar nenhuma delas.

**Evidência:** `src/App.tsx` linhas 1-101 mostram os 100 imports estáticos. `src/vite.config.ts` está na configuração padrão sem `manualChunks`. Build warning confirma chunk de 5.9 MB.

**Páginas mais pesadas (candidatas prioritárias a code split):**
- `src/pages/controller/Lotes.tsx` (3.854 linhas)
- `src/pages/controller/Atividades.tsx` (1.766 linhas)
- `src/pages/controller/MonitoramentoAtividades.tsx` (1.362 linhas)
- `src/pages/controller/Dashboard.tsx` (503 linhas)

**Solução:** Converter imports de página para `React.lazy(() => import(...))`, envolver `<Routes>` em `<Suspense fallback={<PageSkeleton />}>`, e configurar `manualChunks` no `vite.config.ts` agrupando por domínio (controller-core, cadernetas, admin, public). Adicionar `<Route path="*" element={<NotFound />} />` para 404.

**Impacto:** alto. **Esforço:** médio.

---

## 2. ~~Validação de formulários via `alert()` em vez de feedback inline~~ (concluído)

**Problema:** `Lotes.tsx` tem 14 chamadas de `alert()` para validação, `Atividades.tsx` tem 8, `CadastrosAuxiliares.tsx` tem 7. O usuário recebe um popup nativo do navegador que bloqueia a página, não destaca qual campo tem problema, e exige um clique para dispensar.

**Evidência:**
- `src/pages/controller/Lotes.tsx` linhas 1076, 1084, 1089, 1096, 1148, 1150, 1178, 1193, 1385, 1806, 1820, 1832, 1841, 2685
- `src/pages/controller/Atividades.tsx` linhas 530, 534, 540, 589, 629-631, 653, 717, 734
- `src/pages/controller/CadastrosAuxiliares.tsx` linhas 544, 566, 581, 599, 697, 706, 752

**Inconsistência:** `src/pages/controller/IndividuoNovo.tsx` já usa o padrão correto com `errors`/`setErrors` (linhas 72, 266-267, 325-326, 341-345, 393). `src/pages/admin/EditarFazenda.tsx` e `NovaFazenda.tsx` também. Os componentes `Input.tsx` (linha 3) e `Select.tsx` (linha 18) já aceitam prop `error` para borda vermelha e mensagem inline.

**Solução:** Migrar `Lotes.tsx`, `Atividades.tsx` e `CadastrosAuxiliares.tsx` para o padrão `errors`/`setErrors` já existente em `IndividuoNovo.tsx`.

**Impacto:** alto. **Esforço:** médio.

---

## 3. ~~Ausência de sistema de toast global~~ (concluído)

**Problema:** Não existe toast. `alert()` é o principal meio de feedback em 21 arquivos. `console.error` aparece 442 vezes como fallback silencioso. `FaixasCategorias.tsx` implementa um toast próprio local (linhas 719-735) porque não havia alternativa. Operações de sucesso (salvar, excluir, recategorizar) não dão feedback visual ao usuário.

**Solução:** Criar `ToastProvider` + `useToast()` com variantes success/error/warning/info. Substituir `alert()` de erro por `toast.error()`, adicionar `toast.success()` em operações de gravação bem-sucedidas. Pode usar `sonner` (1.2 kB) ou construir um mínimo.

**Impacto:** alto. **Esforço:** baixo para criar o provider, médio para migrar as 21 ocorrências.

---

## 4. ~~Erros de carregamento do Supabase silenciosos nas páginas controller~~ (concluído)

**Problema:** As páginas admin (`SystemHealth.tsx:245`, `FarmMetrics.tsx:165`, `AuditLog.tsx:434`) tratam erro com banner vermelho e botão "Tentar novamente". As páginas controller, que são o core do produto, fazem `console.error` e continuam silenciosamente.

**Casos concretos:**
- `Lotes.tsx` linhas 834-837: seta `loading=false` e retorna sem mostrar nada ao usuário.
- `Dashboard.tsx`: `useDashboardStats` não usa `isError`/`error`; em falha, a UI simplesmente não renderiza os dados.
- `RegistrosMorteDetalhes.tsx` linhas 67-73: loga erro no console e depois exibe "Registro não encontrado" (falso negativo: o registro pode existir, mas o select falhou por RLS ou rede).

**Solução:** Criar `<ErrorState message onRetry />` padronizado, replicar o padrão das páginas admin nas páginas controller, e propagar `error` do `useQuery` no `useDashboardQueries.ts` para o `Dashboard.tsx`.

**Impacto:** médio-alto. **Esforço:** baixo para criar o componente, médio para adotar.

---

## 5. ~~Componentes de estado (loading/empty/error) não padronizados~~ (concluído)

**Problema:** Existem 60+ variações manuais de loading, empty state e error state espalhadas.

**Loading states inconsistentes:**
- `CardSkeleton` em grid de 4 cards: `Lotes.tsx:2122`, `Pastos.tsx:620`, `Medicamentos.tsx:190`, `Funcionarios.tsx:173`, `Insumos.tsx:256`
- `<p>Carregando...</p>` simples: `Dashboard.tsx:35`, `RegistrosMorteDetalhes.tsx:77`, `BebedourosDetalhes.tsx:78`, `FaixasCategorias.tsx:704`, `Relatorios.tsx:217`
- Sem loading explícito: `Individuos.tsx`

**Empty states inconsistentes:**
- `Card` com `p-12`: `Lotes.tsx:3538`, `Medicamentos.tsx:318`, `Funcionarios.tsx:295`, `Pluviometros.tsx:280`
- `Card` com `p-8 sm:p-12`: `Setores.tsx:243`, `Locais.tsx:243`, `Implementos.tsx:243`
- `Card` sem padding: `MaquinasVeiculos.tsx:496` (sem CTA)
- `div` com borda dashed: `MonitoramentoAtividades.tsx:937`
- Texto em `div` com `bg-gray-50`: `ProgramacaoTratos.tsx:530`, `AcompanhamentoTratos.tsx:389`

**Solução:** Criar três componentes padronizados em `components/ui`:
- `<PageSkeleton variant="list|grid|detail" />`
- `<EmptyState title description action icon />`
- `<ErrorState message onRetry />`

Refatorar as páginas para usar esses componentes. As páginas `Registros*` são o melhor ponto de partida porque compartilham a mesma estrutura.

**Impacto:** médio. **Esforço:** baixo para criar, médio para adotar.

---

## 6. ~~Tabelas duplicadas em 43 arquivos sem componente compartilhado~~ (concluído)

**Problema:** Não existe `Table` em `components/ui`. 43 arquivos renderizam `<table>` inline com os mesmos estilos Tailwind repetidos: `min-w-full divide-y divide-gray-200`, `bg-gray-50`, `whitespace-nowrap`, `hover:bg-gray-50`.

**Exemplos:**
- `RegistrosAlimentacao.tsx:288-353`
- `RegistrosMorte.tsx:258-314`
- `RegistrosClima.tsx:217`
- `Bebedouros.tsx:229`
- `Atividades.tsx:965-1132` (usa `min-w-[1360px]` com células editáveis)

**Solução:** Criar `components/ui/Table.tsx` com `Table`, `Thead`, `Tbody`, `Tr`, `Th`, `Td` estilizados. Refatorar as páginas `Registros*` primeiro, pois são praticamente idênticas.

**Impacto:** médio. **Esforço:** baixo para criar, médio para refatorar.

---

## 7. ~~Carregamentos sequenciais que poderiam ser paralelos~~ (concluído)

**Problema:** Várias páginas chamam múltiplas funções de carga sequencialmente no `useEffect`, cada uma sendo um `await` separado ao Supabase, quando poderiam paralelizar com `Promise.all`.

**Casos concretos:**
- `Atividades.tsx` linhas 335-346: chama `loadSetores`, `loadFuncionarios`, `loadPastos`, `loadCurrais`, `loadLocais`, `loadMaquinas`, `loadAtividades`, `loadTemplates` em sequência (8 round trips).
- `MonitoramentoAtividades.tsx` linhas 186-193: chama `loadPrioridades`, `loadFuncionarios`, `loadAtividades`, `loadSessoesAbertas`, `loadImprevistosRecentes` sequencialmente (5 round trips).
- `Lotes.tsx`: apesar de `Promise.all` nos dropdowns (linha 275) e categorias (linha 1503), ainda há awaits sequenciais em `loadData`/`loadLotes` (linhas 823, 842, 878, 893, 897, 917, 952, 963).
- `CadastrosAuxiliares.tsx`: múltiplos `await supabase` em sequência (linhas 416-466 e 498-532).
- `ModulosPastos.tsx`: `await supabase` nas linhas 72, 87, 162, 225, 232 sem `Promise.all`.

**Solução:** Envolver as cargas independentes em `Promise.all`. As que têm dependência entre si ficam sequenciais, mas as independentes paralelizam.

**Impacto:** médio. **Esforço:** baixo.

---

## 8. ~~`window.confirm()` nativo em 4 páginas~~ (concluído)

**Problema:** Quatro páginas usam `window.confirm()` nativo do navegador em vez do `ConfirmModal` compartilhado. O popup nativo é visualmente inconsistente com o resto da aplicação, não permite estilização, e em alguns contextos (PWA) pode ser bloqueado.

**Ocorrências:**
- `Atividades.tsx:1170` (limpar rascunho)
- `CadastrosAuxiliares.tsx:551` (excluir setor)
- `Relatorios.tsx:158` e `:191` (desativar/excluir links públicos)
- `MapaFazenda.tsx:676`, `:750`, `:824`, `:948` (remover estradas, pontos, fábricas, geometria)
- `MapaModais.tsx:14-36`, `:49-79` (modais customizados de confirmação que não reutilizam `ConfirmModal`)

**Solução:** Substituir todas as chamadas de `window.confirm()` por `<ConfirmModal>`.

**Impacto:** baixo-médio. **Esforço:** baixo.

---

## 9. ~~Acessibilidade~~ (concluído)

### Botões de ícone sem `aria-label` ou `title`
- `components/ui/GlobalSearch.tsx:340` (abrir busca)
- `components/ui/GlobalSearch.tsx:380` (fechar busca mobile)
- `components/ui/Notifications.tsx:175` (campainha)
- `components/ui/Notifications.tsx:209` (fechar notificações mobile)
- `components/layout/Header.tsx:64` (menu do usuário)
- `pages/auth/Login.tsx:153` (mostrar/esconder senha)
- `pages/controller/Relatorios.tsx:416` (fechar modal customizado)

### Inputs sem label associado
- `components/ui/Input.tsx:6-19` (label visual sem `htmlFor` e input sem `id`)
- `pages/auth/Login.tsx:109` (e-mail) e `:143` (senha)
- `components/ui/GlobalSearch.tsx:369` (campo de busca)
- Padrão recorrente em várias páginas.

### Modais sem focus trap / sem role e aria-modal
- `components/ui/Modal.tsx:12-111`: trata ESC e foco inicial, mas não trava foco. Faltam `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- `pages/controller/Relatorios.tsx:398-424`: modal customizado sem focus trap, ESC, role.
- `pages/admin/NovaFazenda.tsx:362-408`: modal de credenciais customizado sem focus trap, ESC, role.

### Cores com contraste insuficiente
347 ocorrências de `text-gray-300` ou `text-gray-400` sobre fundo branco/claro. Exemplos:
- `components/ui/GlobalSearch.tsx:438`, `:460`, `:474`
- `pages/controller/Atividades.tsx:990`, `:1097`
- `pages/controller/Lotes.tsx:2202`, `:3700`
- `components/plano-nutricional/PlanoNutricionalLoteModal.tsx:803-804`

### Elementos interativos customizados sem `role`/`tabIndex`
- `components/ui/Dropdown.tsx:44`: `div` com `onClick`, sem `role`, `tabIndex`, `aria-expanded`. Não responde a Enter/Space.

**Soluções:**
1. Adicionar `aria-label` em todos os botões de ícone.
2. Vincular `<label>` e `<input>` via `htmlFor`/`id` (ou usar `aria-labelledby`/`aria-label`).
3. Implementar focus trap no `Modal.tsx` e adicionar `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
4. Converter `Dropdown.tsx` para sempre renderizar `<button>` com `aria-expanded`.
5. Trocar `text-gray-300/400` por `text-gray-400/500` onde o contraste for insuficiente.

**Impacto:** médio. **Esforço:** baixo-médio.

---

## 10. ~~Mobile / Responsividade~~ (concluído)

### Tabelas sem scroll horizontal em mobile
- `pages/controller/Relatorios.tsx:319`: tabela de links públicos sem `overflow-x-auto`.
- Várias tabelas em `Registros*.tsx`, `Problemas.tsx`, `Enfermaria.tsx`, `Bebedouros.tsx`, `Maternidade.tsx`, `PastagensCaderneta.tsx`, `Movimentacao.tsx`, `Suplementacao.tsx`, `Rodeio.tsx`, `Almoxarifado.tsx` usam `overflow-x-auto` dentro de `hidden sm:block`, ou seja, ficam invisíveis no mobile.

### Grids com colunas fixas que quebram em telas pequenas
- `components/plano-nutricional/PlanoNutricionalLoteModal.tsx:1225`: `grid-cols-2` sem coluna única no mobile.
- `pages/controller/AcompanhamentoTratos.tsx:398` e `:504`: `grid-cols-2 lg:grid-cols-5` sem `grid-cols-1`.
- `pages/controller/MonitoramentoAtividades.tsx:675`: `grid-cols-2` sem coluna única.

### Botões menores que 44px de área de toque
- `pages/controller/Atividades.tsx:987` (`p-1.5` com ícone 16px, ~26px)
- `pages/controller/Atividades.tsx:894`, `:901`, `:1134`, `:1143`, `:1322`, `:1329`, `:1336` (botões com `p-1`)
- `components/plano-nutricional/PlanoNutricionalLoteModal.tsx:992-993` (`py-0.5 text-xs`)
- `components/ui/Notifications.tsx:175` (`w-10 h-10`, 40px)
- `components/layout/Header.tsx:64` (`py-2`, ~40px)
- `components/ui/GlobalSearch.tsx:340` (`py-2`, ~40px)
- `pages/auth/Login.tsx:153` (olho da senha, SVG 20px)

**Soluções:**
1. Envolver tabelas em `overflow-x-auto` e manter alternativa legível no mobile.
2. Adicionar `grid-cols-1` antes de breakpoints maiores.
3. Usar o componente `Button` (que já tem `min-h-[44px]`) para evitar botões manuais pequenos.

**Impacto:** médio. **Esforço:** médio.

---

## 11. ~~Imagens sem lazy loading e em PNG~~ (parcialmente concluído)

**Problema:** `public/images/` contém apenas PNGs, nenhum WebP/AVIF. A grande maioria das `<img>` não usa `loading="lazy"`, `srcset` nem `sizes`. O `Dashboard.tsx` carrega 18 ícones de cadernetas de uma vez sem lazy loading.

**Ocorrências sem `loading="lazy"`:**
- `pages/controller/Dashboard.tsx` linhas 55 e 266-446
- `pages/public/RelatorioPublico.tsx` linhas 477, 491, 606, 627, 1106
- `pages/auth/Login.tsx:66`
- `pages/admin/Fazendas.tsx:60`, `EditarFazenda.tsx:185`, `NovaFazenda.tsx:178`
- `pages/controller/Cadernetas.tsx:152`
- `components/layout/Header.tsx:48`

**Única exceção com `loading="lazy"`:** `MonitoramentoAtividades.tsx:1312`.

**Solução:** Adicionar `loading="lazy"` em todas as `<img>` below-the-fold. Converter PNGs para WebP com fallback. Para ícones pequenos, considerar inline SVG ou sprite.

**Impacto:** baixo-médio. **Esforço:** baixo para `loading="lazy"`, médio para conversão de formato.

---

## 12. ~~TanStack Query configurado mas quase não usado~~ (parcialmente concluído)

**Problema:** `QueryClient` está configurado em `main.tsx` (linhas 3-17), mas só `useDashboardQueries.ts` usa `useQuery` (linhas 11, 30, 56, 79, 109). Todo o resto faz `useEffect` + `useState` manual. A mesma tabela é consultada em múltiplas páginas diferentes sem cache:

- `lotes` (`select id, nome...`): `Currais.tsx:146`, `SuplementacaoDetalhes.tsx:168`, `IndividuoNovo.tsx:163`, `HistoricoOcupacao.tsx:89`, `Individuos.tsx:237`, `DetalhesFazenda.tsx:109`
- `pastos` (`select id, nome...`): `Lotes.tsx:276`, `Pastos.tsx:92`, `HistoricoOcupacao.tsx:90`, `Individuos.tsx:240`, `DetalhesFazenda.tsx:108`
- `currais` (`select id, nome...`): `Lotes.tsx:279`, `Currais.tsx:146`, `DetalhesFazenda.tsx:111`

`Lotes.tsx` importa `useQueryClient` (linhas 3, 118) mas não usa `useQuery`.

**Solução:** Migrar queries repetidas para hooks com `useQuery` (ex: `useLotes()`, `usePastos()`, `useCurrais()`). O cache do TanStack Query evita re-fetch ao navegar entre páginas, e fornece `isLoading`/`error` automaticamente.

**Impacto:** médio-alto. **Esforço:** médio-alto (migrar página a página).

---

## 13. ~~Re-renders em componentes muito grandes~~ (parcialmente concluído)

**Problema:** Três páginas gigantes com dezenas de `useState` no mesmo componente. Cada digitação em um campo do formulário re-renderiza o componente inteiro, incluindo listas, modais e gráficos.

**Casos:**
- `Lotes.tsx`: 3.854 linhas, 36 `useState` (linhas 120-204), apenas 2 `useMemo` (linha 206) e 4 `useCallback` (linhas 744, 752, 769).
- `Atividades.tsx`: 1.766 linhas, 39 `useState` (linhas 242-324), 3 `useMemo` (linhas 448, 679) e 2 `useCallback` (linha 326).
- `MonitoramentoAtividades.tsx`: 1.362 linhas, 16+ `useState` (linhas 132-173).

**Solução:** Extrair subcomponentes memoizados: `LoteForm` (formulário de edição), `LoteCard` (cada card da lista), `LoteFilters` (toolbar de filtros). Cada um gerencia seu próprio estado local e só re-renderiza quando suas props mudam.

**Impacto:** médio. **Esforço:** alto (refatoração estrutural).

---

## 14. ~~Filtros e toolbars não padronizados~~ (parcialmente concluído)

**Problema:** Cada página implementa seus próprios filtros com markup similar mas nunca reutilizado. Inputs de busca não têm debounce (filtram em memória a cada keystroke, o que é aceitável para listas pequenas mas não escala).

**Casos:**
- `RegistrosAlimentacao.tsx:45-103` e `RegistrosMorte.tsx:44-103`: compartilham layout de filtros mas duplicam código.
- `Atividades.tsx:1184-1239` e `AuditLog.tsx:161-176`: ambos têm presets de data, mas implementações diferentes.
- `Individuos.tsx:80-94`: 10 filtros diferentes sem agrupamento visual.

**Solução:** Extrair `FilterToolbar` e `SearchInput` (com debounce) para padronizar os filtros das cadernetas e do audit.

**Impacto:** baixo-médio. **Esforço:** médio.

---

## 15. ~~Paginação inconsistente~~ (parcialmente concluído)

**Problema:** Há quatro abordagens diferentes de paginação no projeto:

| Abordagem | Onde | Detalhe |
|---|---|---|
| Paginação com offset (RPC) | `AuditLog.tsx:124-125`, `:182-183` | `p_offset`/`p_limite` |
| Paginação com `range` | `Individuos.tsx:92-94`, `:763-775` | `range(from, to)` + `count` |
| Load more | `Notificacoes.tsx:53`, `:136-149` | `page` + `range` com `hasMore` |
| Sem paginação | `RegistrosAlimentacao.tsx`, `RegistrosMorte.tsx`, `Lotes.tsx`, `Atividades.tsx` | Carregam tudo para o client |

**Solução:** Criar um componente `Pagination` compartilhado e adotar paginação server-side nas cadernetas e listas longas que hoje carregam tudo para o client.

**Impacto:** médio. **Esforço:** médio.

---

## Priorização recomendada

| # | Oportunidade | Impacto | Esforço |
|---|---|---|---|
| 1 | Toast global + substituir `alert()` | Alto | Baixo-médio |
| 2 | Code splitting com `React.lazy` | Alto | Médio |
| 3 | Validação inline (substituir `alert()` de validação) | Alto | Médio |
| 4 | Carregamentos paralelos com `Promise.all` | Médio | Baixo |
| 5 | `window.confirm()` → `ConfirmModal` | Baixo-médio | Baixo |
| 6 | Componentes de estado padronizados | Médio | Médio |
| 7 | Erros de carregamento visíveis nas páginas controller | Médio-alto | Médio |
| 8 | Tabela compartilhada | Médio | Médio |
| 9 | Acessibilidade (aria-label, focus trap, contraste) | Médio | Baixo-médio |
| 10 | Imagens com `loading="lazy"` | Baixo-médio | Baixo |
| 11 | TanStack Query nas queries repetidas | Médio-alto | Alto |
| 12 | Quebrar componentes grandes em subcomponentes | Médio | Alto |
| 13 | Filtros e toolbars padronizados | Baixo-médio | Médio |
| 14 | Paginação consistente | Médio | Médio |
| 15 | Mobile: grids, tabelas, botões | Médio | Médio |
