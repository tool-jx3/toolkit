/**
 * @/core/sessions：正規值與顯示名稱、匯入別名、人名、時間、劇本計數鍵、日期、交接資料（session-log 規格 3.1～3.6、3.9）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMON_SYSTEMS,
  canonicalStatus,
  canonicalSurvival,
  canonicalSystem,
  clearPendingReportImport,
  countCoPlayers,
  countUniqueScenarios,
  createReportImportItem,
  createReportPendingImport,
  hasPendingReportImport,
  importRole,
  importSystem,
  localIsoDate,
  normalizeLegacySystem,
  normalizePersonName,
  normalizeRole,
  normalizeRoleGroup,
  normalizeRowDates,
  normalizeScenarioForCount,
  normalizeSessionFormat,
  normalizeSessionStatus,
  normalizeTimeValue,
  pairPlayers,
  parseDateList,
  primaryDate,
  REPORT_PENDING_IMPORT_KEY,
  readPendingReportImport,
  SESSION_ROLES,
  type SessionRow,
  scenarioCountKey,
  selfNameSet,
  splitFlexibleDates,
  splitPeople,
  splitTags,
  statusLabel,
  survivalLabel,
  systemLabel,
  timeHours,
  toIsoDatePart,
  writePendingReportImport,
} from '@/core/sessions';

describe('正規值 ↔ 顯示名稱（3.1）', () => {
  it('系統、狀態、生還以日文正規值存檔、繁中顯示', () => {
    expect(COMMON_SYSTEMS).toEqual(['CoC 7版', 'CoC 6版', 'エモクロア', 'マダミス']);
    expect(systemLabel('エモクロア')).toBe('Emoklore');
    expect(systemLabel('マダミス')).toBe('謀殺之謎');
    expect(systemLabel('ダブルクロス The 3rd Edition')).toBe('雙重十字 The 3rd Edition');
    expect(systemLabel('自創系統')).toBe('自創系統');
    expect(systemLabel(undefined)).toBe('');
    expect(statusLabel('新規')).toBe('新開');
    expect(statusLabel('継続')).toBe('延續');
    expect(survivalLabel('ロスト')).toBe('撕卡');
    expect(survivalLabel('全生還')).toBe('全員生還');
  });

  it('輸入繁中顯示名稱或正規值都存成正規值；其他文字原樣（不去空白）', () => {
    expect(canonicalSystem('謀殺之謎')).toBe('マダミス');
    expect(canonicalSystem(' Emoklore ')).toBe('エモクロア');
    expect(canonicalSystem('マダミス')).toBe('マダミス');
    expect(canonicalSystem('emoklore')).toBe('emoklore');
    expect(canonicalSystem(' 其他 ')).toBe(' 其他 ');
    expect(canonicalStatus('延續')).toBe('継続');
    expect(canonicalSurvival('延續')).toBe('継続');
    expect(canonicalSurvival('撕卡')).toBe('ロスト');
    expect(canonicalSurvival('全員撕卡')).toBe('全ロスト');
    expect(canonicalStatus('')).toBe('');
  });

  it('舊系統名、匯入別名、身分', () => {
    expect(normalizeLegacySystem('エモクロアTRPG')).toBe('エモクロア');
    expect(normalizeLegacySystem('マルチシステム')).toBe('マダミス');
    expect(normalizeLegacySystem('CoC 6版')).toBe('CoC 6版');
    expect(importSystem('新クトゥルフ神話TRPG')).toBe('CoC 7版');
    expect(importSystem('ＣｏＣ６')).toBe('CoC 6版');
    expect(importSystem('Emoklore TRPG')).toBe('エモクロア');
    expect(importSystem('克蘇魯神話TRPG')).toBe('CoC 6版');
    expect(importSystem('謀殺之謎')).toBe('マダミス');
    expect(importSystem('劍世界2.5')).toBe('ソード・ワールド2.5');
    expect(importSystem('其他')).toBe('其他');
    expect(importRole('キーパー')).toBe('KP');
    expect(importRole('守密人')).toBe('KP');
    expect(importRole('Gm')).toBe('GM');
    expect(importRole('dl')).toBe('DL');
    expect(importRole('玩家')).toBe('PL');
    expect(importRole('觀戰')).toBe('觀戰');
    expect(normalizeRoleGroup('kp')).toBe('GM');
    expect(normalizeRoleGroup(' pl ')).toBe('PL');
    expect(normalizeRoleGroup('觀戰')).toBe('觀戰');
    expect(normalizeRole('kp')).toBe('GM');
    expect(normalizeRole('KP')).toBe('KP');
    expect(normalizeRole('觀戰')).toBe('觀戰');
  });
  it('SKP（副 KP，P11 新增 F115、F116）：身分選項、匯入別名、算在 GM 組', () => {
    expect(SESSION_ROLES).toEqual(['PL', 'KP', 'SKP', 'GM', 'DL']);
    expect(importRole('SKP')).toBe('SKP');
    expect(importRole('skp')).toBe('SKP');
    expect(importRole('サブKP')).toBe('SKP');
    expect(importRole('サブキーパー')).toBe('SKP');
    expect(importRole('副KP')).toBe('SKP');
    expect(importRole('副守密人')).toBe('SKP');
    expect(normalizeRoleGroup('SKP')).toBe('GM');
    expect(normalizeRoleGroup(' skp ')).toBe('GM');
    expect(normalizeRole('SKP')).toBe('SKP');
    /* 存檔裡的小寫 skp 跟小寫 kp 一樣整理成 GM（F107，同舊版） */
    expect(normalizeRole('skp')).toBe('GM');
  });
});

