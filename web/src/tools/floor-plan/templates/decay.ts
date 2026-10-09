/**
 * 把範本「弄舊」成廢墟：窗戶破掉或釘上木板、門壞掉或上鎖、少掉一些家具，空地上散落瓦礫、碎玻璃、血跡。
 * 用固定的種子，所以每次載入的結果相同。
 */
import { seeded } from '../draw/furniture/kit';
import { ASSET, VERTICAL_LINKS } from '../model/assets';
import { CAT, OPEN } from '../model/catalog';
import { rectContains, rectsOverlap } from '../model/geometry';
import type { Rect } from '../model/types';
import type { TplFloor } from './builder';

export interface DecayOptions {
  /** 每幾件家具拿掉一件（0＝不拿） */
  remove?: number;
  /** 每幾個房間放一灘血跡（0＝不放） */
  blood?: number;
}

export function decay(floors: TplFloor[], seed: number, options: DecayOptions = {}): TplFloor[] {
  const rnd = seeded(seed);
  for (const f of floors) {
    f.openings.forEach((o) => {
      if (o.kind === 'secret' || o.kind === 'open') return;
      if (OPEN[o.kind].group === 'window') {
        const r = rnd();
        if (r < 0.45) o.kind = 'brokenwin';
        else if (r < 0.75) o.kind = 'boarded';
      } else if (o.kind === 'door') {
        const r = rnd();
        if (r < 0.28) o.kind = 'broken';
        else if (r < 0.4) o.kind = 'locked';
      }
    });
    if (options.remove)
      f.items = f.items.filter(
        (it, i) => VERTICAL_LINKS.has(it.t) || (i + 1) % (options.remove as number) !== 0,
      );
    const blocked = (): Rect[] => {
      const zones: Rect[] = f.items
        .filter((it) => !ASSET[it.t]?.under)
        .map((it) => ({ x: it.x, y: it.y, w: it.w, h: it.h }));
      for (const o of f.openings) {
        const L = o.len;
        zones.push(
          o.o === 'h'
            ? { x: o.x - 0.2, y: o.y - L, w: L + 0.4, h: L * 2 }
            : { x: o.x - L, y: o.y - 0.2, w: L * 2, h: L + 0.4 },
        );
      }
      for (const r of f.rooms)
        zones.push({
          x: r.x + r.w / 2 + (r.lx || 0) - 2.2,
          y: r.y + r.h / 2 + (r.ly || 0) - 0.8,
          w: 4.4,
          h: 1.6,
        });
      return zones;
    };
    const scatter = (t: string, room: Rect) => {
      const a = ASSET[t];
      const zones = blocked();
      for (let k = 0; k < 30; k++) {
        const x = Math.round((room.x + 0.3 + rnd() * Math.max(0, room.w - a.w - 0.6)) * 4) / 4;
        const y = Math.round((room.y + 0.3 + rnd() * Math.max(0, room.h - a.h - 0.6)) * 4) / 4;
        const box = { x, y, w: a.w, h: a.h };
        if (!rectContains(room, box) || zones.some((z) => rectsOverlap(z, box))) continue;
        f.items.push({ t, x, y, w: a.w, h: a.h, rot: 0 });
        return;
      }
    };
    f.rooms.forEach((r, i) => {
      if (CAT[r.cat]?.outdoor || r.gm) return;
      const roll = rnd();
      if (r.w >= 5 && r.h >= 5 && roll < 0.55) scatter('debris', r);
      if (r.w >= 3 && r.h >= 3 && roll > 0.65) scatter('glass', r);
      if (options.blood && r.w >= 4 && r.h >= 4 && i % options.blood === 1) scatter('blood', r);
    });
  }
  return floors;
}
