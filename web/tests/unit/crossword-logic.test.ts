/**
 * crossword：新版的擴充與資料（規格 3.2～3.6、3.8、5. D2～D7）。
 * - 中文（斷詞換成固定的假斷詞，結果不受 ICU 版本影響）、全形標點與括號、HTML 實體；
 * - 自己列答案的格式、排不進去的答案；提示的遮蔽；
 * - 開頁的範例盤面（12 個答案全部排進去、每格的字一致）；讀回時的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  cleanSource,
  decodeEntities,
  extractWords,
  koreanStem,
  sentenceWords,
  sortHints,
  splitSentences,
  stripLineHead,
  textToSentences,
} from '../../src/tools/crossword/extract';
import {
  buildFromCandidates,
  buildFromEntries,
  clueLists,
  finishPuzzle,
  hintRuns,
  type Puzzle,
  parseList,
  placeWords,
  puzzleCells,
  seededRng,
  shuffle,
  weightedPool,
} from '../../src/tools/crossword/generate';
import {
  AUTOSAVE_TEXT_LIMIT,
  cleanPuzzle,
  DEFAULT_EMPTY_COLOR,
  inputKey,
  sanitizeData,
  titleOrDefault,
} from '../../src/tools/crossword/model';
import { initialData, SAMPLE_LIST, SAMPLE_TEXT } from '../../src/tools/crossword/sample';

/** 假的中文斷詞：照字典最長比對（字典沒有的字一個字一個詞） */
function fakeSegmenter(dict: string[]) {
  const words = [...dict].sort((a, b) => b.length - a.length);
  return (run: string) => {
    const out: string[] = [];
    let i = 0;
    while (i < run.length) {
      const w = words.find((d) => run.startsWith(d, i)) ?? run[i];
      out.push(w);
      i += w.length;
    }
    return out;
  };
}

/** 盤面裡每個詞的字都和格子相同、交叉的格子沒有衝突 */
function expectConsistent(p: Puzzle) {
  const cells = puzzleCells(p);
  for (const w of p.words) {
    Array.from(w.answer).forEach((ch, i) => {
      const x = w.dir === 'across' ? w.x + i : w.x;
      const y = w.dir === 'across' ? w.y : w.y + i;
      expect(cells[y]?.[x]?.char).toBe(ch);
    });
    expect(cells[w.y][w.x]?.num).toBe(w.num);
  }
}

describe('文字整理（3.2）', () => {
  it('JSON：依序取出字串值（數字不取），陣列與物件遞迴', () => {
    expect(cleanSource('{"a":"x","b":[1,"y",{"c":"z"}],"d":2}')).toBe('x y z   ');
    expect(cleanSource('[壞掉的 JSON')).toBe('[壞掉的 JSON');
  });

  it('HTML：拿掉 style、script 與標籤；新版解 HTML 實體', () => {
    const html = '<style>p{}</style><script>a<b</script><p>A &amp; B&lt;3 &#x5B57;&#23383;</p>';
    expect(cleanSource(html, false)).toBe('A &amp; B&lt;3 &#x5B57;&#23383;');
    expect(cleanSource(html)).toBe('A & B<3 字字');
    expect(decodeEntities('&unknown; &#0; &nbsp;')).toBe('&unknown; &#0;  ');
  });

  it('行首的說話者與標籤（原作：半形冒號、()[]<>{}（〈《；新版加全形冒號與【〔［｛）', () => {
    expect(stripLineHead('[main] KP : 文字', false)).toBe('文字');
    expect(stripLineHead('KP：文字', false)).toBe('KP：文字');
    expect(stripLineHead('KP：文字')).toBe('文字');
    expect(stripLineHead('【系統】［KP］：文字')).toBe('文字');
    expect(stripLineHead('(OOC) [x] 文字')).toBe('文字');
    /* 標籤後面緊接句點：保留（書名、旁白） */
    expect(stripLineHead('《書名》. 文字')).toBe('《書名》. 文字');
    expect(stripLineHead('《書名》。文字')).toBe('《書名》。文字');
    /* 超過 20 個字的「名字」不拿掉 */
    expect(stripLineHead('一二三四五六七八九十一二三四五六七八九十一：文字')).toBe(
      '一二三四五六七八九十一二三四五六七八九十一：文字',
    );
  });

  it('切句：句號、問號、驚嘆號（連續的算一個），括號裡不切，超過 5 個字才算', () => {
    expect(splitSentences('Hello there. Who are you?! Fine (a. b) ok. Hi.', false)).toEqual([
      'Hello there.',
      'Who are you?!',
      'Fine (a. b) ok.',
    ]);
    expect(splitSentences('他說：「我來了。真的嗎？」然後就走了。對。')).toEqual([
      '他說：「我來了。真的嗎？」然後就走了。',
    ]);
    expect(splitSentences('第一句很長很長。第二句也很長！短。', false)).toEqual([
      '第一句很長很長。第二句也很長！短。',
    ]);
    expect(splitSentences('第一句很長很長。第二句也很長！短。')).toEqual([
      '第一句很長很長。',
      '第二句也很長！',
    ]);
  });

  it('textToSentences：逐行處理（空行略過）', () => {
    expect(textToSentences('KP: The door is open.\n\n\nA: Run away now!', false)).toEqual([
      'The door is open.',
      'Run away now!',
    ]);
  });
});

