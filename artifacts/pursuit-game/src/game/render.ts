import type { GameState, Platform } from './types';
import type { BuildingDef } from './level';
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
const JUNKYARD_X2 = 16900;

export function drawJunkyardBackdrop(ctx: CanvasRenderingContext2D, camX: number): void {
  const sx = JUNKYARD_X1 - camX;
  const ex = JUNKYARD_X2 - camX;
  if (ex < -20 || sx > CANVAS_W + 20) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, 0, ex - sx, GROUND_Y);
  ctx.clip();

  const w = ex - sx;

  // Dark earthy backdrop — terra batida / céu fechado
  ctx.fillStyle = '#120b04';
  ctx.fillRect(sx, 0, w, GROUND_Y);

  // Atmosfera suja — degradê vertical
  ctx.fillStyle = 'rgba(38,18,6,0.50)';
  ctx.fillRect(sx, GROUND_Y * 0.3, w, GROUND_Y * 0.7);
  ctx.fillStyle = 'rgba(50,24,8,0.40)';
  ctx.fillRect(sx, GROUND_Y * 0.62, w, GROUND_Y * 0.38);

  // Silhuetas de pilhas de carcaças ao fundo (escuras, distantes)
  // Dobro de pilhas para manter a densidade visual na área ampliada
  const piles = [
    { ox: 0.02, pw: 0.09, ph: 0.22 },
    { ox: 0.12, pw: 0.10, ph: 0.28 },
    { ox: 0.24, pw: 0.07, ph: 0.17 },
    { ox: 0.33, pw: 0.09, ph: 0.25 },
    { ox: 0.44, pw: 0.07, ph: 0.19 },
    { ox: 0.53, pw: 0.09, ph: 0.22 },
    { ox: 0.63, pw: 0.10, ph: 0.26 },
    { ox: 0.74, pw: 0.07, ph: 0.18 },
    { ox: 0.83, pw: 0.09, ph: 0.24 },
    { ox: 0.93, pw: 0.06, ph: 0.20 },
  ];
  for (const p of piles) {
    const px = sx + p.ox * w;
    const pw = p.pw * w;
    const ph = p.ph * GROUND_Y;
    const py = GROUND_Y - ph;
    ctx.fillStyle = '#0b0705';
    ctx.fillRect(px, py, pw, ph);
    // Borda superior enferrujada (linha de carros amassados)
    ctx.fillStyle = 'rgba(60,28,10,0.38)';
    ctx.fillRect(px, py, pw, 5);
    ctx.fillStyle = 'rgba(40,18,6,0.22)';
    ctx.fillRect(px + pw * 0.1, py - 4, pw * 0.8, 4);
  }

  // Névoa de poeira no nível do solo
  ctx.fillStyle = 'rgba(28,14,5,0.55)';
  ctx.fillRect(sx, GROUND_Y - 80, w, 80);

  // Haze enferrujado horizontal (fumaça baixa)
  ctx.fillStyle = 'rgba(75,32,8,0.10)';
  ctx.fillRect(sx, GROUND_Y * 0.50, w, GROUND_Y * 0.22);

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

