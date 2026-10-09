/**
 * 範本卡片的縮圖：每個範本的完成狀態，縮小畫在深色底上（產生一次後快取）。
 * 我的範本（P11）也用同一套：`useSettingsThumbs` 依鍵快取（範本存下來後設定不會再變，只會改名）。
 */
import { useEffect, useState } from 'react';
import { scaleSettings } from './exporter';
import { loadFonts } from './fonts';
import { settingsFromTemplate, TEMPLATES } from './library';
import { buildScene, sceneFontLoads } from './scene';
import { type Mode, normalizeSettings, type Settings } from './settings';

const THUMB_W = 192;
const cache = new Map<string, string>();

/** 一組設定的完成狀態縮圖（依 key 快取） */
async function settingsThumb(key: string, base: Settings): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const cfg = scaleSettings(base, THUMB_W / base.canvasW);
  await loadFonts(sceneFontLoads(cfg), 4000);
  const scene = buildScene(cfg);
  const c = document.createElement('canvas');
  c.width = scene.W;
  c.height = scene.H;
  const ctx = c.getContext('2d')!;
  scene.draw(ctx, scene.repTime);
  const out = document.createElement('canvas');
  out.width = scene.W;
  out.height = scene.H;
  const o = out.getContext('2d')!;
  o.fillStyle = '#1b1e26';
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(c, 0, 0);
  const url = out.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

async function makeThumb(mode: Mode, id: string): Promise<string> {
  const tpl = TEMPLATES[mode].find((t) => t.id === id)!;
  return settingsThumb(`${mode}:${id}`, normalizeSettings(mode, settingsFromTemplate(mode, tpl)));
}

/** 目前模式所有範本的縮圖（逐一產生；ready＝全部完成） */
export function useTemplateThumbs(mode: Mode): { urls: Record<string, string>; ready: boolean } {
  const [state, setState] = useState<{ mode: Mode; urls: Record<string, string>; ready: boolean }>(
    () => ({ mode, urls: {}, ready: false }),
  );
  useEffect(() => {
    let alive = true;
    const urls: Record<string, string> = {};
    setState({ mode, urls: {}, ready: false });
    (async () => {
      for (const t of TEMPLATES[mode]) {
        if (!alive) return;
        try {
          urls[t.id] = await makeThumb(mode, t.id);
        } catch {
          /* 縮圖失敗就不顯示 */
        }
        if (!alive) return;
        setState({ mode, urls: { ...urls }, ready: false });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (alive) setState({ mode, urls: { ...urls }, ready: true });
    })();
    return () => {
      alive = false;
    };
  }, [mode]);
  return state.mode === mode ? state : { urls: {}, ready: false };
}

/** 任意幾組設定的縮圖（我的範本）：鍵沒變的不重畫 */
export function useSettingsThumbs(entries: readonly { key: string; cfg: Settings }[]): {
  urls: Record<string, string>;
  ready: boolean;
} {
  const sig = entries.map((e) => e.key).join('|');
  const [state, setState] = useState<{ sig: string; urls: Record<string, string> }>(() => ({
    sig: '',
    urls: {},
  }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在鍵的組合改變時重新產生（設定存下來後不會再變）
  useEffect(() => {
    let alive = true;
    const urls: Record<string, string> = {};
    (async () => {
      for (const e of entries) {
        if (!alive) return;
        try {
          urls[e.key] = await settingsThumb(e.key, e.cfg);
        } catch {
          /* 縮圖失敗就不顯示 */
        }
        if (!alive) return;
        setState({ sig: '', urls: { ...urls } });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (alive) setState({ sig, urls: { ...urls } });
    })();
    return () => {
      alive = false;
    };
  }, [sig]);
  return { urls: state.urls, ready: state.sig === sig };
}
