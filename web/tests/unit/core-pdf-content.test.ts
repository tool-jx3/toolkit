/**
 * core/pdf：內容串流的掃描（q／Q／cm／Do、字串與行內影像要跳過）與影像在頁面上的大小（含表單 XObject、
 * 註解的外觀、/UserUnit）。
 */
import { PDFDocument, PDFName, PDFNumber, type PDFRef } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  type Matrix,
  multiply,
  scanBudget,
  scanContent,
  unitSize,
} from '@/core/pdf/content';
import { refKey } from '@/core/pdf/objects';
import { imagePlacements } from '@/core/pdf/placements';
import { flateXObject, placeXObject } from '../helpers/pdfFixtures';

const enc = (s: string) => new TextEncoder().encode(s);

function scan(src: string, ctm: Matrix = IDENTITY) {
  const calls: { name: string; m: Matrix }[] = [];
  scanContent(enc(src), ctm, (name, m) => calls.push({ name, m }));
  return calls;
}

describe('內容串流的掃描', () => {
  it('cm 乘在目前的矩陣前面；q／Q 存回', () => {
    const calls = scan(
      'q 2 0 0 3 10 20 cm /Im1 Do Q /Im2 Do q 1 0 0 1 5 5 cm 4 0 0 4 0 0 cm /Im3 Do Q',
    );
    expect(calls.map((c) => c.name)).toEqual(['Im1', 'Im2', 'Im3']);
    expect(calls[0].m).toEqual([2, 0, 0, 3, 10, 20]);
    expect(calls[1].m).toEqual(IDENTITY);
    expect(calls[2].m).toEqual([4, 0, 0, 4, 5, 5]);
  });

  it('字串、十六進位字串、註解、陣列裡的「Do」不算', () => {
    const calls = scan(
      'BT /F1 12 Tf (q 9 0 0 9 0 0 cm /X Do \\) Do) Tj <2F5820446F> Tj [(a) -20 (Do)] TJ ET % /Y Do\n/Im Do',
    );
    expect(calls.map((c) => c.name)).toEqual(['Im']);
    expect(calls[0].m).toEqual(IDENTITY);
  });

  it('行內影像（BI … ID 二進位 EI）整段跳過', () => {
    const calls = scan(
      'q 10 0 0 10 0 0 cm BI /W 2 /H 2 /CS /G /BPC 8 ID \u0000Doÿ\u0001 EI Q /After Do',
    );
    expect(calls.map((c) => c.name)).toEqual(['After']);
  });

  it('名稱的 #xx 跳脫；Q 太多不會壞', () => {
    expect(scan('Q Q /Im#20A Do')).toEqual([{ name: 'Im A', m: IDENTITY }]);
  });

  it('cm 的運算元不足 6 個時忽略', () => {
    expect(scan('1 0 0 cm /Im Do')[0].m).toEqual(IDENTITY);
  });

  it('超過工作量上限就停', () => {
    const budget = scanBudget(5);
    const calls: string[] = [];
    scanContent(enc('/A Do /B Do /C Do /D Do'), IDENTITY, (n) => calls.push(n), budget);
    expect(budget.exhausted).toBe(true);
    expect(calls.length).toBeLessThan(4);
  });

  it('矩陣相乘與單位正方形的大小（旋轉 90° 也照影像的兩個方向量）', () => {
    expect(multiply([2, 0, 0, 3, 0, 0], [1, 0, 0, 1, 10, 20])).toEqual([2, 0, 0, 3, 10, 20]);
    const rot: Matrix = [0, 144, -72, 0, 300, 100];
    expect(unitSize(rot)).toEqual({ width: 144, height: 72 });
  });
});

describe('影像在頁面上的大小', () => {
  /* pdf-lib 新建的頁面內容不是原始串流：存檔再讀回來（引擎拿到的都是讀進來的檔案） */
  const reload = async (d: PDFDocument) =>
    PDFDocument.load(await d.save({ useObjectStreams: false }));

  async function doc() {
    const d = await PDFDocument.create({ updateMetadata: false });
    const img = flateXObject(d, new Uint8Array(100 * 50 * 3), 100, 50, 3);
    return { d, img };
  }

  it('同一張畫兩次：取最大的；單位英吋', async () => {
    const { d, img } = await doc();
    const p1 = d.addPage([612, 792]);
    placeXObject(p1, img, 0, 0, 144, 72);
    const p2 = d.addPage([612, 792]);
    placeXObject(p2, img, 0, 0, 288, 36);
    const scan = imagePlacements(await reload(d));
    expect(scan.complete).toBe(true);
    expect(scan.sizes.get(refKey(img))).toEqual({ widthIn: 4, heightIn: 1 });
  });

  it('表單 XObject：/Matrix 乘進去；表單用自己的資源', async () => {
    const { d, img } = await doc();
    const ctx = d.context;
    const formRes = ctx.obj({ XObject: { Pic: img } });
    const form = ctx.register(
      ctx.stream(enc('q 72 0 0 72 0 0 cm /Pic Do Q'), {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 100, 100],
        Matrix: [2, 0, 0, 2, 0, 0],
        Resources: formRes,
      }),
    );
    const page = d.addPage([612, 792]);
    placeXObject(page, form, 0, 0, 1.5, 1.5);
    const size = imagePlacements(await reload(d)).sizes.get(refKey(img));
    /* 72 × 2（Matrix）× 1.5（頁面上的 cm）＝ 216 pt ＝ 3 英吋 */
    expect(size?.widthIn).toBeCloseTo(3);
    expect(size?.heightIn).toBeCloseTo(3);
  });

  it('/UserUnit 乘進去', async () => {
    const { d, img } = await doc();
    const page = d.addPage([612, 792]);
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    placeXObject(page, img, 0, 0, 72, 72);
    expect(imagePlacements(await reload(d)).sizes.get(refKey(img))).toEqual({
      widthIn: 2,
      heightIn: 2,
    });
  });

  it('註解的外觀串流（蓋章的圖）：/BBox 縮放到 /Rect', async () => {
    const { d, img } = await doc();
    const ctx = d.context;
    const ap = ctx.register(
      ctx.stream(enc('q 100 0 0 50 0 0 cm /Pic Do Q'), {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 100, 50],
        Resources: { XObject: { Pic: img } },
      }),
    );
    const annot = ctx.register(
      ctx.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [100, 100, 316, 208], AP: { N: ap } }),
    );
    const page = d.addPage([612, 792]);
    page.node.addAnnot(annot as PDFRef);
    /* Rect 216 × 108 pt ＝ 3 × 1.5 英吋 */
    const size = imagePlacements(await reload(d)).sizes.get(refKey(img));
    expect(size?.widthIn).toBeCloseTo(3);
    expect(size?.heightIn).toBeCloseTo(1.5);
  });

  it('表單互相包含（迴圈）不會卡住', async () => {
    const { d } = await doc();
    const ctx = d.context;
    const ref = ctx.nextRef();
    ctx.assign(
      ref,
      ctx.stream(enc('/Self Do'), {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 1, 1],
        Resources: { XObject: { Self: ref } },
      }),
    );
    const page = d.addPage([612, 792]);
    placeXObject(page, ref, 0, 0, 10, 10);
    expect(imagePlacements(await reload(d)).complete).toBe(true);
  });
});
