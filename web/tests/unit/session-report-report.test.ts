/**
 * 團報產生器：從表單整理資料（規格 3.1）、17 種範本的資料部件序列（3.2）、文字樣式套用的範圍（3.3）、
 * 作者行（3.4）、整理（3.5）。
 */
import { describe, expect, it } from 'vitest';
import { defaultSettings, type ReportSettings } from '@/tools/session-report/model';
import { STYLED_KINDS } from '@/tools/session-report/parts';
import {
  authorLine,
  collectReportData,
  insertAuthorLine,
  joinParts,
  renderReport,
  SAMPLE,
  sampleLetter,
  slotFor,
  tidyReport,
  todayText,
  withHonorific,
} from '@/tools/session-report/report';
import { buildParts, TEMPLATE_IDS, TEMPLATES } from '@/tools/session-report/templates';

const TODAY = '2026/10/3';

function settings(patch: Partial<ReportSettings> = {}): ReportSettings {
  return { ...defaultSettings(), ...patch };
}

const gm = (role: string, name: string, id = name) =>
  ({ id: `g-${id}`, role, name }) as ReportSettings['gms'][number];
const pl = (pc: string, plName: string, ho = '', id = `${pc}${plName}`) => ({
  id: `p-${id}`,
  ho,
  pc,
  pl: plName,
});

describe('整理資料（3.1）', () => {
  it('空白欄位用範例值；日期空白時用今天', () => {
    const d = collectReportData(settings(), TODAY);
    expect(d).toMatchObject({
      system: 'Call of Cthulhu',
      scenario: SAMPLE.scenario,
      author: '',
      result: SAMPLE.result,
      date: TODAY,
      tags: '',
      plFirst: false,
    });
    expect(d.gms).toEqual([{ role: 'KP', name: SAMPLE.gm }]);
    expect(d.players).toEqual([{ slot: 'HO1', ho: '', pc: '角色A', pl: '玩家A' }]);
  });

  it('自行輸入的系統：去頭尾空白，空白時用範例值', () => {
    expect(
      collectReportData(settings({ system: 'custom', customSystem: ' 迷宮王國 ' }), TODAY).system,
    ).toBe('迷宮王國');
    expect(
      collectReportData(settings({ system: 'custom', customSystem: '  ' }), TODAY).system,
    ).toBe(SAMPLE.system);
    expect(collectReportData(settings({ system: 'double_cross' }), TODAY).system).toBe(
      '雙重十字 The 3rd Edition',
    );
  });

  it('範例值的編號：A～I，第 10 列以後用數字', () => {
    expect(Array.from({ length: 11 }, (_, i) => sampleLetter(i)).join(',')).toBe(
      'A,B,C,D,E,F,G,H,I,10,11',
    );
  });

  it('敬稱：加在主持人與 PL（含範例值），不加在 PC；已經結尾的不重複', () => {
    const d = collectReportData(
      settings({
        honorific: 'sama',
        gms: [gm('KP', ''), gm('GM', '阿德樣'), gm('DL', '  ')],
        players: [pl('溫書亭', '米可'), pl('', '')],
      }),
      TODAY,
    );
    expect(d.gms).toEqual([
      { role: 'KP', name: `${SAMPLE.gm}樣` },
      { role: 'GM', name: '阿德樣' },
    ]);
    expect(d.players.map((p) => [p.pc, p.pl])).toEqual([
      ['溫書亭', '米可樣'],
      ['角色B', '玩家B樣'],
    ]);
    expect(withHonorific(' 王 ', '桑')).toBe('王桑');
    expect(withHonorific('', '桑')).toBe('');
    expect(withHonorific('王', '')).toBe('王');
  });

  it('一列都沒有時：範例主持人（KP）、範例參加者（HO1），都不加敬稱', () => {
    const d = collectReportData(
      settings({ honorific: 'san', gms: [], players: [], slot: 'PC' }),
      TODAY,
    );
    expect(d.gms).toEqual([{ role: 'KP', name: SAMPLE.gm }]);
    expect(d.players).toEqual([{ slot: 'HO1', ho: '', pc: '角色A', pl: '玩家A' }]);
  });

  it('標記由第一列決定；名字順序：第一列 PL/PC、PC/PL 優先，其他依輸入順序', () => {
    expect(['PC', 'PC1', 'HO1', 'PC/PL', 'PL/PC', '自由'].map((b) => slotFor(b, 3))).toEqual([
      'PC',
      'PC3',
      'HO3',
      'PC/PL',
      'PL/PC',
      '自由',
    ]);
    const order = (slot: ReportSettings['slot'], nameOrder: ReportSettings['nameOrder']) =>
      collectReportData(settings({ slot, nameOrder }), TODAY).plFirst;
    expect(order('PL/PC', 'pcpl')).toBe(true);
    expect(order('PC/PL', 'plpc')).toBe(false);
    expect(order('HO1', 'plpc')).toBe(true);
    expect(order('自由', 'pcpl')).toBe(false);
  });

  it('今天的日期：YYYY/M/D，月日不補零', () => {
    expect(todayText(new Date(2026, 0, 5))).toBe('2026/1/5');
  });
});

