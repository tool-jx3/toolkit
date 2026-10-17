// @vitest-environment jsdom
/**
 * LayoutCanvas 的選填擴充（社群貼文產生器移植時新增，向下相容）：
 * - children：疊在點選區與貼紙下面的工具自己的操作層（例如拖曳照片），點了不會取消選取貼紙；
 * - stickerGestures：滾輪縮放、Shift＋滾輪旋轉、兩指捏合（縮放＋旋轉）；不給時滾輪與第二指不做事。
 * - stickerClamp：放開時用工具自己的範圍代替 keepInside（社群貼文產生器的貼紙中心夾在 −10%～110%）；不給時照舊。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Placement } from '@/core/scene';
import { LayoutCanvas } from '@/ui';

const sticker = {
  id: 's1',
  label: '貼紙：星星',
  placement: { cx: 50, cy: 50, width: 40, height: 20, rotation: 0 },
};

/** jsdom 沒有版面：畫布 100 × 100 的內容剛好是 100 × 100 px */
function layout(root: HTMLElement) {
  root.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('LayoutCanvas：children', () => {
  it('放在根元素裡、點選區與貼紙下面；點了不會取消選取貼紙', () => {
    const onSelect = vi.fn();
    render(
      <LayoutCanvas
        width={100}
        height={100}
        stickers={[sticker]}
        selectedSticker="s1"
        onSelectSticker={onSelect}
      >
        <div data-testid="under" style={{ position: 'absolute', inset: 0 }} />
      </LayoutCanvas>,
    );
    const root = screen.getByTestId('layout-canvas');
    const under = screen.getByTestId('under');
    expect(root.firstElementChild).toBe(under);
    fireEvent.pointerDown(under, { button: 0, pointerId: 1 });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('LayoutCanvas：stickerGestures', () => {
  it('滾輪：以中心縮放 e^(−0.0015 × 滾動量)；Shift＋滾輪：每 1 單位轉 0.2°', () => {
    const onChange = vi.fn();
    render(
      <LayoutCanvas
        width={100}
        height={100}
        stickers={[sticker]}
        onStickerChange={onChange}
        stickerGestures
      />,
    );
    const el = document.querySelector('[data-sticker="s1"]') as HTMLElement;
    fireEvent.wheel(el, { deltaY: -100 });
    const k = Math.exp(0.15);
    expect(onChange).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({
        cx: 50,
        cy: 50,
        width: expect.closeTo(40 * k, 5),
        height: expect.closeTo(20 * k, 5),
      }),
      'nudge',
    );
    fireEvent.wheel(el, { deltaY: 50, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({ rotation: 10, width: 40 }),
      'nudge',
    );
  });

  it('不給 stickerGestures 時滾輪不做事', () => {
    const onChange = vi.fn();
    render(
      <LayoutCanvas width={100} height={100} stickers={[sticker]} onStickerChange={onChange} />,
    );
    fireEvent.wheel(document.querySelector('[data-sticker="s1"]') as HTMLElement, { deltaY: -100 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('兩指捏合：距離變兩倍＝大小兩倍、轉 90°；放開一指後剩下的那指接著拖曳；全部放開才 end', () => {
    const onChange = vi.fn();
    render(
      <LayoutCanvas
        width={100}
        height={100}
        stickers={[sticker]}
        onStickerChange={onChange}
        stickerGestures
      />,
    );
    layout(screen.getByTestId('layout-canvas'));
    const el = document.querySelector('[data-sticker="s1"]') as HTMLElement;
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 45, clientY: 50 });
    fireEvent.pointerDown(el, { button: 0, pointerId: 2, clientX: 55, clientY: 50 });
    expect(onChange.mock.calls.filter((c) => c[2] === 'start')).toHaveLength(1);
    /* 第二指移到正下方、距離 20（原本 10）：兩倍、轉 90° */
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 45, clientY: 70 });
    const last = onChange.mock.calls.at(-1);
    expect(last?.[2]).toBe('move');
    expect(last?.[1].width).toBeCloseTo(80);
    expect(last?.[1].height).toBeCloseTo(40);
    expect(last?.[1].rotation).toBeCloseTo(90);
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 45, clientY: 70 });
    expect(onChange.mock.calls.filter((c) => c[2] === 'end')).toHaveLength(0);
    /* 剩下的第一指往右拖 10 */
    const before = onChange.mock.calls.at(-1)?.[1];
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 55, clientY: 50 });
    const moved = onChange.mock.calls.at(-1)?.[1];
    expect(moved.cx - before.cx).toBeCloseTo(10);
    expect(moved.width).toBeCloseTo(80);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 55, clientY: 50 });
    expect(onChange.mock.calls.at(-1)?.[2]).toBe('end');
  });
});

describe('LayoutCanvas：stickerClamp', () => {
  const outside = {
    id: 's1',
    label: '貼紙：星星',
    placement: { cx: 50, cy: -40, width: 40, height: 20, rotation: 0 },
  };
  const release = (el: HTMLElement) => {
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 50, clientY: 0 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 0 });
  };

  it('不給時放開照舊拉回畫布裡（至少留 stickerMargin）', () => {
    const onChange = vi.fn();
    render(
      <LayoutCanvas width={100} height={100} stickers={[outside]} onStickerChange={onChange} />,
    );
    layout(screen.getByTestId('layout-canvas'));
    release(document.querySelector('[data-sticker="s1"]') as HTMLElement);
    const end = onChange.mock.calls.find((c) => c[2] === 'end');
    /* 下緣（cy ＋ 10）拉到 16 */
    expect(end?.[1].cy).toBeCloseTo(6);
  });

  it('給了就用它代替 keepInside（中心夾在 −10%～110%）', () => {
    const onChange = vi.fn();
    const clamp = vi.fn((p: Placement) => ({ ...p, cy: Math.max(-10, Math.min(110, p.cy)) }));
    render(
      <LayoutCanvas
        width={100}
        height={100}
        stickers={[outside]}
        onStickerChange={onChange}
        stickerClamp={clamp}
      />,
    );
    layout(screen.getByTestId('layout-canvas'));
    release(document.querySelector('[data-sticker="s1"]') as HTMLElement);
    const end = onChange.mock.calls.find((c) => c[2] === 'end');
    expect(end?.[1].cy).toBe(-10);
    expect(clamp).toHaveBeenCalledWith(outside.placement, expect.objectContaining({ id: 's1' }));
  });
});
