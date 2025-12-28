/**
 * Level curve:
 * Level 1: 0–99
 * Level 2: 100–249
 * Level 3: 250–449
 * Level 4: 450–699
 * etc (progressively harder)
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
