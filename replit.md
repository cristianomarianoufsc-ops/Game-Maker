# Pursuit — Jogo de Perseguição 2D

Jogo 2D de perseguição com modo corrida contra IA, construído em React + Vite.

## Run & Operate

- **Jogo (frontend):** workflow `Pursuit Game` — `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/pursuit-game run dev`
- **API server:** `pnpm --filter @workspace/api-server run dev` (porta 8080)
- `pnpm run typecheck` — typecheck completo em todos os pacotes
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/db run push` — push do schema no banco (dev)
- `DATABASE_URL` é gerenciado automaticamente pelo Replit (PostgreSQL provisionado)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/pursuit-game`)
- API: Express 5 (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validação: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (a partir do spec OpenAPI em `lib/api-spec`)
- Build: esbuild (bundle CJS)

## Where things live

- `artifacts/pursuit-game/` — jogo React/Vite (frontend)
- `artifacts/api-server/` — servidor Express 5
- `lib/db/src/schema/` — schema Drizzle (fonte da verdade para o banco)
- `lib/api-spec/` — spec OpenAPI (fonte da verdade para contratos de API)
- `attached_assets/` — assets do jogo (sprites, imagens)

## User preferences

- Comunicação em português BR

## Gotchas

- O jogo depende dos assets em `attached_assets/` — sincronize ao mover código
- Modo Corrida: rival usa ghostPlayer AI; hue-rotate 160° para cor diferente; drone mira o líder via targetOverride
- PORT e BASE_PATH precisam ser passados explicitamente ao rodar o frontend fora do workflow gerenciado
