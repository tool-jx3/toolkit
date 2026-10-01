/**
 * core/storage：工具設定的自動存檔（Zustand persist → localStorage）、復原／重做（zundo）、
 * IndexedDB 小工具、專案檔。
 *
 * ```ts
 * const useSettings = createToolStore('battlemap', { cols: 20, rows: 15 });
 * const cols = useSettings((s) => s.data.cols);
 * useSettings.getState().update((d) => { d.cols = 30; });
 * const { undo, redo, canUndo } = useUndoRedo(useSettings);
 * ```
 */
import { type Draft, produce } from 'immer';
import { type TemporalState, temporal } from 'zundo';
import { create, type StoreApi, type UseBoundStore, useStore } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export * from './idb';
export * from './project';

export interface ToolState<T> {
  data: T;
  /** 用 Immer 的寫法修改：update((d) => { d.fps = 30 }) */
  update: (recipe: (draft: Draft<T>) => void) => void;
  /** 淺層合併：set({ fps: 30 }) */
  patch: (partial: Partial<T>) => void;
  /** 整個換掉（開啟專案檔、套用範本） */
  replace: (data: T) => void;
  /** 回到初始值 */
  reset: () => void;
}

type Tracked<T> = { data: T };

export type ToolStore<T> = UseBoundStore<StoreApi<ToolState<T>>> & {
  temporal: StoreApi<TemporalState<Tracked<T>>>;
  /** localStorage 的鍵名 */
  storageKey: string;
  initial: T;
  /**
   * 開始一個「手勢」（例如拖滑桿、在文字欄打字）：之後的變更都不記錄，直到 endGesture() 才記成**一步**。
   * 已經在手勢中時呼叫沒有作用。
   */
  beginGesture: () => void;
  /** 結束手勢：有變更時記成一步復原（之後的下一個變更一定是新的一步） */
  endGesture: () => void;
  /** 目前是不是在手勢中 */
  inGesture: () => boolean;
};

export interface ToolStoreOptions<T> {
  /** 存檔格式版本；改變資料結構時加 1 並提供 migrate */
  version?: number;
  migrate?: (persisted: unknown, fromVersion: number) => T;
  /** 是否自動存到 localStorage（預設 true） */
  persist?: boolean;
  /** 復原步數上限（預設 100） */
  historyLimit?: number;
  /** 這段時間內的連續變更（例如拖曳滑桿）只算一步，毫秒（預設 400） */
  coalesceMs?: number;
  /** 自訂儲存位置（測試用） */
  storage?: StateStorage;
  /**
   * 只存一部分欄位（其餘欄位不寫進 localStorage，重新整理後回到初始值）：
   * `partialize: (d) => ({ aspect: d.aspect, range: d.range })`。復原／重做仍涵蓋全部欄位。
   */
  partialize?: (data: T) => Partial<T>;
  /** 寫入 localStorage 失敗（容量不足、被封鎖）時呼叫；不給也不會讓工具停擺（錯誤會被攔下） */
  onPersistError?: (error: unknown) => void;
}

/* ---------- 自動存檔狀態 ---------- */

const saveTimes = create<Record<string, number>>(() => ({}));

/** 某個工具最後一次自動存檔的時間（毫秒時間戳；還沒存過為 null） */
export function useSaveStatus(toolId: string): number | null {
  return saveTimes((s) => s[toolId] ?? null);
}

export function getSaveTime(toolId: string): number | null {
  return saveTimes.getState()[toolId] ?? null;
}

const saveErrors = create<Record<string, unknown>>(() => ({}));

/** 某個工具最近一次自動存檔是否失敗（失敗時回傳錯誤，之後成功會清掉） */
export function useSaveError(toolId: string): unknown {
  return saveErrors((s) => s[toolId] ?? null);
}

function trackingStorage(
  toolId: string,
  base: StateStorage,
  onError?: (error: unknown) => void,
): StateStorage {
  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      try {
        const r = base.setItem(name, value);
        saveTimes.setState({ [toolId]: Date.now() });
        if (saveErrors.getState()[toolId]) saveErrors.setState({ [toolId]: null });
        return r;
      } catch (error) {
        /* 容量不足或被封鎖：記下來（useSaveError）並通知，工具其餘功能照常 */
        saveErrors.setState({ [toolId]: error });
        onError?.(error);
      }
    },
    removeItem: (name) => base.removeItem(name),
  };
}

const memoryStorage = (): StateStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

function defaultStorage(): StateStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 隱私模式或被封鎖時改用記憶體 */
  }
  return memoryStorage();
}

/** 存檔的資料與初始值合併：新版加的欄位會有預設值（只合併第一層） */
function mergeData<T>(initial: T, persisted: unknown): T {
  if (
    persisted &&
    typeof persisted === 'object' &&
    !Array.isArray(persisted) &&
    initial &&
    typeof initial === 'object'
  ) {
    return { ...initial, ...(persisted as Partial<T>) };
  }
  return (persisted as T) ?? initial;
}

