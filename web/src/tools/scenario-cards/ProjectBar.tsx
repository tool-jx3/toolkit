/**
 * 專案（F29～F32）：專案名稱欄、存在瀏覽器裡的專案清單（選了就讀取，可以復原）、存到瀏覽器、依名稱讀取、
 * 刪除已存的專案（第 7 節裁定核准的新增功能，先確認）。
 */
import { FolderDown, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, Section, Select, TextInput, useConfirm } from '@/ui';
import {
  deleteNamed,
  loadNamed,
  refreshSaved,
  saveNamed,
  setName,
  useSaved,
  useWorkspace,
} from './store';
import { S } from './strings';

export function ProjectBar() {
  const name = useWorkspace((s) => s.data.name);
  const names = useSaved((s) => s.names);
  const selected = useSaved((s) => s.selected);
  const confirm = useConfirm();
  const nameInput = useRef<HTMLInputElement>(null);

  /* 其他分頁存檔或刪除時同步清單 */
  useEffect(() => {
    const onStorage = () => refreshSaved();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const focusName = () => nameInput.current?.focus();

  const remove = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: S.deleteSavedTitle(selected),
      description: S.deleteSavedDescription,
      confirmLabel: S.deleteSavedConfirm,
      danger: true,
    });
    if (ok) deleteNamed(selected);
  };

  return (
    <Section title={S.projectTitle} persistKey="scenario-cards:project">
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="sc-project-name" className="shrink-0 text-sm text-muted">
            {S.projectName}
          </label>
          <TextInput
            id="sc-project-name"
            ref={nameInput}
            value={name}
            placeholder={S.projectNamePlaceholder}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className="min-w-40 flex-1"
          />
          <Button
            size="md"
            icon={<Save />}
            onClick={() => {
              if (saveNamed() === 'no-name') focusName();
            }}
          >
            {S.saveToBrowser}
          </Button>
          <Button
            size="md"
            icon={<FolderDown />}
            onClick={() => {
              if (loadNamed(name) === 'no-name') focusName();
            }}
          >
            {S.loadByName}
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Select
            aria-label={S.savedList}
            value={selected}
            placeholder={names.length ? S.savedPlaceholder : S.savedEmpty}
            disabled={!names.length}
            options={names.map((n) => ({ value: n, label: n }))}
            onValueChange={(v) => {
              if (v) loadNamed(v);
            }}
            className="min-w-0 flex-1"
          />
          <Button
            variant="ghost"
            icon={<Trash2 />}
            disabled={!selected}
            aria-label={S.deleteSavedLabel}
            onClick={() => void remove()}
          >
            {S.deleteSaved}
          </Button>
        </div>
      </div>
    </Section>
  );
}
