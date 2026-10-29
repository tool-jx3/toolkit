/**
 * KP 對照表（規格 F50～F56）：設定欄的 ComparePanel（加入成員、成員清單）＋預覽欄的 CompareTable（對照表、篩選、摘要）。
 * 成員存在瀏覽器（useView，不列入復原；移出有「復原」通知）。
 */
import { FileUp, Link2, Trash2, UserPlus } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { pickFiles, readAsBytes } from '@/core/files';
import { parseProjectBytes } from '@/core/storage';
import {
  Button,
  cn,
  Field,
  IconButton,
  Section,
  Segmented,
  TextArea,
  TextInput,
  TextOutputPanel,
  useConfirm,
  useToast,
} from '@/ui';
import { addMembers, clearMembers, removeMember, renameMember } from './actions';
import {
  type CompareFilter,
  compareGroups,
  compareSummary,
  countStatus,
  filterGroups,
  MAX_MEMBERS,
  MEMBER_NAME_MAX,
  type Member,
  memberFrom,
  ROW_STATUSES,
  type RowStatus,
} from './compare';
import { LEVEL_UI } from './LevelPicker';
import { normalizeData, TOOL_ID } from './model';
import { sharesInText } from './share';
import { profileNow, useView } from './store';
import { OUT, S } from './strings';

/**
 * 列的底色（第一欄固定在左邊，要不透明：淡色疊在 surface 上）。有底色的列裡的字一律用 text-fg
 * （「沒填」是虛線框的小標籤、補充也是 fg），深色主題的黃、紅列上灰字的對比不夠（pl-profile 驗證後修正）。
 */
const STATUS_BG: Record<RowStatus, string> = {
  ng: '[background:linear-gradient(var(--danger-soft),var(--danger-soft)),var(--surface)]',
  ask: '[background:linear-gradient(var(--warning-soft),var(--warning-soft)),var(--surface)]',
  good: '[background:linear-gradient(var(--success-soft),var(--success-soft)),var(--surface)]',
  missing: 'bg-surface-2',
  neutral: 'bg-surface',
};

const STATUS_BAR: Record<RowStatus, string> = {
  ng: 'border-l-danger',
  ask: 'border-l-warning',
  good: 'border-l-success',
  missing: 'border-l-border',
  neutral: 'border-l-transparent',
};

const fileStem = (name: string) => name.replace(/\.[^.]+$/, '');

/** 加入的結果合成一則通知 */
function useReport() {
  const toast = useToast();
  return (
    r: { added: Member[]; dupes: string[]; over: number },
    extra: { broken?: number; badFiles?: string[]; noLinks?: boolean } = {},
  ) => {
    const notes: string[] = [];
    if (extra.noLinks) notes.push(S.compare.noLinks);
    if (extra.broken) notes.push(S.compare.badLinks(extra.broken));
    if (extra.badFiles?.length) notes.push(S.compare.badFiles(extra.badFiles.join(OUT.sep)));
    if (r.dupes.length) notes.push(S.compare.dupes(r.dupes.join(OUT.sep)));
    if (r.over) notes.push(S.compare.over(r.over, MAX_MEMBERS));
    toast({
      title: r.added.length ? S.compare.added(r.added.length) : S.compare.addedNone,
      description: notes.length ? notes.join('') : undefined,
      tone: !notes.length
        ? 'success'
        : r.added.length || !(extra.broken || extra.badFiles?.length || extra.noLinks)
          ? 'warning'
          : 'danger',
      replace: true,
    });
  };
}

function MemberRow({ m }: { m: Member }) {
  const toast = useToast();
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-2"
      data-member={m.id}
    >
      <div className="flex items-center gap-2">
        <TextInput
          aria-label={S.compare.rename(m.name)}
          value={m.name}
          maxLength={MEMBER_NAME_MAX}
          onChange={(e) => renameMember(m.id, e.target.value)}
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          {S.compare.sources[m.source]}
        </span>
        <IconButton
          size="sm"
          label={S.compare.remove(m.name)}
          icon={<Trash2 />}
          onClick={() => {
            const undo = removeMember(m.id);
            toast({
              title: S.compare.removed(m.name),
              tone: 'info',
              replace: true,
              action: { label: S.compare.restore, onClick: undo },
            });
          }}
        />
      </div>
      {m.jirai.memo.trim() ? (
        <p className="m-0 line-clamp-2 text-xs text-muted" title={m.jirai.memo}>
          {m.jirai.memo}
        </p>
      ) : null}
    </li>
  );
}

