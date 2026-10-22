/**
 * 商店・辦公的範本（2026-10 第三批後半，本站自己畫的平面圖）：辦公大樓、便利商店、偵探事務所、老街、夜市。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, Frame, type TplFloor } from './builder';

/* ---------- 辦公大樓（1F 大廳、8F 辦公樓層、屋頂） ---------- */

/** 每層同一個位置的核心：折返樓梯與電梯 */
function officeCore(b: FloorBuilder, name = '樓梯・電梯'): void {
  b.room(name, 'hall', 14, 0, 10, 10, { hideLabel: name === '樓梯・電梯' });
  b.item('stairs_u', 14.5, 0.5);
}

export function office(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('收發室', 'office', 0, 0, 14, 10)
    .room('廁所', 'wet', 24, 0, 4, 10)
    .room('機房', 'garage', 28, 0, 8, 10)
    .room('警衛室', 'office', 0, 10, 8, 14)
    .room('大廳', 'public', 8, 10, 20, 14)
    .room('咖啡店', 'public', 28, 10, 8, 14)
    .room('前廣場', 'porch', 0, 24, 36, 5);
  officeCore(g);
  g.item('elevator', 19.5, 0.5);
  g.dh(16, 24, 4, -1, 0, 'revolve')
    .dh(21, 24, 3, -1, 0, 'auto')
    .dh(15, 10, 8, 1, 0, 'open')
    .dh(25.25, 10, 1.5, -1, 0)
    .dv(36, 4, 1.5, 1, 0, 'steel')
    .dh(10, 10, 1.5, -1, 0)
    .dv(8, 12, 1.5, -1, 0)
    .dv(28, 20, 3, 1, 0, 'open')
    .dh(31, 24, 1.5, -1, 0)
    .wv(8, 16, 3)
    .wh(2, 0, 3)
    .wh(8, 0, 3)
    .wh(10, 24, 4.5, 'window2')
    .wv(0, 14, 3)
    .wh(29, 24, 1.5, 'window')
    .wv(36, 14, 3.5, 'window2')
    .wv(36, 18, 3.5, 'window2');
  g.item('cabinet', 0.2, 0.1)
    .item('table', 4, 4, 0, { size: [4, 1.6] })
    .item('cardboard', 9.4, 0.4)
    .item('cardboard', 10.8, 0.4)
    .item('locker', 13, 3, 90)
    .item('toilet', 24.4, 0.1)
    .item('toilet', 26.4, 0.1)
    .item('washbasin', 24.1, 6.6, 270, { size: [1.2, 1] })
    .item('boiler', 28.4, 0.2)
    .item('dist_board', 32.6, 0.1)
    .item('pump', 29, 6.6)
    .item('monitor_wall', 0.1, 16.4, 270, { size: [4, 0.6] })
    .item('desk', 1.2, 16.8, 270)
    .item('chair', 2.5, 17.5, 90)
    .item('locker', 3.6, 22.9, 180)
    .item('reception', 11, 15)
    .item('chair', 12.4, 13.8)
    .item('card_reader', 14.4, 10.4)
    .item('sofa3', 23, 17, 90)
    .item('lowtable', 21.4, 18.1, 90)
    .item('plant', 8.4, 22.4)
    .item('plant', 24.6, 22.4)
    .item('counter', 34.6, 11, 90, { size: [4, 1.2] })
    .item('table_round', 29.6, 13.4)
    .item('table_round', 31.6, 17.2)
    .item('stool', 30, 15.6)
    .item('stool', 33.6, 17.6);

  const u = new FloorBuilder('8F');
  u.room('伺服器室', 'tech', 0, 0, 14, 8)
    .room('開放辦公區', 'office', 0, 8, 14, 16)
    .room('社長的密室', 'special', 24, 0, 4, 10, {
      gm: true,
      note: '社長室書櫃後面的暗門。保險箱裡的帳本記的不是錢，是「契約」。',
    })
    .room('社長室', 'office', 28, 0, 8, 10)
    .room('走廊', 'hall', 14, 10, 22, 4, { hideLabel: true })
    .room('秘書室', 'office', 14, 14, 6, 10)
    .room('會議室', 'office', 20, 14, 8, 10)
    .room('廁所', 'wet', 28, 14, 8, 10);
  officeCore(u);
  u.item('elevator', 19.5, 0.5);
  u.dh(15, 10, 8, 1, 0, 'open')
    .dv(14, 10.5, 3, -1, 0, 'door2')
    .dh(10, 8, 1.5, -1, 0, 'steel')
    .dh(29, 10, 1.5, -1, 0)
    .dv(28, 3, 1.5, -1, 0, 'secret')
    .dh(15, 14, 1.5, 1, 0)
    .dh(22.5, 14, 3, 1, 0, 'door2')
    .dh(33, 14, 1.5, 1, 1)
    .wv(0, 10, 3.5, 'window2')
    .wv(0, 15, 3.5, 'window2')
    .wv(0, 20, 3.5, 'window2')
    .wh(30, 0, 4)
    .wv(36, 3, 3)
    .wh(22, 24, 4);
  u.row('rack', 1, 0.2, 6, 1.8, 0)
    .item('ac_unit', 12, 6.8, 180, { size: [1.8, 0.8] })
    .item('desk_island', 1.6, 10.4)
    .item('desk_island', 7.4, 10.4)
    .item('desk_island', 1.6, 16.6)
    .item('desk_island', 7.4, 16.6)
    .item('copier', 12.4, 22.6, 180)
    .item('office_desk', 31, 0.4)
    .item('chair', 31.7, 1.9)
    .item('bookshelf', 28.1, 0.1, 270, { size: [2.4, 0.8] })
    .item('sofa2', 34, 4, 90)
    .item('lowtable', 32.2, 4.6, 90)
    .item('safe', 25.6, 0.4, 0, { gm: true })
    .item('altar', 24.2, 7.6, 180, { gm: true, size: [3.6, 1.4] })
    .item('office_desk', 14.4, 21.3, 180)
    .item('chair', 15.1, 20.2)
    .item('filing', 18.7, 18.4, 90)
    .item('meeting6', 21.6, 17.4)
    .item('whiteboard', 27.5, 15.6, 90)
    .item('toilet', 34.3, 16.4, 90)
    .item('toilet', 34.3, 19.8, 90)
    .item('washbasin', 28.1, 21.4, 270, { size: [1.2, 1] });

  const r = new FloorBuilder('屋頂');
  r.room('屋頂', 'rooftop', 0, 0, 36, 24, { ly: 4 });
  officeCore(r, '樓梯間');
  r.dh(18, 10, 1.5, 1, 0, 'steel');
  r.item('water_tower', 2, 2)
    .item('water_tower', 7, 2)
    .item('antenna', 30, 2)
    .row('ac_unit', 26, 16, 4, 2.4, 0)
    .item('vent_unit', 4, 16)
    .item('vent_unit', 8, 16);
  return [g.f, u.f, r.f];
}

