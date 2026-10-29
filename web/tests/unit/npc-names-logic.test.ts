/**
 * NPC 名字產生器的邏輯：鎖定後再產生的合併、同一個種子與鎖定重現同一批、複製的文字、讀回存檔的整理。
 * 2026-10：弄墨 Inknomu 的考據語料（8 個地區、年代選項分兩組、中性、階級、國家、涵義、CSV 的新欄位、舊存檔）。
 */
import { describe, expect, it } from 'vitest';
import { type GeneratedName, parseNameData } from '@/core/names';
import type { CorpusData, CorpusName } from '@/core/names/corpus';
import * as jpCorpus from '@/core/names/inknomu/inknomu-jp';
import * as nordicCorpus from '@/core/names/inknomu/inknomu-nordic';
import * as ruCorpus from '@/core/names/inknomu/inknomu-ru';
import * as ukCorpus from '@/core/names/inknomu/inknomu-uk';
import * as jpRaw from '@/core/names/jp/names-jp';
import * as twRaw from '@/core/names/tw/names-tw';
import {
  CSV_HEADER,
  copyAllText,
  copyLine,
  corpusDetails,
  csvRows,
  currentEra,
  effectiveConditions,
  eraOptions,
  exportFileName,
  fromCurrentSource,
  HISTORY_MAX,
  type HistoryEntry,
  historyLabel,
  initialState,
  isCorpusName,
  mergeBatch,
  type NamesState,
  type NpcName,
  nextBatch,
  PART_LABELS,
  parseRef,
  partOptions,
  pushHistory,
  refToString,
  sanitizeHistory,
  sanitizeState,
  searchCopyLine,
  searchReadings,
  shownReadings,
  storeHistory,
  storeHistoryName,
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
    expect(
      names.every((x) => !isCorpusName(x) && x.era === 'taisho' && x.gender === 'female'),
    ).toBe(true);
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
    const show = { ...initialState.show, hiragana: true, katakana: false, romaji: true };
    expect(copyLine(jp, { show, copyReading: false })).toBe('佐藤 博');
    expect(copyLine(jp, { show, copyReading: true })).toBe(
      '佐藤 博（さとう ひろし／Satou Hiroshi）',
    );
    expect(
      shownReadings(jp, { ...initialState.show, hiragana: false, katakana: true, romaji: false }),
    ).toEqual(['サトウ ヒロシ']);
    expect(
      copyLine(jp, {
        show: { ...initialState.show, hiragana: false, katakana: false, romaji: false },
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
    expect(s.show).toEqual({
      hiragana: true,
      katakana: false,
      romaji: true,
      original: true,
      meaning: true,
    });
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
    expect(historyLabel({ region: 'tw', era: 'now', gender: 'any' })).toBe('台灣・現今・不限');
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
        '',
        '',
        '',
      ],
      [
        "Harold J. O'Brien",
        "O'Brien",
        'Harold',
        'J.',
        '男',
        '美國',
        '1920 年代',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
  });
});

/* ---------- 2026-10：弄墨 Inknomu 的考據語料 ---------- */

const corpus = (region: CorpusData['region'], m: { PACKS: CorpusData['packs'] }): CorpusData => ({
  region,
  packs: m.PACKS,
});
const JP_CORPUS = corpus('jp', jpCorpus);
const UK_CORPUS = corpus('uk', ukCorpus);
const RU_CORPUS = corpus('ru', ruCorpus);
const NORDIC_CORPUS = corpus('nordic', nordicCorpus);

