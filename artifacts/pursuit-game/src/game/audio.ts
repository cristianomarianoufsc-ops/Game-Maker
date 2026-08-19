let _ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function noise(duration: number): AudioBuffer {
  const a = ac();
  const n = Math.ceil(a.sampleRate * duration);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function gain(node: AudioNode, vol: number, attack: number, decay: number, now: number): GainNode {
  const g = ac().createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  node.connect(g);
  g.connect(ac().destination);
  return g;
}

export function initAudio() {
  try { ac(); } catch (_) { /* ignore */ }
}

// ── Som de tiro laser (MP3) ───────────────────────────────────────────────────
const LASER_SHOT_URL = '/sounds/laser2.mp3';
let _laserBuf: AudioBuffer | null = null;
let _laserLoading = false;

async function _ensureLaserBuf(): Promise<AudioBuffer | null> {
  if (_laserBuf) return _laserBuf;
  if (_laserLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_laserBuf || !_laserLoading) { clearInterval(check); resolve(_laserBuf); }
      }, 50);
    });
  }
  _laserLoading = true;
  try {
    const res = await fetch(LASER_SHOT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _laserBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _laserBuf;
  } catch (_) { return null; } finally { _laserLoading = false; }
}

export function playShot(vol = 0.55) {
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_laserBuf) { _play(_laserBuf); return; }
  _ensureLaserBuf().then(_play);
}

// ── Som de tiro (sintetizado — oscilador) — backup ───────────────────────────
// Para usar: substituir playShot acima por esta função (e renomear o export).
export function playShotSynth(vol = 0.22) {
  try {
    const a = ac();
    const now = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(a.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (_) { /* ignore */ }
}

export function playHit(vol = 0.85) {
  try {
    const a = ac();
    const now = a.currentTime;

    const src = a.createBufferSource();
    src.buffer = noise(0.3);
    const flt = a.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 700;
    src.connect(flt);
    gain(flt, vol, 0.003, 0.22, now);
    src.start(now);
    src.stop(now + 0.3);

    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.22);
    gain(osc, vol * 0.35, 0.003, 0.2, now);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch (_) { /* ignore */ }
}

export function playJump(vol = 0.28) {
  try {
    const a = ac();
    const now = a.currentTime;
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(370, now + 0.13);
    gain(osc, vol, 0.003, 0.13, now);
    osc.start(now);
    osc.stop(now + 0.17);
  } catch (_) { /* ignore */ }
}

export function playDoubleJump(vol = 0.26) {
  try {
    const a = ac();
    const now = a.currentTime;
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.13);
    gain(osc, vol, 0.003, 0.12, now);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch (_) { /* ignore */ }
}

export function playLand(vol = 0.32) {
  try {
    const a = ac();
    const now = a.currentTime;

    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.09);
    gain(osc, vol, 0.002, 0.09, now);
    osc.start(now);
    osc.stop(now + 0.12);

    const src = a.createBufferSource();
    src.buffer = noise(0.07);
    gain(src, vol * 0.4, 0.001, 0.06, now);
    src.start(now);
    src.stop(now + 0.07);
  } catch (_) { /* ignore */ }
}

export function playDeath(vol = 0.7) {
  try {
    const a = ac();
    const now = a.currentTime;

    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.65);
    gain(osc, vol, 0.005, 0.62, now);
    osc.start(now);
    osc.stop(now + 0.72);

    const src = a.createBufferSource();
    src.buffer = noise(0.5);
    const flt = a.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 350;
    src.connect(flt);
    gain(flt, vol * 0.45, 0.005, 0.45, now);
    src.start(now);
    src.stop(now + 0.5);
  } catch (_) { /* ignore */ }
}

export function playCheckpoint(vol = 0.45) {
  try {
    const a = ac();
    const now = a.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = now + i * 0.095;
      gain(osc, vol, 0.01, 0.24, t);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  } catch (_) { /* ignore */ }
}

// ── Grito de NPC atingido ─────────────────────────────────────────────────────
export function playNpcScream(vol = 0.18) {
  try {
    const a = ac();
    const now = a.currentTime;

    // Componente de "ah!" — sweep rápido descendente
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.18);
    gain(osc, vol, 0.003, 0.17, now);
    osc.start(now);
    osc.stop(now + 0.22);

    // Segundo harmônico — dá "timbre" de voz
    const osc2 = a.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now);
    osc2.frequency.exponentialRampToValueAtTime(510, now + 0.15);
    gain(osc2, vol * 0.3, 0.003, 0.14, now);
    osc2.start(now);
    osc2.stop(now + 0.18);

    // Sopro/ar — realismo
    const src = a.createBufferSource();
    src.buffer = noise(0.2);
    const flt = a.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1800;
    flt.Q.value = 3;
    src.connect(flt);
    gain(flt, vol * 0.18, 0.005, 0.18, now);
    src.start(now);
    src.stop(now + 0.22);
  } catch (_) { /* ignore */ }
}

