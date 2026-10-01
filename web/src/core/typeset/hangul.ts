/**
 * 韓文音節拆字（打字效果用）與逐字顯示的步驟。
 *
 * 韓文音節＝初聲＋中聲（＋收尾子音），Unicode 以 0xAC00 ＋（初聲 × 21 ＋ 中聲）× 28 ＋ 收尾 編碼。
 * 打字時一個音節分 2～3 步出現：初聲字母 → 沒有收尾子音的音節 →（有收尾時）完整音節。
 * 例：「한」→ ㅎ、하、한；「가」→ ㄱ、가。
 */

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
/** 19 個初聲對應的相容字母（顯示用，單獨出現時是完整的字母） */
const INITIAL_COMPAT = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/** 是不是韓文音節（가～힣） */
export function isHangulSyllable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return ch.length === 1 && c >= SYLLABLE_FIRST && c <= SYLLABLE_LAST;
}

/**
 * 一個字打出來的過程：韓文音節回傳 2～3 步（初聲字母、無收尾的音節、完整音節），其他字回傳 [字]。
 */
export function hangulSteps(ch: string): string[] {
  if (!isHangulSyllable(ch)) return [ch];
  const idx = (ch.codePointAt(0) ?? 0) - SYLLABLE_FIRST;
  const initial = Math.floor(idx / (21 * 28));
  const final = idx % 28;
  const open = String.fromCodePoint(SYLLABLE_FIRST + idx - final);
  const steps = [INITIAL_COMPAT[initial], open];
  if (final > 0) steps.push(ch);
  return steps;
}

export interface TypingStep {
  /** 第幾個字（chars 的索引） */
  index: number;
  /** 這一步在那個字的位置上顯示的字（韓文的中間步驟是字母或無收尾的音節） */
  ch: string;
  /** 這一步之後那個字就完整了 */
  final: boolean;
}

/**
 * 逐字顯示的步驟：每個字一步（換行、空白也算一步），韓文音節依 hangulSteps 拆成 2～3 步（hangul: false 時不拆）。
 * reverse：從最後一個字往前出現（每個韓文音節本身仍依組字順序）。
 * 「先排好全文、再逐字顯示」：每一步都畫在那個字最終的位置上。
 */
export function typingSteps(
  chars: readonly string[],
  { hangul = true, reverse = false }: { hangul?: boolean; reverse?: boolean } = {},
): TypingStep[] {
  const out: TypingStep[] = [];
  const order = chars.map((_, i) => i);
  if (reverse) order.reverse();
  for (const index of order) {
    const steps = hangul ? hangulSteps(chars[index]) : [chars[index]];
    steps.forEach((ch, k) => {
      out.push({ index, ch, final: k === steps.length - 1 });
    });
  }
  return out;
}

/**
 * 做完前 count 步時，每個字顯示什麼（null＝還沒出現）。
 * 例：「한글」做完 4 步 → ['한', 'ㄱ']。
 */
export function typingVisibleAt(
  chars: readonly string[],
  steps: readonly TypingStep[],
  count: number,
): (string | null)[] {
  const out: (string | null)[] = chars.map(() => null);
  const n = Math.min(steps.length, Math.max(0, Math.floor(count)));
  for (let k = 0; k < n; k++) out[steps[k].index] = steps[k].ch;
  return out;
}
