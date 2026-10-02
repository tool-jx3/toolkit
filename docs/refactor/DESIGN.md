# 設計系統與共用元件

所有工具共用同一套外觀與操作方式。本文件隨元件庫的演進更新；新增共用元件時一併登記在第 4 節。

## 1. 設計原則

- **工具優先**：左側設定、右側大預覽（手機寬度改上下排列）；最常用的操作放在第一屏。
- **一致**：同一種控制項在每個工具長得一樣、行為一樣（例如色彩欄一定可以輸入色碼與調透明度）。
- **即時**：改設定立刻反映在預覽；耗時的匯出有進度與取消。
- **在地**：只有台灣繁體中文介面；用詞照第 5 節；字型預設用繁中字型。
- **無障礙**：鍵盤可操作、焦點清楚、對比足夠、圖示按鈕有文字標籤（Radix 元件為基礎）。

## 2. 設計 token（CSS 變數，定義在 `web/src/ui/tokens.css`）

| 類別 | token | 說明 |
|---|---|---|
| 色彩（深色為預設，另有淺色） | `--bg`、`--surface`、`--surface-2`、`--border`、`--text`、`--text-muted`、`--accent`、`--accent-contrast`、`--danger`、`--warning`、`--success` | 主色（accent）沿用首頁的強調色系，對比至少 4.5:1 |
| 字型 | `--font-ui`（Noto Sans TC 與系統字型堆疊）、`--font-mono` | |
| 字級 | `--text-xs`～`--text-xl` | 介面字級 12～20 px |
| 間距 | `--space-1`～`--space-8`（4 px 為單位） | |
| 圓角 | `--radius-sm`、`--radius`、`--radius-lg` | |
| 陰影 | `--shadow-1`、`--shadow-2` | |
| 動態 | `--ease-out`、`--duration-fast`、`--duration` | 尊重 `prefers-reduced-motion` |

另有補充 token：`--surface-3`（hover 底色）、`--border-strong`（輸入框邊框，對比 ≥ 3:1）、`--accent-hover`、`--accent-soft`（選取底色）、
`--danger-contrast`／`--warning-contrast`／`--success-contrast`（實心底上的文字）、`--danger-soft`／`--warning-soft`／`--success-soft`（淡底）、
`--focus`（焦點框）、`--overlay`（對話框遮罩）、`--checker-a`／`--checker-b`（透明棋盤格）、`--source-outline`（CSS 預覽裡標出來源範圍的粉紅虛線）。深色預設、淺色寫在 `:root[data-theme='light']`；
對比由 `web/tests/unit/tokens.test.ts` 自動檢查（文字 ≥ 4.5:1、輸入框邊框 ≥ 3:1）。

Tailwind v4 的主題直接對應這些變數（`web/src/ui/styles.css` 的 `@theme inline`）；元件只用 token，不寫死顏色。
Tailwind 預設色票已清空，只能用下列類別：

| 用途 | 類別 |
|---|---|
| 底色 | `bg-bg`、`bg-surface`、`bg-surface-2`、`bg-surface-3`、`bg-accent`、`bg-accent-soft`、`bg-danger-soft`… |
| 文字 | `text-fg`（＝`--text`）、`text-muted`（＝`--text-muted`）、`text-accent`、`text-accent-contrast`、`text-danger`… |
| 邊框 | `border-border`、`border-border-strong`、`border-accent` |
| 字級 | `text-xs`～`text-xl`（12、13、14、16、20 px） |
| 圓角／陰影 | `rounded-sm`、`rounded-md`（＝`--radius`）、`rounded-lg`；`shadow-1`、`shadow-2` |
| 其他 | `font-ui`、`font-mono`、`ease-out`、`checker`（棋盤格底）、`focus-ring`；深色變體 `dark:` |

主題切換：`useTheme()`／`setTheme('light' | 'dark')`（記在 localStorage `trpg-toolkit:theme`，所有工具共用；頁首有切換按鈕）。

## 3. 版面

- **ToolShell**：頁首（← TRPG Toolkit、工具名、群組分頁、快捷鍵與說明按鈕）＋主體（設定面板＋預覽區）＋頁尾（靈感來源）。
- 設定面板：分頁（Tabs）→ 區塊（Section，可收合）→ 欄位列（Field：標籤、控制項、說明）。
- 預覽區：預覽舞台（Stage）＋播放列（Transport，動畫工具才有）＋匯出區（ExportPanel）。
- 斷點：≥ 1024 px 左右排列；< 1024 px 上下排列，預覽在上；390 px 寬不得出現橫向捲動。
- 桌面版的預覽欄固定在畫面上（sticky），內容比畫面長時自己捲動；Stage 的高度跟著內容比例，最高 60dvh／560 px（工具可以用 `maxViewportHeight` 或 CSS 變數 `--stage-max-h` 放寬，例如立繪裁切器 ≥ 1280 px 時把控制項排到右側一欄、預覽放到 `calc(100dvh - 8rem)`）。

## 4. 共用元件與模組

所有元件與模組的實際寫法都可以在**元件展示頁**看到：`npm run dev` 後開 `/tools/_gallery/`，或建置後的 `next/_gallery/`
（原始碼 `web/src/tools/_gallery/`）。新增共用元件時，一併放進展示頁並登記在本節。

### 4.0 引用方式

- 路徑別名 `@` ＝ `web/src`。元件一律 `import { … } from '@/ui'`；模組依資料夾 `import { … } from '@/core/<模組>'`。
- 樣式入口：每個工具的 `main.tsx` 只寫一次 `import '@/ui/styles.css'`（含 Tailwind 與 token）。
- 元件都是受控元件（`value`＋`onChange`），放在 `Field` 裡會自動關聯標籤與說明；需要的 Provider（提示、通知、確認）由
  `ToolShell` 包好，單獨使用時包 `UiProvider`。
- 一個工具的最小骨架：

```tsx
// web/src/tools/<id>/main.tsx
import '@/ui/styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
createRoot(document.getElementById('root')!).render(<App />);

// web/src/tools/<id>/App.tsx
const useSettings = createToolStore('<id>', { size: 48, color: '#ffffff' });
export function App() {
  const s = useSettings((st) => st.data);
  const update = useSettings((st) => st.update);
  return (
    <ToolShell
      toolId="<id>"
      settings={
        <Section title="文字">
          <Field label="字級">
            <Slider value={s.size} onChange={(v) => update((d) => { d.size = v; })} min={8} max={200} unit="px" />
          </Field>
        </Section>
      }
      preview={<Stage width={512} height={512}><canvas … /></Stage>}
    />
  );
}
```

另外要：在 `web/src/registry.ts` 加一筆（id、名稱、說明、群組、`status: 'next'`、靈感來源），
複製 `web/src/tools/_gallery/index.html` 改 `<title>`，介面文字放 `strings.ts`。

### 4.1 元件（`@/ui`，原始碼 `web/src/ui/`）

#### 外框

| 元件 | 主要 props | 說明 |
|---|---|---|
| `ToolShell` | `toolId`、`settings`、`preview`、`headerActions?`、`shortcuts?: Shortcut[]`、`usage?`、`title?`、`inspiration?`、`body?` | 頁首＋設定／預覽兩欄＋頁尾。≥ 1024 px 左右、以下上下（預覽在上）。標題、群組分頁、靈感來源從 registry 讀；傳 `shortcuts` 會自動綁定並可按 `?` 看說明；`usage` 會出現在頁首「說明」按鈕。已包 `UiProvider`。**`body`**（選填，cutin 移植時新增）：整頁內容，給了就取代設定／預覽兩欄（例如開頁先顯示的範本一覽），頁首、頁尾照舊；這時 `settings`、`preview` 可以不給。不給時行為不變。 |
| `ToolHeader` | `toolId`、`title`、`actions?`、`onHelp?`、`onShortcuts?`、`homeHref?`（預設 `../../`） | ToolShell 內部使用；「← TRPG Toolkit」連回首頁。 |
| `GroupTabs` | `toolId`、`tools?` | 同群組工具的分頁連結（`../../tools/<id>/` 或 `../../next/<id>/`）；只有一個工具時不顯示。永遠只佔一行：寬畫面時在標題與按鈕之間吃掉剩下的寬度，放不下就橫向捲動；窄畫面時自成一行；開頁時目前的分頁捲進可見範圍。頁首高度因此不隨群組的工具數量改變。 |
| `InspirationFooter` | `inspiration?: { name, url? } \| null` | 只顯示「靈感來源：<名稱>」；原創工具不顯示。出處不明、沒有網址（registry 的 `url` 不填）時只顯示名稱、不加連結。 |
| `ThemeToggle` | `size?` | 深／淺色切換（ToolShell 已放在頁首）。 |

#### 設定面板的結構

| 元件 | 主要 props | 說明 |
|---|---|---|
| `Tabs` | `items: { value, label, icon?, content }[]`、`value?`、`onValueChange?`、`keepMounted?`、`aria-label` | 第一層分類；方向鍵切換。 |
| `Section` | `title`、`children`、`actions?`、`description?`、`defaultOpen?`、`persistKey?`、`fixed?` | 可收合區塊；`persistKey` 會記住展開狀態。 |
| `Field` | `label`、`children`、`hint?`、`error?`、`layout?: 'stack' \| 'inline'`、`labelSuffix?`、`hidden?` | 標籤＋控制項＋說明／錯誤；裡面的控制項自動取得 id、`aria-labelledby`、`aria-describedby`、`aria-invalid`。自己有 `aria-label` 的控制項（例如字型旁的字重）視為次要控制項，不搶 Field 的 id。`hidden` 為條件顯示（不顯示但設定值保留）。 |
| `Show` | `when`、`children` | 一組欄位的條件顯示：`<Show when={s.textPos === 'inside'}>…</Show>`（隱藏時設定值保留）。 |
| `FieldRow` | `columns?: 2 \| 3 \| 4` | 一列放多個 Field（寬／高）。 |
| `FieldScope` | — | 切斷 Field 關聯（Dialog、彈出面板已內建）。 |

```tsx
<Tabs aria-label="設定分類" items={[{ value: 'text', label: '文字', content: <TextPanel /> }]} />
<Section title="外框" persistKey="textbox:frame">
  <Field label="框線" hint="雙線比較醒目。"><Segmented value={v} onValueChange={set} options={[…]} /></Field>
  <Field label="顯示側邊" layout="inline"><Toggle checked={on} onCheckedChange={setOn} /></Field>
</Section>
```

#### 基本控制項

| 元件 | 主要 props | 說明 |
|---|---|---|
| `Button` | `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`、`size?: 'sm' \| 'md' \| 'lg'`、`icon?`、`loading?` | `buttonClass(variant, size)` 可給 `<a>`、`<label>` 套同樣外觀。 |
| `IconButton` | `label`（必填，成為 aria-label 與提示）、`icon`、`pressed?`、`variant?`、`size?`、`noTooltip?` | 只有圖示的按鈕；`pressed` 為切換狀態（aria-pressed）。 |
| `Toggle` | `checked`、`onCheckedChange`、`label?`、`disabled?` | 開關（Radix Switch）。在 Field 裡用 `layout="inline"` 不必再給 label。 |
| `Segmented` | `value`、`onValueChange`、`options: { value, label, icon?, ariaLabel?, disabled? }[]`、`size?`、`fullWidth?`、`onReselect?` | 2～5 個選項的單選；方向鍵移動；不能取消選取。再按一次已選的選項時呼叫 `onReselect(value)`（例如 battlemap「再選一次同一種地形也重新產生」）。 |
| `AnchorPicker` | `value`（`'tl'`～`'br'`：t／m／b＋l／c／r）、`onChange`、`labels?`、`showLabel?` | 九宮格位置（左上、上方中央…右下）；radiogroup，方向鍵在九格間上下左右移動並選取，Home／End 到左上／右下；旁邊顯示目前的名稱。值與 `core/typeset` 的 `Anchor` 相同。`ANCHOR_VALUES`、`ANCHOR_LABELS` 一起匯出。（text-fx 移植時新增） |
| `Select` | `value`、`onValueChange`、`options`（可分組 `{ label, options }`）、`placeholder?`、`size?` | 選項多時用；選項可帶 `description`。 |
| `TextInput`／`TextArea` | 原生 input／textarea 的 props＋`invalid?` | |
| `NumberInput` | `value`、`onChange`、`min?`、`max?`、`step?`、`precision?`、`unit?`、`onCommit?` | role=spinbutton；打字時在範圍內即時套用，離開／Enter 夾到範圍，Esc 還原；↑↓（Shift ×10、Alt ×0.1）、PageUp／PageDown、Home／End。 |
| `NativeNumberInput`、`spinStep(el, dir)` | `value: string`、`onChange(value: string)`、`min?`、`max?`、`step?`、`unit?`、`stepLabels?: { up, down }`、`invalid?`、`size?` | 原生 `<input type="number">`，解析與微調全照瀏覽器：值就是原生數字欄的值字串（全形「１２」→「12」；「5-」「1e」這類無效的寫法是空字串；「12.9」「3e1」照原樣），不夾範圍、不改寫，由工具自己解讀。鍵盤 ↑↓、滾輪是原生微調；給 `stepLabels` 時右邊顯示減少／增加按鈕（取代原生小箭頭），規則與原生微調鈕相同（`spinStep`：空白或無效時走到範圍內、超出範圍時只往範圍內走、不在格點上先對齊）。規格要求「與瀏覽器數字欄相同」時用這個（例：textbox 的寬度上限）；一般數值用 `NumberInput`。 |
| `Slider` | `value`、`onChange`、`min`、`max`、`step?`、`unit?`、`precision?`、`showInput?`、`inputMin?`／`inputMax?`、`onCommit?`、`valueText?` | 滑桿＋數字欄；`inputMin/inputMax` 讓數字欄可超出滑桿範圍。滑桿代表索引或代碼時（例如 11 段固定時長）用 `valueText(v)` 給螢幕閱讀器念的文字，搭配 `showInput={false}` 與 Field 的 `labelSuffix` 顯示目前值。 |
| `Tooltip` | `content`、`children`、`side?` | 滑鼠停留／鍵盤聚焦提示。 |
| `Kbd` | `children` | 按鍵外觀。 |
| `Notice` | `tone?: 'info' \| 'success' \| 'warning' \| 'danger' \| 'progress'`、`children`、`action?` | 固定位置的狀態訊息列（已載入幾個檔案、處理進度、錯誤）；錯誤為 role=alert，其他為 role=status。 |

```tsx
<Field label="停留時間"><Slider value={hold} onChange={setHold} min={0.2} max={4} step={0.1} unit="秒" /></Field>
<Field label="寬度"><NumberInput value={w} onChange={setW} min={1} max={4096} unit="px" /></Field>
<Field label="方框寬度上限"><NativeNumberInput value={raw} onChange={setRaw} min={10} max={100} unit="格" stepLabels={{ up: '方框寬度上限：增加', down: '方框寬度上限：減少' }} /></Field>
<IconButton label="復原" icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
```

#### 顏色與字型

| 元件 | 主要 props | 說明 |
|---|---|---|
| `ColorField` | `value`（`#rrggbb`／`#rrggbbaa`）、`onChange`、`alpha?`、`swatches?`、`eyedropper?`、`showInput?` | 色塊（開調色盤）＋色碼欄（接受 `#rgb`、`#rrggbb`、`rgb()`，確定時轉小寫）＋（alpha 時）不透明度 %。調色盤：飽和度／亮度平面（方向鍵可調）、色相、透明度、吸管（瀏覽器支援 EyeDropper 時）、常用色。 |
| `ColorPicker` | 同上（不含欄位） | 調色盤本體，可放在任何地方。 |
| `HsvPanel`、`hsvToHex(hsv)` | `value: Hsv`（`{ h: 0～360, s: 0～1, v: 0～1 }`）、`onChange(hsv)`、`height?`（預設 144）、`disabled?` | 常駐的彩度／明度二維面板＋色相滑桿（受控，值直接是 HSV）。可指定標記的初始位置、灰色時不遺失色相；色碼與面板怎麼同步由呼叫端決定（例：apng-wipe 的色碼欄確定後才把面板移過去）。面板上方向鍵 0.01（Shift 0.1），拖到外面夾在邊界。`hsvToHex` 依標準 HSV 四捨五入成小寫 `#rrggbb`。 |
| `GradientField` | `value: Gradient`、`onChange`、`alpha?`、`allowRadial?`、`maxStops?`、`showAngle?`（預設 true） | 色標可拖曳、方向鍵移動、Delete 刪除；點預覽條空白處或按鈕新增；線性／放射、角度。搭配 `core/gradient`。方向由工具另外決定時（例如 text-fx 的縱向每行／橫向整段／斜向整段）用 `allowRadial={false} showAngle={false}`，只編輯色標。 |
| `FontPicker` | `value: FontValue`（`{ source: 'google' \| 'local' \| 'upload', family, weight }`）、`onChange`、`previewText?`、`scripts?`、`allowLocal?`、`allowUpload?`、`showWeight?`、`mode?: 'canvas' \| 'css'`、`weights?`、`localFontNote?`；G4 對等驗證後加的選填：`localSampleText?`、`inherit?: boolean \| { label?, description? }` | 三合一字型選擇＋字重。Google 字型清單的預覽只下載用到的字；電腦字型在支援 `queryLocalFonts` 時列清單，否則手動輸入並檢查是否存在；上傳字型存 IndexedDB，下次自動恢復。**`mode="css"`**（OBS 自訂 CSS 用）：沒有上傳字型（CSS 拿不到使用者的檔案）；字重固定 400～900 六級、照選的值存，字型沒有時下方註明實際使用的最接近字重；電腦字型分頁列出常見內建字型（微軟正黑體、新細明體、標楷體、Yu Gothic UI、Meiryo、Yu Mincho）、手動輸入名稱、「從清單選」（`LocalFontDialog`）；選了電腦字型時提醒在跑 OBS 的電腦安裝。**「從清單選」的樣張**一律預設 `LOCAL_FONT_SAMPLE`（含「永」字與英數，不再沿用欄位的 `previewText`；要換用 `localSampleText`）。**`inherit`**（選填，不給時沒有這個選項）：對話框最上方多一個「沿用頁面字型」（不指定字型），選了之後值是 `{ source: 'local', family: '', weight }`，欄位顯示這個名稱、標籤「頁面」，不提醒安裝字型（`isInheritFont(value)` 判斷；例：Discord 通話立繪的名字沿用 Streamkit 頁面字型）。 |
| `LocalFontDialog` | `open`、`onOpenChange`、`value?`（目前的字型名稱）、`onPick(family)`、`sampleText?` | 電腦字型清單對話框：第一次打開時要求權限（讀取中有提示；拒絕／空清單／無法讀取各有說明與「重新讀取」）；依家族排序、同家族一次；樣張可改（預設 `LOCAL_FONT_SAMPLE`＝「永遠的冒險 Aa 123」，含「永」字與英數）；多關鍵字搜尋（空白分隔、全部符合、不分大小寫、比對完整名稱）、「共 N 套／N 套之中的 M 套」；搜尋欄 Enter（不在選字中）選第一個；目前的字型標示「使用中」並捲到中央；清單讀過一次就留著。`supportsLocalFontList()` 判斷要不要顯示「從清單選」。 |

