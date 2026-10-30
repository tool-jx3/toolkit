/**
 * SF 證件的範本（5 款）：活動證、公民 ID、執照卡、操作員 ID、通行證。
 * 尺寸、外形、照片格、版面數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/blanks.js；欄位與範例資料是本站寫的
 * （虛構的「霧港特區」，2087 年）。欄位值依代號在 5 款之間共用（同原作）。
 * 卡上印的欄位名稱（SURNAME、EXPIRES…）照原作用英文（機讀區、條碼同一套文件語言），可以在「改證件上的欄位名稱」換掉。
 */
import type { FieldDef } from '../templates';

export const SF_BLANK_IDS = ['event', 'citizen', 'license', 'operator', 'pass'] as const;
export type SfBlankId = (typeof SF_BLANK_IDS)[number];

export interface SfBlankDef {
  id: SfBlankId;
  name: string;
  description: string;
  /** 原生尺寸（1 倍匯出的像素） */
  w: number;
  h: number;
  fields: readonly FieldDef[];
  /** 條碼／QR code 的內容（留白時） */
  codeKey: string;
  /** 卡上印的欄位名稱（代號；可以改） */
  captions: readonly string[];
  /** 這一款有的裝飾開關 */
  decor: readonly SfDecor[];
  /** 範本縮圖上的字母 */
  letter: string;
}

export type SfDecor = 'stripes' | 'slashes' | 'barcode' | 'edge' | 'chip' | 'dna' | 'mrz';

/** 編號的產生格式（每次隨機挑一種）：`#` 數字（第一個 1～9）、`@` 英文字母（沒有 I、O）、`%` 十六進位 */
export const SF_SERIALS: readonly string[] = [
  'X##-####',
  'ID-####-####',
  '@@-####-@',
  '%%:%%:%%:%%',
  '@@@/#####',
];

const DATE = 'YYYY-MM-DD';

/** 種別的隨機選項（通用的 SF 用語） */
export const SF_SPECIES: readonly string[] = [
  'HUMAN',
  'ANDROID',
  'CYBORG',
  'CLONE',
  'SYNTH',
  'MUTANT',
  'HYBRID',
  'UPLOAD',
];

const F = {
  number: { key: 'number', label: '編號', gen: 'serial', max: 16 } as FieldDef,
  given: { key: 'given', label: '名', half: true, max: 24 } as FieldDef,
  surname: { key: 'surname', label: '姓', half: true, max: 18 } as FieldDef,
  dob: {
    key: 'dob',
    label: '出生日期',
    half: true,
    max: 10,
    placeholder: DATE,
    genDate: [2040, 2070],
  } as FieldDef,
  expires: {
    key: 'expires',
    label: '有效期限',
    half: true,
    max: 10,
    placeholder: DATE,
    genDate: [2088, 2099],
  } as FieldDef,
  org: { key: 'org', label: '組織', max: 24 } as FieldDef,
  division: { key: 'division', label: '部門', max: 32 } as FieldDef,
  qr: {
    key: 'qr',
    label: 'QR code 內容',
    max: 300,
    placeholder: '留白＝用編號',
    hint: '條碼選 QR code 時用；留白時用編號。',
  } as FieldDef,
};