describe('人名（3.3）', () => {
  it('拆分：「・」不是分隔符號；と／and 要前後有空白', () => {
    expect(splitPeople('阿德、米可,小雨，阿哲/佩佩／芙蘭&阿凱＆小林＋甲+乙;丙；丁\n戊')).toEqual([
      '阿德',
      '米可',
      '小雨',
      '阿哲',
      '佩佩',
      '芙蘭',
      '阿凱',
      '小林',
      '甲',
      '乙',
      '丙',
      '丁',
      '戊',
    ]);
    expect(splitPeople('約翰・史密斯')).toEqual(['約翰・史密斯']);
    expect(splitPeople('Ann and Bob と 太郎')).toEqual(['Ann', 'Bob', '太郎']);
    expect(splitPeople('Brandon')).toEqual(['Brandon']);
    expect(splitPeople('')).toEqual([]);
  });

  it('正規化：NFKC、刪空白、結尾的句點換成一個「。」', () => {
    expect(normalizePersonName(' 阿　德 ')).toBe('阿德');
    expect(normalizePersonName('ＡＢＣ')).toBe('ABC');
    expect(normalizePersonName('くま..')).toBe('くま。');
  });

  it('自己的名字＝通用詞＋使用者填的；同團玩家排除自己', () => {
    const self = selfNameSet('阿德、 米 可');
    expect(self.has('阿德')).toBe(true);
    expect(self.has('米可')).toBe(true);
    expect(self.has('自己')).toBe(true);
    expect(self.has('KP')).toBe(true);
    expect(
      countCoPlayers(
        [
          { gm: '小林', players: '阿德、小雨' },
          { gm: '自己', players: '小雨／阿哲' },
          { gm: 'KP', players: '' },
        ],
        self,
      ),
    ).toBe(3);
  });
});

