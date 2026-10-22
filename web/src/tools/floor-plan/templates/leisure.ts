/**
 * 娛樂・表演的範本（2026-10 第三批後半，本站自己畫的平面圖）：劇場、KTV。
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
