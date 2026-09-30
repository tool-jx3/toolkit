import { describe, expect, it } from 'vitest'
import {
  computeTrimBounds,
  dataUriBytes,
  isFullRect,
  normalizeCropRect,
  type CropRect,
} from './crop'

/**
 * 從 ASCII 圖做出 RGBA。`#` = 不透明 / `.` = 完全透明 / `1`〜`9` = alpha（數字×25）。
 * 為了讓測試寫成一看就知道「哪裡有留白」的形式。
 */
function pixels(rows: string[]): { pixels: Uint8ClampedArray; dims: { width: number; height: number } } {
  const h = rows.length
  const w = rows[0].length
  const data = new Uint8ClampedArray(w * h * 4)
  rows.forEach((row, y) => {
    expect(row.length).toBe(w) // 列的長度不一是測試這邊寫錯
    for (let x = 0; x < w; x++) {
      const c = row[x]
      const alpha = c === '#' ? 255 : c === '.' ? 0 : Number(c) * 25
      const i = (y * w + x) * 4
      data[i] = 200
      data[i + 1] = 100
      data[i + 2] = 50
      data[i + 3] = alpha
    }
  })
  return { pixels: data, dims: { width: w, height: h } }
}

describe('normalizeCropRect', () => {
  const dims = { width: 100, height: 80 }

  it('收在圖片內的整數矩形維持原樣', () => {
    expect(normalizeCropRect({ x: 10, y: 20, width: 30, height: 40 }, dims)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  it('小數四捨五入', () => {
    expect(normalizeCropRect({ x: 10.4, y: 20.6, width: 30.5, height: 9.4 }, dims)).toEqual({
      // x: 10.4 → 10 / 右緣 40.9 → 41
      x: 10,
      y: 21,
      width: 31,
      // y: 21 / 下緣 30.0 → 30
      height: 9,
    })
  })

  it('負的寬・高會修正方向（反向拖曳）', () => {
    expect(normalizeCropRect({ x: 40, y: 60, width: -30, height: -40 }, dims)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  it('超出圖片外的部分夾限在範圍內', () => {
    expect(normalizeCropRect({ x: -20, y: -10, width: 500, height: 500 }, dims)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    })
    expect(normalizeCropRect({ x: 90, y: 70, width: 50, height: 50 }, dims)).toEqual({
      x: 90,
      y: 70,
      width: 10,
      height: 10,
    })
  })

  it('拒絕寬 0 / 高 0 的矩形（做不出 0px 的 canvas）', () => {
    expect(normalizeCropRect({ x: 10, y: 10, width: 0, height: 20 }, dims)).toBeNull()
    expect(normalizeCropRect({ x: 10, y: 10, width: 20, height: 0 }, dims)).toBeNull()
    // 四捨五入後壓扁成不到 1px 時也一樣
    expect(normalizeCropRect({ x: 10, y: 10, width: 0.4, height: 20 }, dims)).toBeNull()
  })

  it('拒絕與圖片完全不重疊的矩形', () => {
    expect(normalizeCropRect({ x: 200, y: 200, width: 50, height: 50 }, dims)).toBeNull()
    expect(normalizeCropRect({ x: -80, y: 0, width: 50, height: 50 }, dims)).toBeNull()
  })

  it('圖片尺寸不正確時拒絕', () => {
    const r: CropRect = { x: 0, y: 0, width: 10, height: 10 }
    expect(normalizeCropRect(r, { width: 0, height: 80 })).toBeNull()
    expect(normalizeCropRect(r, { width: 100, height: 0 })).toBeNull()
  })

  it('拒絕 NaN / Infinity（清空輸入欄時會傳來 NaN）', () => {
    expect(normalizeCropRect({ x: NaN, y: 0, width: 10, height: 10 }, dims)).toBeNull()
    expect(normalizeCropRect({ x: 0, y: 0, width: Infinity, height: 10 }, dims)).toBeNull()
  })
})

describe('isFullRect', () => {
  it('檢查是否與整張圖片一致', () => {
    const dims = { width: 100, height: 80 }
    expect(isFullRect({ x: 0, y: 0, width: 100, height: 80 }, dims)).toBe(true)
    expect(isFullRect({ x: 0, y: 0, width: 100, height: 79 }, dims)).toBe(false)
    expect(isFullRect({ x: 1, y: 0, width: 99, height: 80 }, dims)).toBe(false)
  })
})

describe('computeTrimBounds', () => {
  it('四周都有留白的圖片修到圖案本體', () => {
    const { pixels: p, dims } = pixels([
      '......',
      '..##..',
      '..##..',
      '......',
    ])
    expect(computeTrimBounds(p, dims)).toEqual({ x: 2, y: 1, width: 2, height: 2 })
  })

  it('整張不透明時原尺寸回傳（沒有可修的空間）', () => {
    const { pixels: p, dims } = pixels(['####', '####'])
    const rect = computeTrimBounds(p, dims)
    expect(rect).toEqual({ x: 0, y: 0, width: 4, height: 2 })
    expect(isFullRect(rect!, dims)).toBe(true)
  })

  it('**整張透明時不修剪**（避免全部刪掉，採保守做法）', () => {
    const { pixels: p, dims } = pixels(['....', '....'])
    expect(computeTrimBounds(p, dims)).toBeNull()
  })

  it('只有單側有留白的情況', () => {
    // 只有左邊有留白
    const left = pixels(['..##', '..##'])
    expect(computeTrimBounds(left.pixels, left.dims)).toEqual({ x: 2, y: 0, width: 2, height: 2 })
    // 只有下面有留白
    const bottom = pixels(['####', '####', '....'])
    expect(computeTrimBounds(bottom.pixels, bottom.dims)).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 2,
    })
  })

  it('1px 的圖案也不會被壓扁', () => {
    const { pixels: p, dims } = pixels(['.....', '..#..', '.....'])
    expect(computeTrimBounds(p, dims)).toEqual({ x: 2, y: 1, width: 1, height: 1 })
  })

  it('分開的點會變成同時包含兩者的外接矩形', () => {
    const { pixels: p, dims } = pixels([
      '#....',
      '.....',
      '....#',
    ])
    expect(computeTrimBounds(p, dims)).toEqual({ x: 0, y: 0, width: 5, height: 3 })
  })

  it('預設門檻是「只有完全透明」＝保留半透明（不把投影一起切掉）', () => {
    // '1' = alpha 25（當作淡淡的投影）
    const { pixels: p, dims } = pixels(['1111', '.##.', '1111'])
    expect(computeTrimBounds(p, dims)).toEqual({ x: 0, y: 0, width: 4, height: 3 })
  })

  it('提高門檻後半透明也當成留白修掉', () => {
    const { pixels: p, dims } = pixels(['1111', '.##.', '1111'])
    expect(computeTrimBounds(p, dims, 25)).toEqual({ x: 1, y: 1, width: 2, height: 1 })
  })

  it('尺寸與資料長度對不上時不處理', () => {
    const { pixels: p } = pixels(['##', '##'])
    expect(computeTrimBounds(p, { width: 10, height: 10 })).toBeNull()
  })

  it('拒絕尺寸 0', () => {
    expect(computeTrimBounds(new Uint8ClampedArray(0), { width: 0, height: 0 })).toBeNull()
  })
})

describe('dataUriBytes', () => {
  it('由 base64 的實際資料長度算出位元組數', () => {
    // "hello"（5 位元組）= aGVsbG8=
    expect(dataUriBytes('data:image/png;base64,aGVsbG8=')).toBe(5)
    // "hi"（2 位元組）= aGk=
    expect(dataUriBytes('data:image/png;base64,aGk=')).toBe(2)
    // 沒有補位（3 的倍數）
    expect(dataUriBytes('data:image/png;base64,YWJj')).toBe(3)
  })

  it('不是 data URI 時為 0', () => {
    expect(dataUriBytes('https://example.test/a.png')).toBe(0)
    expect(dataUriBytes('')).toBe(0)
  })
})