```tsx
<Field label="文字顏色"><ColorField value={c} onChange={setC} alpha /></Field>
<Field label="字型"><FontPicker value={font} onChange={setFont} previewText="大成功！" /></Field>
// 畫 canvas 前：await ensureFont(font.family, font.weight, text); ctx.font = fontCss(font, 48);
```

#### 圖片輸入

| 元件 | 主要 props | 說明 |
|---|---|---|
| `ImageDrop` | `onImages?(images: { file, bitmap, width, height }[])`、`onFiles?(files)`、`accept?`（預設 `image/*`）、`multiple?`、`paste?: 'document' \| 'focus' \| 'off'`、`label?`、`hint?`、`compact?`、`onError?`、`onReject?` | 拖放、貼上（Ctrl+V）、選檔；`onImages` 收到解碼後的 ImageBitmap。不符合 accept 的檔案顯示錯誤並呼叫 onReject。 |
| `FileDrop` | `onFiles`、`accept?`、`multiple?`、`paste?`、`label?`、`buttonLabel?`、`hint?`、`icon?`、`filterByAccept?`（預設 true）、`clickable?`（預設 false） | 不限圖片的拖放區（JSON、字型…）。`filterByAccept={false}` 時 accept 只用在選檔視窗，所有檔案都交給 onFiles，由工具自己判斷（例如讀檔頭辨認沒有副檔名的圖片）。`clickable`：點拖放區的任何地方（不只按鈕）都開啟選檔視窗，滑過時框線變主色；鍵盤仍用裡面的選檔按鈕（variant-manager 移植時新增，不給時行為不變）。ImageDrop 也接受這兩個 prop。 |
| `ThumbnailList` | `items: { id, name, image?（網址或 ImageBitmap／canvas）, meta?, status?: 'done' \| 'error', statusLabel? }[]`、`aria-label`、`onRemove?(id)`、`removeLabel?(item)`、`removeDisabled?`、`empty?`、`minItemWidth?`（預設 120）；G3 加的選填：`layout?: 'grid' \| 'list'`、`thumbSize?`（list 縮圖邊長，預設 82）、`numbered?`、`selectedId?`／`onSelect?(id)`、`onReorder?(from, to)`、`renderFields?(item, index)` | 批次圖片工具的縮圖清單（自動排列的格線）：圖片範圍內的透明處以棋盤格顯示；`image` 為空時顯示讀取中的佔位，網址讀不到時顯示破圖圖示；名稱過長時省略、滑過看全名；`status` 在名稱旁加標記（例如「已處理」）；每張可移除。立繪工作台（G3）共用。**選填（不給時行為不變）**：`layout="list"` 一張一列（縮圖在左）；`numbered` 名稱前加「序號.」；給 `onSelect` 就可以選取——點一列或聚焦到列裡的欄位就選取、選取中的列醒目（`aria-current`）、點選後焦點移到清單、清單有焦點時 ↑／↓ 選取上一張／下一張（到頭到尾就停、在文字欄裡不作用；選到的列用 `revealInScroller` 只捲清單所在的捲動區讓它露出來，不讓整頁跟著捲——variant-manager 對等驗證後修正，原本的 `scrollIntoView` 會連頁面一起捲）；給 `onReorder` 就能拖曳一列到另一列放開排序（門檻 4 px；往下拖落在目標後、往上拖落在目標前；被拖的列變淡、目標列醒目；從欄位、按鈕上開始拖不算；觸控時整列留給捲動、不拖；移完選取被拖的那張）；`renderFields` 放每列自訂的欄位（差分名、輸出檔名）。`ThumbnailImage({ source })` 單張縮圖也匯出（LayerList、SelectableCardList 用）。 G2 加的選填：`thumbAspect?`（格線版面的縮圖寬高比，預設 1；例 16/9）、`thumbFit?: 'contain' \| 'cover'`；格線版面拖曳排序改用二維位置判斷落點（Alt＋←／→ 也能移動）。 |
| `revealInScroller(el)`／`revealDelta(input)` | `el`：清單裡的一列；`revealDelta({ row, box, viewport, canUp, canDown })` → `{ box, page }`（純計算） | 把清單裡的一列捲進看得見的地方，**只捲最近的捲動容器**（清單面板），讓列落在「容器露出在畫面上的範圍」（容器可見區與畫面的交集，畫面上緣扣掉黏在頂端的頁首）；只有容器本身有一部分在畫面外、只捲容器不夠時（例如視窗很矮），才把頁面捲最少的距離；容器整個在畫面外（例如窄畫面清單在預覽下方）時頁面不動。取代 `scrollIntoView({ block: 'nearest' })`（它會連頁面一起捲）。ThumbnailList 的 ↑／↓ 已使用；工具自己的整頁 ↑／↓ 也可以用。（variant-manager 對等驗證後新增） |
| `CropDialog` | `open`、`onOpenChange`、`image`、`onConfirm(rect)`、`aspect?: number \| null`（給了就固定）、`aspectOptions?`、`initialRect?`、`minSize?`、`freeDraw?`、`rawInputs?`、`confirm?: { beforeBytes?, estimateBytes?(rect), warning?, applyLabel? }` | 拖曳框線或八個控制點；X／Y／寬／高數值欄；裁切框聚焦時方向鍵移動（Shift 10 px）、Alt＋方向鍵調整大小。回傳原圖座標。裁切計算在 `core/image`（`centeredCrop`、`clampCrop`、`resizeCrop`）。`freeDraw`：在圖上按住拖曳畫出新範圍（任何方向）——**包括在裁切框裡面**（初始框蓋滿整張圖時也能畫）；移動範圍改用框中央的移動把手，或在框內按住不動 `CROP_HOLD_TO_MOVE_MS`（350 ms）再拖；開始拖曳（畫、移動、控制點）前先讓對話框裡正在輸入的數字欄離開輸入狀態，所以拖曳時四個欄位跟著更新、確定時以畫面上的範圍為準（obs-tachie F21 修正；不給 `freeDraw` 時行為不變）。`rawInputs`：數字欄打字時不修正，下方即時顯示「裁切後 寬×高」或「範圍在圖片外」，範圍無效或等於整張圖時不能確定（規則：`normalizeCropRect`）。`confirm`：兩段式確認，先顯示「原尺寸 → 裁切後」「嵌入大小 原本 → 之後」與無法復原的警告，按「套用」才回呼。 |
| `CropConfirmSummary` | `before`、`after`（尺寸）、`beforeBytes?`、`afterBytes?`（null＝計算中）、`warning?` | 裁切／修邊的確認內容，可以直接放在面板裡（例如「修掉透明留白」的兩段式確認）。 |

```tsx
<ImageDrop multiple accept="image/png,image/webp" onImages={(list) => add(list)} hint="PNG、WebP，可多選" />
<ThumbnailList aria-label="已載入的立繪" items={list.map((it) => ({ id: it.id, name: it.file.name, image: it.result ?? it.url, status: it.result ? 'done' : undefined, statusLabel: '已處理' }))} onRemove={remove} />
<CropDialog open={open} onOpenChange={setOpen} image={img.bitmap} aspect={1} onConfirm={(r) => setCrop(r)} />
```

#### 預覽、播放、匯出

| 元件 | 主要 props | 說明 |
|---|---|---|
| `Stage` | `width`、`height`（內容原始尺寸）、`children`、`background?`／`defaultBackground?`／`onBackgroundChange?`、`backgrounds?`（工具列提供哪些背景）、`zoom?: number \| 'fit'`、`onZoomChange?`、`pixelated?`、`fitUpscale?`、`toolbar?`、`toolbarExtra?`、`viewportClassName?`、`maxViewportHeight?`（CSS 長度）；G3 加的選填：`wheelZoom?: 'ctrl' \| 'plain'`、`wheelFactors?: [放大, 縮小]`、`wheelLinear?`、`zoomRange?: [min, max]`、`zoomBase?: 'content' \| 'fit'`、`dragPan?`、`pan?`／`onPanChange?` | 背景：透明（棋盤格）／黑／白／自訂色（可半透明）／上傳背景圖（只供預覽，不會匯出）；縮放（− ＋、100%、符合畫面、Ctrl＋滾輪）。內容可以是 canvas 或 DOM。**選填（不給時行為不變）**：`wheelZoom="plain"` 不按 Ctrl 的滾輪也縮放（頁面不捲動），每格倍率 `wheelFactors`（預設 ×1.1／÷1.1；裁切器用 `[1.1, 0.9]`），或用 `wheelLinear` 改成依滾動量加減（0.5＝每 100 px ±50 個百分點，配色條的預覽用），夾在 `zoomRange`（預設 [0.05, 8]）；`zoomBase="fit"` 數字倍率以「符合畫面」為 100%（例如 20%～500%，工具列與 `data-zoom` 顯示相對倍率）；`dragPan` 在空白處按住（或中鍵）拖曳平移內容（子元素在 pointerdown 時 stopPropagation 就不會觸發），按 100%／符合畫面時平移歸零。疊在內容上的元件用 `useStageScale()`（或 CSS 變數 `--stage-scale`）取得目前倍率，讓控點、標籤維持固定的螢幕大小；`useStageView()` 回傳 `{ scale, width, height }`。**舞台區域的最高高度**（預設 `min(60dvh, 560px)`，高度仍跟著內容比例）：`maxViewportHeight="calc(100dvh - 8rem)"`，或由外層設定 CSS 變數 `--stage-max-h`（會繼承，可以依斷點不同，例如 Tailwind `xl:[--stage-max-h:calc(100dvh-8rem)]`）；都不給時和以前相同。 G2 加的選填：背景種類 `'scene'`（示意場景：本站自己畫的彩色奇幻風景 SVG，只供預覽、不會匯出），要在 `backgrounds` 列出才有，工具列依 `backgrounds` 的順序排列；用到時寫 `Stage<StageAnyBackgroundKind>`（原本的 `StageBackgroundKind` 不變）。同一張圖另外匯出成 `STAGE_SCENE_SVG`／`stageSceneUrl()`，可當示範圖。 |
| `Transport` | `time`、`duration`、`playing`、`onTimeChange`、`onPlayingChange`、`loop?`、`onLoopChange?`、`onRestart?`、`segments?: TimelineSegment[]`、`fps?`、`markers?: { time, label }[]`、`legend?`（預設 true） | 重播、播放／暫停、可拖曳時間軸（階段分色＋圖例）、循環、目前時間／總長。時間軸聚焦時 ←→ 一格（Shift 十格）、PageUp／PageDown 一秒、Home／End。拖曳時暫停，放開恢復。`markers` 在時間軸上畫細線標記（例如代表畫面），滑鼠停留顯示 label；階段很多（多頁）時 `legend={false}` 收起圖例。 G2 加的選填：`frames?: FrameSpec[]`（影格表：時間軸聚焦時 ←／→ 跳到上一格／下一格的開頭，每格長度不同時用）、`rate?`＋`onRateChange?`（給了才顯示「預覽速度」欄，單位倍）、`rateRange?`（預設 [0.1, 4]）、`rateStep?`（0.1）。 |
| `usePlayback` | `{ duration, loop?, autoPlay?, rate? }` → `Playback` | requestAnimationFrame 驅動；回傳值直接展開給 Transport；另有 `play`／`pause`／`toggle`。使用者設定「減少動態效果」時預設不自動播放。`onRestart`、`onTimeChange`（以及 `play` 從結尾重來）立刻生效：播放中也不會被迴圈用舊的時間蓋掉，要求的時間至少顯示一個畫面才往下播（改設定後呼叫 `onRestart()` 一定從第 1 格開始）。 G2 加的：選項 `loopGap?`（循環時每輪結尾多停幾秒，預設 0；例：檔案只播一次時預覽每輪停 1.2 秒）；回傳多了 `rate`、`setRate`（直接接 Transport 的 `rate`／`onRateChange`；`rate` 選項改變時同步）。 |
| `ExportPanel` | `formats: ExportFormatOption[]`、`onExport(settings, { signal, onProgress })`、`baseSize?`、`defaultSettings?`／`settings?`／`onSettingsChange?`、`fpsOptions?`、`scaleOptions?`、`sizeWarningBytes?`（預設 5,000,000）；`ref?: Ref<ExportPanelHandle>`、`extra?`、`maxPlays?`（預設 99）、`loopHint?`、`quantizeHint?`、`sizeWarningHint?` | 格式、FPS（依格式上限過濾）、無限循環／播放次數、尺寸倍率（顯示輸出 px）、減色；進度條與取消；結果卡（預覽、檔名、大小、尺寸、影格數與合併後格數、超過 5 MB 提醒、下載連結）。`onExport` 回傳的 `details?: { label, value }[]` 會加在結果卡（例如色數、循環、匯出時間）。`extra` 放在匯出按鈕上方（預設圖、裁邊、檔名等工具自己的選項）。`ref.current.exportNow('apng')` 從快捷鍵觸發匯出（給格式 id 時先切換過去）、`cancel()`、`busy`。**G1 擴充**（都選填，不給時行為不變）：`fixedFps`（鎖定 FPS：影格表、FPS 是內容參數時不顯示 FPS 選單，改顯示唯讀值與 `fixedFpsHint`；onExport 收到這個值，GIF 也不夾到 50）；`colorOptions`（色數選單，0＝無損，例 `[0, 256, 128, 64, 32, 16]`，取代減色開關，只在 `supportsColors` 的格式〔`animationFormats` 的 APNG、PNG〕出現，值在 `settings.colors`）；`limit: { bytes, label? }`（結果卡多一列「大小／上限（百分比）」，未超過綠色、超過紅色並標 `data-over`；顯示格式 `formatLimitBytes`）；`autoShrink: () => string \| null`（超過上限時結果卡出現「自動縮小檔案」：工具改掉設定並回傳這次降了什麼〔例「色數 256 → 128 色」〕，ExportPanel 等新設定生效後以同一格式重新匯出並顯示「已降低：…」；回傳 null 時顯示「已無可再降的項目」）；`onResult(output)`（例如記下大小給檢查清單）；**多檔**：`onExport` 回傳 `ExportBatchOutput`（`{ files: ExportOutput[], zipName?, details? }`）時顯示多檔結果（每個檔案一張結果卡、「全部下載」依序下載〔`sequentialIntervalMs` 預設 800〕、「打包成 ZIP」）。 G2 加的選填：`estimate?: { width, height, frames, duration }`（匯出按鈕上方的預估列「總長 · 影格數 · 每格約幾 ms · 未壓縮資料量」，`data-testid="export-estimate"`）、`pixelBudget?: { max, message? }`（寬 × 高 × 影格數超過 `max` 時停用匯出並顯示 `message`，`export-over-budget`）。 |
| `animationFormats(ids, { webpSupported })`、`useWebpSupport()` | — | 由 `core/timeline` 的格式資料組出 ExportPanel 選項；不支援 WebP 編碼（Safari）時停用並說明。**停用原因**：`ExportFormatOption` 的 `disabled`＋`disabledReason`，不論目前選的是哪個格式，所有有原因的停用格式都列在「格式」欄的說明裡（原因沒提到格式名稱時前面加「<label>：」；每項有 `data-disabled-format="<id>"`）；沒有停用格式時說明和以前一樣只有選中格式的說明。 |

```tsx
const source = useMemo(() => createMySource(settings), [settings]);   // AnimationSource
const playback = usePlayback({ duration: source.duration });
useEffect(() => { void drawFrame(canvas.current!.getContext('2d')!, source, playback.time); }, [source, playback.time]);
<Stage width={source.width} height={source.height}><canvas ref={canvas} width={source.width} height={source.height} className="block size-full" /></Stage>
<Transport {...playback} segments={source.segments} />
<ExportPanel
  formats={animationFormats(['apng', 'gif', 'webp', 'png', 'zip'], { webpSupported: useWebpSupport() })}
  baseSize={{ width: source.width, height: source.height }}
  onExport={(s, { signal, onProgress }) =>
    exportAnimation(source, { format: s.format as AnimationExportFormat, fps: s.fps, plays: s.plays, scale: s.scale, quantize: s.quantize, fileName: '輸出', signal, onProgress })}
/>
```

#### 範本、專案、對話框與說明

