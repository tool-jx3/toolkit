/**
 * core/names：資料（核對幾個已知的數字）、加權抽籤的分布、種子、不重複、性別、讀音。
 */
import { describe, expect, it } from 'vitest';
import {
  drawName,
  eraOf,
  generateNames,
  kanaToRomaji,
  loadNameData,
  NAME_COUNT_MAX,
  NAME_REGIONS,
  type NameData,
  type NameGender,
  type NameRegion,
  nameReadings,
  parseNameData,
  pickWeighted,
  poolSize,
  randomSeed,
  seededRandom,
  toKatakana,
} from '@/core/names';
import * as jpRaw from '@/core/names/jp/names-jp';
import * as twRaw from '@/core/names/tw/names-tw';
import * as usRaw from '@/core/names/us/names-us';
import { createRandom } from '@/core/timeline/random';

const DATA: Record<NameRegion, NameData> = {
  jp: parseNameData('jp', jpRaw),
  tw: parseNameData('tw', twRaw),
  us: parseNameData('us', usRaw),
};

/** 名單裡某一筆的人數 */
function weightOf(data: NameData, pool: 'family' | NameGender, text: string, era: string) {
  const p = data[pool];
  const i = p.texts.indexOf(text);
  return i < 0 ? 0 : p.weights[era][i];
}

