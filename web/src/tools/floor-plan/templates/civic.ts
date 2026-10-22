/**
 * 公共場所的範本（2026-10 第三批後半，本站自己畫的平面圖）：大學社團大樓、博物館、殯儀館。
 * 北邊在上；1 格 = 0.5 m。
 */

import type { RoomCategory } from '../model/types';
import { FloorBuilder, Frame, type RoomExtra, type TplFloor } from './builder';

/* ---------- 大學社團大樓（中走廊兩側的社辦，1F、2F） ---------- */

/**
 * 社辦（寬 w）：北側一排深 7、南側一排深 8，門在走廊那一側（往房間裡開，鉸鍊在東邊）。
 * fill 用局部座標放家具：局部的 y＝0 是最裡面的牆（南側的房間上下翻過來）。
 */
function clubRoom(
  b: FloorBuilder,
  name: string,
  cat: RoomCategory,
  x: number,
  w: number,
  south: boolean,
  fill: (f: Frame, w: number, d: number) => void,
  extra?: RoomExtra & { door?: 'door' | 'locked' },
): void {
  const d = south ? 8 : 7;
  const f = new Frame(b, x, south ? 10 : 0, w, d, false, south);
  const { door = 'door', ...rest } = extra ?? {};
  f.room(name, cat, 0, 0, w, d, rest).dh(w - 2.5, d, 1.5, -1, 1, door);
  fill(f, w, d);
}

/** 一般的社辦：西牆的置物櫃、中間的長桌與椅子 */
const meetingTable = (f: Frame, w: number) => {
  const tx = Math.max(1.4, w / 2 - 1.8);
  f.item('locker', 0.1, 0.6, 270)
    .item('table', tx, 2.4, 0, { size: [3.6, 1.6] })
    .item('chair', tx + 0.3, 1.3)
    .item('chair', tx + 2.3, 1.3)
    .item('chair', tx + 0.3, 4.1, 180)
    .item('chair', tx + 2.3, 4.1, 180);
};

const clubStairs = (b: FloorBuilder) => b.item('stairs', 1.5, 0.6);

