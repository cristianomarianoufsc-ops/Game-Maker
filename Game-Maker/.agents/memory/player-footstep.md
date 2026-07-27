---
name: Player footstep sound
description: Como o som de passada do Horácio foi implementado — reutiliza buffer do NPC touca, um único ponto no loop cobre todos os modos
---

# Player footstep sound

## Regra
`playPlayerStep()` em `audio.ts` reutiliza `_ensureBystanderScreamBuf(1)` (scream_touca.mp3, spriteId 1). Não faz fetch extra — o buffer já é aquecido por `preloadBystanderScreams()` no mount.

**Why:** O usuário quer que Horácio corra com o mesmo som do NPC homem de touca. Reuso do buffer evita duplicação de assets.

## How to apply
- Timer `playerStepTimerRef` (useRef, inicia em 650) em `Game.tsx`
- Lógica dentro de `gs.gamePhase === 'playing'`, após sons de pulo/pouso
- Dispara quando `gs.player.state === 'run' && gs.player.onGround` a cada 650ms (dt acumulado)
- Reseta para 650 quando não correndo → primeiro passo toca imediatamente ao retomar corrida
- **Cobre os 3 modos automaticamente** (story, wall-test, real-story-test) porque todos usam gamePhase === 'playing'

## Detalhes do playPlayerStep
- vol padrão: 0.07 (baixo — soa como grunt, não grito completo)
- Fade: attack 20ms, hold 120ms, release 180ms → total ~320ms audível (só o ataque do grito)
- `src.stop()` via setTimeout após fade para liberar nó de áudio
