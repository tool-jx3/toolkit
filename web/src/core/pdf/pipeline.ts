/**
 * PDF 壓縮的流程（QC 的「多個候選、取最小」；執行環境無關，qpdf、JPEG 編解碼、pdf.js 由呼叫端給）。
 *
 * 候選：
 * 1. 結構（structural）：qpdf 的物件串流、zlib 9、重新壓 Flate。
 * 2. 快速網頁檢視（linearize）：有時候比較小。
 * 3. 移除重複（dedupe）：pdf-lib 合併相同的影像、字型、內嵌檔案、中繼資料、ICC → 再做 1。
 * 4. 影像（images，高畫質、平衡、最小）：3 之後再重新壓縮影像 → 再做 1。3 沒有合併到東西時就是 QC 的「只做影像」
 *    （QC 另外有「只做影像」與「去重＋影像」兩個候選；本站的這一個在沒有重複時等於前者、有重複時等於後者）。
 * 5. 整頁轉圖（raster，只有整頁轉圖的等級）：每頁畫成一張 JPEG（`raster.ts`）；降 DPI 的目標是原檔（WP）。
 *    整頁轉圖的等級也做 1～3：轉成圖片反而比較大時，用只整理結構的結果（文字仍可以選）。
 *
 * 1、2 之後的步驟（pdf-lib 讀檔、找影像在頁面上的大小、重新壓縮）失敗時（qpdf 修得好、pdf-lib 讀不懂的檔案），
 * 不讓整個檔案失敗：退回 1、2 的結果，記下原因（`imagesError`）。
 *
 * 每個候選都要通過檢查（檔頭 %PDF-、結尾 %%EOF、`qpdf --check`、頁數和原檔相同）；取最小、而且比原檔小的。
 * 檢查由小到大做、選到就停（`qpdf --check` 會解開所有 JPEG，影像多的檔案一次要好幾秒；結果和全部都檢查相同）。
 * 打開「壓縮後比對」時，選中的候選還要用 pdf.js 比對文字、連結、書籤、表單（`verify.ts`），不一樣就換下一個。
 * 都沒有比原檔小時回傳原檔（不把變大的結果當成成功）。
 *
 * 加密：要使用者密碼的檔案，給了密碼就解密後輸出（輸出不加密）；只有擁有者密碼（權限設定）的檔案保留加密與權限，
 * 只做 1、2（qpdf 保留原本的加密），不動影像。
 */
import { PDFDocument } from 'pdf-lib';
import { type DedupeStats, dedupeStreams } from './dedupe';
import { PdfError } from './errors';
import { nonEmbeddedCjkFonts } from './fonts';
import type { JpegCodec } from './jpeg';
import type { ResolvedSettings } from './levels';
import { findPdfHeader, looksEncrypted, pdfVersion, precheck, RASTER_MAX_PAGES } from './limits';
import type { DocSignature } from './pdfjs';
import type { QpdfRun, QpdfRunner } from './qpdf';
import {
  CHECK_ARGS,
  cleanDiagnostic,
  firstDiagnostic,
  INSPECT_ARGS,
  linearizeArgs,
  NPAGES_ARGS,
  normalizeArgs,
  parseInspectJson,
  structuralArgs,
} from './qpdfArgs';
import type { RasterOutcome } from './raster';
import { hasSignature, type ImagePassStats, recompressImages } from './recompress';
import { compareSignatures, type VerifyResult } from './verify';

export interface InspectResult {
  encrypted: boolean;
  /** 要密碼才能打開（還沒給或給錯） */
  needsPassword: boolean;
  /** 只有擁有者密碼（權限設定） */
  restricted: boolean;
  pages: number | null;
  version: string | null;
}

const isPasswordError = (r: QpdfRun) => /invalid password/i.test(`${r.stderr}\n${r.stdout}`);

