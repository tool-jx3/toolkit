/** 排行榜產生器的介面文字與圖上的文字（繁中；用詞照 DESIGN.md 第 5 節） */
import type { FormatId, Phase, SpinMs, ThemeId, ThemeKey } from './model';
import { MAX_POOL, pad2 } from './model';

export type TabId = 'topic' | 'pool' | 'rules';

/** 畫在圖上的文字 */
export const RENDER = {
  brand: 'BLIND RANKING',
  pill: (n: number, k: number) => `${n} 人中選 ${k} 人`,
  pillDone: 'MY FINAL RANKING',
  myRanking: 'MY RANKING',
  progress: (filled: number, k: number) => `${pad2(filled)} / ${pad2(k)}`,
  slots: (k: number) => `${k} SLOTS`,
  ranker: 'THE RANKER',
  nextPick: 'THE NEXT PICK',
  noSpoilers: 'NO SPOILERS',
  me: '我',
  portraitSub: (done: boolean) => (done ? '我的選擇，我的排名。' : '下一位還是祕密。'),
  cue: (phase: Phase | null) =>
    phase === 'complete'
      ? '我的第 1 名'
      : phase === 'spinning'
        ? '會抽到誰呢？'
        : phase === 'revealed'
          ? '要排第幾名？'
          : phase === 'between'
            ? '名次確定！'
            : 'YOUR NEXT PICK',
  cardMark: (spinning: boolean) => (spinning ? '···' : '?'),
  cardFoot: 'NEXT PICK',
  cardLabel: (spinning: boolean) => (spinning ? '抽選中…' : '會是哪個角色呢？'),
  rowSelected: '確定放這一名？',
  rowActive: '放在這裡',
  rowEmpty: '空著的名次',
  takeBacks: 'NO TAKE-BACKS.',
  takeBacksSub: '一次決定，排名不能改。',
  order: (names: string[]) => `出場順序：${names.join(' > ')}`,
  footDone: '我決定的排名 · 全部確定',
  footIdle: '隨機順序 · 不重複 · 確定後不能更改',
  missingTitle: (n: number) => `這次沒遇到的 ${n} 位`,
  missingSub: '沒有出場，所以沒有排名。',
} as const;

