/**
 * 跑團紀錄簿：欄位（F38～F43、3.4）、存檔整理（F106、F107）、搜尋／篩選／排序（F15～F18）、統計（F10～F13）、
 * 清單輸出（3.7，逐字）、JSON 匯出入（3.10）。
 */
import { describe, expect, it } from 'vitest';
import { type SessionRow, selfNameSet } from '@/core/sessions';
import {
  addCustomColumn,
  type ColumnsData,
  clampColumnWidth,
  cleanColumns,
  DEFAULT_COLUMN_KEYS,
  defaultColumns,
  dialogColumns,
  ensureColumnsForKeys,
  extraColumns,
  hideColumn,
  mergeColumns,
  moveColumn,
  moveColumnBy,
  resetColumns,
  resizeColumn,
  showColumn,
} from '../../src/tools/session-log/columns';
import {
  buildExportText,
  exportHint,
  exportRows,
  uniqueScenarioList,
} from '../../src/tools/session-log/exportText';
import {
  classifyMediaUrl,
  computeStats,
  createSampleRows,
  DEFAULT_FILTER,
  dateDisplay,
  dateTitle,
  exportJsonFileName,
  exportJsonText,
  filterRows,
  formatStat,
  initialLogData,
  isValidUrlField,
  type LogData,
  mediaLinkLabel,
  newSessionRow,
  parseImportJson,
  passesFilter,
  restoreLogData,
  systemFilterValues,
  systemInput,
  timeDisplay,
} from '../../src/tools/session-log/logic';

const keys = (c: { key: string }[]) => c.map((x) => x.key);
const base = (): ColumnsData => ({
  columns: defaultColumns(),
  hiddenColumns: [],
  customColumns: [],
});

const row = (id: string, patch: Partial<SessionRow>): SessionRow => ({
  id,
  date: '',
  dates: [],
  ...patch,
});

/** 清單輸出用的資料：沒有日期、跨兩天、同劇本不同陣、沒有系統與身分的團 */
const ROWS: SessionRow[] = [
  row('r1', {
    dates: ['2026-01-10'],
    scenario: '霧港',
    system: 'CoC 6版',
    role: 'PL',
    gm: '小林',
    players: '阿德、米可',
    pc: 'A / B',
    time: '4',
  }),
  row('r2', {
    dates: ['2026-02-01', '2026-02-08'],
    scenario: '霧港 第2陣',
    system: 'CoC 6版',
    role: 'PL',
    gm: '小林',
    players: '阿德',
    pc: 'A',
    time: '3.5',
  }),
  row('r3', {
    dates: ['2026-01-20'],
    scenario: '雨夜',
    system: 'CoC 7版',
    role: 'KP',
    gm: '自己',
    players: '甲、乙、丙',
    time: '5',
  }),
  row('r4', {
    scenario: '星砂',
    system: 'エモクロア',
    role: 'DL',
    gm: '自己',
    players: '芙蘭',
    pc: '共鳴者',
  }),
  row('r5', { dates: ['2025-12-24'], scenario: '鐘樓', time: '2.25' }),
  row('s1', {
    sample: true,
    dates: ['2026-03-01'],
    scenario: '範例',
    system: 'CoC 6版',
    gm: '路人',
  }),
];