export function clubBuilding(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('樓梯間', 'hall', 0, 0, 5, 7, { hideLabel: true })
    .room('走廊', 'hall', 0, 7, 40, 3, { hideLabel: true })
    .room('玄關', 'hall', 12, 10, 4, 8, { ly: 1 })
    .room('中庭', 'porch', 0, 18, 40, 5);
  clubStairs(g);
  clubRoom(g, '攝影社', 'office', 5, 7, false, (f) => {
    f.item('locker', 0.1, 0.6, 270)
      .item('table', 1.6, 2.6, 0, { size: [2.8, 1.4] })
      .item('chair', 2, 4.1, 180)
      .item('camera', 2.2, 2.9)
      .item('bookshelf', 1.6, 0.1, 0, { size: [2.6, 0.7] });
  });
  g.room('暗房', 'storage', 12, 0, 4, 7).dv(12, 1, 1.5, 1, 0);
  g.item('sink', 13.2, 4.3, 90, { size: [1.6, 1.2] }).item('lamp', 15, 0.3);
  clubRoom(
    g,
    '吉他社',
    'studio',
    16,
    8,
    false,
    (f) => {
      f.item('drums', 0.3, 0.3)
        .item('speaker', 3.8, 0.2)
        .item('speaker', 5.2, 0.2)
        .item('mixer', 4, 2.4)
        .item('chair', 1, 4.5)
        .item('chair', 2.4, 4.5);
    },
    { wall: 'sound' },
  );
  clubRoom(g, '登山社', 'office', 24, 7, false, (f, w) => {
    meetingTable(f, w);
    f.item('tent', 5, 0.1, 0, { size: [2, 2] }).item('bag', 3.4, 0.3);
  });
  clubRoom(g, '廁所', 'wet', 31, 4, false, (f) => {
    f.item('toilet', 0.3, 0.1)
      .item('toilet', 1.8, 0.1)
      .item('washbasin', 0.1, 3.4, 270, { size: [1.2, 1] });
  });
  clubRoom(g, '管理員室', 'office', 35, 5, false, (f) => {
    f.item('desk', 0.2, 0.2)
      .item('chair', 0.9, 1.5, 180)
      .item('key', 3.6, 0.4)
      .item('filing', 0.1, 3.2, 270);
  });
  clubRoom(g, '交誼廳', 'living', 0, 12, true, (f) => {
    f.item('sofa3', 0.2, 0.1)
      .item('lowtable', 1.2, 2.2)
      .item('vending', 9.6, 0.1)
      .item('armchair', 5.6, 2)
      .item('table_round', 6.8, 4.6);
  });
  clubRoom(g, '推理研究社', 'office', 16, 8, true, (f, w) => {
    meetingTable(f, w);
    f.item('bookshelf', 4.6, 0.1).item('whiteboard', 7.5, 2.4, 90);
  });
  clubRoom(g, '漫畫研究社', 'office', 24, 7, true, (f, w) => {
    meetingTable(f, w);
    f.item('bookshelf', 3.8, 0.1);
  });
  clubRoom(g, '倉庫', 'storage', 31, 9, true, (f) => {
    f.item('supply_shelf', 0.1, 0.6, 270)
      .item('cardboard', 2, 0.3)
      .item('cardboard', 3.4, 0.3)
      .item('crate', 6.6, 0.3)
      .item('pallet', 2.4, 3.6);
  });
  g.dh(0.5, 7, 4, 1, 0, 'open')
    .dh(13.25, 18, 1.5, -1, 0, 'door2')
    .dh(12.5, 10, 3, 1, 0, 'open')
    .dv(40, 7.75, 1.5, 1, 0)
    .wh(6.5, 0, 2)
    .wh(19, 0, 2)
    .wh(26, 0, 2)
    .wh(36.5, 0, 2)
    .wh(2.5, 18, 3)
    .wh(7, 18, 3)
    .wh(18, 18, 3)
    .wh(26, 18, 2.5)
    .wh(34, 18, 3)
    .wv(0, 12, 3);
  g.find('暗房').note =
    '底片櫃最下層的盒子裡，是十年前某屆社員拍的照片，每一張的角落都站著同一個人。';
  g.item('bench', 1, 21.6, 180, { size: [3, 0.9] })
    .item('tree', 30, 19)
    .item('bush', 20, 20);

  const u = new FloorBuilder('2F');
  u.room('樓梯間', 'hall', 0, 0, 5, 7, { hideLabel: true }).room('走廊', 'hall', 0, 7, 40, 3, {
    hideLabel: true,
  });
  clubStairs(u);
  clubRoom(u, '神祕學研究會', 'special', 5, 8, false, (f) => {
    f.item('bookshelf', 0.2, 0.1)
      .item('bookshelf', 3.4, 0.1)
      .item('rug', 1.6, 1.6, 0, { size: [3.6, 3] })
      .item('table_round', 2.5, 2.2)
      .item('crystal_ball', 3, 2.6)
      .item('candle', 6.8, 0.4)
      .item('chair', 1.3, 2.6, 90)
      .item('chair', 4.4, 2.6, 270);
  });
  clubRoom(u, '社團聯合辦公室', 'office', 13, 7, false, (f, w) => {
    meetingTable(f, w);
    f.item('copier', 5.4, 0.1).item('filing', 4.2, 0.1);
  });
  clubRoom(
    u,
    '電影社',
    'studio',
    20,
    8,
    false,
    (f) => {
      f.item('whiteboard', 1, 0.1, 0, { size: [5, 0.4] })
        .item('seats', 1, 2, 0, { size: [5, 1.2] })
        .item('seats', 1, 3.8, 0, { size: [4, 1.2] })
        .item('speaker', 6.6, 0.2);
    },
    { wall: 'sound' },
  );
  clubRoom(u, '文藝社', 'office', 28, 6, false, (f, w) => {
    meetingTable(f, w);
  });
  clubRoom(u, '廁所', 'wet', 34, 6, false, (f) => {
    f.item('toilet', 0.4, 0.1)
      .item('toilet', 2, 0.1)
      .item('washbasin', 0.1, 3.4, 270, { size: [1.2, 1] });
  });
  clubRoom(u, '會議室', 'office', 0, 10, true, (f) => {
    f.item('meeting6', 2.4, 1.2).item('whiteboard', 0.1, 1.4, 270);
  });
  clubRoom(
    u,
    '廢社的社辦',
    'special',
    10,
    6,
    true,
    (f) => {
      f.item('table', 1, 2, 0, { size: [2.8, 1.4], gm: true })
        .item('candle', 1.2, 0.4, 0, { gm: true })
        .item('magic_circle', 0.6, 0.4, 0, { gm: true, size: [4, 4] })
        .item('wall_graffiti', 1.5, -0.3, 0, { gm: true });
    },
    {
      gm: true,
      door: 'locked',
      note: '十年前廢社的「民俗研究會」。學校說是因為沒人加入，可是門是從裡面鎖上的。',
    },
  );
  clubRoom(u, '桌遊社', 'office', 16, 8, true, (f) => {
    f.item('table_round', 1, 1)
      .item('table_round', 4.6, 1)
      .item('chair', 0, 1.4, 90)
      .item('chair', 6.6, 1.4, 270)
      .item('bookshelf', 0.2, 4.6, 0, { size: [3, 0.8] });
  });
  clubRoom(
    u,
    '劇團排練室',
    'studio',
    24,
    10,
    true,
    (f) => {
      f.item('stage', 0.3, 0.3, 0, { size: [6, 3] })
        .item('armor_stand', 8.2, 0.3)
        .item('chair', 2, 4.5)
        .item('chair', 3.4, 4.5);
    },
    { wall: 'sound' },
  );
  clubRoom(u, '器材室', 'storage', 34, 6, true, (f) => {
    f.item('supply_shelf', 0.1, 0.6, 270).item('cardboard', 2, 0.3).item('speaker', 3.6, 0.3);
  });
  u.dh(0.5, 7, 4, 1, 0, 'open')
    .wh(7, 0, 2)
    .wh(15, 0, 2)
    .wh(30, 0, 2)
    .wh(36, 0, 2)
    .wh(3, 18, 3)
    .wh(19, 18, 3)
    .wh(36, 18, 2)
    .wv(0, 12, 3)
    .wv(40, 7.75, 1.5);
  return [g.f, u.f];
}

