import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Immersive (full-screen) mode.
 *
 * `expo-navigation-bar` only implements these on Android — there is no
 * navigation bar to hide on iOS — and calling them anyway logs a warning per
 * call. Six screens call this on focus, so unguarded it floods the log.
 *
 * Callers fire these without awaiting, so a rejection here would surface as an
 * unhandled promise rejection rather than anything actionable. Cosmetic chrome
 * is not worth a crash report: swallow and carry on.
 */
const supported = Platform.OS === 'android';

export async function enterImmersiveMode() {
  if (!supported) return;
  try {
    await NavigationBar.setVisibilityAsync('hidden');
    await NavigationBar.setBehaviorAsync('overlay-swipe');
  } catch {
    // Best-effort only.
  }
}

export async function exitImmersiveMode() {
  if (!supported) return;
  try {
    await NavigationBar.setVisibilityAsync('visible');
  } catch {
    // Best-effort only.
  }
}
