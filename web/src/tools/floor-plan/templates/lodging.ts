/**
 * 住宿・餐飲的範本（2026-10 第三批後半，本站自己畫的平面圖）：溫泉旅館、禁酒令時期的地下酒館、公路旁的家庭餐廳。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 溫泉旅館（1F 大廳、宴會廳、大浴場與露天風呂；2F 和室客房） ---------- */

/** 和室客房（寬 w × 深 10）：壁龕在西牆、矮桌與坐墊在中間、窗邊兩張椅子；south＝房間在走廊南邊 */
function ryokanRoom(
  b: FloorBuilder,
  name: string,
  x: number,
  y: number,
  w: number,
  south: boolean,
) {
  const door = x + w - 2.5;
  b.room(name, 'washitsu', x, y, w, 10);
  if (south) {
    b.dh(door, y, 1.5, 1, 1)
      .wh(x + 3, y + 10, 4)
      .item('tokonoma', x + 0.1, y + 5.4, 270)
      .item('zataku', x + w / 2 - 1, y + 4)
      .item('zabuton', x + w / 2 - 0.1, y + 2.6)
      .item('zabuton', x + w / 2 - 0.1, y + 6.2)
      .item('armchair', x + w - 2.4, y + 7.9);
  } else {
    b.dh(door, y + 10, 1.5, -1, 1)
      .wh(x + 3, y, 4)
      .item('tokonoma', x + 0.1, y + 1, 270)
      .item('zataku', x + w / 2 - 1, y + 4)
      .item('zabuton', x + w / 2 - 0.1, y + 2.6)
      .item('zabuton', x + w / 2 - 0.1, y + 6.2)
      .item('armchair', x + w - 2.4, y + 0.3);
  }
}

const ryokanStairs = (b: FloorBuilder) => b.item('stairs', 25.9, 0.5);

