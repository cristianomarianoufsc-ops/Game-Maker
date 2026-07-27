---
name: Kong Vault sprite editor drag pattern
description: How player-attached sprite overrides (ladder, Kong Vault start/air poses) are made size-configurable in the level editor
---

Player-anchored sprite overlays (ladder climb/descend, Kong Vault start/air poses) share one generalized
drag system in Game.tsx: `PlayerSpriteDrag` has an optional `target` field (`'ladder' | 'kongVaultStart' | 'kongVaultAir'`)
so a single mousemove handler resolves the right `{dw,dh}` ref and localStorage key instead of duplicating
drag-handling logic per sprite.

**Why:** Adding a new size-configurable player sprite by copy-pasting the full mousedown/mousemove/mouseup block
each time bloats Game.tsx and risks drift between copies (e.g. forgetting to persist to localStorage).

**How to apply:** When adding another player-anchored sprite override, add its key to the `target` union, add a
`{key,img,disp,defaultDh,label,storageKey}` entry to the relevant `kvTargets`-style array in the mousedown handler,
and reuse `drawKongVaultSpriteEditorHandles` (render.ts) — a generic handle-drawing function parameterized by
img/display/label/defaultDh — rather than writing a new draw function per sprite.

**Overlapping bounding boxes:** when multiple player-anchored sprites share the same anchor point, their bounding
boxes can fully overlap (e.g. ladder sprite's box was larger and always "won" over Kong Vault sprites underneath).
Fix: on click, compute hits across ALL sprite geoms, then pick the smallest-area box, not the first one checked in
declaration order. Also make every selection/flip toggle call `copyPlatText(...)` with an identifying string
(name + params) so pasting in chat is useful, matching how normal platform objects already behave — attached
sprites were previously silent on click.
