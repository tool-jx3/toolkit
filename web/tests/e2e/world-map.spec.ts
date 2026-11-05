/**
 * 世界地圖產生器（規格 docs/refactor/specs/world-map.md）：
 * 開頁與範本、畫地形（方格／自由、森林自動打開圖案、變回海、只擦山林）、國（畫、退點、城牆與內城、頂點、只拖國名）、
 * 路線、素材、地名・備註、骰子、複製刪除、公開預覽、復原；匯出 PNG（公開用不含 GM 專用）、專案檔與原作作業檔、
 * 自動產生、小地圖、送到地圖演出產生器；390 寬沒有橫向捲動、1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { WorldDoc } from '../../src/tools/world-map/model/types';
import { waitForFileChooser } from '../helpers/fileChooser';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('world-map') ?? { id: 'world-map', status: 'next' })}/`;

type Hook = {
  useDoc: { getState: () => { data: WorldDoc; replace: (d: WorldDoc) => void } };
  useEditor: {
    getState: () => { tool: string; sel: { kind: string; id: string } | null; audience: string };
  };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: {
    fitView: () => void;
    visibleRect: () => { x: number; y: number; w: number; h: number };
  };
  sampleDoc: (id: string) => WorldDoc;
  toClient: (x: number, y: number) => { x: number; y: number };
};

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '世界地圖產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __worldMap?: unknown }).__worldMap);
  return errors;
}

const doc = (page: Page): Promise<WorldDoc> =>
  page.evaluate(
    () => (window as unknown as { __worldMap: Hook }).__worldMap.useDoc.getState().data,
  );
const sel = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __worldMap: Hook }).__worldMap.useEditor.getState().sel,
  );
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __worldMap: Hook }).__worldMap.toClient(x, y),
    [x, y],
  );

/** 換成空白的海（主題羊皮紙、方格），畫面整張 */
async function blank(page: Page, patch: Partial<WorldDoc> = {}) {
  await page.evaluate((patch) => {
    const h = (window as unknown as { __worldMap: Hook }).__worldMap;
    h.act.newBlank();
    const d = h.useDoc.getState().data;
    h.useDoc.getState().replace({ ...d, theme: 'parchment', drawMode: 'grid', ...patch });
    h.editor.fitView();
  }, patch);
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  await page.mouse.up();
}

