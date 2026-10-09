/**
 * 文字演出產生器 P11 新增：登場動畫開關（F297）、我的範本（F298～F301）、批次匯出（F302～F304）、理智與瘋狂範本（F305～F309）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { isWide, type MeasureFn } from '@/core/typeset';
import {
  batchByLines,
  batchByTemplates,
  batchChoices,
  batchNames,
  batchZipName,
  builtinKey,
  mineKey,
} from '@/tools/text-fx/batch';
import { settingsFromTemplate, TEMPLATES } from '@/tools/text-fx/library';
import {
  addParsed,
  cleanName,
  makeMine,
  normalizeMine,
  parseTemplatesFile,
  TEMPLATE_FILE_FORMAT,
  TemplateFileError,
  templatesFileBase,
  templatesFileText,
  uniqueName,
  useMine,
} from '@/tools/text-fx/mine';
import { buildScene } from '@/tools/text-fx/scene';
import { baseSettings, normalizeSettings, type Settings } from '@/tools/text-fx/settings';
import {
  applyMine,
  applyTemplate,
  cfgOf,
  importMine,
  initialData,
  removeMine,
  renameMine,
  replaceAll,
  resetTemplate,
  saveMine,
  updateCfg,
  useTfx,
} from '@/tools/text-fx/store';

const fake: MeasureFn = (font, ch) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const w = ch === ' ' ? 0.3 * size : isWide(ch) ? size : 0.5 * size;
  return { w, l: 0, r: w, a: 0.8 * size, d: 0.1 * size };
};
const scene = (c: Settings) => buildScene(c, { measure: fake, paint: false });
const base = (mode: 'title' | 'long' | 'caption', patch: (c: Settings) => void) => {
  const c = baseSettings(mode);
  patch(c);
  return normalizeSettings(mode, c);
};
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

describe('登場動畫開關（F297）', () => {
  it('預設開；關掉時文字從第一格就是完成狀態，不用開始前空白', () => {
    expect(baseSettings('title').introOn).toBe(true);
    const sc = scene(
      base('title', (c) => {
        c.text = '測試';
        c.sub = 'AB';
        c.introOn = false;
        c.intro = { ...c.intro, fx: 'impact' };
      }),
    );
    const p = sc.pages[0];
    expect(r6(p.t0)).toBe(0);
    expect(r6(p.introEnd)).toBe(0);
    expect(r6(sc.repTime)).toBe(0);
    for (const g of p.groups) {
      expect(g.inBlock).toBeNull();
      expect(g.glyphs.every((x) => x.inStart === 0 && x.inDur === 0)).toBe(true);
    }
    expect(sc.isBlankAt(0)).toBe(false);
    /* 停留 1.5、淡出 0.6、結束後 0.3 */
    expect(sc.phases.filter((x) => x.b > x.a).map((x) => [x.kind, r6(x.a), r6(x.b)])).toEqual([
      ['hold', 0, 1.5],
      ['outro', 1.5, 2.1],
    ]);
    expect(r6(sc.duration)).toBe(2.4);
  });
  it('裝飾與整張背景也從頭就是完整的；包住文字的裝飾不延後文字', () => {
    const sc = scene(
      base('title', (c) => {
        c.text = '測試';
        c.introOn = false;
        c.deco.kind = 'band';
        c.bg.kind = 'solid';
      }),
    );
    const p = sc.pages[0];
    expect(r6(p.textStart)).toBe(0);
    expect(p.decoIn).toEqual({ start: 0, dur: 0 });
    expect(sc.backdropAmount(0)).toBe(1);
    /* 退場照常：背景在最後 0.4 秒淡出 */
    expect(sc.backdropAmount(sc.lastEnd - 0.01)).toBeLessThan(0.1);
  });
  it('長文：中央逐字不輪播、打字游標從頭就在最後；向上捲動不受影響', () => {
    const big = scene(
      base('long', (c) => {
        c.text = '一二三';
        c.flow.kind = 'big';
        c.introOn = false;
      }),
    );
    expect(big.pages[0].big).toBeUndefined();
    expect(big.pages[0].groups[0].inBlock).toBeNull();
    const seq = scene(
      base('long', (c) => {
        c.text = '一二三\n\n四五';
        c.flow.cursor = true;
        c.introOn = false;
      }),
    );
    expect(seq.pages).toHaveLength(2);
    expect(r6(seq.pages[0].cursor?.typedAt ?? -1)).toBe(0);
    expect(seq.pages[1].groups[0].glyphs.every((g) => g.inStart === seq.pages[1].t0)).toBe(true);
    const on = scene(
      base('long', (c) => {
        c.text = '一\n二';
        c.flow.kind = 'scroll';
      }),
    );
    const off = scene(
      base('long', (c) => {
        c.text = '一\n二';
        c.flow.kind = 'scroll';
        c.introOn = false;
      }),
    );
    expect(r6(off.duration)).toBe(r6(on.duration));
    expect(r6(off.pages[0].t0)).toBe(r6(on.pages[0].t0));
  });
});

