// @vitest-environment jsdom
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 匯出對話框的 GIF／影片（F148e）：結果超過 5 MB 時的提醒只寫這個匯出區做得到的事（7.13）——
 * FPS 固定 20、沒有尺寸倍率與減色，所以不能叫人「降低 FPS、縮小尺寸或開啟減色」。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UiProvider } from '@/ui';

const run = vi.hoisted(() => ({ runAnimExport: vi.fn() }));
vi.mock('@/tools/relation-chart/editor/exportRun', async (orig) => ({
  ...(await orig<typeof import('@/tools/relation-chart/editor/exportRun')>()),
  runAnimExport: run.runAnimExport,
}));

const { AnimExport } = await import('@/tools/relation-chart/editor/dialogs/AnimExport');
const { buildSample } = await import('@/tools/relation-chart/logic/samples');
const { initialProject, normalizeSheet } = await import('@/tools/relation-chart/model/normalize');
const { useProject } = await import('@/tools/relation-chart/state/store');

describe('GIF／影片的結果卡', () => {
  it('超過 5 MB：提醒寫這裡做得到的事（縮短動畫、改匯出影片），不寫降低 FPS、縮小尺寸、減色', async () => {
    const s = normalizeSheet(buildSample('timeline'), 1);
    if (!s) throw new Error('範例讀不進來');
    useProject.getState().replace({ ...initialProject(), sheets: [s], nextId: 900 });
    run.runAnimExport.mockResolvedValue({
      blob: new Blob([new Uint8Array(6_000_000)], { type: 'image/gif' }),
      fileName: '範例：時間軸.gif',
      width: 960,
      height: 768,
      frames: 600,
      seconds: 30.95,
    });
    const user = userEvent.setup();
    render(
      <UiProvider>
        <AnimExport />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '匯出 GIF 動畫' }));
    const card = await screen.findByTestId('export-result');
    expect(card).toHaveTextContent('超過 5 MB');
    expect(card).toHaveTextContent('縮短動畫');
    expect(card.textContent).not.toMatch(/降低 FPS|減色|縮小尺寸/);
  });
});
