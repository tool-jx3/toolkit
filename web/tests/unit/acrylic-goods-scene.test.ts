/**
 * 壓克力周邊工房的場景材質（規格 3.5、F38）：壓克力本體半透明、雙面、不寫深度，且**一次畫完正反面**
 * （forceSinglePass，同 three.js r128；r150 起預設分兩次畫，底座後側透過頂面看起來比舊版亮）。
 * 印圖照常（不透明的部分以 alphaTest 切掉透明處）。三種周邊都用同一種壓克力材質。
 */
import { type Material, type Mesh, MeshPhongMaterial, type Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ImageInfo, useImages } from '@/tools/acrylic-goods/media';
import { defaultSettings, type Kind, type Settings } from '@/tools/acrylic-goods/model';
import { buildScene } from '@/tools/acrylic-goods/scene';

/** 40 × 40、中間 20 × 20 不透明的圖（只用來算外框；貼圖不必真的畫） */
function fakeImage(id: string): ImageInfo {
  const alpha = new Uint8Array(40 * 40);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) alpha[y * 40 + x] = 255;
  return {
    id,
    width: 40,
    height: 40,
    canvas: {} as HTMLCanvasElement,
    alpha: { width: 40, height: 40, alpha, sourceWidth: 40, sourceHeight: 40 },
  };
}

beforeAll(() => {
  useImages.setState({ images: { a1: fakeImage('a1'), a2: fakeImage('a2') } });
});

function materials(kind: Kind, s: Settings): Material[] {
  const r = buildScene(kind, s, (t) => t, 1);
  if (!r.ok) throw new Error(r.error);
  const out = new Set<Material>();
  r.build.root.traverse((o: Object3D) => {
    const m = (o as Mesh).material;
    if (m) out.add(m as Material);
  });
  return [...out];
}

describe('壓克力的材質（F38）', () => {
  const settings = () => {
    const s = defaultSettings();
    s.stand.front = 'a1';
    s.stand.back = 'a2';
    s.shaker.parts = [{ id: 'p', image: 'a1', qty: 2, scale: 100 }];
    s.diorama.layers = [
      { id: 'l1', image: 'a1', x: 0, y: 0, rotation: 0 },
      { id: 'l2', image: 'a2', x: 0, y: 0, rotation: 0 },
    ];
    return s;
  };

  for (const kind of ['stand', 'shaker', 'diorama'] as const) {
    it(`${kind}：壓克力一次畫完正反面（forceSinglePass）、半透明、不寫深度`, () => {
      const list = materials(kind, settings());
      const acrylic = list.filter((m) => m.name === '壓克力');
      expect(acrylic).toHaveLength(1);
      const a = acrylic[0] as MeshPhongMaterial;
      expect(a).toBeInstanceOf(MeshPhongMaterial);
      expect(a).toMatchObject({
        forceSinglePass: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        shininess: 120,
      });
      /* 印圖：照常（alphaTest 切掉透明處） */
      const prints = list.filter((m) => m.name !== '壓克力');
      expect(prints.length).toBeGreaterThan(0);
      for (const m of prints) expect(m.alphaTest).toBe(0.5);
    });
  }

  it('霧面：印圖不受光照；壓克力本體照舊', () => {
    const s = settings();
    s.material.finish = 'matte';
    const list = materials('stand', s);
    expect(list.find((m) => m.name === '壓克力')?.forceSinglePass).toBe(true);
    expect(
      list.filter((m) => m.name !== '壓克力').every((m) => m.type === 'MeshBasicMaterial'),
    ).toBe(true);
  });
});
