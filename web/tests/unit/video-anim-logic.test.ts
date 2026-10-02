/**
 * 影片轉動圖工具的數值規則（規格第 3 節）：選取區間、裁切、輸出尺寸、取樣計畫、檔名、WebP 品質。
 */
import { describe, expect, it } from 'vitest';
import {
  cropPixels,
  DEFAULT_CROP,
  effectiveFps,
  endAt,
  evenUp,
  exportPlan,
  fileBaseOf,
  isVideoFile,
  normalizeCrop,
  outputFileName,
  outputSize,
  sourceRect,
  startAt,
  webpQuality,
} from '@/tools/video-anim/logic';

describe('選取區間（F31～F33）', () => {
  it('起點最晚到終點 − 0.2 秒、不小於 0', () => {
    expect(startAt(1, { start: 0, end: 3 })).toBe(1);
    expect(startAt(2.95, { start: 0, end: 3 })).toBeCloseTo(2.8, 12);
    expect(startAt(0.95, { start: 0, end: 1 })).toBeCloseTo(0.8, 12);
    expect(startAt(0.1, { start: 0, end: 0.15 })).toBe(0);
  });

  it('終點最早到起點 + 0.2 秒、不超過總長', () => {
    expect(endAt(2, { start: 0, end: 3 }, 3)).toBe(2);
    expect(endAt(0.5, { start: 1, end: 3 }, 3)).toBeCloseTo(1.2, 12);
    expect(endAt(2.9, { start: 2.9, end: 3 }, 3)).toBe(3);
  });
});

describe('裁切與輸出尺寸（3.2）', () => {
  it('比例換成像素：各自四捨五入；預設中央 80%', () => {
    expect(cropPixels(DEFAULT_CROP, 320, 180)).toEqual({ x: 32, y: 18, width: 256, height: 144 });
    expect(cropPixels(DEFAULT_CROP, 1920, 1080)).toEqual({
      x: 192,
      y: 108,
      width: 1536,
      height: 864,
    });
  });

  it('範圍夾在影片內', () => {
    expect(cropPixels({ x: 0.9, y: -0.1, w: 0.5, h: 2 }, 100, 100)).toEqual({
      x: 90,
      y: 0,
      width: 10,
      height: 100,
    });
  });

  it('像素範圍與比例來回換算不變', () => {
    const r = { x: 160, y: 0, width: 160, height: 90 };
    expect(cropPixels(normalizeCrop(r, 320, 180), 320, 180)).toEqual(r);
  });

  it('奇數加 1', () => {
    expect(evenUp(135)).toBe(136);
    expect(evenUp(136)).toBe(136);
  });

  it('規格 3.2 的表', () => {
    const size = (w: number, h: number, k: number) => {
      const o = outputSize({ width: w, height: h }, k);
      return `${o.width}x${o.height}`;
    };
    expect([1, 0.75, 0.5, 0.33].map((k) => size(320, 180, k))).toEqual([
      '320x180',
      '240x136',
      '160x90',
      '106x60',
    ]);
    expect([1, 0.75, 0.5, 0.33].map((k) => size(640, 360, k))).toEqual([
      '640x360',
      '480x270',
      '320x180',
      '212x120',
    ]);
    expect([1, 0.75, 0.5, 0.33].map((k) => size(1920, 1080, k))).toEqual([
      '1920x1080',
      '1440x810',
      '960x540',
      '634x356',
    ]);
    const crop = sourceRect({ width: 320, height: 180 }, DEFAULT_CROP);
    expect([1, 0.75, 0.5, 0.33].map((k) => size(crop.width, crop.height, k))).toEqual([
      '256x144',
      '192x108',
      '128x72',
      '84x48',
    ]);
  });

  it('裁切關閉時是整個畫面', () => {
    expect(sourceRect({ width: 320, height: 180 }, null)).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
  });
});

describe('取樣計畫（3.1）', () => {
  const plan = (fps: number, speed = 1, format: 'apng' | 'webp' | 'gif' = 'apng') =>
    exportPlan({ start: 0, end: 3 }, { format, fps, speed });

  it('GIF 最多 50 FPS', () => {
    expect(effectiveFps('gif', 60)).toBe(50);
    expect(effectiveFps('gif', 30)).toBe(30);
    expect(effectiveFps('apng', 60)).toBe(60);
    expect(plan(60, 1, 'gif').times.length).toBe(150);
    expect(plan(60, 1, 'gif').fps).toBe(50);
  });

  it('每格 1 ÷ FPS 秒：輸出長度＝影格數 ÷ FPS（速度改變長度）', () => {
    expect(plan(30).times.length).toBe(90);
    expect(plan(30).duration).toBeCloseTo(3, 12);
    expect(plan(24, 2).times.length).toBe(36);
    expect(plan(24, 2).duration).toBeCloseTo(1.5, 12);
    expect(plan(15, 0.5).times.length).toBe(90);
    expect(plan(15, 0.5).duration).toBeCloseTo(6, 12);
    expect(plan(60).times.length).toBe(180);
  });

  it('區間至少 0.1 秒', () => {
    const p = exportPlan({ start: 1, end: 1.02 }, { format: 'apng', fps: 30, speed: 1 });
    expect(p.times.length).toBe(3);
  });
});

describe('檔案', () => {
  it('影片檔的判斷：類型 video/…，或類型空白時看副檔名', () => {
    expect(isVideoFile({ name: 'a.mp4', type: 'video/mp4' })).toBe(true);
    expect(isVideoFile({ name: 'a.mkv', type: '' })).toBe(true);
    expect(isVideoFile({ name: 'a.MOV', type: '' })).toBe(true);
    expect(isVideoFile({ name: 'a.png', type: 'image/png' })).toBe(false);
    expect(isVideoFile({ name: 'a.txt', type: '' })).toBe(false);
    expect(isVideoFile({ name: 'a.mp4', type: 'text/plain' })).toBe(false);
  });

  it('輸出檔名：<影片檔名主體>.<png|webp|gif>', () => {
    expect(fileBaseOf('我的影片.mp4')).toBe('我的影片');
    expect(fileBaseOf('clip.v2.webm')).toBe('clip.v2');
    expect(fileBaseOf('a:b?.mov')).toBe('a_b_');
    expect(fileBaseOf('...mp4')).toBe('video');
    expect(fileBaseOf('')).toBe('video');
    expect(outputFileName('clip', 'apng')).toBe('clip.png');
    expect(outputFileName('clip', 'webp')).toBe('clip.webp');
    expect(outputFileName('clip', 'gif')).toBe('clip.gif');
  });

  it('WebP 品質：無損＝1，有損＝畫質 ÷ 100', () => {
    expect(webpQuality(true, 50)).toBe(1);
    expect(webpQuality(false, 95)).toBeCloseTo(0.95, 12);
    expect(webpQuality(false, 10)).toBeCloseTo(0.1, 12);
    expect(webpQuality(false, 3)).toBeCloseTo(0.1, 12);
  });
});
