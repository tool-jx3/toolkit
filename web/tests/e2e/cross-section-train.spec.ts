/**
 * 斷面圖產生器（第二批，規格 docs/refactor/specs/cross-section.md F73～F75 與細項）：
 * 新的橫向車廂與模式切換、加車廂到自動折返、排法・場景・機關車、上限 10 節、車廂面板（種類、連結器、床下、分割合併）、
 * 拖曳車廂裡的隔間、放列車專用的設備、匯出 PNG、CCFOLIA 房間 ZIP 與 KP 準備包（實際存下來解開檢查、讀進房間 ZIP 工具）、
 * 祕密區域的偽裝在每個場景都沒有色差、原作的橫向作業 JSON、專案檔的來回、窄畫面（390／360／320）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { checkRoomZip } from '../../src/ccfolia';
import { listMp3Frames, readMp3InfoTag } from '../../src/core/audio/mp3/frames';
import { parseCsv } from '../../src/core/csv';
import { unzipFiles } from '../../src/core/files';
import { getTool, outputDir } from '../../src/registry';
import type { TrainLayout } from '../../src/tools/cross-section/model/trainLayout';
import type { SectionDoc, SelRef } from '../../src/tools/cross-section/model/types';
import { waitForFileChooser } from '../helpers/fileChooser';
import { parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('cross-section') ?? { id: 'cross-section', status: 'next' })}/`;
const ROOM_ZIP_URL = `/${outputDir(getTool('room-zip') ?? { id: 'room-zip', status: 'next' })}/`;

type Hook = {
  useDoc: {
    getState: () => { data: SectionDoc; replace: (d: SectionDoc) => void };
    temporal: { getState: () => { pastStates: unknown[] } };
  };
  useEditor: { getState: () => { sel: SelRef | null } };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: {
    fitView: () => void;
    hitTest: (p: { x: number; y: number }) => { kind: string; id?: string } | null;
  };
  sampleDoc: (id: string) => SectionDoc;
  trainLayout: () => TrainLayout | null;
  toClient: (x: number, y: number) => { x: number; y: number };
  zipPlan: (o?: Record<string, unknown>) => {
    board: {
      padL: number;
      padT: number;
      cell: number;
      world: { x: number; y: number; w: number; h: number };
    };
    panels: { kind: string; code: string; rect: { x: number; y: number; w: number; h: number } }[];
  };
  zipBoard: (
    env: string,
    flood: boolean,
    audience: string,
    o?: Record<string, unknown>,
  ) => Promise<{ width: number; height: number; url: string }>;
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
  await expect(page.getByRole('heading', { level: 1, name: '斷面圖產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __crossSection?: unknown }).__crossSection,
  );
  return errors;
}

const doc = (page: Page): Promise<SectionDoc> =>
  page.evaluate(
    () => (window as unknown as { __crossSection: Hook }).__crossSection.useDoc.getState().data,
  );
const train = async (page: Page) => {
  const t = (await doc(page)).train;
  if (!t) throw new Error('沒有列車');
  return t;
};
const layout = (page: Page) =>
  page.evaluate(() => (window as unknown as { __crossSection: Hook }).__crossSection.trainLayout());
const sel = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __crossSection: Hook }).__crossSection.useEditor.getState().sel,
  );
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __crossSection: Hook }).__crossSection.toClient(x, y),
    [x, y],
  );
async function click(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}
/** 第 n 個區域（列車的順序）裡點得到區域本身（不是設備、備註）的一點 */
async function roomPoint(page: Page, n: number): Promise<[number, number]> {
  const p = await page.evaluate((n) => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    const r = h.trainLayout()?.rooms[n];
    if (!r) return null;
    for (let y = r.y + 0.5; y < r.y + r.h; y += 0.5)
      for (let x = r.x + 0.5; x < r.x + r.w; x += 0.5) {
        const hit = h.editor.hitTest({ x, y });
        if (hit?.kind === 'room' && hit.id === r.room.id) return [x, y] as [number, number];
      }
    return null;
  }, n);
  if (!p) throw new Error(`第 ${n} 個區域沒有空的地方`);
  return p;
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
/** 換成範例（編輯畫面整張） */
async function sample(page: Page, id: string) {
  await page.evaluate((id) => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    h.act.applySample(id);
    h.editor.fitView();
  }, id);
}
const fitView = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __crossSection: Hook }).__crossSection.editor.fitView(),
  );

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 對話框裡每個按鈕、選項都在對話框的範圍裡，字沒有被切掉（2026-11-27 修正第 1 輪：KP 準備包的按鈕在 360／320 寬超出） */
async function insideDialog(page: Page) {
  const bad = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    if (!d) return ['沒有對話框'];
    const box = d.getBoundingClientRect();
    const out: string[] = [];
    for (const e of d.querySelectorAll<HTMLElement>(
      'button,[role=radio],[role=switch],[role=checkbox],[role=combobox]',
    )) {
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left < box.left - 1 || r.right > box.right + 1 || e.scrollWidth > e.clientWidth + 1)
        out.push(
          `${(e.innerText || e.getAttribute('aria-label') || '').trim()}@${Math.round(r.left)}..${Math.round(r.right)}`,
        );
    }
    return out;
  });
  expect(bad, '對話框裡超出或被切掉的按鈕').toEqual([]);
}

