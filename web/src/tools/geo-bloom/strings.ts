/** 幾何花紋產生器的介面文字（用詞照 DESIGN.md 第 5 節） */
import type { DecodeMode } from './decode';
import type { BloomCodeInfo, BloomStats } from './generate';
import type {
  CodeVersion,
  NumericKey,
  OverlapMode,
  ShapeToggle,
  StartRing,
  TriRing,
} from './settings';

export const S = {
  title: '幾何花紋產生器',
  /* 種子與產生 */
  generate: '產生',
  generateHint: '換一個新的種子再畫（固定種子時不換）。',
  seed: '種子',
  seedHint: '同一個種子、同樣的設定一定畫出同一張。空白時當成「0」。',
  lockSeed: '固定種子',
  lockSeedHint: '按「產生」時不換種子，只套用設定的改變。',
  stats: (s: BloomStats) =>
    `圖形 ${s.shapes}／線 ${s.lines}${s.dropped ? `（另丟失 ${s.dropped}）` : ''}／點 ${s.dots}${
      s.bridges ? `／橋 ${s.bridges}` : ''
    }`,
  sizeInfo: (w: number, h: number) => `${w} × ${h} px`,
  scaledNote: (percent: number) => `預覽縮小為 ${percent}%，匯出為原尺寸。`,
  drawing: '繪製中…',
  previewLabel: '幾何花紋預覽',
  previewFailed: (message: string) => `畫不出預覽：${message}`,

  /* 設定的區塊 */
  sections: {
    templates: '範本',
    canvas: '畫布',
    limits: '數量上限',
    sizes: '大小',
    chances: '機率',
    shapes: '圖形的種類',
    overlap: '重疊',
    style: '樣式',
    rings: '同心圓',
    morse: '摩斯環',
    code: '把種子刻進圖形',
    decode: '從圖片讀種子',
  },
  templatesHint: '套用一組調好的設定（種子不變），之後可以再自己調。',
  templatesLabel: '花紋範本',
  templateConfirm: '種子以外的設定（含畫布大小）會換成範本的設定，可以用「復原」回來。',

  labels: {
    width: '寬',
    height: '高',
    maxShapes: '圖形的最多數',
    maxLines: '線的最多數（全部）',
    branchMin: '每個圖形的線數：最少',
    branchMax: '每個圖形的線數：最多',
    maxDepth: '最大深度（代）',
    maxRings: '同心圓的最多層數',
    rootMin: '中央圓的半徑：最小',
    rootMax: '中央圓的半徑：最大',
    childMin: '子圖形的半徑：最小',
    childMax: '子圖形的半徑：最大',
    shrink: '每代的縮小率',
    lineMin: '線長：最小',
    lineMax: '線長：最大',
    pShape: '線的末端放圖形',
    pBranch: '圖形再長線',
    pDot: '線的末端加點',
    pAttach: '不畫線、直接貼著放',
    attachDepth: '貼著放時嵌進去',
    pDrop: '線的丟失率',
    regularity: '角度的等間隔程度',
    pTri: '三角形的出現率',
    gap: '圖形間的空隙',
    pAccent: '強調色的比例',
    lineWidth: '線寬',
    pFill: '塗滿的比例',
    minRings: '同心圓的最少層數',
    solidInner: '保留成實線的內圈數',
    pMorse: '每一圈變成摩斯環的機率',
    morseDot: '短點的長度',
    morseDash: '長點的長度',
    morseGap: '符號之間的間隔',
    morseLetterGap: '字母之間的間隔',
    morseWordGap: '單字之間的間隔',
    pMorseDash: '長點的比例（隨機時）',
    pMorseWord: '單字間隔的機率（隨機時）',
    morseWidth: '摩斯線的粗細',
    morseShrink: '短點跟著每代縮小',
    pBridge: '每個字母架橋的機率',
    codeUnit: '刻種子的短點長度',
    codeMin: '一個圖形最少放幾個位元',
    codeMax: '一個圖形最多放幾個位元',
    codeScale: '子圖形放大',
    codeWidth: '刻種子的線寬',
    codeRootR: '中央的最小半徑',
  } satisfies Record<NumericKey, string>,
  hints: {
    canvas: '64～8000 px。大畫布的預覽會縮小顯示，匯出時才畫全尺寸。',
    maxShapes: '含中央的圓。到了上限就不再放新的圖形。',
    maxLines: '全部的線加起來，到了上限就停止。',
    branch: '每個要長線的圖形長出幾條線（最少～最多之間隨機）。最少大於最多時兩者互換。',
    maxDepth: '從中央的圓往外長幾代。0＝只有中央的圓。',
    maxRings: '同心圓、圓＋半圓的層數在最少層數（「同心圓」區塊）～這個數之間。',
    root: '中央圓的大小在最小～最大之間隨機。最小大於最大時兩者互換。',
    child: '每往外一代再乘上縮小率。最小大於最大時兩者互換。',
    shrink: '100%＝每一代都一樣大。',
    line: '從圖形的外圈量起，每往外一代也乘上縮小率。最小大於最大時兩者互換。',
    pShape: '其他的線只畫線，末端可能加一個點。',
    pBranch: '中央的圓一定會長線。',
    pDot: '只畫線（沒有放圖形）的線，末端加一個實心點。',
    pAttach: '每條線以這個機率改成不畫線，子圖形直接貼在父圖形的邊上（正方形貼在邊上）。',
    attachDepth: '0%＝剛好碰到；正的嵌進父圖形（以子圖形的半徑計），負的離開一點。',
    pDrop: '連到子圖形的線以這個機率不畫，圖形照樣在（看起來像斷開）。',
    regularity: '100%＝同一個圖形的線平均分在一圈；越低角度越亂。',
    shapes:
      '子圖形從勾選的種類裡隨機選；一般的種類都不勾時全部是圓。三角心把同心圓的最內層換成三角形，三角環把三角形內接在某一圈。',
    pTri: '勾了三角形時，每個子圖形以這個機率是三角形（一般的種類都不勾時一定是三角形）。三角形每條邊最多長一條線。',
    triRing: '從內往外數。內接在第二圈時，最內層縮到三角形裡面。',
    avoidOverlap: '新的圖形碰到已經畫好的圖形（以外接圓計）時，照「重疊時」處理。',
    overlapMode: '「換角度重試」最多試 14 次；「整條取消」連線也不畫。',
    gap: '新的圖形和既有的圖形之間至少空出這麼多。',
    lineAvoid: '線碰到其他圖形的外接圓時換一條（重試時換角度）。',
    noCross: '新的線和已經畫好的線交叉時換一條（重試時換角度）；接在同一點的不算。',
    inBounds: '圖形整個、線的末端都要在畫布內。',
    transparent: 'PNG 沒有背景（透明）；SVG 不畫背景。',
    pAccent: '每條線、每個圖形各自隨機用強調色；線末端的點和那條線同色。',
    lineWidth: '線、圖形的描邊寬度；點與圓心的大小也跟著它。',
    pFill: '每個圖形各自隨機塗滿。',
    fromEdge:
      '圓、正方形、半圓：線從邊上出發（半圓的直徑那一側從中心）；關閉時從中心。同心圓看「放射線的起點」（選「最外圈」時才跟著這個開關）。',
    startRing:
      '同心圓長出的線從哪一圈出發（從內往外數）。「每條線隨機」從保留成實線的內圈裡、那個方向上有畫到的圈選一圈，都沒有時那條線不長。',
    endAtRing: '線連到子圖形的同心圓時接在同樣的那一圈；關閉時接到外圈。',
    rootRings: '關閉時中央一半是圓、一半是同心圓。',
    minRings: '同心圓、圓＋半圓的層數在這個數～最多層數（「數量上限」）之間。',
    morse: '同心圓內圈以外的圈畫成摩斯電碼的點線（中央的圖形依種子也可能有）。',
    solidFollow:
      '起點是第一圈時保留 1 圈、第二圈（或第一或第二圈）時保留 2 圈，線一定從實線出發；其他起點照「保留成實線的內圈數」。',
    pMorse: '保留的內圈以外，每一圈各自以這個機率變成摩斯環。',
    morseDot: '短點的長度；長點與間隔都以它為單位。',
    morseGaps: '間隔都是短點長度的倍數。',
    randomMorse: '沒有填文字時隨機排：每個字母 1～5 個符號。',
    morseWidth: '線寬的倍數。',
    morseShrink: '100%＝和線長、子圖形一樣每代乘上縮小率；0%＝每一代都一樣長。',
    morseText:
      '空白時隨機排。只有英文字母、數字與 . , ? / - ! @ 有摩斯電碼（大小寫、全形半形都可以）；中文、日文等其他字會略過，空白是單字間隔。',
    bridges:
      '相鄰的兩圈用徑向的短線連起來：外圈的長點連到內圈的實線圓，或連到內圈和它重疊的長點；每個字母最多一座。',
    code: '把種子（與設定）藏在圖形的樣子裡。匯出 PNG 之後，用「從圖片讀種子」就能讀回來、畫出同一張。',
    codeVersion:
      '新方式：同心圓的層數、花紋、長出的線都照資料選，看起來和一般的圖一樣。舊方式：外圈換成一段一段的弧（短＝0、長＝1），資料分散刻在好幾個圖形上。',
    codeSettings:
      '和預設不同的設定也刻進去；讀回來時連設定一起換。資料比較長，要比較多的圖形才刻得下。',
    codeUnit: '刻資料的弧的一個單位。太短（比刻種子的線寬的 2 倍短）時不容易讀出來。',
    codeScale: '子圖形的半徑乘上這個倍數，比較容易刻得下。',
    codeWidth: '刻資料的弧的線寬（線寬的倍數）。',
    v1Only: '以下是舊方式的設定。',
    codeMax: '越小資料分得越散（每個圖形刻一小段）；放得下全部時另看「放得下時刻全部」。',
    codeRootR: '中央的圖形至少這麼大（多刻一點）。',
  },
  avoidOverlap: '不和既有圖形重疊',
  overlapMode: '重疊時',
  overlapModes: {
    retry: '換角度重試',
    line: '只畫線',
    skip: '整條取消',
  } satisfies Record<OverlapMode, string>,
  lineAvoid: '線不穿過既有圖形',
  noCross: '線不跨過既有的線',
  inBounds: '收在畫布內',
  background: '背景色',
  transparent: '背景透明',
  lineColor: '線的顏色',
  accentColor: '強調色',
  fromEdge: '線從圖形的邊緣出發',
  shapeNames: {
    circle: '圓',
    rings: '同心圓',
    semi: '半圓',
    mix: '圓＋半圓',
    square: '正方形',
    doubleSquare: '雙正方形',
    triCore: '三角心',
    triRing: '三角環',
  } satisfies Record<ShapeToggle, string>,
  triRing: '三角環內接在',
  triRings: {
    first: '第一圈',
    second: '第二圈',
    random: '隨機',
  } satisfies Record<TriRing, string>,
  startRing: '放射線的起點',
  startRings: {
    ring1: '第一圈（最內層）',
    ring2: '第二圈',
    ring12: '第一或第二圈（隨機）',
    edge: '最外圈',
    center: '中心',
    any: '每條線隨機（實線的內圈）',
  } satisfies Record<StartRing, string>,
  endAtRing: '子圖形也接在同一圈',
  rootRings: '中央一定是同心圓',
  morse: '摩斯環',
  solidFollow: '實線的圈數跟著放射線的起點',
  morseRound: '短點畫成圓點',
  morseCap: '點線的兩端是圓的',
  morseText: '摩斯電碼的文字',
  morseTextPlaceholder: '例：SOS HELLO',
  morseAs: (code: string) => `排成：${code}`,
  morseSkipped: (chars: string) => `略過（沒有摩斯電碼）：${chars}`,
  morseNone: '沒有能轉成摩斯電碼的字，改成隨機排。',
  bridges: '摩斯橋',
  times: '倍',

  /* 把種子刻進圖形 */
  code: '把種子刻進圖形',
  codeVersion: '刻的方式',
  codeVersions: {
    v2: '新方式',
    v1: '舊方式',
  } satisfies Record<CodeVersion, string>,
  codeSettings: '設定也一起刻',
  codeConvert: '圓、圓＋半圓也換成刻資料的同心圓',
  codeWhole: '放得下時刻全部（只看那一個就讀得出來）',
  codeOrient: '圖形的方向也放 3 個位元',
  codeGuard: '線不經過刻了資料的圖形',
  codeFit: '放不下時放大中央的圖形',
  codeInfo: (c: BloomCodeInfo) => {
    const bytes = c.bits / 8 - 5;
    const head = `${c.version === 'v2' ? '新方式' : '舊方式'}：資料 ${c.bits} 個位元（${bytes} 位元組${c.settings ? '，含設定' : ''}）`;
    const body =
      c.version === 'v2'
        ? `刻在 ${c.carriers} 個同心圓上，選樣子用了 ${c.used} 個位元（線的方向 ${c.usedLine}、層數與方向 ${c.usedShape}、花紋 ${c.usedRing}）。`
        : `刻了資料的圖形 ${c.carriers} 個，刻了 ${c.used} 個位元（含重複）。`;
    const result = c.missing
      ? c.version === 'v2'
        ? `還差 ${c.missing} 個位元沒刻進去：增加圖形的最多數或子圖形的大小。`
        : `有 ${c.missing} 個位元沒刻到：增加圖形數、半徑，或縮短刻種子的短點。`
      : c.version === 'v2'
        ? '全部刻進去了（多的用種子的亂數補）。'
        : `全部刻進去了，每個位元至少刻了 ${c.minCover} 次。`;
    return { head, body, result, ok: !c.missing };
  },
  codeShortUnit: '刻種子的短點比刻種子的線寬的 2 倍還短，讀的時候可能讀不出來。',

  /* 從圖片讀種子 */
  decodeHint:
    '選一張用「把種子刻進圖形」匯出的 PNG（也可以拖進視窗或貼上），從整張圖找出刻了資料的圖形讀回種子。原作刻的圖也讀得出來。',
  decodeDrop: '選擇或拖放圖片',
  decodeButton: '選擇圖片…',
  decodeCurrent: '讀目前的圖',
  decodeCurrentHint: '把目前的設定畫成全尺寸的圖再讀（確認刻得進去、讀得出來）。',
  decodeTitle: '從圖片讀種子',
  decodeMode: '讀的方式',
  decodeModes: {
    auto: '自動（先新後舊）',
    v2: '只用新方式',
    v1: '只用舊方式',
  } satisfies Record<DecodeMode, string>,
  decodeClickHint: '漏掉的圖形，點它的中心就會加進去再讀一次。',
  decodeImageLabel: '讀的圖（點一下加上漏掉的圖形的中心）',
  decoding: '讀取中…',
  decodeFailedLoad: '讀不了這張圖，請用 PNG、JPEG 或 WebP。',
  decodeFellBack: '（新方式讀不出來，改用舊方式）',
  decodeV2Found: (found: number, read: number) =>
    `新方式：找到同心圓 ${found} 個，循線讀到 ${read} 個。`,
  decodeV2Bits: (bits: number, unit: number, ms: number) =>
    `讀到 ${bits} 個位元，推算的短點 ${unit.toFixed(1)} px（${Math.round(ms)} ms）。`,
  decodeV2None: '新方式：找不到刻了資料的同心圓。',
  decodeV2Pattern: '新方式：中央的同心圓的花紋讀不出來。',
  decodeV2Fail: '新方式讀不出來（從中央的圖形循線讀不下去，或檢查碼不合）。請用沒有裁切的整張圖。',
  decodeV1Found: (cands: number, found: number, chunks: number) =>
    `舊方式：候選 ${cands} 點 → 像刻了資料的圖形 ${found} 個，讀出的斷片 ${chunks} 個。`,
  decodeV1Ranges: (ranges: string) => `讀到的範圍（位元）：${ranges || '沒有'}`,
  decodeV1Assembled: (bits: number, need: number | null) =>
    `從頭連續組好的：${bits} 個位元${need ? `／需要 ${need}` : ''}`,
  decodeV1NoHead:
    '斷片讀得出來，但沒有資料開頭（第 0 個位元起）的圖形：資料分散刻在好幾個圖形上，請用沒有裁切的整張圖。',
  decodeV1Short: '斷片不夠。請用整張圖，或點漏掉的圖形的中心。',
  decodeV1Fail: '讀不出來：找不到刻了資料的圖形，或檢查碼不合（讀不出的圖形標成紅色）。',
  decodeOk: '讀出來了',
  decodeSeed: (seed: string) => `種子：${seed}`,
  decodeSettings: (n: number) =>
    n ? `設定：${n} 項（重畫時一起換）` : '設定：沒有（用目前的設定重畫）',
  decodeApply: '用這個種子重畫',
  decodeApplied: (seed: string) => `已換成讀出的種子「${seed}」（固定種子）。`,
  close: '關閉',
  dropLabel: '放開即可讀種子',
  dropHint: 'PNG、JPEG、WebP',

  /* 匯出 */
  formatPng: 'PNG',
  formatPngDesc: '寬 × 高的圖片（全尺寸），可以透明背景。',
  formatSvg: 'SVG',
  formatSvgDesc: '向量檔：放大不會糊，可以再用向量軟體編輯。',
  exportTime: '匯出時間',
  sizeWarningHint: '可以縮小畫布，或改匯出 SVG。',
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)} 秒`,
  deviceLimit: (w: number, h: number) =>
    `${w} × ${h} 超過這台裝置的瀏覽器能畫的大小（約 1,670 萬像素），匯出的 PNG 可能是空白的，請縮小畫布或換電腦匯出。`,

  /* 頁首、專案 */
  undo: '復原',
  redo: '重做',
  keysGroup: '編輯',
  generateGroup: '花紋',
  projectName: '幾何花紋',
  resetLabel: '全部重設',
  resetTitle: '全部重設？',
  resetDescription: '所有設定會回到預設值，並換一個新的種子。之後還可以按「復原」取回。',
  usage: [
    '按「產生」（或空白鍵）換一個種子，畫出新的花紋；同一個種子、同樣的設定一定畫出同一張。',
    '改任何設定都會用同一個種子立刻重畫；想保留喜歡的構圖，就打開「固定種子」再慢慢調。',
    '從「範本」挑一組設定開始最快：星座、魔法陣、科幻介面……之後再自己調。',
    '「同心圓」與「摩斯環」決定同心圓的樣子：線從哪一圈出發、外圈的點線（可以填自己的英文字，排成摩斯電碼）、相鄰兩圈之間的摩斯橋。中央的同心圓會依種子換樣子（三角形、中心的大小、長出三條線）。',
    '「重疊」的設定決定圖形會不會擠在一起、線會不會交叉；「收在畫布內」可以讓整個花紋留在畫面裡。',
    '「把種子刻進圖形」把種子（與設定）藏在圖形的樣子裡；匯出的 PNG 用「從圖片讀種子」（或直接拖進視窗）就能讀回來、畫出同一張，原作刻的圖也讀得出來。',
    '匯出 PNG（可以透明背景）或 SVG（向量，放大不會糊）。很大的畫布（例如 8000 × 8000）預覽會縮小顯示，匯出時才畫全尺寸，要等幾秒。',
    '設定與種子會自動存在這個瀏覽器；「專案」選單可以存成專案檔，換電腦也能畫出同一張。',
  ],
} as const;
