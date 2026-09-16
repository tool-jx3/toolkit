import "@testing-library/jest-dom/vitest";
import dictSource from "../../../../tools/character-editor/i18n.character-editor.js?raw";

/* 【TRPG Toolkit 収録時の追加】
 * 上流のテストは画面の日本語ラベルで要素を探す。収録版ではその日本語が
 * 辞書（tools/character-editor/i18n.character-editor.js）へ移ったので、
 * ここで辞書の ja を window.T に差し込む。テストは一行も書き換えずに通り、
 * おまけに「ja の訳文が上流の原文と一字一句同じか」を常時検証してくれる。
 *
 * 読み込みは Vite の ?raw と new Function で行う。node:fs / node:vm を使うと
 * `npm run build` の tsc に @types/node が要るようになり、上流の依存から離れる。 */
let messages: Record<string, string> = {};
new Function("I18N", dictSource)({
  register: (dictionaries: Record<string, Record<string, string>>) => {
    messages = dictionaries.ja;
  }
});

(globalThis as unknown as { T: (key: string, ...args: Array<string | number>) => string }).T = (key, ...args) => {
  const value = messages[key];
  if (value === undefined) return key;
  return args.length ? value.replace(/\{(\d+)\}/g, (match, index) => String(args[Number(index)] ?? match)) : value;
};
