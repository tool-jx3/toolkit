/**
 * 把設定與圖片組成 three.js 的場景（規格第 3 節）：壓克力本體（外框擠出成厚板，半透明）、印在表面的圖片（平面）、
 * 底座、搖搖樂的外框與前蓋、立體透視的圖層與底座。搖搖樂另外建好物理（physics.ts）。
 */
import {
  CanvasTexture,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';
import { createRandom } from '@/core/timeline';
import type { Bounds, ContourShape, Pt } from './contour';
import { contourOf, type ImageInfo, peekImage, useImages } from './media';
import type { Finish, Kind, Settings } from './model';
import { createShakerPhysics, type ShakerPhysics } from './physics';
import {
  baseImageSize,
  dioramaBase,
  frameExtent,
  layerZ,
  partBody,
  shakerBoundary,
  shakerDims,
  shakerWalls,
  spawnPoint,
  squarePoints,
} from './plan';

/** 建不出來的原因（對應 strings 的錯誤訊息） */
export type BuildError =
  | 'needFront'
  | 'needFrame'
  | 'needPart'
  | 'needLayer'
  | 'outline'
  | 'outlineBack'
  | 'outlineFrame'
  | 'loading'
  | 'missing';

export interface DioramaNode {
  id: string;
  group: Group;
  /** 不含偏移的位置 */
  base: { x: number; y: number; z: number };
}

export interface Build {
  kind: Kind;
  /** 旋轉的軸心（自動旋轉、匯出的轉動都套在這裡） */
  root: Group;
  /** 正反面各自算時的兩組（依鏡頭在哪一邊顯示其中一組） */
  sides: { front: Group; back: Group } | null;
  /** 搖搖樂 */
  shaker: { physics: ShakerPhysics; nodes: Group[] } | null;
  /** 立體透視的圖層（偏移、旋轉即時套用） */
  layers: DioramaNode[];
  /** 測試與檢查用的摘要 */
  info: BuildInfo;
}

export interface BuildInfo {
  kind: Kind;
  meshes: number;
  /** 搖搖樂的零件數、立體透視的圖層數 */
  parts: number;
  layers: number;
  walls: number;
  /** 外框點數（第一塊） */
  outlinePoints: number;
  /** 主體的外框範圍（原圖 px） */
  bounds: Bounds | null;
  base: { width: number; depth: number } | null;
}

export type BuildResult = { ok: true; build: Build } | { ok: false; error: BuildError };

/* ---------- 材質 ---------- */

interface Materials {
  acrylic: Material;
  image(info: ImageInfo): Material;
}

function createMaterials(finish: Finish, prepare: (t: CanvasTexture) => CanvasTexture): Materials {
  /*
   * 壓克力：白色、35% 不透明、強烈的鏡面反光、不寫深度（後面的東西透得過來）。
   * 雙面一次畫完（forceSinglePass）：three.js r150 起半透明的雙面材質預設分兩次畫（先背面再正面），
   * 透過頂面看到的底座後側會比舊版（r128，一次畫）亮；照舊版一次畫。
   */
  const acrylic = new MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    shininess: 120,
    specular: 0xffffff,
    side: DoubleSide,
    depthWrite: false,
    forceSinglePass: true,
  });
  acrylic.name = '壓克力';
  const cache = new Map<string, Material>();
  return {
    acrylic,
    image(info) {
      let m = cache.get(info.id);
      if (!m) {
        const map = prepare(new CanvasTexture(info.canvas));
        /* 亮面：受光照、有鏡面反光；霧面：不受光照（原色） */
        m =
          finish === 'glossy'
            ? new MeshPhongMaterial({
                map,
                transparent: true,
                side: DoubleSide,
                alphaTest: 0.5,
                shininess: 100,
                specular: 0xffffff,
              })
            : new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, alphaTest: 0.5 });
        m.name = info.id.startsWith('demo:') ? info.id : `image-${info.id.slice(0, 8)}`;
        cache.set(info.id, m);
      }
      return m;
    },
  };
}

/* ---------- 形狀 ---------- */

const toShape = (pts: readonly Pt[]) => new Shape(pts.map((p) => new Vector2(p.x, p.y)));

