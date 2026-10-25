/**
 * 房間 ZIP 產生器的資料模型（不依賴 React）：專案、素材、部件、立繪庫、場景、切入、棋子、劇本文字、KP 設定，
 * 以及跨專案的工具設定與範本。規格：docs/refactor/specs/room-zip.md（第 7 節主控裁定優先）。
 *
 * 工具內的座標一律是**物件中心**（格，原點在盤面中央，往右往下為正），位置與大小取整數格（3.2.1）；
 * 輸出時才換成 CCFOLIA 的左上角（`@/ccfolia` 的 centerToTopLeft）。
 * 圖片一律以房間 ZIP 的檔名（內容 SHA-256＋副檔名）識別，素材、部件、場景…都只存這個名稱。
 */
import { type GridRect, gridLength, newRoomEntityId, roundGrid } from '@/ccfolia';

export const TOOL_ID = 'room-zip';
/** 專案檔的資料版本 */
export const PROJECT_VERSION = 1;

/* ---------- 素材 ---------- */

/** 素材的用途標籤（可複選）：前景／立繪／面板／外框／棋子圖示／演出／其他 */
export const TAGS = ['fg', 'tachie', 'panel', 'frame', 'icon', 'effect', 'other'] as const;
export type Tag = (typeof TAGS)[number];

export interface Material {
  /** 房間 ZIP 裡的檔名（`<SHA-256>.<副檔名>`），也是素材的識別 */
  name: string;
  /** 顯示名稱（預設＝原檔名去副檔名） */
  label: string;
  tags: Tag[];
  /** GIF、APNG、動態 WebP */
  animated: boolean;
  /** 放進來時的檔名 */
  originalName: string;
  mime: string;
  /** 原始檔案大小（位元組） */
  before: number;
  /** 處理後大小（位元組） */
  after: number;
  /** 實際像素尺寸（0＝未知） */
  width: number;
  height: number;
}

/* ---------- 讀入的 CCFOLIA 房間資料（F287 起） ---------- */

/** 讀入的 CCFOLIA 物件上、本工具不編輯的欄位（原樣；再匯出時寫回，3.7） */
export type Extra = Record<string, unknown>;

/**
 * 讀入的房間 ZIP 裡、本工具沒有對應功能的資料（原樣；再匯出時寫回，3.7.8）：meta、牌堆、劇本文字、存檔、快照、
 * 無法對應成部件的面板、沒有圖片也沒有文字的場景面板、沒有名稱也沒有圖的切入、本工具不認得的類別。
 */
export interface RoomKeep {
  /** 讀入的 meta（版本等） */
  meta?: Extra;
  /** 類別（items、notes、decks、effects…）→ ID → 內容 */
  entities?: Record<string, Record<string, unknown>>;
  /** 無法對應成共用標記的房間マーカー（沒有圖片）：ID → 內容 */
  roomMarkers?: Record<string, unknown>;
  /** 無法對應的場景マーカー（沒有圖片也沒有文字）：場景 ID → ID → 內容 */
  sceneMarkers?: Record<string, Record<string, unknown>>;
}

/* ---------- 房間設計 ---------- */

export type TachieAlign = 'bottom' | 'top' | 'center' | 'position';

/** 本專案的初始值（空白＝沿用工具設定的共用值） */
export interface ProjectDefaults {
  part: number | null;
  panelW: number | null;
  tachieH: number | null;
  zPart: number | null;
  zPanel: number | null;
  zTachie: number | null;
  zEffect: number | null;
}

/** 房間設計畫布上對位用的暫用立繪（不輸出） */
export interface Placeholder {
  id: string;
  /** 中心 x（格） */
  x: number;
  locked: boolean;
}

