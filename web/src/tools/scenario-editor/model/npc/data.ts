/**
 * NPC 卡各系統的資料（沿用原作 CC0 的資料表）：Emoklore TRPG、Double Cross 3rd、克蘇魯神話 TRPG。
 * 能力值、技能、共鳴感情、症候群的名稱保留日文：它們會原樣寫進 CCFOLIA 棋子的指令與參數，讀回棋子時也靠同一組字串（規格 3.7、第 5 節）。
 */

/* ---------- Emoklore TRPG ---------- */

export type EmoAb = 'body' | 'dex' | 'mind' | 'sense' | 'int' | 'cha' | 'soc' | 'luck';

export const EMOKLORE_AB: readonly (readonly [EmoAb, string])[] = [
  ['body', '身体'],
  ['dex', '器用'],
  ['mind', '精神'],
  ['sense', '五感'],
  ['int', '知力'],
  ['cha', '魅力'],
  ['soc', '社会'],
  ['luck', '運勢'],
];

export const EMO_AB_LABEL: Record<EmoAb, string> = Object.fromEntries(EMOKLORE_AB) as Record<
  EmoAb,
  string
>;

export interface EmoSkillDef {
  n: string;
  cat: string;
  kind: 'base' | 'normal' | 'ex' | 'special';
  refs: readonly EmoAb[];
  /** 參照能力要除以的數（官方表格的「÷2」） */
  div?: Partial<Record<EmoAb, number>>;
  /** 〈○○:△△〉要附註種類的技能 */
  arg?: boolean;
}

