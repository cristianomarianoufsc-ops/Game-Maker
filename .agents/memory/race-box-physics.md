---
name: Selective race box physics
description: How the race mode preserves Story physics only for the explicitly requested junkyard boxes.
---

# Selective race box physics

Na Corrida, a permissão de escalada especial não deve ser aplicada por faixa de X nem à pilha inteira. As caixas selecionadas são identificadas por coordenada e altura, e a decisão acompanha a caixa atualmente tocada; caixas vizinhas permanecem com a física da Corrida.

**Why:** Há caixas sobrepostas e duplicadas entre `level.ts` e `level-patch.json`; uma regra genérica por região altera obstáculos que o usuário não selecionou.

**How to apply:** Recalcule a marca pelas coordenadas finais após carregar ou editar o nível, e use a mesma decisão na física de Horácio e do rival.