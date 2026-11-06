/**
 * 地名的前半與後半：原作 mshea/lazy_gm_tools 的 `generators/location_names`（程式與內容都是 CC0 1.0，見工具目錄的 UPSTREAM_LICENSE）。
 * 英文照原作；中文是本站依字義譯的組字（人名、姓氏類的前半用音譯）。原作的「Three」重複一次（出現的機會 2 倍），照留。
 *
 * 每一列：[英文, 中文]。
 */
export type NamePartRow = readonly [en: string, zh: string];

// biome-ignore format: 一筆一行
export const NAME_PREFIXES: readonly NamePartRow[] = [
  ['Apple', '蘋果'], ['Arrows', '箭'], ['Ashen', '灰燼'], ['Avery', '艾佛利'], ['Bald', '禿'],
  ['Bell', '鐘'], ['Bent', '彎'], ['Bowers', '鮑爾斯'], ['Broken', '斷'], ['Bush', '灌木'],
  ['Cart', '車'], ['Crooked', '曲'], ['Crows', '鴉'], ['Dragon', '龍'], ['Fallon', '法倫'],
  ['Ham', '漢姆'], ['Hanleys', '漢利'], ['Kings', '王'], ['Knight', '騎士'], ['Lark', '雲雀'],
  ['Leaning', '斜'], ['Lone', '孤'], ['Lyn', '林恩'], ['Martins', '馬丁'], ['Middle', '中'],
  ['Mill', '磨坊'], ['Narrow', '窄'], ['Oak', '橡'], ['Ox', '牛'], ['Parleys', '帕利'],
  ['Pigs', '豬'], ['Pony', '小馬'], ['Princes', '王子'], ['Queens', '后'], ['Rams', '公羊'],
  ['Rock', '岩'], ['Round', '圓'], ['Shepherds', '牧羊人'], ['Shocklys', '修克利'], ['Sleepy', '睡'],
  ['Stock', '斯托克'], ['Stockmans', '斯托克曼'], ['Stones', '石'], ['Swallow', '燕'], ['Three', '三'],
  ['Three', '三'], ['Twin', '雙子'], ['Two', '二'], ['Vine', '藤'], ['Wagon', '馬車'],
  ['Witch', '女巫'],
];

// biome-ignore format: 一筆一行
export const NAME_SUFFIXES: readonly NamePartRow[] = [
  ['abby', '修道院'], ['acres', '田'], ['bridge', '橋'], ['burg', '堡'], ['burrough', '鎮'],
  ['canyon', '峽谷'], ['cart', '車站'], ['colony', '屯墾地'], ['corner', '角'], ['corners', '路口'],
  ['creek', '溪'], ['cross', '十字'], ['crossing', '渡口'], ['crown', '冠'], ['dale', '谷'],
  ['dale', '谷'], ['dales', '谷地'], ['fast', '寨'], ['ferry', '渡'], ['flight', '階'],
  ['ford', '淺灘'], ['forks', '岔口'], ['green', '綠地'], ['hallow', '聖地'], ['head', '岬'],
  ['hold', '堡'], ['lake', '湖'], ['landing', '埠'], ['manor', '莊園'], ['meadow', '草原'],
  ['moore', '荒原'], ['pass', '隘口'], ['path', '道'], ['peaks', '峰'], ['plain', '平原'],
  ['point', '角'], ['pond', '塘'], ['ridge', '嶺'], ['river', '河'], ['rivers', '川'],
  ['shire', '郡'], ['station', '驛'], ['sted', '鄉'], ['stream', '溪'], ['throw', '擲'],
  ['ton', '屯'], ['top', '頂'], ['towers', '塔'], ['town', '鎮'], ['tree', '樹'],
  ['vale', '谷'], ['ville', '村'], ['weald', '林野'], ['wild', '荒野'], ['wold', '丘原'],
];
