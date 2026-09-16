import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { createEmptyCharacter, parseClipboardJson, serializeClipboardJson } from "./lib/clipboard";
import { parseEditScreenText } from "./lib/editScreenText";
import { t, useLocale } from "./i18n";
import type { Character, CharacterParam, CharacterStatus } from "./types/character";

const SAMPLE_JSON_PLACEHOLDER = JSON.stringify({ kind: "character", data: { name: "SampleName" } }, null, 2);

type CopyState = "idle" | "success" | "error";
/* 【TRPG Toolkit 収録時の変更点】
 * 上流はメッセージを文字列で持ち、"必要" や "読み取れません" を含むかどうかで
 * エラー表示かを決めていた。訳した文字列ではその判定が黙って外れるので、
 * 種別を明示的に持たせる。text は下位層が投げた例外メッセージ用。 */
type Message = { key: string; args?: Array<string | number>; text?: string; isError: boolean };

function messageText(message: Message): string {
  return message.text ?? t(message.key, ...(message.args ?? []));
}
type ImportKey = "name" | "initiative" | "externalUrl" | "color" | "memo" | "width" | "status" | "params" | "commands";
type ImportDiff = {
  id: string;
  /* 表示直前に t() を引く。配列項目はユーザーが入れたラベルを labelArg に持つ。 */
  labelKey: string;
  labelArg?: string;
  currentValue: unknown;
  incomingValue: unknown;
  apply: (character: Character, incoming: Character) => Character;
};
type ImportDraft = {
  source: string;
  incoming: Character;
  diffs: ImportDiff[];
  selectedIds: string[];
};
type ImportOptions = {
  includeColor: boolean;
};

/* label は i18n key。描画のたびに t() を引くので言語切替に追従する。 */
const IMPORT_FIELDS: Array<{ key: ImportKey; label: string }> = [
  { key: "name", label: "field.name" },
  { key: "initiative", label: "field.initiative" },
  { key: "externalUrl", label: "field.externalUrl" },
  { key: "color", label: "field.color" },
  { key: "memo", label: "field.memo" },
  { key: "width", label: "field.width" },
  { key: "status", label: "field.status" },
  { key: "params", label: "field.params" },
  { key: "commands", label: "field.commands" }
];

