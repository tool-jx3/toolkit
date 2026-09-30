import { describe, expect, it } from 'vitest'
import {
  generateCombinedCss,
  generateCss,
  generateStandaloneCss,
  tachieBoxSize,
} from './generateCss'
import {
  DEFAULT_OPTIONS,
  type GenerateOptions,
  type NameLabel,
  type SpeakEffect,
  type TachieUser,
} from './types'

const USER_A: TachieUser = {
  id: '123456789012345678',
  name: '使用者A',
  imageUrl: 'data:image/png;base64,AAAABBBBCCCC',
}
const USER_B: TachieUser = {
  id: '987654321098765432',
  name: '使用者B',
  imageUrl: 'data:image/png;base64,DDDDEEEEFFFF',
}

type OptionsOverride = Partial<Omit<GenerateOptions, 'speak' | 'nameLabel'>> & {
  speak?: Partial<SpeakEffect>
  nameLabel?: Partial<NameLabel>
}

const opts = (over: OptionsOverride = {}): GenerateOptions => ({
  ...DEFAULT_OPTIONS,
  ...over,
  speak: { ...DEFAULT_OPTIONS.speak, ...(over.speak ?? {}) },
  nameLabel: { ...DEFAULT_OPTIONS.nameLabel, ...(over.nameLabel ?? {}) },
})

/** 名字顯示開啟的選項（測試用的簡寫）。 */
const nameOn = (over: Partial<NameLabel> = {}, rest: OptionsOverride = {}) =>
  opts({ ...rest, nameLabel: { show: true, ...over } })

describe('generateStandaloneCss（常駐顯示 / body::after）', () => {
  it('以 data URI 把立繪嵌進 :root', () => {
    const css = generateStandaloneCss(USER_A, opts())
    expect(css).toContain(
      `--img-stand-url-123456789012345678: url("data:image/png;base64,AAAABBBBCCCC");`,
    )
  })

  it('以 body::after 常駐顯示，content 參照變數', () => {
    const css = generateStandaloneCss(USER_A, opts())
    expect(css).toContain('body::after {')
    expect(css).toContain('content: var(--img-stand-url-123456789012345678);')
    expect(css).toContain('position: fixed;')
  })

  it('反映位置（left/bottom）', () => {
    const css = generateStandaloneCss(USER_A, opts({ left: 40, bottom: 24 }))
    expect(css).toContain('left: 40px;')
    expect(css).toContain('bottom: 24px;')
  })

  it('只有指定 width 時才輸出寬度', () => {
    expect(generateStandaloneCss(USER_A, opts({ width: 480 }))).toContain(
      'width: 480px;',
    )
    expect(generateStandaloneCss(USER_A, opts({ width: undefined }))).not.toContain(
      'width:',
    )
  })

  it('以 :has() 偵測說話，使用前綴比對選擇器', () => {
    const css = generateStandaloneCss(USER_A, opts())
    expect(css).toContain(
      'body:has(img[src*="avatars/123456789012345678"][class*="Voice_avatarSpeaking__"])::after',
    )
  })

  it('隱藏實際元素（img / 名字）', () => {
    const css = generateStandaloneCss(USER_A, opts())
    expect(css).toMatch(/img\s*\{\s*display: none !important;/)
    expect(css).toContain('[class*="Voice_name__"]')
  })

  it('啟用彈跳時輸出 speak-jump keyframe 與 animation', () => {
    const css = generateStandaloneCss(USER_A, opts({ speak: { jumpPx: 12 } }))
    expect(css).toContain('@keyframes speak-jump')
    expect(css).toContain('translateY(-12px)')
    expect(css).toContain('speak-jump')
  })

  it('效果全關時不輸出 :has() 規則也不輸出 keyframe（＝靜止）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ speak: { bounce: false, outline: false, blink: false } }),
    )
    expect(css).not.toContain(':has(')
    expect(css).not.toContain('@keyframes')
    // 立繪本身還在
    expect(css).toContain('body::after {')
  })

  it('外框・閃爍・彈跳可以個別切換', () => {
    const jumpOnly = generateStandaloneCss(
      USER_A,
      opts({ speak: { outline: false, blink: false } }),
    )
    expect(jumpOnly).toContain('@keyframes speak-jump')
    expect(jumpOnly).not.toContain('@keyframes speak-light')
    expect(jumpOnly).not.toContain('@keyframes speak-blink')

    const lightOnly = generateStandaloneCss(
      USER_A,
      opts({ speak: { bounce: false, blink: false } }),
    )
    expect(lightOnly).toContain('@keyframes speak-light')
    expect(lightOnly).not.toContain('@keyframes speak-jump')

    const blinkOnly = generateStandaloneCss(
      USER_A,
      opts({ speak: { bounce: false, outline: false, blink: true } }),
    )
    expect(blinkOnly).toContain('@keyframes speak-blink')
    expect(blinkOnly).toContain('speak-blink')
    expect(blinkOnly).not.toContain('@keyframes speak-jump')
    expect(blinkOnly).not.toContain('@keyframes speak-light')
  })

  it('反映外框・光暈的寬度（outlineWidth）（預設 2 與原本相同，改變時 blur/位移連動）', () => {
    // 預設 width=2 → blur 2↔8，位移 ±2（相當於原本）
    const w2 = generateStandaloneCss(USER_A, opts({ speak: { outlineColor: '#ff0000' } }))
    expect(w2).toContain('drop-shadow(0 0 2px #ff0000)')
    expect(w2).toContain('drop-shadow(2px 2px 0px #ff0000)')
    expect(w2).toContain('drop-shadow(0 0 8px #ff0000)')
    // width=4 → blur 4↔16，位移 ±4
    const w4 = generateStandaloneCss(
      USER_A,
      opts({ speak: { outlineColor: '#ff0000', outlineWidth: 4 } }),
    )
    expect(w4).toContain('drop-shadow(0 0 4px #ff0000)')
    expect(w4).toContain('drop-shadow(4px 4px 0px #ff0000)')
    expect(w4).toContain('drop-shadow(-4px -4px 0px #ff0000)')
    expect(w4).toContain('drop-shadow(0 0 16px #ff0000)')
  })

  it('反映外框・光暈的顏色，不正確的顏色改成白色', () => {
    const red = generateStandaloneCss(USER_A, opts({ speak: { outlineColor: '#ff0000' } }))
    expect(red).toContain('drop-shadow(0 0 2px #ff0000)')
    const bad = generateStandaloneCss(
      USER_A,
      opts({ speak: { outlineColor: 'red; }body{display:none' } }),
    )
    expect(bad).toContain('drop-shadow(0 0 2px #FFFFFF)')
    expect(bad).not.toContain('display:none')
  })

  it('把安靜的人調暗：沒說話時調暗・說話時恢復亮度', () => {
    const css = generateStandaloneCss(USER_A, opts({ dimWhenQuiet: true }))
    // body::after 預設是暗的
    expect(css).toMatch(/body::after \{[^}]*filter: brightness\(50%\)/)
    // outline（light）動畫帶有 filter，所以說話中會恢復亮度（不需明確寫 brightness）
    expect(css).toContain(':has(')
  })

  it('把安靜的人調暗（只有閃爍）：在說話規則裡明確恢復亮度', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ dimWhenQuiet: true, speak: { bounce: false, outline: false, blink: true } }),
    )
    expect(css).toMatch(/:has\([^)]*\)::after \{[^}]*filter: brightness\(100%\)/)
  })

  it('不在通話中時隱藏：hideWhenAway 時只在在場時顯示', () => {
    const on = generateStandaloneCss(USER_A, opts({ hideWhenAway: true }))
    // body::after 預設不顯示
    expect(on).toMatch(/body::after \{[^}]*display: none/)
    // 只在在場（以 :has 偵測到 img）時恢復顯示
    expect(on).toMatch(
      /body:has\(img\[src\*="avatars\/123456789012345678"\]\)::after \{\s*display: block/,
    )

    const off = generateStandaloneCss(USER_A, opts({ hideWhenAway: false }))
    // 預設是常駐顯示（block），不輸出在場偵測的顯示規則
    expect(off).toMatch(/body::after \{[^}]*display: block/)
    expect(off).not.toMatch(
      /body:has\(img\[src\*="avatars\/[0-9]+"\]\)::after \{\s*display: block/,
    )
  })
})

