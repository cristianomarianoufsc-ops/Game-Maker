# Pursuit — O Preço da Ordem

A 2D pursuit game with physics, HP/stamina system, and mobile controls, offering a dynamic player experience.

## Run & Operate

- To install dependencies: `pnpm install`
- To start the main game server and level autosave:
  ```
  restart_workflow("artifacts/pursuit-game: web")
  restart_workflow("Level Autosave")
  ```
- To confirm game accessibility: take a screenshot at `path: "/"`
- To run API server locally (if needed): `pnpm --filter @workspace/api-server run dev`

> **⚠️ AÇÃO OBRIGATÓRIA — PRIMEIRA COISA A FAZER AO INICIAR QUALQUER SESSÃO:**
>
> Ao receber qualquer mensagem do usuário, **antes de responder ou fazer qualquer outra coisa**,
> execute imediatamente:
>
> ```
> restart_workflow("artifacts/pursuit-game: web")
> ```
>
> **⚠️ CONFLITO DE PORTA:** O workflow `Start application` usa a porta 5173 e entra em conflito
> com `artifacts/pursuit-game: web`. Nunca use `Start application` — use exclusivamente
> `artifacts/pursuit-game: web`. Se o preview falhar com "Port 5173 already in use",
> reiniciar `artifacts/pursuit-game: web` resolve (ele migra para outra porta disponível).
>
> **Por quê:** Toda vez que o ambiente reinicia (troca de agente, idle, etc.), o workflow para
> e o preview fica com tela branca. O usuário não deve precisar informar isso — o agente deve
> agir proativamente. Não espere o usuário reclamar da tela branca.
>
> - Use apenas `artifacts/pursuit-game: web` para controlar o preview.
> - Se o workflow falhar com `vite: not found`, rode `pnpm install` na raiz primeiro, depois reinicie.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Where things live

- `pursuit-game/` (`@workspace/pursuit-game`): Main game application.
- `scripts/level-autosave.sh`: Watches for and pushes level changes.
- `artifacts/pursuit-game/public/level-patch.history/`: Timestamped level editor snapshots.
- `artifacts/pursuit-game/src/game/ghostPlayer.ts`: Ghost AI (Horácio) — percorre o nível automaticamente.
- `artifacts/pursuit-game/public/ghost-debug.json`: Trail + morte do ghost (escrito automaticamente ao morrer).
- `src/spatialGrid.ts`: Spatial grid implementation for performance.
- `package.json`: For project dependencies and scripts.

## Ghost Trail Recorder + Post-Mortem Analyzer

> **JÁ ESTÁ IMPLEMENTADO — não reimplementar.**

O sistema rastreia o ghost player (Horácio) enquanto ele percorre o nível, salva o caminho percorrido e o ponto de morte, para que o agente possa corrigir a IA.

### Como usar
1. Entrar no modo de teste do editor no jogo
2. Pressionar **G** — ghost aparece na posição atual do jogador e começa a rodar
3. Ghost morre → trail salvo automaticamente em `public/ghost-debug.json`
4. Usuário diz **"analise ghost"** → agente lê o JSON, identifica X da morte, corrige `ghostPlayer.ts`

### Onde vive o código
| Arquivo | O que faz |
|---|---|
| `Game.tsx` linha ~661 | `ghostTrailRef`, `ghostDeathMarkersRef`, `ghostTrailTickRef`, `ghostEnabledRef` |
| `Game.tsx` linha ~4087 | Loop do ghost: step + grava trail a cada 3 frames + POST ao morrer |
| `Game.tsx` linha ~4191 | Toggle com tecla G |
| `vite.config.ts` linha ~350 | Endpoint `/__editor/save-ghost-trail` — salva ghost-debug.json |
| `ghostPlayer.ts` | IA completa do ghost (545 linhas) |
| `public/ghost-debug.json` | Trail gravado — `{ spawnX, spawnY, trail:[{x,y}], deaths:[{x,y}] }` |

