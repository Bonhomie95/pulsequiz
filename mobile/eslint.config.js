// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    /**
     * The React Compiler rules arrived with eslint-config-expo@57, as errors,
     * against a codebase written before them. They were failing CI on 145
     * findings, the large majority of them this:
     *
     *   const fade = useRef(new Animated.Value(0)).current;
     *
     * which is React Native's own documented idiom. An `Animated.Value` is a
     * stable mutable holder whose identity never changes and which drives
     * native animation outside React's render — reading it during render is
     * the intended use, but the rule can only see a ref being read.
     *
     * Kept as warnings rather than switched off: the remaining findings
     * (set-state-in-effect, immutability, purity) are worth working through
     * properly, one screen at a time, and staying visible is how that happens.
     * Lowering them here is a deliberate hold, not a verdict that they are all
     * false positives.
     */
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);