export const EMO_SKILLS: readonly EmoSkillDef[] = [
  { n: '〈*調査〉', cat: '調査系', kind: 'base', refs: ['dex'] },
  { n: '〈検索〉', cat: '調査系', kind: 'normal', refs: ['int'] },
  { n: '〈洞察〉', cat: '調査系', kind: 'normal', refs: ['int'] },
  { n: '〈マッピング〉', cat: '調査系', kind: 'normal', refs: ['dex', 'sense'] },
  { n: '〈直感〉', cat: '調査系', kind: 'normal', refs: ['mind', 'luck'] },
  { n: '〈鑑定〉', cat: '調査系', kind: 'normal', refs: ['sense', 'int'] },
  { n: '〈*知覚〉', cat: '知覚系', kind: 'base', refs: ['sense'] },
  { n: '〈観察眼〉', cat: '知覚系', kind: 'normal', refs: ['sense'] },
  { n: '〈聞き耳〉', cat: '知覚系', kind: 'normal', refs: ['sense'] },
  { n: '〈毒見〉', cat: '知覚系', kind: 'normal', refs: ['sense'] },
  { n: '〈危機察知〉', cat: '知覚系', kind: 'normal', refs: ['sense', 'luck'] },
  { n: '〈★霊感〉', cat: '知覚系', kind: 'ex', refs: ['mind', 'luck'] },
  { n: '〈*交渉〉', cat: '交渉系', kind: 'base', refs: ['cha'] },
  { n: '〈社交術〉', cat: '交渉系', kind: 'normal', refs: ['soc'] },
  { n: '〈ディベート〉', cat: '交渉系', kind: 'normal', refs: ['int'] },
  { n: '〈魅了〉', cat: '交渉系', kind: 'normal', refs: ['cha'] },
  { n: '〈心理〉', cat: '交渉系', kind: 'normal', refs: ['mind', 'int'] },
  { n: '〈*知識〉', cat: '情報系', kind: 'base', refs: ['int'] },
  { n: '〈専門知識:○○〉', cat: '情報系', kind: 'normal', refs: ['int'], arg: true },
  { n: '〈*ニュース〉', cat: '情報系', kind: 'base', refs: ['soc'] },
  { n: '〈事情通〉', cat: '情報系', kind: 'normal', refs: ['sense', 'soc'] },
  { n: '〈業界:○○〉', cat: '情報系', kind: 'normal', refs: ['soc', 'cha'], arg: true },
  { n: '〈*運動〉', cat: '運動系', kind: 'base', refs: ['body'] },
  { n: '〈スピード〉', cat: '運動系', kind: 'normal', refs: ['body'] },
  { n: '〈ストレングス〉', cat: '運動系', kind: 'normal', refs: ['body'] },
  { n: '〈アクロバット〉', cat: '運動系', kind: 'normal', refs: ['body', 'dex'] },
  { n: '〈ダイブ〉', cat: '運動系', kind: 'normal', refs: ['body'] },
  { n: '〈*格闘〉', cat: '運動系', kind: 'base', refs: ['body'] },
  { n: '〈武術:○○〉', cat: '運動系', kind: 'normal', refs: ['body'], arg: true },
  { n: '〈★奥義:○○〉', cat: '運動系', kind: 'ex', refs: ['body', 'mind', 'dex'], arg: true },
  { n: '〈*投擲〉', cat: '運動系', kind: 'base', refs: ['dex'] },
  { n: '〈★射撃:○○〉', cat: '運動系', kind: 'ex', refs: ['dex', 'sense'], arg: true },
  { n: '〈*生存〉', cat: '生存系', kind: 'base', refs: ['body'] },
  { n: '〈耐久〉', cat: '生存系', kind: 'normal', refs: ['body'] },
  { n: '〈*自我〉', cat: '生存系', kind: 'base', refs: ['mind'] },
  { n: '〈根性〉', cat: '生存系', kind: 'normal', refs: ['mind'] },
  { n: '〈*手当て〉', cat: '生存系', kind: 'base', refs: ['int'], div: { int: 2 } },
  { n: '〈医術〉', cat: '生存系', kind: 'normal', refs: ['dex', 'int'] },
  { n: '〈★蘇生〉', cat: '生存系', kind: 'ex', refs: ['int', 'mind'], div: { mind: 2 } },
  { n: '〈*細工〉', cat: '特殊技能', kind: 'base', refs: ['dex'] },
  { n: '〈技巧:○○〉', cat: '特殊技能', kind: 'normal', refs: ['dex'], arg: true },
  { n: '〈芸術:○○〉', cat: '特殊技能', kind: 'normal', refs: ['dex', 'mind', 'sense'], arg: true },
  { n: '〈操縦:○○〉', cat: '特殊技能', kind: 'normal', refs: ['dex', 'sense', 'int'], arg: true },
  { n: '〈暗号〉', cat: '特殊技能', kind: 'normal', refs: ['int'] },
  { n: '〈電脳〉', cat: '特殊技能', kind: 'normal', refs: ['int'] },
  { n: '〈隠匿〉', cat: '特殊技能', kind: 'normal', refs: ['dex', 'soc', 'luck'] },
  { n: '〈*幸運〉', cat: '特殊技能', kind: 'base', refs: ['luck'] },
  { n: '〈★強運〉', cat: '特殊技能', kind: 'ex', refs: ['luck'] },
  { n: '〈∞共鳴〉', cat: '特殊技能', kind: 'special', refs: [] },
];

export const EMO_BASE_SKILLS = EMO_SKILLS.filter((x) => x.kind === 'base');
export const EMO_CATS: readonly string[] = [...new Set(EMO_SKILLS.map((d) => d.cat))];

export interface EmoEmotion {
  k: string;
  label: string;
  items: readonly string[];
}

export const EMO_EMOTIONS: readonly EmoEmotion[] = [
  {
    k: '望',
    label: '欲望',
    items: ['自己顕示', '所有', '本能', '破壊', '優越感', '怠惰', '逃避', '好奇心', 'スリル'],
  },
  {
    k: '念',
    label: '情念',
    items: ['喜び', '怒り', '哀しみ', '幸福', '不安', '嫌悪', '恐怖', '嫉妬', '恨み'],
  },
  {
    k: '想',
    label: '理想',
    items: ['正義', '崇拝', '善悪', '希望', '向上', '理性', '勝利', '秩序', '憧憬', '無我'],
  },
  {
    k: '係',
    label: '関係',
    items: ['友情', '愛', '恋', '依存', '尊敬', '軽蔑', '庇護', '支配', '奉仕', '甘え'],
  },
  {
    k: '傷',
    label: '傷',
    items: ['後悔', '孤独', '諦観', '絶望', '否定', '疑念', '罪悪感', '狂気', '劣等感'],
  },
];

