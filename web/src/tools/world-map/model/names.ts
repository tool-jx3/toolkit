/**
 * 地名提案（本站自己的字庫，繁中）：依種類（王都、港口、山脈、國…）接上適合的稱呼，
 * 附近是雪原、沙漠或濕地時，名字的第一個字換成那種氣候的字（雪、沙、葦…）。
 *
 * 名字的本體兩種各半：
 * - 音譯風：一個開頭的音＋（45％）一個中間的音＋一個結尾的音，例如「艾爾德」「瑟蘭」。
 * - 漢字風：一個形容的字＋一個地形的字，例如「霜嶺」「碧灣」。
 * 同一個種子、種類與氣候一定得到同一個名字（自動產生地圖的決定性）。
 */
import { createRandom, type Random } from '@/core/timeline/random';
import type { Climate } from './climate';

const SOUND_HEAD = [
  '艾',
  '瑟',
  '維',
  '洛',
  '卡',
  '伊',
  '索',
  '塔',
  '雷',
  '諾',
  '芙',
  '葛',
  '薩',
  '奧',
  '貝',
  '米',
  '希',
  '柯',
  '黎',
  '珀',
  '蘿',
  '法',
  '琉',
  '嘉',
];
const SOUND_MID = [
  '爾',
  '拉',
  '蘭',
  '斯',
  '莉',
  '維',
  '多',
  '瑞',
  '納',
  '提',
  '歐',
  '塞',
  '米',
  '格',
];
const SOUND_TAIL = [
  '恩',
  '斯',
  '德',
  '蘭',
  '堡',
  '林',
  '頓',
  '加',
  '薇',
  '諾',
  '拉',
  '亞',
  '特',
  '隆',
  '蒂',
  '溫',
];
const WORD_HEAD = [
  '霜',
  '青',
  '月',
  '白',
  '赤',
  '蒼',
  '翠',
  '金',
  '鐵',
  '星',
  '雲',
  '風',
  '霧',
  '潮',
  '銀',
  '黑',
  '紅',
  '碧',
  '晨',
  '暮',
  '雷',
  '鷹',
  '狼',
  '鹿',
  '鴉',
  '琥',
  '燈',
  '古',
];
const WORD_TAIL = [
  '嶺',
  '谷',
  '原',
  '灣',
  '關',
  '渡',
  '坡',
  '林',
  '陵',
  '泉',
  '岬',
  '丘',
  '湖',
  '川',
  '石',
  '橋',
  '門',
  '野',
];
const CLIMATE_HEAD = {
  snow: ['雪', '霜', '冰', '凜'],
  desert: ['沙', '砂', '赤', '炎'],
  wet: ['葦', '沼', '霧', '蘆'],
} as const;

/** 種類 → 接在名字後面的稱呼（capital 是放在前面） */
const ROLES: Record<string, readonly string[]> = {
  capital: ['王都', '皇都', '聖都', '舊都'],
  city: ['市', '都', '自由市', '商都'],
  town: ['鎮', '集', '驛', '鎮'],
  village: ['村', '莊', '屯', '寨'],
  port: ['港', '津', '灣港', '埠'],
  castle: ['城', '堡', '宮', '城'],
  fort: ['要塞', '砦', '關', '哨堡'],
  tower: ['塔', '觀星塔', '鐘塔', '魔導塔'],
  inn: ['驛站', '旅店', '客棧'],
  bridge: ['橋', '大橋', '古橋'],
  ruins: ['遺跡', '廢城', '古墓', '石柱群'],
  cave: ['洞窟', '岩窟', '鐘乳洞'],
  temple: ['神殿', '聖堂', '祠', '修道院'],
  dungeon: ['迷宮', '地下墓穴', '深淵', '坑道'],
  camp: ['營地', '野營地', '前哨'],
  grave: ['墓地', '墓園', '靈園'],
  mine: ['礦坑', '礦山', '採石場'],
  beacon: ['燈塔', '烽火台'],
  mountain: ['峰', '山', '岳'],
  range: ['山脈', '連峰', '嶺'],
  volcano: ['火山', '炎山'],
  hill: ['丘', '坡', '台地'],
  forest: ['森林', '樹海', '林'],
  pine: ['森林', '針葉林', '林'],
  cactus: ['綠洲', '荒漠'],
  marsh: ['沼澤', '濕原'],
  ship: ['號', '號', '丸'],
  region: ['王國', '公國', '聯邦', '帝國', '自治領', '共和國', '侯國'],
  river: ['河', '江', '溪', '川'],
  road: ['大道', '商道', '古道', '驛道'],
  sea: ['航線', '海路'],
  border: ['邊界', '國境線'],
  wall: ['長城', '城牆', '防壁'],
  place: ['海', '灣', '平原', '荒野', '高原', '海峽', '群島', '半島', '山脈'],
};

/** 會依氣候換字的種類（有人住的地方） */
const CLIMATE_KINDS = new Set([
  'capital',
  'city',
  'town',
  'village',
  'castle',
  'fort',
  'tower',
  'port',
]);

export type NameKind = string;

function stem(r: Random, climateHead: readonly string[] | null): string {
  if (climateHead) return r.pick(climateHead) + r.pick(WORD_TAIL);
  if (r.next() < 0.5) return r.pick(WORD_HEAD) + r.pick(WORD_TAIL);
  return r.pick(SOUND_HEAD) + (r.next() < 0.45 ? r.pick(SOUND_MID) : '') + r.pick(SOUND_TAIL);
}

/** 主要的氣候（超過一半才算） */
export function dominantClimate(c: Climate | null | undefined): keyof typeof CLIMATE_HEAD | null {
  if (!c) return null;
  if (c.snow > 0.5) return 'snow';
  if (c.desert > 0.5) return 'desert';
  if (c.wet > 0.5) return 'wet';
  return null;
}

export function suggestName(kind: NameKind, seed: number, climate?: Climate | null): string {
  const r = createRandom(seed >>> 0 || 1);
  const c = CLIMATE_KINDS.has(kind) ? dominantClimate(climate) : null;
  const base = stem(r, c ? CLIMATE_HEAD[c] : null);
  const roles = ROLES[kind];
  if (!roles) return base;
  const role = r.pick(roles);
  if (kind === 'capital') return role + base;
  return base + role;
}

/** 名字欄的骰子：國用 region、路線用種類、地名・備註用 place */
export function nameKindFor(sel: {
  kind: string;
  objectKind?: string;
  pathKind?: string;
}): NameKind {
  if (sel.kind === 'region') return 'region';
  if (sel.kind === 'object') return sel.objectKind ?? 'town';
  if (sel.kind === 'path') return sel.pathKind ?? 'road';
  return 'place';
}
