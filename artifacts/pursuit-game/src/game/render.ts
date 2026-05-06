import type { GameState, Platform, FlyingTire, Dog, Bystander } from './types';
import type { BuildingDef } from './level';
import { RIVER, RIVER2 } from './level';
import {
  CANVAS_W, CANVAS_H, GROUND_Y, COLORS,
  PARALLAX_FAR, PARALLAX_MID, PARALLAX_NEAR,
  PLAYER_W, PLAYER_H, PLAYER_ROLL_H, DRONE_W, DRONE_H,
  DIVE_FRAME_W, DIVE_FRAME_H, DIVE_DISPLAY_H,
  WALLCLIMB_DURATION, WALLFLIP_DURATION,
} from './constants';
import { getPlatformCollisionRects } from './collision';

// Sprite sheet regions in the 1024x1024 source image
// Three characters: idle (front) | run (side) | jump (crouched)
const SPRITE_REGIONS = {
  idle: { sx: 28,  sy: 95, sw: 272, sh: 720 },
  run:  { sx: 345, sy: 75, sw: 308, sh: 770 },
  jump: { sx: 683, sy: 50, sw: 328, sh: 760 },
};

// Display heights — each animation has its own height so they all
// appear roughly the same perceived size as the idle sprite
const SPRITE_DISPLAY_H = 131;   // idle reference height
const RUN_DISPLAY_H    = 160;   // run sheet
const JUMP_DISPLAY_H   = 125;   // jump/fall sprite display height

const SPRITE_DISPLAY_W: Record<string, number> = {
  idle: Math.round(SPRITE_DISPLAY_H * (272 / 720)),
  run:  Math.round(RUN_DISPLAY_H    * (308 / 770)),
  jump: Math.round(JUMP_DISPLAY_H   * (328 / 760)),
};

// Standalone idle sprite: 108×135px, facing right in action stance
const IDLE_SPRITE = {
  w: 108, h: 135,
  displayH: SPRITE_DISPLAY_H,
  displayW: Math.round(SPRITE_DISPLAY_H * (108 / 135)),
};

// Run animation sheet: 851×315px, 4 frames side by side
const RUN_SHEET = {
  frameCount: 4,
  frameW: 213,   // 851 / 4 ≈ 213px per frame
  frameH: 315,
  displayH: RUN_DISPLAY_H,
  displayW: Math.round(RUN_DISPLAY_H * (213 / 315)),
};

// --- Background & Buildings ---

const JUNKYARD_X1 = 12100;
const JUNKYARD_X2 = 21700;

export function drawJunkyardBackdrop(ctx: CanvasRenderingContext2D, camX: number): void {
  const sx = JUNKYARD_X1 - camX;
  const ex = JUNKYARD_X2 - camX;
  if (ex < -20 || sx > CANVAS_W + 20) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, 0, ex - sx, GROUND_Y);
  ctx.clip();

  const w = ex - sx;

  // ── MURO PERIMETRAL DO FERRO VELHO ─────────────────────────────────
  // Concreto industrial alto, mostrando que a área é cercada.
  // Os prédios em paralax continuam visíveis acima e atrás do muro.
  const wallTopY = GROUND_Y - 230;
  const wallH = 230;

  // Sombra projetada no chão (atrás do muro)
  const shadowGrad = ctx.createLinearGradient(0, wallTopY - 40, 0, wallTopY);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(sx, wallTopY - 40, w, 40);

  // Corpo do muro — concreto sujo
  const wallGrad = ctx.createLinearGradient(0, wallTopY, 0, wallTopY + wallH);
  wallGrad.addColorStop(0,   '#2a241f');
  wallGrad.addColorStop(0.25,'#34281f');
  wallGrad.addColorStop(0.6, '#2a1f17');
  wallGrad.addColorStop(1,   '#1a120c');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(sx, wallTopY, w, wallH);

  // Faixa superior mais clara (topo do muro batendo a luz)
  ctx.fillStyle = 'rgba(120,90,60,0.35)';
  ctx.fillRect(sx, wallTopY, w, 4);
  ctx.fillStyle = 'rgba(60,40,25,0.55)';
  ctx.fillRect(sx, wallTopY + 4, w, 3);

  // Painéis verticais (placas de concreto pré-moldado de 4m)
  const panelW = 180;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  const firstPanel = Math.ceil((JUNKYARD_X1) / panelW) * panelW;
  for (let wx = firstPanel; wx < JUNKYARD_X2; wx += panelW) {
    const lineX = wx - camX;
    ctx.beginPath();
    ctx.moveTo(lineX, wallTopY + 6);
    ctx.lineTo(lineX, wallTopY + wallH);
    ctx.stroke();
  }

  // Manchas de ferrugem e desgaste pseudo-aleatórias
  for (let wx = JUNKYARD_X1 + 30; wx < JUNKYARD_X2; wx += 73) {
    const seed = ((wx * 2654435761) >>> 0);
    const offY = (seed % 90);
    const sw = 30 + (seed % 50);
    const sh = 14 + ((seed >> 8) % 22);
    ctx.fillStyle = 'rgba(85,38,12,0.22)';
    ctx.fillRect(wx - camX, wallTopY + 18 + offY, sw, sh);
  }
  for (let wx = JUNKYARD_X1 + 55; wx < JUNKYARD_X2; wx += 119) {
    const seed = ((wx * 40503) >>> 0);
    const offY = (seed % 140);
    ctx.fillStyle = 'rgba(20,12,8,0.35)';
    ctx.fillRect(wx - camX, wallTopY + 30 + offY, 4 + (seed % 8), 2);
  }

  // Pichações vermelhas (pequenas, escassas)
  ctx.fillStyle = 'rgba(180,28,18,0.55)';
  ctx.font = 'bold 18px monospace';
  const tags = ['ORDEM', 'CALA', '157', 'X'];
  for (let i = 0; i < 6; i++) {
    const tagX = JUNKYARD_X1 + 240 + i * 1480;
    if (tagX > JUNKYARD_X2 - 80) break;
    ctx.fillText(tags[i % tags.length], tagX - camX, wallTopY + 80 + (i % 3) * 30);
  }

  // ── ARAME FARPADO NO TOPO ──────────────────────────────────────────
  ctx.strokeStyle = '#0a0806';
  ctx.lineWidth = 1.5;
  // Linha base do arame
  ctx.beginPath();
  ctx.moveTo(sx, wallTopY - 2);
  ctx.lineTo(sx + w, wallTopY - 2);
  ctx.stroke();
  // Espirais
  ctx.strokeStyle = 'rgba(40,30,22,0.9)';
  ctx.lineWidth = 1;
  const coilStep = 26;
  for (let wx = JUNKYARD_X1; wx < JUNKYARD_X2; wx += coilStep) {
    const cx = wx - camX;
    ctx.beginPath();
    ctx.arc(cx, wallTopY - 8, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 6, wallTopY - 8);
    ctx.lineTo(cx + 6, wallTopY - 8);
    ctx.stroke();
  }

  // ── ATMOSFERA NO CHÃO ──────────────────────────────────────────────
  // Névoa baixa de poeira para integrar o muro ao solo
  const dustGrad = ctx.createLinearGradient(0, GROUND_Y - 70, 0, GROUND_Y);
  dustGrad.addColorStop(0, 'rgba(30,16,8,0)');
  dustGrad.addColorStop(1, 'rgba(35,18,8,0.45)');
  ctx.fillStyle = dustGrad;
  ctx.fillRect(sx, GROUND_Y - 70, w, 70);

  // Haze enferrujado horizontal sutil
  ctx.fillStyle = 'rgba(75,32,8,0.06)';
  ctx.fillRect(sx, GROUND_Y * 0.50, w, GROUND_Y * 0.22);

  ctx.restore();
}

// ── PRÉDIO COM ESCADA DE INCÊNDIO (estilo NY) ─────────────────────
const FE_BUILDING_X = 21720;             // prédio começa DEPOIS do muro x:21700
const FE_BUILDING_W = 820;
const FE_BUILDING_TOP_Y_OFFSET = 1560;  // altura do prédio acima do chão
const FE_PLAT_X_RENDER = 21945;          // landings centradas entre as janelas
const FE_PLAT_W_RENDER = 370;
const FE_LADDER_W = 76;                   // escada larga, no meio da landing
const FE_FLOORS_Y = [120, 270, 420, 570, 720, 870, 1020, 1170, 1320]; // mesma lista do level.ts

// Conjunto de prédios — manter sincronizado com FIRE_ESCAPES em level.ts
// Cada item: { buildingX, platX } — o offset entre eles é 880 (820 + 60 de respiro).
const FE_BUILDINGS_RENDER = [
  { buildingX: FE_BUILDING_X,         platX: FE_PLAT_X_RENDER         },
  { buildingX: FE_BUILDING_X + 880,   platX: FE_PLAT_X_RENDER + 880   },
  { buildingX: FE_BUILDING_X + 1760,  platX: FE_PLAT_X_RENDER + 1760  },
];

export function drawFireEscapeBuilding(ctx: CanvasRenderingContext2D, camX: number, withFloors: boolean = true): void {
  for (const fe of FE_BUILDINGS_RENDER) {
    drawSingleFireEscapeBuilding(ctx, camX, fe.buildingX, fe.platX, withFloors);
  }
}

