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

function trackingStorage(toolId: string, base: StateStorage): StateStorage {
  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      const r = base.setItem(name, value);
      saveTimes.setState({ [toolId]: Date.now() });
      return r;
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
        let last = 0;
        return (pastState, replace, currentState, deltaState) => {
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
              trackingStorage(toolId, options.storage ?? defaultStorage()),
            ),
            partialize: (s) => ({ data: s.data }),
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
  return out;
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
