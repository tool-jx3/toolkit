/**
 * 野外・地下的範本（本站自己畫的平面圖，2026-10 增補）：洞窟、地下教團據點。北邊在上；1 格 = 0.5 m。
 */
import { FloorBuilder, mapRegions, type TplFloor } from './builder';

/* ---------- 洞窟（不規則的洞室與通道、地底湖、祭壇、GM 專用的封印之間） ---------- */

/**
 * 洞窟的字元圖：一個字元 1 m（2 × 2 格）。洞窟類的房間彼此之間沒有牆，拼起來就是不規則的洞室，
 * 外圍自動是岩壁；地底湖（水邊類）整個被湖畔圍住，不會開到外面。
 */
const CAVE_MAP = [
  '..............AAAAAA..........',
  '............AAAAAAAAA.........',
  '............AAAAAAAAA...XXXX..',
  '.............AAAAAAA...XXXXXX.',
  '................nn.....XXXXXX.',
  '...............MMMMM...XXXXXX.',
  '..............MMMMMMMM.XXXXXX.',
  '....eeee.....MMMMMMMMMcXXXXX..',
  '...eeeeee....MMMMMMMMM........',
  'gggeeeeeetttttMMMMMMMM........',
  'gggeeeeeetttttMMMMMMMM........',
  'gggeeeeee....MMMMMMMMM........',
  '...eeeeee....MMMMMMMMM........',
  '....eeee....kkMMMMMMMM........',
  '..........kkkkkMMMMssssss.....',
  '.........kkkkk...sssssssss....',
  '.........kkkk....sssLLLLLLss..',
  '..........kk.....sssLLLLLLsss.',
  '.................sssLLLLLLsss.',
  '..................ssLLLLLsss..',
  '...................sssssssss..',
  '.....................sssss....',
];

export function cave(): TplFloor[] {
  const b = new FloorBuilder('洞窟');
  const passage = { name: '通道', cat: 'cave', extra: { hideLabel: true } } as const;
  const rooms = mapRegions(
    b,
    CAVE_MAP,
    {
      g: { name: '山徑', cat: 'garden' },
      e: { name: '洞口', cat: 'cave' },
      t: passage,
      n: passage,
      c: passage,
      M: { name: '大洞室', cat: 'cave' },
      A: { name: '祭壇', cat: 'cave' },
      k: { name: '崩落的支洞', cat: 'cave' },
      s: { name: '湖畔', cat: 'cave' },
      L: { name: '地底湖', cat: 'water' },
      X: { name: '封印之間', cat: 'cave', extra: { gm: true } },
    },
    0,
    0,
    2,
  );
  rooms.A.note = '祭壇上的神像不屬於任何已知的信仰。';
  rooms.X.note = '大洞室東側的窄縫被一塊岩石擋住（暗門）。棺材裡的東西還活著。';
  /* 通往封印之間的窄縫：手畫的岩壁＋暗門 */
  b.wall(46, 14, 46, 16, 'rock').dv(46, 14.25, 1.5, 1, 0, 'secret');
  /* 山徑、洞口（前一支探險隊的營地） */
  b.item('tree', 0.2, 18.2, 0, { size: [2.4, 2.4] })
    .item('bush', 0.4, 22.2)
    .item('campfire', 9, 22.6)
    .item('log', 8.6, 25)
    .item('log', 7, 21.9, 90)
    .item('lamp', 10.8, 23.6)
    .item('tent', 13.4, 21.6)
    .item('crate', 14.6, 16.4)
    .item('crate', 16.3, 16.6, 0, { size: [1.4, 1.4] })
    /* 通道、大洞室 */
    .item('rock', 22, 18.1, 0, { size: [1.4, 1] })
    .item('rock', 28, 15, 0)
    .item('rock', 40.5, 14.2, 0, { size: [1.6, 1.4] })
    .item('rock', 39, 26.2, 0, { size: [2, 1.6] })
    .item('pit', 29, 25)
    .item('bones', 31.8, 26.4)
    .item('rock', 33.4, 12.4, 0, { size: [1.2, 1] })
    /* 祭壇 */
    .item('altar', 30.5, 0.3, 0, { size: [5, 1.6] })
    .item('idol', 32.55, 0.65)
    .item('candle', 29, 1)
    .item('candle', 36.4, 1)
    .item('magic_circle', 30.8, 2.4, 0, { size: [4.4, 4] })
    .item('bones', 25.4, 3)
    /* 崩落的支洞 */
    .item('debris', 25, 28.2)
    .item('crate', 18.6, 30.4)
    .item('bones', 21, 34.2)
    /* 地底湖與湖畔 */
    .item('boat', 45, 36, 90)
    .item('rock', 35, 30.3, 0, { size: [1.6, 1.2] })
    .item('rock', 53, 34.4, 0, { size: [2, 1.6] })
    /* 封印之間（GM 專用） */
    .item('coffin', 49.4, 6.2, 90, { gm: true })
    .item('candle', 48.2, 9, 0, { gm: true })
    .item('candle', 54.8, 9, 0, { gm: true })
    .item('cage', 54.4, 11.4, 0, { gm: true, size: [2.6, 2.6] })
    .item('bones', 48, 11.4, 0, { gm: true });
  return [b.f];
}

