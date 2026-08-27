/**
 * Tiny logging facade.
 *
 * - In development it prints to the console.
 * - In production it stays quiet by default (no info/debug noise, no internal
 *   details leaking to device logs) but still forwards warnings/errors to a
 *   pluggable sink so you can wire Sentry/Crashlytics in one place.
 *
 * To add crash reporting later, set `logger.reportError` / `logger.reportMessage`
 * from your init code (e.g. `logger.reportError = Sentry.captureException`).
 */
type Reporter = (error: unknown, context?: Record<string, unknown>) => void;
type MessageReporter = (message: string, context?: Record<string, unknown>) => void;

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  // Optional external sinks — no-ops until wired up.
  reportError: (() => {}) as Reporter,
  reportMessage: (() => {}) as MessageReporter,

  debug(...args: unknown[]) {
    if (isDev) console.log(...args);
  },

  info(...args: unknown[]) {
    if (isDev) console.info(...args);
  },

  warn(...args: unknown[]) {
    if (isDev) console.warn(...args);
    try {
      this.reportMessage(String(args[0]), { args: args.slice(1) });
    } catch {}
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    if (isDev) console.error(message, error ?? '', context ?? '');
    try {
      this.reportError(error ?? message, { message, ...context });
    } catch {}
  },
};