export interface RoomDesign {
  fieldWidth: number;
  fieldHeight: number;
  backgroundUrl: string | null;
  foregroundUrl: string | null;
  tachieAlign: TachieAlign;
  /** 基準線（盤面座標的 y，格） */
  tachieBaseline: number;
  /** 立繪預設大小（高，格） */
  tachieHeight: number;
  /** 「指定位置」的水平中心 x */
  tachieX: number;
  defaults: ProjectDefaults;
  /** BGM 交叉淡化（畫面上的開關；輸出時相反，見 crossfadeFlag） */
  bgmCrossfade: boolean;
  /** 舊式骰子（不用 3D 骰子） */
  legacyDice: boolean;
  placeholders: Placeholder[];
  /** 讀入的房間設定裡本工具不編輯的欄位（聊天分頁、BGM、變數…；sceneId 是讀入時套用中的場景） */
  extra?: Extra;
}

/** 共用標記（マーカーパネル）或螢幕面板（スクリーンパネル） */
export type PartKind = 'marker' | 'panel';

export interface Part {
  id: string;
  kind: PartKind;
  name: string;
  imageUrl: string | null;
  /** 中心（格） */
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  /** 畫布上不能拖（不影響輸出） */
  locked: boolean;
  /** 固定長寬比 */
  lockAspect: boolean;
  /** 顯示（關閉時整個房間都看不到、不輸出） */
  visible: boolean;
  /** 盤面文字（共用標記＝マーカーパネルの文字；螢幕面板＝スクリーンパネルの備註） */
  text: string;
  /** 讀入時的 CCFOLIA ID：和別種部件的 ID 撞名而改了內部 ID 時才有（匯出用這個當鍵，3.7.5） */
  key?: string;
  /** 讀入時本工具不編輯的欄位（角度、鎖定、點擊動作、order…），再匯出時寫回 */
  extra?: Extra;
  /** 讀入時的原始左上角與大小：位置、大小都沒改過時，匯出就用它（整數格的中心座標表示不了的位置，3.7.4） */
  origin?: GridRect;
}

/** 讀入的螢幕面板在 CCFOLIA 裡不顯示（`visible` 或 `active` 是 false）：預覽裡標出來，匯出照原樣寫回（R11） */
export const hiddenInCcfolia = (p: Pick<Part, 'kind' | 'extra'>): boolean =>
  p.kind === 'panel' && (p.extra?.visible === false || p.extra?.active === false);

/* ---------- 立繪庫 ---------- */

export interface TachieEntry {
  id: string;
  /** 角色名稱 */
  character: string;
  /** 表情名稱 */
  expression: string;
  imageUrl: string | null;
  /** 高（格） */
  height: number;
  /** 腳底抬升（格） */
  dy: number;
  /** 堆疊順序（null＝用專案的立繪初始值） */
  z: number | null;
  /** 表情差分的主立繪 */
  baseId: string | null;
  /** 差分單獨設定（不沿用主立繪的高度、抬升、堆疊順序） */
  solo: boolean;
}

/* ---------- 場景 ---------- */

export type BackgroundMode = 'room' | 'foreground' | 'image' | 'none';
/** 全畫面演出的填滿方式：蓋滿／拉伸／完整放入（舊資料） */
export type FullFit = 'cover' | 'stretch' | 'contain';

/** 場景的マーカーパネル：登場的立繪或演出 */
export interface SceneMarker {
  id: string;
  /** tachie＝登場立繪；full＝全畫面演出；free＝調整大小的演出 */
  kind: 'tachie' | 'full' | 'free';
  /** 立繪庫的 id（kind 為 tachie 時） */
  refId: string | null;
  name: string;
  imageUrl: string | null;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  fullFit: FullFit;
  lockAspect: boolean;
  /** 立繪的垂直位置上次計算時的條件（高度、抬升、基準線、對齊方式）；條件變了就重算垂直位置（D5） */
  ySig?: string;
  /** 本場景的預覽裡不能拖（不輸出） */
  locked?: boolean;
  /** 讀入時本工具不編輯的欄位，再匯出時寫回 */
  extra?: Extra;
  /** 讀入時的原始左上角與大小（同 Part.origin） */
  origin?: GridRect;
}

