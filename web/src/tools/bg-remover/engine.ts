/**
 * 目前這張的處理狀態（不放進 React state 的大型緩衝區）、AI 去背的排程、筆刷、匯出。
 *
 * 目前這張依序算（每一步都有快取鍵，只重算變了的部分；同時只跑一輪，期間的變更跑完再補一輪）：
 *   原圖（解碼）→ 基礎遮罩（AI 遮罩或色鍵）→ 去色邊後的顏色 → 邊緣調整 → 筆刷 → 預覽
 */
import { create } from 'zustand';
import { parseColor } from '@/core/color';
import { type DiagnosticItem, diagnosticText, errorText, fileFields } from '@/core/diagnostics';
import { uniqueFileName } from '@/core/files';
import { type Mask, StrokePainter } from '@/core/image';
import { ModelError } from '@/core/models';
import {
  createOnnxClient,
  ONNX_BACKEND_LABELS,
  type OnnxBackend,
  type OnnxClient,
  OnnxError,
} from '@/core/onnx';
import type { ExportBatchOutput, ExportContext, ExportOutput } from '@/ui';
import { MODEL_INPUT, MODEL_OUTPUT, MODEL_SIZE } from './animeSeg';
import {
  effectiveBackground,
  type FillStroke,
  type ImageItem,
  isFillTool,
  modelSpec,
  type OutFormat,
  outputName,
  roundPoint,
  type Settings,
  type StoredStroke,
} from './model';
import { type KeyParams, MIME, type SourceImage } from './pipeline';
import { createPixelClient, type FillPreview, NeedsAiError } from './pixels';
import {
  assets,
  currentItem,
  type PreviewState,
  previewNow,
  settingsNow,
  step,
  usePreview,
  useSettings,
} from './store';
import { S } from './strings';

export const pixels = createPixelClient();

/* ---------- 目前這張 ---------- */

export type WorkPhase = 'empty' | 'loading' | 'processing' | 'ready' | 'needs-ai' | 'error';

export interface AiRun {
  /** 第幾張（1 起）／共幾張 */
  index: number;
  total: number;
  /** 'model'：載入模型中；'infer'：推論中 */
  stage: 'model' | 'infer';
  startedAt: number;
}

export interface WorkState {
  phase: WorkPhase;
  /** 目前這張（清單項目的 id）與尺寸 */
  itemId: string | null;
  width: number;
  height: number;
  /** 純色：實際用的背景色與四邊的比例 */
  keyColor: string | null;
  keyRatio: number;
  error: string | null;
  /** 出錯時「複製錯誤資訊」的內容（整理好之前、沒有錯誤時是 null） */
  errorDetails: string | null;
  /** 遮罩或原圖換了就加一（預覽重畫） */
  tick: number;
  /** AI 去背進行中 */
  ai: AiRun | null;
  /** 推論實際使用的運算方式（開過模型後才有） */
  backend: OnnxBackend | null;
  backendFallback: boolean;
  /** 從圖上取背景色中 */
  picking: boolean;
}

export const useWork = create<WorkState>(() => ({
  phase: 'empty',
  itemId: null,
  width: 0,
  height: 0,
  keyColor: null,
  keyRatio: 1,
  error: null,
  errorDetails: null,
  tick: 0,
  ai: null,
  backend: null,
  backendFallback: false,
  picking: false,
}));

const bump = (patch: Partial<WorkState> = {}) =>
  useWork.setState((s) => ({ ...patch, tick: s.tick + 1 }));

/** 「複製錯誤資訊」的內容：處理方式、每個出錯的對象（例如檔案）、瀏覽器與裝置 */
export const detailsFor = (summary: string, items: DiagnosticItem[] = []): Promise<string> =>
  diagnosticText({
    tool: S.diag.tool,
    summary,
    fields: [[S.diag.backend, pixels.backend() === 'worker' ? S.diag.worker : S.diag.main]],
    items,
  });

