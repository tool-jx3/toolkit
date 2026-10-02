// @vitest-environment jsdom
/**
 * SortableList／useSortable 的 cancelOutside（color-palette 移植時新增）：drop 模式下拖到清單範圍外放開不移動；
 * 不給時行為不變（落在最近的列）。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableList } from '@/ui';

const items = ['甲', '乙', '丙'];

function setup(cancelOutside?: boolean) {
  const onMove = vi.fn();
  render(
    <SortableList
      aria-label="清單"
      items={items}
      getId={(s) => s}
      renderItem={(s) => <span>{s}</span>}
      mode="drop"
      cancelOutside={cancelOutside}
      onMove={onMove}
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
  return { onMove, rows };
}

function drag(row: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 50, clientY: 10 });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: 50, clientY: 30 });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: x, clientY: y });
}

describe('SortableList cancelOutside', () => {
  it('清單範圍內：放開時移到目標列，目標列醒目', () => {
    const { onMove, rows } = setup(true);
    drag(rows[0], 50, 50);
    expect(rows[2].getAttribute('data-over')).toBe('true');
    fireEvent.pointerUp(rows[0], { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('拖到清單下方或旁邊放開：沒有目標列、不移動', () => {
    const { onMove, rows } = setup(true);
    drag(rows[0], 50, 200);
    expect(rows.some((r) => r.hasAttribute('data-over'))).toBe(false);
    expect(rows[0].getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerUp(rows[0], { pointerId: 1, clientX: 50, clientY: 200 });
    drag(rows[0], 300, 50);
    fireEvent.pointerUp(rows[0], { pointerId: 1, clientX: 300, clientY: 50 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('不給時行為不變：拖到清單下方放開落在最後一列', () => {
    const { onMove, rows } = setup();
    drag(rows[0], 50, 200);
    fireEvent.pointerUp(rows[0], { pointerId: 1, clientX: 50, clientY: 200 });
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });
});
