/**
 * 交通・運輸的範本（2026-10 第三批後半，本站自己畫的平面圖）：地方車站、地下鐵車站、地下停車場、渡輪。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor } from './builder';

/** 沿著 x 鋪一排鐵軌（橫向、每段 13 格） */
function railsAlong(b: FloorBuilder, x0: number, x1: number, y: number): void {
  for (let x = x0; x < x1; x += 13)
    b.item('rail_track', x, y, 90, { size: [4, Math.min(13, x1 - x)] });
}

/* ---------- 地方車站（1F 站房、側式月台與島式月台；B1 地下道） ---------- */

/** 兩層同一個位置的樓梯：側式月台一座、島式月台一座 */
function stationStairs(b: FloorBuilder): void {
  b.item('stairs', 6, 21, 90).item('stairs', 6, 10, 90);
}

export function station(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('北側空地', 'gravel', 0, 0, 52, 2, { hideLabel: true })
    .room('鐵軌 2', 'track', 0, 2, 52, 6, { hideLabel: true })
    .room('島式月台', 'platform', 4, 8, 44, 6)
    .room('月台末端', 'gravel', 0, 8, 4, 6, { hideLabel: true })
    .room('月台末端', 'gravel', 48, 8, 4, 6, { hideLabel: true })
    .room('鐵軌 1', 'track', 0, 14, 52, 6, { hideLabel: true })
    .room('第一月台', 'platform', 0, 20, 52, 4)
    .room('售票處', 'office', 8, 24, 6, 10)
    .room('候車室', 'public', 14, 24, 16, 10)
    .room('站長室', 'office', 30, 24, 6, 10)
    .room('廁所', 'wet', 36, 24, 4, 10)
    .room('遺失物保管室', 'storage', 40, 24, 4, 10)
    .room('站前廣場', 'porch', 0, 34, 52, 6);
  stationStairs(g);
  g.dh(20.5, 34, 3, -1, 0, 'door2')
    .dh(19, 24, 6, -1, 0, 'open') // 驗票口
    .dv(14, 31, 1.5, -1, 0)
    .dh(32, 24, 1.5, -1, 0)
    .dv(30, 30, 1.5, 1, 0)
    .dh(37.25, 24, 1.5, -1, 0)
    .dh(41.25, 24, 1.5, -1, 0)
    .wh(9.5, 34, 3)
    .wv(14, 26, 2)
    .wh(15, 34, 4)
    .wh(25, 34, 4)
    .wh(31.5, 34, 3)
    .wv(8, 27, 3)
    .wv(44, 28, 2);
  /* 月台與鐵軌：車擋、站名牌、座椅、小賣店；停在第二線的電車 */
  railsAlong(g, 0, 52, 3);
  railsAlong(g, 0, 52, 15);
  g.item('train_car', 8, 2, 90)
    .item('platform_edge', 0, 20, 0, { size: [52, 1] })
    .item('platform_edge', 4, 8, 180, { size: [44, 1] })
    .item('platform_edge', 4, 13, 0, { size: [44, 1] })
    .item('station_sign', 14, 20.6, 0)
    .item('station_sign', 24, 10.4, 0)
    .row('station_bench', 12, 22.8, 2, 14, 0, 0, { size: [3, 0.9] })
    .item('station_bench', 30, 10.6, 0, { size: [3, 0.9] })
    .item('kiosk', 38, 9.4, 0, { size: [4, 2] })
    .item('vending', 44, 21, 0, { size: [1.6, 1.2] })
    .item('streetlight', 2, 21.4)
    .item('streetlight', 48, 9.4);
  /* 站房 */
  g.item('counter', 12.6, 25, 90, { size: [5, 1.2] })
    .item('chair', 11.4, 27, 90)
    .item('safe', 8.3, 24.3)
    .item('ticket_gate', 19, 26.4)
    .row('bench', 15, 30.6, 3, 4.6, 0, 0, { size: [3.6, 0.9] })
    .item('ticket_machine', 28.9, 26, 90)
    .item('plant', 14.4, 24.4)
    .item('office_desk', 33.4, 30.4, 180)
    .item('chair', 34.1, 29.3)
    .item('radio', 34.9, 27, 90)
    .item('toilet', 38.8, 31.9, 180)
    .item('washbasin', 36.1, 28, 270, { size: [1.2, 1] })
    .item('supply_shelf', 43, 27.6, 90)
    .item('cardboard', 40.4, 31.6);
  g.item('bollard_post', 4, 36)
    .item('bollard_post', 8, 36)
    .item('tree', 0.6, 36.4)
    .item('tree', 47, 36.4)
    .item('road_sign', 34, 37);

  const bm = new FloorBuilder('B1');
  bm.room('地下道', 'hall', 4, 8, 10, 16, { ly: 3 })
    .room('封閉的舊通道', 'danger', 14, 12, 12, 6, {
      gm: true,
      note: '地下道東側的牆是後來砌的。舊通道通往戰前的月台，牆上的站名沒有人認得。',
    });
  stationStairs(bm);
  bm.dv(14, 14, 1.5, 1, 0, 'secret');
  bm.item('quest_board', 4.1, 15, 270, { size: [3, 0.5], label: '尋人海報' })
    .item('bench', 12.9, 18, 90, { size: [3, 0.9] })
    .item('station_sign', 20, 12.1, 0, { gm: true })
    .item('debris', 22, 14.4, 0, { gm: true })
    .item('footprints', 17, 13.4, 90, { gm: true })
    .item('wall_mold', 9, 23.5);
  return [bm.f, g.f];
}

