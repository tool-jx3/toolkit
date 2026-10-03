/**
 * 畫布分頁（規格 1.9；舊版「文件」）：作品名稱、尺寸、背景；對稱尺；吸附；快速範本。
 */
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  NumberInput,
  Section,
  TemplateGallery,
  type TemplateItem,
  Toggle,
} from '@/ui';
import {
  applyTemplateById,
  centerSymmetry,
  edit,
  setDocumentSize,
  setStatus,
  step,
  type TemplateId,
} from './actions';
import { BufferedText, gesture } from './controls';
import { clamp } from './geometry';
import { classicTemplate, type McProject, RANGE, runeTemplate, sigilTemplate } from './model';
import { renderScene } from './render';
import { useProject } from './store';
import { S } from './strings';

/** 範本的縮圖（畫在結尾的畫面） */
function thumbnail(p: McProject): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const W = 192;
    const k = W / Math.max(p.document.width, p.document.height);
    const c = document.createElement('canvas');
    c.width = Math.round(p.document.width * k);
    c.height = Math.round(p.document.height * k);
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.scale(k, k);
    renderScene(ctx, p, p.animation.duration, { transparent: false, pixelScale: k });
    return c.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

function Templates() {
  const items = useMemo<TemplateItem<TemplateId>[]>(
    () => [
      {
        id: 'classic',
        ...S.templates.classic,
        thumbnail: thumbnail(classicTemplate().project),
        data: 'classic',
      },
      {
        id: 'rune',
        ...S.templates.rune,
        thumbnail: thumbnail(runeTemplate().project),
        data: 'rune',
      },
      {
        id: 'sigil',
        ...S.templates.sigil,
        thumbnail: thumbnail(sigilTemplate().project),
        data: 'sigil',
      },
      {
        id: 'blank',
        ...S.templates.blank,
        thumbnail: (
          <span className="flex size-full items-center justify-center bg-surface-2 text-muted">
            <Plus className="size-8" aria-hidden />
          </span>
        ),
        data: 'blank',
      },
    ],
    [],
  );
  return (
    <Section title={S.doc.templates} fixed>
      <TemplateGallery<TemplateId>
        aria-label={S.templates.label}
        templates={items}
        confirm={false}
        filter={false}
        onApply={(t) => applyTemplateById(t.data)}
      />
    </Section>
  );
}

const live = (fn: (v: number) => void) => gesture.live(fn);