/* ---------- 地下教團據點（1F 舊書店、B1 教團的據點） ---------- */

export function cult(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('後倉', 'storage', 0, 0, 12, 10)
    .room('樓梯間', 'hall', 12, 0, 8, 10, { lx: 0.6, ly: 1.5 })
    .room('舊書店', 'public', 0, 10, 20, 14)
    .room('騎樓', 'porch', 0, 24, 20, 4);
  g.dh(8.5, 24, 3, -1, 0, 'door2')
    .dh(2, 10, 1.5, -1, 0)
    .dh(17, 10, 1.5, -1, 1, 'locked')
    .wh(1.5, 24, 5)
    .wh(13.5, 24, 5)
    .wv(0, 3, 3)
    .wv(20, 13, 3);
  g.item('stairs', 13, 0.6, 180, { size: [2.4, 6] })
    .item('wardrobe', 18.8, 1, 90)
    .item('crate', 0.3, 0.3)
    .item('crate', 2.1, 0.3)
    .item('crate', 0.3, 2.1)
    .item('cabinet', 5, 0.1)
    .item('table', 6.6, 4.5, 0, { size: [2.8, 1.6] })
    .item('bookshelf', 0.1, 11.2, 270)
    .item('bookshelf', 0.1, 14.4, 270)
    .item('bookshelf', 0.1, 17.6, 270)
    .item('bookstack', 3.5, 12.4, 90)
    .item('bookstack', 7, 12.4, 90)
    .item('counter', 14, 13.6)
    .item('chair', 15.5, 12.4)
    .item('bookshelf', 19.1, 16.6, 90)
    .item('table', 4, 19, 0, { size: [2.8, 1.6] })
    .item('lamp', 18.6, 22.2)
    .item('plant', 0.4, 25.4);
  g.find('樓梯間').note = '店主說是「倉庫的樓梯」，門一直鎖著。';

  const bm = new FloorBuilder('B1');
  bm.room('宿舍', 'bedroom', 0, 0, 12, 10)
    .room('前室', 'hall', 12, 0, 8, 10, { lx: 0.6, ly: 1.5 })
    .room('資料室', 'office', 20, 0, 8, 10)
    .room('教主室', 'bedroom', 28, 0, 8, 10)
    .room('走廊', 'hall', 0, 10, 36, 3, { hideLabel: true })
    .room('集會廳', 'special', 0, 13, 22, 15)
    .room('看守區', 'hall', 22, 13, 8, 15, { ly: -4.5 })
    .room('牢房 1', 'danger', 22, 20, 4, 8, { noWall: true })
    .room('牢房 2', 'danger', 26, 20, 4, 8, { noWall: true })
    .room('獻祭室', 'danger', 30, 13, 6, 15, {
      gm: true,
      ly: 2.6,
      note: '走廊盡頭的牆是暗門。教團在新月之夜把「祭品」帶到這裡。',
    });
  /* 牢房「不產生牆」，自己畫鐵欄杆與隔間 */
  bm.wall(22, 20, 30, 20, 'bars').wall(26, 20, 26, 28).wall(22, 20, 22, 28).wall(30, 20, 30, 28);
  bm.dh(2, 10, 1.5, -1, 0)
    .dh(16.5, 10, 1.5, -1, 0)
    .dh(21, 10, 1.5, -1, 0)
    .dh(29, 10, 1.5, -1, 0)
    .dh(9.5, 13, 3, 1, 0, 'door2')
    .dh(23, 13, 1.5, 1, 0)
    .dh(23.5, 20, 1.5, -1, 0, 'locked')
    .dh(27.5, 20, 1.5, -1, 0, 'locked')
    .dh(32, 13, 1.5, 1, 0, 'secret');
  /* 宿舍、前室、資料室、教主室 */
  bm.item('bed_single', 0.3, 0.2)
    .item('bed_single', 2.6, 0.2)
    .item('bed_single', 4.9, 0.2)
    .item('bed_single', 7.2, 0.2)
    .item('locker', 11, 0.5, 90)
    .item('wardrobe', 5, 8.7, 180)
    .item('stairs', 13, 0.6, 180, { size: [2.4, 6] })
    .item('locker', 19, 1, 90)
    .item('bookshelf', 20.5, 0.1)
    .item('bookshelf', 23.7, 0.1)
    .item('desk', 26.8, 3, 90)
    .item('chair', 25.6, 3.7, 270)
    .item('filing', 20.1, 4, 270)
    .item('whiteboard', 20.1, 5.6, 270, { size: [3, 0.4] })
    .item('bed_double', 32, 0.3, 90)
    .item('desk', 28.6, 0.2)
    .item('chair', 29.3, 1.5, 180)
    .item('altar', 31.5, 8.3, 180, { size: [3, 1.4] })
    .item('bookshelf', 35.1, 4, 90)
    .item('safe', 33.8, 8.6, 0, { size: [1.2, 1.2] });
  /* 集會廳：長椅朝南邊的祭壇，地上有魔法陣 */
  for (const y of [14.8, 17]) bm.item('pew', 1.4, y).item('pew', 14.6, y);
  bm.item('altar', 8, 26, 180, { size: [6, 1.8] })
    .item('idol', 10.55, 26.4)
    .item('candle', 6.6, 26.6)
    .item('candle', 14.6, 26.6)
    .item('candle', 7, 20)
    .item('candle', 14.2, 20)
    .item('magic_circle', 8, 19.6, 0, { size: [6, 6] });
  /* 看守區與牢房 */
  bm.item('table', 28.2, 14.4, 90)
    .item('chair', 27, 15.2, 270)
    .item('futon', 22.2, 26, 90, { size: [1.8, 3.6] })
    .item('futon', 26.2, 26, 90, { size: [1.8, 3.6] })
    .item('barrel', 28.8, 21.4, 0, { size: [0.9, 0.9] });
  /* 獻祭室（GM 專用） */
  bm.item('op_table', 31.5, 17, 0, { gm: true })
    .item('blood', 32, 22, 0, { gm: true })
    .item('cage', 32.6, 24.6, 0, { gm: true })
    .item('candle', 30.4, 15.2, 0, { gm: true })
    .item('candle', 35, 15.2, 0, { gm: true })
    .item('knife', 34.7, 21.8, 0, { gm: true });
  return [bm.f, g.f];
}
