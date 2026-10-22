/**
 * 醫療・研究的範本（2026-10 第三批後半，本站自己畫的平面圖）：醫院別館（隔離病棟）、地下研究所、療養院。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 醫院別館（隔離病棟，1F、2F） ---------- */

const annexStairs = (b: FloorBuilder) => b.item('stairs', 27, 0.5);

/** 2F 的隔離病房（寬 w × 深 8）：病床靠最裡面的牆、點滴架；門在走廊那一側（鐵門，往房間裡開） */
function isolationRoom(b: FloorBuilder, name: string, x: number, south: boolean, w: number) {
  const y = south ? 12 : 0;
  b.room(name, 'medical', x, y, w, 8);
  if (south)
    b.dh(x + w - 2.5, 12, 1.5, 1, 1, 'steel')
      .wh(x + 1.5, 20, 2, 'barred')
      .item('hospital_bed', x + 0.6, y + 3.6, 180)
      .item('iv_stand', x + 3.2, y + 6.8)
      .item('nightstand', x + 3.2, y + 3.4);
  else
    b.dh(x + w - 2.5, 8, 1.5, -1, 1, 'steel')
      .wh(x + 1.5, 0, 2, 'barred')
      .item('hospital_bed', x + 0.6, y + 0.2)
      .item('iv_stand', x + 3.2, y + 0.5)
      .item('nightstand', x + 3.2, y + 3.7);
}

export function hospitalAnnex(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('連絡走廊', 'hall', 0, 8, 6, 4, { ly: -2.4 })
    .room('走廊', 'hall', 6, 8, 30, 4, { hideLabel: true })
    .room('護理站', 'medical', 6, 0, 8, 8)
    .room('診察室', 'medical', 14, 0, 6, 8)
    .room('處置室', 'medical', 20, 0, 6, 8)
    .room('樓梯間', 'hall', 26, 0, 4, 8, { hideLabel: true })
    .room('機房', 'garage', 30, 0, 6, 8)
    .room('病歷室', 'storage', 6, 12, 8, 8)
    .room('舊手術室', 'medical', 14, 12, 10, 8)
    .room('汙物室', 'storage', 24, 12, 6, 8)
    .room('遺體安置室', 'danger', 30, 12, 6, 8);
  annexStairs(g);
  g.dv(0, 8.5, 3, -1, 0, 'door2') // 往本館
    .dv(36, 9.25, 1.5, 1, 0, 'firedoor') // 緊急出口
    .dh(8, 8, 4, 1, 0, 'open')
    .dh(16, 8, 1.5, 1, 0, 'sliding')
    .dh(22, 8, 1.5, 1, 0, 'sliding')
    .dh(26.5, 8, 3, 1, 0, 'open')
    .dh(32, 8, 1.5, 1, 0, 'steel')
    .dh(8, 12, 1.5, -1, 0)
    .dh(17, 12, 3, -1, 0, 'door2')
    .dh(25.5, 12, 1.5, -1, 0)
    .dh(32, 12, 1.5, -1, 0, 'steel')
    .wh(9, 0, 3)
    .wh(16, 0, 2)
    .wh(21.5, 0, 2)
    .wh(9, 20, 3)
    .wh(19, 20, 3)
    .wv(36, 2, 2);
  /* 護理站、診察室、處置室、機房 */
  g.item('reception', 7.5, 5.2, 180)
    .item('office_desk', 6.3, 0.2)
    .item('chair', 7, 1.7)
    .item('med_cabinet', 13, 1, 90)
    .item('exam_bed', 18.4, 0.2)
    .item('desk', 14.1, 0.5, 270)
    .item('chair', 15.4, 1.2, 90)
    .item('med_cabinet', 20.5, 0.1)
    .item('iv_stand', 24.6, 0.5)
    .item('exam_bed', 23.6, 1.6)
    .item('wheelchair', 20.4, 4.6)
    .item('boiler', 30.4, 0.2)
    .item('dist_board', 35.3, 1, 90)
    .item('pump', 33.6, 3.6);
  /* 病歷室、舊手術室、汙物室、遺體安置室 */
  g.item('bookstack', 8.5, 15)
    .item('bookstack', 8.5, 17.6)
    .item('filing', 6.1, 14, 270)
    .item('filing', 6.1, 15.3, 270)
    .item('op_table', 17.5, 14.4)
    .item('iv_stand', 15.4, 15)
    .item('med_cabinet', 23, 13.5, 90)
    .item('lamp', 21.6, 18.6)
    .item('sink', 25, 18.6, 180)
    .item('drum', 28.6, 13.4)
    .item('hand_cart', 28.4, 15.4, 0, { size: [1.2, 1.8] })
    .item('morgue', 33.5, 14.5, 90)
    .item('exam_bed', 30.5, 16);
  g.find('遺體安置室').note = '登記簿上這個月送進來三具，冷藏櫃裡只有兩具。';

  const u = new FloorBuilder('2F');
  u.room('走廊', 'hall', 6, 8, 30, 4, { hideLabel: true })
    .room('樓梯間', 'hall', 26, 0, 4, 8, { hideLabel: true })
    .room('觀察室', 'office', 30, 0, 6, 8)
    .room('值班室', 'bedroom', 28, 12, 8, 8)
    .room('特別病房', 'danger', 20, 12, 8, 8, {
      gm: true,
      note: '門被焊死了，只留一個送餐口。病歷上寫「轉院」，可是送餐的紀錄一直到上個月。',
    });
  isolationRoom(u, '隔離病房 1', 6, false, 7);
  isolationRoom(u, '隔離病房 2', 13, false, 7);
  isolationRoom(u, '隔離病房 3', 20, false, 6);
  isolationRoom(u, '隔離病房 4', 6, true, 7);
  isolationRoom(u, '隔離病房 5', 13, true, 7);
  annexStairs(u);
  u.dh(26.5, 8, 3, 1, 0, 'open')
    .dh(32, 8, 1.5, -1, 0)
    .dh(29, 12, 1.5, 1, 0)
    .dh(21, 12, 2, 1, 0, 'sealed')
    .wv(36, 2, 2)
    .wv(36, 14, 2)
    .wv(6, 9, 2);
  u.item('console', 30.5, 0.2)
    .item('chair', 31.6, 1.8)
    .item('monitor_wall', 35.3, 1, 90)
    .item('bed_single', 31.9, 17.9, 90)
    .item('locker', 35, 13, 90)
    .item('desk', 28.4, 18.7, 180)
    .item('hospital_bed', 24.6, 15.4, 0, { gm: true })
    .item('chains', 20.6, 19.2, 180, { gm: true })
    .item('wall_claws', 23.8, 19.6, 0, { gm: true })
    .item('black_stain', 21, 14.4, 0, { gm: true, size: [2.4, 2] });
  return [g.f, u.f];
}