// ── Rugido/latido do cachorro ─────────────────────────────────────────────────
export function playDogGrowl(vol = 0.75) {
  try {
    const a = ac();
    const now = a.currentTime;

    // Corpo do rugido — baixo pulsado
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.32);
    gain(osc, vol, 0.005, 0.30, now);
    osc.start(now);
    osc.stop(now + 0.38);

    // Ruído com filtro bandpass — textura rouca de cachorro
    const src = a.createBufferSource();
    src.buffer = noise(0.38);
    const flt = a.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 320;
    flt.Q.value = 1.8;
    src.connect(flt);
    gain(flt, vol * 0.55, 0.005, 0.32, now);
    src.start(now);
    src.stop(now + 0.38);

    // Click inicial de "focinho fechando" — snap do latido
    const osc3 = a.createOscillator();
    osc3.type = 'square';
    osc3.frequency.setValueAtTime(180, now);
    osc3.frequency.exponentialRampToValueAtTime(60, now + 0.05);
    gain(osc3, vol * 0.4, 0.001, 0.045, now);
    osc3.start(now);
    osc3.stop(now + 0.06);
  } catch (_) { /* ignore */ }
}

export function playDogBite(vol = 0.6) {
  try {
    const a = ac();
    const now = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = noise(0.22);
    const flt = a.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 350;
    flt.Q.value = 2.5;
    src.connect(flt);
    gain(flt, vol, 0.003, 0.18, now);
    src.start(now);
    src.stop(now + 0.22);
  } catch (_) { /* ignore */ }
}

export function playVictory(vol = 0.5) {
  try {
    const a = ac();
    const now = a.currentTime;
    const notes = [523, 659, 784, 784, 1047];
    const times = [0, 0.13, 0.26, 0.32, 0.45];
    notes.forEach((f, i) => {
      const osc = a.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const t = now + times[i];
      gain(osc, vol * 0.5, 0.01, 0.18, t);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch (_) { /* ignore */ }
}

// ── Som de acerto no treino ("plim!") ────────────────────────────────────────
export function playPlim(vol = 0.55) {
  try {
    const a = ac();
    const now = a.currentTime;
    // Ping principal: sino agudo com leve glide descendente
    const o1 = a.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(1760, now);
    o1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain(o1, vol, 0.001, 0.20, now);
    o1.start(now);
    o1.stop(now + 0.25);
    // Harmônico: brilho metálico
    const o2 = a.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 3520;
    gain(o2, vol * 0.32, 0.001, 0.09, now + 0.01);
    o2.start(now + 0.01);
    o2.stop(now + 0.13);
  } catch (_) { /* ignore */ }
}

// ── Som de brilho (acerto de obstáculo na sala de treino) ─────────────────────
const BRILHO_URL = '/sounds/brilho.mp3';
let _brilhoBuf: AudioBuffer | null = null;
let _brilhoLoading = false;

async function _ensureBrilhoBuf(): Promise<AudioBuffer | null> {
  if (_brilhoBuf) return _brilhoBuf;
  if (_brilhoLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_brilhoBuf || !_brilhoLoading) { clearInterval(check); resolve(_brilhoBuf); }
      }, 50);
    });
  }
  _brilhoLoading = true;
  try {
    const res = await fetch(BRILHO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _brilhoBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _brilhoBuf;
  } catch (_) { return null; } finally { _brilhoLoading = false; }
}

export function preloadBrilho(): void { _ensureBrilhoBuf(); }

export function playBrilho(vol = 0.75): void {
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_brilhoBuf) { _play(_brilhoBuf); return; }
  _ensureBrilhoBuf().then(_play);
}

// ── Som de caixa acertada pelo drone ─────────────────────────────────────────
const BOX_HIT_URL = '/sounds/box_hit.mp3';
let _boxHitBuf: AudioBuffer | null = null;
let _boxHitLoading = false;

async function _ensureBoxHitBuf(): Promise<AudioBuffer | null> {
  if (_boxHitBuf) return _boxHitBuf;
  if (_boxHitLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_boxHitBuf || !_boxHitLoading) { clearInterval(check); resolve(_boxHitBuf); }
      }, 50);
    });
  }
  _boxHitLoading = true;
  try {
    const res = await fetch(BOX_HIT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _boxHitBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _boxHitBuf;
  } catch (_) { return null; } finally { _boxHitLoading = false; }
}

export function preloadBoxHit(): void { _ensureBoxHitBuf(); }

export function playBoxHit(vol = 0.7): void {
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_boxHitBuf) { _play(_boxHitBuf); return; }
  _ensureBoxHitBuf().then(_play);
}

// ── Som de latão acertado pelo drone ─────────────────────────────────────────
const LATAO_HIT_URL = '/sounds/latao_hit.mp3';
let _lataoHitBuf: AudioBuffer | null = null;
let _lataoHitLoading = false;

async function _ensureLataoHitBuf(): Promise<AudioBuffer | null> {
  if (_lataoHitBuf) return _lataoHitBuf;
  if (_lataoHitLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_lataoHitBuf || !_lataoHitLoading) { clearInterval(check); resolve(_lataoHitBuf); }
      }, 50);
    });
  }
  _lataoHitLoading = true;
  try {
    const res = await fetch(LATAO_HIT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _lataoHitBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _lataoHitBuf;
  } catch (_) { return null; } finally { _lataoHitLoading = false; }
}

