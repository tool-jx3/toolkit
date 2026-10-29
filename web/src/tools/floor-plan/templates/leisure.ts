/**
 * 娛樂・表演的範本（2026-10 第三批後半，本站自己畫的平面圖）：劇場、KTV；
 * 2026-10-29 跟進原作 v1.15 加了健身房（格局是本站自己設計的，不參考原作的配置）。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, Frame, type TplFloor } from './builder';

/* ---------- 劇場（1F 舞台與觀眾席、後台；B1 舞台下的奈落） ---------- */

/** 兩層同一個位置的東西：後台的樓梯、舞台中央的升降口 */
function theatreLinks(b: FloorBuilder): void {
  b.item('stairs', 30.9, 0.5).item('trapdoor', 19, 15);
}

export function theatre(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('化妝室 1', 'bedroom', 0, 0, 10, 8)
    .room('化妝室 2', 'bedroom', 10, 0, 8, 8)
    .room('道具間', 'storage', 18, 0, 12, 8)
    .room('後台樓梯', 'hall', 30, 0, 4, 8, { hideLabel: true })
    .room('舞台監督室', 'office', 34, 0, 6, 8)
    .room('後台走廊', 'hall', 0, 8, 40, 3, { hideLabel: true })
    .room('下手側台', 'hall', 0, 11, 8, 10)
    .room('舞台', 'engawa', 8, 11, 24, 10, { ly: -2.4 })
    .room('上手側台', 'hall', 32, 11, 8, 10)
    .room('觀眾席', 'public', 0, 21, 40, 14, { ly: 5.4 })
    .room('售票處', 'office', 0, 35, 8, 8)
    .room('大廳', 'public', 8, 35, 24, 8)
    .room('廁所', 'wet', 32, 35, 8, 8)
    .room('人行道', 'porch', 0, 43, 40, 4);
  theatreLinks(g);
  g.dh(8, 21, 24, -1, 0, 'open') // 舞台口
    .dv(8, 13, 6, 1, 0, 'open')
    .dv(32, 13, 6, 1, 0, 'open')
    .dh(2, 11, 1.5, 1, 0)
    .dh(36.5, 11, 1.5, 1, 1)
    .dh(4, 8, 1.5, -1, 0)
    .dh(12, 8, 1.5, -1, 0)
    .dh(22, 8, 3, -1, 0, 'door2')
    .dh(30.5, 8, 3, -1, 0, 'open')
    .dh(36, 8, 1.5, -1, 0)
    .dv(0, 8.75, 1.5, -1, 0, 'steel') // 後台的出入口
    .dh(11, 35, 3, -1, 0, 'door2')
    .dh(26, 35, 3, -1, 0, 'door2')
    .dh(18.5, 43, 3, -1, 0, 'door2')
    .dh(13, 43, 3, -1, 0, 'door2')
    .dh(24, 43, 3, -1, 0, 'door2')
    .dv(32, 38, 1.5, 1, 0)
    .dv(8, 38, 1.5, -1, 0)
    .wh(2, 43, 3)
    .wh(34, 43, 3);
  /* 後台：化妝台、道具、監督的桌子 */
  g.item('counter', 0.3, 0.1, 0, { size: [7.4, 1] })
    .row('stool', 1, 1.3, 4, 1.8, 0)
    .item('wardrobe', 7, 4.6, 90, { size: [3, 1] })
    .item('counter', 10.3, 0.1, 0, { size: [6, 1] })
    .row('stool', 11, 1.3, 3, 1.8, 0)
    .item('big_crate', 18.4, 0.4)
    .item('crate', 21.8, 0.4)
    .item('armor_stand', 27.8, 0.4)
    .item('throne', 25, 0.4)
    .item('chest', 19, 4.4)
    .item('office_desk', 35, 0.2)
    .item('chair', 35.7, 1.7)
    .item('monitor_wall', 39.3, 2, 90, { size: [4, 0.6] });
  /* 舞台與側台 */
  g.item('table', 13, 13, 0, { size: [2.8, 1.6] })
    .item('chair', 13.4, 14.8, 180)
    .item('lamp', 27.6, 12)
    .item('banner', 9, 11.2)
    .item('scaffold', 0.4, 13.6, 90, { size: [6, 2] })
    .item('speaker', 33, 18.6)
    .item('speaker', 5.8, 18.6);
  /* 觀眾席：中間走道兩側各五排 */
  for (let i = 0; i < 5; i++) {
    g.item('seats', 3, 24 + i * 2, 0, { size: [14, 1.2] });
    g.item('seats', 23, 24 + i * 2, 0, { size: [14, 1.2] });
  }
  g.item('mixer', 18.5, 32.6)
    /* 售票處、大廳、廁所 */
    .item('counter', 4, 38, 90, { size: [3.6, 1.2] })
    .item('chair', 2.6, 38.6)
    .item('safe', 0.3, 35.3)
    .item('bench', 9, 40, 0, { size: [3, 0.9] })
    .item('bench', 28, 40, 0, { size: [3, 0.9] })
    .item('quest_board', 16.5, 35.1, 0, { size: [4, 0.5], label: '公演海報' })
    .item('toilet', 38.3, 36, 90)
    .item('toilet', 38.3, 39.4, 90)
    .item('washbasin', 35, 41.9, 180, { size: [1.4, 1] });
  g.find('道具間').note = '標著「下次公演」的箱子裡是一套戲服，尺寸剛好是某一位調查員的。';

  const bm = new FloorBuilder('B1');
  bm.room('舊道具倉庫', 'storage', 8, 0, 22, 8)
    .room('後台樓梯', 'hall', 30, 0, 4, 8, { hideLabel: true })
    .room('地下走廊', 'hall', 8, 8, 26, 3, { hideLabel: true })
    .room('奈落', 'storage', 8, 11, 24, 10, { ly: 2.6 })
    .room('奈落深處', 'danger', 0, 11, 8, 10, {
      gm: true,
      note: '奈落西邊的牆後面。劇團代代相傳「不要在這裡點燈」，地上的粉筆圈還很新。',
    });
  theatreLinks(bm);
  bm.dh(30.5, 8, 3, -1, 0, 'open')
    .dh(14, 8, 3, -1, 0, 'door2')
    .dh(24, 11, 3, 1, 0, 'open')
    .dv(8, 17, 1.5, -1, 0, 'secret');
  bm.item('pallet_rack', 9, 0.2, 0, { size: [8, 2] })
    .item('big_crate', 19, 0.4)
    .item('crate', 22.6, 0.4)
    .item('statue', 26.6, 0.4)
    .item('scaffold', 9, 12, 0, { size: [6, 2] })
    .item('machine_tool', 22, 18.4, 180)
    .item('cardboard', 28, 12)
    .item('magic_circle', 1, 13, 0, { gm: true, size: [5, 5] })
    .item('candle', 0.4, 11.4, 0, { gm: true })
    .item('cursed_item', 3.1, 15.1, 0, { gm: true });
  return [bm.f, g.f];
}

