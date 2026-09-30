import {
  DEFAULT_ANCHOR_X,
  DEFAULT_ANCHOR_Y,
  DEFAULT_NAME_LABEL,
  DEFAULT_OPTIONS,
  DEFAULT_SPEAK,
  EMPTY_SELECTION,
  type AnchorX,
  type AnchorY,
  type AppState,
  type AppUser,
  type NameAlign,
  type NameFit,
  type NameLabel,
  type Pairing,
  type Preset,
  type Selection,
  type SpeakEffect,
} from './types'

/**
 * 設定的保存。data URI 動輒數 MB，放不進 URL 分享，所以只用 localStorage
 * （因為 data URI 的大小，不採用 URL 保存）。
 *
 * 儲存格式是新資料模型 `{ users: AppUser[]; presets: Preset[]; pairings: Pairing[] }`。
 * `normalizeState` 是純函式且具決定性（不用亂數／randomUUID／Date.now）。需要產生 id 的地方
 * 由 UI 端使用 `newId()`。
 *
 * （TRPG Toolkit 收錄版：儲存鍵與格式都與上游相同，上游的存檔可以直接讀。）
 */

const STORAGE_KEY = 'obs-tachie-generator:v1'

function emptyState(): AppState {
  return { users: [], presets: [], pairings: [], selection: { ...EMPTY_SELECTION } }
}

/** 驗證作業中的選擇。指向不存在的 userId／presetId 時改成 null（純函式・具決定性）。 */
function normalizeSelection(
  raw: unknown,
  userIds: Set<string>,
  presetIds: Set<string>,
): Selection {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const userId = typeof s.userId === 'string' && userIds.has(s.userId) ? s.userId : null
  const presetId = typeof s.presetId === 'string' && presetIds.has(s.presetId) ? s.presetId : null
  return { userId, presetId }
}

/**
 * 是否至少構成一個使用者（`id` 與 `name` 是字串）。
 * 不因選填欄位（`displayName`）的型別不符就丟掉整個使用者
 * ——與預設集那邊一樣，採「只把壞掉的欄位改回預設」的方針。
 */
function isAppUser(v: unknown): v is AppUser {
  if (typeof v !== 'object' || v === null) return false
  const u = v as Record<string, unknown>
  return typeof u.id === 'string' && typeof u.name === 'string'
}

function isPairing(v: unknown): v is Pairing {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return typeof p.userId === 'string' && typeof p.presetId === 'string'
}

/** 以預設值補齊說話效果（缺漏・型別不符時用預設值）。 */
function normalizeSpeak(raw: unknown): SpeakEffect {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    bounce: typeof s.bounce === 'boolean' ? s.bounce : DEFAULT_SPEAK.bounce,
    jumpPx: typeof s.jumpPx === 'number' ? s.jumpPx : DEFAULT_SPEAK.jumpPx,
    outline: typeof s.outline === 'boolean' ? s.outline : DEFAULT_SPEAK.outline,
    outlineColor:
      typeof s.outlineColor === 'string' ? s.outlineColor : DEFAULT_SPEAK.outlineColor,
    outlineWidth:
      typeof s.outlineWidth === 'number' ? s.outlineWidth : DEFAULT_SPEAK.outlineWidth,
    blink: typeof s.blink === 'boolean' ? s.blink : DEFAULT_SPEAK.blink,
    durationMs: typeof s.durationMs === 'number' ? s.durationMs : DEFAULT_SPEAK.durationMs,
  }
}

/** 以預設值補齊名字標籤（缺漏・型別不符時用預設值＝舊資料為不顯示）。 */
function normalizeNameLabel(raw: unknown): NameLabel {
  const n = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const align =
    n.align === 'left' || n.align === 'center' || n.align === 'right'
      ? (n.align as NameAlign)
      : DEFAULT_NAME_LABEL.align
  return {
    show: typeof n.show === 'boolean' ? n.show : DEFAULT_NAME_LABEL.show,
    offsetX: typeof n.offsetX === 'number' ? n.offsetX : DEFAULT_NAME_LABEL.offsetX,
    offsetY: typeof n.offsetY === 'number' ? n.offsetY : DEFAULT_NAME_LABEL.offsetY,
    fontSize: typeof n.fontSize === 'number' ? n.fontSize : DEFAULT_NAME_LABEL.fontSize,
    fontFamily: typeof n.fontFamily === 'string' ? n.fontFamily : DEFAULT_NAME_LABEL.fontFamily,
    color: typeof n.color === 'string' ? n.color : DEFAULT_NAME_LABEL.color,
    bold: typeof n.bold === 'boolean' ? n.bold : DEFAULT_NAME_LABEL.bold,
    align,
    outline: typeof n.outline === 'boolean' ? n.outline : DEFAULT_NAME_LABEL.outline,
    outlineColor:
      typeof n.outlineColor === 'string' ? n.outlineColor : DEFAULT_NAME_LABEL.outlineColor,
    outlineWidth:
      typeof n.outlineWidth === 'number' ? n.outlineWidth : DEFAULT_NAME_LABEL.outlineWidth,
    background: typeof n.background === 'boolean' ? n.background : DEFAULT_NAME_LABEL.background,
    backgroundColor:
      typeof n.backgroundColor === 'string'
        ? n.backgroundColor
        : DEFAULT_NAME_LABEL.backgroundColor,
    backgroundOpacity:
      typeof n.backgroundOpacity === 'number'
        ? n.backgroundOpacity
        : DEFAULT_NAME_LABEL.backgroundOpacity,
    backgroundPadX:
      typeof n.backgroundPadX === 'number' ? n.backgroundPadX : DEFAULT_NAME_LABEL.backgroundPadX,
    backgroundPadY:
      typeof n.backgroundPadY === 'number' ? n.backgroundPadY : DEFAULT_NAME_LABEL.backgroundPadY,
    backgroundRadius:
      typeof n.backgroundRadius === 'number'
        ? n.backgroundRadius
        : DEFAULT_NAME_LABEL.backgroundRadius,
    fit: n.fit === 'text' || n.fit === 'stretch' ? (n.fit as NameFit) : DEFAULT_NAME_LABEL.fit,
  }
}