describe('錨點（9 種基準位置）', () => {
  /** 只切出 body::after 區塊（避免抓到說話規則或 keyframe）。 */
  const afterBlock = (css: string): string => {
    const m = /\nbody::after \{\n([\s\S]*?)\n\}/.exec(css)
    if (!m) throw new Error('找不到 body::after 區塊')
    return m[1]
  }

  /** 逐行只抓與位置有關的宣言。 */
  const positionLines = (css: string): string[] =>
    afterBlock(css)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(left|right|top|bottom|transform):/.test(l))

  const anchored = (anchorX: 'left' | 'center' | 'right', anchorY: 'top' | 'middle' | 'bottom') =>
    generateStandaloneCss(USER_A, opts({ anchorX, anchorY, left: 40, bottom: 24 }))

  // 9 種。「距錨點的距離」輸出到哪個位置屬性，是否加上置中的 translate。
  const CASES: Array<{
    x: 'left' | 'center' | 'right'
    y: 'top' | 'middle' | 'bottom'
    lines: string[]
  }> = [
    { x: 'left', y: 'bottom', lines: ['left: 40px;', 'bottom: 24px;'] },
    { x: 'left', y: 'top', lines: ['left: 40px;', 'top: 24px;'] },
    {
      x: 'left',
      y: 'middle',
      lines: ['left: 40px;', 'bottom: calc(50% + 24px);', 'transform: translateY(50%);'],
    },
    { x: 'right', y: 'bottom', lines: ['right: 40px;', 'bottom: 24px;'] },
    { x: 'right', y: 'top', lines: ['right: 40px;', 'top: 24px;'] },
    {
      x: 'right',
      y: 'middle',
      lines: ['right: 40px;', 'bottom: calc(50% + 24px);', 'transform: translateY(50%);'],
    },
    {
      x: 'center',
      y: 'bottom',
      lines: ['left: calc(50% + 40px);', 'bottom: 24px;', 'transform: translateX(-50%);'],
    },
    {
      x: 'center',
      y: 'top',
      lines: ['left: calc(50% + 40px);', 'top: 24px;', 'transform: translateX(-50%);'],
    },
    {
      x: 'center',
      y: 'middle',
      lines: [
        'left: calc(50% + 40px);',
        'bottom: calc(50% + 24px);',
        'transform: translateX(-50%) translateY(50%);',
      ],
    },
  ]

  for (const c of CASES) {
    it(`${c.x} × ${c.y} 的位置宣言`, () => {
      expect(positionLines(anchored(c.x, c.y))).toEqual(c.lines)
    })
  }

  it('未指定（已儲存的舊資料）當成左下讀入', () => {
    const legacy = opts({ left: 40, bottom: 24 })
    delete legacy.anchorX
    delete legacy.anchorY
    expect(positionLines(generateStandaloneCss(USER_A, legacy))).toEqual([
      'left: 40px;',
      'bottom: 24px;',
    ])
    // 與明確指定 left/bottom 時逐位元組一致（確認預設值只在一處解析）。
    expect(generateStandaloneCss(USER_A, legacy)).toBe(
      generateStandaloneCss(USER_A, opts({ anchorX: 'left', anchorY: 'bottom', left: 40, bottom: 24 })),
    )
  })

  it('偏移 0 的中央不輸出 calc，維持 50%', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ anchorX: 'center', anchorY: 'middle', left: 0, bottom: 0 }),
    )
    expect(positionLines(css)).toEqual([
      'left: 50%;',
      'bottom: 50%;',
      'transform: translateX(-50%) translateY(50%);',
    ])
  })

  it('中央的偏移為負時反向（calc 的正負號分開輸出）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ anchorX: 'center', anchorY: 'middle', left: -30, bottom: -12 }),
    )
    expect(css).toContain('left: calc(50% - 30px);')
    expect(css).toContain('bottom: calc(50% - 12px);')
  })

  it('寬度為原尺寸（未指定 width）也能置中（因為拉回自身尺寸的一半）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ anchorX: 'center', left: 0, width: undefined }),
    )
    expect(css).toContain('left: 50%;')
    expect(css).toContain('transform: translateX(-50%);')
    expect(css).not.toContain('width:')
  })

  it('左下（預設）不輸出 transform', () => {
    expect(afterBlock(generateStandaloneCss(USER_A, opts()))).not.toContain('transform')
  })
})

