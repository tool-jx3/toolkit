/**
 * 解析圖片來源。Streamkit 疊加層的 CSP（`img-src`）能顯示的主機 URL 就直接使用，
 * 其他則轉成 data URI 嵌入。使用者也可以明確指定。
 *
 * 注意：允許主機清單是「已知實務上安全的範圍」的盡力而為。嚴格的 CSP
 * 可能隨 Streamkit 的更新改變，無法判斷的一律改用 data URI（或上傳）。
 *
 * （TRPG Toolkit 收錄版）給畫面看的說明與警告改傳 i18n key（`noteKey`／`warningKey`），
 * 由畫面在算繪時取譯文，切換語言後會跟著換。
 */

import { resizeDataUri } from './image'
import { LocalizedError } from '../i18n'

/** 用什麼方式把圖片放進 CSS。 */
export type ImageSourceMode = 'auto' | 'url' | 'dataUri'

/** 已知 Streamkit 的 CSP `img-src` 會允許的主機（後綴比對）。 */
export const STREAMKIT_ALLOWED_HOST_SUFFIXES = [
  'discordapp.com',
  'discord.com',
  'discordapp.net',
  'imgur.com',
] as const

/** 是否為 data URI。 */
export function isDataUri(url: string): boolean {
  return /^data:/i.test(url.trim())
}

/**
 * 是否能判斷該 URL 在 Streamkit 的 CSP 下「可以直接顯示」。
 * data:/blob: 屬於嵌入類，所以為 true。http(s) 的主機符合允許清單的後綴時為 true。
 */
export function isStreamkitAllowedImageUrl(url: string): boolean {
  const u = url.trim()
  if (/^(data|blob):/i.test(u)) return true
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase()
  return STREAMKIT_ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

/**
 * 該 URL 是否屬於「會隨時間失效」的類型（＝直接使用的話之後會顯示不出來）。
 * Discord 的附件/媒體 CDN 自 2023 年起改為帶簽章的 URL（`?ex=&is=&hm=`），約 24 小時後失效。
 * 偵測常被拿來當立繪的 `cdn.discordapp.com/attachments/...`、`media.discordapp.net/...`。
 * （表情符號・頭像等沒有簽章的 URL 不會失效，不在此列。）
 */
export function isExpiringImageUrl(url: string): boolean {
  const u = url.trim()
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  const isDiscordCdn = host.endsWith('discordapp.com') || host.endsWith('discordapp.net')
  if (!isDiscordCdn) return false
  const hasSignature = parsed.searchParams.has('hm') || parsed.searchParams.has('ex')
  const isAttachment = /\/(ephemeral-)?attachments\//.test(parsed.pathname)
  return hasSignature || isAttachment
}

/** 取得外部 URL 並轉成 data URI。不支援 CORS 的主機可能會失敗。 */
export async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new LocalizedError('err.fetch', res.status)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new LocalizedError('err.notImage')
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new LocalizedError('err.convert'))
    reader.readAsDataURL(blob)
  })
}

/** 解析結果。`imageUrl` 是實際放進 CSS 的值，`noteKey` 是 UI 顯示用說明的 i18n key。 */
export interface ResolvedImageSource {
  imageUrl: string
  /** 實際以什麼方式放進去。 */
  applied: 'url' | 'dataUri'
  /** 給使用者的一句話的 i18n key（空字串表示沒有特別說明）。上游是直接放日文字串的 `note`。 */
  noteKey: string
  /** 無法照預期處理時的警告的 i18n key（空字串表示沒有問題）。上游是直接放日文字串的 `warning`。 */
  warningKey: string
}

/**
 * 依模式解析輸入的 URL。
 * - `url`    ：直接使用（碰不到遠端 URL 的內容，所以不套用 `maxWidth` 縮放）。
 * - `dataUri`：轉成 data URI（失敗就維持 URL 並警告）。轉換後若有 `maxWidth` 就縮小再嵌入。
 * - `auto`   ：允許的主機就維持 URL，否則嘗試轉成 data URI，失敗就維持 URL＋警告。
 *              只有轉成 data URI 時才套用 `maxWidth` 縮放。
 *
 * `maxWidth`（px，0／未指定時不縮放）只在「把 URL 轉成 data URI 嵌入」時有效。
 */
export async function resolveImageSource(
  input: string,
  mode: ImageSourceMode = 'auto',
  maxWidth?: number,
): Promise<ResolvedImageSource> {
  const url = input.trim()

  if (isDataUri(url)) {
    return { imageUrl: url, applied: 'dataUri', noteKey: 'src.note.embedded', warningKey: '' }
  }

  if (mode === 'url') {
    let warningKey = ''
    if (isExpiringImageUrl(url)) {
      warningKey = 'src.warn.expiring'
    } else if (!isStreamkitAllowedImageUrl(url)) {
      warningKey = 'src.warn.blockedHost'
    }
    return { imageUrl: url, applied: 'url', noteKey: 'src.note.asUrl', warningKey }
  }

  if (mode === 'dataUri') {
    try {
      const dataUri = await resizeDataUri(await urlToDataUri(url), { maxWidth })
      return { imageUrl: dataUri, applied: 'dataUri', noteKey: 'src.note.converted', warningKey: '' }
    } catch {
      return {
        imageUrl: url,
        applied: 'url',
        noteKey: 'src.note.asUrl',
        warningKey: 'src.warn.convertFailed',
      }
    }
  }

  // auto
  const expiring = isExpiringImageUrl(url)
  // 允許的主機 而且 不會失效（imgur 等）→ 維持 URL。Discord 附件會失效，所以在下面嵌入。
  if (isStreamkitAllowedImageUrl(url) && !expiring) {
    return {
      imageUrl: url,
      applied: 'url',
      noteKey: 'src.note.allowedHost',
      warningKey: '',
    }
  }
  try {
    const dataUri = await resizeDataUri(await urlToDataUri(url), { maxWidth })
    return {
      imageUrl: dataUri,
      applied: 'dataUri',
      noteKey: expiring ? 'src.note.expiringConverted' : 'src.note.hostConverted',
      warningKey: '',
    }
  } catch {
    return {
      imageUrl: url,
      applied: 'url',
      noteKey: 'src.note.asUrl',
      warningKey: expiring ? 'src.warn.expiringFailed' : 'src.warn.hostFailed',
    }
  }
}
