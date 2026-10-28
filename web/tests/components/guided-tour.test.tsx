// @vitest-environment jsdom
/**
 * GuidedTour（操作導覽，height-board 跟進原作 2026-10 更新時新增）：卡片的位置（placeTourCard）、
 * 步驟的切換（下一步、上一步、略過、Esc、完成）、焦點在主按鈕、「i／n」。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GuidedTour, placeTourCard, type TourStep } from '@/ui';

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
