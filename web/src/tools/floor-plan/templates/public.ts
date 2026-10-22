/**
 * 公共場所的範本（本站自己畫的平面圖，2026-10 增補）：學校、警察局、圖書館、寺廟。北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor } from './builder';

/* ---------- 學校（教室大樓：1F、2F、屋頂） ---------- */

/** 樓梯間（西、東各一座，三層同一個位置）：x0 是左邊；北側一排房間深 14 格，南邊是走廊 */
function schoolStairs(b: FloorBuilder, x0: number, roof: boolean): void {
  b.room('樓梯間', 'hall', x0, 0, 6, 14, { ly: 3.5 });
  b.item('stairs_u', x0 + 0.5, 0.5, 0, { size: [5, 7] });
  if (roof) b.dh(x0 + 2.25, 14, 1.5, 1, 0);
  else b.dh(x0 + 0.5, 14, 5, 1, 0, 'open');
}

/** 廁所：東邊的牆一排馬桶（薄隔間）、門口旁邊洗手台；南邊是開口 */
function schoolToilet(b: FloorBuilder, x0: number): void {
  b.room('廁所', 'wet', x0, 0, 6, 14)
    .dh(x0 + 0.5, 14, 2, -1, 0, 'open')
    .wv(x0 + 6, 10.5, 2);
  for (let i = 0; i < 4; i++) {
    b.item('toilet', x0 + 4.4, 0.5 + i * 2.2, 90);
    if (i) b.wall(x0 + 3.6, i * 2.2, x0 + 6, i * 2.2, 'thin');
  }
  b.wall(x0 + 3.6, 8.8, x0 + 6, 8.8, 'thin')
    .item('washbasin', x0 + 0.05, 7.8, 270)
    .item('washbasin', x0 + 0.05, 9.6, 270);
}

/** 普通教室（寬 18 × 深 14）：黑板在西邊，前後門在南邊（走廊），課桌 5 × 5、置物櫃在後面 */
function classroom(b: FloorBuilder, x: number, name: string): void {
  b.room(name, 'public', x, 0, 18, 14, { ly: 5.6 })
    .dh(x + 1, 14, 1.5, -1, 0, 'sliding')
    .dh(x + 15.5, 14, 1.5, -1, 0, 'sliding')
    .wh(x + 2, 0, 5)
    .wh(x + 11, 0, 5)
    .wh(x + 5, 14, 8);
  b.item('whiteboard', x + 0.1, 4, 270, { size: [6, 0.4] }).item('lectern', x + 1.6, 6.1, 270);
  for (let c = 0; c < 5; c++)
    for (let r = 0; r < 5; r++) b.item('school_desk', x + 4 + c * 2.5, 1.5 + r * 2, 270);
  for (let i = 0; i < 3; i++) b.item('locker', x + 17, 1 + i * 3.1, 90);
}

