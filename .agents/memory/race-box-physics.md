---
name: Selective race box physics
description: How the race mode preserves Story physics only for the explicitly requested junkyard boxes.
---

# Selective race box physics

Na Corrida, a permissão de escalada especial não deve ser aplicada por faixa de X nem à pilha inteira. As caixas selecionadas são identificadas por coordenada e altura, e a decisão acompanha a caixa atualmente tocada; caixas vizinhas permanecem com a física da Corrida.

**Why:** Há caixas sobrepostas e duplicadas entre `level.ts` e `level-patch.json`; uma regra genérica por região altera obstáculos que o usuário não selecionou.

**How to apply:** Recalcule a marca pelas coordenadas finais após carregar ou editar o nível, e use a mesma decisão na física de Horácio e do rival.

## Regra histórica das caixas

A colisão deve usar a face da caixa individual que foi realmente tocada; a pilha conectada serve apenas para identificar a pilha. A altura relativa à face tocada mantém a regra histórica: três caixas podem ser atravessadas/escaladas, enquanto a quarta caixa segura o personagem e não permite passar.

**Why:** Usar o retângulo envolvente da pilha como superfície de colisão transforma a caixa da base em uma parede e faz Horácio agarrar cedo demais.

**How to apply:** Preserve `wallTopY` da caixa real no contato e mantenha a exceção de escalada da Corrida sem drone separada da física da História e da Corrida com drone.