/* ---------- KTV（櫃台、走廊兩側的包廂、GM 專用的 VIP 包廂） ---------- */

/** 包廂（寬 6 × 深 10，隔音牆）：L 型沙發、矮桌、電視與喇叭；門在走廊那一側 */
function ktvRoom(b: FloorBuilder, name: string, x: number, south: boolean, gm = false) {
  const f = new Frame(b, x, south ? 14 : 0, 6, 10, false, south);
  const g = gm ? { gm: true } : {};
  f.room(name, 'studio', 0, 0, 6, 10, { wall: 'sound', ...g })
    .dh(4, 10, 1.5, -1, 1, gm ? 'locked' : 'door')
    .item('sofaL', 0.2, 0.2, 0, { size: [5.6, 4], ...g })
    .item('lowtable', 1.8, 4.6, 0, { size: [2.4, 1.2], ...g })
    .item('tv', 0.2, 7.2, 270, { size: [2.4, 0.8], ...g })
    .item('speaker', 0.2, 5.6, 0, { size: [1, 0.8], ...g });
}

export function karaoke(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('廚房', 'kitchen', 0, 0, 6, 12)
    .room('員工室', 'office', 6, 0, 6, 6)
    .room('廁所', 'wet', 6, 6, 6, 6)
    .room('走廊', 'hall', 12, 10, 24, 4, { hideLabel: true })
    .room('櫃台大廳', 'public', 0, 12, 12, 12)
    .room('騎樓', 'porch', 0, 24, 36, 4);
  for (const [i, x] of [12, 18, 24, 30].entries()) ktvRoom(b, `包廂 ${i + 1}`, x, false);
  for (const [i, x] of [12, 18, 24].entries()) ktvRoom(b, `包廂 ${i + 5}`, x, true);
  ktvRoom(b, 'VIP 包廂', 30, true, true);
  b.find('VIP 包廂').note = '店長說「今晚包場」。登記的名字每次都不一樣，點的永遠是同一首歌。';
  b.dh(4, 24, 3, -1, 0, 'auto')
    .dv(12, 12, 2, 1, 0, 'open')
    .dh(2, 12, 1.5, -1, 0) // 廚房
    .dv(6, 2, 1.5, 1, 0)
    .dh(8.5, 12, 1.5, -1, 0)
    .wh(8, 24, 3, 'window2')
    .wv(0, 15, 3);
  b.item('kitchen', 0.1, 0.1, 270, { size: [5, 1.3] })
    .item('fridge', 4.5, 5.4, 90)
    .item('counter', 3, 8.4, 0, { size: [2.8, 1.2] })
    .item('locker', 11, 0.6, 90)
    .item('table', 7.4, 3.4, 0, { size: [2.4, 1.2] })
    .item('toilet', 10.3, 6.4, 90)
    .item('toilet', 10.3, 9, 90)
    .item('washbasin', 6.1, 6.4, 270, { size: [1.2, 1] })
    .item('reception', 6.4, 15.4, 90, { size: [4, 1.4] })
    .item('chair', 9.2, 16.4, 90)
    .item('sofa3', 0.1, 17, 270)
    .item('lowtable', 2.3, 18.1, 90)
    .item('plant', 10.4, 22.4)
    .item('vending', 0.1, 22.4, 270, { size: [1.6, 1.2] });
  return [b.f];
}

