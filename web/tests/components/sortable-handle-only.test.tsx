// @vitest-environment jsdom
/**
 * SortableList／useSortable 的 handleOnly（acrylic-goods 對等驗證後新增，F24）：滑鼠也只能從拖曳把手開始拖，
 * 從列上其他地方（縮圖、名稱）按住拖不會排序、放開算點一下；從把手按下時不讓瀏覽器開始選取文字或拖放選取範圍。
 * 不給時行為不變（滑鼠可以從列上任何不是輸入欄、按鈕的地方開始拖）。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableList } from '@/ui';

const items = ['甲', '乙', '丙'];

function setup(handleOnly?: boolean) {
  const onMove = vi.fn();
  const onSelect = vi.fn();
  render(
    <SortableList
      aria-label="清單"
      items={items}
      getId={(s) => s}
      renderItem={(s) => (
        <div>
          <span data-drag-handle data-testid={`handle-${s}`}>
            ☰
          </span>
          <span data-testid={`name-${s}`}>{s}</span>
        </div>
      )}
      handleOnly={handleOnly}
      onMove={onMove}
      onSelect={onSelect}
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
  return { onMove, onSelect, rows };
}

/** 從 el 按下、往下拖到第 3 列放開；回傳 pointerdown 有沒有被取消預設動作 */
function drag(el: HTMLElement) {
  const notCancelled = fireEvent.pointerDown(el, {
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 50,
    clientY: 10,
  });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 30 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 55 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 55 });
  return notCancelled;
}

describe('SortableList handleOnly', () => {
  it('從名稱（把手以外）拖：不排序，放開算點一下', () => {
    const { onMove, onSelect } = setup(true);
    drag(screen.getByTestId('name-甲'));
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('甲');
  });

  it('從把手拖：照常排序；按下時取消預設動作（不開始選取文字、不拖放選取範圍）', () => {
    const { onMove, onSelect } = setup(true);
    expect(drag(screen.getByTestId('handle-甲'))).toBe(false);
    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('不給 handleOnly：行為不變（從名稱也能拖，按下不取消預設動作）', () => {
    const { onMove } = setup();
    expect(drag(screen.getByTestId('name-甲'))).toBe(true);
    expect(onMove).toHaveBeenCalledWith(0, 2);
    onMove.mockClear();
    expect(drag(screen.getByTestId('handle-乙'))).toBe(true);
    expect(onMove).toHaveBeenCalled();
  });
});
