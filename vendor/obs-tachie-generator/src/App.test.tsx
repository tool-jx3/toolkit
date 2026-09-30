import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** 進入②，替新的預設集設定 URL 圖片的共用步驟。 */
async function addPresetWithImage(dataUri: string) {
  fireEvent.click(screen.getByRole('button', { name: /次へ/ })) // ① → ②
  fireEvent.click(screen.getByRole('button', { name: /新規プリセット/ }))
  fireEvent.click(screen.getByRole('button', { name: '画像URL' })) // 把互斥切換鈕切到 URL
  fireEvent.change(screen.getByLabelText(/画像URL/), { target: { value: dataUri } })
  fireEvent.click(screen.getByRole('button', { name: /画像URLを反映/ }))
  expect(await screen.findByText(/画像を設定しました/)).toBeInTheDocument()
}

describe('App', () => {
  it('初始畫面：標題與空清單訊息', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'OBS 立ち絵ジェネレーター' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/まだ登録がありません/)).toBeInTheDocument()
  })

  it('新增使用者 → 預設集＋圖片 → 在③選擇後反映到輸出 CSS', async () => {
    render(<App />)

    // ① 使用者
    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    const listPanel = screen.getByRole('heading', { name: /登録ユーザー/ }).closest('.panel')!
    expect(
      await within(listPanel as HTMLElement).findByText('123456789012345678'),
    ).toBeInTheDocument()

    // ② 預設集＋圖片
    await addPresetWithImage('data:image/png;base64,AAAA')

    // ③ 組合與輸出（作業中的選擇自動退回第一位使用者×第一個預設集）
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    expect(textarea.value).toContain('body::after')
    expect(textarea.value).toContain('--img-stand-url-123456789012345678')
  })

  it('把使用者 select 換成 B 時只有輸出的 ID 改變，圖片（預設集）維持不變', async () => {
    render(<App />)

    // ① 2 人（A / B）
    const idInput = () => screen.getByLabelText('Discord ユーザーID')
    const addBtn = () => screen.getByRole('button', { name: '追加' })
    fireEvent.change(idInput(), { target: { value: '111111111111111111' } })
    fireEvent.click(addBtn())
    fireEvent.change(idInput(), { target: { value: '222222222222222222' } })
    fireEvent.click(addBtn())

    // ② 預設集＋圖片
    await addPresetWithImage('data:image/png;base64,ZZZZ')

    // ③ 把使用者換成 B
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    const userSelect = screen.getByLabelText('ユーザー（ID）') as HTMLSelectElement
    fireEvent.change(userSelect, { target: { value: '222222222222222222' } })

    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    expect(textarea.value).toContain('--img-stand-url-222222222222222222')
    expect(textarea.value).not.toContain('--img-stand-url-111111111111111111')
    expect(textarea.value).toContain('data:image/png;base64,ZZZZ')
  })

  it('「畫面上顯示的名字」＋預設集的名字顯示開啟時，輸出 CSS 出現 body::before', async () => {
    render(<App />)

    // ① 使用者（輸入與備忘名稱不同的「畫面上顯示的名字」）
    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.change(screen.getByLabelText(/表示名/), { target: { value: '使用者A' } })
    fireEvent.change(screen.getByLabelText('画面に出す名前（任意）'), {
      target: { value: '畫面名A' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    // ② 預設集＋圖片 → 開啟名字顯示
    await addPresetWithImage('data:image/png;base64,AAAA')
    fireEvent.click(screen.getByLabelText(/名前を表示する/))
    fireEvent.change(screen.getByLabelText(/文字サイズ/), { target: { value: '48' } })

    // ③ 反映到輸出
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    expect(textarea.value).toContain('body::before {')
    expect(textarea.value).toContain('content: "畫面名A";')
    expect(textarea.value).toContain('font-size: 48px;')
  })

  it('已登錄使用者的「畫面上顯示的名字」可以之後在清單裡修改', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.change(screen.getByLabelText(/表示名/), { target: { value: '使用者A' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    const edit = await screen.findByLabelText('画面に出す名前')
    fireEvent.change(edit, { target: { value: '畫面名B' } })

    await addPresetWithImage('data:image/png;base64,AAAA')
    fireEvent.click(screen.getByLabelText(/名前を表示する/))
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))

    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    expect(textarea.value).toContain('content: "畫面名B";')
  })

  it('名字為空時，③的預覽不顯示暫定名字，並警告「不會寫進輸出」', async () => {
    render(<App />)

    // ① 只登錄 ID（顯示名稱與畫面上顯示的名字都是空的）
    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    // ② 開啟名字顯示（這個步驟可以用暫定名字確認樣子）
    await addPresetWithImage('data:image/png;base64,AAAA')
    fireEvent.click(screen.getByLabelText(/名前を表示する/))
    expect(screen.getByText('名前')).toBeInTheDocument()

    // ③ 輸出沒有名字。預覽也不顯示暫定名字，並說明原因
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    expect(textarea.value).not.toContain('body::before')
    expect(screen.getByText(/「画面に出す名前」が空のため/)).toBeInTheDocument()
    expect(screen.queryByText('名前')).not.toBeInTheDocument()
  })

  it('按「儲存」後作業中的組合出現在儲存清單', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    fireEvent.click(screen.getByRole('button', { name: /次へ/ })) // ② → ③
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByLabelText('保存ペア1を呼び戻す')).toBeInTheDocument()
  })

  it('3×3 的錨點選擇反映到輸出 CSS，偏移的標籤也跟著變（T4）', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    // 預設為左下：標籤也是 left/bottom
    const group = screen.getByRole('radiogroup', { name: /基準の位置/ })
    expect(within(group).getByRole('radio', { name: '左下' })).toBeChecked()
    expect(screen.getByLabelText(/左端からの距離/)).toBeInTheDocument()
    expect(screen.getByLabelText(/下端からの距離/)).toBeInTheDocument()

    // 切換成右上
    fireEvent.click(within(group).getByRole('radio', { name: '右上' }))
    expect(within(group).getByRole('radio', { name: '右上' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: '左下' })).not.toBeChecked()

    // 偏移的標籤跟著錨點變（「距左緣的距離」消失）
    expect(screen.getByLabelText(/右端からの距離/)).toBeInTheDocument()
    expect(screen.getByLabelText(/上端からの距離/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/左端からの距離/)).not.toBeInTheDocument()

    // 距離明確輸入。這裡要看的是「是否以 right/top 輸出」而不是預設值，
    // 讓預設值改變時這個測試的意義也不會變。
    fireEvent.change(screen.getByLabelText(/右端からの距離/), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText(/上端からの距離/), { target: { value: '16' } })

    // 輸出 CSS 以 right/top 輸出（不輸出 left/bottom）
    fireEvent.click(screen.getByRole('button', { name: /次へ/ })) // ② → ③
    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    const after = /body::after \{[\s\S]*?\n\}/.exec(textarea.value)?.[0] ?? ''
    expect(after).toContain('right: 16px;')
    expect(after).toContain('top: 16px;')
    expect(after).not.toContain('left:')
    expect(after).not.toContain('bottom:')
  })

  it('裁切 UI 只在有圖片時出現（T8）', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    // 放入圖片前不顯示（沒有裁切對象）
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    fireEvent.click(screen.getByRole('button', { name: /新規プリセット/ }))
    expect(screen.queryByText('クロップ（切り抜き）')).not.toBeInTheDocument()

    // 放入圖片後出現。沒有 canvas 的環境取不到尺寸，所以操作維持停用
    // （按了不會拋出例外＝退化處理有效。實際裁切在真的瀏覽器裡確認）。
    fireEvent.click(screen.getByRole('button', { name: '画像URL' }))
    fireEvent.change(screen.getByLabelText(/画像URL/), {
      target: { value: 'data:image/png;base64,AAAA' },
    })
    fireEvent.click(screen.getByRole('button', { name: /画像URLを反映/ }))
    expect(await screen.findByText(/画像を設定しました/)).toBeInTheDocument()

    expect(screen.getByText('クロップ（切り抜き）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '余白を詰める' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '範囲を指定して切り抜き' })).toBeDisabled()
  })

  it('選擇中央錨點時輸出 50% + 置中的 transform（T4）', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    const group = screen.getByRole('radiogroup', { name: /基準の位置/ })
    fireEvent.click(within(group).getByRole('radio', { name: '下中央' }))
    // 中央不是「距離」而是帶正負號的偏移，所以標籤文字也會變
    expect(screen.getByLabelText(/横中央からのズレ/)).toBeInTheDocument()
    // 偏移設為 0 時不輸出 calc，維持 50%
    fireEvent.change(screen.getByLabelText(/横中央からのズレ/), { target: { value: '0' } })

    fireEvent.click(screen.getByRole('button', { name: /次へ/ }))
    const out = screen.getByRole('heading', { name: /出力 CSS/ }).closest('.panel')!
    const textarea = within(out as HTMLElement).getByRole<HTMLTextAreaElement>('textbox')
    const after = /body::after \{[\s\S]*?\n\}/.exec(textarea.value)?.[0] ?? ''
    expect(after).toContain('left: 50%;')
    expect(after).toContain('transform: translateX(-50%);')
    // 置中 + 彈跳（預設開啟）時置中部分織進 keyframe
    expect(textarea.value).toContain('50% { transform: translateX(-50%) translateY(-10px); }')
  })

  it('A1 預設的預設集在距離欄位顯示邊距警告，足夠時變成補充說明', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    expect(document.querySelector('label[for="pr-left"]')?.textContent).toContain(
      '14px 以上にしてください',
    )
    expect(document.querySelector('label[for="pr-bottom"]')?.textContent).toContain(
      '14px 以上にしてください',
    )

    fireEvent.change(screen.getByLabelText(/左端からの距離/), { target: { value: '16' } })
    const left = document.querySelector('label[for="pr-left"]')?.textContent ?? ''
    expect(left).toContain('発話演出に必要な余白: 14px')
    expect(left).not.toContain('切れます')
  })

  it('A2 改變外框・光暈的寬度時需要值跟著變', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    fireEvent.change(screen.getByLabelText(/枠・後光の幅/), { target: { value: '4' } })
    expect(document.querySelector('label[for="pr-bottom"]')?.textContent).toContain(
      '28px 以上にしてください',
    )
  })

  it('A3 上錨點在垂直方向加上彈跳量，中央錨點的欄位不顯示', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    const group = screen.getByRole('radiogroup', { name: /基準の位置/ })
    fireEvent.click(within(group).getByRole('radio', { name: '左上' }))
    expect(document.querySelector('label[for="pr-bottom"]')?.textContent).toContain(
      '24px 以上にしてください',
    )

    fireEvent.click(within(group).getByRole('radio', { name: '下中央' }))
    const left = document.querySelector('label[for="pr-left"]')?.textContent ?? ''
    expect(left).not.toContain('余白')
    expect(left).not.toContain('切れます')
  })

  it('A4 效果全部關閉時邊距的顯示消失', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Discord ユーザーID'), {
      target: { value: '123456789012345678' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await addPresetWithImage('data:image/png;base64,AAAA')

    fireEvent.click(screen.getByRole('button', { name: /枠・後光/ }))
    fireEvent.click(screen.getByRole('button', { name: /ぴょこぴょこ/ }))

    const left = document.querySelector('label[for="pr-left"]')?.textContent ?? ''
    const bottom = document.querySelector('label[for="pr-bottom"]')?.textContent ?? ''
    expect(left).not.toContain('余白')
    expect(left).not.toContain('切れます')
    expect(bottom).not.toContain('余白')
    expect(bottom).not.toContain('切れます')
  })
})
