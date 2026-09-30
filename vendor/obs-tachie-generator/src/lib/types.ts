/** 要以立繪顯示的一位 Discord 使用者。 */
export interface TachieUser {
  /** Discord 使用者 ID（只有數字的字串）。用來以前綴比對 Streamkit 的 `avatars/<id>`。 */
  id: string
  /** 顯示名稱。只會以註解形式寫進產生的 CSS（不會出現在畫面上）。 */
  name: string
  /** 畫面上顯示的任意名稱。空白時沿用 {@link TachieUser.name}。 */
  displayName?: string
  /**
   * 立繪圖片。建議用 `data:image/...;base64,...` 的 data URI（不需外部主機、避開 CSP、不會失效）。
   * 也可以指定外部 URL，但被 Streamkit 的 CSP 擋下的主機不會顯示。
   */
  imageUrl: string
}

/**
 * 說話時（加上 `Voice_avatarSpeaking__`）套在立繪上的效果。
 * 「說話時的動作」可以個別開關 外框（outline）／閃爍（blink）／彈跳（bounce）。
 */
export interface SpeakEffect {
  /** 一跳一跳的彈跳。 */
  bounce: boolean
  /** 彈跳高度（px）。 */
  jumpPx: number
  /** 是否顯示外框・光暈（drop-shadow 的描邊）。 */
  outline: boolean
  /** 外框・光暈的顏色（CSS 色彩，預設 `#FFFFFF`）。 */
  outlineColor: string
  /** 外框・光暈的寬度（px）。drop-shadow 位移量與光暈半徑的基準（預設 2）。 */
  outlineWidth: number
  /** 是否閃爍（opacity 脈動）。 */
  blink: boolean
  /** 動畫週期（ms）。 */
  durationMs: number
}

/** 名字標籤的對齊方式。只有立繪指定了 `width` 時才有意義。 */
export type NameAlign = 'left' | 'center' | 'right'

/**
 * 名字背景（字幕條）寬度的決定方式。
 * - `text`：字幕條隨文字寬度縮放（像字幕的樣子）。對齊方式變成整條字幕條的位置對齊。
 * - `stretch`：字幕條鋪滿立繪的寬度（在字幕條裡對齊文字）。
 */
export type NameFit = 'text' | 'stretch'

/**
 * 附在立繪旁的「任意名字」的外觀。**不持有文字本身**
 * （文字屬於「誰」＝ {@link AppUser.displayName}；外觀則由多人共用）。
 * 輸出是 `body::before` 的 `content` 一個元素 ＝ **每個來源只能有一個名字**。
 */
export interface NameLabel {
  /** 是否顯示名字。 */
  show: boolean
  /** 相對於立繪左緣的位置（px）。 */
  offsetX: number
  /** 相對於立繪下緣的位置（px）。負值表示在立繪下方。 */
  offsetY: number
  /** 文字大小（px）。 */
  fontSize: number
  /** 字型名稱（空白時沿用 Streamkit 頁面的字型）。只有 OBS（CEF）裡有的字型才有效。 */
  fontFamily: string
  /** 文字顏色（CSS 色彩，預設 `#FFFFFF`）。 */
  color: string
  /** 是否粗體。 */
  bold: boolean
  /** 對齊方式（只有立繪指定了 `width` 時才有效）。 */
  align: NameAlign
  /** 是否描邊（text-shadow 的外框）。 */
  outline: boolean
  /** 描邊顏色（CSS 色彩，預設 `#000000`）。 */
  outlineColor: string
  /** 描邊寬度（px）。 */
  outlineWidth: number
  /** 是否鋪背景（字幕條）。 */
  background: boolean
  /** 背景色（CSS 色彩，預設 `#000000`）。 */
  backgroundColor: string
  /** 背景不透明度（%），0–100。 */
  backgroundOpacity: number
  /** 背景的內側留白・水平（px）。 */
  backgroundPadX: number
  /** 背景的內側留白・垂直（px）。 */
  backgroundPadY: number
  /** 背景的圓角（px）。 */
  backgroundRadius: number
  /** 背景寬度的決定方式（只有背景開啟時才有效）。 */
  fit: NameFit
}

