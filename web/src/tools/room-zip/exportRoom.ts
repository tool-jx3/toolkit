/**
 * 工具資料 → CCFOLIA 房間資料 `__data.json`（規格 3.2；格式與預設值一律用 `@/ccfolia` 的 createRoom 等）。
 * 也包含 KP 用棋子的聊天面板組成（3.2.10）。不依賴 React，單元測試以附件 Z01～Z11 逐值比對。
 */
import {
  type CcfoliaMarker,
  type CcfoliaNote,
  type CcfoliaRoomData,
  type CcfoliaStatus,
  createScene as createCcfoliaScene,
  createEffect,
  createItem,
  createMarker,
  createNote,
  createRoom,
  createRoomCharacter,
  createRoomData,
  crossfadeFlag,
  type GridRect,
  gridLength,
  ROOM_META_VERSION,
} from '@/ccfolia';
import { effectivePart, effectRect, type MaterialLookup } from './geometry';
import {
  type Cutin,
  type Extra,
  KP_TEXT,
  type KpSettings,
  NAMES,
  newEntityId,
  type Piece,
  type Project,
  type RoomDesign,
  type RoomKeep,
  type Scene,
  toNumber,
} from './model';
import { exportRect } from './rect';
import { OWNED } from './roomFields';

/** 匯出時用到的工具設定（空白演出格） */
export interface ExportSettings {
  noimage: boolean;
  noimageCount: number;
  noimageZ: number;
}

export interface ExportOptions {
  find: MaterialLookup;
  settings: ExportSettings;
  /** カットイン的 playTime（毫秒；預設現在） */
  now?: number;
  /** 空白演出格的 id（預設 newEntityId） */
  newId?: () => string;
}

/** 場景的背景（3.2.3）：沿用房間背景／與前景相同（場景沒有前景時用房間前景）／個別素材／沒有背景 */
export function sceneBackgroundUrl(scene: Scene, room: RoomDesign): string | null {
  switch (scene.backgroundMode) {
    case 'none':
      return null;
    case 'foreground':
      return scene.foregroundUrl || room.foregroundUrl || null;
    case 'image':
      return scene.backgroundUrl || null;
    default:
      return room.backgroundUrl || null;
  }
}

/** 場景指定的切入（存在才算） */
export function sceneCutin(scene: Scene, cutins: readonly Cutin[]): Cutin | undefined {
  return scene.cutinId ? cutins.find((c) => c.id === scene.cutinId) : undefined;
}

/**
 * 切換時文字（3.2.9）：指定了切入且該切入有名稱時，「@切入名稱」一行，接著換行與切換時文字；
 * 沒有切入時就是切換時文字本身。例：切入「A」＋「開場」→ `@A\n開場`；只有切入 → `@A`。
 */
export function sceneText(scene: Scene, cutins: readonly Cutin[]): string {
  const c = sceneCutin(scene, cutins);
  const body = scene.text || '';
  if (!c?.name) return body;
  return `@${c.name}${body ? `\n${body}` : ''}`;
}

/**
 * 讀入的物件：工具管理的欄位（owned）取生成的值，其餘欄位照讀入時原樣（extra）；原檔沒有的欄位不補預設值（3.7.2、R3）。
 * 不是讀入的物件（沒有 extra）原樣不動。
 */
function withExtra<T extends object>(
  base: T,
  extra: Extra | undefined,
  owned: readonly string[],
): T {
  if (!extra) return base;
  const mine = Object.entries(base).filter(([k]) => owned.includes(k));
  const rest = Object.entries(extra).filter(([k]) => k !== '__proto__' && !owned.includes(k));
  return Object.fromEntries([...mine, ...rest]) as T;
}

/**
 * 一類物件的 `order`（3.7.2）：讀入的物件相對順序沒變就維持原值，新增的接在最大值後面，不重複；
 * 相對順序變了（或原值不能用）就整類重排成 1、2、3…（跳過 reserved，那是原樣保留的同類項目用掉的）。
 * 沒有讀入的物件（都沒有原值）時就是 1、2、3…。
 */
