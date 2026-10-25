/**
 * 圖片的設定（F150～F156；2026-10：寬的單位、外框與陰影、自由配置＝頁面圖片，F277～F284）。
 */
import { useEffect, useRef } from 'react';
import {
  Button,
  Field,
  FieldRow,
  NativeNumberInput,
  Section,
  Segmented,
  Slider,
  TextInput,
} from '@/ui';
import {
  IMAGE_FRAMES,
  IMAGE_SHADOWS,
  type ImageKind,
  type ImageWidth,
  imageFrameOf,
  imagePos,
  imageShadowOf,
  imageWidthNote,
  imageWidthRange,
  imageWidthValue,
  setImagePos,
  setImageWidth,
  setImageWidthUnit,
} from '../model/image';
import { BOX_COLORS } from '../model/proc';
import type {
  Block,
  BoxColorKey,
  Doc,
  ImageFrame,
  ImageFx,
  ImageShadow,
  ImageWidthUnit,
} from '../model/types';
import { imageToPage, reselectImages } from '../ops';
import { editBlock, say, setUi, ui, useDoc, useUi } from '../store';
import { PreviewButton } from './BlockPanel';

/** 配置的選項（段落與頁面圖片用同一排；free＝頁面圖片） */
export const IMAGE_POS_OPTIONS = [
  { value: 'inline', label: '行內' },
  { value: 'left', label: '靠左繞排' },
  { value: 'right', label: '靠右繞排' },
  { value: 'free', label: '自由配置' },
] as const;
export type ImagePosChoice = (typeof IMAGE_POS_OPTIONS)[number]['value'];

/** 寬：單位（％／px）＋滑桿與數字＋實際寬度（F152、F279） */
export function ImageWidthField({
  o,
  doc,
  kind,
  onEdit,
}: {
  o: ImageWidth;
  doc: Pick<Doc, 'padH'>;
  kind: ImageKind;
  onEdit: (recipe: (x: ImageWidth, d: Doc) => void) => void;
}) {
  const px = o.wu === 'px';
  const r = imageWidthRange(o, doc, kind);
  const v = imageWidthValue(o, doc, kind);
  return (
    <Field
      label="大小（寬）"
      hint={`實際寬度：約 ${imageWidthNote(o, doc, kind)} mm（96 px＝25.4 mm 換算）。％ 以版心寬為準（不隨分欄改變）。`}
    >
      <div className="flex flex-col gap-1.5">
        <Segmented
          size="sm"
          aria-label="寬的單位"
          value={px ? 'px' : 'pct'}
          onValueChange={(u: ImageWidthUnit) => onEdit((x, d) => setImageWidthUnit(x, u, d, kind))}
          options={[
            { value: 'pct', label: '％（版心寬）' },
            { value: 'px', label: 'px（像素）' },
          ]}
        />
        <Slider
          aria-label={`寬（${px ? 'px' : '％'}）`}
          value={v}
          min={px ? r.min : 5}
          max={r.max}
          inputMin={r.min}
          inputMax={r.max}
          unit={px ? 'px' : '%'}
          onChange={(n) => onEdit((x, d) => setImageWidth(x, n, d, kind))}
        />
      </div>
    </Field>
  );
}

