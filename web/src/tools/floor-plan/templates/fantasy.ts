/**
 * 奇幻・科幻的範本（2026-10 第三批後半，本站自己畫的平面圖）：地下迷宮、太空船、冒險者酒館、魔法師之塔。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 地下迷宮（石造的房間與通道、陷阱、寶物庫；封印門後的魔王之間是 GM 專用） ---------- */

export function dungeon(): TplFloor[] {
  const b = new FloorBuilder('B1');
  const s = { wall: 'stone' } as const;
  b.room('魔王之間', 'stone', 16, 0, 16, 10, {
    ...s,
    gm: true,
    note: '封印的門只有在祭壇點亮四根蠟燭時才會打開。王座上的東西一直在等「下一個」。',
  })
    .room('祭壇之間', 'stone', 16, 10, 16, 12, s)
    .room('北通道', 'stone', 22, 22, 4, 4, { ...s, hideLabel: true })
    .room('十字路口', 'stone', 16, 26, 16, 6, s)
    .room('西通道', 'stone', 6, 27, 10, 4, { ...s, hideLabel: true })
    .room('寶物庫', 'stone', 0, 18, 12, 9, s)
    .room('陷阱房', 'stone', 0, 31, 12, 10, s)
    .room('東通道', 'stone', 32, 27, 10, 4, { ...s, hideLabel: true })
    .room('牢房', 'stone', 36, 18, 12, 9, s)
    .room('守衛室', 'stone', 36, 31, 12, 10, s)
    .room('中央通道', 'stone', 22, 32, 4, 10, { ...s, hideLabel: true })
    .room('入口大廳', 'stone', 16, 42, 16, 8, s);
  b.dh(22.5, 50, 3, -1, 0, 'hole') // 洞口
    .dh(22.5, 42, 3, -1, 0, 'open')
    .dh(22.5, 32, 3, -1, 0, 'open')
    .dh(22.5, 26, 3, -1, 0, 'open')
    .dh(22.5, 22, 3, -1, 0, 'door2')
    .dh(23, 10, 2, -1, 0, 'sealed')
    .dv(16, 27.5, 3, -1, 0, 'open')
    .dv(32, 27.5, 3, 1, 0, 'open')
    .dh(7.25, 27, 1.5, -1, 0, 'locked')
    .dh(7.25, 31, 1.5, 1, 0)
    .dh(38, 27, 2, -1, 0, 'gate')
    .dh(38.25, 31, 1.5, 1, 0);
  /* 入口大廳、十字路口 */
  b.item('stairs', 17, 43.2, 270, { size: [2, 4] })
    .item('torch', 20, 49.1, 180)
    .item('torch', 27.2, 49.1, 180)
    .item('statue', 18.6, 26.4)
    .item('statue', 27.8, 26.4)
    .item('bones', 28, 46);
  /* 祭壇之間：祭壇、魔法陣、柱子 */
  b.item('altar', 22.5, 12, 0, { size: [3, 1.6] })
    .item('magic_circle', 21.5, 13.4)
    .row('pillar', 17.5, 11.5, 2, 12, 0)
    .row('pillar', 17.5, 19.5, 2, 12, 0)
    .item('candle', 20, 11)
    .item('candle', 27.2, 11)
    .item('candle', 20, 19)
    .item('candle', 27.2, 19);
  /* 寶物庫、陷阱房 */
  b.item('chest', 1, 18.4)
    .item('chest', 4, 18.4)
    .item('chest', 9.4, 18.4)
    .item('crate', 0.4, 22)
    .item('spike_trap', 4.6, 22)
    .item('pit', 1, 34)
    .item('spike_trap', 6, 37.6)
    .item('spike_trap', 9.4, 34.4)
    .item('bones', 4.2, 38.4);
  /* 牢房、守衛室 */
  b.item('cage', 37, 18.4)
    .item('cage', 44.6, 18.4)
    .item('chains', 40.6, 18.2)
    .item('npc_bound', 41.2, 22.6)
    .item('table', 40, 35, 0, { size: [2.8, 1.6] })
    .item('chair', 39.2, 37, 180)
    .item('chair', 42, 37, 180)
    .item('weapon_rack', 47, 34, 90)
    .item('monster_small', 37.4, 38.6)
    .item('enemy_humanoid', 44.4, 38.4);
  /* 魔王之間（GM 專用） */
  b.item('throne', 22.8, 0.4, 0, { gm: true })
    .item('monster_boss', 21, 3.2, 0, { gm: true, size: [5, 5] })
    .item('chest', 29.6, 0.4, 0, { gm: true })
    .item('banner', 17, 0.2, 0, { gm: true });
  return [b.f];
}