function circleShape(r: number): Shape {
  const s = new Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

/** 擠出成厚板（z 從 −depth/2 到 depth/2） */
function slab(shapes: Shape[], depth: number, mat: Material, bevel = false): Mesh {
  const geo = new ExtrudeGeometry(
    shapes,
    bevel
      ? { depth, bevelEnabled: true, bevelThickness: 2, bevelSize: 2 }
      : { depth, bevelEnabled: false },
  );
  const mesh = new Mesh(geo, mat);
  mesh.position.z = -depth / 2;
  mesh.renderOrder = 0;
  return mesh;
}

/** 印在表面的圖（原尺寸的平面，在厚板前方 0.1） */
function print(info: ImageInfo, mats: Materials, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(info.width, info.height), mats.image(info));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 1;
  return mesh;
}

/** 一塊壓克力：厚板＋正面的圖 */
function piece(c: ContourShape, info: ImageInfo, depth: number, mats: Materials): Group {
  const g = new Group();
  g.add(slab(c.outlines.map(toShape), depth, mats.acrylic));
  g.add(print(info, mats, c.planeOffset.x, c.planeOffset.y, depth / 2 + 0.1));
  return g;
}

function largestOutline(c: ContourShape): Pt[] {
  let best = c.outlines[0];
  let bestArea = -1;
  for (const poly of c.outlines) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      a += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y);
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = poly;
    }
  }
  return best;
}

/* ---------- 三種周邊 ---------- */

type Resolve = (id: string | null) => ImageInfo | null | 'loading' | 'missing';

function countMeshes(root: Group): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as Mesh).isMesh) n++;
  });
  return n;
}

const emptyInfo = (kind: Kind): BuildInfo => ({
  kind,
  meshes: 0,
  parts: 0,
  layers: 0,
  walls: 0,
  outlinePoints: 0,
  bounds: null,
  base: null,
});

function buildStand(s: Settings, img: Resolve, mats: Materials): BuildResult {
  const st = s.stand;
  const t = s.material.thickness;
  const m = s.material.margin;
  const frontInfo = img(st.front);
  if (!st.front) return { ok: false, error: 'needFront' };
  if (frontInfo === 'loading') return { ok: false, error: 'loading' };
  if (frontInfo === 'missing' || !frontInfo) return { ok: false, error: 'missing' };
  const front = contourOf(frontInfo, m);
  if (!front) return { ok: false, error: 'outline' };
  const backRes = img(st.back);
  if (backRes === 'loading') return { ok: false, error: 'loading' };
  const backInfo = backRes && backRes !== 'missing' ? backRes : null;
  const back = backInfo ? contourOf(backInfo, m) : front;
  if (!back) return { ok: false, error: 'outlineBack' };

  const root = new Group();
  const main = new Group();
  let sides: Build['sides'] = null;
  if (st.outline === 'unified' || !backInfo) {
    main.add(slab(front.outlines.map(toShape), t, mats.acrylic));
    main.add(print(frontInfo, mats, front.planeOffset.x, front.planeOffset.y, t / 2 + 0.1));
    const rear = backInfo
      ? print(backInfo, mats, -back.planeOffset.x, back.planeOffset.y, -t / 2 - 0.1)
      : print(frontInfo, mats, front.planeOffset.x, front.planeOffset.y, -t / 2 - 0.1);
    /* 沒有背面圖時，從背面看到的是正面圖透過壓克力的樣子（左右相反） */
    if (!backInfo) rear.scale.x = -1;
    rear.rotation.y = Math.PI;
    main.add(rear);
  } else {
    const f = piece(front, frontInfo, t, mats);
    const b = piece(back, backInfo, t, mats);
    b.rotation.y = Math.PI;
    main.add(f, b);
    sides = { front: f, back: b };
  }
  root.add(main);

  let base: BuildInfo['base'] = null;
  if (st.base) {
    main.position.y = -front.bounds.minY;
    const baseGroup = new Group();
    const baseRes = img(st.baseImage);
    if (baseRes === 'loading') return { ok: false, error: 'loading' };
    const baseInfo = baseRes && baseRes !== 'missing' ? baseRes : null;
    const baseContour = st.baseShape === 'contour' && baseInfo ? contourOf(baseInfo, m) : null;
    const r = st.baseSize;
    const shapes = baseContour
      ? baseContour.outlines.map(toShape)
      : st.baseShape === 'circle'
        ? [circleShape(r)]
        : [toShape(squarePoints(r))];
    baseGroup.add(slab(shapes, t, mats.acrylic));
    if (baseInfo) {
      const shape =
        st.baseShape === 'contour' ? (baseContour ? 'contour' : 'square') : st.baseShape;
      const size = baseImageSize(baseInfo.width, baseInfo.height, shape, r);
      const plane = new Mesh(new PlaneGeometry(size.width, size.height), mats.image(baseInfo));
      plane.position.set(
        baseContour ? baseContour.planeOffset.x : 0,
        baseContour ? baseContour.planeOffset.y : 0,
        t / 2 + 0.1,
      );
      plane.renderOrder = 1;
      baseGroup.add(plane);
    }
    /* 底座平放：上表面在 y = 0（立牌的底邊） */
    baseGroup.rotation.x = -Math.PI / 2;
    baseGroup.position.y = -t / 2;
    root.add(baseGroup);
    base = baseContour
      ? {
          width: baseContour.bounds.maxX - baseContour.bounds.minX,
          depth: baseContour.bounds.maxY - baseContour.bounds.minY,
        }
      : { width: r * 2, depth: r * 2 };
  }
  return {
    ok: true,
    build: {
      kind: 'stand',
      root,
      sides,
      shaker: null,
      layers: [],
      info: {
        ...emptyInfo('stand'),
        meshes: countMeshes(root),
        outlinePoints: front.outlines[0].length,
        bounds: front.bounds,
        base,
      },
    },
  };
}