/** 這張處理不下去：預覽顯示 error，再補上「複製錯誤資訊」的內容 */
async function fail(error: string, item: DiagnosticItem): Promise<void> {
  bump({ phase: 'error', error, errorDetails: null });
  const details = await detailsFor(error, [item]);
  const w = useWork.getState();
  if (w.phase === 'error' && w.error === error) useWork.setState({ errorDetails: details });
}

/** 目前這張的緩衝區 */
interface Buffers {
  itemId: string | null;
  asset: string | null;
  src: SourceImage | null;
  baseKey: string | null;
  base: Mask | null;
  bg: [number, number, number] | null;
  colorsKey: string | null;
  colors: Uint8ClampedArray<ArrayBuffer> | null;
  /** 去色邊開著時：Worker 記得這組顏色的鍵（原圖＋設定；預覽合成不必再傳一次顏色） */
  despillKey: string | null;
  refineKey: string | null;
  refined: Mask | null;
  /** final 已經畫進去的筆刷 */
  applied: readonly StoredStroke[] | null;
  final: Mask | null;
  /** 剛畫完、還沒寫進 store 的那一筆（寫進去後不必重播全部） */
  pending: StoredStroke | null;
}

const empty = (): Buffers => ({
  itemId: null,
  asset: null,
  src: null,
  baseKey: null,
  base: null,
  bg: null,
  colorsKey: null,
  colors: null,
  despillKey: null,
  refineKey: null,
  refined: null,
  applied: null,
  final: null,
  pending: null,
});

export const buf: Buffers = empty();
/** buf.final 每次換掉或畫上筆刷就加一（同色範圍預覽用：Worker 手上的遮罩是不是最新的） */
let maskVersion = 0;

export function keyParamsOf(s: Settings): KeyParams {
  const c = s.keyAuto ? null : parseColor(s.keyColor);
  return {
    color: c ? [c.r, c.g, c.b] : null,
    tolerance: s.tolerance,
    softness: s.softness,
    connected: s.connected,
  };
}

