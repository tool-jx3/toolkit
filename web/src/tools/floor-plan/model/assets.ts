/**
 * 家具與小物的目錄（名稱、分類、預設尺寸、擺放規則、標籤）。畫法在 draw/furniture/。
 * 尺寸以格（0.5 m）為單位，是「背面朝上（y＝0 那邊靠牆）」時的寬 × 深。
 * id 與原作的存檔相同（讀得到原作的 .trpgmap.json）；名稱、分類、標籤、畫法是本站自己的。
 *
 * 2026-10 第三批（原作 v1.05～v1.10 的家具擴充）：143 種 → 381 種、14 類 → 23 類（規格 F232、3.11）。
 * 原作新增的 234 種用同樣的代號（讀原作的檔照讀），另外加了 4 種本站自己的貼牆素材；
 * 「貼牆」的素材（裂痕、崩塌、彈孔…）放在牆上、跟著牆的方向，畫在牆的上面（F233）。
 */
import { matchesQuery, queryWords, type TagId } from './tags';

export type AssetGroupId =
  | 'structure'
  | 'wall'
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bath'
  | 'office'
  | 'medical'
  | 'school'
  | 'leisure'
  | 'infra'
  | 'security'
  | 'railway'
  | 'vehicle'
  | 'industry'
  | 'street'
  | 'nature'
  | 'japanese'
  | 'garden'
  | 'investigation'
  | 'occult'
  | 'people'
  | 'sf'
  | 'fantasy';

export interface AssetInfo {
  id: string;
  group: AssetGroupId;
  name: string;
  w: number;
  h: number;
  /** 畫在其他家具底下（地毯、血跡、舞台…） */
  under?: boolean;
  /** 自己在圖形裡畫標籤（證物標示牌的號碼），不另外畫在中央 */
  labelInside?: boolean;
  /** 放在牆邊時背面自動朝牆 */
  orient?: boolean;
  /**
   * 貼牆素材（2026-10 第三批，F233）：放的時候長邊的中心線吸到最近的牆線、跟著牆的方向，
   * 畫在牆與門窗的上面（不切開牆）。畫的時候 y＝h/2 是牆線。
   */
  wall?: boolean;
  /** 上下樓層的連接（樓梯、電梯、梯子…）：下一層的位置淡淡地畫出來（F55） */
  vertical?: boolean;
  /** 搜尋用的別名 */
  keys?: string;
  /** 標籤（分類預設的＋各自的；搜尋用，`#標籤`） */
  tags: readonly TagId[];
}

export const ASSET_GROUPS: readonly { id: AssetGroupId; name: string }[] = [
  { id: 'structure', name: '樓梯・結構' },
  { id: 'wall', name: '貼牆素材' },
  { id: 'living', name: '客廳' },
  { id: 'bedroom', name: '臥室' },
  { id: 'kitchen', name: '廚房' },
  { id: 'bath', name: '衛浴' },
  { id: 'office', name: '辦公・商店' },
  { id: 'medical', name: '醫院・研究' },
  { id: 'school', name: '學校・文化' },
  { id: 'leisure', name: '娛樂・運動' },
  { id: 'infra', name: '設備・管線' },
  { id: 'security', name: '軍事・保全' },
  { id: 'railway', name: '鐵道・車站' },
  { id: 'vehicle', name: '車輛・船・飛機' },
  { id: 'industry', name: '倉儲・工地' },
  { id: 'street', name: '街道・公園' },
  { id: 'nature', name: '自然・露營' },
  { id: 'japanese', name: '和風・寺社' },
  { id: 'garden', name: '日式庭園' },
  { id: 'investigation', name: '調查・證物' },
  { id: 'occult', name: '恐怖・神祕' },
  { id: 'people', name: '人物・生物' },
  { id: 'sf', name: '科幻' },
  { id: 'fantasy', name: '奇幻・中世' },
];

/** 每一類預設的標籤（各自的標籤加在後面） */
export const GROUP_TAGS: Readonly<Record<AssetGroupId, readonly TagId[]>> = {
  structure: [],
  wall: ['wallmount'],
  living: ['indoor', 'home'],
  bedroom: ['indoor', 'home'],
  kitchen: ['indoor', 'home', 'modern'],
  bath: ['indoor', 'home', 'modern'],
  office: ['indoor', 'office', 'modern'],
  medical: ['indoor', 'medical', 'modern'],
  school: ['indoor', 'school'],
  leisure: ['indoor', 'leisure'],
  infra: ['machinery', 'modern'],
  security: ['military', 'modern'],
  railway: ['railway', 'transport', 'modern'],
  vehicle: ['transport', 'modern'],
  industry: ['industrial', 'modern'],
  street: ['outdoor', 'modern'],
  nature: ['outdoor', 'wild'],
  japanese: ['japanese', 'historic'],
  garden: ['japanese', 'garden', 'outdoor'],
  investigation: [],
  occult: ['horror'],
  people: ['creature'],
  sf: ['scifi', 'nearfuture'],
  fantasy: ['fantasy', 'historic'],
};

interface Extra {
  under?: boolean;
  labelInside?: boolean;
  orient?: boolean;
  wall?: boolean;
  vertical?: boolean;
  keys?: string;
  tags?: readonly TagId[];
}

const A = (
  id: string,
  group: AssetGroupId,
  w: number,
  h: number,
  name: string,
  extra: Extra = {},
): AssetInfo => {
  const { tags = [], ...rest } = extra;
  return { id, group, w, h, name, ...rest, tags: [...new Set([...GROUP_TAGS[group], ...tags])] };
};
const O: Extra = { orient: true };
const U: Extra = { under: true };
/** 貼牆素材 */
const W = (tags: readonly TagId[], keys?: string): Extra => ({ wall: true, tags, keys });

