# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

- **pursuit-game** (`@workspace/pursuit-game`): "Pursuit — O Preço da Ordem" — jogo de perseguição 2D com física, sistema de HP/stamina, e controles mobile. Clonado de https://github.com/cristianomarianoufsc-ops/Game-Maker
- Movimento recente: mortal curto saindo do wall run quando o jogador pula mantendo a direção contra a parede, usando `@assets/mortal_1776009939272.png`.
- Movimento recente: subida vertical saindo do wall run quando o jogador aperta apenas pulo, usando `@assets/subida_1776012458574.png`; Horácio impulsiona para cima, agarra a borda do muro e sobe.
- Movimento recente: sideflip/segundo pulo atualizado para `@assets/SIDE_FLIP_1776053462942.png`, com animação em 5 quadros, sprite ampliado e trilha curta de partículas azuladas.
- Movimento recente: mergulho ficou mais tolerante; pulo+baixo/baixo+pulo agora têm janela de 420ms, e um pulo inicial ainda pode virar mergulho se o baixo entrar logo depois.
- Ajuste recente: mergulho não pode mais ser convertido depois que o pulo normal já saiu no ar; continua aceitando a janela enquanto há chão/coyote time. A câmera agora acompanha verticalmente quando Horácio sobe acima da tela.
- Ajuste recente: drone agora usa velocidade fixa igual à perseguição base inicial (`DRONE_BASE_SPEED`), sem aceleração extra de catch-up quando Horácio abre distância.
- Editor de fase: deleções de obstáculos/plataformas/paredes agora são salvas no navegador com `localStorage` e reaplicadas após recarregar ou reiniciar a partida; chão continua protegido contra remoção.
- Editor de fase: objetos do tipo `car` agora usam uma caixa de colisão proporcional menor que o sprite visual, permitindo descer o carro até a base visual sem parecer flutuar; a física, seleção e overlay do editor usam essa caixa física.
- Editor de fase: objetos selecionados agora têm botão `HITBOX` abaixo de `DUP`; ao ativar, as alças e o arrasto editam somente a caixa de colisão, mantendo o tamanho visual do sprite. O texto copiado inclui `cw`, `ch`, `cox` e `coy` quando houver colisão customizada.
- Editor de fase: Shift + arrastar uma alça do objeto faz crop visual da imagem (`crop:left,top,right,bottom`) sem alterar a colisão; a caixa de seleção/alças passa a acompanhar a área recortada. `,`/`.` e também Numpad 4/6 navegam entre checkpoints do editor.
- Editor de fase: mover objetos no editor usa snap magnético pelas caixas de colisão, grudando bordas, centros, topo/base e chão quando estiverem próximos; duplicar (`DUP`) cria a cópia encostada ao original em vez de deixar uma folga. Quando há múltiplos objetos selecionados por marquee, o botão muda para `DUP N` e duplica o grupo inteiro mantendo posições relativas.
- Movimento: caixas continuam objetos individuais com física/quebra própria, mas a escalada agora detecta pilhas verticais compostas. A partir de 3 caixas empilhadas permitem subir/montar no topo (1 ou 2 caixas bloqueiam escalada como parede normal); 5 ou mais bloqueiam climb/wall run vertical e deixam apenas o pulo normal, sem renovar o movimento em cada caixa individual.
- Hitboxes inclinadas: caixas de colisão agora podem ter `slopeTop` para transformar o topo em rampa; os carros grandes do ferro velho usam slopes nos vidros frontal/traseiro para Horácio subir do capô/porta-malas até o teto sem agarrar na lateral retangular. No editor, entre em `HITBOX`, clique diretamente na caixa que quer editar, use as setas para mover a hitbox selecionada em 1px (`Shift` = 5px), use `S` ou o botão `+ SLOPE`, e arraste os losangos laranja para ajustar o ângulo. Durante o teste iniciado com `Ctrl`, clicar em um objeto volta para o editor e seleciona aquele objeto.
- Editor de fase: quando há seleção múltipla por marquee ou `Shift + clique`, o botão `DELETAR` apaga todos os objetos selecionados, assim como o botão `DUP` duplica todos; em modo `HITBOX`, `Delete` continua removendo apenas a hitbox selecionada.
- Editor de fase: botão `UPLOAD SPRITE` no topo aceita PNG/WebP transparente, cria um objeto do tipo `sprite` com o nome original do arquivo, salva os sprites no `localStorage` e permite mover, redimensionar, recortar e editar hitbox como os outros objetos.
- Editor de fase: sacadas baixas `platform` com `w:115` e `h:62` agora permitem que a hitbox seja estendida para baixo além da imagem visual pelas alças do modo `HITBOX`, até o chão, para ajustar passagens que exigem rolagem.
- Física: pilhas conectadas de caixas com altura mínima de 3 caixas agora contam como parede escalável para wall run/subida, mas continuam com `type: 'box'`, mantendo a quebra por tiro do drone.
- Fase: removidos permanentemente da geração do ferro velho os pneus/carros/caixas listados pelo usuário em x:13050, 14000, 14050, 14700, 15450, 16250, 17100, 18100, 18600, 19100, 19700, 20200, 20400, 21200, 21600, 22400, 22600, 23400, 24350 e 24700; também removida a lixeira x:20000.
- Fase: carro do ferro velho movido de x:13230 para x:13331; coluna de caixas em x:12440 removida permanentemente.
- Fase: removidas caixas em x:12505 nos níveis y:-332, -387 e -442; adicionada caixa em x:12570 y:-497.
- Editor de fase: ao iniciar um teste pelo editor, o estado atual da fase é salvo em memória; após voltar do teste com Ctrl, duplo clique em uma área vazia restaura caixas/objetos destrutíveis para esse estado e limpa caixas destruídas/caindo.
- Editor de fase: seleção múltipla arrastada agora se comporta como grupo rígido; todas as caixas/objetos selecionados compartilham o mesmo deslocamento, respeitam o limite do chão em conjunto e não se separam durante auto-scroll ou snap magnético.
- Fase: aplicada chave anexada com 28 adições e 32 remoções no ferro velho; carros reposicionados entre x:12795 e x:15260 e pilhas de caixas reorganizadas em x:13355/13420 e x:14107/14172/14237.
- Fase: carro x:14858 yOffset:283 substituído por x:14889 yOffset:283; adicionados carros em x:15148 yOffset:375, x:15334 yOffset:283, x:15521 yOffset:186, x:15705 yOffset:102; removidas caixas em x:16150 y:-55 e y:-110 da pilha 4.
- Editor de fase: aviso de copiado/selecionado deixou de usar tarja central grande e agora aparece como notificação discreta no canto inferior esquerdo para não cobrir botões como DUP, HITBOX e DELETAR.
- Editor de fase: clicar diretamente em um objeto diferente do atualmente selecionado agora o seleciona imediatamente (com cópia dos parâmetros), sem precisar clicar no vazio primeiro; os botões/alças do objeto anterior não interceptam mais o clique.
- Fase: sistema de pneus voadores implementado — 8 pilhas de pneus (3–5 pneus cada) posicionadas na zona x:17180–21150; quando o drone acerta uma pilha, ela some e os pneus são lançados individualmente com física de queda (gravidade, quique amortecido, atrito, rolamento) e renderização rotacionada com raios visíveis; após 7 quiques e velocidade mínima, cada pneu desaparece da cena; pilhas destruídas não reaparecem após resetar o teste do editor.
- Fase: área do ferro velho dobrada — muro final movido de x:16900 para x:21700; chão contínuo estendido de x:12250 até x:21720; zona x:16900–21700 vazia (sem objetos, paredes, lixeiras ou plataformas); muros removidos de x:17600 e x:20900; conteúdo antigo da FREE ZONE 3 e início da WALL ZONE 3 nessa faixa eliminados.
- Editor de fase: adicionado CP3 na navegação por `.`/`,` e Numpad 6/4 apontando para o carro em x:16400 (`w:445`, `h:168`, hitboxes customizadas), antes da zona de pneus voadores.
- Fase: removidas permanentemente as 8 pilhas de pneus voadores em x:17180, 17620, 18150, 18700, 19280, 19860, 20540 e 21150.
- Editor de fase: checkpoint ativo agora aparece em uma tarja destacada no topo, com contador CP atual/total e linha vertical mais forte no mundo para facilitar a navegação por `.`/`,` e Numpad 6/4.
- Editor de fase: adicionados botões clicáveis CP1/CP2/CP3 na barra superior para navegar diretamente entre checkpoints sem usar teclado.
- Editor de fase: botão `+ CP` cria checkpoints temporários na posição atual da câmera; botão `CP JSON` copia os checkpoints novos como JSON para colar no chat e aplicar permanentemente no código/Git.
- Editor de fase: aplicado permanentemente o checkpoint `CP4` em x:21788 a partir do JSON exportado pelo editor.
- Mecânica de pneus pós-CP3: adicionadas pilhas-refúgio (`tireHideout`) usando `@assets/pneu_1776643651883.png`; Horácio renderiza atrás delas, elas bloqueiam tiros do drone sem bloquear o jogador e, ao serem atingidas, viram 4 pneus rolando com `@assets/pneu2_1776643651884.png`.
- Ajuste visual/físico: pneus rolantes gerados por `tireHideout` ao serem atingidos pelo drone ficaram maiores (raio baseado em 46% da largura da pilha, limitado a 44px).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
