import type { Player, Drone, Bullet, Platform, Particle, GameState, Keys } from './types';
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
import type { SlopedRect } from './collision';

function rectOverlap(ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function getStackedBoxWall(platforms: Platform[], box: Platform): SlopedRect | null {
  if (box.type !== 'box') return null;
  const boxes = platforms.filter((plat) => plat.type === 'box');
  const stack: Platform[] = [];
  const queue: Platform[] = [box];
  const seen = new Set<Platform>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    stack.push(current);

    for (const other of boxes) {
      if (seen.has(other)) continue;
      const touchesHorizontally = Math.abs(current.x + current.w - other.x) <= 3 || Math.abs(other.x + other.w - current.x) <= 3;
      const overlapsHorizontally = current.x < other.x + other.w - 3 && current.x + current.w > other.x + 3;
      const touchesVertically = Math.abs(current.y + current.h - other.y) <= 3 || Math.abs(other.y + other.h - current.y) <= 3;
      const overlapsVertically = current.y < other.y + other.h - 3 && current.y + current.h > other.y + 3;

      if ((touchesHorizontally && overlapsVertically) || (touchesVertically && overlapsHorizontally)) {
        queue.push(other);
      }
    }
  }

  if (stack.length < 3) return null;

  const left = Math.min(...stack.map((plat) => plat.x));
  const right = Math.max(...stack.map((plat) => plat.x + plat.w));
  const top = Math.min(...stack.map((plat) => plat.y));
  const bottom = Math.max(...stack.map((plat) => plat.y + plat.h));
  const columnHeight = bottom - top;
  const minStackHeight = box.h * 3 - 2;

  if (columnHeight < minStackHeight) return null;

  return { x: left, y: top, w: right - left, h: columnHeight };
}

function resolveClimbableWallContact(p: Player, hit: SlopedRect, vx: number): void {
  const overlapLeft = p.x + p.w - hit.x;
  const overlapRight = hit.x + hit.w - p.x;

  if (overlapLeft < overlapRight && vx >= 0) {
    p.x = hit.x - p.w;
    p.touchingWall = true;
    p.wallSide = 'right';
    p.wallX = hit.x;
    p.wallTopY = hit.y;
    if (p.vx > 0) p.vx = 0;
  } else if (overlapRight <= overlapLeft && vx <= 0) {
    p.x = hit.x + hit.w;
    p.touchingWall = true;
    p.wallSide = 'left';
    p.wallX = hit.x + hit.w;
    p.wallTopY = hit.y;
    if (p.vx < 0) p.vx = 0;
  }
}

