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

export interface CollisionBox extends Rect {
  slopeTop?: { left: number; right: number };
}

export interface Platform extends Rect {
  type: 'ground' | 'platform' | 'wall' | 'obstacle' | 'car' | 'tire' | 'tireHideout' | 'box' | 'sprite';
  climbable?: boolean;
  climbableSide?: 'left' | 'right' | 'both';
  isLadder?: boolean;
  rotation?: number;
  collisionW?: number;
  collisionH?: number;
  collisionOffsetX?: number;
  collisionOffsetY?: number;
  collisionBoxes?: CollisionBox[];
  cropLeft?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  customSpriteName?: string;
  customSpriteDataUrl?: string;
  hideRender?: boolean;
  isFireEscapeFloor?: boolean;
  isLadderTopFloor?: boolean;
  isRiverStump?: boolean;
  lowJumpImpulse?: boolean;
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
  | 'wallflip'
  | 'wallclimb'
  | 'sideflip'
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
  touchingLadder: boolean;
  ladderCenterX: number;
  wallX: number;
  wallTopY: number;
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
  forcedCrouch: boolean;
  isDivejumping: boolean;
  isWallRunning: boolean;
  wallRunTimer: number;
  wallRunOnBox: boolean;
  wallRunBoxStackCount: number;
  wallRunBoxStackHeight: number;
  isWallFlipping: boolean;
  wallFlipTimer: number;
  isWallClimbUp: boolean;
  wallClimbTimer: number;
  wallClimbAdjustedDuration: number;
  wallClimbLiftAmount: number;
  wallClimbJumpPenalty: number;
  wallClimbStartX: number;
  wallClimbStartY: number;
  wallClimbTargetX: number;
  wallClimbTargetY: number;
  wallClimbSide: 'left' | 'right' | null;
  isWallHanging: boolean;
  wallHangJumpConsumed: boolean;
  wallLowImpulse: boolean;
  jumpedFromWall: boolean;
  jumpCount: number;
  doubleJumpReady: boolean;
  isSideFlipping: boolean;
  sideFlipTimer: number;
  sideFlipImmune: boolean;
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
  stuckTimer: number;   // frames sem progresso significativo (para teleporte)
  stuckLastX: number;  // referência de X para detectar estagnação
  lastFireSide: -1 | 0 | 1; // último lado em que atirou estando na escada (-1=esq, 0=neutro, 1=dir)
  aimTimer: number; // ms restantes na fase de mira antes de disparar (0 = não está mirando)
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

export interface FallingBox {
  index: number; // índice em platforms[]
  vy: number;    // velocidade vertical atual
  y: number;     // y atual (atualizado a cada frame)
}

export interface FlyingTire {
  x: number;          // centro X (world)
  y: number;          // centro Y (world)
  vx: number;
  vy: number;
  radius: number;
  angle: number;      // rotação atual (radianos)
  angularVel: number; // velocidade angular (rad/frame)
  bounces: number;    // quantas vezes quicou no chão
  life?: number;      // frames restantes antes de sumir
}

export type DogAnimState = 'idle' | 'run' | 'bite';

export type BystanderState = 'sit' | 'flee' | 'dead';

export interface Bystander {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facingRight: boolean;
  state: BystanderState;
  spriteId: 1 | 2;          // qual das duas sheets usar
  animTimer: number;
  triggerX: number;          // mantido para compatibilidade (não usado; trigger agora é por distância do drone)
  fleeDir: 'left' | 'right'; // direção de fuga ao sentir o drone
  fleeSpeed?: number;        // velocidade individual de fuga (sobrescreve o padrão)
  deadTimer: number;         // ms até desaparecer após ser atingido
}

export interface Dog {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facingRight: boolean;
  animState: DogAnimState;
  animTimer: number;
  biteTimer: number;
  biteCooldown: number;
  patrolLeft: number;
  patrolRight: number;
}

export interface GameState {
  player: Player;
  drone: Drone;
  bullets: Bullet[];
  camera: Camera;
  platforms: Platform[];
  gamePhase: 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'editor';
  gameMode: 'story' | 'wall-test';
  score: number;
  time: number;
  particles: Particle[];
  screenShake: number;
  droneAlert: DroneAlert | null;
  droneIntroduced: boolean;
  victoryTimer: number;
  destroyedBoxIndices: number[];
  fallingBoxes: FallingBox[];
  flyingTires: FlyingTire[];
  destroyedTireIndices: number[];
  dogs: Dog[];
  bystanders: Bystander[];
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
