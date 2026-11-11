/**
 * 第 N 天的標示（規格 F124～F127、3.13）：時刻（18:00）、日程（第 1 天 早・午・晚・夜）、倒數（T-01:30）、階段（階段 2）。
 * 參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的四種時間模式（功能與數值），寫法是本站的。純計算。
 *
 * 存檔的時間仍是第 N 天的標準寫法（`第 1 天 18:00`；位置＝第 1 天 00:00 起的分鐘）：換標示不換算、CSV 照舊。
 * 這裡只管「寫到分」的時間怎麼顯示、怎麼讀；只到日的時間照第 N 天（「第 3 天」）。
 *
 * - 時刻：開始時刻起的 24 小時寫成「HH:MM」，範圍外的照第 N 天（「第 2 天 19:00」）；讀「HH:MM」時取開始時刻之後第一個。
 * - 日程：一天分成早（06:00～12:00）、午（12:00～18:00）、晚（18:00～24:00）、夜（00:00～06:00，算前一天），
 *   每段 6 小時；「第 N 天」從 06:00 換日。不在段的開頭時後面加時刻（「第 1 天 早 08:30」）。
 * - 倒數：T-0＝開始時刻＋時間幅；之前「T-01:30」、之後「T+00:15」（時可以超過 24）。
 * - 階段：階段 1＝開始時刻起的第一段（每段「階段的長度」分）；不在段的開頭時「階段 2 +15 分」。
 */

export type SessionStyle = 'clock' | 'schedule' | 'countdown' | 'phase';
export const SESSION_STYLES: readonly SessionStyle[] = ['clock', 'schedule', 'countdown', 'phase'];

export interface Session {
  style: SessionStyle;
  /** 開始時刻：第 1 天的幾分（0～1439） */
  start: number;
  /** 時間幅（分；倒數的 T-0＝開始時刻＋時間幅） */
  length: number;
  /** 每個階段的長度（分） */
  phase: number;
}

export const SESSION_DEFAULTS = { start: 18 * 60, length: 6 * 60, phase: 60 } as const;
export const SESSION_LIMITS = {
  /** 時間幅 15 分～7 天 */
  length: [15, 7 * 1440],
  /** 階段 5 分～1 天 */
  phase: [5, 1440],
} as const;

const DAY = 1440;
/** 日程：一段 6 小時，從 06:00 數 */
export const SLOT_MINUTES = 360;
export const SLOT_ORIGIN = 360;
export const SLOT_NAMES = ['早', '午', '晚', '夜'] as const;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const p2 = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${p2(Math.floor(mod(m, DAY) / 60))}:${p2(mod(m, DAY) % 60)}`;

export function defaultSession(style: SessionStyle): Session {
  return { style, ...SESSION_DEFAULTS };
}

const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** 讀回時整理（認不得的標示＝沒有） */
export function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!SESSION_STYLES.includes(r.style as SessionStyle)) return null;
  return {
    style: r.style as SessionStyle,
    start: int(r.start, 0, DAY - 1, SESSION_DEFAULTS.start),
    length: int(
      r.length,
      SESSION_LIMITS.length[0],
      SESSION_LIMITS.length[1],
      SESSION_DEFAULTS.length,
    ),
    phase: int(r.phase, SESSION_LIMITS.phase[0], SESSION_LIMITS.phase[1], SESSION_DEFAULTS.phase),
  };
}

/** 倒數的 T-0 */
export const zeroOf = (s: Session) => s.start + s.length;

/** 日程：第幾天（06:00 換日）、第幾段（0＝早…3＝夜）、段裡的第幾分 */
export function slotOf(v: number): { day: number; slot: number; off: number; slotStart: number } {
  const rel = v - SLOT_ORIGIN;
  const day = Math.floor(rel / DAY) + 1;
  const inDay = mod(rel, DAY);
  const slot = Math.floor(inDay / SLOT_MINUTES);
  const off = inDay - slot * SLOT_MINUTES;
  return { day, slot, off, slotStart: v - off };
}

/** 階段：第幾個階段、階段裡的第幾分 */
export function phaseOf(s: Session, v: number): { n: number; off: number } {
  const rel = v - s.start;
  const n = Math.floor(rel / s.phase) + 1;
  return { n, off: rel - (n - 1) * s.phase };
}

/** 倒數的文字：T-01:30、T+00:15（diff＝離 T-0 還有幾分） */
export function countdownText(diff: number): string {
  const sign = diff >= 0 ? '-' : '+';
  const a = Math.abs(Math.round(diff));
  return `T${sign}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}

/** 一段時間的長短（倒數的刻度用：「T-2 天」） */
export function countdownDays(diff: number): string {
  const sign = diff >= 0 ? '-' : '+';
  return `T${sign}${Math.abs(Math.round(diff / DAY))} 天`;
}

export const slotName = (slot: number) => SLOT_NAMES[mod(slot, 4)];

/** 階段的名稱 */
export const phaseLabel = (n: number) => `階段 ${n}`;

/**
 * 寫到分的時間的顯示（不失去精度：讀回來是同一個位置）；時刻在開始時刻起的 24 小時外時 null（照第 N 天）。
 */