/** 設定欄：加入成員、成員清單 */
export function ComparePanel() {
  const members = useView((s) => s.data.members);
  const [links, setLinks] = useState('');
  const report = useReport();
  const confirm = useConfirm();
  const hasSelf = members.some((m) => m.source === 'self');
  const fallback = (n: number) => `PL ${members.length + n}`;

  const addLinks = () => {
    const found = sharesInText(links);
    if (!found.found) {
      report({ added: [], dupes: [], over: 0 }, { noLinks: true });
      return;
    }
    const list = found.data.map((d, i) => memberFrom(d, 'link', fallback(i + 1)));
    const r = addMembers(list);
    report(r, { broken: found.broken });
    if (r.added.length && !found.broken) setLinks('');
  };

  const openFiles = async () => {
    const files = await pickFiles({
      accept: '.json,.zip,application/json,application/zip',
      multiple: true,
    });
    if (!files.length) return;
    const list: Member[] = [];
    const bad: string[] = [];
    for (const f of files) {
      try {
        const parsed = parseProjectBytes(await readAsBytes(f), TOOL_ID);
        list.push(memberFrom(normalizeData(parsed.data), 'file', fileStem(f.name)));
      } catch {
        bad.push(f.name);
      }
    }
    report(addMembers(list), { badFiles: bad });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.compare.lead}</p>
      <Section title={S.compare.links} persistKey="pl-profile:compare-add">
        <Field label={S.compare.links}>
          <TextArea
            value={links}
            rows={3}
            placeholder={S.compare.linksPh}
            onChange={(e) => setLinks(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={<Link2 />}
            disabled={!links.trim()}
            onClick={addLinks}
          >
            {S.compare.addLinks}
          </Button>
          <Button size="sm" icon={<FileUp />} onClick={() => void openFiles()}>
            {S.compare.openFiles}
          </Button>
          <Button
            size="sm"
            icon={<UserPlus />}
            onClick={() => report(addMembers([memberFrom(profileNow(), 'self', fallback(1))]))}
          >
            {hasSelf ? S.compare.updateSelf : S.compare.addSelf}
          </Button>
        </div>
      </Section>
      <Section
        title={S.compare.members}
        persistKey="pl-profile:compare-members"
        actions={
          <span className="text-xs text-muted tabular-nums" data-testid="member-count">
            {S.compare.membersCount(members.length, MAX_MEMBERS)}
          </span>
        }
      >
        {members.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.compare.members}>
            {members.map((m) => (
              <MemberRow key={m.id} m={m} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.compare.empty}</p>
        )}
        {members.length ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            className="self-start"
            onClick={async () => {
              if (
                await confirm({
                  title: S.compare.clearTitle,
                  description: S.compare.clearDesc,
                  confirmLabel: S.compare.clearConfirm,
                  danger: true,
                })
              )
                clearMembers();
            }}
          >
            {S.compare.clear}
          </Button>
        ) : null}
      </Section>
    </div>
  );
}

function StatusLegend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted">
      {ROW_STATUSES.map((st) => (
        <li key={st} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              'inline-block size-3 rounded-sm border border-l-4 border-border',
              STATUS_BG[st],
              STATUS_BAR[st],
            )}
          />
          {S.compare.legend[st]}
        </li>
      ))}
    </ul>
  );
}