/* ---------- 地下鐵車站（1F 出入口、B1 大廳、B2 島式月台） ---------- */

/** 1F→B1 的樓梯、三層都通的電梯 */
const subwayStairs = (b: FloorBuilder) => b.item('stairs', 7, 9.6);
const subwayLift = (b: FloorBuilder) => b.item('elevator', 30, 11);
/** B1→B2 的樓梯 */
const subwayLower = (b: FloorBuilder) => b.item('stairs', 34, 19.4, 90);

export function subway(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('道路', 'road', 0, 0, 40, 6, { hideLabel: true })
    .room('人行道', 'porch', 0, 6, 40, 12)
    .room('1 號出入口', 'hall', 4, 8, 8, 10, { ly: -3.4 })
    .room('電梯亭', 'hall', 29, 10, 6, 8, { hideLabel: true });
  subwayStairs(g);
  subwayLift(g);
  g.dh(5, 18, 3, -1, 0, 'open').dh(30.5, 18, 2, -1, 0, 'auto');
  g.wv(4, 10, 3, 'window2')
    .wv(12, 10, 3, 'window2')
    .item('streetlight', 16, 6.6)
    .item('tree', 20, 13)
    .item('bollard_post', 26, 6.6)
    .item('bollard_post', 27.4, 6.6)
    .item('road_arrow', 18, 1, 90);

  const b1 = new FloorBuilder('B1');
  b1.room('出入口通道', 'hall', 4, 0, 8, 18, { hideLabel: true })
    .room('廁所', 'wet', 12, 0, 6, 8)
    .room('站務室', 'office', 22, 0, 8, 8)
    .room('大廳', 'public', 12, 8, 28, 16)
    .room('置物櫃區', 'storage', 4, 18, 8, 6);
  subwayStairs(b1);
  subwayLift(b1);
  subwayLower(b1);
  /* 大廳裡的付費區：欄杆＋驗票閘門 */
  b1.wall(20, 8, 20, 13, 'rail').wall(20, 19, 20, 24, 'rail');
  b1.dv(12, 12, 4, 1, 0, 'open')
    .dh(14, 8, 1.5, -1, 0)
    .dh(24, 8, 1.5, -1, 0)
    .dh(6, 18, 4, 1, 0, 'open')
    .dv(30, 3, 1.5, 1, 0); // 站務室通到工作通道（不開放）
  b1.item('ticket_gate', 18.5, 13, 90)
    .item('ticket_machine', 12.1, 18, 270)
    .item('ticket_machine', 12.1, 20, 270)
    .item('atm', 12.1, 22.4, 270)
    .item('toilet', 16.3, 0.2, 90)
    .item('toilet', 16.3, 2.6, 90)
    .item('washbasin', 12.1, 4.4, 270, { size: [1.2, 1] })
    .item('monitor_wall', 22.4, 0.1, 0, { size: [5, 0.6] })
    .item('console', 23, 1.2, 0, { size: [3.6, 1.2] })
    .item('locker', 29, 4.6, 90)
    .row('locker', 4.1, 18.6, 1, 0, 0, 270)
    .item('locker', 8.8, 23, 180)
    .item('station_sign', 26, 8.2)
    .item('cctv', 39.2, 8.4)
    .item('bench', 36, 12, 90, { size: [3, 0.9] });
  b1.room('工作通道', 'hall', 30, 0, 10, 8, { hideLabel: true });
  b1.find('工作通道').gm = true;

  const b2 = new FloorBuilder('B2');
  b2.room('軌道 1', 'track', 0, 0, 48, 6, { hideLabel: true })
    .room('島式月台', 'platform', 0, 6, 48, 12)
    .room('軌道 2', 'track', 0, 18, 48, 6, { hideLabel: true })
    .room('廢棄月台', 'platform', 48, 6, 8, 12, {
      gm: true,
      note: '月台東端的封閉門後面。末班車過後，這裡的燈會自己亮起來。',
    });
  subwayLift(b2);
  subwayLower(b2);
  /* 地下的月台：外圍是牆，月台門是玻璃牆上的自動門，隧道口開著 */
  b2.wall(0, 0, 48, 0, 'ext')
    .wall(0, 24, 48, 24, 'ext')
    .wall(48, 6, 48, 18, 'ext')
    .wall(48, 6, 56, 6, 'ext')
    .wall(48, 18, 56, 18, 'ext')
    .wall(56, 6, 56, 18, 'ext')
    .wall(0, 6, 48, 6, 'glass')
    .wall(0, 18, 48, 18, 'glass');
  b2.dv(48, 11, 2, 1, 0, 'sealed');
  for (const x of [6, 18, 30, 40]) b2.dh(x, 6, 3, 1, 0, 'auto').dh(x, 18, 3, -1, 0, 'auto');
  railsAlong(b2, 0, 48, 1);
  railsAlong(b2, 0, 48, 19);
  b2.item('station_sign', 22, 11.8)
    .row('station_bench', 10, 8, 2, 14, 0, 0, { size: [3, 0.9] })
    .item('vending', 2, 15.6, 180, { size: [1.6, 1.2] })
    .item('pillar', 16, 11.5)
    .item('pillar', 40, 11.5)
    .item('station_bench', 51, 10, 90, { gm: true, size: [3, 0.9] })
    .item('npc_standing', 53, 14, 0, { gm: true })
    .item('wall_mold', 50, 17.6, 0, { gm: true });
  return [b2.f, b1.f, g.f];
}

