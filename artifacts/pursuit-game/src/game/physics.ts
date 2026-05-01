import type { Player, Drone, Bullet, Platform, Particle, GameState, Keys, FallingBox, FlyingTire, Dog, Bystander } from './types';
import {
  GRAVITY, JUMP_FORCE, PLAYER_SPEED, ROLL_SPEED, ROLL_DURATION, CLIMB_SPEED,
  MAX_FALL_SPEED, PLAYER_W, PLAYER_H, PLAYER_ROLL_H, DRONE_W, DRONE_H,
  DRONE_BASE_SPEED, DRONE_TARGET_OFFSET_X, DRONE_TARGET_OFFSET_Y,
  BULLET_SPEED, SHOOT_COOLDOWN, GROUND_Y, HIT_INVINCIBILITY, CANVAS_H, CANVAS_W,
  LANDING_ROLL_THRESHOLD, LANDING_ROLL_DURATION, HIT_STUN_DURATION,
  DIVEJUMP_SPEED, DIVEJUMP_JUMP_FORCE,
  WALLRUN_DURATION, WALLRUN_RISE_SPEED, WALLRUN_JUMP_VX, WALLRUN_JUMP_VY,
  WALLCLIMB_DURATION, WALLFLIP_BACK_VX, WALLFLIP_DURATION, WALLFLIP_JUMP_VY,
  SIDEFLIP_DURATION, SIDEFLIP_BOOST,
} from './constants';
import { getPlatformCollisionRects, getSlopeSurfaceY } from './collision';
import { FIRE_ESCAPE, FIRE_ESCAPE_TOP_FLOOR_H, FIRE_ESCAPES, RIVER } from './level';
import { spawnRiverRipple } from './render';
import type { SlopedRect } from './collision';

interface BoxStackWall extends SlopedRect {
  boxCount: number;
}

// Altura máxima acima do chão (em px) que Horácio pode escalar em caixas (~4 caixas de 55px)
const MAX_BOX_CLIMB_HEIGHT = 220; // ≈ 4 caixas — acima disso climb é bloqueado
const MIN_BOX_CLIMB_HEIGHT = 160; // ligeiramente abaixo de 3 caixas (3×55=165) para incluir 3 caixas relativas

function rectOverlap(ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function getStackedBoxWall(platforms: Platform[], box: Platform): BoxStackWall | null {
  if (box.type !== 'box') return null;
  const STACK_TOL = 6;
  const MIN_X_OVERLAP_RATIO = 0.55;
  const boxes = platforms.filter((plat) => plat.type === 'box');
  const stack: Platform[] = [];
  const queue: Platform[] = [box];
  const seen = new Set<Platform>();

  const verticalStackTouch = (a: Platform, b: Platform) => {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const minRequiredOverlap = Math.min(a.w, b.w) * MIN_X_OVERLAP_RATIO;
    const touchesVertically = Math.abs(a.y + a.h - b.y) <= STACK_TOL || Math.abs(b.y + b.h - a.y) <= STACK_TOL;
    return touchesVertically && overlapX >= minRequiredOverlap;
  };

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    stack.push(current);

    for (const other of boxes) {
      if (seen.has(other)) continue;
      if (verticalStackTouch(current, other)) {
        queue.push(other);
      }
    }
  }

  const MIN_CLIMBABLE_BOXES = 3;
  if (stack.length < MIN_CLIMBABLE_BOXES) return null;

  const left = Math.min(...stack.map((plat) => plat.x));
  const right = Math.max(...stack.map((plat) => plat.x + plat.w));
  const top = Math.min(...stack.map((plat) => plat.y));
  const bottom = Math.max(...stack.map((plat) => plat.y + plat.h));
  const columnHeight = bottom - top;

  return { x: left, y: top, w: right - left, h: columnHeight, boxCount: stack.length };
}

function resolveClimbableWallContact(p: Player, hit: SlopedRect, vx: number, boxWall: BoxStackWall | null = null, lowImpulse = false): void {
  const overlapLeft = p.x + p.w - hit.x;
  const overlapRight = hit.x + hit.w - p.x;
  const isBox = !!boxWall;

  if (overlapLeft < overlapRight && vx >= 0) {
    p.x = hit.x - p.w;
    p.touchingWall = true;
    p.wallSide = 'right';
    p.wallX = hit.x;
    p.wallTopY = hit.y;
    p.wallLowImpulse = lowImpulse;
    if (p.vx > 0) p.vx = 0;
    if (!p.isWallRunning) {
      p.wallRunOnBox = isBox;
      p.wallRunBoxStackCount = boxWall?.boxCount ?? 0;
      p.wallRunBoxStackHeight = boxWall?.h ?? 0;
    }
  } else if (overlapRight <= overlapLeft && vx <= 0) {
    p.x = hit.x + hit.w;
    p.touchingWall = true;
    p.wallSide = 'left';
    p.wallX = hit.x + hit.w;
    p.wallTopY = hit.y;
    p.wallLowImpulse = lowImpulse;
    if (p.vx < 0) p.vx = 0;
    if (!p.isWallRunning) {
      p.wallRunOnBox = isBox;
      p.wallRunBoxStackCount = boxWall?.boxCount ?? 0;
      p.wallRunBoxStackHeight = boxWall?.h ?? 0;
    }
  }
}

function resolvePlayerPlatform(p: Player, plat: Platform, hit: SlopedRect, climbableBoxWall?: BoxStackWall | null): boolean {
  const ph = (p.isRolling || p.forcedCrouch) ? PLAYER_ROLL_H : PLAYER_H;
  if (!rectOverlap(p.x, p.y, p.w, ph, hit.x, hit.y, hit.w, hit.h)) return false;

  // --- Slope resolution ---
  if (hit.slopeTop) {
    // Sample surface Y at the player's horizontal center
    const centerX = p.x + p.w / 2;
    const surfaceY = getSlopeSurfaceY(hit, centerX);
    const feetY = p.y + ph;

    // Downslope snap threshold: when going down a slope the surface drops faster than
    // gravity pulls the player, causing feetY to be slightly ABOVE surfaceY each frame.
    // We snap the player down to the surface if they're within this margin and not jumping up.
    const SLOPE_SNAP_THRESHOLD = 14;
    const onSlopeDownSnap = feetY >= surfaceY - SLOPE_SNAP_THRESHOLD && feetY < surfaceY && p.vy >= 0;

    // Land on slope: feet at or below surface (normal), or within snap threshold going down
    if ((feetY >= surfaceY || onSlopeDownSnap) && p.y <= surfaceY) {
      p.y = surfaceY - ph;
      if (p.vy > 0) p.vy = 0;
      p.onGround = true;
      p.coyoteTime = 6;
      if (plat.noAutoRoll) p.justLandedOnNoRollSlope = true;
      return true;
    }
    // Otherwise let player pass through freely (they're above or passing under)
    return false;
  }

  const overlapLeft = p.x + p.w - hit.x;
  const overlapRight = hit.x + hit.w - p.x;
  const overlapTop = p.y + ph - hit.y;
  const overlapBottom = hit.y + hit.h - p.y;

  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  // Escada (ladder): atravessável, só seta touchingLadder pra subir com ↑
  if (plat.isLadder) {
    p.touchingLadder = true;
    p.ladderCenterX = plat.x + plat.w / 2;
    return false;
  }

  // Quando estiver subindo escada, plataformas finas viram one-way (passa por baixo)
  if (p.isClimbing && plat.type === 'platform' && minOverlap === overlapBottom) {
    // Topo da escada: pousa em cima em vez de continuar subindo pelo vão
    if (plat.isLadderTopFloor) {
      p.y = hit.y - ph;
      p.vy = 0;
      p.onGround = true;
      p.coyoteTime = 6;
      p.isClimbing = false;
      return true;
    }
    return false;
  }

  if (plat.type === 'wall' && plat.climbable) {
    const allowedSide = plat.climbableSide ?? 'both';
    const touchedFace: 'left' | 'right' = overlapLeft < overlapRight ? 'left' : 'right';
    if (allowedSide === 'both' || allowedSide === touchedFace) {
      resolveClimbableWallContact(p, hit, p.vx, null, plat.lowJumpImpulse === true);
      p.touchingLadder = true;
      return false;
    }
    // Face não escalável: cai no resolver padrão (push sólido sem wall run/climb).
  }

  if (climbableBoxWall && (minOverlap === overlapLeft || minOverlap === overlapRight)) {
    resolveClimbableWallContact(p, climbableBoxWall, p.vx, climbableBoxWall);
    return false;
  }

  if (climbableBoxWall && plat.type === 'box' && minOverlap === overlapTop && plat.y > climbableBoxWall.y + 3) {
    return false;
  }

  // ── Roll/crouch pass-under check ─────────────────────────────────────────
  // When rolling or forcedCrouch, a phantom horizontal collision can occur because
  // forcedCrouch does not adjust p.y (unlike manual roll). If the platform's
  // collision bottom leaves enough clearance at ground level for a rolling player,
  // and the resolver picked a horizontal axis, skip the push so the player can slide under.
  if ((p.isRolling || p.forcedCrouch) &&
      (minOverlap === overlapLeft || minOverlap === overlapRight)) {
    const clearance = GROUND_Y - (hit.y + hit.h);
    if (clearance >= PLAYER_ROLL_H) return false;
  }

  // Caixa isolada (stack não detectada): registra como box wall para restrição de altura
  if (!climbableBoxWall && plat.type === 'box' && !p.isRolling && !p.forcedCrouch &&
      (minOverlap === overlapLeft || minOverlap === overlapRight)) {
    if (minOverlap === overlapLeft && p.vx >= 0) {
      p.x = hit.x - p.w;
      p.touchingWall = true;
      p.wallSide = 'right';
      p.wallX = hit.x;
      p.wallTopY = plat.y;
      if (p.vx > 0) p.vx = 0;
      if (!p.isWallRunning) {
        p.wallRunOnBox = true;
        p.wallRunBoxStackCount = 1;
      }
    } else if (minOverlap === overlapRight && p.vx <= 0) {
      p.x = hit.x + hit.w;
      p.touchingWall = true;
      p.wallSide = 'left';
      p.wallX = hit.x + hit.w;
      p.wallTopY = plat.y;
      if (p.vx < 0) p.vx = 0;
      if (!p.isWallRunning) {
        p.wallRunOnBox = true;
        p.wallRunBoxStackCount = 1;
      }
    }
    return false;
  }

  if (minOverlap === overlapTop && p.vy >= 0) {
    p.y = hit.y - ph;
    p.vy = 0;
    p.onGround = true;
    p.coyoteTime = 6;
    return true;
  } else if (minOverlap === overlapBottom && p.vy < 0) {
    p.y = hit.y + hit.h;
    p.vy = 1;
  } else if (overlapLeft <= overlapRight) {
    p.x = hit.x - p.w;
    if (p.vx > 0) p.vx = 0;
  } else {
    p.x = hit.x + hit.w;
    if (p.vx < 0) p.vx = 0;
  }
  return false;
}