/* ---------- 地下研究所（1F 製藥公司、B1 研究區、B2 GM 專用的收容區） ---------- */

/** 三層同一個位置的樓梯與電梯 */
function labCore(b: FloorBuilder, extra: { gm?: boolean } = {}): void {
  b.room('樓梯・電梯', 'hall', 14, 0, 8, 8, { hideLabel: true, ...extra });
  b.item('stairs', 14.5, 0.5).item('elevator', 17.5, 0.5);
}

export function lab(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('辦公室', 'office', 0, 0, 14, 8)
    .room('會議室', 'office', 22, 0, 8, 8)
    .room('警衛室', 'office', 0, 8, 8, 12)
    .room('大廳・接待', 'public', 8, 8, 14, 12)
    .room('產品展示室', 'public', 22, 8, 8, 12)
    .room('前廣場', 'porch', 0, 20, 30, 4);
  labCore(g);
  g.dh(13.5, 20, 3, -1, 0, 'auto')
    .dv(8, 16, 1.5, -1, 0)
    .dh(10, 8, 1.5, -1, 0)
    .dh(16, 8, 4, -1, 0, 'open')
    .dv(22, 12, 3, 1, 0, 'open')
    .dh(25, 8, 1.5, -1, 0)
    .dh(2, 20, 1.5, -1, 0) // 警衛室通到外面
    .wv(8, 10, 2)
    .wh(2, 0, 3)
    .wh(8, 0, 3)
    .wh(24, 0, 3)
    .wh(9.5, 20, 3, 'window2')
    .wh(17.5, 20, 3, 'window2')
    .wh(24.5, 20, 3, 'window2')
    .wv(30, 12, 3);
  /* 辦公室、會議室 */
  g.item('desk_island', 2, 1.6)
    .item('copier', 12.4, 0.2)
    .item('filing', 8, 0.2)
    .item('filing', 9.1, 0.2)
    .item('meeting6', 23.6, 2)
    .item('whiteboard', 29.5, 2.4, 90);
  /* 警衛室、大廳、展示室 */
  g.item('monitor_wall', 0.1, 10.4, 270, { size: [4, 0.6] })
    .item('desk', 1, 10.6, 270)
    .item('chair', 2.3, 11.3, 90)
    .item('locker', 4.4, 8.1)
    .item('card_reader', 21.2, 7.6)
    .item('reception', 11, 14.2)
    .item('chair', 12.4, 13)
    .item('sofa2', 18.6, 15.4, 90)
    .item('plant', 8.4, 18.4)
    .item('plant', 20.4, 18.4)
    .item('display_case', 26.6, 9.2)
    .item('display_case', 26.6, 13.2)
    .item('pedestal', 23, 16.4);

  const b1 = new FloorBuilder('B1');
  b1.room('監控室', 'office', 0, 0, 8, 8)
    .room('主任室', 'office', 8, 0, 6, 8)
    .room('低溫保存室', 'storage', 22, 0, 8, 8)
    .room('走廊', 'hall', 0, 8, 30, 3, { hideLabel: true })
    .room('實驗室', 'medical', 0, 11, 12, 9)
    .room('除汙室', 'wet', 12, 11, 8, 3, { hideLabel: true })
    .room('無菌室', 'medical', 12, 14, 8, 6)
    .room('動物實驗室', 'danger', 20, 11, 10, 9);
  labCore(b1);
  b1.dh(3, 8, 1.5, -1, 0)
    .dh(10, 8, 1.5, -1, 0)
    .dh(16, 8, 4, -1, 0, 'open')
    .dh(25, 8, 1.5, -1, 0, 'steel')
    .dh(5, 11, 1.5, 1, 0)
    .dh(15, 11, 1.5, 1, 0, 'sliding')
    .dh(15, 14, 1.5, 1, 0, 'sliding')
    .dh(24, 11, 1.5, 1, 0, 'steel');
  b1.item('monitor_wall', 0.5, 0.1)
    .item('console', 2, 1.2)
    .item('chair', 3.3, 2.8)
    .item('office_desk', 9, 0.3)
    .item('chair', 9.7, 1.8)
    .item('bookshelf', 13.1, 2, 90)
    .item('safe', 8.3, 5.8)
    .row('freezer', 22.3, 0.2, 4, 1.8, 0)
    .item('tank', 27, 4.6)
    .item('lab_bench', 1, 14.5)
    .item('lab_bench', 6.5, 14.5)
    .item('fume_hood', 1, 18.7, 180)
    .item('microscope', 8, 12.2)
    .item('sink', 10.7, 17, 90)
    .item('decon_shower', 12.3, 11.4, 0, { size: [2, 2.4] })
    .item('lab_bench', 13, 18.3, 180)
    .item('pod', 17.5, 15)
    .item('cage', 20.4, 16.6)
    .item('cage', 23.6, 16.6)
    .item('cage', 26.8, 16.6, 0, { size: [3, 3] })
    .item('lab_bench', 28.3, 11.5, 90)
    .item('blood', 21, 12.6);

  const b2 = new FloorBuilder('B2');
  const gm = { gm: true };
  b2.room('焚化室', 'garage', 0, 0, 14, 8, gm)
    .room('紀錄室', 'office', 22, 0, 8, 8, gm)
    .room('觀察走廊', 'hall', 0, 8, 30, 4, { hideLabel: true, ...gm })
    .room('收容室 A', 'danger', 0, 12, 10, 8, { noWall: true, ...gm })
    .room('收容室 B', 'danger', 10, 12, 10, 8, { noWall: true, ...gm })
    .room('收容室 C', 'danger', 20, 12, 10, 8, { noWall: true, ...gm });
  labCore(b2, gm);
  b2.find('收容室 B').note =
    '電梯要用 B1 低溫保存室的鑰匙卡才下得來。三間收容室的玻璃都是從裡面被敲裂的。';
  /* 收容室「不產生牆」：觀察用的玻璃牆、彼此之間的隔間自己畫 */
  b2.wall(0, 12, 30, 12, 'glass').wall(10, 12, 10, 20).wall(20, 12, 20, 20);
  b2.dh(5, 8, 1.5, -1, 0)
    .dh(16, 8, 4, -1, 0, 'open')
    .dh(25, 8, 1.5, -1, 0)
    .dh(4, 12, 2, 1, 0, 'sealed')
    .dh(14, 12, 2, 1, 0, 'sealed')
    .dh(24, 12, 2, 1, 0, 'sealed');
  b2.item('big_tank', 0.5, 0.5, 0, { gm: true, size: [4, 4] })
    .item('boiler', 8, 0.2, 0, gm)
    .item('filing', 22.2, 0.2, 0, gm)
    .item('filing', 23.3, 0.2, 0, gm)
    .item('desk', 27.3, 2, 90, gm)
    .item('chains', 0.2, 18.8, 180, gm)
    .item('npc_bound', 6.6, 16.4, 0, gm)
    .item('flesh', 13, 16, 0, gm)
    .item('pod', 26.4, 16.6, 0, gm)
    .item('crack_wall', 16.6, 11.6, 0, gm)
    .item('crack_wall', 26.5, 11.6, 0, gm);
  return [b2.f, b1.f, g.f];
}