/* ---------- 太空船（艦橋、船員艙、冷凍睡眠艙、動力爐；封鎖區是 GM 專用） ---------- */

export function spaceship(): TplFloor[] {
  const b = new FloorBuilder('1F');
  const t = 'tech' as const;
  b.room('動力爐室', 'industrial', 0, 4, 8, 16)
    .room('船員艙', t, 8, 0, 10, 10)
    .room('食堂', t, 18, 0, 10, 10)
    .room('醫務室', 'medical', 28, 0, 8, 10)
    .room('艦長室', 'bedroom', 36, 2, 8, 8)
    .room('中央走廊', t, 8, 10, 36, 4, { hideLabel: true })
    .room('冷凍睡眠艙室', t, 8, 14, 12, 10)
    .room('貨艙', 'storage', 20, 14, 12, 10)
    .room('氣閘', t, 32, 14, 6, 10)
    .room('封鎖區', 'danger', 38, 14, 6, 8, {
      gm: true,
      note: '中央走廊南側被手動封鎖的艙段。航行日誌刪掉了三天，冷凍艙少的那一個人在這裡。',
    })
    .room('艦橋', t, 44, 4, 10, 16)
    .room('艦首', t, 54, 8, 2, 8, { hideLabel: true, noWall: true });
  b.dv(8, 10.5, 3, -1, 0, 'auto')
    .dh(11, 10, 2, -1, 0, 'auto')
    .dh(21, 10, 2, -1, 0, 'auto')
    .dh(31, 10, 2, -1, 0, 'auto')
    .dh(39, 10, 2, -1, 0, 'auto')
    .dh(12, 14, 2, 1, 0, 'auto')
    .dh(24, 14, 3, 1, 0, 'auto')
    .dh(34, 14, 2, 1, 0, 'auto')
    .dh(40, 14, 2, 1, 0, 'sealed')
    .dv(44, 10.5, 3, 1, 0, 'auto')
    .dh(34, 24, 2, -1, 0, 'steel') // 氣閘的外門
    .dh(46, 4, 6, 1, 0, 'platewin')
    .wv(56, 9, 6, 'window2');
  /* 動力爐室、船員艙、食堂、醫務室、艦長室 */
  b.item('reactor', 1.5, 9.5)
    .item('control_panel', 0.1, 16, 270)
    .item('pipe', 1, 4.2, 0, { size: [6, 0.4] })
    .row('bunk_bed', 8.4, 0.2, 3, 2.6, 0)
    .item('locker', 16.8, 0.6, 90)
    .item('table', 20.4, 3, 0, { size: [4, 1.6] })
    .row('stool', 20.6, 1.8, 3, 1.4, 0)
    .row('stool', 20.6, 4.8, 3, 1.4, 0)
    .item('vending', 26.4, 0.2, 0, { size: [1.4, 1.2] })
    .item('hospital_bed', 28.4, 0.4)
    .item('med_cabinet', 35, 3, 90)
    .item('bed_single', 41.8, 2.2)
    .item('desk', 36.2, 2.2)
    .item('chair', 36.9, 3.5, 180);
  /* 冷凍睡眠艙、貨艙、氣閘 */
  b.row('cryopod', 8.6, 18.6, 5, 2.2, 0)
    .item('big_crate', 20.4, 20.8)
    .item('big_crate', 24, 20.8)
    .item('crate', 28.4, 22)
    .item('hatch', 29.6, 14.6)
    .item('decon_shower', 32.4, 15.6, 0, { size: [2, 2] })
    .item('locker', 37, 16, 90, { size: [3, 0.8] })
    .item('flesh', 40.6, 17.6, 0, { gm: true, size: [2, 1.8] })
    .item('cryopod', 38.4, 15, 0, { gm: true, size: [1.6, 3.4] });
  /* 艦橋：駕駛座、控制台、全像投影桌 */
  b.item('pilot_seat', 50.4, 6.6)
    .item('pilot_seat', 50.4, 15.6, 180)
    .item('console', 52.4, 7.2, 90, { size: [3.6, 1.4] })
    .item('console', 52.4, 12.8, 90, { size: [3.6, 1.4] })
    .item('holo_table', 46, 8.6);
  return [b.f];
}