export function preloadMetalHit(): void { _ensureLataoHitBuf(); }

export function playMetalHit(vol = 0.7): void {
  if (vol <= 0) return;
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_lataoHitBuf) { _play(_lataoHitBuf); return; }
  _ensureLataoHitBuf().then(_play);
}

// ── Som de carro/carcaça acertado pelo drone ─────────────────────────────────
const CAR_HIT_URL = '/sounds/car_hit.mp3';
let _carHitBuf: AudioBuffer | null = null;
let _carHitLoading = false;

async function _ensureCarHitBuf(): Promise<AudioBuffer | null> {
  if (_carHitBuf) return _carHitBuf;
  if (_carHitLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_carHitBuf || !_carHitLoading) { clearInterval(check); resolve(_carHitBuf); }
      }, 50);
    });
  }
  _carHitLoading = true;
  try {
    const res = await fetch(CAR_HIT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _carHitBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _carHitBuf;
  } catch (_) { return null; } finally { _carHitLoading = false; }
}

export function preloadCarHit(): void { _ensureCarHitBuf(); }

export function playCarHit(vol = 0.7): void {
  if (vol <= 0) return;
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_carHitBuf) { _play(_carHitBuf); return; }
  _ensureCarHitBuf().then(_play);
}

// ── Som de pneu acertado pelo drone ──────────────────────────────────────────
const TIRE_HIT_URL = '/sounds/pneu_hit.mp3';
let _tireHitBuf: AudioBuffer | null = null;
let _tireHitLoading = false;

async function _ensureTireHitBuf(): Promise<AudioBuffer | null> {
  if (_tireHitBuf) return _tireHitBuf;
  if (_tireHitLoading) {
    // aguarda o carregamento em andamento
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_tireHitBuf || !_tireHitLoading) { clearInterval(check); resolve(_tireHitBuf); }
      }, 50);
    });
  }
  _tireHitLoading = true;
  try {
    const res = await fetch(TIRE_HIT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _tireHitBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _tireHitBuf;
  } catch (_) { return null; } finally { _tireHitLoading = false; }
}

export function preloadTireHit(): void { _ensureTireHitBuf(); }

export function playTireHit(vol = 0.7): void {
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_tireHitBuf) { _play(_tireHitBuf); return; }
  // buffer ainda carregando — aguarda e toca assim que estiver pronto
  _ensureTireHitBuf().then(_play);
}

// ── Sistema de Música: Chiptune 16-bit Hip Hop  OU  MP3 Original ─────────────

const BEAT_VOL = 0.40;
const BEAT_MP3_URL = '/music/beat_original.mp3';

// ── Volume de música (barra do editor) + abaixamento durante a pausa ────────
const _MUSIC_VOL_KEY = 'pursuit_music_volume';
const DUCK_FACTOR = 0.16; // fração do volume normal usada quando o jogo está pausado

let _musicVolume: number = (() => {
  try {
    const saved = localStorage.getItem(_MUSIC_VOL_KEY);
    const n = saved !== null ? parseFloat(saved) : 1;
    return isNaN(n) ? 1 : Math.min(1, Math.max(0, n));
  } catch (_) { return 1; }
})();
let _musicDucked = false;
let _musicBus: GainNode | null = null;

function musicBus(): GainNode {
  if (!_musicBus) {
    const a = ac();
    _musicBus = a.createGain();
    _musicBus.gain.value = _musicDucked ? _musicVolume * DUCK_FACTOR : _musicVolume;
    _musicBus.connect(a.destination);
  }
  return _musicBus;
}

function _applyMusicBusGain(rampSec: number) {
  const g = musicBus();
  const a = ac();
  const target = _musicDucked ? _musicVolume * DUCK_FACTOR : _musicVolume;
  g.gain.cancelScheduledValues(a.currentTime);
  g.gain.setValueAtTime(g.gain.value, a.currentTime);
  g.gain.linearRampToValueAtTime(target, a.currentTime + rampSec);
}

// Volume de 0 a 1, escolhido na barra do editor — persiste entre sessões.
// localStorage é usado como cache instantâneo (por navegador); a fonte da
// verdade "de verdade" é o arquivo /public/game-settings.json no servidor,
// que acompanha o git e vale em qualquer ambiente/clone do projeto.
export function getMusicVolume(): number { return _musicVolume; }

let _saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;
function _persistGameSettingsToServer(partial: Record<string, unknown>) {
  if (_saveSettingsTimer !== null) clearTimeout(_saveSettingsTimer);
  _saveSettingsTimer = setTimeout(() => {
    _saveSettingsTimer = null;
    fetch('/__editor/save-game-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    }).catch(() => { /* offline/best-effort — localStorage já guarda o valor localmente */ });
  }, 400);
}

export function setMusicVolume(v: number) {
  _musicVolume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(_MUSIC_VOL_KEY, String(_musicVolume)); } catch (_) { /* ignore */ }
  _applyMusicBusGain(0.05);
  _persistGameSettingsToServer({ musicVolume: _musicVolume });
}

