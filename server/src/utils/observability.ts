/**
 * Error reporting and process-level crash guards.
 *
 * Two jobs:
 *   1. Wire Sentry (when SENTRY_DSN is set) into the logger's sinks.
 *   2. Make sure an unhandled rejection reports and drains instead of killing
 *      the process mid-write. Node >= 15 terminates on unhandled rejections by
 *      default; every async socket handler is a candidate, so without this a
 *      single bad query takes down every live match on the box.
 */
import * as Sentry from '@sentry/node';
import { logger, sinks } from './logger';

let started = false;

export function initObservability() {
  if (started) return;
  started = true;

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      // The logger already redacts; this is a second line of defence.
      sendDefaultPii: false,
    });

    sinks.reportError = (err, ctx) => {
      Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
    };
    sinks.reportMessage = (msg, ctx) => {
      Sentry.captureMessage(msg, { level: 'warning', ...(ctx ? { extra: ctx } : {}) });
    };

    logger.info('Sentry initialised', { environment: process.env.NODE_ENV });
  } else {
    logger.warn('SENTRY_DSN not set — server errors will only reach stdout');
  }
}

/**
 * Install the process guards. `onFatal` is given a chance to drain connections
 * before the process exits.
 */
export function installCrashGuards(onFatal: () => Promise<void>) {
  let shuttingDown = false;

  const fatal = async (kind: string, err: unknown) => {
    logger.error(`Fatal: ${kind}`, err);
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await Sentry.flush(2000).catch(() => {});
      await onFatal();
    } finally {
      process.exit(1);
    }
  };

  // An unhandled rejection is a bug, not a reason to drop every live socket
  // without warning. Report it, drain, then exit so the orchestrator restarts
  // us cleanly rather than mid-transaction.
  process.on('unhandledRejection', (reason) => {
    void fatal('unhandledRejection', reason);
  });

  process.on('uncaughtException', (err) => {
    void fatal('uncaughtException', err);
  });
}

export { Sentry };