describe('transform 的衝突（置中 × 說話效果）', () => {
  it('置中 + 彈跳時把置中部分織進 keyframe（立繪不會飛走）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ anchorX: 'center', left: 0, speak: { bounce: true, jumpPx: 12 } }),
    )
    expect(css).toContain(`@keyframes speak-jump {
  0% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-12px); }
  100% { transform: translateX(-50%) translateY(0); }
}`)
  })

  it('中央 × 中央 + 彈跳時水平、垂直的置中都保留', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ anchorX: 'center', anchorY: 'middle', left: 0, bottom: 0, speak: { jumpPx: 8 } }),
    )
    expect(css).toContain('50% { transform: translateX(-50%) translateY(50%) translateY(-8px); }')
    // 靜止時與動畫使用相同的置中片段（防止只改到一邊的事故）。
    expect(css).toContain('transform: translateX(-50%) translateY(50%);')
  })

  it('左下（沒有置中）的 keyframe 照舊只有 translateY', () => {
    const css = generateStandaloneCss(USER_A, opts({ speak: { jumpPx: 10 } }))
    expect(css).toContain(`@keyframes speak-jump {
  0% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0); }
}`)
  })

  it('名字條的錨點也經過同一個合成函式（字幕條的 translate 單獨輸出）', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'text', align: 'center' }, { width: 400 }),
    )
    expect(css).toMatch(/body::before \{[^}]*transform: translateX\(-50%\);/)
  })

  it('名字條靠左時不輸出 transform（空的合成不輸出宣言）', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'text', align: 'left' }, { width: 400 }),
    )
    const before = /body::before \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(before).not.toContain('transform')
  })
})

