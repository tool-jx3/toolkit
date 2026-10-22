/**
 * 住宅類範本（本站自己畫的平面圖）：套房、透天厝、山中小屋（2026-10 增補；洋館在 mansion.ts）。北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor, Unit } from './builder';

/* ---------- 套房（一房一廳，約 14 坪＋陽台） ---------- */

export function studio(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('玄關', 'hall', 0, 0, 3, 5)
    .room('浴室', 'wet', 3, 0, 4, 5)
    .room('廚房', 'kitchen', 7, 0, 11, 5)
    .room('客廳', 'living', 0, 5, 10, 8)
    .room('臥室', 'bedroom', 10, 5, 8, 8)
    .room('陽台', 'balcony', 0, 13, 18, 3);
  b.dv(0, 1.5, 1.5, -1, 1) // 大門（往外開）
    .dh(0, 5, 3, 1, 0, 'open')
    .dh(3.75, 5, 1.5, -1, 0) // 浴室
    .dh(7, 5, 3, 1, 0, 'open') // 開放式廚房
    .dv(10, 6, 1.5, 1, 0) // 臥室
    .dh(2, 13, 3, 1, 0, 'sliding2')
    .dh(14.5, 13, 3, 1, 1, 'sliding2')
    .wh(4.5, 0, 1.5)
    .wh(14, 0, 2.5)
    .wv(18, 1, 2.5)
    .wv(18, 7, 3)
    .wv(0, 8, 3);
  b.item('cabinet', 0.3, 0, 0, { size: [2.4, 0.7] })
    .item('toilet', 3.2, 0, 0)
    .item('washbasin', 5.2, 0, 0)
    .item('shower', 5.3, 3.1, 0, { size: [1.7, 1.7] })
    .item('fridge', 7.3, 0, 0)
    .item('kitchen', 9, 0, 0, { size: [4.6, 1.3] })
    .item('dining2', 13.5, 1.8, 90, { size: [2.2, 3] })
    .item('rug', 2, 7.6, 90)
    .item('sofa3', 0, 7.6, 270)
    .item('lowtable', 2.5, 8.7, 90)
    .item('tv', 9.1, 8.2, 90)
    .item('plant', 8.5, 11.5)
    .item('bed_double', 14, 7.6, 90)
    .item('nightstand', 17.1, 6.65, 90)
    .item('nightstand', 17.1, 10.45, 90)
    .item('wardrobe', 12.4, 5, 0)
    .item('desk', 10.2, 11.8, 180)
    .item('chair', 10.9, 10.8, 180)
    .item('washer', 16.3, 14.4)
    .item('plant', 0.4, 14.2);
  return [b.f];
}

/* ---------- 透天厝（三層，面寬 6 m） ---------- */

function townCore(b: FloorBuilder): void {
  /* 每層相同位置的樓梯（上下對齊） */
  b.room('樓梯間', 'hall', 0, 13, 4, 7).room('走道', 'hall', 4, 13, 2, 7, { hideLabel: true });
  b.dv(4, 16.5, 3, -1, 0, 'open');
  b.item('stairs', 0.6, 14, 180, { size: [2.4, 6] });
}

