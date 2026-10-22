/**
 * 範本目錄（全部是本站自己畫的）：住宅、公共場所、野外・地下、廢墟・事件（2026-10 增補學校、警察局、
 * 圖書館、寺廟、洞窟、山中小屋、地下教團據點，分類由三類改成四類）。
 * 每個範本可以「只載入格局（不含家具）」或「放入隱藏線索」。
 * 員工區、機房、後台、私室這類房間載入時預設「只有 GM 看得到」（gmDefaults.ts，2026-10 第一批）。
 */
import type { Floor, ThemeId } from '../model/types';
import { FloorBuilder, type TplFloor, toFloor } from './builder';
import { hospital, hotel } from './buildings';
import { addClues, type ClueSpec } from './clues';
import { decay } from './decay';
import { applyGmDefaults } from './gmDefaults';
import { lodge, mansion, studio, townhouse } from './homes';
import { library, police, school, temple } from './public';
import { cave, cult } from './wild';

export type TemplateGroupId = 'home' | 'public' | 'wild' | 'ruins';

export const TEMPLATE_GROUPS: readonly { id: TemplateGroupId; name: string }[] = [
  { id: 'home', name: '住宅' },
  { id: 'public', name: '公共場所' },
  { id: 'wild', name: '野外・地下' },
  { id: 'ruins', name: '廢墟・事件' },
];

export interface FloorTemplate {
  id: string;
  group: TemplateGroupId;
  name: string;
  description: string;
  build: () => TplFloor[];
  clues: readonly ClueSpec[];
  /** 載入時建議的顯示樣式（目前是彩色或恐怖調查時才換） */
  theme?: ThemeId;
}

const C = (floor: string, room: string, t: string, text: string): ClueSpec => ({
  floor,
  room,
  t,
  text,
});

/* ---------- 廢墟與事件（由上面的範本改出來） ---------- */

function abandonedHospital(): TplFloor[] {
  const floors = hospital();
  const b = new FloorBuilder('B1');
  b.room('地下走廊', 'hall', 16, 10, 24, 3, { hideLabel: true })
    .room('電梯廳', 'hall', 16, 0, 6, 10)
    .room('樓梯間', 'hall', 22, 0, 4, 10)
    .room('太平間', 'danger', 26, 0, 8, 10)
    .room('鍋爐室', 'garage', 16, 13, 10, 8)
    .room('廢棄物間', 'storage', 34, 0, 6, 10)
    .room('祕密實驗室', 'special', 26, 13, 14, 10, {
      gm: true,
      note: '走廊牆上的暗門。院長在這裡繼續做被禁止的實驗。',
    });
  b.dh(16.5, 10, 5, 1, 0, 'open')
    .dh(22.3, 10, 1.5, -1, 0)
    .dh(28, 10, 3, -1, 0, 'door2')
    .dh(36, 10, 1.5, -1, 0)
    .dh(18, 13, 1.5, 1, 0)
    .dh(31, 13, 1.5, 1, 0, 'secret');
  b.item('elevator', 16.2, 0.2, 0, { size: [2.7, 3.2] })
    .item('elevator', 19.1, 0.2, 0, { size: [2.7, 3.2] })
    .item('stairs', 23.2, 0.4, 180, { size: [2.4, 6] })
    .item('morgue', 26.2, 0, 0)
    .item('morgue', 30.6, 0, 0, { size: [3.2, 2.4] })
    .item('op_table', 28.5, 3.8, 0, { size: [2.4, 4] })
    .item('tank', 16.5, 14.6, 0)
    .item('tank', 19.5, 14.6, 0)
    .item('rack', 24.4, 18.6)
    .item('crate', 34.4, 6.8)
    .item('crate', 38.2, 2.2)
    .item('barrel', 38.4, 0.3)
    .item('tank', 27, 14.5, 0, { gm: true })
    .item('tank', 30, 14.5, 0, { gm: true })
    .item('lab_bench', 34.6, 13.2, 0, { gm: true })
    .item('cage', 36.4, 17.6, 0, { gm: true, size: [3, 4.4] })
    .item('magic_circle', 28.6, 17.6, 0, { gm: true, size: [4.4, 4.4] })
    .item('body', 33.4, 18.2, 90, { gm: true });
  const out = decay([b.f, ...floors], 2026, { remove: 3, blood: 3 });
  const g = out.find((f) => f.name === '1F');
  g?.items.push({ t: 'tape', x: 4, y: 26.2, w: 6, h: 0.35, rot: 0 });
  return out;
}