/** 測試用的資料：2 位主持人（KP、GM）、2 位參加者（第 2 位有 HO 補充），有作者與主題標籤 */
function sample(patch: Partial<ReportSettings> = {}) {
  return collectReportData(
    settings({
      author: '王小明',
      hashtags: '#團報',
      gms: [gm('KP', 'G1'), gm('GM', 'G2')],
      players: [pl('C1', 'L1'), pl('C2', 'L2', 'H2')],
      ...patch,
    }),
    TODAY,
  );
}

const kinds = (id: string, patch: Partial<ReportSettings> = {}) =>
  buildParts(id, sample(patch))
    .filter((p) => p.kind !== 'text' && p.value)
    .map((p) =>
      p.kind === 'header' ? `header:${p.value.replace(/[^PCLK]/g, '')}` : `${p.kind}:${p.value}`,
    );

const GMS = ['role:KP', 'gm:G1', 'role:GM', 'gm:G2'];
const PLAYERS = ['slot:HO1', 'pc:C1', 'pl:L1', 'slot:HO2', 'ho:H2', 'pc:C2', 'pl:L2'];
const ROSTER = ['pc:C1', 'pl:L1', 'pc:C2', 'pl:L2'];
const SYS = ['system:Call of Cthulhu', `scenario:${SAMPLE.scenario}`];
const TAIL = [`result:${SAMPLE.result}`, `date:${TODAY}`, 'tags:#團報'];
const BASIC = [...SYS, ...GMS, 'header:PCPL', ...PLAYERS, ...TAIL];

describe('17 種範本的資料部件序列（3.2）', () => {
  it('17 種、id 不重複', () => {
    expect(TEMPLATES).toHaveLength(17);
    expect(new Set(TEMPLATE_IDS).size).toBe(17);
  });

  it.each([
    [1, BASIC],
    [2, [...SYS, ...GMS, 'header:PCPL', ...PLAYERS, `result:${SAMPLE.result}`, 'tags:#團報']],
    [3, BASIC],
    [4, BASIC],
    [5, BASIC],
    [6, BASIC],
    [7, BASIC],
    [
      8,
      [
        ...SYS,
        'header:KPCKP',
        'gm:G1',
        'header:PCPL',
        'pc:C1',
        'pl:L1',
        `date:${TODAY}`,
        `result:${SAMPLE.result}`,
        'tags:#團報',
      ],
    ],
    [
      9,
      [
        ...SYS,
        `date:${TODAY}`,
        ...GMS,
        'header:PCPL',
        ...PLAYERS,
        `result:${SAMPLE.result}`,
        'tags:#團報',
      ],
    ],
    [10, BASIC],
    [11, BASIC],
    [12, [...SYS, ...GMS, 'header:PCPL', ...ROSTER, ...TAIL]],
    [13, BASIC],
    [14, [...SYS, 'author:作者：王小明老師', ...GMS, 'header:PCPL', ...ROSTER, ...TAIL]],
    [15, [...SYS, 'role:KP', 'gm:G1', 'gm:G2', 'header:PCPL', ...PLAYERS, ...TAIL]],
    [16, [...SYS, ...GMS, ...PLAYERS, ...TAIL]],
    [17, [...SYS, 'role:KP', 'gm:G1', 'gm:G2', 'header:PCPL', ...ROSTER, ...TAIL]],
  ])('第 %i 種', (n, want) => {
    expect(kinds(TEMPLATE_IDS[n - 1])).toEqual(want);
  });

  it('PL 在前：名字與標題都對調', () => {
    expect(kinds('standard', { nameOrder: 'plpc' })).toEqual([
      ...SYS,
      ...GMS,
      'header:PLPC',
      'slot:HO1',
      'pl:L1',
      'pc:C1',
      'slot:HO2',
      'ho:H2',
      'pl:L2',
      'pc:C2',
      ...TAIL,
    ]);
  });

  it('標記是 PC/PL、自由時不寫標記，也不寫 HO 補充', () => {
    for (const slot of ['PC/PL', '自由'] as const)
      expect(kinds('standard', { slot })).toEqual([
        ...SYS,
        ...GMS,
        'header:PCPL',
        ...ROSTER,
        ...TAIL,
      ]);
  });

  it('第 15、17 種的身分寫第一位主持人的身分（新版，5. D3）', () => {
    const gms = [gm('DL', 'G1'), gm('GM', 'G2')];
    expect(kinds('notebook', { gms })[2]).toBe('role:DL');
    expect(kinds('ribbon', { gms })[2]).toBe('role:DL');
  });
});

