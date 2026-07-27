---
name: Training camera world offset
description: Regra para manter Horácio visível e balões legíveis quando a sala de treino acompanha a câmera vertical
---

Na sala de treino, o valor de `camera.y` precisa ser aplicado ao mundo renderizado — paredes, chão, Horácio, drone, tiros e partículas — enquanto o fundo, HUD e balões de instrução permanecem presos à viewport.

**Why:** O treino usa obstáculos altos e movimentos verticais; atualizar somente `camera.y` na física faz o personagem desaparecer ou deixa os objetos desalinhados. Balões presos às coordenadas dos muros também podem cobrir o exercício.

**How to apply:** Ao alterar a câmera do treino, mantenha o mundo dentro de `ctx.translate(0, -camera.y)` e desenhe instruções fixas depois de restaurar o contexto. Use a câmera horizontal do modo história para manter o jogador em tela.