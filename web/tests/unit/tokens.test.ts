import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/core/color';
import tokensCss from '@/ui/tokens.css?raw';

function block(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const dark = block(':root');
const light = { ...dark, ...block(":root[data-theme='light']") };

/** 文字色 × 底色：都要 ≥ 4.5 */
const TEXT_PAIRS: [string, string][] = [];
for (const fg of ['text', 'text-muted', 'accent', 'danger', 'warning', 'success']) {
  for (const bg of ['bg', 'surface', 'surface-2']) TEXT_PAIRS.push([fg, bg]);
}
TEXT_PAIRS.push(
  ['accent-contrast', 'accent'],
  ['danger-contrast', 'danger'],
  ['warning-contrast', 'warning'],
  ['success-contrast', 'success'],
);

describe('設計 token 對比度', () => {
  for (const [name, theme] of [
    ['深色', dark],
    ['淺色', light],
  ] as const) {
    it(`${name}主題：文字對比至少 4.5:1`, () => {
      const bad = TEXT_PAIRS.map(([fg, bg]) => ({
        fg,
        bg,
        ratio: contrastRatio(theme[fg], theme[bg]),
      })).filter((p) => p.ratio < 4.5);
      expect(bad).toEqual([]);
    });
    it(`${name}主題：輸入框邊框對比至少 3:1`, () => {
      expect(contrastRatio(theme['border-strong'], theme.surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme['border-strong'], theme['surface-2'])).toBeGreaterThanOrEqual(3);
    });
  }

  it('DESIGN.md 列出的 token 都有定義', () => {
    for (const k of [
      'bg',
      'surface',
      'surface-2',
      'border',
      'text',
      'text-muted',
      'accent',
      'accent-contrast',
      'danger',
      'warning',
      'success',
      'font-ui',
      'font-mono',
      'text-xs',
      'text-xl',
      'space-1',
      'space-8',
      'radius-sm',
      'radius',
      'radius-lg',
      'shadow-1',
      'shadow-2',
      'ease-out',
      'duration-fast',
      'duration',
    ]) {
      expect(dark[k], k).toBeTruthy();
    }
  });
});