describe('文字樣式與輸出', () => {
  it('樣式部件：系統、身分、標題、標記、HO、結果、日期', () => {
    expect([...STYLED_KINDS].sort()).toEqual([
      'date',
      'header',
      'ho',
      'result',
      'role',
      'slot',
      'system',
    ]);
    const text = joinParts(
      [
        { kind: 'system', value: 'CoC' },
        { kind: 'text', value: ' A ' },
        { kind: 'pc', value: 'Ann' },
        { kind: 'tags', value: '#A' },
        { kind: 'ho', value: '' },
      ],
      'serifBold',
    );
    expect(text).toBe('𝐂𝐨𝐂 A Ann#A');
  });

  it('預設設定、第 1 種範本的全文', () => {
    expect(renderReport(settings(), TODAY)).toBe(
      [
        '𝘾𝙖𝙡𝙡 𝙤𝙛 𝘾𝙩𝙝𝙪𝙡𝙝𝙪',
        `《${SAMPLE.scenario}》`,
        '',
        `𝙆𝙋｜${SAMPLE.gm}`,
        '',
        '𝙋𝘾/𝙋𝙇',
        '𝙃𝙊𝟭｜角色A ／ 玩家A',
        '',
        '𝙀𝙉𝘿 全員生還',
        '',
        '𝟮𝟬𝟮𝟲/𝟭𝟬/𝟯',
      ].join('\n'),
    );
  });

  it('每一種範本：沒有行尾半形空白、沒有連續空行、頭尾沒有空白；作者行只出現一次、在劇本下一行', () => {
    for (const id of TEMPLATE_IDS) {
      for (const fontStyle of ['sansBoldItalic', 'plain'] as const) {
        const s = settings({
          template: id,
          fontStyle,
          author: '王小明',
          scenario: '霧港',
          gms: [gm('KP', 'G1'), gm('GM', 'G2')],
          players: [pl('C1', 'L1'), pl('C2', 'L2', 'H2')],
        });
        const out = renderReport(s, TODAY);
        expect(out, id).not.toMatch(/[ \t]$/m);
        expect(out, id).not.toMatch(/\n\n\n/);
        expect(out, id).toBe(out.trim());
        expect(out.split('作者：王小明老師').length - 1, id).toBe(1);
        const lines = out.split('\n');
        const at = lines.findIndex((l) => l.includes('霧港'));
        expect(lines[at + 1].trim(), id).toBe('作者：王小明老師');
      }
    }
  });

  it('主題標籤空白時，最後一行不留空白', () => {
    for (const id of TEMPLATE_IDS)
      expect(renderReport(settings({ template: id }), TODAY).endsWith('\n')).toBe(false);
  });
});

describe('作者行（3.4）', () => {
  it.each([
    ['', ''],
    ['  ', ''],
    ['王小明', '作者：王小明老師'],
    ['王小明 老師', '作者：王小明老師'],
    ['王小明　老師', '作者：王小明老師'],
    ['米可さん', '作者：米可さん'],
    ['米可 様', '作者：米可様'],
    ['阿德桑', '作者：阿德桑'],
    ['某某 氏', '作者：某某氏'],
    ['作:王', '作：王'],
    ['作者:王', '作者：王'],
    ['作者：王', '作者：王'],
    ['作：王 様', '作：王様'],
  ])('「%s」→「%s」', (input, want) => {
    expect(authorLine(input)).toBe(want);
  });

  it('插在第一個含劇本名稱的行下面；已經有、劇本空白、找不到時不插', () => {
    expect(insertAuthorLine('A\n劇本X\nB\n劇本X', '作者：甲', '劇本X')).toBe(
      'A\n劇本X\n作者：甲\nB\n劇本X',
    );
    expect(insertAuthorLine('A\n作者：甲\n劇本X', '作者：甲', '劇本X')).toBe('A\n作者：甲\n劇本X');
    expect(insertAuthorLine('A\nB', '作者：甲', '劇本X')).toBe('A\nB');
    expect(insertAuthorLine('A\nB', '作者：甲', '')).toBe('A\nB');
    expect(insertAuthorLine('劇本X\n\n\nC', '作者：甲', '劇本X')).toBe('劇本X\n作者：甲\n\nC');
  });
});

describe('整理（3.5）', () => {
  it('只拿掉行尾的半形空白與 Tab；連續換行縮成一個空行；去頭尾空白', () => {
    expect(tidyReport('　 a \t\n b　 \n\n\n\nc\n\n')).toBe('a\n b　\n\nc');
  });
});