describe('理智與瘋狂範本（F305～F309）', () => {
  it('5 個都在標語模式，能建立場景；呼吸發光的範本有開光暈', () => {
    const list = TEMPLATES.title.filter((t) => t.group === '理智與瘋狂');
    expect(list.map((t) => t.id)).toEqual([
      'san-loss',
      'san-temporary',
      'san-indefinite',
      'san-zero',
      'san-regain',
    ]);
    for (const t of list) {
      const s = normalizeSettings('title', settingsFromTemplate('title', t));
      expect(s.introOn).toBe(true);
      const sc = scene(s);
      expect(sc.empty).toBe(false);
      expect(sc.duration).toBeGreaterThan(2);
      if (s.hold.fx === 'breathe') expect(s.glow.on).toBe(true);
    }
    expect(settingsFromTemplate('title', list[3]).text).toBe('SAN 值歸零');
  });
});

describe('我的範本：名稱與範本檔（F298～F301）', () => {
  it('名稱：去頭尾空白、最多 40 字、空白用「未命名範本」；重複加（2）（3）', () => {
    expect(cleanName('  我的   字卡 ')).toBe('我的 字卡');
    expect(cleanName('')).toBe('未命名範本');
    expect(Array.from(cleanName('字'.repeat(50)))).toHaveLength(40);
    expect(uniqueName('A', ['A', 'A（2）'])).toBe('A（3）');
    expect(uniqueName('B', ['A'])).toBe('B');
  });
  it('存成範本：同一個模式裡名稱不重複，設定整理過', () => {
    const s = settingsFromTemplate('title', TEMPLATES.title[0]);
    const a = makeMine([], 'title', s, '戰鬥');
    const b = makeMine([a], 'title', s, '戰鬥');
    const c = makeMine([a], 'long', baseSettings('long'), '戰鬥');
    expect([a.name, b.name, c.name]).toEqual(['戰鬥', '戰鬥（2）', '戰鬥']);
    expect(a.id).not.toBe(b.id);
    expect(a.s).toEqual(normalizeSettings('title', s));
  });
  it('範本檔：寫出再讀回，名稱、模式、設定都相同', () => {
    const s = settingsFromTemplate('title', TEMPLATES.title[3]);
    const items = [
      makeMine([], 'title', s, '撤退版'),
      makeMine([], 'caption', baseSettings('caption'), '字幕'),
    ];
    const text = templatesFileText(items, new Date('2026-10-09T00:00:00Z'));
    const json = JSON.parse(text);
    expect(json).toMatchObject({
      format: TEMPLATE_FILE_FORMAT,
      version: 1,
      exportedAt: '2026-10-09T00:00:00.000Z',
    });
    expect(json.templates.map((t: { name: string; mode: string }) => [t.name, t.mode])).toEqual([
      ['撤退版', 'title'],
      ['字幕', 'caption'],
    ]);
    const back = parseTemplatesFile(text);
    expect(back.skipped).toBe(0);
    expect(back.templates.map((t) => [t.name, t.mode])).toEqual([
      ['撤退版', 'title'],
      ['字幕', 'caption'],
    ]);
    expect(back.templates[0].s).toEqual(items[0].s);
    expect(templatesFileBase(items)).toBe('文字演出範本_2個');
    expect(templatesFileBase(items.slice(0, 1))).toBe('文字演出範本_撤退版');
  });
  it('範本檔：單一個範本也收；壞的範本略過；不認得的值改回預設；讀不懂時丟錯', () => {
    const one = parseTemplatesFile(
      JSON.stringify({ name: ' 單一 ', mode: 'title', settings: { intro: { fx: 'nope' } } }),
    );
    expect(one.templates[0].name).toBe('單一');
    expect(one.templates[0].s.intro.fx).toBe('fade');
    const mixed = parseTemplatesFile(
      `﻿${JSON.stringify({
        format: TEMPLATE_FILE_FORMAT,
        templates: [{ mode: 'nope', settings: {} }, { mode: 'long', settings: {} }, null],
      })}`,
    );
    expect(mixed.templates.map((t) => [t.name, t.mode])).toEqual([['未命名範本', 'long']]);
    expect(mixed.skipped).toBe(2);
    const bad = (text: string) => {
      try {
        parseTemplatesFile(text);
        return '';
      } catch (e) {
        expect(e).toBeInstanceOf(TemplateFileError);
        return (e as Error).message;
      }
    };
    expect(bad('not json')).toBe('不是 JSON 檔，讀不懂。');
    expect(bad('{"format":"other","templates":[]}')).toBe('不是文字演出產生器的範本檔。');
    expect(bad('{"rows":[]}')).toBe('不是文字演出產生器的範本檔。');
    expect(bad('[1,2]')).toBe('不是文字演出產生器的範本檔。');
    expect(bad(`{"format":"${TEMPLATE_FILE_FORMAT}","templates":[]}`)).toBe(
      '檔案裡沒有可以用的範本。',
    );
  });
  it('讀入的範本：新的識別碼、名稱重複時加編號；壞掉的存檔整理', () => {
    const a = makeMine([], 'title', baseSettings('title'), 'A');
    const out = addParsed(
      [a],
      [
        { name: 'A', mode: 'title', s: baseSettings('title') },
        { name: 'A', mode: 'long', s: baseSettings('long') },
      ],
    );
    expect(out.map((t) => t.name)).toEqual(['A', 'A（2）', 'A']);
    expect(new Set(out.map((t) => t.id)).size).toBe(3);
    const fixed = normalizeMine({
      items: [
        { id: 'x', name: 'ok', mode: 'title', s: {} },
        { id: 'x', name: 'dup', mode: 'caption', s: {} },
        { id: 'y', mode: 'nope', s: {} },
        'junk',
      ],
    });
    expect(fixed.items.map((t) => t.name)).toEqual(['ok', 'dup']);
    expect(fixed.items[1].id).not.toBe('x');
    expect(normalizeMine(null)).toEqual({ items: [] });
  });
});

