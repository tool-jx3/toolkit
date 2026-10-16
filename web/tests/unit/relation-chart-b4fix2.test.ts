/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第四批複驗後的修正（規格 7.11）：
 * - F190d：便利貼設定的兩個字級欄位照原作換算（原作 openNotePanel 的 parseInt、GS_NUMS 的 defStickySize 最小 6）。
 */
import { describe, expect, it } from 'vitest';
import { noteSizeInput, stickyDefaultInput } from '@/tools/relation-chart/model/notes';

describe('F190d 便利貼的字級欄位（7.11）', () => {
  it('「字級 px」：小於 1＝留空（跟隨）；照原作捨去成整數；最多 200', () => {
    expect(noteSizeInput(null)).toBeNull();
    for (const v of [0, 0.5, 0.9, 0.99, -3]) expect(noteSizeInput(v)).toBeNull();
    expect(noteSizeInput(1)).toBe(1);
    expect(noteSizeInput(1.5)).toBe(1);
    expect(noteSizeInput(2.7)).toBe(2);
    expect(noteSizeInput(22)).toBe(22);
    expect(noteSizeInput(450)).toBe(200);
  });

  it('「本分頁預設字級」：小於 1＝0（自動）；1～5.x＝6（原作最小 6）；取到 0.1；最多 200', () => {
    expect(stickyDefaultInput(null)).toBe(0);
    for (const v of [0, 0.5, 0.99, -3]) expect(stickyDefaultInput(v)).toBe(0);
    for (const v of [1, 3, 5.9]) expect(stickyDefaultInput(v)).toBe(6);
    expect(stickyDefaultInput(6)).toBe(6);
    expect(stickyDefaultInput(12.5)).toBe(12.5);
    expect(stickyDefaultInput(12.34)).toBe(12.3);
    expect(stickyDefaultInput(18)).toBe(18);
    expect(stickyDefaultInput(300)).toBe(200);
  });
});
