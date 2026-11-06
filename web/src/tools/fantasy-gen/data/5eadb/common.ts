/**
 * 地點、地標、遺物、獨特武器與護甲共用的詞（5e Artisanal Database 的 `css_js/common_generator_data.js`，Michael E. Shea／SlyFlourish.com；
 * CC BY 4.0，署名與本站做的變更見同資料夾的 LICENSE.txt）。中文是本站的翻譯，有修改。
 *
 * 每一列：[原文, 中文]。中文的語序是「狀態＋來源＋東西」（「鬧鬼的矮人地窖」），所以狀態譯成帶「的」的形容，來源譯成不帶「的」的名詞。
 */
export type WordRow = readonly [en: string, zh: string];

/** 狀態（condition） */
// biome-ignore format: 一筆一行
export const CONDITIONS: readonly WordRow[] = [
  ['aberrant', '異怪的'],
  ['abyssal', '深淵的'],
  ['acidic', '滴著酸液的'],
  ['ancient', '古老的'],
  ['astral', '星界的'],
  ['bladed', '布滿刀刃的'],
  ['bloody', '血跡斑斑的'],
  ['buried', '被掩埋的'],
  ['cracked', '龜裂的'],
  ['crumbling', '搖搖欲墜的'],
  ['crystalline', '水晶般的'],
  ['cursed', '受詛咒的'],
  ['cyclopean', '巨石砌成的'],
  ['defiled', '被褻瀆的'],
  ['dreamscape', '夢境般的'],
  ['earthen', '泥土築成的'],
  ['eldritch', '詭祕的'],
  ['emerald', '祖母綠的'],
  ['entombed', '被封存的'],
  ['ethereal', '虛幻的'],
  ['flaming', '燃燒著的'],
  ['floating', '浮在空中的'],
  ['flooded', '淹水的'],
  ['foggy', '霧氣瀰漫的'],
  ['frozen', '冰封的'],
  ['glass', '玻璃做的'],
  ['glowing', '發光的'],
  ['glyphed', '刻滿符文的'],
  ['hallowed', '受祝聖的'],
  ['haunted', '鬧鬼的'],
  ['holy', '神聖的'],
  ['infested', '蟲鼠橫行的'],
  ['lightning-touched', '被雷擊過的'],
  ['moontouched', '沐浴月光的'],
  ['musical', '會發出樂音的'],
  ['necrotic', '死氣沉沉的'],
  ['obsidian', '黑曜石的'],
  ['oozing', '滲著黏液的'],
  ['opal', '蛋白石的'],
  ['poisonous', '有毒的'],
  ['psionic', '充滿靈能的'],
  ['radiant', '光耀的'],
  ['ruby', '紅寶石的'],
  ['ruined', '毀壞的'],
  ['sapphire', '藍寶石的'],
  ['shadowy', '陰影籠罩的'],
  ['spiked', '布滿尖刺的'],
  ['startouched', '受星光眷顧的'],
  ['stormy', '風暴肆虐的'],
  ['temporal', '時間錯亂的'],
  ['titanic', '巨大無比的'],
  ['twilight', '暮光的'],
  ['unearthed', '剛出土的'],
  ['unhallowed', '不潔的'],
  ['unholy', '邪穢的'],
];

/** 來源（species／origin；原作兩個表相同） */
// biome-ignore format: 一筆一行
export const ORIGINS: readonly WordRow[] = [
  ['aberrant', '異怪'],
  ['abyssal', '深淵'],
  ['astral', '星界'],
  ['bestial', '野獸'],
  ['celestial', '天界'],
  ['clockwork', '發條'],
  ['constructed', '構裝'],
  ['cyclopean', '獨眼巨人'],
  ['dark elven', '黑暗精靈'],
  ['divine', '神祇'],
  ['draconic', '龍族'],
  ['dragonborn', '龍裔'],
  ['dwarven', '矮人'],
  ['elemental', '元素'],
  ['elven', '精靈'],
  ['ethereal', '乙太界'],
  ['faerie', '妖精'],
  ['feyish', '精類'],
  ['fiendish', '邪魔'],
  ['fungoid', '蕈類'],
  ['gearforged', '齒輪機關'],
  ['ghoulish', '食屍鬼'],
  ['giant', '巨人'],
  ['gnomish', '侏儒'],
  ['goblinoid', '類哥布林'],
  ['halfling', '半身人'],
  ['human', '人類'],
  ['infernal', '煉獄'],
  ['minotaur', '牛頭人'],
  ['monstrous', '怪物'],
  ['natural', '天然'],
  ['nightmarish', '夢魘'],
  ['ooze-touched', '軟泥'],
  ['orcish', '獸人'],
  ['outerplanar', '外層位面'],
  ['plant-touched', '植物'],
  ['prehistoric', '史前'],
  ['primordial', '太初'],
  ['serpentine', '蛇人'],
  ['shadow-touched', '暗影'],
  ['undead', '不死'],
  ['unholy', '邪穢'],
];