export const ASSETS: readonly AssetInfo[] = [
  /* ---------- 樓梯・結構 ---------- */
  A('stairs', 'structure', 2, 5, '樓梯', { vertical: true, keys: '階梯', tags: ['indoor'] }),
  A('stairs_u', 'structure', 5, 5, '折返樓梯', { vertical: true, keys: '階梯', tags: ['indoor'] }),
  A('spiral', 'structure', 4, 4, '螺旋梯', { vertical: true, keys: '樓梯 階梯' }),
  A('elevator', 'structure', 4, 4, '電梯', {
    vertical: true,
    keys: '升降梯',
    tags: ['indoor', 'modern'],
  }),
  A('pillar', 'structure', 1, 1, '柱子'),
  A('fireplace', 'structure', 3, 1.2, '壁爐', {
    orient: true,
    tags: ['indoor', 'home', 'historic'],
  }),
  /* 2026-10 第三批 */
  A('stairs_down', 'structure', 2, 5, '往地下的樓梯', {
    vertical: true,
    keys: '樓梯 階梯 地下室',
    tags: ['indoor', 'underground'],
  }),
  A('trapdoor', 'structure', 2, 2, '地板的暗門', {
    vertical: true,
    keys: '活板門 地窖 地下室',
    tags: ['underground', 'hidden'],
  }),
  A('ladder', 'structure', 1.2, 3, '梯子', { vertical: true, keys: '爬梯 樓梯' }),
  A('fire_escape', 'structure', 5, 6, '戶外逃生梯', {
    vertical: true,
    orient: true,
    keys: '樓梯 太平梯 鐵梯',
    tags: ['outdoor', 'modern'],
  }),
  A('ext_stairs', 'structure', 2.4, 6, '戶外樓梯', {
    vertical: true,
    orient: true,
    keys: '樓梯 階梯',
    tags: ['outdoor'],
  }),
  A('temp_stairs', 'structure', 2, 5, '施工便梯', {
    vertical: true,
    keys: '樓梯 工地',
    tags: ['industrial'],
  }),
  A('handrail', 'structure', 4, 0.3, '扶手', { keys: '欄杆' }),
  A('vent', 'structure', 1, 1, '通風口', { keys: '排氣口 通氣孔', tags: ['hidden'] }),
  A('duct', 'structure', 6, 1, '通風管', { keys: '風管 管道', tags: ['industrial'] }),
  A('manhole', 'structure', 1.4, 1.4, '人孔蓋', {
    under: true,
    keys: '下水道 孔蓋',
    tags: ['outdoor', 'underground'],
  }),
  A('gutter', 'structure', 6, 0.6, '排水溝', { under: true, keys: '水溝', tags: ['outdoor'] }),
  A('grating', 'structure', 2, 1, '水溝蓋（格柵）', {
    under: true,
    keys: '格柵 水溝',
    tags: ['outdoor'],
  }),

  /* ---------- 貼牆素材（2026-10 第三批） ---------- */
  A('crack_wall', 'wall', 3, 0.8, '牆上的裂痕', W(['damaged', 'ruins'], '裂縫 龜裂')),
  A('collapse_wall', 'wall', 3, 1.6, '崩塌的牆面', W(['damaged', 'ruins', 'danger'], '倒塌 瓦礫')),
  A('wall_hole', 'wall', 2, 1, '打穿的牆洞', W(['damaged', 'ruins'], '破洞 牆洞')),
  A('bullet_holes', 'wall', 1.2, 0.8, '彈孔', W(['damaged', 'danger', 'evidence'], '槍 子彈')),
  A('tendrils', 'wall', 4, 3, '觸手侵蝕', W(['horror', 'danger'], '藤蔓 觸手 侵蝕')),
  A('wall_graffiti', 'wall', 3, 0.6, '牆上的塗鴉', W(['ruins'], '噴漆 塗寫')),
  A('wall_claws', 'wall', 1.6, 0.8, '爪痕', W(['horror', 'danger'], '抓痕 怪物')),
  A('wall_blood', 'wall', 1.6, 0.8, '血手印', W(['horror', 'evidence'], '血跡 手印')),
  A('wall_mold', 'wall', 2.4, 1, '霉斑・水漬', W(['ruins', 'damaged'], '發霉 漏水 污漬')),

  /* ---------- 客廳 ---------- */
  A('sofa2', 'living', 3.2, 1.8, '雙人沙發', O),
  A('sofa3', 'living', 4.4, 1.8, '三人沙發', O),
  A('sofaL', 'living', 5, 4, 'L 型沙發', O),
  A('armchair', 'living', 1.8, 1.8, '單人扶手椅', { orient: true, keys: '沙發 椅子' }),
  A('lowtable', 'living', 2.2, 1.2, '茶几', { keys: '桌子' }),
  A('dining2', 'living', 2.2, 3.2, '餐桌組（2 人）', { keys: '桌子 椅子' }),
  A('dining4', 'living', 3, 3.4, '餐桌組（4 人）', { keys: '桌子 椅子' }),
  A('dining6', 'living', 4.4, 3.4, '餐桌組（6 人）', { keys: '桌子 椅子' }),
  A('dining_round', 'living', 3.4, 3.4, '圓餐桌（4 人）', { keys: '桌子 椅子' }),
  A('table', 'living', 2.8, 1.6, '桌子'),
  A('table_round', 'living', 1.8, 1.8, '圓桌', { keys: '桌子' }),
  A('chair', 'living', 1, 1, '椅子'),
  A('tv', 'living', 3.2, 0.9, '電視櫃', { orient: true, tags: ['modern'] }),
  A('bookshelf', 'living', 3, 0.8, '書架', { orient: true, keys: '書櫃' }),
  A('cabinet', 'living', 3, 1, '櫃子', { orient: true, keys: '收納' }),
  A('rug', 'living', 4, 3, '地毯', U),
  A('plant', 'living', 1.2, 1.2, '盆栽', { keys: '植物' }),
  A('lamp', 'living', 0.9, 0.9, '立燈', { keys: '燈' }),
  A('piano', 'living', 3, 3.8, '平台鋼琴', { tags: ['leisure'] }),
  A('piano_up', 'living', 3, 1.3, '直立鋼琴', { orient: true, tags: ['leisure'] }),
  A('gramophone', 'living', 1.4, 1.4, '留聲機', { keys: '唱機', tags: ['retro'] }),

  /* ---------- 臥室 ---------- */
  A('bed_single', 'bedroom', 2, 4, '單人床', O),
  A('bed_double', 'bedroom', 2.8, 4, '雙人床', O),
  A('futon', 'bedroom', 2, 4, '和式床墊', { keys: '床 被子', tags: ['japanese'] }),
  A('wardrobe', 'bedroom', 3, 1.2, '衣櫃', O),
  A('dresser', 'bedroom', 2, 0.9, '五斗櫃・梳妝台', O),
  A('nightstand', 'bedroom', 0.9, 0.9, '床頭櫃', O),
  A('desk', 'bedroom', 2.4, 1.2, '書桌', { orient: true, keys: '桌子' }),
  A('desk_set', 'bedroom', 2.4, 2.4, '書桌與椅子', { orient: true, keys: '桌子' }),
  A('bed_canopy', 'bedroom', 3.2, 4.2, '天篷床', {
    orient: true,
    keys: '床 公主床 洋館',
    tags: ['historic'],
  }),
  A('bunk_bed', 'bedroom', 2, 4, '上下舖', {
    orient: true,
    keys: '床 雙層床 宿舍',
    tags: ['military', 'school'],
  }),

  /* ---------- 廚房 ---------- */
  A('kitchen', 'kitchen', 5, 1.3, '流理台', { orient: true, keys: '系統廚具' }),
  A('sink', 'kitchen', 2, 1.3, '水槽', O),
  A('stove', 'kitchen', 2, 1.3, '瓦斯爐', { orient: true, keys: '爐子' }),
  A('fridge', 'kitchen', 1.4, 1.4, '冰箱', O),
  A('island', 'kitchen', 4, 2, '廚房中島'),
  A('counter', 'kitchen', 4, 1.2, '吧台・工作台', { orient: true, tags: ['shop'] }),
  A('cupboard', 'kitchen', 3, 0.9, '碗櫃', O),

  /* ---------- 衛浴 ---------- */
  A('toilet', 'bath', 1, 1.6, '馬桶', { orient: true, keys: '廁所' }),
  A('washbasin', 'bath', 1.6, 1.1, '洗手台', { orient: true, keys: '洗臉台' }),
  A('bathtub', 'bath', 1.6, 3, '浴缸', O),
  A('unitbath', 'bath', 3, 3.2, '浴缸＋淋浴區', { keys: '浴室' }),
  A('shower', 'bath', 1.8, 1.8, '淋浴間', O),
  A('washer', 'bath', 1.3, 1.3, '洗衣機', O),

  /* ---------- 辦公・商店 ---------- */
  A('office_desk', 'office', 2.4, 1.4, '辦公桌', { orient: true, keys: '桌子' }),
  A('meeting6', 'office', 4.8, 3.6, '會議桌（6 人）', { keys: '桌子' }),
  A('reception', 'office', 5, 1.4, '接待櫃台', { orient: true, keys: '櫃檯', tags: ['public'] }),
  A('locker', 'office', 3, 1, '置物櫃', { orient: true, tags: ['school'] }),
  A('filing', 'office', 1, 1.2, '文件櫃', O),
  A('whiteboard', 'office', 3, 0.4, '白板・黑板', { orient: true, tags: ['school'] }),
  A('copier', 'office', 1.4, 1.2, '影印機', O),
  A('bench', 'office', 4, 1, '長椅', { orient: true, keys: '椅子', tags: ['public'] }),
  A('vending', 'office', 2, 1.4, '自動販賣機', { orient: true, tags: ['public', 'shop'] }),
  A('barber_chair', 'office', 1.6, 2, '理髮椅', {
    orient: true,
    keys: '椅子 理髮廳',
    tags: ['retro', 'shop'],
  }),
  A('store_shelf', 'office', 4, 1.6, '商品貨架', {
    keys: '便利商店 超市 架子',
    tags: ['shop', 'public'],
  }),
  A('register', 'office', 3, 1.4, '收銀台', {
    orient: true,
    keys: '櫃檯 便利商店 結帳',
    tags: ['shop'],
  }),
  A('fridge_case', 'office', 4, 1.2, '冷藏展示櫃', {
    orient: true,
    keys: '冰箱 便利商店 飲料',
    tags: ['shop'],
  }),
  A('atm', 'office', 1.4, 1, '提款機', {
    orient: true,
    keys: 'ATM 銀行',
    tags: ['shop', 'public'],
  }),
  A('desk_island', 'office', 5, 5, '四人辦公桌島', { keys: '桌子 座位 辦公室' }),
  A('partition', 'office', 4, 0.3, '辦公隔板', { keys: '屏風 隔間' }),
  A('monitor_wall', 'office', 6, 0.6, '監控螢幕牆', {
    orient: true,
    keys: '監視 螢幕 指揮中心',
    tags: ['military'],
  }),

  /* ---------- 醫院・研究 ---------- */
  A('hospital_bed', 'medical', 2.2, 4.2, '病床', { orient: true, keys: '床' }),
  A('exam_bed', 'medical', 1.4, 3.6, '診療床', { orient: true, keys: '床' }),
  A('op_table', 'medical', 3, 4.4, '手術台'),
  A('med_cabinet', 'medical', 3, 1, '藥品櫃', O),
  A('wheelchair', 'medical', 1.3, 1.4, '輪椅'),
  A('iv_stand', 'medical', 0.7, 0.7, '點滴架'),
  A('curtain', 'medical', 4, 0.3, '隔簾', { keys: '簾子' }),
  A('morgue', 'medical', 4.2, 2.4, '屍體冷藏櫃', {
    orient: true,
    keys: '停屍間',
    tags: ['horror'],
  }),
  A('lab_bench', 'medical', 4, 1.6, '實驗台', { orient: true, tags: ['research'] }),
  A('tank', 'medical', 2.4, 2.4, '培養槽・儲槽', { tags: ['research', 'scifi'] }),
  A('rack', 'medical', 1.4, 2, '伺服器機櫃', { orient: true, keys: '電腦', tags: ['research'] }),
  A('fume_hood', 'medical', 3, 1.2, '排煙櫃', {
    orient: true,
    keys: '實驗 化學 抽風',
    tags: ['research'],
  }),
  A('microscope', 'medical', 1, 1, '顯微鏡', { keys: '實驗', tags: ['research', 'school'] }),
  A('freezer', 'medical', 1.6, 1.4, '超低溫冷凍櫃', {
    orient: true,
    keys: '冰箱 樣本',
    tags: ['research'],
  }),
  A('decon_shower', 'medical', 2, 2, '除污淋浴間', {
    keys: '消毒 淋浴',
    tags: ['research', 'danger'],
  }),

  /* ---------- 學校・文化 ---------- */
  A('school_desk', 'school', 1.4, 2, '課桌椅', { keys: '桌子 椅子' }),
  A('lectern', 'school', 1.8, 1.1, '講桌・講台'),
  A('lecture_row', 'school', 7.2, 2, '大教室長桌', { keys: '桌子 椅子' }),
  A('bookstack', 'school', 4, 1.4, '雙面書架', { keys: '書櫃 圖書館', tags: ['public'] }),
  A('display_case', 'school', 2.4, 1.6, '展示櫃', { keys: '博物館 玻璃櫃', tags: ['public'] }),
  A('painting', 'school', 3, 0.3, '掛畫', {
    orient: true,
    keys: '畫 油畫 畫框 美術館',
    tags: ['public', 'home'],
  }),
  A('pedestal', 'school', 1.6, 1.6, '雕塑展台', { keys: '美術館 博物館 雕像', tags: ['public'] }),
  A('rope_barrier', 'school', 4, 0.4, '紅龍柱', { keys: '欄柱 排隊 圍欄', tags: ['public'] }),
  A('skeleton', 'school', 12, 6, '恐龍骨架', {
    keys: '化石 標本 博物館',
    tags: ['public', 'large'],
  }),
  A('organ', 'school', 4, 1.6, '管風琴', { orient: true, keys: '樂器 教堂', tags: ['religious'] }),
  A('font', 'school', 1.4, 1.4, '聖洗池', { keys: '教堂 洗禮', tags: ['religious'] }),
  A('confessional', 'school', 3, 2.4, '告解室', {
    orient: true,
    keys: '教堂',
    tags: ['religious'],
  }),

  /* ---------- 娛樂・運動 ---------- */
  A('stage', 'leisure', 12, 6, '舞台', { under: true, orient: true }),
  A('seats', 'leisure', 6, 1.2, '觀眾席（一排）', { keys: '椅子 座位' }),
  A('pew', 'leisure', 6, 1.2, '教堂長椅', { keys: '椅子', tags: ['religious'] }),
  A('speaker', 'leisure', 1.2, 1, '喇叭', { keys: '音響' }),
  A('drums', 'leisure', 3.2, 2.8, '爵士鼓', { keys: '樂器' }),
  A('mixer', 'leisure', 3, 1.4, '混音台', { keys: '音控' }),
  A('stool', 'leisure', 0.8, 0.8, '高腳椅', { keys: '椅子' }),
  A('booth', 'leisure', 3, 4, '卡座', { keys: '沙發 桌子', tags: ['shop'] }),
  A('billiards', 'leisure', 5, 2.8, '撞球台'),
  A('banquet_round', 'leisure', 5.6, 5.6, '宴會圓桌（8 人）', { keys: '桌子' }),
  A('pool', 'leisure', 12, 25, '游泳池', { under: true, keys: '泳池' }),
  A('deck_chair', 'leisure', 1.4, 3.6, '躺椅', { keys: '椅子' }),
  A('treadmill', 'leisure', 1.8, 4, '跑步機', { keys: '健身' }),
  A('exercise_bike', 'leisure', 1.2, 2.6, '飛輪健身車', { keys: '健身' }),
  A('weight_bench', 'leisure', 3, 3.2, '臥推架', { keys: '健身' }),
  A('dumbbell_rack', 'leisure', 3, 1, '啞鈴架', { orient: true, keys: '健身' }),

  /* ---------- 設備・管線（2026-10 第三批） ---------- */
  A('breaker', 'infra', 1, 0.4, '電箱（總開關）', {
    orient: true,
    keys: '斷路器 停電 開關',
    tags: ['indoor'],
  }),
  A('dist_board', 'infra', 2, 0.6, '配電盤', { orient: true, keys: '電箱 電力', tags: ['indoor'] }),
  A('control_panel', 'infra', 2.4, 0.8, '控制箱', {
    orient: true,
    keys: '操作盤 機房',
    tags: ['industrial'],
  }),
  A('service_entrance', 'infra', 1, 0.6, '電錶箱', { orient: true, keys: '電表 進線' }),
  A('cable_rack', 'infra', 6, 0.6, '電纜架', { keys: '電線 線槽', tags: ['industrial'] }),
  A('pipe', 'infra', 6, 0.4, '管線', { keys: '管子 配管' }),
  A('pipe_big', 'infra', 8, 1.2, '大型管線', { keys: '管子 配管 工廠', tags: ['industrial'] }),
  A('water_pipe', 'infra', 6, 0.5, '水管', { keys: '自來水 管子' }),
  A('valve', 'infra', 0.8, 0.8, '閥門', { keys: '開關 水龍頭' }),
  A('pump', 'infra', 2, 1.4, '抽水馬達', { keys: '幫浦 泵' }),
  A('boiler', 'infra', 3, 2.4, '鍋爐', { orient: true, keys: '熱水 機房', tags: ['industrial'] }),
  A('big_tank', 'infra', 5, 5, '大型儲槽', { keys: '槽 油槽 水槽', tags: ['industrial', 'large'] }),
  A('em_generator', 'infra', 4, 2, '緊急發電機', { keys: '發電 停電 機房' }),
  A('ac_unit', 'infra', 1.8, 0.8, '冷氣室外機', {
    orient: true,
    keys: '空調 冷氣',
    tags: ['outdoor', 'rooftop'],
  }),
  A('water_tower', 'infra', 4, 4, '水塔', { keys: '水槽', tags: ['outdoor', 'rooftop'] }),
  A('vent_unit', 'infra', 2, 2, '排風機', { keys: '風扇 通風', tags: ['rooftop'] }),
  A('antenna', 'infra', 2, 2, '天線', { keys: '電波 基地台', tags: ['outdoor', 'rooftop'] }),
  A('extinguisher', 'infra', 0.6, 0.6, '滅火器', { orient: true, keys: '消防', tags: ['public'] }),
  A('hydrant', 'infra', 1.2, 0.4, '消防栓', { orient: true, keys: '消防 水帶', tags: ['public'] }),
  A('sluice', 'infra', 6, 1, '水閘門', {
    keys: '水門 下水道',
    tags: ['waterside', 'underground'],
  }),

  /* ---------- 軍事・保全（2026-10 第三批） ---------- */
  A('ops_table', 'security', 5, 3.6, '作戰沙盤桌', { keys: '地圖 指揮 桌子', tags: ['indoor'] }),
  A('radio', 'security', 2, 1, '無線電台', { orient: true, keys: '通訊 對講機', tags: ['indoor'] }),
  A('gun_rack', 'security', 3, 0.8, '槍架', { orient: true, keys: '武器 步槍', tags: ['danger'] }),
  A('tank_mil', 'security', 7, 14, '戰車', {
    keys: '坦克 車輛',
    tags: ['outdoor', 'transport', 'large'],
  }),
  A('sandbags', 'security', 4, 1.2, '沙包牆', { keys: '土袋 掩體 防洪', tags: ['outdoor'] }),
  A('cctv', 'security', 0.6, 0.6, '監視器', { orient: true, keys: '攝影機 鏡頭' }),
  A('card_reader', 'security', 0.5, 0.3, '門禁刷卡機', { orient: true, keys: '門禁 感應' }),
  A('alarm', 'security', 0.6, 0.4, '警報器', { orient: true, keys: '警鈴 防盜' }),

  /* ---------- 鐵道・車站（2026-10 第三批） ---------- */
  A('rail_track', 'railway', 4, 12, '鐵軌', { under: true, keys: '軌道 線路' }),
  A('sleepers', 'railway', 4, 8, '枕木', { under: true, keys: '軌道 廢線' }),
  A('rail_switch', 'railway', 8, 16, '轉轍器（道岔）', { under: true, keys: '軌道 分岔' }),
  A('buffer_stop', 'railway', 4, 2, '車擋', { keys: '軌道 終點' }),
  A('platform_edge', 'railway', 12, 1, '月台邊緣（導盲磚）', {
    under: true,
    keys: '月台 黃線',
    tags: ['public'],
  }),
  A('ticket_gate', 'railway', 6, 3, '驗票閘門', {
    keys: '剪票口 閘門',
    tags: ['public', 'indoor'],
  }),
  A('ticket_machine', 'railway', 1.6, 1, '售票機', {
    orient: true,
    keys: '車票 票',
    tags: ['public', 'indoor'],
  }),
  A('station_bench', 'railway', 4, 1, '月台座椅', { orient: true, keys: '椅子', tags: ['public'] }),
  A('station_sign', 'railway', 3, 0.5, '站名牌', { keys: '招牌 車站', tags: ['public'] }),
  A('kiosk', 'railway', 4, 2.4, '車站小賣店', {
    orient: true,
    keys: '商店 便利商店',
    tags: ['shop'],
  }),
  A('train_car', 'railway', 6, 40, '電車車廂', { keys: '火車 列車 捷運', tags: ['large'] }),
  A('locomotive', 'railway', 6, 32, '火車頭', { keys: '機關車 列車 蒸汽', tags: ['large'] }),

  /* ---------- 車輛・船・飛機 ---------- */
  A('car', 'vehicle', 4, 9, '汽車', { keys: '車 轎車', tags: ['outdoor'] }),
  A('suv', 'vehicle', 4.2, 9.6, '休旅車', { keys: '車 SUV', tags: ['outdoor'] }),
  A('van', 'vehicle', 4, 9.4, '廂型車', { keys: '車 麵包車', tags: ['outdoor'] }),
  A('truck', 'vehicle', 5, 16, '貨車', { keys: '車 卡車', tags: ['outdoor', 'industrial'] }),
  A('police_car', 'vehicle', 4, 9.4, '警車', { keys: '車 巡邏車', tags: ['outdoor', 'military'] }),
  A('ambulance', 'vehicle', 4.4, 11, '救護車', { keys: '車', tags: ['outdoor', 'medical'] }),
  A('fire_truck', 'vehicle', 5, 17, '消防車', { keys: '車 雲梯車', tags: ['outdoor', 'public'] }),
  A('excavator', 'vehicle', 6, 12, '挖土機', {
    keys: '怪手 工程車',
    tags: ['outdoor', 'industrial'],
  }),
  A('bulldozer', 'vehicle', 7, 10, '推土機', { keys: '工程車', tags: ['outdoor', 'industrial'] }),
  A('crane_truck', 'vehicle', 5.6, 20, '吊車', {
    keys: '起重機 工程車',
    tags: ['outdoor', 'industrial', 'large'],
  }),
  A('forklift', 'vehicle', 2.4, 5, '堆高機', { keys: '叉車 倉庫', tags: ['industrial'] }),
  A('airplane', 'vehicle', 24, 22, '小飛機', { keys: '飛機 螺旋槳', tags: ['outdoor', 'large'] }),
  A('helicopter', 'vehicle', 22, 22, '直升機', { keys: '飛機', tags: ['outdoor', 'large'] }),
  A('boat', 'vehicle', 2.2, 5, '小船', { keys: '船 划船', tags: ['waterside', 'ship'] }),
  A('lifeboat', 'vehicle', 4, 12, '救生艇', { keys: '船', tags: ['ship', 'waterside'] }),
  A('liferaft', 'vehicle', 1.6, 2.4, '救生筏收納桶', { keys: '船 救生', tags: ['ship'] }),
  A('anchor', 'vehicle', 2, 2.4, '錨', { keys: '船', tags: ['ship'] }),
  A('bollard', 'vehicle', 1.2, 1, '繫船柱', {
    keys: '碼頭 港口 纜樁',
    tags: ['ship', 'waterside'],
  }),
  A('helm', 'vehicle', 1.6, 1.6, '舵輪', { keys: '船 駕駛', tags: ['ship', 'indoor'] }),
  A('radar', 'vehicle', 2, 1.6, '雷達台', {
    orient: true,
    keys: '船 螢幕',
    tags: ['ship', 'indoor'],
  }),
  A('chart_table', 'vehicle', 2.4, 1.6, '海圖桌', {
    orient: true,
    keys: '船 地圖 桌子',
    tags: ['ship', 'indoor'],
  }),
  A('ship_engine', 'vehicle', 6, 10, '船用引擎', {
    keys: '機房 輪機',
    tags: ['ship', 'indoor', 'machinery'],
  }),
  A('ship_hatch', 'vehicle', 2.4, 2.4, '船艙口', { keys: '艙門 甲板', tags: ['ship'] }),

  /* ---------- 倉儲・工地 ---------- */
  A('crate', 'industry', 1.6, 1.6, '木箱', { keys: '箱子' }),
  A('barrel', 'industry', 1.2, 1.2, '木桶', { keys: '酒桶', tags: ['historic'] }),
  A('pallet', 'industry', 2.2, 2.2, '棧板', { keys: '托盤 倉庫' }),
  A('pallet_stack', 'industry', 2.2, 2.2, '一疊棧板', { keys: '托盤 倉庫' }),
  A('cardboard', 'industry', 1.2, 0.9, '紙箱', { keys: '箱子 搬家' }),
  A('big_crate', 'industry', 3, 2.4, '大木箱', { keys: '箱子 貨物' }),
  A('container', 'industry', 5, 12, '貨櫃', {
    keys: '集裝箱 港口',
    tags: ['outdoor', 'transport', 'large'],
  }),
  A('drum', 'industry', 1.2, 1.2, '油桶', { keys: '汽油桶 鐵桶' }),
  A('hand_cart', 'industry', 1.4, 2, '手推車', { keys: '推車 台車' }),
  A('tool_shelf', 'industry', 3, 1, '工具架', { orient: true, keys: '架子' }),
  A('machine_tool', 'industry', 3, 2.4, '車床', {
    orient: true,
    keys: '工作母機 機械 工廠',
    tags: ['machinery'],
  }),
  A('generator', 'industry', 1.6, 1.2, '移動式發電機', { keys: '發電' }),
  A('ind_tank', 'industry', 3, 3, '化學槽', { keys: '槽 儲槽 工廠', tags: ['danger'] }),
  A('conveyor', 'industry', 10, 2, '輸送帶', { keys: '工廠 生產線', tags: ['machinery'] }),
  A('workbench', 'industry', 4, 1.6, '工作台', { orient: true, keys: '桌子 工坊' }),
  A('material_pile', 'industry', 4, 3, '砂石堆', { keys: '建材 工地', tags: ['outdoor'] }),
  A('building_materials', 'industry', 8, 2, '鋼筋與木材', { keys: '建材 工地', tags: ['outdoor'] }),
  A('pallet_rack', 'industry', 8, 2.2, '重型貨架', {
    orient: true,
    keys: '倉庫 架子',
    tags: ['large'],
  }),
  A('supply_shelf', 'industry', 3, 1, '物資架', { orient: true, keys: '防災 儲備 罐頭 架子' }),
  A('scaffold', 'industry', 6, 2, '鷹架', { keys: '工地 施工', tags: ['outdoor', 'danger'] }),
  A('barricade', 'industry', 3, 0.7, '施工路障', { keys: '工地 柵欄', tags: ['outdoor'] }),
  A('site_fence', 'industry', 6, 0.4, '工地圍籬', { keys: '施工 圍牆', tags: ['outdoor'] }),

  /* ---------- 街道・公園 ---------- */
  A('tree', 'street', 3, 3, '樹', { tags: ['wild'] }),
  A('bush', 'street', 1.6, 1.6, '灌木', { keys: '樹叢', tags: ['wild'] }),
  A('garden_bench', 'street', 3, 1, '戶外長椅', { orient: true, keys: '椅子 公園' }),
  A('road', 'street', 12, 12, '雙線道路', { under: true, keys: '馬路 車道', tags: ['transport'] }),
  A('crosswalk', 'street', 8, 6, '斑馬線', {
    under: true,
    keys: '行人穿越道',
    tags: ['transport'],
  }),
  A('parking_stall', 'street', 5, 10, '停車格', {
    under: true,
    keys: '停車場',
    tags: ['transport'],
  }),
  A('road_arrow', 'street', 2, 4, '路面箭頭', { under: true, keys: '標線', tags: ['transport'] }),
  A('road_sign', 'street', 1, 1, '交通標誌', { keys: '號誌 招牌', tags: ['transport'] }),
  A('traffic_light', 'street', 1.2, 0.8, '紅綠燈', { keys: '號誌 信號燈', tags: ['transport'] }),
  A('cone', 'street', 0.8, 0.8, '三角錐', { keys: '交通錐 施工', tags: ['transport'] }),
  A('bollard_post', 'street', 0.6, 0.6, '車阻柱', { keys: '路樁 柱子' }),
  A('streetlight', 'street', 1, 1, '路燈', { keys: '燈' }),
  A('utility_pole', 'street', 1, 1, '電線桿', { keys: '電桿 柱子' }),
  A('guardrail', 'street', 6, 0.6, '護欄', { keys: '欄杆 道路', tags: ['transport'] }),
  A('fence_item', 'street', 4, 0.3, '鐵網圍籬', { keys: '圍欄 鐵絲網' }),
  A('hedge', 'street', 6, 1, '樹籬', { keys: '綠籬 植物', tags: ['garden'] }),
  A('fountain', 'street', 4, 4, '噴水池', { keys: '噴泉 廣場', tags: ['public', 'waterside'] }),
  A('swing', 'street', 3, 1.6, '盪鞦韆', { keys: '公園 遊樂', tags: ['leisure'] }),
  A('slide', 'street', 1.2, 3.6, '溜滑梯', { keys: '公園 遊樂', tags: ['leisure'] }),
  A('sandbox', 'street', 3, 3, '沙坑', { keys: '公園 遊樂', tags: ['leisure'] }),
  A('gazebo', 'street', 5, 5, '涼亭', { keys: '亭子 公園', tags: ['garden'] }),
  A('shed', 'street', 4, 3, '置物小屋', { keys: '倉庫 工具間', tags: ['home'] }),
  A('puddle', 'street', 2.4, 1.6, '水窪', { under: true, keys: '積水', tags: ['ruins'] }),

  /* ---------- 自然・露營 ---------- */
  A('rock', 'nature', 2.4, 2, '岩石', { keys: '石頭' }),
  A('tent', 'nature', 4, 4, '帳篷'),
  A('campfire', 'nature', 1.6, 1.6, '營火', { keys: '火' }),
  A('picnic', 'nature', 3.6, 3, '野餐桌', { keys: '桌子' }),
  A('log', 'nature', 3, 0.8, '圓木', { keys: '木頭' }),
  A('bones', 'nature', 1.4, 1.2, '骨頭', { under: true, tags: ['horror', 'danger'] }),
  A('pit', 'nature', 2.4, 2.4, '坑洞・陷阱', { keys: '洞', tags: ['danger'] }),
  A('cliff', 'nature', 8, 3, '斷崖', { keys: '懸崖 崖壁', tags: ['danger'] }),
  A('landslide', 'nature', 4, 3, '坍方的土石', {
    keys: '土石流 崩塌',
    tags: ['damaged', 'danger'],
  }),

  /* ---------- 和風・寺社 ---------- */
  A('irori', 'japanese', 3, 3, '地爐（圍爐裏）', { keys: '火爐', tags: ['indoor', 'home'] }),
  A('kamado', 'japanese', 3, 1.4, '爐灶', { orient: true, keys: '灶', tags: ['indoor', 'home'] }),
  A('butsudan', 'japanese', 1.8, 1.2, '佛壇', { orient: true, tags: ['indoor', 'religious'] }),
  A('tokonoma', 'japanese', 3.6, 1.4, '床之間（壁龕）', {
    orient: true,
    keys: '和室',
    tags: ['indoor'],
  }),
  A('torii', 'japanese', 8, 1.2, '鳥居', { keys: '神社', tags: ['religious', 'outdoor'] }),
  A('komainu', 'japanese', 1.4, 1.4, '狛犬', { keys: '神社 石獅', tags: ['religious', 'outdoor'] }),
  A('lantern', 'japanese', 1.2, 1.2, '石燈籠', {
    keys: '燈',
    tags: ['religious', 'outdoor', 'garden'],
  }),
  A('temizuya', 'japanese', 4, 3, '手水舍', { keys: '神社', tags: ['religious', 'outdoor'] }),
  A('hokora', 'japanese', 1.6, 1.6, '小祠', {
    keys: '神社 土地公',
    tags: ['religious', 'outdoor'],
  }),
  A('saisen', 'japanese', 2.4, 1, '賽錢箱', { keys: '神社 香油錢', tags: ['religious'] }),
  A('shoji', 'japanese', 3, 0.3, '紙拉門（障子）', { keys: '門 和室', tags: ['indoor'] }),
  A('fusuma', 'japanese', 3, 0.3, '隔扇（襖）', { keys: '門 和室', tags: ['indoor'] }),
  A('byobu', 'japanese', 4, 1, '屏風', { orient: true, keys: '隔間', tags: ['indoor'] }),
  A('engawa_deck', 'japanese', 6, 2, '緣側木地板', {
    under: true,
    orient: true,
    keys: '走廊 地板',
    tags: ['home'],
  }),
  A('tatami', 'japanese', 1.8, 3.6, '榻榻米', { under: true, keys: '和室 地墊', tags: ['indoor'] }),
  A('zataku', 'japanese', 3, 2, '和式矮桌', { keys: '桌子 和室', tags: ['indoor', 'home'] }),
  A('zabuton', 'japanese', 1.2, 1.2, '坐墊', { keys: '座布團 和室', tags: ['indoor', 'home'] }),
  A('katanakake', 'japanese', 2, 0.8, '刀架', {
    orient: true,
    keys: '武士刀 武器',
    tags: ['indoor'],
  }),
  A('andon', 'japanese', 0.8, 0.8, '紙燈籠（行燈）', { keys: '燈', tags: ['indoor'] }),
  A('buddha_altar', 'japanese', 4, 2.4, '須彌壇與本尊', {
    orient: true,
    keys: '佛像 寺院 佛堂',
    tags: ['religious', 'indoor'],
  }),
  A('bonsho', 'japanese', 3, 3, '梵鐘（鐘樓）', {
    keys: '鐘 寺院',
    tags: ['religious', 'outdoor'],
  }),
  A('jizo', 'japanese', 0.9, 0.9, '地藏像', { keys: '石像 地藏', tags: ['religious', 'outdoor'] }),

  /* ---------- 日式庭園 ---------- */
  A('well', 'garden', 2.2, 2.2, '水井', { keys: '井', tags: ['historic'] }),
  A('pond', 'garden', 8, 6, '水池', { under: true, keys: '池塘 錦鯉', tags: ['waterside'] }),
  A('stone_bridge', 'garden', 2, 5, '石橋', { keys: '橋', tags: ['waterside'] }),
  A('wood_bridge', 'garden', 2.4, 6, '木造拱橋', { keys: '橋 太鼓橋', tags: ['waterside'] }),
  A('stepping', 'garden', 1.6, 5, '踏腳石', { under: true, keys: '步道 石頭' }),
  A('garden_rock', 'garden', 1.8, 1.4, '庭石', { keys: '石頭 岩石' }),
  A('bamboo_fence', 'garden', 6, 0.5, '竹籬', { keys: '圍籬 竹子' }),
  A('pine', 'garden', 4, 4, '松樹', { keys: '樹' }),
  A('bamboo', 'garden', 3, 3, '竹叢', { keys: '竹子 竹林', tags: ['wild'] }),
  A('moss', 'garden', 4, 3, '青苔', { under: true, keys: '苔蘚 草地' }),
  A('tsukubai', 'garden', 1.6, 1.6, '洗手缽（蹲踞）', { keys: '水缽 茶庭' }),
  A('shishiodoshi', 'garden', 2.4, 1, '驚鹿（竹筒）', { keys: '添水 竹子' }),
  A('tea_house', 'garden', 6, 6, '茶室（屋頂）', { keys: '茶屋 建築', tags: ['historic'] }),

  /* ---------- 調查・證物 ---------- */
  A('evidence', 'investigation', 0.9, 0.9, '證物標示牌', {
    labelInside: true,
    keys: '號碼',
    tags: ['evidence'],
  }),
  A('clue', 'investigation', 1, 1, '線索（？）', { keys: '問號', tags: ['evidence'] }),
  A('memo', 'investigation', 0.8, 0.6, '便條・紙片', { keys: '紙', tags: ['evidence'] }),
  A('diary', 'investigation', 1, 0.8, '日記・手冊', { keys: '書 筆記', tags: ['evidence'] }),
  A('key', 'investigation', 0.9, 0.45, '鑰匙', { tags: ['evidence'] }),
  A('knife', 'investigation', 1.2, 0.4, '刀子', {
    keys: '凶器 刀具',
    tags: ['evidence', 'danger'],
  }),
  A('photo', 'investigation', 0.8, 0.7, '照片', { tags: ['evidence'] }),
  A('phone', 'investigation', 0.5, 0.9, '手機', { keys: '電話', tags: ['evidence', 'modern'] }),
  A('pills', 'investigation', 0.6, 0.7, '藥瓶', { keys: '藥', tags: ['evidence'] }),
  A('danger', 'investigation', 1, 1, '危險（！）', { keys: '驚嘆號 警告', tags: ['danger'] }),
  A('blood', 'investigation', 2, 2, '血跡', {
    under: true,
    tags: ['evidence', 'danger', 'horror'],
  }),
  A('body', 'investigation', 2.2, 4, '人形輪廓', {
    under: true,
    keys: '屍體 遺體',
    tags: ['evidence', 'danger'],
  }),
  A('footprints', 'investigation', 1, 3, '腳印', { under: true, tags: ['evidence'] }),
  A('debris', 'investigation', 3, 2.4, '瓦礫', { keys: '碎石', tags: ['damaged', 'ruins'] }),
  A('glass', 'investigation', 1.6, 1.6, '碎玻璃', { under: true, tags: ['damaged', 'ruins'] }),
  A('tape', 'investigation', 6, 0.35, '封鎖線', { keys: '膠帶', tags: ['public', 'military'] }),
  A('safe', 'investigation', 1.2, 1.2, '保險箱', { keys: '金庫', tags: ['hidden'] }),
  A('flashlight', 'investigation', 0.8, 0.4, '手電筒', { keys: '燈 照明' }),
  A('tools', 'investigation', 1.2, 0.6, '工具組', { keys: '扳手 螺絲起子 工具箱' }),
  A('bag', 'investigation', 1.2, 0.8, '包包', { keys: '背包 手提包 行李', tags: ['evidence'] }),
  A('wallet', 'investigation', 0.6, 0.4, '錢包', { keys: '皮夾 證件', tags: ['evidence'] }),
  A('papers', 'investigation', 0.9, 0.7, '一疊文件', { keys: '紙 資料', tags: ['evidence'] }),
  A('file_folder', 'investigation', 0.8, 1, '資料夾', { keys: '檔案 文件', tags: ['evidence'] }),
  A('laptop', 'investigation', 1.2, 0.9, '筆電', {
    keys: '電腦 筆記型電腦',
    tags: ['evidence', 'modern'],
  }),
  A('recorder', 'investigation', 0.6, 0.4, '錄音筆', {
    keys: '錄音機',
    tags: ['evidence', 'modern'],
  }),
  A('camera', 'investigation', 0.7, 0.5, '相機', { keys: '照相機', tags: ['evidence'] }),
  A('casings', 'investigation', 0.8, 0.8, '彈殼', {
    under: true,
    keys: '子彈 槍',
    tags: ['evidence', 'danger'],
  }),
  A('burn', 'investigation', 3, 2.4, '焦痕', {
    under: true,
    keys: '燒焦 火災',
    tags: ['damaged', 'ruins'],
  }),
  A('drag_marks', 'investigation', 1.4, 4, '拖行的痕跡', {
    under: true,
    keys: '血跡 痕跡',
    tags: ['evidence', 'horror'],
  }),
  A('fingerprint', 'investigation', 0.8, 0.8, '指紋標記', { keys: '鑑識', tags: ['evidence'] }),
  A('broken_furniture', 'investigation', 2.4, 1.6, '壞掉的家具', {
    keys: '殘骸 碎片',
    tags: ['damaged', 'ruins'],
  }),

  /* ---------- 恐怖・神祕 ---------- */
  A('idol', 'occult', 0.9, 0.9, '詭異的雕像', { keys: '神像', tags: ['religious'] }),
  A('magic_circle', 'occult', 5, 5, '魔法陣', { under: true, keys: '儀式', tags: ['religious'] }),
  A('altar', 'occult', 3, 1.6, '祭壇', { orient: true, keys: '儀式', tags: ['religious'] }),
  A('candle', 'occult', 0.8, 0.8, '燭台', { keys: '蠟燭', tags: ['religious'] }),
  A('cage', 'occult', 3, 3, '籠子・鐵籠', { tags: ['danger'] }),
  A('coffin', 'occult', 1.8, 4, '棺材', { tags: ['religious'] }),
  A('pod', 'occult', 1.8, 1.8, '人形培養槽', { keys: '實驗 培養', tags: ['research', 'scifi'] }),
  A('sarcophagus', 'occult', 2.4, 4.4, '石棺', {
    keys: '棺材 墓室',
    tags: ['historic', 'religious'],
  }),
  A('ritual_table', 'occult', 3, 2, '儀式台', { keys: '祭壇 祭品', tags: ['religious'] }),
  A('chains', 'occult', 3, 0.6, '鎖鏈', { orient: true, keys: '鐵鍊 拘束', tags: ['danger'] }),
  A('stele', 'occult', 2, 1, '怪異的石碑', { orient: true, keys: '碑文 石頭', tags: ['historic'] }),
  A('totem', 'occult', 1.4, 1.4, '圖騰柱', { keys: '柱子 部落', tags: ['wild'] }),
  A('offering', 'occult', 1.4, 1, '供品', { orient: true, keys: '祭品', tags: ['religious'] }),
  A('cursed_item', 'occult', 0.8, 0.8, '詛咒之物', { keys: '人偶 符咒', tags: ['danger'] }),
  A('flesh', 'occult', 2.4, 2, '肉塊（異形）', { keys: '怪物 血肉', tags: ['danger'] }),
  A('black_stain', 'occult', 3, 2.4, '黑色的污漬', { under: true, keys: '黑水 黏液' }),
  A('abyss', 'occult', 3, 3, '深不見底的洞', { keys: '洞 異界', tags: ['danger'] }),
  A('grave', 'occult', 1.6, 2.6, '墓碑', { keys: '墳墓 墓地', tags: ['religious', 'outdoor'] }),

  /* ---------- 人物・生物（2026-10 第三批） ---------- */
  A('npc_man', 'people', 1.2, 1.2, '一般男性', { keys: '人 NPC 路人' }),
  A('npc_woman', 'people', 1.2, 1.2, '一般女性', { keys: '人 NPC 路人' }),
  A('npc_child', 'people', 1, 1, '小孩', { keys: '人 NPC 兒童' }),
  A('npc_elder', 'people', 1.2, 1.2, '老人', { keys: '人 NPC 長者' }),
  A('npc_police', 'people', 1.2, 1.2, '警察', {
    keys: '人 NPC 警官',
    tags: ['military', 'public'],
  }),
  A('npc_soldier', 'people', 1.2, 1.2, '士兵', { keys: '人 NPC 軍人', tags: ['military'] }),
  A('npc_doctor', 'people', 1.2, 1.2, '醫師', { keys: '人 NPC 醫生', tags: ['medical'] }),
  A('npc_nurse', 'people', 1.2, 1.2, '護理師', { keys: '人 NPC 護士', tags: ['medical'] }),
  A('npc_scientist', 'people', 1.2, 1.2, '研究員', {
    keys: '人 NPC 科學家 博士',
    tags: ['research'],
  }),
  A('npc_worker', 'people', 1.2, 1.2, '工人', { keys: '人 NPC 作業員', tags: ['industrial'] }),
  A('npc_station', 'people', 1.2, 1.2, '站務員', { keys: '人 NPC 車站', tags: ['railway'] }),
  A('npc_sailor', 'people', 1.2, 1.2, '船員', { keys: '人 NPC 水手', tags: ['ship'] }),
  A('npc_guard', 'people', 1.2, 1.2, '保全', { keys: '人 NPC 警衛 守衛' }),
  A('npc_robed', 'people', 1.2, 1.2, '穿長袍的人', {
    keys: '人 NPC 教徒 信徒',
    tags: ['religious'],
  }),
  A('npc_standing', 'people', 1.2, 1.2, '站著的人', { keys: '人 NPC 人影' }),
  A('npc_sitting', 'people', 1.2, 1.6, '坐著的人', { keys: '人 NPC' }),
  A('npc_lying', 'people', 1.6, 3.6, '倒地的人', { keys: '人 NPC 昏倒 受害者', tags: ['danger'] }),
  A('npc_bound', 'people', 1.6, 1.6, '被綁住的人', { keys: '人 NPC 人質 綁架', tags: ['danger'] }),
  A('enemy_humanoid', 'people', 1.2, 1.2, '人形敵人', { keys: '敵人 怪物', tags: ['danger'] }),
  A('monster_small', 'people', 1, 1, '小型怪物', { keys: '敵人 魔物', tags: ['danger'] }),
  A('monster', 'people', 2, 2, '怪物', { keys: '敵人 魔物', tags: ['danger'] }),
  A('monster_large', 'people', 4, 4, '大型怪物', { keys: '敵人 魔物', tags: ['danger'] }),
  A('monster_boss', 'people', 6, 6, '強敵（頭目）', { keys: '敵人 魔物 魔王', tags: ['danger'] }),
  A('monster_huge', 'people', 10, 10, '巨大怪物', {
    keys: '敵人 魔物 巨獸',
    tags: ['danger', 'large'],
  }),
  A('dog', 'people', 1, 1.8, '狗', { keys: '動物 寵物' }),
  A('dog_big', 'people', 1.2, 2.4, '大型犬', { keys: '動物 狗 看門狗' }),
  A('cat', 'people', 0.6, 1.1, '貓', { keys: '動物 寵物' }),
  A('bird', 'people', 0.8, 0.8, '鳥', { keys: '動物 烏鴉' }),
  A('wild_animal', 'people', 2, 3.4, '野獸（熊）', { keys: '動物 熊', tags: ['wild', 'danger'] }),

  /* ---------- 科幻 ---------- */
  A('console', 'sf', 3.6, 1.4, '控制台', { orient: true, tags: ['indoor'] }),
  A('pilot_seat', 'sf', 1.6, 1.8, '駕駛座', { keys: '椅子', tags: ['indoor'] }),
  A('cryopod', 'sf', 1.8, 4, '冷凍睡眠艙', { tags: ['research'] }),
  A('reactor', 'sf', 5, 5, '動力爐', { tags: ['machinery'] }),
  A('holo_table', 'sf', 3.4, 3.4, '全像投影桌', { keys: '桌子', tags: ['indoor'] }),
  A('hatch', 'sf', 2, 2, '艙口'),

  /* ---------- 奇幻・中世（2026-10 第三批） ---------- */
  A('throne', 'fantasy', 2.4, 2.2, '王座', {
    orient: true,
    keys: '椅子 國王 城堡',
    tags: ['indoor'],
  }),
  A('weapon_rack', 'fantasy', 3, 1, '武器架', {
    orient: true,
    keys: '劍 槍 武器',
    tags: ['military'],
  }),
  A('armor_stand', 'fantasy', 1.2, 1, '盔甲架', { keys: '鎧甲 騎士', tags: ['military'] }),
  A('chest', 'fantasy', 1.6, 1, '寶箱', { orient: true, keys: '箱子 寶物', tags: ['hidden'] }),
  A('cauldron', 'fantasy', 1.6, 1.6, '大鍋', { keys: '魔女 藥水 鍋子' }),
  A('crystal_ball', 'fantasy', 1, 1, '水晶球', { keys: '占卜 魔法' }),
  A('banner', 'fantasy', 2, 0.6, '旗幟・掛毯', {
    orient: true,
    keys: '旗子 紋章',
    tags: ['indoor'],
  }),
  A('anvil', 'fantasy', 1.6, 1, '鐵砧', { keys: '鍛造 打鐵' }),
  A('forge', 'fantasy', 3, 2, '鍛造爐', { orient: true, keys: '打鐵 火爐' }),
  A('quest_board', 'fantasy', 3, 0.5, '委託告示板', { orient: true, keys: '公告 冒險者 酒館' }),
  A('spike_trap', 'fantasy', 2, 2, '尖刺陷阱', { keys: '陷阱 地城', tags: ['danger', 'hidden'] }),
  A('torch', 'fantasy', 0.8, 0.8, '牆上的火把', { orient: true, keys: '火 照明 地城' }),
  A('hay', 'fantasy', 2, 1.4, '乾草堆', { keys: '稻草 馬廄 農家', tags: ['outdoor'] }),
  A('statue', 'fantasy', 1.6, 1.6, '石像', { keys: '雕像 石頭' }),
];