describe('欄位（F19、F38～F43）', () => {
  it('預設欄位與寬度', () => {
    expect(keys(defaultColumns())).toEqual([...DEFAULT_COLUMN_KEYS]);
    expect(defaultColumns().find((c) => c.key === 'scenario')?.width).toBe(310);
    expect(clampColumnWidth('scenario', 10000)).toBe(520);
    expect(clampColumnWidth('scenario', 10)).toBe(180);
    expect(clampColumnWidth('gm', 999)).toBe(360);
    expect(clampColumnWidth('custom_1', 0)).toBe(140);
    expect(clampColumnWidth('custom_1', 50)).toBe(72);
  });

  it('加入欄位插在送出欄前；移除欄位記住；重設保留自訂欄位的定義', () => {
    let d = showColumn(base(), { key: 'fav' });
    expect(keys(d.columns).slice(-2)).toEqual(['fav', 'report']);
    d = hideColumn(d, 'note');
    expect(keys(d.columns)).not.toContain('note');
    expect(keys(d.hiddenColumns)).toEqual(['note']);
    expect(hideColumn(d, 'report')).toBe(d);
    d = showColumn(d, { key: 'note' });
    expect(keys(d.hiddenColumns)).toEqual([]);
    d = addCustomColumn(d, '骰子', 123);
    expect(d.customColumns).toEqual([
      { key: 'custom_123', label: '骰子', width: 140, custom: true },
    ]);
    expect(keys(d.columns).slice(-2)).toEqual(['custom_123', 'report']);
    expect(addCustomColumn(d, '地點', 123).customColumns[1].key).toBe('custom_124');
    d = hideColumn(d, 'custom_123');
    expect(keys(extraColumns(d))).toEqual([
      'fav',
      'ho',
      'ending',
      'survival',
      'campaign',
      'hashtag',
      'sessionUrl',
      'scenarioUrl',
      'kansouUrl',
      'custom_123',
    ]);
    const r = resetColumns(d);
    expect(keys(r.columns)).toEqual([...DEFAULT_COLUMN_KEYS]);
    expect(r.hiddenColumns).toEqual([]);
    expect(r.customColumns).toHaveLength(1);
  });

  it('對話框的欄位：預設欄位（固定欄除外）＋所有額外欄位', () => {
    const d = addCustomColumn(base(), '骰子', 9);
    expect(keys(dialogColumns(d))).toEqual([
      'date',
      'scenario',
      'system',
      'role',
      'gm',
      'players',
      'pc',
      'status',
      'time',
      'note',
      'fav',
      'ho',
      'ending',
      'survival',
      'campaign',
      'hashtag',
      'sessionUrl',
      'scenarioUrl',
      'kansouUrl',
      'custom_9',
    ]);
  });

  it('拖曳排序：左半插在前、右半插在後；不越過固定欄', () => {
    const c = defaultColumns();
    expect(keys(moveColumn(c, 'note', 'date', 'before')).slice(0, 3)).toEqual([
      'reported',
      'note',
      'date',
    ]);
    expect(keys(moveColumn(c, 'date', 'scenario', 'after')).slice(0, 3)).toEqual([
      'reported',
      'scenario',
      'date',
    ]);
    /* 放到送出欄的右半 → 仍在送出欄前；放到團報勾選欄的左半 → 仍在它後面 */
    expect(keys(moveColumn(c, 'date', 'report', 'after')).slice(-2)).toEqual(['date', 'report']);
    expect(keys(moveColumn(c, 'scenario', 'reported', 'before')).slice(0, 2)).toEqual([
      'reported',
      'scenario',
    ]);
    expect(moveColumn(c, 'report', 'date', 'before')).toEqual(c);
    expect(keys(moveColumnBy(c, 'date', 1)).slice(0, 3)).toEqual(['reported', 'scenario', 'date']);
    expect(moveColumnBy(c, 'date', -1)).toEqual(c);
    expect(moveColumnBy(c, 'note', 1)).toEqual(c);
  });

  it('調整欄寬夾在範圍內；固定欄不能調', () => {
    const c = resizeColumn(defaultColumns(), 'scenario', 999);
    expect(c.find((x) => x.key === 'scenario')?.width).toBe(520);
    expect(resizeColumn(c, 'report', 300).find((x) => x.key === 'report')?.width).toBe(116);
  });

  it('匯入：可選欄位自動加入、JSON 的欄位合併（主題標籤除外）', () => {
    const d = ensureColumnsForKeys(base(), ['ending', 'scenario', 'roleKp']);
    expect(keys(d.columns).slice(-2)).toEqual(['ending', 'report']);
    const merged = mergeColumns(defaultColumns(), [
      { key: 'hashtag', width: 100 },
      { key: 'custom_1', label: '骰子', width: 9999, custom: true },
      { key: 'date', width: 200 },
    ]);
    expect(keys(merged).slice(-2)).toEqual(['custom_1', 'report']);
    expect(merged.find((x) => x.key === 'custom_1')?.width).toBe(360);
    expect(merged.find((x) => x.key === 'date')?.width).toBe(136);
  });

  it('讀入的欄位設定整理：固定欄放兩端、重複的鍵只留一個', () => {
    const c = cleanColumns(
      [
        { key: 'date', width: 1 },
        { key: 'report', width: 116 },
        { key: 'date', width: 200 },
        { key: 'custom_5', label: '地點', width: 150 },
        'x',
        { key: '' },
      ],
      { ensureLocked: true },
    );
    expect(c).toEqual([
      { key: 'reported', width: 78, locked: true },
      { key: 'date', width: 112 },
      { key: 'custom_5', width: 150, custom: true, label: '地點' },
      { key: 'report', width: 116, locked: true },
    ]);
  });
});

