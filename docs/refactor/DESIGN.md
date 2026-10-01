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
- 桌面版的預覽欄固定在畫面上（sticky），內容比畫面長時自己捲動；Stage 的高度跟著內容比例，最高 60dvh／560 px。

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
| `ToolShell` | `toolId`、`settings`、`preview`、`headerActions?`、`shortcuts?: Shortcut[]`、`usage?`、`title?`、`inspiration?` | 頁首＋設定／預覽兩欄＋頁尾。≥ 1024 px 左右、以下上下（預覽在上）。標題、群組分頁、靈感來源從 registry 讀；傳 `shortcuts` 會自動綁定並可按 `?` 看說明；`usage` 會出現在頁首「說明」按鈕。已包 `UiProvider`。 |
| `ToolHeader` | `toolId`、`title`、`actions?`、`onHelp?`、`onShortcuts?`、`homeHref?`（預設 `../../`） | ToolShell 內部使用；「← TRPG Toolkit」連回首頁。 |
| `GroupTabs` | `toolId`、`tools?` | 同群組工具的分頁連結（`../../tools/<id>/` 或 `../../next/<id>/`）；只有一個工具時不顯示。 |
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
| `FontPicker` | `value: FontValue`（`{ source: 'google' \| 'local' \| 'upload', family, weight }`）、`onChange`、`previewText?`、`scripts?`、`allowLocal?`、`allowUpload?`、`showWeight?`、`mode?: 'canvas' \| 'css'`、`weights?`、`localFontNote?` | 三合一字型選擇＋字重。Google 字型清單的預覽只下載用到的字；電腦字型在支援 `queryLocalFonts` 時列清單，否則手動輸入並檢查是否存在；上傳字型存 IndexedDB，下次自動恢復。**`mode="css"`**（OBS 自訂 CSS 用）：沒有上傳字型（CSS 拿不到使用者的檔案）；字重固定 400～900 六級、照選的值存，字型沒有時下方註明實際使用的最接近字重；電腦字型分頁列出常見內建字型（微軟正黑體、新細明體、標楷體、Yu Gothic UI、Meiryo、Yu Mincho）、手動輸入名稱、「從清單選」（`LocalFontDialog`）；選了電腦字型時提醒在跑 OBS 的電腦安裝。 |
| `LocalFontDialog` | `open`、`onOpenChange`、`value?`（目前的字型名稱）、`onPick(family)`、`sampleText?` | 電腦字型清單對話框：第一次打開時要求權限（讀取中有提示；拒絕／空清單／無法讀取各有說明與「重新讀取」）；依家族排序、同家族一次；樣張可改（預設含「永」）；多關鍵字搜尋（空白分隔、全部符合、不分大小寫、比對完整名稱）、「共 N 套／N 套之中的 M 套」；搜尋欄 Enter（不在選字中）選第一個；目前的字型標示「使用中」並捲到中央；清單讀過一次就留著。`supportsLocalFontList()` 判斷要不要顯示「從清單選」。 |

```tsx
<Field label="文字顏色"><ColorField value={c} onChange={setC} alpha /></Field>
<Field label="字型"><FontPicker value={font} onChange={setFont} previewText="大成功！" /></Field>
// 畫 canvas 前：await ensureFont(font.family, font.weight, text); ctx.font = fontCss(font, 48);
```

#### 圖片輸入

