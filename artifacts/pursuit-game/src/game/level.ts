import type { Platform } from './types';
import { GROUND_Y, CANVAS_H, CANVAS_W } from './constants';

const GH = 30;
const CAN_W = 90;
const CAN_H = 58;

// ──────────────────────────────────────────────────────────────────
//  LEVEL DESIGN — alternating pattern:
//
//  FREE ZONE 1  (x: -400 → 2500)  sprint runway, zero walls
//  WALL ZONE 1  (x: 2500 → 5600)  gaps + cans + platforms + ≥3 walls
//  FREE ZONE 2  (x: 5600 → 7700)  gaps + cans + platforms, NO walls
//  WALL ZONE 2  (x: 7700 → 10400) bigger gaps + cans + platforms + ≥3 walls
//  FREE ZONE 3  (x:10400 →12200)  gaps + cans + platforms, NO walls
//  WALL ZONE 3  (x:12200 →14600+) large gaps + cans + platforms + ≥3 walls
// ──────────────────────────────────────────────────────────────────

export function generateLevel(): Platform[] {
  const platforms: Platform[] = [];

  // ── GROUND SEGMENTS ────────────────────────────────────────────

  const groundSegments: Array<{ x: number; w: number }> = [
    // FREE ZONE 1 — continuous flat runway, no interruption
    { x: -400, w: 3000 },   // -400 → 2600

    // WALL ZONE 1 — first gaps appear
    { x: 2700, w: 800  },   // 2700 → 3500
    { x: 3600, w: 700  },   // 3600 → 4300
    { x: 4400, w: 600  },   // 4400 → 5000
    { x: 5100, w: 450  },   // 5100 → 5550

    // FREE ZONE 2 — moderate gaps, no walls
    { x: 5700, w: 550  },   // 5700 → 6250
    { x: 6350, w: 450  },   // 6350 → 6800
    { x: 6900, w: 550  },   // 6900 → 7450
    { x: 7550, w: 200  },   // 7550 → 7750

    // WALL ZONE 2 — bigger gaps
    { x: 7900, w: 400  },   // 7900 → 8300
    { x: 8400, w: 450  },   // 8400 → 8850
    { x: 8950, w: 380  },   // 8950 → 9330
    { x: 9430, w: 370  },   // 9430 → 9800
    { x: 9900, w: 500  },   // 9900 → 10400

    // FREE ZONE 3 — moderate gaps, no walls
    { x: 10500, w: 550 },   // 10500 → 11050
    { x: 11150, w: 480 },   // 11150 → 11630
    { x: 11730, w: 450 },   // 11730 → 12180

    // WALL ZONE 3 — largest gaps
    { x: 12280, w: 350 },   // 12280 → 12630
    { x: 12730, w: 380 },   // 12730 → 13110
    { x: 13200, w: 360 },   // 13200 → 13560
    { x: 13660, w: 560 },   // 13660 → 14220
    { x: 14320, w: 2000},   // 14320+ long tail
  ];

  groundSegments.forEach(({ x, w }) => {
    platforms.push({ x, y: GROUND_Y, w, h: GH, type: 'ground' });
  });

  // ── TRASH CAN OBSTACLES ────────────────────────────────────────
  // (present in both zone types; walls only in WALL zones)

  const cans: Array<{ x: number }> = [
    // Wall zone 1
    { x: 2850 },
    { x: 3400 },
    { x: 4150 },
    { x: 4700 },
    { x: 5200 },

    // Free zone 2 — obstacles without walls
    { x: 5900 },
    { x: 6550 },
    { x: 7050 },

    // Wall zone 2
    { x: 8050 },
    { x: 8600 },
    { x: 9100 },
    { x: 9650 },

    // Free zone 3 — obstacles without walls
    { x: 10650 },
    { x: 11300 },
    { x: 11900 },

    // Wall zone 3
    { x: 12450 },
    { x: 13000 },
    { x: 13550 },
    { x: 14050 },
  ];

  cans.forEach(({ x }) => {
    platforms.push({ x, y: GROUND_Y - CAN_H, w: CAN_W, h: CAN_H, type: 'obstacle' });
  });

  // ── ELEVATED PLATFORMS ─────────────────────────────────────────

  const plats: Array<{ x: number; y: number; w: number }> = [
    // ── WALL ZONE 1 platforms ──
    { x: 3650, y: GROUND_Y - 85,  w: 110 },
    { x: 3850, y: GROUND_Y - 155, w: 95  },
    { x: 4070, y: GROUND_Y - 85,  w: 85  },

    { x: 4420, y: GROUND_Y - 105, w: 115 },
    { x: 4620, y: GROUND_Y - 180, w: 85  },
    { x: 4800, y: GROUND_Y - 95,  w: 95  },

    { x: 5120, y: GROUND_Y - 120, w: 110 },
    { x: 5300, y: GROUND_Y - 200, w: 85  },

    // ── FREE ZONE 2 platforms (NO walls nearby) ──
    // Staircase climb — pure platforming, no walls to grab
    { x: 5750, y: GROUND_Y - 80,  w: 85  },
    { x: 5890, y: GROUND_Y - 165, w: 85  },
    { x: 6040, y: GROUND_Y - 250, w: 85  },
    { x: 6190, y: GROUND_Y - 165, w: 85  },
    { x: 6340, y: GROUND_Y - 80,  w: 85  },

    // Open parkour run
    { x: 6700, y: GROUND_Y - 120, w: 100 },
    { x: 6900, y: GROUND_Y - 215, w: 85  },
    { x: 7100, y: GROUND_Y - 130, w: 100 },
    { x: 7300, y: GROUND_Y - 90,  w: 110 },

    // ── WALL ZONE 2 platforms ──
    { x: 7950, y: GROUND_Y - 110, w: 110 },
    { x: 8130, y: GROUND_Y - 200, w: 90  },
    { x: 8320, y: GROUND_Y - 115, w: 100 },

    { x: 8530, y: GROUND_Y - 130, w: 90  },
    { x: 8710, y: GROUND_Y - 225, w: 85  },
    { x: 8900, y: GROUND_Y - 130, w: 95  },

    { x: 9080, y: GROUND_Y - 100, w: 115 },
    { x: 9280, y: GROUND_Y - 195, w: 85  },

    { x: 9480, y: GROUND_Y - 120, w: 100 },
    { x: 9660, y: GROUND_Y - 215, w: 85  },
    { x: 9850, y: GROUND_Y - 110, w: 110 },
    { x: 10050, y: GROUND_Y - 180, w: 90 },
    { x: 10230, y: GROUND_Y - 95,  w: 120},

    // ── FREE ZONE 3 platforms (NO walls nearby) ──
    // Open high-speed platforming gaps
    { x: 10550, y: GROUND_Y - 90,  w: 110 },
    { x: 10750, y: GROUND_Y - 185, w: 90  },
    { x: 10940, y: GROUND_Y - 95,  w: 110 },
    { x: 11160, y: GROUND_Y - 145, w: 95  },
    { x: 11350, y: GROUND_Y - 235, w: 85  },
    { x: 11540, y: GROUND_Y - 140, w: 95  },
    { x: 11740, y: GROUND_Y - 85,  w: 110 },
    { x: 11930, y: GROUND_Y - 175, w: 90  },

    // ── WALL ZONE 3 platforms ──
    { x: 12330, y: GROUND_Y - 115, w: 100 },
    { x: 12520, y: GROUND_Y - 220, w: 85  },
    { x: 12700, y: GROUND_Y - 130, w: 100 },

    { x: 12900, y: GROUND_Y - 100, w: 110 },
    { x: 13090, y: GROUND_Y - 210, w: 90  },
    { x: 13280, y: GROUND_Y - 115, w: 100 },

    { x: 13480, y: GROUND_Y - 140, w: 95  },
    { x: 13680, y: GROUND_Y - 250, w: 85  },
    { x: 13880, y: GROUND_Y - 135, w: 100 },
    { x: 14080, y: GROUND_Y - 95,  w: 115 },
    { x: 14280, y: GROUND_Y - 185, w: 90  },
  ];

  plats.forEach(({ x, y, w }) => {
    platforms.push({ x, y, w, h: 18, type: 'platform' });
  });

  // ── CLIMBABLE WALLS — only inside WALL ZONES ──────────────────
  // FREE zones have zero walls — that's the key alternation.

  const walls: Array<{ x: number; y: number; h: number }> = [
    // WALL ZONE 1 — 3 walls introduced gradually
    { x: 3880, y: GROUND_Y - 185, h: 185 },
    { x: 4820, y: GROUND_Y - 210, h: 210 },
    { x: 5330, y: GROUND_Y - 230, h: 230 },

    // WALL ZONE 2 — 4 walls, taller, closer together
    { x: 8170, y: GROUND_Y - 250, h: 250 },
    { x: 8760, y: GROUND_Y - 270, h: 270 },
    { x: 9310, y: GROUND_Y - 255, h: 255 },
    { x: 10080, y: GROUND_Y - 240, h: 240 },

    // WALL ZONE 3 — 4 walls, tallest and tightest spacing
    { x: 12560, y: GROUND_Y - 290, h: 290 },
    { x: 13130, y: GROUND_Y - 310, h: 310 },
    { x: 13720, y: GROUND_Y - 280, h: 280 },
    { x: 14130, y: GROUND_Y - 300, h: 300 },
  ];

  walls.forEach(({ x, y, h }) => {
    platforms.push({ x, y, w: 20, h, type: 'wall', climbable: true });
  });

  return platforms;
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
  while (bx < 15000) {
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
  while (bx < 15000) {
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
