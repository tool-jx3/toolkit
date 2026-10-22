/**
 * 工業・設施的範本（2026-10 第三批後半，本站自己畫的平面圖）：工廠、港口倉庫、工地、下水道。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor } from './builder';

/* ---------- 工廠（1F 廠房、倉庫、卸貨區；2F 辦公層與監看走道） ---------- */

const factoryStairs = (b: FloorBuilder) => b.item('stairs', 11.6, 22.6);

export function factory(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('廠房', 'industrial', 0, 0, 32, 20)
    .room('倉庫', 'storage', 32, 0, 16, 16)
    .room('卸貨區', 'road', 32, 16, 16, 12)
    .room('更衣室', 'wet', 0, 20, 8, 8)
    .room('樓梯間', 'hall', 8, 20, 6, 8, { hideLabel: true })
    .room('鍋爐室', 'garage', 14, 20, 8, 8)
    .room('品管室', 'office', 22, 20, 10, 8)
    .room('廠區道路', 'road', 0, 28, 48, 6, { hideLabel: true });
  factoryStairs(g);
  g.dv(32, 6, 5, 1, 0, 'big2')
    .dh(36, 16, 5, 1, 0, 'shutter')
    .dv(32, 16.5, 3, 1, 0, 'shutter')
    .dh(2, 20, 1.5, -1, 0)
    .dh(9, 20, 4, -1, 0, 'open')
    .dh(17, 20, 1.5, -1, 0, 'steel')
    .dh(24, 20, 1.5, -1, 0)
    .dh(10, 28, 1.5, -1, 0) // 員工出入口
    .dv(0, 8, 3, -1, 0, 'firedoor')
    .wh(4, 0, 4)
    .wh(14, 0, 4)
    .wh(24, 0, 4)
    .wh(38, 0, 4)
    .wh(26, 28, 3)
    .wv(48, 4, 3);
  /* 廠房：兩條輸送帶、車床、化學槽、堆高機 */
  g.item('conveyor', 3, 4)
    .item('conveyor', 3, 10)
    .row('machine_tool', 16, 0.3, 3, 4, 0)
    .item('ind_tank', 28.6, 0.4)
    .item('workbench', 16, 7.4, 0, { size: [4, 1.6] })
    .item('workbench', 22, 7.4, 0, { size: [4, 1.6] })
    .item('forklift', 26, 12, 90)
    .item('pallet_stack', 16, 14)
    .item('pallet', 19, 14)
    .item('drum', 27.8, 16.4)
    .item('drum', 29.2, 17.6)
    .item('control_panel', 0.1, 14, 270)
    .item('extinguisher', 0.4, 19);
  /* 倉庫、卸貨區 */
  g.item('pallet_rack', 39.6, 0.2)
    .item('pallet_rack', 39.6, 4.4, 180)
    .item('pallet_rack', 39.6, 7.4)
    .item('pallet_stack', 33, 0.6)
    .item('pallet', 33, 11.6)
    .item('hand_cart', 45.4, 11.6)
    .item('truck', 32, 22, 90)
    .item('cone', 45.4, 18.4);
  /* 更衣室、鍋爐室、品管室 */
  g.item('locker', 0.1, 21.5, 270)
    .item('locker', 0.1, 24.6, 270)
    .item('shower', 6, 26, 180, { size: [1.8, 1.8] })
    .item('bench', 3, 25.6, 90, { size: [2, 0.8] })
    .item('boiler', 14.4, 25.4, 180)
    .item('pump', 19.6, 25.6, 180)
    .item('dist_board', 21.3, 21.6, 90)
    .item('lab_bench', 26, 26.2, 180)
    .item('microscope', 22.6, 26.4)
    .item('desk', 30.6, 22, 90)
    .item('chair', 29.4, 22.6, 270)
    .item('filing', 22.2, 22.4, 270);

  const u = new FloorBuilder('2F');
  u.room('監看走道', 'grate', 0, 16, 26, 4, { wall: 'glass', ly: -0.4 })
    .room('密封儲藏室', 'special', 26, 16, 6, 4, {
      gm: true,
      note: '廠長室牆上的配電箱是暗門。廠長把出事那天的「樣品」鎖在這裡，罐子上的日期全是同一天。',
    })
    .room('會議室', 'office', 0, 20, 8, 8)
    .room('樓梯間', 'hall', 8, 20, 6, 8, { hideLabel: true })
    .room('辦公室', 'office', 14, 20, 12, 8)
    .room('廠長室', 'office', 26, 20, 6, 8);
  factoryStairs(u);
  u.dh(9, 20, 4, -1, 0, 'open')
    .dh(2, 20, 1.5, 1, 0)
    .dh(16, 20, 1.5, 1, 0)
    .dv(26, 24, 1.5, 1, 0)
    .dh(28, 20, 1.5, -1, 0, 'secret')
    .wh(2, 28, 3)
    .wh(17, 28, 3)
    .wh(22, 28, 3)
    .wh(27.5, 28, 3)
    .wv(32, 22, 2);
  u.item('meeting6', 1.6, 22.6, 90, { size: [3.6, 4.8] })
    .item('desk_island', 15.6, 22.4, 0, { size: [5, 4] })
    .item('copier', 24.4, 26.4, 180)
    .item('filing', 21.6, 26.6, 180)
    .item('office_desk', 28.4, 25.4, 180)
    .item('chair', 29.1, 24.3)
    .item('safe', 30.6, 21.6)
    .item('ind_tank', 28.4, 16.4, 0, { gm: true, size: [1.6, 1.6] })
    .item('ind_tank', 30.2, 16.4, 0, { gm: true, size: [1.6, 1.6] });
  return [g.f, u.f];
}

