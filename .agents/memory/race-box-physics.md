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

## Pilha A: contato superior

Na pilha em `x:12505`, durante a subida, a caixa `GY-275` deve ser resolvida antes da caixa `GY-220` em História e Corrida com drone. Corrida sem drone mantém a ordem original.

**Why:** A trajetória desses modos deve alcançar a caixa superior antes de cair; reordenar todas as caixas ou aplicar a regra na Corrida sem drone altera outros obstáculos.

**How to apply:** Mantenha essa preferência limitada ao par de coordenadas e ativa apenas enquanto `vy < 0`; aplique a mesma opção ao jogador e aos ghosts/rivais.