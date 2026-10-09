/**
 * 劇本文字產生器的解析規則（規格 3.2）。預期值與原作 parse.v1.js（英韓介面的引號規則）相同；
 * 不同的只有 D1（名：「台詞」的冒號）。實作時以原作的 parse.v1.js 對照 24,960 組輸入×讀取方式，只有 D1 的 448 組不同。
 */
import { describe, expect, it } from 'vitest';
import { defaultOpts, type Opts, type Speaker } from '@/tools/scenario-text/model';
import {
  headingOf,
  key,
  MAX_JOIN,
  openQuotes,
  parseScenario,
  resolveName,
  speakerIndex,
  splitUnits,
  unknownNames,
} from '@/tools/scenario-text/parse';
import { SAMPLES } from '@/tools/scenario-text/strings';

const speakers: Speaker[] = [
  {
    id: 'a',
    name: '艾莉絲',
    aliases: '小艾、艾莉',
    imageId: null,
    faces: [
      { id: 'f1', label: '笑臉', imageId: null },
      { id: 'f2', label: '不安', imageId: null },
    ],
  },
  { id: 'b', name: '鮑伯', aliases: 'Bob, ボブ', imageId: null, faces: [] },
  { id: 'c', name: 'Alice (アリス)', aliases: '', imageId: null, faces: [] },
];

const opts = (patch: Partial<Opts> = {}): Opts => ({ ...defaultOpts(), ...patch });
const brief = (script: string, o: Partial<Opts> = {}) =>
  parseScenario(script, speakers, opts(o)).map((e) => [e.kind, e.title, e.text, e.face, e.line]);

describe('名稱（3.2.1）', () => {
  it('key：NFKC、連續空白、去頭尾', () => {
    expect(key('  ＡＢ　　c  ')).toBe('AB c');
    expect(key('艾莉絲（笑臉）')).toBe('艾莉絲(笑臉)');
  });

  it('名稱與其他寫法都認得；先登錄的優先', () => {
    const idx = speakerIndex([...speakers, { ...speakers[1], id: 'b2', name: '小艾' }]);
    expect(resolveName('小艾', idx)?.speaker.id).toBe('a');
    expect(resolveName('Bob', idx)?.speaker.id).toBe('b');
    expect(resolveName('ボブ', idx)?.speaker.id).toBe('b');
  });

  it('差分：括號、@、全形＠；沒登錄的差分照寫法', () => {
    const idx = speakerIndex(speakers);
    expect(resolveName('艾莉絲（笑臉）', idx)).toMatchObject({ face: '笑臉', faceMissing: false });
    expect(resolveName('艾莉(笑臉)', idx)).toMatchObject({ face: '笑臉', faceMissing: false });
    expect(resolveName('小艾@笑臉', idx)).toMatchObject({ face: '笑臉', faceMissing: false });
    expect(resolveName('艾莉絲 ＠ 哭', idx)).toMatchObject({ face: '哭', faceMissing: true });
    expect(resolveName('路人（笑臉）', idx)).toBeNull();
  });

  it('名稱本身帶括號時先比整個名字', () => {
    const idx = speakerIndex(speakers);
    expect(resolveName('Alice (アリス)', idx)).toMatchObject({ face: '', faceMissing: false });
    expect(resolveName('Alice  (アリス)', idx)?.speaker.id).toBe('c');
    /* 空白不同時 key 不同，拆成「Alice」＋差分，找不到說話者 */
    expect(resolveName('Alice(アリス)', idx)).toBeNull();
  });
});