/* ---------- 便利商店（賣場、後場、停車場） ---------- */

export function konbini(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('倉庫', 'storage', 0, 0, 12, 4)
    .room('冷藏庫', 'storage', 12, 0, 6, 4)
    .room('員工休息室', 'office', 18, 0, 6, 8)
    .room('賣場', 'public', 0, 4, 18, 12)
    .room('廁所', 'wet', 18, 8, 6, 8)
    .room('停車場', 'road', 0, 16, 30, 10)
    .room('後巷', 'dirt', 24, 0, 6, 16, { ly: -4 });
  b.dh(3, 16, 3, -1, 0, 'auto')
    .dh(2, 4, 1.5, -1, 0)
    .dh(14, 4, 1.5, -1, 0, 'steel')
    .dv(18, 5, 1.5, 1, 0)
    .dv(18, 11, 1.5, 1, 0)
    .dv(24, 2.5, 1.5, 1, 0) // 後門
    .wh(7, 16, 3.5, 'window2')
    .wh(11, 16, 3.5, 'window2')
    .wv(0, 9, 3.5, 'window2');
  /* 賣場：沿牆的冷藏櫃、中間的貨架、收銀台、ATM、窗邊的座位 */
  b.item('fridge_case', 4, 4.1, 0, { size: [8, 1.2] })
    .item('store_shelf', 4, 7.4)
    .item('store_shelf', 4, 10.4)
    .item('store_shelf', 9.4, 7.4)
    .item('store_shelf', 9.4, 10.4)
    .item('register', 13.4, 13.6, 90, { size: [2.4, 1.2] })
    .item('atm', 0.1, 5.2, 270)
    .item('counter', 7.4, 14.7, 180, { size: [3.6, 0.9] })
    .item('stool', 8, 13.6)
    .item('stool', 9.6, 13.6)
    .item('vending', 0.1, 13.4, 270);
  /* 倉庫、冷藏庫、員工休息室、廁所 */
  b.item('supply_shelf', 4, 0.1)
    .item('supply_shelf', 7.2, 0.1)
    .item('cardboard', 10.4, 1.4)
    .item('freezer', 15.8, 0.2, 90)
    .item('pallet_stack', 12.2, 0.4, 0, { size: [1.6, 1.6] })
    .item('table', 20.6, 4.6, 90, { size: [2.4, 1.4] })
    .item('locker', 23, 4.6, 90)
    .item('monitor_wall', 21, 0.1, 0, { size: [2.6, 0.6] })
    .item('toilet', 22.4, 13.8, 90)
    .item('washbasin', 21.4, 8.1, 0, { size: [1.4, 1] });
  /* 停車場、後巷 */
  b.row('parking_stall', 1, 18, 5, 5.6, 0, 0, { size: [5, 8] })
    .item('suv', 7, 17.4)
    .item('streetlight', 27.4, 23.8)
    .item('drum', 26, 0.6)
    .item('big_crate', 25, 8, 0, { label: '回收箱' });
  return [b.f];
}