describe('存檔整理（F106、F107）', () => {
  it('舊版存檔：日期、舊系統名、GM 組的身分、時間單位、主題標籤欄、舊欄寬', () => {
    const data = restoreLogData({
      rows: [
        {
          id: 'a',
          date: '2026-01-05、2026-01-03',
          system: 'エモクロアTRPG',
          role: 'kp',
          time: '4h',
        },
        { id: 'a', scenario: '重複的識別碼', system: 'マルチシステム', role: 'PL', reported: 1 },
        'not a row',
        { scenario: '沒有識別碼', time: 3 },
      ],
      columns: [
        { key: 'date', width: 136 },
        { key: 'scenario', width: 400 },
        { key: 'hashtag', width: 140 },
        { key: 'report', width: 116, locked: true },
      ],
      hiddenColumns: [{ key: 'note', width: 250 }],
      customColumns: [],
      migrations: { hashtagOptional: false },
    });
    expect(data).not.toBeNull();
    const d = data as LogData;
    expect(d.rows).toHaveLength(3);
    expect(d.rows[0]).toMatchObject({
      id: 'a',
      date: '2026-01-03',
      dates: ['2026-01-03', '2026-01-05'],
      system: 'エモクロア',
      role: 'GM',
      time: '4',
      reported: false,
    });
    expect(d.rows[1].id).not.toBe('a');
    expect(d.rows[1]).toMatchObject({ system: 'マダミス', role: 'PL', reported: true });
    expect(d.rows[2].id).toMatch(/^session_/);
    expect(d.rows[2].time).toBe('3');
    expect(keys(d.columns)).toEqual(['reported', 'date', 'scenario', 'report']);
    expect(d.columns.find((c) => c.key === 'scenario')?.width).toBe(310);
    expect(keys(d.hiddenColumns)).toEqual(['note']);
  });

  it('新版存檔照原樣；損壞的回傳 null', () => {
    const init = initialLogData();
    expect(restoreLogData(JSON.parse(JSON.stringify(init)))).toEqual(init);
    expect(restoreLogData(null)).toBeNull();
    expect(restoreLogData({ rows: 'x' })).toBeNull();
    expect(restoreLogData([])).toBeNull();
  });

  it('範例列（自寫）：4 筆、不同系統與身分', () => {
    const samples = createSampleRows();
    expect(samples).toHaveLength(4);
    expect(samples.every((r) => r.sample)).toBe(true);
    expect(new Set(samples.map((r) => r.system)).size).toBe(4);
    expect(samples.map((r) => r.role)).toEqual(['PL', 'KP', 'DL', 'PL']);
  });

  it('新增的預設（F45）', () => {
    expect(newSessionRow('2026-07-01')).toMatchObject({
      date: '2026-07-01',
      dates: ['2026-07-01'],
      system: 'CoC 6版',
      role: 'PL',
      status: '新規',
    });
  });
});

describe('表格的顯示', () => {
  it('日期、時間、貼文的分類', () => {
    expect(dateDisplay(ROWS[1])).toBe('2026-02-08 另 1 天');
    expect(dateTitle(ROWS[1])).toBe('2026-02-01 / 2026-02-08');
    expect(dateDisplay(ROWS[3])).toBe('');
    expect(timeDisplay('3:30')).toBe('3.5 小時');
    expect(timeDisplay('')).toBe('');
    expect(classifyMediaUrl('https://x.com/user/status/123')).toBe('tweet');
    expect(classifyMediaUrl('https://twitter.com/user/statuses/1?s=2')).toBe('tweet');
    expect(classifyMediaUrl('https://example.com/a.JPG?x=1')).toBe('image');
    expect(classifyMediaUrl('https://fusetter.com/tw/abc')).toBe('link');
    expect(mediaLinkLabel('https://www.example.com/a')).toBe('example.com');
    expect(mediaLinkLabel('https://x.com/u/status/1')).toBe('X 貼文');
    expect(isValidUrlField('')).toBe(true);
    expect(isValidUrlField('https://a.b')).toBe(true);
    expect(isValidUrlField('不是網址')).toBe(false);
    expect(systemInput('謀殺之謎')).toBe('マダミス');
    expect(systemInput('エモクロアTRPG')).toBe('エモクロア');
  });

  it('系統篩選的選項：常用 4 種＋出現過的', () => {
    expect(systemFilterValues([...ROWS, row('x', { system: '其他系統' })])).toEqual([
      'CoC 7版',
      'CoC 6版',
      'エモクロア',
      'マダミス',
      '其他系統',
    ]);
  });
});

