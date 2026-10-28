/**
 * PDF 壓縮的流程（QC 的「多個候選、取最小」；執行環境無關，qpdf、JPEG 編解碼、pdf.js 由呼叫端給）。
 *
 * 候選：
 * 1. 結構（structural）：qpdf 的物件串流、zlib 9、重新壓 Flate。
 * 2. 快速網頁檢視（linearize）：有時候比較小。
 * 3. 移除重複（dedupe）：pdf-lib 合併相同的影像、字型、內嵌檔案、中繼資料、ICC → 再做 1。
 * 4. 影像（images，只有會失真的等級）：3 之後再重新壓縮影像 → 再做 1。
 * 5. 整頁轉圖（raster，只有整頁轉圖的等級）：每頁畫成一張 JPEG（`raster.ts`）。
 *
 * 每個候選都要通過檢查（檔頭 %PDF-、結尾 %%EOF、`qpdf --check`、頁數和原檔相同）；取最小、而且比原檔小的。
 * 打開「壓縮後比對」時，選中的候選還要用 pdf.js 比對文字、連結、書籤、表單（`verify.ts`），不一樣就換下一個。
 * 都沒有比原檔小時回傳原檔（不把變大的結果當成成功）。
 *
 * 加密：要使用者密碼的檔案，給了密碼就解密後輸出（輸出不加密）；只有擁有者密碼（權限設定）的檔案保留加密與權限，
 * 只做 1、2（qpdf 保留原本的加密），不動影像。
 */
import { PDFDocument } from 'pdf-lib';
import { type DedupeStats, dedupeStreams } from './dedupe';
import { PdfError } from './errors';
import type { JpegCodec } from './jpeg';
import type { ResolvedSettings } from './levels';
import { findPdfHeader, pdfVersion, precheck } from './limits';
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
  if (r.code !== 0 && r.code !== 3) {
    if (isPasswordError(r)) {
      if (password) throw new PdfError('wrong-password');
      return {
        encrypted: true,
        needsPassword: true,
        restricted: false,
        pages: null,
        version: pdfVersion(bytes),
      };
    }
    throw new PdfError('broken', cleanDiagnostic(r.stderr || r.stdout, fileName));
  }
  const info = parseInspectJson(r.stdout);
  if (!info) throw new PdfError('broken', firstDiagnostic(r.stderr) ?? '');
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
  valid: boolean;
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
  raster: { dpi: number; reduced: boolean; grayPages: number } | null;
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
  candidates: CandidateSummary[];
  durationMs: number;
}

interface Candidate {
  name: Strategy;
  lossy: boolean;
  bytes: Uint8Array | null;
  valid: boolean;
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