/** 場景對共用標記的差異（沒寫的項目沿用共用值） */
export interface PartOverride {
  /** null＝本場景不放圖 */
  imageUrl?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  /** 本場景隱藏 */
  hidden?: boolean;
  /** 預覽裡不能拖（只影響預覽） */
  locked?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  foregroundUrl: string | null;
  backgroundMode: BackgroundMode;
  /** 背景模式「個別素材」時的圖 */
  backgroundUrl: string | null;
  fieldWidth: number;
  fieldHeight: number;
  /** 前景自動裁切（cover）；關＝拉伸（fill） */
  autoCrop: boolean;
  displayGrid: boolean;
  /** 切換時文字 */
  text: string;
  /** 自己用的備忘（不輸出） */
  memo: string;
  overrides: Record<string, PartOverride>;
  markers: SceneMarker[];
  /** 指定的切入（最多一個） */
  cutinId: string | null;
  /** 讀入時本工具不編輯的欄位（BGM、音效、格線間隔…），再匯出時寫回 */
  extra?: Extra;
}

/** 場景範本（存在專案裡） */
export interface SceneTemplate {
  id: string;
  name: string;
  foregroundUrl: string | null;
  backgroundMode: BackgroundMode;
  backgroundUrl: string | null;
  fieldWidth: number;
  fieldHeight: number;
  autoCrop: boolean;
  displayGrid: boolean;
  text: string;
  overrides: Record<string, PartOverride>;
  markers: SceneMarker[];
  cutinId: string | null;
}

/* ---------- 切入、棋子、劇本 ---------- */

export interface Cutin {
  id: string;
  name: string;
  imageUrl: string | null;
  /** 讀入時本工具不編輯的欄位（音效、播放時間…），再匯出時寫回 */
  extra?: Extra;
}

export type PieceKind = 'kp' | 'enemy' | 'ally' | 'normal';

export interface PieceFace {
  id: string;
  label: string;
  iconUrl: string | null;
  extra?: Extra;
}

export interface Skill {
  id: string;
  name: string;
  value: string;
  damage: string;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  name: string;
  iconUrl: string | null;
  /** 空白＝沒有這個狀態 */
  hp: string;
  mp: string;
  faces: PieceFace[];
  armor: string;
  dodge: string;
  noDodge: boolean;
  skills: Skill[];
  /** 聊天面板（チャットパレット） */
  commands: string;
  memo: string;
  /**
   * 讀入時本工具不編輯的欄位（狀態、參數、位置、顏色…），再匯出時寫回；
   * `status` 是讀入時的完整狀態列，HP、MP 兩欄沒改過就維持原樣（3.7.6）。
   */
  extra?: Extra;
}

export interface StoryText {
  id: string;
  title: string;
  body: string;
  /**
   * 讀入的房間 ZIP 裡的劇本文字（`notes`）：有這個欄位的匯出時寫回成劇本文字（標題＝名稱、內文＝text），
   * 值是工具不編輯的欄位（順序、圖示…）；工具自己寫的劇本文字沒有，照 D14 不輸出（3.7.8）。
   */
  note?: Extra;
}

export type KpSystem = 'coc6' | 'coc7' | 'emoklore';
export type CheckType = 'CCB<=' | 'CC<=';

export interface KpTemplateText {
  main: string;
  scene: string;
  memo: string;
}

export interface KpSettings {
  system: KpSystem;
  checkType: CheckType;
  pcs: string[];
  skills: { id: string; name: string; value: string }[];
  tpl: Record<KpSystem, KpTemplateText>;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  sub: boolean;
}

/* ---------- 專案 ---------- */

