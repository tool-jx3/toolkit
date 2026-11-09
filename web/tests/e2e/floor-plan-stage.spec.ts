/**
 * 室內平面圖產生器：2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」第二批（演出；規格 1.30：F313～F328）——
 * 演出的開關與面板、房間與樓層藏起來／公開（平面圖、立體樓層圖、樓層總覽）、點房間連箭頭（含跨樓層）、自由的箭頭、
 * 控制點、時間軸（點一步、晶片拖到別一步、公開時機）、自動產生與復原、播放與一格一格、PL 的演出畫面、匯出影片與 ZIP。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import type { Project } from '../../src/tools/floor-plan/model/types';
import { parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;

type Pt = { x: number; y: number };
type Hook = {
  useProject: {
    getState: () => { data: Project; replace: (p: Project) => void };
    temporal: { getState: () => { undo: () => void } };
  };
  useStage: {
    getState: () => {
      on: boolean;
      preview: boolean;
      time: number;
      playing: boolean;
      start: { floor: string; room: string } | null;
      openRooms: string[];
      tool: string;
      ready: boolean;
    };
  };
  usePrefs: { getState: () => { data: { view?: string } } };
  act: Record<string, (...a: unknown[]) => unknown>;
  stageAct: Record<string, (...a: unknown[]) => unknown>;
  stageTimeline: () => {
    total: number;
    playable: boolean;
    manual: string[];
    steps: {
      kind: string;
      floor: string;
      start: number;
      duration: number;
      bridge: boolean;
      revealRooms: string[];
      revealFloors: string[];
      hidden: string[];
    }[];
  };
  editor: { fitView: () => void; stage: { planFloor: () => { id: string } | null } };
  stackClient: (x: number, y: number, level: number) => Pt;
  toClient: (x: number, y: number) => Pt;
};

const routeFonts = (p: Page) =>
  p.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeFonts(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '室內平面圖產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan);
  return errors;
}

const hook = <T>(page: Page, fn: (h: Hook, arg: unknown) => T, arg?: unknown) =>
  page.evaluate(
    ([src, a]) => {
      const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
      return new Function('h', 'a', `return (${src})(h, a);`)(h, a) as T;
    },
    [fn.toString(), arg] as const,
  );

const project = (page: Page) => hook(page, (h) => h.useProject.getState().data);
const stage = (page: Page) => hook(page, (h) => h.useStage.getState());
const timeline = (page: Page) => hook(page, (h) => h.stageTimeline());

/** 鐘錶行（B1 祕密、1F、2F），1F 的平面編輯 */
async function clockshop(page: Page) {
  await hook(page, (h) => h.act.loadTemplate('clockshop', { structureOnly: false, clues: false }));
  await hook(page, (h) => h.editor.fitView());
}

const roomId = async (page: Page, floor: number, name: string) =>
  hook(
    page,
    (h, a) => {
      const [fi, n] = a as [number, string];
      const f = h.useProject.getState().data.floors[fi];
      return { floor: f.id, room: f.rooms.find((r) => r.name === n)?.id ?? '' };
    },
    [floor, name],
  );
const keyOf = (r: { floor: string; room: string }) => `${r.floor}\u0001${r.room}`;

const hiddenRooms = async (page: Page) =>
  (await project(page)).stage?.rooms?.map((e) => `${e.floor}\u0001${e.room}`) ?? [];

/** 平面圖上 (x, y) 格的地方點一下 */
async function clickAt(page: Page, x: number, y: number) {
  const p = await hook(page, (h, a) => h.toClient(...(a as [number, number])), [x, y]);
  await page.mouse.click(p.x, p.y);
}

/** 立體圖第 level 層的 (x, y) 格點一下 */
async function clickStack(page: Page, x: number, y: number, level: number) {
  const p = await hook(page, (h, a) => h.stackClient(...(a as [number, number, number])), [
    x,
    y,
    level,
  ]);
  await page.mouse.click(p.x, p.y);
}

/** HTML5 的拖放（晶片 → 時間軸的一步）：直接送 dragstart／dragover／drop（通知可能蓋住目標） */
async function dragChip(page: Page, from: Locator, to: Locator) {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await from.dispatchEvent('dragstart', { dataTransfer: dt });
  await to.dispatchEvent('dragover', { dataTransfer: dt });
  await to.dispatchEvent('drop', { dataTransfer: dt });
}

const viewRadio = (page: Page, name: string) =>
  page.getByTestId('editor-bar').getByRole('radio', { name, exact: true });