  const candidates: Candidate[] = [];
  let images: ImagePassStats | null = null;
  let dedupe: DedupeStats | null = null;
  let raster: CompressReport['raster'] = null;
  let signed = false;

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
      if (e instanceof PdfError && (e.kind === 'aborted' || e.kind === 'memory')) throw e;
      reason = e instanceof Error ? e.message : String(e);
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
    onProgress?.({ stage: 'check' });
    const v = await validateCandidate(out, qpdf, info.pages);
    candidates.push({
      name,
      lossy,
      bytes: out,
      valid: v.ok,
      rejected: v.reason,
      ms: now() - start,
    });
  };

  const structural = async (bytes: Uint8Array, opts = runOpts) => {
    const r = await qpdf(bytes, structuralArgs(), opts);
    if (!r.out) throw new Error(firstDiagnostic(r.stderr) ?? `qpdf-${r.code}`);
    return r.out;
  };

  /* 只有擁有者密碼的檔案不轉成圖（轉成圖會拿掉權限設定）：改做無損整理 */
  if (settings.raster && !restricted) {
    /* 整頁轉圖（WP 的 maximum） */
    if (!deps.rasterize) throw new PdfError('internal', 'rasterizer unavailable');
    await attempt('raster', true, async () => {
      onProgress?.({ stage: 'raster', done: 0, total: info.pages ?? 0 });
      const r = await deps.rasterize!(input, {
        settings,
        password,
        signal,
        onProgress: (done, total) => onProgress?.({ stage: 'raster', done, total }),
      });
      raster = { dpi: r.dpi, reduced: r.reduced, grayPages: r.grayPages };
      onProgress?.({ stage: 'structure' });
      return structural(r.bytes, { password: null, decrypt: false });
    });
  } else {
    onProgress?.({ stage: 'structure' });
    await attempt('structural', false, () => structural(input));
    onProgress?.({ stage: 'linearize' });
    await attempt(
      'linearize',
      false,
      async () => (await qpdf(input, linearizeArgs(), runOpts)).out,
    );

    if (!restricted) {
      aborted();
      onProgress?.({ stage: 'normalize' });
      const flat = await qpdf(input, normalizeArgs(), runOpts);
      if (flat.out) {
        const doc = await PDFDocument.load(flat.out, {
          updateMetadata: false,
          throwOnInvalidObject: false,
          ignoreEncryption: true,
          parseSpeed: Number.POSITIVE_INFINITY,
        });
        signed = hasSignature(doc);
        onProgress?.({ stage: 'dedupe' });
        dedupe = dedupeStreams(doc);
        if (dedupe.merged) {
          await attempt('dedupe', false, async () => {
            onProgress?.({ stage: 'save' });
            const saved = await doc.save(SAVE_OPTIONS);
            onProgress?.({ stage: 'structure' });
            return structural(saved, { password: null, decrypt: false });
          });
        }
        if (settings.lossy && settings.images.length && deps.codec) {
          aborted();
          const codec = await deps.codec();
          onProgress?.({ stage: 'images', done: 0, total: 0 });
          images = await recompressImages(doc, codec, {
            attempts: settings.images,
            convertFlate: settings.convertFlate,
            signal,
            onProgress: (done, total) => onProgress?.({ stage: 'images', done, total }),
          });
          aborted();
          if (images.replaced) {
            await attempt('images', true, async () => {
              onProgress?.({ stage: 'save' });
              const saved = await doc.save(SAVE_OPTIONS);
              onProgress?.({ stage: 'structure' });
              return structural(saved, { password: null, decrypt: false });
            });
          }
        }
      }
    }
  }

  /* 取最小的；比對不一樣就換下一個 */
  aborted();
  const eligible = candidates
    .filter(
      (c) => c.valid && c.bytes && c.bytes.length < input.length && (!c.lossy || settings.lossy),
    )
    .sort((a, b) => a.bytes!.length - b.bytes!.length);
  let chosen: Candidate | null = null;
  let verify: VerifyResult | null = null;
  let verifySkipped: string | null = null;
  let rejectedByVerify = 0;
  let before: DocSignature | null = null;
  const textCheck = !(settings.raster && !restricted);
  for (const c of eligible) {
    if (settings.verify && deps.signature) {
      onProgress?.({ stage: 'verify' });
      try {
        before ??= await deps.signature(input, { password, text: textCheck, signal });
      } catch (e) {
        if (e instanceof PdfError && e.kind === 'aborted') throw e;
        verifySkipped = e instanceof Error ? e.message : String(e);
      }
      if (before) {
        let after: DocSignature | null = null;
        try {
          /* 輸出已經解密；只有擁有者密碼的檔案不用密碼就能打開 */
          after = await deps.signature(c.bytes!, { password: null, text: textCheck, signal });
        } catch (e) {
          if (e instanceof PdfError && e.kind === 'aborted') throw e;
        }
        const res: VerifyResult = after
          ? compareSignatures(before, after)
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
    dedupe,
    raster,
    verifySkipped,
    rejectedByVerify,
    restricted,
    decrypted: decrypt,
    signed,
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