function buildShaker(s: Settings, img: Resolve, mats: Materials, seed: number): BuildResult {
  const sh = s.shaker;
  const t = s.material.thickness;
  const m = s.material.margin;
  const dims = shakerDims(t);
  let frameContour: ContourShape | null = null;
  let frameInfo: ImageInfo | null = null;
  if (sh.frame === 'image') {
    const r = img(sh.frameImage);
    if (!sh.frameImage) return { ok: false, error: 'needFrame' };
    if (r === 'loading') return { ok: false, error: 'loading' };
    if (r === 'missing' || !r) return { ok: false, error: 'missing' };
    frameInfo = r;
    frameContour = contourOf(r, m);
    if (!frameContour) return { ok: false, error: 'outlineFrame' };
  }
  const valid: { info: ImageInfo; qty: number; scale: number }[] = [];
  for (const p of sh.parts) {
    const r = img(p.image);
    if (r === 'loading') return { ok: false, error: 'loading' };
    if (r && r !== 'missing') valid.push({ info: r, qty: p.qty, scale: p.scale });
  }
  if (!valid.length) return { ok: false, error: 'needPart' };

  const root = new Group();
  const radius = sh.frameSize / 2;
  const frameShapes = frameContour
    ? frameContour.outlines.map(toShape)
    : sh.frame === 'circle'
      ? [circleShape(radius)]
      : [toShape(squarePoints(radius))];
  /* 外框（厚 1.5 倍）、背景圖、前蓋（厚 2 的透明板） */
  root.add(slab(frameShapes, dims.frameDepth, mats.acrylic));
  if (frameContour && frameInfo)
    root.add(
      print(
        frameInfo,
        mats,
        frameContour.planeOffset.x,
        frameContour.planeOffset.y,
        dims.frameDepth / 2 + 0.1,
      ),
    );
  const coverGeo = new ExtrudeGeometry(frameShapes, { depth: 2, bevelEnabled: false });
  const cover = new Mesh(coverGeo, mats.acrylic);
  cover.position.z = dims.coverZ;
  root.add(cover);

  const boundary = shakerBoundary(
    sh.frame,
    sh.frameSize,
    sh.padding,
    frameContour ? largestOutline(frameContour) : null,
  );
  const walls = shakerWalls(boundary, dims);
  const extent = frameExtent(sh.frame, sh.frameSize, frameContour?.bounds ?? null);
  const rand = createRandom(seed);
  const bodies: { x: number; y: number; radius: number; mass: number }[] = [];
  const nodes: Group[] = [];
  for (const part of valid) {
    const c = contourOf(part.info, m / 2);
    if (!c) continue;
    const k = part.scale / 100;
    const body = partBody(c.bounds, part.scale);
    const proto = piece(c, part.info, dims.partDepth, mats);
    for (let i = 0; i < part.qty; i++) {
      const g = i === 0 ? proto : proto.clone();
      g.scale.set(k, k, 1);
      const at = spawnPoint(extent, rand.next);
      g.position.set(at.x, at.y, dims.partZ);
      root.add(g);
      nodes.push(g);
      bodies.push({ x: at.x, y: at.y, radius: body.radius, mass: body.mass });
    }
  }
  if (!nodes.length) return { ok: false, error: 'needPart' };
  const physics = createShakerPhysics(walls, bodies, dims);
  return {
    ok: true,
    build: {
      kind: 'shaker',
      root,
      sides: null,
      shaker: { physics, nodes },
      layers: [],
      info: {
        ...emptyInfo('shaker'),
        meshes: countMeshes(root),
        parts: nodes.length,
        walls: walls.length,
        outlinePoints: boundary.length,
        bounds: frameContour?.bounds ?? {
          minX: -radius,
          maxX: radius,
          minY: -radius,
          maxY: radius,
        },
      },
    },
  };
}

