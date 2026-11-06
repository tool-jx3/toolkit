/**
 * 奇幻隨機產生器的產生器：每個產生器在每種條件下都抽得出來（沒有找不到的表、沒有剩下的大括號）、同一個種子同一批、
 * 法術與數值（法術捲軸的表、環位與稀有度、法師的法術書）、寶藏的錢幣範圍、名字依種族、只用 SRD 的物品。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import type { CorpusData } from '@/core/names/corpus';
import * as fantasyCorpus from '@/core/names/inknomu/inknomu-fantasy';
import {
  ART_FINE,
  ART_TREASURES,
  ART_TRINKETS,
  artTier,
  GEM_TIERS,
  gemTier,
  NPC_SPECIES,
} from '@/tools/fantasy-gen/data/own';
import { SPELLS } from '@/tools/fantasy-gen/data/srd/spells';
import { BFRD_ITEMS, LAZY_ITEMS, SRD52_ITEMS } from '@/tools/fantasy-gen/data/srd/treasure-items';
import { partsText } from '@/tools/fantasy-gen/engine';
import {
  formatSpell,
  GENERATORS,
  type GenEnv,
  type GenOptions,
  generatorById,
  pickSpell,
  RARITY_LEVELS,
  rollSpellbook,
  SCROLL_STATS,
  spellsOf,
  wizardProgression,
} from '@/tools/fantasy-gen/generators';
import { fantasyNames, generateBatch, rollCard } from '@/tools/fantasy-gen/logic';

const corpus: CorpusData = { region: 'fantasy', packs: fantasyCorpus.PACKS };
const env: GenEnv = { names: fantasyNames(corpus) };

/** 每個產生器的每一種條件組合（選項多時每個選項各試一遍） */
function optionSets(id: string): GenOptions[] {
  const def = generatorById(id);
  if (!def) return [];
  const base: Record<string, string> = Object.fromEntries(
    def.options.map((o) => [o.key, o.default]),
  );
  const sets: GenOptions[] = [base];
  for (const o of def.options)
    for (const c of o.choices) if (c.value !== o.default) sets.push({ ...base, [o.key]: c.value });
  return sets;
}