describe('單字（3.3）', () => {
  it('韓文切掉助詞與詞尾（反覆），至少兩個字、不是不用詞', () => {
    expect(koreanStem('저택의')).toBe('저택');
    expect(koreanStem('지하실이라는')).toBe('지하실');
    expect(sentenceWords('그것은 오래된 저택에서는 열쇠를 찾았다', false)).toEqual([
      '오래된',
      '저택',
      '열쇠',
      '찾았',
    ]);
  });

  it('英文與數字：區分大小寫、至少兩個字（照原作，沒有英文的不用詞）', () => {
    expect(sentenceWords('The key, the Key and a 42 x.', false)).toEqual([
      'The',
      'key',
      'the',
      'Key',
      'and',
      '42',
    ]);
  });

  it('中文：漢字串斷詞，兩個字以上、不是不用詞的詞；與英數混排時照出現順序', () => {
    const seg = fakeSegmenter(['調查員', '來到', '海邊', '我們', '小鎮', '發現']);
    expect(sentenceWords('調查員們來到海邊，我們發現NASA小鎮', true, seg)).toEqual([
      '調查員',
      '來到',
      '海邊',
      'NASA',
      '小鎮',
    ]);
  });

  it('中文的候選：出現次數、句子（不重複）、代表提示', () => {
    const seg = fakeSegmenter(['地下室', '鑰匙', '打開']);
    const words = extractWords(
      'KP：地下室的門鎖著。\nA：用鑰匙打開地下室吧！\nKP：地下室的門鎖著。',
      { segmentHan: seg },
    );
    expect(words.map((w) => [w.answer, w.count, w.sentences])).toEqual([
      ['地下室', 3, ['用鑰匙打開地下室吧！', '地下室的門鎖著。']],
      ['鑰匙', 1, ['用鑰匙打開地下室吧！']],
      ['打開', 1, ['用鑰匙打開地下室吧！']],
    ]);
    expect(words[0].hint).toBe('用鑰匙打開地下室吧！');
  });

  it('代表提示：120 字以內由長到短，超過 120 字的由短到長排在後面', () => {
    const long = (n: number) => 'x'.repeat(n);
    expect(sortHints([long(10), long(200), long(30), long(121), long(120)])).toEqual([
      long(120),
      long(30),
      long(10),
      long(121),
      long(200),
    ]);
  });

  it('範例日誌（Node 的斷詞）找得到常見的詞', () => {
    const answers = extractWords(SAMPLE_TEXT).map((w) => w.answer);
    for (const w of ['地下室', '電話', '圖書館', '神父']) expect(answers).toContain(w);
    for (const w of ['主場景', 'KP']) expect(answers).not.toContain(w);
  });
});