export function App() {
  const [inputJson, setInputJson] = useState("");
  const [editScreenText, setEditScreenText] = useState("");
  const [character, setCharacter] = useState<Character>(() => createEmptyCharacter());
  const [parseMessage, setParseMessage] = useState<Message>({ key: "json.hint", isError: false });
  const [editTextMessage, setEditTextMessage] = useState<Message>({ key: "editText.hint", isError: false });
  const [fileMessage, setFileMessage] = useState<Message>({ key: "file.hint", isError: false });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<Message | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);

  const outputJson = useMemo(() => serializeClipboardJson(character), [character]);

  function loadJson() {
    try {
      const parsed = parseClipboardJson(inputJson);
      prepareImport(parsed.data as Character, "source.json", setParseMessage, { includeColor: hasExplicitColor(inputJson) });
    } catch (error) {
      setParseMessage({ key: "err.jsonLoad", text: error instanceof Error ? error.message : undefined, isError: true });
    }
  }

  function loadEditScreenText() {
    try {
      prepareImport(parseEditScreenText(editScreenText), "source.editText", setEditTextMessage, { includeColor: false });
    } catch (error) {
      setEditTextMessage({ key: "err.editTextLoad", text: error instanceof Error ? error.message : undefined, isError: true });
    }
  }

  function prepareImport(incoming: Character, source: string, setMessage: (message: Message) => void, options: ImportOptions) {
    const diffs = getImportDiffs(character, incoming, options);
    /* source は i18n key か、ファイル名を差し込んだ表示名そのもの。 */
    const sourceName = source.startsWith("source.") ? t(source) : source;

    if (diffs.length === 0) {
      const message: Message = { key: "msg.noDiff", args: [sourceName], isError: false };
      setMessage(message);
      setNoticeDialog(message);
      return;
    }

    setImportDraft({
      source: sourceName,
      incoming,
      diffs,
      selectedIds: []
    });
    setMessage({ key: "msg.loaded", args: [sourceName], isError: false });
  }

  function applyImport(selectedIds: string[]) {
    if (!importDraft) {
      return;
    }

    setCharacter((current) => {
      return importDraft.diffs
        .filter((diff) => selectedIds.includes(diff.id))
        .reduce((next, diff) => diff.apply(next, importDraft.incoming), current);
    });
    setCopyState("idle");
    setImportDraft(null);
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(outputJson);
      setCopyState("success");
    } catch {
      setCopyState("error");
      outputRef.current?.focus();
      outputRef.current?.select();
    }
  }

  async function saveLocalFile() {
    const fileName = `${sanitizeFileName(character.name || "character")}.ccfolia-character.json`;

    try {
      if ("showSaveFilePicker" in window && typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "CCFOLIA Character JSON",
              accept: { "application/json": [".json"] }
            }
          ]
        });
        const writable = await handle.createWritable();

        await writable.write(outputJson);
        await writable.close();
        setFileMessage({ key: "msg.fileSavedAt", isError: false });
        return;
      }

      downloadLocalFile(outputJson, fileName);
      setFileMessage({ key: "msg.fileSavedDownload", isError: false });
    } catch (error) {
      if (isAbortError(error)) {
        setFileMessage({ key: "msg.fileSaveCancelled", isError: false });
        return;
      }

      setFileMessage({ key: "msg.fileSaveFailed", isError: true });
    }
  }

  function downloadLocalFile(content: string, fileName: string) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadLocalFile(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const fileText = await readFileText(file);
      const parsed = parseClipboardJson(fileText);
      prepareImport(parsed.data as Character, t("source.file", file.name), setFileMessage, { includeColor: hasExplicitColor(fileText) });
    } catch (error) {
      setFileMessage({ key: "err.fileLoad", text: error instanceof Error ? error.message : undefined, isError: true });
    }
  }

  function updateField<K extends keyof Character>(key: K, value: Character[K]) {
    setCharacter((current) => ({ ...current, [key]: value }));
  }

  function resetCharacter() {
    setCharacter(createEmptyCharacter());
    setCopyState("idle");
    setImportDraft(null);
    setResetConfirmOpen(false);
  }

  useLocale(); // 語言一變就整棵重繪

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Character Editor for CCFOLIA</h1>
        </div>
      </header>

      <div className="workspace">
        <section className="io-pane" aria-label={t("io.aria")}>
          <div className="panel-block">
            <div className="section-heading">
              <h2>{t("json.inputHeading")}</h2>
              <button type="button" onClick={loadJson}>
                {t("action.load")}
              </button>
            </div>
            <textarea
              className="code-area"
              value={inputJson}
              onChange={(event) => setInputJson(event.target.value)}
              spellCheck={false}
              aria-label={t("json.inputHeading")}
              placeholder={SAMPLE_JSON_PLACEHOLDER}
            />
            <p className={parseMessage.isError ? "message error" : "message"}>{messageText(parseMessage)}</p>
          </div>

          <div className="panel-block">
            <div className="section-heading">
              <h2>{t("editText.heading")}</h2>
              <button type="button" onClick={loadEditScreenText}>
                {t("action.load")}
              </button>
            </div>
            <textarea
              className="code-area edit-text"
              value={editScreenText}
              onChange={(event) => setEditScreenText(event.target.value)}
              spellCheck={false}
              aria-label={t("editText.heading")}
              placeholder={t("editText.placeholder")}
            />
            <p className={editTextMessage.isError ? "message error" : "message"}>{messageText(editTextMessage)}</p>
          </div>

          <div className="panel-block">
            <div className="section-heading">
              <h2>{t("file.heading")}</h2>
              <div className="file-actions">
                <button type="button" onClick={saveLocalFile}>
                  {t("action.save")}
                </button>
                <label className="file-button">
                  {t("action.load")}
                  <input
                    className="file-input"
                    type="file"
                    accept=".json,application/json"
                    aria-label={t("file.loadAria")}
                    onChange={(event) => {
                      void loadLocalFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <p className={fileMessage.isError ? "message error" : "message"}>{messageText(fileMessage)}</p>
          </div>

          <div className="panel-block output-block">
            <div className="section-heading">
              <h2>{t("json.outputHeading")}</h2>
              <button type="button" onClick={copyOutput}>
                {t("action.copy")}
              </button>
            </div>
            <textarea ref={outputRef} className="code-area output" value={outputJson} readOnly spellCheck={false} aria-label={t("json.outputHeading")} />
            {copyState === "success" && <p className="message success">{t("msg.copied")}</p>}
            {copyState === "error" && <p className="message error">{t("msg.copyFailed")}</p>}
          </div>
          <div className="reset-actions">
            <button className="danger-button" type="button" onClick={() => setResetConfirmOpen(true)}>
              {t("action.reset")}
            </button>
          </div>
        </section>

        <CharacterForm character={character} updateField={updateField} />
      </div>
      <footer className="app-footer">
        <a className="credit-link" href="https://organontorah.wixsite.com/planes" target="_blank" rel="noreferrer">
          <span>{t("credit.by")}</span>
          {/* 作者名は固有名詞なので訳さない。 */}
          巡涯学派
        </a>
      </footer>
      {importDraft && (
        <ImportReviewDialog
          current={character}
          draft={importDraft}
          onToggle={(id) =>
            setImportDraft((draft) =>
              draft
                ? {
                    ...draft,
                    selectedIds: draft.selectedIds.includes(id) ? draft.selectedIds.filter((item) => item !== id) : [...draft.selectedIds, id]
                  }
                : draft
            )
          }
          onSelectAll={() => setImportDraft((draft) => (draft ? { ...draft, selectedIds: draft.diffs.map((diff) => diff.id) } : draft))}
          onClearAll={() => setImportDraft((draft) => (draft ? { ...draft, selectedIds: [] } : draft))}
          onApplySelected={() => applyImport(importDraft.selectedIds)}
          onApplyAll={() => applyImport(importDraft.diffs.map((diff) => diff.id))}
          onCancel={() => setImportDraft(null)}
        />
      )}
      {noticeDialog && <NoticeDialog message={noticeDialog} onClose={() => setNoticeDialog(null)} />}
      {resetConfirmOpen && <ResetConfirmDialog onCancel={() => setResetConfirmOpen(false)} onConfirm={resetCharacter} />}
    </main>
  );
}

function sanitizeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "_") || "character";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function hasExplicitColor(input: string): boolean {
  try {
    const parsed = JSON.parse(input) as unknown;

    return isRecord(parsed) && isRecord(parsed.data) && isImportableColor(parsed.data.color);
  } catch {
    return false;
  }
}

function isImportableColor(value: unknown): boolean {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function readFileText(file: File): Promise<string> {
  if ("text" in file && typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error(t("err.fileLoad"))));
    reader.readAsText(file);
  });
}

function NoticeDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="notice-dialog" role="dialog" aria-modal="true" aria-labelledby="notice-dialog-title">
        <div className="dialog-header">
          <div>
            <h2 id="notice-dialog-title">{t("dialog.noDiff")}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            {t("action.close")}
          </button>
        </div>
        <p className="notice-dialog-message">{messageText(message)}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}

function ResetConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="notice-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
        <div className="dialog-header">
          <div>
            <h2 id="reset-confirm-title">{t("dialog.resetTitle")}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t("action.close")}
          </button>
        </div>
        <p className="notice-dialog-message">{t("dialog.resetBody")}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t("action.cancel")}
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            {t("action.doReset")}
          </button>
        </div>
      </section>
    </div>
  );
}

function ImportReviewDialog({
  current,
  draft,
  onToggle,
  onSelectAll,
  onClearAll,
  onApplySelected,
  onApplyAll,
  onCancel
}: {
  current: Character;
  draft: ImportDraft;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onApplySelected: () => void;
  onApplyAll: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-review-title">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{draft.source}</p>
            <h2 id="import-review-title">{t("dialog.reviewTitle")}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onCancel}>
            {t("action.close")}
          </button>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onSelectAll}>
            {t("action.selectAll")}
          </button>
          <button className="secondary-button" type="button" onClick={onClearAll}>
            {t("action.selectNone")}
          </button>
          <button className="apply-button" type="button" onClick={onApplySelected} disabled={draft.selectedIds.length === 0}>
            {t("action.applySelected")}
          </button>
          <button className="danger-button" type="button" onClick={onApplyAll}>
            {t("action.applyAll")}
          </button>
        </div>
        <div className="diff-list">
          {getDiffGroups(draft.diffs).map((group) =>
            group.title ? (
              <section className="diff-group" key={group.title} aria-label={group.title}>
                <h3 className="diff-group-title">{group.title}</h3>
                <div className="diff-group-list">{group.diffs.map((diff) => renderDiffRow(diff, draft.selectedIds, onToggle, true))}</div>
              </section>
            ) : (
              group.diffs.map((diff) => renderDiffRow(diff, draft.selectedIds, onToggle, false))
            )
          )}
        </div>
      </section>
    </div>
  );
}

