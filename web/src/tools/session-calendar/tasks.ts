/**
 * 準備事項（規格 3.4）：所有場次的準備事項排成一個清單（依順序、再依期限），狀態依期限與完成自動判斷。
 */
import { addDays } from '@/core/holidays';
import { weekRange } from './dates';
import type { Entry, Task } from './model';

/** 自動判斷的狀態 */
export type TaskState = 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** 完成 → done；沒有期限 → none；期限已過 → overdue；今天 → today；3 天內 → soon；其他 → later */
export function taskState(task: Pick<Task, 'done' | 'due'>, today: string): TaskState {
  if (task.done) return 'done';
  if (!task.due) return 'none';
  if (task.due < today) return 'overdue';
  if (task.due === today) return 'today';
  if (task.due <= addDays(today, 3)) return 'soon';
  return 'later';
}

export interface TaskItem {
  task: Task;
  entry: Entry;
}

/** 所有準備事項（只有場次的），依順序、再依期限（沒有期限的在後） */
export function allTasks(entries: readonly Entry[]): TaskItem[] {
  const list: TaskItem[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'session') continue;
    for (const task of entry.tasks) list.push({ task, entry });
  }
  return list.sort(
    (a, b) =>
      a.task.order - b.task.order ||
      (a.task.due || '9999').localeCompare(b.task.due || '9999') ||
      a.task.title.localeCompare(b.task.title, 'zh-Hant'),
  );
}

/** 本週的準備事項：期限在這一週的，加上還沒完成而且已經過期的 */
export function weekTasks(entries: readonly Entry[], today: string, weekStart: 0 | 1): TaskItem[] {
  const [s, e] = weekRange(today, weekStart);
  return allTasks(entries).filter(
    ({ task }) => (task.due >= s && task.due <= e) || (!task.done && task.due && task.due < s),
  );
}

/** 下一個準備事項的順序（排在最後） */
export function nextTaskOrder(entries: readonly Entry[]): number {
  let max = 0;
  for (const e of entries) for (const t of e.tasks) max = Math.max(max, t.order);
  return Math.floor(max / 10) * 10 + 10;
}

/**
 * 把一個準備事項移到另一個的位置（清單裡往下移時放在它後面、往上移時放在它前面），之後所有準備事項的順序重新編成 10、20、30…。
 * 回傳 taskId → 新的順序。
 */
export function reorderTasks(
  entries: readonly Entry[],
  fromTaskId: string,
  toTaskId: string,
): Map<string, number> {
  const list = allTasks(entries).map((t) => t.task.id);
  const from = list.indexOf(fromTaskId);
  const to = list.indexOf(toTaskId);
  const out = new Map<string, number>();
  if (from < 0 || to < 0 || from === to) return out;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  list.forEach((id, i) => {
    out.set(id, (i + 1) * 10);
  });
  return out;
}
