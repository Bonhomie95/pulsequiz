/** Share helpers for the daily quiz and friend challenges. */

/** Day #1 of the daily puzzle — must match the server's dailyService EPOCH. */
const EPOCH = Date.UTC(2026, 0, 1);

export function dailyNumber(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - EPOCH) / 86_400_000) + 1;
}

/** "1101" → "🟩🟩🟥🟩" */
export function resultGrid(results: string | boolean[]): string {
  const list = typeof results === 'string' ? results.split('').map((c) => c === '1') : results;
  return list.map((ok) => (ok ? '🟩' : '🟥')).join('');
}

/** The player's local calendar date, YYYY-MM-DD — the daily puzzle's key. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
