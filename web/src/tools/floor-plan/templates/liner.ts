/**
 * 夜航蒸汽客輪（2026-11-05，跟進 KIIN「マップ制作スタジオ」v2.0 第二批：KIIN 有「夜霧の蒸気客船」的見本，本站不看它的格局，
 * 用曲線的房間自己設計一艘；規格 F301、3.17.6）。北邊在上、船首朝東；1 格＝0.5 m。
 *
 * - 1F 上甲板：海面上的船體甲板（`hull-e`，疊在海面上，外圍是欄杆）＋船首的高甲板（`bow-e`，甲板上的甲板，段差線）；
 *   甲板上的船室（交誼廳、一等艙、船長室、無線電室）、圓頂的駕駛台（`dome-e`），西邊船尾的登船口。
 * - B1 下層：船體形狀的船艙（室內，外牆沿著曲線），機艙、三等艙、廚房、餐廳、船員室、貨艙；貨艙後面的密艙是 GM 專用。
 * - 兩層的樓梯在同一個位置；B1 的舷窗有幾個開在船首的曲線上（沿著曲線轉）。
 */
import { FloorBuilder, type TplFloor } from './builder';

/** 兩層同一個位置的樓梯（樓梯間 7～12 × 11～17） */
const linerStairs = (b: FloorBuilder) =>
  b.room('樓梯間', 'hall', 7, 11, 5, 6, { hideLabel: true }).item('stairs', 9, 11.2);

