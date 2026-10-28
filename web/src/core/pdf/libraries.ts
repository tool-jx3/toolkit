/**
 * PDF 引擎用到的程式庫（Worker 回報給畫面、錯誤資訊用）。import 各 notices 資料夾，讓建置時把它們的授權列進
 * THIRD_PARTY_NOTICES（WebAssembly 裡靜態連結、npm 套件沒有附授權的部分）。
 */
import { LIBJPEG_TURBO_LIB } from './notices/libjpeg-turbo';
import { MOZJPEG_LIB } from './notices/mozjpeg';
import { PDFJS_CMAPS_LIB } from './notices/pdfjs-cmaps';
import { PDFJS_FONTS_LIB } from './notices/pdfjs-fonts';
import { PDFJS_WASM_LIB } from './notices/pdfjs-wasm';
import { QPDF_LIB } from './notices/qpdf';
import { ZLIB_LIB } from './notices/zlib';

export const ENGINE_LIBRARIES: readonly string[] = [
  QPDF_LIB,
  ZLIB_LIB,
  LIBJPEG_TURBO_LIB,
  MOZJPEG_LIB,
  PDFJS_CMAPS_LIB,
  PDFJS_FONTS_LIB,
  PDFJS_WASM_LIB,
];