export function ryokan(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('宴會廳', 'washitsu', 0, 0, 12, 10)
    .room('廚房', 'kitchen', 12, 0, 8, 10)
    .room('員工室', 'office', 20, 0, 5, 10)
    .room('樓梯間', 'hall', 25, 0, 4, 10, { ly: 2.6 })
    .room('男湯', 'wet', 29, 0, 7, 10)
    .room('走廊', 'hall', 0, 10, 36, 4, { hideLabel: true })
    .room('休憩室', 'washitsu', 0, 14, 12, 10)
    .room('大廳・櫃台', 'public', 12, 14, 12, 10)
    .room('土產店', 'public', 24, 14, 5, 10)
    .room('女湯', 'wet', 29, 14, 7, 10)
    .room('玄關', 'doma', 14, 24, 6, 4)
    .room('前庭', 'gravel', 10, 28, 14, 6)
    .room('露天風呂', 'water', 36, 2, 8, 8);
  fillYard(g, 0, -4, 48, 36, '庭園');
  g.dh(15.5, 28, 3, -1, 0, 'sliding2') // 玄關
    .dh(15, 24, 4, -1, 0, 'open')
    .dh(14, 14, 3, -1, 0, 'open')
    .dh(8, 14, 3, -1, 0, 'sliding2')
    .dh(25, 14, 2, -1, 0, 'open')
    .dh(31, 14, 1.5, -1, 0, 'sliding')
    .dh(3, 10, 3, 1, 0, 'sliding2')
    .dh(16, 10, 1.5, 1, 0)
    .dh(21.5, 10, 1.5, 1, 0)
    .dh(26, 10, 2, 1, 0, 'open')
    .dh(31, 10, 1.5, 1, 0, 'sliding')
    .dv(36, 6, 1.5, 1, 0)
    .dh(18, 0, 1.5, -1, 0) // 廚房的後門
    .wh(2, 0, 3)
    .wh(7, 0, 3)
    .wv(0, 3, 3)
    .wv(0, 17, 3)
    .wh(3, 24, 3)
    .wh(8, 24, 3)
    .wh(21, 24, 2.5)
    .wh(31, 0, 3)
    .wh(31, 24, 3)
    .wv(36, 17, 3);
  ryokanStairs(g);
  /* 宴會廳、廚房、員工室 */
  g.item('tokonoma', 10.5, 1, 90)
    .item('zataku', 2.5, 3)
    .item('zataku', 6, 3)
    .item('zataku', 2.5, 6.3)
    .item('zataku', 6, 6.3)
    .item('kitchen', 12.2, 0.1)
    .item('stove', 12.1, 3, 270)
    .item('island', 14.5, 4.5)
    .item('fridge', 18.5, 7.5, 90)
    .item('office_desk', 20.5, 0.2)
    .item('chair', 21.2, 1.7)
    .item('locker', 24, 3, 90)
    .item('filing', 20.1, 6, 270);
  /* 大浴場：洗身的水龍頭（洗手台）一排、浴池 */
  g.row('washbasin', 29.1, 1, 3, 0, 1.8, 270)
    .item('bathtub', 31.8, 1, 0, { size: [3.6, 4] })
    .row('washbasin', 29.1, 16.5, 3, 0, 1.8, 270)
    .item('bathtub', 31.8, 19, 0, { size: [3.6, 4] });
  /* 大廳・櫃台、土產店、休憩室、玄關 */
  g.item('reception', 22.5, 15.5, 90)
    .item('sofa2', 12.1, 17, 270)
    .item('lowtable', 14.4, 18, 90)
    .item('plant', 12.4, 22.4)
    .item('store_shelf', 27.3, 17, 90)
    .item('register', 24.5, 22.4, 180)
    .item('zataku', 3, 18)
    .item('zabuton', 3.9, 16.6)
    .item('zabuton', 3.9, 20.2)
    .item('tv', 0.1, 20.2, 270)
    .item('vending', 10.6, 20, 90)
    .item('cabinet', 14.1, 25.1, 270, { size: [2.4, 1] });
  /* 前庭、露天風呂、庭園 */
  g.item('lantern', 11, 29)
    .item('lantern', 21.8, 29)
    .item('pine', 1, 27)
    .item('garden_rock', 37, 0.4)
    .item('garden_rock', 42, 10.4)
    .item('bamboo_fence', 37, -0.4)
    .item('bamboo', 44.5, 2);

  const u = new FloorBuilder('2F');
  u.room('樓梯間', 'hall', 25, 0, 4, 10, { ly: 2.6 })
    .room('備品室', 'storage', 29, 0, 7, 10)
    .room('走廊', 'hall', 0, 10, 36, 4, { hideLabel: true });
  ryokanRoom(u, '松之間', 0, 0, 12, false);
  ryokanRoom(u, '竹之間', 12, 0, 13, false);
  ryokanRoom(u, '梅之間', 0, 14, 12, true);
  ryokanRoom(u, '蘭之間', 12, 14, 12, true);
  u.room('櫻之間', 'washitsu', 24, 14, 12, 10, {
    gm: true,
    note: '十年前出事之後就不開放。榻榻米換過了，牆上的污漬卻一直洗不掉。',
  });
  ryokanStairs(u);
  u.dh(26, 10, 2, 1, 0, 'open')
    .dh(30, 10, 1.5, -1, 0)
    .dh(25, 14, 1.5, 1, 0, 'locked')
    .wh(31, 0, 2)
    .wh(28, 24, 4)
    .wv(36, 17, 3);
  u.item('supply_shelf', 35, 1, 90)
    .item('futon', 31.5, 0.5)
    .item('cardboard', 33.6, 6.4)
    .item('futon', 31, 17, 0, { gm: true })
    .item('tokonoma', 24.1, 19.4, 270, { gm: true })
    .item('black_stain', 27.5, 19.2, 0, { gm: true, size: [2.4, 2] })
    .item('candle', 34.4, 22.4, 0, { gm: true })
    .item('wall_mold', 33, 23.5, 0, { gm: true });
  return [g.f, u.f];
}

/* ---------- 禁酒令時期的地下酒館（1F 理髮店、B1 酒館） ---------- */

const speakeasyStairs = (b: FloorBuilder) => b.item('stairs', 13.6, 0.3, 0, { size: [2, 4.4] });

