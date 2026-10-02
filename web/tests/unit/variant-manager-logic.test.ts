/**
 * 角色差分管理器（variant-manager）的規則：規格 3.1 輸出檔名、3.2 名稱清理、3.3 主名稱自動帶入（依主控裁定的新詞表與分隔規則）、
 * 3.4 ZIP 檔名與重名處理（F23＋主控裁定）、3.5 聊天面板文字、F03 類型、F04 去重的鍵、
 * F10 載入後的選取與 F11 清單面板的高度（對等驗證後的追加裁定）。
 */
import { describe, expect, it } from 'vitest';
import { safeFileName } from '@/core/files';
import {
  autoMainName,
  chatPalette,
  cleanName,
  EXPRESSION_WORDS,
  extensionOf,
  FALLBACK_MAIN,
  fileKey,
  fitListHeight,
  isImageFile,
  LIST_FIT,
  mainNameOrFallback,
  numberLabel,
  outputFileName,
  PALETTE_FILE,
  selectionAfterLoad,
  stripExpressionWord,
  stripExtension,
  zipEntryNames,
  zipFileName,
} from '@/tools/variant-manager/logic';
import { SUGGESTIONS } from '@/tools/variant-manager/strings';

describe('3.2 名稱清理', () => {
  it('規格的例子', () => {
    expect(cleanName('怒り/怒?')).toBe('怒り怒');
    expect(cleanName('a  b__c_')).toBe('a_b_c');
    expect(cleanName('   ')).toBe('');
    expect(cleanName('笑 大')).toBe('笑_大');
    expect(cleanName(' my char:01 ')).toBe('my_char01');
  });
  it('全形空白、換行、Tab 都算空白；九個禁用字元全部刪掉', () => {
    expect(cleanName('a　b\nc\td')).toBe('a_b_c_d');
    expect(cleanName('\\/:*?"<>|')).toBe('');
    expect(cleanName('a\\b/c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    /* 刪掉禁用字元後才合併「_」：「a _/_ b」→「a___b」→「a_b」 */
    expect(cleanName('a _/_ b')).toBe('a_b');
    expect(cleanName('__a__')).toBe('a');
  });
  it('其他字元（中日文、emoji、「.」「-」）保留', () => {
    expect(cleanName('v1.2-x😀')).toBe('v1.2-x😀');
    expect(cleanName('ジト目')).toBe('ジト目');
    expect(cleanName('.hidden.')).toBe('.hidden.');
  });
  it('不改寫 Windows 保留名稱、不截斷（差分名也用在聊天面板）', () => {
    expect(cleanName('con')).toBe('con');
    expect(cleanName('NUL')).toBe('NUL');
    const long = '長'.repeat(120);
    expect(cleanName(long)).toBe(long);
  });
  it('safeFileName 的預設行為不變（向下相容）', () => {
    expect(safeFileName('con')).toBe('_con');
    expect(safeFileName('con', { underscore: true, fallback: '' })).toBe('_con');
    expect(safeFileName('con', { reservedNames: false })).toBe('con');
  });
});

describe('3.1 輸出檔名', () => {
  const name = (
    main: string,
    index: number,
    variant: string,
    fileName: string,
    numbered = true,
  ): string => outputFileName({ main, numbered, index, variant, fileName });

  it('規格的例子（主名稱 alice、編號開）', () => {
    expect(name('alice', 0, '笑 大', 'alice_smile.png')).toBe('alice01_笑_大.png');
    expect(name('alice', 3, '', 'Alice Normal.JPG')).toBe('alice04.jpg');
    expect(name(' my char:01 ', 0, '生氣', 'a.png')).toBe('my_char0101_生氣.png');
    expect(name('', 0, '生氣', 'a.png')).toBe('character01_生氣.png');
    expect(name('   ', 1, '', 'a.webp')).toBe('character02.webp');
  });
  it('編號：兩位數補 0、100 以上照實際位數；關閉時沒有編號；編號與主名稱之間沒有分隔字元', () => {
    expect(numberLabel(0)).toBe('01');
    expect(numberLabel(8)).toBe('09');
    expect(numberLabel(98)).toBe('99');
    expect(numberLabel(99)).toBe('100');
    expect(numberLabel(100)).toBe('101');
    expect(name('alice', 99, 'a', 'x.png')).toBe('alice100_a.png');
    expect(name('alice', 4, 'a', 'x.png', false)).toBe('alice_a.png');
    expect(name('alice', 4, '', 'x.png', false)).toBe('alice.png');
  });
  it('差分名清理後是空的：沒有「_差分名」', () => {
    expect(name('alice', 0, ' / ? ', 'x.png')).toBe('alice01.png');
    expect(name('alice', 0, '怒り/怒?', 'x.png')).toBe('alice01_怒り怒.png');
  });
  it('副檔名：最後一個「.」之後轉小寫；沒有「.」時一律 png；檔名其他部分不影響', () => {
    expect(extensionOf('x.tar.PNG')).toBe('png');
    expect(extensionOf('Photo.JpEg')).toBe('jpeg');
    expect(extensionOf('沒有副檔名')).toBe('png');
    expect(extensionOf('a.WEBP')).toBe('webp');
    expect(extensionOf('結尾是點.')).toBe('png');
    expect(name('alice', 0, '', '沒有副檔名')).toBe('alice01.png');
    expect(name('alice', 0, '', 'a.GIF')).toBe('alice01.gif');
  });
  it('主名稱', () => {
    expect(mainNameOrFallback('')).toBe(FALLBACK_MAIN);
    expect(mainNameOrFallback(' ? ')).toBe('character');
    expect(mainNameOrFallback('Lin Mei')).toBe('Lin_Mei');
  });
});

describe('3.3 主名稱自動帶入（主控裁定：詞前面要有 _、- 或空白）', () => {
  it('規格的例子', () => {
    expect(autoMainName('alice_smile.png')).toBe('alice');
    expect(autoMainName('Bob-SMILE.png')).toBe('Bob');
    expect(autoMainName('Bob smile.png')).toBe('Bob');
    expect(autoMainName('smile_alice.png')).toBe('smile_alice');
    expect(autoMainName('x.tar.PNG')).toBe('x.tar');
  });
  it('一般字尾不會被誤刪', () => {
    expect(autoMainName('chase.png')).toBe('chase');
    expect(autoMainName('alicesmile.png')).toBe('alicesmile');
    expect(autoMainName('普通人.png')).toBe('普通人');
    expect(autoMainName('smile.png')).toBe('smile');
  });
  it('繁中、英文、日文的表情詞；不分大小寫；長的詞先比', () => {
    expect(autoMainName('林小雨_微笑.png')).toBe('林小雨');
    expect(autoMainName('林小雨-大笑.webp')).toBe('林小雨');
    expect(autoMainName('林小雨_笑.png')).toBe('林小雨');
    expect(autoMainName('ありす_笑顔.png')).toBe('ありす');
    expect(autoMainName('arisu_EGAO.png')).toBe('arisu');
    expect(autoMainName('Mira Angry.JPG')).toBe('Mira');
    expect(autoMainName('mira_crying.png')).toBe('mira');
  });
  it('只去掉一個詞與緊鄰的一個分隔字元，再做 3.2 的清理', () => {
    expect(autoMainName('alice_normal_smile.png')).toBe('alice_normal');
    expect(autoMainName('alice__smile.png')).toBe('alice');
    expect(autoMainName('my char 01.png')).toBe('my_char_01');
    expect(autoMainName('_smile.png')).toBe('');
    expect(autoMainName('沒有副檔名_smile')).toBe('沒有副檔名');
  });
  it('全形空白也算分隔字元', () => {
    expect(stripExpressionWord('小雨　微笑')).toBe('小雨');
  });
  it('詞表涵蓋繁中、英文、日文，且包含常見的 smile、angry', () => {
    expect(EXPRESSION_WORDS).toEqual(expect.arrayContaining(['smile', 'angry', '微笑', '笑顔']));
    expect(new Set(EXPRESSION_WORDS).size).toBe(EXPRESSION_WORDS.length);
  });
  it('stripExtension', () => {
    expect(stripExtension('a.b.c')).toBe('a.b');
    expect(stripExtension('abc')).toBe('abc');
  });
});

describe('3.5 聊天面板文字', () => {
  it('規格的例子：清理後的名稱、略過空白、LF 分隔、最後沒有換行', () => {
    const text = chatPalette(['怒り/怒?', '', '笑 大', '生氣']);
    expect(text).toBe('@怒り怒\n@笑_大\n@生氣');
    expect(text.endsWith('\n')).toBe(false);
    expect(text.includes('\r')).toBe(false);
  });
  it('重複的名稱照樣列出；全部空白時是空字串', () => {
    expect(chatPalette(['a', 'a'])).toBe('@a\n@a');
    expect(chatPalette(['', '  ', '/'])).toBe('');
    expect(chatPalette([])).toBe('');
  });
});

describe('3.4 ZIP', () => {
  it('ZIP 檔名：<主名稱>_sabun.zip', () => {
    expect(zipFileName('alice')).toBe('alice_sabun.zip');
    expect(zipFileName('')).toBe('character_sabun.zip');
    expect(zipFileName(' my char ')).toBe('my_char_sabun.zip');
    expect(PALETTE_FILE).toBe('sabun-chatpalette.txt');
  });
  it('F23＋主控裁定：重名自動加序號、加了之後再檢查，不覆蓋', () => {
    /* 編號關閉時差分名為 a、a、a_2 */
    const names = ['a', 'a', 'a_2'].map((v, index) =>
      outputFileName({ main: 'x', numbered: false, index, variant: v, fileName: 'p.png' }),
    );
    expect(names).toEqual(['x_a.png', 'x_a.png', 'x_a_2.png']);
    expect(zipEntryNames(names)).toEqual(['x_a.png', 'x_a_2.png', 'x_a_2_2.png']);
    expect(zipEntryNames(['x.png', 'x.png', 'x.png'])).toEqual(['x.png', 'x_2.png', 'x_3.png']);
  });
  it('不撞名時原樣；不分大小寫視為撞名；不會和聊天面板文字檔同名', () => {
    expect(zipEntryNames(['a01.png', 'a02.png'])).toEqual(['a01.png', 'a02.png']);
    expect(zipEntryNames(['x_A.png', 'x_a.png'])).toEqual(['x_A.png', 'x_a_2.png']);
    expect(zipEntryNames([PALETTE_FILE])).toEqual(['sabun-chatpalette_2.txt']);
  });
});

describe('載入', () => {
  it('F03：瀏覽器回報為圖片的都收（含 GIF），其他略過', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/gif' })).toBe(true);
    expect(isImageFile({ type: 'image/svg+xml' })).toBe(true);
    expect(isImageFile({ type: 'text/plain' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
  it('F04：檔名、大小、修改時間三者都相同才算同一個檔案', () => {
    const a = { name: 'a.png', size: 10, lastModified: 1 };
    expect(fileKey(a)).toBe(fileKey({ ...a }));
    expect(fileKey(a)).not.toBe(fileKey({ ...a, size: 11 }));
    expect(fileKey(a)).not.toBe(fileKey({ ...a, lastModified: 2 }));
    expect(fileKey(a)).not.toBe(fileKey({ ...a, name: 'b.png' }));
  });
  it('F19：建議名稱約 23 個、不重複，清理後不變', () => {
    expect(SUGGESTIONS.length).toBe(23);
    expect(new Set(SUGGESTIONS).size).toBe(SUGGESTIONS.length);
    for (const s of SUGGESTIONS) expect(cleanName(s)).toBe(s);
  });
});

describe('F10 載入後的選取（追加裁定）', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('還沒有選取：選第一張', () => {
    expect(selectionAfterLoad(null, ids)).toBe('a');
  });
  it('選取的那張還在：維持（加入新檔、或全部重複而加入 0 張都一樣）', () => {
    expect(selectionAfterLoad('c', ids)).toBe('c');
    expect(selectionAfterLoad('c', ['a', 'b', 'c'])).toBe('c');
  });
  it('選取的那張已經不在清單裡（被移除）：選第一張', () => {
    expect(selectionAfterLoad('x', ids)).toBe('a');
  });
  it('清單是空的：沒有選取', () => {
    expect(selectionAfterLoad(null, [])).toBeNull();
    expect(selectionAfterLoad('a', [])).toBeNull();
  });
});

describe('F11 清單面板的高度（追加裁定：寬畫面時面板下緣停在視窗裡）', () => {
  it('視窗夠高：面板下緣離視窗下緣 16 px', () => {
    /* 面板在 y 610，視窗 1100 高 → 474 px，面板範圍 610～1084 */
    expect(fitListHeight(610, 1100)).toBe(474);
    expect(610 + fitListHeight(610, 1100)).toBeLessThanOrEqual(1100 - LIST_FIT.gap);
    expect(fitListHeight(610, 1440)).toBe(814);
  });
  it('最多 1200 px；視窗太矮時至少保留 420 px（約四列，常見筆電尺寸也看得到四列）', () => {
    expect(fitListHeight(400, 2000)).toBe(1200);
    expect(fitListHeight(610, 900)).toBe(420);
    expect(fitListHeight(610, 768)).toBe(420);
    expect(fitListHeight(610, 300)).toBe(LIST_FIT.min);
  });
});