| 元件 | 主要 props | 說明 |
|---|---|---|
| `TemplateGallery` | `templates: { id, name, description?, thumbnail?（網址或元素）, tags?, data }[]`、`onApply(t)`、`activeId?`、`confirm?: boolean \| string`、`filter?`、`size?: 'md' \| 'sm'`、`defaultTag?` | 範本卡片格線，可依標籤篩選；套用前確認（可復原）。範本內容一律自己做。範本很多時用 `size="sm"`（16:9 小卡、說明改成滑鼠提示、分類可換行）並以 `defaultTag` 先停在目前範本的分類；範本清單換了（`key` 換掉或標籤不存在）時回到「全部」。`thumbnail` 也可以是 `({ playing }) => 元素`：滑鼠停留或鍵盤聚焦的那張卡 `playing` 為 true（搭配 `LoopThumb` 做「停留時播放」的縮圖）。 |
| `ProjectMenu` | `toolId`、`getData()`、`onLoad(data, file, files, source)`（回傳 false 或丟錯表示不合用；可以 async；`files` 是 ZIP 專案檔附帶的檔案〔名稱 → 位元組，JSON 專案檔是空的〕；`source` 是選的 File）、`onReset()`、`savedAt?`、`version?`、`fileName?`、`fileNameFor?(now)`、`exactFileName?`／`saveFileName?()`（完整檔名）、`getFiles?()`（給了就存成 ZIP：`project.json`＋`files/…`）、`beforeSave?()`、`confirmOpen?`（不給或 true：讀檔後確認；false／null：不確認；ConfirmOptions 或函式：選檔前確認）、`openedMessage?`、`onNotify?(notice: ProjectNotice)`、`onSaved?(name)`、`onLoadError?(message)`、`resetConfirm?`、`resetLabel?`、`resetText?`、`extraItems?`（`ProjectMenuItem`）、`resetDisabled?`、`statusText?` | 存成專案檔、開啟、重設（重設會先確認），旁邊顯示自動存檔狀態。開啟時自動分辨 JSON 或 ZIP（舊的 JSON 專案檔照樣讀得到）。給 `onNotify` 時結果改用它通知（`{ kind: 'saved' \| 'opened' \| 'open-failed' \| 'reset', tone, fileName?, message? }`），不跳 toast；`onSaved`／`onLoadError` 另外會呼叫，讓工具寫進自己的狀態列。這些都是選填，不給時行為不變（message-box、chat-window、G3 各自加的選項已合併成同一個元件）。**height-board 移植時新增**（選填，不給時行為不變）：`resetDisabled` 停用重設項目（例如沒有內容可以刪時，按了不做事）；`statusText` 取代旁邊的自動存檔文字（例如「自動保存無法使用」），讀取／準備專案檔中仍顯示進度。 |
| `Dialog` | `title`、`description?`、`children`、`footer?`、`open?`／`onOpenChange?`、`trigger?`、`size?: 'sm' \| 'md' \| 'lg' \| 'xl'`、`flush?`、`initialFocus?`、`dismissOnOutside?`（預設 true） | 一般對話框（焦點鎖定、Esc 關閉）。`DialogClose` 是 footer 用的關閉按鈕。`dismissOnOutside={false}`：點對話框外面不關閉（裡面有做到一半、關了就會丟掉的東西時用，例如配色條的取色視窗）。 |
| `ConfirmDialog`／`useConfirm()` | `title`、`description?`、`confirmLabel?`、`cancelLabel?`、`danger?` | `if (await confirm({ title: '重設？', danger: true })) reset();` |
| `ChoiceDialog`／`useChoice()` | `title`、`description?`、`choices: { value, label, variant?: 'primary' \| 'secondary' \| 'danger' }[]`、`cancelLabel?` | 多選一確認（例如「加入／取代／取消」）：取消在最左、選項依序在右（第一個預設主要按鈕）；回傳選到的 value，取消、Esc、點外面回傳 null。`const how = await choose({ title: '匯入 12 個表情', choices: [{ value: 'append', label: '加在後面' }, { value: 'replace', label: '取代目前的清單', variant: 'danger' }] });`（`UiProvider`／`ToolShell` 已包好 `ChoiceProvider`） |
| `useConfirmedReset(options?)` | → `(onReset) => Promise<boolean>` | 「全部重來」：確認後才執行（預設標題、說明、紅色按鈕；可覆寫）。搭配 `resetToolStore`。 |
| `useToast()` | `toast({ title, description?, tone?: 'info' \| 'success' \| 'warning' \| 'danger', duration?, replace? })` | 短暫通知。`replace: true`：取代畫面上現有的通知，一次只顯示這一則（emotion-maker 移植時新增；不給時照舊疊起來，最多 4 則）。注意通知是最上層的可關閉圖層，對話框開著時跳出的通知會先吃掉 Esc。 |
| `ShortcutHelp` | `shortcuts`、`open`、`onOpenChange` | 從快捷鍵表產生的說明（ToolShell 已內建）。`allowInInput` 的快捷鍵在說明旁標示「輸入框裡也可用」（`IN_INPUT_BADGE`），開頭的說明改成「…大部分快捷鍵不會作用；標示「輸入框裡也可用」的在輸入框裡照樣作用。」；沒有 `allowInInput` 的工具內容與以前相同（variant-manager 對等驗證後擴充，向下相容）。 |
| `useShortcuts(shortcuts, enabled?)` | `Shortcut = { keys: 'mod+z' \| string[], label, group?, handler?, allowInInput? }` | 綁在 window。對話框開著、在文字欄打字時不觸發；沒有修飾鍵的單鍵快捷鍵（例如 G）在開關、選單、滑桿上也不觸發（`isFormControlTarget`）；元件已經處理（preventDefault）的按鍵不觸發；焦點在按鈕上時空白鍵／Enter 留給按鈕。`mod` 在 Mac 是 ⌘、其他是 Ctrl。`allowInInput: true`：在文字欄裡也觸發，而且帶 Ctrl／⌘／Alt 的空白鍵、Enter 組合（例如 `mod+shift+enter`）在按鈕、連結、開關上也觸發、不讓給按鈕（variant-manager 對等驗證後擴充；只影響 `allowInInput` 的快捷鍵）。挑組合時避開瀏覽器保留、網頁收不到的組合（例如 Ctrl＋Shift＋N／T／W），並用實體按鍵實測（Playwright 的 `keyboard.press` 不經過瀏覽器的快捷鍵）。**按鈕提示**用 `withShortcut(label, combo)`（`'復原（Ctrl＋Z）'`，Mac：`'復原（⌘Z）'`）或 `comboText(combo)`（Mac 依 ⌃⌥⇧⌘ 排、不加分隔），不要把「Ctrl＋Z」寫死；`isMac()` 也匯出（message-box F76 修正）。**讓出快捷鍵的控制項**：元素標 `data-shortcuts="pass"`（展開 `SHORTCUTS_PASS`）就不算表單控制項——它自己用的鍵在 keydown 時 preventDefault，其他鍵照常交給工具（CropFrame 預設如此）。 |
| `UsageSection` | `children`、`title?`（預設「使用方式」）、`defaultOpen?`（預設收合）、`persistKey?` | 可收合的使用說明。 |

```tsx
const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
<ToolShell
  toolId="battlemap"
  shortcuts={[{ keys: 'g', label: '重新產生', group: '地圖', handler: regenerate }, { keys: 'mod+z', label: '復原', handler: undo }]}
  headerActions={<ProjectMenu toolId="battlemap" getData={() => useSettings.getState().data}
    onLoad={(d) => useSettings.getState().replace(d)} onReset={() => useSettings.getState().reset()} savedAt={useSaveStatus('battlemap')} />}
  …
/>
```

#### 文字演出（G1：縮圖選項、檢查清單、文字結果、清單、軌跡、音訊）

元件展示頁的「文字演出」分頁示範這一節的元件與 G1 的模組（`web/src/tools/_gallery/sections/G1Demo.tsx`、`g1/`）；
預覽欄換成三種示範動畫：打字（影格表＋鎖定 FPS＋多檔）、循環加工（文字加工＋特效＋用途上限與自動縮小）、卡拉 OK。

