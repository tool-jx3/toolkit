/**
 * 古城（2026-10-22 依 7.18 整個重新設計，本站自己畫的平面圖）：湖岬上的石造城。
 * 南邊的石堤道跨過湖面接到門樓，進去是外庭（鍛冶場、糧倉、守備隊宿舍、西南箭塔），
 * 內牆的格柵門後是內庭與北塔，東端臨湖的主塔有三層（B1 地窖、水牢、蓄水池；1F 守衛廳、武器庫、地圖室；
 * 2F 宴會廳、城主寢室、書記室與觀湖露台）。B1 走廊盡頭的暗門後，密道通到湖底的祕密碼頭（GM 專用）。
 * 城牆是手畫的石牆（戶外的地面本來沒有牆），房間的牆是石牆。北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, Frame, fillYard, type TplFloor } from './builder';

/**
 * 局部座標（左上角放在 (−1, 3)，所以敷地是 x 3～69、y 3～51）：外庭 x 10～40、內庭 x 40～56、主塔 x 56～68，
 * 湖在南邊與東邊。敷地的寬高與位置讓三層排成一張匯出時（每格 48 px、棋子方格對齊）不超過畫布的上限（4,000 萬 px）。
 */
const castleFrame = (b: FloorBuilder) => new Frame(b, -1, 3, 76, 48);
/** 主塔的螺旋梯（B1～2F 同一個位置） */
const castleStairs = (m: Frame) => m.item('spiral', 63.5, 6.5);

/** 範圍裡最大的那一塊顯示名字 */
function labelBiggest(b: FloorBuilder, name: string): void {
  const big = b.f.rooms
    .filter((r) => r.name === name)
    .reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a));
  delete big.hideLabel;
}

