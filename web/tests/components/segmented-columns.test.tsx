// @vitest-environment jsdom
/**
 * Segmented 的 `columns`（npc-names 2026-10 新增）：排成固定欄數的格子、每格一樣寬；不給時版面和以前一樣（向下相容）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from '@/ui';

const OPTIONS = ['日本', '台灣', '韓國', '英國', '美國', '俄羅斯', '北歐', '奇幻'].map((v) => ({
  value: v,
  label: v,
}));

describe('Segmented columns', () => {
  it('給 columns：格子、每格撐滿；方向鍵與點選照舊', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="地區"
        value="日本"
        onValueChange={onChange}
        options={OPTIONS}
        columns={4}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: '地區' });
    expect(group.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(group.className.split(/\s+/)).toEqual(expect.arrayContaining(['grid', 'w-full']));
    expect(group.className).not.toMatch(/inline-flex|flex-wrap/);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(8);
    for (const r of radios) expect(r.className.split(/\s+/)).toContain('w-full');
    fireEvent.click(screen.getByRole('radio', { name: '北歐' }));
    expect(onChange).toHaveBeenCalledWith('北歐');
  });

  it('不給 columns：和以前一樣（一行、fullWidth 時換行）', () => {
    render(
      <Segmented
        aria-label="性別"
        value="男"
        onValueChange={() => {}}
        options={OPTIONS.slice(0, 3)}
        fullWidth
      />,
    );
    const group = screen.getByRole('radiogroup', { name: '性別' });
    expect(group.style.gridTemplateColumns).toBe('');
    expect(group.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['inline-flex', 'flex', 'w-full', 'flex-wrap']),
    );
    for (const r of screen.getAllByRole('radio')) expect(r.className).toContain('flex-[1_0_auto]');
  });
});
