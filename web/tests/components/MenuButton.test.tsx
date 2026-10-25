// @vitest-environment jsdom
/**
 * MenuButton（scenario-editor 2026-10 新增的共用元件）：按下打開選單、說明與快捷鍵、停用的項目、選了之後關閉。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuButton } from '@/ui';

describe('MenuButton', () => {
  it('打開選單：項目、第二行說明、快捷鍵；選了就呼叫 onSelect 並關閉', async () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <MenuButton
        label="儲存"
        items={[
          { label: '存到瀏覽器', description: '加上名稱', onSelect: a },
          { label: '存成 JSON 檔', shortcut: 'mod+s', onSelect: b, 'data-testid': 'json' },
          { label: '停用', disabled: true, onSelect: vi.fn() },
        ]}
      />,
    );
    const btn = screen.getByRole('button', { name: '儲存' });
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    await userEvent.click(btn);
    const menu = screen.getByRole('menu', { name: '儲存' });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((x) => x.textContent)).toEqual([
      '存到瀏覽器加上名稱',
      '存成 JSON 檔Ctrl＋S',
      '停用',
    ]);
    expect(items[2].getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('json')).toBe(items[1]);
    expect(menu).toBeTruthy();
    await userEvent.click(items[1]);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('鍵盤：Enter 打開、↓ 移動、Enter 選取；停用的按鈕打不開', async () => {
    const a = vi.fn();
    render(
      <>
        <MenuButton
          label="選單"
          menuLabel="檔案的選單"
          items={[
            { label: '一', onSelect: vi.fn() },
            { label: '二', onSelect: a },
          ]}
        />
        <MenuButton label="停用" disabled items={[{ label: 'x', onSelect: vi.fn() }]} />
      </>,
    );
    screen.getByRole('button', { name: '選單' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: '檔案的選單' })).toBeTruthy();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(a).toHaveBeenCalledTimes(1);
    const off = screen.getByRole('button', { name: '停用' });
    expect((off as HTMLButtonElement).disabled).toBe(true);
  });
});
