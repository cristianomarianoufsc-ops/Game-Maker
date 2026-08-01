import { useEffect, useRef, useCallback, useState } from 'react';
import { createGhostPlayer, stepGhostPlayer, isGhostDead, loadGhostRecording, isGhostReplayActive } from './ghostPlayer';
import type { GameState, Keys, Player, Drone, Platform, Bystander } from './types';
import spriteUrl from '/horacio_transparent.png';
import runSheetUrl from '/run_sheet_transparent.png';
import idleUrl from '/idle_transparent.png';
import rollSheetUrl from '/roll_sheet.png';
import jumpSheetUrl from '/jump_sheet.png';
import diveJumpSheetUrl from '/dive_jump_sheet.png';
import wallRunSheetUrl from '@assets/Wall_Run_1776005817769.png';
import mortalSheetUrl from '@assets/mortal_1776009939272.png';
import subidaSheetUrl from '@assets/subida_1776012458574.png';
import sideFlipSheetUrl from '@assets/SIDE_FLIP_1776053462942.png';
import ladderClimbUrl from '@assets/image_1776998047300.png';
import ladderDescendUrl from '@assets/image_1776998292447.png';
import fireEscapeFloorUrl from '@assets/image_1776998525637.png';
import dogGrowlUrl from '@assets/GRUNIDO_1782588705391.mp3';
import dogSheetUrl from '@assets/DOG_1776795245228.png';
import dogIdleUrl from '@assets/image_1776737992484.png';
import bystander1Url from '@assets/1b_1777223906240.png';
import bystander2Url from '@assets/2b_1777223906243.png';
import bystander3Url from '@assets/image_1778075246986.png';
import bystander4Url from '@assets/mulher_1778075255529.png';
import npcHitUrl from '@assets/image_1778079852355.png';
import standingTireUrl from '@assets/pneu_1776643651883.png';
import rollingTireUrl from '@assets/pneu2_1776643651884.png';
import kongVaultStartUrl from '@assets/kong_vault_start_nobg.png';
import kongVaultAirUrl from '@assets/kong_vault_air_nobg.png';
import brickTextureUrl from '/brick_texture.png';
import balconyUrl from '/balcony.png';
import {
  CANVAS_W, CANVAS_H, GROUND_Y, PLAYER_W, PLAYER_H, DRONE_W, DRONE_H,
  PLAYER_MAX_HEALTH, SHOOT_COOLDOWN, BULLET_SPEED, CAMERA_LEAD_X, COLORS,
  DIVE_ENERGY_MAX, PLAYER_SPEED,
} from './constants';
import { generateLevel, generateBuildings, generateWallTestLevel, generateTrainingLevel, markRaceStoryPhysicsBoxes } from './level';
import {
  updatePlayer, updateDrone, updateBullets, updateParticles, spawnParticleHelper,
  updateFallingBoxes, updateFlyingTires, updateDogs, updateBystanders,
  spawnRollingTiresFromHideout,
} from './physics';
import {
  initAudio, playShot, playHit, playJump, playDoubleJump,
  playLand, playDeath, playCheckpoint, playDogBite, playVictory, playPlim, playBrilho, preloadBrilho,
  playNpcScream, playRealScream, preloadScreams, playBystanderScream, preloadBystanderScreams,
  playTireHit, preloadTireHit,
  playBoxHit, preloadBoxHit,
  playCarHit, preloadCarHit,
  startBeat, stopBeat, preloadBeat, startBeatMP3Forced, playPlayerStep, playMetalHit, preloadMetalHit,
  setMusicType, getMusicType,
  setMusicVolume, getMusicVolume, duckMusic, loadGameSettingsFromServer, persistSfxCategoryVolumes, persistNpcVolumes,
  playCrowdPanic, stopCrowdPanic,
  initDogAmbient, updateDogAmbient, silenceDogAmbient, stopDogAmbient,
  playGritoBuraco, preloadGritoBuraco,
} from './audio';
import {
  drawSky, drawBuildings, drawAlleyDetails, drawJunkyardBackdrop, drawFireEscapeBuilding, drawFireEscapeFloors, drawGround, drawRiver, drawPotholes, drawShantyVillage, drawStaircase, drawStaircaseBuildingWall, drawHouseAfterStaircase, drawBlockingWall,
  drawStreetBuildings, drawPlatforms, drawFlyingTires, drawTireHideouts,
  drawStartingBackWall, drawPlayer, drawDrone, drawBullets, drawParticles,
  drawHUD, drawControls, drawMenuScreen, drawGameOverScreen, drawPauseScreen, getMenuHitAreas,
  drawEditorUI, getMusicVolumeSliderRect, getSfxCategoryVolumeSliderRect, drawDogs, drawBystanders, drawVictoryScreen, drawRaceDefeatScreen, drawEndingBuilding,
  drawOptionsScreen, drawTrainingRoom, drawPlayerPoseEditorHandles, drawHoracioSpriteInfo, drawBystanderInfo, getBystanderPanelLayout,
  getHoracioVolumePanelLayout, drawHoracioVolumePanel,
  computeKongVaultGeom,
  type PlayerPoseKey, type PoseDisplayOverrides, type PlayerRenderGeom, PLAYER_POSE_LABELS,
} from './render';
import { buildSpatialGrid, queryGrid, type SpatialGrid } from './spatialGrid';
import {
  addPlatformCollisionBox,
  removePlatformCollisionBox,
  clampPlatformCollisionOverrides,
  ensurePlatformCollisionBox,
  ensurePlatformCollisionBoxes,
  getPlatformCollisionRect,
  getPlatformCollisionBoxes,
  getPlatformCollisionRects,
  getPlatformCollisionMaxBottom,
  getPlatformCollisionSummary,
  getPlatformGroundClampOffset,
  hasCustomPlatformCollision,
} from './collision';

function makePlayer(): Player {
  return {
    x: 100,
    y: GROUND_Y - PLAYER_H,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    state: 'idle',
    facingRight: true,
    onGround: false,
    touchingWall: false,
    touchingLadder: false,
    ladderCenterX: 0,
    wallX: 0,
    wallTopY: GROUND_Y,
    wallSide: null,
    health: PLAYER_MAX_HEALTH,
    maxHealth: PLAYER_MAX_HEALTH,
    invincible: false,
    invincibleTimer: 0,
    hurtStunTimer: 0,
    rollTimer: 0,
    isRolling: false,
    isClimbing: false,
    animFrame: 0,
    animTimer: 0,
    distanceTraveled: 0,
    coyoteTime: 0,
    peakFallVy: 0,
    fallApexY: 0,
    autoRoll: false,
    diveLandingRoll: false,
    postDiveJumpLocked: false,
    diveEnergy: DIVE_ENERGY_MAX,
    landingRollFrame: 0,
    jumpOriginGroundY: 0,
    landingCrouch: false,
    landingCrouchTimer: 0,
    isCrouching: false,
    forcedCrouch: false,
    isDivejumping: false,
    isWallRunning: false,
    wallRunTimer: 0,
    wallRunOnBox: false,
    wallRunBoxStackCount: 0,
    wallRunBoxStackHeight: 0,
    wallRunBoxClimbAllowed: true,
    isWallFlipping: false,
    wallFlipTimer: 0,
    isWallClimbUp: false,
    wallClimbTimer: 0,
    wallClimbAdjustedDuration: 720,
    wallClimbLiftAmount: 86,
    wallClimbJumpPenalty: 1.0,
    wallClimbStartX: 0,
    wallClimbStartY: 0,
    wallClimbTargetX: 0,
    wallClimbTargetY: 0,
    wallClimbSide: null,
    isWallHanging: false,
    wallHangJumpConsumed: false,
    wallHangQuickJump: false,
    wallLowImpulse: false,
    jumpedFromWall: false,
    wallNoClimbOver: false,
    wallNoHang: false,
    onTictacWall: false,
    tictacJumpConsumed: false,
    jumpCount: 0,
    doubleJumpReady: false,
    isSideFlipping: false,
    sideFlipTimer: 0,
    sideFlipImmune: false,
    killedByFall: false,
    kongVaultPhase: null,
    kongVaultTimer: 0,
    kongVaultLanding: false,
    kongVaultIsObstacle: false,
    kongVaultFromDive:   false,
  };
}

function makeInitialBystanders(): Bystander[] {
  return [
    {
      x: 25970,
      y: GROUND_Y - 140,
      w: 60,
      h: 140,
      vx: 0,
      facingRight: true,
      state: 'sit' as const,
      spriteId: 1 as const,
      animTimer: 0,
      triggerX: 25960,
      fleeDir: 'right' as const,
      fleeSpeed: 4.8,
      deadTimer: 0,
    },
    {
      // Barbudo da direita: virado para a esquerda no frame sentado
      // (parece estar conversando com o NPC à esquerda)
      x: 26090,
      y: GROUND_Y - 140,
      w: 60,
      h: 140,
      vx: 0,
      facingRight: false,
      state: 'sit' as const,
      spriteId: 2 as const,
      animTimer: 0,
      triggerX: 25960,
      fleeDir: 'right' as const,
      fleeSpeed: 3.4,
      deadTimer: 0,
      useHitSprite: true,
    },
    {
      // Senhor mais velho — mais à frente (corre menos, começa na frente)
      x: 28000,
      y: GROUND_Y - 140,
      w: 60,
      h: 140,
      vx: 0,
      facingRight: true,
      state: 'sit' as const,
      spriteId: 3 as const,
      animTimer: 0,
      triggerX: 28000,
      fleeDir: 'right' as const,
      fleeSpeed: 2.8,
      deadTimer: 0,
      deathFrame: 2,
      playerFleeDist: 1100,
    },
    {
      // Mulher jovem — atrás do senhor (corre mais, mas não alcança Horácio)
      x: 27400,
      y: GROUND_Y - 140,
      w: 60,
      h: 140,
      vx: 0,
      facingRight: true,
      state: 'sit' as const,
      spriteId: 4 as const,
      animTimer: 0,
      triggerX: 27400,
      fleeDir: 'right' as const,
      fleeSpeed: 4.5,
      deadTimer: 0,
      deathFrame: 2,
      playerFleeDist: 1100,
    },
  ];
}

function makeDrone(): Drone {
  return {
    x: -80,
    y: GROUND_Y - 200,
    vx: 0,
    vy: 0,
    w: DRONE_W,
    h: DRONE_H,
    shootTimer: SHOOT_COOLDOWN * 1.5,
    propAngle: 0,
    wobble: 0,
    wobbleDir: 1,
    stuckTimer: 0,
    stuckLastX: -80,
    lastFireSide: 0,
    aimTimer: 0,
  };
}

const CONTROLS_H = 68; // px reserved below canvas for mobile buttons
const EDITOR_DELETED_PLATFORMS_STORAGE_KEY = 'pursuit-deleted-platforms-v1';
const EDITOR_CUSTOM_SPRITES_STORAGE_KEY = 'pursuit-custom-sprites-v1';

function getPlatformKey(platform: Platform): string {
  return `${platform.type}:${platform.x}:${platform.y}:${platform.w}:${platform.h}:${Math.round(platform.rotation ?? 0)}`;
}

// These junkyard boxes are part of the permanent level layout. Older editor
// sessions may have stored deletion keys for their former positions; those
// stale local entries must not hide the restored source-level boxes.
function isPermanentJunkyardBox(platform: Platform): boolean {
  return platform.type === 'box' &&
    platform.x >= 12400 &&
    platform.x <= 12650 &&
    platform.w === 65 &&
    platform.h === 55;
}

function isEditorPointInsidePlatform(wx: number, wy: number, platform: Platform): boolean {
  // True balconies (sacadas) draw a 72px window above plat.y — include that in the hit area
  const isSacada = platform.type === 'platform' && platform.y <= GROUND_Y - 70 && platform.h > 20;
  const topY = isSacada ? platform.y - 72 : platform.y;
  return wx >= platform.x && wx <= platform.x + platform.w && wy >= topY && wy <= platform.y + platform.h;
}

function isEditorPointInsideCollision(wx: number, wy: number, platform: Platform): boolean {
  return getPlatformCollisionRects(platform).some((hit) =>
    wx >= hit.x && wx <= hit.x + hit.w && wy >= hit.y && wy <= hit.y + hit.h
  );
}

function loadDeletedPlatformKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(EDITOR_DELETED_PLATFORMS_STORAGE_KEY);
    const keys = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDeletedPlatformKeys(keys: Set<string>): void {
  window.localStorage.setItem(EDITOR_DELETED_PLATFORMS_STORAGE_KEY, JSON.stringify([...keys]));
}

function applyDeletedPlatformKeys(platforms: Platform[], keys: Set<string>): Platform[] {
  return platforms.filter((platform) =>
    platform.type === 'ground' ||
    isPermanentJunkyardBox(platform) ||
    !keys.has(getPlatformKey(platform))
  );
}

function loadCustomSpritePlatforms(): Platform[] {
  try {
    const raw = window.localStorage.getItem(EDITOR_CUSTOM_SPRITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((platform): platform is Platform =>
      platform &&
      platform.type === 'sprite' &&
      typeof platform.x === 'number' &&
      typeof platform.y === 'number' &&
      typeof platform.w === 'number' &&
      typeof platform.h === 'number' &&
      typeof platform.customSpriteName === 'string' &&
      typeof platform.customSpriteDataUrl === 'string'
    );
  } catch {
    return [];
  }
}

/** Returns a warning message if the storage quota was exceeded, null otherwise. */
function saveCustomSpritePlatforms(platforms: Platform[]): string | null {
  const customSprites = platforms.filter((platform) => platform.type === 'sprite');
  try {
    window.localStorage.setItem(EDITOR_CUSTOM_SPRITES_STORAGE_KEY, JSON.stringify(customSprites));
    return null;
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      // Fallback: salvar somente sprites já enviados ao servidor (URLs pequenas, sem base64)
      const serverSprites = customSprites.filter(
        (p) => typeof p.customSpriteDataUrl === 'string' && p.customSpriteDataUrl.startsWith('/sprites/')
      );
      try {
        window.localStorage.setItem(EDITOR_CUSTOM_SPRITES_STORAGE_KEY, JSON.stringify(serverSprites));
      } catch {
        // Nem mesmo sprites do servidor cabem — limpa a chave para não corromper
        try { window.localStorage.removeItem(EDITOR_CUSTOM_SPRITES_STORAGE_KEY); } catch { /* noop */ }
      }
      const dropped = customSprites.length - serverSprites.length;
      const msg = `⚠️ ARMAZENAMENTO CHEIO — ${dropped} sprite(s) local(is) não foram salvos. Use 📁 GALERIA para persistir no servidor.`;
      console.warn('[pursuit] localStorage quota exceeded:', msg);
      return msg;
    }
    return null;
  }
}

