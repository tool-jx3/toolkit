/**
 * CCFOLIA 房間資料 `__data.json` 的型別與預設值（外部格式事實，room-zip 規格 3.1；psd-studio 規格 2.3）。
 *
 * 結構：`{ meta: { version: "1.1.0" }, entities: { room, items, decks, notes, characters, effects, scenes, savedatas, snapshots },
 * resources: { "<圖片檔名>": { type: MIME } } }`。除了 `room` 以外每一類都是「ID → 內容」的對照（ID 只要同一類內不重複）。
 * 預設值與欄位順序照原作（johnko00/ccfolia-room-zip-maker-demo 的 core.v1.js，原作註明以 CCFOLIA 的實際資料驗證過）的輸出。
 *
 * 容易做錯的地方：
 * - `enableCrossfade` 與畫面上「BGM 交叉淡化」的開關**相反**（畫面勾選 → false），用 `crossfadeFlag()` 換算。
 * - `hidden3dDice`＝舊式骰子（不用 3D 骰子）。
 * - `messageChannels` 預設是 CCFOLIA 新房間的三個分頁 `メイン`、`情報`、`雑談`。
 * - 角色的差分 `faces` 是 `{ label, iconUrl }`（原作輸出 `{ name, imageUrl }` 是錯的，room-zip 第 7 節裁定修正）。
 * - 場景的 `markers` 是整組：切到該場景時取代房間的マーカーパネル。
 * - 只追加資料（例如只加劇本文字）時 `room` 要是 `{}`（`createAppendRoomData`），不能用 `createRoom()` 的預設值。
 */
import {
  type CcfoliaFace,
  type CcfoliaParam,
  type CcfoliaStatus,
  CHARACTER_DEFAULT_COLOR,
  CHARACTER_DEFAULT_SIZE,
} from './characterData';

/** `meta.version` 的固定值 */
export const ROOM_META_VERSION = '1.1.0';
/** 房間資料檔名 */
export const ROOM_DATA_FILE = '__data.json';
/** 權杖檔名（必須存在，CCFOLIA 不檢查內容） */
export const ROOM_TOKEN_FILE = '.token';
/** entities 的九類，順序照原作的輸出 */
export const ROOM_ENTITY_KINDS = Object.freeze([
  'room',
  'items',
  'decks',
  'notes',
  'characters',
  'effects',
  'scenes',
  'savedatas',
  'snapshots',
] as const);
export type RoomEntityKind = (typeof ROOM_ENTITY_KINDS)[number];
/** CCFOLIA 新房間預設的三個聊天分頁 */
export const DEFAULT_MESSAGE_CHANNELS = Object.freeze(['メイン', '情報', '雑談']);
/** 棋子在盤面外的待機位置（原作照實際資料） */
export const CHARACTER_STANDBY = Object.freeze({ x: 490, y: 791, z: 1 });

/** マーカーパネル（`room.markers` 與各場景的 `markers`）。x、y 是左上角（格）。 */
export interface CcfoliaMarker {
  x: number;
  y: number;
  /** 堆疊順序（大的在前） */
  z: number;
  width: number;
  height: number;
  angle: number;
  /** 鎖定（CCFOLIA 上不能拖動） */
  locked: boolean;
  freezed: boolean;
  /** 面板上顯示的文字 */
  text: string;
  imageUrl: string | null;
  clickAction: unknown;
  [key: string]: unknown;
}

/** 房間設定（`entities.room`） */
export interface CcfoliaRoom {
  defaultAnonymousRole: string;
  /** 背景（盤面外側的圖） */
  backgroundUrl: string | null;
  /** 前景（盤面上的圖） */
  foregroundUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  mapType: string;
  /** 盤面寬高（格，整數 ≥ 1） */
  fieldWidth: number;
  fieldHeight: number;
  fieldObjectFit: string;
  alignWithGrid: boolean;
  messageChannels: string[];
  messageGroups: unknown[];
  markers: Record<string, CcfoliaMarker>;
  mediaName: string;
  mediaRef: string | null;
  mediaType: string;
  mediaRepeat: boolean;
  mediaVolume: number;
  monitored: boolean;
  soundRef: string | null;
  /** 匯入後套用中的場景（第一個場景的 ID；沒有場景時 null） */
  sceneId: string | null;
  archived: boolean;
  backgroundColor: string;
  variables: unknown[];
  underConstruction: boolean;
  /** 舊式骰子（不用 3D 骰子） */
  hidden3dDice: boolean;
  initialSavedata: unknown;
  displayGrid: boolean;
  gridSize: number;
  /** **與畫面的開關相反**：畫面勾選「BGM 交叉淡化」→ false（用 crossfadeFlag） */
  enableCrossfade: boolean;
  crossfadeDuration: number;
  [key: string]: unknown;
}

