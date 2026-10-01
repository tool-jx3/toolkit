import { createToolStore } from '@/core/storage';
import { DEMO_DEFAULTS, type DemoSettings } from './demo';

/** 示範動畫的設定：自動存檔＋復原／重做 */
export const useDemo = createToolStore<DemoSettings>('_gallery', DEMO_DEFAULTS, { version: 1 });
