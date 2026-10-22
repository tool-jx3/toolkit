/**
 * 太空船（2026-10-22 依 7.18 整個重新設計，本站自己畫的平面圖）：環形的研究船。
 * 中央是一圈環狀走廊（一間大房間，裡面再放交誼艙、水耕艙、廚房、補給倉庫、生物實驗室，所以走廊連成一圈、沒有接縫的牆），
 * 左舷是居住艙與指揮官寢室，右舷是醫療艙、太空衣室、氣閘與焊死的第 7 實驗艙（GM 專用），
 * 船首經過前通道到指揮室，船尾經過後通道到主機艙。北邊（船首）在上；1 格 = 0.5 m。
 */
import { FloorBuilder, type TplFloor } from './builder';

export function spaceship(): TplFloor[] {
  const b = new FloorBuilder('1F');
  /* 船首、環狀走廊（先放），環的內側（巢狀的房間），左右舷的艙室，船尾 */
  b.room('指揮室', 'tech', 20, 0, 20, 10, { lx: -6 })
    .room('前通道', 'grate', 27, 10, 6, 6, { hideLabel: true })
    .room('環狀走廊', 'grate', 14, 16, 32, 28, { lx: -8, ly: -12 })
    .room('交誼艙', 'living', 18, 20, 12, 10, { ly: 2.6 })
    .room('水耕艙', 'field', 30, 20, 12, 10, { ly: 1 })
    .room('廚房', 'kitchen', 18, 30, 6, 10, { lx: 0.6 })
    .room('補給倉庫', 'storage', 24, 30, 8, 10, { ly: 2 })
    .room('生物實驗室', 'medical', 32, 30, 10, 10)
    .room('居住艙 1', 'bedroom', 4, 16, 10, 7, { lx: 1.4, ly: 0.6 })
    .room('居住艙 2', 'bedroom', 4, 23, 10, 7, { lx: 1.4, ly: 0.6 })
    .room('衛浴艙', 'wet', 4, 30, 10, 5, { lx: 1.2, ly: 0.8 })
    .room('指揮官寢室', 'bedroom', 2, 35, 12, 9, { lx: 0.4, ly: 0.6 })
    .room('醫療艙', 'medical', 46, 16, 10, 8, { ly: 1 })
    .room('太空衣室', 'storage', 46, 24, 8, 6, { ly: 0.6 })
    .room('氣閘室', 'tech', 46, 30, 6, 6, { ly: 1 })
    .room('第 7 實驗艙', 'danger', 46, 36, 12, 8, {
      lx: -2.5,
      gm: true,
      note: '門從外面焊死，門上貼著「隔離中」。採樣回來的「東西」還在裡面——培養槽是從裡面打破的。',
    })
    .room('後通道', 'grate', 27, 44, 6, 4, { hideLabel: true })
    .room('主機艙', 'industrial', 16, 48, 28, 10, { lx: -6, ly: -1.5 });
  /* 自動門與艙門 */
  b.dh(28.5, 10, 3, 1, 0, 'auto')
    .dh(28.5, 16, 3, 1, 0, 'auto')
    .dh(28.5, 44, 3, 1, 0, 'auto')
    .dh(29, 48, 2, 1, 0, 'steel')
    .dh(22, 20, 3, 1, 0, 'auto')
    .dh(35, 20, 3, 1, 0, 'auto')
    .dh(20, 30, 2, 1, 0, 'open')
    .dh(26.5, 40, 3, -1, 0, 'auto')
    .dv(42, 33, 3, -1, 0, 'auto')
    .dv(14, 18.5, 1.5, -1, 0, 'sliding')
    .dv(14, 26, 1.5, -1, 0, 'sliding')
    .dv(14, 31.75, 1.5, -1, 0, 'sliding')
    .dv(14, 38, 1.5, -1, 0, 'locked')
    .dv(46, 18.5, 3, 1, 0, 'auto')
    .dv(46, 25.5, 1.5, 1, 0, 'sliding')
    .dv(46, 32, 2, 1, 0, 'steel')
    .dv(52, 32, 2, 1, 0, 'steel')
    .dv(46, 39, 2, 1, 0, 'sealed')
    /* 指揮室的全景窗、舷窗、第 7 實驗艙被鐵板封住的窗 */
    .wh(22, 0, 16, 'window2')
    .wv(2, 41, 1.5)
    .wv(56, 21, 2)
    .wv(58, 38, 2, 'platewin');
  /* 指揮室：控制台、駕駛座、全像投影桌、雷達、監控螢幕牆 */
  b.item('console', 21.2, 0.1)
    .item('console', 28.2, 0.1)
    .item('console', 35.2, 0.1)
    .item('pilot_seat', 22.2, 1.8)
    .item('pilot_seat', 29.2, 1.8)
    .item('pilot_seat', 36.2, 1.8)
    .item('holo_table', 28.3, 5.2)
    .item('radar', 20.05, 4, 270)
    .item('monitor_wall', 39.35, 2.5, 90);
  /* 環狀走廊：通風口、監視器、滅火器 */
  b.item('vent', 15, 42.4)
    .item('vent', 44.2, 42.4)
    .item('cctv', 14.1, 16.1)
    .item('cctv', 45.3, 16.1)
    .item('extinguisher', 33.4, 16.2)
    .item('extinguisher', 26.2, 43.2);
  /* 交誼艙、水耕艙、廚房、補給倉庫、生物實驗室 */
  b.item('vending', 18.2, 20.1)
    .item('dining4', 24, 21.4)
    .item('dining4', 19.2, 25)
    .item('sofa3', 28.15, 24.4, 90)
    .item('lowtable', 26.4, 25.6, 90)
    .row('plant', 31, 21.6, 3, 2.4, 0)
    .row('plant', 31, 24.6, 3, 2.4, 0)
    .item('tank', 39.4, 27.4)
    .item('pump', 31, 28.4)
    .item('water_pipe', 34, 29.3, 0, { size: [5, 0.5] })
    .item('kitchen', 18.05, 31, 270)
    .item('fridge', 18.05, 36.4, 270)
    .item('stove', 22.65, 32, 90)
    .item('sink', 19.8, 38.7, 180)
    .item('supply_shelf', 24.4, 30.05)
    .item('supply_shelf', 27.6, 30.05)
    .item('pallet_stack', 24.4, 33.4)
    .item('crate', 29.8, 33.2)
    .item('cardboard', 24.6, 36.4)
    .item('hand_cart', 30.2, 36.4)
    .item('lab_bench', 32.6, 30.05)
    .item('microscope', 33, 30.3)
    .item('fume_hood', 37.4, 30.05)
    .item('tank', 33, 33.6, 0, { size: [2, 2] })
    .item('pod', 32.4, 38.1, 180)
    .item('pod', 34.6, 38.1, 180)
    .item('freezer', 39.8, 38.5, 180);
  /* 左舷：居住艙兩間、衛浴艙、指揮官寢室 */
  for (const y of [16, 23])
    b.item('bed_single', 4.05, y + 0.3, 270)
      .item('bed_single', 4.05, y + 3.4, 270)
      .item('locker', 4.4, y + 5.95, 180)
      .item('desk', 9.5, y + 0.05)
      .item('chair', 10.2, y + 1.4, 180);
  b.item('shower', 4.2, 30.2)
    .item('shower', 6.2, 30.2)
    .item('toilet', 8.4, 30.05)
    .item('washbasin', 10, 33.85, 180)
    .item('bed_double', 2.05, 36, 270)
    .item('wardrobe', 8, 35.05)
    .item('desk', 6, 42.75, 180)
    .item('safe', 2.4, 42.4)
    .item('armchair', 10, 40.4);
  /* 右舷：醫療艙、太空衣室、氣閘室 */
  b.item('exam_bed', 48, 16.1)
    .item('exam_bed', 51, 16.1)
    .item('iv_stand', 49.6, 16.4)
    .item('med_cabinet', 54.95, 17, 90)
    .item('desk', 48, 22.75, 180)
    .item('locker', 47.5, 24.05)
    .item('locker', 50.6, 24.05)
    .item('bench', 48, 28.95, 180)
    .item('alarm', 49, 30.05)
    .item('extinguisher', 47.2, 35.2);
  /* 第 7 實驗艙（GM 專用）：打破的培養槽、肉塊、觸手、倒地的研究員 */
  b.item('lab_bench', 48, 36.05, 0, { gm: true })
    .item('cage', 53.6, 36.4, 0, { gm: true })
    .item('flesh', 51.5, 39.6, 0, { gm: true })
    .item('npc_lying', 47.4, 42.2, 90, { gm: true })
    .item('wall_claws', 52.6, 43.6, 0, { gm: true })
    .item('wall_blood', 56.6, 40.2, 90, { gm: true })
    .item('black_stain', 49.4, 38.4, 0, { gm: true, size: [2, 1.6] });
  /* 主機艙：動力爐、引擎、管線、緊急發電機、控制箱 */
  b.item('reactor', 27.5, 51.5)
    .item('pipe_big', 17, 49)
    .item('pipe_big', 35, 49)
    .item('ship_engine', 33.8, 51.6, 90)
    .item('em_generator', 17, 54)
    .item('control_panel', 22, 57.15, 180)
    .item('dist_board', 16.05, 51, 270);
  return [b.f];
}
