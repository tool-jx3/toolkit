// @vitest-environment jsdom
/**
 * useSortable：拖曳開始後在 window 聽 pointerup／pointercancel（bg-motion 對等驗證 F115、F136 後修正）。
 * React 在 DOM 裡移動被拖的列時，瀏覽器會放掉指標捕捉，pointerup 落在別的元素，列上收不到；
 * 沒有 window 的監聽，拖曳（和 live 模式的 onMoveStart／onMoveEnd 手勢）就一直沒有結束。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableList } from '@/ui';

const items = ['甲', '乙', '丙'];

function setup(mode: 'live' | 'drop', cancelOutside = false) {
  const onMove = vi.fn();
  const onMoveStart = vi.fn();
  const onMoveEnd = vi.fn();
  render(
    <SortableList
      aria-label="清單"
      items={items}
      getId={(s) => s}
      renderItem={(s) => <span>{s}</span>}
      mode={mode}
      cancelOutside={cancelOutside}
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
    />,
  );
  const rows = within(screen.getByRole('list', { name: '清單' })).getAllByRole('listitem');
  /* jsdom 沒有版面：每列 100 × 20，由上往下排 */
  rows.forEach((row, i) => {
    row.getBoundingClientRect = () =>
      ({
        top: i * 20,
        bottom: i * 20 + 20,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
        x: 0,
        y: i * 20,
        toJSON: () => ({}),
      }) as DOMRect;
  });
  return { onMove, onMoveStart, onMoveEnd, rows };
}

const startDrag = (row: HTMLElement, y: number) => {
  fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 50, clientY: 10 });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: 50, clientY: 30 });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: 50, clientY: y });
};

describe('拖曳在清單外（window）放開', () => {
  it('live：放開的不是被拖的列（指標捕捉已經掉了）也結束手勢', () => {
    const { onMove, onMoveStart, onMoveEnd, rows } = setup('live');
    startDrag(rows[0], 50);
    expect(onMoveStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalled();
    expect(onMoveEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400, clientY: 400 });
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
    /* 結束之後滑鼠移過列不再排序 */
    const calls = onMove.mock.calls.length;
    fireEvent.pointerMove(rows[1], { pointerId: 1, clientX: 50, clientY: 25 });
    fireEvent.pointerMove(rows[0], { pointerId: 1, clientX: 50, clientY: 5 });
    expect(onMove.mock.calls.length).toBe(calls);
    expect(rows.some((r) => r.hasAttribute('data-dragging'))).toBe(false);
  });

  it('live：在列上放開時只結束一次（列的 pointerup 與 window 的不重複）', () => {
    const { onMoveEnd, rows } = setup('live');
    startDrag(rows[0], 50);
    fireEvent.pointerUp(rows[0], { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('live：pointercancel 也結束', () => {
    const { onMoveEnd, rows } = setup('live');
    startDrag(rows[0], 50);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('live：別的指標（pointerId 不同）放開不算', () => {
    const { onMoveEnd, rows } = setup('live');
    startDrag(rows[0], 50);
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onMoveEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('drop：在清單外放開（沒有 cancelOutside）落在最近的列並移動；有 cancelOutside 不移動，但拖曳結束', () => {
    const a = setup('drop');
    startDrag(a.rows[0], 50);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 200 });
    expect(a.onMove).toHaveBeenCalledWith(0, 2);
    expect(a.onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it('drop＋cancelOutside：放在清單外不移動、拖曳結束；pointercancel 不移動', () => {
    const a = setup('drop', true);
    startDrag(a.rows[0], 50);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 300, clientY: 50 });
    expect(a.onMove).not.toHaveBeenCalled();
    expect(a.rows.some((r) => r.hasAttribute('data-dragging'))).toBe(false);
  });

  it('drop：pointercancel 不移動', () => {
    const a = setup('drop');
    startDrag(a.rows[0], 50);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(a.onMove).not.toHaveBeenCalled();
    expect(a.rows.some((r) => r.hasAttribute('data-dragging'))).toBe(false);
  });

  it('沒有開始拖（移動不到門檻）時 window 的 pointerup 不影響點一下', () => {
    const { onMoveEnd, rows } = setup('live');
    fireEvent.pointerDown(rows[0], { button: 0, pointerId: 1, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(rows[0], { pointerId: 1, clientX: 51, clientY: 11 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onMoveEnd).not.toHaveBeenCalled();
  });
});
