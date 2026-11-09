/**
 * 室內平面圖產生器 2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」第一批（規格 1.29、3.18、F303～F312）：
 * 立體樓層圖的投影與樓層的位置、樓層總覽的版面、上下樓層的連接、上層樓的快速建立（外框與樓梯、整層複製）、
 * 祕密樓層（PL 檢視、PL 用的圖與連結）、匯出的範圍與檔名、專案檔與分享連結的新欄位（版本 10）。
 */
import { describe, expect, it } from 'vitest';
import { createProjectFile, parseProject } from '@/core/storage';
import { renderImage } from '@/tools/floor-plan/draw/export';
import { renderStackImage, stackFrameKey, stackImageLayout } from '@/tools/floor-plan/draw/stack';
import { DATA_VERSION } from '@/tools/floor-plan/editor/store';
import { isAsset } from '@/tools/floor-plan/model/assets';
import {
  type ExportSettings,
  exportFileName,
  exportFloors,
  exportHasSecret,
  exportJobs,
  exportOptions,
  stackExportOptions,
  unveiledProject,
} from '@/tools/floor-plan/model/exportPlan';
import {
  donorFloorIndex,
  floorFullCopy,
  floorShell,
  GROUND_CATS,
  isBlankFloor,
  pasteFloorContent,
} from '@/tools/floor-plan/model/floorCopy';
import { emptyFloor, revealFloor, visibleFloor } from '@/tools/floor-plan/model/geometry';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { encodeMapHash, playerProject, readMapHash } from '@/tools/floor-plan/model/share';
import {
  boardLayout,
  clampCamera,
  inLevelContent,
  isDefaultCamera,
  levelAt,
  levelMatrix,
  linkKind,
  pitchDegrees,
  pitchFromDegrees,
  plateAt,
  plateRect,
  STACK_DEFAULT,
  stackCamera,
  stackContent,
  stackFocus,
  stackLayout,
  stackLevels,
  stackProject,
  stackUnproject,
  stairTravel,
  verticalLinks,
  wrapAngle,
} from '@/tools/floor-plan/model/stack';
import type { Floor, Item, Project, Room } from '@/tools/floor-plan/model/types';
import { instantiateTemplate } from '@/tools/floor-plan/templates';
import { installRecordingDocument, type RecordingCanvas } from '../helpers/recordingCanvas';

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}) =>
  ({ id, x, y, w, h, name: id, cat: 'living', ...extra }) as Room;
const item = (id: string, t: string, x: number, y: number, w: number, h: number, rot = 0) =>
  ({ id, t, x, y, w, h, rot }) as Item;

function floorOf(name: string, patch: Partial<Floor> = {}): Floor {
  return { ...emptyFloor(name), id: name, ...patch };
}

function projectOf(floors: Floor[], patch: Partial<Project> = {}): Project {
  return {
    name: '測試',
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: 0,
    ...patch,
  };
}

/** 三層樓：每層一間 20 × 12 的房間、同一個位置的樓梯（2 × 5） */
function threeFloors(): Floor[] {
  return ['B1', '1F', '2F'].map((n) =>
    floorOf(n, {
      rooms: [room(`${n}-a`, 0, 0, 20, 12)],
      items: [item(`${n}-s`, 'stairs', 16, 2, 2, 5)],
    }),
  );
}

const EXP: ExportSettings = {
  range: 'current',
  view: 'pl',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
  mode: 'image',
  vttPx: 100,
  noise: true,
};

