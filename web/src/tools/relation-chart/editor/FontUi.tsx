/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯入的字型（F059）：匯入（副檔名決定格式、30 MB 以上不收、5 MB 以上確認、內容去重）、管理（大小、使用中、刪除）、
 * 字型下拉的選項（內建五種＋匯入的，各用自己的字型顯示）。字型檔存在共用的資產庫。
 */
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FONT_FILE_INFO } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { Dialog, IconButton, useConfirm } from '@/ui';
import { FONT_STACKS, importedFamily } from '../engine/geom';
import { FONT_FORMATS, FONT_KEYS } from '../model/normalize';
import type { FontFormat, FontItem, Project } from '../model/types';
import { addFonts, deleteFont } from '../state/libActions';
import { assets, projectNow, setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';

const T = S.font;
const MB = 1024 * 1024;

/** 字型下拉的選項：內建五種（用各自的字型組顯示）＋匯入的（用自己的字型顯示） */
export function fontOptions(fonts: readonly FontItem[]) {
  return [
    ...FONT_KEYS.map((k) => ({
      value: k as string,
      label: <span style={{ fontFamily: FONT_STACKS[k] }}>{S.settings.fonts[k]}</span>,
    })),
    ...fonts.map((f) => ({
      value: `f:${f.id}`,
      label: (
        <span style={{ fontFamily: `"${importedFamily(f.id)}",${FONT_STACKS.sans}` }}>
          {f.name}
        </span>
      ),
    })),
  ];
}

/** 匯入字型（可以多選；副檔名不對的略過） */
export async function importFonts(
  notify: (m: string, warn?: boolean) => void,
  ask: (m: string) => Promise<boolean>,
): Promise<void> {
  const files = await pickFiles({ accept: '.ttf,.otf,.woff,.woff2', multiple: true });
  if (!files.length) return;
  const have = new Set(projectNow().fonts.map((f) => f.id));
  const items: FontItem[] = [];
  let dup = 0;
  for (const f of files) {
    const ext = (f.name.split('.').pop() ?? '').toLowerCase() as FontFormat;
    if (!FONT_FORMATS.includes(ext)) continue;
    if (f.size > 30 * MB) {
      notify(T.tooBig(f.name), true);
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    let id: string;
    try {
      id = (await assets.add(new Blob([bytes], { type: FONT_FILE_INFO[ext].mime }))).id;
    } catch {
      continue;
    }
    if (have.has(id)) {
      dup++;
      continue;
    }
    if (f.size > 5 * MB && !(await ask(T.bigWarn(f.name, (f.size / MB).toFixed(1))))) continue;
    have.add(id);
    items.push({
      id,
      name: f.name.replace(/\.[^.]+$/, '').slice(0, 100) || id.slice(0, 8),
      fmt: ext,
    });
  }
  const r = addFonts(items);
  if (r.added) notify(T.added(r.added));
  else if (dup) notify(T.dupNote, true);
}

/** 字型有沒有人用（文件字型或任何角色字型） */
export function fontInUse(p: Pick<Project, 'font' | 'library'>, id: string): boolean {
  const ref = `f:${id}`;
  return p.font === ref || p.library.some((e) => e.font === ref);
}

const sizeText = (n: number) =>
  n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function FontRow({ f, used }: { f: FontItem; used: boolean }) {
  const confirm = useConfirm();
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void assets.get(f.id).then((b) => live && setBytes(b?.size ?? null));
    return () => {
      live = false;
    };
  }, [f.id]);
  return (
    <li className="flex items-center gap-2" data-testid="font-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-base"
          style={{ fontFamily: `"${importedFamily(f.id)}",${FONT_STACKS.sans}` }}
        >
          {f.name}
        </span>
        <span className="text-xs text-muted">
          {bytes === null ? f.fmt.toUpperCase() : sizeText(bytes)}
          {used ? ` · ${T.inUse}` : ''}
        </span>
      </div>
      <IconButton
        size="sm"
        icon={<Trash2 />}
        label={T.remove(f.name)}
        onClick={async () => {
          const ok = await confirm({
            title: T.remove(f.name),
            description: T.delConfirm(f.name),
            danger: true,
          });
          if (ok) deleteFont(f.id);
        }}
        data-testid="font-del"
      />
    </li>
  );
}

export function FontsDialog() {
  const open = useUi((u) => u.dialog === 'fonts');
  const fonts = useProject((s) => s.data.fonts);
  const font = useProject((s) => s.data.font);
  const library = useProject((s) => s.data.library);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={T.mgrTitle}
      size="sm"
    >
      {fonts.length ? (
        <ul className="flex flex-col gap-2" data-testid="font-manager">
          {fonts.map((f) => (
            <FontRow key={f.id} f={f} used={fontInUse({ font, library }, f.id)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{T.mgrEmpty}</p>
      )}
      <p className="mt-3 text-xs text-muted">{T.license}</p>
    </Dialog>
  );
}