describe('排列（3.4～3.6）', () => {
  const cand = (answer: string, hint = `${answer} 的提示句子。`) => ({
    answer,
    sentences: [hint],
    hint,
    count: 1,
  });

  it('洗牌與候選池用掉的亂數個數與原作相同（池：每個候選一個；洗牌：n − 1 個）', () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.5;
    };
    shuffle([1, 2, 3, 4], rng);
    expect(calls).toBe(3);
    calls = 0;
    weightedPool(
      [cand('ab'), cand('cd'), cand('ef')],
      { target: 5, freqWeight: 50, lenWeight: 50 },
      rng,
    );
    expect(calls).toBe(3);
  });

  it('候選池取前「目標 × 3」個', () => {
    const words = Array.from({ length: 20 }, (_, i) => cand(`w${i}x`));
    expect(
      weightedPool(words, { target: 5, freqWeight: 0, lenWeight: 0 }, seededRng(1)),
    ).toHaveLength(15);
  });

  it('只放在能交叉的位置；空格兩側不能有字；同一格開始的詞共用號碼', () => {
    const placed = placeWords([cand('cat'), cand('car'), cand('tar')], 3, seededRng(3));
    const p = finishPuzzle(
      placed,
      placed.map((x) => x.word.hint),
    );
    expectConsistent(p);
    expect(p.words).toHaveLength(3);
    const lists = clueLists(p);
    expect(lists.across.length + lists.down.length).toBe(3);
    for (const l of [lists.across, lists.down])
      for (let i = 1; i < l.length; i++) expect(l[i].num).toBeGreaterThanOrEqual(l[i - 1].num);
  });

  it('沒有候選、找不到單字時沒有盤面', () => {
    expect(
      buildFromCandidates([], { target: 5, freqWeight: 50, lenWeight: 50 }, seededRng(1)).puzzle,
    ).toBeNull();
    expect(buildFromEntries([], seededRng(1)).puzzle).toBeNull();
  });

  it('自己列答案：排不進去的答案列出來（和其他答案沒有共同的字）', () => {
    const { entries } = parseList('地下室：a\n下水道：b\n貓咪：c');
    const r = buildFromEntries(entries, seededRng(2));
    expect(r.puzzle?.words.map((w) => w.answer).sort()).toEqual(['下水道', '地下室']);
    expect(r.unplaced).toEqual(['貓咪']);
    expect(r.found).toBe(3);
  });
});

describe('自己列答案的格式（3.1）', () => {
  it('分隔：全形／半形冒號、Tab、｜（取最先出現的）；答案裡的空白拿掉', () => {
    const r = parseList('暗門：藏在書架後：面\nNew York: city\n密 室\t鎖住的房間\n墓地｜a|b\n\n  ');
    expect(r.entries.map((e) => [e.answer, e.hint, e.line])).toEqual([
      ['暗門', '藏在書架後：面', 1],
      ['NewYork', 'city', 2],
      ['密室', '鎖住的房間', 3],
      ['墓地', 'a|b', 4],
    ]);
  });

  it('太短、重複、沒有提示', () => {
    const r = parseList('a：x\n地下室：甲\n地下室：乙\n暗門\n：沒有答案');
    expect(r.entries.map((e) => e.answer)).toEqual(['地下室', '暗門']);
    expect(r.tooShort).toEqual([1, 5]);
    expect(r.duplicates).toEqual(['地下室']);
    expect(r.noHint).toEqual(['暗門']);
  });
});

