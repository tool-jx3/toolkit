/**
 * 範本的資料（本站自己做的；機構、店名、人名、數字都是虛構的）：
 * - 證件 7 款：欄位、預設文字、方向（直式／橫式）、預設的主題色與深淺色、編號的產生格式；
 * - 票券 5 款：欄位（含畫在票上的欄位名稱，可以改）、預設文字、尺寸。
 *
 * 證件的欄位值依「欄位代號」在各款之間共用（例如姓名改一次，每一款證件都換掉）；票券的欄位值每一款各自一份。
 * 規格：docs/refactor/specs/id-ticket.md 第 3.2、3.3 節。
 */

export type Orientation = 'portrait' | 'landscape';

export interface FieldDef {
  /** 欄位代號（存檔用；證件依代號共用） */
  key: string;
  /** 設定欄的標籤（預覽上欄位空白時也以它當淡色的提示） */
  label: string;
  /** 設定欄裡佔半寬（兩個並排） */
  half?: boolean;
  /** 下拉選單的選項（第一個空白選項＝不填） */
  options?: readonly string[];
  /**
   * 「重新產生」的格式：`#` 換成隨機數字（第一個 `#` 是 1～9），`{yyyy}` 換成今年。
   * 有這個欄位的旁邊有「重新產生」按鈕。
   */
  gen?: string;
  /** SF 證件：「重新產生」隨機的日期（YYYY-MM-DD，年份在這個範圍） */
  genDate?: readonly [number, number];
  /** 輸入欄的灰字 */
  placeholder?: string;
  /** 設定欄的說明 */
  hint?: string;
  /** 字數上限（預設 40） */
  max?: number;
  /** 票券：畫在票上的欄位名稱（可以在「欄位名稱」裡改） */
  caption?: string;
}

export const FIELD_MAX = 40;
/** QR code 的內容（每一款有 QR code 的證件與票券都有這一欄；留白＝用編號） */
export const QR_KEY = 'qr';
export const QR_MAX = 300;

/** QR code 的框：邊長、四周的白邊（設計單位／票券單位）；QR code 畫在框裡、白邊以內 */
export interface QrBox {
  size: number;
  pad: number;
}

const qrField = (hint: string): FieldDef => ({
  key: QR_KEY,
  label: 'QR code 內容',
  hint,
  max: QR_MAX,
  placeholder: '留白＝用編號',
});

const DATE = 'YYYY.MM.DD';

/* ======================================================================
 * 證件
 * ==================================================================== */

export const ID_TEMPLATE_IDS = [
  'employee',
  'highschool',
  'university',
  'press',
  'police',
  'member',
  'detective',
] as const;
export type IdTemplateId = (typeof ID_TEMPLATE_IDS)[number];

export interface IdTemplate {
  id: IdTemplateId;
  name: string;
  /** 範本清單的說明 */
  description: string;
  orientation: Orientation;
  /** 預設的主題色、深淺色 */
  color: string;
  dark: boolean;
  /** 背景用漸層（會員卡）：顯示「背景漸層」區塊 */
  gradient?: boolean;
  fields: readonly FieldDef[];
  /** 編號欄位（條碼、QR code 預設的內容） */
  codeKey: string;
  /** 編號空白時 QR code 用的文字 */
  qrFallback: string;
  /** QR code 的框（1920 年代的偵探執照沒有）；有沒有條碼（偵探執照沒有） */
  qr: QrBox | null;
  hasBarcode: boolean;
  /** 照片格的大小（設計單位；調整範圍的對話框用它的比例）；circle＝圓形照片 */
  photo: { w: number; h: number; circle?: boolean };
}

const NAME: FieldDef = { key: 'name', label: '姓名', half: true, max: 20 };
const NAME_EN: FieldDef = { key: 'nameEn', label: '英文姓名', half: true, max: 32 };