describe('台本：一則的切法（3.2.2）', () => {
  it('還沒關上的引號', () => {
    expect(openQuotes('「a『b')).toBe(2);
    expect(openQuotes('「a」')).toBe(0);
    expect(openQuotes('“a')).toBe(1);
    expect(openQuotes('"a" "b')).toBe(1);
  });

  it('一行一則：引號沒關上時接下一行（含空行），最多再接 20 行', () => {
    expect(splitUnits('艾莉絲「一\n\n二」\n三', 'line')).toEqual([
      { text: '艾莉絲「一\n\n二」', line: 1 },
      { text: '三', line: 4 },
    ]);
    const long = `艾莉絲「開始\n${Array.from({ length: 25 }, (_, i) => `${i}`).join('\n')}`;
    const units = splitUnits(long, 'line');
    expect(units[0].text.split('\n')).toHaveLength(MAX_JOIN + 1);
    expect(units).toHaveLength(1 + 25 - MAX_JOIN);
  });

  it('空行分隔的一段一則；行尾空白去掉、CRLF 當 LF', () => {
    expect(splitUnits('a  \r\nb\r\n\r\n\r\nc', 'block')).toEqual([
      { text: 'a\nb', line: 1 },
      { text: 'c', line: 5 },
    ]);
  });
});

describe('台本：台詞與旁白（3.2.3）', () => {
  it('範例台本（自動、保留引號、放進旁白）', () => {
    expect(brief(SAMPLES.script)).toEqual([
      ['speaker', '艾莉絲', '「欸，這棟宅子真的沒有人住嗎？」', '', 1],
      ['speaker', '鮑伯', '「應該是吧。聽說十年前就空著了。」', '', 2],
      ['narration', '', '門的另一頭隱約傳來腳步聲。', '', 3],
      ['speaker', '艾莉絲', '「……剛剛那個，你聽到了嗎？」', '不安', 4],
      ['speaker', '鮑伯', '真希望是我聽錯了。', '', 5],
    ]);
  });

  it('標題一律是登錄的名稱；未登錄照寫法', () => {
    expect(brief('小艾「嗨」\n路人「你好」')).toEqual([
      ['speaker', '艾莉絲', '「嗨」', '', 1],
      ['unknown', '路人', '「你好」', '', 2],
    ]);
    const list = parseScenario('路人「一」\n路 人「二」\n路人「三」\n甲「四」', speakers, opts());
    expect(unknownNames(list)).toEqual(['路人', '路 人', '甲']);
  });

  it('自動的冒號台詞只認登錄的名字；只認冒號時都算', () => {
    expect(brief('時間：晚上九點\n鮑伯 ： 嗯')).toEqual([
      ['narration', '', '時間：晚上九點', '', 1],
      ['speaker', '鮑伯', '嗯', '', 2],
    ]);
    expect(brief('時間：晚上九點', { style: 'colon' })).toEqual([
      ['unknown', '時間', '晚上九點', '', 1],
    ]);
    expect(brief('鮑伯：嗯', { style: 'quote' })).toEqual([['narration', '', '鮑伯：嗯', '', 1]]);
  });

  it('名字有句讀、超過 40 字時是敘述', () => {
    expect(brief('他看著窗外，說「要下雨了。」')[0][0]).toBe('narration');
    expect(brief(`${'名'.repeat(41)}「台詞」`)[0][0]).toBe('narration');
    expect(brief(`${'名'.repeat(40)}「台詞」`)[0][0]).toBe('unknown');
  });

  it('拉丁引號（"…" “…”）；引號前超過 4 個詞是句子', () => {
    expect(brief('Bob "Hello"\nBob “Hi”')).toEqual([
      ['speaker', '鮑伯', '"Hello"', '', 1],
      ['speaker', '鮑伯', '“Hi”', '', 2],
    ]);
    expect(brief('One two three four five "quote"')[0][0]).toBe('narration');
    expect(brief('One two three four "quote"')[0][0]).toBe('unknown');
    /* 「」不受詞數限制 */
    expect(brief('One two three four five「quote」')[0][0]).toBe('unknown');
  });

  it('不保留引號時去掉頭尾各一個字；冒號台詞不受影響', () => {
    expect(brief('艾莉絲『引號裡有「巢狀」』\n鮑伯：「冒號」', { keepQuotes: false })).toEqual([
      ['speaker', '艾莉絲', '引號裡有「巢狀」', '', 1],
      ['speaker', '鮑伯', '冒號', '', 2],
    ]);
  });

  it('D1：名：「台詞」的冒號去掉（原作當成名為「名：」的未登錄說話者）', () => {
    expect(brief('艾莉絲：「你好」\n路人: "Hi"')).toEqual([
      ['speaker', '艾莉絲', '「你好」', '', 1],
      ['unknown', '路人', '"Hi"', '', 2],
    ]);
  });

  it('旁白：不放時略過；旁白的名稱是說話者時帶他與差分', () => {
    expect(brief('門開了。\n艾莉絲「嗨」', { narration: 'skip' })).toEqual([
      ['speaker', '艾莉絲', '「嗨」', '', 2],
    ]);
    const list = parseScenario('門開了。', speakers, opts({ narratorName: '小艾@笑臉' }));
    expect(list[0]).toMatchObject({
      kind: 'narration',
      title: '小艾@笑臉',
      speakerId: 'a',
      face: '笑臉',
    });
  });

  it('跨行的台詞（一行一則）與一段一則', () => {
    expect(brief('艾莉絲「第一行\n第二行」\n旁白')).toEqual([
      ['speaker', '艾莉絲', '「第一行\n第二行」', '', 1],
      ['narration', '', '旁白', '', 3],
    ]);
    expect(brief('艾莉絲「一」\n鮑伯「二」\n\n旁白', { unit: 'block' })).toEqual([
      /* 名字不能含引號，所以引號從第一個「到最後一個」 */
      ['speaker', '艾莉絲', '「一」\n鮑伯「二」', '', 1],
      ['narration', '', '旁白', '', 4],
    ]);
  });
});