/** シーン（`entities.scenes` 的一筆）：切換場景時這些值套到房間上，並把 text 送進聊天 */
export interface CcfoliaScene {
  name: string;
  /** 場景清單的順序（可以是小數） */
  order: number;
  backgroundUrl: string | null;
  /** 場景自己的前景；沒有時 null（不會帶入房間前景） */
  foregroundUrl: string | null;
  /** `cover`（自動裁切）或 `fill`（拉伸） */
  fieldObjectFit: string;
  fieldWidth: number;
  fieldHeight: number;
  displayGrid: boolean;
  gridSize: number;
  /** 這個場景的マーカーパネル（整組取代房間的） */
  markers: Record<string, CcfoliaMarker>;
  /** 切換時送到聊天的文字 */
  text: string;
  locked: boolean;
  mediaName: string;
  mediaRef: string | null;
  mediaType: string;
  mediaRepeat: boolean;
  mediaVolume: number;
  soundName: string;
  soundRef: string | null;
  soundRepeat: boolean;
  soundVolume: number;
  [key: string]: unknown;
}

/** スクリーンパネル（`entities.items` 的一筆）：房間層級，不隨場景切換 */
export interface CcfoliaItem {
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  deckId: string | null;
  locked: boolean;
  visible: boolean;
  /** 背面朝上 */
  closed: boolean;
  withoutOwner: boolean;
  freezed: boolean;
  type: string;
  active: boolean;
  /** 備註（盤面文字） */
  memo: string;
  imageUrl: string | null;
  /** 背面圖片 */
  coverImageUrl: string | null;
  clickAction: unknown;
  order: number;
  [key: string]: unknown;
}

/** キャラクター（`entities.characters` 的一筆）：角色資料欄位＋房間專用欄位 */
export interface CcfoliaRoomCharacter {
  name: string;
  playerName: string;
  memo: string;
  initiative: number;
  externalUrl: string;
  status: CcfoliaStatus[];
  params: CcfoliaParam[];
  iconUrl: string | null;
  faces: CcfoliaFace[];
  x: number;
  y: number;
  z: number;
  angle: number;
  width: number;
  height: number;
  active: boolean;
  secret: boolean;
  invisible: boolean;
  hideStatus: boolean;
  color: string;
  roomId: string | null;
  commands: string;
  speaking: boolean;
  diceSkin: unknown;
  order: number;
  [key: string]: unknown;
}

/** カットイン（`entities.effects` 的一筆）：聊天輸入「@名稱」時播放 */
export interface CcfoliaEffect {
  name: string;
  order: number;
  active: boolean;
  imageUrl: string | null;
  /** 播放時間（毫秒時間戳；原作寫匯出當下） */
  playTime: number;
  soundRef: string | null;
  soundName: string;
  soundVolume: number;
  [key: string]: unknown;
}

/**
 * 劇本文字（シナリオテキスト，舊稱共有メモ；`entities.notes` 的一筆）。
 * CCFOLIA 1.37.4（scenario-text 規格 3.1，原作以真實房間驗證）：從「[GM] シナリオテキスト一覧」送出時，
 * 以 `name` 當發言者名稱（空字串＝聊天欄目前的名稱）、`iconUrl` 當立繪（訊息框會顯示）發言 `text`；
 * 一覽依 `order` 由小到大排列。`iconUrl` 可以是網址，或 ZIP 裡的圖片檔名（讀入時上傳並換成網址）；沒有圖時 `""` 或 null。
 * 畫面上沒有設定 `iconUrl` 的地方，只能經由房間資料讀入。
 */
export interface CcfoliaNote {
  /** 標題（送出時的名稱） */
  name: string;
  /** 本文（空白時 CCFOLIA 會改送聊天欄裡的文字） */
  text: string;
  /** 一覽的順序（由小到大） */
  order: number;
  /** 送出時的圖（立繪） */
  iconUrl: string | null;
  [key: string]: unknown;
}

export interface CcfoliaRoomEntities {
  room: CcfoliaRoom;
  items: Record<string, CcfoliaItem>;
  decks: Record<string, unknown>;
  notes: Record<string, CcfoliaNote>;
  characters: Record<string, CcfoliaRoomCharacter>;
  effects: Record<string, CcfoliaEffect>;
  scenes: Record<string, CcfoliaScene>;
  savedatas: Record<string, unknown>;
  snapshots: Record<string, unknown>;
}

