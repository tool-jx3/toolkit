// @vitest-environment jsdom
/**
 * CopyDiagnostics：按下複製全文、按鈕暫時變「已複製」並通知螢幕閱讀器；瀏覽器不讓複製時打開對話框、選取全文。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyDiagnostics, UiProvider } from '@/ui';

const files = vi.hoisted(() => ({ copyText: vi.fn<(t: string) => Promise<boolean>>() }));

vi.mock('@/core/files', async (orig) => ({
  ...(await orig<typeof import('@/core/files')>()),
  copyText: files.copyText,
}));

afterEach(() => {
  files.copyText.mockReset();
});

const TEXT = '【立繪去背工具】錯誤資訊\n訊息：無法讀取：a.jpg';

describe('CopyDiagnostics', () => {
  it('複製成功：整段文字進剪貼簿，按鈕變「已複製」', async () => {
    files.copyText.mockResolvedValue(true);
    render(
      <UiProvider>
        <CopyDiagnostics text={TEXT} />
      </UiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '複製錯誤資訊' }));
    expect(files.copyText).toHaveBeenCalledWith(TEXT);
    expect(await screen.findByRole('button', { name: '已複製' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('已複製錯誤資訊');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('不能複製：打開對話框，文字全選讓使用者自己複製', async () => {
    files.copyText.mockResolvedValue(false);
    render(
      <UiProvider>
        <CopyDiagnostics text={TEXT} />
      </UiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '複製錯誤資訊' }));
    const dialog = await screen.findByRole('dialog', { name: '錯誤資訊' });
    const area = screen.getByRole('textbox', { name: '錯誤資訊' }) as HTMLTextAreaElement;
    expect(dialog.contains(area)).toBe(true);
    expect(area.value).toBe(TEXT);
    expect(area.readOnly).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(area));
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(TEXT.length);
  });
});