export function speakeasy(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('倉庫', 'storage', 0, 0, 10, 6)
    .room('樓梯間', 'hall', 10, 0, 6, 6, { hideLabel: true })
    .room('理髮店', 'public', 0, 6, 16, 14)
    .room('花店', 'public', 16, 6, 8, 14)
    .room('人行道', 'porch', 0, 20, 24, 4)
    .room('街道', 'road', 0, 24, 24, 6, { hideLabel: true })
    .room('後巷', 'dirt', 16, 0, 8, 6, { ly: 0.6 });
  speakeasyStairs(g);
  g.dh(3, 20, 1.5, -1, 0) // 理髮店的門
    .dh(19, 20, 1.5, -1, 0) // 花店的門
    .dh(4, 6, 1.5, -1, 0)
    .dh(12, 6, 1.5, -1, 1, 'locked') // 往地下的門（要敲暗號）
    .dh(19, 6, 1.5, -1, 0) // 花店的後門
    .wh(6, 20, 3.5, 'window2')
    .wh(10.5, 20, 3.5, 'window2')
    .wh(21, 20, 2.5, 'window2')
    .wv(0, 10, 3);
  g.row('barber_chair', 1, 7.2, 3, 3.6, 0)
    .item('bench', 0.1, 14, 270, { size: [4, 1] })
    .item('cabinet', 15, 8.2, 90, { size: [2.4, 1] })
    .item('gramophone', 13.4, 17.6)
    .item('plant', 11.6, 18.4)
    .item('counter', 22.6, 11.4, 90, { size: [3.6, 1.2] })
    .item('plant', 16.4, 15.4)
    .item('plant', 17.8, 15.4)
    .item('plant', 16.4, 16.8)
    .item('barrel', 0.4, 0.4)
    .item('barrel', 1.8, 0.4)
    .item('crate', 7.8, 0.4)
    .item('ladder', 20.4, 24.6, 0)
    .item('streetlight', 22.6, 20.4);
  g.find('樓梯間').note = '門上沒有把手。敲三下、停一下、再敲兩下，裡面的人才會開門。';

  const bm = new FloorBuilder('B1');
  bm.room('酒窖', 'storage', 0, 0, 10, 6)
    .room('樓梯下', 'hall', 10, 0, 6, 6, { hideLabel: true })
    .room('撲克室', 'special', 16, 0, 8, 6)
    .room('酒館', 'public', 0, 6, 24, 10)
    .room('老闆辦公室', 'office', 0, 16, 10, 6)
    .room('廁所', 'wet', 10, 16, 5, 6)
    .room('逃生地道', 'doma', 15, 16, 9, 6, {
      gm: true,
      note: '酒館東邊的牆是暗門。查緝的時候客人從這裡逃到街上的人孔。',
    })
    .room('逃生地道', 'doma', 19, 22, 4, 6, { gm: true, hideLabel: true });
  speakeasyStairs(bm);
  bm.dh(11, 6, 3, 1, 0, 'open')
    .dh(4, 6, 1.5, -1, 0)
    .dh(19, 6, 1.5, -1, 0)
    .dh(5, 16, 1.5, 1, 0)
    .dh(11.5, 16, 1.5, 1, 0)
    .dh(20, 16, 1.5, 1, 0, 'secret');
  /* 酒窖、撲克室 */
  bm.row('barrel', 0.4, 0.4, 5, 1.4, 0)
    .row('barrel', 0.4, 1.8, 3, 1.4, 0)
    .item('crate', 7.6, 2.6)
    .item('table_round', 18.6, 2, 0, { size: [2.4, 2.4] })
    .item('chair', 17.4, 2.7, 90)
    .item('chair', 21.1, 2.7, 270)
    .item('chair', 19.3, 0.9)
    .item('safe', 22.6, 0.3);
  /* 酒館：吧台與高腳椅、小舞台與鋼琴、桌子 */
  bm.item('counter', 0.3, 8.6, 270, { size: [5, 1.2] })
    .row('stool', 1.8, 8.8, 4, 0, 1.2)
    .item('cupboard', 0.1, 13.8, 270, { size: [2, 0.8] })
    .item('piano_up', 20.4, 13.6, 180)
    .item('drums', 17, 12.8, 180, { size: [2.6, 2.4] })
    .item('table_round', 6.5, 9.6)
    .item('table_round', 10.5, 9.6)
    .item('table_round', 6.5, 12.8)
    .item('table_round', 10.5, 12.8)
    .item('chair', 5.4, 10, 90)
    .item('chair', 8.4, 10, 270)
    .item('chair', 9.4, 13.2, 90)
    .item('chair', 12.4, 13.2, 270)
    .item('lamp', 23, 6.4);
  /* 老闆辦公室、廁所、逃生地道 */
  bm.item('office_desk', 2, 20.5, 180)
    .item('chair', 2.7, 19.4)
    .item('safe', 8.6, 20.6)
    .item('filing', 0.1, 17, 270)
    .item('toilet', 13.3, 20.3, 90)
    .item('washbasin', 10.1, 19, 270, { size: [1.2, 1] })
    .item('ladder', 20.4, 24.6, 0)
    .item('crate', 15.4, 20.2, 0, { gm: true })
    .item('lamp', 22.8, 16.4, 0, { gm: true });
  return [bm.f, g.f];
}

/* ---------- 公路旁的家庭餐廳（後巷、店面、停車場） ---------- */

