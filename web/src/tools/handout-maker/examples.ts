/**
 * 範例（本站自己寫的；事件、人名、地名都是虛構的）：每個主題一個。
 * 套用時只換文字、主題與版面設定；圖片不動。
 */
import {
  type Align,
  blankHandout,
  DEFAULT_EXTRAS,
  type Extras,
  type Handout,
  type StampId,
  type TextureId,
  THEME_IDS,
  type ThemeId,
} from './model';

export interface Example {
  theme: ThemeId;
  title: string;
  body: string;
  stamp?: StampId;
  align?: Align;
  texture?: TextureId;
  fontSize?: number;
  width?: number;
  height?: number;
  snap?: boolean;
  extra?: Partial<Extras>;
}

export const EXAMPLES: Record<ThemeId, Example> = {
  basic: {
    theme: 'basic',
    title: '線索一：停在三點十七分的懷錶',
    body:
      '在書房抽屜的最深處找到一只懷錶，指針停在 3 點 17 分。\n' +
      '錶蓋內側刻著「致 ||H. L.||，永不分離」。\n' +
      '錶鏈上沾著還沒乾透的紅土——宅邸附近只有後山才有這種土。',
    stamp: 'investigating',
  },
  memo: {
    theme: 'memo',
    title: '給值夜班的人',
    body:
      '如果聽到三樓走廊有敲門聲，\n' +
      '||不要回應，也不要開門。||\n' +
      '天亮之前一切都會恢復原狀。\n' +
      '\n' +
      '—— 前任管理員 留',
    stamp: 'danger',
    texture: 'ruled',
    fontSize: 16,
  },
  sticky: {
    theme: 'sticky',
    title: '別忘了！',
    body: '週四晚上九點\n舊港 7 號倉庫\n帶上 ||那把銅鑰匙||\n不要告訴阿德',
    stamp: 'important',
    fontSize: 18,
    width: 336,
    height: 336,
    snap: true,
  },
  polaroid: {
    theme: 'polaroid',
    title: '1923・夏・鹿鳴湖',
    body: '大家都到齊了，\n除了 ||拿著相機的那個人||。',
    fontSize: 16,
    width: 360,
    height: 456,
    snap: true,
  },
  newspaper: {
    theme: 'newspaper',
    title: '東區漁工接連失蹤　警方束手無策',
    body:
      '【本報訊】霧港東區近一個月內已有三名漁工在夜間下落不明，最後一次被人看見都是在凌晨的第三號碼頭。' +
      '警方表示目前 ||尚無任何線索||，呼籲民眾夜間不要單獨前往碼頭一帶。\n' +
      '據附近居民描述，事發前後數晚，海面上都曾出現微弱的綠光，並伴隨低沉的鐘聲。' +
      '漁會理事長陳海生受訪時神情凝重，只說「那是老一輩人才記得的事」，便不願再多談。\n' +
      '本報將持續追蹤此事。',
    align: 'justify',
    texture: 'noise',
    fontSize: 14,
    width: 600,
    height: 720,
    snap: true,
    extra: { masthead: '霧港日報', dateline: '民國十七年五月三日　星期四　號外' },
  },
  wanted: {
    theme: 'wanted',
    title: '「黑帽」陳九',
    body:
      '涉嫌在霧港碼頭縱火，並竊取博物館館藏。\n' +
      '身高約五尺八寸，左頰有一道刀疤。\n' +
      '提供線索者，賞金 ||大洋五百元||。\n' +
      '—— 霧港警察局',
    stamp: 'danger',
    texture: 'parchment',
    extra: { heading: '懸賞通緝' },
  },
  window: {
    theme: 'window',
    title: '觀察紀錄_第七天.txt',
    body:
      '第七天。\n' +
      '實驗體 ||K-03|| 的反應越來越強烈，今天它第一次對著鏡子說話。\n' +
      '我不確定還能瞞住所長多久。\n' +
      '如果有人看到這份紀錄，請立刻離開研究所。',
    stamp: 'locked',
  },
  status: {
    theme: 'status',
    title: '隱藏任務解鎖',
    body:
      '條件達成：在午夜前抵達鐘樓。\n' +
      '獎勵：？？？\n' +
      '失敗的懲罰：||SAN 值 −1D6||\n' +
      '剩餘時間：00:59:59',
    stamp: 'question',
    fontSize: 16,
    extra: { label: '【系統通知】' },
  },
  terminal: {
    theme: 'terminal',
    title: 'logs/0413.txt',
    body:
      'ACCESS GRANTED\n' +
      '正在讀取觀測紀錄……\n' +
      '04/13 02:14　第三號感測器偵測到異常訊號\n' +
      '04/13 02:15　訊號來源：||地下二樓||\n' +
      '04/13 02:16　連線中斷',
    stamp: 'hidden',
    extra: { prompt: 'kp@archive' },
  },
  sms: {
    theme: 'sms',
    title: '',
    body:
      '你到了嗎？\n' +
      '||剛到，門是開著的||\n' +
      '不要進去\n' +
      '我是說真的，不要進去\n' +
      '||為什麼？||\n' +
      '那間屋子三年前就拆掉了',
    fontSize: 15,
    width: 360,
    height: 624,
    snap: true,
    extra: { contact: '阿凱' },
  },
  email: {
    theme: 'email',
    title: 'Re: 關於上週的田野調查',
    body:
      '各位：\n' +
      '錄音檔我聽完了。第 42 分鐘那一段，大家應該都聽到了吧？\n' +
      '那不是我們任何一個人的聲音。\n' +
      '我已經把檔案交給 ||王教授||，在他回覆之前，請不要再去 ||後山的廟||。\n' +
      '\n' +
      '雅婷',
    stamp: 'important',
    width: 480,
    height: 528,
    extra: { from: '林雅婷', to: '民俗研究室全體', date: '1998/11/02 23:47' },
  },
};

/** 範例的清單（照主題的順序） */
export const EXAMPLE_LIST: readonly Example[] = THEME_IDS.map((t) => EXAMPLES[t]);

/**
 * 範例套到一張上（id 與圖片保留；其他欄位照範例，沒寫的用主題的預設）。
 */
export function applyExample(base: Handout, ex: Example): Handout {
  const blank = blankHandout(ex.theme, base.id);
  return {
    ...blank,
    title: ex.title,
    body: ex.body,
    stamp: ex.stamp ?? 'none',
    align: ex.align ?? 'left',
    texture: ex.texture ?? 'none',
    fontSize: ex.fontSize ?? blank.fontSize,
    width: ex.width ?? blank.width,
    height: ex.height ?? blank.height,
    snap: ex.snap ?? false,
    extra: { ...DEFAULT_EXTRAS, ...ex.extra },
    image: base.image,
    imageSize: base.imageSize,
    imageFilter: base.imageFilter,
    bg: { ...base.bg },
  };
}

/** 範例做成新的一張 */
export const exampleHandout = (ex: Example, id?: string): Handout =>
  applyExample({ ...blankHandout(ex.theme, id) }, ex);
