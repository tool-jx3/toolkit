/**
 * 內建裝飾圖章的圖檔網址（Vite 打包到 assets/build/；小的檔案直接內嵌成 data URL）。清單在 decorCatalog.ts。
 */
import { DECORS, type DecorDef } from './decorCatalog';

const urls = import.meta.glob<string>('./decors/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** 內建裝飾 id → 圖檔網址 */
export function decorUrl(id: string): string | null {
  return urls[`./decors/${id}.svg`] ?? null;
}

export { DECORS, type DecorDef };
