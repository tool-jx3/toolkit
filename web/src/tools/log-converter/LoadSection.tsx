/**
 * 載入日誌（F01～F12）與輸出樣式（F13）：拖放／選檔、分析中與失敗的提示、檔案提示列、
 * 新格式的已載入檔案清單（移除、加入檔案）。
 */
import { FileText, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { pickFiles } from '@/core/files';
import { Button, Field, FileDrop, IconButton, Notice, Section, Segmented } from '@/ui';
import { addFiles, loadFiles, removeFile } from './actions';
import { channelDisplayName, fileUsage, sourceSpeakers, sourceTabs } from './load';
import type { OutputStyle } from './settings';
import { patchSettings, useSession, useSettings } from './store';
import { S } from './strings';

const ACCEPT = '.html,.htm,text/html';

function LoadedFiles() {
  const source = useSession((s) => s.source);
  const busy = useRef(false);
  if (source?.format !== 'v2') return null;
  const add = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const files = await pickFiles({ accept: ACCEPT, multiple: true });
      await addFiles(files);
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="flex flex-col gap-2" data-testid="loaded-files">
      <p className="m-0 text-xs text-muted">{S.load.loadedTitle(source.files.length)}</p>
      <ul
        className="m-0 flex list-none flex-col gap-1 p-0"
        aria-label={S.load.loadedTitle(source.files.length)}
      >
        {source.files.map((f, i) => {
          const usage = fileUsage(source, i);
          const tabs = f.log.channels.map((ch) => channelDisplayName(source, ch)).join('、');
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 同名檔案可以重複載入，位置就是識別
              key={`${f.name}-${i}`}
              className="flex min-w-0 items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs"
              data-file-row={i}
              data-usage={usage}
            >
              <FileText aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg" title={f.name}>
                  {f.name}
                </span>
                <span className="block truncate text-muted" data-testid="file-meta">
                  {S.load.fileRow(f.log.messages.length, tabs)}
                  {usage === 'dropped-multi' ? `（${S.load.fileUnused}）` : ''}
                  {usage === 'covered' ? `（${S.load.fileCovered}）` : ''}
                </span>
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.load.removeFile(f.name)}
                icon={<X />}
                onClick={() => void removeFile(i)}
              />
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        variant="secondary"
        icon={<Plus />}
        onClick={() => void add()}
        className="self-start"
      >
        {S.load.addFiles}
      </Button>
    </div>
  );
}

export function LoadSection() {
  const phase = useSession((s) => s.phase);
  const notice = useSession((s) => s.fileNotice);
  const source = useSession((s) => s.source);
  const style = useSettings((s) => s.data.style);
  const count = source ? source.messages.length : 0;
  return (
    <Section title={S.load.title} fixed>
      <FileDrop
        accept={ACCEPT}
        multiple
        paste="off"
        clickable
        label={S.load.drop}
        buttonLabel={S.load.button}
        hint={S.load.hint}
        onFiles={(files) => void loadFiles(files)}
        aria-label={S.load.title}
      />
      <div aria-live="polite" className="flex flex-col gap-2" data-testid="load-status">
        {phase === 'analyzing' && <Notice tone="progress">{S.load.analyzing}</Notice>}
        {phase === 'failed' && <Notice tone="danger">{S.load.analyzeFailed}</Notice>}
        {notice && (
          <Notice tone="warning">
            <span data-testid="file-notice">{notice}</span>
          </Notice>
        )}
        {phase === 'loaded' && source && (
          <p className="m-0 text-xs text-muted" data-testid="log-summary">
            <span className="mr-1 rounded-sm bg-accent-soft px-1.5 py-0.5 text-fg">
              {source.format === 'legacy' ? S.load.legacyBadge : S.load.v2Badge}
            </span>
            {S.load.summary(count, sourceSpeakers(source).length, sourceTabs(source).length)}
          </p>
        )}
      </div>
      <LoadedFiles />
      <Field label={S.style.label} hint={S.style.descriptions[style]}>
        <Segmented<OutputStyle>
          value={style}
          onValueChange={(v) => patchSettings({ style: v })}
          fullWidth
          options={(Object.keys(S.style.options) as OutputStyle[]).map((v) => ({
            value: v,
            label: S.style.options[v],
          }))}
        />
      </Field>
    </Section>
  );
}