/** 畫布的大小與視圖不再變（畫布改大小、開演出時的 fitView 都做完） */
async function settle(page: Page) {
  let prev = '';
  await expect
    .poll(async () => {
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      const cur = JSON.stringify(await hook(page, (h) => [h.toClient(0, 0), h.toClient(10, 10)]));
      const same = cur === prev;
      prev = cur;
      return same;
    })
    .toBe(true);
}

async function stageOn(page: Page, tall = true) {
  await page.getByTestId('stage-toggle').click();
  await expect(page.getByTestId('stage-panel')).toBeVisible();
  if (tall) await page.setViewportSize({ width: 1280, height: 900 });
  await settle(page);
  await hook(page, (h) => h.editor.fitView());
  await settle(page);
}

test.describe('演出的開關與面板（F313、F325、F326）', () => {
  test('打開演出：工具、右邊的演出面板、左邊的房間清單、下方的時間軸；關掉回到原本的編輯', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await expect(page.getByTestId('stage-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stage-tools')).toBeVisible();
    await expect(page.getByTestId('tool-strip')).toHaveCount(0);
    await expect(page.getByTestId('stage-rooms')).toContainText('全部樓層的房間與公開時機');
    await expect(page.getByTestId('stage-dock')).toBeVisible();
    await expect(page.getByTestId('stage-empty')).toBeVisible();
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-stage', 'on');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('aria-label', /演出的畫布/);
    /* 四個步驟的說明 */
    await page.getByRole('button', { name: '演出的四個步驟' }).click();
    await expect(page.getByTestId('stage-panel')).toContainText('播放時的公開是暫時的');
    /* 檢視方式照樣可以換 */
    await viewRadio(page, '立體樓層圖').click();
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    await page.getByTestId('stage-toggle').click();
    await expect(page.getByTestId('stage-panel')).toHaveCount(0);
    await expect(page.getByTestId('stage-dock')).toHaveCount(0);
    await expect(page.getByTestId('props-title')).toHaveText('立體樓層圖');
    expect(errors).toEqual([]);
  });

  test('演出的程式打開演出時才載入：地圖裡有演出也不載入；第一次打開時按鈕顯示載入中', async ({
    page,
  }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (/\/stageModule-[^/]*\.js$/.test(r.url())) chunks.push(r.url());
    });
    const errors = await open(page);
    await clockshop(page);
    /* 地圖裡有演出（專案檔讀進來的樣子），沒有打開演出 */
    await hook(page, (h) => {
      const p = structuredClone(h.useProject.getState().data);
      const f = p.floors[1];
      p.stage = { rooms: [{ floor: f.id, room: f.rooms[0].id }] };
      h.useProject.getState().replace(p);
    });
    await expect.poll(async () => (await project(page)).stage?.rooms?.length).toBe(1);
    await page.getByTestId('editor-bar').getByRole('radio', { name: 'PL 檢視' }).click();
    await viewRadio(page, '樓層總覽').click();
    await viewRadio(page, '平面編輯').click();
    expect(chunks).toEqual([]);
    expect(await hook(page, (h) => h.useStage.getState().ready)).toBe(false);
    /* 第一次打開：載入完之前按鈕是「載入中」 */
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route(/\/stageModule-[^/]*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.getByTestId('stage-toggle').click();
    await expect(page.getByTestId('stage-toggle')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('stage-toggle')).toContainText('載入中');
    release();
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    await expect(page.getByTestId('stage-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(chunks).toHaveLength(1);
    /* 關掉再打開：不再載入 */
    await page.getByTestId('stage-toggle').click();
    await page.getByTestId('stage-toggle').click();
    await expect(page.getByTestId('stage-panel')).toBeVisible();
    expect(chunks).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  for (const width of [390, 360, 320]) {
    test(`窄畫面 ${width}：沒有橫向捲動，面板與時間軸都在`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const errors = await open(page);
      await clockshop(page);
      await stageOn(page, false);
      await page.getByTestId('stage-auto').click();
      await expect(page.getByTestId('stage-steps')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      expect(errors).toEqual([]);
    });
  }
});

test.describe('藏起來與公開（F314、F315）', () => {
  test('平面圖：點房間藏起來、再點公開；整層藏起來、這一層全部藏起來、全部解除；每次一步復原', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    const work = await roomId(page, 1, '修理工房');
    await clickAt(page, 19, 11);
    await expect.poll(() => hiddenRooms(page)).toEqual([keyOf(work)]);
    await expect(page.locator(`[data-stage-room="${keyOf(work)}"]`)).toContainText('公開');
    await clickAt(page, 19, 11);
    await expect.poll(() => hiddenRooms(page)).toEqual([]);
    /* 走廊・樓梯可以藏、地面（騎樓）不行 */
    await clickAt(page, 4, 18);
    await expect(page.getByText('庭院、道路等地面不能藏，請點房間')).toBeVisible();
    await expect.poll(() => hiddenRooms(page)).toEqual([]);
    /* 這一層全部藏起來（店面、樓梯間、修理工房） */
    await page.getByTestId('stage-hide-floor').click();
    await expect.poll(async () => (await hiddenRooms(page)).length).toBe(3);
    /* 整層藏起來（2F）：和祕密樓層分開存 */
    const f2 = (await project(page)).floors[2].id;
    await page.locator(`[data-stage-floor="${f2}"]`).click();
    await expect.poll(async () => (await project(page)).stage?.floors).toEqual([f2]);
    expect((await project(page)).floors[2].secret).toBeUndefined();
    await page.getByTestId('stage-clear-hidden').click();
    await expect.poll(async () => (await project(page)).stage).toBeUndefined();
    /* 復原：整層藏起來回來 */
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await project(page)).stage?.floors).toEqual([f2]);
    /* PL 檢視（開始前的樣子）：樓層列照常切換畫的樓層 */
    await page.getByTestId('editor-bar').getByRole('radio', { name: 'PL 檢視' }).click();
    await hook(page, (h) => h.act.switchFloor(2));
    await expect.poll(() => hook(page, (h) => h.editor.stage.planFloor()?.id)).toBe(f2);
    expect(errors).toEqual([]);
  });

  test('立體樓層圖、樓層總覽：點樓板上的房間切換；PL 的演出畫面是「？？？」、點一下暫時公開', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await viewRadio(page, '立體樓層圖').click();
    const study = await roomId(page, 2, '書房');
    await clickStack(page, 19, 11, 2);
    await expect.poll(() => hiddenRooms(page)).toEqual([keyOf(study)]);
    await viewRadio(page, '樓層總覽').click();
    await clickStack(page, 19, 11, 2);
    await expect.poll(() => hiddenRooms(page)).toEqual([]);
    await clickStack(page, 19, 11, 2);
    await expect.poll(() => hiddenRooms(page)).toEqual([keyOf(study)]);
    /* PL 檢視＝演出的畫面（開始前）：點「？？？」暫時公開，演出的資料不變 */
    await page.getByTestId('editor-bar').getByRole('radio', { name: 'PL 檢視' }).click();
    await clickStack(page, 19, 11, 2);
    await expect.poll(async () => (await stage(page)).openRooms).toEqual([keyOf(study)]);
    expect(await hiddenRooms(page)).toEqual([keyOf(study)]);
    /* 切到 GM 檢視：暫時的公開清掉（再切回 PL 是開始前的樣子） */
    await page.getByTestId('editor-bar').getByRole('radio', { name: 'GM 檢視' }).click();
    await expect.poll(async () => (await stage(page)).openRooms).toEqual([]);
    await page.getByTestId('editor-bar').getByRole('radio', { name: 'PL 檢視' }).click();
    await clickStack(page, 19, 11, 2);
    await expect.poll(async () => (await stage(page)).openRooms).toEqual([keyOf(study)]);
    /* 回到開頭：暫時的公開取消 */
    await page.keyboard.press('Home');
    await expect.poll(async () => (await stage(page)).openRooms).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('移動路線（F316～F318）', () => {
  test('依序點房間連起箭頭（經過門）；點到別一層的房間經過樓梯、分成每一層一條', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await page.getByTestId('stage-tool-route').click();
    await clickAt(page, 7, 8);
    await expect(page.getByTestId('stage-start')).toContainText('出發地：1F「店面」');
    await clickAt(page, 19, 11);
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(1);
    const r1 = (await project(page)).stage?.routes?.[0];
    expect(r1?.pts?.length).toBeGreaterThan(2);
    /* 接著從修理工房出發 */
    await expect(page.getByTestId('stage-start')).toContainText('修理工房');
    /* 立體圖上點 2F 的書房：經過樓梯（1F 一條、2F 一條） */
    await viewRadio(page, '立體樓層圖').click();
    await clickStack(page, 19, 11, 2);
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(3);
    const p = await project(page);
    expect(p.stage?.routes?.map((r) => r.floor)).toEqual([
      p.floors[1].id,
      p.floors[1].id,
      p.floors[2].id,
    ]);
    const tl = await timeline(page);
    expect(tl.steps.map((s) => [s.kind, s.bridge])).toEqual([
      ['start', false],
      ['route', false],
      ['route', false],
      ['route', true],
    ]);
    await expect(page.locator('[data-stage-stairs]')).toContainText('經過樓梯 1F → 2F');
    /* 刪掉最後一段、全部清除 */
    await page.getByTestId('stage-undo-route').click();
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(2);
    await page.getByTestId('stage-clear-routes').click();
    await expect.poll(async () => (await project(page)).stage).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('平面圖上拖曳畫自由的箭頭；拖曳編號圓標改起點', async ({ page }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    const a = await hook(page, (h) => h.toClient(3, 14));
    const b = await hook(page, (h) => h.toClient(10, 14));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(1);
    const r = (await project(page)).stage?.routes?.[0];
    expect(r).toMatchObject({ x1: 3, y1: 14, x2: 10, y2: 14 });
    expect(r?.pts).toBeUndefined();
    /* 編號圓標（起點）拖到 (3, 12) */
    const a2 = await hook(page, (h) => h.toClient(3, 14));
    const c = await hook(page, (h) => h.toClient(3, 12));
    await page.mouse.move(a2.x, a2.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const q = (await project(page)).stage?.routes?.[0];
        return q ? [q.x1, q.y1] : null;
      })
      .toEqual([3, 12]);
    /* 太短的不算 */
    const d = await hook(page, (h) => h.toClient(5, 4));
    const e = await hook(page, (h) => h.toClient(5.2, 4));
    await page.mouse.move(d.x, d.y);
    await page.mouse.down();
    await page.mouse.move(e.x, e.y + 8, { steps: 4 });
    await page.mouse.up();
    expect((await project(page)).stage?.routes?.length).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('時間軸、自動產生（F319～F321）', () => {
  test('自動產生演出（一步復原）；點一步看那一步；晶片拖到「點了才公開」；選單改公開時機', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await page.getByTestId('stage-auto').click();
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(5);
    const tl = await timeline(page);
    expect(tl.steps.map((s) => s.kind)).toEqual([
      'start',
      'route',
      'route',
      'route',
      'route',
      'route',
      'room',
    ]);
    expect(tl.total).toBeCloseTo(0.8 + 1.7 * 5 + 0.7 + 1, 5);
    await expect(page.locator('[data-stage-step]')).toHaveCount(8);
    /* 點 STEP 3：看那一步完成的樣子（PL 的演出畫面） */
    await page.locator('[data-stage-jump="3"]').click();
    await expect.poll(async () => (await stage(page)).preview).toBe(true);
    const s = await stage(page);
    expect(s.time).toBeCloseTo(tl.steps[3].start + tl.steps[3].duration, 2);
    await expect(page.locator('[data-stage-jump="3"]')).toHaveAttribute('aria-current', 'step');
    /* 晶片拖到「點了才公開」 */
    const chip = page.locator('[data-stage-step="1"] [data-stage-chip]').first();
    const key = (await chip.getAttribute('data-stage-chip')) ?? '';
    await dragChip(page, chip, page.locator('[data-stage-step="manual"]'));
    await expect.poll(async () => (await timeline(page)).manual).toEqual([key]);
    /* 改了演出：回到準備的樣子 */
    await expect.poll(async () => (await stage(page)).preview).toBe(false);
    /* 選單：改回自動 */
    await page.getByTestId('stage-rooms').locator(`[data-stage-when="${key}"]`).click();
    await page.getByRole('option', { name: '自動（路線經過時；沒有時最後）' }).click();
    await expect.poll(async () => (await timeline(page)).manual).toEqual([]);
    /* 復原兩次：拖之前、自動產生之前 */
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await project(page)).stage?.routes?.length).toBe(5);
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await project(page)).stage).toBeUndefined();
    expect(errors).toEqual([]);
  });
});

test.describe('播放（F322）', () => {
  test('下一步（播放下一步就停）、播放／暫停、回到開頭（回到準備的樣子）、全部公開', async ({
    page,
  }) => {
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await page.getByTestId('stage-auto').click();
    const tl = await timeline(page);
    /* 預覽速度（原作的再生速度；0.5～2 倍） */
    await expect(page.getByTestId('stage-dock').getByLabel('預覽速度')).toHaveValue('1');
    await page.getByTestId('stage-next').click();
    await expect
      .poll(async () => (await stage(page)).time, { timeout: 8000 })
      .toBeGreaterThan(tl.steps[1].start + tl.steps[1].duration - 0.01);
    await expect.poll(async () => (await stage(page)).playing).toBe(false);
    expect((await stage(page)).time).toBeLessThan(tl.steps[2].start);
    await expect(page.locator('[data-stage-jump="1"]')).toHaveAttribute('aria-current', 'step');
    /* 播放／暫停（共用的播放列） */
    await page.getByTestId('stage-dock').getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(async () => (await stage(page)).playing).toBe(true);
    await expect
      .poll(async () => (await stage(page)).time)
      .toBeGreaterThan(tl.steps[2].start + 0.2);
    await page.getByTestId('stage-dock').getByRole('button', { name: '暫停', exact: true }).click();
    await expect.poll(async () => (await stage(page)).playing).toBe(false);
    /* 回到開頭 */
    await page.getByTestId('stage-dock').getByRole('button', { name: '回到開頭' }).click();
    await expect.poll(async () => (await stage(page)).preview).toBe(false);
    expect((await stage(page)).time).toBe(0);
    /* 全部公開 */
    await page.getByTestId('stage-reveal-all').click();
    await expect.poll(async () => (await stage(page)).preview).toBe(true);
    /* Esc：回到準備的樣子 */
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await stage(page)).preview).toBe(false);
    expect(errors).toEqual([]);
  });
});