export function updatePlayer(
  p: Player,
  keys: Keys,
  platforms: Platform[],
  dt: number,
  spawnParticle: (x: number, y: number, color: string) => void
): void {
  const prevOnGround = p.onGround;
  const previousWallSide = p.wallSide;
  const previousWallX = p.wallX;
  const previousWallTopY = p.wallTopY;
  const prevTouchingLadder = p.touchingLadder;
  const prevTouchingWall = p.touchingWall;
  p.onGround = false;
  p.touchingWall = false;
  p.touchingLadder = false;
  p.justLandedOnNoRollSlope = false;
  p.wallSide = null;
  p.wallX = previousWallX;
  p.wallTopY = previousWallTopY;
  if (!p.isWallRunning) {
    p.wallRunOnBox = false;
    p.wallRunBoxStackCount = 0;
    p.wallRunBoxStackHeight = 0;
  }
  p.isCrouching = false;

  if (p.state === 'dead') return;

  if (p.coyoteTime > 0) p.coyoteTime--;

  // Invincibility timer
  if (p.invincible) {
    p.invincibleTimer -= dt;
    if (p.invincibleTimer <= 0) {
      p.invincible = false;
    }
  }

  if (p.state === 'hurt') {
    p.hurtStunTimer -= dt;
    if (p.hurtStunTimer <= 0) {
      p.hurtStunTimer = 0;
      p.state = p.onGround ? 'idle' : 'fall';
    }
    p.isDivejumping = false;
    p.isWallFlipping = false;
    p.isWallClimbUp = false;
    p.isWallHanging = false;
  }

  // Roll timer
  if (p.isRolling) {
    p.rollTimer -= dt;
    if (p.rollTimer <= 0) {
      p.isRolling = false;
      p.autoRoll = false;
      p.landingRollFrame = 0;
      p.state = p.onGround ? 'idle' : 'fall';
      // Se ainda está no chão e tem plataforma bloqueando ao levantar, entra em forcedCrouch
      if (p.onGround) {
        const expandH = PLAYER_H - PLAYER_ROLL_H;
        const blockedAbove = platforms.some(plat => {
          if (plat.type === 'ground' || plat.type === 'tireHideout') return false;
          return getPlatformCollisionRects(plat).some((hit) =>
            rectOverlap(p.x + 1, p.y - expandH, p.w - 2, PLAYER_H, hit.x, hit.y, hit.w, hit.h)
          );
        });
        if (blockedAbove) {
          p.forcedCrouch = true;
          p.vx = 0;
          p.state = 'idle';
        }
      }
    }
  }

  // ForcedCrouch: verifica a cada frame se ainda há bloqueio acima
  if (p.forcedCrouch) {
    if (!p.onGround) {
      p.forcedCrouch = false;
    } else {
      const expandH = PLAYER_H - PLAYER_ROLL_H;
      const stillBlocked = platforms.some(plat => {
        if (plat.type === 'ground' || plat.type === 'tireHideout') return false;
        return getPlatformCollisionRects(plat).some((hit) =>
          rectOverlap(p.x + 1, p.y - expandH, p.w - 2, PLAYER_H, hit.x, hit.y, hit.w, hit.h)
        );
      });
      if (!stillBlocked) {
        p.forcedCrouch = false;
      } else {
        p.vx = 0;
      }
    }
  }

  // Detecção de teto baixo: se o jogador está em pé com pouco espaço acima, força agachamento
  // Ativa quando há plataforma a menos de CEILING_CLEARANCE px acima da cabeça
  if (p.onGround && !p.isRolling && !p.forcedCrouch && p.state !== 'hurt' && p.state !== 'dead') {
    const CEILING_CLEARANCE = 18; // px de folga acima da cabeça que aciona forcedCrouch
    const headY = p.y; // topo do personagem em pé
    const lowCeiling = platforms.some(plat => {
      if (plat.type === 'ground' || plat.type === 'tireHideout') return false;
      return getPlatformCollisionRects(plat).some(hit =>
        rectOverlap(p.x + 2, headY - CEILING_CLEARANCE, p.w - 4, CEILING_CLEARANCE, hit.x, hit.y, hit.w, hit.h)
      );
    });
    if (lowCeiling) {
      p.forcedCrouch = true;
      p.state = 'idle';
    }
  }

  // Landing crouch timer
  if (p.landingCrouch) {
    p.landingCrouchTimer -= dt;
    if (p.landingCrouchTimer <= 0) {
      p.landingCrouch = false;
      p.landingCrouchTimer = 0;
    }
  }

  // Track peak fall velocity for auto-roll detection
  if (!p.onGround && p.vy > 0) {
    if (p.vy > p.peakFallVy) p.peakFallVy = p.vy;
  }

  const ph = (p.isRolling || p.forcedCrouch) ? PLAYER_ROLL_H : PLAYER_H;

  // --- Climbing ---
  if (p.isClimbing) {
    p.vy = 0;
    const ladderSpeedMul = prevTouchingLadder ? 0.55 : 1;
    if (keys.up) {
      p.vy = -CLIMB_SPEED * ladderSpeedMul;
    } else if (keys.down) {
      // descer é o dobro mais rápido que subir
      p.vy = CLIMB_SPEED * 2 * ladderSpeedMul;
    }
    if (prevTouchingLadder) {
      // Escada atravessável: permite andar pra sair lateralmente
      if (keys.left) p.vx = -PLAYER_SPEED * 0.6;
      else if (keys.right) p.vx = PLAYER_SPEED * 0.6;
      else p.vx = 0;
    } else {
      p.vx = 0;
    }
    if (!prevTouchingWall && !prevTouchingLadder) {
      p.isClimbing = false;
    }
    // Allow jump off wall (não escada)
    if (keys.space && prevTouchingWall && !prevTouchingLadder) {
      p.isClimbing = false;
      const lowFactor = p.wallLowImpulse ? 0.5 : 1;
      p.vy = JUMP_FORCE * 0.9 * lowFactor;
      p.vx = p.wallSide === 'right' ? -5 : 5;
      p.facingRight = p.wallSide === 'right' ? false : true;
    }

  // --- Wall Run ---
  } else if (p.isWallRunning) {
    p.wallRunTimer -= dt;
    if (p.wallRunTimer <= 0 || p.onGround) {
      // Timer esgotou ou tocou no chão — sai do wall run
      p.isWallRunning = false;
    } else {
      const wallSide = p.wallSide ?? previousWallSide;
      // Sobe pela parede enquanto o timer durar
      p.wallSide = wallSide;
      p.state = 'wallrun';
      p.vx = wallSide === 'right' ? 1.2 : wallSide === 'left' ? -1.2 : 0;
      p.vy = -WALLRUN_RISE_SPEED;
      // Partículas de faísca enquanto sobe
      if (Math.random() < 0.4) {
        spawnParticle(
          p.x + (p.wallSide === 'right' ? p.w : 0),
          p.y + PLAYER_H * 0.6,
          Math.random() < 0.5 ? '#ffcc44' : '#ff8822',
        );
      }
      const isTallBoxStack = p.wallRunOnBox && (GROUND_Y - p.wallTopY) > MAX_BOX_CLIMB_HEIGHT;
      const _timerWindow = p.wallRunTimer < WALLRUN_DURATION - 160;
      const canClimbWall   = (!p.wallRunOnBox || !isTallBoxStack) && _timerWindow;
      const canJumpOffWall = (!p.wallRunOnBox || isTallBoxStack) && _timerWindow;
      const pressingForwardIntoWall =
        (wallSide === 'right' && keys.right) ||
        (wallSide === 'left' && keys.left);
      const neutralVerticalClimb = (keys.space || keys.up) && !keys.left && !keys.right;
      if (canClimbWall && (keys.space || keys.up) && pressingForwardIntoWall && wallSide) {
        p.isWallRunning = false;
        p.isWallClimbUp = true;
        p.wallClimbStartX = p.x;
        p.wallClimbStartY = p.y;
        p.wallClimbTargetX = wallSide === 'right' ? p.wallX + 22 : p.wallX - p.w - 22;
        p.wallClimbTargetY = p.wallTopY - PLAYER_H - 4;
        p.wallClimbSide = wallSide;
        // Escala velocidade proporcionalmente à distância vertical até o hang point
        // Paredes mais altas = fase 1 mais rápida
        {
          const hangY = p.wallTopY + 35;
          const climbDist = Math.max(1, p.wallClimbStartY - hangY);
          const REF_DIST = 120; // distância de referência (parede padrão)
          p.wallClimbLiftAmount = Math.min(160, Math.max(86, climbDist * 0.58));
          const speedRatio = Math.sqrt(Math.min(1, REF_DIST / climbDist));
          p.wallClimbAdjustedDuration = Math.max(350, Math.round(WALLCLIMB_DURATION * speedRatio));
          p.wallClimbTimer = p.wallClimbAdjustedDuration;
          // Penalidade de pulo: quanto mais alto o muro, menos impulso no pulo seguinte
          // Curva exponencial — cai rápido para paredes altas
          // penalty = 1.0 (parede padrão) → ~0.54 (liftAmount=130) → 0.30 mínimo (muito alta)
          const rawPenalty = Math.pow(86 / Math.max(86, p.wallClimbLiftAmount), 2.0);
          p.wallClimbJumpPenalty = Math.max(0.25, rawPenalty);
        }
        p.coyoteTime = 0;
        p.vx = 0;
        p.vy = 0;
        p.facingRight = wallSide === 'right';
        p.state = 'wallclimb';
        p.animFrame = 0;
        p.animTimer = 0;
        for (let i = 0; i < 12; i++) {
          spawnParticle(
            p.x + (wallSide === 'right' ? p.w : 0),
            p.y + PLAYER_H * 0.35,
            i % 2 === 0 ? '#d8d0c8' : '#ffcc44',
          );
        }
      } else if (canJumpOffWall && neutralVerticalClimb && wallSide) {
        p.isWallRunning = false;
        p.isWallFlipping = true;
        p.wallFlipTimer = WALLFLIP_DURATION;
        p.coyoteTime = 0;
        const lowFactor = p.wallLowImpulse ? 0.5 : 1;
        p.vy = WALLFLIP_JUMP_VY * lowFactor;
        const flipVx = WALLFLIP_BACK_VX;
        p.vx = wallSide === 'right' ? -flipVx : flipVx;
        p.facingRight = wallSide === 'right';
        p.state = 'wallflip';
        p.animFrame = 0;
        p.animTimer = 0;
        for (let i = 0; i < 12; i++) {
          spawnParticle(
            p.x + (wallSide === 'right' ? p.w : 0),
            p.y + PLAYER_H * 0.55,
            i % 2 === 0 ? '#ffcc44' : '#ff8822',
          );
        }
      } else if (canJumpOffWall && keys.space && wallSide) {
        p.isWallRunning = false;
        p.coyoteTime = 0;
        const lowFactor = p.wallLowImpulse ? 0.5 : 1;
        p.vy = WALLRUN_JUMP_VY * lowFactor;
        const jumpVx = WALLRUN_JUMP_VX;
        p.vx = wallSide === 'right' ? -jumpVx : jumpVx;
        p.facingRight = wallSide !== 'right';
        for (let i = 0; i < 14; i++) {
          spawnParticle(
            p.x + p.w / 2,
            p.y + PLAYER_H / 2,
            i % 2 === 0 ? '#ffcc44' : '#ff8822',
          );
        }
      }
    }

  } else if (p.isWallClimbUp) {
    const side = p.wallClimbSide;
    const wallFaceX = side === 'right' ? p.wallX - p.w : side === 'left' ? p.wallX : p.x;
    const hangY = p.wallTopY + 35;

    if (p.isWallHanging) {
      // Hanging on ledge — wait for player to choose
      p.x = wallFaceX;
      p.y = hangY;
      p.vx = 0;
      p.vy = 0;
      p.state = 'wallclimb';

      // Allow new input only after jump is released
      if (!keys.space) p.wallHangJumpConsumed = false;

      if (keys.space && !p.wallHangJumpConsumed) {
        const pressingAway = (side === 'right' && keys.left) || (side === 'left' && keys.right);
        p.isWallHanging = false;
        p.isWallClimbUp = false;
        p.wallClimbSide = null;

        if (pressingAway) {
          // Back + jump → drop off wall backward (penalidade reduz impulso vertical)
          const lowFactor = p.wallLowImpulse ? 0.5 : 1;
          p.vx = side === 'right' ? -WALLFLIP_BACK_VX : WALLFLIP_BACK_VX;
          p.vy = WALLFLIP_JUMP_VY * p.wallClimbJumpPenalty * lowFactor;
          p.jumpedFromWall = true;
          // Penalidade persiste até pousar (reseta em onGround)
        } else {
          // Forward + jump (or just jump) → pull up onto wall top
          // coyoteTime = 3 permite um pulo curto; penalidade será aplicada nesse pulo
          p.x = p.wallClimbTargetX;
          p.y = p.wallClimbTargetY;
          p.vx = side === 'right' ? 2.4 : -2.4;
          p.vy = 0;
          p.coyoteTime = 3;
          // Mark that player came from elevated wall so landing detection can roll correctly
          p.jumpOriginGroundY = p.wallTopY;
          p.jumpedFromWall = true;
        }
      }
    } else {
      // Climb animation
      p.wallClimbTimer -= dt;
      const t = Math.max(0, Math.min(1, 1 - p.wallClimbTimer / p.wallClimbAdjustedDuration));
      const liftY = p.wallClimbStartY - p.wallClimbLiftAmount;
      const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

      if (t < 0.38) {
        const k = t / 0.38;
        p.x = lerp(p.wallClimbStartX, wallFaceX, k);
        p.y = lerp(p.wallClimbStartY, liftY, k);
      } else {
        // Skip intermediate frames — go to hang
        p.x = wallFaceX;
        p.y = hangY;
        p.isWallHanging = true;
        // If still holding forward+jump, don't consume the key so the hang
        // logic fires on the very next frame (shows hang frame for 1 tick then auto-jumps)
        const stillPressingForward = side === 'right' ? keys.right : (side === 'left' ? keys.left : false);
        p.wallHangJumpConsumed = keys.space && !stillPressingForward;
      }

      p.vx = 0;
      p.vy = 0;
      p.state = 'wallclimb';
    }
  } else if (p.isWallFlipping) {
    p.wallFlipTimer -= dt;
    p.state = 'wallflip';
    p.vx *= 0.992;
    if (p.wallFlipTimer <= 0) {
      p.wallFlipTimer = 0;
      p.isWallFlipping = false;
    }
  } else if (p.isSideFlipping) {
    p.sideFlipTimer -= dt;
    p.state = 'sideflip';
    p.vx *= 0.985;
    if (p.sideFlipTimer <= 0 || p.onGround) {
      p.isSideFlipping = false;
      p.sideFlipTimer = 0;
    }
  } else if (p.state !== 'hurt') {
    // Horizontal movement
    if (p.isDivejumping) {
      // During dive jump: maintain boosted speed with minimal deceleration
      p.vx *= 0.995;
    } else if (!p.isRolling) {
      // Velocidade máxima reduzida após escalar parede alta (penalidade de esforço)
      const effectiveSpeed = PLAYER_SPEED * p.wallClimbJumpPenalty;
      if (keys.left) {
        p.vx = -effectiveSpeed;
        p.facingRight = false;
      } else if (keys.right) {
        p.vx = effectiveSpeed;
        p.facingRight = true;
      } else {
        p.vx *= 0.7;
        if (Math.abs(p.vx) < 0.5) p.vx = 0;
      }
    } else if (p.autoRoll) {
      // Auto landing roll: preserve horizontal momentum, no override
      // Slight deceleration only if no key held
      if (!keys.left && !keys.right) {
        p.vx *= 0.97;
      }
    } else {
      // Manual roll: push forward at ROLL_SPEED
      p.vx = p.facingRight ? ROLL_SPEED : -ROLL_SPEED;
    }

    // Dive jump: running + down + space/jump simultaneously
    const diveTriggered = (keys.dive || (keys.down && keys.space));
    const canDiveFromGround = p.coyoteTime > 0;
    if (diveTriggered && !p.touchingWall && canDiveFromGround && !p.isRolling && !p.isDivejumping && Math.abs(p.vx) > 3) {
      p.isDivejumping = true;
      p.vy = DIVEJUMP_JUMP_FORCE;
      p.vx = p.facingRight ? DIVEJUMP_SPEED : -DIVEJUMP_SPEED;
      p.onGround = false;
      p.coyoteTime = 0;
      p.landingCrouch = false;
      for (let i = 0; i < 10; i++) {
        spawnParticle(p.x + p.w / 2, p.y + ph, i % 2 === 0 ? '#808090' : '#555060');
      }
    // Normal jump
    } else if (keys.space && (p.coyoteTime > 0)) {
      // Aplica penalidade de pulo se o personagem acabou de escalar uma parede alta
      // Não reseta a penalidade aqui — ela persiste até o pouso para limitar vx no ar também
      const lowFactor = p.wallLowImpulse ? 0.5 : 1;
      p.vy = JUMP_FORCE * p.wallClimbJumpPenalty * lowFactor;
      p.onGround = false;
      p.coyoteTime = 0;
      p.jumpCount = 1;
      p.doubleJumpReady = false;
      spawnParticle(p.x + p.w / 2, p.y + ph, '#555060');
    }

    // Track key release after first jump (enables double jump)
    if (!keys.space && !p.onGround && p.jumpCount === 1) {
      p.doubleJumpReady = true;
    }

    // Double jump → side flip
    if (
      p.doubleJumpReady &&
      keys.space &&
      !p.onGround &&
      p.jumpCount === 1 &&
      !p.isSideFlipping &&
      !p.isWallRunning &&
      !p.isWallFlipping &&
      !p.isWallClimbUp &&
      !p.isDivejumping &&
      p.state !== 'hurt' &&
      p.state !== 'dead'
    ) {
      p.isSideFlipping = true;
      p.sideFlipTimer = SIDEFLIP_DURATION;
      p.sideFlipImmune = true;
      p.jumpCount = 2;
      p.doubleJumpReady = false;
      p.vy += SIDEFLIP_BOOST;
    }

    // Wall climb simples — bloqueado em caixas (muito baixas: pula em cima; muito altas: inalcançável)
    // Usa jumpOriginGroundY (pés na plataforma de origem) para não ser enganado pela posição aérea do pulo
    const _boxHeight = p.jumpOriginGroundY - p.wallTopY;
    const _climbBannedOnBox = p.wallRunOnBox && (_boxHeight <= MIN_BOX_CLIMB_HEIGHT || _boxHeight > MAX_BOX_CLIMB_HEIGHT);
    if (p.touchingWall && keys.up && !p.onGround && !_climbBannedOnBox) {
      p.isClimbing = true;
      p.vy = -CLIMB_SPEED;
    }

    // Roll — também sai do forcedCrouch ao pressionar shift+direção
    if ((keys.shift || keys.z) && p.onGround && !p.isRolling && (keys.left || keys.right || Math.abs(p.vx) > 1 || p.forcedCrouch)) {
      p.forcedCrouch = false;
      p.y += PLAYER_H - PLAYER_ROLL_H; // ajusta y para manter os pés no chão imediatamente
      p.isRolling = true;
      p.rollTimer = ROLL_DURATION;
      p.state = 'roll';
      spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, '#444055');
    }

    // Roll via baixo+frente — inicia ANTES da colisão (usa prevOnGround)
    // para que a hitbox reduzida já esteja ativa ao resolver colisões com sacadas
    if (keys.down && prevOnGround && !p.isRolling && !p.isClimbing &&
        p.state !== 'hurt' && p.state !== 'dead' &&
        (keys.left || keys.right || Math.abs(p.vx) > 1)) {
      p.forcedCrouch = false;
      p.y += PLAYER_H - PLAYER_ROLL_H;
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.landingCrouch = false;
      p.landingCrouchTimer = 0;
      p.state = 'roll';
      for (let i = 0; i < 8; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#606070' : '#404555');
      }
    }
  }

  // Gravity — não aplica durante climb ou wall run
  if (!p.isClimbing && !p.isWallRunning) {
    p.vy += GRAVITY;
    if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;
  }

  // Guarda velocidade horizontal antes da colisão para detectar impacto em parede
  const incomingVx = p.vx;

  // Move
  if (!p.isWallClimbUp) {
    p.x += p.vx;
    p.y += p.vy;
  }

  // Don't let player go left of world start
  if (p.x < -100) { p.x = -100; p.vx = 0; }

  // Collision
  if (!p.isWallClimbUp) {
    // Pré-computa potholes — buracos editáveis que "anulam" o chão dentro de seu range X
    const potholes = platforms.filter(pl => pl.type === 'pothole');
    const playerCenterX = p.x + p.w / 2;
    const insidePothole = potholes.some(ph => playerCenterX > ph.x && playerCenterX < ph.x + ph.w);

    for (const plat of platforms) {
      if (plat.type === 'tireHideout') continue;
      if (plat.type === 'pothole') continue; // pothole não tem colisão sólida
      // Se o jogador está sobre um pothole, ignora colisão de chão para deixar cair
      if (plat.type === 'ground' && insidePothole) continue;
      const climbableBoxWall = getStackedBoxWall(platforms, plat);
      for (const hit of getPlatformCollisionRects(plat)) {
        resolvePlayerPlatform(p, plat, hit, climbableBoxWall);
      }
    }
  }

  // Topo da escada: descer apertando ↓ se está em cima da landing do topo,
  // dentro do range X da escada — entra no climb pra descer pelo vão.
  // Verifica todas as escadas dos prédios; usa a que o jogador está em cima.
  {
    const TOP_FLOOR_Y = GROUND_Y - FIRE_ESCAPE_TOP_FLOOR_H;
    const playerCenterX = p.x + p.w / 2;
    const activeFE = FIRE_ESCAPES.find(fe =>
      playerCenterX >= fe.WALL_X - 4 && playerCenterX <= fe.WALL_X + fe.WALL_W + 4
    );
    const LADDER_X_MIN = activeFE ? activeFE.WALL_X : FIRE_ESCAPE.WALL_X;
    const LADDER_X_MAX = activeFE ? activeFE.WALL_X + activeFE.WALL_W : FIRE_ESCAPE.WALL_X + FIRE_ESCAPE.WALL_W;
    if (
      keys.down && p.onGround && !p.isClimbing && !p.isRolling &&
      Math.abs((p.y + ph) - TOP_FLOOR_Y) < 4 &&
      playerCenterX >= LADDER_X_MIN - 4 && playerCenterX <= LADDER_X_MAX + 4
    ) {
      p.ladderCenterX = (LADDER_X_MIN + LADDER_X_MAX) / 2;
      p.x = p.ladderCenterX - p.w / 2;
      p.y = TOP_FLOOR_Y + 4;
      p.onGround = false;
      p.coyoteTime = 0;
      p.isClimbing = true;
      p.touchingLadder = true;
      p.vy = CLIMB_SPEED * 2 * 0.55;
      p.vx = 0;
    }
  }

  // Escada: subir parado no chão apenas pressionando para cima
  // (rodado APÓS a colisão pra garantir que p.touchingLadder esteja atualizado)
  if (p.touchingLadder && keys.up && !p.isClimbing && !p.isWallRunning && !p.isWallClimbUp) {
    p.isClimbing = true;
    p.onGround = false;
    p.vy = -CLIMB_SPEED;
    p.coyoteTime = 0;
    // Ancora no centro da escada
    p.x = p.ladderCenterX - p.w / 2;
    p.vx = 0;
  }

  // If climbing, check still touching a wall ou escada
  if (p.isClimbing && !p.touchingWall && !p.touchingLadder) {
    p.isClimbing = false;
  }

  // Box climb trigger direto — caixas ≤ 4 blocos, sem passar por wall-run
  // Ativa quando o jogador pula em direção à caixa e pressiona up/space
  const _boxClimbConditions =
    !p.isWallRunning &&
    !p.isClimbing &&
    !p.onGround &&
    p.touchingWall &&
    !p.isRolling &&
    !p.isDivejumping &&
    !p.isWallFlipping &&
    !p.isWallClimbUp &&
    p.state !== 'hurt' &&
    p.wallRunOnBox &&
    // Altura relativa à plataforma de origem do pulo — não à posição aérea nem ao chão absoluto
    (p.jumpOriginGroundY - p.wallTopY) > MIN_BOX_CLIMB_HEIGHT &&
    (p.jumpOriginGroundY - p.wallTopY) <= MAX_BOX_CLIMB_HEIGHT &&
    (keys.up || keys.space) &&
    ((p.wallSide === 'right' && (keys.right || incomingVx > 0)) ||
      (p.wallSide === 'left' && (keys.left || incomingVx < 0))) &&
    p.vy < 0;

  if (_boxClimbConditions && p.wallSide) {
    const wallSide = p.wallSide;
    p.isWallClimbUp = true;
    p.wallClimbStartX = p.x;
    p.wallClimbStartY = p.y;
    p.wallClimbTargetX = wallSide === 'right' ? p.wallX + 22 : p.wallX - p.w - 22;
    p.wallClimbTargetY = p.wallTopY - PLAYER_H - 4;
    p.wallClimbSide = wallSide;
    {
      const hangY = p.wallTopY + 35;
      const climbDist = Math.max(1, p.wallClimbStartY - hangY);
      const REF_DIST = 120;
      p.wallClimbLiftAmount = Math.min(160, Math.max(86, climbDist * 0.58));
      const speedRatio = Math.sqrt(Math.min(1, REF_DIST / climbDist));
      p.wallClimbAdjustedDuration = Math.max(350, Math.round(WALLCLIMB_DURATION * speedRatio));
      p.wallClimbTimer = p.wallClimbAdjustedDuration;
      const rawPenalty = Math.pow(86 / Math.max(86, p.wallClimbLiftAmount), 2.0);
      p.wallClimbJumpPenalty = Math.max(0.25, rawPenalty);
    }
    p.coyoteTime = 0;
    p.vx = 0;
    p.vy = 0;
    p.facingRight = wallSide === 'right';
    p.state = 'wallclimb';
    p.animFrame = 0;
    p.animTimer = 0;
    for (let i = 0; i < 10; i++) {
      spawnParticle(
        p.x + (wallSide === 'right' ? p.w : 0),
        p.y + PLAYER_H * 0.4,
        i % 2 === 0 ? '#d8d0c8' : '#ffcc44',
      );
    }
  }

  // Wall run trigger — apenas em paredes normais (não-caixas)
  if (
    !p.isWallRunning &&
    !p.isClimbing &&
    !p.onGround &&
    p.touchingWall &&
    !p.isRolling &&
    !p.isDivejumping &&
    !p.isWallFlipping &&
    !p.isWallClimbUp &&
    p.state !== 'hurt' &&
    Math.abs(incomingVx) > 3 &&
    ((p.wallSide === 'right' && (keys.right || incomingVx > 0)) ||
      (p.wallSide === 'left' && (keys.left || incomingVx < 0))) &&
    p.vy < -2.5 &&
    !p.wallRunOnBox   // wall-run banido em caixas — sem sprite de corrida vertical
  ) {
    p.isWallRunning = true;
    p.onGround = false;
    p.coyoteTime = 0;
    p.vy = -WALLRUN_RISE_SPEED;
    p.wallRunTimer = WALLRUN_DURATION;
    p.state = 'wallrun';
    for (let i = 0; i < 8; i++) {
      spawnParticle(
        p.x + (p.wallSide === 'right' ? p.w : 0),
        p.y + PLAYER_H * 0.5,
        i % 2 === 0 ? '#ffcc44' : '#ff8822',
      );
    }
  }

  // Se estiver em wall run, mantém contato visual/físico com a parede
  if (p.isWallRunning && !p.touchingWall) {
    const wallSide = p.wallSide ?? previousWallSide;
    if (wallSide === 'right') {
      p.x = p.wallX - p.w;
      p.touchingWall = true;
      p.wallSide = 'right';
    } else if (wallSide === 'left') {
      p.x = p.wallX;
      p.touchingWall = true;
      p.wallSide = 'left';
    }
  }

  if (keys.down && p.onGround && !p.isRolling && !p.isClimbing && p.state !== 'hurt') {
    if ((keys.left || keys.right || Math.abs(p.vx) > 3) && Math.abs(p.vx) > 1) {
      p.y += PLAYER_H - PLAYER_ROLL_H; // ajusta y para manter os pés no chão imediatamente
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.landingCrouch = false;
      p.landingCrouchTimer = 0;
      p.state = 'roll';
      for (let i = 0; i < 8; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#606070' : '#404555');
      }
    } else {
      p.isCrouching = true;
    }
  }

  // Fall off screen -> die
  if (p.y > CANVAS_H + 100) {
    p.health = 0;
    p.state = 'dead';
  }

  // Distance score
  if (p.vx > 0) p.distanceTraveled += p.vx;

  // State machine
  if (p.state !== 'hurt' && p.state !== 'dead') {
    if (p.isRolling) {
      p.state = 'roll';
    } else if (p.isClimbing) {
      p.state = 'climb';
    } else if (p.isWallRunning) {
      p.state = 'wallrun';
    } else if (p.isWallClimbUp) {
      p.state = 'wallclimb';
    } else if (p.isWallFlipping) {
      p.state = 'wallflip';
    } else if (p.isSideFlipping) {
      p.state = 'sideflip';
    } else if (p.isDivejumping) {
      p.state = 'divejump';
    } else if (!p.onGround) {
      p.state = p.vy < 0 ? 'jump' : 'fall';
    } else if (p.isCrouching) {
      p.state = 'idle';
    } else {
      p.state = Math.abs(p.vx) > 0.5 ? 'run' : 'idle';
    }
  }

  // Animate
  p.animTimer += dt;
  if (p.animTimer > 80) {
    p.animTimer = 0;
    p.animFrame = (p.animFrame + 1) % 8;
  }

  // Landing roll frame — cycles through 4 frames over the roll duration
  if (p.autoRoll && p.isRolling) {
    const progress = 1 - p.rollTimer / LANDING_ROLL_DURATION;
    p.landingRollFrame = Math.min(3, Math.floor(progress * 4));
  }

  // Landing detection
  if (!prevOnGround && p.onGround) {
    const fallVy = p.peakFallVy;
    p.peakFallVy = 0;
    // Reset low-impulse flag ao tocar o chão — só vale para o próximo pulo de muro específico
    p.wallLowImpulse = false;

    // Ripple na água se aterrissou em um toco do rio
    const feetCenterX = p.x + p.w / 2;
    const expectedTopY = GROUND_Y - RIVER.STUMP_RISE - PLAYER_H;
    if (Math.abs(p.y - expectedTopY) < 6) {
      for (const stumpX of RIVER.STUMPS_X) {
        if (feetCenterX >= stumpX - 4 && feetCenterX <= stumpX + RIVER.STUMP_W + 4) {
          spawnRiverRipple(stumpX + RIVER.STUMP_W / 2);
          break;
        }
      }
    }

    // landingGroundY = bottom of player after collision; jumpOriginGroundY is updated every
    // grounded frame so it always reflects the last surface the player was standing on.
    const landingGroundY = p.y + PLAYER_H;
    const droppedDown = landingGroundY > p.jumpOriginGroundY + 10;

    if (p.isWallFlipping && p.state !== 'hurt') {
      p.isWallFlipping = false;
      p.wallFlipTimer = 0;
      // Auto-roll on landing from wall climb + jump
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.state = 'roll';
      for (let i = 0; i < 10; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#606070' : '#404555');
      }
    } else if (p.jumpedFromWall && !p.isRolling && p.state !== 'hurt') {
      // Back-jump from wall hang — always auto-roll on landing
      p.jumpedFromWall = false;
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.state = 'roll';
      for (let i = 0; i < 10; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#606070' : '#404555');
      }
    } else if (p.isDivejumping && !p.isRolling && p.state !== 'hurt') {
      p.isDivejumping = false;
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.state = 'roll';
      for (let i = 0; i < 14; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#808090' : '#555060');
      }
    } else if (droppedDown && !p.isRolling && !p.justLandedOnNoRollSlope && p.state !== 'hurt') {
      // Fell to a lower surface — full auto-roll
      p.isRolling = true;
      p.autoRoll = true;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.state = 'roll';
      for (let i = 0; i < 10; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#606070' : '#404555');
      }
    } else if (fallVy >= LANDING_ROLL_THRESHOLD && Math.abs(p.vx) < 3 && !p.isRolling && p.state !== 'hurt') {
      // Vertical landing (no horizontal movement) — brief crouch pose only, no roll
      p.landingCrouch = true;
      p.landingCrouchTimer = 150;
      for (let i = 0; i < 5; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_H, '#606070');
      }
    } else {
      // Normal landing dust
      p.jumpedFromWall = false;
      for (let i = 0; i < 5; i++) {
        spawnParticle(p.x + p.w / 2, p.y + (p.isRolling ? PLAYER_ROLL_H : PLAYER_H), '#606070');
      }
    }
  }

  // Keep jumpOriginGroundY in sync with the current ground surface every grounded frame.
  // This way it always holds the last surface the player stood on before going airborne.
  if (p.onGround) {
    p.jumpOriginGroundY = p.y + PLAYER_H;
    p.jumpCount = 0;
    p.doubleJumpReady = false;
    p.sideFlipImmune = false;
    p.wallClimbJumpPenalty = 1.0;
    if (p.isSideFlipping) {
      p.isSideFlipping = false;
      p.sideFlipTimer = 0;
    }
  }

  // Reset fall tracker when on ground (and not mid-roll-that-was-just-triggered)
  if (p.onGround && !p.autoRoll) {
    p.peakFallVy = 0;
  }
}