export function assignOrders(origs: readonly unknown[], reserved: Iterable<number> = []): number[] {
  const used = new Set<number>(reserved);
  const out: (number | undefined)[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const o of origs) {
    if (typeof o === 'number' && Number.isFinite(o) && !used.has(o)) {
      if (o <= last) return renumber(origs.length, reserved);
      out.push(o);
      used.add(o);
      last = o;
    } else out.push(undefined);
  }
  let next = 1;
  for (const u of used) next = Math.max(next, Math.floor(u) + 1);
  return out.map((o) => o ?? next++);
}

function renumber(n: number, reserved: Iterable<number>): number[] {
  const skip = new Set(reserved);
  const out: number[] = [];
  let c = 1;
  for (let i = 0; i < n; i++) {
    while (skip.has(c)) c++;
    out.push(c++);
  }
  return out;
}

/** 原樣保留的同類項目用掉的 order */
const keptOrders = (keep: RoomKeep | undefined, kind: string): number[] =>
  Object.values(keep?.entities?.[kind] ?? {}).flatMap((o) =>
    isObj(o) && typeof o.order === 'number' && Number.isFinite(o.order) ? [o.order] : [],
  );

/** 中心座標的物件 → マーカーパネル（讀入的位置沒改過就用原始左上角，3.7.4） */
function markerFrom(o: {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  text?: string;
  imageUrl: string | null;
  extra?: Extra;
  origin?: GridRect;
}): CcfoliaMarker {
  const r = exportRect({ x: o.x, y: o.y, width: o.width, height: o.height }, o.origin);
  const z = toNumber(o.z, 2);
  return withExtra(
    createMarker({ ...r, z, text: o.text || '', imageUrl: o.imageUrl || null }),
    o.extra,
    OWNED.marker,
  );
}

/** 空白演出格（3.2.8）：每個場景最後追加 N 個，中心 (0,0)、房間的盤面寬高、堆疊順序依序 +1 */
function noimageMarkers(room: RoomDesign, s: ExportSettings, newId: () => string) {
  if (!s.noimage) return [];
  const n = Math.max(1, Math.min(3, Math.round(toNumber(s.noimageCount, 1)) || 1));
  const z = toNumber(s.noimageZ, 45) || 45;
  return Array.from({ length: n }, (_, i) => ({
    id: newId(),
    marker: markerFrom({
      x: 0,
      y: 0,
      width: room.fieldWidth,
      height: room.fieldHeight,
      z: z + i,
      imageUrl: null,
    }),
  }));
}

const filled = (v: string): boolean => v != null && String(v).trim() !== '';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 讀入時的完整狀態列和 HP、MP 欄合併（3.7.6）：欄位沒改過維持原樣，改過了寫成 { value, max } 同值，空白就拿掉 */
function mergeStatus(raw: readonly unknown[], hp: string, mp: string): unknown[] {
  const value = { HP: hp, MP: mp };
  const done = { HP: false, MP: false };
  const out: unknown[] = [];
  for (const s of raw) {
    const label = isObj(s) ? s.label : undefined;
    if ((label === 'HP' || label === 'MP') && isObj(s) && !done[label]) {
      done[label] = true;
      if (!filled(value[label])) continue;
      const v = toNumber(value[label], 0);
      const current = typeof s.max === 'number' ? s.max : s.value;
      out.push(current === v ? s : { ...s, value: v, max: v });
      continue;
    }
    out.push(s);
  }
  const added: CcfoliaStatus[] = [];
  for (const label of ['HP', 'MP'] as const) {
    if (done[label] || !filled(value[label])) continue;
    const v = toNumber(value[label], 0);
    added.push({ label, value: v, max: v });
  }
  return [...added, ...out];
}

