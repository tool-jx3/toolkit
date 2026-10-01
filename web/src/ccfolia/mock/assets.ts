/**
 * 模擬頁用的範例圖（本專案自繪的簡單 SVG）：頭像、立繪、骰子圖、Discord 頭像。
 * 全部是 data URI，預覽不需要連網。
 */

const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const PALETTE = [
  '#5b7bd5',
  '#d5675b',
  '#4fa37a',
  '#b07ad0',
  '#d0a24a',
  '#4aa8c0',
  '#c25d8d',
  '#7a8a99',
];

/** 依序號取一個顏色 */
export const mockColor = (seed: number): string =>
  PALETTE[((Math.trunc(seed) % PALETTE.length) + PALETTE.length) % PALETTE.length];

/** 正方形頭像（角色棋子）：色底＋簡單的人形 */
export function mockAvatar(seed = 0): string {
  const c = mockColor(seed);
  return svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>` +
      `<rect width='128' height='128' fill='${c}'/>` +
      `<circle cx='64' cy='50' r='26' fill='#f4e3d3'/>` +
      `<path d='M38 44 Q64 8 90 44 Q86 26 64 22 Q42 26 38 44Z' fill='#3b3040'/>` +
      `<circle cx='55' cy='52' r='3' fill='#3b3040'/><circle cx='73' cy='52' r='3' fill='#3b3040'/>` +
      `<path d='M22 128 Q24 86 64 82 Q104 86 106 128Z' fill='#ffffff' opacity='0.85'/>` +
      `</svg>`,
  );
}

/**
 * 範例立繪：full＝全身直式（1:2，240 × 480），half＝半身正方形（300 × 300）。透明背景。
 */
export function mockPortrait(shape: 'full' | 'half' = 'full', seed = 0): string {
  const c = mockColor(seed);
  if (shape === 'half')
    return svgUri(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300' width='300' height='300'>` +
        `<path d='M40 300 Q46 196 150 186 Q254 196 260 300Z' fill='${c}'/>` +
        `<circle cx='150' cy='112' r='62' fill='#f4e3d3'/>` +
        `<path d='M86 104 Q150 10 214 104 Q206 56 150 46 Q94 56 86 104Z' fill='#3b3040'/>` +
        `<circle cx='128' cy='118' r='6' fill='#3b3040'/><circle cx='172' cy='118' r='6' fill='#3b3040'/>` +
        `</svg>`,
    );
  return svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 480' width='240' height='480'>` +
      `<path d='M70 150 Q120 130 170 150 L196 330 Q120 352 44 330Z' fill='${c}'/>` +
      `<path d='M88 330 L80 470 L108 470 L118 340Z M152 330 L160 470 L132 470 L122 340Z' fill='#3b3040'/>` +
      `<circle cx='120' cy='88' r='46' fill='#f4e3d3'/>` +
      `<path d='M72 84 Q120 10 168 84 Q162 44 120 36 Q78 44 72 84Z' fill='#3b3040'/>` +
      `<circle cx='104' cy='92' r='5' fill='#3b3040'/><circle cx='136' cy='92' r='5' fill='#3b3040'/>` +
      `</svg>`,
  );
}

/** 骰子圖：十面骰（d10）是風箏形、其他是圓角方形；中間寫出目 */
export function mockDie(faces: number, value: number): string {
  const text = String(value);
  const size = text.length >= 3 ? 26 : text.length === 2 ? 30 : 36;
  const shape =
    faces === 10
      ? `<path d='M40 4 L74 34 L40 76 L6 34Z' fill='#f2f2f2' stroke='#333' stroke-width='3' stroke-linejoin='round'/>` +
        `<path d='M6 34 L40 46 L74 34 M40 46 L40 76' fill='none' stroke='#999' stroke-width='2'/>`
      : `<rect x='6' y='6' width='68' height='68' rx='12' fill='#f2f2f2' stroke='#333' stroke-width='3'/>`;
  return svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' width='80' height='80'>${shape}` +
      `<text x='40' y='${faces === 10 ? 40 : 42}' font-family='Arial, sans-serif' font-weight='700' font-size='${size}' text-anchor='middle' dominant-baseline='middle' fill='#222'>${text}</text></svg>`,
  );
}

/**
 * Discord 使用者頭像（模擬用）：data URI 的圖，後面以「#」接上 Discord 頭像網址的路徑，
 * 讓 `img[src*="/avatars/{ID}/"]` 這種選擇器在預覽裡也選得到，又不必連到 Discord。
 * custom＝false 時模擬「沒有自訂頭像」（預設頭像網址不含 ID）。
 */
export function mockDiscordAvatar(userId: string, seed = 0, custom = true): string {
  const c = mockColor(seed + 3);
  const img = svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>` +
      `<rect width='128' height='128' fill='${custom ? c : '#5865f2'}'/>` +
      (custom
        ? `<circle cx='64' cy='54' r='28' fill='#f4e3d3'/><path d='M20 128 Q24 88 64 86 Q104 88 108 128Z' fill='#ffffff' opacity='0.85'/>`
        : `<path d='M34 46 Q64 30 94 46 L100 88 Q64 104 28 88Z' fill='#ffffff'/><circle cx='50' cy='66' r='8' fill='#5865f2'/><circle cx='78' cy='66' r='8' fill='#5865f2'/>`) +
      `</svg>`,
  );
  const id = String(userId).replace(/\D+/g, '');
  const path = custom
    ? `https://cdn.discordapp.com/avatars/${id}/tk${(seed + 1).toString(16)}mock.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${((seed % 6) + 6) % 6}.png`;
  return `${img}#${path}`;
}
