import { Crop } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type DominantColor,
  dominantColors,
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
  Section,
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
  const [cropOpen, setCropOpen] = useState<'free' | 'square' | null>(null);
  const [info, setInfo] = useState<{ colors: DominantColor[]; bounds: Rect | null } | null>(null);
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
      <Section title="裁切 CropDialog">
        <div className="flex flex-wrap gap-2">
          <Button icon={<Crop />} disabled={!img} onClick={() => setCropOpen('free')}>
            裁切（可選比例）
          </Button>
          <Button icon={<Crop />} disabled={!img} onClick={() => setCropOpen('square')}>
            裁切（固定 1:1）
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