/** 檢視：加密、頁數（qpdf --json） */
export async function inspectPdf(
  bytes: Uint8Array,
  qpdf: QpdfRunner,
  password?: string | null,
  fileName = 'PDF',
): Promise<InspectResult> {
  precheck(bytes);
  const r = await qpdf(bytes, INSPECT_ARGS, { password });
  const askPassword: InspectResult = {
    encrypted: true,
    needsPassword: true,
    restricted: false,
    pages: null,
    version: pdfVersion(bytes),
  };
  if (r.code !== 0 && r.code !== 3) {
    if (isPasswordError(r)) {
      if (password) throw new PdfError('wrong-password');
      return askPassword;
    }
    /* QC 的後備：qpdf 失敗、但 trailer 寫著加密時，先問密碼（給了密碼還是失敗才算壞檔） */
    if (!password && looksEncrypted(bytes)) return askPassword;
    throw new PdfError('broken', cleanDiagnostic(r.stderr || r.stdout, fileName));
  }
  const info = parseInspectJson(r.stdout);
  if (!info) {
    if (!password && looksEncrypted(bytes)) return askPassword;
    throw new PdfError('broken', firstDiagnostic(r.stderr) ?? '');
  }
  /* 給了密碼而且對：是使用者密碼的檔案（或擁有者本人），解密輸出；沒給密碼就打得開的加密檔才是「只有權限設定」 */
  return {
    ...info,
    needsPassword: info.needsPassword && !password,
    restricted: info.restricted && !password,
    version: pdfVersion(bytes),
  };
}

/* ---------- 候選 ---------- */

export type Strategy = 'original' | 'structural' | 'linearize' | 'dedupe' | 'images' | 'raster';

export interface CandidateSummary {
  name: Strategy;
  /** 大小（沒有產生時 0） */
  bytes: number;
  /** 通過檢查（null：沒有檢查：比它小的候選已經選中、或不比原檔小） */
  valid: boolean | null;
  lossy: boolean;
  /** 沒有用的原因 */
  rejected?: string;
  ms: number;
}

export type Stage =
  | 'inspect'
  | 'structure'
  | 'linearize'
  | 'normalize'
  | 'dedupe'
  | 'images'
  | 'save'
  | 'raster'
  | 'check'
  | 'verify';

export interface Progress {
  stage: Stage;
  done?: number;
  total?: number;
}

export interface EngineDeps {
  qpdf: QpdfRunner;
  /** JPEG 編解碼器（第一次用到才載入） */
  codec?: () => Promise<JpegCodec>;
  /** pdf.js 的摘要（壓縮後比對用；不給就不比對） */
  signature?: (
    bytes: Uint8Array,
    options: { password?: string | null; text: boolean; signal?: { readonly aborted: boolean } },
  ) => Promise<DocSignature>;
  /** 整頁轉圖（不給就不能用整頁轉圖） */
  rasterize?: (
    bytes: Uint8Array,
    options: {
      settings: ResolvedSettings;
      password?: string | null;
      /** 要比這個小（原檔的大小；WP 的做法） */
      target: number;
      onProgress?: (done: number, total: number) => void;
      signal?: { readonly aborted: boolean };
    },
  ) => Promise<RasterOutcome>;
}

export interface CompressHooks {
  onProgress?: (p: Progress) => void;
  signal?: { readonly aborted: boolean };
}

export interface CompressRequest {
  bytes: Uint8Array;
  settings: ResolvedSettings;
  password?: string | null;
  /** 訊息裡顯示的檔名 */
  fileName?: string;
}

export interface CompressReport {
  /** 結果（沒有變小時是原檔的位元組） */
  bytes: Uint8Array;
  originalBytes: number;
  outputBytes: number;
  /** 用了哪個候選 */
  strategy: Strategy;
  /** 結果有沒有失真（影像重新壓縮過或整頁轉圖） */
  lossy: boolean;
  /** 沒有比原檔小，回傳原檔 */
  kept: boolean;
  pages: number;
  images: ImagePassStats | null;
  dedupe: DedupeStats | null;
  /** 整頁轉圖（有試轉成圖時；gaveUp：估計最低 DPI 也比只整理結構大，提早停） */
  raster: { dpi: number; reduced: boolean; grayPages: number; gaveUp: boolean } | null;
  /** 會失真的等級：影像沒有處理的原因（pdf-lib 讀不懂這個檔案等；null＝照常處理） */
  imagesError: string | null;
  /** 選中的結果的比對（沒有比對時 null） */
  verify: VerifyResult | null;
  /** 比對沒有跑的原因（例如 pdf.js 打不開原檔） */
  verifySkipped: string | null;
  /** 因為比對不一樣而沒用的候選數 */
  rejectedByVerify: number;
  /** 只有擁有者密碼：保留加密，只做無損整理 */
  restricted: boolean;
  /** 有使用者密碼、已解密（輸出不加密） */
  decrypted: boolean;
  /** 有數位簽章（改寫之後會失效） */
  signed: boolean;
  /** 沒有內嵌的中日韓字型（整頁轉圖時有的話不轉；預覽會缺字） */
  missingFonts: string[];
  candidates: CandidateSummary[];
  durationMs: number;
}