export function castle(): TplFloor[] {
  /* ---------- 1F：堤道、門樓、外庭、內庭、主塔 ---------- */
  const g = new FloorBuilder('1F');
  const m = castleFrame(g);
  const stone = { wall: 'stone' } as const;
  m.room('外庭', 'dirt', 10, 14, 30, 24, { lx: -5, ly: 1 })
    .room('內庭', 'porch', 40, 6, 16, 24, { ly: 3 })
    .room('鍛冶場', 'stone', 10, 6, 10, 8, stone)
    .room('糧倉', 'storage', 20, 6, 10, 8, stone)
    .room('守備隊宿舍', 'stone', 30, 6, 10, 8, { ...stone, lx: 2, ly: 3.2 })
    .room('北塔', 'stone', 40, 0, 6, 6, stone)
    .room('西南箭塔', 'stone', 4, 32, 6, 6, { ...stone, ly: 1.4 })
    .room('南門樓', 'stone', 30, 38, 6, 4, stone)
    .room('堤道', 'dirt', 30, 42, 6, 6, { ly: 1 })
    .room('守衛廳', 'stone', 56, 6, 6, 14, stone)
    .room('螺旋梯', 'stone', 62, 6, 6, 6, { ...stone, hideLabel: true })
    .room('武器庫', 'stone', 62, 12, 6, 8, { ...stone, ly: -0.4 })
    .room('地圖室', 'stone', 56, 20, 12, 10, { ...stone, ly: -3.2 });
  /* 湖與山坡（fillYard 用敷地的座標：局部的 x − 1、y ＋ 3） */
  fillYard(g, 39, 33, 69, 51, '湖', 'water');
  fillYard(g, 3, 41, 39, 51, '湖', 'water');
  fillYard(g, 67, 3, 69, 33, '湖', 'water');
  fillYard(g, 3, 3, 69, 41, '山坡', 'garden');
  labelBiggest(g, '湖');
  labelBiggest(g, '山坡');
  castleStairs(m);
  /* 城牆（手畫的石牆）：外庭的西、南，內牆（外庭與內庭之間）、內庭的北、南 */
  m.wall(10, 14, 10, 32, 'stone')
    .wall(10, 38, 30, 38, 'stone')
    .wall(36, 38, 40, 38, 'stone')
    .wall(40, 14, 40, 38, 'stone')
    .wall(40, 30, 56, 30, 'stone')
    .wall(46, 6, 56, 6, 'stone');
  /* 門：門樓（大型雙開門、格柵門）、內牆的格柵門、各棟的門 */
  m.dh(30.5, 38, 5, -1, 0, 'big2')
    .dh(31.5, 42, 3, 1, 0, 'gate')
    .dv(40, 20, 2, 1, 0, 'gate')
    .dh(13, 14, 3, 1, 0, 'open')
    .dh(24, 14, 1.5, -1, 0)
    .dh(33, 14, 1.5, -1, 0)
    .dv(40, 11, 1.5, 1, 0)
    .dh(42, 6, 1.5, -1, 0)
    .dv(10, 34, 1.5, -1, 0)
    .dv(56, 8, 3, 1, 0, 'door2')
    .dv(62, 9, 1.5, 1, 0)
    .dv(62, 15, 1.5, 1, 0, 'locked')
    .dh(57, 20, 1.5, 1, 0)
    /* 箭窗 */
    .wh(14, 6, 1)
    .wh(25, 6, 1)
    .wh(35, 6, 1)
    .wv(4, 34.5, 1)
    .wh(42.5, 0, 1)
    .wv(68, 14, 1)
    .wv(68, 24, 1)
    .wh(60, 30, 1)
    .wh(65, 30, 1);
  /* 鍛冶場、糧倉、守備隊宿舍 */
  m.item('forge', 11, 6.05)
    .item('anvil', 15, 8)
    .item('barrel', 18.4, 6.4)
    .item('weapon_rack', 18.95, 9.5, 90)
    .item('workbench', 10.05, 9, 270)
    .row('barrel', 20.4, 6.4, 4, 1.4, 0)
    .item('crate', 26.5, 6.4)
    .item('crate', 28.2, 6.4)
    .item('hay', 20.6, 10.6)
    .item('hay', 26.4, 10.6)
    .row('bunk_bed', 30.3, 6.1, 3, 2.3, 0)
    .item('table', 35.4, 11)
    .item('chest', 37.4, 6.2);
  /* 外庭：井、樹、乾草、推車；內庭：石像、樹；北塔、箭塔、門樓 */
  m.item('well', 22, 26)
    .item('tree', 12.4, 17)
    .item('hay', 36.5, 15)
    .item('hand_cart', 16, 33.5)
    .item('tent', 28, 29.6)
    .item('campfire', 25.6, 34)
    .item('log', 22.2, 34.4)
    .item('armor_stand', 26, 16)
    .item('statue', 47, 17)
    .item('tree', 51.5, 25)
    .item('garden_bench', 44, 26.6, 180)
    .item('torch', 44.95, 2, 90)
    .item('crate', 40.5, 0.5)
    .item('barrel', 4.5, 32.5)
    .item('crate', 7.9, 36.2)
    .item('torch', 30.05, 39.6, 270)
    .item('torch', 35.15, 39.6, 90);
  /* 主塔 1F：守衛廳、武器庫、地圖室 */
  m.item('bench', 56.05, 13, 270)
    .item('table', 58.8, 13.4, 90)
    .item('armor_stand', 60.6, 6.3)
    .item('weapon_rack', 66.95, 12.5, 90)
    .item('weapon_rack', 66.95, 16, 90)
    .item('armor_stand', 63, 17.8)
    .item('armor_stand', 64.6, 17.8)
    .item('chest', 63, 12.3)
    .item('ops_table', 59.5, 23.4)
    .item('chair', 60.5, 22.3)
    .item('chair', 62.5, 22.3)
    .item('chair', 60.5, 27.1, 180)
    .item('chair', 62.5, 27.1, 180)
    .item('bookshelf', 67.15, 21, 90)
    .item('banner', 64.6, 29.35, 180);
  /* 山坡與湖：樹、岩石、小船 */
  m.item('tree', 5, 1)
    .item('tree', 5, 26)
    .item('tree', 24, 0.5)
    .item('rock', 5.5, 19)
    .item('boat', 44, 40)
    .item('rock', 20, 44);

  /* ---------- 2F：主塔的前室、宴會廳、城主寢室、書記室、觀湖露台 ---------- */
  const u = new FloorBuilder('2F');
  const n = castleFrame(u);
  n.room('螺旋梯', 'stone', 62, 6, 6, 6, { ...stone, hideLabel: true })
    .room('前室', 'stone', 56, 6, 6, 6, stone)
    .room('宴會廳', 'stone', 56, 12, 12, 12, { ...stone, ly: -3.8 })
    .room('城主寢室', 'bedroom', 56, 24, 6, 6, { ...stone, lx: -0.6, ly: -1.6 })
    .room('書記室', 'office', 62, 24, 6, 6, { ...stone, lx: 0.4, ly: -1.6 })
    .room('觀湖露台', 'balcony', 56, 30, 12, 4);
  castleStairs(n);
  n.dv(62, 9, 1.5, -1, 0)
    .dh(57, 12, 3, 1, 0, 'door2')
    .dh(60, 24, 1.5, 1, 0)
    .dh(64, 24, 1.5, 1, 0)
    .dh(60.25, 30, 1.5, 1, 0)
    .dh(64, 30, 1.5, 1, 0)
    .wv(68, 19, 2)
    .wv(56, 16.75, 1.5)
    .wv(56, 8, 1.5);
  /* 宴會廳：長桌、壁爐、王座、旗幟 */
  n.item('table', 58.5, 16.4, 0, { size: [8, 2] })
    .row('chair', 59, 15.3, 3, 2.5, 0)
    .row('chair', 59, 18.5, 3, 2.5, 0, 180)
    .item('fireplace', 66.8, 13.5, 90)
    .item('throne', 60.8, 20.8, 180)
    .item('banner', 56.05, 14, 270)
    .item('banner', 56.05, 19, 270)
    .item('candle', 62.1, 16.9);
  /* 城主寢室、書記室、露台 */
  n.item('bed_canopy', 56.05, 26.2, 270)
    .item('chest', 56.05, 24.3, 270)
    .item('desk', 66.75, 25.5, 90)
    .item('chair', 65.6, 26.2, 90)
    .item('bookshelf', 62.05, 26, 270)
    .item('chair', 66.4, 32.4);

  /* ---------- B1：衛兵室、地窖、水牢、蓄水池；暗門後的密道與湖底的祕密碼頭（GM 專用） ---------- */
  const bm = new FloorBuilder('B1');
  const k = castleFrame(bm);
  const hidden = { gm: true } as const;
  k.room('螺旋梯', 'stone', 62, 6, 6, 6, { ...stone, hideLabel: true })
    .room('衛兵室', 'stone', 56, 6, 6, 6, stone)
    .room('地下走廊', 'stone', 60, 12, 4, 18, { ...stone, hideLabel: true })
    .room('地窖', 'storage', 56, 12, 4, 10, stone)
    .room('水牢', 'stone', 56, 22, 4, 8, stone)
    .room('蓄水池', 'water', 64, 12, 4, 18)
    .room('密道', 'cave', 60, 30, 4, 8, {
      ...hidden,
      note: '地下走廊盡頭的牆是暗門。通道一路往下，牆上有新刻的記號，通到湖底的祕密碼頭。',
    })
    .room('祕密碼頭', 'cave', 56, 38, 12, 4, {
      ...hidden,
      note: '歷代城主逃走用的碼頭。最近有人用過：小船還是濕的，木箱裡裝的不是糧食。',
    })
    .room('地下水道', 'water', 58, 42, 8, 6, { ...hidden, ly: 1.6 });
  castleStairs(k);
  /* 蓄水池、地下水道的外圍（水邊對外面沒有牆）；水道的南端通到湖 */
  k.wall(68, 12, 68, 30, 'stone')
    .wall(64, 30, 68, 30, 'stone')
    .wall(58, 42, 58, 48, 'rock')
    .wall(66, 42, 66, 48, 'rock');
  k.dh(62.25, 12, 1.5, 1, 0)
    .dh(60.25, 12, 1.5, 1, 1)
    .dv(60, 15, 1.5, -1, 0)
    .dv(60, 25, 2, -1, 0, 'gate')
    .dv(64, 20, 1.5, 1, 0, 'open')
    .dh(61.25, 30, 1.5, 1, 0, 'secret');
  /* 衛兵室、地窖、水牢、走廊 */
  k.item('weapon_rack', 56.05, 6.5, 270)
    .item('table', 57.4, 8.6)
    .item('chair', 58.2, 10.3, 180)
    .row('barrel', 56.2, 12.4, 4, 0, 1.4)
    .item('crate', 56.3, 20.2)
    .item('crate', 58.2, 20.2)
    .item('chains', 56.05, 24, 270)
    .item('puddle', 57, 26.2)
    .item('bones', 57.2, 28.4)
    .item('torch', 60.05, 19, 270)
    .item('torch', 63.15, 26, 90)
    .item('valve', 64.4, 12.4);
  /* 密道、祕密碼頭、地下水道（GM 專用） */
  k.item('footprints', 61.5, 33, 0, hidden)
    .item('crate', 56.5, 38.4, 0, hidden)
    .item('barrel', 66.4, 38.4, 0, hidden)
    .item('bollard', 59, 40.6, 0, hidden)
    .item('boat', 61, 42.6, 0, hidden);
  return [bm.f, g.f, u.f];
}
