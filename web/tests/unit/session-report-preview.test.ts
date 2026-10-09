/**
 * 團報產生器的預覽：手動編輯的保留（規格 3.8）、復原紀錄（3.9）、文字裝飾的分頁（P11 新增）。
 */
import { describe, expect, it } from 'vitest';
import { DECORATIONS } from '@/tools/session-report/decorations';
import {
  applyGenerated,
  clearPreview,
  editPreview,
  emptyPreview,
  HISTORY_LIMIT,
  mergeManualEdits,
  type PreviewState,
  pushHistory,
  redo,
  regenerate,
  undo,
} from '@/tools/session-report/preview';

const state = (patch: Partial<PreviewState>): PreviewState => ({ ...emptyPreview(), ...patch });

describe('mergeManualEdits（3.8）', () => {
  it('沒有基準、或預覽等於基準時直接用新團報', () => {
    expect(mergeManualEdits('', 'xyz', 'NEW')).toBe('NEW');
    expect(mergeManualEdits('abc', 'abc', 'NEW')).toBe('NEW');
  });

  it('開頭加字：手動的那段留在開頭', () => {
    expect(mergeManualEdits('劇本A\nEND', '★劇本A\nEND', '劇本B\nEND')).toBe('★劇本B\nEND');
  });

  it('結尾加字：資料長度不變時留在結尾；新團報變長時插在原本的位置（後面的字被蓋掉，舊版行為）', () => {
    expect(mergeManualEdits('劇本A\nEND', '劇本A\nEND\n感謝同團！', '劇本B\nEND')).toBe(
      '劇本B\nEND\n感謝同團！',
    );
    expect(mergeManualEdits('劇本A\nEND', '劇本A\nEND!', '劇本AA\nEND')).toBe('劇本AA\nEN!');
  });

  it('中間改字：新團報的前 s 個字＋手動的段落＋新團報的最後（基準長度 − b）個字', () => {
    /* 基準 abcdef、預覽 abXYef → s=2、b=4、e=4：手動段落 XY；新團報 abcdefgh → ab＋XY＋gh */
    expect(mergeManualEdits('abcdef', 'abXYef', 'abcdefgh')).toBe('abXYgh');
  });

  it('新團報比較短時，結尾的起點不小於 s', () => {
    expect(mergeManualEdits('abcdef', 'abcdXef', 'ab')).toBe('abX');
  });

  it('清空預覽之後，新團報也保持空白', () => {
    expect(mergeManualEdits('abc', '', 'NEW')).toBe('');
  });

  it('以 UTF-16 碼元計：新團報的結尾取「基準長度 − b」個碼元（舊版的簡單比對，資料改變時可能蓋掉一部分）', () => {
    /* 基準 4 個碼元、b=3 → 新團報取最後 1 個碼元 */
    expect(mergeManualEdits('A🎲B', 'A🎲!B', 'A🎲BC')).toBe('A🎲!C');
  });
});

describe('applyGenerated', () => {
  it('沒有手動編輯：換成新團報；有：保留手動的部分，dirty 依結果是否等於新團報', () => {
    expect(applyGenerated(state({ text: 'old', base: 'old' }), 'new')).toMatchObject({
      text: 'new',
      base: 'new',
      dirty: false,
    });
    expect(applyGenerated(state({ text: 'old!', base: 'old', dirty: true }), 'new')).toMatchObject({
      text: 'new!',
      base: 'new',
      dirty: true,
    });
    /* 手動改回跟基準一樣：結果等於新團報，dirty 變回否 */
    expect(applyGenerated(state({ text: 'old', base: 'old', dirty: true }), 'new')).toMatchObject({
      text: 'new',
      dirty: false,
    });
  });

  it('同一個新團報重複套用不會改變（開頁時套用存檔的預覽）', () => {
    const s = state({ text: 'X★Y', base: 'XY', dirty: true });
    expect(applyGenerated(s, 'XY')).toMatchObject({ text: 'X★Y', base: 'XY', dirty: true });
  });
});

describe('復原紀錄（3.9）', () => {
  it('記一步：和最後一筆相同時不加，但重做紀錄一律清空', () => {
    let s = state({ text: 'a', future: ['z'] });
    s = pushHistory(s);
    expect(s.past).toEqual(['a']);
    expect(s.future).toEqual([]);
    s = pushHistory({ ...s, future: ['z'] });
    expect(s.past).toEqual(['a']);
    expect(s.future).toEqual([]);
  });

  it(`最多 ${HISTORY_LIMIT} 筆，超過丟最舊的`, () => {
    let s = emptyPreview();
    for (let i = 0; i < 100; i++) s = editPreview(s, `t${i}`);
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    expect(s.past[0]).toBe('t19');
    expect(s.past[HISTORY_LIMIT - 1]).toBe('t98');
  });

  it('打字：先記一步、標記手動編輯；復原、重做只換文字，不改 dirty 與基準', () => {
    let s = state({ text: 'gen', base: 'gen' });
    s = editPreview(s, 'gen!');
    expect(s).toMatchObject({ text: 'gen!', dirty: true, past: ['gen'] });
    s = undo(s);
    expect(s).toMatchObject({ text: 'gen', dirty: true, base: 'gen', past: [], future: ['gen!'] });
    s = redo(s);
    expect(s).toMatchObject({ text: 'gen!', past: ['gen'], future: [] });
    /* 紀錄是空的時不做事 */
    expect(redo(s)).toBe(s);
    expect(undo(emptyPreview()).text).toBe('');
  });

  it('清除預覽：記一步、清空、標記手動編輯；之後改輸入仍是空的', () => {
    let s = clearPreview(state({ text: 'gen', base: 'gen' }));
    expect(s).toMatchObject({ text: '', dirty: true, past: ['gen'] });
    s = applyGenerated(s, 'gen2');
    expect(s.text).toBe('');
  });

  it('重新產生：記一步、捨棄手動編輯', () => {
    const s = regenerate(state({ text: 'gen!', base: 'gen', dirty: true }), 'gen');
    expect(s).toMatchObject({ text: 'gen', base: 'gen', dirty: false, past: ['gen!'] });
  });
});

describe('文字裝飾的分頁（P11 新增 F57、F58）', () => {
  it('四個類型依序：分隔線（自成一行）、括號（包住）、單一符號、點綴（插入）', () => {
    expect(DECORATIONS.map((g) => [g.id, g.mode])).toEqual([
      ['lines', 'line'],
      ['brackets', 'wrap'],
      ['symbols', 'insert'],
      ['accents', 'insert'],
    ]);
  });
  it('括號：每一個都有左右兩邊，「」『』【】在最前面；同一類型裡按鈕字樣不重複', () => {
    const brackets = DECORATIONS.find((g) => g.id === 'brackets')!;
    expect(brackets.items.every((it) => it.value && it.close)).toBe(true);
    expect(brackets.items.slice(0, 3).map((it) => it.value + it.close)).toEqual([
      '「」',
      '『』',
      '【】',
    ]);
    for (const g of DECORATIONS) {
      expect(new Set(g.items.map((it) => it.label)).size).toBe(g.items.length);
      if (g.mode !== 'wrap') expect(g.items.every((it) => it.close === undefined)).toBe(true);
    }
  });
});