export interface Project {
  name: string;
  room: RoomDesign;
  /** 部件（共用標記與螢幕面板，清單順序＝新加的在前） */
  parts: Part[];
  tachie: TachieEntry[];
  scenes: Scene[];
  cutins: Cutin[];
  pieces: Piece[];
  sceneTemplates: SceneTemplate[];
  story: StoryText[];
  kp: KpSettings;
  /** 素材一覽（順序） */
  materials: Material[];
  memo: string;
  todos: Todo[];
  /** 讀入的房間 ZIP 裡本工具沒有對應功能的資料（原樣保留，3.7.8） */
  keep?: RoomKeep;
}

/* ---------- 工具設定（同一瀏覽器內跨專案） ---------- */

export interface SearchSite {
  id: string;
  name: string;
  url: string;
}

export interface ToolDefaults {
  part: number;
  panelW: number;
  tachieH: number;
  zPart: number;
  zPanel: number;
  zTachie: number;
  zEffect: number;
}

export interface ToolSettings {
  /** 匯入時的長邊上限（px） */
  maxEdge: number;
  /** 匯入時轉成 WebP */
  convert: boolean;
  guides: boolean;
  guideColor: string;
  /** 場景名稱符號（以空白、逗號或頓號分隔） */
  symbols: string;
  defaults: ToolDefaults;
  /** 立繪等距排列的間隔（格） */
  tachieGap: number;
  sites: SearchSite[];
  /** 空白演出格 */
  noimage: boolean;
  noimageCount: number;
  noimageZ: number;
  /** 快捷鍵（動作 id → 按鍵組合；空字串＝未設定） */
  keys: Record<string, string>;
}

/* ---------- 常數與預設文字 ---------- */

export const DEFAULT_PROJECT_NAME = '未命名房間';
export const NEW_PROJECT_NAME = '新的房間';
export const SAMPLE_PROJECT_NAME = '範例房間';

/** 「找圖網站」網址裡的關鍵字佔位記號 */
export const SEARCH_PLACEHOLDER = '{關鍵字}';

export const DEFAULT_SITES: readonly Omit<SearchSite, 'id'>[] = [
  { name: 'Google 圖片', url: 'https://www.google.com/search?tbm=isch&q={關鍵字}' },
  { name: 'Openverse', url: 'https://openverse.org/search/image?q={關鍵字}' },
  {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org/w/index.php?search={關鍵字}&title=Special:MediaSearch&type=image',
  },
  { name: 'Pixabay', url: 'https://pixabay.com/zh/images/search/{關鍵字}/' },
  { name: 'Pexels', url: 'https://www.pexels.com/zh-tw/search/{關鍵字}/' },
  { name: 'Unsplash', url: 'https://unsplash.com/s/photos/{關鍵字}' },
  { name: 'BOOTH', url: 'https://booth.pm/zh-tw/search/{關鍵字}' },
];

export const DEFAULT_SYMBOLS = '◆ ▶ ※ ☆ ｜';

export const DEFAULT_TOOL_DEFAULTS: ToolDefaults = {
  part: 4,
  panelW: 0,
  tachieH: 18,
  zPart: 20,
  zPanel: 40,
  zTachie: 30,
  zEffect: 10,
};

/** 新物件的預設名稱 */
export const NAMES = {
  scene: '新場景',
  sceneNumbered: (n: number) => `場景${n}`,
  marker: '共用標記',
  panel: '螢幕面板',
  tachie: '立繪',
  cutin: '切入',
  cutinNumbered: (n: number) => `切入${n}`,
  sceneCutin: '新切入',
  effect: '演出',
  kpPiece: 'KP 用棋子',
  enemy: '敵方 NPC',
  ally: '友方 NPC',
  normal: 'NPC',
  pieceNumbered: (n: number) => `NPC${n}`,
  face: (n: number) => `差分 ${n}`,
  pcs: ['PC1', 'PC2'],
  template: '範本',
  storyNumbered: (n: number) => `段落${n}`,
  copySuffix: ' 複本',
  faceSuffix: ' 差分',
} as const;

