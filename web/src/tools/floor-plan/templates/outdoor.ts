/**
 * 野外・地下的範本（2026-10 第三批後半，本站自己畫的平面圖）：露營區、廢礦坑。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, mapRegions, type TplFloor } from './builder';

/* ---------- 露營區（營位、炊事場、管理中心、溪流；對岸的廢屋是 GM 專用） ---------- */

export function campsite(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('A 區營位', 'garden', 2, 2, 18, 16)
    .room('B 區營位', 'garden', 22, 2, 16, 16)
    .room('溪邊', 'gravel', 40, 0, 4, 44, { ly: -10 })
    .room('溪流', 'water', 44, 0, 6, 44, { ly: 6 })
    .room('對岸的林子', 'garden', 50, 0, 6, 44, { hideLabel: true })
    .room('廢屋', 'bedroom', 50, 4, 6, 8, {
      gm: true,
      wall: 'cracked',
      note: '溪的對岸、林子裡的小屋。管理員說那裡「沒有東西」，可是每天晚上都亮著燈。',
    })
    .room('管理中心', 'office', 2, 30, 12, 8)
    .room('炊事場', 'porch', 16, 30, 12, 8)
    .room('公廁・淋浴', 'wet', 30, 30, 8, 8)
    .room('停車場', 'dirt', 2, 38, 36, 6);
  fillYard(b, 0, 0, 40, 44, '森林');
  b.dh(6, 38, 2, -1, 0)
    .dh(10, 30, 1.5, 1, 0)
    .dh(33, 30, 1.5, -1, 0)
    .dv(50, 7, 1.5, -1, 0, 'broken')
    .wh(3, 30, 2)
    .wv(14, 33, 2)
    .wh(52, 4, 2, 'boarded')
    .wh(52, 12, 2, 'brokenwin');
  /* 營位：帳篷、營火、野餐桌 */
  b.item('tent', 4, 4)
    .item('tent', 10, 4)
    .item('tent', 4, 11)
    .item('campfire', 13, 12)
    .item('log', 12, 15, 0)
    .item('picnic', 15.4, 3.4)
    .item('tent', 24, 4)
    .item('tent', 32, 4)
    .item('tent', 26, 11)
    .item('campfire', 33, 12)
    .item('log', 32, 15, 0);
  /* 炊事場、管理中心、公廁 */
  b.item('sink', 16.4, 30.2, 0)
    .item('sink', 18.6, 30.2, 0)
    .item('counter', 21, 30.2, 0, { size: [4, 1.2] })
    .item('picnic', 18, 33.6)
    .item('reception', 2.3, 33, 270, { size: [4, 1.2] })
    .item('store_shelf', 8, 32.2, 0, { size: [3.6, 1.4] })
    .item('vending', 12.4, 35.6, 90, { size: [1.6, 1.2] })
    .item('toilet', 30.2, 36.2, 270)
    .item('toilet', 30.2, 34.2, 270)
    .item('shower', 35.8, 33.6, 90, { size: [1.8, 1.8] })
    .item('shower', 35.8, 35.8, 90, { size: [1.8, 1.8] })
    .item('washbasin', 36, 30.1, 0, { size: [1.4, 1] });
  /* 停車場、森林、溪流、廢屋 */
  b.item('car', 18, 38.6, 90, { size: [4, 8] })
    .item('suv', 28, 38.6, 90, { size: [4, 8] })
    .item('tree', 0.4, 20)
    .item('tree', 6, 20.4)
    .item('tree', 30, 20.4)
    .item('tree', 36.4, 24)
    .item('bush', 20.4, 24)
    .item('rock', 41, 30)
    .item('wood_bridge', 42, 20, 90, { size: [2.4, 8] })
    .item('rock', 52, 30)
    .item('tree', 52.4, 16)
    .item('debris', 51, 8.6, 0, { gm: true, size: [2, 1.6] })
    .item('altar', 52.6, 4.2, 0, { gm: true, size: [2.4, 1.2] })
    .item('candle', 51, 4.4, 0, { gm: true })
    .item('bones', 53.4, 9.4, 0, { gm: true });
  return [b.f];
}

/* ---------- 廢礦坑（1F 坑口的設施、B1 坑道；最深處是 GM 專用） ---------- */

