/**
 * 2.5D 動態立繪（anime-rig）：網格、錨點位移、變形、物理與自動動作（規格 1.3、3.4）。
 *
 * 舊版還在 repo 時，從 `tools/anime-rig/lib/app.js` 取出原作的 prepareLayers／applyAnchors／animate／deform，
 * 在 Node 的 vm 裡跑（亂數固定），與新版逐格比對頂點位置、不透明度、自動動作的參數。
 */
import { describe, expect, it } from 'vitest';
import { genericParts } from '../../src/tools/anime-rig/genericParts';
import {
  type AutoState,
  defaultParams,
  PARAM_DEFS,
  type Params,
} from '../../src/tools/anime-rig/params';
import {
  Animator,
  applyAnchorOffsets,
  type Bounce,
  buildBangWeights,
  deform,
  fadeAlpha,
  type LayerRuntime,
  prepareLayer,
  restFrame,
  stillFrame,
  updateSprings,
} from '../../src/tools/anime-rig/pose';
import { buildRig, cleanPsdLayers, type PsdRoot, type Rig } from '../../src/tools/anime-rig/rigger';
import { clonePsd, rigTestPsd } from '../helpers/animeRig';
import { legacyEnv } from '../helpers/animeRigLegacy';

const legacyFiles = await legacyEnv();
const hasLegacy = legacyFiles.has;
const vm = legacyFiles.vm;

function testRig(): Rig {
  const psd = clonePsd(rigTestPsd()) as unknown as PsdRoot;
  cleanPsdLayers(psd);
  return buildRig(psd, { generic: genericParts() });
}

/** 決定性的亂數（mulberry32） */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AUTO_ON: AutoState = {
  idle: true,
  blink: true,
  rand: true,
  talk: true,
  mouse: false,
  phys: true,
};