/** KP 聊天面板的區塊標題與標示（本站自訂文字；指令語法照 CCFOLIA／BCDice） */
export const KP_TEXT = {
  pcTitle: '──── PC 對照（開場用）────',
  enemyTitle: '──── 敵方 NPC ────',
  allyTitle: '──── 友方 NPC ────',
  enemyMark: '▼敵方',
  allyMark: '▲友方',
  unnamed: '無名',
  attack: '攻擊',
  damage: '傷害',
  dodge: '迴避',
  armor: '◆裝甲　',
} as const;

/** KP 範本的預設內容（本站自訂；CoC 的「sCCB<=」會換成選定的判定指令） */
export const KP_DEFAULTS: Record<KpSystem, KpTemplateText> = {
  coc6: {
    main: ':回合+1\n:回合=0\n──── 常用骰子 ────\n1d100\n1d6\n1d3\nchoice 正 反\nRESB(10-10)\n──── 暗骰 ────\nsCCB<=50 【心理學（暗骰）】',
    scene: '──── 場景切換 ────\n/scene ◆開場\n/scene ◆探索\n/scene ◆轉場\n/scene ◆結局',
    memo: '──── 備忘 ────\n▷大失敗時\nchoice[技能值-10,自動失敗,HP-1,SAN-1]\n▷大成功時\nchoice[技能值+10,自動成功,多一條線索]',
  },
  coc7: {
    main: ':回合+1\n:回合=0\n──── 常用骰子 ────\n1d100\n1d6\n1d3\nchoice 正 反\n──── 暗骰 ────\nsCC<=50 【心理學（暗骰）】',
    scene: '──── 場景切換 ────\n/scene ◆開場\n/scene ◆探索\n/scene ◆轉場\n/scene ◆結局',
    memo: '──── 備忘 ────\n▷大失敗時\nchoice[自動失敗,情況惡化]\n▷大成功時\nchoice[自動成功,多一條線索]',
  },
  emoklore: {
    main: ':回合+1\n:回合=0\n──── 常用骰子 ────\n1DL\n2DL\n3DL\n──── 進行 ────',
    scene: '──── 場景切換 ────\n/scene ◆導入\n/scene ◆調查\n/scene ◆高潮\n/scene ◆結尾',
    memo: '──── 共鳴 ────\n（在這裡寫共鳴判定要用的資訊）',
  },
};

export const KP_SYSTEM_LABELS: Record<KpSystem, string> = {
  coc6: 'CoC 第 6 版',
  coc7: 'CoC 第 7 版',
  emoklore: 'Emoklore',
};

/* ---------- id ---------- */

/** 會變成 CCFOLIA entities 鍵的物件用 newRoomEntityId（時間戳 36 進位，不重複） */
export const newEntityId = (): string => newRoomEntityId();

