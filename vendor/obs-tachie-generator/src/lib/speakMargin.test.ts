import { describe, expect, it } from 'vitest'
import { requiredSpeakMargin, speakMarginNote } from './speakMargin'
import { DEFAULT_SPEAK } from './types'

describe('requiredSpeakMargin', () => {
  it('S1 外框・光暈在上下左右各需寬度×7', () => {
    for (const [w, expected] of [
      [2, 14],
      [4, 28],
      [6, 42],
      [12, 84],
    ] as const) {
      const speak = { ...DEFAULT_SPEAK, bounce: false, outline: true, outlineWidth: w }
      expect(requiredSpeakMargin(speak, 'right', 'bottom')).toEqual({ x: expected, y: expected })
    }
  })

  it('S2 寬度 0 以下當成 1，小數無條件進位', () => {
    for (const [w, expected] of [
      [0, 7],
      [2.5, 18],
      [2.3, 17],
    ] as const) {
      const speak = { ...DEFAULT_SPEAK, bounce: false, outline: true, outlineWidth: w }
      expect(requiredSpeakMargin(speak, 'left', 'bottom').x).toBe(expected)
    }
  })

  it('S3 只有上錨點在垂直方向加上彈跳量', () => {
    const speak = { ...DEFAULT_SPEAK, outline: true, outlineWidth: 2, bounce: true, jumpPx: 10 }
    expect(requiredSpeakMargin(speak, 'left', 'top')).toEqual({ x: 14, y: 24 })
    expect(requiredSpeakMargin(speak, 'left', 'bottom')).toEqual({ x: 14, y: 14 })

    const speakHalf = { ...speak, jumpPx: 10.5 }
    expect(requiredSpeakMargin(speakHalf, 'left', 'top')).toEqual({ x: 14, y: 25 })
  })

  it('S4 沒有外框・只有彈跳', () => {
    const speak = { ...DEFAULT_SPEAK, outline: false, bounce: true, jumpPx: 10 }
    expect(requiredSpeakMargin(speak, 'left', 'top')).toEqual({ x: 0, y: 10 })
    expect(requiredSpeakMargin(speak, 'left', 'bottom')).toEqual({ x: 0, y: 0 })
  })

  it('S5 jumpPx 0 不相加', () => {
    const speak = { ...DEFAULT_SPEAK, outline: false, bounce: true, jumpPx: 0 }
    expect(requiredSpeakMargin(speak, 'left', 'top')).toEqual({ x: 0, y: 0 })
  })

  it('S6 中央錨點的軸為 null', () => {
    expect(requiredSpeakMargin(DEFAULT_SPEAK, 'center', 'bottom')).toEqual({ x: null, y: 14 })
    expect(requiredSpeakMargin(DEFAULT_SPEAK, 'left', 'middle')).toEqual({ x: 14, y: null })
    expect(requiredSpeakMargin(DEFAULT_SPEAK, 'center', 'middle')).toEqual({ x: null, y: null })
  })
})

describe('speakMarginNote', () => {
  it('S7 不夠時才警告', () => {
    expect(speakMarginNote(12, 0)).toEqual({
      warn: true,
      text: '発話演出が端で切れます。12px 以上にしてください',
    })
    expect(speakMarginNote(12, 12)).toEqual({
      warn: false,
      text: '発話演出に必要な余白: 12px',
    })
    expect(speakMarginNote(12, 16)).toEqual({
      warn: false,
      text: '発話演出に必要な余白: 12px',
    })
    expect(speakMarginNote(24, 23)).toEqual({
      warn: true,
      text: '発話演出が端で切れます。24px 以上にしてください',
    })
    expect(speakMarginNote(24, 24)).toEqual({
      warn: false,
      text: '発話演出に必要な余白: 24px',
    })
  })

  it('S8 需要值為 0・null 時不顯示', () => {
    expect(speakMarginNote(0, 0)).toBeNull()
    expect(speakMarginNote(null, 0)).toBeNull()
  })
})
