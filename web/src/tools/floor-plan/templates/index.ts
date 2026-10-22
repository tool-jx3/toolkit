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
import { apartment, house, japaneseHouse, sanheyuan } from './living';
import { diner, ryokan, speakeasy } from './lodging';
import { asylum, hospitalAnnex, lab } from './research';
import { clubBuilding, funeralHome, museum } from './civic';
import { detective, konbini, nightMarket, office, shoppingStreet } from './commerce';
import { karaoke, theatre } from './leisure';
import { ferry, parking, station, subway } from './transport';
import { construction, factory, sewer, warehouse } from './industry';
import { militaryBase, prison } from './military';
import { library, police, school, temple } from './public';
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
    also: ['lodging', 'wild'],
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
    id: 'apartment',
    group: 'home',
    name: '老公寓（四樓）',
    description:
      '一層兩戶的四樓公寓：1F 自助洗衣店與房東家，4F 兩戶（B 戶鎖著、GM 專用），頂樓有水塔與加蓋的房間；樓梯間上下對齊。',
    build: apartment,
    clues: [
      C('1F', '自助洗衣店', 'memo', '貼在洗衣機上的尋人啟事'),
      C('1F', '餐廳', 'photo', '前任房客的合照'),
      C('4F', 'A 臥室', 'diary', '記錄半夜敲牆聲的筆記'),
      C('頂樓', '頂樓加蓋', 'key', '掛著「4B」名牌的鑰匙'),
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
      C('1F', '客廳', 'photo', '被換過臉的全家福'),
      C('1F', '和室', 'memo', '貼在壁龕裡的符紙'),
      C('2F', '兒童房', 'diary', '畫滿「地下的朋友」的圖畫日記'),
      C('B1', '地下儲藏室', 'key', '沒有對應的門的鑰匙'),
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
      C('1F', '公媽廳', 'memo', '多出一個名字的族譜'),
      C('1F', '灶腳', 'knife', '刀柄刻著符號的菜刀'),
      C('1F', '大房', 'diary', '阿嬤用日文寫的日記'),
      C('1F', '禾埕', 'photo', '曬穀場上的老照片'),
      C('1F', '四房', 'key', '古早的銅鎖鑰匙'),
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
      C('1F', '書房', 'diary', '昭和年間的值勤日誌'),
      C('1F', '座敷', 'photo', '穿軍服的男人的照片'),
      C('1F', '廚房', 'key', '刻著片假名的鑰匙'),
      C('1F', '洋式客廳', 'memo', '夾在唱片封套裡的信'),
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
      C('1F', '櫃台後方', 'memo', '被撕下的住宿登記'),
      C('1F', '會議室', 'photo', '有一張臉被劃掉的合照'),
      C('2F', '205 號房', 'phone', '沒電的手機'),
      C('2F', '208 號房', 'key', '別間房的房卡'),
    ],
  },
  {
    id: 'ryokan',
    group: 'lodging',
    name: '溫泉旅館',
    description:
      '1F 大廳・櫃台、宴會廳、男女大浴場與露天風呂，2F 和室客房；走廊盡頭的「櫻之間」不開放（GM 專用）。樓梯上下對齊。',
    build: ryokan,
    clues: [
      C('1F', '大廳・櫃台', 'diary', '住宿名簿上被塗掉的名字'),
      C('1F', '宴會廳', 'photo', '少了一個人的宴會合照'),
      C('1F', '女湯', 'key', '浴池底撿到的舊鑰匙'),
      C('2F', '松之間', 'memo', '塞在掛軸後面的紙條'),
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
      C('1F', '理髮店', 'memo', '寫著敲門暗號的紙條'),
      C('B1', '酒館', 'photo', '鋼琴上的團體照'),
      C('B1', '老闆辦公室', 'diary', '記著「到貨」日期的帳本'),
      C('B1', '酒窖', 'key', '酒桶上的保險箱鑰匙'),
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
      C('1F', '用餐區', 'memo', '寫在餐巾紙上的求救'),
      C('1F', '店長室', 'photo', '店長和卡車司機的合照'),
      C('1F', '廁所', 'phone', '泡在水箱裡的手機'),
      C('1F', '倉庫', 'key', '冷凍庫的備用鑰匙'),
    ],
  },
  {
    id: 'hospital',
    group: 'medical',
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
    id: 'hospital-annex',
    group: 'medical',
    name: '醫院別館（隔離病棟）',
    description:
      '本館後面的兩層別館：1F 護理站、診察室、病歷室、舊手術室與遺體安置室，2F 隔離病房與觀察室；焊死的特別病房是 GM 專用。',
    build: hospitalAnnex,
    clues: [
      C('1F', '護理站', 'diary', '交班簿的最後一頁'),
      C('1F', '病歷室', 'file_folder', '被抽走一半的病歷'),
      C('2F', '隔離病房 3', 'recorder', '病人錄下的自言自語'),
      C('2F', '觀察室', 'photo', '監視器畫面的列印'),
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
      C('1F', '辦公室', 'file_folder', '「第二研究棟」的預算書'),
      C('B1', '主任室', 'diary', '主任的研究日誌'),
      C('B1', '實驗室', 'pills', '只標著代號的試劑'),
      C('B1', '低溫保存室', 'key', '寫著「B2」的鑰匙卡'),
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
      C('1F', '院長室', 'diary', '院長的治療紀錄'),
      C('1F', '交誼廳', 'memo', '病人們畫的同一張臉'),
      C('1F', '病房 2', 'memo', '刻在床板下的字'),
      C('B1', '舊病歷庫', 'file_folder', '沒有出院紀錄的病歷'),
      C('B1', '水療室', 'key', '生鏽的束縛帶鑰匙'),
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
    id: 'club-building',
    group: 'public',
    also: ['leisure'],
    name: '大學社團大樓',
    description:
      '中走廊兩側排滿社辦的兩層樓：攝影社（暗房）、吉他社、推理研究社、神祕學研究會、電影社…；2F 鎖著的廢社社辦是 GM 專用。',
    build: clubBuilding,
    clues: [
      C('1F', '攝影社', 'photo', '多拍到一個人的社員合照'),
      C('1F', '推理研究社', 'memo', '社團日誌上空白的那一週'),
      C('2F', '神祕學研究會', 'diary', '社員輪流寫的觀察筆記'),
      C('2F', '社團聯合辦公室', 'key', '廢社社辦的鑰匙'),
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
      C('1F', '常設展示室', 'photo', '說明牌底下的舊照片'),
      C('1F', '特展室', 'memo', '少了一件展品的清單'),
      C('1F', '館長室', 'diary', '館長的出差紀錄'),
      C('B1', '收藏庫', 'key', '沒有編號的收藏櫃鑰匙'),
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
      C('1F', '告別式場', 'photo', '遺照上多出來的人影'),
      C('1F', '家屬休息室', 'memo', '寫給死者的信'),
      C('1F', '辦公室', 'diary', '排班表上不存在的同事'),
      C('1F', '大廳・接待', 'papers', '簽到簿上陌生的簽名'),
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
      C('1F', '大廳', 'papers', '訪客登記表上的假名'),
      C('8F', '開放辦公區', 'laptop', '還沒登出的同事的電腦'),
      C('8F', '社長室', 'diary', '社長的行事曆'),
      C('8F', '會議室', 'memo', '白板上沒擦乾淨的字'),
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
      C('1F', '賣場', 'memo', '收銀台旁的交班筆記'),
      C('1F', '廁所', 'phone', '鏡子後面的手機'),
      C('1F', '停車場', 'key', '掉在車輪旁的機車鑰匙'),
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
      C('2F', '接待室', 'memo', '委託人留下的地址'),
      C('2F', '所長室', 'diary', '所長沒寫完的調查筆記'),
      C('2F', '資料室', 'file_folder', '標著「未結」的檔案'),
      C('1F', '當舖', 'photo', '夾在當票裡的照片'),
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
      C('1F', '中藥行', 'pills', '寫著奇怪藥名的藥包'),
      C('1F', '照相館', 'photo', '一直沒人來領的照片'),
      C('1F', '舊書店', 'diary', '夾在舊書裡的日記'),
      C('1F', '鐘錶行', 'key', '藏在鐘裡的鑰匙'),
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
      C('1F', '算命攤', 'memo', '算命師塞給你的紙條'),
      C('1F', '射氣球攤', 'idol', '獎品架上的舊娃娃'),
      C('1F', '蚵仔煎攤', 'phone', '一直響的失物手機'),
      C('1F', '土地公廟', 'key', '供桌下的鐵皮鑰匙'),
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
      C('1F', '化妝室 2', 'photo', '鏡子上貼的舊公演照片'),
      C('1F', '道具間', 'knife', '刀刃是真的的道具刀'),
      C('1F', '觀眾席', 'memo', '固定座位上的留言'),
      C('B1', '奈落', 'diary', '舞台監督的日誌'),
    ],
  },
  {
    id: 'karaoke',
    group: 'leisure',
    name: 'KTV',
    description:
      '櫃台大廳、廚房與員工室，走廊兩側是隔音的包廂；最裡面上鎖的 VIP 包廂是 GM 專用。',
    build: karaoke,
    clues: [
      C('1F', '櫃台大廳', 'papers', '包廂的登記表'),
      C('1F', '包廂 3', 'phone', '卡在沙發縫裡的手機'),
      C('1F', '包廂 6', 'memo', '點歌單上沒聽過的歌名'),
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
      C('1F', '候車室', 'memo', '時刻表上手寫的班次'),
      C('1F', '站長室', 'diary', '站長的值勤日誌'),
      C('1F', '遺失物保管室', 'bag', '十年前的遺失物'),
      C('B1', '地下道', 'photo', '貼在牆上的尋人海報'),
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
      C('1F', '1 號出入口', 'papers', '被撕掉一角的路線圖'),
      C('B1', '大廳', 'memo', '貼在售票機上的警告'),
      C('B1', '置物櫃區', 'key', '置物櫃的鑰匙'),
      C('B2', '島式月台', 'photo', '監視器拍到的末班車'),
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
      C('1F', '管理亭', 'diary', '管理員的巡邏紀錄'),
      C('B1', '停車區 B1', 'phone', '掉在車底的手機'),
      C('B2', '停車區 B2', 'key', '找不到車的車鑰匙'),
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
      C('1F', '客艙大廳', 'memo', '塞在座位背面的紙條'),
      C('1F', '小賣部', 'photo', '收銀機旁的舊照片'),
      C('2F', '駕駛艙', 'diary', '航海日誌的最後一頁'),
      C('B1', '貨艙', 'key', '沒登記的貨櫃鑰匙'),
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
      C('1F', '廠房', 'memo', '夾在輸送帶上的紙條'),
      C('1F', '品管室', 'file_folder', '數字被改過的檢驗報告'),
      C('1F', '更衣室', 'key', '沒有名牌的置物櫃鑰匙'),
      C('2F', '廠長室', 'diary', '廠長的工作日誌'),
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
      C('1F', '倉庫辦公室', 'papers', '對不上數字的出貨單'),
      C('1F', '倉庫 A', 'photo', '貼在木箱上的照片'),
      C('1F', '倉庫 B', 'memo', '用外文寫的收件人'),
      C('1F', '碼頭', 'key', '掉在繫船柱旁的鑰匙'),
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
      C('1F', '工務所', 'diary', '工地主任的施工日誌'),
      C('1F', '一樓樓板', 'photo', '挖出來的東西的照片'),
      C('2F', '二樓樓板', 'memo', '寫在鋼筋上的記號'),
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
      C('1F', '街道', 'memo', '人孔蓋旁的粉筆記號'),
      C('B1', '泵站', 'diary', '維修員的巡查表'),
      C('B1', '北側步道', 'photo', '泡過水的照片'),
      C('B1', '南側步道', 'bag', '卡在格柵上的背包'),
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
      C('1F', '證物室', 'memo', '登記簿被撕掉的一頁'),
      C('1F', '偵訊室', 'photo', '嫌犯的不在場證明照片'),
      C('1F', '留置室 2', 'clue', '牆上刻的記號'),
      C('1F', '辦公室', 'diary', '刑警的辦案筆記'),
      C('1F', '所長室', 'key', '證物室的備用鑰匙'),
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
      C('1F', '營舍', 'diary', '寫到一半的家書'),
      C('1F', '作戰室', 'papers', '畫著紅圈的地圖'),
      C('1F', '衛哨', 'memo', '進出登記簿的最後一行'),
      C('B1', '機密檔案室', 'recorder', '最後一段無線電錄音'),
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
      C('1F', '舍房 3', 'memo', '刻在床板下的日期'),
      C('1F', '會客室', 'photo', '會客時遞進來的照片'),
      C('1F', '醫務室', 'pills', '沒有處方的藥'),
      C('1F', '運動場', 'key', '埋在沙坑裡的鑰匙'),
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
    also: ['ruins'],
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
    also: ['medical'],
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
    also: ['home'],
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
    also: ['home'],
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