// ── Drone pathfinding helpers ────────────────────────────────────────────────

/** Liang-Barsky line vs AABB intersection test. */
function lineIntersectsAABB(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let tmin = 0, tmax = 1;
  const checks = [
    { p: -dx, q: x1 - rx },
    { p:  dx, q: rx + rw - x1 },
    { p: -dy, q: y1 - ry },
    { p:  dy, q: ry + rh - y1 },
  ];
  for (const { p, q } of checks) {
    if (p === 0) { if (q < 0) return false; }
    else {
      const t = q / p;
      if (p < 0) tmin = Math.max(tmin, t);
      else       tmax = Math.min(tmax, t);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/**
 * Returns the best intermediate waypoint for the drone to steer toward.
 * If the straight path to (targetX, targetY) is blocked, returns a bypass
 * waypoint above (or below) the closest blocking obstacle.
 */
function droneComputeWaypoint(
  drone: Drone,
  targetX: number,
  targetY: number,
  platforms: Platform[]
): { tx: number; ty: number } {
  const dCx = drone.x + DRONE_W / 2;
  const dCy = drone.y + DRONE_H / 2;

  let closestObstacle: Platform | null = null;
  let closestDist = Infinity;

  for (const p of platforms) {
    if (!isDroneSolid(p)) continue;
    // Only consider obstacles that lie between drone and target horizontally
    const lo = Math.min(dCx, targetX) - 10;
    const hi = Math.max(dCx, targetX) + 10;
    if (p.x + p.w < lo || p.x > hi) continue;
    if (!lineIntersectsAABB(dCx, dCy, targetX, targetY, p.x, p.y, p.w, p.h)) continue;
    const d = Math.abs((p.x + p.w / 2) - dCx);
    if (d < closestDist) { closestDist = d; closestObstacle = p; }
  }

  if (!closestObstacle) return { tx: targetX, ty: targetY };

  const p = closestObstacle;
  // Drone can fly over if its minimum reachable bottom (30 + DRONE_H) clears the wall top
  const DRONE_MIN_Y    = 32;
  const canOver        = DRONE_MIN_Y + DRONE_H < p.y;   // e.g. 70 < wall.y
  const overY          = canOver ? p.y - DRONE_H - 20 : DRONE_MIN_Y;

  const underY         = p.y + p.h + 30;
  const canUnder       = underY <= GROUND_Y - DRONE_H - 20;

  let bypassY: number;
  if (canOver && canUnder) {
    bypassY = Math.abs(dCy - overY) <= Math.abs(dCy - underY) ? overY : underY;
  } else if (canOver) {
    bypassY = overY;
  } else if (canUnder) {
    bypassY = underY;
  } else {
    // Truly impassable (full-height wall): aim as high as possible — stuck detection will teleport
    bypassY = DRONE_MIN_Y;
  }

  // Waypoint X: just past the obstacle edge in the direction of travel
  const goingRight = targetX > dCx;
  const bypassX = goingRight ? p.x + p.w + DRONE_W + 10 : p.x - DRONE_W - 10;

  return { tx: bypassX, ty: bypassY };
}

/**
 * Proactive wall lookahead: scans for walls AHEAD of the drone within a lookahead
 * distance and returns a bypass waypoint before the drone even reaches the wall.
 * Returns null if no wall is in the way.
 */
function droneWallScan(
  drone: Drone,
  targetX: number,
  platforms: Platform[]
): { tx: number; ty: number } | null {
  const LOOKAHEAD  = 280; // px ahead to start planning
  const DRONE_MIN_Y = 32;
  const dCx = drone.x + DRONE_W / 2;
  const dCy = drone.y + DRONE_H / 2;
  const goingRight = targetX > dCx;

  let bestWall: Platform | null = null;
  let bestDist = Infinity;

  for (const p of platforms) {
    if (!isDroneSolid(p)) continue;
    // Is this wall in front of the drone in the direction of travel?
    const wallFront = goingRight ? p.x : p.x + p.w;
    const ahead = goingRight
      ? wallFront > dCx && wallFront < dCx + LOOKAHEAD
      : wallFront < dCx && wallFront > dCx - LOOKAHEAD;
    if (!ahead) continue;
    const d = Math.abs(wallFront - dCx);
    if (d < bestDist) { bestDist = d; bestWall = p; }
  }

  if (!bestWall) return null;
  const p = bestWall;

  const canOver  = DRONE_MIN_Y + DRONE_H < p.y;
  const underY   = p.y + p.h + 30;
  const canUnder = underY <= GROUND_Y - DRONE_H - 20;

  let bypassY: number;
  if (canOver) {
    bypassY = p.y - DRONE_H - 20;
  } else if (canUnder) {
    bypassY = underY;
  } else {
    // Parede muito alta (chega ao topo do canvas) — drone sobe acima da tela para passar por cima
    bypassY = p.y - DRONE_H - 10; // pode ser negativo: drone some brevemente no topo
  }

  const bypassX = goingRight ? p.x + p.w + DRONE_W + 10 : p.x - DRONE_W - 10;
  return { tx: bypassX, ty: bypassY };
}

// ── Drone obstacle avoidance helpers ────────────────────────────────────────

/** Repulsion force vector from all nearby solid platforms. */
function droneRepulsion(
  drone: Drone,
  platforms: Platform[]
): { fx: number; fy: number } {
  const SENSE = 100;          // sensing radius (px)
  const SCALE = 7;            // max repulsion strength
  let fx = 0, fy = 0;
  const dCx = drone.x + DRONE_W / 2;
  const dCy = drone.y + DRONE_H / 2;

  for (const p of platforms) {
    if (!isDroneSolid(p)) continue;
    // Quick distance cull
    if (Math.abs((p.x + p.w / 2) - dCx) > SENSE + p.w / 2 + 40) continue;

    // Closest point on AABB to drone centre
    const cx = Math.max(p.x, Math.min(p.x + p.w, dCx));
    const cy = Math.max(p.y, Math.min(p.y + p.h, dCy));
    let dx = dCx - cx;
    let dy = dCy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) {
      // Centre inside obstacle — push strongly upward
      fy -= SCALE * 3;
      continue;
    }
    if (dist < SENSE) {
      const t = 1 - dist / SENSE;
      const strength = t * t * SCALE;
      fx += (dx / dist) * strength;
      fy += (dy / dist) * strength;
    }
  }
  return { fx, fy };
}

/** Drone só colide com 2 paredes específicas — atravessa todo o resto. */
function isDroneSolid(p: Platform): boolean {
  return p.type === 'wall' && (p.x === 12100 || p.x === 21700);
}

/** Hard pushout: resolve any current overlap between drone AABB and solid platforms. */
function dronePushOut(drone: Drone, platforms: Platform[]): void {
  for (const p of platforms) {
    if (!isDroneSolid(p)) continue;
    // AABB overlap test
    if (
      drone.x < p.x + p.w && drone.x + DRONE_W > p.x &&
      drone.y < p.y + p.h && drone.y + DRONE_H > p.y
    ) {
      const oLeft   = (p.x + p.w)  - drone.x;
      const oRight  = (drone.x + DRONE_W) - p.x;
      const oTop    = (p.y + p.h)  - drone.y;
      const oBottom = (drone.y + DRONE_H) - p.y;
      const minH = Math.min(oLeft, oRight);
      const minV = Math.min(oTop, oBottom);

      if (minV < minH) {
        if (oTop < oBottom) {
          drone.y = p.y + p.h + 1;
          if (drone.vy < 0) drone.vy *= -0.2;
        } else {
          drone.y = p.y - DRONE_H - 1;
          if (drone.vy > 0) drone.vy *= -0.2;
        }
      } else {
        if (oLeft < oRight) {
          drone.x = p.x - DRONE_W - 1;
          if (drone.vx > 0) drone.vx *= -0.2;
        } else {
          drone.x = p.x + p.w + 1;
          if (drone.vx < 0) drone.vx *= -0.2;
        }
      }
    }
  }
}

export function updateDrone(
  drone: Drone,
  player: Player,
  bullets: Bullet[],
  dt: number,
  spawnParticle: (x: number, y: number, color: string) => void,
  platforms: Platform[] = []
): number {
  let shakeAmount = 0;

  // Target position: behind and above player
  // Quando o jogador escala (escada/parede), o drone fica AO LADO, na mesma altura,
  // pra atirar lateralmente — escadas estreitas não dão espaço pra desviar de tiros
  // vindos de cima.
  const verticalOffset = player.isClimbing ? -30 : DRONE_TARGET_OFFSET_Y;
  const targetX = player.x + DRONE_TARGET_OFFSET_X + Math.sin(Date.now() * 0.0007) * 30;
  const targetY = player.y + verticalOffset + Math.cos(Date.now() * 0.0009) * 20;

  // Detecta se o jogador está na escada de incêndio (pela posição X), mesmo sem estar
  // ativamente escalando — basta estar dentro da coluna de ALGUM dos prédios acima do solo.
  // Usa o prédio mais próximo para definir o centro da escada (FE_LADDER_CX).
  const playerCx = player.x + player.w / 2;
  let FE_LADDER_CX = FIRE_ESCAPE.WALL_X + FIRE_ESCAPE.WALL_W / 2;
  let minLadderDist = Infinity;
  for (const fe of FIRE_ESCAPES) {
    const cx = fe.WALL_X + fe.WALL_W / 2;
    const d = Math.abs(playerCx - cx);
    if (d < minLadderDist) {
      minLadderDist = d;
      FE_LADDER_CX = cx;
    }
  }
  const playerNearFireEscape =
    minLadderDist < FIRE_ESCAPE.PLAT_W / 2 + 60 &&
    player.y < GROUND_Y - 60;

  // Quando o jogador está escalando a escada do prédio, o drone atravessa TUDO
  // (sem colisão, repulsão ou pushout) pra conseguir voar direto até o topo.
  const dronePlatforms = playerNearFireEscape ? [] : platforms;

  let tx: number;
  let ty: number;
  let sideFactor = 0; // hoisted: usado pelo bloco de tiro abaixo
  if (playerNearFireEscape) {
    // Override total: drone fica AO LADO do Horácio na escada, atirando
    // lateralmente. Geralmente fica do lado esquerdo, mas de vez em quando
    // voa pro lado DIREITO pra atacar dali. Transição suave via tanh.
    // Oscilação base pra cima (0 → -120 → 0). BURST raro (~21s) sobe muito
    // mais rápido que o Horácio, ficando em ângulo bem acima dele.
    // Distanciada lateral até 80px pra fora da escada.
    // sideFactor: -1 = esquerda (padrão), +1 = direita (~40% do tempo).
    // Ciclo bem rápido (~2.2s) — alternância acelerada nesse trecho.
    sideFactor = Math.tanh((Math.sin(Date.now() * 0.0028) - 0.2) * 6);
    const baseTx = FE_LADDER_CX + sideFactor * 200;
    const distanceMag = (1 - Math.cos(Date.now() * 0.0006)) * 40; // 0 → 80 → 0
    tx = baseTx + sideFactor * distanceMag + Math.sin(Date.now() * 0.0007) * 12;
    const baseTy = player.y - 20;
    const upwardOscillation = (Math.cos(Date.now() * 0.0012) - 1) * 20; // 0 → -40 → 0
    const burstPhase = Math.pow(Math.sin(Date.now() * 0.0003), 8); // bem mais raro
    const upwardBurst = -burstPhase * 70; // burst bem menor
    ty = baseTy + upwardOscillation + upwardBurst;
  } else {
    // Pathfinding: proactive wall scan first (sees wall 280px ahead),
    // then fall back to general obstacle waypoint if no wall detected.
    const wallAhead = dronePlatforms.length > 0 ? droneWallScan(drone, targetX, dronePlatforms) : null;
    const wp = wallAhead
      ?? (dronePlatforms.length > 0
        ? droneComputeWaypoint(drone, targetX, targetY, dronePlatforms)
        : { tx: targetX, ty: targetY });
    tx = wp.tx;
    ty = wp.ty;
  }

  // Se o waypoint está acima do canvas (ty < 0), o drone está em manobra de overfly
  const isOverflying = ty < 0;

  const dx = tx - drone.x;
  const dy = ty - drone.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const speed = DRONE_BASE_SPEED;

  if (playerNearFireEscape) {
    // Modo "subida turbo": move o drone diretamente em direção ao alvo,
    // ignorando física/inércia, pra garantir que ele alcança o topo do prédio.
    // Passo grande pra alternar entre os polos rapidamente.
    const MAX_STEP = 24;
    if (dist > MAX_STEP) {
      drone.x += (dx / dist) * MAX_STEP;
      drone.y += (dy / dist) * MAX_STEP;
    } else {
      drone.x = tx;
      drone.y = ty;
    }
    drone.vx = 0;
    drone.vy = 0;
  } else if (dist > 2) {
    drone.vx += (dx / dist) * speed * 0.25;
    drone.vy += (dy / dist) * speed * 0.25;
  }

  // Obstacle repulsion (fine-grained — prevents grazing/sticking to surfaces)
  if (dronePlatforms.length > 0) {
    const { fx, fy } = droneRepulsion(drone, dronePlatforms);
    drone.vx += fx;
    drone.vy += fy;
  }

  // Less damping — keeps momentum so drone stays on player's tail
  drone.vx *= 0.84;
  drone.vy *= 0.84;

  drone.x += drone.vx;
  drone.y += drone.vy;

  // Hard pushout — resolve any remaining overlap
  if (dronePlatforms.length > 0) {
    dronePushOut(drone, dronePlatforms);
  }

  // Keep drone on screen y — durante overfly de parede alta, permite sair pelo topo
  // Quando o jogador escala, mantém o drone próximo à altura do Horácio (lateral),
  // sem deixar subir muito acima dele (escada estreita não dá pra desviar de cima).
  const climbingCeiling = player.y - 80;
  const dronMinY = playerNearFireEscape
    ? player.y - 130 // teto baixo: drone fica perto da altura do Horácio
    : isOverflying
      ? -(DRONE_H + 10)
      : (player.isClimbing ? climbingCeiling : 30);
  if (drone.y < dronMinY) { drone.y = dronMinY; if (!isOverflying && !player.isClimbing && !playerNearFireEscape) drone.vy = Math.abs(drone.vy); }
  if (drone.y > GROUND_Y - 60) { drone.y = GROUND_Y - 60; drone.vy = -Math.abs(drone.vy); }

  // ── Stuck detection: só teleporta se completamente imóvel por ~5s contra parede ──
  drone.stuckTimer++;
  if (drone.stuckTimer >= 300) {
    const traveled = Math.abs(drone.x - drone.stuckLastX);
    const distToPlayer = Math.abs(drone.x - (player.x + DRONE_TARGET_OFFSET_X));
    const almostStill  = Math.abs(drone.vx) < 0.4 && Math.abs(drone.vy) < 0.4;
    // Preso: quase sem deslocamento, quase parado E longe do player
    if (traveled < 4 && almostStill && distToPlayer > 350) {
      drone.x = player.x + DRONE_TARGET_OFFSET_X;
      drone.y = Math.max(dronMinY, player.y + DRONE_TARGET_OFFSET_Y);
      drone.vx = 0;
      drone.vy = 0;
    }
    drone.stuckTimer = 0;
    drone.stuckLastX = drone.x;
  }

  // Prop spin
  drone.propAngle += 0.4;

  // Wobble
  drone.wobble += drone.wobbleDir * 0.02;
  if (Math.abs(drone.wobble) > 0.08) drone.wobbleDir *= -1;

  // Shoot
  drone.shootTimer -= dt;
  let shouldFireNow = false;

  if (drone.shootTimer <= 0) {
    if (playerNearFireEscape) {
      // Na escada: dispara só quando o drone CHEGOU no alvo (dist pequena)
      // E o alvo está num dos extremos. Trânsito entre polos NUNCA dispara.
      const currentSide: -1 | 1 = sideFactor > 0 ? 1 : -1;
      const droneArrived = dist < 30; // chegou (ou snapou) no alvo atual
      const targetAtExtreme = Math.abs(sideFactor) > 0.97;
      if (
        droneArrived &&
        targetAtExtreme &&
        currentSide !== drone.lastFireSide
      ) {
        drone.lastFireSide = currentSide;
        shouldFireNow = true;
      }
    } else {
      drone.lastFireSide = 0;
      shouldFireNow = true;
    }
  }

  if (shouldFireNow) {
    drone.shootTimer = SHOOT_COOLDOWN + Math.random() * 400;

    // Aim at player
    const pdx = player.x + player.w / 2 - (drone.x + drone.w / 2);
    const pdy = player.y + player.h / 2 - (drone.y + drone.h / 2);
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

    if (pdist > 0) {
      // Na escada, tiro mais rápido pra exigir mais reflexo do Horácio.
      const bulletSpeed = playerNearFireEscape ? BULLET_SPEED * 1.4 : BULLET_SPEED;
      bullets.push({
        x: drone.x + drone.w / 2,
        y: drone.y + drone.h / 2,
        vx: (pdx / pdist) * bulletSpeed,
        vy: (pdy / pdist) * bulletSpeed * 0.5,
        age: 0,
      });
      shakeAmount = 2;
      for (let i = 0; i < 4; i++) {
        spawnParticle(drone.x + drone.w / 2, drone.y + drone.h / 2, '#ff4400');
      }
    }
  }

  return shakeAmount;
}

function spawnBoxShatter(particles: Particle[], box: Platform): void {
  const colors = ['#9c6b35', '#7a5228', '#5c3d1a', '#b07840', '#3a2510', '#c8843f'];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 5.5;
    particles.push({
      x: cx + (Math.random() - 0.5) * box.w,
      y: cy + (Math.random() - 0.5) * box.h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 500 + Math.random() * 500,
      maxLife: 1000,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 6,
    });
  }
}

// ── FÍSICA DE QUEDA DE CAIXAS ────────────────────────────────────────────────

function triggerBoxFall(
  destroyedIndex: number,
  platforms: Platform[],
  fallingBoxes: FallingBox[],
  destroyedBoxIndices: number[],
  destroyedTireIndices: number[] = []
): void {
  const destroyed = platforms[destroyedIndex];
  const alreadyFallingSet = new Set(fallingBoxes.map(f => f.index));
  const destroyedSet = new Set([...destroyedBoxIndices, ...destroyedTireIndices]);

  const isStackable = (p: Platform) => p.type === 'box' || p.type === 'tireHideout';

  const toFall: number[] = [];
  const visited = new Set<number>([destroyedIndex]);
  const queue: number[] = [];

  const STACK_TOL = 5; // tolerância de empilhamento (px)

  // Semente: stacks imediatamente acima do destruído
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (!isStackable(p)) continue;
    if (destroyedSet.has(i) || alreadyFallingSet.has(i) || visited.has(i)) continue;
    if (
      Math.abs(p.y + p.h - destroyed.y) <= STACK_TOL &&
      p.x < destroyed.x + destroyed.w &&
      p.x + p.w > destroyed.x
    ) {
      visited.add(i);
      queue.push(i);
      toFall.push(i);
    }
  }

  // BFS para stacks acima desses
  while (queue.length > 0) {
    const curIdx = queue.shift()!;
    const cur = platforms[curIdx];
    for (let i = 0; i < platforms.length; i++) {
      if (visited.has(i)) continue;
      const p = platforms[i];
      if (!isStackable(p)) continue;
      if (destroyedSet.has(i) || alreadyFallingSet.has(i)) continue;
      if (
        Math.abs(p.y + p.h - cur.y) <= STACK_TOL &&
        p.x < cur.x + cur.w &&
        p.x + p.w > cur.x
      ) {
        visited.add(i);
        queue.push(i);
        toFall.push(i);
      }
    }
  }

  for (const idx of toFall) {
    fallingBoxes.push({ index: idx, vy: 0, y: platforms[idx].y });
  }
}

