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
  DIVE_ENERGY_MAX, DIVE_ENERGY_COST, DIVE_ENERGY_REGEN_PER_MS,
} from './constants';
import { getPlatformCollisionRects, getSlopeSurfaceY } from './collision';
import { FIRE_ESCAPE, FIRE_ESCAPE_TOP_FLOOR_H, FIRE_ESCAPES, RIVER } from './level';
import { spawnRiverRipple } from './render';
import type { SlopedRect } from './collision';
import { queryGrid } from './spatialGrid';
import type { SpatialGrid } from './spatialGrid';

interface BoxStackWall extends SlopedRect {
  boxCount: number;
  storyPhysics: boolean;
}

// Altura máxima acima do chão (em px) que Horácio pode escalar em caixas (~4 caixas de 55px)
const MAX_BOX_CLIMB_HEIGHT = 220; // ≈ 4 caixas — acima disso climb é bloqueado
const MIN_BOX_CLIMB_HEIGHT = 160; // ligeiramente abaixo de 3 caixas (3×55=165) para incluir 3 caixas relativas

// ── KONG VAULT ─────────────────────────────────────────────────────
// Salto especial: pulando bem perto/encostado num objeto marcado com vaultTrigger
// (ou tocando um durante a subida do dive-roll), Horácio dá um salto/vault que o
// manda bem mais longe, exibindo poses próprias, e força um rolamento ao pousar.
const KONG_VAULT_PROXIMITY = 42; // px de folga horizontal para considerar "bem perto/encostado"
const KONG_VAULT_START_MS = 130; // duração da pose inicial (borda do objeto)
const KONG_VAULT_VY = -11.5; // impulso vertical do vault (arco parabólico sobre o objeto)
const KONG_VAULT_VX = 13.0;  // impulso horizontal do vault (projeção pra frente)

function findVaultTriggerNear(p: Player, platforms: Platform[], ph: number): Platform | null {
  const feetY = p.y + ph;
  for (const plat of platforms) {
    if (!plat.vaultTrigger) continue;
    // Perto o bastante horizontalmente (à frente, atrás ou já encostado)
    const nearX = p.x + p.w + KONG_VAULT_PROXIMITY > plat.x && p.x - KONG_VAULT_PROXIMITY < plat.x + plat.w;
    if (!nearX) continue;
    // Verticalmente próximo do topo do objeto (pode saltar por cima dele)
    if (feetY < plat.y - 12 || feetY > plat.y + plat.h + 20) continue;
    // Não dispara quando Horácio está EM CIMA do obstáculo — monkey vault é só pelas bordas.
    // Quando em pé no topo: feetY ≈ plat.y e corpo dentro dos limites horizontais.
    const onTopSurface = feetY <= plat.y + 10 && p.x + p.w > plat.x + 4 && p.x < plat.x + plat.w - 4;
    if (onTopSurface) continue;
    // vaultFrontOnly: só dispara quando Horácio chega pela frente ao nível do chão.
    // Quando ele já está em cima do carro os pés ficam bem acima do GROUND_Y
    // (capô ≈ y:335, chão = 410). Bloqueamos se os pés estiverem a mais de 30px
    // acima do chão — isso cobre toda a superfície do capô/teto sem afetar a
    // abordagem frontal normal (pés a ~410).
    if (plat.vaultFrontOnly && feetY < GROUND_Y - 30) continue;
    return plat;
  }
  return null;
}

function triggerKongVault(p: Player, spawnParticle: (x: number, y: number, color: string) => void, platType?: string): void {
  p.kongVaultPhase = 'start';
  p.kongVaultTimer = KONG_VAULT_START_MS;
  p.kongVaultLanding = true;
  p.kongVaultIsObstacle = platType === 'obstacle';
  p.kongVaultFromDive   = p.isDivejumping;
  p.isDivejumping = false;
  p.isRolling = false;
  p.autoRoll = false;
  p.onGround = false;
  p.coyoteTime = 0;
  p.vy = 0;
  p.vx = 0;
  p.jumpCount = 1;
  p.doubleJumpReady = false;
  for (let i = 0; i < 12; i++) {
    spawnParticle(p.x + p.w / 2, p.y + p.h, i % 2 === 0 ? '#808090' : '#c9a24a');
  }
}

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

  return {
    x: left,
    y: top,
    w: right - left,
    h: columnHeight,
    boxCount: stack.length,
    storyPhysics: box.raceStoryPhysics === true,
  };
}

function isJunkyardUpperTargetBox(platform: Platform): boolean {
  return platform.type === 'box' &&
    platform.x === 12505 &&
    platform.w === 65 &&
    platform.h === 55 &&
    Math.round(GROUND_Y - platform.y) === 277;
}

function isJunkyardLowerTargetBox(platform: Platform): boolean {
  return platform.type === 'box' &&
    platform.x === 12505 &&
    platform.w === 65 &&
    platform.h === 55 &&
    Math.round(GROUND_Y - platform.y) === 220;
}