describe('時間（3.5）與劇本計數鍵（3.6）', () => {
  it('H:MM → 小時（兩位小數）；否則第一個數字', () => {
    expect(normalizeTimeValue('3:30')).toBe('3.5');
    expect(normalizeTimeValue('1:20')).toBe('1.33');
    expect(normalizeTimeValue('2時45分')).toBe('2.75');
    expect(normalizeTimeValue('２：１５')).toBe('2.25');
    expect(normalizeTimeValue('4h')).toBe('4');
    expect(normalizeTimeValue('約 3.5 小時')).toBe('3.5');
    expect(normalizeTimeValue('沒有')).toBe('');
    expect(normalizeTimeValue(null)).toBe('');
    expect(timeHours('3.5')).toBe(3.5);
    expect(timeHours('')).toBe(0);
  });

  it('劇本名稱整理與計數鍵', () => {
    expect(normalizeScenarioForCount('霧港 第2陣')).toBe('霧港');
    expect(normalizeScenarioForCount('霧港_前編')).toBe('霧港');
    expect(normalizeScenarioForCount('霧港 ２日目')).toBe('霧港');
    expect(normalizeScenarioForCount('雨夜 キャラシ作成会')).toBe('雨夜');
    expect(scenarioCountKey({ scenario: '霧港 後編', scenarioCountKey: '' })).toBe('霧港');
    expect(scenarioCountKey({ scenario: '霧港', scenarioCountKey: ' KEY ' })).toBe('KEY');
    expect(
      countUniqueScenarios([
        { scenario: '霧港 前編' },
        { scenario: '霧港 後編' },
        { scenario: '' },
      ]),
    ).toBe(1);
    /* 統計的劇本數大小寫視為不同 */
    expect(countUniqueScenarios([{ scenario: 'Fog' }, { scenario: 'fog' }])).toBe(2);
  });
});