export function townhouse(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('前院', 'porch', 0, 0, 12, 4)
    .room('客廳', 'living', 0, 4, 12, 9)
    .room('孝親房', 'bedroom', 6, 13, 6, 7)
    .room('浴室', 'wet', 0, 20, 4, 7)
    .room('餐廳', 'kitchen', 6, 20, 6, 7)
    .room('廚房', 'kitchen', 0, 27, 12, 6)
    .room('後陽台', 'balcony', 0, 33, 12, 3);
  townCore(g);
  g.find('走道').h = 14;
  g.dh(4.5, 4, 3, 1, 0, 'door2') // 大門
    .dh(0.5, 13, 3, 1, 0, 'open')
    .dh(4, 13, 2, 1, 0, 'open')
    .dv(6, 14, 1.5, 1, 0) // 孝親房
    .dv(4, 21.5, 1.5, -1, 0) // 浴室
    .dv(6, 21, 3, 1, 0, 'open')
    .dh(4, 27, 2, 1, 0, 'open')
    .dh(7, 27, 3, 1, 0, 'open')
    .dh(6, 33, 1.5, 1, 0)
    .wh(0.75, 4, 3)
    .wh(8.25, 4, 3)
    .wv(12, 15, 2.5)
    .wv(12, 22, 2.5)
    .wv(12, 29, 2)
    .wv(0, 23.5, 1.5);
  g.item('plant', 0.3, 0.3)
    .item('plant', 10.5, 0.3)
    .item('rug', 2.2, 6.5, 90)
    .item('sofa3', 0, 6.4, 270)
    .item('lowtable', 2.6, 7.5, 90)
    .item('armchair', 4.2, 10.2, 0)
    .item('tv', 11.1, 7, 90)
    .item('cabinet', 9, 12, 180, { size: [2.5, 1] })
    .item('bed_single', 8, 15.6, 90)
    .item('nightstand', 11.1, 14.6, 90)
    .item('wardrobe', 8.6, 18.8, 180)
    .item('washbasin', 0, 21, 270)
    .item('toilet', 0, 25.4, 270)
    .item('bathtub', 2.2, 23.6, 0)
    .item('dining4', 7.5, 21.6)
    .item('cupboard', 11.1, 23.4, 90, { size: [2.8, 0.9] })
    .item('kitchen', 0.3, 31.7, 180)
    .item('fridge', 10.6, 27.3, 90)
    .item('counter', 7.8, 31.8, 180, { size: [3.8, 1.2] })
    .item('washer', 0.3, 34.4)
    .item('plant', 10.6, 34.4);

  const u = new FloorBuilder('2F');
  u.room('前陽台', 'balcony', 0, 1, 12, 3)
    .room('主臥室', 'bedroom', 0, 4, 8, 9)
    .room('更衣間', 'storage', 8, 4, 4, 4)
    .room('主臥浴室', 'wet', 8, 8, 4, 5)
    .room('臥室 A', 'bedroom', 6, 13, 6, 7)
    .room('浴室', 'wet', 0, 20, 4, 7)
    .room('臥室 B', 'bedroom', 6, 20, 6, 7)
    .room('書房', 'office', 0, 27, 6, 6)
    .room('儲藏室', 'storage', 6, 27, 6, 6);
  townCore(u);
  u.find('走道').h = 14;
  u.dh(4.25, 13, 1.5, -1, 0) // 主臥室
    .dv(8, 5.5, 1.5, 1, 0)
    .dv(8, 10, 1.5, 1, 0)
    .dh(2, 4, 3, -1, 0, 'sliding2')
    .dv(6, 14, 1.5, 1, 0)
    .dv(4, 21.5, 1.5, -1, 0)
    .dv(6, 21, 1.5, 1, 0)
    .dh(4.25, 27, 1.5, 1, 0)
    .dv(6, 29, 1.5, 1, 0)
    .wv(12, 15, 2.5)
    .wv(12, 22.5, 2.5)
    .wv(12, 9.5, 1.5)
    .wv(0, 29, 2.5)
    .wh(1.5, 33, 3)
    .wh(8, 33, 2)
    .wv(0, 23.5, 1.5);
  u.item('plant', 0.4, 1.5)
    .item('plant', 10.4, 1.5)
    .item('bed_double', 0, 6.6, 270)
    .item('nightstand', 0, 5.6, 270)
    .item('nightstand', 0, 9.5, 270)
    .item('dresser', 7.1, 7, 90)
    .item('armchair', 1.4, 10.9, 0)
    .item('wardrobe', 10.8, 4.5, 90)
    .item('shower', 10.2, 11.2, 0)
    .item('toilet', 10.4, 8.3, 90)
    .item('washbasin', 8.2, 11.9, 180)
    .item('bed_single', 8, 15.6, 90)
    .item('desk', 6.4, 18.8, 180)
    .item('washbasin', 0, 21, 270)
    .item('toilet', 0, 25.4, 270)
    .item('shower', 2.1, 25, 0)
    .item('bed_single', 8, 22.6, 90)
    .item('wardrobe', 8.6, 25.8, 180)
    .item('bookshelf', 0.6, 27, 0)
    .item('desk', 1.6, 31.8, 180)
    .item('chair', 2.3, 30.8, 180)
    .item('crate', 10, 31)
    .item('crate', 8.2, 31.2)
    .item('cabinet', 11, 27.6, 90, { size: [2.4, 1] });

  const t = new FloorBuilder('3F');
  t.room('前陽台', 'balcony', 0, 1, 12, 3)
    .room('神明廳', 'special', 0, 4, 12, 9)
    .room('儲藏室', 'storage', 6, 13, 6, 7)
    .room('頂樓露台', 'balcony', 0, 20, 12, 10);
  townCore(t);
  t.dh(4.25, 13, 1.5, -1, 0)
    .dv(6, 14, 1.5, 1, 0)
    .dh(4.25, 20, 1.5, 1, 0)
    .dh(4.5, 4, 3, -1, 0, 'door2')
    .wv(0, 7, 3)
    .wv(12, 7, 3)
    .wv(12, 15, 2);
  /* 供桌靠南牆、讓開走道進來的門（門的開門範圍與門前不放家具） */
  t.item('altar', 7.2, 11.4, 180)
    .item('candle', 6.2, 12)
    .item('candle', 10.4, 12)
    .item('lantern', 0.4, 4.4)
    .item('lantern', 10.4, 4.4)
    .item('rug', 6.7, 8.4, 0, { size: [4, 2.2] })
    .item('crate', 7, 17.8)
    .item('crate', 10, 14.2)
    .item('barrel', 8.8, 17.9)
    .item('tank', 8.8, 26.6)
    .item('plant', 0.5, 28.4)
    .item('plant', 2.2, 28.4);
  return [g.f, u.f, t.f];
}

