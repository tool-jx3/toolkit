// @vitest-environment jsdom
/**
 * 播放列（Transport）的「回到開頭」：暫停並停在第一格（和「重播」＝回到 0 並播放不同），
 * 以及 `playbackShortcuts`（空白鍵＋Home）。
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  playbackShortcuts,
  ShortcutHelp,
  Transport,
  UiProvider,
  usePlayback,
  useShortcuts,
} from '@/ui';

const base = {
  time: 1.5,
  duration: 3,
  playing: true,
  onTimeChange: vi.fn(),
  onPlayingChange: vi.fn(),
};

const renderBar = (props: Partial<Parameters<typeof Transport>[0]> = {}) =>
  render(
    <UiProvider>
      <Transport {...base} {...props} />
    </UiProvider>,
  );

afterEach(() => vi.clearAllMocks());

describe('Transport：回到開頭', () => {
  it('按下：先暫停、再回到 0（停在第一格）；不會開始播放', async () => {
    const calls: string[] = [];
    renderBar({
      onPlayingChange: (p) => calls.push(`playing:${p}`),
      onTimeChange: (t) => calls.push(`time:${t}`),
    });
    await userEvent.click(screen.getByRole('button', { name: '回到開頭' }));
    expect(calls).toEqual(['playing:false', 'time:0']);
  });

  it('按鈕在「重播」左邊，名稱各自獨立（重播的名稱照舊）', () => {
    renderBar();
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons.slice(0, 3)).toEqual(['回到開頭', '重播', '暫停']);
  });

  it('工具自訂 onRestart 不影響「回到開頭」，「重播」仍呼叫 onRestart', async () => {
    const onRestart = vi.fn();
    renderBar({ onRestart });
    await userEvent.click(screen.getByRole('button', { name: '回到開頭' }));
    expect(onRestart).not.toHaveBeenCalled();
    expect(base.onPlayingChange).toHaveBeenCalledWith(false);
    expect(base.onTimeChange).toHaveBeenCalledWith(0);
    await userEvent.click(screen.getByRole('button', { name: '重播' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('預設的重播：回到 0 並播放', async () => {
    renderBar({ playing: false });
    await userEvent.click(screen.getByRole('button', { name: '重播' }));
    expect(base.onTimeChange).toHaveBeenCalledWith(0);
    expect(base.onPlayingChange).toHaveBeenLastCalledWith(true);
  });

  it('onRewind：工具自己決定回到哪裡，預設的暫停＋回 0 不再執行', async () => {
    const onRewind = vi.fn();
    renderBar({ onRewind });
    await userEvent.click(screen.getByRole('button', { name: '回到開頭' }));
    expect(onRewind).toHaveBeenCalledTimes(1);
    expect(base.onPlayingChange).not.toHaveBeenCalled();
    expect(base.onTimeChange).not.toHaveBeenCalled();
  });

  it('rewind={false}：沒有「回到開頭」按鈕，其他按鈕照舊', () => {
    renderBar({ rewind: false });
    expect(screen.queryByRole('button', { name: '回到開頭' })).toBeNull();
    expect(screen.getByRole('button', { name: '重播' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '暫停' })).toBeEnabled();
  });

  it('停用時跟著停用', () => {
    renderBar({ disabled: true });
    expect(screen.getByRole('button', { name: '回到開頭' })).toBeDisabled();
  });

  it('階段圖例對齊時間軸：有「回到開頭」比沒有多一個按鈕的寬度', () => {
    const segments = [{ id: 'a', label: '進場', start: 0, end: 3 }];
    const { rerender } = renderBar({ segments });
    expect(screen.getByRole('list', { name: '階段' }).className).toContain('pl-25.5');
    rerender(
      <UiProvider>
        <Transport {...base} segments={segments} rewind={false} />
      </UiProvider>,
    );
    expect(screen.getByRole('list', { name: '階段' }).className).toContain('pl-17');
  });

  it('時間軸有焦點時 Home 仍是到 0（不暫停），和按鈕不同', () => {
    renderBar();
    fireEvent.keyDown(screen.getByRole('slider', { name: '時間軸' }), { key: 'Home' });
    expect(base.onTimeChange).toHaveBeenCalledWith(0);
    expect(base.onPlayingChange).not.toHaveBeenCalled();
  });

  it('接 usePlayback：播放中按「回到開頭」→ 暫停、時間 0；再按播放從頭播', async () => {
    function Harness() {
      const playback = usePlayback({ duration: 3, autoPlay: true });
      return (
        <UiProvider>
          <Transport {...playback} />
        </UiProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: '暫停' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '回到開頭' }));
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument();
    expect(screen.getByTestId('transport-time')).toHaveTextContent('0.00／3.00 秒');
    expect(screen.getByRole('slider', { name: '時間軸' })).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('playbackShortcuts', () => {
  const Keys = ({ toggle, rewind }: { toggle?: () => void; rewind: () => void }) => {
    useShortcuts(playbackShortcuts({ toggle, rewind }));
    return (
      <div>
        <button type="button">一般按鈕</button>
        <input aria-label="名稱" />
      </div>
    );
  };

  it('回傳空白鍵（播放／暫停）與 Home（回到開頭），同一個「播放」分組', () => {
    const list = playbackShortcuts({ toggle: () => {}, rewind: () => {} });
    expect(list.map((s) => [s.keys, s.label, s.group])).toEqual([
      ['space', '播放／暫停', '播放'],
      ['home', '回到開頭', '播放'],
    ]);
    const custom = playbackShortcuts({
      toggle: () => {},
      rewind: () => {},
      group: '預覽',
      labels: { toggle: '播放／暫停預覽' },
    });
    expect(custom.map((s) => [s.label, s.group])).toEqual([
      ['播放／暫停預覽', '預覽'],
      ['回到開頭', '預覽'],
    ]);
  });

  it('Home 觸發回到開頭；在文字欄裡不攔截', async () => {
    const toggle = vi.fn();
    const rewind = vi.fn();
    render(<Keys toggle={toggle} rewind={rewind} />);
    await userEvent.keyboard('{Home}');
    expect(rewind).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(' ');
    expect(toggle).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByLabelText('名稱'));
    await userEvent.keyboard('abc{Home}');
    expect(rewind).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('名稱')).toHaveValue('abc');
  });

  it('焦點在按鈕上時 Home 照樣作用', async () => {
    const rewind = vi.fn();
    render(<Keys rewind={rewind} />);
    screen.getByRole('button', { name: '一般按鈕' }).focus();
    await userEvent.keyboard('{Home}');
    expect(rewind).toHaveBeenCalledTimes(1);
  });

  it('時間軸有焦點時 Home 由時間軸處理（只觸發一次）', () => {
    const rewind = vi.fn();
    const onTime = vi.fn();
    function Both() {
      useShortcuts(playbackShortcuts({ toggle: () => {}, rewind }));
      return (
        <UiProvider>
          <Transport {...base} onTimeChange={onTime} />
        </UiProvider>
      );
    }
    render(<Both />);
    const slider = screen.getByRole('slider', { name: '時間軸' });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onTime).toHaveBeenCalledWith(0);
    expect(rewind).not.toHaveBeenCalled();
  });

  it('不給 toggle：空白鍵只列在說明裡（沒有 handler），Home 照常', () => {
    const list = playbackShortcuts({ rewind: () => {} });
    expect(list[0].handler).toBeUndefined();
    expect(list[1].handler).toBeTypeOf('function');
  });

  it('快捷鍵表裡有「回到開頭」與 Home', () => {
    render(
      <UiProvider>
        <ShortcutHelp
          shortcuts={playbackShortcuts({ toggle: () => {}, rewind: () => {} })}
          open
          onOpenChange={() => {}}
        />
      </UiProvider>,
    );
    expect(screen.getByText('回到開頭')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('播放')).toBeInTheDocument();
  });
});

describe('usePlayback 配合回到開頭', () => {
  it('暫停再 onTimeChange(0)：時間 0、不在播放', () => {
    const { result } = renderHook(() => usePlayback({ duration: 3, autoPlay: false }));
    act(() => result.current.onTimeChange(2));
    expect(result.current.time).toBe(2);
    act(() => {
      result.current.onPlayingChange(false);
      result.current.onTimeChange(0);
    });
    expect(result.current.time).toBe(0);
    expect(result.current.playing).toBe(false);
  });
});