describe('提示的遮蔽（3.6）', () => {
  it('題目：每個字一個 ○；解答：標出答案；沒有出現時整句照原樣', () => {
    expect(hintRuns('打開地下室的門，地下室很暗。', '地下室', false)).toEqual([
      { text: '打開', answer: false },
      { text: '○○○', answer: true },
      { text: '的門，', answer: false },
      { text: '○○○', answer: true },
      { text: '很暗。', answer: false },
    ]);
    expect(hintRuns('暗門', '暗門', true)).toEqual([{ text: '暗門', answer: true }]);
    expect(hintRuns('沒有', '暗門', false)).toEqual([{ text: '沒有', answer: false }]);
    expect(hintRuns('', '暗門', false)).toEqual([{ text: '', answer: false }]);
    /* 答案裡的符號照字面比對 */
    expect(hintRuns('a.b axb', 'a.b', false)[0]).toEqual({ text: '○○○', answer: true });
  });
});

describe('開頁的範例（sample.ts）', () => {
  it('12 個答案全部排進去，格子一致、號碼從 1 起', () => {
    const d = initialData();
    expect(d.mode).toBe('list');
    expect(d.list).toBe(SAMPLE_LIST);
    expect(d.puzzle?.words).toHaveLength(12);
    expect(d.stats?.unplaced).toEqual([]);
    if (d.puzzle) {
      expectConsistent(d.puzzle);
      expect(Math.min(...d.puzzle.words.map((w) => w.num))).toBe(1);
      expect([d.puzzle.width, d.puzzle.height]).toEqual([9, 12]);
    }
    expect(d.stats?.key).toBe(inputKey(d));
    /* 每次都一樣 */
    expect(initialData()).toEqual(d);
  });
});

describe('讀回時的整理（3.8）', () => {
  const base = initialData();

  it('缺的、壞掉的欄位用預設值；數值夾在範圍內', () => {
    const d = sanitizeData(
      {
        mode: 'text',
        wordCount: 999,
        freqWeight: -3,
        lenWeight: 'x',
        emptyColor: 'red',
        layout: 'col',
        fonts: { title: { source: 'google', family: 'Noto Serif TC', weight: 700 } },
      },
      base,
    );
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.mode).toBe('text');
    expect(d.wordCount).toBe(100);
    expect(d.freqWeight).toBe(0);
    expect(d.lenWeight).toBe(50);
    expect(d.emptyColor).toBe(DEFAULT_EMPTY_COLOR);
    expect(d.layout).toBe('col');
    expect(d.fonts.title).toEqual({ source: 'google', family: 'Noto Serif TC', weight: 700 });
    expect(d.fonts.grid.family).toBe('Noto Sans TC');
    expect(d.puzzle).toEqual(base.puzzle);
    expect(sanitizeData('x', base)).toBeNull();
  });

  it('盤面不合理（超出範圍、交叉的字不同）時當作沒有盤面', () => {
    const ok: Puzzle = {
      width: 3,
      height: 2,
      words: [
        { answer: 'abc', hint: '', x: 0, y: 0, dir: 'across', num: 1 },
        { answer: 'bd', hint: '', x: 1, y: 0, dir: 'down', num: 2 },
      ],
    };
    expect(cleanPuzzle(ok)).toEqual(ok);
    expect(cleanPuzzle({ ...ok, width: 2 })).toBeNull();
    expect(
      cleanPuzzle({ ...ok, words: [ok.words[0], { ...ok.words[1], answer: 'xd' }] }),
    ).toBeNull();
    expect(cleanPuzzle({ ...ok, words: [] })).toBeNull();
    expect(sanitizeData({ ...base, puzzle: { ...ok, width: 2 } }, base)?.puzzle).toBeNull();
  });

  it('inputKey：來源或設定改了就不同（清單模式不看單字數與比重）', () => {
    const k = inputKey(base);
    expect(inputKey({ ...base, list: `${base.list}\n墓碑：a` })).not.toBe(k);
    expect(inputKey({ ...base, wordCount: 10 })).toBe(k);
    const t = { ...base, mode: 'text' as const };
    expect(inputKey({ ...t, wordCount: 10 })).not.toBe(inputKey(t));
  });

  it('標題空白時用「填字遊戲」；自動儲存的文字上限', () => {
    expect(titleOrDefault('  ')).toBe('填字遊戲');
    expect(AUTOSAVE_TEXT_LIMIT).toBe(300_000);
  });
});