describe('名字標籤跟隨錨點（T9）', () => {
  /** 逐行只抓 body::before 裡與位置有關的宣言。 */
  const namePositionLines = (css: string): string[] => {
    const m = /\nbody::before \{\n([\s\S]*?)\n\}/.exec(css)
    if (!m) throw new Error('找不到 body::before 區塊')
    return m[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(left|right|top|bottom|transform):/.test(l))
  }

  // 立繪是「距錨點 40 / 24」，名字是「相對立繪往右 10・往下 8」。
  const TACHIE = { left: 40, bottom: 24 }
  const OFFSET = { offsetX: 10, offsetY: -8 }

  const named = (
    anchorX: 'left' | 'center' | 'right',
    anchorY: 'top' | 'middle' | 'bottom',
    over: Partial<NameLabel> = {},
    rest: OptionsOverride = {},
  ) => generateStandaloneCss(USER_A, nameOn({ ...OFFSET, ...over }, { ...TACHIE, ...rest, anchorX, anchorY }))

  describe('偏移的正負號（換算成以錨點為基準的距離）', () => {
    it('左錨點是相加（照舊）', () => {
      expect(namePositionLines(named('left', 'bottom', {}, { width: 400 }))).toEqual([
        'left: 50px;', // 40 + 10
        'bottom: 16px;', // 24 + (-8)
      ])
    })

    it('**右錨點時 offsetX 的正負號反轉**（距右緣的距離減少）', () => {
      expect(namePositionLines(named('right', 'bottom', {}, { width: 400 }))).toEqual([
        'right: 30px;', // 40 - 10
        'bottom: 16px;',
      ])
    })

    it('**上錨點時 offsetY 的正負號反轉**（距上緣的距離增加＝往下）', () => {
      expect(namePositionLines(named('left', 'top', {}, { width: 400 }))).toEqual([
        'left: 50px;',
        'top: 32px;', // 24 - (-8)
      ])
    })

    it('垂直中央維持以下緣為基準（正的 offsetY = 往上）', () => {
      expect(namePositionLines(named('left', 'middle', {}, { width: 400 }))).toEqual([
        'left: 50px;',
        'bottom: calc(50% + 16px);',
        'transform: translateY(50%);',
      ])
    })
  })

  describe('字幕條配合文字寬度的模式（依對齊方式移動抓取點）', () => {
    const hug: Partial<NameLabel> = { background: true, fit: 'text' }

    it('左錨點 × 對齊（照舊 加上立繪寬度再以自身尺寸拉回）', () => {
      expect(namePositionLines(named('left', 'bottom', { ...hug, align: 'left' }, { width: 400 }))).toEqual([
        'left: 50px;',
        'bottom: 16px;',
      ])
      expect(namePositionLines(named('left', 'bottom', { ...hug, align: 'center' }, { width: 400 }))).toEqual([
        'left: 250px;', // 50 + 400/2
        'bottom: 16px;',
        'transform: translateX(-50%);',
      ])
      expect(namePositionLines(named('left', 'bottom', { ...hug, align: 'right' }, { width: 400 }))).toEqual([
        'left: 450px;', // 50 + 400
        'bottom: 16px;',
        'transform: translateX(-100%);',
      ])
    })

    it('**右錨點時對齊的 translate 方向也反轉**', () => {
      // 靠右緣＝錨點的自然位置，所以不會出現立繪寬度也不會出現 translate。
      expect(namePositionLines(named('right', 'bottom', { ...hug, align: 'right' }, { width: 400 }))).toEqual([
        'right: 30px;',
        'bottom: 16px;',
      ])
      expect(namePositionLines(named('right', 'bottom', { ...hug, align: 'center' }, { width: 400 }))).toEqual([
        'right: 230px;', // 30 + 400/2
        'bottom: 16px;',
        'transform: translateX(50%);', // 與左錨點的 -50% 反向
      ])
      expect(namePositionLines(named('right', 'bottom', { ...hug, align: 'left' }, { width: 400 }))).toEqual([
        'right: 430px;', // 30 + 400
        'bottom: 16px;',
        'transform: translateX(100%);', // 與左錨點的 -100% 反向
      ])
    })

    it('中央錨點 × 置中不需要立繪寬度（抓取點與自然位置相同）', () => {
      expect(namePositionLines(named('center', 'bottom', { ...hug, align: 'center' }, { width: 400 }))).toEqual([
        'left: calc(50% + 50px);', // 40 + 10
        'bottom: 16px;',
        'transform: translateX(-50%);',
      ])
    })

    it('中央錨點 × 靠左/靠右時以立繪寬度移動一半', () => {
      expect(namePositionLines(named('center', 'bottom', { ...hug, align: 'left' }, { width: 400 }))).toEqual([
        'left: calc(50% - 150px);', // 50 - 400/2
        'bottom: 16px;',
      ])
      expect(namePositionLines(named('center', 'bottom', { ...hug, align: 'right' }, { width: 400 }))).toEqual([
        'left: calc(50% + 250px);', // 50 + 400/2
        'bottom: 16px;',
        'transform: translateX(-100%);',
      ])
    })

    it('不知道立繪寬度時退回錨點的自然位置（沒有寬度也能成立的唯一選擇）', () => {
      // 未指定 width + 沒有實測 → 無法套用對齊。
      const right = named('right', 'bottom', { ...hug, align: 'center' }, { width: undefined })
      expect(namePositionLines(right)).toEqual(['right: 30px;', 'bottom: 16px;'])
      const left = named('left', 'bottom', { ...hug, align: 'center' }, { width: undefined })
      expect(namePositionLines(left)).toEqual(['left: 50px;', 'bottom: 16px;'])
      const center = named('center', 'bottom', { ...hug, align: 'left' }, { width: undefined })
      expect(namePositionLines(center)).toEqual([
        'left: calc(50% + 50px);',
        'bottom: 16px;',
        'transform: translateX(-50%);',
      ])
    })
  })

  it('立繪與名字使用同一個錨點的位置屬性（不會出現在另一側）', () => {
    const css = named('right', 'top', {}, { width: 400 })
    // 兩者都以 right/top 為基準。只有一邊寫成 left/bottom 的話就會出現在畫面另一側。
    expect(css).toMatch(/body::after \{[^}]*right: 40px;[^}]*top: 24px;/)
    expect(css).toMatch(/body::before \{[^}]*right: 30px;[^}]*top: 32px;/)
    expect(css).not.toMatch(/body::before \{[^}]*\bleft:/)
  })

  it('實測寬度的注記只在真的用到寬度時輸出', () => {
    const usesWidth = generateStandaloneCss(
      USER_A,
      nameOn(
        { ...OFFSET, background: true, fit: 'text', align: 'left' },
        { ...TACHIE, anchorX: 'right', anchorY: 'bottom', width: undefined, imageNaturalWidth: 400 },
      ),
    )
    expect(usesWidth).toContain('位置合わせの基準幅 400px は立ち絵画像の実サイズ')

    // 右錨點 × 靠右緣不需要寬度 → 不輸出注記
    const noWidth = generateStandaloneCss(
      USER_A,
      nameOn(
        { ...OFFSET, background: true, fit: 'text', align: 'right' },
        { ...TACHIE, anchorX: 'right', anchorY: 'bottom', width: undefined, imageNaturalWidth: 400 },
      ),
    )
    expect(noWidth).not.toContain('位置合わせの基準幅')
  })
})

