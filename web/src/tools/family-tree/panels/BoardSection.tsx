/**
 * 「圖板」區塊（規格 1.1）：切換、名稱、新增、刪除、加入範例。
 */
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { historyGesture } from '@/core/storage';
import { Button, Field, Section, Select, TextInput, useConfirm } from '@/ui';
import { notify, plBlocked } from '../actions';
import { exampleBoard } from '../model/example';
import { type Board, LIMITS, newId } from '../model/types';
import {
  boardNow,
  isPlView,
  setCollapsed,
  switchBoard,
  treeNow,
  uniqueTitle,
  updateBoard,
  useBoard,
  usePlView,
  useTree,
} from '../store';
import { S } from '../strings';
import { PlLock } from './PlLock';

const gesture = historyGesture(useTree);

function emptyBoard(boards: readonly Board[]): Board {
  return {
    id: newId('b'),
    title: uniqueTitle(S.newBoardTitle, boards),
    createdAt: new Date().toISOString(),
    align: 'center',
    cats: [],
    people: {},
  };
}

/** 加一張圖板並切過去（不列入復原：切換時復原紀錄清空） */
export function addBoard(b: Board): void {
  useTree.getState().update((d) => {
    d.boards.push(b);
  });
  switchBoard(b.id);
  useTree.temporal.getState().clear();
}

export function BoardSection() {
  const confirm = useConfirm();
  const boards = useTree((s) => s.data.boards);
  const board = useBoard();
  /* PL 檢視不能編輯（D29）：改名、新增、加入範例、刪除都不作用 */
  const pl = usePlView();
  const full = boards.length >= LIMITS.boards;

  const onNew = () => {
    if (plBlocked()) return;
    const b = emptyBoard(treeNow().boards);
    addBoard(b);
    notify({ title: S.boardAdded(b.title), tone: 'success', replace: true });
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[data-field="board-title"]');
      el?.focus();
      el?.select();
    }, 30);
  };
  const onExample = () => {
    if (plBlocked()) return;
    const b = exampleBoard();
    b.title = uniqueTitle(b.title, treeNow().boards);
    addBoard(b);
    notify({ title: S.boardAdded(b.title), tone: 'success', replace: true });
  };
  const onDelete = async () => {
    if (plBlocked()) return;
    const cur = boardNow();
    const ok = await confirm({
      title: S.deleteBoardTitle(cur.title),
      description: S.deleteBoardDesc,
      confirmLabel: S.deleteBoardConfirm,
      danger: true,
    });
    if (!ok) return;
    const rest = treeNow().boards.filter((b) => b.id !== cur.id);
    /* 至少留一張：刪掉最後一張時換成空白的圖板（D24） */
    const next = rest.length ? null : emptyBoard([]);
    const nextId =
      next?.id ?? [...rest].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? '';
    useTree.getState().update((d) => {
      d.boards = d.boards.filter((b) => b.id !== cur.id);
      if (next) d.boards.push(next);
    });
    setCollapsed(cur.id, []);
    switchBoard(nextId);
    useTree.temporal.getState().clear();
    notify({ title: S.boardDeleted(cur.title), tone: 'success', replace: true });
  };

  return (
    <Section title={S.boardSection} persistKey="family-tree:boards">
      {pl ? <PlLock /> : null}
      <Field label={S.boardTitle} hint={S.boardTitleHint}>
        <TextInput
          value={board.title}
          maxLength={LIMITS.title}
          data-field="board-title"
          disabled={pl}
          onFocus={gesture.begin}
          onChange={(e) => {
            if (plBlocked()) return;
            const v = Array.from(e.target.value).slice(0, LIMITS.title).join('');
            updateBoard((b) => {
              b.title = v;
            });
          }}
          onBlur={() => {
            if (isPlView()) return;
            if (!boardNow().title.trim())
              updateBoard((b) => {
                b.title = S.untitledBoard;
              });
            gesture.commit();
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<Plus />} disabled={full || pl} onClick={onNew}>
          {S.newBoard}
        </Button>
        <Button size="sm" icon={<BookOpen />} disabled={full || pl} onClick={onExample}>
          {S.addExample}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          disabled={pl}
          onClick={() => void onDelete()}
        >
          {S.deleteBoard}
        </Button>
      </div>
      <p className="m-0 mt-1.5 text-xs text-muted" data-testid="board-count">
        {full
          ? S.boardsFull(LIMITS.boards)
          : S.boardCount(Object.keys(board.people).length, boards.length)}
      </p>
    </Section>
  );
}

/** 畫布工具列上的圖板下拉（依建立順序；F01） */
export function BoardSelect() {
  const boards = useTree((s) => s.data.boards);
  const board = useBoard();
  const sorted = [...boards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <Select
      aria-label={S.boardSelect}
      size="sm"
      value={board.id}
      data-field="board-select"
      className="min-w-0 max-w-full sm:max-w-52"
      options={sorted.map((b) => ({ value: b.id, label: b.title || S.untitledBoard }))}
      onValueChange={(id) => switchBoard(id)}
    />
  );
}
