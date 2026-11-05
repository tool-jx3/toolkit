/**
 * 配置素材的目錄：32 種（圖形是本站自己畫的，見 draw/assets.ts）。
 */
export type AssetCategory = 'settlement' | 'nature' | 'adventure' | 'symbol';
export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  'settlement',
  'nature',
  'adventure',
  'symbol',
];

export interface AssetDef {
  kind: string;
  name: string;
  category: AssetCategory;
  /** 搜尋用的其他說法 */
  keywords: string;
}

const A = (kind: string, name: string, category: AssetCategory, keywords = ''): AssetDef => ({
  kind,
  name,
  category,
  keywords,
});

export const ASSETS: readonly AssetDef[] = [
  A('capital', '王都・首都', 'settlement', '首府 國都 皇城'),
  A('city', '城市', 'settlement', '都市 大城'),
  A('town', '城鎮', 'settlement', '鎮 町 市集'),
  A('village', '村莊', 'settlement', '村 聚落'),
  A('castle', '城堡', 'settlement', '城 宮殿'),
  A('fort', '要塞', 'settlement', '堡壘 砦 關卡'),
  A('port', '港口', 'settlement', '港 碼頭 棧橋'),
  A('tower', '高塔', 'settlement', '塔 魔法塔'),
  A('inn', '驛站', 'settlement', '旅店 客棧 宿場'),
  A('bridge', '橋', 'settlement', '石橋 渡河'),
  A('mountain', '山', 'nature', '山峰 高山'),
  A('range', '山脈', 'nature', '連峰 群山'),
  A('forest', '森林', 'nature', '樹林 樹'),
  A('pine', '針葉樹', 'nature', '松 杉 樹'),
  A('hill', '丘陵', 'nature', '山丘 坡'),
  A('volcano', '火山', 'nature', '熔岩'),
  A('cactus', '沙漠植物', 'nature', '仙人掌 綠洲'),
  A('marsh', '濕地', 'nature', '沼澤 蘆葦'),
  A('ruins', '遺跡', 'adventure', '廢墟 古蹟'),
  A('cave', '洞窟', 'adventure', '洞穴 岩洞'),
  A('temple', '神殿', 'adventure', '神廟 聖堂 祠'),
  A('dungeon', '地城', 'adventure', '迷宮 地下城'),
  A('camp', '營地', 'adventure', '野營 帳篷'),
  A('grave', '墓地', 'adventure', '墳墓 墓園'),
  A('mine', '礦坑', 'adventure', '礦山 坑道'),
  A('beacon', '燈塔', 'adventure', '燈台 烽火'),
  A('dot', '圓點・據點', 'symbol', '點 圓'),
  A('square', '方塊・區域', 'symbol', '方形 區塊'),
  A('star', '星號・重要地點', 'symbol', '星 重點'),
  A('flag', '旗幟', 'symbol', '旗'),
  A('pin', '圖釘', 'symbol', '標記 地標'),
  A('ship', '帆船', 'symbol', '船'),
];

const BY_KIND = new Map(ASSETS.map((a) => [a.kind, a]));
export const assetDef = (kind: string): AssetDef | undefined => BY_KIND.get(kind);
export const isAssetKind = (kind: unknown): kind is string =>
  typeof kind === 'string' && BY_KIND.has(kind);

/** 不畫接地陰影的素材（平面的記號、浮在水上的、橋、濕地） */
export const NO_SHADOW = new Set([
  'dot',
  'square',
  'star',
  'pin',
  'bridge',
  'port',
  'ship',
  'marsh',
]);

/** 會積雪的素材 */
export const SNOW_ASSETS = new Set([
  'capital',
  'city',
  'town',
  'village',
  'castle',
  'fort',
  'port',
  'tower',
  'inn',
  'bridge',
  'forest',
  'pine',
  'hill',
  'cactus',
  'marsh',
  'ruins',
  'cave',
  'temple',
  'dungeon',
  'camp',
  'grave',
  'mine',
  'beacon',
  'ship',
]);

export function searchAssets(query: string, category: AssetCategory | 'all'): AssetDef[] {
  const q = query.trim().toLowerCase();
  return ASSETS.filter(
    (a) =>
      (category === 'all' || a.category === category) &&
      (!q || `${a.name} ${a.keywords} ${a.kind}`.toLowerCase().includes(q)),
  );
}