/** 棋子 → キャラクター（3.1.7、3.2.10；差分以 { label, iconUrl } 寫出，第 7 節裁定 D1；讀入的欄位原樣加上，3.7.6） */
function characterFrom(p: Piece, i: number, order: number) {
  const { status: rawStatus, ...rest } = p.extra ?? {};
  const status = Array.isArray(rawStatus) ? mergeStatus(rawStatus, p.hp, p.mp) : [];
  if (!Array.isArray(rawStatus)) {
    if (filled(p.hp)) {
      const v = toNumber(p.hp, 0);
      status.push({ label: 'HP', value: v, max: v });
    }
    if (filled(p.mp)) {
      const v = toNumber(p.mp, 0);
      status.push({ label: 'MP', value: v, max: v });
    }
  }
  const out = withExtra(
    createRoomCharacter({
      name: p.name || NAMES.pieceNumbered(i + 1),
      memo: p.memo || '',
      status: status as CcfoliaStatus[],
      iconUrl: p.iconUrl || null,
      faces: p.faces.map((f) =>
        withExtra({ label: f.label, iconUrl: f.iconUrl || null }, f.extra, OWNED.face),
      ),
      commands: p.commands || '',
      order,
    }),
    p.extra ? rest : undefined,
    [...OWNED.piece, 'order', 'status'],
  );
  /* 原檔沒有狀態欄、現在也沒有 HP／MP：不補空的狀態欄 */
  if (p.extra && !Object.hasOwn(p.extra, 'status') && !status.length) delete (out as Obj).status;
  return out;
}

/** 讀入時保留的資料寫回（3.7.8）：生成的優先，沒有的才補上；不認得的類別整個放回去 */
function applyKeep(data: CcfoliaRoomData, keep: RoomKeep | undefined): CcfoliaRoomData {
  if (!keep) return data;
  const entities = data.entities as unknown as Record<string, Record<string, unknown>>;
  for (const [kind, raw] of Object.entries(keep.entities ?? {})) {
    if (kind === '__proto__') continue;
    entities[kind] = isObj(entities[kind]) && isObj(raw) ? { ...raw, ...entities[kind] } : raw;
  }
  if (keep.meta) {
    const version = typeof keep.meta.version === 'string' ? keep.meta.version : ROOM_META_VERSION;
    data.meta = { ...keep.meta, version };
  }
  return data;
}

/**
 * 組出 `__data.json`（resources 由 `buildRoomZip` 依引用重建）。
 * - room：背景、前景、盤面寬高；markers＝可見、有圖的共用標記（清單順序）；sceneId＝第一個場景。
 * - items：可見、有圖的螢幕面板（場景差異不影響）。
 * - scenes：依清單順序；markers＝共用標記（套用差異、被隱藏的不輸出）＋立繪與演出（有圖或有文字）＋空白演出格。
 * - characters：棋子；effects：有名稱或有圖的切入；notes 一律空（第 7 節 D14；讀入的房間 ZIP 裡的劇本文字例外，見 3.7.8）。
 * - 讀入的房間 ZIP 帶來的 extra、origin、keep 原樣寫回（3.7）；沒有這些欄位的專案輸出和以前完全相同。
 */
