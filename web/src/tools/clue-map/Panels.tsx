/**
 * 設定欄：「場景」（標題與導言、場景圖、範例與清空）、「熱點」（清單、選取的熱點）、「遊玩設定」。
 */
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  EyeOff,
  GripVertical,
  ImagePlus,
  Link2,
  Lock,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  GestureScope,
  IconButton,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  SortableList,
  TextArea,
  TextInput,
  ThumbChoice,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { loadClueFiles, loadSceneFiles, usePreviewSources } from './images';
import {
  BUILTIN_SCENES,
  type BuiltinSceneId,
  type ClueMapState,
  cleanImageUrl,
  FOUND_MARKS,
  type FoundMark,
  LIMITS,
  MARKERS,
  type Marker,
  multiLine,
  oneLine,
  PROGRESS_MODES,
  type ProgressMode,
  type Spot,
  sceneName,
  spotLabel,
  THEMES,
  type Theme,
  type UnreachableInfo,
  unreachable,
  urlImageName,
} from './model';
import { addNotice } from './notices';
import { renderBuiltinScene } from './scenes';
import {
  addSpot,
  clearSpots,
  duplicateSpot,
  edit,
  gesture,
  loadSample,
  moveSpot,
  patchSpot,
  removeSpot,
  selectSpot,
  setScene,
  setSpotBox,
  useClue,
  useUi,
} from './store';
import { S } from './strings';

const count = (s: string) => Array.from(s).length;

function useData<T>(pick: (d: ClueMapState) => T): T {
  return useClue((s) => pick(s.data));
}

/* ---------- 共用的欄位 ---------- */

/** 單行文字欄：從聚焦到離開算一步 */
function Line({
  label,
  value,
  max,
  placeholder,
  hint,
  onChange,
  inputRef,
  testId,
}: {
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  hint?: ReactNode;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  testId?: string;
}) {
  return (
    <Field label={label} hint={hint} labelSuffix={`${count(value)}／${max}`}>
      <TextInput
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(oneLine(e.target.value, max))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
    </Field>
  );
}

/** 多行文字欄：從聚焦到離開算一步 */
function Multi({
  label,
  value,
  max,
  rows,
  placeholder,
  hint,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  max: number;
  rows: number;
  placeholder?: string;
  hint?: ReactNode;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <Field label={label} hint={hint} labelSuffix={`${count(value)}／${max}`}>
      <TextArea
        rows={rows}
        value={value}
        placeholder={placeholder}
        data-testid={testId}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(multiLine(e.target.value, max))}
      />
    </Field>
  );
}

function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <GestureScope gesture={gesture}>
        <ColorField value={value} onChange={onChange} />
      </GestureScope>
    </Field>
  );
}

/** 網址欄＋按鈕（場景、線索圖片共用） */
function UrlField({
  label,
  buttonLabel,
  placeholder,
  onAdd,
  testId,
}: {
  label: string;
  buttonLabel: string;
  placeholder: string;
  onAdd: (url: string) => void;
  testId?: string;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const clean = cleanImageUrl(url);
    if (!clean) {
      setError(url.trim() ? S.urlInvalid : null);
      return;
    }
    onAdd(clean);
    setUrl('');
    setError(null);
  };
  return (
    <Field label={label} error={error ?? undefined}>
      <div className="flex min-w-0 gap-2">
        <TextInput
          className="min-w-0 flex-1"
          type="url"
          inputMode="url"
          value={url}
          placeholder={placeholder}
          maxLength={LIMITS.url}
          data-testid={testId}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button icon={<Link2 />} onClick={add}>
          {buttonLabel}
        </Button>
      </div>
    </Field>
  );
}

/* ---------- 場景 ---------- */

const thumbCache = new Map<BuiltinSceneId, ReturnType<typeof renderBuiltinScene>>();

