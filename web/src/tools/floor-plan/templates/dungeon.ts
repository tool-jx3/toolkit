/**
 * 地下迷宮（2026-10-22 依 7.18 整個重新設計，本站自己畫的平面圖）：螺旋狀往內收的地下迷宮。
 * 迴廊是一間大房間（石牆），各個房間巢狀地放在裡面，沒蓋到的格子連成一條順時針往內捲的迴廊：
 * 崩落的入口 → 外圈（北、東、南）→ 涉過地底河 → 西 → 第二圈 → 第三圈 → 前室 → 封印的門後的玄室（GM 專用）。
 * 噴泉廣間的暗門、落穴之間是抄近路的地方。只有一層 B1。北邊在上；1 格 = 0.5 m。
 *
 * 局部座標：迴廊 x 0～60、y 0～48；入口的洞窟在它上面（y −10～0）。
 */
import { FloorBuilder, Frame, type TplFloor } from './builder';

export function dungeon(): TplFloor[] {
  const b = new FloorBuilder('B1');
  const m = new Frame(b, 2, 12, 60, 48);
  const stone = { wall: 'stone' } as const;
  /* 崩落的入口（洞窟）與迴廊（先放，沒被房間蓋到的格子就是迴廊） */
  m.room('崩落的入口', 'cave', 0, -10, 12, 10, { ly: 1.6 })
    .room('迴廊', 'stone', 0, 0, 60, 48, { ...stone, lx: -14, ly: -22.5 })
    /* 外圈與第二圈之間（北） */
    .room('骸骨堂', 'stone', 0, 3, 14, 9, { ...stone, ly: 1.6 })
    .room('噴泉廣間', 'stone', 14, 3, 18, 9, { ...stone, ly: 2.6 })
    .room('書庫遺跡', 'stone', 32, 3, 14, 9, { ...stone, lx: 1.4, ly: 2.6 })
    .room('蟲巢', 'cave', 46, 3, 11, 9, { ly: 2.4 })
    /* 東 */
    .room('鍊金工房', 'stone', 48, 12, 9, 10, { ...stone, ly: 2.4 })
    .room('墓守的居室', 'stone', 48, 22, 9, 10, { ...stone, ly: 1.2 })
    .room('蛇窟', 'cave', 48, 32, 9, 13, { lx: -1.6, ly: -3.4 })
    /* 西：落穴之間、地底河（蓋住外圈的西段，要從石橋涉過去） */
    .room('落穴之間', 'stone', 3, 15, 9, 15, { ...stone, ly: -4.6 })
    .room('地底河', 'water', 0, 30, 12, 15, { lx: 1.6 })
    /* 南 */
    .room('鏡之間', 'stone', 12, 36, 16, 9, { ...stone, ly: 2.2 })
    .room('石像之間', 'stone', 28, 36, 20, 9, { ...stone })
    /* 內圈：試煉之間、前室、玄室（GM 專用） */
    .room('試煉之間', 'stone', 12, 15, 21, 6, { ...stone, lx: 3.6 })
    .room('前室', 'stone', 33, 15, 12, 18, { ...stone, ly: -5 })
    .room('玄室', 'danger', 15, 24, 18, 9, {
      ...stone,
      gm: true,
      lx: -4.6,
      ly: -2.6,
      note: '前室西牆的門被七道封印封住。沉睡在石棺裡的「迷宮之主」只要封印少了一道就會醒來——而前一隊冒險者已經撕掉了三道。',
    });
  /* 地底河從西邊的岩縫流進來（水邊對外面沒有牆，手畫岩壁） */
  m.wall(0, 30, 0, 45, 'rock');
  /* 門與開口 */
  m.dh(2, -10, 2, -1, 0, 'hole')
    .dh(4.5, 0, 3, 1, 0, 'hole')
    .dh(6, 3, 1.5, 1, 0)
    .dh(17.5, 3, 3, 1, 0, 'door2')
    .dh(26, 12, 1.5, -1, 0, 'secret')
    .dh(38, 12, 1.5, -1, 0)
    .dv(46, 6, 2, 1, 0, 'hole')
    .dv(57, 8, 2, -1, 0, 'hole')
    .dv(48, 14, 1.5, 1, 0)
    .dv(57, 28, 1.5, -1, 0)
    .dh(52, 45, 2, -1, 0, 'hole')
    .dv(3, 16, 1.5, 1, 0)
    .dv(12, 27, 1.5, -1, 0, 'locked')
    .dh(0, 30, 3, 1, 0, 'open')
    .dh(0, 45, 3, 1, 0, 'open')
    .dh(20, 36, 1.5, 1, 0)
    .dh(37, 36, 3, 1, 0, 'door2')
    .dh(42, 45, 1.5, -1, 0)
    .dh(14, 15, 1.5, 1, 0, 'gate')
    .dv(33, 21.75, 1.5, 1, 0)
    .dv(33, 28, 2, -1, 0, 'sealed');
  /* 入口：梯子、坍方、岩石；迴廊：火把、尖刺陷阱、坑洞、骨頭 */
  m.item('ladder', 8.4, -9.6)
    .item('landslide', 6.5, -6.4)
    .item('rock', 1, -5.4)
    .item('torch', 20, 0.05)
    .item('torch', 40, 0.05)
    .item('torch', 59.15, 20, 90)
    .item('torch', 30, 47.15, 180)
    .item('torch', 0.05, 20, 270)
    .item('spike_trap', 45.5, 25)
    .item('pit', 24, 33.3)
    .item('bones', 57.4, 40)
    .item('wall_claws', 12.6, 44.6, 0);
  /* 骸骨堂、噴泉廣間、書庫遺跡、蟲巢 */
  m.item('coffin', 1, 4)
    .item('coffin', 3.4, 4)
    .item('sarcophagus', 9.5, 5)
    .item('bones', 6.5, 8.8)
    .item('candle', 12.6, 3.4)
    .item('fountain', 21, 5.5)
    .row('pillar', 16.5, 5, 2, 0, 4.5)
    .row('pillar', 29.5, 5, 2, 0, 4.5)
    .item('statue', 14.4, 9.8)
    .item('bookshelf', 33, 3.05)
    .item('bookshelf', 36.2, 3.05)
    .item('bookstack', 34, 6.5)
    .item('bookstack', 34, 9)
    .item('debris', 40.5, 4)
    .item('table', 40.2, 8.4)
    .item('monster_small', 49, 5)
    .item('monster_small', 52.4, 8.6)
    .item('monster_small', 54.6, 4.4)
    .item('flesh', 49.4, 8.6)
    .item('black_stain', 51.4, 4.2);
  /* 鍊金工房、墓守的居室、蛇窟 */
  m.item('lab_bench', 49.5, 12.05)
    .item('cauldron', 51.6, 16.5)
    .item('bookshelf', 56.15, 15, 90)
    .item('chest', 49, 20.95, 180)
    .item('barrel', 55.4, 20.4)
    .item('bed_single', 52.9, 22.3, 90)
    .item('table', 49, 27)
    .item('chair', 49.9, 25.9)
    .item('chest', 48.05, 30.95, 180)
    .item('monster', 52, 37)
    .item('monster_small', 50, 34)
    .item('monster_small', 55, 41.6)
    .item('rock', 49, 42.2)
    .item('bones', 54.4, 34);
  /* 落穴之間、地底河、鏡之間、石像之間 */
  m.item('pit', 4, 18)
    .item('pit', 8, 22)
    .item('pit', 4.5, 26)
    .item('spike_trap', 9, 16)
    .item('stone_bridge', 0.5, 31, 0, { size: [2, 13] })
    .item('rock', 7, 36)
    .item('painting', 14, 36.05, 0, { label: '鏡' })
    .item('painting', 23, 36.05, 0, { label: '鏡' })
    .item('painting', 12.05, 39.5, 270, { label: '鏡' })
    .item('painting', 27.65, 39.5, 90, { label: '鏡' })
    .item('pedestal', 19.2, 40.6)
    .item('crystal_ball', 19.5, 40.9)
    .row('statue', 30, 38.4, 4, 4.4, 0)
    .row('statue', 30, 42, 3, 4.4, 0);
  /* 試煉之間、前室 */
  m.row('spike_trap', 17, 16, 4, 3.4, 0)
    .item('chest', 30.6, 15.6)
    .item('weapon_rack', 12.05, 17.2, 270)
    .item('statue', 34, 26.4)
    .item('statue', 34, 30.4)
    .item('stele', 39, 15.4)
    .item('magic_circle', 37, 21, 0, { size: [6, 6] })
    .item('candle', 43.6, 18)
    .item('candle', 43.6, 30.4);
  /* 玄室（GM 專用）：石棺、迷宮之主、寶箱、魔法陣 */
  m.item('sarcophagus', 16.4, 27, 90, { gm: true })
    .item('monster_boss', 24, 25.5, 0, { gm: true })
    .item('magic_circle', 23.5, 25, 0, { gm: true, size: [7, 7] })
    .item('chest', 16.6, 24.4, 0, { gm: true })
    .item('chest', 16.6, 31.4, 180, { gm: true })
    .item('candle', 31.6, 25, 0, { gm: true })
    .item('candle', 31.6, 31.6, 0, { gm: true });
  return [b.f];
}