/**
 * 放置立繪的水平基準點（錨點）。
 * `left` 是畫布左緣／`right` 是右緣／`center` 是水平中央。
 */
export type AnchorX = 'left' | 'center' | 'right'

/**
 * 放置立繪的垂直基準點（錨點）。
 * `top` 是畫布上緣／`bottom` 是下緣／`middle` 是垂直中央。
 */
export type AnchorY = 'top' | 'middle' | 'bottom'

/** 預設的水平錨點。**用來把 003 以前的存檔（沒有錨點）當成左下讀入**。 */
export const DEFAULT_ANCHOR_X: AnchorX = 'left'

/** 預設的垂直錨點。**用來把 003 以前的存檔（沒有錨點）當成左下讀入**。 */
export const DEFAULT_ANCHOR_Y: AnchorY = 'bottom'

/** 解析水平錨點（未指定時為 {@link DEFAULT_ANCHOR_X}）。 */
export function resolveAnchorX(v?: AnchorX): AnchorX {
  return v ?? DEFAULT_ANCHOR_X
}

/** 解析垂直錨點（未指定時為 {@link DEFAULT_ANCHOR_Y}）。 */
export function resolveAnchorY(v?: AnchorY): AnchorY {
  return v ?? DEFAULT_ANCHOR_Y
}

/**
 * 一併解析水平與垂直錨點。
 * 輸出位置的地方（generateCss／預覽／UI）**一定要經過這裡**
 * ——「未指定 ＝ 左下」這一點只由這個函式保證。
 */
export function resolveAnchors(o: Pick<GenerateOptions, 'anchorX' | 'anchorY'>): {
  x: AnchorX
  y: AnchorY
} {
  return { x: resolveAnchorX(o.anchorX), y: resolveAnchorY(o.anchorY) }
}

/** `generateCss` 的產生選項。 */
export interface GenerateOptions {
  /**
   * 常駐顯示。true 時即使不在通話中也用 `body::after` 繪製（一人＝一個瀏覽器來源）。
   * false 則是替換 Streamkit 實際 img 的方式，只顯示通話中的使用者（給合併版用）。
   */
  alwaysShow: boolean
  /**
   * 距水平錨點的距離（px）。預設的 `left` 錨點是距左緣，`right` 是距右緣。
   * `center` 時是相對中央的偏移量（正值往右）。欄位名稱為了存檔相容維持 `left`。
   */
  left: number
  /**
   * 距垂直錨點的距離（px）。預設的 `bottom` 錨點是距下緣，`top` 是距上緣。
   * `middle` 時是相對中央的偏移量（正值往上）。欄位名稱為了存檔相容維持 `bottom`。
   */
  bottom: number
  /** 水平錨點。未指定時為 `left`（與 003 以前的存檔相容）。 */
  anchorX?: AnchorX
  /** 垂直錨點。未指定時為 `bottom`（與 003 以前的存檔相容）。 */
  anchorY?: AnchorY
  /** 立繪寬度（px）。未指定時為圖片原尺寸。 */
  width?: number
  /** 把安靜的人（沒在說話的立繪）調暗，讓說話的人更顯眼。 */
  dimWhenQuiet: boolean
  /** 不在通話中時隱藏立繪（只在本人連線中＝在場時顯示）。 */
  hideWhenAway: boolean
  /** 說話效果。 */
  speak: SpeakEffect
  /** 名字標籤的外觀。文字在 {@link TachieUser.displayName}／{@link TachieUser.name} 那邊。 */
  nameLabel: NameLabel
  /**
   * 立繪圖片的實際尺寸（寬 px）。用於名字標籤的框寬，以及立繪的繪製尺寸（背景方式）。
   */
  imageNaturalWidth?: number
  /** 立繪圖片的實際尺寸（高 px）。與 imageNaturalWidth 成對，用於立繪的繪製尺寸（背景方式）。 */
  imageNaturalHeight?: number
}