/**
 * 建立工具的設定 store：自動存檔（localStorage，鍵名 `trpg-toolkit:<id>`）＋復原／重做。
 * 只有 `data` 會被存檔與記錄歷史。
 */
export function createToolStore<T extends object>(
  toolId: string,
  initial: T,
  options: ToolStoreOptions<T> = {},
): ToolStore<T> {
  const { version = 1, migrate, historyLimit = 100, coalesceMs = 400 } = options;
  const storageKey = `trpg-toolkit:${toolId}`;
  /* 手勢中：記住手勢開始前的狀態，結束時才存成一步 */
  const gesture: { active: boolean; past: Tracked<T> | null } = { active: false, past: null };
  let last = 0;
  let saveStep: ((...args: unknown[]) => void) | null = null;

  const creator = temporal<ToolState<T>, [], [], Tracked<T>>(
    (set, get) => ({
      data: initial,
      update: (recipe) => set({ data: produce(get().data, recipe) }),
      patch: (partial) => set({ data: { ...get().data, ...partial } }),
      replace: (data) => set({ data }),
      reset: () => set({ data: initial }),
    }),
    {
      limit: historyLimit,
      partialize: (s) => ({ data: s.data }),
      equality: (a, b) => a.data === b.data,
      /* 連續變更合併成一步：距離上一次變更超過 coalesceMs 才記錄 */
      handleSet: (handleSet) => {
        /* zundo 實際傳進來的是 4 個參數的內部函式，型別宣告只寫了 setState 的 2 個 */
        const save = handleSet as unknown as (...args: unknown[]) => void;
        saveStep = save;
        return (pastState, replace, currentState, deltaState) => {
          if (gesture.active) {
            if (!gesture.past) gesture.past = pastState as unknown as Tracked<T>;
            return;
          }
          const now = Date.now();
          if (now - last > coalesceMs) save(pastState, replace, currentState, deltaState);
          last = now;
        };
      },
    },
  );

  const store =
    options.persist === false
      ? create<ToolState<T>>()(creator)
      : create<ToolState<T>>()(
          persist(creator, {
            name: storageKey,
            version,
            storage: createJSONStorage(() =>
              trackingStorage(toolId, options.storage ?? defaultStorage(), options.onPersistError),
            ),
            partialize: (s) => ({
              data: options.partialize ? (options.partialize(s.data) as T) : s.data,
            }),
            migrate: (persisted, from) => {
              const data = (persisted as Tracked<unknown> | undefined)?.data;
              return { data: migrate ? migrate(data, from) : mergeData(initial, data) } as never;
            },
            merge: (persisted, current) => ({
              ...current,
              data: mergeData(initial, (persisted as Tracked<unknown> | undefined)?.data),
            }),
          }),
        );

  const out = store as unknown as ToolStore<T>;
  out.storageKey = storageKey;
  out.initial = initial;
  out.beginGesture = () => {
    if (gesture.active) return;
    gesture.active = true;
    gesture.past = null;
  };
  out.endGesture = () => {
    if (!gesture.active) return;
    gesture.active = false;
    const past = gesture.past;
    gesture.past = null;
    const current = { data: out.getState().data };
    if (past && past.data !== current.data && out.temporal.getState().isTracking)
      saveStep?.(past, undefined, current, undefined);
    last = 0;
  };
  out.inGesture = () => gesture.active;
  return out;
}

/**
 * 滑桿、數字欄、文字欄的「放開才記一步復原」：
 * ```tsx
 * const g = historyGesture(useSettings);
 * <Slider value={s.size} onChange={g.live((v) => update((d) => { d.size = v; }))} onCommit={g.commit} />
 * <TextInput value={s.name} onFocus={g.begin} onChange={(e) => update(…)} onBlur={g.commit} />
 * ```
 * live(fn) 包住的變更會先開始手勢；commit（滑桿放開、數字欄確定、文字欄離開）結束手勢、記成一步。
 */
export function historyGesture<T>(store: ToolStore<T>) {
  return {
    begin: (): void => store.beginGesture(),
    /*
     * 延到這一輪事件處理完才結束手勢：Radix 滑桿用鍵盤操作時是「先 commit、再 change」，
     * 立刻結束的話，這一步的變更會被併進下一步。
     */
    commit: (): void => queueMicrotask(() => store.endGesture()),
    live:
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A): void => {
        store.beginGesture();
        fn(...args);
      },
  };
}

/** 回到初始值並清空復原紀錄（「全部重來」確認之後用） */
export function resetToolStore<T>(store: ToolStore<T>, { clearHistory = true } = {}): void {
  store.getState().reset();
  if (clearHistory) store.temporal.getState().clear();
}

/* ---------- 不列入復原的狀態（預覽設定、測試數值…） ---------- */

export interface SideState<T> {
  data: T;
  update: (recipe: (draft: Draft<T>) => void) => void;
  patch: (partial: Partial<T>) => void;
  replace: (data: T) => void;
  reset: () => void;
}

