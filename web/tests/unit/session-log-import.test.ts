/**
 * 跑團紀錄簿的匯入：試算表（3.8.1～3.8.4）、範本 CSV（3.11）、團報文字與清單文字（3.8.5）。
 */
import { describe, expect, it } from 'vitest';
import { parseDelimited } from '@/core/csv';
import { type SessionRow, selfNameSet } from '@/core/sessions';
import { parseListExport, parseReportText } from '../../src/tools/session-log/importReport';
import {
  applySelfRole,
  buildRowFromCells,
  buildSheetRows,
  coerceImportValues,
  countDuplicates,
  detectSheet,
  dropDuplicates,
  existingDupKeys,
  finishPartialRows,
  guessFieldForHeader,
  normalizeHeaderCell,
  sessionDupKey,
  sheetRowToSession,
  TEMPLATE_FIELDS,
  templateCsv,
} from '../../src/tools/session-log/importSheet';

const SELF = selfNameSet('阿德');
const pick = (r: SessionRow, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k]]));

describe('標題辨識（3.8.1）', () => {
  it('完全相等優先，其次是包含（兩個字以上的別名）', () => {
    expect(guessFieldForHeader('日期')).toBe('date');
    expect(guessFieldForHeader('シナリオ名')).toBe('scenario');
    expect(guessFieldForHeader('Title')).toBe('scenario');
    expect(guessFieldForHeader('GM / KP')).toBe('gm');
    expect(guessFieldForHeader('PC・PL 1')).toBe('players');
    expect(guessFieldForHeader('備註・簡短感想')).toBe('note');
    expect(guessFieldForHeader('感想（ネタバレ注意）')).toBe('longNote');
    expect(guessFieldForHeader('Session URL')).toBe('sessionUrl');
    expect(guessFieldForHeader('劇本計數鍵')).toBe('scenarioCountKey');
    expect(guessFieldForHeader('我的劇本清單')).toBe('scenario');
    expect(guessFieldForHeader('完全無關')).toBe('');
    expect(guessFieldForHeader('')).toBe('');
  });

  it('Notion 的小型大寫標題', () => {
    expect(normalizeHeaderCell('ᴛɪᴛʟᴇ')).toBe('title');
    expect(guessFieldForHeader('ᴅᴀᴛᴇ')).toBe('date');
  });

  it('KP／PL 欄：值全是是非值時是身分旗標，否則是人名欄', () => {
    expect(guessFieldForHeader('KP', ['✓', '', 'no'])).toBe('roleKp');
    expect(guessFieldForHeader('PL', ['yes', 'No'])).toBe('rolePl');
    expect(guessFieldForHeader('KP', ['小林'])).toBe('gm');
    expect(guessFieldForHeader('PL', [])).toBe('players');
  });

  it('辨識出 ≥ min(2, 欄數) 欄時第一列是標題；否則全部是資料', () => {
    const g = detectSheet(parseDelimited('日期\t劇本名稱\t不明\n2026-01-01\t霧港\tx\n\t\t\n'));
    expect(g).toEqual({
      columns: ['日期', '劇本名稱', '不明'],
      mapping: ['date', 'scenario', ''],
      rows: [['2026-01-01', '霧港', 'x']],
      hasHeader: true,
    });
    const n = detectSheet(parseDelimited('霧港,2026-01-01\n雨夜'));
    expect(n).toEqual({
      columns: ['第 1 欄', '第 2 欄'],
      mapping: ['', ''],
      rows: [
        ['霧港', '2026-01-01'],
        ['雨夜', ''],
      ],
      hasHeader: false,
    });
    expect(detectSheet([])).toBeNull();
  });
});

