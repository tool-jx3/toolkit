/**
 * 跑團紀錄簿的交接資料 → 表單（規格 3.10）。讀寫瀏覽器儲存空間由 `@/core/sessions` 負責（鍵名與格式沿用舊版）。
 */
import type { ReportImportItem } from '@/core/sessions';
import {
  DL_SYSTEMS,
  type GmRole,
  newGm,
  newPlayer,
  type ReportSettings,
  SYSTEMS,
  type SystemKey,
} from './model';

/** 完全相同才算的別名 */
const SYSTEM_ALIASES: Readonly<Record<string, SystemKey>> = {
  'CoC 6版': 'coc6',
  CoC6: 'coc6',
  'CoC 7版': 'coc7',
  CoC7: 'coc7',
  新クトゥルフ神話TRPG: 'new_coc',
  エモクロア: 'emoklore_ja',
  エモクロアTRPG: 'emoklore_ja',
  Emoklore: 'emoklore_ja',
  マダミス: 'madamisu',
  マーダーミステリー: 'madamisu',
};

/** 各系統的其他名稱（舊版日文介面的寫法；不分大小寫比對） */
const SYSTEM_OTHER_NAMES: Readonly<Partial<Record<SystemKey, readonly string[]>>> = {
  new_coc: ['新クトゥルフ神話TRPG'],
  emoklore_ja: ['エモクロアTRPG'],
  madamisu: ['マーダーミステリー'],
  shinobigami: ['シノビガミ'],
  insane: ['インセイン'],
  double_cross: ['ダブルクロス The 3rd Edition'],
  sword_world_25: ['ソード・ワールド2.5'],
  futari_sousa: ['フタリソウサ'],
};

/** 系統的文字 → 選單的系統；對不上時 null（改用「自行輸入」） */
export function matchSystem(value: unknown): SystemKey | null {
  const name = String(value ?? '').trim();
  if (!name) return null;
  if (Object.hasOwn(SYSTEM_ALIASES, name)) return SYSTEM_ALIASES[name];
  const lower = name.toLowerCase();
  for (const s of SYSTEMS) {
    const names = [s.name, ...(SYSTEM_OTHER_NAMES[s.key] ?? [])];
    if (names.some((n) => n === name || n.toLowerCase() === lower)) return s.key;
  }
  return null;
}

/** 依系統的原文推測主持人的身分 */
export function inferGmRole(system: unknown): GmRole {
  const text = String(system ?? '');
  if (text.includes('エモクロア') || /emoklore/i.test(text)) return 'DL';
  if (text.includes('クトゥルフ') || text.includes('克蘇魯') || /coc/i.test(text)) return 'KP';
  return 'GM';
}

/** 主題標籤：陣列時每項補 #、以空白連接；文字時去頭尾空白 */
export function formatHashtags(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((t) => String(t ?? '').trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
  return String(value ?? '').trim();
}

const str = (v: unknown): string => (v == null ? '' : String(v));

/**
 * 把交接資料的一個項目填進表單（回傳新的設定）。範本、文字樣式、敬稱、名字順序、標記設定不變；
 * 作者與結果清空（新版會保存表單，避免沿用上一團的值）。
 */
export function applyImportItem(
  s: ReportSettings,
  item: Partial<ReportImportItem>,
): ReportSettings {
  const system = matchSystem(item.system);
  const role = inferGmRole(item.system);
  const players =
    Array.isArray(item.players) && item.players.length
      ? item.players.map((p) => newPlayer(str(p?.pl), str(p?.pc)))
      : [newPlayer()];
  const next: ReportSettings = {
    ...s,
    system: system ?? 'custom',
    customSystem: system ? '' : str(item.system).trim(),
    scenario: str(item.scenario),
    author: '',
    result: '',
    date:
      str(item.latestDate) || (Array.isArray(item.dates) ? item.dates.map(str).join(' / ') : ''),
    hashtags: formatHashtags(item.hashtags),
    memo: str(item.memo),
    gms: [newGm(role, str(item.gm))],
    players,
  };
  /* 選單改到 Emoklore 時，主持人的身分照 F12 改成 DL */
  if (DL_SYSTEMS.includes(next.system)) next.gms = next.gms.map((g) => ({ ...g, role: 'DL' }));
  return next;
}
