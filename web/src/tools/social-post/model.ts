/**
 * 社群貼文產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/social-post.md）：
 * 狀態的型別與預設內容（本站做的 TRPG 範例，D2）、整理存檔（3.9）、貼文／照片／留言／限時動態／格子／貼紙的清單操作。
 *
 * 清單操作直接改傳進來的物件（給 store 的 Immer draft 用；測試時傳複本）。
 */
import { DEFAULT_PLACEMENT, type FramePlacement, normalizePlacement } from '@/core/image';
import {
  anchorOf,
  fitPlace,
  type PhotoPlace,
  placeAt,
  refitPlace,
  type Size,
  ZOOM_MAX,
} from './place';

export { ZOOM_MAX } from './place';

/* ---------- 範圍 ---------- */

/** 文字欄的上限（字元數，emoji 算一個；D10） */
export const LIMITS = {
  username: 30,
  name: 40,
  clock: 8,
  location: 60,
  collab: 30,
  count: 12,
  likedBy: 30,
  caption: 2200,
  postTime: 20,
  commentUser: 30,
  commentTime: 20,
  commentText: 1000,
  storyTime: 20,
  stickerText: 200,
  emoji: 16,
  chipText: 40,
  musicTitle: 60,
  musicArtist: 60,
  questionTitle: 120,
  questionHint: 60,
  category: 40,
  bio: 500,
  link: 100,
  mutual: 100,
  highlightTitle: 20,
  feedLogo: 20,
  dmBadge: 6,
  threadName: 40,
  threadTime: 20,
  threadActive: 30,
  threadPreview: 100,
  threadSeen: 20,
  message: 1000,
  messageTime: 30,
  react: 8,
} as const;

/** 清單的上限（D10） */
export const MAX = {
  posts: 30,
  photos: 20,
  comments: 50,
  stories: 20,
  stickers: 40,
  highlights: 20,
  grid: 60,
  threads: 20,
  messages: 100,
} as const;

/** 放進資產庫時的長邊上限（F98） */
export const IMAGE_MAX = { photo: 1800, avatar: 600, sticker: 1200 } as const;

export const BATTERY_RANGE = [5, 100] as const;
export const FONT_SCALE_RANGE = [0.8, 1.4] as const;
export const GAP_RANGE = [0, 3] as const;
export const SEGMENTS_RANGE = [1, 12] as const;
export const PLACEHOLDER_RANGE = [0, 30] as const;
export const MORE_RANGE = [0, 999] as const;
export const STICKER_SCALE_RANGE = [0.2, 6] as const;

/* ---------- 圖 ---------- */

/** 程式畫的範例圖（不是照片；D2） */
export const SAMPLE_SIZES = {
  lighthouse: [1080, 1350],
  map: [1080, 1350],
  oldphoto: [1080, 1350],
  diary: [1080, 1080],
  harbor: [1080, 1350],
  moon: [1080, 1080],
  candle: [1080, 1350],
  street: [1080, 1350],
  'avatar-me': [400, 400],
  'avatar-kai': [400, 400],
  'avatar-info': [400, 400],
} as const satisfies Record<string, readonly [number, number]>;
export type SampleKey = keyof typeof SAMPLE_SIZES;
export const SAMPLE_KEYS = Object.keys(SAMPLE_SIZES) as SampleKey[];
export const isSampleKey = (v: unknown): v is SampleKey =>
  typeof v === 'string' && Object.hasOwn(SAMPLE_SIZES, v);

export interface AssetImage {
  kind: 'asset';
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface SampleImage {
  kind: 'sample';
  key: SampleKey;
}

export type ImageRef = AssetImage | SampleImage;

export const sample = (key: SampleKey): SampleImage => ({ kind: 'sample', key });

export const imageSize = (img: ImageRef): { width: number; height: number } =>
  img.kind === 'sample'
    ? { width: SAMPLE_SIZES[img.key][0], height: SAMPLE_SIZES[img.key][1] }
    : { width: img.width, height: img.height };

/** 圖的鍵（快取、比對用） */
export const imageKey = (img: ImageRef): string =>
  img.kind === 'sample' ? `sample:${img.key}` : `asset:${img.id}`;

const place0 = (): FramePlacement => ({ ...DEFAULT_PLACEMENT });

/* ---------- 型別 ---------- */

export type Theme = 'light' | 'dark';

export interface Profile {
  username: string;
  name: string;
  avatar: ImageRef | null;
  verified: boolean;
  /** 動態外圈 */
  ring: boolean;
}

/** 朋友的帳號（朋友的貼文、限時動態用；F111～F113） */
export interface Owner {
  username: string;
  avatar: ImageRef | null;
  verified: boolean;
}

export interface ScreenSettings {
  status: boolean;
  icons: boolean;
  clock: string;
  battery: number;
  fontScale: number;
}

export interface Photo {
  id: string;
  image: ImageRef;
  /** 照片在框裡的位置（place.ts：縮放、換比例時照原作保持比例） */
  place: PhotoPlace;
}

export interface Comment {
  id: string;
  avatar: ImageRef | null;
  username: string;
  verified: boolean;
  time: string;
  text: string;
  likes: string;
  liked: boolean;
  /** 作者（我）：用帳號的名字、大頭貼、徽章 */
  author: boolean;
  pinned: boolean;
  authorLiked: boolean;
  /** 回覆（縮排） */
  reply: boolean;
  /** 隱藏的回覆數 */
  more: number;
}

export const RATIOS = ['4:5', '1:1', '3:4', '1.91:1'] as const;
export type Ratio = (typeof RATIOS)[number];
/** 寬 ÷ 高 */
export const RATIO_VALUE: Record<Ratio, number> = {
  '4:5': 4 / 5,
  '1:1': 1,
  '3:4': 3 / 4,
  '1.91:1': 1.91,
};

/** 照片框的大小（只看寬高比：寬 1、高 1 ÷ 比例） */
export const ratioBox = (r: Ratio): Size => ({ width: 1, height: 1 / RATIO_VALUE[r] });

export type CountStyle = 'inline' | 'classic';
export type SheetHeight = 'half' | 'full';

export interface Post {
  id: string;
  photos: Photo[];
  /** 預覽顯示的那張（輪播的位置） */
  current: number;
  ratio: Ratio;
  location: string;
  collab: string;
  follow: boolean;
  countStyle: CountStyle;
  likes: string;
  comments: string;
  reposts: string;
  shares: string;
  likedBy: string;
  liked: boolean;
  saved: boolean;
  showRepost: boolean;
  showShare: boolean;
  commentsOff: boolean;
  caption: string;
  collapse: boolean;
  time: string;
  /** 個人頁格狀的 1:1 縮圖（第一張照片）的位置 */
  thumb: FramePlacement;
  sheet: { backdrop: boolean; height: SheetHeight; items: Comment[] };
  /** 朋友的貼文（帳號列、內文、作者的留言用 owner；個人頁的格狀不放；F111） */
  friend: boolean;
  owner: Owner;
  /** 在首頁動態顯示（F114） */
  inFeed: boolean;
}

export const STORY_LAYOUTS = ['1', '2v', '2h', '3v', '4', '6'] as const;
export type StoryLayout = (typeof STORY_LAYOUTS)[number];
/** 每種版面的欄數與列數 */
export const LAYOUT_GRID: Record<StoryLayout, { cols: number; rows: number }> = {
  '1': { cols: 1, rows: 1 },
  '2v': { cols: 1, rows: 2 },
  '2h': { cols: 2, rows: 1 },
  '3v': { cols: 1, rows: 3 },
  '4': { cols: 2, rows: 2 },
  '6': { cols: 2, rows: 3 },
};
export const cellCount = (l: StoryLayout): number => LAYOUT_GRID[l].cols * LAYOUT_GRID[l].rows;
/** 格子固定存 6 格（換版面時藏起來的格子保留） */
export const CELL_SLOTS = 6;

export interface Cell {
  image: ImageRef | null;
  /** 照片在格子裡的位置（place.ts；藏起來的格子 ax／ay 都記著） */
  place: PhotoPlace;
}

/** 限時動態的畫面大小（畫面單位；cqw ＝ 寬的 1%） */
export const STORY_W = 360;
export const STORY_H = 640;

/** 格子的位置（看得到的格子；間距以 cqw 計） */
export function storyCellRects(
  layout: StoryLayout,
  gap: number,
): { x: number; y: number; width: number; height: number }[] {
  const { cols, rows } = LAYOUT_GRID[layout];
  const g = (gap * STORY_W) / 100;
  const cw = (STORY_W - (cols - 1) * g) / cols;
  const ch = (STORY_H - (rows - 1) * g) / rows;
  const out: { x: number; y: number; width: number; height: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: c * (cw + g), y: r * (ch + g), width: cw, height: ch });
  return out;
}

