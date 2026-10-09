/**
 * 家具與小物的目錄（名稱、分類、預設尺寸、擺放規則）。畫法在 draw/furniture/。
 * 尺寸以格（0.5 m）為單位，是「背面朝上（y＝0 那邊靠牆）」時的寬 × 深。
 * id 與原作的存檔相同（讀得到原作的 .trpgmap.json）；名稱、畫法是本站自己的。
 */

export type AssetGroupId =
  | 'structure'
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bath'
  | 'office'
  | 'medical'
  | 'school'
  | 'leisure'
  | 'horror'
  | 'outdoor'
  | 'retro'
  | 'sf'
  | 'nature';

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
  /** 搜尋用的別名 */
  keys?: string;
}

export const ASSET_GROUPS: readonly { id: AssetGroupId; name: string }[] = [
  { id: 'structure', name: '樓梯・結構' },
  { id: 'living', name: '客廳' },
  { id: 'bedroom', name: '臥室' },
  { id: 'kitchen', name: '廚房' },
  { id: 'bath', name: '衛浴' },
  { id: 'office', name: '辦公・設施' },
  { id: 'medical', name: '醫院・研究' },
  { id: 'school', name: '學校・圖書館' },
  { id: 'leisure', name: '娛樂・運動' },
  { id: 'horror', name: '調查・恐怖' },
  { id: 'outdoor', name: '戶外' },
  { id: 'retro', name: '1920 年代・和風' },
  { id: 'sf', name: '科幻' },
  { id: 'nature', name: '自然・露營' },
];

type Extra = Pick<AssetInfo, 'under' | 'labelInside' | 'orient' | 'keys'>;
const A = (
  id: string,
  group: AssetGroupId,
  w: number,
  h: number,
  name: string,
  extra?: Extra,
): AssetInfo => ({ id, group, w, h, name, ...extra });
const O: Extra = { orient: true };
const U: Extra = { under: true };

