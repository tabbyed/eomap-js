import { AMBIENT_PRESETS } from "./settings.js";

export const SECONDS_PER_DAY = 86400;

// The sky across a day, in hours: night until dawn, day from mid-morning to
// early evening, and dusk's light at either end of it. Between two marks the
// light blends evenly, so dawn and dusk each take an hour and a half.
const SKY = [
  [0, AMBIENT_PRESETS.night],
  [5, AMBIENT_PRESETS.night],
  [6.5, AMBIENT_PRESETS.dusk],
  [8, AMBIENT_PRESETS.day],
  [17, AMBIENT_PRESETS.day],
  [18.5, AMBIENT_PRESETS.dusk],
  [20, AMBIENT_PRESETS.night],
  [24, AMBIENT_PRESETS.night],
];

/**
 * The ambient light at a time of day, given in seconds after midnight, as
 * lighting settings' `ambient`: { brightness, color }.
 */
export function ambientAt(seconds) {
  const day = ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hour = day / 3600;
  let next = 1;
  while (SKY[next][0] <= hour && next < SKY.length - 1) next++;
  const [fromHour, from] = SKY[next - 1];
  const [toHour, to] = SKY[next];
  const t = (hour - fromHour) / (toHour - fromHour);
  return {
    brightness:
      Math.round(mix(from.brightness, to.brightness, t) * 1000) / 1000,
    color: mixColor(from.color, to.color, t),
  };
}

/**
 * How strongly lamp glass, halos and window panes glow under an ambient
 * light, from 0 to 1: fully at night or darker, not at all in daylight.
 * Flames still burn by day; only their glow fades.
 */
export function glowStrength(ambient) {
  const night = AMBIENT_PRESETS.night.brightness;
  const strength = (1 - ambient.brightness) / (1 - night);
  return Math.max(0, Math.min(1, strength));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  const from = parseInt(a.slice(1), 16);
  const to = parseInt(b.slice(1), 16);
  let color = 0;
  for (const shift of [16, 8, 0]) {
    const channel = Math.round(
      mix((from >> shift) & 255, (to >> shift) & 255, t),
    );
    color = (color << 8) | channel;
  }
  return `#${color.toString(16).padStart(6, "0")}`;
}