describe('搜尋、篩選、排序（F15～F18）', () => {
  const ids = (list: SessionRow[]) => list.map((r) => r.id);
  it('預設由新到舊（主要日期；沒有日期的最後）', () => {
    expect(ids(filterRows(ROWS, DEFAULT_FILTER))).toEqual(['s1', 'r2', 'r3', 'r1', 'r5', 'r4']);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, sort: 'oldest' }))).toEqual([
      'r4',
      'r5',
      'r1',
      'r3',
      'r2',
      's1',
    ]);
  });

  it('搜尋文字欄位與顯示名稱（不分大小寫）；不比對識別碼', () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, search: ' 霧港 ' }))).toEqual(['r2', 'r1']);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, search: 'emoklore' }))).toEqual(['r4']);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, search: '2026-02-01' }))).toEqual(['r2']);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, search: 'r1' }))).toEqual([]);
  });

  it('系統與身分', () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, system: 'CoC 6版' }))).toEqual([
      's1',
      'r2',
      'r1',
    ]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, role: 'GM' }))).toEqual(['r3', 'r4']);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, role: 'PL' }))).toEqual(['r2', 'r1']);
    expect(passesFilter(ROWS[0], { ...DEFAULT_FILTER, role: 'GM' })).toBe(false);
  });

  it('依劇本、依 GM（繁中排序規則：筆畫；空的在前；同值維持原順序）', () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTER, sort: 'gm' }))).toEqual([
      'r5',
      'r1',
      'r2',
      'r3',
      'r4',
      's1',
    ]);
    expect(
      ids(
        filterRows(
          [
            row('a', { scenario: '雨夜' }),
            row('b', { scenario: '' }),
            row('c', { scenario: '一' }),
          ],
          {
            ...DEFAULT_FILTER,
            sort: 'scenario',
          },
        ),
      ),
    ).toEqual(['b', 'c', 'a']);
  });
});

describe('統計（F10～F13）', () => {
  it('不含範例；天數、劇本數、時數、同團玩家', () => {
    const s = computeStats(ROWS, selfNameSet(''));
    expect(s).toEqual({ days: 5, scenarios: 4, hours: 14.75, coPlayers: 7 });
    expect(formatStat(s.hours, true)).toBe('14.8');
    expect(formatStat(12, false)).toBe('12');
    expect(formatStat(7.0, true)).toBe('7');
    expect(computeStats(ROWS, selfNameSet('阿德、小林')).coPlayers).toBe(5);
  });
});

