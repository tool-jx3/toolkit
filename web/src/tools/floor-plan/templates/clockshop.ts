/**
 * 鐘錶行（地下室～2F）：2026-11-09 本站自己設計的三層樓範例（立體樓層圖、樓層總覽、祕密樓層的示範；規格 F312、D116）。
 * 老街轉角的鐘錶行：1F 是店面與修理工房，2F 是店主一家的住處，B1 是零件倉庫、地下工作室與鍋爐室——
 * 工作室的牆後面有 GM 專用的密室。B1 預設是祕密樓層（PL 看到「？？？」）。三層的樓梯間在同一個位置（東北角）。
 * 對應 KIIN「立体フロアガイド制作スタジオ」的三層樓見本，但格局、房間、家具、線索都是本站自己的。
 * 北邊在上；1 格 = 0.5 m。房子 12 × 8 m（x 0～24、y 0～16），1F 南邊是騎樓、2F 南邊是陽台。
 */
import { FloorBuilder, type TplFloor } from './builder';

/** 三層同一個位置的樓梯（樓梯間 x 14～24、y 0～6 的東邊） */
const stairs = (b: FloorBuilder) => b.item('stairs', 21.5, 0.5);

export function clockshop(): TplFloor[] {
  /* ---------- B1：零件倉庫、地下工作室、密室（GM 專用、暗門）、鍋爐室 ---------- */
  const u = new FloorBuilder('B1');
  u.room('零件倉庫', 'storage', 0, 0, 14, 8)
    .room('地下工作室', 'office', 0, 8, 9, 8)
    .room('密室', 'special', 9, 8, 5, 8, {
      gm: true,
      note: '工作室牆上的暗門進去。牆上掛滿停在同一個時刻的鐘。',
    })
    .room('樓梯間', 'hall', 14, 0, 10, 6)
    .room('鍋爐室', 'garage', 14, 6, 10, 10);
  stairs(u);
  u.dv(14, 2, 1.5, -1, 0).dh(15, 6, 1.5, 1, 0).dh(2, 8, 1.5, 1, 0).dv(9, 11, 1.5, 1, 0, 'secret');
  u.item('tool_shelf', 1, 0.05)
    .item('tool_shelf', 4.6, 0.05)
    .item('crate', 9.6, 0.4)
    .item('big_crate', 8, 4.6)
    .item('cardboard', 1, 5.6)
    .item('counter', 4.5, 14.75, 180, { label: '鐘錶台' })
    .item('chair', 6, 13.4, 180)
    .item('bookshelf', 0.05, 11, 270)
    .item('desk', 11, 8.05, 0, { gm: true })
    .item('safe', 12.6, 14.6, 0, { gm: true })
    .item('boiler', 20.5, 13.5, 180)
    .item('dist_board', 14.05, 10, 270)
    .item('generator', 17, 14.6);

  /* ---------- 1F：店面、修理工房、樓梯間；南邊的騎樓 ---------- */
  const g = new FloorBuilder('1F');
  g.room('店面', 'public', 0, 0, 14, 16, { ly: -1.5 })
    .room('樓梯間', 'hall', 14, 0, 10, 6)
    .room('修理工房', 'office', 14, 6, 10, 10)
    .room('騎樓', 'porch', 0, 16, 24, 4, { hideLabel: true });
  stairs(g);
  g.dh(5, 16, 3, -1, 0, 'door2')
    .dv(14, 2, 1.5, 1, 0)
    .dv(14, 12, 1.5, 1, 0)
    .wh(1, 16, 3)
    .wh(9.5, 16, 3)
    .wv(0, 4, 2)
    .wv(0, 10, 2)
    .wh(17, 16, 2)
    .wv(24, 9, 2)
    .wh(16, 0, 2);
  g.item('register', 2, 1)
    .item('display_case', 1.5, 7, 0, { label: '懷錶' })
    .item('display_case', 5.5, 7, 0, { label: '座鐘' })
    .item('display_case', 9.5, 7, 0, { label: '腕錶' })
    .item('table_round', 10, 11.5)
    .item('armchair', 7.6, 11.5)
    .item('plant', 12.6, 0.2)
    .item('plant', 14.4, 4.6)
    .item('counter', 19, 6.2, 0, { label: '修理台' })
    .item('stool', 20.6, 7.6)
    .item('tool_shelf', 22.9, 11, 90)
    .item('crate', 19.6, 14)
    .item('bench', 16, 18.8)
    .item('plant', 0.4, 18.6);

  /* ---------- 2F：客廳、臥室、浴室、書房；南邊的陽台 ---------- */
  const t = new FloorBuilder('2F');
  t.room('客廳', 'living', 0, 0, 14, 9)
    .room('臥室', 'bedroom', 0, 9, 9, 7)
    .room('浴室', 'wet', 9, 9, 5, 7)
    .room('樓梯間', 'hall', 14, 0, 10, 6)
    .room('書房', 'office', 14, 6, 10, 10)
    .room('陽台', 'balcony', 0, 16, 14, 3);
  stairs(t);
  t.dv(14, 2, 1.5, -1, 0)
    .dh(15, 6, 1.5, 1, 0)
    .dh(2, 9, 1.5, 1, 0)
    .dh(10.5, 9, 1.5, 1, 0)
    .dh(3, 16, 3, 1, 0, 'sliding2')
    .wh(3, 0, 3)
    .wh(8, 0, 3)
    .wv(0, 3, 2)
    .wv(0, 10.5, 1.5)
    .wh(11, 16, 1.5)
    .wh(17, 16, 2)
    .wv(24, 8, 1.5);
  t.item('tv', 5.4, 0.05)
    .item('rug', 5, 2.4, 0, { size: [4, 3] })
    .item('lowtable', 5.9, 3.1)
    .item('sofa3', 4.8, 5.6, 180)
    .item('bookshelf', 0.05, 5.2, 270)
    .item('plant', 12.4, 0.3)
    .item('bed_double', 5.6, 9.1)
    .item('nightstand', 4.6, 9.1)
    .item('wardrobe', 0.05, 12.4, 270)
    .item('bathtub', 12.3, 12.9)
    .item('toilet', 9.05, 14.9, 270)
    .item('washbasin', 12.85, 9.6, 90)
    .item('desk_set', 20.4, 12.4)
    .item('bookshelf', 23.15, 10.4, 90)
    .item('armchair', 15.4, 13.6)
    .item('garden_bench', 7.6, 17.9)
    .item('plant', 12.5, 17.4);

  return [{ ...u.f, secret: true }, g.f, t.f];
}