export function CanvasPanel() {
  const doc = useProject((s) => s.data.document);
  const sym = useProject((s) => s.data.symmetry);
  const snap = useProject((s) => s.data.snap);
  const toggle = (fn: (d: McProject, v: boolean) => void) => (v: boolean) =>
    step(() =>
      edit((d) => {
        fn(d as McProject, v);
      }),
    );
  return (
    <>
      <Section title={S.doc.canvas} fixed>
        <Field label={S.doc.name}>
          <BufferedText
            value={doc.name}
            onText={(t) => {
              edit((d) => {
                d.document.name = t || S.names.newProject;
              });
              setStatus(S.status.docName(t || S.names.newProject));
            }}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.doc.width}>
            <NumberInput
              value={doc.width}
              onChange={live((v) => setDocumentSize('width', v))}
              onCommit={gesture.commit}
              min={RANGE.size[0]}
              max={RANGE.size[1]}
              step={1}
              precision={0}
              unit="px"
            />
          </Field>
          <Field label={S.doc.height}>
            <NumberInput
              value={doc.height}
              onChange={live((v) => setDocumentSize('height', v))}
              onCommit={gesture.commit}
              min={RANGE.size[0]}
              max={RANGE.size[1]}
              step={1}
              precision={0}
              unit="px"
            />
          </Field>
        </FieldRow>
        <Field label={S.doc.transparent} layout="inline">
          <Toggle
            checked={doc.transparent}
            onCheckedChange={toggle((d, v) => {
              d.document.transparent = v;
            })}
          />
        </Field>
        <Field label={S.doc.background} className={doc.transparent ? 'opacity-55' : undefined}>
          <ColorField
            value={doc.background}
            onChange={(v) =>
              edit((d) => {
                d.document.background = v.slice(0, 7);
              })
            }
          />
        </Field>
      </Section>

      <Section
        title={S.doc.symmetry}
        fixed
        actions={
          <Toggle
            aria-label={S.doc.symmetryToggle}
            checked={sym.enabled}
            onCheckedChange={toggle((d, v) => {
              d.symmetry.enabled = v;
            })}
          />
        }
      >
        <FieldRow columns={2}>
          <Field label={S.doc.count}>
            <NumberInput
              value={sym.count}
              onChange={live((v) =>
                edit((d) => {
                  d.symmetry.count = Math.round(clamp(v, ...RANGE.count));
                }),
              )}
              onCommit={gesture.commit}
              min={RANGE.count[0]}
              max={RANGE.count[1]}
              step={1}
              precision={0}
            />
          </Field>
          <Field label={S.doc.offset}>
            <NumberInput
              value={sym.offset}
              onChange={live((v) =>
                edit((d) => {
                  d.symmetry.offset = clamp(v, ...RANGE.offset);
                }),
              )}
              onCommit={gesture.commit}
              min={RANGE.offset[0]}
              max={RANGE.offset[1]}
              step={1}
              precision={2}
              unit="°"
            />
          </Field>
        </FieldRow>
        <Field label={S.doc.mirror} layout="inline">
          <Toggle
            checked={sym.mirror}
            onCheckedChange={toggle((d, v) => {
              d.symmetry.mirror = v;
            })}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.doc.centerX}>
            <NumberInput
              value={Math.round(sym.centerX * 100) / 100}
              onChange={live((v) =>
                edit((d) => {
                  d.symmetry.centerX = v;
                }),
              )}
              onCommit={gesture.commit}
              min={-100000}
              max={100000}
              step={1}
              precision={2}
            />
          </Field>
          <Field label={S.doc.centerY}>
            <NumberInput
              value={Math.round(sym.centerY * 100) / 100}
              onChange={live((v) =>
                edit((d) => {
                  d.symmetry.centerY = v;
                }),
              )}
              onCommit={gesture.commit}
              min={-100000}
              max={100000}
              step={1}
              precision={2}
            />
          </Field>
        </FieldRow>
        <Button size="sm" onClick={centerSymmetry}>
          {S.doc.centerButton}
        </Button>
      </Section>

      <Section
        title={S.doc.snap}
        persistKey="magic-circle:snap"
        actions={
          <Toggle
            aria-label={S.doc.snapToggle}
            checked={snap.enabled}
            onCheckedChange={toggle((d, v) => {
              d.snap.enabled = v;
            })}
          />
        }
      >
        <Field label={S.doc.snapGrid} layout="inline">
          <Toggle
            checked={snap.grid}
            onCheckedChange={toggle((d, v) => {
              d.snap.grid = v;
            })}
          />
        </Field>
        <Field label={S.doc.gridSize}>
          <NumberInput
            value={snap.gridSize}
            onChange={live((v) =>
              edit((d) => {
                d.snap.gridSize = Math.round(clamp(v, ...RANGE.gridSize));
              }),
            )}
            onCommit={gesture.commit}
            min={RANGE.gridSize[0]}
            max={RANGE.gridSize[1]}
            step={1}
            precision={0}
            unit="px"
          />
        </Field>
        <Field label={S.doc.snapCenter} layout="inline">
          <Toggle
            checked={snap.center}
            onCheckedChange={toggle((d, v) => {
              d.snap.center = v;
            })}
          />
        </Field>
        <Field label={S.doc.snapRadial} layout="inline">
          <Toggle
            checked={snap.radial}
            onCheckedChange={toggle((d, v) => {
              d.snap.radial = v;
            })}
          />
        </Field>
        <Field label={S.doc.snapAngles} layout="inline">
          <Toggle
            checked={snap.angles}
            onCheckedChange={toggle((d, v) => {
              d.snap.angles = v;
            })}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.doc.angleStep}>
            <NumberInput
              value={snap.angleStep}
              onChange={live((v) =>
                edit((d) => {
                  d.snap.angleStep = Math.round(clamp(v, ...RANGE.angleStep));
                }),
              )}
              onCommit={gesture.commit}
              min={RANGE.angleStep[0]}
              max={RANGE.angleStep[1]}
              step={1}
              precision={0}
              unit="°"
            />
          </Field>
          <Field label={S.doc.threshold}>
            <NumberInput
              value={snap.threshold}
              onChange={live((v) =>
                edit((d) => {
                  d.snap.threshold = clamp(v, ...RANGE.threshold);
                }),
              )}
              onCommit={gesture.commit}
              min={RANGE.threshold[0]}
              max={RANGE.threshold[1]}
              step={1}
              unit="px"
            />
          </Field>
        </FieldRow>
      </Section>

      <Templates />
    </>
  );
}
