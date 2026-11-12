/**
 * Screen Loop（規格 3.16、F90～F94）：攝影機對著電視拍、電視播著攝影機自己的畫面——畫面裡有一個小一點的畫面，裡面又有一個……
 * 本站的做法（NTSCRT 是真的一格一格回授；這裡每一格從最裡面一層算到最外面一層，所以 PNG 與動畫的每一格各自就是完整的隧道）：
 *   第 0 層＝照片照常畫一格；第 i 層＝「攝影機拍到的畫面」：照片（房間）上面，以消失點為中心縮小 zoom、轉 roll 的電視
 *   （畫著第 i − 1 層的輸出，柔化、偏色、乘亮度），亮度鍵打開時照片亮的地方蓋回最上面——再把這張當成照片，照常畫一格
 *   （每一層都再套一次整個效果：雜訊、色差、色調與映像管累積）。最外面一層是輸出。
 * 動作：推進、旋轉在動畫的長度裡做完（無縫循環時出去再回來）；手持晃動是三層搖晃的和（無縫循環時每一層在一個動畫長度裡晃整數次）；
 * 每往裡一層，時間往前 0.09 秒（隧道慢一拍跟著晃；早於 0 秒的從動畫的最後接回來）。NTSC 訊號只套在最外面一層（每層都跑太慢，D38）；
 * 預覽播放中、拖曳消失點時最多畫 LOOP_DRAFT_DEPTH 層（暫停與匯出照設定）。
 */

import type { Loop } from './look';
import { type Aspect, DEFAULT_VIEW } from './model';
import type { AnyCanvas, ComposeLook, Ctx, FrameParams, Master, VhsRenderer } from './render';

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/** 每往裡一層，時間往前幾秒 */
export const LOOP_DELAY = 0.09;

/**
 * 手持晃動：三層搖晃（振幅、每秒幾次；無縫循環時改成「一個動畫長度裡晃幾次」的整數，晃動就照動畫的長度重複）、
 * 每一軸（左右、上下、角度）各自的起始相位。
 */
const SHAKE_LAYERS = [
  { amp: 0.6, perSecond: 0.37, perLoop: 1 },
  { amp: 0.3, perSecond: 0.83, perLoop: 2 },
  { amp: 0.1, perSecond: 1.9, perLoop: 5 },
] as const;
const SHAKE_PHASE = [
  [0.3, 2.1, 4.4],
  [1.7, 5.2, 0.9],
  [3.9, 0.4, 2.8],
] as const;

/** 攝影機在某個時間的姿勢：電視的大小（外面一層的比例）、角度（度）、消失點（畫面的比例，0～1） */
export interface LoopPose {
  zoom: number;
  roll: number;
  vx: number;
  vy: number;
}

/** 時間 t 的姿勢；period＝動畫的長度（秒：推進、旋轉在這段時間裡做完） */
export function loopPose(l: Loop, t: number, period: number): LoopPose {
  const L = Math.max(0.09, period);
  /* 動畫裡走到哪裡（0～1） */
  const u = (((t % L) + L) % L) / L;
  /* 推進、旋轉的進度：無縫循環時是個鐘形（0 → 1 → 0，頭尾的速度都是 0），否則從頭走到尾 */
  const move = l.seamless ? Math.sin(Math.PI * u) ** 2 : u;
  /* 搖晃的角度（弧度）：無縫循環時以動畫裡的位置算，否則以秒算 */
  const wobble = (axis: number) =>
    SHAKE_LAYERS.reduce((sum, w, k) => {
      const turns = l.seamless ? w.perLoop * u : w.perSecond * t;
      return sum + w.amp * Math.sin(turns * 2 * Math.PI + SHAKE_PHASE[axis][k]);
    }, 0);
  const shake = l.shake / 100;
  return {
    zoom: Math.min(0.98, Math.max(0.2, (l.zoom / 100) * (1 + (l.push / 100) * move))),
    roll: l.roll + l.spin * move + shake * 1.5 * wobble(2),
    vx: 0.5 + l.cx / 100 + shake * 0.035 * wobble(0),
    vy: 0.5 + l.cy / 100 + shake * 0.03 * wobble(1),
  };
}