describe('立體樓層圖的投影（F303、F304、3.18.1）', () => {
  const floors = threeFloors();
  const L = stackLayout(floors, { ...STACK_DEFAULT });

  it('共同範圍、中心、間距與整張圖的範圍照原作的數值（m 換成格）', () => {
    expect(L.content).toEqual({ x: 0, y: 0, w: 20, h: 12 });
    expect([L.cx, L.cy]).toEqual([10, 6]);
    const rad = (-28 * Math.PI) / 180;
    const spanY = (Math.abs(20 * Math.sin(rad)) + Math.abs(12 * Math.cos(rad))) * 0.56;
    const spanX = Math.abs(20 * Math.cos(rad)) + Math.abs(12 * Math.sin(rad));
    expect(L.spanY).toBeCloseTo(spanY, 9);
    expect(L.spanX).toBeCloseTo(spanX, 9);
    /* max(4.5 m, 深 × 0.72 ＋ 1.6 m) → max(9, 深 × 0.72 ＋ 3.2) 格 */
    expect(L.gap).toBeCloseTo(Math.max(9, spanY * 0.72 + 3.2), 9);
    /* 有樓梯：上方留 15.42 格、下方 7.88 格；左邊 14.4 格（樓層牌）、右邊 5.2 格 */
    expect(L.bounds.y).toBeCloseTo(-2 * L.gap - spanY / 2 - 15.42, 9);
    expect(L.bounds.y + L.bounds.h).toBeCloseTo(spanY / 2 + 7.88, 9);
    expect(L.bounds.x).toBeCloseTo(-spanX / 2 - 14.4, 9);
    expect(L.bounds.x + L.bounds.w).toBeCloseTo(spanX / 2 + 5.2, 9);
    /* 間距的倍率 */
    expect(stackLayout(floors, { ...STACK_DEFAULT, gap: 1.5 }).gap).toBeCloseTo(L.gap * 1.5, 9);
  });

  it('只有一層時也留第二層的空間；沒有樓梯時上下的留白小一點；沒有東西時是 40 × 28 格', () => {
    const one = stackLayout([floorOf('1F', { rooms: [room('a', 0, 0, 20, 12)] })], {
      ...STACK_DEFAULT,
    });
    expect(one.bounds.y).toBeCloseTo(-one.gap - one.spanY / 2 - 8.4, 9);
    expect(one.bounds.y + one.bounds.h).toBeCloseTo(one.spanY / 2 + 5.2, 9);
    expect(stackContent([emptyFloor('1F')])).toEqual({ x: 0, y: 0, w: 40, h: 28 });
  });

  it('投影：中心在 (0, −層 × 間距 − 高)；角度 0 時就是壓扁；反投影、樓板的變換一致', () => {
    expect(stackProject(L, 10, 6, 2, 1.5)).toMatchObject({ x: 0, y: -2 * L.gap - 1.5 });
    const flat = stackLayout(floors, { ...STACK_DEFAULT, angle: 0 });
    const p = stackProject(flat, 14, 9, 1);
    expect(p.x).toBeCloseTo(4, 9);
    expect(p.y).toBeCloseTo(3 * 0.56 - flat.gap, 9);
    for (const [x, y, level, z] of [
      [0, 0, 0, 0],
      [20, 12, 2, 0],
      [3.5, 7.25, 1, 2.5],
    ]) {
      const q = stackProject(L, x, y, level, z);
      const back = stackUnproject(L, q.x, q.y, level, z);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
      const [a, b, c, d, e, f] = levelMatrix(L, level, z);
      expect(a * x + c * y + e).toBeCloseTo(q.x, 9);
      expect(b * x + d * y + f).toBeCloseTo(q.y, 9);
    }
  });

  it('視角：−180～180 繞回來、範圍外夾回來、和預設相同的判斷、俯角', () => {
    expect([wrapAngle(185), wrapAngle(-28 - 45), wrapAngle(180), wrapAngle(-180)]).toEqual([
      -175, -73, -180, -180,
    ]);
    expect(clampCamera({ angle: 999, pitch: 2, gap: 0.1, rise: 9 })).toEqual({
      angle: 180,
      pitch: 0.82,
      gap: 0.65,
      rise: 2.2,
    });
    expect(clampCamera({})).toEqual(STACK_DEFAULT);
    expect(isDefaultCamera(clampCamera({ angle: -28 }))).toBe(true);
    expect(stackCamera({})).toEqual(STACK_DEFAULT);
    expect(pitchDegrees(0.56)).toBe(34);
    expect(pitchFromDegrees(30)).toBe(0.5);
  });

  it('外觀層（打開「顯示內部」）不放進立體圖', () => {
    const fs = threeFloors();
    fs[1] = { ...fs[1], showInside: true };
    expect(stackLevels(fs).map((l) => l.index)).toEqual([0, 2]);
  });

  it('點選：樓層牌、樓板（上面的樓層先）、空的範圍', () => {
    const r = plateRect(L, 1);
    expect(plateAt(L, 3, r.x + 1, r.y + 1)).toBe(1);
    expect(plateAt(L, 3, r.x - 1, r.y + 1)).toBe(-1);
    const p = stackProject(L, 5, 5, 2);
    expect(levelAt(L, floors, p.x, p.y)).toBe(2);
    const q = stackProject(L, 5, 5, 0);
    expect(levelAt(L, floors, q.x, q.y)).toBe(0);
    expect(inLevelContent(L, 1, stackProject(L, 1, 1, 1).x, stackProject(L, 1, 1, 1).y)).toBe(true);
    /* 鏡頭用的範圍：包住那一塊（四周至少 4 格） */
    const f = stackFocus(L, { x: 2, y: 2, w: 4, h: 4 }, 1);
    const c = stackProject(L, 4, 4, 1);
    expect(c.x > f.x && c.x < f.x + f.w && c.y > f.y && c.y < f.y + f.h).toBe(true);
  });
});

