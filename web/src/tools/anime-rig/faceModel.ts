/**
 * 臉部特徵點模型（MediaPipe Face Landmarker）：第一次開攝影機追蹤前由使用者下載，驗 SHA-256、存在瀏覽器（規格 F54、3.5）。
 * 網址固定 MediaPipe 官方 models 路徑的版本 1（float16）。
 */
import type { ModelSpec } from '@/core/models';

export const FACE_LANDMARKER_MODEL: ModelSpec = {
  id: 'mediapipe-face-landmarker-f16-v1',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  bytes: 3_758_596,
  sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  name: 'Face Landmarker（face_landmarker.task）',
  source: 'Google 的 MediaPipe',
  license: 'Apache-2.0',
  homepage: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker',
};

/** 測試入口：e2e 以 addInitScript 設定 `window.__animeRigFaceModel` 換成別的模型網址或檔案 */
export function faceModelSpec(): ModelSpec {
  const override = (globalThis as { __animeRigFaceModel?: ModelSpec }).__animeRigFaceModel;
  return override && typeof override.url === 'string' ? override : FACE_LANDMARKER_MODEL;
}
