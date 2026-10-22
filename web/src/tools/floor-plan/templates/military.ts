/**
 * 軍警・保全的範本（2026-10 第三批後半，本站自己畫的平面圖）：軍事基地、監獄。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 軍事基地（1F 營區、B1 地下指揮所） ---------- */

const baseStairs = (b: FloorBuilder) => b.item('stairs', 38.4, 8.4);

export function militaryBase(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('營舍', 'bedroom', 2, 2, 20, 12)
    .room('餐廳', 'kitchen', 2, 18, 20, 10)
    .room('司令室', 'office', 38, 2, 8, 12)
    .room('作戰室', 'office', 46, 2, 12, 12)
    .room('車庫', 'garage', 28, 20, 18, 14)
    .room('彈藥庫', 'danger', 48, 20, 10, 10)
    .room('操場', 'dirt', 2, 30, 22, 12)
    .room('直升機坪', 'slab', 46, 34, 12, 10)
    .room('衛哨', 'office', 26, 40, 6, 6);
  fillYard(g, 0, 0, 60, 46, '營區道路', 'road');
  baseStairs(g);
  /* 營區的圍籬（衛哨的牆接在中間）、大門 */
  g.wall(0, 0, 60, 0, 'fence')
    .wall(0, 0, 0, 46, 'fence')
    .wall(60, 0, 60, 46, 'fence')
    .wall(0, 46, 26, 46, 'fence')
    .wall(32, 46, 60, 46, 'fence');
  g.dh(36, 46, 6, -1, 0, 'open') // 大門
    .dh(10, 14, 3, 1, 0, 'door2')
    .dh(10, 18, 3, -1, 0, 'door2')
    .dh(42.5, 14, 1.5, 1, 0)
    .dh(50, 14, 3, 1, 0, 'door2')
    .dv(46, 4, 1.5, 1, 0)
    .dh(31, 34, 8, 1, 0, 'shutter')
    .dv(48, 24, 1.5, -1, 0, 'steel')
    .dv(32, 42, 1.5, 1, 0)
    .wh(4, 2, 3)
    .wh(15, 2, 3)
    .wh(4, 28, 3)
    .wh(15, 28, 3)
    .wh(40, 2, 3)
    .wh(50, 2, 4)
    .wv(28, 24, 3)
    .wh(27, 40, 2);
  /* 營舍：上下舖兩排、置物櫃 */
  g.row('bunk_bed', 3, 2.2, 7, 2.6, 0)
    .row('bunk_bed', 3, 9.8, 2, 2.6, 0, 180)
    .row('bunk_bed', 14, 9.8, 3, 2.6, 0, 180)
    .item('locker', 21, 4, 90);
  /* 餐廳 */
  g.item('dining6', 4, 21)
    .item('dining6', 10.4, 21)
    .item('kitchen', 16.6, 18.1, 0, { size: [5, 1.3] })
    .item('counter', 16.6, 21, 0, { size: [5, 1.2] })
    .item('fridge', 20.4, 26.4, 180);
  /* 司令室、作戰室 */
  g.item('office_desk', 42.6, 2.4)
    .item('chair', 43.3, 3.9, 180)
    .item('banner', 39, 2.1, 0, { label: '隊旗' })
    .item('safe', 44.6, 10)
    .item('ops_table', 49.6, 5.6)
    .item('radio', 56.8, 3, 90)
    .item('whiteboard', 57.5, 8.4, 90);
  /* 車庫、彈藥庫、操場、直升機坪、衛哨 */
  g.item('tank_mil', 29, 20.6, 90)
    .item('suv', 35, 28.6, 90, { size: [4, 9] })
    .item('tool_shelf', 45, 21, 90)
    .item('gun_rack', 57.1, 21, 90)
    .row('crate', 50.4, 26.6, 4, 1.8, 0)
    .item('big_crate', 50.4, 20.4)
    .row('sandbags', 6, 32, 3, 5, 0)
    .item('sandbags', 8, 37)
    .item('helicopter', 47, 34.5, 0, { size: [10, 9] })
    .item('desk', 27, 42, 270)
    .item('chair', 28.3, 42.6, 90)
    .item('barricade', 37.5, 43, 0)
    .item('streetlight', 34, 38)
    .item('antenna', 24, 4);

  const bm = new FloorBuilder('B1');
  bm.room('地下指揮所', 'tech', 38, 2, 20, 12)
    .room('機密檔案室', 'office', 38, 14, 8, 6)
    .room('封鎖的實驗區', 'danger', 46, 14, 12, 8, {
      gm: true,
      note: '指揮所南邊焊死的門。基地的正式紀錄裡沒有這一區，通風管裡傳出抓牆的聲音。',
    });
  baseStairs(bm);
  bm.dh(41, 14, 1.5, 1, 0).dh(50, 14, 2, 1, 0, 'sealed');
  bm.item('monitor_wall', 44, 2.1, 0, { size: [6, 0.6] })
    .item('console', 44.6, 3.4, 0, { size: [4.6, 1.4] })
    .item('ops_table', 46, 7)
    .item('radio', 57, 3.2, 90)
    .item('em_generator', 53, 10, 0, { size: [4, 2] })
    .item('filing', 38.2, 16.4, 270)
    .item('filing', 38.2, 17.6, 270)
    .item('safe', 44.4, 18.4)
    .item('pod', 52, 17, 0, { gm: true })
    .item('cage', 54.6, 18.4, 0, { gm: true, size: [3, 3] })
    .item('tendrils', 46.4, 20.5, 0, { gm: true, size: [3, 1.2] });
  return [bm.f, g.f];
}

