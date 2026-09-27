import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * The PulseCoin mark.
 *
 * A gold disc with a currency glyph would look like every other in-app
 * currency and say nothing about this app. This is the launcher icon struck as
 * a coin: the same white ECG pulse on the same indigo → blue → teal gradient,
 * inside a rim that reads as money at 16px.
 *
 * Pure vector, so it stays sharp at every size and needs no raster assets.
 * The waveform is the one from the icon, redrawn to sit on a circle rather
 * than a rounded square — the flat leads are shortened so they clear the rim.
 */
export function PulseCoin({ size = 24 }: { size?: number }) {
  // One viewBox, so every measurement below is in the same 64-unit space.
  const S = 64;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${S} ${S}`}>
      <Defs>
        <LinearGradient id="pcFace" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B3FB6" />
          <Stop offset="0.45" stopColor="#4F6BF0" />
          <Stop offset="0.75" stopColor="#3FA9F5" />
          <Stop offset="1" stopColor="#2DD4A7" />
        </LinearGradient>
        <LinearGradient id="pcRim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8FA6FF" />
          <Stop offset="1" stopColor="#1FA98A" />
        </LinearGradient>
        {/* A single soft highlight, top-left, so it reads as struck metal
            rather than a flat circle. */}
        <RadialGradient id="pcShine" cx="0.32" cy="0.26" r="0.55">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.38" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Rim, then face inset from it. */}
      <Circle cx={32} cy={32} r={31} fill="url(#pcRim)" />
      <Circle cx={32} cy={32} r={27.5} fill="url(#pcFace)" />
      <Circle cx={32} cy={32} r={27.5} fill="url(#pcShine)" />

      {/* The pulse. Same shape as the launcher icon: a flat lead in, a small
          rise, the deep trough, the tall peak, and a flat lead out. */}
      <Path
        d="M12 33 H21.5 L26.5 24.5 L32 45 L38.5 19 L43.5 33 H52"
        stroke="#FFFFFF"
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