describe('網格與靜止的姿勢', () => {
  it('網格：一格約 42 px（有物理 30 px）、索引、髮束權重', () => {
    const rig = testRig();
    const face = prepareLayer(rig.layers.find((l) => l.name === 'face')!, 512);
    expect(face.id).toBe('4:face');
    expect(face.bn).toBe('face');
    const nx = Math.max(2, Math.round(face.w / (42 * 0.6667)));
    expect(face.base.length).toBeGreaterThan(0);
    expect(face.indices.length % 6).toBe(0);
    expect(face.uv[0]).toBe(0);
    expect(face.base[0]).toBe(face.x);
    expect(nx).toBeGreaterThan(2);
    const hair = prepareLayer(rig.layers.find((l) => l.name === 'front hair')!, 512);
    expect(hair.spr).toHaveLength(5);
    const nS = 5;
    const nv = hair.base.length / 2;
    for (let v = 0; v < nv; v += 7) {
      let sum = 0;
      for (let s = 0; s < nS; s++) sum += hair.sw![v * nS + s];
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('預設參數、呼吸 0：臉與眼睛的頂點不動；角度 X 讓頭部依深度移動', () => {
    const rig = testRig();
    const P = applyAnchorOffsets(rig.anchors, {});
    const layers = rig.layers.map((p) => prepareLayer(p, 512));
    for (const L of layers) buildBangWeights(L, P);
    const ctx = { ...P, phys: true, bounceDy: 0 };
    const e = stillFrame(defaultParams());
    for (const L of layers.filter((l) => ['face', 'eyewhite', 'irides'].includes(l.bn))) {
      deform(L, e, ctx);
      for (let k = 0; k < L.base.length; k++) expect(L.cur[k]).toBeCloseTo(L.base[k], 4);
    }
    const face = layers.find((l) => l.bn === 'face')!;
    deform(face, { ...e, angleX: 1 }, ctx);
    const y = face.base[1];
    expect(face.cur[0] - face.base[0]).toBeCloseTo(P.FS * (14 + 0.028 * (P.NP.cy - y)), 3);
  });

  it('不透明度：睜眼／閉眼、張嘴／閉嘴交叉淡化，長閉眼只在第 2 種眨眼', () => {
    const e = stillFrame(defaultParams());
    const alt = { L: true, R: false };
    expect(fadeAlpha({ fade: 'eyeOpen', side: 'L' }, e, alt, 1)).toBe(1);
    expect(fadeAlpha({ fade: 'eyeClose', side: 'L' }, { ...e, eyeOpenL: 0 }, alt, 1)).toBe(1);
    expect(fadeAlpha({ fade: 'eyeClose', side: 'L' }, { ...e, eyeOpenL: 0 }, alt, 2)).toBe(0);
    expect(fadeAlpha({ fade: 'eyeClose2', side: 'L' }, { ...e, eyeOpenL: 0 }, alt, 2)).toBe(1);
    expect(fadeAlpha({ fade: 'eyeClose', side: 'R' }, { ...e, eyeOpenR: 0 }, alt, 2)).toBe(1);
    expect(fadeAlpha({ fade: 'mouthOpen', side: null }, e, alt, 1)).toBe(0);
    expect(fadeAlpha({ fade: 'mouthClose', side: null }, e, alt, 1)).toBe(1);
    expect(fadeAlpha({ fade: 'mouthOpen', side: null }, { ...e, mouthOpen: 1 }, alt, 1)).toBe(1);
  });

  it('錨點位移：嘴巴整個移動、閉眼只動高度、胸部跟著脖子', () => {
    const rig = testRig();
    const P = applyAnchorOffsets(rig.anchors, {
      mouth: { dx: 3, dy: -2 },
      eyeLClose: { dy: 4 },
      neck: { dx: 1 },
      chest: { dy: 10 },
    });
    expect(P.A.mouth.x0).toBe(rig.anchors.mouth.x0 + 3);
    expect(P.A.mouth.cy).toBe(rig.anchors.mouth.cy - 2);
    expect(P.A.eyeL!.closeY).toBe(rig.anchors.eyeL!.closeY + 4);
    expect(P.A.eyeL!.icx).toBe(rig.anchors.eyeL!.icx);
    expect(P.CHEST.cx).toBe(rig.anchors.neckPivot.cx + 1);
    const fh = rig.anchors.face.y1 - rig.anchors.face.y0;
    expect(P.CHEST.cy).toBeCloseTo(rig.anchors.neckBottom + fh * 0.6 + 10, 9);
    /* 原本的錨點不動 */
    expect(rig.anchors.mouth.x0).not.toBe(P.A.mouth.x0);
  });

  it('錨點編輯的靜止姿勢：角度、視線、呼吸歸零，拖閉眼位置時那一眼閉上', () => {
    const t = { ...defaultParams(), angleX: 0.5, eyeX: 1, brow: 0.3 };
    const r = restFrame(t, 'R');
    expect(r).toMatchObject({ angleX: 0, eyeX: 0, brow: 0.3, eyeOpenR: 0, eyeOpenL: 1, breath: 0 });
  });

  it('自動眨眼：表情預設開著時不眨眼、攝影機追蹤時採用追蹤值', () => {
    const a = new Animator(defaultParams(), 0, seeded(1));
    const input = {
      target: defaultParams(),
      auto: AUTO_ON,
      preset: true,
      cam: null,
      mouse: null,
      mic: null,
    };
    let minEye = 1;
    for (let i = 0; i < 600; i++)
      minEye = Math.min(minEye, a.step(i * 16.7, 1 / 60, input, false).eyeOpenL);
    expect(minEye).toBeGreaterThan(0.99);
    const b = new Animator(defaultParams(), 0, seeded(1));
    const cam = { ax: 0.5, ay: 0, az: 0, eL: 0.2, eR: 0.2, mo: 0.6, ex: 0, ey: 0, br: 0, mf: 0 };
    let f = b.step(0, 1 / 60, { ...input, preset: false, cam }, false);
    for (let i = 1; i < 120; i++)
      f = b.step(i * 16.7, 1 / 60, { ...input, preset: false, cam }, false);
    expect(f.angleX).toBeCloseTo(0.5, 2);
    expect(f.eyeOpenL).toBeCloseTo(0.2, 2);
    expect(f.mouthOpen).toBeCloseTo(0.6, 2);
    expect(f.body).toBeCloseTo(0.125, 2);
  });
});

/* ---------- 與舊版逐格比對 ---------- */

function legacyContext(rig: Rig, random: () => number, offsets: Record<string, unknown>) {
  const src = legacyFiles.read('app.js');
  const cut = (from: string, to: string) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error(`找不到 ${from}`);
    return src.slice(a, b);
  };
  const prepare = cut('function prepareLayers(rig){', 'function renderAnchorSummary(){');
  const animation = cut(
    '// ---------- animation ----------',
    '// ---------- render loop ----------',
  );
  const RT = legacyFiles.load('runtime.js');
  const Rigger = legacyFiles.load('rigger.js');
  const ctx = vm.createContext({ RT, Rigger, __random: random, __rig: rig, __offsets: offsets });
  const prelude = `
    Math.random = __random;
    const clamp=(v,a,b)=>v<a?a:v>b?b:v;
    function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
    let __now=0; const performance={now:()=>__now};
    const gl={MAX_TEXTURE_SIZE:1,MAX_VIEWPORT_DIMS:2,getParameter:(p)=>p===1?16384:[16384,16384]};
    const renderer={upload(){},dispose(){}};
    function makeThumb(){return '';}
    function renderAnchorSummary(){} function renderOverlay(){} function invalidate(){}
    let layers=[],A=null,baseAnchors=null,anchorOffsets={},FS=1,NP=null,BP=null,FC=null,CHEST=null,hasEyeClose2=false;
    let anchorMode=false,anchorPreview=null,activePreset=null,OBS_MODE=false;
    const bounce={x:0,v:0,dy:0};
    const auto={idle:true,blink:true,rand:true,talk:true,mouse:false,mic:false,phys:true,cam:false};
    const cam={live:false};let lastTrackingAt=0,camPhysScale=1,remoteMic=0,remoteMicAt=-1e9,micLevel=0;
    const mouse={x:0,y:0,in:false};
    const mic={active:false};
    const P=${JSON.stringify(defaultParams())};
    const TGT=Object.assign({},P),cur=Object.assign({},P);
    const parameterRanges=${JSON.stringify(Object.fromEntries(PARAM_DEFS.map((d) => [d.key, [d.min, d.max]])))};
  `;
  vm.runInContext(
    `${prelude}\n${prepare}\n${animation}\n
     layers=prepareLayers(__rig);baseAnchors=JSON.parse(JSON.stringify(__rig.anchors));anchorOffsets=__offsets;applyAnchors();
     nextBlink=1800;`,
    ctx,
  );
  return {
    run: (code: string) => vm.runInContext(code, ctx),
    ctx,
  };
}

describe.skipIf(!hasLegacy)('與舊版的網格、變形、自動動作逐格相同', () => {
  it('網格、髮束與瀏海的權重、錨點', () => {
    const rig = testRig();
    const offsets = { face: { dx: 4 }, mouth: { dy: 2 }, chest: { dx: -3, dy: 5 } };
    const old = legacyContext(rig, seeded(7), offsets);
    const P = applyAnchorOffsets(rig.anchors, offsets);
    const mine = rig.layers.map((p) => prepareLayer(p, 512));
    for (const L of mine) buildBangWeights(L, P);
    const oldLayers = old.run('layers') as Record<string, Float32Array | unknown>[];
    expect(mine.map((l) => l.id)).toEqual(oldLayers.map((l) => l.id));
    mine.forEach((L, i) => {
      const o = oldLayers[i];
      for (const k of ['base', 'sw', 'su', 'bw'] as const) {
        if (o[k] == null) expect(L[k]).toBeNull();
        else expect(Array.from(L[k] as Float32Array)).toEqual(Array.from(o[k] as Float32Array));
      }
      expect(L.bn).toBe(o.bn);
    });
    expect(JSON.parse(JSON.stringify(P.A))).toEqual(JSON.parse(JSON.stringify(old.run('A'))));
    expect(P.CHEST).toEqual(old.run('CHEST'));
    expect(P.FS).toBe(old.run('FS'));
  });

  it('自動動作 240 格：參數、頂點、不透明度都相同', () => {
    const rig = testRig();
    const old = legacyContext(rig, seeded(42), {});
    const P = applyAnchorOffsets(rig.anchors, {});
    const layers: LayerRuntime[] = rig.layers.map((p) => prepareLayer(p, 512));
    for (const L of layers) buildBangWeights(L, P);
    const animator = new Animator(defaultParams(), 0, seeded(42));
    const bounce: Bounce = { x: 0, v: 0, dy: 0 };
    const target: Params = { ...defaultParams(), bustY: 0.4, fhAmp: 2.5 };
    old.run(`Object.assign(TGT, ${JSON.stringify(target)})`);
    const dts = [1 / 60, 1 / 30, 0.05, 1 / 144];
    let now = 0;
    for (let f = 0; f < 240; f++) {
      const dt = dts[f % dts.length];
      now += dt * 1000;
      old.run(
        `__now=${now};globalThis.__e=animate(${now},${dt});for(const L of layers)deform(L,__e);`,
      );
      const e = animator.step(
        now,
        dt,
        { target, auto: AUTO_ON, preset: false, cam: null, mouse: null, mic: null },
        false,
      );
      updateSprings(layers, e, now / 1000, dt, true, P, bounce);
      const ctx = { ...P, phys: true, bounceDy: bounce.dy };
      for (const L of layers) deform(L, e, ctx);
      const oe = old.run('__e') as Record<string, number>;
      for (const k of Object.keys(e) as (keyof typeof e)[]) expect(e[k]).toBeCloseTo(oe[k], 10);
      if (f % 20 === 19) {
        const oldLayers = old.run('layers') as { cur: Float32Array; fade: string; side: string }[];
        const alt = { L: false, R: false };
        layers.forEach((L, i) => {
          const oc = oldLayers[i].cur;
          for (let k = 0; k < L.cur.length; k++) expect(L.cur[k]).toBeCloseTo(oc[k], 3);
          const oa = old.run(`fadeAlpha(layers[${i}],__e,{L:false,R:false})`) as number;
          expect(fadeAlpha(L, e, alt, animator.blinkVariant)).toBeCloseTo(oa, 10);
        });
      }
    }
  });
});
