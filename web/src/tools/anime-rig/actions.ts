/**
 * 操作：讀入 PSD、設定（存、讀、JSON）、表情預設、參數、圖層、錨點、匯出（PNG、錄影、輕量 PSD）、攝影機與麥克風。
 * 畫面的元件與快捷鍵都呼叫這裡；狀態在 store.ts，畫面在 engine.ts。
 */
import { downloadBlob, pickFiles } from '@/core/files';
import { modelStatus } from '@/core/models';
import { type CanvasRecording, recordingFormats, startCanvasRecording } from '@/core/video';
import { createCamera, createMic, createTicker, type Ticker } from './devices';
import { getEngine } from './engine';
import { type Landmark, type Neutral, Tracker, type TrackerOptions } from './faceFeatures';
import type { FaceDetector } from './faceLandmarker';
import { faceModelSpec } from './faceModel';
import {
  ANCHOR_KEYS,
  type AnchorKey,
  type AnchorOffset,
  AUTO_DEFAULTS,
  AUTO_KEYS,
  type AutoKey,
  BACKGROUNDS,
  type BackgroundId,
  clampParam,
  defaultParams,
  MAX_FILE_BYTES,
  type ParamKey,
  PRESET_IDS,
  PRESETS,
  type Prefs,
  type PresetId,
  TOOL_ID,
} from './params';
import { cancelPsd, cleanPsdBytes, loadPsd } from './psdClient';
import type { Rig } from './rigger';
import {
  type LayerSetting,
  mergeLayerOrder,
  type ParsedSettings,
  parseSettings,
  SETTINGS_FORMAT,
  SETTINGS_VERSION,
  type SettingsFile,
  safeFileName,
  sanitizeAnchors,
  validateHeader,
} from './runtime';
import {
  type EditState,
  edit,
  type LayerInfo,
  type ModelInfo,
  setPrefs,
  setStatus,
  useAuto,
  useEdit,
  usePrefs,
  useSession,
} from './store';
import { S, type SectionId } from './strings';

export const APP_NAME = 'TRPG Toolkit 2.5D 動態立繪';
const SETTINGS_KEY = (id: string) => `trpg-toolkit:${TOOL_ID}:model:${id}`;
const LEGACY_SETTINGS_KEY = (id: string) => `anime25d.settings.${id}`;
const JSON_MAX_BYTES = 1024 * 1024;

const model = () => useSession.getState().model;
const baseFileName = () => safeFileName(model()?.name ?? '', 'avatar');

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* ---------- 區塊的展開（搜尋、模型下載的提示用） ---------- */

let revealSection: ((id: SectionId) => void) | null = null;
export function setSectionRevealer(fn: ((id: SectionId) => void) | null): void {
  revealSection = fn;
}

/* ---------- 讀入 PSD ---------- */

let loadTicket = 0;

/** 拖放、選檔：`.json` 當設定 JSON，其他當 PSD（規格 F01） */
export function openFile(file: File): void {
  if (/\.json$/i.test(file.name)) void importSettingsFile(file);
  else void loadPsdFile(file);
}

/** 開啟 PSD 的選檔視窗（Ctrl＋O、按鈕） */
export async function pickPsd(): Promise<void> {
  const [file] = await pickFiles({ accept: '.psd,.json,application/json' });
  if (file) openFile(file);
}

