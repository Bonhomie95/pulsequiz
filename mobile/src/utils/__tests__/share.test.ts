import { dailyNumber, localDateKey, resultGrid } from '../share';

describe('share helpers', () => {
  it('numbers daily puzzles from 2026-01-01', () => {
    expect(dailyNumber('2026-01-01')).toBe(1);
    expect(dailyNumber('2026-09-22')).toBe(265);
  });
  it('draws the grid', () => {
    expect(resultGrid('1101')).toBe('🟩🟩🟥🟩');
    expect(resultGrid([true, false])).toBe('🟩🟥');
  });
  it('formats a local date', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
