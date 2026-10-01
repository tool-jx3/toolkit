/**
 * ccfolia/：CCFOLIA 與 OBS 相關的外部資料格式（P0 只有空殼與型別）。
 *
 * CCFOLIA 改版時集中修改這裡。欄位依公開的格式整理，G4／G5 的規格確認後再補齊與加上解析／驗證函式。
 * 外部資料格式屬於事實規格（PROCESS.md 第 2 節），可以完整描述。
 */

/** 角色的狀態列（HP、MP…） */
export interface CcfoliaStatus {
  label: string;
  value: number;
  max: number;
}

/** 角色的能力值（STR、DEX…） */
export interface CcfoliaParam {
  label: string;
  value: string;
}

/** 貼到 CCFOLIA 的角色資料（剪貼簿 JSON 的 data 部分）。待 G5 規格確認。 */
export interface CcfoliaCharacterData {
  name: string;
  initiative?: number;
  externalUrl?: string;
  iconUrl?: string | null;
  memo?: string;
  commands?: string;
  status?: CcfoliaStatus[];
  params?: CcfoliaParam[];
  color?: string;
  secret?: boolean;
  invisible?: boolean;
  hideStatus?: boolean;
  [key: string]: unknown;
}

/** 剪貼簿格式：{ kind: 'character', data: {...} } */
export interface CcfoliaCharacterClipboard {
  kind: 'character';
  data: CcfoliaCharacterData;
}

/** 建立剪貼簿 JSON 字串（空殼：G5 實作時補上欄位預設值與驗證） */
export function toCharacterClipboard(data: CcfoliaCharacterData): string {
  const payload: CcfoliaCharacterClipboard = { kind: 'character', data };
  return JSON.stringify(payload);
}

/** 房間 ZIP 內的檔案（空殼：G5 實作 room-zip 時定義完整結構） */
export interface CcfoliaRoomZipEntry {
  path: string;
  data: Uint8Array | string;
}

/** OBS／Discord 疊加用的 DOM 選擇器（空殼：G4 實作時填入並集中維護） */
export const OBS_SELECTORS: Readonly<Record<string, string>> = Object.freeze({});
