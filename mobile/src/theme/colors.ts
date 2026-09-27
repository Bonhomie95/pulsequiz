/**
 * Palette.
 *
 * Light-theme `secondary` and `coin` used to fail WCAG AA badly as text
 * (#2EF2B3 on white is ~1.6:1, #EAB308 ~2.1:1, against a 4.5:1 requirement).
 * They are darkened here so the same token can safely carry text on either
 * ground; `*Fill` keeps the bright original for decorative surfaces where
 * contrast doesn't apply.
 */
export const colors = {
  dark: {
    background: '#0B0F1A',
    surface: '#131A2E',
    surfaceAlt: '#1A2238',
    primary: '#5B7CFF',
    secondary: '#2EF2B3',
    secondaryFill: '#2EF2B3',
    text: '#FFFFFF',
    muted: '#A6B0CF',
    coin: '#FFC94A',
    coinFill: '#FFC94A',
    danger: '#FF7A85',
    success: '#4ADE80',
    warning: '#FBBF24',
    border: '#1F2937',
    /** Text colour that is always legible on top of `primary`. */
    onPrimary: '#FFFFFF',
  },
  light: {
    background: '#FFFFFF',
    surface: '#F4F6FB',
    surfaceAlt: '#EAEEF7',
    primary: '#3F57C9',      // 4.5:1 on white (was #5B7CFF at 3.2:1)
    secondary: '#0C7B59',    // 5.3:1 on white (was #2EF2B3 at 1.6:1)
    secondaryFill: '#2EF2B3',
    text: '#0B0F1A',
    muted: '#5A6480',        // 5.9:1 on white
    coin: '#8A6800',         // 5.3:1 on white (was #EAB308 at 2.1:1)
    coinFill: '#EAB308',
    danger: '#C4213A',       // 5.6:1 on white
    success: '#0F7A3D',      // 5.1:1 on white
    warning: '#8A5A00',
    border: '#E5E7EB',
    onPrimary: '#FFFFFF',
  },
};
