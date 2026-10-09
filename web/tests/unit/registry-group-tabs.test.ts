/**
 * 群組分頁要列的工具（registry 的 groupTabTools）：正式網站上已上線的頁面不列重寫中的工具。
 */
import { describe, expect, it } from 'vitest';
import { GROUPS, type GroupId, groupTabTools, TOOLS, toolsInGroup } from '@/registry';

describe('groupTabTools', () => {
  const groups = Object.keys(GROUPS) as GroupId[];

  it('已上線的頁面只列同群組已上線的工具（依 registry 的順序）', () => {
    for (const g of groups) {
      const live = toolsInGroup(g).filter((t) => t.status === 'live');
      for (const t of live)
        expect(groupTabTools(t).map((x) => x.id)).toEqual(live.map((x) => x.id));
    }
  });

  it('重寫中的頁面與開發伺服器列出整組（含自己）', () => {
    for (const t of TOOLS) {
      const all = toolsInGroup(t.group).map((x) => x.id);
      expect(groupTabTools(t, true).map((x) => x.id)).toEqual(all);
      if (t.status !== 'live') {
        expect(groupTabTools(t).map((x) => x.id)).toEqual(all);
        expect(groupTabTools(t).some((x) => x.id === t.id)).toBe(true);
      }
    }
  });

  it('同群組裡有重寫中的工具時，已上線的頁面看不到它', () => {
    const mixed = TOOLS.find(
      (t) => t.status === 'live' && toolsInGroup(t.group).some((x) => x.status !== 'live'),
    );
    if (!mixed) return;
    expect(groupTabTools(mixed).every((x) => x.status === 'live')).toBe(true);
  });
});
