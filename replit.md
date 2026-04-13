# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

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

## Artifacts

- **pursuit-game** (`@workspace/pursuit-game`): "Pursuit — O Preço da Ordem" — jogo de perseguição 2D com física, sistema de HP/stamina, e controles mobile. Clonado de https://github.com/cristianomarianoufsc-ops/Game-Maker
- Movimento recente: mortal curto saindo do wall run quando o jogador pula mantendo a direção contra a parede, usando `@assets/mortal_1776009939272.png`.
- Movimento recente: subida vertical saindo do wall run quando o jogador aperta apenas pulo, usando `@assets/subida_1776012458574.png`; Horácio impulsiona para cima, agarra a borda do muro e sobe.
- Movimento recente: sideflip/segundo pulo atualizado para `@assets/SIDE_FLIP_1776053462942.png`, com animação em 5 quadros, sprite ampliado e trilha curta de partículas azuladas.
- Movimento recente: mergulho ficou mais tolerante; pulo+baixo/baixo+pulo agora têm janela de 420ms, e um pulo inicial ainda pode virar mergulho se o baixo entrar logo depois.
- Ajuste recente: mergulho não pode mais ser convertido depois que o pulo normal já saiu no ar; continua aceitando a janela enquanto há chão/coyote time. A câmera agora acompanha verticalmente quando Horácio sobe acima da tela.
- Ajuste recente: drone agora usa velocidade fixa igual à perseguição base inicial (`DRONE_BASE_SPEED`), sem aceleração extra de catch-up quando Horácio abre distância.
- Editor de fase: deleções de obstáculos/plataformas/paredes agora são salvas no navegador com `localStorage` e reaplicadas após recarregar ou reiniciar a partida; chão continua protegido contra remoção.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
