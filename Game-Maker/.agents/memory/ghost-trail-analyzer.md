---
name: Ghost Trail Analyzer
description: Sistema de debug do ghost player — grava trail de posições, salva em JSON ao morrer, agente lê e corrige o AI.
---

# Ghost Trail Analyzer — Sistema de Debug do Ghost

## O que é
Quando o ghost (Horácio, AI que testa o nível) morre, o jogo automaticamente envia os dados de
posição do trail para um endpoint do Vite, que salva em `artifacts/pursuit-game/public/ghost-debug.json`.

## Arquivos-chave
- `artifacts/pursuit-game/public/ghost-debug.json` — trail gravado (leitura pelo agente)
- `artifacts/pursuit-game/src/game/ghostPlayer.ts` — AI do ghost (arquivo a corrigir)
- `artifacts/pursuit-game/src/game/Game.tsx` — refs: `ghostTrailRef`, `ghostDeathMarkersRef`, `ghostTrailTickRef`
- `artifacts/pursuit-game/vite.config.ts` — endpoint `/__editor/save-ghost-trail` (POST, salva o JSON)

## Formato do ghost-debug.json
```json
{
  "spawnX": 0,
  "spawnY": 360,
  "trail": [{ "x": ..., "y": ..., "d": "JUMP:POTHOLE" }, ...],
  "deaths": [{ "x": ..., "y": ... }]
}
```
Trail gravado a cada 3 frames. Deaths = posição exata da morte.
Campo `d` = decisão de IA naquele frame.

## Decisões possíveis no campo `d`
| Decisão | Significado |
|---|---|
| `IDLE` | Andando, nenhuma ação especial |
| `CLIMB` | Escalando escada ou ladder |
| `WALL_RUN` | Wall-run ativo |
| `WALL_CLIMB` | Wall-climb (subindo borda) |
| `WALL_HANG` | Pendurado, prestes a pular por cima |
| `CLIMB_WALL` | Parede climbable tocada, subindo |
| `WALL_FLIP` | Muro não-climbable no ar, forçou pulo |
| `JUMP:GAP` | Pulo por lacuna/cliff edge |
| `JUMP:POTHOLE_URGENT` | Pulo urgente por buraco próximo |
| `JUMP:POTHOLE+OBS` | Pulo urgente: buraco + obstáculo bloqueando |
| `JUMP:POTHOLE` | Pulo normal por buraco detectado |
| `JUMP:SHORT_OBS` | Pulo sobre obstáculo baixo |
| `JUMP:TALL_WALL` | Pulo para wall-run em muro alto |
| `JUMP:STUCK` | Preso no chão, forçou pulo |
| `JUMP:AIR_STUCK` | Preso no ar, forçou pulo |
| `JUMP:EDGE` | Plataforma elevada com buraco na borda |
| `DIVE_ROLL` | Rolando por baixo de marquise (com espaço) |
| `ROLL_UNDER` | Rolando por baixo de marquise (sem espaço) |
| `RIVER:APPROACH` | Aproximação do 1º toco do rio |
| `RIVER:STUMP` | Pulo toco→toco |
| `RIVER:BRAKE` | Freando no ar (toco→toco) |
| `RIVER:RUN` | Correndo dentro da zona do rio |
| `DETECT:SHORT_OBS` | Detectou obstáculo, aguardando cooldown |
| `DETECT:TALL_WALL` | Detectou muro alto, aguardando |
| `DETECT:POTHOLE` | Detectou buraco, aguardando |
| `DETECT:GAP` | Detectou gap, aguardando |
| `DEAD` | Ghost morreu |

## Como usar no diagnóstico
Veja os últimos 10 pontos do trail antes de `deaths[0]`. Procure:
- `IDLE` onde deveria ter `JUMP:POTHOLE` → gap não detectado
- `DETECT:POTHOLE` seguido de `IDLE` → cooldown bloqueou o pulo
- `WALL_HANG` sem `JUMP:*` depois → pulo não disparou do hang

## Workflow "analise ghost"
1. Usuário ativa ghost no jogo (tecla G em wall-test mode)
2. Ghost roda, morre
3. Dados salvos automaticamente em ghost-debug.json
4. Usuário diz "analise ghost"
5. Agente lê ghost-debug.json → acha ponto de morte (últimos pontos do trail ou `deaths`)
6. Identifica X da morte → encontra obstáculo correspondente em `level.ts`
7. Analisa lógica de `ghostPlayer.ts` para aquele cenário
8. Corrige o ghostPlayer.ts

## Como identificar o ponto de falha
- Últimos ~10 pontos do trail antes de `y > CANVAS_H` ou `state === 'dead'`
- `deaths` array tem a posição exata
- X do ponto de morte → busca em level.ts por plataforma/muro/pothole nessa região

## Constantes importantes
- CANVAS_H = 500, GROUND_Y = 410, PLAYER_H = 50, PLAYER_W = 26
- JUMP_FORCE = -13, WALLRUN_DURATION = 750ms, WALLRUN_RISE_SPEED = 3.5
- PLAYER_SPEED = 6.5
- Wall-run ativa quando: !onGround, touchingWall, |vx|>3, vy<-2.5, keys.right (parede direita)
- Wall-climb dispara durante wall-run quando: keys.space + keys.right, após 160ms de wall-run

**Why:** Sem esse contexto o agente fica tentando "analise ghost" sem saber que há um arquivo JSON de trail ou que o workflow de análise é: ler JSON → identificar X → corrigir ghostPlayer.ts.
