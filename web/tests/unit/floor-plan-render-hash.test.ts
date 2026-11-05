/**
 * 室內平面圖：沒有用到新功能時，匯出的圖和改版前**逐位元組相同**（規格 D79、D84）。
 *
 * 用「記錄畫布」（tests/helpers/recordingCanvas.ts）把匯出時呼叫畫布的每一個指令算成雜湊：指令相同＝PNG 相同，
 * 而且和平台、字型無關（CI 上也穩定）。57 個範本 × 7 種樣式 × PL／GM，加上幾種匯出設定的組合
 * （所有樓層、格線、棋子方格、座標、VTT、透明、污漬、放入隱藏線索、藏起線索）。
 *
 * 基準檔 `fixtures/floor-plan-render-hashes.json` 是 2026-11-05 跟進 KIIN v2.0 **之前**的程式（`05ed1f9`）產生的。
 * 要刻意改變畫法時，用 `UPDATE_GOLDEN=1 npx vitest run tests/unit/floor-plan-render-hash.test.ts` 重新產生並在規格寫明。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderImage } from '@/tools/floor-plan/draw/export';
import { THEME_IDS } from '@/tools/floor-plan/model/catalog';
import { type ExportSettings, exportFloors, exportOptions } from '@/tools/floor-plan/model/exportPlan';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import type { Project, ThemeId } from '@/tools/floor-plan/model/types';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { installRecordingDocument, type RecordingCanvas } from '../helpers/recordingCanvas';

interface NodeFs {
  readFileSync(p: string, enc: 'utf8'): string;
  writeFileSync(p: string, s: string): void;
  existsSync(p: string): boolean;
}
const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const GOLDEN = new URL('../fixtures/floor-plan-render-hashes.json', import.meta.url).pathname;

const EXP: ExportSettings = {
  range: 'current',
  view: 'pl',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
  mode: 'image',
  vttPx: 100,
  noise: true,
};

function project(id: string, clues = false, patch: Partial<Project> = {}): Project {
  const floors = instantiateTemplate(id, clues ? { clues: true } : {}) ?? [];
  return {
    name: id,
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: groundFloorIndex(floors),
    ...patch,
  };
}

function hashOf(p: Project, exp: ExportSettings, theme: ThemeId): string {
  const c = renderImage(exportFloors(p, exp.range), exportOptions(p, exp, theme, exp.px)) as unknown as RecordingCanvas;
  return `${c.width}x${c.height}:${c.hash}`;
}

/** 每個範本的組合 */
function cases(id: string): [string, () => string][] {
  const out: [string, () => string][] = [];
  for (const theme of THEME_IDS)
    for (const view of ['pl', 'gm'] as const)
      out.push([`${theme}|${view}`, () => hashOf(project(id), { ...EXP, view }, theme)]);
  out.push([
    'all|grid|token2|gm|size',
    () =>
      hashOf(
        project(id, false, { tokenGrid: 2, showSize: 'ping' }),
        { ...EXP, range: 'all', grid: true, view: 'gm', px: 32 },
        'clean',
      ),
  ]);
  out.push([
    'coords|vtt70|hideClues|clues',
    () =>
      hashOf(
        project(id, true, { coords: true, tokenGrid: 3 }),
        { ...EXP, mode: 'vtt', vttPx: 70, clues: 'hide' },
        'blueprint',
      ),
  ]);
  out.push([
    'transparent|noir|nonoise|each',
    () => hashOf(project(id), { ...EXP, transparent: true, noise: false, range: 'each' }, 'noir'),
  ]);
  out.push([
    'wear|paper|clues|gm|noNames',
    () =>
      hashOf(
        project(id, true, { wear: 0.7, wearSeed: 4242, showNames: false, showSize: 'm' }),
        { ...EXP, view: 'gm', px: 48 },
        'paper',
      ),
  ]);
  return out;
}

describe('沒有用到新功能時匯出的圖和改版前相同（D79、D84）', async () => {
  let restore: () => void = () => {};
  beforeAll(() => {
    restore = installRecordingDocument();
  });
  afterAll(() => restore());
  const fs = await dyn<NodeFs>('node:fs');
  const update = !!env?.UPDATE_GOLDEN || !fs.existsSync(GOLDEN);
  const golden: Record<string, string> = update
    ? {}
    : (JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, string>);

  it('57 個範本都在', () => {
    expect(TEMPLATES.length).toBe(57);
  });

  for (const t of TEMPLATES)
    it(`範本「${t.name}」（${t.id}）`, () => {
      const r = installRecordingDocument();
      try {
        const current: Record<string, string> = {};
        for (const [k, f] of cases(t.id)) current[`${t.id}|${k}`] = f();
        if (update) Object.assign(golden, current);
        else for (const [k, v] of Object.entries(current)) expect(v, k).toBe(golden[k]);
      } finally {
        r();
      }
    });

  if (update)
    afterAll(() => {
      fs.writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
});