| 元件 | 主要 props | 說明 |
|---|---|---|
| `ImageDrop` | `onImages?(images: { file, bitmap, width, height }[])`、`onFiles?(files)`、`accept?`（預設 `image/*`）、`multiple?`、`paste?: 'document' \| 'focus' \| 'off'`、`label?`、`hint?`、`compact?`、`onError?`、`onReject?` | 拖放、貼上（Ctrl+V）、選檔；`onImages` 收到解碼後的 ImageBitmap。不符合 accept 的檔案顯示錯誤並呼叫 onReject。 |
| `FileDrop` | `onFiles`、`accept?`、`multiple?`、`paste?`、`label?`、`buttonLabel?`、`hint?`、`icon?`、`filterByAccept?`（預設 true） | 不限圖片的拖放區（JSON、字型…）。`filterByAccept={false}` 時 accept 只用在選檔視窗，所有檔案都交給 onFiles，由工具自己判斷（例如讀檔頭辨認沒有副檔名的圖片）。ImageDrop 也接受這個 prop。 |
| `ThumbnailList` | `items: { id, name, image?（網址或 ImageBitmap／canvas）, meta?, status?: 'done' \| 'error', statusLabel? }[]`、`aria-label`、`onRemove?(id)`、`removeLabel?(item)`、`removeDisabled?`、`empty?`、`minItemWidth?`（預設 120） | 批次圖片工具的縮圖清單（自動排列的格線）：圖片範圍內的透明處以棋盤格顯示；`image` 為空時顯示讀取中的佔位，網址讀不到時顯示破圖圖示；名稱過長時省略、滑過看全名；`status` 在名稱旁加標記（例如「已處理」）；每張可移除。立繪工作台（G3）共用。 |
| `CropDialog` | `open`、`onOpenChange`、`image`、`onConfirm(rect)`、`aspect?: number \| null`（給了就固定）、`aspectOptions?`、`initialRect?`、`minSize?`、`freeDraw?`、`rawInputs?`、`confirm?: { beforeBytes?, estimateBytes?(rect), warning?, applyLabel? }` | 拖曳框線或八個控制點；X／Y／寬／高數值欄；裁切框聚焦時方向鍵移動（Shift 10 px）、Alt＋方向鍵調整大小。回傳原圖座標。裁切計算在 `core/image`（`centeredCrop`、`clampCrop`、`resizeCrop`）。`freeDraw`：在圖上按住拖曳畫出新範圍（任何方向）。`rawInputs`：數字欄打字時不修正，下方即時顯示「裁切後 寬×高」或「範圍在圖片外」，範圍無效或等於整張圖時不能確定（規則：`normalizeCropRect`）。`confirm`：兩段式確認，先顯示「原尺寸 → 裁切後」「嵌入大小 原本 → 之後」與無法復原的警告，按「套用」才回呼。 |
| `CropConfirmSummary` | `before`、`after`（尺寸）、`beforeBytes?`、`afterBytes?`（null＝計算中）、`warning?` | 裁切／修邊的確認內容，可以直接放在面板裡（例如「修掉透明留白」的兩段式確認）。 |

```tsx
<ImageDrop multiple accept="image/png,image/webp" onImages={(list) => add(list)} hint="PNG、WebP，可多選" />
<ThumbnailList aria-label="已載入的立繪" items={list.map((it) => ({ id: it.id, name: it.file.name, image: it.result ?? it.url, status: it.result ? 'done' : undefined, statusLabel: '已處理' }))} onRemove={remove} />
<CropDialog open={open} onOpenChange={setOpen} image={img.bitmap} aspect={1} onConfirm={(r) => setCrop(r)} />
```

#### 預覽、播放、匯出

