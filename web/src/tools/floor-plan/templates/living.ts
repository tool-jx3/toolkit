/**
 * 住宅類的範本（2026-10 第三批後半，本站自己畫的平面圖）：老公寓、附地下室的獨棟、三合院、日式宿舍。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, Frame, fillYard, type TplFloor } from './builder';

/* ---------- 老公寓（一層兩戶的四樓公寓：1F、4F、頂樓） ---------- */

interface AptNames {
  master: string;
  bath: string;
  hall: string;
  second: string;
  living: string;
  dining: string;
  /** 陽台（1F 沒有） */
  balcony?: string;
}

/**
 * 一戶（寬 17 × 深 24，樓梯間在東邊）：北邊主臥室、浴室、臥室，中間的走道通到南邊的客廳與餐廳，
 * 大門在東牆（從樓梯間進來）。flip＝左右翻過來（樓梯間在西邊的那一戶）。
 */
function aptUnit(
  b: FloorBuilder,
  x0: number,
  flip: boolean,
  n: AptNames,
  opts: { gm?: boolean; washitsu?: boolean; locked?: boolean } = {},
): Frame {
  const u = new Frame(b, x0, 0, 17, 24, flip);
  const gm = opts.gm ? { gm: true } : {};
  u.room(n.master, 'bedroom', 0, 0, 7, 12, gm)
    .room(n.bath, 'wet', 7, 0, 3, 3, gm)
    .room(n.hall, 'hall', 7, 3, 3, 9, { hideLabel: true, ...gm })
    .room(n.second, opts.washitsu ? 'washitsu' : 'bedroom', 10, 0, 7, 12, gm)
    .room(n.living, 'living', 0, 12, 11, 12, gm)
    .room(n.dining, 'kitchen', 11, 12, 6, 12, gm);
  if (n.balcony) u.room(n.balcony, 'balcony', 0, 24, 11, 3, gm);
  u.dv(17, 19, 1.5, -1, 0, opts.locked ? 'locked' : 'door') // 大門（從樓梯間進來）
    .dh(7, 12, 3, 1, 0, 'open')
    .dv(11, 20, 3, 1, 0, 'open')
    .dv(7, 9, 1.5, -1, 0)
    .dv(10, 9, 1.5, 1, 0)
    .dh(7.75, 3, 1.5, 1, 0)
    .wh(1.5, 0, 3)
    .wh(12, 0, 3)
    .wv(0, 16, 3)
    .wh(12.5, 24, 3);
  if (n.balcony) u.dh(3, 24, 3, 1, 0, 'sliding2');
  else u.wh(3, 24, 3);
  /* 主臥室 */
  u.item('bed_double', 0.1, 5.5, 270)
    .item('nightstand', 0.1, 4.5, 270)
    .item('nightstand', 0.1, 8.4, 270)
    .item('wardrobe', 3.6, 0.1)
    .item('dresser', 1, 11, 180);
  /* 浴室：馬桶與淋浴間 */
  u.item('toilet', 7.1, 0.1).item('shower', 8.2, 0.1, 0, { size: [1.7, 1.7] });
  /* 臥室（1F 是和室） */
  if (opts.washitsu)
    u.item('futon', 14.8, 0.3)
      .item('zataku', 11.5, 4.5)
      .item('butsudan', 15.7, 6.6, 90)
      .item('cabinet', 12, 11, 180);
  else
    u.item('bed_single', 14.8, 0.2)
      .item('desk', 15.7, 6, 90)
      .item('chair', 14.6, 6.7, 90)
      .item('bookshelf', 12, 11.1, 180);
  /* 客廳、餐廳 */
  u.item('rug', 2, 15.4, 90)
    .item('sofa3', 0.1, 15.5, 270)
    .item('lowtable', 2.5, 16.6, 90)
    .item('tv', 10, 16, 90)
    .item('plant', 0.4, 22.4)
    .item('kitchen', 11.5, 12.1)
    .item('fridge', 15.5, 13.6, 90)
    .item('dining4', 12.4, 16.2);
  return u;
}

