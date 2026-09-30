import { useEffect, useState, type CSSProperties } from 'react'
import {
  ALIGN_HANDLE,
  cssColorWithOpacity,
  flattenText,
  naturalHandleX,
  placeNameLabel,
  placeTachie,
  safeColor,
  safeFontFamily,
  type AxisPlacement,
  type Placement,
} from '../lib/generateCss'
import { resolveAnchors, type Preset } from '../lib/types'
import { t } from '../i18n'

interface Props {
  /** 預覽要呈現的預設集（外觀的來源）。null 時是空的畫面。 */
  preset: Preset | null
  /** 名字顯示開啟時要畫的文字。 */
  nameText?: string
  /**
   * `nameText` 為空時，是否用暫定名字（「名字」）只呈現外觀。
   * ②（編輯預設集＝還沒決定「誰」）時為 true，
   * ③（輸出）時為 **false**：輸出 CSS 在名字為空時不會輸出 `body::before`，
   * 顯示暫定名字會讓預覽與輸出不一致。
   */
  sampleWhenEmpty?: boolean
  /** 標題。預設為「預覽」。 */
  title?: string
}

/** 預覽的基準畫面（假設 OBS 瀏覽器來源為 1920x1080）。 */
const REF_W = 1920
const REF_H = 1080
/** 圖片還沒讀到、寬度又是原尺寸時的暫定寬度（相當於 px）。 */
const FALLBACK_WIDTH = 384

/**
 * 把輸出 CSS 的 px 換成預覽比例的長度（`cqw` = 容器寬度的 1%）。
 * 文字大小・描邊・彈跳高度這類**以長度作用的值**，也要跟位置一樣經過這裡，
 * 否則只有預覽會以實際尺寸繪製，與輸出看起來不一樣。
 */
function cqw(v: number): string {
  return `${(v / REF_W) * 100}cqw`
}

/**
 * 把輸出 CSS 的 {@link AxisPlacement} 換成預覽比例（相對於基準 1920×1080 的 %）的 CSS 值。
 * **座標的決定方式由與輸出 CSS 相同的函式（`placeTachie`／`placeNameLabel`）負責，
 * 這裡只換單位**（讓預覽與輸出不會不一致）。
 */
function axisValue(a: AxisPlacement): string {
  const pct = Math.round((a.distance / (a.axis === 'X' ? REF_W : REF_H)) * 100 * 1000) / 1000
  if (!a.fromCenter) return `${pct}%`
  if (pct === 0) return '50%'
  return `calc(50% ${pct > 0 ? '+' : '-'} ${Math.abs(pct)}%)`
}

/** 把配置換成位置屬性（`left`/`right`/`top`/`bottom`）的 style。 */
function placementStyle(p: Placement): CSSProperties {
  return { [p.x.prop]: axisValue(p.x), [p.y.prop]: axisValue(p.y) } as CSSProperties
}

/**
 * 配置的 translate 片段（置中・字幕條對齊的部分）。translate 的 % 以自己的尺寸為基準，
 * 所以不論 px 或 % 都能直接使用。
 */
