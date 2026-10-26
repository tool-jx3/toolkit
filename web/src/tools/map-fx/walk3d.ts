/**
 * 進階 3D 的立體空間（three.js，core/three 的 createOrbitView）：房間與走廊的線框（發光的線＋很淡的牆面）、
 * 入口（牆上的開口與門框）、地上的地圖、移動路線（地上的帶子與箭頭）、現在位置與目的地的標記、浮在房間上的房名。
 *
 * - 俯瞰：拖曳轉動、滾輪拉近（OrbitControls）；沿路線：鏡頭照 walk.ts 的 walkCamera 走（不能拖曳）。
 * - 預覽與匯出共用：匯出時另外開一個看不到的 WalkView（同樣的場景），一格一格擷取（capture），不動到預覽。
 * - 外觀（顏色、線寬、標籤）是本站自訂（規格 3.12）；1 原圖 px＝1 單位，地圖左上角在原點。
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { ensureFont } from '@/core/fonts';
import { makeCanvas, roundRectPath } from '@/core/image';
import {
  computeLayout,
  encodeFxVideo,
  type FxExportContext,
  type FxExportOutput,
  type ImageSource,
  type Point,
  type Size,
  UI_FONT_STACK,
  type VideoMode,
} from '@/core/imagefx';
import { createOrbitView, disposeObject, type OrbitView } from '@/core/three';
import { type MapState, walkFileName } from './model';
import { S } from './strings';
import {
  canWalk,
  cleanPath,
  doorHeight,
  SIDES,
  solidPieces,
  WALK_FPS,
  type WalkRoom,
  type WalkState,
  walkBounds,
  walkCamera,
  walkTotal,
  walkVideoSize,
  wallOf,
  wallOpenings,
} from './walk';

/** 立體空間的顏色（自訂） */
export const WALK_COLORS = {
  room: '#7cf5b8',
  hall: '#5cd6d0',
  roomFace: '#36c98e',
  hallFace: '#3bb7b0',
  door: '#ffd27a',
  route: '#ffc94d',
  arrow: '#fff4cf',
  start: '#62e3ff',
  goal: '#ff7a5c',
  label: '#eafff4',
  labelBg: 'rgba(6, 18, 14, 0.78)',
} as const;

export interface WalkSceneInput {
  walk: WalkState;
  /** 地圖（鋪在地上；null＝不鋪） */
  image: ImageSource | null;
  /** 地圖的大小（原圖 px） */
  size: Size;
  /** 底色 */
  bg: string;
  text: { start: string; goal: string };
}

/** 場景裡有什麼（測試、說明用） */
export interface WalkStats {
  rooms: number;
  halls: number;
  openings: number;
  labels: number;
  route: boolean;
  floor: boolean;
}

/** 線寬（px，以 720 高為準；匯出時照高度放大） */
const CORE_WIDTH = 1.7;
const GLOW_WIDTH = 7;
const FLOOR_TEX_MAX = 2048;
const LABEL_FONT = 700;

/** 房名（names：所有房名接起來）、標記文字要的字型 */
export async function ensureWalkFonts(names: string, text: WalkSceneInput['text']): Promise<void> {
  const chars = `${names}${text.start}${text.goal}`;
  if (!chars.trim()) return;
  await ensureFont('Noto Sans TC', LABEL_FONT, chars).catch(() => false);
}

/* ---------- 幾何 ---------- */

type Seg = [number, number, number, number, number, number];

/** 牆上沿牆座標 u、高度 h 的點（3D：x、高度、z） */
function wallPoint(room: WalkRoom, side: (typeof SIDES)[number], u: number, h: number): Vector3 {
  const w = wallOf(room, side);
  return w.horizontal ? new Vector3(u, h, w.fixed) : new Vector3(w.fixed, h, u);
}

const seg = (a: Vector3, b: Vector3): Seg => [a.x, a.y, a.z, b.x, b.y, b.z];

function quad(out: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  out.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}

function meshOf(positions: number[], material: MeshBasicMaterial): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Mesh(g, material);
}

