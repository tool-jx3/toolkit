/**
 * NPC 名字產生器的邏輯：鎖定後再產生的合併、同一個種子與鎖定重現同一批、複製的文字、讀回存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import { type GeneratedName, parseNameData } from '@/core/names';
import * as jpRaw from '@/core/names/jp/names-jp';
import * as twRaw from '@/core/names/tw/names-tw';
import {
  CSV_HEADER,
  copyAllText,
  copyLine,
  csvRows,
  exportFileName,
  HISTORY_MAX,
  type HistoryEntry,
  historyLabel,
  initialState,
  mergeBatch,
  type NamesState,
  nextBatch,
  pushHistory,
  sanitizeHistory,
  sanitizeState,
  shownReadings,
  toTxt,
} from '@/tools/npc-names/logic';

const TW = parseNameData('tw', twRaw);
const JP = parseNameData('jp', jpRaw);

const n = (text: string): GeneratedName => ({
  region: 'tw',
  era: 'now',
  gender: 'male',
  family: text[0],
  given: text.slice(1),
  text,
});

const state = (patch: Partial<NamesState>): NamesState => ({ ...initialState, ...patch });

describe('mergeBatch', () => {
  it('鎖定的留在原位，其他依序換新', () => {
    const old = ['甲一', '乙二', '丙三', '丁四'].map(n);
    const fresh = ['戊五', '己六', '庚七'].map(n);
    const out = mergeBatch(old, new Set(['乙二', '丁四']), fresh, 4);
    expect(out.map((x) => x.text)).toEqual(['戊五', '乙二', '己六', '丁四']);
  });

  it('數量變多接在後面、變少從後面拿掉沒鎖定的；鎖定的比數量多時全部留著', () => {
    const old = ['甲一', '乙二'].map(n);
    const fresh = ['丙三', '丁四', '戊五', '己六'].map(n);
    expect(mergeBatch(old, new Set(), fresh, 4).map((x) => x.text)).toEqual([
      '丙三',
      '丁四',
      '戊五',
      '己六',
    ]);
    const many = ['甲一', '乙二', '丙三', '丁四'].map(n);
    expect(mergeBatch(many, new Set(['丁四']), ['戊五'].map(n), 2).map((x) => x.text)).toEqual([
      '戊五',
      '丁四',
    ]);
    expect(mergeBatch(many, new Set(['甲一', '丙三']), [], 1).map((x) => x.text)).toEqual([
      '甲一',
      '丙三',
    ]);
  });
});

describe('nextBatch', () => {
  it('同樣的種子、條件與鎖定，產生同樣的一批；鎖定的不會再出現', () => {
    const base = state({ region: 'tw', count: 8, seed: 'fixed' });
    const a = nextBatch(base, TW);
    const b = nextBatch(base, TW);
    expect(a.seed).toBe('fixed');
    expect(a.names.map((x) => x.text)).toEqual(b.names.map((x) => x.text));
    const lockedState = { ...base, names: a.names, locked: [a.names[2].text, a.names[5].text] };
    const c = nextBatch(lockedState, TW);
    const d = nextBatch(lockedState, TW);
    expect(c.names.map((x) => x.text)).toEqual(d.names.map((x) => x.text));
    expect(c.names[2].text).toBe(a.names[2].text);
    expect(c.names[5].text).toBe(a.names[5].text);
    expect(new Set(c.names.map((x) => x.text)).size).toBe(8);
  });

  it('沒有填種子時每次用隨機的種子，記下來就能重現', () => {
    let i = 0;
    const random = () => [0.11, 0.52, 0.93, 0.34, 0.75, 0.16][i++ % 6];
    const a = nextBatch(state({ region: 'tw', count: 5 }), TW, random);
    expect(a.seed).toMatch(/^[a-z2-9]{6}$/);
    const again = nextBatch(state({ region: 'tw', count: 5, seed: a.seed }), TW);
    expect(again.names).toEqual(a.names);
  });

  it('依地區記住的年代與性別產生', () => {
    const s = state({
      region: 'jp',
      eras: { ...initialState.eras, jp: 'taisho' },
      gender: 'female',
      count: 12,
      seed: 'era',
    });
    const { names } = nextBatch(s, JP);
    expect(names).toHaveLength(12);
    expect(names.every((x) => x.era === 'taisho' && x.gender === 'female')).toBe(true);
  });
});

describe('複製的文字', () => {
  const jp: GeneratedName = {
    region: 'jp',
    era: 'modern',
    gender: 'male',
    family: '佐藤',
    given: '博',
    familyReading: 'さとう',
    givenReading: 'ひろし',
    text: '佐藤 博',
  };

  it('預設只有全名；附上讀音時用畫面上有顯示的讀音', () => {
    const show = { hiragana: true, katakana: false, romaji: true };
    expect(copyLine(jp, { show, copyReading: false })).toBe('佐藤 博');
    expect(copyLine(jp, { show, copyReading: true })).toBe(
      '佐藤 博（さとう ひろし／Satou Hiroshi）',
    );
    expect(shownReadings(jp, { hiragana: false, katakana: true, romaji: false })).toEqual([
      'サトウ ヒロシ',
    ]);
    expect(
      copyLine(jp, {
        show: { hiragana: false, katakana: false, romaji: false },
        copyReading: true,
      }),
    ).toBe('佐藤 博');
    expect(copyLine(n('陳家豪'), { show, copyReading: true })).toBe('陳家豪');
  });

  it('全部複製：一行一個', () => {
    expect(
      copyAllText([jp, n('陳家豪')], {
        show: initialState.show,
        copyReading: false,
      }),
    ).toBe('佐藤 博\n陳家豪');
  });
});

describe('sanitizeState', () => {
  it('壞掉的存檔回到預設值，看得懂的留著', () => {
    expect(sanitizeState(null)).toEqual(initialState);
    const s = sanitizeState({
      region: 'us',
      eras: { us: 'born1920', jp: 'nope' },
      gender: 'female',
      count: 999,
      names: [n('陳家豪'), { text: 'x' }, null],
      locked: ['陳家豪', '不存在', 3],
      seed: 5,
      show: { katakana: false },
    });
    expect(s.region).toBe('us');
    expect(s.eras).toEqual({ ...initialState.eras, us: 'born1920' });
    expect(s.gender).toBe('female');
    expect(s.count).toBe(50);
    expect(s.names.map((x) => x.text)).toEqual(['陳家豪']);
    expect(s.locked).toEqual(['陳家豪']);
    expect(s.seed).toBe('');
    expect(s.show).toEqual({ hiragana: true, katakana: false, romaji: true });
    expect(sanitizeState({ count: 0 }).count).toBe(10);
    expect(sanitizeState({ count: -3 }).count).toBe(1);
  });
});

describe('紀錄', () => {
  const entry = (at: number, text = `名${at}`): HistoryEntry => ({
    id: String(at),
    at,
    region: 'tw',
    era: 'now',
    gender: 'any',
    seed: 's',
    names: [n(`陳${text}`)],
  });

  it('新的在前、最多 20 筆；1 秒內接連產生的取代上一筆', () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) h = pushHistory(h, entry(i * 5000));
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0].at).toBe(24 * 5000);
    expect(h[19].at).toBe(5 * 5000);
    const merged = pushHistory(h, entry(24 * 5000 + 400));
    expect(merged).toHaveLength(HISTORY_MAX);
    expect(merged[0].at).toBe(24 * 5000 + 400);
    expect(merged[1].at).toBe(23 * 5000);
  });

  it('讀回時丟掉壞掉的；標題', () => {
    const ok = entry(1);
    expect(
      sanitizeHistory([ok, null, { at: 'x' }, { ...ok, names: [] }, { ...ok, region: 'xx' }]),
    ).toEqual([ok]);
    expect(sanitizeHistory('nope')).toEqual([]);
    expect(historyLabel({ region: 'jp', era: 'taisho', gender: 'female' })).toBe(
      '日本・大正～昭和初期・女',
    );
    expect(historyLabel({ region: 'tw', era: 'now', gender: 'any' })).toBe('台灣・不限');
    expect(historyLabel({ region: 'us', era: 'born1920', gender: 'male' })).toBe(
      '美國・1920 年代出生・男',
    );
  });
});

describe('匯出', () => {
  const jp: GeneratedName = {
    region: 'jp',
    era: 'showa',
    gender: 'female',
    family: '佐藤',
    given: '和子',
    familyReading: 'さとう',
    givenReading: 'かずこ',
    text: '佐藤 和子',
  };
  const us: GeneratedName = {
    region: 'us',
    era: 'adult1920',
    gender: 'male',
    family: "O'Brien",
    given: 'Harold',
    middle: 'J.',
    text: "Harold J. O'Brien",
  };

  it('檔名、TXT（同全部複製、CRLF）', () => {
    expect(exportFileName('csv', new Date(2026, 9, 29, 9, 5))).toBe('NPC名字_20261029-0905.csv');
    expect(toTxt([jp, us], { show: initialState.show, copyReading: false })).toBe(
      "佐藤 和子\r\nHarold J. O'Brien\r\n",
    );
    expect(toTxt([jp], { show: initialState.show, copyReading: true })).toBe(
      '佐藤 和子（さとう かずこ／サトウ カズコ／Satou Kazuko）\r\n',
    );
  });

  it('CSV 的欄位：讀音三種都填（不看顯示設定），其他地區留白', () => {
    expect(csvRows([jp, us])).toEqual([
      [...CSV_HEADER],
      [
        '佐藤 和子',
        '佐藤',
        '和子',
        '',
        '女',
        '日本',
        '昭和中後期',
        'さとう かずこ',
        'サトウ カズコ',
        'Satou Kazuko',
      ],
      ["Harold J. O'Brien", "O'Brien", 'Harold', 'J.', '男', '美國', '1920 年代', '', '', ''],
    ]);
  });
});