/** `resources` 的一筆 */
export interface CcfoliaResource {
  type: string;
  [key: string]: unknown;
}

/** `__data.json` 全體 */
export interface CcfoliaRoomData {
  meta: { version: string; [key: string]: unknown };
  entities: CcfoliaRoomEntities;
  /** 圖片檔名 → `{ type: MIME }`；必須與 ZIP 裡的圖片檔完全一一對應 */
  resources: Record<string, CcfoliaResource>;
}

/* ---------- 預設值（room-zip 3.1.3～3.1.9 的「舊版輸出」欄） ---------- */

/** 「BGM 交叉淡化」開關 → `enableCrossfade` 的值（相反） */
export const crossfadeFlag = (uiOn: boolean): boolean => !uiOn;
/** `enableCrossfade` → 畫面上的開關 */
export const crossfadeFromFlag = (flag: boolean): boolean => !flag;

/** 房間設定（盤面預設 40×30；fieldWidth、fieldHeight 請給整數 ≥ 1） */
export function createRoom(patch: Partial<CcfoliaRoom> = {}): CcfoliaRoom {
  return {
    defaultAnonymousRole: 'player',
    backgroundUrl: null,
    foregroundUrl: null,
    embedUrl: null,
    thumbnailUrl: null,
    mapType: 'image',
    fieldWidth: 40,
    fieldHeight: 30,
    fieldObjectFit: 'cover',
    alignWithGrid: true,
    messageChannels: [...DEFAULT_MESSAGE_CHANNELS],
    messageGroups: [],
    markers: {},
    mediaName: '',
    mediaRef: null,
    mediaType: 'file',
    mediaRepeat: true,
    mediaVolume: 1,
    monitored: false,
    soundRef: null,
    sceneId: null,
    archived: false,
    backgroundColor: '#000000',
    variables: [],
    underConstruction: false,
    hidden3dDice: false,
    initialSavedata: null,
    displayGrid: false,
    gridSize: 1,
    enableCrossfade: crossfadeFlag(true),
    crossfadeDuration: 1,
    ...patch,
  };
}

/** 場景（新建場景的值；fieldWidth、fieldHeight 請給建立當時的盤面寬高） */
export function createScene(patch: Partial<CcfoliaScene> = {}): CcfoliaScene {
  return {
    name: '',
    order: 1,
    backgroundUrl: null,
    foregroundUrl: null,
    fieldObjectFit: 'cover',
    fieldWidth: 40,
    fieldHeight: 30,
    displayGrid: false,
    gridSize: 1,
    markers: {},
    text: '',
    locked: false,
    mediaName: '',
    mediaRef: null,
    mediaType: 'file',
    mediaRepeat: true,
    mediaVolume: 1,
    soundName: '',
    soundRef: null,
    soundRepeat: false,
    soundVolume: 1,
    ...patch,
  };
}

/** マーカーパネル（x、y 是左上角；工具內用中心座標時先經過 board.ts 的 centerToTopLeft） */
export function createMarker(patch: Partial<CcfoliaMarker> = {}): CcfoliaMarker {
  return {
    x: 0,
    y: 0,
    z: 2,
    width: 4,
    height: 4,
    angle: 0,
    locked: true,
    freezed: false,
    text: '',
    imageUrl: null,
    clickAction: null,
    ...patch,
  };
}

/** スクリーンパネル（memo＝盤面文字；order 從 1 起算） */
export function createItem(patch: Partial<CcfoliaItem> = {}): CcfoliaItem {
  return {
    x: 0,
    y: 0,
    z: 2,
    angle: 0,
    width: 4,
    height: 4,
    deckId: null,
    locked: true,
    visible: true,
    closed: false,
    withoutOwner: false,
    freezed: false,
    type: 'object',
    active: true,
    memo: '',
    imageUrl: null,
    coverImageUrl: null,
    clickAction: null,
    order: 1,
    ...patch,
  };
}