/** 內建場景的縮圖（蓋滿裁切） */
function drawBuiltinThumb(ctx: CanvasRenderingContext2D, id: BuiltinSceneId | '') {
  if (!id) return;
  let src = thumbCache.get(id);
  if (!src) {
    src = renderBuiltinScene(id);
    thumbCache.set(id, src);
  }
  const { width: cw, height: ch } = ctx.canvas;
  const k = Math.max(cw / src.width, ch / src.height);
  const w = src.width * k;
  const h = src.height * k;
  ctx.drawImage(src, (cw - w) / 2, (ch - h) / 2, w, h);
}

export function SceneTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const title = useData((d) => d.title);
  const intro = useData((d) => d.intro);
  const scene = useData((d) => d.scene);
  const hasSpots = useData((d) => d.spots.length > 0);
  const { srcOf } = usePreviewSources([scene]);
  const src = srcOf(scene);

  const addFiles = async (files: File[]) => {
    const { loaded, notImages, failed } = await loadSceneFiles(files);
    const first = loaded[0];
    if (first) setScene(first.ref);
    const n = addNotice({
      added: first ? 1 : 0,
      notImages,
      failed,
      notSaved: loaded.some((l) => !l.persisted),
      title: S.scene.changed,
    });
    if (n) toast(n);
  };

  const askSample = async () => {
    const d = useClue.getState().data;
    if (
      d.spots.length &&
      !(await confirm({
        title: S.sampleConfirmTitle,
        description: S.sampleConfirmDesc,
        confirmLabel: S.sampleConfirmLabel,
      }))
    )
      return;
    loadSample();
    toast({ title: S.sampleLoaded, tone: 'success' });
  };

  const askClear = async () => {
    if (
      !(await confirm({
        title: S.clearConfirmTitle,
        description: S.clearConfirmDesc,
        confirmLabel: S.clearConfirmLabel,
        danger: true,
      }))
    )
      return;
    clearSpots();
    toast({ title: S.spotsCleared, tone: 'success' });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionBasic} persistKey="clue-map:basic">
        <Line
          label={S.title}
          value={title}
          max={LIMITS.title}
          placeholder={S.titlePlaceholder}
          testId="title-input"
          onChange={(v) =>
            edit((d) => {
              d.title = v;
            })
          }
        />
        <Multi
          label={S.intro}
          value={intro}
          max={LIMITS.intro}
          rows={3}
          placeholder={S.introPlaceholder}
          hint={S.introHint}
          testId="intro-input"
          onChange={(v) =>
            edit((d) => {
              d.intro = v;
            })
          }
        />
      </Section>
      <Section title={S.sectionSceneImage} persistKey="clue-map:scene">
        <div
          className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface-2 p-2"
          data-testid="scene-info"
        >
          <div className="checker size-16 shrink-0 overflow-hidden rounded-sm">
            {src ? <img alt="" src={src} className="size-full object-cover" /> : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-muted">{S.scene.current}</span>
            <span className="truncate text-sm font-medium" data-testid="scene-name">
              {sceneName(scene)}
            </span>
            <span className="text-xs text-muted">
              {scene.kind === 'builtin'
                ? S.scene.builtinTag
                : scene.kind === 'url'
                  ? S.scene.urlTag
                  : S.scene.size(scene.width, scene.height)}
            </span>
          </div>
          {scene.kind !== 'builtin' ? (
            <IconButton
              label={S.scene.remove}
              icon={<X />}
              onClick={() => setScene({ kind: 'builtin', id: 'paper' })}
            />
          ) : null}
        </div>
        <FileDrop
          aria-label={S.scene.dropLabel}
          accept="image/*"
          paste="off"
          compact
          icon={<ImagePlus />}
          label={S.scene.drop}
          buttonLabel={S.scene.choose}
          hint={S.scene.dropHint}
          filterByAccept={false}
          onFiles={(files) => void addFiles(files)}
        />
        <UrlField
          label={S.scene.urlLabel}
          buttonLabel={S.scene.urlAdd}
          placeholder={S.scene.urlPlaceholder}
          testId="scene-url"
          onAdd={(url) => setScene({ kind: 'url', url, name: urlImageName(url) })}
        />
        <Field label={S.scene.builtinTitle}>
          <ThumbChoice<BuiltinSceneId | ''>
            aria-label={S.scene.builtinTitle}
            value={scene.kind === 'builtin' ? scene.id : ''}
            onValueChange={(id) => {
              if (id) setScene({ kind: 'builtin', id });
            }}
            options={BUILTIN_SCENES.map((id) => ({
              value: id,
              label: S.scene.builtinName[id],
              description: S.scene.builtinHint[id],
            }))}
            draw={drawBuiltinThumb}
            thumbWidth={192}
            thumbHeight={128}
            minItemWidth={96}
          />
        </Field>
      </Section>
      <Section title={S.sectionSample} persistKey="clue-map:sample">
        <p className="m-0 text-xs text-muted">{S.sampleLoadHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void askSample()} data-testid="load-sample">
            {S.sampleLoad}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 />}
            disabled={!hasSpots}
            onClick={() => void askClear()}
            data-testid="clear-spots"
          >
            {S.clearSpots}
          </Button>
        </div>
      </Section>
    </div>
  );
}