describe('已通關劇本清單（3.7，逐字）', () => {
  const list = exportRows(ROWS, '');

  it('對象：非範例列，依主要日期由舊到新；合併成劇本', () => {
    expect(list.map((r) => r.id)).toEqual(['r5', 'r1', 'r3', 'r2', 'r4']);
    expect(uniqueScenarioList(list).map((e) => [e.row.id, e.count, e.firstDate])).toEqual([
      ['r5', 1, '2025-12-24'],
      ['r1', 2, '2026-01-10'],
      ['r3', 1, '2026-01-20'],
      ['r4', 1, '9999-99-99'],
    ]);
  });

  it('全部劇本（沒有日期時不寫日期）', () => {
    expect(buildExportText(list, 'all')).toBe(
      [
        '【全部劇本】共 4 部（5 團）',
        '',
        '1. 鐘樓　2025-12-24',
        '2. 霧港（×2）　2026-01-10',
        '3. 雨夜　2026-01-20',
        '4. 星砂',
      ].join('\n'),
    );
  });

  it('依系統', () => {
    expect(buildExportText(list, 'system')).toBe(
      [
        '【CoC 6版】共 1 部',
        '　2PL',
        '　　1. 霧港',
        '',
        '【CoC 7版】共 1 部',
        '　3PL',
        '　　1. 雨夜',
        '',
        '【Emoklore】共 1 部',
        '　1PL',
        '　　1. 星砂',
        '',
        '【未設定系統】共 1 部',
        '　1PL',
        '　　1. 鐘樓',
      ].join('\n'),
    );
  });

  it('依 PL／KP', () => {
    expect(buildExportText(list, 'role')).toBe(
      [
        '■ 以 PL 身分通關（1 部）',
        '【CoC 6版】',
        '　2PL',
        '　　1. 霧港',
        '',
        '',
        '■ 以 KP / GM 身分通關（2 部）',
        '【CoC 7版】',
        '　3PL',
        '　　1. 雨夜',
        '',
        '【Emoklore】',
        '　1PL',
        '　　1. 星砂',
        '',
        '',
        '■ 以 其他 身分通關（1 部）',
        '【未設定系統】',
        '　1PL',
        '　　1. 鐘樓',
      ].join('\n'),
    );
  });

  it('場次明細', () => {
    expect(buildExportText(list, 'sessions')).toBe(
      [
        '【場次一覽】5 團',
        '',
        '1. 2025-12-24　-　-　鐘樓',
        '2. 2026-01-10　CoC 6版　PL　霧港',
        '　KP/GM: 小林 ／ PL: 阿德、米可 ／ PC: A / B',
        '3. 2026-01-20　CoC 7版　KP/GM　雨夜',
        '　KP/GM: 自己 ／ PL: 甲、乙、丙',
        '4. 2026-02-08 另 1 天　CoC 6版　PL　霧港 第2陣',
        '　KP/GM: 小林 ／ PL: 阿德 ／ PC: A',
        '5. 未設定日期　Emoklore　KP/GM　星砂',
        '　KP/GM: 自己 ／ PL: 芙蘭 ／ PC: 共鳴者',
      ].join('\n'),
    );
  });

  it('同一個 PL 人數小段依日期編號；PL 人數由少到多', () => {
    const rows = [
      row('a', { dates: ['2026-01-01'], scenario: 'B', system: 'X', players: '1、2' }),
      row('b', { dates: ['2026-01-02'], scenario: 'A', system: 'X', players: '1' }),
      row('c', { dates: ['2026-01-03'], scenario: 'C', system: 'X', players: '1、2' }),
      row('d', { dates: ['2026-01-04'], scenario: 'D', system: 'W', players: '' }),
    ];
    expect(buildExportText(exportRows(rows, ''), 'system')).toBe(
      [
        '【W】共 1 部',
        '　1PL',
        '　　1. D',
        '',
        '【X】共 3 部',
        '　1PL',
        '　　1. A',
        '　2PL',
        '　　1. B',
        '　　2. C',
      ].join('\n'),
    );
  });

  it('名字篩選與提示；沒有團時空白', () => {
    const filtered = exportRows(ROWS, '阿德');
    expect(filtered.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(exportHint(filtered, ' 阿德 ')).toBe('符合「阿德」：2 團／1 部劇本');
    expect(exportHint([], '無')).toBe('沒有符合「無」的團。');
    expect(exportHint(filtered, '')).toBe('');
    for (const mode of ['all', 'system', 'role', 'sessions'] as const)
      expect(buildExportText([], mode)).toBe('');
  });
});

describe('JSON 匯出入（3.10）', () => {
  it('匯出的 JSON 讀得回來（含舊版讀得懂的 rows、columns）', () => {
    const data: LogData = { ...initialLogData(), rows: ROWS };
    const text = exportJsonText(data, new Date('2026-07-01T00:00:00Z'));
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('trpg-toolkit-session-log');
    expect(parsed.exportedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(parsed.columns[0]).toEqual({ key: 'reported', width: 78, locked: true, label: '團報' });
    expect(text.split('\n')[1]).toBe('  "format": "trpg-toolkit-session-log",');
    const payload = parseImportJson(`﻿${text}`);
    expect(payload?.rows).toEqual(JSON.parse(JSON.stringify(ROWS)));
    expect(keys(payload?.columns ?? [])).toEqual([...DEFAULT_COLUMN_KEYS]);
    expect(exportJsonFileName(new Date(2026, 6, 1, 3))).toBe('跑團紀錄簿-2026-07-01.json');
  });

  it('沒有 rows 陣列的不收', () => {
    expect(parseImportJson('[]')).toBeNull();
    expect(parseImportJson('{"rows":{}}')).toBeNull();
    expect(parseImportJson('{')).toBeNull();
    expect(parseImportJson('{"rows":[{"scenario":"x"},1]}')).toEqual({
      rows: [{ scenario: 'x' }],
      columns: null,
    });
  });
});
