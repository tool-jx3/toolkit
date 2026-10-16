/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第五批：版本快照（F015）與動畫的輸出計畫、互動網頁的動畫資料。IndexedDB 換成記憶體裡的 Map（@/core/storage 的 idb 小工具）。
 * - 自動快照：存檔成功後、有改動、距最新一份 10 分鐘以上、專案不是空的才拍（原作的 snapMaybeAuto）；
 * - 還原整份：先拍「還原前」、可以復原、分頁庫留著；快照裡的圖另存一份（資產被回收了也還原得回來，7.4 第 15 項）；
 * - 命名＝永久、刪除＝回收沒人用的圖、匯出／匯入（疊加、同 id 跳過、一律轉成手動）；
 * - 讀得進原作「匯出全部」的快照備份（`fixtures/relation-chart-b5-snapshots.zip`：原作的備份，大圖換成 1 × 1 的 PNG）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('@/core/storage', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/core/storage')>();
  return {
    ...orig,
    idbStore: () => ({}) as never,
    hasIndexedDb: () => true,
    idbGet: async (k: IDBValidKey) => db.get(String(k)),
    idbSet: async (k: IDBValidKey, v: unknown) => {
      db.set(String(k), v);
    },
    idbDel: async (k: IDBValidKey) => {
      db.delete(String(k));
    },
    idbKeys: async () => [...db.keys()],
  };
});

const { redo, undo } = await import('@/tools/relation-chart/editor/undo');
const { animPlan, animPlanFor, planSeconds } = await import('@/tools/relation-chart/export/anim');
const { viewerHtml } = await import('@/tools/relation-chart/export/viewer');
const { convertLegacy } = await import('@/tools/relation-chart/logic/legacy');
const { buildSample } = await import('@/tools/relation-chart/logic/samples');
const { emptySheet, initialProject, normalizeSheet } = await import(
  '@/tools/relation-chart/model/normalize'
);
const { addChar, addSample, addSheet, deleteSheet, updateChar } = await import(
  '@/tools/relation-chart/state/actions'
);
const snaps = await import('@/tools/relation-chart/state/snapshots');
const { assets, setUi, updateProject, useProject } = await import(
  '@/tools/relation-chart/state/store'
);

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: { (p: string, enc: 'utf8'): string; (p: string): Uint8Array };
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;

const IMG = 'abcdef0123456789abcdef01';
const blobs = new Map<string, Blob>([[IMG, new Blob(['PNG'], { type: 'image/png' })]]);
let now = 1e12;

beforeEach(() => {
  db.clear();
  snaps.resetSnapsForTest();
  now = 1e12;
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 10));
  vi.spyOn(assets, 'get').mockImplementation(async (id: string) => blobs.get(id));
  vi.spyOn(assets, 'put').mockImplementation(async (id: string, b: Blob) => {
    blobs.set(id, b);
    return { id, persisted: true };
  });
  setUi({ sel: [], panel: null, readonly: false, tlPos: null });
  const s = emptySheet(1, 1, { W: 1000, H: 800 });
  useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 10 });
  useProject.temporal.getState().clear();
});

const p = () => useProject.getState().data;