export function school(): TplFloor[] {
  const g = new FloorBuilder('1F');
  schoolStairs(g, 0, false);
  g.room('保健室', 'medical', 6, 0, 14, 14)
    .room('理化教室', 'public', 20, 0, 18, 14)
    .room('準備室', 'storage', 38, 0, 6, 14)
    .room('教師辦公室', 'office', 44, 0, 16, 14);
  schoolStairs(g, 60, false);
  schoolToilet(g, 66);
  g.room('走廊', 'porch', 0, 14, 72, 4);
  /* 保健室 */
  g.dh(16.5, 14, 1.5, -1, 1)
    .wh(14.5, 0, 3)
    .wh(8, 14, 4)
    .wv(0, 9, 3)
    .item('bed_single', 6.4, 0.3)
    .item('curtain', 8.6, 0.5, 90, { size: [3.6, 0.3] })
    .item('bed_single', 9.1, 0.3)
    .item('curtain', 11.3, 0.5, 90, { size: [3.6, 0.3] })
    .item('bed_single', 11.8, 0.3)
    .item('office_desk', 18.6, 1, 90)
    .item('chair', 17.3, 1.7, 270)
    .item('med_cabinet', 19, 5, 90)
    .item('washbasin', 18.9, 9, 90)
    .item('bench', 6.4, 12.9, 180)
    .item('wheelchair', 14.2, 11.8);
  /* 理化教室：黑板在西邊，前面是示範用的實驗台 */
  g.dh(21, 14, 1.5, -1, 0, 'sliding')
    .dh(34, 14, 1.5, -1, 0, 'sliding')
    .dv(38, 2, 1.5, 1, 0)
    .wh(23, 0, 4)
    .wh(30, 0, 4)
    .wh(25.5, 14, 6)
    .item('whiteboard', 20.1, 4, 270, { size: [6, 0.4] })
    .item('lab_bench', 20.8, 5, 270)
    .item('med_cabinet', 37, 6, 90)
    .item('sink', 36.7, 9.6, 90);
  for (const x of [23, 31])
    for (const y of [1.6, 5.8, 10]) {
      g.item('lab_bench', x, y);
      g.item('stool', x + 0.6, y + 1.8).item('stool', x + 2.6, y + 1.8);
    }
  /* 準備室：標本櫃、藥品櫃 */
  g.dh(39.5, 14, 1.5, -1, 0)
    .wh(39.5, 0, 3)
    .item('cabinet', 43, 4.2, 90)
    .item('cabinet', 43, 7.4, 90)
    .item('tank', 39.6, 4.6, 0, { size: [2, 2], label: '標本' })
    .item('table', 39.4, 8.8, 0, { size: [2.8, 1.4] })
    .item('tank', 38.4, 0.2, 0, { size: [1.6, 1.6], gm: true, label: '？' });
  g.find('準備室').note = '標本櫃最裡面有一個不在清冊上的標本罐，標籤寫著三十年前的日期。';
  /* 教師辦公室：兩組四人的辦公桌 */
  g.dh(45, 14, 1.5, -1, 0)
    .dh(57, 14, 1.5, -1, 1)
    .wh(47, 0, 4)
    .wh(53, 0, 4)
    .item('filing', 44.1, 1, 270)
    .item('filing', 44.1, 2.2, 270)
    .item('whiteboard', 44.1, 5.5, 270, { size: [4, 0.4] })
    .item('copier', 58.8, 9, 90);
  for (const x of [47.5, 53.5]) {
    g.item('office_desk', x, 2.5, 180).item('office_desk', x + 2.4, 2.5, 180);
    g.item('office_desk', x, 3.9).item('office_desk', x + 2.4, 3.9);
    g.item('chair', x + 0.7, 1.4).item('chair', x + 3.1, 1.4);
    g.item('chair', x + 0.7, 5.4, 180).item('chair', x + 3.1, 5.4, 180);
  }
  g.item('plant', 0.4, 16.4).item('plant', 70.4, 16.4);

  const u = new FloorBuilder('2F');
  schoolStairs(u, 0, false);
  classroom(u, 6, '二年一班');
  classroom(u, 24, '二年二班');
  classroom(u, 42, '二年三班');
  schoolStairs(u, 60, false);
  schoolToilet(u, 66);
  u.room('走廊', 'balcony', 0, 14, 72, 4);

  const r = new FloorBuilder('屋頂');
  r.room('屋頂', 'balcony', 0, 0, 72, 18);
  schoolStairs(r, 0, true);
  schoolStairs(r, 60, true);
  r.item('tank', 30, 1, 0, { label: '水塔' })
    .item('tank', 33.4, 1, 0, { label: '水塔' })
    .item('school_desk', 50, 9, 90)
    .item('bench', 20, 16.6, 180, { size: [3, 0.8] });
  return [g.f, u.f, r.f];
}

/* ---------- 圖書館（1F 開架閱覽、B1 閉架書庫與 GM 專用的禁書庫） ---------- */

