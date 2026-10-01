// @vitest-environment jsdom
/**
 * 立繪工作台（G3）共用元件：useChoice、ThumbnailList 的擴充、SortableList／LayerList、SelectableCardList、
 * Chips、PartPicker、LayoutEditor、CropFrame、WindowDrop、ImageSampler、PanZoomViewport、Stage 的擴充。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Chips,
  CropFrame,
  ImageSampler,
  LayerList,
  LayoutEditor,
  PanZoomViewport,
  PartPicker,
  SelectableCardList,
  SortableList,
  Stage,
  ThumbnailList,
  UiProvider,
  useChoice,
  WindowDrop,
} from '@/ui';

describe('useChoice', () => {
  function Probe({ onResult }: { onResult: (v: string | null) => void }) {
    const choose = useChoice();
    return (
      <button
        type="button"
        onClick={async () =>
          onResult(
            await choose({
              title: '匯入 3 個表情',
              choices: [
                { value: 'append', label: '加在後面' },
                { value: 'replace', label: '取代', variant: 'danger' },
              ],
            }),
          )
        }
      >
        問
      </button>
    );
  }

  it('回傳選到的值；取消回傳 null', async () => {
    const onResult = vi.fn();
    render(
      <UiProvider>
        <Probe onResult={onResult} />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '問' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(
      within(dlg)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['取消', '加在後面', '取代']);
    await act(async () => fireEvent.click(within(dlg).getByRole('button', { name: '取代' })));
    expect(onResult).toHaveBeenLastCalledWith('replace');
    fireEvent.click(screen.getByRole('button', { name: '問' }));
    await act(async () =>
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: '取消' }),
      ),
    );
    expect(onResult).toHaveBeenLastCalledWith(null);
  });
});

describe('ThumbnailList（選取、↑↓、自訂欄位、序號）', () => {
  function Harness({ onReorder }: { onReorder?: (a: number, b: number) => void }) {
    const [sel, setSel] = useState<string | null>('a');
    return (
      <ThumbnailList
        aria-label="差分"
        layout="list"
        numbered
        items={['a', 'b', 'c'].map((id) => ({ id, name: `${id}.png`, image: `blob:test/${id}` }))}
        selectedId={sel}
        onSelect={setSel}
        onReorder={onReorder}
        renderFields={(it, i) => (
          <input aria-label={`第 ${i + 1} 張的差分名`} defaultValue={it.id} />
        )}
      />
    );
  }

  it('↑↓ 切換選取（到頭到尾就停）；聚焦欄位就選取該列；名稱前有序號', () => {
    render(<Harness />);
    const list = screen.getByRole('list', { name: '差分' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(items[1]).toHaveTextContent('2. b.png');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(items[2]).toHaveAttribute('aria-current', 'true');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    fireEvent.focus(screen.getByRole('textbox', { name: '第 1 張的差分名' }));
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    /* 在欄位裡按 ↑↓ 不切換 */
    fireEvent.keyDown(screen.getByRole('textbox', { name: '第 1 張的差分名' }), {
      key: 'ArrowDown',
    });
    expect(items[0]).toHaveAttribute('aria-current', 'true');
  });

  it('不給新 props 時沒有選取、清單不能聚焦（向下相容）', () => {
    render(<ThumbnailList aria-label="舊" items={[{ id: 'x', name: 'x.png' }]} />);
    const list = screen.getByRole('list', { name: '舊' });
    expect(list).not.toHaveAttribute('tabindex');
    expect(within(list).getByRole('listitem')).not.toHaveAttribute('aria-current');
  });
});

