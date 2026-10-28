// @vitest-environment jsdom
/**
 * SortableList／useSortable 的 longPress（height-board 跟進原作 2026-10 更新時新增）：
 * 觸控時在列上（不是把手）按住不動到時間就開始拖；之前手指移動 8 px 以上＝捲動清單（不拖、不選）；
 * 沒移動就放開＝點一下（選取）；長按中不跳出瀏覽器的長按選單。不給時行為不變（觸控只能從把手拖）。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_SLOP, SortableList } from '@/ui';

const items = ['甲', '乙', '丙'];

function setup(longPress?: number) {
  const onMove = vi.fn();
  const onSelect = vi.fn();
  const onMoveStart = vi.fn();
  const onMoveEnd = vi.fn();
  render(
    <SortableList
      aria-label="清單"
      items={items}
      getId={(s) => s}
      renderItem={(s) => <span data-testid={`name-${s}`}>{s}</span>}
      longPress={longPress}
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      onSelect={onSelect}
    />,
  );
  const rows = within(screen.getByRole('list', { name: '清單' })).getAllByRole('listitem');
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
  return { onMove, onSelect, onMoveStart, onMoveEnd, rows };
}

const touch = { pointerId: 7, pointerType: 'touch', button: 0 };

describe('SortableList longPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按住 400 ms 不動 → 開始拖，往下移到第 3 列 → 排序；一次手勢', () => {
    const { onMove, onMoveStart, onMoveEnd, onSelect } = setup(400);
    const el = screen.getByTestId('name-甲');
    fireEvent.pointerDown(el, { ...touch, clientX: 50, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(onMoveStart).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onMoveStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(el, { ...touch, clientX: 50, clientY: 30 });
    fireEvent.pointerMove(el, { ...touch, clientX: 50, clientY: 55 });
    fireEvent.pointerUp(el, { ...touch, clientX: 50, clientY: 55 });
    expect(onMove).toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('長按之前手指移動（捲動清單）：不拖、不選', () => {
    const { onMove, onMoveStart, onSelect } = setup(400);
    const el = screen.getByTestId('name-甲');
    fireEvent.pointerDown(el, { ...touch, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(el, { ...touch, clientX: 50, clientY: 10 + LONG_PRESS_SLOP });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onMoveStart).not.toHaveBeenCalled();
    /* 瀏覽器接手捲動時送 pointercancel */
    fireEvent.pointerCancel(el, { ...touch });
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('按一下就放開：選取', () => {
    const { onMoveStart, onSelect } = setup(400);
    const el = screen.getByTestId('name-乙');
    fireEvent.pointerDown(el, { ...touch, clientX: 50, clientY: 30 });
    fireEvent.pointerUp(el, { ...touch, clientX: 50, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSelect).toHaveBeenCalledWith('乙');
    expect(onMoveStart).not.toHaveBeenCalled();
  });

  it('長按中不跳出長按選單', () => {
    setup(400);
    const el = screen.getByTestId('name-甲');
    fireEvent.pointerDown(el, { ...touch, clientX: 50, clientY: 10 });
    expect(fireEvent.contextMenu(el)).toBe(false);
  });

  it('不給 longPress：觸控按住多久都不拖（只能從把手），行為不變', () => {
    const { onMoveStart, onMove } = setup();
    const el = screen.getByTestId('name-甲');
    fireEvent.pointerDown(el, { ...touch, clientX: 50, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerMove(el, { ...touch, clientX: 50, clientY: 55 });
    expect(onMoveStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(el)).toBe(true);
  });
});
