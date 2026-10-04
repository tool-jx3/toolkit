// @vitest-environment jsdom
/**
 * core/three 的 exportGlb：材質的 PBR 參數（GLTFExporter 要 FileReader，用 jsdom 跑）。
 * - 不給 nonPbr：照 three.js 現行的換算（Phong 等非 PBR 材質 metallic 0、roughness 1）。
 * - nonPbr＝LEGACY_GLB_NON_PBR：照 r128 的換算（metallic 0.5、roughness 0.5；acrylic-goods 的亮面材質，F56）。
 * - MeshBasicMaterial 一律不受光照（KHR_materials_unlit）、MeshStandardMaterial 用自己的值，兩者都不受 nonPbr 影響。
 */
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
} from 'three';
import { describe, expect, it } from 'vitest';
import { exportGlb, LEGACY_GLB_NON_PBR } from '@/core/three/glb';
import { parseGlb } from '@/core/three/glbInfo';

function scene() {
  const g = new Group();
  const geo = new BoxGeometry(1, 1, 1);
  const phong = new MeshPhongMaterial({ name: 'phong', shininess: 100 });
  const basic = new MeshBasicMaterial({ name: 'basic' });
  const standard = new MeshStandardMaterial({ name: 'standard', metalness: 0.2, roughness: 0.7 });
  [phong, basic, standard].forEach((m, i) => {
    const mesh = new Mesh(geo, m);
    mesh.position.x = i * 2;
    g.add(mesh);
  });
  return g;
}

const byName = async (bytes: Promise<Uint8Array>) => {
  const json = parseGlb(await bytes).json;
  return Object.fromEntries((json.materials ?? []).map((m) => [m.name, m]));
};

describe('exportGlb 的材質', () => {
  it('不給 nonPbr：Phong 照現行的 0／1', async () => {
    const m = await byName(exportGlb(scene()));
    expect(m.phong.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0, roughnessFactor: 1 });
    expect(m.basic.extensions?.KHR_materials_unlit).toEqual({});
    expect(m.standard.pbrMetallicRoughness).toMatchObject({
      metallicFactor: 0.2,
      roughnessFactor: 0.7,
    });
  });

  it('nonPbr＝舊版（r128）：Phong 是 0.5／0.5；Basic、Standard 不受影響', async () => {
    expect(LEGACY_GLB_NON_PBR).toEqual({ metallic: 0.5, roughness: 0.5 });
    const m = await byName(exportGlb(scene(), { nonPbr: LEGACY_GLB_NON_PBR }));
    expect(m.phong.pbrMetallicRoughness).toMatchObject({
      metallicFactor: 0.5,
      roughnessFactor: 0.5,
    });
    expect(m.basic.extensions?.KHR_materials_unlit).toEqual({});
    expect(m.basic.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0, roughnessFactor: 0.9 });
    expect(m.standard.pbrMetallicRoughness).toMatchObject({
      metallicFactor: 0.2,
      roughnessFactor: 0.7,
    });
  });
});
