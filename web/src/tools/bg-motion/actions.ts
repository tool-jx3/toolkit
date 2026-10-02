/**
 * 使用者操作：載入圖片、範例圖、選效果與濾鏡、調整順序、清除。狀態列訊息在這裡寫；
 * 短暫通知透過 ToastBridge（ToolShell 裡面）取得的 toast 函式。
 */
import { moveItem } from '@/core/compose';
import { canvasToBlob, loadImage } from '@/core/image';
import type { ToastOptions } from '@/ui';
import { EFFECTS, type EffectId, isFade, isSwitch } from './effects';
import { autoFileBase, autoOutput, effectiveFileBase, outputSize, sourceBaseName } from './logic';
import { createSampleCanvas } from './sample';
import {
  type LoadedImage,
  patchSettings,
  type Settings,
  setStatus,
  useSession,
  useSettings,
} from './store';
import { EFFECT_TEXT, FILTER_TEXT, type FilterChoice, S, SWITCH_VERB } from './strings';

/* ---------- 通知 ---------- */

let toaster: ((o: ToastOptions) => void) | null = null;

/** ToolShell 裡的 ToastBridge 把 toast 函式交過來 */
export const setToaster = (fn: ((o: ToastOptions) => void) | null) => {
  toaster = fn;
};

/** 短暫通知；點一下通知本體就關閉（規格 F92） */
export const notify = (o: ToastOptions) => toaster?.({ dismissOnClick: true, ...o });

/* ---------- 名稱 ---------- */

export const effectName = (e: EffectId | null) => (e ? EFFECT_TEXT[e].label : S.noMotion);
export const filterName = (f: FilterChoice) => FILTER_TEXT[f].label;
export const loopWord = (loop: boolean) => (loop ? S.loopWords.on : S.loopWords.off);

/** 自動組成的檔名主體 */
export const autoBase = (s: Settings, sourceBase: string | null) =>
  autoFileBase({
    source: sourceBase,
    effect: effectName(s.effect),
    filter: filterName(s.filter),
    loop: loopWord(s.loop),
  });

/** 下載用的檔名主體：檔名欄有輸入就用它，空白時用自動名稱 */
export const fileBase = (s: Settings, sourceBase: string | null) =>
  effectiveFileBase(s.fileName ?? '', autoBase(s, sourceBase));

export function sizeLabel(s: Settings, first: LoadedImage | null): string {
  if (s.size === 'original') return S.originalSize;
  const o = outputSize(s.quality, s.size, first);
  return S.aspectLabel(s.size, o.width, o.height);
}

/** 轉場的補充說明：依序切換幾張、需要 2 張以上，或單張＋濾鏡 */
function switchHint(effect: EffectId, count: number, filter: FilterChoice): string {
  if (!isSwitch(effect)) return '';
  if (count >= 2) return S.status.switchMany(count, SWITCH_VERB[effect]);
  if (count === 1 && filter !== 'none') return S.status.switchSingle(filterName(filter));
  return S.status.switchNeed;
}

/* ---------- 載入 ---------- */

let seq = 0;

/** 載入一批圖片（取代原本的整組）；有任何一張讀不到就整批不載入 */
export async function loadFiles(files: readonly File[]): Promise<boolean> {
  const list = files.filter((f) => String(f.type || '').startsWith('image/'));
  if (!list.length) {
    setStatus('warning', S.status.selectImage);
    return false;
  }
  const decoded: LoadedImage[] = [];
  for (const file of list) {
    try {
      const bitmap = await loadImage(file);
      decoded.push({
        id: `img${++seq}`,
        name: file.name,
        bytes: file.size,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
      });
    } catch {
      setStatus('danger', S.status.decodeFailed(file.name || '（未命名）'));
      return false;
    }
  }
  const first = decoded[0];
  const maxBytes = decoded.reduce((m, d) => Math.max(m, d.bytes), 0);
  /* 自動比例用載入前選著的畫質那一表打分（原作的做法） */
  const auto = autoOutput(maxBytes, first, useSettings.getState().data.quality);
  patchSettings({ quality: auto.quality, size: auto.size, fadeIn: false, fileName: null });
  useSession.setState((st) => ({
    images: decoded,
    sourceBase: sourceBaseName(decoded.map((d) => d.name)),
    firstFrame: null,
    loadSeq: st.loadSeq + 1,
  }));
  const label = sizeLabel(useSettings.getState().data, first);
  const autoText =
    auto.tier === 'minimum'
      ? S.status.autoMinimum(label)
      : auto.tier === 'lightPreset'
        ? S.status.autoLightPreset(label)
        : auto.tier === 'light'
          ? S.status.autoLight
          : S.status.autoStandard;
  setStatus(
    'success',
    decoded.length >= 2 ? S.status.loadedMany(decoded.length, autoText) : S.status.loaded(autoText),
  );
  return true;
}