async function click(page: Page, x: number, y: number, modifiers: 'Alt'[] = []) {
  const p = await at(page, x, y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length;
const land = (s: string) => [...s].filter((c) => c !== '0').length;

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('開頁：範本「艾爾德蘭大陸」、四個分頁、32 種素材、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const d = await doc(page);
  expect(d.title).toBe('艾爾德蘭大陸');
  expect(d.regions.map((r) => r.name)).toEqual(['艾爾德蘭王國', '赤砂公國', '潮聲自由同盟']);
  for (const tab of ['地形', '國與路線', '配置', '完成'])
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  await expect(page.getByTestId('region-count')).toHaveText('3');
  await expect(page.getByTestId('object-count')).toHaveText('10');
  await page.getByRole('tab', { name: '配置' }).click();
  await expect(page.getByTestId('asset-grid').getByRole('button')).toHaveCount(32);
  await page.getByRole('searchbox', { name: '搜尋素材' }).fill('碼頭');
  await expect(page.getByTestId('asset-grid').getByRole('button')).toHaveCount(1);
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：KIIN／ワールドマップ制作スタジオ');
  await expect(footer.getByRole('link')).toHaveAttribute('href', 'https://kiin.booth.pm/');
  await expect(page.getByTestId('minimap')).toHaveAttribute('data-ready', '1');
  expect(errors).toEqual([]);
});

test('畫地形：方格筆刷、森林自動打開圖案（同一步復原）、變回海、只擦山林、自由筆刷', async ({
  page,
}) => {
  const errors = await open(page);
  await blank(page);
  await page.keyboard.press('b');
  await drag(page, [300, 300], [900, 500]);
  let d = await doc(page);
  expect(land(d.terrain)).toBeGreaterThan(300);
  expect(count(d.terrain, '1')).toBe(land(d.terrain));
  /* 方格：塗到的格子都是 2 × 2 的方格 */
  const t = d.terrain;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '0') continue;
    const x = i % 128;
    const y = Math.floor(i / 128);
    expect(t[(y - (y % 2)) * 128 + (x - (x % 2))]).toBe('1');
  }
  /* 森林：圖案關著時自動打開 */
  await page.evaluate(() => {
    const h = (window as unknown as { __worldMap: Hook }).__worldMap;
    const d = h.useDoc.getState().data;
    h.useDoc.getState().replace({ ...d, settings: { ...d.settings, details: false } });
  });
  await page.locator('[data-paint="2"]').click();
  await drag(page, [400, 330], [800, 470]);
  d = await doc(page);
  expect(count(d.terrain, '2')).toBeGreaterThan(50);
  expect(d.settings.details).toBe(true);
  await page.getByTestId('undo').click();
  d = await doc(page);
  expect(count(d.terrain, '2')).toBe(0);
  expect(d.settings.details).toBe(false);
  await page.getByTestId('redo').click();
  /* 雪原：只換地表，森林留著 */
  await page.locator('[data-paint="5"]').click();
  await drag(page, [400, 330], [500, 380], 4);
  d = await doc(page);
  expect(count(d.terrain, '2')).toBeGreaterThan(30);
  expect(count(d.ground, '5')).toBeGreaterThan(10);
  /* 只擦山林：回到雪原 */
  await page.getByRole('button', { name: '只擦山與森林' }).click();
  await drag(page, [400, 330], [500, 380], 4);
  d = await doc(page);
  expect(count(d.terrain, '5')).toBeGreaterThan(10);
  /* 變回海 */
  const before = land(d.terrain);
  await page.keyboard.press('e');
  await drag(page, [300, 300], [500, 380], 4);
  expect(land((await doc(page)).terrain)).toBeLessThan(before);
  /* 自由筆刷：圓形 */
  await page.getByRole('radio', { name: '自由筆刷' }).click();
  expect((await doc(page)).drawMode).toBe('free');
  await expect(page.getByTestId('tool-name')).toHaveText('畫陸地');
  expect(errors).toEqual([]);
});

test('國・地域：點三點＋Enter、Backspace 退點、太小不完成、城牆與內城、頂點的加減、只拖國名', async ({
  page,
}) => {
  const errors = await open(page);
  await blank(page);
  await page.keyboard.press('b');
  await drag(page, [200, 200], [1300, 700], 12);
  await page.getByRole('tab', { name: '國與路線' }).click();
  await page.locator('[data-tool="region"]').click();
  await click(page, 300, 200);
  await click(page, 302, 202);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('draft-bar')).toBeVisible();
  expect((await doc(page)).regions).toHaveLength(0);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('draft-bar')).toHaveCount(0);
  for (const [x, y] of [
    [400, 250],
    [900, 250],
    [900, 650],
    [400, 650],
  ] as const)
    await click(page, x, y);
  await page.keyboard.press('Enter');
  let d = await doc(page);
  expect(d.regions).toHaveLength(1);
  expect(d.regions[0].name).toBe('新的國・地域');
  expect(d.regions[0].points).toHaveLength(4);
  expect((await sel(page))?.kind).toBe('region');
  /* 城牆、內城 */
  await page.getByTestId('inspector').getByRole('switch', { name: '四周圍上城牆' }).click();
  await page.getByTestId('inner-wall').click();
  d = await doc(page);
  expect(d.regions).toHaveLength(2);
  expect(d.regions[1]).toMatchObject({ name: '新的國・地域・內城', wall: true, opacity: 0 });
  /* 回到外面的國，拖邊上的小點加點 */
  await page.getByTestId('region-list').getByRole('button').first().click();
  await drag(page, [650, 250], [650, 180], 4);
  d = await doc(page);
  expect(d.regions[0].points).toHaveLength(5);
  expect(d.regions[0].points[1].x).toBeCloseTo(650, 0);
  expect(d.regions[0].points[1].y).toBeCloseTo(180, 0);
  const added = d.regions[0].points[1];
  /* Alt＋點一下刪點 */
  await click(page, added.x, added.y, ['Alt']);
  expect((await doc(page)).regions[0].points).toHaveLength(4);
  /* 只拖國名：國的形狀不動 */
  const pts = (await doc(page)).regions[0].points;
  await drag(page, [650, 440], [700, 500], 4);
  d = await doc(page);
  expect(d.regions[0].points).toEqual(pts);
  expect(Math.abs(d.regions[0].labelDx - 50)).toBeLessThanOrEqual(1);
  expect(Math.abs(d.regions[0].labelDy - 60)).toBeLessThanOrEqual(1);
  /* 復原一步一步回去 */
  await page.keyboard.press('Control+z');
  expect((await doc(page)).regions[0].labelDx).toBe(0);
  expect(errors).toEqual([]);
});

