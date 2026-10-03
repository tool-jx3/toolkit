/**
 * 詳細・感想側欄（F56～F69）：從右側滑出，編輯選取的團（不取消範例標記）。
 * 打字時先放在草稿（store 的 editRow：只有側欄重畫），停頓 300 ms、離開欄位或關閉側欄時寫回存檔，
 * 表格、統計、清單輸出在那時才更新（主控 7.1：2000 列時每鍵不比舊版慢）。選單與新增、刪除貼文或連結馬上寫回。
 * 日期、時間、系統、生還欄打字時保留打的字，看得懂才寫回正規值；離開欄位後顯示整理後的值。
 */
import { ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { type ComponentPropsWithRef, useEffect, useId, useMemo, useState } from 'react';
import {
  normalizeRowDates,
  normalizeTimeValue,
  SESSION_ROLES,
  SESSION_STATUSES,
  SESSION_SYSTEMS,
  type SessionRow,
  splitFlexibleDates,
  survivalLabel,
  systemLabel,
} from '@/core/sessions';
import {
  Button,
  Dialog,
  Field,
  FieldRow,
  IconButton,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import {
  classifyMediaUrl,
  isHttpUrl,
  mediaLinkLabel,
  survivalInput,
  systemFilterValues,
  systemInput,
} from './logic';
import { notify } from './notify';
import { sendToReport } from './send';
import {
  closeDetail,
  deleteRow,
  editRow,
  flushRowDraft,
  openEditDialog,
  type RowDraft,
  useActiveRow,
  useLog,
  useRowDraft,
  useUi,
} from './store';
import { S } from './strings';

const NONE = '__none';
const str = (v: unknown) => (v == null ? '' : String(v));

/** 打字時保留原文、看得懂才寫回的文字欄（離開欄位後顯示整理後的值） */
function DraftInput({
  value,
  onCommit,
  ...rest
}: Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      {...rest}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(e.target.value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function MediaSection({ row }: { row: SessionRow }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const media = row.media ?? [];
  const add = () => {
    const clean = url.trim();
    if (!clean) return;
    if (!isHttpUrl(clean)) {
      setError(true);
      return;
    }
    editRow(
      row.id,
      { media: [...media, { type: classifyMediaUrl(clean), url: clean, caption: '' }] },
      { immediate: true },
    );
    setUrl('');
    setError(false);
  };
  return (
    <section className="flex flex-col gap-2" aria-label={S.detail.media}>
      <h3 className="m-0 text-sm font-semibold">{S.detail.media}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field
          label={S.detail.mediaUrl}
          hint={S.detail.mediaHint}
          error={error ? S.detail.mediaBadUrl : undefined}
        >
          <div className="flex items-center gap-1.5">
            <TextInput
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(false);
              }}
            />
            <Button type="submit" icon={<Plus />}>
              {S.detail.mediaAdd}
            </Button>
          </div>
        </Field>
      </form>
      {media.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="media-list">
          {media.map((m, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 貼文沒有識別碼；只會在尾端新增、以位置刪除
              key={i}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2"
              data-media-type={m.type}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {m.type === 'image' ? (
                    <img
                      src={m.url}
                      alt={m.caption || S.detail.image}
                      loading="lazy"
                      className="block max-h-56 max-w-full rounded-sm"
                    />
                  ) : (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm"
                    >
                      {m.type === 'tweet' ? S.detail.xPost : mediaLinkLabel(m.url)}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </div>
                <IconButton
                  label={S.detail.removeMedia(i + 1)}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    editRow(row.id, { media: media.filter((_, j) => j !== i) }, { immediate: true })
                  }
                />
              </div>
              <TextInput
                aria-label={`${S.detail.caption} ${i + 1}`}
                placeholder={S.detail.captionPlaceholder}
                value={m.caption}
                onChange={(e) =>
                  editRow(row.id, {
                    media: media.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)),
                  })
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.detail.nothing}</p>
      )}
    </section>
  );
}

function LinksSection({ row }: { row: SessionRow }) {
  const links = row.cushionLinks ?? [];
  /* 新增、刪除馬上寫回；打字先放在草稿 */
  const set = (next: typeof links, immediate = false) =>
    editRow(row.id, { cushionLinks: next }, { immediate });
  return (
    <section className="flex flex-col gap-2" aria-label={S.detail.links}>
      <div className="flex items-center gap-2">
        <h3 className="m-0 flex-1 text-sm font-semibold">{S.detail.links}</h3>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => set([...links, { label: '', url: '' }], true)}
        >
          {S.detail.addLink}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.detail.linksHint}</p>
      {links.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="link-list">
          {links.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 連結沒有識別碼；只會在尾端新增、以位置刪除
            <li key={i} className="flex items-center gap-1.5">
              <TextInput
                aria-label={S.detail.linkLabel(i + 1)}
                placeholder={S.detail.linkLabelPlaceholder}
                value={l.label}
                onChange={(e) =>
                  set(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                className="w-28 shrink-0"
              />
              <TextInput
                aria-label={S.detail.linkUrl(i + 1)}
                placeholder="https://"
                value={l.url}
                onChange={(e) =>
                  set(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
              />
              {isHttpUrl(l.url) ? (
                <a
                  href={l.url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={S.detail.openLink(i + 1)}
                  title={S.detail.openLink(i + 1)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-accent hover:bg-surface-2"
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
              <IconButton
                label={S.detail.removeLink(i + 1)}
                icon={<X />}
                size="sm"
                variant="ghost"
                onClick={() =>
                  set(
                    links.filter((_, j) => j !== i),
                    true,
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.detail.nothing}</p>
      )}
    </section>
  );
}

const NO_PATCH: RowDraft['patch'] = Object.freeze({});

/** 存檔的列加上側欄還沒寫回的修改 */
function useDraftRow(saved: SessionRow): SessionRow {
  const patch = useRowDraft((s) => (s.id === saved.id ? s.patch : NO_PATCH));
  return useMemo(() => (patch === NO_PATCH ? saved : { ...saved, ...patch }), [saved, patch]);
}

function DetailBody({ row: saved }: { row: SessionRow }) {
  const row = useDraftRow(saved);
  const rows = useLog((s) => s.data.rows);
  const listId = useId();
  /* 換一團或關閉側欄時寫回 */
  useEffect(() => () => flushRowDraft(), []);
  const set = (key: string) => (e: { target: { value: string } }) =>
    editRow(row.id, { [key]: e.target.value });
  const systems = useMemo(
    () => [...new Set([...SESSION_SYSTEMS.map((s) => s.value), ...systemFilterValues(rows)])],
    [rows],
  );
  const datesText = normalizeRowDates(row).dates.join(', ');
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只接住欄位冒泡上來的 focusout（離開欄位時寫回草稿）
    <div className="flex flex-col gap-4" onBlur={() => flushRowDraft()}>
      <Field label={S.detail.scenario}>
        <TextInput
          value={str(row.scenario)}
          placeholder={S.detail.scenarioPlaceholder}
          onChange={set('scenario')}
          className="h-10 text-base font-semibold"
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.detail.dates}>
          <DraftInput
            value={datesText}
            placeholder="2026-06-14, 2026-06-21"
            onCommit={(text) => {
              const list = splitFlexibleDates(text);
              if (list.length) {
                const dates = [...new Set(list)].sort();
                editRow(row.id, { dates, date: dates[0] });
              } else if (!text.trim()) editRow(row.id, { dates: [], date: '' });
            }}
          />
        </Field>
        <Field label={S.detail.system}>
          <DraftInput
            value={systemLabel(row.system)}
            list={listId}
            onCommit={(text) => editRow(row.id, { system: systemInput(text) })}
          />
        </Field>
        <Field label={S.detail.role}>
          <Select
            value={SESSION_ROLES.includes(str(row.role)) ? str(row.role) : NONE}
            onValueChange={(v) =>
              editRow(row.id, { role: v === NONE ? '' : v }, { immediate: true })
            }
            options={[
              { value: NONE, label: S.detail.none },
              ...SESSION_ROLES.map((r) => ({ value: r, label: r })),
              ...(row.role && !SESSION_ROLES.includes(str(row.role))
                ? [{ value: str(row.role), label: str(row.role) }]
                : []),
            ]}
          />
        </Field>
        <Field label={S.detail.status}>
          <Select
            value={SESSION_STATUSES.some((s) => s.value === row.status) ? str(row.status) : NONE}
            onValueChange={(v) =>
              editRow(row.id, { status: v === NONE ? '' : v }, { immediate: true })
            }
            options={[
              { value: NONE, label: S.detail.none },
              ...SESSION_STATUSES.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />
        </Field>
        <Field label={S.detail.gm}>
          <TextInput value={str(row.gm)} onChange={set('gm')} />
        </Field>
        <Field label={S.detail.players}>
          <TextInput value={str(row.players)} onChange={set('players')} />
        </Field>
        <Field label={S.detail.pc}>
          <TextInput value={str(row.pc)} onChange={set('pc')} />
        </Field>
        <Field label={S.detail.time}>
          <DraftInput
            inputMode="decimal"
            value={str(row.time)}
            onCommit={(text) => editRow(row.id, { time: normalizeTimeValue(text) })}
          />
        </Field>
        <Field label={S.detail.ending}>
          <TextInput value={str(row.ending)} onChange={set('ending')} />
        </Field>
        <Field label={S.detail.survival}>
          <DraftInput
            value={survivalLabel(row.survival)}
            onCommit={(text) => editRow(row.id, { survival: survivalInput(text) })}
          />
        </Field>
      </FieldRow>
      <datalist id={listId}>
        {systems.map((v) => (
          <option key={v} value={systemLabel(v)} />
        ))}
      </datalist>
      <MediaSection row={row} />
      <Field label={S.detail.result}>
        <TextArea
          rows={3}
          value={str(row.result)}
          placeholder={S.detail.resultPlaceholder}
          onChange={set('result')}
        />
      </Field>
      <Field label={S.detail.longNote}>
        <TextArea
          rows={8}
          value={str(row.longNote)}
          placeholder={S.detail.longNotePlaceholder}
          onChange={set('longNote')}
        />
      </Field>
      <LinksSection row={row} />
      <Field label={S.detail.note}>
        <TextArea
          rows={2}
          value={str(row.note)}
          placeholder={S.detail.notePlaceholder}
          onChange={set('note')}
        />
      </Field>
    </div>
  );
}

export function DetailSheet() {
  const open = useUi((s) => s.detailOpen);
  const row = useActiveRow();
  /* 說明文字的劇本名稱跟著側欄還沒寫回的修改 */
  const draftScenario = useRowDraft((s) =>
    s.id && s.id === row?.id ? s.patch.scenario : undefined,
  );
  const scenario = str(draftScenario ?? row?.scenario);
  const confirm = useConfirm();
  const remove = async () => {
    if (!row) return;
    const ok = await confirm({
      title: S.dialog.deleteTitle,
      description: S.dialog.deleteDesc(scenario),
      confirmLabel: S.dialog.deleteConfirm,
      danger: true,
    });
    if (!ok) return;
    deleteRow(row.id);
    closeDetail();
    notify({ title: S.dialog.deleted, tone: 'success' });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeDetail();
      }}
      placement="right"
      size="lg"
      title={S.detail.title}
      description={row ? S.detail.description(scenario) : S.detail.emptyDesc}
      footer={
        row ? (
          <>
            <Button variant="danger" icon={<Trash2 />} onClick={remove} className="mr-auto">
              {S.detail.deleteSession}
            </Button>
            <Button
              onClick={() => {
                closeDetail();
                openEditDialog(row.id);
              }}
            >
              {S.detail.editAll}
            </Button>
            <Button onClick={() => void sendToReport(row.id)}>{S.detail.toReport}</Button>
            <Button
              variant="primary"
              onClick={() => {
                flushRowDraft();
                notify({ title: S.detail.saved, tone: 'success' });
              }}
            >
              {S.detail.save}
            </Button>
            <Button onClick={closeDetail}>{S.detail.close}</Button>
          </>
        ) : null
      }
    >
      {row ? (
        <DetailBody key={row.id} row={row} />
      ) : (
        <p className="m-0 text-sm text-muted">{S.detail.empty}</p>
      )}
    </Dialog>
  );
}