/* ---------- 偵探事務所（舊大樓：1F 當舖、2F 事務所與住處） ---------- */

const detectiveStairs = (b: FloorBuilder) => b.item('stairs', 16, 0.6);

export function detective(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('當舖倉庫', 'storage', 0, 0, 14, 8)
    .room('當舖', 'public', 0, 8, 14, 16)
    .room('樓梯間', 'hall', 14, 0, 6, 24, { ly: 4 })
    .room('人行道', 'porch', 0, 24, 20, 4)
    .room('街道', 'road', 0, 28, 20, 5, { hideLabel: true });
  detectiveStairs(g);
  g.dh(5, 24, 1.5, -1, 0) // 當舖的門
    .dh(16.25, 24, 1.5, -1, 0) // 樓梯間的門
    .dh(3, 8, 1.5, -1, 0)
    .wh(8, 24, 4)
    .wv(0, 12, 3);
  g.item('counter', 1, 17.4, 0, { size: [10, 1.2] })
    .item('safe', 11.8, 8.4)
    .item('display_case', 0.1, 11, 270)
    .item('display_case', 0.1, 14, 270)
    .item('chair', 5.4, 16.2)
    .item('register', 7.4, 16.2, 0, { size: [2.4, 1] })
    .item('bookshelf', 13.1, 12, 90)
    .item('crate', 6, 0.4)
    .item('crate', 7.8, 0.4)
    .item('supply_shelf', 10.6, 0.1)
    .item('gramophone', 0.6, 4.6)
    .item('streetlight', 1, 25);

  const u = new FloorBuilder('2F');
  u.room('樓梯平台', 'hall', 14, 0, 6, 8, { hideLabel: true })
    .room('臥室', 'bedroom', 8, 0, 6, 8)
    .room('資料室', 'storage', 0, 0, 8, 8)
    .room('密室', 'special', 0, 8, 8, 4, {
      gm: true,
      note: '所長室牆上的掛畫是暗門。牆上釘滿了同一件舊案子的剪報與照片，線一條一條連到中間的空白。',
    })
    .room('所長室', 'office', 0, 12, 8, 12)
    .room('接待室', 'office', 8, 8, 12, 16);
  detectiveStairs(u);
  u.dh(15.5, 8, 1.5, 1, 0)
    .dh(9.5, 8, 1.5, -1, 0)
    .dv(8, 18, 1.5, -1, 0)
    .dv(8, 3, 1.5, -1, 0)
    .dh(3, 12, 1.5, -1, 0, 'secret')
    .wh(10, 24, 3)
    .wh(15, 24, 3)
    .wh(2, 24, 3)
    .wv(0, 15, 3)
    .wh(10, 0, 2);
  u.item('bed_single', 11.8, 0.2)
    .item('wardrobe', 8.1, 0.2, 0, { size: [2.6, 1] })
    .item('bookshelf', 0.1, 1, 270)
    .item('bookshelf', 0.1, 4.2, 270)
    .item('filing', 4, 0.1)
    .item('filing', 5.1, 0.1)
    .item('desk', 0.3, 13, 270)
    .item('chair', 1.6, 13.7, 90)
    .item('safe', 6.6, 22.6)
    .item('lamp', 6.8, 12.4)
    .item('sofa2', 9.1, 12.6, 270)
    .item('lowtable', 11.3, 13.2, 90)
    .item('armchair', 13.6, 13)
    .item('office_desk', 13.6, 19.4, 180)
    .item('chair', 14.3, 18.2)
    .item('laptop', 14.2, 19.8)
    .item('plant', 18.4, 22.4)
    .item('photo', 2, 9, 0, { gm: true })
    .item('papers', 4.6, 10, 0, { gm: true });
  return [g.f, u.f];
}

