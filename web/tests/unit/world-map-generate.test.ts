/**
 * 世界地圖產生器：自動產生的決定性、六種構成、町與道路、地名提案（規格 F14、F56、F59、3.12、3.13）。
 */
import { describe, expect, it } from 'vitest';
import { blankDoc } from '@/tools/world-map/model/factory';
import {
  familyOf,
  generateTerrain,
  generateWorld,
  landSimilarity,
  pickNewSeed,
  populateWorld,
} from '@/tools/world-map/model/generate';
import { sampleCurve } from '@/tools/world-map/model/geometry';
import { dominantClimate, suggestName } from '@/tools/world-map/model/names';
import { SAMPLE_IDS, sampleDoc } from '@/tools/world-map/model/samples';
import { decodeCells } from '@/tools/world-map/model/terrain';
import { CELL } from '@/tools/world-map/model/types';

const COLS = 128;
const ROWS = 80;
let n = 0;
const ids = () => `t${n++}`;

describe('地形的產生（3.12）', () => {
  it('同一個種子一定得到同一張地形；不同種子不同', () => {
    const a = generateTerrain(702, COLS, ROWS);
    const b = generateTerrain(702, COLS, ROWS);
    expect(b.terrain).toEqual(a.terrain);
    expect(b.ground).toEqual(a.ground);
    expect(generateTerrain(703, COLS, ROWS).terrain).not.toEqual(a.terrain);
  });

  it('構成＝種子 ÷ 6 的餘數；四周留海；以 2 × 2 格為單位；地表與地形一致', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = generateTerrain(seed * 1009, COLS, ROWS);
      expect(t.family).toBe(familyOf(seed * 1009));
      let land = 0;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const v = t.terrain[y * COLS + x];
          if (!v) continue;
          land++;
          expect(x >= 6 && x < 122 && y >= 6 && y < 74).toBe(true);
          expect(t.terrain[(y ^ (y & 1)) * COLS + (x ^ (x & 1))]).toBe(v);
          const g = t.ground[y * COLS + x];
          expect([1, 4, 5, 6]).toContain(g);
          if (v !== 2 && v !== 3) expect(g).toBe(v);
        }
      expect(land).toBeGreaterThan(500);
    }
  });

  it('「自動產生世界」挑構成不同、陸地最不像的', () => {
    const cur = generateTerrain(702, COLS, ROWS);
    let k = 0;
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05];
    const r = pickNewSeed(
      { seed: 702, terrain: cur.terrain },
      COLS,
      ROWS,
      () => seq[k++ % seq.length],
    );
    expect(familyOf(r.seed)).not.toBe(familyOf(702));
    expect(landSimilarity(cur.terrain, r.terrain.terrain)).toBeLessThan(0.9);
    expect(landSimilarity(cur.terrain, cur.terrain)).toBe(1);
  });
});

describe('町與道路（3.12）', () => {
  for (const seed of [702, 2402, 6006, 1206]) {
    it(`種子 ${seed}：據點在陸地上、第一個是王都、名字不重複、道路不穿過海`, () => {
      const t = generateTerrain(seed, COLS, ROWS);
      const a = populateWorld(t.terrain, t.ground, COLS, ROWS, seed, ids);
      const b = populateWorld(t.terrain, t.ground, COLS, ROWS, seed, ids);
      expect(b.objects.map((o) => [o.kind, o.name, o.x, o.y])).toEqual(
        a.objects.map((o) => [o.kind, o.name, o.x, o.y]),
      );
      expect(a.objects[0].kind).toBe('capital');
      expect(new Set(a.objects.map((o) => o.name)).size).toBe(a.objects.length);
      const land = (x: number, y: number) =>
        t.terrain[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] > 0;
      for (const o of a.objects) expect(land(o.x, o.y)).toBe(true);
      expect(a.paths.length).toBeGreaterThan(0);
      for (const p of a.paths) {
        expect(p.kind).toBe('road');
        for (const q of sampleCurve(p.points, p.smooth)) expect(land(q.x, q.y)).toBe(true);
      }
    });
  }

  it('整張地圖：國、地名清空，主題與畫法沿用，山林的圖案打開', () => {
    const base = { ...blankDoc(), theme: 'night' as const, drawMode: 'free' as const };
    base.settings.details = false;
    const d = generateWorld(base, 6006, null, ids);
    expect(d.theme).toBe('night');
    expect(d.drawMode).toBe('free');
    expect(d.settings.details).toBe(true);
    expect(d.regions).toEqual([]);
    expect(d.notes).toEqual([]);
    expect(d.title).toBe('無名大陸');
    expect(decodeCells(d.terrain, COLS * ROWS)).toEqual(generateTerrain(6006, COLS, ROWS).terrain);
  });
});

describe('範本（F56）', () => {
  it('三張範本：素材都在陸地上（港口、帆船、燈塔除外）', () => {
    for (const id of SAMPLE_IDS) {
      const d = sampleDoc(id);
      const t = decodeCells(d.terrain, COLS * ROWS);
      for (const o of d.objects) {
        if (['ship', 'port', 'beacon'].includes(o.kind)) continue;
        expect(
          t[Math.floor(o.y / CELL) * COLS + Math.floor(o.x / CELL)],
          `${id} ${o.kind} ${o.name}`,
        ).toBeGreaterThan(0);
      }
      expect(d.title).toBeTruthy();
    }
    const sketch = sampleDoc('sketch');
    expect(/[2-6]/.test(sketch.terrain)).toBe(false);
    expect(sketch.settings.details).toBe(false);
    expect(sketch.objects.every((o) => o.kind === 'star' || o.kind === 'dot')).toBe(true);
  });
});

describe('地名提案（F59、3.13）', () => {
  it('同一個種子、種類、氣候得到同一個名字', () => {
    expect(suggestName('town', 42)).toBe(suggestName('town', 42));
    const names = new Set(Array.from({ length: 40 }, (_, i) => suggestName('town', i + 1)));
    expect(names.size).toBeGreaterThan(30);
  });

  it('種類的稱呼：王都放在前面、國與港口接在後面', () => {
    for (let s = 1; s <= 30; s++) {
      expect(suggestName('capital', s)).toMatch(/^(王都|皇都|聖都|舊都)/);
      expect(suggestName('region', s)).toMatch(/(王國|公國|聯邦|帝國|自治領|共和國|侯國)$/);
      expect(suggestName('port', s)).toMatch(/(港|津|灣港|埠)$/);
      expect(suggestName('river', s)).toMatch(/(河|江|溪|川)$/);
    }
  });

  it('附近的雪原、沙漠、濕地超過一半時，有人住的地方用那種氣候的字開頭', () => {
    for (let s = 1; s <= 20; s++) {
      expect(suggestName('town', s, { snow: 0.8, desert: 0, wet: 0 })).toMatch(/^[雪霜冰凜]/);
      expect(suggestName('castle', s, { snow: 0, desert: 0.6, wet: 0 })).toMatch(/^[沙砂赤炎]/);
      expect(suggestName('village', s, { snow: 0, desert: 0, wet: 0.9 })).toMatch(/^[葦沼霧蘆]/);
      expect(suggestName('capital', s, { snow: 0.8, desert: 0, wet: 0 })).toMatch(
        /^(王都|皇都|聖都|舊都)[雪霜冰凜]/,
      );
    }
    /* 不是有人住的地方不換 */
    const plain = suggestName('forest', 3, null);
    expect(suggestName('forest', 3, { snow: 1, desert: 0, wet: 0 })).toBe(plain);
    expect(dominantClimate({ snow: 0.5, desert: 0, wet: 0 })).toBeNull();
  });
});
