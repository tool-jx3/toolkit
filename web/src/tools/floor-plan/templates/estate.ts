/**
 * 日式老宅（事件前後）：2026-11-12 本站自己設計的範本（規格 F336、D139）。示範「事件前／事件後」兩種狀態、
 * 榻榻米的三種鋪法與 2026-11-12 新增的和家具、庭園與事件痕跡。
 *
 * 母屋（北側：台所、浴室、便所、書齋、佛間；中廊下；南側：玄關、茶之間、座敷、次之間、納戶；廣緣面向庭院）、
 * 庭院裡的離屋（茶室）、土藏（深處暗門後是 GM 專用的封印之間）、葫蘆池、屋敷稻荷與井。對應 KIIN「マップ制作スタジオ」v3.0 的「昭和の日本家屋と庭園」見本的**題材**，
 * 但格局、房間、家具、線索、GM 筆記都是本站自己的（沒有照抄原作的見本）。
 *
 * 事件後（右上切換）：停電（範本設了「事件後才停電」）、書齋的窗與廣緣的玻璃門破了、文机與暖桌、矮桌倒下・翻亂、
 * 座敷的血跡與人形輪廓、中廊下拖行的血跡、土藏的窗釘上木板、門邊貼了符咒（土藏裡 GM 專用的魔法陣）、離屋的盛鹽與符咒；
 * 佛間的全家福事件後不見了（只在事件前）。
 *
 * 北邊在上；1 格 = 0.5 m。整塊地 22 × 17 m（x 0～44、y 0～34），母屋 14 × 9.5 m（x 4～32、y 4～23）。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

const AFTER = { only: 'after' } as const;

export function japaneseEstate(): TplFloor[] {
  const g = new FloorBuilder('1F');
  /* ---------- 母屋 ---------- */
  g.room('台所', 'kitchen', 4, 4, 8, 6)
    .room('浴室', 'wet', 12, 4, 4, 6)
    .room('便所', 'wet', 16, 4, 3, 6)
    .room('書齋', 'washitsu', 19, 4, 6, 6, { tatami: 'shugi' })
    .room('佛間', 'washitsu', 25, 4, 7, 6, { tatami: 'shugi' })
    .room('中廊下', 'hall', 4, 10, 28, 2)
    .room('玄關・三和土', 'doma', 4, 12, 5, 8, { ly: 1 })
    .room('茶之間', 'washitsu', 9, 12, 6, 8, { tatami: 'shugi' })
    .room('座敷', 'washitsu', 15, 12, 8, 8, { tatami: 'shugi' })
    .room('次之間', 'washitsu', 23, 12, 6, 8, { tatami: 'fushugi' })
    .room('納戶', 'storage', 29, 12, 3, 8, { hideLabel: true })
    .room('廣緣', 'engawa', 9, 20, 23, 3)
    /* ---------- 庭院裡的離屋、土藏 ---------- */
    .room('離屋・茶室', 'washitsu', 5, 25, 6, 6, {
      tatami: 'ryukyu',
      note: '祖父晚年只在這裡見客。爐的灰底下埋著土藏封印的由來（寫在和紙上）。',
    })
    .room('土藏', 'stone', 35, 4, 6, 7, {
      note: '代代封著「那個東西」的土藏。事件那一夜封印的符咒被撕下，門是從裡面打開的。',
    })
    /* 土藏深處的封印之間（GM 專用；長持後面的暗門） */
    .room('封印之間', 'special', 38, 4, 3, 3, {
      gm: true,
      note: '長持後面的暗門。空的木箱裡留著一圈乾掉的鹽，封著的東西已經不在了。',
    });
  fillYard(g, 0, 0, 44, 34, '庭院');
  delete g.find('庭院').hideLabel;

  /* ---------- 門窗 ---------- */
  g.dv(4, 6.5, 1.5, -1, 0) // 台所的勝手口
    .dh(9, 10, 1.5, 1, 0, 'sliding')
    .dh(13.75, 10, 1.5, 1, 0, 'sliding')
    .dh(16.75, 10, 1.5, 1, 0)
    .dh(22, 10, 1.5, 1, 0, 'sliding')
    .dh(27, 10, 3, 1, 0, 'sliding2')
    .dh(5, 12, 3, -1, 0, 'open')
    .dh(5, 20, 3, 1, 0, 'sliding2') // 玄關的拉門
    .dh(10.5, 12, 3, -1, 0, 'sliding2')
    .dv(15, 14.5, 3, 1, 0, 'sliding2')
    .dv(23, 14.5, 3, 1, 0, 'sliding2')
    .dh(27, 12, 1.5, -1, 0, 'sliding')
    .dh(29.75, 12, 1.5, -1, 0, 'sliding')
    .dh(10.5, 20, 3, 1, 0, 'sliding2')
    .dh(17.5, 20, 3, 1, 0, 'sliding2')
    .dh(24.5, 20, 3, 1, 0, 'sliding2')
    .dv(32, 20.75, 1.5, 1, 0, 'sliding') // 廣緣的東端
    .dh(7.5, 25, 1.5, -1, 0, 'sliding') // 離屋
    .dv(35, 6.5, 1.5, -1, 0, 'locked') // 土藏
    .dh(38.75, 7, 1.5, 1, 0, 'secret') // 封印之間
    /* 窗：北側、廣緣面向庭院的玻璃門（事件後書齋的窗與一扇玻璃門破了） */
    .wh(8.5, 4, 2)
    .wh(13, 4, 1.5)
    .wh(21, 4, 2, 'window', { smashed: true })
    .wh(26, 4, 1.5)
    .wv(32, 4.5, 2)
    .wh(10, 23, 3.5, 'window2')
    .wh(15, 23, 3.5, 'window2')
    .wh(20, 23, 3.5, 'window2', { smashed: true })
    .wh(25, 23, 3.5, 'window2')
    .wv(11, 27, 2)
    .wh(37.5, 11, 2);

  /* ---------- 台所、浴室、便所 ---------- */
  g.item('kamado', 5, 4.05)
    .item('sink', 8.6, 4.05)
    .item('fridge', 10.6, 4.05)
    .item('cupboard', 11.05, 5.6, 90)
    .item('chabudai', 6.5, 7)
    .item('bathtub', 12.2, 4.2)
    .item('washbasin', 14.85, 4.2, 90)
    .item('toilet', 17, 4.2);
  /* ---------- 書齋（四疊半）：文机、書架、行燈；事件後文机倒下、紙張散落、碎玻璃 ---------- */
  g.item('desk', 19.05, 5, 270, { upset: true })
    .item('bookshelf', 24.15, 4.6, 90)
    .item('zabuton', 20.5, 5.6)
    .item('andon', 20.4, 8.2)
    .item('scattered_papers', 20.6, 6.8, 0, AFTER)
    .item('glass', 21.2, 4.3, 0, AFTER);
  /* ---------- 佛間：佛壇、神棚；全家福事件後不見了 ---------- */
  g.item('butsudan', 27.5, 4.05)
    .item('candle', 26, 4.3)
    .item('photo', 29.6, 4.4, 0, { only: 'before', label: '全家福' })
    .item('kamidana', 31.15, 7, 90)
    .item('zabuton', 28, 6.5);
  /* ---------- 中廊下：事件後拖行的血跡 ---------- */
  g.item('blood_drag', 22.5, 10.2, 90, AFTER);
  /* ---------- 玄關 ---------- */
  g.item('cabinet', 4.05, 14.5, 270, { label: '鞋櫃' }).item('plant', 7.6, 14.4);
  /* ---------- 茶之間（六疊）：暖桌、坐墊、茶櫃、火盆；事件後暖桌翻倒、碗盤摔破 ---------- */
  g.item('kotatsu', 10.7, 15, 0, { upset: true })
    .item('zabuton', 11.4, 13.7)
    .item('zabuton', 11.4, 17.7, 0, { upset: true })
    .item('zabuton', 9.4, 15.7)
    .item('chadansu', 9.05, 12.6, 270)
    .item('hibachi', 13.6, 12.4)
    .item('broken_dishes', 12.4, 17.8, 0, AFTER);
  /* ---------- 座敷（八疊）：床之間、矮桌、坐墊、行燈；事件後血跡與人形輪廓、矮桌倒下 ---------- */
  g.item('tokonoma', 18.2, 12.05)
    .item('zataku', 17.5, 15, 0, { upset: true })
    .item('zabuton', 18.4, 13.6)
    .item('zabuton', 18.4, 17.2)
    .item('zabuton', 16.2, 15.4, 0, { upset: true })
    .item('zabuton', 20.6, 15.4)
    .item('andon', 22, 12.2)
    .item('blood', 18, 17.8, 0, AFTER)
    .item('body', 15.4, 17.6, 90, AFTER);
  /* ---------- 次之間（不祝儀鋪法）：和式衣櫃、壁櫥、鋪好的棉被 ---------- */
  g.item('tansu', 23.1, 12.05)
    .item('oshiire', 27.15, 13.5, 90)
    .item('futon', 24.4, 14.6, 0, { upset: true });
  /* ---------- 納戶 ---------- */
  g.item('cabinet', 30.95, 13.6, 90).item('crate', 30.2, 17.6);
  /* ---------- 廣緣：事件後的腳印 ---------- */
  g.item('footprints', 21.5, 20.5, 90, AFTER);
  /* ---------- 離屋・茶室（半疊市松）：地爐；事件後的盛鹽與符咒 ---------- */
  g.item('irori', 6.5, 27)
    .item('morishio', 5.2, 25.6, 0, AFTER)
    .item('morishio', 10.2, 25.6, 0, AFTER)
    .item('ofuda', 9.5, 24.65, 0, AFTER);
  /* ---------- 土藏：長持、木箱、保險箱；事件後窗釘上木板、門邊的符咒、GM 專用的魔法陣 ---------- */
  g.item('chest', 35.2, 4.2)
    .item('crate', 38.4, 4.2, 0, { gm: true })
    .item('safe', 39.6, 8.5)
    .item('boards', 36.9, 10.55, 0, AFTER)
    .item('ofuda', 34.65, 8.6, 90, AFTER)
    .item('magic_circle', 36.4, 7.6, 0, { ...AFTER, gm: true, size: [2.6, 2.6] });
  /* ---------- 庭院：葫蘆池、石燈籠、蹲踞、井、屋敷稻荷、松樹、竹叢、踏腳石；事件後往土藏的腳印 ---------- */
  g.item('gourd_pond', 16, 26)
    .item('lantern', 25, 25.2)
    .item('lantern', 13, 29)
    .item('tsukubai', 12.2, 25.2)
    .item('well', 34.6, 14)
    .item('inari', 38.5, 16)
    .item('pine', 0.5, 28)
    .item('pine', 40, 28)
    .item('bamboo', 41, 12)
    .item('garden_rock', 27, 28)
    .item('stepping', 5.7, 21, 0, { size: [1.6, 3.6] })
    .item('footprints', 33.2, 11.6, 0, AFTER);
  /* ---------- 文字：事件後的 GM 筆記 ---------- */
  g.text('凶器的脇差不見了', 19, 14.2, { size: 0.42, gm: true, only: 'after' });
  return [g.f];
}
