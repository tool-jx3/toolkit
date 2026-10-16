/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 編輯角色面板第三批的欄位：變體（衣櫃）與統一顏色、頭像框、角色字型、角色資訊與角色卡、看法
 * （原作的進階區：charVariant、unifyColors、fAvFrame、fCharFont、cardCopy、peSecViews）。
 */
import { BookOpen, ClipboardCopy } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { Button, Field, Select, TextInput, Toggle, useToast } from '@/ui';
import { displayName, type SheetCtx } from '../engine/geom';
import { charCardText } from '../logic/card';
import { variantName } from '../model/library';
import type { Char, CharFont, Sheet } from '../model/types';
import { updateChar } from '../state/actions';
import { newVariantFromChar, setUnified, setView, switchVariant } from '../state/libActions';
import { activeSheet, projectNow, setUi, useProject } from '../state/store';
import { S } from '../strings';
import { fontOptions } from './FontUi';
import { FrameSelect, followText } from './FrameUi';

const NEW = '__new';
const FOLLOW = '__follow';

/** 變體（衣櫃）＋確保是同一人（統一顏色） */
export function VariantFields({ c }: { c: Char }) {
  const entry = useProject((s) => s.data.library.find((e) => e.id === c.lib));
  if (!entry) return null;
  return (
    <div className="flex flex-col gap-2">
      <Field label={S.variant.label} hint={S.variant.hint}>
        <Select
          size="sm"
          value={String(c.vari)}
          onValueChange={(v) => {
            if (v === NEW) newVariantFromChar(c.id);
            else switchVariant(c.id, Number(v));
          }}
          options={[
            ...entry.variants.map((v) => ({ value: String(v.id), label: variantName(entry, v) })),
            { value: NEW, label: S.variant.add },
          ]}
          aria-label={S.variant.label}
          data-testid="char-variant"
        />
      </Field>
      <div title={S.variant.unifyHint} data-testid="char-unify">
        <Toggle
          checked={entry.unified}
          onCheckedChange={(on) => setUnified(c.id, on)}
          label={S.variant.unify}
        />
      </div>
    </div>
  );
}

/** 頭像框（寫在目前這件變體上） */
export function FrameField({ c, ctx }: { c: Char; ctx: SheetCtx }) {
  const frames = useProject((s) => s.data.frames);
  return (
    <Field label={S.frame.label} hint={S.frame.hint}>
      <FrameSelect
        kind="char"
        value={c.frame}
        followLabel={followText(ctx, c, frames)}
        onChange={(v) =>
          updateChar(c.id, (d) => {
            d.frame = v;
          })
        }
        testId="char-frame"
      />
    </Field>
  );
}

/** 角色字型（條目層級：跨分頁、跨變體） */
export function CharFontField({ c }: { c: Char }) {
  const fonts = useProject((s) => s.data.fonts);
  return (
    <Field label={S.font.charLabel} hint={S.font.charHint}>
      <Select
        size="sm"
        value={c.font || FOLLOW}
        onValueChange={(v) =>
          updateChar(c.id, (d) => {
            d.font = (v === FOLLOW ? '' : v) as CharFont;
          })
        }
        options={[{ value: FOLLOW, label: S.font.follow }, ...fontOptions(fonts)]}
        aria-label={S.font.charLabel}
        data-testid="char-font"
      />
    </Field>
  );
}

/** 角色資訊、複製角色卡 */
export function InfoCardButtons({ c }: { c: Char }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        icon={<BookOpen />}
        onClick={() => setUi({ panel: { kind: 'info', id: c.id } })}
        data-testid="char-info"
      >
        {S.info.open}
      </Button>
      <Button
        size="sm"
        icon={<ClipboardCopy />}
        title={S.card.tip}
        onClick={async () => {
          const text = charCardText(projectNow(), activeSheet(), c);
          if (!(await copyText(text))) {
            toast({ title: S.card.fail, tone: 'warning' });
            return;
          }
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1200);
        }}
        data-testid="char-card"
      >
        {copied ? S.card.copied : S.card.copy}
      </Button>
    </div>
  );
}

/** 一句話的看法：離開或 Enter 才寫入（清空＝刪除） */
function ViewInput({
  speaker,
  target,
  value,
  autoFocus,
}: {
  speaker: number;
  target: number;
  value: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  /* 剛挑了對象：等下拉選單把焦點還回去之後再聚焦到輸入欄 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在出現時聚焦一次
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => document.getElementById(id)?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  const commit = () => {
    if (draft !== value) setView(speaker, target, draft);
  };
  return (
    <TextInput
      id={id}
      value={draft}
      maxLength={120}
      placeholder={S.views.ph}
      aria-label={S.views.ph}
      className="h-7 min-w-0 flex-1 text-sm"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
      }}
      data-testid="view-input"
    />
  );
}

/** 看法：這個角色對本分頁其他角色的一句話（不必有關係線） */
export function ViewsSection({ c, sheet }: { c: Char; sheet: Sheet }) {
  /* 挑了、還沒寫的對象（還沒打字＝不進資料，面板關掉就散；原作也是） */
  const [pending, setPending] = useState<number[]>([]);
  const mine = sheet.views?.[c.id] ?? {};
  const byId = new Map(sheet.chars.map((x) => [x.id, x]));
  const written = sheet.chars.filter((x) => x.id !== c.id && mine[x.id]);
  const shown = [...written.map((x) => x.id), ...pending.filter((id) => !mine[id] && byId.has(id))];
  /* 候選：還沒寫、還沒挑的其他角色；有關係線的排前面，其餘照清單順序 */
  const linked = new Set<number>();
  for (const r of sheet.rels) {
    if (r.from === c.id) linked.add(r.to);
    if (r.to === c.id) linked.add(r.from);
  }
  const rest = sheet.chars.filter((x) => x.id !== c.id && !shown.includes(x.id));
  const cand = [...rest.filter((x) => linked.has(x.id)), ...rest.filter((x) => !linked.has(x.id))];
  return (
    <Field label={S.views.sec} hint={S.views.hint}>
      <div className="flex flex-col gap-1" data-testid="views-sec">
        {shown.map((id) => {
          const x = byId.get(id);
          if (!x) return null;
          const isPending = !mine[id];
          return (
            <div key={id} className="flex items-center gap-2" data-testid="view-row">
              <span className="max-w-24 shrink-0 truncate text-sm" title={displayName(x)}>
                {displayName(x)}
              </span>
              <ViewInput speaker={c.id} target={id} value={mine[id] ?? ''} autoFocus={isPending} />
            </div>
          );
        })}
        {cand.length ? (
          <Select
            size="sm"
            value=""
            placeholder={S.views.pick}
            onValueChange={(v) => setPending((p) => [...p, Number(v)])}
            options={cand.map((x) => ({ value: String(x.id), label: displayName(x) }))}
            aria-label={S.views.add}
            data-testid="view-add"
          />
        ) : null}
      </div>
    </Field>
  );
}