/* ---------- 健身房（2026-10-29 跟進原作 v1.15；街道在西邊，一層的連鎖健身房） ---------- */

/**
 * 西側面街：有氧區（落地窗，跑步機與健身車面向街）、入口大廳（自動門、櫃檯）、玻璃隔間的瑜珈教室；
 * 中間是器材區（滑輪訓練機、划船機）與自由重量區（深蹲架、臥推架、啞鈴）；
 * 東側的走廊通往員工室、儲藏室、男女更衣室與淋浴間（洗身區）、廁所。
 * 男淋浴間東邊的牆有暗門，通到封起來的舊三溫暖室（GM 專用）。
 */
export function gym(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('道路', 'road', 0, 0, 6, 30)
    .room('人行道', 'porch', 6, 0, 4, 30, { hideLabel: true })
    .room('有氧區', 'public', 10, 0, 12, 11, { lx: -1, ly: 4.6 })
    .room('入口大廳', 'public', 10, 11, 12, 8, { ly: 1.6 })
    .room('瑜珈教室', 'engawa', 10, 19, 12, 11, { wall: 'glass', ly: -3.8 })
    .room('器材區', 'public', 22, 0, 16, 14, { ly: 5.2 })
    .room('自由重量區', 'industrial', 22, 14, 16, 16, { ly: -1.2 })
    .room('走廊', 'hall', 38, 0, 4, 30, { hideLabel: true })
    .room('員工室', 'office', 42, 0, 6, 6, { ly: -1.6 })
    .room('儲藏室', 'storage', 48, 0, 6, 6)
    .room('男更衣室', 'wet', 42, 6, 7, 8, { ly: -2.2 })
    .room('男淋浴間', 'wet', 49, 6, 5, 8, { hideLabel: true })
    .room('女更衣室', 'wet', 42, 14, 7, 8, { ly: -2.2 })
    .room('女淋浴間', 'wet', 49, 14, 5, 8, { hideLabel: true })
    .room('洗手間走道', 'hall', 42, 22, 12, 2, { hideLabel: true })
    .room('男廁', 'wet', 42, 24, 6, 6, { ly: -0.8 })
    .room('女廁', 'wet', 48, 24, 6, 6, { ly: -0.8 })
    .room('舊三溫暖室', 'special', 54, 6, 6, 8, {
      gm: true,
      lx: -0.3,
      ly: 1.7,
      note: '男淋浴間東牆的暗門。三年前封起來的蒸氣室，木長椅上的水氣到現在都沒乾過，地上有人用毛巾排成的記號。',
    });
  b.find('員工室').note = '櫃檯下的抽屜裡有一整串備份鑰匙，其中一把沒有任何門對得上。';

  /* 門窗：街上的入口與落地窗、區域之間的開口、後場 */
  b.dv(10, 13.5, 3, 1, 0, 'auto') // 正面的自動門
    .wv(10, 1.5, 3.5, 'window2')
    .wv(10, 6, 3.5, 'window2')
    .wh(12, 0, 3.5, 'window2')
    .wh(17, 0, 3.5, 'window2')
    .dv(22, 3, 5, 1, 0, 'open') // 有氧區 → 器材區
    .dv(22, 15, 3, 1, 0, 'open') // 大廳 → 自由重量區（閘門）
    .dv(22, 22, 3, 1, 0, 'slidingc') // 瑜珈教室
    .dh(26, 14, 10, 1, 0, 'open') // 器材區 ↔ 自由重量區
    .dv(38, 6, 1.5, 1, 0) // 器材區 → 走廊
    .dv(38, 18, 3, 1, 0, 'door2') // 自由重量區 → 走廊
    .dv(42, 2, 1.5, 1, 0) // 走廊 → 員工室
    .dv(48, 2, 1.5, 1, 0) // 員工室 → 儲藏室
    .dv(42, 9, 1.5, 1, 0) // 男更衣室
    .dv(42, 17, 1.5, 1, 0) // 女更衣室
    .dv(49, 9, 1.5, 1, 0, 'sliding') // 更衣室 → 淋浴間
    .dv(49, 17, 1.5, 1, 0, 'sliding')
    .dv(42, 22, 2, 1, 0, 'open') // 走廊 → 洗手間走道
    .dh(43, 24, 1.5, 1, 0) // 男廁
    .dh(49, 24, 1.5, 1, 0) // 女廁
    .dv(54, 8, 1.5, 1, 0, 'secret') // 淋浴間 → 舊三溫暖室
    .dh(39, 30, 2, 1, 0, 'steel'); // 後門
  b.wall(44.4, 27.4, 48, 27.4, 'thin') // 男廁的隔間
    .wall(44.4, 27.4, 44.4, 30, 'thin')
    .wall(46.2, 27.4, 46.2, 30, 'thin')
    .dh(44.7, 27.4, 1.1, -1, 0)
    .dh(46.5, 27.4, 1.1, -1, 0)
    .wall(48, 27.4, 54, 27.4, 'thin') // 女廁的隔間
    .wall(50, 27.4, 50, 30, 'thin')
    .wall(52, 27.4, 52, 30, 'thin')
    .dh(48.4, 27.4, 1.1, -1, 0)
    .dh(50.4, 27.4, 1.1, -1, 0)
    .dh(52.4, 27.4, 1.1, -1, 0);

  /* 有氧區：兩列面向落地窗（面向西）的跑步機與健身車 */
  for (const y of [0.6, 2.7, 4.8, 6.9]) b.item('treadmill', 10.6, y, 270);
  for (const y of [0.6, 2.4, 4.2, 6.0, 7.8]) b.item('exercise_bike', 16.2, y, 270);
  b.item('speaker', 11, 9.8).item('plant', 20.4, 9.2).item('extinguisher', 21.2, 0.2, 0);

  /* 入口大廳：櫃檯、鞋櫃、長椅 */
  b.item('reception', 13, 12.4)
    .item('chair', 15, 11.2)
    .item('locker', 10.2, 11.2, 270, { size: [2.2, 1], label: '鞋櫃' })
    .item('bench', 12, 17.8, 180)
    .item('plant', 20.4, 11.4)
    .item('vending', 18, 11.2, 0);

  /* 瑜珈教室：四行墊子、前面的音響與投影螢幕 */
  for (const x of [12.4, 14.4, 16.4, 18.4]) b.item('yoga_mat', x, 21.4).item('yoga_mat', x, 25.4);
  b.item('speaker', 11, 19.4)
    .item('speaker', 19.8, 19.4)
    .item('monitor_wall', 13.2, 19.2, 0, { size: [3, 0.6] })
    .item('plant', 11, 28.6);

  /* 器材區：靠北牆的滑輪訓練機、中間的划船機 */
  for (const x of [22.6, 26.4, 30.2, 34]) b.item('cable_machine', x, 0.2);
  for (const x of [24.2, 27.4, 30.6, 33.8]) b.item('rowing_machine', x, 6);
  b.item('dumbbell_rack', 36.9, 9.5, 90).item('vending', 36.6, 3.2, 90);

  /* 自由重量區：南牆邊的三座深蹲架、五張臥推架、東牆邊的啞鈴 */
  for (const x of [23.6, 27.6, 31.6]) b.item('squat_rack', x, 27.4, 180);
  for (const [x, y] of [
    [24, 17],
    [28.4, 17],
    [32.8, 17],
    [28.4, 21.6],
    [32.8, 21.6],
  ])
    b.item('weight_bench', x, y);
  for (const y of [14.5, 22.2, 25.4]) b.item('dumbbell_rack', 36.9, y, 90);

  /* 走廊：自動販賣機、洗手檯、置物櫃 */
  b.item('vending', 40.6, 11.5, 90)
    .item('trough_sink', 40.8, 14.2, 90, { size: [2.4, 1.2] })
    .item('locker', 38.2, 24.5, 270)
    .item('plant', 40.6, 27.2);

  /* 員工室、儲藏室 */
  b.item('office_desk', 43.4, 0.2)
    .item('chair', 44.1, 1.7)
    .item('monitor_wall', 43.2, 5.3, 180, { size: [2.8, 0.6], label: '監視器畫面' })
    .item('filing', 46.7, 4.8, 90)
    .item('cabinet', 48.4, 0.1)
    .item('crate', 48.6, 3.9)
    .item('crate', 52.2, 4.2)
    .item('cardboard', 50.6, 4.6);

  /* 男女更衣室：置物櫃、長椅；淋浴間：個別的淋浴與一排洗身區 */
  for (const y0 of [6, 14]) {
    b.item('locker', 42.1, y0 + 0.1)
      .item('locker', 45.1, y0 + 0.1)
      .item('locker', 43, y0 + 6.9, 180)
      .item('locker', 46, y0 + 6.9, 180)
      .item('bench', 43.5, y0 + 3.5)
      .item('shower', 49.2, y0 + 0.2)
      .item('shower', 51.2, y0 + 0.2);
    for (const x of [49.2, 50.8, 52.4]) b.item('wash_station', x, y0 + 5.8, 180);
  }

  /* 廁所：男廁（小便斗、蹲式與坐式各一間）、女廁（三間：一間坐式、兩間蹲式） */
  b.item('washbasin', 44.8, 24.1).item('washbasin', 46.4, 24.1);
  for (const y of [25.3, 26.5]) b.item('urinal', 42.1, y, 270);
  b.item('squat_toilet', 44.8, 28.4, 180).item('toilet', 46.6, 28.4, 180);
  b.item('washbasin', 50.7, 24.1).item('washbasin', 52.3, 24.1);
  b.item('toilet', 48.5, 28.4, 180)
    .item('squat_toilet', 50.5, 28.4, 180)
    .item('squat_toilet', 52.5, 28.4, 180);
  b.item('trough_sink', 42.2, 28.2, 0, { size: [1.6, 1.2] });

  /* 舊三溫暖室（GM） */
  b.item('bench', 54.4, 6.4, 0, { gm: true, size: [4.6, 1] })
    .item('bench', 54.4, 12.6, 180, { gm: true, size: [4.6, 1] })
    .item('barrel', 58.2, 7.8, 0, { gm: true })
    .item('footprints', 55.4, 7.6, 0, { gm: true });

  /* 街道 */
  b.item('streetlight', 8.4, 3)
    .item('streetlight', 8.4, 9)
    .item('streetlight', 8.4, 25)
    .item('road_arrow', 2, 3)
    .item('road_arrow', 3.6, 12, 180)
    .item('road_arrow', 2, 21);
  return [b.f];
}
