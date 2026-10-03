/**
 * 盧恩字母表（字形、讀音、名稱、中文讀法）與拉丁字母的近似轉換（規格 3.9；字母表與對應沿用原作，MIT）。
 */

export type RuneSetId = 'elder' | 'younger' | 'futhorc';
export const RUNE_SET_IDS: readonly RuneSetId[] = ['elder', 'younger', 'futhorc'];

export interface Rune {
  glyph: string;
  sound: string;
  name: string;
  /** 中文讀法 */
  reading: string;
}

interface RuneSet {
  runes: readonly Rune[];
  map: Readonly<Record<string, string>>;
  /** 比對用：拼寫由長到短 */
  tokens: readonly string[];
}

const r = (glyph: string, sound: string, name: string, reading: string): Rune => ({
  glyph,
  sound,
  name,
  reading,
});

function makeSet(runes: Rune[], map: Record<string, string>): RuneSet {
  return { runes, map, tokens: Object.keys(map).sort((a, b) => b.length - a.length) };
}

export const RUNE_SETS: Record<RuneSetId, RuneSet> = {
  elder: makeSet(
    [
      r('ᚠ', 'f', 'Fehu', '費胡'),
      r('ᚢ', 'u', 'Uruz', '烏魯茲'),
      r('ᚦ', 'th', 'Thurisaz', '圖里薩茲'),
      r('ᚨ', 'a', 'Ansuz', '安蘇茲'),
      r('ᚱ', 'r', 'Raidho', '萊多'),
      r('ᚲ', 'k', 'Kenaz', '肯納茲'),
      r('ᚷ', 'g', 'Gebo', '蓋伯'),
      r('ᚹ', 'w', 'Wunjo', '溫約'),
      r('ᚺ', 'h', 'Hagalaz', '哈加拉茲'),
      r('ᚾ', 'n', 'Nauthiz', '瑙提茲'),
      r('ᛁ', 'i', 'Isa', '伊薩'),
      r('ᛃ', 'j/y', 'Jera', '耶拉'),
      r('ᛇ', 'ei', 'Eihwaz', '艾瓦茲'),
      r('ᛈ', 'p', 'Perthro', '佩斯羅'),
      r('ᛉ', 'z', 'Algiz', '阿爾吉茲'),
      r('ᛊ', 's', 'Sowilo', '索維洛'),
      r('ᛏ', 't', 'Tiwaz', '提瓦茲'),
      r('ᛒ', 'b', 'Berkano', '貝爾卡諾'),
      r('ᛖ', 'e', 'Ehwaz', '埃瓦茲'),
      r('ᛗ', 'm', 'Mannaz', '曼納茲'),
      r('ᛚ', 'l', 'Laguz', '拉古茲'),
      r('ᛜ', 'ng', 'Ingwaz', '英瓦茲'),
      r('ᛞ', 'd', 'Dagaz', '達加茲'),
      r('ᛟ', 'o', 'Othala', '奧薩拉'),
    ],
    {
      th: 'ᚦ',
      ng: 'ᛜ',
      ei: 'ᛇ',
      f: 'ᚠ',
      v: 'ᚠ',
      u: 'ᚢ',
      a: 'ᚨ',
      r: 'ᚱ',
      k: 'ᚲ',
      c: 'ᚲ',
      q: 'ᚲᚹ',
      g: 'ᚷ',
      w: 'ᚹ',
      h: 'ᚺ',
      n: 'ᚾ',
      i: 'ᛁ',
      j: 'ᛃ',
      y: 'ᛃ',
      p: 'ᛈ',
      z: 'ᛉ',
      s: 'ᛊ',
      x: 'ᚲᛊ',
      t: 'ᛏ',
      b: 'ᛒ',
      e: 'ᛖ',
      m: 'ᛗ',
      l: 'ᛚ',
      d: 'ᛞ',
      o: 'ᛟ',
    },
  ),
  younger: makeSet(
    [
      r('ᚠ', 'f/v', 'Fé', '費'),
      r('ᚢ', 'u/w', 'Úr', '烏爾'),
      r('ᚦ', 'th', 'Þurs', '蘇爾斯'),
      r('ᚬ', 'o', 'Óss', '奧斯'),
      r('ᚱ', 'r', 'Reið', '雷茲'),
      r('ᚴ', 'k/g', 'Kaun', '考恩'),
      r('ᚼ', 'h', 'Hagall', '哈加爾'),
      r('ᚾ', 'n', 'Nauðr', '瑙茲爾'),
      r('ᛁ', 'i/e', 'Íss', '伊斯'),
      r('ᛅ', 'a', 'Ár', '阿爾'),
      r('ᛋ', 's', 'Sól', '索爾'),
      r('ᛏ', 't/d', 'Týr', '提爾'),
      r('ᛒ', 'b/p', 'Bjarkan', '比亞爾坎'),
      r('ᛘ', 'm', 'Maðr', '馬茲爾'),
      r('ᛚ', 'l', 'Lögr', '勒格爾'),
      r('ᛦ', 'y/r', 'Ýr', '于爾'),
    ],
    {
      th: 'ᚦ',
      f: 'ᚠ',
      v: 'ᚠ',
      u: 'ᚢ',
      w: 'ᚢ',
      o: 'ᚬ',
      r: 'ᚱ',
      k: 'ᚴ',
      c: 'ᚴ',
      q: 'ᚴ',
      g: 'ᚴ',
      h: 'ᚼ',
      n: 'ᚾ',
      i: 'ᛁ',
      e: 'ᛁ',
      a: 'ᛅ',
      s: 'ᛋ',
      z: 'ᛋ',
      x: 'ᚴᛋ',
      t: 'ᛏ',
      d: 'ᛏ',
      b: 'ᛒ',
      p: 'ᛒ',
      m: 'ᛘ',
      l: 'ᛚ',
      j: 'ᛦ',
      y: 'ᛦ',
    },
  ),
  futhorc: makeSet(
    [
      r('ᚠ', 'f', 'Feoh', '費歐'),
      r('ᚢ', 'u', 'Ur', '烏爾'),
      r('ᚦ', 'th', 'Thorn', '索恩'),
      r('ᚩ', 'o', 'Os', '奧斯'),
      r('ᚱ', 'r', 'Rad', '拉德'),
      r('ᚳ', 'c/k', 'Cen', '肯'),
      r('ᚷ', 'g', 'Gyfu', '居弗'),
      r('ᚹ', 'w', 'Wynn', '溫恩'),
      r('ᚻ', 'h', 'Hægl', '海格爾'),
      r('ᚾ', 'n', 'Nyd', '尼德'),
      r('ᛁ', 'i', 'Is', '伊斯'),
      r('ᛄ', 'j', 'Ger', '蓋爾'),
      r('ᛇ', 'eo', 'Eoh', '埃歐'),
      r('ᛈ', 'p', 'Peorð', '佩歐茲'),
      r('ᛉ', 'x', 'Eolh', '埃奧爾'),
      r('ᛋ', 's', 'Sigel', '西格爾'),
      r('ᛏ', 't', 'Tir', '提爾'),
      r('ᛒ', 'b', 'Beorc', '貝奧克'),
      r('ᛖ', 'e', 'Eh', '埃'),
      r('ᛗ', 'm', 'Mann', '曼'),
      r('ᛚ', 'l', 'Lagu', '拉古'),
      r('ᛝ', 'ng', 'Ing', '英'),
      r('ᛟ', 'oe', 'Ethel', '埃塞爾'),
      r('ᛞ', 'd', 'Dæg', '戴格'),
      r('ᚪ', 'a', 'Ac', '阿克'),
      r('ᚫ', 'ae', 'Æsc', '艾斯克'),
      r('ᚣ', 'y', 'Yr', '于爾'),
      r('ᛡ', 'io', 'Ior', '約爾'),
      r('ᛠ', 'ea', 'Ear', '埃阿爾'),
    ],
    {
      th: 'ᚦ',
      ng: 'ᛝ',
      eo: 'ᛇ',
      oe: 'ᛟ',
      ae: 'ᚫ',
      io: 'ᛡ',
      ea: 'ᛠ',
      f: 'ᚠ',
      v: 'ᚠ',
      u: 'ᚢ',
      o: 'ᚩ',
      r: 'ᚱ',
      c: 'ᚳ',
      k: 'ᚳ',
      q: 'ᚳᚹ',
      g: 'ᚷ',
      w: 'ᚹ',
      h: 'ᚻ',
      n: 'ᚾ',
      i: 'ᛁ',
      j: 'ᛄ',
      p: 'ᛈ',
      x: 'ᛉ',
      s: 'ᛋ',
      z: 'ᛋ',
      t: 'ᛏ',
      b: 'ᛒ',
      e: 'ᛖ',
      m: 'ᛗ',
      l: 'ᛚ',
      d: 'ᛞ',
      a: 'ᚪ',
      y: 'ᚣ',
    },
  ),
};

/**
 * 拉丁字母 → 盧恩：從左到右找最長的符合拼寫（大寫視為小寫），找不到時原字元照抄。
 * 例：古弗薩克「futhark, thing」→「ᚠᚢᚦᚨᚱᚲ, ᚦᛁᛜ」。
 */
export function convertLatinToRunes(value: string, setId: RuneSetId = 'elder'): string {
  const set = RUNE_SETS[setId] ?? RUNE_SETS.elder;
  const source = String(value ?? '');
  const comparable = source.replace(/[A-Z]/g, (c) => c.toLowerCase());
  let out = '';
  for (let i = 0; i < source.length; ) {
    const token = set.tokens.find((t) => comparable.startsWith(t, i));
    if (token) {
      out += set.map[token];
      i += token.length;
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
}

/** 搜尋（比對字形、讀音、名稱、中文讀法，不分大小寫） */
export function filterRunes(setId: RuneSetId, query: string): Rune[] {
  const q = query.trim().toLowerCase();
  const list = RUNE_SETS[setId]?.runes ?? [];
  if (!q) return list.slice();
  return list.filter((it) =>
    `${it.glyph} ${it.sound} ${it.name} ${it.reading}`.toLowerCase().includes(q),
  );
}
