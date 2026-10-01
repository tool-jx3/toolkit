/**
 * 範本卡片的縮圖：每個範本的完成狀態，縮小畫在深色底上（產生一次後快取）。
 */
import { useEffect, useState } from 'react';
import { scaleSettings } from './exporter';
import { loadFonts } from './fonts';
import { settingsFromTemplate, TEMPLATES } from './library';
import { buildScene, sceneFontLoads } from './scene';
import { type Mode, normalizeSettings } from './settings';

const THUMB_W = 192;
const cache = new Map<string, string>();

async function makeThumb(mode: Mode, id: string): Promise<string> {
  const key = `${mode}:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tpl = TEMPLATES[mode].find((t) => t.id === id)!;
  const base = normalizeSettings(mode, settingsFromTemplate(mode, tpl));
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