export const STORY_FONTS = ['classic', 'modern', 'neon', 'type', 'strong', 'serif'] as const;
export type StoryFont = (typeof STORY_FONTS)[number];
export const TEXT_BGS = ['none', 'solid', 'soft'] as const;
export type TextBg = (typeof TEXT_BGS)[number];
export const ALIGNS = ['left', 'center', 'right'] as const;
export type Align = (typeof ALIGNS)[number];
export const CHIP_STYLES = ['white', 'color', 'clear'] as const;
export type ChipStyle = (typeof CHIP_STYLES)[number];

export const STICKER_TYPES = [
  'text',
  'emoji',
  'mention',
  'location',
  'hashtag',
  'link',
  'music',
  'question',
  'image',
] as const;
export type StickerType = (typeof STICKER_TYPES)[number];
export type ChipType = 'mention' | 'location' | 'hashtag' | 'link';
export const CHIP_TYPES: readonly ChipType[] = ['mention', 'location', 'hashtag', 'link'];

interface StickerBase {
  id: string;
  /** 中心的位置（畫面寬、高的 %） */
  x: number;
  y: number;
  scale: number;
  /** 度，順時針 */
  rot: number;
}

export interface TextSticker extends StickerBase {
  type: 'text';
  text: string;
  font: StoryFont;
  color: string;
  bg: TextBg;
  align: Align;
}
export interface EmojiSticker extends StickerBase {
  type: 'emoji';
  text: string;
}
export interface ChipSticker extends StickerBase {
  type: ChipType;
  text: string;
  style: ChipStyle;
}
export interface MusicSticker extends StickerBase {
  type: 'music';
  title: string;
  artist: string;
  image: ImageRef | null;
  dark: boolean;
}
export interface QuestionSticker extends StickerBase {
  type: 'question';
  title: string;
  hint: string;
  color: string;
}
export interface ImageSticker extends StickerBase {
  type: 'image';
  image: ImageRef;
  frame: boolean;
}
export type Sticker =
  | TextSticker
  | EmojiSticker
  | ChipSticker
  | MusicSticker
  | QuestionSticker
  | ImageSticker;

export type StoryBottom = 'reply' | 'own' | 'none';

export interface Story {
  id: string;
  layout: StoryLayout;
  cells: Cell[];
  gap: number;
  gapColor: string;
  /** 背景：色票的 id（漸層）或 #rrggbb */
  bg: string;
  stickers: Sticker[];
  showTop: boolean;
  count: number;
  current: number;
  progress: number;
  time: string;
  bottom: StoryBottom;
  /** 朋友的限時動態（帳號列用 owner；F112） */
  friend: boolean;
  owner: Owner;
  /** 看過了：首頁動態的圈是灰色的（F115） */
  seen: boolean;
}

export interface Highlight {
  id: string;
  title: string;
  image: ImageRef | null;
  /** 連到的限時動態 id（null＝無） */
  story: string | null;
}

export interface GridPhoto {
  id: string;
  image: ImageRef;
}

export interface Account {
  own: boolean;
  private: boolean;
  nav: boolean;
  showHL: boolean;
  posts: string;
  followers: string;
  following: string;
  category: string;
  bio: string;
  link: string;
  mutual: string;
  highlights: Highlight[];
  grid: GridPhoto[];
  placeholders: number;
}

/** 首頁動態（F116～F122） */
export interface Feed {
  /** 左上角的字 */
  logo: string;
  /** 通知的紅點 */
  heartDot: boolean;
  /** 訊息圖示的未讀數（空白時不畫） */
  dmBadge: string;
  /** 「我的限時動態」放哪幾則（限時動態的 id；照限時動態清單的順序接著看） */
  myStories: string[];
}

/* ---------- 私訊（F134～F145） ---------- */

/** 誰的訊息：我、對方、時間（中間的一行時間） */
export const MESSAGE_FROM = ['me', 'them', 'time'] as const;
export type MessageFrom = (typeof MESSAGE_FROM)[number];

export interface Message {
  id: string;
  from: MessageFrom;
  /** 內容（時間時是那一行字） */
  text: string;
  /** 附的照片（時間時不畫，資料留著） */
  image: ImageRef | null;
  /** 反應的表情符號（空白時沒有；時間時不畫） */
  react: string;
}

export interface Thread {
  id: string;
  username: string;
  /** 名稱（空白時用帳號） */
  name: string;
  avatar: ImageRef | null;
  verified: boolean;
  /** 在線上（綠點） */
  online: boolean;
  /** 對話上方的動態（「目前在線上」「1 小時前在線上」） */
  active: string;
  /** 訊息列表的時間 */
  time: string;
  /** 未讀（藍點、粗體） */
  unread: boolean;
  /** 訊息列表的預覽（空白時用最後一則訊息） */
  preview: string;
  /** 我的最後一則訊息下面的字（「已讀」；空白時不畫） */
  seen: string;
  /** 對話最上面的個人檔案介紹 */
  intro: boolean;
  messages: Message[];
}

export interface Dm {
  /** 我的泡泡：最早（上面）的顏色到最新（下面）的顏色 */
  c1: string;
  c2: string;
  threads: Thread[];
}

/** 我的泡泡的 6 個色票（本站自己挑，D5）：上面、下面、名稱 */
export const BUBBLE_PRESETS: readonly (readonly [string, string, string])[] = [
  ['#7a4fd6', '#3f63e0', '夜藍漸層'],
  ['#3f63e0', '#3f63e0', '藍'],
  ['#e0457b', '#d6338a', '粉紅'],
  ['#2fa36b', '#238a58', '綠'],
  ['#c9d6e3', '#a9bccd', '霧灰'],
  ['#22262c', '#22262c', '黑'],
];

export interface SocialState {
  theme: Theme;
  profile: Profile;
  screen: ScreenSettings;
  posts: Post[];
  stories: Story[];
  account: Account;
  feed: Feed;
  dm: Dm;
}

/* ---------- 色票（本站自己挑，D5） ---------- */

/** 背景的漸層色票（160°） */
export const BG_PRESETS = {
  night: {
    label: '夜空',
    stops: [
      [0, '#121a33'],
      [1, '#3f4c8c'],
    ],
  },
  dusk: {
    label: '暮色',
    stops: [
      [0, '#40275e'],
      [0.55, '#c0507a'],
      [1, '#f2a65a'],
    ],
  },
  mist: {
    label: '霧藍',
    stops: [
      [0, '#cfe0fb'],
      [1, '#8fb0e6'],
    ],
  },
  mint: {
    label: '薄荷',
    stops: [
      [0, '#dff7ec'],
      [1, '#9fd8cf'],
    ],
  },
  forest: {
    label: '森林',
    stops: [
      [0, '#0f2a24'],
      [1, '#2f5d4f'],
    ],
  },
  lemon: {
    label: '檸檬',
    stops: [
      [0, '#fff3b0'],
      [1, '#ffc46b'],
    ],
  },
} as const satisfies Record<
  string,
  { label: string; stops: readonly (readonly [number, string])[] }
>;
export type BgPreset = keyof typeof BG_PRESETS;
export const isBgPreset = (v: string): v is BgPreset => Object.hasOwn(BG_PRESETS, v);
/** 背景的色票（6 個漸層＋3 個單色） */
export const BG_SWATCHES: readonly string[] = [
  'night',
  'dusk',
  'mist',
  'mint',
  'forest',
  'lemon',
  '#000000',
  '#ffffff',
  '#efe6da',
];
export const SOLID_LABELS: Record<string, string> = {
  '#000000': '黑',
  '#ffffff': '白',
  '#efe6da': '米',
};
export const DEFAULT_BG = 'night';

