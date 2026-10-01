/**
 * 匯出檔名：「文字開頭_效果名稱[_無退場][_循環]」，或使用者填的檔名。
 */
import { INTRO } from './motion';
import { FLOW_NAMES, type Settings } from './settings';

/** 文字的開頭：第一個非空行，超過 14 字時在標點處截斷（英文不切斷單字），去掉結尾的破折號與刪節號 */
export function textHead(text: string): string {
  const line =
    String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) || '';
  const chars = Array.from(line);
  const LIMIT = 14;
  if (chars.length <= LIMIT) return line.replace(/[—―…‥・-]+$/u, '');
  let cut = -1;
  for (let i = Math.min(chars.length, LIMIT + 1) - 1; i >= 3; i--) {
    if (/[，。、！？!?,.；;：:—―…]/.test(chars[i])) {
      cut = i;
      break;
    }
  }
  let head: string;
  if (cut > 0) head = chars.slice(0, cut).join('');
  else {
    head = chars.slice(0, LIMIT).join('');
    if (/[A-Za-z]$/.test(head) && /[A-Za-z]/.test(chars[LIMIT] || '')) {
      const sp = head.lastIndexOf(' ');
      if (sp > 3) head = head.slice(0, sp);
    }
  }
  return head.replace(/[—―…‥・\-\s]+$/u, '');
}

/** 檔名清理：空白換底線、拿掉不合法字元、合併底線、去頭尾的底線與點，最多 48 字 */
export function sanitizeName(s: string): string {
  const out = Array.from(
    String(s)
      .replace(/\s+/g, '_')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名裡的控制字元必須移除
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/_+/g, '_')
      .replace(/^[_.]+|[_.]+$/g, ''),
  );
  return out.slice(0, 48).join('') || '文字演出';
}

export function autoFileName(c: Settings): string {
  const fx = c.mode === 'long' ? FLOW_NAMES[c.flow.kind] : (INTRO[c.intro.fx] || INTRO.fade).name;
  const parts = [textHead(c.text) || textHead(c.sub) || '文字演出', fx];
  if (!c.outroOn) parts.push('無退場');
  if (c.loop === 'infinite') parts.push('循環');
  return sanitizeName(parts.join('_'));
}

/** 實際使用的檔名主體 */
export function baseName(c: Settings, manual: string): string {
  return manual ? sanitizeName(manual.replace(/\.png$/i, '')) : autoFileName(c);
}