/** 樓梯間（三層同一個位置；折返樓梯在北邊） */
function aptStairs(b: FloorBuilder, h: number): void {
  b.room('樓梯間', 'hall', 17, 0, 6, h, { ly: h > 10 ? 3 : 0 });
  b.item('stairs_u', 17.5, 0.5, 0);
}

export function apartment(): TplFloor[] {
  const g = new FloorBuilder('1F');
  /* 西：自助洗衣店（北邊是後場）；東：房東家（和室） */
  g.room('洗衣店後場', 'storage', 0, 0, 17, 6)
    .room('自助洗衣店', 'public', 0, 6, 17, 18);
  aptStairs(g, 24);
  aptUnit(
    g,
    23,
    true,
    {
      master: '房東臥室',
      bath: '浴室',
      hall: '走道',
      second: '和室',
      living: '客廳',
      dining: '餐廳',
    },
    { washitsu: true },
  );
  g.room('騎樓', 'porch', 0, 24, 40, 4).room('巷子', 'road', 0, 28, 40, 5, { hideLabel: true });
  g.dh(19, 24, 2, -1, 0, 'gate') // 公寓的鐵門
    .dh(6, 24, 3, -1, 0, 'auto')
    .dh(13, 6, 1.5, -1, 0)
    .wh(1, 24, 3.5, 'window2')
    .wh(10.5, 24, 3.5, 'window2')
    .wv(0, 9, 3);
  /* 洗衣店：兩排洗衣機、烘衣機，等候的長椅與桌子 */
  g.row('washer', 0.4, 6.1, 7, 1.4, 0)
    .row('washer', 0.1, 9, 5, 0, 1.4, 270)
    .item('vending', 15.5, 8, 90)
    .item('table', 7, 13, 0, { size: [2.8, 1.4] })
    .item('chair', 7.4, 14.6, 180)
    .item('chair', 8.8, 14.6, 180)
    .item('bench', 2.4, 19.5, 0, { size: [3.6, 1] })
    .item('plant', 15.4, 21.8);
  g.item('tool_shelf', 0.3, 0.1)
    .item('dist_board', 5, 0.1)
    .item('cardboard', 8, 0.4)
    .item('cardboard', 9.4, 0.4)
    .item('drum', 15.4, 0.4);
  g.item('locker', 17.1, 8, 270, { label: '信箱' }).item('plant', 0.4, 25.4);

  const u = new FloorBuilder('4F');
  aptStairs(u, 24);
  aptUnit(u, 0, false, {
    master: 'A 主臥室',
    bath: 'A 浴室',
    hall: 'A 走道',
    second: 'A 臥室',
    living: 'A 客廳',
    dining: 'A 餐廳',
    balcony: 'A 陽台',
  });
  aptUnit(
    u,
    23,
    true,
    {
      master: 'B 主臥室',
      bath: 'B 浴室',
      hall: 'B 走道',
      second: 'B 臥室',
      living: 'B 客廳',
      dining: 'B 餐廳',
      balcony: 'B 陽台',
    },
    { gm: true, locked: true },
  );
  u.find('B 客廳').note = '房東說這一戶「暫時不租」。門縫底下塞滿了沒拆的信，屋裡的鐘全停在同一個時刻。';
  u.item('plant', 17.4, 21.6).item('plant', 21.4, 21.6);

  const r = new FloorBuilder('頂樓');
  r.room('頂樓', 'rooftop', 0, 0, 40, 24, { ly: 4 })
    .room('樓梯間', 'hall', 17, 0, 6, 7)
    .room('頂樓加蓋', 'bedroom', 26, 0, 14, 12, { wall: 'thin' });
  r.item('stairs_u', 17.5, 0.5, 0);
  r.dh(19.25, 7, 1.5, 1, 0, 'steel').dv(26, 8.5, 1.5, 1, 0).wh(29, 12, 3).wh(35, 12, 3);
  r.item('water_tower', 2, 2)
    .item('antenna', 9, 1)
    .item('vent_unit', 12, 15)
    .item('ac_unit', 30, 12.2, 180)
    .item('ac_unit', 36.5, 12.2, 180)
    .row('plant', 2, 22.4, 6, 3, 0)
    .item('bed_single', 37.8, 0.2)
    .item('desk', 26.2, 0.2)
    .item('chair', 26.9, 1.5, 180)
    .item('cardboard', 32, 0.3)
    .item('cardboard', 33.4, 0.3)
    .item('bookshelf', 38.9, 6, 90)
    .item('tv', 30, 10.9, 180);
  r.find('頂樓加蓋').note = '房東的兒子以前住這裡。牆上的月曆停在他搬走的那個月。';
  return [g.f, u.f, r.f];
}

