/**
 * 角色資料編輯器：在瀏覽器裡編輯一個 CCFOLIA 角色，輸出可以直接貼進 CCFOLIA 的角色剪貼簿 JSON。
 * 左欄：三個讀入區（角色 JSON、編輯畫面的文字、檔案）與輸出；右欄：表單。
 * 讀入一律先經過差異確認（或沒有差異的通知），不直接覆蓋。全部在瀏覽器內處理，不保存任何資料。
 */
import { Copy, FolderOpen, RotateCcw, Save } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { type CcfoliaCharacter, characterFileName, serializeCharacterClipboard } from '@/ccfolia';
import { copyText, downloadText, readAsText } from '@/core/files';
import {
  Button,
  Dialog,
  DialogClose,
  Notice,
  type NoticeTone,
  Section,
  TextArea,
  ToolShell,
} from '@/ui';
import { CharacterForm } from './CharacterForm';
import { DiffDialog } from './DiffDialog';
import {
  computeImportDiffs,
  type ImportDiff,
  type ImportResult,
  type ImportSource,
  readCharacterJson,
  readEditScreenText,
} from './logic';
import { applyImport, resetCharacter, TOOL_ID, useEditor } from './store';
import { S, USAGE_NOTES, USAGE_STEPS } from './strings';

type Area = 'json' | 'edit' | 'file';

interface Message {
  text: string;
  tone: NoticeTone;
}

/** 開頁時各區的用法提示（F37） */
const HINTS: Record<Area, Message> = {
  json: { text: S.json.hint, tone: 'info' },
  edit: { text: S.edit.hint, tone: 'info' },
  file: { text: S.file.hint, tone: 'info' },
};

interface ImportDraft {
  source: ImportSource;
  incoming: CcfoliaCharacter;
  diffs: ImportDiff[];
  selected: Set<string>;
}