export const ID_TEMPLATES: readonly IdTemplate[] = [
  {
    id: 'employee',
    name: '員工證',
    description: '公司的識別證：部門、職稱、門禁權限。',
    orientation: 'portrait',
    color: '#2563eb',
    dark: false,
    codeKey: 'emp_no',
    photo: { w: 116, h: 150 },
    qrFallback: 'EMPLOYEE',
    qr: { size: 68, pad: 5 },
    hasBarcode: true,
    fields: [
      { key: 'emp_org', label: '公司名稱', max: 24 },
      { key: 'emp_orgEn', label: '英文名稱', max: 32 },
      NAME,
      NAME_EN,
      { key: 'emp_dept', label: '部門', half: true, max: 16 },
      { key: 'emp_title', label: '職稱', half: true, max: 16 },
      { key: 'emp_no', label: '員工編號', gen: 'AB-####', max: 24 },
      { key: 'emp_joined', label: '到職日', half: true, placeholder: DATE, max: 16 },
      { key: 'emp_expires', label: '有效期限', half: true, placeholder: DATE, max: 16 },
      {
        key: 'emp_access',
        label: '門禁權限',
        options: ['一般區域', '辦公區', '研發實驗室', '機密區域', '全區通行'],
      },
      qrField('背面的 QR code；留白時用員工編號。'),
    ],
  },
  {
    id: 'highschool',
    name: '高中學生證',
    description: '高中的學生證，背面有註冊章欄。',
    orientation: 'portrait',
    color: '#0f766e',
    dark: false,
    codeKey: 'hi_no',
    photo: { w: 104, h: 136 },
    qrFallback: 'STUDENT',
    qr: { size: 64, pad: 5 },
    hasBarcode: true,
    fields: [
      { key: 'hi_school', label: '學校名稱', max: 24 },
      { key: 'hi_schoolEn', label: '英文校名', max: 40 },
      NAME,
      { key: 'hi_class', label: '班級座號', half: true, max: 16 },
      { key: 'hi_no', label: '學號', gen: 'S11####', max: 20 },
      { key: 'hi_birth', label: '出生日期', half: true, placeholder: DATE, max: 16 },
      { key: 'hi_issued', label: '發證日期', half: true, placeholder: DATE, max: 16 },
      {
        key: 'hi_reg',
        label: '註冊章蓋到',
        options: ['一上', '一下', '二上', '二下', '三上', '三下'],
        hint: '背面的註冊章欄蓋到哪一學期（不選＝都還沒蓋）。',
      },
      qrField('背面的 QR code；留白時用學號。'),
    ],
  },
  {
    id: 'university',
    name: '大學學生證',
    description: '大學的學生證：系所、身分、圖書館與宿舍。',
    orientation: 'portrait',
    color: '#c08a2d',
    dark: true,
    codeKey: 'uni_no',
    photo: { w: 96, h: 126 },
    qrFallback: 'STUDENT',
    qr: { size: 64, pad: 5 },
    hasBarcode: true,
    fields: [
      { key: 'uni_name', label: '學校名稱', max: 20 },
      { key: 'uni_nameEn', label: '英文校名', max: 40 },
      { key: 'uni_dept', label: '系所', max: 24 },
      NAME,
      NAME_EN,
      { key: 'uni_no', label: '學號', gen: 'B1#######', max: 20 },
      {
        key: 'uni_degree',
        label: '身分',
        half: true,
        options: ['學士班', '碩士班', '博士班', '交換生', '進修部'],
      },
      { key: 'uni_year', label: '入學年度', half: true, max: 12 },
      {
        key: 'uni_lib',
        label: '圖書館',
        half: true,
        options: ['可借閱', '限館內閱覽', '停權中'],
      },
      { key: 'uni_dorm', label: '宿舍', half: true, options: ['住宿生', '通勤生'] },
      qrField('背面的 QR code；留白時用學號。'),
    ],
  },
  {
    id: 'press',
    name: '記者證',
    description: '媒體的採訪證：職稱、採訪路線。',
    orientation: 'portrait',
    color: '#dc2626',
    dark: false,
    codeKey: 'press_no',
    photo: { w: 110, h: 142 },
    qrFallback: 'PRESS',
    qr: { size: 72, pad: 5 },
    hasBarcode: true,
    fields: [
      { key: 'press_org', label: '媒體名稱', max: 20 },
      { key: 'press_orgEn', label: '英文名稱', max: 32 },
      NAME,
      NAME_EN,
      {
        key: 'press_role',
        label: '職稱',
        half: true,
        options: ['記者', '攝影記者', '編輯', '特約記者', '實習記者'],
      },
      { key: 'press_beat', label: '採訪路線', half: true, max: 16 },
      { key: 'press_no', label: '證號', gen: 'PR-##-####', max: 20 },
      { key: 'press_expires', label: '有效期限', placeholder: DATE, max: 16 },
      qrField('背面的 QR code；留白時用證號。'),
    ],
  },
  {
    id: 'police',
    name: '刑警證',
    description: '虛構的警察單位的服務證（橫式）。',
    orientation: 'landscape',
    color: '#1e3a8a',
    dark: true,
    codeKey: 'pol_no',
    photo: { w: 102, h: 134 },
    qrFallback: 'DETECTIVE',
    qr: { size: 92, pad: 6 },
    hasBarcode: true,
    fields: [
      { key: 'pol_unit', label: '單位', max: 20 },
      { key: 'pol_division', label: '隊別', max: 24 },
      NAME,
      {
        key: 'pol_rank',
        label: '職稱',
        half: true,
        options: ['偵查佐', '偵查員', '小隊長', '分隊長', '隊長'],
      },
      { key: 'pol_no', label: '證號', gen: 'MG-A-####', max: 20 },
      { key: 'pol_blood', label: '血型', half: true, options: ['A', 'B', 'O', 'AB'] },
      { key: 'pol_issued', label: '發證日期', half: true, placeholder: DATE, max: 16 },
      qrField('背面的 QR code；留白時用證號。'),
    ],
  },
  {
    id: 'member',
    name: '會員卡',
    description: '店家的會員卡（橫式、漸層底）：等級、點數。',
    orientation: 'landscape',
    color: '#be185d',
    dark: false,
    gradient: true,
    codeKey: 'mem_no',
    photo: { w: 76, h: 76, circle: true },
    qrFallback: 'MEMBER',
    qr: { size: 96, pad: 7 },
    hasBarcode: true,
    fields: [
      { key: 'mem_store', label: '店名', half: true, max: 16 },
      { key: 'mem_storeEn', label: '英文店名', half: true, max: 24 },
      NAME,
      {
        key: 'mem_tier',
        label: '會員等級',
        half: true,
        options: ['一般會員', '銀卡會員', '金卡會員', '黑卡會員'],
      },
      { key: 'mem_no', label: '會員編號', gen: '8801 #### ####', max: 20 },
      { key: 'mem_since', label: '入會日期', half: true, placeholder: DATE, max: 16 },
      { key: 'mem_expires', label: '有效期限', half: true, placeholder: DATE, max: 16 },
      { key: 'mem_points', label: '點數', half: true, max: 12 },
      qrField('背面的 QR code；留白時用會員編號。'),
    ],
  },
  {
    id: 'detective',
    name: '偵探執照（1920 年代）',
    description: 'CoC 經典年代的紙本執照：打字機字、指紋欄、印花。',
    orientation: 'portrait',
    color: '#7c4a1e',
    dark: false,
    codeKey: 'det_no',
    photo: { w: 100, h: 128 },
    qrFallback: '',
    qr: null,
    hasBarcode: false,
    fields: [
      { key: 'det_agency', label: '發照機關', max: 20 },
      { key: 'det_title', label: '執照名稱', max: 12 },
      NAME,
      NAME_EN,
      { key: 'det_no', label: '執照號碼', gen: 'No. 192#-####', max: 20 },
      { key: 'det_issued', label: '發照日期', half: true, placeholder: DATE, max: 16 },
      { key: 'det_expires', label: '有效期限', half: true, placeholder: DATE, max: 16 },
      { key: 'det_address', label: '事務所地址', max: 28 },
    ],
  },
];

