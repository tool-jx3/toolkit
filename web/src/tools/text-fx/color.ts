/** 顏色小工具（與舊版相同的字串格式，畫出來的顏色逐位元相同） */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** '#rgb'／'#rrggbb' → [r, g, b]；不合法時當白色 */
export function hexToRgb(hex: string): [number, number, number] {
  let h = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [255, 255, 255];
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 'rgba(r,g,b,a)' */
export function rgba(hex: string, a = 1): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}