function resolvePlayerPlatform(p: Player, plat: Platform, hit: SlopedRect, climbableBoxWall?: SlopedRect | null): boolean {
  const ph = (p.isRolling || p.forcedCrouch) ? PLAYER_ROLL_H : PLAYER_H;
  if (!rectOverlap(p.x, p.y, p.w, ph, hit.x, hit.y, hit.w, hit.h)) return false;

  // --- Slope resolution ---
  if (hit.slopeTop) {
    // Sample surface Y at the player's horizontal center
    const centerX = p.x + p.w / 2;
    const surfaceY = getSlopeSurfaceY(hit, centerX);
    const feetY = p.y + ph;

    // Land on slope: feet at or below surface, player's head above the surface
    if (feetY >= surfaceY && p.y <= surfaceY) {
      p.y = surfaceY - ph;
      if (p.vy > 0) p.vy = 0;
      p.onGround = true;
      p.coyoteTime = 6;
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

  if (plat.type === 'wall' && plat.climbable) {
    resolveClimbableWallContact(p, hit, p.vx);
    return false;
  }

  if (climbableBoxWall && (minOverlap === overlapLeft || minOverlap === overlapRight)) {
    resolveClimbableWallContact(p, climbableBoxWall, p.vx);
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
  p.onGround = false;
  p.touchingWall = false;
  p.wallSide = null;
  p.wallX = previousWallX;
  p.wallTopY = previousWallTopY;
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
          if (plat.type === 'ground') return false;
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
        if (plat.type === 'ground') return false;
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
      if (plat.type === 'ground') return false;
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
    p.vx = 0;
    p.vy = 0;
    if (keys.up) {
      p.vy = -CLIMB_SPEED;
    } else if (keys.down) {
      p.vy = CLIMB_SPEED;
    }
    if (!p.touchingWall && !keys.up && !keys.down) {
      p.isClimbing = false;
    }
    if ((keys.space || keys.up) && !keys.left && !keys.right && !p.isClimbing) {
      // fall off
    }
    // Allow jump off wall
    if (keys.space && p.touchingWall) {
      p.isClimbing = false;
      p.vy = JUMP_FORCE * 0.9;
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
      const canJumpOffWall = p.wallRunTimer < WALLRUN_DURATION - 160;
      const pressingForwardIntoWall =
        (wallSide === 'right' && keys.right) ||
        (wallSide === 'left' && keys.left);
      const neutralVerticalClimb = (keys.space || keys.up) && !keys.left && !keys.right;
      if (canJumpOffWall && (keys.space || keys.up) && pressingForwardIntoWall && wallSide) {
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
        p.vy = WALLFLIP_JUMP_VY;
        p.vx = wallSide === 'right' ? -WALLFLIP_BACK_VX : WALLFLIP_BACK_VX;
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
      } else if (canJumpOffWall && (keys.space || keys.up) && wallSide) {
        p.isWallRunning = false;
        p.coyoteTime = 0;
        p.vy = WALLRUN_JUMP_VY;
        p.vx = wallSide === 'right' ? -WALLRUN_JUMP_VX : WALLRUN_JUMP_VX;
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
      if (!keys.space && !keys.up) p.wallHangJumpConsumed = false;

      if ((keys.space || keys.up) && !p.wallHangJumpConsumed) {
        const pressingAway = (side === 'right' && keys.left) || (side === 'left' && keys.right);
        p.isWallHanging = false;
        p.isWallClimbUp = false;
        p.wallClimbSide = null;

        if (pressingAway) {
          // Back + jump → drop off wall backward (penalidade reduz impulso vertical)
          p.vx = side === 'right' ? -WALLFLIP_BACK_VX : WALLFLIP_BACK_VX;
          p.vy = WALLFLIP_JUMP_VY * p.wallClimbJumpPenalty;
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
        p.wallHangJumpConsumed = (keys.space || keys.up) && !stillPressingForward;
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
    const diveTriggered = (keys.dive || (keys.down && (keys.space || keys.up)));
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
    } else if ((keys.space || (keys.up && !p.touchingWall)) && (p.coyoteTime > 0)) {
      // Aplica penalidade de pulo se o personagem acabou de escalar uma parede alta
      // Não reseta a penalidade aqui — ela persiste até o pouso para limitar vx no ar também
      p.vy = JUMP_FORCE * p.wallClimbJumpPenalty;
      p.onGround = false;
      p.coyoteTime = 0;
      p.jumpCount = 1;
      p.doubleJumpReady = false;
      spawnParticle(p.x + p.w / 2, p.y + ph, '#555060');
    }

    // Track key release after first jump (enables double jump)
    if (!keys.space && !keys.up && !p.onGround && p.jumpCount === 1) {
      p.doubleJumpReady = true;
    }

    // Double jump → side flip
    if (
      p.doubleJumpReady &&
      (keys.space || keys.up) &&
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

    // Wall climb initiate
    if (p.touchingWall && keys.up && !p.onGround) {
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
    for (const plat of platforms) {
      const climbableBoxWall = getStackedBoxWall(platforms, plat);
      for (const hit of getPlatformCollisionRects(plat)) {
        resolvePlayerPlatform(p, plat, hit, climbableBoxWall);
      }
    }
  }

  // If climbing, check still touching a wall
  if (p.isClimbing && !p.touchingWall) {
    p.isClimbing = false;
  }

  // Wall run trigger — só ativa se Horácio encostar na parede durante a subida do pulo
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
    p.vy < -2.5
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
    } else if (droppedDown && !p.isRolling && p.state !== 'hurt') {
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
    if (p.type === 'ground') continue;
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
    if (p.type === 'ground') continue;
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

/** Hard pushout: resolve any current overlap between drone AABB and solid platforms. */
function dronePushOut(drone: Drone, platforms: Platform[]): void {
  for (const p of platforms) {
    if (p.type === 'ground') continue;
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
  const targetX = player.x + DRONE_TARGET_OFFSET_X + Math.sin(Date.now() * 0.0007) * 30;
  const targetY = player.y + DRONE_TARGET_OFFSET_Y + Math.cos(Date.now() * 0.0009) * 20;

  // Pathfinding: compute bypass waypoint if something blocks the direct path
  const { tx, ty } = platforms.length > 0
    ? droneComputeWaypoint(drone, targetX, targetY, platforms)
    : { tx: targetX, ty: targetY };

  const dx = tx - drone.x;
  const dy = ty - drone.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const speed = DRONE_BASE_SPEED;

  if (dist > 2) {
    drone.vx += (dx / dist) * speed * 0.25;
    drone.vy += (dy / dist) * speed * 0.25;
  }

  // Obstacle repulsion (fine-grained — prevents grazing/sticking to surfaces)
  if (platforms.length > 0) {
    const { fx, fy } = droneRepulsion(drone, platforms);
    drone.vx += fx;
    drone.vy += fy;
  }

  // Less damping — keeps momentum so drone stays on player's tail
  drone.vx *= 0.84;
  drone.vy *= 0.84;

  drone.x += drone.vx;
  drone.y += drone.vy;

  // Hard pushout — resolve any remaining overlap
  if (platforms.length > 0) {
    dronePushOut(drone, platforms);
  }

  // Keep drone on screen y (roughly)
  if (drone.y < 30) { drone.y = 30; drone.vy = Math.abs(drone.vy); }
  if (drone.y > GROUND_Y - 60) { drone.y = GROUND_Y - 60; drone.vy = -Math.abs(drone.vy); }

  // ── Stuck detection: se o drone não avançou em ~2s, teleporta atrás do player ──
  drone.stuckTimer++;
  if (drone.stuckTimer >= 120) {
    const traveled = Math.abs(drone.x - drone.stuckLastX);
    const distToPlayer = Math.abs(drone.x - (player.x + DRONE_TARGET_OFFSET_X));
    // Preso: pouco deslocamento E ainda longe do player
    if (traveled < 10 && distToPlayer > 200) {
      drone.x = player.x + DRONE_TARGET_OFFSET_X;
      drone.y = Math.max(30, player.y + DRONE_TARGET_OFFSET_Y);
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
  if (drone.shootTimer <= 0) {
    drone.shootTimer = SHOOT_COOLDOWN + Math.random() * 400;

    // Aim at player
    const pdx = player.x + player.w / 2 - (drone.x + drone.w / 2);
    const pdy = player.y + player.h / 2 - (drone.y + drone.h / 2);
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

    if (pdist > 0) {
      bullets.push({
        x: drone.x + drone.w / 2,
        y: drone.y + drone.h / 2,
        vx: (pdx / pdist) * BULLET_SPEED,
        vy: (pdy / pdist) * BULLET_SPEED * 0.5,
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

export function updateBullets(
  bullets: Bullet[],
  player: Player,
  platforms: Platform[],
  dt: number,
  onHit: () => void,
  destroyedBoxIndices: number[],
  particles: Particle[]
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
      if (plat.type === 'box' && destroyedBoxIndices.includes(pi)) continue;
      if (getPlatformCollisionRects(plat).some((hit) => rectOverlap(b.x - 4, b.y - 4, 8, 8, hit.x, hit.y, hit.w, hit.h))) {
        if (plat.type === 'box') {
          destroyedBoxIndices.push(pi);
          spawnBoxShatter(particles, plat);
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

    surviving.push(b);
  }

  return surviving;
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