/**
 * 坑道的字元圖：一個字元 1 m（2 × 2 格）。E＝升降口、T＝坑道、M＝主坑道、S＝休息所（木造的小屋，室內）、
 * R＝崩落區、C＝通道、D＝最深處（GM 專用；和通道之間手畫岩壁＋暗門）。
 */
const MINE_MAP = [
  '............EEEEE...',
  '............EEEEE...',
  '............EEEEE...',
  '.............TT.....',
  '.............TT.....',
  '....SSSSSMMMMMM.....',
  '....SSSSSMMMMMMMM...',
  '.........MMMMMMMMCC.',
  '.........MM.....CCC.',
  '........RRRR.....CC.',
  '.......RRRRRR....DD.',
  '.......RRRRRR...DDDD',
  '........RRRR....DDDD',
  '.................DD.',
];

const mineLift = (b: FloorBuilder) => b.item('elevator', 27, 0.5);

export function mine(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('坑口廣場', 'dirt', 0, 0, 40, 28, { lx: 6, ly: 6 })
    .room('事務所', 'office', 2, 2, 10, 8, { wall: 'cracked' })
    .room('工具間', 'storage', 2, 10, 10, 6, { wall: 'cracked' })
    .room('坑口', 'cave', 24, 0, 10, 10, { ly: 2.4 });
  mineLift(g);
  g.dh(5, 10, 1.5, 1, 0) // 事務所→工具間
    .dv(12, 4, 1.5, 1, 0, 'broken')
    .dv(12, 12, 1.5, 1, 0)
    .wh(4, 2, 2, 'boarded')
    .wv(2, 5, 2, 'brokenwin');
  g.item('rail_track', 27, 10, 0, { size: [4, 12] })
    .item('hand_cart', 28.3, 18)
    .item('desk', 2.2, 2.2)
    .item('chair', 2.9, 3.5, 180)
    .item('filing', 10.8, 2.2, 90)
    .item('tool_shelf', 2.1, 12.4, 270)
    .item('drum', 8.6, 14.4)
    .item('pallet', 15, 20)
    .item('drum', 34.4, 14)
    .item('drum', 35.8, 15.2)
    .item('lamp', 22.6, 9)
    .item('tree', 4, 22)
    .item('rock', 16, 1);

  const bm = new FloorBuilder('B1');
  const pass = { name: '通道', cat: 'cave', extra: { hideLabel: true } } as const;
  const rooms = mapRegions(
    bm,
    MINE_MAP,
    {
      E: { name: '升降口', cat: 'cave' },
      T: pass,
      M: { name: '主坑道', cat: 'cave' },
      S: { name: '休息所', cat: 'doma' },
      R: { name: '崩落區', cat: 'cave' },
      C: pass,
      D: { name: '最深處', cat: 'cave', extra: { gm: true } },
    },
    0,
    0,
    2,
  );
  rooms.D.note = '通道盡頭的岩壁是暗門。礦工們挖到的「礦脈」在這裡發光，岩壁上的鑿痕不是人類的工具留下的。';
  mineLift(bm);
  /* 休息所的門、通往最深處的岩壁與暗門 */
  bm.dv(18, 11, 2, 1, 0).wall(34, 20, 38, 20, 'rock').dh(35.25, 20, 1.5, 1, 0, 'secret');
  bm.item('rail_track', 26, 4, 0, { size: [4, 8] })
    .item('rail_track', 20, 12, 90, { size: [4, 12] })
    .item('hand_cart', 24, 12.6, 90)
    .item('lamp', 30.4, 12)
    .item('log', 22, 15)
    .item('table', 10.8, 11, 0, { size: [2.4, 1.4] })
    .item('bench', 10.6, 12.6, 0, { size: [2.8, 0.8] })
    .item('tool_shelf', 8.1, 11.6, 270, { size: [2, 0.8] })
    .item('lamp', 13.4, 9)
    .item('debris', 17, 20)
    .item('landslide', 19, 22)
    .item('rock', 16, 24, 0, { size: [1.6, 1.4] })
    .item('altar', 34.6, 25.4, 180, { gm: true, size: [2.6, 1.4] })
    .item('stele', 34.6, 22.4, 0, { gm: true })
    .item('bones', 33, 24.2, 0, { gm: true })
    .item('abyss', 37, 23.6, 0, { gm: true, size: [2.4, 2.4] });
  return [bm.f, g.f];
}
