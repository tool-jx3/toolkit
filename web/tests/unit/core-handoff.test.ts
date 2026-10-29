/**
 * 工具之間交接一個檔案（@/core/handoff，2026-10-29；floor-plan F267 → map-fx F84）：寄出、收件（讀過一次就刪）、
 * 過期與壞掉的資料、沒有 IndexedDB。IndexedDB 換成記憶體裡的 Map（@/core/storage 的 idb 小工具）。
 * 先開分頁、後送資料（主控追加）：交接編號、等那一筆（晚到、寄件的分頁說還在準備、失敗、等不到）；
 * 分頁之間的通知用 Node 內建的 BroadcastChannel（同一個程序裡的兩個頻道物件互相收得到）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
let available = true;
let failWrite = false;

vi.mock('@/core/storage', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/core/storage')>();
  return {
    ...real,
    hasIndexedDb: () => available,
    idbStore: () => ({}) as never,
    idbGet: async (k: IDBValidKey) => db.get(String(k)),
    idbSet: async (k: IDBValidKey, v: unknown) => {
      if (failWrite) throw new Error('QuotaExceededError');
      db.set(String(k), v);
    },
    idbDel: async (k: IDBValidKey) => {
      db.delete(String(k));
    },
    idbEntries: async () => [...db.entries()],
  };
});

const {
  HANDOFF_MAX_AGE_MS,
  beginHandoff,
  failHandoff,
  handoffHref,
  hasHandoff,
  purgeHandoffs,
  readHandoffId,
  sendHandoff,
  takeHandoff,
  waitHandoff,
} = await import('@/core/handoff');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const blob = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

beforeEach(() => {
  db.clear();
  available = true;
  failWrite = false;
});

describe('core/handoff', () => {
  it('寄出 → 收件：讀出來就刪掉（讀過一次就沒有了）', async () => {
    const ok = await sendHandoff(
      { to: 'map-fx', from: 'floor-plan', name: '套房_PL', blob: blob(), meta: { gridPx: 48 } },
      1000,
    );
    expect(ok).toBe(true);
    expect(await hasHandoff('map-fx')).toBe(true);
    const h = await takeHandoff('map-fx', { now: 2000 });
    expect(h).toMatchObject({
      to: 'map-fx',
      from: 'floor-plan',
      name: '套房_PL',
      meta: { gridPx: 48 },
      createdAt: 1000,
    });
    expect(h?.blob).toBeInstanceOf(Blob);
    expect(await takeHandoff('map-fx', { now: 2000 })).toBeNull();
    expect(await hasHandoff('map-fx')).toBe(false);
  });

  it('同一個收件人只留最新的一份；別的收件人的不受影響', async () => {
    await sendHandoff({ to: 'map-fx', from: 'a', name: '舊的', blob: blob() }, 1);
    await sendHandoff({ to: 'map-fx', from: 'a', name: '新的', blob: blob() }, 2);
    await sendHandoff({ to: 'other', from: 'a', name: '別人的', blob: blob() }, 2);
    expect((await takeHandoff('map-fx', { now: 3 }))?.name).toBe('新的');
    expect((await takeHandoff('other', { now: 3 }))?.name).toBe('別人的');
  });

  it('過期（超過一天）與壞掉的資料：收件時清掉、回傳 null', async () => {
    await sendHandoff({ to: 'map-fx', from: 'a', name: '舊', blob: blob() }, 0);
    await sendHandoff({ to: 'other', from: 'a', name: '舊', blob: blob() }, 0);
    db.set('broken', { to: 'broken', name: 1 });
    expect(await takeHandoff('map-fx', { now: HANDOFF_MAX_AGE_MS + 1 })).toBeNull();
    expect(db.size).toBe(0);
    await sendHandoff({ to: 'map-fx', from: 'a', name: '剛好一天', blob: blob() }, 0);
    expect((await takeHandoff('map-fx', { now: HANDOFF_MAX_AGE_MS }))?.name).toBe('剛好一天');
    db.set('x', { to: 'x', from: 'a', name: 'n', createdAt: 0, blob: 'not a blob' });
    expect(await purgeHandoffs(HANDOFF_MAX_AGE_MS, 1)).toBe(1);
  });

  it('沒有 IndexedDB、寫入失敗：寄出回傳 false，收件 null', async () => {
    available = false;
    expect(await sendHandoff({ to: 'map-fx', from: 'a', name: 'n', blob: blob() })).toBe(false);
    expect(await takeHandoff('map-fx')).toBeNull();
    available = true;
    failWrite = true;
    expect(await sendHandoff({ to: 'map-fx', from: 'a', name: 'n', blob: blob() })).toBe(false);
  });

  it('交接編號：網址的 #handoff=…（換掉原本的 #）；格式不對時 null', () => {
    expect(handoffHref('/next/map-fx/#s=abc', 'a1-B2_c')).toBe('/next/map-fx/#handoff=a1-B2_c');
    expect(readHandoffId('#handoff=a1-B2_c')).toBe('a1-B2_c');
    expect(readHandoffId('handoff=x&s=1')).toBe('x');
    expect(readHandoffId('')).toBeNull();
    expect(readHandoffId('#s=abc')).toBeNull();
    expect(readHandoffId('#handoff=<script>')).toBeNull();
    expect(readHandoffId(`#handoff=${'a'.repeat(65)}`)).toBeNull();
    const id = beginHandoff('map-fx');
    expect(readHandoffId(new URL(handoffHref('/x/', id), 'https://example.invalid').hash)).toBe(id);
  });

  it('等那一筆：資料晚到也讀得到（讀出就刪）；別的編號的資料不算', async () => {
    const id = beginHandoff('map-fx');
    await sendHandoff({ to: 'map-fx', from: 'a', name: '別的', blob: blob(), id: 'other-id' });
    const wait = waitHandoff('map-fx', id, { timeoutMs: 2000, intervalMs: 10 });
    await sleep(80);
    expect(
      await sendHandoff({ to: 'map-fx', from: 'floor-plan', name: '晚到的', blob: blob(), id }),
    ).toBe(true);
    const r = await wait;
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.handoff.name).toBe('晚到的');
    expect(db.has('map-fx')).toBe(false);
  });

  it('寄件的分頁說「還在準備」時超過 timeoutMs 也繼續等；沒有寄件的分頁時等不到', async () => {
    const id = beginHandoff('map-fx');
    const wait = waitHandoff('map-fx', id, { timeoutMs: 60, intervalMs: 10 });
    await sleep(250);
    await sendHandoff({ to: 'map-fx', from: 'floor-plan', name: '畫很久', blob: blob(), id });
    expect((await wait).status).toBe('ok');
    const t0 = Date.now();
    expect((await waitHandoff('map-fx', 'nobody', { timeoutMs: 60, intervalMs: 10 })).status).toBe(
      'timeout',
    );
    expect(Date.now() - t0).toBeLessThan(1000);
    /* 一直說還在準備：最多等 maxMs */
    const stuck = beginHandoff('map-fx');
    expect(
      (await waitHandoff('map-fx', stuck, { timeoutMs: 30, maxMs: 120, intervalMs: 10 })).status,
    ).toBe('timeout');
  });

  it('寫入失敗：等著的分頁馬上知道（失敗的紀錄寫不進去時靠通知；收件的分頁比失敗晚開也問得到）', async () => {
    failWrite = true;
    const id = beginHandoff('map-fx');
    const wait = waitHandoff('map-fx', id, { timeoutMs: 5000, intervalMs: 50 });
    await sleep(30);
    const t0 = Date.now();
    expect(
      await sendHandoff({ to: 'map-fx', from: 'floor-plan', name: 'n', blob: blob(), id }),
    ).toBe(false);
    expect((await wait).status).toBe('failed');
    expect(Date.now() - t0).toBeLessThan(1000);
    /* 先失敗、收件的分頁才開始等 */
    const late = beginHandoff('map-fx');
    await sendHandoff({ to: 'map-fx', from: 'floor-plan', name: 'n', blob: blob(), id: late });
    expect((await waitHandoff('map-fx', late, { timeoutMs: 5000, intervalMs: 50 })).status).toBe(
      'failed',
    );
  });

  it('失敗的紀錄：寫得進去時留一筆（收件的分頁讀到就刪）；過期的清掉', async () => {
    await failHandoff('map-fx', 'gone-tab', 1000);
    expect(db.get('failed:gone-tab')).toMatchObject({ failed: true, to: 'map-fx', id: 'gone-tab' });
    expect(await purgeHandoffs(HANDOFF_MAX_AGE_MS, 2000)).toBe(0);
    db.set('failed:old', { failed: true, to: 'map-fx', id: 'old', createdAt: 0 });
    expect(await purgeHandoffs(HANDOFF_MAX_AGE_MS, HANDOFF_MAX_AGE_MS + 1)).toBe(1);
    db.delete('failed:gone-tab');
    await failHandoff('map-fx', 'mark-only', Date.now());
    expect((await waitHandoff('map-fx', 'mark-only', { timeoutMs: 5000 })).status).toBe('failed');
    expect(db.has('failed:mark-only')).toBe(false);
    available = false;
    expect((await waitHandoff('map-fx', 'x')).status).toBe('failed');
  });
});
