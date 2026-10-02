// @vitest-environment jsdom
/**
 * ExportPanel 的 resetKey（bg-motion 移植時新增）：值改變時清掉已完成的結果卡（下載作廢），進行中的匯出不受影響。
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { animationFormats, type ExportOutput, ExportPanel, UiProvider } from '@/ui';

const formats = animationFormats(['webp', 'apng']);
const output = (): ExportOutput => ({
  blob: new Blob([new Uint8Array(10)], { type: 'image/webp' }),
  fileName: '背景.webp',
  width: 64,
  height: 36,
  frames: 2,
  duration: 1,
});

function Panel({ k, onExport }: { k: unknown; onExport: () => Promise<ExportOutput> }) {
  return (
    <UiProvider>
      <ExportPanel formats={formats} onExport={onExport} resetKey={k} />
    </UiProvider>
  );
}

describe('ExportPanel resetKey', () => {
  it('改變時清掉結果卡；相同的值不清', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(async () => output());
    const { rerender } = render(<Panel k="a" onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: '匯出 WebP' }));
    expect(await screen.findByTestId('export-result')).toBeInTheDocument();
    rerender(<Panel k="a" onExport={onExport} />);
    expect(screen.getByTestId('export-result')).toBeInTheDocument();
    rerender(<Panel k="b" onExport={onExport} />);
    expect(screen.queryByTestId('export-result')).toBeNull();
  });

  it('進行中的匯出不受影響：完成後照樣顯示結果', async () => {
    const user = userEvent.setup();
    let finish: (o: ExportOutput) => void = () => {};
    const onExport = vi.fn(
      () =>
        new Promise<ExportOutput>((r) => {
          finish = r;
        }),
    );
    const { rerender } = render(<Panel k={1} onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: '匯出 WebP' }));
    rerender(<Panel k={2} onExport={onExport} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => finish(output()));
    expect(await screen.findByTestId('export-result')).toBeInTheDocument();
  });

  it('不給 resetKey 時行為不變', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(async () => output());
    const { rerender } = render(
      <UiProvider>
        <ExportPanel formats={formats} onExport={onExport} />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '匯出 WebP' }));
    expect(await screen.findByTestId('export-result')).toBeInTheDocument();
    rerender(
      <UiProvider>
        <ExportPanel formats={formats} onExport={onExport} title="再匯出" />
      </UiProvider>,
    );
    expect(screen.getByTestId('export-result')).toBeInTheDocument();
  });
});