/** 文字與提問卡片的 10 個色票 */
export const TEXT_SWATCHES = [
  '#ffffff',
  '#000000',
  '#4f8ff0',
  '#5cc46c',
  '#f5c84c',
  '#f28a3c',
  '#e5484d',
  '#d6338a',
  '#8e4fd6',
  '#f7d6df',
] as const;

/** 表情符號貼紙的快速選擇（16 個） */
export const QUICK_EMOJI = [
  '✨',
  '❤️',
  '🔥',
  '😱',
  '👀',
  '🕯️',
  '🌙',
  '⭐',
  '🔦',
  '🗝️',
  '📷',
  '☕',
  '🎲',
  '🐈‍⬛',
  '🌊',
  '💀',
] as const;

/** 留言面板下方的 8 個快速表情（D15） */
export const SHEET_EMOJI = ['❤️', '👀', '🔥', '🕯️', '😱', '🙏', '✨', '😂'] as const;

/** 深拷貝（也可以用在 store 的 Immer draft 上；structuredClone 不能拷貝 draft） */
const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/* ---------- id ---------- */

/** prefix＋數字，挑一個沒用過的（最大的數字＋1） */
export function nextId(prefix: string, used: Iterable<string>): string {
  let max = 0;
  for (const id of used) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

const allPhotoIds = (s: Pick<SocialState, 'posts'>) =>
  s.posts.flatMap((p) => p.photos.map((x) => x.id));
const allCommentIds = (s: Pick<SocialState, 'posts'>) =>
  s.posts.flatMap((p) => p.sheet.items.map((c) => c.id));
const allStickerIds = (s: Pick<SocialState, 'stories'>) =>
  s.stories.flatMap((x) => x.stickers.map((k) => k.id));

/* ---------- 預設內容（D2） ---------- */

function comment(id: string, patch: Partial<Comment>): Comment {
  return {
    id,
    avatar: null,
    username: '',
    verified: false,
    time: '',
    text: '',
    likes: '',
    liked: false,
    author: false,
    pinned: false,
    authorLiked: false,
    reply: false,
    more: 0,
    ...patch,
  };
}

/** 新貼文的預設留言（「留言回到預設」也用這組） */
export function defaultComments(prefix = 'c'): Comment[] {
  return [
    comment(`${prefix}1`, {
      avatar: sample('avatar-kai'),
      username: 'kai.archive',
      time: '2 小時',
      text: '這是在哪裡拍的？',
      likes: '12',
      liked: true,
      authorLiked: true,
    }),
    comment(`${prefix}2`, {
      author: true,
      time: '1 小時',
      text: '@kai.archive 祕密 🤫',
      likes: '3',
      reply: true,
    }),
    comment(`${prefix}3`, {
      avatar: sample('avatar-info'),
      username: 'mistharbor.info',
      time: '45 分鐘',
      text: '好有氣氛',
      more: 2,
    }),
  ];
}

/** 空白貼文（新增貼文、重設這則貼文） */
export function blankPost(id: string, commentPrefix = `${id}c`): Post {
  return {
    id,
    photos: [],
    current: 0,
    ratio: '4:5',
    location: '',
    collab: '',
    follow: false,
    countStyle: 'inline',
    likes: '128',
    comments: '12',
    reposts: '3',
    shares: '9',
    likedBy: '',
    liked: false,
    saved: false,
    showRepost: true,
    showShare: true,
    commentsOff: false,
    caption: '今天的紀錄 📷\n#日常',
    collapse: false,
    time: '剛剛',
    thumb: place0(),
    sheet: { backdrop: true, height: 'half', items: defaultComments(commentPrefix) },
    friend: false,
    owner: newOwner(1),
    inFeed: true,
  };
}

/** 朋友帳號的預設（friend_N） */
export const newOwner = (n = 1): Owner => ({
  username: `friend_${n}`,
  avatar: null,
  verified: false,
});

/** 下一個朋友的編號：朋友的貼文與限時動態的數量＋1（同原作） */
export const nextFriendNo = (s: Pick<SocialState, 'posts' | 'stories'>): number =>
  s.posts.filter((p) => p.friend).length + s.stories.filter((x) => x.friend).length + 1;

const emptyCells = (): Cell[] =>
  Array.from({ length: CELL_SLOTS }, () => ({ image: null, place: place0() }));

/** 空白限時動態（新增、重設） */
export function blankStory(id: string): Story {
  return {
    id,
    layout: '4',
    cells: emptyCells(),
    gap: 0.5,
    gapColor: '#ffffff',
    bg: DEFAULT_BG,
    stickers: [],
    showTop: true,
    count: 1,
    current: 1,
    progress: 40,
    time: '3 小時',
    bottom: 'reply',
    friend: false,
    owner: newOwner(1),
    seen: false,
  };
}

/** 朋友的限時動態（新增朋友的限時動態、範例）：1 張、暮色、2 小時 */
export function friendStory(id: string, owner: Owner): Story {
  return { ...blankStory(id), friend: true, owner, layout: '1', bg: 'dusk', time: '2 小時' };
}

const message = (id: string, from: MessageFrom, text: string, react = ''): Message => ({
  id,
  from,
  text,
  image: null,
  react,
});

/** 新的對話（friend_N；兩則打招呼的訊息） */
export function newThread(id: string, n: number, ids: [string, string, string]): Thread {
  return {
    id,
    username: `friend_${n}`,
    name: '',
    avatar: null,
    verified: false,
    online: false,
    active: '1 小時前在線上',
    time: '1 小時',
    unread: false,
    preview: '',
    seen: '已讀',
    intro: true,
    messages: [
      message(ids[0], 'time', '今天 下午 2:10'),
      message(ids[1], 'them', '嗨！'),
      message(ids[2], 'me', '嗨 😊'),
    ],
  };
}

/** 範例的私訊（D2：阿凱、霧港鎮觀光資訊） */
export function defaultDm(): Dm {
  return {
    c1: BUBBLE_PRESETS[0][0],
    c2: BUBBLE_PRESETS[0][1],
    threads: [
      {
        ...newThread('t1', 1, ['m1', 'm2', 'm3']),
        username: 'kai.archive',
        name: '阿凱',
        avatar: sample('avatar-kai'),
        online: true,
        active: '目前在線上',
        unread: true,
        messages: [
          message('m1', 'time', '今天 下午 2:10'),
          message('m2', 'them', '你真的要去燈塔？'),
          message('m3', 'them', '照片我看到了，最上面那層有光'),
          message('m4', 'me', '今晚就出發'),
          message('m5', 'me', '要一起來嗎？', '❤️'),
          message('m6', 'them', '……我帶手電筒'),
        ],
      },
      {
        ...newThread('t2', 2, ['m7', 'm8', 'm9']),
        username: 'mistharbor.info',
        avatar: sample('avatar-info'),
        active: '3 小時前在線上',
        time: '3 小時',
        messages: [
          message('m7', 'time', '昨天 晚上 9:30'),
          message('m8', 'them', '您好，燈塔步道夜間封閉，請勿進入。'),
          message('m9', 'me', '收到，謝謝提醒 🙏'),
        ],
      },
    ],
  };
}

export function defaultFeed(myStories: string[] = ['s1']): Feed {
  return { logo: 'Moments', heartDot: true, dmBadge: '2', myStories };
}

export function defaultProfile(): Profile {
  return {
    username: 'xiaoyu.lin',
    name: '林曉雨',
    avatar: sample('avatar-me'),
    verified: false,
    ring: false,
  };
}

export function defaultScreen(): ScreenSettings {
  return { status: true, icons: true, clock: '23:47', battery: 100, fontScale: 1 };
}

export function defaultAccount(): Account {
  return {
    own: true,
    private: false,
    nav: true,
    showHL: true,
    posts: '24',
    followers: '3,108',
    following: '187',
    category: '攝影師',
    bio: '自由撰稿人／攝影\n專寫怪談與都市傳說的採訪紀錄 🕯️\n#霧港鎮調查中',
    link: 'xiaoyu-notes.example',
    mutual: '',
    highlights: [
      { id: 'h1', title: '取材', image: null, story: 's1' },
      { id: 'h2', title: '日常', image: sample('candle'), story: null },
    ],
    grid: [
      { id: 'g1', image: sample('moon') },
      { id: 'g2', image: sample('candle') },
      { id: 'g3', image: sample('street') },
      { id: 'g4', image: sample('harbor') },
    ],
    placeholders: 9,
  };
}

const photo = (id: string, image: ImageRef): Photo => ({ id, image, place: place0() });

export function initialState(): SocialState {
  const p1 = blankPost('p1');
  Object.assign(p1, {
    photos: [
      photo('ph1', sample('lighthouse')),
      photo('ph2', sample('map')),
      photo('ph3', sample('oldphoto')),
    ],
    location: '霧港鎮・燈塔步道',
    likes: '1,284',
    comments: '36',
    reposts: '12',
    shares: '48',
    caption:
      '週末到霧港鎮取材 📷\n燈塔明明廢棄三十年了，半夜卻有人在上面點燈……？\n#霧港鎮 #取材日記 @kai.archive',
    time: '3 小時前',
  });
  p1.sheet.items = [
    comment('c1', {
      avatar: sample('avatar-kai'),
      username: 'kai.archive',
      time: '2 小時',
      text: '那座燈塔不是三十年前就封起來了嗎？',
      likes: '24',
      liked: true,
      authorLiked: true,
    }),
    comment('c2', {
      author: true,
      time: '1 小時',
      text: '@kai.archive 所以才更想上去看看啊 👀',
      likes: '3',
      reply: true,
    }),
    comment('c3', {
      avatar: sample('avatar-info'),
      username: 'mistharbor.info',
      time: '45 分鐘',
      text: '提醒您：燈塔周邊夜間禁止進入，請勿擅闖。',
      more: 2,
    }),
  ];
  const p2 = blankPost('p2');
  Object.assign(p2, {
    photos: [photo('ph4', sample('diary'))],
    ratio: '1:1',
    likes: '962',
    comments: '58',
    reposts: '',
    shares: '31',
    caption:
      '整理到半夜的資料。\n這本日記的最後一頁被撕掉了，背面還留著一行字：「別回頭看」。\n#調查中',
    time: '昨天',
  });
  const s1 = blankStory('s1');
  s1.cells[0].image = sample('harbor');
  s1.cells[1].image = sample('moon');
  s1.cells[2].image = sample('candle');
  s1.cells[3].image = sample('street');
  s1.stickers = [
    {
      id: 'k1',
      type: 'text',
      x: 50,
      y: 44,
      scale: 1,
      rot: -4,
      text: '今晚出發 🔦',
      font: 'classic',
      color: '#ffffff',
      bg: 'soft',
      align: 'center',
    },
    { id: 'k2', type: 'location', x: 50, y: 57, scale: 1, rot: 0, text: '霧港鎮', style: 'white' },
  ];
  /* 朋友的限時動態（首頁動態的限時動態列；同原作的範例有一則朋友的） */
  const s2 = friendStory('s2', {
    username: 'kai.archive',
    avatar: sample('avatar-kai'),
    verified: false,
  });
  s2.cells[0].image = sample('street');
  s2.stickers = [
    {
      id: 'k3',
      type: 'text',
      x: 50,
      y: 70,
      scale: 1,
      rot: 0,
      text: '你也聽到了嗎？',
      font: 'type',
      color: '#ffffff',
      bg: 'none',
      align: 'center',
    },
  ];
  return {
    theme: 'light',
    profile: defaultProfile(),
    screen: defaultScreen(),
    posts: [p1, p2],
    stories: [s1, s2],
    account: defaultAccount(),
    feed: defaultFeed(['s1']),
    dm: defaultDm(),
  };
}

/* ---------- 貼文 ---------- */

/** 新增空白貼文（加在最後）；滿了回傳 null */
export function addPost(s: SocialState, friend = false): string | null {
  if (s.posts.length >= MAX.posts) return null;
  const id = nextId(
    'p',
    s.posts.map((p) => p.id),
  );
  const post = blankPost(id);
  if (friend) {
    post.friend = true;
    post.owner = newOwner(nextFriendNo(s));
  }
  const used = new Set(allCommentIds(s));
  for (const c of post.sheet.items) {
    c.id = nextId('c', used);
    used.add(c.id);
  }
  s.posts.push(post);
  return id;
}

/** 複製（放在後面；照片、留言換新的 id） */
export function duplicatePost(s: SocialState, id: string): string | null {
  const i = s.posts.findIndex((p) => p.id === id);
  if (i < 0 || s.posts.length >= MAX.posts) return null;
  const copy = cloneJson(s.posts[i]);
  copy.id = nextId(
    'p',
    s.posts.map((p) => p.id),
  );
  const photoIds = new Set(allPhotoIds(s));
  for (const x of copy.photos) {
    x.id = nextId('ph', photoIds);
    photoIds.add(x.id);
  }
  const commentIds = new Set(allCommentIds(s));
  for (const c of copy.sheet.items) {
    c.id = nextId('c', commentIds);
    commentIds.add(c.id);
  }
  s.posts.splice(i + 1, 0, copy);
  return copy.id;
}

/** 刪除（至少留一則）；回傳刪掉後該選取的 id（同位置，最後一則時往前）；不能刪時 null */
export function removePost(s: SocialState, id: string): string | null {
  const i = s.posts.findIndex((p) => p.id === id);
  if (i < 0 || s.posts.length <= 1) return null;
  s.posts.splice(i, 1);
  return s.posts[Math.min(i, s.posts.length - 1)].id;
}

function moveIn<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): boolean {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const [x] = list.splice(i, 1);
  list.splice(j, 0, x);
  return true;
}

