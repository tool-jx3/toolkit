/**
 * 幾何花紋產生器：範本（F50、5. D6）、「產生」與固定種子（F01、F04）、產生＋繪製的流程（F54：同一組設定只產生一次、預覽縮小）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawPreview, prepare } from '@/tools/geo-bloom/engine';
import { generateBloom } from '@/tools/geo-bloom/generate';
import { DEFAULT_SETTINGS, resolveConfig, sanitizeSettings } from '@/tools/geo-bloom/settings';
import {
  freshSettings,
  regenerate,
  setSetting,
  settingsNow,
  useSettings,
} from '@/tools/geo-bloom/store';
import { matchTemplate, TEMPLATES, withTemplate } from '@/tools/geo-bloom/templates';
import { recordCanvas } from '../helpers/canvasRecorder';

describe('範本', () => {
  it('六個範本：id 不重複；設定都在範圍內（整理後不變）', () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual([
      '基本',
      '星座',
      '魔法陣',
      '科幻介面',
      '花窗',
      '極簡',
    ]);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      const full = { ...t.settings, seed: 'x', lockSeed: false };
      expect(sanitizeSettings(full), t.name).toEqual(full);
    }
  });

  it('「基本」就是預設值', () => {
    const { seed: _s, lockSeed: _l, ...rest } = DEFAULT_SETTINGS;
    expect(TEMPLATES[0].settings).toEqual(rest);
    expect(matchTemplate(DEFAULT_SETTINGS)).toBe('default');
  });

  it('套用：種子與固定種子不變，其他換成範本的；認得出目前是哪個範本', () => {
    const cur = { ...DEFAULT_SETTINGS, seed: 'mine', lockSeed: true, width: 777 };
    expect(matchTemplate(cur)).toBeNull();
    for (const t of TEMPLATES) {
      const next = withTemplate(cur, t);
      expect(next.seed).toBe('mine');
      expect(next.lockSeed).toBe(true);
      expect(matchTemplate(next)).toBe(t.id);
      /* 範本的圖形種類是複本（改了不會動到範本） */
      expect(next.shapes).not.toBe(t.settings.shapes);
    }
  });

  it('縮圖用的種子畫得出東西（不是只有中央圓）', () => {
    for (const t of TEMPLATES) {
      const cfg = resolveConfig({ ...t.settings, seed: t.sampleSeed, lockSeed: false });
      expect(generateBloom(cfg, t.sampleSeed).shapes.length, t.name).toBeGreaterThan(8);
    }
  });
});

describe('產生與固定種子', () => {
  beforeEach(() => {
    /* 復原以時間合併連續的變更（400 ms 內算一步）：測試裡每次讀時間都往後 0.5 秒，每個動作各算一步 */
    let t = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => {
      t += 500;
      return t;
    });
    useSettings.getState().replace(freshSettings());
    useSettings.temporal.getState().clear();
  });

  it('第一次開頁與重設：預設值＋8 個英數字的種子', () => {
    const s = freshSettings();
    expect(s.seed).toMatch(/^[0-9a-z]{8}$/);
    expect({ ...s, seed: DEFAULT_SETTINGS.seed }).toEqual(DEFAULT_SETTINGS);
  });

  it('產生：換一個新的種子（可以復原）；固定種子時不換', () => {
    setSetting('seed', 'abc');
    regenerate();
    const s1 = settingsNow().seed;
    expect(s1).toMatch(/^[0-9a-z]{8}$/);
    expect(s1).not.toBe('abc');
    useSettings.temporal.getState().undo();
    expect(settingsNow().seed).toBe('abc');
    setSetting('lockSeed', true);
    regenerate();
    expect(settingsNow().seed).toBe('abc');
  });
});

describe('產生＋繪製的流程', () => {
  it('同一組設定只產生一次；只改顏色、背景也不重新產生', () => {
    const s = { ...DEFAULT_SETTINGS, seed: 'cache-test' };
    const a = prepare(s);
    const b = prepare({ ...s });
    expect(b.scene).toBe(a.scene);
    expect(b.generateMs).toBe(0);
    const c = prepare({ ...s, lineColor: '#123456', background: '#ffffff', transparent: true });
    expect(c.scene).toBe(a.scene);
    const d = prepare({ ...s, lineWidth: 3 });
    expect(d.scene).not.toBe(a.scene);
  });

  it('預覽：長邊最多 2048 px（大畫布等比縮小），小畫布照原尺寸', () => {
    const fake = (width: number, height: number) => {
      const { ctx } = recordCanvas(width, height);
      return { width: 1, height: 1, getContext: () => ctx } as unknown as OffscreenCanvas;
    };
    const big = fake(2048, 768);
    const out = drawPreview(
      { ...DEFAULT_SETTINGS, seed: 'p', width: 8000, height: 3000, maxShapes: 5, maxLines: 5 },
      big,
    );
    expect([out.width, out.height, out.scale]).toEqual([2048, 768, 2048 / 8000]);
    expect([big.width, big.height]).toEqual([2048, 768]);
    const small = fake(1600, 900);
    const o2 = drawPreview({ ...DEFAULT_SETTINGS, seed: 'p', width: 1600, height: 900 }, small);
    expect([o2.width, o2.height, o2.scale]).toEqual([1600, 900, 1]);
    expect(o2.stats.shapes).toBeGreaterThan(0);
  });
});