async function pick(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const bytesOf = async (dl: { path: () => Promise<string | null> }) =>
  new Uint8Array(readFileSync((await dl.path()) as string));

test('新的橫向車廂：開始的對話框、模式隨時切換（兩邊都留著）、加車廂到 4 節自動折返、排法・場景・機關車、上限 10 節', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('open-start').click();
  await expect(page.getByTestId('train-samples').getByRole('button')).toHaveCount(2);
  await page.getByTestId('start-train').click();
  await expect.poll(async () => (await doc(page)).mode).toBe('train');
  await fitView(page);
  let t = await train(page);
  expect(t.cars.map((c) => c.type)).toEqual(['loco', 'coach', 'baggage']);
  expect(t).toMatchObject({ arrange: 'auto', loco: 'steam', scenery: 'starlit', roofRoute: true });
  await expect(page.getByTestId('car-count')).toHaveText('3／10 節');
  await expect(page.getByTestId('stat-cars')).toHaveText('3');
  expect((await layout(page))?.folded).toBe(false);
  /* 加一節餐車 → 4 節：自動折成兩段（上排 2 節） */
  await pick(page, 'new-car-type', '餐車');
  await page.getByTestId('add-car').click();
  t = await train(page);
  expect(t.cars.map((c) => c.type)).toEqual(['loco', 'coach', 'baggage', 'dining']);
  let L = await layout(page);
  expect(L?.folded).toBe(true);
  expect(L?.rows.map((r) => r.cars.length)).toEqual([2, 2]);
  /* 排法：一列 */
  await pick(page, 'arrange-select', '一列');
  L = await layout(page);
  expect(L?.folded).toBe(false);
  expect(L?.rows).toHaveLength(1);
  await pick(page, 'arrange-select', '兩段折返');
  expect((await layout(page))?.folded).toBe(true);
  /* 場景、機關車 */
  await pick(page, 'scenery-select', '暴風雪・雪原');
  expect((await train(page)).scenery).toBe('blizzard');
  await pick(page, 'loco-select', '電氣機關車');
  t = await train(page);
  expect(t.loco).toBe('electric');
  expect(t.cars[0].rooms.map((r) => r.role)).toEqual(['cab', 'engine']);
  /* 車廂順序：往上移、刪除 */
  await page.getByTestId('car-4').getByRole('button', { name: '往前挪' }).click();
  expect((await train(page)).cars.map((c) => c.type)).toEqual([
    'loco',
    'coach',
    'dining',
    'baggage',
  ]);
  await page.getByTestId('car-4').getByTestId('delete-car').click();
  await expect(page.getByTestId('car-count')).toHaveText('3／10 節');
  /* 切回縱向：建築原樣；再切回橫向：列車原樣 */
  const before = await train(page);
  await page.getByRole('radio', { name: '縱向斷面', exact: true }).click();
  await expect(page.getByTestId('floor-count')).toBeVisible();
  expect((await doc(page)).mode).toBe('building');
  expect((await doc(page)).train).toEqual(before);
  await page.getByRole('radio', { name: '橫向車廂', exact: true }).click();
  await expect(page.getByTestId('car-count')).toHaveText('3／10 節');
  expect((await doc(page)).train).toEqual(before);
  expect((await doc(page)).building.floors.length).toBeGreaterThan(0);
  /* 最多 10 節 */
  for (let i = 0; i < 7; i++) await page.getByTestId('add-car').click();
  await expect(page.getByTestId('car-count')).toHaveText('10／10 節');
  await expect(page.getByTestId('add-car')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('車廂與區域：點車頂選車廂（種類、連結器、床下的祕密空間、分割合併）、點區域、拖曳隔間、放列車設備', async ({
  page,
}) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    h.act.newTrain();
    h.editor.fitView();
  });
  /* 第 2 節（客車）：x 15～29、車廂 y 2～8；車頂（y 0.7～2）點下去選車廂 */
  await click(page, 20, 1.2);
  const car = (await train(page)).cars[1];
  expect(await sel(page)).toEqual({ kind: 'car', id: car.id });
  const panel = page.getByTestId('car-panel');
  await expect(panel).toBeVisible();
  await pick(page, 'car-coupler', '上鎖');
  expect((await train(page)).cars[1].coupler).toBe('locked');
  await panel.getByRole('checkbox', { name: /床下的祕密空間/ }).click();
  expect((await train(page)).cars[1].under).toBe(true);
  expect((await layout(page))?.unders).toHaveLength(1);
  /* 分割（最多 4 間）、合併 */
  await page.getByTestId('car-split').click();
  expect((await train(page)).cars[1].rooms).toHaveLength(3);
  await page.getByTestId('car-merge').click();
  expect((await train(page)).cars[1].rooms).toHaveLength(2);
  await page.getByTestId('undo').click();
  expect((await train(page)).cars[1].rooms).toHaveLength(3);
  await page.getByTestId('undo').click();
  expect((await train(page)).cars[1].rooms.map((r) => [r.x0, r.x1])).toEqual([
    [0, 10],
    [10, 14],
  ]);
  /* 拖曳客室與車門之間的隔間（x 25）→ 整數格 */
  await drag(page, [25, 5], [23.2, 5]);
  expect((await train(page)).cars[1].rooms.map((r) => [r.x0, r.x1])).toEqual([
    [0, 8],
    [8, 14],
  ]);
  /* 種類換成休息・沙龍車：區域與設備換成那一種的預設 */
  await click(page, 20, 1.2);
  await pick(page, 'car-type', '休息・沙龍車');
  const lounge = (await train(page)).cars[1];
  expect(lounge.type).toBe('lounge');
  const items = (await train(page)).items.filter((it) =>
    lounge.rooms.some((r) => r.id === it.room),
  );
  expect(items.map((it) => it.kind)).toContain('settee');
  /* 點區域 → 區域的屬性 */
  await click(page, ...(await roomPoint(page, 5)));
  await expect(page.getByTestId('room-panel')).toBeVisible();
  expect((await sel(page))?.kind).toBe('room');
  /* 列車專用的設備：分類「列車專用」6 種，放到第 3 節 */
  await page.getByRole('tab', { name: '設備・家具' }).click();
  await page.getByRole('radio', { name: '列車專用' }).click();
  const grid = page.getByTestId('fixture-grid');
  await expect(grid.getByRole('button')).toHaveCount(6);
  await grid.locator('[data-kind="luggage"]').click();
  const n0 = (await train(page)).items.length;
  await click(page, 33, 7);
  const t = await train(page);
  expect(t.items).toHaveLength(n0 + 1);
  const placed = t.items.at(-1);
  expect(placed?.kind).toBe('luggage');
  expect(t.cars[2].rooms.map((r) => r.id)).toContain(placed?.room);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('匯出 PNG（橫向）：尺寸和對話框寫的相同、檔名', async ({ page }) => {
  const errors = await open(page);
  await sample(page, 'raven');
  await page.getByTestId('export-open').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('radio', { name: '圖片（PNG）' }).click();
  await dialog.getByRole('radio', { name: '1600 px' }).click();
  const info = (await page.getByTestId('export-info').textContent()) ?? '';
  const m = /^(\d+) × (\d+) px/.exec(info);
  expect(m).not.toBeNull();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^鐵鴉護送列車_PL用_.+\.png$/);
  const ihdr = readIhdr(parseChunks(await bytesOf(dl)));
  expect([ihdr.width, ihdr.height]).toEqual([Number(m?.[1]), Number(m?.[2])]);
  expect(ihdr.width).toBe(1600);
  expect(errors).toEqual([]);
});

test('CCFOLIA 房間 ZIP 與 KP 準備包：實際存下來解開檢查、只存無聲 MP3 與說明圖、讀進房間 ZIP 工具', {
  tag: '@serial',
}, async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await open(page);
  await sample(page, 'circus');
  await page.getByTestId('export-open').click();
  const dialog = page.getByTestId('export-dialog');
  await page.getByRole('radio', { name: 'CCFOLIA 房間 ZIP' }).click();
  await expect(page.getByTestId('zip-pane')).toBeVisible();
  await dialog.getByRole('switch', { name: '加淹水的場景與「@淹水」切入' }).click();
  await dialog.getByRole('checkbox', { name: /KP 操作說明放在螢幕面板一覽的最後/ }).click();
  const plan = await page.evaluate(() =>
    (window as unknown as { __crossSection: Hook }).__crossSection.zipPlan({ flood: true }),
  );
  const masks = plan.panels.filter((p) => p.kind === 'mask').length;
  const camos = plan.panels.filter((p) => p.kind === 'camo').length;
  expect(camos).toBe(2);
  await expect(page.getByTestId('zip-info')).toContainText(
    `場景 5・遮罩 ${masks}・祕密的偽裝 2・切入 4`,
  );

  /* 房間 ZIP */
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 240_000 }),
    page.getByTestId('zip-download').click(),
  ]);
  expect(dl.suggestedFilename()).toBe('赤狐馬戲團專列_CCFOLIA房間.zip');
  const room = await bytesOf(dl);
  const check = await checkRoomZip(room);
  expect(check.problems).toEqual([]);
  expect(check).toMatchObject({ ok: true, sceneCount: 5, characterCount: 0 });
  const files = unzipFiles(room);
  const data = JSON.parse(
    new TextDecoder().decode(files.find((f) => f.name === '__data.json')?.data),
  ) as {
    entities: {
      room: { fieldWidth: number };
      scenes: Record<string, { name: string }>;
      items: Record<
        string,
        {
          memo: string;
          z: number;
          active: boolean;
          locked: boolean;
          order: number;
          imageUrl: string;
        }
      >;
      effects: Record<string, { name: string; imageUrl: string }>;
    };
    resources: Record<string, unknown>;
  };
  const scenes = Object.values(data.entities.scenes).map((s) => s.name);
  expect(scenes).toEqual(['1 白天・平常', '2 夜・雨', '3 停電・緊急照明', '4 事件後', '5 淹水']);
  const items = Object.values(data.entities.items).sort((a, b) => a.order - b.order);
  expect(items).toHaveLength(masks + camos + 1);
  expect(items.filter((it) => it.z === 4)).toHaveLength(masks);
  expect(items.filter((it) => it.z === 5).map((it) => it.memo)).toEqual(['S-01', 'S-02']);
  expect(items.every((it) => it.locked)).toBe(true);
  expect(items.at(-1)).toMatchObject({ z: 9, active: false, memo: 'KP 操作說明（要看時打開）' });
  const fx = Object.values(data.entities.effects);
  expect(fx.map((e) => e.name)).toEqual(['@停電', '@緊急照明', '@事件發生', '@淹水']);
  /* 切入：透明 APNG、1 MB 以下、只播一次以外的設定交給無聲 MP3 */
  for (const e of fx) {
    const f = files.find((x) => x.name === e.imageUrl);
    expect(f, e.name).toBeTruthy();
    if (!f) continue;
    expect(f.data.byteLength).toBeLessThanOrEqual(1_000_000);
    const apng = parseApng(f.data);
    expect(apng.numFrames).toBeGreaterThan(10);
    expect([apng.ihdr.width, apng.ihdr.height]).toEqual([640, 320]);
  }

  /* KP 準備包：房間 ZIP＋無聲 MP3＋說明圖＋對照表 */
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 240_000 }),
    page.getByTestId('zip-pack').click(),
  ]);
  expect(dl2.suggestedFilename()).toBe('赤狐馬戲團專列_KP準備包.zip');
  const pack = unzipFiles(await bytesOf(dl2));
  expect(pack.map((f) => f.name).sort()).toEqual(
    [
      '赤狐馬戲團專列_CCFOLIA房間.zip',
      '切入自動結束用_無聲2.6秒.mp3',
      '赤狐馬戲團專列_KP操作說明.png',
      '赤狐馬戲團專列_遮罩對照表.csv',
    ].sort(),
  );
  const inner = pack.find((f) => f.name.endsWith('.zip'));
  expect((await checkRoomZip(inner?.data ?? new Uint8Array())).ok).toBe(true);
  const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
    pack.find((f) => f.name.endsWith('.csv'))?.data,
  );
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const rows = parseCsv(csv.slice(1).replaceAll('\r\n', '\n')).filter((r) => r.length > 1);
  expect(rows[0]).toEqual(['編號', '種類', '一開始', '位置', '名字', 'PL 停留時看到的字']);
  expect(rows).toHaveLength(masks + camos + 1);
  expect(rows.find((r) => r[0] === 'S-01')?.slice(1, 5)).toEqual([
    '祕密的偽裝',
    '蓋著',
    '6車',
    '團長的密室',
  ]);
  const guide = readIhdr(
    parseChunks(pack.find((f) => f.name.endsWith('.png'))?.data ?? new Uint8Array()),
  );
  expect([guide.width, guide.height]).toEqual([1280, 860]);

  /* 只存無聲 MP3：2.6 秒 */
  const [dl3] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('zip-mp3').click(),
  ]);
  expect(dl3.suggestedFilename()).toBe('切入自動結束用_無聲2.6秒.mp3');
  const mp3 = await bytesOf(dl3);
  const tag = readMp3InfoTag(mp3);
  if (!tag) throw new Error('沒有 Info 標頭');
  expect(listMp3Frames(mp3)[1].header).toMatchObject({ sampleRate: 44100 });
  expect((tag.frames * 1152 - tag.delay - tag.padding) / 44100).toBeCloseTo(2.6, 5);
  /* 只存說明圖 */
  const [dl4] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('zip-guide-png').click(),
  ]);
  expect(dl4.suggestedFilename()).toBe('赤狐馬戲團專列_KP操作說明.png');
  expect(readIhdr(parseChunks(await bytesOf(dl4))).width).toBe(1280);
  expect(errors).toEqual([]);

  /* 讀進房間 ZIP 工具：場景 5、螢幕面板、切入 4 */
  const p2 = await page.context().newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await p2.goto(ROOM_ZIP_URL);
  await expect(p2.getByTestId('home-page')).toBeVisible();
  const [chooser] = await Promise.all([
    p2.waitForEvent('filechooser'),
    p2.getByRole('button', { name: '讀入房間 ZIP…' }).first().click(),
  ]);
  await chooser.setFiles({
    name: '赤狐馬戲團專列_CCFOLIA房間.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(room),
  });
  const confirm = p2.getByRole('alertdialog');
  const summary = p2.getByTestId('project-summary');
  await expect(confirm.or(summary.filter({ hasText: '場景 5' }))).toBeVisible({ timeout: 30_000 });
  if (await confirm.isVisible()) {
    await expect(confirm.getByTestId('room-import-counts')).toContainText(
      `場景 5 個・共用標記 0 個・螢幕面板 ${masks + camos + 1} 個・棋子 0 個・切入 4 個`,
    );
    await confirm.getByRole('button', { name: '讀入', exact: true }).click();
  }
  await expect(summary).toContainText('場景 5');
  await expect(p2.getByTestId('project-name')).toHaveText('赤狐馬戲團專列_CCFOLIA房間');
  await expect(p2.locator('nav [data-nav="scenes"]').first()).toContainText('5');
  await expect(p2.locator('nav [data-nav="cutins"]').first()).toContainText('4');
  await p2.close();
});

