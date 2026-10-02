/**
 * 字型（F38、F71～F73、規格 3.10）：共用字型選擇器的值 → canvas 的 font-family；畫圖前先載入用到的網頁字型。
 * 電腦內建字型組（8 組）在 FontPicker 的電腦字型分頁列出（localPresets）；上傳字型、依名稱指定的字型都以黑體類為後備。
 */
import { ensureFont, type FontValue, findGoogleFont, type LocalFontPreset } from '@/core/fonts';
import type { FrameState } from './model';
import { findPcFont, PC_FONT_PRESETS, type PcFontPreset } from './presets';
import { layerText, resolveSlot } from './render';
import { S } from './strings';

const quote = (name: string): string => {
  const n = name.replace(/["\\]/g, '');
  return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(n) ? n : `"${n}"`;
};

const stackCss = (p: PcFontPreset): string => [...p.stack.map(quote), p.generic].join(', ');

/**
 * 後備（黑體類）：繁中黑體在前（預設改用繁中字型，第 7 節裁定），再接原本的黑體類（日文黑體）。
 */
export const FALLBACK_GOTHIC = [
  ...['Microsoft JhengHei', '微軟正黑體', 'PingFang TC', 'Heiti TC', 'Noto Sans TC'],
  ...PC_FONT_PRESETS[0].stack,
]
  .map(quote)
  .concat('sans-serif')
  .join(', ');

/** 字型 → canvas 的 font-family 值 */
export function canvasFontFamily(font: FontValue): string {
  const family = font.family.trim();
  if (!family) return FALLBACK_GOTHIC;
  if (font.source === 'local') {
    const preset = findPcFont(family);
    if (preset) return stackCss(preset);
  }
  return `${quote(family)}, ${FALLBACK_GOTHIC}`;
}

/** FontPicker 的電腦字型分頁：8 組電腦內建字型 */
export const LOCAL_PRESETS: LocalFontPreset[] = PC_FONT_PRESETS.map((p) => ({
  family: p.family,
  label: S.fonts.presets[p.family]?.label ?? p.family,
  note: S.fonts.presets[p.family]?.note,
  stack: stackCss(p),
}));

/** 設定裡用到的網頁字型與上傳字型（連同要畫的文字），畫圖前先載入 */
export function fontRequests(
  state: FrameState,
): { family: string; weight: number; text: string }[] {
  const out = new Map<string, { family: string; weight: number; text: string }>();
  const add = (font: FontValue, weight: number, text: string) => {
    if (font.source === 'local' || !font.family.trim()) return;
    const key = `${font.family}|${weight}`;
    const prev = out.get(key);
    out.set(key, { family: font.family, weight, text: (prev?.text ?? '') + text });
  };
  const names = state.variants.items.map((i) => `${i.name}${i.sub}`).join('');
  for (const l of state.layers) {
    if (l.kind !== 'text' || !l.visible) continue;
    let text = '';
    if (state.variants.enabled) {
      for (const i of state.variants.items) text += layerText(l.text, resolveSlot(state, i.id));
    } else text = layerText(l.text, { name: '', sub: '' });
    add(l.font, l.bold ? 700 : 400, text.replace(/\s+/g, '') || '永');
  }
  if (state.variants.enabled && state.variants.label.style !== 'none')
    add(state.variants.label.font, 700, names || '永');
  return [...out.values()];
}

/** 載入用到的字型（逾時就先用後備字型）；回傳是否有新載入的 */
export async function ensureStateFonts(state: FrameState, timeoutMs = 6000): Promise<void> {
  await Promise.all(
    fontRequests(state).map((r) =>
      ensureFont(findGoogleFont(r.family)?.family ?? r.family, r.weight, r.text, { timeoutMs }),
    ),
  );
}
