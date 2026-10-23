/**
 * core/interactive（互動 HTML 的共用零件）與 core/share 的 shareTooLong：
 * 放進 <script> 的 JSON 跳脫、元件 id、<style> 的跳脫、獨立 HTML 外殼、檔名。
 */
import { describe, expect, it } from 'vitest';
import {
  interactiveFileName,
  scriptJson,
  standaloneDocument,
  styleText,
  widgetId,
} from '@/core/interactive';
import { encodeShareHash, shareHashLength, shareTooLong } from '@/core/share';

describe('scriptJson', () => {
  it('< 換成 \\u003c，字串裡的 </script> 不會提早結束', () => {
    const out = scriptJson({ t: '</script><b>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ t: '</script><b>' });
  });

  it('U+2028、U+2029 跳脫，讀回原樣', () => {
    const v = { t: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` };
    const out = scriptJson(v);
    expect(out).not.toMatch(new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`));
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(JSON.parse(out)).toEqual(v);
  });
});

describe('widgetId', () => {
  it('前綴＋8 個小寫英數字，每次不同', () => {
    const a = widgetId('cm');
    expect(a).toMatch(/^cm-[a-z0-9]{8}$/);
    expect(new Set(Array.from({ length: 50 }, () => widgetId('cm'))).size).toBeGreaterThan(40);
  });
});

describe('styleText', () => {
  it('</ 跳脫成 <\\/', () => {
    expect(styleText('a{content:"</style>"}')).toBe('a{content:"<\\/style>"}');
  });
});

describe('standaloneDocument', () => {
  it('最小的網頁外殼：繁中、viewport、標題跳脫、樣式與內容照放', () => {
    const html = standaloneDocument({
      title: 'A<B>&"',
      css: 'html{margin:0}',
      body: '<div>x</div>',
    });
    expect(html).toBe(`<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>A&lt;B&gt;&amp;&quot;</title>
<style>html{margin:0}</style>
</head>
<body>
<div>x</div>
</body>
</html>
`);
  });
});

describe('interactiveFileName', () => {
  it('沒有標題：<名稱>.html；有標題：<名稱>_<標題>.html（去頭尾空白、不能用的字元換成 _、最長 40 字）', () => {
    expect(interactiveFileName('調查熱點圖', '')).toBe('調查熱點圖.html');
    expect(interactiveFileName('調查熱點圖', '   ')).toBe('調查熱點圖.html');
    expect(interactiveFileName('調查熱點圖', ' 舊書房 ')).toBe('調查熱點圖_舊書房.html');
    expect(interactiveFileName('調查熱點圖', 'a/b:c')).toBe('調查熱點圖_a_b_c.html');
    const long = interactiveFileName('x', 'あ'.repeat(100));
    expect(Array.from(long.replace(/^x_/, '').replace(/\.html$/, '')).length).toBeLessThanOrEqual(
      40,
    );
  });
});

describe('shareTooLong', () => {
  it('# 後面的字數超過上限才算太長（含或不含 # 都一樣）', () => {
    const hash = encodeShareHash({ a: 'x'.repeat(2000) }, { version: 1, key: 'm' });
    const n = shareHashLength(hash);
    expect(n).toBe(hash.length - 1);
    expect(shareHashLength(hash.slice(1))).toBe(n);
    expect(shareTooLong(hash, n)).toBe(false);
    expect(shareTooLong(hash, n - 1)).toBe(true);
    expect(shareTooLong(hash.slice(1), n - 1)).toBe(true);
  });
});
