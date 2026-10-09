/**
 * MediaPipe tasks-vision 的 FaceLandmarker（第一次開攝影機追蹤時才以 import() 載入這個模組）。
 *
 * - JS 從 npm 打包；WebAssembly（SIMD 版的 loader＋wasm，約 13 MB）由 Vite 以 `?url` 複製到 `assets/build/`，
 *   只有建立偵測器時才下載（規格 3.5、D3）。
 * - 模型從 `core/models` 的快取讀（下載時已驗 SHA-256，讀的時候再驗一次）。
 * - 影片模式、1 張臉、信心 0.5、CPU。
 * - 不送使用統計：tasks-vision 會把使用統計 POST 到 odml.pa.googleapis.com，只攔下這個網址（blockTelemetry）。
 * - WebAssembly 印到 stderr 的 INFO／警告不以 console.error 印出（wasmPrintErr）。
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { loadModel, type ModelSpec } from '@/core/models';
import type { Landmark } from './faceFeatures';
import { S } from './strings';

export interface FaceDetector {
  /** 一格影片 → 第一張臉的 478 個特徵點（沒有臉時 null）；timestampMs 要遞增 */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null;
  close(): void;
}

const abs = (u: string) => new URL(u, document.baseURI).href;

/* ---------- 使用統計 ---------- */

/**
 * tasks-vision 1.1.0 的使用統計：用 fetch 把任務名稱、版本、處理時間（不含影像）POST 到這個網址，
 * 每 60 秒一次、關閉偵測器時再送一次，沒有選項可以關（vision_bundle 的 usage logger）。
 * 本站不送（規格 F54、D3）：只攔下這個網址的 fetch，在瀏覽器裡回應 204（不是 200，它當作送不出去，
 * 之後不再送），其他請求照常交給原本的 fetch。
 */
export const TELEMETRY_URL_PREFIX = 'https://odml.pa.googleapis.com/';
let telemetryBlocked = false;

export function blockTelemetry(): void {
  if (telemetryBlocked || typeof globalThis.fetch !== 'function') return;
  telemetryBlocked = true;
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(TELEMETRY_URL_PREFIX))
      return Promise.resolve(new Response(null, { status: 204 }));
    return original(input, init);
  }) as typeof fetch;
}

/* ---------- WebAssembly 的訊息 ---------- */

/**
 * WebAssembly（Emscripten）印到 stderr 的每一行預設用 console.error，連「INFO: Created TensorFlow Lite XNNPACK
 * delegate for CPU.」也算錯誤。tasks-vision 建立模組時沿用 `self.Module` 的設定（printErr），
 * 這裡依記錄的等級分流：INFO／I 開頭 → console.debug，WARNING／W 開頭 → console.warn，其他（E、F、沒有等級）照舊 console.error。
 */
export function wasmPrintErr(...args: unknown[]): void {
  const text = args.map(String).join(' ');
  if (/^(INFO:|I\d{4}\s)/.test(text)) console.debug(text);
  else if (/^(WARNING:|W\d{4}\s)/.test(text)) console.warn(text);
  else console.error(text);
}

type ModuleGlobal = { Module?: { printErr?: (...a: unknown[]) => void } };

export async function createFaceDetector(spec: ModelSpec): Promise<FaceDetector> {
  if (!(await FilesetResolver.isSimdSupported())) throw new Error(S.devErrors.noSimd);
  blockTelemetry();
  const bytes = await loadModel(spec);
  const g = globalThis as unknown as ModuleGlobal;
  const moduleConfig = { printErr: wasmPrintErr };
  g.Module = moduleConfig;
  let landmarker: FaceLandmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(
      { wasmLoaderPath: abs(wasmLoaderUrl), wasmBinaryPath: abs(wasmBinaryUrl) },
      {
        baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      },
    );
  } finally {
    /* tasks-vision 建立模組後會清掉；載入失敗時這裡清 */
    if (g.Module === moduleConfig) g.Module = undefined;
  }
  return {
    detect(video, t) {
      const res = landmarker.detectForVideo(video, t);
      return (res.faceLandmarks?.[0] as Landmark[] | undefined) ?? null;
    },
    close() {
      landmarker.close();
    },
  };
}
