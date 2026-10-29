// @vitest-environment jsdom
/**
 * Chips 的 `values`（pl-profile 新增的複選）：清單裡的按鈕都是選取中；點一下照樣交出值。
 * 不給 values 時行為不變（單選的 value；都不給時沒有 aria-pressed）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Chips } from '@/ui';

describe('Chips values', () => {
  it('複選：values 裡的都是選取中，其他不是；點一下交出值', () => {
    const onPick = vi.fn();
    render(
      <Chips
        aria-label="風格"
        items={[
          { value: 'story', label: '劇情' },
          { value: 'rp', label: '角色扮演' },
          { value: 'battle', label: '戰鬥' },
        ]}
        values={['story', 'battle']}
        onPick={onPick}
      />,
    );
    expect(screen.getByRole('button', { name: '劇情' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '戰鬥' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '角色扮演' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: '角色扮演' }));
    expect(onPick).toHaveBeenCalledWith('rp');
  });

  it('空的 values：全部沒選取（仍有 aria-pressed）；不給 values 也不給 value：沒有 aria-pressed', () => {
    const { rerender } = render(
      <Chips aria-label="風格" items={['劇情', '戰鬥']} values={[]} onPick={() => undefined} />,
    );
    for (const b of screen.getAllByRole('button'))
      expect(b).toHaveAttribute('aria-pressed', 'false');
    rerender(<Chips aria-label="風格" items={['劇情', '戰鬥']} onPick={() => undefined} />);
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveAttribute('aria-pressed');
  });

  it('單選照舊：value 相同的是選取中（values 不給）', () => {
    render(
      <Chips aria-label="風格" items={['劇情', '戰鬥']} value="戰鬥" onPick={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: '戰鬥' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '劇情' })).toHaveAttribute('aria-pressed', 'false');
  });
});
