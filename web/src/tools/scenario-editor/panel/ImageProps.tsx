/**
 * 圖片的設定（F150～F156）。
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
import { findBlock } from '../model/blocks';
import { imagePos, setImagePos, snapImage } from '../model/image';
import type { Block, ImagePos } from '../model/types';
import { reselectImages } from '../ops';
import { edit, editBlock, say, useUi } from '../store';
import { PreviewButton } from './BlockPanel';

export function ImageProps({ b }: { b: Block }) {
  const pos = imagePos(b);
  const free = pos === 'free';
  const total = useUi((s) => s.total);
  const page = useUi((s) => s.layout.pageOf[b.id]);
  const cap = useRef<HTMLInputElement>(null);
  const focusReq = useUi((s) =>
    s.focusReq?.id === b.id && s.focusReq.field === 'cap' ? s.focusReq : null,
  );
  useEffect(() => {
    if (focusReq) cap.current?.focus();
  }, [focusReq]);
  const w = Math.max(1, Math.min(100, +(b.w ?? 0) || (free ? 40 : 70)));
  const setPos = (v: ImagePos) => {
    editBlock(b.id, (x) => {
      setImagePos(x, v, (page ?? 0) + 1);
      if (v === 'free' && !(+(x.w ?? 0) > 0)) x.w = 40;
    });
    say(
      {
        inline: '已改成行內',
        left: '已改成靠左繞排',
        right: '已改成靠右繞排',
        free: '已改成自由配置',
      }[v],
    );
  };
  const num = (k: 'dx' | 'dy' | 'fx' | 'fy', v: string) =>
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
      <Field label="配置">
        <Segmented
          size="sm"
          value={pos}
          onValueChange={setPos}
          options={[
            { value: 'inline', label: '行內' },
            { value: 'left', label: '靠左繞排' },
            { value: 'right', label: '靠右繞排' },
            { value: 'free', label: '自由配置' },
          ]}
        />
      </Field>
      <Field label="大小" hint={free ? '以紙寬（210 mm）為準。' : '以版心寬為準（不隨分欄改變）。'}>
        <Slider
          value={w}
          min={5}
          max={100}
          inputMin={1}
          inputMax={100}
          unit="%"
          onChange={(v) => editBlock(b.id, (x) => (x.w = Math.round(v)))}
        />
      </Field>
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
      {free ? (
        <>
          <FieldRow columns={3}>
            <Field label="距左">
              <NativeNumberInput
                value={String(b.fx ?? 0)}
                unit="mm"
                onChange={(v) => num('fx', v)}
              />
            </Field>
            <Field label="距上">
              <NativeNumberInput
                value={String(b.fy ?? 0)}
                unit="mm"
                onChange={(v) => num('fy', v)}
              />
            </Field>
            <Field label="頁">
              <NativeNumberInput
                value={String(b.pg ?? 1)}
                min={1}
                max={Math.max(1, total)}
                onChange={(v) =>
                  editBlock(b.id, (x) => {
                    x.pg = Math.max(1, Math.min(Math.max(1, total), Math.round(+v || 1)));
                  })
                }
              />
            </Field>
          </FieldRow>
          <Field label="文字的排法" hint="避開只在單欄頁、知道長寬比時有效。">
            <Segmented
              size="sm"
              value={b.wrap === 'none' ? 'none' : 'square'}
              onValueChange={(v) => editBlock(b.id, (x) => (x.wrap = v))}
              options={[
                { value: 'square', label: '避開矩形' },
                { value: 'none', label: '重疊' },
              ]}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['top', '靠上緣'],
                ['bottom', '靠下緣'],
                ['left', '靠左緣'],
                ['right', '靠右緣'],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant="secondary"
                onClick={() =>
                  edit((d) => {
                    const x = findBlock(d, b.id)?.b;
                    if (x) snapImage(x, k, d);
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </>
      ) : null}
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
