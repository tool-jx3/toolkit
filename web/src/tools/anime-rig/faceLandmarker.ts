/**
 * MediaPipe tasks-vision 的 FaceLandmarker（第一次開攝影機追蹤時才以 import() 載入這個模組）。
 *
 * - JS 從 npm 打包；WebAssembly（SIMD 版的 loader＋wasm，約 13 MB）由 Vite 以 `?url` 複製到 `assets/build/`，
 *   只有建立偵測器時才下載（規格 3.5、D3）。
 * - 模型從 `core/models` 的快取讀（下載時已驗 SHA-256，讀的時候再驗一次）。
 * - 影片模式、1 張臉、信心 0.5、CPU。
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

export async function createFaceDetector(spec: ModelSpec): Promise<FaceDetector> {
  if (!(await FilesetResolver.isSimdSupported())) throw new Error(S.devErrors.noSimd);
  const bytes = await loadModel(spec);
  const landmarker = await FaceLandmarker.createFromOptions(
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