export function updateFallingBoxes(
  fallingBoxes: FallingBox[],
  platforms: Platform[],
  destroyedBoxIndices: number[],
  destroyedTireIndices: number[] = []
): void {
  if (fallingBoxes.length === 0) return;

  const FALL_GRAVITY = 0.6;
  const MAX_FALL_VY = 20;
  const destroyedSet = new Set([...destroyedBoxIndices, ...destroyedTireIndices]);
  const fallingIndexSet = new Set(fallingBoxes.map(f => f.index));

  // Aplica gravidade e sincroniza platform.y a cada frame
  for (const fb of fallingBoxes) {
    fb.vy = Math.min(fb.vy + FALL_GRAVITY, MAX_FALL_VY);
    fb.y += fb.vy;
    platforms[fb.index].y = fb.y; // mantém o sistema de colisão atualizado
  }

  // Detecta pousos: processa de baixo pra cima (maior y = mais baixo = pousa primeiro)
  const sorted = [...fallingBoxes].sort((a, b) => b.y - a.y);
  const landedSet = new Set<number>();

  for (const fb of sorted) {
    const box = platforms[fb.index];
    let bestSurfY = GROUND_Y; // padrão: chão

    for (let j = 0; j < platforms.length; j++) {
      if (j === fb.index) continue;
      if (destroyedSet.has(j)) continue;
      // Caixas ainda em queda (não pousadas neste frame): pula
      if (fallingIndexSet.has(j) && !landedSet.has(j)) continue;

      const other = platforms[j];
      // Sobreposição em x
      if (box.x + box.w <= other.x || box.x >= other.x + other.w) continue;

      const surfY = other.type === 'ground' ? GROUND_Y : other.y;

      // surfY precisa estar abaixo do topo da caixa e ser a mais rasa possível
      if (surfY > fb.y && surfY < bestSurfY) {
        bestSurfY = surfY;
      }
    }

    const targetY = bestSurfY - box.h;
    if (fb.y + box.h >= bestSurfY) {
      fb.y = targetY;
      platforms[fb.index].y = targetY;
      fb.vy = 0;
      landedSet.add(fb.index);
    }
  }

  // Remove caixas que pousaram
  for (let i = fallingBoxes.length - 1; i >= 0; i--) {
    if (landedSet.has(fallingBoxes[i].index)) {
      fallingBoxes.splice(i, 1);
    }
  }
}