/** 證件欄位的預設值（範例資料，全部虛構） */
export const ID_DEFAULTS: Readonly<Record<string, string>> = {
  name: '林若晴',
  nameEn: 'LIN JO-CHING',
  qr: '',
  emp_org: '辰星生技股份有限公司',
  emp_orgEn: 'ASTERIA BIOTECH',
  emp_dept: '研發三部',
  emp_title: '研究員',
  emp_no: 'AB-2047',
  emp_joined: '2023.07.01',
  emp_expires: '2027.06.30',
  emp_access: '研發實驗室',
  hi_school: '霧港市立海霧高級中學',
  hi_schoolEn: 'HAIWU SENIOR HIGH SCHOOL',
  hi_class: '二年忠班 17 號',
  hi_no: 'S112047',
  hi_birth: '2009.04.17',
  hi_issued: '2025.09.01',
  hi_reg: '二上',
  uni_name: '雲棲大學',
  uni_nameEn: 'YUNQI UNIVERSITY',
  uni_dept: '民俗與宗教學系',
  uni_no: 'B11204017',
  uni_degree: '學士班',
  uni_year: '2023',
  uni_lib: '可借閱',
  uni_dorm: '住宿生',
  press_org: '晨鐘日報',
  press_orgEn: 'MORNING BELL DAILY',
  press_role: '記者',
  press_beat: '社會新聞',
  press_no: 'PR-24-0817',
  press_expires: '2026.12.31',
  pol_unit: '霧港市警察局',
  pol_division: '刑事警察大隊 偵查二隊',
  pol_rank: '偵查員',
  pol_no: 'MG-A-3027',
  pol_blood: 'O',
  pol_issued: '2024.03.01',
  mem_store: '月見書房',
  mem_storeEn: 'MOONLIT BOOKS',
  mem_tier: '金卡會員',
  mem_no: '8801 2047 5566',
  mem_since: '2024.11.02',
  mem_expires: '2026.11.01',
  mem_points: '1,280 點',
  det_agency: '霧港市 執照審查處',
  det_title: '私家偵探執照',
  det_no: 'No. 1924-0317',
  det_issued: '1924.03.17',
  det_expires: '1925.03.16',
  det_address: '霧港市碼頭街 13 號',
};

