/**
 * 角色配色條產生器：配色條的輸出不因為併入色票櫃而改變（2026-10-27）。
 *
 * 下面每一組設定（規格 3.2 的量測表與另外幾種容易出差錯的情況）的「整張儲存」「裁邊儲存」，
 * 解出來的 RGBA 像素的 SHA-256 與尺寸，是在併入之前的版本（commit 2899acc）用同一支測試記下來的。
 * 只要沒有用到新功能（部位、標「無」、角色的圖片等），輸出必須逐像素相同。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('color-palette') ?? { id: 'color-palette', status: 'next' })}/`;

interface Seg {
  id: string;
  color: string;
  ratio: number;
}
interface BarData {
  id: string;
  scale: number;
  segments: Seg[];
}
interface Cfg {
  background: string;
  thickness: number;
  baseLength: number;
  baseScale: number;
  autoSize: boolean;
  width: number;
  height: number;
  padding: number;
  bars: BarData[];
}

let seq = 0;
const bar = (scale: number, colors: string[], ratios?: number[]): BarData => {
  seq++;
  return {
    id: `g${seq}`,
    scale,
    segments: colors.map((color, i) => ({ id: `g${seq}-${i}`, color, ratio: ratios?.[i] ?? 1 })),
  };
};

const BASE: Omit<Cfg, 'bars'> = {
  background: '#f3f4f6',
  thickness: 10,
  baseLength: 300,
  baseScale: 160,
  autoSize: true,
  width: 400,
  height: 500,
  padding: 80,
};
const THREE = ['#e4572e', '#f3c13a', '#2e86ab'];

const CASES: { name: string; cfg: Cfg }[] = [
  { name: '預設', cfg: { ...BASE, bars: [bar(160, THREE)] } },
  { name: '2 條（160、120）', cfg: { ...BASE, bars: [bar(160, THREE), bar(120, ['#000000'])] } },
  {
    name: '2 條、粗 20',
    cfg: { ...BASE, thickness: 20, bars: [bar(160, THREE), bar(120, ['#000000'])] },
  },
  {
    name: '2 條、粗 20、留白 10',
    cfg: { ...BASE, thickness: 20, padding: 10, bars: [bar(160, THREE), bar(120, ['#000000'])] },
  },
  {
    name: '2 條、粗 20、留白 0、基準倍率 100',
    cfg: {
      ...BASE,
      thickness: 20,
      padding: 0,
      baseScale: 100,
      bars: [bar(160, THREE), bar(120, ['#000000'])],
    },
  },
  {
    name: '24 條、粗 20',
    cfg: {
      ...BASE,
      thickness: 20,
      bars: Array.from({ length: 24 }, (_, i) =>
        bar(140 + (i % 5) * 9, [THREE[i % 3], '#ffffff', '#202020'], [1, 1 + (i % 3), 0.5]),
      ),
    },
  },
  {
    name: '手動 600 × 700、3 條',
    cfg: {
      ...BASE,
      autoSize: false,
      width: 600,
      height: 700,
      thickness: 20,
      bars: [bar(160, THREE), bar(120, ['#000000']), bar(160, ['#000000'])],
    },
  },
  {
    name: '粗 37、5 段不等比例、深色背景',
    cfg: {
      ...BASE,
      background: '#1f2430',
      thickness: 37,
      bars: [
        bar(
          168.5,
          ['#5b3a29', '#f1d3c2', '#ffeef5', '#334477', '#111111'],
          [1.2, 0.7, 2, 0.35, 0.05],
        ),
      ],
    },
  },
  {
    name: '沒有段的條、倍率 172（尺寸有小數）',
    cfg: { ...BASE, bars: [bar(160, THREE), bar(172, []), bar(150.3, ['#ffffff', '#000000'])] },
  },
  {
    name: '手動 601 × 701（色條落在半像素）',
    cfg: {
      ...BASE,
      autoSize: false,
      width: 601,
      height: 701,
      thickness: 15,
      bars: [bar(160, ['#000000', '#ffffff']), bar(158.3, ['#5b3a29', '#f1d3c2', '#ffeef5'])],
    },
  },
];

/** 併入之前記下的結果：[整張的寬, 高, 像素 SHA-256 前 16 碼, 裁邊的寬, 高, 像素 SHA-256 前 16 碼] */
const GOLDEN: Record<string, [number, number, string, number, number, string]> = {
  預設: [170, 460, '34d87191f91a7c6f', 170, 460, '34d87191f91a7c6f'],
  '2 條（160、120）': [240, 460, '9d72b9830b4196f5', 240, 460, '9d72b9830b4196f5'],
  '2 條、粗 20': [260, 460, '9737b832ee6ec099', 260, 460, '9737b832ee6ec099'],
  '2 條、粗 20、留白 10': [120, 320, '65269826d3bb61fe', 120, 320, '65269826d3bb61fe'],
  '2 條、粗 20、留白 0、基準倍率 100': [100, 480, '92fd45009a99b47c', 100, 480, '92fd45009a99b47c'],
  '24 條、粗 20': [2020, 490, '7239842b61d486a0', 2020, 490, '7239842b61d486a0'],
  '手動 600 × 700、3 條': [600, 700, 'ecee771bf24c192e', 340, 460, 'dbf2558edfd656d8'],
  '粗 37、5 段不等比例、深色背景': [197, 475, 'f6a2fb4c28be49ee', 197, 475, 'f6a2fb4c28be49ee'],
  '沒有段的條、倍率 172（尺寸有小數）': [
    310,
    482,
    'eb5f7975599be0d7',
    310,
    482,
    'eb5f7975599be0d7',
  ],
  '手動 601 × 701（色條落在半像素）': [601, 701, '67814bbb35a36c35', 250, 460, 'bebe7d3bc395b4e5'],
};

async function open(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '角色配色條產生器' })).toBeVisible();
}

function pixelsHash(bytes: Buffer): [number, number, string] {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const px = decodePixels(z, width, height, colorType);
  return [width, height, createHash('sha256').update(px).digest('hex').slice(0, 16)];
}

async function saveHash(page: Page, name: '整張儲存' | '裁邊儲存') {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  return pixelsHash(readFileSync((await dl.path()) as string));
}

test('配色條的整張與裁邊儲存：和併入之前逐像素相同', async ({ page }) => {
  await open(page);
  const got: Record<string, [number, number, string, number, number, string]> = {};
  for (const c of CASES) {
    await page.evaluate((cfg) => {
      const w = window as unknown as {
        __colorPalette: { useSettings: { getState: () => { replace: (d: unknown) => void } } };
      };
      w.__colorPalette.useSettings.getState().replace(cfg);
    }, c.cfg);
    const full = await saveHash(page, '整張儲存');
    const crop = await saveHash(page, '裁邊儲存');
    got[c.name] = [...full, ...crop];
  }
  for (const c of CASES) expect(got[c.name], c.name).toEqual(GOLDEN[c.name]);
});
