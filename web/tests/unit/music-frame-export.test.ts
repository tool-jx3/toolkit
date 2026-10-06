// @vitest-environment jsdom
/**
 * 音樂播放畫面產生器的影片匯出失敗時的訊息（規格 F61）：core/video 的 encodeMovie 丟出的錯誤換成這個工具的說明——
 * 超過 1 GB（too-large）、編碼器出錯或不支援（encoder、unsupported）；匯出中的狀態一定回到 false。
 * encodeMovie 換成丟錯的假函式（超過上限本身的判斷在 core-video-movie.test.ts）；畫布換成什麼都不畫的假 context。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MoviePlan, VideoEncodeError } from '@/core/video';
import { exportVideo } from '@/tools/music-frame/exporter';
import { useSession } from '@/tools/music-frame/store';
import { S } from '@/tools/music-frame/strings';
import { extractPalette } from '@/tools/music-frame/theme';
import type { ExportContext } from '@/ui';

const video = vi.hoisted(() => ({ encodeMovie: vi.fn() }));
vi.mock('@/core/video', async (orig) => ({
  ...(await orig<typeof import('@/core/video')>()),
  encodeMovie: video.encodeMovie,
}));

/** 什麼都不畫的 2D context（FrameRenderer 建立時要的 createImageData、createPattern 有回傳值） */
function fakeContext(): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = {
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    createPattern: () => ({}),
  };
  return new Proxy(props, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const plan = {
  container: 'mp4',
  extension: 'mp4',
  mimeType: 'video/mp4',
  video: { codec: 'vp09', config: { codec: 'vp09.00.40.08', width: 1920, height: 1080 } },
  audio: null,
} as MoviePlan;

const context = (): ExportContext => ({
  signal: new AbortController().signal,
  onProgress: () => {},
});

const getContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as unknown as HTMLCanvasElement['getContext'];
  /* 灰色的假封面（不畫示範封面） */
  const canvas = document.createElement('canvas');
  useSession.setState({
    art: {
      image: canvas,
      blur: canvas,
      palette: extractPalette(new Uint8ClampedArray(56 * 56 * 4).fill(128)),
      demo: false,
    },
    audio: null,
    exporting: false,
  });
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = getContext;
  video.encodeMovie.mockReset();
});

describe('影片匯出失敗的訊息（F61）', () => {
  it('超過 1 GB：「影片超過 1 GB…」；用 core/video 預設的上限（不另外給 maxBytes）', async () => {
    let exportingDuring = false;
    video.encodeMovie.mockImplementationOnce(async () => {
      exportingDuring = useSession.getState().exporting;
      throw new VideoEncodeError('too-large', '影片超過 1 GB，請縮小尺寸、降低 FPS 或縮短長度。');
    });
    await expect(exportVideo({ kind: 'offline', plan }, 30, context())).rejects.toThrow(
      S.exp.tooLarge,
    );
    expect(S.exp.tooLarge).toContain('超過 1 GB');
    expect(exportingDuring).toBe(true);
    expect(useSession.getState().exporting).toBe(false);
    expect(video.encodeMovie).toHaveBeenCalledTimes(1);
    const options = video.encodeMovie.mock.calls[0][0];
    expect(options.maxBytes).toBeUndefined();
    expect([options.width, options.height, options.fps, options.frameCount]).toEqual([
      1920, 1080, 30, 240,
    ]);
  });

  it('編碼器出錯、不支援：「影片編碼失敗，請改用 30 FPS 再試一次。」；其他錯誤照原樣', async () => {
    for (const code of ['encoder', 'unsupported'] as const) {
      video.encodeMovie.mockRejectedValueOnce(new VideoEncodeError(code, 'x'));
      await expect(exportVideo({ kind: 'offline', plan }, 60, context())).rejects.toThrow(
        S.exp.encoderFailed,
      );
      expect(useSession.getState().exporting).toBe(false);
    }
    video.encodeMovie.mockRejectedValueOnce(new Error('別的錯誤'));
    await expect(exportVideo({ kind: 'offline', plan }, 30, context())).rejects.toThrow('別的錯誤');
    expect(useSession.getState().exporting).toBe(false);
  });
});
