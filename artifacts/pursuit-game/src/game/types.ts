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
  type: 'ground' | 'platform' | 'wall' | 'obstacle' | 'car' | 'tire' | 'tireHideout' | 'box' | 'sprite' | 'pothole';
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
  noGroup?: boolean;
  lowJumpImpulse?: boolean;
  noAutoRoll?: boolean;
  oneWay?: boolean;
  slopeRunDown?: boolean;
  flipX?: boolean;
  _stair?: boolean;
  cushionOnLand?: boolean;
  noClimbOver?: boolean;
  noHang?: boolean;
  knockOff?: boolean;
  freeHitbox?: boolean;
  tictacWall?: boolean;
  sfxVolume?: number;
  vaultTrigger?: boolean;
  vaultFrontOnly?: boolean; // se true, kong vault só dispara pela frente (borda esquerda), não pelo topo
  isKongVault?: boolean;    // se true, balão de dica mostra KONG VAULT em vez de MONKEY
  isRollUnder?: boolean;    // plataforma baixa para treino de rolamento por baixo
  noHint?: boolean;          // objeto não exibe balão de instrução no treino
  endWall?: boolean;         // barreira larga que encerra a área de treino
  flashTimer?: number;       // ms restantes do flash verde de acerto (sala de treino)
  plimCooldown?: number;     // ms de cooldown após acerto — 0 = pronto para disparar de novo
  completed?: boolean;       // stage completado na sala de treino — exibe ✓ permanente
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
  fallApexY: number;
  autoRoll: boolean;
  diveLandingRoll: boolean;
  postDiveJumpLocked: boolean;
  diveEnergy: number;
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
  wallHangQuickJump: boolean; // true = chegou ao hang sem segurar espaço → pulo rápido/baixo
  wallLowImpulse: boolean;
  jumpedFromWall: boolean;
  wallNoClimbOver: boolean;
  wallNoHang: boolean;
  onTictacWall: boolean;
  tictacJumpConsumed: boolean;
  jumpCount: number;
  doubleJumpReady: boolean;
  isSideFlipping: boolean;
  sideFlipTimer: number;
  sideFlipImmune: boolean;
  justLandedOnNoRollSlope?: boolean;
  killedByFall: boolean;
  kongVaultPhase: 'start' | 'air' | null;
  kongVaultTimer: number;
  kongVaultLanding: boolean;
  kongVaultIsObstacle: boolean; // true quando o vault foi disparado por platform type:'obstacle'
  kongVaultFromDive:   boolean; // true quando o vault foi iniciado durante um dive jump (dive kong vault)
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
  spriteId: 1 | 2 | 3 | 4;  // qual das sheets usar (1-2 originais, 3=senhor, 4=mulher)
  animTimer: number;
  triggerX: number;          // mantido para compatibilidade (não usado; trigger agora é por distância do drone)
  fleeDir: 'left' | 'right'; // direção de fuga ao sentir o drone
  fleeSpeed?: number;        // velocidade individual de fuga (sobrescreve o padrão)
  deadTimer: number;         // ms até desaparecer após ser atingido
  deathFrame?: number;       // índice do frame a mostrar no estado morto (padrão 0)
  playerFleeDist?: number;   // distância do JOGADOR que dispara a fuga (além do drone)
  useHitSprite?: boolean;    // usa sprite de impacto (npc-hit.png) na morte em vez da animação padrão
  frozenFrame?: number;      // frame congelado no momento da morte (usado por spriteId 1 para cair na pose de corrida)
  sfxVolume?: number;        // volume individual do grito/som deste NPC (0-1, padrão 1)
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
  growlTimer: number;
  sfxVolume?: number; // volume individual da mordida/rosnado deste cachorro (0-1, padrão 1)
}

export interface GameState {
  player: Player;
  drone: Drone;
  bullets: Bullet[];
  camera: Camera;
  platforms: Platform[];
  gamePhase: 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'editor' | 'training';
  gameMode: 'story' | 'race' | 'wall-test';
  raceDroneEnabled: boolean;
  raceCheckpointsEnabled: boolean;
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
  junkyardHealthGiven: boolean;
  postJunkyardHealthGiven: boolean;
  secondCheckpointGiven: boolean;
  storyCheckpointX: number;
  villageScreamTimer: number;
  lives: number;
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
