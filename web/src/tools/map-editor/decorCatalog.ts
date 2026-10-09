/**
 * 內建的 56 個裝飾圖章（規格 F120）。圖檔在 `decors/`（沿用舊版收錄的 SVG；出處與授權見 UPSTREAM_LICENSE）。
 * 這個檔案只有清單（純資料，單元測試可以用）；圖檔的網址在 decors.ts。
 */

export type DecorGenre = 'all' | 'user' | 'jp-symbol' | 'icon';

export interface DecorDef {
  id: string;
  /** 介面上的名稱 */
  name: string;
  /** 所屬分類（「全部」不用寫） */
  genres: readonly string[];
  /** 一格的倍率（內建的都是 1） */
  scale: number;
}

/** 分類分頁的順序 */
export const DECOR_GENRES: readonly { id: DecorGenre; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'user', name: '自訂' },
  { id: 'jp-symbol', name: '地圖符號' },
  { id: 'icon', name: '圖示' },
];

const icon = (id: string, name: string, extra: string[] = []): DecorDef => ({
  id,
  name,
  genres: [...extra, 'icon'],
  scale: 1,
});
const jp = (id: string, name: string): DecorDef => ({ id, name, genres: ['jp-symbol'], scale: 1 });

export const DECORS: readonly DecorDef[] = [
  /* game-icons.net（Delapouite、Lorc，CC BY 3.0） */
  icon('door-simple', '門', ['door']),
  icon('door-arched', '拱門', ['door']),
  icon('double-door', '雙開門', ['door']),
  icon('bed', '床', ['furniture']),
  icon('desk', '書桌', ['furniture']),
  icon('bookshelf', '書架', ['furniture']),
  icon('chest', '寶箱', ['furniture']),
  icon('barrel', '木桶', ['furniture']),
  icon('fireplace', '壁爐'),
  icon('stairs', '樓梯'),
  icon('escalator', '手扶梯'),
  icon('ladder', '梯子'),
  icon('campfire', '營火', ['light']),
  icon('tree-pine', '樹', ['nature']),
  icon('wood-pile', '柴堆', ['nature']),
  icon('wood-cabin', '小屋', ['misc']),
  /* 日本的地圖符號（openstreetmap/map-icons，公有領域性質） */
  jp('jp-school', '學校'),
  jp('jp-university', '大學'),
  jp('jp-hospital', '醫院'),
  jp('jp-shrine', '神社'),
  jp('jp-temple', '寺院'),
  jp('jp-cemetery', '墓地'),
  jp('jp-police', '警察署'),
  jp('jp-koban', '派出所'),
  jp('jp-firebrigade', '消防署'),
  jp('jp-post', '郵局'),
  jp('jp-townhall', '市公所'),
  jp('jp-court', '法院'),
  jp('jp-castle', '城跡'),
  jp('jp-museum', '博物館'),
  jp('jp-library', '圖書館'),
  jp('jp-spa', '溫泉'),
  jp('jp-historical', '史蹟'),
  jp('jp-factory', '工廠'),
  jp('jp-power-plant', '發電廠'),
  jp('jp-lighthouse', '燈塔'),
  jp('jp-high-tower', '電波塔'),
  jp('jp-rice-field', '水田'),
  jp('jp-high-school', '高中'),
  jp('jp-town-office', '鄉鎮公所'),
  jp('jp-met-observatory', '氣象台'),
  jp('jp-sdf', '自衛隊'),
  jp('jp-fishing-port', '漁港'),
  jp('jp-port', '港口'),
  jp('jp-mine', '礦場'),
  jp('jp-quarry', '採石場'),
  jp('jp-field', '旱田'),
  jp('jp-orchard', '果園'),
  jp('jp-tea', '茶園'),
  jp('jp-broadleaf', '闊葉林'),
  jp('jp-conifer', '針葉林'),
  jp('jp-bamboo', '竹林'),
  jp('jp-monument', '紀念碑'),
  jp('jp-chimney', '煙囪'),
  jp('jp-tower', '塔'),
  jp('jp-windmill', '風車'),
];

export const DECOR_IDS: ReadonlySet<string> = new Set(DECORS.map((d) => d.id));

export function findDecor(id: string | null | undefined): DecorDef | undefined {
  return id ? DECORS.find((d) => d.id === id) : undefined;
}
