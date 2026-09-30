import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANCHOR_X,
  DEFAULT_ANCHOR_Y,
  DEFAULT_OPTIONS,
  makeDefaultPreset,
  presetToOptions,
  resetPresetOptions,
  resolveAnchorX,
  resolveAnchorY,
  resolveAnchors,
  type AnchorX,
  type AnchorY,
  type Preset,
} from './types'

const ANCHOR_XS: AnchorX[] = ['left', 'center', 'right']
const ANCHOR_YS: AnchorY[] = ['top', 'middle', 'bottom']

describe('錨點的解析', () => {
  it('預設為左下（與 003 以前的輸出位置相同）', () => {
    expect(DEFAULT_ANCHOR_X).toBe('left')
    expect(DEFAULT_ANCHOR_Y).toBe('bottom')
  })

  it('距錨點距離的預設值為 0（＝緊貼錨點。對位在 OBS 那邊做）', () => {
    expect(DEFAULT_OPTIONS.left).toBe(0)
    expect(DEFAULT_OPTIONS.bottom).toBe(0)
  })

  it('未指定（undefined）時改用預設值', () => {
    expect(resolveAnchorX(undefined)).toBe('left')
    expect(resolveAnchorY(undefined)).toBe('bottom')
    expect(resolveAnchorX()).toBe('left')
    expect(resolveAnchorY()).toBe('bottom')
    expect(resolveAnchors({})).toEqual({ x: 'left', y: 'bottom' })
  })

  it('指定的值原樣通過', () => {
    for (const x of ANCHOR_XS) expect(resolveAnchorX(x)).toBe(x)
    for (const y of ANCHOR_YS) expect(resolveAnchorY(y)).toBe(y)
  })

  it('9 種組合都由 resolveAnchors 原樣回傳', () => {
    for (const x of ANCHOR_XS) {
      for (const y of ANCHOR_YS) {
        expect(resolveAnchors({ anchorX: x, anchorY: y })).toEqual({ x, y })
      }
    }
  })

  it('只指定一邊時，只有另一邊改用預設值', () => {
    expect(resolveAnchors({ anchorX: 'right' })).toEqual({ x: 'right', y: 'bottom' })
    expect(resolveAnchors({ anchorY: 'middle' })).toEqual({ x: 'left', y: 'middle' })
  })
})

describe('presetToOptions', () => {
  const base: Preset = makeDefaultPreset('p1')

  it('把錨點傳給 GenerateOptions', () => {
    const o = presetToOptions({ ...base, anchorX: 'right', anchorY: 'top' })
    expect(o.anchorX).toBe('right')
    expect(o.anchorY).toBe('top')
  })

  it('未指定錨點的預設集以未指定的狀態傳遞，解析後為左下', () => {
    const legacy = { ...base }
    delete legacy.anchorX
    delete legacy.anchorY
    const o = presetToOptions(legacy)
    expect(o.anchorX).toBeUndefined()
    expect(o.anchorY).toBeUndefined()
    expect(resolveAnchors(o)).toEqual({ x: 'left', y: 'bottom' })
  })

  it('實際尺寸的高度也會傳遞', () => {
    const o = presetToOptions(base, 600, 900)
    expect(o.imageNaturalWidth).toBe(600)
    expect(o.imageNaturalHeight).toBe(900)
  })
})

describe('預設的預設集', () => {
  it('makeDefaultPreset 的錨點為預設值（左下）', () => {
    const p = makeDefaultPreset('p1')
    expect(p.anchorX).toBe(DEFAULT_ANCHOR_X)
    expect(p.anchorY).toBe(DEFAULT_ANCHOR_Y)
    expect(p.left).toBe(DEFAULT_OPTIONS.left)
    expect(p.bottom).toBe(DEFAULT_OPTIONS.bottom)
  })

  it('resetPresetOptions 也把錨點恢復預設值（名稱・圖片保留）', () => {
    const edited: Preset = {
      ...makeDefaultPreset('p1'),
      name: '預設集A',
      imageUrl: 'data:image/png;base64,AAAA',
      anchorX: 'center',
      anchorY: 'middle',
      left: 999,
      bottom: 999,
    }
    const reset = resetPresetOptions(edited)
    expect(reset.anchorX).toBe(DEFAULT_ANCHOR_X)
    expect(reset.anchorY).toBe(DEFAULT_ANCHOR_Y)
    expect(reset.left).toBe(DEFAULT_OPTIONS.left)
    expect(reset.bottom).toBe(DEFAULT_OPTIONS.bottom)
    expect(reset.name).toBe('預設集A')
    expect(reset.imageUrl).toBe('data:image/png;base64,AAAA')
  })
})