// Remove white/near-white background from a sprite sheet exported without transparency.
// Uses perceptual brightness so anti-aliased edges fade out smoothly instead of leaving a white fringe.
function stripWhiteBackground(src: HTMLImageElement, erodeEdge = false, removeGlobalWhite = false, erodeStrength = 0.75): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width  = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  const W = canvas.width;
  const H = canvas.height;

  // Decide se um pixel pertence ao fundo branco externo
  const isBg = (i: number): boolean => {
    const a = px[i + 3];
    if (a < 10) return true; // já transparente
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const brightness  = r * 0.299 + g * 0.587 + b * 0.114;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation  = maxC > 0 ? (maxC - minC) / maxC : 0;
    return brightness > 200 && saturation < 0.18;
  };

  // BFS flood-fill a partir de todas as bordas para encontrar fundo externo
  const visited = new Uint8Array(W * H);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const pos = y * W + x;
    if (visited[pos]) return;
    if (!isBg(pos * 4)) return;
    visited[pos] = 1;
    queue.push(pos);
  };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }

  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    const y   = Math.floor(pos / W);
    const x   = pos % W;
    const neighbors = [
      y > 0     ? pos - W : -1,
      y < H - 1 ? pos + W : -1,
      x > 0     ? pos - 1 : -1,
      x < W - 1 ? pos + 1 : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || visited[n]) continue;
      if (isBg(n * 4)) { visited[n] = 1; queue.push(n); }
    }
  }

  // Apaga somente os pixels do fundo externo (visitados), com fade suave nas bordas
  for (let pos = 0; pos < W * H; pos++) {
    if (!visited[pos]) continue;
    const i = pos * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const t = Math.min(1, Math.max(0, (brightness - 160) / 80));
    px[i + 3] = Math.round((1 - t) * px[i + 3]);
  }

  // Erosão suave de 1px: reduz levemente o alpha de pixels claros na borda do personagem
  if (erodeEdge) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pos = y * W + x;
        if (visited[pos]) continue; // já é fundo
        const ns = [
          y > 0     ? pos - W : -1,
          y < H - 1 ? pos + W : -1,
          x > 0     ? pos - 1 : -1,
          x < W - 1 ? pos + 1 : -1,
        ];
        if (!ns.some(n => n >= 0 && visited[n])) continue; // não está na borda
        const i = pos * 4;
        const brightness = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        if (brightness > 150) {
          const fade = Math.min(1, (brightness - 150) / 70);
          px[i + 3] = Math.round(px[i + 3] * (1 - fade * erodeStrength));
        }
      }
    }
  }

  // Remove global white: apaga pixels brancos enclausurados (ex: buraco central do pneu)
  // que o BFS não consegue alcançar por serem circundados pelo sprite
  if (removeGlobalWhite) {
    for (let pos = 0; pos < W * H; pos++) {
      if (visited[pos]) continue; // já removido pelo BFS
      const i = pos * 4;
      if (px[i + 3] < 10) continue; // já transparente
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const brightness = r * 0.299 + g * 0.587 + b * 0.114;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
      if (brightness > 200 && saturation < 0.18) {
        const t = Math.min(1, Math.max(0, (brightness - 160) / 80));
        px[i + 3] = Math.round((1 - t) * px[i + 3]);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

function stripBlackBackground(src: HTMLImageElement): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    if (brightness < 32) {
      px[i + 3] = Math.round((brightness / 32) * px[i + 3]);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

// Remove fundo escuro e dessaturado (cinza-escuro/preto) preservando cores saturadas (roupas azuis etc.)
function stripPureBlackExact(src: HTMLImageElement): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < 10 && px[i + 1] < 10 && px[i + 2] < 10) {
      px[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

function stripPureBlackBackground(src: HTMLImageElement): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    // Saturação: quão longe de cinza puro (0 = cinza, 1 = cor pura)
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    // Remove pixel se for escuro (brilho < 36) E pouco saturado (< 0.40)
    // Preserva pixels saturados (roupas azuis, pele, detalhes coloridos)
    if (brightness < 36 && saturation < 0.40) {
      px[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

function stripBlackAndWhiteBackground(src: HTMLImageElement): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    if (brightness < 32) {
      px[i + 3] = Math.round((brightness / 32) * px[i + 3]);
    } else if (brightness > 82 && saturation < 0.28) {
      const t = Math.min(1, (brightness - 82) / 138);
      px[i + 3] = Math.round((1 - t) * px[i + 3]);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

function stripEditorSpriteBackground(src: HTMLImageElement): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Se a imagem já tem transparência nas bordas/cantos, ela já tem fundo removido —
  // retorna direto sem processar para não danificar o sprite.
  const sampleCorners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const alreadyHasAlpha = sampleCorners.some(i => px[i + 3] < 200);

  // Conta quantos pixels totais já são transparentes
  let transparentCount = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 200) transparentCount++;
  }
  const totalPixels = w * h;
  const transparentRatio = transparentCount / totalPixels;

  // Se já tem transparência significativa (>2% dos pixels), usa como está
  if (alreadyHasAlpha || transparentRatio > 0.02) {
    const out = new Image();
    out.src = src.src;
    return out;
  }

  // Caso contrário, faz flood-fill das bordas para remover fundo sólido
  // Usa o pixel do canto superior-esquerdo como cor de referência do fundo
  const bgR = px[0], bgG = px[1], bgB = px[2];
  const isBg = (idx: number) => {
    const dr = Math.abs(px[idx] - bgR);
    const dg = Math.abs(px[idx + 1] - bgG);
    const db = Math.abs(px[idx + 2] - bgB);
    return dr + dg + db < 60;
  };
  const queue: number[] = [];
  const seen = new Uint8Array(w * h);
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    const idx = p * 4;
    if (!isBg(idx)) return;
    seen[p] = 1;
    queue.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (queue.length) {
    const p = queue.pop()!;
    const idx = p * 4;
    px[idx + 3] = 0;
    const x = p % w;
    const y = Math.floor(p / w);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function getScale() {
  const scaleX = window.innerWidth / CANVAS_W;
  const reserve = isTouchDevice() ? 0 : CONTROLS_H;
  const scaleY = (window.innerHeight - reserve) / CANVAS_H;
  return Math.min(1, scaleX, scaleY);
}

// Cache de gradientes de poças do chão — keyed por worldX*10000+platY
// As poças são determinísticas (mesma posição = mesmo gradiente), nunca mudam
const _puddleGradCache = new Map<number, CanvasGradient>();

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Keys>({ left: false, right: false, up: false, down: false, space: false, shift: false, z: false, dive: false });
  const playerFlashTimerRef = useRef(0); // ms — flash verde no jogador (dive roll / side flip)
  const playerFlashCanvasRef = useRef<HTMLCanvasElement | null>(null); // offscreen para flash corpo inteiro
  const playerDiveFlashPlayedRef = useRef(false); // flag one-shot: evita re-disparo do dive roll enquanto isDivejumping continua true
  const diveCompletedRef     = useRef(false);      // dive roll concluído na sala de treino — exibe ✓ permanente
  const sideFlipCompletedRef = useRef(false);      // side flip concluído na sala de treino — exibe ✓ permanente
  const wallRunWasActiveRef = useRef(false);       // true enquanto/após wall run no muro de treino — dispara flash ao entrar em jump/fall
  const ticTacPhase1Ref    = useRef(false);        // true após tocar parede 1 do tic-tac — espera saída em wallflip da parede 2
  const pitFallSoundPlayedRef = useRef(false);
  const spaceJustPressed = useRef(false);
  const enterJustPressed = useRef(false);
  const escJustPressed = useRef(false);
  const pauseSelection = useRef(0); // 0 = continuar, 1 = menu inicial
  const pauseDownJustPressed = useRef(false);
  const pauseUpJustPressed = useRef(false);
  const raceLeftJustPressed = useRef(false);
  const raceRightJustPressed = useRef(false);
  const lastJumpPressTime = useRef(0);
  const lastDownPressTime = useRef(0);
  const DIVE_COMBO_WINDOW = 420;
  const editorJustPressed = useRef(false);
  const editorSpawnJustPressed = useRef(false);
  const editorDeleteBoxJustPressed = useRef(false);
  const zJustPressed = useRef(false);
  const gJustPressed = useRef(false);
  const rJustPressed = useRef(false);
  const isRecordingRef = useRef(false);
  const playerRecordingBufferRef = useRef<Keys[]>([]);
  const playerRecordingStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const ghostReplayFramesRef = useRef<Keys[] | null>(null);
  const ghostPlayerRef = useRef<Player | null>(null);
  const ghostEnabledRef = useRef(false);
  const racePlayerRef = useRef<Player | null>(null);
  const raceRoundWinnerRef = useRef<'player' | 'rival' | null>(null);
  const raceRoundLoserXRef = useRef(80);
  const raceInterRoundTransitionRef = useRef(false);
  const raceCheckpointXRef = useRef(0);
  const raceReplayArmedRef = useRef(false);
  const raceTictacSnapDoneRef = useRef(false);
  const raceMenuOpenRef = useRef(false);
  const raceFocusRef = useRef(0);
  const raceDroneEnabledRef = useRef(true);
  const raceCheckpointsEnabledRef = useRef(false);
  const raceRoundTargetRef = useRef<1 | 2 | 3>(1);
  const ghostSpawnRef = useRef<{ x: number; y: number }>({ x: 100, y: 0 });
  const ghostTrailRef = useRef<{ x: number; y: number; d: string }[]>([]);
  const ghostLastDecisionRef = useRef<string>('IDLE');
  const ghostDeathMarkersRef = useRef<{ x: number; y: number }[]>([]);
  const ghostTrailTickRef = useRef(0);
  const ghostAutoReplayArmedRef = useRef(false);  // true = recording já foi auto-disparado nesta run
  const ghostAutoReplayDataRef  = useRef<Keys[] | null>(null); // frames pré-carregados para piloto automático (separado do ghostReplayFramesRef)
  const ghostAutoReplayStartXRef = useRef<number>(31100);   // startX da gravação — disparo preciso
  const ghostAutoReplayStartYRef = useRef<number>(360);     // startY da gravação — snap de posição
  // Detecção de "travado" (sem morrer) — captura trail p/ análise mesmo quando o
  // ghost fica preso contra um obstáculo em vez de cair e reiniciar. Sem isso,
  // travamentos intermitentes (ex: muro pós-escadaria x:31676) nunca geram dado
  // porque só salvávamos o trail na morte.
  const ghostStuckXRef = useRef(0);
  const ghostStuckTimeRef = useRef(0);
  const ghostStuckSavedRef = useRef(false);
  // Checkpoint próprio do ghost — atualizado quando ELE passa pelo trigger, não o jogador
  const ghostCheckpointXRef = useRef(0);
  const ghostCp1PassedRef = useRef(false); // passou x>21720
  const ghostCp2PassedRef = useRef(false); // passou x>30598
  // Snap determinístico do tic-tac: normaliza vx/vy/y/jumpCount do ghost
  // antes da parede noHang (x:36321) para o mesmo estado independente da distância ao jogador.
  const ghostTictacSnapDoneRef = useRef(false);
  const editorDroneEnabledRef = useRef(false);
  const editorTestModeRef = useRef(false);
  const optionsJustPressed = useRef(false);
  const showOptionsRef = useRef(false);
  const trainingJustPressed = useRef(false);
  const trainingPlatformsRef = useRef<Platform[]>(generateTrainingLevel());
  const musicTypeRef = useRef<'chiptune' | 'mp3'>(getMusicType());
  const musicVolumeRef = useRef<number>(getMusicVolume());
  const musicVolumeDragRef = useRef(false);
  const wasPausedRef = useRef(false);
  // Timer de passada do Horácio — inicia cheio para o 1º passo disparar imediatamente
  const playerStepTimerRef = useRef(650);
  const menuFocusRef = useRef<number>(0);
  const menuMutedRef = useRef<boolean>(localStorage.getItem('pursuit_menu_muted') === '1');
  const editorRealStoryModeRef = useRef(false);
  const editorRealStoryJustPressed = useRef(false);
  const editorCamXRef = useRef(0);
  const editorCamYRef = useRef(0);
  const editorLastSpawnXRef = useRef(0);
  const editorLastSpawnYRef = useRef(GROUND_Y - PLAYER_H);
  const editorMouseWorldRef = useRef({ x: 0, y: 0 });
  const editorMouseCanvasRef = useRef({ x: 0, y: 0 });
  const spriteUploadInputRef = useRef<HTMLInputElement>(null);
  const galleryServerNamesRef = useRef<Set<string>>(new Set());
  const galleryObjectTypesRef = useRef<Set<string>>(new Set());
  const galleryObjectsRef = useRef<Array<{ label: string; template: Platform }>>([]);
  const editorHoveredIdxRef = useRef(-1);
  const editorCopiedMsgRef = useRef<{ text: string; until: number } | null>(null);
  const saveSprites = (platforms: Platform[]) => {
    const warn = saveCustomSpritePlatforms(platforms);
    if (warn) editorCopiedMsgRef.current = { text: warn, until: Date.now() + 6000 };
  };
  const spatialGridRef = useRef<SpatialGrid | null>(null);
  const spatialGridSourceRef = useRef<Platform[] | null>(null);
  const platformIndexMapRef = useRef<Map<Platform, number> | null>(null);
  const droneSolidPlatsRef = useRef<Platform[]>([]);
  const playerHealthBeforeDeathRef = useRef<number>(PLAYER_MAX_HEALTH);
  const editorSelectedIdxRef = useRef(-1);
  const editorSelectedIndicesRef = useRef<Set<number>>(new Set());
  const editorMarqueeRef = useRef<{ startWX: number; startWY: number; endWX: number; endWY: number } | null>(null);
  const editorUndoStackRef = useRef<Platform[][]>([]);
  const editorRedoStackRef = useRef<Platform[][]>([]);
  const editorPendingHistoryRef = useRef<Platform[] | null>(null);
  const editorTestSnapshotRef = useRef<Platform[] | null>(null);
  const editorBaselineKeysRef = useRef<Set<string>>(new Set());
  const originalLevelPlatformsRef = useRef<Platform[]>([]);
  const platBaseKey = (p: { type: string; x: number; y: number; w: number; h: number; rotation?: number }) =>
    `${p.type}:${p.x}:${p.y}:${p.w}:${p.h}:${Math.round(p.rotation ?? 0)}`;
  const editorDirtyRef = useRef(false);
  const editorSaveStatusRef = useRef<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const editorSaveStatusUntilRef = useRef(0);
  const editorSaveStatusMessageRef = useRef('');
  const editorAutoSaveTimerRef = useRef<number | null>(null);
  const editorSavedSignatureRef = useRef<string>('');
  const editorLastDirtyCheckRef = useRef(0);
  const levelPatchLoadedRef = useRef(false);
  const editorCollisionModeRef = useRef(false);
  const editorCollisionBoxIdxRef = useRef(0);
  type EditorDrag = {
    mode: 'move' | 'resize-right' | 'resize-left' | 'resize-top' | 'resize-bottom' | 'resize-corner' | 'slope-left' | 'slope-right' | 'rotate';
    editingCollision: boolean;
    editingCrop: boolean;
    startWX: number; startWY: number;
    origX: number; origY: number; origW: number; origH: number;
    origCropLeft: number;
    origCropTop: number;
    origCropRight: number;
    origCropBottom: number;
    origCollisionOffsetX: number;
    origCollisionOffsetY: number;
    origCollisionW: number;
    origCollisionH: number;
    origCollisionBoxes: { x: number; y: number; w: number; h: number; slopeTop?: { left: number; right: number } }[];
    hadCustomCollision: boolean;
    origText: string;
    hasMoved: boolean;
    origGroupPositions: { idx: number; origX: number; origY: number }[];
    origSlopeLeft: number;
    origSlopeRight: number;
    origRotation: number;
    startAngle: number;
    rotationCenterX: number;
    rotationCenterY: number;
  };
  const editorDragRef = useRef<EditorDrag | null>(null);
  const sfxCategoryVolumesRef = useRef<Record<string, number>>(
    (() => {
      try {
        return {
          box:      (v => Number.isFinite(v) ? v : 1)(parseFloat(localStorage.getItem('pursuit_sfx_vol_box')      ?? '')),
          tire:     (v => Number.isFinite(v) ? v : 1)(parseFloat(localStorage.getItem('pursuit_sfx_vol_tire')     ?? '')),
          npc:      (v => Number.isFinite(v) ? v : 1)(parseFloat(localStorage.getItem('pursuit_sfx_vol_npc')      ?? '')),
          dog:      (v => Number.isFinite(v) ? v : 1)(parseFloat(localStorage.getItem('pursuit_sfx_vol_dog')      ?? '')),
          obstacle: (v => Number.isFinite(v) ? v : 0.5)(parseFloat(localStorage.getItem('pursuit_sfx_vol_obstacle') ?? '')),
          car:      (v => Number.isFinite(v) ? v : 1)(parseFloat(localStorage.getItem('pursuit_sfx_vol_car')      ?? '')),
        };
      } catch { return { box: 1, tire: 1, npc: 1, dog: 1, obstacle: 0.5, car: 1 }; }
    })()
  );
  const sfxCategoryVolumeDragRef = useRef<{ category: string; trackX: number; trackW: number } | null>(null);
  const npcVolumeDragRef = useRef<{ bystander: import('./types').Bystander; index: number; trackX: number; trackW: number; trackY: number } | null>(null);
  const horacioVolumeRef = useRef<number>(
    (() => {
      try {
        const raw = localStorage.getItem('pursuit_npc_volumes');
        if (!raw) return 1;
        const parsed = JSON.parse(raw) as Record<string, number>;
        return typeof parsed['-1'] === 'number' ? parsed['-1'] : 1;
      } catch { return 1; }
    })()
  );
  const horacioVolumeDragRef = useRef<{ trackX: number; trackW: number; trackY: number } | null>(null);
  // Volumes individuais por NPC (bystander), indexados pela posição fixa no
  // array inicial. Cache local em localStorage + fonte da verdade no servidor
  // (game-settings.json), aplicado sobre os bystanders sempre que são criados.
  const npcVolumesRef = useRef<Record<number, number>>(
    (() => {
      try {
        const raw = localStorage.getItem('pursuit_npc_volumes');
        return raw ? JSON.parse(raw) as Record<number, number> : {};
      } catch { return {}; }
    })()
  );
  const applyNpcVolumes = (list: import('./types').Bystander[]) => {
    for (const [idxStr, vol] of Object.entries(npcVolumesRef.current)) {
      const idx = Number(idxStr);
      if (list[idx] && typeof vol === 'number' && !isNaN(vol)) list[idx].sfxVolume = vol;
    }
    return list;
  };
  type AttachedSpriteDisplay = { dw: number | null; dh: number | null; flip: boolean; ox?: number; oy?: number };
  // Padrões permanentes no código-fonte — vão para o Git junto com o pull.
  const DEFAULT_ATTACHED_SPRITE_DISPLAYS: Record<PlayerPoseKey, AttachedSpriteDisplay> = {
    ladder: { dw: 113, dh: 138, flip: false, ox: 0, oy: 0 },
    kongVaultStart: { dw: 127, dh: 73, flip: true, ox: 38, oy: -94 },
    kongVaultAir: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    idle: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    run: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    jump: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    roll: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    crouch: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    divejump: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    wallrun: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    wallflip: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    wallclimb: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
    sideflip: { dw: null, dh: null, flip: false, ox: 0, oy: 0 },
  };
  // Não lê mais do localStorage — valores das poses são definidos pelo código
  // (DEFAULT_ATTACHED_SPRITE_DISPLAYS) e sobrescritos pelo level-patch.json ao carregar.
  // O localStorage causava valores antigos persistirem mesmo após atualizar o código.
  const loadAttachedSpriteDisplay = (key: PlayerPoseKey): AttachedSpriteDisplay => {
    return { ...DEFAULT_ATTACHED_SPRITE_DISPLAYS[key] };
  };
  // Chave de armazenamento no localStorage de cada pose editável do Horácio.
  // Mantém as chaves antigas (escada / kong vault) para compatibilidade com ajustes já salvos.
  const POSE_STORAGE_KEYS: Record<PlayerPoseKey, string> = {
    ladder: 'playerLadderDisplay',
    kongVaultStart: 'kongVaultStartDisplay',
    kongVaultAir: 'kongVaultAirDisplay',
    idle: 'poseDisplay_idle',
    run: 'poseDisplay_run',
    jump: 'poseDisplay_jump',
    roll: 'poseDisplay_roll',
    crouch: 'poseDisplay_crouch',
    divejump: 'poseDisplay_divejump',
    wallrun: 'poseDisplay_wallrun',
    wallflip: 'poseDisplay_wallflip',
    wallclimb: 'poseDisplay_wallclimb',
    sideflip: 'poseDisplay_sideflip',
  };
  // Salva todos os overrides de pose no level-patch.json (persistência definitiva, não localStorage)
  const savePoseOverridesToPatch = () => {
    const clean: Record<string, AttachedSpriteDisplay> = {};
    for (const [k, val] of Object.entries(poseDisplayOverridesRef.current)) {
      if (val.dw !== null || val.dh !== null || val.flip || (val.ox ?? 0) !== 0 || (val.oy ?? 0) !== 0) {
        clean[k] = val;
      }
    }
    fetch('/__editor/save-level-patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poseOverrides: clean }),
    }).catch(() => { /* silencia erros de rede */ });
  };
  const poseDisplayOverridesRef = useRef<Record<PlayerPoseKey, AttachedSpriteDisplay>>(
    (Object.keys(POSE_STORAGE_KEYS) as PlayerPoseKey[]).reduce((acc, key) => {
      acc[key] = loadAttachedSpriteDisplay(key);
      return acc;
    }, {} as Record<PlayerPoseKey, AttachedSpriteDisplay>)
  );
  const editorAttachedSpriteSelectedRef = useRef<PlayerPoseKey | null>(null);
  const editorHoracioBodySelectedRef = useRef(false);
  const editorBystanderSelectedIdxRef = useRef(-1);
  type PlayerSpriteDrag = {
    mode: 'resize-right' | 'resize-left' | 'resize-top' | 'resize-bottom' | 'resize-corner' | 'move';
    startWX: number; startWY: number; origDW: number; origDH: number;
    origOX: number; origOY: number;
    target?: PlayerPoseKey;
    // para resize-corner: sinais que determinam a direção de escala uniforme por canto
    cornerSignX?: number; cornerSignY?: number;
  };
  const editorPlayerSpriteDragRef = useRef<PlayerSpriteDrag | null>(null);
  const lastPlayerGeomRef = useRef<PlayerRenderGeom | null>(null);
  const editorSnapAxesRef = useRef<{ worldX: number | null; worldY: number | null }>({ worldX: null, worldY: null });
  const editorSnapStateRef = useRef<{ x: boolean; y: boolean }>({ x: false, y: false });
  const EDITOR_PAN_SPEED = 30;
  const EDITOR_CHECKPOINTS_DEFAULT = [
    { label: 'CP1', x: 6500 },
    { label: 'CP2', x: 12100 },
    { label: 'CP3', x: 16400 },
    { label: 'CP4', x: 21788 },
  ];
  // Lista unificada: carrega do JSON ao iniciar; usa defaults se não houver nada salvo
  const editorCustomCheckpointsRef = useRef<{ label: string; x: number }[]>(
    EDITOR_CHECKPOINTS_DEFAULT.map(cp => ({ ...cp }))
  );
  const getEditorCheckpoints = () => editorCustomCheckpointsRef.current;
  const editorCheckpointIdxRef = useRef(-1);
  const editorCheckpointDeleteConfirmRef = useRef<{ idx: number; until: number } | null>(null);
  const lastTime = useRef<number>(0);
  const animRef = useRef<number>(0);
  const buildingsRef = useRef(generateBuildings());
  const deletedPlatformKeysRef = useRef<Set<string>>(new Set());
  const platformsRef = useRef(generateLevel());
  const showControls = useRef(true);
  const spriteImgRef = useRef<HTMLImageElement | null>(null);
  const runSheetImgRef = useRef<HTMLImageElement | null>(null);
  const idleImgRef = useRef<HTMLImageElement | null>(null);
  const rollSheetImgRef = useRef<HTMLImageElement | null>(null);
  const jumpSheetImgRef = useRef<HTMLImageElement | null>(null);
  const diveSheetImgRef = useRef<HTMLImageElement | null>(null);
  const wallRunSheetImgRef = useRef<HTMLImageElement | null>(null);
  const mortalSheetImgRef = useRef<HTMLImageElement | null>(null);
  const subidaSheetImgRef = useRef<HTMLImageElement | null>(null);
  const sideFlipSheetImgRef = useRef<HTMLImageElement | null>(null);
  const ladderClimbImgRef = useRef<HTMLImageElement | null>(null);
  const ladderDescendImgRef = useRef<HTMLImageElement | null>(null);
  const kongVaultStartImgRef = useRef<HTMLImageElement | null>(null);
  const kongVaultAirImgRef = useRef<HTMLImageElement | null>(null);
  const fireEscapeFloorImgRef = useRef<HTMLImageElement | null>(null);
  const brickTextureImgRef = useRef<HTMLImageElement | null>(null);
  const balconyImgRef = useRef<HTMLImageElement | null>(null);
  const carroImgRef = useRef<HTMLImageElement | null>(null);
  const standingTireImgRef = useRef<HTMLImageElement | null>(null);
  const rollingTireImgRef = useRef<HTMLImageElement | null>(null);
  const dogSheetImgRef = useRef<HTMLImageElement | null>(null);
  const dogIdleImgRef = useRef<HTMLImageElement | null>(null);
  const bystander1ImgRef = useRef<HTMLImageElement | null>(null);
  const bystander2ImgRef = useRef<HTMLImageElement | null>(null);
  const bystander3ImgRef = useRef<HTMLImageElement | null>(null);
  const bystander4ImgRef = useRef<HTMLImageElement | null>(null);
  const npcHitImgRef = useRef<HTMLImageElement | null>(null);
  const customSpriteImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Responsive scale: fit canvas inside available viewport
  const [scale, setScale] = useState(getScale);
  useEffect(() => {
    const onResize = () => setScale(getScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Pré-carrega o beat no mount — fetch HTTP não precisa de user gesture
  useEffect(() => { preloadBeat(); preloadScreams(); preloadBystanderScreams(); preloadTireHit(); preloadBoxHit(); preloadMetalHit(); preloadCarHit(); preloadGritoBuraco(); preloadBrilho(); }, []);

  // Pré-carrega o player-recording.json no mount para o piloto automático do ghost.
  // Armazenado em ghostAutoReplayDataRef (separado de ghostReplayFramesRef) para
  // NÃO interferir no recording manual do usuário (tecla R) nem no G sem recording.
  useEffect(() => {
    fetch('/player-recording.json')
      .then(r => r.ok ? r.json() : null)
      .then((data: { frames: Keys[]; startX?: number; startY?: number } | null) => {
        if (data?.frames?.length) {
          ghostAutoReplayDataRef.current  = data.frames;
          if (data.startX != null) ghostAutoReplayStartXRef.current = data.startX;
          if (data.startY != null) ghostAutoReplayStartYRef.current = data.startY;
        }
      })
      .catch(() => { /* best-effort */ });
  }, []);

  // Carrega configurações persistentes do servidor (volume de música etc.)
  // — game-settings.json acompanha o git, ao contrário do localStorage.
  useEffect(() => {
    loadGameSettingsFromServer().then(({ sfxVolumes, npcVolumes }) => {
      musicVolumeRef.current = getMusicVolume();
      if (sfxVolumes) {
        for (const [cat, val] of Object.entries(sfxVolumes)) {
          if (typeof val === 'number' && !isNaN(val)) {
            sfxCategoryVolumesRef.current[cat] = val;
          }
        }
      }
      if (npcVolumes) {
        const parsed: Record<number, number> = {};
        for (const [idxStr, val] of Object.entries(npcVolumes)) {
          if (typeof val === 'number' && !isNaN(val)) parsed[Number(idxStr)] = val;
        }
        npcVolumesRef.current = parsed;
        if (typeof parsed[-1] === 'number') horacioVolumeRef.current = parsed[-1];
        try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(parsed)); } catch { /* ignore */ }
        if (gsRef.current) applyNpcVolumes(gsRef.current.bystanders);
      }
    });
  }, []);

  // Inicializa nomes da galeria do servidor ao montar
  useEffect(() => {
    fetch('/__editor/sprites')
      .then(r => r.ok ? r.json() : { sprites: [] })
      .then((data: { sprites: { name: string }[] }) => {
        galleryServerNamesRef.current = new Set(data.sprites.map(s => s.name));
      })
      .catch(() => { /* silencioso */ });

    fetch('/__editor/gallery-types')
      .then(r => r.ok ? r.json() : { types: [] })
      .then((data: { types: string[] }) => {
        galleryObjectTypesRef.current = new Set(data.types ?? []);
      })
      .catch(() => { /* silencioso */ });
  }, []);

  // Galeria de sprites
  const [showGallery, setShowGallery] = useState(false);
  const [gallerySprites, setGallerySprites] = useState<{ name: string; url: string; onServer: boolean }[]>([]);
  const [galleryTypes, setGalleryTypes] = useState<string[]>([]);
  const [galleryObjects, setGalleryObjects] = useState<Array<{ label: string; template: Platform }>>([]);

  // Histórico de versões do level-patch
  type HistorySnapshot = { file: string; size: number; addCount: number; delCount: number };
  const [showHistory, setShowHistory] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<HistorySnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMsg, setHistoryMsg] = useState<string | null>(null);
  const [clickCoords, setClickCoords] = useState<{ clientX: number; clientY: number; wx: number; wy: number } | null>(null);
  const clickCoordsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playCamFreeYRef = useRef(0); // offset manual da câmera Y em modo de jogo (scroll)

  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryMsg(null);
    try {
      const r = await fetch('/__editor/list-level-patch-history');
      if (r.ok) {
        const data = await r.json() as { snapshots: HistorySnapshot[] };
        setHistorySnapshots(data.snapshots ?? []);
      } else {
        setHistoryMsg(`Erro ${r.status} ao listar histórico`);
      }
    } catch (err) {
      setHistoryMsg(`Erro de rede ao listar histórico`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const restoreHistorySnapshot = useCallback(async (file: string) => {
    if (!window.confirm(`Restaurar este snapshot? O estado atual será salvo no histórico antes da troca.`)) return;
    setHistoryLoading(true);
    setHistoryMsg(null);
    try {
      const r = await fetch('/__editor/restore-level-patch-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
      if (r.ok) {
        setHistoryMsg('Restaurado! Recarregando página...');
        // Recarrega para que a aplicação leia o novo level-patch.json desde o início.
        setTimeout(() => window.location.reload(), 700);
      } else {
        const txt = await r.text();
        setHistoryMsg(`Erro ${r.status} ao restaurar: ${txt.slice(0, 80)}`);
      }
    } catch (err) {
      setHistoryMsg(`Erro de rede ao restaurar`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openGallery = useCallback(async () => {
    // Sprites salvos no servidor
    let serverSprites: { name: string; url: string; onServer: boolean }[] = [];
    try {
      const resp = await fetch('/__editor/sprites');
      if (resp.ok) {
        const data = await resp.json() as { sprites: { name: string; url: string }[] };
        serverSprites = data.sprites.map(s => ({ ...s, onServer: true }));
      }
    } catch { /* sem sprites no servidor */ }

    // Atualiza ref de nomes do servidor
    galleryServerNamesRef.current = new Set(serverSprites.map(s => s.name));

    // Sprites usados na fase mas não no servidor
    const serverNames = galleryServerNamesRef.current;
    const levelSprites: { name: string; url: string; onServer: boolean }[] = [];
    const seenLevelNames = new Set<string>();
    for (const p of platformsRef.current) {
      if (
        p.type === 'sprite' &&
        p.customSpriteName &&
        p.customSpriteDataUrl &&
        !serverNames.has(p.customSpriteName) &&
        !seenLevelNames.has(p.customSpriteName)
      ) {
        seenLevelNames.add(p.customSpriteName);
        levelSprites.push({ name: p.customSpriteName, url: p.customSpriteDataUrl, onServer: false });
      }
    }

    setGallerySprites([...serverSprites, ...levelSprites]);
    setGalleryTypes([...galleryObjectTypesRef.current]);
    setShowGallery(true);
  }, []);

  const deleteGallerySprite = useCallback(async (spriteName: string, onServer: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onServer) {
      if (!window.confirm(`Deletar "${spriteName}" permanentemente?`)) return;
      try {
        await fetch('/__editor/delete-sprite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: spriteName }),
        });
        galleryServerNamesRef.current.delete(spriteName);
      } catch {
        // silencioso
      }
    }
    setGallerySprites(prev => prev.filter(s => s.name !== spriteName));
  }, []);

  const removeObjectTypeFromGallery = useCallback((type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    galleryObjectTypesRef.current.delete(type);
    const types = [...galleryObjectTypesRef.current];
    fetch('/__editor/save-gallery-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types }),
    }).catch(() => { /* silencioso */ });
    setGalleryTypes(prev => prev.filter(t => t !== type));
  }, []);

  const saveToGallery = useCallback(async (p: Platform) => {
    if (p.type === 'sprite' && p.customSpriteName && p.customSpriteDataUrl) {
      try {
        const resp = await fetch('/__editor/upload-sprite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: p.customSpriteName, dataUrl: p.customSpriteDataUrl }),
        });
        if (resp.ok) {
          galleryServerNamesRef.current.add(p.customSpriteName);
          editorCopiedMsgRef.current = { text: `✓ SALVO NA GALERIA: ${p.customSpriteName}`, until: Date.now() + 3000 };
        } else {
          editorCopiedMsgRef.current = { text: `✗ ERRO AO SALVAR SPRITE`, until: Date.now() + 3000 };
        }
      } catch {
        editorCopiedMsgRef.current = { text: `✗ ERRO AO SALVAR NA GALERIA`, until: Date.now() + 3000 };
      }
    } else if (p.type !== 'ground') {
      galleryObjectTypesRef.current.add(p.type);
      const types = [...galleryObjectTypesRef.current];
      fetch('/__editor/save-gallery-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types }),
      }).catch(() => { /* silencioso */ });
      editorCopiedMsgRef.current = { text: `✓ [${p.type.toUpperCase()}] SALVO NA GALERIA`, until: Date.now() + 3000 };
    }
  }, []);

  const placeObjectType = useCallback((type: Platform['type']) => {
    setShowGallery(false);
    type DefaultDims = { w: number; h: number };
    const defaults: Record<string, DefaultDims> = {
      platform:    { w: 120, h: 20 },
      wall:        { w: 20,  h: 80 },
      obstacle:    { w: 40,  h: 40 },
      car:         { w: 180, h: 60 },
      tire:        { w: 40,  h: 60 },
      tireHideout: { w: 80,  h: 80 },
      box:         { w: 65,  h: 55 },
      pothole:     { w: 80,  h: 90 },
    };
    const dims = defaults[type] ?? { w: 60, h: 40 };
    const cx = editorCamXRef.current + CANVAS_W / 2;
    const cy = editorCamYRef.current + CANVAS_H / 2;
    const platform: Platform = {
      type,
      x: Math.round(cx - dims.w / 2),
      y: Math.round(Math.min(cy - dims.h / 2, GROUND_Y - dims.h)),
      w: dims.w,
      h: dims.h,
    };
    const snapshot = platformsRef.current.map(p => ({
      ...p,
      collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
        ...b,
        slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
      })) : undefined,
    })) as Platform[];
    editorUndoStackRef.current.push(snapshot);
    if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
    editorRedoStackRef.current = [];
    platformsRef.current = [...platformsRef.current, platform];
    saveSprites(platformsRef.current);
    if (gsRef.current) gsRef.current.platforms = platformsRef.current;
    const idx = platformsRef.current.length - 1;
    editorSelectedIdxRef.current = idx;
    editorSelectedIndicesRef.current = new Set([idx]);
    editorCollisionModeRef.current = false;
    editorCollisionBoxIdxRef.current = 0;
    editorCopiedMsgRef.current = { text: `✓ [${type.toUpperCase()}] COLOCADO`, until: Date.now() + 3000 };
  }, []);

  const placeGalleryObject = useCallback((obj: { label: string; template: Platform }) => {
    setShowGallery(false);
    const { template } = obj;
    const cx = editorCamXRef.current + CANVAS_W / 2;
    const cy = editorCamYRef.current + CANVAS_H / 2;
    const platform: Platform = {
      ...template,
      x: Math.round(cx - template.w / 2),
      y: Math.round(Math.min(cy - template.h / 2, GROUND_Y - template.h)),
    };
    const snapshot = platformsRef.current.map(p => ({
      ...p,
      collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
        ...b,
        slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
      })) : undefined,
    })) as Platform[];
    editorUndoStackRef.current.push(snapshot);
    if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
    editorRedoStackRef.current = [];
    platformsRef.current = [...platformsRef.current, platform];
    saveSprites(platformsRef.current);
    if (gsRef.current) gsRef.current.platforms = platformsRef.current;
    const idx = platformsRef.current.length - 1;
    editorSelectedIdxRef.current = idx;
    editorSelectedIndicesRef.current = new Set([idx]);
    editorCollisionModeRef.current = false;
    editorCollisionBoxIdxRef.current = 0;
    editorCopiedMsgRef.current = { text: `✓ [${obj.label.toUpperCase()}] COLOCADO`, until: Date.now() + 3000 };
  }, []);

  const removeGalleryObject = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newObjs = galleryObjectsRef.current.filter((_, i) => i !== idx);
    galleryObjectsRef.current = newObjs;
    setGalleryObjects(newObjs);
    fetch('/__editor/save-gallery-objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: newObjs }),
    }).catch(() => { /* silencioso */ });
  }, []);

  const placeGallerySprite = useCallback((spriteName: string, spriteUrl: string) => {
    setShowGallery(false);
    const img = new Image();
    img.onload = () => {
      const processed = stripEditorSpriteBackground(img);
      const maxW = 180;
      const s = Math.min(1, maxW / img.naturalWidth);
      const w = Math.max(12, Math.round(img.naturalWidth * s));
      const h = Math.max(12, Math.round(img.naturalHeight * s));
      const cx = editorCamXRef.current + CANVAS_W / 2;
      const cy = editorCamYRef.current + CANVAS_H / 2;
      const platform: Platform = {
        type: 'sprite',
        x: Math.round(cx - w / 2),
        y: Math.round(Math.min(cy - h / 2, GROUND_Y - h)),
        w,
        h,
        customSpriteName: spriteName,
        customSpriteDataUrl: spriteUrl,
      };
      const snapshot = platformsRef.current.map(p => ({
        ...p,
        collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
          ...b,
          slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
        })) : undefined,
      })) as Platform[];
      editorUndoStackRef.current.push(snapshot);
      if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
      editorRedoStackRef.current = [];
      customSpriteImagesRef.current.set(spriteName, processed);
      platformsRef.current = [...platformsRef.current, platform];
      saveSprites(platformsRef.current);
      if (gsRef.current) gsRef.current.platforms = platformsRef.current;
      const idx = platformsRef.current.length - 1;
      editorSelectedIdxRef.current = idx;
      editorSelectedIndicesRef.current = new Set([idx]);
      editorCollisionModeRef.current = false;
      editorCollisionBoxIdxRef.current = 0;
      editorCopiedMsgRef.current = { text: `✓ SPRITE COLOCADO: ${spriteName}`, until: Date.now() + 3000 };
    };
    img.src = spriteUrl;
  }, []);

  const makeInitialState = useCallback((gameMode: GameState['gameMode'] = 'story'): GameState => ({
    player: makePlayer(),
    drone: makeDrone(),
    bullets: [],
    camera: { x: 0, y: 0 },
    platforms: gameMode === 'wall-test' ? generateWallTestLevel() : platformsRef.current,
    gamePhase: 'menu',
    gameMode,
    raceDroneEnabled: gameMode === 'race' ? raceDroneEnabledRef.current : false,
    raceCheckpointsEnabled: gameMode === 'race' ? raceCheckpointsEnabledRef.current : false,
    raceRoundTarget: gameMode === 'race' ? raceRoundTargetRef.current : 1,
    raceRoundNumber: 1,
    racePlayerWins: 0,
    raceRivalWins: 0,
    score: 0,
    time: 0,
    particles: [],
    screenShake: 0,
    destroyedBoxIndices: [],
    fallingBoxes: [],
    flyingTires: [],
    destroyedTireIndices: [],
    dogs: gameMode === 'story' || gameMode === 'race' ? [
      {
        x: 19250,
        y: GROUND_Y - 75,
        w: 105,
        h: 75,
        vx: 3.0,
        facingRight: true,
        animState: 'run' as const,
        animTimer: 0,
        biteTimer: 0,
        biteCooldown: 0,
        patrolLeft: 19211,
        patrolRight: 20745,
        growlTimer: 2500,
      },
    ] : [],
    bystanders: gameMode === 'story' || gameMode === 'race'
      ? applyNpcVolumes(makeInitialBystanders())
      : [],
    junkyardHealthGiven: false,
    postJunkyardHealthGiven: false,
    secondCheckpointGiven: false,
    storyCheckpointX: 0,
    villageScreamTimer: 0,
    lives: 3,
    droneAlert: null,
    droneIntroduced: false,
    victoryTimer: 0,
    raceCountdownTimer: 0,
  }), []);

  const registerCustomSpriteImage = useCallback((platform: Platform) => {
    if (platform.type !== 'sprite' || !platform.customSpriteName || !platform.customSpriteDataUrl) return;
    const img = new Image();
    img.onload = () => {
      customSpriteImagesRef.current.set(platform.customSpriteName!, stripEditorSpriteBackground(img));
    };
    img.src = platform.customSpriteDataUrl;
    customSpriteImagesRef.current.set(platform.customSpriteName, img);
  }, []);

  // Limpa todos os inputs — chamado em todo respawn/reset para evitar teclas travadas
  const clearKeys = useCallback(() => {
    const k = keysRef.current;
    k.left = false; k.right = false; k.up = false; k.down = false;
    k.space = false; k.shift = false; k.z = false; k.dive = false;
    spaceJustPressed.current = false;
    zJustPressed.current = false;
    pauseUpJustPressed.current = false;
    pauseDownJustPressed.current = false;
    raceLeftJustPressed.current = false;
    raceRightJustPressed.current = false;
  }, []);

  const resetGame = useCallback((
    gameMode: GameState['gameMode'] = 'story',
    preserveMusic = false,
  ) => {
    // Ao iniciar modo história, garante que o modo editor não interfere
    if (gameMode === 'story' || gameMode === 'race') {
      editorTestModeRef.current = false;
      if (!preserveMusic) {
        stopBeat();
        setMusicType('mp3');
        startBeat();
      }
      initDogAmbient(dogGrowlUrl); // pré-carrega o grunido do cachorro em loop
    } else {
      stopBeat();
    }
    clearKeys();
    ghostEnabledRef.current = false;
    ghostPlayerRef.current = null;
    racePlayerRef.current = gameMode === 'race'
      ? createGhostPlayer(100, GROUND_Y - PLAYER_H)
      : null;
    raceRoundWinnerRef.current = null;
    raceRoundLoserXRef.current = 80;
    raceInterRoundTransitionRef.current = false;
    raceCheckpointXRef.current = 0;
    raceReplayArmedRef.current = false;
    raceTictacSnapDoneRef.current = false;
    const isRace = gameMode === 'race';
    gsRef.current = {
      ...makeInitialState(gameMode),
      gamePhase: isRace ? 'race-countdown' : 'playing',
      raceCountdownTimer: isRace ? 3500 : 0,
    };
  }, [makeInitialState, clearKeys]);

  // Assinatura de conteúdo de uma plataforma — inclui tudo que importa para
  // detectar "dirty" (posição/tamanho/rotação/crop/hitboxes/sprite).
  const platSignature = useCallback((p: Platform): string => {
    const boxes = (p.collisionBoxes ?? []).map(b =>
      `${b.x},${b.y},${b.w},${b.h},${b.slopeTop?.left ?? ''},${b.slopeTop?.right ?? ''}`
    ).join('|');
    return [
      p.type, p.x, p.y, p.w, p.h,
      Math.round(p.rotation ?? 0),
      p.cropLeft ?? 0, p.cropTop ?? 0, p.cropRight ?? 0, p.cropBottom ?? 0,
      p.customSpriteName ?? '',
      boxes,
    ].join('|');
  }, []);

  const platformsSignature = useCallback((platforms: Platform[]): string => {
    return platforms
      .filter(p => p.type !== 'ground')
      .map(platSignature)
      .sort()
      .join('\n');
  }, [platSignature]);

  // Persiste o estado atual em /__editor/save-level-patch. Idempotente.
  // Retorna true em sucesso. Atualiza baseline e signature em caso positivo.
  const persistLevelPatch = useCallback(async (silent = false): Promise<boolean> => {
    if (!levelPatchLoadedRef.current) {
      // Não persistir antes do patch ter sido carregado — risco de sobrescrever
      // adições anteriores que ainda não foram aplicadas.
      return false;
    }
    if (editorSaveStatusRef.current === 'saving') return false;
    editorSaveStatusRef.current = 'saving';
    if (!silent) editorSaveStatusMessageRef.current = 'salvando...';

    const originalKeys = new Set(originalLevelPlatformsRef.current.map(platBaseKey));
    const currentPlatforms = platformsRef.current;
    const patchAdd = currentPlatforms.filter(p =>
      p.type !== 'ground' && !originalKeys.has(platBaseKey(p))
    ).map(p => {
      const clean: Platform = { ...p };
      if (clean.customSpriteDataUrl && !clean.customSpriteDataUrl.startsWith('/sprites/')) {
        delete clean.customSpriteDataUrl;
      }
      return clean;
    });
    const patchAddKeys = new Set(patchAdd.map(platBaseKey));
    const currentKeys = new Set(currentPlatforms.map(platBaseKey));
    const patchDelSet = new Set(
      originalLevelPlatformsRef.current
        .filter(p => p.type !== 'ground' && (
          !currentKeys.has(platBaseKey(p)) ||
          patchAddKeys.has(platBaseKey(p))
        ))
        .map(p => platBaseKey(p))
    );
    // Garante que apagamentos de originais rastreados em deletedPlatformKeysRef
    // (localStorage) também sejam persistidos no servidor — isso evita que o
    // original reapareça em outra sessão/máquina sem o localStorage local.
    const originalKeysSet = new Set(originalLevelPlatformsRef.current.map(platBaseKey));
    deletedPlatformKeysRef.current.forEach((k) => {
      if (originalKeysSet.has(k) && !patchAddKeys.has(k)) patchDelSet.add(k);
    });
    const patchDel = Array.from(patchDelSet);
    const levelPatch = {
      add: patchAdd,
      del: patchDel,
      checkpoints: editorCustomCheckpointsRef.current,
    };
    const sigSnapshot = platformsSignature(currentPlatforms);

    try {
      const r = await fetch('/__editor/save-level-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(levelPatch),
      });
      if (r.ok) {
        editorSaveStatusRef.current = 'saved';
        editorSaveStatusMessageRef.current = `salvo +${patchAdd.length}/-${patchDel.length}`;
        editorSaveStatusUntilRef.current = Date.now() + 3000;
        editorBaselineKeysRef.current = new Set(currentPlatforms.map(platBaseKey));
        editorSavedSignatureRef.current = sigSnapshot;
        editorDirtyRef.current = false;
        return true;
      } else {
        editorSaveStatusRef.current = 'error';
        editorSaveStatusMessageRef.current = `erro ${r.status} ao salvar`;
        editorSaveStatusUntilRef.current = Date.now() + 6000;
        return false;
      }
    } catch (err) {
      editorSaveStatusRef.current = 'error';
      editorSaveStatusMessageRef.current = `erro de rede ao salvar`;
      editorSaveStatusUntilRef.current = Date.now() + 6000;
      return false;
    }
  }, [platformsSignature]);

  // Marca o editor como modificado e agenda um auto-save (debounced).
  const markEditorDirty = useCallback(() => {
    editorDirtyRef.current = true;
    if (editorSaveStatusRef.current !== 'saving') {
      editorSaveStatusRef.current = 'pending';
      editorSaveStatusMessageRef.current = 'modificado — salvando em breve...';
    }
    if (editorAutoSaveTimerRef.current !== null) {
      clearTimeout(editorAutoSaveTimerRef.current);
    }
    editorAutoSaveTimerRef.current = window.setTimeout(() => {
      editorAutoSaveTimerRef.current = null;
      persistLevelPatch(true).catch(() => { /* silencioso */ });
    }, 1500);
  }, [persistLevelPatch]);

  useEffect(() => {
    deletedPlatformKeysRef.current = loadDeletedPlatformKeys();
    const customSpritePlatforms = loadCustomSpritePlatforms();
    const originalPlatforms = generateLevel();
    originalLevelPlatformsRef.current = originalPlatforms;
    const basePlatforms = applyDeletedPlatformKeys(originalPlatforms, deletedPlatformKeysRef.current);
    customSpriteImagesRef.current = new Map();
    basePlatforms.forEach(registerCustomSpriteImage);
    customSpritePlatforms.forEach(registerCustomSpriteImage);
    platformsRef.current = markRaceStoryPhysicsBoxes([
      ...basePlatforms,
      ...customSpritePlatforms,
    ]);
    gsRef.current = makeInitialState();

    // Carrega level-patch.json do servidor e aplica as mudanças salvas.
    // Sinaliza levelPatchLoadedRef ao final (sucesso OU falha) para liberar
    // a entrada no editor e o auto-save.
    const finishPatchLoad = () => {
      levelPatchLoadedRef.current = true;
      editorSavedSignatureRef.current = platformsSignature(platformsRef.current);
      editorSaveStatusRef.current = 'saved';
      editorDirtyRef.current = false;
    };
    fetch('/level-patch.json?_=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then((patch: { add?: Platform[]; del?: string[]; checkpoints?: { label: string; x: number }[]; poseOverrides?: Record<string, AttachedSpriteDisplay> } | null) => {
        if (!patch) { finishPatchLoad(); return; }
        const delKeys = new Set<string>(patch.del ?? []);
        const patchedBase = originalPlatforms.filter(p =>
          isPermanentJunkyardBox(p) || !delKeys.has(platBaseKey(p))
        );
        // Dedup: ignora entradas em add cujo key já está no original (resolve
        // conflito entre código fonte atualizado e patch antigo).
        const originalKeySet = new Set(originalPlatforms.map(platBaseKey));
        const rawAddPlatforms = (patch.add ?? []) as Platform[];
        // Se um platform está explicitamente no patch.add, remove do set de deletados
        // (sobrescreve deleções antigas do localStorage para esse objeto)
        for (const p of rawAddPlatforms) {
          const k = platBaseKey(p);
          if (deletedPlatformKeysRef.current.has(k)) {
            deletedPlatformKeysRef.current.delete(k);
            saveDeletedPlatformKeys(deletedPlatformKeysRef.current);
          }
        }
        const addPlatforms = markRaceStoryPhysicsBoxes(rawAddPlatforms
          .filter(p => !originalKeySet.has(platBaseKey(p)))
          .filter(p => !deletedPlatformKeysRef.current.has(platBaseKey(p))));
        addPlatforms.forEach(registerCustomSpriteImage);
        const withDeleted = applyDeletedPlatformKeys(patchedBase, deletedPlatformKeysRef.current);
        platformsRef.current = markRaceStoryPhysicsBoxes([
          ...withDeleted,
          ...customSpritePlatforms,
          ...addPlatforms,
        ]);
        if (gsRef.current) gsRef.current.platforms = platformsRef.current;
        // Restaura checkpoints personalizados salvos
        if (patch.checkpoints && patch.checkpoints.length > 0) {
          editorCustomCheckpointsRef.current = patch.checkpoints;
        }
        // Restaura overrides de pose salvos no patch (ox, oy, dw, dh, flip)
        if (patch.poseOverrides) {
          for (const [k, val] of Object.entries(patch.poseOverrides)) {
            const pKey = k as PlayerPoseKey;
            if (pKey in poseDisplayOverridesRef.current) {
              poseDisplayOverridesRef.current[pKey] = { dw: val.dw ?? null, dh: val.dh ?? null, flip: !!val.flip, ox: val.ox ?? 0, oy: val.oy ?? 0 };
            }
          }
        }
        finishPatchLoad();
      })
      .catch(() => { /* sem patch salvo ainda */ finishPatchLoad(); });

    // Load sprite images
    const img = new Image();
    img.src = spriteUrl;
    spriteImgRef.current = img;

    const runImg = new Image();
    runImg.src = runSheetUrl;
    runSheetImgRef.current = runImg;

    const idleImg = new Image();
    idleImg.src = idleUrl;
    idleImgRef.current = idleImg;

    const rollImg = new Image();
    rollImg.src = rollSheetUrl;
    rollSheetImgRef.current = rollImg;

    const jumpImg = new Image();
    jumpImg.onload = () => {
      // erodeEdge=true suaviza bordas; removeGlobalWhite=true remove branco interno (ex: entre as pernas)
      jumpSheetImgRef.current = stripWhiteBackground(jumpImg, true, true);
    };
    jumpImg.src = jumpSheetUrl;

    const diveImg = new Image();
    diveImg.onload = () => {
      // erodeEdge=true suaviza as bordas do mergulho
      diveSheetImgRef.current = stripWhiteBackground(diveImg, true, true, 1.0);
    };
    diveImg.src = diveJumpSheetUrl;

    const wallRunImg = new Image();
    wallRunImg.onload = () => {
      wallRunSheetImgRef.current = stripBlackBackground(wallRunImg);
    };
    wallRunImg.src = wallRunSheetUrl;

    const mortalImg = new Image();
    mortalImg.onload = () => {
      mortalSheetImgRef.current = stripBlackAndWhiteBackground(mortalImg);
    };
    mortalImg.src = mortalSheetUrl;

    const subidaImg = new Image();
    subidaImg.onload = () => {
      subidaSheetImgRef.current = stripBlackAndWhiteBackground(subidaImg);
    };
    subidaImg.src = subidaSheetUrl;

    const sideFlipImg = new Image();
    sideFlipImg.onload = () => {
      // Testa se o PNG já tem transparência nativa antes de aplicar stripping
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 1;
      testCanvas.height = 1;
      const testCtx = testCanvas.getContext('2d')!;
      // Pegar pixel no canto — se for preto e alpha=0 o PNG já tem transparência
      testCtx.drawImage(sideFlipImg, 0, 0, 1, 1);
      const pixel = testCtx.getImageData(0, 0, 1, 1).data;
      const hasNativeAlpha = pixel[3] < 128;
      if (hasNativeAlpha) {
        sideFlipSheetImgRef.current = sideFlipImg;
      } else {
        const stripped = stripPureBlackBackground(sideFlipImg);
        // Espera a decodificação do data URL antes de atribuir
        if (stripped.complete && stripped.naturalWidth > 0) {
          sideFlipSheetImgRef.current = stripped;
        } else {
          stripped.onload = () => { sideFlipSheetImgRef.current = stripped; };
        }
      }
    };
    sideFlipImg.src = sideFlipSheetUrl;

    const ladderImg = new Image();
    ladderImg.onload = () => {
      ladderClimbImgRef.current = stripWhiteBackground(ladderImg);
    };
    ladderImg.src = ladderClimbUrl;

    const ladderDownImg = new Image();
    ladderDownImg.onload = () => {
      ladderDescendImgRef.current = stripWhiteBackground(ladderDownImg);
    };
    ladderDownImg.src = ladderDescendUrl;

    const kongVaultStartImg = new Image();
    kongVaultStartImg.onload = () => {
      kongVaultStartImgRef.current = kongVaultStartImg;
    };
    kongVaultStartImg.src = kongVaultStartUrl;

    const kongVaultAirImg = new Image();
    kongVaultAirImg.onload = () => {
      kongVaultAirImgRef.current = kongVaultAirImg;
    };
    kongVaultAirImg.src = kongVaultAirUrl;

    const feFloorImg = new Image();
    feFloorImg.onload = () => {
      fireEscapeFloorImgRef.current = feFloorImg;
    };
    feFloorImg.src = fireEscapeFloorUrl;

    const brickImg = new Image();
    brickImg.src = brickTextureUrl;
    brickTextureImgRef.current = brickImg;

    const balconyImg = new Image();
    balconyImg.src = balconyUrl;
    balconyImgRef.current = balconyImg;

    const carroImg = new Image();
    carroImg.onload = () => {
      const stripped = stripPureBlackExact(carroImg);
      if (stripped.complete && stripped.naturalWidth > 0) {
        carroImgRef.current = stripped;
      } else {
        stripped.onload = () => { carroImgRef.current = stripped; };
      }
    };
    carroImg.src = '/carro.png';

    const standingTireImg = new Image();
    standingTireImg.onload = () => {
      const stripped = stripWhiteBackground(standingTireImg, false, true);
      standingTireImgRef.current = stripped;
      stripped.onload = () => { standingTireImgRef.current = stripped; };
    };
    standingTireImg.src = standingTireUrl;

    const rollingTireImg = new Image();
    rollingTireImg.onload = () => {
      const stripped = stripWhiteBackground(rollingTireImg, false, true);
      rollingTireImgRef.current = stripped;
      stripped.onload = () => { rollingTireImgRef.current = stripped; };
    };
    rollingTireImg.src = rollingTireUrl;

    const dogImg = new Image();
    dogImg.onload = () => {
      const stripped = stripWhiteBackground(dogImg);
      if (stripped.complete && stripped.naturalWidth > 0) {
        dogSheetImgRef.current = stripped;
      } else {
        stripped.onload = () => { dogSheetImgRef.current = stripped; };
      }
    };
    dogImg.src = dogSheetUrl;

    const dogIdleImg = new Image();
    dogIdleImg.onload = () => {
      const stripped = stripWhiteBackground(dogIdleImg);
      if (stripped.complete && stripped.naturalWidth > 0) {
        dogIdleImgRef.current = stripped;
      } else {
        stripped.onload = () => { dogIdleImgRef.current = stripped; };
      }
    };
    dogIdleImg.src = dogIdleUrl;

    const bystander1Img = new Image();
    bystander1Img.onload = () => {
      const stripped = stripWhiteBackground(bystander1Img, true);
      if (stripped.complete && stripped.naturalWidth > 0) {
        bystander1ImgRef.current = stripped;
      } else {
        stripped.onload = () => { bystander1ImgRef.current = stripped; };
      }
    };
    bystander1Img.src = bystander1Url;

    const bystander2Img = new Image();
    bystander2Img.onload = () => {
      const stripped = stripWhiteBackground(bystander2Img, true);
      if (stripped.complete && stripped.naturalWidth > 0) {
        bystander2ImgRef.current = stripped;
      } else {
        stripped.onload = () => { bystander2ImgRef.current = stripped; };
      }
    };
    bystander2Img.src = bystander2Url;

    const bystander3Img = new Image();
    bystander3Img.onload = () => {
      const stripped = stripWhiteBackground(bystander3Img);
      if (stripped.complete && stripped.naturalWidth > 0) {
        bystander3ImgRef.current = stripped;
      } else {
        stripped.onload = () => { bystander3ImgRef.current = stripped; };
      }
    };
    bystander3Img.src = bystander3Url;

    const bystander4Img = new Image();
    bystander4Img.onload = () => {
      const stripped = stripWhiteBackground(bystander4Img);
      if (stripped.complete && stripped.naturalWidth > 0) {
        bystander4ImgRef.current = stripped;
      } else {
        stripped.onload = () => { bystander4ImgRef.current = stripped; };
      }
    };
    bystander4Img.src = bystander4Url;

    const npcHitImg = new Image();
    npcHitImg.onload = () => {
      const stripped = stripWhiteBackground(npcHitImg);
      if (stripped.complete && stripped.naturalWidth > 0) {
        npcHitImgRef.current = stripped;
      } else {
        stripped.onload = () => { npcHitImgRef.current = stripped; };
      }
    };
    npcHitImg.src = npcHitUrl;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      // Inicia trilha do menu (chiptune) na primeira interação do usuário
      if (down && gsRef.current?.gamePhase === 'menu') {
        if (!menuMutedRef.current) {
          setMusicType('chiptune');
          startBeat();
        }
      }
      // Tecla M — toggle mute da música do menu
      if (down && e.code === 'KeyM' && gsRef.current?.gamePhase === 'menu') {
        menuMutedRef.current = !menuMutedRef.current;
        try { localStorage.setItem('pursuit_menu_muted', menuMutedRef.current ? '1' : '0'); } catch (_) {}
        if (menuMutedRef.current) {
          stopBeat();
        } else {
          setMusicType('chiptune');
          startBeat();
        }
      }
      if (down && gsRef.current?.gamePhase === 'editor' && editorCollisionModeRef.current) {
        const step = e.shiftKey ? 5 : 1;
        if (e.code === 'ArrowLeft' && nudgeEditorSelectedHitbox(-step, 0)) { e.preventDefault(); return; }
        if (e.code === 'ArrowRight' && nudgeEditorSelectedHitbox(step, 0)) { e.preventDefault(); return; }
        if (e.code === 'ArrowUp' && nudgeEditorSelectedHitbox(0, -step)) { e.preventDefault(); return; }
        if (e.code === 'ArrowDown' && nudgeEditorSelectedHitbox(0, step)) { e.preventDefault(); return; }
      }
      // ── Nudge do sprite de pose selecionado com setas ──
      if (down && gsRef.current?.gamePhase === 'editor' && !editorCollisionModeRef.current && !editorDragRef.current) {
        const poseKey = editorAttachedSpriteSelectedRef.current;
        if (poseKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
          const step = e.shiftKey ? 10 : 1;
          const cur = poseDisplayOverridesRef.current[poseKey];
          let ox = cur.ox ?? 0;
          let oy = cur.oy ?? 0;
          if (e.code === 'ArrowLeft')  ox -= step;
          if (e.code === 'ArrowRight') ox += step;
          if (e.code === 'ArrowUp')    oy -= step;
          if (e.code === 'ArrowDown')  oy += step;
          ox = Math.round(ox);
          oy = Math.round(oy);
          poseDisplayOverridesRef.current[poseKey] = { ...cur, ox, oy };
          savePoseOverridesToPatch();
          editorCopiedMsgRef.current = { text: `↑↓←→ ${PLAYER_POSE_LABELS[poseKey]}  ox:${ox}  oy:${oy}`, until: Date.now() + 1500 };
          e.preventDefault();
          return;
        }
      }
      // ── Nudge do objeto selecionado com setas (modo normal, sem drag ativo) ──
      if (down && gsRef.current?.gamePhase === 'editor' && !editorCollisionModeRef.current && !editorDragRef.current) {
        const selIdx = editorSelectedIdxRef.current;
        if (selIdx >= 0 && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
          const p = platformsRef.current[selIdx];
          if (p && p.type !== 'ground') {
            const step = e.shiftKey ? 10 : 1;
            pushEditorHistory();
            if (e.code === 'ArrowUp')    p.y -= step;
            if (e.code === 'ArrowDown')  p.y = Math.min(EDITOR_GROUND_Y - 1, p.y + step);
            if (e.code === 'ArrowLeft')  p.x = Math.max(0, p.x - step);
            if (e.code === 'ArrowRight') p.x += step;
            // Mover grupo selecionado junto
            editorSelectedIndicesRef.current.forEach(i => {
              if (i === selIdx) return;
              const gp = platformsRef.current[i];
              if (!gp || gp.type === 'ground') return;
              if (e.code === 'ArrowUp')    gp.y -= step;
              if (e.code === 'ArrowDown')  gp.y = Math.min(EDITOR_GROUND_Y - 1, gp.y + step);
              if (e.code === 'ArrowLeft')  gp.x = Math.max(0, gp.x - step);
              if (e.code === 'ArrowRight') gp.x += step;
            });
            copyPlatText(platCoordText(p), `↑↓←→ MOVER (shift=10px)`);
            e.preventDefault();
            return;
          }
        }
      }
      const k = keysRef.current;
      if (down && gsRef.current?.gamePhase === 'editor') {
        const digitMatch = /^Digit([0-9])$/.exec(e.code);
        if (digitMatch) {
          const checkpoints = getEditorCheckpoints();
          const digit = Number(digitMatch[1]);
          const checkpointIndex = digit === 0 ? 9 : digit - 1;
          if (checkpointIndex >= 0 && checkpointIndex < checkpoints.length) {
            editorCheckpointIdxRef.current = checkpointIndex;
            editorCamXRef.current = Math.max(0, checkpoints[checkpointIndex].x - CANVAS_W / 2);
            editorCopiedMsgRef.current = {
              text: `✓ ${checkpoints[checkpointIndex].label} ATIVO — x:${checkpoints[checkpointIndex].x}`,
              until: Date.now() + 1600,
            };
            e.preventDefault();
            return;
          }
        }
        // Usa e.key para compatibilidade com ABNT2 e outros layouts de teclado
        if (e.key === '/') {
          editorRealStoryJustPressed.current = true;
          e.preventDefault();
          return;
        }
      }
      switch (e.code) {
        case 'ArrowLeft':
          k.left = down;
          if (down) raceLeftJustPressed.current = true;
          break;
        case 'ArrowRight':
          k.right = down;
          if (down) raceRightJustPressed.current = true;
          break;
        case 'KeyA': k.left = down; break;
        case 'KeyD': k.right = down; break;
        case 'ArrowUp':   case 'KeyW':
          k.up = down;
          if (down) {
            lastJumpPressTime.current = performance.now();
            pauseUpJustPressed.current = true;
          }
          break;
        case 'ArrowDown': case 'KeyS':
          if (e.code === 'KeyS' && down && gsRef.current?.gamePhase === 'editor' && editorCollisionModeRef.current) {
            const p = platformsRef.current[editorSelectedIdxRef.current];
            if (p) {
              pushEditorHistory();
              const box = ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
              if (box.slopeTop) {
                delete box.slopeTop;
                copyPlatText(platCoordText(p), '✓ SLOPE REMOVIDO DA HITBOX');
              } else {
                box.slopeTop = { left: box.h, right: 0 };
                copyPlatText(platCoordText(p), '✓ SLOPE ADICIONADO — arraste os losangos laranja');
              }
            }
            e.preventDefault();
            break;
          }
          k.down = down;
          if (down) {
            lastDownPressTime.current = performance.now();
            pauseDownJustPressed.current = true;
          }
          break;
        case 'Space':
          k.space = down;
          if (down) {
            spaceJustPressed.current = true;
            lastJumpPressTime.current = performance.now();
          }
          break;
        case 'ShiftLeft': case 'ShiftRight': k.shift = down; break;
        case 'KeyZ': k.z = down; if (down) zJustPressed.current = true; break;
        case 'KeyG': if (down) gJustPressed.current = true; break;
        case 'KeyR': if (down) rJustPressed.current = true; break;
        case 'ControlLeft': case 'ControlRight': case 'Tab':
          if (down) editorSpawnJustPressed.current = true;
          break;
        case 'KeyE':
          if (down) editorJustPressed.current = true;
          break;
        case 'KeyO':
          if (down) optionsJustPressed.current = true;
          break;
        case 'KeyT':
          if (down) trainingJustPressed.current = true;
          break;
        case 'Delete':
          if (down && gsRef.current?.gamePhase === 'editor') {
            // Ctrl+Delete ou Delete sem Ctrl: remove selecionado; sem Ctrl also deletes checkpoint
            const _eDelCp = editorCustomCheckpointsRef.current;
            const _eDelIdx = editorCheckpointIdxRef.current;
            if (_eDelIdx >= 0 && _eDelIdx < _eDelCp.length) {
              // Há checkpoint selecionado → confirmar exclusão (mesmo comportamento do Backspace)
              const _pending = editorCheckpointDeleteConfirmRef.current;
              if (!_pending || _pending.idx !== _eDelIdx || _pending.until < Date.now()) {
                editorCheckpointDeleteConfirmRef.current = { idx: _eDelIdx, until: Date.now() + 3000 };
                editorCopiedMsgRef.current = {
                  text: `⚠ Aperte de novo para excluir ${_eDelCp[_eDelIdx].label}`,
                  until: Date.now() + 3000,
                };
              } else {
                // Segunda pressão dentro do prazo → confirma exclusão
                editorDeleteBoxJustPressed.current = true;
              }
            } else {
              editorDeleteBoxJustPressed.current = true;
            }
            e.preventDefault();
          }
          break;
        case 'Period':
        case 'Numpad6':
          if (down && gsRef.current?.gamePhase === 'editor') {
            const checkpoints = getEditorCheckpoints();
            const next = Math.min(editorCheckpointIdxRef.current + 1, checkpoints.length - 1);
            editorCheckpointIdxRef.current = next;
            editorCamXRef.current = Math.max(0, checkpoints[next].x - CANVAS_W / 2);
          }
          break;
        case 'Comma':
        case 'Numpad4':
          if (down && gsRef.current?.gamePhase === 'editor') {
            const checkpoints = getEditorCheckpoints();
            const prev = Math.max(editorCheckpointIdxRef.current - 1, 0);
            editorCheckpointIdxRef.current = prev;
            editorCamXRef.current = Math.max(0, checkpoints[prev].x - CANVAS_W / 2);
          }
          break;
        case 'Slash':
          if (down && gsRef.current?.gamePhase === 'editor') {
            editorRealStoryJustPressed.current = true;
            e.preventDefault();
          }
          break;
        case 'Backspace':
        case 'Minus':
        case 'NumpadSubtract':
          if (down && gsRef.current?.gamePhase === 'editor') {
            const idx = editorCheckpointIdxRef.current;
            const cps = editorCustomCheckpointsRef.current;
            if (idx < 0 || idx >= cps.length) {
              editorCopiedMsgRef.current = {
                text: '⚠ Selecione um CP antes de excluir',
                until: Date.now() + 2500,
              };
              break;
            }
            const pending = editorCheckpointDeleteConfirmRef.current;
            if (!pending || pending.idx !== idx || pending.until < Date.now()) {
              editorCheckpointDeleteConfirmRef.current = { idx, until: Date.now() + 3000 };
              editorCopiedMsgRef.current = {
                text: `⚠ Aperte de novo para excluir ${cps[idx].label}`,
                until: Date.now() + 3000,
              };
              e.preventDefault();
              break;
            }
            editorCheckpointDeleteConfirmRef.current = null;
            const removedLabel = cps[idx].label;
            const merged = cps.filter((_, i) => i !== idx);
            merged.forEach((cp, i) => { cp.label = `CP${i + 1}`; });
            editorCustomCheckpointsRef.current = merged;
            editorCheckpointIdxRef.current = -1;
            fetch('/__editor/save-level-patch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ checkpoints: editorCustomCheckpointsRef.current }),
            }).then(() => {
              editorCopiedMsgRef.current = {
                text: `✓ ${removedLabel} REMOVIDO (restaram ${merged.length})`,
                until: Date.now() + 3000,
              };
            }).catch(() => {
              editorCopiedMsgRef.current = {
                text: `⚠ ${removedLabel} removido localmente (erro ao salvar)`,
                until: Date.now() + 3000,
              };
            });
            e.preventDefault();
          }
          break;
        case 'Enter':
          if (down) enterJustPressed.current = true;
          break;
        case 'Escape':
          if (down) escJustPressed.current = true;
          break;
      }
      // Prevent scroll on space/arrows
      if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ControlLeft','ControlRight','Tab'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const kd = (e: KeyboardEvent) => { initAudio(); onKey(e, true); };
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const EDITOR_GROUND_Y = 410;
    const HANDLE_R = 8; // px hit radius for handles

    const platCoordText = (p: Platform) => {
      const gy = Math.round(p.y - EDITOR_GROUND_Y);
      const crop = (p.cropLeft || p.cropTop || p.cropRight || p.cropBottom)
        ? `  crop:${Math.round(p.cropLeft ?? 0)},${Math.round(p.cropTop ?? 0)},${Math.round(p.cropRight ?? 0)},${Math.round(p.cropBottom ?? 0)}`
        : '';
      const rot = Math.round(p.rotation ?? 0);
      const rotText = rot !== 0 ? `  rot:${rot}°` : '';
      const imgTag = p.type === 'sprite' && p.customSpriteName ? `  img:${p.customSpriteName}` : '';
      return `x:${Math.round(p.x)}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${Math.round(p.w)}  h:${Math.round(p.h)}${rotText}  [${p.type}]${imgTag}${getPlatformCollisionSummary(p)}${crop}`;
    };

    const copyPlatText = (text: string, msg: string) => {
      const execFallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch { /* silencioso */ }
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(execFallback);
      } else {
        execFallback();
      }
      editorCopiedMsgRef.current = { text: msg, until: Date.now() + 3000 };
    };

    const getEditorWorldCoords = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      editorMouseCanvasRef.current = { x: cx, y: cy };
      return { wx: cx + editorCamXRef.current, wy: cy + editorCamYRef.current };
    };

    const hitHandle = (wx: number, wy: number, hx: number, hy: number) =>
      Math.abs(wx - hx) <= HANDLE_R && Math.abs(wy - hy) <= HANDLE_R;

    const getPlatformEditRect = (p: Platform) => {
      const cropLeft = Math.max(0, Math.min(p.cropLeft ?? 0, p.w - 6));
      const cropRight = Math.max(0, Math.min(p.cropRight ?? 0, p.w - cropLeft - 6));
      const cropTop = Math.max(0, Math.min(p.cropTop ?? 0, p.h - 6));
      const cropBottom = Math.max(0, Math.min(p.cropBottom ?? 0, p.h - cropTop - 6));
      return {
        x: p.x + cropLeft,
        y: p.y + cropTop,
        w: Math.max(6, p.w - cropLeft - cropRight),
        h: Math.max(6, p.h - cropTop - cropBottom),
      };
    };

    const snapEditorPlatform = (platform: Platform, platformIdx: number, ignoredIndices: Set<number> = new Set(), snapXOverride?: number, snapYOverride?: number) => {
      const SNAP_X = snapXOverride ?? 30;
      const UNSNAP_X = snapXOverride ? snapXOverride * 2 : 52;
      const SNAP_Y = snapYOverride ?? 40;
      const UNSNAP_Y = snapYOverride ? snapYOverride * 2 : 64;
      const PROXIMITY = 220;
      const snapState = editorSnapStateRef.current;
      const threshX = snapState.x ? UNSNAP_X : SNAP_X;
      const threshY = snapState.y ? UNSNAP_Y : SNAP_Y;
      const movingHit = getPlatformCollisionRect(platform);
      const movingVisual = { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
      const movingCenterX = movingHit.x + movingHit.w / 2;
      const movingCenterY = movingHit.y + movingHit.h / 2;
      let bestDx = 0;
      let bestDy = 0;
      let bestAbsX = threshX + 1;
      let bestAbsY = threshY + 1;
      let snapWorldX: number | null = null;
      let snapWorldY: number | null = null;

      const considerX = (from: number, to: number) => {
        const delta = to - from;
        if (delta === 0) return;
        const abs = Math.abs(delta);
        if (abs <= threshX && abs < bestAbsX) {
          bestAbsX = abs;
          bestDx = delta;
          snapWorldX = to;
        }
      };

      const considerY = (from: number, to: number) => {
        const delta = to - from;
        if (delta === 0) return;
        const abs = Math.abs(delta);
        if (abs <= threshY && abs < bestAbsY) {
          bestAbsY = abs;
          bestDy = delta;
          snapWorldY = to;
        }
      };

      considerY(movingHit.y + movingHit.h, EDITOR_GROUND_Y);
      considerY(movingVisual.y + movingVisual.h, EDITOR_GROUND_Y);

      platformsRef.current.forEach((target, targetIdx) => {
        if (ignoredIndices.has(targetIdx)) return;
        if (targetIdx === platformIdx || target.type === 'ground') return;
        // Filtro de proximidade: ignora plataformas muito distantes
        const proxDx = Math.max(0, target.x > movingVisual.x + movingVisual.w ? target.x - (movingVisual.x + movingVisual.w) : movingVisual.x > target.x + target.w ? movingVisual.x - (target.x + target.w) : 0);
        const proxDy = Math.max(0, target.y > movingVisual.y + movingVisual.h ? target.y - (movingVisual.y + movingVisual.h) : movingVisual.y > target.y + target.h ? movingVisual.y - (target.y + target.h) : 0);
        if (proxDx > PROXIMITY || proxDy > PROXIMITY) return;
        const targetRects = getPlatformCollisionRects(target);
        const targetVisual = { x: target.x, y: target.y, w: target.w, h: target.h };
        const targetVisualCenterX = target.x + target.w / 2;
        const targetVisualCenterY = target.y + target.h / 2;

        considerX(movingVisual.x, targetVisual.x);
        considerX(movingVisual.x + movingVisual.w, targetVisual.x + targetVisual.w);
        considerX(movingCenterX, targetVisualCenterX);
        considerX(movingVisual.x, targetVisual.x + targetVisual.w);
        considerX(movingVisual.x + movingVisual.w, targetVisual.x);

        considerY(movingVisual.y, targetVisual.y);
        considerY(movingVisual.y + movingVisual.h, targetVisual.y + targetVisual.h);
        considerY(movingCenterY, targetVisualCenterY);
        considerY(movingVisual.y, targetVisual.y + targetVisual.h);
        considerY(movingVisual.y + movingVisual.h, targetVisual.y);

        targetRects.forEach((targetHit) => {
          const targetCenterX = targetHit.x + targetHit.w / 2;
          const targetCenterY = targetHit.y + targetHit.h / 2;

          considerX(movingHit.x, targetHit.x);
          considerX(movingHit.x + movingHit.w, targetHit.x + targetHit.w);
          considerX(movingCenterX, targetCenterX);
          considerX(movingHit.x, targetHit.x + targetHit.w);
          considerX(movingHit.x + movingHit.w, targetHit.x);

          considerY(movingHit.y, targetHit.y);
          considerY(movingHit.y + movingHit.h, targetHit.y + targetHit.h);
          considerY(movingCenterY, targetCenterY);
          considerY(movingHit.y, targetHit.y + targetHit.h);
          considerY(movingHit.y + movingHit.h, targetHit.y);
        });
      });

      if (bestDx !== 0) platform.x = Math.round(platform.x + bestDx);
      if (bestDy !== 0) platform.y = Math.round(platform.y + bestDy);
      platform.y = Math.round(Math.min(platform.y, EDITOR_GROUND_Y - getPlatformGroundClampOffset(platform)));
      platform.y = Math.max(-4000, platform.y);

      snapState.x = bestDx !== 0;
      snapState.y = bestDy !== 0;
      editorSnapAxesRef.current.worldX = bestDx !== 0 ? snapWorldX : null;
      editorSnapAxesRef.current.worldY = bestDy !== 0 ? snapWorldY : null;
    };

    const makeEditorDrag = (p: Platform, mode: EditorDrag['mode'], wx: number, wy: number, origText: string, editingCrop = false): EditorDrag => {
      const hits = getPlatformCollisionRects(p);
      const hit = editorCollisionModeRef.current
        ? hits[Math.max(0, Math.min(editorCollisionBoxIdxRef.current, hits.length - 1))] ?? getPlatformCollisionRect(p)
        : getPlatformCollisionRect(p);
      const editRect = getPlatformEditRect(p);
      const rotationCenterX = editRect.x + editRect.w / 2;
      const rotationCenterY = editRect.y + editRect.h / 2;
      return {
        mode,
        editingCollision: editorCollisionModeRef.current,
        editingCrop,
        startWX: wx,
        startWY: wy,
        origX: p.x,
        origY: p.y,
        origW: p.w,
        origH: p.h,
        origCropLeft: p.cropLeft ?? 0,
        origCropTop: p.cropTop ?? 0,
        origCropRight: p.cropRight ?? 0,
        origCropBottom: p.cropBottom ?? 0,
        origCollisionOffsetX: hit.x - p.x,
        origCollisionOffsetY: hit.y - p.y,
        origCollisionW: hit.w,
        origCollisionH: hit.h,
        origCollisionBoxes: (p.collisionBoxes ?? []).map((box) => ({
          ...box,
          slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined,
        })),
        hadCustomCollision: hasCustomPlatformCollision(p),
        origText,
        hasMoved: false,
        origGroupPositions: [],
        origSlopeLeft: (hit as any).slopeTop?.left ?? 0,
        origSlopeRight: (hit as any).slopeTop?.right ?? 0,
        origRotation: p.rotation ?? 0,
        startAngle: Math.atan2(wy - rotationCenterY, wx - rotationCenterX),
        rotationCenterX,
        rotationCenterY,
      };
    };

    const snapshotPlatforms = (): Platform[] =>
      platformsRef.current.map(p => ({
        ...p,
        collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
          ...b,
          slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
        })) : undefined,
      })) as Platform[];

    const clonePlatformSnapshot = (snapshot: Platform[]): Platform[] =>
      snapshot.map(p => ({
        ...p,
        collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
          ...b,
          slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
        })) : undefined,
      })) as Platform[];

    const pushEditorHistory = () => {
      editorUndoStackRef.current.push(snapshotPlatforms());
      if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
      editorRedoStackRef.current = [];
    };

    const deleteEditorSelectedObjects = (): number => {
      const platforms = platformsRef.current;
      const selIdx = editorSelectedIdxRef.current;
      const selectedGroup = Array.from(editorSelectedIndicesRef.current)
        .filter((idx) => idx >= 0 && idx < platforms.length && platforms[idx].type !== 'ground');
      const deleteIndices = (selectedGroup.includes(selIdx) && selectedGroup.length > 0 ? selectedGroup : [selIdx])
        .filter((idx) => idx >= 0 && idx < platforms.length && platforms[idx].type !== 'ground')
        .sort((a, b) => b - a);

      if (deleteIndices.length === 0) return 0;

      pushEditorHistory();
      deleteIndices.forEach((idx) => {
        deletedPlatformKeysRef.current.add(getPlatformKey(platforms[idx]));
        platforms.splice(idx, 1);
      });
      saveDeletedPlatformKeys(deletedPlatformKeysRef.current);
      saveSprites(platforms);
      // Cria nova referência de array para que a comparação do spatialGrid
      // detecte a mudança e reconstrua a grade no próximo frame — sem isso,
      // objetos deletados continuam visíveis e com colisão até o próximo reload.
      platformsRef.current = platforms.slice();
      if (gsRef.current) gsRef.current.platforms = platformsRef.current;
      editorSelectedIdxRef.current = -1;
      editorSelectedIndicesRef.current = new Set();
      editorCollisionModeRef.current = false;
      editorCollisionBoxIdxRef.current = 0;
      editorDragRef.current = null;
      editorMarqueeRef.current = null;
      markEditorDirty();
      editorCopiedMsgRef.current = {
        text: deleteIndices.length === 1
          ? '× OBJETO DELETADO (Ctrl+Z para desfazer)'
          : `× ${deleteIndices.length} OBJETOS DELETADOS (Ctrl+Z para desfazer)`,
        until: Date.now() + 2500,
      };
      return deleteIndices.length;
    };

    const nudgeEditorSelectedHitbox = (dx: number, dy: number): boolean => {
      const p = platformsRef.current[editorSelectedIdxRef.current];
      if (!p || p.type === 'ground' || !editorCollisionModeRef.current) return false;
      pushEditorHistory();
      const box = ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
      box.x = Math.round(box.x + dx);
      box.y = Math.round(box.y + dy);
      clampPlatformCollisionOverrides(p);
      copyPlatText(platCoordText(p), `✓ HITBOX MOVIDA: ${dx === 0 ? '' : dx > 0 ? '→' : '←'}${dy === 0 ? '' : dy > 0 ? '↓' : '↑'}`);
      return true;
    };

    const applyEditorSnapshot = (snapshot: Platform[]) => {
      platformsRef.current = snapshot;
      if (gsRef.current) gsRef.current.platforms = snapshot;
      saveSprites(snapshot);
      editorSelectedIdxRef.current = -1;
      editorSelectedIndicesRef.current = new Set();
      editorDragRef.current = null;
      editorPendingHistoryRef.current = null;
    };

    const editorUndo = () => {
      if (editorUndoStackRef.current.length === 0) return;
      editorRedoStackRef.current.push(snapshotPlatforms());
      applyEditorSnapshot(editorUndoStackRef.current.pop()!);
    };

    const editorRedo = () => {
      if (editorRedoStackRef.current.length === 0) return;
      editorUndoStackRef.current.push(snapshotPlatforms());
      applyEditorSnapshot(editorRedoStackRef.current.pop()!);
    };

    const resetEditorTestSnapshot = () => {
      const snapshot = editorTestSnapshotRef.current;
      if (!snapshot || !gsRef.current) return false;
      const restored = clonePlatformSnapshot(snapshot);
      platformsRef.current = restored;
      gsRef.current.platforms = restored;
      gsRef.current.destroyedBoxIndices = [];
      gsRef.current.fallingBoxes = [];
      gsRef.current.flyingTires = [];
      gsRef.current.destroyedTireIndices = [];
      gsRef.current.bullets = [];
      gsRef.current.particles = [];
      gsRef.current.bystanders = applyNpcVolumes(makeInitialBystanders());
      editorSelectedIdxRef.current = -1;
      editorSelectedIndicesRef.current = new Set();
      editorCollisionModeRef.current = false;
      editorCollisionBoxIdxRef.current = 0;
      editorDragRef.current = null;
      editorMarqueeRef.current = null;
      editorPendingHistoryRef.current = null;
      editorCopiedMsgRef.current = {
        text: '↺ TESTE RESETADO — caixas e NPCs restaurados',
        until: Date.now() + 2800,
      };
      return true;
    };

    const onCanvasMouseMove = (e: MouseEvent) => {
      const gs = gsRef.current;
      if (!gs || gs.gamePhase !== 'editor') return;
      const coords = getEditorWorldCoords(e);
      if (!coords) return;
      const { wx, wy } = coords;
      editorMouseWorldRef.current = { x: wx, y: wy };

      if (musicVolumeDragRef.current) {
        const screenX = wx - editorCamXRef.current;
        const volRect = getMusicVolumeSliderRect();
        const frac = Math.min(1, Math.max(0, (screenX - volRect.trackX) / volRect.trackW));
        musicVolumeRef.current = frac;
        setMusicVolume(frac);
        return;
      }

      // Drag da barra de volume de categoria SFX
      if (sfxCategoryVolumeDragRef.current) {
        const { category, trackX, trackW } = sfxCategoryVolumeDragRef.current;
        const screenX = wx - editorCamXRef.current;
        const frac = Math.min(1, Math.max(0, (screenX - trackX) / trackW));
        const rounded = Math.round(frac * 100) / 100;
        if (category === 'horacio') {
          horacioVolumeRef.current = rounded;
          npcVolumesRef.current[-1] = rounded;
          try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
          persistNpcVolumes(npcVolumesRef.current);
        } else {
          sfxCategoryVolumesRef.current[category] = rounded;
          try { localStorage.setItem(`pursuit_sfx_vol_${category}`, String(rounded)); } catch { /* ignore */ }
          persistSfxCategoryVolumes(sfxCategoryVolumesRef.current);
        }
        return;
      }

      // Drag do volume do Horácio
      if (horacioVolumeDragRef.current) {
        const { trackX, trackW } = horacioVolumeDragRef.current;
        const screenX = wx - editorCamXRef.current;
        const frac = Math.min(1, Math.max(0, (screenX - trackX) / trackW));
        const rounded = Math.round(frac * 100) / 100;
        horacioVolumeRef.current = rounded;
        npcVolumesRef.current[-1] = rounded;
        try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
        persistNpcVolumes(npcVolumesRef.current);
        return;
      }

      // Drag do volume individual de NPC
      if (npcVolumeDragRef.current) {
        const { bystander, index, trackX, trackW } = npcVolumeDragRef.current;
        const screenX = wx - editorCamXRef.current;
        const frac = Math.min(1, Math.max(0, (screenX - trackX) / trackW));
        const rounded = Math.round(frac * 100) / 100;
        bystander.sfxVolume = rounded;
        npcVolumesRef.current[index] = rounded;
        try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
        persistNpcVolumes(npcVolumesRef.current);
        return;
      }

      // Player pose drag (resize de QUALQUER pose do Horácio)
      const pDrag = editorPlayerSpriteDragRef.current;
      if (pDrag && pDrag.target) {
        const ddx = wx - pDrag.startWX;
        const ddy = wy - pDrag.startWY;
        const MIN_SIZE = 20;
        const key = pDrag.target;
        const cur = poseDisplayOverridesRef.current[key];
        if (pDrag.mode === 'move') {
          poseDisplayOverridesRef.current[key] = { ...cur, ox: Math.round(pDrag.origOX + ddx), oy: Math.round(pDrag.origOY + ddy) };
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        } else if (pDrag.mode === 'resize-right') {
          poseDisplayOverridesRef.current[key] = { ...cur, dw: Math.max(MIN_SIZE, Math.round(pDrag.origDW + ddx)) };
        } else if (pDrag.mode === 'resize-left') {
          poseDisplayOverridesRef.current[key] = { ...cur, dw: Math.max(MIN_SIZE, Math.round(pDrag.origDW - ddx)) };
        } else if (pDrag.mode === 'resize-top') {
          poseDisplayOverridesRef.current[key] = { ...cur, dh: Math.max(MIN_SIZE, Math.round(pDrag.origDH - ddy)) };
        } else if (pDrag.mode === 'resize-bottom') {
          poseDisplayOverridesRef.current[key] = { ...cur, dh: Math.max(MIN_SIZE, Math.round(pDrag.origDH + ddy)) };
        } else if (pDrag.mode === 'resize-corner') {
          // Escala uniforme (proporção travada): calcula delta pelo eixo diagonal do canto
          const signX = pDrag.cornerSignX ?? 1;
          const signY = pDrag.cornerSignY ?? -1;
          const delta = (signX * ddx + signY * ddy) / 2;
          const scale = Math.max(0.05, (pDrag.origDW + delta) / pDrag.origDW);
          poseDisplayOverridesRef.current[key] = {
            ...cur,
            dw: Math.max(MIN_SIZE, Math.round(pDrag.origDW * scale)),
            dh: Math.max(MIN_SIZE, Math.round(pDrag.origDH * scale)),
          };
        }
        return;
      }

      // Cursor 'grab' quando hover sobre o corpo da pose selecionada
      {
        const selKey = editorAttachedSpriteSelectedRef.current;
        const g = lastPlayerGeomRef.current;
        if (selKey && g && g.poseKey === selKey && canvasRef.current) {
          const pcx = wx - editorCamXRef.current;
          const pcy = wy - editorCamYRef.current;
          const overBody = pcx >= g.destX && pcx <= g.destX + g.dw && pcy >= g.destY && pcy <= g.destY + g.dh;
          canvasRef.current.style.cursor = overBody ? 'grab' : '';
        }
      }

      const drag = editorDragRef.current;
      if (drag) {
        const dx = wx - drag.startWX;
        const dy = wy - drag.startWY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.hasMoved = true;
        const p = platformsRef.current[editorSelectedIdxRef.current];
        if (p) {
          if (drag.editingCrop) {
            const minVisible = 6;
            const clampCrop = () => {
              p.cropLeft = Math.round(Math.max(0, Math.min(p.cropLeft ?? 0, p.w - (p.cropRight ?? 0) - minVisible)));
              p.cropRight = Math.round(Math.max(0, Math.min(p.cropRight ?? 0, p.w - (p.cropLeft ?? 0) - minVisible)));
              p.cropTop = Math.round(Math.max(0, Math.min(p.cropTop ?? 0, p.h - (p.cropBottom ?? 0) - minVisible)));
              p.cropBottom = Math.round(Math.max(0, Math.min(p.cropBottom ?? 0, p.h - (p.cropTop ?? 0) - minVisible)));
            };
            if (drag.mode === 'resize-left') {
              p.cropLeft = drag.origCropLeft + dx;
            } else if (drag.mode === 'resize-right') {
              p.cropRight = drag.origCropRight - dx;
            } else if (drag.mode === 'resize-top') {
              p.cropTop = drag.origCropTop + dy;
            } else if (drag.mode === 'resize-bottom') {
              p.cropBottom = drag.origCropBottom - dy;
            } else if (drag.mode === 'resize-corner') {
              p.cropRight = drag.origCropRight - dx;
              p.cropTop = drag.origCropTop + dy;
            }
            clampCrop();
          } else if (drag.editingCollision) {
            const box = ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            const maxCollisionBottom = getPlatformCollisionMaxBottom(p);
            const freeHitbox = !!p.freeHitbox;
            if (drag.mode === 'move') {
              box.x = freeHitbox
                ? Math.round(drag.origCollisionOffsetX + dx)
                : Math.round(Math.max(0, Math.min(drag.origCollisionOffsetX + dx, p.w - drag.origCollisionW)));
              box.y = freeHitbox
                ? Math.round(drag.origCollisionOffsetY + dy)
                : Math.round(Math.max(0, Math.min(drag.origCollisionOffsetY + dy, maxCollisionBottom - drag.origCollisionH)));
            } else if (drag.mode === 'resize-right') {
              box.w = freeHitbox
                ? Math.round(Math.max(6, drag.origCollisionW + dx))
                : Math.round(Math.max(6, Math.min(drag.origCollisionW + dx, p.w - drag.origCollisionOffsetX)));
            } else if (drag.mode === 'resize-left') {
              const maxW = freeHitbox ? Infinity : drag.origCollisionOffsetX + drag.origCollisionW;
              const newW = Math.round(Math.max(6, Math.min(drag.origCollisionW - dx, maxW)));
              box.x = Math.round(drag.origCollisionOffsetX + drag.origCollisionW - newW);
              box.w = newW;
            } else if (drag.mode === 'resize-top') {
              const maxH = freeHitbox ? Infinity : drag.origCollisionOffsetY + drag.origCollisionH;
              const newH = Math.round(Math.max(6, Math.min(drag.origCollisionH - dy, maxH)));
              box.y = Math.round(drag.origCollisionOffsetY + drag.origCollisionH - newH);
              box.h = newH;
            } else if (drag.mode === 'resize-bottom') {
              box.h = freeHitbox
                ? Math.round(Math.max(6, drag.origCollisionH + dy))
                : Math.round(Math.max(6, Math.min(drag.origCollisionH + dy, maxCollisionBottom - drag.origCollisionOffsetY)));
            } else if (drag.mode === 'resize-corner') {
              const scale = Math.max(0.05, (drag.origCollisionW + dx) / drag.origCollisionW);
              box.w = freeHitbox
                ? Math.round(Math.max(6, drag.origCollisionW * scale))
                : Math.round(Math.max(6, Math.min(drag.origCollisionW * scale, p.w - drag.origCollisionOffsetX)));
              box.h = freeHitbox
                ? Math.round(Math.max(6, drag.origCollisionH * scale))
                : Math.round(Math.max(6, Math.min(drag.origCollisionH * scale, maxCollisionBottom - drag.origCollisionOffsetY)));
            } else if (drag.mode === 'slope-left') {
              if (!box.slopeTop) box.slopeTop = { left: 0, right: 0 };
              box.slopeTop.left = Math.max(0, Math.min(box.h, drag.origSlopeLeft + dy));
            } else if (drag.mode === 'slope-right') {
              if (!box.slopeTop) box.slopeTop = { left: 0, right: 0 };
              box.slopeTop.right = Math.max(0, Math.min(box.h, drag.origSlopeRight + dy));
            }
            clampPlatformCollisionOverrides(p);
          } else if (drag.mode === 'rotate') {
            const angle = Math.atan2(wy - drag.rotationCenterY, wx - drag.rotationCenterX);
            const deltaDeg = (angle - drag.startAngle) * 180 / Math.PI;
            let nextRotation = drag.origRotation + deltaDeg;
            if (e.shiftKey) nextRotation = Math.round(nextRotation / 15) * 15;
            nextRotation = ((nextRotation % 360) + 360) % 360;
            if (nextRotation > 180) nextRotation -= 360;
            p.rotation = Math.round(nextRotation);
            if (Math.abs(p.rotation) < 1) delete p.rotation;
          } else if (drag.mode === 'move') {
            if (drag.origGroupPositions.length > 0) {
              const groupEntries = [
                { idx: editorSelectedIdxRef.current, origX: drag.origX, origY: drag.origY },
                ...drag.origGroupPositions,
              ].filter(({ idx }) => idx >= 0 && idx < platformsRef.current.length && platformsRef.current[idx]?.type !== 'ground');
              const ignored = new Set(groupEntries.map(({ idx }) => idx));
              const requestedDx = Math.round(dx);
              let requestedDy = Math.round(dy);
              const maxDy = Math.min(...groupEntries.map(({ idx, origY }) => {
                const gp = platformsRef.current[idx];
                return gp ? EDITOR_GROUND_Y - getPlatformGroundClampOffset(gp) - origY : requestedDy;
              }));
              const minDy = Math.max(...groupEntries.map(({ origY }) => -4000 - origY));
              requestedDy = Math.max(minDy, Math.min(requestedDy, maxDy));
              groupEntries.forEach(({ idx, origX, origY }) => {
                const gp = platformsRef.current[idx];
                if (!gp) return;
                gp.x = Math.round(origX + requestedDx);
                if (gp.type !== 'pothole') gp.y = Math.round(origY + requestedDy);
              });
              const groupBasePositions = groupEntries.map(({ idx }) => {
                const gp = platformsRef.current[idx];
                return { idx, x: gp?.x ?? 0, y: gp?.y ?? 0 };
              });

              // Testa snap em TODOS os membros do grupo e pega o melhor delta em cada eixo.
              // considerX/Y ignoram delta=0 (já alinhado), evitando que alinhar perfeitamente
              // bloqueie snaps legítimos de outros membros ou alvos nessa mesma chamada.
              let bestSnapDx = 0;
              let bestSnapDy = 0;
              let bestAbsDx = Infinity;
              let bestAbsDy = Infinity;
              let bestWorldX: number | null = null;
              let bestWorldY: number | null = null;
              for (const { idx } of groupBasePositions) {
                const gp = platformsRef.current[idx];
                if (!gp) continue;
                // Grupos sempre usam o threshold maior (UNSNAP) para evitar que o snap
                // trave em 0 após soltar: sem isso, grupos ficam no limbo entre SNAP e UNSNAP.
                editorSnapStateRef.current.x = true;
                editorSnapStateRef.current.y = true;
                const preX = gp.x;
                const preY = gp.y;
                snapEditorPlatform(gp, idx, ignored);
                const mdx = gp.x - preX;
                const mdy = gp.y - preY;
                gp.x = preX;
                gp.y = preY;
                if (mdx !== 0 && Math.abs(mdx) < bestAbsDx) {
                  bestAbsDx = Math.abs(mdx);
                  bestSnapDx = mdx;
                  bestWorldX = editorSnapAxesRef.current.worldX;
                }
                if (mdy !== 0 && Math.abs(mdy) < bestAbsDy) {
                  bestAbsDy = Math.abs(mdy);
                  bestSnapDy = mdy;
                  bestWorldY = editorSnapAxesRef.current.worldY;
                }
              }

              editorSnapStateRef.current.x = bestSnapDx !== 0;
              editorSnapStateRef.current.y = bestSnapDy !== 0;
              editorSnapAxesRef.current.worldX = bestWorldX;
              editorSnapAxesRef.current.worldY = bestWorldY;
              const snapDx = bestSnapDx;
              let snapDy = bestSnapDy;
              if (snapDx !== 0 || snapDy !== 0) {
                const maxSnapDy = Math.min(...groupBasePositions.map(({ idx, y }) => {
                  const gp = platformsRef.current[idx];
                  return gp ? EDITOR_GROUND_Y - getPlatformGroundClampOffset(gp) - y : snapDy;
                }));
                const minSnapDy = Math.max(...groupBasePositions.map(({ y }) => -4000 - y));
                snapDy = Math.max(minSnapDy, Math.min(snapDy, maxSnapDy));
                groupBasePositions.forEach(({ idx, x, y }) => {
                  const gp = platformsRef.current[idx];
                  if (!gp) return;
                  gp.x = Math.round(x + snapDx);
                  if (gp.type !== 'pothole') gp.y = Math.round(y + snapDy);
                });
              }
            } else {
              p.x = Math.round(drag.origX + dx);
              if (p.type === 'pothole') {
                // potholes só movem horizontalmente — Y permanentemente fixo em GROUND_Y
                p.y = EDITOR_GROUND_Y;
                snapEditorPlatform(p, editorSelectedIdxRef.current);
                p.y = EDITOR_GROUND_Y; // restaura após snap (que pode ter alterado Y)
              } else {
                p.y = Math.round(Math.min(drag.origY + dy, EDITOR_GROUND_Y - getPlatformGroundClampOffset(p)));
                p.y = Math.max(-4000, p.y);
                snapEditorPlatform(p, editorSelectedIdxRef.current);
              }
            }
          } else if (drag.mode === 'resize-right') {
            p.w = Math.round(Math.max(10, drag.origW + dx));
            if (drag.hadCustomCollision) {
              if (drag.origCollisionBoxes.length > 0) {
                p.collisionBoxes = drag.origCollisionBoxes.map((box) => ({
                  x: Math.round(box.x * (p.w / drag.origW)),
                  y: box.y,
                  w: Math.round(box.w * (p.w / drag.origW)),
                  h: box.h,
                  slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined,
                }));
                clampPlatformCollisionOverrides(p);
              } else {
                p.collisionOffsetX = Math.round(drag.origCollisionOffsetX * (p.w / drag.origW));
                p.collisionOffsetY = Math.round(drag.origCollisionOffsetY);
                p.collisionW = Math.round(drag.origCollisionW * (p.w / drag.origW));
                p.collisionH = Math.round(drag.origCollisionH);
                clampPlatformCollisionOverrides(p);
              }
            }
          } else if (drag.mode === 'resize-left') {
            const newW = Math.round(Math.max(10, drag.origW - dx));
            p.x = Math.round(drag.origX + drag.origW - newW);
            p.w = newW;
            if (drag.hadCustomCollision) {
              if (drag.origCollisionBoxes.length > 0) {
                p.collisionBoxes = drag.origCollisionBoxes.map((box) => ({
                  x: Math.round(box.x * (p.w / drag.origW)),
                  y: box.y,
                  w: Math.round(box.w * (p.w / drag.origW)),
                  h: box.h,
                  slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined,
                }));
                clampPlatformCollisionOverrides(p);
              } else {
                p.collisionOffsetX = Math.round(drag.origCollisionOffsetX * (p.w / drag.origW));
                p.collisionOffsetY = Math.round(drag.origCollisionOffsetY);
                p.collisionW = Math.round(drag.origCollisionW * (p.w / drag.origW));
                p.collisionH = Math.round(drag.origCollisionH);
                clampPlatformCollisionOverrides(p);
              }
            }
          } else if (drag.mode === 'resize-top') {
            const newH = Math.round(Math.max(10, drag.origH - dy));
            p.y = Math.round(drag.origY + drag.origH - newH);
            p.h = newH;
            if (drag.hadCustomCollision) {
              if (drag.origCollisionBoxes.length > 0) {
                p.collisionBoxes = drag.origCollisionBoxes.map((box) => ({
                  x: box.x,
                  y: Math.round(box.y * (p.h / drag.origH)),
                  w: box.w,
                  h: Math.round(box.h * (p.h / drag.origH)),
                  slopeTop: box.slopeTop ? {
                    left: Math.round(box.slopeTop.left * (p.h / drag.origH)),
                    right: Math.round(box.slopeTop.right * (p.h / drag.origH)),
                  } : undefined,
                }));
                clampPlatformCollisionOverrides(p);
              } else {
                p.collisionOffsetX = Math.round(drag.origCollisionOffsetX);
                p.collisionOffsetY = Math.round(drag.origCollisionOffsetY * (p.h / drag.origH));
                p.collisionW = Math.round(drag.origCollisionW);
                p.collisionH = Math.round(drag.origCollisionH * (p.h / drag.origH));
                clampPlatformCollisionOverrides(p);
              }
            }
          } else if (drag.mode === 'resize-bottom') {
            p.h = Math.round(Math.max(10, drag.origH + dy));
            if (drag.hadCustomCollision) {
              if (drag.origCollisionBoxes.length > 0) {
                p.collisionBoxes = drag.origCollisionBoxes.map((box) => ({
                  x: box.x,
                  y: Math.round(box.y * (p.h / drag.origH)),
                  w: box.w,
                  h: Math.round(box.h * (p.h / drag.origH)),
                  slopeTop: box.slopeTop ? {
                    left: Math.round(box.slopeTop.left * (p.h / drag.origH)),
                    right: Math.round(box.slopeTop.right * (p.h / drag.origH)),
                  } : undefined,
                }));
                clampPlatformCollisionOverrides(p);
              } else {
                p.collisionOffsetX = Math.round(drag.origCollisionOffsetX);
                p.collisionOffsetY = Math.round(drag.origCollisionOffsetY * (p.h / drag.origH));
                p.collisionW = Math.round(drag.origCollisionW);
                p.collisionH = Math.round(drag.origCollisionH * (p.h / drag.origH));
                clampPlatformCollisionOverrides(p);
              }
            }
          } else if (drag.mode === 'resize-corner') {
            const scale = Math.max(0.05, (drag.origW + dx) / drag.origW);
            const newW = Math.round(Math.max(10, drag.origW * scale));
            const newH = Math.round(Math.max(10, drag.origH * scale));
            p.w = newW;
            p.h = newH;
            p.y = Math.round(drag.origY + drag.origH - newH);
            if (drag.hadCustomCollision) {
              if (drag.origCollisionBoxes.length > 0) {
                p.collisionBoxes = drag.origCollisionBoxes.map((box) => ({
                  x: Math.round(box.x * (p.w / drag.origW)),
                  y: Math.round(box.y * (p.h / drag.origH)),
                  w: Math.round(box.w * (p.w / drag.origW)),
                  h: Math.round(box.h * (p.h / drag.origH)),
                  slopeTop: box.slopeTop ? {
                    left: Math.round(box.slopeTop.left * (p.h / drag.origH)),
                    right: Math.round(box.slopeTop.right * (p.h / drag.origH)),
                  } : undefined,
                }));
                clampPlatformCollisionOverrides(p);
              } else {
                p.collisionOffsetX = Math.round(drag.origCollisionOffsetX * (p.w / drag.origW));
                p.collisionOffsetY = Math.round(drag.origCollisionOffsetY * (p.h / drag.origH));
                p.collisionW = Math.round(drag.origCollisionW * (p.w / drag.origW));
                p.collisionH = Math.round(drag.origCollisionH * (p.h / drag.origH));
                clampPlatformCollisionOverrides(p);
              }
            }
          }
        }
        return;
      }

      // Marquee drag tracking
      if (editorMarqueeRef.current) {
        editorMarqueeRef.current.endWX = wx;
        editorMarqueeRef.current.endWY = wy;
        return;
      }

      // Middle-button pan
      {
        let hovIdx = -1;
        for (let _i = platformsRef.current.length - 1; _i >= 0; _i--) {
          const _p = platformsRef.current[_i];
          if (_p.type === 'ground') continue;
          if (isEditorPointInsidePlatform(wx, wy, _p)) { hovIdx = _i; break; }
        }
        editorHoveredIdxRef.current = hovIdx;
      }
    };

    let middleDragging = false;
    let middleLastX = 0;
    let middleLastY = 0;

    const onCanvasMouseDown = (e: MouseEvent) => {
      const gs = gsRef.current;
      if (!gs) return;

        // Cliques no menu inicial (incluindo o submenu de corrida)
      if (gs.gamePhase === 'menu' && e.button === 0 && !showOptionsRef.current) {
        // Inicia trilha do menu (chiptune) na primeira interação do usuário
        if (!menuMutedRef.current) {
          setMusicType('chiptune');
          startBeat();
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
        const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);
        const { storyBtnX, storyBtnY, storyBtnW, storyBtnH, raceBtnX, raceBtnY, raceBtnW, raceBtnH, trainBtnX, trainBtnY, trainBtnW, trainBtnH, optBtnX, optBtnY, optBtnW, optBtnH, gearCx, gearCy, gearR, muteBtnX, muteBtnY, muteBtnW, muteBtnH } = getMenuHitAreas();
        if (raceMenuOpenRef.current) {
          const raceItemY = CANVAS_H / 2 - 38 + raceFocusRef.current * 46;
          const clickedRaceItem = my >= raceItemY - 20 && my <= raceItemY + 12;
          if (clickedRaceItem) {
            if (raceFocusRef.current === 0) {
              raceDroneEnabledRef.current = !raceDroneEnabledRef.current;
            } else if (raceFocusRef.current === 1) {
              raceCheckpointsEnabledRef.current = !raceCheckpointsEnabledRef.current;
            } else if (raceFocusRef.current === 2) {
              raceRoundTargetRef.current = (raceRoundTargetRef.current % 3 + 1) as 1 | 2 | 3;
            } else {
              raceMenuOpenRef.current = false;
              resetGame('race');
            }
          }
          return;
        }
        // Clique no botão mute
        if (mx >= muteBtnX && mx <= muteBtnX + muteBtnW && my >= muteBtnY && my <= muteBtnY + muteBtnH) {
          menuMutedRef.current = !menuMutedRef.current;
          try { localStorage.setItem('pursuit_menu_muted', menuMutedRef.current ? '1' : '0'); } catch (_) {}
          if (menuMutedRef.current) {
            stopBeat();
          } else {
            setMusicType('chiptune');
            startBeat();
          }
          return;
        }
        if (mx >= storyBtnX && mx <= storyBtnX + storyBtnW && my >= storyBtnY && my <= storyBtnY + storyBtnH) {
          resetGame('story');
          return;
        }
        if (mx >= raceBtnX && mx <= raceBtnX + raceBtnW && my >= raceBtnY && my <= raceBtnY + raceBtnH) {
          raceMenuOpenRef.current = true;
          raceFocusRef.current = 0;
          return;
        }
        if (mx >= trainBtnX && mx <= trainBtnX + trainBtnW && my >= trainBtnY && my <= trainBtnY + trainBtnH) {
          trainingJustPressed.current = true;
          return;
        }
        if (mx >= optBtnX && mx <= optBtnX + optBtnW && my >= optBtnY && my <= optBtnY + optBtnH) {
          musicTypeRef.current = getMusicType();
          showOptionsRef.current = true;
          return;
        }
        const dx = mx - gearCx;
        const dy = my - gearCy;
        if (dx * dx + dy * dy <= gearR * gearR) {
          editorJustPressed.current = true;
          return;
        }
      }

      // Botão direito em jogo: spawna Horácio exatamente na posição do clique
      if (gs.gamePhase === 'playing' && e.button === 2) {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const scaleY = CANVAS_H / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const worldX = cx + gs.camera.x;
        const worldY = cy + gs.camera.y;
        gs.player.x = worldX - gs.player.w / 2;
        gs.player.y = worldY - gs.player.h; // pés no ponto clicado
        gs.player.vx = 0;
        gs.player.vy = 0;
        playCamFreeYRef.current = 0; // reanexa câmera ao jogador após spawn
        gs.player.onGround = false;
        gs.player.state = 'jump';
        gs.player.health = gs.player.maxHealth;
        gs.player.invincible = false;
        gs.player.hurtStunTimer = 0;
        return;
      }

      if (gs.gamePhase === 'playing' && editorTestModeRef.current && e.button === 0) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const scaleY = CANVAS_H / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;
        const wx = cx + gs.camera.x;
        const wy = cy + gs.camera.y;
        let idx = -1;
        for (let _i = platformsRef.current.length - 1; _i >= 0; _i--) {
          const _p = platformsRef.current[_i];
          if (_p.type === 'ground') continue;
          if (isEditorPointInsidePlatform(wx, wy, _p)) { idx = _i; break; }
        }
        if (idx >= 0) {
          e.preventDefault();
          editorCamXRef.current = gs.camera.x;
          gs.gamePhase = 'editor';
          gs.camera.x = editorCamXRef.current;
          stopDogAmbient();
          editorSelectedIdxRef.current = idx;
          editorSelectedIndicesRef.current = new Set([idx]);
          editorCollisionModeRef.current = false;
          editorCollisionBoxIdxRef.current = 0;
          editorDragRef.current = null;
          editorMarqueeRef.current = null;
          const p = platformsRef.current[idx];
          copyPlatText(platCoordText(p), `✓ VOLTOU AO EDITOR: ${platCoordText(p)}`);
        }
        return;
      }

      if (gs.gamePhase !== 'editor') return;

      if (e.button === 1) {
        e.preventDefault();
        middleDragging = true;
        middleLastX = e.clientX;
        middleLastY = e.clientY;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;
      const coords = getEditorWorldCoords(e);
      if (!coords) return;
      const { wx, wy } = coords;

      // Undo/Redo/Upload + Chave de exportação (barra topo — screen space)
      const screenX = wx - editorCamXRef.current;   // = cx
      const screenY = wy - editorCamYRef.current;   // = cy
      if (screenY >= 27 && screenY <= 45) {
        const sfxRect = getSfxCategoryVolumeSliderRect();
        if (screenX >= sfxRect.trackX - 10 && screenX <= sfxRect.trackX + sfxRect.trackW + 10) {
          // Determina categoria do objeto selecionado
          let category: string | null = null;
          const _selIdx = editorSelectedIdxRef.current;
          const _selPlat = _selIdx >= 0 ? platformsRef.current[_selIdx] : null;
          if (_selPlat?.type === 'box') category = 'box';
          else if (_selPlat?.type === 'tire' || _selPlat?.type === 'tireHideout') category = 'tire';
          else if (_selPlat?.type === 'obstacle') category = 'obstacle';
          else if (
            _selPlat?.type === 'car' ||
            (_selPlat?.type === 'sprite' && _selPlat?.customSpriteName === 'carro_abandonado_pixelart_1776652992846.png')
          ) category = 'car';
          else if (editorAttachedSpriteSelectedRef.current !== null) category = 'horacio';
          if (category) {
            const frac = Math.min(1, Math.max(0, (screenX - sfxRect.trackX) / sfxRect.trackW));
            const rounded = Math.round(frac * 100) / 100;
            if (category === 'horacio') {
              horacioVolumeRef.current = rounded;
              npcVolumesRef.current[-1] = rounded;
              try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
              persistNpcVolumes(npcVolumesRef.current);
            } else {
              sfxCategoryVolumesRef.current[category] = rounded;
              try { localStorage.setItem(`pursuit_sfx_vol_${category}`, String(rounded)); } catch { /* ignore */ }
              persistSfxCategoryVolumes(sfxCategoryVolumesRef.current);
            }
            sfxCategoryVolumeDragRef.current = { category, trackX: sfxRect.trackX, trackW: sfxRect.trackW };
          }
          return;
        }
      }

      if (screenY >= 5 && screenY <= 23) {
        const volRect = getMusicVolumeSliderRect();
        if (screenX >= volRect.trackX - 10 && screenX <= volRect.trackX + volRect.trackW + 10) {
          musicVolumeDragRef.current = true;
          const frac = Math.min(1, Math.max(0, (screenX - volRect.trackX) / volRect.trackW));
          musicVolumeRef.current = frac;
          setMusicVolume(frac);
          return;
        }
        if (screenX >= 166 && screenX <= 220) { editorUndo(); return; }
        if (screenX >= 224 && screenX <= 278) { editorRedo(); return; }
        if (screenX >= 286 && screenX <= 376) { spriteUploadInputRef.current?.click(); return; }
        if (screenX >= 380 && screenX <= 452) { openGallery(); return; }
        // Botão SALVAR (compacto, 90px, após GALERIA)
        if (screenX >= 456 && screenX <= 546) {
          const baseline = editorBaselineKeysRef.current;
          const currentKeys = new Set(platformsRef.current.map(p => platBaseKey(p)));
          // add: estão no estado atual mas não na baseline
          const addItems = platformsRef.current
            .filter(p => p.type !== 'ground' && !baseline.has(platBaseKey(p)))
            .map(p => {
              const item: {
                t: string;
                x: number;
                y: number;
                w: number;
                h: number;
                r?: number;
                img?: string;
                cw?: number;
                ch?: number;
                cox?: number;
                coy?: number;
                boxes?: Array<{ x: number; y: number; w: number; h: number; sl?: number; sr?: number }>;
              } = {
                t: p.type[0],
                x: p.x,
                y: Math.round(p.y - GROUND_Y),
                w: p.w,
                h: p.h,
              };
              const rot = Math.round(p.rotation ?? 0);
              if (rot !== 0) item.r = rot;
              if (p.type === 'sprite' && p.customSpriteName) item.img = p.customSpriteName;
              if (p.collisionBoxes && p.collisionBoxes.length > 0) {
                item.boxes = getPlatformCollisionBoxes(p).map((box) => ({
                  x: box.x,
                  y: box.y,
                  w: box.w,
                  h: box.h,
                  ...(box.slopeTop ? { sl: box.slopeTop.left, sr: box.slopeTop.right } : {}),
                }));
              } else if (hasCustomPlatformCollision(p)) {
                const hit = getPlatformCollisionRect(p);
                item.cw = Math.round(hit.w);
                item.ch = Math.round(hit.h);
                item.cox = Math.round(hit.x - p.x);
                item.coy = Math.round(hit.y - p.y);
              }
              return item;
            });
          // del: estavam na baseline mas não estão mais no estado atual
          const delItems: Array<{ t: string; x: number; y: number; w: number; h: number }> = [];
          for (const key of baseline) {
            if (!currentKeys.has(key)) {
              const parts = key.split(':');
              if (parts.length >= 5) {
                delItems.push({
                  t: parts[0][0],
                  x: Number(parts[1]),
                  y: Math.round(Number(parts[2]) - GROUND_Y),
                  w: Number(parts[3]),
                  h: Number(parts[4]),
                });
              }
            }
          }
          const total = addItems.length + delItems.length;
          const exportStr = total === 0 ? '{}' : JSON.stringify({ add: addItems, del: delItems });

          // Cancela qualquer auto-save pendente para forçar a persistência agora
          if (editorAutoSaveTimerRef.current !== null) {
            clearTimeout(editorAutoSaveTimerRef.current);
            editorAutoSaveTimerRef.current = null;
          }
          // Salva patch permanente no servidor — sempre executa, mesmo com diff 0
          // (a baseline pode estar fora de sincronia depois de HMR).
          editorCopiedMsgRef.current = { text: '⏳ SALVANDO FASE NO PROJETO...', until: Date.now() + 8000 };
          persistLevelPatch().then((ok) => {
            if (ok) {
              editorCopiedMsgRef.current = {
                text: `✓ FASE SALVA NO PROJETO (${editorSaveStatusMessageRef.current})`,
                until: Date.now() + 4000,
              };
            } else {
              editorCopiedMsgRef.current = {
                text: `⚠ ${editorSaveStatusMessageRef.current || 'erro ao salvar'}`,
                until: Date.now() + 5000,
              };
            }
          });
          if (total > 0) navigator.clipboard.writeText(exportStr).catch(() => {});
          return;
        }
      }

      // ── Linha 2: Checkpoints (Y=27..45) ────────────────────────────────────
      if (screenY >= 27 && screenY <= 45) {
        const cp2BtnX = 8;
        const cp2BtnW = 30;
        const cp2BtnGap = 4;
        const checkpoints = getEditorCheckpoints();
        for (let ci = 0; ci < checkpoints.length; ci++) {
          const btnX = cp2BtnX + ci * (cp2BtnW + cp2BtnGap);
          if (screenX >= btnX && screenX <= btnX + cp2BtnW) {
            editorCheckpointIdxRef.current = ci;
            editorCamXRef.current = Math.max(0, checkpoints[ci].x - CANVAS_W / 2);
            editorCopiedMsgRef.current = {
              text: `✓ ${checkpoints[ci].label} ATIVO — x:${checkpoints[ci].x}`,
              until: Date.now() + 1800,
            };
            e.preventDefault();
            return;
          }
        }
        const addCpBtnX = cp2BtnX + checkpoints.length * (cp2BtnW + cp2BtnGap) + 4;
        if (screenX >= addCpBtnX && screenX <= addCpBtnX + 36) {
          const x = Math.round(editorCamXRef.current + CANVAS_W / 2);
          const merged = [...editorCustomCheckpointsRef.current, { label: '', x }];
          merged.sort((a, b) => a.x - b.x);
          merged.forEach((cp, i) => { cp.label = `CP${i + 1}`; });
          editorCustomCheckpointsRef.current = merged;
          const newIdx = merged.findIndex(cp => cp.x === x);
          editorCheckpointIdxRef.current = newIdx;
          const newLabel = merged[newIdx]?.label ?? `CP${merged.length}`;
          fetch('/__editor/save-level-patch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkpoints: editorCustomCheckpointsRef.current }),
          }).then(() => {
            editorCopiedMsgRef.current = { text: `✓ ${newLabel} SALVO EM x:${x}`, until: Date.now() + 3000 };
          }).catch(() => {
            editorCopiedMsgRef.current = { text: `✓ ${newLabel} CRIADO EM x:${x} (erro ao salvar)`, until: Date.now() + 3000 };
          });
          e.preventDefault();
          return;
        }
        const delCpBtnX = addCpBtnX + 40;
        if (screenX >= delCpBtnX && screenX <= delCpBtnX + 36) {
          const idx = editorCheckpointIdxRef.current;
          const cps = editorCustomCheckpointsRef.current;
          if (idx < 0 || idx >= cps.length) {
            editorCopiedMsgRef.current = { text: '⚠ Selecione um CP antes de excluir', until: Date.now() + 2500 };
            e.preventDefault();
            return;
          }
          const pending = editorCheckpointDeleteConfirmRef.current;
          if (!pending || pending.idx !== idx || pending.until < Date.now()) {
            editorCheckpointDeleteConfirmRef.current = { idx, until: Date.now() + 3000 };
            editorCopiedMsgRef.current = {
              text: `⚠ Clique de novo em − CP para excluir ${cps[idx].label}`,
              until: Date.now() + 3000,
            };
            e.preventDefault();
            return;
          }
          editorCheckpointDeleteConfirmRef.current = null;
          const removedLabel = cps[idx].label;
          const merged = cps.filter((_, i) => i !== idx);
          merged.forEach((cp, i) => { cp.label = `CP${i + 1}`; });
          editorCustomCheckpointsRef.current = merged;
          editorCheckpointIdxRef.current = -1;
          fetch('/__editor/save-level-patch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkpoints: editorCustomCheckpointsRef.current }),
          }).then(() => {
            editorCopiedMsgRef.current = { text: `✓ ${removedLabel} REMOVIDO (restaram ${merged.length})`, until: Date.now() + 3000 };
          }).catch(() => {
            editorCopiedMsgRef.current = { text: `⚠ ${removedLabel} removido localmente (erro ao salvar)`, until: Date.now() + 3000 };
          });
          e.preventDefault();
          return;
        }
      }

      const selIdx = editorSelectedIdxRef.current;
      const platforms = platformsRef.current;

      if (e.detail >= 2) {
        let emptyIdx = -1;
        for (let _i = platforms.length - 1; _i >= 0; _i--) {
          const _p = platforms[_i];
          if (_p.type === 'ground') continue;
          if (isEditorPointInsidePlatform(wx, wy, _p)) { emptyIdx = _i; break; }
        }
        if (emptyIdx < 0 && resetEditorTestSnapshot()) {
          e.preventDefault();
          return;
        }
      }

      // ── Editor de pose do Horácio (alças de resize/espelhar de QUALQUER pose exibida) ──
      {
        const pp = gsRef.current!.player;
        const g = lastPlayerGeomRef.current;
        // drawPlayer() retorna destX/destY/anchorX em espaço de TELA (já subtraindo a
        // câmera internamente), enquanto wx/wy aqui são em espaço de MUNDO. Convertendo
        // o clique para tela evita que a seleção quebre quando a câmera está longe de 0.
        const pcx = wx - editorCamXRef.current;
        const pcy = wy - editorCamYRef.current;
        const poseCopyText = (poseKey: PlayerPoseKey, dw: number, dh: number, flip: boolean, ox?: number, oy?: number) =>
          `[${PLAYER_POSE_LABELS[poseKey]}]  largura:${Math.round(dw)}  altura:${Math.round(dh)}  ox:${Math.round(ox ?? 0)}  oy:${Math.round(oy ?? 0)}  espelhado:${flip ? 'sim' : 'não'}`;
        const PHANDLE_R = 10;

        // 1) Alças/botões da pose JÁ selecionada têm prioridade máxima (só se for a pose ativa agora)
        const selKey = editorAttachedSpriteSelectedRef.current;
        if (selKey && g && g.poseKey === selKey) {
          const { dw, dh, anchorX, destX, destY } = g;
          const disp = poseDisplayOverridesRef.current[selKey];
          const resetBtnX = anchorX - 26;
          const resetBtnY = destY + dh + 10;
          const flipBtnX = anchorX + 30;
          const flipBtnY = resetBtnY;
          if (pcx >= resetBtnX && pcx <= resetBtnX + 52 && pcy >= resetBtnY && pcy <= resetBtnY + 16) {
            poseDisplayOverridesRef.current[selKey] = { dw: null, dh: null, flip: false, ox: 0, oy: 0 };
            savePoseOverridesToPatch();
            editorCopiedMsgRef.current = { text: `↺ ${PLAYER_POSE_LABELS[selKey]} RESETADO`, until: Date.now() + 2000 };
            return;
          }
          if (pcx >= flipBtnX && pcx <= flipBtnX + 40 && pcy >= flipBtnY && pcy <= flipBtnY + 16) {
            const newDisp = { ...disp, flip: !disp.flip };
            poseDisplayOverridesRef.current[selKey] = newDisp;
            savePoseOverridesToPatch();
            copyPlatText(poseCopyText(selKey, dw, dh, newDisp.flip, disp.ox, disp.oy), newDisp.flip ? `↔ ${PLAYER_POSE_LABELS[selKey]} ESPELHADO` : `↔ ${PLAYER_POSE_LABELS[selKey]} NORMAL`);
            return;
          }
          const handles: { mode: PlayerSpriteDrag['mode']; hx: number; hy: number; cornerSignX?: number; cornerSignY?: number }[] = [
            { mode: 'resize-left',   hx: destX,        hy: destY + dh / 2 },
            { mode: 'resize-right',  hx: destX + dw,   hy: destY + dh / 2 },
            { mode: 'resize-top',    hx: anchorX,      hy: destY },
            { mode: 'resize-bottom', hx: anchorX,      hy: destY + dh },
            // 4 cantos — escala uniforme (proporção travada), cada canto com seu sinal
            { mode: 'resize-corner', hx: destX + dw, hy: destY,      cornerSignX:  1, cornerSignY: -1 }, // sup-dir
            { mode: 'resize-corner', hx: destX,      hy: destY,      cornerSignX: -1, cornerSignY: -1 }, // sup-esq
            { mode: 'resize-corner', hx: destX + dw, hy: destY + dh, cornerSignX:  1, cornerSignY:  1 }, // inf-dir
            { mode: 'resize-corner', hx: destX,      hy: destY + dh, cornerSignX: -1, cornerSignY:  1 }, // inf-esq
          ];
          for (const h of handles) {
            if (Math.abs(pcx - h.hx) <= PHANDLE_R && Math.abs(pcy - h.hy) <= PHANDLE_R) {
              // startWX/startWY continuam em espaço de MUNDO (wx/wy) pois o drag calcula
              // deltas por subtração — o espaço não importa desde que seja consistente.
              editorPlayerSpriteDragRef.current = { mode: h.mode, startWX: wx, startWY: wy, origDW: dw, origDH: dh, origOX: disp.ox ?? 0, origOY: disp.oy ?? 0, target: selKey, cornerSignX: h.cornerSignX, cornerSignY: h.cornerSignY };
              return;
            }
          }
          // Clique dentro do corpo da pose já selecionada → inicia arrastar posição (ox/oy)
          if (pcx >= destX && pcx <= destX + dw && pcy >= destY && pcy <= destY + dh) {
            editorPlayerSpriteDragRef.current = { mode: 'move', startWX: wx, startWY: wy, origDW: dw, origDH: dh, origOX: disp.ox ?? 0, origOY: disp.oy ?? 0, target: selKey };
            return;
          }
        }

        // 2) Clique dentro da bounding box da pose atualmente exibida (com margem de
        //    tolerância) → seleciona ela. Esse é o ÚNICO jeito de selecionar o Horácio
        //    no editor agora — o antigo "corpo lógico" (hitbox de física) foi removido
        //    porque gerava um painel de informações redundante e concorria com a pose.
        const POSE_CLICK_MARGIN = 14;
        if (
          g &&
          pcx >= g.destX - POSE_CLICK_MARGIN && pcx <= g.destX + g.dw + POSE_CLICK_MARGIN &&
          pcy >= g.destY - POSE_CLICK_MARGIN && pcy <= g.destY + g.dh + POSE_CLICK_MARGIN
        ) {
          editorAttachedSpriteSelectedRef.current = g.poseKey;
          editorHoracioBodySelectedRef.current = false;
          editorSelectedIdxRef.current = -1;
          editorSelectedIndicesRef.current = new Set();
          const disp = poseDisplayOverridesRef.current[g.poseKey];
          copyPlatText(poseCopyText(g.poseKey, g.dw, g.dh, !!disp?.flip, disp?.ox, disp?.oy), `✓ COPIADO: ${PLAYER_POSE_LABELS[g.poseKey]}`);
          return;
        }

        // Clique em outro lugar deseleciona a pose ativa
        if (editorAttachedSpriteSelectedRef.current) {
          editorAttachedSpriteSelectedRef.current = null;
          editorPlayerSpriteDragRef.current = null;
        }
        void pp;
      }

      // ── Volume do Horácio (slider no painel lateral) ──────────────────────
      if (editorAttachedSpriteSelectedRef.current !== null && gsRef.current) {
        const _hp = gsRef.current.player;
        const _hsx = _hp.x - editorCamXRef.current;
        const _hsy = _hp.y - editorCamYRef.current;
        const _hl = getHoracioVolumePanelLayout(_hsx, _hsy, PLAYER_W);
        const _hScreenX = wx - editorCamXRef.current;
        const _hScreenY = wy - editorCamYRef.current;
        if (
          _hScreenX >= _hl.volTrackX - 4 && _hScreenX <= _hl.volTrackX + _hl.volTrackW + 4 &&
          _hScreenY >= _hl.volTrackY - 8 && _hScreenY <= _hl.volTrackY + 8
        ) {
          const frac = Math.min(1, Math.max(0, (_hScreenX - _hl.volTrackX) / _hl.volTrackW));
          const rounded = Math.round(frac * 100) / 100;
          horacioVolumeRef.current = rounded;
          npcVolumesRef.current[-1] = rounded;
          try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
          persistNpcVolumes(npcVolumesRef.current);
          horacioVolumeDragRef.current = { trackX: _hl.volTrackX, trackW: _hl.volTrackW, trackY: _hl.volTrackY };
          return;
        }
      }

      // ── Volume individual do NPC selecionado (slider no painel) ──────────
      {
        const selByIdx = editorBystanderSelectedIdxRef.current;
        if (selByIdx >= 0) {
          const byList = gsRef.current!.bystanders;
          const b = byList[selByIdx];
          if (b && b.state !== 'dead') {
            const sheet = b.spriteId === 1 ? bystander1ImgRef.current
                        : b.spriteId === 2 ? bystander2ImgRef.current
                        : b.spriteId === 3 ? bystander3ImgRef.current
                        : bystander4ImgRef.current;
            if (sheet && sheet.complete && sheet.naturalWidth > 0) {
              const frameW = Math.floor(sheet.naturalWidth / 3);
              const frameH = sheet.naturalHeight;
              const isNewSprite = b.spriteId === 3 || b.spriteId === 4;
              const isSit = b.state === 'sit';
              const displayH = isNewSprite ? 158 : (isSit ? 175 : 166);
              const displayW = Math.round(displayH * (frameW / frameH));
              const layout = getBystanderPanelLayout(b, displayW, editorCamXRef.current);
              const screenX = wx - editorCamXRef.current;
              if (
                screenX >= layout.volTrackX - 4 && screenX <= layout.volTrackX + layout.volTrackW + 4 &&
                wy >= layout.volTrackY - 8 && wy <= layout.volTrackY + 8
              ) {
                const frac = Math.min(1, Math.max(0, (screenX - layout.volTrackX) / layout.volTrackW));
                const rounded = Math.round(frac * 100) / 100;
                b.sfxVolume = rounded;
                npcVolumesRef.current[selByIdx] = rounded;
                try { localStorage.setItem('pursuit_npc_volumes', JSON.stringify(npcVolumesRef.current)); } catch { /* ignore */ }
                persistNpcVolumes(npcVolumesRef.current);
                npcVolumeDragRef.current = { bystander: b, index: selByIdx, trackX: layout.volTrackX, trackW: layout.volTrackW, trackY: layout.volTrackY };
                return;
              }
            }
          }
        }
      }

      // ── Figurantes (bystanders) selecionáveis no editor ──────────────────
      {
        const byList = gsRef.current!.bystanders;
        let hitBystanderIdx = -1;
        for (let bi = byList.length - 1; bi >= 0; bi--) {
          const b = byList[bi];
          if (b.state === 'dead') continue;
          const sheet = b.spriteId === 1 ? bystander1ImgRef.current
                      : b.spriteId === 2 ? bystander2ImgRef.current
                      : b.spriteId === 3 ? bystander3ImgRef.current
                      : bystander4ImgRef.current;
          if (!sheet || !sheet.complete || sheet.naturalWidth === 0) continue;
          const frameW = Math.floor(sheet.naturalWidth / 3);
          const frameH = sheet.naturalHeight;
          const isNewSprite = b.spriteId === 3 || b.spriteId === 4;
          const isSit = b.state === 'sit';
          const displayH = isNewSprite ? 158 : (isSit ? 175 : 166);
          const displayW = Math.round(displayH * (frameW / frameH));
          const NPC_FOOT_OFFSET = isNewSprite ? 26 : (isSit ? (b.spriteId === 1 ? 47 : 36) : 26);
          const bx = b.x;
          const bTop = GROUND_Y + NPC_FOOT_OFFSET - displayH;
          if (wx >= bx && wx <= bx + displayW && wy >= bTop && wy <= bTop + displayH) {
            hitBystanderIdx = bi;
            break;
          }
        }
        if (hitBystanderIdx >= 0) {
          editorBystanderSelectedIdxRef.current = hitBystanderIdx;
          editorSelectedIdxRef.current = -1;
          editorSelectedIndicesRef.current = new Set();
          editorHoracioBodySelectedRef.current = false;
          editorAttachedSpriteSelectedRef.current = null;
          const b = byList[hitBystanderIdx];
          const names = ['', 'HOMEM DE TOCA', 'BARBUDO', 'IDOSO', 'MULHER'];
          editorCopiedMsgRef.current = { text: `✓ SELECIONADO: ${names[b.spriteId]}  x:${Math.round(b.x)}  y:${Math.round(b.y)}`, until: Date.now() + 2500 };
          return;
        } else if (editorBystanderSelectedIdxRef.current >= 0) {
          editorBystanderSelectedIdxRef.current = -1;
        }
      }

      // Check handle hits on currently selected object first
      if (selIdx >= 0 && selIdx < platforms.length) {
        const p = platforms[selIdx];
        const hits = getPlatformCollisionRects(p);
        const selectedHitIdx = Math.max(0, Math.min(editorCollisionBoxIdxRef.current, hits.length - 1));
        const hit = hits[selectedHitIdx] ?? getPlatformCollisionRect(p);
        const editRect = editorCollisionModeRef.current
          ? hit
          : getPlatformEditRect(p);
        const rightHX = editRect.x + editRect.w;
        const rightHY = editRect.y + editRect.h / 2;
        const leftHX = editRect.x;
        const leftHY = editRect.y + editRect.h / 2;
        const topHX = editRect.x + editRect.w / 2;
        const topHY = editRect.y;
        const bottomHX = editRect.x + editRect.w / 2;
        const bottomHY = editRect.y + editRect.h;
        const cornerHX = editRect.x + editRect.w;
        const cornerHY = editRect.y;
        const rotateHX = editRect.x + editRect.w / 2;
        const rotateHY = editRect.y - 28;
        const origText = platCoordText(p);

        // Duplicate button hit (world-space, right side of object)
        const dupBtnX = editRect.x + editRect.w + 14;
        const dupBtnY = editRect.y + editRect.h / 2 - 24;
        const selectedDupCount = editorSelectedIndicesRef.current.has(selIdx) ? Math.max(1, editorSelectedIndicesRef.current.size) : 1;
        const dupBtnW = selectedDupCount > 1 ? 78 : 62;
        const dupBtnH = 22;
        const collisionBtnX = dupBtnX;
        const collisionBtnY = dupBtnY + 26;
        const collisionBtnW = 82;
        const collisionBtnH = 22;
        const addBoxBtnX = dupBtnX;
        const addBoxBtnY = collisionBtnY + 26;
        const addBoxBtnW = 82;
        const addBoxBtnH = 22;
        if (wx >= dupBtnX && wx <= dupBtnX + dupBtnW && wy >= dupBtnY && wy <= dupBtnY + dupBtnH) {
          pushEditorHistory();
          const selectedGroup = Array.from(editorSelectedIndicesRef.current)
            .filter((idx) => idx >= 0 && idx < platforms.length && platforms[idx].type !== 'ground')
            .sort((a, b) => a - b);

          if (selectedGroup.length > 1 && selectedGroup.includes(selIdx)) {
            const groupMinX = Math.min(...selectedGroup.map((idx) => platforms[idx].x));
            const groupMaxX = Math.max(...selectedGroup.map((idx) => platforms[idx].x + platforms[idx].w));
            const offsetX = Math.max(1, groupMaxX - groupMinX);
            const newIndices: number[] = [];

            selectedGroup.forEach((idx) => {
              const original = platforms[idx];
              const copy = { ...original, x: original.x + offsetX };
              if (original.collisionBoxes) copy.collisionBoxes = original.collisionBoxes.map((box) => ({ ...box, slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined }));
              platforms.push(copy);
              newIndices.push(platforms.length - 1);
            });

            editorSelectedIndicesRef.current = new Set(newIndices);
            editorSelectedIdxRef.current = newIndices[0] ?? selIdx;
            editorCollisionBoxIdxRef.current = 0;

            const leaderIdx = newIndices[0];
            if (leaderIdx !== undefined) {
              const leader = platforms[leaderIdx];
              const preSnapX = leader.x;
              const preSnapY = leader.y;
              const ignoredForSnap = new Set(newIndices);
              snapEditorPlatform(leader, leaderIdx, ignoredForSnap);
              const snapDx = leader.x - preSnapX;
              const snapDy = leader.y - preSnapY;
              if (snapDx !== 0 || snapDy !== 0) {
                newIndices.forEach((ni) => {
                  if (ni === leaderIdx) return;
                  const gp = platforms[ni];
                  if (!gp) return;
                  gp.x = Math.round(gp.x + snapDx);
                  gp.y = Math.round(gp.y + snapDy);
                });
              }
            }

            // Invalida grade espacial para o visual aparecer imediatamente
            spatialGridSourceRef.current = null;
            saveSprites(platforms);
            // Centraliza câmera no grupo duplicado
            const leaderCopy = platforms[newIndices[0] ?? 0];
            if (leaderCopy) {
              editorCamXRef.current = Math.max(0, leaderCopy.x + leaderCopy.w / 2 - CANVAS_W / 2);
            }
            copyPlatText(platCoordText(platforms[editorSelectedIdxRef.current]), `✓ GRUPO DUPLICADO: ${newIndices.length} OBJETOS`);
            return;
          }

          const copy = { ...p, x: p.x + p.w };
          if (p.collisionBoxes) copy.collisionBoxes = p.collisionBoxes.map((box) => ({ ...box, slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined }));
          platforms.push(copy);
          // Invalida grade espacial para o visual aparecer imediatamente
          spatialGridSourceRef.current = null;
          saveSprites(platforms);
          const newIdx = platforms.length - 1;
          snapEditorPlatform(copy, newIdx);
          editorSelectedIndicesRef.current = new Set([newIdx]);
          editorSelectedIdxRef.current = newIdx;
          editorCollisionBoxIdxRef.current = 0;
          // Centraliza câmera no duplicado para ficar visível
          editorCamXRef.current = Math.max(0, copy.x + copy.w / 2 - CANVAS_W / 2);
          const text = platCoordText(copy);
          copyPlatText(text, `✓ DUPLICADO: ${text}`);
          return;
        }
        if (wx >= collisionBtnX && wx <= collisionBtnX + collisionBtnW && wy >= collisionBtnY && wy <= collisionBtnY + collisionBtnH) {
          editorCollisionModeRef.current = !editorCollisionModeRef.current;
          if (editorCollisionModeRef.current) {
            ensurePlatformCollisionBoxes(p);
            editorCollisionBoxIdxRef.current = Math.max(0, Math.min(editorCollisionBoxIdxRef.current, (p.collisionBoxes?.length ?? 1) - 1));
            copyPlatText(platCoordText(p), '✓ MODO HITBOX — ALT+clique escolhe caixa, +BOX cria outra');
          } else {
            copyPlatText(platCoordText(p), '✓ MODO OBJETO — alças voltaram ao sprite');
          }
          return;
        }
        if (editorCollisionModeRef.current && wx >= addBoxBtnX && wx <= addBoxBtnX + addBoxBtnW && wy >= addBoxBtnY && wy <= addBoxBtnY + addBoxBtnH) {
          editorCollisionBoxIdxRef.current = addPlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          const text = platCoordText(p);
          copyPlatText(text, `✓ BOX ${editorCollisionBoxIdxRef.current + 1} ADICIONADA`);
          return;
        }
        const removeBoxBtnX = dupBtnX;
        const removeBoxBtnY = addBoxBtnY + 26;
        const removeBoxBtnW = 82;
        const removeBoxBtnH = 22;
        if (editorCollisionModeRef.current && wx >= removeBoxBtnX && wx <= removeBoxBtnX + removeBoxBtnW && wy >= removeBoxBtnY && wy <= removeBoxBtnY + removeBoxBtnH) {
          editorCollisionBoxIdxRef.current = removePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          const hasBoxes = (p.collisionBoxes?.length ?? 0) > 0;
          if (!hasBoxes) editorCollisionModeRef.current = false;
          copyPlatText(platCoordText(p), hasBoxes ? `✓ BOX REMOVIDA` : `✓ COLISÃO RESETADA`);
          return;
        }

        // Slope toggle button
        const slopeBtnX = dupBtnX;
        const slopeBtnY = removeBoxBtnY + 26;
        const slopeBtnW = 82;
        const slopeBtnH = 22;
        if (editorCollisionModeRef.current && wx >= slopeBtnX && wx <= slopeBtnX + slopeBtnW && wy >= slopeBtnY && wy <= slopeBtnY + slopeBtnH) {
          pushEditorHistory();
          const box = ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          if (box.slopeTop) {
            delete box.slopeTop;
            copyPlatText(platCoordText(p), '✓ SLOPE REMOVIDO DA HITBOX');
          } else {
            box.slopeTop = { left: box.h, right: 0 };
            copyPlatText(platCoordText(p), '✓ SLOPE ADICIONADO — arraste os losangos laranja');
          }
          return;
        }

        // ── Botão DELETAR objeto selecionado (fora do collision mode) ───
        {
          const delBtnX = dupBtnX;
          const delBtnY = dupBtnY + 52; // = hitBtnY + 26
          const delBtnW = 82;
          const delBtnH = 22;
          if (!editorCollisionModeRef.current && wx >= delBtnX && wx <= delBtnX + delBtnW && wy >= delBtnY && wy <= delBtnY + delBtnH) {
            deleteEditorSelectedObjects();
            return;
          }

          // ── Botão SALVAR NA GALERIA ──
          const isSprite = p.type === 'sprite' && !!p.customSpriteName;
          const spriteAlreadyInGallery = isSprite && galleryServerNamesRef.current.has(p.customSpriteName!);
          const typeAlreadyInGallery = !isSprite && galleryObjectTypesRef.current.has(p.type);
          const alreadyInGallery = isSprite ? spriteAlreadyInGallery : typeAlreadyInGallery;
          const isStairPlat = !!(p as any)._stair;
          if (!editorCollisionModeRef.current && p.type !== 'ground' && !alreadyInGallery) {
            const galBtnX = delBtnX;
            const galBtnY = delBtnY + 26;
            const galBtnW = 82;
            const galBtnH = 22;
            if (wx >= galBtnX && wx <= galBtnX + galBtnW && wy >= galBtnY && wy <= galBtnY + galBtnH) {
              saveToGallery(p);
              return;
            }
          }

          // ── Botão ↔ INVERTER (só para plataformas _stair) — abaixo da galeria ──
          if (!editorCollisionModeRef.current && isStairPlat) {
            const flipBtnX = delBtnX;
            const flipBtnY = delBtnY + 52;
            const flipBtnW = 82;
            const flipBtnH = 22;
            if (wx >= flipBtnX && wx <= flipBtnX + flipBtnW && wy >= flipBtnY && wy <= flipBtnY + flipBtnH) {
              pushEditorHistory();
              (p as any).flipX = !(p as any).flipX;
              copyPlatText(platCoordText(p), (p as any).flipX ? '↔ ESCADA INVERTIDA' : '↔ ESCADA NORMAL');
              return;
            }
          }

        }

        // Slope handles (diamond, laranja) — somente em modo colisão
        if (editorCollisionModeRef.current && hit.slopeTop) {
          const slopeHitRadius = 10;
          const sLX = hit.x, sLY = hit.y + hit.slopeTop.left;
          const sRX = hit.x + hit.w, sRY = hit.y + hit.slopeTop.right;
          if (Math.abs(wx - sLX) <= slopeHitRadius && Math.abs(wy - sLY) <= slopeHitRadius) {
            ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            editorPendingHistoryRef.current = snapshotPlatforms();
            editorDragRef.current = { ...makeEditorDrag(p, 'slope-left', wx, wy, origText), origSlopeLeft: hit.slopeTop.left, origSlopeRight: hit.slopeTop.right };
            return;
          }
          if (Math.abs(wx - sRX) <= slopeHitRadius && Math.abs(wy - sRY) <= slopeHitRadius) {
            ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            editorPendingHistoryRef.current = snapshotPlatforms();
            editorDragRef.current = { ...makeEditorDrag(p, 'slope-right', wx, wy, origText), origSlopeLeft: hit.slopeTop.left, origSlopeRight: hit.slopeTop.right };
            return;
          }
        }

        if (editorCollisionModeRef.current && !e.shiftKey) {
          const boxHit = getPlatformCollisionRects(p)
            .map((box, idx) => ({ box, idx }))
            .filter(({ box }) => wx >= box.x && wx <= box.x + box.w && wy >= box.y && wy <= box.y + box.h)
            .sort((a, b) => (a.box.w * a.box.h) - (b.box.w * b.box.h))[0];
          if (boxHit && boxHit.idx !== selectedHitIdx) {
            editorCollisionBoxIdxRef.current = boxHit.idx;
            copyPlatText(platCoordText(p), `✓ BOX ${boxHit.idx + 1} SELECIONADA`);
            return;
          }
        }

        if (!editorCollisionModeRef.current && hitHandle(wx, wy, rotateHX, rotateHY)) {
          editorPendingHistoryRef.current = snapshotPlatforms();
          editorDragRef.current = makeEditorDrag(p, 'rotate', wx, wy, origText);
          return;
        }

        if (hitHandle(wx, wy, cornerHX, cornerHY)) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorDragRef.current = makeEditorDrag(p, 'resize-corner', wx, wy, origText, e.shiftKey);
          return;
        }
        if (hitHandle(wx, wy, rightHX, rightHY)) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorDragRef.current = makeEditorDrag(p, 'resize-right', wx, wy, origText, e.shiftKey);
          return;
        }
        if (hitHandle(wx, wy, leftHX, leftHY)) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorDragRef.current = makeEditorDrag(p, 'resize-left', wx, wy, origText, e.shiftKey);
          return;
        }
        {
          // Para plataformas finas (h < 4×HANDLE_R), reduz a penetração interna dos
          // handles top/bottom para garantir zona de corpo acessível (~h/2 livre).
          const topInnerR = Math.min(HANDLE_R, editRect.h / 4);
          const bottomInnerR = Math.min(HANDLE_R, editRect.h / 4);
          if (Math.abs(wx - topHX) <= HANDLE_R && wy >= topHY - HANDLE_R && wy <= topHY + topInnerR) {
            if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            editorDragRef.current = makeEditorDrag(p, 'resize-top', wx, wy, origText, e.shiftKey);
            return;
          }
          if (Math.abs(wx - bottomHX) <= HANDLE_R && wy >= bottomHY - bottomInnerR && wy <= bottomHY + HANDLE_R) {
            if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            editorDragRef.current = makeEditorDrag(p, 'resize-bottom', wx, wy, origText, e.shiftKey);
            return;
          }
        }
        // Hit body of selected → start move drag
        if (editorCollisionModeRef.current
          ? isEditorPointInsideCollision(wx, wy, p)
          : (wx >= editRect.x && wx <= editRect.x + editRect.w && wy >= editRect.y && wy <= editRect.y + editRect.h)
        ) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorPendingHistoryRef.current = snapshotPlatforms();
          editorDragRef.current = makeEditorDrag(p, 'move', wx, wy, origText);
          if (editorSelectedIndicesRef.current.size > 1 && editorSelectedIndicesRef.current.has(selIdx)) {
            editorDragRef.current.origGroupPositions = [...editorSelectedIndicesRef.current]
              .filter(i => i !== selIdx && i >= 0 && i < platforms.length && platforms[i].type !== 'ground')
              .map(i => ({ idx: i, origX: platforms[i].x, origY: platforms[i].y }));
          }
          return;
        }
      }

      // Hit a different platform → select or multi-select it
      let idx = -1;
      for (let _i = platforms.length - 1; _i >= 0; _i--) {
        const _p = platforms[_i];
        if (_p.type === 'ground') continue;
        if (isEditorPointInsidePlatform(wx, wy, _p)) { idx = _i; break; }
      }
      if (idx >= 0) {
        if (e.shiftKey) {
          // Toggle platform in/out of multi-selection
          if (editorSelectedIndicesRef.current.has(idx)) {
            editorSelectedIndicesRef.current.delete(idx);
            if (editorSelectedIdxRef.current === idx) {
              editorSelectedIdxRef.current = [...editorSelectedIndicesRef.current][0] ?? -1;
            }
          } else {
            editorSelectedIndicesRef.current.add(idx);
            editorSelectedIdxRef.current = idx;
            editorCollisionModeRef.current = false;
            editorCollisionBoxIdxRef.current = 0;
          }
          const indices = [...editorSelectedIndicesRef.current];
          const texts = indices.map(i => platCoordText(platforms[i])).join(',\n');
          const msg = indices.length === 1 ? `✓ SELECIONADO: ${platCoordText(platforms[indices[0]])}` : `✓ ${indices.length} SELECIONADOS`;
          copyPlatText(texts, msg);
        } else if (editorSelectedIndicesRef.current.has(idx) && editorSelectedIndicesRef.current.size > 1) {
          // Clique em membro do grupo → arrastar grupo inteiro sem mudar seleção
          editorSelectedIdxRef.current = idx;
          const clickedP = platforms[idx];
          editorPendingHistoryRef.current = snapshotPlatforms();
          const newDrag = makeEditorDrag(clickedP, 'move', wx, wy, platCoordText(clickedP));
          newDrag.origGroupPositions = [...editorSelectedIndicesRef.current]
            .filter(i => i !== idx && i >= 0 && i < platforms.length && platforms[i].type !== 'ground')
            .map(i => ({ idx: i, origX: platforms[i].x, origY: platforms[i].y }));
          editorDragRef.current = newDrag;
        } else {
          // Seleção normal — limpa multi, seleciona só este
          editorSelectedIdxRef.current = idx;
          editorSelectedIndicesRef.current = new Set([idx]);
          editorCollisionModeRef.current = false;
          editorCollisionBoxIdxRef.current = 0;
          const p = platforms[idx];
          const text = platCoordText(p);
          copyPlatText(text, `✓ SELECIONADO: ${text}`);
          editorPendingHistoryRef.current = snapshotPlatforms();
          editorDragRef.current = makeEditorDrag(p, 'move', wx, wy, text);
        }
      } else {
        if (!e.shiftKey) {
          // Click on empty space: clear selection and start marquee
          editorSelectedIdxRef.current = -1;
          editorSelectedIndicesRef.current = new Set();
          editorCollisionModeRef.current = false;
          editorCollisionBoxIdxRef.current = 0;
          editorMarqueeRef.current = { startWX: wx, startWY: wy, endWX: wx, endWY: wy };
        }
      }
    };

    const onCanvasMiddleMove = (e: MouseEvent) => {
      if (!middleDragging) return;
      const gs = gsRef.current;
      if (!gs || gs.gamePhase !== 'editor') { middleDragging = false; return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const dx = (e.clientX - middleLastX) * scaleX;
      const dy = (e.clientY - middleLastY) * scaleY;
      middleLastX = e.clientX;
      middleLastY = e.clientY;
      editorCamXRef.current = Math.max(0, editorCamXRef.current - dx);
      editorCamYRef.current = Math.max(-4000, Math.min(300, editorCamYRef.current - dy));
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        middleDragging = false;
        if (canvasRef.current) canvasRef.current.style.cursor = '';
        return;
      }
      if (e.button !== 0) return;
      if (musicVolumeDragRef.current) {
        musicVolumeDragRef.current = false;
        return;
      }
      if (sfxCategoryVolumeDragRef.current) {
        sfxCategoryVolumeDragRef.current = null;
        return;
      }
      if (horacioVolumeDragRef.current) {
        horacioVolumeDragRef.current = null;
        return;
      }
      if (npcVolumeDragRef.current) {
        npcVolumeDragRef.current = null;
        return;
      }

      // Finalizar marquee de seleção
      const marquee = editorMarqueeRef.current;
      if (marquee) {
        editorMarqueeRef.current = null;
        const mx1 = Math.min(marquee.startWX, marquee.endWX);
        const mx2 = Math.max(marquee.startWX, marquee.endWX);
        const my1 = Math.min(marquee.startWY, marquee.endWY);
        const my2 = Math.max(marquee.startWY, marquee.endWY);
        if (mx2 - mx1 > 4 || my2 - my1 > 4) {
          const selected = new Set<number>();
          platformsRef.current.forEach((p, i) => {
            if (p.type === 'ground') return;
            if (p.x < mx2 && p.x + p.w > mx1 && p.y < my2 && p.y + p.h > my1) {
              selected.add(i);
            }
          });
          editorSelectedIndicesRef.current = selected;
          editorSelectedIdxRef.current = [...selected][0] ?? -1;
          if (selected.size > 0) {
            const texts = [...selected].map(i => platCoordText(platformsRef.current[i])).join(',\n');
            const msg = selected.size === 1
              ? `✓ SELECIONADO: ${platCoordText(platformsRef.current[[...selected][0]])}`
              : `✓ ${selected.size} SELECIONADOS`;
            copyPlatText(texts, msg);
          }
        }
        return;
      }

      // Salvar config do sprite se estava dragando alça ou corpo da pose
      if (editorPlayerSpriteDragRef.current) {
        const draggedTarget = editorPlayerSpriteDragRef.current.target ?? 'ladder';
        editorPlayerSpriteDragRef.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = '';
        savePoseOverridesToPatch();
        if (draggedTarget === 'kongVaultStart') {
          editorCopiedMsgRef.current = { text: '✓ KONG VAULT (INÍCIO) SALVO', until: Date.now() + 2000 };
        } else if (draggedTarget === 'kongVaultAir') {
          editorCopiedMsgRef.current = { text: '✓ KONG VAULT (AR) SALVO', until: Date.now() + 2000 };
        } else if (draggedTarget === 'ladder') {
          editorCopiedMsgRef.current = { text: '✓ SPRITE ESCADA SALVO', until: Date.now() + 2000 };
        } else {
          editorCopiedMsgRef.current = { text: '✓ POSE SALVA', until: Date.now() + 2000 };
        }
        return;
      }

      const drag = editorDragRef.current;
      if (!drag) return;
      editorDragRef.current = null;
      if (drag.hasMoved) {
        // Commit pending history snapshot (tirado antes do drag começar)
        if (editorPendingHistoryRef.current) {
          editorUndoStackRef.current.push(editorPendingHistoryRef.current);
          if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
          editorRedoStackRef.current = [];
        }
        // Bake crop into real platform dimensions so the bounding box shrinks correctly
        if (drag.editingCrop) {
          const p = platformsRef.current[editorSelectedIdxRef.current];
          if (p) {
            const cl = Math.max(0, Math.min(p.cropLeft ?? 0, p.w - 6));
            const cr = Math.max(0, Math.min(p.cropRight ?? 0, p.w - cl - 6));
            const ct = Math.max(0, Math.min(p.cropTop ?? 0, p.h - 6));
            const cb = Math.max(0, Math.min(p.cropBottom ?? 0, p.h - ct - 6));
            p.x += cl;
            p.y += ct;
            p.w = Math.max(6, p.w - cl - cr);
            p.h = Math.max(6, p.h - ct - cb);
            p.cropLeft = 0;
            p.cropTop = 0;
            p.cropRight = 0;
            p.cropBottom = 0;
          }
        }
        const p = platformsRef.current[editorSelectedIdxRef.current];
        if (p) {
          const newText = platCoordText(p);
          const clipText = `ANTIGO: ${drag.origText}\nNOVO:   ${newText}`;
          copyPlatText(clipText, `✓ ATUALIZADO — cole aqui e diga "atualizar"`);
        }
        saveSprites(platformsRef.current);
      }
      editorPendingHistoryRef.current = null;
    };

    const onCanvasWheel = (e: WheelEvent) => {
      const gs = gsRef.current;
      if (!gs) return;
      // Modo de jogo: scroll move câmera Y livremente para ver qualquer altura
      if (gs.gamePhase === 'playing') {
        e.preventDefault();
        const factor = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 300 : 1;
        playCamFreeYRef.current = Math.max(-4000, Math.min(300,
          playCamFreeYRef.current + e.deltaY * factor * 0.8
        ));
        return;
      }
      if (gs.gamePhase !== 'editor' || editorTestModeRef.current) return;
      e.preventDefault();
      const factor = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 300 : 1;
      if (e.shiftKey) {
        const dx = e.deltaY * factor * 0.5;
        editorCamXRef.current = Math.max(0, editorCamXRef.current + dx);
      } else {
        const dy = e.deltaY * factor * 0.5;
        editorCamYRef.current = Math.max(-4000, Math.min(300, editorCamYRef.current + dy));
      }
    };

    const cvs = canvasRef.current;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // ── Stamp Copy (estilo CorelDraw): clique direito durante drag de move ──
      const drag = editorDragRef.current;
      if (drag && drag.mode === 'move' && drag.hasMoved) {
        const platforms = platformsRef.current;
        const selIdx = editorSelectedIdxRef.current;

        // 1. Snapshot para undo (estado antes do stamp)
        const snapshot = platforms.map(p => ({
          ...p,
          collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
            ...b,
            slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
          })) : undefined,
        })) as Platform[];
        editorUndoStackRef.current.push(snapshot);
        if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
        editorRedoStackRef.current = [];

        // 2. Criar cópias na posição atual (arrastada)
        const newIndices: number[] = [];
        // Cópia do objeto primário
        if (selIdx >= 0 && selIdx < platforms.length) {
          const orig = platforms[selIdx];
          const copy: Platform = {
            ...orig,
            collisionBoxes: orig.collisionBoxes ? orig.collisionBoxes.map(b => ({
              ...b,
              slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
            })) : undefined,
          };
          platforms.push(copy);
          newIndices.push(platforms.length - 1);
        }
        // Cópias dos objetos do grupo
        for (const entry of drag.origGroupPositions) {
          const orig = platforms[entry.idx];
          if (orig) {
            const copy: Platform = {
              ...orig,
              collisionBoxes: orig.collisionBoxes ? orig.collisionBoxes.map(b => ({
                ...b,
                slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
              })) : undefined,
            };
            platforms.push(copy);
            newIndices.push(platforms.length - 1);
          }
        }

        // 3. Snap dos originais de volta às posições de origem
        if (selIdx >= 0 && selIdx < platforms.length) {
          platforms[selIdx].x = drag.origX;
          platforms[selIdx].y = drag.origY;
        }
        for (const entry of drag.origGroupPositions) {
          if (entry.idx >= 0 && entry.idx < platforms.length) {
            platforms[entry.idx].x = entry.origX;
            platforms[entry.idx].y = entry.origY;
          }
        }

        // 4. Selecionar as cópias recém-criadas
        if (newIndices.length > 0) {
          editorSelectedIdxRef.current = newIndices[0];
          editorSelectedIndicesRef.current = new Set(newIndices);
        }

        // 5. Limpar drag e salvar
        editorDragRef.current = null;
        saveSprites(platforms);
        if (gsRef.current) gsRef.current.platforms = platforms;
        const count = newIndices.length;
        editorCopiedMsgRef.current = {
          text: `✓ ${count} CÓPIA${count !== 1 ? 'S' : ''} ESTAMPADA${count !== 1 ? 'S' : ''}`,
          until: Date.now() + 2500,
        };
      }
    };
    if (cvs) {
      cvs.addEventListener('mousemove', onCanvasMouseMove);
      cvs.addEventListener('mousemove', onCanvasMiddleMove);
      cvs.addEventListener('mousedown', onCanvasMouseDown);
      cvs.addEventListener('contextmenu', onContextMenu);
      cvs.addEventListener('wheel', onCanvasWheel, { passive: false });
    }
    window.addEventListener('mouseup', onMouseUp);

    const loop = (timestamp: number) => {
      const dt = Math.min(timestamp - lastTime.current, 50);
      lastTime.current = timestamp;

      const gs = gsRef.current!;
      const keys = keysRef.current;
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(loop); return; }

      const ctx = canvas.getContext('2d')!;

      // ── Reconstrói grade espacial quando o array de plataformas muda ──
      if (spatialGridSourceRef.current !== gs.platforms) {
        spatialGridSourceRef.current = gs.platforms;
        spatialGridRef.current = buildSpatialGrid(gs.platforms);
        // Mapa Platform→índice para lookup O(1) na colisão de balas
        const idxMap = new Map<Platform, number>();
        gs.platforms.forEach((p, i) => idxMap.set(p, i));
        platformIndexMapRef.current = idxMap;
        droneSolidPlatsRef.current = gs.platforms.filter(
          p => p.type === 'wall' && (p.x === 12100 || p.x === 21700)
        );
      }

      // --- Update ---
      if (gs.gamePhase === 'menu') {
        // Painel de opções aberto
        if (showOptionsRef.current) {
          if (trainingJustPressed.current) {
            // Entra na sala de treino
            trainingJustPressed.current = false;
            showOptionsRef.current = false;
            // Reinicia o jogador na posição inicial da sala
            const _tp = gs.player;
            _tp.x = 80; _tp.y = GROUND_Y - PLAYER_H;
            _tp.vx = 0; _tp.vy = 0;
            _tp.onGround = false; _tp.coyoteTime = 0;
            _tp.jumpCount = 0; _tp.doubleJumpReady = true;
            _tp.isRolling = false; _tp.isDivejumping = false;
            _tp.isWallRunning = false; _tp.wallRunTimer = 0;
            _tp.touchingWall = false; _tp.isSideFlipping = false;
            _tp.kongVaultPhase = null; _tp.kongVaultIsObstacle = false;
            _tp.state = 'idle'; _tp.health = PLAYER_MAX_HEALTH;
            _tp.invincible = false; _tp.facingRight = true;
            _tp.autoRoll = false; _tp.landingCrouch = false;
            gs.camera.x = 0; gs.camera.y = 0;
            gs.particles = []; gs.screenShake = 0;
            gs.time = 0;
            // Drone de treino: já posicionado onde vai aguardar o player
            gs.drone.x = 5600; gs.drone.y = 120;
            gs.drone.vx = 0; gs.drone.vy = 0;
            gs.drone.shootTimer = 2500;
            gs.bullets = [];
            stopBeat();
            stopDogAmbient();
            gs.gamePhase = 'training';
          } else if (spaceJustPressed.current || escJustPressed.current) {
            showOptionsRef.current = false;
            spaceJustPressed.current = false;
            escJustPressed.current = false;
          }
          pauseUpJustPressed.current = false;
          pauseDownJustPressed.current = false;
          optionsJustPressed.current = false;
          editorJustPressed.current = false;
          enterJustPressed.current = false;
          trainingJustPressed.current = false;
          // Não processa mais nada do menu enquanto opções estão abertas
        } else if (raceMenuOpenRef.current) {
          if (raceLeftJustPressed.current || raceRightJustPressed.current) {
            if (raceFocusRef.current === 0) {
              raceDroneEnabledRef.current = !raceDroneEnabledRef.current;
            } else if (raceFocusRef.current === 1) {
              raceCheckpointsEnabledRef.current = !raceCheckpointsEnabledRef.current;
            } else if (raceFocusRef.current === 2) {
              raceRoundTargetRef.current = (raceRoundTargetRef.current % 3 + 1) as 1 | 2 | 3;
            }
            raceLeftJustPressed.current = false;
            raceRightJustPressed.current = false;
          } else if (pauseUpJustPressed.current) {
            raceFocusRef.current = (raceFocusRef.current - 1 + 4) % 4;
            pauseUpJustPressed.current = false;
          } else if (pauseDownJustPressed.current) {
            raceFocusRef.current = (raceFocusRef.current + 1) % 4;
            pauseDownJustPressed.current = false;
          } else if (escJustPressed.current) {
            raceMenuOpenRef.current = false;
            escJustPressed.current = false;
          } else if (spaceJustPressed.current || enterJustPressed.current) {
            if (raceFocusRef.current === 3) {
              raceMenuOpenRef.current = false;
              resetGame('race');
            }
            spaceJustPressed.current = false;
            enterJustPressed.current = false;
          }
        } else if (pauseUpJustPressed.current) {
          menuFocusRef.current = (menuFocusRef.current - 1 + 4) % 4;
          pauseUpJustPressed.current = false;
        } else if (pauseDownJustPressed.current) {
          menuFocusRef.current = (menuFocusRef.current + 1) % 4;
          pauseDownJustPressed.current = false;
        } else if (trainingJustPressed.current) {
          trainingJustPressed.current = false;
          spaceJustPressed.current = false;
          const _tp = gs.player;
          _tp.x = 80; _tp.y = GROUND_Y - PLAYER_H;
          _tp.vx = 0; _tp.vy = 0;
          _tp.onGround = false; _tp.coyoteTime = 0;
          _tp.jumpCount = 0; _tp.doubleJumpReady = true;
          _tp.isRolling = false; _tp.isDivejumping = false;
          _tp.isWallRunning = false; _tp.wallRunTimer = 0;
          _tp.touchingWall = false; _tp.isSideFlipping = false;
          _tp.kongVaultPhase = null; _tp.kongVaultIsObstacle = false;
          _tp.state = 'idle'; _tp.health = PLAYER_MAX_HEALTH;
          _tp.invincible = false; _tp.facingRight = true;
          _tp.autoRoll = false; _tp.landingCrouch = false;
          gs.camera.x = 0; gs.camera.y = 0;
          gs.particles = []; gs.screenShake = 0;
          gs.time = 0;
          stopBeat();
          stopDogAmbient();
          gs.gamePhase = 'training';
        } else if (optionsJustPressed.current) {
          showOptionsRef.current = true;
          optionsJustPressed.current = false;
        } else if (editorJustPressed.current) {
          // Bloqueia entrada no editor enquanto o level-patch.json não terminar
          // de carregar — entrar antes pode descartar mudanças salvas.
          if (!levelPatchLoadedRef.current) {
            editorCopiedMsgRef.current = {
              text: '⏳ AGUARDE — carregando fase salva do servidor...',
              until: Date.now() + 1500,
            };
          } else {
            editorJustPressed.current = false;
            spaceJustPressed.current = false;
            editorCamXRef.current = 0;
            editorHoveredIdxRef.current = -1;
            editorBaselineKeysRef.current = new Set(platformsRef.current.map(platBaseKey));
            editorSavedSignatureRef.current = platformsSignature(platformsRef.current);
            editorDirtyRef.current = false;
            editorSaveStatusRef.current = 'saved';
            editorSaveStatusMessageRef.current = '';
            stopBeat();
            stopDogAmbient();
            gs.gamePhase = 'editor';
          }
        } else if (spaceJustPressed.current || enterJustPressed.current) {
          if (menuFocusRef.current === 3) {
            showOptionsRef.current = true;
          } else if (menuFocusRef.current === 2) {
            trainingJustPressed.current = true;
          } else if (menuFocusRef.current === 1) {
            raceMenuOpenRef.current = true;
            raceFocusRef.current = 0;
          } else {
            resetGame('story');
          }
          spaceJustPressed.current = false;
          enterJustPressed.current = false;
        }
      } else if (gs.gamePhase === 'editor') {
        // Detecta mudanças no conteúdo (move/resize/hitbox/crop/rotação/sprite)
        // a cada ~500ms e agenda auto-save quando difere do último salvo.
        const nowDirtyCheck = Date.now();
        if (nowDirtyCheck - editorLastDirtyCheckRef.current >= 500) {
          editorLastDirtyCheckRef.current = nowDirtyCheck;
          if (levelPatchLoadedRef.current && editorSaveStatusRef.current !== 'saving') {
            const sigNow = platformsSignature(platformsRef.current);
            if (sigNow !== editorSavedSignatureRef.current) {
              if (!editorDirtyRef.current) markEditorDirty();
              editorDirtyRef.current = true;
              if (editorSaveStatusRef.current === 'saved') {
                editorSaveStatusRef.current = 'pending';
                editorSaveStatusMessageRef.current = 'modificado — salvando em breve...';
              }
            }
          }
        }
        if (escJustPressed.current) {
          escJustPressed.current = false;
          spaceJustPressed.current = false;
          editorTestModeRef.current = false;
          stopDogAmbient();
          gs.gamePhase = 'menu';
        } else if (editorSpawnJustPressed.current) {
          editorSpawnJustPressed.current = false;
          const spawnX = editorMouseWorldRef.current.x;
          // Detecta plataforma mais alta sob o spawnX para spawnar em cima dela
          const platsUnder = platformsRef.current.filter(p =>
            p.type !== 'ground' &&
            spawnX >= p.x && spawnX <= p.x + p.w
          );
          let spawnY: number;
          if (platsUnder.length > 0) {
            platsUnder.sort((a, b) => a.y - b.y);
            const top = platsUnder[0];
            // Se a plataforma tem collision boxes, usa o topo da mais alta
            if (top.collisionBoxes && top.collisionBoxes.length > 0) {
              const minBoxTop = Math.min(...top.collisionBoxes.map(cb => top.y + cb.y));
              spawnY = minBoxTop - PLAYER_H;
            } else {
              spawnY = top.y - PLAYER_H;
            }
          } else {
            spawnY = GROUND_Y - PLAYER_H - 28;
          }
          editorLastSpawnXRef.current = spawnX;
          editorLastSpawnYRef.current = spawnY;
          editorTestSnapshotRef.current = snapshotPlatforms();
          const newState = makeInitialState('story');
          // Usa gameMode wall-test para desabilitar o drone durante o teste
          newState.gameMode = 'wall-test';
          newState.gamePhase = 'playing';
          newState.player.x = spawnX;
          newState.player.y = spawnY;
          newState.player.vx = 0;
          newState.player.vy = 0;
          newState.camera.x = editorCamXRef.current;
          gsRef.current = newState;
          editorTestModeRef.current = true;
          editorRealStoryModeRef.current = false;
          initDogAmbient(dogGrowlUrl);
        } else if (editorRealStoryJustPressed.current) {
          // BARRA (/) — jogo real a partir da posição atual do cursor
          editorRealStoryJustPressed.current = false;
          const spawnX = editorMouseWorldRef.current.x;
          const platsUnder = platformsRef.current.filter(p =>
            p.type !== 'ground' && spawnX >= p.x && spawnX <= p.x + p.w
          );
          let spawnY: number;
          if (platsUnder.length > 0) {
            platsUnder.sort((a, b) => a.y - b.y);
            const top = platsUnder[0];
            if (top.collisionBoxes && top.collisionBoxes.length > 0) {
              const minBoxTop = Math.min(...top.collisionBoxes.map(cb => top.y + cb.y));
              spawnY = minBoxTop - PLAYER_H;
            } else {
              spawnY = top.y - PLAYER_H;
            }
          } else {
            spawnY = GROUND_Y - PLAYER_H - 28;
          }
          editorLastSpawnXRef.current = spawnX;
          editorLastSpawnYRef.current = spawnY;
          editorTestSnapshotRef.current = snapshotPlatforms();
          const rsState = makeInitialState('story');
          rsState.gamePhase = 'playing';
          rsState.player.x = spawnX;
          rsState.player.y = spawnY;
          rsState.player.vx = 0;
          rsState.player.vy = 0;
          rsState.camera.x = editorCamXRef.current;
          // Pré-ativa flags e checkpoint baseado na zona de spawn,
          // espelhando exatamente o que o jogo real teria feito.
          {
            const JY_X  = 12100;  // junkyard entry (só HP, não é CP de respawn)
            const PJ_X  = 21720;  // pós-junkyard → 1º CP real
            const SC_X  = 30598;  // 2º CP real
            if (spawnX > SC_X) {
              rsState.junkyardHealthGiven    = true;
              rsState.postJunkyardHealthGiven = true;
              rsState.secondCheckpointGiven  = true;
              rsState.storyCheckpointX       = SC_X;
            } else if (spawnX > PJ_X) {
              rsState.junkyardHealthGiven    = true;
              rsState.postJunkyardHealthGiven = true;
              rsState.storyCheckpointX       = PJ_X;
            } else if (spawnX > JY_X) {
              rsState.junkyardHealthGiven    = true;
              rsState.storyCheckpointX       = 0; // ainda sem CP real → morre → início
            } else {
              rsState.storyCheckpointX       = 0; // zona inicial → morre → início
            }
          }
          // Drone aparece atrás do Horácio
          rsState.drone.x = spawnX - 320;
          rsState.drone.y = GROUND_Y - 220;
          rsState.drone.vx = 0;
          rsState.drone.vy = 0;
          rsState.drone.shootTimer = SHOOT_COOLDOWN * 2;
          gsRef.current = rsState;
          editorTestModeRef.current = true;
          editorRealStoryModeRef.current = true;
          startBeatMP3Forced();
          initDogAmbient(dogGrowlUrl);
        } else {
          const keys = keysRef.current;
          if (keys.left)  editorCamXRef.current = Math.max(0, editorCamXRef.current - EDITOR_PAN_SPEED);
          if (keys.right) editorCamXRef.current = editorCamXRef.current + EDITOR_PAN_SPEED;
          if (keys.up)    editorCamYRef.current = Math.max(-4000, editorCamYRef.current - EDITOR_PAN_SPEED);
          if (keys.down)  editorCamYRef.current = Math.min(300,   editorCamYRef.current + EDITOR_PAN_SPEED);
          // ── Auto-scroll de borda durante drag (cursor-based) ─────────────
          if (editorDragRef.current && editorDragRef.current.mode === 'move') {
            const selIdx = editorSelectedIdxRef.current;
            const p = platformsRef.current[selIdx];
            if (p) {
              const cy = editorMouseCanvasRef.current.y;
              const cx = editorMouseCanvasRef.current.x;
              const EDGE = 70;
              const SPEED = 12;

              const applyScrollY = (delta: number) => {
                // delta < 0 = câmera sobe; > 0 = desce
                editorCamYRef.current = Math.max(-4000, Math.min(300, editorCamYRef.current + delta));
                // Mover objeto e referenciais do drag pelo mesmo delta → objeto sobe/desce no mundo
                p.y += delta;
                editorDragRef.current!.origY   += delta;
                editorDragRef.current!.startWY += delta;
                editorDragRef.current!.origGroupPositions = editorDragRef.current!.origGroupPositions.map((entry) => {
                  const gp = platformsRef.current[entry.idx];
                  if (gp) gp.y += delta;
                  return { ...entry, origY: entry.origY + delta };
                });
              };

              const applyScrollX = (delta: number) => {
                const prevX = editorCamXRef.current;
                editorCamXRef.current = Math.max(0, editorCamXRef.current + delta);
                const actual = editorCamXRef.current - prevX;
                p.x += actual;
                editorDragRef.current!.origX   += actual;
                editorDragRef.current!.startWX += actual;
                editorDragRef.current!.origGroupPositions = editorDragRef.current!.origGroupPositions.map((entry) => {
                  const gp = platformsRef.current[entry.idx];
                  if (gp) gp.x += actual;
                  return { ...entry, origX: entry.origX + actual };
                });
              };

              if (cy < EDGE) {
                applyScrollY(-Math.ceil(SPEED * (1 - cy / EDGE)));
              } else if (cy > CANVAS_H - EDGE) {
                applyScrollY(Math.ceil(SPEED * ((cy - (CANVAS_H - EDGE)) / EDGE)));
              }
              if (cx < EDGE) {
                applyScrollX(-Math.ceil(SPEED * (1 - cx / EDGE)));
              } else if (cx > CANVAS_W - EDGE) {
                applyScrollX(Math.ceil(SPEED * ((cx - (CANVAS_W - EDGE)) / EDGE)));
              }
            }
          }
        }
        // Delete key: remove hitbox selecionada em modo colisão
        if (editorDeleteBoxJustPressed.current) {
          editorDeleteBoxJustPressed.current = false;
          const p = platformsRef.current[editorSelectedIdxRef.current];
          if (p && editorCollisionModeRef.current) {
            pushEditorHistory();
            editorCollisionBoxIdxRef.current = removePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
            const hasBoxes = (p.collisionBoxes?.length ?? 0) > 0;
            if (!hasBoxes) editorCollisionModeRef.current = false;
            copyPlatText(platCoordText(p), hasBoxes ? `✓ BOX REMOVIDA` : `✓ COLISÃO RESETADA`);
          } else {
            deleteEditorSelectedObjects();
          }
        }
        gs.camera.x = editorCamXRef.current;
        gs.camera.y = editorCamYRef.current;
        spaceJustPressed.current = false;
        editorJustPressed.current = false;
        editorSpawnJustPressed.current = false;
      } else if (gs.gamePhase === 'paused') {
        if (!wasPausedRef.current) {
          wasPausedRef.current = true;
          duckMusic(true);
          silenceDogAmbient(); // corta imediatamente; updateDogAmbient retoma no unpause
        }
        if (pauseDownJustPressed.current) {
          pauseSelection.current = 1;
          pauseDownJustPressed.current = false;
        }
        if (pauseUpJustPressed.current) {
          pauseSelection.current = 0;
          pauseUpJustPressed.current = false;
        }
        if (escJustPressed.current) {
          // ESC despausa diretamente
          escJustPressed.current = false;
          enterJustPressed.current = false;
          spaceJustPressed.current = false;
          gs.gamePhase = 'playing';
          wasPausedRef.current = false;
          duckMusic(false);
        } else if (enterJustPressed.current || spaceJustPressed.current) {
          enterJustPressed.current = false;
          spaceJustPressed.current = false;
          wasPausedRef.current = false;
          duckMusic(false);
          if (pauseSelection.current === 0) {
            gs.gamePhase = 'playing';
          } else {
            editorTestModeRef.current = false;
            editorRealStoryModeRef.current = false;
            stopBeat();
            stopDogAmbient();
            menuFocusRef.current = 0;
            gs.gamePhase = 'menu';
          }
        }
      } else if (gs.gamePhase === 'race-countdown') {
        // Congela todas as teclas durante a contagem regressiva
        clearKeys();
        gs.raceCountdownTimer -= dt;
        if (gs.raceCountdownTimer <= 0) {
          gs.raceCountdownTimer = 0;
          gs.gamePhase = 'playing';
        }
      } else if (gs.gamePhase === 'playing') {
        if (editorSpawnJustPressed.current && editorTestModeRef.current) {
          // Ctrl pressionado durante teste do editor: volta pro editor onde o jogador está
          editorSpawnJustPressed.current = false;
          spaceJustPressed.current = false;
          editorCamXRef.current = gs.camera.x;
          gs.gamePhase = 'editor';
          gs.camera.x = editorCamXRef.current;
          editorDroneEnabledRef.current = false;
          editorRealStoryModeRef.current = false;
          stopBeat();
          stopDogAmbient();
          gs.bullets = [];
        } else if (escJustPressed.current) {
          escJustPressed.current = false;
          pauseSelection.current = 0;
          pauseDownJustPressed.current = false;
          pauseUpJustPressed.current = false;
          spaceJustPressed.current = false;
          enterJustPressed.current = false;
          gs.gamePhase = 'paused';
        }
        gs.time += dt;
        showControls.current = gs.time < 8000;

        const spawnP = (x: number, y: number, color: string) =>
          spawnParticleHelper(gs.particles, x, y, color);

        const now = performance.now();
        const windowDive =
          (keys.down && (now - lastJumpPressTime.current) < DIVE_COMBO_WINDOW) ||
          (keys.space && (now - lastDownPressTime.current) < DIVE_COMBO_WINDOW);
        const effectiveKeys = windowDive ? { ...keys, dive: true } : keys;

        // Consulta grade espacial: só plataformas próximas ao jogador (~±900px)
        const PHYS_MARGIN = 900;
        const _nearbyPhys = spatialGridRef.current
          ? queryGrid(spatialGridRef.current, gs.player.x - PHYS_MARGIN, gs.player.x + PHYS_MARGIN)
          : gs.platforms;
        const _destroyedPlatSet = (gs.destroyedBoxIndices.length > 0 || gs.destroyedTireIndices.length > 0)
          ? new Set([
              ...gs.destroyedBoxIndices.map(i => gs.platforms[i]),
              ...gs.destroyedTireIndices.map(i => gs.platforms[i]),
            ])
          : null;
        const activePlatforms = _destroyedPlatSet
          ? _nearbyPhys.filter(p => !_destroyedPlatSet.has(p))
          : _nearbyPhys;

        // Janela de física própria do ghost: como ele corre livre e pode ficar
        // bem longe do jogador (ex: jogador parado, ghost correndo a fase toda
        // pra "simular uma corrida real"), usar a janela do jogador faria o
        // ghost cair no vácuo assim que passasse de ±900px dele. Consulta uma
        // janela separada centrada na posição do PRÓPRIO ghost.
        const _ghostForPhys = ghostEnabledRef.current ? ghostPlayerRef.current : null;
        const _nearbyGhostPhys = (_ghostForPhys && spatialGridRef.current)
          ? queryGrid(spatialGridRef.current, _ghostForPhys.x - PHYS_MARGIN, _ghostForPhys.x + PHYS_MARGIN)
          : null;
        const ghostActivePlatforms = _nearbyGhostPhys
          ? (_destroyedPlatSet ? _nearbyGhostPhys.filter(p => !_destroyedPlatSet.has(p)) : _nearbyGhostPhys)
          : activePlatforms;
        const _prevOnGround = gs.player.onGround;
        const _prevVy = gs.player.vy;
        const _prevJumpCount = gs.player.jumpCount;
        const _prevPlayerState = gs.player.state;
        // No modo Corrida sem drone, caixas podem ser escaladas no ferro-velho,
        // mas o trecho final precisa permitir a ejeção lateral do wall-run
        // para alcançar a parede de tic-tac. A física usa allowBoxClimb para
        // bloquear essa ejeção, então ele só fica ativo antes da região final.
        const _playerAllowBoxClimb =
          gs.gameMode === 'race' &&
          !gs.raceDroneEnabled &&
          gs.player.x < 35000;
        updatePlayer(
          gs.player,
          effectiveKeys,
          activePlatforms,
          dt,
          spawnP,
          _playerAllowBoxClimb,
        );

        // ── Ghost Horácio IA ─────────────────────────────────────────────────
        if (ghostEnabledRef.current) {
          const _ghost = ghostPlayerRef.current;
          if (!_ghost || isGhostDead(_ghost)) {
            // Registra marcador de morte na última posição conhecida
            if (_ghost && (_ghost.state === 'dead' || _ghost.y > CANVAS_H + 20)) {
              const _dm = ghostDeathMarkersRef.current;
              _dm.push({ x: _ghost.x + _ghost.w / 2, y: Math.min(_ghost.y + _ghost.h / 2, CANVAS_H + 60) });
              if (_dm.length > 8) _dm.shift();
              // Persiste rastro + marcadores em arquivo para análise pelo agente
              fetch('/__editor/save-ghost-trail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  spawnX: ghostSpawnRef.current.x,
                  spawnY: ghostSpawnRef.current.y,
                  trail: ghostTrailRef.current,
                  deaths: ghostDeathMarkersRef.current,
                  savedAt: new Date().toISOString(),
                }),
              }).catch(() => { /* best-effort */ });
            }
            // NÃO limpa a trilha ao morrer — fica visível para análise.
            // Só zera ao pressionar G para desligar e religar o ghost.
            ghostTrailTickRef.current = 0;
            ghostAutoReplayArmedRef.current = false; // nova run: libera piloto automático
            ghostTictacSnapDoneRef.current  = false; // libera snap do tic-tac
            // Respawn do ghost:
            // • Modo real (/): respawna no último checkpoint do Horácio (gs.storyCheckpointX),
            //   exatamente como Horácio faz — nunca avança além do mapa nem fica no limbo.
            // • Modo normal (Ctrl / wall-test): respawna sempre no ponto onde G foi
            //   pressionado (ghostSpawnRef.current) — spawn fixo de debug, sem avançar.
            let _cpX: number;
            let _cpY: number;
            if (editorRealStoryModeRef.current) {
              _cpX = gs.storyCheckpointX > 0 ? gs.storyCheckpointX : ghostSpawnRef.current.x;
              _cpY = GROUND_Y - PLAYER_H;
            } else {
              _cpX = ghostSpawnRef.current.x;
              _cpY = ghostSpawnRef.current.y;
            }
            ghostPlayerRef.current = createGhostPlayer(_cpX, _cpY);
          } else {
            // ── Piloto automático: auto-dispara o player-recording quando o ghost
            //    cruza o startX exato da gravação (±40px de tolerância). Após o
            //    replay terminar, ghostPlayer.ts já retorna a IA normal sozinho
            //    (replayFrames = null → stepGhostPlayer volta ao comportamento padrão).
            if (
              !ghostAutoReplayArmedRef.current &&
              ghostAutoReplayDataRef.current &&
              ghostAutoReplayDataRef.current.length > 0
            ) {
              const _trigX = ghostAutoReplayStartXRef.current;
              const _ghostCX = _ghost.x + _ghost.w / 2;
              // O rival/ghost pode avançar até ~325px em um frame (dt máximo
              // de 50ms). Não use uma faixa estreita com limite superior:
              // atravessar essa faixa fazia o replay nunca ser carregado.
              if (_ghostCX >= _trigX - 40 && _ghostCX < _trigX + 420) {
                ghostAutoReplayArmedRef.current = true;
                // Snapa o ghost para a posição exata onde a gravação foi feita
                _ghost.x  = ghostAutoReplayStartXRef.current;
                _ghost.y  = ghostAutoReplayStartYRef.current;
                _ghost.vx = 0;
                _ghost.vy = 0;
                loadGhostRecording(_ghost, ghostAutoReplayDataRef.current);
              }
            }
            // ── Snap determinístico do tic-tac ──────────────────────────────────
            // Quando o ghost se aproxima da parede noHang (x:36321), pequenas
            // diferenças acumuladas de física ao longo dos ~36000px anteriores
            // podem deixá-lo em estado ligeiramente diferente (vx, vy, jumpCount)
            // dependendo do dt de cada frame e de quanto tempo passou longe do
            // jogador. O snap normaliza o estado ANTES do wall-run para que a
            // sequência wall-run → eject left → pulo na plataforma seja idêntica
            // a uma gravação fixa, independente da distância ao jogador.
            const TICTAC_SNAP_X = 36260; // ~60px antes da parede x:36321
            const _ghostCXSnap  = _ghost.x + _ghost.w / 2;
            if (
              !ghostTictacSnapDoneRef.current &&
              _ghostCXSnap >= TICTAC_SNAP_X - 10 &&
              _ghostCXSnap <  TICTAC_SNAP_X + 80
            ) {
              ghostTictacSnapDoneRef.current = true;
              // Garante chegada no chão, à velocidade normal, com jumps frescos
              _ghost.y              = GROUND_Y - PLAYER_H;
              _ghost.vy             = 0;
              _ghost.vx             = PLAYER_SPEED;
              _ghost.onGround       = true;
              _ghost.jumpCount      = 0;
              _ghost.doubleJumpReady = false;
              _ghost.isWallRunning  = false;
              _ghost.isWallClimbUp  = false;
              _ghost.isWallHanging  = false;
              _ghost.isSideFlipping = false;
              _ghost.isRolling      = false;
            }
            ghostLastDecisionRef.current = stepGhostPlayer(_ghost, ghostActivePlatforms, dt, spawnP);
            // Registra posição na trilha a cada 3 frames (~50ms @ 60fps)
            ghostTrailTickRef.current++;
            if (ghostTrailTickRef.current >= 3) {
              ghostTrailTickRef.current = 0;
              const _trail = ghostTrailRef.current;
              _trail.push({ x: _ghost.x + _ghost.w / 2, y: _ghost.y + _ghost.h / 2, d: ghostLastDecisionRef.current });
              // No modo teste real (/) o rastro nunca é apagado — fica visível a fase
              // inteira. Só o wall-test mantém o cap de ~25s (histórico curto de debug).
              if (!editorRealStoryModeRef.current && _trail.length > 500) _trail.shift();
            }

            // ── Detecção de "travado sem morrer" → salva trail p/ análise ──────
            // Alguns obstáculos (ex: muro alto pós-escadaria) podem prender o
            // ghost sem matá-lo (ele fica só quicando/oscilando no lugar, tentando
            // pular e recuando). Como o save normal só dispara na morte, isso nunca
            // gerava dado. Mede DESLOCAMENTO LÍQUIDO numa janela de 2.5s (não delta
            // frame-a-frame, que falha com oscilação: o ghost pode variar >3px por
            // frame enquanto quica no lugar sem nunca progredir de verdade).
            ghostStuckTimeRef.current += dt;
            if (ghostStuckTimeRef.current >= 2500) {
              const _netMoved = Math.abs(_ghost.x - ghostStuckXRef.current);
              if (_netMoved < 40) {
                if (!ghostStuckSavedRef.current) {
                  ghostStuckSavedRef.current = true;
                  fetch('/__editor/save-ghost-trail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      spawnX: ghostSpawnRef.current.x,
                      spawnY: ghostSpawnRef.current.y,
                      trail: ghostTrailRef.current,
                      deaths: ghostDeathMarkersRef.current,
                      stuckAt: { x: _ghost.x, y: _ghost.y, decision: ghostLastDecisionRef.current },
                      reason: 'stuck',
                      savedAt: new Date().toISOString(),
                    }),
                  }).catch(() => { /* best-effort */ });
                }
              } else {
                ghostStuckSavedRef.current = false; // progrediu de verdade: libera próximo save
              }
              ghostStuckTimeRef.current = 0;
              ghostStuckXRef.current = _ghost.x;
            }
            // ── Checkpoint próprio do ghost — só no modo teste real (/) ────
            if (editorRealStoryModeRef.current) {
              if (!ghostCp1PassedRef.current && _ghost.x > 21720) {
                ghostCp1PassedRef.current = true;
                ghostCheckpointXRef.current = _ghost.x;
              }
              if (!ghostCp2PassedRef.current && _ghost.x > 30598) {
                ghostCp2PassedRef.current = true;
                ghostCheckpointXRef.current = _ghost.x;
              }
            }
          }
        }

        // ── Rival da Corrida ─────────────────────────────────────────────────
        if (gs.gameMode === 'race' && racePlayerRef.current) {
          const _rival = racePlayerRef.current;
          if (isGhostDead(_rival)) {
            // Respawna no último checkpoint do rival
            // Usa a posição fixa e segura do último checkpoint conquistado,
            // nunca a posição exata do frame em que ele morreu.
            const _rCpX = gs.raceCheckpointsEnabled
              ? (raceCheckpointXRef.current >= 30598
                ? 30598
                : raceCheckpointXRef.current >= 21720
                  ? 21720
                  : 80)
              : 80;
            racePlayerRef.current = createGhostPlayer(_rCpX, GROUND_Y - PLAYER_H);
            // O checkpoint do segundo rio fica antes da gravação da escadaria.
            // Permite repetir o trecho gravado numa nova tentativa do rival.
            raceReplayArmedRef.current = _rCpX >= ghostAutoReplayStartXRef.current - 80;
            raceTictacSnapDoneRef.current = _rCpX >= 36260;
          } else {
            // Exatamente a mesma janela física usada pelo ghost de teste.
            // Uma janela maior muda quais paredes são detectadas por
            // computeGhostKeys e pode alterar a escolha do muro do tic-tac.
            const _RIVAL_WINDOW = 900;
            const _rivalPlatsNear = spatialGridRef.current
              ? queryGrid(spatialGridRef.current, _rival.x - _RIVAL_WINDOW, _rival.x + _RIVAL_WINDOW)
              : gs.platforms;
            const _rivalPlats = _destroyedPlatSet
              ? _rivalPlatsNear.filter(p => !_destroyedPlatSet.has(p))
              : _rivalPlatsNear;

            // ── Replay da escadaria/telhado ─────────────────────────────────
            // O ghost de teste usa a gravação do Horácio para transpor o muro
            // alto em x=31676. O rival da corrida deve usar exatamente a mesma
            // sequência de inputs, em vez de tentar a IA procedural nessa zona.
            if (
              !raceReplayArmedRef.current &&
              ghostAutoReplayDataRef.current &&
              ghostAutoReplayDataRef.current.length > 0
            ) {
              const _trigX = ghostAutoReplayStartXRef.current;
              const _rivalCX = _rival.x + _rival.w / 2;
              // O replay é obrigatório para o trecho programado. Se o rival já
              // estiver muito à frente quando a gravação terminar de carregar,
              // não podemos deixar a IA assumir silenciosamente: reposicionamos
              // no início exato e executamos todos os frames, como no ghost.
              if (_rivalCX >= _trigX - 40) {
                raceReplayArmedRef.current = true;
                _rival.x = ghostAutoReplayStartXRef.current;
                _rival.y = ghostAutoReplayStartYRef.current;
                _rival.vx = 0;
                _rival.vy = 0;
                loadGhostRecording(_rival, ghostAutoReplayDataRef.current);
              }
            }

            // ── Snap do tic-tac final ────────────────────────────────────────
            // A gravação termina antes do muro curto final. Normaliza o estado
            // do rival com os mesmos valores usados pelo ghost de teste para
            // garantir a entrada consistente no wall-run/ejeção do tic-tac.
            const RACE_TICTAC_SNAP_X = 36260;
            const _rivalCXSnap = _rival.x + _rival.w / 2;
            if (
              !raceTictacSnapDoneRef.current &&
              !isGhostReplayActive(_rival) &&
              _rivalCXSnap >= RACE_TICTAC_SNAP_X - 80 &&
              _rivalCXSnap < RACE_TICTAC_SNAP_X + 420
            ) {
              raceTictacSnapDoneRef.current = true;
              _rival.y = GROUND_Y - PLAYER_H;
              _rival.vy = 0;
              _rival.vx = PLAYER_SPEED;
              _rival.onGround = true;
              _rival.jumpCount = 0;
              _rival.doubleJumpReady = false;
              _rival.isWallRunning = false;
              _rival.isWallClimbUp = false;
              _rival.isWallHanging = false;
              _rival.isSideFlipping = false;
              _rival.isRolling = false;
            }

            stepGhostPlayer(
              _rival,
              _rivalPlats,
              dt,
              spawnP,
              // allowBoxClimb=true permite escalar caixas (ferrovelho e outros
              // obstáculos de caixas), mas DESATIVA canJumpOffWall em physics.ts
              // (`&& !allowBoxClimb`), impedindo a ejeção lateral do wall-run
              // necessária para o tic-tac no muro x:36321.
              // Solução: usa true no geral (para caixas) e false apenas na zona
              // do tic-tac (x ≥ 35000), replicando exatamente o ghost de história.
              _rival.x < 35000,
            );

            // Checkpoints próprios do rival (mesmos X do modo história)
            if (gs.raceCheckpointsEnabled && _rival.x > 21720 && raceCheckpointXRef.current < 21720) {
              raceCheckpointXRef.current = _rival.x;
            }
            if (gs.raceCheckpointsEnabled && _rival.x > 30598 && raceCheckpointXRef.current < 30598) {
              raceCheckpointXRef.current = _rival.x;
            }

            // Rival cruzou o muro final antes do jogador → derrota
            const RIVAL_FINISH_X = 36346;
            if (_rival.x + _rival.w > RIVAL_FINISH_X && gs.gamePhase === 'playing') {
              gs.raceRivalWins += 1;
              gs.raceRoundNumber = Math.min(gs.raceRoundNumber + 1, gs.raceRoundTarget * 2 - 1);
              const seriesOver = gs.raceRivalWins >= gs.raceRoundTarget;
              if (seriesOver) {
                raceRoundWinnerRef.current = 'rival';
                raceRoundLoserXRef.current = gs.player.x;
                gs.gamePhase = 'victory';
                gs.victoryTimer = 2400;
                stopBeat();
              } else {
                // O rival reinicia a volta imediatamente. Horácio continua no
                // mesmo frame e no mesmo estado, sem passar por victory, para
                // não interromper o movimento nem o tic-tac do jogador.
                racePlayerRef.current = createGhostPlayer(80, GROUND_Y - PLAYER_H);
                raceCheckpointXRef.current = 0;
                raceReplayArmedRef.current = false;
                raceTictacSnapDoneRef.current = false;
                raceRoundWinnerRef.current = null;
                raceRoundLoserXRef.current = gs.player.x;
                raceInterRoundTransitionRef.current = false;
              }
            }
          }
        }

        // ── Sons de pulo e pouso ─────────────────────────────────────────────
        if (gs.player.jumpCount > _prevJumpCount) {
          if (gs.player.jumpCount === 2) playDoubleJump();
          else playJump();
        }
        if (!_prevOnGround && gs.player.onGround && _prevVy > 4) {
          playLand(_prevVy > 10 ? 0.45 : 0.28);
        }

        // ── Passadas do Horácio (modo história, teste simples e teste real) ──
        // Um único bloco cobre os 3 modos pois todos passam por gamePhase==='playing'
        if (gs.player.state === 'run' && gs.player.onGround) {
          playerStepTimerRef.current += dt;
          if (playerStepTimerRef.current >= 650) {
            playerStepTimerRef.current %= 650;
            playPlayerStep(0.38 * horacioVolumeRef.current);
          }
        } else {
          // Reseta cheio: próxima corrida dispara o 1º passo imediatamente
          playerStepTimerRef.current = 650;
        }

        // ── Pneus amortecedores: destrói ao pousar em cima ──────────────────
        if (!_prevOnGround && gs.player.onGround && _prevVy > 3) {
          const ph = gs.player.h;
          const feetY = gs.player.y + ph;
          for (let _ci = 0; _ci < gs.platforms.length; _ci++) {
            const _cp = gs.platforms[_ci];
            if (_cp.type !== 'tireHideout') continue;
            if (Math.abs(feetY - _cp.y) > 12) continue;
            if (gs.player.x + gs.player.w <= _cp.x || gs.player.x >= _cp.x + _cp.w) continue;
            // Som de impacto em qualquer tireHideout ao cair
            const _tireIndVol = (typeof _cp.sfxVolume === 'number' && isFinite(_cp.sfxVolume)) ? _cp.sfxVolume : 1;
            playTireHit(0.7 * _tireIndVol * (sfxCategoryVolumesRef.current['tire'] ?? 1));
            if (!_cp.cushionOnLand) continue;
            if (gs.destroyedTireIndices.includes(_ci)) continue;
            gs.destroyedTireIndices.push(_ci);
            gs.screenShake = 3;
            spawnRollingTiresFromHideout(_cp, gs.player.vx, gs.flyingTires);
          }
        }

        // Camera follows player
        const targetCamX = gs.player.x - CANVAS_W * CAMERA_LEAD_X;
        gs.camera.x += (targetCamX - gs.camera.x) * 0.1;
        if (gs.camera.x < 0) gs.camera.x = 0;
        const targetCamY = Math.min(0, gs.player.y - CANVAS_H * 0.38) + playCamFreeYRef.current;
        gs.camera.y += (targetCamY - gs.camera.y) * 0.12;
        if (Math.abs(gs.camera.y) < 0.5) gs.camera.y = 0;

        // Toggle drone com Z no modo de teste do editor
        if (gs.gameMode === 'wall-test' && zJustPressed.current) {
          zJustPressed.current = false;
          editorDroneEnabledRef.current = !editorDroneEnabledRef.current;
          if (editorDroneEnabledRef.current) {
            // Spawna drone perto do jogador
            gs.drone.x = gs.player.x + 200;
            gs.drone.y = gs.player.y - 120;
            gs.drone.vx = 0;
            gs.drone.vy = 0;
            gs.drone.shootTimer = SHOOT_COOLDOWN * 2;
            gs.bullets = [];
          } else {
            gs.bullets = [];
          }
        } else {
          zJustPressed.current = false;
        }

        // Toggle gravação de inputs com R — funciona em qualquer modo de jogo
        if (gs.gamePhase === 'playing' && rJustPressed.current) {
          if (!isRecordingRef.current) {
            // Inicia gravação
            isRecordingRef.current = true;
            playerRecordingBufferRef.current = [];
            playerRecordingStartPosRef.current = { x: gs.player.x, y: gs.player.y };
          } else {
            // Para gravação e salva
            isRecordingRef.current = false;
            const frames = playerRecordingBufferRef.current;
            ghostReplayFramesRef.current = frames;
            // Atualiza o piloto automático na hora — sem precisar recarregar a página
            ghostAutoReplayDataRef.current  = frames;
            ghostAutoReplayStartXRef.current = playerRecordingStartPosRef.current.x;
            ghostAutoReplayStartYRef.current = playerRecordingStartPosRef.current.y;
            fetch('/__editor/save-player-recording', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startX: playerRecordingStartPosRef.current.x,
                startY: playerRecordingStartPosRef.current.y,
                frames,
                savedAt: new Date().toISOString(),
              }),
            }).catch(() => { /* best-effort */ });
          }
        }
        rJustPressed.current = false;

        // Grava inputs do jogador frame a frame enquanto gravação ativa
        if (isRecordingRef.current && gs.gamePhase === 'playing') {
          playerRecordingBufferRef.current.push({ ...effectiveKeys });
        }

        // Toggle ghost com G no modo de teste do editor (wall-test OU teste real via /)
        if ((gs.gameMode === 'wall-test' || editorRealStoryModeRef.current) && gJustPressed.current) {
          ghostEnabledRef.current = !ghostEnabledRef.current;
          if (ghostEnabledRef.current) {
            // Salva checkpoint na posição atual do Horácio e limpa histórico anterior
            ghostSpawnRef.current = { x: gs.player.x, y: gs.player.y };
            const _newGhost = createGhostPlayer(gs.player.x, gs.player.y);
            // NÃO carrega o recording aqui — o piloto automático dispara no startX
            // exato da gravação. Carregar aqui faria o ghost replay do lugar errado.
            ghostAutoReplayArmedRef.current = false; // libera trigger para nova run
            ghostPlayerRef.current = _newGhost;
            ghostTrailRef.current = [];
            ghostDeathMarkersRef.current = [];
            ghostTrailTickRef.current = 0;
            ghostLastDecisionRef.current = 'IDLE';
            // Reset dos checkpoints próprios do ghost
            ghostCheckpointXRef.current = 0;
            ghostCp1PassedRef.current = false;
            ghostCp2PassedRef.current = false;
          } else {
            ghostPlayerRef.current = null;
            ghostTrailRef.current = [];
            ghostDeathMarkersRef.current = [];
            ghostLastDecisionRef.current = 'IDLE';
          }
        }
        gJustPressed.current = false;

        const _droneActive =
          (gs.gameMode !== 'wall-test' || editorDroneEnabledRef.current) &&
          !(gs.gameMode === 'race' && !gs.raceDroneEnabled);
        if (_droneActive) {
          const _prevBulletCount = gs.bullets.length;
          // Modo corrida com drone: aponta sempre para o corredor vivo que
          // estiver mais à frente. Se o líder morrer, o alvo troca para o
          // outro corredor imediatamente — nunca acompanha o respawn.
          let _raceDroneTarget: Player | undefined;
          if (gs.gameMode === 'race' && gs.raceDroneEnabled && racePlayerRef.current) {
            const _racePlayer = racePlayerRef.current as Player;
            const _horacioAlive = gs.player.state !== 'dead';
            const _rivalAlive = _racePlayer.state !== 'dead';
            if (_horacioAlive && _rivalAlive) {
              _raceDroneTarget = _racePlayer.x > gs.player.x ? _racePlayer : gs.player;
            } else if (_rivalAlive) {
              _raceDroneTarget = _racePlayer;
            } else {
              _raceDroneTarget = gs.player;
            }
          }
          const shakeAmount = updateDrone(gs.drone, gs.player, gs.bullets, dt, spawnP, droneSolidPlatsRef.current, undefined, undefined, _raceDroneTarget);
          if (shakeAmount > 0) gs.screenShake = shakeAmount;
          if (gs.bullets.length > _prevBulletCount) {
            // Só toca se o drone estiver visível na tela de Horácio;
            // fora do viewport = silêncio total (realismo espacial)
            const _droneScreenX = gs.drone.x - gs.camera.x;
            if (_droneScreenX > -DRONE_W && _droneScreenX < CANVAS_W + DRONE_W) {
              playShot();
            }
          }

          gs.bullets = updateBullets(gs.bullets, gs.player, gs.platforms, dt, () => {
            gs.screenShake = 6;
            for (let i = 0; i < 8; i++) spawnP(gs.player.x + PLAYER_W / 2, gs.player.y + PLAYER_H / 2, '#cc2222');
            playHit();
          }, gs.destroyedBoxIndices, gs.particles, gs.fallingBoxes, gs.flyingTires, gs.destroyedTireIndices,
          gs.bystanders, (bx: number, by: number, vol: number) => {
            gs.screenShake = 4;
            for (let i = 0; i < 10; i++) spawnP(bx, by, i % 2 === 0 ? '#cc1111' : '#881111');
            playNpcScream(0.18 * vol);
          }, (_vol: number) => { playTireHit(0.7 * (sfxCategoryVolumesRef.current['tire'] ?? 1)); }, (_vol: number) => { playBoxHit(0.7 * (sfxCategoryVolumesRef.current['box'] ?? 1)); },
          (_vol: number) => { playMetalHit(0.7 * _vol * (sfxCategoryVolumesRef.current['obstacle'] ?? 0.5)); },
          spatialGridRef.current, platformIndexMapRef.current,
          (_vol: number) => { playCarHit(0.7 * _vol * (sfxCategoryVolumesRef.current['car'] ?? 1)); },
          gs.gameMode === 'race' && racePlayerRef.current ? [racePlayerRef.current as Player] : []);

          updateFallingBoxes(gs.fallingBoxes, gs.platforms, gs.destroyedBoxIndices, gs.destroyedTireIndices);
          updateFlyingTires(gs.flyingTires);
        }

        // Fade do som do cachorro por distância
        if (gs.dogs.length > 0) {
          const _dog = gs.dogs[0];
          const _dist = Math.hypot(
            (_dog.x + _dog.w / 2) - (gs.player.x + PLAYER_W / 2),
            (_dog.y + _dog.h / 2) - (gs.player.y + PLAYER_H / 2),
          );
          updateDogAmbient(_dist);
        }

        updateDogs(
          gs.dogs, gs.player, dt,
          (_vol: number) => {
            gs.screenShake = 5;
            for (let i = 0; i < 6; i++) spawnP(gs.player.x + PLAYER_W / 2, gs.player.y + PLAYER_H / 2, '#cc2222');
            playDogBite(0.6 * (sfxCategoryVolumesRef.current['dog'] ?? 1));
          },
          () => { /* growl periódico silenciado — som ambiente já cobre */ },
        );

        updateBystanders(gs.bystanders, gs.player, gs.drone, gs.droneIntroduced, dt, (spriteId, vol) => {
          playCrowdPanic(0.32);
          const baseVol = spriteId === 2 ? 0.10 : 0.42;
          playBystanderScream(spriteId, baseVol * vol);
        });
        // Decrementa deadTimer e remove NPCs que já desapareceram
        for (const by of gs.bystanders) {
          if (by.state === 'dead') by.deadTimer = Math.max(0, by.deadTimer - dt);
        }
        gs.bystanders = gs.bystanders.filter(by => by.state !== 'dead' || by.deadTimer > 0);
        // Para o som de pânico quando não há mais bystanders ativos
        if (gs.bystanders.length === 0) stopCrowdPanic();

        // ── Gritos ambientes na zona da vila (x 25909–32000) ────────────────
        const VILLAGE_ZONE_START = 25909;
        const VILLAGE_ZONE_END   = 32000;
        if (
          gs.player.x > VILLAGE_ZONE_START &&
          gs.player.x < VILLAGE_ZONE_END &&
          gs.player.state !== 'dead'
        ) {
          gs.villageScreamTimer -= dt;
          if (gs.villageScreamTimer <= 0) {
            // Grito real de pessoa (MP3 gerado por IA), vol abaixo da música (0.41)
            playRealScream(0.28);
            // Intervalo aleatório 1.8s–5s para soar orgânico
            gs.villageScreamTimer = 1800 + Math.random() * 3200;
          }
        } else {
          gs.villageScreamTimer = 0;
        }

        gs.particles = updateParticles(gs.particles, dt);

        if (gs.screenShake > 0) gs.screenShake = Math.max(0, gs.screenShake - 0.4);

        // ── Bônus de vida ao sair do ferro velho ───────────────────────────
        // Na Corrida, checkpoints desligados impedem apenas o respawn neles;
        // a recompensa de sangue continua sendo concedida ao atravessá-los.
        const POST_JUNKYARD_HEALTH_TRIGGER_X = 21720;
        if (
          (gs.gameMode === 'story' || gs.gameMode === 'race') &&
          !gs.postJunkyardHealthGiven &&
          gs.player.x > POST_JUNKYARD_HEALTH_TRIGGER_X &&
          gs.player.state !== 'dead'
        ) {
          gs.postJunkyardHealthGiven = true;
          gs.storyCheckpointX = gs.player.x;
          playCheckpoint();
          if (gs.player.health < gs.player.maxHealth) {
            gs.player.health = Math.min(gs.player.health + 1, gs.player.maxHealth);
            gs.screenShake = 2;
            for (let i = 0; i < 12; i++) {
              spawnP(
                gs.player.x + PLAYER_W / 2 + (Math.random() - 0.5) * 30,
                gs.player.y + PLAYER_H / 2 + (Math.random() - 0.5) * 20,
                i % 3 === 0 ? '#60cc60' : i % 3 === 1 ? '#3ea850' : '#a0e870',
              );
            }
          }
        }

        // ── Segundo checkpoint: muro x:30578, após o prédio de escada ──
        const SECOND_CP_TRIGGER_X = 30598; // borda direita do muro (x:30578 + w:20)
        if (
          (gs.gameMode === 'story' || gs.gameMode === 'race') &&
          !gs.secondCheckpointGiven &&
          gs.player.x > SECOND_CP_TRIGGER_X &&
          gs.player.state !== 'dead'
        ) {
          gs.secondCheckpointGiven = true;
          gs.storyCheckpointX = gs.player.x;
          playCheckpoint();
          if (gs.player.health < gs.player.maxHealth) {
            gs.player.health = Math.min(gs.player.health + 1, gs.player.maxHealth);
            gs.screenShake = 2;
            for (let i = 0; i < 12; i++) {
              spawnP(
                gs.player.x + PLAYER_W / 2 + (Math.random() - 0.5) * 30,
                gs.player.y + PLAYER_H / 2 + (Math.random() - 0.5) * 20,
                i % 3 === 0 ? '#60cc60' : i % 3 === 1 ? '#3ea850' : '#a0e870',
              );
            }
          }
        }

        // ── Trigger de vitória: Horácio passou o muro final ──
        const VICTORY_TRIGGER_X = 36346; // borda direita do muro (x:36321 + w:25)
        if ((!editorTestModeRef.current || editorRealStoryModeRef.current) && gs.player.x + PLAYER_W > VICTORY_TRIGGER_X && gs.player.state !== 'dead' && gs.player.onGround) {
          let raceSeriesOver = true;
          if (gs.gameMode === 'race') {
            raceRoundWinnerRef.current = 'player';
            raceRoundLoserXRef.current = racePlayerRef.current?.x ?? 80;
            gs.racePlayerWins += 1;
            gs.raceRoundNumber = Math.min(gs.raceRoundNumber + 1, gs.raceRoundTarget * 2 - 1);
            raceSeriesOver = gs.racePlayerWins >= gs.raceRoundTarget;
            if (!raceSeriesOver) {
              // Round intermediário: não mostra a animação de vitória.
              // O próximo frame já reposiciona o vencedor para a nova volta.
              gs.gamePhase = 'victory';
              gs.victoryTimer = 0;
              raceInterRoundTransitionRef.current = true;
            }
          }
          if (raceSeriesOver) {
            gs.gamePhase = 'victory';
            gs.victoryTimer = gs.gameMode === 'race' ? 2400 : 3600;
            stopBeat();
            playVictory();
          }
        }

        // ── Grito ao cair no buraco (pés 30px abaixo do chão = entrou no pothole) ─
        if (gs.gamePhase === 'playing' && gs.player.y + PLAYER_H > GROUND_Y + 30 && !pitFallSoundPlayedRef.current) {
          pitFallSoundPlayedRef.current = true;
          playGritoBuraco(0.42);
        }
        // Reseta o flag quando o jogador volta completamente acima do chão (após respawn)
        if (gs.player.y + PLAYER_H < GROUND_Y) {
          pitFallSoundPlayedRef.current = false;
        }

        // ── Som de morte (suprimido em mortes por buraco — grito já tocou) ──
        if (_prevPlayerState !== 'dead' && gs.player.state === 'dead' && !pitFallSoundPlayedRef.current) {
          playDeath();
        }

        // [MODO DE MORTE 2 — stand-by] Registra saúde enquanto vivo para uso no respawn
        // Para ativar: descomente esta linha E troque o bloco do checkpoint abaixo
        // pelo bloco "MODO DE MORTE 2" documentado mais abaixo.
        // if (gs.player.state !== 'dead') playerHealthBeforeDeathRef.current = gs.player.health;

        if (gs.player.state === 'dead') {
          if (editorTestModeRef.current && !editorRealStoryModeRef.current) {
            // Modo teste do editor (wall-test): respawna no ponto escolhido pelo editor
            const newState = makeInitialState('story');
            newState.gameMode = 'wall-test';
            newState.gamePhase = 'playing';
            newState.player.x = editorLastSpawnXRef.current;
            newState.player.y = editorLastSpawnYRef.current;
            newState.player.vx = 0;
            newState.player.vy = 0;
            newState.camera.x = Math.max(0, editorLastSpawnXRef.current - CANVAS_W * CAMERA_LEAD_X);
            clearKeys();
            gsRef.current = newState;
          } else if (gs.gameMode === 'race') {
            // ── Modo corrida: consome vida, rival segue correndo ──────────
            gs.lives = (gs.lives ?? 3) - 1;
            if (gs.lives <= 0) {
              gs.gamePhase = 'gameover';
            } else {
              const _raceCpX = gs.raceCheckpointsEnabled && gs.storyCheckpointX > 0
                ? gs.storyCheckpointX
                : 80;
              const _raceLives = gs.lives;
              const _raceTime = gs.time;
              const newState = makeInitialState('race');
              newState.gamePhase = 'playing';
              newState.time = _raceTime;
              newState.lives = _raceLives;
              newState.storyCheckpointX = _raceCpX;
              newState.player.x = _raceCpX;
              newState.player.y = GROUND_Y - PLAYER_H;
              newState.player.vx = 0;
              newState.player.vy = 0;
              newState.camera.x = Math.max(0, _raceCpX - CANVAS_W * CAMERA_LEAD_X);
              // O drone é uma entidade independente da corrida: preserva a
              // posição e o impulso atuais em vez de nascer junto do jogador.
              newState.drone.x = gs.drone.x;
              newState.drone.y = gs.drone.y;
              newState.drone.vx = gs.drone.vx;
              newState.drone.vy = gs.drone.vy;
              newState.drone.stuckTimer = gs.drone.stuckTimer;
              newState.drone.stuckLastX = gs.drone.stuckLastX;
              newState.raceDroneEnabled = raceDroneEnabledRef.current;
              newState.raceCheckpointsEnabled = raceCheckpointsEnabledRef.current;
              newState.raceRoundTarget = gs.raceRoundTarget;
              newState.raceRoundNumber = gs.raceRoundNumber;
              newState.racePlayerWins = gs.racePlayerWins;
              newState.raceRivalWins = gs.raceRivalWins;
              clearKeys();
              gsRef.current = newState;
              // Rival continua independentemente — racePlayerRef é preservado
            }
          } else {
            // ── Modo história: consome uma vida ──────────────────────────
            gs.lives = (gs.lives ?? 3) - 1;

            if (gs.lives <= 0) {
              // Sem vidas → Game Over
              gs.gamePhase = 'gameover';
            } else if (gs.storyCheckpointX > 0) {
              // Tem checkpoint: respawna com vida cheia, preserva vidas restantes
              const livesLeft = gs.lives;
              const cpX = gs.storyCheckpointX;
              const wasJunkyard = gs.junkyardHealthGiven;
              const wasPostJunkyard = gs.postJunkyardHealthGiven;
              const savedTime = gs.time; // cronômetro continua
              const newState = makeInitialState('story');
              newState.gamePhase = 'playing';
              newState.time = savedTime;
              newState.lives = livesLeft;
              newState.player.x = cpX;
              newState.player.y = GROUND_Y - PLAYER_H;
              newState.player.vx = 0;
              newState.player.vy = 0;
              newState.camera.x = Math.max(0, cpX - CANVAS_W * CAMERA_LEAD_X);
              // Preserva progresso de flags já conquistadas
              newState.junkyardHealthGiven = wasJunkyard;
              newState.postJunkyardHealthGiven = wasPostJunkyard;
              newState.secondCheckpointGiven = gs.secondCheckpointGiven;
              newState.storyCheckpointX = cpX;
              // Drone aparece atrás do Horácio em vez de no início do mapa
              newState.drone.x = cpX - 320;
              newState.drone.y = GROUND_Y - 200;
              newState.drone.stuckLastX = cpX - 320;
              clearKeys();
              gsRef.current = newState;
            } else {
              // Sem checkpoint: reinicia do início, mantém cronômetro e vidas
              const livesLeft = gs.lives;
              const savedTime = gs.time;
              resetGame('story');
              if (gsRef.current) {
                gsRef.current.time = savedTime;
                gsRef.current.lives = livesLeft;
              }
            }
          }
        }

        spaceJustPressed.current = false;
        editorSpawnJustPressed.current = false;
      } else if (gs.gamePhase === 'training') {
        // ── Sala de Treino ───────────────────────────────────────────────────
        if (escJustPressed.current) {
          // ESC → volta direto ao menu inicial
          escJustPressed.current = false;
          spaceJustPressed.current = false;
          gs.gamePhase = 'menu';
          showOptionsRef.current = false;
          gs.camera.x = 0; gs.camera.y = 0;
          gs.particles = [];
          // Retoma música do menu (chiptune), se não estiver mutado
          if (!menuMutedRef.current) {
            setMusicType('chiptune');
            startBeat();
          }
        } else {
          gs.time += dt;
          const spawnP = (x: number, y: number, color: string) =>
            spawnParticleHelper(gs.particles, x, y, color);
          const _wDive =
            (keys.down && (performance.now() - lastJumpPressTime.current) < DIVE_COMBO_WINDOW) ||
            (keys.space && (performance.now() - lastDownPressTime.current) < DIVE_COMBO_WINDOW);
          const _effKeys = _wDive ? { ...keys, dive: true } : keys;
          updatePlayer(gs.player, _effKeys, trainingPlatformsRef.current, dt, spawnP);
          gs.player.diveEnergy = DIVE_ENERGY_MAX; // ilimitado na sala de treino
          gs.player.health = PLAYER_MAX_HEALTH;   // HP infinito na sala de treino
          updateParticles(gs.particles, dt);

          // ── Detecção de movimentos corretos (flash verde + plim) ────────────────
          {
            const _p = gs.player;
            const _px = _p.x, _px2 = _p.x + _p.w, _py2 = _p.y + _p.h;
            // Dive roll (↓+ESPAÇO): zona 262–1880
            if (_p.isDivejumping && _px > 262 && _px < 1880) {
              if (!playerDiveFlashPlayedRef.current) { playerDiveFlashPlayedRef.current = true; diveCompletedRef.current = true; playerFlashTimerRef.current = 400; playBrilho(); }
            } else if (!_p.isDivejumping) {
              playerDiveFlashPlayedRef.current = false; // reseta para a próxima tentativa
            }
            // Side flip (zona drone 4900–6500) — só pisca/toca se esquivou de tiro de fato
            if (_p.sideFlipImmune && _px > 4900 && _px < 6500) {
              for (const _b of gs.bullets) {
                // Usa o mesmo critério de colisão do physics.ts (b±4 vs player box)
                if (_b.x - 4 < _px + _p.w && _b.x + 4 > _px && _b.y - 4 < _py2 && _b.y + 4 > _p.y) {
                  if (playerFlashTimerRef.current <= 0) { sideFlipCompletedRef.current = true; playerFlashTimerRef.current = 400; playBrilho(); }
                  break;
                }
              }
            }
            // Plataformas / paredes / obstáculos
            for (const _pl of trainingPlatformsRef.current) {
              if (_pl.type === 'ground' || _pl.endWall || _pl.noHint) continue;
              const _pl2 = _pl.x + _pl.w;
              const _ov = _px2 > _pl.x && _px < _pl2; // sobreposição horizontal
              let _hit = false;
              if (_pl.type === 'wall') {
                if (_pl.isLadder) {
                  if (_ov && _p.state === 'climb' && _p.touchingLadder && _p.vy !== 0) _hit = true;
                } else if (_pl.tictacWall) {
                  // Fase 1: player tocou a primeira parede do tic-tac — marca sequência, sem flash ainda
                  const _ttProx = _px2 >= _pl.x - 2 && _px <= _pl2 + 2;
                  if (_p.onTictacWall && _ttProx) ticTacPhase1Ref.current = true;
                  // Reset se voltar ao chão sem completar
                  if (_p.onGround && _px2 < _pl.x - 30) ticTacPhase1Ref.current = false;
                } else if (_pl.climbable && _pl.noHang) {
                  // Fase 2: só dispara se fase 1 aconteceu E player sai em wallflip da segunda parede
                  const _ttProx2 = _px2 >= _pl.x - 2 && _px <= _pl2 + 2;
                  if (ticTacPhase1Ref.current && _ttProx2 && _p.state === 'wallflip') {
                    _hit = true;
                    ticTacPhase1Ref.current = false;
                  }
                } else if (_pl.climbable && !_pl.noHang) {
                  // Fase 1: player está no wall run / subida — marca que o movimento aconteceu
                  // Cobre ambas as faces: esquerda (px2 encosta em pl.x) e direita (px encosta em pl2)
                  const _wallProx = _px2 >= _pl.x - 2 && _px <= _pl2 + 2;
                  if (_wallProx && (_p.isWallRunning || _p.state === 'wallrun' || _p.state === 'wallclimb'))
                    wallRunWasActiveRef.current = true;
                  // Fase 2: subida aconteceu → player entrou em jump/fall/wallflip perto do muro = cruzou
                  if (wallRunWasActiveRef.current &&
                      (_p.state === 'jump' || _p.state === 'fall' || _p.state === 'wallflip') &&
                      _px2 > _pl.x - 100 && _px < _pl2 + 100) {
                    _hit = true;
                    wallRunWasActiveRef.current = false;
                  }
                  // Reset quando volta ao chão longe do muro
                  if (_p.onGround && (_px2 < _pl.x - 50 || _px > _pl2 + 50))
                    wallRunWasActiveRef.current = false;
                } else if (!_pl.noHang) {
                  // Pulo: player em ar acima do muro
                  const _air = _p.state === 'jump' || _p.state === 'fall' || _p.state === 'divejump' || _p.state === 'wallflip';
                  if (_air && _ov && _py2 <= _pl.y + _pl.h * 0.6) _hit = true;
                }
              } else if (_pl.type === 'platform' && _pl.isRollUnder) {
                if (_ov && _p.isRolling) _hit = true;
              } else if (_pl.type === 'obstacle') {
                if (_p.kongVaultPhase === 'air' && _p.kongVaultIsObstacle) {
                  const _cx = (_px + _px2) / 2;
                  if (_cx > _pl.x - 20 && _cx < _pl2 + 20) {
                    // Kong vault: só valida com dive roll; monkey vault: qualquer kong vault serve
                    if (!_pl.isKongVault || _p.kongVaultFromDive) _hit = true;
                  }
                }
              }
              if (_hit && !(_pl.plimCooldown ?? 0 > 0)) { _pl.completed = true; _pl.plimCooldown = 800; _pl.flashTimer = 400; if (playerFlashTimerRef.current <= 0) { playerFlashTimerRef.current = 400; playBrilho(); } }
            }
            // Decrementa timers
            if (playerFlashTimerRef.current > 0)
              playerFlashTimerRef.current = Math.max(0, playerFlashTimerRef.current - dt);
            for (const _pl of trainingPlatformsRef.current) {
              if ((_pl.flashTimer ?? 0) > 0)
                _pl.flashTimer = Math.max(0, (_pl.flashTimer as number) - dt);
              if ((_pl.plimCooldown ?? 0) > 0)
                _pl.plimCooldown = Math.max(0, (_pl.plimCooldown as number) - dt);
            }
          }

          // ── Drone de treino: lógica EXCLUSIVA — NÃO usa updateDrone do jogo real ──
          // Fica parado no ar acima da zona, com hover suave. Nunca persegue o player.
          const TRAINING_DRONE_X = 5570;
          const TRAINING_DRONE_BASE_Y = 65;
          gs.drone.x = TRAINING_DRONE_X;
          gs.drone.y = TRAINING_DRONE_BASE_Y + Math.sin(gs.time * 0.002) * 8;
          gs.drone.vx = 0;
          gs.drone.vy = 0;
          gs.drone.propAngle = (gs.drone.propAngle + dt * 0.02) % (Math.PI * 2);
          gs.drone.wobble = Math.sin(gs.time * 0.003) * 0.04;
          // Atira assim que o drone fica visível na tela
          if (gs.player.x > 4800) {
            gs.drone.shootTimer -= dt;
            if (gs.drone.shootTimer <= 0) {
              gs.drone.shootTimer = SHOOT_COOLDOWN * 0.75 + Math.random() * 300;
              const _dcx = gs.drone.x + DRONE_W / 2;
              const _dcy = gs.drone.y + DRONE_H / 2;
              const _pdx = gs.player.x + gs.player.w / 2 - _dcx;
              const _pdy = gs.player.y + gs.player.h / 2 - _dcy;
              const _pdist = Math.sqrt(_pdx * _pdx + _pdy * _pdy);
              if (_pdist > 0) {
                const _spd = BULLET_SPEED * 0.75;
                gs.bullets.push({
                  x: _dcx, y: _dcy,
                  vx: (_pdx / _pdist) * _spd,
                  vy: (_pdy / _pdist) * _spd,
                  age: 0,
                });
                gs.screenShake = 2;
                for (let _i = 0; _i < 4; _i++) spawnP(_dcx, _dcy, '#ff4400');
              }
            }
            gs.bullets = updateBullets(
              gs.bullets, gs.player, trainingPlatformsRef.current, dt,
              () => { gs.screenShake = 4; playHit(); },
              [], gs.particles, [], [], [], [], () => {},
              undefined, undefined, undefined, null, null
            );
            // Sala de treino: Horácio nunca morre — restaura HP e estado após hit
            if (gs.player.state === 'dead' || gs.player.state === 'hurt') {
              gs.player.state = 'idle';
            }
            if (gs.player.health <= 0) {
              gs.player.health = PLAYER_MAX_HEALTH;
            }
          }
          // Câmera segue Horácio como no modo história, inclusive no eixo Y.
          // Isso mantém o personagem dentro da viewport depois do tic-tac.
          const _trainingTargetCamX = gs.player.x - CANVAS_W * CAMERA_LEAD_X;
          gs.camera.x += (_trainingTargetCamX - gs.camera.x) * 0.1;
          if (gs.camera.x < 0) gs.camera.x = 0;
          const _trainingTargetCamY = Math.min(0, gs.player.y - CANVAS_H * 0.38);
          gs.camera.y += (_trainingTargetCamY - gs.camera.y) * 0.12;
          if (Math.abs(gs.camera.y) < 0.5) gs.camera.y = 0;
        }
      } else if (gs.gamePhase === 'gameover') {
        if (spaceJustPressed.current) {
          // Volta ao menu inicial com vidas zeradas (estado fresco)
          stopBeat();
          stopDogAmbient();
          clearKeys();
          gsRef.current = { ...makeInitialState(gs.gameMode), gamePhase: 'menu' };
          spaceJustPressed.current = false;
        }
      } else if (gs.gamePhase === 'victory') {
        gs.victoryTimer = Math.max(0, gs.victoryTimer - dt);
        // Horácio auto-corre apenas na vitória dele (ou na fuga da História).
        // Quando o rival vence, manter o jogador parado evita que a transição
        // pareça uma vitória do jogador e não altera seu estado físico.
        const shouldAutoRun =
          gs.victoryTimer > 200 &&
          (gs.gameMode !== 'race' || raceRoundWinnerRef.current === 'player');
        if (shouldAutoRun) {
          const RUN_VX_PPS = 240; // px/s
          gs.player.x += RUN_VX_PPS * (dt / 1000);
          gs.player.state = 'run';
          gs.player.facingRight = true;
          gs.player.animTimer = (gs.player.animTimer + dt) % 10000;
          gs.player.onGround = true;
          gs.player.y = GROUND_Y - PLAYER_H;
          // Câmera segue suavemente até o player sumir
          const targetCamX = gs.player.x - CANVAS_W * CAMERA_LEAD_X;
          gs.camera.x += (targetCamX - gs.camera.x) * 0.045;
        }
        // Entre rounds, somente o vencedor volta ao início do circuito.
        // O perdedor permanece no ponto onde estava, como se o vencedor tivesse
        // dado uma volta completa na fase. A série termina quando um corredor
        // alcança o número de vitórias escolhido.
        if (gs.gameMode === 'race' && gs.victoryTimer <= 0) {
          const seriesOver =
            gs.racePlayerWins >= gs.raceRoundTarget ||
            gs.raceRivalWins >= gs.raceRoundTarget;
          if (!seriesOver) {
            const playerWins = gs.racePlayerWins;
            const rivalWins = gs.raceRivalWins;
            const roundTarget = gs.raceRoundTarget;
            const roundWinner = raceRoundWinnerRef.current;
            const roundLoserX = raceRoundLoserXRef.current;
            const savedTime = gs.time;
            if (roundWinner === 'rival') {
              // O rival começa a próxima volta do início, mas Horácio continua
              // exatamente onde estava: não resetar o estado do jogador, câmera,
              // drone ou objetos destruídos evita teletransporte e mudanças na
              // corrida em andamento.
              gs.time = savedTime;
              gs.raceRoundTarget = roundTarget;
              gs.racePlayerWins = playerWins;
              gs.raceRivalWins = rivalWins;
              gs.raceRoundNumber = playerWins + rivalWins + 1;
              racePlayerRef.current = createGhostPlayer(80, GROUND_Y - PLAYER_H);
              raceCheckpointXRef.current = 0;
              raceReplayArmedRef.current = false;
              raceTictacSnapDoneRef.current = false;
              raceRoundWinnerRef.current = null;
              raceRoundLoserXRef.current = gs.player.x;
              raceInterRoundTransitionRef.current = false;
              gs.gamePhase = 'race-countdown';
              gs.raceCountdownTimer = 3500;
              gs.victoryTimer = 0;
            } else {
              // Quando Horácio vence, mantém a regra existente: ele volta ao
              // começo e o rival permanece no ponto alcançado.
              resetGame('race', true);
              const next = gsRef.current;
              if (!next) {
                spaceJustPressed.current = false;
                editorSpawnJustPressed.current = false;
                return;
              }
              next.time = savedTime;
              next.raceRoundTarget = roundTarget;
              next.racePlayerWins = playerWins;
              next.raceRivalWins = rivalWins;
              next.raceRoundNumber = playerWins + rivalWins + 1;
              next.player.x = 80;
              next.player.y = GROUND_Y - PLAYER_H;
              next.player.vx = 0;
              next.player.vy = 0;
              next.player.state = 'idle';
              if (racePlayerRef.current) {
                racePlayerRef.current.x = Math.max(80, roundLoserX);
                racePlayerRef.current.y = GROUND_Y - PLAYER_H;
                racePlayerRef.current.vx = 0;
                racePlayerRef.current.vy = 0;
                racePlayerRef.current.state = 'idle';
                racePlayerRef.current.onGround = true;
              }
              next.camera.x = 0;
              next.gamePhase = 'race-countdown';
              next.raceCountdownTimer = 3500;
            }
          } else if (spaceJustPressed.current) {
            resetGame('race');
            spaceJustPressed.current = false;
          }
        } else if (gs.victoryTimer <= 0 && spaceJustPressed.current) {
          resetGame(gs.gameMode);
          spaceJustPressed.current = false;
        }
        spaceJustPressed.current = false;
        editorSpawnJustPressed.current = false;
      }

      // --- Render ---
      ctx.save();
      if (gs.screenShake > 0.3) {
        ctx.translate(
          (Math.random() - 0.5) * gs.screenShake,
          (Math.random() - 0.5) * gs.screenShake
        );
      }

      if (gs.gamePhase === 'training') {
        // ── Render da Sala de Treino ────────────────────────────────────────
        drawTrainingRoom(ctx, trainingPlatformsRef.current, gs.camera.x, gs.player.x, gs.camera.y, { dive: diveCompletedRef.current, sideFlip: sideFlipCompletedRef.current });
        // O personagem e os elementos móveis acompanham o eixo Y da câmera.
        ctx.save();
        ctx.translate(0, -gs.camera.y);
        // Horácio (usa gs.camera.x internamente)
        drawPlayer(ctx, gs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current, wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current, sideFlipSheetImgRef.current, ladderClimbImgRef.current, ladderDescendImgRef.current, kongVaultStartImgRef.current, kongVaultAirImgRef.current, poseDisplayOverridesRef.current);
        // Flash verde corpo inteiro (dive roll / side flip corretos) — offscreen + source-atop
        if (playerFlashTimerRef.current > 0) {
          const _pfa = Math.min(0.55, (playerFlashTimerRef.current / 400) * 0.68);
          if (!playerFlashCanvasRef.current) {
            playerFlashCanvasRef.current = document.createElement('canvas');
            playerFlashCanvasRef.current.width = CANVAS_W;
            playerFlashCanvasRef.current.height = CANVAS_H;
          }
          const _fc = playerFlashCanvasRef.current;
          const _fctx = _fc.getContext('2d')!;
          _fctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          _fctx.save();
          _fctx.translate(0, -gs.camera.y);
          drawPlayer(_fctx, gs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current, wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current, sideFlipSheetImgRef.current, ladderClimbImgRef.current, ladderDescendImgRef.current, kongVaultStartImgRef.current, kongVaultAirImgRef.current, poseDisplayOverridesRef.current);
          _fctx.globalCompositeOperation = 'source-atop';
          _fctx.fillStyle = `rgba(60,255,100,${_pfa.toFixed(2)})`;
          // fillRect em coordenadas do espaço transformado para cobrir a tela toda
          // independente do camera.y (que fica negativo quando câmera sobe no tic-tac)
          _fctx.fillRect(0, gs.camera.y, CANVAS_W, CANVAS_H);
          _fctx.restore();
          // ctx está com translate(0, -camera.y) ativo; compensamos para desenhar em coordenadas de tela
          ctx.save();
          ctx.translate(0, gs.camera.y);
          ctx.drawImage(_fc, 0, 0);
          ctx.restore();
        }
        // Drone visível ao se aproximar da zona (já parado no ar aguardando)
        if (gs.player.x > 4800) {
          drawDrone(ctx, gs);
        }
        // Balas aparecem junto com o drone
        if (gs.player.x > 4800) {
          drawBullets(ctx, gs);
        }
        drawParticles(ctx, gs);
        ctx.restore();
        // HUD mínimo
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(140,130,175,0.75)';
        ctx.fillText('ESC — VOLTAR AO MENU', 8, CANVAS_H - 8);
        ctx.fillStyle = 'rgba(100,90,140,0.55)';
        ctx.font = '9px monospace';
        ctx.fillText('SALA DE TREINO', 8, 14);
      } else {
        drawSky(ctx);
        ctx.save();
        ctx.translate(0, -gs.camera.y);
      drawBuildings(ctx, buildingsRef.current, gs.camera.x);
      drawAlleyDetails(ctx, gs.camera.x, gs.time);
      drawStartingBackWall(ctx, gs.camera.x);
      drawShantyVillage(ctx, gs.camera.x);
      drawGround(ctx, gs.camera.x, gs.platforms);
      drawRiver(ctx, gs.camera.x);
      // Pré-filtra plataformas visíveis no viewport para todos os loops de render abaixo
      const _rCamX = gs.camera.x;
      const _rMargin = 80;
      const _rVisPlats = spatialGridRef.current
        ? queryGrid(spatialGridRef.current, _rCamX - _rMargin, _rCamX + CANVAS_W + _rMargin)
        : gs.platforms;
      // World-space rendering (offset by camera)
      ctx.save();
      ctx.translate(-_rCamX, 0);
      // Visible world-space X range (used to clamp inner loops to screen)
      const _visWX0 = _rCamX;
      const _visWX1 = _rCamX + CANVAS_W;
      // Draw all ground segments with decoration
      for (const plat of _rVisPlats) {
        if (plat.type === 'ground') {
          // Concrete body
          ctx.fillStyle = COLORS.ground;
          ctx.fillRect(plat.x, plat.y, plat.w, 90);
          // Government red edge stripe
          ctx.fillStyle = COLORS.groundEdge;
          ctx.fillRect(plat.x, plat.y, plat.w, 4);
          // Sharp void edges — only create gradient if the edge is actually on screen
          const edgeW = 4;
          if (plat.x >= _visWX0 - edgeW && plat.x <= _visWX1) {
            const edgeGradL = ctx.createLinearGradient(plat.x, 0, plat.x + edgeW, 0);
            edgeGradL.addColorStop(0, 'rgba(0,0,0,0.9)');
            edgeGradL.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = edgeGradL;
            ctx.fillRect(plat.x, plat.y, edgeW, 90);
          }
          const rightEdgeX = plat.x + plat.w - edgeW;
          if (rightEdgeX >= _visWX0 && rightEdgeX <= _visWX1 + edgeW) {
            const edgeGradR = ctx.createLinearGradient(rightEdgeX, 0, rightEdgeX + edgeW, 0);
            edgeGradR.addColorStop(0, 'rgba(0,0,0,0)');
            edgeGradR.addColorStop(1, 'rgba(0,0,0,0.9)');
            ctx.fillStyle = edgeGradR;
            ctx.fillRect(rightEdgeX, plat.y, edgeW, 90);
          }
          // Cracks in concrete — skip to first visible crack, stop at last visible
          ctx.strokeStyle = COLORS.crackLine;
          ctx.lineWidth = 1;
          const crackStep = 60;
          const crackMin = plat.x + 15;
          const crackMax = plat.x + plat.w - 15;
          const crackStart = crackMin + Math.max(0, Math.floor((_visWX0 - crackMin) / crackStep) - 1) * crackStep;
          for (let cx2 = crackStart; cx2 < crackMax && cx2 < _visWX1 + crackStep; cx2 += crackStep) {
            ctx.beginPath();
            ctx.moveTo(cx2, plat.y + 5);
            ctx.lineTo(cx2 + 15, plat.y + 14);
            ctx.stroke();
          }
          // Puddles — skip to first visible puddle, stop at last visible, cache gradients
          const pStep = 140;
          const puddleStart = plat.x + Math.max(0, Math.floor((_visWX0 - plat.x) / pStep) - 1) * pStep;
          for (let px = puddleStart; px < plat.x + plat.w && px < _visWX1 + pStep; px += pStep) {
            const worldX = Math.floor(px / pStep);
            const h = ((worldX * 2654435761) >>> 0) % 100;
            if (h > 38) continue;
            const pw = 18 + (h % 3) * 14;
            if (px + pw / 2 > plat.x + plat.w - 12) continue;
            // Cache gradient keyed by world position (never changes for same px/y)
            const cacheKey = px * 10000 + plat.y;
            let pGrad = _puddleGradCache.get(cacheKey);
            if (!pGrad) {
              pGrad = ctx.createLinearGradient(px, plat.y + 2, px, plat.y + 10);
              pGrad.addColorStop(0, 'rgba(190,35,10,0.28)');
              pGrad.addColorStop(1, 'rgba(80,15,5,0.12)');
              _puddleGradCache.set(cacheKey, pGrad);
            }
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.ellipse(px, plat.y + 6, pw / 2, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // Potholes desenhados APÓS o chão para aparecer sobre ele
      drawPotholes(ctx, _rVisPlats, _rCamX);

      drawStreetBuildings(ctx, gs.platforms, _rCamX);
      drawStaircaseBuildingWall(ctx, _rCamX);
      drawHouseAfterStaircase(ctx, _rCamX);
      drawHouseAfterStaircase(ctx, _rCamX, 32500);
      drawHouseAfterStaircase(ctx, _rCamX, 33297);
      drawHouseAfterStaircase(ctx, _rCamX, 34274, -153);
      drawHouseAfterStaircase(ctx, _rCamX, 35500);
      {
        const _bwallPlat = gs.platforms.find(pp => pp.type === 'wall' && pp.x > 35000 && pp.x < 38000);
        if (_bwallPlat) {
          drawBlockingWall(ctx, _rCamX, _bwallPlat.x, _bwallPlat.y, _bwallPlat.w, _bwallPlat.h);
        }
      }
      drawStaircase(ctx, _rCamX, _rVisPlats);
      drawJunkyardBackdrop(ctx, gs.camera.x);
      drawFireEscapeBuilding(ctx, gs.camera.x, false);
      // ── Drag-ghost: temporariamente move originais de volta pra exibição ──
      const _activeDrag = editorDragRef.current;
      const _isDragGhost = gs.gamePhase === 'editor' && _activeDrag?.mode === 'move' && _activeDrag.hasMoved;
      if (!_isDragGhost) {
        editorSnapAxesRef.current.worldX = null;
        editorSnapAxesRef.current.worldY = null;
        editorSnapStateRef.current.x = false;
        editorSnapStateRef.current.y = false;
      }
      const _ghostEntries: { idx: number; ghostX: number; ghostY: number }[] = [];
      if (_isDragGhost) {
        const _selIdx = editorSelectedIdxRef.current;
        if (_selIdx >= 0 && _selIdx < gs.platforms.length) {
          _ghostEntries.push({ idx: _selIdx, ghostX: gs.platforms[_selIdx].x, ghostY: gs.platforms[_selIdx].y });
          gs.platforms[_selIdx].x = _activeDrag.origX;
          gs.platforms[_selIdx].y = _activeDrag.origY;
        }
        for (const _entry of _activeDrag.origGroupPositions) {
          const _gp = gs.platforms[_entry.idx];
          if (_gp) {
            _ghostEntries.push({ idx: _entry.idx, ghostX: _gp.x, ghostY: _gp.y });
            _gp.x = _entry.origX;
            _gp.y = _entry.origY;
          }
        }
      }

      // Filtra plataformas destruídas antes de enviar ao renderizador
      const _destroyedRenderSet: Set<Platform> = gs.destroyedBoxIndices.length > 0 || gs.destroyedTireIndices.length > 0
        ? new Set([
            ...gs.destroyedBoxIndices.map(i => gs.platforms[i]),
            ...gs.destroyedTireIndices.map(i => gs.platforms[i]),
          ].filter(Boolean) as Platform[])
        : new Set();
      const _renderPlats = _destroyedRenderSet.size > 0
        ? _rVisPlats.filter(p => !_destroyedRenderSet.has(p))
        : _rVisPlats;
      drawPlatforms(ctx, _renderPlats, _rCamX, balconyImgRef.current, carroImgRef.current, [], customSpriteImagesRef.current, []);

      // ── Restaura posições e desenha ghost transparente ──
      if (_isDragGhost && _ghostEntries.length > 0) {
        for (const _e of _ghostEntries) {
          gs.platforms[_e.idx].x = _e.ghostX;
          gs.platforms[_e.idx].y = _e.ghostY;
        }
        const _ghostPlats = _ghostEntries.map(_e => gs.platforms[_e.idx]).filter(Boolean) as Platform[];
        const _isSnapped = editorSnapAxesRef.current.worldX !== null || editorSnapAxesRef.current.worldY !== null;
        ctx.save();
        ctx.globalAlpha = _isSnapped ? 0.82 : 0.42;
        drawPlatforms(ctx, _ghostPlats, gs.camera.x, balconyImgRef.current, carroImgRef.current, [], customSpriteImagesRef.current, []);
        ctx.restore();
        ctx.save();
        ctx.setLineDash(_isSnapped ? [] : [5, 4]);
        ctx.strokeStyle = _isSnapped ? 'rgba(0, 230, 255, 1)' : 'rgba(255, 220, 60, 0.9)';
        ctx.lineWidth = _isSnapped ? 3 : 2;
        for (const _e of _ghostEntries) {
          const _gp = gs.platforms[_e.idx];
          if (_gp) ctx.strokeRect(_e.ghostX - gs.camera.x, _gp.y, _gp.w, _gp.h);
        }
        ctx.setLineDash([]);

        // Linhas-guia de snap magnético
        const _snapAxes = editorSnapAxesRef.current;
        if (_snapAxes.worldX !== null) {
          const _sx = Math.round(_snapAxes.worldX - gs.camera.x) + 0.5;
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 230, 255, 1)';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 5]);
          ctx.beginPath();
          ctx.moveTo(_sx, 0);
          ctx.lineTo(_sx, CANVAS_H);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = 'rgba(0,230,255,1)';
          ctx.textAlign = 'left';
          ctx.fillText('◀ SNAP X ▶', _sx + 4, 18);
          ctx.restore();
        }
        if (_snapAxes.worldY !== null) {
          const _sy = Math.round(_snapAxes.worldY - gs.camera.y) + 0.5;
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 230, 255, 1)';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 5]);
          ctx.beginPath();
          ctx.moveTo(0, _sy);
          ctx.lineTo(CANVAS_W, _sy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = 'rgba(0,230,255,1)';
          ctx.textAlign = 'left';
          ctx.fillText('▲ SNAP Y ▼', 4, _sy - 4);
          ctx.restore();
        }

        // Dica flutuante "CLIQUE DIREITO = DUPLICAR" acima do ghost
        if (_ghostEntries.length > 0) {
          const _firstGp = gs.platforms[_ghostEntries[0].idx];
          if (_firstGp) {
            const _tipX = _ghostEntries[0].ghostX - gs.camera.x + _firstGp.w / 2;
            const _tipY = _ghostEntries[0].ghostY - 14;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,220,60,0.95)';
            ctx.fillText('CLIQUE DIREITO = DUPLICAR', _tipX, _tipY);
          }
        }
        ctx.restore();
      }
      drawFlyingTires(ctx, gs.flyingTires, gs.camera.x, rollingTireImgRef.current);
      drawParticles(ctx, gs);
      drawDogs(ctx, gs.dogs, gs.camera.x, dogSheetImgRef.current, dogIdleImgRef.current);
      drawBystanders(ctx, gs.bystanders, gs.camera.x, bystander1ImgRef.current, bystander2ImgRef.current, bystander3ImgRef.current, bystander4ImgRef.current, npcHitImgRef.current);
      // ── Ghost Horácio IA (trilha + marcadores de morte + sprite) ────────────

      if (ghostEnabledRef.current) {
        const _camX = gs.camera.x;

        // Trilha de rastro: pontos coloridos do mais antigo (transparente) ao mais recente
        const _trail = ghostTrailRef.current;
        if (_trail.length > 1) {
          const _tLen = _trail.length;
          for (let _ti = 0; _ti < _tLen; _ti++) {
            const _pt = _trail[_ti];
            const _ratio = _ti / (_tLen - 1); // 0 = mais antigo, 1 = mais recente
            const _sx = _pt.x - _camX;
            const _sy = _pt.y;
            const _alpha = 0.12 + _ratio * 0.55;
            const _r = 1.5 + _ratio * 2.5;
            // Cor: azul-ciano → verde-ciano conforme fica mais recente
            const _g = Math.round(180 + _ratio * 75);
            ctx.save();
            ctx.globalAlpha = _alpha;
            ctx.fillStyle = `rgb(60,${_g},220)`;
            ctx.beginPath();
            ctx.arc(_sx, _sy, _r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Marcadores de morte: X vermelho em cada local onde o ghost caiu
        const _deaths = ghostDeathMarkersRef.current;
        for (const _d of _deaths) {
          const _sx = _d.x - _camX;
          const _sy = _d.y;
          const _s = 9;
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 60, 60, 0.92)';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = 'rgba(255,0,0,0.6)';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.moveTo(_sx - _s, _sy - _s); ctx.lineTo(_sx + _s, _sy + _s);
          ctx.moveTo(_sx + _s, _sy - _s); ctx.lineTo(_sx - _s, _sy + _s);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = 'rgba(255,80,80,0.9)';
          ctx.textAlign = 'center';
          ctx.fillText('CAIU', _sx, _sy + _s + 9);
          ctx.restore();
        }

        // Sprite do ghost com transparência (ou indicador de borda se fora da tela)
        if (ghostPlayerRef.current) {
          const _g = ghostPlayerRef.current;
          const _gsx = _g.x - _camX; // posição X na tela
          const _onScreen = _gsx > -_g.w - 20 && _gsx < CANVAS_W + 20;
          if (_onScreen) {
            const _ghostGs = { ...gs, player: _g } as GameState;
            ctx.save();
            ctx.globalAlpha = 0.42;
            drawPlayer(ctx, _ghostGs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current, wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current, sideFlipSheetImgRef.current, ladderClimbImgRef.current, ladderDescendImgRef.current, kongVaultStartImgRef.current, kongVaultAirImgRef.current, poseDisplayOverridesRef.current);
            ctx.restore();
          } else {
            // Ghost fora da tela — seta na borda indicando direção e distância
            const _toRight = _gsx >= CANVAS_W + 20;
            const _dist = Math.round(Math.abs(_g.x - (gs.player.x)));
            const _edgeX = _toRight ? CANVAS_W - 14 : 14;
            const _edgeY = Math.max(28, Math.min(CANVAS_H - 28, _g.y));
            const _arrowDir = _toRight ? 1 : -1;
            ctx.save();
            ctx.globalAlpha = 0.75;
            // Triângulo apontando para o ghost
            ctx.fillStyle = 'rgba(60,200,220,0.9)';
            ctx.beginPath();
            ctx.moveTo(_edgeX + _arrowDir * 10, _edgeY);
            ctx.lineTo(_edgeX - _arrowDir * 6, _edgeY - 7);
            ctx.lineTo(_edgeX - _arrowDir * 6, _edgeY + 7);
            ctx.closePath();
            ctx.fill();
            // Distância em metros/px
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = 'rgba(180,240,255,0.9)';
            ctx.textAlign = _toRight ? 'right' : 'left';
            ctx.fillText(`${_dist}px`, _toRight ? _edgeX - 14 : _edgeX + 14, _edgeY + 4);
            ctx.restore();
          }
        }
      }
      const _drawHoracio = () => drawPlayer(ctx, gs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current, wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current, sideFlipSheetImgRef.current, ladderClimbImgRef.current, ladderDescendImgRef.current, kongVaultStartImgRef.current, kongVaultAirImgRef.current, poseDisplayOverridesRef.current);
      if (gs.gamePhase !== 'editor') {
        lastPlayerGeomRef.current = _drawHoracio();
      }

      // ── Rival da Corrida ─────────────────────────────────────────────────
      // Técnica de 2 passes: 1º roupa com hue-rotate, 2º cabeça sem filtro
      // para restaurar a cor de pele natural.
      if (gs.gameMode === 'race' && racePlayerRef.current) {
        const _rival = racePlayerRef.current as Player;
        const _rsx = _rival.x - gs.camera.x;
        if (_rsx > -_rival.w - 20 && _rsx < CANVAS_W + 20) {
          const _rivalGs = { ...gs, player: _rival } as GameState;
          const _drawRival = () => drawPlayer(ctx, _rivalGs,
            spriteImgRef.current, runSheetImgRef.current, idleImgRef.current,
            rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current,
            wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current,
            sideFlipSheetImgRef.current, ladderClimbImgRef.current, ladderDescendImgRef.current,
            kongVaultStartImgRef.current, kongVaultAirImgRef.current,
            poseDisplayOverridesRef.current);

          // Passo 1: desenha o rival inteiro com hue-rotate (roupa colorida).
          // Captura o geom retornado para saber onde o sprite foi realmente desenhado.
          ctx.save();
          ctx.filter = 'hue-rotate(160deg) saturate(1.5)';
          const _geom = _drawRival();
          ctx.restore();

          // Passo 2: recorta os ~28% superiores do sprite real (onde está a cabeça)
          // e redesenha sem filtro para restaurar a cor de pele original.
          if (_geom) {
            const _headH = Math.round(_geom.dh * 0.28);
            ctx.save();
            ctx.beginPath();
            ctx.rect(_geom.destX - 2, _geom.destY, _geom.dw + 4, _headH);
            ctx.clip();
            _drawRival();
            ctx.restore();
          }
        } else {
          // Rival fora da tela — seta laranja indicando direção e distância
          const _toRight = _rsx >= CANVAS_W + 20;
          const _dist = Math.round(Math.abs(_rival.x - gs.player.x));
          const _edgeX = _toRight ? CANVAS_W - 14 : 14;
          const _edgeY = Math.max(28, Math.min(CANVAS_H - 50, _rival.y));
          const _arrowDir = _toRight ? 1 : -1;
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = 'rgba(255,110,30,0.95)';
          ctx.beginPath();
          ctx.moveTo(_edgeX + _arrowDir * 10, _edgeY);
          ctx.lineTo(_edgeX - _arrowDir * 6, _edgeY - 7);
          ctx.lineTo(_edgeX - _arrowDir * 6, _edgeY + 7);
          ctx.closePath();
          ctx.fill();
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = 'rgba(255,200,80,0.95)';
          ctx.textAlign = _toRight ? 'right' : 'left';
          ctx.fillText(`RIVAL ${_dist}px`, _toRight ? _edgeX - 14 : _edgeX + 14, _edgeY + 4);
          ctx.restore();
        }
      }

      drawFireEscapeFloors(ctx, gs.camera.x, fireEscapeFloorImgRef.current);
      drawTireHideouts(ctx, _renderPlats, _rCamX, standingTireImgRef.current, []);
      drawEndingBuilding(ctx, gs.camera.x);
      if (
        (gs.gameMode !== 'wall-test' || editorDroneEnabledRef.current) &&
        !(gs.gameMode === 'race' && !gs.raceDroneEnabled)
      ) {
        drawDrone(ctx, gs);
        drawBullets(ctx, gs);
      }
      // ── No modo editor, o Horácio é redesenhado por último para ficar sempre
      //    na frente de qualquer objeto (carros, plataformas, etc.), garantindo
      //    que o clique e as alças de edição de pose sempre funcionem visualmente.
      if (gs.gamePhase === 'editor') {
        lastPlayerGeomRef.current = _drawHoracio();
        const _geom = lastPlayerGeomRef.current;
        const _selKey = editorAttachedSpriteSelectedRef.current;
        if (_geom && _selKey && _geom.poseKey === _selKey) {
          drawPlayerPoseEditorHandles(ctx, _geom, poseDisplayOverridesRef.current[_selKey], true);
        }
      }
      ctx.restore();
      } // end else (playing / editor render)

      ctx.restore(); // end shake

      // ── HUD de gravação / replay — espaço de tela limpo (sem transformação de câmera) ──
      // IMPORTANTE: mantido aqui, fora do ctx.translate(0,-camera.y), para que o texto
      // apareça corretamente mesmo quando a câmera rola para cima (ex: escadaria).
      if (gs.gamePhase === 'playing') {
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        const _hasRec = ghostReplayFramesRef.current && ghostReplayFramesRef.current.length > 0;
        if (isRecordingRef.current) {
          // Piscante vermelho
          const _blink = Math.floor(performance.now() / 400) % 2 === 0;
          ctx.fillStyle = _blink ? 'rgba(255,60,60,1)' : 'rgba(255,60,60,0.3)';
          ctx.fillText('⏺ GRAVANDO  [R] para parar', CANVAS_W - 8, CANVAS_H - 8);
          ctx.fillStyle = 'rgba(255,180,180,0.7)';
          ctx.fillText(`${playerRecordingBufferRef.current.length} frames`, CANVAS_W - 8, CANVAS_H - 21);
        } else {
          ctx.fillStyle = 'rgba(200,200,200,0.55)';
          const _ghostHint = (gs.gameMode === 'wall-test' || editorRealStoryModeRef.current)
            ? `  [G] ghost${_hasRec ? ' (replay)' : ''}` : '';
          ctx.fillText(`[R] ${_hasRec ? 'nova gravação' : 'gravar movimento'}${_ghostHint}`, CANVAS_W - 8, CANVAS_H - 8);
          if (_hasRec) {
            ctx.fillStyle = 'rgba(80,220,120,0.75)';
            ctx.fillText(`✓ ${ghostReplayFramesRef.current!.length} frames gravados`, CANVAS_W - 8, CANVAS_H - 21);
          }
        }
        ctx.restore();
      }

      if (gs.gamePhase !== 'training') drawHUD(ctx, gs);
      if (showControls.current && gs.gamePhase === 'playing') drawControls(ctx);

      // Barra de modo teste do editor
      if (gs.gamePhase === 'playing' && editorTestModeRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, CANVAS_H - 16, CANVAS_W, 16);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        if (editorRealStoryModeRef.current) {
          ctx.fillStyle = 'rgba(80,160,255,0.95)';
          ctx.fillText('◆ JOGO REAL — drone ativo, CPs reais  |  CTRL: VOLTAR AO EDITOR ◆', CANVAS_W / 2, CANVAS_H - 4);
        } else {
          ctx.fillStyle = 'rgba(80,230,140,0.9)';
          ctx.fillText('◆ MODO TESTE DO EDITOR  |  CTRL: VOLTAR AO EDITOR ◆', CANVAS_W / 2, CANVAS_H - 4);
        }
      }

      if (gs.gamePhase === 'menu') {
        drawMenuScreen(
          ctx,
          menuFocusRef.current,
          menuMutedRef.current,
          raceMenuOpenRef.current,
          raceFocusRef.current,
          raceDroneEnabledRef.current,
          raceCheckpointsEnabledRef.current,
          raceRoundTargetRef.current,
        );
        if (showOptionsRef.current) drawOptionsScreen(ctx);
      }
      if (gs.gamePhase === 'editor') {
        {
          // Computa categoria SFX do objeto selecionado para o slider
          let _sfxCat: { vol: number; label: string } | null = null;
          const _sIdx = editorSelectedIdxRef.current;
          const _sPl = _sIdx >= 0 ? platformsRef.current[_sIdx] : null;
          if (_sPl?.type === 'box') {
            _sfxCat = { vol: sfxCategoryVolumesRef.current['box'] ?? 1, label: 'CAIXAS' };
          } else if (_sPl?.type === 'tire' || _sPl?.type === 'tireHideout') {
            _sfxCat = { vol: sfxCategoryVolumesRef.current['tire'] ?? 1, label: 'PNEUS' };
          } else if (_sPl?.type === 'obstacle') {
            _sfxCat = { vol: sfxCategoryVolumesRef.current['obstacle'] ?? 0.5, label: 'LATÃO' };
          } else if (
            _sPl?.type === 'car' ||
            (_sPl?.type === 'sprite' && _sPl?.customSpriteName === 'carro_abandonado_pixelart_1776652992846.png')
          ) {
            _sfxCat = { vol: sfxCategoryVolumesRef.current['car'] ?? 1, label: 'CARRO' };
          } else if (editorAttachedSpriteSelectedRef.current !== null) {
            _sfxCat = { vol: horacioVolumeRef.current, label: 'HORÁCIO' };
          }
          drawEditorUI(ctx, platformsRef.current, editorCamXRef.current, editorCamYRef.current, editorHoveredIdxRef.current, editorSelectedIdxRef.current, editorMouseWorldRef.current, editorCopiedMsgRef.current, editorCheckpointIdxRef.current, getEditorCheckpoints(), editorCollisionModeRef.current, editorCollisionBoxIdxRef.current, editorSelectedIndicesRef.current, editorMarqueeRef.current, editorUndoStackRef.current.length > 0, editorRedoStackRef.current.length > 0, editorBaselineKeysRef.current, galleryServerNamesRef.current, galleryObjectTypesRef.current, editorSaveStatusRef.current, editorSaveStatusMessageRef.current, editorSaveStatusUntilRef.current, editorDirtyRef.current, musicVolumeRef.current, _sfxCat);
        }
        drawBystanderInfo(ctx, gs.bystanders, editorBystanderSelectedIdxRef.current, editorCamXRef.current, bystander1ImgRef.current, bystander2ImgRef.current, bystander3ImgRef.current, bystander4ImgRef.current);
      }
      if (gs.gamePhase === 'paused') drawPauseScreen(ctx, pauseSelection.current);
      if (gs.gamePhase === 'gameover') drawGameOverScreen(ctx, gs.player.distanceTraveled, gs.time);
      if (gs.gamePhase === 'victory') {
        const isInterRoundTransition =
          gs.gameMode === 'race' && raceInterRoundTransitionRef.current;
        // Fade in progressivo para o preto a partir de 1800ms restantes
        const FADE_START = 1800;
        const fadeAlpha = gs.victoryTimer < FADE_START ? Math.min(1, 1 - gs.victoryTimer / FADE_START) : 0;
        if (!isInterRoundTransition && fadeAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = fadeAlpha;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.restore();
        }
        if (!isInterRoundTransition && gs.victoryTimer <= 0) {
          const raceWasLost =
            gs.gameMode === 'race' &&
            gs.raceRivalWins >= gs.raceRoundTarget;
          if (raceWasLost) {
            drawRaceDefeatScreen(ctx, gs.player.distanceTraveled, gs.time);
          } else {
            drawVictoryScreen(ctx, gs.player.distanceTraveled, gs.time, gs.gameMode === 'race');
          }
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mouseup', onMouseUp);
      if (cvs) {
        cvs.removeEventListener('mousemove', onCanvasMouseMove);
        cvs.removeEventListener('mousemove', onCanvasMiddleMove);
        cvs.removeEventListener('mousedown', onCanvasMouseDown);
        cvs.removeEventListener('contextmenu', onContextMenu);
        cvs.removeEventListener('wheel', onCanvasWheel);
      }
      cancelAnimationFrame(animRef.current);
    };
  }, [makeInitialState, resetGame]);

  const handleSpriteUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/webp'].includes(file.type)) {
      editorCopiedMsgRef.current = { text: 'USE PNG OU WEBP — FUNDO BRANCO REMOVIDO AUTO', until: Date.now() + 3000 };
      return;
    }

    editorCopiedMsgRef.current = { text: '⏳ SALVANDO SPRITE NO PROJETO...', until: Date.now() + 10000 };

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = async () => {
        const processed = stripEditorSpriteBackground(img);
        const processedDataUrl = processed.src;

        const maxW = 180;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(12, Math.round(img.naturalWidth * scale));
        const h = Math.max(12, Math.round(img.naturalHeight * scale));

        // Tenta salvar permanentemente no servidor (public/sprites/)
        let spriteDataUrl = processedDataUrl;
        try {
          const resp = await fetch('/__editor/upload-sprite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, dataUrl: processedDataUrl }),
          });
          if (resp.ok) {
            const { url } = await resp.json() as { url: string };
            spriteDataUrl = url; // URL permanente: /sprites/nome.webp
          }
        } catch {
          // Fallback silencioso: usa data URL local (não permanente)
        }

        const platform: Platform = {
          type: 'sprite',
          x: Math.round(editorMouseWorldRef.current.x - w / 2),
          y: Math.round(Math.min(editorMouseWorldRef.current.y - h / 2, GROUND_Y - h)),
          w,
          h,
          customSpriteName: file.name,
          customSpriteDataUrl: spriteDataUrl,
        };
        const snapshot = platformsRef.current.map(p => ({
          ...p,
          collisionBoxes: p.collisionBoxes ? p.collisionBoxes.map(b => ({
            ...b,
            slopeTop: b.slopeTop ? { ...b.slopeTop } : undefined,
          })) : undefined,
        })) as Platform[];
        editorUndoStackRef.current.push(snapshot);
        if (editorUndoStackRef.current.length > 50) editorUndoStackRef.current.shift();
        editorRedoStackRef.current = [];
        customSpriteImagesRef.current.set(file.name, processed);
        platformsRef.current = [...platformsRef.current, platform];
        saveSprites(platformsRef.current);
        if (gsRef.current) gsRef.current.platforms = platformsRef.current;
        const idx = platformsRef.current.length - 1;
        editorSelectedIdxRef.current = idx;
        editorSelectedIndicesRef.current = new Set([idx]);
        editorCollisionModeRef.current = false;
        editorCollisionBoxIdxRef.current = 0;

        const isPermanent = spriteDataUrl.startsWith('/sprites/');
        editorCopiedMsgRef.current = {
          text: isPermanent
            ? `✓ SPRITE SALVO PERMANENTEMENTE: ${file.name}`
            : `⚠ SPRITE LOCAL (reinicie para salvar): ${file.name}`,
          until: Date.now() + 4000,
        };
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const cssW = Math.floor(CANVAS_W * scale);
  const cssH = Math.floor(CANVAS_H * scale);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#0a0909',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        gap: 0,
      }}
    >
      {/* Scaled canvas — internal resolution stays 900×500, CSS size scales */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          display: 'block',
          width: cssW,
          height: cssH,
          imageRendering: 'pixelated',
          border: '1px solid rgba(80,50,40,0.5)',
          outline: 'none',
          boxShadow: '0 0 60px rgba(0,0,0,0.95), 0 0 20px rgba(120,20,10,0.25)',
          flexShrink: 0,
        }}
        onClick={(e) => {
          const gs = gsRef.current;
          if (!gs) return;
          if (gs.gamePhase === 'editor') return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const scaleX = CANVAS_W / rect.width;
          const scaleY = CANVAS_H / rect.height;
          const cx = (e.clientX - rect.left) * scaleX;
          const cy = (e.clientY - rect.top) * scaleY;
          const wx = Math.round(cx + gs.camera.x);
          const wy = Math.round(cy + gs.camera.y);
          navigator.clipboard.writeText(`x:${wx}, y:${wy}`).catch(() => {});
          if (clickCoordsTimerRef.current) clearTimeout(clickCoordsTimerRef.current);
          setClickCoords({ clientX: e.clientX, clientY: e.clientY, wx, wy });
          clickCoordsTimerRef.current = setTimeout(() => setClickCoords(null), 4000);
        }}
      />
      {clickCoords && (
        <div
          style={{
            position: 'fixed',
            left: clickCoords.clientX + 14,
            top: clickCoords.clientY - 38,
            background: 'rgba(0,0,0,0.88)',
            border: '1px solid rgba(0,200,255,0.65)',
            borderRadius: 4,
            padding: '5px 10px',
            color: '#00e0ff',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 'bold',
            pointerEvents: 'none',
            zIndex: 999,
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
          }}
        >
          x:{clickCoords.wx}  y:{clickCoords.wy}{'  '}
          <span style={{ color: '#80ffcc', fontSize: 11 }}>✓ copiado</span>
        </div>
      )}
      <input
        ref={spriteUploadInputRef}
        type="file"
        accept="image/png,image/webp"
        onChange={handleSpriteUpload}
        style={{ display: 'none' }}
      />

      {/* Painel da galeria de sprites */}
      {showGallery && (
        <div
          onClick={() => setShowGallery(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#12102a',
              border: '1px solid rgba(200,150,255,0.6)',
              borderRadius: 8,
              padding: '14px 16px',
              width: Math.min(cssW - 40, 520),
              maxHeight: Math.min(cssH - 60, 400),
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#dbbfff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13 }}>
                🖼 GALERIA DE SPRITES
              </span>
              <button
                onClick={() => setShowGallery(false)}
                style={{
                  background: 'none', border: 'none', color: 'rgba(220,190,255,0.7)',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}
              >✕</button>
            </div>
            {gallerySprites.length === 0 ? (
              <div style={{ color: 'rgba(160,150,190,0.7)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
                Nenhum sprite salvo ainda. Use UPLOAD para adicionar.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                gap: 8,
                overflowY: 'auto',
                paddingRight: 4,
              }}>
                {gallerySprites.map(sprite => (
                  <div
                    key={sprite.name}
                    style={{ position: 'relative' }}
                  >
                    {/* Badge "na fase" para sprites sem arquivo no servidor */}
                    {!sprite.onServer && (
                      <span style={{
                        position: 'absolute',
                        bottom: 22,
                        left: 0,
                        right: 0,
                        textAlign: 'center',
                        fontSize: 8,
                        fontFamily: 'monospace',
                        color: 'rgba(255,200,80,0.9)',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}>na fase</span>
                    )}
                    <button
                      onClick={() => placeGallerySprite(sprite.name, sprite.url)}
                      title={`Usar: ${sprite.name}${!sprite.onServer ? ' (apenas na fase)' : ''}`}
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(200,150,255,0.3)',
                        borderRadius: 6,
                        padding: '6px 4px 4px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.9)';
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(200,150,255,0.1)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.3)';
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                      }}
                    >
                      <img
                        src={sprite.url}
                        alt={sprite.name}
                        style={{ width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }}
                      />
                      <span style={{
                        color: 'rgba(200,185,230,0.85)',
                        fontFamily: 'monospace',
                        fontSize: 9,
                        wordBreak: 'break-all',
                        textAlign: 'center',
                        lineHeight: 1.3,
                      }}>
                        {sprite.name.replace(/\.[^.]+$/, '')}
                      </span>
                    </button>
                    {/* Botão deletar — aparece para todos os sprites */}
                    <button
                      onClick={e => deleteGallerySprite(sprite.name, sprite.onServer, e)}
                      title={sprite.onServer ? `Deletar ${sprite.name} do servidor` : `Remover ${sprite.name} da galeria`}
                      style={{
                        position: 'absolute',
                        top: 3,
                        right: 3,
                        width: 16,
                        height: 16,
                        background: 'rgba(180,30,30,0.85)',
                        border: '1px solid rgba(255,80,80,0.6)',
                        borderRadius: 3,
                        color: '#fff',
                        fontSize: 9,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        fontWeight: 'bold',
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Seção de tipos de objeto salvos */}
            {galleryTypes.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(200,150,255,0.2)', paddingTop: 10 }}>
                <div style={{ color: 'rgba(180,160,220,0.8)', fontFamily: 'monospace', fontSize: 11, marginBottom: 6 }}>
                  🧱 TIPOS DE OBJETO
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {galleryTypes.map(type => {
                    // Cores e proporções visuais de cada tipo
                    type ShapeConfig = { fill: string; stroke: string; shape: 'wide' | 'tall' | 'square' | 'car' | 'circle' };
                    const shapes: Record<string, ShapeConfig> = {
                      platform:    { fill: '#3a5ccc', stroke: '#6688ff', shape: 'wide' },
                      wall:        { fill: '#996622', stroke: '#cc9944', shape: 'tall' },
                      obstacle:    { fill: '#cc3322', stroke: '#ff6655', shape: 'square' },
                      car:         { fill: '#cc9900', stroke: '#ffcc22', shape: 'car' },
                      tire:        { fill: '#444444', stroke: '#777777', shape: 'circle' },
                      tireHideout: { fill: '#553311', stroke: '#886633', shape: 'square' },
                      box:         { fill: '#8b5a2b', stroke: '#c88844', shape: 'square' },
                      pothole:     { fill: '#0a0a0c', stroke: '#5a5248', shape: 'tall' },
                    };
                    const cfg = shapes[type] ?? { fill: '#333', stroke: '#888', shape: 'square' };

                    const preview = (() => {
                      const base: React.CSSProperties = {
                        background: cfg.fill,
                        border: `2px solid ${cfg.stroke}`,
                        borderRadius: 3,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15)`,
                      };
                      if (cfg.shape === 'wide')   return { ...base, width: 54, height: 10, borderRadius: 2 };
                      if (cfg.shape === 'tall')   return { ...base, width: 14, height: 44 };
                      if (cfg.shape === 'car')    return { ...base, width: 60, height: 24, borderRadius: 4, position: 'relative' as const };
                      if (cfg.shape === 'circle') return { ...base, width: 22, height: 28, borderRadius: '40% 40% 50% 50%' };
                      return { ...base, width: 34, height: 28 };
                    })();

                    return (
                      <div key={type} style={{ position: 'relative' }}>
                        <button
                          onClick={() => placeObjectType(type as Platform['type'])}
                          title={`Colocar [${type}] na fase`}
                          style={{
                            width: 90,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(200,150,255,0.3)',
                            borderRadius: 6,
                            padding: '6px 4px 4px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'border-color 0.15s, background 0.15s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.9)';
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(200,150,255,0.1)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.3)';
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                          }}
                        >
                          {/* Miniatura visual */}
                          <div style={{ width: 64, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={preview} />
                          </div>
                          <span style={{
                            color: 'rgba(200,185,230,0.85)',
                            fontFamily: 'monospace',
                            fontSize: 9,
                            wordBreak: 'break-all',
                            textAlign: 'center',
                            lineHeight: 1.3,
                          }}>
                            {type.toUpperCase()}
                          </span>
                        </button>
                        {/* X para remover da galeria */}
                        <button
                          onClick={e => removeObjectTypeFromGallery(type, e)}
                          title={`Remover [${type}] da galeria`}
                          style={{
                            position: 'absolute',
                            top: 3,
                            right: 3,
                            width: 16,
                            height: 16,
                            background: 'rgba(180,30,30,0.85)',
                            border: '1px solid rgba(255,80,80,0.6)',
                            borderRadius: 3,
                            color: '#fff',
                            fontSize: 9,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            fontWeight: 'bold',
                          }}
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Seção de objetos exatos salvos */}
            {galleryObjects.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(200,150,255,0.2)', paddingTop: 10 }}>
                <div style={{ color: 'rgba(180,160,220,0.8)', fontFamily: 'monospace', fontSize: 11, marginBottom: 6 }}>
                  📦 OBJETOS EXATOS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {galleryObjects.map((obj, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <button
                        onClick={() => placeGalleryObject(obj)}
                        title={`Colocar "${obj.label}" (${obj.template.w}×${obj.template.h})`}
                        style={{
                          width: 90,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(200,150,255,0.3)',
                          borderRadius: 6,
                          padding: '6px 4px 4px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.9)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(200,150,255,0.1)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,150,255,0.3)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                        }}
                      >
                        <div style={{ width: 64, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{
                            width: Math.min(60, obj.template.w * 1.2),
                            height: Math.max(6, Math.min(40, obj.template.h * 1.2)),
                            background: '#3a5ccc',
                            border: '2px solid #6688ff',
                            borderRadius: 2,
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                          }} />
                        </div>
                        <span style={{
                          color: 'rgba(200,185,230,0.85)',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          wordBreak: 'break-all',
                          textAlign: 'center',
                          lineHeight: 1.3,
                        }}>
                          {obj.label}
                        </span>
                      </button>
                      <button
                        onClick={e => removeGalleryObject(idx, e)}
                        title="Remover da galeria"
                        style={{
                          position: 'absolute',
                          top: 3,
                          right: 3,
                          width: 16,
                          height: 16,
                          background: 'rgba(180,30,30,0.85)',
                          border: '1px solid rgba(255,80,80,0.6)',
                          borderRadius: 3,
                          color: '#fff',
                          fontSize: 9,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          fontWeight: 'bold',
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botão fixo HISTÓRICO — abre painel de versões salvas (oculto na sala de treino) */}
      <button
        onClick={openHistory}
        title="Histórico de versões salvas (level-patch.json)"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          display: gsRef.current?.gamePhase === 'training' ? 'none' : undefined,
          background: 'rgba(20,30,50,0.85)',
          color: 'rgba(180,210,255,0.9)',
          border: '1px solid rgba(120,160,220,0.5)',
          borderRadius: 4,
          padding: '5px 10px',
          fontSize: 11,
          fontFamily: 'monospace',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        ⟲ HISTÓRICO
      </button>

      {/* Painel do histórico de versões */}
      {showHistory && (
        <div
          onClick={() => setShowHistory(false)}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#101830',
              border: '1px solid rgba(120,160,220,0.6)',
              borderRadius: 8,
              padding: '14px 16px',
              width: Math.min(cssW - 40, 560),
              maxHeight: Math.min(cssH - 60, 460),
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              color: 'rgba(220,230,250,0.95)',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 13, color: 'rgba(180,210,255,0.95)' }}>
                ⟲ HISTÓRICO DE VERSÕES — level-patch.json
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(180,210,255,0.4)',
                  color: 'rgba(220,230,250,0.9)',
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >FECHAR ✕</button>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(160,180,210,0.75)' }}>
              Snapshots criados automaticamente a cada salvamento. Mantém os últimos 30. Restaurar grava o estado atual no histórico antes da troca (rede de segurança).
            </div>
            {historyMsg && (
              <div style={{
                padding: '6px 8px',
                background: 'rgba(40,60,100,0.6)',
                border: '1px solid rgba(120,160,220,0.5)',
                borderRadius: 3,
                fontSize: 11,
              }}>{historyMsg}</div>
            )}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid rgba(80,100,140,0.4)',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.3)',
            }}>
              {historyLoading ? (
                <div style={{ padding: 16, fontSize: 11, color: 'rgba(160,180,210,0.8)' }}>Carregando...</div>
              ) : historySnapshots.length === 0 ? (
                <div style={{ padding: 16, fontSize: 11, color: 'rgba(160,180,210,0.8)' }}>
                  Nenhum snapshot ainda. Salve uma fase no editor para começar o histórico.
                </div>
              ) : (
                historySnapshots.map((snap) => {
                  // Decodifica timestamp do nome (ex: 2026-04-24T17-45-12-345Z.json)
                  let dateLabel = snap.file;
                  const m = snap.file.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
                  if (m) {
                    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
                    const d = new Date(iso);
                    if (!isNaN(d.getTime())) {
                      dateLabel = d.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      });
                    }
                  }
                  return (
                    <div
                      key={snap.file}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderBottom: '1px solid rgba(80,100,140,0.25)',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'rgba(220,230,250,0.95)' }}>{dateLabel}</div>
                        <div style={{ fontSize: 10, color: 'rgba(140,170,200,0.75)' }}>
                          +{snap.addCount} add  −{snap.delCount} del  ·  {(snap.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => restoreHistorySnapshot(snap.file)}
                        disabled={historyLoading}
                        style={{
                          background: 'rgba(40,80,140,0.7)',
                          color: 'rgba(220,235,255,0.95)',
                          border: '1px solid rgba(120,180,255,0.6)',
                          borderRadius: 3,
                          padding: '4px 10px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                          cursor: historyLoading ? 'wait' : 'pointer',
                          marginLeft: 8,
                          flexShrink: 0,
                        }}
                      >RESTAURAR</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile controls — overlay absolutely positioned */}
      <MobileControls keysRef={keysRef} spaceJustPressed={spaceJustPressed} />
    </div>
  );
}

function MobileControls({
  keysRef,
  spaceJustPressed,
}: {
  keysRef: React.MutableRefObject<Keys>;
  spaceJustPressed: React.MutableRefObject<boolean>;
}) {
  const [isTouch] = useState(() => isTouchDevice());
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joystickPointer = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    if (!isTouch) return;
    const lock = async () => {
      try { await (screen.orientation as any).lock('landscape'); } catch { /* unsupported */ }
    };
    lock();
  }, [isTouch]);

  if (!isTouch) return null;

  if (isPortrait) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8,4,2,0.96)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 999,
        color: '#c8b090', fontFamily: 'monospace',
        textAlign: 'center', padding: 24,
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>↻</div>
        <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>Vire o celular</div>
        <div style={{ fontSize: 14, opacity: 0.65 }}>O jogo funciona na horizontal</div>
      </div>
    );
  }

  const BASE = 118;
  const KNOB = 44;
  const maxDist = BASE / 2 - KNOB / 2;
  const THRESH = 0.32;

  const releaseJoystick = () => {
    joystickPointer.current = null;
    setKnob({ x: 0, y: 0 });
    keysRef.current.left = false;
    keysRef.current.right = false;
    keysRef.current.up = false;
    keysRef.current.down = false;
  };

  return (
    <>
      {/* ── Virtual Joystick ── */}
      <div
        ref={joystickRef}
        style={{
          position: 'fixed',
          bottom: 32,
          left: 60,
          width: BASE, height: BASE,
          borderRadius: '50%',
          background: 'rgba(18,13,8,0.68)',
          border: '2px solid rgba(160,120,55,0.45)',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          zIndex: 200,
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          joystickPointer.current = e.pointerId;
        }}
        onPointerMove={(e) => {
          if (joystickPointer.current !== e.pointerId) return;
          e.preventDefault();
          const rect = joystickRef.current!.getBoundingClientRect();
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = e.clientY - (rect.top + rect.height / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const clamped = Math.min(dist, maxDist);
          const angle = Math.atan2(dy, dx);
          setKnob({ x: clamped * Math.cos(angle), y: clamped * Math.sin(angle) });
          const nx = dx / maxDist;
          const ny = dy / maxDist;
          keysRef.current.left  = nx < -THRESH;
          keysRef.current.right = nx >  THRESH;
          keysRef.current.up    = ny < -THRESH;
          keysRef.current.down  = ny >  THRESH;
        }}
        onPointerUp={(e) => { if (joystickPointer.current === e.pointerId) releaseJoystick(); }}
        onPointerCancel={(e) => { if (joystickPointer.current === e.pointerId) releaseJoystick(); }}
      >
        {/* Guias cruzadas */}
        <div style={{ position: 'absolute', left: BASE/2-1, top: 10, width: 2, height: BASE-20, background: 'rgba(160,120,55,0.18)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: BASE/2-1, left: 10, height: 2, width: BASE-20, background: 'rgba(160,120,55,0.18)', borderRadius: 1 }} />
        {/* Knob */}
        <div style={{
          position: 'absolute',
          left: BASE/2 - KNOB/2 + knob.x,
          top:  BASE/2 - KNOB/2 + knob.y,
          width: KNOB, height: KNOB,
          borderRadius: '50%',
          background: 'rgba(200,160,75,0.88)',
          border: '2px solid rgba(240,200,110,0.75)',
          boxShadow: '0 0 10px rgba(200,150,60,0.35)',
          transition: joystickPointer.current === null ? 'left 0.09s ease, top 0.09s ease' : 'none',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Botão PULAR ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          width: 88, height: 88,
          borderRadius: '50%',
          background: 'rgba(18,35,80,0.80)',
          border: '2px solid rgba(70,110,210,0.65)',
          color: '#90aee0',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          letterSpacing: 1,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          keysRef.current.space = true;
          spaceJustPressed.current = true;
        }}
        onPointerUp={(e) => { e.preventDefault(); keysRef.current.space = false; }}
        onPointerCancel={(e) => { e.preventDefault(); keysRef.current.space = false; }}
      >PULAR</div>
    </>
  );
}
