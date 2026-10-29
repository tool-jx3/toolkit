/**
 * 工具之間交接一個檔案（@/core/handoff，2026-10-29；floor-plan F267 → map-fx F84）：寄出、收件（讀過一次就刪）、
 * 過期與壞掉的資料、沒有 IndexedDB。IndexedDB 換成記憶體裡的 Map（@/core/storage 的 idb 小工具）。
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

const { HANDOFF_MAX_AGE_MS, hasHandoff, purgeHandoffs, sendHandoff, takeHandoff } = await import(
  '@/core/handoff'
);

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
});
