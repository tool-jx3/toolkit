/**
 * 在 Node 跑 qpdf（core/pdf/qpdf.ts 的執行器；wasm 從 node_modules 讀）。單元測試與 e2e（產生加密的測試檔）共用。
 */
import { createQpdfRunner, type QpdfFactory, type QpdfRunner } from '../../src/core/pdf/qpdf';

/** web/node_modules 底下的檔案路徑 */
export const nodeModulePath = (rel: string): string =>
  decodeURIComponent(new URL(`../../node_modules/${rel}`, import.meta.url).pathname);

let runner: QpdfRunner | null = null;

export function nodeQpdf(): QpdfRunner {
  runner ??= createQpdfRunner({
    loadFactory: async () => {
      const m = (await import('@neslinesli93/qpdf-wasm')) as unknown as {
        default?: QpdfFactory;
      } & QpdfFactory;
      return (m.default ?? m) as QpdfFactory;
    },
    wasmLocation: () => nodeModulePath('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
  });
  return runner;
}

/** 加密（user：開啟密碼；空字串＝只有擁有者密碼〔權限設定：禁止列印〕） */
export async function encryptPdf(
  bytes: Uint8Array,
  user: string,
  owner = 'owner-pw',
): Promise<Uint8Array> {
  const args = ['--encrypt', user, owner, '256'];
  if (!user) args.push('--print=none');
  args.push('--');
  const r = await nodeQpdf()(bytes, args);
  if (!r.out) throw new Error(`encrypt failed: ${r.stderr}`);
  return r.out;
}
