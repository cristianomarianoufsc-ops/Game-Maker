---
name: Preview do jogo clonado
description: Dependência de recursos compartilhados ao servir o jogo clonado em outro artifact.
---

O jogo clonado referencia imagens e áudios pelo alias `@assets`, que aponta para a pasta compartilhada `attached_assets`. Ao sincronizar o jogo para outro artifact, os recursos referenciados precisam existir nessa pasta do workspace antes de iniciar o preview.

**Why:** A cópia do código iniciou o Vite, mas falhou em tempo de execução quando os assets compartilhados não estavam disponíveis no novo artifact.

**How to apply:** Ao mover ou duplicar esse jogo para outro artifact, liste as referências `@assets/...` no código e sincronize os arquivos correspondentes antes de validar o preview.