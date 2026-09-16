/* 【TRPG Toolkit 収録時の追加】
 * Vite の `?raw` インポート（テストで辞書ファイルを文字列として読むのに使う）。
 * vite/client の型を tsconfig に足すと上流の設定から離れるので、
 * 使っている一形だけをここで宣言する。 */
declare module "*?raw" {
  const content: string;
  export default content;
}