describe('我的範本：存、套用、改名、刪除（F298、F299）', () => {
  beforeEach(() => {
    replaceAll(initialData());
    useMine.getState().replace({ items: [] });
  });
  it('套用時只保留目前的畫面尺寸；之後改的文字不記到內建範本；重設回到我的範本', () => {
    updateCfg((s) => {
      s.text = '我的字卡';
      s.introOn = false;
      s.hold.fx = 'wave';
    });
    const item = saveMine('字卡');
    expect(useMine.getState().data.items).toHaveLength(1);
    /* 換成別的內建範本、改尺寸，再套用我的範本 */
    applyTemplate('coc7-critical');
    updateCfg((s) => {
      s.canvasW = 960;
      s.canvasH = 540;
    });
    applyMine(item.id);
    const d = useTfx.getState().data;
    expect(d.modes.title.mine).toBe(item.id);
    expect(cfgOf(d)).toMatchObject({
      text: '我的字卡',
      introOn: false,
      canvasW: 960,
      canvasH: 540,
    });
    expect(cfgOf(d).hold.fx).toBe('wave');
    /* 改文字：不記到內建範本 coc7-critical */
    const memoBefore = JSON.stringify(d.memo);
    updateCfg((s) => {
      s.text = '改過';
    });
    expect(JSON.stringify(useTfx.getState().data.memo)).toBe(memoBefore);
    /* 重設：回到我的範本的文字 */
    resetTemplate();
    expect(cfgOf(useTfx.getState().data).text).toBe('我的字卡');
    /* 套用內建範本：清掉我的範本的標記 */
    applyTemplate('enemy');
    expect(useTfx.getState().data.modes.title.mine).toBeUndefined();
  });
  it('改名（最多 40 字）、刪除；讀入的範本加在最後', () => {
    const item = saveMine('A');
    renameMine(item.id, '新名稱');
    expect(useMine.getState().data.items[0].name).toBe('新名稱');
    renameMine(item.id, '字'.repeat(60));
    expect(Array.from(useMine.getState().data.items[0].name)).toHaveLength(40);
    importMine([{ name: 'B', mode: 'long', s: baseSettings('long') }]);
    expect(useMine.getState().data.items.map((t) => t.mode)).toEqual(['title', 'long']);
    removeMine(item.id);
    expect(useMine.getState().data.items.map((t) => t.name)).toEqual(['B']);
    /* 刪掉的範本不能套用 */
    applyMine(item.id);
    expect(useTfx.getState().data.modes.title.mine).toBeUndefined();
  });
});

