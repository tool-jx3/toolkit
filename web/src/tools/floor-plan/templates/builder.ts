/**
 * 範本的組裝工具：以格為單位寫房間、門窗、家具、文字、牆。範本的內容全部是本站自己畫的。
 *
 * - 門：dh＝橫線（y 固定）上的門，side +1 往下開、−1 往上開；dv＝直線（x 固定）上的門，side +1 往右開、−1 往左開。
 *   hinge 0＝鉸鍊在起點（左／上）、1＝在終點。
 * - 家具：x、y 是轉向後外框的左上角；size 可以換掉預設尺寸（轉向前的寬 × 深）。
 */
import { ASSET, assetDims } from '../model/assets';
import { emptyFloor, uid } from '../model/geometry';
import type {
  Floor,
  Item,
  Opening,
  OpeningKind,
  Room,
  RoomCategory,
  TextLabel,
  Wall,
  WallKind,
} from '../model/types';

type NoId<T> = Omit<T, 'id'>;

export interface TplFloor {
  name: string;
  rooms: NoId<Room>[];
  walls: NoId<Wall>[];
  openings: NoId<Opening>[];
  items: NoId<Item>[];
  texts: NoId<TextLabel>[];
}

export type RoomExtra = Partial<
  Pick<Room, 'plName' | 'note' | 'gm' | 'hideLabel' | 'noWall' | 'lx' | 'ly' | 'color'>
>;
export type ItemExtra = Partial<Pick<Item, 'label' | 'gm' | 'clue' | 'flip' | 'color'>> & {
  size?: [number, number];
};
export type DoorExtra = Partial<Pick<Opening, 'gm'>>;
export type TextExtra = Partial<Pick<TextLabel, 'size' | 'bold' | 'color' | 'gm' | 'clue'>>;

export class FloorBuilder {
  readonly f: TplFloor;

  constructor(name: string) {
    this.f = { name, rooms: [], walls: [], openings: [], items: [], texts: [] };
  }

  room(
    name: string,
    cat: RoomCategory,
    x: number,
    y: number,
    w: number,
    h: number,
    extra?: RoomExtra,
  ): this {
    this.f.rooms.push({ name, cat, x, y, w, h, ...extra });
    return this;
  }

  /** 橫線上的門 */
  dh(
    x: number,
    y: number,
    len: number,
    side: 1 | -1,
    hinge: 0 | 1 = 0,
    kind: OpeningKind = 'door',
    extra?: DoorExtra,
  ): this {
    this.f.openings.push({ kind, o: 'h', x, y, len, side, hinge, ...extra });
    return this;
  }

  /** 直線上的門 */
  dv(
    x: number,
    y: number,
    len: number,
    side: 1 | -1,
    hinge: 0 | 1 = 0,
    kind: OpeningKind = 'door',
    extra?: DoorExtra,
  ): this {
    this.f.openings.push({ kind, o: 'v', x, y, len, side, hinge, ...extra });
    return this;
  }

  /** 橫線上的窗 */
  wh(x: number, y: number, len: number, kind: OpeningKind = 'window'): this {
    this.f.openings.push({ kind, o: 'h', x, y, len, side: 1, hinge: 0 });
    return this;
  }

  /** 直線上的窗 */
  wv(x: number, y: number, len: number, kind: OpeningKind = 'window'): this {
    this.f.openings.push({ kind, o: 'v', x, y, len, side: 1, hinge: 0 });
    return this;
  }

  item(t: string, x: number, y: number, rot = 0, extra?: ItemExtra): this {
    const a = ASSET[t];
    if (!a) throw new Error(`unknown asset ${t}`);
    const { size, ...rest } = extra ?? {};
    const d = assetDims(size ? { w: size[0], h: size[1] } : a, rot);
    this.f.items.push({ t, x, y, w: d.w, h: d.h, rot, ...rest });
    return this;
  }

  text(text: string, x: number, y: number, extra?: TextExtra): this {
    this.f.texts.push({ text, x, y, ...extra });
    return this;
  }

  wall(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: WallKind = 'int',
    extra?: { gm?: boolean },
  ): this {
    this.f.walls.push({ x1, y1, x2, y2, kind, ...extra });
    return this;
  }

  /** 名字是 name 的房間（加筆記、GM 設定用） */
  find(name: string): NoId<Room> {
    const r = this.f.rooms.find((x) => x.name === name);
    if (!r) throw new Error(`no room ${name}`);
    return r;
  }
}

/**
 * 把範圍內空著的格子（沒有房間的地方）用不重疊的長方形戶外房間鋪滿（庭院、空地）：
 * 由上往下、由左往右找空格，先往右延伸到底，再在整段都空著的情況下往下延伸。
 */
export function fillYard(
  b: FloorBuilder,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  name: string,
  cat: RoomCategory = 'garden',
  extra?: RoomExtra,
): void {
  const taken = new Set<string>();
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) taken.add(`${i},${j}`);
  };
  for (const r of b.f.rooms) mark(r.x, r.y, r.w, r.h);
  const open = (x: number, y: number) => !taken.has(`${x},${y}`);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!open(x, y)) continue;
      let w = 1;
      while (x + w < x1 && open(x + w, y)) w++;
      let h = 1;
      const rowFree = (yy: number) => {
        for (let i = x; i < x + w; i++) if (!open(i, yy)) return false;
        return true;
      };
      while (y + h < y1 && rowFree(y + h)) h++;
      b.room(name, cat, x, y, w, h, { hideLabel: true, ...extra });
      mark(x, y, w, h);
    }
}