/** 外框、外框的顏色、陰影（F280） */
export function ImageFxFields({
  o,
  onEdit,
}: {
  o: ImageFx;
  onEdit: (recipe: (x: ImageFx) => void) => void;
}) {
  const fr = imageFrameOf(o);
  const sh = imageShadowOf(o);
  const col = o.frc ?? 'sumi';
  return (
    <>
      <Field label="外框（疊在圖片上）" hint="畫在圖片的內側，圖片的大小不變。">
        <div className="flex flex-col gap-1.5">
          <Segmented
            size="sm"
            aria-label="外框"
            value={fr || 'none'}
            onValueChange={(v: string) =>
              onEdit((x) => {
                if (v === 'none') delete x.fr;
                else x.fr = v as ImageFrame;
              })
            }
            options={IMAGE_FRAMES.map(([k, label]) => ({ value: k || 'none', label }))}
          />
          {fr ? (
            // biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕
            <div role="group" aria-label="外框的顏色" className="grid grid-cols-4 gap-1">
              {BOX_COLORS.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  aria-pressed={col === c.k}
                  title={c.name}
                  onClick={() =>
                    onEdit((x) => {
                      x.frc = c.k as BoxColorKey;
                    })
                  }
                  className="flex h-7 items-center gap-1 rounded-sm border border-border px-1.5 text-xs aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent"
                >
                  <span
                    aria-hidden
                    className="inline-block size-3.5 shrink-0 rounded-full"
                    style={{ background: c.c }}
                  />
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Field>
      <Field label="陰影" hint="往右下方落下陰影；背景透明的圖片沿著圖案的形狀。">
        <Segmented
          size="sm"
          aria-label="陰影"
          value={sh || 'none'}
          onValueChange={(v: string) =>
            onEdit((x) => {
              if (v === 'none') delete x.sh;
              else x.sh = v as ImageShadow;
            })
          }
          options={IMAGE_SHADOWS.map(([k, label]) => ({ value: k || 'none', label }))}
        />
      </Field>
    </>
  );
}

export function ImageProps({ b }: { b: Block }) {
  const pos = imagePos(b);
  const d = useDoc((s) => s.data);
  const top = d.blocks.some((x) => x.id === b.id);
  const cap = useRef<HTMLInputElement>(null);
  const focusReq = useUi((s) =>
    s.focusReq?.id === b.id && s.focusReq.field === 'cap' ? s.focusReq : null,
  );
  useEffect(() => {
    if (!focusReq || !cap.current) return;
    cap.current.focus();
    /* 用過就清掉（設定欄重新畫出時不再搶焦點） */
    if (ui().focusReq === focusReq) setUi({ focusReq: null });
  }, [focusReq]);
  const setPos = (v: ImagePosChoice) => {
    if (v === 'free') {
      imageToPage(b.id);
      return;
    }
    editBlock(b.id, (x) => setImagePos(x, v));
    say({ inline: '已改成行內', left: '已改成靠左繞排', right: '已改成靠右繞排' }[v]);
  };
  const num = (k: 'dx' | 'dy', v: string) =>
    editBlock(b.id, (x) => {
      x[k] = Math.round(+v || 0);
    });
  return (
    <Section title="圖片" fixed>
      {b.img ? (
        <img
          src={b.img}
          alt=""
          className="max-h-32 w-full rounded-sm bg-surface-3 object-contain"
        />
      ) : (
        <p className="m-0 text-sm text-muted">（未設定圖片）</p>
      )}
      <Button size="sm" variant="secondary" onClick={() => void reselectImages([b.id])}>
        重新選擇圖片
      </Button>
      <Field
        label="配置"
        hint={
          top
            ? '「自由配置」：離開段落的順序，用座標放在頁上的任何位置（本文加字也不會動）。'
            : '彈出視窗、儲存格裡的圖片不能自由配置。'
        }
      >
        <Segmented
          size="sm"
          value={pos}
          onValueChange={setPos}
          options={IMAGE_POS_OPTIONS.filter((o) => top || o.value !== 'free').map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      </Field>
      <ImageWidthField
        o={b}
        doc={d}
        kind="block"
        onEdit={(recipe) =>
          editBlock(b.id, (x, dd) => {
            recipe(x, dd);
          })
        }
      />
      {pos === 'left' || pos === 'right' ? (
        <FieldRow columns={2}>
          <Field label="往下">
            <NativeNumberInput value={String(b.dy ?? 0)} unit="mm" onChange={(v) => num('dy', v)} />
          </Field>
          <Field label="往內">
            <NativeNumberInput value={String(b.dx ?? 0)} unit="mm" onChange={(v) => num('dx', v)} />
          </Field>
        </FieldRow>
      ) : null}
      {pos === 'left' || pos === 'right' ? (
        <p className="m-0 text-xs text-muted">位移只在單欄的頁有效。</p>
      ) : null}
      <ImageFxFields o={b} onEdit={(recipe) => editBlock(b.id, (x) => recipe(x))} />
      <Field label="說明" hint="顯示在圖下方（可以加注音）。">
        <TextInput
          ref={cap}
          value={String(b.cap ?? '')}
          onChange={(e) => editBlock(b.id, (x) => (x.cap = e.target.value))}
        />
      </Field>
      <PreviewButton id={b.id} />
    </Section>
  );
}
