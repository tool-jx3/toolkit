/**
 * 自動綁定與 PSD 檢查的訊息（Worker 裡也會用，所以和 strings.ts 分開、不依賴其他模組）。
 */

export type RigErrorCode =
  | 'canvasSize'
  | 'canvasTooBig'
  | 'tooDeep'
  | 'tooManyLayers'
  | 'layerSize'
  | 'layerData'
  | 'totalPixels'
  | 'noLayers'
  | 'memory'
  | 'noPixels';

export const RIG_ERRORS: Record<RigErrorCode, string> = {
  canvasSize: 'PSD 的畫布尺寸不正確。',
  canvasTooBig: '畫布太大（最多 2,400 萬像素、單邊 16,384 px）。',
  tooDeep: '資料夾的層數太深（最多 64 層）。',
  tooManyLayers: '圖層太多（最多 1,000 個）。',
  layerSize: '圖像圖層的尺寸不正確或太大。',
  layerData: '圖像圖層的像素資料不正確。',
  totalPixels: '圖層圖像的總量太大（最多 9,600 萬像素）。',
  noLayers: '找不到看得到的圖像圖層。',
  memory: '自動綁定需要的記憶體太大，請減少圖層數或縮小 PSD。',
  noPixels: '畫布裡沒有看得到的像素。',
};

export type RigWarningCode =
  | 'emptyLayer'
  | 'noFace'
  | 'unknownLayer'
  | 'splitFailed'
  | 'eyeAnchor'
  | 'noMouth'
  | 'synthEye'
  | 'synthMouth';

/** 警告（args：圖層名稱，unknownLayer 的第二個是 'head'／'body'） */
export interface RigWarning {
  code: RigWarningCode;
  args: string[];
}

const GROUP_NAME: Record<string, string> = { head: '頭部', body: '身體' };

export function warningText(w: RigWarning): string {
  const [a = '', b = ''] = w.args;
  switch (w.code) {
    case 'emptyLayer':
      return `已略過空白圖層「${a}」。`;
    case 'noFace':
      return '沒有 face 圖層，以畫布中央當作臉。';
    case 'unknownLayer':
      return `不認得的圖層名稱「${a}」，讓它跟著${GROUP_NAME[b] ?? b}動。`;
    case 'splitFailed':
      return `「${a}」無法分成左右（可能是空白圖層）。`;
    case 'eyeAnchor':
      return '眼睛的錨點不完整（請確認 eyewhite／irides 圖層）。';
    case 'noMouth':
      return '沒有 mouth_open／mouth_close 圖層。';
    case 'synthEye':
      return '已自動放上缺少的閉眼（可以用「眼睛」的差分滑桿調整）。';
    case 'synthMouth':
      return '沒有 mouth_close，已自動放上通用的閉嘴（可以用「嘴巴」的滑桿調整）。';
  }
}

/** PSD 檔頭的檢查（runtime.validateHeader） */
export const HEADER_ERRORS = {
  short: 'PSD 檔案太短。',
  tooLarge: 'PSD 請控制在 128 MB 以下。',
  notPsd: '不是支援的 PSD 檔案（不支援 PSB）。',
  size: 'PSD 的尺寸請控制在單邊 16,384 px、2,400 萬像素以內。',
  depth: '請把 PSD 重新存成 RGB、8 位元／色版。',
} as const;

/** 讀入 PSD 的進度（Worker 送出） */
export const LOAD_STEPS = {
  checking: '正在確認圖層結構…',
  decoding: '正在展開圖像…',
  denoising: '正在去除雜訊…',
  building: '正在產生部件與錨點…',
} as const;