/* ---------- 地下停車場（1F 坡道入口與管理亭、B1、B2） ---------- */

/** 三層同一個位置的樓梯與電梯（停車區西北角） */
function parkingCore(b: FloorBuilder): void {
  b.room('樓梯・電梯', 'hall', 0, 0, 8, 8, { hideLabel: true });
  b.item('stairs', 0.4, 0.5).item('elevator', 3.4, 0.5);
}

/**
 * 一層停車區：南北兩排停車格、中間的柱子；坡道在東邊（不產生牆）。
 * north＝北排的停車格數（從 x 9 起）、southFrom＝南排從哪裡開始（到 x 34 為止）。
 */
function parkingLevel(b: FloorBuilder, name: string, north = 5, southFrom = 2): void {
  b.room(name, 'industrial', 0, 0, 36, 20, { ly: 0.4 }).room('坡道', 'industrial', 36, 0, 8, 20, {
    noWall: true,
    ly: -4,
  });
  parkingCore(b);
  b.dh(2, 8, 4, 1, 0, 'open');
  b.row('parking_stall', 9, 0.2, north, 5.4, 0, 0, { size: [5, 7] })
    .row('parking_stall', southFrom, 12.8, Math.floor((34 - southFrom) / 5.4), 5.4, 0, 0, {
      size: [5, 7],
    })
    .row('pillar', 8.4, 9.5, 4, 8, 0)
    .item('road_arrow', 39, 8, 0)
    .item('cctv', 35.2, 0.2);
}