/* ---------- 附地下室的獨棟（B1、1F、2F，四周是庭院） ---------- */

/** 每層同一個位置的樓梯（走廊東半邊） */
const houseStairs = (b: FloorBuilder) => b.item('stairs', 15.9, 9.5, 0);

export function house(): TplFloor[] {
  const g = new FloorBuilder('1F');
  /* 房子 x 4～28、y 4～24；西邊的緣側、東邊的車庫，前面是小徑與車道，其他是庭院 */
  g.room('和室', 'washitsu', 4, 4, 10, 8)
    .room('緣側', 'engawa', 2, 4, 2, 8, { hideLabel: true })
    .room('走廊', 'hall', 14, 4, 4, 14, { hideLabel: true })
    .room('浴室', 'wet', 18, 4, 5, 8)
    .room('廚房', 'kitchen', 23, 4, 5, 8)
    .room('客廳', 'living', 4, 12, 10, 12)
    .room('玄關', 'hall', 14, 18, 4, 6)
    .room('餐廳', 'kitchen', 18, 12, 10, 12)
    .room('車庫', 'garage', 28, 12, 8, 12)
    .room('小徑', 'porch', 14, 24, 4, 8, { hideLabel: true })
    .room('車道', 'porch', 28, 24, 8, 8);
  fillYard(g, 0, 0, 40, 32, '庭院');
  g.find('庭院').hideLabel = false;
  houseStairs(g);
  g.dh(15.25, 24, 1.5, -1, 0) // 大門
    .dh(14.5, 18, 3, 1, 0, 'open')
    .dv(14, 6, 1.5, -1, 0, 'sliding')
    .dv(4, 6.5, 3, -1, 0, 'sliding2')
    .wv(2, 4.25, 3.5, 'window2')
    .wv(2, 8, 3.5, 'window2')
    .dv(14, 13.5, 3, -1, 0, 'sliding2')
    .dv(18, 5, 1.5, 1, 0)
    .dv(18, 15.5, 2, 1, 0, 'open')
    .dh(24, 12, 3, -1, 0, 'open')
    .dv(28, 20, 1.5, 1, 0)
    .dh(29, 24, 6, -1, 0, 'shutter')
    .dh(6, 24, 3, 1, 0, 'sliding2')
    .wh(5, 4, 2)
    .wh(19.5, 4, 1.5)
    .wv(28, 6, 2)
    .wv(4, 20.5, 2.5)
    .wh(22, 24, 3)
    .wv(36, 16, 3);
  /* 和室、客廳 */
  g.item('tokonoma', 8.6, 4.1)
    .item('zataku', 8, 8)
    .item('zabuton', 8.9, 6.7)
    .item('zabuton', 8.9, 10.1)
    .item('bookshelf', 5, 12.1)
    .item('rug', 6.6, 15, 90)
    .item('sofa3', 4.1, 15, 270)
    .item('lowtable', 6.6, 16.1, 90)
    .item('tv', 13, 18.4, 90)
    .item('plant', 11.6, 22.4);
  /* 玄關、浴室、廚房、餐廳 */
  g.item('cabinet', 16.9, 19.4, 90)
    .item('bathtub', 21.3, 4.1)
    .item('toilet', 18.1, 8, 270)
    .item('washbasin', 19.5, 10.8, 180)
    .item('washer', 21.6, 10.6)
    .item('kitchen', 23, 4.1)
    .item('fridge', 26.5, 7.6, 90)
    .item('dining6', 21, 16)
    .item('cupboard', 19, 23, 180);
  /* 車庫、庭院 */
  g.item('car', 30, 13.4)
    .item('tool_shelf', 35, 13, 90)
    .item('tree', 0.5, 25.5)
    .item('tree', 36.5, 0.5)
    .item('bush', 6, 27)
    .item('bush', 9, 27.4)
    .item('garden_bench', 6, 0.5)
    .item('shed', 36, 27);

  const u = new FloorBuilder('2F');
  u.room('書房', 'office', 4, 4, 10, 8)
    .room('走廊', 'hall', 14, 4, 4, 20, { hideLabel: true })
    .room('浴室', 'wet', 18, 4, 5, 8)
    .room('儲藏室', 'storage', 23, 4, 5, 8)
    .room('主臥室', 'bedroom', 4, 12, 10, 12)
    .room('兒童房', 'bedroom', 18, 12, 10, 12)
    .room('陽台', 'balcony', 4, 24, 10, 3);
  houseStairs(u);
  u.dv(14, 6, 1.5, -1, 0)
    .dv(14, 14, 1.5, -1, 0)
    .dv(18, 5, 1.5, 1, 0)
    .dv(18, 16, 1.5, 1, 0)
    .dh(24.5, 12, 1.5, -1, 0)
    .dh(6, 24, 3, 1, 0, 'sliding2')
    .wh(6, 4, 3)
    .wv(4, 7, 2)
    .wh(19.5, 4, 1.5)
    .wv(28, 6, 2)
    .wv(4, 17, 3)
    .wv(28, 16, 3)
    .wh(22, 24, 3)
    .wh(15.25, 24, 1.5);
  u.item('desk', 4.1, 4.4, 270)
    .item('chair', 5.4, 5.1, 90)
    .item('bookshelf', 10.6, 4.1)
    .item('bookshelf', 13, 8.6, 90)
    .item('bed_double', 4.1, 15.6, 270)
    .item('nightstand', 4.1, 14.6, 270)
    .item('wardrobe', 7.5, 12.1)
    .item('dresser', 10.8, 12.1)
    .item('bathtub', 21.3, 4.1)
    .item('toilet', 18.1, 8, 270)
    .item('washbasin', 19.5, 10.8, 180)
    .item('crate', 24, 4.4)
    .item('crate', 25.8, 4.4)
    .item('cardboard', 26.5, 7)
    .item('bed_single', 25.9, 16)
    .item('desk', 26.7, 20.6, 90)
    .item('rug', 20, 18.6)
    .item('cabinet', 19, 23, 180)
    .item('plant', 4.4, 25.4);
  u.find('儲藏室').note = '紙箱裡是前屋主孩子的玩具，每一個的眼睛都被塗黑了。';

  const bm = new FloorBuilder('B1');
  bm.room('地下儲藏室', 'storage', 4, 4, 10, 14)
    .room('樓梯下', 'hall', 14, 4, 4, 14, { hideLabel: true })
    .room('機房', 'garage', 18, 4, 10, 8)
    .room('密室', 'special', 18, 12, 10, 6, {
      gm: true,
      note: '樓梯下的牆是暗門。前屋主在這裡「養」著什麼，牆上全是指甲刮過的痕跡。',
    });
  houseStairs(bm);
  bm.dv(14, 5, 1.5, -1, 0)
    .dv(18, 5, 1.5, 1, 0)
    .dv(18, 15.5, 1.5, 1, 0, 'secret');
  bm.item('tool_shelf', 4.1, 6.6, 270)
    .item('tool_shelf', 4.1, 10, 270)
    .item('cardboard', 7, 4.4)
    .item('cardboard', 8.4, 4.4)
    .item('big_crate', 9, 14.4)
    .item('drum', 5, 16)
    .item('boiler', 24.6, 4.1)
    .item('pump', 19.5, 9.8, 180)
    .item('dist_board', 27.3, 8.6, 90)
    .item('chains', 24.8, 12.1, 0, { gm: true })
    .item('cage', 24.4, 14.6, 0, { gm: true, size: [3, 3.2] })
    .item('wall_claws', 20, 11.6, 0, { gm: true })
    .item('black_stain', 20.5, 14.6, 0, { gm: true, size: [2.6, 2] });
  return [bm.f, g.f, u.f];
}