export async function loadPsdFile(file: File): Promise<void> {
  const ticket = ++loadTicket;
  cancelPsd();
  useSession.setState({ loading: S.loadReading(file.name) });
  setStatus(S.loadReading(file.name));
  try {
    if (!/\.psd$/i.test(file.name)) throw new Error(S.errExt);
    if (file.size > MAX_FILE_BYTES) throw new Error(S.errTooLarge);
    const buffer = await file.arrayBuffer();
    if (ticket !== loadTicket) return;
    validateHeader(buffer);
    const parsed = await loadPsd(buffer, (msg) => {
      if (ticket !== loadTicket) return;
      useSession.setState({ loading: msg });
      setStatus(msg);
    });
    if (ticket !== loadTicket) return;
    const engine = getEngine();
    if (!engine) throw new Error(S.errWebgl);
    stopRecording(true);
    const thumbs = engine.applyRig(parsed.rig);
    const name = file.name;
    useSession.setState({
      model: modelInfo(parsed.id, name, parsed.rig, thumbs, parsed.noise),
      anchorMode: false,
      highlight: null,
    });
    /* 參數回到預設、自動動作回到預設，再套用這個模型已儲存的設定（F09、F82） */
    const keepBg = useEdit.getState().data.background;
    useEdit.getState().replace({
      params: defaultParams(),
      preset: null,
      background: keepBg,
      anchors: {},
      layers: defaultLayers(),
    });
    useAuto.setState({ ...AUTO_DEFAULTS });
    restoreSaved(true);
    engine.snap();
    useEdit.temporal.getState().clear();
    useSession.setState({ savedSnapshot: comparableSettings(), loading: null });
    document.title = `${name}｜2.5D 動態立繪｜TRPG Toolkit`;
    setStatus(S.loadDone(name), 'success');
  } catch (err) {
    if (ticket !== loadTicket || (err as { name?: string })?.name === 'AbortError') return;
    useSession.setState({ loading: null });
    const raw = err instanceof Error ? err.message : String(err);
    /* 本站的訊息都是中文；沒有中文的是解析 PSD 的函式庫（ag-psd）丟出的原文 */
    setStatus(S.loadError(/[\u3400-\u9fff]/.test(raw) ? raw : S.errParse(raw)), 'danger');
  }
}

export function cancelLoad(): void {
  loadTicket++;
  cancelPsd();
  if (useSession.getState().loading !== null) {
    useSession.setState({ loading: null });
    setStatus(S.loadCancelled);
  }
}

function modelInfo(
  id: string,
  name: string,
  rig: Rig,
  thumbs: Map<string, string>,
  noise: { noisy: number; layers: number },
): ModelInfo {
  const layers: LayerInfo[] = rig.layers.map((p) => {
    const lid = `${p.z}:${p.name}`;
    return {
      id: lid,
      name: p.name,
      source: p.source,
      bn: p.name === 'eye_close2' ? p.name : p.name.replace(/_(l|r)$/, '').replace(/_\d+$/, ''),
      side: p.side,
      group: p.group,
      phys: p.phys,
      strands: p.strands?.length ?? 0,
      synthetic: !!p.synthetic,
      unknown: !!p.unknown,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      thumb: thumbs.get(lid) ?? '',
      defaultOpacity: p.opacity ?? 1,
      defaultDepth: p.depth,
    };
  });
  return {
    id,
    name,
    width: rig.canvas.w,
    height: rig.canvas.h,
    layers,
    warnings: rig.warnings,
    noise: noise.noisy > 0 ? noise : null,
    hasTopwear: layers.some((l) => l.bn === 'topwear'),
    eyes: { L: !!rig.anchors.eyeL, R: !!rig.anchors.eyeR },
  };
}

/** 綁定時的圖層設定（依繪製順序） */
function defaultLayers(): LayerSetting[] {
  return (model()?.layers ?? []).map((l) => ({
    id: l.id,
    visible: true,
    opacity: l.defaultOpacity,
    depth: l.defaultDepth,
  }));
}

/* ---------- 設定 ---------- */

export function settingsSnapshot(): SettingsFile {
  const m = model();
  const d = useEdit.getState().data;
  const auto = useAuto.getState();
  return {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    app: APP_NAME,
    modelId: m?.id ?? '',
    modelName: m?.name ?? '',
    params: { ...d.params },
    preset: d.preset,
    auto: Object.fromEntries(AUTO_KEYS.map((k) => [k, auto[k]])),
    background: d.background,
    layers: d.layers.map((l) => ({ ...l })),
    anchors: structuredClone(d.anchors),
  };
}

/** 比對「有沒有未儲存的變更」用（不含模型名稱、程式名稱） */
export function comparableSettings(): string {
  const { modelName: _n, app: _a, ...rest } = settingsSnapshot();
  return JSON.stringify(rest);
}

