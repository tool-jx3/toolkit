/**
 * 飯店、醫院的範本（本站自己畫的平面圖）。中走廊型：走廊兩側排房間，電梯與樓梯上下對齊。
 */
import type { RoomCategory } from '../model/types';
import { FloorBuilder, type ItemExtra, type TplFloor } from './builder';

/**
 * 走廊北側（south＝false：房間在走廊上方、入口在下）或南側（入口在上）的房間，用「入口在下」的區域座標寫：
 * lx、ly 從房間左上角算，房間深 depth。南側的房間把 y 上下翻轉，家具的方向也跟著轉。
 */
class Unit {
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

/* ---------- 商務飯店（1F 大廳、2F 客房） ---------- */

/** 客房：寬 w × 深 10，入口旁邊是浴室，床靠牆、窗戶在最裡面 */
function guestRoom(b: FloorBuilder, x: number, w: number, number: string, south: boolean): void {
  const y = south ? 13 : 0;
  const u = new Unit(b, x, y, 10, south);
  u.room(`${number} 號房`, 'bedroom', 0, 0, w, 10)
    .room('浴室', 'wet', 0, 6, 3, 4)
    .dh(w - 2.25, 10, 1.5, -1, 1)
    .dv(3, 7, 1.5, -1, 1)
    .wh(1.5, 0, 3)
    .item('bed_double', 0, 1, 270, 4, 2.8)
    .item('nightstand', 0, 0.05, 270, 0.9, 0.9)
    .item('desk', w - 1.2, 1, 90, 1.2, 2.4)
    .item('armchair', w - 2.4, 4.4, 0, 1.6, 1.6, { size: [1.6, 1.6] })
    .item('shower', 0, 6, 0, 1.6, 1.6, { size: [1.6, 1.6] })
    .item('toilet', 0, 8.6, 270, 1.4, 1, { size: [1, 1.4] })
    .item('washbasin', 1.5, 8.9, 180, 1.5, 1.1, { size: [1.5, 1.1] });
}

export function hotel(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('廚房', 'kitchen', 0, 0, 10, 5)
    .room('餐廳', 'kitchen', 0, 5, 10, 17)
    .room('櫃台後方', 'office', 10, 0, 8, 5)
    .room('電梯廳', 'hall', 18, 0, 6, 5)
    .room('樓梯間', 'hall', 24, 0, 5, 5)
    .room('洗手間', 'wet', 29, 0, 7, 5)
    .room('大廳', 'public', 10, 5, 26, 12)
    .room('咖啡吧', 'living', 10, 17, 6, 5)
    .room('會議室', 'office', 24, 17, 12, 5)
    .room('入口', 'porch', 16, 17, 8, 3);
  g.dv(10, 9, 3, -1, 0, 'door2')
    .dh(4, 5, 1.5, -1, 0)
    .dv(0, 1.5, 1.5, -1, 0)
    .dh(16.25, 5, 1.5, -1, 1)
    .dh(18.5, 5, 5, 1, 0, 'open')
    .dh(24.3, 5, 1.5, -1, 0)
    .dh(30.5, 5, 1.5, -1, 0)
    .dh(28, 17, 3, -1, 0, 'door2')
    .dh(11, 17, 4, 1, 0, 'open')
    .dh(18.5, 17, 3, -1, 0, 'auto')
    .wv(0, 8, 4)
    .wv(0, 15, 4)
    .wh(3, 22, 4)
    .wh(11, 22, 4)
    .wh(26.5, 22, 3)
    .wh(31, 22, 3)
    .wv(36, 8, 4)
    .wv(36, 18, 2.5)
    .wh(4, 0, 3);
  g.item('kitchen', 2.6, 0)
    .item('stove', 7.7, 0)
    .item('fridge', 0.2, 3.5)
    .item('counter', 6, 3.8, 180, { size: [3.6, 1.2] })
    .item('dining4', 1.2, 7.4)
    .item('dining4', 5.2, 7.4)
    .item('dining4', 1.2, 12)
    .item('dining4', 5.2, 12)
    .item('booth', 1.2, 16.8)
    .item('booth', 5.2, 16.8)
    .item('office_desk', 10.4, 0)
    .item('office_desk', 13.2, 0)
    .item('safe', 16.5, 0.3)
    .item('elevator', 19, 0, 0, { size: [4, 3.6] })
    .item('stairs', 26.4, 0.3, 180, { size: [2.4, 4.4] })
    .item('washbasin', 29, 0.9, 270)
    .item('washbasin', 29, 2.8, 270)
    .item('toilet', 32.2, 0)
    .item('toilet', 33.6, 0)
    .item('toilet', 35, 0)
    .wall(33.4, 0, 33.4, 1.9, 'thin')
    .wall(34.8, 0, 34.8, 1.9, 'thin')
    .item('reception', 10.5, 5)
    .item('rug', 17.6, 9.6, 0, { size: [6.6, 5] })
    .item('sofa3', 18.6, 12.4, 180)
    .item('lowtable', 19.7, 10.6)
    .item('armchair', 16.6, 10.2, 90)
    .item('armchair', 23.4, 10.2, 270)
    .item('plant', 10.3, 14.6)
    .item('plant', 34.6, 5.4)
    .item('plant', 34.6, 15.6)
    .item('bench', 28.5, 13, 0, { size: [4, 1] })
    .item('counter', 10.2, 20.6, 180, { size: [3, 1.2] })
    .item('table_round', 13.6, 18.4, 0, { size: [1.4, 1.4] })
    .item('meeting6', 27.5, 18.1, 0, { size: [6, 3.6] })
    .item('whiteboard', 35.6, 18.2, 90)
    .item('plant', 16.4, 18.4)
    .item('plant', 22.4, 18.4);

  const u = new FloorBuilder('2F');
  u.room('走廊', 'hall', 0, 10, 36, 3, { hideLabel: true })
    .room('電梯廳', 'hall', 18, 0, 6, 10)
    .room('樓梯間', 'hall', 24, 0, 5, 10);
  guestRoom(u, 0, 6, '201', false);
  guestRoom(u, 6, 6, '202', false);
  guestRoom(u, 12, 6, '203', false);
  guestRoom(u, 29, 7, '205', false);
  for (const [i, n] of ['206', '207', '208', '209', '210', '211'].entries())
    guestRoom(u, i * 6, 6, n, true);
  u.dh(18.5, 10, 5, 1, 0, 'open').dh(24.3, 10, 1.5, -1, 0).wv(36, 10.75, 1.5).wh(19.5, 0, 3);
  u.item('elevator', 19, 0, 0, { size: [4, 3.6] })
    .item('stairs', 26.4, 0.3, 180, { size: [2.4, 4.4] })
    .item('vending', 18, 5, 270)
    .item('bench', 23.1, 4.6, 90, { size: [3, 0.9] })
    .item('plant', 0.3, 11);
  u.find('205 號房').note = '房客登記的名字是假名。';
  return [g.f, u.f];
}

/* ---------- 綜合醫院（1F 門診、2F 病房） ---------- */

function threeBedWard(b: FloorBuilder, x: number, name: string): void {
  b.room(name, 'medical', x, 0, 8, 10)
    .dh(x + 5.5, 10, 1.5, -1, 1)
    .wh(x + 1, 0, 6);
  for (let i = 0; i < 3; i++) {
    b.item('hospital_bed', x + 0.3 + i * 2.6, 0.3, 0, { size: [2.2, 4.2] });
    if (i) b.item('curtain', x + i * 2.6 + 0.05, 0.6, 90, { size: [3.8, 0.3] });
  }
  b.item('iv_stand', x + 0.4, 4.8).item('washbasin', x + 0.1, 8.9, 180, { size: [1.4, 1] });
}

function singleRoom(b: FloorBuilder, x: number, name: string): void {
  const u = new Unit(b, x, 13, 10, true);
  u.room(name, 'medical', 0, 0, 6, 10)
    .room('廁所', 'wet', 0, 6, 3, 4)
    .dh(4, 10, 1.5, -1, 1)
    .dv(3, 6.5, 1.5, -1, 0)
    .wh(1.5, 0, 3)
    .item('hospital_bed', 1.9, 0.3, 0, 2.2, 4.2)
    .item('iv_stand', 4.3, 1, 0, 0.7, 0.7)
    .item('chair', 4.4, 3.4, 0, 1, 1)
    .item('toilet', 0, 8.6, 270, 1.4, 1, { size: [1, 1.4] })
    .item('washbasin', 1.5, 8.9, 180, 1.5, 1.1, { size: [1.5, 1.1] });
}

function hospitalCore(b: FloorBuilder): void {
  b.room('電梯廳', 'hall', 16, 0, 6, 10).room('樓梯間', 'hall', 22, 0, 4, 10);
  b.dh(16.5, 10, 5, 1, 0, 'open').dh(22.3, 10, 1.5, -1, 0);
  b.item('elevator', 16.2, 0.2, 0, { size: [2.7, 3.2] })
    .item('elevator', 19.1, 0.2, 0, { size: [2.7, 3.2] })
    .item('stairs', 23.2, 0.4, 180, { size: [2.4, 6] })
    .item('bench', 17, 6.2, 0, { size: [4, 1] });
}

export function hospital(): TplFloor[] {
  const g = new FloorBuilder('1F');
  g.room('走廊', 'hall', 0, 10, 40, 3, { hideLabel: true })
    .room('掛號・批價', 'office', 0, 0, 8, 10)
    .room('藥局', 'medical', 8, 0, 8, 10)
    .room('檢驗室', 'medical', 26, 0, 7, 10)
    .room('放射科', 'medical', 33, 0, 7, 10)
    .room('候診區', 'public', 0, 13, 14, 10)
    .room('診間 1', 'medical', 14, 13, 6, 10)
    .room('診間 2', 'medical', 20, 13, 6, 10)
    .room('急診室', 'danger', 26, 13, 8, 10)
    .room('廁所', 'wet', 34, 13, 6, 10)
    .room('入口', 'porch', 2, 23, 9, 3);
  hospitalCore(g);
  g.dh(1, 10, 6, 1, 0, 'open')
    .dh(14, 10, 1.5, -1, 0)
    .wh(9.5, 10, 3)
    .dh(28, 10, 1.5, -1, 0)
    .dh(35, 10, 3, -1, 0, 'sliding2')
    .dh(1, 13, 12, 1, 0, 'open')
    .dh(15, 13, 1.5, 1, 0)
    .dh(21, 13, 1.5, 1, 0)
    .dh(26.6, 13, 3, -1, 0, 'door2')
    .dh(36, 13, 1.5, 1, 0)
    .dh(4.5, 23, 3, -1, 0, 'auto')
    .dh(30, 23, 3, -1, 0, 'auto')
    .wh(1, 0, 5)
    .wh(10, 0, 4)
    .wh(28, 0, 3)
    .wv(0, 16, 4)
    .wh(16, 23, 2.5)
    .wh(22, 23, 2.5)
    .wv(40, 16, 2)
    .wv(40, 3, 3);
  g.item('reception', 1.5, 7.5)
    .item('office_desk', 0.6, 0.6)
    .item('office_desk', 3.6, 0.6)
    .item('filing', 7, 0.2)
    .item('copier', 6.4, 4)
    .item('med_cabinet', 8.4, 0)
    .item('med_cabinet', 11.6, 0)
    .item('counter', 9.2, 8.6, 0, { size: [3.6, 1.2] })
    .item('lab_bench', 26.5, 0)
    .item('lab_bench', 26.5, 4)
    .item('tank', 30.4, 3.6, 0, { size: [2, 2] })
    .item('exam_bed', 35, 1.4, 90)
    .item('console', 34, 6.8, 0, { size: [3, 1.2] })
    .item('rack', 38.4, 6.6, 0, { size: [1.4, 1.6] })
    .item('bench', 1.5, 15.2)
    .item('bench', 1.5, 17.6)
    .item('bench', 1.5, 20)
    .item('bench', 7, 15.2)
    .item('bench', 7, 17.6)
    .item('bench', 7, 20)
    .item('vending', 12, 21.6, 180)
    .item('wheelchair', 12.4, 14.4)
    .item('plant', 0.3, 21.6)
    .item('office_desk', 18.6, 13.6, 90, { size: [2.4, 1.4] })
    .item('exam_bed', 14, 18.8, 270)
    .item('med_cabinet', 16.5, 22, 180, { size: [3, 1] })
    .item('office_desk', 24.6, 13.6, 90, { size: [2.4, 1.4] })
    .item('exam_bed', 20, 18.8, 270)
    .item('curtain', 20, 18.2, 0, { size: [3.6, 0.3] })
    .item('hospital_bed', 29.8, 14.4, 90)
    .item('hospital_bed', 29.8, 17.6, 90)
    .item('curtain', 29.9, 17.1, 0, { size: [4, 0.3] })
    .item('iv_stand', 29, 14.6)
    .item('med_cabinet', 26, 16, 270)
    .item('wheelchair', 26.4, 20.4)
    .item('toilet', 38.4, 13.2, 90)
    .item('toilet', 38.4, 15.6, 90)
    .item('toilet', 38.4, 18, 90)
    .wall(38.2, 14.5, 40, 14.5, 'thin')
    .wall(38.2, 16.9, 40, 16.9, 'thin')
    .item('washbasin', 34.2, 21.9, 180)
    .item('washbasin', 36.2, 21.9, 180)
    .item('plant', 2.4, 24.4)
    .item('plant', 9.6, 24.4);

  const u = new FloorBuilder('2F');
  u.room('走廊', 'hall', 0, 10, 40, 3, { hideLabel: true });
  threeBedWard(u, 0, '201 病房');
  threeBedWard(u, 8, '202 病房');
  hospitalCore(u);
  u.room('護理站', 'medical', 26, 0, 6, 10);
  threeBedWard(u, 32, '203 病房');
  singleRoom(u, 0, '205 單人房');
  singleRoom(u, 6, '206 單人房');
  singleRoom(u, 12, '207 單人房');
  u.room('手術室', 'medical', 18, 13, 10, 10)
    .room('器材室', 'storage', 28, 13, 5, 10)
    .room('值班室', 'bedroom', 33, 13, 7, 10);
  u.dh(26.5, 10, 5, 1, 0, 'open')
    .dh(19.5, 13, 3, 1, 0, 'auto')
    .dh(29.5, 13, 1.5, 1, 0)
    .dh(36.5, 13, 1.5, 1, 0)
    .wv(40, 10.75, 1.5)
    .wh(20, 23, 6)
    .wh(35, 23, 3)
    .wh(27.5, 0, 3);
  u.item('reception', 26.5, 7.5, 0, { size: [5, 1.4] })
    .item('office_desk', 26.4, 0.4)
    .item('med_cabinet', 28.9, 0)
    .item('filing', 30.8, 4.2)
    .item('op_table', 21.5, 15.6)
    .item('med_cabinet', 18, 18, 270)
    .item('tank', 25.2, 20.2, 0, { size: [2, 2] })
    .item('lab_bench', 24.2, 13.4, 90, { size: [3, 1.2] })
    .item('rack', 28.3, 18.6)
    .item('cabinet', 31.9, 15.4, 90, { size: [3, 1] })
    .item('crate', 28.4, 21.2)
    .item('bed_single', 33.2, 18.8, 270)
    .item('locker', 38.9, 15, 90, { size: [3, 1] })
    .item('desk', 35.5, 21.8, 180);
  u.find('手術室').note = '最後一台手術的紀錄被撕掉了。';
  return [g.f, u.f];
}
