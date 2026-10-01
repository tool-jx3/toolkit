// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FontValue } from '@/core/fonts';
import { Field, FontPicker, UiProvider } from '@/ui';
import { availableWeights } from '@/ui/FontPicker';

function Controlled({
  initial,
  onChange,
}: {
  initial?: FontValue;
  onChange?: (v: FontValue) => void;
}) {
  const [v, setV] = useState<FontValue>(
    initial ?? { source: 'google', family: 'Noto Sans TC', weight: 700 },
  );
  return (
    <UiProvider>
      <Field label="字型">
        <FontPicker
          value={v}
          onChange={(n) => {
            setV(n);
            onChange?.(n);
          }}
        />
      </Field>
    </UiProvider>
  );
}

describe('FontPicker', () => {
  it('按鈕顯示目前字型，字重選單列出可用字重', () => {
    render(<Controlled />);
    expect(screen.getByRole('button', { name: /字型.*思源黑體/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '字重' })).toHaveTextContent('700 粗');
  });

  it('Google 字型：搜尋、選擇後字重換成最接近的可用值', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /字型.*思源黑體/ }));
    const dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    const group = within(dialog).getByRole('radiogroup', { name: 'Google 字型' });
    expect(within(group).getAllByRole('radio').length).toBeGreaterThanOrEqual(30);
    await user.type(within(dialog).getByRole('textbox', { name: '搜尋字型' }), 'wenkai');
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
      'LXGW WenKai TC',
      'LXGW WenKai Mono TC',
    ]);
    await user.click(radios[0]);
    expect(onChange).toHaveBeenLastCalledWith({
      source: 'google',
      family: 'LXGW WenKai TC',
      weight: 700,
    });
    await user.click(within(dialog).getByRole('button', { name: '完成' }));
    expect(screen.getByRole('button', { name: /字型.*霞鶩文楷 TC/ })).toBeInTheDocument();
  });

  it('單一字重的字型：字重選單停用', async () => {
    render(<Controlled initial={{ source: 'google', family: 'Huninn', weight: 400 }} />);
    expect(screen.getByRole('combobox', { name: '字重' })).toBeDisabled();
  });

  it('電腦字型：不支援列出清單時可以手動輸入', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /字型/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: '電腦字型' }));
    expect(within(dialog).getByText(/無法列出電腦上的字型/)).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole('textbox', { name: '手動輸入字型名稱' }),
      '微軟正黑體',
    );
    await user.click(within(dialog).getByRole('button', { name: '套用' }));
    expect(onChange).toHaveBeenLastCalledWith({
      source: 'local',
      family: '微軟正黑體',
      weight: 700,
    });
    expect(within(dialog).getByRole('status')).toBeInTheDocument();
  });

  it('availableWeights', () => {
    expect(availableWeights({ source: 'google', family: 'LXGW WenKai TC' })).toEqual([
      300, 400, 700,
    ]);
    expect(availableWeights({ source: 'local', family: '任何字型' })).toHaveLength(9);
  });
});
