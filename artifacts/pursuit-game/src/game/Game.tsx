import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameState, Keys, Player, Drone } from './types';
import spriteUrl from '/horacio_transparent.png';
import runSheetUrl from '/run_sheet_transparent.png';
import idleUrl from '/idle_transparent.png';
import rollSheetUrl from '/roll_sheet.png';
import jumpSheetUrl from '/jump_sheet.png';
import diveJumpSheetUrl from '/dive_jump_sheet.png';
import {
  CANVAS_W, CANVAS_H, GROUND_Y, PLAYER_W, PLAYER_H, DRONE_W, DRONE_H,
  PLAYER_MAX_HEALTH, SHOOT_COOLDOWN, CAMERA_LEAD_X, COLORS,
} from './constants';
import { generateLevel, generateBuildings } from './level';
import {
  updatePlayer, updateDrone, updateBullets, updateParticles, spawnParticleHelper,
} from './physics';
import {
  drawSky, drawBuildings, drawAlleyDetails, drawGround, drawPlatforms,
  drawStartingBackWall, drawPlayer, drawDrone, drawBullets, drawParticles,
  drawHUD, drawControls, drawMenuScreen, drawGameOverScreen,
} from './render';

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
    isDivejumping: false,
    isWallRunning: false,
    wallRunTimer: 0,
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
  };
}

const CONTROLS_H = 68; // px reserved below canvas for mobile buttons

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