describe('名字顯示（body::before / 任意文字）', () => {
  it('預設（不顯示）時不輸出 body::before', () => {
    const css = generateStandaloneCss(USER_A, opts())
    expect(css).not.toContain('body::before')
  })

  it('顯示開啟時把 displayName 輸出到 content（優先於備忘名稱）', () => {
    const css = generateStandaloneCss({ ...USER_A, displayName: '畫面名A' }, nameOn())
    expect(css).toContain('body::before {')
    expect(css).toContain('content: "畫面名A";')
    expect(css).not.toContain('content: "使用者A";')
  })

  it('displayName 為空時使用備忘用的顯示名稱', () => {
    expect(generateStandaloneCss(USER_A, nameOn())).toContain('content: "使用者A";')
    expect(generateStandaloneCss({ ...USER_A, displayName: '   ' }, nameOn())).toContain(
      'content: "使用者A";',
    )
  })

  it('名字為空時即使顯示開啟也不輸出 body::before', () => {
    const css = generateStandaloneCss({ ...USER_A, name: '', displayName: '' }, nameOn())
    expect(css).not.toContain('body::before')
    // 立繪照舊輸出
    expect(css).toContain('body::after {')
  })

  it('位置以立繪的 left/bottom 加上偏移的數值輸出', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ offsetX: 12, offsetY: -20 }, { left: 100, bottom: 40 }),
    )
    expect(css).toMatch(/body::before \{[^}]*left: 112px;/)
    expect(css).toMatch(/body::before \{[^}]*bottom: 20px;/)
  })

  it('反映文字大小・顏色・粗體・描邊', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ fontSize: 48, color: '#ff0000', bold: false, outlineWidth: 2, outlineColor: '#000000' }),
    )
    expect(css).toContain('font-size: 48px;')
    expect(css).toContain('font-weight: 400;')
    expect(css).toContain('color: #ff0000;')
    expect(css).toContain('text-shadow: 2px 0px 0 #000000,')
    expect(css).toContain('-2px -2px 0 #000000;')
  })

  it('描邊關閉時不輸出 text-shadow', () => {
    expect(generateStandaloneCss(USER_A, nameOn({ outline: false }))).not.toContain('text-shadow')
  })

  it('對齊與寬度只在框寬確定時輸出（沒有寬度也沒有實測時不輸出）', () => {
    const withWidth = generateStandaloneCss(USER_A, nameOn({ align: 'center' }, { width: 480 }))
    expect(withWidth).toMatch(/body::before \{[^}]*width: 480px;/)
    expect(withWidth).toContain('text-align: center;')

    const noWidth = generateStandaloneCss(USER_A, nameOn({ align: 'center' }))
    expect(noWidth).not.toContain('text-align:')
  })

  it('寬度為原尺寸時，有圖片實際尺寸就拿來當對齊的框寬（附注記）', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ align: 'center' }, { width: undefined, imageNaturalWidth: 640 }),
    )
    expect(css).toMatch(/body::before \{[^}]*width: 640px;/)
    expect(css).toContain('text-align: center;')
    // 立繪本身維持原尺寸（body::after 不輸出 width）
    expect(css).not.toMatch(/body::after \{[^}]*width:/)
    // 看得出是寫死的注記
    expect(css).toContain('立ち絵画像の実サイズ')
  })

  it('有明確指定 width 時優先於實測', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ align: 'right' }, { width: 300, imageNaturalWidth: 640 }),
    )
    expect(css).toMatch(/body::before \{[^}]*width: 300px;/)
    expect(css).not.toContain('width: 640px;')
    expect(css).not.toContain('立ち絵画像の実サイズ')
  })

  it('實測為 0 / 未指定時不輸出框寬', () => {
    const zero = generateStandaloneCss(USER_A, nameOn({}, { imageNaturalWidth: 0 }))
    expect(zero).not.toContain('text-align:')
    const none = generateStandaloneCss(USER_A, nameOn({}, { imageNaturalWidth: undefined }))
    expect(none).not.toContain('text-align:')
  })

  it('字型名稱只在指定時輸出，去掉危險字元並加上引號', () => {
    expect(generateStandaloneCss(USER_A, nameOn())).not.toContain('font-family:')
    expect(generateStandaloneCss(USER_A, nameOn({ fontFamily: 'Noto Sans TC, 微軟正黑體' }))).toContain(
      'font-family: "Noto Sans TC", "微軟正黑體";',
    )
    const injected = generateStandaloneCss(
      USER_A,
      nameOn({ fontFamily: 'x; } body { display: none' }),
    )
    expect(injected).toContain('font-family: "x body display none";')
    expect(injected).not.toContain('} body {')
  })

  it('數字開頭・含句點的字型名稱也加上引號，成為有效的宣言', () => {
    // 不加引號的識別字不能以數字開頭，整條宣言會被丟掉（默默地沒有效果）
    expect(generateStandaloneCss(USER_A, nameOn({ fontFamily: '07粉圓體' }))).toContain(
      'font-family: "07粉圓體";',
    )
    expect(generateStandaloneCss(USER_A, nameOn({ fontFamily: 'Foo.Bar' }))).toContain(
      'font-family: "Foo.Bar";',
    )
    // 通用字族希望被當成關鍵字解讀，所以不加引號
    expect(
      generateStandaloneCss(USER_A, nameOn({ fontFamily: 'Meiryo, sans-serif' })),
    ).toContain('font-family: "Meiryo", sans-serif;')
    // CSS 全域關鍵字加上引號後就成了字族名稱（防止非預期的繼承・初始化）
    expect(generateStandaloneCss(USER_A, nameOn({ fontFamily: 'inherit' }))).toContain(
      'font-family: "inherit";',
    )
  })

  it('備忘名稱無法關閉 CSS 註解', () => {
    const css = generateStandaloneCss(
      { ...USER_A, name: '*/ body { display: none } /*', displayName: '畫面名A' },
      nameOn(),
    )
    expect(css).not.toContain('*/ body { display: none }')
    expect(css).toContain('* / body { display: none } /*')
    // :root 區塊沒有被切開（變數定義留在同一個區塊裡）
    expect(css).toMatch(/:root \{[\s\S]*?--img-stand-url-123456789012345678:[\s\S]*?\n\}/)
  })

  it('文字大小 0（清空輸入欄時）捨入成 1px', () => {
    expect(generateStandaloneCss(USER_A, nameOn({ fontSize: 0 }))).toContain('font-size: 1px;')
  })

  it('描邊開啟但寬度為 0 時不輸出 text-shadow', () => {
    expect(generateStandaloneCss(USER_A, nameOn({ outline: true, outlineWidth: 0 }))).not.toContain(
      'text-shadow',
    )
  })

  it('位置是小數時也捨入成好讀的位數', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ offsetX: 0.05, offsetY: -8.2 }, { left: 16.1, bottom: 16.1 }),
    )
    expect(css).toMatch(/body::before \{[^}]*left: 16.15px;/)
    expect(css).toMatch(/body::before \{[^}]*bottom: 7.9px;/)
  })

  it('立繪寬度 0 不當作框寬（不以會讓立繪消失的指定為基準）', () => {
    const css = generateStandaloneCss(USER_A, nameOn({ align: 'center' }, { width: 0 }))
    expect(css).not.toContain('text-align:')
  })

  it('對齊 × 字幕條寬度模式的組合', () => {
    // 背景關閉 + 指定 stretch → 照舊 width + text-align（不輸出背景）
    const noBg = generateStandaloneCss(
      USER_A,
      nameOn({ background: false, fit: 'stretch', align: 'right' }, { width: 400 }),
    )
    expect(noBg).toMatch(/body::before \{[^}]*width: 400px;/)
    expect(noBg).toContain('text-align: right;')
    expect(noBg).not.toContain('background:')

    // stretch + 靠左
    const stretchLeft = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'stretch', align: 'left' }, { left: 100, width: 400 }),
    )
    expect(stretchLeft).toContain('text-align: left;')
    expect(stretchLeft).toMatch(/body::before \{[^}]*left: 100px;/)

    // hug + 沒有框寬 → 忽略 align，相當於靠左（也不輸出錨定）
    const hugNoWidth = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'text', align: 'center' }, { left: 100 }),
    )
    expect(hugNoWidth).toMatch(/body::before \{[^}]*left: 100px;/)
    expect(hugNoWidth).not.toMatch(/body::before \{[^}]*transform:/)

    // stretch + 沒有框寬 → 不輸出 width，所以實際是文字寬度（也確認沒有注記）
    expect(
      generateStandaloneCss(
        USER_A,
        nameOn({ background: true, fit: 'stretch', align: 'center' }, { left: 100 }),
      ),
    ).not.toMatch(/body::before \{[^}]*width:/)
  })

  it('合併版（combined）不輸出名字', () => {
    const css = generateCombinedCss([USER_A], nameOn())
    expect(css).not.toContain('body::before')
  })

  it('名字裡的雙引號・反斜線・換行不會弄壞 CSS', () => {
    const css = generateStandaloneCss(
      { ...USER_A, displayName: 'a"b\\c\nd' },
      nameOn(),
    )
    expect(css).toContain('content: "a\\"b\\\\c d";')
  })

  it('不正確的文字顏色・描邊顏色改成白色', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ color: 'red; } body { display:none', outlineColor: 'nope' }),
    )
    expect(css).toContain('color: #FFFFFF;')
    expect(css).toContain('0 #FFFFFF')
    expect(css).not.toContain('display:none')
  })

  it('hideWhenAway 時名字也只在在場時顯示', () => {
    const css = generateStandaloneCss(USER_A, nameOn({}, { hideWhenAway: true }))
    expect(css).toMatch(/body::before \{[^}]*display: none;/)
    expect(css).toContain(
      'body:has(img[src*="avatars/123456789012345678"])::before,\nbody:has(img[src*="avatars/123456789012345678"])::after {',
    )
  })

  it('背景關閉（預設）時不輸出 background / padding', () => {
    const css = generateStandaloneCss(USER_A, nameOn())
    expect(css).not.toContain('background:')
    expect(css).not.toContain('padding:')
    // 與 keyframes 那邊的 transform 無關，名字區塊不輸出
    expect(css).not.toMatch(/body::before \{[^}]*transform:/)
  })

  it('背景開啟（配合文字）：字幕條為文字寬度＝不輸出 width，以 transform 對位', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn(
        { background: true, fit: 'text', align: 'center', backgroundOpacity: 60 },
        { left: 100, width: 400 },
      ),
    )
    expect(css).toMatch(/body::before \{[^}]*background: rgba\(0, 0, 0, 0\.6\);/)
    expect(css).toContain('padding: 6px 12px;')
    expect(css).toContain('border-radius: 6px;')
    // 字幕條會縮成文字寬度，所以不輸出 width / text-align
    expect(css).not.toMatch(/body::before \{[^}]*width:/)
    expect(css).not.toContain('text-align:')
    // 錨定到立繪的中央（100 + 400/2）
    expect(css).toMatch(/body::before \{[^}]*left: 300px;/)
    expect(css).toContain('transform: translateX(-50%);')
  })

  it('背景開啟（鋪滿立繪寬度）：輸出 width + text-align + box-sizing', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'stretch', align: 'center' }, { left: 100, width: 400 }),
    )
    expect(css).toMatch(/body::before \{[^}]*width: 400px;/)
    expect(css).toContain('text-align: center;')
    expect(css).toContain('box-sizing: border-box;')
    expect(css).toMatch(/body::before \{[^}]*left: 100px;/)
    expect(css).not.toMatch(/body::before \{[^}]*transform:/)
  })

  it('字幕條靠右時錨定右緣，靠左時不錨定', () => {
    const right = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'text', align: 'right' }, { left: 100, width: 400 }),
    )
    expect(right).toMatch(/body::before \{[^}]*left: 500px;/)
    expect(right).toContain('transform: translateX(-100%);')

    const leftAligned = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, fit: 'text', align: 'left' }, { left: 100, width: 400 }),
    )
    expect(leftAligned).toMatch(/body::before \{[^}]*left: 100px;/)
    expect(leftAligned).not.toMatch(/body::before \{[^}]*transform:/)
  })

  it('反映字幕條的顏色・不透明度・留白 0・圓角 0', () => {
    const css = generateStandaloneCss(
      USER_A,
      nameOn({
        background: true,
        backgroundColor: '#ff0000',
        backgroundOpacity: 100,
        backgroundPadX: 0,
        backgroundPadY: 0,
        backgroundRadius: 0,
      }),
    )
    expect(css).toContain('background: rgba(255, 0, 0, 1);')
    expect(css).not.toContain('padding:')
    expect(css).not.toContain('border-radius:')
  })

  it('字幕條顏色不正確時改成白色，不透明度限制在 0–100', () => {
    const bad = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, backgroundColor: 'red; } body { display:none', backgroundOpacity: 999 }),
    )
    expect(bad).toContain('background: rgba(255, 255, 255, 1);')
    expect(bad).not.toContain('display:none')

    const negative = generateStandaloneCss(
      USER_A,
      nameOn({ background: true, backgroundColor: '#000000', backgroundOpacity: -50 }),
    )
    expect(negative).toContain('background: rgba(0, 0, 0, 0);')
  })

  it('放在立繪前面（因為 ::after 比較晚繪製）', () => {
    expect(generateStandaloneCss(USER_A, nameOn())).toMatch(/body::before \{[^}]*z-index: 1;/)
  })
})