function renderDiffRow(diff: ImportDiff, selectedIds: string[], onToggle: (id: string) => void, compact: boolean) {
  return (
    <label className={compact ? "diff-row compact-diff-row" : "diff-row"} key={diff.id}>
      <span className="diff-label">{compact ? getCompactDiffLabel(diff) : diffLabel(diff)}</span>
      <input type="checkbox" aria-label={diffLabel(diff)} checked={selectedIds.includes(diff.id)} onChange={() => onToggle(diff.id)} />
      <span className="diff-value">
        <strong>{t("diff.current")}</strong>
        <DiffValue value={diff.currentValue} compareWith={diff.incomingValue} />
      </span>
      <span className="diff-arrow">→</span>
      <span className="diff-value incoming">
        <strong>{t("diff.incoming")}</strong>
        <DiffValue value={diff.incomingValue} compareWith={diff.currentValue} />
      </span>
    </label>
  );
}

function getDiffGroups(diffs: ImportDiff[]): Array<{ title: string | null; diffs: ImportDiff[] }> {
  const normalDiffs = diffs.filter((diff) => !diff.id.startsWith("status:") && !diff.id.startsWith("params:") && diff.id !== "commands");
  const statusDiffs = diffs.filter((diff) => diff.id.startsWith("status:"));
  const paramDiffs = diffs.filter((diff) => diff.id.startsWith("params:"));
  const commandDiffs = diffs.filter((diff) => diff.id === "commands");
  const groups: Array<{ title: string | null; diffs: ImportDiff[] }> = [];

  if (normalDiffs.length > 0) {
    groups.push({ title: null, diffs: normalDiffs });
  }

  if (statusDiffs.length > 0) {
    groups.push({ title: t("field.status"), diffs: statusDiffs });
  }

  if (paramDiffs.length > 0) {
    groups.push({ title: t("field.params"), diffs: paramDiffs });
  }

  if (commandDiffs.length > 0) {
    groups.push({ title: null, diffs: commandDiffs });
  }

  return groups;
}

/* 全体表示は「ステータス: 名前」、グループ内は名前だけ。上流は前者から正規表現で
 * 前置きを削っていたが、訳すと一致しなくなるので、key と引数から両方を組む。 */
function diffLabel(diff: ImportDiff): string {
  return diff.labelArg === undefined ? t(diff.labelKey) : t(diff.labelKey, diff.labelArg);
}

function getCompactDiffLabel(diff: ImportDiff): string {
  return diff.labelArg ?? t(diff.labelKey);
}

function DiffValue({ value, compareWith }: { value: unknown; compareWith: unknown }) {
  if (isRecord(value) && "label" in value) {
    if ("max" in value) {
      const compareRecord = isRecord(compareWith) ? compareWith : {};

      return (
        <dl className="diff-object">
          <DiffProperty label={t("col.label")} value={value.label} compareWith={compareRecord.label} />
          <StatusDiffProperty value={value.value} max={value.max} compareValue={compareRecord.value} compareMax={compareRecord.max} />
        </dl>
      );
    }

    return (
      <dl className="diff-object">
        <DiffProperty label={t("col.label")} value={value.label} compareWith={isRecord(compareWith) ? compareWith.label : undefined} />
        {"value" in value && <DiffProperty label={t("col.value")} value={value.value} compareWith={isRecord(compareWith) ? compareWith.value : undefined} />}
      </dl>
    );
  }

  return <code className={!isSameImportValue(value, compareWith) ? "diff-changed" : undefined}>{formatImportValue(value)}</code>;
}

