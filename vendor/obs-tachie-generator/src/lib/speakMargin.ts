import type { AnchorX, AnchorY, SpeakEffect } from './types'
import { t } from '../i18n'

/** 各距離欄位需要的邊距（px）。中央錨點的軸是「偏移」而不是「距離」，所以為 null。 */
export interface SpeakMargin {
  x: number | null
  y: number | null
}

/** 外框・光暈往立繪外擴散的量 = 寬度 × 這個倍率（2026-09-18 在 OBS 實測最大約 6.7×〔寬度 2/4/6/12 → 13/26〜27/34〜40/79〜80px〕。保守取 7×）。 */
export const GLOW_EXTENT_PER_WIDTH = 7

/**
 * 讓說話效果不在邊緣被切掉所需的距錨點距離（px）。
 * - 外框・光暈（outline）開啟：上下左右各 7 × 寬度。寬度 0 以下當成 1（與 KEYFRAMES_LIGHT 相同）
 * - 彈跳（bounce && jumpPx > 0）：只往上動，所以只有 anchorY === 'top' 時垂直方向加上 jumpPx
 * - 各軸的合計最後以 Math.ceil 無條件進位成整數（寬度・彈跳高度是小數時也顯示整數 px）
 * - anchorX === 'center' 時 x 為 null，anchorY === 'middle' 時 y 為 null
 */
export function requiredSpeakMargin(speak: SpeakEffect, anchorX: AnchorX, anchorY: AnchorY): SpeakMargin {
  const glowExtent = speak.outline ? GLOW_EXTENT_PER_WIDTH * (speak.outlineWidth > 0 ? speak.outlineWidth : 1) : 0
  const jump = speak.bounce && speak.jumpPx > 0 ? speak.jumpPx : 0

  const x = anchorX === 'center' ? null : Math.ceil(glowExtent)
  const y = anchorY === 'middle' ? null : Math.ceil(glowExtent + (anchorY === 'top' ? jump : 0))

  return { x, y }
}

/**
 * 顯示在距離欄位的文字。need 為 null 或 0 以下時回傳 null（什麼都不顯示）。
 * 文字在呼叫當下取目前語言的譯文（每次算繪都會重新呼叫，所以切換語言後會跟著換）。
 */
export function speakMarginNote(
  need: number | null,
  distance: number,
): { warn: boolean; text: string } | null {
  if (need === null || need <= 0) return null
  if (distance < need) {
    return { warn: true, text: t('margin.warn', need) }
  }
  return { warn: false, text: t('margin.note', need) }
}
