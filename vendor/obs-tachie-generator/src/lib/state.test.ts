import { describe, expect, it } from 'vitest'
import { normalizeState } from './state'
import { cssFilename } from './download'
import {
  DEFAULT_ANCHOR_X,
  DEFAULT_ANCHOR_Y,
  DEFAULT_NAME_LABEL,
  DEFAULT_OPTIONS,
  DEFAULT_SPEAK,
} from './types'

const EMPTY = { users: [], presets: [], pairings: [], selection: { userId: null, presetId: null } }

describe('normalizeState', () => {
  it('空輸入得到空的 state', () => {
    expect(normalizeState(null)).toEqual(EMPTY)
    expect(normalizeState(undefined)).toEqual(EMPTY)
    expect(normalizeState('nope')).toEqual(EMPTY)
  })

  it('舊格式（有 options 而沒有 presets）捨棄後得到空的 state', () => {
    const old = {
      users: [{ id: '1', name: 'a', imageUrl: 'data:...' }],
      options: { left: 100 },
    }
    expect(normalizeState(old)).toEqual(EMPTY)
  })

  it('驗證新格式後採用', () => {
    const s = normalizeState({
      users: [{ id: '1', name: '使用者A' }],
      presets: [{ id: 'p1', name: '預設集A', imageUrl: 'data:x', left: 10, bottom: 20 }],
      pairings: [{ userId: '1', presetId: 'p1' }],
      selection: { userId: '1', presetId: 'p1' },
    })
    expect(s.users).toEqual([{ id: '1', name: '使用者A' }])
    expect(s.presets).toHaveLength(1)
    expect(s.presets[0].id).toBe('p1')
    expect(s.pairings).toEqual([{ userId: '1', presetId: 'p1' }])
    expect(s.selection).toEqual({ userId: '1', presetId: 'p1' })
  })

  it('擋掉不正確的使用者 / 預設集', () => {
    const s = normalizeState({
      users: [{ id: '1', name: 'ok' }, { id: 2, name: 'bad-id' }, 'nope', { name: 'no-id' }],
      presets: [{ id: 'p1', name: 'ok' }, { name: 'no-id' }, 42, null],
    })
    expect(s.users).toEqual([{ id: '1', name: 'ok' }])
    expect(s.presets).toHaveLength(1)
    expect(s.presets[0].id).toBe('p1')
  })

  it('以預設值補齊不完整的 preset', () => {
    const s = normalizeState({
      users: [],
      presets: [{ id: 'p1', left: 123, speak: { jumpPx: 5 } }],
    })
    const p = s.presets[0]
    expect(p.name).toBe('')
    expect(p.imageUrl).toBe('')
    expect(p.left).toBe(123)
    expect(p.bottom).toBe(DEFAULT_OPTIONS.bottom)
    expect(p.width).toBeUndefined()
    expect(p.dimWhenQuiet).toBe(DEFAULT_OPTIONS.dimWhenQuiet)
    expect(p.hideWhenAway).toBe(DEFAULT_OPTIONS.hideWhenAway)
    expect(p.speak.jumpPx).toBe(5)
    expect(p.speak.outline).toBe(DEFAULT_SPEAK.outline)
    expect(p.speak.outlineColor).toBe(DEFAULT_SPEAK.outlineColor)
    expect(p.speak.outlineWidth).toBe(DEFAULT_SPEAK.outlineWidth)
    expect(p.speak.durationMs).toBe(DEFAULT_SPEAK.durationMs)
  })

  it('保留使用者的 displayName，型別不符時只丟掉 displayName', () => {
    const s = normalizeState({
      users: [
        { id: '1', name: '備忘名', displayName: '畫面名A' },
        { id: '2', name: 'ok' },
        { id: '3', name: '型別不符', displayName: 42 },
      ],
      presets: [],
    })
    // 不因選填欄位的型別不符就丟掉整個使用者（與預設集那邊的方針一致）
    expect(s.users).toEqual([
      { id: '1', name: '備忘名', displayName: '畫面名A' },
      { id: '2', name: 'ok' },
      { id: '3', name: '型別不符' },
    ])
  })

  it('寬度 0 以下改成原尺寸（undefined）', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', width: 0 },
        { id: 'p2', width: -10 },
        { id: 'p3', width: 480 },
      ],
    })
    expect(s.presets[0].width).toBeUndefined()
    expect(s.presets[1].width).toBeUndefined()
    expect(s.presets[2].width).toBe(480)
  })

  it('沒有錨點的舊預設集以預設值（左下）補齊', () => {
    const s = normalizeState({
      users: [],
      presets: [{ id: 'p1', left: 16, bottom: 16 }],
    })
    expect(s.presets[0].anchorX).toBe(DEFAULT_ANCHOR_X)
    expect(s.presets[0].anchorY).toBe(DEFAULT_ANCHOR_Y)
    expect(DEFAULT_ANCHOR_X).toBe('left')
    expect(DEFAULT_ANCHOR_Y).toBe('bottom')
  })

  it('不正確的錨點（另一軸的值 / 數值 / null）改成預設值（左下）', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', anchorX: 'middle', anchorY: 'center' }, // 軸搞錯了
        { id: 'p2', anchorX: 0, anchorY: 1 },
        { id: 'p3', anchorX: null, anchorY: null },
        { id: 'p4', anchorX: 'LEFT', anchorY: 'BOTTOM' },
      ],
    })
    for (const p of s.presets) {
      expect(p.anchorX).toBe(DEFAULT_ANCHOR_X)
      expect(p.anchorY).toBe(DEFAULT_ANCHOR_Y)
    }
  })

  it('正確的錨點原樣保留', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', anchorX: 'right', anchorY: 'top' },
        { id: 'p2', anchorX: 'center', anchorY: 'middle' },
        { id: 'p3', anchorX: 'left', anchorY: 'bottom' },
      ],
    })
    expect(s.presets[0].anchorX).toBe('right')
    expect(s.presets[0].anchorY).toBe('top')
    expect(s.presets[1].anchorX).toBe('center')
    expect(s.presets[1].anchorY).toBe('middle')
    expect(s.presets[2].anchorX).toBe('left')
    expect(s.presets[2].anchorY).toBe('bottom')
  })

  it('只指定一邊的錨點，保留指定的那邊，另一邊改成預設值', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', anchorX: 'right' },
        { id: 'p2', anchorY: 'middle' },
      ],
    })
    expect(s.presets[0].anchorX).toBe('right')
    expect(s.presets[0].anchorY).toBe(DEFAULT_ANCHOR_Y)
    expect(s.presets[1].anchorX).toBe(DEFAULT_ANCHOR_X)
    expect(s.presets[1].anchorY).toBe('middle')
  })

  it('nameLabel 壞掉時（null / 陣列 / 字串）也以預設值補齊', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', nameLabel: null },
        { id: 'p2', nameLabel: [] },
        { id: 'p3', nameLabel: 'nope' },
      ],
    })
    for (const p of s.presets) expect(p.nameLabel).toEqual(DEFAULT_NAME_LABEL)
  })

  it('不正確的 fit 改成預設值', () => {
    const s = normalizeState({
      users: [],
      presets: [
        { id: 'p1', nameLabel: { fit: 'cover' } },
        { id: 'p2', nameLabel: { fit: 'stretch' } },
      ],
    })
    expect(s.presets[0].nameLabel.fit).toBe(DEFAULT_NAME_LABEL.fit)
    expect(s.presets[1].nameLabel.fit).toBe('stretch')
  })

  it('沒有 nameLabel 的舊預設集以預設值（不顯示）補齊', () => {
    const s = normalizeState({ users: [], presets: [{ id: 'p1' }] })
    expect(s.presets[0].nameLabel).toEqual(DEFAULT_NAME_LABEL)
    expect(s.presets[0].nameLabel.show).toBe(false)
  })

  it('以預設值補齊不完整的 nameLabel，不正確的 align 改成預設值', () => {
    const s = normalizeState({
      users: [],
      presets: [{ id: 'p1', nameLabel: { show: true, fontSize: 64, align: 'middle' } }],
    })
    const n = s.presets[0].nameLabel
    expect(n.show).toBe(true)
    expect(n.fontSize).toBe(64)
    expect(n.align).toBe(DEFAULT_NAME_LABEL.align)
    expect(n.outlineColor).toBe(DEFAULT_NAME_LABEL.outlineColor)
    expect(n.offsetY).toBe(DEFAULT_NAME_LABEL.offsetY)
  })

  it('丟掉壞掉的 pairing（參照不存在的 userId / presetId）', () => {
    const s = normalizeState({
      users: [{ id: '1', name: 'a' }],
      presets: [{ id: 'p1', name: 'A' }],
      pairings: [
        { userId: '1', presetId: 'p1' }, // valid
        { userId: '999', presetId: 'p1' }, // 不明的使用者
        { userId: '1', presetId: 'pX' }, // 不明的預設集
        { userId: '1' }, // 格式不正確
      ],
    })
    expect(s.pairings).toEqual([{ userId: '1', presetId: 'p1' }])
  })

  it('重複的 pairing 合併成 1 筆', () => {
    const s = normalizeState({
      users: [{ id: '1', name: 'a' }],
      presets: [{ id: 'p1', name: 'A' }],
      pairings: [
        { userId: '1', presetId: 'p1' },
        { userId: '1', presetId: 'p1' },
      ],
    })
    expect(s.pairings).toEqual([{ userId: '1', presetId: 'p1' }])
  })

  it('保留 selection 的有效參照，懸空參照改成 null', () => {
    const base = {
      users: [{ id: '1', name: 'a' }],
      presets: [{ id: 'p1', name: 'A' }],
    }
    expect(
      normalizeState({ ...base, selection: { userId: '1', presetId: 'p1' } }).selection,
    ).toEqual({ userId: '1', presetId: 'p1' })
    expect(
      normalizeState({ ...base, selection: { userId: '9', presetId: 'p1' } }).selection,
    ).toEqual({ userId: null, presetId: 'p1' })
    expect(
      normalizeState({ ...base, selection: { userId: '1', presetId: 'pX' } }).selection,
    ).toEqual({ userId: '1', presetId: null })
    expect(normalizeState(base).selection).toEqual({ userId: null, presetId: null })
  })
})

describe('cssFilename', () => {
  it('由顯示名稱做出安全的檔名', () => {
    expect(cssFilename('使用者A')).toBe('streamkit-使用者A.css')
    expect(cssFilename('a/b c')).toBe('streamkit-a_b_c.css')
    expect(cssFilename('   ')).toBe('streamkit-streamkit.css')
  })
})
