// @vitest-environment jsdom
/**
 * discord-color：編輯區的 DOM ↔ 格式樹（規格 F08～F10、3.1）。套用格式要靠瀏覽器的 Selection.toString()，
 * 在 e2e（discord-color.spec.ts，含與原作頁面的對照）測。
 */
import { describe, expect, it } from 'vitest';
import { br, code, rgb, text } from '../../src/tools/discord-color/ansi';
import {
  canonicalHtml,
  formatOf,
  nodesFromClipboard,
  nodesFromHtml,
  nodesFromText,
  offsetOf,
  pointAt,
  readNodes,
  renderNodes,
  selectedNodes,
  textToDom,
  writeEditor,
} from '../../src/tools/discord-color/dom';

const box = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('格式樹 ↔ DOM', () => {
  const doc = [
    text('a b'),
    br(),
    code(1, [code(31, [text('x')])]),
    rgb('#5865F2', false, [rgb('#FFFFFF', true, [text('D')])]),
  ];

  it('寫出的結構和原作相同', () => {
    expect(canonicalHtml(document, doc)).toBe(
      'a b<br><span class="ansi-1"><span class="ansi-31">x</span></span>' +
        '<span class="ansi-rgb" data-hex="#5865F2" style="background-color: rgb(88, 101, 242);">' +
        '<span class="ansi-rgb" data-hex="#FFFFFF" data-fg="1" style="color: rgb(255, 255, 255);">D</span></span>',
    );
  });

  it('寫進去再讀回來一樣', () => {
    const el = document.createElement('div');
    writeEditor(el, doc);
    expect(readNodes(el)).toEqual(doc);
  });

  it('讀回：瀏覽器加的標記只留內容、區塊之間換行、註解略過、相鄰的文字合併', () => {
    expect(
      readNodes(
        box(
          '<!--StartFragment--><b>a</b><font color="red">b</font><span>c</span>' +
            '<div>d</div><div><br></div><div>e</div><span class="ansi-9">f</span><span class="ansi-5">g</span>' +
            '<span class="ansi-rgb" data-hex="oops">h</span><span data-hex="#000000">i</span><script>x</script>',
        ),
      ),
    ).toEqual([
      text('abc'),
      br(),
      text('d'),
      br(),
      br(),
      text('e'),
      br(),
      code(9, [text('f')]),
      text('ghi'),
    ]);
  });

  it('formatOf：只認本工具的格式', () => {
    expect(formatOf(box('<span class="ansi-31 x"></span>').firstElementChild!)).toEqual({
      type: 'code',
      code: 31,
    });
    expect(
      formatOf(box('<span class="ansi-rgb" data-hex="#abcdef"></span>').firstElementChild!),
    ).toEqual({ type: 'rgb', hex: '#ABCDEF', fg: false });
    expect(formatOf(box('<b class="ansi-1"></b>').firstElementChild!)).toBeNull();
  });

  it('純文字的換行：\\n、\\r\\n、\\r 都是一個 <br>，空的段落不留文字節點', () => {
    const nodes = textToDom(document, 'a\r\n\rb\n');
    expect(nodes.map((n) => n.nodeName)).toEqual(['#text', 'BR', 'BR', '#text', 'BR']);
    expect(nodesFromText('a\n\nb')).toEqual([text('a'), br(), br(), text('b')]);
  });

  it('貼上：HTML 裡有本工具的格式時用 HTML，否則用純文字', () => {
    expect(nodesFromClipboard('<span class="ansi-31">a</span>b', 'ab')).toEqual([
      code(31, [text('a')]),
      text('b'),
    ]);
    expect(nodesFromClipboard('<p>a</p>\n  <p>b</p>', 'a\nb')).toEqual([
      text('a'),
      br(),
      text('b'),
    ]);
    expect(nodesFromClipboard('', 'x')).toEqual([text('x')]);
  });

  it('貼上的 HTML：本工具的格式保留，其他只留文字', () => {
    expect(
      nodesFromHtml(
        '<meta charset="utf-8"><span style="color:red;font-family:x"><span class="ansi-31">紅</span>字</span>',
      ),
    ).toEqual([code(31, [text('紅')]), text('字')]);
  });
});

describe('位置', () => {
  it('字數 ↔ DOM 位置（換行算一個字）', () => {
    const el = document.createElement('div');
    writeEditor(el, [text('ab'), br(), code(31, [text('cd')]), text('e')]);
    const at = pointAt(el, 4);
    expect(at.node.nodeValue).toBe('cd');
    expect(at.offset).toBe(1);
    expect(offsetOf(el, at.node, at.offset)).toBe(4);
    /* 交界停在前一段的最後 */
    expect(pointAt(el, 2).node.nodeValue).toBe('ab');
    expect(offsetOf(el, el, el.childNodes.length)).toBe(6);
  });

  it('選取範圍的內容含包住它的格式（複製用）', () => {
    const el = document.createElement('div');
    writeEditor(el, [text('x'), code(1, [code(31, [text('abcd')])])]);
    const t = el.querySelector('.ansi-31')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 1);
    r.setEnd(t, 3);
    expect(selectedNodes(el, r)).toEqual([code(1, [code(31, [text('bc')])])]);
  });

  it('renderNodes 的文字不經過 HTML 解析', () => {
    const [n] = renderNodes(document, [text('<b>&amp;')]);
    expect(n.nodeValue).toBe('<b>&amp;');
  });
});
