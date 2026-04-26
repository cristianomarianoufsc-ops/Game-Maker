import type { Platform } from './types';
import { GROUND_Y, CANVAS_H, CANVAS_W } from './constants';
import abandonedCarSpriteUrl from '@assets/carro_abandonado_pixelart_1776652992846.png';

const GH = 30;
const CAN_W = 90;
const CAN_H = 58;

const WALL_CLEAR_BEFORE = 420;
const WALL_CLEAR_AFTER = 180;

// Constantes da escada de incêndio (compartilhadas com physics.ts)
export const FIRE_ESCAPE = {
  PLAT_X: 21945,
  PLAT_W: 370,
  PLAT_H: 18,
  WALL_X: 22100,
  WALL_W: 60,
  FLOOR_HEIGHTS: [120, 270, 420, 570, 720, 870, 1020, 1170, 1320] as const,
};
export const FIRE_ESCAPE_TOP_FLOOR_H = FIRE_ESCAPE.FLOOR_HEIGHTS[FIRE_ESCAPE.FLOOR_HEIGHTS.length - 1];

// Prédios idênticos enfileirados, cada um deslocado 880px (largura 820 + 60px de respiro)
export const FIRE_ESCAPE_OFFSET_2 = 880;
export const FIRE_ESCAPE_OFFSET_3 = 1760;
export const FIRE_ESCAPE_2 = {
  PLAT_X: FIRE_ESCAPE.PLAT_X + FIRE_ESCAPE_OFFSET_2,
  PLAT_W: FIRE_ESCAPE.PLAT_W,
  PLAT_H: FIRE_ESCAPE.PLAT_H,
  WALL_X: FIRE_ESCAPE.WALL_X + FIRE_ESCAPE_OFFSET_2,
  WALL_W: FIRE_ESCAPE.WALL_W,
  FLOOR_HEIGHTS: FIRE_ESCAPE.FLOOR_HEIGHTS,
};
export const FIRE_ESCAPE_3 = {
  PLAT_X: FIRE_ESCAPE.PLAT_X + FIRE_ESCAPE_OFFSET_3,
  PLAT_W: FIRE_ESCAPE.PLAT_W,
  PLAT_H: FIRE_ESCAPE.PLAT_H,
  WALL_X: FIRE_ESCAPE.WALL_X + FIRE_ESCAPE_OFFSET_3,
  WALL_W: FIRE_ESCAPE.WALL_W,
  FLOOR_HEIGHTS: FIRE_ESCAPE.FLOOR_HEIGHTS,
};
export const FIRE_ESCAPES = [FIRE_ESCAPE, FIRE_ESCAPE_2, FIRE_ESCAPE_3];

// ── RIO COM TOCOS DE MADEIRA (depois do terceiro prédio) ───────────
// Trecho atravessado SOMENTE pulando entre tocos. Cair = morte por queda.
export const RIVER = {
  X1: 24820,        // borda esquerda do rio (fim da margem esquerda)
  X2: 25750,        // borda direita do rio (início da margem direita)
  STUMP_W: 60,
  STUMP_TOP_H: 18,  // altura da hitbox em cima do toco (a parte que dá pra pisar)
  STUMP_RISE: 22,   // quanto o topo do toco fica acima do nível do chão
  // Centros dos tocos (gap ~140px entre tocos — pulo médio)
  STUMPS_X: [24960, 25160, 25360, 25560] as const,
};

// ──────────────────────────────────────────────────────────────────
//  ALTERNAÇÃO DE ZONAS:
//
//  FREE ZONE 1   x: -400  →  3000   sprint livre, zero paredes
//  WALL ZONE 1   x: 3000  →  7200   paredes (≥3), buracos, lixeiras, plataformas
//  FREE ZONE 2   x: 7200  → 11500   ZERO paredes — buracos + lixeiras + plataformas
//  WALL ZONE 2   x:11500  → 21700   paredes (≥3), ferro velho (x:12100-21700, dobrado)
//  FREE ZONE 3   x:21700  → 22100   terreno livre entre os muros
//  WALL ZONE 3   x:22100  → 25000   paredes (≥4), buracos grandes, parkour difícil
// ──────────────────────────────────────────────────────────────────