/* ---------- 冒險者酒館（1F 酒場、廚房、馬廄；2F 客房與 GM 專用的密室） ---------- */

const tavernStairs = (b: FloorBuilder) => b.item('stairs', 11, 0.6);

export function tavern(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('廚房', 'kitchen', 0, 0, 10, 8)
    .room('樓梯', 'hall', 10, 0, 4, 8, { hideLabel: true })
    .room('倉庫', 'storage', 14, 0, 8, 8)
    .room('酒場', 'public', 0, 8, 22, 16)
    .room('馬廄', 'doma', 22, 0, 10, 16)
    .room('後院', 'dirt', 22, 16, 10, 8)
    .room('前庭', 'porch', 0, 24, 22, 4);
  tavernStairs(g);
  g.dh(9.5, 24, 3, -1, 0, 'door2')
    .dh(4, 8, 1.5, -1, 0)
    .dh(10.5, 8, 3, -1, 0, 'open')
    .dh(16, 8, 1.5, -1, 0)
    .dv(22, 10, 3, 1, 0, 'door2')
    .dh(24.5, 16, 5, 1, 0, 'big2')
    .wh(2, 24, 3)
    .wh(16, 24, 3)
    .wv(0, 12, 3)
    .wh(3, 0, 3);
  /* 酒場：吧台、桌子、告示板、壁爐 */
  g.item('counter', 14.6, 11, 90, { size: [6, 1.2] })
    .row('stool', 13.2, 11.4, 4, 0, 1.4)
    .item('cupboard', 21.1, 17, 90, { size: [3, 0.9] })
    .item('fireplace', 0.1, 17, 270)
    .item('quest_board', 5.6, 8.1, 0, { size: [4, 0.5] })
    .item('table_round', 3, 12.4)
    .item('table_round', 7.4, 12.4)
    .item('table_round', 4.4, 18.4)
    .item('table_round', 9.4, 17.4)
    .item('chair', 2, 12.8, 90)
    .item('chair', 5, 12.8, 270)
    .item('chair', 6.4, 12.8, 90)
    .item('chair', 9.4, 12.8, 270)
    .item('chair', 3.4, 18.8, 90)
    .item('chair', 6.4, 18.8, 270)
    .item('barrel', 19.6, 21.4);
  /* 廚房、倉庫、馬廄、後院 */
  g.item('stove', 0.2, 0.2)
    .item('cauldron', 3, 0.4)
    .item('table', 5.4, 3.4, 0, { size: [2.8, 1.4] })
    .item('cupboard', 0.1, 4.4, 270, { size: [2.6, 0.9] })
    .row('barrel', 14.4, 0.4, 5, 1.4, 0)
    .item('crate', 18.6, 2.4)
    .item('hay', 23, 0.4)
    .item('hay', 23, 2.2)
    .item('hay', 29.4, 0.4)
    .item('barrel', 30.4, 6)
    .item('well', 28.4, 19.4)
    .item('anvil', 23, 20.6);

  const u = new FloorBuilder('2F');
  u.room('客房 1', 'bedroom', 0, 0, 10, 8)
    .room('樓梯', 'hall', 10, 0, 4, 8, { hideLabel: true })
    .room('客房 2', 'bedroom', 14, 0, 8, 8)
    .room('走廊', 'hall', 0, 8, 22, 3, { hideLabel: true })
    .room('客房 3', 'bedroom', 0, 11, 8, 13)
    .room('客房 4', 'bedroom', 8, 11, 7, 13)
    .room('老闆的房間', 'bedroom', 15, 11, 7, 13)
    .room('密室', 'special', 22, 8, 6, 10, {
      gm: true,
      note: '走廊盡頭的牆是暗門。盜賊公會在這裡交換情報，地圖上標著下一個「目標」。',
    });
  tavernStairs(u);
  u.dh(10.5, 8, 3, -1, 0, 'open')
    .dh(6.5, 8, 1.5, -1, 0)
    .dh(18.5, 8, 1.5, -1, 1)
    .dh(4, 11, 1.5, 1, 0)
    .dh(11, 11, 1.5, 1, 0)
    .dh(18, 11, 1.5, 1, 0)
    .dv(22, 8.75, 1.5, 1, 0, 'secret')
    .wh(3, 0, 2)
    .wh(16, 0, 2)
    .wh(2, 24, 3)
    .wh(10, 24, 3)
    .wh(17, 24, 3);
  u.item('bed_single', 0.3, 0.2)
    .item('bed_single', 2.6, 0.2)
    .item('chest', 6.8, 0.2)
    .item('bed_single', 19.8, 0.2)
    .item('desk', 14.2, 0.2)
    .item('bed_single', 0.3, 19.8, 180)
    .item('chest', 5, 22.8, 180)
    .item('bed_single', 12.8, 19.8, 180)
    .item('bed_canopy', 18.6, 19.6, 180, { size: [3.2, 4.2] })
    .item('safe', 15.4, 22.6)
    .item('ritual_table', 23, 12, 0, { gm: true, size: [3, 1.6] })
    .item('chest', 26, 16.6, 0, { gm: true, size: [1.6, 1] })
    .item('papers', 24, 9.4, 0, { gm: true });
  return [g.f, u.f];
}

