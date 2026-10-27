/**
 * 團期行事曆（session-calendar）的 PNG 版面：圖窄（每格比手機寬度的格子還窄）時，單日場次不寫開始時間，
 * 跟畫面一樣把位置留給標題。
 */
import { describe, expect, it } from 'vitest';
import type { SceneNode } from '@/core/scene';
import { customPalette } from '@/tools/session-calendar/look';
import { type CalData, initialData, newEntry } from '@/tools/session-calendar/model';
import { CHIP_TIME_MIN_COL, monthShotLayout } from '@/tools/session-calendar/shot';

function texts(nodes: readonly SceneNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === 'text') out.push(n.text);
    if (n.kind === 'group') out.push(...texts(n.children));
  }
  return out;
}

function dataWith(shotWidth: number): CalData {
  const base = initialData('2026-10-27');
  return {
    ...base,
    shotWidth,
    entries: [newEntry('session', '2026-10-14', { title: '霧港燈塔', startTime: '19:30' })],
  };
}

describe('月曆 PNG 的單日場次', () => {
  const ym = { year: 2026, month: 10 };

  it('寬的圖寫開始時間', () => {
    const data = dataWith(1200);
    const all = texts(monthShotLayout(data, ym, customPalette(data.look)).nodes);
    expect(all).toContain('19:30 霧港燈塔');
  });

  it('窄的圖（每格不到 CHIP_TIME_MIN_COL）只寫標題', () => {
    const data = dataWith(600);
    expect((600 - 32) / 7).toBeLessThan(CHIP_TIME_MIN_COL);
    const all = texts(monthShotLayout(data, ym, customPalette(data.look)).nodes);
    expect(all).toContain('霧港燈塔');
    expect(all.some((t) => t.includes('19:30'))).toBe(false);
  });
});
