/**
 * 編輯中的地圖的儲存（規格 1.15、3.2）：每次修改後約 2.5 秒自動儲存（含縮圖）、立即儲存（Ctrl＋S）、
 * 頁面隱藏時把未儲存的存起來；自動儲存關著時只標「未儲存」，離開頁面前由瀏覽器詢問。
 */
import type { MapEngine } from './engine/engine';
import type { MapMeta } from './model';
import { putMap } from './storage';
import { setEditor, useAutoSave, useMapPrefs } from './stores';

export const AUTOSAVE_DELAY_MS = 2500;

export class MapSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving: Promise<boolean> | null = null;
  private again = false;
  private disposed = false;
  private unsubs: (() => void)[] = [];

  constructor(
    public meta: MapMeta,
    private engine: MapEngine,
  ) {
    engine.onDirty = () => this.markDirty();
    this.unsubs.push(
      /* 跟著地圖儲存的設定改了也要存（復原不管這些，D10） */
      useMapPrefs.subscribe(() => this.markDirty()),
    );
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && this.dirty && useAutoSave.getState().enabled)
        void this.save();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!this.dirty) return;
      if (useAutoSave.getState().enabled) {
        void this.save();
        return;
      }
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    this.unsubs.push(() => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
    });
    setEditor({ saveStatus: 'saved' });
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    setEditor({ saveStatus: 'dirty' });
    if (!useAutoSave.getState().enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, AUTOSAVE_DELAY_MS);
  }

  /** 儲存（含縮圖）；儲存中再叫一次時等這次完成後再存一次 */
  async save(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) {
      this.again = true;
      return this.saving;
    }
    this.saving = this.doSave();
    try {
      return await this.saving;
    } finally {
      this.saving = null;
      if (this.again && !this.disposed) {
        this.again = false;
        void this.save();
      }
    }
  }

  private async doSave(): Promise<boolean> {
    this.dirty = false;
    if (!this.disposed) setEditor({ saveStatus: 'saving' });
    try {
      const data = this.engine.serialize();
      const thumb = this.engine.thumbnail();
      this.meta = {
        ...this.meta,
        updatedAt: new Date().toISOString(),
        thumbnail: thumb ?? this.meta.thumbnail,
      };
      await putMap(this.meta, data);
      if (!this.disposed) setEditor({ saveStatus: this.dirty ? 'dirty' : 'saved' });
      return true;
    } catch {
      this.dirty = true;
      if (!this.disposed) setEditor({ saveStatus: 'error' });
      return false;
    }
  }

  /** 名稱改了（編輯列的重新命名） */
  async rename(name: string): Promise<void> {
    this.meta = { ...this.meta, name };
    setEditor({ mapName: name });
    await this.save();
  }

  /** 離開編輯畫面前：未儲存的存起來（自動儲存開著時） */
  async flush(): Promise<void> {
    if (this.dirty && useAutoSave.getState().enabled) await this.save();
    else if (this.saving) await this.saving;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const u of this.unsubs) u();
    if (this.engine.onDirty) this.engine.onDirty = null;
  }
}
