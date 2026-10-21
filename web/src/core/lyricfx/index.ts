/**
 * core/lyricfx：歌詞演出（lyric-fx 移植時新增；規格 docs/refactor/specs/lyric-fx.md 第 3 節）。
 *
 * ```ts
 * const built = buildLyricLines(lrcText, { language: 'both', offset: 0, filters, overrides });   // 要排的句（3.2）
 * const style = getLyricStyle('scatter');
 * const settings = style.normalize(saved);
 * const plan = style.plan(built.lines, settings, seed, { width: 1920, height: 1080 }, createCanvasMeasure());
 * style.draw(ctx, t, plan, settings, { x: 0, y: 0, width: 1920, height: 1080 });   // 時間 t 的那一格（不畫背景）
 * ```
 *
 * - 演出風格做成 `LyricStyle` 介面（types.ts）；工具本體不知道是哪一種。新增風格：`styles/<id>/`＋`styles/index.ts` 的清單。
 * - `draw` 可以畫進任何矩形（基準畫面＝短邊 1080，等比例縮放、置中）：music-frame 之後可以在它的版面裡留一塊畫歌詞。
 * - 亂數由種子決定（random.ts），抖動是時間的函式（jitter.ts）：同樣的設定，預覽、逐格匯出每次都一樣。
 * - 設定面板由風格的 `controls`（純資料）描述，共用元件 `@/ui` 的 `LyricStyleControls` 照著產生。
 */
export * from './jitter';
export * from './lines';
export * from './measure';
export * from './perspective';
export * from './random';
export * from './styles';
export * from './types';