// A pilha A tem duas caixas alinhadas que podem estar sobrepostas na mesma
// trajetória de salto. Nos modos História e Corrida com drone, a caixa de
// cima deve receber o primeiro contato; a Corrida sem drone mantém a ordem
// original porque usa a física especial de escalada.
function orderJunkyardUpperBoxFirst(platforms: Platform[]): Platform[] {
  const upperIndex = platforms.findIndex(isJunkyardUpperTargetBox);
  const lowerIndex = platforms.findIndex(isJunkyardLowerTargetBox);
  if (upperIndex < 0 || lowerIndex < 0 || upperIndex < lowerIndex) return platforms;

  const ordered = [...platforms];
  const [upper] = ordered.splice(upperIndex, 1);
  ordered.splice(lowerIndex, 0, upper);
  return ordered;
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
    if (isBox) {
      p.wallRunOnBox = true;
      p.wallRunBoxStackCount = boxWall?.boxCount ?? 0;
      p.wallRunBoxStackHeight = boxWall?.h ?? 0;
      p.wallRunBoxClimbAllowed = !boxWall?.storyPhysics;
    } else if (!p.isWallRunning) {
      p.wallRunOnBox = isBox;
      p.wallRunBoxStackCount = 0;
      p.wallRunBoxStackHeight = 0;
      p.wallRunBoxClimbAllowed = true;
    }
  } else if (overlapRight <= overlapLeft && vx <= 0) {
    p.x = hit.x + hit.w;
    p.touchingWall = true;
    p.wallSide = 'left';
    p.wallX = hit.x + hit.w;
    p.wallTopY = hit.y;
    p.wallLowImpulse = lowImpulse;
    if (p.vx < 0) p.vx = 0;
    if (isBox) {
      p.wallRunOnBox = true;
      p.wallRunBoxStackCount = boxWall?.boxCount ?? 0;
      p.wallRunBoxStackHeight = boxWall?.h ?? 0;
      p.wallRunBoxClimbAllowed = !boxWall?.storyPhysics;
    } else if (!p.isWallRunning) {
      p.wallRunOnBox = isBox;
      p.wallRunBoxStackCount = 0;
      p.wallRunBoxStackHeight = 0;
      p.wallRunBoxClimbAllowed = true;
    }
  }
}

