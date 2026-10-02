// @vitest-environment jsdom
/**
 * useSortable 的兩個選填擴充（character-editor 移植時新增，不給時行為不變）：
 * - 把手可以是 `<button data-drag-handle>`：從把手按鈕開始可以拖；列裡其他按鈕照舊不能開始拖。
 * - windowEdge：清單沒有可捲動的上層容器時，拖到視窗上下緣捲動整頁；不給時不捲。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSortable } from '@/ui';
import { WINDOW_SCROLL_MAX, windowScrollSpeed } from '@/ui/useSortable';

function List({
  onMove,
  windowEdge,
}: {
  onMove: (a: number, b: number) => void;
  windowEdge?: number;
}) {
  const sortable = useSortable({ count: 3, mode: 'drop', cancelOutside: true, windowEdge, onMove });
  return (
    <ul>
      {['甲', '乙', '丙'].map((name, i) => {
        const { ref, ...pointer } = sortable.rowProps(i);
        return (
          <li key={name} ref={ref} data-testid={`row-${i}`}>
            <button type="button" data-drag-handle aria-label={`把手${name}`} {...pointer} />
            <button type="button" aria-label={`刪除${name}`} {...pointer} />
          </li>
        );
      })}
    </ul>
  );
}

function layout() {
  for (let i = 0; i < 3; i++) {
    screen.getByTestId(`row-${i}`).getBoundingClientRect = () =>
      ({
        top: 500 + i * 40,
        bottom: 540 + i * 40,
        left: 0,
        right: 200,
        width: 200,
        height: 40,
        x: 0,
        y: 500 + i * 40,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}

let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const flush = () => {
  const list = frames;
  frames = [];
  for (const cb of list) cb(0);
};

describe('useSortable：button 把手', () => {
  it('從 button[data-drag-handle] 開始可以拖，放開時移動', () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    layout();
    const handle = screen.getByRole('button', { name: '把手甲' });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 520 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 530 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 590 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10, clientY: 590 });
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('列裡其他的按鈕照舊不能開始拖', () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    layout();
    const del = screen.getByRole('button', { name: '刪除甲' });
    fireEvent.pointerDown(del, { button: 0, pointerId: 1, clientX: 10, clientY: 520 });
    fireEvent.pointerMove(del, { pointerId: 1, clientX: 10, clientY: 590 });
    fireEvent.pointerUp(del, { pointerId: 1, clientX: 10, clientY: 590 });
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('useSortable：windowEdge', () => {
  const dragToBottomEdge = () => {
    const handle = screen.getByRole('button', { name: '把手甲' });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 520 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10, clientY: 595 });
    return handle;
  };

  it('拖到視窗下緣：每個畫面往下捲動整頁', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    render(<List onMove={vi.fn()} windowEdge={96} />);
    layout();
    const handle = dragToBottomEdge();
    flush();
    flush();
    expect(scrollBy).toHaveBeenCalledTimes(2);
    const [, dy] = scrollBy.mock.calls[0] as unknown as [number, number];
    expect(dy).toBeGreaterThan(0);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 10, clientY: 595 });
    flush();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it('不給 windowEdge 時不捲動整頁（行為不變）', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    render(<List onMove={vi.fn()} />);
    layout();
    dragToBottomEdge();
    flush();
    flush();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('速度：邊緣外 0，越靠近邊緣越快，最多 WINDOW_SCROLL_MAX', () => {
    expect(windowScrollSpeed(300, 600, 96)).toBe(0);
    expect(windowScrollSpeed(96, 600, 96)).toBe(0);
    expect(windowScrollSpeed(504, 600, 96)).toBe(0);
    expect(windowScrollSpeed(48, 600, 96)).toBe(-Math.ceil(WINDOW_SCROLL_MAX / 2));
    expect(windowScrollSpeed(0, 600, 96)).toBe(-WINDOW_SCROLL_MAX);
    expect(windowScrollSpeed(-50, 600, 96)).toBe(-WINDOW_SCROLL_MAX);
    expect(windowScrollSpeed(599, 600, 96)).toBeGreaterThan(0);
    expect(windowScrollSpeed(900, 600, 96)).toBe(WINDOW_SCROLL_MAX);
    expect(windowScrollSpeed(10, 600, 0)).toBe(0);
  });
});
