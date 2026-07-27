---
name: Editor click coordinate space (world vs screen)
description: Why clicking the player sprite in the level editor only worked near camera x=0 and broke deep into the level
---

In the level editor, mouse click coordinates (`wx`/`wy` from `getEditorWorldCoords`) are in **world space** (`screen + camera.x`). But `drawPlayer()` in `render.ts` returns `destX`/`destY`/`anchorX` already in **screen space** (`p.x - gs.camera.x` is computed internally, no camera add-back). Other renderers (platforms, buildings) are drawn under an active `ctx.translate(-camX, 0)` and use raw world coordinates directly — a different, non-comparable convention.

**Why:** Comparing world-space click coords directly against `drawPlayer`'s screen-space geometry only "works" by coincidence when `camera.x` is near 0 (e.g. testing at the start of a level). Deep into the level (large `camera.x`), the two spaces diverge completely and hit-tests silently fail, letting the click fall through to whatever world-space object (e.g. a platform) is underneath.

**How to apply:** Any new editor click/hit-test logic that touches player-sprite geometry (`lastPlayerGeomRef`/pose bbox) must first convert the world click coords to screen space via `pcx = wx - editorCamXRef.current`, `pcy = wy - editorCamYRef.current` before comparing against `destX`/`destY`/`anchorX`. Drag-delta math (`wx - startWX`) is safe either way since it's a pure subtraction in one consistent space.
