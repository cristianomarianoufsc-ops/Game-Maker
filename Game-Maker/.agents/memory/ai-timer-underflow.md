---
name: AI timer negative underflow bug
description: Timers decrementados sem clamp a zero ficam negativos, quebrando verificações === 0 silenciosamente.
---

# AI Timer: Underflow negativo quebra condições de disparo

## O bug
```js
// Decremento SEM clamp:
if (ai.jumpHoldTimer > 0) ai.jumpHoldTimer -= dt;
// Se jumpHoldTimer=5ms e dt=16.67ms → jumpHoldTimer = -11.67
// Próximo frame: -11.67 > 0 é false → para de decrementar
// jumpHoldTimer fica preso em -11.67 para sempre
```

Depois, verificações de expiração com `=== 0` nunca ficam true:
```js
const stumpFires = onStump && ai.jumpHoldTimer === 0 && ai.jumpCooldown === 0;
// → false SEMPRE porque os valores são negativos, nunca exatamente 0
```

## Onde aconteceu
`ghostPlayer.ts` — `stumpFires` bloqueado por `jumpHoldTimer === 0 && jumpCooldown === 0`.
Ghost pousava no toco 1 do rio mas nunca pulava para o toco 2. Trail mostrava y constante por 12+ frames.

## Correção
Usar `<= 0` em vez de `=== 0` para verificar expiração de timers:
```js
const stumpFires = onStump && ghost.onGround && ai.jumpHoldTimer <= 0 && ai.jumpCooldown <= 0;
```

**Why:** Os timers são decrementados por `dt` que pode ser maior que o valor residual do timer (e.g. 5ms restantes, dt=16.67ms). O valor vai negativo e nunca volta a 0.

**How to apply:** Sempre que verificar expiração de timer decrementado sem clamp: usar `<= 0`, nunca `=== 0`. Alternativa mais robusta: clampar o decremento: `ai.jumpHoldTimer = Math.max(0, ai.jumpHoldTimer - dt)`.
