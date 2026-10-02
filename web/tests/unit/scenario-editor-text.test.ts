/**
 * 劇本排版台：文字、注音、註解與顏色的位置、巢狀書式、斜線指令、貼上猜書式、字數（規格 3.4、3.12）。
 */
import { describe, expect, it } from 'vitest';
import { newBlock } from '../../src/tools/scenario-editor/model/blocks';
import {
  blocksPlainText,
  docCharCount,
  formatCount,
} from '../../src/tools/scenario-editor/model/count';
import {
  appendMarkLine,
  applySlash,
  guessType,
  hasRich,
  markKey,
  mdText,
  plainCount,
  popRefNames,
  renamePopRefsIn,
  richApply,
  richKind,
  slashHit,
} from '../../src/tools/scenario-editor/model/rich';
import {
  addComment,
  hasRuby,
  rubyHtml,
  rubyHtmlWithComments,
  rubyPlain,
  setBlockText,
  setMarkColor,
  shiftRanges,
  tidyMarks,
} from '../../src/tools/scenario-editor/model/text';

describe('注音（3.4.2）', () => {
  it('｜本文字《注音》（全形或半形）', () => {
    expect(rubyHtml('來自｜舊友《きゅうゆう》的信')).toBe(
      '來自<ruby>舊友<rp>（</rp><rt>きゅうゆう</rt><rp>）</rp></ruby>的信',
    );
    expect(rubyHtml('|A《a》')).toBe('<ruby>A<rp>（</rp><rt>a</rt><rp>）</rp></ruby>');
    expect(rubyPlain('來自｜舊友《きゅうゆう》的信')).toBe('來自舊友的信');
  });
  it('沒有｜的《》照原樣、會跳脫 HTML', () => {
    expect(rubyHtml('《書名》<b>')).toBe('《書名》&lt;b&gt;');
  });
  it('判斷不受上一次比對的狀態影響（第 5 節）', () => {
    for (let i = 0; i < 3; i++) expect(hasRuby('｜漢字《かんじ》')).toBe(true);
    expect(hasRuby('沒有注音')).toBe(false);
  });
});

describe('註解與顏色的位置（3.4.3）', () => {
  const R = [{ a: 2, b: 4 }];
  it('改動範圍前的不動、後面的平移', () => {
    expect(shiftRanges(R, 'abcdef', 'Xabcdef')).toEqual([{ a: 3, b: 5 }]);
    expect(shiftRanges(R, 'abcdef', 'abcdefX')).toEqual([{ a: 2, b: 4 }]);
  });
  it('在範圍裡改動：終點移到插入文字的結尾', () => {
    expect(shiftRanges(R, 'abcdef', 'abcXXdef')).toEqual([{ a: 2, b: 6 }]);
  });
  it('整段刪掉的範圍刪除', () => {
    expect(shiftRanges(R, 'abcdef', 'abef')).toEqual([]);
  });
  it('setBlockText 一起平移註解與顏色', () => {
    const b = newBlock('desc', '那天探索者們收到信');
    addComment(b, 4, 6, '註');
    setMarkColor(b, 6, 8, '#a8331f');
    setBlockText(b, '那天，各位探索者們收到信');
    expect(b.cm).toEqual([{ a: 7, b: 9, t: '註' }]);
    expect(b.mk).toEqual([{ a: 9, b: 11, col: '#a8331f', bold: false }]);
    /* 起點與改動的開頭相同：範圍前的位置不變（起點留在原處） */
    const c = newBlock('desc', 'abc');
    addComment(c, 0, 3, 'x');
    setBlockText(c, 'Zabc');
    expect(c.cm).toEqual([{ a: 0, b: 4, t: 'x' }]);
  });
  it('同色的重疊或相鄰段合併', () => {
    expect(
      tidyMarks([
        { a: 0, b: 2, col: '#111111' },
        { a: 2, b: 4, col: '#111111' },
        { a: 6, b: 7, col: '#222222' },
      ]),
    ).toEqual([
      { a: 0, b: 4, col: '#111111', bold: false },
      { a: 6, b: 7, col: '#222222', bold: false },
    ]);
  });
  it('顏色與註解重疊時在分界處切開', () => {
    const b = { ...newBlock('desc', 'abcdef'), id: 'x' };
    addComment(b, 1, 4, 'n');
    setMarkColor(b, 3, 5, '#a8331f');
    const html = rubyHtmlWithComments(b);
    expect(html).toContain('data-cmt="x:0"');
    expect(html).toContain('<sup class="cmt-n">1</sup>');
    expect(html).toContain('color:#a8331f');
    expect(html.replace(/<[^>]+>/g, '')).toBe('abcd1ef');
  });
});