export function diner(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('後巷', 'dirt', 0, 0, 40, 6, { ly: -0.6 })
    .room('倉庫', 'storage', 0, 6, 10, 6)
    .room('冷凍庫', 'storage', 10, 6, 5, 6)
    .room('用餐區', 'public', 0, 12, 20, 14)
    .room('廚房', 'kitchen', 20, 6, 12, 10)
    .room('廁所', 'wet', 20, 16, 6, 10)
    .room('員工休息室', 'office', 26, 16, 6, 10)
    .room('店長室', 'office', 15, 6, 5, 6)
    .room('停車場', 'road', 0, 26, 40, 14)
    .room('人行道', 'porch', 32, 6, 8, 20, { hideLabel: true });
  b.find('冷凍庫').gm = true;
  b.find('冷凍庫').note = '店長說冷凍庫壞了好幾天。門把上有新的指紋，溫度計卻顯示零下二十度。';
  b.dh(8, 26, 3, -1, 0, 'auto') // 大門
    .dh(2, 12, 1.5, -1, 0)
    .dv(10, 8, 1.5, 1, 0, 'steel')
    .dh(16.75, 12, 1.5, 1, 0, 'open')
    .dv(20, 13, 2, 1, 0, 'open') // 出菜口
    .dh(28, 16, 1.5, 1, 1)
    .dh(4, 6, 1.5, -1, 0) // 倉庫的後門
    .dh(30, 6, 1.5, -1, 0) // 廚房的後門
    .dv(20, 22, 1.5, 1, 0)
    .wh(1, 26, 3.5, 'window2')
    .wh(12, 26, 3.5, 'window2')
    .wh(15.75, 26, 3.5, 'window2')
    .wv(0, 14, 3.5, 'window2')
    .wv(0, 18.5, 3.5, 'window2')
    .wv(32, 9, 2)
    .wv(32, 20, 2);
  /* 用餐區：靠窗的卡座、中間的桌子 */
  b.item('booth', 0.2, 15.8, 90)
    .item('booth', 0.2, 19.9, 90)
    .item('booth', 14.5, 22.6, 0, { size: [4, 3] })
    .item('table', 6, 15.5, 0, { size: [2.4, 1.4] })
    .item('table', 10.5, 15.5, 0, { size: [2.4, 1.4] })
    .item('chair', 6.2, 14.4)
    .item('chair', 7.4, 14.4)
    .item('chair', 6.2, 17, 180)
    .item('chair', 7.4, 17, 180)
    .item('chair', 10.7, 14.4)
    .item('chair', 11.9, 14.4)
    .item('chair', 10.7, 17, 180)
    .item('chair', 11.9, 17, 180)
    .item('plant', 14.4, 12.4)
    .item('vending', 4.4, 12.1);
  /* 收銀台、廚房、休息室、廁所 */
  b.item('office_desk', 15.2, 6.2, 0, { size: [2.4, 1.2] })
    .item('chair', 15.9, 7.5, 180)
    .item('filing', 18.8, 6.2)
    .item('register', 12, 21)
    .item('kitchen', 20.2, 6.1, 0, { size: [5, 1.3] })
    .item('stove', 25.6, 6.1)
    .item('sink', 28, 6.1)
    .item('fridge_case', 30.8, 8.5, 90, { size: [3, 1.2] })
    .item('island', 23, 10.4)
    .item('table', 27, 20, 90, { size: [2.4, 1.4] })
    .item('locker', 31, 21.5, 90)
    .item('chair', 28.6, 20.4, 90)
    .item('toilet', 24.4, 17.4, 90)
    .item('toilet', 24.4, 21.4, 90)
    .wall(23.4, 19.6, 26, 19.6, 'thin')
    .wall(23.4, 23.6, 26, 23.6, 'thin')
    .item('washbasin', 20.1, 17, 270, { size: [1.2, 1] });
  /* 倉庫、冷凍庫 */
  b.item('supply_shelf', 0.1, 8.6, 270)
    .item('cardboard', 3.6, 9.6)
    .item('cardboard', 5, 9.6)
    .item('pallet', 6.6, 9.4)
    .item('freezer', 13.2, 6.2, 90, { gm: true })
    .item('body', 11, 7.6, 0, { gm: true, size: [1.6, 3.6] });
  /* 停車場、後巷 */
  b.row('parking_stall', 1, 30.6, 7, 5.4, 0, 0, { size: [5, 9] })
    .item('car', 2, 31.2)
    .item('suv', 12.8, 30.8)
    .item('streetlight', 38.4, 28)
    .item('drum', 34, 0.6)
    .item('drum', 35.4, 0.6)
    .item('big_crate', 8, 0.6, 0, { label: '垃圾箱' });
  return [b.f];
}
