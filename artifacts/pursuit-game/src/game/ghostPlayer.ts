import type { Player, Platform, Keys } from './types';
import {
  PLAYER_W, PLAYER_H, GROUND_Y, CANVAS_H, DIVE_ENERGY_MAX, PLAYER_MAX_HEALTH, WALLRUN_DURATION,
} from './constants';
import { updatePlayer } from './physics';

// ── Parâmetros de comportamento da IA ────────────────────────────────────────
const LOOK_SHORT_PX      = 130; // lookahead para obstáculos baixos (lixeiras, boxes)
const LOOK_TALL_PX       =  55; // lookahead para muros altos — pula perto, não longe!
const POTHOLE_LOOK_PX    = 200; // lookahead normal para buracos
const POTHOLE_URGENT_PX  =  70; // lookahead de emergência — pula ignorando cooldown
const JUMP_CLEAR_PX      = 296; // distância real de um pulo do chão ao toco (calculada)
// ── Zona do rio (tocos de madeira) ───────────────────────────────────────────
// Posições exatas dos tocos (x da borda esquerda, w=60 cada). Geometria idêntica
// para os dois rios (mesmo STUMP_W/STUMP_RISE em level.ts) — só a posição X muda,
// então a mesma física de approach/freio serve para ambos.
const RIVER_STUMP_XS   = [24960, 25160, 25360, 25560] as const;
const RIVER_END_X      = 25753;  // onde o chão sólido recomeça
const RIVER2_STUMP_XS  = [29720, 29920, 30120, 30320] as const;
const RIVER2_END_X     = 30450;  // onde o chão sólido recomeça (rio 2)
const RIVER_STUMP_W    = 60;     // largura de cada toco
// Pulo chão→toco1: com diff de altura (GY→GY-22), ghost cobre ~296px horizontal.
// Janela de disparo: approachTriggerMin = STUMP_XS[0] - RIVER_APPROACH_PX - 40.
// approachTriggerMin deve garantir distância ao toco ≤ 296px ao disparar.
// Trail pós-mortem mostrou disparo em gRight≈24658 (dist=302) → faltou 6px.
// 270→240: disparo em gRight≈24680, mas ghost.x≈24950 = 10px ANTES do toco (miss!).
// 240→220: trigger atrasa 2 frames → disparo em gRight≈24700, ghost.x≈24970 = 10px dentro ✓
const RIVER_APPROACH_PX = 220;   // dispara 220px antes do toco1 (borda esquerda da janela)
// Pulo toco→toco: mesmo nível = 307px (overshoot). Freio (right=false nos últimos
// ~19 frames) reduz para ~204px, pousando no centro do próximo toco.
const RIVER_BRAKE_DELAY = 467;   // ms de right=true antes do freio (28 frames @60fps)
const TALL_THRESHOLD  = 100; // px: acima disso → muro alto, exige wall-run
const JUMP_HOLD_MS    = 300; // ms que mantém espaço pressionado (altura máxima)
const JUMP_COOLDOWN_MS = 450; // ms entre pulos (evita spam)
const STUCK_GROUND_MS = 600; // ms parado no chão → força pulo
const STUCK_AIR_MS    = 800; // ms preso no ar (wall) → força pulo de saída
const GROUND_GAP_CHK  = 160; // px para verificar se o chão continua
const MARQUISE_MAX_H  =  85; // px: plataforma elevada passável por baixo rolando

// ── Zona Fire Escape 1: escada em x:22100, pular sobre muro em x:22562 ──────
// O ghost sobe a escada sem derivar lateralmente (fase 1: right=false, up=true),
// depois na altura certa deriva à direita para pousar na plataforma do topo
// (fase 2: right=true, up=true) e salta por cima do muro inserido pelo usuário.
const FE1_LADDER_X   = 22100;          // borda esquerda da escada
const FE1_LADDER_W   = 60;             // largura (center=22130)
const FE1_WALL_X     = 22562;          // x do muro bloqueante (h ≥ 1000)
const FE1_TOP_Y      = GROUND_Y - 1320; // y dos pés no topo (= −910)
const FE1_TOP_PLAT_R = 22315;          // borda direita da plataforma do topo
const FE1_PHASE2_Y   = FE1_TOP_Y - 10; // −920: y para acionar saída lateral

// ── Zona Escadaria Topo: degrau x:31209 (y:GY-720) → plataforma x:31700 ─────
// O degrau desce da esq (GY-861) para a dir (GY-720). O roofJump não detecta
// o degrau como plataforma-base porque py0=GY-720 ≠ gFeet (varia ao longo do
// slope, tolerância 6px nunca satisfeita na janela de disparo).
// Escadaria x:31209 → telhado x:31700
const TELHADO_STAIR_MIN  = 31200;           // x mínimo da escadaria
const TELHADO_STAIR_MAX  = 31640;           // x máximo (antes do muro)
const TELHADO_WALL_X     = 31676;           // muro bloqueante noHang
const TELHADO_WALL_TOP   = GROUND_Y - 843;  // topo do muro = -433
const TELHADO_PLAT_X     = 31700;           // início do telhado oneWay

// ── Estado interno da IA por instância ──────────────────────────────────────
interface AIState {
  jumpHoldTimer:       number;
  jumpCooldown:        number;
  stuckTimer:          number;  // no chão
  airStuckTimer:       number;  // no ar preso no muro
  lastX:               number;
  lastY:               number;
  wallActionDone:      boolean; // já acionou space ao bater no muro nessa "escalada"
  wasOnWall:           boolean; // estava em wall-run/climb no frame anterior
  wasOnGround:         boolean; // estava no chão no frame anterior (detecta transição air→ground)
  recentWallLanding:   number;  // ms desde que saiu de wall-run — expande urgência de buraco
  riverBrakeDelay:     number;  // (legado — não usado; mantido para evitar reset de init)
  riverBraking:        boolean; // freio ativo: right=false para encurtar pulo toco→toco
  riverOnStumpTimer:   number;  // ms desde que estava sobre um toco (estende janela de detecção)
  riverStumpAirborne:  boolean; // true após pular de um toco (até pousar no próximo)
  riverTargetStumpIdx: number;  // índice em RIVER_STUMP_XS do toco-alvo do pulo atual (-1 = sem alvo)
  decision:            string;  // última decisão tomada — gravada no ghost-debug.json
  lastWallNoHang:      boolean; // última wall-run foi em muro noHang
  lastWallNoHangShort: boolean; // o muro noHang era "curto" (h<500) → usa tictac; se false → usa REJUMP cíclico
  tictacFlyLeft:       boolean; // voando à esquerda para a placa — manter left+space
  telhadoMode:         boolean; // modo programado: escadaria x:31209 → telhado x:31700
  tictacFlyTimer:      number;  // ms restantes no modo tic-tac flight
  replayFrames:        Keys[] | null; // inputs gravados do jogador humano para replay
  replayIdx:           number;        // índice do próximo frame de replay a consumir
  fe1Phase:            number;        // 0=inativo, 1=subindo escada FE1, 2=saindo/saltando
}

const _aiMap = new WeakMap<Player, AIState>();

function getAI(ghost: Player): AIState {
  if (!_aiMap.has(ghost)) {
    _aiMap.set(ghost, {
      jumpHoldTimer:      0,
      jumpCooldown:       0,
      stuckTimer:         0,
      airStuckTimer:      0,
      lastX:              ghost.x,
      lastY:              ghost.y,
      wallActionDone:     false,
      wasOnWall:          false,
      wasOnGround:        false,
      recentWallLanding:  0,
      riverBrakeDelay:    0,
      riverBraking:       false,
      riverOnStumpTimer:  0,
      riverStumpAirborne:  false,
      riverTargetStumpIdx: -1,
      decision:            'IDLE',
      lastWallNoHang:      false,
      lastWallNoHangShort: false,
      tictacFlyLeft:      false,
      telhadoMode:        false,
      tictacFlyTimer:     0,
      replayFrames:       null,
      replayIdx:          0,
      fe1Phase:           0,
    });
  }
  return _aiMap.get(ghost)!;
}

