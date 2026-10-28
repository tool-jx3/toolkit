/**
 * PDF 引擎用到的程式庫（Worker 回報給畫面「使用的程式庫」、錯誤資訊用）。import 各 notices 資料夾，讓建置時把它們的授權列進
 * THIRD_PARTY_NOTICES（WebAssembly 裡靜態連結、npm 套件沒有附授權的部分）；npm 套件（pdf-lib、jSquash、pdf.js、qpdf-wasm）
 * 的授權由建置時從 node_modules 收集。
 */
import { EMSCRIPTEN_LIB } from './notices/emscripten';
import { LIBCXX_LIB } from './notices/libcxx';
import { LIBCXXABI_LIB } from './notices/libcxxabi';
import { LIBJPEG_TURBO_LIB } from './notices/libjpeg-turbo';
import { MOZJPEG_LIB } from './notices/mozjpeg';
import { MUSL_LIB } from './notices/musl';
import { PDFJS_CMAPS_LIB } from './notices/pdfjs-cmaps';
import { PDFJS_FONTS_LIB } from './notices/pdfjs-fonts';
import { PDFJS_WASM_LIB } from './notices/pdfjs-wasm';
import { QPDF_LIB } from './notices/qpdf';
import { ZLIB_LIB } from './notices/zlib';

/** npm 套件（版本與 package.json 一致；單元測試檢查） */
export const NPM_LIBRARIES = {
  'pdf-lib': { version: '1.17.1', license: 'MIT' },
  '@jsquash/jpeg': { version: '1.6.0', license: 'Apache-2.0' },
} as const;

export const ENGINE_LIBRARIES: readonly string[] = [
  QPDF_LIB,
  ZLIB_LIB,
  LIBJPEG_TURBO_LIB,
  `pdf-lib ${NPM_LIBRARIES['pdf-lib'].version}（MIT）`,
  `jSquash（@jsquash/jpeg ${NPM_LIBRARIES['@jsquash/jpeg'].version}，Apache-2.0）`,
  MOZJPEG_LIB,
  PDFJS_CMAPS_LIB,
  PDFJS_FONTS_LIB,
  PDFJS_WASM_LIB,
  EMSCRIPTEN_LIB,
  LIBCXX_LIB,
  LIBCXXABI_LIB,
  MUSL_LIB,
];