/** 「把安靜的人調暗」時，沒說話時套用的亮度（%）。 */
export const DIM_BRIGHTNESS_PCT = 50

/**
 * 應用程式層的「誰」。只持有 Discord 識別資訊，不持有外觀（圖片・位置・效果）。
 * 外觀放在 {@link Preset}，輸出時以 {@link Pairing} 組合。
 */
export interface AppUser {
  /** Discord 使用者 ID（只有數字的字串）。 */
  id: string
  /** 顯示名稱（備忘用）。 */
  name: string
  /** 畫面上顯示的任意名稱。空白（未設定）時沿用 {@link AppUser.name}。 */
  displayName?: string
}

/**
 * 可重複使用的「外觀・效果」。把立繪圖片＋位置/尺寸＋說話效果綁成一組。
 * `id` 是應用程式內的鍵（不是 Discord ID）。只換 ID 時外觀可以維持不變。
 */
export interface Preset {
  /** 應用程式內的鍵（由 {@link newId} 產生）。 */
  id: string
  /** 預設集名稱（備忘用）。 */
  name: string
  /** 立繪圖片（建議 data URI／也可以是外部 URL）。 */
  imageUrl: string
  /** 距水平錨點的距離（px）。詳見 {@link GenerateOptions.left}。 */
  left: number
  /** 距垂直錨點的距離（px）。詳見 {@link GenerateOptions.bottom}。 */
  bottom: number
  /** 水平錨點。未指定時為 `left`（與 003 以前的存檔相容）。 */
  anchorX?: AnchorX
  /** 垂直錨點。未指定時為 `bottom`（與 003 以前的存檔相容）。 */
  anchorY?: AnchorY
  /** 立繪寬度（px）。未指定時為圖片原尺寸。 */
  width?: number
  /** 把安靜的人（沒在說話的立繪）調暗。 */
  dimWhenQuiet: boolean
  /** 不在通話中時隱藏立繪（只在在場時顯示）。 */
  hideWhenAway: boolean
  /** 說話效果。 */
  speak: SpeakEffect
  /** 名字標籤的外觀（文字在使用者那邊）。 */
  nameLabel: NameLabel
}

/** 要輸出的「使用者 × 預設集」明確配對（多對多）。儲存清單中的一筆。 */
export interface Pairing {
  /** 參照 {@link AppUser.id}。 */
  userId: string
  /** 參照 {@link Preset.id}。 */
  presetId: string
}

/**
 * 「作業中的選擇」一組。輸出 CSS 以這一組選擇為對象。
 * 與 `pairings`（儲存清單）是分開的；儲存是用來累積・叫回這個選擇。
 */
export interface Selection {
  /** 參照 {@link AppUser.id}。未選擇時為 null。 */
  userId: string | null
  /** 參照 {@link Preset.id}。未選擇時為 null。 */
  presetId: string | null
}

/** 未選擇的作業中選擇。 */
export const EMPTY_SELECTION: Selection = { userId: null, presetId: null }

/** 整個 UI 的保存對象。使用者・預設集・儲存的配對・作業中選擇各自獨立。 */
export interface AppState {
  users: AppUser[]
  presets: Preset[]
  pairings: Pairing[]
  selection: Selection
}

/**
 * 把預設集轉成 generateCss 的 {@link GenerateOptions}（一律是個別輸出＝常駐顯示）。
 * `imageNaturalWidth` 用於寬度為原尺寸時的名字標籤（量不到時可省略）。
 */
export function presetToOptions(
  p: Preset,
  imageNaturalWidth?: number,
  imageNaturalHeight?: number,
): GenerateOptions {
  return {
    alwaysShow: true,
    left: p.left,
    bottom: p.bottom,
    anchorX: p.anchorX,
    anchorY: p.anchorY,
    width: p.width,
    dimWhenQuiet: p.dimWhenQuiet,
    hideWhenAway: p.hideWhenAway,
    speak: p.speak,
    nameLabel: p.nameLabel,
    imageNaturalWidth,
    imageNaturalHeight,
  }
}