describe('行首記號（3.4.1）', () => {
  it('條列的「-」後面要有空白', () => {
    expect(richKind('- 項目').k).toBe('li');
    expect(richKind('-5度').k).toBe('p');
  });
  it('選項比條列先判斷', () => {
    expect(richKind('- [ ] 選項')).toMatchObject({ k: 'li', mk: 'box', on: false });
    expect(richKind('- [x] 選項')).toMatchObject({ k: 'li', mk: 'box', on: true });
    expect(richKind('□ 選項')).toMatchObject({ k: 'li', mk: 'box' });
  });
  it('層級：半形 2 個、全形 1 個、Tab 2 個為一層，最多 3 層', () => {
    expect(richKind('  - a')).toMatchObject({ lv: 1 });
    expect(richKind('　　- a')).toMatchObject({ lv: 2 });
    expect(richKind('\t\t\t\t- a')).toMatchObject({ lv: 3 });
  });
  it('編號、小標、注釋、檢定框、彈出視窗、表格、對話', () => {
    expect(richKind('3．內容')).toMatchObject({ k: 'li', mk: 'num', no: '3' });
    expect(richKind('■小標').k).toBe('head');
    expect(richKind('◆小標').k).toBe('head');
    expect(richKind('◇次小標').k).toBe('heads');
    expect(richKind('※注').k).toBe('note');
    expect(richKind('＞ 技能：').k).toBe('nest');
    expect(richKind('＠地圖').k).toBe('pop');
    expect(richKind('|a|b|').k).toBe('tbl');
    expect(richKind('管家「歡迎」')).toMatchObject({ k: 'talk', sp: '管家' });
    expect(richKind('# 標題', { heads: true })).toMatchObject({ k: 'h', lv: 1 });
    expect(richKind('# 標題').k).toBe('p');
  });
  it('hasRich', () => {
    expect(hasRich('一般的文字')).toBe(false);
    expect(hasRich('文字\n- 條列')).toBe(true);
  });
});

describe('巢狀書式按鈕（3.4.4）', () => {
  it('沒有選取：游標處插入記號（不在行首先換行），對話的游標放進「」', () => {
    expect(richApply('abc', 3, 3, '■')).toEqual({ text: 'abc\n■', a: 5, z: 5 });
    expect(richApply('', 0, 0, '「」')).toEqual({ text: '「」', a: 1, z: 1 });
  });
  it('對話：包起來／拿掉', () => {
    expect(richApply('你好', 0, 2, '「」').text).toBe('「你好」');
    expect(richApply('「你好」', 0, 4, '「」').text).toBe('你好');
  });
  it('彈出視窗：選取的文字換成＠文字', () => {
    expect(richApply('看地圖\n吧', 1, 5, '＠').text).toBe('看＠地圖 吧');
  });
  it('表格：每行用 | 包起來，全部包好時拿掉', () => {
    expect(richApply('a\nb', 0, 3, '|項目|內容|').text).toBe('|a|\n|b|');
    expect(richApply('|a|\n|b|', 0, 7, '|項目|內容|').text).toBe('a\nb');
  });
  it('編號依序、已是同一種記號時拿掉', () => {
    expect(richApply('甲\n乙', 0, 3, '1. ').text).toBe('1. 甲\n2. 乙');
    expect(richApply('- 甲\n- 乙', 0, 7, '- ').text).toBe('甲\n乙');
    expect(richApply('- 甲', 0, 4, '■').text).toBe('■甲');
  });
  it('檢定框：只有第一行寫小標', () => {
    expect(richApply('甲\n乙', 0, 3, '> 技能：').text).toBe('> 技能：甲\n＞乙');
  });
  it('沒有游標時加在最後一行', () => {
    expect(appendMarkLine('內容\n\n', '■小標')).toBe('內容\n■小標');
    expect(appendMarkLine('', '※')).toBe('※');
  });
  it('markKey', () => {
    expect(markKey('- [ ] x')).toBe('box');
    expect(markKey('  - x')).toBe('disc');
    expect(markKey('12. x')).toBe('num');
  });
});

describe('斜線指令（3.4.5）', () => {
  it('行首「/指令」＋空白（半形或全形）換成記號', () => {
    expect(applySlash('/head ', 6)).toEqual({ text: '■', caret: 1 });
    expect(applySlash('前\n  /NOTE　', 10)).toEqual({ text: '前\n  ※', caret: 5 });
    expect(applySlash('/table ', 7)?.text).toBe('|項目|內容|');
    expect(applySlash('/sagedan ', 9)?.text).toBe('  - ');
  });
  it('對話指令把游標放進「」', () => {
    expect(applySlash('/kaiwa ', 7)).toEqual({ text: '「」', caret: 1 });
  });
  it('不在行首、或不認得的指令不動作', () => {
    expect(slashHit('文字 /head ', 9)).toBeNull();
    expect(applySlash('/unknown ', 9)).toBeNull();
  });
});

