/**
 * 參照式聊天面板（coc-npc、coc-sheet，2026-11-20；參考 65256619ko-sudo/TRPG_Char_Maker〔MIT〕的做法）：
 * 技能的數值寫進 CCFOLIA 角色的參數（params），聊天面板寫成 `CC<={技能名}`，技能成長後只改參數。
 *
 * CCFOLIA 把聊天裡的 `{標籤}` 換成同名的狀態或參數的值；標籤要**完全相同**才會換（本站的輸出兩邊用同一個字串）。
 * 名稱的規則（本站自己定的，規格 coc-npc 3.6、coc-sheet 3.9）：
 * - 去掉頭尾空白後是空的、含大括號（`{` `}`，參照會被切斷）或換行 → 不能當參數名；
 * - 和角色本來就有的狀態、參數（HP、STR、DB…）同名 → 不寫進參數（會互相蓋掉）；
 * - 和前面的技能同名 → 只有第一個寫進參數；
 * - 比較同名時英文不分大小寫（不確定 CCFOLIA 的比對是否分大小寫，保守地當成相同）。
 * 寫不進參數的技能在聊天面板照舊寫數字。
 */

export type ParamSkipReason = 'invalid' | 'reserved' | 'duplicate';

/** 能拿來當參數名（用 {名稱} 參照）的名稱；不能時 null */
export function paramLabel(name: string): string | null {
  const t = String(name ?? '').trim();
  if (!t || /[{}\r\n\u2028\u2029]/.test(t)) return null;
  return t;
}

/** 比較同名用的鍵（英文不分大小寫） */
export const paramKey = (label: string): string => label.toUpperCase();

export interface ParamCandidate {
  id: string;
  name: string;
}

export interface ParamAssignment {
  /** 寫進參數的：候選 id → 參數名 */
  labels: Map<string, string>;
  /** 寫不進參數的（照順序） */
  skipped: { id: string; name: string; reason: ParamSkipReason }[];
}

/** 依序決定每個候選寫進參數時的名稱（reserved：角色本來就有的狀態與參數的名稱） */
export function assignParamLabels(
  candidates: readonly ParamCandidate[],
  reserved: readonly string[],
): ParamAssignment {
  const used = new Set(reserved.map(paramKey));
  const reservedKeys = new Set(used);
  const labels = new Map<string, string>();
  const skipped: ParamAssignment['skipped'] = [];
  for (const c of candidates) {
    const label = paramLabel(c.name);
    if (!label) {
      skipped.push({ id: c.id, name: c.name, reason: 'invalid' });
      continue;
    }
    const key = paramKey(label);
    if (used.has(key)) {
      skipped.push({
        id: c.id,
        name: c.name,
        reason: reservedKeys.has(key) ? 'reserved' : 'duplicate',
      });
      continue;
    }
    used.add(key);
    labels.set(c.id, label);
  }
  return { labels, skipped };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 算式裡獨立出現的名稱（英數字的名稱，例：STR、HP）換成 `{名稱}`：大小寫不拘、寫成 names 裡的樣子；
 * 前後是英數字、底線或大括號的不算（`{STR}` 不會變成 `{{STR}}`，`STRX`、`1DMP` 不換）。
 */
export function referenceNames(expr: string, names: readonly string[]): string {
  const list = names.filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n));
  if (!list.length) return expr;
  const byKey = new Map(list.map((n) => [paramKey(n), n]));
  const alt = [...list]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  const re = new RegExp(`(?<![A-Za-z0-9_{])(${alt})(?![A-Za-z0-9_}])`, 'gi');
  return expr.replace(re, (m) => `{${byKey.get(paramKey(m)) ?? m}}`);
}