export type EmoSlot = 'omote' | 'ura' | 'root';

export const EMO_RES_SLOTS: readonly (readonly [EmoSlot, string, string])[] = [
  ['omote', '表', '外に出ている感情'],
  ['ura', '裏', '内に潜む感情'],
  ['root', 'ルーツ', '人格の根源'],
];

export const emoAttrOf = (k: string): EmoEmotion | null =>
  EMO_EMOTIONS.find((a) => a.k === k) ?? null;

/** 吸收寫法差異：〈★射撃:拳銃〉、射撃 都對應到同一個定義 */
export function emoNorm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/[〈〉《》<>]/g, '')
    .replace(/[*＊★☆∞]/g, '')
    .replace(/[:：].*$/, '')
    .trim();
}

export const EMO_SKILL_MAP: Record<string, EmoSkillDef> = Object.fromEntries(
  EMO_SKILLS.map((d) => [emoNorm(d.n), d]),
);

export const emoDefOf = (name: unknown): EmoSkillDef | null => EMO_SKILL_MAP[emoNorm(name)] ?? null;

export const emoDiv = (def: EmoSkillDef | null, ref: string): number =>
  def?.div?.[ref as EmoAb] ?? 1;

export function emoRefLabel(def: EmoSkillDef | null): string {
  if (!def) return '';
  if (!def.refs.length) return '共鳴判定の【強度】';
  return def.refs
    .map((r) => EMO_AB_LABEL[r] + (emoDiv(def, r) > 1 ? `÷${emoDiv(def, r)}` : ''))
    .join('／');
}

/** 把附種類技能的 ○○ 換成填好的種類 */
export function emoSkillName(sk: { n: string; arg: string }): string {
  const def = emoDefOf(sk.n);
  const arg = String(sk.arg ?? '').trim();
  if (def?.arg && arg) return def.n.replace('○○', arg);
  return String(sk.n ?? '');
}

/* ---------- Double Cross 3rd ---------- */

export type DxAb = 'body' | 'sense' | 'mind' | 'soc';

export const DX3RD_AB: readonly (readonly [DxAb, string])[] = [
  ['body', '肉体'],
  ['sense', '感覚'],
  ['mind', '精神'],
  ['soc', '社会'],
];

export interface DxSyn {
  k: string;
  n: string;
  /** 在紙上容易分辨的顏色 */
  c: string;
}

export const DX3RD_SYN: readonly DxSyn[] = [
  { k: 'angel', n: 'エンジェルハイロゥ', c: '#b8912f' },
  { k: 'balor', n: 'バロール', c: '#6b3fa0' },
  { k: 'bdog', n: 'ブラックドッグ', c: '#1f4e8c' },
  { k: 'bram', n: 'ブラム＝ストーカー', c: '#8e1420' },
  { k: 'chim', n: 'キュマイラ', c: '#7a4a24' },
  { k: 'exile', n: 'エグザイル', c: '#4a7a3a' },
  { k: 'hanu', n: 'ハヌマーン', c: '#d2691e' },
  { k: 'morph', n: 'モルフェウス', c: '#5f6b73' },
  { k: 'neum', n: 'ノイマン', c: '#128a86' },
  { k: 'orcus', n: 'オルクス', c: '#23201c' },
  { k: 'sala', n: 'サラマンダー', c: '#d1402a' },
  { k: 'sola', n: 'ソラリス', c: '#8ea628' },
  { k: 'uro', n: 'ウロボロス', c: '#a02f7a' },
];

/** 效果的種類：13 種症候群＋イージー、ワークス */
export const DX3RD_KIND: readonly DxSyn[] = [
  ...DX3RD_SYN,
  { k: 'easy', n: 'イージー', c: '#9a9184' },
  { k: 'works', n: 'ワークス', c: '#4f4636' },
];

export const DX3RD_BREEDS: readonly (readonly [string, string, number])[] = [
  ['pure', 'ピュア', 1],
  ['cross', 'クロス', 2],
  ['tri', 'トライ', 3],
];

