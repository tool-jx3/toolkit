/**
 * @vitest-environment jsdom
 */
/* 分色文字欄（HighlightTextArea）：逐行上色、空行保持行高、插入文字（觸發 onChange）、捲動同步、疊在上面的子元素。 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HighlightTextArea, type HighlightTextAreaHandle } from '@/ui';

function Harness({
  initial,
  onValue,
  handle,
}: {
  initial: string;
  onValue?: (v: string) => void;
  handle?: React.Ref<HighlightTextAreaHandle>;
}) {
  const [v, setV] = useState(initial);
  const lines = v.split('\n').map((l) => ({
    className: l.startsWith('#') ? 'is-head' : undefined,
    content: l.includes('!') ? <span className="mark">{l}</span> : l,
  }));
  return (
    <HighlightTextArea
      ref={handle}
      value={v}
      lines={lines}
      aria-label="內文"
      onChange={(e) => {
        setV(e.target.value);
        onValue?.(e.target.value);
      }}
    >
      <div data-testid="overlay">選單</div>
    </HighlightTextArea>
  );
}

describe('HighlightTextArea', () => {
  it('逐行上色；空行補換行；上色層不給螢幕閱讀器', () => {
    const { container } = render(<Harness initial={'# 標題\n\n注意!'} />);
    const layer = container.querySelector('[data-highlight-layer]') as HTMLElement;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const rows = layer.querySelectorAll(':scope > [data-ln]');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass('is-head');
    expect(rows[1].innerHTML).toBe('<br>');
    expect(rows[2].querySelector('.mark')?.textContent).toBe('注意!');
    expect(screen.getByRole('textbox', { name: '內文' })).toHaveValue('# 標題\n\n注意!');
    expect(screen.getByTestId('overlay')).toBeInTheDocument();
  });

  it('insertText：換掉範圍、觸發 onChange、游標在插入的文字後面', () => {
    const handle = createRef<HighlightTextAreaHandle>();
    const onValue = vi.fn();
    render(<Harness initial="甲乙丙" onValue={onValue} handle={handle} />);
    handle.current?.insertText('XY', 1, 2);
    const ta = screen.getByRole('textbox', { name: '內文' }) as HTMLTextAreaElement;
    expect(ta.value).toBe('甲XY丙');
    expect(onValue).toHaveBeenLastCalledWith('甲XY丙');
    expect(ta.selectionStart).toBe(3);
    expect(document.activeElement).toBe(ta);
  });

  it('捲動同步；lineElement／scrollToLine 找得到該行', () => {
    const handle = createRef<HighlightTextAreaHandle>();
    const { container } = render(<Harness initial={'a\nb\nc'} handle={handle} />);
    const ta = screen.getByRole('textbox', { name: '內文' });
    const layer = container.querySelector('[data-highlight-layer]') as HTMLElement;
    ta.scrollTop = 40;
    fireEvent.scroll(ta);
    expect(layer.scrollTop).toBe(ta.scrollTop);
    expect(handle.current?.lineElement(2)?.textContent).toBe('c');
    expect(handle.current?.scrollToLine(1)?.textContent).toBe('b');
    expect(handle.current?.caretPoint(1)).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });
});