/* ---------- 熱點的清單 ---------- */

function SpotTags({ spot, never }: { spot: Spot; never: boolean }) {
  const tags: { key: string; icon: ReactNode; text: string; warn?: boolean }[] = [];
  if (spot.hidden) tags.push({ key: 'h', icon: <EyeOff aria-hidden />, text: S.spot.tagHidden });
  if (spot.locked && spot.requires.length)
    tags.push({ key: 'l', icon: <Lock aria-hidden />, text: S.spot.tagLocked });
  if (spot.image) tags.push({ key: 'i', icon: <ImagePlus aria-hidden />, text: S.spot.tagImage });
  if (never)
    tags.push({ key: 'n', icon: <TriangleAlert aria-hidden />, text: S.spot.tagNever, warn: true });
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-x-2 text-xs text-muted">
      {tags.map((t) => (
        <span
          key={t.key}
          className={`inline-flex items-center gap-0.5 [&_svg]:size-3 ${t.warn ? 'text-warning' : ''}`}
        >
          {t.icon}
          {t.text}
        </span>
      ))}
    </span>
  );
}

function SpotList({ never }: { never: ReadonlySet<string> }) {
  const spots = useData((d) => d.spots);
  const selectedId = useUi((s) => s.selectedId);
  const full = spots.length >= LIMITS.spots;
  return (
    <Section title={S.sectionList(spots.length, LIMITS.spots)} persistKey="clue-map:list">
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Square />}
          disabled={full}
          onClick={() => addSpot('rect')}
          data-testid="add-rect"
        >
          {S.spot.addRect}
        </Button>
        <Button
          icon={<Circle />}
          disabled={full}
          onClick={() => addSpot('ellipse')}
          data-testid="add-ellipse"
        >
          {S.spot.addEllipse}
        </Button>
      </div>
      {full ? (
        <p className="m-0 text-xs text-muted" data-testid="spots-full">
          {S.spot.full(LIMITS.spots)}
        </p>
      ) : null}
      <SortableList<Spot>
        aria-label={S.spot.listLabel}
        items={spots}
        getId={(s) => s.id}
        selectedId={selectedId}
        onSelect={(id) => selectSpot(id)}
        onMove={moveSpot}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        handleOnly
        empty={S.spot.empty}
        renderItem={(s, { index }) => {
          const label = spotLabel(s, index);
          return (
            <div className="flex min-h-11 items-center gap-1.5 px-2 py-1" data-spot-row={s.id}>
              <span
                data-drag-handle
                aria-hidden
                className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
              >
                <GripVertical />
              </span>
              <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-contrast tabular-nums">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-sm ${s.name.trim() ? 'text-fg' : 'text-muted'}`}
                  title={label}
                >
                  {label}
                </span>
                <SpotTags spot={s} never={never.has(s.id)} />
              </span>
              <div className="flex shrink-0">
                <IconButton
                  size="sm"
                  label={S.spot.moveUpRow(label)}
                  icon={<ArrowUp />}
                  disabled={index === 0}
                  onClick={() => {
                    gesture.begin();
                    moveSpot(index, index - 1);
                    gesture.commit();
                  }}
                />
                <IconButton
                  size="sm"
                  label={S.spot.moveDownRow(label)}
                  icon={<ArrowDown />}
                  disabled={index === spots.length - 1}
                  onClick={() => {
                    gesture.begin();
                    moveSpot(index, index + 1);
                    gesture.commit();
                  }}
                />
                <IconButton
                  size="sm"
                  label={S.spot.removeRow(label)}
                  icon={<Trash2 />}
                  onClick={() => removeSpot(s.id)}
                />
              </div>
            </div>
          );
        }}
      />
    </Section>
  );
}

