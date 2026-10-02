/**
 * 使用者操作：載入影片、範例影片、選取區間、裁切、樣本影格、結果。短暫通知透過 ToastBridge 取得的 toast 函式。
 */
import { copyText, readAsDataUrl } from '@/core/files';
import { createVideoGrabber, evenSampleTimes, probeVideo, type VideoGrabber } from '@/core/video';
import type { ToastOptions } from '@/ui';
import {
  DEFAULT_CROP,
  endAt,
  fileBaseOf,
  isVideoFile,
  MIN_CLIP_SECONDS,
  normalizeCrop,
  type PixelRect,
  startAt,
  THUMB_COUNT,
} from './logic';
import { makeSampleVideo } from './sample';
import { type ExportResultInfo, useSession } from './store';
import { S } from './strings';

/* ---------- 通知 ---------- */

let toaster: ((o: ToastOptions) => void) | null = null;

export const setToaster = (fn: ((o: ToastOptions) => void) | null) => {
  toaster = fn;
};

export const notify = (o: ToastOptions) => toaster?.({ duration: 3000, ...o });

/* ---------- 抽影格器（看不見的影片元素；換影片時換掉） ---------- */

let grabber: { id: number; g: VideoGrabber } | null = null;

/** 目前影片的抽影格器（第一次用到時才建立） */
export function getGrabber(): VideoGrabber | null {
  const v = useSession.getState().video;
  if (!v) return null;
  if (grabber?.id !== v.id) {
    grabber?.g.close();
    grabber = { id: v.id, g: createVideoGrabber(v.url) };
  }
  return grabber.g;
}

/* ---------- 預覽的影片元素（快捷鍵、裁切對話框用） ---------- */

interface PreviewPlayer {
  el: HTMLVideoElement | null;
  toggle: () => void;
}

let player: PreviewPlayer | null = null;

/** 預覽欄把影片元素與播放切換交過來（卸載時傳 null） */
export const registerPreview = (p: PreviewPlayer | null) => {
  player = p;
};

/** 預覽目前的時間（秒） */
export const previewTime = (): number => player?.el?.currentTime ?? 0;

export const togglePreview = () => player?.toggle();

export const pausePreview = () => player?.el?.pause();

/** 預覽目前畫面的點陣圖（裁切對話框用） */
export async function previewFrameBitmap(): Promise<ImageBitmap | null> {
  const el = player?.el;
  if (!el || el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  el.pause();
  try {
    return await createImageBitmap(el);
  } catch {
    return null;
  }
}

/* ---------- 載入 ---------- */

let loadSeq = 0;

const clearResult = () => {
  const r = useSession.getState().result;
  if (r) URL.revokeObjectURL(r.url);
};

/** 載入一支影片（多個檔案只取第一個）。不是影片、讀不到時通知並保留原本的影片。 */
export async function loadVideoFile(file: File): Promise<boolean> {
  if (useSession.getState().exporting) return false;
  if (!isVideoFile(file)) {
    notify({
      title: S.toast.notVideo,
      description: S.toast.notVideoHint(file.name),
      tone: 'danger',
    });
    return false;
  }
  const seq = ++loadSeq;
  const url = URL.createObjectURL(file);
  useSession.setState({ loading: true });
  try {
    const info = await probeVideo(url);
    if (seq !== loadSeq) {
      URL.revokeObjectURL(url);
      return false;
    }
    const prev = useSession.getState().video;
    if (prev) URL.revokeObjectURL(prev.url);
    grabber?.g.close();
    grabber = null;
    clearResult();
    useSession.setState({
      video: {
        id: seq,
        name: file.name,
        base: fileBaseOf(file.name),
        url,
        width: info.width,
        height: info.height,
        duration: info.duration,
      },
      loading: false,
      start: 0,
      end: info.duration,
      result: null,
      thumbs: null,
      thumbsBusy: false,
    });
    notify({ title: S.toast.loaded, tone: 'success' });
    return true;
  } catch (e) {
    URL.revokeObjectURL(url);
    if (seq === loadSeq) useSession.setState({ loading: false });
    notify({
      title: S.toast.loadFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
      duration: 6000,
    });
    return false;
  }
}

/** 產生範例影片並載入 */
export async function loadSample(): Promise<void> {
  const st = useSession.getState();
  if (st.sampling || st.exporting) return;
  useSession.setState({ sampling: true });
  notify({ title: S.toast.sampleMaking, tone: 'info' });
  try {
    const file = await makeSampleVideo();
    await loadVideoFile(file);
  } catch (e) {
    notify({
      title: S.toast.sampleFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  } finally {
    useSession.setState({ sampling: false });
  }
}

/* ---------- 選取區間 ---------- */

export function setStartHere(current: number): void {
  const st = useSession.getState();
  if (!st.video || st.exporting) return;
  const start = startAt(current, st);
  useSession.setState({ start });
  notify({ title: S.toast.startSet(start), tone: 'info' });
}

export function setEndHere(current: number): void {
  const st = useSession.getState();
  if (!st.video || st.exporting) return;
  const end = endAt(current, st, st.video.duration);
  useSession.setState({ end });
  notify({ title: S.toast.endSet(end), tone: 'info' });
}

export function resetRange(): void {
  const st = useSession.getState();
  if (!st.video || st.exporting) return;
  useSession.setState({ start: 0, end: st.video.duration });
}

/* ---------- 裁切 ---------- */

/** 開關裁切；開啟時範圍重設為中央 80% */
export function setCropOn(on: boolean): void {
  if (useSession.getState().exporting) return;
  useSession.setState(on ? { cropOn: true, crop: DEFAULT_CROP } : { cropOn: false });
}

/** 以影片像素設定裁切範圍 */
export function setCropPixels(rect: PixelRect): void {
  const v = useSession.getState().video;
  if (!v || useSession.getState().exporting) return;
  useSession.setState({ crop: normalizeCrop(rect, v.width, v.height) });
}

/* ---------- 樣本影格 ---------- */

export async function makeThumbnails(): Promise<void> {
  const st = useSession.getState();
  const g = getGrabber();
  if (!st.video || !g || st.thumbsBusy) return;
  const times = evenSampleTimes(st.start, st.end, THUMB_COUNT, MIN_CLIP_SECONDS);
  useSession.setState({ thumbsBusy: true, thumbs: [] });
  const id = st.video.id;
  try {
    await g.thumbnails(times, {
      maxWidth: 320,
      maxHeight: 180,
      onThumb: (t) => {
        if (useSession.getState().video?.id !== id) return;
        useSession.setState((s) => ({ thumbs: [...(s.thumbs ?? []), t] }));
      },
    });
  } catch (e) {
    notify({
      title: S.toast.loadFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  } finally {
    useSession.setState({ thumbsBusy: false });
  }
}

/* ---------- 結果 ---------- */

export function setResult(info: { blob: Blob; fileName: string }): void {
  clearResult();
  const result: ExportResultInfo = { ...info, url: URL.createObjectURL(info.blob) };
  useSession.setState({ result });
}

export function openResultInNewTab(): void {
  const r = useSession.getState().result;
  if (r) window.open(r.url, '_blank', 'noopener');
}

export async function copyResultDataUrl(): Promise<void> {
  const r = useSession.getState().result;
  if (!r) return;
  const ok = await copyText(await readAsDataUrl(r.blob));
  notify(
    ok ? { title: S.toast.copied, tone: 'success' } : { title: S.toast.copyFailed, tone: 'danger' },
  );
}