describe('地區與年代的選項', () => {
  it('8 個地區；年代＝人數名單在前、語料的包在後；預設是第一個', () => {
    expect(Object.keys(initialState.eras)).toEqual([
      'jp',
      'tw',
      'kr',
      'uk',
      'us',
      'ru',
      'nordic',
      'fantasy',
    ]);
    const jp = eraOptions('jp');
    expect(jp.map((o) => o.label)).toEqual([
      '現代',
      '昭和中後期',
      '大正～昭和初期',
      '戰國時代（1467–1615）',
      '江戶時代（1603–1868）',
      '大正時代（1912–1926，含明治後期）',
      '昭和時代（1926–1989）',
      '平成令和時代（1989–今）',
      '珍稀難讀姓名',
    ]);
    expect(jp.map((o) => o.source.kind)).toEqual([
      ...Array(3).fill('count'),
      ...Array(6).fill('corpus'),
    ]);
    expect(eraOptions('tw').map((o) => o.id)).toEqual([
      'now',
      'tw-qing',
      'tw-japanese',
      'tw-modern',
      'tw-y2k',
      'tw-wuxia',
    ]);
    expect(eraOptions('us').map((o) => o.id)).toEqual([
      'adult1920',
      'born1920',
      'us-classic',
      'us-modern',
      'us-latino',
      'us-african-american',
    ]);
    expect(eraOptions('kr').map((o) => o.id)).toEqual(['kr-modern']);
    expect(initialState.eras).toMatchObject({
      jp: 'modern',
      tw: 'now',
      kr: 'kr-modern',
      uk: 'uk-medieval',
      us: 'adult1920',
      ru: 'ru-imperial',
      nordic: 'nordic-viking',
      fantasy: 'fantasy-human',
    });
    expect(eraOptions('jp')[4].hint).toBeTruthy();
    expect(currentEra({ region: 'uk', eras: { ...initialState.eras, uk: 'nope' } }).id).toBe(
      'uk-medieval',
    );
  });

  it('實際用的條件：中性只在有中性名的包；階級、國家只在有標記的包', () => {
    const s = (patch: Partial<NamesState>) =>
      state({ gender: 'neutral', rank: 'noble', country: 'se', ...patch });
    expect(effectiveConditions(s({ region: 'jp' }))).toEqual({
      gender: 'any',
      rank: 'all',
      country: 'all',
      part: 'full',
    });
    expect(
      effectiveConditions(s({ region: 'jp', eras: { ...initialState.eras, jp: 'jp-edo' } })),
    ).toEqual({
      gender: 'any',
      rank: 'noble',
      country: 'all',
      part: 'full',
    });
    expect(
      effectiveConditions(s({ region: 'uk', eras: { ...initialState.eras, uk: 'uk-modern' } })),
    ).toEqual({
      gender: 'neutral',
      rank: 'noble',
      country: 'all',
      part: 'full',
    });
    expect(
      effectiveConditions(
        s({ region: 'nordic', eras: { ...initialState.eras, nordic: 'nordic-modern' } }),
      ),
    ).toEqual({ gender: 'neutral', rank: 'all', country: 'se', part: 'full' });
  });
});

