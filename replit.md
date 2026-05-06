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

> **IMPORTANTE — Como fazer o preview aparecer (SEMPRE fazer isso ao iniciar):**
>
> O painel Preview usa **exclusivamente** o workflow `artifacts/pursuit-game: web`.
> Ao iniciar uma sessão ou se aparecer "Your app is not running", execute **obrigatoriamente**:
>
> ```
> restart_workflow("artifacts/pursuit-game: web")
> ```
>
> - NÃO use `Start application` para o preview — ele NÃO controla o painel Preview visível ao usuário.
> - O workflow `artifacts/pursuit-game: web` pode estar parado após reinicializações do ambiente.
> - Confirmado funcionando: reiniciar esse workflow resolve o preview em branco 100% dos casos.

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
- `src/spatialGrid.ts`: Spatial grid implementation for performance.
- `package.json`: For project dependencies and scripts.

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

- **Workflow do Preview (CRÍTICO)**: O painel Preview usa exclusivamente o workflow `artifacts/pursuit-game: web`. Esse workflow pode estar parado após reinicializações do ambiente. Ao iniciar qualquer sessão, execute `restart_workflow("artifacts/pursuit-game: web")` imediatamente. O workflow `Start application` NÃO controla o preview visível ao usuário — confirmado em produção.
- **Dependências ausentes**: Se o servidor não iniciar com `vite: not found` ou `node_modules missing`, rode `pnpm install` na raiz antes de reiniciar qualquer workflow.
- **Level Editor Persistence**: Uploaded sprites and custom hitboxes depend on `localStorage` until permanently added to project assets.
- **Autosave Failures**: `git push` failures in `scripts/level-autosave.sh` are silent and do not interrupt the watch process.

## Pointers

- [pnpm-workspace skill](https://www.npmjs.com/package/pnpm-workspace)
- [Express 5 Documentation](https://expressjs.com/en/5x/api.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
- [Zod Documentation](https://zod.dev/)
- [Orval Documentation](https://orval.dev/)
- [esbuild Documentation](https://esbuild.github.io/)