export const SF_BLANKS: readonly SfBlankDef[] = [
  {
    id: 'event',
    name: '活動證',
    description: '展覽、演唱會的掛牌（直式 1200 × 1600）：直排的身分標籤、大大的稱謂與名字。',
    w: 1200,
    h: 1600,
    letter: 'E',
    codeKey: 'number',
    captions: [],
    decor: ['stripes', 'slashes', 'barcode', 'edge'],
    fields: [
      F.number,
      { key: 'role', label: '身分標籤', half: true, max: 16, hint: '直排在照片右邊（強調色）。' },
      { key: 'title', label: '稱謂', half: true, max: 4, placeholder: 'MR／MS' },
      F.given,
      F.surname,
      { key: 'footer', label: '底部文字', max: 32 },
      F.qr,
    ],
  },
  {
    id: 'citizen',
    name: '公民 ID',
    description: '橫式的身分證（CR80 比例）：晶片、DNA 條、由欄位產生的機讀區。',
    w: 1600,
    h: 1010,
    letter: 'C',
    codeKey: 'number',
    captions: ['surname', 'given', 'species', 'sex', 'idno', 'expires', 'dob', 'district', 'dna'],
    decor: ['stripes', 'slashes', 'barcode', 'edge', 'chip', 'dna', 'mrz'],
    fields: [
      { key: 'issuer', label: '發行單位', max: 32 },
      { ...F.number, label: '身分編號' },
      F.given,
      F.surname,
      { key: 'sex', label: '性別', half: true, max: 3, placeholder: 'F／M' },
      {
        key: 'species',
        label: '種別',
        half: true,
        max: 12,
        gen: 'species',
        hint: '人類、仿生人、改造人…（英文印起來比較像）。',
      },
      F.dob,
      F.expires,
      { key: 'district', label: '居住區', max: 28 },
      { key: 'status', label: '身分狀態', max: 24, hint: '強調色的一行（在照片下緣的高度）。' },
      {
        key: 'state',
        label: '機讀區的發行地代碼',
        max: 3,
        placeholder: 'ABC',
        hint: '3 個英文字母；機讀區只印英文字母與數字（中文名字不會出現在機讀區）。',
      },
      F.qr,
    ],
  },
  {
    id: 'license',
    name: '執照卡',
    description: '橫式的執照（CR80 比例）：12 格執照圖示，有的是實心、沒有的空心淡化。',
    w: 1600,
    h: 1010,
    letter: 'L',
    codeKey: 'licenseNo',
    captions: ['licenses', 'surname', 'dob', 'given', 'expires', 'licno'],
    decor: ['stripes', 'slashes', 'barcode', 'edge'],
    fields: [
      { key: 'authority', label: '發照單位', max: 32 },
      { key: 'licenseNo', label: '執照號碼', gen: 'serial', max: 16 },
      F.given,
      F.surname,
      F.dob,
      F.expires,
      F.qr,
    ],
  },
  {
    id: 'operator',
    name: '操作員 ID',
    description: '圓角的橫式工作證：點陣條、呼號、職位、狀態勾選、反白的組織帶。',
    w: 1600,
    h: 1010,
    letter: 'O',
    codeKey: 'number',
    captions: ['callsign', 'position', 'idprefix', 'fine'],
    decor: ['stripes', 'slashes', 'barcode', 'edge'],
    fields: [
      { key: 'callsign', label: '呼號', half: true, max: 16 },
      { key: 'position', label: '職位', half: true, max: 18 },
      { key: 'opStatus', label: '狀態', max: 40 },
      F.number,
      { key: 'cardType', label: '證件類型', max: 24 },
      F.org,
      F.division,
      F.qr,
    ],
  },
  {
    id: 'pass',
    name: '通行證',
    description:
      '直式的掛牌（1000 × 1600）：上方打好掛繩孔（匯出是透明的洞）、權限等級、區域、部門。',
    w: 1000,
    h: 1600,
    letter: 'A',
    codeKey: 'number',
    captions: ['refid', 'validthru', 'zone', 'division', 'authorized'],
    decor: ['slashes', 'barcode', 'edge'],
    fields: [
      { key: 'access', label: '權限等級', max: 16 },
      { ...F.number, label: '參考編號' },
      { ...F.expires, half: false },
      { key: 'zone', label: '區域', max: 28 },
      F.division,
      { key: 'handle', label: '代號', max: 24 },
      F.given,
      F.surname,
      F.org,
      F.qr,
    ],
  },
];

export const sfBlank = (id: SfBlankId): SfBlankDef =>
  SF_BLANKS.find((b) => b.id === id) ?? SF_BLANKS[0];