function requestJump(ai: AIState, holdMs = JUMP_HOLD_MS): void {
  if (ai.jumpCooldown > 0) return;
  ai.jumpHoldTimer  = holdMs;
  ai.jumpCooldown   = JUMP_COOLDOWN_MS;
  ai.stuckTimer     = 0;
  ai.airStuckTimer  = 0;
}

// Pulo urgente — ignora cooldown. Usado quando cair é fatal (buraco, abismo).
function requestJumpUrgent(ai: AIState, holdMs = JUMP_HOLD_MS): void {
  ai.jumpHoldTimer  = holdMs;
  ai.jumpCooldown   = JUMP_COOLDOWN_MS;
  ai.stuckTimer     = 0;
  ai.airStuckTimer  = 0;
}

// ── Carrega gravação de inputs do jogador humano no ghost para replay ─────────
// Chame após createGhostPlayer para fazer o ghost reproduzir exatamente os
// movimentos gravados em vez de usar a IA. Quando os frames acabarem, o ghost
// volta para a IA normal automaticamente.
export function loadGhostRecording(ghost: Player, frames: Keys[]): void {
  const ai = getAI(ghost);
  ai.replayFrames = frames;
  ai.replayIdx    = 0;
}

// ── Cria um ghost player na posição indicada ─────────────────────────────────
export function createGhostPlayer(x: number, y: number): Player {
  return {
    x, y,
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    state: 'idle',
    facingRight: true,
    onGround: false,
    touchingWall: false,
    touchingLadder: false,
    ladderCenterX: 0,
    wallX: 0, wallTopY: GROUND_Y, wallSide: null,
    health: PLAYER_MAX_HEALTH, maxHealth: PLAYER_MAX_HEALTH,
    invincible: false, invincibleTimer: 0,
    hurtStunTimer: 0,
    rollTimer: 0, isRolling: false,
    isClimbing: false,
    animFrame: 0, animTimer: 0,
    distanceTraveled: 0,
    coyoteTime: 0,
    peakFallVy: 0, fallApexY: y,
    autoRoll: false,
    diveLandingRoll: false,
    postDiveJumpLocked: false,
    diveEnergy: DIVE_ENERGY_MAX,
    landingRollFrame: 0,
    jumpOriginGroundY: 0,
    landingCrouch: false, landingCrouchTimer: 0,
    isCrouching: false, forcedCrouch: false,
    isDivejumping: false,
    isWallRunning: false, wallRunTimer: 0,
    wallRunOnBox: false, wallRunBoxStackCount: 0, wallRunBoxStackHeight: 0,
    isWallFlipping: false, wallFlipTimer: 0,
    isWallClimbUp: false,
    wallClimbTimer: 0,
    wallClimbAdjustedDuration: 720,
    wallClimbLiftAmount: 86,
    wallClimbJumpPenalty: 1.0,
    wallClimbStartX: 0, wallClimbStartY: 0,
    wallClimbTargetX: 0, wallClimbTargetY: 0,
    wallClimbSide: null,
    isWallHanging: false,
    wallHangJumpConsumed: false,
    wallHangQuickJump: false,
    wallLowImpulse: false,
    jumpedFromWall: false,
    wallNoClimbOver: false, wallNoHang: false,
    onTictacWall: false, tictacJumpConsumed: false,
    jumpCount: 0, doubleJumpReady: false,
    isSideFlipping: false, sideFlipTimer: 0, sideFlipImmune: false,
    killedByFall: false,
    kongVaultPhase: null, kongVaultTimer: 0, kongVaultLanding: false, kongVaultIsObstacle: false,
  };
}