describe('批次匯出（F302～F304）', () => {
  it('每一行各一個：空行略過；副文字行數相同時依行配對，否則照用', () => {
    const c = base('title', (x) => {
      x.text = '大成功\n\n成功\n失敗';
      x.sub = 'CRITICAL\nSUCCESS\nFAILURE';
    });
    const items = batchByLines(c);
    expect(items.map((it) => [it.label, it.cfg.text, it.cfg.sub])).toEqual([
      ['大成功', '大成功', 'CRITICAL'],
      ['成功', '成功', 'SUCCESS'],
      ['失敗', '失敗', 'FAILURE'],
    ]);
    const one = batchByLines(
      base('caption', (x) => {
        x.text = '地點 A\n地點 B';
        x.sub = '深夜';
      }),
    );
    expect(one.map((it) => it.cfg.sub)).toEqual(['深夜', '深夜']);
    expect(batchByLines(base('title', (x) => (x.text = '  ')))).toEqual([]);
    /* 不改到原本的設定 */
    expect(c.text).toBe('大成功\n\n成功\n失敗');
  });
  it('長文：每一頁各一個（不管換頁開關）', () => {
    const items = batchByLines(
      base('long', (x) => {
        x.text = '第一頁\n第二行\n\n第二頁';
        x.paging = false;
      }),
    );
    expect(items.map((it) => [it.label, it.cfg.text])).toEqual([
      ['第一頁', '第一頁\n第二行'],
      ['第二頁', '第二頁'],
    ]);
  });
  it('勾選的範本：依清單順序；內建範本用記住的文字、保留尺寸與開關；我的範本只保留尺寸', () => {
    const d = initialData();
    d.memo.title.enemy = { text: '敵襲', sub: '' };
    d.modes.title.s.canvasW = 960;
    d.modes.title.s.outroOn = false;
    const mineS = settingsFromTemplate('title', TEMPLATES.title[1]);
    mineS.outroOn = true;
    mineS.text = '自己的';
    const mine = [{ ...makeMine([], 'title', mineS, '我的'), id: 'm1' }];
    const keys = [mineKey('m1'), builtinKey('enemy'), builtinKey('coc7-san'), 'b:nope'];
    const items = batchByTemplates(d, keys, mine);
    expect(items.map((it) => [it.label, it.cfg.text, it.cfg.canvasW, it.cfg.outroOn])).toEqual([
      ['敵人出現', '敵襲', 960, false],
      ['理智檢定', '理智檢定', 960, false],
      ['我的', '自己的', 960, true],
    ]);
    const choices = batchChoices('title', mine);
    expect(choices).toHaveLength(TEMPLATES.title.length + 1);
    expect(choices.at(-1)).toEqual({ key: 'm:m1', name: '我的', group: '我的範本' });
    expect(batchChoices('long', mine)).toHaveLength(TEMPLATES.long.length);
  });
  it('檔名：序號＋自動檔名；填了檔名時「檔名_序號」；ZIP 的名稱', () => {
    const c = base('title', (x) => {
      x.text = '大成功\n成功';
      x.intro = { ...x.intro, fx: 'fade' };
    });
    const items = batchByLines(c);
    expect(batchNames(items, '')).toEqual(['01_大成功_淡入', '02_成功_淡入']);
    expect(batchNames(items, '檢定 結果.png')).toEqual(['檢定_結果_01', '檢定_結果_02']);
    const many = Array.from({ length: 120 }, () => items[0]);
    expect(batchNames(many, '')[119]).toBe('120_大成功_淡入');
    expect(batchZipName('lines', c, '')).toBe('大成功_淡入_批次');
    expect(batchZipName('templates', c, '')).toBe('文字演出_範本批次');
    expect(batchZipName('templates', c, '我的')).toBe('我的_批次');
  });
});