test('偽裝：祕密區域的偽裝面板和每個場景（含淹水）的 PL 畫面逐像素相同', {
  tag: '@serial',
}, async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  for (const id of ['circus', 'manor']) {
    await sample(page, id);
    const res = await page.evaluate(async () => {
      const h = (window as unknown as { __crossSection: Hook }).__crossSection;
      const load = (url: string) =>
        new Promise<HTMLImageElement>((ok, ng) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = ng;
          i.src = url;
        });
      const pixels = async (r: { width: number; height: number; url: string }) => {
        const c = document.createElement('canvas');
        c.width = r.width;
        c.height = r.height;
        const g = c.getContext('2d') as CanvasRenderingContext2D;
        g.drawImage(await load(r.url), 0, 0);
        return g;
      };
      const { board: b, panels } = h.zipPlan({ flood: true });
      const camo = panels.filter((p) => p.kind === 'camo');
      /* 偽裝面板的圖＝PL 用・白天的盤面裁下來 */
      const day = await pixels(await h.zipBoard('day', false, 'player'));
      const out: number[] = [];
      for (const [env, flood] of [
        ['day', false],
        ['night', false],
        ['blackout', false],
        ['after', false],
        ['after', true],
      ] as const) {
        const pl = await pixels(await h.zipBoard(env, flood, 'player'));
        let diff = 0;
        for (const p of camo) {
          const x = Math.round((b.padL + p.rect.x - b.world.x) * b.cell);
          const y = Math.round((b.padT + p.rect.y - b.world.y) * b.cell);
          const a = day.getImageData(x, y, p.rect.w * b.cell, p.rect.h * b.cell).data;
          const c = pl.getImageData(x, y, p.rect.w * b.cell, p.rect.h * b.cell).data;
          for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) diff++;
        }
        out.push(diff);
      }
      return { camo: camo.length, out };
    });
    expect(res.camo, id).toBeGreaterThan(0);
    expect(res.out, id).toEqual([0, 0, 0, 0, 0]);
  }
  expect(errors).toEqual([]);
});

