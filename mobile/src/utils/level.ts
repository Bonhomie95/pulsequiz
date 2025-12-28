export function getLevelFromPoints(points: number) {
  if (points < 50) return 1;
  if (points < 120) return 2;
  if (points < 250) return 3;
  if (points < 450) return 4;
  if (points < 700) return 5;
  if (points < 1000) return 6;
  return Math.floor(points / 200) + 1;
}