/* ---------- 選取的熱點 ---------- */

function ClueImageField({ spot }: { spot: Spot }) {
  const toast = useToast();
  const image = spot.image;
  const { srcOf } = usePreviewSources(image ? [image] : []);
  const set = (next: Spot['image']) => patchSpot(spot.id, { image: next });
  const addFiles = async (files: File[]) => {
    const { loaded, notImages, failed } = await loadClueFiles(files);
    const first = loaded[0];
    if (first) set(first.ref);
    const n = addNotice({
      added: first ? 1 : 0,
      notImages,
      failed,
      notSaved: loaded.some((l) => !l.persisted),
      title: S.spot.imageAdded,
    });
    if (n) toast(n);
  };
  return (
    <Field label={S.spot.image} hint={S.spot.imageHint}>
      {image ? (
        <div
          className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface-2 p-2"
          data-testid="clue-image"
        >
          <div className="checker size-14 shrink-0 overflow-hidden rounded-sm">
            {srcOf(image) ? (
              <img alt="" src={srcOf(image)} className="size-full object-cover" />
            ) : null}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm">
            {image.name || (image.kind === 'url' ? image.url : '')}
          </span>
          <Button size="sm" icon={<X />} onClick={() => set(null)}>
            {S.spot.imageRemove}
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2" data-clue-drop>
          <FileDrop
            aria-label={S.spot.imageDrop}
            accept="image/*"
            paste="focus"
            compact
            icon={<ImagePlus />}
            label={S.spot.imageDrop}
            buttonLabel={S.spot.imageChoose}
            filterByAccept={false}
            onFiles={(files) => void addFiles(files)}
          />
          <UrlField
            label={S.spot.imageUrlLabel}
            buttonLabel={S.spot.imageUrlAdd}
            placeholder={S.spot.imageUrlPlaceholder}
            testId="clue-image-url"
            onAdd={(url) => set({ kind: 'url', url, name: urlImageName(url) })}
          />
        </div>
      )}
    </Field>
  );
}

function UnlockFields({ spot, info }: { spot: Spot; info: UnreachableInfo | undefined }) {
  const spots = useData((d) => d.spots);
  const others = spots.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== spot.id);
  const names = (ids: string[]) =>
    ids
      .map((id) => spots.findIndex((x) => x.id === id))
      .filter((i) => i >= 0)
      .map((i) => spotLabel(spots[i], i))
      .join('、');
  return (
    <>
      <Field label={S.spot.unlockMode}>
        <Segmented<'always' | 'locked'>
          aria-label={S.spot.unlockMode}
          value={spot.locked ? 'locked' : 'always'}
          onValueChange={(v) => patchSpot(spot.id, { locked: v === 'locked' })}
          options={[
            { value: 'always', label: S.spot.unlockAlways },
            { value: 'locked', label: S.spot.unlockLocked },
          ]}
        />
      </Field>
      <Show when={spot.locked}>
        <Field label={S.spot.requireMode}>
          <Segmented<'all' | 'any'>
            aria-label={S.spot.requireModeAria}
            value={spot.mode}
            onValueChange={(v) => patchSpot(spot.id, { mode: v })}
            options={[
              { value: 'all', label: S.spot.requireAll },
              { value: 'any', label: S.spot.requireAny },
            ]}
          />
        </Field>
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 p-0 text-xs font-medium text-muted">
            {S.spot.requiresLabel}
          </legend>
          {others.length ? (
            others.map(({ s, i }) => (
              <Checkbox
                key={s.id}
                checked={spot.requires.includes(s.id)}
                onCheckedChange={(on) =>
                  patchSpot(spot.id, {
                    requires: on
                      ? [...spot.requires.filter((r) => r !== s.id), s.id]
                      : spot.requires.filter((r) => r !== s.id),
                  })
                }
                label={S.spot.requiresItem(i + 1, spotLabel(s, i))}
              />
            ))
          ) : (
            <p className="m-0 text-xs text-muted">{S.spot.requiresNone}</p>
          )}
        </fieldset>
        {spot.requires.length === 0 ? <Notice tone="warning">{S.spot.requiresEmpty}</Notice> : null}
      </Show>
      {info ? (
        <Notice tone="warning">
          <span data-testid="never-warning">
            {S.spot.never}
            {info.blockers.length ? S.spot.neverBlocked(names(info.blockers)) : S.spot.neverCycle}
          </span>
        </Notice>
      ) : null}
    </>
  );
}

