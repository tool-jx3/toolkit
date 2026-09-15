import { MAX_TOTAL_PIXELS } from './targets';
import type { RenderParams } from './types';

export interface ShareState {
  params: RenderParams;
  targetId: string;
  axes: { decoId: string; themeId: string; effectId: string };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/\_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeState(state: ShareState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

const MAX_LINES = 8;
const MAX_LINE_CHARS = 100;

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * 共有URLは第三者が作れる入力なので、復元時に値域を確かめる。
 * 未知のIDは getFont/getTheme などが既定に落とすため、ここでは
 * 「重すぎる」「壊れている」形だけを潰す。
 */
function sanitizeParams(raw: unknown): RenderParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, any>;

  const w = Math.round(num(p.canvas?.w, 64, 1600, 480));
  const h = Math.round(num(p.canvas?.h, 64, 1600, 480));
  // 全フレームを ImageData で抱えるため、面積からコマ数の上限を決める
  const maxFrames = Math.max(2, Math.floor(MAX_TOTAL_PIXELS / (w * h)));
  const frameCount = Math.round(num(p.frameCount, 2, Math.min(60, maxFrames), 15));

  const lines = arr<unknown>(p.text?.lines)
    .slice(0, MAX_LINES)
    .map((l) => str(l, '').slice(0, MAX_LINE_CHARS));

  const bgKind = str(p.background?.kind, 'transparent');
  const background =
    bgKind === 'solid' || bgKind === 'rainbow' || bgKind === 'linear' || bgKind === 'metal'
      ? (p.background as RenderParams['background'])
      : { kind: 'transparent' as const };

  const fmt = str(p.output?.format, 'apng');

  return {
    version: 1,
    canvas: { w, h },
    frameCount,
    fps: Math.round(num(p.fps, 5, 30, 20)),
    seed: Math.round(num(p.seed, 1, 99_999, 12_345)),
    background,
    contentScale: num(p.contentScale, 0.4, 1, 1),
    text: {
      lines: lines.length ? lines : [''],
      fontId: str(p.text?.fontId, 'noto-black'),
      scale: num(p.text?.scale, 0.3, 1.5, 1),
      lineHeight: num(p.text?.lineHeight, 0.8, 2, 1.1),
      letterSpacing: num(p.text?.letterSpacing, -0.3, 0.5, 0.02),
      decorations: arr<RenderParams['text']['decorations'][number]>(p.text?.decorations).slice(0, 12),
      perChar: p.text?.perChar === true,
    },
    layers: arr<any>(p.layers)
      .slice(0, 8)
      .filter((l) => l && typeof l === 'object' && typeof l.type === 'string')
      .map((l) => ({ ...l, params: l.params && typeof l.params === 'object' ? l.params : {} })),
    motion: {
      type: str(p.motion?.type, 'none') as RenderParams['motion']['type'],
      amount: num(p.motion?.amount, 0, 3, 0),
    },
    output: {
      format: (fmt === 'gif' || fmt === 'png' ? fmt : 'apng') as RenderParams['output']['format'],
      colors: Math.round(num(p.output?.colors, 0, 256, 256)),
      budgetBytes: Math.round(num(p.output?.budgetBytes, 1, 50_000_000, 1_000_000)),
      matte: typeof p.output?.matte === 'string' ? p.output.matte.slice(0, 32) : null,
    },
  };
}

export function decodeState(hash: string): ShareState | null {
  const s = hash.replace(/^#/, '');
  if (!s || s.length > 8192) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(fromBase64Url(s)));
    if (!obj?.params || obj.params.version !== 1) return null;
    const params = sanitizeParams(obj.params);
    if (!params) return null;
    return {
      params,
      targetId: str(obj.targetId, 'ccfolia-cutin'),
      axes: {
        decoId: str(obj.axes?.decoId, 'outline-gold'),
        themeId: str(obj.axes?.themeId, 'rainbow-gold'),
        effectId: str(obj.axes?.effectId, 'none'),
      },
    };
  } catch {
    return null;
  }
}
