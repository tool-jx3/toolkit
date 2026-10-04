/**
 * 不在元件裡的動作：通知（ToolShell 的 toast）、目前的 3D 引擎、加入圖片、陀螺儀。
 */
import type { ToastOptions } from '@/ui';
import type { AcrylicEngine } from './engine';
import { addImageFile, markSessionAsset } from './media';
import { useSession } from './store';
import { S } from './strings';

type Toast = (o: ToastOptions) => void;
let toaster: Toast = () => {};
export function setToaster(fn: Toast | null): void {
  toaster = fn ?? (() => {});
}
export const notify = (o: ToastOptions): void => toaster(o);

let engine: AcrylicEngine | null = null;
export const setEngine = (e: AcrylicEngine | null): void => {
  engine = e;
};
export const getEngine = (): AcrylicEngine | null => engine;

let warnedNotSaved = false;

/** 加入一張圖：成功回傳 id；不是圖片時通知並回傳 null */
export async function addImage(file: File): Promise<string | null> {
  try {
    const r = await addImageFile(file);
    markSessionAsset(r.id);
    if (!r.persisted && !warnedNotSaved) {
      warnedNotSaved = true;
      notify({ title: S.image.notSaved, tone: 'warning' });
    }
    return r.id;
  } catch {
    notify({ title: S.image.notImage(file.name || '圖片'), tone: 'danger' });
    return null;
  }
}

/* ---------- 陀螺儀（規格 F37～F40） ---------- */

const onOrientation = (e: DeviceOrientationEvent) => {
  engine?.setOrientation(e.gamma, e.beta);
};

function enterGyro(): void {
  window.addEventListener('deviceorientation', onOrientation);
  engine?.setGyro(true);
  useSession.setState({ immersive: true });
}

/** 「開啟陀螺儀」：iOS 先要求權限；不支援時通知 */
export async function enableGyro(): Promise<void> {
  const DOE = (globalThis as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      const state = await DOE.requestPermission();
      if (state === 'granted') enterGyro();
      else notify({ title: S.gyro.denied, tone: 'danger' });
    } catch {
      notify({ title: S.gyro.noRequest, tone: 'danger' });
    }
  } else if (DOE) {
    enterGyro();
  } else {
    notify({ title: S.gyro.unsupported, tone: 'danger' });
  }
}

export function exitGyro(): void {
  window.removeEventListener('deviceorientation', onOrientation);
  engine?.setGyro(false);
  useSession.setState({ immersive: false });
}
