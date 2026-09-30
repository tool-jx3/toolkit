import {
  DIM_BRIGHTNESS_PCT,
  resolveAnchors,
  resolveDisplayName,
  type AnchorX,
  type AnchorY,
  type GenerateOptions,
  type NameAlign,
  type NameLabel,
  type SpeakEffect,
  type TachieUser,
} from './types'
import { t } from '../i18n'

/**
 * 組出與 Streamkit 相容的立繪自訂 CSS 的純函式群。
 *
 * 以實際 DOM 為準的前提（以 NAS `season_6/悪手率_蛇王/asset/streamkit_css/` 裡實證過的 CSS 為準）：
 * - 頭像就是 `<img>` 本身。說話時那個 img 會加上 `Voice_avatarSpeaking__`（帶雜湊）class。
 *   → 選擇器用 `[class*="Voice_..."]` 前綴比對，Streamkit 更新 class 名稱也不怕。
 * - 圖片 URL 含有 `avatars/<userId>` → 以 `img[src*="avatars/<id>"]` 認人。
 * - 立繪圖片以 data URI 嵌進 `:root` 的自訂屬性（不需外部主機・避開 CSP・不會失效）。
 *
 * 兩種繪製方式：
 * - 常駐顯示（standalone）：只用 `body::after` 一個元素繪製。不論在不在通話中都出現在同一位置。
 *   說話以 `body:has(img[src*="avatars/<id>"][class*="Voice_avatarSpeaking__"])::after` 偵測。**一人＝一個來源。**
 * - 合併（combined）：逐人以 `content` 替換 Streamkit 的實際 img。一個來源可以顯示多人，但只在通話中顯示。
 *
 * 「說話時的動作」可以個別開關 外框（outline）／閃爍（blink）／彈跳（bounce）。
 * 「把安靜的人調暗」（dimWhenQuiet）會把沒說話的立繪調暗，只在說話時恢復亮度。
 *
 * 位置以**距錨點（左/中央/右 × 上/中央/下）的距離**輸出（{@link placeTachie}）。
 * 置中會用到 `transform`，可能與說話效果・名字條的 `transform` 衝突。
 * → **輸出 `transform` 的地方一定要經過 {@link composeTransform}**（程式碼層面的不變條件）。
 *
 * 名字（任意文字）以 `body::before` 的 `content` 繪製。Streamkit 的實際元素（`Voice_name__`）
 * 已經隱藏，所以不會出現 Discord 的帳號名稱，畫面上**只會有這裡輸出的名字**。
 * → 偽元素 立繪＝`::after`／名字＝`::before` 兩個就用完了（一個來源 = 一張立繪 + 一個名字）。
 *
 * 輸出 CSS 裡給人看的註解（TRPG Toolkit 收錄版）：在產生當下以 {@link cssNote} 取目前語言的譯文；
 * 選擇器、屬性與 Streamkit 的 class 名稱不經過字典，原樣輸出。
 */

/**
 * 輸出 CSS 註解用的譯文。萬一譯文裡有 `*` 緊接 `/` 的序列，就把它拆開，
 * 免得註解提早結束（同 {@link cssComment} 的做法）。
 */
function cssNote(key: string, ...args: Array<string | number>): string {
  return t(key, ...args).replace(/\*\//g, '* /')
}

type Effect = 'jump' | 'light' | 'blink'

/** 把 data URI／URL 安全地包成 CSS 的 `url("...")`。 */
function cssUrl(rawUrl: string): string {
  const escaped = rawUrl
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, '')
  return `url("${escaped}")`
}

/** 把 ID 正規化成只有數字，才能用在自訂屬性名稱裡。 */
function safeId(id: string): string {
  return id.replace(/[^0-9]/g, '')
}

/** 讓外框・光暈的顏色變安全（預期外的值一律改成白色，不讓 CSS 壞掉）。 */
export function safeColor(color: string): string {
  const c = color.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return c
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(c)) return c
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/i.test(c)) return c
  return '#FFFFFF'
}

/**
 * 把任意文字安全地包成 CSS 的字串常值（給 `content` 用）。
 * 跳脫 `"` `\`，換行・控制字元改成空白（`content` 不能有多行）。
 */
export function cssString(text: string): string {
  const escaped = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `"${escaped}"`
}

