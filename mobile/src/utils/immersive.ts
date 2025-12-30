import * as NavigationBar from 'expo-navigation-bar';

export async function enterImmersiveMode() {
  await NavigationBar.setVisibilityAsync('hidden');
  await NavigationBar.setBehaviorAsync('overlay-swipe');
}

export async function exitImmersiveMode() {
  await NavigationBar.setVisibilityAsync('visible');
}