/* ---------- 山中小屋（兩層的山莊，2026-10 增補） ---------- */

/** 2F 的客房（寬 9）：入口在走廊那一側，兩張單人床靠最裡面的牆、書桌在東邊 */
function lodgeRoom(
  b: FloorBuilder,
  x: number,
  y: number,
  depth: number,
  south: boolean,
  n: number,
) {
  const name = `客房 ${n}`;
  new Unit(b, x, y, depth, south)
    .room(name, 'bedroom', 0, 0, 9, depth)
    .dh(6, depth, 1.5, -1, 1)
    .wh(3, 0, 3)
    .item('bed_single', 0.3, 0.2, 0, 2, 4)
    .item('bed_single', 3.4, 0.2, 0, 2, 4)
    .item('nightstand', 2.35, 0.2, 0, 0.9, 0.9)
    .item('desk', 7.8, 0.5, 90, 1.2, 2.4)
    .item('chair', 6.7, 1.2, 270, 1, 1)
    .item('wardrobe', 0.6, depth - 1.3, 180, 3, 1.2);
  b.find(name).ly = south ? -1.6 : 1.6;
}

export function lodge(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('廚房', 'kitchen', 0, 0, 8, 8)
    .room('餐廳', 'kitchen', 8, 0, 10, 8, { lx: 2.8 })
    .room('客廳', 'living', 0, 8, 18, 12, {
      lx: 3,
      note: '壁爐的灰裡有一張沒燒完的遺囑。',
    })
    .room('玄關・樓梯', 'hall', 18, 0, 4, 20, { hideLabel: true })
    .room('浴室', 'wet', 22, 0, 6, 7)
    .room('管理員室', 'bedroom', 22, 7, 6, 7)
    .room('倉庫・柴房', 'storage', 22, 14, 6, 6)
    .room('露台', 'balcony', 0, 20, 28, 4);
  g.dh(18.5, 20, 1.5, -1, 0) // 大門
    .dh(4, 20, 3, 1, 0, 'sliding2')
    .dh(12, 24, 3, 1, 0, 'open') // 露台的台階
    .dv(18, 10, 3, 1, 0, 'open')
    .dv(8, 2, 3, 1, 0, 'open')
    .dh(10, 8, 4, 1, 0, 'open')
    .dv(0, 5.5, 1.5, 1, 1) // 廚房的後門
    .dv(22, 2.5, 1.5, 1, 0)
    .dv(22, 8, 1.5, 1, 0)
    .dv(22, 16, 1.5, 1, 0)
    .dv(28, 17, 1.5, 1, 0) // 柴房通到外面
    .wh(2.5, 0, 3)
    .wh(10.5, 0, 3)
    .wv(0, 9, 2)
    .wv(0, 16.5, 2)
    .wh(10, 20, 3)
    .wh(24, 0, 2)
    .wv(28, 9, 2);
  g.item('stairs', 18.2, 0.6, 0, { size: [2.4, 6] })
    .item('cabinet', 21.2, 18, 90, { size: [2, 0.8] })
    /* 廚房、餐廳 */
    .item('fridge', 0.2, 0.1)
    .item('kitchen', 1.8, 0.1)
    .item('table', 2, 5.6, 0, { size: [2.8, 1.6] })
    .item('dining6', 9.4, 1.8)
    .item('cupboard', 14.9, 0.1)
    /* 客廳：壁爐、沙發、書架 */
    .item('fireplace', 0.1, 12, 270)
    .item('rug', 2.5, 11.5, 0, { size: [5, 4] })
    .item('sofa3', 7, 11.3, 90)
    .item('armchair', 3, 9.4)
    .item('armchair', 3, 16, 180)
    .item('lowtable', 4.2, 12.4, 90)
    .item('lamp', 7.2, 16.2)
    .item('bookshelf', 1, 8.1)
    .item('bookshelf', 17.1, 14, 90)
    .item('table_round', 12.4, 16)
    .item('chair', 11.2, 16.4, 270)
    .item('chair', 14.4, 16.4, 90)
    /* 浴室、管理員室、倉庫・柴房 */
    .item('bathtub', 24.9, 0.2, 90)
    .item('toilet', 26.4, 5, 90)
    .item('washbasin', 23.6, 5.8, 180)
    .item('bed_single', 26, 7.2)
    .item('desk', 22.1, 10.8, 270)
    .item('chair', 23.4, 11.5, 90)
    .item('wardrobe', 24.6, 12.7, 180)
    .item('log', 24.6, 14.2)
    .item('log', 24.6, 15.1)
    .item('crate', 24.4, 18.2)
    .item('barrel', 22.3, 18.6)
    /* 露台 */
    .item('garden_bench', 8.5, 20.1)
    .item('plant', 0.4, 22.4)
    .item('plant', 26.4, 22.4);

  const u = new FloorBuilder('2F');
  u.room('走廊', 'hall', 0, 8, 18, 3, { hideLabel: true })
    .room('樓梯', 'hall', 18, 0, 4, 11, { hideLabel: true })
    .room('儲藏室', 'storage', 18, 11, 4, 9)
    .room('浴室', 'wet', 22, 0, 6, 7)
    .room('主人房', 'bedroom', 22, 7, 6, 13);
  lodgeRoom(u, 0, 0, 8, false, 1);
  lodgeRoom(u, 9, 0, 8, false, 2);
  lodgeRoom(u, 0, 11, 9, true, 3);
  lodgeRoom(u, 9, 11, 9, true, 4);
  u.dv(18, 8, 3, 1, 0, 'open')
    .dh(18.5, 11, 1.5, 1, 0)
    .dv(22, 2.5, 1.5, 1, 0)
    .dv(22, 9, 1.5, 1, 0)
    .wv(0, 8.75, 1.5)
    .wh(24, 0, 2)
    .wh(24.5, 20, 2.5)
    .wv(28, 8, 1.5);
  u.item('stairs', 18.2, 0.6, 0, { size: [2.4, 6] })
    .item('cabinet', 21, 13.5, 90)
    .item('crate', 19.8, 17.8)
    .item('shower', 26.2, 0.2)
    .item('toilet', 26.4, 5, 90)
    .item('washbasin', 23.4, 0.1)
    .item('bed_double', 24, 9.8, 90)
    .item('desk', 23, 18.7, 180)
    .item('chair', 23.7, 17.6)
    .item('bookshelf', 27.1, 14.5, 90);
  return [g.f, u.f];
}
