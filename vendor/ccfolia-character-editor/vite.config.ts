import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* TRPG Toolkit 収録版の設定。
 * - base: "./"  … GitHub Pages のサブパスで動かすため相対パス
 *                 （上流は "/ccfoliaCharacterEditor/" 固定だった）
 * - outDir      … 合輯が配信するのは tools/character-editor/。emptyOutDir: false で
 *                 同じ場所に置いてある i18n.character-editor.js を消さない
 * - 出力名を固定 … ハッシュ付きだとビルドのたびに差分とゴミが増えるため */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../tools/character-editor",
    emptyOutDir: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  server: { host: "127.0.0.1", port: 5178, strictPort: true }
});