/* ---------- 魔法師之塔（1F 書庫與門廳、2F 研究室、3F 觀星台；召喚室是 GM 專用） ---------- */

const towerStairs = (b: FloorBuilder) => b.item('spiral', 15.5, 0.5);

export function wizardTower(): TplFloor[] {
  const s = { wall: 'stone' } as const;
  const g = new FloorBuilder('1F');
  g.room('書庫', 'public', 0, 0, 15, 8, s)
    .room('樓梯間', 'stone', 15, 0, 5, 8, { ...s, hideLabel: true })
    .room('門廳', 'stone', 0, 8, 20, 12, s);
  fillYard(g, -6, -4, 26, 26, '塔外的草地');
  towerStairs(g);
  g.dh(8.5, 20, 3, -1, 0, 'door2')
    .dh(16, 8, 3, -1, 0, 'open')
    .dh(6, 8, 1.5, -1, 0)
    .wv(0, 12, 2)
    .wv(20, 12, 2)
    .wh(4, 0, 2);
  g.row('bookshelf', 0.2, 0.1, 3, 3.2, 0)
    .item('bookshelf', 0.1, 3.6, 270, { size: [3, 0.8] })
    .item('desk', 11.4, 4.4, 180)
    .item('chair', 12.1, 3.3)
    .item('armor_stand', 1, 17.6)
    .item('armor_stand', 17.8, 17.6)
    .item('banner', 2, 8.2)
    .item('table', 8, 13, 0, { size: [4, 1.6] })
    .item('tree', -5, 20)
    .item('garden_rock', 22, 2);

  const u = new FloorBuilder('2F');
  u.room('寢室', 'bedroom', 0, 0, 15, 8, s)
    .room('樓梯間', 'stone', 15, 0, 5, 8, { ...s, hideLabel: true })
    .room('研究室', 'special', 0, 8, 20, 12, s);
  towerStairs(u);
  u.dh(16, 8, 3, -1, 0, 'open').dh(6, 8, 1.5, -1, 0).wv(0, 12, 2).wh(4, 20, 2).wh(14, 20, 2);
  u.item('bed_canopy', 0.3, 0.2)
    .item('wardrobe', 10.4, 0.1)
    .item('chest', 4, 6.6, 180)
    .item('cauldron', 2, 15.6)
    .item('ritual_table', 8, 12.6)
    .item('crystal_ball', 9, 13)
    .item('bookshelf', 19.1, 14, 90)
    .item('magic_circle', 13, 13.6, 0, { size: [4.4, 4.4] })
    .item('chest', 1, 9);

  const r = new FloorBuilder('3F');
  r.room('召喚室', 'special', 0, 0, 15, 8, {
    ...s,
    gm: true,
    note: '門上的封印是從裡面封的。魔法師最後一次被看見，就是走進這個房間。',
  })
    .room('樓梯間', 'stone', 15, 0, 5, 8, { ...s, hideLabel: true })
    .room('觀星台', 'rooftop', 0, 8, 20, 12);
  towerStairs(r);
  r.dh(16, 8, 3, -1, 0, 'open').dh(6, 8, 2, -1, 0, 'sealed').wh(3, 0, 2);
  r.item('pedestal', 9, 13, 0, { label: '星盤' })
    .item('crystal_ball', 4, 16)
    .item('bench', 1, 18.6, 180, { size: [3, 0.9] })
    .item('magic_circle', 4, 1.2, 0, { gm: true, size: [5, 5] })
    .item('candle', 1, 1, 0, { gm: true })
    .item('candle', 12, 1, 0, { gm: true })
    .item('monster', 11, 4.4, 0, { gm: true });
  return [g.f, u.f, r.f];
}
