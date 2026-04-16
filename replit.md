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
- Editor de fase: objetos do tipo `car` agora usam uma caixa de colisão proporcional menor que o sprite visual, permitindo descer o carro até a base visual sem parecer flutuar; a física, seleção e overlay do editor usam essa caixa física.
- Editor de fase: objetos selecionados agora têm botão `HITBOX` abaixo de `DUP`; ao ativar, as alças e o arrasto editam somente a caixa de colisão, mantendo o tamanho visual do sprite. O texto copiado inclui `cw`, `ch`, `cox` e `coy` quando houver colisão customizada.
- Editor de fase: Shift + arrastar uma alça do objeto faz crop visual da imagem (`crop:left,top,right,bottom`) sem alterar a colisão; a caixa de seleção/alças passa a acompanhar a área recortada. `,`/`.` e também Numpad 4/6 navegam entre checkpoints do editor.
- Editor de fase: mover objetos no editor usa snap magnético pelas caixas de colisão, grudando bordas, centros, topo/base e chão quando estiverem próximos; duplicar (`DUP`) cria a cópia encostada ao original em vez de deixar uma folga. Quando há múltiplos objetos selecionados por marquee, o botão muda para `DUP N` e duplica o grupo inteiro mantendo posições relativas.
- Hitboxes inclinadas: caixas de colisão agora podem ter `slopeTop` para transformar o topo em rampa; os carros grandes do ferro velho usam slopes nos vidros frontal/traseiro para Horácio subir do capô/porta-malas até o teto sem agarrar na lateral retangular. No editor, entre em `HITBOX`, clique diretamente na caixa que quer editar, use as setas para mover a hitbox selecionada em 1px (`Shift` = 5px), use `S` ou o botão `+ SLOPE`, e arraste os losangos laranja para ajustar o ângulo. Durante o teste iniciado com `Ctrl`, clicar em um objeto volta para o editor e seleciona aquele objeto.
- Editor de fase: botão `UPLOAD SPRITE` no topo aceita PNG/WebP transparente, cria um objeto do tipo `sprite` com o nome original do arquivo, salva os sprites no `localStorage` e permite mover, redimensionar, recortar e editar hitbox como os outros objetos.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