export const ASSETS: readonly AssetInfo[] = [
  A('stairs', 'structure', 2, 5, '樓梯', { keys: '階梯' }),
  A('stairs_u', 'structure', 5, 5, '折返樓梯', { keys: '階梯' }),
  A('spiral', 'structure', 4, 4, '螺旋梯', { keys: '樓梯 階梯' }),
  A('elevator', 'structure', 4, 4, '電梯', { keys: '升降梯' }),
  A('pillar', 'structure', 1, 1, '柱子'),
  A('fireplace', 'structure', 3, 1.2, '壁爐', O),

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
  A('tv', 'living', 3.2, 0.9, '電視櫃', O),
  A('bookshelf', 'living', 3, 0.8, '書架', { orient: true, keys: '書櫃' }),
  A('cabinet', 'living', 3, 1, '櫃子', { orient: true, keys: '收納' }),
  A('rug', 'living', 4, 3, '地毯', U),
  A('plant', 'living', 1.2, 1.2, '盆栽', { keys: '植物' }),
  A('lamp', 'living', 0.9, 0.9, '立燈', { keys: '燈' }),
  A('piano', 'living', 3, 3.8, '平台鋼琴'),
  A('piano_up', 'living', 3, 1.3, '直立鋼琴', O),

  A('bed_single', 'bedroom', 2, 4, '單人床', O),
  A('bed_double', 'bedroom', 2.8, 4, '雙人床', O),
  A('futon', 'bedroom', 2, 4, '和式床墊', { keys: '床 被子' }),
  A('wardrobe', 'bedroom', 3, 1.2, '衣櫃', O),
  A('dresser', 'bedroom', 2, 0.9, '五斗櫃・梳妝台', O),
  A('nightstand', 'bedroom', 0.9, 0.9, '床頭櫃', O),
  A('desk', 'bedroom', 2.4, 1.2, '書桌', { orient: true, keys: '桌子' }),
  A('desk_set', 'bedroom', 2.4, 2.4, '書桌與椅子', { orient: true, keys: '桌子' }),

  A('kitchen', 'kitchen', 5, 1.3, '流理台', { orient: true, keys: '系統廚具' }),
  A('sink', 'kitchen', 2, 1.3, '水槽', O),
  A('stove', 'kitchen', 2, 1.3, '瓦斯爐', { orient: true, keys: '爐子' }),
  A('fridge', 'kitchen', 1.4, 1.4, '冰箱', O),
  A('island', 'kitchen', 4, 2, '廚房中島'),
  A('counter', 'kitchen', 4, 1.2, '吧台・工作台', O),
  A('cupboard', 'kitchen', 3, 0.9, '碗櫃', O),

  A('toilet', 'bath', 1, 1.6, '馬桶', { orient: true, keys: '廁所' }),
  A('washbasin', 'bath', 1.6, 1.1, '洗手台', { orient: true, keys: '洗臉台' }),
  A('bathtub', 'bath', 1.6, 3, '浴缸', O),
  A('unitbath', 'bath', 3, 3.2, '浴缸＋淋浴區', { keys: '浴室' }),
  A('shower', 'bath', 1.8, 1.8, '淋浴間', O),
  A('washer', 'bath', 1.3, 1.3, '洗衣機', O),

  A('office_desk', 'office', 2.4, 1.4, '辦公桌', { orient: true, keys: '桌子' }),
  A('meeting6', 'office', 4.8, 3.6, '會議桌（6 人）', { keys: '桌子' }),
  A('reception', 'office', 5, 1.4, '接待櫃台', { orient: true, keys: '櫃檯' }),
  A('locker', 'office', 3, 1, '置物櫃', O),
  A('filing', 'office', 1, 1.2, '文件櫃', O),
  A('whiteboard', 'office', 3, 0.4, '白板・黑板', O),
  A('copier', 'office', 1.4, 1.2, '影印機', O),
  A('bench', 'office', 4, 1, '長椅', { orient: true, keys: '椅子' }),
  A('vending', 'office', 2, 1.4, '自動販賣機', O),

  A('hospital_bed', 'medical', 2.2, 4.2, '病床', { orient: true, keys: '床' }),
  A('exam_bed', 'medical', 1.4, 3.6, '診療床', { orient: true, keys: '床' }),
  A('op_table', 'medical', 3, 4.4, '手術台'),
  A('med_cabinet', 'medical', 3, 1, '藥品櫃', O),
  A('wheelchair', 'medical', 1.3, 1.4, '輪椅'),
  A('iv_stand', 'medical', 0.7, 0.7, '點滴架'),
  A('curtain', 'medical', 4, 0.3, '隔簾', { keys: '簾子' }),
  A('morgue', 'medical', 4.2, 2.4, '屍體冷藏櫃', { orient: true, keys: '停屍間' }),
  A('lab_bench', 'medical', 4, 1.6, '實驗台', O),
  A('tank', 'medical', 2.4, 2.4, '培養槽・儲槽'),
  A('rack', 'medical', 1.4, 2, '伺服器機櫃', { orient: true, keys: '電腦' }),

  A('school_desk', 'school', 1.4, 2, '課桌椅', { keys: '桌子 椅子' }),
  A('lectern', 'school', 1.8, 1.1, '講桌・講台'),
  A('lecture_row', 'school', 7.2, 2, '大教室長桌', { keys: '桌子 椅子' }),
  A('bookstack', 'school', 4, 1.4, '雙面書架', { keys: '書櫃' }),

  A('stage', 'leisure', 12, 6, '舞台', { under: true, orient: true }),
  A('seats', 'leisure', 6, 1.2, '觀眾席（一排）', { keys: '椅子 座位' }),
  A('pew', 'leisure', 6, 1.2, '教堂長椅', { keys: '椅子' }),
  A('speaker', 'leisure', 1.2, 1, '喇叭', { keys: '音響' }),
  A('drums', 'leisure', 3.2, 2.8, '爵士鼓', { keys: '樂器' }),
  A('mixer', 'leisure', 3, 1.4, '混音台', { keys: '音控' }),
  A('stool', 'leisure', 0.8, 0.8, '高腳椅', { keys: '椅子' }),
  A('booth', 'leisure', 3, 4, '卡座', { keys: '沙發 桌子' }),
  A('billiards', 'leisure', 5, 2.8, '撞球台'),
  A('banquet_round', 'leisure', 5.6, 5.6, '宴會圓桌（8 人）', { keys: '桌子' }),
  A('pool', 'leisure', 12, 25, '游泳池', { under: true, keys: '泳池' }),
  A('deck_chair', 'leisure', 1.4, 3.6, '躺椅', { keys: '椅子' }),
  A('treadmill', 'leisure', 1.8, 4, '跑步機', { keys: '健身' }),
  A('exercise_bike', 'leisure', 1.2, 2.6, '飛輪健身車', { keys: '健身' }),
  A('weight_bench', 'leisure', 3, 3.2, '臥推架', { keys: '健身' }),
  A('dumbbell_rack', 'leisure', 3, 1, '啞鈴架', { orient: true, keys: '健身' }),

  A('evidence', 'horror', 0.9, 0.9, '證物標示牌', { labelInside: true, keys: '號碼' }),
  A('clue', 'horror', 1, 1, '線索（？）', { keys: '問號' }),
  A('memo', 'horror', 0.8, 0.6, '便條・紙片', { keys: '紙' }),
  A('diary', 'horror', 1, 0.8, '日記・手冊', { keys: '書 筆記' }),
  A('key', 'horror', 0.9, 0.45, '鑰匙'),
  A('knife', 'horror', 1.2, 0.4, '刀子', { keys: '凶器 刀具' }),
  A('photo', 'horror', 0.8, 0.7, '照片'),
  A('phone', 'horror', 0.5, 0.9, '手機', { keys: '電話' }),
  A('pills', 'horror', 0.6, 0.7, '藥瓶', { keys: '藥' }),
  A('idol', 'horror', 0.9, 0.9, '詭異的雕像', { keys: '神像' }),
  A('danger', 'horror', 1, 1, '危險（！）', { keys: '驚嘆號 警告' }),
  A('blood', 'horror', 2, 2, '血跡', U),
  A('body', 'horror', 2.2, 4, '人形輪廓', { under: true, keys: '屍體 遺體' }),
  A('footprints', 'horror', 1, 3, '腳印', U),
  A('debris', 'horror', 3, 2.4, '瓦礫', { keys: '碎石' }),
  A('glass', 'horror', 1.6, 1.6, '碎玻璃', U),
  A('magic_circle', 'horror', 5, 5, '魔法陣', { under: true, keys: '儀式' }),
  A('altar', 'horror', 3, 1.6, '祭壇', { orient: true, keys: '儀式' }),
  A('candle', 'horror', 0.8, 0.8, '燭台', { keys: '蠟燭' }),
  A('cage', 'horror', 3, 3, '籠子・鐵籠'),
  A('coffin', 'horror', 1.8, 4, '棺材'),
  A('crate', 'horror', 1.6, 1.6, '木箱', { keys: '箱子' }),
  A('barrel', 'horror', 1.2, 1.2, '木桶', { keys: '酒桶' }),
  A('safe', 'horror', 1.2, 1.2, '保險箱', { keys: '金庫' }),
  A('tape', 'horror', 6, 0.35, '封鎖線', { keys: '膠帶' }),

  A('car', 'outdoor', 4, 9, '汽車', { keys: '車' }),
  A('tree', 'outdoor', 3, 3, '樹'),
  A('bush', 'outdoor', 1.6, 1.6, '灌木', { keys: '樹叢' }),
  A('garden_bench', 'outdoor', 3, 1, '戶外長椅', { orient: true, keys: '椅子' }),

  A('barber_chair', 'retro', 1.6, 2, '理髮椅', { orient: true, keys: '椅子' }),
  A('gramophone', 'retro', 1.4, 1.4, '留聲機'),
  A('irori', 'retro', 3, 3, '地爐（圍爐裏）', { keys: '火爐' }),
  A('kamado', 'retro', 3, 1.4, '爐灶', { orient: true, keys: '灶' }),
  A('butsudan', 'retro', 1.8, 1.2, '佛壇', O),
  A('tokonoma', 'retro', 3.6, 1.4, '床之間（壁龕）', { orient: true, keys: '和室' }),
  A('well', 'retro', 2.2, 2.2, '水井', { keys: '井' }),
  A('torii', 'retro', 8, 1.2, '鳥居', { keys: '神社' }),
  A('komainu', 'retro', 1.4, 1.4, '狛犬', { keys: '神社' }),
  A('lantern', 'retro', 1.2, 1.2, '石燈籠', { keys: '燈' }),
  A('temizuya', 'retro', 4, 3, '手水舍', { keys: '神社' }),
  A('hokora', 'retro', 1.6, 1.6, '小祠', { keys: '神社' }),
  A('saisen', 'retro', 2.4, 1, '賽錢箱', { keys: '神社' }),

  A('console', 'sf', 3.6, 1.4, '控制台', O),
  A('pilot_seat', 'sf', 1.6, 1.8, '駕駛座', { keys: '椅子' }),
  A('cryopod', 'sf', 1.8, 4, '冷凍睡眠艙'),
  A('reactor', 'sf', 5, 5, '動力爐'),
  A('holo_table', 'sf', 3.4, 3.4, '全像投影桌', { keys: '桌子' }),
  A('hatch', 'sf', 2, 2, '艙口'),

  A('rock', 'nature', 2.4, 2, '岩石', { keys: '石頭' }),
  A('tent', 'nature', 4, 4, '帳篷'),
  A('campfire', 'nature', 1.6, 1.6, '營火', { keys: '火' }),
  A('picnic', 'nature', 3.6, 3, '野餐桌', { keys: '桌子' }),
  A('log', 'nature', 3, 0.8, '圓木', { keys: '木頭' }),
  A('bones', 'nature', 1.4, 1.2, '骨頭', U),
  A('pit', 'nature', 2.4, 2.4, '坑洞・陷阱', { keys: '洞' }),
  A('boat', 'nature', 2.2, 5, '小船', { keys: '船' }),
];

export const ASSET: Readonly<Record<string, AssetInfo>> = Object.fromEntries(
  ASSETS.map((a) => [a.id, a]),
);

export const isAsset = (t: string): boolean => Object.hasOwn(ASSET, t);

/** 樓梯、電梯：下一層的位置也會淡淡地畫出來 */
export const VERTICAL_LINKS: ReadonlySet<string> = new Set([
  'stairs',
  'stairs_u',
  'spiral',
  'elevator',
]);

/** 家具的搜尋：名稱、別名、id 有包含關鍵字（不分大小寫；空白分隔的每個詞都要符合） */
export function assetMatches(a: AssetInfo, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${a.name} ${a.keys ?? ''} ${a.id}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** 轉向後的外框尺寸 */
export function assetDims(a: Pick<AssetInfo, 'w' | 'h'>, rot: number): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: a.h, h: a.w } : { w: a.w, h: a.h };
}