export function parking(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('商場一樓', 'public', 8, 0, 22, 14)
    .room('樓梯・電梯', 'hall', 0, 0, 8, 8, { hideLabel: true })
    .room('坡道入口', 'road', 36, 0, 8, 20)
    .room('管理亭', 'office', 30, 14, 6, 6)
    .room('道路', 'road', 0, 20, 48, 6, { hideLabel: true })
    .room('人行道', 'porch', 0, 14, 30, 6, { hideLabel: true })
    .room('空地', 'gravel', 30, 0, 6, 14, { hideLabel: true });
  g.item('stairs', 0.4, 0.5).item('elevator', 3.4, 0.5);
  g.dv(8, 5, 3, 1, 0, 'auto')
    .dh(2, 8, 4, 1, 0, 'auto')
    .dh(15, 14, 4, -1, 0, 'auto')
    .dv(36, 18, 1.5, 1, 0)
    .wh(10, 14, 4, 'window2')
    .wh(22, 14, 4, 'window2')
    .wv(30, 17, 2);
  g.item('barricade', 38.5, 13.4, 0, { size: [3, 0.7] })
    .item('road_sign', 44.6, 15)
    .item('desk', 30.2, 14.2)
    .item('chair', 30.9, 15.5, 180)
    .item('monitor_wall', 35.3, 15, 90, { size: [3, 0.6] })
    .item('store_shelf', 11, 2)
    .item('store_shelf', 11, 6.4)
    .item('store_shelf', 18, 2)
    .item('store_shelf', 18, 6.4)
    .item('register', 25.6, 10.4)
    .item('streetlight', 0.6, 14.4);
  g.find('管理亭').note = '夜班的管理員上週辭職了。巡邏紀錄最後一筆寫著「B2 的燈又自己亮了」。';

  const b1 = new FloorBuilder('B1');
  parkingLevel(b1, '停車區 B1');
  b1.item('car', 9.2, 0.6, 0, { size: [4, 6.4] })
    .item('van', 20, 0.6, 0, { size: [4, 6.4] })
    .item('suv', 13.2, 13.2, 0, { size: [4.2, 6.4] })
    .item('car', 29.4, 13.2, 0, { size: [4, 6.4] })
    .item('cone', 32, 10)
    .item('extinguisher', 8.4, 0.4);

  const b2 = new FloorBuilder('B2');
  parkingLevel(b2, '停車區 B2', 3, 13);
  b2.room('機房', 'garage', 28, 0, 8, 7).room('封鎖區', 'danger', 0, 13, 12, 7, {
    gm: true,
    note: '用工地圍籬封起來的一角。牆上的污漬每天都長大一點，保全拒絕巡到這裡。',
  });
  b2.dh(30, 7, 1.5, 1, 0, 'steel').dh(9, 13, 2, -1, 0, 'gate');
  b2.item('em_generator', 28.4, 0.4, 0, { size: [4, 2] })
    .item('pump', 33.6, 0.4)
    .item('dist_board', 35.3, 3.4, 90)
    .item('car', 20, 0.6, 0, { size: [4, 6.4] })
    .item('barricade', 13, 11, 90, { size: [3, 0.7] })
    .item('black_stain', 2, 15, 0, { gm: true })
    .item('npc_lying', 7.4, 14.4, 90, { gm: true })
    .item('wall_mold', 4, 19.5, 0, { gm: true });
  return [b2.f, b1.f, g.f];
}

/* ---------- 渡輪（B1 機艙與貨艙、1F 客艙、2F 上甲板與駕駛艙） ---------- */

const ferryStairs = (b: FloorBuilder) => b.item('stairs', 10, 3);

