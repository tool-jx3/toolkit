// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Field, NumberInput, Slider } from '@/ui';

function Controlled({
  onChange,
  initial = 50,
}: {
  onChange?: (v: number) => void;
  initial?: number;
}) {
  const [v, setV] = useState(initial);
  return (
    <Field label="字級" hint="說明文字">
      <Slider
        value={v}
        onChange={(n) => {
          setV(n);
          onChange?.(n);
        }}
        min={0}
        max={100}
        step={5}
        unit="px"
      />
    </Field>
  );
}

describe('Slider', () => {
  it('滑桿與數字欄都用 Field 的標籤，滑桿帶單位文字', () => {
    render(<Controlled />);
    const thumb = screen.getByRole('slider', { name: '字級' });
    expect(thumb).toHaveAttribute('aria-valuetext', '50 px');
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    const input = screen.getByRole('spinbutton', { name: '字級' });
    expect(input).toHaveValue('50');
    expect(input).toHaveAccessibleDescription('說明文字');
    expect(screen.getByText('px')).toBeInTheDocument();
  });

  it('鍵盤操作滑桿：→ 加一個 step、Home 到最小值', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const thumb = screen.getByRole('slider', { name: '字級' });
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(55);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('數字欄：打字即時套用、↑ 加 step、Shift＋↑ 加 10 個 step', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '字級' });
    await user.clear(input);
    await user.type(input, '70');
    expect(onChange).toHaveBeenLastCalledWith(70);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '70');
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(75);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(onChange).toHaveBeenLastCalledWith(25);
  });

  it('數字欄：超出範圍在離開時夾回、Esc 還原', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '字級' });
    await user.clear(input);
    await user.type(input, '999');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(input).toHaveValue('100');
    await user.clear(input);
    await user.type(input, '12');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('12');
  });
});

describe('NumberInput', () => {
  it('全形數字與小數位', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NumberInput
        aria-label="透明度"
        value={0.5}
        onChange={onChange}
        min={0}
        max={1}
        step={0.01}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: '透明度' });
    await user.clear(input);
    await user.type(input, '0.256');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(0.26);
  });
});
