/**
 * 圖片匯入。File → 轉成 data URI（可選擇依最大寬度縮小，避免 CSS 過大）。
 *
 * 依賴瀏覽器 API（FileReader／Image／canvas）的只有 `fileToDataUri`，
 * 尺寸計算 `computeResizeDimensions` 獨立成純函式，作為單元測試的對象。
 */

import { LocalizedError } from '../i18n'

export interface ResizeOptions {
  /** 最大寬度（px）。未指定・0 以下時不縮放。 */
  maxWidth?: number
  /** 縮放時的輸出格式。 */
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** JPEG/WebP 的品質（0–1）。 */
  quality?: number
}

export interface Dimensions {
  width: number
  height: number
}

/**
 * 只有超過 `maxWidth` 時，才回傳維持長寬比縮小後的尺寸的純函式。
 * 不放大。小數四捨五入，保證至少 1px。
 */
export function computeResizeDimensions(
  source: Dimensions,
  maxWidth?: number,
): Dimensions {
  const { width, height } = source
  if (!maxWidth || maxWidth <= 0 || width <= maxWidth) {
    return { width, height }
  }
  const scale = maxWidth / width
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** 檔案大小是否沒超過上限（預設 8MB）。超過時回傳 false。 */
export function isWithinSizeLimit(file: File, maxBytes = 8 * 1024 * 1024): boolean {
  return file.size <= maxBytes
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new LocalizedError('err.read'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new LocalizedError('err.decode'))
    img.src = dataUrl
  })
}

/**
 * 量測圖片的實際尺寸（寬・高 px）。讀不到・空 URL 時回傳 null。
 *
 * 即使是寬度設為「原尺寸」的預設集，名字標籤的對齊與立繪的繪製尺寸（背景方式）
 * 也需要**數值化的實際尺寸**（CSS 無法參照以 `content: url(...)` 畫出的圖片實際尺寸）。
 * 所以由應用程式量測，寫死進輸出 CSS。
 */
export async function measureNaturalSize(
  url: string,
  timeoutMs = 8000,
): Promise<Dimensions | null> {
  if (!url) return null
  try {
    // 沒有回應的主機 onload／onerror 都不會觸發，所以不要一直等。
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    const img = await Promise.race([loadImage(url), timeout])
    if (!img || !img.naturalWidth || !img.naturalHeight) return null
    return { width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

/**
 * 用 canvas 把 data URI（或可以當圖片讀取的 URL）縮小到 `maxWidth` 以內，回傳 data URI。
 * 不需縮放（未指定／已經在範圍內）時原樣回傳輸入。
 * 上傳流程（{@link fileToDataUri}）與 URL→dataURI 轉換流程（imageSource）共用。
 */
export async function resizeDataUri(
  dataUrl: string,
  options: ResizeOptions = {},
): Promise<string> {
  const { maxWidth, mimeType = 'image/png', quality = 0.92 } = options
  if (!maxWidth || maxWidth <= 0) {
    return dataUrl
  }

  const img = await loadImage(dataUrl)
  const target = computeResizeDimensions(
    { width: img.naturalWidth, height: img.naturalHeight },
    maxWidth,
  )
  if (target.width === img.naturalWidth && target.height === img.naturalHeight) {
    return dataUrl
  }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, target.width, target.height)
  return canvas.toDataURL(mimeType, quality)
}

/**
 * 把 File 轉成 data URI。指定 `maxWidth` 時，只有超過的圖片會用 canvas 縮小後嵌入。
 * 不需縮放（未指定／在範圍內）時直接把檔案轉成 base64，保留原圖。
 */
export async function fileToDataUri(
  file: File,
  options: ResizeOptions = {},
): Promise<string> {
  const original = await readAsDataUrl(file)
  return resizeDataUri(original, options)
}
