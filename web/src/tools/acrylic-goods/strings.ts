/**
 * 壓克力周邊工房的介面文字（繁中；用詞照 DESIGN.md 第 5 節）。原作 MIT，說明參考舊版的繁中譯文改寫。
 */
import type { Kind } from './model';
import type { BuildError } from './scene';

const S_KINDS: Record<Kind, string> = {
  stand: '壓克力立牌',
  shaker: '壓克力搖搖樂',
  diorama: '壓克力立體透視',
};

export const S = {
  usage: [
    '先選要做哪一種周邊：壓克力立牌、搖搖樂或立體透視，再放進去背的圖（透明的地方不會變成壓克力）。',
    '調整壓克力的厚度、外框留白、表面質感與打光，預覽會立刻更新。在預覽上拖曳可以轉動鏡頭、滾輪縮放。',
    '搖搖樂：快速拖曳預覽畫面或按「搖一搖」，裡面的零件就會倒來倒去；手機可以開陀螺儀，用傾斜的。',
    '匯出：立牌與立體透視轉一圈、搖搖樂左右搖晃，存成 APNG、GIF 或 WebP；也可以存目前的畫面（PNG）或 3D 模型（GLB）。',
  ],
  about: '所有處理都在瀏覽器裡進行，圖片不會上傳。設定與圖片會自動儲存在這個瀏覽器。',

  undo: '復原',
  redo: '重做',
  kindsAria: '周邊種類',
  kinds: S_KINDS,
  kindsShort: { stand: '立牌', shaker: '搖搖樂', diorama: '立體透視' },

  image: {
    pick: '選擇圖片',
    replace: '換一張',
    remove: '移除',
    drop: '把圖片拖到這裡',
    dropHint: '去背的 PNG（也可以用 WebP、GIF、JPG）',
    empty: '還沒有圖',
    unnamed: '放進來的圖片',
    loading: '讀取中…',
    missing: '讀不到這張圖',
    notImage: (name: string) => `「${name}」不是可以讀取的圖片。`,
    notSaved:
      '圖片沒辦法儲存在這個瀏覽器（空間不足或被封鎖），重新整理後就會不見；請記得存成專案檔。',
  },

  stand: {
    images: '圖片',
    front: '正面圖',
    back: '背面圖（可省略）',
    backHint: '沒有背面圖時，從背面看到的是正面圖透過壓克力（左右相反）的樣子。',
    outline: '外框',
    outlines: { unified: '用正面的外框', separate: '正反面各自算' },
    outlineHint: '正反面各自算：背面圖用自己的外框，轉到背面時換成背面那一塊。',
    base: '底座',
    baseOn: '加底座',
    baseOnHint: '關掉時只有立牌本身，沒有底座。',
    shape: '形狀',
    shapes: { circle: '圓形', square: '方形', contour: '依圖形狀' },
    contourHint: '依底面圖的外框做底座；沒有底面圖時是方形。',
    size: '大小',
    baseImage: '底面圖（可省略）',
    baseImageHint: '印在底座上面。圓形、方形時縮放到底座的大小。',
  },

  shaker: {
    lead: '用滑鼠或手指快速拖曳預覽畫面，或把手機傾斜，裡面的零件就會倒來倒去。',
    frame: '外框',
    frameShape: '外框形狀',
    frameShapes: { circle: '圓形', square: '方形', image: '依圖片' },
    frameImage: '背景圖',
    frameImageHint: '依這張圖的外框做搖搖樂，圖印在背板上。',
    frameSize: '外框大小',
    padding: '內部留白',
    paddingHint: '零件能活動的範圍＝外框 × 這個比例。數字越小，零件越不會跑出去。',
    parts: '零件',
    addPart: '加零件',
    partsEmpty: '還沒有零件。按「加零件」放進至少一張圖。',
    partsAria: '搖搖樂裡的零件',
    partName: (i: number) => `零件 ${i}`,
    image: '零件圖',
    qty: '數量',
    qtyUnit: '個',
    scale: '大小',
    remove: (name: string) => `刪除${name}`,
    dragHint: '拖曳左邊的把手可以調整順序（Alt＋↑／↓ 也可以）。',
    gyro: '陀螺儀',
    gyroButton: '開啟陀螺儀（手機）',
    gyroHint: '全螢幕顯示搖搖樂，傾斜手機零件就會跟著倒。iPhone 要允許「動作與方向」的存取。',
    exitGyro: '回到編輯畫面',
    kick: '搖一搖',
    kickHint: '左右甩一下（鍵盤：預覽有焦點時按空白鍵）',
  },

  diorama: {
    overall: '整體',
    baseMargin: '底座邊距',
    baseMarginHint: '底座＝依圖層自動算出的大小＋四周這麼多的邊距。',
    gap: '圖層間距',
    gapHint: '前後兩片壓克力之間的距離。',
    layers: '圖層',
    addLayer: '加圖層',
    layersEmpty: '還沒有圖層。按「加圖層」放進至少一張圖。',
    layersAria: '立體透視的圖層',
    layerName: (i: number) => `圖層 ${i}`,
    order:
      '清單最上面的圖層在最前面（靠近鏡頭），往下依序往後排。拖曳左邊的把手可以調整順序（Alt＋↑／↓ 也可以）。',
    x: '左右位置',
    y: '上下位置',
    rotation: '水平旋轉',
    rotateLeft: '−90°',
    rotateRight: '+90°',
    remove: (name: string) => `刪除${name}`,
  },

  material: {
    title: '壓克力',
    thickness: '厚度',
    margin: '外框留白',
    marginHint: '圖的邊緣往外留多少壓克力。',
    finish: '表面質感',
    finishes: { glossy: '亮面', matte: '霧面' },
    finishHint: '亮面：圖會受打光影響、有反光；霧面：圖保持原色。',
  },

  light: {
    title: '打光',
    reset: '重設',
    resetLabel: '打光回到預設值',
    direction: '光源方向',
    directionHint: '拖曳圓盤上的點（或用方向鍵）改變主光照過來的方向；往下是從前方照。',
    directionText: (x: number, y: number) =>
      `${x < -0.05 ? '偏左' : x > 0.05 ? '偏右' : '正中'} ${Math.abs(x).toFixed(2)}、${y < -0.05 ? '偏後' : y > 0.05 ? '偏前' : '正中'} ${Math.abs(y).toFixed(2)}`,
    key: '主光（立體感）',
    ambient: '環境光（陰影亮度）',
  },

  bg: {
    title: '背景',
    color: '背景色',
    transparent: '透明背景',
    hint: '預覽與匯出的底色。透明背景時 GIF 的半透明處（例如沒有圖的壓克力）會變成全透明。',
  },

  view: {
    aria: '3D 預覽',
    canvas: '3D 預覽：拖曳轉動鏡頭、滾輪縮放；有焦點時方向鍵轉動、＋／− 縮放、Home 重設鏡頭',
    resetCamera: '重設鏡頭',
    rebuild: '重新產生',
    rebuildHint: '重新組一次（搖搖樂的零件重新放進去），並重設鏡頭',
    spin: '自動旋轉',
    spinOff: '不轉',
    /** 產生（讀圖、組場景）中的遮罩：依種類（同舊版） */
    building: (kind: Kind) => `產生${S_KINDS[kind]}中…`,
    exporting: '匯出中…',
  },

  err: {
    needFront: '請先選一張正面圖。',
    needFrame: '請先放一張搖搖樂的背景圖。',
    needPart: '至少要加一張零件圖。',
    needLayer: '至少要加一張圖層圖片。',
    outline: '抓不出外框（圖片可能整張都是透明的）。',
    outlineBack: '抓不出背面圖的外框（圖片可能整張都是透明的）。',
    outlineFrame: '抓不出背景外框的輪廓（圖片可能整張都是透明的）。',
    loading: '讀取圖片中…',
    missing: '有圖片讀不到（可能已從這個瀏覽器清除），請重新選擇。',
  } satisfies Record<BuildError, string>,

  gyro: {
    denied: '陀螺儀的存取被拒絕了。請到瀏覽器設定裡允許權限。',
    noRequest: '沒辦法請求陀螺儀權限。這個功能只在 HTTPS 環境下能用。',
    unsupported: '這台裝置沒有陀螺儀感測器。',
  },

  exp: {
    title: '匯出動圖',
    lead: {
      spin: (sec: string) =>
        `轉一圈（${sec} 秒）。自動旋轉速度越快，一圈越短；不轉時以速度 4 計算。`,
      shake: '左右搖晃 4.5 秒，零件跟著倒來倒去。',
    },
    camera: '用目前的鏡頭角度、背景與打光；動圖從正面開始轉。',
    png: 'PNG（目前畫面）',
    pngHint: '目前預覽看到的樣子（含目前的角度）。',
    formats: {
      apng: 'APNG',
      gif: 'GIF',
      webp: 'WebP',
      png: 'PNG',
    },
    fileBase: 'acrylic-animated',
    stillBase: 'acrylic-goods',
    progress: (done: number, total: number) => `擷取影格 ${done}／${total}`,
    details: {
      frames: '影格',
      kind: '動作',
    },
    kinds: { spin: '轉一圈', shake: '左右搖晃' },
    budget: '處理量太大（寬 × 高 × 影格數超過 2.2 億），請降低尺寸或 FPS。',
    glbTitle: '3D 模型（GLB）',
    glbLead:
      '存成 GLB，可以放進 Blender、網頁的 3D 檢視器或支援 glTF 的軟體。包含目前的角度與零件位置；正反面各自算時只有目前看得到的那一面。',
    glbButton: '匯出 GLB',
    glbDone: (name: string, size: string) => `已匯出 ${name}（${size}）`,
    glbFailed: (msg: string) => `GLB 匯出失敗：${msg}`,
    noBuild: '目前沒有可以匯出的周邊。',
    exported: (label: string) => `已匯出 ${label}`,
    cancelled: '已取消匯出。',
  },

  project: {
    resetTitle: '全部重來？',
    resetText: '三種周邊的設定、零件與圖層都會回到示範的內容，放進來的圖片也會從這個瀏覽器刪除。',
    invalid: '這個專案檔的內容不對，沒辦法開啟。',
    newer: '這個專案檔是較新版本的工具存的，請重新整理頁面再試一次。',
    missing: (n: number) => `有 ${n} 張圖片不在專案檔裡，已經拿掉。`,
    notSaved:
      '專案檔裡的圖片沒辦法儲存在這個瀏覽器（空間不足或被封鎖），重新整理後就會不見（要再開一次專案檔）。',
    settingsNotSaved:
      '設定沒辦法儲存在這個瀏覽器（空間不足或被封鎖），重新整理後會回到預設值；請記得存成專案檔。',
  },

  keys: {
    edit: '編輯',
    view: '預覽',
    undo: '復原',
    redo: '重做',
    resetCamera: '重設鏡頭',
    rebuild: '重新產生',
    kick: '搖一搖（搖搖樂，預覽有焦點時）',
    orbit: '轉動鏡頭（預覽有焦點時）',
    zoom: '拉近／拉遠（預覽有焦點時）',
  },

  demoLabels: {
    hero: '示範：冒險者',
    'hero-back': '示範：冒險者（背面）',
    'hero-small': '示範：冒險者',
    star: '示範：星星',
    heart: '示範：愛心',
    d20: '示範：二十面骰',
    moon: '示範：月亮',
    castle: '示範：城堡夜景',
    forest: '示範：樹林',
  } as Record<string, string>,
};
