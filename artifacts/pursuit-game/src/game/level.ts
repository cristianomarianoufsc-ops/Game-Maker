import type { Platform } from './types';
import { GROUND_Y, CANVAS_H, CANVAS_W } from './constants';

const GH = 30;
const CAN_W = 90;
const CAN_H = 58;

const WALL_CLEAR_BEFORE = 420;
const WALL_CLEAR_AFTER = 180;

// ──────────────────────────────────────────────────────────────────
//  ALTERNAÇÃO DE ZONAS:
//
//  FREE ZONE 1   x: -400  →  3000   sprint livre, zero paredes
//  WALL ZONE 1   x: 3000  →  7200   paredes (≥3), buracos, lixeiras, plataformas
//  FREE ZONE 2   x: 7200  → 11500   ZERO paredes — buracos + lixeiras + plataformas
//  WALL ZONE 2   x:11500  → 16000   paredes (≥3), mais buracos, plataformas altas
//  FREE ZONE 3   x:16000  → 20000   ZERO paredes — buracos + lixeiras + plataformas
//  WALL ZONE 3   x:20000  → 25000   paredes (≥4), buracos grandes, parkour difícil
// ──────────────────────────────────────────────────────────────────

export function generateLevel(): Platform[] {
  const platforms: Platform[] = [];

  const walls: Array<{ x: number; y: number; h: number }> = [
    { x: 4050, y: GROUND_Y - 195, h: 195 },
    { x: 5500, y: GROUND_Y - 215, h: 215 },
    { x: 6500, y: GROUND_Y - 235, h: 235 },

    { x: 12100, y: GROUND_Y - 400, h: 400 },
    { x: 16900, y: GROUND_Y - 400, h: 400 },
    { x: 17600, y: GROUND_Y - 250, h: 250 },

    { x: 20900, y: GROUND_Y - 300, h: 300 },
    { x: 22100, y: GROUND_Y - 320, h: 320 },
    { x: 23100, y: GROUND_Y - 310, h: 310 },
    { x: 24100, y: GROUND_Y - 290, h: 290 },
  ];

  const isNearWallBase = (x: number, w: number): boolean =>
    walls.some((wall) => x < wall.x + WALL_CLEAR_AFTER && x + w > wall.x - WALL_CLEAR_BEFORE);

  // ── GROUND SEGMENTS ────────────────────────────────────────────

  const groundSegments: Array<{ x: number; w: number }> = [
    // FREE ZONE 1 — pista lisa, sem buracos
    { x: -400, w: 3500 },   // -400 → 3100

    // WALL ZONE 1 — primeiros buracos e paredes
    { x: 3200, w: 900  },
    { x: 4200, w: 800  },
    { x: 5100, w: 700  },
    { x: 5900, w: 600  },
    { x: 6600, w: 500  },

    // FREE ZONE 2 — buracos moderados, ZERO paredes
    { x: 7300, w: 700  },
    { x: 8100, w: 650  },
    { x: 8850, w: 600  },
    { x: 9550, w: 700  },
    { x: 10350, w: 600 },
    { x: 11050, w: 500 },

    // WALL ZONE 2 — buracos maiores + paredes
    { x: 11700, w: 550 },
    // Ferro velho (x:12100-16900): chão contínuo, sem buracos (dobro do original)
    { x: 12250, w: 4690 },  // 12250 → 16940 (cobre toda a zona do ferro velho)

    // FREE ZONE 3 — buracos moderados, ZERO paredes
    { x: 17100, w: 550 },
    { x: 17750, w: 600 },
    { x: 18350, w: 700 },
    { x: 19150, w: 600 },
    { x: 19850, w: 500 },

    // WALL ZONE 3 — buracos grandes + muitas paredes
    { x: 20500, w: 500 },
    { x: 21100, w: 450 },
    { x: 21650, w: 500 },
    { x: 22250, w: 450 },
    { x: 22800, w: 550 },
    { x: 23450, w: 500 },
    { x: 24050, w: 550 },
    { x: 24700, w: 2000},
  ];

  groundSegments.forEach(({ x, w }) => {
    platforms.push({ x, y: GROUND_Y, w, h: GH, type: 'ground' });
  });

  // ── TRASH CAN OBSTACLES ────────────────────────────────────────

  const cans: Array<{ x: number }> = [
    // Wall zone 1
    { x: 3400 },
    { x: 4000 },
    { x: 5300 },
    { x: 6000 },
    { x: 6700 },

    // Free zone 2 — só lixeiras, sem paredes
    { x: 9000 },
    { x: 11200 },

    // Wall zone 2
    { x: 11900 },

    // Free zone 3 — só lixeiras, sem paredes

    // Wall zone 3
    { x: 20700 },
    { x: 22000 },
    { x: 22600 },
    { x: 23200 },
    { x: 23900 },
    { x: 24500 },
  ];

  cans.filter(({ x }) => !isNearWallBase(x, CAN_W)).forEach(({ x }) => {
    platforms.push({ x, y: GROUND_Y - CAN_H, w: CAN_W, h: CAN_H, type: 'obstacle' });
  });

  // ── FERRO VELHO (a partir de x:12100) ──────────────────────────
  // Carcaças de carro, pneus e caixas espalhados pelo cenário.
  // Todos removíveis pelo modo editor.

  const junkyardItems: Array<{
    x: number;
    type: 'car' | 'tire' | 'box';
    w: number;
    h: number;
    collisionW?: number;
    collisionH?: number;
    collisionOffsetX?: number;
    collisionOffsetY?: number;
    collisionBoxes?: { x: number; y: number; w: number; h: number; slopeTop?: { left: number; right: number } }[];
    cropLeft?: number;
    cropTop?: number;
    cropRight?: number;
    cropBottom?: number;
    yOffset?: number;
  }> = [
    // Ferro velho (x:12100-14500) — só carros e pneus
    { x: 12638, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 13230, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    // Ferro velho — extensão (x:14600-16850)
    { x: 14900, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15680, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 16400, type: 'car',  w: 445, h: 168, collisionBoxes: [{x:0,y:53,w:445,h:62},{x:80,y:10,w:69,h:43,slopeTop:{left:43,right:0}},{x:149,y:10,w:219,h:16},{x:368,y:10,w:69,h:43,slopeTop:{left:0,right:43}}] },
    // Free Zone 3 (começa após muro x:16900)
    { x: 17400, type: 'car',  w: 150, h: 65 },
    { x: 17700, type: 'box',  w: 65,  h: 55 },

    // Wall Zone 3
  ];

  junkyardItems.filter(({ x, w }) => !isNearWallBase(x, w)).forEach(({ x, type, w, h, collisionW: customCollisionW, collisionH: customCollisionH, collisionOffsetX: customCollisionOffsetX, collisionOffsetY: customCollisionOffsetY, collisionBoxes, cropLeft, cropTop, cropRight, cropBottom, yOffset }) => {
    if (type === 'car') {
      if (collisionBoxes && collisionBoxes.length > 0) {
        const y = yOffset !== undefined
          ? GROUND_Y - yOffset
          : (() => { const lb = collisionBoxes.reduce((a, b) => (a.y + a.h > b.y + b.h ? a : b)); return GROUND_Y - lb.y - lb.h; })();
        platforms.push({ x, y, w, h, type, collisionBoxes, cropLeft, cropTop, cropRight, cropBottom });
      } else {
        const collisionW = customCollisionW ?? Math.round(w * 0.82);
        const collisionH = customCollisionH ?? Math.round(h * 0.68);
        const collisionOffsetX = customCollisionOffsetX ?? Math.round((w - collisionW) / 2);
        const collisionOffsetY = customCollisionOffsetY ?? 0;
        const y = yOffset !== undefined ? GROUND_Y - yOffset : GROUND_Y - collisionOffsetY - collisionH;
        platforms.push({ x, y, w, h, type, collisionW, collisionH, collisionOffsetX, collisionOffsetY, cropLeft, cropTop, cropRight, cropBottom });
      }
      return;
    }

    const y = yOffset !== undefined ? GROUND_Y - yOffset : GROUND_Y - h;
    platforms.push({ x, y, w, h, type });
  });

  // ── PILHAS DE CAIXAS NO FERRO VELHO ─────────────────────────────
  // Caixas empilhadas — cada caixa tem h:55; a segunda fica em GY-110, a terceira em GY-165
  const GY = GROUND_Y;
  const BOX_H = 55;
  const BOX_W = 65;
  const junkyardBoxStacks: Platform[] = [
    // Pilha A — entrada (x:12375-12505)
    { x: 12505, y: GY - 55,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 110,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 165,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 220,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 277,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 332,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12375, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12375, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12375, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12375, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - 277,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12440, y: GY - 332,            w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 2 — entre o pneu e o segundo carro
    { x: 13100, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13165, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13100, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13165, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13100, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 3 — entre o segundo e o terceiro carro
    { x: 13800, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13865, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13930, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13800, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13865, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13930, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13800, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13865, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13930, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13800, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13865, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13930, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 4 — antes do 5º carro
    { x: 14710, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14775, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14840, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14710, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14775, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14710, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 5 — antes do 6º carro
    { x: 15510, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 15575, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 15510, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 15575, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 15510, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 6 — entre o 6º carro e o fim do ferro velho
    { x: 16150, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 16215, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 16280, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 16150, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 16215, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
  ];
  platforms.push(...junkyardBoxStacks);

  // ── PLATAFORMAS ELEVADAS (sacadas + ares-condicionados) ─────────
  // Sacadas:     y = GROUND_Y - 125, w = 115 → h=62, collisionH=85
  // ACs:         y = qualquer valor ≠ GY-125  → normalizado para AC_Y=GY-240, h=18
  // (array gerado a partir da Chave de Exportação do editor)
  const plats: Array<{ x: number; y: number; w: number }> = [
    // ── WALL ZONE 1 ──
    { x:  3500, y: GROUND_Y - 125, w: 115 },
    { x:  4350, y: GROUND_Y - 125, w: 115 },
    { x:  4800, y: GROUND_Y - 125, w: 115 },

    // ── FREE ZONE 2 ──
    { x:  7560, y: GROUND_Y - 125, w: 115 },
    { x:  7880, y: GROUND_Y - 125, w: 115 },

    { x:  8300, y: GROUND_Y - 125, w: 115 },
    { x:  8500, y: GROUND_Y -  55, w:  85 },  // AC
    { x:  8700, y: GROUND_Y - 125, w: 115 },

    { x:  9050, y: GROUND_Y - 125, w: 115 },
    { x:  9250, y: GROUND_Y -  55, w:  90 },  // AC
    { x:  9450, y: GROUND_Y - 125, w: 115 },

    { x:  9750, y: GROUND_Y - 125, w: 115 },
    { x:  9960, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 10180, y: GROUND_Y - 125, w: 115 },

    { x: 10500, y: GROUND_Y - 125, w: 115 },
    { x: 10710, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 10920, y: GROUND_Y - 125, w: 115 },
    { x: 11150, y: GROUND_Y -  55, w:  90 },  // AC

    // ── FREE ZONE 3 (após muro x:16900) ──
    { x: 17800, y: GROUND_Y - 125, w: 115 },
    { x: 17900, y: GROUND_Y -  55, w: 115 },  // AC (w largo)
    { x: 18000, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 18200, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 18400, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 18600, y: GROUND_Y - 125, w: 115 },

    { x: 18900, y: GROUND_Y - 125, w: 115 },
    { x: 19100, y: GROUND_Y -  55, w:  90 },  // AC
    { x: 19200, y: GROUND_Y -  55, w: 115 },  // AC (w largo)
    { x: 19320, y: GROUND_Y - 125, w: 115 },

    { x: 19620, y: GROUND_Y - 125, w: 115 },
    { x: 19840, y: GROUND_Y -  55, w:  85 },  // AC
    { x: 20060, y: GROUND_Y - 125, w: 115 },

    // ── WALL ZONE 3 ──
    { x: 21300, y: GROUND_Y - 125, w: 115 },
    { x: 21520, y: GROUND_Y -  55, w:  85 },  // AC

    { x: 22490, y: GROUND_Y - 125, w: 115 },

    { x: 24290, y: GROUND_Y - 125, w: 115 },
  ];

  // Altura uniforme para todos os ares-condicionados (AC_Y).
  // Altere somente este valor para subir/descer todos juntos.
  const AC_Y = GROUND_Y - 240;

  plats.filter(({ x, w }) => !isNearWallBase(x, w)).forEach(({ x, y, w }) => {
    // Sacadas (GY-125): h visual=62, collisionH=85 → fundo de colisão em GY-40.
    // Bloqueia em pé (PLAYER_H=50) mas libera rolando (PLAYER_ROLL_H=26).
    const isSacada = y === GROUND_Y - 125;
    const finalY      = isSacada ? y : AC_Y;
    const h           = isSacada ? 62 : 18;
    const collisionH  = isSacada ? 85 : undefined;
    platforms.push({ x, y: finalY, w, h, type: 'platform', ...(collisionH !== undefined ? { collisionH } : {}) });
  });

  // ── CLIMBABLE WALLS — SOMENTE dentro das WALL ZONES ──────────
  // Zonas livres têm ZERO paredes — essa é a alternância principal.

  walls.forEach(({ x, y, h }) => {
    platforms.push({ x, y, w: 20, h, type: 'wall', climbable: true });
  });

  return platforms;
}

export function generateWallTestLevel(): Platform[] {
  return [
    { x: -400, y: GROUND_Y, w: 2600, h: GH, type: 'ground' },
    { x: 760,  y: GROUND_Y - 280, w: 20,  h: 280, type: 'wall',     climbable: true },
    { x: 920,  y: GROUND_Y - 150, w: 160, h: 18,  type: 'platform', climbable: false },
  ];
}

export interface BuildingDef {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'far' | 'mid' | 'near';
  windows: Array<{ cx: number; cy: number; lit: boolean; color: string }>;
  hasAntenna: boolean;
  hasPipe: boolean;
  graffitiColor: string | null;
}

const NEON_COLORS = [
  'rgba(255,60,20,0.20)',
  'rgba(255,120,0,0.16)',
  'rgba(200,40,10,0.18)',
  'rgba(255,190,80,0.13)',
];

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateBuildings(): BuildingDef[] {
  const buildings: BuildingDef[] = [];
  const rand = rng(42);

  let bx = -200;
  while (bx < 26000) {
    const bw = 80 + Math.floor(rand() * 180);
    const bh = 120 + Math.floor(rand() * 260);
    const by = CANVAS_H - 80 - bh;
    const numW = Math.floor(bw / 22);
    const numH = Math.floor(bh / 30);
    const windows = [];
    for (let wi = 0; wi < numW; wi++) {
      for (let hi = 0; hi < numH; hi++) {
        const lit = rand() < 0.18;
        const color = NEON_COLORS[Math.floor(rand() * NEON_COLORS.length)];
        windows.push({ cx: 10 + wi * 22, cy: 10 + hi * 28, lit, color });
      }
    }
    buildings.push({
      x: bx, y: by, w: bw, h: bh, layer: 'far',
      windows, hasAntenna: rand() < 0.3, hasPipe: false, graffitiColor: null,
    });
    bx += bw + 4 + Math.floor(rand() * 30);
  }

  bx = -100;
  while (bx < 26000) {
    const bw = 60 + Math.floor(rand() * 140);
    const bh = 80 + Math.floor(rand() * 200);
    const by = CANVAS_H - 90 - bh;
    const numW = Math.floor(bw / 18);
    const numH = Math.floor(bh / 26);
    const windows = [];
    for (let wi = 0; wi < numW; wi++) {
      for (let hi = 0; hi < numH; hi++) {
        const lit = rand() < 0.22;
        const color = NEON_COLORS[Math.floor(rand() * NEON_COLORS.length)];
        windows.push({ cx: 8 + wi * 18, cy: 8 + hi * 24, lit, color });
      }
    }
    const grafColors = ['rgba(255,60,60,0.25)', 'rgba(0,200,255,0.2)', 'rgba(180,60,255,0.2)', null, null, null];
    buildings.push({
      x: bx, y: by, w: bw, h: bh, layer: 'mid',
      windows, hasAntenna: rand() < 0.4, hasPipe: rand() < 0.35,
      graffitiColor: grafColors[Math.floor(rand() * grafColors.length)],
    });
    bx += bw + 2 + Math.floor(rand() * 20);
  }

  return buildings;
}