function resolvePlayerPlatform(
  p: Player,
  plat: Platform,
  hit: SlopedRect,
  climbableBoxWall?: BoxStackWall | null,
  useIndividualBoxContact = false,
): boolean {
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
    // Only applies to platforms explicitly marked slopeRunDown (e.g. the staircase).
    // Car slopes and other slopes keep the original behavior.
    const SLOPE_SNAP_THRESHOLD = 14;
    const onSlopeDownSnap = plat.slopeRunDown === true &&
      feetY >= surfaceY - SLOPE_SNAP_THRESHOLD && feetY < surfaceY && p.vy >= 0;

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
    p.wallNoHang = false; // reseta flag de noHang (pode vir de parede tic-tac anterior)
    return false;
  }

  // Plataformas one-way: colisão apenas pelo topo (fundo e lados são transparentes).
  // Usado em lajes de telhado para que o jogador possa pular de baixo e pousar em cima.
  if (plat.oneWay) {
    if (minOverlap === overlapTop && p.vy >= 0) {
      p.y = hit.y - ph;
      p.vy = 0;
      p.onGround = true;
      p.coyoteTime = 6;
      return true;
    }
    return false; // passa livremente por baixo e pelos lados
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
      p.wallNoClimbOver = plat.noClimbOver ?? false;
      p.wallNoHang = plat.noHang ?? false;
      if (plat.tictacWall) {
        p.onTictacWall = true;
        p.isClimbing = false;
      } else {
        p.touchingLadder = true;
      }
      return false;
    }
    // Face não escalável: cai no resolver padrão (push sólido sem wall run/climb).
  }

  if (climbableBoxWall && (minOverlap === overlapLeft || minOverlap === overlapRight)) {
    // A pilha identifica a regra de escalada, mas a superfície real do
    // contato é a caixa individual que acabou de ser tocada. Usar o
    // retângulo envolvente aqui fazia a GY-220 agir como a parede inteira
    // até a GY-275 e empurrava Horácio de volta cedo demais.
    // A Corrida sem drone mantém deliberadamente o comportamento anterior:
    // usa a parede lógica da pilha para permitir a escalada.
    const contactSurface = useIndividualBoxContact ? hit : climbableBoxWall;
    resolveClimbableWallContact(p, contactSurface, p.vx, climbableBoxWall);
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
        p.wallRunBoxClimbAllowed = plat.raceStoryPhysics !== true;
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
        p.wallRunBoxClimbAllowed = plat.raceStoryPhysics !== true;
      }
    }
    return false;
  }

  // ── KnockOff: qualquer toque derruba imediatamente ───────────────────
  if (plat.knockOff) {
    p.vy = Math.max(p.vy, 7);
    p.onGround = false;
    p.isWallRunning = false;
    p.isWallClimbUp = false;
    p.isWallHanging = false;
    return true;
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
  spawnParticle: (x: number, y: number, color: string) => void,
  allowBoxClimb = false,
  prioritizeUpperJunkyardBox = false,
): void {
  const prevOnGround = p.onGround;
  const previousWallSide = p.wallSide;
  const previousWallX = p.wallX;
  const previousWallTopY = p.wallTopY;
  const prevTouchingLadder = p.touchingLadder;
  const prevTouchingWall = p.touchingWall;
  const prevOnTictacWall = p.onTictacWall;
  p.onGround = false;
  p.touchingWall = false;
  p.touchingLadder = false;
  p.justLandedOnNoRollSlope = false;
  p.onTictacWall = false;
  p.wallSide = null;
  p.wallX = previousWallX;
  p.wallTopY = previousWallTopY;
  if (!p.isWallRunning) {
    p.wallRunOnBox = false;
    p.wallRunBoxStackCount = 0;
    p.wallRunBoxStackHeight = 0;
    p.wallRunBoxClimbAllowed = true;
  }
  p.isCrouching = false;

  if (p.state === 'dead') return;

  if (p.coyoteTime > 0) p.coyoteTime--;

  // Trava exclusiva pós-mergulho: se o pulo ficou pressionado durante o mergulho e o
  // rolamento de pouso, o pulo não deve disparar em sequência — só solta a trava quando
  // o jogador soltar o botão de pulo (precisa soltar e apertar de novo para pular).
  if (!keys.space) p.postDiveJumpLocked = false;

  // Regenera a energia de mergulho com o tempo (até o máximo)
  if (p.diveEnergy < DIVE_ENERGY_MAX) {
    p.diveEnergy = Math.min(DIVE_ENERGY_MAX, p.diveEnergy + DIVE_ENERGY_REGEN_PER_MS * dt);
  }

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
      p.diveLandingRoll = false;
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
        } else {
          // Restaura a posição Y ao voltar para a altura normal — sem isso o offset do
          // rolamento (p.y += PLAYER_H - PLAYER_ROLL_H) nunca é desfeito, deixando o
          // jogador "afundado" e sujeito a atravessar o chão em mergulhos encadeados.
          p.y -= expandH;
        }
      } else {
        // Rolamento terminou no ar (raro) — restaura a altura normal também
        p.y -= (PLAYER_H - PLAYER_ROLL_H);
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
  if (p.onGround && !p.isRolling && !p.forcedCrouch && (p.state as string) !== 'hurt' && (p.state as string) !== 'dead') {
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
      const boxClimbAllowed = allowBoxClimb && (!p.wallRunOnBox || p.wallRunBoxClimbAllowed);
      const canClimbWall   = (!p.wallRunOnBox || !isTallBoxStack || boxClimbAllowed) && _timerWindow;
      const canJumpOffWall = (!p.wallRunOnBox || isTallBoxStack) && !boxClimbAllowed && _timerWindow;
      const pressingForwardIntoWall =
        (wallSide === 'right' && keys.right) ||
        (wallSide === 'left' && keys.left);
      const neutralVerticalClimb = (keys.space || keys.up) && !keys.left && !keys.right;
      const boxClimbInput = boxClimbAllowed
        ? (keys.space || keys.up)
        : (keys.space || keys.up) && pressingForwardIntoWall;
      if (canClimbWall && boxClimbInput && wallSide && !p.wallNoHang) {
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
        } else if (p.wallNoClimbOver) {
          // Envergadura bloqueia a subida — empurra Horácio de volta
          p.isWallHanging = false;
          p.isWallClimbUp = false;
          p.wallClimbSide = null;
          p.vy = 5;
          p.vx = side === 'right' ? -4 : 4;
          p.wallHangJumpConsumed = true;
          p.state = 'fall';
        } else if (p.wallHangQuickJump) {
          // Pulo rápido: chegou sem segurar espaço — vaulta imediatamente com arco menor
          // Mais rápido (sem delay de soltar+apertar), mas menos altura no pulo resultante
          p.x = p.wallClimbTargetX;
          p.y = p.wallClimbTargetY;
          p.vx = side === 'right' ? 2.4 : -2.4;
          p.vy = JUMP_FORCE * 0.55; // arco baixo: clareia o muro mas não sobe alto
          p.coyoteTime = 0;          // sem pulo extra disponível nessa posição
          p.jumpOriginGroundY = p.wallTopY;
          p.jumpedFromWall = true;
          p.wallHangQuickJump = false;
          for (let i = 0; i < 8; i++) {
            spawnParticle(
              p.x + (side === 'right' ? p.w : 0),
              p.y + PLAYER_H * 0.5,
              i % 2 === 0 ? '#d8d0c8' : '#aaaacc',
            );
          }
        } else {
          // Pulo deliberado: segurou, soltou e apertou de novo → altura total
          p.x = p.wallClimbTargetX;
          p.y = p.wallClimbTargetY;
          p.vx = side === 'right' ? 2.4 : -2.4;
          p.vy = 0;
          p.coyoteTime = 3; // pulo completo disponível a partir do topo
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
        // Se chegou sem segurar espaço → elegível para pulo rápido/baixo
        p.wallHangQuickJump = !keys.space;
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
  } else if (p.kongVaultPhase === 'start') {
    // Pose de início congelada na borda do objeto pelo tempo configurado
    p.state = 'jump';
    p.vx = 0;
    p.vy = 0;
    p.kongVaultTimer -= dt;
    if (p.kongVaultTimer <= 0) {
      p.kongVaultPhase = 'air';
      p.vy = KONG_VAULT_VY;
      p.vx = p.facingRight ? KONG_VAULT_VX : -KONG_VAULT_VX;
    }
  } else if (p.kongVaultPhase === 'air') {
    // No ar durante o vault: mantém a trajetória, sem interferência do input horizontal
    p.state = 'jump';
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
    // Segurar ↓ sozinho pode ter disparado o rolamento automático (autoRoll) antes do pulo ser
    // pressionado. Nesse caso o pulo deve INTERROMPER o rolamento e mergulhar (não bloquear).
    // Exceção: o rolamento de POUSO de um mergulho (diveLandingRoll) precisa completar
    // inteiro antes de permitir outro mergulho — evita mergulhos rasos encadeados sem tocar o chão.
    const canInterruptRollForDive = p.isRolling && p.autoRoll && !p.diveLandingRoll;
    const hasDiveEnergy = p.diveEnergy >= DIVE_ENERGY_COST - 0.5;
    const kongVaultTrigger = (keys.space && p.coyoteTime > 0 && !p.postDiveJumpLocked) ? findVaultTriggerNear(p, platforms, ph) : null;
    if (kongVaultTrigger) {
      triggerKongVault(p, spawnParticle, kongVaultTrigger.type);
    } else if (diveTriggered && !p.touchingWall && canDiveFromGround && (!p.isRolling || canInterruptRollForDive) && !p.isDivejumping && !p.postDiveJumpLocked && hasDiveEnergy) {
      if (canInterruptRollForDive) {
        p.y -= (PLAYER_H - PLAYER_ROLL_H); // restaura altura normal antes do mergulho
        p.isRolling = false;
        p.autoRoll = false;
        p.rollTimer = 0;
        p.landingRollFrame = 0;
      }
      p.isDivejumping = true;
      p.diveEnergy = Math.max(0, p.diveEnergy - DIVE_ENERGY_COST);
      p.vy = DIVEJUMP_JUMP_FORCE;
      p.vx = p.facingRight ? DIVEJUMP_SPEED : -DIVEJUMP_SPEED;
      p.onGround = false;
      p.coyoteTime = 0;
      p.landingCrouch = false;
      for (let i = 0; i < 10; i++) {
        spawnParticle(p.x + p.w / 2, p.y + ph, i % 2 === 0 ? '#808090' : '#555060');
      }
    // Normal jump
    } else if (keys.space && (p.coyoteTime > 0) && !p.postDiveJumpLocked) {
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

    // Kong Vault durante a subida do dive-jump: tocar um objeto marcado enquanto ainda sobe
    const _diveVaultPlat = p.isDivejumping && p.vy < 0 ? findVaultTriggerNear(p, platforms, ph) : null;
    if (_diveVaultPlat) {
      triggerKongVault(p, spawnParticle, _diveVaultPlat.type);
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
      (p.state as string) !== 'hurt' &&
      (p.state as string) !== 'dead'
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
    const boxClimbAllowed = allowBoxClimb && (!p.wallRunOnBox || p.wallRunBoxClimbAllowed);
    const _climbBannedOnBox = !boxClimbAllowed &&
      p.wallRunOnBox && (_boxHeight <= MIN_BOX_CLIMB_HEIGHT || _boxHeight > MAX_BOX_CLIMB_HEIGHT);
    if (p.touchingWall && keys.up && !p.onGround && !_climbBannedOnBox && !p.onTictacWall && !p.wallNoHang) {
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
        (p.state as string) !== 'hurt' && (p.state as string) !== 'dead' &&
        (keys.left || keys.right || Math.abs(p.vx) > 1)) {
      p.forcedCrouch = false;
      p.y += PLAYER_H - PLAYER_ROLL_H;
      p.isRolling = true;
      p.autoRoll = true;
      p.diveLandingRoll = false;
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

  // Gravity — não aplica durante climb, wall run ou a pose inicial congelada do Kong Vault
  if (!p.isClimbing && !p.isWallRunning && p.kongVaultPhase !== 'start') {
    p.vy += GRAVITY;
    if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;
  }

  // Guarda velocidade horizontal antes da colisão para detectar impacto em parede
  const incomingVx = p.vx;

  // Move + Collision
  // Durante divejump (vx alto), usa sub-steps para evitar tunneling por paredes finas
  if (!p.isWallClimbUp) {
    const SUBSTEPS = p.isDivejumping ? 3 : 1;
    const dx = p.vx / SUBSTEPS;
    const dy = p.vy / SUBSTEPS;

    for (let _ss = 0; _ss < SUBSTEPS; _ss++) {
      p.x += dx;
      p.y += dy;

      // Não deixa sair pela esquerda do mundo
      if (p.x < -100) { p.x = -100; p.vx = 0; }

      // Pré-computa potholes — buracos editáveis que "anulam" o chão dentro de seu range X
      const potholes = platforms.filter(pl => pl.type === 'pothole');
      const playerCenterX = p.x + p.w / 2;
      // Bug fix: se o jogador está encostado numa parede climbable (e.g. x:6500 tem pothole
      // no mesmo X), a resolução de parede empurra o jogador para dentro do pothole e ele
      // cai. Verifica contato com paredes climbable ANTES do loop de colisão para que o
      // fall-through do pothole seja desativado nesses casos.
      const _playerH = (p.isRolling || p.forcedCrouch) ? PLAYER_ROLL_H : PLAYER_H;
      const touchingClimbableWall = platforms.some(plat => {
        if (plat.type !== 'wall' || !plat.climbable) return false;
        return getPlatformCollisionRects(plat).some(hit =>
          rectOverlap(p.x, p.y, p.w, _playerH, hit.x, hit.y, hit.w, hit.h)
        );
      });
      const insidePothole = !touchingClimbableWall &&
        potholes.some(ph => playerCenterX > ph.x && playerCenterX < ph.x + ph.w);

      // Durante a subida, História e Corrida com drone devem tocar primeiro a
      // caixa GY-275 da pilha x:12505. Ao descer, e na Corrida sem drone,
      // preservamos a ordem normal das plataformas.
      const collisionPlatforms =
        prioritizeUpperJunkyardBox && p.vy < 0
          ? orderJunkyardUpperBoxFirst(platforms)
          : platforms;
      for (const plat of collisionPlatforms) {
        if (plat.type === 'tireHideout' && !plat.cushionOnLand) continue;
        if (plat.type === 'pothole') continue; // pothole não tem colisão sólida
        // Se o jogador está sobre um pothole, ignora colisão de chão para deixar cair
        if (plat.type === 'ground' && insidePothole) continue;
        // Durante a fase aérea do kong vault, ignora colisão com o objeto do vault
        // para o personagem passar por cima livremente sem ter o vx zerado
        if (plat.vaultTrigger && p.kongVaultPhase === 'air') continue;
        const climbableBoxWall = getStackedBoxWall(platforms, plat);
        for (const hit of getPlatformCollisionRects(plat)) {
          resolvePlayerPlatform(p, plat, hit, climbableBoxWall);
        }
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
  if (p.touchingLadder && keys.up && !p.isClimbing && !p.isWallRunning && !p.isWallClimbUp && !p.wallNoHang) {
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
  const directBoxClimbAllowed = allowBoxClimb && (!p.wallRunOnBox || p.wallRunBoxClimbAllowed);
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
    // Altura relativa à plataforma de origem do pulo — no modo Corrida sem
    // drone, a pilha inteira pode ser escalada.
    (directBoxClimbAllowed ||
      ((p.jumpOriginGroundY - p.wallTopY) > MIN_BOX_CLIMB_HEIGHT &&
       (p.jumpOriginGroundY - p.wallTopY) <= MAX_BOX_CLIMB_HEIGHT)) &&
    (keys.up || keys.space) &&
    (directBoxClimbAllowed ||
      ((p.wallSide === 'right' && (keys.right || incomingVx > 0)) ||
       (p.wallSide === 'left' && (keys.left || incomingVx < 0)))) &&
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
    !p.wallRunOnBox &&   // wall-run banido em caixas — sem sprite de corrida vertical
    !p.onTictacWall      // placa/tic-tac: sem wall run, apenas slide
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

  // ── Tic-tac wall jump (pós-colisão — onTictacWall já reflete o frame atual) ──
  if (!keys.space) p.tictacJumpConsumed = false;
  if (
    p.onTictacWall && p.touchingWall && keys.space &&
    !p.tictacJumpConsumed && !p.isWallRunning && !p.isWallClimbUp && !p.isClimbing &&
    (p.state as string) !== 'hurt' && (p.state as string) !== 'dead'
  ) {
    p.tictacJumpConsumed = true;
    p.onGround = false;
    p.coyoteTime = 0;
    const wallSide = p.wallSide ?? previousWallSide;
    const intoWall =
      (wallSide === 'right' && keys.right) ||
      (wallSide === 'left'  && keys.left);
    if (intoWall) {
      // Tic-tac: pressiona INTO a parede → salta para trás com boa altura
      p.vx = wallSide === 'right' ? -8 : 8;
      p.vy = -13;
      p.facingRight = wallSide !== 'right';
    } else {
      // Mortal: tecla para trás ou neutro → mortal com baixa velocidade horizontal
      p.vx = wallSide === 'right' ? 2.5 : -2.5;
      p.vy = WALLFLIP_JUMP_VY;
      p.facingRight = wallSide === 'right';
    }
    p.isWallFlipping = true;
    p.wallFlipTimer = WALLFLIP_DURATION;
    p.state = 'wallflip';
    p.animFrame = 0;
    p.animTimer = 0;
    for (let i = 0; i < 10; i++) {
      spawnParticle(
        p.x + (wallSide === 'right' ? p.w : 0),
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

  if (keys.down && p.onGround && !p.isRolling && !p.isClimbing && !p.isDivejumping && p.state !== 'hurt') {
    if ((keys.left || keys.right || Math.abs(p.vx) > 3) && Math.abs(p.vx) > 1) {
      p.y += PLAYER_H - PLAYER_ROLL_H; // ajusta y para manter os pés no chão imediatamente
      p.isRolling = true;
      p.autoRoll = true;
      p.diveLandingRoll = false;
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

  // Queda letal — queda de ≥800 px mata instantaneamente (ex.: do telhado GY-844 ao chão)
  // Verifica ANTES de resetar fallApexY para usar o pico acumulado durante o voo.
  // Dive jump é isento: o rolamento de pouso do mergulho absorve o impacto por design.
  const LETHAL_FALL_HEIGHT = 800;
  if (!prevOnGround && p.onGround && (p.state as string) !== 'dead' && !p.isDivejumping) {
    const fallDist = p.y - p.fallApexY;
    if (fallDist >= LETHAL_FALL_HEIGHT) {
      p.health = 0;
      p.state = 'dead';
      p.killedByFall = true;
    }
  }
  // Rastreia o ponto mais alto atingido no ar (menor y = mais alto no canvas)
  if (p.onGround) {
    p.fallApexY = p.y; // reseta ao tocar o chão
  } else {
    p.fallApexY = Math.min(p.fallApexY, p.y); // acumula o pico durante o voo
  }

  // Fall off screen -> die
  if (p.y > CANVAS_H + 100) {
    p.health = 0;
    p.state = 'dead';
    p.killedByFall = true;
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

    if (p.kongVaultLanding && p.state !== 'hurt') {
      // Pouso do Kong Vault — sempre força o mesmo rolamento de uma grande queda
      p.kongVaultPhase = null;
      p.kongVaultLanding = false;
      p.isRolling = true;
      p.autoRoll = true;
      p.diveLandingRoll = false;
      p.rollTimer = LANDING_ROLL_DURATION;
      p.landingRollFrame = 0;
      p.state = 'roll';
      for (let i = 0; i < 14; i++) {
        spawnParticle(p.x + p.w / 2, p.y + PLAYER_ROLL_H, i % 2 === 0 ? '#808090' : '#c9a24a');
      }
    } else if (p.isWallFlipping && p.state !== 'hurt') {
      p.isWallFlipping = false;
      p.wallFlipTimer = 0;
      // Auto-roll on landing from wall climb + jump
      p.isRolling = true;
      p.autoRoll = true;
      p.diveLandingRoll = false;
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
      p.diveLandingRoll = false;
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
      p.diveLandingRoll = true; // rolamento de pouso do mergulho — deve completar antes de mergulhar de novo
      // Se o pulo estiver pressionado neste momento (jogador segurou desde o mergulho), trava
      // o pulo até ele soltar e apertar de novo — evita pular em sequência após o rolamento.
      if (keys.space) p.postDiveJumpLocked = true;
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
      p.diveLandingRoll = false;
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
  platforms: Platform[] = [],
  customOffsetX?: number,
  customOffsetY?: number,
  targetOverride?: Player,
): number {
  let shakeAmount = 0;
  // Race mode passes the runner currently in front. Keeping the rest of the
  // drone algorithm unchanged preserves the story-mode behavior exactly.
  player = targetOverride ?? player;

  const offsetX = customOffsetX ?? DRONE_TARGET_OFFSET_X;
  const offsetYBase = customOffsetY ?? DRONE_TARGET_OFFSET_Y;

  // Target position: behind and above player
  // Quando o jogador escala (escada/parede), o drone fica AO LADO, na mesma altura,
  // pra atirar lateralmente — escadas estreitas não dão espaço pra desviar de tiros
  // vindos de cima.
  const verticalOffset = player.isClimbing ? -30 : offsetYBase;
  const targetX = player.x + offsetX + Math.sin(Date.now() * 0.0007) * 30;
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

  // Quando o jogador está em telhado muito alto (y < -100), o drone ignora
  // pathfinding e vai direto ao alvo — pathfinding não lida bem com Y muito negativo.
  const playerVeryHigh = !playerNearFireEscape && player.y < -100;

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

  // Telhado alto: ignora waypoint calculado, vai direto ao jogador
  if (playerVeryHigh) {
    tx = targetX;
    ty = targetY;
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
    // Inclui playerVeryHigh: usa física normal com inércia para manter
    // o delay natural de perseguição, mesmo em telhados muito altos.
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
    : playerVeryHigh
      ? player.y - 100 // telhado alto: drone rastreia Horácio na vertical
      : isOverflying
        ? -(DRONE_H + 10)
        : (player.isClimbing ? climbingCeiling : 30);
  if (drone.y < dronMinY) { drone.y = dronMinY; if (!isOverflying && !player.isClimbing && !playerNearFireEscape && !playerVeryHigh) drone.vy = Math.abs(drone.vy); }
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

function spawnCarSparks(particles: Particle[], x: number, y: number): void {
  const colors = ['#fff2a8', '#ffd23f', '#ff9d1f', '#ffffff', '#ffb347'];
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 200 + Math.random() * 260,
      maxLife: 460,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.5 + Math.random() * 2.5,
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

export function spawnRollingTiresFromHideout(
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
  onBystanderHit: (bx: number, by: number, vol: number) => void,
  onTireHit?: (vol: number) => void,
  onBoxHit?: (vol: number) => void,
  onObstacleHit?: (vol: number) => void,
  spatialGrid?: SpatialGrid | null,
  platformIndexMap?: Map<Platform, number> | null,
  onCarHit?: (vol: number) => void,
  additionalPlayers: Player[] = [],
): Bullet[] {
  const ph = player.isRolling ? PLAYER_ROLL_H : PLAYER_H;
  const surviving: Bullet[] = [];
  // Build O(1) lookup sets for destroyed indices — avoids O(n) .includes() per platform
  const destroyedBoxSet = new Set(destroyedBoxIndices);
  const destroyedTireSet = new Set(destroyedTireIndices);

  for (const b of bullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.vy += 0.1;
    b.age += dt;

    // Out of bounds
    if (b.age > 3000 || b.y > CANVAS_H + 50 || b.x < -500) continue;

    // Hit platform — query only nearby platforms via spatial grid (huge perf win for large levels)
    const BULLET_MARGIN = 200;
    const nearbyPlats = spatialGrid
      ? queryGrid(spatialGrid, b.x - BULLET_MARGIN, b.x + BULLET_MARGIN)
      : platforms;

    let hitPlatform = false;
    for (const plat of nearbyPlats) {
      // Look up original index — needed for destruction tracking
      const pi = platformIndexMap ? (platformIndexMap.get(plat) ?? -1) : platforms.indexOf(plat);
      if (pi === -1) continue;
      if (plat.type === 'box'  && destroyedBoxSet.has(pi)) continue;
      if ((plat.type === 'tire' || plat.type === 'tireHideout') && destroyedTireSet.has(pi)) continue;
      // Tiros do drone atravessam plataformas finas (grades das escadas) e a própria escada
      if (plat.type === 'platform') continue;
      if (plat.isLadder) continue;
      if (getPlatformCollisionRects(plat).some((hit) => rectOverlap(b.x - 4, b.y - 4, 8, 8, hit.x, hit.y, hit.w, hit.h))) {
        if (plat.type === 'box') {
          destroyedBoxIndices.push(pi);
          spawnBoxShatter(particles, plat);
          triggerBoxFall(pi, platforms, fallingBoxes, destroyedBoxIndices, destroyedTireIndices);
          onBoxHit?.(plat.sfxVolume ?? 1);
        } else if (plat.type === 'tire') {
          destroyedTireIndices.push(pi);
          const numTires = Math.max(1, Math.round(plat.h / plat.w));
          for (let ti = 0; ti < numTires; ti++) {
            spawnFlyingTireFromStack(plat, ti, numTires, b.vx, flyingTires);
          }
          onTireHit?.(plat.sfxVolume ?? 1);
        } else if (plat.type === 'tireHideout') {
          destroyedTireIndices.push(pi);
          spawnRollingTiresFromHideout(plat, b.vx, flyingTires);
          // Pneus empilhados acima também caem (mesma física da caixa)
          triggerBoxFall(pi, platforms, fallingBoxes, destroyedBoxIndices, destroyedTireIndices);
          onTireHit?.(plat.sfxVolume ?? 1);
        } else if (plat.type === 'obstacle') {
          onObstacleHit?.(plat.sfxVolume ?? 1);
        } else if (
          plat.type === 'car' ||
          (plat.type === 'sprite' && plat.customSpriteName === 'carro_abandonado_pixelart_1776652992846.png')
        ) {
          spawnCarSparks(particles, b.x, b.y);
          onCarHit?.(plat.sfxVolume ?? 1);
        }
        hitPlatform = true;
        break;
      }
    }
    if (hitPlatform) continue;

    // Hit any active runner. The first target is the regular player; race mode
    // can pass the rival as an additional target without duplicating bullet logic.
    const bulletTargets = [player, ...additionalPlayers];
    let hitRunner = false;
    for (const target of bulletTargets) {
      const targetH = target.isRolling ? PLAYER_ROLL_H : PLAYER_H;
      if (!target.invincible && !target.sideFlipImmune && target.state !== 'dead' &&
          rectOverlap(b.x - 4, b.y - 4, 8, 8, target.x, target.y, target.w, targetH)) {
        target.health--;
        target.invincible = true;
        target.invincibleTimer = HIT_INVINCIBILITY;
        target.hurtStunTimer = HIT_STUN_DURATION;
        target.vx = 0;
        target.isRolling = false;
        target.autoRoll = false;
        target.state = 'hurt';
        if (target.health <= 0) target.state = 'dead';
        onHit();
        hitRunner = true;
        break;
      }
    }
    if (hitRunner) {
      continue;
    }

    // Hit bystander — hitbox ajustada ao corpo visual do NPC
    const BYSTANDER_RUN_FRAME_INTERVAL = 140; // ms por frame (igual ao render.ts)
    let hitBystander = false;
    for (const by of bystanders) {
      // Somente o senhor negro (spriteId 3) pode ser atingido pelo drone.
      // Os demais NPCs da vila permanecem imunes aos tiros em todos os modos.
      if (by.spriteId !== 3) continue;
      if (by.state === 'dead') continue;
      if (rectOverlap(b.x - 4, b.y - 4, 8, 8, by.x + 8, by.y + 5, by.w + 4, by.h - 10)) {
        by.state = 'dead';
        by.vx = 0;
        by.deadTimer = 1400;
        onBystanderHit(by.x + 50, by.y + by.h / 2, by.sfxVolume ?? 1);
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
  dt: number,
  onFlee?: (spriteId: 1 | 2 | 3 | 4, vol: number) => void
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
      const droneDist  = Math.abs(drone.x - b.x);
      const playerDist = Math.abs(player.x - b.x);
      const playerTriggered = b.playerFleeDist !== undefined && playerDist < b.playerFleeDist;
      if (droneDist < DRONE_FLEE_DIST || playerTriggered) {
        const speed = b.fleeSpeed ?? FLEE_SPEED;
        b.state = 'flee';
        b.facingRight = b.fleeDir === 'right';
        b.vx = b.fleeDir === 'right' ? speed : -speed;
        b.animTimer = 0;
        onFlee?.(b.spriteId, b.sfxVolume ?? 1);
      }
    } else {
      b.x += b.vx;
      // Colisão com o muro da vila direito (x:29540) — faz o NPC voltar
      const VILLAGE_WALL_X = 29540;
      if (b.vx > 0 && b.x + b.w >= VILLAGE_WALL_X) {
        b.x = VILLAGE_WALL_X - b.w;
        b.vx = -b.vx;
        b.facingRight = false;
      }
      // Colisão com o muro da vila esquerdo (x:25909 w:20) — faz o NPC voltar
      const VILLAGE_WALL_LEFT_X = 25909 + 20; // borda direita do muro
      if (b.vx < 0 && b.x <= VILLAGE_WALL_LEFT_X) {
        b.x = VILLAGE_WALL_LEFT_X;
        b.vx = -b.vx;
        b.facingRight = true;
      }
      if (b.x > DESPAWN_RIGHT_X || b.x < DESPAWN_LEFT_X) {
        b.vx = 0;
      }
    }
  }
}

export function updateDogs(
  dogs: Dog[],
  player: Player,
  dt: number,
  onBite: (target: Player, vol: number) => void,
  onGrowl: (vol: number) => void,
  additionalPlayers: Player[] = [],
): void {
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

    // Growl periódico — mais frequente quando perseguindo
    dog.growlTimer = Math.max(0, dog.growlTimer - dt);
    if (dog.growlTimer <= 0) {
      onGrowl(dog.sfxVolume ?? 1);
      dog.growlTimer = dog.animState === 'idle'
        ? 3200 + Math.random() * 2000
        : 1000 + Math.random() * 800;
    }

    const dogCX = dog.x + dog.w / 2;
    const dogCY = dog.y + dog.h / 2;

    // Obstáculos verdes específicos — o cão não detecta um corredor enquanto
    // ele estiver protegido em cima deles.
    const SAFE_OBSTACLE_TOP_Y = GROUND_Y - 102;
    const SAFE_OBSTACLES_X: Array<[number, number]> = [
      [18972, 18972 + 239],
      [20648, 20648 + 239],
    ];
    const isInPatrolZone = (runner: Player): boolean =>
      runner.x + runner.w > dog.patrolLeft && runner.x < dog.patrolRight;
    const isOnSafeObstacle = (runner: Player): boolean => {
      const runnerBottom = runner.y + (runner.isRolling ? PLAYER_ROLL_H : PLAYER_H);
      return Math.abs(runnerBottom - SAFE_OBSTACLE_TOP_Y) < 4 &&
        SAFE_OBSTACLES_X.some(([x1, x2]) => runner.x + runner.w > x1 && runner.x < x2);
    };
    const isAlive = (runner: Player): boolean => runner.state !== 'dead';
    const runners = [player, ...additionalPlayers];
    const homeX = dog.homeX ?? dog.x;
    const findDetectableRunner = (): Player | null => runners
      .filter(runner => isAlive(runner) && isInPatrolZone(runner))
      .map(runner => ({
        runner,
        distance: Math.abs((runner.x + runner.w / 2) - dogCX),
      }))
      .filter(entry => entry.distance < DETECT_RANGE && !isOnSafeObstacle(entry.runner))
      .sort((a, b) => a.distance - b.distance)[0]?.runner ?? null;

    // O alvo fica preso ao primeiro corredor detectado. Quando ele sai da área,
    // o cão volta à origem antes de procurar o outro corredor.
    let target = dog.chaseTarget ?? null;
    if (target && (!isAlive(target) || !isInPatrolZone(target))) {
      dog.chaseTarget = null;
      dog.returningHome = true;
      target = null;
    }

    if (dog.returningHome) {
      // O retorno pode ser interrompido se o segundo corredor entrar no
      // campo de visão antes de o cachorro chegar em casa.
      const visibleRunner = findDetectableRunner();
      if (visibleRunner) {
        target = visibleRunner;
        dog.chaseTarget = visibleRunner;
        dog.returningHome = false;
      } else {
        const homeDistance = homeX - dog.x;
        if (Math.abs(homeDistance) <= RUN_SPEED) {
          dog.x = homeX;
          dog.vx = 0;
          dog.returningHome = false;
          dog.animState = 'idle';
          dog.animTimer = 0;
        } else {
          dog.vx = homeDistance > 0 ? RUN_SPEED : -RUN_SPEED;
          dog.facingRight = dog.vx > 0;
          dog.animState = 'run';
        }
      }
    }

    if (!dog.returningHome) {
      if (!target) {
        target = findDetectableRunner();
        dog.chaseTarget = target;
      }

      if (target && !isOnSafeObstacle(target)) {
        const targetCX = target.x + target.w / 2;
        const targetCY = target.y + (target.isRolling ? PLAYER_ROLL_H : PLAYER_H) / 2;
        const dx = targetCX - dogCX;
        const dy = targetCY - dogCY;
        const distX = Math.abs(dx);
        const distY = Math.abs(dy);

        dog.animState = 'run';
        dog.vx = dx > 0 ? CHASE_SPEED : -CHASE_SPEED;
        dog.facingRight = dx > 0;
      } else {
        dog.vx = 0;
        if (dog.animState !== 'idle') {
          dog.animState = 'idle';
          dog.animTimer = 0;
        }
      }
    }

    // Defesa de proximidade: qualquer corredor que encoste no cachorro pode
    // ser mordido, mesmo que o alvo principal esteja à frente.
    if (dog.biteTimer <= 0 && dog.biteCooldown <= 0) {
      const contactRunner = runners
        .filter(runner => isAlive(runner) && !isOnSafeObstacle(runner))
        .map(runner => {
          const runnerCX = runner.x + runner.w / 2;
          const runnerCY = runner.y + (runner.isRolling ? PLAYER_ROLL_H : PLAYER_H) / 2;
          return {
            runner,
            distX: Math.abs(runnerCX - dogCX),
            distY: Math.abs(runnerCY - dogCY),
          };
        })
        .filter(entry => entry.distX < BITE_RANGE_X && entry.distY < BITE_RANGE_Y)
        .sort((a, b) => a.distX - b.distX)[0];

      if (contactRunner) {
        const bitten = contactRunner.runner;
        dog.animState = 'bite';
        dog.biteTimer = BITE_DURATION;
        dog.biteCooldown = BITE_COOLDOWN;
        dog.vx = 0;

        if (!bitten.invincible && !bitten.sideFlipImmune && bitten.state !== 'dead') {
          bitten.health--;
          bitten.invincible = true;
          bitten.invincibleTimer = HIT_INVINCIBILITY;
          bitten.hurtStunTimer = HIT_STUN_DURATION;
          bitten.vx = 0;
          bitten.isRolling = false;
          bitten.autoRoll = false;
          bitten.state = 'hurt';
          if (bitten.health <= 0) bitten.state = 'dead';
          onBite(bitten, dog.sfxVolume ?? 1);
        }
      }
    }

    if (dog.biteTimer > 0) {
      dog.biteTimer = Math.max(0, dog.biteTimer - dt);
      dog.vx = 0;
      dog.animState = 'bite';
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

    // Em idle, olha para o alvo atual; sem alvo, olha para a direita.
    if (dog.animState === 'idle') {
      const lookTarget = dog.chaseTarget;
      dog.facingRight = lookTarget
        ? lookTarget.x + lookTarget.w / 2 >= dog.x + dog.w / 2
        : true;
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