function getScale() {
  const scaleX = window.innerWidth / CANVAS_W;
  const scaleY = (window.innerHeight - CONTROLS_H) / CANVAS_H;
  return Math.min(1, scaleX, scaleY);
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Keys>({ left: false, right: false, up: false, down: false, space: false, shift: false, z: false, dive: false });
  const spaceJustPressed = useRef(false);
  const lastTime = useRef<number>(0);
  const animRef = useRef<number>(0);
  const buildingsRef = useRef(generateBuildings());
  const platformsRef = useRef(generateLevel());
  const showControls = useRef(true);
  const spriteImgRef = useRef<HTMLImageElement | null>(null);
  const runSheetImgRef = useRef<HTMLImageElement | null>(null);
  const idleImgRef = useRef<HTMLImageElement | null>(null);
  const rollSheetImgRef = useRef<HTMLImageElement | null>(null);
  const jumpSheetImgRef = useRef<HTMLImageElement | null>(null);
  const diveSheetImgRef = useRef<HTMLImageElement | null>(null);

  // Responsive scale: fit canvas inside available viewport
  const [scale, setScale] = useState(getScale);
  useEffect(() => {
    const onResize = () => setScale(getScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const makeInitialState = useCallback((): GameState => ({
    player: makePlayer(),
    drone: makeDrone(),
    bullets: [],
    camera: { x: 0, y: 0 },
    platforms: platformsRef.current,
    gamePhase: 'menu',
    score: 0,
    time: 0,
    particles: [],
    screenShake: 0,
  }), []);

  const resetGame = useCallback(() => {
    gsRef.current = {
      ...makeInitialState(),
      gamePhase: 'playing',
    };
  }, [makeInitialState]);

  useEffect(() => {
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

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = keysRef.current;
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': k.left  = down; break;
        case 'ArrowRight': case 'KeyD': k.right = down; break;
        case 'ArrowUp':   case 'KeyW': k.up    = down; break;
        case 'ArrowDown': case 'KeyS': k.down  = down; break;
        case 'Space':
          k.space = down;
          if (down) spaceJustPressed.current = true;
          break;
        case 'ShiftLeft': case 'ShiftRight': k.shift = down; break;
        case 'KeyZ': k.z = down; break;
      }
      // Prevent scroll on space/arrows
      if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

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
        if (spaceJustPressed.current) {
          resetGame();
          spaceJustPressed.current = false;
        }
      } else if (gs.gamePhase === 'playing') {
        gs.time += dt;
        showControls.current = gs.time < 8000;

        const spawnP = (x: number, y: number, color: string) =>
          spawnParticleHelper(gs.particles, x, y, color);

        updatePlayer(gs.player, keys, gs.platforms, dt, spawnP);

        // Camera follows player
        const targetCamX = gs.player.x - CANVAS_W * CAMERA_LEAD_X;
        gs.camera.x += (targetCamX - gs.camera.x) * 0.1;
        if (gs.camera.x < 0) gs.camera.x = 0;

        const shakeAmount = updateDrone(gs.drone, gs.player, gs.bullets, dt, spawnP);
        if (shakeAmount > 0) gs.screenShake = shakeAmount;

        gs.bullets = updateBullets(gs.bullets, gs.player, gs.platforms, dt, () => {
          gs.screenShake = 6;
          for (let i = 0; i < 8; i++) spawnP(gs.player.x + PLAYER_W / 2, gs.player.y + PLAYER_H / 2, '#cc2222');
        });

        gs.particles = updateParticles(gs.particles, dt);

        if (gs.screenShake > 0) gs.screenShake = Math.max(0, gs.screenShake - 0.4);

        if (gs.player.state === 'dead') {
          gs.gamePhase = 'gameover';
        }

        spaceJustPressed.current = false;
      } else if (gs.gamePhase === 'gameover') {
        if (spaceJustPressed.current) {
          resetGame();
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

      drawPlatforms(ctx, gs.platforms, gs.camera.x);
      drawParticles(ctx, gs);
      drawPlayer(ctx, gs, spriteImgRef.current, runSheetImgRef.current, idleImgRef.current, rollSheetImgRef.current, jumpSheetImgRef.current, diveSheetImgRef.current);
      drawDrone(ctx, gs);
      drawBullets(ctx, gs);

      ctx.restore(); // end shake

      drawHUD(ctx, gs);
      if (showControls.current) drawControls(ctx);

      if (gs.gamePhase === 'menu') drawMenuScreen(ctx);
      if (gs.gamePhase === 'gameover') drawGameOverScreen(ctx, gs.player.distanceTraveled, gs.time);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      cancelAnimationFrame(animRef.current);
    };
  }, [makeInitialState, resetGame]);

  const cssW = Math.floor(CANVAS_W * scale);
  const cssH = Math.floor(CANVAS_H * scale);

  return (
    <div
      style={{
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
      {/* Mobile controls sit below the canvas, never overlap */}
      <MobileControls keysRef={keysRef} spaceJustPressed={spaceJustPressed} canvasW={cssW} />
    </div>
  );
}

function MobileControls({
  keysRef,
  spaceJustPressed,
  canvasW,
}: {
  keysRef: React.MutableRefObject<Keys>;
  spaceJustPressed: React.MutableRefObject<boolean>;
  canvasW: number;
}) {
  const btnStyle = (color = 'rgba(50,40,35,0.92)'): React.CSSProperties => ({
    background: color,
    border: '1px solid rgba(120,60,40,0.55)',
    borderRadius: 8,
    color: '#c8c0b8',
    fontFamily: 'monospace',
    fontSize: 15,
    padding: '10px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    minWidth: 52,
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const press = (key: keyof Keys) => () => {
    keysRef.current[key] = true;
    if (key === 'space') spaceJustPressed.current = true;
  };
  const release = (key: keyof Keys) => () => { keysRef.current[key] = false; };

  return (
    <div
      style={{
        width: canvasW,
        height: CONTROLS_H,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 8px',
        flexShrink: 0,
      }}
    >
      {/* Left side: directional */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          style={btnStyle()}
          onPointerDown={press('left')}
          onPointerUp={release('left')}
          onPointerLeave={release('left')}
        >◀</button>
        <button
          style={btnStyle()}
          onPointerDown={press('right')}
          onPointerUp={release('right')}
          onPointerLeave={release('right')}
        >▶</button>
        <button
          style={btnStyle()}
          onPointerDown={press('up')}
          onPointerUp={release('up')}
          onPointerLeave={release('up')}
        >▲</button>
        <button
          style={btnStyle()}
          onPointerDown={press('down')}
          onPointerUp={release('down')}
          onPointerLeave={release('down')}
        >▼</button>
      </div>

      {/* Right side: actions */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          style={btnStyle('rgba(80,25,20,0.92)')}
          onPointerDown={press('shift')}
          onPointerUp={release('shift')}
          onPointerLeave={release('shift')}
        >ROLAR</button>
        <button
          style={btnStyle('rgba(40,60,20,0.92)')}
          onPointerDown={press('dive')}
          onPointerUp={release('dive')}
          onPointerLeave={release('dive')}
        >MERGULHO</button>
        <button
          style={btnStyle('rgba(25,45,90,0.92)')}
          onPointerDown={press('space')}
          onPointerUp={release('space')}
          onPointerLeave={release('space')}
        >PULAR</button>
      </div>
    </div>
  );
}