describe('依小標分段（3.2.4）', () => {
  it('小標的格式', () => {
    expect(headingOf('■圖書館')).toBe('圖書館');
    expect(headingOf('  ★ 書房  ')).toBe('書房');
    expect(headingOf('【地下室】')).toBe('地下室');
    expect(headingOf('## 閣樓 ##')).toBe('閣樓');
    expect(headingOf('###### 六')).toBe('六');
    expect(headingOf('####### 七')).toBe('# 七');
    expect(headingOf('■')).toBeNull();
    expect(headingOf('#')).toBeNull();
    expect(headingOf('文字【不是小標】')).toBeNull();
  });

  it('範例：本文去頭尾空行、中間空行保留；說話者名稱的小標帶他', () => {
    const list = parseScenario(SAMPLES.heading, speakers, opts({ mode: 'heading' }));
    expect(list.map((e) => [e.kind, e.title, e.text, e.speakerId, e.line])).toEqual([
      [
        'heading',
        '圖書館',
        '舊報紙塞滿了整排書架。\n《圖書館使用》檢定成功的話，會找到十年前那場火災的報導。',
        null,
        1,
      ],
      ['heading', '書房', '桌上放著一個上了鎖的小盒子。', null, 5],
      ['heading', '艾莉絲', '（艾莉絲寄來的信）明天晚上，我在宅子的後門等你。', 'a', 8],
    ]);
  });

  it('小標之前的文字、本文空白時本文＝小標、小標用其他寫法與差分', () => {
    const list = parseScenario(
      '\n前言\n\n■空的\n\n■小艾（笑臉）\n  縮排\n\n中間\n\n',
      speakers,
      opts({ mode: 'heading', narratorName: 'GM' }),
    );
    expect(list.map((e) => [e.kind, e.title, e.text, e.face, e.bare, e.line])).toEqual([
      ['narration', 'GM', '前言', '', false, 2],
      ['heading', '空的', '空的', '', true, 4],
      ['heading', '艾莉絲', '  縮排\n\n中間', '笑臉', false, 6],
    ]);
  });

  it('依小標分段不看台本的讀取方式', () => {
    const a = parseScenario('■A\nb', speakers, opts({ mode: 'heading' }));
    const b = parseScenario(
      '■A\nb',
      speakers,
      opts({ mode: 'heading', narration: 'skip', style: 'colon', unit: 'block' }),
    );
    expect(b).toEqual(a);
  });
});