describe('樓層總覽的版面（F305、3.18.2）', () => {
  it('3 層以上排 2 欄、最上面的樓層在最前面；卡片的平面圖用共同範圍與同一個倍率', () => {
    const floors = threeFloors();
    const B = boardLayout(floors, { ...STACK_DEFAULT });
    expect([B.cols, B.rows]).toEqual([2, 2]);
    expect(B.cards.map((c) => c.level)).toEqual([2, 1, 0]);
    expect(B.shared).toEqual({ x: -0.32, y: -0.32, w: 20.64, h: 12.64 });
    const cellW = Math.max(27, 20.64 + 4.8);
    const cellH = Math.max(17, 12.64 + 5.2);
    expect(B.cards[0].w).toBeCloseTo(cellW, 9);
    expect(B.cards[0].h).toBeCloseTo(cellH, 9);
    expect(B.scale).toBeCloseTo(Math.min((cellW - 1.6) / 20.64, (cellH - 3) / 12.64), 9);
    expect(B.cards[1].x - B.cards[0].x).toBeCloseTo(cellW + 1.6, 9);
    expect(B.cards[2].y - B.cards[0].y).toBeCloseTo(cellH + 1.5, 9);
    expect(B.width).toBeCloseTo(B.leftW + 2 * cellW + 1.6 + 6.4, 9);
    /* 立體圖整個放進左欄 */
    const sb = B.stack.bounds;
    expect(B.stackTx + sb.x * B.stackScale).toBeGreaterThanOrEqual(2.2 - 1e-9);
    expect(B.stackTx + (sb.x + sb.w) * B.stackScale).toBeLessThanOrEqual(2.2 + B.leftW + 1e-9);
    /* 兩層以下排 1 欄 */
    expect(boardLayout(floors.slice(0, 2), { ...STACK_DEFAULT }).cols).toBe(1);
  });
});

describe('上下樓層的連接（3.18.3）', () => {
  it('同一種、位置相近的配成一對；梯子、暗門、螺旋梯沒配到時通到另一層同一個位置的房間', () => {
    const fs = threeFloors();
    fs[1].items.push(
      item('1F-ladder', 'ladder', 2, 2, 1.2, 3),
      item('1F-spiral', 'spiral', 8, 6, 4, 4),
    );
    fs[2].items.push(item('2F-elev', 'elevator', 10, 2, 4, 4));
    const links = verticalLinks(fs);
    expect(
      links.map((l) => `${l.level}:${l.kind}:${!!l.low.item}:${!!l.high.item}`).sort(),
    ).toEqual([
      '0:hatch:false:true',
      '0:spiral:false:true',
      '0:stairs:true:true',
      '1:hatch:true:false',
      '1:spiral:true:false',
      '1:stairs:true:true',
    ]);
    /* 電梯只有一層：不連 */
    expect(links.some((l) => l.kind === 'lift')).toBe(false);
    expect([
      linkKind('stairs_u'),
      linkKind('trapdoor'),
      linkKind('elevator'),
      linkKind('sofa'),
    ]).toEqual(['stairs', 'hatch', 'lift', null]);
  });

  it('樓梯往哪裡走：最下面只往上、中間兩個方向、最上面只往下', () => {
    const fs = threeFloors();
    const links = verticalLinks(fs);
    const t = (level: number) => stairTravel(fs[level].items[0], level, 3, links);
    expect([t(0), t(1), t(2)]).toEqual([
      { up: true, down: false },
      { up: true, down: true },
      { up: false, down: true },
    ]);
  });

  it('範本：透天厝三層的樓梯都連起來', () => {
    const fs = instantiateTemplate('townhouse') ?? [];
    expect(verticalLinks(stackLevels(fs).map((l) => l.floor)).map((l) => l.level)).toEqual([0, 1]);
  });
});

