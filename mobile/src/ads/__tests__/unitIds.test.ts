import { isTestAdUnit } from '../unitIds';

describe('isTestAdUnit', () => {
  it('spots Google demo units', () => {
    expect(isTestAdUnit('ca-app-pub-3940256099942544/1712485313')).toBe(true);
  });

  it('leaves our own units alone', () => {
    expect(isTestAdUnit('ca-app-pub-3226169062425843/5799411496')).toBe(false);
    expect(isTestAdUnit('')).toBe(false);
  });
});