/* ---------- 老街（騎樓兩側的老店：中藥行、照相館、舊書店、神壇…） ---------- */

/** 老店（寬 w × 深 12）：門開在騎樓那一側；south＝在街道的南邊（上下翻過來，局部的 y＝0 是後牆） */
function oldShop(
  b: FloorBuilder,
  name: string,
  x: number,
  w: number,
  south: boolean,
  fill: (f: Frame) => void,
  cat: Parameters<FloorBuilder['room']>[1] = 'public',
): Frame {
  const f = new Frame(b, x, south ? 24 : 0, w, 12, false, south);
  f.room(name, cat, 0, 0, w, 12, { ly: 2 })
    .dh(1, 12, 1.5, -1, 0)
    .wh(3.5, 12, Math.min(3.5, w - 4.5), 'window2');
  fill(f);
  return f;
}

export function shoppingStreet(): TplFloor[] {
  const b = new FloorBuilder('1F');
  oldShop(b, '中藥行', 0, 8, false, (f) =>
    f
      .item('cabinet', 0.1, 0.1, 0, { size: [7.8, 1] })
      .item('counter', 1.2, 6.4, 0, { size: [5.6, 1.2] })
      .item('chair', 3.4, 4.8),
  );
  oldShop(b, '照相館', 8, 8, false, (f) =>
    f
      .item('camera', 3, 3.4)
      .item('stage', 1, 0.3, 0, { size: [6, 2.4] })
      .item('display_case', 5.4, 8, 90),
  );
  oldShop(b, '雜貨店', 16, 10, false, (f) =>
    f
      .item('store_shelf', 1, 1)
      .item('store_shelf', 5.2, 1)
      .item('store_shelf', 1, 4)
      .item('register', 6.4, 8.6),
  );
  oldShop(b, '茶行', 26, 8, false, (f) =>
    f.row('barrel', 0.4, 0.4, 5, 1.4, 0).item('table', 2.6, 5, 0, { size: [2.8, 1.4] }),
  );
  oldShop(b, '理髮廳', 34, 8, false, (f) =>
    f
      .item('barber_chair', 0.6, 0.6)
      .item('barber_chair', 4, 0.6)
      .item('bench', 3.8, 7.2, 90, { size: [3, 0.9] }),
  );
  oldShop(
    b,
    '空店面',
    42,
    10,
    false,
    (f) => f.item('debris', 3, 3).item('cardboard', 7.6, 0.6).item('wall_graffiti', 4, 11.7),
    'storage',
  );
  oldShop(
    b,
    '麵店',
    0,
    10,
    true,
    (f) =>
      f
        .item('kitchen', 0.1, 0.1, 0, { size: [5, 1.3] })
        .item('dining4', 1.2, 4.4)
        .item('dining4', 5.6, 4.4),
    'kitchen',
  );
  oldShop(b, '金紙店', 10, 8, true, (f) =>
    f
      .item('cabinet', 0.1, 0.1, 0, { size: [7.8, 1] })
      .item('counter', 1, 6.4, 0, { size: [6, 1.2] }),
  );
  oldShop(b, '鐘錶行', 18, 8, true, (f) =>
    f
      .item('display_case', 0.4, 0.4)
      .item('display_case', 4.6, 0.4)
      .item('counter', 1, 6.4, 0, { size: [6, 1.2] })
      .item('workbench', 1, 3.4, 0, { size: [3, 1.2] }),
  );
  oldShop(b, '舊書店', 26, 10, true, (f) =>
    f
      .item('bookshelf', 0.1, 0.1)
      .item('bookshelf', 3.3, 0.1)
      .item('bookshelf', 6.5, 0.1)
      .item('bookstack', 2, 3.6)
      .item('counter', 6.4, 7.6, 0, { size: [3.4, 1.2] }),
  );
  const altar = oldShop(
    b,
    '神壇',
    36,
    10,
    true,
    (f) =>
      f
        .item('altar', 3, 4.6, 0, { size: [4, 1.6] })
        .item('idol', 4.55, 4.95)
        .item('candle', 3.2, 6.6)
        .item('candle', 6.2, 6.6)
        .item('table', 3.6, 8.4, 0, { size: [2.8, 1.2] }),
    'special',
  );
  /* 神壇的後室（GM 專用）：佛桌後面的暗門 */
  altar.room('神壇後室', 'danger', 0, 0, 10, 4, {
    gm: true,
    note: '神壇供桌後面的布幔掀開是一道暗門。附近失蹤的人的衣物都整齊地疊在這裡。',
  });
  altar.dh(1, 4, 1.5, 1, 0, 'secret');
  altar
    .item('cage', 6.4, 0.4, 0, { gm: true, size: [3, 3] })
    .item('chains', 0.4, 0.2, 0, { gm: true })
    .item('bag', 3.6, 0.8, 0, { gm: true });
  b.room('騎樓', 'porch', 0, 12, 52, 3, { hideLabel: true })
    .room('老街', 'road', 0, 15, 52, 6)
    .room('騎樓', 'porch', 0, 21, 52, 3, { hideLabel: true })
    .room('防火巷', 'dirt', 46, 24, 6, 12, { ly: 2 });
  b.item('streetlight', 12, 15.2)
    .item('streetlight', 30, 15.2)
    .item('utility_pole', 46.6, 19.6)
    .item('bollard_post', 0.6, 17.6)
    .item('bollard_post', 0.6, 19)
    .item('drum', 48, 33.4);
  return [b.f];
}