/** 預覽欄：對照表 */
export function CompareTable() {
  const members = useView((s) => s.data.members);
  const filter = useView((s) => s.data.compareFilter);
  const patch = useView((s) => s.patch);
  const groups = useMemo(() => compareGroups(members), [members]);
  const shown = useMemo(() => filterGroups(groups, filter), [groups, filter]);
  const counts = countStatus(groups);
  const summary = useMemo(
    () =>
      compareSummary(members, groups, {
        title: S.compare.title,
        ng: S.compare.summaryNg,
        ask: S.compare.summaryAsk,
        none: S.compare.summaryNone,
      }),
    [members, groups],
  );

  if (!members.length)
    return (
      <section aria-label={S.compare.title} className="flex flex-col gap-2" data-testid="compare">
        <h2 className="m-0 text-base font-bold text-fg">{S.compare.title}</h2>
        <p className="m-0 text-sm text-muted">{S.compare.empty}</p>
      </section>
    );

  return (
    <section
      aria-label={S.compare.title}
      className="flex min-w-0 flex-col gap-3"
      data-testid="compare"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-bold text-fg">{S.compare.title}</h2>
        <p className="m-0 text-sm text-fg" data-testid="compare-summary" aria-live="polite">
          {S.compare.summary(counts.ng, counts.ask)}
        </p>
        <StatusLegend />
      </div>
      <Field label={S.compare.filter}>
        <Segmented<CompareFilter>
          value={filter}
          onValueChange={(v) => patch({ compareFilter: v })}
          options={(['all', 'issues', 'mixed'] as const).map((f) => ({
            value: f,
            label: S.compare.filters[f],
          }))}
          size="sm"
        />
      </Field>
      {shown.length ? (
        <section
          className="max-h-[min(70dvh,900px)] overflow-auto rounded-md border border-border"
          aria-label={S.compare.tableAria}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 可以捲動的區域要能用鍵盤捲動
          tabIndex={0}
        >
          <table className="w-max min-w-full border-collapse text-sm" data-testid="compare-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-20 min-w-36 border-b border-border bg-surface-2 px-2 py-1.5 text-left font-semibold text-fg"
                >
                  {S.compare.topic}
                </th>
                {members.map((m) => (
                  <th
                    key={m.id}
                    scope="col"
                    className="sticky top-0 z-10 min-w-20 border-b border-border bg-surface-2 px-2 py-1.5 text-center font-semibold text-fg"
                  >
                    {m.name || '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={members.length + 1}
                      className="sticky left-0 border-b border-border bg-surface-3 px-2 py-1 text-left text-xs font-semibold text-muted"
                    >
                      {g.name}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.key} data-status={r.status} data-row={r.label}>
                      <th
                        scope="row"
                        className={cn(
                          'sticky left-0 z-[5] max-w-56 border-b border-l-4 border-border px-2 py-1.5 text-left font-normal text-fg',
                          STATUS_BG[r.status],
                          STATUS_BAR[r.status],
                        )}
                      >
                        {r.label}
                        {r.builtin ? null : (
                          <span className="ml-1 rounded-sm border border-border-strong px-1 text-xs text-fg">
                            {S.compare.customTag}
                          </span>
                        )}
                      </th>
                      {r.cells.map((c, i) => (
                        <td
                          key={members[i].id}
                          className={cn(
                            'border-b border-border px-1.5 py-1 text-center align-top',
                            STATUS_BG[r.status],
                          )}
                          data-level={c.level ?? ''}
                          title={c.note || undefined}
                        >
                          {c.level ? (
                            <span
                              data-on="true"
                              className={cn(
                                'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold',
                                LEVEL_UI[c.level],
                              )}
                            >
                              <span aria-hidden>{OUT.symbols[c.level]}</span>
                              {OUT.levels[c.level]}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs text-fg">
                              {S.compare.unset}
                            </span>
                          )}
                          {c.note ? (
                            <span className="mt-0.5 block max-w-40 text-left text-xs leading-snug text-fg">
                              {c.note}
                            </span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="m-0 text-sm text-muted">{S.compare.noRows}</p>
      )}
      <TextOutputPanel
        text={summary}
        title={S.compare.copyTitle}
        copyLabel={S.compare.copy}
        count={null}
      />
    </section>
  );
}
