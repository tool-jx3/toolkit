/**
 * 神社（2026-10-22 依 7.18 整個重新設計，本站自己畫的平面圖）：沿著山坡往上的山腰神社。
 * 山道旁的鳥居進到下段境內（授與所、宮司宅、手水舍），石階上到中段境內（參籠所、一排小鳥居通往稻荷社），
 * 再上一段石階到上段境內：社殿面向東邊（緣側、外陣、內陣），北東的磐座後面是封印的岩屋（GM 專用）。
 * 各段之間是手畫的石垣（戶外的地面本來沒有牆），石階留開口；岩屋與磐座之間是岩壁＋封印的門。
 * 北邊（山頂）在上；1 格 = 0.5 m。
 */
import { FloorBuilder, fillYard, type TplFloor } from './builder';

/** 千本鳥居的小鳥居（朱色） */
const VERMILION = '#b8322a';

export function shrine(): TplFloor[] {
  const b = new FloorBuilder('1F');
  /* 山道與三段境內（戶外），再放上面的建物（巢狀的室內房間） */
  b.room('山道', 'road', 0, 46, 56, 4, { lx: 12 })
    .room('下段境內', 'dirt', 0, 34, 26, 12, { lx: 4, ly: 3.4 })
    .room('中段境內', 'dirt', 16, 22, 40, 12, { lx: 10, ly: 4.4 })
    .room('上段境內', 'gravel', 0, 8, 40, 14, { lx: 6, ly: 4.6 })
    .room('磐座', 'dirt', 40, 10, 16, 12, { ly: 3.6 })
    .room('岩屋', 'cave', 44, 0, 12, 10, {
      gm: true,
      ly: 2.6,
      note: '磐座後面的岩戶被封印著，注連繩每年都換新的，卻沒有人記得是誰換的。洞底的祭壇前有一個深不見底的洞，祭典的前一晚會傳出聲音。',
    })
    .room('岩屋', 'cave', 42, 3, 2, 5, { gm: true, hideLabel: true })
    .room('宮司宅', 'washitsu', 0, 36, 9, 8, { ly: -1.6 })
    .room('授與所', 'office', 12, 36, 6, 5, { ly: 0.4 })
    .room('參籠所', 'washitsu', 16, 22, 10, 7, { lx: -1.4, ly: 1.6 })
    .room('稻荷社', 'special', 50, 24, 5, 6, { ly: 0.4 })
    .room('內陣', 'special', 2, 11, 6, 6, { lx: 0.6, ly: 1.8 })
    .room('外陣', 'washitsu', 8, 10, 10, 8, { ly: 2.8 })
    .room('緣側', 'engawa', 18, 10, 2, 8);
  fillYard(b, 0, 0, 40, 46, '山林');
  fillYard(b, 40, 34, 56, 46, '山林');
  const forest = b.f.rooms
    .filter((r) => r.name === '山林')
    .reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a));
  forest.hideLabel = false;
  /* 石垣（各段之間，石階的地方留開口）、玉垣（沿山道）、岩屋前的岩壁 */
  b.wall(16, 34, 20.5, 34, 'stone')
    .wall(24, 34, 26, 34, 'stone')
    .wall(26, 22, 34.5, 22, 'stone')
    .wall(37, 22, 40, 22, 'stone')
    .wall(40, 22, 56, 22, 'stone')
    .wall(0, 46, 7.5, 46, 'fence')
    .wall(12.5, 46, 26, 46, 'fence')
    .wall(44, 10, 56, 10, 'rock');
  /* 門：封印的岩戶、社殿（緣側 → 外陣 → 內陣）、參籠所、稻荷社、授與所、宮司宅 */
  b.dh(48, 10, 2, -1, 0, 'sealed')
    .dv(20, 11.5, 5, 1, 0, 'open')
    .dv(18, 11, 6, 1, 0, 'sliding2')
    .dv(8, 12.5, 3, -1, 0, 'sliding2')
    .dh(19, 29, 3, 1, 0, 'sliding2')
    .dv(50, 26.25, 1.5, -1, 0, 'sliding')
    .dv(12, 38.5, 1.5, -1, 0, 'sliding')
    .dv(9, 40, 1.5, 1, 0, 'sliding')
    .wh(10, 18, 2)
    .wh(14, 18, 2)
    .wh(13, 41, 3)
    .wh(2.5, 36, 2)
    .wv(0, 41, 2)
    .wv(26, 24, 2);
  /* 石階（兩段） */
  b.item('ext_stairs', 20.8, 31).item('ext_stairs', 34.55, 19);
  /* 上段境內：賽錢箱、石燈籠、狛犬、神木、松樹、末社 */
  b.item('saisen', 21.2, 13.6)
    .item('lantern', 21.5, 9)
    .item('lantern', 21.5, 18.6)
    .item('komainu', 32.6, 18.4)
    .item('komainu', 37.5, 18.4)
    .item('tree', 26, 9.5, 0, { label: '神木' })
    .item('pine', 29.6, 13.6)
    .item('hokora', 1, 19)
    .item('lantern', 3.6, 19.2)
    .item('bamboo', 36.6, 8.6);
  /* 社殿：內陣的祭壇、外陣的坐墊與屏風 */
  b.item('altar', 2.05, 12.5, 270)
    .item('idol', 2.35, 13.6)
    .item('candle', 2.45, 12.7)
    .item('offering', 4, 13.5, 270)
    .row('zabuton', 11, 12.2, 3, 1.8, 0)
    .row('zabuton', 11, 14.6, 3, 1.8, 0)
    .item('byobu', 12.5, 10.05);
  /* 磐座：岩石、竹籬、石碑、小祠 */
  b.item('rock', 46.8, 14.8)
    .item('garden_rock', 50, 17)
    .item('garden_rock', 43.4, 17.6)
    .item('bamboo_fence', 45.2, 13.6, 0, { size: [5, 0.5] })
    .item('stele', 42.4, 11)
    .item('hokora', 53, 18.4);
  /* 岩屋（GM 專用）：祭壇、神像、蠟燭、深不見底的洞、骨頭 */
  b.item('altar', 48, 0.6, 0, { gm: true })
    .item('idol', 49.05, 0.95, 0, { gm: true })
    .item('candle', 48.2, 1, 0, { gm: true })
    .item('candle', 50.1, 1, 0, { gm: true })
    .item('abyss', 52, 5, 0, { gm: true })
    .item('bones', 45, 5.6, 0, { gm: true })
    .item('offering', 45.2, 1.2, 0, { gm: true });
  /* 中段境內：千本鳥居、石燈籠、石碑、樹；參籠所、稻荷社 */
  b.row('torii', 30, 25.5, 9, 2.2, 0, 90, { size: [3, 0.8], color: VERMILION })
    .item('lantern', 19.2, 31.2)
    .item('lantern', 23.6, 31.2)
    .item('stele', 27.6, 31.4)
    .item('tree', 40, 30.4)
    .item('hokora', 53.4, 31.6)
    .row('futon', 16.4, 22.3, 3, 2.4, 0)
    .item('andon', 24.6, 22.4)
    .item('zataku', 23, 26.4)
    .item('hokora', 52.6, 24.4)
    .item('komainu', 50.6, 28.4);
  /* 下段境內：鳥居、手水舍、石燈籠；授與所、宮司宅 */
  b.item('torii', 7, 44.4, 0, { size: [6, 1.2] })
    .item('temizuya', 19.5, 37.6)
    .item('lantern', 13.4, 44)
    .item('lantern', 23.6, 38.4)
    .item('counter', 13, 39.75, 180)
    .item('cabinet', 13, 36.05)
    .item('futon', 0.4, 36.3)
    .item('tokonoma', 5, 36.05)
    .item('zataku', 4, 39.8)
    .item('zabuton', 4.6, 42.2)
    .item('chest', 0.4, 42.95, 180);
  /* 山道、山林 */
  b.item('jizo', 2, 46.6)
    .item('utility_pole', 30, 46.4)
    .item('tree', 2, 1)
    .item('tree', 9, 3)
    .item('tree', 15, 0.5)
    .item('tree', 33, 1)
    .item('tree', 2, 24)
    .item('tree', 8, 29)
    .item('tree', 11.5, 23)
    .item('bamboo', 3, 30.5)
    .item('tree', 30, 38)
    .item('tree', 36, 41)
    .item('pine', 44, 37)
    .item('tree', 50.5, 40);
  return [b.f];
}
