// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  animationFormats,
  type ExportContext,
  ExportPanel,
  type ExportSettings,
  UiProvider,
} from '@/ui';

const formats = animationFormats(['apng', 'gif', 'webp', 'png', 'zip']);

function setup(onExport = vi.fn(), defaults: Partial<ExportSettings> = {}) {
  render(
    <UiProvider>
      <ExportPanel
        formats={formats}
        onExport={onExport}
        baseSize={{ width: 480, height: 270 }}
        defaultSettings={defaults}
      />
    </UiProvider>,
  );
  return onExport;
}

describe('ExportPanel', () => {
  it('列出格式；GIF 的 FPS 上限為 50', async () => {
    const user = userEvent.setup();
    setup(vi.fn(), { fps: 60 });
    expect(screen.getByRole('radio', { name: 'APNG' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'FPS' })).toHaveTextContent('60 fps');
    await user.click(screen.getByRole('radio', { name: 'GIF' }));
    expect(screen.getByRole('combobox', { name: 'FPS' })).toHaveTextContent('50 fps');
    expect(screen.getByText('GIF 最多 50')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '減色（256 色）' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'PNG' }));
    expect(screen.queryByRole('combobox', { name: 'FPS' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '尺寸' })).toHaveTextContent('100%（480×270）');
  });

  it('匯出：傳入設定、顯示進度、完成後顯示結果卡與 5 MB 提醒', async () => {
    const user = userEvent.setup();
    let ctx: ExportContext | null = null;
    let finish: (v: unknown) => void = () => {};
    const onExport = setup(
      vi.fn((_s: ExportSettings, c: ExportContext) => {
        ctx = c;
        return new Promise((r) => {
          finish = r;
        });
      }),
    );
    await user.click(screen.getByRole('switch', { name: '無限循環' }));
    await user.click(screen.getByRole('switch', { name: '減色（256 色）' }));
    await user.click(screen.getByRole('button', { name: '匯出 APNG' }));
    expect(onExport).toHaveBeenCalledWith(
      { format: 'apng', fps: 30, plays: 1, scale: 1, quantize: true },
      expect.anything(),
    );
    act(() => ctx!.onProgress(0.4, '產生影格 12／30'));
    expect(screen.getByRole('progressbar', { name: '產生影格 12／30' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    await act(async () => {
      finish({
        blob: new Blob([new Uint8Array(6_000_000)], { type: 'image/png' }),
        fileName: '骰子判定.png',
        width: 480,
        height: 270,
        frames: 30,
        storedFrames: 24,
        duration: 1,
      });
    });
    const card = await screen.findByTestId('export-result');
    expect(within(card).getByText('骰子判定.png')).toBeInTheDocument();
    expect(within(card).getByText('5.7 MB')).toBeInTheDocument();
    expect(within(card).getByText('480×270 px')).toBeInTheDocument();
    expect(within(card).getByText(/30 格（合併後 24 格）・1.00 秒/)).toBeInTheDocument();
    expect(within(card).getByText(/超過 5 MB/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '下載' })).toHaveAttribute(
      'download',
      '骰子判定.png',
    );
    expect(within(card).getByRole('img', { name: '匯出結果預覽' })).toBeInTheDocument();
  });

  it('取消：中止訊號、回到可以匯出的狀態', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | null = null;
    setup(
      vi.fn((_s: ExportSettings, c: ExportContext) => {
        signal = c.signal;
        return new Promise((_r, reject) =>
          c.signal.addEventListener('abort', () =>
            reject(new DOMException('已取消', 'AbortError')),
          ),
        );
      }),
    );
    await user.click(screen.getByRole('button', { name: '匯出 APNG' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(signal!.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: '匯出 APNG' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('失敗時顯示錯誤；不支援 WebP 時停用並說明原因', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <ExportPanel
          formats={animationFormats(['apng', 'webp'], { webpSupported: false })}
          onExport={() => Promise.reject(new Error('記憶體不足'))}
        />
      </UiProvider>,
    );
    expect(screen.getByRole('radio', { name: 'WebP' })).toBeDisabled();
    /* 目前選的是 APNG，停用的 WebP 的原因也看得到（typewriter 規格 7.1，F70） */
    expect(screen.getByRole('radio', { name: 'APNG' })).toHaveAttribute('aria-checked', 'true');
    const group = screen.getByRole('radiogroup', { name: '格式' });
    expect(group).toHaveAccessibleDescription(/全彩、半透明都保留/);
    expect(group).toHaveAccessibleDescription(/這個瀏覽器無法匯出 WebP/);
    await user.click(screen.getByRole('button', { name: '匯出 APNG' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('匯出失敗：記憶體不足');
  });

  it('所有停用格式的原因都列出來；原因沒提到格式名稱時加上名稱；沒有停用時說明不變', async () => {
    const user = userEvent.setup();
    const base = animationFormats(['apng', 'gif', 'png']);
    const { container, rerender } = render(
      <UiProvider>
        <ExportPanel
          formats={base.map((f) =>
            f.id === 'gif' ? { ...f, disabled: true, disabledReason: '需要先關閉半透明。' } : f,
          )}
          onExport={vi.fn()}
        />
      </UiProvider>,
    );
    const notes = () =>
      [...container.querySelectorAll('[data-disabled-format]')].map((n) => n.textContent);
    expect(notes()).toEqual(['GIF：需要先關閉半透明。']);
    expect(screen.getByRole('radiogroup', { name: '格式' })).toHaveAccessibleDescription(
      /全彩、半透明都保留.*GIF：需要先關閉半透明。/,
    );
    /* 換到 PNG：GIF 的原因仍在，說明換成 PNG 的 */
    await user.click(screen.getByRole('radio', { name: 'PNG' }));
    expect(screen.getByRole('radiogroup', { name: '格式' })).toHaveAccessibleDescription(
      /單張靜態圖.*GIF：需要先關閉半透明。/,
    );
    rerender(
      <UiProvider>
        <ExportPanel formats={base} onExport={vi.fn()} />
      </UiProvider>,
    );
    /* 沒有停用的格式：說明只有選中格式（仍是 PNG）的那一段 */
    expect(notes()).toEqual([]);
    expect(screen.getByRole('radiogroup', { name: '格式' })).toHaveAccessibleDescription(
      '單張靜態圖（取代表畫面）。',
    );
  });
});
