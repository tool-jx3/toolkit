/**
 * core/textfx：整段文字的裝飾層（外框、擠出、陰影、光暈、色差、挖空）、填色（漸層、金屬、彩虹、斜紋）、
 * 圖層合成工具（暫存畫布池、整層透明度、遮罩、加亮）與卡拉 OK 變色。G1 文字演出群組共用。
 *
 * ```ts
 * const r = typesetToFill({ main: text, mainFont: font }, { width: 480, height: 480, padPerSize: 0.14 });
 * const pos = { x: (480 - r.block.w) / 2, y: (480 - r.block.h) / 2 };
 * const shape = shapeFromTypeset(r, pos);
 * renderTextFx(ctx, shape, [
 *   { kind: 'outline', paint: { kind: 'solid', color: '#1b1030' }, width: r.size * 0.1 },
 *   { kind: 'outline', paint: { kind: 'solid', color: '#ffffff' }, width: r.size * 0.04 },
 *   { kind: 'fill', paint: { kind: 'rainbow' } },
 * ], { t, transform: { cx: 240, cy: 240, scale: 1 + 0.05 * Math.sin(t * Math.PI * 2) } });
 * ```
 */
export * from './fx';
export * from './karaoke';
export * from './layers';
export * from './paint';
export * from './shape';
