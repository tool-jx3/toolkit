/**
 * 洋館（2026-10-22 依 7.18 整個重新設計，本站自己畫的平面圖）：1920 年代貿易商的宅邸。
 * L 形的主屋（北邊是門廊與前庭）＋西側往南伸的傭人翼，主屋東端是私人禮拜堂、南邊接著玻璃溫室；
 * 地下室食品庫的暗門經過祕密通道，通到禮拜堂下面 GM 專用的地下祭室（禮拜堂的地板也有暗門下來）。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, Frame, fillYard, type TplFloor } from './builder';

/**
 * 洋館的局部座標（左上角放在敷地的 (4, 4)）：主屋 x 0～44、y 4～20（北邊 y 0～4 是門廊、陽台），
 * 傭人翼 x 0～14、y 20～38，玻璃溫室 x 28～36、y 20～32。
 */
const mansionFrame = (b: FloorBuilder) => new Frame(b, 4, 4, 44, 38);
/** 傭人用的後樓梯（B1～2F 同一個位置） */
const backStairs = (m: Frame) => m.item('stairs', 11.8, 26.6);
/** 玄關大廳的大樓梯（1F～2F） */
const grandStairs = (m: Frame) => m.item('stairs', 24.5, 10, 0, { size: [3, 8] });

export function mansion(): TplFloor[] {
  /* ---------- 1F：玄關大廳、會客室、餐廳、吸菸室、禮拜堂、溫室；西翼是配膳室、廚房、洗衣間、管家室 ---------- */
  const g = new FloorBuilder('1F');
  const m = mansionFrame(g);
  m.room('門廊', 'porch', 19, 0, 8, 4)
    .room('玄關大廳', 'hall', 18, 4, 10, 16, { ly: -3 })
    .room('餐廳', 'kitchen', 0, 4, 10, 12, { ly: -4 })
    .room('會客室', 'living', 10, 4, 8, 12, { ly: -3.5 })
    .room('西長廊', 'hall', 0, 16, 18, 4)
    .room('吸菸室', 'living', 28, 4, 8, 12, { ly: 3.5 })
    .room('東長廊', 'hall', 28, 16, 8, 4, { hideLabel: true })
    .room('禮拜堂', 'special', 36, 4, 8, 16, {
      ly: 4.5,
      note: '祭壇前的地板可以掀開（地板的暗門，只有 GM 看得到），下面就是地下祭室。',
    })
    .room('溫室', 'stone', 28, 20, 8, 12, { wall: 'glass', ly: -3 })
    .room('配膳室', 'kitchen', 8, 20, 6, 6)
    .room('廚房', 'kitchen', 0, 20, 8, 10, { ly: 3 })
    .room('後樓梯', 'hall', 8, 26, 6, 6, { lx: -1.2 })
    .room('洗衣間', 'wet', 0, 30, 8, 8)
    .room('管家室', 'bedroom', 8, 32, 6, 6, { lx: -0.8, ly: -0.8 });
  grandStairs(m);
  backStairs(m);
  /* 主屋的門：正門（北）、大廳往兩翼、長廊、禮拜堂、溫室 */
  m.dh(21.5, 4, 3, 1, 0, 'door2')
    .dv(18, 7, 1.5, -1, 0)
    .dv(18, 16.5, 3, -1, 0, 'open')
    .dv(28, 7, 1.5, 1, 0)
    .dv(28, 18.25, 1.5, 1, 0, 'open')
    .dv(10, 6, 3, -1, 0, 'door2')
    .dh(14, 16, 1.5, -1, 0)
    .dh(4, 16, 1.5, -1, 0)
    .dh(32, 16, 1.5, -1, 0)
    .dv(36, 16.5, 3, 1, 0, 'door2')
    .dh(29, 20, 1.5, 1, 0)
    .dh(30.5, 32, 3, 1, 0, 'door2')
    /* 傭人翼：長廊 → 配膳室 → 廚房、後樓梯 → 洗衣間、管家室；廚房的後門 */
    .dh(10.5, 20, 1.5, 1, 0)
    .dv(8, 21.5, 1.5, -1, 0)
    .dv(0, 27, 1.5, -1, 0)
    .dh(8.5, 26, 1.5, 1, 0)
    .dv(8, 30.25, 1.5, -1, 0)
    .dh(9, 32, 1.5, 1, 0)
    /* 窗 */
    .wh(19, 4, 1.5)
    .wh(25.5, 4, 1.5)
    .wh(2, 4, 2)
    .wh(6, 4, 2)
    .wv(0, 5, 2)
    .wv(0, 12.5, 2)
    .wh(11, 4, 2)
    .wh(14.5, 4, 2)
    .wh(29.5, 4, 2)
    .wh(33, 4, 2)
    .wv(44, 7, 2)
    .wv(44, 11, 2)
    .wv(44, 15, 2)
    .wh(15, 20, 2)
    .wv(0, 23.75, 1.5)
    .wv(14, 28, 2)
    .wv(0, 34, 2)
    .wh(4, 38, 2)
    .wh(10, 38, 2);
  /* 玄關大廳 */
  m.item('rug', 19.5, 6.5, 0, { size: [4, 8] })
    .item('plant', 18.3, 4.3)
    .item('plant', 26.5, 4.3)
    .item('painting', 18.05, 10.5, 270)
    .item('table_round', 19, 12)
    .item('statue', 20.5, 17.5);
  /* 會客室：壁爐、沙發、留聲機 */
  m.item('fireplace', 10.6, 14.8, 180)
    .item('sofa3', 10.8, 9.2)
    .item('lowtable', 11.9, 12)
    .item('armchair', 16, 11.4, 90)
    .item('gramophone', 16.4, 4.3)
    .item('plant', 10.3, 4.3);
  /* 餐廳 */
  m.item('dining6', 2.8, 8)
    .item('cupboard', 0.05, 8, 270)
    .item('cabinet', 6.5, 14.95, 180)
    .item('plant', 8.6, 4.3);
  /* 吸菸室：撞球台、扶手椅、酒櫃 */
  m.item('billiards', 29.5, 8.6)
    .item('armchair', 28.4, 4.3)
    .item('armchair', 33.6, 4.3)
    .item('lowtable', 30.8, 4.6)
    .item('cabinet', 34.95, 12.5, 90)
    .item('bookshelf', 28.05, 12, 270);
  /* 禮拜堂：祭壇、長椅、聖洗池；祭壇前地板的暗門（GM 專用） */
  m.item('altar', 38.5, 4.3)
    .item('candle', 38.7, 4.7)
    .item('candle', 40.5, 4.7)
    .item('trapdoor', 39, 6.3, 0, { gm: true })
    .row('pew', 36.4, 9.2, 3, 0, 2.2, 0, { size: [3, 1.2] })
    .row('pew', 40.6, 9.2, 3, 0, 2.2, 0, { size: [3, 1.2] })
    .item('font', 42.2, 17.6);
  /* 溫室：噴水池、盆栽、長椅 */
  m.item('fountain', 30, 25)
    .item('plant', 34.5, 20.4)
    .item('plant', 28.4, 30.4)
    .item('plant', 34.4, 30.4)
    .item('bush', 34.2, 23)
    .item('garden_bench', 28.05, 23.6, 270);
  /* 配膳室、廚房、洗衣間、管家室 */
  m.item('cupboard', 13.05, 21.2, 90)
    .item('sink', 11, 24.7, 180)
    .item('kitchen', 0.3, 20.05)
    .item('stove', 5.4, 20.05)
    .item('fridge', 0.05, 22, 270)
    .item('island', 2, 24)
    .item('barrel', 6.6, 28.6)
    .item('washer', 0.4, 36.65, 180)
    .item('washer', 1.9, 36.65, 180)
    .item('sink', 0.05, 31, 270)
    .item('supply_shelf', 6.95, 33.5, 90)
    .item('bed_single', 11.8, 33.6)
    .item('desk', 8.05, 35.5, 270)
    .item('chair', 9.4, 36.2, 270);
  /* 庭園：前庭的路燈、樹、涼亭、家族的墓 */
  fillYard(g, 0, 0, 52, 46, '庭園');
  const yard = g.f.rooms
    .filter((r) => r.name === '庭園')
    .reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a));
  delete yard.hideLabel;
  m.item('streetlight', 17, -3)
    .item('streetlight', 28, -3)
    .item('bush', 15.6, 1.2)
    .item('bush', 28.6, 1.2)
    .item('tree', -3.5, 5)
    .item('tree', 45, 1)
    .item('tree', 45, 26)
    .item('tree', 21, 23)
    .item('gazebo', 16, 30)
    .item('garden_bench', 21.6, 36, 180)
    .item('grave', 45.4, 9)
    .item('grave', 45.4, 13);

  /* ---------- 2F：樓梯廳、陽台、主臥室與起居室、書齋、長女的房間；西翼是女僕房與備品室 ---------- */
  const u = new FloorBuilder('2F');
  const n = mansionFrame(u);
  n.room('陽台', 'balcony', 19, 0, 8, 4)
    .room('樓梯廳', 'hall', 18, 4, 10, 16, { ly: -3 })
    .room('主臥室', 'bedroom', 0, 4, 10, 10)
    .room('起居室', 'living', 10, 4, 8, 10, { ly: -3 })
    .room('主浴室', 'wet', 0, 14, 5, 6)
    .room('更衣室', 'storage', 5, 14, 5, 6)
    .room('西走廊', 'hall', 10, 14, 8, 6)
    .room('書齋', 'office', 28, 4, 8, 8)
    .room('長女的房間', 'bedroom', 28, 12, 8, 8)
    .room('傭人走廊', 'hall', 8, 20, 6, 6, { hideLabel: true })
    .room('女僕房', 'bedroom', 0, 20, 8, 7, { ly: 1.5 })
    .room('備品室', 'storage', 0, 27, 8, 5, { ly: -1 })
    .room('後樓梯', 'hall', 8, 26, 6, 6, { lx: -1.2 });
  grandStairs(n);
  backStairs(n);
  n.dh(21.5, 4, 3, -1, 0, 'door2')
    .dv(18, 7, 1.5, -1, 0)
    .dv(18, 16.5, 3, -1, 0, 'open')
    .dv(28, 6, 1.5, 1, 0)
    .dv(28, 18.25, 1.5, 1, 0)
    .dv(10, 7, 1.5, -1, 0)
    .dh(14, 14, 1.5, -1, 0)
    .dh(1.5, 14, 1.5, 1, 0)
    .dh(6, 14, 1.5, 1, 0)
    .dh(10.5, 20, 1.5, 1, 0)
    .dv(8, 22.5, 1.5, -1, 0)
    .dh(8.5, 26, 1.5, 1, 0)
    .dv(8, 28.5, 1.5, -1, 0)
    .wh(19, 4, 1.5)
    .wh(25.5, 4, 1.5)
    .wv(0, 6, 2)
    .wv(0, 10, 2)
    .wh(7.5, 4, 2)
    .wh(11, 4, 2)
    .wh(28.5, 4, 2)
    .wv(36, 6, 2)
    .wv(36, 14.5, 1.5)
    .wv(0, 16.5, 1.5)
    .wh(15, 20, 2)
    .wv(0, 22.5, 2)
    .wh(2, 32, 2)
    .wv(14, 22, 2)
    .wv(14, 28, 2);
  /* 樓梯廳：收藏品的展示櫃；陽台 */
  n.item('handrail', 24.1, 10, 90)
    .item('handrail', 24.1, 14, 90)
    .item('plant', 18.3, 4.3)
    .item('painting', 18.05, 10.5, 270)
    .item('display_case', 19, 12.5, 90)
    .item('table_round', 22.1, 0.6)
    .item('chair', 20.8, 1)
    .item('chair', 24.2, 1)
    .item('plant', 19.3, 0.3)
    .item('plant', 25.5, 0.3);
  /* 主臥室、起居室、主浴室、更衣室 */
  n.item('bed_canopy', 3.4, 4.05)
    .item('nightstand', 2.4, 4.1)
    .item('nightstand', 6.7, 4.1)
    .item('dresser', 0.05, 9.5, 270)
    .item('armchair', 7.6, 9.8)
    .item('piano_up', 14.6, 4.05)
    .item('desk', 10.05, 10, 270)
    .item('sofa2', 12.4, 9)
    .item('lowtable', 12.9, 11)
    .item('armchair', 16.1, 9, 90)
    .item('bathtub', 0.2, 18.3, 90)
    .item('washbasin', 0.05, 15.4, 270)
    .item('toilet', 3.35, 15.6, 90)
    .item('wardrobe', 8.75, 15, 90)
    .item('dresser', 5.05, 16, 270)
    .item('safe', 7, 18.6)
    .item('bench', 10.05, 15, 270);
  /* 書齋、長女的房間 */
  n.item('desk', 31, 4.05)
    .item('chair', 31.7, 5.4, 180)
    .item('bookshelf', 29.4, 11.15, 180)
    .item('bookshelf', 32.6, 11.15, 180)
    .item('display_case', 29.2, 8.6)
    .item('armchair', 34, 7.4, 90)
    .item('bed_single', 31.95, 12.3, 90)
    .item('desk', 30, 18.75, 180)
    .item('chair', 30.7, 17.6)
    .item('dresser', 28.3, 12.05)
    .item('wardrobe', 34.75, 16.2, 90)
    .item('rug', 29.6, 14.6, 0, { size: [3, 2.4] });
  /* 女僕房、備品室 */
  n.item('bunk_bed', 0.3, 20.1)
    .item('bunk_bed', 2.7, 20.1)
    .item('locker', 4.9, 20.05)
    .item('table', 0.4, 25.2)
    .item('chair', 3.4, 25.5, 270)
    .item('supply_shelf', 0.4, 30.95, 180)
    .item('supply_shelf', 3.6, 30.95, 180)
    .item('cardboard', 0.4, 27.4);

  /* ---------- B1：食品庫、儲煤間、機房、雜物間；食品庫東牆的暗門 → 祕密通道 → 地下祭室（GM 專用） ---------- */
  const bm = new FloorBuilder('B1');
  const k = mansionFrame(bm);
  k.room('食品庫', 'storage', 8, 4, 10, 8)
    .room('儲煤間', 'storage', 0, 4, 8, 8)
    .room('機房', 'garage', 0, 12, 8, 14)
    .room('地下走廊', 'hall', 8, 12, 6, 14, { hideLabel: true })
    .room('雜物間', 'storage', 14, 12, 4, 8)
    .room('後樓梯', 'hall', 8, 26, 6, 6, { lx: -1.2 })
    .room('祕密通道', 'stone', 18, 7, 18, 4, {
      gm: true,
      wall: 'stone',
      note: '食品庫東牆的層架後面是暗門。地上的灰塵有新的腳印，一路通到禮拜堂的正下方。',
    })
    .room('地下祭室', 'special', 36, 4, 8, 12, {
      gm: true,
      wall: 'stone',
      note: '主人從南洋帶回來的神像供在這裡。天花板的暗門通到禮拜堂的祭壇前；失蹤的長女最後一次被看到，就是走進禮拜堂。',
    });
  backStairs(k);
  k.dh(8.5, 26, 1.5, -1, 0)
    .dv(8, 16, 1.5, -1, 0)
    .dh(2, 12, 1.5, -1, 0)
    .dh(9, 12, 1.5, -1, 0)
    .dv(14, 13, 1.5, 1, 0)
    .dv(18, 8.25, 1.5, 1, 0, 'secret')
    .dv(36, 8.25, 1.5, 1, 0, 'sealed');
  /* 機房、儲煤間、食品庫、雜物間 */
  k.item('boiler', 0.05, 14, 270)
    .item('pump', 0.4, 20.6)
    .item('dist_board', 7.35, 20, 90)
    .item('tool_shelf', 1, 24.95, 180)
    .item('drum', 5.6, 24.4)
    .item('wall_mold', -0.5, 18, 90)
    .item('material_pile', 0.5, 4.5)
    .item('hand_cart', 5.5, 5)
    .item('supply_shelf', 8.4, 4.05)
    .item('supply_shelf', 11.6, 4.05)
    .item('supply_shelf', 14.8, 4.05)
    .item('barrel', 16.6, 10.4)
    .item('barrel', 14.4, 10.4)
    .item('crate', 12, 10.2)
    .item('broken_furniture', 15.2, 17.8)
    .item('cardboard', 16.4, 12.4)
    .item('pipe', 13.55, 15.5, 90);
  /* 祕密通道、地下祭室（GM 專用） */
  k.item('footprints', 21, 8.5, 90, { gm: true })
    .item('footprints', 29, 8.5, 90, { gm: true })
    .item('trapdoor', 39, 6.3, 0, { gm: true })
    .item('magic_circle', 37.5, 9, 0, { gm: true, size: [5, 5] })
    .item('altar', 42.3, 9.5, 90, { gm: true })
    .item('idol', 42.65, 10.5, 0, { gm: true })
    .item('candle', 42.7, 11.6, 0, { gm: true })
    .item('chains', 36.05, 11.5, 270, { gm: true })
    .item('bones', 40, 14.4, 0, { gm: true })
    .item('wall_blood', 39, 15.6, 0, { gm: true });
  return [bm.f, g.f, u.f];
}
