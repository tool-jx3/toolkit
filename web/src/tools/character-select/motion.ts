/**
 * 選擇的時間軸與路徑（規格 3.1、3.3、3.4、3.7，純函式）：目標的重複處理、自動與自行指定的路徑、
 * 某個時間點的狀態、主格的內容、動畫檔與影片的影格表。時間一律以毫秒計。
 */
import { clamp, lerp } from '@/core/timeline';
import { type Box, tileRects, visibleCount } from './layout';
import { MAX_WAYPOINTS, playbackPlayers, type Settings } from './model';

export { playbackPlayers };

/* ---------- 目標 ---------- */

/**
 * 目標夾在 0～角色數−1；不可重複時依播放順序（剛改的玩家排第一）把撞到的目標換成下一個沒人選的角色。
 * 直接改草稿。
 */
export function normalizeTargets(d: Settings, changedPlayer = -1): void {
  const count = Math.max(1, d.characters.length);
  const T = d.players.targets;
  for (let i = 0; i < T.length; i++) {
    const v = clamp(Math.round(Number(T[i]) || 0), 0, count - 1);
    if (T[i] !== v) T[i] = v;
  }
  if (d.players.allowDuplicate || !d.characters.length) return;
  const used = new Set<number>();
  const active = playbackPlayers(d);
  const order = active.includes(changedPlayer)
    ? [changedPlayer, ...active.filter((p) => p !== changedPlayer)]
    : active;
  const n = d.characters.length;
  for (const player of order) {
    let target = T[player];
    if (used.has(target)) {
      let candidate = target;
      for (let step = 1; step <= n; step++) {
        const test = (target + step) % n;
        if (!used.has(test)) {
          candidate = test;
          break;
        }
      }
      target = candidate;
      T[player] = target;
    }
    used.add(target);
  }
}

/** 存著的中繼點去掉「等於目標」與「與前一個相同」的點 */
export function normalizeStoredPaths(d: Settings): void {
  for (let p = 0; p < d.players.paths.length; p++) {
    const target = d.players.targets[p];
    const src = Array.isArray(d.players.paths[p]) ? d.players.paths[p] : [];
    const out: number[] = [];
    for (const i of src) {
      if (i === target || out[out.length - 1] === i) continue;
      out.push(i);
    }
    if (out.length !== src.length || out.some((v, k) => v !== src[k])) d.players.paths[p] = out;
  }
}

/** 角色不夠的問題（依序、不可重複、畫面上的角色比人數少）；沒問題時 null */
export function selectionIssue(s: Settings): { visible: number; players: number } | null {
  const visible = visibleCount(s);
  return s.players.selectionMode === 'sequence' &&
    !s.players.allowDuplicate &&
    visible > 0 &&
    s.players.count > visible
    ? { visible, players: s.players.count }
    : null;
}

/* ---------- 角色排序、複製、刪除時玩家的設定跟著角色走 ---------- */

export interface CharacterRefs {
  targetIndices: number[];
  targetIds: (string | null)[];
  startIds: (string | null)[];
  pathIds: (string | null)[][];
}

/** 改角色清單之前記下玩家設定指到的角色 id */
export function captureRefs(d: Settings): CharacterRefs {
  const idAt = (i: number | null) => (i === null ? null : (d.characters[i]?.id ?? null));
  return {
    targetIndices: [...d.players.targets],
    targetIds: d.players.targets.map(idAt),
    startIds: d.players.starts.map(idAt),
    pathIds: d.players.paths.map((p) => (Array.isArray(p) ? p : []).map(idAt)),
  };
}

/**
 * 改完角色清單之後依 id 找回位置：目標找不到時用原本的位置（夾在範圍內）、起始游標找不到時變回隨機、
 * 中繼點找不到就拿掉。之後要再 sanitize。
 */
export function remapRefs(d: Settings, refs: CharacterRefs): void {
  const indexOf = (id: string | null) => (id ? d.characters.findIndex((c) => c.id === id) : -1);
  const max = Math.max(0, d.characters.length - 1);
  d.players.targets = refs.targetIds.map((id, p) => {
    const found = indexOf(id);
    return found >= 0 ? found : clamp(refs.targetIndices[p] || 0, 0, max);
  });
  d.players.starts = refs.startIds.map((id) => {
    const found = indexOf(id);
    return found >= 0 ? found : null;
  });
  d.players.paths = refs.pathIds.map((path) => path.map(indexOf).filter((i) => i >= 0));
}

/* ---------- 時間軸 ---------- */

/** 總長（毫秒） */
export function timelineDuration(s: Pick<Settings, 'animation' | 'players'>): number {
  const a = s.animation;
  return (
    a.initialHold + playbackPlayers(s).length * (a.searchDuration + a.confirmDuration) + a.endHold
  );
}

/** 第 order 位玩家「確定演出」開始的時間（毫秒） */
export function confirmStartTime(s: Pick<Settings, 'animation'>, order: number): number {
  const a = s.animation;
  return a.initialHold + order * (a.searchDuration + a.confirmDuration) + a.searchDuration;
}

