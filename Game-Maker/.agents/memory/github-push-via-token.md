---
name: GitHub push via token
description: Como fazer push para o origin usando GITHUB_TOKEN sem expor credenciais — obrigatório ao fim de cada sessão de trabalho.
---

## Regra

O autosave (`scripts/level-autosave.sh`) faz push automático a cada mudança detectada, mas pode falhar silenciosamente quando:
- O workflow é reiniciado antes de detectar mudanças
- O token não estava disponível no momento do push
- O ambiente Replit foi hibernado e retomado

**Resultado:** commits acumulam localmente mas não chegam ao GitHub, e o outro Replit (ou outro agente) fica desatualizado.

## Como verificar e corrigir

```bash
# 1. Checar quantos commits locais ainda não foram pushados
git fetch origin --quiet && git rev-list --count origin/main..HEAD

# 2. Se retornar > 0, fazer push com token:
ORIGIN_URL=$(git remote get-url origin)
AUTH_URL=$(echo "$ORIGIN_URL" | sed "s|^https://|https://x-access-token:${GITHUB_TOKEN}@|")
git push "$AUTH_URL" HEAD:main
```

**Why:** O remote `origin` usa HTTPS sem credenciais embutidas. O `GITHUB_TOKEN` já está disponível como variável de ambiente no Replit — basta injetá-lo na URL via `sed` antes do push. Nunca exibir ou logar o valor do token.

**How to apply:** Rodar o bloco de verificação/push no final de qualquer sessão de trabalho que envolva edições de código, independente de o autosave estar ativo. Custo: 2 segundos.
