/**
 * 立繪圖片的裁切。
 *
 * **輸出 CSS 不做任何修改。** 裁切是用 canvas 對已匯入的 data URI 燒進結果，
 * 再以結果的 data URI 替換 `Preset.imageUrl`（＝從 `generateCss` 看來
 * 只是圖片換了）。**這是破壞性的，要重來就重新匯入**（保留原圖的話 localStorage 會變兩倍）。
 *
 * 錨點（003）以「圖片的外形」為基準對齊，所以**含透明留白的圖片，錨點會
 * 偏掉留白的份量**。自動修掉透明留白是讓錨點照預期運作的前提，
 * 也是這個模組的主角。
 *
 * 依賴瀏覽器 API（Image／canvas）的只有 {@link cropDataUri}／{@link detectTrimRect}，
 * **需要判斷的部分都集中到純函式，作為單元測試的對象**
 * （與 `image.ts` 把 `computeResizeDimensions` 獨立出來是同樣的方針）。
 *
 * （TRPG Toolkit 收錄版）拋出的錯誤是帶 i18n key 的 {@link LocalizedError}，
 * 畫面在算繪時才取譯文，切換語言後會跟著換。
 */

import type { Dimensions } from './image'
import { LocalizedError } from '../i18n'

/** 要裁切的矩形（圖片的像素座標，左上角為原點）。 */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 把矩形正規化成收在圖片內的整數矩形。**傳給 canvas 之前一定要經過這裡**
 * （`drawImage` 會用透明填滿範圍外，超出去的矩形會默默產生透明的帶狀區域）。
 *
 * - 小數不是無條件捨去/進位，而是**四捨五入**（最接近拖曳操作看到的樣子）
 * - 負的寬・高會修正方向（從右上拖到左下也是同一個矩形）
 * - 超出圖片外的部分會夾限在範圍內
 * - **與圖片不相交的矩形回傳 `null`**（＝無法裁切，由呼叫端說明原因）
 *
 * 保證寬・高至少 1px（0px 的 canvas 會拋出例外）。
 */
export function normalizeCropRect(rect: CropRect, dims: Dimensions): CropRect | null {
  const imgW = Math.floor(dims.width)
  const imgH = Math.floor(dims.height)
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW < 1 || imgH < 1) return null
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null

  // 負的寬・高只是「反方向拖曳」，所以先換成邊的座標再排序。
  const x1 = Math.round(Math.min(rect.x, rect.x + rect.width))
  const x2 = Math.round(Math.max(rect.x, rect.x + rect.width))
  const y1 = Math.round(Math.min(rect.y, rect.y + rect.height))
  const y2 = Math.round(Math.max(rect.y, rect.y + rect.height))

  // 夾限在圖片內側。
  const left = Math.min(Math.max(x1, 0), imgW)
  const right = Math.min(Math.max(x2, 0), imgW)
  const top = Math.min(Math.max(y1, 0), imgH)
  const bottom = Math.min(Math.max(y2, 0), imgH)

  // 夾限後被壓扁（＝沒有與圖片重疊／寬或高為 0）就無法裁切。
  if (right - left < 1 || bottom - top < 1) return null

  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** 經過 {@link normalizeCropRect} 的矩形是否與整張圖片相同（＝裁切沒有意義）。 */
export function isFullRect(rect: CropRect, dims: Dimensions): boolean {
  return (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width === Math.floor(dims.width) &&
    rect.height === Math.floor(dims.height)
  )
}

/**
 * 從 RGBA 像素陣列回傳去掉透明外圍的矩形的純函式。
 *
 * `pixels` 與 `getImageData().data` 相同，是 **RGBA 4 位元組 × width × height**（列優先）。
 *
 * - alpha **小於等於** `alphaThreshold` 視為「留白」。預設 0 ＝ 只去掉完全透明的部分
 *   （避免把半透明的投影或反鋸齒一起切掉）。
 * - **整張都是留白時回傳 `null`**。與其全部刪掉，改成「不修剪」比較安全
 *   （避免誤讀全白 PNG 時圖片消失的事故）。
 * - 沒有留白時原樣回傳整張圖片的矩形（呼叫端可用 {@link isFullRect} 判斷「沒有可修的空間」）。
 */