describe('貼上時猜書式（3.4.6）', () => {
  it('標題、對話、注釋', () => {
    expect(guessType('### 小節')).toEqual(['h3', '小節']);
    expect(guessType('## 章')).toEqual(['h2', '章']);
    expect(guessType('# 部')).toEqual(['h1', '部']);
    expect(guessType('「你好」')[0]).toBe('dialog');
    expect(guessType('※ 補充')).toEqual(['note', '補充']);
  });
  it('規則框：日文與繁中的標記', () => {
    expect(guessType('【技能判定】〈目星〉')).toEqual(['proc', '〈目星〉', 'skill']);
    expect(guessType('【技能檢定】〈偵查〉')).toEqual(['proc', '〈偵查〉', 'skill']);
    expect(guessType('【特殊規則】追擊')).toEqual(['proc', '追擊', 'rule']);
    expect(guessType('〈聆聽〉檢定成功時')[0]).toBe('proc');
    expect(guessType('〈聆聽〉成功的話')[0]).toBe('proc');
  });
  it('場景轉換與描述文', () => {
    expect(guessType('（場景：書房）')[0]).toBe('scene');
    expect(guessType('シーン2へ移行')[0]).toBe('scene');
    expect(guessType('普通的文字')[0]).toBe('desc');
  });
});

describe('舊記號改成 markdown 寫法（3.1.3）', () => {
  it('□ → - [ ]、・ → -、＞ → >', () => {
    expect(mdText('□選項\n・條列\n＞檢定\n普通')).toBe('- [ ] 選項\n- 條列\n> 檢定\n普通');
  });
});

describe('彈出視窗的名稱（F110、F112）', () => {
  it('撿出＠名稱、改名只改完全相同的行', () => {
    expect(popRefNames('文字\n＠地圖\n@ 日記\n＠地圖')).toEqual(['地圖', '日記']);
    expect(renamePopRefsIn('＠地圖\n＠地圖二\n地圖', '地圖', '舊地圖')).toBe(
      '＠舊地圖\n＠地圖二\n地圖',
    );
  });
});

describe('字數（3.12）', () => {
  it('拿掉行首記號、表格的直線、注音的讀音與空白', () => {
    expect(plainCount('■小標\n- 甲 乙\n|a|b|')).toBe(2 + 2 + 2);
    expect(plainCount('｜漢字《かんじ》 與\n  ※ 注')).toBe(3 + 1);
  });
  it('原稿全體：說話者、圖片說明、彈出視窗名稱、表格名稱、方框文字；換頁與目錄不算', () => {
    const dialog = { ...newBlock('dialog', '「好」'), sp: '甲' };
    const img = { ...newBlock('image', ''), cap: '圖說' };
    const br = newBlock('break', '不算');
    const toc = newBlock('toc', '不算');
    const flow = {
      ...newBlock('flow', '舊文字不算'),
      flow: {
        w: 10,
        h: 10,
        edges: [],
        nodes: [
          {
            id: 'n',
            x: 0,
            y: 0,
            w: 5,
            h: 5,
            t: '開始',
            t2: '結束',
            kind: 'box' as const,
            pad: 1,
            col: '' as const,
          },
        ],
      },
    };
    const pop = {
      ...newBlock('popup', ''),
      pop: { label: '地圖', body: '', only: false, blocks: [newBlock('desc', '內容')] },
    };
    expect(docCharCount({ blocks: [dialog, img, br, toc, flow, pop] })).toBe(3 + 1 + 2 + 4 + 2 + 2);
  });
  it('千位加逗號', () => {
    expect(formatCount(12345)).toBe('12,345');
  });
});

describe('複製文字（F065）', () => {
  it('換頁與目錄略過、圖片取說明、NPC 卡取名字／立場／備忘，以空行接起來', () => {
    const npc = { ...newBlock('npc', ''), npc: { name: '管家', role: '男', memo: '' } } as never;
    const img = { ...newBlock('image', ''), cap: '洋館' };
    expect(
      blocksPlainText([
        newBlock('desc', '甲'),
        newBlock('break', ''),
        img,
        npc,
        newBlock('toc', 'x'),
      ]),
    ).toBe('甲\n\n洋館\n\n管家\n男');
  });
});