/**
 * 把換行・控制字元改成空白、變成一行（與 {@link cssString} 相同的正規化，但不加引號也不跳脫）。
 * 讓預覽端能以「實際寫進輸出的字串」做同樣的判斷。
 */
export function flattenText(text: string): string {
  return cssString(text)
    .slice(1, -1)
    .replace(/\\(["\\])/g, '$1')
}

/**
 * 把任意文字變成可以放進 CSS 註解的形式。拆開 `*` 緊接 `/` 的序列，
 * 防止註解提早結束（＝後面的內容被當成有效的 CSS 解讀）。
 */
export function cssComment(text: string): string {
  return flattenText(text).replace(/\*\//g, '* /')
}

/** 不加引號的通用字族（希望被當成關鍵字解讀的那些）。 */
const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

/**
 * 讓字型名稱變安全。去掉 `;` `{` `}` `(` `)` 等字元防止 CSS 注入之後，
 * **通用字族以外一律加上引號**。
 *
 * 不加引號的識別字不能以數字開頭，也不能含 `.`，所以像「07 開頭的日文字型」
 * 這種數字開頭的字型名稱不加引號的話，**整條宣告會被剖析器丟掉，默默地沒有效果**。
 * 加上引號就能把任意字串當成字族名稱（同時也避免被誤認成 `inherit` 等關鍵字）。
 *
 * 結果為空時回傳 `''`（＝不輸出 font-family，沿用頁面的字型）。
 */
export function safeFontFamily(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, '') // eslint-disable-line no-control-regex
    .replace(/[^A-Za-z0-9 ,._\-\u0080-\uFFFF]/g, '')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part !== '')
    .map((part) => (GENERIC_FONT_FAMILIES.has(part.toLowerCase()) ? part : cssString(part)))
    .join(', ')
}

/**
 * 把顏色＋不透明度（%）轉成 CSS 色彩。`#rgb`／`#rrggbb` 展開成 `rgba()`，
 * 其他（`rgb()`／`rgba()`／`#rrggbbaa`）忽略不透明度，原樣使用。
 */
export function cssColorWithOpacity(color: string, opacityPct: number): string {
  const c = safeColor(color)
  const a = Math.min(100, Math.max(0, opacityPct)) / 100
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (!m) return c
  const hex = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`
}

/** 把 px 值寫成 CSS（四捨五入到小數第 2 位，整數維持原樣）。 */
function px(v: number): string {
  return `${Math.round(v * 100) / 100}px`
}

/** 在 `50%` 加上 px 偏移的位置值。偏移為 0 時維持 `50%`（不輸出 calc）。 */
function centerValue(v: number): string {
  const n = Math.round(v * 100) / 100
  if (n === 0) return '50%'
  return `calc(50% ${n > 0 ? '+' : '-'} ${Math.abs(n)}px)`
}

/**
 * **輸出 `transform` 的地方一定要經過這個函式**（程式碼層面的不變條件）。
 *
 * 把置中的 translate 與說話效果的 translate 寫在不同的 `transform` 宣言・不同的 keyframe 裡，
 * **後寫的會蓋掉先寫的**（置中 + 彈跳時立繪會飛到畫面邊緣）。
 * 把合成集中在這一處，加片段的一方只需要在意順序與重複。
 *
 * 回傳空字串表示「不輸出 `transform` 宣言」（避免吐出 `transform: ;`）。
 */
export function composeTransform(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => p != null && p !== '').join(' ')
}

/**
 * 單一軸的錨點性質。位置屬性一旦決定，偏移的正負號與 translate 的方向也跟著決定。
 *
 * `handle`（抓取點）以**畫面座標**的比例表示：水平 0 = 左緣／1 = 右緣，
 * 垂直 0 = 下緣／1 = 上緣。`natural` 是該錨點要對齊自己的哪裡
 * （`right` 錨點就是自己的右緣 = 1）。
 */
interface AxisSpec {
  prop: 'left' | 'right' | 'top' | 'bottom'
  /** 中央錨點（以 `calc(50% ± D)` 輸出）。 */
  center: boolean
  axis: 'X' | 'Y'
  /** 這個錨點的自然抓取點（畫面座標的比例）。 */
  natural: number
}

function xSpec(a: AnchorX): AxisSpec {
  if (a === 'right') return { prop: 'right', center: false, axis: 'X', natural: 1 }
  if (a === 'center') return { prop: 'left', center: true, axis: 'X', natural: 0.5 }
  return { prop: 'left', center: false, axis: 'X', natural: 0 }
}

function ySpec(b: AnchorY): AxisSpec {
  if (b === 'top') return { prop: 'top', center: false, axis: 'Y', natural: 1 }
  // 垂直中央以 `bottom` 為基準（與 `bottom` 錨點一樣維持「正的偏移 = 往上」）。
  if (b === 'middle') return { prop: 'bottom', center: true, axis: 'Y', natural: 0.5 }
  return { prop: 'bottom', center: false, axis: 'Y', natural: 0 }
}

/**
 * 單一軸的配置。以**轉成 CSS 字串之前的原始值**保存
 * ——輸出 CSS 用 px，預覽用相對於基準 1920×1080 的 %，
 * 只有單位不同，座標的決定方式相同。
 */
export interface AxisPlacement {
  /** 使用的位置屬性。 */
  prop: 'left' | 'right' | 'top' | 'bottom'
  /** 寫進位置屬性的距離（px）。`fromCenter` 時是「加在中央 `50%` 上的量」。 */
  distance: number
  /** 是否以 `calc(50% ± distance)` 的形式輸出（中央錨點）。 */
  fromCenter: boolean
  axis: 'X' | 'Y'
  /** translate 的比例（%）。0 表示不需要 translate。 */
  translatePct: number
}

/** 水平與垂直的配置。 */
export interface Placement {
  x: AxisPlacement
  y: AxisPlacement
}

/**
 * 決定單一軸的配置。**座標系的分支只封閉在這個函式裡**
 * （用哪個位置屬性／偏移的正負號是否反轉／translate 的方向）。
 *
 * @param spec     由錨點決定的軸性質
 * @param distance 立繪「距錨點的距離」（px）
 * @param offset   相對於立繪的**畫面座標**偏移（px）。水平正值往右／垂直正值往上。立繪本身為 0
 * @param handle   要對齊自己的哪裡（畫面座標的比例）。立繪是 `spec.natural`
 * @param boxSize  移動抓取點時作為基準的框大小（px）＝立繪寬度。與自然位置相同時沒有作用
 */
function axisPlacement(
  spec: AxisSpec,
  distance: number,
  offset: number,
  handle: number,
  boxSize: number,
): AxisPlacement {
  // 位置屬性若是「與畫面座標正方向反向量測」，偏移的正負號就要反轉。
  // （`right` 錨點「往右移」是**減少**距右緣距離的方向）
  const flip = spec.prop === 'right' || spec.prop === 'top'
  // 把抓取點換算成從位置屬性自己那一邊算起的比例。
  const fromProp = flip ? 1 - handle : handle
  const naturalFromProp = flip ? 1 - spec.natural : spec.natural
  // 偏離自然位置多少，就依立繪尺寸移動多少（在自然位置時 boxSize 會消掉）。
  const d = distance + (flip ? -offset : offset) + (fromProp - naturalFromProp) * boxSize
  // 位置屬性與 translate 的正方向同向時，抓取點的拉回量是負的。
  const sign = spec.prop === 'left' || spec.prop === 'top' ? -1 : 1
  return {
    prop: spec.prop,
    distance: Math.round(d * 100) / 100,
    fromCenter: spec.center,
    axis: spec.axis,
    translatePct: Math.round(sign * fromProp * 10000) / 100,
  }
}

/**
 * 立繪的配置。距離是**距所選錨點的距離**（`right` 是距右緣，`top` 是距上緣）。
 * 中央（`center`/`middle`）時是「相對中央的偏移量」，**正值往右／往上**。
 *
 * 立繪的抓取點就是錨點的自然位置（自己對應的那一邊），
 * 所以產生的 translate **只有置中的部分**（＝放在 `speak-jump` 前面也安全）。
 */
export function placeTachie(anchors: { x: AnchorX; y: AnchorY }, x: number, y: number): Placement {
  const sx = xSpec(anchors.x)
  const sy = ySpec(anchors.y)
  return {
    x: axisPlacement(sx, x, 0, sx.natural, 0),
    y: axisPlacement(sy, y, 0, sy.natural, 0),
  }
}

/** 字幕條的對齊 → 抓取點（畫面座標的比例。0 = 左緣／0.5 = 中央／1 = 右緣）。 */
export const ALIGN_HANDLE: Record<NameAlign, number> = { left: 0, center: 0.5, right: 1 }

/**
 * 名字標籤的配置。**跟著立繪的錨點走**（經過與立繪相同的軸邏輯）。
 *
 * 名字放在「立繪的位置 + 畫面座標的偏移」。距離以錨點為基準，所以
 * **右錨點時 `offsetX` 的正負號、上錨點時 `offsetY` 的正負號會反轉**
 * （「比立繪更往右」是減少距右緣距離的方向）。這部分由 {@link axisPlacement} 吸收。
 *
 * 垂直方向對齊立繪**錨點那一側的邊**（下錨點就是腳邊，上錨點就是頭頂那側）。
 * 立繪繪製後的高度無法從 CSS 取得，所以垂直方向不能移動抓取點。
 *
 * @param handleX 字幕條對齊用的抓取點。不知道寬度時傳 {@link naturalHandleX}
 * @param boxWidth 立繪寬度（px）。抓取點與自然位置相同時不會出現在結果裡
 */
export function placeNameLabel(
  anchors: { x: AnchorX; y: AnchorY },
  tachie: { x: number; y: number },
  offset: { dx: number; dy: number },
  handleX: number,
  boxWidth: number,
): Placement {
  const sx = xSpec(anchors.x)
  const sy = ySpec(anchors.y)
  return {
    x: axisPlacement(sx, tachie.x, offset.dx, handleX, boxWidth),
    // 垂直方向不移動抓取點（因為不知道立繪的高度）。
    y: axisPlacement(sy, tachie.y, offset.dy, sy.natural, 0),
  }
}

/** 錨點的自然抓取點（不知道字幕條寬度時，對齊方式的退路）。 */
export function naturalHandleX(a: AnchorX): number {
  return xSpec(a).natural
}

/** {@link Placement} 的結果。位置宣言與 translate 片段。 */
export interface PositionParts {
  /** `left`/`right`/`top`/`bottom` 的宣言（無縮排・含 `;`・依**水平 → 垂直**的順序）。 */
  decls: string[]
  /**
   * translate 片段。立繪的情況**只有置中的部分**，
   * **放在 {@link composeTransform} 的最前面**（不排在說話效果的 translate 之前，
   * 效果的位移就會動到置中的基準）。
   */
  transforms: string[]
}

/** 把 {@link Placement} 轉成 px 的 CSS 宣言 + translate 片段（給輸出 CSS 用）。 */
export function placementDecls(p: Placement): PositionParts {
  const decl = (a: AxisPlacement) =>
    `${a.prop}: ${a.fromCenter ? centerValue(a.distance) : px(a.distance)};`
  const translate = (a: AxisPlacement) =>
    a.translatePct === 0 ? null : `translate${a.axis}(${a.translatePct}%)`
  return {
    decls: [decl(p.x), decl(p.y)],
    transforms: [translate(p.x), translate(p.y)].filter((t): t is string => t != null),
  }
}

/** 文字描邊（8 個方向的 text-shadow）。 */
function textOutline(color: string, width: number): string {
  const c = safeColor(color)
  const w = width > 0 ? width : 1
  const offsets: Array<[number, number]> = [
    [w, 0],
    [-w, 0],
    [0, w],
    [0, -w],
    [w, w],
    [w, -w],
    [-w, w],
    [-w, -w],
  ]
  return offsets.map(([x, y]) => `${x}px ${y}px 0 ${c}`).join(', ')
}

/**
 * 名字標籤 `body::before` 的區塊。名字為空，或 `show` 為 false 時回傳 `null`（＝不輸出）。
 * 位置以距**與立繪相同的錨點**的距離輸出（{@link placeNameLabel}）。
 */
function nameBlock(user: TachieUser, options: GenerateOptions): string | null {
  const label: NameLabel = options.nameLabel
  const text = resolveDisplayName(user)
  if (!label.show || text === '') return null

  const { left, bottom, width, hideWhenAway, imageNaturalWidth } = options
  const anchors = resolveAnchors(options)
  const font = safeFontFamily(label.fontFamily)
  // 對齊需要框的寬度。有指定寬度就用它，原尺寸時用應用程式量到的實際尺寸。
  // 寬度 0 以下等於「沒有框」，不拿來當基準。
  const explicitWidth = width != null && width > 0 ? width : undefined
  const measured =
    explicitWidth == null && imageNaturalWidth != null && imageNaturalWidth > 0
  const boxWidth = explicitWidth ?? (measured ? imageNaturalWidth : undefined)
  // 背景（字幕條）配合「文字寬度」的模式。為了讓字幕條縮起來不輸出 width，
  // 相對於立繪的對位改用 transform 錨定。
  const hug = label.background && label.fit === 'text'
  // 只有字幕條縮起來時，才用立繪寬度依對齊方式移動抓取點。
  // 不知道寬度時退回**錨點的自然抓取點**（沒有寬度也能成立的唯一選擇。
  // 左錨點就是靠左緣＝與 002 相同的行為，右錨點就是靠右緣）。
  const shifted = hug && boxWidth != null
  const handleX = shifted ? ALIGN_HANDLE[label.align] : naturalHandleX(anchors.x)
  const pos = placementDecls(
    placeNameLabel(
      anchors,
      { x: left, y: bottom },
      { dx: label.offsetX, dy: label.offsetY },
      handleX,
      boxWidth ?? 0,
    ),
  )
  // 這裡也會輸出 transform，所以要經過 composeTransform（→ 不變條件）。
  const transform = composeTransform(...pos.transforms)
  const pad = label.background && (label.backgroundPadX > 0 || label.backgroundPadY > 0)

  const decls = [
    `  content: ${cssString(text)};`,
    `  position: fixed;`,
    ...pos.decls.map((d) => `  ${d}`),
    // 立繪（::after）比 ::before 晚繪製，所以重疊時要把名字放到前面。
    `  z-index: 1;`,
    `  display: ${hideWhenAway ? 'none' : 'block'};`,
    // 沒有寬度時對齊沒有意義（沒有寬度的 ::before 會剛好縮成文字寬度）。
    ...(!hug && boxWidth != null
      ? [`  width: ${boxWidth}px;`, `  text-align: ${label.align};`]
      : []),
    ...(transform ? [`  transform: ${transform};`] : []),
    // 背景（字幕條）
    ...(label.background
      ? [
          `  background: ${cssColorWithOpacity(label.backgroundColor, label.backgroundOpacity)};`,
          ...(pad ? [`  padding: ${label.backgroundPadY}px ${label.backgroundPadX}px;`] : []),
          ...(label.backgroundRadius > 0
            ? [`  border-radius: ${label.backgroundRadius}px;`]
            : []),
          // 加了留白也不超出指定寬度（不依賴 Streamkit 那邊的預設值）。
          ...(pad && !hug && boxWidth != null ? [`  box-sizing: border-box;`] : []),
        ]
      : []),
    ...(font ? [`  font-family: ${font};`] : []),
    // 0 以下只會讓名字消失，所以捨入成 1px（把輸入欄清空會變成 0）。
    `  font-size: ${Math.max(1, label.fontSize)}px;`,
    `  font-weight: ${label.bold ? 700 : 400};`,
    `  color: ${safeColor(label.color)};`,
    // 寬度 0 的描邊不輸出（開著但粗細設 0 就消失，這樣最直觀）。
    ...(label.outline && label.outlineWidth > 0
      ? [`  text-shadow: ${textOutline(label.outlineColor, label.outlineWidth)};`]
      : []),
    `  line-height: 1.2;`,
    `  white-space: pre;`,
    `  pointer-events: none;`,
  ]
  // 只有真的用到實測寬度時才加注記（對齊錨點自然位置的字幕條等沒用到的情況就不寫）。
  const usesBoxWidth =
    boxWidth != null && (!hug || (shifted && handleX !== naturalHandleX(anchors.x)))
  const header =
    measured && usesBoxWidth
      ? `/* ${cssNote('css.name')}
   ${cssNote('css.nameMeasured', String(boxWidth))} */`
      : `/* ${cssNote('css.name')} */`
  return `${header}\nbody::before {\n${decls.join('\n')}\n}`
}

/**
 * 彈跳（transform 版）。**在每個步驟前面加上置中的 translate**——
 * keyframe 的 `transform` 會整個取代元素的 `transform`，不織進去的話
 * 只有動畫期間置中會失效、立繪會飛走（spec 的驗收條件）。
 */
const KEYFRAMES_JUMP_TRANSFORM = (jumpPx: number, centering: string[]) => {
  const at = (v: string) => composeTransform(...centering, v)
  return `@keyframes speak-jump {
  0% { transform: ${at('translateY(0)')}; }
  50% { transform: ${at(`translateY(-${jumpPx}px)`)}; }
  100% { transform: ${at('translateY(0)')}; }
}`
}

const KEYFRAMES_JUMP_BOTTOM = (jumpPx: number) => `@keyframes speak-jump {
  0% { bottom: 0px; }
  50% { bottom: ${jumpPx}px; }
  100% { bottom: 0px; }
}`

const KEYFRAMES_LIGHT = (color: string, width: number) => {
  const c = safeColor(color)
  // 寬度 w 的外框＝4 個方向 ±w 的位移陰影。光暈以半徑 w↔4w 脈動（預設 w=2 即原本的 2↔8）。
  const w = width > 0 ? width : 1
  const shadows = (blur: number) =>
    `drop-shadow(0 0 ${blur}px ${c}) drop-shadow(${w}px ${w}px 0px ${c}) drop-shadow(-${w}px -${w}px 0px ${c}) drop-shadow(-${w}px ${w}px 0px ${c}) drop-shadow(${w}px -${w}px 0px ${c})`
  return `@keyframes speak-light {
  0% { filter: ${shadows(w)}; }
  50% { filter: ${shadows(4 * w)}; }
  100% { filter: ${shadows(w)}; }
}`
}

const KEYFRAMES_BLINK = `@keyframes speak-blink {
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
}`

/** 列出啟用的效果。為空（3 種全關）時不輸出說話效果＝靜止。 */
function activeEffects(speak: SpeakEffect): Effect[] {
  const effects: Effect[] = []
  if (speak.bounce && speak.jumpPx > 0) effects.push('jump')
  if (speak.outline) effects.push('light')
  if (speak.blink) effects.push('blink')
  return effects
}

/** 組出 `animation:` 的值。 */
function animationValue(effects: Effect[], durationMs: number): string {
  return effects
    .map((e) => `${durationMs}ms infinite alternate ease-in-out speak-${e}`)
    .join(',')
}

/** `:root` 的變數區塊（嵌入立繪的 data URI）。 */
function rootBlock(users: TachieUser[]): string {
  const lines = users.flatMap((u) => {
    const id = safeId(u.id)
    // 備忘名稱直接放進去的話，可以關閉註解、插入任意 CSS（以 cssComment 擋掉）。
    const label = u.name ? `  /* ${cssComment(u.name)} (${id}) */` : `  /* ${id} */`
    return [label, `  --img-stand-url-${id}: ${cssUrl(u.imageUrl)};`]
  })
  return `:root {\n${lines.join('\n')}\n}`
}

/** 依包含的效果，收集要加上的 keyframe 定義。 */
function keyframeBlocks(
  effects: Effect[],
  speak: SpeakEffect,
  jumpKind: 'transform' | 'bottom',
  /** 置中的 translate（加在 transform 版彈跳的前面）。 */
  centering: string[] = [],
): string[] {
  const blocks: string[] = []
  if (effects.includes('jump')) {
    blocks.push(
      jumpKind === 'transform'
        ? KEYFRAMES_JUMP_TRANSFORM(speak.jumpPx, centering)
        : KEYFRAMES_JUMP_BOTTOM(speak.jumpPx),
    )
  }
  if (effects.includes('light')) blocks.push(KEYFRAMES_LIGHT(speak.outlineColor, speak.outlineWidth))
  if (effects.includes('blink')) blocks.push(KEYFRAMES_BLINK)
  return blocks
}

/**
 * 立繪 body::after 的繪製尺寸（px）。背景圖片方式的框高不會自動決定，所以在這裡寫死。
 * 實際尺寸（寬・高）缺任一個／為 0 以下時回傳 null（＝呼叫端退回原本的 content 方式）。
 * 有指定寬度（> 0）就維持長寬比縮放成那個寬度，沒有就用實際尺寸。
 */
export function tachieBoxSize(
  width: number | undefined,
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
): { width: number; height: number } | null {
  if (naturalWidth == null || naturalWidth <= 0 || naturalHeight == null || naturalHeight <= 0) {
    return null
  }
  const w = width != null && width > 0 ? width : naturalWidth
  const h = Math.max(1, Math.round((w * naturalHeight) / naturalWidth))
  return { width: w, height: h }
}

/**
 * 常駐顯示（standalone）。以 `body::after` 一個元素繪製一個人。一人＝一個瀏覽器來源。
 */
export function generateStandaloneCss(user: TachieUser, options: GenerateOptions): string {
  const id = safeId(user.id)
  const { left, bottom, width, dimWhenQuiet, hideWhenAway, speak, imageNaturalWidth, imageNaturalHeight } =
    options
  const effects = activeEffects(speak)
  // 位置以錨點為基準（未指定時為左下＝與原本的輸出一致）。置中的 translate 在這裡取得，
  // 靜止時的 transform 與 speak-jump **傳入同一份**（→ composeTransform 的不變條件）。
  const pos = placementDecls(placeTachie(resolveAnchors(options), left, bottom))
  const staticTransform = composeTransform(...pos.transforms)

  // 只有實際尺寸（寬・高）都齊全時才用背景圖片方式繪製（框的大小 = 畫出來的圖的大小）。
  // 不齊全就退回原本的 content 方式（讀取中・讀不到的 URL 也能維持顯示）。
  const box = tachieBoxSize(width, imageNaturalWidth, imageNaturalHeight)

  const afterDecls = box
    ? [
        `  content: "";`,
        `  position: fixed;`,
        ...pos.decls.map((d) => `  ${d}`),
        `  display: ${hideWhenAway ? 'none' : 'block'};`,
        ...(staticTransform ? [`  transform: ${staticTransform};`] : []),
        `  width: ${box.width}px;`,
        `  height: ${box.height}px;`,
        `  background-image: var(--img-stand-url-${id});`,
        `  background-size: contain;`,
        `  background-repeat: no-repeat;`,
        `  background-position: center;`,
        ...(dimWhenQuiet ? [`  filter: brightness(${DIM_BRIGHTNESS_PCT}%);`] : []),
      ]
    : [
        `  content: var(--img-stand-url-${id});`,
        `  position: fixed;`,
        ...pos.decls.map((d) => `  ${d}`),
        // 設為不在通話中時隱藏的話，預設不顯示（只在在場時由下面的規則顯示）。
        `  display: ${hideWhenAway ? 'none' : 'block'};`,
        ...(staticTransform ? [`  transform: ${staticTransform};`] : []),
        ...(width != null ? [`  width: ${width}px;`] : []),
        // 把安靜的人調暗：沒說話時預設調暗
        ...(dimWhenQuiet ? [`  filter: brightness(${DIM_BRIGHTNESS_PCT}%);`] : []),
      ]

  const afterHeader = box
    ? `/* ${cssNote('css.tachie')}
   ${cssNote('css.tachieMeasured', box.width, box.height)} */`
    : `/* ${cssNote('css.tachie')} */`

  const parts: string[] = [
    rootBlock([user]),
    `/* ${cssNote('css.single1')}
   ${cssNote('css.single2')} */`,
    `body, #root {\n  overflow: hidden !important;\n}`,
    `${afterHeader}\nbody::after {\n${afterDecls.join('\n')}\n}`,
  ]

  // 名字（任意文字）。只有顯示開啟而且名字不是空的時候，才加上 body::before。
  const nameCss = nameBlock(user, options)
  if (nameCss) parts.push(nameCss)

  // 說話中的規則：有效果，或需要解除調暗（dim）時才輸出
  if (effects.length > 0 || dimWhenQuiet) {
    const speakingDecls: string[] = []
    // outline 動畫帶有 filter 時亮度會由它恢復，其他情況要明確恢復。
    if (dimWhenQuiet && !effects.includes('light')) {
      speakingDecls.push(`  filter: brightness(100%);`)
    }
    if (effects.length > 0) {
      speakingDecls.push(`  animation: ${animationValue(effects, speak.durationMs)};`)
    }
    parts.push(
      `/* ${cssNote('css.speaking')} */
body:has(img[src*="avatars/${id}"][class*="Voice_avatarSpeaking__"])::after {
${speakingDecls.join('\n')}
}`,
    )
  }

  // 不在通話中時隱藏：本人連線中時實際的 img 會出現在 DOM 裡（即使 display:none，:has() 也會比對到）。
  // 偵測這一點，只在在場（通話中）時顯示立繪。→ 不在通話中時不顯示。
  if (hideWhenAway) {
    // 名字也跟立繪一起出現・消失（::before 寫在前面＝::after 那邊的形式維持原樣）。
    const selectors = [
      ...(nameCss ? [`body:has(img[src*="avatars/${id}"])::before`] : []),
      `body:has(img[src*="avatars/${id}"])::after`,
    ]
    parts.push(
      `/* ${cssNote(nameCss ? 'css.hideAwayName' : 'css.hideAway')} */
${selectors.join(',\n')} {
  display: block;
}`,
    )
  }

  parts.push(
    `img {\n  display: none !important;\n}`,
    // 只有顯示名字時才注記「帳號名稱已隱藏」
    // （名字關閉時的輸出維持與 001 相同）。
    `${
      nameCss ? `/* ${cssNote('css.hideAccountName')} */\n` : ''
    }[class*="Voice_name__"], [class*="Voice_user__"] {\n  display: none !important;\n}`,
    ...keyframeBlocks(effects, speak, 'transform', pos.transforms),
  )

  return parts.join('\n\n') + '\n'
}

/**
 * 合併（combined）。逐人替換 Streamkit 的實際 img。一個來源可以顯示多人，但只在通話中顯示。
 *
 * **不解讀錨點（`anchorX`/`anchorY`）**（不在 003 的範圍內。是 UI 不會呼叫、保留下來的程式碼）。
 * 位置以 flex 容器的 padding 輸出，所以 `left`/`bottom` 一律當成距左下的距離。
 */
export function generateCombinedCss(users: TachieUser[], options: GenerateOptions): string {
  const { left, bottom, width, dimWhenQuiet, speak } = options
  const effects = activeEffects(speak)

  const parts: string[] = [
    rootBlock(users),
    `/* ${cssNote('css.combined')} */`,
    `body, #root {\n  overflow: hidden !important;\n}`,
    `[class*="Voice_voiceStates__"] {\n  display: flex;\n  align-items: flex-end;\n  justify-content: flex-start;\n  padding-left: ${left}px;\n  padding-bottom: ${bottom}px;\n}`,
    `[class*="Voice_voiceState__"] {\n  height: auto;\n  margin-bottom: 0px;\n}`,
    `[class*="Voice_name__"], [class*="Voice_user__"] {\n  display: none;\n}`,
    `/* ${cssNote('css.combinedHideAll')} */\nimg {\n  display: none;\n}`,
  ]

  // 把安靜的人調暗：所有頭像預設調暗
  if (dimWhenQuiet) {
    parts.push(`[class*="Voice_avatar__"] {\n  filter: brightness(${DIM_BRIGHTNESS_PCT}%);\n}`)
  }

  // 說話中的規則
  if (effects.length > 0 || dimWhenQuiet) {
    const speakingDecls: string[] = [`  position: relative;`]
    if (dimWhenQuiet && !effects.includes('light')) {
      speakingDecls.push(`  filter: brightness(100%);`)
    }
    if (effects.length > 0) {
      speakingDecls.push(`  animation: ${animationValue(effects, speak.durationMs)};`)
    }
    parts.push(`[class*="Voice_avatarSpeaking__"] {\n${speakingDecls.join('\n')}\n}`)
  }

  for (const u of users) {
    const id = safeId(u.id)
    const decls = [
      `  content: var(--img-stand-url-${id});`,
      `  display: block;`,
      `  width: ${width != null ? `${width}px` : 'auto'};`,
      `  height: auto;`,
      `  border-radius: 0;`,
      `  border: none;`,
    ]
    const label = u.name ? `/* ${cssComment(u.name)} */\n` : ''
    parts.push(`${label}img[src*="avatars/${id}"] {\n${decls.join('\n')}\n}`)
  }

  parts.push(...keyframeBlocks(effects, speak, 'bottom'))

  return parts.join('\n\n') + '\n'
}

/**
 * `generate` 的統一入口（依 plan.md 的 `generateCss(users, options)`）。
 * - `alwaysShow` 而且 1 人 → 常駐顯示（body::after）
 * - 其他 → 合併（逐 img 替換／只在通話中顯示）
 *   對多人指定 `alwaysShow` 時無法常駐顯示，所以回傳附注記註解的合併版。
 */
export function generateCss(users: TachieUser[], options: GenerateOptions): string {
  if (users.length === 0) {
    return `/* ${cssNote('css.noUsers')} */\n`
  }
  if (options.alwaysShow && users.length === 1) {
    return generateStandaloneCss(users[0], options)
  }
  if (options.alwaysShow && users.length > 1) {
    const note =
      `/* ${cssNote('css.combinedNote1')}\n` +
      `   ${cssNote('css.combinedNote2')} */\n\n`
    return note + generateCombinedCss(users, options)
  }
  return generateCombinedCss(users, options)
}
