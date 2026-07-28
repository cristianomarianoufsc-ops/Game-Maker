---
name: Modo Corrida — arquitetura
description: Como o modo corrida está implementado em artifacts/pursuit-game
---

## Rival
- `racePlayerRef` armazena o rival (`Player`); criado via `createGhostPlayer` em `resetGame('race')`.
- Atualizado por `stepGhostPlayer` a cada frame, com janela de plataformas de ±3200px centrada no rival.
- Detectado como morto via `isGhostDead`; respawna em `raceCheckpointXRef` (mesmo X do checkpoint da história).
- Renderizado com `ctx.filter = 'hue-rotate(160deg) saturate(1.5)'` para cor distinta sem alterar sprites.
- Indicador laranja na borda quando fora da tela.

## Drone
- Em modo corrida com `raceDroneEnabled`, passa o rival como `targetOverride` para `updateDrone` se `rival.x > player.x`.
- Fallback automático para o jogador principal quando não há override.

## Tiros
- `updateBullets` recebe `[racePlayerRef.current]` como `additionalPlayers` no modo corrida.

## Vitória / Derrota
- Rival cruza `RIVAL_FINISH_X` (36346) antes do jogador → `gamePhase = 'gameover'`.
- Jogador cruza a mesma linha → vitória normal.

## Morte do jogador no modo corrida
- Bloco `else if (gs.gameMode === 'race')` em `Game.tsx` antes do bloco de história.
- Consome vida, respawna no `storyCheckpointX`, preserva `racePlayerRef` (rival continua rodando).
- `raceDroneEnabled` copiado de `raceDroneEnabledRef.current` para o novo estado.

**Why:** Rival deve ser independente do ciclo de vida do jogador para manter o desafio mesmo após mortes.