/* ---------- 夜市（廟口的夜市街：兩側的攤位、公廁、GM 專用的鐵皮倉庫） ---------- */

/** 攤位：戶外的一小塊地（不產生牆），中間一張攤車（工作台）；south＝攤車靠南邊 */
function stall(b: FloorBuilder, name: string, x: number, y: number, w: number, south: boolean) {
  b.room(name, 'porch', x, y, w, 6, { ly: south ? -1.6 : 1.6 });
  b.item('counter', x + 0.6, south ? y + 4.6 : y + 0.3, south ? 180 : 0, { size: [w - 1.2, 1.1] });
}

export function nightMarket(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('後巷', 'dirt', 8, 0, 40, 4, { hideLabel: true })
    .room('土地公廟', 'special', 0, 6, 8, 10)
    .room('廟埕', 'gravel', 0, 16, 14, 8)
    .room('廟旁空地', 'gravel', 8, 4, 6, 12, { hideLabel: true })
    .room('夜市街', 'road', 14, 10, 34, 8)
    .room('公廁', 'wet', 40, 18, 4, 6)
    .room('鐵皮倉庫', 'storage', 44, 18, 4, 6, {
      gm: true,
      wall: 'thin',
      note: '攤商說是「放雜物的」。裡面有一口用鐵鍊封著的大甕，甕口貼滿了新的符。',
    })
    .room('停車場', 'road', 0, 24, 48, 6, { hideLabel: true });
  stall(b, '射氣球攤', 14, 4, 6, false);
  stall(b, '雞排攤', 20, 4, 6, false);
  stall(b, '衣服攤', 26, 4, 6, false);
  stall(b, '撈金魚攤', 32, 4, 6, false);
  stall(b, '飲料攤', 38, 4, 6, false);
  stall(b, '香腸攤', 44, 4, 4, false);
  stall(b, '臭豆腐攤', 14, 18, 6, true);
  stall(b, '蚵仔煎攤', 20, 18, 8, true);
  stall(b, '算命攤', 28, 18, 6, true);
  stall(b, '玩具攤', 34, 18, 6, true);
  b.dv(8, 9.5, 3, 1, 0, 'door2') // 廟門（朝東）
    .dh(41.25, 18, 1.5, 1, 0)
    .dh(45.25, 24, 1.5, -1, 0, 'locked')
    .wv(0, 9, 2)
    .wh(1, 16, 2)
    .wh(5, 16, 2);
  /* 廟、廟埕 */
  b.item('altar', 2.4, 6.2, 0, { size: [4, 1.6] })
    .item('idol', 3.95, 6.55)
    .item('candle', 3.9, 9)
    .item('saisen', 2.8, 13.6, 180, { size: [2.4, 1] })
    .item('tree', 1, 19)
    .item('candle', 9.6, 18.4, 0, { size: [1.4, 1.4], label: '香爐' })
    .item('lantern', 12, 16.4);
  /* 攤位的東西 */
  b.item('quest_board', 15, 7, 0, { size: [4, 0.5], label: '氣球牆' })
    .item('stool', 21, 6.6)
    .item('stool', 22.6, 6.6)
    .item('store_shelf', 27, 6.4, 0, { size: [4, 1.2] })
    .item('pond', 33, 6.2, 0, { size: [4, 2.4] })
    .item('fridge', 41.4, 5.6)
    .item('table', 21, 18.8, 0, { size: [2.8, 1.4] })
    .item('table', 24.6, 18.8, 0, { size: [2.8, 1.4] })
    .item('chair', 21.4, 20.4, 180)
    .item('chair', 25, 20.4, 180)
    .item('table_round', 29.6, 18.6, 0, { size: [1.4, 1.4] })
    .item('chair', 31.2, 18.8, 270)
    .item('store_shelf', 35, 19, 0, { size: [4, 1.2] })
    .item('toilet', 42.4, 22.3, 180)
    .item('washbasin', 40.1, 21, 270, { size: [1.2, 1] })
    .item('barrel', 45.4, 19.6, 0, { gm: true, size: [1.4, 1.4] })
    .item('chains', 44.4, 21.6, 0, { gm: true, size: [2.4, 0.6] });
  /* 街燈、行人 */
  b.item('streetlight', 14.4, 13.4)
    .item('streetlight', 46.4, 13.4)
    .item('npc_woman', 24, 12.6)
    .item('npc_child', 30.4, 14.6)
    .item('npc_man', 37, 12.4)
    .item('npc_elder', 9.4, 20.6)
    .row('car', 14, 25, 3, 10, 0, 90);
  return [b.f];
}