export function ferry(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('船尾甲板', 'shipdeck', 0, 0, 8, 16)
    .room('舷側通道', 'shipdeck', 8, 0, 40, 2, { hideLabel: true })
    .room('舷側通道', 'shipdeck', 8, 14, 40, 2, { hideLabel: true })
    .room('客艙大廳', 'public', 8, 2, 28, 12)
    .room('小賣部', 'public', 36, 2, 6, 6)
    .room('廁所', 'wet', 36, 8, 6, 6)
    .room('船員室', 'bedroom', 42, 2, 6, 12)
    .room('船首甲板', 'shipdeck', 48, 2, 8, 12)
    .room('船首甲板', 'shipdeck', 56, 4, 3, 8, { hideLabel: true });
  ferryStairs(g);
  g.dv(0, 6.5, 3, -1, 0, 'open') // 登船口
    .dv(8, 9, 3, -1, 0, 'door2')
    .dh(14, 14, 1.5, 1, 0)
    .dh(30, 2, 1.5, -1, 0)
    .dv(36, 4, 1.5, 1, 0, 'open')
    .dv(36, 10, 1.5, 1, 0)
    .dh(46, 14, 1.5, 1, 0)
    .dv(48, 7, 1.5, 1, 0, 'steel')
    .wh(17, 2, 3)
    .wh(23, 2, 3)
    .wh(20, 14, 3)
    .wh(26, 14, 3)
    .wh(38, 2, 2);
  /* 客艙：一排一排的座位 */
  for (let i = 0; i < 4; i++) {
    g.item('seats', 14, 4 + i * 2.2, 0, { size: [6, 1.2] });
    g.item('seats', 22, 4 + i * 2.2, 0, { size: [6, 1.2] });
  }
  g.item('tv', 35, 5.6, 90, { size: [3, 0.8] })
    .item('liferaft', 1, 1)
    .item('liferaft', 1, 12.6)
    .item('bollard', 3, 14.6)
    .item('bollard', 3, 0.4)
    .item('counter', 38, 2.2, 0, { size: [3.6, 1.1] })
    .item('fridge_case', 40.6, 4.6, 90, { size: [2.4, 1.2] })
    .item('toilet', 40.3, 11.6, 90)
    .item('washbasin', 36.4, 12.8, 180, { size: [1.2, 1] })
    .item('bunk_bed', 45.8, 2.2)
    .item('bunk_bed', 43.4, 9.8, 0)
    .item('locker', 42.1, 2.8, 270)
    .item('anchor', 52, 6.6)
    .item('bollard', 50, 3)
    .item('bollard', 50, 11.8);

  const u = new FloorBuilder('2F');
  u.room('上甲板', 'shipdeck', 8, 0, 40, 16, { lx: -10 })
    .room('船長室', 'bedroom', 28, 4, 8, 8)
    .room('駕駛艙', 'tech', 36, 4, 8, 8);
  ferryStairs(u);
  u.dv(36, 7, 1.5, -1, 0)
    .dh(38, 12, 1.5, 1, 0)
    .dh(30, 12, 1.5, 1, 0)
    .wv(44, 5, 2)
    .wv(44, 9, 2)
    .wh(39, 4, 3);
  u.item('lifeboat', 14, 0.4, 90)
    .item('lifeboat', 14, 11.6, 90)
    .item('bench', 9, 8, 90, { size: [3, 0.9] })
    .item('radar', 46, 6.4, 90)
    .item('helm', 41.4, 7.2)
    .item('chart_table', 36.4, 4.2)
    .item('console', 42.4, 4.2, 90, { size: [2.8, 1.4] })
    .item('bed_single', 28.2, 4.2)
    .item('desk', 33.4, 4.2)
    .item('safe', 34.6, 10.6);

  const bm = new FloorBuilder('B1');
  bm.room('機艙', 'industrial', 8, 2, 28, 12)
    .room('貨艙', 'storage', 36, 2, 12, 12)
    .room('船底密艙', 'danger', 48, 4, 6, 8, {
      gm: true,
      note: '貨艙最裡面的隔板是暗門。不在載貨單上的「貨」在這裡，它們還在動。',
    });
  ferryStairs(bm);
  bm.dv(36, 7, 3, 1, 0, 'door2').dv(48, 7, 1.5, 1, 0, 'secret');
  bm.item('ship_engine', 16, 3)
    .item('ship_engine', 24, 3)
    .item('pipe_big', 9, 12.4, 0, { size: [8, 1.2] })
    .item('control_panel', 31, 2.1)
    .item('boiler', 31, 9.4)
    .item('container', 38, 2.4, 90, { size: [4, 9] })
    .item('crate', 38.4, 8.6)
    .item('crate', 40.2, 8.6)
    .item('car', 41.6, 9.8, 90, { size: [3.6, 6] })
    .item('ship_hatch', 45.2, 2.4)
    .item('cage', 50.6, 4.4, 0, { gm: true, size: [3, 3] })
    .item('flesh', 50, 8.6, 0, { gm: true, size: [2, 2] })
    .item('chains', 48.4, 11.2, 180, { gm: true, size: [2.4, 0.6] });
  return [bm.f, g.f, u.f];
}