const hexOf = (c: readonly number[]) =>
  `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** next 是不是 applied 後面再加幾筆（是的話回傳加的那幾筆；只要從目前的遮罩接著畫） */
const appendedTo = (
  next: readonly StoredStroke[],
  applied: readonly StoredStroke[] | null,
): readonly StoredStroke[] | null =>
  applied && next.length > applied.length && applied.every((s, i) => next[i] === s)
    ? next.slice(applied.length)
    : null;

const sameStrokesPlusPending = (
  next: readonly StoredStroke[],
  applied: readonly StoredStroke[] | null,
  pending: StoredStroke | null,
) =>
  !!applied &&
  !!pending &&
  next.length === applied.length + 1 &&
  next[next.length - 1] === pending &&
  applied.every((s, i) => next[i] === s);

async function syncOnce(): Promise<void> {
  const s = settingsNow();
  const p = previewNow();
  const item = currentItem(s, p);
  if (!item) {
    Object.assign(buf, empty());
    bump({
      phase: 'empty',
      itemId: null,
      width: 0,
      height: 0,
      error: null,
      errorDetails: null,
      keyColor: null,
    });
    return;
  }
  /* 原圖 */
  if (buf.asset !== item.asset || !buf.src) {
    Object.assign(buf, empty());
    useWork.setState({ phase: 'loading', itemId: item.id, error: null, errorDetails: null });
    const blob = await assets.get(item.asset);
    if (!blob) {
      await fail(S.readFailed([item.name]), {
        title: item.name,
        fields: [['步驟', S.diag.missing]],
      });
      return;
    }
    try {
      const src = await pixels.load(item.asset, blob);
      buf.asset = item.asset;
      buf.src = src;
    } catch (e) {
      await fail(S.readFailed([item.name]), {
        title: item.name,
        fields: [
          ...fileFields(blob),
          ['尺寸', `${item.width} × ${item.height}`],
          ['步驟', S.diag.load],
          ['錯誤', errorText(e)],
        ],
      });
      return;
    }
  }
  buf.itemId = item.id;
  const src = buf.src!;
  useWork.setState({ itemId: item.id, width: src.width, height: src.height });
  /* 基礎遮罩 */
  const kp = keyParamsOf(s);
  const maskId = p.aiMasks[item.asset] ?? null;
  const baseKey =
    s.mode === 'ai'
      ? `ai:${maskId ?? ''}`
      : `color:${kp.color?.join(',') ?? 'auto'}:${kp.tolerance}:${kp.softness}:${kp.connected}`;
  if (buf.baseKey !== baseKey) {
    buf.colorsKey = buf.refineKey = null;
    buf.applied = null;
    if (s.mode === 'ai' && !maskId) {
      buf.baseKey = baseKey;
      buf.base = null;
      buf.bg = null;
      bump({ phase: 'needs-ai', keyColor: null });
      return;
    }
    useWork.setState({ phase: 'processing' });
    const blob = await assets.get(s.mode === 'ai' ? maskId! : item.asset);
    if (!blob) {
      if (s.mode === 'ai') {
        /* 遮罩不見了（例如儲存空間被清掉）：當成還沒去背 */
        usePreview.getState().update((d) => {
          delete d.aiMasks[item.asset];
        });
      }
      bump({ phase: s.mode === 'ai' ? 'needs-ai' : 'error', error: S.readFailed([item.name]) });
      return;
    }
    if (s.mode === 'ai') {
      const m = await pixels.decodeMask(blob);
      if (m.width !== src.width || m.height !== src.height) {
        bump({ phase: 'needs-ai' });
        return;
      }
      buf.base = m.mask;
      buf.bg = null;
      useWork.setState({ keyColor: null, keyRatio: 1 });
    } else {
      const r = await pixels.colorBase(item.asset, blob, kp);
      buf.base = r.mask;
      buf.bg = r.bg;
      useWork.setState({ keyColor: hexOf(r.bg), keyRatio: r.ratio });
    }
    buf.baseKey = baseKey;
  }
  if (!buf.base) {
    bump({ phase: 'needs-ai' });
    return;
  }
  /* 去色邊後的顏色 */
  const despill = s.mode === 'color' && s.despill && !!buf.bg;
  const colorsKey = `${baseKey}:${despill}`;
  if (buf.colorsKey !== colorsKey) {
    buf.despillKey = null;
    if (despill) {
      const blob = await assets.get(item.asset);
      /* Worker 記住這組顏色的鍵：哪一張圖＋哪一組設定 */
      const key = `${item.asset}|${colorsKey}`;
      buf.colors = blob ? await pixels.despill(item.asset, blob, buf.base, buf.bg!, key) : src.rgba;
      if (blob) buf.despillKey = key;
    } else {
      buf.colors = src.rgba;
    }
    buf.colorsKey = colorsKey;
  }
  /* 邊緣調整 */
  const refineKey = `${baseKey}:${s.grow}:${s.feather}`;
  if (buf.refineKey !== refineKey) {
    useWork.setState({ phase: 'processing' });
    buf.refined =
      s.grow || s.feather > 0
        ? await pixels.refine(buf.base, src.width, src.height, s.grow, s.feather)
        : buf.base;
    buf.refineKey = refineKey;
    buf.applied = null;
  }
  /* 筆刷 */
  const latest = currentItem();
  const strokes = latest?.id === item.id ? latest.strokes : item.strokes;
  if (buf.applied !== strokes) {
    if (!sameStrokesPlusPending(strokes, buf.applied, buf.pending) || !buf.final) {
      /* 只是後面多了幾筆（例如同色擦掉／補回）：從目前的遮罩接著畫；否則從邊緣調整後的遮罩全部重播 */
      const added = buf.final ? appendedTo(strokes, buf.applied) : null;
      const todo = added ?? strokes;
      const mask = new Uint8Array(added ? buf.final! : buf.refined!) as Mask;
      const blob = todo.length ? await assets.get(item.asset) : undefined;
      if (blob) {
        /* 重播（大圖、很多筆時要一陣子）在 Worker 裡做；同色擦掉／補回要用原圖的顏色 */
        useWork.setState({ phase: 'processing' });
        buf.final = await pixels.finalMask(item.asset, blob, mask, todo);
      } else {
        buf.final = mask;
      }
      maskVersion++;
    }
    buf.applied = strokes;
    buf.pending = null;
  }
  bump({ phase: 'ready', error: null, errorDetails: null });
}

let running = false;
let again = false;

/** 依目前的設定重算目前這張（進行中時跑完再補一輪） */
export function requestSync(): void {
  if (running) {
    again = true;
    return;
  }
  running = true;
  void (async () => {
    try {
      do {
        again = false;
        try {
          await syncOnce();
        } catch (e) {
          const item = currentItem(settingsNow(), previewNow());
          await fail(e instanceof Error ? e.message : String(e), {
            title: item?.name,
            fields: [['錯誤', errorText(e)]],
          });
        }
      } while (again);
    } finally {
      running = false;
    }
  })();
}

/* 設定、目前這張、AI 遮罩改變時重算 */
let lastS: Settings | null = null;
let lastP: PreviewState | null = null;
export function startEngine(): () => void {
  const onChange = () => {
    const s = settingsNow();
    const p = previewNow();
    const changed =
      !lastS || !lastP || s !== lastS || p.current !== lastP.current || p.aiMasks !== lastP.aiMasks;
    lastS = s;
    lastP = p;
    if (changed) requestSync();
  };
  const a = useSettings.subscribe(onChange);
  const b = usePreview.subscribe(onChange);
  onChange();
  return () => {
    a();
    b();
  };
}

/* ---------- 筆刷 ---------- */

let painter: StrokePainter | null = null;
let live: { item: string; points: number[]; mode: 'e' | 'r'; size: number; hard: number } | null =
  null;

/** 開始一筆（回傳 false＝目前不能畫） */
export function strokeStart(x: number, y: number): ReturnType<StrokePainter['add']> | false {
  const p = previewNow();
  if (
    p.tool === 'move' ||
    isFillTool(p.tool) ||
    !buf.final ||
    !buf.src ||
    useWork.getState().phase !== 'ready'
  )
    return false;
  const mode = p.tool === 'erase' ? 'e' : 'r';
  painter = new StrokePainter(
    buf.final,
    buf.src.width,
    buf.src.height,
    p.tool === 'erase' ? 'erase' : 'restore',
    p.brushSize,
    p.brushHardness,
  );
  live = {
    item: buf.itemId!,
    points: [],
    mode,
    size: p.brushSize,
    hard: p.brushHardness,
  };
  return strokeMove(x, y);
}

/** 筆刷移動到 (x, y)（圖片座標）；回傳改到的範圍 */
export function strokeMove(x: number, y: number): ReturnType<StrokePainter['add']> {
  if (!painter || !live) return null;
  const px = roundPoint(x);
  const py = roundPoint(y);
  const n = live.points.length;
  /* 與上一點太近（小於筆刷的 1/8 或 1 px）的點不記，存檔小一點 */
  if (n >= 2) {
    const dx = px - live.points[n - 2];
    const dy = py - live.points[n - 1];
    if (dx * dx + dy * dy < Math.max(1, live.size / 8) ** 2) return null;
  }
  live.points.push(px, py);
  maskVersion++;
  return painter.add(px, py);
}

/** 一筆畫完：寫進清單（算一步復原） */
export function strokeEnd(): void {
  const l = live;
  painter = null;
  live = null;
  if (!l?.points.length) return;
  const stroke: StoredStroke = { m: l.mode, s: l.size, h: l.hard, p: l.points };
  const item = settingsNow().images.find((it) => it.id === l.item);
  if (!item || buf.itemId !== l.item) return;
  buf.pending = stroke;
  step((d) => {
    d.images.find((it) => it.id === l.item)?.strokes.push(stroke);
  });
}

export const strokeActive = () => !!live;

/** 清除目前這張的筆刷（算一步復原） */
export function clearStrokes(): void {
  const item = currentItem();
  if (!item?.strokes.length) return;
  step((d) => {
    const it = d.images.find((x) => x.id === item.id);
    if (it) it.strokes = [];
  });
}

/* ---------- 同色擦掉／補回（規格 F61） ---------- */

/** 點 (x, y)（圖片座標）時存起來的那一步：目前的工具（同色擦掉／補回）、容許度、只選相連的 */
function fillStrokeAt(x: number, y: number): FillStroke | null {
  const p = previewNow();
  if (!isFillTool(p.tool) || !buf.src) return null;
  const { width, height } = buf.src;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return {
    m: p.tool === 'fill-erase' ? 'fe' : 'fr',
    x: Math.floor(x),
    y: Math.floor(y),
    t: p.fillTolerance,
    c: p.fillContiguous,
  };
}

/** Worker 手上的遮罩是哪一版（不同時要附上目前的遮罩） */
let workerMaskVersion = -1;
let fillSeq = 0;

async function fillRegionAt(
  fill: FillStroke,
  tint: readonly [number, number, number],
  stripe?: number,
): Promise<FillPreview | null> {
  const item = currentItem();
  const final = buf.final;
  if (!item || !final || buf.itemId !== item.id || useWork.getState().phase !== 'ready')
    return null;
  const blob = await assets.get(item.asset);
  if (!blob) return null;
  const version = maskVersion;
  const send = (withMask: boolean) =>
    pixels.fillPreview(
      item.asset,
      blob,
      version,
      withMask ? (new Uint8Array(final) as Mask) : null,
      fill,
      tint,
      stripe,
    );
  /* Worker 已經有這一版就不必再傳整張遮罩；它沒有（例如 Worker 重開）時回傳 null，再附上遮罩 */
  let r = workerMaskVersion === version ? await send(false) : null;
  if (!r) {
    workerMaskVersion = version;
    r = await send(true);
  }
  return r;
}

/**
 * 游標（或按住的手指）在 (x, y) 時會擦掉／補回的範圍；不是同色工具、還沒準備好時 null。
 * 有更新的請求時，舊的那次回傳 null（不用畫）。tint：預覽斜紋的顏色；stripe：一條紋的寬（圖片像素）。
 */
export async function fillPreviewAt(
  x: number,
  y: number,
  tint: readonly [number, number, number],
  stripe?: number,
): Promise<FillPreview | null> {
  const seq = ++fillSeq;
  const fill = fillStrokeAt(x, y);
  if (!fill) return null;
  const r = await fillRegionAt(fill, tint, stripe);
  return seq === fillSeq ? r : null;
}

/** 在 (x, y) 同色擦掉／補回（算一步復原）；範圍是空的時不做事，回傳 false */
export async function fillAt(x: number, y: number): Promise<boolean> {
  fillSeq++;
  const fill = fillStrokeAt(x, y);
  const itemId = buf.itemId;
  if (!fill || !itemId) return false;
  const r = await fillRegionAt(fill, [0, 0, 0]);
  if (!r?.count || buf.itemId !== itemId) return false;
  step((d) => {
    d.images.find((it) => it.id === itemId)?.strokes.push(fill);
  });
  return true;
}

/** 取消範圍預覽（之前送出的請求回來時不用畫） */
export function cancelFillPreview(): void {
  fillSeq++;
}

/* ---------- AI 去背 ---------- */

let onnx: OnnxClient | null = null;
let onnxKey = '';
let aiAbort: { aborted: boolean } | null = null;

function dropOnnx() {
  onnx?.terminate();
  onnx = null;
  onnxKey = '';
}

/** 刪除模型、換運算方式時關掉推論 Worker（下次用時重開） */
export function resetAi(): void {
  dropOnnx();
  useWork.setState({ backend: null, backendFallback: false });
}

async function session(): Promise<OnnxClient> {
  const spec = modelSpec();
  const backend = settingsNow().backend;
  const key = `${spec.url}|${spec.sha256}|${backend}`;
  if (onnx && onnxKey === key) return onnx;
  dropOnnx();
  const client = createOnnxClient({ name: 'AI 去背' });
  onnx = client;
  onnxKey = key;
  try {
    const info = await client.open({ model: spec }, { backend });
    if (!info.inputs.includes(MODEL_INPUT) || !info.outputs.includes(MODEL_OUTPUT)) {
      throw new Error(S.wrongModel);
    }
    useWork.setState({ backend: info.backend, backendFallback: !!info.fallbackReason });
    return client;
  } catch (e) {
    if (onnx === client) dropOnnx();
    throw e;
  }
}

export interface AiResult {
  done: number;
  cancelled: boolean;
  error: string | null;
  /** 出錯的那張與步驟、瀏覽器回報的錯誤（給「複製錯誤資訊」） */
  problem?: DiagnosticItem;
  /** 模型不見了或驗證不符（要重新檢查下載狀態） */
  modelGone: boolean;
}

/** AI 去背這些圖（已經有遮罩的跳過，force 時重做） */
export async function runAi(items: readonly ImageItem[], force = false): Promise<AiResult> {
  if (useWork.getState().ai) return { done: 0, cancelled: false, error: null, modelGone: false };
  const masks = previewNow().aiMasks;
  const todo = items.filter(
    (it, i, a) => (force || !masks[it.asset]) && a.findIndex((x) => x.asset === it.asset) === i,
  );
  const result: AiResult = { done: 0, cancelled: false, error: null, modelGone: false };
  if (!todo.length) return result;
  const abort = { aborted: false };
  aiAbort = abort;
  let it: ImageItem | null = null;
  let stage: keyof typeof S.diag.aiStages = 'model';
  try {
    for (let i = 0; i < todo.length; i++) {
      const cur = todo[i];
      it = cur;
      useWork.setState({
        ai: {
          index: i + 1,
          total: todo.length,
          stage: onnx ? 'infer' : 'model',
          startedAt: Date.now(),
        },
      });
      const blob = await assets.get(cur.asset);
      if (!blob) continue;
      stage = 'model';
      const client = await session();
      if (abort.aborted) break;
      useWork.setState((st) => ({ ai: st.ai ? { ...st.ai, stage: 'infer' } : st.ai }));
      stage = 'prepare';
      const prep = await pixels.aiInput(cur.asset, blob);
      if (abort.aborted) break;
      stage = 'infer';
      const out = await client.run({
        [MODEL_INPUT]: { data: prep.tensor, dims: [1, 3, MODEL_SIZE, MODEL_SIZE] },
      });
      if (abort.aborted) break;
      const pred = out[MODEL_OUTPUT];
      if (!pred) throw new Error(S.wrongModel);
      stage = 'mask';
      const r = await pixels.aiMask(pred.data, prep.box);
      stage = 'save';
      const added = await assets.add(
        new Blob([r.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
      );
      usePreview.getState().update((d) => {
        d.aiMasks[cur.asset] = added.id;
      });
      result.done++;
    }
  } catch (e) {
    if (!abort.aborted) {
      result.modelGone = e instanceof ModelError && (e.kind === 'missing' || e.kind === 'checksum');
      result.error =
        e instanceof OnnxError || e instanceof ModelError || e instanceof Error
          ? e.message
          : String(e);
      const backend = useWork.getState().backend;
      result.problem = {
        title: it?.name,
        fields: [
          ...(it ? ([['尺寸', `${it.width} × ${it.height}`]] as const) : []),
          ['步驟', `${S.diag.ai}：${S.diag.aiStages[stage]}`],
          ['運算方式', backend ?? S.diag.noBackend],
          ['錯誤', errorText(e)],
        ],
      };
      if (!(e instanceof ModelError)) dropOnnx();
    }
  } finally {
    if (aiAbort === abort) aiAbort = null;
    useWork.setState({ ai: null });
  }
  result.cancelled = abort.aborted;
  return result;
}

/** 取消 AI 去背：推論沒辦法中途停下，直接結束推論 Worker（下次再開） */
export function cancelAi(): void {
  if (!aiAbort) return;
  aiAbort.aborted = true;
  dropOnnx();
  useWork.setState({ ai: null });
}

export const backendLabel = (b: OnnxBackend) => ONNX_BACKEND_LABELS[b];

/* ---------- 匯出 ---------- */

const EXPORT_EXT: Record<OutFormat, string> = { png: 'png', webp: 'webp', jpg: 'jpg' };
let renderSeq = 0;

/** 匯出這張或全部（ExportPanel 的 onExport） */
export async function exportImages(
  format: OutFormat,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput | ExportBatchOutput> {
  const s = settingsNow();
  const masks = previewNow().aiMasks;
  const cur = currentItem(s);
  const list = s.scope === 'all' ? s.images : cur ? [cur] : [];
  if (!list.length) throw new Error(S.exportEmpty);
  if (s.mode === 'ai') {
    const missing = list.filter((it) => !masks[it.asset]).map((it) => it.name);
    if (missing.length) throw new Error(S.exportNeedsAi(missing));
  }
  const output = {
    content: s.content,
    background: effectiveBackground({ ...s, format }),
    bgColor: s.bgColor,
    format,
    trim: s.trim,
    trimPad: s.trimPad,
  };
  const used = new Set<string>();
  const files: ExportOutput[] = [];
  const aborted = () => new DOMException('aborted', 'AbortError');
  for (let i = 0; i < list.length; i++) {
    if (signal.aborted) throw aborted();
    const it = list[i];
    onProgress(i / list.length, S.exportProgress(i + 1, list.length));
    const blob = await assets.get(it.asset);
    if (!blob) throw new Error(S.readFailed([it.name]));
    const maskId = masks[it.asset];
    const aiMask = s.mode === 'ai' && maskId ? ((await assets.get(maskId)) ?? null) : null;
    /* 取消：Worker 在下一個檢查點停下來（不必等這張畫完） */
    const id = ++renderSeq;
    const stop = () => void pixels.cancelRender(id).catch(() => {});
    signal.addEventListener('abort', stop, { once: true });
    try {
      const r = await pixels.render({
        id,
        key: it.asset,
        blob,
        mode: s.mode,
        keyParams: keyParamsOf(s),
        aiMask,
        grow: s.grow,
        feather: s.feather,
        despill: s.despill,
        strokes: it.strokes,
        output,
      });
      const name = uniqueFileName(outputName(it.name, s.content, format), used);
      files.push({
        blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: MIME[format] }),
        fileName: name.endsWith(`.${EXPORT_EXT[format]}`) ? name : `${name}.${EXPORT_EXT[format]}`,
        width: r.width,
        height: r.height,
      });
    } catch (e) {
      if (signal.aborted || (e as Error)?.name === 'AbortError') throw aborted();
      if (e instanceof NeedsAiError || (e as Error)?.name === 'NeedsAiError')
        throw new Error(S.exportNeedsAi([it.name]));
      throw e;
    } finally {
      signal.removeEventListener('abort', stop);
    }
    if (signal.aborted) throw aborted();
  }
  onProgress(1, S.exportProgress(list.length, list.length));
  if (s.scope === 'all') return { files, zipName: S.zipName };
  return files[0];
}

/* ---------- 取色 ---------- */

/** 從原圖 (x, y) 取色（四捨五入到整數像素；圖外時 null） */
export function sampleSource(x: number, y: number): string | null {
  const src = buf.src;
  if (!src) return null;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= src.width || iy >= src.height) return null;
  const k = (iy * src.width + ix) * 4;
  return hexOf([src.rgba[k], src.rgba[k + 1], src.rgba[k + 2]]);
}

/** 預覽要畫的東西（null＝還沒有）；asset：原圖的資產 id、despillKey：去色邊開著時 Worker 記得的顏色 */
export function previewSource(): {
  asset: string;
  src: SourceImage;
  colors: Uint8ClampedArray<ArrayBuffer> | null;
  despillKey: string | null;
  final: Mask | null;
} | null {
  if (!buf.src || !buf.asset) return null;
  return {
    asset: buf.asset,
    src: buf.src,
    colors: buf.colors,
    despillKey: buf.despillKey,
    final: buf.final,
  };
}

export const itemsNow = (): readonly ImageItem[] => settingsNow().images;
export type { PreviewState };
