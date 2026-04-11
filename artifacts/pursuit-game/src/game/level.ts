import type { Platform } from './types';
import { GROUND_Y, CANVAS_H, CANVAS_W } from './constants';

const GH = 30;
const CAN_W = 90;  // wide — same visual weight as platforms
const CAN_H = 58;

export function generateLevel(): Platform[] {
  const platforms: Platform[] = [];

  // --- Ground segments ---
  // Zone 1 (0–2200): completely flat, no gaps — pure sprint chase
  // Zone 2 (2200–5500): first trash cans + small gaps
  // Zone 3 (5500+): parkour, big gaps, walls
  const groundSegments: Array<{ x: number; w: number }> = [
    // Zone 1 — long flat runway, no interruption
    { x: -400, w: 2800 },

    // Zone 2 — mostly solid, first gaps
    { x: 2500, w: 900  },
    { x: 3500, w: 700  },
    { x: 4300, w: 600  },
    { x: 5000, w: 400  },

    // Zone 3 — gaps get bigger
    { x: 5500, w: 350  },
    { x: 5950, w: 400  },
    { x: 6450, w: 300  },
    { x: 6850, w: 600  },
    { x: 7600, w: 350  },
    { x: 8100, w: 600  },
    { x: 8800, w: 400  },
    { x: 9300, w: 300  },
    { x: 9700, w: 700  },
    { x: 10500, w: 2000 },
  ];

  groundSegments.forEach(({ x, w }) => {
    platforms.push({ x, y: GROUND_Y, w, h: GH, type: 'ground' });
  });

  // --- Trash can obstacles — wide, sparse, introduced gradually ---
  // First one appears well into Zone 2 so the early game is pure sprint
  const cans: Array<{ x: number }> = [
    { x: 2700 },   // first can — lone, easy to spot
    { x: 3300 },   // second — spaced out
    { x: 3900 },   // third
    { x: 4600 },   // fourth
    { x: 5100 },   // fifth — near first gap
    // Zone 3: a few more scattered in parkour sections
    { x: 6000 },
    { x: 7200 },
    { x: 8400 },
  ];

  cans.forEach(({ x }) => {
    platforms.push({
      x,
      y: GROUND_Y - CAN_H,
      w: CAN_W,
      h: CAN_H,
      type: 'obstacle',
    });
  });

  // --- Elevated platforms (Zone 2 onward) ---
  const plats: Array<{ x: number; y: number; w: number }> = [
    // Zone 2 intro — low platforms, easy
    { x: 3700, y: GROUND_Y - 80,  w: 120 },
    { x: 3900, y: GROUND_Y - 140, w: 100 },
    { x: 4110, y: GROUND_Y - 80,  w: 90  },

    { x: 4350, y: GROUND_Y - 100, w: 120 },
    { x: 4560, y: GROUND_Y - 170, w: 90  },
    { x: 4730, y: GROUND_Y - 90,  w: 100 },

    { x: 5000, y: GROUND_Y - 110, w: 120 },
    { x: 5180, y: GROUND_Y - 200, w: 90  },
    { x: 5360, y: GROUND_Y - 120, w: 100 },

    // Staircase zone
    { x: 5700, y: GROUND_Y - 80,  w: 80  },
    { x: 5840, y: GROUND_Y - 160, w: 80  },
    { x: 5980, y: GROUND_Y - 240, w: 80  },
    { x: 6130, y: GROUND_Y - 160, w: 80  },
    { x: 6270, y: GROUND_Y - 80,  w: 80  },

    // Zone 3 — high parkour
    { x: 6650, y: GROUND_Y - 130, w: 100 },
    { x: 6830, y: GROUND_Y - 220, w: 90  },
    { x: 7010, y: GROUND_Y - 310, w: 120 },
    { x: 7210, y: GROUND_Y - 230, w: 90  },
    { x: 7380, y: GROUND_Y - 140, w: 100 },

    { x: 7600, y: GROUND_Y - 100, w: 120 },
    { x: 7780, y: GROUND_Y - 190, w: 90  },
    { x: 7960, y: GROUND_Y - 280, w: 100 },

    { x: 8100, y: GROUND_Y - 200, w: 90  },
    { x: 8280, y: GROUND_Y - 120, w: 120 },

    { x: 8650, y: GROUND_Y - 90,  w: 120 },
    { x: 8840, y: GROUND_Y - 180, w: 100 },
    { x: 9020, y: GROUND_Y - 100, w: 90  },

    { x: 9300, y: GROUND_Y - 130, w: 100 },
    { x: 9480, y: GROUND_Y - 220, w: 80  },
    { x: 9650, y: GROUND_Y - 140, w: 100 },
    { x: 9850, y: GROUND_Y - 80,  w: 120 },
    { x: 10050, y: GROUND_Y - 170, w: 90  },
    { x: 10230, y: GROUND_Y - 90,  w: 120 },
  ];

  plats.forEach(({ x, y, w }) => {
    platforms.push({ x, y, w, h: 18, type: 'platform' });
  });

  // --- Climbable walls — Zone 2 onward only ---
  const walls: Array<{ x: number; y: number; h: number }> = [
    // Zone 2 — first walls, sparse
    { x: 4180, y: GROUND_Y - 180, h: 180 },
    { x: 5060, y: GROUND_Y - 200, h: 200 },
    { x: 5560, y: GROUND_Y - 220, h: 220 },

    // Zone 3 — more walls
    { x: 6900, y: GROUND_Y - 260, h: 260 },
    { x: 7450, y: GROUND_Y - 240, h: 240 },
    { x: 8020, y: GROUND_Y - 300, h: 300 },
    { x: 8700, y: GROUND_Y - 220, h: 220 },
    { x: 9200, y: GROUND_Y - 240, h: 240 },
    { x: 9700, y: GROUND_Y - 260, h: 260 },
    { x: 10100, y: GROUND_Y - 200, h: 200 },
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
  while (bx < 11500) {
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
  while (bx < 11500) {
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
