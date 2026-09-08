export const USER_COLOR = '#2563EB';
export const SHARED_COLOR = '#7C3AED';
export const ASSISTANT_COLOR = '#C2410C';

type Rgb = readonly [number, number, number];

const parseHex = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const interpolate = (from: Rgb, to: Rgb, amount: number): Rgb => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

/** Positive bias is user/blue, negative bias is assistant/orange. */
export const colorForBias = (bias: number): string => {
  const safeBias = Math.max(-1, Math.min(1, Number.isFinite(bias) ? bias : 0));
  const shared = parseHex(SHARED_COLOR);
  if (safeBias >= 0) return toHex(interpolate(shared, parseHex(USER_COLOR), safeBias));
  return toHex(interpolate(shared, parseHex(ASSISTANT_COLOR), -safeBias));
};

export const getTermColor = colorForBias;
