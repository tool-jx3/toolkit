/**
 * 連番 PNG（打包成 ZIP）。每次 addFrame 存一張（ticks > 1 時重複存，讓檔案編號對應時間）。
 */
import { sequenceName, type ZipEntry, zipFiles } from '../files';
import { assertFrameSize, type EncodedFile, type FrameEncoder, type RgbaPixels } from './frames';
import { type DeflateMode, encodePng } from './png';

export interface PngSequenceOptions {
  width: number;
  height: number;
  fps: number;
  /** 檔名主體（ZIP 內為 <baseName>_0001.png…） */
  baseName?: string;
  /** 額外放進 ZIP 的說明文字檔內容；null 表示不放 */
  info?: string | null;
  /** 固定 ZIP 內的檔案時間（讓輸出可重現） */
  mtime?: Date;
  deflate?: DeflateMode;
}

export class PngSequenceEncoder implements FrameEncoder {
  private readonly opt: PngSequenceOptions;
  private readonly pngs: Uint8Array[] = [];
  private aborted = false;

  constructor(options: PngSequenceOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    this.opt = options;
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    assertFrameSize(rgba, this.opt.width, this.opt.height);
    const png = await encodePng(rgba, this.opt.width, this.opt.height, null, this.opt.deflate);
    for (let i = 0; i < Math.max(1, Math.round(ticks)); i++) this.pngs.push(png);
  }

  abort(): void {
    this.aborted = true;
    this.pngs.length = 0;
  }

  async finish(): Promise<EncodedFile> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (!this.pngs.length) throw new Error('沒有任何影格');
    const { width, height, fps, baseName = 'frame', info, mtime } = this.opt;
    const n = this.pngs.length;
    const entries: ZipEntry[] = this.pngs.map((data, i) => ({
      name: sequenceName(baseName, i, n, 'png'),
      data,
    }));
    const text =
      info === undefined
        ? [
            '連番 PNG',
            `FPS：${fps}`,
            `張數：${n}`,
            `尺寸：${width}×${height}`,
            `長度：${(n / fps).toFixed(2)} 秒`,
            `檔名：${entries[0].name} ～ ${entries[n - 1].name}`,
          ].join('\r\n')
        : info;
    if (text) entries.push({ name: `${baseName}_資訊.txt`, data: `${text}\r\n` });
    const bytes = zipFiles(entries, { level: 0, mtime });
    return {
      bytes,
      mime: 'application/zip',
      ext: 'zip',
      width,
      height,
      frames: n,
      storedFrames: n,
      duration: n / fps,
    };
  }
}