/** 色彩（＋暖、－冷）→ 相乘的顏色 */
export function driftTint(color: number): string | null {
  const c = color / 100;
  if (c === 0) return null;
  const a = Math.abs(c);
  const [r, g, b] = c > 0 ? [255, 255 - 22 * a, 255 - 60 * a] : [255 - 60 * a, 255 - 18 * a, 255];
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export interface LoopInput {
  /** 這一層要用的場景（照片依位置畫好、蓋滿畫面；或數位攝影拍的那一格） */
  scene: AnyCanvas;
  aspect: Aspect;
  /** 照片層的合成寬度 */
  res: number;
  look: ComposeLook;
  /** 某個時間、某一層的照片層 → 一格的設定（文字、效果…）；outer＝最外面一層 */
  params: (t: number, master: Master, outer: boolean) => FrameParams;
  /** 第 0 層的照片層（照常的那一張） */
  inner: (t: number) => Master;
}

/** 播放中、拖曳消失點時預覽最多畫幾層（暫停與匯出照設定的層數） */
export const LOOP_DRAFT_DEPTH = 3;

/**
 * 畫一格 Screen Loop 到 out。t＝這一格的時間、period＝動畫的長度。回傳畫了幾層（測試用）。
 */
export function paintLoop(
  r: VhsRenderer,
  out: AnyCanvas,
  l: Loop,
  t: number,
  period: number,
  input: LoopInput,
): number {
  const steps = loopSteps(r, out, l, t, period, input);
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/**
 * 同 paintLoop，分段畫：每畫完一個步驟（一層的照片層、一層的一格，NTSC 的前後）停一下（yield），
 * 匯出時呼叫端在這裡讓出主執行緒。
 */
export function* loopSteps(
  r: VhsRenderer,
  out: AnyCanvas,
  l: Loop,
  t: number,
  period: number,
  input: LoopInput,
): Generator<void, number, void> {
  const W = out.width;
  const H = out.height;
  const depth = Math.max(1, Math.round(l.depth));
  const { res, scene } = input;
  /* 每往裡一層用 bufs 的另一張（第 0 層 bufs[0]、第 1 層 bufs[1]…） */
  const camW = scene.width;
  const camH = scene.height;
  /* 兩張輪流用的輸出（最外面一層畫到 out） */
  const bufs = [r.canvas('loop-a', W, H), r.canvas('loop-b', W, H)];
  /* 裡面的層比較早；早於 0 的從動畫的最後接回來（時間一定 ≥ 0，GIF 的第一格接得上最後一格） */
  const L = Math.max(LOOP_DELAY, period);
  const timeOf = (i: number) => {
    const ti = t - (depth - i) * LOOP_DELAY;
    return ti >= 0 ? ti : ((ti % L) + L) % L;
  };
  let prev: AnyCanvas = bufs[0];
  yield* r.frameSteps(prev, input.params(timeOf(0), input.inner(timeOf(0)), false));
  yield;
  const cam = r.canvas('loop-cam', camW, camH);
  const tv = r.canvas('loop-tv', camW, camH);
  const sceneData = l.key > 0 ? ctx2d(scene).getImageData(0, 0, camW, camH).data : null;
  for (let i = 1; i <= depth; i++) {
    const ti = timeOf(i);
    const pose = loopPose(l, ti, period);
    /* 電視上的畫面：柔化（縮小再放大）、偏色、亮度 */
    const tg = ctx2d(tv);
    tg.globalCompositeOperation = 'source-over';
    tg.globalAlpha = 1;
    tg.fillStyle = '#000';
    tg.fillRect(0, 0, camW, camH);
    tg.imageSmoothingEnabled = true;
    tg.imageSmoothingQuality = 'high';
    const blur = 1 + (l.soft / 100) * 5;
    if (blur > 1.05) {
      const sw = Math.max(2, Math.round(camW / blur));
      const sh = Math.max(2, Math.round(camH / blur));
      const small = r.canvas('loop-soft', sw, sh);
      const sg = ctx2d(small);
      sg.imageSmoothingEnabled = true;
      sg.imageSmoothingQuality = 'high';
      sg.clearRect(0, 0, sw, sh);
      sg.drawImage(prev, 0, 0, sw, sh);
      tg.drawImage(small, 0, 0, camW, camH);
    } else tg.drawImage(prev, 0, 0, camW, camH);
    const tint = driftTint(l.color);
    if (tint) {
      tg.globalCompositeOperation = 'multiply';
      tg.fillStyle = tint;
      tg.fillRect(0, 0, camW, camH);
    }
    const gain = l.gain / 100;
    if (gain < 1) {
      tg.globalCompositeOperation = 'multiply';
      const v = Math.round(gain * 255);
      tg.fillStyle = `rgb(${v},${v},${v})`;
      tg.fillRect(0, 0, camW, camH);
    } else if (gain > 1) {
      tg.globalCompositeOperation = 'lighter';
      tg.globalAlpha = gain - 1;
      tg.drawImage(r.snapshot('loop-gain', tv), 0, 0);
      tg.globalAlpha = 1;
    }
    tg.globalCompositeOperation = 'source-over';
    /* 攝影機拍到的：場景（房間）＋以消失點為中心縮小、轉動的電視 */
    const cg = ctx2d(cam);
    cg.globalCompositeOperation = 'source-over';
    cg.globalAlpha = 1;
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.drawImage(scene, 0, 0);
    cg.imageSmoothingEnabled = true;
    cg.imageSmoothingQuality = 'high';
    const px = pose.vx * camW;
    const py = pose.vy * camH;
    cg.save();
    cg.translate(px, py);
    cg.rotate((pose.roll * Math.PI) / 180);
    cg.scale(pose.zoom, pose.zoom);
    cg.translate(-px, -py);
    cg.drawImage(tv, 0, 0);
    cg.restore();
    /* 亮度鍵：照片亮的部分蓋回最上面（柔邊） */
    if (sceneData) keyOver(cg, sceneData, camW, camH, l.key / 100, l.keyInvert);
    const master = r.compose(cam, { width: camW, height: camH }, DEFAULT_VIEW, input.aspect, res, {
      ...input.look,
      flip: false,
    });
    yield;
    const target = i === depth ? out : bufs[i % 2];
    yield* r.frameSteps(target, input.params(ti, master, i === depth));
    if (i < depth) yield;
    prev = target;
  }
  return depth;
}

/**
 * 亮度鍵：場景的亮度超過 1 − key 的地方（前後 0.08 柔邊）蓋回去。
 * invert（2026-11-12，參考 NTSCRT 的 Key the dark parts，MIT）：亮度反過來看（1 − 亮度），暗的部分蓋在上面、隧道從亮的地方透出來。
 */
function keyOver(
  g: Ctx,
  scene: Uint8ClampedArray,
  w: number,
  h: number,
  key: number,
  invert = false,
): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const lo = 1 - key - 0.08;
  const hi = 1 - key + 0.08;
  for (let i = 0; i < d.length; i += 4) {
    const y = (0.299 * scene[i] + 0.587 * scene[i + 1] + 0.114 * scene[i + 2]) / 255;
    const l = invert ? 1 - y : y;
    if (l <= lo) continue;
    const u = l >= hi ? 1 : (l - lo) / (hi - lo);
    const a = u * u * (3 - 2 * u);
    d[i] += (scene[i] - d[i]) * a;
    d[i + 1] += (scene[i + 1] - d[i + 1]) * a;
    d[i + 2] += (scene[i + 2] - d[i + 2]) * a;
  }
  g.putImageData(img, 0, 0);
}