function ruinedHouse(): TplFloor[] {
  const floors = townhouse();
  const g = floors.find((f) => f.name === '1F');
  if (g) {
    const yard = g.rooms.find((r) => r.name === '前院');
    if (yard) {
      yard.name = '荒廢的前院';
      yard.cat = 'garden';
    }
    g.items.push(
      { t: 'bush', x: 0.6, y: 1, w: 1.6, h: 1.6, rot: 0 },
      { t: 'bush', x: 9.4, y: 0.6, w: 1.6, h: 1.6, rot: 0 },
      { t: 'tree', x: 6.4, y: 0, w: 3, h: 3, rot: 0 },
    );
    const bath = g.rooms.find((r) => r.name === '浴室');
    if (bath) bath.note = '浴缸裡積著黑色的水，底下好像有東西。';
  }
  const u = floors.find((f) => f.name === '2F');
  u?.items.push({ t: 'bones', x: 1.2, y: 10.3, w: 1.4, h: 1.2, rot: 0, gm: true });
  return decay(floors, 77, { remove: 3 });
}

function crimeScene(): TplFloor[] {
  const [f] = studio();
  const b = new FloorBuilder('1F');
  Object.assign(b.f, f);
  b.item('body', 4.2, 10.4, 90)
    .item('blood', 5.4, 9.6)
    .item('evidence', 3.9, 9.3, 0, { label: '1' })
    .item('evidence', 8.4, 9.4, 0, { label: '2' })
    .item('evidence', 6.4, 6.2, 0, { label: '3' })
    .item('evidence', 11, 8.6, 0, { label: '4' })
    .item('evidence', 1.5, 3, 0, { label: '5' })
    .item('knife', 7.2, 7.4, 0)
    .item('footprints', 3.6, 5.4, 90, { size: [0.9, 2.8] })
    .item('tape', -1.9, 0.6, 90, { size: [3.4, 0.35] })
    .item('safe', 12.6, 6.4, 0, { gm: true, label: '帳簿' });
  const bed = b.find('臥室');
  bed.note = '衣櫃旁的保險箱裡有第二本帳簿：被害人在勒索某人。';
  return [b.f];
}

