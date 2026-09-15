import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* TRPG Toolkit 収録版の設定。
 * - base: './'  … GitHub Pages のサブパスで動かすため相対パス
 * - outDir      … 合輯が配信するのは tools/cutin/。emptyOutDir: false で
 *                 同じ場所に置いてある i18n.cutin.js と LICENSE を消さない
 * - 出力名を固定 … ハッシュ付きだとビルドのたびに差分とゴミが増えるため */
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name].js' } } },
  build: {
    outDir: '../../tools/cutin',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  // WSL2 から Windows のブラウザで開けるよう、既定で全インタフェースに待ち受ける
  server: { host: true, port: 5177, strictPort: true },
});
