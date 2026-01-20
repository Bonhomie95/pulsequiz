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
  victory: { source: require('@/assets/sounds/victory.mp3'), baseVolume: 1 },
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

  // Effects sound (short sounds)
  private fx: Audio.Sound | null = null;

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

    AppState.addEventListener('change', this.onAppStateChange);
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
      // Create a fresh sound per effect (avoids conflicts)
      const s = new Audio.Sound();
      await s.loadAsync(cfg.source, { shouldPlay: false });

      const vol =
        (cfg.baseVolume ?? 1) * this.masterVolume * this.effectsVolume;
      await s.setVolumeAsync(vol);
      await s.playAsync();

      s.setOnPlaybackStatusUpdate((st: any) => {
        if (st?.didJustFinish) {
          s.unloadAsync().catch(() => {});
        }
      });

      this.fx = s;
    } catch {}
  }

  async stopEffects() {
    if (!this.fx) return;
    try {
      await this.fx.stopAsync();
      await this.fx.unloadAsync();
    } catch {}
    this.fx = null;
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

// const instance = SoundManager.I;

// export const soundManager = {
//   preload: (...args: Parameters<typeof instance.preload>) =>
//     instance.preload(...args),

//   play: (...args: Parameters<typeof instance.play>) => instance.play(...args),

//   stop: () => instance.stop?.(),

//   setMuted: (v: boolean) => instance.setMuted(v),
//   setMasterVolume: (v: number) => instance.setMasterVolume(v),
//   setEffectsVolume: (v: number) => instance.setEffectsVolume(v),
// };
