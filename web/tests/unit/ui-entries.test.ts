/**
 * `@/ui` 的總入口（src/ui/index.ts）只收大多數工具都用的元件；只有少數工具用的元件從各自的入口引用
 * （`@/ui/<檔名>`、`@/ui/imagefx`；DESIGN.md 4.0「分開的入口」）。總入口只要連帶 import 到其中一個
 * （包括只 import 型別卻沒寫 `import type` 的 `import { type X }`），打包就會把它併回每頁都載入的共用 ui 區塊。
 */
import { describe, expect, it } from 'vitest';

/** src/ui 的原始碼（檔名不含副檔名 → 內容）；src/ui 沒有子資料夾 */
const SOURCES = new Map(
  Object.entries(
    import.meta.glob<string>('../../src/ui/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([file, src]) => [file.replace(/^.*\/|\.tsx?$/g, ''), src]),
);

/** 分開的入口（檔名，不含副檔名）；新增時一併登記在 DESIGN.md 4.0 的表 */
const SEPARATE = [
  // 2026-10-25（map-fx）：圖片演出
  'imagefx',
  'ImageFxApp',
  'ImageFxEditLayer',
  'ImageFxExport',
  'ImageFxPreview',
  'ImageFxSettings',
  // 2026-10-30：只有 1～6 個工具用的元件
  'ColorPairList',
  'CropDialog',
  'CropFrame',
  'CssExport',
  'CssPreviewFrame',
  'DirectionPad',
  'EffectGrid',
  'FontPoolList',
  'GradientField',
  'GuidedTour',
  'HighlightTextArea',
  'HsvPanel',
  'ImageSampler',
  'InteractiveHtmlDialog',
  'ItemListEditor',
  'KeyframeTable',
  'LayoutCanvas',
  'LayoutEditor',
  'LyricStyleControls',
  'MessageComposer',
  'ModelDownload',
  'ObsGuide',
  'OptionalNumberInput',
  'PagedViewport',
  'PanZoomViewport',
  'PartPicker',
  'PathPad',
  'PostEditor',
  'RichTextEditor',
  'RichTextField',
  'richDom',
  'SelectableCardList',
  'Stepper',
  'TestValueRow',
  'useVideoPlayback',
  'Viewport3D',
];

/** 一個檔案在 src/ui 裡 import／re-export 的檔案；`import type`／`export type` 打包時會整個拿掉，不算 */
function uiDeps(name: string): string[] {
  const out: string[] = [];
  for (const m of (SOURCES.get(name) ?? '').matchAll(
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?'\.\/([^'/]+)'/g,
  )) {
    if (m[1]) continue;
    const dep = m[2].replace(/\.tsx?$/, '');
    if (SOURCES.has(dep)) out.push(dep);
  }
  return out;
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...uiDeps(f));
  }
  return seen;
}

describe('@/ui 的入口', () => {
  it('分開的入口都存在', () => {
    expect(SEPARATE.filter((n) => !SOURCES.has(n))).toEqual([]);
  });

  it('總入口不會連帶載入分開的入口', () => {
    expect([...closure('index')].filter((n) => SEPARATE.includes(n))).toEqual([]);
  });

  it('讀得到相依（防止上面的檢查因為讀不到 import 而白過）', () => {
    const reached = closure('index');
    for (const n of ['ToolShell', 'Dialog', 'Button', 'cn', 'shortcuts']) {
      expect(reached).toContain(n);
    }
    const rich = closure('RichTextEditor');
    expect(rich).toContain('RichTextField');
    expect(rich).toContain('richDom');
  });
});
