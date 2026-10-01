/**
 * 工具清單（單一來源）。
 *
 * - 建置設定（vite.config.ts）依 `status` 決定輸出位置：`next` → `next/<id>/`、`live` → `tools/<id>/`。
 * - ToolShell 的標題、群組分頁與靈感來源頁尾也從這裡讀。
 * - 之後首頁卡片也會改從這裡產生。
 *
 * 這個檔案同時被 Node（建置設定）與瀏覽器載入，不可以 import 任何只在瀏覽器存在的東西。
 */

export type ToolStatus = 'next' | 'live';

export type GroupId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'dev';

export interface Inspiration {
  /** 顯示在頁尾「靈感來源：」後面的名稱 */
  name: string;
  /** 連結（原作網址） */
  url: string;
}

export interface ToolEntry {
  /** 網址用的 id，與目錄名稱相同（`web/src/tools/<id>/`） */
  id: string;
  /** 工具名稱（標題、群組分頁） */
  name: string;
  /** 一句話說明（首頁卡片、頁首） */
  summary: string;
  group: GroupId;
  status: ToolStatus;
  /** 原創工具不填 */
  inspiration?: Inspiration;
}

export const GROUPS: Record<GroupId, { name: string }> = {
  G1: { name: '文字演出' },
  G2: { name: '轉場與動態' },
  G3: { name: '立繪工作台' },
  G4: { name: 'OBS 疊加' },
  G5: { name: 'CCFOLIA 資料' },
  G6: { name: '劇本與紀錄' },
  G7: { name: '介紹圖與宣傳' },
  G8: { name: '影像與動圖' },
  G9: { name: '綜合' },
  dev: { name: '開發用' },
};

export const TOOLS: readonly ToolEntry[] = [
  {
    id: '_gallery',
    name: '元件展示',
    summary: '新框架的共用元件、核心模組與示範動畫，給實作者參考。',
    group: 'dev',
    status: 'next',
  },
  {
    id: 'text-fx',
    name: '文字演出產生器',
    summary:
      '把文字做成有登場、停留、退場動畫的透明素材（標語、長文、字幕），匯出 APNG、GIF、WebP、PNG。',
    group: 'G1',
    status: 'next',
  },
];

export function getTool(id: string): ToolEntry | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolsInGroup(group: GroupId): ToolEntry[] {
  return TOOLS.filter((t) => t.group === group);
}

/** 工具建置後所在的目錄（相對於 repo 根目錄） */
export function outputDir(tool: Pick<ToolEntry, 'id' | 'status'>): string {
  return tool.status === 'live' ? `tools/${tool.id}` : `next/${tool.id}`;
}

/**
 * 從某個工具頁連到另一個工具頁的相對網址。
 * 所有工具頁都在根目錄下兩層（`tools/<id>/`、`next/<id>/`），所以一律先回到根目錄。
 */
export function hrefToTool(target: Pick<ToolEntry, 'id' | 'status'>): string {
  return `../../${outputDir(target)}/`;
}