/** 名單裡人數最多的前 n 筆（文字） */
function topOf(data: NameData, pool: 'family' | NameGender, era: string, n: number) {
  const p = data[pool];
  return p.texts
    .map((t, i) => [t, p.weights[era][i]] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

describe('資料', () => {
  it('筆數與欄位', () => {
    expect(DATA.jp.family.texts.length).toBe(1868);
    expect(DATA.jp.male.texts.length).toBe(6186);
    expect(DATA.jp.female.texts.length).toBe(1551);
    expect(DATA.tw.family.texts.length).toBe(1753);
    expect(DATA.tw.male.texts.length).toBe(100);
    expect(DATA.tw.female.texts.length).toBe(100);
    expect(DATA.us.family.texts.length).toBe(1000);
    expect(DATA.us.male.texts.length).toBe(1183);
    expect(DATA.us.female.texts.length).toBe(1225);
    for (const data of Object.values(DATA)) {
      for (const pool of [data.family, data.male, data.female]) {
        for (const w of Object.values(pool.weights)) {
          expect(w.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
        }
      }
    }
  });

  it('每個年代每份名單都抽得到東西', () => {
    for (const region of NAME_REGIONS) {
      for (const era of region.eras) {
        const data = DATA[region.id];
        expect(poolSize(data.family, era.id)).toBeGreaterThan(90);
        expect(poolSize(data.male, era.id)).toBeGreaterThanOrEqual(100);
        expect(poolSize(data.female, era.id)).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('台灣：內政部 112 年全國姓名統計分析的數字', () => {
    const tw = DATA.tw;
    expect(tw.family.texts.slice(0, 5)).toEqual(['陳', '林', '黃', '張', '李']);
    expect(weightOf(tw, 'family', '陳', 'now')).toBe(2618994);
    expect(weightOf(tw, 'family', '林', 'now')).toBe(1947520);
    expect(weightOf(tw, 'family', '張簡', 'now')).toBe(9162);
    expect(tw.male.texts.slice(0, 3)).toEqual(['家豪', '志明', '建宏']);
    expect(weightOf(tw, 'male', '家豪', 'now')).toBe(14038);
    expect(tw.female.texts.slice(0, 3)).toEqual(['淑芬', '淑惠', '美玲']);
    /* 名字都是兩個字（表五十一沒有單名） */
    expect([...tw.male.texts, ...tw.female.texts].every((t) => [...t].length === 2)).toBe(true);
    /*
     * 原始 CSV 寫兩次的單字姓改回單字（𡍼𡍼 → 𡍼）；私用區的罕用字（18 個、569 人）不收；
     * CJK 相容表意字（杞的異體 U+2F8DB 等 14 個）併進常用的字（杞 461＋87）
     */
    expect(tw.family.texts.some((t) => t.length === 2 && t[0] === t[1])).toBe(false);
    expect(tw.family.texts.some((t) => /[\uE000-\uF8FF]|[\u{F0000}-\u{10FFFF}]/u.test(t))).toBe(
      false,
    );
    expect(weightOf(tw, 'family', '杞', 'now')).toBe(548);
    expect(weightOf(tw, 'family', '屠', 'now')).toBe(639);
    expect(tw.family.texts.some((t) => t.normalize('NFC') !== t)).toBe(false);
    expect(weightOf(tw, 'family', '𡍼', 'now')).toBe(1970);
    /* 驗算：單字姓合計＋拿掉的罕用字 569 人＝報告的單姓人數 23,337,790 */
    const single = tw.family.texts.reduce(
      (sum, t, i) => sum + ([...t].length === 1 ? tw.family.weights.now[i] : 0),
      0,
    );
    expect(single + 569).toBe(23337790);
  });

  it('美國：社會安全局 1920 年代、1880～1909 年的前幾名；1990 年人口普查的姓（依 2000 年的族裔比例降權）', () => {
    const us = DATA.us;
    expect(topOf(us, 'male', 'born1920', 4)).toEqual(['Robert', 'John', 'James', 'William']);
    expect(topOf(us, 'female', 'born1920', 4)).toEqual(['Mary', 'Dorothy', 'Helen', 'Betty']);
    expect(topOf(us, 'male', 'adult1920', 4)).toEqual(['John', 'William', 'James', 'George']);
    expect(topOf(us, 'female', 'adult1920', 3)).toEqual(['Mary', 'Anna', 'Helen']);
    expect(weightOf(us, 'male', 'Robert', 'born1920')).toBe(576314);
    expect(weightOf(us, 'female', 'Mary', 'born1920')).toBe(701682);
    /* 登記錯性別的不收 */
    expect(weightOf(us, 'male', 'Mary', 'born1920')).toBe(0);
    expect(weightOf(us, 'female', 'John', 'adult1920')).toBe(0);
    expect(us.family.texts.slice(0, 5)).toEqual(['Smith', 'Johnson', 'Williams', 'Jones', 'Brown']);
    /*
     * 姓的權重＝1990 年每十萬人的人數 ×（1 − 0.9 ×（西語裔＋亞太裔比例））（2000 年普查的比例）。
     * 1990 年的人數與 2000 年的比例照抄來源，驗算資料檔的值。
     */
    const census: [string, number, number, number][] = [
      /* 姓、1990 年每十萬人、2000 年西語裔 %、亞太裔 % */
      ['Smith', 1006, 1.56, 0.4],
      ['Garcia', 254, 90.81, 1.43],
      ['Martinez', 234, 91.72, 0.6],
      ['Lee', 220, 1.34, 37.83],
      ['Nguyen', 46, 0.58, 95.93],
      ['Kim', 45, 0.5, 94.52],
    ];
    for (const [name, n, h, a] of census) {
      const expected = Math.round(n * (1 - 0.9 * ((h + a) / 100)) * 10) / 10;
      for (const era of ['adult1920', 'born1920']) {
        expect(weightOf(us, 'family', name, era), name).toBeCloseTo(expected, 5);
      }
    }
    /* Garcia 原本是 Smith 的 25%，降權後約 4%；西語裔、亞太裔過半的 10 個常見姓合計不到 2% */
    expect(
      weightOf(us, 'family', 'Garcia', 'born1920') / weightOf(us, 'family', 'Smith', 'born1920'),
    ).toBeLessThan(0.05);
    const total = us.family.cumulative.born1920[us.family.texts.length - 1];
    const minor = [
      'Garcia',
      'Martinez',
      'Rodriguez',
      'Hernandez',
      'Lopez',
      'Gonzalez',
      'Perez',
      'Sanchez',
      'Ramirez',
      'Nguyen',
    ]
      .map((t) => weightOf(us, 'family', t, 'born1920'))
      .reduce((x, y) => x + y, 0);
    expect(minor / total).toBeLessThan(0.02);
    expect(us.family.texts).toContain("O'Brien");
    expect(us.family.texts).toContain('McDonald');
    expect(us.family.texts).toContain('De La Cruz');
    expect(us.family.texts.every((t) => /^[A-Z][A-Za-z' .]*[a-z]$/.test(t))).toBe(true);
  });

  it('日本：常見的姓、各年代的名', () => {
    const jp = DATA.jp;
    expect(new Set(topOf(jp, 'family', 'modern', 10))).toEqual(
      new Set(['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤']),
    );
    expect(topOf(jp, 'male', 'taisho', 10)).toEqual(expect.arrayContaining(['清', '三郎', '一郎']));
    expect(topOf(jp, 'female', 'showa', 3)).toContain('和子');
    expect(topOf(jp, 'male', 'modern', 10)).toContain('誠');
    /* 讀音都是平假名 */
    for (const pool of [jp.family, jp.male, jp.female]) {
      expect(pool.readings.every((r) => /^[ぁ-ゖ]+$/.test(r))).toBe(true);
    }
    /* 「明（あきら）」兩份名單都有，gimei 只列在男性 → 只歸男性（女性的名單裡沒有） */
    const isAkira = (pool: typeof jp.male) => (t: string, i: number) =>
      t === '明' && pool.readings[i] === 'あきら';
    expect(jp.female.texts.findIndex(isAkira(jp.female))).toBe(-1);
    expect(jp.male.texts.findIndex(isAkira(jp.male))).toBeGreaterThanOrEqual(0);
  });

  it('loadNameData：用到才載入，同一個地區只載一次', async () => {
    const a = await loadNameData('tw');
    const b = await loadNameData('tw');
    expect(a).toBe(b);
    expect(a.family.texts).toEqual(DATA.tw.family.texts);
  });
});

describe('加權抽籤', () => {
  it('pickWeighted：人數 0 的不會抽中，邊界', () => {
    const cum = new Float64Array([1, 1, 3]);
    expect(pickWeighted(cum, 0)).toBe(0);
    expect(pickWeighted(cum, 0.33)).toBe(0);
    expect(pickWeighted(cum, 0.34)).toBe(2);
    expect(pickWeighted(cum, 0.9999)).toBe(2);
    expect(pickWeighted(new Float64Array(0), 0.5)).toBe(-1);
  });

  /** 抽 n 次，數某一份名單各筆出現的次數 */
  function tally(region: NameRegion, n: number, pick: 'family' | 'given', era?: string) {
    const random = createRandom(`tally-${region}-${pick}`).next;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const name = drawName(DATA[region], { era, gender: 'male' }, random);
      const key = pick === 'family' ? name.family : name.given;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  /** 前幾名的比例接近資料（相差在 4 個標準差以內） */
  function expectNearData(
    region: NameRegion,
    pool: 'family' | NameGender,
    era: string,
    counts: Map<string, number>,
    n: number,
  ) {
    const p = DATA[region][pool];
    const total = p.cumulative[era][p.cumulative[era].length - 1];
    for (const text of topOf(DATA[region], pool, era, 5)) {
      const expected = weightOf(DATA[region], pool, text, era) / total;
      const observed = (counts.get(text) ?? 0) / n;
      const sigma = Math.sqrt((expected * (1 - expected)) / n);
      expect(Math.abs(observed - expected), `${text} ${observed} vs ${expected}`).toBeLessThan(
        4 * sigma,
      );
    }
  }

  it('大樣本下前幾名的比例接近資料：台灣的姓、美國 1920 年代出生的男性名、日本大正的男性名', () => {
    const n = 40000;
    expectNearData('tw', 'family', 'now', tally('tw', n, 'family'), n);
    expectNearData('us', 'male', 'born1920', tally('us', n, 'given', 'born1920'), n);
    expectNearData('jp', 'male', 'taisho', tally('jp', n, 'given', 'taisho'), n);
    /* 陳約 11.2%、林約 8.3% */
    const tw = tally('tw', n, 'family');
    expect((tw.get('陳') ?? 0) / n).toBeCloseTo(0.112, 1);
    expect((tw.get('林') ?? 0) / n).toBeCloseTo(0.083, 1);
  });

  it('年代不同用不同的人數：美國 1880～1909 年出生的男性名最多是 John，1920 年代出生的前 4 名是 Robert、John、James、William', () => {
    const n = 20000;
    const born = tally('us', n, 'given', 'born1920');
    const adult = tally('us', n, 'given', 'adult1920');
    const top = (m: Map<string, number>, k: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([t]) => t);
    expect(new Set(top(born, 4))).toEqual(new Set(['Robert', 'John', 'James', 'William']));
    expect(top(adult, 1)).toEqual(['John']);
    /* 1920 年代出生才有的名字（Betty 是女性，男性看 Donald）在 1880～1909 年少很多 */
    expect(born.get('Donald') ?? 0).toBeGreaterThan((adult.get('Donald') ?? 0) * 3);
  });
});

describe('generateNames', () => {
  it('種子：同樣的種子與選項結果相同，不同的種子不同', () => {
    for (const region of ['jp', 'tw', 'us'] as const) {
      const a = generateNames(DATA[region], { count: 20, seed: 'abc123' }).names.map((n) => n.text);
      const b = generateNames(DATA[region], { count: 20, seed: 'abc123' }).names.map((n) => n.text);
      const c = generateNames(DATA[region], { count: 20, seed: 'abc124' }).names.map((n) => n.text);
      expect(a).toEqual(b);
      expect(a).not.toEqual(c);
    }
  });

  it('種子＋排除名單也固定；空字串的種子當作沒給', () => {
    const opts = { count: 10, seed: 7, exclude: ['陳家豪'] };
    expect(generateNames(DATA.tw, opts).names).toEqual(generateNames(DATA.tw, opts).names);
    let i = 0;
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const random = () => seq[i++ % seq.length];
    const r = generateNames(DATA.tw, { count: 1, seed: '', random, gender: 'male' });
    expect(r.names).toHaveLength(1);
    expect(i).toBe(2);
  });

  it('同一批不重複，也不和排除的重複', () => {
    for (const region of ['jp', 'tw', 'us'] as const) {
      const { names, exhausted } = generateNames(DATA[region], {
        count: NAME_COUNT_MAX,
        seed: `uniq-${region}`,
      });
      expect(exhausted).toBe(false);
      expect(names).toHaveLength(NAME_COUNT_MAX);
      expect(new Set(names.map((n) => n.text)).size).toBe(NAME_COUNT_MAX);
    }
    const first = generateNames(DATA.tw, { count: 30, seed: 's' }).names.map((n) => n.text);
    const second = generateNames(DATA.tw, { count: 30, seed: 's', exclude: first.slice(0, 10) });
    for (const n of second.names) expect(first.slice(0, 10)).not.toContain(n.text);
  });

  it('不重複的姓名不夠時產生得比較少（exhausted）', () => {
    const tiny = parseNameData('tw', { FAMILY: '王,1', MALE: '大明,1\n小明,1', FEMALE: '美美,1' });
    const r = generateNames(tiny, { count: 5, gender: 'male', seed: 1 });
    expect(r.names.map((n) => n.text).sort()).toEqual(['王大明', '王小明']);
    expect(r.exhausted).toBe(true);
    expect(generateNames(tiny, { count: 999, seed: 1 }).names.length).toBeLessThanOrEqual(3);
  });

  it('性別：男、女只出現那個性別的名字；不限時兩種都有、各約一半', () => {
    for (const region of ['jp', 'tw', 'us'] as const) {
      const data = DATA[region];
      for (const gender of ['male', 'female'] as const) {
        const { names } = generateNames(data, { count: 50, gender, seed: gender });
        expect(names.every((n) => n.gender === gender)).toBe(true);
        expect(names.every((n) => data[gender].texts.includes(n.given))).toBe(true);
      }
    }
    const random = createRandom('any').next;
    let male = 0;
    for (let i = 0; i < 4000; i++) if (drawName(DATA.tw, {}, random).gender === 'male') male++;
    expect(male / 4000).toBeGreaterThan(0.46);
    expect(male / 4000).toBeLessThan(0.54);
  });

  it('全名的寫法：日本「姓 名」、台灣「姓名」、美國「名 中間名縮寫 姓」', () => {
    const jp = generateNames(DATA.jp, { count: 5, seed: 'x' }).names;
    for (const n of jp) expect(n.text).toBe(`${n.family} ${n.given}`);
    const tw = generateNames(DATA.tw, { count: 5, seed: 'x' }).names;
    for (const n of tw) expect(n.text).toBe(`${n.family}${n.given}`);
    const us = generateNames(DATA.us, { count: 20, seed: 'x', middleInitial: true }).names;
    for (const n of us) {
      expect(n.middle).toMatch(/^[A-Z]\.$/);
      expect(n.text).toBe(`${n.given} ${n.middle} ${n.family}`);
    }
    const plain = generateNames(DATA.us, { count: 5, seed: 'x' }).names;
    for (const n of plain) {
      expect(n.middle).toBeUndefined();
      expect(n.text).toBe(`${n.given} ${n.family}`);
    }
    /* 其他地區開了也沒有中間名 */
    const twMid = generateNames(DATA.tw, { count: 3, seed: 'x', middleInitial: true }).names;
    expect(twMid.every((n) => n.middle === undefined)).toBe(true);
  });

  it('輸出（npc-names 2026-10）：只有名、只有姓；不給時和以前一樣是全名', () => {
    const full = generateNames(DATA.us, { count: 10, seed: 'p', middleInitial: true }).names;
    expect(
      generateNames(DATA.us, { count: 10, seed: 'p', middleInitial: true, part: 'full' }).names,
    ).toEqual(full);
    expect(full.every((n) => n.part === undefined)).toBe(true);
    const given = generateNames(DATA.us, {
      count: 20,
      seed: 'p',
      middleInitial: true,
      part: 'given',
    }).names;
    for (const n of given) {
      expect(n).toMatchObject({ part: 'given', family: '', text: n.given });
      expect(n.middle).toBeUndefined();
    }
    const family = generateNames(DATA.jp, { count: 50, seed: 'p', part: 'family' }).names;
    expect(new Set(family.map((n) => n.text)).size).toBe(50);
    for (const n of family) {
      expect(n).toMatchObject({ part: 'family', given: '', text: n.family });
      expect(n.givenReading).toBeUndefined();
      expect(nameReadings(n)).toEqual({
        hiragana: n.familyReading,
        katakana: toKatakana(n.familyReading ?? ''),
        romaji: expect.stringMatching(/^[A-Z][a-z']*$/),
      });
    }
  });

  it('年代不屬於那個地區時用第一個', () => {
    expect(eraOf('jp', 'born1920')).toBe('modern');
    expect(eraOf('us', 'born1920')).toBe('born1920');
    expect(eraOf('tw')).toBe('now');
    const names = generateNames(DATA.us, { count: 3, seed: 1, era: 'taisho' }).names;
    expect(names.every((n) => n.era === 'adult1920')).toBe(true);
  });

  it('seededRandom：同一個種子同一串、在 [0, 1)、相隔 1～6 個的值沒有相關', () => {
    const a = seededRandom('abc');
    const b = seededRandom('abc');
    const xs = Array.from({ length: 30000 }, () => a());
    expect(xs.slice(0, 50)).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(42)()).toBe(seededRandom('42')());
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0);
    for (let lag = 1; lag <= 6; lag++) {
      let c = 0;
      for (let i = 0; i + lag < xs.length; i++) c += (xs[i] - mean) * (xs[i + lag] - mean);
      expect(Math.abs(c / v), `lag ${lag}`).toBeLessThan(0.03);
    }
    /* 很多個種子的第一個值也平均分布 */
    const firsts = Array.from({ length: 5000 }, (_, i) => seededRandom(`s${i}`)());
    const bins = new Array(10).fill(0);
    for (const x of firsts) bins[Math.floor(x * 10)]++;
    expect(Math.min(...bins)).toBeGreaterThan(400);
    expect(Math.max(...bins)).toBeLessThan(600);
  });

  it('randomSeed：6 個英數字', () => {
    expect(randomSeed()).toMatch(/^[a-z2-9]{6}$/);
    expect(randomSeed(createRandom(1).next)).toBe(randomSeed(createRandom(1).next));
  });
});

describe('讀音', () => {
  it('日本的姓名：讀音和寫法是資料裡同一筆', () => {
    const jp = DATA.jp;
    for (const era of ['taisho', 'showa', 'modern']) {
      const { names } = generateNames(jp, { count: 50, era, seed: `reading-${era}` });
      for (const n of names) {
        const pool = jp[n.gender];
        const gi = pool.texts.findIndex(
          (t, i) => t === n.given && pool.readings[i] === n.givenReading,
        );
        expect(gi, `${n.given}（${n.givenReading}）`).toBeGreaterThanOrEqual(0);
        expect(pool.weights[era][gi]).toBeGreaterThan(0);
        const fi = jp.family.texts.findIndex(
          (t, i) => t === n.family && jp.family.readings[i] === n.familyReading,
        );
        expect(fi, `${n.family}（${n.familyReading}）`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('片假名、羅馬拼音', () => {
    expect(toKatakana('さとう ひろし')).toBe('サトウ ヒロシ');
    expect(toKatakana('ゐゑゔ')).toBe('ヰヱヴ');
    expect(kanaToRomaji('さとう')).toBe('satou');
    expect(kanaToRomaji('ゆうき')).toBe('yuuki');
    expect(kanaToRomaji('じゅんいち')).toBe("jun'ichi");
    expect(kanaToRomaji('しんや')).toBe("shin'ya");
    expect(kanaToRomaji('しんぺい')).toBe('shinpei');
    expect(kanaToRomaji('まっちゃ')).toBe('matcha');
    expect(kanaToRomaji('いっぺい')).toBe('ippei');
    expect(kanaToRomaji('きょうこ')).toBe('kyouko');
    expect(kanaToRomaji('ちひろ')).toBe('chihiro');
    expect(kanaToRomaji('しょうた')).toBe('shouta');
    expect(kanaToRomaji('ふじこ')).toBe('fujiko');
    expect(kanaToRomaji('つづき')).toBe('tsuzuki');
    expect(kanaToRomaji('ふぁ')).toBe('fa');
    const name = generateNames(DATA.jp, { count: 1, seed: 'r' }).names[0];
    const readings = nameReadings(name);
    expect(readings?.hiragana).toBe(`${name.familyReading} ${name.givenReading}`);
    expect(readings?.katakana).toBe(toKatakana(readings?.hiragana ?? ''));
    expect(readings?.romaji).toMatch(/^[A-Z][a-z']* [A-Z][a-z']*$/);
    expect(nameReadings(generateNames(DATA.tw, { count: 1, seed: 'r' }).names[0])).toBeNull();
  });

  it('資料裡每一個讀音都轉得成羅馬拼音（沒有剩下的假名）', () => {
    const jp = DATA.jp;
    for (const pool of [jp.family, jp.male, jp.female]) {
      for (const r of pool.readings) expect(kanaToRomaji(r)).toMatch(/^[a-z']+$/);
    }
  });
});