function spawnFlyingTireFromStack(
  plat: Platform,
  tireIndex: number,
  numTires: number,
  bulletVx: number,
  flyingTires: FlyingTire[]
): void {
  const TIRE_D = plat.w;
  const radius = TIRE_D / 2;
  const cx = plat.x + plat.w / 2;
  const bottomY = plat.y + plat.h;
  const cy = bottomY - TIRE_D * tireIndex - radius;

  const dir = bulletVx >= 0 ? 1 : -1;
  const spread = (tireIndex / Math.max(numTires - 1, 1) - 0.5) * 2;
  const vx = dir * (3 + Math.random() * 5) + spread * 2;
  const vy = -(6 + Math.random() * 6 + tireIndex * 1.5);
  const angularVel = (vx / radius) * (0.8 + Math.random() * 0.4);

  flyingTires.push({ x: cx, y: cy, vx, vy, radius, angle: 0, angularVel, bounces: 0 });
}

function spawnRollingTiresFromHideout(
  plat: Platform,
  bulletVx: number,
  flyingTires: FlyingTire[]
): void {
  const radius = Math.max(32, Math.min(50, plat.w * 0.52));
  const cx = plat.x + plat.w / 2;
  const cy = Math.min(GROUND_Y - radius - 6, plat.y + plat.h * 0.68);
  const bulletDir = bulletVx >= 0 ? 1 : -1;

  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const dir = Math.random() < 0.55 ? bulletDir : side;
    const speed = 4.2 + Math.random() * 5.6;
    const vx = dir * speed + (Math.random() - 0.5) * 2.4;
    const vy = -(3.2 + Math.random() * 6.2);
    const angularVel = (vx / radius) * (0.9 + Math.random() * 0.45);
    flyingTires.push({
      x: cx + (i - 1.5) * radius * 0.42,
      y: cy - i * 5,
      vx,
      vy,
      radius,
      angle: Math.random() * Math.PI * 2,
      angularVel,
      bounces: 0,
      life: 360 + Math.random() * 140,
    });
  }
}