/** 主題色的色票（本站挑的 12 色） */
export const ID_SWATCHES = [
  '#1f2329',
  '#4b5563',
  '#1e3a8a',
  '#2563eb',
  '#0f766e',
  '#16a34a',
  '#ca8a04',
  '#c08a2d',
  '#7c4a1e',
  '#dc2626',
  '#be185d',
  '#7c3aed',
] as const;

/** 會員卡背景漸層的預設組合（上、下） */
export const GRADIENT_PRESETS: readonly (readonly [string, string])[] = [
  ['#f9c6d8', '#fff3e0'],
  ['#f9c6d8', '#ffffff'],
  ['#c7d7fb', '#f3e8ff'],
  ['#bde5d6', '#fef9e7'],
  ['#fde1b0', '#ffd6d6'],
  ['#d9d4f7', '#c7ecf7'],
];

/* ======================================================================
 * 票券
 * ==================================================================== */

export const TICKET_TEMPLATE_IDS = ['movie', 'boarding', 'rail', 'hsr', 'receipt'] as const;
export type TicketTemplateId = (typeof TICKET_TEMPLATE_IDS)[number];

export interface TicketTemplate {
  id: TicketTemplateId;
  name: string;
  description: string;
  /** 票的寬（票券單位＝CSS px）；高由版面決定（收據依品項數） */
  width: number;
  /** 有沒有照片格 */
  photo: boolean;
  /** 照片格的寬高比（寬 ÷ 高） */
  photoAspect: number;
  fields: readonly FieldDef[];
  /** 條碼（或 QR code）用的編號欄位 */
  codeKey: string;
  /** QR code 的框（只有高鐵風格車票有） */
  qr: QrBox | null;
  /** 條碼區的左右（票券單位）與對齊（高鐵風格是 QR code，沒有條碼）；上下由版面決定 */
  barcode: { x: number; w: number; align: 'left' | 'center' | 'right' } | null;
  defaults: Readonly<Record<string, string>>;
}

