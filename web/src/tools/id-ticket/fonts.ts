/**
 * 字型載入（規格 F02、5 節）：
 * - 預覽、縮圖畫的時候順便記下用到的字型與字（kit 的 `fonts`），交給 `requestFonts`：
 *   只把還沒要求過的字記下，輸入停下 400 ms 後一次載入（第一次馬上載）；打字時不另外「畫一次收集字型」。
 * - 字型載好（或任何字型載入完成）時清掉量過的字寬、計數加 1，預覽與縮圖依它重畫（字寬改變、縮放與「…」跟著變）。
 * - 匯出前用 `ensureAll` 等全部載好。
 */
import { create } from 'zustand';
import { ensureFont } from '@/core/fonts';
import { clearTextWidths, type FontUse } from './kit';

/** 輸入停下多久之後載入新字 */
export const FONT_IDLE_MS = 400;

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => {
  clearTextWidths();
  useTick.setState((s) => ({ tick: s.tick + 1 }));
};

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', bump);
}

/** 字型載入的計數（放進重畫的依賴，載好後重畫） */
export function useFontTick(): number {
  listen();
  return useTick((s) => s.tick);
}

/** 等這些字型＋字載好（匯出前）；之後量字寬重來 */
export async function ensureAll(list: readonly FontUse[]): Promise<void> {
  await Promise.all(list.map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)));
  clearTextWidths();
}

/** 要求過的字（「字型|字重」→ 字） */
const requested = new Map<string, Set<string>>();
/** 還沒送出的新字 */
let pending = new Map<string, Set<string>>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** 已經載過一批（第一批之前的要求都馬上載） */
let flushed = false;

function flush(): void {
  timer = null;
  flushed = true;
  const list: FontUse[] = [...pending.entries()].map(([k, set]) => {
    const [family, weight] = k.split('|');
    return { family, weight: Number(weight), text: [...set].join('') };
  });
  pending = new Map();
  if (list.length) void ensureAll(list).then(bump);
}

/**
 * 畫的時候收集到的字型與字：只有還沒要求過的字才算；有新字時計時重來，停下 FONT_IDLE_MS 後一次載入
 * （還沒載過任何字時馬上載）。載好後重畫。
 */
export function requestFonts(uses: readonly FontUse[]): void {
  let added = false;
  for (const u of uses) {
    const k = `${u.family}|${u.weight}`;
    const have = requested.get(k) ?? new Set<string>();
    for (const ch of u.text) {
      if (have.has(ch)) continue;
      have.add(ch);
      const p = pending.get(k) ?? new Set<string>();
      p.add(ch);
      pending.set(k, p);
      added = true;
    }
    requested.set(k, have);
  }
  if (!added) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(flush, flushed ? FONT_IDLE_MS : 0);
}

/** 測試用：忘掉要求過的字 */
export function resetRequestedFonts(): void {
  requested.clear();
  pending = new Map();
  flushed = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