function buildDiorama(s: Settings, img: Resolve, mats: Materials): BuildResult {
  const di = s.diorama;
  const t = s.material.thickness;
  const m = s.material.margin;
  const valid: { id: string; info: ImageInfo; x: number; y: number; rotation: number }[] = [];
  for (const l of di.layers) {
    const r = img(l.image);
    if (r === 'loading') return { ok: false, error: 'loading' };
    if (r && r !== 'missing')
      valid.push({ id: l.id, info: r, x: l.x, y: l.y, rotation: l.rotation });
  }
  if (!valid.length) return { ok: false, error: 'needLayer' };
  const root = new Group();
  const nodes: DioramaNode[] = [];
  const bounds: Bounds[] = [];
  valid.forEach((l, idx) => {
    const c = contourOf(l.info, m);
    if (!c) return;
    bounds.push(c.bounds);
    const g = piece(c, l.info, t, mats);
    const base = { x: 0, y: -c.bounds.minY, z: layerZ(idx, valid.length, di.gap) };
    g.position.set(base.x + l.x, base.y + l.y, base.z);
    g.rotation.y = (l.rotation * Math.PI) / 180;
    root.add(g);
    nodes.push({ id: l.id, group: g, base });
  });
  if (!nodes.length) return { ok: false, error: 'outline' };
  /* 底座：深度以有圖的張數計（抓不到外框的也算一層） */
  const size = dioramaBase(bounds, di.gap, t, di.baseMargin);
  size.depth = (valid.length - 1) * di.gap + t + di.baseMargin * 2;
  const rect = toShape([
    { x: -size.width / 2, y: -size.depth / 2 },
    { x: size.width / 2, y: -size.depth / 2 },
    { x: size.width / 2, y: size.depth / 2 },
    { x: -size.width / 2, y: size.depth / 2 },
  ]);
  const baseMesh = slab([rect], t, mats.acrylic, true);
  baseMesh.rotation.x = -Math.PI / 2;
  baseMesh.position.set(0, -t - 0.1, 0);
  root.add(baseMesh);
  return {
    ok: true,
    build: {
      kind: 'diorama',
      root,
      sides: null,
      shaker: null,
      layers: nodes,
      info: {
        ...emptyInfo('diorama'),
        meshes: countMeshes(root),
        layers: nodes.length,
        outlinePoints: 0,
        bounds: null,
        base: size,
      },
    },
  };
}

/** 依目前的設定組出場景；圖片還沒讀好或缺圖時回傳原因 */
export function buildScene(
  kind: Kind,
  s: Settings,
  prepare: (t: CanvasTexture) => CanvasTexture,
  seed: number,
): BuildResult {
  const img: Resolve = (id) => {
    if (!id) return null;
    const info = peekImage(id);
    if (info) return info;
    /* 還沒開始讀或讀取中都算「讀取中」；讀不到才是缺圖 */
    return useImages.getState().images[id] === 'error' ? 'missing' : 'loading';
  };
  const mats = createMaterials(s.material.finish, prepare);
  if (kind === 'stand') return buildStand(s, img, mats);
  if (kind === 'shaker') return buildShaker(s, img, mats, seed);
  return buildDiorama(s, img, mats);
}

/** 立體透視的偏移與旋轉（不必重建） */
export function applyLayerOffsets(build: Build, s: Settings): void {
  for (const node of build.layers) {
    const l = s.diorama.layers.find((x) => x.id === node.id);
    if (!l) continue;
    node.group.position.set(node.base.x + l.x, node.base.y + l.y, node.base.z);
    node.group.rotation.y = (l.rotation * Math.PI) / 180;
  }
}
