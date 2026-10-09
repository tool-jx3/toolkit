/**
 * 住宅類範本（本站自己畫的平面圖）：套房、透天厝、洋館。北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor } from './builder';

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

/* ---------- 洋館（地下室、1F、2F，左右對稱） ---------- */

export function mansion(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('書房', 'office', 0, 0, 8, 9)
    .room('圖書室', 'public', 8, 0, 6, 9)
    .room('宴會廳', 'public', 14, 0, 12, 9)
    .room('廚房', 'kitchen', 26, 0, 8, 9)
    .room('後樓梯', 'hall', 34, 0, 6, 4)
    .room('傭人房', 'bedroom', 34, 4, 6, 5)
    .room('西走廊', 'hall', 0, 9, 14, 3, { hideLabel: true })
    .room('東走廊', 'hall', 26, 9, 14, 3, { hideLabel: true })
    .room('會客室', 'living', 0, 12, 14, 10)
    .room('大廳', 'hall', 14, 9, 12, 13)
    .room('餐廳', 'kitchen', 26, 12, 14, 10)
    .room('門廊', 'porch', 16, 22, 8, 3);
  g.dh(18.5, 22, 3, -1, 0, 'door2') // 正門
    .dh(18.5, 9, 3, -1, 0, 'door2')
    .dv(14, 9.75, 1.5, -1, 1)
    .dv(26, 9.75, 1.5, 1, 1)
    .dv(14, 16.5, 3, -1, 0, 'door2')
    .dv(26, 16.5, 3, 1, 0, 'door2')
    .dh(3, 9, 1.5, -1, 0)
    .dh(10, 9, 1.5, -1, 0)
    .dh(5, 12, 1.5, 1, 0)
    .dh(29, 9, 1.5, -1, 0)
    .dh(30, 12, 1.5, 1, 0)
    .dh(36, 9, 1.5, -1, 1)
    .dv(34, 1.5, 1.5, 1, 0)
    .dv(40, 9.75, 1.5, 1, 0) // 後門
    .wh(2, 0, 3)
    .wh(9.5, 0, 3)
    .wh(15.5, 0, 3)
    .wh(21.5, 0, 3)
    .wh(28, 0, 3)
    .wv(0, 3, 3)
    .wv(0, 14, 3)
    .wv(0, 18, 3)
    .wv(40, 4.75, 1.5)
    .wv(40, 14, 3)
    .wv(40, 18, 3)
    .wh(3, 22, 3)
    .wh(9, 22, 3)
    .wh(28, 22, 3)
    .wh(34.5, 22, 3)
    .wh(15, 22, 1.5)
    .wh(23.5, 22, 1.5);
  g.item('office_desk', 2.8, 3.2)
    .item('chair', 3.5, 4.7, 180)
    .item('bookshelf', 7.2, 0.6, 90)
    .item('armchair', 0, 6.6, 270)
    .item('safe', 6.5, 7.5)
    .item('bookstack', 9, 2.4)
    .item('bookstack', 9, 5.4)
    .item('fireplace', 18.5, 0)
    .item('rug', 16.8, 1.4, 0, { size: [6.4, 4.4] })
    .item('lowtable', 18.9, 1.9)
    .item('sofa3', 17.8, 3.4, 180)
    .item('armchair', 15, 1.6, 90)
    .item('piano', 22.6, 4.6)
    .item('kitchen', 26.2, 0)
    .item('stove', 31.3, 0)
    .item('island', 28, 3.6)
    .item('fridge', 32.5, 7.6, 180)
    .item('stairs', 35.5, 0.6, 90, { size: [2.4, 4.2] })
    .item('bed_single', 36, 4.2, 90, { size: [2, 4] })
    .item('rug', 17.5, 13, 0, { size: [5, 6] })
    .item('stairs', 14.4, 12.2, 0, { size: [2.4, 4] })
    .item('stairs', 23.2, 12.2, 0, { size: [2.4, 4] })
    .item('plant', 14.4, 20.4)
    .item('plant', 24.4, 20.4)
    .item('sofa3', 7, 12, 0)
    .item('lowtable', 8.1, 14.3)
    .item('armchair', 5, 14.1, 90)
    .item('armchair', 11.6, 14.1, 270)
    .item('rug', 5.6, 13.6, 0, { size: [7.6, 4.2] })
    .item('fireplace', 6.3, 20.8, 180)
    .item('piano_up', 1, 12, 0)
    .item('dining6', 28.8, 14.5)
    .item('dining6', 33.6, 14.5)
    .item('cupboard', 31.2, 21.1, 180, { size: [2.8, 0.9] })
    .item('plant', 16.3, 22.6)
    .item('plant', 22.5, 22.6);
  g.find('傭人房').note = '女傭說：夜裡常聽到主人房傳來低語。';

  const u = new FloorBuilder('2F');
  u.room('客房 1', 'bedroom', 0, 0, 7, 9)
    .room('客房 2', 'bedroom', 7, 0, 7, 9)
    .room('主臥室', 'bedroom', 14, 0, 8, 9)
    .room('主臥浴室', 'wet', 22, 0, 4, 9)
    .room('兒童房', 'bedroom', 26, 0, 8, 9)
    .room('浴室', 'wet', 34, 0, 6, 5)
    .room('更衣室', 'storage', 34, 5, 6, 4)
    .room('西走廊', 'hall', 0, 9, 14, 3, { hideLabel: true })
    .room('東走廊', 'hall', 26, 9, 14, 3, { hideLabel: true })
    .room('迴廊', 'hall', 14, 9, 12, 13)
    .room('客房 3', 'bedroom', 0, 12, 10, 10)
    .room('浴室 2', 'wet', 10, 12, 4, 5)
    .room('書庫', 'storage', 10, 17, 4, 5)
    .room('音樂室', 'public', 26, 12, 14, 10)
    .room('陽台', 'balcony', 16, 22, 8, 3);
  u.dv(14, 9, 3, 1, 0, 'open')
    .dv(26, 9, 3, 1, 0, 'open')
    .dh(2.5, 9, 1.5, -1, 0)
    .dh(9.5, 9, 1.5, -1, 0)
    .dh(6, 12, 1.5, 1, 0)
    .dh(11.2, 12, 1.5, 1, 0)
    .dv(14, 17.5, 1.5, -1, 1)
    .dh(15.5, 9, 1.5, -1, 0)
    .dv(22, 3, 1.5, 1, 0)
    .dh(29, 9, 1.5, -1, 0)
    .dh(36, 9, 1.5, -1, 0)
    .dh(36, 5, 1.5, -1, 0)
    .dh(31, 12, 1.5, 1, 0)
    .dh(18.5, 22, 3, 1, 0, 'sliding2')
    .wh(2.5, 0, 3)
    .wh(9.5, 0, 3)
    .wh(16.5, 0, 3)
    .wh(23.25, 0, 1.5)
    .wh(28.5, 0, 3)
    .wh(36.5, 0, 2)
    .wv(0, 3, 3)
    .wv(0, 14, 3)
    .wv(0, 18, 3)
    .wv(40, 6, 2)
    .wv(40, 13, 3)
    .wh(2, 22, 3)
    .wh(31, 22, 3)
    .wh(36, 22, 3);
  u.item('bed_single', 0, 0.6, 270)
    .item('nightstand', 0, 2.75, 270)
    .item('wardrobe', 5.8, 4.4, 90)
    .item('desk', 0, 7.8, 180)
    .item('bed_single', 7, 0.6, 270)
    .item('nightstand', 7, 2.75, 270)
    .item('wardrobe', 12.8, 4.4, 90)
    .item('desk', 7, 7.8, 180)
    .item('bed_double', 15.8, 0.2, 0)
    .item('nightstand', 14.8, 0.2)
    .item('nightstand', 18.7, 0.2)
    .item('dresser', 14, 5, 270)
    .item('armchair', 19.8, 5.4)
    .item('bathtub', 24.2, 0.4)
    .item('toilet', 22, 6.6, 270)
    .item('washbasin', 24.9, 5.2, 90)
    .item('bed_single', 30, 0.4, 90)
    .item('desk', 26.3, 0, 0)
    .item('rug', 27.4, 3.8, 0, { size: [4, 3] })
    .item('bookshelf', 31, 8.2, 180)
    .item('bathtub', 34.8, 0.3, 90)
    .item('washbasin', 38.9, 2.6, 90)
    .item('toilet', 38.4, 0, 0)
    .item('wardrobe', 38.8, 5.5, 90, { size: [3.2, 1.2] })
    .item('stairs', 14.4, 12.2, 0, { size: [2.4, 4] })
    .item('stairs', 23.2, 12.2, 0, { size: [2.4, 4] })
    .item('plant', 14.4, 20.4)
    .item('plant', 24.4, 20.4)
    .item('bed_double', 6, 13.8, 90)
    .item('nightstand', 9.1, 12.8, 90)
    .item('nightstand', 9.1, 16.8, 90)
    .item('desk', 1.6, 20.8, 180)
    .item('armchair', 1, 12.6, 0)
    .item('bathtub', 10.2, 13.6, 90, { size: [1.5, 2.6] })
    .item('toilet', 12.5, 15.4, 90, { size: [1, 1.4] })
    .item('bookshelf', 10.3, 21.2, 180, { size: [3.4, 0.8] })
    .item('crate', 10.4, 18.4)
    .item('piano', 33.5, 14.5)
    .item('armchair', 28, 18.8)
    .item('armchair', 30.4, 18.8)
    .item('table_round', 28.9, 16.6, 0, { size: [1.4, 1.4] })
    .item('bookshelf', 39.2, 16.5, 90)
    .item('plant', 16.4, 23.2)
    .item('plant', 22.4, 23.2);
  u.find('書庫').note = '前任主人的日記：提到地下室有一間密室（圖書館檢定）。';

  const bm = new FloorBuilder('B1');
  bm.room('後樓梯', 'hall', 34, 0, 6, 4)
    .room('地下通道', 'hall', 34, 4, 6, 8)
    .room('酒窖', 'storage', 24, 0, 10, 10)
    .room('鍋爐室', 'garage', 34, 12, 6, 6)
    .room('密室', 'special', 14, 1, 10, 9, {
      gm: true,
      note: '酒窖最裡面的酒架後面有暗門。',
    });
  bm.dh(36, 4, 1.5, 1, 0)
    .dv(34, 6, 1.5, -1, 0)
    .dh(36.5, 12, 1.5, 1, 0)
    .dv(24, 4.5, 1.5, -1, 0, 'secret');
  bm.item('stairs', 35.5, 0.6, 90, { size: [2.4, 4.2] })
    .item('bookshelf', 24.2, 0, 0, { size: [7.4, 0.9] })
    .item('bookshelf', 26.5, 3.2, 0, { size: [6, 0.9] })
    .item('bookshelf', 26.5, 5.6, 0, { size: [6, 0.9] })
    .item('barrel', 31.8, 8.4)
    .item('barrel', 30.4, 8.6)
    .item('table', 25.4, 8, 0, { size: [2.4, 1.2] })
    .item('crate', 38.2, 8.2)
    .item('crate', 38.2, 10.1)
    .item('tank', 34.1, 12.4)
    .item('rack', 38.4, 15.4, 90, { size: [1.4, 1.6] })
    .item('magic_circle', 16.5, 3.5, 0, { gm: true })
    .item('altar', 17.5, 1, 0, { gm: true })
    .item('candle', 15.3, 1.4, 0, { gm: true })
    .item('candle', 21.9, 1.4, 0, { gm: true })
    .item('bookshelf', 14.2, 9.1, 180, { size: [4, 0.9], gm: true })
    .item('safe', 22.4, 8.6, 0, { gm: true })
    .item('cage', 14.4, 4.4, 0, { size: [1.8, 2.4], gm: true });
  return [bm.f, g.f, u.f];
}