export const dxBreedN = (b: string): number => DX3RD_BREEDS.find((v) => v[0] === b)?.[2] ?? 0;
export const dxSynOf = (k: string): DxSyn | null => DX3RD_SYN.find((x) => x.k === k) ?? null;
export const dxKindOf = (k: string): DxSyn | null => DX3RD_KIND.find((x) => x.k === k) ?? null;

/** 選好的症候群組成「バロール／ノイマン」 */
export function dxSynText(d: { breed: string; syns: readonly string[] }): string {
  const n = dxBreedN(d.breed) || (d.syns ?? []).filter(Boolean).length;
  return (d.syns ?? [])
    .slice(0, n || 3)
    .map((k) => dxSynOf(k)?.n ?? '')
    .filter(Boolean)
    .join('／');
}

/** 依名稱找症候群（「＝」全形半形都可以） */
export function dxSynByName(t: string): DxSyn | null {
  const v = t.trim().replace('＝', '=');
  return DX3RD_SYN.find((y) => y.n === t.trim() || y.n.replace('＝', '=') === v) ?? null;
}

export interface DxSkillDef {
  k: string;
  n: string;
  ab: DxAb;
  arg?: boolean;
}

export const DX3RD_SKILL_DEFS: readonly DxSkillDef[] = [
  { k: 'melee', n: '白兵', ab: 'body' },
  { k: 'dodge', n: '回避', ab: 'body' },
  { k: 'ride', n: '運転', ab: 'body', arg: true },
  { k: 'ranged', n: '射撃', ab: 'sense' },
  { k: 'percept', n: '知覚', ab: 'sense' },
  { k: 'art', n: '芸術', ab: 'sense', arg: true },
  { k: 'rc', n: 'RC', ab: 'mind' },
  { k: 'will', n: '意志', ab: 'mind' },
  { k: 'know', n: '知識', ab: 'mind', arg: true },
  { k: 'negotiate', n: '交渉', ab: 'soc' },
  { k: 'procure', n: '調達', ab: 'soc' },
  { k: 'info', n: '情報', ab: 'soc', arg: true },
];

/* ---------- 克蘇魯神話 TRPG ---------- */

export type CocAb = 'str' | 'con' | 'pow' | 'dex' | 'app' | 'siz' | 'int' | 'edu';

export const COC_AB: readonly (readonly [CocAb, string])[] = [
  ['str', 'STR'],
  ['con', 'CON'],
  ['pow', 'POW'],
  ['dex', 'DEX'],
  ['app', 'APP'],
  ['siz', 'SIZ'],
  ['int', 'INT'],
  ['edu', 'EDU'],
];

export const COC_SKILLS: Record<'6' | '7', readonly (readonly [string, readonly string[]])[]> = {
  '6': [
    [
      '戦闘',
      [
        '回避',
        'キック',
        '組み付き',
        'こぶし（パンチ）',
        '頭突き',
        '投擲',
        'マーシャルアーツ',
        '拳銃',
        'サブマシンガン',
        'ショットガン',
        'マシンガン',
        'ライフル',
      ],
    ],
    [
      '探索',
      [
        '応急手当',
        '鍵開け',
        '隠す',
        '隠れる',
        '聞き耳',
        '忍び歩き',
        '写真術',
        '精神分析',
        '追跡',
        '登攀',
        '図書館',
        '目星',
      ],
    ],
    [
      '行動',
      [
        '運転',
        '機械修理',
        '重機械操作',
        '乗馬',
        '水泳',
        '製作',
        '操縦',
        '跳躍',
        '電気修理',
        'ナビゲート',
        '変装',
      ],
    ],
    ['交渉', ['言いくるめ', '信用', '説得', '値切り', '母国語']],
    [
      '知識',
      [
        '医学',
        'オカルト',
        '化学',
        'クトゥルフ神話',
        '芸術',
        '経理',
        '考古学',
        'コンピューター',
        '心理学',
        '人類学',
        '生物学',
        '地質学',
        '電子工学',
        '天文学',
        '博物学',
        '物理学',
        '法律',
        '薬学',
        '歴史',
      ],
    ],
  ],
  '7': [
    ['戦闘', ['回避', '近接戦闘', '投擲', '射撃']],
    [
      '探索',
      [
        '応急手当',
        '鍵開け',
        '手さばき',
        '聞き耳',
        '隠密',
        '精神分析',
        '追跡',
        '登攀',
        '図書館',
        '目星',
        '鑑定',
      ],
    ],
    [
      '行動',
      [
        '運転',
        '機械修理',
        '重機械操作',
        '乗馬',
        '水泳',
        '芸術',
        '製作',
        '操縦',
        '跳躍',
        '電気修理',
        'ナビゲート',
        '変装',
      ],
    ],
    ['交渉', ['言いくるめ', '信用', '説得', '母国語', 'ほかの言語', '威圧', '魅惑']],
    [
      '知識',
      [
        '医学',
        'オカルト',
        'クトゥルフ神話',
        '経理',
        '考古学',
        'コンピューター',
        '科学',
        '心理学',
        '人類学',
        '電子工学',
        '自然',
        '法律',
        '歴史',
        'サバイバル',
        '伝承',
      ],
    ],
  ],
};

