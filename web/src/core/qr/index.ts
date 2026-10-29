/**
 * core/qr：QR code 的編碼（qrcode-generator）、有樣式的畫法（點、角、漸層、中間的圖、圓形；
 * 參考 kozakdenys/qr-code-styling 改寫）、canvas 與 SVG 輸出、解碼與讀得出來的檢查。
 *
 * ```ts
 * const r = encodeQr('https://example.com', { ecl: 'Q' });            // 版本自動、模式自動
 * if (r.ok) {
 *   const s = buildQrScene(r.code, r.code.ecl, style);              // QrStyle：大小、點、角、背景、圖
 *   if (s.ok) { drawQrScene(ctx, s.scene, { image }); const svg = qrSceneToSvg(s.scene, { imageHref }); }
 * }
 * const check = checkQrPixels({ pixels, width, height, grid: scene.grid });   // 讀回來的文字
 * ```
 */
export * from './canvas';
export * from './check';
export * from './decode';
export * from './encode';
export * from './figures';
export * from './style';
export * from './svg';
export { alignmentPositions, functionMask } from './tables';
