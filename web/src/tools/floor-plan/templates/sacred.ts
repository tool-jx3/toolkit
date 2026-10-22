/**
 * 宗教・古蹟的範本（2026-10 第三批後半，本站自己畫的平面圖）：教會（神社、古城在 shrine.ts、castle.ts）。
 * 北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/* ---------- 教會（1F 禮拜堂與牧師館、B1 地下墓室；墓園圍繞） ---------- */

const churchStairs = (b: FloorBuilder) => b.item('stairs', 12.4, 0.6);

export function church(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('聖器室', 'storage', 4, 0, 8, 8)
    .room('後殿', 'hall', 12, 0, 8, 8, { lx: 1 })
    .room('牧師辦公室', 'office', 20, 0, 8, 8)
    .room('禮拜堂', 'special', 4, 8, 24, 30, { ly: -3 })
    .room('前廊', 'porch', 10, 38, 12, 4)
    .room('書房', 'office', 28, 8, 10, 8)
    .room('臥室', 'bedroom', 28, 16, 10, 8);
  fillYard(g, 0, 0, 44, 52, '墓園');
  g.find('墓園').hideLabel = false;
  churchStairs(g);
  g.dh(14.5, 38, 3, -1, 0, 'door2')
    .dh(16, 8, 2, 1, 0)
    .dh(8, 8, 1.5, 1, 0)
    .dh(22, 8, 1.5, 1, 1)
    .dv(28, 13, 1.5, 1, 0)
    .dh(30, 16, 1.5, 1, 0)
    .dv(38, 21.5, 1.5, 1, 0)
    .wv(4, 14, 3)
    .wv(4, 22, 3)
    .wv(4, 30, 3)
    .wv(28, 30, 3)
    .wh(14, 0, 3)
    .wh(31, 24, 3)
    .wv(38, 10, 2);
  /* 禮拜堂：祭壇、講台、管風琴、兩排長椅、告解室、聖洗池 */
  g.item('altar', 13, 11, 0, { size: [6, 1.6] })
    .item('candle', 12, 11.4)
    .item('candle', 19.2, 11.4)
    .item('lectern', 9.6, 13.4)
    .item('organ', 24, 9.8)
    .item('confessional', 4.2, 25, 270)
    .item('font', 15.3, 34.4);
  for (let i = 0; i < 6; i++) {
    g.item('pew', 7.2, 16 + i * 2.6, 0, { size: [6, 1.2] });
    g.item('pew', 19, 16 + i * 2.6, 0, { size: [6, 1.2] });
  }
  /* 聖器室、牧師辦公室、書房、臥室 */
  g.item('cabinet', 4.1, 1, 270)
    .item('chest', 8.4, 0.2)
    .item('office_desk', 23, 0.2)
    .item('chair', 23.7, 1.7)
    .item('bookshelf', 27.1, 3, 90)
    .item('bookshelf', 30, 8.1)
    .item('bookshelf', 33.2, 8.1)
    .item('desk', 36.7, 11.4, 90)
    .item('chair', 35.5, 12.1, 270)
    .item('bed_single', 35.8, 16.2)
    .item('wardrobe', 28.1, 20, 270)
    .item('nightstand', 34.8, 16.2);
  /* 墓園 */
  for (const [x, y] of [
    [1, 4],
    [1, 10],
    [1, 16],
    [1, 40],
    [32, 30],
    [36, 30],
    [40, 30],
    [32, 36],
    [36, 36],
    [40, 36],
  ] as const)
    g.item('grave', x, y);
  g.item('tree', 0.6, 46).item('tree', 39, 2).item('lantern', 23.6, 39);

  const bm = new FloorBuilder('B1');
  bm.room('地下墓室', 'stone', 8, 0, 20, 14, { wall: 'stone' }).room(
    '封印的納骨堂',
    'danger',
    8,
    14,
    20,
    8,
    {
      gm: true,
      wall: 'stone',
      note: '地下墓室南牆的鐵門被焊死，門上刻著拉丁文的警告。裡面的骨頭排成了一個圖形。',
    },
  );
  churchStairs(bm);
  bm.dh(16.5, 14, 2, 1, 0, 'sealed');
  bm.item('sarcophagus', 18, 1, 90)
    .item('coffin', 23, 1)
    .item('coffin', 23, 7.6)
    .item('coffin', 9, 8.6, 90)
    .item('candle', 16, 10)
    .item('torch', 27, 4, 90)
    .item('bones', 10, 16, 0, { gm: true })
    .item('bones', 24, 18, 0, { gm: true })
    .item('magic_circle', 15, 15.6, 0, { gm: true, size: [5, 5] });
  return [bm.f, g.f];
}