export function drawGround(ctx: CanvasRenderingContext2D, camX: number): void {
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

  // Warning chevrons at the very top edge of the void (hint that this is dangerous)
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.06 * Math.sin(Date.now() * 0.003);
  const chevW = 32;
  const chevStep = 56;
  const offset = (camX * 0.4) % chevStep;
  for (let cx2 = -chevStep + offset; cx2 < CANVAS_W + chevStep; cx2 += chevStep) {
    ctx.fillStyle = 'rgba(200,20,8,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx2,          GROUND_Y);
    ctx.lineTo(cx2 + chevW * 0.5, GROUND_Y + 9);
    ctx.lineTo(cx2 + chevW,  GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ── Cached platform groups — recomputed once per level change ───────
let _cachedPlatKey = '';
type PlatType2 = { x: number; y: number; w: number; h: number; type: string };
type Group2 = { x1: number; x2: number; sw: number; plats: PlatType2[] };
let _cachedGroups: Group2[] = [];

function buildGroups(platforms: PlatType2[]): Group2[] {
  const elev = platforms
    .filter(p => p.type === 'platform')
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
  const platKey = platforms.length + ':' + (platforms[0]?.x ?? 0);
  if (platKey !== _cachedPlatKey) {
    _cachedGroups  = buildGroups(platforms as PlatType2[]);
    _cachedPlatKey = platKey;
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

export function drawPlatforms(
  ctx: CanvasRenderingContext2D,
  platforms: Platform[],
  camX: number,
  balconyImg?: HTMLImageElement | null,
  carroImg?: HTMLImageElement | null,
  destroyedBoxIndices?: number[],
  customSpriteImages?: Map<string, HTMLImageElement>,
): void {
  for (let pi = 0; pi < platforms.length; pi++) {
    const plat = platforms[pi];
    if (plat.type === 'ground') continue; // drawn separately
    if (plat.type === 'box' && destroyedBoxIndices?.includes(pi)) continue;
    const sx = plat.x - camX;
    if (sx + plat.w < -20 || sx > CANVAS_W + 20) continue;

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
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, sx + cropLeft, plat.y + cropTop, plat.w - cropLeft - cropRight, plat.h - cropTop - cropBottom);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.fillStyle = 'rgba(80,180,255,0.18)';
        ctx.fillRect(sx, plat.y, plat.w, plat.h);
        ctx.strokeStyle = 'rgba(120,220,255,0.85)';
        ctx.strokeRect(sx, plat.y, plat.w, plat.h);
      }
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

      continue;
    }

    if (plat.type === 'tire') {
      const x = sx;
      const y = plat.y;
      const w = plat.w;
      const h = plat.h;
      const cx2 = x + w / 2;
      const numTires = 3;
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

        const panelW = Math.floor((fw - 5) / 2);
        const leftX  = bx + 2;
        const rightX = bx + fw - 2 - panelW;
        const paneW  = Math.floor((panelW - 3) / 2);
        const paneH  = Math.floor((WIN_H - 7) / 2);

        for (let panel = 0; panel < 2; panel++) {
          const px2 = panel === 0 ? leftX : rightX;
          ctx.fillStyle = '#3e2010';
          ctx.fillRect(px2, wy + 2, panelW, WIN_H - 4);
          ctx.fillStyle = '#182030';
          ctx.fillRect(px2 + 1,         wy + 3,          paneW, paneH);
          ctx.fillRect(px2 + paneW + 2,  wy + 3,          paneW, paneH);
          ctx.fillRect(px2 + 1,         wy + paneH + 4,   paneW, paneH);
          ctx.fillRect(px2 + paneW + 2,  wy + paneH + 4,  paneW, paneH);
          ctx.fillStyle = 'rgba(255,160,50,0.22)';
          ctx.fillRect(px2 + 1, wy + 3, panelW - 2, WIN_H - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(px2 + 2, wy + 4, 3, 3);
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
): void {
  const p = gs.player;
  const px = p.x - gs.camera.x;
  const py = p.y;
  const ph = p.isRolling ? PLAYER_ROLL_H : PLAYER_H;

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
    ctx.fillText('! DRONE CLOSE !', CANVAS_W / 2, CANVAS_H - 20);
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
  ctx.fillText('←→ CORRER  |  SPACE/↑ PULAR  |  PULO SUBINDO + PAREDE = WALL RUN', 18, CANVAS_H - 52);
  ctx.fillText('SHIFT/Z ROLAR  |  ↓+SPACE (correndo) MERGULHO', 18, CANVAS_H - 37);
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
): void {
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
      ctx.fillText(`x:${p.x}  y:GY${gy >= 0 ? '+' : ''}${gy}  w:${p.w}  h:${p.h}  [${p.type}]${nameLabel}${modeLabel}${boxLabel}`, drawX + drawW / 2, drawY - 8);
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
  ctx.roundRect(uploadBtnX, histBtnY, 104, histBtnH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(170,235,255,1)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UPLOAD SPRITE', uploadBtnX + 52, histBtnY + 12);
  ctx.restore();

  ctx.fillStyle = 'rgba(180,175,210,0.75)';
  ctx.font = '10px monospace';
  const helpText = collisionMode
    ? 'HITBOX: clique numa caixa para escolher  |  setas movem 1px (Shift=5px)  |  +BOX / −HITBOX  |  S ou ◥ +SLOPE'
    : '← → MOVER  |  ARRASTAR: SNAP MAGNÉTICO  |  CLIQUE: SELECIONAR  |  botão HITBOX configura colisão/slope  |  ESC: MENU';
  ctx.fillText(helpText, 12, 32);

  // Checkpoint markers in world space
  ctx.save();
  for (let ci = 0; ci < checkpoints.length; ci++) {
    const cp = checkpoints[ci];
    const sx = cp.x - camX;
    if (sx < -40 || sx > CANVAS_W + 40) continue;
    const isActive = ci === checkpointIdx;
    ctx.strokeStyle = isActive ? 'rgba(80,230,255,0.95)' : 'rgba(80,180,255,0.45)';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, 44);
    ctx.lineTo(sx, CANVAS_H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isActive ? 'rgba(0,200,255,0.95)' : 'rgba(80,160,255,0.75)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cp.label, sx, 58);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Current checkpoint info row
  if (checkpointIdx >= 0 && checkpointIdx < checkpoints.length) {
    const cp = checkpoints[checkpointIdx];
    ctx.fillStyle = 'rgba(0,200,255,0.9)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('\u25b6 ' + cp.label + '  x:' + cp.x, 12, 49);
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
    ctx.fillStyle = 'rgba(20,180,80,0.92)';
    ctx.fillRect(0, CANVAS_H / 2 - 22, CANVAS_W, 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(copiedMsg.text, CANVAS_W / 2, CANVAS_H / 2 + 5);
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