/** 要附註專業領域的技能 */
export const COC_ARG_SKILLS: Record<'6' | '7', readonly string[]> = {
  '6': ['芸術', '製作', '母国語', '操縦', '運転'],
  '7': [
    '近接戦闘',
    '射撃',
    '運転',
    '製作',
    '操縦',
    '芸術',
    '科学',
    'サバイバル',
    'ほかの言語',
    '伝承',
    '母国語',
  ],
};

const verKey = (ver: string): '6' | '7' => (ver === '6' ? '6' : '7');

export function cocNeedsArg(ver: string, name: unknown): boolean {
  const n = String(name ?? '').trim();
  return !!n && COC_ARG_SKILLS[verKey(ver)].includes(n);
}

export const cocCats = (ver: string): string[] => COC_SKILLS[verKey(ver)].map((x) => x[0]);

export function cocSkillsOf(ver: string, cat: string): string[] {
  const t = COC_SKILLS[verKey(ver)];
  return cat ? [...(t.find((x) => x[0] === cat)?.[1] ?? [])] : t.flatMap((x) => [...x[1]]);
}

export const cocCatOf = (ver: string, name: string): string =>
  COC_SKILLS[verKey(ver)].find((g) => g[1].includes(name))?.[0] ?? '';

/** 附種類的技能名稱（例：運転:バイク） */
export function withArg(name: string, arg: unknown): string {
  const a = String(arg ?? '').trim();
  return a ? `${name}:${a}` : name;
}

/* ---------- 數值欄的候選（3.7.5） ---------- */

export function rangeList(a: number, b: number, step = 1): string[] {
  const out: string[] = [];
  for (let v = a; v <= b; v += step) out.push(String(v));
  return out;
}

export const NPC_LISTS = {
  emoAb: rangeList(1, 6),
  emoLv: ['1', '2', '3'],
  emoKyomei: rangeList(1, 9),
  dxAb: rangeList(1, 12),
  dxSk: rangeList(0, 20),
  dxEnc: rangeList(0, 100, 5),
  dxHp: rangeList(10, 80, 5),
  coc6a: rangeList(3, 18),
  coc6b: rangeList(8, 18),
  coc6e: rangeList(6, 21),
  coc7a: rangeList(15, 90, 5),
  coc7b: rangeList(40, 90, 5),
  cocSk: rangeList(0, 100, 5),
  db: ['-2', '-1', '0', '+1D4', '+1D6', '+2D6', '+3D6'],
  build: ['-2', '-1', '0', '1', '2', '3', '4'],
  mov: rangeList(5, 12),
  dmg: ['1D3', '1D4', '1D6', '1D8', '1D10', '2D6', '1D3+DB', '1D4+DB', '1D6+DB'],
} as const;

export type NpcListKey = keyof typeof NPC_LISTS;

/** 克蘇魯能力值的候選（第 6 版是 3D6 等的原始值，第 7 版是 ×5 的百分比） */
export function cocAbList(ver: string, k: CocAb): NpcListKey {
  if (ver === '6') return k === 'siz' || k === 'int' ? 'coc6b' : k === 'edu' ? 'coc6e' : 'coc6a';
  return k === 'siz' || k === 'int' || k === 'edu' ? 'coc7b' : 'coc7a';
}
