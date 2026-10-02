/**
 * 設定欄的「文件」分頁（F220～F228、F016）：劇本名稱、紙面間距、頁尾、內文字級、字型、存檔說明、全部清除。
 */
import { useState } from 'react';
import { pickFiles, readAsArrayBuffer } from '@/core/files';
import {
  Button,
  Field,
  FieldRow,
  LocalFontDialog,
  NativeNumberInput,
  Section,
  Select,
  supportsLocalFontList,
  TextInput,
  Toggle,
} from '@/ui';
import { bridge } from '../bridge';
import {
  type AddedFont,
  FONT_ACCEPT,
  FONT_FILE_MAX,
  FontAddError,
  fontFromBytes,
  localFontBytes,
  ttcFaces,
} from '../fontFiles';
import { SERIF_STACK, safeFontName } from '../render/paperCss';
import { resetDoc } from '../session';
import { doc, edit, say, useDoc } from '../store';
import { S } from '../strings';

/** 數字欄：空白或非數字時回到預設，夾在範圍內 */
export function clampNum(v: string, min: number, max: number, fb: number): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, n));
}

/** 打字時在範圍內就套用，離開欄位時夾到範圍（空白或非數字回到預設） */
function DraftNumber({
  value,
  min,
  max,
  step,
  unit,
  fallback,
  commit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  fallback: number;
  commit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只接收裡面數字欄的離開（focusout）
    <span
      className="block"
      onBlur={() => {
        if (draft != null) commit(clampNum(draft, min, max, fallback));
        setDraft(null);
      }}
    >
      <NativeNumberInput
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        unit={unit}
        onChange={(v) => {
          setDraft(v);
          const n = Number.parseFloat(v);
          if (Number.isFinite(n) && n >= min && n <= max) commit(n);
        }}
      />
    </span>
  );
}

async function addFontBytes(bytes: Uint8Array, fallback: string): Promise<void> {
  const used = doc().fonts.map((f) => f.name);
  let faceIndex: number | undefined;
  const faces = ttcFaces(bytes);
  if (faces && faces.length > 1) {
    const v = await bridge.choose({
      title: `這個字型檔有 ${faces.length} 個字體，要使用哪一個？`,
      choices: faces.map((f) => ({ value: String(f.index), label: f.name, variant: 'secondary' })),
    });
    if (v == null) {
      say('已取消新增字型。', 'info');
      return;
    }
    faceIndex = Number(v);
  }
  let r: AddedFont;
  try {
    r = fontFromBytes(bytes, fallback, used, faceIndex);
  } catch (e) {
    say(e instanceof Error ? e.message : '無法新增這個字型。', 'err');
    return;
  }
  edit((d) => {
    d.fonts.push(r.font);
    if (!d.fontBody) d.fontBody = r.font.name;
  });
  say(
    `${S.status.fontAdded(r.font.name)}（${r.sizeMb} MB）${r.warn ? `／${r.warn}` : ''}`,
    r.warn ? 'warn' : 'ok',
  );
  if (r.warn)
    await bridge.confirm({
      title: `「${r.font.name}」的授權`,
      description: r.warn,
      confirmLabel: '我知道了',
    });
}

export async function addFontFromFile(file?: File): Promise<void> {
  const f = file ?? (await pickFiles({ accept: FONT_ACCEPT }))[0];
  if (!f) return;
  if (f.size > FONT_FILE_MAX) {
    say('字型檔超過 40 MB，無法新增。', 'err');
    return;
  }
  say('正在讀取字型…', 'info');
  const bytes = new Uint8Array(await readAsArrayBuffer(f));
  await addFontBytes(bytes, f.name.replace(/\.[^.]+$/, ''));
}

export async function addLocalFont(family: string): Promise<void> {
  say(`正在讀取「${family}」…`, 'info');
  try {
    await addFontBytes(await localFontBytes(family), family);
  } catch (e) {
    say(e instanceof FontAddError ? e.message : '無法讀取這個字型。', 'err');
  }
}

