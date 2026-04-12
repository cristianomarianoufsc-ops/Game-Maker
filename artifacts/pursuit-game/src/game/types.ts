export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Platform extends Rect {
  type: 'ground' | 'platform' | 'wall' | 'obstacle';
  climbable?: boolean;
}

export type PlayerState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'roll'
  | 'divejump'
  | 'climb'
  | 'wallrun'
  | 'hurt'
  | 'dead';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  state: PlayerState;
  facingRight: boolean;
  onGround: boolean;
  touchingWall: boolean;
  wallX: number;
  wallSide: 'left' | 'right' | null;
  health: number;
  maxHealth: number;
  invincible: boolean;
  invincibleTimer: number;
  hurtStunTimer: number;
  rollTimer: number;
  isRolling: boolean;
  isClimbing: boolean;
  animFrame: number;
  animTimer: number;
  distanceTraveled: number;
  coyoteTime: number;
  peakFallVy: number;
  autoRoll: boolean;
  landingRollFrame: number;
  jumpOriginGroundY: number;
  landingCrouch: boolean;
  landingCrouchTimer: number;
  isCrouching: boolean;
  isDivejumping: boolean;
  isWallRunning: boolean;
  wallRunTimer: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface Drone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  shootTimer: number;
  propAngle: number;
  wobble: number;
  wobbleDir: number;
}

export interface Camera {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface DroneAlert {
  message: string;
  timer: number;     // ms remaining
  phase: number;    // 0 = first warning, 1 = second warning, 2 = protocol activated
}

export interface GameState {
  player: Player;
  drone: Drone;
  bullets: Bullet[];
  camera: Camera;
  platforms: Platform[];
  gamePhase: 'menu' | 'playing' | 'gameover' | 'victory';
  gameMode: 'story' | 'wall-test';
  score: number;
  time: number;
  particles: Particle[];
  screenShake: number;
  droneAlert: DroneAlert | null;
  droneIntroduced: boolean;
  victoryTimer: number;
}

export interface Keys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  space: boolean;
  shift: boolean;
  z: boolean;
  dive: boolean;
}