// ── Cérebro da IA ────────────────────────────────────────────────────────────
export function computeGhostKeys(
  ghost: Player,
  platforms: Platform[],
  dt: number,
): Keys {
  const ai = getAI(ghost);

  // ── Modo replay: reproduz inputs gravados do jogador humano ──────────────
  if (ai.replayFrames && ai.replayIdx < ai.replayFrames.length) {
    const frame = ai.replayFrames[ai.replayIdx++];
    ai.decision = `REPLAY:${ai.replayIdx}/${ai.replayFrames.length}`;
    return frame;
  }
  if (ai.replayFrames && ai.replayIdx >= ai.replayFrames.length) {
    // Replay acabou — aquece estado da IA com posição atual para evitar pausa
    // na transição. Durante o replay o bloco acima retornava early, então
    // wasOnGround/wasOnWall/lastX/lastY ficam com valores de spawn (frios).
    // Sem aquecimento, o frame de transição tem dxMoved gigante, justLanded
    // falso positivo e contexto de detecção zerado — pode gerar 1+ frames de
    // right:false ou space:false antes da IA estabilizar.
    ai.replayFrames  = null;
    ai.replayIdx     = 0;
    ai.wasOnGround   = ghost.onGround;
    ai.wasOnWall     = ghost.isWallRunning || ghost.isWallClimbUp || ghost.isWallHanging;
    ai.lastX         = ghost.x;
    ai.lastY         = ghost.y;
    ai.stuckTimer    = 0;
    ai.airStuckTimer = 0;
    ai.decision      = 'REPLAY:DONE';
    // Retorna right:true direto neste frame de transição — evita passar pelo
    // bloco de detecção de terreno com estado ainda frio.
    return { right: true, left: false, up: false, down: false, space: false, shift: false, z: false, dive: false };
  }

  // Tick de timers
  if (ai.jumpHoldTimer      > 0) ai.jumpHoldTimer      -= dt;
  if (ai.jumpCooldown       > 0) ai.jumpCooldown       -= dt;
  if (ai.recentWallLanding  > 0) ai.recentWallLanding  -= dt;
  if (ai.tictacFlyTimer     > 0) ai.tictacFlyTimer     -= dt;

  // Freio do rio: contagem até ativar right=false para encurtar pulo toco→toco
  if (ai.riverBrakeDelay > 0) {
    ai.riverBrakeDelay -= dt;
    if (ai.riverBrakeDelay <= 0) ai.riverBraking = true;
  }
  // Reset do freio SOMENTE na transição air→ground (justLanded), não em cada frame de
  // onGround. Sem isso, o frame N+1 após o pulo do toco ainda tem onGround=true e reseta
  // riverBrakeDelay=0, cancelando os 467ms recém-setados pelo stumpFires no frame N.
  const justLanded = ghost.onGround && !ai.wasOnGround;
  if (justLanded) {
    ai.riverBrakeDelay      = 0;
    ai.riverBraking         = false;
    ai.riverStumpAirborne   = false;
    ai.riverTargetStumpIdx  = -1;
  }
  ai.wasOnGround = ghost.onGround;

  // Timer "sobre toco": mantém onStump ativo por 150ms mesmo após ghost sair da borda.
  // Isso garante que stumpFires dispare mesmo se ghost.onGround já virou false
  // antes do próximo frame de IA (ghost escorregou pela borda no mesmo frame do pouso).
  const overStumpNow = ghost.onGround && (RIVER_STUMP_XS as readonly number[]).concat(RIVER2_STUMP_XS).some(
    sx => ghost.x + ghost.w > sx && ghost.x < sx + RIVER_STUMP_W,
  );
  if (overStumpNow) {
    ai.riverOnStumpTimer = 150;
  } else if (ai.riverOnStumpTimer > 0) {
    ai.riverOnStumpTimer -= dt;
  }

  // Detecta transição de saída do wall-run/climb → marca janela de 400ms
  const onWallNow = ghost.isWallRunning || ghost.isWallClimbUp || ghost.isWallHanging;
  if (ai.wasOnWall && !onWallNow) {
    ai.recentWallLanding = 400; // janela pós-wall-run: urgência de buraco ampliada
    if (ai.lastWallNoHang && ai.lastWallNoHangShort) {
      // Ghost acabou de ser lançado à ESQUERDA pelo wall-run jump de um muro noHang
      // CURTO (ex: x:36321, h=376) que tem placa tic-tac próxima.
      // Physics (linha 741) seta p.vx=+6.5 instantaneamente se keys.right=true,
      // matando o vx=-9 do pulo e impedindo alcançar a placa tic-tac.
      // Ativar tictacFlyLeft: AI vai pressionar left+space até tocar a placa.
      ai.tictacFlyLeft  = true;
      ai.tictacFlyTimer = 700; // 700ms: placa a ~152px a vx=6.5 ≈ 350ms + margem
    }
    // Muros noHang ALTOS (ex: x:31676, h=844) sem placa tic-tac usam ciclos REJUMP
    // (climbableWallTouching section 5) — não precisam de tictacFlyLeft.
  }
  ai.wasOnWall = onWallNow;

  // ── Stuck detection ──────────────────────────────────────────────────────
  const dxMoved = Math.abs(ghost.x - ai.lastX);
  const dyMoved = Math.abs(ghost.y - ai.lastY);

  if (ghost.onGround) {
    if (dxMoved < 1.5) {
      ai.stuckTimer += dt;
    } else {
      ai.stuckTimer = 0;
    }
    ai.airStuckTimer = 0;
    ai.wallActionDone = false; // resetar ao tocar o chão
  } else {
    // No ar: detecta se está preso contra um muro (sem subir nem descer)
    if (ghost.touchingWall && dxMoved < 1.0 && dyMoved < 2.0) {
      ai.airStuckTimer += dt;
    } else {
      ai.airStuckTimer = 0;
    }
    ai.stuckTimer = 0;
  }
  ai.lastX = ghost.x;
  ai.lastY = ghost.y;

  const gRight = ghost.x + ghost.w;
  const gFeet  = ghost.y + ghost.h;

  // ── 0.5) Zona Fire Escape 1: escada x:22100 → muro x:22562 ──────────────
  // Fase 1 (FE1:CLIMB): ghost está dentro da coluna da escada. Envia
  //   right=false + up=true → vx=0 durante o climb, zero deriva lateral,
  //   ghost sobe ancorado no centro (x=22117) até FE1_PHASE2_Y=−920.
  // Fase 2 (FE1:TOP_*): ghost deriva à direita enquanto sobe os últimos 10 px
  //   (right=true + up=true → vx=3.9 em climb, vy=−3.52). Ao sair da escada
  //   (x > 22160) cai sobre a plataforma do topo (y=−910) pela colisão
  //   padrão. Depois corre até a borda (gRight≥22290) e pula com force total.
  //   O arco eleva o ghost ≈108 px acima do topo do muro (y=−851) → cruza.
  {
    const fe1WallExists = platforms.some(p =>
      p.x === FE1_WALL_X && (p.h ?? 0) >= 1000,
    );
    if (!fe1WallExists) {
      ai.fe1Phase = 0; // muro removido → desativa zona
    } else {
      // Entrar fase 1 ao entrar na coluna da escada
      if (ai.fe1Phase === 0 &&
          gRight >= FE1_LADDER_X &&
          ghost.x < FE1_LADDER_X + FE1_LADDER_W) {
        ai.fe1Phase = 1;
      }
      // Fase 1 → 2: 10 px acima do topo → deriva lateral para sair da escada
      if (ai.fe1Phase === 1 && gFeet <= FE1_PHASE2_Y) {
        ai.fe1Phase = 2;
      }
      // Reset ao cruzar o muro
      if (ai.fe1Phase === 2 && gRight > FE1_WALL_X + 100) {
        ai.fe1Phase = 0;
      }
    }

    if (ai.fe1Phase === 1) {
      ai.decision = 'FE1:CLIMB';
      return {
        right: false, left: false, up: true, down: false,
        space: false, shift: false, z: false, dive: false,
      };
    }

    if (ai.fe1Phase === 2) {
      // Pula ao chegar perto da borda direita do patamar do topo
      const shouldJump =
        ghost.onGround &&
        gFeet <= FE1_TOP_Y + 40 &&
        gRight >= FE1_TOP_PLAT_R - 25;
      if (shouldJump && ai.jumpCooldown <= 0) {
        ai.decision = 'FE1:TOP_JUMP';
        requestJumpUrgent(ai, JUMP_HOLD_MS);
      } else {
        ai.decision = 'FE1:TOP_RUN';
      }
      return {
        right: true, left: false, up: true, down: false,
        space: ai.jumpHoldTimer > 0,
        shift: false, z: false, dive: false,
      };
    }
  }

  // ── 0.7) Modo programado: escadaria x:31209 → telhado x:31700 ───────────────
  // CAMINHO CANÔNICO (gravado em ghost-debug.json, spawnX≈31162):
  //   1. Ghost percorre a escadaria (slope GY-861→GY-720) em direção direita,
  //      pulando sobre os degraus do slope (JUMP:TALL_WALL) — raramente onGround.
  //   2. Bate no muro x:31676 (noHang, h=844) e inicia CLIMB_WALL.
  //   3. JUMP:ROOF_GAP dispara o pulo inicial → wall-run ativa.
  //   4. Ciclos WALL_RUN (space:false para muro noHang alto → sem ejeção lateral;
  //      timer expira → vy=-3.5 ainda subindo → nova wall-run imediata, +157px/ciclo).
  //   5. Quando pés superam TELHADO_WALL_TOP (y_feet ≤ GY-843), TELHADO:CRUZAR
  //      retorna right:true sem space → ghost flutua por cima do muro e pousa no
  //      telhado oneWay x:31700 (y:GY-844, w:600, h:18).
  //
  // BUG ANTERIOR: entrada exigia ghost.onGround, mas o ghost está airborne
  // durante quase todo o percurso da escadaria (saltando sobre os degraus do slope).
  // FIX: ativar telhadoMode assim que ghost.x entra na faixa TELHADO_STAIR_MIN..
  // TELHADO_WALL_X+20, independente de estar no chão ou no ar.

  // Entra no modo ao entrar na zona da escadaria (no chão OU no ar)
  if (!ai.telhadoMode &&
      ghost.x >= TELHADO_STAIR_MIN && ghost.x <= TELHADO_WALL_X + 20) {
    ai.telhadoMode = true;
  }
  // Sai do modo ao pousar no telhado
  if (ai.telhadoMode && ghost.onGround && ghost.x >= TELHADO_PLAT_X) {
    ai.telhadoMode = false;
  }

  // ── 1) Escalando escada ou ladder ativo → manter up ──────────────────────
  // Pula quando estados de parede estão ativos (seções 2-4 têm prioridade) ou
  // quando o ghost está no chão tocando parede climbable (seção 10 vai fazer
  // pulo+wall-run; não queremos subir de escada aqui).
  // EXCLUIR muros noHang: touchingLadder fica true em muros climbable+noHang mas
  // a física não permite isClimbing → ghost ficaria preso deslizando para baixo.
  // Muros noHang caem para a seção 5 (climbableWallTouching + REJUMP).
  if (
    (ghost.isClimbing || ghost.touchingLadder) &&
    !ghost.wallNoHang &&
    !ghost.isWallRunning &&
    !ghost.isWallClimbUp &&
    !ghost.isWallHanging &&
    !(ghost.touchingWall && ghost.onGround)
  ) {
    ai.decision = 'CLIMB';
    return { right: true, left: false, up: true, down: false, space: false, shift: false, z: false, dive: false };
  }

  // ── 1.5) Tic-tac flight: voando à esquerda após wall-run de muro noHang ─────
  // Quando o ghost pula esquerda do muro x:36321 (noHang), a física aérea seta
  // p.vx=+6.5 instantaneamente se keys.right=true (physics.ts linha 741).
  // Isso mata o vx=-9 do wall-run jump antes do ghost atingir a placa tic-tac.
  // Solução: pressionar left+space durante o voo. Ao tocar a placa (onTictacWall),
  // o tic-tac dispara automaticamente (intoWall=keys.left+wallSide='left' → vx=+8).
  if (ai.tictacFlyLeft) {
    if (ghost.onTictacWall) {
      // Placa atingida — tic-tac vai disparar com keys.left → voltar ao modo normal
      ai.tictacFlyLeft  = false;
      ai.tictacFlyTimer = 0;
    } else if (ai.tictacFlyTimer > 0 && !ghost.onGround) {
      ai.decision = 'TICTAC:FLY';
      return { right: false, left: true, up: false, down: false, space: true, shift: false, z: false, dive: false };
    } else {
      ai.tictacFlyLeft  = false;
      ai.tictacFlyTimer = 0;
    }
  }

  // ── 2) Wall-RUN ativo → pressiona right + space para acionar isWallClimbUp ─
  //   A física exige: (keys.space || keys.up) && pressingForwardIntoWall
  //   Sem isso o wall-run expira e o ghost cai de volta.
  //
  //   MURO noHang: physics.ts ejects vx=-WALLRUN_JUMP_VX no frame em que
  //   _timerWindow = wallRunTimer < WALLRUN_DURATION-160 dispara (linha 588).
  //   Porém a movement section roda NO MESMO updatePlayer e sobrescreve
  //   p.vx = +effectiveSpeed se keys.right=true (linha 741-742).
  //   Fix: quando o timer está a ≤10ms do threshold de ejeção, trocamos
  //   right→left; a movement section então aplica vx=-effectiveSpeed (esquerda ✓)
  //   em vez de +effectiveSpeed (direita ✗), preservando o vôo para a placa tic-tac.
  // ── 1.9) Passo acima do muro x:31676 → cruza para o telhado ─────────────────
  // Quando os pés do ghost ultrapassam o topo do muro (y_feet ≤ TELHADO_WALL_TOP),
  // a colisão horizontal do muro cessa (sem sobreposição vertical) e o ghost pode
  // mover direita livremente. Pressionar right sem space/up evita re-acionar wall-run
  // ou wall-climb, deixando o ghost cruzar e cair sobre o telhado oneWay x:31700.
  // Esta seção fica ANTES da seção 2 para anular wall-run quando já acima do muro.
  if (ai.telhadoMode && !ghost.onGround &&
      ghost.y + ghost.h <= TELHADO_WALL_TOP &&
      ghost.x >= TELHADO_WALL_X - 30 && ghost.x < TELHADO_PLAT_X + 200) {
    ai.decision = 'TELHADO:CRUZAR';
    return { right: true, left: false, up: false, down: false, space: false, shift: false, z: false, dive: false };
  }

  if (ghost.isWallRunning) {
    ai.lastWallNoHang = ghost.wallNoHang;
    if (ghost.wallNoHang) {
      // Determina se o muro noHang é "curto" (h<500 → usa tictac, ex: x:36321)
      // ou "alto" (h≥500 → usa ciclos REJUMP, ex: x:31676 h=844).
      // Calculado uma vez por wall-run (quando wallRunTimer ≈ 0 = primeiro frame).
      const noHangWallNow = platforms.find(p =>
        p.type === 'wall' && p.noHang &&
        p.x < gRight + 10 && p.x + (p.w ?? 20) > ghost.x - 10,
      );
      if (noHangWallNow) {
        ai.lastWallNoHangShort = (noHangWallNow.h ?? 0) < 500;
      }
    }
    ai.decision = 'WALL_RUN';
    // Muro noHang CURTO (ex: x:36321, h=376, placa tic-tac à esquerda):
    // troca right→left nos últimos 10ms antes da ejeção para que movement section
    // aplique vx negativo (esquerda) preservando o vôo para a placa tic-tac.
    if (ghost.wallNoHang && ai.lastWallNoHangShort && ghost.wallRunTimer < WALLRUN_DURATION - 150) {
      return { right: false, left: true, up: false, down: false, space: true, shift: false, z: false, dive: false };
    }
    // Muro noHang ALTO (ex: x:31676, h=844) em telhadoMode:
    // SEM space → physics nunca dispara o eject (canJumpOffWall && keys.space na
    // linha 588 da física). O timer expira naturalmente (750ms), isWallRunning=false,
    // vy=-3.5 ainda subindo → wall-run re-ativa imediatamente (vy<-2.5 ✓).
    // Resultado: cadeia contínua de +157px/ciclo sem voo lateral.
    if (ghost.wallNoHang && !ai.lastWallNoHangShort) {
      return { right: true, left: false, up: false, down: false, space: false, shift: false, z: false, dive: false };
    }
    return { right: true, left: false, up: false, down: false, space: true, shift: false, z: false, dive: false };
  }

  // ── 3) Wall-climb ativo (animação de subir a borda) → mantém right+space ──
  //   Chega ao hang com right+space: wallHangJumpConsumed = space && !right = false
  //   → dispara pulo imediatamente ao chegar no topo
  if (ghost.isWallClimbUp) {
    ai.decision = 'WALL_CLIMB';
    return { right: true, left: false, up: false, down: false, space: true, shift: false, z: false, dive: false };
  }

  // ── 4) Wall-hang: pendurado no muro → right+space → pula por cima ─────────
  if (ghost.isWallHanging && !ghost.wallHangJumpConsumed) {
    ai.decision = 'WALL_HANG';
    requestJump(ai, JUMP_HOLD_MS);
    return { right: true, left: false, up: false, down: false, space: true, shift: false, z: false, dive: false };
  }

  // ── 4.5) Muro climbable iminente (≤ 30px, ainda não tocado): pula com vx alto ──
  // PROBLEMA: quando o ghost encosta no muro (touchingWall=true), a resolução de
  // colisão zera p.vx=0. No frame seguinte, incomingVx=0 → condição do wall-run
  // (Math.abs(incomingVx) > 3) falha → wall-run nunca ativa → ghost fica preso.
  // SOLUÇÃO: detectar o muro 30px antes de encostar e pular enquanto ainda tem
  // incomingVx ≈ PLAYER_SPEED=6.5 > 3. O ghost bate na parede ainda subindo,
  // com velocidade horizontal suficiente para ativar o wall-run.
  // Com 30px de distância e PLAYER_SPEED=6.5: o ghost cobre esses 30px em ≈5
  // frames (83ms) e rise ≈54px antes de tocar a parede → wall-run ativa com
  // vy≈-10 (<-2.5 ✓) e incomingVx=6.5 (>3 ✓).
  const CLIMB_WALL_PRE_PX = 30;
  const climbableWallClose =
    !ghost.touchingWall &&
    ghost.onGround &&
    platforms.some(p =>
      p.type === 'wall' && p.climbable &&
      p.x >= gRight && p.x < gRight + CLIMB_WALL_PRE_PX &&
      p.y < gFeet && p.y + p.h > ghost.y,
    );

  if (climbableWallClose && ai.jumpCooldown <= 0) {
    ai.decision = 'JUMP:CLIMB_APPROACH';
    requestJumpUrgent(ai, JUMP_HOLD_MS);
  }

  // ── 5) Parede climbable tocada → up ──────────────────────────────────────
  const climbableWallTouching =
    ghost.touchingWall &&
    platforms.some(p =>
      p.type === 'wall' && p.climbable &&
      p.x < gRight + 10 && p.x + p.w > ghost.x - 10 &&
      p.y < gFeet && p.y + p.h > ghost.y,
    );

  if (climbableWallTouching) {
    ai.decision = 'CLIMB_WALL';
    // Fallback: se o ghost chegou ao muro SEM o pre-jump (ex: spawn colado na
    // parede ou cooldown ativo ao detectar o muro), faz micro-pulo urgente para
    // sair do chão. Ideal é o climbableWallClose (4.5) acima, que garante
    // incomingVx>3 para ativar wall-run. Este path tem incomingVx=0 (vx zerado
    // pela colisão) mas ainda é melhor que nada — pode funcionar se vy<-2.5
    // for suficiente para a física aceitar o wall-run marginal.
    if (ghost.onGround) {
      requestJumpUrgent(ai, 80);
      // SEM up:true — up ativa isClimbing em physics:838 ANTES do wall-run trigger
      // em physics:1032, bloqueando o wall-run. Com apenas space+right, o pulo
      // dispara com vy=-13 e wall-run ativa normalmente no primeiro frame de contato.
      return { right: true, left: false, up: false, down: false, space: ai.jumpHoldTimer > 0, shift: false, z: false, dive: false };
    } else if (!ghost.isWallRunning && ghost.vy > 2) {
      // Ghost retornou ao muro climbable enquanto CAINDO (após ejeção de wall-run
      // anterior). O wall-run exige vy < -2.5 (subindo) — sem um pulo agora o
      // ghost cai até o chão e recomeça do zero, sem acumular altura.
      //
      // Muros climbables muito altos (ex: x:31676, h:844px) exigem 4-5 wall-runs
      // encadeados. Cada ejeção (vx=-9, vy=-13) faz o ghost voar à esquerda e
      // retornar; mas na chegada já está caindo (vy>0). Este pulo urgente converte
      // a chegada caindo em subida → ativa novo wall-run do ponto atual (sem cair
      // ao chão), permitindo escalada progressiva: ~157px por ciclo.
      //
      // Não usa wallActionDone (que estaria true após WALL_FLIP anterior) — opera
      // diretamente dentro do handler climbableWallTouching, que retorna antes do
      // bloco WALL_FLIP (linha ~393).
      ai.decision = 'CLIMB_WALL:REJUMP';
      requestJumpUrgent(ai, JUMP_HOLD_MS);
    }
    return { right: true, left: false, up: true, down: false, space: ai.jumpHoldTimer > 0, shift: false, z: false, dive: false };
  }

  // ── 5) No ar, tocando muro não-climbable → space para wall-flip/jump ─────
  //   Só aciona uma vez por "encontro com muro" para não spammar
  // Urgente: se o ghost já está no ar (ex: pulo anterior ainda descendo) e bate de
  // frente numa sacada/muro, não pode esperar o cooldown do pulo anterior liberar —
  // isso prendia o ghost encostado na sacada por ~400-500ms (caindo e quicando contra
  // a face dela) até o cooldown zerar. Ver .agents/memory/ghost-wallflip-cooldown-stuck.md
  if (ghost.touchingWall && !ghost.onGround && !ghost.isWallRunning && !ai.wallActionDone) {
    ai.wallActionDone = true;
    ai.decision = 'WALL_FLIP';
    requestJumpUrgent(ai, JUMP_HOLD_MS);
  }

  // ── 6) Preso no ar contra muro por tempo demais → forçar pulo ────────────
  if (ai.airStuckTimer >= STUCK_AIR_MS) {
    ai.airStuckTimer = 0;
    ai.wallActionDone = false;
    ai.decision = 'JUMP:AIR_STUCK';
    requestJumpUrgent(ai, JUMP_HOLD_MS);
  }

  // Reset da decisão para o bloco principal
  ai.decision = 'IDLE';

  // ── 7) Detecção de terreno à frente ──────────────────────────────────────

  // Plataformas marquise — elevadas (acima da cabeça do ghost), h ≤ MARQUISE_MAX_H.
  // O ghost pode passar por baixo (rolling) ou por cima (pulo).
  // Decisão: se há buraco imediatamente após a marquise → rola por baixo para
  // manter altura de chão e pular o gap dali com mais controle.
  // Se não há buraco → pula por cima (comportamento padrão de shortObstacle).
  const marquiseAhead = ghost.onGround ? platforms.find(p => {
    if (p.type !== 'platform') return false;
    const ph = p.collisionH ?? p.h;
    if (ph > MARQUISE_MAX_H) return false;
    const px0 = p.x + (p.collisionOffsetX ?? 0);
    const py0 = p.y + (p.collisionOffsetY ?? 0);
    return (
      py0 < ghost.y - 20 &&                  // plataforma está acima do ghost
      px0 < gRight + LOOK_SHORT_PX &&
      px0 + (p.collisionW ?? p.w) > gRight - 4
    );
  }) : undefined;

  const gapAfterMarquise = marquiseAhead ? (() => {
    const mRight = marquiseAhead.x + (marquiseAhead.collisionW ?? marquiseAhead.w);
    // Há pothole logo depois?
    const hasPothole = platforms.some(p =>
      p.type === 'pothole' && p.x >= mRight - 30 && p.x < mRight + 300,
    );
    // Ou chão não continua 100px depois da marquise?
    const groundAfter = platforms.some(p =>
      (p.type === 'ground' || p.type === 'platform') &&
      p.x <= mRight + 100 && p.x + p.w >= mRight + 100,
    );
    return hasPothole || !groundAfter;
  })() : false;

  // Obstáculo SÓLIDO bloqueando a ENTRADA da marquise — impede a rolagem.
  // Cenário: lixeira/box entre o ghost e a borda esquerda da sacada.
  // Sem essa verificação o ghost trava agachado contra o obstáculo em vez de pular.
  const solidBlockingMarquiseEntry = marquiseAhead ? platforms.some(p => {
    if (
      p.type === 'ground' || p.type === 'platform' || p.type === 'pothole' ||
      p.type === 'sprite' || p.type === 'tireHideout'
    ) return false;
    const pw  = p.collisionW  ?? p.w;
    const ph  = p.collisionH  ?? p.h;
    const px0 = p.x + (p.collisionOffsetX ?? 0);
    const py0 = p.y + (p.collisionOffsetY ?? 0);
    const mRight = marquiseAhead.x + (marquiseAhead.collisionW ?? marquiseAhead.w);
    return (
      px0 < mRight &&            // obstáculo está dentro da zona da marquise
      px0 + pw  > gRight - 10 && // ainda à frente do ghost
      py0 < gFeet &&             // abaixo da cabeça do ghost
      py0 + ph  > ghost.y + 4   // acima dos pés (colisão real)
    );
  }) : false;

  // Roll por baixo: suprime o pulo da marquise e envia down para iniciar rolagem.
  // Cancelado se obstáculo sólido bloqueia a entrada → ghost pula em vez de rolar.
  const rollUnderMarquise = gapAfterMarquise && ghost.onGround && !solidBlockingMarquiseEntry;

  // Espaço livre após a marquise suficiente para um dive roll seguro?
  // O dive roll (frente+baixo+pulo) exige pista limpa — sem potholes, obstáculos
  // sólidos ou muros dentro do raio de rolamento. Se não houver espaço, o ghost
  // usa apenas rolamento normal (frente+baixo, sem pulo).
  const DIVE_CLEAR_PX = 500;
  const diveRollClearAhead = rollUnderMarquise && marquiseAhead ? (() => {
    const mRight = marquiseAhead.x + (marquiseAhead.collisionW ?? marquiseAhead.w);
    return !platforms.some(p => {
      if (p.type === 'ground' || p.type === 'sprite' || p.type === 'tireHideout') return false;
      const px0 = p.x + (p.collisionOffsetX ?? 0);
      return px0 >= mRight - 10 && px0 < mRight + DIVE_CLEAR_PX;
    });
  })() : false;

  // Obstáculos BAIXOS (h ≤ TALL_THRESHOLD): detecta longe → pulo cedo basta
  const shortObstacleAhead = platforms.some(p => {
    if (p.type === 'ground' || p.type === 'pothole' || p.type === 'tireHideout' || p.type === 'sprite') return false;
    const pw = p.collisionW ?? p.w;
    const ph = p.collisionH ?? p.h;
    if (ph > TALL_THRESHOLD) return false; // muros altos tratados separado
    if (p.type === 'platform' && pw <= RIVER_STUMP_W) return false; // tocos do rio: não pula por cima
    const px0 = p.x + (p.collisionOffsetX ?? 0);
    const py0 = p.y + (p.collisionOffsetY ?? 0);
    // Não trata como obstáculo a marquise que será passada por baixo
    if (rollUnderMarquise && marquiseAhead && p === marquiseAhead) return false;
    return (
      px0 < gRight + LOOK_SHORT_PX &&
      px0 + pw > gRight - 4 &&
      py0 < gFeet - 4 &&
      py0 + ph > ghost.y + 8
    );
  });

  // Muros ALTOS (h > TALL_THRESHOLD): detecta PERTO → pulo no último momento
  // O ghost precisa estar subindo quando bater no muro para o wall-run ativar
  // Muros CLIMBABLE (type:'wall', climbable:true) são excluídos daqui: eles são
  // resolvidos pela seção 5 (climbableWallTouching, "sobe" com up) que só ativa
  // quando o ghost efetivamente toca a parede. Sem essa exclusão, um muro
  // climbable fora da zona do rio disparava um pulo prematuro de LOOK_TALL_PX
  // de distância — o ghost pulava DENTRO da parede fina (w:20) em vez de
  // caminhar até ela e escalar, ficando preso/"sumindo" dentro da geometria.
  const tallWallAhead = platforms.some(p => {
    if (p.type === 'ground' || p.type === 'pothole' || p.type === 'tireHideout' || p.type === 'sprite') return false;
    if (p.type === 'wall' && p.climbable) return false;
    const ph = p.collisionH ?? p.h;
    if (ph <= TALL_THRESHOLD) return false;
    return (
      p.x < gRight + LOOK_TALL_PX &&
      p.x + p.w > gRight - 4 &&
      p.y < gFeet - 4 &&
      p.y + ph > ghost.y + 8
    );
  });

  // Muro alto entre ghost e buraco? Se sim, o muro é resolvido primeiro (wall-run),
  // só depois o buraco. Não pular pro buraco antes de cruzar o muro.
  const tallWallBeforePothole = platforms.some(p => {
    if (p.type === 'ground' || p.type === 'pothole' || p.type === 'tireHideout' || p.type === 'sprite') return false;
    const ph = p.collisionH ?? p.h;
    if (ph <= TALL_THRESHOLD) return false;
    return (
      p.x >= gRight - 4 &&
      p.x < gRight + POTHOLE_LOOK_PX &&
      p.y < gFeet - 4 &&
      p.y + ph > ghost.y + 8
    );
  });

  // Pothole à frente — dois limiares:
  // · normal: só dispara quando o ghost está perto o suficiente para pousar
  //   do outro lado (gRight + JUMP_CLEAR_PX >= borda direita do buraco).
  //   Isso evita o ghost pular cedo demais em buracos largos (w>100px).
  // · suprimido se há muro alto entre ghost e buraco.
  const potholeAhead = !tallWallBeforePothole && platforms.some(p =>
    p.type === 'pothole' &&
    p.x < gRight + POTHOLE_LOOK_PX &&   // dentro do raio de detecção
    p.x + p.w > gRight &&               // ainda não passou
    gRight + JUMP_CLEAR_PX >= p.x + p.w // perto o suficiente pra cruzar inteiro
  );
  const urgentRadius = ai.recentWallLanding > 0 ? 280 : POTHOLE_URGENT_PX;
  const potholeUrgent = platforms.some(p =>
    p.type === 'pothole' &&
    p.x < gRight + urgentRadius &&
    p.x + p.w > gRight,
  );

  // Lacuna no chão (cliff edge)
  // Usa lookahead estendido quando: (a) airborne pós-wall-run OU (b) onGround com
  // recentWallLanding ativo (ghost pousou numa plataforma logo após wall-run).
  const inPostWallAir  = ai.recentWallLanding > 0 && !ghost.onGround;
  const postWallOnGround = ai.recentWallLanding > 0 && ghost.onGround;
  const gapLookDist   = (inPostWallAir || postWallOnGround) ? 250 : GROUND_GAP_CHK;
  const checkX = gRight + gapLookDist;
  // Altura da superfície atual (pés do ghost). Só conta como "chão continua" uma
  // plataforma cuja altura seja PRÓXIMA da atual (tolerância 40px) — sem isso,
  // um chão de rua muito mais abaixo (ex: sob um telhado elevado) fazia o check
  // pensar que o chão continuava, e o ghost andava pra fora da borda do telhado
  // em vez de pular a lacuna entre dois telhados na mesma altura.
  const standY = gFeet;
  const groundContinues = platforms.some(p =>
    (p.type === 'ground' || p.type === 'platform') &&
    p.x <= checkX && p.x + p.w >= checkX &&
    Math.abs(p.y - standY) < 40,
  );
  // Verifica se existe plataforma para pousar do outro lado do gap.
  // Sem isso, o ghost pula no fim do mapa (onde não há chão) e cai no vazio.
  // JUMP_RANGE_PX ≈ alcance horizontal de pulo cheio (vx=6.5, vy=-13, G=0.55 → ~47 frames → ~305px)
  const JUMP_RANGE_PX = 320;
  const hasLandingAfterGap = platforms.some(p =>
    (p.type === 'ground' || p.type === 'platform') &&
    p.x + p.w > checkX &&
    p.x < gRight + gapLookDist + JUMP_RANGE_PX &&
    Math.abs(p.y - standY) < 80,
  );
  const gapAhead = !groundContinues && hasLandingAfterGap && (ghost.onGround || inPostWallAir) && !potholeAhead;

  // ── Plataforma elevada: timing exato de pulo para o próximo telhado ───────
  // gapAhead usa GROUND_GAP_CHK=160px e dispara cedo demais em telhados:
  // o ghost pula antes do ponto ideal e cai curto do próximo telhado.
  // Solução: calcular com física real a distância horizontal do pulo dado deltaY,
  // e disparar apenas quando gRight ≥ idealGRight.
  //   Physics: G·T²/2 − V0Y·T − deltaY = 0  →  T = (V0Y + √(V0Y²+2G·ΔY)) / G
  //   jumpDist = PLAYER_SPEED × T
  //   idealGRight = nextPlatX − jumpDist + ghost.w
  // roofTargetExists suprime gapAhead enquanto aguarda o roofJumpReady.
  const onElevatedPlat = ghost.onGround && gFeet < GROUND_Y - 20;
  let roofJumpReady    = false;
  let roofTargetExists = false;

  if (onElevatedPlat && !inPostWallAir) {
    // 1. Borda direita da plataforma em que o ghost está
    let platEdge = 0;
    for (const p of platforms) {
      if (p.type !== 'platform' && p.type !== 'ground') continue;
      const pw  = p.collisionW  ?? p.w;
      const py0 = p.y + (p.collisionOffsetY ?? 0);
      const px0 = p.x + (p.collisionOffsetX ?? 0);
      // Plataforma que o ghost está pisando: topo ≈ gFeet, ghost.x dentro da plataforma
      if (Math.abs(py0 - gFeet) < 6 && px0 <= ghost.x && px0 + pw > ghost.x) {
        platEdge = Math.max(platEdge, px0 + pw);
      }
    }

    if (platEdge > gRight) {
      // 2. Primeira plataforma além da borda (até 500px à frente)
      let nearestX = Infinity;
      let nearestY = gFeet;
      for (const p of platforms) {
        if (p.type !== 'platform' && p.type !== 'ground') continue;
        const px0 = p.x + (p.collisionOffsetX ?? 0);
        const py0 = p.y + (p.collisionOffsetY ?? 0);
        if (px0 > platEdge + 5 && px0 < platEdge + 500 && px0 < nearestX) {
          nearestX = px0;
          nearestY = py0;
        }
      }

      if (nearestX < Infinity) {
        roofTargetExists = true;
        // 3. Física: deltaY > 0 → alvo está mais baixo (y cresce para baixo).
        //    deltaY < 0 → alvo está MAIS ALTO (ex: telhado após muro fino, como
        //    x:31700 logo depois do muro x:31676) — usa a raiz maior da mesma
        //    equação (tempo em que a altura volta a cruzar nearestY DEPOIS do
        //    ápice), que é fisicamente válida desde que o ápice do pulo
        //    (V0Y²/2G ≈ 153px) seja alto o bastante para alcançar |deltaY|.
        //    Sem isso, Math.max(0, deltaY) forçava deltaY=0 sempre que o alvo
        //    era mais alto, tratando como pulo raso e o ghost caía curto,
        //    batendo no muro em vez de pousar no telhado.
        const deltaY  = nearestY - gFeet;
        const G       = 0.55;
        const V0Y     = 13;   // |JUMP_FORCE|
        const VX      = 6.5;  // PLAYER_SPEED
        const disc    = V0Y * V0Y + 2 * G * deltaY;
        // disc < 0 → alvo mais alto do que o pulo alcança fisicamente; sem
        // solução real, mantém roofJumpReady false (cai no fallback padrão).
        const jumpT     = disc >= 0 ? (V0Y + Math.sqrt(disc)) / G : 0;
        const jumpDist  = disc >= 0 ? VX * jumpT : 0;
        const idealGRight = disc >= 0 ? (nearestX - jumpDist + ghost.w) : Infinity;
        // 4. Dispara quando gRight ≥ ponto exato de saída
        //    Janela: até borda da plataforma +8px (segurança para não sair voando)
        if (disc >= 0 && gRight >= idealGRight && gRight < platEdge + 8) {
          // Suprimir se o arco de pulo vai pousar dentro de um pothole.
          // Nesse caso o ghost cai do telhado naturalmente, pousa no chão antes
          // do buraco, e o sistema potholeAhead/potholeUrgent dispara do ponto
          // correto (mais perto do buraco, arco mais curto que passa do outro lado).
          const landingX = ghost.x + jumpDist;
          const landingInPothole = platforms.some(p =>
            p.type === 'pothole' && landingX >= p.x && landingX <= p.x + p.w,
          );
          if (!landingInPothole) {
            roofJumpReady = true;
          }
        }
      }
    }
  }

  // ── Zona do rio: lógica hardcoded com posições exatas dos tocos ───────────
  // onStump: usa o timer de 150ms para cobrir casos onde ghost.onGround já
  // virou false no mesmo frame em que pousou na borda do toco.
  const onStump = ai.riverOnStumpTimer > 0;
  // Zona ativa: 350px antes do 1º toco até ~100px além do fim do rio.
  // Buffer reduzido (200→100) para que a parede climbable em x:25909 fique
  // FORA da zona, deixando o tallWallAhead do modo normal disparar o pulo.
  // Suporta os dois rios (geometria idêntica) — seleciona o conjunto de tocos
  // ativo com base em qual zona o ghost está atravessando no momento.
  const inRiver1Zone =
    gRight > RIVER_STUMP_XS[0] - 350 &&
    gRight < RIVER_END_X + 100;
  const inRiver2Zone =
    gRight > RIVER2_STUMP_XS[0] - 350 &&
    gRight < RIVER2_END_X + 100;
  const inRiverZone = inRiver1Zone || inRiver2Zone;
  const activeStumpXs = inRiver2Zone ? RIVER2_STUMP_XS : RIVER_STUMP_XS;

  // ── 8) Solicita pulo quando necessário ───────────────────────────────────

  // Pós-wall-hang com velocidade baixa: ghost saiu do muro com vx=2.4 (exit
  // deliberado). Pular urgente nesse estado percorre só ~125px → cai dentro
  // do pothole. Solução: deixar a gravidade puxar o ghost até o topo da
  // sacada (y=235) e de lá pular com vx=6.5 → alcança 390px além.
  // Só ativo quando no ar E recentWallLanding E vx baixo (< 3 = pós-hang).
  const isPostWallLowSpeed =
    ai.recentWallLanding > 0 &&
    !ghost.onGround &&
    ghost.vx < 3;

  // Suprime pulo de obstáculo BAIXO se há muro ALTO próximo atrás dele
  const tallWallNearby = platforms.some(p => {
    if (p.type === 'ground' || p.type === 'pothole' || p.type === 'tireHideout' || p.type === 'sprite') return false;
    const ph = p.collisionH ?? p.h;
    if (ph <= TALL_THRESHOLD) return false;
    return (
      p.x < gRight + LOOK_SHORT_PX + 60 &&
      p.x + p.w > gRight - 4 &&
      p.y < gFeet - 4 &&
      p.y + ph > ghost.y + 8
    );
  });

  const jumpForShort = shortObstacleAhead && !tallWallNearby;

  // ── Decisão de pulo ──────────────────────────────────────────────────────
  if (inRiverZone) {
    // ── ZONA DO RIO: lógica de pulo exclusiva, ignora gapAhead/obstacles ──

    // 1) Abordagem chão→toco1:
    //    Pulo completo (JUMP_FORCE=-13) cobre ~296px horizontal com diff de
    //    altura (GY→GY-22). Dispara RIVER_APPROACH_PX px antes do toco1,
    //    pousando ~26px dentro do toco.
    const approachTriggerMin = activeStumpXs[0] - RIVER_APPROACH_PX - 40;
    const approachTriggerMax = activeStumpXs[0] - RIVER_APPROACH_PX + 40;
    // jumpHoldTimer removido: requestJumpUrgent sobrescreve o timer de qualquer forma,
    // e ghost.onGround já garante que o ghost não está no ar. Um holdTimer residual
    // de pulo anterior (sacada, lixeira) bloqueava a janela de 40px silenciosamente.
    const approachFires = ghost.onGround && !onStump &&
      gRight >= approachTriggerMin &&
      gRight <= approachTriggerMax;

    // 2) Toco→toco (e toco→chão sólido pós-rio):
    //    Pulo do mesmo nível = 47.3 frames = 307px (demais). Freio nos
    //    últimos ~19 frames reduz para ~204px, acertando o centro do toco seguinte.
    //    Dispara imediatamente ao pousar em qualquer toco.
    // <= 0 em vez de === 0: os timers são decrementados sem clamp (podem ir negativos),
    // então === 0 nunca seria true após o timer "ultrapassar" o zero num frame largo.
    const stumpFires = onStump && ghost.onGround && ai.jumpHoldTimer <= 0 && ai.jumpCooldown <= 0;

    if (approachFires) {
      ai.decision = 'RIVER:APPROACH';
      requestJumpUrgent(ai, JUMP_HOLD_MS);
    }
    if (stumpFires) {
      ai.decision = 'RIVER:STUMP';
      requestJumpUrgent(ai, JUMP_HOLD_MS);
      ai.riverStumpAirborne  = true;
      ai.riverBraking        = false;
      // Guarda o índice do toco-ALVO (curIdx + 1) no momento do pulo.
      // O check de posição usa este índice fixo para não perder a janela de freio
      // quando gRight já ultrapassou o início do toco-alvo.
      const curIdx = activeStumpXs.findIndex(
        sx => ghost.x + ghost.w > sx && ghost.x < sx + RIVER_STUMP_W,
      );
      ai.riverTargetStumpIdx = curIdx + 1; // -1+1=0 se não encontrou (seguro: toco 0 é entrada do rio)
    }
    // Freio por posição: usa o toco-alvo FIXO gravado no pulo (riverTargetStumpIdx).
    // Isso evita que a busca dinâmica pule o toco quando gRight já está dentro dele.
    if (!ghost.onGround && ai.riverStumpAirborne && !ai.riverBraking) {
      // targetSX === undefined: pulo do último toco → chão sólido. Usa a
      // margem (fim do rio, ativeEndX) como alvo virtual — NÃO o fim do toco.
      // Freiar logo após o toco (antes de cruzar a água restante) travava o
      // ghost em queda livre vertical ainda SOBRE o rio (sem chão embaixo),
      // afogando-o. Freiar só ao alcançar a margem garante que o pouso ocorra
      // sobre chão sólido, com folga antes da parede climbable pós-rio.
      const activeEndX = inRiver2Zone ? RIVER2_END_X : RIVER_END_X;
      const targetSX = activeStumpXs[ai.riverTargetStumpIdx] ?? activeEndX;
      if (gRight >= targetSX + 30) {
        ai.riverBraking = true;
      }
    }
    // Segurança: travado no chão da zona → força pulo após 500ms
    if (ai.stuckTimer >= 500 && ghost.onGround) {
      ai.decision = 'JUMP:STUCK';
      requestJump(ai);
    }
    if (ai.decision === 'IDLE') {
      ai.decision = ai.riverBraking ? 'RIVER:BRAKE' : 'RIVER:RUN';
    }

  } else {
    // ── Modo normal: fora da zona do rio ──────────────────────────────────

    // Suprime pulo de obstáculo BAIXO quando há um buraco imediatamente adiante
    // (dentro de LOOK_SHORT_PX + 200px). Cenário: marquise seguida de pothole.
    // Sem supressão, o ghost pula cedo pela marquise e cai no buraco.
    // Com supressão, o ghost chega até o ponto onde potholeAhead dispara e
    // pula dali — cobrindo a distância completa até além do buraco.
    // EXCEÇÃO: plataformas (sacadas) — o ghost deve subir nelas mesmo com pothole
    // adjacente; JUMP:EDGE cobre o buraco a partir do topo da sacada.
    const potholeJustAhead = platforms.some(p =>
      p.type === 'pothole' &&
      p.x > gRight &&
      p.x < gRight + LOOK_SHORT_PX + 200,
    );

    // Distingue sacada (platform) de obstáculo sólido (lixeira, box) dentro do
    // shortObstacleAhead. Sacadas são saltáveis — o ghost pousa em cima e usa
    // JUMP:EDGE pro buraco logo à frente. Obstáculos sólidos param o vx e exigem
    // pulo combinado urgente (JUMP:POTHOLE+OBS).
    const shortPlatformObstacleAhead = platforms.some(p => {
      if (p.type !== 'platform') return false;
      const pw = p.collisionW ?? p.w;
      const ph = p.collisionH ?? p.h;
      if (ph > TALL_THRESHOLD) return false;
      if (pw <= RIVER_STUMP_W) return false;
      const px0 = p.x + (p.collisionOffsetX ?? 0);
      const py0 = p.y + (p.collisionOffsetY ?? 0);
      return (
        px0 < gRight + LOOK_SHORT_PX &&
        px0 + pw > gRight - 4 &&
        py0 < gFeet - 4 &&
        py0 + ph > ghost.y + 8
      );
    });
    const jumpForShortFinal = jumpForShort && (!potholeJustAhead || shortPlatformObstacleAhead);

    // Pothole detectado à frente + obstáculo SÓLIDO não-plataforma bloqueando caminho:
    // força pulo URGENTE (ignora cooldown) para não ficar preso contra o obstáculo.
    const solidObstacleBlocking = shortObstacleAhead && !shortPlatformObstacleAhead && potholeJustAhead;

    // Quando isPostWallLowSpeed: ghost saiu do wall-hang com vx=2.4 e está
    // em voo baixo. Pular com urgência agora resultaria em arco curto (125px)
    // que cai dentro do pothole. Suprime potholeUrgent/Ahead para que a
    // gravidade puxe o ghost até o topo da sacada; de lá pula com vx=6.5
    // e alcança 390px além — passa o pothole de folga.
    // gapAhead ainda é permitido (cliff edge é sempre urgente independente de vx).
    if (roofJumpReady) {
      // Telhado elevado: timing exato calculado por física — tem prioridade sobre gapAhead
      ai.decision = 'JUMP:ROOF_GAP';
      requestJumpUrgent(ai, JUMP_HOLD_MS);
    } else if ((!isPostWallLowSpeed && potholeUrgent) ||
               (gapAhead && !(onElevatedPlat && roofTargetExists))) {
      // gapAhead suprimido em plataformas elevadas onde roofTargetExists:
      // aguarda roofJumpReady para disparar no ponto exato.
      ai.decision = gapAhead ? 'JUMP:GAP' : 'JUMP:POTHOLE_URGENT';
      requestJumpUrgent(ai);
    } else if (!isPostWallLowSpeed && potholeAhead && solidObstacleBlocking) {
      ai.decision = 'JUMP:POTHOLE+OBS';
      requestJumpUrgent(ai);
    } else if (!isPostWallLowSpeed && potholeAhead) {
      ai.decision = 'JUMP:POTHOLE';
      requestJump(ai);
    }
    if (!isPostWallLowSpeed && (jumpForShortFinal || tallWallAhead)) {
      if (ai.decision === 'IDLE') ai.decision = jumpForShortFinal ? 'JUMP:SHORT_OBS' : 'JUMP:TALL_WALL';
      requestJump(ai);
    }
    // stuckTimer usa URGENTE para ignorar cooldown — requestJump normal seria bloqueado
    // pelo cooldown que causou o stuck em primeiro lugar.
    if (ai.stuckTimer >= STUCK_GROUND_MS) {
      ai.decision = 'JUMP:STUCK';
      requestJumpUrgent(ai);
    }

    // ── Plataforma elevada com pothole logo à frente ──────────────────────
    // Cenário: ghost subiu em cima de uma sacada/plataforma e o pothole começa
    // logo após o fim dela (5–200px). Sem esse check, o ghost caminha até a
    // borda e cai dentro. Com ele, pula urgente antes de sair da plataforma.
    const onElevatedPlatform = ghost.onGround && (ghost.y + ghost.h) < GROUND_Y - 20;
    if (onElevatedPlatform) {
      const potholeRightAtEdge = platforms.some(p =>
        p.type === 'pothole' && p.x > gRight && p.x < gRight + 200,
      );
      if (potholeRightAtEdge) {
        ai.decision = 'JUMP:EDGE';
        requestJumpUrgent(ai);
      }
    }

    // Detectou obstáculo mas está em cooldown (jumpHoldTimer=0, cooldown>0)
    if (ai.decision === 'IDLE') {
      if (shortObstacleAhead && !tallWallNearby)  ai.decision = 'DETECT:SHORT_OBS';
      else if (tallWallAhead)                      ai.decision = 'DETECT:TALL_WALL';
      else if (potholeAhead)                       ai.decision = 'DETECT:POTHOLE';
      else if (gapAhead)                           ai.decision = 'DETECT:GAP';
    }
  }

  // Direção: freio (right=false) ativo durante a fase de desaceleração no ar
  // — só acontece nos pulos toco→toco dentro da zona do rio.
  const goRight = !ai.riverBraking;

  // Roll por baixo de marquise: envia down enquanto está abaixo/entrando nela
  const shouldDuck = rollUnderMarquise;

  // Suprime space durante rolamento por baixo de sacada/marquise quando não há
  // espaço limpo para dive roll. Sem supressão, um jumpHoldTimer ativo (enfileirado
  // para o pothole logo após) combina com down=true e dispara dive roll —
  // movimento que ocupa mais espaço e pode matar o ghost no espaço apertado.
  // Com espaço limpo (diveRollClearAhead), o dive roll é permitido por ser eficaz.
  const suppressDiveRoll = shouldDuck && !diveRollClearAhead;

  // Override de decisão para estados de duck/roll (têm prioridade visual no trail)
  if (shouldDuck) {
    ai.decision = diveRollClearAhead ? 'DIVE_ROLL' : 'ROLL_UNDER';
  }

  return {
    right: goRight,
    left: false,
    up: false,
    down: shouldDuck,
    space: suppressDiveRoll ? false : ai.jumpHoldTimer > 0,
    shift: false,
    z: false,
    dive: false,
  };
}

// ── Avança a física do ghost um frame — retorna a decisão de IA tomada ───────
export function stepGhostPlayer(
  ghost: Player,
  platforms: Platform[],
  dt: number,
  spawnParticle: (x: number, y: number, color: string) => void,
): string {
  if (ghost.state === 'dead') return 'DEAD';
  const keys = computeGhostKeys(ghost, platforms, dt);
  updatePlayer(ghost, keys, platforms, dt, spawnParticle);
  return getAI(ghost).decision;
}

// ── Verifica se o ghost morreu ou caiu fora da tela ──────────────────────────
export function isGhostDead(ghost: Player): boolean {
  return ghost.state === 'dead' || ghost.y > CANVAS_H + 120;
}