// Volumes por categoria de SFX (caixas, pneus, NPCs, cachorro) escolhidos nas
// barras do editor — mesma lógica de persistência da música: localStorage
// como cache instantâneo + game-settings.json no servidor como fonte da
// verdade que acompanha o git e vale em qualquer ambiente/clone.
export function persistSfxCategoryVolumes(volumes: Record<string, number>) {
  _persistGameSettingsToServer({ sfxVolumes: volumes });
}

// Volumes individuais por NPC (bystander), indexados pela posição fixa no
// array inicial — mesma lógica de persistência acima.
export function persistNpcVolumes(volumes: Record<number, number>) {
  _persistGameSettingsToServer({ npcVolumes: volumes });
}

// Busca as configurações salvas no servidor (game-settings.json) e aplica.
// Deve ser chamado uma vez ao montar o jogo. Mantém o valor de localStorage
// (ou o padrão) caso o servidor não tenha nada salvo ainda ou falhe.
// Retorna os volumes de SFX por categoria (se houver) para quem chamou aplicar.
export async function loadGameSettingsFromServer(): Promise<{ sfxVolumes?: Record<string, number>; npcVolumes?: Record<string, number> }> {
  try {
    const res = await fetch('/__editor/game-settings');
    if (!res.ok) return {};
    const data = await res.json() as { musicVolume?: number; sfxVolumes?: Record<string, number>; npcVolumes?: Record<string, number> };
    if (typeof data.musicVolume === 'number' && !isNaN(data.musicVolume)) {
      _musicVolume = Math.min(1, Math.max(0, data.musicVolume));
      try { localStorage.setItem(_MUSIC_VOL_KEY, String(_musicVolume)); } catch (_) { /* ignore */ }
      _applyMusicBusGain(0.05);
    }
    const result: { sfxVolumes?: Record<string, number>; npcVolumes?: Record<string, number> } = {};
    if (data.sfxVolumes && typeof data.sfxVolumes === 'object') {
      for (const [cat, val] of Object.entries(data.sfxVolumes)) {
        if (typeof val === 'number' && !isNaN(val)) {
          try { localStorage.setItem(`pursuit_sfx_vol_${cat}`, String(val)); } catch (_) { /* ignore */ }
        }
      }
      result.sfxVolumes = data.sfxVolumes;
    }
    if (data.npcVolumes && typeof data.npcVolumes === 'object') {
      result.npcVolumes = data.npcVolumes;
    }
    return result;
  } catch (_) { /* offline/best-effort — mantém valor local */ return {}; }
}

// Abaixa (ou restaura) a música quando o jogo entra/sai do menu de pausa
export function duckMusic(active: boolean) {
  if (_musicDucked === active) return;
  _musicDucked = active;
  _applyMusicBusGain(0.25);
}

// Tipo activo — alterado pelo painel de opções, persistido em localStorage
const _MUSIC_KEY = 'pursuit_music_type';
const _saved = localStorage.getItem(_MUSIC_KEY);
let _musicType: 'chiptune' | 'mp3' = _saved === 'chiptune' ? 'chiptune' : 'mp3';
export function setMusicType(t: 'chiptune' | 'mp3') {
  _musicType = t;
  try { localStorage.setItem(_MUSIC_KEY, t); } catch (_) {}
}
export function getMusicType(): 'chiptune' | 'mp3' { return _musicType; }

// ── MP3 (Kevin MacLeod "Aggressor") ──────────────────────────────────────────
let _mp3Buf: AudioBuffer | null = null;
let _mp3Node: AudioBufferSourceNode | null = null;
let _mp3Gain: GainNode | null = null;
let _mp3LoadingPromise: Promise<AudioBuffer | null> | null = null;

async function _ensureMP3(): Promise<AudioBuffer | null> {
  if (_mp3Buf) return _mp3Buf;
  // Se já existe um carregamento em andamento (ex.: preload em background),
  // aguarda o mesmo resultado em vez de desistir — evita que o /-teste
  // fique sem música quando pressionado logo após o carregamento da página.
  if (_mp3LoadingPromise) return _mp3LoadingPromise;
  _mp3LoadingPromise = (async () => {
    try {
      const res = await fetch(BEAT_MP3_URL);
      if (!res.ok) return null;
      _mp3Buf = await ac().decodeAudioData(await res.arrayBuffer());
      return _mp3Buf;
    } catch (_) { return null; } finally { _mp3LoadingPromise = null; }
  })();
  return _mp3LoadingPromise;
}

async function _startMP3() {
  const buf = await _ensureMP3();
  if (!buf || !_beatOn) return;
  const a = ac();
  const g = a.createGain();
  g.gain.value = BEAT_VOL * 0.75;
  g.connect(musicBus());
  const src = a.createBufferSource();
  src.buffer = buf; src.loop = true; src.connect(g); src.start();
  _mp3Gain = g; _mp3Node = src;
}

function _stopMP3() {
  try {
    if (_mp3Gain) {
      const a = ac();
      _mp3Gain.gain.setValueAtTime(_mp3Gain.gain.value, a.currentTime);
      _mp3Gain.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.4);
    }
    const node = _mp3Node;
    if (node) setTimeout(() => { try { node.stop(); } catch (_) {} }, 450);
  } catch (_) {} finally { _mp3Node = null; _mp3Gain = null; }
}