describe('名字關閉時的輸出（相對 001 不退化）', () => {
  it('沒有效果・名字關閉時的輸出與預期的字串一致', () => {
    // 距離明確傳入 001 當時的預設值（16/16）。這裡是固定「是否與 001 的輸出一致」的地方，
    // 所以**不跟著現在的預設值走**（預設值之後可能會變）。
    const css = generateStandaloneCss(
      USER_A,
      opts({ left: 16, bottom: 16, speak: { bounce: false, outline: false, blink: false } }),
    )
    expect(css).toBe(
      `:root {
  /* 使用者A (123456789012345678) */
  --img-stand-url-123456789012345678: url("data:image/png;base64,AAAABBBBCCCC");
}

/* 立ち絵は body::after ただ1つで描画（唯一の描画源＝位置ズレが起きない）。
   Streamkit の実要素は全部隠し、発話だけ検知して body::after を演出する。 */

body, #root {
  overflow: hidden !important;
}

/* 立ち絵（常時表示：通話に居ても居なくても同じ位置） */
body::after {
  content: var(--img-stand-url-123456789012345678);
  position: fixed;
  left: 16px;
  bottom: 16px;
  display: block;
}

img {
  display: none !important;
}

[class*="Voice_name__"], [class*="Voice_user__"] {
  display: none !important;
}
`,
    )
  })
})