describe('上層樓的快速建立（F308、F309、3.18.4）', () => {
  const src = (): Floor =>
    floorOf('1F', {
      rooms: [
        room('庭院', 0, 0, 30, 20, { cat: 'garden' }),
        room('客廳', 4, 4, 10, 8, { note: '筆記', locked: true }),
        room('廚房', 14, 4, 6, 8, { cat: 'kitchen', wall: 'stone' }),
        room('陽台', 4, 12, 10, 3, { cat: 'balcony' }),
      ],
      openings: [
        { id: 'o1', kind: 'door', o: 'v', x: 14, y: 6, len: 1.5, side: 1, hinge: 0 },
        { id: 'o2', kind: 'door', o: 'h', x: 16, y: 4, len: 1.5, side: 1, hinge: 0 },
        { id: 'o3', kind: 'window', o: 'h', x: 6, y: 4, len: 2, side: 1, hinge: 0 },
        { id: 'o4', kind: 'sliding', o: 'h', x: 6, y: 12, len: 2, side: 1, hinge: 0 },
      ],
      walls: [
        { id: 'w1', x1: 8, y1: 4, x2: 8, y2: 12, kind: 'glass' },
        { id: 'w2', x1: 0, y1: 18, x2: 10, y2: 18, kind: 'fence' },
      ],
      items: [
        item('st', 'stairs', 5, 5, 2, 5),
        item('so', 'sofa3', 9, 6, 4.5, 1.8),
        { ...item('ch', 'chair', 1, 1, 1, 1), ring: 'g1' },
      ],
      texts: [{ id: 't1', x: 8, y: 8, text: '線索' }],
      lines: [{ id: 'l1', kind: 'rail', x1: 0, y1: 0, cx: 1, cy: 1, x2: 2, y2: 2 }],
    });

  it('外框與樓梯：地面類的戶外房間不抄、通到外面的門不抄（窗照抄）、只抄上下樓層的連接；新的 id', () => {
    const s = floorShell(src());
    expect(s.rooms.map((r) => r.name)).toEqual(['客廳', '廚房', '陽台']);
    expect(s.rooms[0]).not.toHaveProperty('note');
    expect(s.rooms[0]).not.toHaveProperty('locked');
    expect(s.rooms[1].wall).toBe('stone');
    /* o1：客廳↔廚房（兩側都是抄過去的房間）、o3：窗、o4：客廳↔陽台；o2：廚房↔庭院（外面）不抄 */
    expect(s.openings.map((o) => `${o.kind}:${o.o}${o.x},${o.y}`)).toEqual([
      'door:v14,6',
      'window:h6,4',
      'sliding:h6,12',
    ]);
    expect(s.walls.map((w) => w.kind)).toEqual(['glass']);
    expect(s.items.map((i) => i.t)).toEqual(['stairs']);
    expect(s.lines).toBeUndefined();
    const ids = [...s.rooms, ...s.openings, ...s.walls, ...s.items].map((o) => o.id);
    expect(ids.some((id) => ['客廳', 'o1', 'w1', 'st'].includes(id))).toBe(false);
    expect([...GROUND_CATS]).toContain('garden');
    expect(GROUND_CATS.has('balcony')).toBe(false);
  });

  it('整層複製：文字以外全部（圓形配置的群組換成新的）', () => {
    const c = floorFullCopy(src());
    expect(c.rooms).toHaveLength(4);
    expect(c.items.map((i) => i.t)).toEqual(['stairs', 'sofa3', 'chair']);
    expect(c.items[2].ring).toBeTruthy();
    expect(c.items[2].ring).not.toBe('g1');
    expect(c.lines).toHaveLength(1);
    expect(c.openings).toHaveLength(4);
  });

  it('抄進空的樓層：原本的文字留著；取代時先清空', () => {
    const target = floorOf('2F', { texts: [{ id: 'keep', x: 1, y: 1, text: '留著' }] });
    pasteFloorContent(target, floorShell(src()));
    expect(target.rooms).toHaveLength(3);
    expect(target.texts.map((t) => t.id)).toEqual(['keep']);
    pasteFloorContent(target, floorShell(src()), true);
    expect(target.rooms).toHaveLength(3);
    expect(target.texts).toEqual([]);
    expect(isBlankFloor(emptyFloor('3F'))).toBe(true);
    expect(isBlankFloor(target)).toBe(false);
  });

  it('從哪一層抄：下一層（左邊）優先，再來上一層、最近的；外觀層與空的樓層不算', () => {
    const fs = threeFloors();
    const blank = emptyFloor('3F');
    expect(donorFloorIndex([...fs, blank], 3)).toBe(2);
    expect(donorFloorIndex([blank, ...fs], 0)).toBe(1);
    fs[1] = { ...fs[1], showInside: true };
    expect(donorFloorIndex(fs, 2)).toBe(0);
    expect(donorFloorIndex([blank, emptyFloor('2F')], 0)).toBe(-1);
  });
});

