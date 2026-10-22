/**
 * 宗教・古蹟的範本（2026-10 第三批後半，本站自己畫的平面圖）：神社、教會、古城。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 神社（鳥居、參道、拜殿與本殿、社務所、神樂殿；圍起來的禁足地） ---------- */

export function shrine(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('禁足地', 'garden', 0, 0, 12, 12, {
    gm: true,
    note: '注連繩圍起來的林子。神主說「不能進去」，可是石碑前的供品每天都有人換。',
  })
    .room('本殿', 'special', 18, 0, 8, 8)
    .room('拜殿', 'special', 14, 8, 16, 8)
    .room('神輿庫', 'storage', 32, 4, 10, 8)
    .room('神樂殿', 'engawa', 2, 20, 12, 8)
    .room('社務所', 'office', 30, 20, 12, 10)
    .room('參道', 'gravel', 18, 16, 8, 32, { ly: 6 });
  fillYard(b, 0, 0, 44, 48, '鎮守之森');
  b.find('鎮守之森').hideLabel = false;
  /* 禁足地的圍籬（注連繩） */
  b.wall(0, 0, 12, 0, 'fence')
    .wall(0, 0, 0, 12, 'fence')
    .wall(12, 0, 12, 12, 'fence')
    .wall(0, 12, 12, 12, 'fence');
  b.dh(19, 16, 6, -1, 0, 'open') // 拜殿的正面
    .dh(21, 8, 2, -1, 0, 'sliding')
    .dh(4, 12, 2, 1, 0, 'sealed')
    .dv(32, 6.5, 3, -1, 0, 'sliding2')
    .dv(30, 23, 1.5, -1, 0)
    .dh(4, 28, 8, -1, 0, 'open')
    .wv(30, 26, 2)
    .wh(33, 30, 3)
    .wv(14, 10, 2)
    .wv(30, 10, 2);
  /* 參道：兩座鳥居、石燈籠、狛犬、手水舍、賽錢箱 */
  b.item('torii', 18, 44)
    .item('torii', 18, 30)
    .item('komainu', 16.2, 34)
    .item('komainu', 26.4, 34, 0, { flip: true })
    .item('lantern', 16.4, 38)
    .item('lantern', 26.4, 38)
    .item('lantern', 16.4, 22)
    .item('lantern', 26.4, 22)
    .item('temizuya', 27, 40)
    .item('saisen', 20.8, 17.4);
  /* 拜殿、本殿、神輿庫 */
  b.item('offering', 24.6, 10)
    .item('banner', 15, 8.2)
    .item('banner', 27, 8.2)
    .item('lantern', 14.4, 12.6)
    .item('lantern', 28.4, 12.6)
    .item('altar', 20.5, 0.3)
    .item('idol', 21.55, 0.65)
    .item('candle', 18.6, 0.6)
    .item('candle', 24.6, 0.6)
    .item('big_crate', 35, 4.6, 0, { size: [4, 3], label: '神輿' })
    .item('chest', 39.6, 10.6, 180);
  /* 神樂殿、社務所 */
  b.item('drums', 2.4, 20.4, 0, { size: [2.4, 2] })
    .item('byobu', 8, 20.2)
    .item('counter', 30.4, 25.6, 270, { size: [3.6, 1.2] })
    .item('office_desk', 35, 20.4)
    .item('chair', 35.7, 21.9, 180)
    .item('cabinet', 41, 23, 90)
    .item('zataku', 36, 26)
    .item('bookshelf', 38.6, 29.1, 180);
  /* 禁足地（GM 專用）、鎮守之森 */
  b.item('stele', 5, 3, 0, { gm: true })
    .item('hokora', 2, 6, 0, { gm: true })
    .item('offering', 6.4, 7, 0, { gm: true })
    .item('pine', 14, 0.4)
    .item('pine', 38, 34)
    .item('bamboo', 1, 32)
    .item('bamboo', 6, 40)
    .item('tree', 34, 42)
    .item('garden_rock', 10, 44);
  return [b.f];
}

/* ---------- 教會（1F 禮拜堂與牧師館、B1 地下墓室；墓園圍繞） ---------- */

const churchStairs = (b: FloorBuilder) => b.item('stairs', 12.4, 0.6);