/** 套用設定（讀檔、還原）；不合時丟 Error */
function applySettingsValue(value: unknown, options: { auto?: boolean } = {}): ParsedSettings {
  const m = model();
  if (!m) throw new Error(S.needModel);
  const data = parseSettings(
    value,
    m.id,
    m.layers.map((l) => l.id),
    defaultParams(),
    { anchorLimit: Math.max(m.width, m.height) },
  );
  const defaults = defaultLayers();
  const byId = new Map(defaults.map((l) => [l.id, l]));
  const records = new Map(data.layers.map((r) => [r.id, r]));
  const order = mergeLayerOrder(
    defaults.map((l) => l.id),
    data.layers.map((r) => r.id),
  );
  const layers = order.map((id) => records.get(id) ?? (byId.get(id) as LayerSetting));
  const params = { ...defaultParams() };
  for (const [k, v] of Object.entries(data.params)) params[k as ParamKey] = v;
  const next: EditState = {
    params,
    preset: data.preset,
    background: data.background,
    anchors: data.anchors,
    layers,
  };
  useEdit.getState().replace(next);
  if (options.auto !== false) useAuto.setState({ ...data.auto });
  getEngine()?.snap();
  return data;
}

const layerDiffNote = (d: ParsedSettings) => S.layerDiff(d.missingLayers + d.unknownLayers);

/** 已儲存的設定（新版沒有時讀舊版的鍵；規格 F85） */
function readSaved(id: string): string | null {
  return storageGet(SETTINGS_KEY(id)) ?? storageGet(LEGACY_SETTINGS_KEY(id));
}

/** 還原成已儲存的狀態（quiet：讀入模型時，自動動作先回到預設、不算一步復原；規格 F78、F82） */
export function restoreSaved(quiet = false): boolean {
  const m = model();
  if (!m) return false;
  try {
    const saved = readSaved(m.id);
    if (!saved) {
      if (!quiet) setStatus(S.noneSaved);
      return false;
    }
    const data = applySettingsValue(JSON.parse(saved));
    setStatus(S.restored(layerDiffNote(data)), 'success');
    if (!quiet) useSession.setState({ savedSnapshot: comparableSettings() });
    return true;
  } catch (err) {
    setStatus(S.restoreError(err instanceof Error ? err.message : String(err)), 'danger');
    return false;
  }
}

/** 儲存調整（Ctrl＋S；規格 F76） */
export function saveSettings(): void {
  const m = model();
  if (!m) return;
  try {
    localStorage.setItem(SETTINGS_KEY(m.id), JSON.stringify(settingsSnapshot()));
    useSession.setState({ savedSnapshot: comparableSettings() });
    setStatus(S.saved, 'success');
  } catch {
    setStatus(S.saveError, 'danger');
  }
}

export function exportSettingsJson(): void {
  if (!model()) return;
  downloadBlob(
    new Blob([JSON.stringify(settingsSnapshot(), null, 2)], { type: 'application/json' }),
    `${baseFileName()}.rig.json`,
  );
  setStatus(S.jsonExported, 'success');
}

export async function pickSettingsJson(): Promise<void> {
  const [file] = await pickFiles({ accept: '.json,application/json' });
  if (file) await importSettingsFile(file);
}

/** 讀入設定 JSON（規格 F80） */
export async function importSettingsFile(file: File): Promise<void> {
  const id = model()?.id;
  try {
    if (!id) throw new Error(S.needModel);
    if (file.size > JSON_MAX_BYTES) throw new Error(S.jsonTooLarge);
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      /* 瀏覽器的 SyntaxError 是英文：換成中文說明 */
      throw new Error(S.jsonInvalid);
    }
    if (model()?.id !== id) throw new Error(S.modelChanged);
    const data = applySettingsValue(value);
    setStatus(S.imported(layerDiffNote(data)), 'success');
  } catch (err) {
    setStatus(S.importError(err instanceof Error ? err.message : String(err)), 'danger');
  }
}

/* ---------- 參數、表情預設 ---------- */

/** 滑桿改參數（表情預設的按下狀態取消；規格 F45） */
export function setParam(key: ParamKey, value: number): void {
  edit((d) => {
    d.params[key] = clampParam(key, value);
    d.preset = null;
  });
}

export function resetParam(key: ParamKey): void {
  setParam(key, defaultParams()[key]);
}

