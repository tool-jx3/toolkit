/**
 * 去背的像素處理 Worker：讀圖、色鍵、AI 的前後處理、邊緣調整、匯出（pixelApi.ts 的 createPixelApi）。
 * 呼叫依序處理；結果的像素以 transfer 傳回。
 */
import { exposeApi } from '@/core/worker';
import { createPixelApi } from './pixelApi';

exposeApi(createPixelApi());