export function updateFlyingTires(tires: FlyingTire[]): void {
  const TIRE_GRAVITY   = 0.55;
  const MAX_VY         = 22;
  const BOUNCE_DECAY   = 0.50;
  const FRICTION       = 0.84;
  const ROLL_FRICTION  = 0.97;
  const MAX_BOUNCES    = 7;

  for (let i = tires.length - 1; i >= 0; i--) {
    const t = tires[i];
    if (t.life !== undefined) t.life--;
    t.vy = Math.min(t.vy + TIRE_GRAVITY, MAX_VY);
    t.x += t.vx;
    t.y += t.vy;
    t.angle += t.angularVel;

    if (t.y + t.radius >= GROUND_Y) {
      t.y = GROUND_Y - t.radius;
      t.vy = -Math.abs(t.vy) * BOUNCE_DECAY;
      t.vx *= FRICTION;
      t.angularVel = t.vx * 0.05;
      t.bounces++;
      if (Math.abs(t.vy) < 0.8) { t.vy = 0; }
    } else {
      t.angularVel *= ROLL_FRICTION;
    }

    const settled = t.bounces >= MAX_BOUNCES && Math.abs(t.vy) < 1.0 && Math.abs(t.vx) < 0.5;
    const expired = t.life !== undefined && t.life <= 0;
    if (settled || expired) { tires.splice(i, 1); }
  }
}

