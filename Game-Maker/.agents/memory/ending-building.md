---
name: Ending building / victory sequence
description: How the final building door occlusion and victory sequence are implemented
---

# Ending building — occlusion trick

The "Horácio enters building" effect is achieved purely by render order:
- `drawEndingBuilding(ctx, camX)` is called AFTER `drawPlayer` in Game.tsx
- Building facade is drawn on top of the player → player disappears behind right door jamb

**Geometry (render.ts constants):**
- `ENDING_BLDG_X = 36620` (world-space X of the building facade)
- `ENDING_DOOR_OFFSET = 20` (left strip before door opening)
- `ENDING_DOOR_W = 58` (door opening width, player is 26px)
- `ENDING_DOOR_H = 120` (door height from ground)
- Door opening: x=36640 to x=36698

**Victory sequence timing:**
- Trigger at x=36346 (right edge of last wall)
- `victoryTimer = 3600ms`
- Player auto-runs right at 240px/s → reaches door right jamb at ~1.5s
- Fade to black starts when `victoryTimer < 1800ms` (i.e. at 1.8s elapsed)
- Victory screen at `victoryTimer = 0`

**Ground:** Extended last ground segment to w=5600 (covers to x=37600)

**Why:** Nested function `fillBricks` inside `drawEndingBuilding` is fine in TypeScript.
The ctx.translate(0, -camera.y) is active during draw; GROUND_Y is world-space and renders correctly since camera.y ≈ 0 during victory (player forced to GROUND_Y - PLAYER_H).