function DiffProperty({ label, value, compareWith }: { label: string; value: unknown; compareWith: unknown }) {
  const changed = !isSameImportValue(value, compareWith);

  return (
    <>
      <dt>{label}</dt>
      <dd className={changed ? "diff-changed" : undefined}>{formatImportValue(value)}</dd>
    </>
  );
}

function StatusDiffProperty({ value, max, compareValue, compareMax }: { value: unknown; max: unknown; compareValue: unknown; compareMax: unknown }) {
  return (
    <>
      <dt>{t("col.currentMax")}</dt>
      <dd>
        <span className={!isSameImportValue(value, compareValue) ? "diff-changed" : undefined}>{formatImportValue(value)}</span>
        <span> / </span>
        <span className={!isSameImportValue(max, compareMax) ? "diff-changed" : undefined}>{formatImportValue(max)}</span>
      </dd>
    </>
  );
}

type CharacterFormProps = {
  character: Character;
  updateField: <K extends keyof Character>(key: K, value: Character[K]) => void;
};

function CharacterForm({ character, updateField }: CharacterFormProps) {
  return (
    <section className="form-pane" aria-label={t("form.aria")}>
      <div className="form-grid">
        <TextField label={t("field.name")} value={character.name} onChange={(value) => updateField("name", value)} />
        <NumberField label={t("field.initiative")} value={character.initiative} onChange={(value) => updateField("initiative", value)} />
        <TextField label={t("field.externalUrl")} value={character.externalUrl} onChange={(value) => updateField("externalUrl", value)} />
        <ColorField color={character.color} onChange={(value) => updateField("color", value)} />
      </div>

      <label className="field full">
        <span>{t("field.memo")}</span>
        <textarea value={character.memo} onChange={(event) => updateField("memo", event.target.value)} />
      </label>

      <div className="form-grid compact">
        <NumberField label={t("field.width")} value={character.width} onChange={(value) => updateField("width", value)} />
      </div>

      <StatusEditor items={character.status} onChange={(items) => updateField("status", items)} />
      <ParamEditor items={character.params} onChange={(items) => updateField("params", items)} />

      <CommandEditor
        commands={character.commands}
        status={character.status}
        params={character.params}
        onChange={(commands) => updateField("commands", commands)}
      />
    </section>
  );
}

