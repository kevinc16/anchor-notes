import type { HighlightColor } from './types';

const COLORS: Record<HighlightColor, number[]> = {
  yellow: [255, 215, 74],
  mint: [114, 225, 190],
  lilac: [187, 151, 255],
  coral: [255, 139, 119],
};

function luminance(rgb: number[]): number {
  const channels = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: number[], background: number[]): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function highlightOpacity(foreground: number[], background: number[], color: HighlightColor): number {
  const minimum = Math.min(4.5, contrast(foreground, background));
  for (let step = 24; step > 0; step--) {
    const alpha = step / 100;
    const blended = (COLORS[color] ?? COLORS.yellow).map(
      (value, index) => value * alpha + background[index]! * (1 - alpha),
    );
    if (contrast(foreground, blended) >= minimum) return alpha;
  }
  return 0;
}
