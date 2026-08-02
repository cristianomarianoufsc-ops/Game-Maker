---
name: Selective race box physics
description: How the race mode preserves Story physics only for the explicitly requested junkyard boxes.
---

# Selective race box physics

Na Corrida, a permissão de escalada especial não deve ser aplicada por faixa de X nem à pilha inteira. As caixas selecionadas são identificadas por coordenada e altura, e a decisão acompanha a caixa atualmente tocada; caixas vizinhas permanecem com a física da Corrida.

**Why:** Há caixas sobrepostas e duplicadas entre `level.ts` e `level-patch.json`; uma regra genérica por região altera obstáculos que o usuário não selecionou.

**How to apply:** Recalcule a marca pelas coordenadas finais após carregar ou editar o nível, e use a mesma decisão na física de Horácio e do rival.

## Contato sem escalada em pilhas altas

Em pilhas conectadas com mais de quatro caixas, a colisão lateral deve usar o topo da caixa atualmente tocada, mas a decisão de permitir escalada deve usar a altura total da pilha. Assim o personagem alcança a quarta caixa, fica agarrado brevemente e desce, sem passar pelo topo.

**Why:** Usar o topo da pilha inteira fazia Horácio parar cedo; usar apenas a altura da face tocada podia liberar a escalada de uma pilha que deveria continuar bloqueada.

**How to apply:** Mantenha separadas a altura do contato (`wallTopY`) e a altura total da pilha (`wallRunBoxStackHeight`) em História e Corrida com drone; preserve a exceção de escalada da Corrida sem drone para pilhas permitidas.