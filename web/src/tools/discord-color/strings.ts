/** Discord 彩色文字產生器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
import type { EffectId, ThemeId } from './palette';

const fmt = (n: number) => n.toLocaleString('en-US');

export const S = {
  /** 開頁的範例文字：前段、Discord、彩色的 7 個字、結尾 */
  sample: ['歡迎使用 ', 'Discord', '彩色文字產生器', '！'] as const,

  /* 工具列 */
  toolbar: '文字格式',
  target: '套用到',
  targetFg: '文字',
  targetBg: '背景',
  targetHint: '經典色、自訂色、效果上在文字（前景）或背景；樣式不受影響。',
  rowStyle: '樣式',
  rowClassic: '經典色',
  rowCustom: '自訂色',
  rowEffect: '效果',
  styles: {
    0: '清除',
    1: '粗體',
    3: '斜體',
    4: '底線',
    9: '刪除線',
  } as Record<number, string>,
  styleTips: {
    0: '清除：選取的文字在 Discord 上回到沒有格式',
    1: '粗體',
    3: '斜體',
    4: '底線',
    9: '刪除線',
  } as Record<number, string>,
  classicNames: ['黑色', '紅色', '綠色', '棕色', '淺藍色', '粉紅色', '藍綠色', '淺灰色'],
  classicLabel: (name: string) => `經典色：${name}`,
  customLabel: (i: number, hex: string) => `自訂色 ${i + 1}（${hex}）`,
  effects: { rainbow: '彩虹', gradient: '漸層', zebra: '斑馬' } as Record<EffectId, string>,
  effectTips: {
    rainbow: '彩虹：每個字依序換成彩虹的顏色',
    gradient: '漸層：從起點色漸漸變成終點色',
    zebra: '斑馬：兩種顏色一個字一個字輪流',
  } as Record<EffectId, string>,
  noSelection: '先在編輯區選取要套用的文字。',

  /* 編輯區 */
  editor: '編輯區',
  editorHint:
    '選取文字後按上面的樣式、顏色或效果；同一段可以疊加（例如先粗體再上色）。Enter 換行。',
  counter: (n: number, level: 'ok' | 'nitro' | 'over') =>
    level === 'ok' ? `${fmt(n)}/2,000` : `${fmt(n)}/4,000（Nitro）`,

  /* 輸出 */
  output: 'Discord 訊息',
  outputCount: (n: number, level: 'ok' | 'nitro' | 'over') =>
    level === 'ok'
      ? `${fmt(n)}／2,000 字`
      : level === 'nitro'
        ? `${fmt(n)}／4,000 字（超過 2,000 字，要 Nitro 才能送出）`
        : `${fmt(n)}／4,000 字（太長，送不出去）`,
  outputHint:
    '按「複製」後直接貼到 Discord 的訊息欄送出。畫面上的「ESC」小方塊是色碼的控制字元，會一起複製；色碼也算在字數裡。',
  copy: '複製',
  copied: [
    '已複製！',
    '雙重複製！',
    '三連複製！',
    '主宰全場！！',
    '暴走！！',
    '大複特複！！',
    '無人能擋！！',
    '變態複製！！',
    '怪物複製！！！',
    '如同神一般！！！',
    '超越神的複製！！！！',
  ],
  copyFailed: '無法寫入剪貼簿',
  copyFailedHint: '輸出已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',

  /* 設定 */
  sectionTheme: '預覽主題',
  theme: '主題',
  themeHint:
    'Discord「外觀」設定裡的主題：Light 淺色、Ash、Dark 深色、Onyx。只影響這裡的預覽，複製的內容都一樣。',
  themes: { light: 'Light', ash: 'Ash', dark: 'Dark', onyx: 'Onyx' } as Record<ThemeId, string>,
  themeAria: {
    light: 'Light（淺色）',
    ash: 'Ash',
    dark: 'Dark（深色）',
    onyx: 'Onyx',
  } as Record<ThemeId, string>,
  sectionCustom: '自訂色',
  customHint: '工具列「自訂色」的 8 個顏色。',
  customField: (i: number) => `自訂色 ${i + 1}`,
  customReset: '回到預設的 8 色',
  sectionEffect: '效果的顏色',
  gradientFrom: '漸層：起點',
  gradientTo: '漸層：終點',
  zebraA: '斑馬：顏色 1',
  zebraB: '斑馬：顏色 2',
  effectReset: '回到預設',

  /* 頁首 */
  undo: '復原',
  redo: '重做',
  keysEdit: '編輯區',
  keysGeneral: '一般',
  keyEnter: '換行',
  project: {
    fileName: 'Discord彩色文字',
    resetLabel: '重設…',
    resetTitle: '重設成範例文字？',
    resetDescription: '編輯區換回範例文字，自訂色與效果的顏色回到預設（可以復原）。',
  },

  /* 使用方式 */
  usageIntro:
    'Discord 的 ```ansi 程式碼區塊看得懂 ANSI 色碼：在這裡把文字排好顏色，複製貼到 Discord 送出，就是有顏色的訊息。',
  usageSteps: [
    '在編輯區輸入文字（Enter 換行）。',
    '選取一段文字，按「樣式」「經典色」「自訂色」或「效果」；「套用到」切換顏色上在文字或背景。',
    '同一段文字可以疊加（例如先按粗體、再按紅色）；選取範圍裡原本的格式會被新的取代。',
    '按「複製」，貼到 Discord 的訊息欄送出。',
  ],
  usageNotesTitle: '注意事項',
  usageNotes: [
    '經典色在不同的 Discord 主題下顏色不同，可以在「預覽主題」切換看看；自訂色與效果是固定的 RGB 色。',
    '一則訊息最多 2,000 字（Nitro 4,000 字），色碼也算在字數裡；效果的每個字都有自己的色碼，很快就會用完。',
    '「清除」會在輸出放一個重設碼：選取的文字在 Discord 上回到沒有格式。',
    '從編輯區複製的有色文字，貼回編輯區時保留格式；從其他地方貼上的只留文字。要搬移有色文字請用剪下、貼上（用滑鼠拖曳搬移會掉格式）。',
    '要在支援 ANSI 色碼的 Discord 版本（電腦版）才看得到顏色。',
    '編輯區的內容、自訂色與效果的顏色會自動保存在這個瀏覽器；也可以存成專案檔。',
    '本工具不是 Discord 官方製作或認可的工具。',
  ],
} as const;