export type SideStore<T> = UseBoundStore<StoreApi<SideState<T>>> & {
  storageKey: string;
  initial: T;
};

export interface SideStoreOptions {
  /** 自動存檔（預設 true） */
  persist?: boolean;
  version?: number;
  storage?: StateStorage;
}

/**
 * 預覽相關的狀態（預覽背景、套用前、測試數值、預覽角色…）：會自動存檔，但**不列入復原**、
 * 也不會被設定的復原／重做改到。鍵名 `trpg-toolkit:<id>:preview`。與 createToolStore 分開，
 * 「全部重來」時兩個都要 reset。
 */
export function createPreviewStore<T extends object>(
  toolId: string,
  initial: T,
  options: SideStoreOptions = {},
): SideStore<T> {
  const storageKey = `trpg-toolkit:${toolId}:preview`;
  const creator = (set: StoreApi<SideState<T>>['setState'], get: () => SideState<T>) => ({
    data: initial,
    update: (recipe: (draft: Draft<T>) => void) => set({ data: produce(get().data, recipe) }),
    patch: (partial: Partial<T>) => set({ data: { ...get().data, ...partial } }),
    replace: (data: T) => set({ data }),
    reset: () => set({ data: initial }),
  });
  const store =
    options.persist === false
      ? create<SideState<T>>()(creator)
      : create<SideState<T>>()(
          persist(creator, {
            name: storageKey,
            version: options.version ?? 1,
            storage: createJSONStorage(() => options.storage ?? defaultStorage()),
            partialize: (s) => ({ data: s.data }),
            migrate: (persisted) =>
              ({
                data: mergeData(initial, (persisted as Tracked<unknown> | undefined)?.data),
              }) as never,
            merge: (persisted, current) => ({
              ...current,
              data: mergeData(initial, (persisted as Tracked<unknown> | undefined)?.data),
            }),
          }),
        );
  const out = store as unknown as SideStore<T>;
  out.storageKey = storageKey;
  out.initial = initial;
  return out;
}

/* ---------- 套用範本：換掉一部分、保留一部分 ---------- */

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

function cloneDeep<V>(v: V): V {
  if (Array.isArray(v)) return v.map(cloneDeep) as V;
  if (isPlain(v))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneDeep(x)])) as V;
  return v;
}

function mergeDeep(base: unknown, over: unknown): unknown {
  if (over === undefined) return cloneDeep(base);
  if (isPlain(base) && isPlain(over)) {
    const out: Plain = cloneDeep(base);
    for (const [k, v] of Object.entries(over)) out[k] = mergeDeep(base[k], v);
    return out;
  }
  return cloneDeep(over);
}

function copyPath(src: unknown, dst: Plain | unknown[], segs: string[]): void {
  const [head, ...rest] = segs;
  const s = src as Record<string | number, unknown> | null;
  if (!s || typeof s !== 'object') return;
  const keys: (string | number)[] =
    head === '*' ? (Array.isArray(s) ? s.map((_, i) => i) : Object.keys(s)) : [head];
  const d = dst as Record<string | number, unknown>;
  for (const k of keys) {
    if (!(k in s)) continue;
    if (!rest.length) {
      d[k] = cloneDeep(s[k]);
      continue;
    }
    /* 範本沒有這一項（例如陣列比較短）時整項保留目前的值 */
    if (d[k] === null || typeof d[k] !== 'object') {
      d[k] = cloneDeep(s[k]);
      continue;
    }
    copyPath(s[k], d[k] as Plain, rest);
  }
}

export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * 套用範本：範本有給的欄位換成範本的值（物件逐層合併、陣列整個換掉），再把 keep 列出的路徑還原成目前的值。
 * 路徑用「.」分隔，`*` 代表陣列的每一項或物件的每個鍵：
 * ```ts
 * applyTemplate(settings, template.data, {
 *   keep: ['barCount', 'hideExtra', 'bars.*.nameOverride', 'bars.*.critical', 'characters', 'roomUrl', 'fileName'],
 * });
 * ```
 * 回傳新的物件（不改動傳入的值）。
 */
export function applyTemplate<T>(
  current: T,
  template: DeepPartial<T>,
  { keep = [] }: { keep?: readonly string[] } = {},
): T {
  const next = mergeDeep(current, template) as T;
  for (const p of keep) {
    const segs = p.split('.').filter(Boolean);
    if (segs.length) copyPath(current, next as unknown as Plain, segs);
  }
  return next;
}

export interface UndoRedo {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 清空歷史（例如開啟專案檔後） */
  clear: () => void;
}

/** 在元件裡取得復原／重做 */
export function useUndoRedo<T>(store: ToolStore<T>): UndoRedo {
  const canUndo = useStore(store.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(store.temporal, (s) => s.futureStates.length > 0);
  const t = store.temporal.getState();
  return { undo: () => t.undo(), redo: () => t.redo(), canUndo, canRedo, clear: () => t.clear() };
}
