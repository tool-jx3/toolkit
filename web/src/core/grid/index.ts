/**
 * core/grid：方格與六角格的幾何（G10 地圖與網格共用）。全部是純函式，Node 可以直接測。
 *
 * - square.ts：方格的像素↔格子、中心、縮小後的範圍、角、鄰格、吸附點、拖曳吸附、格線。
 * - hex.ts：六角格的尺寸（一般／網格化）、角、軸座標（像素↔格子、鄰格、吸附、格線）、odd-q 偏移座標。
 * - sheet.ts：一整張六角格圖（網格產生器）的排法、畫布尺寸、CCFOLIA 用的格數。
 * - coords.ts：座標文字（1-1、1,1、0101、A1、流水號；起點四角、從 0／1；六角格的列算法）。
 * - distance.ts：距離（方格 5 種、六角格的步數與直線近似）。
 * - hit.ts：最近的格子中心、滑鼠位置換算成畫布座標。
 * - outline.ts：一群格子的外框（地圖編輯器的填色合併）。
 * - edges.ts：方格的邊依兩側的格子分類、接成長段（室內平面圖的自動牆壁），一維區間的扣除（門窗切開牆）。
 * - mapGrid.ts：地圖編輯器的網格種類（方格、四種六角格）包成同一組介面、吸附的最近點。
 * - canvas.ts：線型、色碼 → canvas 的 rgba 字串。
 *
 * ```ts
 * const m = hexMetrics(48, { orientation: 'flat', fit: true });
 * const cell = pixelToAxial(x, y, m);                 // 點到哪一格
 * const corners = hexCorners(axialCenter(cell.q, cell.r, m), m);
 * squareDistance(3, 4, 'round');                     // 5
 * squareCoordLabel(0, 0, { cols: 10, rows: 10, origin: 'bl', format: 'letter', start: 1 }); // 'A10'
 * ```
 */
export * from './canvas';
export * from './coords';
export * from './distance';
export * from './edges';
export * from './hex';
export * from './hit';
export * from './mapGrid';
export * from './outline';
export * from './sheet';
export * from './square';
export * from './types';
