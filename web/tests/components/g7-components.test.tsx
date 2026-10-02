// @vitest-environment jsdom
/**
 * G7 共用元件：
 * - RichTextField：DOM ↔ 格式化文字（區塊與 <br> 的換行、粗體、顏色）、位置換算、外部的值改了就重寫畫面、
 *   粗體按鈕套用到記下的選取範圍、超過字數上限時不接受；
 * - LayoutCanvas：點選區按鈕（名稱、點了呼叫 onPick、空白處取消選取）、貼紙（選取、Delete 刪除、方向鍵移動、Esc 取消選取）、
 *   取色控制器（pick → finish 回傳色碼、cancel 回傳 null）；
 * - ImageFrameDialog 的純計算（框、蓋滿／放入、以一點縮放、旋轉 90°）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { docText, plainDoc, type RichDoc } from '@/core/richtext';
import {
  createCanvasPicker,
  domToOffset,
  fitTransform,
  frameIn,
  LayoutCanvas,
  offsetToDom,
  RichTextField,
  readRichDom,
  turnAt,
  UiProvider,
  writeRichDom,
  zoomAt,
} from '@/ui';

describe('RichTextField 的 DOM 換算', () => {
  it('讀：div／p 之間換行、<br> 換行、只有 <br> 的 div 是空行；粗體與顏色', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '甲<div><b>乙</b><span style="color: rgb(255, 0, 0)">丙</span></div><div><br></div><div>丁<br>戊</div>';
    const d = readRichDom(root, '#363636');
    expect(docText(d)).toBe('甲\n乙丙\n\n丁\n戊');
    expect(d.lines[1].runs).toEqual([
      { text: '乙', bold: true, color: '#363636' },
      { text: '丙', bold: false, color: '#ff0000' },
    ]);
  });

  it('寫：每行一個 div、每段一個 span、空行放 <br>；讀回來相同', () => {
    const doc: RichDoc = {
      lines: [
        { runs: [{ text: '甲', bold: true, color: '#112233' }] },
        { runs: [] },
        { runs: [{ text: '乙', bold: false, color: '#363636' }] },
      ],
    };
    const root = document.createElement('div');
    writeRichDom(root, doc);
    expect(root.children.length).toBe(3);
    expect(root.children[1].innerHTML).toBe('<br>');
    expect(readRichDom(root, '#363636')).toEqual(doc);
  });

  it('位置換算：全文位置 ↔ DOM 位置（換行算一個字）', () => {
    const root = document.createElement('div');
    writeRichDom(root, plainDoc('甲乙\n\n丙'));
    for (const at of [0, 1, 2, 3, 4, 5]) {
      const p = offsetToDom(root, at);
      expect(domToOffset(root, p.node, p.offset)).toBe(at);
    }
  });
});

function RichHarness({ initial, max = 1000 }: { initial: string; max?: number }) {
  const [doc, setDoc] = useState<RichDoc>(plainDoc(initial));
  return (
    <UiProvider>
      <RichTextField aria-label="本文" value={doc} onChange={setDoc} maxLength={max} />
      <button type="button" onClick={() => setDoc(plainDoc('外部改的'))}>
        外部
      </button>
      <output data-testid="out">{docText(doc)}</output>
    </UiProvider>
  );
}

describe('RichTextField', () => {
  it('顯示目前的值；外部的值改了就重寫畫面', () => {
    render(<RichHarness initial={'第一行\n第二行'} />);
    const box = screen.getByRole('textbox', { name: '本文' });
    expect(box.querySelectorAll(':scope > div').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '外部' }));
    expect(box.textContent).toBe('外部改的');
  });

  it('輸入：讀回畫面；超過上限時不接受並顯示說明', () => {
    render(<RichHarness initial="甲" max={3} />);
    const box = screen.getByRole('textbox', { name: '本文' });
    (box.firstChild as HTMLElement).textContent = '甲乙';
    fireEvent.input(box);
    expect(screen.getByTestId('out').textContent).toBe('甲乙');
    (box.firstChild as HTMLElement).textContent = '甲乙丙丁';
    fireEvent.input(box);
    expect(screen.getByTestId('out').textContent).toBe('甲乙');
    expect(box.textContent).toBe('甲乙');
    expect(screen.getByText('最多可以輸入 3 字。')).toBeTruthy();
  });

  it('粗體：套用到選取範圍（改資料、不用 execCommand）', () => {
    render(<RichHarness initial="甲乙丙" />);
    const box = screen.getByRole('textbox', { name: '本文' });
    const text = box.querySelector('span')?.firstChild as Text;
    const r = document.createRange();
    r.setStart(text, 1);
    r.setEnd(text, 2);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.click(screen.getByRole('button', { name: '粗體' }));
    const spans = [...box.querySelectorAll('span')];
    expect(spans.map((s) => [s.textContent, s.style.fontWeight])).toEqual([
      ['甲', '400'],
      ['乙', '700'],
      ['丙', '400'],
    ]);
  });
});

describe('LayoutCanvas', () => {
  const regions = [
    { key: 'bg', label: '背景', box: { x: 0, y: 0, width: 100, height: 100 } },
    { key: 'left/name', label: '左邊的角色：名字', box: { x: 10, y: 10, width: 40, height: 20 } },
  ];
  const sticker = {
    id: 's1',
    label: '貼紙：星星',
    placement: { cx: 50, cy: 50, width: 20, height: 20, rotation: 0 },
  };

  it('點選區：按鈕的名稱、點了呼叫 onPick 並取消選取貼紙', () => {
    const onPick = vi.fn();
    const onSelect = vi.fn();
    render(
      <LayoutCanvas
        width={100}
        height={100}
        regions={regions}
        onPick={onPick}
        onSelectSticker={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '左邊的角色：名字' }));
    expect(onPick).toHaveBeenCalledWith('left/name', regions[1]);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('貼紙：選取中按 Delete 刪除、方向鍵移動（Shift 10 px）、Esc 取消選取', () => {
    const onDelete = vi.fn();
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <LayoutCanvas
        width={100}
        height={100}
        stickers={[sticker]}
        selectedSticker="s1"
        onSelectSticker={onSelect}
        onStickerChange={onChange}
        onStickerDelete={onDelete}
      />,
    );
    expect(screen.getByTestId('sticker-frame')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith('s1', { ...sticker.placement, cx: 60 }, 'nudge');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledWith('s1');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('取色控制器：pick 等到 finish 的色碼；cancel 回傳 null', async () => {
    const p = createCanvasPicker();
    expect(p.isActive()).toBe(false);
    const a = p.pick();
    expect(p.isActive()).toBe(true);
    p.finish('#123456');
    await expect(a).resolves.toBe('#123456');
    const b = p.pick();
    p.cancel();
    await expect(b).resolves.toBeNull();
    expect(p.isActive()).toBe(false);
  });
});

describe('ImageFrameDialog 的計算', () => {
  it('框：比例固定、四周留邊、置中', () => {
    expect(frameIn({ width: 400, height: 300 }, 1, 20)).toEqual({
      x: 70,
      y: 20,
      width: 260,
      height: 260,
    });
  });

  it('蓋滿／整張放入；以一點縮放、以一點順時針轉 90°', () => {
    const frame = { x: 0, y: 0, width: 100, height: 100 };
    expect(fitTransform({ width: 200, height: 100 }, frame, 'cover')).toEqual({
      cx: 50,
      cy: 50,
      scale: 1,
      turns: 0,
    });
    expect(fitTransform({ width: 200, height: 100 }, frame, 'contain').scale).toBe(0.5);
    expect(fitTransform({ width: 200, height: 100 }, frame, 'contain', 1).scale).toBe(0.5);
    const t = { cx: 60, cy: 50, scale: 1, turns: 0 };
    expect(zoomAt(t, 2, 50, 50)).toEqual({ cx: 70, cy: 50, scale: 2, turns: 0 });
    expect(turnAt(t, 50, 50)).toEqual({ cx: 50, cy: 60, scale: 1, turns: 1 });
  });
});