| 元件 | 主要 props | 說明 |
|---|---|---|
| `Stage` | `width`、`height`（內容原始尺寸）、`children`、`background?`／`defaultBackground?`／`onBackgroundChange?`、`backgrounds?`（工具列提供哪些背景）、`zoom?: number \| 'fit'`、`onZoomChange?`、`pixelated?`、`fitUpscale?`、`toolbar?`、`toolbarExtra?`、`viewportClassName?` | 背景：透明（棋盤格）／黑／白／自訂色（可半透明）／上傳背景圖（只供預覽，不會匯出）；縮放（− ＋、100%、符合畫面、Ctrl＋滾輪）。內容可以是 canvas 或 DOM。 |
| `Transport` | `time`、`duration`、`playing`、`onTimeChange`、`onPlayingChange`、`loop?`、`onLoopChange?`、`onRestart?`、`segments?: TimelineSegment[]`、`fps?`、`markers?: { time, label }[]`、`legend?`（預設 true） | 重播、播放／暫停、可拖曳時間軸（階段分色＋圖例）、循環、目前時間／總長。時間軸聚焦時 ←→ 一格（Shift 十格）、PageUp／PageDown 一秒、Home／End。拖曳時暫停，放開恢復。`markers` 在時間軸上畫細線標記（例如代表畫面），滑鼠停留顯示 label；階段很多（多頁）時 `legend={false}` 收起圖例。 |
| `usePlayback` | `{ duration, loop?, autoPlay?, rate? }` → `Playback` | requestAnimationFrame 驅動；回傳值直接展開給 Transport；另有 `play`／`pause`／`toggle`。使用者設定「減少動態效果」時預設不自動播放。 |
| `ExportPanel` | `formats: ExportFormatOption[]`、`onExport(settings, { signal, onProgress })`、`baseSize?`、`defaultSettings?`／`settings?`／`onSettingsChange?`、`fpsOptions?`、`scaleOptions?`、`sizeWarningBytes?`（預設 5,000,000）；`ref?: Ref<ExportPanelHandle>`、`extra?`、`maxPlays?`（預設 99）、`loopHint?`、`quantizeHint?`、`sizeWarningHint?` | 格式、FPS（依格式上限過濾）、無限循環／播放次數、尺寸倍率（顯示輸出 px）、減色；進度條與取消；結果卡（預覽、檔名、大小、尺寸、影格數與合併後格數、超過 5 MB 提醒、下載連結）。`onExport` 回傳的 `details?: { label, value }[]` 會加在結果卡（例如色數、循環、匯出時間）。`extra` 放在匯出按鈕上方（預設圖、裁邊、檔名等工具自己的選項）。`ref.current.exportNow('apng')` 從快捷鍵觸發匯出（給格式 id 時先切換過去）、`cancel()`、`busy`。 |
| `animationFormats(ids, { webpSupported })`、`useWebpSupport()` | — | 由 `core/timeline` 的格式資料組出 ExportPanel 選項；不支援 WebP 編碼（Safari）時停用並說明。 |

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
| `TemplateGallery` | `templates: { id, name, description?, thumbnail?（網址或元素）, tags?, data }[]`、`onApply(t)`、`activeId?`、`confirm?: boolean \| string`、`filter?`、`size?: 'md' \| 'sm'`、`defaultTag?` | 範本卡片格線，可依標籤篩選；套用前確認（可復原）。範本內容一律自己做。範本很多時用 `size="sm"`（16:9 小卡、說明改成滑鼠提示、分類可換行）並以 `defaultTag` 先停在目前範本的分類；範本清單換了（`key` 換掉或標籤不存在）時回到「全部」。 |
| `ProjectMenu` | `toolId`、`getData()`、`onLoad(data, file, source)`（回傳 false 表示不合用；`source` 是選的 File）、`onReset()`、`savedAt?`、`version?`、`fileName?`、`exactFileName?`、`onSaved?(name)`、`onLoadError?(message)`、`resetConfirm?`、`resetLabel?`、`extraItems?`（`ProjectMenuItem`） | 「專案」選單：存成專案檔（`<名稱>_YYYYMMDD.json`；給 `exactFileName` 時照用，例 `messagebox.messagebox.json`）、開啟專案檔（檢查是否為本工具的檔案）、重設（確認）；旁邊顯示「已自動儲存（HH:MM）」。`onSaved`／`onLoad` 的 `source`／`onLoadError` 讓工具把結果寫進自己的狀態列；「全部重來並清空復原紀錄」這類重設用 `resetConfirm`（覆寫確認對話框的標題、說明、按鈕）與 `resetLabel` 換掉預設的「可以復原」說法。（訊息框產生器移植時新增，向下相容） 另外也接受 `saveFileName?()`（回傳完整檔名）、`confirmOpen?`（預設 true；false 時開檔不先確認）、`onNotify?(notice: ProjectNotice)`（`{ kind: 'saved' \| 'opened' \| 'open-failed' \| 'reset', tone, fileName?, message? }`，給了就不跳 toast）、`resetText?: { label?, title?, description?, confirmLabel? }`（chat-window 用；與上列可並用，都不給時行為不變）。 |
| `Dialog` | `title`、`description?`、`children`、`footer?`、`open?`／`onOpenChange?`、`trigger?`、`size?: 'sm' \| 'md' \| 'lg' \| 'xl'`、`flush?` | 一般對話框（焦點鎖定、Esc 關閉）。`DialogClose` 是 footer 用的關閉按鈕。 |
| `ConfirmDialog`／`useConfirm()` | `title`、`description?`、`confirmLabel?`、`cancelLabel?`、`danger?` | `if (await confirm({ title: '重設？', danger: true })) reset();` |
| `useConfirmedReset(options?)` | → `(onReset) => Promise<boolean>` | 「全部重來」：確認後才執行（預設標題、說明、紅色按鈕；可覆寫）。搭配 `resetToolStore`。 |
| `useToast()` | `toast({ title, description?, tone?: 'info' \| 'success' \| 'warning' \| 'danger', duration? })` | 短暫通知。 |
| `ShortcutHelp` | `shortcuts`、`open`、`onOpenChange` | 從快捷鍵表產生的說明（ToolShell 已內建）。 |
| `useShortcuts(shortcuts, enabled?)` | `Shortcut = { keys: 'mod+z' \| string[], label, group?, handler?, allowInInput? }` | 綁在 window。對話框開著、在文字欄打字時不觸發；沒有修飾鍵的單鍵快捷鍵（例如 G）在開關、選單、滑桿上也不觸發；焦點在按鈕上時空白鍵／Enter 留給按鈕。`mod` 在 Mac 是 ⌘、其他是 Ctrl。 |
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

### 4.2 模組（`web/src/core/`、`web/src/ccfolia/`）

