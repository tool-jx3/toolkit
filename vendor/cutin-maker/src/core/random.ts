/** シード付き xorshift32。同じ seed で必ず同じ系列を返す */
export function xorshift32(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** レイヤーごとに独立した系列を得るためのシード派生 */
export function deriveSeed(seed: number, salt: string): number {
  let h = seed | 0;
  for (let i = 0; i < salt.length; i++) {
    h = (Math.imul(h, 31) + salt.charCodeAt(i)) | 0;
  }
  return h | 0;
}

/** 周期1のスムーズノイズ。noise1(0) === noise1(1) */
export function loopNoise(t: number, seed: number, harmonics = 3): number {
  const rnd = xorshift32(seed);
  let v = 0;
  let amp = 0;
  for (let k = 1; k <= harmonics; k++) {
    const phase = rnd() * Math.PI * 2;
    const a = 1 / k;
    v += a * Math.sin(2 * Math.PI * k * t + phase);
    amp += a;
  }
  return v / amp;
}