export const TEMPLATES: readonly FloorTemplate[] = [
  {
    id: 'studio',
    group: 'home',
    name: '套房（一房一廳）',
    description: '玄關、浴室、開放式廚房、客廳與臥室，南邊有陽台。約 14 坪，一層。',
    build: studio,
    clues: [
      C('1F', '臥室', 'diary', '撕掉好幾頁的日記'),
      C('1F', '客廳', 'phone', '一直在震動的手機'),
      C('1F', '廚房', 'pills', '沒有標籤的藥瓶'),
    ],
  },
  {
    id: 'townhouse',
    group: 'home',
    name: '透天厝（三層）',
    description:
      '面寬 6 m 的街屋：一樓客廳、孝親房與廚房，二樓臥室與書房，三樓神明廳與頂樓露台；樓梯上下對齊。',
    build: townhouse,
    clues: [
      C('1F', '客廳', 'photo', '少了一個人的全家福'),
      C('1F', '廚房', 'knife', '刀架上少了一把刀'),
      C('2F', '書房', 'memo', '寫著日期的便條'),
      C('3F', '神明廳', 'key', '供桌底下的舊鑰匙'),
    ],
  },
  {
    id: 'mansion',
    group: 'home',
    name: '洋館（地下室～2F）',
    description:
      '左右對稱的大宅：大廳與雙樓梯、宴會廳、書房與圖書室，二樓客房與音樂室；地下酒窖後面有 GM 專用的密室。',
    build: mansion,
    clues: [
      C('1F', '書房', 'diary', '主人的日記'),
      C('1F', '廚房', 'memo', '圈起日期的菜單'),
      C('2F', '兒童房', 'photo', '孩子畫的家族圖'),
      C('2F', '音樂室', 'memo', '夾在樂譜裡的信'),
      C('B1', '酒窖', 'key', '酒桶旁的黃銅鑰匙'),
    ],
  },
  {
    id: 'lodge',
    group: 'home',
    name: '山中小屋（兩層）',
    description:
      '大雪封山的山莊：1F 有壁爐的客廳、餐廳與廚房、管理員室、柴房，前面是木造露台；2F 四間客房、主人房與浴室。',
    build: lodge,
    clues: [
      C('1F', '客廳', 'photo', '壁爐上倒扣的合照'),
      C('1F', '管理員室', 'key', '少了一把的鑰匙串'),
      C('2F', '客房 3', 'memo', '從門縫塞進來的警告'),
      C('2F', '主人房', 'diary', '提到「那場雪」的日記'),
    ],
  },
  {
    id: 'hotel',
    group: 'public',
    name: '商務飯店',
    description:
      '1F 大廳、櫃台、餐廳與會議室；2F 中走廊兩側排滿客房（每間有浴室）。電梯與樓梯上下對齊。',
    build: hotel,
    clues: [
      C('1F', '櫃台後方', 'memo', '被撕下的住宿登記'),
      C('1F', '會議室', 'photo', '有一張臉被劃掉的合照'),
      C('2F', '205 號房', 'phone', '沒電的手機'),
      C('2F', '208 號房', 'key', '別間房的房卡'),
    ],
  },
  {
    id: 'hospital',
    group: 'public',
    name: '綜合醫院',
    description: '1F 掛號、藥局、候診區、診間、檢驗與急診；2F 三人病房、單人房、護理站與手術室。',
    build: hospital,
    clues: [
      C('1F', '掛號・批價', 'memo', '重複的病歷號碼'),
      C('1F', '檢驗室', 'photo', 'X 光片上的異物'),
      C('2F', '手術室', 'pills', '沒有登記的藥劑'),
      C('2F', '值班室', 'diary', '值班日誌的最後一頁'),
    ],
  },
  {
    id: 'school',
    group: 'public',
    name: '學校（教室大樓）',
    description:
      '一字型的教室大樓：1F 保健室、理化教室與準備室、教師辦公室，2F 三間教室，屋頂有水塔；東西兩座樓梯上下對齊。',
    build: school,
    clues: [
      C('1F', '保健室', 'diary', '借用紀錄上重複的名字'),
      C('1F', '準備室', 'key', '標本櫃的備用鑰匙'),
      C('1F', '教師辦公室', 'memo', '被退回的轉學申請'),
      C('2F', '二年三班', 'photo', '畢業紀念冊被剪下的一頁'),
      C('屋頂', '屋頂', 'memo', '寫著「放學後來屋頂」的紙條'),
    ],
  },
  {
    id: 'police',
    group: 'public',
    name: '警察局（派出所）',
    description:
      '一層的派出所：大廳的值班台、辦公室、偵訊室（隔著單向玻璃的觀察室）、兩間留置室、上鎖的證物室與槍械室、備勤室與車庫。',
    build: police,
    clues: [
      C('1F', '證物室', 'memo', '登記簿被撕掉的一頁'),
      C('1F', '偵訊室', 'photo', '嫌犯的不在場證明照片'),
      C('1F', '留置室 2', 'clue', '牆上刻的記號'),
      C('1F', '辦公室', 'diary', '刑警的辦案筆記'),
      C('1F', '所長室', 'key', '證物室的備用鑰匙'),
    ],
  },
  {
    id: 'library',
    group: 'public',
    name: '圖書館（地下書庫）',
    description:
      '1F 開架閱覽區、期刊區、服務台與兒童閱覽區；B1 閉架書庫、修復室、上鎖的古籍室，書架後面有 GM 專用的禁書庫。樓梯與電梯上下對齊。',
    build: library,
    clues: [
      C('1F', '開架閱覽區', 'memo', '夾在書裡的借書單'),
      C('1F', '大廳・服務台', 'diary', '借閱紀錄上重複出現的名字'),
      C('B1', '古籍室', 'key', '刻著「禁」字的鑰匙'),
      C('B1', '修復室', 'photo', '修復到一半的古地圖'),
    ],
  },
  {
    id: 'temple',
    group: 'public',
    name: '寺廟（台灣的廟）',
    description:
      '廟埕（金爐、石獅、戲台）→ 前殿（三川門）→ 天井（天公爐）→ 正殿；兩側廂房是廟務辦公室、香客休息與廟公房，前殿兩旁是鐘樓、鼓樓。',
    build: temple,
    clues: [
      C('1F', '正殿', 'memo', '寫著失蹤者名字的光明燈'),
      C('1F', '廟務辦公室', 'diary', '少了一頁的香油錢帳本'),
      C('1F', '東廂房', 'idol', '用紅布包著的神像'),
      C('1F', '廟埕', 'photo', '金爐旁掉落的照片'),
    ],
  },
  {
    id: 'cave',
    group: 'wild',
    name: '洞窟',
    description:
      '從山徑走進不規則的洞室與通道：探險隊的營地、大洞室、崩落的支洞、地底湖，最深處是祭壇；窄縫後面有 GM 專用的封印之間。',
    build: cave,
    clues: [
      C('洞窟', '洞口', 'diary', '前一支探險隊的日誌'),
      C('洞窟', '大洞室', 'phone', '只剩一格電的手機'),
      C('洞窟', '祭壇', 'memo', '被撕下的禱文'),
      C('洞窟', '湖畔', 'photo', '泡過水的合照'),
      C('洞窟', '崩落的支洞', 'key', '生鏽的鐵籠鑰匙'),
    ],
  },
  {
    id: 'cult',
    group: 'wild',
    name: '地下教團據點',
    description:
      '1F 是不起眼的舊書店，上鎖的樓梯通往 B1：宿舍、資料室、教主室、有魔法陣的集會廳與兩間牢房；走廊盡頭的暗門後是 GM 專用的獻祭室。',
    build: cult,
    theme: 'horror',
    clues: [
      C('1F', '舊書店', 'memo', '只寫著日期與時刻的訂書單'),
      C('B1', '資料室', 'diary', '信徒名冊'),
      C('B1', '教主室', 'key', '刻著符號的鑰匙'),
      C('B1', '牢房 1', 'phone', '失蹤者的手機'),
    ],
  },
  {
    id: 'abandoned-hospital',
    group: 'ruins',
    name: '廢棄醫院',
    description:
      '荒廢的綜合醫院：門窗破損、散落瓦礫與血跡；地下室有太平間，還有 GM 專用的祕密實驗室。',
    build: abandonedHospital,
    theme: 'horror',
    clues: [
      C('1F', '掛號・批價', 'memo', '最後一天的掛號單'),
      C('2F', '手術室', 'pills', '沒有登記的藥劑'),
      C('2F', '值班室', 'diary', '值班日誌的最後一頁'),
      C('B1', '太平間', 'key', '標著「B」的鑰匙'),
    ],
  },
  {
    id: 'ruined-house',
    group: 'ruins',
    name: '廢屋（透天厝）',
    description:
      '沒人住的透天厝：前院長滿草、窗戶釘上木板、家具少了一些；浴室與主臥室藏著 GM 用的線索。',
    build: ruinedHouse,
    theme: 'horror',
    clues: [
      C('1F', '客廳', 'photo', '泛黃的全家福'),
      C('2F', '主臥室', 'diary', '受潮的日記'),
      C('3F', '神明廳', 'idol', '不認得的神像'),
    ],
  },
  {
    id: 'crime',
    group: 'ruins',
    name: '命案現場（套房）',
    description:
      '套房裡的命案：人形輪廓、血跡、刀子與證物標示牌 1～5；臥室有 GM 專用的保險箱與筆記。',
    build: crimeScene,
    clues: [
      C('1F', '臥室', 'phone', '螢幕碎掉的手機'),
      C('1F', '客廳', 'memo', '從門縫塞進來的紙條'),
      C('1F', '廚房', 'pills', '兩人份的安眠藥'),
    ],
  },
];

export const getTemplate = (id: string): FloorTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

export interface InstantiateOptions {
  /** 只載入格局：不含家具與文字 */
  structureOnly?: boolean;
  /** 放入隱藏線索 */
  clues?: boolean;
}

/** 範本 → 專案的樓層（新的 id） */
export function instantiateTemplate(id: string, options: InstantiateOptions = {}): Floor[] | null {
  const tpl = getTemplate(id);
  if (!tpl) return null;
  const floors = tpl.build();
  /* 員工區、機房、後台、私室這類房間預設只有 GM 看得到（F225） */
  applyGmDefaults(id, floors);
  if (options.structureOnly)
    for (const f of floors) {
      f.items = [];
      f.texts = [];
    }
  if (options.clues) addClues(floors, tpl.clues);
  return floors.map(toFloor);
}