/** 驗證一筆預設集並補齊預設值。沒有 `id` 就視為不正確，回傳 null。 */
function normalizePreset(raw: unknown): Preset | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  // 錨點是 003 加入的選填欄位。缺漏・不正確的值改回預設（＝左下），
  // 確保 003 以前的存檔能照舊當成「左下」讀入。
  const anchorX =
    o.anchorX === 'left' || o.anchorX === 'center' || o.anchorX === 'right'
      ? (o.anchorX as AnchorX)
      : DEFAULT_ANCHOR_X
  const anchorY =
    o.anchorY === 'top' || o.anchorY === 'middle' || o.anchorY === 'bottom'
      ? (o.anchorY as AnchorY)
      : DEFAULT_ANCHOR_Y
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : '',
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : '',
    left: typeof o.left === 'number' ? o.left : DEFAULT_OPTIONS.left,
    bottom: typeof o.bottom === 'number' ? o.bottom : DEFAULT_OPTIONS.bottom,
    anchorX,
    anchorY,
    // 寬度 0 以下等同「原尺寸」（不接受會讓立繪消失的指定）。
    width: typeof o.width === 'number' && o.width > 0 ? o.width : undefined,
    dimWhenQuiet:
      typeof o.dimWhenQuiet === 'boolean' ? o.dimWhenQuiet : DEFAULT_OPTIONS.dimWhenQuiet,
    hideWhenAway:
      typeof o.hideWhenAway === 'boolean' ? o.hideWhenAway : DEFAULT_OPTIONS.hideWhenAway,
    speak: normalizeSpeak(o.speak),
    nameLabel: normalizeNameLabel(o.nameLabel),
  }
}

/**
 * 把存檔正規化成新資料模型（純函式・具決定性）。
 * - 新格式（`presets` 是陣列）就驗證後採用。
 * - 其他（舊的 `{ users:[{...imageUrl}], options }` 格式或不正確的資料）回傳空的 state（捨棄舊狀態）。
 * - 壞掉的 pairing（參照不存在的 userId／presetId）在讀入時丟掉。
 * - 重複的 pairing（相同的 userId×presetId）合併成 1 筆。
 * - 作業中 selection 的懸空參照（不存在的 userId／presetId）改成 null。
 */
export function normalizeState(raw: unknown): AppState {
  if (typeof raw !== 'object' || raw === null) return emptyState()
  const obj = raw as Record<string, unknown>
  // 新格式的判定：presets 是陣列（舊格式＝有 options 而沒有 presets，捨棄）。
  if (!Array.isArray(obj.presets)) return emptyState()

  const users: AppUser[] = Array.isArray(obj.users)
    ? obj.users.filter(isAppUser).map((u) => ({
        id: u.id,
        name: u.name,
        displayName: typeof u.displayName === 'string' ? u.displayName : undefined,
      }))
    : []

  const presets: Preset[] = obj.presets
    .map(normalizePreset)
    .filter((p): p is Preset => p !== null)

  const userIds = new Set(users.map((u) => u.id))
  const presetIds = new Set(presets.map((p) => p.id))
  const seen = new Set<string>()
  const pairings: Pairing[] = (Array.isArray(obj.pairings) ? obj.pairings : [])
    .filter(isPairing)
    .filter((p) => userIds.has(p.userId) && presetIds.has(p.presetId))
    .filter((p) => {
      const key = `${p.userId}\u0000${p.presetId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((p) => ({ userId: p.userId, presetId: p.presetId }))

  const selection = normalizeSelection(obj.selection, userIds, presetIds)

  return { users, presets, pairings, selection }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    return normalizeState(JSON.parse(raw))
  } catch {
    return emptyState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 超過容量（data URI 很大時等）就默默放棄。不影響產生本身。
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
