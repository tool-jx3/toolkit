/** 合併 className（略過 false／null／undefined） */
export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * className 裡有沒有指定寬度（w-*、size-*、flex-1）。
 * 元件預設 w-full；呼叫端給了寬度時就不要再加 w-full，避免兩個寬度互相衝突。
 */
export function hasWidthClass(className?: string): boolean {
  return !!className && /(^|\s)(w-|size-|flex-1(\s|$))/.test(className);
}

/** 呼叫端沒有指定寬度時才補 w-full */
export const fullWidthUnless = (className?: string): string =>
  hasWidthClass(className) ? '' : 'w-full';