// ── Chiptune Hip Hop (92 BPM, 4 compassos = 64 steps, Lá menor) ──────────────
const G2=98.00, A2=110.00, C3=130.81, D3=146.83, E3=164.81, F3=174.61, G3=196.00;
const A3=220.00, B3=246.94, C4=261.63, D4=293.66, E4=329.63, G4=392.00;
const A4=440.00, B4=493.88, C5=523.25;

const CT_BPM  = 92;
const CT_STEP = (60 / CT_BPM) / 4;  // ~0.163s por 16th note
const CT_BARS = 64;                  // 4 compassos

// ─── Sequências Hip Hop (64 steps = 4 compassos, Lá menor) ──────────────────
const SEQ_BASS: number[] = [
  // Compasso 1 — groove Am
  A2,0,A2,0, 0,0,A2,0, G2,0,0,0, A2,0,0,0,
  // Compasso 2 — Am > G
  A2,0,0,0, D3,0,0,0, E3,0,D3,0, A2,0,0,0,
  // Compasso 3 — mais movimento
  A2,0,A2,0, C3,0,A2,0, G2,0,0,0, E3,0,D3,0,
  // Compasso 4 — resolução F-E-Am
  C3,0,0,0, G2,0,0,G2, A2,0,0,0, E3,0,A2,0,
];
const SEQ_LEAD: number[] = [
  // Compasso 1 — entra no beat 2
  0,0,0,0, E4,0,0,0, A4,0,B4,0, A4,0,0,0,
  // Compasso 2
  0,0,0,0, D4,0,E4,0, 0,0,C4,0, D4,0,0,0,
  // Compasso 3 — mais denso
  E4,0,0,0, A4,0,B4,0, A4,0,G4,0, E4,0,D4,0,
  // Compasso 4 — frase de resolução
  E4,0,C4,0, A3,0,B3,0, C4,0,D4,0, E4,0,0,0,
];
const SEQ_ARP: number[] = [
  // Compasso 1: stab Am no beat 1 e 3
  A3,C4,E4,0, 0,0,0,0, A3,C4,E4,0, 0,0,0,0,
  // Compasso 2: G e Em
  G3,B3,D4,0, 0,0,0,0, G3,B3,0,0, D4,0,0,0,
  // Compasso 3: Am com cor sus4
  A3,C4,E4,0, 0,0,C4,E4, A3,0,0,0, 0,0,0,0,
  // Compasso 4: Fmaj — E7 — cadência
  F3,A3,C4,0, 0,0,0,0, E3,G3,B3,0, 0,0,E4,0,
];
// 1 = toca, 0 = silêncio
const SEQ_KICK: number[] = [
  1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0,  // c1: boom-bap (1, 2+, 3)
  1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0,  // c2: (1, 3, 3+)
  1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0,  // c3: igual c1
  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,1,0,0,  // c4: + ghost kick
];
const SEQ_SNARE: number[] = [
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  // c1
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  // c2
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  // c3
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0,  // c4: clap extra no 4+
];
const SEQ_HIHAT: number[] = [
  // c1-c2: colcheias simples
  0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1,
  0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1,
  // c3: variação 16 avos
  1,0,1,1, 0,1,0,1, 1,1,0,1, 0,1,0,1,
  // c4: mais denso
  0,1,0,1, 1,0,1,0, 0,1,0,1, 0,1,1,0,
];

// Buffers de ruído pré-gerados para não criar GC a cada passo
let _noiseShort: AudioBuffer | null = null;
let _noiseLong:  AudioBuffer | null = null;