describe('nextBatch（考據語料）', () => {
  const uk = (patch: Partial<NamesState> = {}) =>
    state({
      region: 'uk',
      eras: { ...initialState.eras, uk: 'uk-regency' },
      count: 12,
      seed: 'inknomu',
      ...patch,
    });

  it('同樣的種子、條件與鎖定，產生同樣的一批；鎖定的留在原位、不重複', () => {
    const a = nextBatch(uk(), UK_CORPUS);
    expect(a.names).toHaveLength(12);
    expect(a.names.every((n) => isCorpusName(n) && n.pack === 'uk-regency')).toBe(true);
    expect(nextBatch(uk(), UK_CORPUS).names).toEqual(a.names);
    const locked = uk({ names: a.names, locked: [a.names[3].text, a.names[7].text] });
    const b = nextBatch(locked, UK_CORPUS);
    expect(nextBatch(locked, UK_CORPUS).names).toEqual(b.names);
    expect(b.names[3]).toEqual(a.names[3]);
    expect(b.names[7]).toEqual(a.names[7]);
    expect(new Set(b.names.map((n) => n.text)).size).toBe(12);
    /* 條件改了結果不同：階級、性別 */
    expect(nextBatch(uk({ rank: 'noble' }), UK_CORPUS).names).not.toEqual(a.names);
    const neutral = nextBatch(uk({ gender: 'neutral', count: 5 }), UK_CORPUS).names;
    expect(neutral.every((n) => n.gender === 'neutral')).toBe(true);
  });

  it('資料不對（還沒載入那一種）時是空的一批', () => {
    expect(nextBatch(uk(), parseNameData('tw', twRaw)).names).toEqual([]);
    expect(nextBatch(state({ region: 'tw', count: 3 }), UK_CORPUS).names).toEqual([]);
  });

  it('國家（北歐）與維京的父名', () => {
    const se = nextBatch(
      state({
        region: 'nordic',
        eras: { ...initialState.eras, nordic: 'nordic-modern' },
        country: 'se',
        seed: 'se',
        count: 20,
      }),
      NORDIC_CORPUS,
    ).names as CorpusName[];
    const nm = NORDIC_CORPUS.packs[1];
    for (const n of se) {
      const s = nm.surnames.find((x) => x.s === n.family);
      expect(!s?.countries || s.countries.includes('se'), n.family).toBe(true);
    }
    const viking = nextBatch(
      state({ region: 'nordic', seed: 'v', count: 20 }),
      NORDIC_CORPUS,
    ).names;
    expect(viking.every((n) => /(son|dóttir)( |$)/.test(n.text))).toBe(true);
  });

  it('這一批是不是目前的地區與年代產生的', () => {
    const s = uk();
    const [name] = nextBatch(s, UK_CORPUS).names;
    expect(fromCurrentSource(name, s)).toBe(true);
    expect(fromCurrentSource(name, uk({ eras: { ...initialState.eras, uk: 'uk-modern' } }))).toBe(
      false,
    );
    expect(fromCurrentSource(n('陳家豪'), state({ region: 'tw' }))).toBe(true);
    expect(
      fromCurrentSource(
        n('陳家豪'),
        state({ region: 'tw', eras: { ...initialState.eras, tw: 'tw-qing' } }),
      ),
    ).toBe(false);
  });
});

