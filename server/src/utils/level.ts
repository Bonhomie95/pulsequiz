/**
 * Level curve — each level costs 150 more points than the last.
 *
 *   Level 1:    0 –   99
 *   Level 2:  100 –  399
 *   Level 3:  400 –  849
 *   Level 4:  850 – 1449
 *   Level 5: 1450 – 2199
 *
 * (The comment that used to sit here described 100/250/450, which is not what
 * this function computes. Changing the curve would silently re-level every
 * existing account, so the documentation is what was wrong.)
 */
export function getLevelFromPoints(points: number): number {
  if (points < 100) return 1;

  let level = 1;
  let threshold = 100;

  while (points >= threshold) {
    level++;
    threshold += level * 150;
  }

  return level;
}