/** 一個房間（走廊）的線、門框與牆面 */
function roomParts(
  room: WalkRoom,
  w: WalkState,
): { lines: Seg[]; doors: Seg[]; faces: number[]; openings: number } {
  const H = w.wall;
  const dh = doorHeight(H);
  const lift = 0.6;
  const lines: Seg[] = [];
  const doors: Seg[] = [];
  const faces: number[] = [];
  let openings = 0;
  for (const side of SIDES) {
    const wall = wallOf(room, side);
    const open = wallOpenings(room, side, w.rooms, w.doors, w.door);
    openings += open.length;
    const solid = solidPieces(wall, open);
    /* 地上的線（開口的地方斷開）、牆頂的線（整面）、牆面 */
    for (const [p, q] of solid) {
      lines.push(seg(wallPoint(room, side, p, lift), wallPoint(room, side, q, lift)));
      quad(
        faces,
        wallPoint(room, side, p, 0),
        wallPoint(room, side, q, 0),
        wallPoint(room, side, q, H),
        wallPoint(room, side, p, H),
      );
    }
    lines.push(
      seg(wallPoint(room, side, wall.from, H), wallPoint(room, side, wall.from + wall.len, H)),
    );
    /* 入口：門框（兩邊的柱、上面的橫木、地上的門檻）與門上方的牆 */
    for (const [a, b] of open) {
      doors.push(seg(wallPoint(room, side, a, 0), wallPoint(room, side, a, dh)));
      doors.push(seg(wallPoint(room, side, b, 0), wallPoint(room, side, b, dh)));
      doors.push(seg(wallPoint(room, side, a, dh), wallPoint(room, side, b, dh)));
      doors.push(seg(wallPoint(room, side, a, lift), wallPoint(room, side, b, lift)));
      quad(
        faces,
        wallPoint(room, side, a, dh),
        wallPoint(room, side, b, dh),
        wallPoint(room, side, b, H),
        wallPoint(room, side, a, H),
      );
    }
  }
  /* 四個角的柱 */
  for (const [x, z] of [
    [room.x, room.y],
    [room.x + room.w, room.y],
    [room.x + room.w, room.y + room.h],
    [room.x, room.y + room.h],
  ])
    lines.push([x, 0, z, x, H, z]);
  return { lines, doors, faces, openings };
}

/** 文字標籤（Sprite；高度 world 單位） */
function labelSprite(text: string, color: string, border: string, height: number): Sprite {
  const fs = 44;
  const pad = 16;
  const font = `${LABEL_FONT} ${fs}px ${UI_FONT_STACK}`;
  const probe = makeCanvas(8, 8).getContext('2d') as CanvasRenderingContext2D;
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);
  const W = Math.min(2048, tw + pad * 2);
  const Hc = fs + pad * 2 - 4;
  const c = makeCanvas(W, Hc) as HTMLCanvasElement;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = WALK_COLORS.labelBg;
  roundRectPath(g, 2, 2, W - 4, Hc - 4, 12);
  g.fill();
  g.strokeStyle = border;
  g.lineWidth = 3;
  g.stroke();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, Hc / 2 + 2, W - pad * 2);
  const tex = new CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new Sprite(mat);
  s.scale.set((height * W) / Hc, height, 1);
  s.renderOrder = 10;
  return s;
}

