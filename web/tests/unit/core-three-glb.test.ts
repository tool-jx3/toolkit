/**
 * core/three 的 GLB 結構檢查（parseGlb，不載入 three.js）：檔頭、JSON 區塊、BIN 區塊、各種壞檔。
 */
import { describe, expect, it } from 'vitest';
import { GLB_MAGIC, parseGlb } from '@/core/three/glbInfo';

/** 照 glTF 2.0 規格組一個 GLB（JSON 以空白、BIN 以 0 補齊到 4 的倍數） */
function makeGlb(json: unknown, bin?: Uint8Array): Uint8Array {
  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  if (pad) {
    const t = new Uint8Array(text.length + pad).fill(0x20);
    t.set(text);
    text = t;
  }
  const binLen = bin ? bin.length + ((4 - (bin.length % 4)) % 4) : 0;
  const total = 12 + 8 + text.length + (bin ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, text.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  if (bin) {
    const o = 20 + text.length;
    dv.setUint32(o, binLen, true);
    dv.setUint32(o + 4, 0x004e4942, true);
    out.set(bin, o + 8);
  }
  return out;
}

describe('parseGlb', () => {
  it('讀出版本、總長、JSON 與 BIN 長度', () => {
    const json = {
      asset: { version: '2.0' },
      meshes: [{ primitives: [] }],
      buffers: [{ byteLength: 6 }],
    };
    const bytes = makeGlb(json, new Uint8Array([1, 2, 3, 4, 5, 6]));
    const g = parseGlb(bytes);
    expect(g.version).toBe(2);
    expect(g.length).toBe(bytes.length);
    expect(g.json.asset?.version).toBe('2.0');
    expect(g.json.meshes).toHaveLength(1);
    expect(g.binLength).toBe(8);
  });
  it('沒有 BIN 區塊時長度 0', () => {
    expect(parseGlb(makeGlb({ asset: { version: '2.0' } })).binLength).toBe(0);
  });
  it('壞檔：太短、檔頭不對、長度不符、第一塊不是 JSON', () => {
    expect(() => parseGlb(new Uint8Array(8))).toThrow('太短');
    const g = makeGlb({ asset: {} });
    const bad = g.slice();
    bad[0] = 0;
    expect(() => parseGlb(bad)).toThrow('不是 GLB');
    expect(() => parseGlb(g.slice(0, g.length - 4))).toThrow('長度');
    const notJson = g.slice();
    new DataView(notJson.buffer).setUint32(16, 0x12345678, true);
    expect(() => parseGlb(notJson)).toThrow('JSON');
  });
});