function SpotDetail({ spot, index, info }: { spot: Spot; index: number; info?: UnreachableInfo }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const focusName = useUi((s) => s.focusName);
  useEffect(() => {
    if (focusName !== spot.id) return;
    nameRef.current?.focus();
    nameRef.current?.select();
    useUi.setState({ focusName: null });
  }, [focusName, spot.id]);
  const full = useData((d) => d.spots.length >= LIMITS.spots);
  const label = spotLabel(spot, index);
  const setBox = (patch: Partial<Pick<Spot, 'x' | 'y' | 'w' | 'h'>>) =>
    setSpotBox(spot.id, { x: spot.x, y: spot.y, w: spot.w, h: spot.h, ...patch });
  const pos = (k: 'x' | 'y' | 'w' | 'h') => (
    <Field label={S.spot.pos[k]}>
      <NumberInput
        value={spot[k]}
        min={k === 'w' || k === 'h' ? LIMITS.minSize : 0}
        max={100}
        step={0.1}
        precision={1}
        unit={S.percent}
        onChange={gesture.live((v: number) => setBox({ [k]: v }))}
        onCommit={gesture.commit}
        data-testid={`pos-${k}`}
      />
    </Field>
  );
  return (
    <>
      <Section title={S.sectionDetail(label)} persistKey="clue-map:detail">
        <Line
          label={S.spot.name}
          value={spot.name}
          max={LIMITS.name}
          placeholder={S.spot.defaultName(index + 1)}
          inputRef={nameRef}
          testId="spot-name"
          onChange={(v) => patchSpot(spot.id, { name: v })}
        />
        <Field label={S.spot.shape}>
          <Segmented<'rect' | 'ellipse'>
            aria-label={S.spot.shape}
            value={spot.shape}
            onValueChange={(v) => patchSpot(spot.id, { shape: v })}
            options={[
              { value: 'rect', label: S.spot.shapes.rect, icon: <Square /> },
              { value: 'ellipse', label: S.spot.shapes.ellipse, icon: <Circle /> },
            ]}
          />
        </Field>
        <FieldRow columns={2}>
          {pos('x')}
          {pos('y')}
        </FieldRow>
        <FieldRow columns={2}>
          {pos('w')}
          {pos('h')}
        </FieldRow>
        <p className="m-0 text-xs text-muted">{S.spot.posHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Copy />}
            disabled={full}
            onClick={() => duplicateSpot(spot.id)}
            data-testid="duplicate-spot"
          >
            {S.spot.copy}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 />}
            onClick={() => removeSpot(spot.id)}
            data-testid="remove-spot"
          >
            {S.spot.remove}
          </Button>
        </div>
      </Section>
      <Section title={S.sectionClue} persistKey="clue-map:clue">
        <Multi
          label={S.spot.text}
          value={spot.text}
          max={LIMITS.text}
          rows={6}
          placeholder={S.spot.textPlaceholder}
          hint={S.spot.textHint}
          testId="spot-text"
          onChange={(v) => patchSpot(spot.id, { text: v })}
        />
        <ClueImageField spot={spot} />
        <Line
          label={S.spot.check}
          value={spot.check}
          max={LIMITS.check}
          placeholder={S.spot.checkPlaceholder}
          hint={S.spot.checkHint}
          testId="spot-check"
          onChange={(v) => patchSpot(spot.id, { check: v })}
        />
        <Multi
          label={S.spot.memo}
          value={spot.memo}
          max={LIMITS.memo}
          rows={3}
          placeholder={S.spot.memoPlaceholder}
          hint={S.spot.memoHint}
          testId="spot-memo"
          onChange={(v) => patchSpot(spot.id, { memo: v })}
        />
      </Section>
      <Section title={S.sectionUnlock} persistKey="clue-map:unlock">
        <UnlockFields spot={spot} info={info} />
        <Field label={S.spot.hidden} layout="inline" hint={S.spot.hiddenHint}>
          <Toggle
            checked={spot.hidden}
            onCheckedChange={(v) => patchSpot(spot.id, { hidden: v })}
          />
        </Field>
      </Section>
    </>
  );
}

