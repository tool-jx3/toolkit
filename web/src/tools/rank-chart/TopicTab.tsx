/**
 * 分頁 01「主題與排名者」（規格 1.1、1.2）：標題三行的文字與預覽、排名者的照片（擺放模式、擺法、放大、位置）、
 * 抽選卡片的大小。
 */
import { Check, ImagePlus, Move, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { pickFiles } from '@/core/files';
import {
  Button,
  Field,
  FieldRow,
  Section,
  Segmented,
  Slider,
  ThumbnailImage,
  useToast,
} from '@/ui';
import { removePortrait, resetPlacement, set, setPortrait } from './actions';
import { PHOTO_ACCEPT, PhotoError } from './images';
import { buildLayout, cardBox, cardLimited } from './layout';
import { CARD_SIZE_DEFAULT, LIMITS, titleParts } from './model';
import { ctxMeasure } from './render';
import { gesture, useConfig, useGame, useSession } from './store';
import { S } from './strings';
import { LimitedInput, NextStep } from './widgets';

function TitlePreview() {
  const c = useConfig((s) => s.data);
  const p = titleParts(c);
  return (
    <div
      className="rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-2.5"
      data-testid="title-preview"
    >
      <p className="m-0 mb-1 text-xs tracking-wider text-muted">{S.titlePreview}</p>
      <p className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{p.first}</p>
      <p className="m-0 text-base font-bold [overflow-wrap:anywhere]">{p.second}</p>
      {p.third ? (
        <p className="m-0 text-base font-bold text-accent [overflow-wrap:anywhere]">{p.third}</p>
      ) : null}
    </div>
  );
}

let measureCtx: CanvasRenderingContext2D | null = null;
function CardSizeInfo() {
  const c = useConfig((s) => s.data);
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  const l = buildLayout(c, measureCtx ? ctxMeasure(measureCtx) : (t, s) => t.length * s);
  const s = Math.round(cardBox(l, c).s);
  return (
    <span className="text-xs text-muted tabular-nums" data-testid="card-size-info">
      {S.cardSizeInfo(s, cardLimited(l, c))}
    </span>
  );
}

function PortraitSection({ locked }: { locked: boolean }) {
  const c = useConfig((s) => s.data);
  const placing = useSession((s) => s.placing);
  const images = useSession((s) => s.images);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const photo = c.portrait.photo;
  const bmp = photo ? images[photo.id] : null;
  const pick = async () => {
    const [file] = await pickFiles({ accept: PHOTO_ACCEPT });
    if (!file) return;
    setBusy(true);
    try {
      const r = await setPortrait(file);
      toast({ title: S.portraitAdded, tone: 'info' });
      if (!r.persisted) toast({ title: S.notPersisted, tone: 'warning' });
    } catch (e) {
      toast({
        title: e instanceof PhotoError ? e.message : S.decodeError(file.name),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };
  const p = c.portrait;
  const pct = (v: number) => Math.round(v * 100);
  return (
    <Section
      title={S.portraitTitle}
      actions={<span className="text-xs text-muted">{S.portraitOptional}</span>}
      persistKey="rank-chart:portrait"
    >
      <div className="flex items-center gap-3" data-testid="portrait">
        <span className="flex h-17 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3 text-muted">
          {photo && bmp ? (
            <ThumbnailImage source={bmp} fit="cover" />
          ) : (
            <UserRound aria-hidden className="size-7" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              icon={<ImagePlus />}
              onClick={() => void pick()}
              disabled={locked}
              loading={busy}
            >
              {photo ? S.portraitReplace : S.portraitPick}
            </Button>
            {photo ? (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 />}
                onClick={removePortrait}
                disabled={locked}
              >
                {S.portraitRemove}
              </Button>
            ) : null}
          </div>
          {!photo ? <p className="m-0 text-xs text-muted">{S.portraitNone}</p> : null}
          {photo && bmp === null ? (
            <p className="m-0 text-xs text-danger">{S.photoMissing}</p>
          ) : null}
        </div>
      </div>
      {photo ? (
        <>
          <Button
            size="sm"
            variant={placing ? 'primary' : 'secondary'}
            icon={placing ? <Check /> : <Move />}
            aria-pressed={placing}
            disabled={locked}
            onClick={() => useSession.setState({ placing: !placing })}
            data-testid="placement-toggle"
          >
            {placing ? S.placementOff : S.placementOn}
          </Button>
          {placing && !locked ? (
            <div className="flex flex-col gap-3" data-testid="placement-controls">
              <p className="m-0 rounded-md bg-accent-soft px-3 py-2 text-xs">{S.placementHint}</p>
              <Field label={S.fit}>
                <Segmented<'cover' | 'contain'>
                  value={p.fit}
                  onValueChange={(v) =>
                    set((d) => {
                      d.portrait.fit = v;
                      d.portrait.x = 0;
                      d.portrait.y = 0;
                    })
                  }
                  options={[
                    { value: 'cover', label: S.fits.cover },
                    { value: 'contain', label: S.fits.contain },
                  ]}
                />
              </Field>
              <Field label={S.photoZoom}>
                <Slider
                  value={p.zoom}
                  min={1}
                  max={3}
                  step={0.01}
                  unit="×"
                  onChange={gesture.live((v) =>
                    set((d) => {
                      d.portrait.zoom = v;
                    }),
                  )}
                  onCommit={gesture.commit}
                />
              </Field>
              <FieldRow columns={2}>
                <Field label={S.photoX}>
                  <Slider
                    value={pct(p.x)}
                    min={-100}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={gesture.live((v) =>
                      set((d) => {
                        d.portrait.x = v / 100;
                      }),
                    )}
                    onCommit={gesture.commit}
                  />
                </Field>
                <Field label={S.photoY}>
                  <Slider
                    value={pct(p.y)}
                    min={-100}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={gesture.live((v) =>
                      set((d) => {
                        d.portrait.y = v / 100;
                      }),
                    )}
                    onCommit={gesture.commit}
                  />
                </Field>
              </FieldRow>
              <FieldRow columns={2}>
                <Field label={S.cardX}>
                  <Slider
                    value={pct(c.overlay.x)}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={gesture.live((v) =>
                      set((d) => {
                        d.overlay.x = v / 100;
                      }),
                    )}
                    onCommit={gesture.commit}
                  />
                </Field>
                <Field label={S.cardY}>
                  <Slider
                    value={pct(c.overlay.y)}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={gesture.live((v) =>
                      set((d) => {
                        d.overlay.y = v / 100;
                      }),
                    )}
                    onCommit={gesture.commit}
                  />
                </Field>
              </FieldRow>
              <Button
                size="sm"
                icon={<RotateCcw />}
                className="self-start"
                onClick={resetPlacement}
              >
                {S.resetPlacement}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <Field label={S.cardSize} hint={S.cardSizeHint}>
        <Slider
          value={Math.round(c.overlay.size * 100)}
          min={20}
          max={90}
          step={1}
          unit="%"
          disabled={locked}
          onChange={gesture.live((v) =>
            set((d) => {
              d.overlay.size = v / 100;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardSizeInfo />
        <Button
          size="sm"
          variant="ghost"
          disabled={locked}
          onClick={() =>
            set((d) => {
              d.overlay.size = CARD_SIZE_DEFAULT;
            })
          }
        >
          {S.cardSizeReset}
        </Button>
      </div>
    </Section>
  );
}

export function TopicTab() {
  const c = useConfig((s) => s.data);
  const locked = useGame((s) => s.data.run !== null);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.topicTitle} fixed>
        <Field label={S.name} hint={S.nameHint}>
          <LimitedInput
            field="name"
            value={c.name}
            max={LIMITS.name}
            disabled={locked}
            onChange={(v) =>
              set((d) => {
                d.name = v;
              })
            }
          />
        </Field>
        <Field label={S.intro} hint={S.introHint}>
          <LimitedInput
            field="intro"
            value={c.intro}
            max={LIMITS.intro}
            disabled={locked}
            onChange={(v) =>
              set((d) => {
                d.intro = v;
              })
            }
          />
        </Field>
        <Field label={S.subject} hint={S.subjectHint}>
          <LimitedInput
            field="subject"
            value={c.subject}
            max={LIMITS.subject}
            disabled={locked}
            onChange={(v) =>
              set((d) => {
                d.subject = v;
              })
            }
          />
        </Field>
        <Field label={S.question} hint={S.questionHint}>
          <LimitedInput
            field="question"
            value={c.question}
            max={LIMITS.question}
            disabled={locked}
            onChange={(v) =>
              set((d) => {
                d.question = v;
              })
            }
          />
        </Field>
        <TitlePreview />
      </Section>
      <PortraitSection locked={locked} />
      <NextStep to="pool" />
    </div>
  );
}
