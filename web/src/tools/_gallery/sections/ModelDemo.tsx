/**
 * 模型下載卡（ModelDownloadPanel＋useModelCache，core/models）與進度條（ProgressBar）的示範。
 * 不連網：假的 2 MB「模型」在瀏覽器裡產生，慢慢送出（約 2 秒），存在記憶體（重新整理就沒了）。
 * 「下載壞掉的檔案」示範 SHA-256 不符時丟棄並說明。
 */
import { useMemo, useState } from 'react';
import { bytesToHex, sha256Sync } from '@/core/files';
import { type ModelSpec, memoryBackend } from '@/core/models';
import { ModelDownloadPanel, ProgressBar, Section, Toggle, useModelCache } from '@/ui';

const BYTES = 2_000_000;

function fakeData(): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(BYTES);
  for (let i = 0; i < b.length; i++) b[i] = (i * 31 + 17) & 255;
  return b;
}

/** 假的 fetch：每 40 毫秒送 64 KB；corrupt 時改壞一個位元組 */
function slowFetch(data: Uint8Array, corrupt: () => boolean): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = corrupt() ? data.slice() : data;
    if (corrupt()) body[123] ^= 1;
    let o = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (init?.signal?.aborted) {
          c.error(new DOMException('aborted', 'AbortError'));
          return;
        }
        if (o >= body.length) {
          c.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 40));
        c.enqueue(body.slice(o, o + 64 * 1024));
        o += 64 * 1024;
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
}

export function ModelDemo() {
  const data = useMemo(fakeData, []);
  const spec = useMemo<ModelSpec>(
    () => ({
      id: 'gallery-demo',
      url: 'https://example.invalid/gallery/demo-model.onnx',
      bytes: BYTES,
      sha256: bytesToHex(sha256Sync(data)),
      name: '示範模型（假的）',
      source: '元件展示頁（在瀏覽器裡產生，不連網）',
      license: 'MIT',
    }),
    [data],
  );
  const storage = useMemo(() => memoryBackend(), []);
  const [corrupt, setCorrupt] = useState(false);
  const corruptRef = useMemo(() => ({ on: false }), []);
  corruptRef.on = corrupt;
  const fetchImpl = useMemo(() => slowFetch(data, () => corruptRef.on), [data, corruptRef]);
  const model = useModelCache(spec, { storage, fetch: fetchImpl });
  return (
    <Section title="模型下載 ModelDownloadPanel（core/models）">
      <p className="m-0 text-xs text-muted">
        大型模型檔第一次用時才下載：先說明大小與來源、按了才下載；顯示進度、可以取消；驗
        SHA-256，不符就丟掉；存在瀏覽器裡（這裡用記憶體）；可以刪除。
      </p>
      <ModelDownloadPanel spec={spec} {...model} />
      <Toggle
        label="下次下載壞掉的檔案（示範驗證失敗）"
        checked={corrupt}
        onCheckedChange={setCorrupt}
      />
      <p className="m-0 text-xs text-muted">進度條 ProgressBar：0～1，或 null＝不確定。</p>
      <ProgressBar value={0.42} label="示範進度 42%" />
      <ProgressBar value={null} label="示範：不確定的進度" />
    </Section>
  );
}
