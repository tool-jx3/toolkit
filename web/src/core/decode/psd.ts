/**
 * PSD 讀取（psd-studio 規格 2.2；之後 G9 的 anime-rig 也會用）。
 *
 * 以 ag-psd（npm，MIT）讀圖層像素（不讀合成圖、縮圖），把圖層樹攤平成清單。ag-psd 在第一次呼叫時才以 `import()` 載入，
 * 只有用到 PSD 的工具才會下載這個套件。
 *
 * ```ts
 * const psd = await readPsdLayers(file);
 * for (const layer of psd.layers.filter((l) => l.visible)) {
 *   // layer.rgba：圖層自己的範圍（left、top 起 width × height）的 RGBA，未預乘透明度
 * }
 * ```
 *
 * - ag-psd 的圖層陣列是**由下到上**（第 0 個是最底層）；`layers` 也是由下到上，要「由上到下」顯示時自己反轉。
 * - 群組不出現在清單裡，改記在每個圖層的 `groups`（由外到內）；`visible`＝自己與所有上層群組都沒有隱藏。
 * - 沒有像素的圖層（調整圖層、空白圖層、範圍為 0）不列入。
 * - 不透明度、混合模式、剪裁遮色片、圖層遮色片都照讀出來的值提供，像素本身是原始圖層像素（沒有套用這些屬性）。
 * - 16／32 位元的文件換算成 8 位元。
 */

/** 上層群組的資訊 */
export interface PsdGroupInfo {
  name: string;
  hidden: boolean;
  /** 0～1 */
  opacity: number;
  /** 群組多為 'pass through' */
  blendMode: string;
}

/** 圖層遮色片 */
export interface PsdLayerMask {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 範圍外的值（0 或 255） */
  defaultColor: number;
  disabled: boolean;
  /** 遮色片的值（0＝完全遮住、255＝完全顯示），width × height 個 */
  values: Uint8Array;
}

/** 攤平後的一個圖層 */
export interface PsdLayerInfo {
  /** 在清單中的位置（0＝最底層） */
  index: number;
  /** 圖層名（原樣，可能是空字串；檔名要自己清理、處理重名） */
  name: string;
  /** 上層群組的名稱，由外到內 */
  path: string[];
  groups: PsdGroupInfo[];
  /** 自己的「隱藏」 */
  hidden: boolean;
  /** 自己與所有上層群組都沒有隱藏 */
  visible: boolean;
  /** 文件座標（可以超出文件、可以是負的） */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 0～1 */
  opacity: number;
  /** 'normal'、'multiply'… */
  blendMode: string;
  /** 剪裁遮色片（剪裁到下面那一層） */
  clipping: boolean;
  mask: PsdLayerMask | null;
  /** 圖層像素 RGBA（width × height × 4，未預乘） */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export interface PsdDocument {
  width: number;
  height: number;
  /** 由下到上 */
  layers: PsdLayerInfo[];
}

/* ag-psd 讀出來的形狀（只列用得到的欄位） */
interface AgPixelData {
  data: Uint8ClampedArray | Uint8Array | Uint16Array | Float32Array;
  width: number;
  height: number;
}
interface AgMask {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  defaultColor?: number;
  disabled?: boolean;
  imageData?: AgPixelData;
}
export interface AgPsdLayer {
  name?: string;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  hidden?: boolean;
  opacity?: number;
  blendMode?: string;
  clipping?: boolean;
  imageData?: AgPixelData;
  mask?: AgMask;
  children?: AgPsdLayer[];
}
export interface AgPsd {
  width: number;
  height: number;
  children?: AgPsdLayer[];
}

/** 任何位元深度 → 8 位元（8 位元且獨占緩衝區時直接沿用，不複製） */
function to8bit(data: AgPixelData['data']): Uint8ClampedArray<ArrayBuffer> {
  if (data instanceof Uint8ClampedArray) {
    const own =
      data.buffer instanceof ArrayBuffer &&
      data.byteOffset === 0 &&
      data.byteLength === data.buffer.byteLength;
    return own ? (data as Uint8ClampedArray<ArrayBuffer>) : new Uint8ClampedArray(data);
  }
  const out = new Uint8ClampedArray(data.length);
  if (data instanceof Uint16Array) for (let i = 0; i < data.length; i++) out[i] = data[i] >> 8;
  else if (data instanceof Float32Array) {
    for (let i = 0; i < data.length; i++) out[i] = Math.round(data[i] * 255);
  } else out.set(data);
  return out;
}

/** 像素 → 8 位元 RGBA（ag-psd 一般給 RGBA；保險起見也接受 1～3 個通道） */
function toRgba(img: AgPixelData): Uint8ClampedArray<ArrayBuffer> {
  const src = to8bit(img.data);
  const n = img.width * img.height;
  const ch = Math.round(src.length / n);
  if (ch === 4) return src;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (ch >= 3) {
      out[o] = src[i * ch];
      out[o + 1] = src[i * ch + 1];
      out[o + 2] = src[i * ch + 2];
      out[o + 3] = 255;
    } else {
      out[o] = out[o + 1] = out[o + 2] = src[i * ch];
      out[o + 3] = ch === 2 ? src[i * ch + 1] : 255;
    }
  }
  return out;
}

