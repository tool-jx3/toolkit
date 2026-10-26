/**
 * core/imagefx：圖片演出引擎（截圖演出產生器、地圖演出產生器共用；規格 docs/refactor/specs/screenshot-fx.md、map-fx.md）。
 *
 * 在一張圖上疊「演出框」，依四段時間軸（開場、彈出、動作、結尾）做成會動的畫面：
 * - 畫面與背景（模糊、透明、單色）、圖的擺放（大小、圓角、陰影、聚光）、出處（三種位置）——layout.ts、render.ts；
 * - 放大框（彈出、過衝回彈、周圍變暗；樣式由工具畫）、塗黑（黑塊、馬賽克、毛玻璃＋工具自己的樣式；靜止、揭開、蓋上；
 *   橫向、直向或整塊淡出；邊界演出）——render.ts；工具自己的標記（螢光筆、路線…）由 RenderKit.drawMark 畫；
 * - 時間軸（依序／同時）、逐步公開、運鏡——timeline.ts；編輯區的倍率、疊放順序、檔名——view.ts；
 * - 匯出（PNG、APNG、MP4／透明 WebM、逐步公開／圖層／連番 PNG 的 ZIP）——export.ts（createFxExporter）；
 * - 狀態與動作（復原、偏好、選取、資產、框的新增／複製／刪除…）——store.ts（createFxStore）；
 * - 圖片的載入、專案檔——media.ts。
 * 介面的共用元件在 `@/ui/imagefx`（ImageFx* 開頭；不在 `@/ui` 的總入口）。
 *
 * ```ts
 * const kit: RenderKit<MyFrame> = { isAction, drawMark, paintCard, paintRedact };
 * const fx = createFxStore({ toolId: 'my-fx', version: 1, initialState, normalizeState, … });
 * const exporter = createFxExporter(kit, 'my-fx', S);
 * renderFrame(ctx, { state, image }, t, cache, kit);
 * ```
 */
export * from './export';
export * from './layout';
export * from './media';
export * from './render';
export * from './store';
export * from './timeline';
export * from './types';
export * from './view';
