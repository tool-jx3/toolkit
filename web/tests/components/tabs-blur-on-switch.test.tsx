// @vitest-environment jsdom
/**
 * Tabs：用滑鼠點別的分頁時，先讓分頁內容裡有焦點的輸入欄失去焦點（onBlur 在內容被卸載之前跑完）；
 * 鍵盤切換、點目前的分頁、焦點不在輸入欄時行為不變（pl-profile 驗證後修正，2026-10）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/ui';
import { blurFieldBeforeTabSwitch } from '@/ui/Tabs';

function Harness({ onBlur }: { onBlur: () => void }) {
  const [tab, setTab] = useState('a');
  return (
    <Tabs
      aria-label="分頁"
      value={tab}
      onValueChange={setTab}
      items={[
        {
          value: 'a',
          label: '第一頁',
          content: (
            <>
              <input aria-label="名字" onBlur={onBlur} />
              <textarea aria-label="備註" onBlur={onBlur} />
              <button type="button">按鈕</button>
            </>
          ),
        },
        { value: 'b', label: '第二頁', content: <p>第二頁的內容</p> },
      ]}
    />
  );
}

describe('Tabs：切換前先讓輸入欄失去焦點', () => {
  it('打字中用滑鼠點別的分頁：onBlur 有被呼叫，而且在內容換掉之前', () => {
    const order: string[] = [];
    const onBlur = vi.fn(() => {
      order.push(
        screen.queryByRole('textbox', { name: '名字' }) ? 'blur（欄位還在）' : 'blur（欄位不在）',
      );
    });
    render(<Harness onBlur={onBlur} />);
    const input = screen.getByRole('textbox', { name: '名字' });
    input.focus();
    fireEvent.change(input, { target: { value: '阿明' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '第二頁' }), { button: 0 });
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['blur（欄位還在）']);
    expect(screen.getByText('第二頁的內容')).toBeInTheDocument();
  });

  it('textarea 也一樣；焦點在按鈕或分頁列裡時不動它', () => {
    const onBlur = vi.fn();
    render(<Harness onBlur={onBlur} />);
    screen.getByRole('textbox', { name: '備註' }).focus();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '第二頁' }), { button: 0 });
    expect(onBlur).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole('tab', { name: '第一頁' }), { button: 0 });
    const btn = screen.getByRole('button', { name: '按鈕' });
    btn.focus();
    blurFieldBeforeTabSwitch(screen.getByRole('tab', { name: '第二頁' }));
    expect(document.activeElement).toBe(btn);
    const first = screen.getByRole('tab', { name: '第一頁' });
    first.focus();
    blurFieldBeforeTabSwitch(screen.getByRole('tab', { name: '第二頁' }));
    expect(document.activeElement).toBe(first);
  });

  it('右鍵、Ctrl＋點：不動焦點', () => {
    const onBlur = vi.fn();
    render(<Harness onBlur={onBlur} />);
    const input = screen.getByRole('textbox', { name: '名字' });
    input.focus();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '第二頁' }), { button: 2 });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '第二頁' }), { button: 0, ctrlKey: true });
    expect(onBlur).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
});
