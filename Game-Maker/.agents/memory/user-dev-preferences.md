---
name: User dev preferences
description: Preferências de desenvolvimento e comunicação do usuário do projeto Pursuit
---

# Preferências do usuário

## Comunicação
- Sempre responder em **português brasileiro**
- NÃO traduzir textos do jogo, apenas a conversa

## Desenvolvimento
- **Toda alteração pedida deve funcionar também nos modos de teste do editor (wall-test)**, não apenas no modo história. Nunca restringir comportamentos novos exclusivamente a `gameMode === 'story'` sem avisar o usuário.
- **Why:** O usuário testa features diretamente pelo editor (Ctrl+Testar), sem precisar percorrer o mapa inteiro no modo história.
- **How to apply:** Ao adicionar qualquer lógica nova com condição de modo, verificar se faz sentido restringir ao modo história. Se não for essencial, remover a restrição ou deixar funcionar em ambos.

## Contexto do jogo
- Jogo: "Pursuit — O Preço da Ordem" (plataforma 2D, perseguição)
- Personagem principal: Horácio
- Zona da vila: x 25909–32000
- Ferro velho: x ≈ 12100–21000
- Dog (cachorro do ferro velho): x:19250, patrolLeft:19211, patrolRight:20745
- NPCs 1 e 2 (entrada da vila): x:25970 e x:26090 — só fogem quando drone chega a 500px
- NPCs 3 e 4 (interior da vila): x:27400 e x:28000 — fogem com playerFleeDist:1100