/* ---------- 療養院（1F 病棟與交誼廳、B1 水療室與 GM 專用的特別治療室） ---------- */

const asylumStairs = (b: FloorBuilder) => b.item('stairs', 19, 0.5);

export function asylum(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('院長室', 'office', 0, 0, 8, 8)
    .room('診療室', 'medical', 8, 0, 6, 8)
    .room('藥局', 'storage', 14, 0, 4, 8)
    .room('樓梯間', 'hall', 18, 0, 4, 8, { hideLabel: true })
    .room('護理站', 'medical', 22, 0, 6, 8)
    .room('浴室', 'wet', 28, 0, 6, 8)
    .room('廚房', 'kitchen', 34, 0, 10, 8)
    .room('中走廊', 'hall', 0, 8, 44, 3, { hideLabel: true })
    .room('交誼廳', 'living', 0, 11, 12, 8)
    .room('餐廳', 'kitchen', 12, 11, 6, 8)
    .room('大廳', 'public', 18, 11, 8, 8)
    .room('病房 1', 'bedroom', 26, 11, 6, 8)
    .room('病房 2', 'bedroom', 32, 11, 6, 8)
    .room('隔離室', 'danger', 38, 11, 6, 8)
    .room('門廊', 'porch', 18, 19, 8, 3);
  fillYard(g, -2, -2, 46, 26, '前庭');
  asylumStairs(g);
  g.dh(20.5, 19, 3, -1, 0, 'door2') // 大門
    .dh(19, 11, 6, -1, 0, 'open')
    .dh(2, 8, 1.5, -1, 0)
    .dh(10, 8, 1.5, -1, 0)
    .dh(15, 8, 1.5, -1, 0, 'locked')
    .dh(18.5, 8, 3, -1, 0, 'open')
    .dh(23, 8, 3, -1, 0, 'open')
    .dh(30, 8, 1.5, -1, 0)
    .dh(37, 8, 1.5, -1, 0)
    .dh(4, 11, 3, 1, 0, 'door2')
    .dh(14.5, 11, 1.5, 1, 0)
    .dh(29.75, 11, 1.5, 1, 0, 'steel')
    .dh(35.75, 11, 1.5, 1, 0, 'steel')
    .dh(39.75, 11, 1.5, 1, 0, 'locked')
    .dv(44, 8.75, 1.5, 1, 0) // 走廊東端的出口
    .wh(2, 0, 3)
    .wh(10, 0, 2)
    .wh(30, 0, 2)
    .wh(37, 0, 3)
    .wh(2, 19, 3)
    .wh(7, 19, 3)
    .wh(14, 19, 2)
    .wh(28, 19, 2, 'barred')
    .wh(34, 19, 2, 'barred')
    .wv(0, 13, 3);
  /* 院長室、診療室、藥局、護理站、浴室、廚房 */
  g.item('office_desk', 1, 0.3)
    .item('chair', 1.7, 1.8)
    .item('bookshelf', 7.1, 3, 90)
    .item('filing', 0.1, 4.6, 270)
    .item('exam_bed', 12.4, 0.2)
    .item('desk', 8.1, 0.4, 270)
    .item('chair', 9.4, 1.1, 90)
    .item('med_cabinet', 17, 1, 90)
    .item('reception', 22.3, 3, 0, { size: [4, 1.2] })
    .item('chair', 23.6, 1.4)
    .item('bathtub', 28.3, 0.2, 0, { size: [1.6, 3.4] })
    .item('bathtub', 32.1, 0.2, 0, { size: [1.6, 3.4] })
    .item('toilet', 30.5, 4.2, 180)
    .item('kitchen', 34.3, 0.1)
    .item('stove', 39.6, 0.1)
    .item('island', 39.5, 3.4)
    .item('fridge', 42.5, 6.2, 90);
  /* 交誼廳、餐廳、大廳、病房、隔離室 */
  g.item('piano_up', 0.1, 14.5, 270)
    .item('armchair', 4, 14)
    .item('armchair', 7, 14)
    .item('table_round', 5.4, 16.4)
    .item('bookshelf', 9, 18, 180)
    .item('dining6', 12.8, 13.4, 90, { size: [3.4, 4.4] })
    .item('bench', 18.1, 13.6, 270, { size: [3, 0.9] })
    .item('bench', 25, 13.6, 90, { size: [3, 0.9] })
    .item('bed_single', 26.2, 14.8, 270)
    .item('bed_single', 32.2, 14.8, 270)
    .item('nightstand', 26.2, 18, 270)
    .item('nightstand', 32.2, 18, 270)
    .item('chains', 43.3, 14.5, 90, { size: [2.4, 0.6] })
    .item('futon', 40.2, 14.6, 0, { size: [2, 3.6] });
  g.find('隔離室').note = '四面牆都包著軟墊。軟墊的縫裡塞著寫滿字的紙片，字跡和院長的一模一樣。';
  g.item('tree', 1, 21.4).item('tree', 40, 21.4).item('garden_bench', 30, 22.4, 180);

  const bm = new FloorBuilder('B1');
  bm.room('水療室', 'wet', 10, 0, 8, 8)
    .room('樓梯下', 'hall', 18, 0, 4, 8, { hideLabel: true })
    .room('電療室', 'medical', 22, 0, 8, 8)
    .room('地下走廊', 'hall', 10, 8, 20, 3, { hideLabel: true })
    .room('舊病歷庫', 'storage', 10, 11, 10, 6)
    .room('特別治療室', 'danger', 20, 11, 10, 6, {
      gm: true,
      note: '病歷庫的櫃子後面。院長在這裡做的「治療」沒有寫進任何紀錄。',
    });
  asylumStairs(bm);
  bm.dh(14, 8, 1.5, -1, 0)
    .dh(18.5, 8, 3, -1, 0, 'open')
    .dh(25, 8, 1.5, -1, 0, 'steel')
    .dh(12, 11, 1.5, 1, 0)
    .dv(20, 14, 1.5, 1, 0, 'secret');
  bm.item('bathtub', 10.3, 0.2, 0, { size: [2, 4] })
    .item('bathtub', 13.3, 0.2, 0, { size: [2, 4] })
    .item('chains', 16.6, 0.4, 90, { size: [2.4, 0.6] })
    .item('exam_bed', 23, 0.4)
    .item('control_panel', 26, 0.1)
    .item('generator', 27.8, 3)
    .item('filing', 10.1, 13, 270)
    .item('filing', 10.1, 14.3, 270)
    .item('bookstack', 13.5, 13.5)
    .item('op_table', 24, 11.6, 0, { gm: true })
    .item('chains', 28.6, 12, 90, { gm: true, size: [3, 0.6] })
    .item('candle', 21, 15.4, 0, { gm: true })
    .item('wall_blood', 25.5, 16.6, 0, { gm: true });
  return [bm.f, g.f];
}