describe('日期（3.4）', () => {
  it('整理：只留 YYYY-MM-DD、去重複、排序；第一天是 date', () => {
    expect(
      normalizeRowDates({ dates: ['2026-05-09', 'x', '2026-05-02', '2026-05-09'], date: '' }),
    ).toEqual({
      date: '2026-05-02',
      dates: ['2026-05-02', '2026-05-09'],
    });
    expect(normalizeRowDates({ date: '2026-01-05、2026-01-03' })).toEqual({
      date: '2026-01-03',
      dates: ['2026-01-03', '2026-01-05'],
    });
    /* 舊欄位以「/」切開，所以斜線日期不會被認得（照舊版） */
    expect(parseDateList('2026/01/05')).toEqual(['2026', '01', '05']);
    expect(normalizeRowDates({ date: '2026/01/05' }).dates).toEqual([]);
    expect(primaryDate({ date: '', dates: ['2026-05-02', '2026-05-09'] })).toBe('2026-05-09');
    expect(primaryDate({ date: '', dates: [] })).toBe('');
  });

  it('彈性日期：英文月份、年月日、範圍', () => {
    expect(toIsoDatePart('December 1, 2024')).toBe('2024-12-01');
    expect(toIsoDatePart('Sept 3rd 2025')).toBe('2025-09-03');
    expect(toIsoDatePart('2025年3月4日')).toBe('2025-03-04');
    expect(toIsoDatePart('２０２５／３／４')).toBe('2025-03-04');
    expect(toIsoDatePart('明天')).toBe('');
    expect(splitFlexibleDates('2025/12/6, 2025/12/13')).toEqual(['2025-12-06', '2025-12-13']);
    expect(splitFlexibleDates('December 1, 2024 → December 3, 2024')).toEqual([
      '2024-12-01',
      '2024-12-03',
    ]);
    expect(splitFlexibleDates('Dec 1, 2024、Dec 8, 2024')).toEqual(['2024-12-01', '2024-12-08']);
    expect(splitFlexibleDates('2025-01-02 2025-01-02 x')).toEqual(['2025-01-02']);
    expect(splitFlexibleDates('')).toEqual([]);
    expect(localIsoDate(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05');
  });
});

describe('交接資料（3.9）', () => {
  const row: SessionRow = {
    id: 'session_1',
    date: '',
    dates: ['2026-05-09', '2026-05-02'],
    scenario: '雨夜的郵差',
    system: 'CoC 7版',
    gm: '小林',
    players: '阿德、米可、小雨',
    pc: '調查員甲 / 調查員乙',
    status: '完結',
    note: ' 簡短 ',
    result: '',
    longNote: '感想\n第二行',
    reported: true,
    sessionUrl: 'https://example.com/log',
    kansouUrl: 'https://example.com/k',
    cushionLinks: [
      { label: '', url: 'https://example.com/a' },
      { label: '心得', url: '' },
    ],
    hashtag: '#團報 #CoC、雨夜',
  };

  it('一團 → 項目', () => {
    expect(createReportImportItem(row, 1700000000000)).toEqual({
      id: 'report_import_1700000000000',
      sourceLogId: 'session_1',
      reported: true,
      scenario: '雨夜的郵差',
      system: 'CoC 7版',
      dates: ['2026-05-02', '2026-05-09'],
      latestDate: '2026-05-09',
      sessionCount: 2,
      gm: '小林',
      players: [
        { pl: '阿德', pc: '調查員甲', characterUrl: '' },
        { pl: '米可', pc: '調查員乙', characterUrl: '' },
        { pl: '小雨', pc: '', characterUrl: '' },
      ],
      format: '',
      status: 'completed',
      memo: '簡短\n\n感想\n第二行',
      links: [
        { label: 'Session', url: 'https://example.com/log' },
        { label: 'Scenario', url: '' },
        { label: 'Kansou', url: 'https://example.com/k' },
        { label: 'Link', url: 'https://example.com/a' },
      ],
      hashtags: ['團報', 'CoC', '雨夜'],
    });
    const p = createReportPendingImport(row, 1700000000000);
    expect(p.source).toBe('session-log-tracker');
    expect(p.version).toBe('1.0');
    expect(p.createdAt).toBe(new Date(1700000000000).toISOString());
    expect(p.items).toHaveLength(1);
  });

  it('沒有日期、沒有人時至少一組空的；其他來源的欄位', () => {
    const item = createReportImportItem(
      {
        id: 'x',
        date: '',
        dates: [],
        title: '舊標題',
        keeper: '老 KP',
        format: 'ボイセ',
        status: '継続',
      },
      1,
    );
    expect(item.scenario).toBe('舊標題');
    expect(item.gm).toBe('老 KP');
    expect(item.latestDate).toBe('');
    expect(item.sessionCount).toBe(1);
    expect(item.players).toEqual([{ pl: '', pc: '', characterUrl: '' }]);
    expect(item.format).toBe('voice');
    expect(item.status).toBe('ongoing');
    expect(item.links).toEqual([
      { label: 'Session', url: '' },
      { label: 'Scenario', url: '' },
    ]);
  });

  it('小工具', () => {
    expect(pairPlayers('', 'A / B')).toEqual([
      ['', 'A'],
      ['', 'B'],
    ]);
    expect(splitTags(['#a', ' b ', ''])).toEqual(['a', 'b']);
    expect(normalizeSessionFormat('semi')).toBe('semi-text');
    expect(normalizeSessionFormat('テキセ')).toBe('text');
    expect(normalizeSessionStatus('予定')).toBe('ongoing');
    expect(normalizeSessionStatus('中止')).toBe('中止');
  });

  describe('localStorage', () => {
    let store: Map<string, string>;
    beforeEach(() => {
      store = new Map();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      };
    });
    afterEach(() => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it('寫入、讀取、清除（鍵名沿用舊版）', () => {
      expect(REPORT_PENDING_IMPORT_KEY).toBe('trpgWebTools.sessionReportGenerator.pendingImport');
      expect(hasPendingReportImport()).toBe(false);
      expect(readPendingReportImport()).toBeNull();
      const payload = createReportPendingImport(row, 5);
      expect(writePendingReportImport(payload)).toBe(true);
      expect(hasPendingReportImport()).toBe(true);
      expect(readPendingReportImport()).toEqual(payload);
      store.set(REPORT_PENDING_IMPORT_KEY, '{broken');
      expect(readPendingReportImport()).toBe('broken');
      clearPendingReportImport();
      expect(hasPendingReportImport()).toBe(false);
    });

    it('寫不進去時回傳 false', () => {
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => {},
      };
      expect(writePendingReportImport(createReportPendingImport(row, 5))).toBe(false);
    });
  });
});
