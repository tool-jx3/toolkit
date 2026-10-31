// @vitest-environment jsdom
/**
 * LyricStyleControls 的 context（lyric-fx 規格 3.8）：避開區域是工具層的共用設定、不在風格的設定裡，
 * 控制項的 disabled／when 從 context 拿到它；region 控制項由呼叫端畫（沒有 renderRegion 時不顯示）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scatterStyle } from '@/core/lyricfx';
import { LyricStyleControls } from '@/ui/LyricStyleControls';

const position = scatterStyle.controls.filter((s) => s.id === 'position');
const settings = scatterStyle.defaults() as unknown as Record<string, unknown>;

describe('LyricStyleControls 的 context', () => {
  it('沒有避開區域：出現範圍可以改；有避開區域：停用並說明', () => {
    const { rerender } = render(
      <LyricStyleControls
        sections={position}
        settings={settings}
        onChange={() => {}}
        openSections={1}
        renderRegion={() => <span data-testid="region-slot">框選</span>}
      />,
    );
    expect(screen.getByTestId('region-slot')).toBeInTheDocument();
    for (const el of screen.getAllByRole('spinbutton')) expect(el).not.toBeDisabled();
    rerender(
      <LyricStyleControls
        sections={position}
        settings={settings}
        onChange={() => {}}
        openSections={1}
        renderRegion={() => <span data-testid="region-slot">框選</span>}
        context={{ region: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 } }}
      />,
    );
    for (const el of screen.getAllByRole('spinbutton')) expect(el).toBeDisabled();
    expect(screen.getByText('有避開區域時不使用出現範圍，改用整個畫面。')).toBeInTheDocument();
  });

  it('沒有 renderRegion 時不顯示避開區域的控制項', () => {
    render(
      <LyricStyleControls
        sections={position}
        settings={settings}
        onChange={() => {}}
        openSections={1}
      />,
    );
    expect(screen.queryByText('避開區域')).toBeNull();
  });
});