export const TICKET_TEMPLATES: readonly TicketTemplate[] = [
  {
    id: 'movie',
    name: '電影票',
    description: '底片框的照片、片名、場次與座位，下方是可以撕的票根。',
    width: 346,
    photo: true,
    photoAspect: 4 / 5,
    codeKey: 'mv_code',
    qr: null,
    barcode: { x: 22, w: 302, align: 'right' },
    fields: [
      { key: 'mv_cinema', label: '戲院', half: true, max: 16 },
      { key: 'mv_no', label: '票號', half: true, gen: 'NO. ####', max: 16 },
      { key: 'mv_film', label: '底片字樣', max: 24 },
      { key: 'mv_kicker', label: '小標', max: 20 },
      { key: 'mv_title', label: '片名', max: 16 },
      { key: 'mv_sub', label: '副標', max: 28 },
      { key: 'mv_count', label: '入場人數', half: true, max: 3, caption: '人' },
      { key: 'mv_date', label: '日期', half: true, max: 12, caption: '日期' },
      { key: 'mv_time', label: '時間', half: true, max: 8, caption: '時間' },
      { key: 'mv_hall', label: '影廳', half: true, max: 10, caption: '影廳' },
      { key: 'mv_row', label: '排', half: true, max: 6, caption: '排' },
      { key: 'mv_seat', label: '座位', half: true, max: 10, caption: '座位' },
      { key: 'mv_price', label: '票價', half: true, max: 12, caption: '票價' },
      { key: 'mv_guest', label: '觀眾', max: 24, caption: '觀眾' },
      { key: 'mv_code', label: '條碼號碼', gen: '#### #### ####', max: 20 },
    ],
    defaults: {
      mv_cinema: '星光戲院',
      mv_no: 'NO. 0142',
      mv_film: 'CINEMA · 35MM',
      mv_kicker: '特別放映',
      mv_title: '霧港夜話',
      mv_sub: '午夜場・數位修復版',
      mv_count: '02',
      mv_date: '2026.10.31',
      mv_time: '23:30',
      mv_hall: '第 3 廳',
      mv_row: 'F',
      mv_seat: '12、13',
      mv_price: 'NT$560',
      mv_guest: '林若晴 & 陳以安',
      mv_code: '0142 2610 2330',
    },
  },
  {
    id: 'boarding',
    name: '登機證',
    description: '虛構航空公司的登機證：航線、旅客、登機門與座位，右邊是票根。',
    width: 800,
    photo: true,
    photoAspect: 3 / 4,
    codeKey: 'bp_seq',
    qr: null,
    barcode: { x: 28, w: 532, align: 'left' },
    fields: [
      { key: 'bp_airline', label: '航空公司', half: true, max: 16 },
      { key: 'bp_class', label: '艙等', half: true, max: 10 },
      { key: 'bp_from', label: '出發代碼', half: true, max: 4 },
      { key: 'bp_to', label: '抵達代碼', half: true, max: 4 },
      { key: 'bp_fromCity', label: '出發城市', half: true, max: 12 },
      { key: 'bp_toCity', label: '抵達城市', half: true, max: 12 },
      { key: 'bp_duration', label: '航程', max: 20 },
      { key: 'bp_pax', label: '旅客', max: 24, caption: '旅客' },
      { key: 'bp_flight', label: '航班', half: true, max: 8, caption: '航班' },
      { key: 'bp_date', label: '日期', half: true, max: 14, caption: '日期' },
      { key: 'bp_boards', label: '登機時間', half: true, max: 8, caption: '登機' },
      { key: 'bp_gate', label: '登機門', half: true, max: 6, caption: '登機門' },
      { key: 'bp_seat', label: '座位', half: true, max: 6, caption: '座位' },
      { key: 'bp_group', label: '組別', half: true, max: 4, caption: '組別' },
      { key: 'bp_seq', label: '序號', gen: 'SEQ ### · TKT ### #### ####', max: 32 },
      { key: 'bp_note', label: '備註', max: 28 },
    ],
    defaults: {
      bp_airline: '雲鵲航空',
      bp_class: '商務艙',
      bp_from: 'TPE',
      bp_to: 'HKD',
      bp_fromCity: '台北',
      bp_toCity: '函館',
      bp_duration: '3 小時 40 分・直飛',
      bp_pax: 'LIN / JO-CHING',
      bp_flight: 'CW207',
      bp_date: '31 OCT 2026',
      bp_boards: '07:45',
      bp_gate: 'B6',
      bp_seat: '12A',
      bp_group: '2',
      bp_seq: 'SEQ 017 · TKT 297 2610 3107',
      bp_note: '登機門於起飛前 20 分鐘關閉',
    },
  },
  {
    id: 'rail',
    name: '台鐵風格車票',
    description: '傳統鐵路的硬式車票：起訖站、車種車次、車廂座位。',
    width: 600,
    photo: false,
    photoAspect: 1,
    codeKey: 'rl_no',
    qr: null,
    barcode: { x: 352, w: 222, align: 'right' },
    fields: [
      { key: 'rl_company', label: '鐵路公司', half: true, max: 12 },
      { key: 'rl_kind', label: '票種', half: true, max: 8 },
      { key: 'rl_from', label: '起站', half: true, max: 6 },
      { key: 'rl_to', label: '迄站', half: true, max: 6 },
      { key: 'rl_fromEn', label: '起站英文', half: true, max: 16 },
      { key: 'rl_toEn', label: '迄站英文', half: true, max: 16 },
      { key: 'rl_type', label: '車種', half: true, max: 8, caption: '車種' },
      { key: 'rl_train', label: '車次', half: true, max: 6, caption: '車次' },
      { key: 'rl_date', label: '乘車日期', half: true, max: 12, caption: '乘車日期' },
      { key: 'rl_dep', label: '開車時間', half: true, max: 6, caption: '開車' },
      { key: 'rl_arr', label: '到達時間', half: true, max: 6, caption: '到達' },
      { key: 'rl_car', label: '車廂', half: true, max: 4, caption: '車廂' },
      { key: 'rl_seat', label: '座位', half: true, max: 6, caption: '座位' },
      { key: 'rl_fare', label: '票價', half: true, max: 10, caption: '票價' },
      { key: 'rl_no', label: '票號', gen: '###### #### ##', max: 20 },
      { key: 'rl_note', label: '備註', max: 24 },
    ],
    defaults: {
      rl_company: '霧島鐵道',
      rl_kind: '全票',
      rl_from: '台北',
      rl_to: '花蓮',
      rl_fromEn: 'Taipei',
      rl_toEn: 'Hualien',
      rl_type: '特快車',
      rl_train: '408',
      rl_date: '2026/10/31',
      rl_dep: '07:10',
      rl_arr: '09:28',
      rl_car: '6',
      rl_seat: '32',
      rl_fare: 'NT$440',
      rl_no: '261031 0408 06',
      rl_note: '限當日當次車有效',
    },
  },
  {
    id: 'hsr',
    name: '高鐵風格車票',
    description: '高速鐵路的車票：大大的時刻、車廂座位與 QR code。',
    width: 600,
    photo: false,
    photoAspect: 1,
    codeKey: 'hsr_no',
    qr: { size: 102, pad: 6 },
    barcode: null,
    fields: [
      { key: 'hsr_company', label: '營運公司', half: true, max: 12 },
      { key: 'hsr_kind', label: '票種', half: true, max: 8 },
      { key: 'hsr_from', label: '起站', half: true, max: 6 },
      { key: 'hsr_to', label: '迄站', half: true, max: 6 },
      { key: 'hsr_fromEn', label: '起站英文', half: true, max: 16 },
      { key: 'hsr_toEn', label: '迄站英文', half: true, max: 16 },
      { key: 'hsr_dep', label: '出發時間', half: true, max: 6 },
      { key: 'hsr_arr', label: '抵達時間', half: true, max: 6 },
      { key: 'hsr_date', label: '日期', half: true, max: 12, caption: '日期' },
      { key: 'hsr_train', label: '車次', half: true, max: 6, caption: '車次' },
      { key: 'hsr_car', label: '車廂', half: true, max: 4, caption: '車廂' },
      { key: 'hsr_seat', label: '座位', half: true, max: 6, caption: '座位' },
      { key: 'hsr_class', label: '車廂種類', half: true, max: 8, caption: '車廂種類' },
      { key: 'hsr_fare', label: '票價', half: true, max: 10, caption: '票價' },
      { key: 'hsr_no', label: '票號', gen: '##-#-##-#-###-####', max: 24 },
      qrField('票上的 QR code；留白時用票號。'),
    ],
    defaults: {
      hsr_company: '海線高速鐵道',
      hsr_kind: '全票',
      hsr_from: '台北',
      hsr_to: '左營',
      hsr_fromEn: 'Taipei',
      hsr_toEn: 'Zuoying',
      hsr_dep: '08:15',
      hsr_arr: '09:45',
      hsr_date: '2026/10/31',
      hsr_train: '0657',
      hsr_car: '7',
      hsr_seat: '9A',
      hsr_class: '標準車廂',
      hsr_fare: 'NT$1,490',
      hsr_no: '07-2-31-0-304-0657',
      qr: '',
    },
  },
  {
    id: 'receipt',
    name: '收據',
    description: '鋸齒邊的收據：品項、數量、單價自動合計。',
    width: 320,
    photo: true,
    photoAspect: 3 / 2,
    codeKey: 'rc_code',
    qr: null,
    barcode: { x: 24, w: 272, align: 'center' },
    fields: [
      { key: 'rc_store', label: '店名', half: true, max: 12 },
      { key: 'rc_sub', label: '副標', half: true, max: 20 },
      { key: 'rc_stamp', label: '印章文字', half: true, max: 6 },
      { key: 'rc_currency', label: '幣別符號', half: true, max: 4 },
      { key: 'rc_date', label: '日期時間', max: 20, caption: '日期' },
      { key: 'rc_order', label: '單號', half: true, gen: '#####', max: 12, caption: '單號' },
      { key: 'rc_client', label: '客人', half: true, max: 12, caption: '客人' },
      { key: 'rc_server', label: '服務人員', half: true, max: 12, caption: '服務人員' },
      { key: 'rc_discount', label: '折扣', half: true, max: 10, caption: '折扣' },
      { key: 'rc_code', label: '條碼號碼', gen: '##### ######', max: 20 },
      { key: 'rc_msg', label: '結語', max: 24 },
    ],
    defaults: {
      rc_store: '巷口咖啡',
      rc_sub: '交易明細 RECEIPT',
      rc_stamp: '已付款',
      rc_currency: 'NT$',
      rc_date: '2026.10.31 22:03',
      rc_order: '00142',
      rc_client: '林小姐',
      rc_server: '陳以安',
      rc_discount: '0',
      rc_code: '00142 261031',
      rc_msg: '謝謝光臨，歡迎再來',
    },
  },
];