export const ASSET: Readonly<Record<string, AssetInfo>> = Object.fromEntries(
  ASSETS.map((a) => [a.id, a]),
);

export const isAsset = (t: string): boolean => Object.hasOwn(ASSET, t);

/** 樓梯、電梯、梯子等：下一層的位置也會淡淡地畫出來 */
export const VERTICAL_LINKS: ReadonlySet<string> = new Set(
  ASSETS.filter((a) => a.vertical).map((a) => a.id),
);

/** 貼牆素材（F233）：畫在牆與門窗的上面 */
export const isWallMounted = (t: string): boolean => Boolean(ASSET[t]?.wall);

/**
 * 家具的搜尋（F46、F234）：名稱、別名、代號或標籤名稱包含關鍵字；`#xxx` 只比對標籤
 * （不分大小寫；全形的「＃」也可以；空白分隔的每個詞都要符合）。
 */
export function assetMatches(a: AssetInfo, query: string | readonly string[]): boolean {
  const words = typeof query === 'string' ? queryWords(query) : query;
  return matchesQuery({ text: [a.name, a.keys ?? '', a.id], tags: a.tags }, words);
}

/** 轉向後的外框尺寸 */
export function assetDims(a: Pick<AssetInfo, 'w' | 'h'>, rot: number): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: a.h, h: a.w } : { w: a.w, h: a.h };
}
