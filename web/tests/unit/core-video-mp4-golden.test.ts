/**
 * MP4 檔頭的黃金測試：music-frame 把 `mp4Header` 改成共用的 movieLayout（加了聲音軌、MOV、非關鍵影格）之後，
 * 沒有聲音的單軌 MP4（character-select 的輸出）必須與改版前逐位元組相同。
 * 下面的雜湊是改版前（commit 1998385 的 core/video/encode.ts）對同樣輸入算出來的。
 */
import { describe, expect, it } from 'vitest';
import { mp4Header } from '@/core/video';
import { movieLayout } from '@/core/video/mp4';

const CASES: {
  sizes: number[];
  desc: number[];
  w: number;
  h: number;
  fps: number;
  length: number;
  sha256: string;
}[] = [
  {
    sizes: [100, 37, 250],
    desc: [1, 0x42, 0, 0x1f, 0xff, 0xe1, 0],
    w: 640,
    h: 360,
    fps: 30,
    length: 655,
    sha256: '066a2140f57bf6d7a5a9579d4293842fe89400e5aab05b70d5f065efb3d5359f',
  },
  {
    sizes: [5000, 4000, 3000, 2000, 1000, 999, 1234, 4321],
    desc: [
      1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80,
    ],
    w: 1920,
    h: 1080,
    fps: 60,
    length: 707,
    sha256: 'af709b2799c91fcb34aca91f479e05b9b110f9cda87cead3567a6f81365ff410',
  },
  {
    sizes: [1],
    desc: [1, 0x4d, 0, 0x0a, 0xff, 0xe0, 0],
    w: 2,
    h: 2,
    fps: 1,
    length: 639,
    sha256: '84bbfc08c973efe25de86bd02e9791c423889da16ac8b9954676a56961c34f91',
  },
];

async function sha256(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b.slice()));
  return Array.from(d, (v) => v.toString(16).padStart(2, '0')).join('');
}

describe('mp4Header：與改版前逐位元組相同', () => {
  for (const c of CASES) {
    it(`${c.w}×${c.h}、${c.fps} FPS、${c.sizes.length} 格`, async () => {
      const head = mp4Header(c.sizes, new Uint8Array(c.desc), c.w, c.h, c.fps);
      expect(head.length).toBe(c.length);
      expect(await sha256(head)).toBe(c.sha256);
      /* 共用的 movieLayout 不給聲音、不給關鍵影格表時就是這個檔頭，資料一個區塊 */
      const layout = movieLayout({
        codec: 'avc1',
        config: new Uint8Array(c.desc),
        width: c.w,
        height: c.h,
        fps: c.fps,
        sizes: c.sizes,
      });
      expect(layout.head).toEqual(head);
      expect(layout.chunks).toEqual([{ track: 'video', first: 0, count: c.sizes.length }]);
      expect(layout.size).toBe(head.length + c.sizes.reduce((a, b) => a + b, 0));
    });
  }
});
