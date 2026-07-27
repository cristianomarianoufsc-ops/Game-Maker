---
name: Large file grep workaround
description: rg (ripgrep) falha silenciosamente em arquivos TypeScript grandes do projeto — usar grep -n como alternativa.
---

# Large File Grep Workaround

## A regra
Para os arquivos abaixo, **nunca usar `rg`** — ele retorna zero resultados sem erro, induzindo o agente a concluir que o código não existe.

Usar sempre: `grep -n "padrão" caminho/do/arquivo`

## Arquivos afetados
| Arquivo | Tamanho |
|---|---|
| `artifacts/pursuit-game/src/game/Game.tsx` | ~250 KB |
| `artifacts/pursuit-game/src/game/render.ts` | ~245 KB |
| `artifacts/pursuit-game/src/game/physics.ts` | ~86 KB |

## Exemplo correto
```bash
grep -n "ghostTrail" artifacts/pursuit-game/src/game/Game.tsx
grep -n "drawBystanders" artifacts/pursuit-game/src/game/render.ts
grep -n "updateBystanders" artifacts/pursuit-game/src/game/physics.ts
```

## Por que acontece
`rg` com `--type ts` aplica filtros internos que podem descartar arquivos acima de um threshold de tamanho ou com linhas muito longas. O resultado é saída vazia sem mensagem de erro — armadilha clássica.

**Why:** Um agente concluiu erroneamente que o Ghost Trail Recorder não existia porque `rg` não retornou nada em Game.tsx, quando na verdade havia 69 ocorrências de "ghost" no arquivo.
