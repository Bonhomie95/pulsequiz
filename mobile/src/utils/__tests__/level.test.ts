import { getLevelFromPoints } from '../level';

describe('getLevelFromPoints', () => {
  it('maps the fixed early brackets', () => {
    expect(getLevelFromPoints(0)).toBe(1);
    expect(getLevelFromPoints(49)).toBe(1);
    expect(getLevelFromPoints(50)).toBe(2);
    expect(getLevelFromPoints(119)).toBe(2);
    expect(getLevelFromPoints(250)).toBe(4);
    expect(getLevelFromPoints(999)).toBe(6);
  });

  it('scales linearly past the fixed brackets', () => {
    expect(getLevelFromPoints(1000)).toBe(6);
    expect(getLevelFromPoints(1200)).toBe(7);
    expect(getLevelFromPoints(2000)).toBe(11);
  });

  it('never returns below level 1', () => {
    expect(getLevelFromPoints(-100)).toBe(1);
  });
});