function _getNoiseShort(): AudioBuffer {
  if (_noiseShort) return _noiseShort;
  const a = ac();
  const n = Math.ceil(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  _noiseShort = buf;
  return buf;
}
function _getNoiseLong(): AudioBuffer {
  if (_noiseLong) return _noiseLong;
  const a = ac();
  const n = Math.ceil(a.sampleRate * 0.14);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  _noiseLong = buf;
  return buf;
}

let _ctOn       = false;
let _ctTimer: ReturnType<typeof setInterval> | null = null;
let _ctStep     = 0;
let _ctNextTime = 0;
const LOOKAHEAD = 0.14; // schedula 140ms à frente
const INTERVAL  = 55;   // checa a cada 55ms

function _scheduleStep(t: number, s: number) {
  try {
    const a = ac();
    const v = BEAT_VOL;

    // ── BASS 808 (sine, sustain longo estilo hip hop) ────────
    const bf = SEQ_BASS[s];
    if (bf) {
      const osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(bf * 1.04, t);
      osc.frequency.exponentialRampToValueAtTime(bf, t + 0.04);
      const g = a.createGain();
      g.gain.setValueAtTime(v * 0.70, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CT_STEP * 3.2);
      osc.connect(g); g.connect(musicBus());
      osc.start(t); osc.stop(t + CT_STEP * 3.5);
    }

    // ── LEAD (square) ────────────────────────────────────────
    const lf = SEQ_LEAD[s];
    if (lf) {
      const osc = a.createOscillator();
      osc.type = 'square';
      osc.frequency.value = lf;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.22, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CT_STEP * 3.6);
      osc.connect(g); g.connect(musicBus());
      osc.start(t); osc.stop(t + CT_STEP * 4);
    }

    // ── ARP (sawtooth curto) ─────────────────────────────────
    const af = SEQ_ARP[s];
    if (af) {
      const osc = a.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = af;
      const flt = a.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = af * 1.5;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.13, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CT_STEP * 0.82);
      osc.connect(flt); flt.connect(g); g.connect(musicBus());
      osc.start(t); osc.stop(t + CT_STEP * 0.88);
    }

    // ── KICK (sine descendente) ──────────────────────────────
    if (SEQ_KICK[s]) {
      const osc = a.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.09);
      const g = a.createGain();
      g.gain.setValueAtTime(v * 1.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
      osc.connect(g); g.connect(musicBus());
      osc.start(t); osc.stop(t + 0.11);
    }

    // ── CLAP hip hop (dois bursts de ruído em rápida sucessão) ─
    if (SEQ_SNARE[s]) {
      [0, 0.012].forEach(offset => {
        const src = a.createBufferSource();
        src.buffer = _getNoiseLong();
        const flt = a.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.value = 1800;
        flt.Q.value = 0.6;
        const g = a.createGain();
        g.gain.setValueAtTime(v * 0.62, t + offset);
        g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.09);
        src.connect(flt); flt.connect(g); g.connect(musicBus());
        src.start(t + offset); src.stop(t + offset + 0.10);
      });
    }

    // ── HI-HAT (ruído bandpass curto) ────────────────────────
    if (SEQ_HIHAT[s]) {
      const src = a.createBufferSource();
      src.buffer = _getNoiseShort();
      const flt = a.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = 9000;
      flt.Q.value = 0.7;
      const g = a.createGain();
      g.gain.setValueAtTime(v * 0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(flt); flt.connect(g); g.connect(musicBus());
      src.start(t); src.stop(t + 0.055);
    }
  } catch (_) { /* ignore */ }
}

function _ctLoop() {
  try {
    const a = ac();
    while (_ctNextTime < a.currentTime + LOOKAHEAD) {
      _scheduleStep(_ctNextTime, _ctStep % CT_BARS);
      _ctStep++;
      _ctNextTime += CT_STEP;
    }
  } catch (_) { /* ignore */ }
}

// ── Gritos reais de NPC (MP3 gerado por IA) ─────────────────────────────────
const _SCREAM_URLS = [
  '/sounds/scream_female.mp3',
  '/sounds/scream_male.mp3',
  '/sounds/scream_crowd.mp3',
];
const _screamBufs: (AudioBuffer | null)[] = [null, null, null];
let _screamLoading = false;

async function _ensureScreamBufs(): Promise<void> {
  if (_screamLoading) return;
  _screamLoading = true;
  try {
    await Promise.all(_SCREAM_URLS.map(async (url, i) => {
      if (_screamBufs[i]) return;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        _screamBufs[i] = await ac().decodeAudioData(await res.arrayBuffer());
      } catch (_) { /* ignore */ }
    }));
  } finally { _screamLoading = false; }
}

// Pré-carrega os MP3 de grito sem bloquear
export function preloadScreams(): void {
  _ensureScreamBufs();
}

let _lastScreamIdx = -1;

export function playRealScream(vol = 0.28): void {
  // Escolhe um índice diferente do último para variar
  const available = _screamBufs.map((b, i) => b ? i : -1).filter(i => i >= 0);
  if (available.length === 0) return;
  let idx = available[Math.floor(Math.random() * available.length)];
  if (available.length > 1 && idx === _lastScreamIdx) {
    idx = available[(available.indexOf(idx) + 1) % available.length];
  }
  _lastScreamIdx = idx;
  const buf = _screamBufs[idx];
  if (!buf) return;
  try {
    const a = ac();
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.08);
    g.gain.setValueAtTime(vol, a.currentTime + buf.duration - 0.15);
    g.gain.linearRampToValueAtTime(0.0001, a.currentTime + buf.duration);
    g.connect(a.destination);
    const src = a.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start();
  } catch (_) { /* ignore */ }
}

// ── Passada do Horácio — reutiliza o buffer do NPC de touca (spriteId 1) ─────
// Toca apenas o ataque inicial do grito, criando um grunt/bufido de corrida.
// O buffer já é pré-carregado via preloadBystanderScreams(), sem fetch extra.
export function playPlayerStep(vol = 0.38): void {
  (async () => {
    const buf = await _ensureBystanderScreamBuf(1);
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      const attack  = 0.02;
      const hold    = 0.45;  // deixa a voz do touca claramente audível
      const release = 0.20;
      const total   = attack + hold + release;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.linearRampToValueAtTime(vol, a.currentTime + attack);
      g.gain.setValueAtTime(vol, a.currentTime + attack + hold);
      g.gain.linearRampToValueAtTime(0.0001, a.currentTime + total);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
      setTimeout(() => { try { src.stop(); } catch (_) {} }, (total + 0.05) * 1000);
    } catch (_) { /* ignore */ }
  })();
}