describe('SortableList／LayerList', () => {
  const items = ['甲', '乙', '丙'];

  it('↑↓ 選取、Alt＋↓ 移動一格（包在 onMoveStart／onMoveEnd 裡）；篩選中不能移動', () => {
    const onMove = vi.fn();
    const onSelect = vi.fn();
    const onMoveStart = vi.fn();
    const onMoveEnd = vi.fn();
    const { rerender } = render(
      <SortableList
        aria-label="清單"
        items={items}
        getId={(s) => s}
        renderItem={(s) => <span>{s}</span>}
        selectedId="甲"
        onSelect={onSelect}
        onMove={onMove}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
      />,
    );
    const rows = within(screen.getByRole('list', { name: '清單' })).getAllByRole('listitem');
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('乙');
    fireEvent.keyDown(rows[0], { key: 'ArrowDown', altKey: true });
    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(onMoveStart).toHaveBeenCalledTimes(1);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
    rerender(
      <SortableList
        aria-label="清單"
        items={items}
        getId={(s) => s}
        renderItem={(s) => <span>{s}</span>}
        onMove={onMove}
        sortDisabled
      />,
    );
    fireEvent.keyDown(
      within(screen.getByRole('list', { name: '清單' })).getAllByRole('listitem')[1],
      {
        key: 'ArrowDown',
        altKey: true,
      },
    );
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('LayerList：顯示／隱藏、上移／下移按鈕（到頭停用）、列內數字欄、隱藏的列變淡', () => {
    const onVisibleChange = vi.fn();
    const onMove = vi.fn();
    const onNumber = vi.fn();
    render(
      <UiProvider>
        <LayerList
          aria-label="圖層"
          items={[
            { id: 'a', name: '艾莉絲', visible: true, value: 160 },
            { id: 'b', name: '鐵壁', visible: false, value: 188 },
          ]}
          onMove={onMove}
          onVisibleChange={onVisibleChange}
          moveButtons={{ up: '往前一層', down: '往後一層' }}
          number={{ label: '身高', unit: 'cm', min: 1, max: 1000, step: 0.1, onChange: onNumber }}
        />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '隱藏「艾莉絲」' }));
    expect(onVisibleChange).toHaveBeenCalledWith('a', false);
    fireEvent.click(screen.getByRole('button', { name: '顯示「鐵壁」' }));
    expect(onVisibleChange).toHaveBeenCalledWith('b', true);
    expect(screen.getByRole('button', { name: '往前一層：艾莉絲' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '往後一層：鐵壁' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '往後一層：艾莉絲' }));
    expect(onMove).toHaveBeenCalledWith(0, 1);
    const height = screen.getByRole('spinbutton', { name: '鐵壁的身高' });
    fireEvent.change(height, { target: { value: '170' } });
    expect(onNumber).toHaveBeenCalledWith('b', 170);
    expect(screen.getAllByRole('listitem')[1].className).toContain('opacity-55');
  });
});

describe('SelectableCardList', () => {
  it('勾選、編輯／複製／刪除、全選／全不選、刪除勾選的、無標籤、編輯中', () => {
    const fns = {
      onCheckedChange: vi.fn(),
      onEdit: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      onCheckAll: vi.fn(),
      onDeleteChecked: vi.fn(),
    };
    render(
      <UiProvider>
        <SelectableCardList
          title="表情清單"
          items={[
            { id: '1', title: '開心', summary: '笑眼 · 張口', checked: true },
            { id: '2', title: '  ', checked: false },
          ]}
          editingId="1"
          {...fns}
        />
      </UiProvider>,
    );
    expect(screen.getByRole('heading', { name: /表情清單/ })).toHaveTextContent('（2）');
    expect(screen.getByText('已勾選 1／共 2')).toBeInTheDocument();
    expect(screen.getByText('（編輯中）')).toBeInTheDocument();
    expect(screen.getByText('無標籤')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '勾選「無標籤」' }));
    expect(fns.onCheckedChange).toHaveBeenCalledWith('2', true);
    fireEvent.click(screen.getByRole('button', { name: '編輯「開心」' }));
    fireEvent.click(screen.getByRole('button', { name: '複製「開心」' }));
    fireEvent.click(screen.getByRole('button', { name: '刪除「無標籤」' }));
    expect([fns.onEdit, fns.onDuplicate, fns.onDelete].map((f) => f.mock.calls[0][0])).toEqual([
      '1',
      '1',
      '2',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '全選' }));
    fireEvent.click(screen.getByRole('button', { name: '全不選' }));
    expect(fns.onCheckAll.mock.calls).toEqual([[true], [false]]);
    fireEvent.click(screen.getByRole('button', { name: '刪除勾選的' }));
    expect(fns.onDeleteChecked).toHaveBeenCalled();
  });
});