/* ---------- 監獄（舍房區：鐵欄杆的舍房、監控室、會客室、運動場） ---------- */

export function prison(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('運動場', 'dirt', 0, 0, 14, 20)
    .room('舍房走廊', 'hall', 14, 8, 36, 4, { hideLabel: true })
    .room('監控室', 'office', 50, 0, 12, 12)
    .room('獨居房', 'danger', 32, 12, 6, 8, {
      gm: true,
      note: '門上只有送餐口。關在這裡的人每天晚上都在數一個不存在的數字。',
    })
    .room('淋浴間', 'wet', 38, 12, 6, 8)
    .room('醫務室', 'medical', 44, 12, 8, 8)
    .room('會客室', 'public', 52, 12, 10, 8)
    .room('入口・安檢', 'hall', 52, 20, 10, 6);
  /* 舍房：「不產生牆」，前面是鐵欄杆（格柵門），彼此之間是內牆 */
  for (let i = 0; i < 6; i++)
    b.room(`舍房 ${i + 1}`, 'bedroom', 14 + i * 6, 0, 6, 8, { noWall: true });
  for (let i = 0; i < 3; i++)
    b.room(`舍房 ${i + 7}`, 'bedroom', 14 + i * 6, 12, 6, 8, { noWall: true });
  b.wall(14, 8, 50, 8, 'bars').wall(14, 12, 32, 12, 'bars');
  for (const x of [20, 26, 32, 38, 44]) b.wall(x, 0, x, 8);
  b.wall(50, 0, 50, 8).wall(20, 12, 20, 20).wall(26, 12, 26, 20).wall(32, 12, 32, 20);
  b.wall(14, 0, 14, 8, 'ext').wall(14, 12, 14, 20, 'ext');
  /* 運動場的圍籬 */
  b.wall(0, 0, 14, 0, 'fence').wall(0, 0, 0, 20, 'fence').wall(0, 20, 14, 20, 'fence');
  for (let i = 0; i < 6; i++) b.dh(16 + i * 6, 8, 2, -1, 0, 'gate');
  for (let i = 0; i < 3; i++) b.dh(16 + i * 6, 12, 2, 1, 0, 'gate');
  b.dv(14, 9, 2, -1, 0, 'gate') // 往運動場
    .dv(50, 9.5, 1.5, 1, 0, 'steel')
    .dh(34, 12, 2, 1, 0, 'sealed')
    .dh(40, 12, 1.5, 1, 0)
    .dh(46, 12, 1.5, 1, 0)
    .dh(56, 20, 2, -1, 0, 'steel')
    .dh(59, 12, 1.5, -1, 1, 'steel')
    .dh(56.25, 26, 1.5, -1, 0) // 入口
    .wv(62, 3, 2, 'barred')
    .wv(62, 14, 2, 'barred')
    .wh(46, 20, 2, 'barred');
  /* 舍房：床、馬桶 */
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 6;
    b.item('bed_single', x + 0.3, 0.2).item('toilet', x + 4.6, 0.2);
  }
  for (let i = 0; i < 3; i++) {
    const x = 14 + i * 6;
    b.item('bed_single', x + 0.3, 15.8).item('toilet', x + 4.6, 18.2, 180);
  }
  /* 監控室、淋浴間、醫務室、會客室、入口 */
  b.item('monitor_wall', 50.4, 0.1, 0, { size: [6, 0.6] })
    .item('console', 51, 1.2)
    .item('chair', 52.4, 2.8)
    .item('locker', 61, 5, 90)
    .item('gun_rack', 58, 0.1, 0, { size: [3, 0.8] })
    .row('shower', 38.2, 18.1, 3, 1.9, 0, 180)
    .item('hospital_bed', 47.4, 15.6, 90)
    .item('med_cabinet', 44.1, 15, 270)
    .item('partition', 53, 15.6, 0, { size: [8, 0.3] })
    .item('table', 54.4, 13.4, 0, { size: [4.4, 1] })
    .item('table', 54.4, 16.6, 0, { size: [4.4, 1] })
    .item('chair', 54.6, 12.2)
    .item('chair', 54.6, 17.8, 180)
    .item('card_reader', 61.3, 21)
    .item('reception', 53, 22.6, 0, { size: [4, 1.2] })
    .item('cctv', 52.2, 20.3)
    .item('sandbox', 5, 5, 0, { size: [4, 4] })
    .item('weight_bench', 2, 12)
    .item('garden_bench', 8, 17.8, 180);
  return [b.f];
}
