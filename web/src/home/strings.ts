/** 首頁的文字 */
export const S = {
  heading: 'TRPG Toolkit',
  tagline: (n: number) => `跑團用的網頁小工具，共 ${n} 個`,
  intro:
    '所有工具都在你的瀏覽器裡執行，放進去的圖片、文字與檔案不會上傳；部分工具第一次使用時會下載字型或 AI 模型。',
  search: '搜尋工具',
  searchPlaceholder: '搜尋工具（名稱或用途，例如「立繪」「OBS」）',
  found: (n: number) => `找到 ${n} 個工具`,
  notFound: (q: string) => `沒有符合「${q}」的工具`,
  groupNav: '工具分類',
  count: (n: number) => `${n} 個`,
  badge: {
    next: '重寫中',
    legacy: '舊版',
    external: '其他網站',
  },
  badgeTitle: {
    next: '還在重寫，只在開發伺服器列出',
    legacy: '還沒改寫成新版：介面和其他工具不同',
    external: '連到其他網站（在新分頁開啟）',
  },
  newTab: '（在新分頁開啟）',
  inspiration: '靈感來源',
} as const;