describe('祕密樓層（F307、3.18.5）', () => {
  /** 祕密的 B1：房間、家具、門、文字 */
  const secretB1 = (names: [string, string], extra = false): Floor =>
    floorOf('B1', {
      secret: true,
      rooms: [room(names[0], 0, 0, 10, 8), room(names[1], 10, 0, 6, 8, { gm: true })],
      openings: [{ id: 'd', kind: 'door', o: 'v', x: 10, y: 3, len: 1.5, side: 1, hinge: 0 }],
      items: extra
        ? [item('s', 'stairs', 1, 1, 2, 5), item('b', 'bed_single', 4, 2, 2, 4)]
        : [item('s', 'stairs', 1, 1, 2, 5)],
      texts: [{ id: 't', x: 5, y: 5, text: names[0] }],
    });

  it('PL 檢視：只剩房間的輪廓（名字、門、家具、文字都拿掉；GM 專用的房間與在它裡面的房間也拿掉）；GM 檢視照常', () => {
    const v = visibleFloor(secretB1(['倉庫', '密室']), true);
    expect(v.veiled).toBe(true);
    expect(v.rooms.map((r) => [r.id, r.name, r.masked])).toEqual([['倉庫', '', true]]);
    expect([v.openings, v.items, v.texts, v.walls]).toEqual([[], [], [], []]);
    /* 2026-11-09 驗證後修訂：GM 專用房間裡的房間也不留外形 */
    const nested = visibleFloor(
      {
        ...secretB1(['倉庫', '密室']),
        rooms: [...secretB1(['倉庫', '密室']).rooms, room('櫃', 11, 1, 2, 2)],
      },
      true,
    );
    expect(nested.rooms.map((r) => r.id)).toEqual(['倉庫']);
    const g = visibleFloor(secretB1(['倉庫', '密室']), false);
    expect(g.veiled).toBeUndefined();
    expect(g.rooms[0].name).toBe('倉庫');
    /* 揭露用：祕密也公開 */
    expect(revealFloor(secretB1(['倉庫', '密室'])).secret).toBeUndefined();
  });

  const hashOf = (c: HTMLCanvasElement) => {
    const r = c as unknown as RecordingCanvas;
    return `${r.width}x${r.height}:${r.hash}`;
  };

  it('PL 用的圖（這一層、所有樓層、立體圖、總覽）和祕密樓層裡有什麼無關；GM 用的圖不同', () => {
    const restore = installRecordingDocument();
    try {
      const a = projectOf([
        secretB1(['倉庫', '密室']),
        floorOf('1F', { rooms: [room('店', 0, 0, 16, 8)] }),
      ]);
      const b = projectOf([
        secretB1(['工房', '祭壇'], true),
        floorOf('1F', { rooms: [room('店', 0, 0, 16, 8)] }),
      ]);
      /*
       * 驗證後修訂（2026-11-09，M1）：祕密樓層的內容放到很遠的地方（文字、家具、樓梯、牆、門、GM 專用的房間與裡面的房間），
       * PL 用的圖的範圍與內容都不變（逐指令相同、大小相同）；GM 用、揭露用的範圍變大
       */
      const far = (f: Floor): Floor => ({
        ...f,
        rooms: [
          ...f.rooms,
          room('遠的密室', 60, 40, 10, 8, { gm: true }),
          room('密室裡的櫃', 62, 42, 3, 3),
        ],
        walls: [{ id: 'w', x1: -40, y1: -30, x2: -30, y2: -30, kind: 'int' }],
        openings: [
          ...f.openings,
          { id: 'd2', kind: 'secret', o: 'h', x: 62, y: 40, len: 1.5, side: 1, hinge: 0 },
        ],
        items: [
          ...f.items,
          item('far', 'bed_single', -50, 70, 2, 4),
          item('st2', 'stairs', 80, -40, 2, 5),
        ],
        texts: [
          ...f.texts,
          { id: 'far-t', x: 120, y: -60, text: '遠處的文字' },
          { id: 'g', x: 90, y: 90, text: 'GM 的字', gm: true },
        ],
        lines: [{ id: 'l', kind: 'rail', x1: -70, y1: 0, cx: -65, cy: 5, x2: -60, y2: 10 }],
      });
      const c = projectOf([
        far(secretB1(['工房', '祭壇'], true)),
        floorOf('1F', { rooms: [room('店', 0, 0, 16, 8)] }),
      ]);
      for (const range of ['current', 'all', 'stack', 'board'] as const) {
        const e = { ...EXP, range };
        const draw = (p: Project, view: ExportSettings['view']) => {
          const ex = { ...e, view };
          const floors = exportFloors(p, range);
          return range === 'stack' || range === 'board'
            ? hashOf(renderStackImage(floors, stackExportOptions(p, ex, 'clean', 24)))
            : hashOf(renderImage(floors, exportOptions(p, ex, 'clean', 24)));
        };
        expect(draw(a, 'pl'), range).toBe(draw(b, 'pl'));
        expect(draw(a, 'pl'), range).toBe(draw(c, 'pl'));
        expect(draw(a, 'gm'), range).not.toBe(draw(b, 'gm'));
        /* 全部公開的那一張：照一般的 PL 用的圖畫 */
        expect(draw(unveiledProject(a), 'pl'), range).not.toBe(draw(a, 'pl'));
        if (range === 'stack' || range === 'board') {
          const size = (p: Project, view: ExportSettings['view']) => {
            const L = stackImageLayout(
              exportFloors(p, range),
              stackExportOptions(p, { ...e, view }, 'clean', 24),
            );
            return [L.pxWidth, L.pxHeight];
          };
          const pl = size(c, 'pl');
          expect(pl, range).toEqual(size(a, 'pl'));
          const gm = size(c, 'gm');
          expect(gm[0] * gm[1], range).toBeGreaterThan(pl[0] * pl[1] * 4);
          /* 揭露用與 GM 用同一個範圍；和 PL 用不同（匯出對話框提示對不齊） */
          expect(size(c, 'reveal'), range).toEqual(gm);
          const key = (p: Project, view: ExportSettings['view']) =>
            stackFrameKey(
              stackImageLayout(
                exportFloors(p, range),
                stackExportOptions(p, { ...e, view }, 'clean', 24),
              ),
            );
          expect(key(c, 'reveal')).not.toBe(key(c, 'pl'));
          expect(key(c, 'reveal')).toBe(key(c, 'gm'));
          /* 祕密樓層的內容都在 PL 看得到的範圍裡（也沒有樓梯：樓梯會加高上下的留白）時，PL 用與揭露用對得齊 */
          const d = projectOf([{ ...secretB1(['倉庫', '密室']), items: [] }, a.floors[1]]);
          expect(key(d, 'reveal')).toBe(key(d, 'pl'));
          expect(key(a, 'reveal')).not.toBe(key(a, 'pl'));
        }
      }
    } finally {
      restore();
    }
  });

  it('PL 用的分享連結：祕密樓層只留 PL 看得到的房間的外形（種類換成中性的）＋祕密的標記；完整連結全部帶著', () => {
    const b1 = secretB1(['倉庫', '密室'], true);
    b1.rooms[0].cat = 'danger';
    const p = projectOf([b1, floorOf('1F', { rooms: [room('店', 0, 0, 16, 8)] })]);
    const { project, removed } = playerProject(p);
    expect(removed.secretFloors).toBe(1);
    expect(project.floors[0]).toMatchObject({
      secret: true,
      walls: [],
      openings: [],
      items: [],
      texts: [],
    });
    /* 驗證後修訂（2026-11-09，M2）：種類是劇透 → 中性的「客廳・起居室」；GM 專用的房間不留 */
    expect(project.floors[0].rooms).toEqual([
      { id: '倉庫', x: 0, y: 0, w: 10, h: 8, name: '', cat: 'living' },
    ]);
    const pl = readMapHash(encodeMapHash(p, 'pl').hash);
    expect(pl.kind).toBe('ok');
    const back = normalizeProject(pl.kind === 'ok' ? pl.raw : null, isAsset);
    expect(back?.floors[0].secret).toBe(true);
    expect(JSON.stringify(back)).not.toContain('倉庫');
    expect(JSON.stringify(back)).not.toContain('danger');
    /* 打開 PL 用的連結：PL 用的圖和原本的地圖的 PL 用的圖相同 */
    const restore = installRecordingDocument();
    try {
      for (const range of ['all', 'stack', 'board'] as const) {
        const e = { ...EXP, range };
        const draw = (q: Project) => {
          const floors = exportFloors(q, range);
          return range === 'all'
            ? hashOf(renderImage(floors, exportOptions(q, e, 'clean', 24)))
            : hashOf(renderStackImage(floors, stackExportOptions(q, e, 'clean', 24)));
        };
        expect(draw(back as Project), range).toBe(draw(p));
      }
    } finally {
      restore();
    }
    const full = readMapHash(encodeMapHash(p, 'full').hash);
    const all = normalizeProject(full.kind === 'ok' ? full.raw : null, isAsset);
    expect(all?.floors[0].secret).toBe(true);
    expect(all?.floors[0].items).toHaveLength(2);
    expect(all?.floors[0].rooms[0].name).toBe('倉庫');
  });

  it('要不要顯示「全部公開再存一張」：PL 用的圖、匯出的樓層裡有祕密樓層時', () => {
    const p = projectOf(
      [secretB1(['倉庫', '密室']), floorOf('1F', { rooms: [room('店', 0, 0, 16, 8)] })],
      {
        active: 1,
      },
    );
    expect(exportHasSecret(p, { ...EXP, range: 'current' })).toBe(false);
    expect(exportHasSecret(p, { ...EXP, range: 'all' })).toBe(true);
    expect(exportHasSecret(p, { ...EXP, range: 'stack' })).toBe(true);
    expect(exportHasSecret(p, { ...EXP, range: 'all', view: 'gm' })).toBe(false);
    expect(unveiledProject(p).floors.some((f) => f.secret)).toBe(false);
  });
});

