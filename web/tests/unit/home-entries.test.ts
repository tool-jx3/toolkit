/**
 * 首頁的工具清單（web/src/home/entries.ts）：從 registry 產生卡片、依群組分段、搜尋、靈感來源。
 */
import { Wrench } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  EXTERNAL,
  type HomeEntry,
  homeEntries,
  inspirations,
  LEGACY,
  matchEntry,
  sections,
} from '@/home/entries';
import { toolIcon } from '@/home/icons';
import { TOOLS } from '@/registry';

const live = TOOLS.filter((t) => t.status === 'live');

describe('homeEntries', () => {
  it('正式版：列出已上線的工具（連到 tools/<id>/）、還沒上線的舊版工具與其他網站，不列重寫中的', () => {
    const list = homeEntries();
    for (const t of live) {
      expect(list).toContainEqual(
        expect.objectContaining({ id: t.id, href: `./tools/${t.id}/`, kind: 'live' }),
      );
    }
    for (const t of TOOLS.filter((t) => t.status === 'next')) {
      expect(list.some((e) => e.id === t.id && e.kind === 'next')).toBe(false);
    }
    expect(list.some((e) => e.id === '_gallery')).toBe(false);
    for (const e of EXTERNAL) expect(list).toContainEqual(e);
    for (const e of LEGACY) {
      expect(list.some((x) => x === e)).toBe(!live.some((t) => t.id === e.id));
    }
    const ids = list.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('開發伺服器：連到原始碼的頁面，也列出重寫中的工具與開發用頁面', () => {
    const list = homeEntries(true);
    expect(list).toContainEqual(
      expect.objectContaining({ id: '_gallery', href: './tools/_gallery/', kind: 'next' }),
    );
    for (const t of TOOLS)
      expect(list.some((e) => e.id === t.id && e.kind === t.status)).toBe(true);
  });

  it('舊版工具的新版上線後，自動換成新版（不重複列）', () => {
    for (const e of LEGACY) {
      if (live.some((t) => t.id === e.id)) {
        expect(homeEntries().filter((x) => x.id === e.id)).toEqual([
          expect.objectContaining({ kind: 'live' }),
        ]);
      }
    }
  });

  it('每個工具都有自己的圖示（新增工具時記得在 home/icons.tsx 加上）', () => {
    for (const e of homeEntries(true)) expect(toolIcon(e.id), e.id).not.toBe(Wrench);
  });
});

const entry = (over: Partial<HomeEntry>): HomeEntry => ({
  id: 'x',
  name: '名稱',
  summary: '說明',
  href: './tools/x/',
  group: 'G1',
  kind: 'live',
  ...over,
});

describe('sections', () => {
  it('依群組順序分段（G10 在 G9 後面、開發用與其他網站放最後），沒有工具的群組不列', () => {
    const list = [
      entry({ id: 'a', group: 'G10' }),
      entry({ id: 'b', group: 'dev' }),
      entry({ id: 'c', group: null, kind: 'external' }),
      entry({ id: 'd', group: 'G2' }),
      entry({ id: 'e', group: 'G9' }),
      entry({ id: 'f', group: 'G2' }),
    ];
    expect(sections(list).map((s) => [s.group, s.title, s.entries.map((e) => e.id)])).toEqual([
      ['G2', '轉場與動態', ['d', 'f']],
      ['G9', 'CoC 跑團輔助', ['e']],
      ['G10', '地圖與網格', ['a']],
      ['dev', '開發用', ['b']],
      [null, '其他網站', ['c']],
    ]);
  });

  it('正式版的分段涵蓋每一張卡片', () => {
    const list = homeEntries();
    expect(sections(list).flatMap((s) => s.entries)).toHaveLength(list.length);
  });
});

describe('matchEntry', () => {
  const e = entry({
    name: '狀態條產生器',
    summary: '把 CCFOLIA 角色的 HP 顯示在 OBS 上',
    group: 'G4',
  });

  it('空白分開的每個詞都要出現（名稱、說明或群組名稱）', () => {
    expect(matchEntry(e, '')).toBe(true);
    expect(matchEntry(e, '  ')).toBe(true);
    expect(matchEntry(e, '狀態')).toBe(true);
    expect(matchEntry(e, '狀態 hp')).toBe(true);
    expect(matchEntry(e, '狀態 立繪')).toBe(false);
    expect(matchEntry(e, '疊加')).toBe(true);
  });

  it('不分大小寫與全形、半形', () => {
    expect(matchEntry(e, 'ccfolia')).toBe(true);
    expect(matchEntry(e, 'ＯＢＳ')).toBe(true);
    expect(matchEntry(e, 'Hp')).toBe(true);
  });

  it('其他網站的工具可以用「其他網站」找到', () => {
    expect(matchEntry(entry({ group: null, kind: 'external' }), '其他網站')).toBe(true);
  });
});

describe('inspirations', () => {
  it('依工具順序，名稱相同的只列一次；原創工具不列', () => {
    const k = { name: 'くま。', url: 'https://example.com/k' };
    const list = [
      entry({ id: 'a', inspiration: k }),
      entry({ id: 'b' }),
      entry({ id: 'c', inspiration: { name: '出處不明' } }),
      entry({ id: 'd', inspiration: k }),
    ];
    expect(inspirations(list)).toEqual([k, { name: '出處不明' }]);
  });

  it('正式版列出每個已上線工具的靈感來源', () => {
    const names = inspirations(homeEntries()).map((i) => i.name);
    for (const t of live) if (t.inspiration) expect(names).toContain(t.inspiration.name);
  });
});