export function buildRoomData(project: Project, opts: ExportOptions): CcfoliaRoomData {
  const { find, settings } = opts;
  const now = opts.now ?? Date.now();
  const newId = opts.newId ?? newEntityId;
  const room = project.room;
  const fw = gridLength(toNumber(room.fieldWidth, 40), 40);
  const fh = gridLength(toNumber(room.fieldHeight, 30), 30);
  /* 沒有圖的部件、顯示關閉的部件完全不輸出（3.2.4） */
  const markerParts = project.parts.filter((p) => p.kind === 'marker' && p.visible && p.imageUrl);
  const panelParts = project.parts.filter((p) => p.kind === 'panel' && p.visible && p.imageUrl);

  const keep = project.keep;
  const roomMarkers: Record<string, CcfoliaMarker> = {};
  for (const p of markerParts) roomMarkers[p.key ?? p.id] = markerFrom(p);
  for (const [id, raw] of Object.entries(keep?.roomMarkers ?? {})) {
    if (!(id in roomMarkers)) roomMarkers[id] = raw as CcfoliaMarker;
  }

  const items: Record<string, ReturnType<typeof createItem>> = {};
  const itemOrders = assignOrders(
    panelParts.map((p) => p.extra?.order),
    keptOrders(keep, 'items'),
  );
  panelParts.forEach((p, i) => {
    const r = exportRect(p, p.origin);
    items[p.key ?? p.id] = withExtra(
      createItem({
        ...r,
        z: toNumber(p.z, 2),
        memo: p.text || '',
        imageUrl: p.imageUrl,
        order: itemOrders[i],
      }),
      p.extra,
      [...OWNED.item, 'order'],
    );
  });

  const scenes: Record<string, ReturnType<typeof createCcfoliaScene>> = {};
  const sceneOrders = assignOrders(project.scenes.map((s) => s.extra?.order));
  project.scenes.forEach((s, i) => {
    const markers: Record<string, CcfoliaMarker> = {};
    for (const p of markerParts) {
      const e = effectivePart(p, s);
      if (e.hidden) continue;
      markers[p.key ?? p.id] = markerFrom({
        ...e,
        text: p.text,
        imageUrl: e.imageUrl,
        extra: p.extra,
        origin: p.origin,
      });
    }
    for (const m of s.markers) {
      if (!m.imageUrl && !m.text) continue;
      const r = m.kind === 'tachie' ? m : effectRect(m, s, find);
      markers[m.id] = markerFrom({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        z: m.z,
        text: m.text,
        imageUrl: m.imageUrl,
        extra: m.extra,
        origin: m.kind === 'free' ? m.origin : undefined,
      });
    }
    for (const b of noimageMarkers(room, settings, newId)) markers[b.id] = b.marker;
    for (const [id, raw] of Object.entries(keep?.sceneMarkers?.[s.id] ?? {})) {
      if (!(id in markers)) markers[id] = raw as CcfoliaMarker;
    }
    scenes[s.id] = withExtra(
      createCcfoliaScene({
        name: s.name || NAMES.sceneNumbered(i + 1),
        order: sceneOrders[i],
        backgroundUrl: sceneBackgroundUrl(s, room),
        foregroundUrl: s.foregroundUrl || null,
        fieldObjectFit: s.autoCrop ? 'cover' : 'fill',
        fieldWidth: gridLength(toNumber(s.fieldWidth, fw), fw),
        fieldHeight: gridLength(toNumber(s.fieldHeight, fh), fh),
        displayGrid: s.displayGrid === true,
        gridSize: 1,
        markers,
        text: sceneText(s, project.cutins),
      }),
      s.extra,
      [...OWNED.scene, 'order'],
    );
  });

  const characters: Record<string, ReturnType<typeof createRoomCharacter>> = {};
  const pieceOrders = assignOrders(project.pieces.map((p) => p.extra?.order));
  project.pieces.forEach((p, i) => {
    characters[p.id] = characterFrom(p, i, pieceOrders[i]);
  });

  const effects: Record<string, ReturnType<typeof createEffect>> = {};
  const outCutins = project.cutins.filter((c) => c.name || c.imageUrl);
  const cutinOrders = assignOrders(
    outCutins.map((c) => c.extra?.order),
    keptOrders(keep, 'effects'),
  );
  outCutins.forEach((c, i) => {
    effects[c.id] = withExtra(
      createEffect({
        name: c.name || NAMES.cutinNumbered(i + 1),
        order: cutinOrders[i],
        imageUrl: c.imageUrl || null,
        playTime: now,
      }),
      c.extra,
      [...OWNED.cutin, 'order'],
    );
  });

  /* 劇本文字：讀入的（有 note 的）寫回成 notes；工具自己寫的不輸出（D14） */
  const notes: Record<string, CcfoliaNote> = {};
  const noteStories = project.story.filter((t) => t.note);
  const noteOrders = assignOrders(noteStories.map((t) => t.note?.order));
  noteStories.forEach((t, i) => {
    notes[t.id] = withExtra(
      createNote({ name: t.title, text: t.body, order: noteOrders[i] }),
      t.note,
      [...OWNED.note, 'order'],
    );
  });

  /* 套用中的場景：讀入時的那個場景還在就維持（讀入時是「沒有套用」也維持），否則第一個場景 */
  const first = project.scenes[0]?.id ?? null;
  const kept = room.extra && Object.hasOwn(room.extra, 'sceneId') ? room.extra.sceneId : undefined;
  const sceneId =
    kept === null
      ? null
      : typeof kept === 'string' && project.scenes.some((s) => s.id === kept)
        ? kept
        : first;

  const data = createRoomData({
    room: withExtra(
      createRoom({
        backgroundUrl: room.backgroundUrl || null,
        foregroundUrl: room.foregroundUrl || null,
        fieldWidth: fw,
        fieldHeight: fh,
        markers: roomMarkers,
        sceneId,
        hidden3dDice: room.legacyDice === true,
        displayGrid: false,
        enableCrossfade: crossfadeFlag(room.bgmCrossfade !== false),
      }),
      room.extra,
      [...OWNED.room, 'sceneId'],
    ),
    items,
    notes,
    characters,
    effects,
    scenes,
  });
  return applyKeep(data, keep);
}

