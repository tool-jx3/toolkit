/**
 * 奇幻・科幻的範本（2026-10 第三批後半，本站自己畫的平面圖）：冒險者酒館、魔法師之塔（地下迷宮、太空船在 dungeon.ts、spaceship.ts）。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

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
