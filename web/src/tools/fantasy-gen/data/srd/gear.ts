/**
 * 武器、護甲、彈藥的名稱（SRD 5.1、SRD 5.2；CC BY 4.0，出處與署名見同資料夾的 LICENSE.txt）。中文是本站的翻譯。
 * 每一列：[英文, 中文]；顯示成「中文（英文）」。
 */
export type GearRow = readonly [en: string, zh: string];

/** 獨特武器產生器的武器（照原作 weapons 的 32 種：SRD 的簡易與軍用武器，不含吹箭筒、手弩、重弩、長弓、網） */
// biome-ignore format: 一筆一行
export const WEAPONS: readonly GearRow[] = [
  ['Club', '棍棒'],
  ['Dagger', '匕首'],
  ['Greatclub', '巨棒'],
  ['Handaxe', '手斧'],
  ['Javelin', '標槍'],
  ['Light Hammer', '輕錘'],
  ['Mace', '硬頭錘'],
  ['Quarterstaff', '長棍'],
  ['Sickle', '鐮刀'],
  ['Spear', '矛'],
  ['Dart', '飛鏢'],
  ['Light Crossbow', '輕弩'],
  ['Shortbow', '短弓'],
  ['Sling', '投石索'],
  ['Battleaxe', '戰斧'],
  ['Flail', '連枷'],
  ['Glaive', '長柄刀'],
  ['Greataxe', '巨斧'],
  ['Greatsword', '巨劍'],
  ['Halberd', '斧槍'],
  ['Lance', '騎槍'],
  ['Longsword', '長劍'],
  ['Maul', '巨錘'],
  ['Morningstar', '釘頭錘'],
  ['Pike', '長矛'],
  ['Rapier', '細劍'],
  ['Scimitar', '彎刀'],
  ['Shortsword', '短劍'],
  ['Trident', '三叉戟'],
  ['Warhammer', '戰錘'],
  ['War Pick', '戰鎬'],
  ['Whip', '鞭'],
];

/** 寶藏產生器用的武器（加上吹箭筒、手弩、重弩、長弓；權重照原作的寶藏表：常見的武器 2 倍） */
// biome-ignore format: 一筆一行
export const TREASURE_WEAPONS: readonly (readonly [en: string, zh: string, weight: number])[] = [
  ['Club', '棍棒', 1], ['Dagger', '匕首', 2], ['Greatclub', '巨棒', 1], ['Handaxe', '手斧', 1],
  ['Javelin', '標槍', 1], ['Light Hammer', '輕錘', 1], ['Mace', '硬頭錘', 1], ['Quarterstaff', '長棍', 1],
  ['Sickle', '鐮刀', 1], ['Spear', '矛', 1], ['Light Crossbow', '輕弩', 1], ['Dart', '飛鏢', 1],
  ['Shortbow', '短弓', 2], ['Sling', '投石索', 1], ['Battleaxe', '戰斧', 1], ['Flail', '連枷', 1],
  ['Glaive', '長柄刀', 1], ['Greataxe', '巨斧', 2], ['Greatsword', '巨劍', 2], ['Halberd', '斧槍', 1],
  ['Lance', '騎槍', 1], ['Longsword', '長劍', 2], ['Maul', '巨錘', 1], ['Morningstar', '釘頭錘', 1],
  ['Pike', '長矛', 1], ['Rapier', '細劍', 2], ['Scimitar', '彎刀', 2], ['Shortsword', '短劍', 2],
  ['Trident', '三叉戟', 1], ['War Pick', '戰鎬', 1], ['Warhammer', '戰錘', 1], ['Whip', '鞭', 1],
  ['Blowgun', '吹箭筒', 1], ['Hand Crossbow', '手弩', 1], ['Heavy Crossbow', '重弩', 1], ['Longbow', '長弓', 2],
];

/** 獨特護甲產生器的護甲（照原作 armor 的 13 種：長袍＋SRD 的 12 種護甲） */
// biome-ignore format: 一筆一行
export const ARMORS: readonly GearRow[] = [
  ['Robe', '長袍'],
  ['Padded Armor', '棉甲'],
  ['Leather Armor', '皮甲'],
  ['Studded Leather Armor', '鑲釘皮甲'],
  ['Hide Armor', '獸皮甲'],
  ['Chain Shirt', '鏈甲衫'],
  ['Scale Mail', '鱗甲'],
  ['Breastplate', '胸甲'],
  ['Half Plate Armor', '半身板甲'],
  ['Ring Mail', '環甲'],
  ['Chain Mail', '鏈甲'],
  ['Splint Armor', '板條甲'],
  ['Plate Armor', '全身板甲'],
];

/** 寶藏產生器用的護甲（SRD 的 12 種；不含長袍） */
export const TREASURE_ARMORS: readonly GearRow[] = ARMORS.slice(1);

/** 彈藥（權重照原作：箭 4、弩矢 2、彈丸與飛鏢各 1） */
// biome-ignore format: 一筆一行
export const AMMUNITION: readonly (readonly [en: string, zh: string, weight: number])[] = [
  ['Arrows', '箭矢', 4],
  ['Bolts', '弩矢', 2],
  ['Sling Bullets', '投石索彈丸', 1],
  ['Darts', '飛鏢', 1],
];