function isWebm(b: Buffer) {
  return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

test.describe('匯出演出（F323）', () => {
  test('逐步公開 ZIP、現在的畫面 PNG、WebM、MP4', { tag: '@serial' }, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await clockshop(page);
    await stageOn(page);
    await page.getByTestId('stage-auto').click();
    await page.getByTestId('stage-export-open').click();
    const dialog = page.getByRole('dialog', { name: '匯出演出（PL 用）' });
    await expect(dialog).toBeVisible();
    const exportAs = async (label: string) => {
      await dialog.getByRole('radio', { name: label, exact: true }).click();
      await dialog.getByRole('button', { name: `匯出 ${label}` }).click();
      await expect(dialog.getByTestId('export-result')).toBeVisible({ timeout: 180_000 });
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        dialog.getByRole('link', { name: '下載' }).click(),
      ]);
      return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
    };
    /* 逐步公開 ZIP：開始前＋每一步 */
    const zip = await exportAs('逐步公開 ZIP');
    expect(zip.name).toBe('鐘錶行（地下室～2F）_逐步公開.zip');
    const files = Object.keys(unzipSync(new Uint8Array(zip.bytes)));
    expect(files).toEqual([
      '001_開始前.png',
      '002_路線1_1F.png',
      '003_路線2_1F.png',
      '004_路線3_2F.png',
      '005_路線4_2F.png',
      '006_路線5_2F.png',
      '007_2F_公開房間.png',
    ]);
    const first = unzipSync(new Uint8Array(zip.bytes))['001_開始前.png'];
    const ihdr = readIhdr(parseChunks(Buffer.from(first)));
    expect(Math.max(ihdr.width, ihdr.height)).toBe(2400);
    /* 現在的畫面 PNG */
    const png = await exportAs('現在的畫面');
    expect(png.name).toBe('鐘錶行（地下室～2F）_演出畫面.png');
    expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
    const cur = readIhdr(parseChunks(Buffer.from(png.bytes)));
    expect(Math.max(cur.width, cur.height)).toBe(2400);
    /* WebM */
    const webm = await exportAs('WebM');
    expect(webm.name).toBe('鐘錶行（地下室～2F）_演出.webm');
    expect(isWebm(webm.bytes)).toBe(true);
    /* 畫面是不透明的：WebM 不帶透明度；FPS 的說明寫「照 1 倍速」（不重複寫 30 fps） */
    await expect(dialog.getByTestId('export-result')).not.toContainText('透明度');
    await expect(dialog).toContainText('照 1 倍速');
    /* MP4（瀏覽器能編 H.264 或 VP9 時；不能時即時錄影也是 MP4 或 WebM） */
    const mp4 = await exportAs('MP4');
    expect(mp4.name).toMatch(/^鐘錶行（地下室～2F）_演出\.(mp4|webm)$/);
    if (mp4.name.endsWith('.mp4')) expect(mp4.bytes.subarray(4, 8).toString()).toBe('ftyp');
    expect(errors).toEqual([]);
  });
});
