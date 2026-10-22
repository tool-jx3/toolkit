/**
 * 廢墟的範本（2026-10 第三批後半）：由本站自己畫的工廠、學校「弄舊」而成——門窗壞掉、家具少了、
 * 散落瓦礫與碎玻璃，牆上加了裂痕、塗鴉、崩塌與霉斑（貼牆素材，第三批前半）。北邊在上；1 格 = 0.5 m。
 */
import type { Floor as ProjectFloor } from '../model/types';
import { wallLines } from '../model/walls';
import type { TplFloor } from './builder';
import { decay } from './decay';
import { factory } from './industry';
import { school } from './public';

type Floor = TplFloor;

/** 弄舊時散落的東西（瓦礫、碎玻璃）跨過手畫的牆（廁所的隔間）時拿掉 */
function dropCrossing(floors: TplFloor[]): TplFloor[] {
  for (const f of floors) {
    const lines = wallLines(f as unknown as ProjectFloor);
    f.items = f.items.filter(
      (it) =>
        !(it.t === 'debris' || it.t === 'glass') ||
        !lines.some((r) => {
          const [c0, c1, a0, a1] =
            r.o === 'h'
              ? [it.y, it.y + it.h, it.x, it.x + it.w]
              : [it.x, it.x + it.w, it.y, it.y + it.h];
          return c0 < r.c && c1 > r.c && Math.min(a1, r.b) - Math.max(a0, r.a) > 0;
        }),
    );
  }
  return floors;
}

const wallItem = (
  f: Floor,
  t: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
  gm = false,
) => f.items.push({ t, x, y, w, h, rot, ...(gm ? { gm: true } : {}) });

/* ---------- 廢棄工廠 ---------- */

export function abandonedFactory(): TplFloor[] {
  const floors = dropCrossing(decay(factory(), 4242, { remove: 4, blood: 3 }));
  const g = floors.find((f) => f.name === '1F') as Floor;
  /* 牆上的裂痕、塗鴉、崩塌；輸送帶旁的觸手侵蝕（GM 專用） */
  wallItem(g, 'crack_wall', 9, -0.4, 3, 0.8);
  wallItem(g, 'wall_graffiti', 27.5, 19.7, 3, 0.6);
  wallItem(g, 'collapse_wall', 47.2, 10, 1.6, 3, 90);
  wallItem(g, 'wall_mold', 3, 27.5, 2.4, 1);
  wallItem(g, 'tendrils', 4, 18.5, 4, 3, 0, true);
  g.items.push(
    { t: 'black_stain', x: 8, y: 14.4, w: 3, h: 2.4, rot: 0, gm: true },
    { t: 'footprints', x: 12.6, y: 14.6, w: 1, h: 3, rot: 90 },
  );
  const boiler = g.rooms.find((r) => r.name === '鍋爐室');
  if (boiler) boiler.note = '鍋爐還是溫的。工廠十年前就關了，電費帳單卻每個月都有人繳。';
  const u = floors.find((f) => f.name === '2F') as Floor;
  wallItem(u, 'wall_graffiti', 5.2, 27.7, 3, 0.6);
  wallItem(u, 'crack_wall', -0.4, 22, 0.8, 3, 90);
  return floors;
}

/* ---------- 廢校 ---------- */

export function abandonedSchool(): TplFloor[] {
  const floors = dropCrossing(decay(school(), 1313, { remove: 5, blood: 0 }));
  const g = floors.find((f) => f.name === '1F') as Floor;
  const prep = g.rooms.find((r) => r.name === '準備室');
  if (prep) {
    prep.gm = true;
    prep.note =
      '標本櫃最裡面有一個不在清冊上的標本罐。廢校那年失蹤的老師，最後一次被看到就是在這裡。';
  }
  wallItem(g, 'wall_graffiti', 5.7, 6, 0.6, 3, 90);
  wallItem(g, 'crack_wall', 57, -0.4, 3, 0.8);
  wallItem(g, 'wall_mold', 12.6, 13.5, 2.4, 1);
  const u = floors.find((f) => f.name === '2F') as Floor;
  wallItem(u, 'wall_graffiti', 31.5, -0.3, 3, 0.6);
  wallItem(u, 'collapse_wall', 49.5, -0.8, 3, 1.6);
  wallItem(u, 'wall_blood', 45, 13.6, 1.6, 0.8);
  const r = floors.find((f) => f.name === '屋頂') as Floor;
  r.items.push({ t: 'debris', x: 40, y: 8, w: 3, h: 2.4, rot: 0 });
  return floors;
}