/* ---------- 路徑 ---------- */

type PathInput = Pick<Settings, 'players' | 'animation'>;

/** 起點：有指定起始游標時用它，否則依玩家編號與目標算 */
export function automaticStart(
  s: PathInput,
  player: number,
  target: number,
  count: number,
): number {
  if (count <= 1) return 0;
  const configured = s.players.starts[player];
  if (configured !== null && configured !== undefined)
    return clamp(Math.round(Number(configured) || 0), 0, count - 1);
  const hops = clamp(Math.round(s.animation.hops), 0, 10);
  let start = (player * 2 + Math.max(0, target - hops - 1)) % count;
  if (start < 0) start += count;
  return start;
}

/** 去掉連續重複的點，結尾不是目標時補上目標 */
export function compactPath(path: readonly number[], target: number, count: number): number[] {
  const out: number[] = [];
  for (const raw of path) {
    const i = clamp(Math.round(Number(raw) || 0), 0, Math.max(0, count - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  if (!out.length) out.push(clamp(target, 0, Math.max(0, count - 1)));
  if (out[out.length - 1] !== target) out.push(target);
  return out;
}

/** 自動路徑 */
export function automaticPath(
  s: PathInput,
  player: number,
  target: number,
  count: number,
): number[] {
  if (count <= 1) return [0];
  const hops = clamp(Math.round(s.animation.hops), 0, 10);
  const start = automaticStart(s, player, target, count);
  const path = [start];
  for (let step = 0; step < hops; step++) {
    let candidate = (start + (step + 1) * (player + 2) + step * step + 1) % count;
    if (candidate === target && step < hops - 1) candidate = (candidate + 1) % count;
    if (candidate === path[path.length - 1]) candidate = (candidate + 1) % count;
    path.push(candidate);
  }
  return compactPath(path, target, count);
}

/** 這位玩家實際的路徑（自動或自行指定） */
export function selectionPath(
  s: PathInput,
  player: number,
  rawTarget: number,
  count: number,
): number[] {
  if (count <= 1) return [0];
  const target = clamp(Math.round(Number(rawTarget) || 0), 0, count - 1);
  if (s.players.pathModes[player] !== 'custom') return automaticPath(s, player, target, count);
  const start = automaticStart(s, player, target, count);
  const waypoints = Array.isArray(s.players.paths[player]) ? s.players.paths[player] : [];
  return compactPath([start, ...waypoints.slice(0, MAX_WAYPOINTS)], target, count);
}

/** 「固定目前的自動路徑」：自動路徑的起點與中途的點 */
export function capturedPath(
  s: PathInput,
  player: number,
  target: number,
  count: number,
): { start: number | null; waypoints: number[] } {
  const path = automaticPath(s, player, target, count);
  return { start: path[0] ?? null, waypoints: path.slice(1, -1) };
}

/** 「＋ 中繼點」：上一個點的下一個角色（跳過目標與上一個點）；加不了時 null */
export function nextWaypoint(s: PathInput, player: number, count: number): number | null {
  if (!count) return null;
  const path = s.players.paths[player] ?? [];
  if (path.length >= MAX_WAYPOINTS) return null;
  const target = clamp(s.players.targets[player] || 0, 0, count - 1);
  const start = automaticStart(s, player, target, count);
  const previous = path.length ? path[path.length - 1] : start;
  let candidate = (previous + 1) % count;
  for (let step = 0; step < count; step++) {
    if (candidate !== target && candidate !== previous) break;
    candidate = (candidate + 1) % count;
  }
  if (candidate === target && count <= 1) return null;
  return candidate;
}

/* ---------- 某個時間點的狀態 ---------- */

export interface Scene {
  locked: { player: number; target: number }[];
  /** 正在選的玩家（沒有時 −1） */
  activePlayer: number;
  /** 游標所在的格子（沒有時 −1） */
  hoverIndex: number;
  cursorRect: Box | null;
  /** 確定演出的進度 0～1 */
  confirmProgress: number;
  final: boolean;
  waiting?: boolean;
  confirming?: boolean;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function lerpBox(a: Box | undefined, b: Box | undefined, t: number): Box | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
}

/** t 毫秒時的狀態（規格 3.4） */
export function sceneAt(s: Settings, rawTime: number): Scene {
  const rects = tileRects(s);
  const count = rects.length;
  const a = s.animation;
  const duration = Math.max(1, timelineDuration(s));
  let time = clamp(rawTime, 0, duration);
  const locked: Scene['locked'] = [];
  if (!count)
    return {
      locked,
      activePlayer: -1,
      hoverIndex: -1,
      cursorRect: null,
      confirmProgress: 0,
      final: true,
    };
  const players = playbackPlayers(s);
  if (time < a.initialHold) {
    const first = players[0];
    const target = clamp(s.players.targets[first] || 0, 0, count - 1);
    const cursor = selectionPath(s, first, target, count)[0] ?? target;
    return {
      locked,
      activePlayer: first,
      hoverIndex: cursor,
      cursorRect: rects[cursor],
      confirmProgress: 0,
      final: false,
      waiting: true,
    };
  }
  time -= a.initialHold;
  for (const player of players) {
    const target = clamp(s.players.targets[player] || 0, 0, count - 1);
    if (time < a.searchDuration) {
      const progress = clamp(time / Math.max(1, a.searchDuration), 0, 1);
      const path = selectionPath(s, player, target, count);
      if (path.length === 1)
        return {
          locked,
          activePlayer: player,
          hoverIndex: target,
          cursorRect: rects[target],
          confirmProgress: 0,
          final: false,
        };
      const position = progress * (path.length - 1);
      const segment = Math.min(path.length - 2, Math.floor(position));
      const local = easeInOutCubic(position - segment);
      const from = path[segment];
      const to = path[segment + 1];
      return {
        locked,
        activePlayer: player,
        hoverIndex: local > 0.45 ? to : from,
        cursorRect: lerpBox(rects[from], rects[to], local),
        confirmProgress: 0,
        final: false,
      };
    }
    time -= a.searchDuration;
    if (time < a.confirmDuration) {
      return {
        locked,
        activePlayer: player,
        hoverIndex: target,
        cursorRect: rects[target],
        confirmProgress: clamp(time / Math.max(1, a.confirmDuration), 0, 1),
        confirming: true,
        final: false,
      };
    }
    time -= a.confirmDuration;
    locked.push({ player, target });
  }
  return {
    locked,
    activePlayer: -1,
    hoverIndex: -1,
    cursorRect: null,
    confirmProgress: 1,
    final: true,
  };
}

/** 主格的內容：每格一個（玩家、角色）或 null */
export function mainPanelSelections(
  s: Settings,
  scene: Scene,
): ({ player: number; target: number } | null)[] {
  const out: ({ player: number; target: number } | null)[] = Array(s.mainPanel.count).fill(null);
  const players = playbackPlayers(s);
  const place = (sel: { player: number; target: number }) => {
    const order = players.indexOf(sel.player);
    if (order >= 0) out[order % out.length] = sel;
  };
  for (const l of scene.locked) place(l);
  if (
    scene.activePlayer >= 0 &&
    scene.hoverIndex >= 0 &&
    (scene.confirming || (s.mainPanel.reveal === 'hover' && !scene.waiting))
  )
    place({ player: scene.activePlayer, target: scene.hoverIndex });
  return out;
}

/* ---------- 影格表 ---------- */

export interface PlannedFrame {
  /** 畫的時間（毫秒） */
  time: number;
  /** 顯示多久（毫秒） */
  delay: number;
}

/** 圖片（APNG、WebP）的影格表（規格 3.7） */
export function framePlan(s: Pick<Settings, 'animation' | 'players'>, fps: number): PlannedFrame[] {
  const interval = 1000 / Math.max(1, fps);
  const a = s.animation;
  const plan: PlannedFrame[] = [];
  let cursor = 0;
  if (a.initialHold > 0) {
    plan.push({ time: 0, delay: a.initialHold });
    cursor += a.initialHold;
  }
  for (const _ of playbackPlayers(s)) {
    for (const duration of [a.searchDuration, a.confirmDuration]) {
      let elapsed = 0;
      while (elapsed < duration - 0.01) {
        const delay = Math.min(interval, duration - elapsed);
        plan.push({ time: cursor + elapsed + 0.01, delay });
        elapsed += delay;
      }
      cursor += duration;
    }
  }
  plan.push({ time: cursor + 0.01, delay: Math.max(20, a.endHold) });
  return plan;
}

/** GIF 的影格表：以 min(50, FPS) 切格，再以 1/100 秒累計合併太短（< 2/100 秒）的格 */
export function gifFramePlan(
  s: Pick<Settings, 'animation' | 'players'>,
  fps: number,
): PlannedFrame[] {
  const frames = framePlan(s, Math.min(50, fps));
  const out: PlannedFrame[] = [];
  let elapsed = 0;
  let written = 0;
  for (const f of frames) {
    elapsed += f.delay;
    const end = Math.round(elapsed / 10);
    if (end - written < 2) continue;
    out.push({ time: f.time, delay: (end - written) * 10 });
    written = end;
  }
  const remainder = Math.round(elapsed / 10) - written;
  if (out.length) out[out.length - 1].delay += remainder * 10;
  else out.push({ time: 0, delay: Math.max(20, Math.round(elapsed / 10) * 10) });
  return out;
}

/** 影片（MP4、AVI）的影格：⌈T × FPS ÷ 1000⌉ 格，第 i 格在 i × 1000 ÷ FPS 毫秒 */
export function videoFramePlan(
  s: Pick<Settings, 'animation' | 'players'>,
  fps: number,
): PlannedFrame[] {
  const n = Math.max(1, Math.ceil((timelineDuration(s) * fps) / 1000));
  return Array.from({ length: n }, (_, i) => ({ time: (i * 1000) / fps, delay: 1000 / fps }));
}
