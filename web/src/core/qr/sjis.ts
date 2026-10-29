/**
 * Shift_JIS（QR code 的漢字模式用）：瀏覽器與 Node 都只有 Shift_JIS 的解碼器（TextDecoder），沒有編碼器；
 * 第一次用到時把漢字模式能用的範圍（0x8140～0x9FFC、0xE040～0xEBBF）逐一解碼，反過來建一張「字 → 碼」的表。
 * 同一個字有兩個碼時取小的那個。
 */

let table: Map<string, number> | null = null;

function build(): Map<string, number> {
  const out = new Map<string, number>();
  let dec: TextDecoder;
  try {
    dec = new TextDecoder('shift_jis');
  } catch {
    return out;
  }
  const add = (lead: number, trailMax: number) => {
    for (let t = 0x40; t <= trailMax; t++) {
      if (t === 0x7f) continue;
      const ch = dec.decode(Uint8Array.of(lead, t));
      if (ch.length !== 1 || ch === '�' || out.has(ch)) continue;
      out.set(ch, (lead << 8) | t);
    }
  };
  for (let lead = 0x81; lead <= 0x9f; lead++) add(lead, 0xfc);
  for (let lead = 0xe0; lead <= 0xeb; lead++) add(lead, lead === 0xeb ? 0xbf : 0xfc);
  return out;
}

/** 這個字在 Shift_JIS 的雙位元組碼（漢字模式能用的範圍）；不能用時 null */
export function sjisCode(ch: string): number | null {
  table ??= build();
  return table.get(ch) ?? null;
}

/** 整段文字都能用漢字模式時回傳 Shift_JIS 位元組；第一個不能用的字放在 bad */
export function sjisBytes(
  text: string,
): { ok: true; bytes: number[] } | { ok: false; bad: string } {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = sjisCode(ch);
    if (code === null) return { ok: false, bad: ch };
    bytes.push(code >> 8, code & 0xff);
  }
  return { ok: true, bytes };
}

/** Shift_JIS 位元組 → 文字（讀 QR code 的漢字模式用） */
export function sjisDecode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('shift_jis').decode(bytes);
  } catch {
    return '';
  }
}
