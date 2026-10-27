/**
 * UI 框素材產生器：我的預設（規格 F41～F43、3.11）——JSON 往返、讀檔的錯誤、上限 30 組、名稱的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  addParsed,
  cleanName,
  MINE_MAX,
  makeMine,
  normalizeMine,
  PRESET_FILE_FORMAT,
  PresetFileError,
  parsePresetsFile,
  presetsFileBase,
  presetsFileText,
  uniqueName,
} from '../../src/tools/ui-frame/mine';
import { DEFAULT_TEXTS, PRESETS } from '../../src/tools/ui-frame/model';

const texts = { ...DEFAULT_TEXTS, charName: '綾', line: '第一行\n第二行', bake: true };

describe('我的預設', () => {
  it('JSON 往返：外觀與測試文字完全相同', () => {
    const a = makeMine([], '我的舊宅', PRESETS[0].design, texts, 1000);
    const b = makeMine([a], '我的舊宅', PRESETS[3].design, DEFAULT_TEXTS, 2000);
    expect(b.name).toBe('我的舊宅（2）');
    const text = presetsFileText([a, b], new Date('2026-10-27T00:00:00Z'));
    const raw = JSON.parse(text);
    expect(raw).toMatchObject({
      format: PRESET_FILE_FORMAT,
      version: 1,
      exportedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(raw.presets).toHaveLength(2);
    const back = parsePresetsFile(text);
    expect(back.skipped).toBe(0);
    expect(back.presets).toEqual([
      { name: '我的舊宅', design: PRESETS[0].design, texts },
      { name: '我的舊宅（2）', design: PRESETS[3].design, texts: DEFAULT_TEXTS },
    ]);
  });

  it('檔名：一組用名稱、多組寫組數', () => {
    const a = makeMine([], '霓虹', PRESETS[2].design, texts);
    expect(presetsFileBase([a])).toBe('UI框預設_霓虹');
    expect(presetsFileBase([a, a, a])).toBe('UI框我的預設_3組');
  });

  it('讀檔：單一組（沒有 format）、壞值整理、BOM；不完整的略過', () => {
    const single = JSON.stringify({
      name: '  單組  ',
      design: { keyColor: '#F00', cornerSize: 500 },
    });
    const r = parsePresetsFile(`﻿${single}`);
    expect(r.presets).toHaveLength(1);
    expect(r.presets[0].name).toBe('單組');
    expect(r.presets[0].design.keyColor).toBe('#ff0000');
    expect(r.presets[0].design.cornerSize).toBe(42);
    expect(r.presets[0].texts).toEqual(DEFAULT_TEXTS);
    const mixed = parsePresetsFile(
      JSON.stringify({
        format: PRESET_FILE_FORMAT,
        presets: [{ name: 'ok', design: PRESETS[1].design }, { name: 'bad' }, 3],
      }),
    );
    expect(mixed.presets.map((p) => p.name)).toEqual(['ok']);
    expect(mixed.skipped).toBe(2);
  });

  it('讀檔的錯誤：不是 JSON、別的格式、沒有可用的預設', () => {
    expect(() => parsePresetsFile('not json')).toThrow(PresetFileError);
    expect(() => parsePresetsFile('[1,2]')).toThrow('不是 UI 框素材產生器的預設檔。');
    expect(() => parsePresetsFile(JSON.stringify({ format: 'trpg-toolkit-project' }))).toThrow(
      '不是 UI 框素材產生器的預設檔。',
    );
    expect(() =>
      parsePresetsFile(JSON.stringify({ format: PRESET_FILE_FORMAT, presets: [{}] })),
    ).toThrow('檔案裡沒有可以用的預設。');
  });

  it('加進清單：新的識別碼、名稱重複加編號、最多 30 組', () => {
    const items = Array.from({ length: 28 }, (_, i) =>
      makeMine([], `組 ${i}`, PRESETS[0].design, texts),
    );
    const parsed = [0, 1, 2, 3].map(() => ({
      name: '組 0',
      design: PRESETS[1].design,
      texts: DEFAULT_TEXTS,
    }));
    const r = addParsed(items, parsed);
    expect(r.items).toHaveLength(MINE_MAX);
    expect(r.added).toBe(2);
    expect(r.dropped).toBe(2);
    expect(r.items.slice(28).map((t) => t.name)).toEqual(['組 0（2）', '組 0（3）']);
    expect(new Set(r.items.map((t) => t.id)).size).toBe(MINE_MAX);
  });

  it('名稱：去頭尾空白、合併空白、最多 40 字、空白時「未命名」；重複加編號', () => {
    expect(cleanName('  a   b ')).toBe('a b');
    expect(cleanName('')).toBe('未命名');
    expect(Array.from(cleanName('字'.repeat(50)))).toHaveLength(40);
    expect(uniqueName('甲', ['甲', '甲（2）'])).toBe('甲（3）');
  });

  it('存檔被改壞時整理：沒有外觀的丟掉、重複的 id 換新、最多 30 組', () => {
    const good = makeMine([], 'a', PRESETS[0].design, texts);
    const fixed = normalizeMine({
      items: [good, { ...good }, { id: 'x', name: 'no design' }, ...Array(40).fill(good)],
    });
    expect(fixed.items).toHaveLength(MINE_MAX);
    expect(fixed.items[0]).toEqual(good);
    expect(fixed.items[1].id).not.toBe(good.id);
    expect(normalizeMine(null)).toEqual({ items: [] });
  });
});