describe('Chips 與 PartPicker', () => {
  it('Chips：點一下交出值；value 相同的按鈕是選取中', () => {
    const onPick = vi.fn();
    render(
      <Chips
        aria-label="建議"
        items={['笑', { value: 'angry', label: '生氣' }]}
        value="笑"
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生氣' }));
    expect(onPick).toHaveBeenCalledWith('angry');
    expect(screen.getByRole('button', { name: '笑' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('PartPicker：單選再點一次取消；複選有順序（新的放最後）；自訂部件可刪除', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    const opts = [
      { id: 'a', name: '圓眼', layer: null },
      { id: 'b', name: '我的眼睛', layer: null, custom: true },
    ];
    const { rerender } = render(
      <UiProvider>
        <PartPicker
          label="眼睛"
          mode="single"
          options={opts}
          value={['a']}
          onChange={onChange}
          onRemove={onRemove}
        />
      </UiProvider>,
    );
    expect(screen.getByText('單選')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '眼睛：圓眼' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: '眼睛：自訂 我的眼睛' }));
    expect(onChange).toHaveBeenLastCalledWith(['b']);
    fireEvent.click(screen.getByRole('button', { name: '刪除自訂部件「我的眼睛」' }));
    expect(onRemove).toHaveBeenCalledWith(opts[1]);
    rerender(
      <UiProvider>
        <PartPicker label="裝飾" mode="multiple" options={opts} value={['b']} onChange={onChange} />
      </UiProvider>,
    );
    expect(screen.getByText('複選')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '裝飾：圓眼' }));
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a']);
    fireEvent.click(screen.getByRole('button', { name: '裝飾：自訂 我的眼睛' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('LayoutEditor', () => {
  const items = [
    { id: 'img', label: '圖片', box: { x: 10, y: 10, width: 40, height: 40 } },
    {
      id: 'name',
      label: '名字牌',
      box: { x: 60, y: 10, width: 20, height: 50 },
      resizable: true,
      limits: { minWidth: 8, maxWidth: 80 },
      clamp: (b: { x: number; y: number; width: number; height: number }) => ({
        ...b,
        x: Math.min(b.x, 70),
      }),
    },
  ];

  it('按下即選取；拖曳（夾住位置）與控點改大小，依 start／move／end 回報', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <LayoutEditor
        width={100}
        height={100}
        items={items}
        selectedId={null}
        onSelect={onSelect}
        onChange={onChange}
      />,
    );
    const name = document.querySelector('[data-layout-item="name"]') as HTMLElement;
    fireEvent.pointerDown(name, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    expect(onSelect).toHaveBeenCalledWith('name');
    fireEvent.pointerMove(name, { pointerId: 1, clientX: 30, clientY: 5 });
    fireEvent.pointerUp(name, { pointerId: 1, clientX: 30, clientY: 5 });
    expect(onChange.mock.calls.map((c) => c[2].phase)).toEqual(['start', 'move', 'end']);
    expect(onChange.mock.calls[1][1]).toEqual({ x: 70, y: 15, width: 20, height: 50 });
    rerender(
      <LayoutEditor
        width={100}
        height={100}
        items={items}
        selectedId="name"
        onSelect={onSelect}
        onChange={onChange}
      />,
    );
    const handle = document.querySelector('[data-layout-handle="se"]') as HTMLElement;
    expect(handle).toHaveAccessibleName('調整「名字牌」大小（右下）');
    onChange.mockClear();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 100, clientY: 10 });
    expect(onChange.mock.calls[1][1]).toEqual({ x: 60, y: 10, width: 80, height: 60 });
    expect(onChange.mock.calls[1][2]).toEqual({ phase: 'move', op: 'resize' });
  });

  it('方向鍵微調（不夾住）、Shift 加大；Delete 取消選取；在文字欄裡不作用；Esc 呼叫 onEscape', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const onEscape = vi.fn();
    render(
      <>
        <input aria-label="文字" />
        <LayoutEditor
          width={100}
          height={100}
          items={items}
          selectedId="name"
          onSelect={onSelect}
          onChange={onChange}
          onEscape={onEscape}
          nudgeStep={0.2}
          nudgeShiftStep={2}
        />
      </>,
    );
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(
      'name',
      { x: 60.2, y: 10, width: 20, height: 50 },
      { phase: 'nudge', op: 'move' },
    );
    fireEvent.keyDown(document.body, { key: 'ArrowUp', shiftKey: true });
    expect(onChange.mock.calls[1][1]).toEqual({ x: 60, y: 8, width: 20, height: 50 });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '文字' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(onSelect).toHaveBeenCalledWith(null);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalled();
  });
});

describe('CropFrame', () => {
  it('只能水平移動、夾在圖內；方向鍵 1 px（Shift 10 px）；框比圖寬時固定在 0', () => {
    const onMove = vi.fn();
    const { rerender } = render(
      <CropFrame
        width={200}
        height={300}
        rect={{ x: 50, y: 20, width: 100, height: 120 }}
        onMove={onMove}
        label="可以左右拖曳"
      />,
    );
    const frame = screen.getByRole('slider', { name: '裁切框' });
    expect(frame).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('可以左右拖曳')).toBeInTheDocument();
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true });
    expect(onMove.mock.calls[1][0]).toEqual({ x: 60, y: 20, width: 100, height: 120 });
    fireEvent.keyDown(frame, { key: 'ArrowDown' });
    expect(onMove).toHaveBeenCalledTimes(3);
    onMove.mockClear();
    fireEvent.pointerDown(frame, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 500, clientY: 80 });
    expect(onMove.mock.calls[1][0]).toEqual({ x: 100, y: 20, width: 100, height: 120 });
    rerender(
      <CropFrame
        width={200}
        height={300}
        rect={{ x: 0, y: 0, width: 260, height: 300 }}
        onMove={onMove}
      />,
    );
    onMove.mockClear();
    fireEvent.keyDown(screen.getByRole('slider', { name: '裁切框' }), { key: 'ArrowRight' });
    expect(onMove.mock.calls[1][0].x).toBe(0);
  });
});