/** 小東西（item） */
// biome-ignore format: 一筆一行
export const ITEMS: readonly WordRow[] = [
  ['amulet', '護身符'], ['arrowhead', '箭頭'], ['badge', '徽章'], ['bell', '鈴鐺'], ['bird skull', '鳥頭骨'],
  ['bone', '骨頭'], ['bottle', '瓶子'], ['bowl', '碗'], ['box', '盒子'], ['bracelet', '手鐲'],
  ['brooch', '胸針'], ['buckle', '帶扣'], ['candle', '蠟燭'], ['clock', '時鐘'], ['coin', '硬幣'],
  ['crown', '王冠'], ['crystal', '水晶'], ['cup', '杯子'], ['dagger', '匕首'], ['die', '骰子'],
  ['disc', '圓盤'], ['doll', '人偶'], ['dreamcatcher', '捕夢網'], ['earring', '耳環'], ['egg', '蛋'],
  ['fan', '扇子'], ['feather', '羽毛'], ['figurine', '小雕像'], ['finger bone', '指骨'], ['flute', '笛子'],
  ['forked rod', '叉杖'], ['game piece', '棋子'], ['gemstone', '寶石'], ['glass eye', '玻璃眼珠'], ['glove', '手套'],
  ['goblet', '高腳杯'], ['hammer', '錘子'], ['holy symbol', '聖徽'], ['icon', '聖像'], ['idol', '神像'],
  ['ink pen', '墨水筆'], ['insignia', '徽記'], ['jar', '罐子'], ['jeweled egg', '鑲寶石的蛋'], ['jewelry box', '珠寶盒'],
  ['key', '鑰匙'], ['knife', '小刀'], ['lamp', '油燈'], ['lantern', '提燈'], ['mask', '面具'],
  ['medallion', '獎章'], ['mirror', '鏡子'], ['monocle', '單片眼鏡'], ['mummified finger', '木乃伊手指'], ['music box', '音樂盒'],
  ['necklace', '項鍊'], ['opal', '蛋白石'], ['orb', '寶珠'], ['pipe', '菸斗'], ['pipes', '排笛'],
  ['portrait', '肖像畫'], ['pouch', '小袋子'], ['quill', '羽毛筆'], ['ring', '戒指'], ['rod', '權杖'],
  ['scale', '鱗片'], ['scrimshaw', '骨雕'], ['scroll', '捲軸'], ['shard', '碎片'], ['skull', '頭骨'],
  ['snuffbox', '鼻菸盒'], ['sphere', '球'], ['spike', '尖釘'], ['statue', '雕像'], ['statuette', '小塑像'],
  ['stone', '石頭'], ['stone disk', '石盤'], ['string of beads', '一串珠子'], ['swordhilt', '劍柄'], ['symbol', '符號'],
  ['talon', '爪子'], ['tiara', '冠冕'], ['tile', '磁磚'], ['tooth', '牙齒'], ['urn', '甕'],
  ['vial', '小瓶'], ['wand', '魔杖'], ['whistle', '哨子'],
];

/** 地點（location） */
// biome-ignore format: 一筆一行
export const LOCATIONS: readonly WordRow[] = [
  ['aerie', '鷹巢'], ['amphitheater', '圓形劇場'], ['arcane laboratory', '秘法實驗室'], ['arena', '競技場'],
  ['armory', '軍械庫'], ['bailey', '城郭'], ['banquet hall', '宴會廳'], ['barracks', '兵營'],
  ['bastille', '監獄堡壘'], ['battlement', '城垛'], ['bestiary', '獸欄'], ['bone bridge', '骨橋'],
  ['bridge', '橋'], ['caravan', '商隊'], ['castle', '城堡'], ['catacomb', '地下墓穴'],
  ['cavern', '洞窟'], ['cemetery', '墓園'], ['chapel', '禮拜堂'], ['cistern', '蓄水池'],
  ['citadel', '城寨'], ['colosseum', '鬥技場'], ['crag', '峭壁'], ['crypt', '地窖'],
  ['den', '獸穴'], ['dungeon', '地城'], ['fane', '神廟'], ['gatehouse', '門樓'],
  ['gorge', '峽谷'], ['grove', '樹林'], ['guardhouse', '哨所'], ['guildhall', '公會大廳'],
  ['harbor', '港口'], ['keep', '要塞'], ['laboratory', '實驗室'], ['lair', '巢穴'],
  ['library', '圖書館'], ['mine', '礦坑'], ['palace', '宮殿'], ['prison', '監獄'],
  ['sanctum', '聖所'], ['shrine', '神龕'], ['stronghold', '據點'], ['temple', '神殿'],
  ['tomb', '陵墓'], ['tower', '高塔'], ['watchtower', '瞭望塔'], ['ziggurat', '金字形神塔'],
];

/** 生物類型（monster_type；SRD 的 14 種生物類型） */
// biome-ignore format: 一筆一行
export const MONSTER_TYPES: readonly WordRow[] = [
  ['aberrations', '異怪'], ['beasts', '野獸'], ['celestials', '天界生物'], ['constructs', '構裝體'],
  ['dragons', '龍'], ['elementals', '元素生物'], ['fey', '精類'], ['fiends', '邪魔'],
  ['giants', '巨人'], ['humanoids', '類人生物'], ['monstrosities', '怪獸'], ['oozes', '泥怪'],
  ['plants', '植物'], ['undead', '不死生物'],
];