describe('匯出的範圍與檔名（F306、3.2 修訂）', () => {
  const p = projectOf(threeFloors(), { name: '鐘錶行', active: 1 });

  it('立體圖、總覽：一張、檔名加「立體」「總覽」（不加樓層名；VTT 用不適用）', () => {
    expect(exportJobs(p, { ...EXP, range: 'stack' }).map((j) => j.name)).toEqual([
      '鐘錶行_立體_PL.png',
    ]);
    expect(exportJobs(p, { ...EXP, range: 'board', view: 'gm' }).map((j) => j.name)).toEqual([
      '鐘錶行_總覽_GM.png',
    ]);
    expect(exportJobs(p, { ...EXP, range: 'stack', mode: 'vtt' })[0].name).toBe(
      '鐘錶行_立體_PL.png',
    );
    expect(exportJobs(p, { ...EXP, range: 'stack', view: 'reveal' }, true)[0].name).toBe(
      '鐘錶行_立體_揭露_全部公開.png',
    );
    expect(exportFileName(p, { ...EXP, range: 'current' }, p.floors[1], null, true)).toBe(
      '鐘錶行_1F_PL_全部公開.png',
    );
    expect(exportFloors(p, 'stack').map((f) => f.name)).toEqual(['B1', '1F', '2F']);
  });

  it('大小：範圍 × 每格 px（太大時自動縮小）', () => {
    const o = stackExportOptions(p, { ...EXP, range: 'stack' }, 'clean', 48);
    const L = stackImageLayout(exportFloors(p, 'stack'), o);
    const s = stackLayout(exportFloors(p, 'stack'), stackCamera(p));
    expect(L.scale).toBe(48);
    expect(L.pxWidth).toBe(Math.round(s.bounds.w * 48));
    expect(L.pxHeight).toBe(Math.round(s.bounds.h * 48));
    const small = stackImageLayout(exportFloors(p, 'board'), {
      ...stackExportOptions(p, { ...EXP, range: 'board' }, 'clean', 96),
      limit: { maxSide: 2000, maxPixels: 2_000_000 },
    });
    expect(Math.max(small.pxWidth, small.pxHeight)).toBeLessThanOrEqual(2000);
    expect(small.scale).toBeLessThan(96);
  });

  it('立體圖的畫法每次相同；PL／GM／透明不同', () => {
    const restore = installRecordingDocument();
    try {
      const fs = exportFloors(p, 'stack');
      const draw = (e: Partial<ExportSettings>) =>
        (
          renderStackImage(
            fs,
            stackExportOptions(p, { ...EXP, range: 'stack', ...e }, 'clean', 24),
          ) as unknown as RecordingCanvas
        ).hash;
      expect(draw({})).toBe(draw({}));
      expect(draw({})).not.toBe(draw({ view: 'gm' }));
      expect(draw({})).not.toBe(draw({ transparent: true }));
    } finally {
      restore();
    }
  });
});