function placementTransform(p: Placement): string | undefined {
  const parts = [p.x, p.y]
    .filter((a) => a.translatePct !== 0)
    .map((a) => `translate${a.axis}(${a.translatePct}%)`)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * 仿 OBS 畫面的預覽。在透明棋盤格背景上，以 left/bottom/width 放置預設集的立繪。
 * - 以開關切換**在不在通話中**（常駐顯示，所以不在通話中也會出現立繪）。
 * - **點擊畫面切換 說話⇄安靜**（只在通話中）。說話時播放彈跳／外框・光暈／閃爍。
 * - 寬度為原尺寸（未指定）時，以圖片的**實際尺寸**相對於基準 1920 的比例繪製（960px 的圖＝約 50%）。
 * 圖片來自預設集，使用者 ID 不會出現在外觀上。
 */
export default function TachiePreview({
  preset,
  nameText = '',
  sampleWhenEmpty = false,
  title = t('preview.title'),
}: Props) {
  const [inCall, setInCall] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [naturalW, setNaturalW] = useState<number | null>(null)

  // 圖片變了就重設實測寬度（由 onLoad 重新填入）。
  useEffect(() => {
    setNaturalW(null)
  }, [preset?.imageUrl])

  const left = preset?.left ?? 0
  const bottom = preset?.bottom ?? 0
  const width = preset?.width
  const speak = preset?.speak
  const dimWhenQuiet = preset?.dimWhenQuiet ?? false

  // 只有「通話中 而且 說話中」才會出現說話效果。
  const effectiveSpeaking = inCall && speaking
  // 寬度依 明確指定 > 圖片實際尺寸 > 暫定寬度 的順序。
  const effWidth = width ?? naturalW ?? FALLBACK_WIDTH
  const widthPct = (effWidth / REF_W) * 100
  // 位置以與輸出 CSS 相同的函式決定（未指定時為左下）。
  const anchors = resolveAnchors(preset ?? {})
  const tachiePlace = placeTachie(anchors, left, bottom)
  // 置中的 translate。彈跳的 keyframe 會取代 transform，所以用變數織進去
  // （與輸出 CSS 的 `composeTransform` + 加在 keyframe 前面是同樣的處理）。
  const centering = placementTransform(tachiePlace)

  const anims: string[] = []
  if (effectiveSpeaking && speak) {
    if (speak.bounce && speak.jumpPx > 0) {
      anims.push(`tachie-preview-jump ${speak.durationMs}ms infinite alternate ease-in-out`)
    }
    if (speak.outline) {
      anims.push(`tachie-preview-light ${speak.durationMs}ms infinite alternate ease-in-out`)
    }
    if (speak.blink) {
      anims.push(`tachie-preview-blink ${speak.durationMs}ms infinite alternate ease-in-out`)
    }
  }

  // 把安靜的人調暗：沒說話時是暗的（不在通話中時＝沒在說話，所以也是暗的）。
  const dimmed = dimWhenQuiet && !effectiveSpeaking

  const figStyle: CSSProperties = {
    // 立繪也以畫面為基準絕對定位（與名字標籤相同的座標系。
    // 用留白（padding）對齊的話，% 會以扣掉留白後的寬度計算，與實際尺寸不一致）。
    ...placementStyle(tachiePlace),
    width: `${widthPct}%`,
    transform: centering,
    // 彈跳 keyframe 前面加的置中部分（沒有時是無害的 translateX(0)）。
    ['--tp-center' as string]: centering ?? 'translateX(0)',
    // 彈跳・描邊是「長度」，所以換算成預覽比例（維持實際像素的話
    // 只有預覽看起來比較大，與輸出不一致）。
    ['--tp-jump' as string]: cqw(speak?.jumpPx ?? 0),
    ['--tp-outline' as string]: speak?.outlineColor ?? '#FFFFFF',
    // 與 generateCss 一樣，w<=0 捨入成 1px（讓預覽與輸出一致）。
    ['--tp-outline-w' as string]: cqw(Math.max(1, speak?.outlineWidth ?? 2)),
    filter: dimmed ? 'brightness(0.5)' : undefined,
    animation: anims.length ? anims.join(', ') : undefined,
  }

  // --- 名字標籤（把與輸出 CSS 的 body::before 相同的計算套用到預覽比例） ---
  const label = preset?.nameLabel
  // 與輸出的 content 相同的正規化（換行・控制字元改成空白，變成一行）。
  const cleanedName = flattenText(nameText).trim()
  const usingSample = cleanedName === '' && sampleWhenEmpty
  const labelText = cleanedName || t('preview.sampleName')
  // 輸出 CSS「名字為空時不輸出 body::before」。不顯示暫定名字的畫面也一樣不畫。
  const showLabel = (label?.show ?? false) && (cleanedName !== '' || usingSample)
  // 讓使用者察覺「名字顯示開著但名字是空的＝不會出現在輸出」。
  const emptyNameWarning = (label?.show ?? false) && cleanedName === '' && !usingSample
  // 文字大小・描邊寬度與畫面寬度成比例（→ 模組開頭的 cqw）。
  // 對齊的基準寬度：明確指定 > 圖片實際尺寸（與輸出 CSS 的框寬決定方式相同）。
  const nameBoxWidth = width ?? naturalW ?? undefined
  // 字幕條配合文字寬度的模式不給 width，改用 transform 對齊立繪（與輸出 CSS 相同）。
  const hug = (label?.background ?? false) && label?.fit === 'text'
  // 與輸出 CSS（nameBlock）相同的退路：不知道寬度時對齊錨點的自然位置。
  const shifted = hug && nameBoxWidth != null
  const namePlace = label
    ? placeNameLabel(
        anchors,
        { x: left, y: bottom },
        { dx: label.offsetX, dy: label.offsetY },
        shifted ? ALIGN_HANDLE[label.align] : naturalHandleX(anchors.x),
        nameBoxWidth ?? 0,
      )
    : null
  const nameStyle: CSSProperties = label && namePlace
    ? {
        ...placementStyle(namePlace),
        transform: placementTransform(namePlace),
        width: !hug && nameBoxWidth != null ? `${(nameBoxWidth / REF_W) * 100}%` : undefined,
        textAlign: !hug && nameBoxWidth != null ? label.align : undefined,
        boxSizing: 'border-box',
        background: label.background
          ? cssColorWithOpacity(label.backgroundColor, label.backgroundOpacity)
          : undefined,
        padding: label.background
          ? `${cqw(label.backgroundPadY)} ${cqw(label.backgroundPadX)}`
          : undefined,
        borderRadius: label.background ? cqw(label.backgroundRadius) : undefined,
        // 經過與輸出相同的安全化・捨入（不讓只有預覽看起來不一樣）。
        fontSize: cqw(Math.max(1, label.fontSize)),
        fontWeight: label.bold ? 700 : 400,
        fontFamily: safeFontFamily(label.fontFamily) || undefined,
        color: safeColor(label.color),
        textShadow: label.outline && label.outlineWidth > 0
          ? [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ]
              .map(
                ([x, y]) =>
                  `${cqw(x * label.outlineWidth)} ${cqw(y * label.outlineWidth)} 0 ${safeColor(
                    label.outlineColor,
                  )}`,
              )
              .join(', ')
          : undefined,
      }
    : {}

  // 設為「不在通話中時隱藏立繪」而且 不在通話中 時，立繪不顯示。
  const hiddenNow = (preset?.hideWhenAway ?? false) && !inCall

  const status = hiddenNow
    ? t('preview.status.awayHidden')
    : !inCall
      ? t('preview.status.away')
      : effectiveSpeaking
        ? t('preview.status.speaking')
        : t('preview.status.quiet')

  return (
    <div className="panel">
      <div className="tp-head">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <label className="toggle" style={{ padding: 0 }}>
          <input
            type="checkbox"
            checked={inCall}
            onChange={(e) => setInCall(e.target.checked)}
          />
          <span className="sw" />
          <span className="lab" style={{ fontSize: '0.84rem' }}>
            {inCall ? t('preview.inCall') : t('preview.notInCall')}
          </span>
        </label>
      </div>

      <div
        className="tp-viewport"
        role="button"
        tabIndex={0}
        aria-label={t('preview.aria', status)}
        aria-pressed={effectiveSpeaking}
        style={{ cursor: inCall ? 'pointer' : 'default' }}
        onClick={() => {
          if (inCall) setSpeaking((s) => !s)
        }}
        onKeyDown={(e) => {
          if (inCall && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setSpeaking((s) => !s)
          }
        }}
      >
        <span className="tp-status">{status}</span>
        {preset &&
          !hiddenNow &&
          (preset.imageUrl ? (
            <img
              className="tp-img"
              style={figStyle}
              src={preset.imageUrl}
              alt={preset.name || t('preview.alt')}
              onLoad={(e) => setNaturalW(e.currentTarget.naturalWidth || null)}
            />
          ) : (
            <div className="tp-placeholder" style={figStyle} aria-label={t('preview.noImage')}>
              <span>{t('preview.placeholder')}</span>
            </div>
          ))}
        {showLabel && !hiddenNow && (
          <div className="tp-name" style={nameStyle}>
            {labelText}
          </div>
        )}
      </div>

      <p className="hint">
        {t('preview.hint')}
        {inCall ? t('preview.hint.click') : t('preview.hint.away')}
        {preset && width == null && t('preview.hint.natural')}
        {usingSample && t('preview.hint.sample')}
      </p>
      {emptyNameWarning && (
        <p className="hint" style={{ color: 'var(--warn)' }} role="status">
          {t('preview.emptyName')}
        </p>
      )}
    </div>
  )
}
