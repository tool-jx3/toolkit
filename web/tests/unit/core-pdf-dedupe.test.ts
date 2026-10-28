/**
 * core/pdf：移除重複的串流（QC 的 dedupe，改寫成 pdf-lib 的物件模型）。
 */
import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { dedupeStreams } from '@/core/pdf/dedupe';
import { flateXObject, placeXObject } from '../helpers/pdfFixtures';

const reload = async (d: PDFDocument) =>
  PDFDocument.load(await d.save({ useObjectStreams: false }));

function imageRefs(doc: PDFDocument) {
  return doc.getPages().map((p) => {
    const res = p.node.Resources();
    const xo = res?.lookup(PDFName.of('XObject'));
    const entries =
      xo && 'entries' in xo ? (xo as { entries(): [PDFName, unknown][] }).entries() : [];
    return entries.map(([, v]) => (v instanceof PDFRef ? v.tag : ''));
  });
}

describe('移除重複的串流', () => {
  it('同樣的影像（含同樣的軟遮罩）各存一份：先合併遮罩、下一輪再合併影像', async () => {
    const d = await PDFDocument.create({ updateMetadata: false });
    const samples = new Uint8Array(40 * 30 * 3).map((_, i) => i % 251);
    const alpha = new Uint8Array(40 * 30).fill(128);
    for (let i = 0; i < 2; i++) {
      const page = d.addPage([200, 200]);
      const mask = flateXObject(d, alpha, 40, 30, 1);
      const img = flateXObject(d, samples, 40, 30, 3, { SMask: mask });
      placeXObject(page, img, 0, 0, 100, 75);
    }
    const doc = await reload(d);
    const before = imageRefs(doc);
    expect(before[0][0]).not.toBe(before[1][0]);
    const r = dedupeStreams(doc);
    expect(r.merged).toBe(2);
    expect(r.savedBytes).toBeGreaterThan(0);
    const after = imageRefs(doc);
    expect(after[0][0]).toBe(after[1][0]);
  });

  it('內容不同、字典不同的不合併；頁面的內容串流不合併', async () => {
    const d = await PDFDocument.create({ updateMetadata: false });
    const a = flateXObject(d, new Uint8Array(30).fill(1), 10, 1, 3);
    const b = flateXObject(d, new Uint8Array(30).fill(2), 10, 1, 3);
    const c = flateXObject(d, new Uint8Array(30).fill(1), 10, 1, 3, { Interpolate: true });
    for (const ref of [a, b, c]) {
      const page = d.addPage([100, 100]);
      placeXObject(page, ref, 0, 0, 10, 10);
    }
    /* 頁面的內容串流：兩頁一模一樣也不合併（用的資源在各自的頁面字典裡） */
    const ctx = d.context;
    for (let i = 0; i < 2; i++) {
      const page = d.addPage([100, 100]);
      page.node.set(
        PDFName.of('Contents'),
        ctx.register(ctx.stream(new TextEncoder().encode('q Q'))),
      );
    }
    const doc = await reload(d);
    expect(dedupeStreams(doc).merged).toBe(0);
  });
});
