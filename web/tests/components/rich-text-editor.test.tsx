// @vitest-environment jsdom
/**
 * RichTextEditor 的 DOM 換算（完整格式）與調色盤的「我的顏色」、色碼欄（prose-card 加的共用層）：
 * - 寫出 → 讀回一致（粗體、顏色、斜體、刪除線、螢光筆、字級〔相對整段的 em＋data-size〕、字型、段落對齊、分頁）；
 * - 瀏覽器自己產生的標記（<b>、<i>、<s>、style 的 px 字級與 rgb 顏色、背景色）照樣讀得懂；
 * - 復原後游標的位置（改變的地方）、打進來的字的範圍（「接下來打的字」的格式）；
 * - 不給 full 時 readRichDom／writeRichDom 與以前相同（角色介紹圖）。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { normalizeDoc, type RichDoc } from '@/core/richtext';
import {
  ColorPicker,
  caretAfterChange,
  cssColorHex,
  insertedRange,
  isCanonicalRichDom,
  readRichDom,
  readRichDomFull,
  UiProvider,
  writeRichDom,
  writeRichDomFull,
} from '@/ui';

const opts = { full: true, baseSize: 30, displaySize: 16, baseFont: 'Base' } as const;

describe('完整格式的 DOM 換算', () => {
  it('寫出再讀回：格式與段落屬性一致', () => {
    const doc: RichDoc = {
      lines: [
        {
          runs: [
            { text: '甲', bold: true, color: '#8a3b2e' },
            { text: '乙', bold: false, color: '', italic: true, strike: true },
            { text: '丙', bold: false, color: '', highlight: '#fff0a8', size: 58, font: 'Huninn' },
          ],
          align: 'center',
        },
        { runs: [], pageBreak: true },
        { runs: [{ text: '丁', bold: false, color: '' }], align: 'justify' },
      ],
    };
    const root = document.createElement('div');
    writeRichDomFull(root, doc, opts);
    expect(root.children).toHaveLength(3);
    expect(root.children[1].getAttribute('data-page-break')).toBe('分頁');
    expect((root.querySelector('[data-size]') as HTMLElement).style.fontSize).toBe('1.9333em');
    expect(isCanonicalRichDom(root)).toBe(true);
    expect(normalizeDoc(readRichDomFull(root, opts))).toEqual(normalizeDoc(doc));
    /* readRichDom({ full }) 走同一份 */
    expect(normalizeDoc(readRichDom(root, '#000000', opts))).toEqual(normalizeDoc(doc));
  });

  it('瀏覽器產生的標記：<b>、<i>、<s>、px 字級、rgb 顏色、背景色、字型', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div style="text-align: right"><b>粗</b><i>斜</i><s>刪</s>' +
      '<span style="font-size: 32px; color: rgb(255, 0, 0); background-color: rgb(255, 240, 168)">大</span>' +
      '<span style="font-family: &quot;Huninn&quot;, sans-serif">圓</span>' +
      '<span style="font-family: Base">本</span></div><div><br></div>';
    expect(readRichDomFull(root, opts)).toEqual({
      lines: [
        {
          runs: [
            { text: '粗', bold: true, color: '' },
            { text: '斜', bold: false, color: '', italic: true },
            { text: '刪', bold: false, color: '', strike: true },
            { text: '大', bold: false, color: '#ff0000', highlight: '#fff0a8', size: 60 },
            { text: '圓', bold: false, color: '', font: 'Huninn' },
            { text: '本', bold: false, color: '' },
          ],
          align: 'right',
        },
        { runs: [] },
      ],
    });
    root.innerHTML = '<div>一</div>二';
    expect(isCanonicalRichDom(root)).toBe(false);
  });

  it('CSS 顏色：透明、rgba 的 0 不算顏色', () => {
    expect(cssColorHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorHex('transparent')).toBeNull();
    expect(cssColorHex('#ABC')).toBe('#aabbcc');
    expect(cssColorHex('rgb(1 2 3)')).toBe('#010203');
  });

  it('不給 full：與以前相同（每段 span 都寫粗細與顏色，讀回時沒有顏色的字用預設色）', () => {
    const root = document.createElement('div');
    writeRichDom(root, { lines: [{ runs: [{ text: '甲', bold: false, color: '#363636' }] }] });
    expect(root.innerHTML).toBe(
      '<div><span style="font-weight: 400; color: rgb(54, 54, 54);">甲</span></div>',
    );
    root.innerHTML = '<div><i>斜</i></div>';
    expect(readRichDom(root, '#123456')).toEqual({
      lines: [{ runs: [{ text: '斜', bold: false, color: '#123456' }] }],
    });
  });
});

describe('游標與輸入的範圍', () => {
  it('復原後游標放在改變的地方（刪掉的字的位置、插入的字後面）', () => {
    expect(caretAfterChange('abcXYZdef', 'abcdef')).toBe(3);
    expect(caretAfterChange('abcdef', 'abcXYZdef')).toBe(6);
    expect(caretAfterChange('aaa', 'aaaa')).toBe(4);
  });

  it('打進來的字：游標要在插入的字後面', () => {
    expect(insertedRange('一二', '一X二', 2)).toEqual({ start: 1, end: 2 });
    expect(insertedRange('一二', '一X二', 1)).toBeNull();
    expect(insertedRange('一二', '一', 1)).toBeNull();
  });
});

function Picker() {
  const [v, setV] = useState('#336699');
  const [presets, setPresets] = useState<string[]>(['#111111']);
  return (
    <UiProvider>
      <ColorPicker
        value={v}
        onChange={setV}
        presets={presets}
        onPresetsChange={setPresets}
        presetsMax={2}
        hexInput
        eyedropper={false}
      />
      <output data-testid="value">{v}</output>
      <output data-testid="presets">{presets.join(',')}</output>
    </UiProvider>
  );
}

describe('調色盤：我的顏色、色碼欄', () => {
  it('存下目前的顏色（重複、滿了不加）、點一下套用、× 刪除；色碼欄 Enter 套用', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(screen.getByRole('button', { name: '＋ 存成我的顏色' }));
    expect(screen.getByTestId('presets')).toHaveTextContent('#111111,#336699');
    await user.click(screen.getByRole('button', { name: '＋ 存成我的顏色' }));
    expect(screen.getByText('這個顏色已經在「我的顏色」裡。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '套用我的顏色 #111111' }));
    expect(screen.getByTestId('value')).toHaveTextContent('#111111');
    await user.click(screen.getByRole('button', { name: '從我的顏色刪掉 #336699' }));
    expect(screen.getByTestId('presets')).toHaveTextContent(/^#111111$/);
    const hex = screen.getByRole('textbox', { name: '色碼' });
    await user.clear(hex);
    await user.type(hex, 'f00{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('#ff0000');
  });
});