/* ---------- 博物館（1F 展示室、B1 收藏庫） ---------- */

function museumCore(b: FloorBuilder): void {
  b.room('樓梯・貨梯', 'hall', 16, 0, 6, 8, { hideLabel: true });
  b.item('stairs', 16.5, 0.5).item('elevator', 18.6, 0.5, 0, { size: [3.2, 3.2] });
}

export function museum(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('常設展示室', 'public', 0, 0, 16, 28)
    .room('修復室', 'office', 22, 0, 6, 8)
    .room('走廊', 'hall', 16, 8, 12, 6, { hideLabel: true })
    .room('特展室', 'public', 28, 0, 16, 14)
    .room('大廳', 'public', 16, 14, 12, 14)
    .room('館長室', 'office', 28, 14, 8, 8)
    .room('學藝員室', 'office', 36, 14, 8, 8)
    .room('紀念品店', 'public', 28, 22, 8, 6)
    .room('廁所', 'wet', 36, 22, 8, 6)
    .room('前庭', 'porch', 10, 28, 24, 5);
  museumCore(g);
  g.dh(20.5, 28, 3, -1, 0, 'auto')
    .dv(16, 18, 4, 1, 0, 'open')
    .dh(19, 14, 6, 1, 0, 'open')
    .dh(17, 8, 4, 1, 0, 'open')
    .dh(23.5, 8, 1.5, -1, 0)
    .dv(28, 9.5, 3, 1, 0, 'door2')
    .dv(28, 17.5, 1.5, 1, 0)
    .dh(38, 14, 1.5, 1, 0)
    .dv(28, 24, 2, 1, 0, 'open')
    .dv(36, 24.5, 1.5, 1, 0)
    .wh(2, 28, 3)
    .wh(11, 28, 3)
    .wh(30, 28, 3)
    .wv(44, 16, 3)
    .wh(24, 0, 2);
  /* 常設展示室：恐龍骨架（紅龍柱圍起來）、沿牆的展示櫃 */
  g.item('skeleton', 5, 8, 90)
    .item('rope_barrier', 4, 6.8)
    .item('rope_barrier', 8, 6.8)
    .item('rope_barrier', 4, 20.4)
    .item('rope_barrier', 8, 20.4)
    .row('display_case', 0.1, 2, 4, 0, 5.5, 270)
    .item('display_case', 13.4, 2, 90)
    .item('display_case', 13.4, 7, 90)
    .item('pedestal', 11.2, 24.6)
    .item('pedestal', 2, 25.4)
    .item('painting', 4, 0.1);
  /* 修復室、特展室 */
  g.item('workbench', 23.4, 0.1, 0, { size: [4, 1.4] })
    .item('microscope', 23, 3.8)
    .item('papers', 25.6, 3.8)
    .item('painting', 30, 0.1)
    .item('painting', 36, 0.1)
    .item('painting', 43.6, 7, 90)
    .item('statue', 34.6, 5.6)
    .item('display_case', 30, 9.6)
    .item('display_case', 37.6, 9.6)
    .item('sarcophagus', 39.4, 1.8, 90, { size: [2.4, 4.4] });
  /* 大廳、館長室、學藝員室、紀念品店、廁所 */
  g.item('reception', 22.4, 22, 90, { size: [4, 1.4] })
    .item('bench', 16.4, 23.6, 270, { size: [3, 0.9] })
    .item('plant', 16.4, 26.6)
    .item('office_desk', 30, 14.4, 0)
    .item('chair', 30.7, 15.9)
    .item('bookshelf', 35.1, 18.4, 90)
    .item('safe', 28.4, 20.6)
    .item('desk_island', 38.6, 16.6, 0, { size: [4, 4] })
    .item('store_shelf', 31.6, 22.3)
    .item('register', 32.6, 26.4, 180)
    .item('toilet', 42.3, 22.3, 90)
    .item('toilet', 42.3, 24.6, 90)
    .item('washbasin', 38, 26.8, 180, { size: [1.4, 1] });
  g.item('tree', 10.4, 29).item('tree', 30.6, 29).item('garden_bench', 14, 31.6, 180);

  const bm = new FloorBuilder('B1');
  bm.room('收藏庫', 'storage', 0, 0, 16, 14)
    .room('燻蒸室', 'danger', 22, 0, 6, 8)
    .room('地下走廊', 'hall', 16, 8, 12, 6, { hideLabel: true })
    .room('機房', 'garage', 28, 0, 8, 14)
    .room('未登錄品庫', 'special', 0, 14, 16, 8, {
      gm: true,
      note: '收藏庫北牆的貨架後面。館藏目錄上沒有這些東西，捐贈者的名字全被塗掉了。',
    });
  museumCore(bm);
  bm.dv(16, 10, 3, -1, 0, 'door2')
    .dh(17, 8, 4, 1, 0, 'open')
    .dh(23.5, 8, 1.5, -1, 0, 'steel')
    .dv(28, 10, 1.5, 1, 0, 'steel')
    .dh(6, 14, 1.5, 1, 0, 'secret');
  bm.item('pallet_rack', 1, 0.2)
    .item('pallet_rack', 1, 4.4, 180)
    .item('big_crate', 1, 8.6)
    .item('crate', 4.6, 9)
    .item('crate', 9.6, 10.6)
    .item('statue', 12, 8.4)
    .item('ind_tank', 23.4, 1.2, 0, { size: [3, 3] })
    .item('boiler', 28.4, 0.2)
    .item('em_generator', 31, 9.4, 0, { size: [4, 2] })
    .item('dist_board', 35.3, 3.6, 90)
    .item('sarcophagus', 2, 16.2, 90, { gm: true })
    .item('stele', 9.6, 14.3, 0, { gm: true })
    .item('totem', 13.4, 18.6, 0, { gm: true })
    .item('cursed_item', 9.4, 19.4, 0, { gm: true });
  return [bm.f, g.f];
}