let seq = 0;
/** 工具內部用的短 id（技能列、待辦、範本…） */
export function newLocalId(prefix = 'k'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

/* ---------- 預設值 ---------- */

export function createProjectDefaults(): ProjectDefaults {
  return {
    part: null,
    panelW: null,
    tachieH: null,
    zPart: null,
    zPanel: null,
    zTachie: null,
    zEffect: null,
  };
}

export function createRoomDesign(): RoomDesign {
  return {
    fieldWidth: 40,
    fieldHeight: 30,
    backgroundUrl: null,
    foregroundUrl: null,
    tachieAlign: 'bottom',
    tachieBaseline: 15,
    tachieHeight: 18,
    tachieX: 0,
    defaults: createProjectDefaults(),
    bgmCrossfade: true,
    legacyDice: false,
    placeholders: [{ id: 'ph1', x: 0, locked: false }],
  };
}

export function createKpSettings(): KpSettings {
  return {
    system: 'coc6',
    checkType: 'CCB<=',
    pcs: [...NAMES.pcs],
    skills: [],
    tpl: {
      coc6: { ...KP_DEFAULTS.coc6 },
      coc7: { ...KP_DEFAULTS.coc7 },
      emoklore: { ...KP_DEFAULTS.emoklore },
    },
  };
}

export function createProject(name: string = DEFAULT_PROJECT_NAME): Project {
  return {
    name,
    room: createRoomDesign(),
    parts: [],
    tachie: [],
    scenes: [],
    cutins: [],
    pieces: [],
    sceneTemplates: [],
    story: [],
    kp: createKpSettings(),
    materials: [],
    memo: '',
    todos: [],
  };
}

export function createToolSettings(): ToolSettings {
  return {
    maxEdge: 1200,
    convert: true,
    guides: true,
    guideColor: '#7cc5ff',
    symbols: DEFAULT_SYMBOLS,
    defaults: { ...DEFAULT_TOOL_DEFAULTS },
    tachieGap: 0,
    sites: DEFAULT_SITES.map((s, i) => ({ id: `site${i + 1}`, ...s })),
    noimage: false,
    noimageCount: 1,
    noimageZ: 45,
    keys: {},
  };
}

/* ---------- 共用值與本專案值 ---------- */

/** 實際使用的初始值：本專案有填就用本專案的，否則用工具設定的共用值 */
export interface EffectiveDefaults {
  part: number;
  panelW: number;
  tachieH: number;
  z: { part: number; panel: number; tachie: number; effect: number };
}

const pick = (own: number | null | undefined, common: number): number =>
  own != null && Number.isFinite(own) ? own : common;

export function effectiveDefaults(room: RoomDesign, tool: ToolDefaults): EffectiveDefaults {
  const d = room.defaults;
  return {
    part: pick(d.part, tool.part) || 4,
    panelW: pick(d.panelW, tool.panelW) || 0,
    tachieH: pick(d.tachieH, tool.tachieH) || 18,
    z: {
      part: pick(d.zPart, tool.zPart),
      panel: pick(d.zPanel, tool.zPanel),
      tachie: pick(d.zTachie, tool.zTachie),
      effect: pick(d.zEffect, tool.zEffect),
    },
  };
}

/* ---------- 工廠 ---------- */

export function createScene(
  name: string,
  room: RoomDesign,
  foregroundUrl: string | null = null,
): Scene {
  return {
    id: newEntityId(),
    name,
    foregroundUrl,
    backgroundMode: 'room',
    backgroundUrl: null,
    fieldWidth: room.fieldWidth,
    fieldHeight: room.fieldHeight,
    autoCrop: true,
    displayGrid: false,
    text: '',
    memo: '',
    overrides: {},
    markers: [],
    cutinId: null,
  };
}

export function createCutin(name: string = NAMES.cutin, imageUrl: string | null = null): Cutin {
  return { id: newEntityId(), name, imageUrl };
}

export function createPiece(kind: PieceKind, name?: string): Piece {
  const npc = kind === 'enemy' || kind === 'ally';
  return {
    id: newEntityId(),
    kind,
    name:
      name ??
      (kind === 'kp'
        ? NAMES.kpPiece
        : kind === 'enemy'
          ? NAMES.enemy
          : kind === 'ally'
            ? NAMES.ally
            : NAMES.normal),
    iconUrl: null,
    hp: '',
    mp: '',
    faces: [],
    armor: '',
    dodge: '',
    noDodge: false,
    skills: npc ? [{ id: newLocalId('s'), name: '', value: '', damage: '' }] : [],
    commands: '',
    memo: '',
  };
}

/* ---------- 數值 ---------- */

/** 數字欄的值 → 數字（不是數字時 fallback） */
export function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** 位置類：取整數格（.5 往絕對值大的方向） */
export const gridPos = (v: unknown, fallback = 0): number => roundGrid(toNumber(v, fallback));
/** 大小類：取整數格且至少 1 */
export const gridSize = (v: unknown, fallback = 4): number =>
  gridLength(toNumber(v, fallback), fallback);

/** 盤面寬高欄（D13）：限制在 1 以上的整數；空白或無效時回到原值 */
export function fieldSizeInput(raw: string, current: number): number {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 1) return current;
  return Math.max(1, roundGrid(n));
}
