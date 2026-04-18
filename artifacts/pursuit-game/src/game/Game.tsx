import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameState, Keys, Player, Drone, Platform } from './types';
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
import brickTextureUrl from '/brick_texture.png';
import balconyUrl from '/balcony.png';
import {
  CANVAS_W, CANVAS_H, GROUND_Y, PLAYER_W, PLAYER_H, DRONE_W, DRONE_H,
  PLAYER_MAX_HEALTH, SHOOT_COOLDOWN, CAMERA_LEAD_X, COLORS,
} from './constants';
import { generateLevel, generateBuildings, generateWallTestLevel } from './level';
import {
  updatePlayer, updateDrone, updateBullets, updateParticles, spawnParticleHelper,
  updateFallingBoxes,
} from './physics';
import {
  drawSky, drawBuildings, drawAlleyDetails, drawJunkyardBackdrop, drawGround,
  drawStreetBuildings, drawPlatforms,
  drawStartingBackWall, drawPlayer, drawDrone, drawBullets, drawParticles,
  drawHUD, drawControls, drawMenuScreen, drawGameOverScreen, drawPauseScreen,
  drawEditorUI,
} from './render';
import {
  addPlatformCollisionBox,
  removePlatformCollisionBox,
  clampPlatformCollisionOverrides,
  ensurePlatformCollisionBox,
  ensurePlatformCollisionBoxes,
  getPlatformCollisionRect,
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
    autoRoll: false,
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
    jumpedFromWall: false,
    jumpCount: 0,
    doubleJumpReady: false,
    isSideFlipping: false,
    sideFlipTimer: 0,
    sideFlipImmune: false,
  };
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
  };
}

const CONTROLS_H = 68; // px reserved below canvas for mobile buttons
const EDITOR_DELETED_PLATFORMS_STORAGE_KEY = 'pursuit-deleted-platforms-v1';
const EDITOR_CUSTOM_SPRITES_STORAGE_KEY = 'pursuit-custom-sprites-v1';