/** 範例資料（全部虛構：霧港特區，2087 年） */
export const SF_DEFAULTS: Readonly<Record<string, string>> = {
  number: 'MP-2087-0413',
  role: 'SPEAKER',
  title: 'MS',
  given: 'NOVA',
  surname: 'LIN',
  footer: 'GRID//CON 2087 · ALL DAYS',
  issuer: '霧港特區 // CIVIL REGISTRY',
  sex: 'F',
  species: 'HUMAN',
  dob: '2061-08-14',
  expires: '2093-12-31',
  district: 'MISTPORT // RIVERSIDE 9-B',
  status: 'CLASS B // RESIDENT',
  state: 'MSP',
  authority: '霧港特區 // PERMIT OFFICE',
  licenseNo: 'LX-5521-0814',
  callsign: 'MOTH-9',
  position: 'NETRUNNER',
  opStatus: 'ON CONTRACT // CLEARANCE LV.3',
  cardType: 'CONTRACTOR ID',
  org: 'HALCYON DYNAMICS',
  division: 'BLACK ICE DIVISION',
  access: 'LEVEL 4',
  zone: 'TOWER B // FLOORS 30–45',
  handle: '@NIGHTMOTH',
  qr: '',
};

/** 卡上印的欄位名稱（預設；英文） */
export const SF_CAPTIONS: Readonly<Record<string, string>> = {
  surname: 'SURNAME',
  given: 'GIVEN NAMES',
  species: 'SPECIES',
  sex: 'SEX',
  idno: 'ID NO.',
  expires: 'EXPIRES',
  dob: 'DATE OF BIRTH',
  district: 'DISTRICT',
  dna: 'DNA',
  licenses: 'LICENSES',
  licno: 'LICENSE NO.',
  callsign: 'CALL SIGN',
  position: 'POSITION',
  idprefix: 'ID',
  fine: 'THIS CARD REMAINS THE PROPERTY OF {org} AND MUST BE RETURNED WHEN THE CONTRACT ENDS OR WHEN AUTHORIZED STAFF ASK FOR IT',
  refid: 'REFERENCE ID',
  validthru: 'VALID THRU',
  zone: 'ZONE',
  division: 'DIVISION',
  authorized: 'AUTHORIZED PERSONNEL ONLY',
};

/** 設定欄裡卡上欄位名稱的說明 */
export const SF_CAPTION_LABELS: Readonly<Record<string, string>> = {
  surname: '姓',
  given: '名',
  species: '種別',
  sex: '性別',
  idno: '身分編號',
  expires: '有效期限',
  dob: '出生日期',
  district: '居住區',
  dna: 'DNA 條',
  licenses: '執照欄',
  licno: '執照號碼',
  callsign: '呼號',
  position: '職位',
  idprefix: '編號前的字',
  fine: '小字聲明（{org}＝組織）',
  refid: '參考編號',
  validthru: '有效期限',
  zone: '區域',
  division: '部門',
  authorized: '組織下方的字',
};

export const SF_CAPTION_MAX = 140;
export const sfCaptionMax = (key: string): number => (key === 'fine' ? SF_CAPTION_MAX : 24);

/** 預設的執照（實心的） */
export const SF_LICENSES_DEFAULT: readonly string[] = ['firearms', 'driver', 'medic', 'decker'];

/** 配色組合：卡面、墨色、強調色（照原作的 6 組） */
export const SF_SCHEMES: readonly {
  id: string;
  name: string;
  card: string;
  ink: string;
  accent: string;
}[] = [
  { id: 'paper', name: '紙本', card: '#ffffff', ink: '#050507', accent: '#ff1a2e' },
  { id: 'night', name: '夜城', card: '#0b0b10', ink: '#00f0ff', accent: '#fcee0a' },
  { id: 'toxic', name: '毒綠', card: '#c8ff00', ink: '#0b0b10', accent: '#ff003c' },
  { id: 'blood', name: '血紅', card: '#16070a', ink: '#ff003c', accent: '#e8e8ee' },
  { id: 'chrome', name: '鉻銀', card: '#c9ccd4', ink: '#14141c', accent: '#00a8ff' },
  { id: 'sunset', name: '夕陽', card: '#ff9e3d', ink: '#1a0a2e', accent: '#ffffff' },
];
