/**
 * 範本目錄（全部是本站自己畫的）：住宅、公共場所、野外・地下、廢墟・事件（2026-10 增補學校、警察局、
 * 圖書館、寺廟、洞窟、山中小屋、地下教團據點，分類由三類改成四類）。
 * 每個範本可以「只載入格局（不含家具）」或「放入隱藏線索」。
 * 員工區、機房、後台、私室這類房間載入時預設「只有 GM 看得到」（gmDefaults.ts，2026-10 第一批）。
 */
import type { Floor, ThemeId } from '../model/types';
import { FloorBuilder, type TplFloor, toFloor } from './builder';
import { hospital, hotel } from './buildings';
import { castle } from './castle';
import { clubBuilding, funeralHome, museum } from './civic';
import { addClues, type ClueSpec } from './clues';
import { detective, konbini, nightMarket, office, shoppingStreet } from './commerce';
import { decay } from './decay';
import { dungeon } from './dungeon';
import { tavern, wizardTower } from './fantasy';
import { applyGmDefaults } from './gmDefaults';
import { lodge, studio, townhouse } from './homes';
import { construction, factory, sewer, warehouse } from './industry';
import { gym, karaoke, theatre } from './leisure';
import { apartment, house, japaneseHouse, sanheyuan } from './living';
import { diner, ryokan, speakeasy } from './lodging';
import { mansion } from './mansion';
import { militaryBase, prison } from './military';
import { campsite, mine } from './outdoor';
import { library, police, school, temple } from './public';
import { asylum, hospitalAnnex, lab } from './research';
import { abandonedFactory, abandonedSchool } from './ruins';
import { church } from './sacred';
import { shrine } from './shrine';
import { spaceship } from './spaceship';
import { ferry, parking, station, subway } from './transport';
import { cave, cult } from './wild';

/**
 * 範本的分類（2026-10 第三批後半：4 類 → 13 類，數量和原作相當，名稱與分法本站自己定）。
 * 一個範本有一個主要的分類（「全部」依主要分類的順序排），`also` 是同時放進去的其他分類。
 */
export type TemplateGroupId =
  | 'home'
  | 'lodging'
  | 'medical'
  | 'public'
  | 'commerce'
  | 'leisure'
  | 'transport'
  | 'industry'
  | 'military'
  | 'sacred'
  | 'wild'
  | 'ruins'
  | 'fantasy';

export const TEMPLATE_GROUPS: readonly { id: TemplateGroupId; name: string }[] = [
  { id: 'home', name: '住宅' },
  { id: 'lodging', name: '住宿・餐飲' },
  { id: 'medical', name: '醫療・研究' },
  { id: 'public', name: '公共場所' },
  { id: 'commerce', name: '商店・辦公' },
  { id: 'leisure', name: '娛樂・表演' },
  { id: 'transport', name: '交通・運輸' },
  { id: 'industry', name: '工業・設施' },
  { id: 'military', name: '軍警・保全' },
  { id: 'sacred', name: '宗教・古蹟' },
  { id: 'wild', name: '野外・地下' },
  { id: 'ruins', name: '廢墟・事件' },
  { id: 'fantasy', name: '奇幻・科幻' },
];

export interface FloorTemplate {
  id: string;
  /** 主要的分類 */
  group: TemplateGroupId;
  /** 同時放進去的其他分類（範本對話框的分類按鈕；2026-10 第三批後半） */
  also?: readonly TemplateGroupId[];
  name: string;
  description: string;
  build: () => TplFloor[];
  clues: readonly ClueSpec[];
  /** 載入時建議的顯示樣式（目前是彩色或恐怖調查時才換） */
  theme?: ThemeId;
}

/**
 * 一條線索：哪一層、哪個房間、什麼小物、一句說明。說明裡的「/」是放不下一行時斷開的地方
 * （詞的邊界；2026-10-22 依 7.18），不會顯示出來；7 個字以上的說明都要標（單元測試檢查）。
 * 斷點的原則（D60、7.19）：「的」跟著前面的修飾語（第二行不以「的」開頭）；兩行盡量一樣窄——房間小時，
 * 一行超過 4～5 個字寬就會縮成 0.34 字級，載入看看（套房、山中小屋、監獄的幾則就是這樣調的）。
 * 說明的東西與說法要自己想，不沿用原作的線索文字（CLAUDE.md 規則 1）。
 */
