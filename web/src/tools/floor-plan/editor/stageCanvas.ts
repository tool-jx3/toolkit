/**
 * 演出時的畫布（2026-11-09，F313～F328）：編輯畫布（controller）在「演出」打開時把重畫與指標交給這裡。
 *
 * - GM 的準備：照原本的畫（平面圖、立體樓層圖、樓層總覽），藏起來的房間加標記、路線全部畫、路線的控制點
 *   （編號圓標＝起點、終點、彎曲的小方塊；平面圖與立體圖，總覽沒有）。
 *   「藏起來／公開」「移動路線」工具：點房間；平面圖上拖曳畫自由的箭頭。立體圖、總覽拖曳＝旋轉視角。
 * - 演出的畫面（PL 用；播放、看某一步、全部公開、GM／PL 切到 PL 時）：照時間軸的狀態畫，鏡頭跟隨時跟著時間移動；
 *   點「？？？」暫時公開。平面圖上拖曳＝平移。
 */
import { drawThemeEffect } from '../draw/effects';
import {
  drawStageFrame,
  drawStageState,
  type StageDrawOptions,
  type StageScene,
  type StageView,
  stageScene,
} from '../draw/stage';
import { getTheme } from '../draw/themes';
import { clamp, snap } from '../model/geometry';
import { floorNavigator, type Navigator, roomKey } from '../model/route';
import { roomHasPointClosed } from '../model/shape';
import {
  ORBIT_DEG_PER_PX,
  ORBIT_PITCH_PER_PX,
  plateAt,
  STACK_PITCH_DRAG_MAX,
  STACK_PITCH_DRAG_MIN,
  stackCamera,
  stackProject,
  stackUnproject,
  wrapAngle,
} from '../model/stack';
import {
  aspectRect,
  dragRouteHandle,
  type RouteHandle,
  type StageFrame,
  type StageState,
  stageCameraAt,
  stageFrameAt,
  stepState,
  tidyStage,
} from '../model/stage';
import type { Floor, Rect, Room, StageRoute } from '../model/types';
import { ST } from '../stageStrings';
import { S } from '../strings';
import * as act from './actions';
import {
  addFreeRoute,
  stageCamera as cameraMode,
  revealFloorTemp,
  revealTemp,
  stagePlayView,
  stageRoomClick,
} from './stageActions';
import { timelineOf } from './stageCache';
import { useStage } from './stageStore';
import { useEditor, usePrefs, useProject } from './store';

type P = { x: number; y: number };

/** 畫布（controller）給演出用的東西 */
export interface StageHost {
  readonly view: { zoom: number; ox: number; oy: number; w: number; h: number; dpr: number };
  canvas: HTMLCanvasElement | null;
  toWorld(sx: number, sy: number): P;
  toScreen(x: number, y: number): P;
  requestRender(): void;
  syncZoom(): void;
}