/** 路線：地上的帶子（轉角是圓的）＋每隔一段的箭頭 */
function routeMesh(path: readonly Point[], width: number): Group {
  const g = new Group();
  const pts = cleanPath(path);
  if (pts.length < 2) return g;
  const y = 1.4;
  const band: number[] = [];
  const arrows: number[] = [];
  const r = width / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / len;
    const nz = (b.x - a.x) / len;
    quad(
      band,
      new Vector3(a.x + nx * r, y, a.y + nz * r),
      new Vector3(b.x + nx * r, y, b.y + nz * r),
      new Vector3(b.x - nx * r, y, b.y - nz * r),
      new Vector3(a.x - nx * r, y, a.y - nz * r),
    );
  }
  /* 每個點畫一個圓（轉角接起來） */
  for (const p of pts) {
    const n = 18;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2;
      const t1 = ((k + 1) / n) * Math.PI * 2;
      band.push(p.x, y, p.y);
      band.push(p.x + Math.cos(t1) * r, y, p.y + Math.sin(t1) * r);
      band.push(p.x + Math.cos(t0) * r, y, p.y + Math.sin(t0) * r);
    }
  }
  /* 箭頭：從起點算起每 6 倍帶寬一個（第一個在半個間隔處），指向前進的方向 */
  const gap = Math.max(width * 6, 24);
  let walked = 0;
  let next = gap / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uz = (b.y - a.y) / len;
    const L = width * 0.9;
    const Wd = width * 0.75;
    while (next <= walked + len) {
      const d = next - walked;
      const cx = a.x + ux * d;
      const cz = a.y + uz * d;
      arrows.push(cx + ux * L * 0.5, y + 0.4, cz + uz * L * 0.5);
      arrows.push(cx - ux * L * 0.5 - uz * Wd, y + 0.4, cz - uz * L * 0.5 + ux * Wd);
      arrows.push(cx - ux * L * 0.5 + uz * Wd, y + 0.4, cz - uz * L * 0.5 - ux * Wd);
      next += gap;
    }
    walked += len;
  }
  const common = { transparent: true, depthWrite: false, side: DoubleSide } as const;
  g.add(
    meshOf(band, new MeshBasicMaterial({ color: WALK_COLORS.route, opacity: 0.85, ...common })),
  );
  if (arrows.length)
    g.add(
      meshOf(arrows, new MeshBasicMaterial({ color: WALK_COLORS.arrow, opacity: 0.95, ...common })),
    );
  return g;
}

