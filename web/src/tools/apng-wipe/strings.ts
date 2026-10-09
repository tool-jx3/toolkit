/** 輕量轉場 APNG 產生器的介面文字 */
import type { PlayCount, SizeKind, WipeDirection, WipeMode } from './wipe';

export const S = {
  sectionSize: '尺寸',
  sizeKind: '尺寸類型',
  sizeKinds: {
    square: '方形 15 × 15',
    portrait: '縱長 15 × 30',
    landscape: '橫長 30 × 15',
    free: '自訂',
  } satisfies Record<SizeKind, string>,
  sizeHint: '寬 × 高（px）。轉場圖使用時會拉伸成整個畫面，原圖越小檔案越小、邊緣越柔和。',
  width: '寬',
  height: '高',
  customHint: '1～1200 的整數（px）。',

  sectionTransition: '轉場',
  mode: '轉場方式',
  modes: { normal: '整片淡變', wipe: '方向擦除' } satisfies Record<WipeMode, string>,
  modeHint: '淡變只改透明度；擦除會從一側一路推到另一側。',
  angle: '擦除角度',
  angleDirections: ['往右', '往右下', '往下', '往左下', '往左', '往左上', '往上', '往右上'],
  angleText: (deg: number, dir: string) => `${deg}°（${dir}）`,
  duration: '時長',
  seconds: (s: number) => `${s.toFixed(1)} 秒`,
  direction: '變化方向',
  directions: { cover: '蓋上', reveal: '揭開' } satisfies Record<WipeDirection, string>,
  directionHint: '蓋上：由透明變成顏色；揭開：由顏色變回透明。',
  plays: '播放次數',
  playCounts: { once: '單次', loop: '無限循環' } satisfies Record<PlayCount, string>,

  sectionColor: '顏色',
  colorPanel: '顏色面板',
  colorPanelHint: '橫向是彩度、直向是明度；下方滑桿調色相。',
  hex: '色碼',
  hexHint: '輸入 # 加 6 位 16 進位（例如 #28212f），按 Enter 或離開欄位後套用。',
  swatch: (hex: string) => `目前的顏色 ${hex}`,

  previewLabel: '轉場預覽',
  previewBackground: '預覽背景',
  backgrounds: { light: '白', dark: '黑' },
  replay: '從頭播放',
  sizeText: (w: number, h: number) => `實際尺寸 ${w} × ${h} px`,
  scaleText: (label: string) => `預覽放大 ${label} 倍`,
  shrunkText: '預覽已縮小（長邊顯示為 180 px）',

  exportApng: '匯出 APNG',
  exporting: '正在產生 APNG…',
  exported: (name: string, frames: number, kb: string) => `已匯出 ${name}：${frames} 格、${kb}`,
  sizeError: '無法匯出：自訂的寬與高都必須是 1～1200 的整數。',
  exportFailed: (message: string) => `匯出失敗：${message}`,

  usage: [
    '選尺寸、轉場方式、時長與顏色，右邊的預覽會立刻從頭播放；按「從頭播放」可以再看一次。',
    '「整片淡變」讓整張圖一起變透明或變成顏色；「方向擦除」從選定角度的起點一側擦到另一側（0° 從左邊往右擦）。',
    '「蓋上」是由透明變成顏色（場景結束），「揭開」是由顏色變回透明（場景開始）。',
    '按「匯出 APNG」下載 .png 檔（APNG 動畫，透明背景），完成後會顯示影格數與檔案大小。',
    '圖片很小是刻意的：拿去當轉場時把它拉伸成整個畫面，邊緣會自然變成柔和的漸層，檔案只有幾 KB。',
    '設定不會儲存；重新整理頁面會回到預設值。',
  ],
} as const;