describe('一列 → 一團（3.8.2）', () => {
  it('同一欄位多欄以「 / 」連接；KP 旗標的肯定值變成身分', () => {
    expect(
      buildRowFromCells(
        ['阿德', ' 米可 ', '', '✓', 'yes'],
        ['players', 'players', 'pc', 'roleKp', 'rolePl'],
      ),
    ).toEqual({ players: '阿德 / 米可', role: 'KP' });
  });

  it('值的整理：日期、系統、狀態、生還、身分、時間、「｜」', () => {
    expect(
      coerceImportValues({
        date: '2025/12/6, 2025/12/13',
        system: '新クトゥルフ',
        status: '延續',
        survival: '撕卡',
        role: '守密人',
        time: '3:30',
        players: '阿德｜米可｜｜',
        gm: '｜小林',
      }),
    ).toEqual({
      date: '2025-12-06',
      dates: ['2025-12-06', '2025-12-13'],
      system: 'CoC 7版',
      status: '継続',
      survival: 'ロスト',
      role: 'KP',
      time: '3.5',
      players: '阿德、米可',
      gm: '小林',
    });
  });

  it('沒有身分時依自己的名字推測', () => {
    expect(applySelfRole({ players: '米可、阿德' }, SELF).role).toBe('PL');
    expect(applySelfRole({ gm: '阿德' }, SELF).role).toBe('KP');
    expect(applySelfRole({ gm: '阿德、小林' }, SELF).role).toBe('PL');
    expect(applySelfRole({ scenario: '霧港' }, SELF).role).toBeUndefined();
    expect(applySelfRole({ role: 'GM', gm: '阿德' }, SELF).role).toBe('GM');
  });

  it('整張表：補值、空的列不匯入', () => {
    const grid = detectSheet(
      parseDelimited(
        [
          '日期\t劇本名稱\t系統\tGM\tPL\tPC\t狀態\t時間',
          '2024/1/6\t霧港 第2陣\tCoC6\t自己\t阿德｜米可\t調查員一\t\t4h',
          '\t\t\t\t米可\t\t\t',
          'Dec 1, 2024\t雨夜\tエモクロアTRPG\t小林\t\t\t完結\t',
        ].join('\n'),
      ),
    );
    expect(grid).not.toBeNull();
    const rows = buildSheetRows(grid!, SELF);
    expect(rows).toHaveLength(2);
    expect(
      pick(rows[0], [
        'date',
        'dates',
        'scenario',
        'system',
        'role',
        'gm',
        'players',
        'status',
        'time',
      ]),
    ).toEqual({
      date: '2024-01-06',
      dates: ['2024-01-06'],
      scenario: '霧港 第2陣',
      system: 'CoC 6版',
      role: 'PL',
      gm: '自己',
      players: '阿德、米可',
      status: '新規',
      time: '4',
    });
    expect(rows[0].id).toMatch(/^session_/);
    expect(pick(rows[1], ['dates', 'system', 'role', 'status'])).toEqual({
      dates: ['2024-12-01'],
      system: 'エモクロア',
      role: 'PL',
      status: '完結',
    });
  });
});

describe('重複（3.8.4）', () => {
  const existing: SessionRow[] = [
    { id: 'e', date: '2024-01-06', dates: ['2024-01-06'], scenario: '霧港' },
  ];
  const rows = finishPartialRows(
    [
      { date: '2024-01-06', scenario: '霧港 第2陣' },
      { date: '2024-01-07', scenario: 'Rain Night' },
      { date: '2024-01-07', scenario: 'rain  night' },
      { scenario: '沒有日期' },
    ],
    SELF,
  );

  it('重複鍵：第一天｜整理後的劇本（NFKC、小寫、刪空白）', () => {
    expect(sessionDupKey(rows[0])).toBe('2024-01-06|霧港');
    expect(sessionDupKey(rows[1])).toBe('2024-01-07|rainnight');
    expect(sessionDupKey(rows[3])).toBe('');
  });

  it('與現有資料、同一批前面的列比較', () => {
    const keys = existingDupKeys(existing);
    expect(countDuplicates(rows, keys, true)).toEqual({ willImport: 2, dup: 2 });
    expect(countDuplicates(rows, keys, false)).toEqual({ willImport: 4, dup: 2 });
    expect(countDuplicates(rows, new Set(), true)).toEqual({ willImport: 3, dup: 1 });
    expect(dropDuplicates(rows, keys).map((r) => r.scenario)).toEqual(['Rain Night', '沒有日期']);
  });
});