describe('考據語料的名字：讀音、複製、CSV、紀錄', () => {
  const kana: CorpusName = {
    pack: 'jp-edo',
    region: 'jp',
    gender: 'male',
    family: '稲生',
    given: '主水',
    familyReading: 'いのう',
    givenReading: 'もんど',
    text: '稲生 主水',
    meanings: ['姓：旗本。', '名：借自主水司之名。'],
    notes: ['百官名。'],
    extras: [],
  };
  const ru: CorpusName = {
    pack: 'ru-imperial',
    region: 'ru',
    gender: 'female',
    family: 'Ivanova',
    given: 'Anna',
    original: 'Анна Иванова',
    text: 'Anna Ivanova',
    meanings: ['名：恩典（希伯來語）', 'Ivan（伊凡）之子'],
    notes: [],
    extras: ['暱稱 Anya', '姓氏男性形 Ivanov'],
  };

  it('日本的包用平假名、片假名、羅馬拼音；其他是原文／拼音一行（開關）', () => {
    expect(shownReadings(kana, initialState.show)).toEqual([
      'いのう もんど',
      'イノウ モンド',
      'Inou Mondo',
    ]);
    expect(shownReadings(ru, initialState.show)).toEqual(['Анна Иванова']);
    expect(shownReadings(ru, { ...initialState.show, original: false })).toEqual([]);
    expect(
      shownReadings(ru, { ...initialState.show, hiragana: false, katakana: false, romaji: false }),
    ).toEqual(['Анна Иванова']);
  });

  it('複製：附讀音時附上原文／拼音；涵義不附', () => {
    const on = { show: initialState.show, copyReading: true };
    expect(copyLine(ru, on)).toBe('Anna Ivanova（Анна Иванова）');
    expect(copyLine(kana, { ...on, show: { ...initialState.show, katakana: false } })).toBe(
      '稲生 主水（いのう もんど／Inou Mondo）',
    );
    expect(
      copyLine(ru, { show: { ...initialState.show, original: false }, copyReading: true }),
    ).toBe('Anna Ivanova');
    expect(copyAllText([kana, ru], { show: initialState.show, copyReading: false })).toBe(
      '稲生 主水\nAnna Ivanova',
    );
  });

  it('CSV：原文／拼音、涵義（依姓名順序，以「；」分開）、備註（名的備註、綽號、暱稱、姓的另一形）', () => {
    const rows = csvRows([kana, ru]);
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows[0].slice(-3)).toEqual(['原文／拼音', '涵義', '備註']);
    expect(rows[1]).toEqual([
      '稲生 主水',
      '稲生',
      '主水',
      '',
      '男',
      '日本',
      '江戶時代（1603–1868）',
      'いのう もんど',
      'イノウ モンド',
      'Inou Mondo',
      '',
      '姓：旗本。；名：借自主水司之名。',
      '百官名。',
    ]);
    expect(rows[2]).toEqual([
      'Anna Ivanova',
      'Ivanova',
      'Anna',
      '',
      '女',
      '俄羅斯',
      '帝俄時代（1721–1917）',
      '',
      '',
      '',
      'Анна Иванова',
      '名：恩典（希伯來語）；Ivan（伊凡）之子',
      '暱稱 Anya；姓氏男性形 Ivanov',
    ]);
    const neutral = { ...ru, gender: 'neutral' as const };
    expect(csvRows([neutral])[1][4]).toBe('中性');
  });

  it('實際的資料：俄羅斯的女性形與暱稱；日本的包的讀音', () => {
    const female = nextBatch(
      state({ region: 'ru', gender: 'female', seed: 'ru', count: 30 }),
      RU_CORPUS,
    ).names as CorpusName[];
    expect(female.some((n) => n.extras.some((e) => e.startsWith('姓氏男性形 ')))).toBe(true);
    expect(female.every((n) => n.text === `${n.given} ${n.family}`)).toBe(true);
    const jp = nextBatch(
      state({ region: 'jp', eras: { ...initialState.eras, jp: 'jp-showa' }, seed: 'k', count: 20 }),
      JP_CORPUS,
    ).names;
    for (const x of jp) expect(shownReadings(x, initialState.show)).toHaveLength(3);
  });

  it('紀錄：標題含語料的年代、階級、國家、中性；讀回時保留語料的名字', () => {
    expect(historyLabel({ region: 'uk', era: 'uk-regency', gender: 'female', rank: 'noble' })).toBe(
      '英國・攝政時代（1780–1837）・貴族・女',
    );
    expect(
      historyLabel({ region: 'nordic', era: 'nordic-modern', gender: 'neutral', country: 'dk' }),
    ).toBe('北歐・現代（1990–今）・丹麥・中性');
    expect(historyLabel({ region: 'kr', era: 'kr-modern', gender: 'any' })).toBe('韓國・不限');
    const entry: HistoryEntry = {
      id: '1',
      at: 1,
      region: 'ru',
      era: 'ru-imperial',
      gender: 'female',
      seed: 's',
      names: [
        ru,
        { ...ru, pack: 'nope' } as CorpusName,
        { ...ru, region: 'jp' } as unknown as CorpusName,
      ],
    };
    const [back] = sanitizeHistory([{ ...entry, rank: 'all', country: 'xx' }]);
    expect(back.names).toEqual([ru]);
    expect(back.rank).toBeUndefined();
    expect(back.country).toBeUndefined();
  });
});

