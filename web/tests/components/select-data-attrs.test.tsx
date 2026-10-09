// @vitest-environment jsdom
/**
 * Select 把 data-* 屬性放到觸發按鈕上（floor-plan 對等驗證後新增）：工具可以用 `[data-focus="kind"]` 之類的選擇器
 * 找到下拉選單並聚焦。不給時觸發按鈕上沒有多的屬性（行為不變）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from '@/ui';

const options = [
  { value: 'a', label: '甲' },
  { value: 'b', label: '乙' },
];

describe('Select data-*', () => {
  it('data-* 落在觸發按鈕上，可以用選擇器找到並聚焦', () => {
    render(
      <Select
        aria-label="種類"
        value="a"
        onValueChange={() => {}}
        options={options}
        data-focus="kind"
        data-testid="kind-select"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: '種類' });
    expect(trigger.getAttribute('data-focus')).toBe('kind');
    expect(trigger.getAttribute('data-testid')).toBe('kind-select');
    const el = document.querySelector<HTMLElement>('[data-focus="kind"]');
    expect(el).toBe(trigger);
    el?.focus();
    expect(document.activeElement).toBe(trigger);
  });

  it('不給時觸發按鈕上沒有 data-focus', () => {
    render(<Select aria-label="種類" value="a" onValueChange={() => {}} options={options} />);
    const trigger = screen.getByRole('combobox', { name: '種類' });
    expect(trigger.hasAttribute('data-focus')).toBe(false);
    expect(trigger.getAttribute('aria-label')).toBe('種類');
  });
});