test('原作的橫向作業 JSON：車廂、區域、連結器、床下、設備、備註讀進來；專案檔存了再開回來相同', async ({
  page,
}) => {
  const errors = await open(page);
  /* 欄位是原作的格式、內容是測試自己寫的 */
  const legacy = {
    format: 'kiin-cross-section-studio',
    mode: 'horizontal',
    title: '舊的夜車',
    style: 'blueprint',
    environment: 'night',
    sceneryTheme: 'fog-viaduct',
    building: { widthCells: 30, floorHeightCells: 6, floors: [], shafts: [] },
    train: {
      layout: 'single',
      locoStyle: 'electric',
      rooftopRoute: false,
      carWidthCells: 14,
      cars: [
        {
          id: 'c1',
          type: 'locomotive',
          name: '1号車 · 機關車',
          rooms: [
            { id: 'r1', name: '駕駛室', x0: 0, x1: 6, isCab: true },
            { id: 'r2', name: '機器室', x0: 6, x1: 14 },
          ],
        },
        {
          id: 'c2',
          type: 'sleeper2',
          name: '2号車 · 臥鋪',
          couplerAfter: 'bars',
          underfloorSecret: true,
          underfloorName: '夾層',
          rooms: [
            { id: 'r3', name: '鋪位', x0: 0, x1: 8, wallTone: 'wood' },
            { id: 'r4', name: '暗房', x0: 8, x1: 14, secret: true },
          ],
        },
        {
          id: 'c3',
          type: 'guard',
          name: '押送',
          rooms: [{ id: 'r5', name: '囚室', x0: 0, x1: 14 }],
        },
      ],
    },
    items: [
      { id: 'i1', mode: 'horizontal', roomId: 'r3', asset: 'sleeper-berth', rx: 0.5 },
      { id: 'i2', mode: 'horizontal', roomId: 'r1', asset: 'loco-console', rx: 0.5 },
    ],
    annotations: [
      { id: 'n1', mode: 'horizontal', underfloorCarId: 'c2', text: '藏著東西', rx: 0.5, ry: 0.5 },
    ],
  };
  await page.getByRole('button', { name: '專案' }).click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser.setFiles({
    name: 'night.crosssection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect.poll(async () => (await doc(page)).title).toBe('舊的夜車');
  await expect(page.getByText('已讀入原作的作業檔', { exact: true })).toBeVisible();
  const d = await doc(page);
  expect(d).toMatchObject({ mode: 'train', style: 'blueprint', env: 'night' });
  const t = d.train;
  if (!t) throw new Error('沒有列車');
  expect(t).toMatchObject({
    arrange: 'single',
    loco: 'electric',
    scenery: 'viaduct',
    roofRoute: false,
  });
  expect(t.cars.map((c) => [c.type, c.name])).toEqual([
    ['loco', '機關車'],
    ['berth', '臥鋪'],
    ['escort', '押送'],
  ]);
  expect(t.cars[1]).toMatchObject({ coupler: 'bars', under: true, underName: '夾層' });
  expect(t.cars[1].rooms.map((r) => [r.name, r.secret])).toEqual([
    ['鋪位', false],
    ['暗房', true],
  ]);
  expect(t.items.map((it) => it.kind)).toEqual(['bunk', 'cabdesk']);
  expect(t.notes).toHaveLength(1);
  expect(t.notes[0]).toMatchObject({ text: '藏著東西', room: `under:${t.cars[1].id}` });
  await expect(page.getByTestId('car-count')).toHaveText('3／10 節');
  /* 專案檔：存了再開回來相同（建築與列車兩邊都在） */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔' }).click(),
  ]);
  const saved = readFileSync((await dl.path()) as string);
  const original = await doc(page);
  await page.evaluate(() =>
    (window as unknown as { __crossSection: Hook }).__crossSection.act.newBlank(),
  );
  expect((await doc(page)).mode).toBe('building');
  await page.getByRole('button', { name: '專案' }).click();
  const chooser2 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser2.setFiles({ name: 'a.json', mimeType: 'application/json', buffer: saved });
  await expect.poll(async () => (await doc(page)).title).toBe('舊的夜車');
  expect(await doc(page)).toEqual(original);
  expect(errors).toEqual([]);
});