describe('存檔相容（2026-10 以前的存檔）', () => {
  it('只有日本、台灣、美國與舊年代 id 的存檔照常讀入，新欄位用預設值', () => {
    const old = {
      region: 'us',
      eras: { jp: 'showa', tw: 'now', us: 'born1920' },
      gender: 'female',
      count: 12,
      middleInitial: true,
      show: { hiragana: true, katakana: false, romaji: true },
      copyReading: true,
      seed: 'abc',
      names: [
        {
          region: 'us',
          era: 'born1920',
          gender: 'female',
          family: 'Smith',
          given: 'Mary',
          middle: 'J.',
          text: 'Mary J. Smith',
        },
      ],
      locked: ['Mary J. Smith'],
      lastSeed: 'abc',
    };
    const s = sanitizeState(old);
    expect(s).toEqual({
      ...initialState,
      region: 'us',
      eras: { ...initialState.eras, jp: 'showa', us: 'born1920' },
      gender: 'female',
      count: 12,
      middleInitial: true,
      show: { hiragana: true, katakana: false, romaji: true, original: true, meaning: true },
      copyReading: true,
      seed: 'abc',
      names: old.names,
      locked: ['Mary J. Smith'],
      lastSeed: 'abc',
    });
    expect(fromCurrentSource(s.names[0], s)).toBe(true);
  });

  it('新的欄位：壞掉的用預設值；看不懂的包、地區與包不合的名字丟掉', () => {
    const name: NpcName = {
      pack: 'uk-modern',
      region: 'uk',
      gender: 'neutral',
      family: 'Smith',
      given: 'Alex',
      text: 'Alex Smith',
      meanings: ['名：x', 3, '姓：y'],
      notes: 'nope',
      extras: [],
    } as unknown as NpcName;
    const s = sanitizeState({
      region: 'fantasy',
      eras: { fantasy: 'fantasy-orc', uk: 'jp-edo', nordic: 'nordic-modern' },
      gender: 'neutral',
      rank: 'royal',
      country: 'is',
      show: { original: false, meaning: 0 },
      names: [
        name,
        { ...name, pack: 'uk-x' },
        { ...name, region: 'us' },
        { ...name, gender: 'any' },
      ],
    });
    expect(s.region).toBe('fantasy');
    expect(s.eras).toEqual({
      ...initialState.eras,
      fantasy: 'fantasy-orc',
      nordic: 'nordic-modern',
    });
    expect(s.gender).toBe('neutral');
    expect(s.rank).toBe('all');
    expect(s.country).toBe('all');
    expect(s.show.original).toBe(false);
    expect(s.show.meaning).toBe(true);
    expect(s.names).toEqual([{ ...name, meanings: ['名：x', '姓：y'], notes: [] }]);
  });
});

describe('輸出：全名、只有名、只有姓', () => {
  const eras = (patch: Partial<NamesState['eras']>) => ({ ...initialState.eras, ...patch });

  it('可以選的輸出：台灣沒有；維京沒有「只有姓」；不能選時當作全名（記住的不變）', () => {
    expect(partOptions(state({ region: 'tw' }))).toEqual([]);
    expect(partOptions(state({ region: 'tw', eras: eras({ tw: 'tw-wuxia' }) }))).toEqual([]);
    expect(partOptions(state({ region: 'jp' }))).toEqual(['full', 'given', 'family']);
    expect(partOptions(state({ region: 'nordic' }))).toEqual(['full', 'given']);
    expect(
      partOptions(state({ region: 'nordic', eras: eras({ nordic: 'nordic-modern' }) })),
    ).toEqual(['full', 'given', 'family']);
    expect(effectiveConditions(state({ region: 'nordic', part: 'family' })).part).toBe('full');
    expect(effectiveConditions(state({ region: 'tw', part: 'given' })).part).toBe('full');
    expect(effectiveConditions(state({ region: 'uk', part: 'family' })).part).toBe('family');
    expect(PART_LABELS).toEqual({ full: '全名', given: '只有名', family: '只有姓' });
  });

  it('人數名單與語料都照輸出產生；不重複以那一段判斷；CSV 的姓、名欄照實填', () => {
    const jpFamily = nextBatch(
      state({ region: 'jp', part: 'family', count: 30, seed: 'p' }),
      JP,
    ).names;
    expect(jpFamily.every((n) => n.text === n.family && n.given === '')).toBe(true);
    expect(new Set(jpFamily.map((n) => n.text)).size).toBe(30);
    expect(shownReadings(jpFamily[0], initialState.show)).toHaveLength(3);
    const twGiven = nextBatch(
      state({ region: 'tw', part: 'given', count: 5, seed: 'p' }),
      TW,
    ).names;
    expect(twGiven.every((n) => n.text === `${n.family}${n.given}`)).toBe(true);
    const ukGiven = nextBatch(
      state({ region: 'uk', part: 'given', count: 10, seed: 'p' }),
      UK_CORPUS,
    ).names;
    expect(ukGiven.every((n) => n.text === n.given && n.family === '')).toBe(true);
    const rows = csvRows(ukGiven);
    expect(rows[1].slice(0, 3)).toEqual([ukGiven[0].text, '', ukGiven[0].text]);
    expect(rows[1][11]).toMatch(/^名：/);
    const csvFamily = csvRows(jpFamily);
    expect(csvFamily[1].slice(0, 3)).toEqual([jpFamily[0].text, jpFamily[0].text, '']);
  });

  it('紀錄的標題寫輸出；讀回時保留', () => {
    expect(historyLabel({ region: 'uk', era: 'uk-modern', gender: 'any', part: 'given' })).toBe(
      '英國・現代（1990–今）・不限・只有名',
    );
    const ukGiven = nextBatch(
      state({ region: 'uk', part: 'given', count: 2, seed: 'p' }),
      UK_CORPUS,
    ).names;
    const [back] = sanitizeHistory([
      {
        id: 'x',
        at: 1,
        region: 'uk',
        era: 'uk-medieval',
        gender: 'any',
        part: 'given',
        seed: 'p',
        names: ukGiven,
      },
    ]);
    expect(back.part).toBe('given');
    expect(back.names).toEqual(ukGiven);
    expect(sanitizeState({ part: 'family' }).part).toBe('family');
    expect(sanitizeState({ part: 'middle' }).part).toBe('full');
  });
});