/** 範例圖：本站畫的夜景，轉成 JPEG 檔後走和使用者上傳相同的流程 */
export async function loadSample(): Promise<void> {
  try {
    const blob = await canvasToBlob(createSampleCanvas(), 'image/jpeg', 0.9);
    const ok = await loadFiles([new File([blob], S.sampleName, { type: 'image/jpeg' })]);
    if (ok) setStatus('success', S.status.sampleReady);
  } catch {
    setStatus('danger', S.status.sampleFailed);
    notify({ title: S.toast.sampleFailed, tone: 'warning', duration: 4200 });
  }
}

/* ---------- 效果與濾鏡 ---------- */

/** 選效果：秒數、循環換成該效果的預設；淡化順序回到預設；有圖片時預覽從頭播放。null＝取消（無動態） */
export function selectEffect(effect: EffectId | null): void {
  const images = useSession.getState().images;
  if (!effect) {
    patchSettings({ effect: null, fileName: null });
    setStatus('info', S.status.noMotion);
    return;
  }
  const spec = EFFECTS[effect];
  patchSettings({
    effect,
    secondsText: String(spec.seconds),
    loop: spec.loop,
    fadeIn: false,
    fileName: null,
  });
  const s = useSettings.getState().data;
  const extra = isSwitch(effect)
    ? switchHint(effect, images.length, s.filter)
    : isFade(effect) && images.length
      ? S.status.fadeHint
      : '';
  setStatus('info', S.status.effect(effectName(effect), loopWord(spec.loop), extra));
  if (images.length) useSession.setState((st) => ({ playSeq: st.playSeq + 1 }));
}

export function selectFilter(filter: FilterChoice): void {
  patchSettings({ filter, fileName: null });
  const s = useSettings.getState().data;
  const images = useSession.getState().images;
  const extra =
    s.effect && isSwitch(s.effect) && images.length === 1 && filter !== 'none'
      ? S.status.switchSingle(filterName(filter))
      : !s.effect && filter !== 'none' && images.length
        ? S.status.stillReady
        : '';
  setStatus('info', S.status.filter(filterName(filter), extra));
}

export const setLoop = (loop: boolean) => patchSettings({ loop, fileName: null });

/* ---------- 順序 ---------- */

/** 轉場順序：把第 from 張移到 to 的位置（原檔名段不變） */
export function reorderImages(from: number, to: number): void {
  const { images } = useSession.getState();
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
  useSession.setState({ images: moveItem(images, from, to) });
  const e = useSettings.getState().data.effect;
  setStatus('info', S.status.order(images.length, isSwitch(e) ? SWITCH_VERB[e] : ''));
}

/** 淡化順序：「圖片 → 顏色」與「顏色 → 圖片」互換 */
export function swapFadeOrder(): void {
  const fadeIn = !useSettings.getState().data.fadeIn;
  patchSettings({ fadeIn });
  setStatus('info', fadeIn ? S.status.fadeIn : S.status.fadeOut);
}

/* ---------- 清除 ---------- */

/** 清掉圖片與濾鏡（效果、秒數、畫質、尺寸、循環維持不變） */
export function clearImages(): void {
  useSession.setState((st) => ({
    images: [],
    sourceBase: null,
    firstFrame: null,
    loadSeq: st.loadSeq + 1,
  }));
  patchSettings({ filter: 'none', fadeIn: false, fileName: null });
  setStatus('info', S.status.reset);
}