/** 收據的固定欄位名稱（不在欄位清單裡、但可以改的） */
export const RECEIPT_CAPTIONS = { subtotal: '小計', total: '合計' } as const;

export interface ReceiptItemDefault {
  name: string;
  qty: number;
  price: number;
}

export const RECEIPT_ITEMS_DEFAULT: readonly ReceiptItemDefault[] = [
  { name: '美式咖啡', qty: 2, price: 90 },
  { name: '檸檬塔', qty: 1, price: 120 },
];

export const RECEIPT_ITEM_MAX = 12;

/** 票券配色的預設組合（主色、輔色；本站挑的 7 組） */
export const TICKET_THEMES: readonly { name: string; c1: string; c2: string }[] = [
  { name: '暮櫻', c1: '#e8a0b4', c2: '#fde4ec' },
  { name: '琥珀', c1: '#e9b44c', c2: '#fdf0d0' },
  { name: '海霧', c1: '#7fb3c8', c2: '#e0f0f5' },
  { name: '苔綠', c1: '#9cbf8a', c2: '#e9f3dd' },
  { name: '薰衣', c1: '#b4a7d6', c2: '#ece8f8' },
  { name: '赭石', c1: '#c98b6b', c2: '#f5e3d6' },
  { name: '墨灰', c1: '#8e9aa6', c2: '#e6eaee' },
];

export const idTemplate = (id: IdTemplateId): IdTemplate =>
  ID_TEMPLATES.find((t) => t.id === id) ?? ID_TEMPLATES[0];

export const ticketTemplate = (id: TicketTemplateId): TicketTemplate =>
  TICKET_TEMPLATES.find((t) => t.id === id) ?? TICKET_TEMPLATES[0];

/** 一個欄位的字數上限 */
export const fieldMax = (f: FieldDef): number => f.max ?? FIELD_MAX;