export function updateBullets(
  bullets: Bullet[],
  player: Player,
  platforms: Platform[],
  dt: number,
  onHit: () => void,
  destroyedBoxIndices: number[],
  particles: Particle[],
  fallingBoxes: FallingBox[],
  flyingTires: FlyingTire[],
  destroyedTireIndices: number[],
  bystanders: Bystander[],
  onBystanderHit: (bx: number, by: number) => void
): Bullet[] {
  const ph = player.isRolling ? PLAYER_ROLL_H : PLAYER_H;
  const surviving: Bullet[] = [];

  for (const b of bullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.vy += 0.1;
    b.age += dt;

    // Out of bounds
    if (b.age > 3000 || b.y > CANVAS_H + 50 || b.x < -500) continue;

    // Hit platform
    let hitPlatform = false;
    for (let pi = 0; pi < platforms.length; pi++) {
      const plat = platforms[pi];
      if (plat.type === 'box'  && destroyedBoxIndices.includes(pi)) continue;
      if ((plat.type === 'tire' || plat.type === 'tireHideout') && destroyedTireIndices.includes(pi)) continue;
      // Tiros do drone atravessam plataformas finas (grades das escadas) e a própria escada
      if (plat.type === 'platform') continue;
      if (plat.isLadder) continue;
      if (getPlatformCollisionRects(plat).some((hit) => rectOverlap(b.x - 4, b.y - 4, 8, 8, hit.x, hit.y, hit.w, hit.h))) {
        if (plat.type === 'box') {
          destroyedBoxIndices.push(pi);
          spawnBoxShatter(particles, plat);
          triggerBoxFall(pi, platforms, fallingBoxes, destroyedBoxIndices, destroyedTireIndices);
        } else if (plat.type === 'tire') {
          destroyedTireIndices.push(pi);
          const numTires = Math.max(1, Math.round(plat.h / plat.w));
          for (let ti = 0; ti < numTires; ti++) {
            spawnFlyingTireFromStack(plat, ti, numTires, b.vx, flyingTires);
          }
        } else if (plat.type === 'tireHideout') {
          destroyedTireIndices.push(pi);
          spawnRollingTiresFromHideout(plat, b.vx, flyingTires);
          // Pneus empilhados acima também caem (mesma física da caixa)
          triggerBoxFall(pi, platforms, fallingBoxes, destroyedBoxIndices, destroyedTireIndices);
        }
        hitPlatform = true;
        break;
      }
    }
    if (hitPlatform) continue;

    // Hit player (immune during side flip)
    if (!player.invincible && !player.sideFlipImmune && player.state !== 'dead') {
      if (rectOverlap(b.x - 4, b.y - 4, 8, 8, player.x, player.y, player.w, ph)) {
        player.health--;
        player.invincible = true;
        player.invincibleTimer = HIT_INVINCIBILITY;
        player.hurtStunTimer = HIT_STUN_DURATION;
        player.vx = 0;
        player.isRolling = false;
        player.autoRoll = false;
        player.state = 'hurt';
        if (player.health <= 0) player.state = 'dead';
        onHit();
        continue;
      }
    }

    // Hit bystander — hitbox generoso (100px largura) para combinar com o sprite visual
    let hitBystander = false;
    for (const by of bystanders) {
      if (by.state === 'dead') continue;
      if (rectOverlap(b.x - 4, b.y - 4, 8, 8, by.x, by.y, 100, by.h)) {
        by.state = 'dead';
        by.vx = 0;
        by.deadTimer = 1400;
        onBystanderHit(by.x + 50, by.y + by.h / 2);
        hitBystander = true;
        break;
      }
    }
    if (hitBystander) continue;

    surviving.push(b);
  }

  return surviving;
}