/** 房間裡的角色（棋子）：預設放在盤面外的待機位置、不在盤面上 */
export function createRoomCharacter(
  patch: Partial<CcfoliaRoomCharacter> = {},
): CcfoliaRoomCharacter {
  return {
    name: '',
    playerName: '',
    memo: '',
    initiative: 0,
    externalUrl: '',
    status: [],
    params: [],
    iconUrl: null,
    faces: [],
    x: CHARACTER_STANDBY.x,
    y: CHARACTER_STANDBY.y,
    z: CHARACTER_STANDBY.z,
    angle: 0,
    width: CHARACTER_DEFAULT_SIZE,
    height: CHARACTER_DEFAULT_SIZE,
    active: false,
    secret: false,
    invisible: false,
    hideStatus: false,
    color: CHARACTER_DEFAULT_COLOR,
    roomId: null,
    commands: '',
    speaking: false,
    diceSkin: null,
    order: 1,
    ...patch,
  };
}

/** カットイン（playTime 預設是現在的時間戳） */
export function createEffect(patch: Partial<CcfoliaEffect> = {}): CcfoliaEffect {
  return {
    name: '',
    order: 1,
    active: false,
    imageUrl: null,
    playTime: Date.now(),
    soundRef: null,
    soundName: '',
    soundVolume: 1,
    ...patch,
  };
}

/** 劇本文字（シナリオテキスト；舊稱共有メモ） */
export function createNote(patch: Partial<CcfoliaNote> = {}): CcfoliaNote {
  return { name: '', text: '', order: 1, iconUrl: null, ...patch };
}

/** 組成 `__data.json`（entities 依 ROOM_ENTITY_KINDS 的順序；沒給的類別是空物件；resources 由 buildRoomZip 填） */
export function createRoomData(
  entities: Partial<CcfoliaRoomEntities> = {},
  resources: Record<string, CcfoliaResource> = {},
): CcfoliaRoomData {
  return {
    meta: { version: ROOM_META_VERSION },
    entities: {
      room: entities.room ?? createRoom(),
      items: entities.items ?? {},
      decks: entities.decks ?? {},
      notes: entities.notes ?? {},
      characters: entities.characters ?? {},
      effects: entities.effects ?? {},
      scenes: entities.scenes ?? {},
      savedatas: entities.savedatas ?? {},
      snapshots: entities.snapshots ?? {},
    },
    resources,
  };
}

/**
 * 「只追加」的房間資料：`entities.room` 是空物件 `{}`。CCFOLIA 讀入房間資料時依 ID 一筆一筆寫入各類別，
 * `room` 是 `{}` 時只更新房間的更新時間、不改設定，其他類別空的就什麼都不變——所以讀入只會**多出**給的資料
 * （例：scenario-text 只追加劇本文字）。不要用 `createRoom()` 的預設值（會把房間的背景、盤面等設定蓋掉）。
 */
export interface CcfoliaAppendRoomData extends Omit<CcfoliaRoomData, 'entities'> {
  entities: Omit<CcfoliaRoomEntities, 'room'> & { room: Record<string, never> };
}

/** 組成「只追加」的 `__data.json`（room 是 `{}`；entities 依 ROOM_ENTITY_KINDS 的順序；resources 由 buildRoomZip 填） */
export function createAppendRoomData(
  entities: Partial<Omit<CcfoliaRoomEntities, 'room'>> = {},
  resources: Record<string, CcfoliaResource> = {},
): CcfoliaAppendRoomData {
  return {
    meta: { version: ROOM_META_VERSION },
    entities: {
      room: {},
      items: entities.items ?? {},
      decks: entities.decks ?? {},
      notes: entities.notes ?? {},
      characters: entities.characters ?? {},
      effects: entities.effects ?? {},
      scenes: entities.scenes ?? {},
      savedatas: entities.savedatas ?? {},
      snapshots: entities.snapshots ?? {},
    },
    resources,
  };
}

/* ---------- ID 與權杖 ---------- */

let lastId = 0;

/** entities 用的 ID：時間戳的 36 進位字串，連續呼叫保證遞增不重複（同原作） */
export function newRoomEntityId(): string {
  const now = Math.max(Date.now(), lastId + 1);
  lastId = now;
  return now.toString(36);
}

/**
 * `.token` 的內容：「0.」＋64 個小寫十六進位亂數。檔案必須存在；CCFOLIA 1.37.4 會比對「0.」＋SHA-256(`__data.json`)，
 * 不符時讀入前顯示「外部ツールで作成および編集されたデータです…」確認後照常讀入（scenario-text 規格 3.1；
 * 外部工具的資料讓使用者看到這個確認比較好，所以刻意不算真正的值）。
 */
export function newRoomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0.${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** `.token` 的形狀檢查（自我檢查不要求，給測試與提示用） */
export const ROOM_TOKEN_RE = /^0\.[0-9a-f]{64}$/;