function Usage() {
  return (
    <>
      <ol>
        {USAGE_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <ul className="mt-3 text-muted">
        {USAGE_NOTES.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </>
  );
}

function AreaMessage({ area, message }: { area: Area; message: Message }) {
  return (
    <Notice tone={message.tone} className="whitespace-pre-wrap">
      <span data-testid={`${area}-message`} data-tone={message.tone}>
        {message.text}
      </span>
    </Notice>
  );
}

/** 「讀取」按鈕（名稱帶出是哪一區，例如「讀取角色 JSON」） */
function LoadButton({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <Button size="sm" variant="primary" icon={<FolderOpen />} onClick={onClick} aria-label={name}>
      {S.load}
    </Button>
  );
}

export function App() {
  const [jsonText, setJsonText] = useState('');
  const [editText, setEditText] = useState('');
  const [messages, setMessages] = useState<Record<Area, Message>>(HINTS);
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [noDiff, setNoDiff] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  const character = useEditor((s) => s.data.character);
  const output = useMemo(() => serializeCharacterClipboard(character), [character]);

  const say = (area: Area, message: Message) => setMessages((m) => ({ ...m, [area]: message }));

  /** 讀入（F01、F05、F08）：成功時開差異確認或沒有差異的通知，失敗時在該區顯示錯誤；目前的角色不變 */
  const startImport = (area: Area, source: ImportSource, result: ImportResult) => {
    if (!result.ok) {
      const text = S.errors[result.error];
      say(area, {
        text: source.kind === 'file' ? `${S.source(source)}：${text}` : text,
        tone: 'danger',
      });
      return;
    }
    const current = useEditor.getState().data.character;
    const diffs = computeImportDiffs(current, result.incoming, {
      includeColor: result.includeColor,
    });
    if (!diffs.length) {
      const text = S.noDiff(source);
      say(area, { text, tone: 'info' });
      setNoDiff(text);
      return;
    }
    setDraft({ source, incoming: result.incoming, diffs, selected: new Set() });
    say(area, { text: S.loaded(source), tone: 'info' });
  };

  const loadFile = async (file: File) => {
    let text: string;
    try {
      text = await readAsText(file);
    } catch {
      say('file', { text: S.file.readFailed(file.name), tone: 'danger' });
      return;
    }
    startImport('file', { kind: 'file', name: file.name }, readCharacterJson(text));
  };

  const apply = (selected: Iterable<string>) => {
    if (!draft) return;
    applyImport(draft.incoming, draft.diffs, new Set(selected));
    setCopyState('idle');
    setDraft(null);
  };

  const copy = async () => {
    if (await copyText(output)) {
      setCopyState('success');
      return;
    }
    setCopyState('error');
    outputRef.current?.focus();
    outputRef.current?.select();
  };

  const save = () => {
    const name = characterFileName(character.name);
    downloadText(output, name, 'application/json');
    say('file', { text: S.file.saved(name), tone: 'success' });
  };

  const io = (
    <div className="flex min-w-0 flex-col gap-3" data-testid="io-pane">
      <Section
        fixed
        title={S.json.title}
        actions={
          <LoadButton
            name={S.json.load}
            onClick={() => startImport('json', { kind: 'json' }, readCharacterJson(jsonText))}
          />
        }
      >
        <TextArea
          aria-label={S.json.aria}
          rows={7}
          spellCheck={false}
          autoComplete="off"
          placeholder={S.json.placeholder}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="font-mono text-xs"
          data-area="json"
        />
        <AreaMessage area="json" message={messages.json} />
      </Section>

      <Section
        fixed
        title={S.edit.title}
        actions={
          <LoadButton
            name={S.edit.load}
            onClick={() => startImport('edit', { kind: 'edit' }, readEditScreenText(editText))}
          />
        }
      >
        <TextArea
          aria-label={S.edit.aria}
          rows={6}
          spellCheck={false}
          autoComplete="off"
          placeholder={S.edit.placeholder}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="font-mono text-xs"
          data-area="edit"
        />
        <AreaMessage area="edit" message={messages.edit} />
      </Section>

      <Section
        fixed
        title={S.file.title}
        actions={
          <>
            <Button size="sm" icon={<Save />} onClick={save} aria-label={S.file.save}>
              {S.save}
            </Button>
            <LoadButton name={S.file.load} onClick={() => fileInput.current?.click()} />
          </>
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label={S.file.aria}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            /* 清空選檔欄：同一個檔案可以連續讀兩次 */
            e.target.value = '';
            if (file) void loadFile(file);
          }}
        />
        <AreaMessage area="file" message={messages.file} />
      </Section>

      <Section
        fixed
        title={S.output.title}
        description={S.output.hint}
        actions={
          <Button size="sm" variant="primary" icon={<Copy />} onClick={() => void copy()}>
            {S.output.copy}
          </Button>
        }
      >
        <TextArea
          ref={outputRef}
          aria-label={S.output.aria}
          rows={16}
          readOnly
          spellCheck={false}
          value={output}
          className="font-mono text-xs"
          data-testid="output"
        />
        {copyState === 'success' ? (
          <Notice tone="success">
            <span data-testid="copy-message">{S.output.copied}</span>
          </Notice>
        ) : copyState === 'error' ? (
          <Notice tone="danger">
            <span data-testid="copy-message">{S.output.copyFailed}</span>
          </Notice>
        ) : null}
      </Section>

      <div className="flex justify-end">
        <Button variant="danger" icon={<RotateCcw />} onClick={() => setResetOpen(true)}>
          {S.reset.button}
        </Button>
      </div>
    </div>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      body={
        <div className="grid w-full min-w-0 items-start gap-4 lg:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.3fr)]">
          {io}
          <CharacterForm />

          {draft ? (
            <DiffDialog
              source={draft.source}
              diffs={draft.diffs}
              selected={draft.selected}
              onToggle={(id) =>
                setDraft((d) => {
                  if (!d) return d;
                  const selected = new Set(d.selected);
                  if (selected.has(id)) selected.delete(id);
                  else selected.add(id);
                  return { ...d, selected };
                })
              }
              onSelectAll={() =>
                setDraft((d) => (d ? { ...d, selected: new Set(d.diffs.map((x) => x.id)) } : d))
              }
              onClear={() => setDraft((d) => (d ? { ...d, selected: new Set() } : d))}
              onApplySelected={() => apply(draft.selected)}
              onApplyAll={() => apply(draft.diffs.map((d) => d.id))}
              onClose={() => setDraft(null)}
            />
          ) : null}

          <Dialog
            open={noDiff !== null}
            onOpenChange={(open) => {
              if (!open) setNoDiff(null);
            }}
            title={S.noDiffDialog.title}
            size="sm"
            footer={<DialogClose variant="primary">{S.noDiffDialog.ok}</DialogClose>}
          >
            <p className="m-0 text-sm" data-testid="no-diff-message">
              {noDiff}
            </p>
          </Dialog>

          <Dialog
            open={resetOpen}
            onOpenChange={setResetOpen}
            title={S.reset.title}
            size="sm"
            footer={
              <>
                <DialogClose>{S.reset.cancel}</DialogClose>
                <Button
                  variant="danger"
                  onClick={() => {
                    resetCharacter();
                    setCopyState('idle');
                    setResetOpen(false);
                  }}
                >
                  {S.reset.confirm}
                </Button>
              </>
            }
          >
            <p className="m-0 text-sm">{S.reset.body}</p>
          </Dialog>
        </div>
      }
    />
  );
}
