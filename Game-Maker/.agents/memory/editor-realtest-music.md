---
name: Editor real-test music fix
description: Usar startBeatMP3Forced() ao entrar no modo teste real (/) para evitar silêncio e preservar preferência de música do usuário
---

# Editor real-test music

## Regra
Ao pressionar `/` no editor para iniciar o modo teste real, chamar `startBeatMP3Forced()` — nunca `stopBeat() + setMusicType('mp3') + startBeat()`.

**Why:** `startBeat()` tem guard `if (_beatOn) return` que pode silenciar música se _beatOn ficou true de chamada assíncrona anterior. E `setMusicType('mp3')` persiste no localStorage, sobrescrevendo a preferência chiptune/mp3 do usuário permanentemente.

## How to apply
- `startBeatMP3Forced()` em `audio.ts`: chama `stopBeat()` (limpa estado), seta `_beatOn = true`, chama `_startMP3()` diretamente sem mudar `_musicType`
- Não persiste nada em localStorage — preferência do usuário é preservada
- Está em `Game.tsx` linha ~3798 (dentro do bloco `editorRealStoryJustPressed`)
