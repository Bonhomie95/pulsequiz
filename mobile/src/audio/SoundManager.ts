import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Game audio.
 *
 * Migrated from `expo-av`, which is deprecated on SDK 54 and removed in 55.
 * The public surface is unchanged, so no screen needed touching.
 *
 * Two behavioural notes carried over from the old implementation, because both
 * were load-bearing:
 *   - Effects are created once and replayed (`seekTo(0)` + `play()`). Creating
 *     and tearing down a native player on every tap made the phone hot during
 *     play.
 *   - Nothing plays while the app is backgrounded; AppState drives that.
 *
 * `createAudioPlayer` is synchronous and loads in the background — unlike
 * `Audio.Sound.loadAsync`, there is nothing to await, so `isLoaded` is checked
 * before acting on a player rather than tracking load state ourselves.
 */

export type SoundKey =
  | 'victory'
  | 'fail'
  | 'click'
  | 'countdown'
  | 'match_found';

type SoundConfig = {
  source: any;
  debounceMs?: number;
  baseVolume?: number;
};

const SOUNDS: Record<SoundKey, SoundConfig> = {
  victory: { source: require('@/assets/sounds/victory.wav'), baseVolume: 1 },
  fail: { source: require('@/assets/sounds/fail.mp3'), baseVolume: 1 },
  match_found: {
    source: require('@/assets/sounds/beep.mp3'),
    baseVolume: 0.9,
  },
  countdown: {
    source: require('@/assets/sounds/beep.mp3'),
    debounceMs: 200,
    baseVolume: 0.8,
  },
  click: {
    source: require('@/assets/sounds/beep.mp3'),
    debounceMs: 120,
    baseVolume: 0.6,
  },
};

const BG_MUSIC = require('@/assets/sounds/bg.mp3');

class SoundManager {
  private static instance: SoundManager;
  static get I() {
    if (!this.instance) this.instance = new SoundManager();
    return this.instance;
  }

  private booted = false;
  private appState: AppStateStatus = AppState.currentState;

  private bg: AudioPlayer | null = null;

  /** Preloaded short effects, created once and replayed. */
  private fxPool: Partial<Record<SoundKey, AudioPlayer>> = {};

  private muted = false;
  private masterVolume = 1;
  private effectsVolume = 1;

  private lastPlayedAt: Partial<Record<SoundKey, number>> = {};

  private constructor() {}

  /* ---------------- BOOT ---------------- */

  async boot() {
    if (this.booted) return;
    this.booted = true;

    await setAudioModeAsync({
      // expo-av called these playsInSilentModeIOS / staysActiveInBackground /
      // shouldDuckAndroid. Same intent, new names.
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });

    this.preloadEffects();

    AppState.addEventListener('change', this.onAppStateChange);
  }

  /** Create every short effect once so `play()` can just replay it. */
  private preloadEffects() {
    for (const key of Object.keys(SOUNDS) as SoundKey[]) {
      if (this.fxPool[key]) continue;
      try {
        this.fxPool[key] = createAudioPlayer(SOUNDS[key].source);
      } catch {
        // Leave it out of the pool; play() will create it on demand.
      }
    }
  }

  /* ---------------- SETTINGS ---------------- */

  setMuted(v: boolean) {
    this.muted = v;
    if (v) {
      this.stopBackground();
      this.stopEffects();
      return;
    }
    this.applyVolumes();
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyVolumes();
  }

  setEffectsVolume(v: number) {
    this.effectsVolume = Math.max(0, Math.min(1, v));
    // effects only
  }

  /* ---------------- GAME STATES ---------------- */

  async enterResultMode() {
    await this.stopBackground();
  }

  async exitResultMode() {
    await this.startBackground();
  }

  private applyVolumes() {
    // Background music follows master volume only.
    if (this.bg && !this.muted) {
      try {
        this.bg.volume = this.masterVolume;
      } catch {
        // Player was removed underneath us.
      }
    }
  }

  /* ---------------- BACKGROUND MUSIC ---------------- */

  async startBackground() {
    if (!this.booted) await this.boot();
    if (this.muted) return;
    if (this.appState !== 'active') return;

    try {
      if (!this.bg) {
        this.bg = createAudioPlayer(BG_MUSIC);
        this.bg.loop = true;
      }

      if (!this.bg.playing) {
        this.bg.loop = true;
        this.bg.volume = this.masterVolume;
        this.bg.play();
      }
    } catch {
      // Drop the handle so the next call builds a fresh one.
      this.bg = null;
    }
  }

  async stopBackground() {
    if (!this.bg) return;
    try {
      this.bg.pause();
      // `remove` releases the native player — the expo-audio equivalent of
      // unloadAsync. Skipping it leaks a player per start/stop cycle.
      this.bg.remove();
    } catch {
      // Already gone.
    }
    this.bg = null;
  }

  /* ---------------- EFFECTS ---------------- */

  async play(key: SoundKey) {
    if (!this.booted) await this.boot();
    if (this.muted) return;
    if (this.appState !== 'active') return;

    const cfg = SOUNDS[key];
    if (!cfg) return;

    const now = Date.now();
    const last = this.lastPlayedAt[key] ?? 0;
    if (cfg.debounceMs && now - last < cfg.debounceMs) return;
    this.lastPlayedAt[key] = now;

    try {
      let s = this.fxPool[key];
      if (!s) {
        s = createAudioPlayer(cfg.source);
        this.fxPool[key] = s;
      }

      // Loading is asynchronous and un-awaitable. A tap in the first moments
      // after boot would otherwise throw; skipping one click beats a crash.
      if (!s.isLoaded) return;

      s.volume = (cfg.baseVolume ?? 1) * this.masterVolume * this.effectsVolume;
      // Rewind and replay — no per-tap create/destroy churn.
      await s.seekTo(0);
      s.play();
    } catch {
      // Pooled player is in a bad state — drop it so the next call rebuilds.
      const dead = this.fxPool[key];
      this.fxPool[key] = undefined;
      try {
        dead?.remove();
      } catch {
        // Best effort.
      }
    }
  }

  async stopEffects() {
    // Pause but keep them loaded for reuse.
    for (const s of Object.values(this.fxPool)) {
      try {
        s?.pause();
      } catch {
        // Best effort.
      }
    }
  }

  /* ---------------- APP STATE ---------------- */

  private onAppStateChange = (state: AppStateStatus) => {
    this.appState = state;
    if (state !== 'active') {
      this.stopBackground();
      this.stopEffects();
    } else {
      this.startBackground().catch(() => {});
    }
  };
}

export const soundManager = SoundManager.I;