describe('範本 CSV（3.11）', () => {
  it('標題與範例對齊，讀回時每欄都對應到原欄位', () => {
    const text = templateCsv();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('\r\n');
    const grid = parseDelimited(text.slice(1));
    expect(grid).toHaveLength(3);
    expect(grid.every((r) => r.length === TEMPLATE_FIELDS.length)).toBe(true);
    const sheet = detectSheet(grid);
    expect(sheet?.hasHeader).toBe(true);
    expect(sheet?.mapping).toEqual([...TEMPLATE_FIELDS]);
    const rows = buildSheetRows(sheet!, SELF);
    expect(rows).toHaveLength(2);
    expect(pick(rows[0], ['system', 'status', 'survival', 'hashtag', 'ending'])).toEqual({
      system: 'CoC 6版',
      status: '完結',
      survival: '生還',
      hashtag: '#CoC #團報',
      ending: 'END A',
    });
    expect(pick(rows[1], ['dates', 'system', 'status', 'campaign', 'role'])).toEqual({
      dates: ['2025-12-06', '2025-12-13'],
      system: 'CoC 7版',
      status: '継続',
      campaign: '範本長團',
      role: 'KP',
    });
  });

  it('單一列的轉換與格線一致', () => {
    expect(sheetRowToSession(['2026-01-01', '霧港'], ['date', 'scenario'], SELF).dates).toEqual([
      '2026-01-01',
    ]);
  });
});

const REPORT_A = [
  '新克蘇魯神話TRPG',
  '「海邊的旅館」',
  'KP：主持人小林',
  'PC/PL',
  '調查員・溫書亭 / 玩家阿德',
  '調查員・林小滿 / 玩家米可',
  'END A 全員生還',
  '2025/11/8',
  '#團報 #CoC',
].join('\n');

const REPORT_B = [
  '◆ エモクロアTRPG ◆',
  '『星砂と回聲』',
  'DL┊ゆき',
  'HO1 カナタ / たろうさん',
  'HO2 ミオ / はなこさん',
  '2026.3.21',
].join('\n');

describe('團報文字（3.8.5）', () => {
  it('一篇：系統、劇本、GM、參加者、結局與生還、日期、主題標籤', () => {
    const [r] = parseReportText(REPORT_A);
    expect(r).toEqual({
      longNote: REPORT_A,
      hashtag: '#團報 #CoC',
      date: '2025-11-08',
      system: 'CoC 7版',
      scenario: '海邊的旅館',
      gm: '主持人小林',
      pc: '調查員・溫書亭 / 調查員・林小滿',
      players: '玩家阿德、玩家米可',
      ending: 'END A 全員生還',
      survival: '全生還',
    });
  });

  it('PL 帶敬稱時決定順序；HO 編號；多篇以兩個空行或分隔線切開', () => {
    const rows = parseReportText(`${REPORT_A}\n\n\n${REPORT_B}\n---\n只有一行沒有內容`);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      system: 'エモクロア',
      scenario: '星砂と回聲',
      gm: 'ゆき',
      pc: 'カナタ / ミオ',
      players: 'たろうさん、はなこさん',
      ho: 'HO1 HO2',
      date: '2026-03-21',
    });
    expect(parseReportText(`${REPORT_A}\n------\n${REPORT_B}`)).toHaveLength(2);
    expect(parseReportText('   ')).toEqual([]);
  });

  it('整理後：身分推測、狀態預設', () => {
    const [r] = finishPartialRows(parseReportText(REPORT_A), selfNameSet('玩家阿德'));
    expect(pick(r, ['role', 'status', 'dates', 'survival'])).toEqual({
      role: 'PL',
      status: '新規',
      dates: ['2025-11-08'],
      survival: '全生還',
    });
  });

  it('清單文字：編號行佔多數時依「劇本 / 系統 / 身分 / 日期」與分組標題讀', () => {
    const text = [
      '【CoC 7版】',
      '1. 雨夜 / CoC7 / KP / 2026-01-20',
      '2. 「霧港」',
      '【小林】',
      '3. 鐘樓 / 其他系統',
      '',
    ].join('\n');
    expect(parseReportText(text)).toEqual([
      { scenario: '雨夜', system: 'CoC 7版', role: 'KP', date: '2026-01-20' },
      { scenario: '霧港', system: 'CoC 7版' },
      { scenario: '鐘樓', system: '其他系統', gm: '小林' },
    ]);
    expect(parseListExport('■ GM担当\n1. A\n　2PL\n2. B')).toEqual([
      { scenario: 'A', role: 'KP' },
      { scenario: 'B' },
    ]);
  });
});