function readMask(mask: AgMask | undefined): PsdLayerMask | null {
  const img = mask?.imageData;
  if (!mask || !img?.width || !img.height) return null;
  const src = to8bit(img.data);
  const n = img.width * img.height;
  const ch = Math.max(1, Math.round(src.length / n));
  const values = new Uint8Array(n);
  /* ag-psd 把灰階遮色片放在 RGB（A＝255）；取第一個通道 */
  for (let i = 0; i < n; i++) values[i] = src[i * ch];
  return {
    left: mask.left ?? 0,
    top: mask.top ?? 0,
    width: img.width,
    height: img.height,
    defaultColor: mask.defaultColor ?? 0,
    disabled: !!mask.disabled,
    values,
  };
}

export interface FlattenPsdOptions {
  /** 連隱藏的圖層也列出（visible＝false）。預設 true；false 時隱藏的圖層與隱藏群組裡的全部略過 */
  includeHidden?: boolean;
}

/** 把 ag-psd 讀出的圖層樹攤平（純函式；readPsdLayers 內部也用它） */
export function flattenPsdLayers(
  psd: AgPsd,
  { includeHidden = true }: FlattenPsdOptions = {},
): PsdDocument {
  const layers: PsdLayerInfo[] = [];
  const walk = (list: AgPsdLayer[] | undefined, groups: PsdGroupInfo[]) => {
    for (const layer of list ?? []) {
      const hidden = !!layer.hidden;
      const visible = !hidden && groups.every((g) => !g.hidden);
      if (!visible && !includeHidden) continue;
      if (Array.isArray(layer.children)) {
        walk(layer.children, [
          ...groups,
          {
            name: layer.name ?? '',
            hidden,
            opacity: layer.opacity ?? 1,
            blendMode: layer.blendMode ?? 'pass through',
          },
        ]);
        continue;
      }
      const img = layer.imageData;
      if (!img?.width || !img.height) continue;
      layers.push({
        index: layers.length,
        name: layer.name ?? '',
        path: groups.map((g) => g.name),
        groups,
        hidden,
        visible,
        left: layer.left ?? 0,
        top: layer.top ?? 0,
        width: img.width,
        height: img.height,
        opacity: layer.opacity ?? 1,
        blendMode: layer.blendMode ?? 'normal',
        clipping: !!layer.clipping,
        mask: readMask(layer.mask),
        rgba: toRgba(img),
      });
    }
  };
  walk(psd.children, []);
  return { width: psd.width, height: psd.height, layers };
}

export type AgPsdModule = typeof import('ag-psd');
let agPsd: Promise<AgPsdModule> | null = null;

/**
 * 第一次用時才載入 ag-psd，並設定成「像素放在一般陣列」（不需要 canvas，Worker 也能用）。
 * 要直接用 ag-psd 的 `readPsd`／`writePsd`（例如 anime-rig 在 Worker 裡讀圖層樹、存回輕量 PSD）時用這個取得模組
 * （anime-rig 移植時匯出；readPsdLayers 的行為不變）。
 */
export function loadAgPsd(): Promise<AgPsdModule> {
  agPsd ??= import('ag-psd').then((mod) => {
    const m = ((mod as { default?: AgPsdModule }).default ?? mod) as AgPsdModule;
    m.initializeCanvas(
      (width: number, height: number) => {
        if (typeof OffscreenCanvas !== 'undefined') {
          return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
        }
        if (typeof document !== 'undefined') {
          const c = document.createElement('canvas');
          c.width = width;
          c.height = height;
          return c;
        }
        throw new Error('這個環境沒有 canvas');
      },
      (width: number, height: number) =>
        ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
    );
    return m;
  });
  return agPsd;
}

/**
 * 讀 PSD，回傳攤平的圖層清單（由下到上）。讀不了時丟 Error（訊息附原因，可直接顯示）。
 * 只讀圖層像素：不讀合成圖、縮圖與連結檔。
 */
export async function readPsdLayers(
  input: Blob | ArrayBuffer | Uint8Array,
  options: FlattenPsdOptions = {},
): Promise<PsdDocument> {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input instanceof ArrayBuffer ? input : await input.arrayBuffer());
  const { readPsd } = await loadAgPsd();
  let psd: AgPsd;
  try {
    psd = readPsd(bytes, {
      useImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
    }) as AgPsd;
  } catch (e) {
    throw new Error(`無法讀取 PSD：${e instanceof Error ? e.message : String(e)}`);
  }
  return flattenPsdLayers(psd, options);
}