describe('查名字的讀音與複製', () => {
  it('日本是三種假名與羅馬拼音、其他是原文／拼音（和寫法相同時不列）；附不附讀音同 F27', () => {
    const show = initialState.show;
    expect(searchReadings({ text: '伊達', reading: 'だて' }, 'jp', show)).toEqual([
      'だて',
      'ダテ',
      'Date',
    ]);
    expect(searchReadings({ text: '김', reading: 'Gim' }, 'kr', show)).toEqual(['Gim']);
    expect(searchReadings({ text: 'Ragnar', reading: 'Ragnar' }, 'nordic', show)).toEqual([]);
    expect(
      searchReadings({ text: '김', reading: 'Gim' }, 'kr', { ...show, original: false }),
    ).toEqual([]);
    expect(
      searchCopyLine({ text: '伊達', reading: 'だて' }, 'jp', { show, copyReading: false }),
    ).toBe('伊達');
    expect(
      searchCopyLine({ text: '伊達', reading: 'だて' }, 'jp', {
        show: { ...show, katakana: false },
        copyReading: true,
      }),
    ).toBe('伊達（だて／Date）');
    expect(searchCopyLine({ text: 'Smith' }, 'uk', { show, copyReading: true })).toBe('Smith');
  });
});

describe('考據語料的說明行（原站的排法）', () => {
  it('涵義一段一行、備註一行（「、」）、暱稱與姓的另一形一行（「，」）', () => {
    expect(
      corpusDetails({
        meanings: ['名：熊', '父名：Ragnar 之子'],
        notes: ['薩迦常見人名', '綽號 the Red：紅髮或紅鬍'],
        extras: [],
      }),
    ).toEqual([
      { text: '名：熊', muted: false },
      { text: '父名：Ragnar 之子', muted: false },
      { text: '薩迦常見人名、綽號 the Red：紅髮或紅鬍', muted: true },
    ]);
    expect(
      corpusDetails({
        meanings: ['名：保衛者'],
        notes: [],
        extras: ['暱稱 Sasha', '姓氏女性形 Ivanova'],
      }),
    ).toEqual([
      { text: '名：保衛者', muted: false },
      { text: '暱稱 Sasha，姓氏女性形 Ivanova', muted: true },
    ]);
  });

  it('實際的資料：姓在前的地區先「姓：」、名在前的先「名：」', () => {
    const jp = nextBatch(
      state({ region: 'jp', eras: { ...initialState.eras, jp: 'jp-edo' }, seed: 'o', count: 5 }),
      JP_CORPUS,
    ).names as CorpusName[];
    for (const x of jp) expect(x.meanings.map((m) => m.slice(0, 2))).toEqual(['姓：', '名：']);
    const uk = nextBatch(state({ region: 'uk', seed: 'o', count: 5 }), UK_CORPUS)
      .names as CorpusName[];
    for (const x of uk) expect(x.meanings.map((m) => m.slice(0, 2))).toEqual(['名：', '姓：']);
  });
});

