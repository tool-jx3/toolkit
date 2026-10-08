// @vitest-environment jsdom
/**
 * coc-npc 對等驗證後的共用元件修正：
 * - NumberInput 接受全形數字與全形符號（NFKC）；小數照舊四捨五入到 step 的位數。
 * - TextOutputPanel 複製後全選時不捲動（焦點 preventScroll、還原輸出欄與外層的捲動位置）；selectAllInPlace 單獨也能用。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput, selectAllInPlace, TextOutputPanel, UiProvider } from '@/ui';

function Controlled({
  initial = 50,
  min = 0,
  max = 999,
  onChange,
}: {
  initial?: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <NumberInput
      aria-label="值"
      value={v}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
      min={min}
      max={max}
    />
  );
}

describe('NumberInput：全形數字與符號', () => {
  it('打字時就套用全形數字，離開欄位後顯示半形', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    await user.clear(input);
    await user.type(input, '６０');
    expect(onChange).toHaveBeenLastCalledWith(60);
    fireEvent.blur(input);
    expect(input).toHaveValue('60');
  });

  it('全形減號、全形逗號、全形小數點；小數四捨五入（12.5 → 13）', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled min={-100} max={9999} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    await user.clear(input);
    await user.type(input, '－５');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(-5);
    await user.clear(input);
    await user.type(input, '１，２００');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1200);
    await user.clear(input);
    await user.type(input, '１２．５');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(13);
    expect(input).toHaveValue('13');
  });

  it('看不懂的字照舊還原成原本的值', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={7} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    await user.clear(input);
    await user.type(input, 'ａｂｃ');
    fireEvent.blur(input);
    expect(input).toHaveValue('7');
  });
});

describe('TextOutputPanel：複製後全選但不捲動', () => {
  afterEach(() => vi.restoreAllMocks());

  it('焦點 preventScroll；select 造成的捲動（輸出欄、外層捲動區）都還原', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    /* 模擬瀏覽器：全選時把輸出欄與外層捲到最底 */
    vi.spyOn(HTMLTextAreaElement.prototype, 'select').mockImplementation(function (
      this: HTMLTextAreaElement,
    ) {
      this.setSelectionRange(0, this.value.length);
      this.scrollTop = 500;
      const box = this.closest<HTMLElement>('[data-testid="scroll-box"]');
      if (box) box.scrollTop = 700;
    });
    render(
      <UiProvider>
        <div data-testid="scroll-box">
          <TextOutputPanel text={'甲\n乙\n丙'} title="結果" />
        </div>
      </UiProvider>,
    );
    const box = screen.getByTestId('scroll-box');
    const area = screen.getByRole('textbox', { name: '結果' }) as HTMLTextAreaElement;
    box.scrollTop = 30;
    area.scrollTop = 4;
    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(writeText).toHaveBeenCalledWith('甲\n乙\n丙');
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(area);
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, area.value.length]);
    expect(area.scrollTop).toBe(4);
    expect(box.scrollTop).toBe(30);
  });

  it('selectAllInPlace 單獨使用（例：擲骰並複製之後）', () => {
    render(<textarea aria-label="輸出" defaultValue="abcdef" />);
    const area = screen.getByRole('textbox', { name: '輸出' }) as HTMLTextAreaElement;
    const focus = vi.spyOn(area, 'focus');
    selectAllInPlace(area);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(area);
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, 6]);
  });
});
