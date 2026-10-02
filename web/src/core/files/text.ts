/**
 * 純文字檔的解碼：先看 BOM（UTF-8、UTF-16 LE／BE），沒有 BOM 時先試 UTF-8（嚴格），
 * 不是合法的 UTF-8 再依序試備用編碼（預設 Big5：台灣常見的舊 TXT），都不合時以 UTF-8 解讀並把壞掉的位元組換成 �。
 * （scenario-cards 移植時新增）
 *
 * ```ts
 * const { text, encoding, lossy } = decodeText(await readAsBytes(file));
 * ```
 */

export interface DecodedText {
  /** 解碼後的文字（不含 BOM） */
  text: string;
  /** 實際使用的編碼（WHATWG 名稱：'utf-8'、'utf-16le'、'utf-16be'、'big5'…） */
  encoding: string;
  /** 檔案開頭有 BOM */
  bom: boolean;
  /** 有無法解讀的位元組（已換成 U+FFFD） */
  lossy: boolean;
}

export interface DecodeTextOptions {
  /** 不是合法的 UTF-8 時依序嘗試的編碼（預設 ['big5']；給 [] 就不試） */
  fallbacks?: readonly string[];
}

/** 嚴格解碼；編碼不支援或有無法解讀的位元組時回傳 null */
function strict(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function loose(bytes: Uint8Array, encoding: string, bom: boolean): DecodedText {
  const exact = strict(bytes, encoding);
  if (exact !== null) return { text: exact, encoding, bom, lossy: false };
  return { text: new TextDecoder(encoding).decode(bytes), encoding, bom, lossy: true };
}

export function decodeText(
  input: Uint8Array | ArrayBuffer,
  { fallbacks = ['big5'] }: DecodeTextOptions = {},
): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  /* BOM：TextDecoder 預設會去掉開頭的 BOM */
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return loose(bytes, 'utf-8', true);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return loose(bytes, 'utf-16le', true);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return loose(bytes, 'utf-16be', true);
  const utf8 = strict(bytes, 'utf-8');
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8', bom: false, lossy: false };
  for (const encoding of fallbacks) {
    const text = strict(bytes, encoding);
    if (text !== null) return { text, encoding, bom: false, lossy: false };
  }
  return {
    text: new TextDecoder('utf-8').decode(bytes),
    encoding: 'utf-8',
    bom: false,
    lossy: true,
  };
}