export const movePost = (s: SocialState, id: string, delta: -1 | 1): boolean =>
  moveIn(s.posts, id, delta);

/* ---------- 照片 ---------- */

/** 加在最後，目前那張換到新加的第一張；回傳加了幾張（超過上限的不加） */
export function addPhotos(p: Post, images: readonly ImageRef[], used?: Iterable<string>): number {
  const room = Math.max(0, MAX.photos - p.photos.length);
  const list = images.slice(0, room);
  if (!list.length) return 0;
  const ids = new Set([...(used ?? []), ...p.photos.map((x) => x.id)]);
  const first = p.photos.length;
  for (const image of list) {
    const id = nextId('ph', ids);
    ids.add(id);
    p.photos.push(photo(id, image));
  }
  p.current = first;
  return list.length;
}

/** 拿掉第 i 張（第一張時格狀縮圖回到預設） */
export function removePhoto(p: Post, i: number): void {
  if (i < 0 || i >= p.photos.length) return;
  p.photos.splice(i, 1);
  if (i === 0) p.thumb = place0();
  p.current = Math.max(0, Math.min(p.current > i ? p.current - 1 : p.current, p.photos.length - 1));
}

/** 移動（拖曳或往前往後）；牽涉第一張時格狀縮圖回到預設；目前那張是移動的那張 */
export function movePhoto(p: Post, from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= p.photos.length || to >= p.photos.length) return;
  const [x] = p.photos.splice(from, 1);
  p.photos.splice(to, 0, x);
  if (from === 0 || to === 0) p.thumb = place0();
  p.current = to;
}

/** 換比例：每張照片在可以移動的範圍裡的比例不變（原作的 object-position；位置在新的框的範圍裡） */
export function setPostRatio(p: Post, ratio: Ratio): void {
  if (p.ratio === ratio) return;
  const from = ratioBox(p.ratio);
  const to = ratioBox(ratio);
  for (const x of p.photos) x.place = refitPlace(imageSize(x.image), from, to, x.place);
  p.ratio = ratio;
}

/* ---------- 留言 ---------- */

