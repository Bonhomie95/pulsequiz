/**
 * The server's clock, as best we can tell from here.
 *
 * Question deadlines are absolute instants issued by the server, and the app
 * used to compare them against the device's own `Date.now()`. That silently
 * assumed both clocks agree. A phone running even 15s fast then evaluated
 * every fresh deadline as already expired, fired the timeout on question 1,
 * and — in a sudden-death mode — ended the run before the player could read
 * the question. Nothing in the UI hinted why, and the server saw a perfectly
 * ordinary `selected: null`.
 *
 * Every HTTP response carries the server's time in the `Date` header, so the
 * offset is free to measure and needs no API change. Deadline maths uses
 * `serverNow()` instead of `Date.now()` from here on.
 *
 * Accuracy is roughly ±1s: the header has second granularity and we ignore the
 * round trip. That is far inside the server's own 2.5s answer grace, and the
 * point is to catch clocks that are wrong by seconds or more, not to shave
 * milliseconds.
 */
let skewMs = 0;

/** Feed the `Date` header of any server response. Ignores junk. */
export function noteServerDate(header: string | undefined | null): void {
  if (!header) return;
  const serverMs = Date.parse(header);
  if (Number.isNaN(serverMs)) return;
  skewMs = serverMs - Date.now();
}

/** Current time on the server's clock. */
export function serverNow(): number {
  return Date.now() + skewMs;
}

/** How far the device clock is off, for logging and tests. */
export function clockSkewMs(): number {
  return skewMs;
}

/** Test seam. */
export function resetServerClock(): void {
  skewMs = 0;
}

/**
 * Turn a server-issued deadline into an instant we can safely count down to.
 *
 * `windowMs` is the full time allowed for one question. A deadline that has
 * already passed, or that is implausibly far out, cannot be honoured — counting
 * down to it ends the run before the player has read anything. We fall back to
 * a fresh window instead. The server stays authoritative either way: it rejects
 * genuinely late answers, and the caller already handles that rejection.
 */
export function deadlineFrom(
  raw: string | number | null | undefined,
  windowMs: number,
): number {
  const now = serverNow();
  const fallback = now + windowMs;
  if (raw == null) return fallback;
  const t = typeof raw === 'number' ? raw : Date.parse(raw);
  if (Number.isNaN(t)) return fallback;
  if (t <= now || t > now + windowMs * 2) return fallback;
  return t;
}