describe('專案檔、分享連結（版本 10、3.5、3.7 修訂）', () => {
  it('版本 10；視角與祕密樓層照讀，範圍外夾回來、和預設相同時不寫；版本 9 的檔照讀', () => {
    expect(DATA_VERSION).toBe(11);
    const raw = {
      ...projectOf(threeFloors()),
      stack: { angle: 400, pitch: 0.1, gap: 1.2, rise: '2' },
      floors: threeFloors().map((f, i) => ({ ...f, secret: i === 0 ? true : 'yes' })),
    };
    const p = normalizeProject(raw, isAsset);
    expect(p?.stack).toEqual({ angle: 180, pitch: 0.35, gap: 1.2, rise: 1 });
    expect(p?.floors.map((f) => f.secret)).toEqual([true, undefined, undefined]);
    expect(
      normalizeProject({ ...raw, stack: { ...STACK_DEFAULT } }, isAsset)?.stack,
    ).toBeUndefined();
    /* 版本 9 的檔（沒有這些欄位）：照讀，沒有祕密樓層、預設的視角 */
    const v9 = normalizeProject(projectOf(threeFloors()), isAsset);
    expect(v9?.stack).toBeUndefined();
    expect(v9?.floors.some((f) => f.secret)).toBe(false);
  });

  it('專案檔往返：視角與祕密樓層不變', () => {
    const p = normalizeProject(
      {
        ...projectOf(threeFloors()),
        stack: { angle: 45, pitch: 0.7, gap: 1.4, rise: 1.6 },
        floors: threeFloors().map((f, i) => (i === 2 ? { ...f, secret: true } : f)),
      },
      isAsset,
    ) as Project;
    const file = parseProject<Project>(
      JSON.stringify(createProjectFile('floor-plan', DATA_VERSION, p)),
      'floor-plan',
    );
    expect(file.version).toBe(11);
    const back = normalizeProject(file.data, isAsset);
    expect(back).toEqual(p);
  });

  it('分享連結：視角帶著（完整與 PL 用）、預設的視角不寫', () => {
    const p = projectOf(threeFloors(), { stack: { angle: 10, pitch: 0.6, gap: 1, rise: 1 } });
    for (const mode of ['full', 'pl'] as const) {
      const r = readMapHash(encodeMapHash(p, mode).hash);
      const back = normalizeProject(r.kind === 'ok' ? r.raw : null, isAsset);
      expect(back?.stack, mode).toEqual(p.stack);
    }
    const plain = encodeMapHash(projectOf(threeFloors()), 'full');
    const r = readMapHash(plain.hash);
    expect(r.kind === 'ok' && (r.raw as { stack?: unknown }).stack).toBeFalsy();
  });
});