export interface RegionSpec {
  name: string;
  cat: RoomCategory;
  extra?: RoomExtra;
}

/**
 * 不規則的區域（洞窟、岩地）：用字元圖畫，每個字元是 scale × scale 格（左上角在 x0、y0），
 * 圖例裡沒有的字元（例如「.」）是空的。同一個字元的格子拆成不重疊的長方形房間（同 fillYard：由上往下、
 * 由左往右，先往右延伸、再往下延伸），名字只寫在最大的那一塊（其他塊不顯示名字）。
 * 同種類的戶外房間（洞窟）彼此之間沒有牆，所以拼起來就是一個不規則的洞室，外圍自動是岩壁。
 * 回傳每個字元寫名字的那一塊（調整名字的位置、加筆記用）。
 */
export function mapRegions(
  b: FloorBuilder,
  rows: readonly string[],
  legend: Readonly<Record<string, RegionSpec>>,
  x0 = 0,
  y0 = 0,
  scale = 1,
): Record<string, NoId<Room>> {
  const taken = new Set<string>();
  const at = (x: number, y: number) => (taken.has(`${x},${y}`) ? '' : (rows[y]?.[x] ?? ''));
  const pieces = new Map<string, { x: number; y: number; w: number; h: number }[]>();
  const width = Math.max(...rows.map((r) => r.length));
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      if (!legend[ch]) continue;
      let w = 1;
      while (at(x + w, y) === ch) w++;
      let h = 1;
      const rowSame = (yy: number) => {
        for (let i = x; i < x + w; i++) if (at(i, yy) !== ch) return false;
        return true;
      };
      while (y + h < rows.length && rowSame(y + h)) h++;
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) taken.add(`${i},${j}`);
      const list = pieces.get(ch) ?? [];
      list.push({ x, y, w, h });
      pieces.set(ch, list);
    }
  const labelled: Record<string, NoId<Room>> = {};
  for (const [ch, list] of pieces) {
    const spec = legend[ch];
    const biggest = list.reduce((a, p) => (p.w * p.h > a.w * a.h ? p : a), list[0]);
    /* 寫名字的那一塊先加：用名字找房間（線索、筆記）時找到的是它 */
    for (const p of [biggest, ...list.filter((q) => q !== biggest)]) {
      b.room(spec.name, spec.cat, x0 + p.x * scale, y0 + p.y * scale, p.w * scale, p.h * scale, {
        ...spec.extra,
        ...(p === biggest ? {} : { hideLabel: true }),
      });
      if (p === biggest) labelled[ch] = b.f.rooms[b.f.rooms.length - 1];
    }
  }
  return labelled;
}

/** 範本的樓層 → 專案的樓層（加 id） */
export function toFloor(t: TplFloor): Floor {
  const f = emptyFloor(t.name);
  f.rooms = t.rooms.map((r) => ({ ...r, id: uid('r') }));
  f.walls = t.walls.map((w) => ({ ...w, id: uid('w') }));
  f.openings = t.openings.map((o) => ({ ...o, id: uid('o') }));
  f.items = t.items.filter((i) => ASSET[i.t]).map((i) => ({ ...i, id: uid('i') }));
  f.texts = t.texts.map((x) => ({ ...x, id: uid('t') }));
  return f;
}

/**
 * 走廊北側（south＝false：房間在走廊上方、入口在下）或南側（入口在上）的房間，用「入口在下」的區域座標寫：
 * lx、ly 從房間左上角算，房間深 depth。南側的房間把 y 上下翻轉，家具的方向也跟著轉。
 */
export class Unit {
  constructor(
    private b: FloorBuilder,
    private x: number,
    private y: number,
    private depth: number,
    private south: boolean,
  ) {}

  private ry(ly: number, h: number): number {
    return this.south ? this.y + this.depth - ly - h : this.y + ly;
  }

  room(
    name: string,
    cat: RoomCategory,
    lx: number,
    ly: number,
    w: number,
    h: number,
    hideLabel = false,
  ): this {
    this.b.room(
      name,
      cat,
      this.x + lx,
      this.ry(ly, h),
      w,
      h,
      hideLabel ? { hideLabel } : undefined,
    );
    return this;
  }

  /** 橫線上的門：ly 是線的位置；side 以「入口在下」為準 */
  dh(
    lx: number,
    ly: number,
    len: number,
    side: 1 | -1,
    hinge: 0 | 1,
    kind: Parameters<FloorBuilder['dh']>[5] = 'door',
  ): this {
    this.b.dh(this.x + lx, this.ry(ly, 0), len, (this.south ? -side : side) as 1 | -1, hinge, kind);
    return this;
  }

  dv(
    lx: number,
    ly: number,
    len: number,
    side: 1 | -1,
    hinge: 0 | 1,
    kind: Parameters<FloorBuilder['dv']>[5] = 'door',
  ): this {
    this.b.dv(
      this.x + lx,
      this.ry(ly, len),
      len,
      side,
      (this.south ? 1 - hinge : hinge) as 0 | 1,
      kind,
    );
    return this;
  }

  wh(lx: number, ly: number, len: number): this {
    this.b.wh(this.x + lx, this.ry(ly, 0), len);
    return this;
  }

  /** 家具：w、h 是轉向後的外框 */
  item(
    t: string,
    lx: number,
    ly: number,
    rot: number,
    _w: number,
    h: number,
    extra?: ItemExtra,
  ): this {
    const r = this.south && (rot === 0 || rot === 180) ? (rot + 180) % 360 : rot;
    this.b.item(t, this.x + lx, this.ry(ly, h), r, extra);
    return this;
  }
}
