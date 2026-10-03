/**
 * 選角畫面產生器：設定的預設值、每次編輯後的修正、讀入資料時的完整修正、檔名、內建角色（規格第 1 節的範圍、3.8、5. D3）。
 */
import { describe, expect, it } from 'vitest';
import { DEMO_NAMES, demoCharacters, demoSvg } from '@/tools/character-select/demo';
import { FORMAT_EXT, fileNameOf, outputSize, planFor } from '@/tools/character-select/exporter';
import {
  createDefaultSettings,
  DEFAULT_SUBTITLE,
  DEFAULT_TITLE,
  exportDimensions,
  normalizeCharacter,
  normalizeCrop,
  normalizePlayerLabel,
  playerLabel,
} from '@/tools/character-select/model';
import { isLegacyProject } from '@/tools/character-select/project';
import { normalizeSettings, sanitize } from '@/tools/character-select/sanitize';

describe('預設值', () => {
  it('畫布、背景、版面、玩家、時間、匯出', () => {
    const s = createDefaultSettings();
    expect(s.canvas).toEqual({ width: 960, height: 540 });
    expect(s.background).toMatchObject({
      type: 'gradient',
      colorA: '#111827',
      colorB: '#3b1d5a',
      angle: 135,
      imageDim: 24,
      vignette: 38,
      pattern: true,
    });
    expect(s.layout).toMatchObject({
      x: 64,
      y: 124,
      width: 832,
      height: 328,
      columns: 4,
      rows: 2,
      autoRows: true,
      autoGap: true,
      radius: 24,
      fit: 'cover',
      borderWidth: 2,
      borderStyle: 'solid',
    });
    expect(s.text).toEqual({
      showTitle: true,
      title: DEFAULT_TITLE,
      subtitle: DEFAULT_SUBTITLE,
      titleSize: 30,
      align: 'center',
    });
    expect(s.players.colors).toEqual(['#66ddff', '#ff668f', '#ffd45f', '#8df27a']);
    expect(s.animation).toEqual({
      initialHold: 650,
      searchDuration: 900,
      confirmDuration: 650,
      endHold: 1600,
      hops: 3,
      loop: true,
    });
    expect(s.export).toEqual({ format: 'apng', scale: 0.75, fps: 10, webpQuality: 0.9 });
  });
  it('預設文字不是上游的英文字樣（規格 5. D3）', () => {
    expect(DEFAULT_TITLE).not.toMatch(/SELECT YOUR CHARACTER/i);
    expect(DEFAULT_SUBTITLE).not.toMatch(/FIGHTER/i);
  });
  it('內建角色：8 個、自己畫的 SVG 與繁中名稱', () => {
    const list = demoCharacters();
    expect(list).toHaveLength(8);
    expect(list.map((c) => c.name)).toEqual([...DEMO_NAMES]);
    expect(list.every((c) => c.demo && c.image.startsWith('demo:'))).toBe(true);
    for (const n of ['ASTER', 'BLAZE', 'CYAN', 'DUSK', 'EMBER', 'FROST', 'GALE', 'HALO'])
      expect(DEMO_NAMES).not.toContain(n);
    const svg = demoSvg(3);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="480"/);
    expect(demoSvg(11)).toBe(demoSvg(3));
  });
});

describe('玩家的顯示名稱（規格 F95）', () => {
  it('控制字元換成空白、連續空白併成一個、去頭尾、最多 24 字', () => {
    expect(normalizePlayerLabel('  阿\t\t明\n ')).toBe('阿 明');
    expect(normalizePlayerLabel('x'.repeat(30))).toHaveLength(24);
    expect(normalizePlayerLabel('😀'.repeat(30))).toBe('😀'.repeat(24));
    expect(normalizePlayerLabel(null)).toBe('');
  });
  it('空白時「NP」', () => {
    const s = createDefaultSettings();
    s.players.labels[1] = '  ';
    expect(playerLabel(s, 1)).toBe('2P');
    s.players.labels[1] = '小綠';
    expect(playerLabel(s, 1)).toBe('小綠');
  });
});