export const S = {
  tabsLabel: '設定步驟',
  tabs: {
    topic: { n: '01', label: '主題與排名者' },
    pool: { n: '02', label: '角色名單' },
    rules: { n: '03', label: '規則與外觀' },
  } satisfies Record<TabId, { n: string; label: string }>,
  next: (label: string) => `下一步：${label}`,

  /* ---- 01 主題與排名者 ---- */
  topicTitle: '標題',
  name: '排名的人',
  nameHint: '放進標題的名字（最多 30 字）。',
  intro: '名字後面的文字',
  introHint: '接在名字後面，例如「的盲選排行」「出題」。英數字和中文之間會自動加空格。',
  subject: '主題（對象、作品、團體）',
  subjectHint: '例如「○○ 劇本的 NPC」（最多 80 字）。',
  question: '最後的問題',
  questionHint: '例如「能交往嗎？」「想跟誰組隊？」（可以空白）。',
  titlePreview: '標題預覽',
  portraitTitle: '排名者的照片',
  portraitOptional: '可以不放',
  portraitNone: '還沒有照片。沒有照片也能直接開始。',
  portraitPick: '放照片',
  portraitReplace: '換照片',
  portraitRemove: '移除照片',
  portraitAdded: '照片放好了。在預覽上拖曳卡片放到想要的位置，右下角的控點可以改大小。',
  placementOn: '擺放照片與卡片',
  placementOff: '擺放完成',
  placementHint:
    '在預覽上拖曳卡片移動、拖右下角的控點改大小；拖卡片以外的照片可以調整照片的位置。也可以用下面的滑桿。',
  fit: '照片的擺法',
  fits: { cover: '填滿', contain: '完整顯示' },
  photoZoom: '照片放大',
  photoX: '照片左右位置',
  photoY: '照片上下位置',
  cardX: '卡片橫向位置',
  cardY: '卡片縱向位置',
  resetPlacement: '重設擺放',
  cardSize: '抽選卡片大小',
  cardSizeHint: '20～90%，有沒有照片都適用。開始之後就不能改。',
  cardSizeInfo: (s: number, limited: boolean) =>
    `圖片 ${s} × ${s} px${limited ? ' · 配合畫面高度縮小了' : ''}`,
  cardSizeReset: '預設大小',
  ratioNote: '換圖片比例時，照片露出的範圍也會變；用了照片的話最後再確認一次卡片的位置。',

  /* ---- 02 角色名單 ---- */
  poolTitle: '角色名單',
  poolCount: (n: number) => `${n} 位`,
  poolLead: '只寫名字也可以。照片會裁成正方形，之後可以再調整。',
  addName: '新增名字',
  pasteNames: '一次輸入名字',
  dropLabel: '加入角色照片',
  dropButton: '選擇照片',
  dropHint: '可以一次選很多張；檔名會當成角色名稱。',
  windowDrop: '放開即可加進角色名單',
  windowDropHint: '檔名會當成角色名稱。',
  listAria: '角色名單',
  empty: '還沒有角色，請新增名字或加入照片。',
  charNameAria: (i: number) => `第 ${i + 1} 位的名稱`,
  charPlaceholder: '角色名稱',
  defaultName: (n: number) => `角色 ${n}`,
  fallbackName: '角色',
  subPhoto: '照片 · 512 × 512',
  subCard: '名字卡 · 可以加照片',
  addPhoto: '加照片',
  crop: '調整裁切',
  replacePhoto: '換照片',
  removePhoto: '移除照片',
  remove: '刪除',
  actionAria: (action: string, name: string) => `${action}：${name || '（沒有名稱）'}`,
  missingPhoto: '照片讀不到了（可能已從這個瀏覽器清除），請重新加照片。',
  poolStat: (n: number) => `${n} / ${MAX_POOL} 位 · 照片可以重新裁切或更換。`,
  demo: '換成範例名單',
  demoTitle: '換成範例名單？',
  demoText: '目前的名單會換成 10 位範例角色；標題與排名者的設定不變。（可以復原）',
  demoConfirm: '換成範例',
  clear: '全部清空',
  clearTitle: '清空角色名單？',
  clearText: '所有角色的名字與照片都會刪除；標題與排名者的設定不變。（可以復原）',
  clearConfirm: '全部清空',
  namesTitle: '一次輸入名字',
  namesHint: (left: number) =>
    `一行一位，加在目前名單的後面。最多 ${MAX_POOL} 位，還可以加 ${left} 位。`,
  namesLabel: '名字（一行一位）',
  namesPlaceholder: '承恩\n語晴\n宥廷',
  namesApply: '加入',
  cancel: '取消',
  cropTitle: (name: string) => `裁切：${name || '（沒有名稱）'}`,
  cropApply: '套用',
  cropPreview: '裁切結果',
  cropHint: '拖曳框或四角調整範圍；存成 512 × 512 的正方形。',

  /* ---- 03 規則與外觀 ---- */
  rulesTitle: '規則',
  rulesLead: '不知道下一位是誰，才好玩。',
  slots: '名次格數',
  slotsHint: '1～20 格，不能超過角色人數。',
  selection: (n: number, k: number) =>
    n >= k
      ? `${n} 位中只會出場 ${k} 位。${n - k > 0 ? `其他 ${n - k} 位不會出現在排行榜上。` : '每位角色都會出場一次。'}`
      : '角色不夠，請增加角色或減少名次格數。',
  spinMs: '抽選演出時間',
  spinLabels: {
    1000: '快速 · 1 秒',
    1800: '基本 · 1.8 秒',
    2800: '心跳加速 · 2.8 秒',
    4000: '慢慢來 · 4 秒',
  } satisfies Record<SpinMs, string>,
  confirmRank: '確定名次前再確認一次',
  confirmRankHint: '選了名次之後，再按「確定」才放進去。',
  autoNext: '確定後自動抽下一位',
  reducedMotion: '不要快速切換圖片',
  reducedMotionHint: '抽選時不輪流換圖，時間到直接揭曉。',
  designTitle: '外觀',
  format: '圖片比例',
  formats: {
    '4:5': '4:5 · 基本海報（1080 × 1350）',
    '9:16': '9:16 · 直式限時動態（1080 × 1920）',
    '1:1': '1:1 · 正方形（1080 × 1080）',
  } satisfies Record<FormatId, string>,
  theme: '配色',
  themes: { cream: '奶油玫瑰', lilac: '丁香紫', midnight: '午夜', custom: '自訂' } satisfies Record<
    ThemeId,
    string
  >,
  colorsTitle: '自訂配色',
  colorsHint: '改任何一個顏色就會換成「自訂」配色。',
  colorLabels: {
    bg: '背景',
    paper: '紙張（卡片）',
    ink: '文字',
    muted: '次要文字',
    line: '線條',
    accent: '強調色',
    accentSoft: '強調底色',
    soft: '淡色底',
    photo: '照片底色',
    tag: '標籤底色',
    tagInk: '標籤文字',
  } satisfies Record<ThemeKey, string>,

  /* ---- 遊戲 ---- */
  playLabel: '遊戲',
  lockTitle: (done: boolean) => (done ? '所有名次都確定了。' : '確定的名次不能更改。'),
  lockText: '遊戲結束前設定都會鎖住。回到設定會清掉這一局。',
  backToSetup: '回到設定',
  backTitle: '回到設定？',
  backText: '這一局的抽選與確定的名次都會清掉。\n不能只改其中幾個名次。',
  backConfirm: '清掉並回到設定',
  heading: (phase: Phase | null) =>
    phase === 'complete'
      ? { title: '完成的排行榜', sub: 'MY FINAL RANKING' }
      : phase
        ? { title: '盲選排行', sub: 'NO TAKE-BACKS' }
        : { title: '排行榜預覽', sub: 'LIVE PREVIEW' },
  focusOn: '播放畫面',
  focusOff: '顯示設定',
  caption: '還沒出場的角色是祕密。名次一旦確定就不能改。',
  captionPlacement: '拖曳卡片：移動 · 右下角：大小 · 拖卡片以外的照片：調整照片',
  previewLabel: '排行榜預覽',
  sizeBadge: (h: number) => `1080 × ${h}`,
  hotspotsLabel: '名次',
  hotspot: (i: number) => `放在第 ${i + 1} 名`,
  placementLayer: '擺放照片與卡片',
  status: {
    eyebrowIdle: 'READY TO PICK',
    eyebrow: (turn: number, k: number) => `PICK ${pad2(Math.min(turn + 1, k))} / ${pad2(k)}`,
    eyebrowDone: 'EVERY PICK, LOCKED IN.',
    idle: '會抽到哪個角色呢？',
    idleHelp: (n: number, k: number) => `${n} 位中出場 ${k} 位 · 下一位是誰是祕密。`,
    start: '開始 →',
    spinning: '正在抽角色…',
    spinningHelp: '這次會排第幾名呢？',
    spinningAction: '抽選中…',
    revealed: (name: string) => `${name}，要排第幾名？`,
    revealedHelp: '點排行榜上空著的名次，或下方的名次按鈕。',
    choose: '請選擇名次',
    pending: (name: string, i: number) => `${name} → 放在第 ${i + 1} 名？`,
    pendingHelp: '確定之後不能移動、交換或取消。',
    commit: (i: number) => `確定為第 ${i + 1} 名`,
    between: (name: string) => `${name} 的名次確定了。`,
    betweenHelp: (filled: number, k: number) =>
      `已完成 ${filled} / ${k} 格 · 還要再抽 ${k - filled} 位。`,
    next: '抽下一位 →',
    nextAuto: '開始下一次抽選',
    done: '你的排行榜完成了！',
    doneHelp: (n: number, k: number) => `從 ${n} 位中抽出 ${k} 位，所有名次都確定了。`,
    download: '下載 PNG',
  },
  ranksLabel: '選擇名次',
  rankChoice: (i: number) => `第 ${i + 1} 名`,
  rankChoiceAria: (i: number, name: string | null) =>
    name ? `第 ${i + 1} 名：${name}（已確定）` : `選第 ${i + 1} 名`,
  orderTitle: '出場順序',
  orderWaiting: '等待第一位角色出場。',
  missingSummary: (n: number) => `這次沒有出場的 ${n} 位`,

  /* ---- 匯出 ---- */
  exportTitle: '下載排行榜',
  scale: '解析度',
  scales: { 1: '基本解析度', 2: '2 倍解析度' } as Record<1 | 2, string>,
  includeMissing: '附上沒出場的角色',
  downloadPng: '下載 PNG',
  downloadWebp: '下載 WebP',
  newGame: '同樣設定再玩一次',
  newGameTitle: '重新開始？',
  newGameText: '這一局會全部清掉，從同一份名單重新抽選。',
  newGameConfirm: '重新開始',
  fileName: (name: string, subject: string, ext: string) => `${name}_${subject}_排行榜.${ext}`,
  downloaded: (w: number, h: number, ext: string) =>
    `已下載 ${w} × ${h} px 的 ${ext.toUpperCase()}。`,
  exportFailed: '無法產生圖片，請改用基本解析度再試一次。',
  exportTooLarge: '圖片太大了，請改用基本解析度，或不要附上沒出場的角色。',
  webpFallback: '這個瀏覽器不能存 WebP，已改存成 PNG。',

  /* ---- 檢查與通知 ---- */
  problems: {
    name: '請輸入排名的人的名字。',
    subject: '請輸入主題（對象、作品或團體）。',
    empty: '請至少放進一位角色。',
    unnamed: '每位角色都要有名稱。',
    slots: '名次格數不能比角色人數多。',
  },
  filledToast: '已經確定的名次不能更改或交換。',
  poolFull: `角色最多 ${MAX_POOL} 位。`,
  poolLeft: (left: number) => `最多 ${MAX_POOL} 位，還可以再加 ${left} 位。`,
  namesEmpty: '請一行輸入一個名字。',
  namesAdded: (n: number) => `已加入 ${n} 位。`,
  photosAdded: (n: number) => `已加入 ${n} 張照片。需要時可以重新裁切。`,
  photoErrors: (list: string[], more: number) =>
    `${list.join('\n')}${more > 0 ? `\n另外還有 ${more} 張` : ''}`,
  photoErrorsTitle: '有些照片無法加入',
  notImage: (name: string) => `「${name}」不是圖片檔。`,
  tooBig: (name: string) => `「${name}」超過 25 MB，請換小一點的照片。`,
  tooManyPixels: (name: string) => `「${name}」的像素太多，請縮小長寬再試一次。`,
  decodeError: (name: string) => `無法讀取「${name}」，檔案可能已損壞。`,
  notPersisted: '瀏覽器空間不足或無法存檔：照片這次可以用，但重新整理後就沒了。請存成專案檔。',
  resumed: '接著上次的抽選與確定的名次繼續。',
  restoredDone: '已還原完成的排行榜。',
  runLost: '設定已還原，但存下來的遊戲讀不到，已準備新的一局。',
  saveFailed: '自動儲存失敗（瀏覽器空間不足或被封鎖），請存成專案檔。',
  photoMissing: '排名者的照片讀不到了（可能已從這個瀏覽器清除），請重新放照片。',

  /* ---- 專案檔 ---- */
  undo: '復原',
  redo: '重做',
  openConfirm: (running: boolean) => ({
    title: '開啟專案檔？',
    description: running
      ? '開啟專案檔會清掉這一局，目前的設定與名單也會被取代。'
      : '目前的設定與名單會被專案檔取代。（可以復原）',
    confirmLabel: '開啟',
  }),
  projectOpened: '已開啟專案檔，可以開始新的一局。',
  projectBad: '專案檔的內容無法使用。',
  projectMissing: (n: number) => `專案檔裡少了 ${n} 張照片，那些角色改成名字卡。`,
  projectNotPersisted:
    '瀏覽器空間不足或無法存檔：專案檔裡的照片這次可以用，但重新整理後就沒了（要再開一次專案檔）。',
  resetTitle: '重設？',
  resetDesc: '設定與名單回到預設（範例名單），這一局也會清掉。設定的部分可以復原。',
  legacyOpen: '開啟原作的設定檔（JSON）…',
  legacyConfirm: (running: boolean) => ({
    title: '開啟原作的設定檔？',
    description: running
      ? '會清掉這一局，目前的設定與名單也會被取代。'
      : '目前的設定與名單會被取代。（可以復原）',
    confirmLabel: '開啟',
  }),
  legacyOk: '已開啟原作的設定檔，可以開始新的一局。',
  legacyBad: '這不是原作存的第 1 版設定檔。',
  legacyJson: 'JSON 檔的內容格式錯誤。',
  legacyTooMany: `角色最多 ${MAX_POOL} 位，這個設定檔太多了。`,
  legacyImage: (i: number) =>
    i < 0 ? '排名者的照片資料無法讀取。' : `第 ${i + 1} 位角色的照片資料無法讀取。`,

  /* ---- 快捷鍵與說明 ---- */
  groupEdit: '編輯',
  usage: [
    '「主題與排名者」：寫好排名的人、主題與最後的問題；排名者的照片可以不放，放了可以把抽選卡片擺到喜歡的位置。',
    '「角色名單」：新增名字、一次輸入很多名字，或一次加入很多張照片（檔名當名稱）；照片會裁成正方形，可以重新裁切。',
    '「規則與外觀」：決定名次格數（例如 20 位中只排 10 名，就只會抽出 10 位）、抽選演出時間、圖片比例與配色。',
    '按「開始」：每次揭曉一位角色，點排行榜上空著的名次（或下方的名次按鈕）放進去。下一位是誰事先不知道，同一位不會出場兩次；確定之後不能移動、交換或刪除。',
    '全部確定後下載 PNG 或 WebP；可以選 2 倍解析度，或在圖的下方附上沒出場的角色。',
    '設定、名單與照片自動儲存在這個瀏覽器；遊戲進行中重新整理也會接著同一局。要換電腦時用「專案」存成專案檔（遊戲的名次不會存進去，請下載圖片）。',
  ],
} as const;

export const TAB_ORDER: readonly TabId[] = ['topic', 'pool', 'rules'];
