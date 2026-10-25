/**
 * 頁面圖片的設定（2026-10，上游 v3.14.0～v3.16.0；F278～F283）：配置、頁、位置、對齊角落與邊、寬、與文字的距離、
 * 文字的排法、外框與陰影、說明、換圖、刪除。
 */
import { Trash2 } from 'lucide-react';
import {
  Button,
  Field,
  FieldRow,
  NumberInput,
  OptionalNumberInput,
  Section,
  Segmented,
  TextInput,
} from '@/ui';
import { FREE_GAP, PAPER_H, PAPER_W } from '../model/image';
import {
  CORNERS,
  cornerPos,
  edgePos,
  PIMG_GAP_MAX,
  pimgBox,
  pimgGap,
  pimgGapClamp,
  pimgPage,
  pimgRound,
} from '../model/pageImg';
import type { PageImg } from '../model/types';
import { deletePimg, editPimg, pimgToFlow, reselectPimg } from '../ops';
import { say, useDoc, useUi } from '../store';
import { S } from '../strings';
import {
  IMAGE_POS_OPTIONS,
  ImageFxFields,
  type ImagePosChoice,
  ImageWidthField,
} from './ImageProps';

const EDGES = [
  ['top', '靠上緣'],
  ['bottom', '靠下緣'],
  ['left', '靠左緣'],
  ['right', '靠右緣'],
] as const;

export function PageImgPanel() {
  const id = useUi((s) => s.pimgSel);
  const o = useDoc((s) => (s.data.pageImgs ?? []).find((x) => x.id === id) ?? null);
  if (!o) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="se-pimg-panel">
      <p className="m-0 text-sm text-muted" aria-live="polite">
        目前：自由配置的圖片（頁面圖片）
      </p>
      <PageImgProps o={o} />
    </div>
  );
}

function PageImgProps({ o }: { o: PageImg }) {
  const d = useDoc((s) => s.data);
  const total = useUi((s) => s.total);
  const n = Math.max(1, total);
  const box = pimgBox(o, d);
  const gap = pimgGap(o);
  const ed = (recipe: (x: PageImg) => void) => editPimg(o.id, recipe);
  const setPos = (v: ImagePosChoice) => {
    if (v !== 'free') pimgToFlow(o.id, v);
  };
  return (
    <Section title="自由配置的圖片" fixed>
      {o.img ? (
        <img
          src={o.img}
          alt=""
          className="max-h-32 w-full rounded-sm bg-surface-3 object-contain"
        />
      ) : null}
      <Field label="配置" hint="改成行內或繞排時放回本文，成為那一頁的第一個段落。">
        <Segmented
          size="sm"
          value="free"
          onValueChange={setPos}
          options={IMAGE_POS_OPTIONS.map((x) => ({ value: x.value, label: x.label }))}
        />
      </Field>
      <Field label="放在第幾頁" hint={`1～${n}（超過總頁數時放在最後一頁）。`}>
        <NumberInput
          value={pimgPage(o, n) + 1}
          min={1}
          max={n}
          step={1}
          onChange={(v) =>
            ed((x) => {
              x.pg = Math.max(1, Math.min(n, Math.round(v || 1)));
            })
          }
        />
      </Field>
      <Field
        label="位置（紙的左上角到圖片的左上角）"
        hint={`紙是 A4（寬 ${PAPER_W} mm、高 ${PAPER_H} mm）；超出紙的數字收在紙裡。`}
      >
        <FieldRow columns={2}>
          <Field label="距左">
            <NumberInput
              value={pimgRound(o.x)}
              min={0}
              max={Math.max(0, pimgRound(PAPER_W - box.w))}
              step={0.5}
              precision={1}
              unit="mm"
              onChange={(v) => ed((x) => (x.x = pimgRound(v)))}
            />
          </Field>
          <Field label="距上">
            <NumberInput
              value={pimgRound(o.y)}
              min={0}
              max={Math.max(0, pimgRound(PAPER_H - box.h))}
              step={0.5}
              precision={1}
              unit="mm"
              onChange={(v) => ed((x) => (x.y = pimgRound(v)))}
            />
          </Field>
        </FieldRow>
      </Field>
      <Field label="對齊版心的角落" hint="放到紙面間距以內的四個角。">
        <div className="grid grid-cols-4 gap-1">
          {CORNERS.map(([c, label]) => (
            <Button
              key={c}
              size="sm"
              variant="secondary"
              onClick={() => {
                ed((x) => Object.assign(x, cornerPos(x, c, d)));
                say(S.status.pimgCorner(label));
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </Field>
      <Field label="對齊版心的一邊">
        <div className="grid grid-cols-4 gap-1">
          {EDGES.map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant="secondary"
              onClick={() => ed((x) => Object.assign(x, edgePos(x, k, d)))}
            >
              {label}
            </Button>
          ))}
        </div>
      </Field>
      <ImageWidthField o={o} doc={d} kind="page" onEdit={(recipe) => ed((x) => recipe(x, d))} />
      <Field
        label="與文字的距離"
        hint={`本文的文字離圖片這麼遠。空白時上下 ${FREE_GAP / 2} mm、左右 ${FREE_GAP} mm。`}
      >
        <FieldRow columns={2}>
          <Field label="上下">
            <OptionalNumberInput
              value={o.gv ?? null}
              placeholder={String(gap.v)}
              min={0}
              max={PIMG_GAP_MAX}
              step={0.5}
              precision={1}
              unit="mm"
              onChange={(v) =>
                ed((x) => {
                  if (v == null) delete x.gv;
                  else x.gv = pimgGapClamp(v);
                })
              }
            />
          </Field>
          <Field label="左右">
            <OptionalNumberInput
              value={o.gh ?? null}
              placeholder={String(gap.h)}
              min={0}
              max={PIMG_GAP_MAX}
              step={0.5}
              precision={1}
              unit="mm"
              onChange={(v) =>
                ed((x) => {
                  if (v == null) delete x.gh;
                  else x.gh = pimgGapClamp(v);
                })
              }
            />
          </Field>
        </FieldRow>
      </Field>
      <Field label="文字的排法" hint="避開只在單欄頁、知道長寬比時有效。">
        <Segmented
          size="sm"
          value={o.wrap === 'none' ? 'none' : 'square'}
          onValueChange={(v) =>
            ed((x) => {
              if (v === 'none') x.wrap = 'none';
              else delete x.wrap;
            })
          }
          options={[
            { value: 'square', label: '避開矩形' },
            { value: 'none', label: '重疊' },
          ]}
        />
      </Field>
      <ImageFxFields o={o} onEdit={(recipe) => ed((x) => recipe(x))} />
      <Field label="說明" hint="顯示在圖下方（可以加注音）。">
        <TextInput value={o.cap} onChange={(e) => ed((x) => (x.cap = e.target.value))} />
      </Field>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={() => void reselectPimg(o.id)}>
          重新選擇圖片
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => deletePimg(o.id)}>
          刪除這張圖片
        </Button>
      </div>
    </Section>
  );
}