| 元件 | 主要 props | 說明 |
|---|---|---|
| `Checkbox` | `checked`、`onCheckedChange`、`label?`（可以是元素）、`aria-label?`、`disabled?` | 清單裡的多選（Radix Checkbox）；單一開關仍用 `Toggle`。在 Field 裡會關聯標籤。 |
| `IssueList` | `items: { level: 'error' \| 'warning' \| 'info', message, id? }[]`、`notice?: { tone: 'error' \| 'info' \| 'success', message }`、`empty?`、`aria-label?`（預設「檢查結果」） | 多級檢查清單：錯誤（紅）→ 警告（琥珀）→ 資訊（灰）排序，每列有給螢幕閱讀器的等級文字；清單是 role=status，上方可放一則訊息（匯出失敗為 role=alert）。搭配 `@/ccfolia` 的 `checkTarget`。`ISSUE_LEVEL_LABELS`。 |
| `ThumbChoice` | `options: { value, label, description?, disabled? }[]`、`value`、`onValueChange`、`draw(ctx, value, t)`、`thumbWidth?`／`thumbHeight?`（畫布像素，預設 192）、`minItemWidth?`（預設 88）、`frames?`＋`fps?`、`stillTime?`（預設 0.25）、`renderMeta?` | 即時畫縮圖的單選格線（Radix RadioGroup：方向鍵、空白鍵）：每個選項的縮圖是「目前設定套上這個選項」；平常靜止在 `stillTime`，滑鼠停留或鍵盤聚焦的那一個才循環播放（`data-playing`）；目前選取的有醒目框線（焦點框只在鍵盤聚焦時出現，icon-maker 移植時修正：原本每個選項都一直有焦點框，看不出哪個被選取）。`draw` 換了就重畫，呼叫端用 `useCallback` 包好。靜態縮圖（例如配色卡片的色條）不給 `frames` 即可。 |
| `LoopThumb` | `width`、`height`、`draw(ctx, t)`、`playing`、`stillTime?`、`frames?`＋`fps?`（依格跳）或 `period?`（秒，連續） | 單張循環縮圖（ThumbChoice、TemplateGallery 的函式縮圖用）；requestAnimationFrame 只在 `playing` 時跑。 |
| `AdvancedToggle`、`useAdvancedMode(toolId)`、`getAdvancedMode`／`setAdvancedMode` | `toolId`、`label?`（預設「顯示進階設定」） | 「進階設定」開關，記在瀏覽器（localStorage `trpg-toolkit:<id>:advanced`），同一頁所有用到同一工具 id 的地方同步；存不進瀏覽器時只在這次開頁有效。搭配 `<Show when={advanced}>`。 |
| `TextOutputPanel` | `text`、`title?`（預設「輸出」，也是輸出欄的名稱）、`count?`（預設「共 N 行」；可給函式算字數，`null` 不顯示）、`hint?`、`copyLabel?`、`messages?: { copied, failed, failedHint, empty }`、`wrap?: 'soft' \| 'off'`、`font?: { family, size?, lineHeight? } \| 'mono'`、`placeholder?`、`actions?`、`messageDuration?` | 純文字結果面板（由文字方框產生器的輸出區提升而來，textbox 改用它、行為不變）：唯讀輸出欄＋「複製」（原封不動，含行尾空白、全形空白；複製後維持全選；成功／失敗用 Toast；空白時提示沒有內容）。高度跟著內容；`wrap="off"`＋`font="mono"` 是等寬、不折行、可橫向捲動（文字圖案）。`messageDuration`（毫秒，選填）統一複製通知的顯示時間（不給時照舊：成功與空白 2 秒、失敗依 Toast 預設；text-path 用 3000）。 |
| `ColorPairList` | `items: { id, name, a, b, enabled, custom? }[]`、`onChange(items)`、`aria-label`、`labels?: { a, b }`（預設底色／字色）、`addDefaults?`、`customName?`（預設「自訂」）、`addLabel?`、`sampleText?`／`renderSwatch?`、`onAdded?`、`onRemoved?` | 可勾選＋新增／刪除的配色對清單：每列勾選框、小樣張（底色上寫字）、名稱；自訂的有刪除鈕（內建的不能刪）；下方兩個 ColorField＋「新增」（加在最後、預設勾選）；顯示「已勾選 n／N 組」。 |
| `FontPoolList` | `items: { id, font: FontValue, label?, enabled, custom? }[]`、`onChange(items)`、`aria-label`、`previewText?`、`addLabel?`、`onAdded?`、`onDuplicate?` | 可複選的字型池：名稱用字型本身顯示（Google 字型只下載名稱用到的字）；下方 FontPicker（Google／電腦／上傳）＋「加入字型」；已在清單裡的不重複加入（改成勾選並呼叫 `onDuplicate`）。 |
| `PathPad` | `width`、`height`（邏輯尺寸）、`points`、`onChange(points)`（一筆畫完）、`onDrawStart?`、`minDistance?`（預設 2）、`hint?`、`labels?: { x, y, text }[]`＋`labelSize?`／`labelFont?`（疊字）、`disabled?`、`aria-label` | 軌跡繪製區：以邏輯尺寸作畫、等比縮放顯示（不同螢幕結果相同）；滑鼠、觸控、筆（Pointer Events，`touch-action: none`，畫線時頁面不捲動）；按下開始新的一筆、離前一點不到 minDistance 不加點、放開或離開繪製區就結束；主色粗線＋紅色起點；沒有軌跡時中央顯示 hint（不給 hint 就不顯示，例如選了預設形狀時）；`data-points` 是目前的點數。`labelFont` 可以寫 CSS 變數（預設 `var(--font-ui)`，畫到 canvas 前換成實際的字型堆疊；text-path 實作時修正：canvas 的 font 不認 `var()`）。座標工具在 `@/core/path`。 |
| `AudioDrop` | `onFile(file)`、`status?: { tone, message }`、`label?`、`buttonLabel?`、`hint?`、`accept?`（預設 audio/* 與常見副檔名）、`onReject?` | 接受音訊檔的拖放區＋選檔，下方顯示狀態（解碼中、已載入、無法解碼）。解碼用 `@/core/audio` 的 `decodeAudio`。 |
| `AudioPlayer` | `blob: Blob \| null`、`fileName`、`downloadLabel?`（預設「下載 WAV」）、`aria-label?`（預設「試聽」）、`onDownload?` | 試聽播放器（瀏覽器內建控制列）＋下載按鈕；物件網址自動釋放。 |

```tsx
const [advanced] = useAdvancedMode('cutin');
<ThumbChoice aria-label="文字樣式" value={s.style} onValueChange={setStyle} options={STYLES} draw={drawStyle} frames={15} fps={20} />
<IssueList items={checkTarget(EXPORT_TARGETS[s.target], { format, width, height, frames, lastBytes }).map((i) => ({ ...i, id: i.code }))} />
<TextOutputPanel text={result} font="mono" wrap="off" count={(t) => `${Array.from(t).length} 字`} messages={{ empty: '請先產生' }} />
<PathPad aria-label="繪製區" width={634} height={300} points={path} onChange={setPath} hint="請在這裡畫線" labels={overlay} />
<ExportPanel formats={…} fixedFps={s.fps} colorOptions={[0, 256, 128, 64, 32, 16]} limit={{ bytes: target.maxBytes }} autoShrink={shrinkOnce} onExport={…} />
```

#### OBS 疊加（G4：CSS 預覽、輸出與小元件）

元件展示頁的「OBS 疊加」分頁有四個模擬頁（角色狀態頁、房間訊息框、聊天另開視窗、Streamkit）與示範 CSS
（`web/src/tools/_gallery/obs/demoCss.ts`：示範怎麼用 `@/core/css`＋`@/ccfolia` 組出能在真實頁面生效的 CSS，不是任何工具的正式輸出）。
網址加 `?pause=毫秒` 時預覽裡的動畫停在那個時間點（e2e 用）。

| 元件 | 主要 props | 說明 |
|---|---|---|
| `CssPreviewFrame` | `width`、`height`（來源原尺寸）、`css`、`scene?: MockScene`、`overlay?`、`maxScale?`（預設 1）、`maxHeight?`（預設 560）、`gutter?`（預設 32）、`background?`／`defaultBackground?`／`onBackgroundChange?`、`backgrounds?`（`'checker' \| 'dark' \| 'light' \| 'scene' \| 'color'`）、`showBefore?`／`onShowBeforeChange?`、`hover?`／`onHoverChange?`、`pointer?: 'none' \| 'hover'`、`replayKey?`、`pauseAt?`、`onMeasure?`、`measureViewport?`、`measureSelector?`、`sizeNote?`、`ref?: CssPreviewFrameHandle` | 用 iframe 以來源原尺寸排版模擬頁（`@/ccfolia/mock`）並套用 CSS，再等比縮放：倍率＝min(maxScale, (預覽區寬 − gutter) ÷ 來源寬, maxHeight ÷ 來源高)。粉紅虛線標出來源範圍、角落顯示倍率（套用前時加註）、下方顯示「來源大小 寬 W × 高 H」。工具的 CSS 是 iframe head 的第一個 `<style>`，模擬頁原本的樣式在它之後（與 OBS 相同：CCFOLIA 的樣式後插入）。改 CSS 或 `replayKey` 時所有 CSS 動畫從頭播放（先取消全部 CSS 動畫再重建，暫停中改 CSS 也不會留下舊的時長或關鍵影格）；`pauseAt` 讓所有動畫停在第 t 毫秒（測試、截圖）。`hover` 模擬滑鼠移到頁面上：CSS 的 `:hover` 也對 html／body／#root 的 `.tk-hover` 生效，所以「滑鼠移上才顯示」要寫成 `html:hover …` 這類頁面層級的選擇器；`pointer="hover"` 讓真的滑鼠移入也觸發（點擊、捲動、按鍵一律無效）。`onMeasure` 回報來源內容尺寸（場景的 `measure`，或 #root 右下角＋外距、無條件進位），頁面變動與字型載入後重量；`ref.measureWith(css)` 可暫時換一份 CSS 量（例如以 10 個字的名稱估算）。`overlay?`：疊在預覽區（棋盤格那一塊）上的內容，以預覽區為定位基準（`absolute inset-0` 就是整個預覽區），例如「點一下切換說話中」的透明按鈕與狀態標籤；iframe 本身仍然不能操作（obs-tachie 移植時新增）。 |
| `CssExportPanel` | `css`、`fileName`（主體，會清理）、`fallbackFileName?`、`copiedMessage?`、`savedMessage?`、`onCopy?(ok)`、`onSave?(name)`、`disabledReason?`、`defaultViewerOpen?`、`status?`、`actions?` | 「複製 CSS」（剪貼簿不能用時退回舊式複製；仍失敗就顯示錯誤、展開「查看 CSS」並選取全文）、「儲存 .css」（UTF-8）、可收合的「查看 CSS」（唯讀、行數與大小）、狀態訊息。 |
| `SourceUrlField` | `url: string \| null`、`placeholder?`、`missingWarning?`、`missingAction?`、`copiedMessage?`、`onCopy?` | 唯讀的瀏覽器來源網址欄＋「複製網址」；沒有網址時按鈕停用，可顯示警告與動作按鈕（例如「前往房間網址」）。放在 Field 裡會關聯標籤。 |
| `ObsGuide` | `urlLabel`、`url?`、`size?`、`login?: 'interact' \| 'swap-url' \| 'none'`、`loginOnly?`、`audio?`、`obs?: { version?, features? }`、`multipleSources?`、`localFonts?`、`extraSteps?`、`disclaimer?`、`children?` | 共用的「在 OBS 裡設定」說明：新增瀏覽器來源、網址、寬高、清空自訂 CSS 再貼上；登入（「互動」，或先把網址換成 https://ccfolia.com/）；透過 OBS 控制音訊；需要 OBS 31 以上的效果；瀏覽器來源不能複製；電腦字型的注意事項；非官方聲明（可換成 Discord 的版本）。 |
| `Stepper`／`StepNav` | `steps: { label, description? }[]`、`value`、`onValueChange`、`completed?`、`hideDescriptionOnNarrow?`；StepNav：`value`、`count`、`onValueChange` | 帶編號的步驟列（目前步驟醒目、之前的標示已完成、可直接點、方向鍵移動焦點）；上一步／下一步＋「步驟 n／N」（第一步時上一步隱藏但保留位置、最後一步時下一步停用）。 |
| `AnchorGrid` | `value: Anchor`、`onValueChange`、`cellSize?`；`ANCHORS`、`ANCHOR_LABELS`、`anchorAxes(a)` | 3 × 3 錨點（左上、上中…右下）單選，方向鍵在兩個方向移動，每格有名稱提示。 |
| `ItemListEditor` | `items`、`getId`、`getName`、`aria-label`、`title?`、`placeholder?`、`selectedId?`／`onSelect?`、`onAdd?`／`addLabel?`、`onRemove?`、`confirmRemove?(item)`、`onRename?`／`renameLabel?`、`renderLeading?`、`renderMeta?`、`renderActions?`、`renderDetails?`、`emptyText?` | 可增刪、選取、改名的清單（角色清單、使用者、預設集、已儲存組合）。標題附數量；新增後游標移到新項目的名稱欄；`confirmRemove` 回傳確認內容時先詢問（說明連帶刪除的資料）。 |
| `TestValueRow`／`TestValueShortcuts` | `label`、`onLabelChange?`、`value`、`max`、`onValueChange`、`onMaxChange`、`maxLimit?`；快捷鈕：`onApply(kind)`、`kinds?`、`step?`；`applyTestShortcut(kind, value, max, { step, threshold })` | 預覽用的數值測試列（名稱、0～最大值滑桿、最大值欄 1～9999）與 −3／＋3／減半／危急（⌈最大值 × 門檻 ÷ 100⌉ − 1）／歸零／全部回復。 |
| `MessageComposer` | `speakers`、`speaker`／`onSpeakerChange`、`kinds: { value, label, needsResult? }[]`、`kind`／`onKindChange`、`onSend({ speaker, kind, command, result })`、`resultExample?`、`requireCommand?`；`parseComposerText(text)` | 自訂測試訊息：以第一個「\|」（或全形「｜」）分隔指令與結果；空白或缺結果時錯誤提示；`requireCommand` 時需要結果的種類「\|」前面也不能是空的；Enter 送出（輸入法選字中的 Enter 不算）；送出後清空。 |
| `GestureScope` | `gesture`（`historyGesture(store)` 的回傳值）、`children` | 「按下到放開算一步復原」的範圍：包住沒有 `onCommit` 的控制項（例如 `ColorField` 的調色盤），按下時開始手勢、放開（不論放在哪裡，含之後的 click）才結束，拖曳中的變更合成一步。React 事件會穿過 Portal，所以彈出的調色盤也算在裡面。（訊息框產生器移植時新增） |

```tsx
const scene = useMemo(() => createCharacterScene(), []);           // @/ccfolia/mock
useEffect(() => scene.update({ statuses: preview.statuses }), [scene, preview.statuses]);
const css = useMemo(() => buildCss(settings), [settings]);         // 用 @/core/css 組
<CssPreviewFrame width={size.width} height={size.height} css={css} scene={scene} maxScale={2}
  showBefore={preview.before} onShowBeforeChange={(before) => setPreview({ before })} onMeasure={setSize} />
<CssExportPanel css={css} fileName={settings.fileName} copiedMessage={`已複製，請貼到寬 ${size.width} × 高 ${size.height} 的瀏覽器來源`} />
<Field label="瀏覽器來源網址"><SourceUrlField url={characterUrlFrom(ch.id, settings.room)} missingWarning="請先填房間網址與角色 ID。" /></Field>
<UsageSection><ObsGuide urlLabel="角色狀態頁的網址" size={size} multipleSources obs={{ version: 31, features: ['危急演出'] }} localFonts={localFontNames(fonts)} /></UsageSection>
```

#### 立繪工作台（G3：版面編輯、盤面、清單、取色、部件）

元件展示頁的「立繪工作台」分頁：設定欄示範清單、取色、部件與專案檔，預覽欄有三個畫面——頭像版面（LayoutEditor）、
身高板（PanZoomViewport＋尺規＋WindowDrop＋資產庫）、裁切框（Stage 的拖曳平移與滾輪縮放＋CropFrame＋剪影效果）。
示範圖全部在瀏覽器裡現畫（`web/src/tools/_gallery/g3/art.ts`），不是任何工具的素材。

**版面編輯層用 DOM 疊在 Stage 上，不用 Konva**：工具在 canvas 上用同一段繪圖程式畫預覽與匯出（所見即所得、匯出解析度固定），
LayoutEditor 只負責點選、拖曳、控點、參考線與鍵盤；這樣不必維護兩套畫法（Konva 節點＋匯出），控點與標籤可以維持固定的螢幕大小，
元件能用 jsdom 測試、控制項都是可聚焦的按鈕，也不會多一個 150 KB 的相依。G7 若需要旋轉、群組等自由版型再評估 Konva。

| 元件 | 主要 props | 說明 |
|---|---|---|
| `LayoutEditor` | `width`、`height`（同 Stage）、`frame?`（參考範圍，內容座標）、`units?: 'px' \| 'percent'`、`items: LayoutItem[]`（`{ id, label, box, resizable?, handles?, limits?, clamp?(box, op), locked?, clipToFrame? }`）、`selectedId`、`onSelect(id \| null)`、`onChange(id, box, { phase: 'start' \| 'move' \| 'end' \| 'nudge', op })`、`guides?`、`formatDistance?`、`keyboard?`、`nudgeStep?`、`nudgeShiftStep?`、`onEscape?`、`safeArea?` | 放在 Stage 裡、疊在 canvas 上。按下即選取（同時只有一個，選取中有主色外框）、拖曳移動、控點（預設右下角）調整大小（對角不動、夾在 `limits`）；拖曳與改大小後套用 `clamp`（`clampBoxPosition` 可以夾左上角或中心點）。拖曳中顯示參考線：frame 的中心十字、物件的四條邊線、「左 x%｜右 y%」「上 x%｜下 y%」兩個距離標籤（四捨五入），放開消失。鍵盤掛在 window（焦點在文字欄、選單、滑桿等表單控制項或對話框裡時不作用）：方向鍵移動 `nudgeStep`（Shift `nudgeShiftStep`；**不夾範圍**，phase 為 'nudge'）、Delete／Backspace 取消選取、Esc 隱藏參考線並呼叫 `onEscape`。`units="percent"` 時 box 是 frame 的百分比。指標換算用實際顯示大小（`clientToLocal`），Stage 縮放後拖曳仍與滑鼠同步。`clipToFrame` 讓點選範圍只算 frame 以內（圖片超出內側區域被裁掉時）。 G2 加的選填：`snap?: { canvas?, items?, threshold?（8）, release?（12）}`（螢幕 px；拖曳移動時中心或邊緣吸到 `frame` 的左中右／上中下與其他物件的邊和中心，顯示吸附參考線 `data-testid="layout-snap"`，拖開 `release` 以上才脫離；`units` 為 px 或 % 都可以）、`hitPadding?`（點選範圍往外擴的螢幕 px，細長物件好點）。 |
| `PanZoomViewport` | `world: Box`（世界座標範圍）、`baseScale?: number \| 'fit-height' \| 'fit-width' \| 'fit'`、`zoom?`／`defaultZoom?`／`onZoomChange?`、`minZoom?`（0.2）、`maxZoom?`（4）、`wheelStep?`（每 100 px ×1.16）、`padding?`、`align?: { x?, y? }`、`extend?: 'x' \| 'y' \| 'both'`、`draw(ctx, view)`、`gutter?: { width, draw(ctx, view) }`、`onPointerDown?(p)` → `ViewportDrag`、`onEmptyClick?(p)`、`onHover?(p \| null)`、`getCursor?(p)`、`getTooltip?(p)`、`panThreshold?`（3）、`spacePan?`（true）、`background?`、`ref?: PanZoomViewportHandle` | 世界座標作畫的盤面（例如 cm）。原生捲軸＋sticky canvas（觸控板、捲軸都能捲）。滾輪以游標為中心縮放（游標下的點不動）、Shift＋滾輪橫向捲動、Ctrl＋滾輪不攔截；空白處拖曳（超過 3 px）、中鍵、按住空白鍵拖曳都是平移，平移後放開不算點一下。點選測試由工具決定：`onPointerDown` 回傳 `{ onMove, onEnd(p, moved), cursor }` 表示點到物件，不回傳就是空白處。游標樣式（空白處「抓取」、平移中「抓住」）、跟著游標的提示框。`gutter` 是左側固定欄（尺規），只跟著縱向捲動。`extend="x"` 讓盤面至少延伸到畫面右緣（`view.world` 是延伸後的範圍）。縮放時讓錨點下的點不動，但不為了錨點把範圍延伸到內容之外——捲不到的地方由捲動範圍夾住（和舊版身高比較板相同；height-board 對等驗證後修正）。`view` 有 `scale`（每單位 px）、`toScreen`、`toWorld`、`visible`。handle：`getView`、`zoomTo(z, anchor?)`、`zoomBy`、`fitWidth({ max })`、`scrollTo`／`scrollBy`、`scrollToWorld(box)`（最小捲動、比畫面大時露出開頭）、`clientToWorld(x, y)`（拖放位置）、`redraw`。 |
| `CropFrame` | `width`、`height`（同 Stage）、`rect`、`onMove?(rect, phase)`、`axis?: 'x' \| 'y' \| 'both'`（預設 'x'）、`dim?`（0.5）、`label?`、`disabled?`、`passShortcuts?`（預設 true） | 嵌在預覽上的裁切框（放在 Stage 裡）：框外變暗、主色細框、框旁提示標籤（固定螢幕大小，上方放不下時放框內）；尺寸由工具決定，只能沿 axis 拖曳，永遠夾在圖內（框比圖寬時固定在 0，`clampSpan`）；role=slider，聚焦時方向鍵 1 px（Shift 10 px）。pointerdown 會 stopPropagation，不會觸發 Stage 的拖曳平移。**焦點**：拖曳或點過框後焦點留在框上；框只用方向鍵（四個方向都歸框，不能移動的方向也不捲動頁面），其他鍵（工具的 D、C、Esc、Ctrl＋S、貼上等）照常作用（`data-shortcuts="pass"`）。`passShortcuts={false}` 回到一般滑桿的做法（焦點在框上時單鍵快捷鍵不作用）。 |
| `SortableList`／`LayerList`／`useSortable` | SortableList：`items`、`getId`、`renderItem(item, { index, selected, dragging, over })`、`onMove(from, to)`、`onMoveStart?`、`onMoveEnd?`、`mode?: 'live' \| 'drop'`、`sortDisabled?`、`cancelOutside?`、`selectedId?`／`onSelect?`、`empty?`、`aria-label`；LayerList 另有 `items: { id, name, thumbnail?, visible?, value?, meta? }[]`、`onVisibleChange?(id, v)`、`number?: { label, onChange, onCommit?, min, max, step, unit }`、`moveButtons?: { up, down }`、`thumbSize?`（60 × 84）、`compact?`、`renderActions?` | 拖曳排序（指標事件，門檻 4 px，從輸入欄、按鈕、開關上開始的不算；觸控時整列留給捲動，只能從拖曳把手 `[data-drag-handle]`（加 `touch-none`）開始拖，LayerList 每列左邊有把手）；拖到捲動範圍上下 24 px 內自動捲動；`mode="live"` 拖過中線就換位置（整次拖曳以 onMoveStart／onMoveEnd 包起來，工具在這兩個時機 `beginGesture`／`endGesture`，算一步復原），`"drop"` 放開才移動。列有焦點時 ↑／↓ 選取、Alt＋↑／↓ 移動一格；沒拖就放開＝點一下選取。`sortDisabled`（篩選中）時不能拖、按住只會選取。**`cancelOutside`**（選填，drop 模式；color-palette 移植時新增，不給時行為不變）：指標在所有列的外接範圍之外時沒有目標列、放開不移動——一頁有好幾個清單（例如每條色條各一個分段清單）時，拖到別的清單上放開不算。LayerList：縮圖框底部對齊、左右置中，名稱、列內數字欄（`NumberInput`，打字中不會被重繪蓋掉）、顯示／隱藏（隱藏的列變淡）、上移／下移按鈕（到頭停用）、緊密列距。`useSortable` 是共用的拖曳邏輯（ThumbnailList 也用）。 G2：`useSortable({ axis: 'xy' })`（格線：以包含或最近的項目判斷落點，Alt＋←／→ 也能移動；預設 `'y'` 不變）。 |
| `ImageSampler` | `image`、`mode: 'points' \| 'splits' \| 'none'`、`points?`／`onPointsChange?`、`maxPoints?`、`splits?`／`onSplitsChange?`、`minGap?`（0.02）、`zoom`／`onZoomChange`、`minZoom?`（0.2）、`maxZoom?`（5）、`showZoom?`、`wheelZoomPer100?`（0.5）、`empty?`、`viewportClassName?` | 取色區（放進 `Dialog size="xl"` 就是取色視窗）：圖片可縮放（滑桿每 10%，或 Ctrl／⌘＋滾輪）、捲動；取色位置一律以原圖像素計。points：點圖取色（依點選順序、點滿就不再取；取該像素 RGB，完全透明是黑色，`samplePixel`），取色點是填著該色的圓點，可拖動（拖出圖片時夾在邊緣）、聚焦時方向鍵 1 px；splits：水平分割線（比例），上下拖動不越過相鄰的線、至少相隔 minGap、不出圖（`moveSplit`），聚焦時 ↑↓ 1%（Shift 5%）。 |
| `PartPicker` | `label`、`options: { id, name, layer, custom? }[]`、`mode: 'single' \| 'multiple'`、`value: string[]`、`onChange(next)`、`base?`（每個縮圖底下的圖層）、`onRemove?(option)`、`actions?`、`thumbSize?`（88）、`empty?` | 部件選擇格：縮圖是「底圖＋該部件」的合成（`core/compose`，等比置中、棋盤格底），下方名稱（省略、滑過看全名）。single：單選，再點一次已選的就取消（回傳 []）；multiple：複選、有順序（新加的放最後＝最上層）。兩種模式醒目顏色不同（主色／綠色），標題旁標示「單選」「複選」。自訂選項有「自訂」標記，滑過或聚焦時出現刪除鈕（確認由工具做）。 |
| `SelectableCardList` | `items: { id, title, summary?, thumbnail?, checked }[]`、`title?`、`editingId?`、`onCheckedChange(id, v)`、`onEdit?`、`onDuplicate?`、`onDelete?`、`onCheckAll?(v)`、`onDeleteChecked?`、`untitled?`（「無標籤」）、`checkedLabel?`、`thumbSize?`（64）、`empty?`、`actions?` | 可勾選的卡片清單：勾選框、縮圖、標題（空白顯示「無標籤」）與摘要、編輯／複製／刪除；正在編輯的那筆醒目並標「（編輯中）」；標題旁總數、「已勾選 x／共 y」、全選／全不選／刪除勾選的。刪除的確認由工具做。 |
| `Chips` | `items: (string \| { value, label?, title? })[]`、`onPick(value)`、`value?`、`disabled?`、`size?`、`aria-label` | 建議詞按鈕組（例如差分名建議）：點一下把詞交給 onPick；給 `value` 時相同的按鈕標示選取中。 |
| `WindowDrop` | `onDrop(files, { clientX, clientY })`、`accept?`、`onReject?`、`label?`（「放開即可加入」）、`hint?`、`disabled?` | 全視窗拖放：檔案拖進視窗任何地方時整個畫面出現覆蓋層，拖出或放開後消失；放開時交出檔案與放開的位置（搭配 `PanZoomViewportHandle.clientToWorld` 決定新角色的位置）。頁面上其他拖放區（FileDrop）已處理的放開不會重複處理。 |

```tsx
// 頭像：canvas 畫預覽與匯出，LayoutEditor 疊在上面
<Stage width={1024} height={1024}>
  <canvas ref={canvas} width={1024} height={1024} className="block size-full" />
  <LayoutEditor width={1024} height={1024} frame={inner} units="percent" items={items} selectedId={sel} onSelect={setSel}
    onChange={(id, box, { phase }) => { if (phase === 'start') g.begin(); else if (phase === 'end') g.commit(); else setBox(id, box); }}
    nudgeStep={0.2} nudgeShiftStep={2} safeArea={safe} />
</Stage>
// 裁切器：拖曳平移、直接滾輪縮放（以符合畫面為 100%）、只能左右拖的裁切框
<Stage width={img.width} height={img.height} dragPan wheelZoom="plain" zoomBase="fit" zoomRange={[0.2, 5]} wheelFactors={[1.1, 0.9]}
  zoom={zoom} onZoomChange={setZoom} pan={pan} onPanChange={setPan}>
  <canvas … /><CropFrame width={img.width} height={img.height} rect={crop} label="可以左右拖曳" onMove={(r) => setOffset(r.x - baseX)} />
</Stage>
// 身高板：世界座標（cm）、左側尺規、拖放位置
<PanZoomViewport ref={vp} world={world} baseScale="fit-height" extend="x" align={{ x: 'start', y: 'end' }} zoom={zoom} onZoomChange={setZoom}
  gutter={{ width: 58, draw: drawRuler }} draw={drawBoard} onPointerDown={hitAndDrag} onEmptyClick={() => select(null)} getTooltip={tip} />
<WindowDrop accept="image/*" onDrop={(files, at) => add(files, vp.current?.clientToWorld(at.clientX, at.clientY))} />
```

#### 轉場與動態（G2：效果卡片、節點表）

展示頁「轉場與動態」分頁（`web/src/tools/_gallery/g2/`）：轉場形狀與曲線的效果卡片、節點表、濾鏡卡片（可取消選取）、圖片動態與結尾消失、動畫圖檔解碼＋縮圖清單；預覽欄有轉場（影格表、示意場景背景、預覽速度、預估列與處理量上限）、圖片動態、版面吸附三個畫面。

| 元件 | 主要 props | 說明 |
|---|---|---|
| `EffectGrid` | `items: EffectGridItem<V>[]`（`{ value, label, description?, group?, disabled? }`）、`value: V \| null`、`onValueChange(v \| null)`、`aria-label`、`allowDeselect?`、`draw?(ctx, value, t)`（卡片示意動畫，`t` 0～1）、`thumbWidth?`／`thumbHeight?`（160 × 90）、`period?`（2 秒一輪）、`stillTime?`（0.5）、`animate?: 'hover' \| 'always' \| 'none'`、`columns?`、`minItemWidth?`（132）、`renderBadge?(item)` | 有縮圖的效果卡片（單選，`group` 分組顯示）。radiogroup＋roving tabindex：←→ 依序（跳過停用的）、↑↓ 依實際位置換列、Home／End；`allowDeselect` 時再點一次或空白鍵／Enter 取消（回傳 `null`）。示意動畫只在滑過、聚焦或選取時播放（`animate='hover'`），減少動態效果時停在 `stillTime`；`draw` 換了（例如圖片載入後）卡片重畫。 |
| `KeyframeTable` | `value: Keyframe[]`、`onChange(keys)`、`curves: { value, label }[]`、`aria-label`、`rules?: KeyframeRules`、`defaults?`＋`onReset?`、`timeUnit?`（秒）、`valueUnit?`（%）、`labels?: { time?, value?, curve? }`、`timeStep?`（0.05）、`valueStep?`（1）、`addLabel?`、`resetLabel?`、`disabled?` | 節點表（時間、數值、到這個節點的曲線）。打字時只改那一格，離開欄位才 `normalizeKeyframes`（排序、最小間隔、數值不倒退、首尾鎖定）；新增插在最大的間隔、刪除到最少個數為止；顯示「n／上限 個節點」與摘要（`keyframe-count`、`keyframe-summary`）。 |

```tsx
// 轉場：抵達時間圖建一次，每格只換查表；影格表＝每格 1 ÷ FPS 秒、停留加在最後一格
const map = useMemo(() => buildArrivalMap(s.shape, 480, 270, s.params), [s.shape, s.params]);  // 旋轉合攏每格重建
const frames = transitionFrames({ duration: s.duration, fps: s.fps, holdMs: s.hold * 1000, roundTrip: s.roundTrip });
const source = sequenceSource({ width: 480, height: 270, frames, renderFrame: (ctx, f) =>
  drawTransition(ctx, map, { progress: getCurve(s.curve)(f.progress), mode: 'cover', softness: s.softness, color: s.color }) });
const playback = usePlayback({ duration: source.duration, loopGap: s.loop ? 0 : 1.2 });
<Stage<StageAnyBackgroundKind> width={480} height={270} backgrounds={['scene', 'checker']} defaultBackground={{ kind: 'scene' }}>…</Stage>
<Transport {...playback} frames={frames} onRateChange={playback.setRate} />
<EffectGrid aria-label="轉場形狀" items={SHAPES} value={s.shape} onValueChange={(v) => v && set({ shape: v })} draw={drawShapeThumb} />
<EffectGrid aria-label="濾鏡" items={FILTERS} value={s.filter} onValueChange={(v) => set({ filter: v })} allowDeselect animate="none" draw={drawFilterThumb} />
<KeyframeTable aria-label="讀取進度" value={s.keys} onChange={(keys) => set({ keys })} curves={CURVE_OPTIONS} defaults={DEFAULT_KEYS} />
<ExportPanel formats={…} fixedFps={s.fps} maxPlays={MAX_PLAYS}
  estimate={{ width: 1280, height: 720, frames: frames.length, duration: source.duration }}
  pixelBudget={{ max: 220_000_000, message: '處理量超過上限，請縮短時間或降低 FPS。' }}
  onExport={(set, { signal, onProgress }) => exportAnimation(source, { …, webpPickSmaller: true, signal, onProgress })} />
```

### 4.2 模組（`web/src/core/`、`web/src/ccfolia/`）

| 模組（import 路徑） | 主要函式與型別 | 說明 |
|---|---|---|
| `@/core/storage` | `createToolStore(id, initial, { version?, migrate?, persist?, historyLimit?, coalesceMs? })` → store（state：`data`、`update(recipe)`、`patch(partial)`、`replace(data)`、`reset()`；`store.temporal`；`store.beginGesture()`／`endGesture()`／`inGesture()`）；`useUndoRedo(store)`；`useSaveStatus(id)`／`getSaveTime(id)`；`historyGesture(store)` → `{ begin, commit, live(fn) }`；`resetToolStore(store)`；`createPreviewStore(id, initial, { persist?, onPersistError? })`；`safeStorage(base, onError?)`；`applyTemplate(current, template, { keep })` | 設定自動存到 localStorage（鍵名 `trpg-toolkit:<id>`，只存 `data`；新版加的欄位自動補預設值；版本不同時呼叫 migrate）；zundo 復原／重做（400 ms 內的連續變更算一步，例如拖滑桿）；`update` 用 Immer 寫法。規格寫「不保留狀態」的工具用 `persist: false`。**放開才記一步**：`coalesceMs: 0` 加上 `historyGesture`（`<Slider onChange={g.live(set)} onCommit={g.commit} />`、文字欄 `onFocus={g.begin} onBlur={g.commit}`），手勢中的所有變更合成一步（commit 延到這一輪事件之後，配合 Radix 滑桿鍵盤操作「先 commit 再 change」的順序）。**不列入復原的狀態**（預覽背景、套用前、測試數值、預覽角色）放 `createPreviewStore`（鍵名 `trpg-toolkit:<id>:preview`，一樣自動存檔與補預設值）。**套用範本**：`applyTemplate` 範本有的欄位換掉（物件逐層合併、陣列整個換），再把 `keep` 路徑（`.` 分隔、`*` 代表每一項，例 `'bars.*.nameOverride'`）還原成目前的值。「全部重來」用 `useConfirmedReset`＋`resetToolStore`（兩個 store 都要重設）。**部分存檔**（G3）：`partialize: (d) => ({ aspect: d.aspect, range: d.range })` 只把這些欄位寫進 localStorage（其餘重新整理後是初始值；復原／重做仍涵蓋全部欄位）。**存檔失敗**：寫入 localStorage 丟錯（容量不足、被封鎖）時錯誤會被攔下（工具照常運作），呼叫 `onPersistError(error)`，`useSaveError(id)` 回傳最近一次的錯誤（成功後清掉）。**預覽 store 也一樣**：`createPreviewStore` 讀寫 localStorage 失敗（容量已滿、寫入或讀取被封鎖）時不丟例外，照常運作、只是不存（可給 `onPersistError`）；讀不到時用初始值。包裝函式 `safeStorage` 也匯出（chat-window F96 修正）。 |
| `@/core/storage`（IndexedDB） | `idbStore(name)`、`toolDb(toolId)`、`idbGet`／`idbSet`／`idbDel`／`idbKeys`／`idbEntries`／`idbClear`、`hasIndexedDb()` | 圖片、字型、大型資料放這裡（idb-keyval，每個名稱一個資料庫 `trpg-toolkit:<name>`）。 |
| `@/core/storage`（專案檔） | `serializeProject(tool, version, data)`、`parseProject(text, tool)`（錯誤丟 `ProjectFileError`，訊息可直接顯示）、`createProjectFile`；G3：`serializeProjectZip(tool, version, data, files, now?)`、`parseProjectBytes(bytes, tool)` → `{ …ProjectFile, files: Map<名稱, 位元組>, container: 'json' \| 'zip' }`、`isZipBytes`、`PROJECT_JSON_NAME`、`PROJECT_FILES_DIR`、`ProjectBinary` | 格式：`{ format: 'trpg-toolkit-project', tool, version, savedAt, data }`。**夾帶二進位檔**（圖片）時存成 ZIP：`project.json`（內容同上）＋`files/<名稱>`（只打包不壓縮，`now` 固定時逐位元組相同）。`parseProjectBytes` 看檔頭分辨 ZIP 或 JSON（JSON 可有 BOM），所以舊的 JSON 專案檔照樣讀得到；ZIP 缺 project.json、損壞時丟 `ProjectFileError`。ProjectMenu 給 `getFiles` 就用這個格式。 |
| `@/core/files` | `downloadBlob(blob, name)`、`downloadUrl`／`downloadDataUrl`、`downloadBytes`、`downloadText`；`readAsText`／`readAsArrayBuffer`／`readAsBytes`／`readAsDataUrl`；`pickFiles({ accept, multiple })`；`matchesAccept`；`copyText(text)`；`downloadSequentially(items: { name, blob: Blob \| (() => Promise<Blob>) }[], { intervalMs?（預設 500）, signal?, onProgress? })`；`zipFiles(entries, { level, mtime })`、`unzipFiles(bytes)`；`safeFileName(name, { fallback, maxLength })`、`fileNameWithExt`、`splitExtension`、`sequenceName`；`formatBytes`、`SIZE_WARNING_BYTES`；`formatLimitBytes`、`usagePercent` | 檔名清理：拿掉 `\ / : * ? " < > \|` 與控制字元、合併空白、去頭尾的點與空白、避開 Windows 保留名，中文與 emoji 保留。ZIP 檔名以 UTF-8 存；固定 `mtime` 可讓輸出逐位元組相同。`copyText` 原封不動（含行尾空白、全形空白），Clipboard API 不能用時改用 execCommand。`downloadSequentially` 一個接一個下載（不打包），兩次下載之間至少間隔 intervalMs（避免瀏覽器擋下連續下載）；內容可以是輪到時才產生的函式（例如下載時才編碼），等待間隔時就先準備；可取消。`formatLimitBytes`：用途上限的顯示（未滿 1,024「n B」、未滿 1 MiB「x.x KB」、其餘「x.xx MB」，以 1024 為單位；1,000,000 → 976.6 KB），`usagePercent` 四捨五入成整數。 **G3 加的**：`copyImage(blob \| Promise<Blob>)` → `{ ok } \| { ok: false, reason: 'unsupported' \| 'denied' \| 'encode' \| 'failed' }`（以 PNG 放進剪貼簿，非 PNG 先轉；Safari 要在點擊當下呼叫，所以耗時的產生請傳 Promise；失敗不丟錯，建議提示改用下載）；`uniqueFileName(name, used, { separator?, start?, ignoreCase? })`（重名時在副檔名前加 `_2`、`_3`…，**加了之後再檢查**直到不撞名，例 a、a、a_2 → `a.png`、`a_2.png`、`a_2_2.png`；預設不分大小寫；結果加進 used）；`safeFileName(name, { underscore: true })` 底線模式（去頭尾空白 → 連續空白含全形與換行換成一個 `_` → **刪掉** `\ / : * ? " < > \|` → 合併連續 `_` → 去頭尾 `_`；例「怒り/怒?」→「怒り怒」、「a  b__c_」→「a_b_c」）；`reservedNames: false`（預設 true）不替 Windows 保留名稱（CON、NUL…）加「_」，清理的是檔名中間的片段或要原樣顯示的名稱時用（例：差分名也用在聊天面板的「@差分名」；variant-manager 移植時新增）。 G2：`naturalCompare(a, b)`／`naturalSort(list, key?)`（檔名自然排序：數字依大小，2 在 10 前面；同名保持原順序）、`formatDataSize(bytes)`（B／KB／MB／GB）。 |
| `@/core/fonts` | `GOOGLE_FONTS`（目錄）、`BASIC_TC_FONTS`、`findGoogleFont`、`googleFontCssUrl`、`nearestWeight`（距離相同取較細的）；`SYSTEM_FONTS`、`findSystemFont`、`CSS_WEIGHT_CHOICES`、`resolveFontWeight(font, weight)`；`ensureFont(family, weight?, text?)`、`ensureFonts(list)`、`fontCss(value, px)`、`fontFamilyCss(family)`、`FALLBACK_STACK`；`loadPreviewFont`；`canQueryLocalFonts`、`queryLocalFamilies`、`queryLocalFontFamilies({ force? })`（`LocalFontError.kind`：unsupported／insecure／denied／empty／failed）、`cachedLocalFonts`、`filterLocalFonts(list, query)`、`isLocalFontAvailable`；`uploadFont(file)`、`listUploadedFonts`、`removeUploadedFont`、`registerUploadedFonts`、`readFontNames(bytes)`；`defineFontChoices(list)`、`pickFontChoice(list, id)`、`FontChoice<T>` | 目錄 80 套（繁中 14 套：思源黑／宋、霞鶩文楷、朱古力黑體、仙人掌明體、粉圓、芫荽、昭源黑／宋、注音字型…；日 27、韓 13、英 26，含 G4 規格字型清單的全部字型；G1 補上 Rampart One、Permanent Marker、Nanum Gothic，以及拼貼信韓文字型的替代：Gothic A1、Sunflower、Gamja Flower、Gaegu；Shippori Mincho B1 已有 800），字重都已用 css2 驗證存在（2026-10-01）。**工具自己的字型清單**：`defineFontChoices([{ family, weight?, label?, id?, data }])` 從目錄挑字型（目錄沒有就丟錯）、字重取最接近的，每套附加工具要的資料（例如切入的外框倍率、建議字數）；`pickFontChoice` 依代號或字型名稱找，找不到時第一個（分享連結的未知代號）。`SYSTEM_FONTS` 是 CSS 類工具的電腦內建字型（微軟正黑體、新細明體、標楷體＋Yu Gothic UI、Meiryo、Yu Mincho，附中文／日文別名）。畫 canvas 前一定要 `await ensureFont`（中日韓字型只下載 text 用到的部分）。上傳字型會讀 name 表取名稱（TTF／OTF／TTC／WOFF；WOFF2 用檔名）。 |
| `@/core/encode` | `createEncoder(spec, { worker?, maxInFlight? })` → `Encoder`（`addFrame(rgba, ticks?)`、`setStill(rgba)`、`finish()` → `EncodedFile`、`abort()`）；`spec` 為 `{ format: 'apng' \| 'gif' \| 'webp' \| 'png-sequence', options }`；`encodePng(rgba, w, h, palette?)`、`encodePngAsync`；`ApngEncoder`、`GifEncoder`、`WebpEncoder`、`PngSequenceEncoder`；`ColorStats`／`buildPalette`；`assembleApng`、`assembleAnimatedWebp`、`parseWebp`、`supportsWebpEncoding()`；`crc32`、`chunk`、`zlib`；`GIF_MAX_FPS` | APNG（移植自 text-fx）：只存與前一格不同的矩形、相同影格合併（`mergeIdentical: false` 可關）、預設圖、播放次數、減色（256 色含半透明，色數在 256 內時無損）；`palette`（RGBA 平鋪、1～256 色）給固定調色盤時直接輸出調色盤 PNG，像素必須與調色盤某色完全相同（完全透明像素的 RGB 也保留），適合「單色＋透明度」這類顏色事先知道的輸出。延遲要以毫秒計時用 `fps: 1000`、`addFrame(rgba, 毫秒)`。GIF：全域調色盤（`localPalettes: true` 時每格各自減色，見下）、1 位元透明、延遲以 1/100 秒累計、fps ≤ 50。WebP：自己封裝 RIFF／VP8X／ANIM／ANMF，影格由瀏覽器編碼（quality 1 為無損 VP8L），差分矩形對齊偶數。全部預設在 Web Worker（Comlink）裡執行，影格以 transfer 傳入（傳入後不要再用那塊記憶體）。同樣輸入輸出逐位元組相同。`ApngEncoder` 另有 `embedStill`（false＝`setStill` 的畫面只用在減色統計、不放進檔案）與 `stillWeightMin`（減色時代表畫面份量＝影格數×0.35 的下限，text-fx 用 4）；`maxColors`（2～256）指定減色的色數。**單張 PNG 的色數**：`encodePngColors(rgba, w, h, maxColors)`（0＝全彩 RGBA；2～256＝調色盤 PNG，色數在上限內時無損）→ `{ bytes, colors? }`，Worker 版 `encodePngColorsAsync`（`encodePngAsync` 也多了 `maxColors` 參數）。**GIF**：每格至少 2/100 秒、補上的時間從後面的格扣回（fps ≤ 50 時結果與以前相同）；`alphaThreshold`（預設 128）；`variableDelay: true`＝影格表模式（fps 只當 ticks 的單位，例如 100，不檢查 50 的上限）。**WebP 每格最短時間**：`WebpEncoder` 的 `minFrameMs`（預設 0＝不限，輸出與以前逐位元組相同）：每個輸入影格至少顯示這麼久，補上的時間不從別格扣回（總長變長；合併相同影格時先各自補足再相加；`duration` 含補上的時間）；`exportAnimation` 用 `webpMinFrameMs` 傳入（typewriter 用 20：60 FPS、停留 500 → 20×5、500）。 G2：WebP 的 `options.pickSmaller`（有損時每格另外試無損，留較小的位元串）；`gifAlphaThresholdInclusive(v)`（「alpha ≥ v 算不透明」換成 GIF 編碼器的門檻）；`MAX_PLAYS`（65535，APNG／GIF／WebP 播放次數上限）。**調色盤的選法（cutin 對等修正加的，向下相容）**：`buildPalette(stats, maxColors, method?)`，`PaletteMethod`＝`'median-cut'`（預設：加權中位切割＋k-means 4 次，不給時輸出與以前逐位元組相同）或 `'pca'`（主成分切割：每次切「沿主軸分散量」最大的一群、切面過平均值且垂直於主軸，再 k-means 6 次，像素對應到真正最近的顏色；名額依分散量分配，大片單色不吃名額，彩虹與半透明的線條也分得到顏色；不透明與半透明仍各自成群。參考 UPNG.js 的減色）；`ApngEncoder`、`GifEncoder` 的 `paletteMethod`、`encodePngColors(rgba, w, h, maxColors, deflate?, paletteMethod?)`、`encodePngColorsAsync(rgba, w, h, maxColors?, paletteMethod?)` 傳入。`GifEncoder` 的 `localPalettes: true`：每格各自統計、各自減色（第一格的調色盤當全域、之後每格帶區域調色盤，每格多 768 位元組）；有透明像素的格 0 號是透明色、沒有的格不設透明色；`colors` 回報「全部無損才算無損、色數取最多的一格」。`ColorStats.clear()`（重複使用同一份統計）、`principalAxis(4×4 對稱矩陣)` → `{ value, axis }`（Jacobi 法的最大特徵值與單位特徵向量）。 |
| `@/core/timeline` | `EASE`（8 條可選＋`slam`、`glide`）、`EASING_CHOICES`、`getEasing`、`reverseEasing`；`clamp`、`clamp01`、`lerp`、`remap`、`progress(t, start, len)`；`frameCount(duration, fps)`、`frameTime(i, n, duration, fps, endInclusive?)`；`buildSegments(parts)`、`segmentAt(t, segs)`、`segmentsDuration`、`TimelineSegment`；`hashUnit`、`hashSigned`、`hash(...parts)`、`seedOf(str)`、`timeSlot(t, perSecond)`、`createRandom(seed)`；`AnimationSource`；`exportAnimation(source, options)`、`drawFrame(ctx, source, t, { scale, background })`、`createFrameCanvas`、`exportSize`、`EXPORT_FORMATS` | 緩動曲線取樣值與 text-fx 完全相同（有測試）。亂數一律用決定性亂數，同一組設定每次畫出同樣的影格。`AnimationSource` ＝ `{ width, height, duration, render(ctx, t), prepare?, loop?, stillTime?, segments? }`；`exportAnimation` 支援 `apng`／`gif`／`webp`／`png`（單張，取 stillTime）／`zip`（連番 PNG），有進度、取消、縮放、背景色、影格數上限（預設 1800）。無縫循環的動畫設 `loop: true`，最後一格不會和第一格重複。`exportAnimation` 的其他選項：`autoCrop`（裁掉所有影格〔APNG 含預設圖；PNG 只看那一格〕都透明的邊、四周留 2 px，會多畫一輪）、`still`、`stillForPalette`／`stillWeightMin`（APNG 減色時代表畫面加權）、`sequenceBaseName`／`sequenceInfo`（連番 PNG 的 ZIP 內檔名主體與說明檔；`sequenceInfo` 可以是函式，拿到 `{ fps, frames, width, height, duration, first, last }`）；結果多了 `crop`（輸出在畫面中的範圍）與 `ms`（匯出花費毫秒）。**影格表**（每格各有長度，例如打字機的停留格）：`AnimationSource.frames: FrameSpec[]`（`{ ms, t? }`）給了就照表匯出（第 i 格 render 的時間＝`t` 或這格開始的時間；`duration` 應等於 `frameTableDuration`），fps 不影響影格；延遲以累計時間四捨五入（APNG／WebP 以 `frameTimeBase`〔預設 1000＝毫秒〕、GIF 以 1/100 秒且每格至少 2、連番 PNG 依 fps 重複張數）。工具：`frameTable(ms[])`、`uniformFrames(n, fps, { holdMs })`、`frameTableDuration`、`frameStartTimes`、`frameRenderTimes`、`frameIndexAt(frames, t)`（預覽目前的格）、`frameTableTicks(frames, perSecond)`、`gifDelaysCs`。**其他匯出選項**：`colors`（APNG 與單張 PNG 的色數，0＝無損；不給時 APNG 依 `quantize`）、`matte`（底色合成：render 之後把每個像素依透明度合成到這個顏色，整張不透明——和 `background`〔render 之前先塗〕不同，挖空、加亮在透明底上算完才合成；給 GIF 的「Discord 暗色」底用）、`gifAlphaThreshold`、`paletteMethod`（APNG、單張 PNG、GIF 減色時調色盤的選法，見 core/encode；預設 `'median-cut'`）、`gifLocalPalettes`（GIF 每格各自減色）；`drawFrame` 也接受 `matte`。**多檔**：`exportAnimationBatch([{ source, fileName }], options)` 依序匯出，進度合成一條（「第 i／n 個・…」）。**週期平滑雜訊**：`loopNoise(seed, t, { harmonics?, channel? })`（週期 1、−1～1、一階導數連續，無縫循環的抖動）、`loopNoise2(seed, t)` → `{ x, y }`。 G2：`exportAnimation` 多了 `webpPickSmaller?`；曲線、節點表、取樣與影格表來源見下一列。 |
| `@/core/timeline`（G2：曲線、節點表、取樣、影格表來源） | `CURVES`（`linear`、`quadIn`／`quadOut`／`quadInOut`、`cubicIn`／`cubicOut`／`cubicInOut`、`smoothstep`、`smootherstep`、`bounceOut`、`steps10`、`flicker`、`lightning`、`heartbeat`）、`CurveName`、`CURVE_NAMES`、`NON_MONOTONIC_CURVES`、`getCurve(name)`、`smoothstep`、`smootherstep`、`stepsCurve(n)`、`irregularCurve(seed, { segments?, min?, max? })`；`Keyframe`（`{ time, value, curve }`）、`evaluateKeyframes(keys, t)`、`keyframesDuration`、`KeyframeRules`、`normalizeKeyframes(keys, rules?)`、`canAddKeyframe`／`canRemoveKeyframe`、`insertKeyframe(keys, rules?)` → `{ keys, index }`、`removeKeyframe`、`keyframesSummary`；`actionFrameCount(sec, fps)`、`sampleProgress(k, n, 'ends' \| 'loop')`、`splitDurationMs(ms, n, minMs?)`、`sampledFrames({ duration, fps, sampling?, delays?: 'even' \| 'integer' })`、`transitionFrames({ duration, fps, holdMs?, roundTrip?, reverse? })` → `TransitionFrame[]`（`{ ms, progress, leg, step }`）、`estimateExport({ width, height, frames, duration })`、`sequenceSource({ width, height, frames, renderFrame(ctx, frame, i), prepare?, stillIndex?, segments? })`；`valueNoise2`、`fbm2` | 曲線都是 0→1（明滅、雷閃、心跳不單調）。`evaluateKeyframes` 兩個節點之間用**後一個**節點的曲線。`transitionFrames`：每格 1 ÷ FPS 秒、停留加在最後一格（倒著播時在第一格）、來回 2n − 1 格；`sampledFrames` 的 `'integer'` 把總長分成整數毫秒（餘數給前面的格），`'loop'` 取樣不含終點。`sequenceSource` 把影格表包成 AnimationSource（`duration`＝延遲總和，`render(ctx, t)` 畫 t 秒時那一格），配鎖定 FPS 的 ExportPanel 與 `exportAnimation`。 |
| `@/core/typeset` | 排版：`typeset(input)`、`typesetToFit(input, { width, height, marginX?, marginY?, pad?, minSize? })` → `{ size, block, main, sub, lines, mainCss, subCss, mainMeter, subMeter }`（＋`scale`、`shrunk`）；低階：`layoutGroup(lines, opts)`、`composeBlock(main, sub, { vertical, align, subPos, subGap })`、`indexVisible(glyphs)`、`breakText(text, { limit, unit })`、`wrapChars`、`tokenize`；量測：`Meter`（`css`、`size`、`central`、`get(ch)`）、`canvasMeasure`、`MeasureFn`（可換成假的，Node 測試用）；字元：`isWide`、`isHangul`、`isBlankChar`、`hasCjk`、`NO_LINE_START`、`NO_LINE_END`、`ROTATE_V`、`CORNER_V`、`SMALL_KANA`、`PAUSE_LONG`／`PAUSE_SHORT`／`CLOSERS`；擺放與縮小：`overflowRatio`、`shrinkSize`、`placeBox(box, area, anchor, { offsetX, offsetY, keepInside })`、`availableArea`、`anchorRatio`、`ANCHORS`；字型字串：`fontStack(font, text)`、`canvasFont(stack, weight, px, italic?)`、`nearestWeightUp`；sprite：`paintGlyph(ch, css, m, adv, central, style, grad, italic?)` → `GlyphArt`（`body`、`halo`、`flash()`、`px`／`py` 樞紐點）、`glyphPadding`、`createSpriteCanvas` | G1 文字群組共用的排版引擎，移植自 text-fx。字的 (x, y) 是字身中心（縮放、旋轉的樞紐）；直書時字從上往下、行從右往左，半形英數整串轉 90°（`latinUpright` 改直立）、「」（）…— 轉 90°、「，。、．」依墨跡移到字格右上（`punctCenter` 置中）、小假名往右上。禁則：句讀與閉括號不放行首（留在上一行，允許超出）、開括號不放行尾、英文單字與韓文詞不從中間斷（比一整行長才斷）、換行後行首空白拿掉；`wrapChars` 依字數（半形算半個字）、`wrapLength` 依長度（null＝不換行）。自動縮小算進外框／光暈／陰影的 pad，乘 0.985、不小於 `minSize`，並沿用原字級的斷行。`fontStack`：西文字型遇到中文接同風格的思源宋體／黑體，遇到韓文接 Noto Serif／Sans KR。`paintGlyph` 把一個字畫成三張分層的 sprite：光暈（只在字外側）、本體（陰影挖空＋外側外框＋外框＋塗色，淡入時整張一起變透明，不會透出外框）、閃白剪影；漸層用任意色標，範圍由 `GlyphGradient`（v：縱向、h／d：整段）決定。實際例子見元件展示頁「模組」分頁。**G1 擴充**：`typesetToFill(input, { width, height, ratio?（0.92）, pad?, padPerSize?, maxSize?（長邊 × 1.2）, minSize?（8）, precision?（0.1）, boxOf? })` → 結果＋`fits`（放大填滿：在畫面 92% 範圍內取放得下的最大字級，pad 固定 px＋字級的倍數〔外框跟著字級變大〕都算進去；`boxOf` 可改比較的框，例如「行數 × 字級 × 行距」）；`scaleX`（水平縮放：x 座標與寬度乘上它、`block.scaleX`，畫字時以樞紐點 `ctx.scale(scaleX, 1)`；`scaleBlockX`）；`segment: 'grapheme'`（以字素切字：表情符號、組合字元算一個字；`splitGraphemes`、`splitChars`、`countGraphemes`，用 Intl.Segmenter）；底線與刪除線 `textDecorationRect(kind, adv, { size, tracking, vertical, mode: 'line' \| 'path' })`／`textDecorationRects`／`decorationThickness`（相對樞紐點的實心條：橫書底線在字身框上緣往下 1.05 × 字級、粗 max(1, 0.06 × 字級)、長＝前進寬度＋字距；刪除線在 0.5 × 字級；直書是右側直條；沿路徑跟著字轉），交給 `paintGlyph(…, italic, { decorations })` 畫進 body（淡出時整字一起變透明；沒有外框時線也有陰影）；韓文拆字 `hangulSteps('한')` → ㅎ、하、한，`typingSteps(chars, { hangul?, reverse? })`、`typingVisibleAt(chars, steps, count)`（逐字顯示：先排好全文、每一步畫在那個字最終的位置）；沿路徑排字 `layoutOnPath(path, advances, { closed?, tracking?, start?, offset?, rotate?, center? })` → `{ x, y, angle, s }[]`（字中心在「前面字寬＋字距總和＋本字寬 ÷ 2」的路徑長，方向沿切線、字頭朝行進方向的左手邊〔順時針繞時朝外〕，閉合時繞圈，可整體旋轉）。 |
| `@/core/image` | `loadImage(blob \| url)` → ImageBitmap（SVG 等自動改走 `<img>`）；`imageSize`、`getImageData`、`makeCanvas`、`canvasToBlob`；`opaqueBounds(pixels, threshold?)`、`imageOpaqueBounds(img, threshold?)`、`scanOpaqueBounds(w, h, read, threshold?)`、`padRect`；`fitSize(src, box, 'contain' \| 'cover', allowUpscale?)`、`resizeImage(img, w, h, { quality })`、`cropImage(img, rect)`；`dominantColors(pixels, count?)`；`detectImageType(bytes)`（png／apng／webp／gif／jpeg／avif／bmp）；`centeredCrop`、`clampCrop`、`resizeCrop`；`fileToDataUri(blob, { maxBytes?, maxWidth? })`、`urlToDataUri(url, { maxWidth?, timeoutMs?, signal? })`、`ImageInputError`（kind：too-large／decode／cors／http／not-image／timeout／aborted）、`measureImageUrl(src, { timeoutMs? })`、`transparentTrimRect(pixels)`、`normalizeCropRect(raw, bounds)`、`isWholeImage`、`cropToDataUri(img, rect)`、`dataUriBytes`、`dataUriToBlob`、`formatEmbedBytes`；`createImageStore(toolId, name?)` | `resizeImage` 大幅縮小時分段縮（`quality: 'pixelated'` 為最近鄰）。`imageOpaqueBounds` 直接對影像找不透明範圍，結果同 `opaqueBounds(getImageData(img))`，但只從四周往內一條條讀到碰到內容為止（大圖快很多；`scanOpaqueBounds` 是它的純函式核心）。`detectImageType` 依檔頭判斷實際格式，不看副檔名。**嵌進 CSS**：`fileToDataUri` 沒縮小時保留原檔位元組與格式（GIF 動畫不變；MIME 依檔頭修正），超過 `maxWidth` 時等比縮小改存 PNG；`urlToDataUri` 需要對方允許跨網域，失敗的錯誤訊息可直接顯示（建議下載後改上傳）；`measureImageUrl` 用 `<img>` 量原始尺寸（不需跨網域、逾時回 null）。`transparentTrimRect` 是不透明度 > 0 的外接框（整張不透明或全透明時 null＝沒有可修的留白）；`normalizeCropRect` 四捨五入、負寬高反向、夾在圖內、不到 1px 時 null（範圍在圖外）。`formatEmbedBytes`：B／KB 一位小數／MB 兩位小數。`createImageStore` 把圖片存 IndexedDB，存不下時 `save` 回傳 false；`put` 同 save 但回傳原因（`{ ok: false, reason: 'unavailable' \| 'quota' \| 'error' }`，`isQuotaError(e)`。**JPG**：`canvasToBlob(canvas, type, quality)` 可給品質；`canvasToJpeg(canvas, { quality?（0.95）, background?（預設白，null＝已經畫好不透明底）})`、`flattenCanvas(canvas, color)`（JPG 沒有透明，透明處鋪底色而不是黑色）。圖片放進剪貼簿（`copyImage`）屬 G3 共用層。 |
| `@/core/image`（G3：剪影效果、畫布小工具、依鮮豔度取主色） | `applySilhouetteEffects(pixels, layers, { threshold?, keepPartial? })`、`outlineLayers(style, { color, width, blur?, offset?, opacity? })`（style：`'stroke' \| 'glow-soft' \| 'glow-strong' \| 'shadow'`）、`SilhouetteLayer`（`{ color, opacity?, spread?, hollow?, blur?, sigma?, gain?, offsetX?, offsetY? }`）、`distanceField`、`silhouetteMask`、`blurMask`、`gaussianBlurMask(mask, w, h, sigma)`、`FILTER_GLOW`；`outlineLayers` 的選填 `blurMode?: 'shadow' \| 'filter'`；`opaqueSpanInRows(pixels, y0, y1, threshold?)`、`imageOpaqueSpanInRows(img, …)`；`roundRectPath(ctx, x, y, w, h, radii)`、`roundRectPath2D`、`patternTile(kind, opts)`、`fillPattern(ctx, kind, rect \| Path2D, { color, opacity?, size?, lineWidth? })`（kind：`'dots' \| 'stripes' \| 'checker' \| 'grid'`）；`limitResolution(desired, size, { maxPixels?, maxSide? })`、`limitScale(w, h, limits?)`；`dominantColorVivid(pixels, { tolerance?, alphaMin?, region? })`、`vividColorsBySplits(pixels, splits, opts)`、`vividWeight`、`splitRows`、`evenSplits(n)`、`moveSplit(splits, i, v, minGap?)`、`samplePixel(pixels, x, y)` | **剪影效果**（純函式，像素陣列進出，Node 可測）：畫在角色**後面**、不擴大輸出尺寸；`keepPartial`（預設 true）時原圖透明度 > 0 的像素（含半透明的邊）原封不動，效果只出現在完全透明處；描邊是到最近角色像素的歐氏距離 d、覆蓋率 clamp(粗細 ＋ 1 − d)（直邊剛好 N px、轉角圓弧有反鋸齒）；模糊 σ ＝ blur ÷ 2（同 canvas shadowBlur，σ ≥ 2 用三次框模糊、較小用高斯核）；線條透明度就是 opacity（不會變濃）。`outlineLayers`：stroke＝實線；glow-strong＝實線＋整個擴張剪影的模糊（濃度 ×1.8）；glow-soft＝細一半的實線＋淡光暈（×0.6），兩種光暈看得出差別；shadow＝整個剪影（擴張粗細）模糊後往右下偏移（不是中空的線）；光暈的模糊至少 1 px。**選填（不給時結果不變）**：`SilhouetteLayer.sigma` 直接指定 σ（給了就不看 blur）；`hollow` 只取擴張出來的那一圈（像一條描邊線，剪影本身不算）。`outlineLayers(…, { blurMode: 'filter' })`：像對描邊線套 CSS `filter: blur()`，σ ＝ 模糊值；光暈是粗細 N 的那一圈線模糊後 ×2.2（`FILTER_GLOW.gain`），所以總量幾乎不隨模糊值改變；柔和光暈的實線細一半、光暈來源仍是 N 粗的線再 ×0.75（每個距離上都比強烈淡）；陰影仍是整個剪影（σ ＝ 模糊值）。以 ccfolia-cropper 舊版下載校準：粗細 5、模糊 12 時實線外的光暈總量（一列）舊版約 1050，強烈約 1180、柔和約 1020。立繪裁切器用 'filter'。**某幾列的左右界**：例如頭部中心＝角色最上方約 35% 的左右界中點。**花紋**從 (0, 0) 平鋪，同尺寸的預覽與匯出完全一樣。**大圖匯出**：`limitResolution` 依總面積（預設 4,000 萬像素）與邊長（16,000 px）上限降低「每單位 px」。**依鮮豔度取主色**（color-palette 3.4）：不透明度 < 128 不算；RGB 各以「容許值 × 2」為格寬切固定格；每個像素加分＝鮮豔度權重（max − min ≤ 20 只給 0.02，其餘 0.1 ＋ 0.9 × ∛(s ÷ 255)）× 明暗折扣（亮度平均 ≤ 40 或 ≥ 230 再 ×0.15）；總分最高的格子勝出（同分取先達到的），結果是格子裡**最鮮豔的實際像素色**（同樣鮮豔取最先出現的）；沒有可算的像素是黑色。9 組規格測試圖寫在 `tests/unit/image-vivid.test.ts`。`vividColorsBySplits` 的 ratio＝該段占高度的比例（四捨五入到 3 位）。 |
| `@/core/image`（G2：濾鏡、畫質決定輸出尺寸） | `FilterOp`（`gray`、`sepia`、`matrix`、`contrast`、`brightness`、`saturate`、`posterize`、`curve`、`blur`、`sharpen`、`mosaic`、`shift`、`lines`、`edges`、`fill`、`gradient`、`glow`、`vignette`、`scanlines`、`grain`）、`applyFilterOps(rgba, w, h, ops, { frame?, seed? })`、`applyFilterRows(rgba, w, fullH, rowsY, ops)`（上下一致的圖只算需要的列）、`applyFilterToCanvas(ctx, ops, { frame? })`、`filterIsAnimated(ops)`、`blendChannel`、`BlendMode`；`FILTER_PRESETS`（26 種，`FilterPresetId`：`mono`…`faded`）、`FILTER_PRESET_IDS`（規格順序）；`QUALITY_SIZE_TABLE`、`QUALITY_WEBP`、`qualityOutputSize(quality, aspect \| 'original', source)`、`nearestAspect`、`fitWithin`、`ASPECT_IDS`、`QUALITY_LEVELS` | 濾鏡是一串純函式運算（Node／Worker 都能跑，每步截在 0～255）。模糊、馬賽克、錯位、掃描線以輸出 px 計，暗角、漸層、光團依畫面比例；顆粒依 `frame` 每格不同（決定性亂數，同一格可重現）。預設濾鏡依 bg-motion 附件的量測值擬合，單元測試逐點比對。 |
| `@/core/assets` | `createAssetStore(toolId, { name? })` → `AssetStore`（`add(blob)` → `{ id, persisted, reason? }`、`put(id, blob)`、`get(id)`、`bitmap(id)`、`peekBitmap(id)`、`url(id)`、`has`、`preload(ids)` → `{ missing }`、`remove`、`gc(keep)` → 刪掉的 id、`ids()`、`clear()`、`exportFiles(ids)` → `{ name: '<id>.<副檔名>', data }[]`）；`importAssetFiles(assets, files)`、`referencedAssetIds(store, pick)`、`useAssetBitmap(assets, id)`、`assetIdFor(bytes)`、`assetFileInfo(bytes)` | 圖片資產庫（建在 `createImageStore` 上，資料庫 `trpg-toolkit:tool:<toolId>:assets`）：Blob 存 IndexedDB、記憶體留快取；工具的狀態**只存 id**，所以復原歷史、自動存檔、專案檔都只搬 id。id 依內容產生（SHA-256，非安全環境改用簡單雜湊），同一張圖只存一份。存不進 IndexedDB 時圖片仍在記憶體裡可用，`add` 回報 `persisted: false` 與原因（`'quota'` 容量不足、`'unavailable'` 沒有 IndexedDB），工具據此提示。`gc(referencedAssetIds(store, (d) => d.items.map((x) => x.imageId)))` 刪掉沒人用的圖（目前狀態＋復原／重做歷史都算有人用）。專案檔：`getFiles={() => assets.exportFiles(ids)}`、讀回時 `importAssetFiles(assets, files)`（保留檔案裡的 id）。 |
| `@/core/layout` | `Box`、`BoxHandle`、`moveBox`、`resizeBox(b, handle, dx, dy, { minWidth, minHeight, maxWidth, maxHeight, keepAspect })`、`scaleBoxAt`、`clampBoxPosition(b, { minX, maxX, minY, maxY }, 'topleft' \| 'center')`、`arrowDelta(key, step)`、`boxGuides(b, frame)`、`percentToBox`／`boxToPercent`、`clientToLocal(clientX, clientY, rect, size)`、`pointInBox`、`hitTest(items, x, y, tolerance?)`、`clampSpan(start, length, extent)` | 版面編輯的幾何（LayoutEditor、PanZoomViewport、CropFrame 共用；工具也可直接用）。`resizeBox` 對角不動；`hitTest` 的 items 依畫的順序（後 → 前），回傳最前面的、略過 `hidden`；`clientToLocal` 用實際顯示大小換算，元素被 CSS 縮放也正確；`clampSpan` 讓框夾在範圍內、比範圍寬時固定在 0。 G2：`snapTargets(frame, others)`、`snapBox(box, targets, threshold, prev, release?)` → `{ box, guide }`（LayoutEditor 的吸附：中心或邊緣在 threshold 內就對齊，已吸住的要拖開 release 才脫離）。 |
| `@/core/ruler` | `rulerTicks({ min, max, step?, majorEvery?, scale, fontPx?, minLabelGap?, labelSteps?, floor?, format? })` → `{ value, kind: 'zero' \| 'major' \| 'minor', label }[]`、`labelInterval(scale, opts)`、`defaultLabelSteps`、`isMultiple`、`ceilTo`、`floorTo`、`RULER_STYLE` | 尺規刻度：每 step 一條（值以整數倍計算，沒有浮點誤差、沒有 −0）；0 是地面、majorEvery 的倍數是主刻度；數字依間距抽稀——取候選（step 的 1、5、10、20、50、100… 倍）中第一個「間隔 × scale ≥ 1.7 × 字高」的（例：10 cm 太密就每 50、再密就每 100）；`floor: 0` 地面以下不畫。`ceilTo(202.5, 10)` → 210。`RULER_STYLE` 是建議的線色、線寬倍率與字重。 |
| `@/core/compose` | `drawLayers(ctx, layers, dst, { fit?, smoothing? })`、`composeLayers(layers, size, { fit?, background? })`、`layerRect(src, dst, fit)`、`ComposeFit`（`'contain' \| 'cover' \| 'stretch'`）；`toggleOrdered(list, v)`、`moveItem(list, from, to)` | 依順序（第一個在最下面）把同尺寸的圖層疊到任意大小：預設等比置中（contain），也可以拉伸或填滿；null／false 的圖層略過。預覽、選項縮圖、清單縮圖、合輯圖共用同一個函式。`toggleOrdered`：複選有順序（新加的在最後＝最上層）；`moveItem`：往下移落在目標後、往上移落在目標前。 |
| `@/core/sheet` | `layoutSheet({ count, columns?, cellSize, gap, captions?, fontSize?, lineHeightRatio?, padRatio?, measure? })` → `{ columns, rows, width, height, captionHeight, lineHeight, pad, cells: { image, caption, lines }[] }`、`drawSheet(ctx, layout, { drawCell, font?, color?, background? })`、`wrapCaption(text, maxWidth, measure)`、`captionMeasure(font)`、`autoColumns(n)` | 格狀排版＋每格下的說明文字區（表情合輯圖）：欄數 ≤ 0 自動（⌈√n⌉）且不大於張數、最後一列靠左；文字區所有格子同高＝最多行數 × round(字級 × 1.28) ＋ 2 × round(字級 × 0.5)，沒有任何文字時 0；超過「格寬 − 2 × 內距」**逐字**換行（不避頭尾），原本的換行照用、空行也算；寬＝欄 × 格 ＋（欄 ＋ 1）× 間距、高＝列 ×（格 ＋ 文字區）＋（列 ＋ 1）× 間距。`captionMeasure` 用 `core/typeset` 的量測（逐字前進寬度）。emotion-maker 規格 3.3 的量測寫在 `tests/unit/g3-layout.test.ts`。 |
| `@/core/color` | `parseColor`、`formatHex`、`normalizeHex`、`toCss`、`withAlpha`、`rgbToHsv`、`hsvToRgb`、`relativeLuminance`、`contrastRatio`、`readableTextColor` | 色碼一律小寫 `#rrggbb`／`#rrggbbaa`。 |
| `@/core/gradient` | `Gradient`（`{ kind: 'linear' \| 'radial', angle, stops: { offset, color }[] }`）、`DEFAULT_GRADIENT`、`gradientToCss(g)`、`canvasGradient(ctx, g, x, y, w, h)`、`sampleGradient(g, t)` | GradientField 的值；canvas 的角度規則與 CSS 相同。 G2：`cssAngleFromRightward(deg)`／`rightwardAngleFromCss(css)`（「0° 往右、順時針」與 CSS 角度互換）、`shiftStops(stops, shift)`（色標循環平移，接縫是硬邊；流動漸層用）。 |
| `@/core/textfx` | 形狀：`shapeFromTypeset(r, origin)` → `TextShape`（`glyphs`、`font`、`central`、`bounds`＝整段外接框、`size`）、`traceShape(ctx, shape, 'fill' \| 'stroke', { dx, dy, offset })`、`traceSilhouette(ctx, shape, spread)`、`shapeRadius`；裝飾層：`renderTextFx(ctx, shape, layers: TextFxLayer[], { t, transform, offset, pool })`、`textFxExtent(layers)` → `{ max, outlineSum }`、`applyBlockTransform`、`withPaint`、`drawSilhouette`；填色：`Paint`（solid／gradient／metal／rainbow／stripes）、`paintStyle(ctx, paint, box, t)`、`fillBox`、`rainbowStops`、`rainbowHue`、`METAL_COLORS`；圖層：`createLayerPool()`、`withLayer(ctx, pool, draw, { alpha, composite })`、`maskedComposite(ctx, pool, { draw, mask, composite, alpha })`、`compositeLayer`、`tintLayer`；卡拉 OK：`drawKaraokeLine(ctx, pool, { drawBefore, drawAfter, drawSilhouette?, progress, lineLeft, lineRight, top, bottom, extend?, softness?, direction?, glow? })`、`fillWipeMask`、`fillBandMask`、`wipeEdge` | 整段文字當成一個形狀加工（切入等）。層由下而上：`outline`（字形往外擴 width 的實心剪影，多層各自從字的邊緣量起）、`fill`、`shadow`（硬陰影或模糊）、`extrude`（往 (dx, dy) 每 1 px 一份的連續複本＝立體厚度）、`glow`（模糊後以加亮疊上；疊幾層由大到小＝霓虹；`blur` 是 canvas 的 shadowBlur，σ＝blur ÷ 2，對應 CSS `blur(σ)` 時傳 2σ；選填 `paint`＝用填色塗光暈〔漸層、彩虹時光暈跟著分色，範圍同 fill〕、`alpha`＝整層不透明度，不給時結果與以前相同）、`aberration`（兩份染色剪影左右錯開、以濾色疊上，可加每格固定的小位移）、`knockout`（挖空底下已畫的東西）。模糊用「畫在畫面外、只留陰影」做（不用 ctx.filter，各瀏覽器都行）。漸層、彩虹、金屬、斜紋以**整段外接框**為範圍（先在暫存畫布描形狀再 source-in 塗上，每個字接得起來）；彩虹每循環往左流動一個範圍寬、斜紋每循環沿垂直紋路方向移一組寬（`t`＝循環進度，無縫）。`transform: { cx, cy, scale, rotate, dx, dy }` 以畫布中心縮放旋轉位移整段（陰影、光暈跟著動），`offset(i)` 給逐字的位移（波浪）。卡拉 OK：先畫唱前、再疊遮罩後的唱後（交界前 softness px 線性變透明、上下延伸到給定範圍、左右多 extend），0 < 進度 < 1 時以交界為中心加一條加亮的發光帶；半透明的整句用 `withLayer` 先合成再套透明度。 |
| `@/core/fxlayers` | `drawSpeedLines`／`speedLinesState`／`speedLinePulse`、`drawStars`／`starsState`／`traceStar`、`drawConfetti`／`confettiState`、`drawRings`／`ringsState`、`drawLoopFx(ctx, kind, env, options, t)`；`LoopFxEnv`（`width`、`height`、`cx?`、`cy?`、`textRadius`、`seed`）；`*_DEFAULTS`、`LOOP_FX_DEFAULTS`、`LOOP_FX_PARAMS`（細調參數的範圍）、`LOOP_FX_LABELS`、`LOOP_FX_ORDER`（behind／front） | 無縫循環的特效層（t＝循環進度，t＝1 回到 t＝0；速度、閃爍、圈數都取整數）。隨機量（角度、長度、位置、顏色）由種子決定、每格相同。長度以短邊為單位。放射速度線：從文字半徑 ×(1＋gap) 往外的細長梯形，依方向分配色相（右紅、下黃綠、左青、上藍紫，每循環逆時針轉一圈）或單色；分組輪流明滅（15%～100%）並伸縮（×0.75～1.25）。星星：四角星、各自相位閃爍（25%～100%）。碎紙：2:1 長方形每循環落一趟、左右搖擺、自轉 1～3 圈。圓環：從文字半徑 × 1.05 擴張到對角線一半、不透明度由 1 降到 0、各環相位平均錯開。 |
| `@/core/path` | `Point`、`Path`；`cumulativeLengths`、`pathLength`、`pointAtLength(path, s, { closed?, lengths? })` → `{ x, y, angle, tx, ty, segment, s }`、`sampleEvenly(path, n)`、`pathBounds`、`scalePath(path, k, center?)`、`translatePath`、`reversePath`、`closePath`、`appendIfFar(points, p, minDistance)`；`circlePath`、`spiralPath`、`heartPath`、`squarePath`、`trianglePath`、`presetPath(shape, w, h)`、`loopShape(shape, cx, cy, size)`、`PRESET_SHAPES`、`PRESET_SHAPE_LABELS` | 折線軌跡（畫面座標、順時針＝畫面上看到的順時針）。等距取樣：第 1 點是起點、第 n 點是終點、中間依長度等分（n＝1 只取起點）；轉角上取後面那段的方向；閉合時超出總長繞圈。`presetPath`（文字軌跡）：中心在畫面中央、S＝0.8 × min(寬, 高) ÷ 2，圓／螺旋（3 圈）／愛心以 0.05 弧度取樣，與文字軌跡附件的折線逐點相差 < 0.001 px（有測試）。`loopShape`（打字機的圖形模式）：圓（720 段）、正方形（左上起順時針）、正三角形（頂點起往右下），都閉合。 |
| `@/core/transition` | `TransitionShape`（20 種：`flat`、`linear`、`diagonal`、`split`、`blinds`、`circle`、`dissolve`、`rotate`、`wave`、`ink`、`drip`、`clock`、`spiral`、`figure`、`grid`、`tear`、`rain`、`interlace`、`rings`、`hex`）、`TRANSITION_SHAPES`、`ArrivalParams`（`direction`、`axis`、`count`、`strength`、`blockSize`、`ellipse`、`center`、`seed`、`wave`、`figure`、`clock`、`cell`、`order`、`spread`、`angle`）、`buildArrivalMap(shape, w, h, params)` → `ArrivalMap`（每像素 0～255 的抵達先後）、`shapeParams(shape)`（這個形狀用到哪些參數，給設定面板決定顯示哪些欄位）、`SHAPE_COUNT_RANGE`、`DIRECTIONS`、`isDynamicShape`；`TransitionLook`（`{ progress, mode?: 'cover' \| 'reveal' \| 'sweep', softness?, bandWidth?, reverse?, color, glow?, solidEdge? }`）、`transitionLut(look, flat)`、`applyTransitionLut(map, lut, rgba)`、`renderTransition(map, look)`、`drawTransition(ctx, map, look, x?, y?)`、`coverAmount`、`glowStrength`、`alternatingColorIndex(timeProgress, count)` | 遮罩式轉場＝「抵達時間圖」＋每格一張 256 階查表：形狀只決定每個像素什麼時候被蓋到，柔和度、發光、蓋上／揭開／掃過都在查表裡。抵達時間圖依尺寸與參數建一次重複用（旋轉合攏 `isDynamicShape` 每格用 `angle` 重建）。`drawTransition` 經暫存畫布 drawImage（依 ctx 的變形與合成疊上去）。數值依 scene-transition 附件測試。 |
| `@/core/motion` | 圖片動態：`coverPlacement`、`bleedScale(w, h, bleed)`、`drawImageMotion(ctx, img, w, h, { dx?, dy?, scale?, rotate?, bleed? })`、`fillOverlay`、`overlayAmount(t, start?)`、`waveOffset`／`drawWave(ctx, src, w, h, { amplitude, waves, phase, harmonic?, band? })`、`fadeCurve`、`fadeLayers(t, reverse?)`、`drawFade`、`sequencePosition(t, count)`、`drawSwitch(ctx, w, h, drawFrom, drawTo, { k, mode: 'crossfade' \| 'cut' \| 'wipe', base? })`、`crossfadeScales(k)`；結尾消失：`VanishKind`（10 種）、`VANISH_KINDS`、`vanishState(kind, p, H, opts)`、`vanishLayout`、`drawVanish(ctx, source, W, H, kind, p, { intensity?, seed?, colors? })` | 蓋滿畫面的圖片動作（位移以輸出 px 計；`bleed` 是固定像素的額外放大，輸出越小相對越大，抵銷位移露出的黑邊）。結尾消失把整個畫面（`source`）依進度 `p`（0～1）畫到已清空的 ctx，`p` ≥ 1 全空。 |
| `@/core/decode` | `decodeAnimatedImage(blob \| buffer, { maxFrames?（500）, minDelayMs?（10）, defaultDelayMs?（100）})` → `DecodedAnimation`（`{ format, width, height, loops, frames: { rgba, delayMs }[], truncated }`）、`animationBitmaps(anim)`、`animationTimeline(delays)`、`frameAtTime(delays, ms)`、`decodeStillImage`；低階：`decodeApng`／`decodePng`／`isApng`／`isPng`、`decodeGif`／`isGif`、`decodeWebp(bytes, stillDecoder)`／`parseWebpInfo`／`isWebp` | APNG、GIF 用純 JavaScript 拆格（每格是合成好的完整畫布，處置與混合方式都處理）；動態 WebP 解析結構後每格交給瀏覽器解碼。錯誤丟 Error（訊息可直接顯示）。GIF 的 `loops`：NETSCAPE n → n＋1 次、0＝無限、沒有這個區塊＝1。 |
| `@/core/shapes` | `ShapeKind`（`circle`、`square`、`diamond`、`triangle`、`star`、`heart`、`hexagon`、`petal`、`roundRect`）、`SHAPE_KINDS`、`ShapeOptions`（`rotation`、`points`、`innerRatio`、`flatTop`、`width`、`height`、`radius`、`aspect`、`segments`）、`shapePolygon(kind, cx, cy, size, opts?)`、`traceShape(ctx, kind, cx, cy, size, opts?)`、`shapePath2D(…)`、`pointInPolygon`、`shapeRadialProfile(kind, opts?, samples?)`、`profileAt(profile, angle)` | 共用的幾何圖形（點列，`size` 是外接半徑）：遮罩、圖形轉場、讀取動畫的形狀；`shapeRadialProfile` 給「從中心往外」的距離圖用。 |
| `@/core/audio` | `PcmAudio`（`{ sampleRate, channels: Float32Array[] }`）、`pcmLength`、`pcmDuration`；`decodeAudio(blob \| buffer)`、`canDecodeAudio`、`AudioDecodeError`；`createSilence(seconds, { sampleRate?（44100）, channels?（1）})`、`resample`、`mixAtTimes(clip, times, { duration, sampleRate?, channels?, fade?, gain? })`、`skipOverlapping(times, clipDuration)`、`applyFadeOut`；`encodeWav(pcm)`、`wavBlob`、`parseWav` | 解碼用瀏覽器的 Web Audio（取樣率＝瀏覽器音訊系統的，聲道數照原檔；失敗訊息可直接顯示）；其餘都是純函式（Node 可測）。`mixAtTimes` 在每個時間點放一次音效（可疊加、超出 −1～1 夾住、時間點四捨五入到取樣）；「不疊音」先用 `skipOverlapping` 跳過上一聲還沒放完的時間點；`fade` 線性淡出到 0。WAV 為 PCM 16-bit little-endian。 |
| `@/core/share` | `sh.number({ min, max, default, int? })`、`sh.string({ default, maxLength?, maxLines? })`、`sh.oneOf(values, fallback?)`、`sh.boolean`、`sh.color`、`sh.array(item, { default, maxItems })`、`sh.object(shape)`、`sh.nullable`、`sanitize`、`Schema<T>`；`encodeShareHash(data, { version, key? })`、`readShareHash(hash, { version, key?, maxLength? })`、`decodeShareHash(hash, schema, options)`、`shareUrl(data, options, base?)`、`clearShareHash()`；`toBase64Url`、`fromBase64Url` | 把設定放進網址 # 後面（`#s=` ＋ deflate 壓縮的 JSON `{ v, d }` 的 base64url），不經過伺服器。讀回時一律用 schema 整理（網址是任何人都能編的輸入）：數值夾在範圍、未知選項換成預設、字串與陣列限制長度、多餘欄位丟掉；損壞、版本不符、太長（預設 8,000 字）時回傳 null。 |
| `@/core/html` | `escapeHtml(text)`、`escapeHtmlAttr(text)` | 產生 HTML 文字時跳脫 `& < > " '`（屬性另把換行換成 `&#10;`）。 |
| `@/core/worker` | `wrapWorker<Api>(worker)` → `{ api, terminate }`、`exposeApi(api)`、`transfer`、`proxy`、`canUseWorker()`、`ownBuffer(arr)` | Comlink 包裝。`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` 要直接寫在呼叫端，Vite 才會打包。 |
| `@/core/css` | `createCssSheet({ important?, animated?, boostId? })` → `CssSheet`（`header(o)`、`comment`、`import(url)`、`rule(selector, decls, { important?, animated?, noBoost? })`、`keyframes(name, frames)` → 實際名稱、`media`、`supports`、`group`、`raw`、`toString()`）；`boostSelector`、`splitSelectorList`、`usesHas`；`cssString`、`cssUrl`、`cssComment`、`cssCommentText`、`cssIdent`、`singleLine`、`cleanFontName`、`quoteFontFamily`、`fontFamilyList`；`num`、`px`、`pxInt`、`pct`、`em`、`ms`、`sec`、`isCssColor`、`safeCssColor`、`rgba(color, alpha)`、`withOpacity(color, %)`、`mixColors`、`lighten`、`darken`、`yiqTextColor`；`textOutline(kind, color, { opacity, width })`、`strokeShadow`、`strokeShadow8`、`texture(kind, opts)`＋`textureDecls`、`noiseDataUri`、`cornerBrackets`；`fontStack(font)`、`fallbackStack`、`FALLBACK_STACKS`、`cssFontWeight`、`googleFontUrls`／`googleFontImports`、`localFontNames`；`cssHeaderComment`／`cssHeaderLines` | OBS 自訂 CSS 的產生核心。**優先順序**：宣告預設加 `!important`（蓋過 CCFOLIA 後插入的樣式與行內樣式）；會被 keyframes 改動的屬性列在 `animated`（整份或單條規則），輸出時不加 important、改在選擇器主體加 `:not(#tk-x)` 提高權重——important 會讓動畫失效。含 `:has()` 的選擇器自動拆成另一條規則（OBS 30 只丟掉那條）。`@import` 自動移到開頭說明之後；keyframes 同名同內容只輸出一次、同名不同內容自動改名。**跳脫**：字串（引號、反斜線、換行 `\A `）、註解（`*/` 拆成 `* /`）、字型名稱（去掉 `; { } ( ) " ' \ < >`、加引號、通用字族不加）、顏色（不合格改白）。**裝飾**：文字外框線（柔邊陰影四層、描邊 16 方向／≤ 1px 時 8 方向、發光 4／10／18px）、質感（舊紙、顆粒＝SVG 雜訊 data URI；掃描線要放覆蓋層；漸深取代背景色）。舊紙的暗角是以中心為圓心、通過四角的橢圓（`ellipse farthest-corner`，跟著方框長寬比）：半徑 50% 以內沒有、四角 33% 的 `PAPER_VIGNETTE_COLOR`（#603c22）；依訊息框 F11、聊天視窗 F15 的舊版量測調整（#efe4cb 不透明的 460×440 視窗：平均約 (219,207,184)、亮度標準差約 16、左下角約 (186,167,143)）、四角括號（8 層漸層）。**字型**：Google Fonts 每家族一條 `@import`、只含用到的字重（換成最接近的實有字重、由小到大）；後備字型依種類（繁中黑／明／楷 → 台灣系統字型；其他 → 日文系統字型）。 |
| `@/ccfolia`（targets） | `EXPORT_TARGETS`（`ccfolia-cutin`、`discord-sticker`、`discord-attachment`）、`TARGET_IDS`、`TARGET_FORMAT_LABELS`、`DISCORD_DARK_BG`、`PIXEL_BUDGET`；`checkTarget(target, { format, width, height, frames, gifMatte?, transparentBackground?, charCount?, fontSuggestedChars?, lastBytes? })` → `{ level, code, message }[]`、`suggestedChars`、`nextShrinkStep(target, { format, colors, frames, width, height, lines? })` → `{ patch, description } \| null`；`formatLimitBytes`、`usagePercent` | 匯出用途的外部事實（觀察 2026-10-01）：CCFOLIA 切入（1,000,000 位元組、APNG／GIF／PNG、預設 480 × 480、15 格 20 fps、建議 20 字）、Discord 伺服器貼圖（512,000 位元組、APNG／PNG、**固定 320 × 320**、12 格 20 fps、8 字）、Discord 訊息附件（8,000,000 位元組、GIF／PNG、720 × 720、30 格 30 fps、20 字、GIF 預設合成 #313338 暗色底、只會用到一階透明）。`checkTarget` 的條件：格式不收、固定尺寸不符、寬 × 高 × 格數 > 4,000 萬（錯誤）／> 2,400 萬（警告）、一階透明的 GIF 沒有底色（警告）、可完整透明的用途卻合成底色（資訊）、字數超過用途或字型建議（警告）、上次匯出超過上限（錯誤）。`nextShrinkStep` 每次只降一級：色數（APNG／PNG；無損先改 256，再 128、64）→ 影格數（> 10 時減 3）→ 放射速度線（> 16 時 × 0.7）→ 尺寸（不是固定尺寸、短邊 > 240 時 × 0.8），都不符合時 null。 |
| `@/ccfolia` | `parseRoomId`、`parseCharacterId`、`resolveCharacterRef`、`roomUrl`／`chatUrl`／`characterUrl`、`roomUrlFrom`／`chatUrlFrom`／`characterUrlFrom`、`exampleRoomUrl`…、`CCFOLIA_LOGIN_URL`；`parseStreamkitVoiceUrl`、`streamkitVoiceUrl`、`STREAMKIT_VOICE_PARAMS`、`parseDiscordUserId`、`classifyImageUrl`；`CHARACTER_PAGE`、`barSelector`、`barPartSelector(part, n?)`、`barPartPath(part)`、`barsAfterSelector`、`MAX_STATUS_BARS`、`MESSAGE_BOX`、`MESSAGE_BOX_TIMING`、`MESSAGE_BOX_BREAKPOINTS`、`CHAT`、`STREAMKIT`、`STREAMKIT_CLASS`、`streamkitSelector`、`streamkitUserAvatar(id)`、`streamkitUserSpeaking(id)`、`OBS`；`fillWidthValue`、`fillStyleAttr`、`currentColorAttr`、`fillBelowSelectors(threshold, inclusive?)`／`fillBelowSelector`／`fillBelowWhere`、`barHasFill(cond)`、`FILL_ZERO`、`FILL_FULL`；`classifyDiceResult`、`DICE_RESULT_CLASS`、`DICE_RESULT_ORIGINAL_COLOR`、`messageBoxResultText`、`firstResultNumber`、`SECRET_DICE_*`、`systemStatusMessage`、`chatTimestamp`；（P0 的）`CcfoliaCharacterData`、`toCharacterClipboard`、`OBS_SELECTORS` | CCFOLIA／Discord Streamkit／OBS 的外部事實，**改版時只改這裡**（各常數附觀察日期）。網址：房間 ID 取「rooms/」後面的英數 `_` `-`，或整段 4 字元以上；角色欄含房間時以它為準。選擇器只用 MUI class、role／aria、`variant` 屬性與子元素順序（雜湊 class 不可用；擲骰結果配色 class 例外，集中在 `DICE_RESULT_CLASS`）；聊天頁的輸入區 `CHAT.inputPaper` 限定 `div.MuiPaper-root`（標頭 header 也有 MuiPaper-root，不能混在一起）；輸入區的 `form` 自帶約 10% 黑的半透明背景（`CHAT.formBackground`），把分頁列改造成標題時要清掉；Streamkit 只用 class 前綴，以頭像網址的 `/avatars/{ID}/` 認人。`fillBelowSelectors` 把「剩餘比例 < 門檻」（或 ≤ 整數門檻）寫成填充 style 字串的屬性選擇器（0 與 0.x%、10～19% 與 100% 分得開；用瀏覽器選擇器引擎驗證過）。`fillBelowWhere` 是同一份清單包成權重 0 的 `:where(…)`：多條「門檻由高到低、後面的蓋過前面」的階段規則要用它（`:is()` 的權重取清單裡最高的，門檻不同時權重會不同）。`barPartPath('fill')` 是相對於一條的路徑（`> div:nth-child(2) > div:nth-child(2)`），`barHasFill(cond)` 組成接在一條後面的 `:has(…)`（status-bar 實作時新增）。 |
| `@/ccfolia/mock` | `createCharacterScene(state?)`（`update({ statuses, initiative, avatarUrl, snackbar })`）、`createRoomScene({ instant?, timing?, onPhaseChange? })`（`send(msg)`、`skip()`、`close()`、`reset()`、`updateMessages(fn)`（改寫目前這則與排隊中的訊息，例如換範例立繪；目前這則立即重畫、不重新打字）、`phase`）、`createChatScene({ tabs, selected, snackbar })`（`selectTab`、`addMessage`、`setMessages`、`update`、`refresh`）、`createStreamkitScene({ users })`（`update`、`setUser(id, patch)`）；`MockScene`、`measureRootExtent`；範例圖 `mockAvatar`、`mockPortrait('full' \| 'half')`、`mockDie`、`mockDiscordAvatar` | 依規格 3.1 自己寫的模擬頁（給 `CssPreviewFrame` 與測試）：元素、class、屬性、階層與原本外觀照外部事實，雜湊 class 故意用假的。角色頁改數值只改文字與屬性（元素不重建）；訊息框照 CCFOLIA 節奏（每字 80 ms、標點後 800 ms、打完 1.2 秒換下一則、滑入 225 ms、滑出 195 ms 後寫入 `visibility: hidden`、骰子圖每次是新的 img、窄來源 < 900／< 600 px 縮小）；聊天頁有虛擬捲動（量到 0 的訊息不佔高、清單 0 高時不算繪、捲到最新）、分頁（主分頁 role=tab、其他 role=button）、參加者頭像列、通知條、輸入區 form 約 10% 黑的底（chat-window F20 補上）；Streamkit 頭像用 data URI 並以「#」接上頭像網址路徑（不連網也選得到）。場景是一般物件，交給 CssPreviewFrame 後直接呼叫方法改狀態。；聊天頁訊息的 `outcome` 可以指定擲骰結果的分類（不給時照結果文字判斷）。 |
| `@/registry` | `TOOLS`、`GROUPS`、`getTool`、`toolsInGroup`、`outputDir`、`hrefToTool` | 工具清單（id、名稱、說明、群組、`status: 'next' \| 'live'`、靈感來源）。建置輸出位置、頁首、群組分頁、頁尾都從這裡讀。 |

