/**
 * 2.5D 動態立繪（anime-rig）：沒有左右分割的名稱（`-l`／`-r`）與深度檔時，自動綁定的結果和加入 see-through 相容（規格 1.15）之前完全相同。
 *
 * 基準檔 `fixtures/anime-rig-golden.json` 是**加入之前**的程式（commit 74a6268 的 rigger.ts）產生的：
 * 三個圖層樹（測試用的人形、see-through V3 不分左右的輸出、改過名稱的人形）綁定後的部件（名稱、原名、範圍、繪製順序、深度、跟隨、
 * 物理、淡入淡出、左右、髮束、未分類、自動產生、濃度、像素的指紋）、錨點、警告、內建差分。
 * 要刻意改變綁定的結果時，用 `UPDATE_GOLDEN=1 npx vitest run tests/unit/anime-rig-golden.test.ts` 重新產生並在規格寫明。
 */
import { describe, expect, it } from 'vitest';
import { genericParts } from '../../src/tools/anime-rig/genericParts';
import { buildRig, cleanPsdLayers, type PsdRoot } from '../../src/tools/anime-rig/rigger';
import { fingerprint } from '../../src/tools/anime-rig/runtime';
import { clonePsd, rigTestPsd, type TestLayer, type TestPsd } from '../helpers/animeRig';
import { seeThroughColorPsd, seeThroughParts } from '../helpers/animeRigSeeThrough';

interface NodeFs {
  readFileSync(p: string, enc: 'utf8'): string;
  writeFileSync(p: string, s: string): void;
  existsSync(p: string): boolean;
}
const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const GOLDEN = new URL('./fixtures/anime-rig-golden.json', import.meta.url).pathname;

/** 測試用的人形改成其他寫法的名稱（單純的 hair、日文、「のコピー」、編號、大小寫） */
function renamedPsd(): TestPsd {
  const psd = clonePsd(rigTestPsd());
  const names: Record<string, string> = {
    'back hair': 'Hair',
    'front hair': 'hair_2',
    eyebrow: 'Brows',
    face: '顔 のコピー 2',
    ribbon: 'Ribbon 3',
    earwear: 'ピアス',
    handwear: 'Arms',
    irides: '瞳',
  };
  const visit = (ls: TestLayer[]) => {
    for (const l of ls) {
      if (names[l.name]) l.name = names[l.name];
      if (l.children) visit(l.children);
    }
  };
  visit(psd.children);
  return psd;
}

const CASES: Record<string, () => TestPsd> = {
  'rig-test': rigTestPsd,
  'see-through-v3': () => seeThroughColorPsd(seeThroughParts({ split: false })),
  renamed: renamedPsd,
};

/** 綁定的結果（像素以指紋代替） */
function rigSummary(psd: TestPsd) {
  const tree = clonePsd(psd) as unknown as PsdRoot;
  const noise = cleanPsdLayers(tree);
  const rig = buildRig(tree, { generic: genericParts() });
  return {
    noise,
    canvas: rig.canvas,
    synth: rig.synth,
    warnings: rig.warnings,
    anchors: rig.anchors,
    layers: rig.layers.map(({ img, ...meta }) => ({
      ...meta,
      img: `${img.width}x${img.height}:${fingerprint(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length))}`,
    })),
  };
}

describe('沒有左右分割的名稱與深度檔時，綁定結果和以前相同（規格 1.15）', async () => {
  const fs = await dyn<NodeFs>('node:fs');
  const current = Object.fromEntries(
    Object.entries(CASES).map(([k, f]) => [k, JSON.parse(JSON.stringify(rigSummary(f())))]),
  );
  if (env?.UPDATE_GOLDEN || !fs.existsSync(GOLDEN))
    fs.writeFileSync(GOLDEN, `${JSON.stringify(current, null, 1)}\n`);
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as typeof current;

  it.each(Object.keys(CASES))('%s', (name) => {
    expect(current[name]).toEqual(golden[name]);
  });
});