function ColorField({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  const [colorText, setColorText] = useState(color.replace(/^#/, ""));

  useEffect(() => {
    setColorText(color.replace(/^#/, ""));
  }, [color]);

  function updateColorText(value: string) {
    const next = value.replace(/^#/, "").slice(0, 6);
    setColorText(next);
    const normalized = normalizeFullColorCode(next);
    if (normalized) {
      onChange(normalized);
    }
  }

  function settleColorText() {
    const normalized = normalizeColorCode(colorText);
    if (normalized) {
      onChange(normalized);
      setColorText(normalized.replace(/^#/, ""));
      return;
    }

    setColorText(color.replace(/^#/, ""));
  }

  function handleColorKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <div className="field color-field">
      <span>{t("field.color")}</span>
      <span className="color-control">
        <input type="color" value={color} onChange={(event) => onChange(event.target.value)} aria-label={t("field.color")} />
        <span className="color-code-wrap">
          <span className="color-prefix">#</span>
          <input
            className="color-code-input"
            value={colorText}
            maxLength={6}
            onBlur={settleColorText}
            onChange={(event) => updateColorText(event.target.value)}
            onKeyDown={handleColorKeyDown}
            aria-label={t("field.colorCode")}
            spellCheck={false}
          />
        </span>
        <span className="chat-color-preview" style={{ color }}>
          {t("field.chatDisplay")}
        </span>
      </span>
    </div>
  );
}

function normalizeColorCode(value: string) {
  const trimmed = value.trim().replace(/^#/, "");
  const shortMatch = /^([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((character) => `${character}${character}`)
      .join("")
      .toLowerCase()}`;
  }

  return normalizeFullColorCode(trimmed);
}

function normalizeFullColorCode(value: string) {
  const trimmed = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(trimmed) ? `#${trimmed.toLowerCase()}` : null;
}

function CommandEditor({
  commands,
  status,
  params,
  onChange
}: {
  commands: string;
  status: CharacterStatus[];
  params: CharacterParam[];
  onChange: (commands: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const statusReferences = status.filter((item) => item.label.trim() !== "").map((item) => item.label);
  const paramReferences = params.filter((item) => item.label.trim() !== "").map((item) => item.label);
  const hasReferences = statusReferences.length > 0 || paramReferences.length > 0;

  function insertReference(label: string) {
    const token = `{${label}}`;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? commands.length;
    const end = textarea?.selectionEnd ?? commands.length;
    const next = `${commands.slice(0, start)}${token}${commands.slice(end)}`;

    onChange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <section className="command-editor">
      <div className="section-heading">
        <h2>{t("field.commands")}</h2>
      </div>
      <div className="reference-toolbar" aria-label={t("commands.refAria")}>
        {!hasReferences ? (
          <span className="reference-empty">{t("commands.refEmpty")}</span>
        ) : (
          <>
            {statusReferences.length > 0 && <ReferenceGroup title={t("field.status")} labels={statusReferences} onInsert={insertReference} />}
            {paramReferences.length > 0 && <ReferenceGroup title={t("field.params")} labels={paramReferences} onInsert={insertReference} />}
          </>
        )}
      </div>
      <textarea
        ref={textareaRef}
        className="commands-area"
        value={commands}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("field.commands")}
      />
    </section>
  );
}

function ReferenceGroup({ title, labels, onInsert }: { title: string; labels: string[]; onInsert: (label: string) => void }) {
  return (
    <div className="reference-group">
      <span className="reference-group-label">{title}</span>
      {labels.map((label, index) => (
        <button className="reference-chip" type="button" key={`${title}-${label}-${index}`} onClick={() => onInsert(label)}>
          {`{${label}}`}
        </button>
      ))}
    </div>
  );
}

function StatusEditor({ items, onChange }: { items: CharacterStatus[]; onChange: (items: CharacterStatus[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  return (
    <ArraySection title={t("field.status")} headerLabels={[t("col.label"), t("col.current"), t("col.max")]} onAdd={() => onChange([...items, { label: "", value: 0, max: 0 }])}>
      {items.map((item, index) => (
        <div
          className={getDragRowClass(index, dragIndex, dropIndex)}
          key={index}
          onDragOver={(event) => event.preventDefault()}
          onDrag={(event) => scrollNearViewportEdge(event)}
          onDragEnter={() => setDropIndex(index)}
          onDrop={() => handleDrop(items, onChange, dragIndex, index, setDragIndex, setDropIndex)}
        >
          <DragHandle index={index} label={item.label || t("row.status", index + 1)} onDragStart={setDragIndex} onDragEnd={() => clearDragState(setDragIndex, setDropIndex)} />
          <TextField label={t("col.label")} value={item.label} onChange={(value) => updateArrayItem(items, onChange, index, { ...item, label: value })} />
          <NumberField label={t("col.current")} value={item.value} onChange={(value) => updateArrayItem(items, onChange, index, { ...item, value })} />
          <NumberField label={t("col.max")} value={item.max} onChange={(value) => updateArrayItem(items, onChange, index, { ...item, max: value })} />
          <DeleteButton onRemove={() => onChange(removeItem(items, index))} />
        </div>
      ))}
    </ArraySection>
  );
}

function ParamEditor({ items, onChange }: { items: CharacterParam[]; onChange: (items: CharacterParam[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  return (
    <ArraySection title={t("field.params")} headerLabels={[t("col.label"), t("col.value")]} onAdd={() => onChange([...items, { label: "", value: "" }])}>
      {items.map((item, index) => (
        <div
          className={`${getDragRowClass(index, dragIndex, dropIndex)} two-col`}
          key={index}
          onDragOver={(event) => event.preventDefault()}
          onDrag={(event) => scrollNearViewportEdge(event)}
          onDragEnter={() => setDropIndex(index)}
          onDrop={() => handleDrop(items, onChange, dragIndex, index, setDragIndex, setDropIndex)}
        >
          <DragHandle index={index} label={item.label || t("row.params", index + 1)} onDragStart={setDragIndex} onDragEnd={() => clearDragState(setDragIndex, setDropIndex)} />
          <TextField label={t("col.label")} value={item.label} onChange={(value) => updateArrayItem(items, onChange, index, { ...item, label: value })} />
          <TextField label={t("col.value")} value={item.value} onChange={(value) => updateArrayItem(items, onChange, index, { ...item, value })} />
          <DeleteButton onRemove={() => onChange(removeItem(items, index))} />
        </div>
      ))}
    </ArraySection>
  );
}

function ArraySection({ title, headerLabels, onAdd, children }: { title: string; headerLabels: string[]; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section className="array-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <button type="button" onClick={onAdd}>
          {t("action.add")}
        </button>
      </div>
      <div className={headerLabels.length === 2 ? "array-header two-col" : "array-header"} aria-hidden="true">
        <span />
        {headerLabels.map((label) => (
          <span className="array-header-label" key={label}>
            {label}
          </span>
        ))}
        <span />
      </div>
      <div className="array-list">{children}</div>
      <div className="array-footer-actions">
        <button type="button" onClick={onAdd}>
          {t("action.add")}
        </button>
      </div>
    </section>
  );
}

function DragHandle({ index, label, onDragStart, onDragEnd }: { index: number; label: string; onDragStart: (index: number) => void; onDragEnd: () => void }) {
  return (
    <button
      type="button"
      className="drag-handle"
      draggable
      aria-label={t("drag.aria", label)}
      title={t("drag.title")}
      onDragStart={(event) => {
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
        onDragStart(index);
      }}
      onDragEnd={onDragEnd}
    >
      ⋮⋮
    </button>
  );
}

function DeleteButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button className="delete-button" type="button" onClick={onRemove}>
      {t("action.remove")}
    </button>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function updateArrayItem<T>(items: T[], onChange: (items: T[]) => void, index: number, item: T) {
  onChange(items.map((current, currentIndex) => (currentIndex === index ? item : current)));
}

function getImportDiffs(current: Character, incoming: Character, options: ImportOptions): ImportDiff[] {
  const baseDiffs = IMPORT_FIELDS.filter((field) => field.key !== "status" && field.key !== "params")
    .filter((field) => field.key !== "color" || options.includeColor)
    .filter((field) => !isSameImportValue(current[field.key], incoming[field.key]))
    .map((field) => ({
      id: field.key,
      labelKey: field.label,
      currentValue: current[field.key],
      incomingValue: incoming[field.key],
      apply: (character: Character) => ({ ...character, [field.key]: incoming[field.key] })
    }));
  const commandDiffs = baseDiffs.filter((diff) => diff.id === "commands");
  const nonCommandDiffs = baseDiffs.filter((diff) => diff.id !== "commands");

  return [...nonCommandDiffs, ...getStatusDiffs(current.status, incoming.status), ...getParamDiffs(current.params, incoming.params), ...commandDiffs];
}

function isSameImportValue(current: unknown, incoming: unknown): boolean {
  return JSON.stringify(current) === JSON.stringify(incoming);
}

function getStatusDiffs(currentItems: CharacterStatus[], incomingItems: CharacterStatus[]): ImportDiff[] {
  return getArrayDiffs(currentItems, incomingItems, "status", "diff.status", (item) => ({ label: item.label, value: item.value, max: item.max }));
}

function getParamDiffs(currentItems: CharacterParam[], incomingItems: CharacterParam[]): ImportDiff[] {
  return getArrayDiffs(currentItems, incomingItems, "params", "diff.params", (item) => ({ label: item.label, value: item.value }));
}

function getArrayDiffs<T extends { label: string }>(
  currentItems: T[],
  incomingItems: T[],
  key: "status" | "params",
  labelKey: string,
  comparable: (item: T) => unknown
): ImportDiff[] {
  const hasInitialBlankOnly = isInitialBlankArray(currentItems, key);
  const currentIds = hasInitialBlankOnly ? [] : currentItems.map((item, index) => getArrayItemId(item, index));
  const ids = new Set([...currentIds, ...incomingItems.map((item, index) => getArrayItemId(item, index))]);

  return [...ids].flatMap((id) => {
    const incomingIndex = incomingItems.findIndex((item, index) => getArrayItemId(item, index) === id);
    const currentItem = hasInitialBlankOnly && incomingIndex === 0 ? currentItems[0] : findArrayItem(currentItems, id);
    const incomingItem = findArrayItem(incomingItems, id);

    if (isSameImportValue(currentItem ? comparable(currentItem) : null, incomingItem ? comparable(incomingItem) : null)) {
      return [];
    }

    const itemLabel = incomingItem?.label || currentItem?.label || t("diff.blankLabel");
    return [
      {
        id: `${key}:${id}`,
        labelKey,
        labelArg: itemLabel,
        currentValue: currentItem ?? null,
        incomingValue: incomingItem ?? null,
        apply: (character: Character, incoming: Character) => ({
          ...character,
          [key]: mergeArrayItem(character[key] as unknown as T[], incoming[key] as unknown as T[], id, key)
        })
      }
    ];
  });
}

function isInitialBlankArray<T extends { label: string }>(items: T[], key: "status" | "params"): boolean {
  if (items.length !== 1 || items[0].label.trim() !== "") {
    return false;
  }

  const item = items[0] as Record<string, unknown>;
  if (key === "status") {
    return item.value === 0 && item.max === 0;
  }

  return item.value === "" || item.value === 0;
}

function getArrayItemId(item: { label: string }, index: number): string {
  return item.label.trim() === "" ? `index:${index}` : `label:${item.label}`;
}

function findArrayItem<T extends { label: string }>(items: T[], id: string): T | undefined {
  return items.find((item, index) => getArrayItemId(item, index) === id);
}

function mergeArrayItem<T extends { label: string }>(currentItems: T[], incomingItems: T[], id: string, key: "status" | "params"): T[] {
  const incomingItem = findArrayItem(incomingItems, id);
  const currentIndex = currentItems.findIndex((item, index) => getArrayItemId(item, index) === id);
  const incomingIndex = incomingItems.findIndex((item, index) => getArrayItemId(item, index) === id);
  const shouldReplaceInitialBlank = isInitialBlankArray(currentItems, key) && incomingIndex === 0 && incomingItem;

  if (!incomingItem) {
    return currentIndex >= 0 ? currentItems.filter((_, index) => index !== currentIndex) : currentItems;
  }

  if (shouldReplaceInitialBlank) {
    return [incomingItem];
  }

  if (currentIndex >= 0) {
    return currentItems.map((item, index) => (index === currentIndex ? incomingItem : item));
  }

  return [...currentItems, incomingItem];
}

function formatImportValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return t("value.none");
    }

    return value
      .map((item) => {
        if (isRecord(item) && "label" in item) {
          const label = String(item.label ?? "");
          if ("max" in item) {
            return `${label}: ${String(item.value ?? "")}/${String(item.max ?? "")}`;
          }

          return `${label}: ${String(item.value ?? "")}`;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  if (value === "" || value === null || value === undefined) {
    return t("value.empty");
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeItem<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index);
}

function handleDrop<T>(
  items: T[],
  onChange: (items: T[]) => void,
  dragIndex: number | null,
  dropIndex: number,
  setDragIndex: (index: number | null) => void,
  setDropIndex: (index: number | null) => void
) {
  if (dragIndex !== null && dragIndex !== dropIndex) {
    onChange(moveItem(items, dragIndex, dropIndex));
  }

  clearDragState(setDragIndex, setDropIndex);
}

function clearDragState(setDragIndex: (index: number | null) => void, setDropIndex: (index: number | null) => void) {
  setDragIndex(null);
  setDropIndex(null);
}

function scrollNearViewportEdge(event: DragEvent<HTMLElement>) {
  const edgeSize = 96;
  const maxSpeed = 2;
  const { clientY } = event;

  if (clientY <= 0) {
    return;
  }

  if (clientY < edgeSize) {
    window.scrollBy({ top: -Math.ceil(((edgeSize - clientY) / edgeSize) * maxSpeed), behavior: "auto" });
    return;
  }

  if (window.innerHeight - clientY < edgeSize) {
    window.scrollBy({ top: Math.ceil(((edgeSize - (window.innerHeight - clientY)) / edgeSize) * maxSpeed), behavior: "auto" });
  }
}

function getDragRowClass(index: number, dragIndex: number | null, dropIndex: number | null): string {
  const classes = ["array-row"];

  if (dragIndex === index) {
    classes.push("is-dragging");
  }

  if (dragIndex !== null && dropIndex === index && dragIndex !== index) {
    classes.push(dropIndex > dragIndex ? "is-drop-after" : "is-drop-before");
  }

  return classes.join(" ");
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