/* ---------- KP 用棋子的聊天面板（3.2.10） ---------- */

/**
 * 組出 KP 用棋子的聊天面板：通用骰子與進行（CoC 時 `sCCB<=`／`sCC<=` 換成 s＋判定指令）、場景與切入、PC 區、敵方區、
 * 友方區、備忘——去頭尾空白後是空的段略過——以空一行接起來；最後接 KP 自己的技能（每個一行 `判定指令＋值 【技能名】`）。
 */
export function buildKpCommands(kp: KpSettings, pieces: readonly Piece[]): string {
  const sys = kp.system;
  const isCoc = sys === 'coc6' || sys === 'coc7';
  const check = kp.checkType || 'CCB<=';
  const tpl = kp.tpl[sys] ?? { main: '', scene: '', memo: '' };
  let enemy = KP_TEXT.enemyTitle;
  let ally = KP_TEXT.allyTitle;
  for (const c of pieces) {
    if (c.kind !== 'enemy' && c.kind !== 'ally') continue;
    const name = c.name || KP_TEXT.unnamed;
    let block = `\n${c.kind === 'enemy' ? KP_TEXT.enemyMark : KP_TEXT.allyMark}：${name}\n`;
    for (const sk of c.skills) {
      if (!filled(sk.name) && !filled(sk.value)) continue;
      const v = filled(sk.value) ? sk.value : '0';
      const label = sk.name || KP_TEXT.attack;
      block += isCoc ? `${check}${v} 【${label}】 @${name}\n` : `${v}DL 【${label}】 @${name}\n`;
      if (sk.damage) block += `${sk.damage} 【${KP_TEXT.damage}】 @${name}\n`;
    }
    if (!c.noDodge) {
      const dg = filled(c.dodge) ? c.dodge : '0';
      block += `${isCoc ? check + dg : `${dg}DL`} 【${KP_TEXT.dodge}】 @${name}\n`;
    }
    block += `:${name.replace(/\s+/g, '_')}_HP-1\n`;
    if (filled(c.armor)) block += `${KP_TEXT.armor}+${c.armor}\n`;
    if (c.memo) block += `★${c.memo}\n`;
    if (c.kind === 'enemy') enemy += block;
    else ally += block;
  }
  let pc = `${KP_TEXT.pcTitle}\n`;
  kp.pcs.forEach((nm, i) => {
    if (!nm) return;
    pc += `//HO${i + 1}=${nm}\n/var HO${i + 1} ${nm}\n`;
  });
  let main = tpl.main || '';
  if (isCoc) main = main.replace(/s(CCB|CC)<=/g, `s${check}`);
  let full = [
    main.trim(),
    (tpl.scene || '').trim(),
    pc.trim(),
    enemy,
    ally,
    (tpl.memo || '').trim(),
  ]
    .filter((x) => x.trim() !== '')
    .join('\n\n');
  const own = kp.skills
    .filter((x) => filled(x.name) && filled(x.value))
    .map((x) => `${check}${x.value} 【${x.name}】`)
    .join('\n');
  if (own) full = (full ? `${full}\n` : '') + own;
  return full;
}

/** 產生 KP 用棋子（F250）：寫進唯一的 KP 棋子（沒有就加在棋子清單最前面），回傳是不是新增的 */
export function applyKpPiece(project: Project, createKp: () => Piece): boolean {
  const commands = buildKpCommands(project.kp, project.pieces);
  let kp = project.pieces.find((p) => p.kind === 'kp');
  const created = !kp;
  if (!kp) {
    kp = createKp();
    project.pieces.unshift(kp);
  }
  kp.commands = commands;
  return created;
}
