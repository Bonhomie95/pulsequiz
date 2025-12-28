import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';
import { theme } from './index';

export function useTheme() {
  const system = useColorScheme();
  const mode = useThemeStore((s) => s.mode);

  const resolved =
    mode === 'system' ? system : mode;

  return resolved === 'light'
    ? theme.light
    : theme.dark;
}