export function togglePreset(id: PresetId): void {
  if (!model()) return;
  edit((d) => {
    const values = d.preset === id ? PRESETS.neutral : PRESETS[id];
    for (const [k, v] of Object.entries(values))
      d.params[k as ParamKey] = clampParam(k as ParamKey, v);
    d.preset = d.preset === id ? null : id;
  });
}

export function clearPreset(): void {
  const p = useEdit.getState().data.preset;
  if (p) togglePreset(p);
}

export function presetByNumber(n: number): void {
  if (n === 0) clearPreset();
  else if (n >= 1 && n <= PRESET_IDS.length) togglePreset(PRESET_IDS[n - 1]);
}

export function resetParams(): void {
  if (!model()) return;
  edit((d) => {
    d.params = defaultParams();
    d.preset = null;
  });
  setStatus(S.resetDone, 'success');
}

/* ---------- 背景 ---------- */

export function setBackground(bg: BackgroundId): void {
  edit((d) => {
    d.background = bg;
  });
}

export function cycleBackground(): void {
  const cur = useEdit.getState().data.background;
  setBackground(BACKGROUNDS[(BACKGROUNDS.indexOf(cur) + 1) % BACKGROUNDS.length]);
}

/* ---------- 圖層 ---------- */

export function setLayer(id: string, patch: Partial<Omit<LayerSetting, 'id'>>): void {
  edit((d) => {
    const l = d.layers.find((x) => x.id === id);
    if (!l) return;
    if (patch.visible !== undefined) l.visible = patch.visible;
    if (patch.opacity !== undefined) l.opacity = Math.max(0, Math.min(1, patch.opacity));
    if (patch.depth !== undefined) l.depth = Math.max(0, Math.min(2, patch.depth));
  });
}

export function moveLayer(from: number, to: number): void {
  edit((d) => {
    if (from === to || from < 0 || to < 0 || from >= d.layers.length || to >= d.layers.length)
      return;
    const [l] = d.layers.splice(from, 1);
    d.layers.splice(to, 0, l);
  });
}

export function resetLayers(): void {
  edit((d) => {
    d.layers = defaultLayers();
  });
  setStatus(S.layersResetDone, 'success');
}

/* ---------- 錨點 ---------- */

export function setAnchorOffset(key: AnchorKey, o: AnchorOffset): void {
  const m = model();
  if (!m) return;
  const clean = sanitizeAnchors({ [key]: o }, Math.max(m.width, m.height));
  edit((d) => {
    if (clean[key]) d.anchors[key] = clean[key];
    else delete d.anchors[key];
  });
}

/** 方向鍵移動錨點（Shift 10 px；規格 F50） */
export function nudgeAnchor(key: AnchorKey, dx: number, dy: number): void {
  const axes = ANCHOR_KEYS[key] as readonly string[];
  const cur = useEdit.getState().data.anchors[key] ?? {};
  const o: AnchorOffset = {};
  if (axes.includes('dx')) o.dx = (cur.dx ?? 0) + dx;
  if (axes.includes('dy')) o.dy = (cur.dy ?? 0) + dy;
  setAnchorOffset(key, o);
}

export function resetAnchors(): void {
  edit((d) => {
    d.anchors = {};
  });
  setStatus(S.anchorResetDone, 'success');
}

export function setAnchorMode(on: boolean): void {
  const next = on && !!model();
  if (useSession.getState().anchorMode === next) return;
  useSession.setState({ anchorMode: next });
  if (next) setStatus(S.anchorEditing);
}

export function toggleAnchorMode(): void {
  setAnchorMode(!useSession.getState().anchorMode);
}

/* ---------- 暫停、復原 ---------- */

export function togglePause(): void {
  if (!model()) return;
  const paused = !useSession.getState().paused;
  useSession.setState({ paused });
  setStatus(paused ? S.paused : S.playing);
}

export function undo(): void {
  const t = useEdit.temporal.getState();
  if (!t.pastStates.length) return;
  t.undo();
  setStatus(S.undone);
}

export function redo(): void {
  const t = useEdit.temporal.getState();
  if (!t.futureStates.length) return;
  t.redo();
  setStatus(S.redone);
}

/* ---------- 匯出 ---------- */