| 模組（import 路徑） | 主要函式與型別 | 說明 |
|---|---|---|
| `@/core/storage` | `createToolStore(id, initial, { version?, migrate?, persist?, historyLimit?, coalesceMs? })` → store（state：`data`、`update(recipe)`、`patch(partial)`、`replace(data)`、`reset()`；`store.temporal`；`store.beginGesture()`／`endGesture()`／`inGesture()`）；`useUndoRedo(store)`；`useSaveStatus(id)`／`getSaveTime(id)`；`historyGesture(store)` → `{ begin, commit, live(fn) }`；`resetToolStore(store)`；`createPreviewStore(id, initial, { persist? })`；`applyTemplate(current, template, { keep })` | 設定自動存到 localStorage（鍵名 `trpg-toolkit:<id>`，只存 `data`；新版加的欄位自動補預設值；版本不同時呼叫 migrate）；zundo 復原／重做（400 ms 內的連續變更算一步，例如拖滑桿）；`update` 用 Immer 寫法。規格寫「不保留狀態」的工具用 `persist: false`。**放開才記一步**：`coalesceMs: 0` 加上 `historyGesture`（`<Slider onChange={g.live(set)} onCommit={g.commit} />`、文字欄 `onFocus={g.begin} onBlur={g.commit}`），手勢中的所有變更合成一步（commit 延到這一輪事件之後，配合 Radix 滑桿鍵盤操作「先 commit 再 change」的順序）。**不列入復原的狀態**（預覽背景、套用前、測試數值、預覽角色）放 `createPreviewStore`（鍵名 `trpg-toolkit:<id>:preview`，一樣自動存檔與補預設值）。**套用範本**：`applyTemplate` 範本有的欄位換掉（物件逐層合併、陣列整個換），再把 `keep` 路徑（`.` 分隔、`*` 代表每一項，例 `'bars.*.nameOverride'`）還原成目前的值。「全部重來」用 `useConfirmedReset`＋`resetToolStore`（兩個 store 都要重設）。 |
| `@/core/storage`（IndexedDB） | `idbStore(name)`、`toolDb(toolId)`、`idbGet`／`idbSet`／`idbDel`／`idbKeys`／`idbEntries`／`idbClear`、`hasIndexedDb()` | 圖片、字型、大型資料放這裡（idb-keyval，每個名稱一個資料庫 `trpg-toolkit:<name>`）。 |
| `@/core/storage`（專案檔） | `serializeProject(tool, version, data)`、`parseProject(text, tool)`（錯誤丟 `ProjectFileError`，訊息可直接顯示）、`createProjectFile` | 格式：`{ format: 'trpg-toolkit-project', tool, version, savedAt, data }`。 |
| `@/core/files` | `downloadBlob(blob, name)`、`downloadUrl`／`downloadDataUrl`、`downloadBytes`、`downloadText`；`readAsText`／`readAsArrayBuffer`／`readAsBytes`／`readAsDataUrl`；`pickFiles({ accept, multiple })`；`matchesAccept`；`copyText(text)`；`downloadSequentially(items: { name, blob: Blob \| (() => Promise<Blob>) }[], { intervalMs?（預設 500）, signal?, onProgress? })`；`zipFiles(entries, { level, mtime })`、`unzipFiles(bytes)`；`safeFileName(name, { fallback, maxLength })`、`fileNameWithExt`、`splitExtension`、`sequenceName`；`formatBytes`、`SIZE_WARNING_BYTES` | 檔名清理：拿掉 `\ / : * ? " < > \|` 與控制字元、合併空白、去頭尾的點與空白、避開 Windows 保留名，中文與 emoji 保留。ZIP 檔名以 UTF-8 存；固定 `mtime` 可讓輸出逐位元組相同。`copyText` 原封不動（含行尾空白、全形空白），Clipboard API 不能用時改用 execCommand。`downloadSequentially` 一個接一個下載（不打包），兩次下載之間至少間隔 intervalMs（避免瀏覽器擋下連續下載）；內容可以是輪到時才產生的函式（例如下載時才編碼），等待間隔時就先準備；可取消。 |
| `@/core/fonts` | `GOOGLE_FONTS`（目錄）、`BASIC_TC_FONTS`、`findGoogleFont`、`googleFontCssUrl`、`nearestWeight`（距離相同取較細的）；`SYSTEM_FONTS`、`findSystemFont`、`CSS_WEIGHT_CHOICES`、`resolveFontWeight(font, weight)`；`ensureFont(family, weight?, text?)`、`ensureFonts(list)`、`fontCss(value, px)`、`fontFamilyCss(family)`、`FALLBACK_STACK`；`loadPreviewFont`；`canQueryLocalFonts`、`queryLocalFamilies`、`queryLocalFontFamilies({ force? })`（`LocalFontError.kind`：unsupported／insecure／denied／empty／failed）、`cachedLocalFonts`、`filterLocalFonts(list, query)`、`isLocalFontAvailable`；`uploadFont(file)`、`listUploadedFonts`、`removeUploadedFont`、`registerUploadedFonts`、`readFontNames(bytes)` | 目錄 73 套（繁中 14 套：思源黑／宋、霞鶩文楷、朱古力黑體、仙人掌明體、粉圓、芫荽、昭源黑／宋、注音字型…；日 26、韓 8、英 25，含 G4 規格字型清單的全部字型），字重都已用 css2 驗證存在（2026-10-01）。`SYSTEM_FONTS` 是 CSS 類工具的電腦內建字型（微軟正黑體、新細明體、標楷體＋Yu Gothic UI、Meiryo、Yu Mincho，附中文／日文別名）。畫 canvas 前一定要 `await ensureFont`（中日韓字型只下載 text 用到的部分）。上傳字型會讀 name 表取名稱（TTF／OTF／TTC／WOFF；WOFF2 用檔名）。 |
| `@/core/encode` | `createEncoder(spec, { worker?, maxInFlight? })` → `Encoder`（`addFrame(rgba, ticks?)`、`setStill(rgba)`、`finish()` → `EncodedFile`、`abort()`）；`spec` 為 `{ format: 'apng' \| 'gif' \| 'webp' \| 'png-sequence', options }`；`encodePng(rgba, w, h, palette?)`、`encodePngAsync`；`ApngEncoder`、`GifEncoder`、`WebpEncoder`、`PngSequenceEncoder`；`ColorStats`／`buildPalette`；`assembleApng`、`assembleAnimatedWebp`、`parseWebp`、`supportsWebpEncoding()`；`crc32`、`chunk`、`zlib`；`GIF_MAX_FPS` | APNG（移植自 text-fx）：只存與前一格不同的矩形、相同影格合併（`mergeIdentical: false` 可關）、預設圖、播放次數、減色（256 色含半透明，色數在 256 內時無損）；`palette`（RGBA 平鋪、1～256 色）給固定調色盤時直接輸出調色盤 PNG，像素必須與調色盤某色完全相同（完全透明像素的 RGB 也保留），適合「單色＋透明度」這類顏色事先知道的輸出。延遲要以毫秒計時用 `fps: 1000`、`addFrame(rgba, 毫秒)`。GIF：全域調色盤、1 位元透明、延遲以 1/100 秒累計、fps ≤ 50。WebP：自己封裝 RIFF／VP8X／ANIM／ANMF，影格由瀏覽器編碼（quality 1 為無損 VP8L），差分矩形對齊偶數。全部預設在 Web Worker（Comlink）裡執行，影格以 transfer 傳入（傳入後不要再用那塊記憶體）。同樣輸入輸出逐位元組相同。`ApngEncoder` 另有 `embedStill`（false＝`setStill` 的畫面只用在減色統計、不放進檔案）與 `stillWeightMin`（減色時代表畫面份量＝影格數×0.35 的下限，text-fx 用 4）。 |
| `@/core/timeline` | `EASE`（8 條可選＋`slam`、`glide`）、`EASING_CHOICES`、`getEasing`、`reverseEasing`；`clamp`、`clamp01`、`lerp`、`remap`、`progress(t, start, len)`；`frameCount(duration, fps)`、`frameTime(i, n, duration, fps, endInclusive?)`；`buildSegments(parts)`、`segmentAt(t, segs)`、`segmentsDuration`、`TimelineSegment`；`hashUnit`、`hashSigned`、`hash(...parts)`、`seedOf(str)`、`timeSlot(t, perSecond)`、`createRandom(seed)`；`AnimationSource`；`exportAnimation(source, options)`、`drawFrame(ctx, source, t, { scale, background })`、`createFrameCanvas`、`exportSize`、`EXPORT_FORMATS` | 緩動曲線取樣值與 text-fx 完全相同（有測試）。亂數一律用決定性亂數，同一組設定每次畫出同樣的影格。`AnimationSource` ＝ `{ width, height, duration, render(ctx, t), prepare?, loop?, stillTime?, segments? }`；`exportAnimation` 支援 `apng`／`gif`／`webp`／`png`（單張，取 stillTime）／`zip`（連番 PNG），有進度、取消、縮放、背景色、影格數上限（預設 1800）。無縫循環的動畫設 `loop: true`，最後一格不會和第一格重複。`exportAnimation` 的其他選項：`autoCrop`（裁掉所有影格〔APNG 含預設圖；PNG 只看那一格〕都透明的邊、四周留 2 px，會多畫一輪）、`still`、`stillForPalette`／`stillWeightMin`（APNG 減色時代表畫面加權）、`sequenceBaseName`／`sequenceInfo`（連番 PNG 的 ZIP 內檔名主體與說明檔；`sequenceInfo` 可以是函式，拿到 `{ fps, frames, width, height, duration, first, last }`）；結果多了 `crop`（輸出在畫面中的範圍）與 `ms`（匯出花費毫秒）。 |
| `@/core/typeset` | 排版：`typeset(input)`、`typesetToFit(input, { width, height, marginX?, marginY?, pad?, minSize? })` → `{ size, block, main, sub, lines, mainCss, subCss, mainMeter, subMeter }`（＋`scale`、`shrunk`）；低階：`layoutGroup(lines, opts)`、`composeBlock(main, sub, { vertical, align, subPos, subGap })`、`indexVisible(glyphs)`、`breakText(text, { limit, unit })`、`wrapChars`、`tokenize`；量測：`Meter`（`css`、`size`、`central`、`get(ch)`）、`canvasMeasure`、`MeasureFn`（可換成假的，Node 測試用）；字元：`isWide`、`isHangul`、`isBlankChar`、`hasCjk`、`NO_LINE_START`、`NO_LINE_END`、`ROTATE_V`、`CORNER_V`、`SMALL_KANA`、`PAUSE_LONG`／`PAUSE_SHORT`／`CLOSERS`；擺放與縮小：`overflowRatio`、`shrinkSize`、`placeBox(box, area, anchor, { offsetX, offsetY, keepInside })`、`availableArea`、`anchorRatio`、`ANCHORS`；字型字串：`fontStack(font, text)`、`canvasFont(stack, weight, px, italic?)`、`nearestWeightUp`；sprite：`paintGlyph(ch, css, m, adv, central, style, grad, italic?)` → `GlyphArt`（`body`、`halo`、`flash()`、`px`／`py` 樞紐點）、`glyphPadding`、`createSpriteCanvas` | G1 文字群組共用的排版引擎，移植自 text-fx。字的 (x, y) 是字身中心（縮放、旋轉的樞紐）；直書時字從上往下、行從右往左，半形英數整串轉 90°（`latinUpright` 改直立）、「」（）…— 轉 90°、「，。、．」依墨跡移到字格右上（`punctCenter` 置中）、小假名往右上。禁則：句讀與閉括號不放行首（留在上一行，允許超出）、開括號不放行尾、英文單字與韓文詞不從中間斷（比一整行長才斷）、換行後行首空白拿掉；`wrapChars` 依字數（半形算半個字）、`wrapLength` 依長度（null＝不換行）。自動縮小算進外框／光暈／陰影的 pad，乘 0.985、不小於 `minSize`，並沿用原字級的斷行。`fontStack`：西文字型遇到中文接同風格的思源宋體／黑體，遇到韓文接 Noto Serif／Sans KR。`paintGlyph` 把一個字畫成三張分層的 sprite：光暈（只在字外側）、本體（陰影挖空＋外側外框＋外框＋塗色，淡入時整張一起變透明，不會透出外框）、閃白剪影；漸層用任意色標，範圍由 `GlyphGradient`（v：縱向、h／d：整段）決定。實際例子見元件展示頁「模組」分頁。 |
| `@/core/image` | `loadImage(blob \| url)` → ImageBitmap（SVG 等自動改走 `<img>`）；`imageSize`、`getImageData`、`makeCanvas`、`canvasToBlob`；`opaqueBounds(pixels, threshold?)`、`imageOpaqueBounds(img, threshold?)`、`scanOpaqueBounds(w, h, read, threshold?)`、`padRect`；`fitSize(src, box, 'contain' \| 'cover', allowUpscale?)`、`resizeImage(img, w, h, { quality })`、`cropImage(img, rect)`；`dominantColors(pixels, count?)`；`detectImageType(bytes)`（png／apng／webp／gif／jpeg／avif／bmp）；`centeredCrop`、`clampCrop`、`resizeCrop`；`fileToDataUri(blob, { maxBytes?, maxWidth? })`、`urlToDataUri(url, { maxWidth?, timeoutMs?, signal? })`、`ImageInputError`（kind：too-large／decode／cors／http／not-image／timeout／aborted）、`measureImageUrl(src, { timeoutMs? })`、`transparentTrimRect(pixels)`、`normalizeCropRect(raw, bounds)`、`isWholeImage`、`cropToDataUri(img, rect)`、`dataUriBytes`、`dataUriToBlob`、`formatEmbedBytes`；`createImageStore(toolId, name?)` | `resizeImage` 大幅縮小時分段縮（`quality: 'pixelated'` 為最近鄰）。`imageOpaqueBounds` 直接對影像找不透明範圍，結果同 `opaqueBounds(getImageData(img))`，但只從四周往內一條條讀到碰到內容為止（大圖快很多；`scanOpaqueBounds` 是它的純函式核心）。`detectImageType` 依檔頭判斷實際格式，不看副檔名。**嵌進 CSS**：`fileToDataUri` 沒縮小時保留原檔位元組與格式（GIF 動畫不變；MIME 依檔頭修正），超過 `maxWidth` 時等比縮小改存 PNG；`urlToDataUri` 需要對方允許跨網域，失敗的錯誤訊息可直接顯示（建議下載後改上傳）；`measureImageUrl` 用 `<img>` 量原始尺寸（不需跨網域、逾時回 null）。`transparentTrimRect` 是不透明度 > 0 的外接框（整張不透明或全透明時 null＝沒有可修的留白）；`normalizeCropRect` 四捨五入、負寬高反向、夾在圖內、不到 1px 時 null（範圍在圖外）。`formatEmbedBytes`：B／KB 一位小數／MB 兩位小數。`createImageStore` 把圖片存 IndexedDB，存不下時 `save` 回傳 false。 |
| `@/core/color` | `parseColor`、`formatHex`、`normalizeHex`、`toCss`、`withAlpha`、`rgbToHsv`、`hsvToRgb`、`relativeLuminance`、`contrastRatio`、`readableTextColor` | 色碼一律小寫 `#rrggbb`／`#rrggbbaa`。 |
| `@/core/gradient` | `Gradient`（`{ kind: 'linear' \| 'radial', angle, stops: { offset, color }[] }`）、`DEFAULT_GRADIENT`、`gradientToCss(g)`、`canvasGradient(ctx, g, x, y, w, h)`、`sampleGradient(g, t)` | GradientField 的值；canvas 的角度規則與 CSS 相同。 |
| `@/core/worker` | `wrapWorker<Api>(worker)` → `{ api, terminate }`、`exposeApi(api)`、`transfer`、`proxy`、`canUseWorker()`、`ownBuffer(arr)` | Comlink 包裝。`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` 要直接寫在呼叫端，Vite 才會打包。 |
| `@/core/css` | `createCssSheet({ important?, animated?, boostId? })` → `CssSheet`（`header(o)`、`comment`、`import(url)`、`rule(selector, decls, { important?, animated?, noBoost? })`、`keyframes(name, frames)` → 實際名稱、`media`、`supports`、`group`、`raw`、`toString()`）；`boostSelector`、`splitSelectorList`、`usesHas`；`cssString`、`cssUrl`、`cssComment`、`cssCommentText`、`cssIdent`、`singleLine`、`cleanFontName`、`quoteFontFamily`、`fontFamilyList`；`num`、`px`、`pxInt`、`pct`、`em`、`ms`、`sec`、`isCssColor`、`safeCssColor`、`rgba(color, alpha)`、`withOpacity(color, %)`、`mixColors`、`lighten`、`darken`、`yiqTextColor`；`textOutline(kind, color, { opacity, width })`、`strokeShadow`、`strokeShadow8`、`texture(kind, opts)`＋`textureDecls`、`noiseDataUri`、`cornerBrackets`；`fontStack(font)`、`fallbackStack`、`FALLBACK_STACKS`、`cssFontWeight`、`googleFontUrls`／`googleFontImports`、`localFontNames`；`cssHeaderComment`／`cssHeaderLines` | OBS 自訂 CSS 的產生核心。**優先順序**：宣告預設加 `!important`（蓋過 CCFOLIA 後插入的樣式與行內樣式）；會被 keyframes 改動的屬性列在 `animated`（整份或單條規則），輸出時不加 important、改在選擇器主體加 `:not(#tk-x)` 提高權重——important 會讓動畫失效。含 `:has()` 的選擇器自動拆成另一條規則（OBS 30 只丟掉那條）。`@import` 自動移到開頭說明之後；keyframes 同名同內容只輸出一次、同名不同內容自動改名。**跳脫**：字串（引號、反斜線、換行 `\A `）、註解（`*/` 拆成 `* /`）、字型名稱（去掉 `; { } ( ) " ' \ < >`、加引號、通用字族不加）、顏色（不合格改白）。**裝飾**：文字外框線（柔邊陰影四層、描邊 16 方向／≤ 1px 時 8 方向、發光 4／10／18px）、質感（舊紙、顆粒＝SVG 雜訊 data URI；掃描線要放覆蓋層；漸深取代背景色）、四角括號（8 層漸層）。**字型**：Google Fonts 每家族一條 `@import`、只含用到的字重（換成最接近的實有字重、由小到大）；後備字型依種類（繁中黑／明／楷 → 台灣系統字型；其他 → 日文系統字型）。 |
| `@/ccfolia` | `parseRoomId`、`parseCharacterId`、`resolveCharacterRef`、`roomUrl`／`chatUrl`／`characterUrl`、`roomUrlFrom`／`chatUrlFrom`／`characterUrlFrom`、`exampleRoomUrl`…、`CCFOLIA_LOGIN_URL`；`parseStreamkitVoiceUrl`、`streamkitVoiceUrl`、`STREAMKIT_VOICE_PARAMS`、`parseDiscordUserId`、`classifyImageUrl`；`CHARACTER_PAGE`、`barSelector`、`barPartSelector(part, n?)`、`barsAfterSelector`、`MAX_STATUS_BARS`、`MESSAGE_BOX`、`MESSAGE_BOX_TIMING`、`MESSAGE_BOX_BREAKPOINTS`、`CHAT`、`STREAMKIT`、`STREAMKIT_CLASS`、`streamkitSelector`、`streamkitUserAvatar(id)`、`streamkitUserSpeaking(id)`、`OBS`；`fillWidthValue`、`fillStyleAttr`、`currentColorAttr`、`fillBelowSelectors(threshold, inclusive?)`／`fillBelowSelector`、`FILL_ZERO`、`FILL_FULL`；`classifyDiceResult`、`DICE_RESULT_CLASS`、`DICE_RESULT_ORIGINAL_COLOR`、`messageBoxResultText`、`firstResultNumber`、`SECRET_DICE_*`、`systemStatusMessage`、`chatTimestamp`；（P0 的）`CcfoliaCharacterData`、`toCharacterClipboard`、`OBS_SELECTORS` | CCFOLIA／Discord Streamkit／OBS 的外部事實，**改版時只改這裡**（各常數附觀察日期）。網址：房間 ID 取「rooms/」後面的英數 `_` `-`，或整段 4 字元以上；角色欄含房間時以它為準。選擇器只用 MUI class、role／aria、`variant` 屬性與子元素順序（雜湊 class 不可用；擲骰結果配色 class 例外，集中在 `DICE_RESULT_CLASS`）；聊天頁的輸入區 `CHAT.inputPaper` 限定 `div.MuiPaper-root`（標頭 header 也有 MuiPaper-root，不能混在一起）；Streamkit 只用 class 前綴，以頭像網址的 `/avatars/{ID}/` 認人。`fillBelowSelectors` 把「剩餘比例 < 門檻」（或 ≤ 整數門檻）寫成填充 style 字串的屬性選擇器（0 與 0.x%、10～19% 與 100% 分得開；用瀏覽器選擇器引擎驗證過）。 |
| `@/ccfolia/mock` | `createCharacterScene(state?)`（`update({ statuses, initiative, avatarUrl, snackbar })`）、`createRoomScene({ instant?, timing?, onPhaseChange? })`（`send(msg)`、`skip()`、`close()`、`reset()`、`updateMessages(fn)`（改寫目前這則與排隊中的訊息，例如換範例立繪；目前這則立即重畫、不重新打字）、`phase`）、`createChatScene({ tabs, selected, snackbar })`（`selectTab`、`addMessage`、`setMessages`、`update`、`refresh`）、`createStreamkitScene({ users })`（`update`、`setUser(id, patch)`）；`MockScene`、`measureRootExtent`；範例圖 `mockAvatar`、`mockPortrait('full' \| 'half')`、`mockDie`、`mockDiscordAvatar` | 依規格 3.1 自己寫的模擬頁（給 `CssPreviewFrame` 與測試）：元素、class、屬性、階層與原本外觀照外部事實，雜湊 class 故意用假的。角色頁改數值只改文字與屬性（元素不重建）；訊息框照 CCFOLIA 節奏（每字 80 ms、標點後 800 ms、打完 1.2 秒換下一則、滑入 225 ms、滑出 195 ms 後寫入 `visibility: hidden`、骰子圖每次是新的 img、窄來源 < 900／< 600 px 縮小）；聊天頁有虛擬捲動（量到 0 的訊息不佔高、清單 0 高時不算繪、捲到最新）、分頁（主分頁 role=tab、其他 role=button）、參加者頭像列、通知條；Streamkit 頭像用 data URI 並以「#」接上頭像網址路徑（不連網也選得到）。場景是一般物件，交給 CssPreviewFrame 後直接呼叫方法改狀態。；聊天頁訊息的 `outcome` 可以指定擲骰結果的分類（不給時照結果文字判斷）。 |
| `@/registry` | `TOOLS`、`GROUPS`、`getTool`、`toolsInGroup`、`outputDir`、`hrefToTool` | 工具清單（id、名稱、說明、群組、`status: 'next' \| 'live'`、靈感來源）。建置輸出位置、頁首、群組分頁、頁尾都從這裡讀。 |

### 4.3 尚未提供（之後依需要補進共用層）

- 影片編碼（Mediabunny）、Konva／three.js：G7、G8 需要時再加。
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