/** 樓梯與電梯（兩層同一個位置）、旁邊的兩間（館員辦公室／修復室、廁所／機房） */
function libraryCore(b: FloorBuilder, north: string, south: string): void {
  b.room('樓梯・電梯', 'hall', 22, 0, 6, 14, { hideLabel: true })
    .room(north, 'office', 28, 0, 8, 8)
    .room(south, south === '廁所' ? 'wet' : 'garage', 28, 8, 8, 6);
  b.dv(28, 5.5, 1.5, 1, 0).dv(28, 10, 1.5, 1, 0).dh(22.5, 14, 3, 1, 0, 'open');
  b.item('stairs', 22.2, 0.4, 180, { size: [2.2, 6] }).item('elevator', 24.4, 0.2, 0, {
    size: [3.4, 3.4],
  });
}

export function library(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('開架閱覽區', 'public', 0, 0, 22, 14, { lx: 0.8 })
    .room('期刊區', 'public', 0, 14, 12, 12)
    .room('大廳・服務台', 'public', 12, 14, 14, 12)
    .room('兒童閱覽區', 'public', 26, 14, 10, 12)
    .room('入口', 'porch', 14, 26, 8, 3);
  libraryCore(g, '館員辦公室', '廁所');
  g.dh(16.5, 26, 3, -1, 0, 'auto')
    .dh(13, 14, 6, 1, 0, 'open')
    .dv(12, 17, 4, 1, 0, 'open')
    .dv(26, 17, 3, 1, 0, 'sliding2')
    .wh(1.5, 0, 4)
    .wh(14, 0, 6)
    .wv(0, 3, 3)
    .wv(0, 9, 3)
    .wv(0, 21, 3)
    .wh(2, 26, 3)
    .wh(7, 26, 3)
    .wh(28, 26, 3)
    .wh(32, 26, 3)
    .wv(36, 17, 3)
    .wv(36, 21.5, 3)
    .wh(31, 0, 3)
    .wv(36, 11.5, 2);
  /* 開架閱覽區：雙面書架四排、閱覽長桌兩張 */
  for (const x of [1, 3.5, 6, 8.5]) g.item('bookstack', x, 1.5, 90).item('bookstack', x, 7.5, 90);
  g.item('lecture_row', 13.5, 3)
    .item('lecture_row', 13.5, 7.5)
    .item('bookshelf', 18.6, 0.1, 0, { size: [3, 0.8] });
  /* 館員辦公室、廁所 */
  g.item('office_desk', 30, 0.2)
    .item('office_desk', 32.6, 0.2)
    .item('chair', 30.7, 1.7)
    .item('chair', 33.3, 1.7)
    .item('cabinet', 35, 3.8, 90)
    .item('crate', 31.4, 5.6, 0, { label: '待上架' })
    .item('toilet', 34.4, 8.3, 90)
    .item('toilet', 34.4, 10.6, 90)
    .wall(33.6, 9.9, 36, 9.9, 'thin')
    .item('washbasin', 30, 12.8, 180);
  /* 期刊區、大廳、兒童閱覽區 */
  g.item('bookshelf', 0.1, 14.8, 270)
    .item('bookshelf', 0.1, 18.2, 270)
    .item('armchair', 3.4, 14.4)
    .item('armchair', 7.4, 14.4)
    .item('lowtable', 5.2, 15)
    .item('table', 4.4, 21.8, 0, { size: [2.8, 1.6] })
    .item('chair', 4.2, 23.5, 180)
    .item('chair', 6.2, 23.5, 180)
    .item('reception', 16.5, 16.6, 0, { label: '服務台' })
    .item('chair', 17.6, 15.3)
    .item('chair', 19.9, 15.3)
    .item('crate', 22.2, 23.2, 0, { label: '還書箱' })
    .item('desk', 24.6, 21, 90, { label: '查詢電腦' })
    .item('plant', 12.3, 24.5)
    .item('rug', 29, 19, 0, { size: [5, 4] })
    .item('bookshelf', 28.5, 14.1)
    .item('bookshelf', 31.7, 14.1)
    .item('table_round', 30.1, 21.1)
    .item('plant', 34.5, 24.5)
    .item('plant', 14.4, 27.4)
    .item('plant', 20.4, 27.4);

  const bm = new FloorBuilder('B1');
  bm.room('閉架書庫', 'storage', 0, 0, 22, 14)
    .room('走廊', 'hall', 0, 14, 36, 3, { hideLabel: true })
    .room('古籍室', 'storage', 0, 17, 14, 9)
    .room('禁書庫', 'special', 14, 17, 12, 9, {
      gm: true,
      note: '古籍室最裡面的書架後面是暗門。這裡收著不該被讀的書；能讀懂的人會付出代價。',
    })
    .room('倉庫', 'storage', 26, 17, 10, 9);
  libraryCore(bm, '修復室', '機房');
  bm.dv(22, 8, 1.5, -1, 0)
    .dh(2, 14, 1.5, -1, 0)
    .dh(5, 17, 1.5, 1, 0, 'locked')
    .dv(14, 21, 1.5, 1, 0, 'secret')
    .dh(28, 17, 1.5, 1, 0);
  /* 閉架書庫：密集的書架 */
  for (const x of [1, 3.5, 6, 8.5, 11, 13.5, 16, 18.5]) {
    bm.item('bookstack', x, 1, 90);
    if (x > 3) bm.item('bookstack', x, 7.6, 90);
  }
  /* 修復室、機房 */
  bm.item('lab_bench', 30.4, 0.1)
    .item('table', 31, 3.6, 0, { size: [2.8, 1.6] })
    .item('chair', 31.9, 5.4, 180)
    .item('cabinet', 35, 4.2, 90, { size: [3, 1] })
    .item('rack', 34, 8.2, 90)
    .item('rack', 34, 10.6, 90)
    .item('tank', 30.6, 11.4, 0, { size: [2, 2] });
  /* 古籍室、禁書庫、倉庫 */
  bm.item('bookshelf', 0.1, 19, 270)
    .item('bookshelf', 0.1, 22.2, 270)
    .item('cabinet', 9.6, 25, 180, { size: [4, 1] })
    .item('table', 4.4, 21.6, 0, { size: [2.8, 1.6] })
    .item('chair', 5.3, 23.4, 180)
    .item('bookshelf', 22.9, 17.2, 0, { gm: true })
    .item('bookshelf', 25.1, 19.4, 90, { gm: true })
    .item('bookshelf', 25.1, 22.6, 90, { gm: true })
    .item('magic_circle', 17.4, 19.2, 0, { gm: true, size: [4.4, 4.4] })
    .item('table', 18.8, 24.2, 0, { gm: true, size: [2.4, 1.4] })
    .item('candle', 17.6, 24.4, 0, { gm: true })
    .item('crate', 26.4, 23.2)
    .item('crate', 28.2, 23.2)
    .item('crate', 34.2, 19.4)
    .item('rack', 34, 22, 90);
  return [bm.f, g.f];
}