/* ---------- 港口倉庫（貨櫃堆場、兩棟倉庫、碼頭） ---------- */

export function warehouse(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('守衛亭', 'office', 0, 0, 6, 6)
    .room('貨櫃堆場', 'road', 6, 0, 46, 8)
    .room('倉庫 A', 'storage', 0, 8, 24, 20)
    .room('倉庫辦公室', 'office', 0, 8, 8, 6)
    .room('通道', 'road', 24, 8, 4, 20, { hideLabel: true })
    .room('倉庫 B', 'storage', 28, 8, 24, 20)
    .room('改裝貨櫃', 'industrial', 44, 12, 5, 12, {
      gm: true,
      note: '倉庫 B 最裡面的貨櫃改裝成了房間：通風口、床墊、從外面上鎖的門。',
    })
    .room('碼頭', 'porch', 0, 28, 52, 4)
    .room('港灣', 'water', 0, 32, 52, 6);
  b.dh(6, 28, 5, -1, 0, 'shutter')
    .dv(24, 14, 5, -1, 0, 'shutter')
    .dh(14, 8, 3, -1, 0, 'door2')
    .dv(8, 10, 1.5, 1, 0)
    .dv(28, 14, 5, 1, 0, 'shutter')
    .dh(36, 28, 5, -1, 0, 'shutter')
    .dh(32, 8, 3, -1, 0, 'door2')
    .dv(44, 16, 1.5, -1, 0, 'locked')
    .dv(6, 2, 1.5, 1, 0)
    .wh(2, 8, 2)
    .wv(0, 10, 2)
    .wh(2, 0, 2);
  /* 堆場的貨櫃、守衛亭 */
  b.item('container', 10, 1.5, 90)
    .item('container', 24, 1.5, 90)
    .item('container', 38, 1.5, 90)
    .item('desk', 0.2, 0.2)
    .item('chair', 0.9, 1.5, 180)
    .item('monitor_wall', 0.1, 3.2, 270, { size: [2.4, 0.6] });
  /* 倉庫 A：重型貨架、木箱、堆高機；辦公室 */
  b.item('office_desk', 0.3, 11.4, 270)
    .item('chair', 1.8, 12, 90)
    .item('filing', 5.4, 8.1)
    .item('pallet_rack', 12, 10.4, 0, { size: [10, 2.2] })
    .item('pallet_rack', 12, 15.4, 0, { size: [10, 2.2] })
    .item('big_crate', 1, 18)
    .item('big_crate', 4.4, 18)
    .item('crate', 1, 21)
    .item('forklift', 15, 20.6, 90)
    .item('pallet_stack', 20.6, 24.6);
  /* 倉庫 B：卸下來的貨、改裝貨櫃（GM 專用） */
  b.item('container', 30.4, 9.4, 0, { size: [5, 10] })
    .item('big_crate', 37, 10)
    .item('big_crate', 37, 13)
    .item('pallet', 37.4, 20)
    .item('crate', 49.6, 25.4)
    .item('futon', 46.4, 13, 0, { gm: true, size: [1.8, 3.6] })
    .item('vent', 47.6, 22.6, 0, { gm: true })
    .item('chains', 44.4, 22.8, 0, { gm: true, size: [2.4, 0.6] });
  /* 碼頭 */
  b.row('bollard', 3, 30.2, 5, 11, 0)
    .item('boat', 20, 33, 90)
    .item('anchor', 43.6, 29.4)
    .item('streetlight', 26, 28.6);
  return [b.f];
}

