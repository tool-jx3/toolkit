// @vitest-environment jsdom
/**
 * GuidedTour（操作導覽，height-board 跟進原作 2026-10 更新時新增）：卡片的位置（placeTourCard）、
 * 步驟的切換（下一步、上一步、略過、Esc、完成）、焦點在主按鈕、「i／n」。
 * 驗證後修正：視窗大小改變後工具才換好版面時，照亮處跟著重新定位；關閉後焦點回到開啟前的元素（或 returnFocus）。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GuidedTour, placeTourCard, type TourStep } from '@/ui/GuidedTour';

const view = { width: 1280, height: 800 };
const card = { width: 320, height: 180 };

describe('placeTourCard', () => {
  it('寬畫面：右邊放得下就放右邊，垂直置中對齊照亮處', () => {
    const p = placeTourCard({ left: 100, top: 300, right: 200, bottom: 340 }, card, view, false);
    expect(p.side).toBe('right');
    expect(p.x).toBe(216);
    expect(p.y).toBe(320 - 90);
  });
  it('寬畫面：右邊放不下 → 下面；下面也不行 → 左邊', () => {
    const below = placeTourCard(
      { left: 1100, top: 100, right: 1270, bottom: 140 },
      card,
      view,
      false,
    );
    expect(below.side).toBe('bottom');
    expect(below.y).toBe(156);
    const left = placeTourCard(
      { left: 1000, top: 500, right: 1270, bottom: 780 },
      card,
      view,
      false,
    );
    expect(left.side).toBe('left');
    expect(left.x).toBe(1000 - 16 - 320);
  });
  it('寬畫面：哪裡都放不下 → 疊在照亮處裡面的右上角', () => {
    const p = placeTourCard({ left: 2, top: 2, right: 1278, bottom: 798 }, card, view, false);
    expect(p.side).toBe('inside');
    expect(p.x).toBe(1278 - 320 - 40);
    expect(p.y).toBe(42);
  });
  it('窄畫面：先上、再下；都放不下時貼著空間大的那一邊、夾在畫面裡', () => {
    const narrow = { width: 390, height: 844 };
    const top = placeTourCard({ left: 10, top: 400, right: 380, bottom: 450 }, card, narrow, true);
    expect(top.side).toBe('top');
    const bottom = placeTourCard({ left: 10, top: 40, right: 380, bottom: 80 }, card, narrow, true);
    expect(bottom.side).toBe('bottom');
    const squeezed = placeTourCard(
      { left: 10, top: 100, right: 380, bottom: 760 },
      card,
      narrow,
      true,
    );
    expect(squeezed.squeezed).toBe(true);
    expect(squeezed.side).toBe('top');
    expect(squeezed.y).toBe(14);
    expect(squeezed.x).toBe(35);
  });
});

const steps: TourStep[] = [
  { title: '第一步', body: '說明一', target: () => null },
  { title: '第二步', body: '說明二', target: () => ({ left: 10, top: 10, right: 50, bottom: 50 }) },
  { title: '第三步', body: '說明三', target: () => null },
];

function Harness({ onClose }: { onClose: (r: 'skip' | 'done') => void }) {
  const [step, setStep] = useState(0);
  return <GuidedTour open steps={steps} step={step} onStepChange={setStep} onClose={onClose} />;
}

describe('GuidedTour', () => {
  it('下一步、上一步、完成；焦點在主按鈕；i／n', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: '第一步' })).toBeTruthy();
    expect(screen.getByTestId('tour-count').textContent).toBe('1／3');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '下一步' }));
    expect(screen.queryByRole('button', { name: '上一步' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByTestId('tour-count').textContent).toBe('2／3');
    expect(screen.getByTestId('tour-spot')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    expect(screen.getByTestId('tour-count').textContent).toBe('1／3');
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onClose).toHaveBeenCalledWith('done');
  });

  it('略過、Esc＝skip；按鍵不傳到後面', () => {
    const onClose = vi.fn();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('button', { name: '下一步' }), { key: 'ArrowLeft' });
    expect(behind).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: '下一步' }), { key: 'Escape' });
    expect(onClose).toHaveBeenLastCalledWith('skip');
    fireEvent.click(screen.getByRole('button', { name: '略過' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    window.removeEventListener('keydown', behind);
  });

  it('關著時不顯示', () => {
    render(
      <GuidedTour open={false} steps={steps} step={0} onStepChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByTestId('guided-tour')).toBeNull();
  });
});

describe('GuidedTour：驗證後修正', () => {
  it('視窗大小改變之後版面才換好（媒體查詢）：接著的畫格再量一次，照亮處對準新位置', async () => {
    const root = document.documentElement;
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 1280 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 800 });
    const target = document.createElement('div');
    document.body.appendChild(target);
    let rect = { left: 100, top: 100, right: 200, bottom: 150 };
    target.getBoundingClientRect = () =>
      ({
        ...rect,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        toJSON: () => ({}),
      }) as DOMRect;
    try {
      render(
        <GuidedTour
          open
          steps={[{ title: '一', body: '說明', target: () => target }]}
          step={0}
          onStepChange={() => {}}
          onClose={() => {}}
        />,
      );
      const spot = () => screen.getByTestId('tour-spot');
      await waitFor(() => expect(spot().style.left).toBe('92px'));
      /* 等開啟時排的那一格過去 */
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      await act(async () => {
        await frame();
        await frame();
      });
      /* resize 事件當下版面還沒換；換好之後目標移到別處 */
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      rect = { left: 300, top: 400, right: 420, bottom: 460 };
      await waitFor(() => expect(spot().style.left).toBe('292px'));
      expect(spot().style.top).toBe('392px');
    } finally {
      target.remove();
      delete (root as unknown as Record<string, unknown>).clientWidth;
      delete (root as unknown as Record<string, unknown>).clientHeight;
    }
  });

  function FocusHarness({ fallback }: { fallback?: boolean }) {
    const [open, setOpen] = useState(false);
    const add = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          開始導覽
        </button>
        <button type="button" ref={add}>
          加入圖片
        </button>
        <GuidedTour
          open={open}
          steps={steps}
          step={0}
          onStepChange={() => {}}
          onClose={() => setOpen(false)}
          returnFocus={fallback ? () => add.current : undefined}
        />
      </>
    );
  }

  it('關閉後焦點回到開啟前的元素', () => {
    render(<FocusHarness fallback />);
    const start = screen.getByRole('button', { name: '開始導覽' });
    act(() => start.focus());
    fireEvent.click(start);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '略過' }));
    expect(screen.queryByTestId('guided-tour')).toBeNull();
    expect(document.activeElement).toBe(start);
  });

  it('開啟前焦點在 body（例如自動開始）：關閉後交給 returnFocus；沒給時留在 body', () => {
    const { unmount } = render(<FocusHarness fallback />);
    fireEvent.click(screen.getByRole('button', { name: '開始導覽' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '下一步' }), { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '加入圖片' }));
    unmount();
    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: '開始導覽' }));
    fireEvent.click(screen.getByRole('button', { name: '略過' }));
    expect(document.activeElement).toBe(document.body);
  });
});