/* ---------- 寺廟（台灣的廟：廟埕、前殿、天井、正殿、兩側廂房） ---------- */

export function temple(): TplFloor[] {
  const b = new FloorBuilder('1F');
  /* 中軸：正殿（北）→ 天井 → 前殿（三川殿）→ 廟埕；兩側是廂房，前殿兩旁是鐘樓、鼓樓 */
  b.room('正殿', 'special', 8, 0, 20, 14)
    .room('廟務辦公室', 'office', 0, 0, 8, 10)
    .room('西廂房', 'living', 0, 10, 8, 12)
    .room('廟公房', 'bedroom', 28, 0, 8, 8)
    .room('東廂房', 'storage', 28, 8, 8, 7)
    .room('茶水間', 'kitchen', 28, 15, 8, 7)
    .room('天井', 'porch', 8, 14, 20, 8, { lx: -5.5 })
    .room('鐘樓', 'public', 0, 22, 8, 6, { lx: 1 })
    .room('前殿', 'special', 8, 22, 20, 6)
    .room('鼓樓', 'public', 28, 22, 8, 6, { lx: -1 })
    .room('廟埕', 'porch', 0, 28, 36, 14, { ly: -1.4 })
    .room('金爐', 'garage', 30, 31, 3, 3);
  b.dh(16.5, 28, 3, -1, 0, 'door2') // 三川門（中門）
    .dh(11, 28, 1.5, -1, 0)
    .dh(23.5, 28, 1.5, -1, 1)
    .dh(14, 22, 8, 1, 0, 'open')
    .dh(16, 14, 4, -1, 0, 'door2')
    .dv(8, 24, 1.5, -1, 0)
    .dv(28, 24, 1.5, 1, 0)
    .dv(8, 17, 1.5, -1, 0)
    .dv(28, 17.5, 1.5, 1, 0)
    .dv(8, 6, 1.5, -1, 0)
    .dv(28, 5, 1.5, 1, 0)
    .dv(28, 10, 1.5, 1, 0)
    .dv(30, 32, 1, -1, 0, 'open') // 金爐的爐口
    .wh(10, 14, 3)
    .wh(23, 14, 3)
    .wh(2.5, 0, 3)
    .wh(30.5, 0, 2.5)
    .wv(0, 3, 3)
    .wv(0, 14, 3)
    .wv(0, 24, 2)
    .wv(36, 2, 3)
    .wv(36, 10, 3)
    .wv(36, 24, 2)
    .wh(3, 28, 2)
    .wh(31, 28, 2);
  /* 正殿：神桌與主神、供桌、左右的陪祀神桌、柱子、香油錢箱 */
  b.item('altar', 14, 0.2, 0, { size: [8, 1.8] })
    .item('idol', 17.55, 0.65)
    .item('candle', 15, 0.7)
    .item('candle', 20.2, 0.7)
    .item('table', 15.5, 3.4, 0, { size: [5, 1.4] })
    .item('candle', 17.5, 3.6, 0, { size: [1, 1] })
    .item('altar', 8.2, 0.8, 270, { size: [4, 1.6] })
    .item('altar', 26.2, 0.8, 90, { size: [4, 1.6] })
    .item('pillar', 11.5, 7)
    .item('pillar', 23.5, 7)
    .item('pillar', 11.5, 11)
    .item('pillar', 23.5, 11)
    .item('saisen', 16.8, 10, 0, { label: '香油錢箱' });
  /* 天井的天公爐、前殿的龍柱與服務處、鐘鼓樓 */
  b.item('candle', 17.1, 16.6, 0, { size: [1.8, 1.8], label: '天公爐' })
    .item('plant', 8.4, 14.4)
    .item('plant', 26.4, 14.4)
    .item('pillar', 14, 26.6)
    .item('pillar', 21, 26.6)
    .item('reception', 9.5, 22.2, 0, { size: [4, 1.2], label: '服務處' })
    .item('barrel', 0.5, 22.6, 0, { size: [2.4, 2.4], label: '大鐘' })
    .item('barrel', 33.1, 22.6, 0, { size: [2.4, 2.4], label: '大鼓' });
  /* 廂房 */
  b.item('office_desk', 1.5, 0.2)
    .item('chair', 2.2, 1.7)
    .item('safe', 6.6, 0.2)
    .item('filing', 0.1, 5, 270)
    .item('bookshelf', 0.1, 6.5, 270)
    .item('dining4', 2.5, 11.6)
    .item('bench', 0.1, 16.4, 270)
    .item('bed_single', 33.8, 0.2)
    .item('nightstand', 32.8, 0.2)
    .item('desk', 30, 6.7, 180)
    .item('chair', 30.7, 5.6)
    .item('crate', 34, 8.3)
    .item('crate', 34, 9.9)
    .item('cabinet', 35, 11.6, 90, { size: [3, 1] })
    .item('sink', 34.7, 15.3, 90)
    .item('fridge', 34.6, 17.6, 90)
    .item('table', 30, 19.5, 0, { size: [2.8, 1.4] });
  b.find('東廂房').note = '神轎底座的夾層裡藏著一尊不在廟誌上的神像。';
  /* 廟埕：石獅、老樹、戲台 */
  b.item('komainu', 14.6, 29.2, 0, { label: '石獅' })
    .item('komainu', 20, 29.2, 0, { label: '石獅', flip: true })
    .item('tree', 0.6, 35.5)
    .item('tree', 32.4, 37.4)
    .item('stage', 12, 37, 180, { size: [12, 5], label: '戲台' });
  return [b.f];
}

