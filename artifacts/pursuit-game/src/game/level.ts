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
    { x: 14500, y: GROUND_Y - 400, h: 400 },
    { x: 15200, y: GROUND_Y - 250, h: 250 },

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
    // Ferro velho (x:12100-14500): chão contínuo, sem buracos
    { x: 12250, w: 2290 },  // 12250 → 14540 (cobre toda a zona do ferro velho)
    { x: 14750, w: 500 },
    { x: 15350, w: 600 },

    // FREE ZONE 3 — buracos moderados, ZERO paredes
    { x: 16100, w: 700 },
    { x: 16900, w: 650 },
    { x: 17650, w: 600 },
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
    { x: 13200 },
    { x: 14400 },
    { x: 15100 },

    // Free zone 3 — só lixeiras, sem paredes
    { x: 20000 },

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

  const junkyardItems: Array<{ x: number; type: 'car' | 'tire' | 'box'; w: number; h: number }> = [
    // Ferro velho (x:12100-14500) — só carros e pneus
    { x: 12500, type: 'car',  w: 313, h: 107 },
    { x: 13050, type: 'tire', w: 45,  h: 95 },
    { x: 13650, type: 'car',  w: 150, h: 65 },
    { x: 14000, type: 'tire', w: 45,  h: 95 },
    { x: 15850, type: 'tire', w: 45,  h: 95 },

    // Free Zone 3
    { x: 16250, type: 'car',  w: 150, h: 65 },
    { x: 16520, type: 'box',  w: 65,  h: 55 },
    { x: 16620, type: 'box',  w: 65,  h: 55 },
    { x: 17100, type: 'tire', w: 45,  h: 95 },
    { x: 17400, type: 'car',  w: 150, h: 65 },
    { x: 17700, type: 'box',  w: 65,  h: 55 },
    { x: 18100, type: 'tire', w: 45,  h: 95 },
    { x: 18600, type: 'car',  w: 150, h: 65 },
    { x: 19100, type: 'box',  w: 65,  h: 110 },
    { x: 19700, type: 'tire', w: 45,  h: 95 },

    // Wall Zone 3
    { x: 20200, type: 'car',  w: 150, h: 65 },
    { x: 20400, type: 'tire', w: 45,  h: 95 },
    { x: 21200, type: 'car',  w: 150, h: 65 },
    { x: 21600, type: 'box',  w: 65,  h: 55 },
    { x: 22400, type: 'car',  w: 150, h: 65 },
    { x: 22600, type: 'tire', w: 45,  h: 95 },
    { x: 23400, type: 'car',  w: 150, h: 65 },
    { x: 24350, type: 'box',  w: 65,  h: 110 },
    { x: 24700, type: 'tire', w: 45,  h: 95 },
  ];

  junkyardItems.filter(({ x, w }) => !isNearWallBase(x, w)).forEach(({ x, type, w, h }) => {
    platforms.push({ x, y: GROUND_Y - h, w, h, type });
  });

  // ── ELEVATED PLATFORMS ─────────────────────────────────────────

  // ── ROLL-UNDER BALCONIES — low enough to need roll, jumpable on top ──
  // y = GROUND_Y - 55 → bottom at GROUND_Y - 37 → clearance 37px
  // Player standing h=50 > 37 → blocked;  roll h=26 < 37 → passes
  const rollUnderBalconies: Array<{ x: number; y: number; w: number }> = [
    // Wall Zone 1
    { x: 3800, y: GROUND_Y - 55, w: 110 },
    { x: 5050, y: GROUND_Y - 55, w: 110 },
    { x: 6200, y: GROUND_Y - 55, w: 110 },

    // Wall Zone 2
    { x: 11850, y: GROUND_Y - 55, w: 110 },
    { x: 14700, y: GROUND_Y - 55, w: 110 },

    // Free Zone 3
    { x: 17900, y: GROUND_Y - 55, w: 115 },
    { x: 19200, y: GROUND_Y - 55, w: 115 },

    // Wall Zone 3
    { x: 20750, y: GROUND_Y - 55, w: 110 },
    { x: 22150, y: GROUND_Y - 55, w: 110 },
    { x: 23700, y: GROUND_Y - 55, w: 110 },
  ];

  const plats: Array<{ x: number; y: number; w: number }> = [
    ...rollUnderBalconies,

    // ── WALL ZONE 1 ──
    { x: 3500, y: GROUND_Y - 125, w: 115 },
    { x: 3700, y: GROUND_Y - 165, w: 95  },
    { x: 3920, y: GROUND_Y - 125, w: 115 },

    { x: 4350, y: GROUND_Y - 125, w: 115 },
    { x: 4800, y: GROUND_Y - 125, w: 115 },

    { x: 5200, y: GROUND_Y - 125, w: 115 },
    { x: 5640, y: GROUND_Y - 125, w: 115 },

    { x: 5980, y: GROUND_Y - 125, w: 115 },
    { x: 6200, y: GROUND_Y - 185, w: 85  },
    { x: 6420, y: GROUND_Y - 125, w: 115 },

    // ── FREE ZONE 2 — escadaria aberta e parkour sem paredes ──
    { x: 7560, y: GROUND_Y - 125, w: 115 },
    { x: 7880, y: GROUND_Y - 125, w: 115 },

    { x: 8300, y: GROUND_Y - 125, w: 115 },
    { x: 8500, y: GROUND_Y - 215, w: 85  },
    { x: 8700, y: GROUND_Y - 125, w: 115 },

    { x: 9050, y: GROUND_Y - 125, w: 115 },
    { x: 9250, y: GROUND_Y - 195, w: 90  },
    { x: 9450, y: GROUND_Y - 125, w: 115 },

    { x: 9750, y: GROUND_Y - 125, w: 115 },
    { x: 9960, y: GROUND_Y - 210, w: 90  },
    { x: 10180, y: GROUND_Y - 125, w: 115 },

    { x: 10500, y: GROUND_Y - 125, w: 115 },
    { x: 10710, y: GROUND_Y - 175, w: 90  },
    { x: 10920, y: GROUND_Y - 125, w: 115 },
    { x: 11150, y: GROUND_Y - 160, w: 90  },

    // ── WALL ZONE 2 ──
    { x: 11800, y: GROUND_Y - 125, w: 115 },
    { x: 12020, y: GROUND_Y - 210, w: 90  },
    // x:12100-14500 = ferro velho: sem sacadas, sem ACs, sem tijolos
    { x: 14620, y: GROUND_Y - 125, w: 115 },
    { x: 14840, y: GROUND_Y - 215, w: 90  },
    { x: 15060, y: GROUND_Y - 125, w: 115 },

    // ── FREE ZONE 3 — parkour rápido, sem paredes ──
    { x: 16200, y: GROUND_Y - 125, w: 115 },
    { x: 16400, y: GROUND_Y - 180, w: 90  },
    { x: 16600, y: GROUND_Y - 270, w: 90  },
    { x: 16800, y: GROUND_Y - 180, w: 90  },
    { x: 17000, y: GROUND_Y - 125, w: 115 },

    { x: 17300, y: GROUND_Y - 125, w: 115 },
    { x: 17520, y: GROUND_Y - 220, w: 85  },
    { x: 17740, y: GROUND_Y - 125, w: 115 },

    { x: 18050, y: GROUND_Y - 125, w: 115 },
    { x: 18270, y: GROUND_Y - 200, w: 90  },
    { x: 18490, y: GROUND_Y - 125, w: 115 },

    { x: 18800, y: GROUND_Y - 125, w: 115 },
    { x: 19020, y: GROUND_Y - 215, w: 85  },
    { x: 19240, y: GROUND_Y - 125, w: 115 },

    { x: 19550, y: GROUND_Y - 125, w: 115 },
    { x: 19770, y: GROUND_Y - 185, w: 90  },

    // ── WALL ZONE 3 ──
    { x: 20600, y: GROUND_Y - 125, w: 115 },
    { x: 20820, y: GROUND_Y - 240, w: 90  },
    { x: 21040, y: GROUND_Y - 125, w: 115 },

    { x: 21300, y: GROUND_Y - 125, w: 115 },
    { x: 21520, y: GROUND_Y - 230, w: 85  },
    { x: 21740, y: GROUND_Y - 125, w: 115 },

    { x: 22050, y: GROUND_Y - 125, w: 115 },
    { x: 22270, y: GROUND_Y - 260, w: 85  },
    { x: 22490, y: GROUND_Y - 125, w: 115 },

    { x: 22800, y: GROUND_Y - 125, w: 115 },
    { x: 23020, y: GROUND_Y - 245, w: 85  },
    { x: 23240, y: GROUND_Y - 125, w: 115 },

    { x: 23600, y: GROUND_Y - 125, w: 115 },
    { x: 23830, y: GROUND_Y - 225, w: 90  },
    { x: 24060, y: GROUND_Y - 125, w: 115 },
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