test('路線、素材、地名：川、連續放素材、骰子、反轉、複製、刪除、方向鍵、GM 專用與公開預覽', async ({
  page,
}) => {
  const errors = await open(page);
  await blank(page);
  await page.keyboard.press('b');
  await drag(page, [200, 200], [1300, 700], 12);
  await page.getByRole('tab', { name: '國與路線' }).click();
  await page.locator('[data-tool="river"]').click();
  await click(page, 400, 300);
  await click(page, 600, 400);
  const end = await at(page, 800, 420);
  await page.mouse.dblclick(end.x, end.y);
  let d = await doc(page);
  expect(d.paths.map((p) => [p.kind, p.points.length, p.width])).toEqual([['river', 3, 5]]);
  await expect(page.getByTestId('path-length')).toContainText('總長：約');
  /* 素材：連續放兩個 */
  await page.getByRole('tab', { name: '配置' }).click();
  await page.locator('[data-asset="castle"]').click();
  await click(page, 500, 600);
  await click(page, 1000, 600);
  d = await doc(page);
  expect(d.objects.map((o) => o.kind)).toEqual(['castle', 'castle']);
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () => (window as unknown as { __worldMap: Hook }).__worldMap.useEditor.getState().tool,
    ),
  ).toBe('select');
  await click(page, 500, 595);
  expect((await sel(page))?.id).toBe(d.objects[0].id);
  await page.getByTestId('dice').click();
  d = await doc(page);
  expect(d.objects[0].name).toMatch(/(城|堡|宮)$/);
  await page.keyboard.press('f');
  expect((await doc(page)).objects[0].flip).toBe(true);
  const o0 = d.objects[0];
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  d = await doc(page);
  expect(d.objects[0].x - o0.x).toBeCloseTo(12, 5);
  expect(d.objects[0].y - o0.y).toBeCloseTo(1, 5);
  await page.keyboard.press('Control+d');
  d = await doc(page);
  expect(d.objects).toHaveLength(3);
  expect(d.objects[2].x - d.objects[0].x).toBeCloseTo(24, 5);
  expect(d.objects[2].y - d.objects[0].y).toBeCloseTo(24, 5);
  await page.keyboard.press('Delete');
  expect((await doc(page)).objects).toHaveLength(2);
  /* 地名・備註（T）：文字欄聚焦 */
  await page.keyboard.press('t');
  await click(page, 700, 250);
  await expect(page.getByTestId('prop-text')).toBeFocused();
  await page.keyboard.type('霧之海');
  await page.getByTestId('prop-text').blur();
  d = await doc(page);
  expect(d.notes.map((n) => n.text)).toEqual(['霧之海']);
  /* GM 專用：公開預覽不能編輯 */
  await page
    .getByTestId('inspector')
    .getByRole('switch', { name: /GM 專用/ })
    .click();
  expect((await doc(page)).notes[0].secret).toBe(true);
  await page.getByRole('radio', { name: '公開預覽' }).click();
  await expect(page.getByTestId('canvas-hint')).toContainText('正在看公開的樣子');
  await click(page, 500, 600);
  await expect(page.getByText('切回「編輯用」才能編輯。').first()).toBeVisible();
  expect(await sel(page)).toBeNull();
  await page.getByRole('radio', { name: '編輯用' }).click();
  expect(errors).toEqual([]);
});