function getPlatformKey(platform: Platform): string {
  return `${platform.type}:${platform.x}:${platform.y}:${platform.w}:${platform.h}`;
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
  return platforms.filter((platform) => platform.type === 'ground' || !keys.has(getPlatformKey(platform)));
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

function saveCustomSpritePlatforms(platforms: Platform[]): void {
  const customSprites = platforms.filter((platform) => platform.type === 'sprite');
  window.localStorage.setItem(EDITOR_CUSTOM_SPRITES_STORAGE_KEY, JSON.stringify(customSprites));
}

// Remove white/near-white background from a sprite sheet exported without transparency.
// Uses perceptual brightness so anti-aliased edges fade out smoothly instead of leaving a white fringe.
function stripWhiteBackground(src: HTMLImageElement): HTMLImageElement {
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
    // Saturation: 0 = grey/white, 1 = fully saturated color
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    // Target pixels that are bright AND low-saturation (white/near-white background)
    // Wide fade zone: starts at brightness 80 → fully transparent at 210
    // Saturation guard raised to 0.28 so anti-aliased edge pixels are also caught
    if (brightness > 80 && saturation < 0.28) {
      const t = Math.min(1, (brightness - 80) / 130);
      px[i + 3] = Math.round((1 - t) * px[i + 3]);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const out = new Image();
  // data URLs decode synchronously; but guard with onload for safety
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

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function getScale() {
  const scaleX = window.innerWidth / CANVAS_W;
  const reserve = isTouchDevice() ? 0 : CONTROLS_H;
  const scaleY = (window.innerHeight - reserve) / CANVAS_H;
  return Math.min(1, scaleX, scaleY);
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Keys>({ left: false, right: false, up: false, down: false, space: false, shift: false, z: false, dive: false });
  const spaceJustPressed = useRef(false);
  const testJustPressed = useRef(false);
  const enterJustPressed = useRef(false);
  const escJustPressed = useRef(false);
  const pauseSelection = useRef(0); // 0 = continuar, 1 = menu inicial
  const pauseDownJustPressed = useRef(false);
  const pauseUpJustPressed = useRef(false);
  const lastJumpPressTime = useRef(0);
  const lastDownPressTime = useRef(0);
  const DIVE_COMBO_WINDOW = 420;
  const editorJustPressed = useRef(false);
  const editorSpawnJustPressed = useRef(false);
  const editorDeleteBoxJustPressed = useRef(false);
  const zJustPressed = useRef(false);
  const editorDroneEnabledRef = useRef(false);
  const editorTestModeRef = useRef(false);
  const editorCamXRef = useRef(0);
  const editorCamYRef = useRef(0);
  const editorLastSpawnXRef = useRef(0);
  const editorMouseWorldRef = useRef({ x: 0, y: 0 });
  const editorMouseCanvasRef = useRef({ x: 0, y: 0 });
  const spriteUploadInputRef = useRef<HTMLInputElement>(null);
  const editorHoveredIdxRef = useRef(-1);
  const editorCopiedMsgRef = useRef<{ text: string; until: number } | null>(null);
  const editorSelectedIdxRef = useRef(-1);
  const editorSelectedIndicesRef = useRef<Set<number>>(new Set());
  const editorMarqueeRef = useRef<{ startWX: number; startWY: number; endWX: number; endWY: number } | null>(null);
  const editorUndoStackRef = useRef<Platform[][]>([]);
  const editorRedoStackRef = useRef<Platform[][]>([]);
  const editorPendingHistoryRef = useRef<Platform[] | null>(null);
  const editorBaselineKeysRef = useRef<Set<string>>(new Set());
  const platBaseKey = (p: { type: string; x: number; y: number; w: number; h: number }) =>
    `${p.type}:${p.x}:${p.y}:${p.w}:${p.h}`;
  const editorCollisionModeRef = useRef(false);
  const editorCollisionBoxIdxRef = useRef(0);
  type EditorDrag = {
    mode: 'move' | 'resize-right' | 'resize-left' | 'resize-top' | 'resize-bottom' | 'resize-corner' | 'slope-left' | 'slope-right';
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
  };
  const editorDragRef = useRef<EditorDrag | null>(null);
  const EDITOR_PAN_SPEED = 12;
  const EDITOR_CHECKPOINTS = [
    { label: 'CP1', x: 6500 },
    { label: 'CP2', x: 12100 },
  ];
  const editorCheckpointIdxRef = useRef(-1);
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
  const brickTextureImgRef = useRef<HTMLImageElement | null>(null);
  const balconyImgRef = useRef<HTMLImageElement | null>(null);
  const carroImgRef = useRef<HTMLImageElement | null>(null);
  const customSpriteImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Responsive scale: fit canvas inside available viewport
  const [scale, setScale] = useState(getScale);
  useEffect(() => {
    const onResize = () => setScale(getScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const makeInitialState = useCallback((gameMode: GameState['gameMode'] = 'story'): GameState => ({
    player: makePlayer(),
    drone: makeDrone(),
    bullets: [],
    camera: { x: 0, y: 0 },
    platforms: gameMode === 'wall-test' ? generateWallTestLevel() : platformsRef.current,
    gamePhase: 'menu',
    gameMode,
    score: 0,
    time: 0,
    particles: [],
    screenShake: 0,
    destroyedBoxIndices: [],
    fallingBoxes: [],
  }), []);

  const registerCustomSpriteImage = useCallback((platform: Platform) => {
    if (platform.type !== 'sprite' || !platform.customSpriteName || !platform.customSpriteDataUrl) return;
    const img = new Image();
    img.src = platform.customSpriteDataUrl;
    customSpriteImagesRef.current.set(platform.customSpriteName, img);
  }, []);

  const resetGame = useCallback((gameMode: GameState['gameMode'] = 'story') => {
    // Ao iniciar modo história, garante que o modo editor não interfere
    if (gameMode === 'story') {
      editorTestModeRef.current = false;
    }
    gsRef.current = {
      ...makeInitialState(gameMode),
      gamePhase: 'playing',
    };
  }, [makeInitialState]);

  useEffect(() => {
    deletedPlatformKeysRef.current = loadDeletedPlatformKeys();
    const customSpritePlatforms = loadCustomSpritePlatforms();
    customSpriteImagesRef.current = new Map();
    customSpritePlatforms.forEach(registerCustomSpriteImage);
    platformsRef.current = [
      ...applyDeletedPlatformKeys(generateLevel(), deletedPlatformKeysRef.current),
      ...customSpritePlatforms,
    ];
    gsRef.current = makeInitialState();

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
      jumpSheetImgRef.current = stripWhiteBackground(jumpImg);
    };
    jumpImg.src = jumpSheetUrl;

    const diveImg = new Image();
    diveImg.onload = () => {
      diveSheetImgRef.current = stripWhiteBackground(diveImg);
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

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (down && gsRef.current?.gamePhase === 'editor' && editorCollisionModeRef.current) {
        const step = e.shiftKey ? 5 : 1;
        if (e.code === 'ArrowLeft' && nudgeEditorSelectedHitbox(-step, 0)) { e.preventDefault(); return; }
        if (e.code === 'ArrowRight' && nudgeEditorSelectedHitbox(step, 0)) { e.preventDefault(); return; }
        if (e.code === 'ArrowUp' && nudgeEditorSelectedHitbox(0, -step)) { e.preventDefault(); return; }
        if (e.code === 'ArrowDown' && nudgeEditorSelectedHitbox(0, step)) { e.preventDefault(); return; }
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
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': k.left  = down; break;
        case 'ArrowRight': case 'KeyD': k.right = down; break;
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
        case 'KeyT':
          if (down) testJustPressed.current = true;
          break;
        case 'ControlLeft': case 'ControlRight': case 'Tab':
          if (down) editorSpawnJustPressed.current = true;
          break;
        case 'KeyE':
          if (down) editorJustPressed.current = true;
          break;
        case 'Delete':
          if (down && gsRef.current?.gamePhase === 'editor') {
            editorDeleteBoxJustPressed.current = true;
            e.preventDefault();
          }
          break;
        case 'Period':
        case 'Numpad6':
          if (down && gsRef.current?.gamePhase === 'editor') {
            const next = Math.min(editorCheckpointIdxRef.current + 1, EDITOR_CHECKPOINTS.length - 1);
            editorCheckpointIdxRef.current = next;
            editorCamXRef.current = Math.max(0, EDITOR_CHECKPOINTS[next].x - CANVAS_W / 2);
          }
          break;
        case 'Comma':
        case 'Numpad4':
          if (down && gsRef.current?.gamePhase === 'editor') {
            const prev = Math.max(editorCheckpointIdxRef.current - 1, 0);
            editorCheckpointIdxRef.current = prev;
            editorCamXRef.current = Math.max(0, EDITOR_CHECKPOINTS[prev].x - CANVAS_W / 2);
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

    const kd = (e: KeyboardEvent) => onKey(e, true);
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
      return `x:${Math.round(p.x)}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${Math.round(p.w)}  h:${Math.round(p.h)}  [${p.type}]${getPlatformCollisionSummary(p)}${crop}`;
    };

    const copyPlatText = (text: string, msg: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
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

    const snapEditorPlatform = (platform: Platform, platformIdx: number) => {
      const SNAP = 8;
      const movingHit = getPlatformCollisionRect(platform);
      const movingCenterX = movingHit.x + movingHit.w / 2;
      const movingCenterY = movingHit.y + movingHit.h / 2;
      let bestDx = 0;
      let bestDy = 0;
      let bestAbsX = SNAP + 1;
      let bestAbsY = SNAP + 1;

      const considerX = (from: number, to: number) => {
        const delta = to - from;
        const abs = Math.abs(delta);
        if (abs <= SNAP && abs < bestAbsX) {
          bestAbsX = abs;
          bestDx = delta;
        }
      };

      const considerY = (from: number, to: number) => {
        const delta = to - from;
        const abs = Math.abs(delta);
        if (abs <= SNAP && abs < bestAbsY) {
          bestAbsY = abs;
          bestDy = delta;
        }
      };

      considerY(movingHit.y + movingHit.h, EDITOR_GROUND_Y);

      platformsRef.current.forEach((target, targetIdx) => {
        if (targetIdx === platformIdx || target.type === 'ground') return;
        const targetRects = getPlatformCollisionRects(target);
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
    };

    const makeEditorDrag = (p: Platform, mode: EditorDrag['mode'], wx: number, wy: number, origText: string, editingCrop = false): EditorDrag => {
      const hits = getPlatformCollisionRects(p);
      const hit = editorCollisionModeRef.current
        ? hits[Math.max(0, Math.min(editorCollisionBoxIdxRef.current, hits.length - 1))] ?? getPlatformCollisionRect(p)
        : getPlatformCollisionRect(p);
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
        origSlopeLeft: hit.slopeTop?.left ?? 0,
        origSlopeRight: hit.slopeTop?.right ?? 0,
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
      saveCustomSpritePlatforms(platforms);
      if (gsRef.current) gsRef.current.platforms = platforms;
      editorSelectedIdxRef.current = -1;
      editorSelectedIndicesRef.current = new Set();
      editorCollisionModeRef.current = false;
      editorCollisionBoxIdxRef.current = 0;
      editorDragRef.current = null;
      editorMarqueeRef.current = null;
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
      saveCustomSpritePlatforms(snapshot);
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

    const onCanvasMouseMove = (e: MouseEvent) => {
      const gs = gsRef.current;
      if (!gs || gs.gamePhase !== 'editor') return;
      const coords = getEditorWorldCoords(e);
      if (!coords) return;
      const { wx, wy } = coords;
      editorMouseWorldRef.current = { x: wx, y: wy };

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
            if (drag.mode === 'move') {
              box.x = Math.round(Math.max(0, Math.min(drag.origCollisionOffsetX + dx, p.w - drag.origCollisionW)));
              box.y = Math.round(Math.max(0, Math.min(drag.origCollisionOffsetY + dy, maxCollisionBottom - drag.origCollisionH)));
            } else if (drag.mode === 'resize-right') {
              box.w = Math.round(Math.max(6, Math.min(drag.origCollisionW + dx, p.w - drag.origCollisionOffsetX)));
            } else if (drag.mode === 'resize-left') {
              const maxW = drag.origCollisionOffsetX + drag.origCollisionW;
              const newW = Math.round(Math.max(6, Math.min(drag.origCollisionW - dx, maxW)));
              box.x = Math.round(drag.origCollisionOffsetX + drag.origCollisionW - newW);
              box.w = newW;
            } else if (drag.mode === 'resize-top') {
              const maxH = drag.origCollisionOffsetY + drag.origCollisionH;
              const newH = Math.round(Math.max(6, Math.min(drag.origCollisionH - dy, maxH)));
              box.y = Math.round(drag.origCollisionOffsetY + drag.origCollisionH - newH);
              box.h = newH;
            } else if (drag.mode === 'resize-bottom') {
              box.h = Math.round(Math.max(6, Math.min(drag.origCollisionH + dy, maxCollisionBottom - drag.origCollisionOffsetY)));
            } else if (drag.mode === 'resize-corner') {
              const scale = Math.max(0.05, (drag.origCollisionW + dx) / drag.origCollisionW);
              box.w = Math.round(Math.max(6, Math.min(drag.origCollisionW * scale, p.w - drag.origCollisionOffsetX)));
              box.h = Math.round(Math.max(6, Math.min(drag.origCollisionH * scale, maxCollisionBottom - drag.origCollisionOffsetY)));
            } else if (drag.mode === 'slope-left') {
              if (!box.slopeTop) box.slopeTop = { left: 0, right: 0 };
              box.slopeTop.left = Math.max(0, Math.min(box.h, drag.origSlopeLeft + dy));
            } else if (drag.mode === 'slope-right') {
              if (!box.slopeTop) box.slopeTop = { left: 0, right: 0 };
              box.slopeTop.right = Math.max(0, Math.min(box.h, drag.origSlopeRight + dy));
            }
            clampPlatformCollisionOverrides(p);
          } else if (drag.mode === 'move') {
            p.x = Math.round(drag.origX + dx);
            p.y = Math.round(Math.min(drag.origY + dy, EDITOR_GROUND_Y - getPlatformGroundClampOffset(p)));
            p.y = Math.max(-4000, p.y);
            const preSnapX = p.x;
            const preSnapY = p.y;
            snapEditorPlatform(p, editorSelectedIdxRef.current);
            const snapDx = p.x - preSnapX;
            const snapDy = p.y - preSnapY;
            if (drag.origGroupPositions.length > 0) {
              drag.origGroupPositions.forEach(({ idx, origX, origY }) => {
                const gp = platformsRef.current[idx];
                if (gp) {
                  gp.x = Math.round(origX + dx) + snapDx;
                  gp.y = Math.round(Math.min(origY + dy, EDITOR_GROUND_Y - getPlatformGroundClampOffset(gp))) + snapDy;
                  gp.y = Math.max(-4000, gp.y);
                }
              });
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

    const onCanvasMouseDown = (e: MouseEvent) => {
      const gs = gsRef.current;
      if (!gs) return;

      // Botão direito em jogo: spawna Horácio na posição do clique, caindo do céu
      if (gs.gamePhase === 'playing' && e.button === 2) {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const cx = (e.clientX - rect.left) * scaleX;
        const worldX = cx + gs.camera.x;
        gs.player.x = worldX - gs.player.w / 2;
        gs.player.y = -300;
        gs.player.vx = 0;
        gs.player.vy = 2;
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
        return;
      }

      if (e.button !== 0) return;
      const coords = getEditorWorldCoords(e);
      if (!coords) return;
      const { wx, wy } = coords;

      // Undo/Redo/Upload + Chave de exportação (barra topo — screen space)
      const screenX = wx - editorCamXRef.current;   // = cx
      const screenY = wy - editorCamYRef.current;   // = cy
      if (screenY >= 5 && screenY <= 23) {
        if (screenX >= 166 && screenX <= 220) { editorUndo(); return; }
        if (screenX >= 224 && screenX <= 278) { editorRedo(); return; }
        if (screenX >= 286 && screenX <= 390) { spriteUploadInputRef.current?.click(); return; }
        // Área da CHAVE DE FASE (clique copia add/del para clipboard)
        if (screenX >= 398 && screenX <= CANVAS_W - 8) {
          const baseline = editorBaselineKeysRef.current;
          const currentKeys = new Set(platformsRef.current.map(p => platBaseKey(p)));
          // add: estão no estado atual mas não na baseline
          const addItems = platformsRef.current
            .filter(p => p.type !== 'ground' && !baseline.has(platBaseKey(p)))
            .map(p => ({ t: p.type[0], x: p.x, y: Math.round(p.y - GROUND_Y), w: p.w, h: p.h }));
          // del: estavam na baseline mas não estão mais no estado atual
          const delItems: Array<{ t: string; x: number; y: number; w: number; h: number }> = [];
          for (const key of baseline) {
            if (!currentKeys.has(key)) {
              const parts = key.split(':');
              if (parts.length === 5) {
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
          const countMsg = total === 0
            ? '(nenhuma mudança ainda)'
            : `+${addItems.length} add  −${delItems.length} del`;
          navigator.clipboard.writeText(exportStr).then(() => {
            editorCopiedMsgRef.current = { text: `✓ CHAVE: ${countMsg} — cole no chat`, until: Date.now() + 3500 };
          }).catch(() => {
            editorCopiedMsgRef.current = { text: 'Erro ao copiar — tente Ctrl+C no campo de texto', until: Date.now() + 3000 };
          });
          return;
        }
      }

      const selIdx = editorSelectedIdxRef.current;
      const platforms = platformsRef.current;

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
            saveCustomSpritePlatforms(platforms);
            editorSelectedIdxRef.current = newIndices[0] ?? selIdx;
            editorCollisionBoxIdxRef.current = 0;
            copyPlatText(platCoordText(platforms[editorSelectedIdxRef.current]), `✓ GRUPO DUPLICADO: ${newIndices.length} OBJETOS`);
            return;
          }

          const copy = { ...p, x: p.x + p.w };
          if (p.collisionBoxes) copy.collisionBoxes = p.collisionBoxes.map((box) => ({ ...box, slopeTop: box.slopeTop ? { ...box.slopeTop } : undefined }));
          platforms.push(copy);
          saveCustomSpritePlatforms(platforms);
          const newIdx = platforms.length - 1;
          snapEditorPlatform(copy, newIdx);
          editorSelectedIndicesRef.current = new Set([newIdx]);
          editorSelectedIdxRef.current = newIdx;
          editorCollisionBoxIdxRef.current = 0;
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
        if (hitHandle(wx, wy, topHX, topHY)) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorDragRef.current = makeEditorDrag(p, 'resize-top', wx, wy, origText, e.shiftKey);
          return;
        }
        if (hitHandle(wx, wy, bottomHX, bottomHY)) {
          if (editorCollisionModeRef.current) ensurePlatformCollisionBox(p, editorCollisionBoxIdxRef.current);
          editorDragRef.current = makeEditorDrag(p, 'resize-bottom', wx, wy, origText, e.shiftKey);
          return;
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
      const delta = (e.clientX - middleLastX) * scaleX;
      middleLastX = e.clientX;
      editorCamXRef.current = Math.max(0, editorCamXRef.current - delta);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) { middleDragging = false; return; }
      if (e.button !== 0) return;

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
        saveCustomSpritePlatforms(platformsRef.current);
      }
      editorPendingHistoryRef.current = null;
    };

    const onCanvasWheel = (e: WheelEvent) => {
      const gs = gsRef.current;
      if (!gs || gs.gamePhase !== 'editor' || editorTestModeRef.current) return;
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
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
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

      // --- Update ---
      if (gs.gamePhase === 'menu') {
        if (editorJustPressed.current) {
          editorJustPressed.current = false;
          spaceJustPressed.current = false;
          testJustPressed.current = false;
          editorCamXRef.current = 0;
          editorHoveredIdxRef.current = -1;
          editorBaselineKeysRef.current = new Set(platformsRef.current.map(platBaseKey));
          gs.gamePhase = 'editor';
        } else if (testJustPressed.current) {
          resetGame('wall-test');
          testJustPressed.current = false;
          spaceJustPressed.current = false;
        } else if (spaceJustPressed.current) {
          resetGame('story');
          spaceJustPressed.current = false;
        }
      } else if (gs.gamePhase === 'editor') {
        if (escJustPressed.current) {
          escJustPressed.current = false;
          spaceJustPressed.current = false;
          editorTestModeRef.current = false;
          gs.gamePhase = 'menu';
        } else if (editorSpawnJustPressed.current) {
          editorSpawnJustPressed.current = false;
          const spawnX = editorMouseWorldRef.current.x;
          const spawnY = GROUND_Y - PLAYER_H - 28;
          editorLastSpawnXRef.current = spawnX;
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
                // Mover grupo
                editorSelectedIndicesRef.current.forEach(i => {
                  if (i === selIdx) return;
                  const gp = platformsRef.current[i];
                  if (gp) gp.y += delta;
                });
              };

              const applyScrollX = (delta: number) => {
                const prevX = editorCamXRef.current;
                editorCamXRef.current = Math.max(0, editorCamXRef.current + delta);
                const actual = editorCamXRef.current - prevX;
                p.x += actual;
                editorDragRef.current!.origX   += actual;
                editorDragRef.current!.startWX += actual;
                editorSelectedIndicesRef.current.forEach(i => {
                  if (i === selIdx) return;
                  const gp = platformsRef.current[i];
                  if (gp) gp.x += actual;
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
        testJustPressed.current = false;
        editorJustPressed.current = false;
        editorSpawnJustPressed.current = false;
      } else if (gs.gamePhase === 'paused') {
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
        } else if (enterJustPressed.current || spaceJustPressed.current) {
          enterJustPressed.current = false;
          spaceJustPressed.current = false;
          if (pauseSelection.current === 0) {
            gs.gamePhase = 'playing';
          } else {
            editorTestModeRef.current = false;
            gs.gamePhase = 'menu';
          }
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
          ((keys.space || keys.up) && (now - lastDownPressTime.current) < DIVE_COMBO_WINDOW);
        const effectiveKeys = windowDive ? { ...keys, dive: true } : keys;

        const activePlatforms = gs.platforms.filter((p, i) =>
          !(p.type === 'box' && gs.destroyedBoxIndices.includes(i))
        );
        updatePlayer(gs.player, effectiveKeys, activePlatforms, dt, spawnP);

        // Camera follows player
        const targetCamX = gs.player.x - CANVAS_W * CAMERA_LEAD_X;
        gs.camera.x += (targetCamX - gs.camera.x) * 0.1;
        if (gs.camera.x < 0) gs.camera.x = 0;
        const targetCamY = Math.min(0, gs.player.y - CANVAS_H * 0.38);
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

        if (gs.gameMode !== 'wall-test' || editorDroneEnabledRef.current) {
          const shakeAmount = updateDrone(gs.drone, gs.player, gs.bullets, dt, spawnP, gs.platforms);
          if (shakeAmount > 0) gs.screenShake = shakeAmount;

          gs.bullets = updateBullets(gs.bullets, gs.player, gs.platforms, dt, () => {
            gs.screenShake = 6;
            for (let i = 0; i < 8; i++) spawnP(gs.player.x + PLAYER_W / 2, gs.player.y + PLAYER_H / 2, '#cc2222');
          }, gs.destroyedBoxIndices, gs.particles, gs.fallingBoxes);

          updateFallingBoxes(gs.fallingBoxes, gs.platforms, gs.destroyedBoxIndices);
        }

        gs.particles = updateParticles(gs.particles, dt);

        if (gs.screenShake > 0) gs.screenShake = Math.max(0, gs.screenShake - 0.4);

        if (gs.player.state === 'dead') {
          if (editorTestModeRef.current) {
            // Respawna no último ponto do editor sem sair do modo teste
            const newState = makeInitialState('story');
            newState.gameMode = 'wall-test';
            newState.gamePhase = 'playing';
            newState.player.x = editorLastSpawnXRef.current;
            newState.player.y = GROUND_Y - PLAYER_H;
            newState.player.vx = 0;
            newState.player.vy = 0;
            newState.camera.x = Math.max(0, editorLastSpawnXRef.current - CANVAS_W * CAMERA_LEAD_X);
            gsRef.current = newState;
          } else {
            gs.gamePhase = 'gameover';
          }
        }

        spaceJustPressed.current = false;
        editorSpawnJustPressed.current = false;
      } else if (gs.gamePhase === 'gameover') {
        if (testJustPressed.current) {
          resetGame('wall-test');
          testJustPressed.current = false;
          spaceJustPressed.current = false;
        } else if (spaceJustPressed.current) {
          resetGame(gs.gameMode);
          spaceJustPressed.current = false;
        }
      }

      // --- Render ---
      ctx.save();
      if (gs.screenShake > 0.3) {
        ctx.translate(
          (Math.random() - 0.5) * gs.screenShake,
          (Math.random() - 0.5) * gs.screenShake
        );
      }

      drawSky(ctx);
      ctx.save();
      ctx.translate(0, -gs.camera.y);
      drawBuildings(ctx, buildingsRef.current, gs.camera.x);
      drawAlleyDetails(ctx, gs.camera.x, gs.time);
      drawStartingBackWall(ctx, gs.camera.x);
      drawGround(ctx, gs.camera.x);

      // World-space rendering (offset by camera)
      ctx.save();
      ctx.translate(-gs.camera.x, 0);
      // Draw all ground segments with decoration
      for (const plat of gs.platforms) {
        if (plat.type === 'ground') {
          // Concrete body
          ctx.fillStyle = COLORS.ground;
          ctx.fillRect(plat.x, plat.y, plat.w, 90);
          // Government red edge stripe
          ctx.fillStyle = COLORS.groundEdge;
          ctx.fillRect(plat.x, plat.y, plat.w, 4);
          // Sharp void edges — left and right sides of each segment drop into the abyss
          const edgeW = 4;
          const edgeGradL = ctx.createLinearGradient(plat.x, 0, plat.x + edgeW, 0);
          edgeGradL.addColorStop(0, 'rgba(0,0,0,0.9)');
          edgeGradL.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = edgeGradL;
          ctx.fillRect(plat.x, plat.y, edgeW, 90);
          const edgeGradR = ctx.createLinearGradient(plat.x + plat.w - edgeW, 0, plat.x + plat.w, 0);
          edgeGradR.addColorStop(0, 'rgba(0,0,0,0)');
          edgeGradR.addColorStop(1, 'rgba(0,0,0,0.9)');
          ctx.fillStyle = edgeGradR;
          ctx.fillRect(plat.x + plat.w - edgeW, plat.y, edgeW, 90);
          // Cracks in concrete
          ctx.strokeStyle = COLORS.crackLine;
          ctx.lineWidth = 1;
          for (let cx2 = plat.x + 15; cx2 < plat.x + plat.w - 15; cx2 += 60) {
            ctx.beginPath();
            ctx.moveTo(cx2, plat.y + 5);
            ctx.lineTo(cx2 + 15, plat.y + 14);
            ctx.stroke();
          }
          // Puddles — wet pavement reflecting red sky
          const step = 140;
          for (let px = plat.x; px < plat.x + plat.w; px += step) {
            const worldX = Math.floor(px / step);
            const h = ((worldX * 2654435761) >>> 0) % 100;
            if (h > 38) continue;
            const pw = 18 + (h % 3) * 14;
            if (px + pw / 2 > plat.x + plat.w - 12) continue;
            const pGrad = ctx.createLinearGradient(px, plat.y + 2, px, plat.y + 10);
            pGrad.addColorStop(0, 'rgba(190,35,10,0.28)');
            pGrad.addColorStop(1, 'rgba(80,15,5,0.12)');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.ellipse(px, plat.y + 6, pw / 2, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      drawStreetBuildings(ctx, gs.platforms, gs.camera.x);
      drawJunkyardBackdrop(ctx, gs.camera.x);
      drawPlatforms(ctx, gs.platforms, gs.camera.x, balconyImgRef.current, carroImgRef.current, gs.destroyedBoxIndices, customSpriteImagesRef.current);
      drawParticles(ctx, gs);
      drawPlayer(ctx, gs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current, wallRunSheetImgRef.current, mortalSheetImgRef.current, subidaSheetImgRef.current, sideFlipSheetImgRef.current);
      if (gs.gameMode !== 'wall-test' || editorDroneEnabledRef.current) {
        drawDrone(ctx, gs);
        drawBullets(ctx, gs);
      }
      ctx.restore();

      ctx.restore(); // end shake

      drawHUD(ctx, gs);
      if (showControls.current) drawControls(ctx);

      // Barra de modo teste do editor
      if (gs.gamePhase === 'playing' && editorTestModeRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, CANVAS_H - 16, CANVAS_W, 16);
        ctx.fillStyle = 'rgba(80,230,140,0.9)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('◆ MODO TESTE DO EDITOR  |  CTRL: VOLTAR AO EDITOR ◆', CANVAS_W / 2, CANVAS_H - 4);
      }

      if (gs.gamePhase === 'menu') drawMenuScreen(ctx);
      if (gs.gamePhase === 'editor') {
        drawEditorUI(ctx, platformsRef.current, editorCamXRef.current, editorCamYRef.current, editorHoveredIdxRef.current, editorSelectedIdxRef.current, editorMouseWorldRef.current, editorCopiedMsgRef.current, editorCheckpointIdxRef.current, EDITOR_CHECKPOINTS, editorCollisionModeRef.current, editorCollisionBoxIdxRef.current, editorSelectedIndicesRef.current, editorMarqueeRef.current, editorUndoStackRef.current.length > 0, editorRedoStackRef.current.length > 0, editorBaselineKeysRef.current);
      }
      if (gs.gamePhase === 'paused') drawPauseScreen(ctx, pauseSelection.current);
      if (gs.gamePhase === 'gameover') drawGameOverScreen(ctx, gs.player.distanceTraveled, gs.time);

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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        // Strip white/near-white background automatically on upload
        const processed = stripWhiteBackground(img);
        const processedDataUrl = processed.src;

        const maxW = 180;
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(12, Math.round(img.naturalWidth * scale));
        const h = Math.max(12, Math.round(img.naturalHeight * scale));
        const platform: Platform = {
          type: 'sprite',
          x: Math.round(editorMouseWorldRef.current.x - w / 2),
          y: Math.round(Math.min(editorMouseWorldRef.current.y - h / 2, GROUND_Y - h)),
          w,
          h,
          customSpriteName: file.name,
          customSpriteDataUrl: processedDataUrl,
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
        platformsRef.current.push(platform);
        saveCustomSpritePlatforms(platformsRef.current);
        if (gsRef.current) gsRef.current.platforms = platformsRef.current;
        const idx = platformsRef.current.length - 1;
        editorSelectedIdxRef.current = idx;
        editorSelectedIndicesRef.current = new Set([idx]);
        editorCollisionModeRef.current = false;
        editorCollisionBoxIdxRef.current = 0;
        editorCopiedMsgRef.current = { text: `✓ SPRITE ADICIONADO: ${file.name}`, until: Date.now() + 3000 };
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
      />
      <input
        ref={spriteUploadInputRef}
        type="file"
        accept="image/png,image/webp"
        onChange={handleSpriteUpload}
        style={{ display: 'none' }}
      />
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
