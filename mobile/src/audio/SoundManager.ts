import { Audio } from 'expo-av';
import { AppState, AppStateStatus } from 'react-native';

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

// ✅ Add your background music here
const BG_MUSIC = require('@/assets/sounds/bg.mp3');

class SoundManager {
  private static instance: SoundManager;
  static get I() {
    if (!this.instance) this.instance = new SoundManager();
    return this.instance;
  }

  private booted = false;
  private appState: AppStateStatus = AppState.currentState;

  // Background music sound (persistent)
  private bg: Audio.Sound | null = null;
  private bgLoaded = false;

  // Preloaded pool of short effect sounds — loaded once and replayed, so we
  // never load/unload a native player on every tap (that churn heats the
  // phone during active play).
  private fxPool: Partial<Record<SoundKey, Audio.Sound>> = {};

  private muted = false;
  private masterVolume = 1;
  private effectsVolume = 1;

  private lastPlayedAt: Partial<Record<SoundKey, number>> = {};

  private constructor() {}

  /* ---------------- BOOT ---------------- */

  async boot() {
    if (this.booted) return;
    this.booted = true;

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    await this.preloadEffects();

    AppState.addEventListener('change', this.onAppStateChange);
  }

  /** Load every short effect once so `play()` can just replay it. */
  private async preloadEffects() {
    await Promise.all(
      (Object.keys(SOUNDS) as SoundKey[]).map(async (key) => {
        if (this.fxPool[key]) return;
        try {
          const s = new Audio.Sound();
          await s.loadAsync(SOUNDS[key].source, { shouldPlay: false });
          this.fxPool[key] = s;
        } catch {
          // Leave it out of the pool; play() will lazily load it on demand.
        }
      }),
    );
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
    // Stop background completely
    await this.stopBackground();
  }

  async exitResultMode() {
    // Resume background immediately
    await this.startBackground();
  }

  private applyVolumes() {
    // background uses master only
    if (this.bg && this.bgLoaded && !this.muted) {
      this.bg.setVolumeAsync(this.masterVolume).catch(() => {});
    }
  }

  /* ---------------- BACKGROUND MUSIC ---------------- */

  async startBackground() {
    if (!this.booted) await this.boot();
    if (this.muted) return;
    if (this.appState !== 'active') return;

    try {
      if (!this.bg) this.bg = new Audio.Sound();

      if (!this.bgLoaded) {
        await this.bg.loadAsync(BG_MUSIC, {
          shouldPlay: false,
          isLooping: true,
          volume: this.masterVolume,
        });
        this.bgLoaded = true;
      }

      const status: any = await this.bg.getStatusAsync();
      if (!status?.isPlaying) {
        await this.bg.setIsLoopingAsync(true);
        await this.bg.setVolumeAsync(this.masterVolume);
        await this.bg.playAsync();
      }
    } catch {
      this.bgLoaded = false;
    }
  }

  async stopBackground() {
    if (!this.bg) return;
    try {
      const st: any = await this.bg.getStatusAsync();
      if (st?.isLoaded) {
        if (st.isPlaying) await this.bg.stopAsync();
        await this.bg.unloadAsync();
      }
    } catch {}
    this.bg = null;
    this.bgLoaded = false;
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
        // Not preloaded (or a prior load failed) — load once and keep it.
        s = new Audio.Sound();
        await s.loadAsync(cfg.source, { shouldPlay: false });
        this.fxPool[key] = s;
      }

      const vol =
        (cfg.baseVolume ?? 1) * this.masterVolume * this.effectsVolume;
      await s.setVolumeAsync(vol);
      // replayAsync rewinds to 0 and plays — no per-tap load/unload churn.
      await s.replayAsync();
    } catch {
      // Pooled instance is in a bad state — drop it so the next call reloads.
      this.fxPool[key] = undefined;
    }
  }

  async stopEffects() {
    // Stop any playing effects but keep them loaded for reuse.
    await Promise.all(
      Object.values(this.fxPool).map((s) =>
        s?.stopAsync().catch(() => {}),
      ),
    );
  }

  /* ---------------- APP STATE ---------------- */

  private onAppStateChange = (state: AppStateStatus) => {
    this.appState = state;
    if (state !== 'active') {
      this.stopBackground();
      this.stopEffects();
    } else {
      // resume background if needed
      this.startBackground().catch(() => {});
    }
  };
}

export const soundManager = SoundManager.I;
