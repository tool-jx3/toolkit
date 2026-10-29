/**
 * core/names/corpus：弄墨 Inknomu 的考據語料（npc-names 2026-10 導入）。
 * 轉換後的筆數（和原始 JSON 相同）、包的清單與授權檔、組名規則（姓名順序、分隔字、俄羅斯的女性形、維京的父名與綽號）、
 * 階級與國家的篩選（篩到空時退回）、平均抽、種子決定性、讀音。
 *
 * 原始 JSON 在本機時（`INKNOMU_PACKS=<資料夾> npx vitest run tests/unit/core-names-corpus`）另外逐筆比對文字和原檔相同。
 */
import { describe, expect, it } from 'vitest';
import { kanaToRomaji } from '@/core/names';
import {
  CORPUS_PACK_HINTS,
  CORPUS_PACKS,
  CORPUS_REGIONS,
  type CorpusData,
  type CorpusName,
  type CorpusRegion,
  composeCorpusName,
  corpusGenderOf,
  corpusKanaReadings,
  corpusOriginal,
  corpusPack,
  corpusPackLabel,
  corpusPacksOf,
  corpusRuleNotice,
  corpusSearchIndex,
  DEFAULT_SEARCH_FILTERS,
  drawCorpusName,
  EPITHET_CHANCE,
  filterEntries,
  filterSearchHits,
  generateCorpusNames,
  givenPool,
  type InknomuPack,
  loadCorpus,
  loadCorpusSources,
  matchesSearchFilter,
  normalizeSearch,
  rehydrateCorpusName,
  searchCorpus,
  searchOptionEmpty,
  slimCorpusName,
  sourceSegments,
} from '@/core/names/corpus';
import * as fantasy from '@/core/names/inknomu/inknomu-fantasy';
import * as jp from '@/core/names/inknomu/inknomu-jp';
import * as kr from '@/core/names/inknomu/inknomu-kr';
import * as nordic from '@/core/names/inknomu/inknomu-nordic';
import * as ru from '@/core/names/inknomu/inknomu-ru';
import * as tw from '@/core/names/inknomu/inknomu-tw';
import * as uk from '@/core/names/inknomu/inknomu-uk';
import * as us from '@/core/names/inknomu/inknomu-us';
import license from '@/core/names/inknomu/LICENSE.txt?raw';
import meta from '@/core/names/inknomu/meta.json';
import { createRandom } from '@/core/timeline/random';