export function addComment(p: Post, used?: Iterable<string>): string | null {
  if (p.sheet.items.length >= MAX.comments) return null;
  const id = nextId('c', [...(used ?? []), ...p.sheet.items.map((c) => c.id)]);
  p.sheet.items.push(
    comment(id, { username: `user_${p.sheet.items.length + 1}`, time: '剛剛', text: '留言內容' }),
  );
  return id;
}

export const moveComment = (p: Post, id: string, delta: -1 | 1): boolean =>
  moveIn(p.sheet.items, id, delta);

export function removeComment(p: Post, id: string): void {
  p.sheet.items = p.sheet.items.filter((c) => c.id !== id);
}

/* ---------- 限時動態 ---------- */

/**
 * 新增限時動態（加在最後）：'blank'＝空白；'mine'＝空白並放進「我的限時動態」；'friend'＝朋友的（friend_N）。
 * 滿了回傳 null。
 */
export function addStory(
  s: SocialState,
  kind: 'blank' | 'mine' | 'friend' = 'blank',
): string | null {
  if (s.stories.length >= MAX.stories) return null;
  const id = nextId(
    's',
    s.stories.map((x) => x.id),
  );
  const st = kind === 'friend' ? friendStory(id, newOwner(nextFriendNo(s))) : blankStory(id);
  s.stories.push(st);
  if (kind === 'mine') s.feed.myStories = [...s.feed.myStories.filter((x) => x !== id), id];
  return id;
}

/** 複製（放在後面；貼紙換新的 id）。精選動態仍連到原本那則 */
export function duplicateStory(s: SocialState, id: string): string | null {
  const i = s.stories.findIndex((x) => x.id === id);
  if (i < 0 || s.stories.length >= MAX.stories) return null;
  const copy = cloneJson(s.stories[i]);
  copy.id = nextId(
    's',
    s.stories.map((x) => x.id),
  );
  const used = new Set(allStickerIds(s));
  for (const k of copy.stickers) {
    k.id = nextId('k', used);
    used.add(k.id);
  }
  s.stories.splice(i + 1, 0, copy);
  return copy.id;
}

/** 刪除（至少留一則）；連到它的精選動態改成無；回傳該選取的 id */
export function removeStory(s: SocialState, id: string): string | null {
  const i = s.stories.findIndex((x) => x.id === id);
  if (i < 0 || s.stories.length <= 1) return null;
  s.stories.splice(i, 1);
  for (const h of s.account.highlights) if (h.story === id) h.story = null;
  s.feed.myStories = s.feed.myStories.filter((x) => x !== id);
  return s.stories[Math.min(i, s.stories.length - 1)].id;
}

export const moveStory = (s: SocialState, id: string, delta: -1 | 1): boolean =>
  moveIn(s.stories, id, delta);

/* ---------- 首頁動態 ---------- */

/** 「我的限時動態」：放進去的、不是朋友的限時動態（照限時動態清單的順序） */
export function myStoryList(s: Pick<SocialState, 'stories' | 'feed'>): Story[] {
  const on = new Set(s.feed.myStories);
  return s.stories.filter((x) => !x.friend && on.has(x.id));
}

export interface FriendGroup {
  owner: Owner;
  stories: Story[];
}

/** 朋友的限時動態：同一個帳號（不分大小寫、去頭尾空白）的合成一個圈（同原作），照第一則的順序 */
export function friendGroups(s: Pick<SocialState, 'stories'>): FriendGroup[] {
  const out: FriendGroup[] = [];
  const by = new Map<string, FriendGroup>();
  for (const st of s.stories) {
    if (!st.friend) continue;
    const key = st.owner.username.trim().toLowerCase();
    let g = by.get(key);
    if (!g) {
      g = { owner: st.owner, stories: [] };
      by.set(key, g);
      out.push(g);
    }
    g.stories.push(st);
  }
  return out;
}

/** 放進／拿出「我的限時動態」 */
export function setMyStory(s: SocialState, id: string, on: boolean): void {
  const rest = s.feed.myStories.filter((x) => x !== id);
  s.feed.myStories = on ? [...rest, id] : rest;
}

/** 貼文、限時動態的帳號：朋友的用 owner（沒有帳號時 friend；沒有動態外圈），否則是自己的帳號 */
export function ownerOf(s: Pick<SocialState, 'profile'>, x: Post | Story): Profile {
  return x.friend
    ? {
        username: x.owner.username || 'friend',
        name: '',
        avatar: x.owner.avatar,
        verified: x.owner.verified,
        ring: false,
      }
    : s.profile;
}

/* ---------- 私訊 ---------- */

const allMessageIds = (s: Pick<SocialState, 'dm'>) =>
  s.dm.threads.flatMap((t) => t.messages.map((m) => m.id));

/** 新增對話（加在最後）；滿了回傳 null */
export function addThread(s: SocialState): string | null {
  if (s.dm.threads.length >= MAX.threads) return null;
  const id = nextId(
    't',
    s.dm.threads.map((t) => t.id),
  );
  const used = new Set(allMessageIds(s));
  const ids = [0, 1, 2].map(() => {
    const m = nextId('m', used);
    used.add(m);
    return m;
  }) as [string, string, string];
  s.dm.threads.push(newThread(id, s.dm.threads.length + 1, ids));
  return id;
}

/** 複製對話（放在後面；訊息換新的 id） */
export function duplicateThread(s: SocialState, id: string): string | null {
  const i = s.dm.threads.findIndex((t) => t.id === id);
  if (i < 0 || s.dm.threads.length >= MAX.threads) return null;
  const copy = cloneJson(s.dm.threads[i]);
  copy.id = nextId(
    't',
    s.dm.threads.map((t) => t.id),
  );
  const used = new Set(allMessageIds(s));
  for (const m of copy.messages) {
    m.id = nextId('m', used);
    used.add(m.id);
  }
  s.dm.threads.splice(i + 1, 0, copy);
  return copy.id;
}

/** 刪除對話（至少留一則）；回傳該選取的 id */
export function removeThread(s: SocialState, id: string): string | null {
  const i = s.dm.threads.findIndex((t) => t.id === id);
  if (i < 0 || s.dm.threads.length <= 1) return null;
  s.dm.threads.splice(i, 1);
  return s.dm.threads[Math.min(i, s.dm.threads.length - 1)].id;
}

export const moveThread = (s: SocialState, id: string, delta: -1 | 1): boolean =>
  moveIn(s.dm.threads, id, delta);

/** 新增一則訊息（加在最後；時間預設「今天 下午 3:00」）；滿了回傳 null */
export function addMessage(
  s: SocialState,
  threadId: string,
  from: MessageFrom,
  image: ImageRef | null = null,
): string | null {
  const t = s.dm.threads.find((x) => x.id === threadId);
  if (!t || t.messages.length >= MAX.messages) return null;
  const id = nextId('m', allMessageIds(s));
  t.messages.push({ ...message(id, from, from === 'time' ? '今天 下午 3:00' : ''), image });
  return id;
}

export const moveMessage = (t: Thread, id: string, delta: -1 | 1): boolean =>
  moveIn(t.messages, id, delta);

export function removeMessage(t: Thread, id: string): void {
  t.messages = t.messages.filter((m) => m.id !== id);
}

/** 對話的名稱：名稱，空白時帳號 */
export const threadTitle = (t: Thread): string => t.name || t.username || 'friend';

/** 訊息列表的預覽：設定的預覽，否則最後一則（不是時間的）訊息；照片時說明 */
export function threadPreview(t: Thread): string {
  if (t.preview) return t.preview;
  const last = [...t.messages].reverse().find((m) => m.from !== 'time');
  if (!last) return '';
  if (last.image && !last.text) return last.from === 'me' ? '你傳送了一張相片' : '傳送了一張相片';
  return (last.from === 'me' ? '你：' : '') + last.text;
}

