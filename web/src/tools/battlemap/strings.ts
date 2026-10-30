/** 戰鬥地圖產生器的介面文字 */
import type { TerrainId } from './render';
import type { Density, GeneratorId, MazeStyle } from './settings';

export const S = {
  sectionMap: '地圖',
  terrain: '地形',
  terrainHint: '換地形（包含再按一次目前的地形）會產生一張新的地圖。',
  terrains: {
    dungeon: '石砌地城',
    cave: '洞穴',
    crypt: '墓室',
  } satisfies Record<TerrainId, string>,
  grid: '格線',
  gridHint: (px: number) => `每格 ${px} px 的半透明格線（含外框）。開關不會換地圖。`,
  light: '火光',
  lightHint: '每個房間一團暖色光暈（洞窟、迷宮散布在空地上）。開關不會換地圖。',

  /* ---------- 2026-10-30：生成法與參數 ---------- */
  sectionLayout: '格局',
  generator: '生成法',
  generatorHint:
    '地圖的形狀；外觀（顏色、苔蘚）由「地形」決定，兩者可以任意搭配。換生成法或參數時種子不變。',
  generators: {
    rooms: '房間＋走道',
    digger: '挖掘式',
    uniform: '均勻房間',
    rogue: '格狀房間',
    cave: '洞窟',
    maze: '迷宮',
  } satisfies Record<GeneratorId, string>,
  generatorInfo: {
    rooms: '長方形的房間用 L 形走道串成一條（改版前的格局）。',
    digger: '從中央的房間往外一間一間、一段一段地挖，像人挖出來的地城。',
    uniform: '房間平均散布在地圖上，再從牆上開門、用走道接起來。',
    rogue: '地圖切成格子、每格一間房間，相鄰的房間用走道接起來。',
    cave: '細胞自動機長出來的天然洞窟；分開的洞用隧道接起來。',
    maze: '整張是迷宮，所有走道都走得到；牆 1 格。',
  } satisfies Record<GeneratorId, string>,
  density: '房間密度',
  densityHint: '房間的多寡；地圖越大房間越多。',
  densities: { low: '少', normal: '標準', high: '多' } satisfies Record<Density, string>,
  caveFill: '填充率',
  caveFillHint: '一開始是岩石的比例；越高洞越窄、空地越少。',
  caveSmooth: '平滑次數',
  caveSmoothHint: '次數越多洞壁越圓滑；0 次是一開始的亂石。',
  times: '次',
  mazeStyle: '迷宮的樣式',
  mazeStyles: { divided: '分割法', eller: 'Eller 法', icey: '蜿蜒' } satisfies Record<
    MazeStyle,
    string
  >,
  mazeStyleInfo: {
    divided: '一再用牆把區域切成四塊；牆長而直，像建築物。',
    eller: '一列一列往下做；橫向的長走道比較多。',
    icey: '一路往沒挖過的方向挖；彎來彎去、死路多。',
  } satisfies Record<MazeStyle, string>,
  mazeWidth: '走道寬度',
  mazeWidthHint: '牆一律 1 格；1 格寬的走道上棋子錯不開。',
  cellsUnit: '格',

  /* ---------- 2026-10-30：尺寸 ---------- */
  sectionSize: '尺寸',
  cols: '欄數',
  rows: '列數',
  sizeHint: (max: number) => `10～${max} 格；整張圖每邊最多 4096 px。`,
  cellPx: '每格 px',
  cellPxHint: 'VTT 上一格的像素（常用 50／70／100）。只改解析度，格局不變。',
  cellPxOption: (px: number) => `${px} px`,
  resetLayout: '重設格局與尺寸',
  clamped: (px: number, max: number, cols: number, rows: number) =>
    `每格 ${px} px 時每邊最多 ${max} 格，已改成 ${cols} × ${rows} 格。`,
  rendering: (cols: number, rows: number) => `正在產生 ${cols} × ${rows} 格的地圖…`,
  renderFailed: (message: string) => `這個瀏覽器畫不出這麼大的地圖：${message}`,

  regenerate: '重新產生',
  exportPng: '匯出 PNG',
  shortcutGroup: '地圖',
  previewLabel: '戰鬥地圖預覽',
  infoLabel: '地圖資訊',
  infoSeed: '種子',
  infoGenerator: '生成法',
  infoRooms: '房間',
  infoTerrain: '地形',
  infoSize: '尺寸',
  roomsUnit: (n: number) => `${n} 間`,
  noRooms: '—',
  sizeCells: (cols: number, rows: number) => `${cols} × ${rows} 格`,
  sizeNote: (w: number, h: number, cols: number, rows: number, px: number) =>
    `${w} × ${h} px（${cols} × ${rows} 格，每格 ${px} px）`,
  exporting: '正在產生 PNG…',
  exported: (name: string) => `已匯出 ${name}`,
  exportFailed: (message: string) => `匯出失敗：${message}`,
  usage: [
    '開頁就會產生一張地圖。按「重新產生」或 G 鍵換一張；換地形也會換一張新的。',
    '「生成法」決定地圖的形狀：房間＋走道、挖掘式、均勻房間、格狀房間、洞窟、迷宮，各有自己的參數；「地形」決定外觀，兩者可以任意搭配。換生成法、參數或尺寸時種子不變，可以比較同一個種子的不同設定。',
    '格線與火光可以隨時開關，只會加上或拿掉那一層，地圖本身不變。',
    '「尺寸」可以改欄數、列數（10～60 格）與每格 px（50／70／100）；預設 22 × 16 格、每格 70 px（1540 × 1120 px）。整張圖每邊最多 4096 px；很大的地圖要等一兩秒。',
    '按「匯出 PNG」或 D 鍵下載原尺寸的 PNG，可以直接當 CCFOLIA 等線上桌面的地圖背景（在桌面上把格數設成和地圖一樣）。',
    '檔名包含地形與種子（改了生成法或尺寸時也會寫上），方便日後辨認是哪一張。',
    '生成法、參數與尺寸會記在這個瀏覽器；地形、格線與火光不記，重新整理頁面會回到石砌地城、格線與火光開啟，並產生新的地圖。',
  ],
} as const;