test('匯出 PNG：寬與檔名、公開用不畫 GM 專用的素材', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const h = (window as unknown as { __worldMap: Hook }).__worldMap;
    const d = h.sampleDoc('continent');
    d.title = '測試/世界';
    d.objects = [{ ...d.objects[0], x: 300, y: 600, size: 120, secret: true, name: '' }];
    d.paths = [];
    d.notes = [];
    d.settings = { ...d.settings, frame: false };
    h.useDoc.getState().replace(d);
  });
  await page.getByTestId('export-open').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: '1536 px' }).click();
  await expect(page.getByTestId('export-info')).toHaveText('1536 × 960 px · 拿掉 GM 專用的 1 項');
  await expect(page.getByTestId('export-preview')).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  expect(dl.suggestedFilename()).toBe('測試_世界_公開用.png');
  const pub = pngPixels(readFileSync((await dl.path()) as string));
  expect([pub.width, pub.height]).toEqual([1536, 960]);
  await dialog.getByRole('radio', { name: 'GM 用（全部）' }).click();
  await expect(page.getByTestId('export-info')).toHaveText('1536 × 960 px · 含 GM 專用的項目');
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  expect(dl2.suggestedFilename()).toBe('測試_世界_GM用.png');
  const gm = pngPixels(readFileSync((await dl2.path()) as string));
  /* 素材所在的範圍不同、遠處相同 */
  const diff = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * 1536 + x) * 4;
        if (Math.abs(pub.data[i] - gm.data[i]) + Math.abs(pub.data[i + 1] - gm.data[i + 1]) > 30)
          n++;
      }
    return n;
  };
  expect(diff(260, 540, 340, 640)).toBeGreaterThan(300);
  expect(diff(1000, 100, 1200, 300)).toBe(0);
  /* 寬與內容會記住 */
  await page.keyboard.press('Escape');
  await page.getByTestId('export-open').click();
  await expect(page.getByTestId('export-info')).toHaveText('1536 × 960 px · 含 GM 專用的項目');
  expect(errors).toEqual([]);
});

test('專案檔：存了再開回來相同；開啟原作的作業檔；拖到視窗也可以', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('艾爾德蘭大陸.world-map.json');
  const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'world-map', version: 2 });
  const original = await doc(page);
  await blank(page);
  await page.getByRole('button', { name: '專案' }).click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser.setFiles({
    name: 'a.json',
    mimeType: 'application/json',
    buffer: readFileSync((await dl.path()) as string),
  });
  await expect.poll(async () => (await doc(page)).title).toBe('艾爾德蘭大陸');
  expect(await doc(page)).toEqual(original);
  /* 原作的作業檔 */
  const legacy = {
    format: 'kiin-world-atelier',
    version: 1,
    title: '古い世界',
    theme: 'atlas',
    terrain: Array.from({ length: 128 * 80 }, (_, i) =>
      i % 128 > 30 && i % 128 < 90 && i > 1280 && i < 8000 ? 1 : 0,
    ),
    regions: [],
    objects: [{ key: 'castle', x: 700, y: 400, name: '城' }],
    paths: [
      {
        kind: 'road',
        points: [
          { x: 500, y: 300 },
          { x: 800, y: 500 },
        ],
        travelMode: 'horse',
      },
    ],
    notes: [],
    settings: { kmPer100: 20 },
    export: { width: 3200, audience: 'gm' },
  };
  await page.getByRole('button', { name: '專案' }).click();
  const chooser2 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser2.setFiles({
    name: 'old.world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect.poll(async () => (await doc(page)).title).toBe('古い世界');
  const d = await doc(page);
  expect(d).toMatchObject({ theme: 'atlas', drawMode: 'free' });
  expect(d.objects.map((o) => [o.kind, o.name])).toEqual([['castle', '城']]);
  expect(d.settings.kmPer100).toBe(20);
  /* 旅程的設定照讀（第二批，F81） */
  expect(d.paths[0]).toMatchObject({ kind: 'road', travelMode: 'horse' });
  await expect(page.getByText('已讀入作業檔。').first()).toBeVisible();
  /* 復原回到開檔前 */
  await page.getByTestId('undo').click();
  expect((await doc(page)).title).toBe('艾爾德蘭大陸');
  expect(errors).toEqual([]);
});

