---
name: Ghost marquise blocked by solid obstacle
description: Quando lixeira/box bloqueia a entrada de uma sacada (marquise), o ghost travava tentando rolar em vez de pular.
---

# Ghost: Sacada bloqueada por obstáculo sólido na entrada

## Cenário que causava travamento
- Sacada (marquise) detectada à frente: ghost decide `rollUnderMarquise = true`
- Obstáculo sólido (lixeira, box) posicionado NA ENTRADA da sacada (antes ou sobrepondo a borda esquerda)
- Ghost ficava agachado (down=true) batendo contra o obstáculo sem conseguir entrar
- `shortObstacleAhead` detectava a lixeira, mas `jumpForShortFinal` era suprimido pelo path de roll

## Causa raiz
`rollUnderMarquise = gapAfterMarquise && ghost.onGround` não verificava se havia obstáculo sólido bloqueando a entrada. O ghost comprometia-se com o roll antes de confirmar caminho livre.

## Correção aplicada (ghostPlayer.ts, antes de `rollUnderMarquise`)
```js
const solidBlockingMarquiseEntry = marquiseAhead ? platforms.some(p => {
  if (p.type === 'ground' || p.type === 'platform' || p.type === 'pothole' ||
      p.type === 'sprite' || p.type === 'tireHideout') return false;
  const px0 = p.x + (p.collisionOffsetX ?? 0);
  const py0 = p.y + (p.collisionOffsetY ?? 0);
  const mRight = marquiseAhead.x + (marquiseAhead.collisionW ?? marquiseAhead.w);
  return (
    px0 < mRight && px0 + (p.collisionW ?? p.w) > gRight - 10 &&
    py0 < gFeet  && py0 + (p.collisionH ?? p.h) > ghost.y + 4
  );
}) : false;

const rollUnderMarquise = gapAfterMarquise && ghost.onGround && !solidBlockingMarquiseEntry;
```

**Why:** Sem essa verificação, o ghost nunca cancela o roll e fica travado. Com ela, cancela → trata obstáculo como shortObstacleAhead → pula.

**How to apply:** Sempre que o ghost travar agachado contra um objeto antes de uma sacada, verificar se `solidBlockingMarquiseEntry` está sendo avaliado corretamente.