### 4.3 尚未提供（之後依需要補進共用層）

- 影片編碼（Mediabunny）、Konva／three.js：G7、G8 需要時再加（G3 的版面編輯層用 DOM 疊在 Stage 上，見 4.1「立繪工作台」）。
- G2：動態 WebP 的拆格要瀏覽器解碼每一格（`createImageBitmap`），Node 只能 `parseWebpInfo`；轉場與濾鏡在主執行緒算（之後若太慢再搬進 Worker，模組本身已是純函式）。
- `ccfolia/*` 的 G5 資料格式（角色 JSON、房間 ZIP、日誌）：G5。G4 的頁面選擇器與模擬頁已在 `@/ccfolia`、`@/ccfolia/mock`。

## 5. 用詞表（台灣繁體中文）

| 用這個 | 不用 |
|---|---|
| 匯出 | 導出、輸出（按鈕上） |
| 預覽 | 預覧 |
| 立繪 | 立ち絵、立绘 |
| 差分 | 表情差分（可並用） |
| 自訂 CSS | 自定義 CSS |
| 瀏覽器來源 | ブラウザソース |
| 範本 | 模板、テンプレート |
| 字型 | 字體（字型名稱除外） |
| 檔案、資料夾、儲存、複製、貼上、重設 | 文件、文件夾、保存、拷貝、粘貼、重置 |
| CCFOLIA | ココフォリア |
| KP／GM、PL、PC、HO | （照寫） |

標點用全形；英文與數字前後加半形空白。