/** 兩個顏色之間（t＝0～1） */
export function mixHex(a: string, b: string, t: number): string {
  const rgb = (h: string) => {
    const n = Number.parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/* ---------- 格子 ---------- */

export function setCellImage(st: Story, i: number, image: ImageRef): void {
  if (i < 0 || i >= CELL_SLOTS) return;
  st.cells[i] = { image, place: place0() };
}

export function clearCell(st: Story, i: number): void {
  if (i < 0 || i >= CELL_SLOTS) return;
  st.cells[i] = { image: null, place: place0() };
}

/**
 * 格子換了大小（換版面、間距）：看得到的格子保持比例（原作）；藏起來的格子兩邊的比例都記著（ax、ay），
 * 再出現時照比例放回新的格子。
 */
function relayoutCells(st: Story, before: readonly Size[]): void {
  const after = storyCellRects(st.layout, st.gap);
  st.cells.forEach((c, i) => {
    if (!c.image) return;
    const img = imageSize(c.image);
    const a = before[i];
    const b = after[i];
    if (a && b) c.place = refitPlace(img, a, b, c.place);
    else if (a) {
      const an = anchorOf(img, a, c.place);
      c.place = { ...c.place, ax: an.x, ay: an.y };
    } else if (b) {
      const p = c.place;
      const derived = anchorOf(img, b, fitPlace(img, b, p));
      c.place = placeAt(img, b, { x: p.ax ?? derived.x, y: p.ay ?? derived.y }, p.zoom, p.turns);
    }
  });
}

/** 換版面（選取回到第 1 格由畫面處理） */
export function setStoryLayout(st: Story, layout: StoryLayout): void {
  if (st.layout === layout) return;
  const before = storyCellRects(st.layout, st.gap);
  st.layout = layout;
  relayoutCells(st, before);
}

/** 換間距（格子變大變小） */
export function setStoryGap(st: Story, gap: number): void {
  if (st.gap === gap) return;
  const before = storyCellRects(st.layout, st.gap);
  st.gap = gap;
  relayoutCells(st, before);
}

/** 限時動態的封面：第一個有照片的格子（看得到的格子） */
export function storyCover(st: Story): ImageRef | null {
  return st.cells.slice(0, cellCount(st.layout)).find((c) => c.image)?.image ?? null;
}

/* ---------- 貼紙 ---------- */

export interface StickerInit {
  username?: string;
  image?: ImageRef;
}

/** 加一張貼紙（最上層；位置依張數錯開）；滿了回傳 null */
export function addSticker(
  st: Story,
  type: StickerType,
  init: StickerInit = {},
  used?: Iterable<string>,
): string | null {
  if (st.stickers.length >= MAX.stickers) return null;
  if (type === 'image' && !init.image) return null;
  const n = st.stickers.length;
  const id = nextId('k', [...(used ?? []), ...st.stickers.map((k) => k.id)]);
  const base = { id, x: 50 + ((n % 3) - 1) * 8, y: 28 + (n % 6) * 9, scale: 1, rot: 0 };
  let k: Sticker;
  switch (type) {
    case 'text':
      k = {
        ...base,
        type,
        text: '輸入文字',
        font: 'classic',
        color: '#ffffff',
        bg: 'none',
        align: 'center',
      };
      break;
    case 'emoji':
      k = { ...base, type, text: '✨' };
      break;
    case 'mention':
      k = { ...base, type, text: init.username || 'username', style: 'white' };
      break;
    case 'hashtag':
      k = { ...base, type, text: '主題標籤', style: 'white' };
      break;
    case 'location':
      k = { ...base, type, text: '霧港鎮', style: 'white' };
      break;
    case 'link':
      k = { ...base, type, text: '連結', style: 'white' };
      break;
    case 'music':
      k = { ...base, type, title: '曲名', artist: '歌手', image: null, dark: false };
      break;
    case 'question':
      k = { ...base, type, title: '問我任何事', hint: '輸入回答…', color: '#ffffff' };
      break;
    default:
      k = { ...base, type: 'image', image: init.image as ImageRef, frame: false };
  }
  st.stickers.push(k);
  return id;
}

export type StickerAction = 'front' | 'back' | 'dup' | 'center' | 'delete';

/** 貼紙的排列與其他（F64）；複製時回傳新的 id */
export function stickerAction(
  st: Story,
  id: string,
  action: StickerAction,
  used?: Iterable<string>,
): string | null {
  const i = st.stickers.findIndex((k) => k.id === id);
  if (i < 0) return null;
  const k = st.stickers[i];
  switch (action) {
    case 'front':
      st.stickers.splice(i, 1);
      st.stickers.push(k);
      return null;
    case 'back':
      st.stickers.splice(i, 1);
      st.stickers.unshift(k);
      return null;
    case 'dup': {
      if (st.stickers.length >= MAX.stickers) return null;
      const copy = cloneJson(k);
      copy.id = nextId('k', [...(used ?? []), ...st.stickers.map((x) => x.id)]);
      copy.x = k.x + 4;
      copy.y = k.y + 4;
      st.stickers.push(copy);
      return copy.id;
    }
    case 'center':
      k.x = 50;
      k.y = 50;
      return null;
    default:
      st.stickers.splice(i, 1);
      return null;
  }
}

/** 貼紙中心的範圍（%，同原作 −10～110） */
export const clampStickerPos = (v: number): number => Math.max(-10, Math.min(110, v));

/* ---------- 資產 ---------- */

function* imagesOf(s: SocialState): Generator<ImageRef | null> {
  yield s.profile.avatar;
  for (const p of s.posts) {
    yield p.owner.avatar;
    for (const x of p.photos) yield x.image;
    for (const c of p.sheet.items) yield c.avatar;
  }
  for (const st of s.stories) {
    yield st.owner.avatar;
    for (const c of st.cells) yield c.image;
    for (const k of st.stickers) {
      if (k.type === 'image' || k.type === 'music') yield k.image;
    }
  }
  for (const h of s.account.highlights) yield h.image;
  for (const g of s.account.grid) yield g.image;
  for (const t of s.dm.threads) {
    yield t.avatar;
    for (const m of t.messages) yield m.image;
  }
}

/** 狀態用到的資產 id（專案檔、圖片庫整理） */
export function collectAssetIds(s: SocialState): string[] {
  const out = new Set<string>();
  for (const img of imagesOf(s)) if (img?.kind === 'asset') out.add(img.id);
  return [...out];
}

/* ---------- 整理存檔（3.9） ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback: string): string =>
  typeof v === 'string' ? Array.from(v).slice(0, max).join('') : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
function num(
  v: unknown,
  [lo, hi]: readonly [number, number],
  fallback: number,
  int = false,
): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const x = int ? Math.round(v) : v;
  return Math.min(hi, Math.max(lo, x));
}
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}
const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;
const placeOf = (v: unknown): FramePlacement =>
  normalizePlacement(v, { minZoom: 1, maxZoom: ZOOM_MAX, limit: 10 });
/** 照片的位置：共用的位置＋剛好放得下的那一邊記著的比例（0～1） */
function photoPlaceOf(v: unknown): PhotoPlace {
  const p: PhotoPlace = placeOf(v);
  const o = isObj(v) ? v : {};
  const frac = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : undefined;
  const ax = frac(o.ax);
  const ay = frac(o.ay);
  if (ax !== undefined) p.ax = ax;
  if (ay !== undefined) p.ay = ay;
  return p;
}

/** 圖（不認得的回傳 null） */
export function normalizeImage(v: unknown): ImageRef | null {
  if (!isObj(v)) return null;
  if (v.kind === 'sample') return isSampleKey(v.key) ? { kind: 'sample', key: v.key } : null;
  if (v.kind !== 'asset' || typeof v.id !== 'string' || !v.id) return null;
  const w = typeof v.width === 'number' && v.width > 0 ? v.width : 0;
  const h = typeof v.height === 'number' && v.height > 0 ? v.height : 0;
  if (!w || !h) return null;
  return {
    kind: 'asset',
    id: v.id,
    name: typeof v.name === 'string' ? v.name : '',
    width: w,
    height: h,
  };
}

/** 依序給 id：沒有、重複、不是字串的換新的 */
function idFor(v: unknown, prefix: string, used: Set<string>): string {
  const id = typeof v === 'string' && v && !used.has(v) ? v : nextId(prefix, used);
  used.add(id);
  return id;
}

interface IdSets {
  posts: Set<string>;
  photos: Set<string>;
  comments: Set<string>;
  stories: Set<string>;
  stickers: Set<string>;
  highlights: Set<string>;
  grid: Set<string>;
}

function normalizeOwner(v: unknown, d: Owner): Owner {
  if (!isObj(v)) return d;
  return {
    username: str(v.username, LIMITS.username, d.username),
    avatar: normalizeImage(v.avatar),
    verified: bool(v.verified, d.verified),
  };
}

function normalizeComment(v: unknown, used: IdSets): Comment | null {
  if (!isObj(v)) return null;
  return {
    id: idFor(v.id, 'c', used.comments),
    avatar: normalizeImage(v.avatar),
    username: str(v.username, LIMITS.commentUser, ''),
    verified: bool(v.verified, false),
    time: str(v.time, LIMITS.commentTime, ''),
    text: str(v.text, LIMITS.commentText, ''),
    likes: str(v.likes, LIMITS.count, ''),
    liked: bool(v.liked, false),
    author: bool(v.author, false),
    pinned: bool(v.pinned, false),
    authorLiked: bool(v.authorLiked, false),
    reply: bool(v.reply, false),
    more: num(v.more, MORE_RANGE, 0, true),
  };
}

function normalizePost(v: unknown, used: IdSets): Post | null {
  if (!isObj(v)) return null;
  const id = idFor(v.id, 'p', used.posts);
  const d = blankPost(id);
  const photos: Photo[] = [];
  for (const x of Array.isArray(v.photos) ? v.photos : []) {
    if (!isObj(x) || photos.length >= MAX.photos) continue;
    const image = normalizeImage(x.image);
    if (!image) continue;
    photos.push({ id: idFor(x.id, 'ph', used.photos), image, place: photoPlaceOf(x.place) });
  }
  const ratio = oneOf(v.ratio, RATIOS, '4:5');
  /* 位置夾回蓋滿的範圍（3.9） */
  for (const x of photos) x.place = fitPlace(imageSize(x.image), ratioBox(ratio), x.place);
  const thumb = photos[0]
    ? fitPlace(imageSize(photos[0].image), { width: 1, height: 1 }, placeOf(v.thumb))
    : placeOf(v.thumb);
  const sheet = isObj(v.sheet) ? v.sheet : {};
  const items: Comment[] = [];
  if (Array.isArray(sheet.items)) {
    for (const c of sheet.items) {
      if (items.length >= MAX.comments) break;
      const n = normalizeComment(c, used);
      if (n) items.push(n);
    }
  } else {
    for (const c of d.sheet.items) {
      c.id = idFor(undefined, 'c', used.comments);
      items.push(c);
    }
  }
  return {
    id,
    photos,
    current: num(v.current, [0, Math.max(0, photos.length - 1)], 0, true),
    ratio,
    location: str(v.location, LIMITS.location, d.location),
    collab: str(v.collab, LIMITS.collab, d.collab),
    follow: bool(v.follow, d.follow),
    countStyle: oneOf(v.countStyle, ['inline', 'classic'] as const, 'inline'),
    likes: str(v.likes, LIMITS.count, d.likes),
    comments: str(v.comments, LIMITS.count, d.comments),
    reposts: str(v.reposts, LIMITS.count, d.reposts),
    shares: str(v.shares, LIMITS.count, d.shares),
    likedBy: str(v.likedBy, LIMITS.likedBy, d.likedBy),
    liked: bool(v.liked, d.liked),
    saved: bool(v.saved, d.saved),
    showRepost: bool(v.showRepost, d.showRepost),
    showShare: bool(v.showShare, d.showShare),
    commentsOff: bool(v.commentsOff, d.commentsOff),
    caption: str(v.caption, LIMITS.caption, d.caption),
    collapse: bool(v.collapse, d.collapse),
    time: str(v.time, LIMITS.postTime, d.time),
    thumb,
    sheet: {
      backdrop: bool(sheet.backdrop, true),
      height: oneOf(sheet.height, ['half', 'full'] as const, 'half'),
      items,
    },
    friend: bool(v.friend, false),
    owner: normalizeOwner(v.owner, d.owner),
    inFeed: bool(v.inFeed, true),
  };
}

function normalizeSticker(v: unknown, used: IdSets): Sticker | null {
  if (!isObj(v)) return null;
  const type = oneOf(v.type, STICKER_TYPES, 'text');
  if (v.type !== type) return null;
  const base = {
    id: '',
    x: clampStickerPos(num(v.x, [-10, 110], 50)),
    y: clampStickerPos(num(v.y, [-10, 110], 50)),
    scale: num(v.scale, STICKER_SCALE_RANGE, 1),
    rot: num(v.rot, [-180, 180], 0),
  };
  let k: Sticker;
  switch (type) {
    case 'text':
      k = {
        ...base,
        type,
        text: str(v.text, LIMITS.stickerText, ''),
        font: oneOf(v.font, STORY_FONTS, 'classic'),
        color: color(v.color, '#ffffff'),
        bg: oneOf(v.bg, TEXT_BGS, 'none'),
        align: oneOf(v.align, ALIGNS, 'center'),
      };
      break;
    case 'emoji':
      k = { ...base, type, text: str(v.text, LIMITS.emoji, '✨') };
      break;
    case 'mention':
    case 'hashtag':
    case 'location':
    case 'link':
      k = {
        ...base,
        type,
        text: str(v.text, LIMITS.chipText, ''),
        style: oneOf(v.style, CHIP_STYLES, 'white'),
      };
      break;
    case 'music':
      k = {
        ...base,
        type,
        title: str(v.title, LIMITS.musicTitle, ''),
        artist: str(v.artist, LIMITS.musicArtist, ''),
        image: normalizeImage(v.image),
        dark: bool(v.dark, false),
      };
      break;
    case 'question':
      k = {
        ...base,
        type,
        title: str(v.title, LIMITS.questionTitle, ''),
        hint: str(v.hint, LIMITS.questionHint, ''),
        color: color(v.color, '#ffffff'),
      };
      break;
    default: {
      const image = normalizeImage(v.image);
      if (!image) return null;
      k = { ...base, type: 'image', image, frame: bool(v.frame, false) };
    }
  }
  k.id = idFor(v.id, 'k', used.stickers);
  return k;
}

/**
 * fromVersion：存檔的資料版本。版本 3 以前的限時動態若還是舊的預設（3 段、第 1 段、40%），進度條改成 1 段
 * （原作 7b7411a 把預設改成 1 段，也同樣轉換舊的存檔）。
 */
function normalizeStory(v: unknown, used: IdSets, fromVersion: number): Story | null {
  if (!isObj(v)) return null;
  const id = idFor(v.id, 's', used.stories);
  const d = blankStory(id);
  const cells = emptyCells();
  if (Array.isArray(v.cells)) {
    v.cells.slice(0, CELL_SLOTS).forEach((c, i) => {
      if (!isObj(c)) return;
      cells[i] = { image: normalizeImage(c.image), place: photoPlaceOf(c.place) };
    });
  }
  const layout = oneOf(v.layout, STORY_LAYOUTS, d.layout);
  const gap = Math.round(num(v.gap, GAP_RANGE, d.gap) * 4) / 4;
  /* 看得到的格子的位置夾回蓋滿的範圍（3.9）；藏起來的格子不動（ax、ay 記著比例） */
  storyCellRects(layout, gap).forEach((r, i) => {
    const c = cells[i];
    if (c.image) c.place = fitPlace(imageSize(c.image), r, c.place);
  });
  const stickers: Sticker[] = [];
  for (const k of Array.isArray(v.stickers) ? v.stickers : []) {
    if (stickers.length >= MAX.stickers) break;
    const n = normalizeSticker(k, used);
    if (n) stickers.push(n);
  }
  const bg =
    typeof v.bg === 'string' && (isBgPreset(v.bg) || HEX.test(v.bg)) ? v.bg.toLowerCase() : d.bg;
  return {
    id,
    layout,
    cells,
    gap,
    gapColor: color(v.gapColor, d.gapColor),
    bg,
    stickers,
    showTop: bool(v.showTop, d.showTop),
    count:
      fromVersion < 3 && v.count === 3 && v.current === 1 && v.progress === 40
        ? 1
        : num(v.count, SEGMENTS_RANGE, d.count, true),
    current: num(v.current, SEGMENTS_RANGE, d.current, true),
    progress: num(v.progress, [0, 100], d.progress, true),
    time: str(v.time, LIMITS.storyTime, d.time),
    bottom: oneOf(v.bottom, ['reply', 'own', 'none'] as const, d.bottom),
    friend: bool(v.friend, false),
    owner: normalizeOwner(v.owner, d.owner),
    seen: bool(v.seen, false),
  };
}

function normalizeDm(v: unknown, used: Set<string>, msgUsed: Set<string>): Dm {
  const d = defaultDm();
  if (!isObj(v) || !Array.isArray(v.threads)) {
    for (const t of d.threads) {
      t.id = idFor(t.id, 't', used);
      for (const m of t.messages) m.id = idFor(m.id, 'm', msgUsed);
    }
    return isObj(v) ? { ...d, c1: color(v.c1, d.c1), c2: color(v.c2, d.c2) } : d;
  }
  const blank = newThread('', 1, ['', '', '']);
  const threads: Thread[] = [];
  for (const t of v.threads) {
    if (!isObj(t) || threads.length >= MAX.threads) continue;
    const messages: Message[] = [];
    for (const m of Array.isArray(t.messages) ? t.messages : []) {
      if (!isObj(m) || messages.length >= MAX.messages) continue;
      /* 時間的訊息只是不畫照片與反應，資料留著（改回一般的訊息時還在，同原作） */
      messages.push({
        id: idFor(m.id, 'm', msgUsed),
        from: oneOf(m.from, MESSAGE_FROM, 'me'),
        text: str(m.text, LIMITS.message, ''),
        image: normalizeImage(m.image),
        react: str(m.react, LIMITS.react, ''),
      });
    }
    threads.push({
      id: idFor(t.id, 't', used),
      username: str(t.username, LIMITS.username, ''),
      name: str(t.name, LIMITS.threadName, ''),
      avatar: normalizeImage(t.avatar),
      verified: bool(t.verified, false),
      online: bool(t.online, false),
      active: str(t.active, LIMITS.threadActive, blank.active),
      time: str(t.time, LIMITS.threadTime, blank.time),
      unread: bool(t.unread, false),
      preview: str(t.preview, LIMITS.threadPreview, ''),
      seen: str(t.seen, LIMITS.threadSeen, blank.seen),
      intro: bool(t.intro, true),
      messages,
    });
  }
  if (!threads.length) return normalizeDm(undefined, used, msgUsed);
  return { c1: color(v.c1, d.c1), c2: color(v.c2, d.c2), threads };
}

/** 首頁動態：沒有存過時「我的限時動態」是第一則自己的限時動態（同原作的預設） */
function normalizeFeed(v: unknown, stories: readonly Story[]): Feed {
  const mine = stories.filter((x) => !x.friend);
  const d = defaultFeed(mine[0] ? [mine[0].id] : []);
  if (!isObj(v)) return d;
  const ok = new Set(mine.map((x) => x.id));
  const list = Array.isArray(v.myStories)
    ? [...new Set(v.myStories.filter((x): x is string => typeof x === 'string' && ok.has(x)))]
    : d.myStories;
  return {
    logo: str(v.logo, LIMITS.feedLogo, d.logo),
    heartDot: bool(v.heartDot, d.heartDot),
    dmBadge: str(v.dmBadge, LIMITS.dmBadge, d.dmBadge),
    myStories: list,
  };
}

function normalizeAccount(v: unknown, used: IdSets, storyIds: Set<string>): Account {
  const d = defaultAccount();
  if (!isObj(v)) {
    for (const h of d.highlights) if (h.story && !storyIds.has(h.story)) h.story = null;
    return d;
  }
  const highlights: Highlight[] = [];
  for (const h of Array.isArray(v.highlights) ? v.highlights : []) {
    if (!isObj(h) || highlights.length >= MAX.highlights) continue;
    const story = typeof h.story === 'string' && storyIds.has(h.story) ? h.story : null;
    highlights.push({
      id: idFor(h.id, 'h', used.highlights),
      title: str(h.title, LIMITS.highlightTitle, ''),
      image: normalizeImage(h.image),
      story,
    });
  }
  const grid: GridPhoto[] = [];
  for (const g of Array.isArray(v.grid) ? v.grid : []) {
    if (!isObj(g) || grid.length >= MAX.grid) continue;
    const image = normalizeImage(g.image);
    if (image) grid.push({ id: idFor(g.id, 'g', used.grid), image });
  }
  return {
    own: bool(v.own, d.own),
    private: bool(v.private, d.private),
    nav: bool(v.nav, d.nav),
    showHL: bool(v.showHL, d.showHL),
    posts: str(v.posts, LIMITS.count, d.posts),
    followers: str(v.followers, LIMITS.count, d.followers),
    following: str(v.following, LIMITS.count, d.following),
    category: str(v.category, LIMITS.category, d.category),
    bio: str(v.bio, LIMITS.bio, d.bio),
    link: str(v.link, LIMITS.link, d.link),
    mutual: str(v.mutual, LIMITS.mutual, d.mutual),
    highlights: Array.isArray(v.highlights) ? highlights : d.highlights,
    grid: Array.isArray(v.grid) ? grid : d.grid,
    placeholders: num(v.placeholders, PLACEHOLDER_RANGE, d.placeholders, true),
  };
}

/** 資料版本（store、專案檔共用；3：朋友身分、首頁動態、私訊，限時動態的進度條預設 1 段） */
export const MODEL_VERSION = 3;

/** 存檔、專案檔讀回來的內容（壞掉的部分換成預設）；fromVersion＝存檔的資料版本（舊版本的轉換） */
export function normalizeState(raw: unknown, fromVersion = MODEL_VERSION): SocialState {
  if (!isObj(raw)) return initialState();
  const init = initialState();
  const used: IdSets = {
    posts: new Set(),
    photos: new Set(),
    comments: new Set(),
    stories: new Set(),
    stickers: new Set(),
    highlights: new Set(),
    grid: new Set(),
  };
  const pr = isObj(raw.profile) ? raw.profile : {};
  const sc = isObj(raw.screen) ? raw.screen : {};
  let posts: Post[];
  if (Array.isArray(raw.posts)) {
    posts = raw.posts.slice(0, MAX.posts).flatMap((p) => normalizePost(p, used) ?? []);
    if (!posts.length) posts = [normalizePost(blankPost('p1'), used) as Post];
  } else posts = init.posts.map((p) => normalizePost(p, used) as Post);
  let stories: Story[];
  if (Array.isArray(raw.stories)) {
    stories = raw.stories
      .slice(0, MAX.stories)
      .flatMap((x) => normalizeStory(x, used, fromVersion) ?? []);
    if (!stories.length) stories = [normalizeStory(blankStory('s1'), used, MODEL_VERSION) as Story];
  } else stories = init.stories.map((x) => normalizeStory(x, used, MODEL_VERSION) as Story);
  const storyIds = new Set(stories.map((x) => x.id));
  return {
    theme: oneOf(raw.theme, ['light', 'dark'] as const, 'light'),
    profile: {
      username: str(pr.username, LIMITS.username, init.profile.username),
      name: str(pr.name, LIMITS.name, init.profile.name),
      avatar: 'avatar' in pr ? normalizeImage(pr.avatar) : init.profile.avatar,
      verified: bool(pr.verified, init.profile.verified),
      ring: bool(pr.ring, init.profile.ring),
    },
    screen: {
      status: bool(sc.status, true),
      icons: bool(sc.icons, true),
      clock: str(sc.clock, LIMITS.clock, init.screen.clock),
      battery: num(sc.battery, BATTERY_RANGE, 100, true),
      fontScale: Math.round(num(sc.fontScale, FONT_SCALE_RANGE, 1) * 20) / 20,
    },
    posts,
    stories,
    account: normalizeAccount(raw.account, used, storyIds),
    feed: normalizeFeed(raw.feed, stories),
    dm: normalizeDm(raw.dm, new Set(), new Set()),
  };
}