/* ---------- 三合院（台灣的農家：正身、左右護龍、禾埕） ---------- */

export function sanheyuan(): TplFloor[] {
  const b = new FloorBuilder('1F');
  /* 正身（北）：書房、大房、公媽廳（後面是 GM 專用的暗間）、二房、穀倉；左右護龍；中間的禾埕 */
  b.room('竹林', 'garden', 0, 0, 56, 4, { ly: -0.4 })
    .room('書房', 'office', 12, 4, 6, 10)
    .room('大房', 'bedroom', 18, 4, 7, 10)
    .room('暗間', 'special', 25, 4, 6, 3, {
      gm: true,
      note: '大房衣櫥後面的暗門。供奉的不是祖先，是被藏起來的「另一位」。',
    })
    .room('公媽廳', 'special', 25, 7, 6, 7)
    .room('二房', 'bedroom', 31, 4, 7, 10)
    .room('穀倉', 'storage', 38, 4, 6, 10)
    .room('三房', 'bedroom', 4, 4, 8, 10)
    .room('灶腳', 'kitchen', 4, 14, 8, 10)
    .room('柴房', 'storage', 4, 24, 8, 10)
    .room('四房', 'bedroom', 44, 4, 8, 10)
    .room('浴間', 'wet', 44, 14, 8, 6)
    .room('農具間', 'garage', 44, 20, 8, 14)
    .room('禾埕', 'dirt', 12, 14, 32, 20)
    .room('菜園', 'field', 4, 38, 20, 6)
    .room('水塘', 'water', 36, 38, 10, 5);
  fillYard(b, 0, 4, 56, 46, '庭院');
  /* 正身的門（面向禾埕）與房間之間的門 */
  b.dh(26.5, 14, 3, -1, 0, 'door2')
    .dh(14, 14, 1.5, -1, 0)
    .dh(21, 14, 1.5, -1, 1)
    .dh(33, 14, 1.5, -1, 0)
    .dh(40, 14, 1.5, -1, 1, 'sliding')
    .dv(25, 4.75, 1.5, 1, 0, 'secret')
    .dv(12, 6, 1.5, -1, 0)
    .dv(44, 6, 1.5, 1, 0)
    /* 護龍 */
    .dv(12, 17, 1.5, -1, 0)
    .dv(12, 28, 2, -1, 0, 'open')
    .dv(44, 16, 1.5, 1, 1)
    .dv(44, 25, 3, 1, 0, 'sliding2')
    .dv(4, 18, 1.5, -1, 0) // 灶腳的後門
    /* 窗 */
    .wh(14, 4, 2)
    .wh(20, 4, 2.5)
    .wh(33.5, 4, 2.5)
    .wh(6.5, 4, 3)
    .wh(46.5, 4, 3)
    .wh(16, 14, 1.5)
    .wh(23, 14, 1.5)
    .wh(35.5, 14, 1.5)
    .wv(4, 8, 2)
    .wv(52, 8, 2)
    .wv(12, 20, 2)
    .wv(44, 30, 2)
    .wv(4, 29, 2);
  /* 公媽廳：神桌、神主牌、供桌 */
  b.item('altar', 25.5, 7.1, 0, { size: [5, 1.6] })
    .item('idol', 27.55, 7.45)
    .item('candle', 26, 7.5)
    .item('candle', 29.2, 7.5)
    .item('table', 26.5, 9.4, 0, { size: [3, 1.2] })
    .item('lantern', 25.2, 11.6)
    .item('lantern', 29.6, 11.6)
    .item('offering', 27.3, 10.8, 0, { gm: false });
  /* 大房、二房、三房、四房、書房 */
  b.item('bed_canopy', 18.2, 4.2, 0, { size: [3, 4] })
    .item('wardrobe', 23.9, 7.6, 90, { size: [3, 1] })
    .item('chest', 18.4, 12.6, 180)
    .item('bed_single', 35.8, 4.2)
    .item('cabinet', 31.2, 7, 270)
    .item('bed_single', 4.3, 4.2)
    .item('desk', 9.4, 4.2)
    .item('bed_single', 49.8, 4.2)
    .item('wardrobe', 51, 7, 90, { size: [3, 1] })
    .item('desk', 12.2, 4.2)
    .item('bookshelf', 14.8, 4.1)
    .item('chair', 13, 5.5, 180);
  /* 灶腳、柴房、浴間、農具間、穀倉 */
  b.item('kamado', 4.1, 20.3, 270, { size: [3, 1.4] })
    .item('cupboard', 4.1, 14.4, 270)
    .item('table', 7.2, 22.2, 0, { size: [2.8, 1.4] })
    .item('barrel', 10.4, 14.4)
    .item('log', 4.4, 31.6)
    .item('log', 4.4, 32.6)
    .item('hay', 9.2, 31.8)
    .item('bathtub', 47, 14.2, 90)
    .item('washbasin', 50.8, 18.8, 180, { size: [1.2, 1] })
    .item('hand_cart', 49.5, 21)
    .item('tool_shelf', 51, 27, 90)
    .item('hay', 48.4, 31.6)
    .row('barrel', 38.4, 4.4, 4, 1.4, 0)
    .item('pallet_stack', 41.4, 8.6);
  /* 禾埕、菜園、水塘、竹林 */
  b.item('well', 16, 28)
    .item('table_round', 37, 26)
    .item('chair', 36, 24.6)
    .item('chair', 38.6, 24.6)
    .row('bamboo', 1, 0.5, 6, 9, 0)
    .item('tree', 52.5, 40)
    .item('tree', 0.5, 40)
    .item('bush', 26, 39)
    .item('stone_bridge', 41, 36.2, 90, { size: [1.6, 3] });
  return [b.f];
}

