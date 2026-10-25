// @vitest-environment jsdom
/**
 * 劇本排版台：變數表的「自動的列」用輸入法打字（規格 7.5「第三批驗證後」U1、F307）。
 * 組字中（compositionstart～compositionend）不轉成登錄的列，選好字（或離開欄位）才登錄，注音不會留在欄位裡。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiProvider } from '@/ui';
import { newBlock } from '../../src/tools/scenario-editor/model/blocks';
import { blankDoc } from '../../src/tools/scenario-editor/model/doc';
import type { Block, Doc } from '../../src/tools/scenario-editor/model/types';
import { VarsSection } from '../../src/tools/scenario-editor/panel/VarsSection';
import { doc, useDoc } from '../../src/tools/scenario-editor/store';

const B = (id: string, type: Block['type'], text = ''): Block =>
  Object.assign(newBlock(type, text), { id });
const docWith = (blocks: Block[]): Doc => ({ ...blankDoc(), blocks, vars: [] });

function view() {
  return render(
    <UiProvider>
      <VarsSection />
    </UiProvider>,
  );
}

describe('變數表的自動的列：輸入法', () => {
  beforeEach(() => {
    useDoc.getState().replace(docWith([B('t', 'desc', '本文寫到 {HO3}。')]));
  });

  it('組字中不登錄；選好字才登錄，值是選好的字（沒有注音）', async () => {
    view();
    const f = screen.getByLabelText('{HO3}的預設值') as HTMLInputElement;
    act(() => {
      f.focus();
    });
    fireEvent.compositionStart(f);
    fireEvent.change(f, { target: { value: 'ㄐ' } });
    fireEvent.change(f, { target: { value: 'ㄐㄧ' } });
    /* 組字中：還是自動的列，欄位裡看得到組字中的字 */
    expect(doc().vars).toEqual([]);
    expect(f.value).toBe('ㄐㄧ');
    expect(f.closest('[data-var-kind]')?.getAttribute('data-var-kind')).toBe('auto');
    fireEvent.change(f, { target: { value: '甲' } });
    fireEvent.compositionEnd(f);
    expect(doc().vars).toEqual([{ n: 'HO3', def: '甲', note: '' }]);
    /* 列變成登錄的列；之後的組字照一般的欄位 */
    const reg = (await screen.findByLabelText('變數 1 的預設值')) as HTMLInputElement;
    expect(reg.value).toBe('甲');
    expect(screen.queryByLabelText('{HO3}的預設值')).toBeNull();
  });

  it('沒有輸入法的打字：第一個字就登錄；組字到一半離開欄位：照欄位裡的字登錄', () => {
    view();
    const note = screen.getByLabelText('{HO3}的說明') as HTMLInputElement;
    fireEvent.compositionStart(note);
    fireEvent.change(note, { target: { value: '記者' } });
    expect(doc().vars).toEqual([]);
    fireEvent.blur(note);
    expect(doc().vars).toEqual([{ n: 'HO3', def: '', note: '記者' }]);
  });

  it('組字取消（欄位變回空白）：不登錄', () => {
    view();
    const f = screen.getByLabelText('{HO3}的預設值') as HTMLInputElement;
    fireEvent.compositionStart(f);
    fireEvent.change(f, { target: { value: 'ㄐ' } });
    fireEvent.change(f, { target: { value: '' } });
    fireEvent.compositionEnd(f);
    expect(doc().vars).toEqual([]);
  });

  it('一般打字：第一個字就變成登錄的列', () => {
    view();
    const f = screen.getByLabelText('{HO3}的預設值') as HTMLInputElement;
    fireEvent.change(f, { target: { value: 'a' } });
    expect(doc().vars).toEqual([{ n: 'HO3', def: 'a', note: '' }]);
  });
});
