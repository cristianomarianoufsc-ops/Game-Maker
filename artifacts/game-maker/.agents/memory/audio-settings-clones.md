---
name: Configurações de áudio entre clones
description: Como distinguir o valor local do navegador da configuração compartilhada pelo projeto.
---

O volume escolhido no editor precisa ser persistido em um arquivo versionado para aparecer após um `git pull` em outro ambiente; `localStorage` só serve como cache local do navegador.

**Why:** Um valor pode parecer salvo no mesmo navegador mesmo quando a gravação no arquivo compartilhado falha, escondendo o problema até trocar de Replit.

**How to apply:** Ao investigar configurações do jogo, confira o JSON versionado e teste a rota de leitura/gravação do preview, em vez de confiar apenas no estado visual do editor ou no `localStorage`.