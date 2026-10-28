/**
 * core/pdf：qpdf 12.2.0（@neslinesli93/qpdf-wasm 0.3.0）。QC 的原作用 qpdf 12.4.2：它用到的每個參數 12.2.0 都要接受；
 * 加密的檢視（要密碼、只有權限設定）、密碼錯誤、壞檔、暫存檔名換成使用者的檔名。
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { PdfError } from '@/core/pdf/errors';
import { inspectPdf } from '@/core/pdf/pipeline';
import {
  CHECK_ARGS,
  cleanDiagnostic,
  INSPECT_ARGS,
  linearizeArgs,
  NPAGES_ARGS,
  normalizeArgs,
  parseInspectJson,
  structuralArgs,
  withPassword,
  writesOutput,
} from '@/core/pdf/qpdfArgs';
import { encryptPdf, nodeQpdf } from '../helpers/pdfQpdf';

let plain: Uint8Array;

beforeAll(async () => {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++)
    doc.addPage([300, 300]).drawText(`page ${i + 1}`, { x: 20, y: 200, font });
  plain = await doc.save();
});

describe('qpdf 的參數', () => {
  it('結構壓縮＝QC 的 structural：物件串流、zlib 9、壓縮串流、generalized、重新壓 Flate', () => {
    expect(structuralArgs()).toEqual([
      '--no-warn',
      '--warning-exit-0',
      '--object-streams=generate',
      '--compression-level=9',
      '--stream-data=compress',
      '--decode-level=generalized',
      '--recompress-flate',
    ]);
    expect(linearizeArgs()).toEqual(['--no-warn', '--warning-exit-0', '--linearize']);
    expect(normalizeArgs()).toEqual([
      '--no-warn',
      '--warning-exit-0',
      '--object-streams=disable',
      '--stream-data=preserve',
    ]);
  });

  it('密碼以檔案傳入；要輸出時一併解密，--check 之類的不加 --decrypt', () => {
    expect(withPassword(structuralArgs(), '/pw_1', true).slice(-2)).toEqual([
      '--password-file=/pw_1',
      '--decrypt',
    ]);
    expect(withPassword(CHECK_ARGS, '/pw_1', true)).toEqual(['--check', '--password-file=/pw_1']);
    expect(writesOutput(INSPECT_ARGS)).toBe(false);
    expect(writesOutput(NPAGES_ARGS)).toBe(false);
  });

  it('qpdf 12.2.0 接受每一組參數（結束碼 0）', async () => {
    const qpdf = nodeQpdf();
    for (const args of [structuralArgs(), linearizeArgs(), normalizeArgs()]) {
      const r = await qpdf(plain, args);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.out?.length).toBeGreaterThan(100);
    }
    expect((await qpdf(plain, CHECK_ARGS)).code).toBe(0);
    expect((await qpdf(plain, NPAGES_ARGS)).stdout.trim()).toBe('2');
    const j = await qpdf(plain, INSPECT_ARGS);
    expect(parseInspectJson(j.stdout)).toEqual({
      encrypted: false,
      needsPassword: false,
      restricted: false,
      pages: 2,
    });
  });

  it('跑完不會改到 process.exitCode（qpdf 在 Node 會寫入結束碼）', async () => {
    const proc = (globalThis as unknown as { process: { exitCode?: number } }).process;
    const before = proc.exitCode;
    await nodeQpdf()(new TextEncoder().encode('not a pdf'), CHECK_ARGS);
    expect(proc.exitCode).toBe(before);
  });

  it('訊息裡的暫存檔名換成使用者的檔名、去掉程式名稱', () => {
    expect(
      cleanDiagnostic(
        "./this.program: /in_12.pdf: can't find startxref\nFor help:\n  qpdf --help=usage",
        '劇本.pdf',
      ),
    ).toBe("劇本.pdf: can't find startxref");
  });
});

describe('檢視（inspectPdf）', () => {
  it('要開啟密碼：沒給密碼時 needsPassword；給錯丟 wrong-password；給對讀得到頁數', async () => {
    const enc = await encryptPdf(plain, 'secret');
    const qpdf = nodeQpdf();
    const a = await inspectPdf(enc, qpdf);
    expect(a).toMatchObject({ encrypted: true, needsPassword: true, pages: null });
    await expect(inspectPdf(enc, qpdf, 'nope')).rejects.toMatchObject({ kind: 'wrong-password' });
    const b = await inspectPdf(enc, qpdf, 'secret');
    expect(b).toMatchObject({ encrypted: true, needsPassword: false, restricted: false, pages: 2 });
  });

  it('只有擁有者密碼（權限設定）：不用密碼就能開，標成 restricted', async () => {
    const enc = await encryptPdf(plain, '');
    const r = await inspectPdf(enc, nodeQpdf());
    expect(r).toMatchObject({ encrypted: true, needsPassword: false, restricted: true, pages: 2 });
  });

  it('不是 PDF、空檔、壞檔（截斷）', async () => {
    const qpdf = nodeQpdf();
    await expect(inspectPdf(new TextEncoder().encode('hello'), qpdf)).rejects.toMatchObject({
      kind: 'not-pdf',
    });
    await expect(inspectPdf(new Uint8Array(0), qpdf)).rejects.toMatchObject({ kind: 'empty' });
    const broken = plain.slice(0, Math.floor(plain.length / 2));
    const err = await inspectPdf(broken, qpdf, null, 'a.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(PdfError);
    expect(err.kind).toBe('broken');
    expect(err.detail).toContain('a.pdf');
    expect(err.detail).not.toMatch(/in_\d+\.pdf/);
  });

  it('PDF 檔頭前面有一點雜訊也認得', async () => {
    const junk = new Uint8Array(plain.length + 3);
    junk.set([0x0a, 0x0a, 0x20]);
    junk.set(plain, 3);
    const r = await inspectPdf(junk, nodeQpdf());
    expect(r.pages).toBe(2);
    expect(r.version).toBe('1.7');
  });
});
