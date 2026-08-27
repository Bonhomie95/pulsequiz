/**
 * Structured server logging.
 *
 * Everything goes to stdout/stderr as single-line JSON so a log shipper
 * (CloudWatch, Loki, Datadog) can index it. `LOG_PRETTY=1` switches to a
 * human-readable form for local development.
 *
 * Errors are additionally forwarded to Sentry when a DSN is configured — see
 * `observability.ts`, which installs the sink at startup.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? 20;
const PRETTY = process.env.LOG_PRETTY === '1' || process.env.NODE_ENV !== 'production';

export type LogContext = Record<string, unknown>;

/** Keys whose values must never reach a log line or an error report. */
const REDACT = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'idtoken', 'purchasetoken',
  'authorization', 'cookie', 'jwt', 'secret', 'apikey', 'privatekey',
  'usdtaddress', 'email',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/** Installed by observability.ts once Sentry is initialised. */
export const sinks: {
  reportError: (err: unknown, ctx?: LogContext) => void;
  reportMessage: (msg: string, ctx?: LogContext) => void;
} = {
  reportError: () => {},
  reportMessage: () => {},
};

function emit(level: Level, message: string, ctx?: LogContext, err?: unknown) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const record = {
    level,
    time: new Date().toISOString(),
    message,
    ...(ctx ? (redact(ctx) as LogContext) : {}),
    ...(err !== undefined ? { error: serializeError(err) } : {}),
  };

  const line = PRETTY
    ? `${level.toUpperCase().padEnd(5)} ${record.time} ${message} ${
        ctx || err ? JSON.stringify({ ...record, level: undefined, time: undefined, message: undefined }) : ''
      }`
    : JSON.stringify(record);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, ctx?: LogContext) => emit('debug', message, ctx),
  info: (message: string, ctx?: LogContext) => emit('info', message, ctx),

  warn(message: string, ctx?: LogContext) {
    emit('warn', message, ctx);
    try { sinks.reportMessage(message, ctx); } catch { /* never let logging throw */ }
  },

  error(message: string, err?: unknown, ctx?: LogContext) {
    emit('error', message, ctx, err);
    try { sinks.reportError(err ?? new Error(message), { message, ...ctx }); } catch { /* ditto */ }
  },
};
