export function num(p: Record<string, any>, key: string, def: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}
export function str(p: Record<string, any>, key: string, def: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : def;
}
export function bool(p: Record<string, any>, key: string, def: boolean): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : def;
}
/** テキスト外接矩形の外接円半径 */
export function textRadius(box: { x: number; y: number; w: number; h: number }): number {
  return Math.hypot(box.w, box.h) / 2;
}