// ── Gritos individuais dos figurantes ao avistar o drone (MP3 por NPC) ──────
const _BYSTANDER_SCREAM_URLS: Record<1 | 2 | 3 | 4, string> = {
  1: '/sounds/scream_touca.mp3',
  2: '/sounds/scream_barbudo.mp3',
  3: '/sounds/scream_idoso.mp3',
  4: '/sounds/scream_mulher.mp3',
};
const _bystanderScreamBufs: Partial<Record<1 | 2 | 3 | 4, AudioBuffer>> = {};
const _bystanderScreamLoading: Partial<Record<1 | 2 | 3 | 4, boolean>> = {};

async function _ensureBystanderScreamBuf(spriteId: 1 | 2 | 3 | 4): Promise<AudioBuffer | null> {
  if (_bystanderScreamBufs[spriteId]) return _bystanderScreamBufs[spriteId]!;
  if (_bystanderScreamLoading[spriteId]) return null;
  _bystanderScreamLoading[spriteId] = true;
  try {
    const res = await fetch(_BYSTANDER_SCREAM_URLS[spriteId]);
    if (!res.ok) return null;
    const buf = await ac().decodeAudioData(await res.arrayBuffer());
    _bystanderScreamBufs[spriteId] = buf;
    return buf;
  } catch (_) { return null; } finally { _bystanderScreamLoading[spriteId] = false; }
}

// Pré-carrega os 4 gritos individuais sem bloquear
export function preloadBystanderScreams(): void {
  ([1, 2, 3, 4] as const).forEach(id => { _ensureBystanderScreamBuf(id); });
}

// Toca o grito específico do figurante que avistou o drone
export function playBystanderScream(spriteId: 1 | 2 | 3 | 4, vol = 0.42): void {
  (async () => {
    const buf = await _ensureBystanderScreamBuf(spriteId);
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.05);
      g.gain.setValueAtTime(vol, a.currentTime + buf.duration - 0.15);
      g.gain.linearRampToValueAtTime(0.0001, a.currentTime + buf.duration);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  })();
}

// ── Som de pânico da multidão (MP3 gerado por IA, realista) ─────────────────
const CROWD_SRC_URL = '/sounds/crowd_panic.mp3';
let _crowdBuf: AudioBuffer | null = null;
let _crowdNode: AudioBufferSourceNode | null = null;
let _crowdGain: GainNode | null = null;
let _crowdLoading = false;

async function _ensureCrowdBuf(): Promise<AudioBuffer | null> {
  if (_crowdBuf) return _crowdBuf;
  if (_crowdLoading) return null;
  _crowdLoading = true;
  try {
    const res = await fetch(CROWD_SRC_URL);
    if (!res.ok) return null;
    _crowdBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _crowdBuf;
  } catch (_) { return null; } finally { _crowdLoading = false; }
}

export async function playCrowdPanic(vol = 0.55): Promise<void> {
  if (_crowdNode) return; // já tocando
  const buf = await _ensureCrowdBuf();
  if (!buf) return;
  try {
    const a = ac();
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.6); // fade-in suave
    g.connect(a.destination);
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    src.start();
    _crowdGain = g;
    _crowdNode = src;
  } catch (_) { /* ignore */ }
}

export function stopCrowdPanic(): void {
  try {
    if (_crowdGain) {
      const a = ac();
      _crowdGain.gain.setValueAtTime(_crowdGain.gain.value, a.currentTime);
      _crowdGain.gain.linearRampToValueAtTime(0.0001, a.currentTime + 1.2);
    }
    const node = _crowdNode;
    if (node) setTimeout(() => { try { node.stop(); } catch (_) {} }, 1300);
  } catch (_) {} finally { _crowdNode = null; _crowdGain = null; }
}

// ── Som ambiente do cachorro — MP3 real com fade por distância ───────────────
const DOG_MAX_HEAR = 750;  // px — começa a ouvir
const DOG_FULL_VOL = 160;  // px — volume máximo
const DOG_MAX_VOL  = 0.90;

let _dogAmbBuf: AudioBuffer | null = null;
let _dogAmbNode: AudioBufferSourceNode | null = null;
let _dogAmbGain: GainNode | null = null;
let _dogAmbLoading = false;
let _dogAmbUrl = '';

async function _ensureDogAmbBuf(): Promise<AudioBuffer | null> {
  if (_dogAmbBuf) return _dogAmbBuf;
  if (_dogAmbLoading) return null;
  _dogAmbLoading = true;
  try {
    const res = await fetch(_dogAmbUrl);
    if (!res.ok) return null;
    _dogAmbBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _dogAmbBuf;
  } catch { return null; } finally { _dogAmbLoading = false; }
}

export async function initDogAmbient(url: string): Promise<void> {
  if (_dogAmbNode) return; // já rodando
  _dogAmbUrl = url;
  const buf = await _ensureDogAmbBuf();
  if (!buf) return;
  try {
    const a = ac();
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.connect(a.destination);
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    src.start();
    _dogAmbGain = g;
    _dogAmbNode = src;
  } catch { /* ignore */ }
}