### Como corrigir o ghost após análise
1. Ler `ghost-debug.json` — ver `deaths[0].x` (ponto de morte)
2. Buscar em `level.ts` o obstáculo/parede/buraco nessa região X
3. Analisar `ghostPlayer.ts` pra entender por que o ghost não superou aquele obstáculo
4. Corrigir a lógica de `computeGhostKeys()` em `ghostPlayer.ts`

## Architecture decisions

- **PNPM Workspaces**: Used for monorepo management, allowing each package to manage its dependencies independently while sharing common tooling.
- **Drizzle ORM**: Chosen for its type-safe approach to database interactions, integrating well with TypeScript and Zod for validation.
- **Orval for API Codegen**: Automates the generation of API hooks and Zod schemas from an OpenAPI specification, ensuring API consistency and reducing manual errors.
- **Level Editor Autosave**: Implemented a robust autosave system with content-based debouncing and version history to prevent data loss and facilitate rollbacks for level designers.
- **Spatial Grid Optimization**: Introduced a spatial grid for platform management in the game engine to drastically improve rendering and physics performance with large numbers of platforms.

## Product

- 2D pursuit game with detailed physics (HP, stamina, wall runs, sideflips, dives).
- Interactive level editor with features like object duplication, hitbox editing, sprite uploading, magnetic snap, and multi-selection.
- Dynamic environment elements including destructible boxes, climbable stacks, and flying tire physics.
- Persistent level changes and version history for game levels.

## User preferences

- _Populate as you build_

## Gotchas

- **Workflow do Preview (CRÍTICO)**: O painel Preview usa exclusivamente o workflow `artifacts/pursuit-game: web`. Esse workflow pode estar parado após reinicializações do ambiente. Ao iniciar qualquer sessão, execute `restart_workflow("artifacts/pursuit-game: web")` imediatamente. O workflow `Start application` NÃO controla o preview visível ao usuário — confirmado em produção. Se o preview aparecer branco, reiniciar esse workflow resolve 100% dos casos.
- **Dependências ausentes**: Se o servidor não iniciar com `vite: not found` ou `node_modules missing`, rode `pnpm install` na raiz antes de reiniciar qualquer workflow.
- **Level Editor Persistence**: Uploaded sprites and custom hitboxes depend on `localStorage` until permanently added to project assets.
- **Git push via token (OBRIGATÓRIO ao final de cada sessão)**: O autosave faz push automático, mas pode falhar silenciosamente se o workflow foi reiniciado ou o token não estava disponível. **Sempre verifique e force o push ao terminar qualquer sessão de trabalho:**
  ```bash
  # 1. Verificar quantos commits locais ainda não foram para o origin:
  git fetch origin --quiet && git rev-list --count origin/main..HEAD
  # Se retornar > 0, fazer push:
  ORIGIN_URL=$(git remote get-url origin)
  AUTH_URL=$(echo "$ORIGIN_URL" | sed "s|^https://|https://x-access-token:${GITHUB_TOKEN}@|")
  git push "$AUTH_URL" HEAD:main
  ```
  O segredo `GITHUB_TOKEN` já está configurado no ambiente Replit. Nunca exibir o valor — apenas usar via variável de ambiente. Se o push retornar 0 commits à frente, está tudo sincronizado.
- **`rg` (ripgrep) falha silenciosamente em arquivos grandes**: `Game.tsx` (~250k), `render.ts` (~245k) e `physics.ts` (~86k) são grandes demais para o `rg` funcionar com tipos TypeScript. Use sempre `grep -n "padrão" arquivo` nesses arquivos. Ex: `grep -n "ghostTrail" artifacts/pursuit-game/src/game/Game.tsx`.
- **Ghost Trail já implementado**: Se o usuário mencionar "ghost trail", "analise ghost" ou "post-mortem", o sistema JÁ EXISTE — veja a seção acima. Não reimplementar.

## Pointers

- [pnpm-workspace skill](https://www.npmjs.com/package/pnpm-workspace)
- [Express 5 Documentation](https://expressjs.com/en/5x/api.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
- [Zod Documentation](https://zod.dev/)
- [Orval Documentation](https://orval.dev/)
- [esbuild Documentation](https://esbuild.github.io/)