/* ---------- 日式宿舍（日本時代留下來的木造宿舍，庭院裡有防空壕） ---------- */

export function japaneseHouse(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('廚房', 'kitchen', 6, 6, 7, 6)
    .room('浴室', 'wet', 13, 6, 4, 6)
    .room('廁所', 'wet', 17, 6, 2, 6)
    .room('書房', 'washitsu', 19, 6, 6, 6)
    .room('女傭房', 'washitsu', 25, 6, 5, 6)
    .room('走廊', 'hall', 6, 12, 24, 2, { hideLabel: true })
    .room('座敷', 'washitsu', 6, 14, 8, 8)
    .room('次間', 'washitsu', 14, 14, 6, 8)
    .room('玄關', 'doma', 20, 14, 4, 8, { ly: 1.5 })
    .room('洋式客廳', 'living', 24, 14, 6, 8)
    .room('緣側', 'engawa', 6, 22, 14, 2, { hideLabel: true });
  fillYard(g, 0, 0, 40, 34, '庭院');
  g.find('庭院').hideLabel = false;
  g.dh(21.25, 22, 1.5, -1, 0, 'sliding') // 玄關的拉門
    .dh(20.5, 14, 3, -1, 0, 'open')
    .dh(8, 12, 1.5, 1, 0, 'sliding')
    .dh(14, 12, 1.5, 1, 0, 'sliding')
    .dh(17.25, 12, 1.5, 1, 0)
    .dh(21, 12, 1.5, 1, 0, 'sliding')
    .dh(26.5, 12, 1.5, 1, 0, 'sliding')
    .dh(9, 14, 3, -1, 0, 'sliding2')
    .dh(15.5, 14, 1.5, -1, 0, 'sliding')
    .dv(14, 17, 3, 1, 0, 'sliding2')
    .dv(24, 18.5, 1.5, 1, 0)
    .dh(8, 22, 3, 1, 0, 'sliding2')
    .dh(15, 22, 3, 1, 0, 'sliding2')
    .dv(6, 7, 1.5, -1, 0) // 廚房的後門
    /* 緣側面向庭院的玻璃拉窗 */
    .wh(6.5, 24, 3.5, 'window2')
    .wh(10.5, 24, 3.5, 'window2')
    .wh(15, 24, 3.5, 'window2')
    .wv(20, 22.25, 1.5)
    .wh(8.5, 6, 2)
    .wh(14, 6, 2)
    .wh(21, 6, 2.5)
    .wh(26.5, 6, 2)
    .wv(30, 16, 2.5)
    .wh(26, 22, 2.5)
    .wv(6, 16, 2.5);
  /* 廚房、浴室、廁所 */
  g.item('kamado', 9.5, 6.1, 0, { size: [3, 1.3] })
    .item('sink', 6.1, 9.4, 270)
    .item('cupboard', 12, 7.8, 90, { size: [2.4, 0.9] })
    .item('bathtub', 13.2, 6.1, 0, { size: [1.6, 2.6] })
    .item('washbasin', 15.6, 9.6, 90, { size: [1.2, 1] })
    .item('toilet', 17.5, 6.1);
  /* 書房、女傭房 */
  g.item('desk', 19.1, 6.2, 270)
    .item('bookshelf', 24.1, 8.5, 90)
    .item('katanakake', 19.1, 9.2, 270)
    .item('futon', 27.8, 6.2)
    .item('cabinet', 25.1, 6.1, 0, { size: [2.2, 0.8] });
  /* 座敷、次間、玄關、洋式客廳 */
  g.item('tokonoma', 6.1, 17.2, 270)
    .item('zataku', 9, 17)
    .item('zabuton', 9.9, 15.6)
    .item('zabuton', 9.9, 19.2)
    .item('butsudan', 18.7, 19, 90)
    .item('cabinet', 21, 16.5, 270, { size: [2, 0.7] })
    .item('armchair', 26.4, 15.4)
    .item('armchair', 26.4, 19.4, 180)
    .item('table_round', 26.2, 17.3, 0, { size: [1.8, 1.8] })
    .item('gramophone', 28.4, 14.4);
  /* 庭院：松樹、石燈籠、池子；角落的防空壕入口 */
  g.item('pine', 1, 1)
    .item('lantern', 9, 28)
    .item('pond', 12, 26, 0, { size: [7, 5] })
    .item('garden_rock', 20, 27)
    .item('bamboo', 35, 1)
    .item('trapdoor', 33, 26);
  g.find('座敷').note = '床之間的掛軸背面寫著一串人名，最後一個名字是新的墨。';

  const bm = new FloorBuilder('B1');
  bm.room('防空壕', 'doma', 30, 24, 8, 8, {
    gm: true,
    note: '庭院角落的木板下面。戰後就封起來了，可是裡面的油燈還有油。',
  });
  bm.item('trapdoor', 33, 26)
    .item('crate', 30.4, 30)
    .item('bench', 31, 24.2, 0, { size: [3.4, 0.9], gm: true })
    .item('lamp', 36.8, 24.4, 0, { gm: true })
    .item('bones', 35.6, 29.4, 0, { gm: true });
  return [bm.f, g.f];
}