export function DocTab() {
  const d = useDoc((s) => s.data);
  const [localOpen, setLocalOpen] = useState(false);
  const removeFont = async (name: string) => {
    if (
      !(await bridge.confirm({
        title: S.confirm.deleteFont(name),
        description: S.confirm.deleteFontHint,
        danger: true,
        confirmLabel: S.confirm.del,
      }))
    )
      return;
    edit((x) => {
      x.fonts = x.fonts.filter((f) => f.name !== name);
      if (x.fontBody === name) x.fontBody = '';
      if (x.fontHead === name) x.fontHead = '';
    });
    say(S.status.fontRemoved(name));
  };
  const fontOpts = d.fonts.map((f) => ({ value: f.name, label: f.name }));
  return (
    <div className="flex flex-col gap-2">
      <Section title="劇本" fixed>
        <Field
          label="劇本名稱"
          hint="用在匯出 HTML 的標題、檔名、目錄、頁尾的 {title} 與作品清單。"
        >
          <TextInput value={d.title} onChange={(e) => edit((x) => (x.title = e.target.value))} />
        </Field>
        <FieldRow columns={2}>
          <Field label="上下間距">
            <DraftNumber
              value={d.padV}
              min={5}
              max={40}
              unit="mm"
              fallback={18}
              commit={(v) => edit((x) => (x.padV = v))}
            />
          </Field>
          <Field label="左右間距">
            <DraftNumber
              value={d.padH}
              min={5}
              max={40}
              unit="mm"
              fallback={16}
              commit={(v) => edit((x) => (x.padH = v))}
            />
          </Field>
        </FieldRow>
        <Field label="內文字級" hint="7～14 pt。">
          <DraftNumber
            value={d.base}
            min={6}
            max={20}
            step={0.5}
            unit="pt"
            fallback={10}
            commit={(v) => edit((x) => (x.base = v))}
          />
        </Field>
      </Section>
      <Section title="頁尾" fixed>
        <Field label="顯示頁碼" layout="inline">
          <Toggle
            checked={d.foot.num !== false}
            onCheckedChange={(v) => edit((x) => (x.foot.num = v))}
          />
        </Field>
        <Field
          label="固定文字"
          hint="可以用 {title}（劇本名稱）、{page}（頁碼）、{total}（總頁數）。"
        >
          <TextInput
            value={d.foot.text}
            onChange={(e) => edit((x) => (x.foot.text = e.target.value))}
          />
        </Field>
        <Field label="第一頁的頁碼">
          <DraftNumber
            value={d.foot.from}
            min={0}
            max={9999}
            fallback={1}
            commit={(v) => edit((x) => (x.foot.from = Math.round(v)))}
          />
        </Field>
      </Section>
      <Section
        title="字型"
        fixed
        description="新增的字型會嵌入原稿與匯出的 HTML，換一台電腦也是同樣的樣子。"
      >
        <div className="flex flex-wrap gap-1">
          {supportsLocalFontList() ? (
            <Button size="sm" variant="secondary" onClick={() => setLocalOpen(true)}>
              從電腦的字型選擇
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void addFontFromFile()}>
            從檔案新增
          </Button>
        </div>
        {!supportsLocalFontList() ? (
          <p className="m-0 text-xs text-muted">
            這個瀏覽器無法列出電腦上的字型，請用「從檔案新增」（.ttf、.otf、.ttc、.woff、.woff2，40
            MB 以內）。
          </p>
        ) : null}
        {d.fonts.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="嵌入的字型">
            {d.fonts.map((f) => (
              <li key={f.name} className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{ fontFamily: `"${safeFontName(f.name)}",${SERIF_STACK}` }}
                >
                  {f.name}　永遠的冒險 Aa
                </span>
                <Button size="sm" variant="ghost" onClick={() => void removeFont(f.name)}>
                  刪除
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-xs text-muted">還沒有新增字型（使用預設的明體）。</p>
        )}
        <FieldRow columns={2}>
          <Field label="內文字型">
            <Select
              size="sm"
              value={d.fontBody || 'default'}
              onValueChange={(v) => edit((x) => (x.fontBody = v === 'default' ? '' : v))}
              options={[{ value: 'default', label: '預設（明體）' }, ...fontOpts]}
            />
          </Field>
          <Field label="標題字型">
            <Select
              size="sm"
              value={d.fontHead || 'same'}
              onValueChange={(v) => edit((x) => (x.fontHead = v === 'same' ? '' : v))}
              options={[{ value: 'same', label: '與內文相同' }, ...fontOpts]}
            />
          </Field>
        </FieldRow>
        <LocalFontDialog
          open={localOpen}
          onOpenChange={setLocalOpen}
          value={d.fontBody}
          onPick={(family) => void addLocalFont(family)}
        />
      </Section>
      <Section title="存檔" fixed>
        <p className="m-0 text-sm">
          作品會自動存在這個瀏覽器裡，但清除瀏覽器資料就會消失。請不時按「儲存」存成檔案；要換別的作品請用「作品」。
        </p>
        <Button size="sm" variant="danger" onClick={() => void resetDoc()}>
          全部清除重新開始
        </Button>
      </Section>
      <Section title="字型的提示" defaultOpen={false} persistKey="se:fonthint">
        <p className="m-0 text-xs text-muted">
          預設的明體：思源宋體（Noto Serif TC，從 Google Fonts 載入）→ 系統的明體。下載 PDF
          時第一次會下載完整的思源宋體／思源黑體，之後記在瀏覽器裡。
        </p>
      </Section>
    </div>
  );
}
