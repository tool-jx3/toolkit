/**
 * JPEG：讀檔頭（純函式）與 mozjpeg 編解碼（@jsquash/jpeg，Apache-2.0；mozjpeg 本身是 BSD／IJG／zlib 授權）。
 *
 * 編解碼器第一次用到時才 `import()`（無損的等級不會下載）。wasm 怎麼取得由呼叫端給（Worker：本站打包的網址；
 * Node：讀檔），一律先編譯成 `WebAssembly.Module` 再交給 jSquash（`init(module)`），兩個環境走同一條路。
 */

/** JPEG 檔頭的資訊 */
export interface JpegHeader {
  width: number;
  height: number;
  /** 色彩成分數：1 灰階、3 RGB／YCbCr、4 CMYK／YCCK */
  components: number;
  /** Adobe APP14 的 transform（0：不轉換、1：YCbCr、2：YCCK）；沒有 APP14 時 null */
  adobeTransform: number | null;
  progressive: boolean;
}

/** 讀 JPEG 的 SOF 與 APP14（壞掉或不是 JPEG 時 null） */
export function readJpegHeader(bytes: Uint8Array): JpegHeader | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  let adobe: number | null = null;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    /* 沒有長度的標記 */
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return null;
    if (
      marker === 0xee &&
      len >= 14 &&
      bytes[i + 4] === 0x41 &&
      bytes[i + 5] === 0x64 &&
      bytes[i + 6] === 0x6f &&
      bytes[i + 7] === 0x62 &&
      bytes[i + 8] === 0x65
    ) {
      adobe = bytes[i + 15];
    }
    /* SOF0～SOF15（C4 DHT、C8 JPG、CC DAC 不是） */
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (len < 8) return null;
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components: bytes[i + 9],
        adobeTransform: adobe,
        progressive: marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce,
      };
    }
    i += 2 + len;
  }
  return null;
}

/** 解碼後的影像（RGBA，灰階的 R＝G＝B） */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface JpegCodec {
  decode(jpeg: Uint8Array): Promise<RgbaImage>;
  /** gray：存成單一成分的灰階 JPEG（PDF 的 DeviceGray） */
  encode(image: RgbaImage, options: { quality: number; gray: boolean }): Promise<Uint8Array>;
}

/** jSquash 的 init 實際上接受編譯好的模組（型別宣告只寫了選項） */
type InitWithModule = (module: WebAssembly.Module) => Promise<void>;

/** jSquash 的 MozJpegColorSpace */
const COLOR_GRAY = 1;
const COLOR_YCBCR = 3;

/** 給一個不和別人共用的 ArrayBuffer（jSquash 會讀整個 buffer） */
function ownArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}

/**
 * mozjpeg 編解碼器。`loadWasm('enc' | 'dec')` 回傳編譯好的模組。
 * 編碼：漸進式、最佳化霍夫曼表、4:2:0（jSquash 的預設），灰階時單一成分。
 */
export function createJpegCodec(
  loadWasm: (which: 'enc' | 'dec') => Promise<WebAssembly.Module>,
): JpegCodec {
  let enc: Promise<typeof import('@jsquash/jpeg/encode').default> | null = null;
  let dec: Promise<typeof import('@jsquash/jpeg/decode').default> | null = null;
  const encoder = () => {
    enc ??= (async () => {
      const [m, wasm] = await Promise.all([import('@jsquash/jpeg/encode'), loadWasm('enc')]);
      await (m.init as unknown as InitWithModule)(wasm);
      return m.default;
    })();
    return enc;
  };
  const decoder = () => {
    dec ??= (async () => {
      const [m, wasm] = await Promise.all([import('@jsquash/jpeg/decode'), loadWasm('dec')]);
      await (m.init as unknown as InitWithModule)(wasm);
      return m.default;
    })();
    return dec;
  };
  return {
    async decode(jpeg) {
      const fn = await decoder();
      const img = await fn(ownArrayBuffer(jpeg));
      return { data: img.data, width: img.width, height: img.height };
    },
    async encode(image, { quality, gray }) {
      const fn = await encoder();
      const data = new ImageDataLike(image.data, image.width, image.height);
      const options = {
        quality: Math.min(100, Math.max(1, Math.round(quality))),
        color_space: gray ? COLOR_GRAY : COLOR_YCBCR,
      } as unknown as Parameters<typeof fn>[1];
      const out = await fn(data as unknown as ImageData, options);
      return new Uint8Array(out);
    },
  };
}

/** jSquash 只讀 data／width／height；Node 沒有 ImageData，所以自己包一個 */
class ImageDataLike {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}