export function steamLiner(): TplFloor[] {
  /* ---------- 1F 上甲板 ---------- */
  const d = new FloorBuilder('1F');
  d.room('海面', 'water', 0, 0, 64, 28, { hideLabel: true })
    .room('散步甲板', 'shipdeck', 4, 4, 56, 20, { shape: 'hull-e', lx: -14, deck: true })
    .room('船首甲板', 'shipdeck', 43, 9, 12, 10, {
      shape: 'bow-e',
      hideLabel: true,
      deck: true,
    });
  linerStairs(d);
  d.room('交誼廳', 'public', 12, 8, 12, 12)
    .room('一等艙（甲）', 'bedroom', 24, 8, 6, 6)
    .room('一等艙（乙）', 'bedroom', 24, 14, 6, 6)
    .room('船長室', 'bedroom', 30, 8, 6, 6)
    .room('無線電室', 'tech', 30, 14, 6, 6)
    .room('駕駛台', 'tech', 36, 9, 6, 10, { shape: 'dome-e' });
  d.dv(4, 12.5, 3, 1, 0, 'open') // 船尾的登船口
    .dv(7, 13, 1.5, 1, 0)
    .dv(12, 15.5, 1.5, 1, 0)
    .dh(17, 20, 1.5, 1, 0, 'door2')
    .dv(24, 9, 1.5, 1, 0)
    .dv(24, 17.5, 1.5, 1, 0)
    .dh(31, 8, 1.5, 1, 0)
    .dh(31, 20, 1.5, -1, 0)
    .dv(36, 10, 1.5, 1, 0)
    .wh(14, 8, 2)
    .wh(19.5, 8, 2)
    .wh(13.5, 20, 2)
    .wh(20.5, 20, 2)
    .wh(26, 8, 2)
    .wh(26, 20, 2)
    /* 駕駛台的窗：開在圓頂的曲線上（沿著曲線轉） */
    .wv(42, 12.5, 3)
    .wh(39, 9, 2)
    .wh(39, 19, 2);
  /* 甲板 */
  d.item('bench', 8, 5.4, 0, { size: [3, 0.9] })
    .item('lifeboat', 13, 4.6, 90, { size: [3, 10] })
    .item('liferaft', 25, 4.6)
    .item('liferaft', 25, 20.8)
    .item('bollard', 34, 5)
    .item('bollard', 34, 22)
    .item('mast', 43.5, 13.2)
    .item('capstan', 49, 13.2)
    .item('rope_coil', 45, 16)
    .item('anchor', 54.5, 12.8);
  /* 交誼廳 */
  d.item('piano', 12.4, 8.4)
    .item('dining_round', 17.5, 9.5)
    .item('dining_round', 17.5, 14.5)
    .item('armchair', 13, 17.8)
    .item('gramophone', 21.8, 12.6)
    .item('plant', 12.4, 13);
  /* 一等艙、船長室、無線電室 */
  d.item('bed_double', 26.8, 9.8)
    .item('nightstand', 25.8, 8.2)
    .item('wardrobe', 24.2, 12.7, 0, { size: [2.4, 1.1] })
    .item('bed_double', 26.8, 14.2)
    .item('nightstand', 25.8, 14.2)
    .item('desk', 26.8, 18.6)
    .item('bed_single', 30.2, 9.8)
    .item('desk', 33, 12.6)
    .item('safe', 34.6, 8.2)
    .item('desk', 30.2, 14.2)
    .item('chair', 30.8, 15.6)
    .item('radio', 33.6, 14.2);
  /* 駕駛台 */
  d.item('helm', 39.4, 13.2).item('chart_table', 36.4, 16.4).item('radar', 38.4, 10.4);

  /* ---------- B1 下層 ---------- */
  const b = new FloorBuilder('B1');
  b.room('下層船艙', 'tech', 4, 4, 56, 20, { shape: 'hull-e', hideLabel: true });
  linerStairs(b);
  b.room('機艙', 'industrial', 12, 4, 16, 8)
    .room('三等艙', 'bedroom', 28, 4, 8, 8)
    .room('廚房', 'kitchen', 12, 16, 8, 8)
    .room('餐廳', 'kitchen', 20, 16, 10, 8)
    .room('船員室', 'bedroom', 30, 16, 6, 8)
    .room('貨艙', 'storage', 36, 6, 8, 12)
    .room('密艙', 'danger', 44, 9, 5, 6, {
      gm: true,
      note: '貨艙最裡面的木板是暗門。船票上沒有這一間：每晚霧起的時候，裡面的東西會敲船殼回應汽笛。',
    });
  b.dv(12, 13, 1.5, 1, 0)
    .dh(20, 12, 1.5, -1, 0)
    .dh(31, 12, 1.5, -1, 0)
    .dh(14, 16, 1.5, 1, 0)
    .dh(24, 16, 1.5, 1, 0)
    .dh(32, 16, 1.5, 1, 0)
    .dv(20, 19, 1.5, 1, 0)
    .dv(36, 13, 1.5, 1, 0)
    .dv(44, 11, 1.5, 1, 0, 'secret')
    /* 舷窗：平直的船舷與船首的曲線上 */
    .wh(18, 4, 1)
    .wh(31.5, 4, 1)
    .wh(15.5, 24, 1)
    .wh(25, 24, 1)
    .wh(32.5, 24, 1)
    .wh(40, 4, 1)
    .wh(40, 24, 1);
  b.item('steam_engine', 14, 5)
    .item('steam_engine', 22, 5)
    .item('boiler', 13, 8.6)
    .item('control_panel', 24, 10.8)
    .item('bunk_bed', 28.4, 4.4)
    .item('bunk_bed', 33.6, 4.4)
    .item('locker', 30.6, 4.2)
    .item('stove', 12.2, 22.5)
    .item('sink', 14.6, 22.5)
    .item('fridge', 17.2, 22.4)
    .item('counter', 12.2, 17.6, 90)
    .item('dining4', 21.6, 19)
    .item('dining4', 26, 19)
    .item('bunk_bed', 30.2, 19.6)
    .item('bunk_bed', 33.8, 19.6)
    .item('crate', 38, 7)
    .item('crate', 39.8, 7)
    .item('crate', 42, 7)
    .item('barrel', 38.4, 15.8)
    .item('barrel', 42.2, 15.8)
    .item('chains', 46, 13.8, 0, { gm: true, size: [2.4, 0.6] })
    .item('candle', 47.6, 9.6, 0, { gm: true });
  return [b.f, d.f];
}
