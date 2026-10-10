import { Crop } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type DominantColor,
  dominantColors,
  type FramePlacement,
  getImageData,
  opaqueBounds,
  type Rect,
} from '@/core/image';
import {
  Button,
  CropDialog,
  type DroppedImage,
  Field,
  FileDrop,
  ImageDrop,
  ImageFrameDialog,
  Section,
  ThumbnailList,
  useToast,
} from '@/ui';

function Thumb({ img, crop }: { img: DroppedImage; crop: Rect | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = crop ?? { x: 0, y: 0, width: img.width, height: img.height };
    const k = Math.min(1, 160 / Math.max(r.width, r.height));
    c.width = Math.max(1, Math.round(r.width * k));
    c.height = Math.max(1, Math.round(r.height * k));
    c.getContext('2d')?.drawImage(img.bitmap, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height);
  }, [img, crop]);
  return <canvas ref={ref} className="checker block max-w-full rounded-sm border border-border" />;
}

/** 圖片輸入：ImageDrop（拖放、貼上、選檔、多檔）、CropDialog（自由／固定比例）、取主色、透明邊偵測 */
export function ImagesDemo() {
  const toast = useToast();
  const [images, setImages] = useState<(DroppedImage & { id: number })[]>([]);
  const nextId = useRef(1);
  const [active, setActive] = useState(0);
  const [crops, setCrops] = useState<Record<number, Rect>>({});
  const [cropOpen, setCropOpen] = useState<'free' | 'square' | 'two' | null>(null);
  const [info, setInfo] = useState<{ colors: DominantColor[]; bounds: Rect | null } | null>(null);
  /* 放進框（蓋滿模式）：記住位置，再打開時從這裡開始 */
  const [frameOpen, setFrameOpen] = useState(false);
  const [placement, setPlacement] = useState<FramePlacement | null>(null);
  const img = images[active];

  useEffect(() => {
    if (!img) return setInfo(null);
    const data = getImageData(img.bitmap);
    setInfo({ colors: dominantColors(data, 5), bounds: opaqueBounds(data) });
  }, [img]);

  return (
    <div className="flex flex-col gap-3">
      <Section title="圖片拖放 ImageDrop">
        <ImageDrop
          multiple
          hint="PNG、JPG、WebP、GIF；可多選"
          onImages={(list) => {
            setImages((cur) => [...cur, ...list.map((im) => ({ ...im, id: nextId.current++ }))]);
            toast({ title: `收到 ${list.length} 張圖片`, tone: 'success' });
          }}
        />
        <ImageDrop
          compact
          disabled
          label="停用的拖放區（精簡樣式）"
          paste="off"
          onImages={() => {}}
        />
        {images.length ? (
          <ul aria-label="已加入的圖片" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
            {images.map((im, i) => (
              <li key={im.id}>
                <button
                  type="button"
                  aria-pressed={i === active}
                  onClick={() => setActive(i)}
                  className={`w-full rounded-md border p-1 text-left ${i === active ? 'border-accent' : 'border-border'}`}
                >
                  <Thumb img={im} crop={crops[i] ?? null} />
                  <span className="block truncate text-xs text-muted">
                    {im.file.name}（{im.width}×{im.height}）
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="縮圖清單 ThumbnailList">
        <ThumbnailList
          aria-label="縮圖清單示範"
          empty="在上面加入圖片後會列在這裡（第一張標示為已處理，最後一張是讀取中的佔位）。"
          onRemove={(id) => {
            setImages((cur) => cur.filter((im) => String(im.id) !== id));
            setActive(0);
            setCrops({});
          }}
          items={
            images.length
              ? [
                  ...images.map((im, i) => ({
                    id: String(im.id),
                    name: im.file.name,
                    image: im.bitmap,
                    meta: `${im.width} × ${im.height} px`,
                    status: i === 0 ? ('done' as const) : undefined,
                    statusLabel: '已處理',
                  })),
                  { id: 'loading', name: '讀取中的檔案.png' },
                ]
              : []
          }
        />
      </Section>
      <Section title="裁切 CropDialog">
        <div className="flex flex-wrap gap-2">
          <Button icon={<Crop />} disabled={!img} onClick={() => setCropOpen('free')}>
            裁切（可選比例）
          </Button>
          <Button icon={<Crop />} disabled={!img} onClick={() => setCropOpen('square')}>
            裁切（固定 1:1）
          </Button>
          <Button icon={<Crop />} disabled={!img} onClick={() => setCropOpen('two')}>
            裁切（兩個套用按鈕＋預覽）
          </Button>
        </div>
        {!img ? <p className="m-0 text-xs text-muted">先在上面加入一張圖片。</p> : null}
        {img && crops[active] ? (
          <p className="m-0 text-xs text-muted" data-testid="crop-result">
            裁切範圍：X {crops[active].x}、Y {crops[active].y}、{crops[active].width}×
            {crops[active].height}
          </p>
        ) : null}
        <CropDialog
          open={cropOpen !== null}
          onOpenChange={(o) => !o && setCropOpen(null)}
          image={img?.bitmap ?? null}
          aspect={cropOpen === 'square' ? 1 : undefined}
          initialRect={crops[active]}
          onConfirm={(r) => setCrops((c) => ({ ...c, [active]: r }))}
          confirmLabel={cropOpen === 'two' ? '套用到這張' : undefined}
          secondaryConfirm={
            cropOpen === 'two'
              ? {
                  label: '套用到所有圖片',
                  onConfirm: (r) =>
                    setCrops(
                      Object.fromEntries(images.map((im) => [im.id, r])) as Record<number, Rect>,
                    ),
                }
              : null
          }
          renderPreview={
            cropOpen === 'two'
              ? (r) => (
                  <p className="m-0 text-xs text-muted tabular-nums">
                    預覽（renderPreview）：{r.width}×{r.height}
                  </p>
                )
              : undefined
          }
        />
      </Section>
      <Section title="圖片放進框 ImageFrameDialog（蓋滿模式）">
        <p className="m-0 text-xs text-muted">
          蓋滿模式（cover）：圖片一定蓋滿框、縮放
          100%～400%；三分線；兩指捏合；套用時回傳位置（onApply），再打開時從上次的位置開始（initialPlacement）。
        </p>
        <Button icon={<Crop />} disabled={!img} onClick={() => setFrameOpen(true)}>
          放進手機畫面的框（9：19.5）
        </Button>
        {placement ? (
          <p className="m-0 text-xs text-muted tabular-nums" data-testid="frame-placement">
            位置：縮放 {placement.zoom.toFixed(2)}、x {placement.x.toFixed(3)}、y{' '}
            {placement.y.toFixed(3)}、轉 {placement.turns * 90}°
          </p>
        ) : null}
        <ImageFrameDialog
          open={frameOpen}
          onOpenChange={setFrameOpen}
          image={img?.bitmap ?? null}
          aspect={1080 / 2340}
          output={{ width: 1080, height: 2340 }}
          cover
          guides="thirds"
          initialPlacement={placement}
          onApply={setPlacement}
        />
      </Section>
      <Section title="影像分析（core/image）">
        {info ? (
          <>
            <Field label="主色（dominantColors）">
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {info.colors.map((c) => (
                  <li key={c.color} className="flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="size-5 rounded-sm border border-border"
                      style={{ background: c.color }}
                    />
                    <span className="font-mono">{c.color}</span>
                    <span className="text-muted">{Math.round(c.ratio * 100)}%</span>
                  </li>
                ))}
              </ul>
            </Field>
            <p className="m-0 text-xs text-muted">
              不透明範圍（opaqueBounds）：
              {info.bounds
                ? `X ${info.bounds.x}、Y ${info.bounds.y}、${info.bounds.width}×${info.bounds.height}`
                : '整張透明'}
            </p>
          </>
        ) : (
          <p className="m-0 text-xs text-muted">加入圖片後顯示主色與透明邊界。</p>
        )}
      </Section>
      <Section title="一般檔案 FileDrop">
        <FileDrop
          accept=".json,application/json"
          paste="off"
          clickable
          label="把 JSON 檔拖到這裡"
          hint="例如 CCFOLIA 角色資料"
          onFiles={async ([f]) =>
            toast({ title: `讀到 ${f.name}`, description: `${(await f.text()).length} 個字元` })
          }
          onReject={(files) =>
            toast({
              title: '不是 JSON 檔',
              description: files.map((f) => f.name).join('、'),
              tone: 'warning',
            })
          }
        />
      </Section>
    </div>
  );
}