export function sessionText(s: Session, v: number): string | null {
  switch (s.style) {
    case 'clock':
      return v >= s.start && v < s.start + DAY ? hhmm(v) : null;
    case 'schedule': {
      const t = slotOf(v);
      return `第 ${t.day} 天 ${slotName(t.slot)}${t.off ? ` ${hhmm(v)}` : ''}`;
    }
    case 'countdown':
      return countdownText(zeroOf(s) - v);
    default: {
      const t = phaseOf(s, v);
      return `${phaseLabel(t.n)}${t.off ? ` +${t.off} 分` : ''}`;
    }
  }
}

const SLOT_WORDS: [RegExp, number][] = [
  [/^(?:早上?|上午|朝)$/, 0],
  [/^(?:午|中午|下午|昼|白天)$/, 1],
  [/^(?:晚上?|傍晚|夕)$/, 2],
  [/^(?:夜|夜晚|深夜|半夜)$/, 3],
];

export type SessionParse = { ok: true; v: number } | { ok: false; error: string } | null;

const fail = (error: string): SessionParse => ({ ok: false, error });

/**
 * 讀標示的寫法（輸入已經 NFKC、全形冒號換成半形）。不是這種標示的寫法時 null（照第 N 天讀）。
 */
export function parseSession(s: Session, text: string): SessionParse {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (s.style === 'clock') {
    const m = /^(?:翌\s*)?(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 47 || mm > 59)
      return fail('時刻要寫成 HH:MM（00:00～23:59；隔天可以寫 24:00～47:59）');
    const base = hh * 60 + mm;
    /* 24:00 以後＝隔天；其他取開始時刻之後第一個 */
    if (hh >= 24 || /^翌/.test(t)) return { ok: true, v: hh >= 24 ? base : base + DAY };
    return { ok: true, v: base >= s.start ? base : base + DAY };
  }
  if (s.style === 'schedule') {
    const m =
      /^(?:第\s*|day\s*|d\s*)?(-?\d{1,5})\s*(?:天|日)?\s*[・·,，、]?\s*([^\d\s:]{1,2})(?:\s*(\d{1,2}):(\d{2}))?$/i.exec(
        t,
      );
    if (!m) return null;
    const hit = SLOT_WORDS.find(([re]) => re.test(m[2]));
    if (!hit) return null;
    const day = Number(m[1]);
    const slotStart = SLOT_ORIGIN + (day - 1) * DAY + hit[1] * SLOT_MINUTES;
    if (m[3] === undefined) return { ok: true, v: slotStart };
    const hh = Number(m[3]);
    const mm = Number(m[4]);
    if (hh > 23 || mm > 59) return fail('時刻要寫成 HH:MM（00:00～23:59）');
    let v = Math.floor(slotStart / DAY) * DAY + hh * 60 + mm;
    if (v < slotStart) v += DAY;
    if (v >= slotStart + SLOT_MINUTES)
      return fail(
        `${slotName(hit[1])}是 ${hhmm(slotStart)}～${hhmm(slotStart + SLOT_MINUTES)}，${p2(hh)}:${p2(mm)} 不在這一段`,
      );
    return { ok: true, v };
  }
  if (s.style === 'countdown') {
    const m = /^t\s*([-+])?\s*(.*)$/i.exec(t);
    if (!m) return null;
    const rest = m[2].trim();
    let diff: number | null = null;
    const hm = /^(\d{1,4}):(\d{2})$/.exec(rest);
    const mins = /^(\d{1,6})\s*(?:m|min|分鐘?)?$/i.exec(rest);
    const hours = /^(\d{1,4})\s*(?:h|小時|時)\s*(?:(\d{1,4})\s*(?:m|min|分鐘?)?)?$/i.exec(rest);
    if (hm) {
      if (Number(hm[2]) > 59) return fail('倒數要寫成 T-HH:MM（例：T-01:30）');
      diff = Number(hm[1]) * 60 + Number(hm[2]);
    } else if (mins) diff = Number(mins[1]);
    else if (hours) diff = Number(hours[1]) * 60 + Number(hours[2] ?? 0);
    if (diff === null) return fail(`看不懂這個時間：「${text}」（例：T-01:30、T-90m、T+15m）`);
    if (diff && !m[1]) return fail('倒數要寫成 T-…（T-0 之前）或 T+…（T-0 之後）');
    const v = zeroOf(s) - (m[1] === '+' ? -diff : diff);
    return { ok: true, v };
  }
  /* 階段 */
  const m =
    /^(?:階段|phase|p|第)\s*(-?\d{1,5})\s*(?:幕|階段)?(?:\s*\+\s*(\d{1,5})\s*(?:分鐘?|m|min)?)?$/i.exec(
      t,
    );
  if (!m) return null;
  const n = Number(m[1]);
  const off = Number(m[2] ?? 0);
  if (off >= s.phase) return fail(`一個階段是 ${s.phase} 分，「+${off} 分」超過了`);
  return { ok: true, v: s.start + (n - 1) * s.phase + off };
}

/** 標示的例子（時間欄的提示） */
export function sessionPlaceholder(s: Session): string {
  switch (s.style) {
    case 'clock':
      return hhmm(s.start + 60);
    case 'schedule':
      return '第 1 天 晚';
    case 'countdown':
      return 'T-01:30';
    default:
      return '階段 2';
  }
}

/** 開始時刻的文字（設定欄） */
export const sessionStartText = (s: Pick<Session, 'start'>) => hhmm(s.start);
