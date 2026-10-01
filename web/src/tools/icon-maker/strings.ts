/** 簡易頭像產生器的介面文字 */
import type { BackgroundKind, FontId, FrameKind, HoStyle, ItemId, Orientation } from './logic';

export const S = {
  /* 角色圖 */
  sectionImage: '角色圖',
  dropAreaLabel: '角色圖載入區',
  dropLabel: '把角色圖拖到這裡',
  dropHint: 'PNG、JPEG、WebP；背景透明的 PNG 效果最好',
  chooseImage: '選擇圖片',
  changeImage: '更換圖片',
  loadedPrefix: '已載入：',
  loadedHint: '把另一張圖拖到這裡也可以更換',
  decodeError: (name: string) => `無法讀取「${name}」，檔案可能已損壞。`,
  privacy: '圖片只在你的瀏覽器裡處理，不會上傳到任何地方。',

  /* 外框與背景 */
  sectionFrame: '外框與背景',
  frameKind: '外框',
  frameKinds: { solid: '單色', gradient: '漸層' } satisfies Record<FrameKind, string>,
  preset: '配色',
  presetHint: '每組配色都包含外框的單色、漸層三色與背景色。',
  background: '背景',
  backgrounds: {
    solid: '單色',
    gradient: '漸層',
    transparent: '透明',
    dots: '圓點',
    stripes: '斜線',
    checker: '格紋',
  } satisfies Record<BackgroundKind, string>,
  backgroundHint: '選「透明」時，下載的 PNG 內側也是透明的（預覽以棋盤格表示）。',
  frameWidth: '外框粗細',
  frameWidthHint: (px: number) => `下載的圖（1024 px）上約 ${px} px。`,

  /* 名字牌 */
  sectionName: '名字牌',
  name: '名字',
  namePlaceholder: '角色的名字',
  font: '字型',
  fonts: { serif: '明體', sans: '黑體', rounded: '圓體', mono: '等寬' } satisfies Record<
    FontId,
    string
  >,
  fontHint: '「等寬」是英數字型，適合英文名字；中文字會以黑體顯示。',
  orientation: '排列',
  orientations: { vertical: '直排', horizontal: '橫排' } satisfies Record<Orientation, string>,
  orientationHint: '橫排時名字牌會換成下方的橫長條，切回直排就回到原本的直條。',

  /* HO 牌 */
  sectionHo: 'HO 牌',
  hoText: 'HO 文字',
  hoHint: '這一欄可以填任何字，例如 PC 編號（PC2）、職業（偵探）或陣營。',
  hoStyle: '樣式',
  hoStyles: { dark: '深色', light: '白色', red: '紅色' } satisfies Record<HoStyle, string>,

  /* 預覽 */
  previewLabel: '頭像預覽',
  editorLabel: '頭像版面',
  items: { image: '圖片', name: '名字牌', ho: 'HO 牌' } satisfies Record<ItemId, string>,
  zoomOut: '圖片縮小',
  zoomIn: '圖片放大',
  scaleLabel: (pct: string) => `圖片 ${pct}`,
  resetLayout: '重設版面',
  resetLayoutHint: '位置與大小回到預設，不會改配色、文字或換掉圖片',
  download: '下載 PNG',
  copy: '複製圖片',
  copied: '已複製圖片',
  copiedHint: '可以直接貼到聊天軟體或 CCFOLIA。',
  copyFailed: '無法複製圖片',
  copyFailedHint: '這個瀏覽器不允許把圖片放進剪貼簿，請改用「下載 PNG」。',
  downloadFailed: '無法產生圖片',
  fileName: 'character-icon.png',

  /* 目前設定 */
  summaryTitle: '目前設定',
  summary: {
    preset: '配色',
    frameKind: '外框',
    background: '背景',
    frameWidth: '外框粗細',
    imageScale: '圖片倍率',
    name: '名字',
    ho: 'HO',
    selected: '選取',
  },
  px: (v: number) => `${v} px`,
  empty: '（空白）',
  noSelection: '（沒有）',

  /* 說明與快捷鍵 */
  shortcutGroup: '版面',
  shortcutNudge: '移動選取的物件 0.2%（約 1 px；同時按住 Ctrl 也一樣）',
  shortcutNudgeBig: '移動選取的物件 2%（同時按住 Ctrl 也一樣）',
  shortcutDeselect: '取消選取',
  shortcutEscape: '關閉說明、隱藏參考線',
  usageIntro:
    '做一張 1024 × 1024 的正方形角色頭像：角色圖放進圓角外框，再加上名字牌與 HO 牌。預覽看到的就是下載的圖。',
  usageSteps: [
    '在「角色圖」把圖片拖進來，或按「選擇圖片」。背景透明的 PNG 最好用；JPEG 會連同自己的底色一起放進去。',
    '在預覽上按一下圖片、名字牌或 HO 牌就會選取，按住拖曳可以移動。',
    '選取名字牌或 HO 牌時，右下角會出現圓形控點，拖曳它可以改變牌子的大小（字的大小固定；放不下時名字會自動縮小、HO 會壓扁）。圖片用預覽下方的放大、縮小按鈕調整（每次 8%）。',
    '拖曳時會出現紅色點線：中央的十字是頭像的中心，另外標出物件的四個邊，以及與左右、上下兩邊的距離（%）。',
    '選好外框、配色、背景與文字後，按「下載 PNG」或「複製圖片」。',
  ],
  usageNotesTitle: '小提醒',
  usageNotes: [
    '方向鍵每次移動選取的物件 0.2%（約 1 px），按住 Shift 一次 2%（同時按住 Ctrl 也一樣）；Delete 或 Backspace 取消選取。',
    '預覽上灰色的虛線是安全範圍，重要的部分（臉、名字）放在裡面，被裁成圓形顯示時也不容易被切掉。',
    '「重設版面」只會把位置、大小與圖片倍率放回預設，不會改配色、文字，也不會換掉圖片。',
    '下載的 PNG 四個角是透明的；背景選「透明」時，外框內側也是透明的。',
    '這個工具不保存任何東西：重新整理頁面就回到預設。',
  ],
} as const;