export function SpotsTab() {
  const spots = useData((d) => d.spots);
  const selectedId = useUi((s) => s.selectedId);
  const issues = unreachable(spots);
  const never = new Set(issues.map((i) => i.id));
  const index = spots.findIndex((s) => s.id === selectedId);
  const spot = index >= 0 ? spots[index] : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SpotList never={never} />
      {spot ? (
        <SpotDetail
          key={spot.id}
          spot={spot}
          index={index}
          info={issues.find((i) => i.id === spot.id)}
        />
      ) : (
        <p className="m-0 rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
          {S.spot.selectHint}
        </p>
      )}
    </div>
  );
}

/* ---------- 遊玩設定 ---------- */

export function LookTab() {
  const look = useData((d) => d.look);
  const set = (patch: Partial<ClueMapState['look']>) =>
    edit((d) => {
      Object.assign(d.look, patch);
    });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionPlayLook} persistKey="clue-map:look">
        <Field label={S.look.theme}>
          <Segmented<Theme>
            aria-label={S.look.theme}
            value={look.theme}
            onValueChange={(v) => set({ theme: v })}
            options={THEMES.map((t) => ({ value: t, label: S.look.themes[t] }))}
          />
        </Field>
        <Field label={S.look.marker} hint={S.look.markerHint}>
          <Segmented<Marker>
            aria-label={S.look.marker}
            value={look.marker}
            onValueChange={(v) => set({ marker: v })}
            options={MARKERS.map((t) => ({ value: t, label: S.look.markers[t] }))}
          />
        </Field>
        <FieldRow columns={2}>
          <Color label={S.look.accent} value={look.accent} onChange={(v) => set({ accent: v })} />
          <Color
            label={S.look.foundColor}
            value={look.foundColor}
            onChange={(v) => set({ foundColor: v })}
          />
        </FieldRow>
        <Field label={S.look.foundMark}>
          <Select<FoundMark>
            value={look.foundMark}
            onValueChange={(v) => set({ foundMark: v })}
            options={FOUND_MARKS.map((t) => ({ value: t, label: S.look.foundMarks[t] }))}
          />
        </Field>
        <Field label={S.look.names} layout="inline" hint={S.look.namesHint}>
          <Toggle checked={look.names} onCheckedChange={(v) => set({ names: v })} />
        </Field>
      </Section>
      <Section title={S.sectionPlayRules} persistKey="clue-map:rules">
        <Field label={S.look.progress}>
          <Select<ProgressMode>
            value={look.progress}
            onValueChange={(v) => set({ progress: v })}
            options={PROGRESS_MODES.map((t) => ({ value: t, label: S.look.progresses[t] }))}
          />
        </Field>
        <Field label={S.look.reveal} layout="inline" hint={S.look.revealHint}>
          <Toggle checked={look.reveal} onCheckedChange={(v) => set({ reveal: v })} />
        </Field>
      </Section>
    </div>
  );
}