const C = (floor: string, room: string, t: string, text: string): ClueSpec => {
  const at = text.indexOf('/');
  return at < 0
    ? { floor, room, t, text }
    : { floor, room, t, text: text.replace('/', ''), br: Array.from(text.slice(0, at)).length };
};

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
      { t: 'bush', x: 1.6, y: 1.6, w: 1.6, h: 1.6, rot: 0 },
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
    .item('evidence', 8.1, 9.4, 0, { label: '2' })
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
      C('1F', '臥室', 'camera', '對準床鋪的/縮時相機'),
      C('1F', '客廳', 'memo', '電視背面的/便利貼'),
      C('1F', '廚房', 'papers', '冷凍格深處的/信封'),
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
      C('1F', '客廳', 'photo', '少了一個人的/全家福'),
      C('1F', '廚房', 'knife', '刀架上/少了一把刀'),
      C('2F', '書房', 'memo', '寫著日期的/便條'),
      C('3F', '神明廳', 'key', '供桌底下的/舊鑰匙'),
    ],
  },
  {
    id: 'mansion',
    group: 'home',
    name: '洋館（地下室～2F）',
    description:
      'L 形的貿易商宅邸（1920 年代）：玄關大廳的大樓梯、會客室、吸菸室、私人禮拜堂與玻璃溫室，西翼是廚房與傭人用的後樓梯；地下室食品庫的暗門通往禮拜堂下面 GM 專用的地下祭室。',
    build: mansion,
    clues: [
      C('1F', '吸菸室', 'papers', '從南洋寄來的/貨運單'),
      C('1F', '溫室', 'memo', '沒有學名的/植物標籤'),
      C('2F', '書齋', 'diary', '主人用暗號/寫的日記'),
      C('2F', '長女的房間', 'photo', '剪掉一半的/訂婚照'),
      C('B1', '食品庫', 'memo', '貼在層架後面的/平面圖'),
    ],
  },
  {
    id: 'lodge',
    group: 'home',
    also: ['lodging', 'wild'],
    name: '山中小屋（兩層）',
    description:
      '大雪封山的山莊：1F 有壁爐的客廳、餐廳與廚房、管理員室、柴房，前面是木造露台；2F 四間客房、主人房與浴室。',
    build: lodge,
    clues: [
      C('1F', '客廳', 'photo', '壁爐上/倒扣的合照'),
      C('1F', '管理員室', 'key', '少一把的/鑰匙串'),
      C('2F', '客房 3', 'memo', '塞進門縫的/警告'),
      C('2F', '主人房', 'diary', '提到「那場雪」的/日記'),
    ],
  },
  {
    id: 'apartment',
    group: 'home',
    name: '老公寓（四樓）',
    description:
      '一層兩戶的四樓公寓：1F 自助洗衣店與房東家，4F 兩戶（B 戶鎖著、GM 專用），頂樓有水塔與加蓋的房間；樓梯間上下對齊。',
    build: apartment,
    clues: [
      C('1F', '自助洗衣店', 'memo', '公告欄底層的/尋人啟事'),
      C('1F', '餐廳', 'photo', '前任房客的/合照'),
      C('4F', 'A 臥室', 'diary', '記錄半夜/敲牆聲的筆記'),
      C('頂樓', '頂樓加蓋', 'key', '掛著「4B」/名牌的鑰匙'),
    ],
  },
  {
    id: 'house',
    group: 'home',
    name: '獨棟住宅（附地下室）',
    description:
      '庭院環繞的兩層獨棟：1F 和室、客廳、餐廳與車庫，2F 臥室、書房與兒童房，地下室有機房與 GM 專用的密室。',
    build: house,
    clues: [
      C('1F', '客廳', 'photo', '沒人看鏡頭的/全家福'),
      C('1F', '和室', 'memo', '貼在壁龕裡的/符紙'),
      C('2F', '兒童房', 'diary', '畫滿「地下的朋友」的/圖畫日記'),
      C('B1', '地下儲藏室', 'key', '沒有對應的門的/鑰匙'),
    ],
  },
  {
    id: 'sanheyuan',
    group: 'home',
    also: ['sacred'],
    name: '三合院',
    description:
      '台灣的農家：正身（公媽廳、大房、二房）、左右護龍（灶腳、柴房、浴間、農具間）圍著禾埕，後面是竹林；公媽廳後面有 GM 專用的暗間。',
    build: sanheyuan,
    clues: [
      C('1F', '公媽廳', 'memo', '多出一個/名字的族譜'),
      C('1F', '灶腳', 'knife', '刀柄刻著/符號的菜刀'),
      C('1F', '大房', 'diary', '阿嬤用日文/寫的日記'),
      C('1F', '禾埕', 'photo', '石磨底下的/舊相片'),
      C('1F', '四房', 'key', '古早的/銅鎖鑰匙'),
    ],
  },
  {
    id: 'japanese-house',
    group: 'home',
    also: ['sacred'],
    name: '日式宿舍',
    description:
      '日本時代留下來的木造宿舍：座敷、次間、緣側面向庭院，北邊是廚房、浴室與書房；庭院角落的木板下是 GM 專用的防空壕。',
    build: japaneseHouse,
    clues: [
      C('1F', '書房', 'diary', '昭和年間的/值勤日誌'),
      C('1F', '座敷', 'photo', '穿軍服的/男人的照片'),
      C('1F', '廚房', 'key', '刻著片假名的/鑰匙'),
      C('1F', '洋式客廳', 'memo', '夾在唱片/封套裡的信'),
    ],
  },
  {
    id: 'hotel',
    group: 'lodging',
    name: '商務飯店',
    description:
      '1F 大廳、櫃台、餐廳與會議室；2F 中走廊兩側排滿客房（每間有浴室）。電梯與樓梯上下對齊。',
    build: hotel,
    clues: [
      C('1F', '櫃台後方', 'memo', '被撕下的/住宿登記'),
      C('1F', '會議室', 'photo', '有一張臉/被劃掉的合照'),
      C('2F', '205 號房', 'phone', '沒電的手機'),
      C('2F', '208 號房', 'key', '別間房的房卡'),
    ],
  },
  {
    id: 'ryokan',
    group: 'lodging',
    name: '溫泉旅館',
    description:
      '1F 大廳・櫃台、宴會廳、男女大浴場與露天溫泉，2F 和室客房；走廊盡頭的「櫻之間」不開放（GM 專用）。樓梯上下對齊。',
    build: ryokan,
    clues: [
      C('1F', '大廳・櫃台', 'diary', '住宿名簿上/被塗掉的名字'),
      C('1F', '宴會廳', 'photo', '少了一個人的/宴會合照'),
      C('1F', '女湯', 'key', '浴池底撿到的/舊鑰匙'),
      C('2F', '松之間', 'memo', '塞在掛軸後面的/紙條'),
    ],
  },
  {
    id: 'speakeasy',
    group: 'lodging',
    also: ['leisure'],
    name: '地下酒館（1920 年代）',
    description:
      '禁酒令時期的地下酒館：1F 是理髮店與花店，上鎖的門後的樓梯通到 B1 的酒館、酒窖、撲克室與老闆辦公室；暗門後是 GM 專用的逃生地道。',
    build: speakeasy,
    clues: [
      C('1F', '理髮店', 'memo', '寫著敲門暗號的/紙條'),
      C('B1', '酒館', 'photo', '鋼琴上的/團體照'),
      C('B1', '老闆辦公室', 'diary', '記著「到貨」/日期的帳本'),
      C('B1', '酒窖', 'key', '塞在桶孔裡的/黃銅鑰匙'),
    ],
  },
  {
    id: 'diner',
    group: 'lodging',
    also: ['commerce'],
    name: '公路旁的餐廳',
    description:
      '深夜的公路餐廳：靠窗的卡座、廚房、店長室、員工休息室，前面是停車場、後面是後巷；冷凍庫是 GM 專用。',
    build: diner,
    clues: [
      C('1F', '用餐區', 'memo', '寫著「救命」的/餐巾紙'),
      C('1F', '店長室', 'photo', '店長和卡車司機的/合照'),
      C('1F', '廁所', 'phone', '泡在水箱裡的/手機'),
      C('1F', '倉庫', 'key', '冷凍庫門外/掛著的鑰匙'),
    ],
  },
  {
    id: 'hospital',
    group: 'medical',
    name: '綜合醫院',
    description: '1F 掛號、藥局、候診區、診間、檢驗與急診；2F 三人病房、單人房、護理站與手術室。',
    build: hospital,
    clues: [
      C('1F', '掛號・批價', 'memo', '重複的/病歷號碼'),
      C('1F', '檢驗室', 'photo', 'X 光片上的/異物'),
      C('2F', '手術室', 'pills', '沒有登記的/藥劑'),
      C('2F', '值班室', 'diary', '值班日誌的/最後一頁'),
    ],
  },
  {
    id: 'hospital-annex',
    group: 'medical',
    name: '醫院別館（隔離病棟）',
    description:
      '本館後面的兩層別館：1F 護理站、診察室、病歷室、舊手術室與遺體安置室，2F 隔離病房與觀察室；焊死的特別病房是 GM 專用。',
    build: hospitalAnnex,
    clues: [
      C('1F', '護理站', 'diary', '交班簿的/最後一頁'),
      C('1F', '病歷室', 'file_folder', '只剩封面的/病歷'),
      C('2F', '隔離病房 3', 'recorder', '病人錄下的/自言自語'),
      C('2F', '觀察室', 'photo', '夜班走廊的/錄影截圖'),
    ],
  },
  {
    id: 'lab',
    group: 'medical',
    also: ['military'],
    name: '地下研究所',
    description:
      '表面是製藥公司：1F 大廳、辦公室與警衛室；B1 實驗室、無菌室、動物實驗室、低溫保存室；B2 的收容區整層是 GM 專用。樓梯與電梯三層對齊。',
    build: lab,
    clues: [
      C('1F', '辦公室', 'file_folder', '「第二研究棟」的/預算書'),
      C('B1', '主任室', 'diary', '主任的/研究日誌'),
      C('B1', '實驗室', 'pills', '只標著代號的/試劑'),
      C('B1', '低溫保存室', 'key', '寫著「B2」的/鑰匙卡'),
    ],
  },
  {
    id: 'asylum',
    group: 'medical',
    also: ['ruins'],
    name: '療養院',
    description:
      '郊外的療養院：1F 院長室、診療室、護理站、交誼廳、病房與包著軟墊的隔離室，B1 水療室、電療室與舊病歷庫；病歷庫後面是 GM 專用的特別治療室。',
    build: asylum,
    clues: [
      C('1F', '院長室', 'diary', '院長的/治療紀錄'),
      C('1F', '交誼廳', 'memo', '病人們畫的/同一張臉'),
      C('1F', '病房 2', 'memo', '床板下刻的字'),
      C('B1', '舊病歷庫', 'file_folder', '沒有出院紀錄的/病歷'),
      C('B1', '水療室', 'key', '掛在浴缸邊的/束縛帶鑰匙'),
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
      C('1F', '保健室', 'diary', '借用紀錄上/重複的名字'),
      C('1F', '準備室', 'key', '標本箱底下/壓著的鑰匙'),
      C('1F', '教師辦公室', 'memo', '被退回的/轉學申請'),
      C('2F', '二年三班', 'photo', '畢業紀念冊/被剪下的一頁'),
      C('屋頂', '屋頂', 'memo', '紙條上寫著/「放學後來屋頂」'),
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
      C('1F', '開架閱覽區', 'memo', '夾在書裡的/借書單'),
      C('1F', '大廳・服務台', 'diary', '借閱紀錄上/重複出現的名字'),
      C('B1', '古籍室', 'key', '刻著「禁」字的/鑰匙'),
      C('B1', '修復室', 'photo', '修復到一半的/古地圖'),
    ],
  },
  {
    id: 'club-building',
    group: 'public',
    also: ['leisure'],
    name: '大學社團大樓',
    description:
      '中走廊兩側排滿社辦的兩層樓：攝影社（暗房）、吉他社、推理研究社、神祕學研究會、電影社…；2F 鎖著的廢社社辦是 GM 專用。',
    build: clubBuilding,
    clues: [
      C('1F', '攝影社', 'photo', '多拍到一個人的/社員合照'),
      C('1F', '推理研究社', 'memo', '社團日誌上/空白的那一週'),
      C('2F', '神祕學研究會', 'diary', '社員輪流寫的/觀察筆記'),
      C('2F', '社團聯合辦公室', 'key', '廢社社辦的/鑰匙'),
    ],
  },
  {
    id: 'museum',
    group: 'public',
    also: ['leisure'],
    name: '博物館',
    description:
      '1F 有恐龍骨架的常設展示室、特展室、大廳、館長室與修復室；B1 收藏庫、燻蒸室與機房，貨架後面是 GM 專用的未登錄品庫。樓梯與貨梯上下對齊。',
    build: museum,
    clues: [
      C('1F', '常設展示室', 'photo', '說明牌底下的/舊照片'),
      C('1F', '特展室', 'memo', '少了一件展品的/清單'),
      C('1F', '館長室', 'diary', '館長的/出差紀錄'),
      C('B1', '收藏庫', 'key', '沒有編號的/收藏櫃鑰匙'),
    ],
  },
  {
    id: 'funeral-home',
    group: 'public',
    also: ['sacred'],
    name: '殯儀館',
    description:
      '告別式場、靈堂、遺體化妝室與冷藏室，前面是大廳與家屬休息室；說是不用了的舊停柩室是 GM 專用。',
    build: funeralHome,
    clues: [
      C('1F', '告別式場', 'photo', '遺照上/多出來的人影'),
      C('1F', '家屬休息室', 'memo', '寫給死者的信'),
      C('1F', '辦公室', 'diary', '排班表上/不存在的同事'),
      C('1F', '大廳・接待', 'papers', '簽到簿上/陌生的簽名'),
    ],
  },
  {
    id: 'office',
    group: 'commerce',
    name: '辦公大樓',
    description:
      '1F 有旋轉門的大廳、警衛室與咖啡店，8F 開放辦公區、會議室、社長室與伺服器室，屋頂有水塔；社長室書櫃後面是 GM 專用的密室。核心的樓梯三層對齊。',
    build: office,
    clues: [
      C('1F', '大廳', 'papers', '訪客登記表上的/假名'),
      C('8F', '開放辦公區', 'laptop', '還沒登出的/同事的電腦'),
      C('8F', '社長室', 'diary', '倒數日期的/行事曆'),
      C('8F', '會議室', 'recorder', '桌底黏著的/錄音筆'),
    ],
  },
  {
    id: 'konbini',
    group: 'commerce',
    name: '便利商店',
    description:
      '深夜的便利商店：貨架、冷藏櫃、收銀台與 ATM，後面是倉庫、冷藏庫與員工休息室，前面是停車場。',
    build: konbini,
    clues: [
      C('1F', '賣場', 'memo', '收銀台旁的/交班筆記'),
      C('1F', '廁所', 'phone', '鏡子後面的/手機'),
      C('1F', '停車場', 'key', '掉在車輪旁的/機車鑰匙'),
    ],
  },
  {
    id: 'detective',
    group: 'commerce',
    also: ['ruins'],
    name: '偵探事務所',
    description:
      '舊大樓的兩層：1F 是當舖，獨立的樓梯通到 2F 的偵探事務所（接待室、所長室、資料室）與住處；所長室的掛畫後面是 GM 專用的密室。',
    build: detective,
    clues: [
      C('2F', '接待室', 'memo', '委託人留下的/地址'),
      C('2F', '所長室', 'diary', '所長沒寫完的/調查筆記'),
      C('2F', '資料室', 'file_folder', '標著「未結」的/檔案'),
      C('1F', '當舖', 'photo', '夾在當票裡的/照片'),
    ],
  },
  {
    id: 'shopping-street',
    group: 'commerce',
    name: '老街',
    description:
      '騎樓兩側的老店：中藥行、照相館、雜貨店、茶行、理髮廳、麵店、金紙店、鐘錶行、舊書店與神壇；神壇供桌後面是 GM 專用的後室。',
    build: shoppingStreet,
    clues: [
      C('1F', '中藥行', 'pills', '寫著奇怪藥名的/藥包'),
      C('1F', '照相館', 'photo', '一直沒人來領的/照片'),
      C('1F', '舊書店', 'diary', '夾在舊書裡的/日記'),
      C('1F', '鐘錶行', 'key', '鐘擺上掛著的/鑰匙'),
    ],
  },
  {
    id: 'night-market',
    group: 'commerce',
    also: ['leisure'],
    name: '夜市',
    description:
      '廟口的夜市街：土地公廟、兩側的攤位（射氣球、撈金魚、蚵仔煎、算命…）、公廁與停車場；鎖著的鐵皮倉庫是 GM 專用。',
    build: nightMarket,
    clues: [
      C('1F', '算命攤', 'memo', '算命師/塞給你的紙條'),
      C('1F', '射氣球攤', 'idol', '獎品架上的/舊娃娃'),
      C('1F', '蚵仔煎攤', 'phone', '一直響的/失物手機'),
      C('1F', '土地公廟', 'key', '供桌下的/鐵皮鑰匙'),
    ],
  },
  {
    id: 'theatre',
    group: 'leisure',
    name: '劇場',
    description:
      '1F 舞台、側台、觀眾席與大廳，後台有化妝室、道具間與舞台監督室；B1 是舞台下的奈落（升降口與樓梯上下對齊），封起來的奈落深處是 GM 專用。',
    build: theatre,
    clues: [
      C('1F', '化妝室 2', 'photo', '鏡子上貼的/舊公演照片'),
      C('1F', '道具間', 'knife', '開了刃的/道具刀'),
      C('1F', '觀眾席', 'memo', '固定座位上的/留言'),
      C('B1', '奈落', 'diary', '舞台監督的/日誌'),
    ],
  },
  {
    id: 'karaoke',
    group: 'leisure',
    name: 'KTV',
    description: '櫃台大廳、廚房與員工室，走廊兩側是隔音的包廂；最裡面上鎖的 VIP 包廂是 GM 專用。',
    build: karaoke,
    clues: [
      C('1F', '櫃台大廳', 'papers', '包廂的登記表'),
      C('1F', '包廂 3', 'phone', '卡在沙發縫裡的/手機'),
      C('1F', '包廂 6', 'memo', '點歌單上/沒聽過的歌名'),
    ],
  },
  {
    id: 'gym',
    group: 'leisure',
    also: ['commerce'],
    name: '健身房',
    description:
      '面街的連鎖健身房：落地窗邊的有氧區、入口大廳與玻璃隔間的瑜珈教室，中間是器材區（滑輪訓練機、划船機）與自由重量區（深蹲架、臥推架、啞鈴）；東側走廊通往員工室、更衣室與淋浴間、廁所。男淋浴間牆上的暗門後面，封起來的舊三溫暖室是 GM 專用。',
    build: gym,
    clues: [
      C('1F', '瑜珈教室', 'photo', '角落的/學員合照'),
      C('1F', '器材區', 'diary', '全是數字的/訓練日誌'),
      C('1F', '男更衣室', 'bag', '沒人認領的/運動背包'),
      C('1F', '女更衣室', 'pills', '罐底藏的藥片'),
    ],
  },
  {
    id: 'station',
    group: 'transport',
    name: '地方車站',
    description:
      '鄉下的小站：站房（售票處、候車室、站長室、遺失物保管室）、側式月台與島式月台、兩條鐵軌；B1 的地下道連到兩座月台，砌起來的舊通道是 GM 專用。',
    build: station,
    clues: [
      C('1F', '候車室', 'memo', '時刻表上/手寫的班次'),
      C('1F', '站長室', 'diary', '站長的/值勤日誌'),
      C('1F', '遺失物保管室', 'bag', '十年前的/遺失物'),
      C('B1', '地下道', 'photo', '牆角褪色的/尋人海報'),
    ],
  },
  {
    id: 'subway',
    group: 'transport',
    name: '地下鐵車站',
    description:
      '1F 出入口與電梯亭，B1 大廳（售票機、驗票閘門、站務室、置物櫃），B2 有月台門的島式月台；封閉門後的廢棄月台是 GM 專用。樓梯與電梯上下對齊。',
    build: subway,
    clues: [
      C('1F', '1 號出入口', 'papers', '被撕掉一角的/路線圖'),
      C('B1', '大廳', 'memo', '站名不存在的/車票'),
      C('B1', '置物櫃區', 'key', '編號磨掉的/寄物鑰匙'),
      C('B2', '島式月台', 'photo', '監視器拍到的/末班車'),
    ],
  },
  {
    id: 'parking',
    group: 'transport',
    also: ['commerce'],
    name: '地下停車場',
    description:
      '商場底下的兩層停車場：1F 坡道入口與管理亭，B1、B2 停車區與坡道，B2 有機房，圍籬封起來的一角是 GM 專用。樓梯與電梯三層對齊。',
    build: parking,
    clues: [
      C('1F', '管理亭', 'diary', '凌晨空白的/巡邏表'),
      C('B1', '停車區 B1', 'phone', '壓在輪胎下的/手機'),
      C('B2', '停車區 B2', 'key', '找不到車的/車鑰匙'),
    ],
  },
  {
    id: 'ferry',
    group: 'transport',
    name: '渡輪',
    description:
      '離島航線的小渡輪：1F 客艙、小賣部與船員室，2F 上甲板（救生艇）、船長室與駕駛艙，B1 機艙與貨艙；貨艙隔板後的密艙是 GM 專用。樓梯三層對齊。',
    build: ferry,
    clues: [
      C('1F', '客艙大廳', 'memo', '塞在座位背面的/紙條'),
      C('1F', '小賣部', 'photo', '收銀機旁的/舊照片'),
      C('2F', '駕駛艙', 'diary', '航海日誌的/最後一頁'),
      C('B1', '貨艙', 'key', '沒登記的/貨櫃鑰匙'),
    ],
  },
  {
    id: 'factory',
    group: 'industry',
    name: '工廠',
    description:
      '1F 有輸送帶與車床的廠房、倉庫、卸貨區、更衣室、鍋爐室與品管室，2F 監看走道、辦公室與廠長室；廠長室的暗門後是 GM 專用的密封儲藏室。',
    build: factory,
    clues: [
      C('1F', '廠房', 'memo', '夾在輸送帶上的/紙條'),
      C('1F', '品管室', 'file_folder', '數字被改過的/檢驗報告'),
      C('1F', '更衣室', 'key', '貼著紅膠帶的/置物櫃鑰匙'),
      C('2F', '廠長室', 'diary', '廠長的/工作日誌'),
    ],
  },
  {
    id: 'warehouse',
    group: 'industry',
    also: ['transport'],
    name: '港口倉庫',
    description:
      '碼頭邊的兩棟倉庫：貨櫃堆場、守衛亭、倉庫辦公室、重型貨架與堆高機，前面是碼頭與港灣；倉庫 B 裡的改裝貨櫃是 GM 專用。',
    build: warehouse,
    clues: [
      C('1F', '倉庫辦公室', 'papers', '對不上數字的/出貨單'),
      C('1F', '倉庫 A', 'photo', '木箱縫裡的/舊相片'),
      C('1F', '倉庫 B', 'memo', '用外文寫的/收件人'),
      C('1F', '碼頭', 'key', '掉在繫船柱旁的/鑰匙'),
    ],
  },
  {
    id: 'construction',
    group: 'industry',
    also: ['ruins'],
    name: '工地',
    description:
      '圍籬裡施工中的兩層樓：樓板、柱子、施工便梯、工務所、材料堆置場與怪手；打地基挖到古井的開挖區是 GM 專用。',
    build: construction,
    clues: [
      C('1F', '工務所', 'diary', '工地主任的/施工日誌'),
      C('1F', '一樓樓板', 'photo', '挖出東西的/現場照'),
      C('2F', '二樓樓板', 'memo', '寫在鋼筋上的/記號'),
    ],
  },
  {
    id: 'sewer',
    group: 'industry',
    also: ['wild'],
    name: '下水道',
    description:
      '街道的人孔往下是磚造的下水道：主渠道、兩側的檢修步道、南支渠與泵站；步道磚牆後面的祭壇空洞是 GM 專用。梯子上下對齊。',
    build: sewer,
    clues: [
      C('1F', '街道', 'memo', '人孔蓋旁的/粉筆記號'),
      C('B1', '泵站', 'diary', '維修員的/巡查表'),
      C('B1', '北側步道', 'photo', '漂在水面的/證件照'),
      C('B1', '南側步道', 'bag', '卡在格柵上的/背包'),
    ],
  },
  {
    id: 'police',
    group: 'military',
    also: ['public'],
    name: '警察局（派出所）',
    description:
      '一層的派出所：大廳的值班台、辦公室、偵訊室（隔著單向玻璃的觀察室）、兩間留置室、上鎖的證物室與槍械室、備勤室與車庫。',
    build: police,
    clues: [
      C('1F', '證物室', 'memo', '登記簿/被撕掉的一頁'),
      C('1F', '偵訊室', 'photo', '嫌犯的不在場證明/照片'),
      C('1F', '留置室 2', 'clue', '牆上刻的記號'),
      C('1F', '辦公室', 'diary', '刑警的/辦案筆記'),
      C('1F', '所長室', 'key', '黏在抽屜底的/證物室鑰匙'),
    ],
  },
  {
    id: 'military-base',
    group: 'military',
    name: '軍事基地',
    description:
      '圍籬裡的營區：營舍、餐廳、司令室、作戰室、停著戰車的車庫、彈藥庫、操場與直升機坪；B1 地下指揮所的南邊是 GM 專用的封鎖實驗區。',
    build: militaryBase,
    clues: [
      C('1F', '營舍', 'diary', '只有開頭的/家書'),
      C('1F', '作戰室', 'papers', '畫著紅圈的/地圖'),
      C('1F', '衛哨', 'memo', '進出登記簿的/最後一行'),
      C('B1', '機密檔案室', 'recorder', '最後一段/無線電錄音'),
    ],
  },
  {
    id: 'prison',
    group: 'military',
    name: '監獄（舍房區）',
    description:
      '鐵欄杆的舍房沿著走廊排開，旁邊是監控室、淋浴間、醫務室與會客室，西邊是圍起來的運動場；只有送餐口的獨居房是 GM 專用。',
    build: prison,
    clues: [
      C('1F', '舍房 3', 'memo', '床板底下/刻著日期'),
      C('1F', '會客室', 'photo', '會客時/遞來的照片'),
      C('1F', '醫務室', 'pills', '沒有處方的藥'),
      C('1F', '運動場', 'key', '埋在沙坑裡的/鑰匙'),
    ],
  },
  {
    id: 'temple',
    group: 'sacred',
    also: ['public'],
    name: '寺廟（台灣的廟）',
    description:
      '廟埕（金爐、石獅、戲台）→ 前殿（三川門）→ 天井（天公爐）→ 正殿；兩側廂房是廟務辦公室、香客休息與廟公房，前殿兩旁是鐘樓、鼓樓。',
    build: temple,
    clues: [
      C('1F', '正殿', 'memo', '寫著失蹤者名字的/光明燈'),
      C('1F', '廟務辦公室', 'diary', '少了一頁的/香油錢帳本'),
      C('1F', '東廂房', 'idol', '用紅布包著的/神像'),
      C('1F', '廟埕', 'photo', '金爐旁掉落的/照片'),
    ],
  },
  {
    id: 'shrine',
    group: 'sacred',
    name: '神社',
    description:
      '沿著山坡往上的山腰神社：山道旁的鳥居進到下段（授與所、宮司宅），石階上到中段（參籠所、一排朱紅小鳥居通往稻荷社），再上到上段的社殿（緣側、外陣、內陣）與磐座；磐座後面封印的岩屋是 GM 專用。',
    build: shrine,
    clues: [
      C('1F', '授與所', 'papers', '只寫著日期的/奉納帳'),
      C('1F', '參籠所', 'diary', '參籠者留下的/夢境紀錄'),
      C('1F', '稻荷社', 'key', '狐像嘴裡的/小鑰匙'),
      C('1F', '磐座', 'photo', '岩石前的/集體照'),
    ],
  },
  {
    id: 'church',
    group: 'sacred',
    name: '教會',
    description:
      '墓園圍繞的石造教會：1F 禮拜堂（長椅、管風琴、告解室）、聖器室、後殿與牧師館，B1 地下墓室；焊死的納骨堂是 GM 專用。樓梯上下對齊。',
    build: church,
    clues: [
      C('1F', '禮拜堂', 'memo', '夾在聖經裡的/紙條'),
      C('1F', '書房', 'diary', '牧師的日記'),
      C('1F', '聖器室', 'key', '地下墓室的/鑰匙'),
      C('B1', '地下墓室', 'photo', '放在棺木上的/舊照片'),
    ],
  },
  {
    id: 'castle',
    group: 'sacred',
    also: ['fantasy'],
    name: '古城',
    description:
      '湖岬上的石造古城：南邊的堤道與門樓進到外庭（鍛冶場、糧倉、守備隊宿舍、箭塔），格柵門後是內庭與臨湖的三層主塔（B1 地窖、水牢、蓄水池；1F 守衛廳、武器庫、地圖室；2F 宴會廳、城主寢室、書記室）；B1 暗門後的密道與湖底的祕密碼頭是 GM 專用。螺旋梯三層對齊。',
    build: castle,
    clues: [
      C('1F', '地圖室', 'papers', '畫著湖底水道的/舊地圖'),
      C('1F', '鍛冶場', 'key', '剛打好的/牢房鑰匙'),
      C('2F', '書記室', 'diary', '書記官/最後的手記'),
      C('B1', '地窖', 'memo', '酒桶上刻的/求救記號'),
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
      C('洞窟', '洞口', 'tools', '岩縫裡卡著的/登山扣環'),
      C('洞窟', '大洞室', 'phone', '只剩一格電的/手機'),
      C('洞窟', '祭壇', 'memo', '被撕下的禱文'),
      C('洞窟', '湖畔', 'photo', '沉在淺灘的/相框'),
      C('洞窟', '崩落的支洞', 'key', '被落石壓住的/鐵籠鑰匙'),
    ],
  },
  {
    id: 'cult',
    group: 'wild',
    also: ['ruins'],
    name: '地下教團據點',
    description:
      '1F 是不起眼的舊書店，上鎖的樓梯通往 B1：宿舍、資料室、教主室、有魔法陣的集會廳與兩間牢房；走廊盡頭的暗門後是 GM 專用的獻祭室。',
    build: cult,
    theme: 'horror',
    clues: [
      C('1F', '舊書店', 'memo', '只寫著日期與時刻的/訂書單'),
      C('B1', '資料室', 'diary', '信徒名冊'),
      C('B1', '教主室', 'key', '刻著符號的/鑰匙'),
      C('B1', '牢房 1', 'phone', '相簿全空的/手機'),
    ],
  },
  {
    id: 'campsite',
    group: 'wild',
    also: ['leisure'],
    name: '露營區',
    description:
      '溪邊的露營區：A、B 兩區營位（帳篷、營火）、炊事場、管理中心、公廁與停車場；溪對岸林子裡亮著燈的廢屋是 GM 專用。',
    build: campsite,
    clues: [
      C('1F', '管理中心', 'papers', '登記表上/空白的那一欄'),
      C('1F', 'A 區營位', 'phone', '帳篷裡/沒電的手機'),
      C('1F', '炊事場', 'knife', '沾著怪異液體的/小刀'),
      C('1F', '溪邊', 'photo', '溪邊撿到的/拍立得'),
    ],
  },
  {
    id: 'mine',
    group: 'wild',
    also: ['industry', 'ruins'],
    name: '廢礦坑',
    description:
      '1F 坑口廣場的事務所、工具間與升降口，B1 不規則的坑道：主坑道（鐵軌）、木造的休息所、崩落區；通道盡頭岩壁後的最深處是 GM 專用。升降機上下對齊。',
    build: mine,
    clues: [
      C('1F', '事務所', 'diary', '最後一天的/出坑紀錄'),
      C('1F', '工具間', 'flashlight', '纏著布條的/手電筒'),
      C('B1', '休息所', 'photo', '礦工們的合照'),
      C('B1', '主坑道', 'memo', '用炭寫在/支柱上的字'),
    ],
  },
  {
    id: 'abandoned-hospital',
    group: 'ruins',
    also: ['medical'],
    name: '廢棄醫院',
    description:
      '荒廢的綜合醫院：門窗破損、散落瓦礫與血跡；地下室有太平間，還有 GM 專用的祕密實驗室。',
    build: abandonedHospital,
    theme: 'horror',
    clues: [
      C('1F', '掛號・批價', 'memo', '最後一天的/掛號單'),
      C('2F', '手術室', 'pills', '沒有登記的/藥劑'),
      C('2F', '值班室', 'diary', '值班日誌的/最後一頁'),
      C('B1', '太平間', 'key', '標著「B」的/鑰匙'),
    ],
  },
  {
    id: 'ruined-house',
    group: 'ruins',
    also: ['home'],
    name: '廢屋（透天厝）',
    description:
      '沒人住的透天厝：前院長滿草、窗戶釘上木板、家具少了一些；浴室與主臥室藏著 GM 用的線索。',
    build: ruinedHouse,
    theme: 'horror',
    clues: [
      C('1F', '客廳', 'photo', '泛黃的全家福'),
      C('2F', '主臥室', 'diary', '受潮的日記'),
      C('3F', '神明廳', 'idol', '臉被磨平的/神像'),
    ],
  },
  {
    id: 'abandoned-factory',
    group: 'ruins',
    also: ['industry'],
    name: '廢棄工廠',
    description:
      '關了十年的工廠：窗戶破了、門壞了、牆上滿是裂痕與塗鴉，輸送帶旁長出黑色的東西；廠長室暗門後的密封儲藏室是 GM 專用。',
    build: abandonedFactory,
    theme: 'horror',
    clues: [
      C('1F', '廠房', 'photo', '最後一天的/員工合照'),
      C('1F', '更衣室', 'key', '寫著名字的/置物櫃鑰匙'),
      C('1F', '品管室', 'file_folder', '沒寄出去的/事故報告'),
      C('2F', '辦公室', 'memo', '釘在布告欄上的/警告'),
    ],
  },
  {
    id: 'abandoned-school',
    group: 'ruins',
    also: ['public'],
    name: '廢校（教室大樓）',
    description:
      '廢校多年的教室大樓：門窗破損、課桌少了一些、牆上有塗鴉與霉斑；1F 的準備室是 GM 專用。東西兩座樓梯上下對齊。',
    build: abandonedSchool,
    theme: 'horror',
    clues: [
      C('1F', '保健室', 'diary', '全是同一人的/就診簿'),
      C('1F', '教師辦公室', 'file_folder', '學生的/輔導紀錄'),
      C('2F', '二年三班', 'photo', '背面打叉的/班級合照'),
      C('屋頂', '屋頂', 'memo', '綁在欄杆上的/紙條'),
    ],
  },
  {
    id: 'crime',
    group: 'ruins',
    also: ['home'],
    name: '命案現場（套房）',
    description:
      '套房裡的命案：人形輪廓、血跡、刀子與證物標示牌 1～5；臥室有 GM 專用的保險箱與筆記。',
    build: crimeScene,
    clues: [
      C('1F', '臥室', 'phone', '螢幕碎掉的/手機'),
      C('1F', '客廳', 'memo', '從門縫塞進來的/紙條'),
      C('1F', '廚房', 'pills', '兩人份的/安眠藥'),
    ],
  },
  {
    id: 'dungeon',
    group: 'fantasy',
    also: ['wild'],
    name: '地下迷宮',
    description:
      '螺旋狀往內收的地下迷宮：從崩落的入口沿著迴廊繞圈往裡走，要涉過地底河，沿途有骸骨堂、噴泉廣間、書庫遺跡、蟲巢、鍊金工房、蛇窟、落穴之間、鏡之間與石像之間；最深處的前室旁，封印的門後的玄室是 GM 專用。',
    build: dungeon,
    clues: [
      C('B1', '書庫遺跡', 'papers', '寫著封印儀式的/殘頁'),
      C('B1', '鍊金工房', 'pills', '貼著骷髏標籤的/藥瓶'),
      C('B1', '骸骨堂', 'key', '握在骸骨手裡的/鑰匙'),
      C('B1', '鏡之間', 'memo', '刻在鏡框背面的/咒文'),
    ],
  },
  {
    id: 'spaceship',
    group: 'fantasy',
    name: '太空船',
    description:
      '環形的研究船：環狀走廊圍著交誼艙、水耕艙、生物實驗室與補給倉庫，左舷是居住艙與指揮官寢室，右舷是醫療艙、太空衣室與氣閘，船首是指揮室、船尾是主機艙；焊死的第 7 實驗艙是 GM 專用。',
    build: spaceship,
    clues: [
      C('1F', '生物實驗室', 'file_folder', '標著「第 7 艙」的/採樣紀錄'),
      C('1F', '居住艙 1', 'diary', '越寫越潦草的/值班日誌'),
      C('1F', '補給倉庫', 'tools', '被拆下來的/門禁晶片'),
      C('1F', '交誼艙', 'photo', '刮掉一張臉的/合照'),
    ],
  },
  {
    id: 'tavern',
    group: 'fantasy',
    also: ['lodging'],
    name: '冒險者酒館',
    description:
      '1F 是酒場（壁爐與告示板都在這裡）、廚房、倉庫、馬廄和後院，2F 是客房與老闆的房間；走廊盡頭暗門後的密室是 GM 專用。樓梯上下對齊。',
    build: tavern,
    clues: [
      C('1F', '酒場', 'memo', '從告示板撕下的/委託'),
      C('1F', '倉庫', 'papers', '藏寶圖的一角'),
      C('1F', '馬廄', 'key', '鞍袋裡的鑰匙'),
      C('2F', '客房 2', 'diary', '旅人的日記'),
    ],
  },
  {
    id: 'wizard-tower',
    group: 'fantasy',
    name: '魔法師之塔',
    description:
      '石造的三層塔：1F 門廳與書庫、2F 研究室與寢室、3F 觀星台；從裡面封上的召喚室是 GM 專用。螺旋梯三層對齊。',
    build: wizardTower,
    clues: [
      C('1F', '書庫', 'diary', '邊角燒焦的/魔法手稿'),
      C('1F', '門廳', 'key', '刻著符文的/鑰匙'),
      C('2F', '研究室', 'pills', '標著星座符號的/藥瓶'),
      C('3F', '觀星台', 'memo', '畫滿星圖的紙'),
    ],
  },
];

export const getTemplate = (id: string): FloorTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** 範本放在哪些分類（主要的分類在前） */
export const templateGroups = (t: FloorTemplate): readonly TemplateGroupId[] => [
  t.group,
  ...(t.also ?? []).filter((g) => g !== t.group),
];

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
