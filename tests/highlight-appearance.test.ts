import { expect, it } from 'vitest';
import { highlightOpacity } from '../lib/highlight-appearance';

it.each(['yellow', 'mint', 'lilac', 'coral'] as const)(
  'keeps %s visible without washing out readable gray text on a dark page',
  (color) => {
    const opacity = highlightOpacity([170, 170, 170], [51, 51, 51], color);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.1);
  },
);

it('retains stronger highlights for high-contrast text on white pages', () => {
  expect(highlightOpacity([36, 33, 29], [255, 255, 255], 'yellow')).toBe(0.24);
});

it('does not reduce contrast further when host text already falls below 4.5:1', () => {
  expect(highlightOpacity([120, 120, 120], [51, 51, 51], 'yellow')).toBe(0);
});
