// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ColorField, Field, UiProvider } from '@/ui';
import { parseHexInput } from '@/ui/ColorField';

function Controlled({
  alpha = false,
  onChange,
}: {
  alpha?: boolean;
  onChange?: (v: string) => void;
}) {
  const [v, setV] = useState(alpha ? '#ff000080' : '#336699');
  return (
    <UiProvider>
      <Field label="文字顏色">
        <ColorField
          value={v}
          onChange={(c) => {
            setV(c);
            onChange?.(c);
          }}
          alpha={alpha}
        />
      </Field>
      <output data-testid="value">{v}</output>
    </UiProvider>
  );
}

describe('ColorField', () => {
  it('色碼輸入：完整色碼即時套用，三碼與省略 # 在確定時補齊', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: '文字顏色' });
    expect(input).toHaveValue('#336699');
    await user.clear(input);
    await user.type(input, '#FF8800');
    expect(onChange).toHaveBeenLastCalledWith('#ff8800');
    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('#aabbcc');
  });

  it('看不懂的色碼標成無效，離開時還原', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: '文字顏色' });
    await user.clear(input);
    await user.type(input, 'zz');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('#336699');
  });

  it('透明度欄：改成 50% 得到 #rrggbb80', async () => {
    const user = userEvent.setup();
    render(<Controlled alpha />);
    const pct = screen.getByRole('spinbutton', { name: '不透明度' });
    expect(pct).toHaveValue('50');
    await user.clear(pct);
    await user.type(pct, '100');
    expect(screen.getByTestId('value')).toHaveTextContent('#ff0000');
  });

  it('色塊按鈕開啟調色盤（色相、飽和度與亮度、常用色）', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: /選擇顏色（目前 #336699）/ }));
    expect(await screen.findByRole('slider', { name: '色相' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '飽和度與亮度' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '套用 #ffffff' }));
    expect(screen.getByTestId('value')).toHaveTextContent('#ffffff');
  });

  it('parseHexInput', () => {
    expect(parseHexInput('fff', false)).toBe('#ffffff');
    expect(parseHexInput('#11223380', true)).toBe('#11223380');
    expect(parseHexInput('#11223380', false)).toBe('#112233');
    expect(parseHexInput('rgb(1,2,3)', false)).toBe('#010203');
    expect(parseHexInput('不是', false)).toBeNull();
  });
});