describe('每次編輯後的修正', () => {
  it('畫布夾在 240～4096 × 180～4096、欄列 1～12、圓角 0～120', () => {
    const s = createDefaultSettings();
    Object.assign(s.canvas, { width: 10, height: 99999 });
    Object.assign(s.layout, { columns: 40, rows: 0, radius: 500, borderWidth: -3 });
    sanitize(s);
    expect(s.canvas).toEqual({ width: 240, height: 4096 });
    expect(s.layout).toMatchObject({ columns: 12, rows: 1, radius: 120, borderWidth: 0 });
  });
  it('玩家的陣列至少 4 人份、補到人數與單一編號；顏色依序循環', () => {
    const s = createDefaultSettings();
    s.players.count = 6;
    s.players.singleNumber = 9;
    sanitize(s);
    expect(s.players.labels).toHaveLength(9);
    expect(s.players.colors[4]).toBe('#66ddff');
    expect(s.players.colors[5]).toBe('#ff668f');
    expect(s.players.targets[8]).toBe(0);
    expect(s.players.starts[8]).toBeNull();
  });
  it('沒有角色時起始游標回到隨機、中繼點清空', () => {
    const s = createDefaultSettings();
    s.players.starts[0] = 2;
    s.players.paths[0] = [1, 2];
    sanitize(s);
    expect(s.players.starts[0]).toBeNull();
    expect(s.players.paths[0]).toEqual([]);
  });
  it('中繼點最多 24 個', () => {
    const s = createDefaultSettings();
    s.characters = demoCharacters();
    s.players.paths[0] = Array.from({ length: 40 }, (_, i) => (i % 3) + 1);
    sanitize(s);
    expect(s.players.paths[0]).toHaveLength(24);
  });
  it('多次執行的結果相同', () => {
    const s = createDefaultSettings();
    s.characters = demoCharacters();
    s.players.targets = [3, 3, 3, 3];
    sanitize(s);
    const once = JSON.stringify(s);
    sanitize(s);
    expect(JSON.stringify(s)).toBe(once);
  });
});

describe('角色與範圍的修正', () => {
  it('移動範圍至少涵蓋目前的位置、縮放 0.1～5', () => {
    const c = normalizeCharacter({
      ...demoCharacters()[0],
      offsetX: 180,
      moveRangeX: 100,
      scale: 9,
    });
    expect(c.moveRangeX).toBe(180);
    expect(c.offsetX).toBe(180);
    expect(c.scale).toBe(5);
  });
  it('範圍：寬高 0.02～1、位置夾在圖內', () => {
    expect(normalizeCrop({ x: 0.9, y: -1, width: 0.5, height: 0 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.02,
    });
    expect(normalizeCrop(null)).toBeNull();
  });
});

describe('讀入資料的完整修正', () => {
  it('壞掉的資料用預設值', () => {
    const s = normalizeSettings({
      canvas: 'x',
      players: { count: 'abc', colors: ['red'] },
      characters: [{ name: 'x' }, { image: 'a1', id: 'k' }],
    });
    expect(s.canvas).toEqual({ width: 960, height: 540 });
    expect(s.players.count).toBe(4);
    expect(s.players.colors[0]).toBe('#66ddff');
    expect(s.characters).toHaveLength(1);
    expect(s.characters[0]).toMatchObject({ id: 'k', image: 'a1', scale: 1 });
  });
  it('背景方式是圖片但沒有圖時改回漸層', () => {
    expect(normalizeSettings({ background: { type: 'image' } }).background.type).toBe('gradient');
  });
  it('重複的角色 id 改成不同的', () => {
    const s = normalizeSettings({
      characters: [
        { id: 'a', image: 'x' },
        { id: 'a', image: 'y' },
      ],
    });
    expect(new Set(s.characters.map((c) => c.id)).size).toBe(2);
  });
  it('舊版的專案檔的辨認', () => {
    expect(isLegacyProject({ version: 2, canvas: {}, players: {}, characters: [] })).toBe(true);
    expect(
      isLegacyProject({ format: 'trpg-toolkit-project', canvas: {}, players: {}, characters: [] }),
    ).toBe(false);
    expect(isLegacyProject({ canvas: {} })).toBe(false);
  });
});

describe('匯出的尺寸、影格與檔名（規格 3.7、3.8）', () => {
  const s = normalizeSettings({ characters: demoCharacters() });
  it('尺寸＝round(畫布 × 比例)，MP4 補成偶數', () => {
    expect(exportDimensions(s, 0.75)).toEqual({ width: 720, height: 405 });
    expect(outputSize(s, 'apng', 0.75)).toEqual({ width: 720, height: 405 });
    expect(outputSize(s, 'mp4', 0.75)).toEqual({ width: 720, height: 406 });
    expect(outputSize(s, 'avi', 0.75)).toEqual({ width: 720, height: 405 });
  });
  it('各格式的影格表', () => {
    expect(planFor(s, 'apng', 10)).toHaveLength(66);
    expect(planFor(s, 'webp', 10)).toHaveLength(66);
    expect(planFor(s, 'mp4', 10)).toHaveLength(85);
    expect(planFor(s, 'avi', 30)).toHaveLength(254);
  });
  it('檔名：主標題；APNG 的副檔名是 png（規格 5. D12）', () => {
    expect(fileNameOf(s, FORMAT_EXT.apng)).toBe(`${DEFAULT_TITLE}.png`);
    expect(fileNameOf(s, 'png', '-frame')).toBe(`${DEFAULT_TITLE}-frame.png`);
    expect(fileNameOf(s, 'html', '-interactive')).toBe(`${DEFAULT_TITLE}-interactive.html`);
    const t = normalizeSettings({ text: { title: '  a/b:c  ' } });
    expect(fileNameOf(t, 'gif')).toBe('a_b_c.gif');
    const u = normalizeSettings({ text: { title: '   ' } });
    expect(fileNameOf(u, 'mp4')).toBe('character-select.mp4');
  });
});
