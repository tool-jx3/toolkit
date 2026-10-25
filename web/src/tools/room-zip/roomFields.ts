/**
 * 讀入房間 ZIP 時、匯出時：CCFOLIA 物件上由本工具管理的欄位（規格 3.7.2）。
 * 讀入時這些欄位轉成工具自己的資料，其餘欄位原樣記在 `extra`；匯出時工具資料決定這些欄位，`extra` 的欄位照原樣寫回。
 * `order`（順序）不在這裡：讀入時記在 `extra`，匯出時另外依相對順序決定（`assignOrders`，3.7.2）。
 */
export const OWNED = {
  /** 共用標記、場景的面板 */
  marker: ['x', 'y', 'z', 'width', 'height', 'text', 'imageUrl'],
  /** 螢幕面板 */
  item: ['x', 'y', 'z', 'width', 'height', 'memo', 'imageUrl'],
  scene: [
    'name',
    'backgroundUrl',
    'foregroundUrl',
    'fieldObjectFit',
    'fieldWidth',
    'fieldHeight',
    'displayGrid',
    'markers',
    'text',
  ],
  /** 房間設定（`sceneId` 讀入時留在 extra，匯出時還要確認那個場景還在） */
  room: [
    'backgroundUrl',
    'foregroundUrl',
    'fieldWidth',
    'fieldHeight',
    'markers',
    'hidden3dDice',
    'enableCrossfade',
  ],
  /** 角色（`status` 讀入時留在 extra，匯出時和 HP、MP 欄合併） */
  piece: ['name', 'memo', 'iconUrl', 'faces', 'commands'],
  cutin: ['name', 'imageUrl'],
  face: ['label', 'iconUrl'],
  /** 劇本文字 */
  note: ['name', 'text'],
} as const;

/** 有自己的分類、整類原樣保留的 entities 類別（3.7.8；劇本文字 `notes` 成為「劇本文字」頁的內容，不在這裡） */
export const KEEP_KINDS = ['decks', 'savedatas', 'snapshots'] as const;

/** 網址（不是 ZIP 裡的檔案） */
export const EXTERNAL_RE = /^(https?:|data:|blob:)/i;
export const isExternalUrl = (v: string): boolean => EXTERNAL_RE.test(v);

/** 放圖片的欄位（沒有欄位名稱＝工具自己讀的圖片欄位）；externalUrl、embedUrl 這類連結不算 */
export const isImageKey = (key: string): boolean =>
  !key || /(image|icon|background|foreground|cover|thumbnail|avatar|picture)Url$/i.test(key);