test('自動產生世界、範本、小地圖', async ({ page }) => {
  const errors = await open(page);
  const before = await doc(page);
  await page.getByTestId('generate').click();
  let d = await doc(page);
  expect(d.seed).not.toBe(before.seed);
  expect(d.objects.length).toBeGreaterThan(2);
  expect(d.objects[0].kind).toBe('capital');
  expect(d.regions).toEqual([]);
  await expect(
    page.getByText('已產生新的世界；按「復原」可以回到原本的地圖。').first(),
  ).toBeVisible();
  await page.getByTestId('undo').click();
  expect((await doc(page)).title).toBe('艾爾德蘭大陸');
  /* 範本 */
  await page.getByTestId('open-samples').click();
  await expect(page.getByTestId('samples').locator('img')).toHaveCount(3);
  await page.getByTestId('sample-islands').click();
  d = await doc(page);
  expect(d.title).toBe('星砂群島');
  expect(d.theme).toBe('night');
  /* 小地圖：點一下移動畫面，地圖不變 */
  await page.getByRole('button', { name: '放大' }).click();
  await page.getByRole('button', { name: '放大' }).click();
  const box = (await page.getByTestId('minimap').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  const r = await page.evaluate(() =>
    (window as unknown as { __worldMap: Hook }).__worldMap.editor.visibleRect(),
  );
  expect(r.x + r.w / 2).toBeCloseTo(1536 * 0.8, -1);
  expect(r.y + r.h / 2).toBeCloseTo(960 * 0.8, -1);
  expect((await doc(page)).title).toBe('星砂群島');
  expect(errors).toEqual([]);
});

test('旅程概算（第二批）：日數、只用距離計算、移動方式與日距、難度、不能通行、地形別的距離', async ({
  page,
}) => {
  const errors = await open(page);
  const road = (await doc(page)).paths.find((p) => p.name === '越嶺古道')!;
  await page.getByRole('tab', { name: '國與路線' }).click();
  await page.evaluate((id) => {
    const h = (window as unknown as { __worldMap: Hook }).__worldMap;
    (h as unknown as { useEditor: { setState: (s: unknown) => void } }).useEditor.setState({
      tool: 'select',
      sel: { kind: 'path', id },
    });
  }, road.id);
  const box = page.getByTestId('path-travel');
  await expect(box.getByTestId('path-length')).toHaveText('總長：約 157.8 km');
  await expect(box.getByTestId('travel-days')).toContainText('必要日數：約 18.5 日');
  await expect(box.getByTestId('travel-days')).toContainText('只用距離計算：約 5.3 日');
  await expect(box.getByTestId('travel-cliff')).toBeVisible();
  await expect(box.getByTestId('travel-terrain')).toContainText('山地');
  await expect(box.getByTestId('travel-used')).toContainText('王都・首都');
  /* 騎乘：日距換成 65 */
  const inspector = page.getByTestId('inspector');
  await inspector.getByRole('combobox', { name: '移動方式' }).click();
  await page.getByRole('option', { name: '騎乘' }).click();
  await expect(
    inspector.getByRole('spinbutton', { name: '平地・平靜水面上一天走幾 km' }),
  ).toHaveValue('65');
  expect((await doc(page)).paths.find((p) => p.id === road.id)?.travelMode).toBe('horse');
  /* 不能通行 */
  await inspector.getByRole('combobox', { name: '通行的方式' }).click();
  await page.getByRole('option', { name: '不能通行' }).click();
  await expect(box.getByTestId('travel-reason')).toHaveText('指定了「不能通行」，算不出日數。');
  /* 只用距離計算：不管不能通行；通行的方式不顯示 */
  await inspector.getByRole('switch', { name: '不看山路、川等障礙，只用距離計算' }).click();
  await expect(box.getByTestId('travel-reason')).toHaveCount(0);
  await expect(box.getByTestId('travel-days')).toHaveText('必要日數：約 2.4 日');
  await expect(inspector.getByRole('combobox', { name: '通行的方式' })).toHaveCount(0);
  /* 難度 ×2 */
  await inspector.getByRole('combobox', { name: '追加的難度' }).click();
  await page.getByRole('option', { name: '非常困難 ×2' }).click();
  await expect(box.getByTestId('travel-days')).toHaveText('必要日數：約 4.9 日');
  /* 復原回去（復原時取消選取） */
  await page.keyboard.press('Control+z');
  expect((await doc(page)).paths.find((p) => p.id === road.id)).toMatchObject({
    difficulty: 'normal',
    simpleCalc: true,
    access: 'blocked',
  });
  /* 國界線只顯示總長 */
  const border = await page.evaluate(() => {
    const h = (window as unknown as { __worldMap: Hook }).__worldMap;
    const d = h.useDoc.getState().data;
    const p = { ...d.paths[0], id: 'bd', kind: 'border' as const, name: '' };
    h.useDoc.getState().replace({ ...d, paths: [...d.paths, p] });
    (h as unknown as { useEditor: { setState: (s: unknown) => void } }).useEditor.setState({
      sel: { kind: 'path', id: 'bd' },
    });
    return p.id;
  });
  expect(border).toBe('bd');
  await expect(page.getByTestId('path-travel')).toHaveCount(0);
  await expect(inspector.getByTestId('path-length')).toContainText('總長：約');
  expect(errors).toEqual([]);
});

test('地圖的尺寸（第二批）：空白的海與自動產生可以選 16:9、正方形、直式', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('open-samples').click();
  await page.getByRole('radio', { name: '16:9（1536 × 864）' }).click();
  await page.getByTestId('sample-blank').click();
  let d = await doc(page);
  expect([d.cols, d.rows, d.terrain.length]).toEqual([128, 72, 128 * 72]);
  await page.getByTestId('export-open').click();
  await page.getByTestId('export-dialog').getByRole('radio', { name: '2400 px' }).click();
  await expect(page.getByTestId('export-info')).toContainText('2400 × 1350 px');
  await page.keyboard.press('Escape');
  await page.getByTestId('open-samples').click();
  await page.getByRole('radio', { name: '直式（960 × 1536）' }).click();
  await page.getByTestId('sample-generate').click();
  d = await doc(page);
  expect([d.cols, d.rows]).toEqual([80, 128]);
  expect(d.objects[0].kind).toBe('capital');
  /* 「地形」分頁的自動產生照目前的尺寸；範本是 16:10 */
  await page.getByTestId('generate').click();
  expect([(await doc(page)).cols, (await doc(page)).rows]).toEqual([80, 128]);
  await page.getByTestId('open-samples').click();
  await page.getByTestId('sample-continent').click();
  d = await doc(page);
  expect([d.cols, d.rows]).toEqual([128, 80]);
  /* 復原回到直式 */
  await page.getByTestId('undo').click();
  expect((await doc(page)).rows).toBe(128);
  expect(errors).toEqual([]);
});

test('在地圖演出產生器開啟：新分頁收到圖', async ({ page, context }) => {
  const errors = await open(page);
  await page.getByTestId('export-open').click();
  const [fx] = await Promise.all([
    context.waitForEvent('page'),
    page.getByTestId('export-send-fx').click(),
  ]);
  await fx.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  const ask = fx.getByRole('alertdialog');
  await expect(ask).toContainText('要讀入世界地圖產生器送來的圖嗎？', { timeout: 20_000 });
  await expect(ask).toContainText('艾爾德蘭大陸_公開用');
  await ask.getByRole('button', { name: '讀入' }).click();
  await expect(
    fx.getByText('已讀入世界地圖產生器送來的「艾爾德蘭大陸_公開用」', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await expect(page.getByTestId('minimap')).toHaveAttribute('data-ready', '1');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('world-map-1280.png', { mask: masks(page) });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    for (const tab of ['國與路線', '配置', '完成']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await page.getByRole('tab', { name: '地形' }).click();
    await page.getByTestId('export-open').click();
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('world-map-390.png', {
      mask: masks(page),
      fullPage: false,
    });
    expect(errors).toEqual([]);
  });
});
