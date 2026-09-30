import { describe, expect, it } from 'vitest'
import { computeResizeDimensions, isWithinSizeLimit, measureNaturalSize } from './image'

describe('computeResizeDimensions', () => {
  it('未指定 maxWidth 時維持原尺寸', () => {
    expect(computeResizeDimensions({ width: 960, height: 540 })).toEqual({
      width: 960,
      height: 540,
    })
  })

  it('在 maxWidth 以下時不放大', () => {
    expect(computeResizeDimensions({ width: 400, height: 300 }, 800)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('超過 maxWidth 時維持長寬比縮小', () => {
    expect(computeResizeDimensions({ width: 960, height: 540 }, 480)).toEqual({
      width: 480,
      height: 270,
    })
  })

  it('高度的小數四捨五入', () => {
    expect(computeResizeDimensions({ width: 1000, height: 333 }, 500)).toEqual({
      width: 500,
      height: 167,
    })
  })

  it('極端縮小時高度也至少 1px', () => {
    expect(computeResizeDimensions({ width: 1000, height: 2 }, 1)).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('maxWidth 為 0 以下時不縮放', () => {
    expect(computeResizeDimensions({ width: 960, height: 540 }, 0)).toEqual({
      width: 960,
      height: 540,
    })
  })
})

describe('isWithinSizeLimit', () => {
  it('在上限以下為 true', () => {
    expect(isWithinSizeLimit({ size: 1000 } as File, 2000)).toBe(true)
  })
  it('超過上限為 false', () => {
    expect(isWithinSizeLimit({ size: 3000 } as File, 2000)).toBe(false)
  })
})

describe('measureNaturalSize', () => {
  it('空 URL 為 null', async () => {
    expect(await measureNaturalSize('')).toBe(null)
  })
})