/** 現在位置／目的地的標記：地上的圈、細光柱、標籤；pulse 是會擴散的那個圈 */
function markerGroup(
  p: Point,
  color: string,
  text: string,
  w: WalkState,
  radius: number,
): { group: Group; pulse: Mesh; tall: Object3D[]; label: Sprite } {
  const g = new Group();
  g.position.set(p.x, 0, p.y);
  const common = { color, transparent: true, depthWrite: false, side: DoubleSide } as const;
  const ring = new Mesh(
    new RingGeometry(radius * 0.72, radius, 40),
    new MeshBasicMaterial({ ...common, opacity: 0.95 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2;
  g.add(ring);
  const pulse = new Mesh(
    new RingGeometry(radius * 0.92, radius, 40),
    new MeshBasicMaterial({ ...common, opacity: 0.6 }),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 2.2;
  g.add(pulse);
  const beamH = w.wall * 1.25;
  const beam = new Mesh(
    new CylinderGeometry(radius * 0.08, radius * 0.08, beamH, 10, 1, true),
    new MeshBasicMaterial({ ...common, opacity: 0.55 }),
  );
  beam.position.y = beamH / 2;
  g.add(beam);
  const label = labelSprite(text, color, color, w.wall * 0.34);
  label.position.y = beamH + w.wall * 0.22;
  g.add(label);
  return { group: g, pulse, tall: [beam, label], label };
}

/* ---------- 檢視 ---------- */

/** 預覽中的檢視（測試入口讀場景的內容用） */
export const walkRegistry: { preview: WalkView | null } = { preview: null };

export class WalkView {
  readonly view: OrbitView;
  private content: Group | null = null;
  private lineMats: { mat: LineMaterial; width: number }[] = [];
  private pulses: Mesh[] = [];
  /** 標記的光柱與標籤（沿路線時鏡頭站在旁邊就藏起來，不然整個畫面被光柱蓋住） */
  private markers: { at: Point; tall: Object3D[]; radius: number; label: Sprite; text: string }[] =
    [];
  /** 房名牌子（沿路線時離鏡頭近的淡掉，不擋住前面的東西） */
  private roomLabels: { sprite: Sprite; at: Point }[] = [];
  private floorTex: { src: ImageSource; tex: CanvasTexture } | null = null;
  private input: WalkSceneInput | null = null;
  private orbitSaved: { pos: Vector3; target: Vector3 } | null = null;
  private framedFor = '';
  mode: 'orbit' | 'walk' = 'orbit';
  time = 0;
  stats: WalkStats = { rooms: 0, halls: 0, openings: 0, labels: 0, route: false, floor: false };

  constructor(canvas: HTMLCanvasElement, size: Size) {
    this.view = createOrbitView(canvas, {
      width: size.width,
      height: size.height,
      fov: 45,
      near: 1,
      far: 40000,
      position: [0, 600, 600],
    });
    this.view.controls.maxPolarAngle = Math.PI * 0.49;
    this.setResolution(size.width, size.height);
  }

  /** 線寬跟著畫面高度（720 高＝基準） */
  private setResolution(w: number, h: number) {
    const k = h / 720;
    for (const { mat, width } of this.lineMats) {
      mat.resolution.set(w, h);
      mat.linewidth = width * k;
    }
  }

  setSize(w: number, h: number): void {
    this.view.setSize(w, h);
    this.setResolution(w, h);
  }

  private lineSet(segs: Seg[], color: string, glow: boolean): Group {
    const g = new Group();
    if (!segs.length) return g;
    const pos = segs.flat();
    const make = (width: number, opacity: number) => {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(pos);
      const mat = new LineMaterial({
        color: new Color(color),
        linewidth: width,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      this.lineMats.push({ mat, width });
      const l = new LineSegments2(geo, mat);
      l.renderOrder = 2;
      return l;
    };
    if (glow) g.add(make(GLOW_WIDTH, 0.16));
    g.add(make(CORE_WIDTH, 0.95));
    return g;
  }

  /** 地圖貼圖（同一張圖只做一次；長邊最多 2048） */
  private floorTexture(src: ImageSource): CanvasTexture {
    if (this.floorTex?.src === src) return this.floorTex.tex;
    this.floorTex?.tex.dispose();
    const k = Math.min(1, FLOOR_TEX_MAX / Math.max(src.width, src.height));
    const c = makeCanvas(
      Math.round(src.width * k),
      Math.round(src.height * k),
    ) as HTMLCanvasElement;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    const tex = this.view.prepareTexture(new CanvasTexture(c));
    tex.anisotropy = 8;
    this.floorTex = { src, tex };
    return tex;
  }

  /** 換上新的內容（整個場景重做；鏡頭留在原地，第一次或房間的範圍變了時才重新對準） */
  update(input: WalkSceneInput): void {
    this.input = input;
    const { walk: w, size } = input;
    this.dropContent();
    this.lineMats = [];
    this.pulses = [];
    this.markers = [];
    this.roomLabels = [];
    const root = new Group();
    this.view.scene.background = new Color(input.bg);

    /* 地上的地圖 */
    const showFloor = w.floor && !!input.image;
    if (showFloor && input.image) {
      const plane = new Mesh(
        new PlaneGeometry(size.width, size.height),
        new MeshBasicMaterial({
          map: this.floorTexture(input.image),
          color: new Color('#9aa8a2'),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(size.width / 2, 0, size.height / 2);
      plane.renderOrder = 0;
      root.add(plane);
    }

    /* 房間與走廊 */
    const roomLines: Seg[] = [];
    const hallLines: Seg[] = [];
    const doorLines: Seg[] = [];
    const roomFaces: number[] = [];
    const hallFaces: number[] = [];
    const floors: { room: number[]; hall: number[] } = { room: [], hall: [] };
    let openings = 0;
    for (const room of w.rooms) {
      const part = roomParts(room, w);
      openings += part.openings;
      (room.kind === 'hall' ? hallLines : roomLines).push(...part.lines);
      doorLines.push(...part.doors);
      (room.kind === 'hall' ? hallFaces : roomFaces).push(...part.faces);
      quad(
        floors[room.kind],
        new Vector3(room.x, 0.3, room.y),
        new Vector3(room.x + room.w, 0.3, room.y),
        new Vector3(room.x + room.w, 0.3, room.y + room.h),
        new Vector3(room.x, 0.3, room.y + room.h),
      );
    }
    const face = (color: string, opacity: number) =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      });
    if (roomFaces.length) root.add(meshOf(roomFaces, face(WALK_COLORS.roomFace, 0.1)));
    if (hallFaces.length) root.add(meshOf(hallFaces, face(WALK_COLORS.hallFace, 0.06)));
    const floorOpacity = showFloor ? 0.1 : 0.2;
    if (floors.room.length) root.add(meshOf(floors.room, face(WALK_COLORS.roomFace, floorOpacity)));
    if (floors.hall.length)
      root.add(meshOf(floors.hall, face(WALK_COLORS.hallFace, floorOpacity * 0.7)));
    root.add(this.lineSet(roomLines, WALK_COLORS.room, true));
    root.add(this.lineSet(hallLines, WALK_COLORS.hall, true));
    root.add(this.lineSet(doorLines, WALK_COLORS.door, true));

    /* 房名 */
    let labels = 0;
    if (w.names)
      for (const room of w.rooms) {
        const name = room.name.trim();
        if (!name) continue;
        const s = labelSprite(
          name,
          WALK_COLORS.label,
          room.kind === 'hall' ? WALK_COLORS.hall : WALK_COLORS.room,
          w.wall * 0.36,
        );
        s.position.set(room.x + room.w / 2, w.wall * 0.92, room.y + room.h / 2);
        s.name = 'room-label';
        root.add(s);
        this.roomLabels.push({ sprite: s, at: { x: room.x + room.w / 2, y: room.y + room.h / 2 } });
        labels++;
      }

    /* 路線與標記 */
    const pts = cleanPath(w.path);
    const route = pts.length >= 2;
    const rw = Math.max(4, Math.min(24, w.door * 0.22));
    const radius = Math.max(10, w.door * 0.42);
    const marks: [Point, string, string][] = [];
    if (pts.length) marks.push([pts[0], WALK_COLORS.start, input.text.start]);
    if (route) {
      root.add(routeMesh(pts, rw));
      marks.push([pts[pts.length - 1], WALK_COLORS.goal, input.text.goal]);
    }
    for (const [p, color, text] of marks) {
      const m = markerGroup(p, color, text, w, radius);
      root.add(m.group);
      this.pulses.push(m.pulse);
      this.markers.push({ at: p, tall: m.tall, radius, label: m.label, text });
    }

    this.content = root;
    this.view.scene.add(root);
    this.stats = {
      rooms: w.rooms.filter((r) => r.kind === 'room').length,
      halls: w.rooms.filter((r) => r.kind === 'hall').length,
      openings,
      labels,
      route,
      floor: showFloor,
    };
    this.setResolution(this.view.size.width, this.view.size.height);
    /* 第一次、或房間的外接範圍變了：俯瞰重新對準（改牆高、入口寬、房名不動鏡頭） */
    const b = walkBounds(w.rooms, size);
    const key = `${b.x},${b.y},${b.w},${b.h}`;
    if (key !== this.framedFor) {
      this.framedFor = key;
      this.orbitSaved = null;
      if (this.mode === 'orbit') this.resetOrbit();
    }
    this.applyTime();
    this.view.invalidate();
  }

  /** 拿掉目前的場景（地圖貼圖留著重用，不跟著釋放） */
  private dropContent() {
    if (!this.content) return;
    this.view.scene.remove(this.content);
    this.content.traverse((o) => {
      const m = (o as Mesh).material as MeshBasicMaterial | undefined;
      if (m && this.floorTex && m.map === this.floorTex.tex) m.map = null;
    });
    disposeObject(this.content);
    this.content = null;
  }

  /** 俯瞰：從南邊斜上方看整個範圍 */
  resetOrbit(): void {
    if (!this.input) return;
    const { walk: w, size } = this.input;
    const b = walkBounds(w.rooms, size);
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const cam = this.view.camera;
    /* 範圍的寬（換算成高）與深度取大的；斜著看時近的那邊比較大，留多一點 */
    const fov = (cam.fov * Math.PI) / 180;
    const half = Math.max(60, b.w / Math.max(0.2, cam.aspect), b.h) / 2;
    const dist = (half / Math.tan(fov / 2)) * 1.5;
    const el = (55 * Math.PI) / 180;
    const c = this.view.controls;
    const damp = c.enableDamping;
    c.enableDamping = false;
    c.update();
    cam.position.set(cx, Math.sin(el) * dist, cz + Math.cos(el) * dist);
    c.target.set(cx, 0, cz);
    c.update();
    c.enableDamping = damp;
    this.view.invalidate();
  }

  /** 俯瞰／沿路線 */
  setMode(mode: 'orbit' | 'walk'): void {
    if (mode === this.mode) return;
    const cam = this.view.camera;
    const c = this.view.controls;
    if (mode === 'walk') {
      this.orbitSaved = { pos: cam.position.clone(), target: c.target.clone() };
      c.enabled = false;
      cam.fov = 70;
    } else {
      c.enabled = true;
      cam.fov = 45;
    }
    cam.updateProjectionMatrix();
    this.mode = mode;
    if (mode === 'orbit') {
      if (this.orbitSaved) {
        const damp = c.enableDamping;
        c.enableDamping = false;
        c.update();
        cam.position.copy(this.orbitSaved.pos);
        c.target.copy(this.orbitSaved.target);
        c.update();
        c.enableDamping = damp;
      } else this.resetOrbit();
    }
    this.applyTime();
    this.view.invalidate();
  }

  /** 第 t 秒：沿路線時把鏡頭放到路線上；標記的圈跟著時間擴散 */
  setTime(t: number): void {
    this.time = t;
    this.applyTime();
    this.view.invalidate();
  }

  private applyTime() {
    const t = this.time;
    const u = (((t % 1.6) + 1.6) % 1.6) / 1.6;
    for (const p of this.pulses) {
      const k = 1 + u * 1.4;
      p.scale.set(k, k, 1);
      (p.material as MeshBasicMaterial).opacity = 0.6 * (1 - u);
    }
    const cam = this.mode === 'walk' && this.input ? walkCamera(this.input.walk, t) : null;
    for (const m of this.markers) {
      const near = !!cam && Math.hypot(cam.pos.x - m.at.x, cam.pos.y - m.at.y) < m.radius * 2;
      for (const o of m.tall) o.visible = !near;
    }
    /* 房名牌子：沿路線時離鏡頭 1.2 倍牆高以內看不見、3 倍以外完全看得見，中間漸變 */
    const wall = this.input?.walk.wall ?? 48;
    for (const l of this.roomLabels) {
      const d = cam ? Math.hypot(cam.pos.x - l.at.x, cam.pos.y - l.at.y) / wall : 99;
      const a = Math.min(1, Math.max(0, (d - 1.2) / 1.8));
      (l.sprite.material as SpriteMaterial).opacity = a;
      l.sprite.visible = a > 0.01;
    }
    if (!cam) return;
    const camera = this.view.camera;
    const c = this.view.controls;
    camera.position.set(cam.pos.x, cam.eye, cam.pos.y);
    c.target.set(cam.look.x, cam.lookHeight, cam.look.y);
    camera.lookAt(c.target);
    camera.updateMatrixWorld();
  }

  /** 匯出：以 w × h 畫第 t 秒（沿路線），貼到 ctx 的整個畫布 */
  drawTo(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
  ): void {
    this.setMode('walk');
    this.setTime(t);
    this.setResolution(w, h);
    this.view.capture(ctx, w, h);
  }

  /** 標籤在畫面上的位置（NDC，-1～1）與看不看得到（測試用：結尾要看得到「目的地」、房名牌子不擋住它） */
  labelInfo() {
    this.view.camera.updateMatrixWorld();
    const ndc = (o: Object3D) => {
      const v = o.getWorldPosition(new Vector3()).project(this.view.camera);
      return [v.x, v.y, v.z];
    };
    return {
      markers: this.markers.map((m) => ({
        text: m.text,
        visible: m.label.visible,
        ndc: ndc(m.label),
      })),
      rooms: this.roomLabels.map((l) => ({
        opacity: (l.sprite.material as SpriteMaterial).opacity,
        visible: l.sprite.visible,
        ndc: ndc(l.sprite),
      })),
    };
  }

  /** 目前的鏡頭（測試用） */
  cameraState() {
    const p = this.view.camera.position;
    const q = this.view.controls.target;
    return {
      mode: this.mode,
      pos: [p.x, p.y, p.z],
      target: [q.x, q.y, q.z],
      fov: this.view.camera.fov,
    };
  }

  /**
   * 釋放。loseContext：連 WebGL 環境一起放掉（匯出、測試用的看不到的檢視；瀏覽器同時能開的 WebGL 環境有限）。
   * 預覽的畫布不放掉（開發模式的 StrictMode 會在同一張畫布上再開一次）。
   */
  dispose(loseContext = false): void {
    this.dropContent();
    this.floorTex?.tex.dispose();
    this.view.dispose();
    if (loseContext) this.view.renderer.forceContextLoss();
  }
}

/* ---------- WebGL 環境 ---------- */

let webglCache: boolean | null = null;
/** 這個瀏覽器能不能開 WebGL（試開一次就放掉；結果快取） */
export function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    webglCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const pendingLoss = new WeakMap<HTMLCanvasElement, number>();

/**
 * 預覽的檢視：建立前先「認領」畫布（StrictMode 卸載後馬上在同一張畫布重新掛載時，取消上一次排定的放掉）。
 */
export function createPreviewView(canvas: HTMLCanvasElement, size: Size): WalkView {
  const t = pendingLoss.get(canvas);
  if (t !== undefined) {
    window.clearTimeout(t);
    pendingLoss.delete(canvas);
  }
  return new WalkView(canvas, size);
}

/**
 * 放掉預覽的檢視；這張畫布之後沒有馬上再用（例如離開「進階 3D」分頁）就連 WebGL 環境一起放掉，
 * 來回切分頁時環境不會越積越多。開發模式的 StrictMode 會立刻在同一張畫布重新掛載：那時不放（createPreviewView 取消）。
 */
export function releasePreviewView(v: WalkView): void {
  const canvas = v.view.canvas;
  const gl = v.view.renderer.getContext();
  v.dispose();
  pendingLoss.set(
    canvas,
    window.setTimeout(() => {
      pendingLoss.delete(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }, 0),
  );
}

/* ---------- 匯出 ---------- */

export const walkText = (): WalkSceneInput['text'] => ({ start: S.walk.start, goal: S.walk.goal });

/** 匯出用的一個看不到的檢視（同樣的場景、沿路線）；用完 dispose */
export async function offscreenWalkView(
  s: MapState,
  image: ImageSource,
  size: Size,
): Promise<WalkView> {
  await ensureWalkFonts(s.walk.rooms.map((r) => r.name).join(''), walkText());
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const v = new WalkView(canvas, size);
  v.update({
    walk: s.walk,
    image,
    size: { width: image.width, height: image.height },
    bg: s.bg.color,
    text: walkText(),
  });
  v.setMode('walk');
  return v;
}

/** 3D 移動影片（MP4、30 fps；mode：detectVideoMode(walkVideoSize(畫面), 30, false)） */
export async function exportWalkVideo(
  s: MapState,
  image: ImageSource,
  mode: VideoMode,
  ctx: FxExportContext,
): Promise<FxExportOutput> {
  if (!canWalk(s.walk.path)) throw new Error(S.walk.needPath);
  if (!webglAvailable()) throw new Error(S.walk.webglFailed);
  const size = walkVideoSize(computeLayout(s, { width: image.width, height: image.height }).canvas);
  let v: WalkView;
  try {
    v = await offscreenWalkView(s, image, size);
  } catch {
    throw new Error(S.walk.webglFailed);
  }
  try {
    return await encodeFxVideo(
      mode,
      {
        size,
        fps: WALK_FPS,
        total: walkTotal(s.walk),
        matte: s.bg.color,
        draw: (g, t) => v.drawTo(g, size.width, size.height, t),
        fileName: (ext) => walkFileName(ext, new Date()),
      },
      S,
      ctx,
    );
  } catch (e) {
    /* 取消照舊；其他錯誤一律換成繁中的說明（不顯示英文的錯誤訊息） */
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof Error && /[\u3400-\u9fff]/.test(e.message)) throw e;
    console.warn('3D 移動影片：', e);
    throw new Error(S.walk.exportFailed);
  } finally {
    v.dispose(true);
  }
}
