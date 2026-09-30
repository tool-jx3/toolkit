import { useEffect, useState } from 'react'
import { measureNaturalSize } from '../lib/image'
import type { Dimensions } from '../lib/image'

/**
 * 量測圖片實際尺寸（寬・高 px）的 React hook。讀不到・未設定時為 null。
 *
 * 讓寬度設為「原尺寸」的預設集也能使用名字標籤的對齊與立繪的繪製尺寸（背景方式）
 * （輸出 CSS 無法參照繪製中圖片的實際尺寸，所以把量到的數值寫死進去）。
 */
export function useImageNaturalSize(imageUrl: string | undefined): Dimensions | null {
  const [size, setSize] = useState<Dimensions | null>(null)

  useEffect(() => {
    let alive = true
    setSize(null)
    if (!imageUrl) return
    measureNaturalSize(imageUrl).then((s) => {
      if (alive) setSize(s)
    })
    return () => {
      alive = false
    }
  }, [imageUrl])

  return size
}