test.describe('窄畫面（橫向車廂）', () => {
  for (const width of [390, 360, 320])
    test(`${width}：沒有橫向捲動、點區域選取、匯出的兩個分頁`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const errors = await open(page);
      await sample(page, 'circus');
      await noHorizontalScroll(page);
      for (const tab of ['設備・家具', '完成', '構造']) {
        await page.getByRole('tab', { name: tab }).click();
        await noHorizontalScroll(page);
      }
      await expect(page.getByTestId('car-list')).toBeVisible();
      await page.getByTestId('section-canvas').scrollIntoViewIfNeeded();
      await fitView(page);
      await click(page, ...(await roomPoint(page, 2)));
      await expect(page.getByTestId('room-panel')).toBeVisible();
      await noHorizontalScroll(page);
      await page.getByTestId('export-open').click();
      const dialog = page.getByTestId('export-dialog');
      await expect(dialog).toBeVisible();
      await noHorizontalScroll(page);
      await insideDialog(page);
      await page.getByRole('radio', { name: 'CCFOLIA 房間 ZIP' }).click();
      await expect(page.getByTestId('zip-pane')).toBeVisible();
      await noHorizontalScroll(page);
      await insideDialog(page);
      await page.getByRole('radio', { name: '圖片（PNG）' }).click();
      expect(errors).toEqual([]);
    });
});