/* ---------- 警察局（派出所，一層） ---------- */

export function police(): TplFloor[] {
  const b = new FloorBuilder('1F');
  /* 北側一排：車庫、證物室、槍械室、備勤室、廁所、所長室；中間東西向的走廊 */
  b.room('車庫', 'garage', 0, 0, 12, 9)
    .room('證物室', 'storage', 12, 0, 6, 9)
    .room('槍械室', 'danger', 18, 0, 4, 9)
    .room('備勤室', 'bedroom', 22, 0, 10, 9)
    .room('廁所', 'wet', 32, 0, 5, 9)
    .room('所長室', 'office', 37, 0, 7, 9)
    .room('走廊', 'hall', 0, 9, 44, 3, { hideLabel: true })
    /* 南側一排：拘留區（兩間留置室）、偵訊室與觀察室（單向玻璃）、大廳・值班台、辦公室 */
    .room('拘留區', 'hall', 0, 12, 10, 12, { ly: -3.6 })
    .room('留置室 1', 'danger', 0, 17, 5, 7, { noWall: true })
    .room('留置室 2', 'danger', 5, 17, 5, 7, { noWall: true })
    .room('偵訊室', 'office', 10, 12, 7, 12)
    .room('觀察室', 'office', 17, 12, 4, 12, { noWall: true, ly: -3.2 })
    .room('大廳・值班台', 'public', 21, 12, 12, 12)
    .room('辦公室', 'office', 33, 12, 11, 12, { ly: 3.6 })
    .room('門廊', 'porch', 23, 24, 8, 3);
  /* 「不產生牆」的房間自己畫牆：留置室的鐵欄杆與隔間、觀察室的單向玻璃 */
  b.wall(0, 17, 10, 17, 'bars')
    .wall(5, 17, 5, 24)
    .wall(10, 17, 10, 24)
    .wall(17, 12, 17, 24, 'glass')
    .wall(17, 12, 21, 12)
    .wall(21, 12, 21, 24);
  b.dv(0, 2, 5, 1, 0, 'shutter')
    .dh(9.5, 9, 1.5, -1, 0)
    .dh(13, 9, 1.5, -1, 0, 'locked')
    .dh(19.5, 9, 1.5, -1, 1, 'locked')
    .dh(23, 9, 1.5, -1, 0)
    .dh(33, 9, 1.5, -1, 0)
    .dh(38, 9, 1.5, -1, 0)
    .dv(0, 9.75, 1.5, -1, 0) // 後門
    .dh(6, 12, 1.5, 1, 1)
    .dh(1.5, 17, 1.5, -1, 0, 'locked')
    .dh(6.5, 17, 1.5, -1, 0, 'locked')
    .dh(14.5, 12, 1.5, 1, 1)
    .dh(18.5, 12, 1.5, 1, 0)
    .dh(30, 12, 1.5, 1, 1)
    .dh(34.5, 12, 1.5, 1, 0)
    .dh(25.5, 24, 3, -1, 0, 'auto') // 大門
    .wh(24.5, 0, 3)
    .wh(28.5, 0, 2)
    .wv(44, 2, 3)
    .wv(44, 9.5, 2)
    .wh(22, 24, 2.5)
    .wh(30, 24, 2.5)
    .wv(44, 15, 3)
    .wv(44, 19.5, 3)
    .wh(36, 24, 3)
    .wh(40.5, 24, 2.5);
  /* 車庫、證物室、槍械室 */
  b.item('car', 1.5, 2.5, 90)
    .item('cabinet', 7.6, 0.1)
    .item('cabinet', 12.5, 0.1)
    .item('cabinet', 17, 1.4, 90)
    .item('cabinet', 17, 4.6, 90)
    .item('safe', 12.3, 4.8)
    .item('crate', 14.9, 5.2)
    .item('locker', 18.1, 0.5, 270)
    .item('locker', 18.1, 3.8, 270)
    .item('safe', 20.6, 0.2);
  b.find('證物室').note = '證物 #127 的袋子封條完好，裡面卻是空的。';
  /* 備勤室、廁所、所長室 */
  b.item('bed_single', 24.8, 0.2)
    .item('bed_single', 27.3, 0.2)
    .item('bed_single', 29.8, 0.2)
    .item('locker', 22.1, 1.2, 270)
    .item('table', 25.6, 6, 0, { size: [2.8, 1.4] })
    .item('toilet', 34, 0.1)
    .item('toilet', 35.6, 0.1)
    .wall(35.3, 0, 35.3, 1.9, 'thin')
    .item('washbasin', 35.9, 4, 90)
    .item('office_desk', 40, 2.5, 180)
    .item('chair', 40.7, 1.3)
    .item('sofa2', 37.1, 3.6, 270)
    .item('lowtable', 39.2, 4.6, 90)
    .item('safe', 42.7, 6.5, 0, { gm: true, label: '黑帳' });
  /* 拘留區：看守的桌子、兩間留置室（床板、馬桶） */
  b.item('desk', 0.1, 12.9, 270)
    .item('chair', 1.5, 13.6, 270)
    .item('bed_single', 0.2, 21.8, 270)
    .item('toilet', 3.9, 18.2)
    .item('bed_single', 5.2, 21.8, 270)
    .item('toilet', 8.9, 18.2);
  /* 偵訊室與觀察室 */
  b.item('table', 12.7, 19, 90)
    .item('chair', 11.5, 19.9, 90)
    .item('chair', 14.5, 19.9, 270)
    .item('lamp', 10.4, 22.8)
    .item('chair', 18.4, 17, 90)
    .item('chair', 18.4, 19, 90)
    .item('console', 19.9, 16.2, 90, { size: [3, 1] });
  /* 大廳・值班台 */
  b.item('reception', 24.5, 15.5)
    .item('chair', 25.5, 14.2)
    .item('chair', 27.9, 14.2)
    .item('filing', 22.1, 12.1)
    .item('filing', 23.2, 12.1)
    .item('bench', 21.1, 17.6, 270)
    .item('bench', 31.9, 17.6, 90)
    .item('whiteboard', 32.6, 13.6, 90, { size: [2.6, 0.4] })
    .item('plant', 21.3, 22.4)
    .item('plant', 31.5, 22.4)
    .item('plant', 23.4, 25.2)
    .item('plant', 29.4, 25.2);
  /* 辦公室：四人一組的辦公桌、案情白板 */
  b.item('office_desk', 36.5, 16, 180)
    .item('office_desk', 38.9, 16, 180)
    .item('office_desk', 36.5, 17.4)
    .item('office_desk', 38.9, 17.4)
    .item('chair', 37.2, 14.8)
    .item('chair', 39.6, 14.8)
    .item('chair', 37.2, 18.9, 180)
    .item('chair', 39.6, 18.9, 180)
    .item('whiteboard', 43.5, 12.3, 90, { size: [2.4, 0.4] })
    .item('filing', 33.9, 22.7, 180)
    .item('filing', 35, 22.7, 180)
    .item('copier', 42.5, 22.7, 180);
  return [b.f];
}
