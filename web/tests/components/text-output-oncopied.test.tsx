// @vitest-environment jsdom
/**
 * TextOutputPanel 的 onCopied（discord-color 移植時新增）：每次按「複製」寫完剪貼簿之後呼叫（ok＝成功）；
 * 沒有內容時不呼叫；不給時行為不變。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextOutputPanel, UiProvider } from '@/ui';

function setClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('TextOutputPanel：onCopied', () => {
  afterEach(() => vi.restoreAllMocks());

  it('成功時呼叫 onCopied(true)，提示用當下的 messages.copied', async () => {
    const user = userEvent.setup();
    setClipboard(() => Promise.resolve());
    const onCopied = vi.fn();
    render(
      <UiProvider>
        <TextOutputPanel text="abc" messages={{ copied: '雙重複製！' }} onCopied={onCopied} />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(true));
    expect((await screen.findAllByText('雙重複製！')).length).toBeGreaterThan(0);
  });

  it('剪貼簿不能用時呼叫 onCopied(false)；沒有內容時不呼叫', async () => {
    const user = userEvent.setup();
    setClipboard(() => Promise.reject(new Error('denied')));
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    const onCopied = vi.fn();
    const { rerender } = render(
      <UiProvider>
        <TextOutputPanel text="abc" onCopied={onCopied} />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(false));
    rerender(
      <UiProvider>
        <TextOutputPanel text="" onCopied={onCopied} />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(onCopied).toHaveBeenCalledTimes(1);
  });
});