/* ---------- 工地（施工中的兩層樓：1F、2F 樓板；圍起來的開挖區是 GM 專用） ---------- */

const siteStairs = (b: FloorBuilder) => b.item('temp_stairs', 31.2, 8);

export function construction(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('工地', 'dirt', 0, 0, 48, 36, { lx: -16, ly: -14 })
    .room('一樓樓板', 'slab', 8, 6, 28, 20)
    .room('工務所', 'office', 37, 2, 10, 8, { wall: 'thin' })
    .room('流動廁所', 'wet', 38, 12, 3, 3, { hideLabel: true })
    .room('材料堆置場', 'gravel', 0, 28, 10, 8)
    .room('開挖區', 'cave', 14, 28, 10, 6, {
      gm: true,
      note: '打地基時挖到的古井。工人說井底有東西在敲，第二天就停工了。',
    });
  siteStairs(g);
  /* 工地的圍籬、開挖區的圍籬 */
  g.wall(0, 0, 48, 0, 'fence')
    .wall(0, 0, 0, 36, 'fence')
    .wall(48, 0, 48, 36, 'fence')
    .wall(0, 36, 48, 36, 'fence')
    .wall(14, 28, 24, 28, 'fence')
    .wall(14, 28, 14, 34, 'fence')
    .wall(24, 28, 24, 34, 'fence')
    .wall(14, 34, 24, 34, 'fence');
  g.dh(26, 36, 6, -1, 0, 'open') // 工地出入口
    .dh(17, 28, 2, -1, 0, 'gate')
    .dv(37, 6, 1.5, -1, 0)
    .dh(39, 15, 1.5, 1, 0)
    .wh(39, 10, 3)
    .wh(43.5, 2, 2);
  /* 樓板上的柱子、建材 */
  for (const x of [10, 18, 26, 34]) for (const y of [8, 16, 24]) g.item('pillar', x - 0.5, y - 0.5);
  g.item('building_materials', 11, 11)
    .item('scaffold', 10.6, 6.4, 0, { size: [6, 1.6] })
    .item('material_pile', 2, 2)
    .item('excavator', 1.6, 9)
    .item('building_materials', 1, 30)
    .item('pallet_stack', 2, 32.4)
    .item('drum', 6.6, 33.6)
    .item('cone', 27, 33.6)
    .item('cone', 30.4, 33.6)
    .item('barricade', 36.6, 29.2, 90, { size: [3, 0.7] })
    .item('office_desk', 40, 2.4)
    .item('chair', 40.7, 3.9, 180)
    .item('whiteboard', 46.5, 4.4, 90)
    .item('filing', 37.2, 8.6)
    .item('toilet', 39, 12.2)
    .item('well', 18, 30, 0, { gm: true })
    .item('abyss', 20.6, 30.4, 0, { gm: true, size: [2.4, 2.4] })
    .item('landslide', 15, 31, 0, { gm: true, size: [2.6, 2.4] });

  const u = new FloorBuilder('2F');
  u.room('二樓樓板', 'slab', 8, 6, 28, 20);
  siteStairs(u);
  for (const x of [10, 18, 26, 34]) for (const y of [8, 16, 24]) u.item('pillar', x - 0.5, y - 0.5);
  u.item('scaffold', 10.6, 24, 0, { size: [6, 1.6] })
    .item('building_materials', 12, 12)
    .item('material_pile', 21, 18)
    .item('tools', 28, 12)
    .item('cardboard', 14, 20);
  return [g.f, u.f];
}

