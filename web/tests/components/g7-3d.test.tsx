// @vitest-environment jsdom
/**
 * G7 的 3D 共用元件（acrylic-goods 移植時新增）：
 * - DirectionPad：方向鍵移動（Shift ×4）、夾進單位圓、Home 回到預設、onCommit、朗讀文字、停用；
 * - Viewport3D：底色或棋盤格、處理中的遮罩（busyDelay 延後淡入）、疊加訊息、工具列與下方內容、
 *   沉浸模式（Esc 返回、頁面不捲動、放進頂層〔Popover API〕蓋住頁首，acrylic-goods F28）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { clampToDisk, DirectionPad, type PadVector, Viewport3D } from '@/ui';

function Pad({ onCommit }: { onCommit?: (v: PadVector) => void }) {
  const [v, setV] = useState<PadVector>({ x: 0.5, y: 0.5 });
  return (
    <DirectionPad
      aria-label="光源方向"
      value={v}
      onChange={setV}
      onCommit={onCommit}
      defaultValue={{ x: 0.5, y: 0.5 }}
    />
  );
}

describe('DirectionPad', () => {
  it('方向鍵移動 0.05（Shift 0.2）、上為負；Home 回到預設；每次都 commit', () => {
    const commit = vi.fn();
    render(<Pad onCommit={commit} />);
    const pad = screen.getByRole('slider', { name: '光源方向' });
    expect(pad).toHaveAttribute('aria-roledescription', '二維滑桿');
    fireEvent.keyDown(pad, { key: 'ArrowLeft' });
    expect(pad).toHaveAttribute('data-x', '0.45');
    fireEvent.keyDown(pad, { key: 'ArrowUp', shiftKey: true });
    expect(pad).toHaveAttribute('data-y', '0.3');
    expect(pad).toHaveAttribute('aria-valuetext', '左右 0.45、上下 0.30');
    fireEvent.keyDown(pad, { key: 'Home' });
    expect(pad).toHaveAttribute('data-x', '0.5');
    expect(commit).toHaveBeenCalledTimes(3);
    expect(commit).toHaveBeenLastCalledWith({ x: 0.5, y: 0.5 });
  });

  it('超出圓周時沿原方向拉回', () => {
    render(<Pad />);
    const pad = screen.getByRole('slider', { name: '光源方向' });
    for (let i = 0; i < 20; i++) fireEvent.keyDown(pad, { key: 'ArrowRight', shiftKey: true });
    const x = Number(pad.getAttribute('data-x'));
    const y = Number(pad.getAttribute('data-y'));
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0005);
    expect(clampToDisk({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(clampToDisk({ x: 0.1, y: 0.2 })).toEqual({ x: 0.1, y: 0.2 });
  });

  it('停用時鍵盤不作用、不能聚焦', () => {
    const onChange = vi.fn();
    render(<DirectionPad aria-label="方向" value={{ x: 0, y: 0 }} onChange={onChange} disabled />);
    const pad = screen.getByRole('slider', { name: '方向' });
    expect(pad).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(pad, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Viewport3D', () => {
  it('底色鋪在畫布後面；沒有底色時是棋盤格；畫布拿得到 ref 與屬性', () => {
    const ref = createRef<HTMLCanvasElement>();
    const { rerender } = render(
      <Viewport3D
        canvasRef={ref}
        background="#eef1f5"
        canvasLabel="立牌的 3D 畫面"
        canvasProps={{ tabIndex: 0, 'data-testid': 'gl' }}
        toolbar={<button type="button">重設鏡頭</button>}
        footer={<span>自動旋轉</span>}
      />,
    );
    expect(ref.current).toBe(screen.getByTestId('gl'));
    expect(screen.getByLabelText('立牌的 3D 畫面')).toBe(ref.current);
    const box = ref.current?.parentElement as HTMLElement;
    expect(box).toHaveAttribute('data-viewport-background', '#eef1f5');
    expect(box.style.backgroundColor).toBe('rgb(238, 241, 245)');
    expect(screen.getByRole('button', { name: '重設鏡頭' })).toBeInTheDocument();
    expect(screen.getByText('自動旋轉')).toBeInTheDocument();
    rerender(
      <Viewport3D
        canvasRef={ref}
        background={null}
        busy="匯出中…"
        overlay={<p>請先選一張正面圖。</p>}
      />,
    );
    expect(box).toHaveAttribute('data-viewport-background', 'transparent');
    expect(box.className).toContain('checker');
    expect(screen.getByTestId('viewport-busy')).toHaveTextContent('匯出中…');
    /* 不給 busyDelay：立刻顯示（沒有淡入動畫） */
    expect(screen.getByTestId('viewport-busy').style.animationDelay).toBe('');
    expect(screen.getByText('請先選一張正面圖。')).toBeInTheDocument();
  });

  it('busyDelay：遮罩延後淡入（很快就做完的處理不會閃一下）', () => {
    const ref = createRef<HTMLCanvasElement>();
    render(<Viewport3D canvasRef={ref} busy="產生壓克力立牌中…" busyDelay={100} />);
    const busy = screen.getByTestId('viewport-busy');
    expect(busy).toHaveTextContent('產生壓克力立牌中…');
    expect(busy).toHaveAttribute('role', 'status');
    expect(busy.style.animationDelay).toBe('100ms');
    expect(busy.className).toContain('tk-fade-in');
  });

  it('沉浸模式放進頂層（showPopover）：蓋住頁首等所有內容；返回時拿出來，畫布不重建', () => {
    const proto = HTMLElement.prototype as unknown as {
      showPopover?: () => void;
      hidePopover?: () => void;
    };
    const show = vi.fn();
    const hide = vi.fn();
    proto.showPopover = show;
    proto.hidePopover = hide;
    try {
      const ref = createRef<HTMLCanvasElement>();
      const { rerender, container } = render(
        <Viewport3D canvasRef={ref} onExitImmersive={() => {}} />,
      );
      const root = container.firstElementChild as HTMLElement;
      const canvas = ref.current;
      expect(show).not.toHaveBeenCalled();
      expect(root).not.toHaveAttribute('popover');
      rerender(<Viewport3D canvasRef={ref} immersive onExitImmersive={() => {}} />);
      expect(show).toHaveBeenCalledTimes(1);
      expect(show.mock.contexts[0]).toBe(root);
      expect(root).toHaveAttribute('popover', 'manual');
      /* 返回按鈕在畫布下方（不疊在畫布上）；jsdom 沒有頂層，popover 元素被當成隱藏 */
      const exit = screen.getByRole('button', { name: '回到編輯畫面', hidden: true });
      expect(exit.className).not.toContain('absolute');
      rerender(<Viewport3D canvasRef={ref} onExitImmersive={() => {}} />);
      expect(hide).toHaveBeenCalledTimes(1);
      expect(root).not.toHaveAttribute('popover');
      expect(ref.current).toBe(canvas);
    } finally {
      delete proto.showPopover;
      delete proto.hidePopover;
    }
  });

  it('沉浸模式：全螢幕、返回按鈕、Esc 返回、頁面不捲動，結束後恢復', () => {
    const exit = vi.fn();
    const ref = createRef<HTMLCanvasElement>();
    const { rerender, container } = render(
      <Viewport3D
        canvasRef={ref}
        immersive
        onExitImmersive={exit}
        exitLabel="回到編輯畫面"
        toolbar={<span>工具列</span>}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-immersive', 'true');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(screen.queryByText('工具列')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '回到編輯畫面' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(exit).toHaveBeenCalledTimes(2);
    const canvas = ref.current;
    rerender(<Viewport3D canvasRef={ref} onExitImmersive={exit} toolbar={<span>工具列</span>} />);
    expect(document.documentElement.style.overflow).toBe('');
    /* 畫布元素沒有重建（WebGL 不會重新初始化） */
    expect(ref.current).toBe(canvas);
    expect(screen.getByText('工具列')).toBeInTheDocument();
  });
});
