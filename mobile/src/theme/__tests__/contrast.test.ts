import { colors } from '../colors';

/**
 * Contrast guard.
 *
 * The light palette previously used #2EF2B3 (~1.6:1 on white) and #EAB308
 * (~2.1:1) as text colours, well under the 4.5:1 WCAG AA requirement. This
 * test fails if a text-carrying token drifts back below the threshold.
 */
function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

describe('light theme contrast', () => {
  const { light } = colors;

  it.each([
    ['text', light.text],
    ['muted', light.muted],
    ['primary', light.primary],
    ['secondary', light.secondary],
    ['coin', light.coin],
    ['danger', light.danger],
    ['success', light.success],
  ])('%s meets AA against the background', (_name, color) => {
    expect(contrast(color, light.background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('text on the surface colour is legible', () => {
    expect(contrast(light.text, light.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(light.muted, light.surface)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('onPrimary is legible on primary', () => {
    expect(contrast(light.onPrimary, light.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('dark theme contrast', () => {
  const { dark } = colors;

  it.each([
    ['text', dark.text],
    ['muted', dark.muted],
    ['primary', dark.primary],
    ['secondary', dark.secondary],
    ['coin', dark.coin],
    ['danger', dark.danger],
    ['success', dark.success],
  ])('%s meets AA against the background', (_name, color) => {
    expect(contrast(color, dark.background)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('text on the surface colour is legible', () => {
    expect(contrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(dark.muted, dark.surface)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