describe('紀錄的精簡格式（2026-10 驗證後的裁定）', () => {
  const entry = (
    names: NpcName[],
    region: HistoryEntry['region'] = 'ru',
    era = 'ru-imperial',
  ): HistoryEntry => ({
    id: 'x',
    at: 1,
    region,
    era,
    gender: 'any',
    seed: 's',
    names,
  });

  it('查回鍵的字串', () => {
    expect(refToString({ g: 'm12', s: 3, f: 5, e: 7 })).toBe('m12.s3.f5.e7');
    expect(refToString({ g: 'u0' })).toBe('u0');
    expect(parseRef('m12.s3.f5.e7')).toEqual({ g: 'm12', s: 3, f: 5, e: 7 });
    expect(parseRef('f4.e0')).toEqual({ g: 'f4', e: 0 });
    for (const bad of ['', 'x1', 'm', 'm1.q2', 3, null]) expect(parseRef(bad)).toBeUndefined();
  });

  it('語料的名字只存名字、讀音與查回鍵；讀回來時沒有涵義（放回時再查回）；人數名單照舊', () => {
    const ru = nextBatch(state({ region: 'ru', gender: 'female', seed: 'h', count: 5 }), RU_CORPUS)
      .names as CorpusName[];
    const stored = storeHistoryName(ru[0]);
    expect(Object.keys(stored).sort()).toEqual(
      ['f', 'g', 'k', 'o', 'r', 't', 'x'].filter((k) => k in stored).sort(),
    );
    expect(stored).toMatchObject({
      k: 'ru-imperial',
      x: 'f',
      t: ru[0].text,
      f: ru[0].family,
      g: ru[0].given,
    });
    expect(JSON.stringify(stored)).not.toContain('meanings');
    const [back] = sanitizeHistory(storeHistory([entry(ru)]));
    expect(back.names).toEqual(ru.map((n) => ({ ...n, meanings: [], notes: [], extras: [] })));
    /* 複製用的讀音還在 */
    expect(copyLine(back.names[0], { show: initialState.show, copyReading: true })).toBe(
      copyLine(ru[0], { show: initialState.show, copyReading: true }),
    );
    const count = n('陳家豪');
    expect(storeHistory([entry([count], 'tw', 'now')])[0].names[0]).toEqual(count);
    /* 2026-10 驗證前的完整格式照常讀入 */
    expect(sanitizeHistory([entry(ru)])[0].names).toEqual(ru);
  });

  it('大小：20 批 × 50 個，最大的包也比完整格式小一半以上（量測值寫在規格 F30）', () => {
    const packs = [
      ['jp', JP_CORPUS, 'jp-sengoku'],
      ['nordic', NORDIC_CORPUS, 'nordic-viking'],
    ] as const;
    for (const [region, data, era] of packs) {
      const history = Array.from({ length: 20 }, (_, b) =>
        entry(
          nextBatch(
            state({
              region,
              eras: { ...initialState.eras, [region]: era },
              seed: `size-${b}`,
              count: 50,
            }),
            data,
          ).names,
          region,
          era,
        ),
      );
      const full = JSON.stringify(history).length;
      const stored = JSON.stringify(storeHistory(history)).length;
      expect(stored, era).toBeLessThan(full * 0.5);
      expect(stored, era).toBeLessThan(140_000);
    }
  });
});