/* ---------- 下水道（1F 街道的人孔、B1 渠道與檢修步道） ---------- */

/** 兩層同一個位置的梯子（人孔） */
function sewerLadders(b: FloorBuilder): void {
  b.item('ladder', 5.4, 4.6).item('ladder', 33.4, 4.6);
}

export function sewer(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('街道', 'road', 0, 0, 40, 12, { lx: 8 }).room('人行道', 'porch', 0, 12, 40, 4, {
    hideLabel: true,
  });
  sewerLadders(g);
  g.item('manhole', 5.2, 8)
    .item('manhole', 33.2, 8)
    .item('streetlight', 20, 12.4)
    .item('road_arrow', 14, 3, 90)
    .item('cone', 3.4, 8.4)
    .item('grating', 24, 11.2);

  const bm = new FloorBuilder('B1');
  bm.room('豎井 1', 'slab', 4, 4, 4, 4, { hideLabel: true })
    .room('豎井 2', 'slab', 32, 4, 4, 4, { hideLabel: true })
    .room('北側步道', 'slab', 0, 8, 40, 3, { lx: 4 })
    .room('主渠道', 'water', 0, 11, 40, 4)
    .room('南側步道', 'slab', 0, 15, 40, 3, { lx: -6 })
    .room('南支渠', 'water', 18, 18, 4, 10, { hideLabel: true })
    .room('支渠步道', 'slab', 22, 18, 2, 10, { hideLabel: true })
    .room('泵站', 'industrial', 26, 18, 10, 8)
    .room('祭壇空洞', 'cave', 4, 18, 10, 10, {
      gm: true,
      note: '南側步道的磚牆後面。下水道工程時挖到、又被封起來的空洞，祭壇上的蠟燭還是熱的。',
    });
  sewerLadders(bm);
  /* 渠道與步道的外牆（磚造的石牆）；渠道兩端繼續延伸 */
  bm.wall(4, 4, 8, 4, 'stone')
    .wall(4, 4, 4, 8, 'stone')
    .wall(8, 4, 8, 8, 'stone')
    .wall(32, 4, 36, 4, 'stone')
    .wall(32, 4, 32, 8, 'stone')
    .wall(36, 4, 36, 8, 'stone')
    .wall(0, 8, 4, 8, 'stone')
    .wall(8, 8, 32, 8, 'stone')
    .wall(36, 8, 40, 8, 'stone')
    .wall(0, 18, 18, 18, 'stone')
    .wall(18, 18, 18, 28, 'stone')
    .wall(24, 18, 26, 18, 'stone')
    .wall(24, 18, 24, 28, 'stone')
    .wall(36, 18, 40, 18, 'stone')
    .wall(18, 28, 24, 28, 'bars');
  bm.dh(8.5, 18, 1.5, 1, 0, 'secret').dh(28, 18, 1.5, 1, 0, 'steel');
  bm.item('pump', 27, 23.6, 180)
    .item('pump', 30, 23.6, 180)
    .item('control_panel', 33.4, 18.1)
    .item('pipe_big', 26.4, 19.6, 0, { size: [6, 1.2] })
    .item('sluice', 17, 11, 90, { size: [4, 1] })
    .item('valve', 37, 9)
    .item('debris', 12, 8.3, 0, { size: [2, 1.6] })
    .item('altar', 6.6, 25.6, 180, { gm: true })
    .item('candle', 5, 26.4, 0, { gm: true })
    .item('candle', 10, 26.4, 0, { gm: true })
    .item('bones', 11, 21, 0, { gm: true })
    .item('wall_mold', 28, 7.5)
    .item('crack_wall', 2, 17.6);
  return [bm.f, g.f];
}