function drawSingleFireEscapeBuilding(
  ctx: CanvasRenderingContext2D,
  camX: number,
  buildingX: number,
  platX: number,
  withFloors: boolean,
): void {
  const screenLeft = buildingX - camX;
  if (screenLeft + FE_BUILDING_W < -50 || screenLeft > CANVAS_W + 50) return;

  const buildingTop = GROUND_Y - FE_BUILDING_TOP_Y_OFFSET;
  const buildingH = FE_BUILDING_TOP_Y_OFFSET;

  ctx.save();

  // ── FACHADA DO PRÉDIO (tijolo escuro tipo brownstone) ───────────
  const facadeGrad = ctx.createLinearGradient(0, buildingTop, 0, GROUND_Y);
  facadeGrad.addColorStop(0,   '#2a1612');
  facadeGrad.addColorStop(0.5, '#3a1c14');
  facadeGrad.addColorStop(1,   '#1a0e0a');
  ctx.fillStyle = facadeGrad;
  ctx.fillRect(screenLeft, buildingTop, FE_BUILDING_W, buildingH);

  // Linhas de tijolos (horizontais)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let by = buildingTop + 8; by < GROUND_Y; by += 10) {
    ctx.fillRect(screenLeft, by, FE_BUILDING_W, 1);
  }
  // Junções verticais alternadas (dá textura de tijolo)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let by = buildingTop; by < GROUND_Y; by += 10) {
    const offset = ((by / 10) % 2 === 0) ? 0 : 14;
    for (let bx = screenLeft + offset; bx < screenLeft + FE_BUILDING_W; bx += 28) {
      ctx.fillRect(bx, by, 1, 10);
    }
  }

  // Borda lateral esquerda (sombra do canto)
  const edgeShadow = ctx.createLinearGradient(screenLeft, 0, screenLeft + 6, 0);
  edgeShadow.addColorStop(0, 'rgba(0,0,0,0.55)');
  edgeShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edgeShadow;
  ctx.fillRect(screenLeft, buildingTop, 6, buildingH);

  // Cornija no topo
  ctx.fillStyle = '#0e0806';
  ctx.fillRect(screenLeft - 4, buildingTop - 8, FE_BUILDING_W + 8, 8);
  ctx.fillStyle = 'rgba(80,55,40,0.4)';
  ctx.fillRect(screenLeft - 4, buildingTop - 8, FE_BUILDING_W + 8, 2);

  // ── JANELAS de cada andar ───────────────────────────────────────
  const winW = 110;
  const winH = 130;
  for (const floorH of FE_FLOORS_Y) {
    const winY = GROUND_Y - floorH - winH - 12; // janela acima do landing
    // Janela à esquerda (acessível pela escada)
    const winX1 = screenLeft + 50;
    // Janela à direita
    const winX2 = screenLeft + FE_BUILDING_W - 50 - winW;

    [winX1, winX2].forEach((wx, idx) => {
      // Moldura
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(wx - 3, winY - 3, winW + 6, winH + 6);
      // Vidro escuro
      const glassGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
      glassGrad.addColorStop(0, '#241a14');
      glassGrad.addColorStop(1, '#100a08');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(wx, winY, winW, winH);
      // Cruzeta (caixilho)
      ctx.fillStyle = 'rgba(40,30,22,0.9)';
      ctx.fillRect(wx, winY + winH / 2 - 1, winW, 2);
      ctx.fillRect(wx + winW / 2 - 1, winY, 2, winH);
      // Algumas janelas com luz quente
      const seed = ((wx * 16777619) ^ Math.floor(floorH)) >>> 0;
      const lit = (seed % 5) === idx % 3;
      if (lit) {
        ctx.fillStyle = 'rgba(255,160,60,0.55)';
        ctx.fillRect(wx + 2, winY + 2, winW - 4, winH - 4);
        const glow = ctx.createRadialGradient(wx + winW/2, winY + winH/2, 0, wx + winW/2, winY + winH/2, 40);
        glow.addColorStop(0, 'rgba(255,160,60,0.35)');
        glow.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(wx - 20, winY - 20, winW + 40, winH + 40);
      }
    });
  }

  // ── ESCADA DE INCÊNDIO (estrutura metálica) ────────────────────
  const platScreenX = platX - camX;
  const buildingWallX = screenLeft + FE_BUILDING_W - 4;
  const topFloorH = FE_FLOORS_Y[FE_FLOORS_Y.length - 1];

  // Cores metálicas (cinza-grafite, bem mais visíveis contra o tijolo)
  const METAL_DARK   = '#3a3a3e';
  const METAL_MID    = '#5a5a60';
  const METAL_LIGHT  = '#888890';
  const METAL_HIGHLIGHT = 'rgba(200,200,210,0.55)';

  // Pilar vertical principal (encostado no prédio)
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(buildingWallX - 6, GROUND_Y - topFloorH, 14, topFloorH);
  ctx.fillStyle = METAL_HIGHLIGHT;
  ctx.fillRect(buildingWallX - 6, GROUND_Y - topFloorH, 2, topFloorH);

  // Pilar de canto esquerdo da escada (estrutura externa)
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(platScreenX - 6, GROUND_Y - topFloorH, 11, topFloorH);
  ctx.fillStyle = METAL_HIGHLIGHT;
  ctx.fillRect(platScreenX - 6, GROUND_Y - topFloorH, 2, topFloorH);

  // Cada landing: grade metálica + corrimão + escada para o próximo andar
  FE_FLOORS_Y.forEach((floorH, idx) => {
    const platY = GROUND_Y - floorH;
    const platLeft = platScreenX;
    const platRight = platScreenX + FE_PLAT_W_RENDER;

    if (withFloors) {
      // Grade metálica do piso
      ctx.fillStyle = METAL_DARK;
      ctx.fillRect(platLeft - 6, platY, FE_PLAT_W_RENDER + 12, 18);
      // Highlight superior (borda iluminada)
      ctx.fillStyle = METAL_HIGHLIGHT;
      ctx.fillRect(platLeft - 6, platY, FE_PLAT_W_RENDER + 12, 2);
      // Textura riscada da grade
      ctx.fillStyle = METAL_MID;
      for (let gx = platLeft; gx < platRight; gx += 4) {
        ctx.fillRect(gx, platY + 4, 1, 12);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let gx = platLeft + 2; gx < platRight; gx += 4) {
        ctx.fillRect(gx, platY + 4, 1, 12);
      }
      // Borda inferior do landing (chapa estrutural)
      ctx.fillStyle = '#1c1c20';
      ctx.fillRect(platLeft - 8, platY + 18, FE_PLAT_W_RENDER + 16, 6);
    }

    // Corrimão (guarda-corpo) — 36px de altura
    const railTop = platY - 36;
    ctx.strokeStyle = METAL_DARK;
    ctx.lineWidth = 4;
    // Barra superior
    ctx.beginPath();
    ctx.moveTo(platLeft, railTop);
    ctx.lineTo(platRight, railTop);
    ctx.stroke();
    // Highlight no corrimão
    ctx.strokeStyle = METAL_LIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(platLeft, railTop - 1);
    ctx.lineTo(platRight, railTop - 1);
    ctx.stroke();
    // Barra do meio
    ctx.strokeStyle = METAL_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(platLeft, railTop + 18);
    ctx.lineTo(platRight, railTop + 18);
    ctx.stroke();
    // Postes verticais
    ctx.lineWidth = 2;
    for (let rx = platLeft; rx <= platRight; rx += 16) {
      ctx.beginPath();
      ctx.moveTo(rx, railTop);
      ctx.lineTo(rx, platY);
      ctx.stroke();
    }
    // Suporte diagonal embaixo (cantoneira)
    ctx.strokeStyle = METAL_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(platLeft - 2, platY + 16);
    ctx.lineTo(platLeft - 18, platY + 44);
    ctx.lineTo(platLeft - 18, platY + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(platRight + 2, platY + 16);
    ctx.lineTo(platRight + 18, platY + 44);
    ctx.lineTo(platRight + 18, platY + 16);
    ctx.stroke();

    // Escada vertical (reta) no MEIO da landing — dá acesso ao andar de cima
    if (idx < FE_FLOORS_Y.length - 1) {
      const nextH = FE_FLOORS_Y[idx + 1];
      const nextY = GROUND_Y - nextH;
      const ladderX = platLeft + FE_PLAT_W_RENDER / 2 - FE_LADDER_W / 2;
      const ladderTop = nextY + 18;     // encosta no piso do landing de cima
      const ladderBottom = platY;        // sai do landing atual
      // Trilhos verticais
      ctx.strokeStyle = METAL_DARK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ladderX, ladderTop);
      ctx.lineTo(ladderX, ladderBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ladderX + FE_LADDER_W, ladderTop);
      ctx.lineTo(ladderX + FE_LADDER_W, ladderBottom);
      ctx.stroke();
      // Highlight nos trilhos
      ctx.strokeStyle = METAL_HIGHLIGHT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ladderX - 1, ladderTop);
      ctx.lineTo(ladderX - 1, ladderBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ladderX + FE_LADDER_W + 1, ladderTop);
      ctx.lineTo(ladderX + FE_LADDER_W + 1, ladderBottom);
      ctx.stroke();
      // Degraus horizontais
      ctx.strokeStyle = METAL_MID;
      ctx.lineWidth = 3;
      for (let sy = ladderTop + 14; sy < ladderBottom - 4; sy += 16) {
        ctx.beginPath();
        ctx.moveTo(ladderX, sy);
        ctx.lineTo(ladderX + FE_LADDER_W, sy);
        ctx.stroke();
      }
    }
  });

  // Escada retrátil do primeiro landing até o chão
  const firstY = GROUND_Y - FE_FLOORS_Y[0];
  ctx.strokeStyle = METAL_DARK;
  ctx.lineWidth = 5;
  const retLadderL = platScreenX + FE_PLAT_W_RENDER / 2 - FE_LADDER_W / 2;
  const retLadderR = retLadderL + FE_LADDER_W;
  ctx.beginPath();
  ctx.moveTo(retLadderL, firstY + 18);
  ctx.lineTo(retLadderL, GROUND_Y - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(retLadderR, firstY + 18);
  ctx.lineTo(retLadderR, GROUND_Y - 4);
  ctx.stroke();
  ctx.strokeStyle = METAL_HIGHLIGHT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(retLadderL - 1, firstY + 18);
  ctx.lineTo(retLadderL - 1, GROUND_Y - 4);
  ctx.stroke();
  // Degraus da escada vertical
  ctx.strokeStyle = METAL_MID;
  ctx.lineWidth = 3;
  for (let sy = firstY + 28; sy < GROUND_Y - 4; sy += 16) {
    ctx.beginPath();
    ctx.moveTo(retLadderL, sy);
    ctx.lineTo(retLadderR, sy);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawFireEscapeFloors(
  ctx: CanvasRenderingContext2D,
  camX: number,
  textureImg: HTMLImageElement | null,
): void {
  for (const fe of FE_BUILDINGS_RENDER) {
    drawSingleFireEscapeFloors(ctx, camX, fe.buildingX, fe.platX, textureImg);
  }
}

function drawSingleFireEscapeFloors(
  ctx: CanvasRenderingContext2D,
  camX: number,
  buildingX: number,
  platX: number,
  textureImg: HTMLImageElement | null,
): void {
  const screenLeft = buildingX - camX;
  if (screenLeft + FE_BUILDING_W < -50 || screenLeft > CANVAS_W + 50) return;

  const platScreenX = platX - camX;
  const platLeft = platScreenX;
  const platRight = platScreenX + FE_PLAT_W_RENDER;
  const FLOOR_H = 24;

  ctx.save();
  for (const floorH of FE_FLOORS_Y) {
    const platY = GROUND_Y - floorH;
    if (textureImg && textureImg.complete && textureImg.naturalWidth > 0) {
      ctx.drawImage(
        textureImg,
        0, 0, textureImg.naturalWidth, textureImg.naturalHeight,
        platLeft - 6, platY - 2, FE_PLAT_W_RENDER + 12, FLOOR_H,
      );
    } else {
      ctx.fillStyle = '#3a3a3e';
      ctx.fillRect(platLeft - 6, platY, FE_PLAT_W_RENDER + 12, 18);
      ctx.fillStyle = 'rgba(200,200,210,0.55)';
      ctx.fillRect(platLeft - 6, platY, FE_PLAT_W_RENDER + 12, 2);
      ctx.fillStyle = '#5a5a60';
      for (let gx = platLeft; gx < platRight; gx += 4) {
        ctx.fillRect(gx, platY + 4, 1, 12);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let gx = platLeft + 2; gx < platRight; gx += 4) {
        ctx.fillRect(gx, platY + 4, 1, 12);
      }
      ctx.fillStyle = '#1c1c20';
      ctx.fillRect(platLeft - 8, platY + 18, FE_PLAT_W_RENDER + 16, 6);
    }
  }
  ctx.restore();
}

export function drawSky(ctx: CanvasRenderingContext2D): void {
  // Bravuna sky: near-black with authoritarian red bleeding up from below
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0,    '#0a0909');  // near-black top
  grad.addColorStop(0.45, '#100c0c');  // very dark warm gray
  grad.addColorStop(0.75, '#1a0e0a');  // reddish dark — regime floodlights
  grad.addColorStop(1,    '#220e08');  // deep red near ground
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Government emergency red glow at horizon (state of siege lighting)
  const hGrad = ctx.createLinearGradient(0, CANVAS_H * 0.48, 0, CANVAS_H);
  hGrad.addColorStop(0, 'rgba(0,0,0,0)');
  hGrad.addColorStop(0.7, 'rgba(160,25,8,0.22)');
  hGrad.addColorStop(1,   'rgba(200,30,8,0.32)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, CANVAS_H * 0.48, CANVAS_W, CANVAS_H * 0.52);

  // Distant government searchlights — vertical red-orange cones
  const searchlights = [
    { x: 0.12 }, { x: 0.48 }, { x: 0.82 },
  ];
  for (const sl of searchlights) {
    const cx = CANVAS_W * sl.x;
    const sg = ctx.createLinearGradient(cx, CANVAS_H * 0.9, cx, CANVAS_H * 0.25);
    sg.addColorStop(0, 'rgba(220,50,10,0.10)');
    sg.addColorStop(1, 'rgba(220,50,10,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(cx, CANVAS_H * 0.92);
    ctx.lineTo(cx - 35, CANVAS_H * 0.22);
    ctx.lineTo(cx + 35, CANVAS_H * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  // Heavy smoke clouds (dark, oppressive)
  ctx.fillStyle = 'rgba(18,12,10,0.65)';
  const clouds = [
    { x: 60,  y: 25,  w: 320, h: 45 },
    { x: 380, y: 15,  w: 240, h: 32 },
    { x: 620, y: 50,  w: 300, h: 38 },
    { x: 120, y: 80,  w: 200, h: 28 },
    { x: 760, y: 8,   w: 170, h: 22 },
  ];
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWindowGlow(ctx: CanvasRenderingContext2D, bx: number, by: number, wx: number, wy: number, color: string, size: number): void {
  const grd = ctx.createRadialGradient(bx + wx, by + wy, 0, bx + wx, by + wy, size * 2.5);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(bx + wx - size * 2.5, by + wy - size * 2.5, size * 5, size * 5);
}

export function drawBuildings(ctx: CanvasRenderingContext2D, buildings: BuildingDef[], camX: number): void {
  for (const b of buildings) {
    const parallax = b.layer === 'far' ? PARALLAX_FAR : b.layer === 'mid' ? PARALLAX_MID : PARALLAX_NEAR;
    const sx = b.x - camX * parallax;
    if (sx + b.w < -50 || sx > CANVAS_W + 50) continue;

    const sy = b.y;

    // Building body
    const bodyColor = b.layer === 'far' ? COLORS.buildingFar1 : b.layer === 'mid' ? COLORS.buildingMid1 : COLORS.buildingNear;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(sx, sy, b.w, b.h);

    // Edge highlight (left side)
    ctx.fillStyle = b.layer === 'far' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(sx, sy, 2, b.h);

    // Windows
    for (const w of b.windows) {
      const wSize = b.layer === 'far' ? 6 : 8;
      ctx.fillStyle = COLORS.windowDark;
      ctx.fillRect(sx + w.cx - wSize / 2, sy + w.cy - wSize / 2, wSize, wSize);
      if (w.lit) {
        ctx.fillStyle = w.color;
        ctx.fillRect(sx + w.cx - wSize / 2, sy + w.cy - wSize / 2, wSize, wSize);
        if (b.layer === 'mid') {
          drawWindowGlow(ctx, sx, sy, w.cx, w.cy, w.color, wSize);
        }
      }
    }

    // Surveillance camera (mounted on mid buildings) — key Bravuna element
    if (b.layer === 'mid') {
      const numCams = b.w > 100 ? 2 : 1;
      const camPositions = numCams === 2
        ? [sx + b.w * 0.25, sx + b.w * 0.72]
        : [sx + b.w * 0.5];
      for (const camX of camPositions) {
        const camY = sy + b.h * 0.12;
        // Arm bracket
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(camX, camY - 10);
        ctx.lineTo(camX, camY);
        ctx.lineTo(camX + 12, camY);
        ctx.stroke();
        // Camera housing
        ctx.fillStyle = '#181818';
        ctx.fillRect(camX + 9, camY - 5, 14, 9);
        // Lens — pulsing red dot
        ctx.fillStyle = 'rgba(255,20,20,0.95)';
        ctx.beginPath();
        ctx.arc(camX + 21, camY - 1, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Glow
        const camGlow = ctx.createRadialGradient(camX + 21, camY - 1, 0, camX + 21, camY - 1, 8);
        camGlow.addColorStop(0, 'rgba(255,20,20,0.3)');
        camGlow.addColorStop(1, 'rgba(255,20,20,0)');
        ctx.fillStyle = camGlow;
        ctx.beginPath();
        ctx.arc(camX + 21, camY - 1, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Government propaganda screen / billboard (some mid buildings)
    const bSeed = Math.abs(Math.floor(b.x / 80)) % 7;
    if (b.layer === 'mid' && b.w > 70 && bSeed < 3) {
      const screenW = Math.min(52, b.w * 0.58);
      const screenH = 22;
      const screenX = sx + (b.w - screenW) / 2;
      const screenY = sy + b.h * 0.32;
      // Screen border
      ctx.fillStyle = 'rgba(100,15,10,0.5)';
      ctx.fillRect(screenX - 1, screenY - 1, screenW + 2, screenH + 2);
      // Screen fill
      ctx.fillStyle = 'rgba(140,15,8,0.35)';
      ctx.fillRect(screenX, screenY, screenW, screenH);
      // Screen text
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,40,0.92)';
      const slogans = ['ORDEM', 'BRAVUNA', 'IDENTIFIQUE-SE', 'ESTADO'];
      const slogan = slogans[bSeed % slogans.length];
      const fontSize = Math.max(7, Math.round(screenH * 0.48));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(slogan, screenX + screenW / 2, screenY + screenH * 0.72);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Antenna (tower / broadcast mast)
    if (b.hasAntenna && b.layer !== 'far') {
      ctx.strokeStyle = 'rgba(50,45,40,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + b.w * 0.4, sy);
      ctx.lineTo(sx + b.w * 0.4, sy - 30);
      ctx.stroke();
      // Blinking red light on top
      ctx.fillStyle = 'rgba(255,30,20,0.7)';
      ctx.beginPath();
      ctx.arc(sx + b.w * 0.4, sy - 30, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pipe / industrial drain
    if (b.hasPipe) {
      ctx.strokeStyle = COLORS.pipe;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(sx + b.w * 0.7, sy + b.h);
      ctx.lineTo(sx + b.w * 0.7, sy + b.h * 0.3);
      ctx.lineTo(sx + b.w + 12, sy + b.h * 0.3);
      ctx.stroke();
    }

    // Resistance graffiti — actual words, not color blobs
    if (b.graffitiColor && b.layer === 'mid') {
      const tags = ['LIBERDADE', 'RESISTÊNCIA', 'BRAVUNA MATA', 'NÃO ESQUEÇA', 'ONDE ESTÃO?'];
      const tag = tags[Math.abs(Math.floor(b.x / 120)) % tags.length];
      const fontSize = Math.max(8, Math.round(b.h * 0.058));
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = b.graffitiColor;
      ctx.font = `bold italic ${fontSize}px sans-serif`;
      ctx.fillText(tag, sx + b.w * 0.12, sy + b.h * 0.68);
      ctx.restore();
    }
  }
}

// --- Alley / Near-Layer Details ---

export function drawAlleyDetails(ctx: CanvasRenderingContext2D, camX: number, time: number): void {
  // Seeded deterministic pseudo-random
  const rng = (seed: number) => {
    const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const GY = GROUND_Y;
  const SECTION = 300;
  const parallax = PARALLAX_NEAR;

  // World-to-screen X for near layer
  const toSX = (wx: number) => wx - camX * parallax;

  // Visible world range
  const wLeft  = camX * parallax - 60;
  const wRight = camX * parallax + CANVAS_W + 60;
  const sec0 = Math.floor(wLeft / SECTION) - 1;
  const sec1 = Math.floor(wRight / SECTION) + 2;

  // ── 1. Hanging wires/cables across the alley ──────────────────────────
  const wireConfigs = [
    { worldY: GY - 178, alpha: 0.68, width: 1.2 },
    { worldY: GY - 128, alpha: 0.55, width: 1.0 },
    { worldY: GY - 92,  alpha: 0.45, width: 0.8 },
  ];
  for (const wire of wireConfigs) {
    ctx.save();
    ctx.strokeStyle = `rgba(18,15,18,${wire.alpha})`;
    ctx.lineWidth = wire.width;
    ctx.beginPath();
    const stepPx = 12;
    const worldStart = Math.floor(wLeft / stepPx) * stepPx;
    let first = true;
    for (let wx = worldStart; wx <= wRight + stepPx; wx += stepPx) {
      // Sag: multiple overlapping sines give organic cable droop
      const sagA = Math.sin((wx / 380) * Math.PI * 2) * 9;
      const sagB = Math.sin((wx / 190 + 1.2) * Math.PI * 2) * 3;
      const screenX = toSX(wx);
      const screenY = wire.worldY + sagA + sagB;
      if (first) { ctx.moveTo(screenX, screenY); first = false; }
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Per-section details ────────────────────────────────────────────────
  for (let sec = sec0; sec <= sec1; sec++) {
    const s = sec * 1337;
    const secWX = sec * SECTION; // world-X of section start

    // ── 2. Crumbling wall fragment ────────────────────────────────────────
    if (rng(s + 1) > 0.38) {
      const wallH  = 52 + rng(s + 2) * 88;
      const wallW  = 20 + rng(s + 3) * 32;
      const offX   = rng(s + 4) * (SECTION - wallW);
      const sx     = toSX(secWX + offX);
      const sy     = GY - wallH;

      // Body — dark concrete
      ctx.fillStyle = 'rgba(28,24,26,0.86)';
      ctx.fillRect(sx, sy, wallW, wallH);

      // Left edge highlight
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(sx, sy, 2, wallH);

      // Top crumble edge (lighter = exposed concrete)
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(sx, sy, wallW, 2);

      // Water / rust stain dripping down
      if (rng(s + 5) > 0.45) {
        const stX = sx + wallW * 0.35;
        const sg = ctx.createLinearGradient(stX, sy + 4, stX, sy + wallH);
        sg.addColorStop(0, 'rgba(55,30,18,0.5)');
        sg.addColorStop(0.5, 'rgba(40,22,12,0.25)');
        sg.addColorStop(1, 'rgba(40,22,12,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(stX, sy + 4, wallW * 0.3, wallH);
      }

      // Vertical pipe on wall
      if (rng(s + 6) > 0.55 && wallH > 60) {
        const pipeX = sx + wallW * 0.7;
        ctx.strokeStyle = 'rgba(42,36,32,0.92)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pipeX, sy + 4);
        ctx.lineTo(pipeX, sy + wallH);
        ctx.stroke();
        // Clamp bracket
        ctx.strokeStyle = 'rgba(55,48,40,0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pipeX - 5, sy + wallH * 0.42);
        ctx.lineTo(pipeX - 10, sy + wallH * 0.42);
        ctx.stroke();
      }

      // Boarded-up window recess
      if (rng(s + 7) > 0.62 && wallH > 95 && wallW > 26) {
        const bx = sx + 3, by = sy + 12, bw = wallW - 6, bh = 20;
        ctx.fillStyle = 'rgba(7,5,7,0.92)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(52,38,28,0.85)';
        ctx.lineWidth = 1.5;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(bx + bw * (i / 3), by);
          ctx.lineTo(bx + bw * (i / 3), by + bh);
          ctx.stroke();
        }
        // X boards
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(62,44,30,0.5)';
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by + bh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw, by); ctx.lineTo(bx, by + bh); ctx.stroke();
      }

      // Graffiti tag
      if (rng(s + 8) > 0.5 && wallW > 24) {
        const tags = ['LIVRE', '!', 'RES', 'NÃO', '#77', 'ONDE?'];
        const tag  = tags[Math.floor(rng(s + 9) * tags.length)];
        const cols = ['rgba(190,55,35,0.6)', 'rgba(90,165,70,0.5)', 'rgba(70,125,195,0.5)'];
        const col  = cols[Math.floor(rng(s + 10) * cols.length)];
        const fs   = 8 + Math.round(rng(s + 11) * 5);
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = col;
        ctx.font = `bold italic ${fs}px sans-serif`;
        ctx.fillText(tag, sx + 3, sy + wallH * 0.58);
        ctx.restore();
      }
    }

    // ── 3. Broken / flickering streetlamp ────────────────────────────────
    if (rng(s + 20) > 0.72) {
      const offX  = 20 + rng(s + 21) * (SECTION - 40);
      const lampX = toSX(secWX + offX);
      const lampY = GY;
      const poleH = 85 + rng(s + 22) * 35;
      const headX = lampX + 15;
      const headY = lampY - poleH;
      const lit   = rng(s + 23) > 0.35;

      // Pole
      ctx.strokeStyle = 'rgba(32,28,28,0.88)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lampX, lampY);
      ctx.lineTo(lampX, headY);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      if (lit) {
        // Flicker using time
        const flicker = 0.55 + 0.45 * Math.sin(time * 0.0065 + sec * 2.3);
        const alpha   = 0.5 + 0.35 * flicker;

        // Ground pool of orange light
        const gpool = ctx.createRadialGradient(headX, lampY, 0, headX, lampY, 38);
        gpool.addColorStop(0, `rgba(170,80,12,${(alpha * 0.18).toFixed(2)})`);
        gpool.addColorStop(1, 'rgba(170,80,12,0)');
        ctx.fillStyle = gpool;
        ctx.beginPath();
        ctx.ellipse(headX, lampY, 38, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bulb glow
        const halo = ctx.createRadialGradient(headX, headY + 4, 0, headX, headY + 4, 14);
        halo.addColorStop(0, `rgba(230,115,30,${alpha.toFixed(2)})`);
        halo.addColorStop(1, 'rgba(230,115,30,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(headX, headY + 4, 14, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `rgba(255,200,120,${(alpha * 0.9).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(headX, headY + 4, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Broken lamp head
        ctx.fillStyle = 'rgba(22,20,20,0.9)';
        ctx.fillRect(headX - 2, headY - 2, 14, 10);
      }
    }

    // ── 4. Loose debris pile at base of alley wall ───────────────────────
    if (rng(s + 40) > 0.65) {
      const offX  = rng(s + 41) * (SECTION - 50);
      const debX  = toSX(secWX + offX);
      const debW  = 24 + rng(s + 42) * 28;
      const debH  = 6 + rng(s + 43) * 10;

      // Rubble/garbage shadow
      ctx.fillStyle = 'rgba(18,14,14,0.55)';
      ctx.beginPath();
      ctx.ellipse(debX + debW / 2, GY + 3, debW / 2, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Debris silhouette (irregular)
      ctx.fillStyle = 'rgba(32,27,24,0.78)';
      ctx.beginPath();
      ctx.moveTo(debX, GY);
      ctx.lineTo(debX + debW * 0.15, GY - debH * 0.5);
      ctx.lineTo(debX + debW * 0.35, GY - debH);
      ctx.lineTo(debX + debW * 0.6,  GY - debH * 0.7);
      ctx.lineTo(debX + debW * 0.8,  GY - debH * 0.9);
      ctx.lineTo(debX + debW, GY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawStartingBackWall(ctx: CanvasRenderingContext2D, camX: number): void {
  const wallX = -160 - camX;
  const wallY = 235;
  const wallW = 2460;
  const wallH = GROUND_Y - wallY;

  if (wallX + wallW < -80 || wallX > CANVAS_W + 80) return;

  const grad = ctx.createLinearGradient(wallX, wallY, wallX + wallW, wallY);
  grad.addColorStop(0, '#2a1711');
  grad.addColorStop(0.25, '#4a2518');
  grad.addColorStop(0.55, '#351b14');
  grad.addColorStop(0.78, '#552d1c');
  grad.addColorStop(1, '#21110d');
  ctx.fillStyle = grad;
  ctx.fillRect(wallX, wallY, wallW, wallH);

  const brickW = 54;
  const brickH = 22;
  const firstRow = Math.floor(wallY / brickH) - 1;
  const lastRow = Math.ceil((wallY + wallH) / brickH) + 1;
  const screenLeft = Math.max(wallX, -60);
  const screenRight = Math.min(wallX + wallW, CANVAS_W + 60);
  for (let row = firstRow; row <= lastRow; row++) {
    const y = row * brickH;
    if (y < wallY || y > wallY + wallH) continue;
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    const firstCol = Math.floor((screenLeft - wallX - offset) / brickW) - 1;
    const lastCol = Math.ceil((screenRight - wallX - offset) / brickW) + 1;
    for (let col = firstCol; col <= lastCol; col++) {
      const x = wallX + offset + col * brickW;
      const tone = (row * 17 + col * 31) % 5;
      const colors = ['#3b1d14', '#4a2417', '#5a2b1b', '#321710', '#442018'];
      ctx.fillStyle = colors[Math.abs(tone)];
      ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);
      ctx.fillStyle = 'rgba(255,130,80,0.035)';
      ctx.fillRect(x + 3, y + 2, brickW - 8, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + 1, y + brickH - 4, brickW - 2, 3);
    }
  }

  ctx.strokeStyle = 'rgba(12,8,7,0.65)';
  ctx.lineWidth = 2;
  for (let y = wallY; y <= wallY + wallH; y += brickH) {
    ctx.beginPath();
    ctx.moveTo(screenLeft, y);
    ctx.lineTo(screenRight, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(90,16,12,0.72)';
  ctx.fillRect(wallX, wallY, wallW, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(wallX, wallY + 5, wallW, 16);

  ctx.strokeStyle = 'rgba(15,9,7,0.84)';
  ctx.lineWidth = 7;
  for (let x = wallX + 40; x < wallX + wallW - 30; x += 184) {
    if (x < -80 || x > CANVAS_W + 80) continue;
    ctx.beginPath();
    ctx.moveTo(x, wallY + 8);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }

  const gateX = wallX + 62;
  ctx.fillStyle = 'rgba(10,8,8,0.88)';
  ctx.fillRect(gateX, wallY + 32, 120, wallH - 32);
  ctx.strokeStyle = 'rgba(200,44,28,0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(gateX, wallY + 32, 120, wallH - 32);
  ctx.strokeStyle = 'rgba(75,58,50,0.88)';
  ctx.lineWidth = 5;
  for (let x = gateX + 18; x < gateX + 120; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, wallY + 35);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255,58,38,0.92)';
  ctx.shadowColor = 'rgba(255,40,20,0.55)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SEM SAÍDA', gateX + 60, wallY + 82);
  ctx.fillStyle = 'rgba(255,120,80,0.72)';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('CORREDOR FECHADO', gateX + 60, wallY + 104);
  ctx.restore();
  ctx.textAlign = 'left';

  const topShadow = ctx.createLinearGradient(0, wallY, 0, wallY + 90);
  topShadow.addColorStop(0, 'rgba(0,0,0,0.58)');
  topShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topShadow;
  ctx.fillRect(0, wallY, CANVAS_W, 90);

  const floorShadow = ctx.createLinearGradient(0, GROUND_Y - 34, 0, GROUND_Y + 10);
  floorShadow.addColorStop(0, 'rgba(0,0,0,0)');
  floorShadow.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = floorShadow;
  ctx.fillRect(0, GROUND_Y - 34, CANVAS_W, 44);
}

// --- Ground & Platforms ---

// ── RIO COM TOCOS DE MADEIRA ──────────────────────────────────────
// Constantes em level.ts (RIVER) — importado no topo do arquivo.

// Ondas circulares na superfície da água quando algo aterrissa em um toco
type RiverRipple = { x: number; bornAt: number };
const _riverRipples: RiverRipple[] = [];
const RIPPLE_DURATION_MS = 900;

export function spawnRiverRipple(worldX: number): void {
  _riverRipples.push({ x: worldX, bornAt: Date.now() });
  // Garante limite — descarta os mais antigos se acumular
  if (_riverRipples.length > 24) _riverRipples.splice(0, _riverRipples.length - 24);
}

function drawSingleRiver(
  ctx: CanvasRenderingContext2D,
  camX: number,
  riverX1: number,
  riverX2: number,
  stumpsX: ReadonlyArray<number>,
  stumpW: number,
  stumpRise: number,
): void {
  const screenX1 = riverX1 - camX;
  const screenX2 = riverX2 - camX;
  if (screenX2 < -50 || screenX1 > CANVAS_W + 50) return;

  const waterTop = GROUND_Y + 6;
  const waterBottom = CANVAS_H + 10;
  const t = Date.now() * 0.002;

  ctx.save();

  // ── ÁGUA ─────────────────────────────────────────────────────────
  const waterGrad = ctx.createLinearGradient(0, waterTop, 0, waterBottom);
  waterGrad.addColorStop(0,    '#0d2026');
  waterGrad.addColorStop(0.25, '#08161c');
  waterGrad.addColorStop(1,    '#020608');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(screenX1, waterTop, screenX2 - screenX1, waterBottom - waterTop);

  const reflGrad = ctx.createLinearGradient(0, waterTop, 0, waterTop + 40);
  reflGrad.addColorStop(0,   'rgba(160,30,15,0.35)');
  reflGrad.addColorStop(0.6, 'rgba(80,15,8,0.15)');
  reflGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = reflGrad;
  ctx.fillRect(screenX1, waterTop, screenX2 - screenX1, 40);

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(screenX1, waterTop - 2, screenX2 - screenX1, 2);

  // ── ONDULAÇÕES ─────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(180,200,210,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const yLine = waterTop + 6 + i * 7;
    const phase = t + i * 0.6;
    ctx.beginPath();
    for (let sx = screenX1; sx <= screenX2; sx += 6) {
      const worldX = sx + camX;
      const wave = Math.sin(worldX * 0.04 + phase) * 1.5;
      if (sx === screenX1) ctx.moveTo(sx, yLine + wave);
      else ctx.lineTo(sx, yLine + wave);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(220,80,40,0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const yLine = waterTop + 2 + i * 4;
    const phase = t * 1.4 + i;
    ctx.beginPath();
    for (let sx = screenX1; sx <= screenX2; sx += 8) {
      const worldX = sx + camX;
      const wave = Math.sin(worldX * 0.03 + phase) * 1.2;
      if (sx === screenX1) ctx.moveTo(sx, yLine + wave);
      else ctx.lineTo(sx, yLine + wave);
    }
    ctx.stroke();
  }

  // ── ONDAS CIRCULARES (ripples) ──────────────────────────────────
  if (_riverRipples.length > 0) {
    const now = Date.now();
    ctx.save();
    for (let i = _riverRipples.length - 1; i >= 0; i--) {
      const r = _riverRipples[i];
      const age = now - r.bornAt;
      if (age >= RIPPLE_DURATION_MS) { _riverRipples.splice(i, 1); continue; }
      const prog = age / RIPPLE_DURATION_MS;
      const sx = r.x - camX;
      if (sx < screenX1 - 60 || sx > screenX2 + 60) continue;
      for (let k = 0; k < 3; k++) {
        const kProg = prog - k * 0.18;
        if (kProg <= 0 || kProg >= 1) continue;
        const radiusX = 6 + kProg * 56;
        const radiusY = radiusX * 0.32;
        const alpha = (1 - kProg) * 0.55;
        ctx.strokeStyle = `rgba(220,200,180,${alpha})`;
        ctx.lineWidth = 1.4 - kProg * 1.0;
        ctx.beginPath();
        ctx.ellipse(sx, waterTop + 2, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,120,60,${alpha * 0.4})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(sx, waterTop + 2, radiusX * 0.92, radiusY * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ── REFLEXOS DOS TOCOS NA ÁGUA ──────────────────────────────────
  ctx.save();
  for (const stumpX of stumpsX) {
    const sx = stumpX - camX;
    const sw = stumpW;
    if (sx + sw < -20 || sx > CANVAS_W + 20) continue;
    const topY = GROUND_Y - stumpRise;
    const aboveH = waterTop - topY;
    const reflH = aboveH + 6;
    const slices = 8;
    const sliceH = reflH / slices;
    for (let i = 0; i < slices; i++) {
      const reflY = waterTop + i * sliceH;
      const wave = Math.sin(t * 2.2 + (stumpX + i * 8) * 0.05) * (1.2 + i * 0.4);
      const alpha = Math.max(0, 0.32 - i * 0.035);
      ctx.fillStyle = `rgba(90,58,30,${alpha})`;
      ctx.fillRect(sx + wave, reflY, sw, sliceH + 0.5);
      ctx.fillStyle = `rgba(122,80,40,${alpha * 0.6})`;
      ctx.fillRect(sx + wave, reflY, 4, sliceH + 0.5);
      ctx.fillStyle = `rgba(58,36,16,${alpha * 0.7})`;
      ctx.fillRect(sx + sw - 6 + wave, reflY, 6, sliceH + 0.5);
    }
  }
  ctx.restore();

  // ── TOCOS DE MADEIRA ─────────────────────────────────────────────
  for (const stumpX of stumpsX) {
    const sx = stumpX - camX;
    const sw = stumpW;
    const topY = GROUND_Y - stumpRise;
    const submergedH = 70 + stumpRise;

    const shadowGrad = ctx.createRadialGradient(sx + sw/2, waterTop + 3, 4, sx + sw/2, waterTop + 3, sw * 0.9);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(sx + sw/2, waterTop + 3, sw * 0.85, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a2614';
    ctx.fillRect(sx + 4, waterTop, sw - 8, submergedH);
    ctx.fillStyle = 'rgba(0,30,40,0.55)';
    ctx.fillRect(sx + 4, waterTop, sw - 8, submergedH);

    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(sx, topY - 4, sw, waterTop - topY + 12);
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(sx + sw - 6, topY - 4, 6, waterTop - topY + 12);
    ctx.fillStyle = '#7a5028';
    ctx.fillRect(sx, topY - 4, 4, waterTop - topY + 12);

    ctx.fillStyle = '#7a5028';
    ctx.beginPath();
    ctx.ellipse(sx + sw/2, topY - 2, sw/2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3a1e';
    ctx.beginPath();
    ctx.ellipse(sx + sw/2, topY - 2, sw/2 - 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 1;
    for (let r = 4; r < sw/2 - 6; r += 5) {
      ctx.beginPath();
      ctx.ellipse(sx + sw/2, topY - 2, r, Math.max(1, r * 0.18), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a1808';
    ctx.beginPath();
    ctx.ellipse(sx + sw/2, topY - 2, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,80,40,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let dx = -8; dx <= sw + 8; dx += 4) {
      const ww = Math.sin(t * 3 + (sx + dx) * 0.15) * 1.5;
      if (dx === -8) ctx.moveTo(sx + dx, waterTop + ww);
      else ctx.lineTo(sx + dx, waterTop + ww);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function drawRiver(ctx: CanvasRenderingContext2D, camX: number): void {
  drawSingleRiver(ctx, camX, RIVER.X1, RIVER.X2, RIVER.STUMPS_X, RIVER.STUMP_W, RIVER.STUMP_RISE);
  drawSingleRiver(ctx, camX, RIVER2.X1, RIVER2.X2, RIVER2.STUMPS_X, RIVER2.STUMP_W, RIVER2.STUMP_RISE);
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  camX: number,
  platforms?: ReadonlyArray<{ x: number; w: number; type: string }>,
): void {
  // Abyss / void — fills the entire bottom area; holes reveal this through the ground segments
  const abyssGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  abyssGrad.addColorStop(0,    '#0a0005');  // very dark plum at ground level (hinting at depth)
  abyssGrad.addColorStop(0.18, '#050003');  // almost black
  abyssGrad.addColorStop(1,    '#000000');  // pure black abyss bottom
  ctx.fillStyle = abyssGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y + 10);

  // Depth striations — horizontal lines fading into the void, suggesting infinite fall
  for (let dy = GROUND_Y + 4; dy < CANVAS_H; dy += 10) {
    const t = (dy - GROUND_Y) / (CANVAS_H - GROUND_Y);
    const alpha = (1 - t) * 0.22;  // fades to zero at the very bottom
    ctx.strokeStyle = `rgba(60,0,20,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, dy);
    ctx.lineTo(CANVAS_W, dy);
    ctx.stroke();
  }

  // Red mist bleeding up from the void at the ground edge
  const mistGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 28);
  mistGrad.addColorStop(0,   'rgba(120,10,5,0.28)');
  mistGrad.addColorStop(0.6, 'rgba(60,3,2,0.10)');
  mistGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = mistGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, 28);

  // Bueiros agora são objetos `pothole` editáveis — desenhados em drawPotholes()
}

// ── Desenha objetos pothole (bueiros editáveis) — poço cilíndrico procedural
// Visual gerado 100% via Canvas: concreto úmido, anéis cilíndricos, musgo e sombras.
//
// BACKUP — versão toda preta (restaurar se necessário):
// export function drawPotholes(ctx, platforms, camX) {
//   for (const p of platforms) {
//     if (p.type !== 'pothole') continue;
//     const sx1 = p.x - camX; const sx2 = p.x + p.w - camX;
//     if (sx2 < -20 || sx1 > CANVAS_W + 20) continue;
//     ctx.save(); ctx.fillStyle = '#000000';
//     ctx.fillRect(sx1, p.y, sx2 - sx1, Math.max(20, p.h)); ctx.restore();
//   }
// }
export function drawPotholes(
  ctx: CanvasRenderingContext2D,
  platforms: ReadonlyArray<{ x: number; y: number; w: number; h: number; type: string }>,
  camX: number,
): void {
  for (const p of platforms) {
    if (p.type !== 'pothole') continue;

    const sx1 = p.x - camX;
    const sx2 = p.x + p.w - camX;
    if (sx2 < -20 || sx1 > CANVAS_W + 20) continue;

    const topY = p.y;
    const totalH = Math.max(20, p.h);
    const w = sx2 - sx1;
    const cx = sx1 + w / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx1, topY, w, totalH);
    ctx.clip();

    // ── 1. BASE — concreto úmido escuro (verde-musgo muito escuro)
    ctx.fillStyle = '#181810';
    ctx.fillRect(sx1, topY, w, totalH);

    // ── 2. COLUNA CENTRAL — luz vinda de cima, ligeiramente mais clara
    const centerLight = ctx.createLinearGradient(sx1, 0, sx1 + w, 0);
    centerLight.addColorStop(0,    'rgba(0,0,0,0)');
    centerLight.addColorStop(0.25, 'rgba(0,0,0,0)');
    centerLight.addColorStop(0.4,  'rgba(38,35,14,0.55)');
    centerLight.addColorStop(0.5,  'rgba(50,46,18,0.75)');
    centerLight.addColorStop(0.6,  'rgba(38,35,14,0.55)');
    centerLight.addColorStop(0.75, 'rgba(0,0,0,0)');
    centerLight.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = centerLight;
    ctx.fillRect(sx1, topY, w, totalH);

    // ── 3. ANÉIS CILÍNDRICOS — marcas horizontais de seções de concreto
    const ringSpacing = Math.max(8, totalH / 7);
    for (let ry = topY + ringSpacing * 0.6; ry < topY + totalH; ry += ringSpacing) {
      // fade-in pelo progresso (mais visível no meio, some no fundo)
      const prog = (ry - topY) / totalH;
      const alpha = 0.18 + prog * 0.12;

      // linha escura (junta do anel)
      ctx.strokeStyle = `rgba(0,0,0,${alpha + 0.15})`;
      ctx.lineWidth = Math.max(1, w * 0.025);
      ctx.beginPath();
      ctx.moveTo(sx1 + w * 0.04, ry);
      ctx.lineTo(sx1 + w * 0.96, ry);
      ctx.stroke();

      // reflexo claro logo acima (borda superior do anel)
      ctx.strokeStyle = `rgba(55,52,20,${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx1 + w * 0.08, ry - 1.5);
      ctx.lineTo(sx1 + w * 0.92, ry - 1.5);
      ctx.stroke();
    }

    // ── 4. MANCHAS DE MUSGO — retângulos determinísticos baseados em posição
    const seed = Math.floor(p.x / 10);
    const mossCount = 6 + (seed % 5);
    for (let i = 0; i < mossCount; i++) {
      const s1 = Math.sin((seed + i) * 127.1) * 0.5 + 0.5;
      const s2 = Math.sin((seed + i) * 311.7) * 0.5 + 0.5;
      const s3 = Math.sin((seed + i) * 74.3)  * 0.5 + 0.5;
      const s4 = Math.sin((seed + i) * 193.5) * 0.5 + 0.5;

      const mx = sx1 + w * 0.08 + s1 * w * 0.84;
      const my = topY + totalH * 0.12 + s2 * totalH * 0.72;
      const mw = 2 + s3 * w * 0.18;
      const mh = 3 + s4 * totalH * 0.14;

      // Verde-musgo muito discreto
      const g = Math.floor(38 + s1 * 18);
      const b = Math.floor(5  + s2 * 8);
      ctx.fillStyle = `rgba(14,${g},${b},0.22)`;
      ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    }

    // ── 5. RISCO VERTICAL ÚMIDO — fio d'água escorrendo pelo centro
    const wetGrad = ctx.createLinearGradient(0, topY, 0, topY + totalH);
    wetGrad.addColorStop(0,   'rgba(28,42,14,0)');
    wetGrad.addColorStop(0.2, 'rgba(28,42,14,0.18)');
    wetGrad.addColorStop(0.7, 'rgba(20,32,10,0.28)');
    wetGrad.addColorStop(1,   'rgba(10,18,6,0.10)');
    ctx.fillStyle = wetGrad;
    ctx.fillRect(cx - w * 0.06, topY, w * 0.12, totalH);

    // ── 6. SOMBRAS LATERAIS — paredes do poço bem escuras
    const shadowL = ctx.createLinearGradient(sx1, 0, sx1 + w * 0.42, 0);
    shadowL.addColorStop(0, 'rgba(0,0,0,0.82)');
    shadowL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowL;
    ctx.fillRect(sx1, topY, w * 0.42, totalH);

    const shadowR = ctx.createLinearGradient(sx1 + w, 0, sx1 + w * 0.58, 0);
    shadowR.addColorStop(0, 'rgba(0,0,0,0.82)');
    shadowR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowR;
    ctx.fillRect(sx1 + w * 0.58, topY, w * 0.42, totalH);

    // ── 7. SOMBRA DO FUNDO — quanto mais fundo, mais escuro
    const shadowBot = ctx.createLinearGradient(0, topY + totalH * 0.45, 0, topY + totalH);
    shadowBot.addColorStop(0, 'rgba(0,0,0,0)');
    shadowBot.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = shadowBot;
    ctx.fillRect(sx1, topY + totalH * 0.45, w, totalH * 0.55);

    // ── 8. SOMBRA DO TOPO — borda da abertura projeta sombra para dentro
    const shadowTop = ctx.createLinearGradient(0, topY, 0, topY + totalH * 0.22);
    shadowTop.addColorStop(0, 'rgba(0,0,0,0.60)');
    shadowTop.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowTop;
    ctx.fillRect(sx1, topY, w, totalH * 0.22);

    ctx.restore();
  }
}

// ── VILA HUMILDE DE MADEIRA ────────────────────────────────────────
// Backdrop após o muro x:25929 até x:29457 — casas de madeira pobres
// em primeiro plano de fundo, formando uma vila/favela onde o drone
// encontra os 2 NPCs. A partir do muro x:29457 volta o cenário de prédios.
const SHANTY_X1 = 25929;
const SHANTY_X2 = 29457;

export function drawShantyVillage(ctx: CanvasRenderingContext2D, camX: number): void {
  const sx = SHANTY_X1 - camX;
  const ex = SHANTY_X2 - camX;
  if (ex < -20 || sx > CANVAS_W + 20) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, 0, ex - sx, GROUND_Y);
  ctx.clip();

  // ── 1. SILHUETA DE MORRO ESCURO no fundo (esconde os prédios atrás)
  ctx.fillStyle = '#1a100a';
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y);
  for (let x = SHANTY_X1; x <= SHANTY_X2; x += 35) {
    const seed = ((x * 374761393) >>> 0);
    const hillH = 200 + (seed % 100);
    ctx.lineTo(x - camX, GROUND_Y - hillH);
  }
  ctx.lineTo(ex, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Faixa de transição superior do morro (gradiente para sumir suave)
  const hillFade = ctx.createLinearGradient(0, GROUND_Y - 320, 0, GROUND_Y - 180);
  hillFade.addColorStop(0, 'rgba(15,8,5,0)');
  hillFade.addColorStop(1, 'rgba(15,8,5,0.6)');
  ctx.fillStyle = hillFade;
  ctx.fillRect(sx, GROUND_Y - 320, ex - sx, 140);

  // ── 2. CASINHAS DE MADEIRA ──
  // Função auxiliar para desenhar uma casa individualmente
  function drawShantyHouse(
    hx: number,
    seedBase: number,
    baseYOffset: number,
    scale: number,
  ): void {
    const seed = (seedBase >>> 0);
    const houseW = Math.round((260 + (seed % 160)) * scale);
    // Altura uniforme: variação mínima (±12px) para evitar casas achatadas
    const houseH = Math.round((200 + ((seed >> 4) % 25)) * scale);

    // Todas as casas pousam no chão na mesma linha base
    const baseY = GROUND_Y - 4 - baseYOffset;
    const topY = baseY - houseH;
    const screenX = hx - camX;

    if (screenX + houseW < -20 || screenX > CANVAS_W + 20) return;

    // Sombra projetada no chão
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(screenX + houseW / 2, baseY + 3, houseW * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo da casa — tons de madeira velha, mais escuros e encardidos
    const woodTones = ['#5c3a20', '#6a4228', '#4e2e14', '#624030', '#583625', '#4a301a'];
    const wood = woodTones[seed % woodTones.length];
    ctx.fillStyle = wood;
    ctx.fillRect(screenX, topY, houseW, houseH);

    // Sujeira geral: camada de escurecimento sujo por cima
    const grimeGrad = ctx.createLinearGradient(screenX, topY, screenX, baseY);
    grimeGrad.addColorStop(0, 'rgba(10,6,2,0.35)');
    grimeGrad.addColorStop(0.4, 'rgba(10,6,2,0.10)');
    grimeGrad.addColorStop(1, 'rgba(10,6,2,0.55)');
    ctx.fillStyle = grimeGrad;
    ctx.fillRect(screenX, topY, houseW, houseH);

    // Sombra interna lateral direita
    const sideShade = ctx.createLinearGradient(screenX, 0, screenX + houseW, 0);
    sideShade.addColorStop(0, 'rgba(255,200,140,0.06)');
    sideShade.addColorStop(0.4, 'rgba(0,0,0,0)');
    sideShade.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(screenX, topY, houseW, houseH);

    // Tábuas verticais — algumas mais irregulares (quebradas)
    ctx.lineWidth = 1;
    const plankW = Math.round((10 + (seed % 5)) * scale);
    let plankIdx = 0;
    for (let px = screenX + plankW; px < screenX + houseW; px += plankW, plankIdx++) {
      // Usa índice relativo (estável entre frames) — não a posição de tela
      const plankSeed = ((plankIdx * 1234567) ^ seed) >>> 0;
      const isBroken = (plankSeed % 8) === 0;
      // Junta escura
      ctx.strokeStyle = isBroken ? 'rgba(8,4,2,0.90)' : 'rgba(20,12,5,0.65)';
      ctx.lineWidth = isBroken ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(px, topY + 2);
      ctx.lineTo(px, topY + houseH);
      ctx.stroke();
      // Tábua quebrada: buraco escuro em posição aleatória
      if (isBroken) {
        const bHoleY = topY + houseH * 0.2 + (plankSeed % Math.round(houseH * 0.5));
        const bHoleH = Math.round(10 + (plankSeed % 18) * scale);
        ctx.fillStyle = 'rgba(5,3,1,0.80)';
        ctx.fillRect(px - 2, bHoleY, plankW + 1, bHoleH);
      }
    }
    // Linhas horizontais de deformação (madeira empenada)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const warpCount = 2 + (seed % 3);
    for (let i = 0; i < warpCount; i++) {
      const wy = topY + houseH * (0.2 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(screenX, wy);
      ctx.lineTo(screenX + houseW, wy + ((seed >> (i * 3)) % 5) - 2);
      ctx.stroke();
    }

    // Manchas de umidade/mofo — múltiplas, grandes
    const stainCount = 3 + (seed % 4);
    for (let si = 0; si < stainCount; si++) {
      const stSeed = ((seed ^ (si * 6364136223)) >>> 0);
      const stX = screenX + (stSeed % Math.max(1, houseW - 30));
      const stY = topY + ((stSeed >> 8) % houseH);
      const stW = 20 + ((stSeed >> 16) % 60);
      const stH = 10 + ((stSeed >> 20) % 30);
      ctx.fillStyle = `rgba(${5 + (stSeed % 10)},${3 + (stSeed % 6)},${1},${0.30 + (stSeed % 20) / 100})`;
      ctx.fillRect(stX, stY, stW, stH);
    }

    // Rachaduras na parede — linhas diagonais irregulares
    const crackCount = 1 + (seed % 3);
    for (let ci = 0; ci < crackCount; ci++) {
      const crSeed = ((seed ^ (ci * 2246822519)) >>> 0);
      const crX = screenX + 20 + (crSeed % Math.max(1, houseW - 40));
      const crY = topY + 10 + ((crSeed >> 8) % Math.round(houseH * 0.6));
      const crLen = 15 + ((crSeed >> 12) % 35);
      ctx.strokeStyle = 'rgba(5,3,1,0.70)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crX, crY);
      ctx.lineTo(crX + ((crSeed >> 6) % 9) - 4, crY + crLen * 0.5);
      ctx.lineTo(crX + ((crSeed >> 4) % 11) - 5, crY + crLen);
      ctx.stroke();
    }

    // ── TINTA DESCASCADA ──────────────────────────────────────────────
    // Manchas de tinta velha (branca/amarelada) se soltando da madeira
    const peelCount = 1 + (seed % 3);
    for (let pi = 0; pi < peelCount; pi++) {
      const pSeed = ((seed ^ (pi * 3141592653)) >>> 0);
      const pX = screenX + 10 + (pSeed % Math.max(1, houseW - 50));
      const pY = topY + Math.round(houseH * 0.10) + ((pSeed >> 8) % Math.round(houseH * 0.50));
      const pW = 18 + ((pSeed >> 12) % 40);
      const pH = 8 + ((pSeed >> 16) % 20);
      // Camada de tinta antiga (bege/amarelado desbotado)
      ctx.fillStyle = `rgba(${160 + (pSeed % 40)},${130 + (pSeed % 30)},${80 + (pSeed % 25)},0.55)`;
      ctx.beginPath();
      ctx.moveTo(pX, pY);
      ctx.lineTo(pX + pW * 0.6, pY - 3);
      ctx.lineTo(pX + pW, pY + pH * 0.3);
      ctx.lineTo(pX + pW - 4, pY + pH);
      ctx.lineTo(pX + 3, pY + pH + 2);
      ctx.closePath();
      ctx.fill();
      // Borda escura simulando a tinta levantando
      ctx.strokeStyle = 'rgba(20,12,4,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Sombra embaixo da tinta solta (profundidade)
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(pX + 2, pY + pH, pW - 4, 2);
    }

    // ── PICHAÇÕES ──────────────────────────────────────────────────────
    // Rabiscos de spray em algumas casas (~40%)
    if ((seed % 5) < 2) {
      const tagSeed  = ((seed * 1664525 + 1013904223) >>> 0);
      const tagCount = 1 + (tagSeed % 2);
      // Palavras típicas de pichação de favela oprimida
      const tags = ['ZIKA', '157', 'CV', 'X', 'LUTA', 'NÃO', 'PAZ?', 'FORA', '13', 'DZ7', 'BORA'];
      // Cores de spray: vermelho, branco sujo, amarelo, verde
      const tagColors = [
        'rgba(190,25,15,0.75)',
        'rgba(200,185,140,0.65)',
        'rgba(180,160,30,0.70)',
        'rgba(30,130,60,0.65)',
        'rgba(160,20,10,0.80)',
      ];
      for (let ti = 0; ti < tagCount; ti++) {
        const tSeed = ((tagSeed ^ (ti * 6364136223)) >>> 0);
        const tagWord  = tags[tSeed % tags.length];
        const tagColor = tagColors[(tSeed >> 4) % tagColors.length];
        const tagX = screenX + 14 + (tSeed % Math.max(1, houseW - 60));
        // Pichações ficam no terço superior da parede (acima das portas/janelas)
        const tagY = topY + Math.round(houseH * 0.15) + ((tSeed >> 8) % Math.round(houseH * 0.30));
        const tagSize = Math.round((10 + (tSeed % 8)) * scale);
        // Glow de spray ao redor da letra (halo difuso)
        const tagCx = tagX + (tagWord.length * tagSize * 0.35);
        const glowR = ctx.createRadialGradient(tagCx, tagY - tagSize * 0.5, 1, tagCx, tagY - tagSize * 0.5, tagWord.length * tagSize * 0.65 + 4);
        glowR.addColorStop(0, 'rgba(255,200,80,0.12)');
        glowR.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowR;
        ctx.fillRect(tagX - 8, tagY - tagSize - 6, tagWord.length * tagSize * 0.75 + 16, tagSize + 14);
        // Texto em si — fonte condensada e grossa, ligeiramente inclinado
        ctx.save();
        ctx.translate(tagX, tagY);
        ctx.rotate(-0.06 + ((tSeed % 7) - 3) * 0.02);
        ctx.font = `bold ${tagSize}px monospace`;
        ctx.fillStyle = tagColor;
        ctx.fillText(tagWord, 0, 0);
        ctx.restore();
      }
    }

    // Desgaste severo na base (mofo avançado, 30% da altura)
    const baseGrime = ctx.createLinearGradient(0, baseY - Math.round(houseH * 0.30), 0, baseY);
    baseGrime.addColorStop(0, 'rgba(8,5,2,0)');
    baseGrime.addColorStop(1, 'rgba(8,5,2,0.65)');
    ctx.fillStyle = baseGrime;
    ctx.fillRect(screenX, baseY - Math.round(houseH * 0.30), houseW, Math.round(houseH * 0.30));

    // Faixa de sujeira na base (terra/umidade)
    ctx.fillStyle = 'rgba(15,9,3,0.55)';
    ctx.fillRect(screenX + 2, baseY - Math.round(18 * scale), houseW - 4, Math.round(18 * scale));

    // ── TELHADO triangular — telhado mais suave (proporção 0.22 da largura) ──
    const roofH = houseW * 0.22;
    const roofPeak = topY - roofH;
    const roofGrad = ctx.createLinearGradient(0, roofPeak, 0, topY);
    roofGrad.addColorStop(0, '#5a3a22');
    roofGrad.addColorStop(0.5, '#3a2414');
    roofGrad.addColorStop(1, '#1f130a');
    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.moveTo(screenX - 6, topY);
    ctx.lineTo(screenX + houseW / 2, roofPeak);
    ctx.lineTo(screenX + houseW + 6, topY);
    ctx.closePath();
    ctx.fill();
    // Borda do telhado escura
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenX - 6, topY);
    ctx.lineTo(screenX + houseW / 2, roofPeak);
    ctx.lineTo(screenX + houseW + 6, topY);
    ctx.stroke();
    // Manchas de ferrugem
    ctx.fillStyle = 'rgba(180,75,25,0.40)';
    ctx.fillRect(screenX + houseW * 0.25, topY - 4, houseW * 0.45, 3);
    // Linhas de telha
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 4; i++) {
      const ty = topY - roofH * (i / 4);
      const tShrink = (houseW / 2) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(screenX - 6 + tShrink, ty);
      ctx.lineTo(screenX + houseW + 6 - tShrink, ty);
      ctx.stroke();
    }

    // ── LAYOUT ESTRUTURADO: janelas e porta em zonas separadas, sem sobreposição ──
    // Dimensões compartilhadas
    const winW  = Math.max(14, Math.round(houseW * 0.19));
    const winH  = Math.max(12, Math.round(houseH * 0.24));
    const doorW = Math.max(16, Math.round(houseW * 0.15));
    const doorH = Math.max(28, Math.round(houseH * 0.42));
    const winY  = topY + houseH * 0.55;   // janelas no terço inferior (nível da porta)
    const doorY = baseY - doorH;           // porta encosta no chão

    // Layout para casa larga (2 janelas):
    //   [WIN_L | gap | DOOR | gap | WIN_R]
    //   8%–27% | 27%–41% | 41%–56% | 56%–67% | 67%–86%
    // Layout para casa estreita (1 janela), alternado por seed:
    //   A: [WIN | gap | DOOR]  10%–29% | 29%–55% | 55%–70%
    //   B: [DOOR | gap | WIN]  10%–25% | 25%–52% | 52%–71%
    const layout2W = {
      winLX: screenX + houseW * 0.08,
      doorX: screenX + houseW * 0.41,
      winRX: screenX + houseW * 0.67,
    };
    const layout1A = { winX: screenX + houseW * 0.10, doorX: screenX + houseW * 0.55 };
    const layout1B = { doorX: screenX + houseW * 0.10, winX: screenX + houseW * 0.52 };

    const useTwoWindows = houseW > 200;
    const layout1 = ((seed >> 28) % 2 === 0) ? layout1A : layout1B;

    // Helper: desenha uma janela em (wx, winY)
    function drawWindow(wx: number, wi: number): void {
      const litSeed = (seed ^ (wi * 7919)) >>> 0;
      const litUp   = (litSeed >> 20) % 3 !== 0;
      ctx.fillStyle = '#0e0805';
      ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
      if (litUp) {
        ctx.fillStyle = 'rgba(255,180,80,0.95)';
        ctx.fillRect(wx, winY, winW, winH);
        const glow = ctx.createRadialGradient(wx + winW / 2, winY + winH / 2, 0, wx + winW / 2, winY + winH / 2, winW * 1.6);
        glow.addColorStop(0, 'rgba(255,160,60,0.30)');
        glow.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(wx - winW, winY - winH, winW * 3, winH * 3);
      } else {
        ctx.fillStyle = 'rgba(35,25,15,0.95)';
        ctx.fillRect(wx, winY, winW, winH);
      }
      ctx.strokeStyle = 'rgba(15,8,4,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx + winW / 2, winY); ctx.lineTo(wx + winW / 2, winY + winH);
      ctx.moveTo(wx, winY + winH / 2); ctx.lineTo(wx + winW, winY + winH / 2);
      ctx.stroke();
    }

    // Helper: desenha a porta em (dx, doorY)
    function drawDoor(dx: number): void {
      ctx.fillStyle = '#1a0e06';
      ctx.fillRect(dx, doorY, doorW, doorH);
      ctx.strokeStyle = 'rgba(60,35,18,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx + doorW / 3, doorY); ctx.lineTo(dx + doorW / 3, doorY + doorH);
      ctx.moveTo(dx + doorW * 2 / 3, doorY); ctx.lineTo(dx + doorW * 2 / 3, doorY + doorH);
      ctx.stroke();
      ctx.fillStyle = 'rgba(180,140,90,0.85)';
      ctx.fillRect(dx + doorW - 4, doorY + doorH * 0.55, 2, 2);
    }

    if (useTwoWindows) {
      drawWindow(layout2W.winLX, 0);
      drawDoor(layout2W.doorX);
      drawWindow(layout2W.winRX, 1);
    } else {
      if ((seed >> 16) % 5 !== 0) drawWindow(layout1.winX, 0);
      drawDoor(layout1.doorX);
    }

    // ── ANTENA de TV improvisada ──
    if ((seed >> 6) % 3 === 0) {
      ctx.strokeStyle = 'rgba(15,12,8,0.90)';
      ctx.lineWidth = 1;
      const antX = screenX + houseW * 0.55;
      ctx.beginPath();
      ctx.moveTo(antX, roofPeak);
      ctx.lineTo(antX, roofPeak - 20);
      ctx.moveTo(antX - 7, roofPeak - 15);
      ctx.lineTo(antX + 7, roofPeak - 15);
      ctx.moveTo(antX - 5, roofPeak - 20);
      ctx.lineTo(antX + 5, roofPeak - 20);
      ctx.stroke();
    }

    // ── CHAMINÉ com fumaça em algumas casas ──
    if ((seed >> 10) % 4 === 0) {
      const chimX = screenX + houseW * 0.72;
      const chimY = roofPeak + Math.round(roofH * 0.5);
      ctx.fillStyle = '#2a1810';
      ctx.fillRect(chimX, chimY, 7, Math.round(16 * scale));
      ctx.fillStyle = 'rgba(120,110,100,0.30)';
      ctx.beginPath();
      ctx.arc(chimX + 3, chimY - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,130,120,0.20)';
      ctx.beginPath();
      ctx.arc(chimX + 6, chimY - 14, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,150,140,0.12)';
      ctx.beginPath();
      ctx.arc(chimX + 9, chimY - 25, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── FILEIRA DE FUNDO: casas menores em paralax 0.88 (mais distantes) ──
  // ctx.translate desloca +camX*0.12 para que screenX = hx - camX vire hx - camX*0.88
  const BG_STEP = 320;
  const bgStartX = Math.ceil(SHANTY_X1 / BG_STEP) * BG_STEP;
  ctx.save();
  ctx.translate(Math.round(camX * 0.12), 0);
  ctx.globalAlpha = 0.50;
  for (let hx = bgStartX; hx < SHANTY_X2; hx += BG_STEP) {
    const bgSeed = ((hx * 374761393 + 9999) >>> 0);
    const skip = (bgSeed % 6) === 0;
    if (skip) continue;
    drawShantyHouse(hx, bgSeed, 18, 0.68);
  }
  ctx.restore();

  // ── FILEIRA PRINCIPAL: casas grandes, sem espaços — step < min_houseW ──
  const HOUSE_STEP = 240;  // menor que a largura mínima (260px) → casas sempre sobrepostas/tocando
  const startX = Math.ceil(SHANTY_X1 / HOUSE_STEP) * HOUSE_STEP;
  for (let hx = startX; hx < SHANTY_X2; hx += HOUSE_STEP) {
    const seed = ((hx * 2654435761) >>> 0);
    drawShantyHouse(hx, seed, 0, 1.0);  // sem skip — terreno totalmente coberto
  }

  // ── 3. POÇAS D'ÁGUA SUJA ──────────────────────────────────────────
  // Geradas deterministicamente entre x:SHANTY_X1 e SHANTY_X2
  const PUDDLE_STEP = 170;
  const puddleStart = Math.ceil(SHANTY_X1 / PUDDLE_STEP) * PUDDLE_STEP;
  for (let px = puddleStart; px < SHANTY_X2; px += PUDDLE_STEP) {
    const pSeed = ((px * 3141592653) >>> 0);
    if ((pSeed % 5) === 0) continue;          // ~20% de posições sem poça

    const pScreenX = px - camX;
    const pW = 30 + (pSeed % 60);             // largura 30–90px
    const pH = 4  + (pSeed % 7);              // altura (profundidade) 4–10px
    const pX = pScreenX - pW / 2 + ((pSeed >> 8) % 40) - 20;
    const pY = GROUND_Y - 2;                  // pousada no chão

    if (pX + pW < sx || pX > ex) continue;

    // Corpo da poça — água escura e suja
    const puddleGrad = ctx.createRadialGradient(
      pX + pW / 2, pY, 0,
      pX + pW / 2, pY, pW * 0.6,
    );
    puddleGrad.addColorStop(0,   'rgba(30,20,12,0.80)');
    puddleGrad.addColorStop(0.6, 'rgba(20,12,6,0.65)');
    puddleGrad.addColorStop(1,   'rgba(10,6,3,0)');
    ctx.fillStyle = puddleGrad;
    ctx.beginPath();
    ctx.ellipse(pX + pW / 2, pY, pW / 2, pH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Reflexo da iluminação ambiente — tom avermelhado do regime
    const hasWarmReflection = (pSeed % 3) !== 0;
    if (hasWarmReflection) {
      const reflColor = (pSeed % 4) === 0
        ? 'rgba(255,120,40,0.18)'    // reflexo de janela acesa (laranja quente)
        : 'rgba(160,20,8,0.14)';     // reflexo dos holofotes vermelhos do regime
      const refGrad = ctx.createLinearGradient(pX, pY - pH, pX + pW * 0.65, pY);
      refGrad.addColorStop(0, reflColor);
      refGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = refGrad;
      ctx.beginPath();
      ctx.ellipse(pX + pW / 2, pY, pW / 2, pH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Especular — pequeno brilho branco
    ctx.fillStyle = 'rgba(200,190,170,0.22)';
    ctx.beginPath();
    ctx.ellipse(
      pX + pW * 0.35, pY - 1,
      pW * 0.12, pH * 0.35,
      -0.3, 0, Math.PI * 2,
    );
    ctx.fill();
  }

  // ── 4. NÉVOA BAIXA atmosférica integrando ao chão ──
  const fogGrad = ctx.createLinearGradient(0, GROUND_Y - 60, 0, GROUND_Y);
  fogGrad.addColorStop(0, 'rgba(40,25,15,0)');
  fogGrad.addColorStop(1, 'rgba(40,25,15,0.55)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(sx, GROUND_Y - 60, ex - sx, 60);

  ctx.restore();
}

// ── ESCADA LATERAL — renderiza todas as plataformas _stair:true ─────
// flipX:true na plataforma inverte a escada horizontalmente.
// Degraus de colisão ficam no level-patch.json (hideRender:true).
const STAIR_STEP_W = 50;   // largura de cada degrau (px)
const STAIR_STEP_H = 18;   // altura de cada espelho  (px)

export function drawStaircase(ctx: CanvasRenderingContext2D, camX: number, platforms: Platform[]): void {
  if (!platforms) return;
  const BRIGHT  = '#d0dce8';
  const MID     = '#8a9aaa';
  const DARK    = '#4a5560';
  const OUTLINE = '#1a2028';

  for (const plat of platforms) {
    if (!(plat as any)._stair) continue;
    const N      = Math.max(1, Math.round(plat.h / STAIR_STEP_H));
    const totalW = N * STAIR_STEP_W;
    const totalH = N * STAIR_STEP_H;
    const sx     = plat.x - camX;
    if (sx + totalW < -20 || sx > CANVAS_W + 20) continue;

    const baseY = plat.y + plat.h;
    ctx.save();
    if (plat.flipX) {
      // Espelha horizontalmente: pivot na borda direita da escada
      ctx.translate(sx + totalW, 0);
      ctx.scale(-1, 1);
      _drawStaircaseFrame(ctx, 0, totalW, totalH, N, baseY, BRIGHT, MID, DARK, OUTLINE);
    } else {
      _drawStaircaseFrame(ctx, sx, totalW, totalH, N, baseY, BRIGHT, MID, DARK, OUTLINE);
    }
    ctx.restore();
  }
}

function _drawStaircaseFrame(
  ctx: CanvasRenderingContext2D,
  sx: number, totalW: number, totalH: number, N: number, baseY: number,
  BRIGHT: string, MID: string, DARK: string, OUTLINE: string,
): void {
  const stepW = totalW / N;
  const stepH = totalH / N;

  // ── 1. Stringer diagonal ────────────────────────────────────────────
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx,     baseY - 2);
  ctx.lineTo(sx + totalW, baseY - totalH - 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = MID;
  ctx.beginPath();
  ctx.moveTo(sx + 3, baseY - 2);
  ctx.lineTo(sx + totalW + 3, baseY - totalH - 2);
  ctx.stroke();

  // ── 2. Degraus: riser + tread + rebite ─────────────────────────────
  for (let i = 0; i < N; i++) {
    const tx = sx + i * stepW;
    const ty = baseY - (i + 1) * stepH;

    // Riser bar (vertical)
    const rGrad = ctx.createLinearGradient(tx, 0, tx + 3, 0);
    rGrad.addColorStop(0, BRIGHT);
    rGrad.addColorStop(1, DARK);
    ctx.fillStyle = rGrad;
    ctx.fillRect(tx, ty, 3, stepH);

    // Tread bar (horizontal)
    const tGrad = ctx.createLinearGradient(tx, ty, tx, ty + 5);
    tGrad.addColorStop(0,   BRIGHT);
    tGrad.addColorStop(0.4, MID);
    tGrad.addColorStop(1,   DARK);
    ctx.fillStyle = tGrad;
    ctx.fillRect(tx - 1, ty, stepW + 2, 5);

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(tx - 1, ty, stepW + 2, 5);

    // Rebite
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(tx + 1.5, ty + 2.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BRIGHT;
    ctx.beginPath();
    ctx.arc(tx + 1.2, ty + 2.2, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Sombra abaixo do tread
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(tx, ty + 5, stepW, 4);
  }

  // Riser de fechamento na borda direita
  ctx.fillStyle = MID;
  ctx.fillRect(sx + totalW - 2, baseY - totalH, 2, stepH);

  // ── 3. Perfil de contorno sem base em baixo ─────────────────────────
  ctx.beginPath();
  ctx.moveTo(sx, baseY);
  for (let i = 0; i < N; i++) {
    const tx = sx + i * stepW;
    const ty = baseY - (i + 1) * stepH;
    ctx.lineTo(tx,         ty);
    ctx.lineTo(tx + stepW, ty);
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── Cached platform groups — recomputed once per platform array reference change ───────
let _cachedPlatRef: unknown = null;
type PlatType2 = { x: number; y: number; w: number; h: number; type: string; isRiverStump?: boolean; hideRender?: boolean };
type Group2 = { x1: number; x2: number; sw: number; plats: PlatType2[] };
let _cachedGroups: Group2[] = [];

function buildGroups(platforms: PlatType2[]): Group2[] {
  const elev = platforms
    .filter(p => p.type === 'platform' && !p.isRiverStump && !p.hideRender)
    .sort((a, b) => a.x - b.x);
  const groups: Group2[] = [];
  let cur: Group2 | null = null;
  for (const p of elev) {
    const fits = cur && (p.x - cur.x2 < 280) && (cur.plats.length < 2);
    if (!fits) {
      if (cur) groups.push(cur);
      const x1 = p.x - 120;
      const x2 = p.x + p.w + 120;
      cur = { x1, x2, sw: x2 - x1, plats: [p] };
    } else {
      cur!.x2 = Math.max(cur!.x2, p.x + p.w + 120);
      cur!.sw  = cur!.x2 - cur!.x1;
      cur!.plats.push(p);
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

// Brick colours (alternating rows, pixel-art style)
const BRICK_ROWS = ['#5c2e18', '#4e2412', '#5c2e18', '#522a14'] as const;
const BRICK_W  = 16; // individual brick width
const BRICK_H  = 8;  // individual brick height
const MORTAR   = 1;  // mortar gap (dark base shows through)
const BRICK_STEP_X = BRICK_W + MORTAR;
const BRICK_STEP_Y = BRICK_H + MORTAR;

// ── Large street buildings — drawn directly every frame (no OffscreenCanvas)
export function drawStreetBuildings(
  ctx: CanvasRenderingContext2D,
  platforms: ReturnType<typeof import('./level')['generateLevel']>,
  camX: number
): void {
  if (platforms !== _cachedPlatRef) {
    _cachedGroups  = buildGroups(platforms as PlatType2[]);
    _cachedPlatRef = platforms;
  }

  const bH = GROUND_Y;

  for (const g of _cachedGroups) {
    const sx = g.x1 - camX;
    const sw = g.sw;
    if (sx + sw < -80 || sx > CANVAS_W + 80) continue;

    // ── 1. Mortar base (darkest colour fills the whole column) ──
    ctx.fillStyle = '#1e0c06';
    ctx.fillRect(sx, 0, sw, bH);

    // ── 2. Individual bricks — staggered rows, mortar (dark base) shows through ──
    for (let row = 0, ry = 0; ry < bH; row++, ry += BRICK_STEP_Y) {
      const brickColor = BRICK_ROWS[row % BRICK_ROWS.length];
      ctx.fillStyle = brickColor;
      const rowH   = Math.min(BRICK_H, bH - ry);
      const offset = (row % 2) * Math.round(BRICK_STEP_X / 2);
      for (let bx = sx - offset; bx < sx + sw; bx += BRICK_STEP_X) {
        const bx0 = Math.max(bx, sx);
        const bw  = Math.min(bx + BRICK_W, sx + sw) - bx0;
        if (bw > 0) ctx.fillRect(bx0, ry, bw, rowH);
      }
    }

    // ── 3. Subtle vertical corner lines (pixel-art depth) ──
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, 0, 2, bH);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + sw - 3, 0, 3, bH);

    // ── 4. Top shadow fade ──
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(sx, 0, sw, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx, 6, sw, 8);

    // Janelas do fundo removidas — as sacadas em drawPlatforms já cuidam disso
  }
}

export function drawFlyingTires(
  ctx: CanvasRenderingContext2D,
  flyingTires: FlyingTire[],
  camX: number,
  rollingTireImg?: HTMLImageElement | null
): void {
  for (const t of flyingTires) {
    const sx = t.x - camX;
    if (sx + t.radius < -20 || sx - t.radius > CANVAS_W + 20) continue;
    const r = t.radius;

    ctx.save();
    ctx.translate(sx, t.y);
    ctx.rotate(t.angle);

    if (rollingTireImg && rollingTireImg.complete && rollingTireImg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(rollingTireImg, -r, -r, r * 2, r * 2);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
      continue;
    }

    ctx.fillStyle = '#181818';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
      ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export function drawPlatforms(
  ctx: CanvasRenderingContext2D,
  platforms: Platform[],
  camX: number,
  balconyImg?: HTMLImageElement | null,
  carroImg?: HTMLImageElement | null,
  destroyedBoxIndices?: number[],
  customSpriteImages?: Map<string, HTMLImageElement>,
  destroyedTireIndices?: number[],
): void {
  for (let pi = 0; pi < platforms.length; pi++) {
    const plat = platforms[pi];
    if (plat.type === 'ground') continue;   // drawn separately
    if (plat.type === 'pothole') continue;  // drawn by drawPotholes()
    if (plat.hideRender) continue; // desenhada por outro renderizador (ex.: escada de incêndio)
    if (plat.type === 'box'  && destroyedBoxIndices?.includes(pi)) continue;
    if ((plat.type === 'tire' || plat.type === 'tireHideout') && destroyedTireIndices?.includes(pi)) continue;
    if (plat.type === 'tireHideout') continue;
    const sx = plat.x - camX;
    if (sx + plat.w < -20 || sx > CANVAS_W + 20) continue;
    const rotationDeg = plat.rotation ?? 0;
    const hasRotation = Math.abs(rotationDeg) > 0.01;
    if (hasRotation) {
      ctx.save();
      ctx.translate(sx + plat.w / 2, plat.y + plat.h / 2);
      ctx.rotate(rotationDeg * Math.PI / 180);
      ctx.translate(-(sx + plat.w / 2), -(plat.y + plat.h / 2));
    }
    const restorePlatformRotation = () => {
      if (hasRotation) ctx.restore();
    };

    if (plat.type === 'sprite') {
      const img = plat.customSpriteName ? customSpriteImages?.get(plat.customSpriteName) : undefined;
      if (img && img.complete && img.naturalWidth > 0) {
        const cropLeft = Math.max(0, Math.min(plat.cropLeft ?? 0, plat.w - 6));
        const cropRight = Math.max(0, Math.min(plat.cropRight ?? 0, plat.w - cropLeft - 6));
        const cropTop = Math.max(0, Math.min(plat.cropTop ?? 0, plat.h - 6));
        const cropBottom = Math.max(0, Math.min(plat.cropBottom ?? 0, plat.h - cropTop - 6));
        const srcX = img.naturalWidth * (cropLeft / plat.w);
        const srcY = img.naturalHeight * (cropTop / plat.h);
        const srcW = img.naturalWidth * ((plat.w - cropLeft - cropRight) / plat.w);
        const srcH = img.naturalHeight * ((plat.h - cropTop - cropBottom) / plat.h);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, sx + cropLeft, plat.y + cropTop, plat.w - cropLeft - cropRight, plat.h - cropTop - cropBottom);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = 'rgba(80,180,255,0.18)';
        ctx.fillRect(sx, plat.y, plat.w, plat.h);
        ctx.strokeStyle = 'rgba(120,220,255,0.85)';
        ctx.strokeRect(sx, plat.y, plat.w, plat.h);
      }
      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'obstacle') {
      // Trash can — large dark green municipal bin
      const x = sx;
      const y = plat.y;
      const w = plat.w;
      const h = plat.h;

      // Body
      ctx.fillStyle = '#2a4a2a';
      ctx.fillRect(x + 2, y + 8, w - 4, h - 8);

      // Body highlight (left edge)
      ctx.fillStyle = '#3a6a3a';
      ctx.fillRect(x + 2, y + 8, 4, h - 8);

      // Body shadow (right edge)
      ctx.fillStyle = '#1a311a';
      ctx.fillRect(x + w - 6, y + 8, 4, h - 8);

      // Lid
      ctx.fillStyle = '#1e381e';
      ctx.fillRect(x, y, w, 10);
      ctx.fillStyle = '#2e502e';
      ctx.fillRect(x, y, w, 3);

      // Handle on lid
      ctx.fillStyle = '#152815';
      ctx.fillRect(x + w / 2 - 5, y - 3, 10, 5);
      ctx.fillStyle = '#3a6a3a';
      ctx.fillRect(x + w / 2 - 4, y - 2, 8, 2);

      // Horizontal rib lines on body
      ctx.strokeStyle = 'rgba(20,50,20,0.7)';
      ctx.lineWidth = 1;
      for (let ry = y + 18; ry < y + h - 4; ry += 12) {
        ctx.beginPath();
        ctx.moveTo(x + 2, ry);
        ctx.lineTo(x + w - 2, ry);
        ctx.stroke();
      }

      // Biohazard / recycling symbol hint (simple X mark)
      ctx.fillStyle = 'rgba(50,100,50,0.5)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('♻', x + w / 2, y + h - 10);
      ctx.textAlign = 'left';

      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'car') {
      const x = sx;
      const y = plat.y;
      const w = plat.w;
      const h = plat.h;

      // ── Se a imagem do carro já carregou, usa ela diretamente ──
      if (carroImg && carroImg.naturalWidth > 0) {
        // A imagem é 1080×1080; o carro ocupa aprox. 5%-95% em x e 33%-72% em y
        const SRC_W = carroImg.naturalWidth;
        const SRC_H = carroImg.naturalHeight;
        const baseSx = SRC_W * 0.04;
        const baseSy = SRC_H * 0.32;
        const baseSw = SRC_W * 0.92;
        const baseSh = SRC_H * 0.42;
        const cropLeft = Math.max(0, Math.min(plat.cropLeft ?? 0, w - 6));
        const cropRight = Math.max(0, Math.min(plat.cropRight ?? 0, w - cropLeft - 6));
        const cropTop = Math.max(0, Math.min(plat.cropTop ?? 0, h - 6));
        const cropBottom = Math.max(0, Math.min(plat.cropBottom ?? 0, h - cropTop - 6));
        const sx0 = baseSx + baseSw * (cropLeft / w);
        const sy0 = baseSy + baseSh * (cropTop / h);
        const sw0 = baseSw * ((w - cropLeft - cropRight) / w);
        const sh0 = baseSh * ((h - cropTop - cropBottom) / h);
        const dx0 = x + cropLeft;
        const dy0 = y + cropTop;
        const dw0 = w - cropLeft - cropRight;
        const dh0 = h - cropTop - cropBottom;
        // Sombra no chão
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(x + w * 0.05, y + h * 0.96, w * 0.90, h * 0.04);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(carroImg, sx0, sy0, sw0, sh0, dx0, dy0, dw0, dh0);
        ctx.imageSmoothingEnabled = true;
        restorePlatformRotation();
        continue;
      }

      // ── Fallback proporcional (enquanto imagem carrega) ──
      const px = Math.max(1, Math.round(w / 56));
      const fx = (t: number) => Math.round(x + t * w);
      const fy = (t: number) => Math.round(y + t * h);
      const fw = (t: number) => Math.max(px, Math.round(t * w));
      const fh = (t: number) => Math.max(px, Math.round(t * h));
      const pr = (tx: number, ty: number, tw: number, th: number, col: string) => {
        ctx.fillStyle = col;
        ctx.fillRect(fx(tx), fy(ty), fw(tw), fh(th));
      };

      // ── GROUND SHADOW ──
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(fx(0.04), fy(0.96), fw(0.92), fh(0.05));

      // ── UNDERCARRIAGE ──
      pr(0.03, 0.80, 0.94, 0.20, '#0b0908');
      pr(0.05, 0.82, 0.90, 0.12, '#131008');

      // ── BODY LOWER PANEL (belt-line down, full width) ──
      pr(0.00, 0.36, 1.00, 0.46, '#5e5848');   // base olive-gray
      pr(0.00, 0.36, 1.00, px/h, '#7a7060');   // top highlight strip
      pr(0.00, 0.80, 1.00, px/h, '#18150e');   // bottom shadow strip

      // ── HOOD (front 22%) — slightly lower top than door line ──
      pr(0.00, 0.42, 0.22, 0.40, '#58524a');
      pr(0.00, 0.42, 0.22, px/h, '#706a5e');   // hood top edge
      pr(0.00, 0.72, 0.21, 0.08, '#282420');   // hood front nose slope

      // ── TRUNK (rear 20%) ──
      pr(0.79, 0.42, 0.21, 0.40, '#565048');
      pr(0.79, 0.42, 0.21, px/h, '#6e6860');

      // ── TRUNK SPOILER LIP ──
      pr(0.79, 0.36, 0.14, 0.04, '#403c36');
      pr(0.79, 0.36, 0.14, px/h, '#605a52');

      // ── ROOF CABIN (x: 17%–83%, y: 0%–38%) ──
      pr(0.17, 0.01, 0.66, 0.37, '#2a2620');   // roof fill
      pr(0.17, 0.01, 0.66, px/h, '#3e3a32');   // top edge
      pr(0.17, 0.36, 0.66, px/h, '#18150e');   // bottom edge

      // ── PILLARS ──
      pr(0.17, 0.03, 0.05, 0.34, '#1c1912');   // A-pillar
      pr(0.78, 0.03, 0.04, 0.34, '#1c1912');   // C-pillar
      pr(0.49, 0.03, 0.04, 0.34, '#161410');   // B-pillar (wide)

      // ── WINDSHIELD — near-black, broken ──
      pr(0.22, 0.03, 0.27, 0.33, '#060a0c');
      // crack lines
      ctx.strokeStyle = 'rgba(180,210,220,0.22)';
      ctx.lineWidth = px;
      ctx.beginPath();
      ctx.moveTo(fx(0.29), fy(0.04)); ctx.lineTo(fx(0.34), fy(0.18)); ctx.lineTo(fx(0.31), fy(0.34));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx(0.34), fy(0.18)); ctx.lineTo(fx(0.40), fy(0.25));
      ctx.stroke();

      // ── FRONT DOOR WINDOW ──
      pr(0.53, 0.03, 0.15, 0.33, '#070b0e');
      pr(0.53, 0.03, px/w, 0.33, '#14181c');
      pr(0.68-px/w, 0.03, px/w, 0.33, '#14181c');

      // ── REAR DOOR WINDOW ──
      pr(0.69, 0.03, 0.12, 0.33, '#060a0d');
      pr(0.81-px/w, 0.03, px/w, 0.33, '#12161a');

      // ── REAR QUARTER WINDOW ── (small, between C-pillar and rear)
      // (folded into C-pillar area, implicit in roof shape)

      // ── BELT LINE SEAM ──
      ctx.fillStyle = '#18140c';
      ctx.fillRect(fx(0.17), fy(0.36), fw(0.61), px*2);
      // Vertical door seams
      ctx.fillRect(fx(0.53), fy(0.36), px, fh(0.44));
      ctx.fillRect(fx(0.69), fy(0.36), px, fh(0.44));
      // Horizontal door crease (character line)
      ctx.fillStyle = '#24201a';
      ctx.fillRect(fx(0.17), fy(0.57), fw(0.61), px);

      // ── HEADLIGHT HOUSING (front) ──
      pr(0.00, 0.36, 0.15, 0.44, '#1c2228');   // overall front fascia
      // Upper lamp (rectangular)
      pr(0.01, 0.38, 0.10, 0.10, '#202830');
      pr(0.02, 0.39, 0.07, 0.08, '#5878a0');   // lens
      pr(0.02, 0.39, 0.03, 0.04, '#80a8c0');   // lens highlight
      pr(0.09, 0.39, 0.02, 0.08, '#405c80');   // inner lamp
      // Lower lamp (rectangular)
      pr(0.01, 0.49, 0.10, 0.09, '#1a2028');
      pr(0.02, 0.50, 0.07, 0.07, '#485870');
      pr(0.02, 0.50, 0.03, 0.03, '#607890');
      // Amber indicator below
      pr(0.01, 0.59, 0.06, 0.03, '#904008');
      pr(0.01, 0.59, 0.03, 0.03, '#b05010');

      // ── FRONT GRILLE ──
      pr(0.00, 0.62, 0.15, 0.16, '#10100e');
      for (let gi = 0; gi < 4; gi++) {
        ctx.fillStyle = '#080806';
        ctx.fillRect(fx(0.01), fy(0.635 + gi * 0.033), fw(0.12), Math.max(px, fh(0.018)));
      }

      // ── FRONT BUMPER ──
      pr(0.00, 0.76, 0.18, 0.05, '#1c1a16');
      pr(0.00, 0.76, 0.18, px/h, '#2e2c26');

      // ── TAIL LIGHTS (rear) ──
      pr(0.87, 0.36, 0.13, 0.16, '#600606');   // upper unit
      pr(0.88, 0.37, 0.11, 0.07, '#880a08');
      pr(0.88, 0.37, px/w, 0.13, '#b01010');   // bright inner strip
      pr(0.87, 0.53, 0.13, 0.08, '#450404');   // lower unit
      pr(0.87, 0.53, px/w, 0.08, '#780808');

      // ── REAR BUMPER ──
      pr(0.82, 0.76, 0.18, 0.05, '#1c1a16');
      pr(0.82, 0.76, 0.18, px/h, '#2e2c26');

      // ── DOOR HANDLE hints ──
      ctx.fillStyle = '#2a2820';
      ctx.fillRect(fx(0.60), fy(0.52), fw(0.05), fh(0.02));
      ctx.fillRect(fx(0.73), fy(0.52), fw(0.04), fh(0.02));

      // ── RUST PATCHES — primary orange, very prominent ──
      // Layer 1: dark rust base
      const rD: [number,number,number,number][] = [
        [0.01,0.42,0.15,0.10], [0.04,0.54,0.09,0.10], [0.08,0.64,0.08,0.08],
        [0.23,0.38,0.12,0.08], [0.30,0.50,0.09,0.12], [0.42,0.42,0.10,0.08],
        [0.55,0.38,0.08,0.08], [0.63,0.48,0.10,0.10], [0.72,0.54,0.09,0.09],
        [0.80,0.44,0.08,0.10], [0.86,0.64,0.07,0.09],
        [0.18,0.10,0.08,0.06], [0.35,0.06,0.06,0.05], [0.60,0.06,0.09,0.06], [0.76,0.08,0.06,0.05],
      ];
      for (const [rtx,rty,rtw,rth] of rD) {
        ctx.fillStyle = '#6a2808';
        ctx.fillRect(fx(rtx), fy(rty), fw(rtw), fh(rth));
      }
      // Layer 2: bright orange rust over dark base
      const rB: [number,number,number,number][] = [
        [0.02,0.43,0.11,0.07], [0.05,0.56,0.07,0.07], [0.09,0.65,0.06,0.06],
        [0.24,0.39,0.09,0.06], [0.31,0.51,0.07,0.09], [0.43,0.43,0.07,0.06],
        [0.56,0.39,0.06,0.06], [0.64,0.49,0.07,0.07], [0.73,0.55,0.07,0.07],
        [0.81,0.45,0.06,0.08], [0.87,0.65,0.05,0.07],
        [0.19,0.11,0.06,0.04], [0.36,0.07,0.04,0.03], [0.61,0.07,0.07,0.04], [0.77,0.09,0.04,0.04],
        [0.47,0.54,0.06,0.07], [0.16,0.46,0.05,0.08],
      ];
      for (const [rtx,rty,rtw,rth] of rB) {
        ctx.fillStyle = '#c85010';
        ctx.fillRect(fx(rtx), fy(rty), fw(rtw), fh(rth));
        // lighter spot inside each patch
        ctx.fillStyle = '#e06820';
        ctx.fillRect(fx(rtx+rtw*0.2), fy(rty+rth*0.2), fw(rtw*0.5), fh(rth*0.45));
      }
      // Layer 3: tiny rust pixel accents
      const rA: [number,number,number,number][] = [
        [0.13,0.48,0.04,0.04],[0.38,0.60,0.04,0.04],[0.52,0.46,0.04,0.03],
        [0.68,0.42,0.03,0.04],[0.78,0.60,0.04,0.04],[0.85,0.40,0.03,0.05],
        [0.25,0.60,0.04,0.05],[0.45,0.64,0.04,0.04],[0.58,0.56,0.03,0.05],
      ];
      for (const [rtx,rty,rtw,rth] of rA) {
        ctx.fillStyle = '#a83c0c';
        ctx.fillRect(fx(rtx), fy(rty), fw(rtw), fh(rth));
      }

      // ── WHEELS ──
      const wr  = Math.round(h * 0.205);
      const wcy = Math.round(y + h * 0.795);
      for (const wcx of [fx(0.17), fx(0.82)]) {
        // ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.ellipse(wcx, wcy+wr*0.92, wr*0.88, wr*0.16, 0, 0, Math.PI*2); ctx.fill();
        // tyre
        ctx.fillStyle = '#0e0b08';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr, 0, Math.PI*2); ctx.fill();
        // tyre inner groove
        ctx.strokeStyle = '#080605';
        ctx.lineWidth = px*2;
        ctx.beginPath(); ctx.arc(wcx, wcy, wr-px*2.5, 0, Math.PI*2); ctx.stroke();
        // rusty steel rim (flat circle — no spokes, matches reference)
        ctx.fillStyle = '#7a3e0a';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr*0.64, 0, Math.PI*2); ctx.fill();
        // rim shading rings
        ctx.fillStyle = '#5a2c06';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr*0.50, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#6e3608';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr*0.42, 0, Math.PI*2); ctx.fill();
        // bolt holes (5 bolts like the reference)
        for (let bi = 0; bi < 5; bi++) {
          const ba = (bi / 5) * Math.PI * 2 - Math.PI / 2;
          const bx = wcx + Math.cos(ba) * wr * 0.28;
          const by = wcy + Math.sin(ba) * wr * 0.28;
          ctx.fillStyle = '#1a1008';
          ctx.beginPath(); ctx.arc(bx, by, Math.max(1, wr*0.07), 0, Math.PI*2); ctx.fill();
        }
        // hub centre
        ctx.fillStyle = '#4a2808';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr*0.14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#6a3c0a';
        ctx.beginPath(); ctx.arc(wcx, wcy, wr*0.07, 0, Math.PI*2); ctx.fill();
        // rim highlight (light catches upper-left)
        ctx.fillStyle = 'rgba(160,100,30,0.28)';
        ctx.beginPath(); ctx.arc(wcx-wr*0.18, wcy-wr*0.18, wr*0.22, 0, Math.PI*2); ctx.fill();
      }

      // ── WHEEL ARCHES (dark arc cut into body) ──
      for (const wcx of [fx(0.17), fx(0.82)]) {
        ctx.fillStyle = '#0c0a07';
        ctx.beginPath();
        ctx.arc(wcx, wcy, wr+px*2, Math.PI, 0);
        ctx.lineTo(wcx+wr+px*2, fy(0.36));
        ctx.lineTo(wcx-wr-px*2, fy(0.36));
        ctx.closePath();
        ctx.fill();
      }

      // ── LOWER BODY SHADE ──
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(fx(0.17), fy(0.60), fw(0.64), fh(0.20));

      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'tire') {
      const x = sx;
      const y = plat.y;
      const w = plat.w;
      const h = plat.h;
      const cx2 = x + w / 2;
      const numTires = Math.max(1, Math.round(h / Math.max(w, 1)));
      const tireH = h / numTires;

      for (let i = 0; i < numTires; i++) {
        const ty = y + i * tireH;
        const th = tireH - 2;
        const rw = (w - 4) / 2;
        const rh = th / 2;
        const tcy = ty + th / 2;

        // Outer rubber
        ctx.fillStyle = '#181818';
        ctx.beginPath();
        ctx.ellipse(cx2, tcy, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tread groove ring
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx2, tcy, rw - 3, rh - 2, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner rim
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.ellipse(cx2, tcy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rim hole
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(cx2, tcy, rw / 4, rh / 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight sheen
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.ellipse(cx2 - rw * 0.3, tcy - rh * 0.3, rw * 0.22, rh * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'tireHideout') {
      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'box') {
      const x = sx;
      const y = plat.y;
      const w = plat.w;
      const h = plat.h;
      const crateH = 55;
      const numCrates = Math.round(h / crateH);

      for (let i = 0; i < numCrates; i++) {
        const inset = i * 3;
        const cw = w - inset * 2;
        const cx2 = x + inset;
        const cy = y + (numCrates - 1 - i) * crateH;

        // Body
        ctx.fillStyle = '#5c3d1a';
        ctx.fillRect(cx2, cy, cw, crateH - 2);

        // Top plank edge
        ctx.fillStyle = '#7a5228';
        ctx.fillRect(cx2, cy, cw, 5);

        // Bottom shadow
        ctx.fillStyle = '#3a2510';
        ctx.fillRect(cx2, cy + crateH - 7, cw, 5);

        // Left highlight
        ctx.fillStyle = '#6e4820';
        ctx.fillRect(cx2, cy, 4, crateH - 2);

        // Right shadow
        ctx.fillStyle = '#2e1a08';
        ctx.fillRect(cx2 + cw - 4, cy, 4, crateH - 2);

        // Plank lines (horizontal wood grain)
        ctx.strokeStyle = 'rgba(40,20,5,0.4)';
        ctx.lineWidth = 1;
        for (let py = cy + 14; py < cy + crateH - 8; py += 14) {
          ctx.beginPath();
          ctx.moveTo(cx2 + 4, py);
          ctx.lineTo(cx2 + cw - 4, py);
          ctx.stroke();
        }

        // Cross brace (X)
        ctx.strokeStyle = '#3d2410';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx2 + 4, cy + 4);
        ctx.lineTo(cx2 + cw - 4, cy + crateH - 9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx2 + cw - 4, cy + 4);
        ctx.lineTo(cx2 + 4, cy + crateH - 9);
        ctx.stroke();

        // Corner bolts
        ctx.fillStyle = '#9a8070';
        const bolts: [number, number][] = [
          [cx2 + 3, cy + 3], [cx2 + cw - 7, cy + 3],
          [cx2 + 3, cy + crateH - 9], [cx2 + cw - 7, cy + crateH - 9],
        ];
        for (const [bx, by] of bolts) {
          ctx.fillRect(bx, by, 4, 4);
        }
      }

      restorePlatformRotation();
      continue;
    }

    if (plat.type === 'wall') {
      // Vertical climbable wall
      ctx.fillStyle = COLORS.platformSide;
      ctx.fillRect(sx, plat.y, plat.w, plat.h);
      // Edge texture
      ctx.fillStyle = COLORS.platformEdge;
      ctx.fillRect(sx, plat.y, 2, plat.h);
      ctx.fillRect(sx + plat.w - 2, plat.y, 2, plat.h);
      // Grip marks
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let gy = plat.y + 10; gy < plat.y + plat.h - 10; gy += 20) {
        ctx.beginPath();
        ctx.moveTo(sx + 3, gy);
        ctx.lineTo(sx + plat.w - 3, gy);
        ctx.stroke();
      }
      // Moss overlay
      ctx.fillStyle = COLORS.wallMoss;
      ctx.fillRect(sx, plat.y, plat.w, plat.h);
    } else {
      const slabX = sx - 5;
      const slabW = plat.w + 10;

      // Roll-under platforms (y > GROUND_Y - 70) are low overhead obstacles —
      // use a thin ledge. True balconies get the full 2D pixel-art treatment.
      const isRollUnder = plat.y > GROUND_Y - 70;

      if (!isRollUnder && plat.h <= 20) {
        // ── Ar-condicionado externo 2D pixel-art ─────────────────────
        const acX = sx;
        const acY = plat.y;
        const acW = plat.w;
        const acH = 52;
        const t   = Date.now();

        // Corpo principal (bege/creme)
        ctx.fillStyle = '#bdb89a';
        ctx.fillRect(acX, acY, acW, acH);

        // Superfície superior (levemente mais clara — onde Horácio pousa)
        ctx.fillStyle = '#d4ceb0';
        ctx.fillRect(acX, acY, acW, 3);

        // Sombra inferior
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(acX, acY + acH, acW, 3);

        // Borda/caixa externa
        ctx.strokeStyle = '#4a4438';
        ctx.lineWidth = 1;
        ctx.strokeRect(acX + 0.5, acY + 0.5, acW - 1, acH - 1);

        // Painel esquerdo — grade de ventilação
        const grillW = Math.floor(acW * 0.26);
        ctx.fillStyle = '#2e2a22';
        ctx.fillRect(acX + 2, acY + 4, grillW, acH - 16);
        for (let gy2 = acY + 6; gy2 < acY + acH - 14; gy2 += 4) {
          ctx.fillStyle = '#1a1814';
          ctx.fillRect(acX + 3, gy2, grillW - 2, 2);
          ctx.fillStyle = '#4a4438';
          ctx.fillRect(acX + 3, gy2 - 1, grillW - 2, 1);
        }

        // Área do ventilador
        const fanAreaX = acX + grillW + 4;
        const fanAreaW = acW - grillW - 18;
        const fanAreaH = acH - 18;
        const fanCX = fanAreaX + fanAreaW / 2;
        const fanCY = acY + 5 + fanAreaH / 2;
        const fanR  = Math.min(fanAreaW, fanAreaH) / 2 - 1;

        // Aro/fundo do ventilador
        ctx.fillStyle = '#1e1c18';
        ctx.beginPath();
        ctx.arc(fanCX, fanCY, fanR + 2, 0, Math.PI * 2);
        ctx.fill();

        // Pás do ventilador (girando)
        const fanAngle = (t / 100) % (Math.PI * 2);
        const numBlades = 7;
        ctx.save();
        ctx.translate(fanCX, fanCY);
        ctx.rotate(fanAngle);
        for (let i = 0; i < numBlades; i++) {
          const a = (Math.PI * 2 / numBlades) * i;
          ctx.fillStyle = i % 2 === 0 ? '#38342c' : '#2e2a24';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, fanR - 1, a, a + (Math.PI * 2 / numBlades) * 0.75);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Cruz de proteção do ventilador (X guard)
        const gd = fanR * 0.85;
        ctx.strokeStyle = '#1a1814';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fanCX - gd, fanCY - gd); ctx.lineTo(fanCX + gd, fanCY + gd); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fanCX + gd, fanCY - gd); ctx.lineTo(fanCX - gd, fanCY + gd); ctx.stroke();
        ctx.beginPath(); ctx.arc(fanCX, fanCY, fanR + 1, 0, Math.PI * 2); ctx.stroke();

        // Hub central
        ctx.fillStyle = '#6a6258';
        ctx.beginPath(); ctx.arc(fanCX, fanCY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9a9080';
        ctx.beginPath(); ctx.arc(fanCX, fanCY, 1.5, 0, Math.PI * 2); ctx.fill();

        // Saída de ar (grilles horizontais embaixo)
        const outY = acY + acH - 12;
        ctx.fillStyle = '#1e1c18';
        ctx.fillRect(acX + 2, outY, acW - 4, 10);
        for (let gy2 = outY + 2; gy2 < outY + 10; gy2 += 3) {
          ctx.fillStyle = '#4a4438';
          ctx.fillRect(acX + 4, gy2, acW - 8, 1);
        }

        // Painel de controle (canto direito)
        const panX = acX + acW - 14;
        const panY = acY + fanAreaH + 6;
        ctx.fillStyle = '#2a2820';
        ctx.fillRect(panX, panY, 12, 10);
        // LEDs
        const blink = Math.floor(t / 800) % 2 === 0;
        ctx.fillStyle = blink ? '#dd2222' : '#881111';
        ctx.fillRect(panX + 2, panY + 2, 3, 2);
        ctx.fillStyle = '#22aa22';
        ctx.fillRect(panX + 7, panY + 2, 3, 2);
        // Botões
        ctx.fillStyle = '#6a6050';
        ctx.fillRect(panX + 2, panY + 6, 3, 2);
        ctx.fillRect(panX + 7, panY + 6, 3, 2);

        // Etiqueta da marca
        const labelX = fanAreaX;
        const labelW = Math.floor(fanAreaW * 0.55);
        ctx.fillStyle = '#1a1814';
        ctx.fillRect(labelX, panY, labelW, 10);
        ctx.fillStyle = '#c8c090';
        ctx.font = 'bold 5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ARCO', labelX + labelW / 2, panY + 7);
        ctx.textAlign = 'left';

        // Pés de fixação
        ctx.fillStyle = '#3a3428';
        ctx.fillRect(acX + 4, acY + acH - 1, 7, 4);
        ctx.fillRect(acX + acW - 11, acY + acH - 1, 7, 4);

        restorePlatformRotation();
        continue;

      } else if (!isRollUnder) {
        // ── 2D pixel-art balcony: janela acima + laje abaixo ────────
        const WIN_H  = 72;
        const SLAB_H = plat.h;
        const bx     = slabX - 4;
        const bw     = slabW + 8;

        // ── Laje (abaixo de plat.y) ───────────────────────────────
        ctx.fillStyle = '#a09280';
        ctx.fillRect(bx, plat.y, bw, 3);
        ctx.fillStyle = '#7a7060';
        ctx.fillRect(bx, plat.y + 3, bw, SLAB_H - 8);
        ctx.fillStyle = '#5e5648';
        ctx.fillRect(bx + 4, plat.y + 10, bw - 8, SLAB_H - 20);
        ctx.fillStyle = '#8c8270';
        ctx.fillRect(bx + 4, plat.y + 10, bw - 8, 2);
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(bx, plat.y + SLAB_H - 5, bw, 5);
        ctx.fillStyle = '#3e3830';
        ctx.fillRect(bx, plat.y + SLAB_H, bw, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(bx + 3, plat.y + SLAB_H + 2, bw - 3, 3);
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(bx,          plat.y, 4, SLAB_H);
        ctx.fillRect(bx + bw - 4, plat.y, 4, SLAB_H);

        // ── Janela (acima de plat.y) ──────────────────────────────
        const wy = plat.y - WIN_H;
        const fw = bw;

        ctx.fillStyle = '#6e6050';
        ctx.fillRect(bx, wy - 4, fw, WIN_H + 4);
        ctx.fillStyle = '#7a6e5c';
        ctx.fillRect(bx - 2, wy - 8, fw + 4, 6);
        ctx.fillStyle = '#8a7e6c';
        ctx.fillRect(bx - 2, wy - 8, fw + 4, 2);

        ctx.fillStyle = '#2e1608';
        ctx.fillRect(bx, wy, fw, WIN_H);

        // ── Variação determinística (seed = posição world da plataforma) ──
        const rngB  = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
        const ws    = plat.x * 0.013;
        const lit        = false; // todas escuras
        const hasCurtain = false;
        const openLeft   = false;

        const panelW = Math.floor((fw - 5) / 2);
        const leftX  = bx + 2;
        const rightX = bx + fw - 2 - panelW;
        const paneW  = Math.floor((panelW - 3) / 2);
        const paneH  = Math.floor((WIN_H - 7) / 2);

        for (let panel = 0; panel < 2; panel++) {
          const isLeft = panel === 0;
          // painel aberto desloca levemente para dentro
          const openShift = (isLeft && openLeft) ? 4 : 0;
          const px2 = (isLeft ? leftX : rightX) + openShift;

          // Moldura interna do painel
          ctx.fillStyle = '#3e2010';
          ctx.fillRect(px2, wy + 2, panelW, WIN_H - 4);

          if (lit) {
            // ── Interior quente ───────────────────────────────────────
            ctx.fillStyle = '#1e1608';
            ctx.fillRect(px2 + 1,         wy + 3,         paneW, paneH);
            ctx.fillRect(px2 + paneW + 2,  wy + 3,         paneW, paneH);
            ctx.fillRect(px2 + 1,         wy + paneH + 4,  paneW, paneH);
            ctx.fillRect(px2 + paneW + 2,  wy + paneH + 4, paneW, paneH);
            // Glow âmbar
            ctx.fillStyle = 'rgba(255,148,38,0.26)';
            ctx.fillRect(px2 + 1, wy + 3, panelW - 2, WIN_H - 6);
            // Glint topo
            ctx.fillStyle = 'rgba(255,230,160,0.18)';
            ctx.fillRect(px2 + 2, wy + 4, 4, 2);
            // Cortinas
            if (hasCurtain) {
              const cCol = rngB(ws + 4) > 0.5 ? '#6e2c1a' : '#2a3858'; // vermelha ou azul
              ctx.fillStyle = cCol;
              ctx.fillRect(px2 + 1,              wy + 3, 5, WIN_H - 6); // esquerda
              ctx.fillRect(px2 + panelW - 6, wy + 3, 5, WIN_H - 6); // direita
              // dobra da cortina
              ctx.fillStyle = 'rgba(0,0,0,0.20)';
              ctx.fillRect(px2 + 5,              wy + 3, 1, WIN_H - 6);
              ctx.fillRect(px2 + panelW - 7, wy + 3, 1, WIN_H - 6);
            }
            // Linha de separação do painel aberto
            if (isLeft && openLeft) {
              ctx.fillStyle = 'rgba(0,0,0,0.55)';
              ctx.fillRect(leftX, wy + 2, 2, WIN_H - 4);
            }
          } else {
            // ── Vidro frio / escuro ───────────────────────────────────
            ctx.fillStyle = '#08101a';
            ctx.fillRect(px2 + 1,         wy + 3,         paneW, paneH);
            ctx.fillRect(px2 + paneW + 2,  wy + 3,         paneW, paneH);
            ctx.fillRect(px2 + 1,         wy + paneH + 4,  paneW, paneH);
            ctx.fillRect(px2 + paneW + 2,  wy + paneH + 4, paneW, paneH);
            // Reflexo lunar frio (canto superior direito de cada vidro)
            ctx.fillStyle = 'rgba(140,200,240,0.14)';
            ctx.fillRect(px2 + paneW - 1,  wy + 4,         3, 2);
            ctx.fillRect(px2 + panelW - 3, wy + 4,         3, 2);
            // Brilho difuso azulado
            ctx.fillStyle = 'rgba(100,160,210,0.07)';
            ctx.fillRect(px2 + 1, wy + 3, panelW - 2, WIN_H - 6);
          }
        }

        ctx.fillStyle = '#2e1608';
        ctx.fillRect(bx + fw / 2 - 1, wy, 3, WIN_H);

        // Peitoril
        ctx.fillStyle = '#7a7060';
        ctx.fillRect(bx, plat.y - 4, bw, 4);
        ctx.fillStyle = '#a09280';
        ctx.fillRect(bx, plat.y - 4, bw, 1);

      } else {
        // ── Thin procedural ledge (roll-under obstacle) ──────────────
        ctx.fillStyle = '#4e4438';
        ctx.fillRect(slabX, plat.y + 4, slabW, plat.h - 4);
        ctx.fillStyle = '#6a5c50';
        ctx.fillRect(slabX, plat.y, slabW, 5);
        ctx.fillStyle = '#7e6e60';
        ctx.fillRect(slabX, plat.y, slabW, 2);
        ctx.fillStyle = '#4e4438';
        ctx.fillRect(slabX - 2, plat.y + 2, 3, plat.h - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(slabX, plat.y + plat.h, 8, 3);
        const railTop = plat.y - 10;
        ctx.fillStyle = '#121018';
        ctx.fillRect(slabX, railTop, slabW, 2);
        ctx.fillRect(slabX, plat.y - 2, slabW, 2);
        for (let px2 = slabX + 3; px2 < slabX + slabW - 2; px2 += 7) {
          ctx.fillRect(px2, railTop, 1, 10);
        }
      }
    }
    restorePlatformRotation();
  }
}

export function drawTireHideouts(
  ctx: CanvasRenderingContext2D,
  platforms: Platform[],
  camX: number,
  standingTireImg?: HTMLImageElement | null,
  destroyedTireIndices?: number[],
): void {
  for (let pi = 0; pi < platforms.length; pi++) {
    const plat = platforms[pi];
    if (plat.type !== 'tireHideout') continue;
    if (destroyedTireIndices?.includes(pi)) continue;
    const sx = plat.x - camX;
    if (sx + plat.w < -20 || sx > CANVAS_W + 20) continue;
    const rotationDeg = plat.rotation ?? 0;
    const hasRotation = Math.abs(rotationDeg) > 0.01;
    if (hasRotation) {
      ctx.save();
      ctx.translate(sx + plat.w / 2, plat.y + plat.h / 2);
      ctx.rotate(rotationDeg * Math.PI / 180);
      ctx.translate(-(sx + plat.w / 2), -(plat.y + plat.h / 2));
    }

    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.fillRect(sx + plat.w * 0.08, plat.y + plat.h - 8, plat.w * 0.84, 10);

    if (standingTireImg && standingTireImg.complete && standingTireImg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(standingTireImg, sx, plat.y, plat.w, plat.h);
      ctx.imageSmoothingEnabled = true;
      if (hasRotation) ctx.restore();
      continue;
    }

    ctx.fillStyle = '#101216';
    ctx.fillRect(sx, plat.y, plat.w, plat.h);
    ctx.fillStyle = '#2a2f38';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(sx + 4, plat.y + i * (plat.h / 4) + 3, plat.w - 8, plat.h / 4 - 6);
    }
    if (hasRotation) ctx.restore();
  }
}

// --- Player ---

function getSpriteKey(state: string): keyof typeof SPRITE_REGIONS {
  switch (state) {
    case 'run':     return 'run';
    case 'climb':   return 'run';
    case 'wallrun': return 'run';  // usa run sprite girado lateralmente
    case 'wallflip': return 'jump';
    case 'wallclimb': return 'jump';
    case 'jump':    return 'jump';
    case 'fall':    return 'jump';
    case 'roll':    return 'jump';
    case 'hurt':    return 'jump';
    case 'dead':    return 'jump';
    default:        return 'idle';
  }
}

// The jump sprite in the source faces LEFT, so it needs to be flipped
// when the player faces RIGHT (opposite of the run sprite logic)
const SPRITE_NATURAL_FACING_LEFT: Partial<Record<keyof typeof SPRITE_REGIONS, boolean>> = {
  jump: true, // sprite in image is facing left — flip when facingRight
};

// Jump animation sheet: 851×300px, 2 frames side by side (1px black separator at center)
// Frame 0 (left):  character going up   — sx=0,   w=425
// Frame 1 (right): character falling    — sx=426,  w=425
const JUMP_SHEET = {
  frameCount: 2,
  frameW: 425,          // each frame width (skip 1px separator)
  frameH: 300,
  displayH: JUMP_DISPLAY_H,
  get displayW() { return Math.round(this.displayH * (this.frameW / this.frameH)); },
  // source X for each frame (manually offsets to skip the separator between frames)
  frameSrcX: [0, 426] as const,
};

// Roll spritesheet: 851×300, 4 frames side by side
const ROLL_SHEET = {
  frameCount: 4,
  frameW: Math.round(851 / 4),  // ~213px per frame
  frameH: 300,
  displayH: 175,                 // display height — compact/crouched
  get displayW() { return Math.round(this.displayH * (this.frameW / this.frameH)); },
};

const DIVE_SHEET = {
  frameCount: 3,
  frameW: DIVE_FRAME_W,
  frameH: DIVE_FRAME_H,
  displayH: DIVE_DISPLAY_H,
  get displayW() { return Math.round(this.displayH * (this.frameW / this.frameH)); },
  frameSrcX: [0, DIVE_FRAME_W, DIVE_FRAME_W * 2] as const,
};

const WALL_RUN_SHEET = {
  frameCount: 4,
  displayH: 175,
  offsetX: -32,
};

const WALL_FLIP_SHEET = {
  frameCount: 5,
  displayH: 180,
  offsetY: 18,
};

const WALL_CLIMB_SHEET = {
  frameCount: 4,
  displayH: 185,
  displayHHang: 210,
  firstFrameOffsetX: -38,
  offsetY: 24,
};

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  spriteImg: HTMLImageElement | null,
  runSheetImg: HTMLImageElement | null,
  idleImg: HTMLImageElement | null,
  rollSheetImg: HTMLImageElement | null = null,
  jumpSheetImg: HTMLImageElement | null = null,
  diveSheetImg: HTMLImageElement | null = null,
  wallRunSheetImg: HTMLImageElement | null = null,
  mortalSheetImg: HTMLImageElement | null = null,
  subidaSheetImg: HTMLImageElement | null = null,
  sideFlipSheetImg: HTMLImageElement | null = null,
  ladderClimbImg: HTMLImageElement | null = null,
  ladderDescendImg: HTMLImageElement | null = null,
): void {
  const p = gs.player;
  const px = p.x - gs.camera.x;
  const py = p.y;
  const ph = p.isRolling ? PLAYER_ROLL_H : PLAYER_H;

  // Ladder climb / descend
  if (p.state === 'climb' && p.touchingLadder) {
    const goingDown = p.vy > 0.1;
    const sprite = goingDown ? ladderDescendImg : ladderClimbImg;
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const iw = sprite.naturalWidth;
      const ih = sprite.naturalHeight;
      const dh = PLAYER_H + 92;
      const dw = Math.round(dh * (iw / ih));
      const anchorX = px + p.w / 2;
      const destX = anchorX - dw / 2;
      const destY = py + ph - dh;
      // Espelha apenas a subida — descida usa só o sprite frontal
      const mirror = !goingDown && Math.floor(Math.abs(p.y) / 28) % 2 === 1;
      ctx.save();
      if (mirror) {
        ctx.translate(anchorX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-anchorX, 0);
      }
      ctx.drawImage(sprite, 0, 0, iw, ih, destX, destY, dw, dh);
      ctx.restore();
      return;
    }
  }

  // Blink when invincible
  if (p.invincible && Math.floor(gs.time / 80) % 2 === 0) return;

  // Side flip animation
  if (p.isSideFlipping && sideFlipSheetImg && sideFlipSheetImg.complete && sideFlipSheetImg.naturalWidth > 0) {
    const FRAME_COUNT = 5;
    const frameW = Math.floor(sideFlipSheetImg.naturalWidth / FRAME_COUNT);
    const frameH = sideFlipSheetImg.naturalHeight;
    const progress = Math.max(0, Math.min(1, 1 - p.sideFlipTimer / 640));
    const frame = Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
    // Inset 1px on each side to avoid sub-pixel bleeding between adjacent frames
    const srcX = frame * frameW + 1;
    const srcW = frameW - 2;
    const displayH = 200;
    const displayW = Math.round(displayH * (srcW / frameH));
    const anchorX = px + p.w / 2;
    const anchorY = py + PLAYER_H / 2 - 8;
    const destX = anchorX - displayW / 2;
    const destY = anchorY - displayH / 2;

    if (progress < 0.9) {
      ctx.save();
      if (!p.facingRight) {
        ctx.translate(anchorX, 0);
        ctx.scale(-1, 1);
        ctx.translate(-anchorX, 0);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'brightness(1.7) saturate(1.9) hue-rotate(190deg) blur(1px)';
      for (let i = 0; i < 3; i++) {
        const fade = 1 - progress;
        const offset = (i + 1) * 13;
        const scale = 1 + i * 0.035;
        const rw = displayW * scale;
        const rh = displayH * scale;
        ctx.globalAlpha = fade * (0.18 - i * 0.045);
        ctx.drawImage(
          sideFlipSheetImg,
          srcX, 0, srcW, frameH,
          destX - offset - (rw - displayW) / 2,
          destY - (rh - displayH) / 2,
          rw,
          rh,
        );
      }
      ctx.restore();
    }

    ctx.save();
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    // Clip to destination rect before drawing to prevent any bleed
    ctx.beginPath();
    ctx.rect(destX, destY, displayW, displayH);
    ctx.clip();
    ctx.drawImage(
      sideFlipSheetImg,
      srcX, 0, srcW, frameH,
      destX, destY, displayW, displayH,
    );
    ctx.restore();
    return;
  }

  if (p.state === 'wallclimb' && subidaSheetImg && subidaSheetImg.complete && subidaSheetImg.naturalWidth > 0) {
    const frameW = subidaSheetImg.naturalWidth / WALL_CLIMB_SHEET.frameCount;
    const frameH = subidaSheetImg.naturalHeight;
    const frame = p.isWallHanging ? WALL_CLIMB_SHEET.frameCount - 2 : 0;
    const frameScale = frame === 0 ? 1.05 : frame === 1 ? 0.90 : 1;
    const baseDh = p.isWallHanging ? WALL_CLIMB_SHEET.displayHHang : WALL_CLIMB_SHEET.displayH;
    const dh = baseDh * frameScale;
    const dw = Math.round(dh * (frameW / frameH));
    const anchorX = px + p.w / 2;
    const anchorY = py + ph + WALL_CLIMB_SHEET.offsetY;
    const firstFrameWallOffset = frame === 0 ? WALL_CLIMB_SHEET.firstFrameOffsetX : 0;
    const wallSideNudge = p.isWallHanging ? 14 : 0;
    const destX = anchorX - dw / 2 + firstFrameWallOffset + wallSideNudge;
    const rawDestY = anchorY - dh;
    // Frame 0: sprite rises with the player but top is clamped at wall top — appears whole, never exceeds ledge
    const destY = (frame === 0 && !p.isWallHanging)
      ? Math.max(p.wallTopY, rawDestY)
      : rawDestY;

    ctx.save();
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      subidaSheetImg,
      frame * frameW, 0, frameW, frameH,
      destX, destY, dw, dh,
    );
    ctx.restore();
    return;
  }

  if (p.state === 'wallflip' && mortalSheetImg && mortalSheetImg.complete && mortalSheetImg.naturalWidth > 0) {
    const frameW = mortalSheetImg.naturalWidth / WALL_FLIP_SHEET.frameCount;
    const frameH = mortalSheetImg.naturalHeight;
    const progress = Math.max(0, Math.min(1, 1 - p.wallFlipTimer / WALLFLIP_DURATION));
    const frame = Math.min(WALL_FLIP_SHEET.frameCount - 1, Math.floor(progress * WALL_FLIP_SHEET.frameCount));
    const dh = WALL_FLIP_SHEET.displayH;
    const dw = Math.round(dh * (frameW / frameH));
    const anchorX = px + p.w / 2;
    const anchorY = py + ph + WALL_FLIP_SHEET.offsetY;
    const destX = anchorX - dw / 2;
    const destY = anchorY - dh;

    ctx.save();
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      mortalSheetImg,
      frame * frameW, 0, frameW, frameH,
      destX, destY, dw, dh,
    );
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,120,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const lx = px + (p.vx < 0 ? p.w + 10 + i * 8 : -10 - i * 8);
      const ly = py + PLAYER_H * 0.45 + i * 5;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + (p.vx < 0 ? 8 : -8), ly - 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const RENDER_MAX_BOX_CLIMB_HEIGHT = 220;
  // Usa jumpOriginGroundY — mesma referência do physics.ts para evitar falsos positivos durante o pulo
  const isSlipperyBoxContact = p.touchingWall && p.wallRunOnBox && (p.jumpOriginGroundY - p.wallTopY) > RENDER_MAX_BOX_CLIMB_HEIGHT && !p.onGround && !p.isWallRunning;
  if (isSlipperyBoxContact && subidaSheetImg && subidaSheetImg.complete && subidaSheetImg.naturalWidth > 0) {
    const frameW = subidaSheetImg.naturalWidth / WALL_CLIMB_SHEET.frameCount;
    const frameH = subidaSheetImg.naturalHeight;
    const dh = WALL_CLIMB_SHEET.displayH * 1.05;
    const dw = Math.round(dh * (frameW / frameH));
    const anchorX = px + p.w / 2;
    const anchorY = py + ph + WALL_CLIMB_SHEET.offsetY;
    const destX = anchorX - dw / 2 + WALL_CLIMB_SHEET.firstFrameOffsetX;
    const rawDestY = anchorY - dh;
    const destY = Math.max(p.wallTopY, rawDestY);
    ctx.save();
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(subidaSheetImg, 0, 0, frameW, frameH, destX, destY, dw, dh);
    ctx.restore();
    return;
  }

  const isWallRunVisual = p.isWallRunning || p.state === 'wallrun';
  if (isWallRunVisual) {
    if (!wallRunSheetImg || !wallRunSheetImg.complete || wallRunSheetImg.naturalWidth <= 0) return;

    const frameW = wallRunSheetImg.naturalWidth / WALL_RUN_SHEET.frameCount;
    const frameH = wallRunSheetImg.naturalHeight;
    const frame = p.animFrame % WALL_RUN_SHEET.frameCount;
    const dh = WALL_RUN_SHEET.displayH;
    const dw = Math.round(dh * (frameW / frameH));
    const anchorX = px + p.w / 2;
    const anchorY = py + ph + 22;
    const destX = anchorX - dw / 2 + WALL_RUN_SHEET.offsetX;
    const destY = anchorY - dh;

    ctx.save();
    const shouldFlip = p.wallSide === 'left';
    if (shouldFlip) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      wallRunSheetImg,
      frame * frameW, 0, frameW, frameH,
      destX, destY, dw, dh,
    );
    ctx.restore();
    return;
  }

  // Dive jump animation
  if (p.state === 'divejump' && diveSheetImg && diveSheetImg.complete && diveSheetImg.naturalWidth > 0) {
    // Frame selection based on vertical velocity
    let frame = 0;
    if (p.vy < -4) {
      frame = 0; // launching up
    } else if (p.vy <= 2) {
      frame = 1; // near apex, flat horizontal
    } else {
      frame = 2; // diving down
    }
    const dh = DIVE_SHEET.displayH;
    const dw = DIVE_SHEET.displayW;
    const anchorX = px + p.w / 2;
    const anchorY = py + PLAYER_H / 2 - 30;
    const destX = anchorX - dw / 2;
    const destY = anchorY - dh / 2;

    ctx.save();
    // Flip for left-facing (sprite faces right naturally)
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      diveSheetImg,
      DIVE_SHEET.frameSrcX[frame], 0, DIVE_SHEET.frameW, DIVE_SHEET.frameH,
      destX, destY, dw, dh,
    );
    ctx.restore();

    // Speed trail lines
    ctx.strokeStyle = 'rgba(200,200,255,0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const lx = px + (p.facingRight ? -8 - i * 10 : p.w + 8 + i * 10);
      const trailY = py + PLAYER_H / 2 - 30 - 4 + i * 3;
      ctx.beginPath();
      ctx.moveTo(lx, trailY);
      ctx.lineTo(lx + (p.facingRight ? 6 : -6), trailY);
      ctx.stroke();
    }
    return;
  }

  // Same-level landing/manual crouch — frame 0 of roll sheet, no roll
  if (!p.autoRoll && (p.landingCrouch || p.isCrouching) && rollSheetImg && rollSheetImg.complete && rollSheetImg.naturalWidth > 0) {
    const dh = ROLL_SHEET.displayH;
    const dw = ROLL_SHEET.displayW;
    // Anchor to same ground position as frame 0 of the roll sequence
    const anchorX = px + p.w / 2;
    const anchorY = py + PLAYER_H + 60; // slightly above ground to prevent sinking
    const destX = anchorX - dw / 2;
    const destY = anchorY - dh;
    ctx.save();
    ctx.filter = 'saturate(0.35) brightness(1.05)';
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      rollSheetImg,
      0, 0, ROLL_SHEET.frameW, ROLL_SHEET.frameH,  // frame 0
      destX, destY, dw, dh,
    );
    ctx.restore();
    return;
  }

  // Auto landing roll — sprite sheet
  if (p.autoRoll && p.isRolling && rollSheetImg && rollSheetImg.complete && rollSheetImg.naturalWidth > 0) {
    const rollProgress = Math.max(0, Math.min(1, 1 - p.rollTimer / 300));
    const frame = Math.min(ROLL_SHEET.frameCount - 1, Math.floor(rollProgress * ROLL_SHEET.frameCount));
    const dh = ROLL_SHEET.displayH;
    const dw = ROLL_SHEET.displayW;
    // Anchor: bottom-center at collision box bottom
    const anchorX = px + p.w / 2;
    const anchorY = py + PLAYER_ROLL_H + 55; // push down so feet stick to the ground
    // Frame 0 has the character sitting higher in the image — push it down to match the other frames
    const frameDropY = frame === 0 ? 20 : 0;
    const destX = anchorX - dw / 2;
    const destY = anchorY - dh + frameDropY;

    ctx.save();
    ctx.filter = 'saturate(0.35) brightness(1.05)';
    // Flip for left-facing
    if (!p.facingRight) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }
    ctx.drawImage(
      rollSheetImg,
      frame * ROLL_SHEET.frameW, 0, ROLL_SHEET.frameW, ROLL_SHEET.frameH,
      destX, destY, dw, dh,
    );
    ctx.restore();

    // Impact ring on first frame
    if (rollProgress < 0.25) {
      const ringAlpha = (0.25 - rollProgress) / 0.25;
      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.5;
      ctx.strokeStyle = '#9080c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(anchorX, anchorY, 22 + rollProgress * 30, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
    const key = getSpriteKey(p.state);
    const isRunAnim = (p.state === 'run' || p.state === 'climb' || p.state === 'wallrun') &&
                      runSheetImg && runSheetImg.complete && runSheetImg.naturalWidth > 0;
    const isIdleAnim = p.state === 'idle' &&
                       idleImg && idleImg.complete && idleImg.naturalWidth > 0;
    const isJumpAnim = (p.state === 'jump' || p.state === 'fall' || p.state === 'hurt' || p.state === 'dead') &&
                       jumpSheetImg && jumpSheetImg.complete && jumpSheetImg.naturalWidth > 0;

    const FOOT_OFFSET = 28;

    // ── Choose dimensions based on sprite source ──────────────────────────
    let dh: number;
    if (p.isRolling) {
      dh = SPRITE_DISPLAY_H * 0.55;
    } else if (isRunAnim) {
      dh = RUN_DISPLAY_H;
    } else if (isIdleAnim) {
      dh = SPRITE_DISPLAY_H;
    } else if (isJumpAnim) {
      dh = JUMP_SHEET.displayH;
    } else {
      dh = JUMP_DISPLAY_H;
    }
    const dw = isRunAnim
      ? RUN_SHEET.displayW
      : isIdleAnim
        ? IDLE_SPRITE.displayW
        : isJumpAnim
          ? JUMP_SHEET.displayW
          : (SPRITE_DISPLAY_W[key] ?? 32);

    // ── Anchor: bottom-center aligned to collision box ────────────────────
    const anchorX = px + p.w / 2;
    const anchorY = py + ph + FOOT_OFFSET - 2;

    // ── Bob/lean for non-run states ───────────────────────────────────────
    let leanRad = 0;
    let scaleX  = 1;
    let scaleY  = 1;

    if (p.state === 'jump') {
      leanRad = (p.facingRight ? -1 : 1) * 0.08;
      scaleY = 1.04; scaleX = 0.97;
    } else if (p.state === 'fall') {
      leanRad = (p.facingRight ? 1 : -1) * 0.06;
      scaleY = 0.97; scaleX = 1.03;
    }

    const destX = anchorX - dw / 2;
    const destY = anchorY - dh;

    ctx.save();

    if (leanRad !== 0) {
      ctx.translate(anchorX, anchorY);
      ctx.rotate(leanRad);
      ctx.translate(-anchorX, -anchorY);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      ctx.translate(anchorX, anchorY);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-anchorX, -anchorY);
    }

    // ── Horizontal flip ───────────────────────────────────────────────────
    // Run sheet: faces RIGHT naturally; idle sprite: faces RIGHT naturally
    // jump sheet: faces RIGHT naturally; old static jump region: faces LEFT
    const naturallyFacingLeft = isRunAnim || isIdleAnim || isJumpAnim ? false : (SPRITE_NATURAL_FACING_LEFT[key] ?? false);
    const isStaticFacing = key === 'idle' && !isIdleAnim; // old frontal idle — don't flip
    const shouldFlip = !isStaticFacing && (naturallyFacingLeft ? p.facingRight : !p.facingRight);

    if (shouldFlip) {
      ctx.translate(anchorX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-anchorX, 0);
    }

    if (p.state === 'hurt') ctx.globalAlpha = 0.85;

    // ── Draw: run sheet, idle sprite, jump sheet, or fallback static sprite ──
    if (isRunAnim) {
      const frame = p.animFrame % RUN_SHEET.frameCount;
      const sx = frame * RUN_SHEET.frameW;
      ctx.drawImage(
        runSheetImg!,
        sx, 0, RUN_SHEET.frameW, RUN_SHEET.frameH,
        destX, destY, dw, dh,
      );
    } else if (isJumpAnim) {
      // Frame 0 = going up (vy < 0), Frame 1 = falling (vy >= 0)
      const frame = p.vy < 0 ? 0 : 1;
      ctx.drawImage(
        jumpSheetImg!,
        JUMP_SHEET.frameSrcX[frame], 0, JUMP_SHEET.frameW, JUMP_SHEET.frameH,
        destX, destY, dw, dh,
      );
    } else if (isIdleAnim) {
      // Breathing animation — only upper body (torso + head) moves.
      // Legs stay anchored. We draw in two passes:
      //  1. Full sprite at static position (establishes the legs)
      //  2. Overdraw the top portion scaled upward from the waist
      const breathCycle  = Date.now() * 0.0018;
      const breathScale  = 1 + Math.sin(breathCycle) * 0.022; // ±2.2% upper-body scale
      const waistRatio   = 0.54; // waist sits ~54% down from top of sprite
      const waistY       = destY + dh * waistRatio;

      // Pass 1: full sprite — gives us static legs
      ctx.drawImage(
        idleImg!,
        0, 0, IDLE_SPRITE.w, IDLE_SPRITE.h,
        destX, destY, dw, dh,
      );

      // Pass 2: upper body only, scaled to grow/shrink from waist upward
      const topSrcH  = Math.round(IDLE_SPRITE.h * waistRatio);
      const topDestH = dh * waistRatio * breathScale;
      const topDestY = waistY - topDestH; // anchor bottom at waist

      ctx.save();
      ctx.beginPath();
      ctx.rect(destX - 4, topDestY - 2, dw + 8, topDestH + 4);
      ctx.clip();
      ctx.drawImage(
        idleImg!,
        0, 0, IDLE_SPRITE.w, topSrcH,     // source: top portion only
        destX, topDestY, dw, topDestH,    // dest: scaled from waist up
      );
      ctx.restore();
    } else {
      const reg = SPRITE_REGIONS[key];
      ctx.drawImage(
        spriteImg,
        reg.sx, reg.sy, reg.sw, reg.sh,
        destX, destY, dw, dh,
      );
    }

    if (p.state === 'hurt') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(220,50,50,0.45)';
      ctx.fillRect(destX, destY, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Roll motion lines ─────────────────────────────────────────────────
    if (p.isRolling) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const lx = px + (p.facingRight ? -10 - i * 9 : p.w + 10 + i * 9);
        ctx.beginPath();
        ctx.moveTo(lx, py + ph / 2 + i * 3 - 4);
        ctx.lineTo(lx + (p.facingRight ? 5 : -5), py + ph / 2 + i * 3 - 4);
        ctx.stroke();
      }
    }

    // ── Run dust puff at foot ─────────────────────────────────────────────
    if (p.state === 'run' && p.onGround && p.animFrame % 4 === 0) {
      ctx.fillStyle = 'rgba(80,75,100,0.18)';
      ctx.beginPath();
      ctx.ellipse(anchorX, anchorY - 2, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

  } else {
    // Fallback: simple rectangle while sprite loads
    ctx.fillStyle = p.invincible ? '#aa4444' : COLORS.playerHoodie;
    ctx.fillRect(px, py, p.w, ph);
    ctx.fillStyle = COLORS.playerSkin;
    ctx.fillRect(px + 6, py + 2, 14, 12);
  }
}

// --- Drone ---

export function drawDrone(
  ctx: CanvasRenderingContext2D,
  gs: GameState
): void {
  const d = gs.drone;
  const sx = d.x - gs.camera.x;
  const sy = d.y;

  ctx.save();
  ctx.translate(sx + DRONE_W / 2, sy + DRONE_H / 2);
  ctx.rotate(d.wobble);

  // Searchlight beam (subtle)
  const beamTarget = gs.player;
  const bdx = (beamTarget.x - gs.camera.x + PLAYER_W / 2) - (sx + DRONE_W / 2);
  const bdy = (beamTarget.y + PLAYER_H / 2) - (sy + DRONE_H / 2);
  const bAngle = Math.atan2(bdy, bdx);
  const beamLen = Math.sqrt(bdx * bdx + bdy * bdy);
  const beamGrad = ctx.createLinearGradient(0, 0, Math.cos(bAngle) * beamLen, Math.sin(bAngle) * beamLen);
  beamGrad.addColorStop(0, COLORS.droneBeam);
  beamGrad.addColorStop(1, 'rgba(255,60,60,0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const beamW = 0.15;
  ctx.lineTo(
    Math.cos(bAngle - beamW) * beamLen,
    Math.sin(bAngle - beamW) * beamLen
  );
  ctx.lineTo(
    Math.cos(bAngle + beamW) * beamLen,
    Math.sin(bAngle + beamW) * beamLen
  );
  ctx.closePath();
  ctx.fill();

  // Propeller arms
  ctx.strokeStyle = COLORS.droneAccent;
  ctx.lineWidth = 3;
  const armPositions = [
    [-22, -10], [22, -10], [-22, 10], [22, 10],
  ];
  for (const [ax, ay] of armPositions) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    // Spinning propeller
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(d.propAngle);
    ctx.strokeStyle = COLORS.droneProp;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
    ctx.restore();
  }

  // Body
  ctx.fillStyle = COLORS.droneBody;
  ctx.fillRect(-18, -10, 36, 20);
  // Body highlight
  ctx.fillStyle = COLORS.droneBodyLight;
  ctx.fillRect(-16, -9, 32, 4);
  // Body accent stripe
  ctx.fillStyle = COLORS.droneAccent;
  ctx.fillRect(-18, 2, 36, 3);

  // Eye / camera
  const eyeGrd = ctx.createRadialGradient(10, 0, 0, 10, 0, 8);
  eyeGrd.addColorStop(0, '#ff6666');
  eyeGrd.addColorStop(0.5, COLORS.droneEye);
  eyeGrd.addColorStop(1, '#880000');
  ctx.fillStyle = eyeGrd;
  ctx.beginPath();
  ctx.arc(10, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  // Eye glow
  const glowGrd = ctx.createRadialGradient(10, 0, 0, 10, 0, 16);
  glowGrd.addColorStop(0, COLORS.droneEyeGlow);
  glowGrd.addColorStop(1, 'rgba(255,50,50,0)');
  ctx.fillStyle = glowGrd;
  ctx.beginPath();
  ctx.arc(10, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = '#220000';
  ctx.beginPath();
  ctx.arc(10, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  // Barrel / gun
  ctx.fillStyle = '#2a2a35';
  ctx.fillRect(16, -3, 14, 6);
  ctx.fillStyle = '#1a1a25';
  ctx.fillRect(28, -2, 5, 4);

  // Blinking status light
  if (Math.floor(Date.now() / 400) % 2 === 0) {
    ctx.fillStyle = 'rgba(0, 255, 100, 0.9)';
    ctx.beginPath();
    ctx.arc(-12, -5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// --- Bullets ---

export function drawBullets(
  ctx: CanvasRenderingContext2D,
  gs: GameState
): void {
  for (const b of gs.bullets) {
    const sx = b.x - gs.camera.x;
    const sy = b.y;

    // Trail
    ctx.strokeStyle = COLORS.bulletTrail;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - b.vx * 4, sy - b.vy * 4);
    ctx.stroke();

    // Glow
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
    grd.addColorStop(0, COLORS.bulletGlow);
    grd.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc88';
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Dogs ---

const DOG_RUN_FRAME_INTERVAL = 170; // ms per run frame

export function drawDogs(
  ctx: CanvasRenderingContext2D,
  dogs: Dog[],
  camX: number,
  dogSheet: HTMLImageElement | null,
  dogIdle: HTMLImageElement | null
): void {
  if (!dogSheet || !dogSheet.complete || dogSheet.naturalWidth === 0) return;

  const imgW = dogSheet.naturalWidth;
  const imgH = dogSheet.naturalHeight;

  // The sprite sheet has 3 frames side by side, with label text at the bottom.
  // Asymmetric inset removes bleed from the previous frame on the left side.
  const rawFrameW = Math.floor(imgW / 3);
  const leftInset = 18;
  const frameW = rawFrameW - leftInset;
  const srcH = Math.floor(imgH * 0.78);

  const displayH = 100;
  const displayW = Math.round(displayH * (frameW / srcH));

  for (const dog of dogs) {
    const screenX = dog.x - camX;
    const screenY = GROUND_Y - displayH;

    ctx.save();

    if (dog.animState === 'idle' && dogIdle && dogIdle.complete && dogIdle.naturalWidth > 0) {
      // Standalone idle image — faces RIGHT by default
      const idleSrcW = dogIdle.naturalWidth;
      const idleSrcH = dogIdle.naturalHeight;
      const idleDisplayW = Math.round(displayH * (idleSrcW / idleSrcH));
      // Push idle sprite down so paws touch the ground
      const idleScreenY = GROUND_Y - displayH + 24;

      if (!dog.facingRight) {
        ctx.translate(screenX + idleDisplayW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(dogIdle, 0, 0, idleSrcW, idleSrcH, 0, idleScreenY, idleDisplayW, displayH);
      } else {
        ctx.drawImage(dogIdle, 0, 0, idleSrcW, idleSrcH, screenX, idleScreenY, idleDisplayW, displayH);
      }
    } else {
      // Spritesheet frames (run + bite) — faces RIGHT by default
      const runDisplayH = 116;
      const runDisplayW = Math.round(runDisplayH * (frameW / srcH));
      const runScreenY = GROUND_Y - runDisplayH + 10;

      let frameIdx = 0;
      if (dog.animState === 'bite') {
        frameIdx = 2;
      } else {
        const runFrame = Math.floor(dog.animTimer / DOG_RUN_FRAME_INTERVAL) % 2;
        frameIdx = runFrame;
      }

      const sx = frameIdx * rawFrameW + leftInset;

      if (!dog.facingRight) {
        ctx.translate(screenX + runDisplayW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(dogSheet, sx, 0, frameW, srcH, 0, runScreenY, runDisplayW, runDisplayH);
      } else {
        ctx.drawImage(dogSheet, sx, 0, frameW, srcH, screenX, runScreenY, runDisplayW, runDisplayH);
      }
    }

    ctx.restore();
  }
}

// --- Bystanders (NPCs sentados que fogem ao ver o Horácio com drone) ---

const BYSTANDER_RUN_FRAME_INTERVAL = 140; // ms por frame

export function drawBystanders(
  ctx: CanvasRenderingContext2D,
  bystanders: Bystander[],
  camX: number,
  sheet1: HTMLImageElement | null,
  sheet2: HTMLImageElement | null,
  sheet3: HTMLImageElement | null,
  sheet4: HTMLImageElement | null,
  npcHitSheet: HTMLImageElement | null
): void {
  for (const b of bystanders) {
    const sheet = b.spriteId === 1 ? sheet1
                : b.spriteId === 2 ? sheet2
                : b.spriteId === 3 ? sheet3
                : sheet4;
    if (!sheet || !sheet.complete || sheet.naturalWidth === 0) continue;

    const screenX = b.x - camX;
    if (screenX < -200 || screenX > CANVAS_W + 200) continue;

    const imgW = sheet.naturalWidth;
    const imgH = sheet.naturalHeight;
    const frameW = Math.floor(imgW / 3);   // 3 frames lado a lado
    const frameH = imgH;

    // Sprites 1+2: 851x315px, 3 frames (frameW=283, frameH=315).
    // Sprite 1 (marrom): caixa sit ocupa ~88% do frame → offset 47.
    // Sprite 2 (verde): caixa sit ligeiramente acima do fundo → offset 36.
    // Sprites 3+4 (senhor/mulher): sem pose sentado — offset fixo 26 em todos os estados.
    const isNewSprite = b.spriteId === 3 || b.spriteId === 4;
    const isSit = b.state === 'sit' || b.state === 'dead';

    // Escolhe frame conforme sprite:
    // Sprites 1+2: 0=sentado, 1+2 alternam na corrida
    // Sprites 3+4: 0+1 alternam na corrida, 2=impacto (somente no estado morto)
    let frameIdx = 0;
    if (b.state === 'flee') {
      if (isNewSprite) {
        frameIdx = Math.floor(b.animTimer / BYSTANDER_RUN_FRAME_INTERVAL) % 2; // 0 ou 1
      } else {
        frameIdx = 1 + (Math.floor(b.animTimer / BYSTANDER_RUN_FRAME_INTERVAL) % 2); // 1 ou 2
      }
    }
    const displayH = isNewSprite ? 158 : (isSit ? 175 : 166); // sprites 3+4 são 5% menores
    const NPC_FOOT_OFFSET = isNewSprite ? 26 : (isSit ? (b.spriteId === 1 ? 47 : 36) : 26);
    const displayW = Math.round(displayH * (frameW / frameH));
    const screenY = GROUND_Y + NPC_FOOT_OFFSET - displayH;

    // --- Estado morto ---
    if (b.state === 'dead') {
      const DEAD_DURATION = 1400;
      const t = Math.max(0, b.deadTimer / DEAD_DURATION); // 1→0
      const alpha = t < 0.3 ? t / 0.3 : 1;              // fade out último 30%

      // Sprite de impacto (npc-hit.png): voa para trás sem rotação
      if (b.useHitSprite && npcHitSheet && npcHitSheet.complete && npcHitSheet.naturalWidth > 0) {
        const hitH = isNewSprite ? 158 : 166; // mesmo tamanho do NPC em corrida
        const hitW = Math.round(hitH * (npcHitSheet.naturalWidth / npcHitSheet.naturalHeight));
        // Offset vertical: simula o NPC sendo jogado levemente para cima
        const riseOffset = (1 - t) * 18;
        const drawX = screenX + displayW / 2 - hitW / 2;
        const drawY = screenY + displayH - hitH - riseOffset;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (!b.facingRight) {
          ctx.translate(drawX + hitW, drawY);
          ctx.scale(-1, 1);
          ctx.drawImage(npcHitSheet, 0, 0, hitW, hitH);
        } else {
          ctx.drawImage(npcHitSheet, drawX, drawY, hitW, hitH);
        }
        ctx.restore();
        continue;
      }

      // Animação padrão: colapsa no chão com tint vermelho
      const angle = (1 - t) * (Math.PI / 2);             // roda até 90° deitado
      const footX = screenX + displayW / 2;
      const footY = screenY + displayH;
      const dFrame = b.deathFrame ?? 0;                  // frame de morte configurável
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(footX, footY);
      ctx.rotate(b.facingRight ? angle : -angle);
      ctx.drawImage(sheet, dFrame * frameW, 0, frameW, frameH, -displayW / 2, -displayH, displayW, displayH);
      // overlay vermelho sangue
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(180, 0, 0, ${0.55 * t < 0.01 ? 0.55 : 0.55 * Math.min(1, (1 - t) * 6)})`;
      ctx.fillRect(-displayW / 2, -displayH, displayW, displayH);
      ctx.restore();
      continue;
    }

    ctx.save();
    if (!b.facingRight) {
      ctx.translate(screenX + displayW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, frameIdx * frameW, 0, frameW, frameH, 0, screenY, displayW, displayH);
    } else {
      ctx.drawImage(sheet, frameIdx * frameW, 0, frameW, frameH, screenX, screenY, displayW, displayH);
    }
    ctx.restore();
  }
}

// --- Particles ---

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  gs: GameState
): void {
  for (const p of gs.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - gs.camera.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- HUD ---

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  gs: GameState
): void {
  const p = gs.player;
  const score = Math.floor(p.distanceTraveled / 10);

  // Panel background
  ctx.fillStyle = COLORS.uiPanel;
  ctx.fillRect(10, 10, 240, 50);
  ctx.strokeStyle = 'rgba(80,75,110,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 240, 50);

  // Health
  ctx.fillStyle = COLORS.uiText;
  ctx.font = '11px monospace';
  ctx.fillText('HP', 20, 28);

  for (let i = 0; i < p.maxHealth; i++) {
    ctx.fillStyle = i < p.health ? COLORS.healthFull : COLORS.healthEmpty;
    ctx.fillRect(40 + i * 22, 16, 16, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40 + i * 22, 16, 16, 14);
  }

  // Score + world X (for level editing reference)
  ctx.fillStyle = COLORS.uiTextBright;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`DIST: ${score}m  X:${Math.floor(p.x)}`, 20, 52);

  // Distance progress bar
  ctx.fillStyle = 'rgba(40,35,60,0.8)';
  ctx.fillRect(CANVAS_W - 210, 10, 200, 20);
  ctx.fillStyle = 'rgba(0,180,255,0.5)';
  const progress = Math.min(p.distanceTraveled / 100000, 1);
  ctx.fillRect(CANVAS_W - 210, 10, 200 * progress, 20);
  ctx.strokeStyle = 'rgba(0,200,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(CANVAS_W - 210, 10, 200, 20);
  ctx.fillStyle = COLORS.uiText;
  ctx.font = '10px monospace';
  ctx.fillText('RUN', CANVAS_W - 207, 24);

  // Time
  const secs = Math.floor(gs.time / 1000);
  ctx.fillStyle = COLORS.uiPanel;
  ctx.fillRect(CANVAS_W / 2 - 50, 10, 100, 28);
  ctx.strokeStyle = 'rgba(80,75,110,0.8)';
  ctx.strokeRect(CANVAS_W / 2 - 50, 10, 100, 28);
  ctx.fillStyle = COLORS.uiTextBright;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`, CANVAS_W / 2, 29);
  ctx.textAlign = 'left';

  if (gs.gameMode === 'wall-test') {
    ctx.fillStyle = 'rgba(0,200,255,0.82)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ÁREA DE TESTE: PULE NA SUBIDA PARA CORRER NA PAREDE', CANVAS_W / 2, CANVAS_H - 20);
    ctx.textAlign = 'left';
  }

  // Drone warning (when close)
  if (gs.gameMode !== 'wall-test' && gs.drone && gs.player.x - gs.drone.x < 350) {
    const alpha = 0.4 + Math.sin(Date.now() * 0.008) * 0.3;
    ctx.fillStyle = `rgba(255,40,40,${alpha})`;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('! DRONE PRÓXIMO !', CANVAS_W / 2, CANVAS_H - 20);
    ctx.textAlign = 'left';
  }
}

export function drawControls(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(14,12,24,0.7)';
  ctx.fillRect(10, CANVAS_H - 70, 340, 60);
  ctx.strokeStyle = 'rgba(80,75,100,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, CANVAS_H - 70, 340, 60);
  ctx.fillStyle = COLORS.uiText;
  ctx.font = '10px monospace';
  ctx.fillText('←→ CORRER  |  ESPAÇO/↑ PULAR  |  PULO SUBINDO + PAREDE = CORRIDA NA PAREDE', 18, CANVAS_H - 52);
  ctx.fillText('SHIFT/Z ROLAR  |  ↓+ESPAÇO (correndo) MERGULHO', 18, CANVAS_H - 37);
  ctx.fillStyle = 'rgba(150,140,180,0.6)';
  ctx.fillText('[controles]', 18, CANVAS_H - 22);
}

// --- Screens ---

export function drawMenuScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // City watermark bottom-left
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(80,75,120,0.35)';
  ctx.font = 'bold 52px monospace';
  ctx.fillText('BRAVUNA', 14, CANVAS_H - 16);

  // Title panel
  ctx.fillStyle = 'rgba(18,15,30,0.97)';
  ctx.fillRect(CANVAS_W / 2 - 210, CANVAS_H / 2 - 138, 420, 278);
  ctx.strokeStyle = 'rgba(100,90,140,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(CANVAS_W / 2 - 210, CANVAS_H / 2 - 138, 420, 278);

  // Red accent top
  ctx.fillStyle = 'rgba(255,60,60,0.65)';
  ctx.fillRect(CANVAS_W / 2 - 210, CANVAS_H / 2 - 138, 420, 3);

  ctx.textAlign = 'center';

  // Book byline
  ctx.fillStyle = 'rgba(150,140,180,0.45)';
  ctx.font = '10px monospace';
  ctx.fillText('DE CRISTIANO MARIANO  ·  CAPÍTULO 1: LINHAS INVISÍVEIS', CANVAS_W / 2, CANVAS_H / 2 - 112);

  // Drone transmission box (pulsing scan effect)
  const scanAlpha = 0.55 + Math.sin(Date.now() * 0.004) * 0.2;
  ctx.fillStyle = `rgba(30,8,8,${scanAlpha})`;
  ctx.fillRect(CANVAS_W / 2 - 190, CANVAS_H / 2 - 102, 380, 42);
  ctx.strokeStyle = `rgba(255,50,50,${scanAlpha * 0.9})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(CANVAS_W / 2 - 190, CANVAS_H / 2 - 102, 380, 42);

  ctx.fillStyle = `rgba(255,80,80,${scanAlpha})`;
  ctx.font = '9px monospace';
  ctx.fillText('▶ TRANSMISSÃO DO DRONE — ESTADO DE BRAVUNA', CANVAS_W / 2, CANVAS_H / 2 - 88);
  ctx.fillStyle = `rgba(220,200,200,${scanAlpha})`;
  ctx.font = '10px monospace';
  ctx.fillText('"Cidadão em situação irregular. Identifique-se."', CANVAS_W / 2, CANVAS_H / 2 - 72);

  ctx.fillStyle = '#d8d5e8';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('O PREÇO DA ORDEM', CANVAS_W / 2, CANVAS_H / 2 - 32);

  ctx.fillStyle = 'rgba(255,80,80,0.8)';
  ctx.font = '13px monospace';
  ctx.fillText('LIVRO 1  ·  CAPÍTULO 1  ·  BRAVUNA', CANVAS_W / 2, CANVAS_H / 2 - 10);

  // Divider
  ctx.strokeStyle = 'rgba(80,75,110,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 160, CANVAS_H / 2 + 8);
  ctx.lineTo(CANVAS_W / 2 + 160, CANVAS_H / 2 + 8);
  ctx.stroke();

  ctx.fillStyle = 'rgba(160,155,180,0.7)';
  ctx.font = '11px monospace';
  ctx.fillText('← → CORRER  |  ESPAÇO / ↑ PULAR  |  PULE SUBINDO NA PAREDE', CANVAS_W / 2, CANVAS_H / 2 + 28);
  ctx.fillText('SHIFT/Z ROLAR  |  ↓+ESPAÇO (correndo)  MERGULHO', CANVAS_W / 2, CANVAS_H / 2 + 45);

  ctx.fillStyle = 'rgba(0,200,255,0.7)';
  ctx.font = 'bold 16px monospace';
  const blink = Math.floor(Date.now() / 500) % 2 === 0;
  if (blink) ctx.fillText('[ ESPAÇO: HISTÓRIA  |  T: TESTE DE PAREDE ]', CANVAS_W / 2, CANVAS_H / 2 + 75);

  ctx.fillStyle = 'rgba(255,200,60,0.65)';
  ctx.font = '12px monospace';
  ctx.fillText('[ E: EDITOR DE FASE ]', CANVAS_W / 2, CANVAS_H / 2 + 103);

  ctx.textAlign = 'left';
}

export function drawEditorUI(
  ctx: CanvasRenderingContext2D,
  platforms: import('./types').Platform[],
  camX: number,
  camY: number,
  hoveredIdx: number,
  selectedIdx: number,
  mouseWorld: { x: number; y: number },
  copiedMsg: { text: string; until: number } | null,
  checkpointIdx: number,
  checkpoints: { label: string; x: number }[],
  collisionMode = false,
  selectedCollisionBoxIdx = 0,
  selectedIndices: Set<number> = new Set(),
  marquee: { startWX: number; startWY: number; endWX: number; endWY: number } | null = null,
  canUndo = false,
  canRedo = false,
  baselineKeys: Set<string> = new Set(),
  galleryServerNames: Set<string> = new Set(),
  galleryObjectTypes: Set<string> = new Set(),
  saveStatus: 'saved' | 'pending' | 'saving' | 'error' = 'saved',
  saveStatusMessage = '',
  saveStatusUntil = 0,
  isDirty = false,
): void {
  const platBaseKey = (p: { type: string; x: number; y: number; w: number; h: number; rotation?: number }) =>
    `${p.type}:${p.x}:${p.y}:${p.w}:${p.h}:${Math.round(p.rotation ?? 0)}`;
  const typeColor: Record<string, string> = {
    ground: 'rgba(80,200,80,0.25)',
    platform: 'rgba(80,140,255,0.30)',
    wall: 'rgba(255,180,60,0.30)',
    obstacle: 'rgba(255,80,80,0.30)',
    car: 'rgba(0,220,255,0.18)',
    tire: 'rgba(255,160,60,0.25)',
    box: 'rgba(180,120,60,0.25)',
    sprite: 'rgba(80,180,255,0.20)',
  };
  const typeStroke: Record<string, string> = {
    ground: 'rgba(80,255,80,0.75)',
    platform: 'rgba(100,160,255,0.9)',
    wall: 'rgba(255,200,60,0.9)',
    obstacle: 'rgba(255,100,80,0.9)',
    car: 'rgba(0,220,255,0.85)',
    tire: 'rgba(255,180,80,0.85)',
    box: 'rgba(200,140,80,0.85)',
    sprite: 'rgba(120,220,255,0.95)',
  };

  ctx.save();
  ctx.translate(-camX, -camY);

  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const screenLeft = p.x - camX;
    if (screenLeft > CANVAS_W + 20 || screenLeft + p.w < -20) continue;

    const isPrimary = i === selectedIdx;
    const isSelected = isPrimary || selectedIndices.has(i);
    const isHovered = i === hoveredIdx && !isSelected;

    if (isPrimary) {
      ctx.fillStyle = collisionMode ? 'rgba(255,180,0,0.16)' : 'rgba(0,200,255,0.18)';
      ctx.strokeStyle = collisionMode ? 'rgba(255,210,60,1)' : 'rgba(0,220,255,1)';
      ctx.lineWidth = 2;
    } else if (isSelected) {
      ctx.fillStyle = 'rgba(0,200,255,0.10)';
      ctx.strokeStyle = 'rgba(0,200,255,0.7)';
      ctx.lineWidth = 1.5;
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.strokeStyle = 'rgba(255,80,60,0.9)';
      ctx.lineWidth = 1.5;
    } else {
      ctx.fillStyle = typeColor[p.type] ?? 'rgba(255,255,255,0.15)';
      ctx.strokeStyle = typeStroke[p.type] ?? 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
    }

    const cropLeft = Math.max(0, Math.min(p.cropLeft ?? 0, p.w - 6));
    const cropRight = Math.max(0, Math.min(p.cropRight ?? 0, p.w - cropLeft - 6));
    const cropTop = Math.max(0, Math.min(p.cropTop ?? 0, p.h - 6));
    const cropBottom = Math.max(0, Math.min(p.cropBottom ?? 0, p.h - cropTop - 6));
    const hasCrop = cropLeft > 0 || cropRight > 0 || cropTop > 0 || cropBottom > 0;
    const cropRect = {
      x: p.x + cropLeft,
      y: p.y + cropTop,
      w: Math.max(6, p.w - cropLeft - cropRight),
      h: Math.max(6, p.h - cropTop - cropBottom),
    };
    const hits = getPlatformCollisionRects(p);
    const selectedHitIdx = Math.max(0, Math.min(selectedCollisionBoxIdx, hits.length - 1));
    const hit = hits[selectedHitIdx] ?? { x: p.x, y: p.y, w: p.w, h: p.h };
    const visualH = p.type === 'ground' ? 90 : p.h;
    const drawX = isSelected && collisionMode ? hit.x : hasCrop ? cropRect.x : p.x;
    const drawY = isSelected && collisionMode ? hit.y : hasCrop ? cropRect.y : p.y;
    const drawW = isSelected && collisionMode ? hit.w : hasCrop ? cropRect.w : p.w;
    const drawH = isSelected && collisionMode ? hit.h : hasCrop ? cropRect.h : visualH;
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.strokeRect(drawX, drawY, drawW, drawH);

    if (p.type !== 'ground') {
      const hitDiffers = hits.some((box) => Math.round(box.x) !== Math.round(p.x) || Math.round(box.y) !== Math.round(p.y) || Math.round(box.w) !== Math.round(p.w) || Math.round(box.h) !== Math.round(p.h));
      if (hitDiffers || isSelected) {
        ctx.save();
        for (let bi = 0; bi < hits.length; bi++) {
          const box = hits[bi];
          const isBoxSelected = isSelected && collisionMode && bi === selectedHitIdx;
          ctx.setLineDash(isBoxSelected ? [] : [5, 3]);
          ctx.strokeStyle = isBoxSelected ? 'rgba(255,230,80,1)' : 'rgba(255,210,60,0.75)';
          ctx.lineWidth = isBoxSelected ? 2 : 1.25;
          if (box.slopeTop) {
            ctx.beginPath();
            ctx.moveTo(box.x, box.y + box.slopeTop.left);
            ctx.lineTo(box.x + box.w, box.y + box.slopeTop.right);
            ctx.lineTo(box.x + box.w, box.y + box.h);
            ctx.lineTo(box.x, box.y + box.h);
            ctx.closePath();
            ctx.fillStyle = isBoxSelected ? 'rgba(255,190,40,0.18)' : 'rgba(255,210,60,0.07)';
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            ctx.fillStyle = isBoxSelected ? 'rgba(255,190,40,0.16)' : 'rgba(255,210,60,0.05)';
            ctx.fillRect(box.x, box.y, box.w, box.h);
          }
          if (isSelected && collisionMode && hits.length > 1) {
            ctx.setLineDash([]);
            ctx.fillStyle = isBoxSelected ? 'rgba(255,245,150,1)' : 'rgba(255,220,100,0.8)';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(bi + 1), box.x + 8, box.y + 12);
            ctx.textAlign = 'left';
          }
        }
        ctx.restore();
      }
      if (isSelected && collisionMode) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(0,220,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.restore();
      }
    }

    if (isPrimary) {
      // Coord label above
      const gy = Math.round(p.y - 410);
      ctx.fillStyle = 'rgba(0,220,255,0.95)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const modeLabel = collisionMode ? '  HITBOX' : '';
      const boxLabel = collisionMode && hits.length > 1 ? ` ${selectedHitIdx + 1}/${hits.length}` : '';
      const nameLabel = p.type === 'sprite' && p.customSpriteName ? ` ${p.customSpriteName}` : '';
      const rotationLabel = Math.round(p.rotation ?? 0) !== 0 ? `  rot:${Math.round(p.rotation ?? 0)}°` : '';
      ctx.fillText(`x:${p.x}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${p.w}  h:${p.h}${rotationLabel}  [${p.type}]${nameLabel}${modeLabel}${boxLabel}`, drawX + drawW / 2, drawY - 8);
      ctx.textAlign = 'left';

      if (hasCrop && !collisionMode) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,80,220,0.95)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawX, drawY, drawW, drawH);
        ctx.fillStyle = 'rgba(255,80,220,0.95)';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CROP', drawX + drawW / 2, drawY + drawH + 11);
        ctx.restore();
      }

      const HANDLE_SIZE = 8;
      const sideHandleColor = collisionMode ? 'rgba(255,210,60,1)' : 'rgba(0,220,255,1)';
      const verticalHandleColor = collisionMode ? 'rgba(255,170,60,1)' : 'rgba(255,200,0,1)';
      const drawSquareHandle = (hx: number, hy: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      };

      drawSquareHandle(drawX + drawW, drawY + drawH / 2, sideHandleColor);
      drawSquareHandle(drawX, drawY + drawH / 2, sideHandleColor);
      drawSquareHandle(drawX + drawW / 2, drawY, verticalHandleColor);
      drawSquareHandle(drawX + drawW / 2, drawY + drawH, verticalHandleColor);

      if (!collisionMode) {
        const rhx = drawX + drawW / 2;
        const rhy = drawY - 28;
        ctx.strokeStyle = 'rgba(0,220,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(drawX + drawW / 2, drawY);
        ctx.lineTo(rhx, rhy + 7);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,220,255,1)';
        ctx.beginPath();
        ctx.arc(rhx, rhy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#052436';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('↻', rhx, rhy + 3);
        ctx.textAlign = 'left';
      }

      const chx = drawX + drawW;
      const chy = drawY;
      ctx.fillStyle = 'rgba(80,255,120,1)';
      ctx.beginPath();
      ctx.arc(chx, chy, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // diagonal arrow hint
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chx - 4, chy + 4);
      ctx.lineTo(chx + 4, chy - 4);
      ctx.stroke();

      // Slope handles (diamond-shaped, orange) for the selected collision box
      if (collisionMode && hit.slopeTop) {
        const drawDiamondHandle = (hx: number, hy: number) => {
          const s = 7;
          ctx.beginPath();
          ctx.moveTo(hx, hy - s);
          ctx.lineTo(hx + s, hy);
          ctx.lineTo(hx, hy + s);
          ctx.lineTo(hx - s, hy);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,140,30,1)';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        };
        drawDiamondHandle(hit.x, hit.y + hit.slopeTop.left);
        drawDiamondHandle(hit.x + hit.w, hit.y + hit.slopeTop.right);
        // Label da superfície inclinada
        ctx.fillStyle = 'rgba(255,180,60,0.9)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`◥ slope  L:${hit.slopeTop.left}  R:${hit.slopeTop.right}`, hit.x + hit.w / 2, hit.y + Math.min(hit.slopeTop.left, hit.slopeTop.right) - 6);
        ctx.textAlign = 'left';
      }

      // Duplicate button (right side, vertically centred)
      const dupBtnX = drawX + drawW + 14;
      const dupBtnY = drawY + drawH / 2 - 24;
      const selectedCount = selectedIndices.has(selectedIdx) ? Math.max(1, selectedIndices.size) : 1;
      const dupLabel = selectedCount > 1 ? `⧉ DUP ${selectedCount}` : '⧉ DUP';
      const dupBtnW = selectedCount > 1 ? 78 : 62;
      const dupBtnH = 22;
      ctx.fillStyle = 'rgba(30,30,60,0.88)';
      ctx.strokeStyle = 'rgba(120,180,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(dupBtnX, dupBtnY, dupBtnW, dupBtnH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,210,255,1)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dupLabel, dupBtnX + dupBtnW / 2, dupBtnY + 15);
      ctx.textAlign = 'left';

      const hitBtnX = dupBtnX;
      const hitBtnY = dupBtnY + 26;
      const hitBtnW = 82;
      const hitBtnH = 22;
      ctx.fillStyle = collisionMode ? 'rgba(80,60,20,0.94)' : 'rgba(40,30,20,0.88)';
      ctx.strokeStyle = collisionMode ? 'rgba(255,220,80,0.95)' : 'rgba(255,190,80,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(hitBtnX, hitBtnY, hitBtnW, hitBtnH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = collisionMode ? 'rgba(255,235,120,1)' : 'rgba(255,200,120,0.95)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(collisionMode ? '✓ HITBOX' : '▣ HITBOX', hitBtnX + hitBtnW / 2, hitBtnY + 15);
      ctx.textAlign = 'left';

      // ── Botão DELETAR (só fora do collision mode) ──────────────
      if (!collisionMode) {
        const delBtnX = hitBtnX;
        const delBtnY = hitBtnY + 26;
        const delBtnW = 82;
        const delBtnH = 22;
        const delLabel = selectedCount > 1 ? `x DEL ${selectedCount}` : 'x DELETAR';
        ctx.fillStyle = 'rgba(65,15,15,0.94)';
        ctx.strokeStyle = 'rgba(255,70,70,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(delBtnX, delBtnY, delBtnW, delBtnH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,150,150,1)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(delLabel, delBtnX + delBtnW / 2, delBtnY + 15);
        ctx.textAlign = 'left';

        // ── Botão SALVAR NA GALERIA (tipos não-ground, exceto escadas) ──
        const isSprite = p.type === 'sprite' && !!p.customSpriteName;
        const spriteAlreadyInGallery = isSprite && galleryServerNames.has(p.customSpriteName!);
        const typeAlreadyInGallery = !isSprite && galleryObjectTypes.has(p.type);
        const alreadyInGallery = isSprite ? spriteAlreadyInGallery : typeAlreadyInGallery;
        const isStairPlat = !!(p as any)._stair;
        if (p.type !== 'ground' && !alreadyInGallery) {
          const galBtnX = delBtnX;
          const galBtnY = delBtnY + 26;
          const galBtnW = 82;
          const galBtnH = 22;
          ctx.fillStyle = 'rgba(15,40,60,0.94)';
          ctx.strokeStyle = 'rgba(80,200,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(galBtnX, galBtnY, galBtnW, galBtnH, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(120,220,255,1)';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('📁 GALERIA', galBtnX + galBtnW / 2, galBtnY + 15);
          ctx.textAlign = 'left';
        }

        // ── Botão ↔ INVERTER (só para plataformas _stair) — abaixo da galeria ──
        if (isStairPlat) {
          const flipBtnX = delBtnX;
          const flipBtnY = delBtnY + 52;
          const flipBtnW = 82;
          const flipBtnH = 22;
          const flipped = !!(p as any).flipX;
          ctx.fillStyle = flipped ? 'rgba(40,60,20,0.94)' : 'rgba(30,30,55,0.94)';
          ctx.strokeStyle = flipped ? 'rgba(140,255,100,0.9)' : 'rgba(180,180,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(flipBtnX, flipBtnY, flipBtnW, flipBtnH, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = flipped ? 'rgba(180,255,140,1)' : 'rgba(200,200,255,1)';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(flipped ? '↔ NORMAL' : '↔ INVERTER', flipBtnX + flipBtnW / 2, flipBtnY + 15);
          ctx.textAlign = 'left';
        }
      }

      if (collisionMode) {
        const addBtnX = hitBtnX;
        const addBtnY = hitBtnY + 26;
        const addBtnW = 82;
        const addBtnH = 22;
        ctx.fillStyle = 'rgba(30,55,35,0.92)';
        ctx.strokeStyle = 'rgba(100,255,150,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(addBtnX, addBtnY, addBtnW, addBtnH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,255,180,1)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+ BOX', addBtnX + addBtnW / 2, addBtnY + 15);
        ctx.textAlign = 'left';

        const remBtnX = addBtnX;
        const remBtnY = addBtnY + 26;
        const remBtnW = 82;
        const remBtnH = 22;
        ctx.fillStyle = 'rgba(55,20,20,0.92)';
        ctx.strokeStyle = 'rgba(255,100,100,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(remBtnX, remBtnY, remBtnW, remBtnH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,160,160,1)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('− HITBOX', remBtnX + remBtnW / 2, remBtnY + 15);
        ctx.textAlign = 'left';

        const hasSlope = !!(hit.slopeTop);
        const slopeBtnX = remBtnX;
        const slopeBtnY = remBtnY + 26;
        const slopeBtnW = 82;
        const slopeBtnH = 22;
        ctx.fillStyle = hasSlope ? 'rgba(60,35,10,0.94)' : 'rgba(30,25,20,0.88)';
        ctx.strokeStyle = hasSlope ? 'rgba(255,160,40,0.95)' : 'rgba(180,120,60,0.70)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(slopeBtnX, slopeBtnY, slopeBtnW, slopeBtnH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = hasSlope ? 'rgba(255,200,100,1)' : 'rgba(210,170,120,0.9)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(hasSlope ? '◥ SEM SLOPE' : '◥ + SLOPE', slopeBtnX + slopeBtnW / 2, slopeBtnY + 15);
        ctx.textAlign = 'left';
      }
    } else if (isSelected) {
      // Selecionado secundário (multi-seleção) — só rótulo, sem alças
      const gy = Math.round(p.y - 410);
      ctx.fillStyle = 'rgba(0,200,255,0.75)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const nameLabel = p.type === 'sprite' && p.customSpriteName ? ` ${p.customSpriteName}` : '';
      ctx.fillText(`x:${p.x}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${p.w}  [${p.type}]${nameLabel}`, drawX + drawW / 2, drawY - 6);
      ctx.textAlign = 'left';
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(255,80,60,0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const gy = Math.round(p.y - 410);
      const nameLabel = p.type === 'sprite' && p.customSpriteName ? ` ${p.customSpriteName}` : '';
      ctx.fillText(`x:${p.x}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${p.w}  [${p.type}]${nameLabel}  — clique para selecionar`, drawX + drawW / 2, drawY - 6);
      ctx.textAlign = 'left';
    }
  }

  // Desenhar marquee de seleção (contexto já está transladado por -camX)
  if (marquee) {
    const mx1 = Math.min(marquee.startWX, marquee.endWX);
    const my1 = Math.min(marquee.startWY, marquee.endWY);
    const mw = Math.abs(marquee.endWX - marquee.startWX);
    const mh = Math.abs(marquee.endWY - marquee.startWY);
    ctx.save();
    ctx.fillStyle = 'rgba(0,200,255,0.06)';
    ctx.fillRect(mx1, my1, mw, mh);
    ctx.strokeStyle = 'rgba(0,220,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(mx1, my1, mw, mh);
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, CANVAS_W, 56);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,200,60,0.95)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('EDITOR DE FASE', 12, 16);

  // Botões Desfazer / Refazer
  const undoBtnX = 166, redoBtnX = 224, uploadBtnX = 286, histBtnY = 5, histBtnW = 54, histBtnH = 18;
  const uploadBtnW = 90;
  const galeriaBtnX = uploadBtnX + uploadBtnW + 4;
  const galeriaBtnW = 72;
  ctx.save();
  ctx.fillStyle = canUndo ? 'rgba(40,50,80,0.92)' : 'rgba(25,25,35,0.6)';
  ctx.strokeStyle = canUndo ? 'rgba(120,170,255,0.9)' : 'rgba(80,80,110,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(undoBtnX, histBtnY, histBtnW, histBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = canUndo ? 'rgba(160,200,255,1)' : 'rgba(100,100,140,0.55)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('↩ DESFAZ', undoBtnX + histBtnW / 2, histBtnY + 12);

  ctx.fillStyle = canRedo ? 'rgba(40,50,80,0.92)' : 'rgba(25,25,35,0.6)';
  ctx.strokeStyle = canRedo ? 'rgba(120,170,255,0.9)' : 'rgba(80,80,110,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(redoBtnX, histBtnY, histBtnW, histBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = canRedo ? 'rgba(160,200,255,1)' : 'rgba(100,100,140,0.55)';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('REFAZ ↪', redoBtnX + histBtnW / 2, histBtnY + 12);
  ctx.textAlign = 'left';
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(30,55,70,0.92)';
  ctx.strokeStyle = 'rgba(120,220,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(uploadBtnX, histBtnY, uploadBtnW, histBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(170,235,255,1)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UPLOAD', uploadBtnX + uploadBtnW / 2, histBtnY + 12);
  ctx.restore();

  // Botão GALERIA
  ctx.save();
  ctx.fillStyle = 'rgba(40,30,70,0.92)';
  ctx.strokeStyle = 'rgba(200,150,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(galeriaBtnX, histBtnY, galeriaBtnW, histBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,190,255,1)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🖼 GALERIA', galeriaBtnX + galeriaBtnW / 2, histBtnY + 12);
  ctx.restore();

  const checkpointBtnX = galeriaBtnX + galeriaBtnW + 4;
  const checkpointBtnY = histBtnY;
  const checkpointBtnW = 30;
  const checkpointBtnH = histBtnH;
  const checkpointBtnGap = 4;
  checkpoints.forEach((cp, ci) => {
    const btnX = checkpointBtnX + ci * (checkpointBtnW + checkpointBtnGap);
    const active = ci === checkpointIdx;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(0,60,80,0.96)' : 'rgba(25,35,55,0.88)';
    ctx.strokeStyle = active ? 'rgba(0,240,255,1)' : 'rgba(100,160,220,0.7)';
    ctx.lineWidth = active ? 2 : 1.25;
    ctx.beginPath();
    ctx.roundRect(btnX, checkpointBtnY, checkpointBtnW, checkpointBtnH, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? 'rgba(0,245,255,1)' : 'rgba(160,200,255,0.9)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cp.label, btnX + checkpointBtnW / 2, checkpointBtnY + 12);
    ctx.restore();
  });
  const addCheckpointBtnX = checkpointBtnX + checkpoints.length * (checkpointBtnW + checkpointBtnGap) + 4;
  ctx.save();
  ctx.fillStyle = 'rgba(30,55,35,0.92)';
  ctx.strokeStyle = 'rgba(100,255,150,0.85)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(addCheckpointBtnX, checkpointBtnY, 36, checkpointBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(150,255,180,1)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('+ CP', addCheckpointBtnX + 18, checkpointBtnY + 12);
  ctx.restore();

  const delCheckpointBtnX = addCheckpointBtnX + 40;
  const delEnabled = checkpointIdx >= 0 && checkpointIdx < checkpoints.length;
  ctx.save();
  ctx.fillStyle = delEnabled ? 'rgba(70,25,30,0.92)' : 'rgba(40,40,45,0.6)';
  ctx.strokeStyle = delEnabled ? 'rgba(255,120,140,0.85)' : 'rgba(120,120,130,0.5)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(delCheckpointBtnX, checkpointBtnY, 36, checkpointBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = delEnabled ? 'rgba(255,170,180,1)' : 'rgba(160,160,170,0.7)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('− CP', delCheckpointBtnX + 18, checkpointBtnY + 12);
  ctx.restore();

  // ── Chave de exportação da fase ─────────────────────────────
  {
    const expX = delCheckpointBtnX + 44;
    const expY = histBtnY;
    const expW = CANVAS_W - expX - 8;
    const expH = histBtnH;

    // Calcula a chave compacta — add (novos/movidos) e del (removidos/movidos de)
    const GY_VAL = GROUND_Y;
    const currentKeys = new Set(platforms.map(p => platBaseKey(p)));
    const addItems = platforms
      .filter(p => p.type !== 'ground' && !baselineKeys.has(platBaseKey(p)))
      .map(p => ({ t: p.type[0], x: p.x, y: Math.round(p.y - GY_VAL), w: p.w, h: p.h }));
    const delCount = [...baselineKeys].filter(k => !currentKeys.has(k)).length;
    const total = addItems.length + delCount;
    const exportStr = total === 0
      ? '(sem mudanças — mova, redimensione ou adicione objetos)'
      : `+${addItems.length} add  −${delCount} del  [clique p/ copiar]`;

    // Fundo pulsante esverdeado
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 600);
    ctx.save();
    ctx.fillStyle = `rgba(15,50,30,0.93)`;
    ctx.strokeStyle = `rgba(50,${Math.round(180 * pulse)},90,0.88)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(expX, expY, expW, expH, 3);
    ctx.fill();
    ctx.stroke();

    // Rótulo fixo
    ctx.fillStyle = 'rgba(80,220,130,0.95)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SALVAR:', expX + 5, expY + 12);

    // String truncada
    ctx.fillStyle = 'rgba(160,255,200,0.85)';
    ctx.font = '9px monospace';
    const maxStrW = expW - 58;
    let truncated = exportStr;
    while (truncated.length > 4 && ctx.measureText(truncated).width > maxStrW) {
      truncated = truncated.slice(0, -4) + '…';
    }
    ctx.fillText(truncated, expX + 56, expY + 12);
    ctx.restore();

    // ── Badge de status do auto-save (logo abaixo do painel SALVAR) ──────
    const showStatusUntil = saveStatusUntil > Date.now();
    const showStatus =
      saveStatus === 'saving' ||
      saveStatus === 'pending' ||
      saveStatus === 'error' ||
      isDirty ||
      showStatusUntil;
    if (showStatus) {
      const badgeY = expY + expH + 3;
      const badgeH = 14;
      let bgColor: string;
      let fgColor: string;
      let icon: string;
      let label: string;
      switch (saveStatus) {
        case 'saving':
          bgColor = 'rgba(40,55,90,0.93)';
          fgColor = 'rgba(150,200,255,0.95)';
          icon = '⏳';
          label = saveStatusMessage || 'salvando...';
          break;
        case 'pending':
          bgColor = 'rgba(80,65,20,0.93)';
          fgColor = 'rgba(255,220,140,0.95)';
          icon = '●';
          label = saveStatusMessage || 'modificado';
          break;
        case 'error':
          bgColor = 'rgba(85,25,25,0.93)';
          fgColor = 'rgba(255,170,170,0.98)';
          icon = '⚠';
          label = saveStatusMessage || 'erro ao salvar';
          break;
        case 'saved':
        default:
          bgColor = 'rgba(20,55,30,0.93)';
          fgColor = 'rgba(150,255,180,0.95)';
          icon = '✓';
          label = saveStatusMessage || 'salvo';
          break;
      }
      ctx.save();
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = fgColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(expX, badgeY, expW, badgeH, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fgColor;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      const badgeText = `${icon} ${label}`;
      const maxBadgeW = expW - 10;
      let truncatedBadge = badgeText;
      while (truncatedBadge.length > 4 && ctx.measureText(truncatedBadge).width > maxBadgeW) {
        truncatedBadge = truncatedBadge.slice(0, -4) + '…';
      }
      ctx.fillText(truncatedBadge, expX + 5, badgeY + 10);
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(180,175,210,0.75)';
  ctx.font = '10px monospace';
  const helpText = collisionMode
    ? 'HITBOX: clique numa caixa para escolher  |  setas movem 1px (Shift=5px)  |  +BOX / −HITBOX  |  S ou ◥ +SLOPE'
    : '← → MOVER  |  1-9/0 acessa CP direto  |  +CP cria e salva checkpoint  |  ESC: MENU';
  ctx.fillText(helpText, 12, 32);

  // Checkpoint markers in world space
  ctx.save();
  for (let ci = 0; ci < checkpoints.length; ci++) {
    const cp = checkpoints[ci];
    const sx = cp.x - camX;
    if (sx < -40 || sx > CANVAS_W + 40) continue;
    const isActive = ci === checkpointIdx;
    ctx.strokeStyle = isActive ? 'rgba(80,245,255,1)' : 'rgba(80,180,255,0.45)';
    ctx.lineWidth = isActive ? 3 : 1;
    ctx.setLineDash(isActive ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, 44);
    ctx.lineTo(sx, CANVAS_H);
    ctx.stroke();
    ctx.setLineDash([]);
    if (isActive) {
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 160);
      ctx.fillStyle = `rgba(0,210,255,${0.18 + pulse * 0.22})`;
      ctx.fillRect(sx - 9, 44, 18, CANVAS_H - 44);
      ctx.fillStyle = 'rgba(0,245,255,0.98)';
      ctx.beginPath();
      ctx.moveTo(sx, 62);
      ctx.lineTo(sx - 8, 48);
      ctx.lineTo(sx + 8, 48);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = isActive ? 'rgba(0,245,255,0.98)' : 'rgba(80,160,255,0.75)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cp.label, sx, 58);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Current checkpoint info row
  if (checkpointIdx >= 0 && checkpointIdx < checkpoints.length) {
    const cp = checkpoints[checkpointIdx];
    const label = `▶ CHECKPOINT ATIVO: ${cp.label}  ${checkpointIdx + 1}/${checkpoints.length}  x:${cp.x}`;
    const badgeX = 12;
    const badgeY = 38;
    const badgeW = Math.min(290, ctx.measureText(label).width + 14);
    const badgeH = 15;
    ctx.save();
    ctx.fillStyle = 'rgba(0,45,70,0.92)';
    ctx.strokeStyle = 'rgba(0,230,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,245,255,0.98)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, badgeX + 7, 49);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(130,130,160,0.6)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('sem checkpoint ativo', 12, 49);
  }

  // Destaque visual para o botão de spawn
  const spawnLabel = ' CTRL: TESTAR AQUI ';
  const labelW = ctx.measureText(spawnLabel).width + 4;
  ctx.fillStyle = 'rgba(60,210,120,0.22)';
  ctx.fillRect(CANVAS_W - 10 - labelW - 2, 38, labelW + 4, 14);
  ctx.strokeStyle = 'rgba(60,210,120,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(CANVAS_W - 10 - labelW - 2, 38, labelW + 4, 14);
  ctx.fillStyle = 'rgba(80,230,140,0.95)';
  ctx.textAlign = 'right';
  ctx.fillText(spawnLabel, CANVAS_W - 10, 49);

  const wx = Math.round(mouseWorld.x);
  const wy = Math.round(mouseWorld.y);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(120,200,120,0.7)';
  ctx.font = '10px monospace';
  ctx.fillText(`pos: ${wx}, ${wy}  |  cam: ${Math.round(camX)}`, CANVAS_W - 10, 16);

  const counts: Record<string, number> = {};
  for (const p of platforms) counts[p.type] = (counts[p.type] ?? 0) + 1;
  const countStr = Object.entries(counts).map(([t, n]) => `${t}:${n}`).join('  ');
  ctx.fillStyle = 'rgba(160,155,200,0.6)';
  ctx.font = '10px monospace';
  ctx.fillText(countStr, CANVAS_W - 10, 32);

  ctx.textAlign = 'left';

  // Feedback de cópia
  if (copiedMsg && Date.now() < copiedMsg.until) {
    const alpha = Math.min(1, (copiedMsg.until - Date.now()) / 400);
    ctx.save();
    ctx.globalAlpha = alpha;
    const toastX = 12;
    const toastY = CANVAS_H - 58;
    const toastW = Math.min(520, CANVAS_W - 24);
    const toastH = 34;
    ctx.fillStyle = 'rgba(12,45,28,0.90)';
    ctx.strokeStyle = 'rgba(70,220,120,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(toastX, toastY, toastW, toastH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(185,255,205,0.95)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    let toastText = copiedMsg.text;
    const maxTextW = toastW - 22;
    while (toastText.length > 4 && ctx.measureText(toastText).width > maxTextW) {
      toastText = toastText.slice(0, -4) + '…';
    }
    ctx.fillText(toastText, toastX + 11, toastY + 21);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

export function drawGameOverScreen(ctx: CanvasRenderingContext2D, score: number, time: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  ctx.fillStyle = 'rgba(18,15,30,0.97)';
  ctx.fillRect(cx - 210, cy - 130, 420, 262);
  ctx.strokeStyle = 'rgba(200,50,50,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 210, cy - 130, 420, 262);
  ctx.fillStyle = 'rgba(255,60,60,0.6)';
  ctx.fillRect(cx - 210, cy - 130, 420, 3);

  ctx.textAlign = 'center';

  // Drone protocol message
  ctx.fillStyle = 'rgba(255,80,80,0.55)';
  ctx.font = '9px monospace';
  ctx.fillText('PROTOCOLO DE RESISTÊNCIA — ALVO NEUTRALIZADO', cx, cy - 108);

  ctx.fillStyle = '#cc4444';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('CAPTURADO', cx, cy - 68);

  // Stats
  ctx.fillStyle = 'rgba(200,190,220,0.7)';
  ctx.font = '12px monospace';
  ctx.fillText(`DISTÂNCIA: ${Math.floor(score / 10)}m`, cx, cy - 38);
  const secs = Math.floor(time / 1000);
  ctx.fillText(
    `TEMPO: ${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`,
    cx, cy - 20
  );

  // Divider
  ctx.strokeStyle = 'rgba(80,75,110,0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - 170, cy - 6);
  ctx.lineTo(cx + 170, cy - 6);
  ctx.stroke();

  // Rescue moment quote from the book
  ctx.fillStyle = 'rgba(140,130,165,0.5)';
  ctx.font = 'italic 10px monospace';
  ctx.fillText('"Se eu sumir agora → quem nota?"', cx, cy + 12);
  ctx.fillText('"Se eu gritar → quem escuta?"', cx, cy + 28);

  // The rescue
  ctx.fillStyle = 'rgba(180,175,210,0.75)';
  ctx.font = '11px monospace';
  ctx.fillText('— O PREÇO DA ORDEM, Cap. 1', cx, cy + 50);

  const blink = Math.floor(Date.now() / 600) % 2 === 0;
  ctx.fillStyle = blink ? 'rgba(0,200,255,0.85)' : 'rgba(0,200,255,0.35)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('[ ESPAÇO — CORRER DE NOVO ]', cx, cy + 92);

  ctx.textAlign = 'left';
}

export function drawPauseScreen(ctx: CanvasRenderingContext2D, selection: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;

  // Panel
  ctx.fillStyle = 'rgba(18,15,30,0.97)';
  ctx.fillRect(cx - 200, cy - 110, 400, 230);
  ctx.strokeStyle = 'rgba(100,90,140,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 200, cy - 110, 400, 230);

  // Top accent
  ctx.fillStyle = 'rgba(255,200,60,0.7)';
  ctx.fillRect(cx - 200, cy - 110, 400, 3);

  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(255,200,60,0.9)';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('⏸  PAUSADO', cx, cy - 68);

  ctx.strokeStyle = 'rgba(80,75,110,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 150, cy - 48);
  ctx.lineTo(cx + 150, cy - 48);
  ctx.stroke();

  ctx.fillStyle = 'rgba(180,175,210,0.6)';
  ctx.font = '11px monospace';
  ctx.fillText('↑ ↓ NAVEGAR  |  ENTER / ESPAÇO CONFIRMAR  |  ESC CONTINUAR', cx, cy - 26);

  // Option 0 — Continuar
  const opt0Selected = selection === 0;
  ctx.fillStyle = opt0Selected ? 'rgba(18,12,36,0.95)' : 'transparent';
  if (opt0Selected) ctx.fillRect(cx - 160, cy - 8, 320, 38);
  ctx.strokeStyle = opt0Selected ? 'rgba(0,200,255,0.7)' : 'transparent';
  ctx.lineWidth = 1;
  if (opt0Selected) ctx.strokeRect(cx - 160, cy - 8, 320, 38);

  ctx.fillStyle = opt0Selected ? 'rgba(0,220,255,1)' : 'rgba(160,155,200,0.65)';
  ctx.font = opt0Selected ? 'bold 16px monospace' : '15px monospace';
  ctx.fillText(opt0Selected ? '▶  CONTINUAR' : '   CONTINUAR', cx, cy + 20);

  // Option 1 — Menu inicial
  const opt1Selected = selection === 1;
  ctx.fillStyle = opt1Selected ? 'rgba(18,12,36,0.95)' : 'transparent';
  if (opt1Selected) ctx.fillRect(cx - 160, cy + 44, 320, 38);
  ctx.strokeStyle = opt1Selected ? 'rgba(255,100,100,0.7)' : 'transparent';
  if (opt1Selected) ctx.strokeRect(cx - 160, cy + 44, 320, 38);

  ctx.fillStyle = opt1Selected ? 'rgba(255,130,130,1)' : 'rgba(160,155,200,0.65)';
  ctx.font = opt1Selected ? 'bold 16px monospace' : '15px monospace';
  ctx.fillText(opt1Selected ? '▶  MENU INICIAL' : '   MENU INICIAL', cx, cy + 72);

  ctx.textAlign = 'left';
}

// ── Parede de tijolos de prédio atrás das escadas de emergência ────────────────
export function drawStaircaseBuildingWall(ctx: CanvasRenderingContext2D, camX: number): void {
  const WORLD_X = 31074;
  const WORLD_W = 622; // até ~31696
  const wallX   = WORLD_X - camX;
  const wallY   = -600; // bem acima da escada mais alta
  const wallH   = GROUND_Y - wallY;

  if (wallX + WORLD_W < -60 || wallX > CANVAS_W + 60) return;

  const screenLeft  = Math.max(wallX, -60);
  const screenRight = Math.min(wallX + WORLD_W, CANVAS_W + 60);

  // ── Base: gradiente escuro de tijolo ──────────────────────────────────────
  const baseGrad = ctx.createLinearGradient(wallX, wallY, wallX + WORLD_W, wallY);
  baseGrad.addColorStop(0,    '#110a05');
  baseGrad.addColorStop(0.35, '#221108');
  baseGrad.addColorStop(0.65, '#1b0d07');
  baseGrad.addColorStop(1,    '#0f0804');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(wallX, wallY, WORLD_W, wallH);

  // ── Tijolos ───────────────────────────────────────────────────────────────
  const brickW  = 54;
  const brickH  = 22;
  const firstRow = Math.floor(wallY / brickH) - 1;
  const lastRow  = Math.ceil((wallY + wallH) / brickH) + 1;
  const BRICK_COLORS = ['#2c1509', '#38190b', '#45200e', '#281208', '#321609'];

  for (let row = firstRow; row <= lastRow; row++) {
    const y = row * brickH;
    if (y + brickH < wallY || y > wallY + wallH) continue;
    const offset   = row % 2 === 0 ? 0 : brickW / 2;
    const firstCol = Math.floor((screenLeft  - wallX - offset) / brickW) - 1;
    const lastCol  = Math.ceil ((screenRight - wallX - offset) / brickW) + 1;
    for (let col = firstCol; col <= lastCol; col++) {
      const x = wallX + offset + col * brickW;
      if (x + brickW < screenLeft || x > screenRight) continue;
      const tone = Math.abs((row * 17 + col * 31) % 5);
      ctx.fillStyle = BRICK_COLORS[tone];
      ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);
      ctx.fillStyle = 'rgba(255,110,50,0.03)';
      ctx.fillRect(x + 2, y + 2, brickW - 6, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 1, y + brickH - 4, brickW - 2, 3);
    }
  }

  // ── Linhas de argamassa horizontais ──────────────────────────────────────
  ctx.strokeStyle = 'rgba(8,4,2,0.55)';
  ctx.lineWidth   = 1.5;
  for (let y = wallY; y <= wallY + wallH; y += brickH) {
    ctx.beginPath();
    ctx.moveTo(screenLeft,  y);
    ctx.lineTo(screenRight, y);
    ctx.stroke();
  }

  // ── Pilares verticais de concreto ─────────────────────────────────────────
  ctx.strokeStyle = 'rgba(6,3,1,0.60)';
  ctx.lineWidth   = 6;
  for (let x = wallX + 54; x < wallX + WORLD_W; x += 108) {
    if (x < screenLeft - 6 || x > screenRight + 6) continue;
    ctx.beginPath();
    ctx.moveTo(x, wallY);
    ctx.lineTo(x, wallY + wallH);
    ctx.stroke();
  }

  // ── Janelas pequenas (fachada de prédio) ──────────────────────────────────
  const winW   = 18;
  const winH   = 26;
  const winSpX = 80;
  const winSpY = 66;
  for (let wy = wallY + 28; wy < wallY + wallH - 44; wy += winSpY) {
    for (let wx = wallX + 22; wx < wallX + WORLD_W - 20; wx += winSpX) {
      if (wx + winW < screenLeft || wx > screenRight) continue;
      const seed = (Math.floor((wy - wallY) / winSpY) * 7 + Math.floor((wx - wallX) / winSpX) * 13) % 17;
      ctx.fillStyle = seed < 4 ? 'rgba(160,75,15,0.30)' : 'rgba(3,1,0,0.92)';
      ctx.fillRect(wx, wy, winW, winH);
      ctx.strokeStyle = 'rgba(55,28,12,0.80)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(wx, wy, winW, winH);
    }
  }

  // ── Bordas laterais de concreto (fecham a parede) ───────────────────────
  const pillarW = 14;

  // Borda esquerda
  ctx.fillStyle = '#1a0e07';
  ctx.fillRect(wallX, wallY, pillarW, wallH);
  ctx.fillStyle = 'rgba(255,120,60,0.07)';
  ctx.fillRect(wallX + pillarW, wallY, 3, wallH);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(wallX - 2, wallY, 4, wallH);

  // Borda direita
  ctx.fillStyle = '#1a0e07';
  ctx.fillRect(wallX + WORLD_W - pillarW, wallY, pillarW, wallH);
  ctx.fillStyle = 'rgba(255,120,60,0.07)';
  ctx.fillRect(wallX + WORLD_W - pillarW - 3, wallY, 3, wallH);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(wallX + WORLD_W - 2, wallY, 4, wallH);

  // ── Gradiente de sombra no topo ───────────────────────────────────────────
  const topFade = ctx.createLinearGradient(0, wallY, 0, wallY + 120);
  topFade.addColorStop(0, 'rgba(0,0,0,0.75)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(wallX, wallY, WORLD_W, 120);
}
