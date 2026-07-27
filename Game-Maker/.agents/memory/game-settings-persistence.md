---
name: Server-side persistent game settings pattern
description: How audio/game settings (music volume, SFX category volumes, per-NPC volumes) survive across environments/clones
---

Sound-related settings chosen in the level editor (music volume, per-category
SFX volumes for box/tire/npc/dog, per-NPC individual volume) are persisted to
`artifacts/pursuit-game/public/game-settings.json` via `/__editor/game-settings`
(GET) and `/__editor/save-game-settings` (POST, debounced merge) middleware in
`vite.config.ts`, in addition to a localStorage cache for instant UI feedback.

**Why:** localStorage alone does not survive git clones or new environments —
volume settings the user tuned would silently reset. The file-based settings
follow the same pattern as `level-patch.json` autosave (watched + committed by
`scripts/level-autosave.sh`), so it stays consistent everywhere.

**How to apply:** Any *new* sound/tunable setting added to the editor should
follow the same pattern: read/write via `audio.ts`'s
`loadGameSettingsFromServer()` / `_persistGameSettingsToServer()` helpers, add
the key to `game-settings.json`, and make sure `scripts/level-autosave.sh`
already watches that file (it does, generically, since it watches the whole
file's mtime/size — no per-key changes needed there).

Per-object volumes that live on entities saved as part of level data (e.g.
box/tire `sfxVolume` on `Platform` objects) already persist automatically via
the existing level-patch save mechanism — no separate handling needed. Only
settings that are NOT part of persisted level/platform data (global category
sliders, or per-NPC volumes on bystanders that get recreated fresh from a
hardcoded initial array each load) need the game-settings.json treatment,
keyed by array index for per-NPC volumes.
