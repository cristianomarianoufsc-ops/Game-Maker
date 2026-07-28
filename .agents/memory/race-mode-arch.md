---
name: Race mode architecture
description: Rival rendering, AI, drone targeting, and skin-tone two-pass technique for the corrida (race) game mode.
---

# Race Mode Architecture

## Rival player
- Reuses `createGhostPlayer` / `stepGhostPlayer` from `ghostPlayer.ts`.
- `racePlayerRef` holds the rival; preserved across player respawns.
- Rival finish line: `RIVAL_FINISH_X = 36346`.

## Rival skin-tone rendering (two-pass)
The rival wears a differently-coloured outfit but has the same skin tone as the main player.

**Technique:**
1. `ctx.save()` → `ctx.filter = 'hue-rotate(160deg) saturate(1.5)'` → `_geom = drawPlayer(...)` → `ctx.restore()`
   Full sprite is tinted (clothes change colour, skin goes green).
2. Clip to the top ~28% of the **actual rendered sprite** using `_geom.destY` and `_geom.dh`, then call `drawPlayer` again without any filter.
   This overwrites only the head region with unfiltered (natural) pixels.

**Why `_geom.destY`, not `_rival.y`:**
`drawPlayer` anchors the sprite at the feet and draws upward. Due to `FOOT_OFFSET = 28` and a display height much larger than `PLAYER_H = 50`, the sprite top (`destY`) is roughly 44–70px **above** the collision-box top (`p.y`). Using `p.y` as the clip origin misses the head entirely, leaving it green.
`drawPlayer` returns `PlayerRenderGeom | null` — always use the returned `destY/dh/destX/dw` for any overlay that needs to align with the visible sprite.

**Why:**
`drawPlayer` returns `PlayerRenderGeom` including `destX`, `destY`, `dw`, `dh` in screen coordinates (pre-flip transform). Use this for any sprite-aligned overlay.

## Drone targeting
- In race mode, drone targets the living leader via `targetOverride` in `updateDrone`; if one runner dies, it switches to the other without respawning with either runner.
- `raceDroneEnabled` flag on `GameState` disables drone in "Corrida sem drone".
- The drone's position and momentum must survive player respawns; race respawn logic must never place it at the player's checkpoint.
- Race setup has independent Drone and Checkpoints toggles; Iniciar only starts the race. Checkpoints reuse the story triggers and respawn behavior.

## Colour
- `hue-rotate(160deg) saturate(1.5)` shifts pinkish-orange clothes to blue-violet.