describe('每個產生器都抽得出來', () => {
  for (const def of GENERATORS) {
    it(`${def.label}（${def.id}）`, () => {
      for (const options of optionSets(def.id)) {
        for (let i = 0; i < 40; i++) {
          const issues = new Set<string>();
          const { parts } = rollCard({
            def,
            options,
            env,
            rng: seededRandom(`${def.id}-${i}`),
            issues,
          });
          const text = partsText(parts);
          expect([...issues], `${JSON.stringify(options)}`).toEqual([]);
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toMatch(/[{}]|\[\[|undefined|null/);
        }
      }
    });
  }
});

describe('同一個種子同一批', () => {
  for (const def of GENERATORS) {
    it(def.id, () => {
      const batch = (seed: string) =>
        generateBatch({ def, options: {}, env, count: 8, seed }).results.map((r) =>
          partsText(r.parts),
        );
      expect(batch('same')).toEqual(batch('same'));
      expect(generateBatch({ def, options: {}, env, count: 3, seed: 'same' }).seed).toBe('same');
    });
  }

  it('種子空白時用隨機的種子，記在結果裡，再用它就重現', () => {
    const def = generatorById('npc')!;
    const a = generateBatch({ def, options: {}, env, count: 5, seed: '', random: () => 0.42 });
    expect(a.seed).toMatch(/^[a-z0-9]{6}$/);
    const b = generateBatch({ def, options: {}, env, count: 5, seed: a.seed });
    expect(b.results.map((r) => r.parts)).toEqual(a.results.map((r) => r.parts));
  });

  it('固定的種子：NPC 的第一筆（資料或抽法改了才要更新）', () => {
    const def = generatorById('npc')!;
    const [first] = generateBatch({ def, options: {}, env, count: 1, seed: 'shot' }).results;
    expect(partsText(first.parts)).toMatchInlineSnapshot(
      `"Marlow Coldwater——慢條斯理的人類燒炭工，留著一條灰白的長辮子，穿著一件內外穿反的斗篷，想要保住村子的土地。"`,
    );
  });
});

describe('NPC', () => {
  it('名字依種族的語料（精靈抽精靈的名字）；欄的順序：名字、個性、種族、身分、特徵、穿著、目標', () => {
    const def = generatorById('npc')!;
    const elfNames = new Set(
      fantasyCorpus.PACKS.find((p) => p.id === 'fantasy-elf')!
        .given.m.concat(
          fantasyCorpus.PACKS.find((p) => p.id === 'fantasy-elf')!.given.f,
          fantasyCorpus.PACKS.find((p) => p.id === 'fantasy-elf')!.given.u,
        )
        .map((g) => g.g),
    );
    let checked = 0;
    for (let i = 0; i < 200 && checked < 5; i++) {
      const { parts } = rollCard({ def, options: {}, env, rng: seededRandom(`elf-${i}`) });
      const species = parts.find((p) => p.l === '種族')?.t;
      if (species !== '精靈') continue;
      const given = parts.find((p) => p.l === '名字')!.t.split(' ')[0];
      expect(elfNames.has(given)).toBe(true);
      checked++;
    }
    expect(checked).toBe(5);
    const { parts } = rollCard({ def, options: {}, env, rng: seededRandom('x') });
    expect(parts.filter((p) => p.l).map((p) => p.l)).toEqual([
      '名字',
      '個性',
      '種族',
      '身分',
      '特徵',
      '穿著',
      '目標',
    ]);
  });

  it('種族的權重：人類 10、精靈／矮人／半身人 5', () => {
    const w = new Map(NPC_SPECIES.map(([n, , weight]) => [n, weight]));
    expect([w.get('人類'), w.get('精靈'), w.get('矮人'), w.get('半身人')]).toEqual([10, 5, 5, 5]);
  });

  it('還沒有名字的語料時是「（無名氏）」', () => {
    const def = generatorById('npc')!;
    const { parts } = rollCard({ def, options: {}, env: { names: null }, rng: () => 0 });
    expect(parts[0].t).toBe('（無名氏）');
  });
});

describe('法術', () => {
  it('法術捲軸的數值照 SRD 的表（DC、攻擊加值）與原作的參考價', () => {
    expect(SCROLL_STATS.map((s) => [s.dc, s.attack])).toEqual([
      [13, 5],
      [13, 5],
      [13, 5],
      [15, 7],
      [15, 7],
      [17, 9],
      [17, 9],
      [18, 10],
      [18, 10],
      [19, 11],
    ]);
    expect(SCROLL_STATS.map((s) => s.price)).toEqual([
      30, 50, 200, 300, 2000, 3000, 20000, 25000, 30000, 100000,
    ]);
  });

  it('稀有度 → 環位（普通＝戲法與 1 環、非普通＝2～3、珍稀＝4～5、非常珍稀＝6～8、傳說＝9）', () => {
    expect(RARITY_LEVELS.common).toEqual([0, 1]);
    expect(RARITY_LEVELS.uncommon).toEqual([2, 3]);
    expect(RARITY_LEVELS.rare).toEqual([4, 5]);
    expect(RARITY_LEVELS['very-rare']).toEqual([6, 7, 8]);
    expect(RARITY_LEVELS.legendary).toEqual([9]);
    for (let i = 0; i < 50; i++) {
      const s = pickSpell('srd52', [4, 5], seededRandom(`r${i}`))!;
      expect([4, 5]).toContain(s.level);
    }
  });

  it('寫法：「中文（英文）」＋環位、稀有度、DC、法術攻擊、價格（遺物是一半）', () => {
    const fireball = spellsOf('srd52').find((s) => s.en === 'Fireball')!;
    expect(fireball.level).toBe(3);
    expect(formatSpell(fireball, 'scroll')).toBe(
      '「火球術（Fireball）」（3 環，非普通，DC 15，法術攻擊 +7，300 GP）',
    );
    expect(formatSpell(fireball, 'relic')).toBe(
      '「火球術（Fireball）」（3 環，非普通，DC 15，法術攻擊 +7，150 GP）',
    );
    expect(formatSpell(fireball, 'short')).toBe(
      '「火球術（Fireball）」（3 環，DC 15，法術攻擊 +7）',
    );
    const light = spellsOf('srd51').find((s) => s.en === 'Light')!;
    expect(formatSpell(light, 'item')).toBe(
      '「光亮術（Light）」（戲法，普通，DC 13，法術攻擊 +5）',
    );
  });

  it('三份 SRD 的法術數（SRD 5.2：338、SRD 5.1：319、BFRD：304）；每個都有中文', () => {
    expect(spellsOf('srd52')).toHaveLength(338);
    expect(spellsOf('srd51')).toHaveLength(319);
    expect(spellsOf('bfrd')).toHaveLength(304);
    /* 原作 Black Flag 寶藏的法術裡不在 BFRD 的 PDF 的 4 個（2 個是 Deep Magic，OGL）不收 */
    for (const en of ['Circle Of Stones', 'Fire Under The Tongue', 'Pendulum', 'Tidal Wave'])
      expect(SPELLS.some((r) => r[0] === en)).toBe(false);
    for (const r of SPELLS) expect(r[1]).toMatch(/[一-鿿]/);
  });

  it('法師的進度：法術書 6＋2×（等級−1）、最高環位、戲法 3／4／5', () => {
    expect(wizardProgression(1)).toEqual({ spells: 6, maxLevel: 1, cantrips: 3 });
    expect(wizardProgression(3)).toEqual({ spells: 10, maxLevel: 2, cantrips: 3 });
    expect(wizardProgression(4)).toEqual({ spells: 12, maxLevel: 2, cantrips: 4 });
    expect(wizardProgression(10)).toEqual({ spells: 24, maxLevel: 5, cantrips: 5 });
    expect(wizardProgression(17)).toEqual({ spells: 38, maxLevel: 9, cantrips: 5 });
    expect(wizardProgression(20)).toEqual({ spells: 44, maxLevel: 9, cantrips: 5 });
  });

  it('法術書：戲法與法術的個數、每一環至少一個、不重複、都是法師的法術', () => {
    for (const source of ['srd52', 'srd51'] as const) {
      for (const level of [1, 3, 9, 17, 20]) {
        const p = wizardProgression(level);
        const parts = rollSpellbook(source, level, {
          rng: seededRandom(`${source}${level}`),
          keep: {},
        });
        const lines = parts.filter((x) => x.k);
        const spells = lines.flatMap((x) => x.t.split('、'));
        expect(new Set(spells).size).toBe(spells.length);
        const cantrips = lines.find((x) => x.k === '戲法')!.t.split('、');
        expect(cantrips).toHaveLength(p.cantrips);
        expect(spells.length - cantrips.length).toBe(p.spells);
        const levels = lines.filter((x) => x.k !== '戲法').map((x) => Number.parseInt(x.k!, 10));
        expect(levels).toEqual(Array.from({ length: p.maxLevel }, (_, i) => i + 1));
        const wizard = new Set(
          spellsOf(source)
            .filter((s) => s.wizard)
            .map((s) => `${s.zh}（${s.en}）`),
        );
        for (const s of spells) expect(wizard.has(s)).toBe(true);
      }
    }
  });

  it('法術書：重抽一環照舊的個數、不和其他環重複', () => {
    const args = { rng: seededRandom('book'), keep: {} };
    const before = rollSpellbook('srd52', 9, args);
    const keep = Object.fromEntries(
      before.filter((x) => x.k && x.k !== '3 環').map((x) => [x.k!, x.t]),
    );
    const after = rollSpellbook('srd52', 9, { rng: seededRandom('again'), keep, prev: before });
    const count = (parts: typeof before, k: string) =>
      parts.find((x) => x.k === k)!.t.split('、').length;
    expect(count(after, '3 環')).toBe(count(before, '3 環'));
    for (const k of Object.keys(keep)) expect(after.find((x) => x.k === k)!.t).toBe(keep[k]);
    const all = after.filter((x) => x.k).flatMap((x) => x.t.split('、'));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('寶藏', () => {
  it('寶石與藝術品依價值挑本站的分級（寶石 5 級、藝術品 3 級）', () => {
    expect(gemTier(10)).toBe(GEM_TIERS[0][1]);
    expect(gemTier(25)).toBe(GEM_TIERS[0][1]);
    expect(gemTier(50)).toBe(GEM_TIERS[1][1]);
    expect(gemTier(250)).toBe(GEM_TIERS[2][1]);
    expect(gemTier(1000)).toBe(GEM_TIERS[3][1]);
    expect(gemTier(5000)).toBe(GEM_TIERS[4][1]);
    expect(artTier(50)).toBe(ART_TRINKETS);
    expect(artTier(750)).toBe(ART_FINE);
    expect(artTier(2500)).toBe(ART_TREASURES);
    const def = generatorById('treasure')!;
    for (let i = 0; i < 20; i++) {
      const { parts } = rollCard({
        def,
        options: { tier: 'tier4' },
        env,
        rng: seededRandom(`g${i}`),
      });
      const gem = parts.find((p) => p.l === '寶石')!.t.split(' ×')[0];
      expect(GEM_TIERS[4][1]).toContain(gem);
      expect(ART_TREASURES.some((a) => parts.find((p) => p.l === '藝術品')!.t.includes(a))).toBe(
        true,
      );
    }
  });

  const coins = (text: string) => {
    const line = text.split('\n')[0];
    const out: Record<string, number> = {};
    for (const m of line.matchAll(/([\d,]+) (CP|SP|GP|PP)/g))
      out[m[2]] = Number(m[1].replace(/,/g, ''));
    return out;
  };

  it('Lazy 5e：錢幣的範圍照原作（1～4 級：400～600 CP、350～550 SP、180～280 GP）', () => {
    const def = generatorById('treasure')!;
    for (let i = 0; i < 30; i++) {
      const text = partsText(
        rollCard({ def, options: { tier: 'tier1' }, env, rng: seededRandom(`t${i}`) }).parts,
      );
      const c = coins(text);
      expect(c.CP).toBeGreaterThanOrEqual(400);
      expect(c.CP).toBeLessThanOrEqual(600);
      expect(c.SP).toBeGreaterThanOrEqual(350);
      expect(c.GP).toBeLessThanOrEqual(280);
      expect(text.split('\n')).toHaveLength(7);
    }
    const noRelic = partsText(
      rollCard({ def, options: { tier: 'tier4', relic: 'off' }, env, rng: seededRandom('x') })
        .parts,
    );
    expect(noRelic.split('\n')).toHaveLength(6);
    expect(coins(noRelic).GP).toBeGreaterThanOrEqual(45000);
  });

  it('SRD 5.2：魔法物品的個數（1～4 級 0～3 個），每個前面標稀有度', () => {
    const def = generatorById('treasure-2024')!;
    const counts = new Set<number>();
    for (let i = 0; i < 80; i++) {
      const { parts } = rollCard({
        def,
        options: { tier: 'tier1' },
        env,
        rng: seededRandom(`m${i}`),
      });
      const field = parts.find((p) => p.l === '魔法物品')!.t;
      const lines = field ? field.split('\n') : [];
      counts.add(lines.length);
      for (const l of lines) expect(l).toMatch(/^魔法物品：〔(普通|非普通|珍稀)〕/);
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  });

  it('BFRD：不收 Kobold Press 其他書（OGL）的物品；三份表都沒有剩下英文沒翻的物品', () => {
    const all = [LAZY_ITEMS, SRD52_ITEMS, BFRD_ITEMS].flatMap((t) =>
      Object.values(t).flatMap((rows) => rows.map((r) => (typeof r === 'string' ? r : r[0]))),
    );
    for (const name of [
      'Dancing Lockpicks',
      'Beast Buckle',
      'Mailbreaker',
      'Bagpipes of Battle',
      'brigandine',
    ])
      expect(all.some((e) => e.toLowerCase().includes(name.toLowerCase()))).toBe(false);
    for (const e of all)
      if (!e.startsWith('+') && !e.startsWith('{')) expect(e).toMatch(/^[^A-Za-z]+（/);
  });
});
