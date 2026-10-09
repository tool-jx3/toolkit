/**
 * 產生 discord-color 的 ANSI 對照值：隨機的格式樹丟給原作頁面（`tests/unit/fixtures/discord-color-original.html`，
 * 公有領域）的 getANSIResult() 算出輸出，寫成 `tests/unit/fixtures/discord-color-ansi.json`。
 * 單元測試（`tests/unit/discord-color-ansi.test.ts`）逐字比對新版的輸出。
 *
 *   cd web && node --experimental-strip-types tests/parity/discord-color/gen-ansi-cases.ts [數量] [種子]
 *
 * 每一筆是 `[格式樹, 原作的輸出]`；格式樹用精簡寫法：文字是字串、換行是 0、
 * 樣式／經典色是 `[代碼, ...內容]`、RGB 色是 `["#RRGGBB", 1＝前景／0＝背景, ...內容]`。
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers'))
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';

type Compact = string | 0 | [number, ...Compact[]] | [string, 0 | 1, ...Compact[]];

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, '../../unit/fixtures');
const count = Number(process.argv[2] ?? 150);
let seed = Number(process.argv[3] ?? 20261009);

/** mulberry32 */
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];

const CODES = [0, 1, 3, 4, 9, 30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43, 44, 45, 46, 47];
const HEXES = ['#000000', '#FFFFFF', '#DE4040', '#5865F2', '#FD9855', '#D161A2'];
const WORDS = ['a', 'bc', ' ', '彩色', 'Hi', 'x y', '字', '!', '🎲', '\n'];

function gen(depth: number): Compact[] {
  const n = Math.floor(rand() * (depth === 0 ? 5 : 4)) + (depth === 0 ? 1 : 0);
  const out: Compact[] = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < 0.3 || depth >= 3) out.push(pick(WORDS));
    else if (r < 0.38) out.push(0);
    else if (r < 0.7) out.push([pick(CODES), ...gen(depth + 1)]);
    else out.push([pick(HEXES), rand() < 0.55 ? 1 : 0, ...gen(depth + 1)]);
  }
  return out;
}

const docs = Array.from({ length: count }, () => gen(0));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${path.join(fixtures, 'discord-color-original.html')}`);
const outputs: string[] = await page.evaluate((all: unknown[][]) => {
  const ta = document.querySelector('#textarea') as HTMLElement;
  const build = (nodes: unknown[]): Node[] =>
    nodes.map((n) => {
      if (typeof n === 'string') return document.createTextNode(n);
      if (n === 0) return document.createElement('br');
      const [head, ...rest] = n as [number | string, ...unknown[]];
      const span = document.createElement('span');
      if (typeof head === 'number') {
        span.className = `ansi-${head}`;
        span.append(...build(rest));
      } else {
        span.className = 'ansi-rgb';
        span.dataset.hex = head;
        if (rest[0] === 1) span.dataset.fg = '1';
        span.append(...build(rest.slice(1)));
      }
      return span;
    });
  const run = (window as unknown as { getANSIResult: () => string }).getANSIResult;
  return all.map((doc) => {
    ta.replaceChildren(...build(doc));
    return run();
  });
}, docs as unknown[][]);
await browser.close();

const rows = docs.map((d, i) => `  ${JSON.stringify([d, outputs[i]])}`);
writeFileSync(path.join(fixtures, 'discord-color-ansi.json'), `[\n${rows.join(',\n')}\n]\n`);
console.log(`wrote ${rows.length} cases`);