export function updateBystanders(
  bystanders: Bystander[],
  player: Player,
  drone: { x: number; y: number },
  _droneActive: boolean,
  dt: number
): void {
  const FLEE_SPEED = 4.8;
  const DESPAWN_RIGHT_X = 31000;
  const DESPAWN_LEFT_X  = 24000;
  // Distância horizontal do drone que dispara a fuga.
  // No modo editor sem Z, o drone fica em x:-80 (longe demais para disparar).
  // Na história, o drone segue ~140px atrás do jogador — ativa perto dos NPCs.
  // No modo editor com Z, o drone spawna perto do jogador — também ativa.
  const DRONE_FLEE_DIST = 500;

  for (const b of bystanders) {
    if (b.state === 'dead') continue;
    b.animTimer += dt;
    if (b.state === 'sit') {
      const droneDist = Math.abs(drone.x - b.x);
      if (droneDist < DRONE_FLEE_DIST) {
        const speed = b.fleeSpeed ?? FLEE_SPEED;
        b.state = 'flee';
        b.facingRight = b.fleeDir === 'right';
        b.vx = b.fleeDir === 'right' ? speed : -speed;
        b.animTimer = 0;
      }
    } else {
      b.x += b.vx;
      if (b.x > DESPAWN_RIGHT_X || b.x < DESPAWN_LEFT_X) {
        b.vx = 0;
      }
    }
  }
}

export function updateDogs(dogs: Dog[], player: Player, dt: number, onBite: () => void): void {
  const RUN_SPEED = 3.0;
  const CHASE_SPEED = 4.6;
  const BITE_RANGE_X = 58;
  const BITE_RANGE_Y = 64;
  const BITE_DURATION = 420;
  const BITE_COOLDOWN = 1400;
  const DETECT_RANGE = 560;

  for (const dog of dogs) {
    dog.biteCooldown = Math.max(0, dog.biteCooldown - dt);
    dog.animTimer += dt;

    const playerCX = player.x + player.w / 2;
    const playerCY = player.y + (player.isRolling ? PLAYER_ROLL_H : PLAYER_H) / 2;
    const dogCX = dog.x + dog.w / 2;
    const dogCY = dog.y + dog.h / 2;
    const dx = playerCX - dogCX;
    const dy = playerCY - dogCY;
    const distX = Math.abs(dx);
    const distY = Math.abs(dy);

    const playerInZone = player.x + player.w > dog.patrolLeft &&
                         player.x < dog.patrolRight;

    // Horácio em cima dos obstáculos verdes específicos — cão fica parado olhando
    const SAFE_OBSTACLE_TOP_Y = GROUND_Y - 102;
    const SAFE_OBSTACLES_X: Array<[number, number]> = [
      [18972, 18972 + 239],
      [20648, 20648 + 239],
    ];
    const playerBottom = player.y + (player.isRolling ? PLAYER_ROLL_H : PLAYER_H);
    const playerOnSafeObstacle = Math.abs(playerBottom - SAFE_OBSTACLE_TOP_Y) < 4 &&
      SAFE_OBSTACLES_X.some(([x1, x2]) => player.x + player.w > x1 && player.x < x2);

    const canDetect = distX < DETECT_RANGE && playerInZone && player.state !== 'dead' && !playerOnSafeObstacle;

    if (dog.biteTimer > 0) {
      dog.biteTimer = Math.max(0, dog.biteTimer - dt);
      dog.vx = 0;
      dog.animState = 'bite';
    } else if (!canDetect) {
      // Horácio fora da zona — para e olha em sua direção
      dog.vx = 0;
      if (dog.animState !== 'idle') {
        dog.animState = 'idle';
        dog.animTimer = 0;
      }
    } else {
      dog.animState = 'run';

      if (dx > 0) {
        dog.vx = CHASE_SPEED;
        dog.facingRight = true;
      } else {
        dog.vx = -CHASE_SPEED;
        dog.facingRight = false;
      }

      if (distX < BITE_RANGE_X && distY < BITE_RANGE_Y && dog.biteCooldown <= 0) {
        dog.animState = 'bite';
        dog.biteTimer = BITE_DURATION;
        dog.biteCooldown = BITE_COOLDOWN;
        dog.vx = 0;

        if (!player.invincible && !player.sideFlipImmune && player.state !== 'dead') {
          player.health--;
          player.invincible = true;
          player.invincibleTimer = HIT_INVINCIBILITY;
          player.hurtStunTimer = HIT_STUN_DURATION;
          player.vx = 0;
          player.isRolling = false;
          player.autoRoll = false;
          player.state = 'hurt';
          if (player.health <= 0) player.state = 'dead';
          onBite();
        }
      }
    }

    dog.x += dog.vx;

    // Clamp nas bordas — só inverte direção em modo corrida
    if (dog.x <= dog.patrolLeft) {
      dog.x = dog.patrolLeft;
      if (dog.animState === 'run') dog.facingRight = true;
    }
    if (dog.x + dog.w >= dog.patrolRight) {
      dog.x = dog.patrolRight - dog.w;
      if (dog.animState === 'run') dog.facingRight = false;
    }

    // Em idle, sempre olha na direção de Horácio (definido depois do clamp)
    if (dog.animState === 'idle') {
      dog.facingRight = dx >= 0;
    }

    dog.y = GROUND_Y - dog.h;
  }
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= dt;
    return p.life > 0;
  });
}

export function spawnParticleHelper(
  particles: Particle[],
  x: number, y: number, color: string
): void {
  const count = 3;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 2,
      life: 300 + Math.random() * 200,
      maxLife: 500,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

export type { Particle };