interface Candidate {
  name: Strategy;
  lossy: boolean;
  bytes: Uint8Array | null;
  valid: boolean | null;
  rejected?: string;
  ms: number;
}

const SAVE_OPTIONS = {
  useObjectStreams: false,
  addDefaultPage: false,
  updateFieldAppearances: false,
  objectsPerTick: Number.POSITIVE_INFINITY,
} as const;

/** 結尾有 %%EOF（最後 4 KB 裡） */
function hasEof(bytes: Uint8Array): boolean {
  const start = Math.max(0, bytes.length - 4096);
  for (let i = bytes.length - 5; i >= start; i--) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x25 &&
      bytes[i + 2] === 0x45 &&
      bytes[i + 3] === 0x4f &&
      bytes[i + 4] === 0x46
    ) {
      return true;
    }
  }
  return false;
}

/** 候選的檢查：檔頭、%%EOF、qpdf --check、頁數 */
export async function validateCandidate(
  bytes: Uint8Array,
  qpdf: QpdfRunner,
  pages: number | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (bytes.length < 32) return { ok: false, reason: 'too-small' };
  if (findPdfHeader(bytes) !== 0) return { ok: false, reason: 'header' };
  if (!hasEof(bytes)) return { ok: false, reason: 'eof' };
  const check = await qpdf(bytes, CHECK_ARGS);
  if (check.code !== 0 && check.code !== 3) return { ok: false, reason: `check-${check.code}` };
  if (pages !== null) {
    const n = await qpdf(bytes, NPAGES_ARGS);
    const count = Number.parseInt(n.stdout.trim(), 10);
    if (count !== pages) return { ok: false, reason: 'pages' };
  }
  return { ok: true };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const LOAD_OPTIONS = {
  updateMetadata: false,
  throwOnInvalidObject: false,
  ignoreEncryption: true,
  parseSpeed: Number.POSITIVE_INFINITY,
} as const;

/** 不能當成「這個候選失敗」的錯誤：取消、記憶體不足、頁數超過上限 */
function isFatal(e: unknown): boolean {
  return (
    e instanceof PdfError &&
    (e.kind === 'aborted' || e.kind === 'memory' || e.kind === 'too-many-pages')
  );
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 只比頁數（整頁轉圖的結果沒有文字） */
const pagesOnly = (s: DocSignature): DocSignature => ({
  pages: s.pages,
  text: [],
  annotations: [],
  outline: [],
  fields: [],
});

export async function compressPdf(
  req: CompressRequest,
  deps: EngineDeps,
  hooks: CompressHooks = {},
): Promise<CompressReport> {
  const t0 = now();
  const { bytes: input, settings } = req;
  const password = req.password || null;
  const fileName = req.fileName ?? 'PDF';
  const { onProgress, signal } = hooks;
  const qpdf = deps.qpdf;
  const aborted = () => {
    if (signal?.aborted) throw new PdfError('aborted');
  };

  onProgress?.({ stage: 'inspect' });
  const info = await inspectPdf(input, qpdf, password, fileName);
  if (info.needsPassword) throw new PdfError('password');
  const decrypt = info.encrypted && !info.restricted && !!password;
  const restricted = info.restricted;
  const runOpts = { password, decrypt };
  /* 只有擁有者密碼的檔案不轉成圖（轉成圖會拿掉權限設定）：改做無損整理 */
  const wantRaster = !!settings.raster && !restricted;
  if (wantRaster && (info.pages ?? 0) > RASTER_MAX_PAGES) {
    throw new PdfError('too-many-pages', String(info.pages));
  }
  if (wantRaster && !deps.rasterize) throw new PdfError('internal', 'rasterizer unavailable');

  const candidates: Candidate[] = [];
  let images: ImagePassStats | null = null;
  let imagesError: string | null = null;
  let dedupe: DedupeStats | null = null;
  let raster: CompressReport['raster'] = null;
  let signed = false;
  let missingFonts: string[] = [];

  const attempt = async (
    name: Strategy,
    lossy: boolean,
    make: () => Promise<Uint8Array | null>,
  ): Promise<void> => {
    aborted();
    const start = now();
    let out: Uint8Array | null = null;
    let reason: string | undefined;
    try {
      out = await make();
    } catch (e) {
      if (isFatal(e)) throw e;
      reason = messageOf(e);
    }
    if (!out) {
      candidates.push({
        name,
        lossy,
        bytes: null,
        valid: false,
        rejected: reason ?? 'no-output',
        ms: now() - start,
      });
      return;
    }
    /* 檢查（qpdf --check 會解開所有 JPEG，很花時間）等到選的時候才做：由小到大，只檢查會被選中的 */
    candidates.push({ name, lossy, bytes: out, valid: null, ms: now() - start });
  };

  const structural = async (bytes: Uint8Array, opts = runOpts) => {
    const r = await qpdf(bytes, structuralArgs(), opts);
    if (!r.out) throw new Error(firstDiagnostic(r.stderr) ?? `qpdf-${r.code}`);
    return r.out;
  };

  onProgress?.({ stage: 'structure' });
  await attempt('structural', false, () => structural(input));
  onProgress?.({ stage: 'linearize' });
  await attempt('linearize', false, async () => (await qpdf(input, linearizeArgs(), runOpts)).out);

  if (!restricted) {
    /* pdf-lib 讀攤平的檔案：數位簽章、缺字、重複、影像（失敗時退回上面的結果） */
    let doc: PDFDocument | null = null;
    let readError: string | null = null;
    try {
      aborted();
      onProgress?.({ stage: 'normalize' });
      const flat = await qpdf(input, normalizeArgs(), runOpts);
      if (!flat.out) throw new Error(firstDiagnostic(flat.stderr) ?? `qpdf-${flat.code}`);
      doc = await PDFDocument.load(flat.out, LOAD_OPTIONS);
      signed = hasSignature(doc);
      missingFonts = nonEmbeddedCjkFonts(doc);
      onProgress?.({ stage: 'dedupe' });
      dedupe = dedupeStreams(doc);
    } catch (e) {
      if (isFatal(e)) throw e;
      readError = messageOf(e);
      doc = null;
      dedupe = null;
    }
    if (doc && dedupe?.merged) {
      const merged = doc;
      await attempt('dedupe', false, async () => {
        onProgress?.({ stage: 'save' });
        const saved = await merged.save(SAVE_OPTIONS);
        onProgress?.({ stage: 'structure' });
        return structural(saved, { password: null, decrypt: false });
      });
    }
    if (settings.lossy && !settings.raster && settings.images.length && deps.codec) {
      if (!doc) {
        imagesError = readError ?? 'unreadable';
      } else {
        const target = doc;
        try {
          aborted();
          const codec = await deps.codec();
          onProgress?.({ stage: 'images', done: 0, total: 0 });
          images = await recompressImages(target, codec, {
            attempts: settings.images,
            convertFlate: settings.convertFlate,
            signal,
            onProgress: (done, total) => onProgress?.({ stage: 'images', done, total }),
          });
        } catch (e) {
          if (isFatal(e)) throw e;
          imagesError = messageOf(e);
          images = null;
        }
        aborted();
        if (images?.replaced) {
          await attempt('images', true, async () => {
            onProgress?.({ stage: 'save' });
            const saved = await target.save(SAVE_OPTIONS);
            onProgress?.({ stage: 'structure' });
            return structural(saved, { password: null, decrypt: false });
          });
        }
      }
    }
    doc = null;
  }

  /*
   * 整頁轉圖（WP 的 maximum）：沒有內嵌的中日韓字型畫不出來，不轉。降 DPI 的目標只看原檔（WP；不為了比只整理結構小
   * 而犧牲解析度），轉完再和上面的候選一起取最小：只整理結構比較小時就用它。
   */
  if (wantRaster && !missingFonts.length) {
    const target = input.length;
    await attempt('raster', true, async () => {
      onProgress?.({ stage: 'raster', done: 0, total: info.pages ?? 0 });
      const r = await deps.rasterize!(input, {
        settings,
        password,
        target,
        signal,
        onProgress: (done, total) => onProgress?.({ stage: 'raster', done, total }),
      });
      raster = { dpi: r.dpi, reduced: r.reduced, grayPages: r.grayPages, gaveUp: r.gaveUp };
      if (!r.bytes) throw new Error('raster-gave-up');
      onProgress?.({ stage: 'structure' });
      return structural(r.bytes, { password: null, decrypt: false });
    });
  }

  /* 取最小的；比對不一樣就換下一個 */
  aborted();
  const eligible = candidates
    .filter((c) => c.bytes && c.bytes.length < input.length && (!c.lossy || settings.lossy))
    .sort((a, b) => a.bytes!.length - b.bytes!.length);
  let chosen: Candidate | null = null;
  let verify: VerifyResult | null = null;
  let verifySkipped: string | null = null;
  let rejectedByVerify = 0;
  /* 原檔的摘要：整頁轉圖的候選只比頁數，其他的連文字一起比 */
  let beforeFull: DocSignature | null = null;
  let beforePages: DocSignature | null = null;
  const before = async (text: boolean): Promise<DocSignature> => {
    if (text) {
      beforeFull ??= await deps.signature!(input, { password, text: true, signal });
      return beforeFull;
    }
    if (beforeFull) return pagesOnly(beforeFull);
    beforePages ??= await deps.signature!(input, { password, text: false, signal });
    return beforePages;
  };
  for (const c of eligible) {
    aborted();
    onProgress?.({ stage: 'check' });
    const v = await validateCandidate(c.bytes!, qpdf, info.pages);
    c.valid = v.ok;
    if (!v.ok) {
      c.rejected = v.reason;
      continue;
    }
    if (settings.verify && deps.signature && verifySkipped === null) {
      onProgress?.({ stage: 'verify' });
      const text = c.name !== 'raster';
      let ref: DocSignature | null = null;
      try {
        ref = await before(text);
      } catch (e) {
        if (e instanceof PdfError && e.kind === 'aborted') throw e;
        verifySkipped = messageOf(e);
      }
      if (ref) {
        let after: DocSignature | null = null;
        try {
          /* 輸出已經解密；只有擁有者密碼的檔案不用密碼就能打開 */
          after = await deps.signature(c.bytes!, { password: null, text, signal });
        } catch (e) {
          if (e instanceof PdfError && e.kind === 'aborted') throw e;
        }
        const res: VerifyResult = after
          ? compareSignatures(ref, after)
          : { ok: false, mismatches: ['pages'], page: null };
        if (!res.ok) {
          c.rejected = `verify:${res.mismatches.join(',')}`;
          rejectedByVerify++;
          continue;
        }
        verify = res;
      }
    }
    chosen = c;
    break;
  }

  const summary = candidates.map((c) => ({
    name: c.name,
    bytes: c.bytes?.length ?? 0,
    valid: c.valid,
    lossy: c.lossy,
    rejected: c.rejected,
    ms: Math.round(c.ms),
  }));
  const base = {
    originalBytes: input.length,
    pages: info.pages ?? 0,
    images,
    imagesError,
    dedupe,
    raster,
    verifySkipped,
    rejectedByVerify,
    restricted,
    decrypted: decrypt,
    signed,
    missingFonts,
    candidates: summary,
  };
  if (!chosen?.bytes) {
    return {
      ...base,
      bytes: input,
      outputBytes: input.length,
      strategy: 'original',
      lossy: false,
      kept: true,
      verify: null,
      durationMs: Math.round(now() - t0),
    };
  }
  return {
    ...base,
    bytes: chosen.bytes,
    outputBytes: chosen.bytes.length,
    strategy: chosen.name,
    lossy: chosen.lossy,
    kept: false,
    verify,
    durationMs: Math.round(now() - t0),
  };
}