export function updateDogAmbient(distToPlayer: number): void {
  if (!_dogAmbGain) return;
  try {
    const a = ac();
    const t = Math.max(0, Math.min(1,
      (DOG_MAX_HEAR - distToPlayer) / (DOG_MAX_HEAR - DOG_FULL_VOL),
    ));
    const target = Math.max(0.0001, t * DOG_MAX_VOL);
    // Suaviza: ~150ms de ramp para não estourar ao mover rápido
    _dogAmbGain.gain.cancelScheduledValues(a.currentTime);
    _dogAmbGain.gain.setValueAtTime(_dogAmbGain.gain.value, a.currentTime);
    _dogAmbGain.gain.linearRampToValueAtTime(target, a.currentTime + 0.15);
  } catch { /* ignore */ }
}

export function stopDogAmbient(): void {
  try {
    if (_dogAmbGain) {
      const a = ac();
      _dogAmbGain.gain.cancelScheduledValues(a.currentTime);
      _dogAmbGain.gain.setValueAtTime(_dogAmbGain.gain.value, a.currentTime);
      _dogAmbGain.gain.linearRampToValueAtTime(0.0001, a.currentTime + 1.5);
    }
    const node = _dogAmbNode;
    if (node) setTimeout(() => { try { node.stop(); } catch { /* ignore */ } }, 1600);
  } catch { /* ignore */ } finally { _dogAmbNode = null; _dogAmbGain = null; }
}

// Silencia imediatamente sem destruir o nó — usar na pausa para poder retomar depois
export function silenceDogAmbient(): void {
  try {
    if (!_dogAmbGain) return;
    const a = ac();
    _dogAmbGain.gain.cancelScheduledValues(a.currentTime);
    _dogAmbGain.gain.setValueAtTime(_dogAmbGain.gain.value, a.currentTime);
    _dogAmbGain.gain.linearRampToValueAtTime(0.0001, a.currentTime + 0.04);
  } catch { /* ignore */ }
}

let _beatOn = false;

// preloadBeat: pré-carrega chiptune (noise bufs) e inicia fetch do MP3 em background
export async function preloadBeat(): Promise<void> {
  _getNoiseShort();
  _getNoiseLong();
  _ensureMP3(); // background — elimina latência ao trocar para MP3 depois
}

export async function startBeat() {
  if (_beatOn) return;
  _beatOn = true;
  if (_musicType === 'mp3') {
    await _startMP3();
  } else {
    _startChiptune();
  }
}

// Inicia o MP3 forçadamente para o modo de teste real do editor.
// Não altera _musicType nem a preferência salva em localStorage —
// a escolha chiptune/mp3 do usuário é preservada para o jogo normal.
// Também ignora o guard _beatOn para evitar silêncio por estado obsoleto.
export async function startBeatMP3Forced() {
  // Para qualquer música em andamento e limpa o estado
  stopBeat();
  // Inicia MP3 diretamente, sem mudar _musicType
  _beatOn = true;
  await _startMP3();
}

function _startChiptune() {
  if (_ctOn) return;
  _ctOn = true;
  try {
    const a = ac();
    _ctStep = 0;
    _ctNextTime = a.currentTime + 0.05;
    _ctLoop();
    _ctTimer = setInterval(_ctLoop, INTERVAL);
  } catch (_) { /* ignore */ }
}

export function stopBeat() {
  _beatOn = false;
  // Para chiptune
  _ctOn = false;
  if (_ctTimer !== null) { clearInterval(_ctTimer); _ctTimer = null; }
  // Para MP3
  _stopMP3();
}

// ── Grito do Horácio ao cair no buraco ───────────────────────────────────────
const GRITO_BURACO_URL = '/sounds/grito_buraco.mp3';
let _gritoBuracoBuf: AudioBuffer | null = null;
let _gritoBuracoLoading = false;

async function _ensureGritoBuracoBuf(): Promise<AudioBuffer | null> {
  if (_gritoBuracoBuf) return _gritoBuracoBuf;
  if (_gritoBuracoLoading) {
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (_gritoBuracoBuf || !_gritoBuracoLoading) { clearInterval(check); resolve(_gritoBuracoBuf); }
      }, 50);
    });
  }
  _gritoBuracoLoading = true;
  try {
    const res = await fetch(GRITO_BURACO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _gritoBuracoBuf = await ac().decodeAudioData(await res.arrayBuffer());
    return _gritoBuracoBuf;
  } catch (_) { return null; } finally { _gritoBuracoLoading = false; }
}

export function preloadGritoBuraco(): void { _ensureGritoBuracoBuf(); }

export function playGritoBuraco(vol = 0.85): void {
  const _play = (buf: AudioBuffer | null) => {
    if (!buf) return;
    try {
      const a = ac();
      const g = a.createGain();
      g.gain.setValueAtTime(vol, a.currentTime);
      g.connect(a.destination);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start();
    } catch (_) { /* ignore */ }
  };
  if (_gritoBuracoBuf) { _play(_gritoBuracoBuf); return; }
  _ensureGritoBuracoBuf().then(_play);
}