describe('版本快照', () => {
  it('手動快照：沒名字＝「手動快照」（原作寫成自動快照）、有名字照用；圖另存一份', async () => {
    const id = addChar(() => 0.5);
    updateChar(id, (c) => {
      c.avatar = { img: IMG, src: null, place: null };
    });
    expect(await snaps.takeSnapshot('', false)).toBe(true);
    expect(await snaps.takeSnapshot('第一份', false)).toBe(true);
    const list = snaps.useSnaps.getState().list ?? [];
    const L = { auto: '自動快照', manual: '手動快照' };
    expect(list.map((m) => snaps.snapLabel(m, L))).toEqual(['第一份', '手動快照']);
    expect(list[0].summary).toEqual({ sheets: 1, chars: 1 });
    expect(list[0].imgs).toContain(IMG);
    expect(db.get(`img:${IMG}`)).toBeInstanceOf(Blob);
  });

  it('自動快照：沒有改動、不到 10 分鐘、專案是空的都不拍', async () => {
    await snaps.loadSnaps();
    expect(await snaps.maybeAutoSnapshot(now)).toBe(false);
    updateProject((d) => {
      d.sheets[0].name = '改了名字';
    });
    /* 專案是空的 */
    expect(await snaps.maybeAutoSnapshot(now)).toBe(false);
    addChar(() => 0.5);
    expect(await snaps.maybeAutoSnapshot(now)).toBe(true);
    expect(snaps.useSnaps.getState().list?.[0].auto).toBe(true);
    /* 剛拍過：沒有新的改動 */
    expect(await snaps.maybeAutoSnapshot(now + snaps.SNAP_AUTO_MS * 2)).toBe(false);
    addChar(() => 0.2);
    expect(await snaps.maybeAutoSnapshot(now + 60_000)).toBe(false);
    expect(await snaps.maybeAutoSnapshot(now + snaps.SNAP_AUTO_MS + 1000)).toBe(true);
    expect(snaps.useSnaps.getState().list).toHaveLength(2);
  });

  it('還原整份：先拍「還原前」、可以復原；分頁庫留著；被回收的圖放回資產庫', async () => {
    const id = addChar(() => 0.5);
    updateChar(id, (c) => {
      c.avatar = { img: IMG, src: null, place: null };
    });
    await snaps.takeSnapshot('存底', false);
    const snapId = snaps.useSnaps.getState().list?.[0].id as string;
    /* 之後：加一張分頁再刪掉（進分頁庫）、改名字、圖被回收 */
    addSheet(false);
    deleteSheet(1);
    updateProject((d) => {
      d.sheets[0].name = '之後';
    });
    blobs.delete(IMG);
    expect(await snaps.restoreSnapshot(snapId, '還原前')).toBe('ok');
    expect(p().sheets[0].name).toBe('');
    expect(p().sheetLib).toHaveLength(1);
    expect(blobs.has(IMG)).toBe(true);
    const names = (snaps.useSnaps.getState().list ?? []).map((m) => [m.name, m.auto]);
    expect(names).toEqual([
      ['還原前', true],
      ['存底', false],
    ]);
    undo();
    expect(p().sheets[0].name).toBe('之後');
    redo();
    expect(p().sheets[0].name).toBe('');
  });

  it('只取一個分頁：加成新分頁（角色、條目照快照）', async () => {
    addSample(buildSample('story'));
    await snaps.takeSnapshot('', false);
    const snapId = snaps.useSnaps.getState().list?.[0].id as string;
    deleteSheet(1);
    expect(p().sheets).toHaveLength(1);
    expect(await snaps.takeSheetFromSnapshot(snapId, 1)).toBe('ok');
    expect(p().sheets).toHaveLength(2);
    expect(p().sheets[1].name).toBe('範例：故事人物');
    expect(p().sheets[1].chars).toHaveLength(6);
    expect(p().active).toBe(1);
    undo();
    expect(p().sheets).toHaveLength(1);
  });

  it('命名＝永久（清空不降回自動）；刪除＝圖沒人用就回收；不存在的快照＝gone', async () => {
    const id = addChar(() => 0.5);
    updateChar(id, (c) => {
      c.avatar = { img: IMG, src: null, place: null };
    });
    await snaps.loadSnaps();
    updateProject((d) => {
      d.sheets[0].name = 'x';
    });
    await snaps.maybeAutoSnapshot(now);
    const m = (snaps.useSnaps.getState().list ?? [])[0];
    expect(m.auto).toBe(true);
    await snaps.renameSnapshot(m.id, '  我的存底  ');
    expect(snaps.useSnaps.getState().list?.[0]).toMatchObject({ name: '我的存底', auto: false });
    await snaps.renameSnapshot(m.id, '');
    expect(snaps.useSnaps.getState().list?.[0].auto).toBe(false);
    await snaps.deleteSnapshot(m.id);
    expect(snaps.useSnaps.getState().list).toEqual([]);
    expect(db.has(`img:${IMG}`)).toBe(false);
    expect(await snaps.restoreSnapshot(m.id, '還原前')).toBe('gone');
  });

  it('匯出全部 → 匯入：疊加、同 id 跳過、一律轉成手動', async () => {
    const id = addChar(() => 0.5);
    updateChar(id, (c) => {
      c.avatar = { img: IMG, src: null, place: null };
    });
    await snaps.loadSnaps();
    updateProject((d) => {
      d.sheets[0].name = 'x';
    });
    await snaps.maybeAutoSnapshot(now);
    await snaps.takeSnapshot('手動', false);
    const out = await snaps.exportSnapshots();
    expect(out?.count).toBe(2);
    db.clear();
    snaps.resetSnapsForTest();
    expect(await snaps.importSnapshots(out?.bytes as Uint8Array)).toEqual({ added: 2, skipped: 0 });
    const list = snaps.useSnaps.getState().list ?? [];
    expect(list.every((m) => !m.auto && !m.legacy)).toBe(true);
    expect(db.get(`img:${IMG}`)).toBeInstanceOf(Blob);
    expect(await snaps.importSnapshots(out?.bytes as Uint8Array)).toEqual({ added: 0, skipped: 2 });
    expect(await snaps.importSnapshots(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('原作「匯出全部」的備份：3 份（開工前自動、命名手動、無名手動）都轉成手動；資料讀得進來（含時間軸）', async () => {
    const bytes = readFileSync(`${DIR}relation-chart-b5-snapshots.zip`);
    expect(await snaps.importSnapshots(bytes)).toEqual({ added: 3, skipped: 0 });
    const list = snaps.useSnaps.getState().list ?? [];
    expect(list.map((m) => [m.name, m.auto, m.legacy])).toEqual([
      ['', false, true],
      ['第一份（手動）', false, true],
      ['', false, true],
    ]);
    expect(list[0].summary).toEqual({ sheets: 3, chars: 13 });
    expect(list[0].sheetNames).toEqual(['說明', '第一章（時間軸）', '範例：家族樹']);
    expect([...db.keys()].filter((k) => k.startsWith('limg:'))).toHaveLength(3);
    const data = await snaps.legacySnapshotData(list[0].id);
    expect(JSON.stringify(data)).not.toContain('@@snapimg:');
    const conv = convertLegacy(data as Record<string, unknown>);
    expect(conv.sheets.map((s) => s.name)).toEqual(['說明', '第一章（時間軸）', '範例：家族樹']);
    const tl = conv.sheets[1].tl;
    expect(tl?.frames.map((f) => f.hold)).toEqual([
      [],
      ['chars', 'charts', 'bg'],
      [],
      ['chars', 'notes', 'charts', 'bg'],
    ]);
    expect(tl?.speed).toBe(1.5);
    /* 背景圖、頭像是內嵌的 data URI */
    expect([...conv.backgrounds.values()].every((u) => u.startsWith('data:image/'))).toBe(true);
    expect([...conv.avatars.values()][0].img.startsWith('data:image/')).toBe(true);
  });
});

describe('GIF／影片的取樣計畫', () => {
  it('超過上限＝等距抽樣、延遲同比例放大（原作：41 格 × 5 秒 → 600 格、334 ms）', () => {
    const s = emptySheet(1, 1, { W: 1000, H: 800 });
    s.tl = {
      frames: Array.from({ length: 41 }, (_, k) => ({
        id: k + 1,
        no: k + 1,
        W: 1000,
        H: 800,
        chars: [],
        rels: [],
        notes: [],
        bg: null,
        hold: [],
        dur: 5,
      })),
      active: 0,
      hidden: [],
      locked: [],
      speed: 1,
    };
    const g = animPlan(normalizeSheet(s, 1) as never, { maxSide: 960, maxFrames: 600 });
    expect([g.ps.length, g.delay, g.w, g.h]).toEqual([600, 334, 960, 768]);
    expect(planSeconds(g)).toBeCloseTo((599 * 334 + 1000) / 1000, 6);
  });

  it('影片的寬高取偶數（MP4）', () => {
    const s = emptySheet(1, 1, { W: 1001, H: 777 });
    s.tl = {
      frames: [1, 2].map((k) => ({
        id: k,
        no: k,
        W: 1001,
        H: 777,
        chars: [],
        rels: [],
        notes: [],
        bg: null,
        hold: [],
        dur: null,
      })),
      active: 0,
      hidden: [],
      locked: [],
      speed: 1,
    };
    const v = animPlanFor(normalizeSheet(s, 1) as never, 'video', true);
    expect([v.w % 2, v.h % 2, v.w, v.h]).toEqual([0, 0, 1000, 776]);
  });
});

describe('互動網頁的動畫', () => {
  it('時間軸分頁：預先算好的畫面、每段秒數（含播放速度）、播放列；一般分頁一個位元組都不多', () => {
    const tl = normalizeSheet(buildSample('timeline'), 1);
    const story = normalizeSheet(buildSample('story'), 2);
    const look = { font: 'sans' as const, labels: [], uris: new Map<string, string>() };
    const html = viewerHtml([tl as never], look);
    expect(html).toContain('id="animBar"');
    const m = /\((\{"sheets":\[[\s\S]*?\],"txt":\{[^}]*\}\}),D\.imgs\)/.exec(html);
    const data = JSON.parse(m?.[1] ?? 'null');
    expect(data.sheets[0]).toMatchObject({ steps: 24, n: 3, durs: [1.18, 1.18] });
    expect(data.sheets[0].frames).toHaveLength(49);
    const plain = viewerHtml([story as never], look);
    expect(plain).not.toContain('animBar');
    expect(plain).not.toContain(',D.imgs)');
    expect(plain).not.toContain('"durs":');
  });
});
