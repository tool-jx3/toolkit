// @vitest-environment jsdom
/**
 * 角色介紹圖產生器的自動儲存（F91、規格 3.6）：localStorage 裡版本 1 的內容（2026-10 以前，沒有背景、段落標題、每列張數）
 * 開頁時照常讀回，缺的設定補預設值；寫回時是版本 2。
 */
import { describe, expect, it } from 'vitest';
import { DRAFT_VERSION, type Draft } from '@/tools/pair-maker/model';
import { draftToolId, openDraft } from '@/tools/pair-maker/store';
import { templateById } from '@/tools/pair-maker/templates';

const def = (id: string) => {
  const d = templateById(id);
  if (!d) throw new Error(id);
  return d;
};

const key = (id: string) => `trpg-toolkit:${draftToolId(id)}`;

/** 版本 1 的自動儲存（zustand persist 的格式） */
function saveV1(id: string, data: Draft) {
  localStorage.setItem(key(id), JSON.stringify({ state: { data }, version: 1 }));
}

describe('自動儲存：版本 1 → 2', () => {
  it('雙人資料卡：沒有背景與段落標題的舊內容照常讀回，補上預設值', async () => {
    const t = def('duo-sheet');
    const old = JSON.parse(JSON.stringify(t.initial())) as Draft;
    old.v['left.name'] = '舊的名字';
    for (const k of Object.keys(old.v))
      if (k.startsWith('c.bg') || k.endsWith('Title')) delete old.v[k];
    expect(old.v['c.bgMode']).toBeUndefined();
    saveV1(t.id, old);
    const r = openDraft(t);
    expect(r).toMatchObject({ restored: true, failed: false });
    const d = r.store.getState().data;
    expect(d.v).toMatchObject({
      'left.name': '舊的名字',
      'c.bgMode': 'color',
      'c.bgColor': '#f3f1ec',
      'c.bgBlur': false,
      'left.outfitTitle': '平常服裝',
      'right.featuresTitle': '外觀特徵',
    });
    /* 寫回時是新的版本 */
    r.store.getState().update((x) => {
      x.v['left.name'] = '改過';
    });
    await new Promise((ok) => setTimeout(ok, 0));
    const saved = JSON.parse(localStorage.getItem(key(t.id)) ?? '{}');
    expect(saved.version).toBe(DRAFT_VERSION);
    expect(saved.state.data.v['c.bgMode']).toBe('color');
  });

  it('多人資料卡：沒有每列張數的舊內容當每列 3 張', () => {
    const t = def('roster');
    const old = JSON.parse(JSON.stringify(t.initial())) as Draft;
    delete old.cols;
    old.members = [1, 2, 3, 4];
    old.nextNo = 5;
    saveV1(t.id, old);
    const r = openDraft(t);
    expect(r.restored).toBe(true);
    const d = r.store.getState().data;
    expect(d.cols).toBe(3);
    expect(t.size(d)).toEqual({ width: 1845, height: 1390 });
  });
});