/** 合成使用者（誰）與預設集（外觀），做出 generateCss 的繪製輸入 {@link TachieUser}。 */
export function renderUser(u: AppUser, p: Preset): TachieUser {
  return { id: u.id, name: u.name, displayName: u.displayName, imageUrl: p.imageUrl }
}

/** 決定畫面上顯示的名字（`displayName` 優先，空白時用備忘的 `name`）。空字串表示不顯示名字。 */
export function resolveDisplayName(u: Pick<TachieUser, 'name' | 'displayName'>): string {
  return (u.displayName ?? '').trim() || u.name.trim()
}

/** 以預設值（DEFAULT_OPTIONS 的位置/尺寸/效果＋空 image・空 name）建立新預設集。 */
export function makeDefaultPreset(id: string): Preset {
  return {
    id,
    name: '',
    imageUrl: '',
    left: DEFAULT_OPTIONS.left,
    bottom: DEFAULT_OPTIONS.bottom,
    anchorX: DEFAULT_ANCHOR_X,
    anchorY: DEFAULT_ANCHOR_Y,
    width: DEFAULT_OPTIONS.width,
    dimWhenQuiet: DEFAULT_OPTIONS.dimWhenQuiet,
    hideWhenAway: DEFAULT_OPTIONS.hideWhenAway,
    speak: { ...DEFAULT_SPEAK },
    nameLabel: { ...DEFAULT_NAME_LABEL },
  }
}

/** 把預設集的選項值（位置/尺寸/效果/調暗/隱藏）恢復預設（名稱・圖片保留）。 */
export function resetPresetOptions(p: Preset): Preset {
  return { ...makeDefaultPreset(p.id), name: p.name, imageUrl: p.imageUrl }
}

/**
 * 產生應用程式內的鍵（以在瀏覽器執行為前提）。
 * ※ 必須是決定性的地方（state.ts 的 normalizeState 等）不要使用。
 */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * 預設的名字標籤。**預設不顯示**（維持與 001 為止相同的 CSS 輸出）。
 * 位置是「立繪左緣・下緣再往下一點」＝ 腳邊的名牌。
 */
export const DEFAULT_NAME_LABEL: NameLabel = {
  show: false,
  offsetX: 0,
  offsetY: -8,
  fontSize: 32,
  fontFamily: '',
  color: '#FFFFFF',
  bold: true,
  align: 'center',
  outline: true,
  outlineColor: '#000000',
  outlineWidth: 3,
  background: false,
  backgroundColor: '#000000',
  backgroundOpacity: 60,
  backgroundPadX: 12,
  backgroundPadY: 6,
  backgroundRadius: 6,
  fit: 'text',
}

/** 預設的效果。 */
export const DEFAULT_SPEAK: SpeakEffect = {
  bounce: true,
  jumpPx: 10,
  outline: true,
  outlineColor: '#FFFFFF',
  outlineWidth: 2,
  blink: false,
  durationMs: 750,
}

/**
 * 預設的產生選項。
 *
 * **距錨點的距離為 0**（＝緊貼錨點）。實際使用時是在 OBS 那邊移動來源來對位，
 * 所以工具這邊不留邊距。
 *
 * ※ 說話效果會吃掉這段距離（外框・光暈最多會往外擴散約寬度的 6 倍）。
 *   需要的邊距顯示在預設集編輯的距離欄位（`requiredSpeakMargin`）。
 */
export const DEFAULT_OPTIONS: GenerateOptions = {
  alwaysShow: true,
  left: 0,
  bottom: 0,
  anchorX: DEFAULT_ANCHOR_X,
  anchorY: DEFAULT_ANCHOR_Y,
  width: undefined,
  dimWhenQuiet: false,
  hideWhenAway: false,
  speak: DEFAULT_SPEAK,
  nameLabel: DEFAULT_NAME_LABEL,
}