export function generateLevel(): Platform[] {
  const platforms: Platform[] = [];

  const walls: Array<{ x: number; y: number; h: number }> = [
    { x: 4050, y: GROUND_Y - 195, h: 195 },
    { x: 5500, y: GROUND_Y - 215, h: 215 },
    { x: 6500, y: GROUND_Y - 235, h: 235 },

    { x: 12100, y: GROUND_Y - 400, h: 400 },
    { x: 21700, y: GROUND_Y - 400, h: 400 },

    { x: 23100, y: GROUND_Y - 310, h: 310 },
    { x: 24100, y: GROUND_Y - 290, h: 290 },
  ];

  const isNearWallBase = (x: number, w: number): boolean =>
    walls.some((wall) => x < wall.x + WALL_CLEAR_AFTER && x + w > wall.x - WALL_CLEAR_BEFORE);

  // ── GROUND SEGMENTS ────────────────────────────────────────────

  // Chão contínuo dos dois lados do rio. Buracos agora são objetos `pothole`
  // editáveis (criar/duplicar/deletar pelo editor de fase) que "anulam" o chão
  // dentro de seu range X (resolução em physics.ts).
  const groundSegments: Array<{ x: number; w: number }> = [
    { x: -400, w: RIVER.X1 - (-400) },          // -400 → 24820 (margem esquerda do rio)
    { x: RIVER.X2, w: 30664 - RIVER.X2 },       // 25750 → 30664 (margem direita + reta longa)
  ];

  groundSegments.forEach(({ x, w }) => {
    platforms.push({ x, y: GROUND_Y, w, h: GH, type: 'ground' });
  });

  // Buracos de bueiro padrão (substituem os antigos gaps no chão).
  // Largura/posição mantidas iguais aos gaps originais para preservar o level design.
  // Estes objetos são adicionados ao array de plataformas e podem ser editados
  // (movidos, duplicados ou deletados) pelo editor de fase como qualquer objeto.
  const POTHOLE_H = 14;
  const defaultPotholes: Array<{ x: number; w: number }> = [
    { x: 3100, w: 100 },   // WALL ZONE 1
    { x: 4100, w: 100 },
    { x: 5000, w: 100 },
    { x: 5800, w: 100 },
    { x: 6500, w: 100 },
    { x: 7100, w: 200 },   // FREE ZONE 2
    { x: 8000, w: 100 },
    { x: 8750, w: 100 },
    { x: 9450, w: 100 },
    { x: 10250, w: 100 },
    { x: 10950, w: 100 },
    { x: 11550, w: 150 },  // WALL ZONE 2 (entrada)
    { x: 22700, w: 100 },  // WALL ZONE 3
    { x: 23350, w: 100 },
    { x: 23950, w: 100 },
  ];
  defaultPotholes.forEach(({ x, w }) => {
    platforms.push({ x, y: GROUND_Y, w, h: POTHOLE_H, type: 'pothole' });
  });

  // ── TOCOS DE MADEIRA NO RIO ────────────────────────────────────
  // Plataformas com hitbox só no topo (18px), mas o sprite desce mais fundo
  // pra parecer enterrado na água. Render é feito em drawRiver() (render.ts).
  RIVER.STUMPS_X.forEach((stumpX) => {
    platforms.push({
      x: stumpX,
      y: GROUND_Y - RIVER.STUMP_RISE, // topo do toco um pouco acima do chão
      w: RIVER.STUMP_W,
      h: 80 + RIVER.STUMP_RISE,       // parte visível submersa (renderizada pelo drawRiver)
      type: 'platform',
      hideRender: true,
      isRiverStump: true,
      collisionBoxes: [{ x: 0, y: 0, w: RIVER.STUMP_W, h: RIVER.STUMP_TOP_H }],
    });
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

    // Wall zone 3 (começa após x:21700)
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
    { x: 12795, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 13529, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    // Ferro velho — extensão (x:14600-16850)
    { x: 14376, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 14615, type: 'car',  w: 445, h: 164, yOffset: 194, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 14821, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 14889, type: 'car',  w: 445, h: 164, yOffset: 283, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15076, type: 'car',  w: 445, h: 164, yOffset: 186, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15148, type: 'car',  w: 445, h: 164, yOffset: 375, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15260, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15334, type: 'car',  w: 445, h: 164, yOffset: 283, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15521, type: 'car',  w: 445, h: 164, yOffset: 186, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
    { x: 15705, type: 'car',  w: 445, h: 164, yOffset: 102, collisionBoxes: [{x:0,y:52,w:445,h:50},{x:130,y:10,w:69,h:42,slopeTop:{left:42,right:0}},{x:207,y:5,w:104,h:13},{x:327,y:10,w:69,h:42,slopeTop:{left:0,right:42}}], cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 62 },
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
    // Pilha A — entrada (x:12440-12570)
    { x: 12505, y: GY - 55,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 110,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 165,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 220,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12505, y: GY - 277,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 55,             w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 110,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 165,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 220,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 277,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 332,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 387,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 442,            w: BOX_W, h: BOX_H, type: 'box' },
    { x: 12570, y: GY - 497,            w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 2 — entre o pneu e o segundo carro
    { x: 13355, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13420, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13355, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13420, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 13355, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },

    // Pilha 3 — entre o segundo e o terceiro carro
    { x: 14107, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14172, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14237, y: GY - BOX_H,         w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14107, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14172, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14237, y: GY - BOX_H * 2,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14107, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14172, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14237, y: GY - BOX_H * 3,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14107, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14172, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14237, y: GY - BOX_H * 4,     w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14107, y: GY - 277,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14172, y: GY - 277,           w: BOX_W, h: BOX_H, type: 'box' },
    { x: 14237, y: GY - 277,           w: BOX_W, h: BOX_H, type: 'box' },

  ];
  platforms.push(...junkyardBoxStacks);

  // ── PILHAS DE PNEUS REFÚGIO (CP3 em diante) ─────────────────────
  // Horácio passa por trás delas; tiros do drone quebram a pilha em 4 pneus rolando.
  const tireHideouts: Platform[] = [
    { x: 16186, y: GROUND_Y - 104, w: 90, h: 113, type: 'tireHideout' },
    { x: 16276, y: GROUND_Y - 104, w: 90, h: 113, type: 'tireHideout' },
    { x: 16366, y: GROUND_Y - 104, w: 90, h: 113, type: 'tireHideout' },
    { x: 17885, y: GROUND_Y - 116, w: 90, h: 116, type: 'tireHideout' },
    { x: 18640, y: GROUND_Y - 116, w: 90, h: 116, type: 'tireHideout' },
    { x: 19485, y: GROUND_Y - 116, w: 90, h: 116, type: 'tireHideout' },
    { x: 20420, y: GROUND_Y - 116, w: 90, h: 116, type: 'tireHideout' },
  ];
  platforms.push(...tireHideouts.filter(({ x, w }) => !isNearWallBase(x, w)));
  platforms.push({
    x: 16542,
    y: GROUND_Y - 283,
    w: 474,
    h: 474,
    type: 'sprite',
    rotation: 1,
    collisionBoxes: [
      { x: 202, y: 167, w: 132, h: 27 },
      { x: 151, y: 139, w: 44, h: 65, slopeTop: { left: 56, right: 24 } },
      { x: 346, y: 141, w: 55, h: 74, slopeTop: { left: 24, right: 74 } },
      { x: 322, y: 204, w: 132, h: 71 },
      { x: 45, y: 208, w: 132, h: 72 },
    ],
    customSpriteName: 'carro_abandonado_pixelart_1776652992846.png',
    customSpriteDataUrl: abandonedCarSpriteUrl,
  });
  platforms.push({
    x: 17407,
    y: GROUND_Y - 111,
    w: 180,
    h: 135,
    type: 'sprite',
    customSpriteName: 'homem.png',
    customSpriteDataUrl: '/sprites/homem.png',
    collisionBoxes: [
      { x: 0, y: 0, w: 180, h: 111 },
    ],
  });

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

    // ── WALL ZONE 3 (após muro x:21700) ──
    // Zona x:16900-21700 vazia — sem plataformas.

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

  // ── PRÉDIO COM ESCADA DE INCÊNDIO (estilo NY) ───────────────────
  // Localizado na FREE ZONE 3, logo após o muro do ferro velho.
  // Proporcional ao Horácio — andares bem espaçados (130px) e landings amplas.
  // 6 andares + telhado, bem alto (passa do topo da câmera, ela sobe junto).
  // Gera a estrutura (escada + landings) para cada prédio do conjunto
  FIRE_ESCAPES.forEach((fe) => {
    const FE_PLAT_X = fe.PLAT_X;
    const FE_PLAT_W = fe.PLAT_W;
    const FE_PLAT_H = fe.PLAT_H;
    const FE_WALL_X = fe.WALL_X;
    const FE_WALL_W = fe.WALL_W;
    const FE_FLOOR_HEIGHTS = fe.FLOOR_HEIGHTS;
    const FE_TOP_H = FE_FLOOR_HEIGHTS[FE_FLOOR_HEIGHTS.length - 1];

    // Escada (atravessável) no centro das landings — Horácio fica em cima e ↑ pra subir
    platforms.push({
      x: FE_WALL_X, y: GROUND_Y - FE_TOP_H, w: FE_WALL_W, h: FE_TOP_H,
      type: 'wall', isLadder: true,
      hideRender: true,
    });

    // Landings de cada andar (plataformas finas estilo grade metálica)
    // Divididas em 2 partes (esquerda e direita) deixando um buraco no centro
    // exatamente onde está a escada — Horácio sobe livre sem bater na grade.
    // Marcadas com hideRender — desenhadas por drawFireEscapeBuilding como peça única.
    const FE_PLAT_LEFT_W = FE_WALL_X - FE_PLAT_X;                 // até a borda esquerda da escada
    const FE_PLAT_RIGHT_X = FE_WALL_X + FE_WALL_W;                // depois da borda direita
    const FE_PLAT_RIGHT_W = (FE_PLAT_X + FE_PLAT_W) - FE_PLAT_RIGHT_X;
    FE_FLOOR_HEIGHTS.forEach((floorH) => {
      const isTopFloor = floorH === FIRE_ESCAPE_TOP_FLOOR_H;
      // Esquerda: no andar do topo a hitbox cobre o vão da escada (Horácio pousa).
      platforms.push({
        x: FE_PLAT_X, y: GROUND_Y - floorH, w: FE_PLAT_LEFT_W, h: FE_PLAT_H,
        type: 'platform',
        hideRender: true,
        isFireEscapeFloor: true,
        ...(isTopFloor ? { isLadderTopFloor: true } : {}),
        collisionBoxes: isTopFloor
          ? [{ x: 0, y: 0, w: 165, h: 18 }]
          : [{ x: 0, y: 0, w: 143, h: 18 }],
      });
      // Direita
      platforms.push({
        x: FE_PLAT_RIGHT_X, y: GROUND_Y - floorH, w: FE_PLAT_RIGHT_W, h: FE_PLAT_H,
        type: 'platform',
        hideRender: true,
        isFireEscapeFloor: true,
        ...(isTopFloor ? { isLadderTopFloor: true } : {}),
        collisionBoxes: isTopFloor
          ? [{ x: 0, y: 0, w: 165, h: 18 }]
          : [{ x: 20, y: 0, w: 145, h: 18 }],
      });
    });
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