describe('WindowDrop', () => {
  const drag = (type: string, files: File[] = [], at = { clientX: 0, clientY: 0 }) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, at);
    Object.defineProperty(e, 'dataTransfer', {
      value: { types: ['Files'], files, dropEffect: 'none' },
    });
    act(() => {
      window.dispatchEvent(e);
    });
    return e;
  };

  it('拖進視窗出現覆蓋層；放開交出檔案與位置；不符合 accept 的交給 onReject', () => {
    const onDrop = vi.fn();
    const onReject = vi.fn();
    render(<WindowDrop accept="image/*" onDrop={onDrop} onReject={onReject} hint="PNG／WebP" />);
    expect(screen.queryByTestId('window-drop')).toBeNull();
    drag('dragenter');
    expect(screen.getByTestId('window-drop')).toHaveTextContent('放開即可加入');
    expect(drag('dragover').defaultPrevented).toBe(true);
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    const txt = new File(['x'], 'b.txt', { type: 'text/plain' });
    drag('drop', [png, txt], { clientX: 120, clientY: 80 });
    expect(screen.queryByTestId('window-drop')).toBeNull();
    expect(onDrop).toHaveBeenCalledWith([png], { clientX: 120, clientY: 80 });
    expect(onReject).toHaveBeenCalledWith([txt]);
  });
});

