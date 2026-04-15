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

function resolvePlayerPlatform(p: Player, plat: Platform, hit: SlopedRect): boolean {
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
    // Only push out horizontally for walls
    if (overlapLeft < overlapRight && p.vx >= 0) {
      p.x = hit.x - p.w;
      p.touchingWall = true;
      p.wallSide = 'right';
      p.wallX = hit.x;
      p.wallTopY = hit.y;
      if (p.vx > 0) p.vx = 0;
    } else if (overlapRight <= overlapLeft && p.vx <= 0) {
      p.x = hit.x + hit.w;
      p.touchingWall = true;
      p.wallSide = 'left';
      p.wallX = hit.x + hit.w;
      p.wallTopY = hit.y;
      if (p.vx < 0) p.vx = 0;
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
        p.wallClimbTimer = WALLCLIMB_DURATION;
        p.wallClimbStartX = p.x;
        p.wallClimbStartY = p.y;
        p.wallClimbTargetX = wallSide === 'right' ? p.wallX + 22 : p.wallX - p.w - 22;
        p.wallClimbTargetY = p.wallTopY - PLAYER_H - 4;
        p.wallClimbSide = wallSide;
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
          // Back + jump → drop off wall backward
          p.vx = side === 'right' ? -WALLFLIP_BACK_VX : WALLFLIP_BACK_VX;
          p.vy = WALLFLIP_JUMP_VY;
          p.jumpedFromWall = true;
        } else {
          // Forward + jump (or just jump) → pull up onto wall top
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
      const t = Math.max(0, Math.min(1, 1 - p.wallClimbTimer / WALLCLIMB_DURATION));
      const liftY = p.wallClimbStartY - 86;
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
      if (keys.left) {
        p.vx = -PLAYER_SPEED;
        p.facingRight = false;
      } else if (keys.right) {
        p.vx = PLAYER_SPEED;
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
      p.vy = JUMP_FORCE;
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
      for (const hit of getPlatformCollisionRects(plat)) {
        resolvePlayerPlatform(p, plat, hit);
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

export function updateDrone(
  drone: Drone,
  player: Player,
  bullets: Bullet[],
  dt: number,
  spawnParticle: (x: number, y: number, color: string) => void
): number {
  let shakeAmount = 0;

  // Target position: behind and above player
  const targetX = player.x + DRONE_TARGET_OFFSET_X + Math.sin(Date.now() * 0.0007) * 30;
  const targetY = player.y + DRONE_TARGET_OFFSET_Y + Math.cos(Date.now() * 0.0009) * 20;

  const dx = targetX - drone.x;
  const dy = targetY - drone.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const speed = DRONE_BASE_SPEED;

  if (dist > 2) {
    drone.vx += (dx / dist) * speed * 0.25;
    drone.vy += (dy / dist) * speed * 0.25;
  }

  // Less damping — keeps momentum so drone stays on player's tail
  drone.vx *= 0.84;
  drone.vy *= 0.84;

  drone.x += drone.vx;
  drone.y += drone.vy;

  // Keep drone on screen y (roughly)
  if (drone.y < 30) { drone.y = 30; drone.vy = Math.abs(drone.vy); }
  if (drone.y > GROUND_Y - 60) { drone.y = GROUND_Y - 60; drone.vy = -Math.abs(drone.vy); }

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

export function updateBullets(
  bullets: Bullet[],
  player: Player,
  platforms: Platform[],
  dt: number,
  onHit: () => void
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
    for (const plat of platforms) {
      if (getPlatformCollisionRects(plat).some((hit) => rectOverlap(b.x - 4, b.y - 4, 8, 8, hit.x, hit.y, hit.w, hit.h))) {
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
