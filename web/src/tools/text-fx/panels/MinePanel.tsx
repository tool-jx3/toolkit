/**
 * 「模式」分頁的「我的範本」（P11 新增）：把目前的設定存成範本、套用、改名、刪除、匯出成範本檔、讀入範本檔。
 * 範本依模式分開列出（存在瀏覽器，見 mine.ts）。
 */
import { Download, FileJson } from 'lucide-react';
import { downloadText, fileNameWithExt } from '@/core/files';
import { Button, FileDrop, IconButton, ItemListEditor, Section, useToast } from '@/ui';
import { textHead } from '../filename';
import { templateById } from '../library';
import {
  type MyTemplate,
  readTemplateFiles,
  templatesFileBase,
  templatesFileText,
  useMine,
} from '../mine';
import { INTRO } from '../motion';
import { FLOW_NAMES, MODES } from '../settings';
import { applyMine, importMine, removeMine, renameMine, saveMine, useTfx } from '../store';
import { S } from '../strings';
import { useSettingsThumbs } from '../thumbs';

/** 一個範本的說明：文字開頭・效果（長文是流程） */
function metaOf(t: MyTemplate): string {
  const s = t.s;
  const fx =
    s.introOn === false && !(s.mode === 'long' && s.flow.kind === 'scroll')
      ? '無登場'
      : s.mode === 'long'
        ? FLOW_NAMES[s.flow.kind]
        : (INTRO[s.intro.fx] || INTRO.fade).name;
  return S.mine.meta(textHead(s.text) || textHead(s.sub), fx);
}

function exportTemplates(items: readonly MyTemplate[]): void {
  if (!items.length) return;
  downloadText(
    templatesFileText(items),
    fileNameWithExt(templatesFileBase(items), 'json', { fallback: 'text-fx-templates' }),
    'application/json;charset=utf-8',
  );
}

export function MinePanel() {
  const toast = useToast();
  const mode = useTfx((st) => st.data.mode);
  const entry = useTfx((st) => st.data.modes[st.data.mode]);
  const all = useMine((st) => st.data.items);
  const items = all.filter((t) => t.mode === mode);
  const others = all.length - items.length;
  const thumbs = useSettingsThumbs(items.map((t) => ({ key: `mine:${t.id}`, cfg: t.s })));
  const activeId = entry.mine && items.some((t) => t.id === entry.mine) ? entry.mine : null;

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const r = await readTemplateFiles(files);
    importMine(r.parsed);
    /* 同一批的結果合成一則通知（失敗不會被成功的通知蓋掉） */
    const lines: string[] = [];
    const elsewhere = MODES.filter(([m]) => m !== mode)
      .map(([m, name]) => [name, r.parsed.filter((p) => p.mode === m).length] as const)
      .filter(([, n]) => n > 0);
    if (elsewhere.length)
      lines.push(S.mine.perMode(elsewhere.map(([name, n]) => `${name} ${n} 個`).join('、')));
    if (r.skipped) lines.push(S.mine.skipped(r.skipped));
    for (const f of r.failures) lines.push(`${f.name}：${f.message}`);
    const ok = r.parsed.length;
    const bad = r.failures.length;
    toast({
      title: !bad
        ? S.mine.imported(ok)
        : ok
          ? S.mine.importedPart(ok, bad)
          : S.mine.importFailed(bad),
      description: lines.length
        ? lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))
        : undefined,
      tone: !bad ? 'success' : ok ? 'warning' : 'danger',
    });
  };

  return (
    <Section title={S.mine.title} description={S.mine.note} persistKey="text-fx:mine">
      <div data-mine-ready={thumbs.ready ? 'true' : 'false'} className="flex flex-col gap-3">
        <ItemListEditor<MyTemplate>
          aria-label={S.mine.listLabel}
          items={items}
          getId={(t) => t.id}
          getName={(t) => t.name}
          placeholder={S.mine.unnamed}
          renameLabel={S.mine.rename}
          selectedId={activeId}
          onAdd={() => {
            const d = useTfx.getState().data;
            const cur = d.modes[d.mode];
            saveMine(
              textHead(cur.s.text) || textHead(cur.s.sub) || templateById(d.mode, cur.tpl).name,
            );
          }}
          addLabel={S.mine.add}
          onRename={renameMine}
          onRemove={removeMine}
          confirmRemove={(t) => ({
            title: S.mine.removeTitle(t.name.trim() || S.mine.unnamed),
            description: S.mine.removeDesc,
          })}
          renderLeading={(t) => (
            <span className="flex h-9 w-16 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-2">
              {thumbs.urls[`mine:${t.id}`] ? (
                <img
                  src={thumbs.urls[`mine:${t.id}`]}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : null}
            </span>
          )}
          renderMeta={(t) => <span className="block truncate">{metaOf(t)}</span>}
          renderActions={(t) => (
            <>
              <Button
                size="sm"
                variant={t.id === activeId ? 'primary' : 'secondary'}
                aria-pressed={t.id === activeId}
                aria-label={`${S.mine.apply}「${t.name.trim() || S.mine.unnamed}」`}
                onClick={() => applyMine(t.id)}
              >
                {t.id === activeId ? S.mine.applied : S.mine.apply}
              </Button>
              <IconButton
                size="sm"
                icon={<Download />}
                label={S.mine.exportOne(t.name.trim() || S.mine.unnamed)}
                onClick={() => exportTemplates([t])}
              />
            </>
          )}
          emptyText={S.mine.empty}
        />
        {others > 0 ? <p className="m-0 text-xs text-muted">{S.mine.otherModes(others)}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<Download />}
            disabled={!all.length}
            onClick={() => exportTemplates(all)}
          >
            {S.mine.exportAll(all.length)}
          </Button>
        </div>
        <FileDrop
          compact
          multiple
          accept=".json,application/json"
          paste="off"
          icon={<FileJson />}
          label={S.mine.dropLabel}
          buttonLabel={S.mine.dropButton}
          aria-label={S.mine.dropLabel}
          onFiles={(files) => void onFiles(files)}
        />
      </div>
    </Section>
  );
}
