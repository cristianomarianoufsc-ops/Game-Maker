export const CANVAS_W = 900;
export const CANVAS_H = 500;

export const GRAVITY = 0.55;
export const JUMP_FORCE = -13;
export const PLAYER_SPEED = 6.5;
export const ROLL_SPEED = 12;
export const ROLL_DURATION = 380;
export const LANDING_ROLL_THRESHOLD = 10.5; // vy ≈ sqrt(2 * GRAVITY * 100px) — 2× player height
export const LANDING_ROLL_DURATION = 300;
export const CLIMB_SPEED = 3.2;
export const MAX_FALL_SPEED = 18;

export const DIVEJUMP_SPEED = 14;
export const DIVEJUMP_JUMP_FORCE = -9.5;
export const DIVE_FRAME_W = 284;
export const DIVE_FRAME_H = 300;
export const DIVE_DISPLAY_H = 240;

export const DRONE_BASE_SPEED = 5.5;
export const DRONE_TARGET_OFFSET_X = -140; // drone stays close behind player
export const DRONE_TARGET_OFFSET_Y = -80; // above player
export const BULLET_SPEED = 10;
export const SHOOT_COOLDOWN = 900;

export const PLAYER_W = 26;
export const PLAYER_H = 50;
export const PLAYER_ROLL_H = 26;
export const DRONE_W = 64;
export const DRONE_H = 38;

export const PLAYER_MAX_HEALTH = 5;
export const HIT_INVINCIBILITY = 1600;
export const HIT_STUN_DURATION = 320;

export const GROUND_Y = CANVAS_H - 90;

export const CAMERA_LEAD_X = 0.28; // player is at 28% from left

export const PARALLAX_FAR = 0.15;
export const PARALLAX_MID = 0.45;
export const PARALLAX_NEAR = 0.75;

export const COLORS = {
  // Sky — Bravuna: dark with authoritarian red near horizon
  sky: '#0c0b10',
  skyHorizon: '#1a0d0d',
  fog: 'rgba(18,10,10,0.5)',
  // Ground — wet concrete with government red markings
  ground: '#1a1816',
  groundEdge: '#7a1a14',   // government red border marking
  platformTop: '#2a2826',  // concrete gray
  platformSide: '#181614',
  platformEdge: '#3a3632',
  wallMoss: 'rgba(40,50,20,0.12)',

  // Buildings — brutalist concrete (no purple, raw gray)
  buildingFar1: '#141212',
  buildingFar2: '#181616',
  buildingMid1: '#1c1a18',
  buildingMid2: '#201e1c',
  buildingNear: '#181614',

  windowDark: '#0c0c0c',
  windowGlow1: 'rgba(255,70,30,0.18)',   // government red
  windowGlow2: 'rgba(255,140,0,0.14)',   // government orange
  windowGlow3: 'rgba(200,50,10,0.15)',   // deep red
  windowLit: 'rgba(255,180,80,0.12)',
  neonBlue: 'rgba(0,210,255,0.5)',
  neonRed: 'rgba(255,40,20,0.85)',
  neonPurple: 'rgba(180,50,255,0.4)',

  playerSkin: '#7a4828',
  playerSkinDark: '#5a3218',
  playerHoodie: '#272534',
  playerHoodieLight: '#312f3e',
  playerPants: '#1a2d4a',
  playerPantsDark: '#142038',
  playerShoe: '#1a1a1a',
  playerShoeLight: '#282828',
  playerHoodieEdge: '#3d3a50',

  droneBody: '#3a3c40',
  droneBodyLight: '#4a4e55',
  droneAccent: '#505560',
  droneEye: '#ff2222',
  droneEyeGlow: 'rgba(255,30,30,0.6)',
  droneProp: '#606570',
  droneLaser: 'rgba(255,60,0,0.8)',
  droneBeam: 'rgba(255,40,40,0.18)',

  bullet: '#ff6600',
  bulletGlow: 'rgba(255,100,0,0.55)',
  bulletTrail: 'rgba(255,70,0,0.22)',

  healthFull: '#cc2222',
  healthEmpty: '#2a1818',
  uiText: '#b0a8a0',
  uiTextBright: '#d8d0c8',
  uiPanel: 'rgba(12,10,10,0.85)',

  crackLine: 'rgba(70,60,55,0.6)',
  graffiti1: 'rgba(200,40,30,0.45)',   // resistance red
  graffiti2: 'rgba(220,180,60,0.35)',  // faded yellow
  graffiti3: 'rgba(180,160,120,0.3)',  // faded white/beige
  pipe: '#242220',
  pipeDark: '#1a1816',
};