export function computeTrimBounds(
  pixels: Uint8ClampedArray,
  dims: Dimensions,
  alphaThreshold = 0,
): CropRect | null {
  const w = Math.floor(dims.width)
  const h = Math.floor(dims.height)
  if (w < 1 || h < 1) return null
  // 尺寸與實際資料對不上的話，掃描時會讀到範圍外，所以不處理。
  if (pixels.length < w * h * 4) return null

  let left = w
  let right = -1
  let top = h
  let bottom = -1

  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      // alpha 是 RGBA 的第 4 個位元組。
      if (pixels[row + x * 4 + 3] <= alphaThreshold) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  // 一個不透明的像素都沒有＝整張都是留白。不修剪（保守做法）。
  if (right < 0 || bottom < 0) return null

  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
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
 * 讀取圖片並取出 RGBA。
 *
 * **外部 URL 的圖片會汙染 canvas，讓 `getImageData` 拋出例外**（CORS）。
 * 目前的匯入流程會先轉成 data URI 再儲存，平常不會發生；
 * 但發生時若吞掉例外，就會變成「不知為何只有裁切沒效」，所以改拋出帶原因的例外。
 */
async function readPixels(
  dataUrl: string,
): Promise<{ pixels: Uint8ClampedArray; dims: Dimensions }> {
  const img = await loadImage(dataUrl)
  const dims = { width: img.naturalWidth, height: img.naturalHeight }
  if (dims.width < 1 || dims.height < 1) {
    throw new LocalizedError('err.noSize')
  }
  const canvas = document.createElement('canvas')
  canvas.width = dims.width
  canvas.height = dims.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new LocalizedError('err.noCanvas')
  ctx.drawImage(img, 0, 0)
  try {
    return { pixels: ctx.getImageData(0, 0, dims.width, dims.height).data, dims }
  } catch {
    // SecurityError（canvas 被汙染）。直接讀取 data URI 以外的圖片時會發生。
    throw new LocalizedError('err.tainted')
  }
}

/** 讀取圖片的實際尺寸（自然尺寸）。 */
export async function readDimensions(dataUrl: string): Promise<Dimensions> {
  const img = await loadImage(dataUrl)
  if (img.naturalWidth < 1 || img.naturalHeight < 1) {
    throw new LocalizedError('err.noSize')
  }
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/**
 * 偵測去掉透明留白的矩形。沒有可修的空間（整張不透明）／整張透明時回傳 `null`。
 *
 * @param alphaThreshold alpha **小於等於**這個值視為留白（預設 0 ＝ 只有完全透明）
 */
export async function detectTrimRect(
  dataUrl: string,
  alphaThreshold = 0,
): Promise<CropRect | null> {
  const { pixels, dims } = await readPixels(dataUrl)
  const rect = computeTrimBounds(pixels, dims, alphaThreshold)
  if (!rect) return null
  // 整張不透明＝沒有可修的空間。回傳 null，讓呼叫端能說「沒有變化」。
  return isFullRect(rect, dims) ? null : rect
}

/**
 * 回傳以矩形裁切後的 data URI。**固定為 PNG**（為了保留透明），**不再縮放**。
 *
 * 原圖是 JPEG/WebP 也會輸出 PNG，照片類的圖片**反而可能變大**
 * （呼叫端要顯示裁切後的大小，讓使用者察覺）。
 */
export async function cropDataUri(
  dataUrl: string,
  rect: CropRect,
): Promise<{ dataUrl: string; rect: CropRect }> {
  const img = await loadImage(dataUrl)
  const dims = { width: img.naturalWidth, height: img.naturalHeight }
  const safe = normalizeCropRect(rect, dims)
  if (!safe) throw new LocalizedError('err.cropOutside')

  const canvas = document.createElement('canvas')
  canvas.width = safe.width
  canvas.height = safe.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new LocalizedError('err.noCanvas')
  ctx.drawImage(img, safe.x, safe.y, safe.width, safe.height, 0, 0, safe.width, safe.height)
  try {
    return { dataUrl: canvas.toDataURL('image/png'), rect: safe }
  } catch {
    throw new LocalizedError('err.tainted')
  }
}

/** data URI 的大約位元組數（由 base64 的實際資料長度反推）。 */
export function dataUriBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  if (i < 0) return 0
  const b64 = dataUrl.slice(i + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}