export function church(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('聖器室', 'storage', 4, 0, 8, 8)
    .room('後殿', 'hall', 12, 0, 8, 8, { lx: 1 })
    .room('牧師辦公室', 'office', 20, 0, 8, 8)
    .room('禮拜堂', 'special', 4, 8, 24, 30, { ly: -3 })
    .room('前廊', 'porch', 10, 38, 12, 4)
    .room('書房', 'office', 28, 8, 10, 8)
    .room('臥室', 'bedroom', 28, 16, 10, 8);
  fillYard(g, 0, 0, 44, 52, '墓園');
  g.find('墓園').hideLabel = false;
  churchStairs(g);
  g.dh(14.5, 38, 3, -1, 0, 'door2')
    .dh(16, 8, 2, 1, 0)
    .dh(8, 8, 1.5, 1, 0)
    .dh(22, 8, 1.5, 1, 1)
    .dv(28, 13, 1.5, 1, 0)
    .dh(30, 16, 1.5, 1, 0)
    .dv(38, 21.5, 1.5, 1, 0)
    .wv(4, 14, 3)
    .wv(4, 22, 3)
    .wv(4, 30, 3)
    .wv(28, 30, 3)
    .wh(14, 0, 3)
    .wh(31, 24, 3)
    .wv(38, 10, 2);
  /* 禮拜堂：祭壇、講台、管風琴、兩排長椅、告解室、聖洗池 */
  g.item('altar', 13, 11, 0, { size: [6, 1.6] })
    .item('candle', 12, 11.4)
    .item('candle', 19.2, 11.4)
    .item('lectern', 9.6, 13.4)
    .item('organ', 24, 9.8)
    .item('confessional', 4.2, 25, 270)
    .item('font', 15.3, 34.4);
  for (let i = 0; i < 6; i++) {
    g.item('pew', 7.2, 16 + i * 2.6, 0, { size: [6, 1.2] });
    g.item('pew', 19, 16 + i * 2.6, 0, { size: [6, 1.2] });
  }
  /* 聖器室、牧師辦公室、書房、臥室 */
  g.item('cabinet', 4.1, 1, 270)
    .item('chest', 8.4, 0.2)
    .item('office_desk', 23, 0.2)
    .item('chair', 23.7, 1.7)
    .item('bookshelf', 27.1, 3, 90)
    .item('bookshelf', 30, 8.1)
    .item('bookshelf', 33.2, 8.1)
    .item('desk', 36.7, 11.4, 90)
    .item('chair', 35.5, 12.1, 270)
    .item('bed_single', 35.8, 16.2)
    .item('wardrobe', 28.1, 20, 270)
    .item('nightstand', 34.8, 16.2);
  /* 墓園 */
  for (const [x, y] of [
    [1, 4],
    [1, 10],
    [1, 16],
    [1, 40],
    [32, 30],
    [36, 30],
    [40, 30],
    [32, 36],
    [36, 36],
    [40, 36],
  ] as const)
    g.item('grave', x, y);
  g.item('tree', 0.6, 46).item('tree', 39, 2).item('lantern', 23.6, 39);

  const bm = new FloorBuilder('B1');
  bm.room('地下墓室', 'stone', 8, 0, 20, 14, { wall: 'stone' }).room(
    '封印的納骨堂',
    'danger',
    8,
    14,
    20,
    8,
    {
      gm: true,
      wall: 'stone',
      note: '地下墓室南牆的鐵門被焊死，門上刻著拉丁文的警告。裡面的骨頭排成了一個圖形。',
    },
  );
  churchStairs(bm);
  bm.dh(16.5, 14, 2, 1, 0, 'sealed');
  bm.item('sarcophagus', 18, 1, 90)
    .item('coffin', 23, 1)
    .item('coffin', 23, 7.6)
    .item('coffin', 9, 8.6, 90)
    .item('candle', 16, 10)
    .item('torch', 27, 4, 90)
    .item('bones', 10, 16, 0, { gm: true })
    .item('bones', 24, 18, 0, { gm: true })
    .item('magic_circle', 15, 15.6, 0, { gm: true, size: [5, 5] });
  return [bm.f, g.f];
}

/* ---------- 古城（石造：1F 大廳、中庭、兩翼與城門；B1 地牢） ---------- */

const castleStairs = (b: FloorBuilder) => b.item('spiral', 0.5, 15.5);

