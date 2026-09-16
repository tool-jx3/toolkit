import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /* 【TRPG Toolkit 収録時の変更点】
   * setup.ts が辞書（../../tools/character-editor/i18n.character-editor.js）を
   * ?raw で読むので、Vite の fs 制限にリポジトリのルートを足す。 */
  server: { fs: { allow: ["../.."] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