describe('tachieBoxSize', () => {
  it('指定寬度時維持長寬比縮放', () => {
    expect(tachieBoxSize(300, 600, 900)).toEqual({ width: 300, height: 450 })
    expect(tachieBoxSize(301, 600, 900)).toEqual({ width: 301, height: 452 })
  })

  it('寬度未指定・0 時為實際尺寸', () => {
    expect(tachieBoxSize(undefined, 600, 900)).toEqual({ width: 600, height: 900 })
    expect(tachieBoxSize(0, 600, 900)).toEqual({ width: 600, height: 900 })
  })

  it('實際尺寸不齊全時為 null', () => {
    expect(tachieBoxSize(300, undefined, 900)).toBeNull()
    expect(tachieBoxSize(300, 600, undefined)).toBeNull()
    expect(tachieBoxSize(300, 0, 900)).toBeNull()
    expect(tachieBoxSize(300, 600, 0)).toBeNull()
  })
})

describe('背景圖片方式', () => {
  it('有實際尺寸時以背景圖片方式輸出（指定寬度）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ width: 300, imageNaturalWidth: 600, imageNaturalHeight: 900 }),
    )
    expect(css).toContain('content: "";')
    expect(css).toContain('width: 300px;')
    expect(css).toContain('height: 450px;')
    expect(css).toContain('background-image: var(--img-stand-url-123456789012345678);')
    expect(css).toContain('background-size: contain;')
    expect(css).toContain('background-repeat: no-repeat;')
    expect(css).toContain('background-position: center;')
    expect(css).not.toContain('content: var(--img-stand-url-')
  })

  it('只有背景方式會輸出換圖的注記', () => {
    const withNatural = generateStandaloneCss(
      USER_A,
      opts({ width: 300, imageNaturalWidth: 600, imageNaturalHeight: 900 }),
    )
    expect(withNatural).toContain(
      '描画サイズ 300x450px は立ち絵画像の実サイズから算出。**画像を差し替えたらCSSを出し直すこと**。',
    )
    const withoutNatural = generateStandaloneCss(USER_A, opts({ width: 300 }))
    expect(withoutNatural).not.toContain('画像を差し替えたらCSSを出し直すこと')
  })

  it('有實際尺寸時以背景圖片方式輸出（原尺寸）', () => {
    const css = generateStandaloneCss(
      USER_A,
      opts({ width: undefined, imageNaturalWidth: 600, imageNaturalHeight: 900 }),
    )
    expect(css).toContain('width: 600px;')
    expect(css).toContain('height: 900px;')
  })

  it('沒有實際尺寸時輸出照舊', () => {
    const a = generateStandaloneCss(USER_A, opts({ width: 300 }))
    const b = generateStandaloneCss(USER_A, opts({ width: 300, imageNaturalWidth: 600 }))
    expect(a).toBe(b)
    expect(a).toContain('content: var(--img-stand-url-')
    expect(a).toContain('width: 300px;')
    expect(a).not.toContain('background-size')
  })

  it('中央錨點的 transform 不因方式而改變', () => {
    const base = opts({ anchorX: 'center', anchorY: 'middle', width: 300 })
    const withNatural = opts({
      anchorX: 'center',
      anchorY: 'middle',
      width: 300,
      imageNaturalWidth: 600,
      imageNaturalHeight: 900,
    })
    const transformLines = (css: string) =>
      css.split('\n').filter((line) => /^\s*transform:/.test(line))
    expect(transformLines(generateStandaloneCss(USER_A, base))).toEqual(
      transformLines(generateStandaloneCss(USER_A, withNatural)),
    )
  })
})