export function castle(): TplFloor[] {
  const g = new FloorBuilder('1F');
  const stone = { wall: 'stone' } as const;
  g.room('大廳', 'stone', 12, 0, 24, 12, stone)
    .room('兵舍', 'stone', 0, 0, 12, 20, stone)
    .room('廚房', 'kitchen', 0, 20, 12, 12, stone)
    .room('禮拜堂', 'special', 36, 0, 12, 12, stone)
    .room('領主的居室', 'bedroom', 36, 12, 12, 12, stone)
    .room('書庫', 'public', 36, 24, 12, 8, stone)
    .room('中庭', 'dirt', 12, 12, 24, 20)
    .room('衛兵室', 'stone', 12, 32, 8, 8, stone)
    .room('城門', 'stone', 20, 32, 8, 8, stone)
    .room('馬廄', 'doma', 28, 32, 8, 8, stone)
    .room('護城河', 'water', 0, 44, 48, 4);
  fillYard(g, 0, 32, 48, 44, '城外');
  castleStairs(g);
  g.dh(21.5, 40, 5, -1, 0, 'big2')
    .dh(22.5, 32, 3, -1, 0, 'door2')
    .dv(20, 35, 1.5, -1, 0)
    .dh(30, 32, 3, -1, 0, 'open')
    .dh(22.5, 12, 3, -1, 0, 'door2')
    .dv(12, 14, 1.5, -1, 0)
    .dv(12, 24, 1.5, -1, 0)
    .dv(36, 5, 1.5, 1, 0)
    .dv(36, 16, 1.5, 1, 0)
    .dv(36, 27, 1.5, 1, 0)
    .dv(12, 4, 1.5, 1, 0)
    .wh(16, 0, 2)
    .wh(30, 0, 2)
    .wh(40, 0, 2)
    .wv(0, 4, 2)
    .wv(0, 24, 2)
    .wv(48, 16, 2)
    .wv(48, 27, 2);
  /* 大廳：王座、長桌、旗幟、盔甲 */
  g.item('throne', 22.8, 0.3)
    .item('banner', 18, 0.1)
    .item('banner', 28, 0.1)
    .item('table', 18, 5.4, 0, { size: [12, 1.6] })
    .row('chair', 18.6, 4.2, 5, 2.4, 0)
    .row('chair', 18.6, 7.2, 5, 2.4, 0, 180)
    .item('armor_stand', 12.4, 9)
    .item('armor_stand', 34.4, 9)
    .item('torch', 15, 11.1, 180)
    .item('torch', 32, 11.1, 180);
  /* 兵舍、廚房 */
  g.row('bed_single', 2, 0.3, 3, 2.4, 0)
    .item('weapon_rack', 11, 7, 90)
    .item('chest', 6, 11)
    .item('stove', 0.1, 21.4, 270)
    .item('cauldron', 3.2, 24.6)
    .item('table', 6.4, 26, 0, { size: [3, 1.6] })
    .row('barrel', 0.4, 30.4, 3, 1.4, 0);
  /* 禮拜堂、領主的居室、書庫 */
  g.item('altar', 40.5, 0.3)
    .item('candle', 39.4, 0.6)
    .item('candle', 43.8, 0.6)
    .item('pew', 39, 5, 0, { size: [5, 1.2] })
    .item('pew', 39, 7.6, 0, { size: [5, 1.2] })
    .item('bed_canopy', 44.6, 12.4)
    .item('wardrobe', 40, 22.6, 180)
    .item('desk', 38, 12.4)
    .item('chest', 44.2, 21.8, 180)
    .row('bookshelf', 47.1, 24.2, 2, 0, 3.4, 90)
    .item('bookshelf', 38.5, 30.9, 180)
    .item('table', 40.4, 26.6, 0, { size: [2.8, 1.4] });
  /* 中庭、衛兵室、馬廄、城外 */
  g.item('well', 23, 20)
    .item('tree', 14, 26)
    .item('quest_board', 31, 12.2, 0, { label: '告示' })
    .item('table', 14, 35, 0, { size: [2.4, 1.4] })
    .item('chair', 14.6, 36.6, 180)
    .item('weapon_rack', 12.2, 37.8, 270, { size: [2, 0.8] })
    .item('hay', 33.4, 36)
    .item('hay', 33.4, 38.2)
    .item('barrel', 29, 38.4)
    .item('wood_bridge', 22.8, 42.6, 0, { size: [2.4, 5.4] });

  const bm = new FloorBuilder('B1');
  bm.room('地牢', 'stone', 0, 12, 24, 8, stone).room('拷問室', 'danger', 24, 12, 10, 8, {
    gm: true,
    wall: 'stone',
    note: '地牢東邊的石壁是暗門。歷代城主在這裡「審問」的紀錄，最後一頁的日期是上個月。',
  });
  for (let i = 0; i < 3; i++)
    bm.room(`牢房 ${i + 1}`, 'stone', i * 8, 20, 8, 6, { noWall: true, wall: 'stone' });
  castleStairs(bm);
  bm.wall(0, 20, 24, 20, 'bars').wall(8, 20, 8, 26, 'stone').wall(16, 20, 16, 26, 'stone');
  for (let i = 0; i < 3; i++) bm.dh(i * 8 + 5, 20, 2, 1, 0, 'gate');
  bm.dv(24, 14, 1.5, 1, 0, 'secret');
  bm.item('torch', 10, 12.1)
    .item('torch', 20, 12.1)
    .item('table', 12, 15, 0, { size: [2.4, 1.4] })
    .item('chains', 0.2, 23.4, 270, { size: [2.4, 0.6] })
    .item('hay', 9, 24.4)
    .item('bones', 17, 24.2)
    .item('ritual_table', 28, 15, 0, { gm: true })
    .item('chains', 33.3, 13, 90, { gm: true })
    .item('spike_trap', 25, 17.6, 0, { gm: true })
    .item('wall_blood', 30, 19.6, 0, { gm: true });
  return [bm.f, g.f];
}
