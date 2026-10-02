/**
 * core/video：瀏覽器影片的讀取與抽影格（G8：影片轉動圖）。
 *
 * ```ts
 * const info = await probeVideo(file);                    // { width, height, duration }（總長未知的 WebM 會先算出來）
 * const { times } = clipSampleTimes({ start: 1, end: 3, fps: 30, speed: 1 });   // 60 個時間點
 * const grabber = createVideoGrabber(url);                // 看不見的影片元素，依序跳轉
 * for (const t of times) await grabber.frameAt(t, (v) => drawVideoFrame(ctx, v, { crop }));
 * const blob = await recordCanvas({ width: 640, height: 360, seconds: 3, draw });   // 畫布錄成 WebM
 * ```
 *
 * - 解碼交給瀏覽器（<video>）：能播放的格式都能讀；讀不到丟 VideoLoadError（訊息可直接顯示）。
 * - 取樣時間＝起點 + i × (速度 ÷ fps)，影格數＝⌊長度 ÷ 間隔⌋；跳轉時加 1 毫秒避開兩格交界的浮點誤差（FRAME_SEEK_EPSILON）。
 * - 縮放預設用高畫質（imageSmoothingQuality 'high'）。
 */
export {
  createVideoGrabber,
  type DrawVideoFrameOptions,
  drawVideoFrame,
  type VideoCrop,
  type VideoGrabber,
  type VideoThumbnail,
} from './capture';
export {
  type ClipSampleOptions,
  type ClipSamples,
  clipSampleTimes,
  evenSampleTimes,
  FRAME_SEEK_EPSILON,
  fitWithin,
  seekTimeFor,
} from './frames';
export {
  ensureFiniteDuration,
  FRAME_WAIT_MS,
  type OpenVideoOptions,
  openVideo,
  probeVideo,
  type SeekOptions,
  seekVideo,
  type VideoHandle,
  type VideoInfo,
  VideoLoadError,
} from './open';
export {
  canRecordCanvas,
  pickRecordingType,
  type RecordCanvasOptions,
  recordCanvas,
} from './record';