describe('generateCombinedCss（合併 / per-img）', () => {
  it('把所有使用者的立繪排在 :root', () => {
    const css = generateCombinedCss([USER_A, USER_B], opts())
    expect(css).toContain('--img-stand-url-123456789012345678:')
    expect(css).toContain('--img-stand-url-987654321098765432:')
  })

  it('逐人替換 img[src*="avatars/<id>"]', () => {
    const css = generateCombinedCss([USER_A, USER_B], opts())
    expect(css).toContain('img[src*="avatars/123456789012345678"] {')
    expect(css).toContain('img[src*="avatars/987654321098765432"] {')
    expect(css).toContain('content: var(--img-stand-url-987654321098765432);')
  })

  it('說話效果套用在前綴比對的 class 上', () => {
    const css = generateCombinedCss([USER_A], opts())
    expect(css).toContain('[class*="Voice_avatarSpeaking__"] {')
  })

  it('combined 的彈跳使用 bottom keyframe', () => {
    const css = generateCombinedCss([USER_A], opts({ speak: { jumpPx: 10 } }))
    expect(css).toContain('@keyframes speak-jump')
    expect(css).toMatch(/bottom: 10px;/)
  })

  it('把安靜的人調暗：調暗 Voice_avatar__，以說話 class 恢復', () => {
    const css = generateCombinedCss([USER_A, USER_B], opts({ dimWhenQuiet: true }))
    expect(css).toMatch(/\[class\*="Voice_avatar__"\] \{\s*filter: brightness\(50%\)/)
    expect(css).toContain('[class*="Voice_avatarSpeaking__"] {')
  })
})

describe('generateCss（統一入口）', () => {
  it('alwaysShow 而且 1 人 → 常駐顯示（body::after）', () => {
    const css = generateCss([USER_A], opts({ alwaysShow: true }))
    expect(css).toContain('body::after {')
    expect(css).not.toContain('img[src*="avatars/123456789012345678"] {')
  })

  it('alwaysShow=false → 合併（per-img）', () => {
    const css = generateCss([USER_A], opts({ alwaysShow: false }))
    expect(css).toContain('img[src*="avatars/123456789012345678"] {')
    expect(css).not.toContain('body::after {')
  })

  it('對多人指定 alwaysShow → 附注記的合併版', () => {
    const css = generateCss([USER_A, USER_B], opts({ alwaysShow: true }))
    expect(css).toContain('注: 常時表示は 1人=1ブラウザソース')
    expect(css).toContain('img[src*="avatars/987654321098765432"] {')
  })

  it('沒有登錄使用者時只回傳說明註解', () => {
    const css = generateCss([], opts())
    expect(css).toContain('ユーザーが未登録')
  })
})

describe('輸入的穩健性', () => {
  it('去掉 ID 裡的非數字，讓變數名稱・選擇器變安全', () => {
    const css = generateStandaloneCss(
      { id: ' 123-456 ', name: 'x', imageUrl: 'data:image/png;base64,Z' },
      opts(),
    )
    expect(css).toContain('--img-stand-url-123456:')
    expect(css).toContain('avatars/123456')
  })

  it('跳脫 URL 裡的雙引號，不弄壞 url()', () => {
    const css = generateStandaloneCss(
      { id: '1', name: '', imageUrl: 'https://ex.com/a".png' },
      opts(),
    )
    expect(css).toContain('url("https://ex.com/a\\".png")')
  })
})
