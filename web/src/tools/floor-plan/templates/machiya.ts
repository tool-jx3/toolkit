/**
 * 老鋪町家（事件前後）：2026-11-12 本站自己設計的範本（規格 F336、D139）。示範「事件前／事件後」兩種狀態、
 * 榻榻米的三種鋪法與 2026-11-12 新增的和家具、庭園與事件痕跡。
 *
 * 題材是日式住宅的通用構成（臨街的町家：店面、貫穿到後面的土間通道、中庭、後院的倉庫），格局、房間名稱、家具、
 * 線索與 GM 筆記都是本站自己的。故事：開當鋪的老鋪，店主在奧之間遇害、後院的土藏被撬開、寄放的漆箱不見了；
 * 真正的帳簿藏在納戶的暗間（GM 專用）。
 *
 * 事件後（右上切換）：停電（範本設了「事件後才停電」）、灶間的高窗破了（闖進來的地方）、通庭與緣側的腳印、
 * 帳場的書桌倒下・帳簿散落、中之間的圓矮桌翻倒與摔破的碗盤、奧之間的血跡與人形輪廓、被褥翻亂、
 * 土藏的門被撬開（事件後破損）、保險箱倒下、往外拖的血跡、臨街的格子窗釘上木板、門口的盛鹽、隱居間與奧之間門邊的符咒；
 * 土藏裡寄放的漆箱事件後不見了（只在事件前）。
 *
 * 街道在左（西），1 格 = 0.5 m。整塊地 30 × 10 m（x 0～60、y 0～20），主屋 18.5 × 7.5 m（x 3～40、y 2～17）。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

const AFTER = { only: 'after' } as const;

export function machiya(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('表通', 'road', 0, 0, 3, 20)
    /* ---------- 主屋：通庭、灶間（土間）；店之間、中之間、納戶、緣側與渡廊、坪庭、奧之間、隱居間 ---------- */
    .room('通庭', 'doma', 3, 2, 23, 3)
    .room('灶間', 'doma', 26, 2, 14, 6)
    .room('店之間', 'washitsu', 3, 5, 9, 12, {
      tatami: 'fushugi',
      note: '當鋪的店面。格子窗面向街道，帳場在最裡面；店主每天在這裡記帳到很晚。',
    })
    .room('中之間', 'washitsu', 12, 5, 7, 7, { tatami: 'shugi' })
    .room('納戶', 'storage', 12, 12, 7, 5)
    /* 納戶深處的暗間（GM 專用；簞笥旁邊的暗門） */
    .room('暗間', 'special', 16, 14, 3, 3, {
      gm: true,
      note: '只有店主知道的小隔間。裡面是另一本帳簿：寄放漆箱的人用的是假名字。',
    })
    .room('緣側', 'engawa', 19, 5, 2, 12)
    .room('渡廊', 'engawa', 21, 15, 5, 2)
    .room('坪庭', 'garden', 21, 5, 5, 10)
    .room('奧之間', 'washitsu', 26, 8, 8, 9, {
      tatami: 'shugi',
      note: '店主的寢室。事件那一夜燈是熄的，被褥還是溫的。',
    })
    .room('隱居間', 'washitsu', 34, 8, 6, 9, { tatami: 'ryukyu' })
    .room('湯殿', 'wet', 40, 2, 4, 4)
    .room('廁', 'wet', 40, 6, 3, 3)
    /* ---------- 後院的土藏 ---------- */
    .room('土藏', 'stone', 48, 4, 8, 8, {
      note: '收著典當品的土藏。門是從外面撬開的，鎖還掛在門上。',
    });
  fillYard(g, 3, 0, 60, 20, '庭');
  /* 主屋後面（x ≥ 40）最大的那一塊寫「後院」 */
  const yard = g.f.rooms
    .filter((r) => r.name === '庭' && r.x >= 40)
    .reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  yard.name = '後院';
  delete yard.hideLabel;

  /* ---------- 門窗 ---------- */
  g.dv(3, 2.75, 1.5, -1, 0, 'sliding') // 通庭的入口
    .dv(3, 9, 3, -1, 0, 'sliding2') // 店門
    .wv(3, 5.75, 2.5)
    .wv(3, 13.25, 2.5)
    .dh(5, 5, 3, 1, 0, 'open') // 店之間 ↔ 通庭
    .dh(14, 5, 1.5, 1, 0, 'sliding')
    .dh(19.25, 5, 1.5, 1, 0, 'open')
    .dv(26, 2.5, 2, 1, 0, 'open') // 通庭 ↔ 灶間
    .dv(12, 7.5, 3, 1, 0, 'sliding2')
    .dh(13, 12, 1.5, 1, 0, 'sliding')
    .dv(16, 14.75, 1.5, 1, 0, 'secret') // 暗間
    .dv(19, 8, 3, 1, 0, 'sliding2')
    .wv(21, 6, 3, 'window2') // 緣側面向坪庭的玻璃門
    .dv(21, 11, 2, 1, 0, 'open')
    .dv(21, 15.25, 1.5, 1, 0, 'open') // 緣側 ↔ 渡廊
    .dv(26, 15.25, 1.5, 1, 0, 'sliding') // 渡廊 ↔ 奧之間
    .wv(26, 9.5, 3, 'window2')
    .dh(30, 8, 1.5, -1, 0, 'sliding') // 灶間 ↔ 奧之間
    .dv(34, 11, 3, 1, 0, 'sliding2')
    .dv(40, 12, 2, 1, 0, 'sliding2') // 隱居間 → 後院
    .dh(36, 2, 1.5, -1, 0, 'sliding') // 灶間的後門
    .wh(38, 2, 1.5, 'window', { smashed: true }) // 事件後破掉的高窗
    .dv(40, 3.25, 1.5, 1, 0, 'sliding')
    .dv(40, 6.25, 1.5, 1, 0, 'sliding')
    .dv(48, 7, 1.5, -1, 0, 'locked', { smashed: true }) // 土藏：事件後被撬開
    .wh(50.5, 4, 1.5);

  /* ---------- 店之間：帳場、帳簞笥、神棚、陳列台；事件後書桌倒下、帳簿散落、格子窗釘上木板、門口的盛鹽 ---------- */
  g.item('counter', 5, 7)
    .item('desk', 10.8, 13.5, 90, { upset: true, label: '帳場' })
    .item('hibachi', 9.2, 14.2)
    .item('kamidana', 11.2, 10.8, 90)
    .item('tansu', 4.5, 15.9, 180)
    .item('scattered_papers', 7.6, 11, 0, AFTER)
    .item('boards', 2.55, 5.4, 90, AFTER)
    .item('boards', 2.55, 12.9, 90, AFTER)
    .item('morishio', 2.2, 2, 0, AFTER)
    .item('morishio', 2.2, 4.4, 0, AFTER);
  /* ---------- 中之間（四疊半）：圓矮桌、坐墊、茶櫃；事件後矮桌翻倒、碗盤摔破 ---------- */
  g.item('chabudai', 14.6, 7.6, 0, { upset: true })
    .item('zabuton', 13.1, 8)
    .item('zabuton', 16.6, 8)
    .item('zabuton', 14.9, 9.7)
    .item('chadansu', 16.2, 5.05)
    .item('broken_dishes', 16.4, 9.9, 0, AFTER);
  /* ---------- 納戶、暗間 ---------- */
  g.item('tansu', 12.05, 13.2, 270).item('crate', 13.4, 15.2).item('chest', 17.2, 15.9, 180);
  /* ---------- 緣側、坪庭：洗手缽、石燈籠、竹叢；事件後的腳印 ---------- */
  g.item('footprints', 19.5, 11.5, 0, AFTER)
    .item('tsukubai', 23.6, 6)
    .item('lantern', 21.6, 6.2)
    .item('bamboo', 22.6, 11.2)
    .item('ofuda', 25.65, 13.2, 90, AFTER);
  /* ---------- 奧之間（八疊）：床之間、被褥、行燈；事件後血跡與人形輪廓、被褥翻亂 ---------- */
  g.item('tokonoma', 29.6, 15.6, 180)
    .item('futon', 30.5, 9.5, 0, { upset: true })
    .item('andon', 26.6, 8.6)
    .item('zabuton', 27.6, 12.6)
    .item('blood', 29, 12, 0, AFTER)
    .item('body', 27.2, 10.5, 0, AFTER);
  /* ---------- 隱居間（半疊市松）：暖桌、壁櫥；事件後門邊的符咒 ---------- */
  g.item('oshiire', 35.2, 8.05)
    .item('kotatsu', 36, 12.8)
    .item('zabuton', 36.7, 15.6)
    .item('ofuda', 39.65, 14.4, 90, AFTER);
  /* ---------- 灶間：爐灶、水井、水槽、碗櫃；事件後破窗的碎玻璃與腳印 ---------- */
  g.item('kamado', 27.5, 2.05)
    .item('well', 31.5, 4.6)
    .item('sink', 33.5, 2.05)
    .item('cupboard', 35.5, 7.05, 180)
    .item('glass', 37.8, 2.2, 0, AFTER)
    .item('footprints', 35.5, 4.5, 90, AFTER);
  /* ---------- 湯殿、廁 ---------- */
  g.item('bathtub', 42.3, 2.3).item('toilet', 41.35, 7.6, 90);
  /* ---------- 土藏：寄放的漆箱（事件後不見了）、木箱、書架、保險箱；事件後保險箱倒下、往外拖的血跡 ---------- */
  g.item('chest', 52, 4.05, 0, { only: 'before', label: '寄放的漆箱' })
    .item('crate', 54.2, 4.2)
    .item('bookshelf', 55.15, 6.5, 90)
    .item('safe', 54.6, 10.6, 0, { upset: true })
    .item('blood_drag', 43.6, 7, 90, AFTER);
  /* ---------- 後院：葫蘆池、屋敷稻荷、石燈籠、松樹、竹叢、庭石、踏腳石 ---------- */
  g.item('gourd_pond', 46, 13.5)
    .item('inari', 57, 14, 90)
    .item('lantern', 55.2, 16)
    .item('pine', 56, 0.2)
    .item('bamboo', 57, 6)
    .item('garden_rock', 45, 10.5)
    .item('stepping', 45.5, 2, 90);
  /* ---------- 文字：事件後的 GM 筆記 ---------- */
  g.text('店主斷氣前寫了「藏」字', 29.6, 14.6, { size: 0.42, gm: true, only: 'after' });
  return [g.f];
}