export async function savePng(): Promise<void> {
  const engine = getEngine();
  const m = model();
  if (!engine || !m || useSession.getState().pngBusy) return;
  const bg = usePrefs.getState().data.exportBg;
  useSession.setState({ pngBusy: true });
  try {
    const blob = await engine.capturePng(bg);
    if (!blob) {
      setStatus(S.pngFailed, 'danger');
      return;
    }
    downloadBlob(blob, `${baseFileName()}.png`);
    setStatus(S.pngDone(m.width, m.height, bg === 'transparent'), 'success');
  } finally {
    useSession.setState({ pngBusy: false });
  }
}

let rec: CanvasRecording | null = null;
let recTimer: ReturnType<typeof setInterval> | null = null;
let recStarted = 0;
let recFinishing = false;

export function canRecord(): boolean {
  return (
    recordingFormats().length > 0 &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** 錄影的開始與停止（再按一次＝提早停止並儲存；規格 F68） */
export function toggleRecording(): void {
  if (rec) {
    void finishRecording();
    return;
  }
  const engine = getEngine();
  const m = model();
  if (!engine || !m) return;
  const formats = recordingFormats();
  const prefs = usePrefs.getState().data;
  const f = formats.find((x) => x.mimeType === prefs.recFormat) ?? formats[0];
  if (!f || !canRecord()) {
    setStatus(S.recUnsupported, 'danger');
    return;
  }
  const fps = prefs.recFps;
  const seconds = prefs.recSeconds;
  const bits = Math.round(Math.min(40e6, Math.max(4e6, m.width * m.height * fps * 0.12)));
  try {
    engine.recordingBg = prefs.exportBg;
    engine.recording = true;
    rec = startCanvasRecording(engine.canvas, {
      fps,
      mimeType: f.mimeType,
      videoBitsPerSecond: bits,
    });
  } catch (err) {
    engine.recording = false;
    rec = null;
    setStatus(S.recError(err instanceof Error ? err.message : String(err)), 'danger');
    return;
  }
  recStarted = performance.now();
  useSession.setState({ recording: { t: 0, total: seconds } });
  const meta = {
    ext: f.extension,
    alpha: f.alpha,
    bg: prefs.exportBg,
    w: m.width,
    h: m.height,
    name: baseFileName(),
  };
  recMeta = meta;
  recTimer = setInterval(() => {
    const t = (performance.now() - recStarted) / 1000;
    useSession.setState({ recording: { t: Math.min(t, seconds), total: seconds } });
    if (t >= seconds) void finishRecording();
  }, 100);
}

let recMeta: {
  ext: string;
  alpha: boolean;
  bg: string;
  w: number;
  h: number;
  name: string;
} | null = null;

async function finishRecording() {
  if (!rec || recFinishing) return;
  recFinishing = true;
  const r = rec;
  const meta = recMeta;
  if (recTimer) clearInterval(recTimer);
  recTimer = null;
  try {
    const blob = await r.stop();
    const sec = ((performance.now() - recStarted) / 1000).toFixed(1);
    if (!blob.size) throw new Error(S.recEmpty);
    if (meta) {
      downloadBlob(blob, `${meta.name}.${meta.ext}`);
      setStatus(
        S.recDone(
          meta.w,
          meta.h,
          sec,
          (blob.size / 1e6).toFixed(1),
          meta.bg === 'transparent' && !meta.alpha,
        ),
        'success',
      );
    }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') setStatus(S.recCancelled);
    else setStatus(S.recError(err instanceof Error ? err.message : String(err)), 'danger');
  } finally {
    rec = null;
    recMeta = null;
    recFinishing = false;
    const engine = getEngine();
    if (engine) {
      engine.recording = false;
      engine.invalidate();
    }
    useSession.setState({ recording: null });
  }
}

/** 取消錄影（換模型、繪圖內容遺失、離開頁面） */
export function stopRecording(cancel = false): void {
  if (!rec) return;
  if (cancel) rec.cancel();
  void finishRecording();
}

export async function saveCleanPsd(): Promise<void> {
  if (!model()) {
    setStatus(S.needModel, 'warning');
    return;
  }
  try {
    setStatus(S.psdExporting);
    const buf = await cleanPsdBytes();
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    downloadBlob(blob, `${baseFileName()}_clean.psd`);
    setStatus(S.psdDone((blob.size / 1e6).toFixed(1)), 'success');
  } catch (err) {
    setStatus(S.psdError(err instanceof Error ? err.message : String(err)), 'danger');
  }
}

/* ---------- 自動動作 ---------- */

export function setAuto(key: AutoKey, value: boolean): void {
  useAuto.setState({ [key]: value });
}

/* ---------- 攝影機與麥克風 ---------- */

function trackerOptions(p: Prefs): TrackerOptions {
  return {
    headGain: p.headGain,
    eyeGain: p.eyeGain,
    mouthGain: p.mouthGain,
    browGain: p.browGain,
    gazeGain: p.gazeGain,
    smoothing: p.smoothing,
    linkEyes: p.linkEyes,
    trackBrow: p.trackBrow,
    trackSmile: p.trackSmile,
  };
}

export const tracker = new Tracker(trackerOptions(usePrefs.getState().data));
tracker.setCalibration(usePrefs.getState().data.calibration as Neutral | null);
usePrefs.subscribe((st, prev) => {
  if (st.data !== prev.data) tracker.setOptions(trackerOptions(st.data));
});

let camPreview: HTMLCanvasElement | null = null;
export function setCamPreviewCanvas(el: HTMLCanvasElement | null): void {
  camPreview = el;
}

/** 測試入口：`window.__animeRigFakeLandmarks(t)` 給了就不載入模型，改用假的特徵點 */
type FakeSource = (t: number) => Landmark[] | null;
const fakeSource = () =>
  (globalThis as { __animeRigFakeLandmarks?: FakeSource }).__animeRigFakeLandmarks;

async function createDetector(): Promise<FaceDetector> {
  const fake = fakeSource();
  if (fake) return { detect: (_v, t) => fake(t), close() {} };
  const { createFaceDetector } = await import('./faceLandmarker');
  try {
    return await createFaceDetector(faceModelSpec());
  } catch (err) {
    throw new Error(S.devErrors.loadFailed(err instanceof Error ? err.message : String(err)));
  }
}

const camera = createCamera({
  createDetector,
  preview: () => (usePrefs.getState().data.camPreview ? camPreview : null),
  onState: (s, msg) => {
    if (s === 'loading') useSession.setState({ cam: 'loading' });
    else if (s === 'on') {
      useSession.setState({ cam: 'on' });
      tracker.reset();
    } else useSession.setState({ cam: 'off', camLive: false });
    if (s === 'error') {
      useAuto.setState({ cam: false });
      setStatus(msg ?? '', 'danger');
      const e = getEngine();
      if (e) e.cam = null;
      updateLiveTicker();
    }
  },
  onResults: (lm, video) => {
    const aspect =
      video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
    const out = lm ? tracker.update(lm, performance.now() / 1000, aspect) : null;
    const e = getEngine();
    if (!out) {
      if (e) e.cam = null;
      if (useSession.getState().camLive) useSession.setState({ camLive: false });
      return;
    }
    if (e) e.cam = { ...out, at: performance.now() };
    if (!useSession.getState().camLive) useSession.setState({ camLive: true });
  },
});

const mic = createMic((s, msg) => {
  if (s === 'loading') useSession.setState({ mic: 'loading' });
  else if (s === 'on') useSession.setState({ mic: 'on' });
  else useSession.setState({ mic: 'off', micRaw: 0 });
  if (s === 'error') {
    useAuto.setState({ mic: false });
    setStatus(msg ?? '', 'danger');
    updateLiveTicker();
  }
});

/** 攝影機追蹤的開關（模型沒下載時提示；規格 F53、F54） */
export async function setCamera(on: boolean): Promise<void> {
  if (!on) {
    useAuto.setState({ cam: false });
    camera.stop();
    const e = getEngine();
    if (e) e.cam = null;
    updateLiveTicker();
    return;
  }
  if (!fakeSource() && (await modelStatus(faceModelSpec())) !== 'cached') {
    useSession.setState({ needFaceModel: true });
    revealSection?.('tracking');
    setStatus(S.modelNeeded, 'warning');
    return;
  }
  useSession.setState({ needFaceModel: false });
  useAuto.setState({ cam: true });
  updateLiveTicker();
  try {
    await camera.start();
  } catch (err) {
    useAuto.setState({ cam: false });
    useSession.setState({ cam: 'off' });
    setStatus(S.camStartError(err instanceof Error ? err.message : String(err)), 'danger');
    updateLiveTicker();
  }
}

export async function setMicrophone(on: boolean): Promise<void> {
  useAuto.setState({ mic: on });
  updateLiveTicker();
  if (!on) {
    mic.stop();
    const e = getEngine();
    if (e) e.mic = null;
    return;
  }
  try {
    await mic.start();
  } catch (err) {
    useAuto.setState({ mic: false });
    /* 失敗時 createMic 不再送出狀態（安靜地停止），這裡把「準備中」改回關閉 */
    useSession.setState({ mic: 'off', micRaw: 0 });
    setStatus(S.micStartError(err instanceof Error ? err.message : String(err)), 'danger');
    updateLiveTicker();
  }
}

/* 麥克風的取樣用 Worker 的計時器（視窗被蓋住時也繼續；規格 F60） */
let liveTicker: Ticker | null = null;
let meterAt = 0;
function updateLiveTicker() {
  const auto = useAuto.getState();
  const need = auto.cam || auto.mic;
  if (need && !liveTicker) {
    liveTicker = createTicker(20, () => {
      const a = useAuto.getState();
      const p = usePrefs.getState().data;
      const e = getEngine();
      const level = a.mic && mic.active ? mic.sample(p.micGain, p.micGate) : 0;
      if (e) e.mic = a.mic ? level : null;
      const now = performance.now();
      if (now - meterAt >= 50) {
        meterAt = now;
        const raw = mic.active ? Math.min(1, mic.raw * p.micGain) : 0;
        if (useSession.getState().micRaw !== raw) useSession.setState({ micRaw: raw });
      }
    });
  } else if (!need && liveTicker) {
    liveTicker.stop();
    liveTicker = null;
    const e = getEngine();
    if (e) e.mic = null;
  }
}

/** 記錄正面：至少 1 秒且 5 格（最多 6 秒）的平均（規格 F56） */
export function calibrate(): void {
  if (!camera.active || useSession.getState().calibrating) return;
  tracker.startCalibration();
  useSession.setState({ calibrating: true });
  setStatus(S.calHold);
  const started = performance.now();
  const poll = setInterval(() => {
    const n = tracker.samples?.length ?? 0;
    const elapsed = performance.now() - started;
    if (camera.active && elapsed < 6000 && (elapsed < 1000 || n < 5)) return;
    clearInterval(poll);
    const c = tracker.finishCalibration();
    useSession.setState({ calibrating: false });
    if (!c) {
      setStatus(S.calFailed, 'danger');
      return;
    }
    setPrefs({ calibration: { ...c } as Record<string, number> });
    tracker.reset();
    setStatus(S.calSaved(n), 'success');
  }, 100);
}

export function clearCalibration(): void {
  setPrefs({ calibration: null });
  tracker.setCalibration(null);
  setStatus(S.calCleared);
}

/** 離開頁面：停掉裝置、讀入與錄影 */
export function shutdown(): void {
  mic.stop(true);
  camera.stop(true);
  liveTicker?.stop();
  liveTicker = null;
  cancelPsd();
  stopRecording(true);
}

/** 測試入口與狀態檢查 */
export function debugState() {
  const s = useSession.getState();
  const e = getEngine();
  return {
    model: s.model ? { id: s.model.id, name: s.model.name, layers: s.model.layers.length } : null,
    paused: s.paused,
    anchorMode: s.anchorMode,
    preset: useEdit.getState().data.preset,
    background: useEdit.getState().data.background,
    params: { ...useEdit.getState().data.params },
    anchors: structuredClone(useEdit.getState().data.anchors),
    layers: useEdit.getState().data.layers.map((l) => ({ ...l })),
    auto: { ...useAuto.getState() },
    unsaved: !!s.model && s.savedSnapshot !== comparableSettings(),
    cam: s.cam,
    camLive: s.camLive,
    mic: s.mic,
    calibrated: !!usePrefs.getState().data.calibration,
    frame: e?.currentFrame() ? { ...e.currentFrame() } : null,
    recording: !!s.recording,
  };
}
