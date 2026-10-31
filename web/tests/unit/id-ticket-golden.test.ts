/**
 * 證件與票券產生器：沒用到新功能（照片效果、掛繩孔／掛繩、SF 證件）時，既有的證件與票券畫出來的指令和加入之前完全相同
 * （指令相同＝像素相同＝匯出的 PNG 逐位元組相同；規格 F27 修訂、D23～）。
 *
 * 基準檔 `fixtures/id-ticket-golden.json` 是**加入之前**的程式（commit 0292848 的 render.ts，只把畫一面的步驟抽成
 * `paintIdFace`、行為不變）用這個檔案產生的：7 款證件 × 正反面 × 卡片／印刷 × 有沒有照片 × 淺色／深色、5 款票券 × 有沒有照片，
 * 每一組畫出來的 canvas 指令（tests/helpers/canvasRecorder；量字是固定寬度，和字型、環境無關）的 SHA-256。
 * 要刻意改變外觀時，用 `ID_TICKET_GOLDEN_WRITE=1 npx vitest run tests/unit/id-ticket-golden.test.ts` 重新產生並在規格寫明。
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '@/core/files';
import {
  EXPORT_SCALE,
  facePixels,
  type IdTicketState,
  initialState,
} from '@/tools/id-ticket/model';
import { drawTicket, paintIdFace } from '@/tools/id-ticket/render';
import { ID_TEMPLATES, TICKET_TEMPLATES } from '@/tools/id-ticket/templates';
import { recordCanvas } from '../helpers/canvasRecorder';

const FS = 'node:fs';
const { existsSync, readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .ID_TICKET_GOLDEN_WRITE === '1';
const FIXTURE = new URL('./fixtures/id-ticket-golden.json', import.meta.url).pathname;

/** 2D 仿射矩陣（canvasRecorder 的 getTransform 只回傳數字；畫法要 inverse／multiply） */
class M2 {
  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly e: number,
    readonly f: number,
  ) {}
  multiply(n: { a: number; b: number; c: number; d: number; e: number; f: number }): M2 {
    return new M2(
      this.a * n.a + this.c * n.b,
      this.b * n.a + this.d * n.b,
      this.a * n.c + this.c * n.d,
      this.b * n.c + this.d * n.d,
      this.a * n.e + this.c * n.f + this.e,
      this.b * n.e + this.d * n.f + this.f,
    );
  }
  inverse(): M2 {
    const det = this.a * this.d - this.b * this.c;
    return new M2(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    );
  }
}

/** canvasRecorder 加上 DOMMatrix 樣的 getTransform */
function recorder(width: number, height: number) {
  const rec = recordCanvas(width, height);
  const raw = rec.ctx as unknown as Record<string, unknown>;
  const ctx = new Proxy(raw, {
    get(t, key) {
      if (key === 'getTransform')
        return () => {
          const m = (t.getTransform as () => Record<string, number>)();
          return new M2(m.a, m.b, m.c, m.d, m.e, m.f);
        };
      return t[key as string];
    },
    set(t, key, v) {
      t[key as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log: rec.log };
}

/* Node 沒有 Path2D：記下子路徑的指令，記錄器以 __id（指令的 JSON）記下 */
function FakePath2D(): object {
  const cmds: unknown[] = [];
  const argOf = (v: unknown) =>
    v && typeof v === 'object' ? ((v as { __id?: string }).__id ?? 'object') : v;
  return new Proxy(
    {},
    {
      get(_t, key) {
        if (key === '__id') return `path:${JSON.stringify(cmds)}`;
        if (typeof key !== 'string') return undefined;
        return (...a: unknown[]) => {
          cmds.push([key, ...a.map(argOf)]);
        };
      },
    },
  );
}
(globalThis as Record<string, unknown>).Path2D ??= FakePath2D;

const FAKE_PHOTO = { width: 400, height: 300 } as unknown as CanvasImageSource;
const PHOTO = {
  image: { id: 'p1', name: 'p.png', width: 400, height: 300 },
  place: { zoom: 1.3, x: 0.05, y: -0.02, turns: 0 },
};

const hash = (log: unknown[]) =>
  bytesToHex(sha256Sync(new TextEncoder().encode(JSON.stringify(log))));

function cases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ID_TEMPLATES)
    for (const dark of [false, true])
      for (const withPhoto of [false, true]) {
        /* 偵探執照的褐色照片要真的畫布，略過 */
        if (withPhoto && t.id === 'detective') continue;
        const s0 = initialState();
        const s: IdTicketState = {
          ...s0,
          idTemplate: t.id,
          idStyles: { ...s0.idStyles, [t.id]: { ...s0.idStyles[t.id], dark } },
          idPhoto: withPhoto ? PHOTO : null,
        };
        for (const side of ['front', 'back'] as const)
          for (const mode of ['card', 'print'] as const) {
            const size = facePixels(t.orientation, mode);
            const r = recorder(size.width, size.height);
            const regions = paintIdFace(
              r.ctx,
              s,
              side,
              EXPORT_SCALE,
              mode,
              { preview: false, photo: withPhoto ? FAKE_PHOTO : null },
              size,
            );
            out[
              `id/${t.id}/${dark ? 'dark' : 'light'}/${withPhoto ? 'photo' : 'empty'}/${side}/${mode}`
            ] = hash([r.log, regions]);
          }
      }
  for (const t of TICKET_TEMPLATES)
    for (const withPhoto of [false, true]) {
      if (withPhoto && !t.photo) continue;
      const s0 = initialState();
      const s: IdTicketState = {
        ...s0,
        kind: 'ticket',
        ticketTemplate: t.id,
        ticketPhotos: withPhoto ? { [t.id]: PHOTO } : {},
      };
      const r = recorder(800, 800);
      r.ctx.scale(2, 2);
      const regions = drawTicket(r.ctx, s, {
        preview: false,
        photo: withPhoto ? FAKE_PHOTO : null,
      });
      out[`ticket/${t.id}/${withPhoto ? 'photo' : 'empty'}`] = hash([r.log, regions]);
    }
  return out;
}

describe('id-ticket：既有的證件與票券的畫法不變', () => {
  it('畫出來的指令和加入新功能之前相同', () => {
    const got = cases();
    if (WRITE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
      if (!WRITE) throw new Error('基準檔不存在，已產生；請確認後再跑一次');
    }
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want)) expect(got[k], k).toBe(want[k]);
  });
});