describe('ImageSampler', () => {
  it('分割線：↑↓ 移動（不越過相鄰的線、至少相隔 2%）；沒有圖片時顯示提示', () => {
    const onSplitsChange = vi.fn();
    const img = document.createElement('canvas');
    img.width = 100;
    img.height = 300;
    const { rerender } = render(
      <ImageSampler
        image={img}
        mode="splits"
        splits={[0.25, 0.27]}
        onSplitsChange={onSplitsChange}
        zoom={1}
        onZoomChange={() => {}}
        showZoom={false}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: '分割線 1' }), { key: 'ArrowDown' });
    expect(onSplitsChange.mock.calls[0][0][0]).toBeCloseTo(0.25);
    fireEvent.keyDown(screen.getByRole('slider', { name: '分割線 1' }), {
      key: 'ArrowUp',
      shiftKey: true,
    });
    expect(onSplitsChange.mock.calls[1][0][0]).toBeCloseTo(0.2);
    rerender(
      <ImageSampler image={null} mode="points" zoom={1} onZoomChange={() => {}} showZoom={false} />,
    );
    expect(screen.getByText('尚未選擇圖片。')).toBeInTheDocument();
  });
});

describe('PanZoomViewport', () => {
  it('滾輪縮放（夾在範圍內）；Ctrl＋滾輪不攔截；點空白處呼叫 onEmptyClick；點到物件交給拖曳處理', () => {
    const onZoomChange = vi.fn();
    const onEmptyClick = vi.fn();
    const onEnd = vi.fn();
    render(
      <PanZoomViewport
        world={{ x: 0, y: 0, width: 100, height: 100 }}
        baseScale={1}
        zoom={1}
        onZoomChange={onZoomChange}
        maxZoom={2}
        draw={() => {}}
        onPointerDown={(p) => (p.wx > 50 ? { onEnd } : undefined)}
        onEmptyClick={onEmptyClick}
      />,
    );
    const region = screen.getByRole('region', { name: '盤面' });
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    region.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(onZoomChange.mock.calls[0][0]).toBeCloseTo(1.16);
    const big = new WheelEvent('wheel', { deltaY: -2000, bubbles: true, cancelable: true });
    region.dispatchEvent(big);
    expect(onZoomChange.mock.calls[1][0]).toBe(2);
    const ctrl = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    region.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    const canvas = region.querySelector('canvas') as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onEmptyClick).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 80, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 80, clientY: 10 });
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ x: 80 }), false);
    expect(onEmptyClick).toHaveBeenCalledTimes(1);
  });
});

describe('Stage 的擴充（向下相容）', () => {
  it('wheelZoom="plain"＋zoomBase="fit"：不按 Ctrl 也縮放，倍率以符合畫面為 100%；dragPan 拖曳平移', () => {
    const onZoomChange = vi.fn();
    const onPanChange = vi.fn();
    render(
      <UiProvider>
        <Stage
          width={100}
          height={100}
          wheelZoom="plain"
          zoomBase="fit"
          zoomRange={[0.2, 5]}
          wheelFactors={[1.1, 0.9]}
          onZoomChange={onZoomChange}
          dragPan
          onPanChange={onPanChange}
        >
          <div />
        </Stage>
      </UiProvider>,
    );
    const region = screen.getByRole('region', { name: '預覽' });
    expect(region).toHaveAttribute('data-zoom', '100');
    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    region.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(onZoomChange).toHaveBeenLastCalledWith(0.9);
    fireEvent.pointerDown(region, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(region, { pointerId: 1, clientX: 12, clientY: -5 });
    expect(onPanChange).toHaveBeenLastCalledWith({ x: 12, y: -5 });
  });

  it('預設不攔截一般滾輪、不平移', () => {
    const onZoomChange = vi.fn();
    render(
      <UiProvider>
        <Stage width={100} height={100} onZoomChange={onZoomChange}>
          <div />
        </Stage>
      </UiProvider>,
    );
    const region = screen.getByRole('region', { name: '預覽' });
    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    region.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(onZoomChange).not.toHaveBeenCalled();
  });
  it('wheelLinear：Ctrl＋滾輪依滾動量加減（每 100 px ±50 個百分點）', () => {
    const onZoomChange = vi.fn();
    render(
      <UiProvider>
        <Stage width={100} height={100} zoom={1} onZoomChange={onZoomChange} wheelLinear={0.5}>
          <div />
        </Stage>
      </UiProvider>,
    );
    const region = screen.getByRole('region', { name: '預覽' });
    region.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(onZoomChange).toHaveBeenLastCalledWith(0.5);
    region.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(onZoomChange).toHaveBeenLastCalledWith(1.2);
  });
});
