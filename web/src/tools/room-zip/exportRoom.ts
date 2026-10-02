/**
 * 工具資料 → CCFOLIA 房間資料 `__data.json`（規格 3.2；格式與預設值一律用 `@/ccfolia` 的 createRoom 等）。
 * 也包含 KP 用棋子的聊天面板組成（3.2.10）。不依賴 React，單元測試以附件 Z01～Z11 逐值比對。
 */
import {
  type CcfoliaMarker,
  type CcfoliaRoomData,
  centerToTopLeft,
  createScene as createCcfoliaScene,
  createEffect,
  createItem,
  createMarker,
  createRoom,
  createRoomCharacter,
  createRoomData,
  crossfadeFlag,
  gridLength,
} from '@/ccfolia';
import { effectivePart, effectRect, type MaterialLookup } from './geometry';
import {
  type Cutin,
  KP_TEXT,
  type KpSettings,
  NAMES,
  newEntityId,
  type Piece,
  type Project,
  type RoomDesign,
  type Scene,
  toNumber,
} from './model';

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

/** 中心座標的物件 → マーカーパネル */
function markerFrom(o: {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  text?: string;
  imageUrl: string | null;
}): CcfoliaMarker {
  const r = centerToTopLeft({ x: o.x, y: o.y, width: o.width, height: o.height });
  const z = toNumber(o.z, 2);
  return createMarker({ ...r, z, text: o.text || '', imageUrl: o.imageUrl || null });
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

/** 棋子 → キャラクター（3.1.7、3.2.10；差分以 { label, iconUrl } 寫出，第 7 節裁定 D1） */
function characterFrom(p: Piece, i: number) {
  const status = [];
  if (filled(p.hp)) {
    const v = toNumber(p.hp, 0);
    status.push({ label: 'HP', value: v, max: v });
  }
  if (filled(p.mp)) {
    const v = toNumber(p.mp, 0);
    status.push({ label: 'MP', value: v, max: v });
  }
  return createRoomCharacter({
    name: p.name || NAMES.pieceNumbered(i + 1),
    memo: p.memo || '',
    status,
    iconUrl: p.iconUrl || null,
    faces: p.faces.map((f) => ({ label: f.label, iconUrl: f.iconUrl || null })),
    commands: p.commands || '',
    order: i + 1,
  });
}

/**
 * 組出 `__data.json`（resources 由 `buildRoomZip` 依引用重建）。
 * - room：背景、前景、盤面寬高；markers＝可見、有圖的共用標記（清單順序）；sceneId＝第一個場景。
 * - items：可見、有圖的螢幕面板（場景差異不影響）。
 * - scenes：依清單順序；markers＝共用標記（套用差異、被隱藏的不輸出）＋立繪與演出（有圖或有文字）＋空白演出格。
 * - characters：棋子；effects：有名稱或有圖的切入；notes 一律空（第 7 節 D14）。
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

  const roomMarkers: Record<string, CcfoliaMarker> = {};
  for (const p of markerParts) roomMarkers[p.id] = markerFrom(p);

  const items: Record<string, ReturnType<typeof createItem>> = {};
  panelParts.forEach((p, i) => {
    const r = centerToTopLeft(p);
    items[p.id] = createItem({
      ...r,
      z: toNumber(p.z, 2),
      memo: p.text || '',
      imageUrl: p.imageUrl,
      order: i + 1,
    });
  });

  const scenes: Record<string, ReturnType<typeof createCcfoliaScene>> = {};
  project.scenes.forEach((s, i) => {
    const markers: Record<string, CcfoliaMarker> = {};
    for (const p of markerParts) {
      const e = effectivePart(p, s);
      if (e.hidden) continue;
      markers[p.id] = markerFrom({ ...e, text: p.text, imageUrl: e.imageUrl });
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
      });
    }
    for (const b of noimageMarkers(room, settings, newId)) markers[b.id] = b.marker;
    scenes[s.id] = createCcfoliaScene({
      name: s.name || NAMES.sceneNumbered(i + 1),
      order: i + 1,
      backgroundUrl: sceneBackgroundUrl(s, room),
      foregroundUrl: s.foregroundUrl || null,
      fieldObjectFit: s.autoCrop ? 'cover' : 'fill',
      fieldWidth: gridLength(toNumber(s.fieldWidth, fw), fw),
      fieldHeight: gridLength(toNumber(s.fieldHeight, fh), fh),
      displayGrid: s.displayGrid === true,
      gridSize: 1,
      markers,
      text: sceneText(s, project.cutins),
    });
  });

  const characters: Record<string, ReturnType<typeof createRoomCharacter>> = {};
  project.pieces.forEach((p, i) => {
    characters[p.id] = characterFrom(p, i);
  });

  const effects: Record<string, ReturnType<typeof createEffect>> = {};
  project.cutins
    .filter((c) => c.name || c.imageUrl)
    .forEach((c, i) => {
      effects[c.id] = createEffect({
        name: c.name || NAMES.cutinNumbered(i + 1),
        order: i + 1,
        imageUrl: c.imageUrl || null,
        playTime: now,
      });
    });

  return createRoomData({
    room: createRoom({
      backgroundUrl: room.backgroundUrl || null,
      foregroundUrl: room.foregroundUrl || null,
      fieldWidth: fw,
      fieldHeight: fh,
      markers: roomMarkers,
      sceneId: project.scenes[0]?.id ?? null,
      hidden3dDice: room.legacyDice === true,
      displayGrid: false,
      enableCrossfade: crossfadeFlag(room.bgmCrossfade !== false),
    }),
    items,
    notes: {},
    characters,
    effects,
    scenes,
  });
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