const RAW: Record<CorpusRegion, { PACKS: readonly InknomuPack[] }> = {
  jp,
  tw,
  kr,
  uk,
  us,
  ru,
  nordic,
  fantasy,
};
const DATA: Record<CorpusRegion, CorpusData> = Object.fromEntries(
  Object.entries(RAW).map(([region, m]) => [region, { region, packs: m.PACKS }]),
) as Record<CorpusRegion, CorpusData>;
const ALL = Object.values(RAW).flatMap((m) => m.PACKS);
const pack = (id: string): InknomuPack => {
  const p = ALL.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

/**
 * 原始 JSON（2026-10-29 取得）每個包的筆數：姓、男性名、女性名、中性名、綽號。
 * 用 Python 從原檔數出來的（見規格 2.5 的表），和轉換後的資料逐包比對。
 */
const SOURCE_COUNTS: [string, number, number, number, number, number][] = [
  ['jp-sengoku', 83, 81, 40, 0, 0],
  ['jp-edo', 91, 83, 65, 0, 0],
  ['jp-taisho', 120, 104, 105, 8, 0],
  ['jp-showa', 120, 105, 104, 10, 0],
  ['jp-modern', 145, 168, 159, 20, 0],
  ['jp-rare', 53, 21, 20, 7, 0],
  ['tw-qing', 72, 307, 130, 15, 0],
  ['tw-japanese', 63, 110, 111, 11, 0],
  ['tw-modern', 63, 130, 135, 9, 0],
  ['tw-y2k', 63, 80, 80, 15, 0],
  ['tw-wuxia', 124, 124, 120, 44, 0],
  ['kr-modern', 60, 48, 57, 8, 0],
  ['uk-medieval', 99, 102, 104, 4, 0],
  ['uk-regency', 86, 119, 120, 5, 0],
  ['uk-victorian', 110, 101, 112, 9, 0],
  ['uk-modern', 87, 100, 100, 12, 0],
  ['us-classic', 94, 140, 124, 6, 0],
  ['us-modern', 113, 116, 113, 20, 0],
  ['us-latino', 67, 91, 90, 8, 0],
  ['us-african-american', 56, 110, 110, 10, 0],
  ['ru-imperial', 64, 105, 100, 0, 0],
  ['ru-modern', 55, 105, 100, 0, 0],
  ['nordic-viking', 0, 117, 100, 0, 103],
  ['nordic-modern', 86, 183, 183, 47, 0],
  ['fantasy-human', 40, 100, 100, 20, 0],
  ['fantasy-elf', 35, 100, 100, 20, 0],
  ['fantasy-dwarf', 35, 100, 100, 20, 0],
  ['fantasy-orc', 32, 100, 100, 20, 0],
  ['fantasy-halfling', 32, 100, 100, 20, 0],
];

/** 譯成繁中的說明（日文原文；轉換腳本的 NOTE_TRANSLATIONS） */
const TRANSLATED_NOTES: Record<string, string> = {
  'jp-taisho':
    '因大正改元（1912）而起的「正」字在男女名大為流行；女性名正處在從傳統的假名二字名轉向「〇子」的萌芽期。',
  'jp-showa':
    '因昭和改元而起的「昭」字熱潮；女性名經過「〇子」的全盛期（和子連續 13 年第一），戰後由誠、大輔等象徵時代的名字長期占據前段。',
  'jp-modern':
    '名字和年號的連動變淡，自然與和風意象（翔、陽、蓮、葵）成為主流；「〇子」退潮，重視個性的借字與讀法越來越多樣。',
};

describe('資料：轉換後和原始 JSON 相同', () => {
  it('29 個包、每個包每一類的筆數；合計姓 2,148、名 6,600', () => {
    expect(ALL.map((p) => p.id)).toEqual(SOURCE_COUNTS.map((c) => c[0]));
    for (const [id, s, m, f, u, e] of SOURCE_COUNTS) {
      const p = pack(id);
      expect([p.surnames.length, p.given.m.length, p.given.f.length, p.given.u.length], id).toEqual(
        [s, m, f, u],
      );
      expect(p.epithets?.length ?? 0, id).toBe(e);
    }
    const sum = (f: (p: InknomuPack) => number) => ALL.reduce((n, p) => n + f(p), 0);
    expect(sum((p) => p.surnames.length)).toBe(2148);
    expect(sum((p) => p.given.m.length + p.given.f.length + p.given.u.length)).toBe(6600);
    expect([
      sum((p) => p.given.m.length),
      sum((p) => p.given.f.length),
      sum((p) => p.given.u.length),
      sum((p) => p.epithets?.length ?? 0),
    ]).toEqual([3250, 2982, 368, 103]);
  });

  it('每一筆都有寫法與涵義；拿掉的欄位不在資料裡', () => {
    for (const p of ALL) {
      expect(p.note && p.corpus_note && p.label, p.id).toBeTruthy();
      for (const s of p.surnames) {
        expect(s.s && s.meaning, `${p.id} ${s.s}`).toBeTruthy();
        expect(Object.keys(s).filter((k) => ['weight', 'tags', 'zh'].includes(k))).toEqual([]);
      }
      for (const g of [...p.given.m, ...p.given.f, ...p.given.u]) {
        expect(g.g && g.meaning, `${p.id} ${g.g}`).toBeTruthy();
        expect(Object.keys(g).filter((k) => ['weight', 'tags', 'confidence'].includes(k))).toEqual(
          [],
        );
      }
      expect(
        Object.keys(p).filter((k) => ['license', 'weight', 'tts', 'group'].includes(k)),
      ).toEqual([]);
    }
  });

  it('包的清單（catalog）：順序、地區與旗標和資料一致', () => {
    expect(CORPUS_PACKS.map((c) => c.id)).toEqual(ALL.map((p) => p.id));
    for (const info of CORPUS_PACKS) {
      const p = pack(info.id);
      expect(info.label).toBe(p.label);
      expect(RAW[info.region].PACKS).toContain(p);
      expect(info.neutral, info.id).toBe(p.given.u.length > 0);
      expect(info.rank, info.id).toBe(p.surnames.some((s) => s.class));
      const entries = [...p.surnames, ...p.given.m, ...p.given.f, ...p.given.u];
      expect(info.countries, info.id).toBe(entries.some((x) => x.countries));
      expect(info.patronymic, info.id).toBe(
        !p.surnames.length && p.rules?.patronymic?.enabled === true,
      );
      expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    /* 有階級的是日本與英國、有國家的只有北歐的現代、以父名構成的只有維京 */
    expect(CORPUS_PACKS.filter((c) => c.rank).map((c) => c.region)).toEqual([
      ...Array(6).fill('jp'),
      ...Array(4).fill('uk'),
    ]);
    expect(CORPUS_PACKS.filter((c) => c.countries).map((c) => c.id)).toEqual(['nordic-modern']);
    expect(CORPUS_PACKS.filter((c) => c.patronymic).map((c) => c.id)).toEqual(['nordic-viking']);
    expect(CORPUS_PACKS.filter((c) => c.reading === 'kana').map((c) => c.region)).toEqual(
      Array(6).fill('jp'),
    );
    expect(CORPUS_PACKS.filter((c) => c.reading === 'latin').map((c) => c.id)).toEqual([
      'kr-modern',
      'ru-imperial',
      'ru-modern',
      'nordic-viking',
    ]);
  });

  it('地區、選單名稱、每個包的一句話', () => {
    expect(CORPUS_REGIONS.map((r) => r.label)).toEqual([
      '日本',
      '台灣',
      '韓國',
      '英國',
      '美國',
      '俄羅斯',
      '北歐',
      '奇幻',
    ]);
    expect(corpusPacksOf('jp').map((p) => p.id)).toEqual([
      'jp-sengoku',
      'jp-edo',
      'jp-taisho',
      'jp-showa',
      'jp-modern',
      'jp-rare',
    ]);
    expect(corpusPackLabel(CORPUS_PACKS[1])).toBe('江戶時代（1603–1868）');
    expect(corpusPackLabel({ label: '奇幻・獸人／半獸人' })).toBe('獸人／半獸人');
    for (const c of CORPUS_PACKS) expect(CORPUS_PACK_HINTS[c.id], c.id).toBeTruthy();
  });

  it('介面只有繁中：包的說明沒有日文（三句譯成繁中）', () => {
    for (const [id, zh] of Object.entries(TRANSLATED_NOTES)) expect(pack(id).note).toBe(zh);
    for (const p of ALL) expect(p.note, p.id).not.toMatch(/[ぁ-ゖァ-ヺ]{2}/);
    expect(license).toContain('本站譯成繁體中文');
  });

  it('授權：meta.json 與 LICENSE.txt（CC BY 4.0、作者、網址、29 個包的 SHA-256、本站的變更）', () => {
    expect(meta.license).toBe('CC-BY-4.0');
    expect(meta.url).toBe('https://inknomu.com/namegen/');
    expect(meta.copyright).toContain('弄墨 Inknomu');
    expect(license).toContain('https://creativecommons.org/licenses/by/4.0/legalcode');
    expect(license).toContain('inknomu@gmail.com');
    expect(license).toContain('2026-10-29');
    expect(license).toContain('本站做的變更');
    for (const c of CORPUS_PACKS) expect(license, c.id).toContain(`${c.id} `);
    for (const c of CORPUS_PACKS) expect(license, c.id).toContain(c.sha256);
  });

  it('loadCorpus：用到才載入，同一個地區只載一次', async () => {
    const a = await loadCorpus('kr');
    const b = await loadCorpus('kr');
    expect(a).toBe(b);
    expect(corpusPack(a, 'kr-modern')?.surnames.length).toBe(60);
    expect(a.packs).toBe(DATA.kr.packs);
  });

  /* 原始 JSON 的資料夾（選填）；單元測試的型別沒有 Node，fs 用動態 import（同 relation-chart-golden） */
  const SRC = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .INKNOMU_PACKS;
  it.skipIf(!SRC)('（有原始 JSON 時）逐筆和原檔相同', async () => {
    const FS = 'node:fs';
    const fs = (await import(/* @vite-ignore */ FS)) as {
      readFileSync: (p: string) => Uint8Array;
    };
    const pick = (o: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(
        keys
          .filter((k) => o[k] !== undefined && o[k] !== '' && o[k] !== null)
          .map((k) => [k, o[k]]),
      );
    for (const info of CORPUS_PACKS) {
      const buf = fs.readFileSync(`${SRC}/${info.id}.json`);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf as BufferSource));
      const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(hex, info.id).toBe(info.sha256);
      const raw = JSON.parse(new TextDecoder().decode(buf));
      const p = pack(info.id);
      /* 預期的差異：日本三個包的說明原文是日文，本站譯成繁中（LICENSE.txt「本站做的變更」第 6 點） */
      const translated = TRANSLATED_NOTES[info.id];
      if (translated) {
        expect(raw.note, info.id).toMatch(/[ぁ-ゖァ-ヺ]/);
        expect(p.note, info.id).toBe(translated);
      } else expect(p.note, info.id).toBe(raw.note);
      expect([p.label, p.corpus_note, p.name_order]).toEqual([
        raw.label,
        raw.corpus_note,
        raw.name_order,
      ]);
      expect(p.rules).toEqual(raw.rules);
      const sk = ['s', 'reading', 'meaning', 'note', 'class', 'countries', 'f_form', 'f_reading'];
      expect(p.surnames).toEqual(
        (raw.surnames ?? []).map((s: Record<string, unknown>) => pick(s, sk)),
      );
      const gk = ['g', 'reading', 'meaning', 'note', 'class', 'countries', 'pat', 'diminutive'];
      for (const g of ['m', 'f', 'u'] as const) {
        expect(p.given[g]).toEqual(
          (raw.given[g] ?? []).map((x: Record<string, unknown>) => pick(x, gk)),
        );
      }
      expect(p.epithets ?? []).toEqual(
        (raw.epithets ?? []).map((e: Record<string, unknown>) => pick(e, ['e', 'meaning', 'note'])),
      );
    }
  });
});

/** 小的包：組名與篩選的規則用 */
const mini = (patch: Partial<InknomuPack>): InknomuPack => ({
  id: 'mini',
  label: '測試・小包',
  note: '',
  corpus_note: '',
  surnames: [{ s: 'Smith', meaning: '鐵匠' }],
  given: { m: [{ g: 'John', meaning: '恩典' }], f: [{ g: 'Mary', meaning: '苦' }], u: [] },
  ...patch,
});

/** 依序回傳給定的值的亂數 */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('組名', () => {
  it('名在前（gs）：「名 姓」、涵義「名：…」「姓：…」', () => {
    const n = drawCorpusName(mini({ name_order: 'gs' }), { gender: 'male' }, seq(0.1), 'uk');
    expect(n).toMatchObject({
      text: 'John Smith',
      given: 'John',
      family: 'Smith',
      gender: 'male',
      meanings: ['名：恩典', '姓：鐵匠'],
      notes: [],
      extras: [],
    });
  });

  it('姓在前：「姓＋分隔字＋名」（日本是空白、台灣與韓國連在一起），涵義跟著姓名順序', () => {
    const p = mini({
      surnames: [{ s: '佐藤', meaning: '佐藤' }],
      given: { m: [{ g: '博', meaning: '博' }], f: [], u: [] },
    });
    expect(drawCorpusName({ ...p, name_sep: ' ' }, { gender: 'male' }, seq(0.2)).text).toBe(
      '佐藤 博',
    );
    const n = drawCorpusName(p, { gender: 'male' }, seq(0.2));
    expect(n.text).toBe('佐藤博');
    expect(n.meanings).toEqual(['姓：佐藤', '名：博']);
    /* 實際的資料：韓國「김서준」，原文／拼音「Gim Seojun」（讀音以空白分開） */
    const krPack = pack('kr-modern');
    const kim = krPack.surnames.findIndex((s) => s.s === '김');
    const seojun = krPack.given.m.findIndex((g) => g.g === '서준');
    const name = drawCorpusName(
      krPack,
      { gender: 'male' },
      seq(
        (kim + 0.5) / krPack.surnames.length,
        (seojun + 0.5) / (krPack.given.m.length + krPack.given.u.length),
      ),
      'kr',
    );
    expect(name.text).toBe('김서준');
    expect(name.original).toBe('Gim Seojun');
    expect(name.notes[0]).toContain('2008年起累計男名第1名');
  });

  it('俄羅斯：女性用姓的女性形與它的讀音，另一個性別形與暱稱列在 extras', () => {
    const ruPack = pack('ru-imperial');
    const i = ruPack.surnames.findIndex((s) => s.s === 'Ivanov');
    const a = ruPack.given.m.findIndex((g) => g.g === 'Alexander');
    const r = (i + 0.5) / ruPack.surnames.length;
    const male = drawCorpusName(
      ruPack,
      { gender: 'male' },
      seq(r, (a + 0.5) / ruPack.given.m.length),
      'ru',
    );
    expect(male.text).toBe('Alexander Ivanov');
    expect(male.original).toBe('Александр Иванов');
    expect(male.extras).toEqual(['暱稱 Sasha', '姓氏女性形 Ivanova']);
    const female = drawCorpusName(ruPack, { gender: 'female' }, seq(r, 0), 'ru');
    expect(female.family).toBe('Ivanova');
    expect(female.text).toBe(`${female.given} Ivanova`);
    expect(female.original).toMatch(/ Иванова$/);
    expect(female.extras.at(-1)).toBe('姓氏男性形 Ivanov');
    /* Tolstoy 的女性形 Tolstaya 沒有讀音：這個名字沒有原文一行（不會拿男性形的讀音湊） */
    const t = ruPack.surnames.findIndex((s) => s.s === 'Tolstoy');
    const tolstaya = drawCorpusName(
      ruPack,
      { gender: 'female' },
      seq((t + 0.5) / ruPack.surnames.length, 0),
      'ru',
    );
    expect(tolstaya.family).toBe('Tolstaya');
    expect(tolstaya.original).toBeUndefined();
  });

  it('維京：沒有姓，父名＝父親的屬格字根＋son／dóttir；綽號約 30%，前綴式的接在名的前面', () => {
    const v = pack('nordic-viking');
    const bjorn = v.given.m.findIndex((g) => g.g === 'Bjorn');
    const ragnar = v.given.m.findIndex((g) => g.g === 'Ragnar');
    const at = (i: number) => (i + 0.5) / v.given.m.length;
    /* 亂數：父親、名、要不要綽號（0.9 ≥ 0.3：不要） */
    const son = drawCorpusName(v, { gender: 'male' }, seq(at(ragnar), at(bjorn), 0.9), 'nordic');
    expect(son.text).toBe('Bjorn Ragnarsson');
    expect(son.family).toBe('Ragnarsson');
    expect(son.meanings).toEqual(['名：熊', '父名：Ragnar 之子']);
    expect(son.original).toBe('Bjǫrn Ragnarsson');
    const daughter = drawCorpusName(v, { gender: 'female' }, seq(at(bjorn), 0, 0.9), 'nordic');
    expect(daughter.family).toBe('Bjarnardóttir');
    expect(daughter.meanings[1]).toBe('父名：Bjorn 之女');
    /* 綽號：接在最後；說明列在備註 */
    const epithets = v.epithets ?? [];
    const red = epithets.findIndex((e) => e.e === 'the Red');
    const withEp = drawCorpusName(
      v,
      { gender: 'male' },
      seq(at(ragnar), at(bjorn), 0.1, (red + 0.5) / epithets.length),
      'nordic',
    );
    expect(withEp.text).toBe('Bjorn Ragnarsson the Red');
    expect(withEp.epithet).toBe('the Red');
    expect(withEp.notes).toContain('綽號 the Red：紅髮或紅鬍（如紅髮埃里克Erik the Red）');
    expect(withEp.original).toBe('Bjǫrn Ragnarsson');
    const peace = epithets.findIndex((e) => e.e === 'Peace-');
    const prefixed = drawCorpusName(
      v,
      { gender: 'male' },
      seq(at(ragnar), at(bjorn), 0.1, (peace + 0.5) / epithets.length),
      'nordic',
    );
    expect(prefixed.text).toBe('Peace-Bjorn Ragnarsson');
    expect(prefixed.notes.at(-1)).toMatch(/^綽號 Peace-：和平者.*（傳說丹麥王和平弗羅迪/);
    /* 大量抽：約 30% 有綽號，父名都是某個男性名的字根＋後綴 */
    const random = createRandom('viking').next;
    let n = 0;
    const roots = new Set(v.given.m.map((g) => g.pat || g.g));
    for (let k = 0; k < 20000; k++) {
      const x = drawCorpusName(v, {}, random, 'nordic');
      if (x.epithet) n++;
      const suffix = x.gender === 'female' ? 'dóttir' : 'son';
      expect(x.family.endsWith(suffix)).toBe(true);
      expect(roots.has(x.family.slice(0, -suffix.length))).toBe(true);
    }
    expect(n / 20000).toBeGreaterThan(EPITHET_CHANCE - 0.015);
    expect(n / 20000).toBeLessThan(EPITHET_CHANCE + 0.015);
  });

  it('實際的資料：每個包抽 50 個，全名的寫法、姓與名都在資料裡', () => {
    for (const info of CORPUS_PACKS) {
      const p = pack(info.id);
      const { names } = generateCorpusNames(p, { count: 50, seed: `shape-${info.id}` });
      for (const n of names) {
        expect(n.pack).toBe(info.id);
        expect(n.region).toBe(info.region);
        const g = givenPool(p, n.gender).find((x) => x.g === n.given);
        expect(g, `${info.id} ${n.given}`).toBeTruthy();
        if (p.surnames.length) {
          expect(p.surnames.some((s) => s.s === n.family || s.f_form === n.family)).toBe(true);
          const expected =
            p.name_order === 'gs'
              ? `${n.given} ${n.family}`
              : `${n.family}${p.name_sep ?? ''}${n.given}`;
          expect(n.text).toBe(expected);
        }
        expect(n.meanings.length).toBe(2);
      }
    }
    expect(generateCorpusNames(pack('tw-modern'), { count: 3, seed: 1 }).names[0].text).toMatch(
      /^\p{sc=Han}{2,4}$/u,
    );
    expect(generateCorpusNames(pack('jp-edo'), { count: 3, seed: 1 }).names[0].text).toMatch(
      /^\S+ \S+$/,
    );
  });
});

describe('篩選與性別', () => {
  const ranked = [
    { s: 'A', meaning: '', class: 'noble' as const },
    { s: 'B', meaning: '', class: 'common' as const },
    { s: 'C', meaning: '', class: 'both' as const },
    { s: 'D', meaning: '' },
  ];

  it('階級：沒有標的與「兩者通用」照樣入選；篩到空就退回不篩', () => {
    expect(filterEntries(ranked, 'noble').map((x) => x.s)).toEqual(['A', 'C', 'D']);
    expect(filterEntries(ranked, 'common').map((x) => x.s)).toEqual(['B', 'C', 'D']);
    expect(filterEntries(ranked, 'all')).toBe(ranked);
    const onlyNoble = [{ s: 'A', meaning: '', class: 'noble' as const }];
    expect(filterEntries(onlyNoble, 'common')).toBe(onlyNoble);
  });

  it('國家：沒有標的放行；篩到空時退回篩完階級的', () => {
    const list = [
      { s: 'Andersson', meaning: '', countries: ['se'], class: 'noble' as const },
      { s: 'Hansen', meaning: '', countries: ['no', 'dk'], class: 'common' as const },
      { s: 'Berg', meaning: '' },
    ];
    expect(filterEntries(list, 'all', 'se').map((x) => x.s)).toEqual(['Andersson', 'Berg']);
    expect(filterEntries(list, 'all', 'dk').map((x) => x.s)).toEqual(['Hansen', 'Berg']);
    expect(filterEntries([list[0]], 'all', 'fi').map((x) => x.s)).toEqual(['Andersson']);
    /* 階級篩完只剩 Andersson（＋沒有標的 Berg 被階級放行），國家 fi 篩到只剩 Berg */
    expect(filterEntries(list, 'noble', 'fi').map((x) => x.s)).toEqual(['Berg']);
    expect(filterEntries([list[0], list[1]], 'noble', 'dk').map((x) => x.s)).toEqual(['Andersson']);
  });

  it('實際的資料：江戶的貴族只出現貴族與通用的姓與名；北歐的國家', () => {
    const edo = pack('jp-edo');
    const { names } = generateCorpusNames(edo, { count: 50, rank: 'noble', seed: 'noble' });
    for (const n of names) {
      const s = edo.surnames.find((x) => x.s === n.family);
      expect(s?.class === 'common', n.family).toBe(false);
      const g = givenPool(edo, n.gender).find((x) => x.g === n.given);
      expect(g?.class === 'common', n.given).toBe(false);
    }
    const nm = pack('nordic-modern');
    const se = generateCorpusNames(nm, { count: 50, country: 'se', seed: 'se' }).names;
    for (const n of se) {
      const s = nm.surnames.find((x) => x.s === n.family);
      expect(!s?.countries || s.countries.includes('se'), n.family).toBe(true);
    }
  });

  it('性別：男＝男性名＋中性名、女＝女性名＋中性名、中性＝只有中性名；沒有中性名的包選中性時當作不限', () => {
    const p = pack('uk-modern');
    const m = new Set([...p.given.m, ...p.given.u].map((g) => g.g));
    const f = new Set([...p.given.f, ...p.given.u].map((g) => g.g));
    const u = new Set(p.given.u.map((g) => g.g));
    const gen = (gender: 'male' | 'female' | 'neutral') =>
      generateCorpusNames(p, { count: 50, gender, seed: gender }).names;
    expect(gen('male').every((n) => n.gender === 'male' && m.has(n.given))).toBe(true);
    expect(gen('female').every((n) => n.gender === 'female' && f.has(n.given))).toBe(true);
    expect(gen('neutral').every((n) => n.gender === 'neutral' && u.has(n.given))).toBe(true);
    const ruPack = pack('ru-modern');
    expect(corpusGenderOf(ruPack, 'neutral')).toBe('any');
    expect(corpusGenderOf(p, 'neutral')).toBe('neutral');
    const ru = generateCorpusNames(ruPack, { count: 40, gender: 'neutral', seed: 'x' }).names;
    expect(new Set(ru.map((n) => n.gender))).toEqual(new Set(['male', 'female']));
  });

  it('平均抽：每個姓被抽中的次數接近（不用原站的 weight）', () => {
    const edo = pack('jp-edo');
    const random = createRandom('uniform').next;
    const counts = new Map<string, number>();
    const n = edo.surnames.length * 400;
    for (let i = 0; i < n; i++) {
      const name = drawCorpusName(edo, { gender: 'male' }, random, 'jp');
      counts.set(name.family, (counts.get(name.family) ?? 0) + 1);
    }
    expect(counts.size).toBe(edo.surnames.length);
    const p = 1 / edo.surnames.length;
    const sigma = Math.sqrt(n * p * (1 - p));
    for (const [s, c] of counts) expect(Math.abs(c - 400), s).toBeLessThan(5 * sigma);
  });
});

describe('generateCorpusNames', () => {
  it('種子：同樣的種子與條件同一批、不同的種子不同；排除名單也固定', () => {
    for (const id of ['jp-edo', 'tw-wuxia', 'kr-modern', 'nordic-viking', 'fantasy-elf']) {
      const p = pack(id);
      const opts = { count: 20, gender: 'any' as const, seed: 'abc' };
      const a = generateCorpusNames(p, opts).names;
      expect(generateCorpusNames(p, opts).names).toEqual(a);
      expect(generateCorpusNames(p, { ...opts, seed: 'abd' }).names.map((x) => x.text)).not.toEqual(
        a.map((x) => x.text),
      );
      const ex = { ...opts, exclude: a.slice(0, 5).map((x) => x.text) };
      const b = generateCorpusNames(p, ex).names;
      expect(generateCorpusNames(p, ex).names).toEqual(b);
      for (const x of b) expect(ex.exclude).not.toContain(x.text);
    }
  });

  it('同一批不重複；不重複的姓名不夠時產生得比較少（exhausted）', () => {
    for (const info of CORPUS_PACKS) {
      const { names, exhausted } = generateCorpusNames(pack(info.id), { count: 50, seed: info.id });
      expect(exhausted, info.id).toBe(false);
      expect(new Set(names.map((n) => n.text)).size).toBe(50);
    }
    const tiny = mini({
      name_order: 'gs',
      given: { m: [{ g: 'John', meaning: '' }], f: [], u: [{ g: 'Kim', meaning: '' }] },
    });
    const r = generateCorpusNames(tiny, { count: 5, gender: 'male', seed: 1 });
    expect(r.names.map((n) => n.text).sort()).toEqual(['John Smith', 'Kim Smith']);
    expect(r.exhausted).toBe(true);
  });

  it('亂數的取用順序：性別（不限時 < 0.5 是男性）→ 姓 → 名', () => {
    const p = mini({
      name_order: 'gs',
      surnames: [
        { s: 'Smith', meaning: '' },
        { s: 'Brown', meaning: '' },
      ],
    });
    expect(drawCorpusName(p, {}, seq(0.4, 0.9, 0), 'uk').text).toBe('John Brown');
    expect(drawCorpusName(p, {}, seq(0.6, 0.1, 0), 'uk').text).toBe('Mary Smith');
  });
});

describe('讀音', () => {
  it('日本的包：平假名、片假名、羅馬拼音（有兩種讀法時各自轉）', () => {
    const r = corpusKanaReadings({ familyReading: 'いのう', givenReading: 'もんど' });
    expect(r).toEqual({
      hiragana: 'いのう もんど',
      katakana: 'イノウ モンド',
      romaji: 'Inou Mondo',
    });
    expect(
      corpusKanaReadings({ familyReading: 'たなか', givenReading: 'のぞみ／のぞむ' })?.romaji,
    ).toBe('Tanaka Nozomi／Nozomu');
    expect(corpusKanaReadings({ givenReading: 'もと' })).toBeNull();
  });

  it('日本的包每一個讀音都是平假名，轉得成羅馬拼音', () => {
    for (const p of jp.PACKS) {
      for (const x of [...p.surnames, ...p.given.m, ...p.given.f, ...p.given.u]) {
        expect(x.reading, `${p.id} ${'s' in x ? x.s : x.g}`).toMatch(/^[ぁ-ゖ]+(／[ぁ-ゖ]+)?$/);
        for (const k of (x.reading ?? '').split('／')) expect(kanaToRomaji(k)).toMatch(/^[a-z']+$/);
      }
    }
    const n = generateCorpusNames(pack('jp-sengoku'), { count: 1, seed: 'r' }).names[0];
    expect(n.familyReading && n.givenReading).toBeTruthy();
    expect(n.original).toBeUndefined();
  });

  it('原文／拼音一行：每一段都有讀音、且至少一段和原字不同才有', () => {
    expect(
      corpusOriginal([
        { text: '김', reading: 'Gim' },
        { text: '서준', reading: 'Seojun' },
      ]),
    ).toBe('Gim Seojun');
    expect(
      corpusOriginal([
        { text: 'Ragnar', reading: 'Ragnar' },
        { text: 'Eriksson', reading: 'Eriksson' },
      ]),
    ).toBeNull();
    expect(corpusOriginal([{ text: 'Anna', reading: 'Анна' }, { text: 'Tolstaya' }])).toBeNull();
    /* 沒有讀音的包（台灣、英國…）沒有讀音 */
    const n = generateCorpusNames(pack('uk-regency'), { count: 5, seed: 'r' }).names;
    expect(n.every((x) => !x.original && !x.familyReading && !x.givenReading)).toBe(true);
  });
});

describe('規則的說明', () => {
  it('俄羅斯的父名、拉美裔的雙姓與複合名只有說明，補一句「這裡不產生」；維京的父名有產生', () => {
    expect(corpusRuleNotice(pack('ru-modern'), 'patronymic')).toBe(
      '這裡產生的名字只有名與姓，不加父名。',
    );
    expect(corpusRuleNotice(pack('us-latino'), 'double_surname')).toBe(
      '這裡產生的名字只有一個姓。',
    );
    expect(corpusRuleNotice(pack('us-latino'), 'compound_given')).toBe(
      '這裡產生的名字不組複合名。',
    );
    expect(corpusRuleNotice(pack('nordic-viking'), 'patronymic')).toBeNull();
    expect(corpusRuleNotice(pack('nordic-modern'), 'patronymic')).toBeNull();
    expect(corpusRuleNotice(pack('tw-wuxia'), 'naming')).toBeNull();
  });
});

describe('輸出：只有名、只有姓', () => {
  it('只有名：全名就是名，涵義只留名的，名的備註與暱稱照留；姓的另一形、父名、綽號不出現', () => {
    const ruPack = pack('ru-imperial');
    const i = ruPack.surnames.findIndex((s) => s.s === 'Ivanov');
    const a = ruPack.given.m.findIndex((g) => g.g === 'Alexander');
    const r = seq((i + 0.5) / ruPack.surnames.length, (a + 0.5) / ruPack.given.m.length);
    const n = drawCorpusName(ruPack, { gender: 'male', part: 'given' }, r, 'ru');
    expect(n).toMatchObject({
      text: 'Alexander',
      given: 'Alexander',
      family: '',
      part: 'given',
      meanings: ['名：保衛者（希臘語）'],
      extras: ['暱稱 Sasha'],
      original: 'Александр',
    });
    const v = pack('nordic-viking');
    const vk = generateCorpusNames(v, { count: 30, part: 'given', seed: 'g' }).names;
    for (const x of vk) {
      expect(x.text).toBe(x.given);
      expect(x.family).toBe('');
      expect(x.epithet).toBeUndefined();
      expect(x.meanings).toHaveLength(1);
      expect(x.notes.every((t) => !t.startsWith('綽號'))).toBe(true);
    }
  });

  it('只有姓：俄羅斯照性別用男性形或女性形，涵義只留姓的，名的備註與暱稱不出現；沒有姓的包當作全名', () => {
    const ruPack = pack('ru-imperial');
    const i = ruPack.surnames.findIndex((s) => s.s === 'Ivanov');
    const r = () => seq((i + 0.5) / ruPack.surnames.length, 0);
    const f = drawCorpusName(ruPack, { gender: 'female', part: 'family' }, r(), 'ru');
    expect(f).toMatchObject({
      text: 'Ivanova',
      family: 'Ivanova',
      given: '',
      part: 'family',
      notes: [],
      extras: ['姓氏男性形 Ivanov'],
      original: 'Иванова',
    });
    expect(f.meanings).toEqual(['姓：Ivan（伊凡）之子，最常見的父稱衍生姓']);
    expect(drawCorpusName(ruPack, { gender: 'male', part: 'family' }, r(), 'ru').text).toBe(
      'Ivanov',
    );
    const jpFamily = generateCorpusNames(pack('jp-edo'), {
      count: 5,
      part: 'family',
      seed: 'f',
    }).names;
    for (const x of jpFamily) {
      expect(x.text).toBe(x.family);
      expect(x.familyReading).toBeTruthy();
      expect(x.givenReading).toBeUndefined();
      expect(corpusKanaReadings(x)?.hiragana).toBe(x.familyReading);
    }
    const viking = generateCorpusNames(pack('nordic-viking'), {
      count: 5,
      part: 'family',
      seed: 'f',
    }).names;
    expect(viking.every((x) => x.part === undefined && / /.test(x.text))).toBe(true);
  });

  it('不重複以顯示的那一段判斷；可抽的不夠時照實減少（exhausted）', () => {
    const rare = pack('jp-rare');
    const r = generateCorpusNames(rare, { count: 50, gender: 'male', part: 'given', seed: 'x' });
    expect(r.names).toHaveLength(rare.given.m.length + rare.given.u.length);
    expect(new Set(r.names.map((n) => n.text)).size).toBe(r.names.length);
    expect(r.exhausted).toBe(true);
    const fam = generateCorpusNames(pack('fantasy-orc'), { count: 50, part: 'family', seed: 'x' });
    expect(fam.names).toHaveLength(32);
    expect(fam.exhausted).toBe(true);
  });
});

describe('搜尋', () => {
  const JP = { region: 'jp' as const, packs: jp.PACKS };
  const US = { region: 'us' as const, packs: us.PACKS };
  const RU = { region: 'ru' as const, packs: ru.PACKS };
  const KR = { region: 'kr' as const, packs: kr.PACKS };
  const NORDIC = { region: 'nordic' as const, packs: nordic.PACKS };
  const UK = { region: 'uk' as const, packs: uk.PACKS };
  const texts = (hits: { text: string }[]) => hits.map((h) => h.text);

  it('正規化：前後空白、大小寫、重音、全形英數、片假名、濁音與半濁音', () => {
    expect(normalizeSearch('  José ')).toBe('jose');
    expect(normalizeSearch('ＪＯＳＥ')).toBe('jose');
    expect(normalizeSearch('ＪＯＳÉ')).toBe('jose');
    expect(normalizeSearch('サトウ')).toBe('さとう');
    expect(normalizeSearch('ﾀﾞﾃ')).toBe('たて');
    expect(normalizeSearch('だて')).toBe('たて');
    expect(normalizeSearch('ぱぴ')).toBe('はひ');
    expect(normalizeSearch('Иван')).toBe('иван');
  });

  it('索引：所有包的姓與名（同一個包裡寫法相同的併成一筆），俄羅斯的女性形另列一筆', () => {
    const index = corpusSearchIndex(JP);
    expect(corpusSearchIndex(JP)).toBe(index);
    const keys = new Set(index.map((e) => `${e.pack}:${e.kind}:${e.text}`));
    expect(keys.size).toBe(index.length);
    for (const p of jp.PACKS) {
      const names = new Set([...p.given.m, ...p.given.f, ...p.given.u].map((g) => g.g));
      expect(index.filter((e) => e.pack === p.id && e.kind === 'given').length).toBe(names.size);
      expect(index.filter((e) => e.pack === p.id && e.kind === 'family').length).toBe(
        new Set(p.surnames.map((s) => s.s)).size,
      );
    }
    const ivanova = corpusSearchIndex(RU).filter((e) => e.text === 'Ivanova');
    expect(ivanova.map((e) => [e.pack, e.genders, e.reading, e.extras])).toEqual([
      ['ru-imperial', ['female'], 'Иванова', ['姓氏男性形 Ivanov']],
      ['ru-modern', ['female'], 'Иванова', ['姓氏男性形 Ivanov']],
    ]);
    /* 維京：沒有姓，綽號不收 */
    expect(
      corpusSearchIndex(NORDIC).some((e) => e.pack === 'nordic-viking' && e.kind === 'family'),
    ).toBe(false);
  });

  it('比對寫法與讀音（日本、韓國、俄羅斯），片假名與濁音都找得到；跨年代', () => {
    const index = corpusSearchIndex(JP);
    const sato = searchCorpus(index, 'さとう');
    expect(texts(sato)).toContain('佐藤');
    expect(searchCorpus(index, 'サトウ')).toEqual(sato);
    expect(searchCorpus(index, 'ｻﾄｳ')).toEqual(sato);
    /* 伊達（だて）用「たて」也找得到 */
    expect(texts(searchCorpus(index, 'たて'))).toContain('伊達');
    expect(texts(searchCorpus(index, '伊達'))).toContain('伊達');
    /* 同一個名字在好幾個年代：每個包各一筆 */
    const taro = searchCorpus(index, '太郎').filter((h) => h.text === '太郎');
    expect(taro.length).toBeGreaterThan(1);
    expect(new Set(taro.map((h) => h.pack)).size).toBe(taro.length);
    expect(texts(searchCorpus(corpusSearchIndex(KR), 'gim'))).toContain('김');
    expect(texts(searchCorpus(corpusSearchIndex(RU), 'иван'))).toEqual(
      expect.arrayContaining(['Ivan', 'Ivanov', 'Ivanova']),
    );
    /* 維京的讀音（古諾斯語）不比對；涵義、備註不比對 */
    expect(searchCorpus(corpusSearchIndex(NORDIC), 'eiríkr')).toEqual([]);
    expect(texts(searchCorpus(corpusSearchIndex(NORDIC), 'erik'))).toContain('Erik');
    expect(searchCorpus(index, '旗本')).toEqual([]);
    expect(searchCorpus(index, '   ')).toEqual([]);
  });

  it('大小寫、重音、全形：José 用 jose、JOSE、ｊｏｓｅ 都找得到', () => {
    const index = corpusSearchIndex(US);
    const a = searchCorpus(index, 'jose');
    expect(texts(a)).toEqual(expect.arrayContaining(['José', 'José Luis']));
    expect(searchCorpus(index, 'JOSE')).toEqual(a);
    expect(searchCorpus(index, 'José')).toEqual(a);
    expect(searchCorpus(index, 'ｊｏｓｅ')).toEqual(a);
  });

  it('開頭就對上的排前面', () => {
    const hits = searchCorpus(corpusSearchIndex(UK), 'an');
    const first = hits.findIndex((h) => h.at > 0);
    expect(first).toBeGreaterThan(0);
    expect(hits.slice(0, first).every((h) => h.n.startsWith('an'))).toBe(true);
    expect(hits.slice(first).every((h) => h.at > 0)).toBe(true);
    expect(hits.slice(first).map((h) => h.at)).toEqual(
      [...hits.slice(first).map((h) => h.at)].sort((x, y) => x - y),
    );
  });

  it('篩選：年代、性別（男女包含中性名、姓不分性別）、階級、國家、類別；會變成 0 筆的選項', () => {
    const nordicHits = searchCorpus(corpusSearchIndex(NORDIC), 'er');
    const f = { ...DEFAULT_SEARCH_FILTERS, era: 'nordic-viking' };
    expect(filterSearchHits(nordicHits, f).every((h) => h.pack === 'nordic-viking')).toBe(true);
    /* 維京沒有姓：類別「姓」會是 0 筆 */
    expect(searchOptionEmpty(nordicHits, f, 'kind', 'family')).toBe(true);
    expect(searchOptionEmpty(nordicHits, f, 'kind', 'given')).toBe(false);
    expect(searchOptionEmpty(nordicHits, f, 'kind', 'all')).toBe(false);
    /* 篩年代時，年代自己的選項不受影響（算的是其他篩選之下的結果） */
    expect(searchOptionEmpty(nordicHits, f, 'era', 'nordic-modern')).toBe(false);
    const entry = (genders: ('male' | 'female' | 'neutral')[]) => ({
      ...corpusSearchIndex(NORDIC)[0],
      genders,
    });
    expect(matchesSearchFilter(entry(['neutral']), 'gender', 'male')).toBe(true);
    expect(matchesSearchFilter(entry(['male']), 'gender', 'neutral')).toBe(false);
    expect(matchesSearchFilter(entry([]), 'gender', 'female')).toBe(true);
    const edo = searchCorpus(corpusSearchIndex(JP), 'え').filter((h) => h.pack === 'jp-edo');
    const noble = filterSearchHits(edo, { ...DEFAULT_SEARCH_FILTERS, rank: 'noble' });
    expect(noble.length).toBeGreaterThan(0);
    expect(noble.every((h) => h.class !== 'common')).toBe(true);
    const se = filterSearchHits(nordicHits, { ...DEFAULT_SEARCH_FILTERS, country: 'se' });
    expect(se.every((h) => !h.countries || h.countries.includes('se'))).toBe(true);
  });
});

describe('資料來源（各地區頁面）', () => {
  it('8 個地區照原站分組、各組的筆數；連結都是 https，連結的字都在那一筆的文字裡', async () => {
    const counts: Record<string, string[]> = {};
    let total = 0;
    for (const r of CORPUS_REGIONS) {
      const groups = await loadCorpusSources(r.id);
      counts[r.id] = groups.map((g) => `${g.group} ${g.items.length}`);
      for (const g of groups) {
        for (const item of g.items) {
          total++;
          for (const l of item.links ?? []) {
            expect(l.url).toMatch(/^https:\/\//);
            expect(item.text, l.text).toContain(l.text);
          }
          const segs = sourceSegments(item);
          expect(segs.map((x) => x.text).join('')).toBe(item.text);
          expect(segs.filter((x) => x.url)).toHaveLength(item.links?.length ?? 0);
        }
      }
    }
    expect(counts).toEqual({
      jp: ['政府和研究機構 4', '網站 6', '書籍 4'],
      tw: ['政府和研究機構 6', '網站 1', '作品 3'],
      kr: ['政府和研究機構 2', '網站 4'],
      uk: ['政府和研究機構 4', '網站 5', '書籍 1', '作品 1', '其他 1'],
      us: ['政府和研究機構 4', '網站 1', '其他 2'],
      ru: ['政府和研究機構 1', '書籍 2', '作品 1'],
      nordic: ['政府和研究機構 6', '書籍 2'],
      fantasy: ['書籍 1', '作品 1', '其他 4'],
    });
    expect(total).toBe(67);
  });

  it('切成文字與連結：依序找連結的字；找不到的接在後面', () => {
    expect(
      sourceSegments({
        text: '維基百科「甲」、「乙」',
        links: [
          { text: '「甲」', url: 'https://a' },
          { text: '「乙」', url: 'https://b' },
        ],
      }),
    ).toEqual([
      { text: '維基百科' },
      { text: '「甲」', url: 'https://a' },
      { text: '、' },
      { text: '「乙」', url: 'https://b' },
    ]);
    expect(sourceSegments({ text: '書' })).toEqual([{ text: '書' }]);
    expect(sourceSegments({ text: '書', links: [{ text: '外', url: 'https://c' }] })).toEqual([
      { text: '書' },
      { text: ' 外', url: 'https://c' },
    ]);
  });
});

describe('精簡版與查回（紀錄用，2026-10 驗證後的裁定）', () => {
  it('每個包、三種輸出：精簡版查回來和原本完全相同', () => {
    for (const info of CORPUS_PACKS) {
      const p = pack(info.id);
      for (const part of ['full', 'given', 'family'] as const) {
        const { names } = generateCorpusNames(p, {
          count: 30,
          part,
          seed: `slim-${info.id}-${part}`,
        });
        for (const n of names) {
          expect(n.ref?.g, n.text).toMatch(/^[mfu]\d+$/);
          const slim = slimCorpusName(n);
          expect('meanings' in slim).toBe(false);
          expect(rehydrateCorpusName(p, slim), `${info.id} ${part} ${n.text}`).toEqual(n);
        }
      }
    }
  });

  it('鍵對不上時用寫法找；韓國同音不同漢字的姓（정）靠鍵分得出來；資料改版、找不到時回 null', () => {
    const krPack = pack('kr-modern');
    const jeong = krPack.surnames.map((s, i) => [s, i] as const).filter(([s]) => s.s === '정');
    expect(jeong.length).toBeGreaterThan(1);
    const [second, si] = jeong[1];
    const name = composeCorpusName(krPack, {
      gender: 'male',
      surname: second,
      given: krPack.given.m[0],
    });
    expect(name.ref).toEqual({ g: 'm0', s: si });
    const back = rehydrateCorpusName(krPack, slimCorpusName(name));
    expect(back?.meanings[0]).toBe(`姓：${second.meaning}`);
    /* 鍵壞掉：用寫法找（取第一個 정） */
    const byText = rehydrateCorpusName(krPack, {
      ...slimCorpusName(name),
      ref: { g: 'm999', s: 999 },
    });
    expect(byText?.text).toBe(name.text);
    expect(byText?.meanings[0]).toBe(`姓：${jeong[0][0].meaning}`);
    /* 維京：父親與綽號也找得回來 */
    const v = pack('nordic-viking');
    const viking = generateCorpusNames(v, { count: 50, seed: 'ep' }).names.find((x) => x.epithet);
    expect(viking).toBeTruthy();
    const slim = slimCorpusName(viking as CorpusName);
    expect(rehydrateCorpusName(v, { ...slim, ref: undefined })).toEqual({
      ...viking,
      ref: expect.anything(),
    });
    /* 找不到 */
    expect(
      rehydrateCorpusName(krPack, {
        ...slimCorpusName(name),
        ref: undefined,
        given: '없는이름',
        text: '정없는이름',
      }),
    ).toBeNull();
  });
});
