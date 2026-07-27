---
name: Ghost tic-tac wall flight
description: Air physics instantly overrides wall-run jump vx; noHang walls require tictacFlyLeft state in ghost AI to preserve momentum toward the placa
---

# Ghost Tic-tac Wall Flight

## The rule
When the ghost does a wall-run jump off a `noHang` wall, the AI must track a `tictacFlyLeft` state and press `left+space` until the placa (tictacWall) is reached. Without this, air physics kills the momentum instantly.

**Why:** `physics.ts` line 741 does `p.vx = effectiveSpeed` (= PLAYER_SPEED=6.5) unconditionally every frame when `keys.right=true`, even in the air. The wall-run jump sets `vx=-9` (LEFT), but the very next frame the AI's default `keys.right=true` overrides it to `+6.5` — ghost reverses direction and never reaches the placa.

**How to apply:** This affects any `noHang:true` climbable wall that requires a tic-tac maneuver. The pattern:
1. During wall-run (`isWallRunning`): set `ai.lastWallNoHang = ghost.wallNoHang`
2. On wall-run exit (`wasOnWall && !onWallNow && lastWallNoHang`): set `tictacFlyLeft=true, tictacFlyTimer=700ms`
3. Section 1.5 in computeGhostKeys: while `tictacFlyLeft && !onGround && timer>0` → return `{left:true, space:true}`
4. When `ghost.onTictacWall` becomes true: clear `tictacFlyLeft` (tic-tac fires auto with `intoWall=keys.left+wallSide='left'` → `vx=+8`)

## Key numbers (x:36321 → x:36144 sequence)
- Wall x:36321: `climbable:true, noHang:true` — forces wall-run jump (vx=-9 LEFT) after 160ms
- Placa x:36144: `tictacWall:true, climbable:true, noClimbOver:true` — wall-run blocked; tic-tac fires
- Distance right wall → placa: ~152px. At vx=6.5 (pressing left): ~23 frames (~390ms) → reaches placa well within 700ms timer
- After tic-tac (vx=+8): AI presses right, air physics sets vx=+6.5. Ghost clears wall top (y=34) with clearance: feet at ~y=17 when passing x:36321
