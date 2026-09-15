// Tailwind v4 から PostCSS プラグインは別パッケージ。
// ベンダープレフィックスは Tailwind 側が面倒を見るので autoprefixer は不要。
export default { plugins: { '@tailwindcss/postcss': {} } };