/* ---------- 殯儀館（告別式場、靈堂、化妝室、冷藏室） ---------- */

export function funeralHome(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('告別式場', 'special', 0, 0, 16, 12)
    .room('靈堂', 'special', 16, 0, 8, 12)
    .room('遺體化妝室', 'medical', 24, 0, 8, 12)
    .room('冷藏室', 'danger', 32, 0, 8, 12)
    .room('走廊', 'hall', 0, 12, 40, 3, { hideLabel: true })
    .room('家屬休息室', 'living', 0, 15, 8, 13)
    .room('大廳・接待', 'public', 8, 15, 12, 13)
    .room('辦公室', 'office', 20, 15, 8, 13)
    .room('禮儀用品室', 'storage', 28, 15, 6, 13)
    .room('舊停柩室', 'danger', 34, 15, 6, 13, {
      gm: true,
      note: '館方說二十年前就不用了。鎖是新的，地上有拖過棺木的痕跡。',
    })
    .room('前庭', 'porch', 0, 28, 40, 5);
  b.dh(12.5, 28, 3, -1, 0, 'auto')
    .dh(10, 15, 6, -1, 0, 'open')
    .dh(2.5, 15, 1.5, 1, 0)
    .dh(22, 15, 1.5, 1, 0)
    .dh(29.5, 15, 1.5, 1, 0)
    .dh(36, 15, 1.5, 1, 0, 'locked')
    .dh(6.5, 12, 3, -1, 0, 'door2')
    .dh(19, 12, 2, -1, 0, 'open')
    .dh(27, 12, 1.5, -1, 0)
    .dh(35, 12, 1.5, -1, 0, 'steel')
    .dv(32, 4, 1.5, 1, 0)
    .dv(40, 12.75, 1.5, 1, 0) // 搬運口
    .wv(0, 3, 3)
    .wv(0, 19, 3)
    .wh(2, 28, 3)
    .wh(16.5, 28, 2.5)
    .wh(23, 28, 3)
    .wh(29.5, 28, 2.5);
  /* 告別式場：祭壇與棺木、花、兩區的座位 */
  b.item('altar', 5.5, 0.2, 0, { size: [5, 1.6] })
    .item('photo', 7.6, 0.5)
    .item('coffin', 6, 2.2, 90)
    .row('plant', 1, 0.4, 3, 1.4, 0)
    .row('plant', 11.2, 0.4, 3, 1.4, 0)
    .item('seats', 1.5, 6)
    .item('seats', 8.5, 6)
    .item('seats', 1.5, 8)
    .item('seats', 8.5, 8)
    .item('lectern', 13.2, 2.4);
  /* 靈堂、化妝室、冷藏室 */
  b.item('altar', 18.5, 0.2)
    .item('candle', 17.4, 0.4)
    .item('candle', 21.8, 0.4)
    .item('offering', 19.3, 2.2)
    .item('chair', 18.6, 6)
    .item('chair', 20.4, 6)
    .item('exam_bed', 26.4, 1, 0)
    .item('med_cabinet', 28.6, 0.1)
    .item('sink', 30.6, 6.6, 90)
    .item('morgue', 37.6, 0.4, 90)
    .item('morgue', 33.6, 6.4, 0, { size: [4.2, 2.4] });
  /* 家屬休息室、大廳、辦公室、禮儀用品室 */
  b.item('sofa3', 0.1, 19, 270)
    .item('lowtable', 2.4, 20.1, 90)
    .item('table', 3.4, 25.4, 0, { size: [2.8, 1.4] })
    .item('reception', 14.4, 22, 90, { size: [4, 1.4] })
    .item('bench', 8.1, 20, 270, { size: [3, 0.9] })
    .item('plant', 8.4, 25.6)
    .item('office_desk', 21, 25.6, 180)
    .item('office_desk', 24.4, 25.6, 180)
    .item('filing', 26.7, 18, 90)
    .item('whiteboard', 27.5, 21.4, 90)
    .item('supply_shelf', 33, 17.6, 90)
    .item('cardboard', 28.4, 25.6)
    .item('coffin', 29.4, 20.6, 0)
    .item('coffin', 36, 19.6, 0, { gm: true })
    .item('drag_marks', 37.8, 21.6, 0, { gm: true })
    .item('candle', 38.6, 26.4, 0, { gm: true });
  b.item('tree', 0.6, 29).item('tree', 36.4, 29);
  return [b.f];
}
