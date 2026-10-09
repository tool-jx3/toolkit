// @vitest-environment jsdom
/**
 * OptionalNumberInput（coc-sheet 移植時新增）：可以留白的數字欄。
 * 清空＝null、空白時顯示 placeholder、空白時方向鍵從 fallback 開始、看不懂的字離開時還原、全形數字、夾範圍。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OptionalNumberInput, parseOptionalNumber } from '@/ui';

function Controlled({
  initial = null,
  onChange,
  fallback,
  placeholder,
}: {
  initial?: number | null;
  onChange?: (v: number | null) => void;
  fallback?: number | null;
  placeholder?: string;
}) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <OptionalNumberInput
      aria-label="值"
      value={v}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
      min={0}
      max={99}
      fallback={fallback}
      placeholder={placeholder}
    />
  );
}

describe('parseOptionalNumber', () => {
  it('空白、數字、全形、看不懂', () => {
    expect(parseOptionalNumber('')).toBe('');
    expect(parseOptionalNumber('  ')).toBe('');
    expect(parseOptionalNumber('12')).toBe(12);
    expect(parseOptionalNumber('４２')).toBe(42);
    expect(parseOptionalNumber('－５')).toBe(-5);
    expect(parseOptionalNumber('１，２００')).toBe(1200);
    expect(parseOptionalNumber('abc')).toBeNull();
  });
});

describe('OptionalNumberInput', () => {
  it('空白時顯示 placeholder，螢幕閱讀器念 placeholder', () => {
    render(<Controlled placeholder="12" />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '12');
    expect(input).toHaveAttribute('aria-valuetext', '12');
    expect(input).not.toHaveAttribute('aria-valuenow');
  });

  it('打字立刻套用；清空立刻變 null，離開後仍是空白', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={30} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.type(input, '４５');
    expect(onChange).toHaveBeenLastCalledWith(45);
    await user.clear(input);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('看不懂的字離開時還原；超出範圍夾回', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={30} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    await user.clear(input);
    await user.type(input, 'abc');
    fireEvent.blur(input);
    expect(input).toHaveValue('');
    await user.type(input, '150');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(99);
    expect(input).toHaveValue('99');
  });

  it('空白時 ↑ 從 fallback 開始；Shift＋↓ 減 10', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled fallback={12} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '值' });
    input.focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(13);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('沒有 fallback 時從 min 開始', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole('spinbutton', { name: '值' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