type StageDrag =
  | { kind: 'draw'; sx: number; sy: number; a: P; floor: string; moved: boolean }
  | { kind: 'orbit'; sx: number; sy: number; angle: number; pitch: number; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | {
      kind: 'handle';
      id: string;
      handle: RouteHandle;
      grip: P;
      orig: P;
      before: StageRoute[];
      moved: boolean;
      /** 這次拖曳用的每一層的導航（拖曳中樓層不變，第一次用到時才建） */
      navs: Map<string, Navigator>;
    };

interface ScreenHandle {
  id: string;
  handle: RouteHandle;
  x: number;
  y: number;
  n: number;
}

/** 立體圖裡路線的高度（同 draw/stage.ts） */
const ROUTE_Z = 0.36;
const prefersReduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class StageCanvas {
  drag: StageDrag | null = null;
  private draft: { floor: string; a: P; b: P } | null = null;
  private memo: { key: unknown[]; scene: StageScene } | null = null;
  /** 演出的畫面開始前的視角（回到準備時還原） */
  private editView: { zoom: number; ox: number; oy: number } | null = null;
  private unsubs: (() => void)[] = [];

  constructor(private host: StageHost) {}

  attach(): void {
    this.detach();
    this.unsubs.push(
      useStage.subscribe((s, prev) => {
        if (s.on !== prev.on && !s.on) this.drag = null;
        if (s.preview !== prev.preview) {
          if (s.preview) {
            this.editView = { ...this.host.view };
            this.applyCamera(true);
          } else if (this.editView) {
            Object.assign(this.host.view, this.editView);
            this.editView = null;
            this.host.syncZoom();
          }
        } else if (s.preview && (s.time !== prev.time || s.revealAll !== prev.revealAll))
          this.applyCamera(false);
        this.host.requestRender();
      }),
    );
    this.unsubs.push(
      usePrefs.subscribe((s, prev) => {
        const st = useStage.getState();
        if (
          st.on &&
          st.preview &&
          (s.data.stageView !== prev.data.stageView || s.data.stageCamera !== prev.data.stageCamera)
        )
          this.applyCamera(true);
      }),
    );
  }

  detach(): void {
    for (const u of this.unsubs.splice(0)) u();
  }

  /* ---------- 畫面 ---------- */

  /** 演出的畫面（PL 用）：播放中、看某一步，或 GM／PL 切到 PL */
  pl(): boolean {
    return useStage.getState().preview || useEditor.getState().playerView;
  }

  /** 用哪一種畫面（演出的畫面照「播放畫面」，「現在的檢視方式」與準備時照檢視方式） */
  viewMode(): StageView {
    const v = usePrefs.getState().data.view ?? 'plan';
    if (useStage.getState().preview) {
      const pv = stagePlayView();
      if (pv !== 'keep') return pv;
    }
    return v;
  }

  scene(): StageScene {
    const p = useProject.getState().data;
    const tl = timelineOf(p);
    const view = this.viewMode();
    const pl = this.pl();
    const hideClues = !usePrefs.getState().data.showClues;
    const key = [p, tl, view, pl, hideClues];
    if (this.memo?.key.every((k, i) => k === key[i])) return this.memo.scene;
    const scene = stageScene(p, tl, view, { playerView: pl, hideClues });
    this.memo = { key, scene };
    return scene;
  }

  /** 演出的畫面現在的樣子（暫時公開、全部公開也算進去）；GM 的準備時 null */
  frame(): StageFrame | null {
    if (!this.pl()) return null;
    const p = useProject.getState().data;
    const tl = timelineOf(p);
    const st = useStage.getState();
    /* 沒有在播放（GM／PL 切到 PL）：開始前的樣子、畫面上的這一層（樓層列照常切換） */
    const raw: StageFrame = st.preview
      ? stageFrameAt(tl, st.time, prefersReduced())
      : {
          step: 0,
          from: null,
          to: { ...stepState(tl, 0), floor: (p.floors[p.active] ?? p.floors[0])?.id ?? '' },
          alpha: 1,
        };
    const fix = (s: StageState | null): StageState | null => {
      if (!s) return s;
      if (st.revealAll)
        return {
          ...s,
          hidden: new Set(),
          hiddenFloors: new Set(),
          routes: tl.ctx.routes.map((r) => ({ id: r.id, progress: 1, head: true })),
          bridges: tl.ctx.routes
            .map((r, index) => ({ id: r.id, index, progress: 1, head: true }))
            .filter((b) => b.index > 0 && tl.ctx.hops[b.index].length),
        };
      if (!st.openRooms.length && !st.openFloors.length) return s;
      return {
        ...s,
        hidden: new Set([...s.hidden].filter((k) => !st.openRooms.includes(k))),
        hiddenFloors: new Set([...s.hiddenFloors].filter((k) => !st.openFloors.includes(k))),
      };
    };
    return { ...raw, from: fix(raw.from), to: fix(raw.to) as StageState };
  }

  /** 平面圖現在畫哪一層（演出的畫面照狀態，準備時是目前的樓層） */
  planFloor(): Floor | null {
    const p = useProject.getState().data;
    const f = this.frame();
    const id = f?.to.floor;
    return p.floors.find((x) => x.id === id) ?? p.floors[p.active] ?? null;
  }

  render(c: CanvasRenderingContext2D): void {
    const p = useProject.getState().data;
    const prefs = usePrefs.getState().data;
    const theme = getTheme(p.theme);
    const { zoom: z, dpr, ox, oy } = this.host.view;
    const canvas = this.host.canvas;
    if (!canvas) return;
    const viewRect = { x: -ox / z, y: -oy / z, w: this.host.view.w / z, h: this.host.view.h / z };
    const sc = this.scene();
    const levels = sc.levels;
    const opts: StageDrawOptions = {
      theme,
      zoom: z,
      showSize: p.showSize,
      hideNames: p.showNames === false,
      hideClues: !prefs.showClues,
      viewRect,
      activeLevel: levels.findIndex((f) => f.id === p.floors[p.active]?.id),
      planFloor: p.floors[p.active]?.id,
      ...(p.night ? { night: p.night } : {}),
    };
    const frame = this.frame();
    if (frame) drawStageFrame(c, sc, opts, frame);
    else {
      drawStageState(c, sc, opts, null);
      this.drawDraft(c);
      this.drawStart(c, sc);
    }
    if (theme.effect) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      drawThemeEffect(c, theme, canvas.width, canvas.height, dpr);
      c.restore();
    }
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!frame) this.drawHandles(c);
    c.textBaseline = 'top';
    if (frame) {
      c.globalAlpha = 0.75;
      c.font = '800 15px system-ui, sans-serif';
      c.fillStyle = theme.label;
      const f = sc.view === 'plan' ? this.planFloor() : null;
      c.fillText(f ? `${ST.kicker}（PL）・${f.name || '—'}` : `${ST.kicker}（PL）`, 60, 12);
    } else {
      c.globalAlpha = 0.4;
      c.font = '900 24px system-ui, sans-serif';
      c.fillStyle = theme.gm;
      c.fillText(S.badgeGm, 60, 12);
    }
    c.restore();
  }

  /** 拖曳中的自由的箭頭 */
  private drawDraft(c: CanvasRenderingContext2D): void {
    const d = this.draft;
    if (!d) return;
    c.save();
    c.strokeStyle = '#e5323b';
    c.lineWidth = 0.13;
    c.setLineDash([0.4, 0.22]);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(d.a.x, d.a.y);
    c.lineTo(d.b.x, d.b.y);
    c.stroke();
    c.restore();
  }

  /** 出發地的房間（虛線框） */
  private drawStart(c: CanvasRenderingContext2D, sc: StageScene): void {
    const st = useStage.getState();
    if (!st.start || sc.view !== 'plan') return;
    const p = useProject.getState().data;
    if (p.floors[p.active]?.id !== st.start.floor) return;
    const r = p.floors[p.active].rooms.find((x) => x.id === st.start?.room);
    if (!r) return;
    c.save();
    c.strokeStyle = '#e5323b';
    c.lineWidth = Math.max(0.12, 2.4 / this.host.view.zoom);
    c.setLineDash([0.5, 0.3]);
    c.strokeRect(r.x - 0.15, r.y - 0.15, r.w + 0.3, r.h + 0.3);
    c.restore();
  }

  /* ---------- 路線的控制點 ---------- */

  /** 立體圖、總覽的世界座標 → 立體圖的座標 */
  private stackXY(sc: StageScene, w: P): P {
    if (!sc.board) return w;
    return {
      x: (w.x - sc.board.stackTx) / sc.board.stackScale,
      y: (w.y - sc.board.stackTy) / sc.board.stackScale,
    };
  }

  private handles(): ScreenHandle[] {
    const sc = this.scene();
    if (this.pl() || sc.view === 'board') return [];
    const p = useProject.getState().data;
    const routes = sc.tl.ctx.routes;
    const out: ScreenHandle[] = [];
    const level = (id: string) => sc.levels.findIndex((f) => f.id === id);
    for (const [i, r] of routes.entries()) {
      const pts: [RouteHandle, number, number][] = [
        ['ctrl', r.cx, r.cy],
        ['p2', r.x2, r.y2],
        ['p1', r.x1, r.y1],
      ];
      if (sc.view === 'plan') {
        if (r.floor !== p.floors[p.active]?.id) continue;
        for (const [h, x, y] of pts) {
          const s = this.host.toScreen(x, y);
          out.push({ id: r.id, handle: h, x: s.x, y: s.y, n: i + 1 });
        }
      } else if (sc.stack) {
        const lv = level(r.floor);
        if (lv < 0) continue;
        for (const [h, x, y] of pts) {
          const q = stackProject(sc.stack, x, y, lv, ROUTE_Z);
          const s = this.host.toScreen(q.x, q.y);
          out.push({ id: r.id, handle: h, x: s.x, y: s.y, n: i + 1 });
        }
      }
    }
    return out;
  }

  private handleAt(sx: number, sy: number): ScreenHandle | null {
    const list = this.handles();
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      const r = h.handle === 'p1' ? 11 : 8;
      if (Math.hypot(h.x - sx, h.y - sy) <= r) return h;
    }
    return null;
  }

  private drawHandles(c: CanvasRenderingContext2D): void {
    for (const h of this.handles()) {
      c.save();
      c.beginPath();
      if (h.handle === 'ctrl') c.rect(h.x - 4.5, h.y - 4.5, 9, 9);
      else c.arc(h.x, h.y, h.handle === 'p1' ? 9 : 5, 0, Math.PI * 2);
      c.fillStyle = h.handle === 'ctrl' ? '#ffffff' : '#e5323b';
      c.fill();
      c.strokeStyle = h.handle === 'ctrl' ? '#e5323b' : '#ffffff';
      c.lineWidth = 1.6;
      c.stroke();
      if (h.handle === 'p1') {
        c.fillStyle = '#ffffff';
        c.font = '800 11px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(h.n), h.x, h.y + 0.5);
      }
      c.restore();
    }
  }

  /** 畫面上 (sx, sy) 的控制點在路線那一層的平面座標 */
  private handlePoint(sx: number, sy: number, floor: string): P | null {
    const sc = this.scene();
    const w = this.host.toWorld(sx, sy);
    if (sc.view === 'plan') return w;
    if (!sc.stack) return null;
    const lv = sc.levels.findIndex((f) => f.id === floor);
    if (lv < 0) return null;
    const q = this.stackXY(sc, w);
    return stackUnproject(sc.stack, q.x, q.y, lv, ROUTE_Z);
  }

  /* ---------- 點選 ---------- */

  /** 畫面上 (sx, sy) 的房間（平面圖：畫的那一層；立體圖：上面的樓層先，封起來的箱子的頂面也算；總覽：卡片或立體圖） */
  roomAt(sx: number, sy: number): { floor: Floor; room: Room } | null {
    const sc = this.scene();
    const w = this.host.toWorld(sx, sy);
    const top = (f: Floor, q: P) =>
      [...f.rooms].reverse().find((r) => roomHasPointClosed(r, q.x, q.y)) ?? null;
    if (sc.view === 'plan') {
      const f = this.planFloor();
      const r = f ? top(f, w) : null;
      return f && r ? { floor: f, room: r } : null;
    }
    if (sc.board) {
      const card = sc.board.cards.find(
        (c) => w.x >= c.x && w.x <= c.x + c.w && w.y >= c.y + 1.7 && w.y <= c.y + c.h,
      );
      if (card) {
        const f = sc.levels[card.level];
        const q = { x: (w.x - card.tx) / sc.board.scale, y: (w.y - card.ty) / sc.board.scale };
        const r = f ? top(f, q) : null;
        return f && r ? { floor: f, room: r } : null;
      }
    }
    if (!sc.stack) return null;
    const q = this.stackXY(sc, w);
    for (let level = sc.levels.length - 1; level >= 0; level--) {
      const f = sc.levels[level];
      for (const z of [0.72, 0, -0.38]) {
        const at = stackUnproject(sc.stack, q.x, q.y, level, z);
        const r = top(f, at);
        if (r) return { floor: f, room: r };
      }
    }
    return null;
  }

  /** 立體圖、總覽上點到哪一層的樓層牌（沒有 −1） */
  private plateAt(sx: number, sy: number): number {
    const sc = this.scene();
    if (!sc.stack) return -1;
    const q = this.stackXY(sc, this.host.toWorld(sx, sy));
    return plateAt(sc.stack, sc.levels.length, q.x, q.y);
  }

  /** 點了一下（沒拖） */
  private click(sx: number, sy: number): void {
    const sc = this.scene();
    if (sc.view !== 'plan') {
      const plate = this.plateAt(sx, sy);
      if (plate >= 0) {
        const f = sc.levels[plate];
        const frame = this.frame();
        if (frame && f && frame.to.hiddenFloors.has(f.id)) {
          revealFloorTemp(f.id);
          return;
        }
        if (!frame) {
          const index = useProject.getState().data.floors.findIndex((x) => x.id === f?.id);
          if (index >= 0) act.jumpToFloor(index);
        }
        return;
      }
    }
    const hit = this.roomAt(sx, sy);
    const frame = this.frame();
    if (frame) {
      if (!hit) return;
      if (frame.to.hiddenFloors.has(hit.floor.id)) revealFloorTemp(hit.floor.id);
      else if (frame.to.hidden.has(roomKey(hit.floor.id, hit.room.id)))
        revealTemp(roomKey(hit.floor.id, hit.room.id));
      return;
    }
    if (!hit) {
      if (useStage.getState().tool !== 'hand') act.notify(ST.noRoom, 'info', { replace: true });
      return;
    }
    stageRoomClick(hit.floor.id, hit.room);
  }

  /* ---------- 指標 ---------- */

  down(e: PointerEvent, sx: number, sy: number): void {
    const sc = this.scene();
    const pl = this.pl();
    if (!pl) {
      const h = this.handleAt(sx, sy);
      if (h) {
        const r = sc.tl.ctx.routes.find((x) => x.id === h.id);
        const grip = r ? this.handlePoint(sx, sy, r.floor) : null;
        if (r && grip) {
          useProject.beginGesture();
          const orig =
            h.handle === 'p1'
              ? { x: r.x1, y: r.y1 }
              : h.handle === 'p2'
                ? { x: r.x2, y: r.y2 }
                : { x: r.cx, y: r.cy };
          this.drag = {
            kind: 'handle',
            id: h.id,
            handle: h.handle,
            grip,
            orig,
            before: structuredClone(useProject.getState().data.stage?.routes ?? []),
            moved: false,
            navs: new Map(),
          };
          return;
        }
      }
    }
    if (sc.view === 'plan') {
      if (pl) {
        this.drag = {
          kind: 'pan',
          sx,
          sy,
          ox: this.host.view.ox,
          oy: this.host.view.oy,
          moved: false,
        };
        return;
      }
      const f = this.planFloor();
      if (!f) return;
      const w = this.host.toWorld(sx, sy);
      this.drag = {
        kind: 'draw',
        sx,
        sy,
        a: { x: snap(w.x, 0.25), y: snap(w.y, 0.25) },
        floor: f.id,
        moved: false,
      };
      return;
    }
    const cam = stackCamera(useProject.getState().data);
    this.drag = { kind: 'orbit', sx, sy, angle: cam.angle, pitch: cam.pitch, moved: false };
    void e;
  }

  move(e: PointerEvent, sx: number, sy: number): void {
    const d = this.drag;
    if (!d) return;
    switch (d.kind) {
      case 'draw': {
        if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 5) return;
        d.moved = true;
        const w = this.host.toWorld(sx, sy);
        this.draft = { floor: d.floor, a: d.a, b: { x: snap(w.x, 0.25), y: snap(w.y, 0.25) } };
        this.host.requestRender();
        return;
      }
      case 'orbit':
        if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
        d.moved = true;
        act.setStackCamera({
          angle: wrapAngle(d.angle + (sx - d.sx) * ORBIT_DEG_PER_PX),
          pitch: clamp(
            d.pitch + (sy - d.sy) * ORBIT_PITCH_PER_PX,
            STACK_PITCH_DRAG_MIN,
            STACK_PITCH_DRAG_MAX,
          ),
        });
        if (useStage.getState().preview) this.applyCamera(false);
        return;
      case 'pan':
        if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
        this.host.view.ox = d.ox + (sx - d.sx);
        this.host.view.oy = d.oy + (sy - d.sy);
        this.host.requestRender();
        return;
      case 'handle': {
        const r = d.before.find((x) => x.id === d.id);
        const raw = r ? this.handlePoint(sx, sy, r.floor) : null;
        if (!r || !raw) return;
        d.moved = true;
        const pos = {
          x: snap(d.orig.x + raw.x - d.grip.x, 0.25),
          y: snap(d.orig.y + raw.y - d.grip.y, 0.25),
        };
        const p = useProject.getState().data;
        const next = dragRouteHandle(d.before, d.id, d.handle, pos, e.altKey, (floor) => {
          const f = p.floors.find((x) => x.id === floor);
          if (!f) return null;
          let n = d.navs.get(floor);
          if (!n) {
            n = floorNavigator(f);
            d.navs.set(floor, n);
          }
          return n;
        });
        useProject.getState().update((q) => {
          if (!q.stage) return;
          q.stage.routes = next;
          tidyStage(q);
        });
        return;
      }
    }
  }

  up(_e: PointerEvent, sx: number, sy: number): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    switch (d.kind) {
      case 'draw':
        if (!d.moved) this.click(sx, sy);
        else if (this.draft) addFreeRoute(d.floor, this.draft.a, this.draft.b);
        this.draft = null;
        break;
      case 'orbit':
      case 'pan':
        if (!d.moved) this.click(sx, sy);
        break;
      case 'handle':
        useProject.endGesture();
        break;
    }
    this.host.requestRender();
  }

  /** 拖曳到一半取消（Esc）：路線回到拖曳前 */
  cancel(): boolean {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    this.draft = null;
    if (d.kind === 'handle') {
      useProject.getState().update((q) => {
        if (q.stage) q.stage.routes = d.before;
      });
      useProject.endGesture();
    }
    this.host.requestRender();
    return true;
  }

  /** 游標 */
  cursor(sx: number, sy: number, space: boolean): string {
    const d = this.drag;
    if (d?.kind === 'pan' || (d?.kind === 'orbit' && d.moved) || d?.kind === 'handle')
      return 'grabbing';
    if (space || useStage.getState().tool === 'hand') return 'grab';
    if (!this.pl() && this.handleAt(sx, sy)) return 'grab';
    const sc = this.scene();
    if (this.roomAt(sx, sy)) return 'pointer';
    return sc.view === 'plan' && !this.pl() ? 'crosshair' : 'grab';
  }

  /* ---------- 鏡頭 ---------- */

  /** 畫面上放進來的範圍（演出的畫面：鏡頭跟隨照時間，固定看全體＝這一步的全體） */
  cameraBox(): Rect | null {
    const st = useStage.getState();
    if (!st.preview) return null;
    const sc = this.scene();
    const tl = sc.tl;
    if (st.revealAll) {
      const f = sc.view === 'plan' ? (this.planFloor()?.id ?? '') : '';
      return sc.whole(f);
    }
    return stageCameraAt(tl, st.time, cameraMode(), sc.focusBox, sc.whole, sc.view === 'plan');
  }

  /** 把鏡頭的範圍放進畫布（四周留 16 px） */
  applyCamera(force: boolean): void {
    const box = this.cameraBox();
    const v = this.host.view;
    if (!box || !v.w) return;
    if (!force && cameraMode() === 'fixed' && !this.planChanged()) return;
    const pad = 16;
    const aw = Math.max(40, v.w - pad * 2);
    const ah = Math.max(40, v.h - pad * 2);
    const b = aspectRect(box, aw / ah);
    v.zoom = clamp(aw / b.w, 1, 140);
    v.ox = pad - b.x * v.zoom;
    v.oy = pad - b.y * v.zoom;
    this.host.syncZoom();
    this.host.requestRender();
  }

  private lastPlanFloor: string | null = null;
  /** 平面圖的演出畫面換了樓層（固定看全體時要重新放進畫面） */
  private planChanged(): boolean {
    if (this.scene().view !== 'plan') return false;
    const id = this.planFloor()?.id ?? null;
    const changed = id !== this.lastPlanFloor;
    this.lastPlanFloor = id;
    return changed;
  }

  /** 顯示全部（演出的畫面：這一步的全體；準備時由畫布照檢視方式） */
  fit(): boolean {
    if (!useStage.getState().preview) return false;
    const sc = this.scene();
    const box = sc.whole(sc.view === 'plan' ? (this.planFloor()?.id ?? '') : '');
    const v = this.host.view;
    const pad = 16;
    const aw = Math.max(40, v.w - pad * 2);
    const ah = Math.max(40, v.h - pad * 2);
    const b = aspectRect(box, aw / ah);
    v.zoom = clamp(aw / b.w, 1, 140);
    v.ox = pad - b.x * v.zoom;
    v.oy = pad - b.y * v.zoom;
    this.host.syncZoom();
    this.host.requestRender();
    return true;
  }

  /** 放大到一間房（清單的「放大」） */
  focusRoom(floorId: string, room: Room): void {
    /* 平面圖：準備時切到那一層；演出的畫面在別一層時不動（畫的樓層照時間軸） */
    if (this.viewMode() === 'plan') {
      const p = useProject.getState().data;
      if (this.frame() && this.planFloor()?.id !== floorId) return;
      const index = p.floors.findIndex((f) => f.id === floorId);
      if (index >= 0 && index !== p.active) act.switchFloor(index);
    }
    const sc = this.scene();
    const pad = Math.max(2.4, Math.max(room.w, room.h) * 0.45);
    const rect = { x: room.x - pad, y: room.y - pad, w: room.w + pad * 2, h: room.h + pad * 2 };
    const box = sc.focusBox({ floor: floorId, rect });
    if (!box) return;
    const v = this.host.view;
    const pad2 = 16;
    const aw = Math.max(40, v.w - pad2 * 2);
    const ah = Math.max(40, v.h - pad2 * 2);
    const b = aspectRect(box, aw / ah);
    v.zoom = clamp(aw / b.w, 1, 140);
    v.ox = pad2 - b.x * v.zoom;
    v.oy = pad2 - b.y * v.zoom;
    this.host.syncZoom();
    this.host.requestRender();
  }
}
